# Sequence Flow: Booking and Payment Management (Report 4)

Các hình dưới đây được chia nhỏ cho khổ dọc. Mỗi hình kết thúc ở một trạng thái bàn giao rõ ràng và hình kế tiếp tiếp tục từ trạng thái đó. Đối chiếu ngày 2026-08-13 với booking/payment services, bank webhook/reconciliation và `03-payment-engine.md`.

## 1. Booking Request and Draft Reuse

```mermaid
sequenceDiagram
    autonumber
    actor C as Customer
    participant UI as Screen<br/>(CreateBookingPage)
    participant API as API<br/>(BookingController)
    participant BS as Service<br/>(booking.service.ts)
    participant DB as Database<br/>(PostgreSQL)
    C->>UI: Chọn chi nhánh, slot, mode, xe, F&B, gói
    UI->>API: POST /api/v1/bookings
    API->>API: Xác thực CUSTOMER + validate payload
    API->>BS: createBooking(customerId, payload)
    BS->>DB: Tìm booking PENDING trùng customer/cafe/slot
    alt Booking cũ còn hạn
        DB-->>BS: Existing PENDING booking
        BS-->>API: Trả lại booking cũ (idempotent)
        API-->>UI: 201 booking_id + payment_expires_at
    else Booking cũ hết hạn hoặc không tồn tại
        BS->>DB: Hủy booking PENDING đã hết hạn (nếu có)
        BS->>DB: Đọc cafe ACTIVE và cấu hình slot
        BS->>BS: Kiểm tra thời gian, số slot và play mode
        Note over BS,DB: Handoff: draft hợp lệ, chưa giữ tài nguyên
    end
```

## 2. Availability, Price Snapshot, and Pending Booking

```mermaid
sequenceDiagram
    autonumber
    participant API as API<br/>(BookingController)
    participant BS as Service<br/>(booking.service.ts)
    participant DB as Database<br/>(PostgreSQL)
    participant R as Cache<br/>(Redis)
    participant UI as Screen<br/>(CreateBookingPage)
    API->>BS: Tiếp tục createBooking()
    opt Có customer_package_id
        BS->>DB: Kiểm tra owner, cafe, hạn và slots_remaining
    end
    BS->>DB: Đọc track config, xe khả dụng và giá
    BS->>DB: Đọc menu/variant cho F&B preorder
    BS->>BS: Tính slot + rental + F&B - promotion
    Note over BS: Không cộng security deposit
    alt BYOC
        BS->>R: Giữ capacity theo cafe/slot
    else RENTAL hoặc MIXED
        BS->>R: SET NX lock cho từng vehicle/slot
    end
    alt Hết capacity hoặc lock thất bại
        BS->>R: Hoàn lock/counter đã giữ
        BS-->>API: 409 SLOT_LOCKED / capacity error
    else Khả dụng
        BS->>DB: TX: INSERT bookings PENDING
        BS->>DB: INSERT participants, vehicles, F&B preorder
        DB-->>BS: booking_id + payment_expires_at
        BS-->>API: Booking summary + breakdown
        API-->>UI: 201 PENDING
        Note over UI,DB: Handoff: PENDING đã giữ tài nguyên
    end
```

## 3. Checkout Snapshot and Payment Method Resolution

```mermaid
sequenceDiagram
    autonumber
    actor C as Customer
    participant UI as Screen<br/>(PaymentPage)
    participant API as API<br/>(BookingController)
    participant PE as Service<br/>(payment.service.ts)
    participant DB as Database<br/>(PostgreSQL)
    C->>UI: Nhấn Thanh toán
    UI->>API: POST /api/v1/bookings/:id/checkout
    API->>API: Kiểm tra ownership
    API->>PE: createCheckoutUrl(bookingId, ip, gateway?)
    PE->>DB: Lock/read booking PENDING
    alt payment_expires_at đã qua
        PE->>DB: Transition PAYMENT_TIMEOUT
        PE-->>API: PAYMENT_EXPIRED
        API-->>UI: 400 Payment expired
    else Còn hạn
        PE->>DB: Đọc vehicles, participants, F&B, promotion
        PE->>PE: Tính prepaid total từ dữ liệu đã chốt
        PE->>DB: UPDATE booking.snapshot
        PE->>DB: Resolve cafe_payment_settings đã verify
        alt Chi nhánh bật BANK_TRANSFER
            PE->>PE: Chọn BANK_TRANSFER
        else Mặc định
            PE->>PE: Chọn VNPAY
        end
        Note over PE,DB: Handoff: snapshot đóng băng + gateway đã chọn
    end
```

## 4. Payment Initiation: Direct, VNPay, or VietQR

```mermaid
sequenceDiagram
    autonumber
    participant PE as Service<br/>(payment.service.ts)
    participant DB as Database<br/>(PostgreSQL)
    participant GW as Third-party<br/>(VNPay / BankTransfer)
    participant UI as Screen<br/>(PaymentPage)
    actor C as Customer
    alt Tổng tiền = 0 và dùng customer package
        PE->>DB: INSERT payment_transaction DIRECT SUCCESS
        PE->>PE: Shared confirmation result
        PE-->>UI: confirmed=true, payment_url=null
    else Cần thanh toán
        PE->>DB: Tìm PENDING attempt còn hiệu lực
        alt Attempt cùng gateway còn hiệu lực
            DB-->>PE: Reuse payment_url / VietQR
        else Tạo attempt mới
            PE->>PE: Tạo txn_ref mới
            opt BANK_TRANSFER
                PE->>DB: Cấp payment_ref_code duy nhất
            end
            PE->>GW: createPaymentUrl(amount, txn_ref)
            GW-->>PE: payment_url + expiry
            PE->>DB: INSERT payment_transaction PENDING
        end
        PE-->>UI: URL/QR + txn_ref + total_amount
        UI-->>C: Mở VNPay hoặc hiển thị VietQR
        Note over C,DB: Handoff: payment attempt PENDING
    end
```

## 5. Shared Payment Confirmation and Booking Ledger

```mermaid
sequenceDiagram
    autonumber
    participant CB as Callback<br/>(VNPay / Bank Webhook)
    participant PE as Service<br/>(payment.service.ts)
    participant SM as StateMachine<br/>(booking.service.ts)
    participant DB as Database<br/>(PostgreSQL)
    participant N as Service<br/>(notification.service.ts)
    CB->>PE: processConfirmationResult(verified result)
    PE->>DB: Lock transaction by txn_ref
    alt Không tồn tại / signature hoặc amount sai
        PE-->>CB: Reject confirmation
    else Đã SUCCESS
        PE-->>CB: Idempotent already-confirmed
    else Booking không PENDING hoặc payment đến trễ
        PE->>DB: Mark NEEDS_REVIEW + reason
        PE-->>CB: Không tự xác nhận
    else Hợp lệ
        PE->>DB: Transaction → SUCCESS
        PE->>SM: transition(PAYMENT_CONFIRMED)
        SM->>DB: Booking PENDING → CONFIRMED
        PE->>DB: INSERT components HELD<br/>slot, rental, F&B, contest, discount khi có
        opt Dùng customer package
            PE->>DB: Trừ slots_remaining trong transaction
        end
        PE-->>N: Gửi xác nhận/hóa đơn (async)
        PE-->>CB: Confirmation success
        Note over SM,DB: Handoff: CONFIRMED + ledger đã tạo
    end
```

## 6. Bank Transfer Webhook and Reconciliation Review

```mermaid
sequenceDiagram
    autonumber
    participant Bank as Third-party<br/>(Bank Webhook)
    participant WH as Service<br/>(bank-webhook.service.ts)
    participant DB as Database<br/>(PostgreSQL)
    participant PE as Service<br/>(payment.service.ts)
    participant Ops as Screen<br/>(Provider Reconciliation)
    Bank->>WH: external_id, amount, content, signature
    WH->>WH: Verify signature + normalize payload
    WH->>DB: Upsert bank_transactions by external_id
    WH->>DB: Match payment_ref_code
    alt Đúng ref + amount + booking PENDING
        WH->>PE: processConfirmationResult(BANK_TRANSFER)
        PE-->>WH: Booking CONFIRMED
        WH->>DB: bank_transaction MATCHED
    else Thiếu ref, sai amount hoặc thanh toán trễ
        WH->>DB: NEEDS_REVIEW + reason
        WH-->>Ops: Push BANK_TRANSFER_NEEDS_REVIEW
        Ops->>DB: Xem bằng chứng đối soát
        Note over Ops,DB: Chưa tạo components khi chưa xác nhận hợp lệ
    end
    WH-->>Bank: 2xx idempotent acknowledgement
```
