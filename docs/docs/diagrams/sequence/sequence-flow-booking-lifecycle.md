# Sequence Flow: Booking Lifecycle

Mô tả toàn bộ vòng đời đặt lịch — từ lúc Customer tạo booking, qua thanh toán VNPay, đến khi hủy hoặc hoàn tất — dựa trên code thực tế tại `booking.service.ts`, `payment.service.ts`, `vnpay.service.ts`, `booking.controller.ts`, và `booking-timeout.job.ts`.

> See **Reference** at the bottom for related docs and legend.

---

## 0. Identifiers

| Field | Value | Notes |
|-------|-------|-------|
| Entity | `Booking` | Bảng `bookings` |
| Entity | `BookingVehicle` | Bảng `booking_vehicles` — snapshot giá thuê xe |
| Entity | `BookingParticipant` | Bảng `booking_participants` |
| Entity | `FnbOrder` / `FnbOrderItem` | Pre-order F&B khi đặt lịch |
| Entity | `PaymentTransaction` | Giao dịch VNPay / DIRECT / MOCK |
| Entity | `PaymentComponent` | Các thành phần phân bổ tiền (SLOT_FEE, RENTAL_FEE, SECURITY_DEPOSIT, FB_PREORDER) |
| Entity | `CustomerPackage` | Gói slot đã mua — trừ `slots_remaining` khi booking CONFIRMED |
| Endpoint | `POST /api/v1/bookings` | createBooking — CUSTOMER only |
| Endpoint | `POST /api/v1/bookings/:id/checkout` | Freeze snapshot + tạo VNPay URL |
| Endpoint | `GET /api/v1/payments/vnpay/ipn` | VNPay server gọi callback sau giao dịch |
| Endpoint | `GET /api/v1/payments/vnpay/return` | Redirect về sau khi khách thanh toán xong |
| Endpoint | `POST /api/v1/bookings/:id/cancel` | Hủy đặt lịch — CUSTOMER hoặc PROVIDER |
| Endpoint | `GET /api/v1/provider/cafes/:cafeId/bookings` | Danh sách lịch theo ngày — PROVIDER / STAFF |
| Event | `PAYMENT_CONFIRMED` | `PENDING → CONFIRMED` |
| Event | `PAYMENT_TIMEOUT` | `PENDING → CANCELLED` (cron hoặc khi tạo lại) |
| Event | `CUSTOMER_CANCEL` / `PROVIDER_CANCEL` | `CONFIRMED → CANCELLED` (qua `cancelBooking()`) |
| Event | `NO_SHOW` | `CONFIRMED → NO_SHOW` (cron sau 30 phút) |
| Event | `COMPLETE` | `CONFIRMED → COMPLETED` (inspection checkout flow) |
| Redis key | `slot:lock:vehicle:{vehicleId}:{ts}` | SET NX EX — lock xe RENTAL |
| Redis key | `slot:byoc:{cafeId}:{ts}` | INCRBY / DECRBY — đếm chỗ BYOC |

---

## 1. Create Booking

Customer gọi `POST /api/v1/bookings`. Service thực hiện toàn bộ validation, tính giá, lock Redis và persist DB trong một transaction.

```mermaid
sequenceDiagram
    autonumber
    participant U as Customer
    participant M as Screen<br/>(BookingPage)
    participant B as API<br/>(Express / BookingController)
    participant SM as StateMachine<br/>(booking.service)
    participant DB as PostgreSQL
    participant R as Redis

    U->>M: Chọn slot, xe, track config, F&B, (gói)
    M->>B: POST /api/v1/bookings<br/>{ cafe_id, play_mode, slot_start, slot_end,<br/>vehicle_ids, participants, fnb_items, customer_package_id? }
    B->>B: Validate JWT → userId (CUSTOMER role)
    B->>B: ZodParse CreateBookingSchema

    B->>DB: Check duplicate PENDING<br/>(same customer + cafe + slotStart)
    DB-->>B: existingBooking?

    alt Duplicate PENDING còn hạn (paymentExpiresAt > now)
        B-->>M: 201 { booking_id: existing.id, status: PENDING }
        Note over B: Idempotency — trả về booking cũ, không tạo mới
    else Duplicate PENDING đã hết hạn
        B->>SM: transition(existingId, PAYMENT_TIMEOUT)
        SM->>DB: UPDATE bookings SET status=CANCELLED
        SM->>R: DEL slot:lock:vehicle:* (nếu RENTAL)
        Note over B: Tiếp tục tạo booking mới
    end

    B->>DB: SELECT cafe WHERE id=cafe_id AND status=ACTIVE
    DB-->>B: cafe { slotDurationMinutes, slotFeeRate, byocCapacity }

    Note over B: Validate: slotRange % slotDuration = 0<br/>slotRange ≤ 8 × slotDurationMinutes<br/>slotStart > now

    opt customer_package_id có trong request
        B->>DB: SELECT customer_package WHERE id AND customerId AND cafeId
        DB-->>B: customerPackage { status, expiresAt, slotsRemaining, packageId }
        Note over B: Guards: ownerCheck, cafeMatch,<br/>status=ACTIVE, not expired,<br/>slotsRemaining ≥ slotsNeeded,<br/>applicablePlayModes check
    end

    Note over B: Tính giá:<br/>slotFee = slotFeeRate × slotCount × playerCount<br/>Nếu có package: slot_fee của booker = 0<br/>(companions vẫn tính bình thường)

    opt play_mode = RENTAL
        loop Mỗi vehicleId trong vehicle_ids
            B->>DB: SELECT vehicle + catalog WHERE id AND status=AVAILABLE
            DB-->>B: { hourlyRate, securityDeposit, damageMultiplier }
            Note over B: Accept unit ID hoặc catalog ID<br/>(catalog → auto-pick available unit)
        end
    end

    opt track_config_id có trong request
        B->>DB: SELECT CafeTrackConfig WHERE id AND cafeId AND isActive
        DB-->>B: trackConfig { trackTypeId, byocCapacity }
    end

    opt play_mode = BYOC
        B->>R: INCRBY slot:byoc:{cafeId}:{ts} playerCount<br/>EXPIRE key slotLockTtlSeconds
        R-->>B: next (counter sau khi tăng)
        alt next > capacity
            B->>R: DECRBY slot:byoc:{cafeId}:{ts} playerCount
            B-->>M: 400 { code: BYOC_CAPACITY_FULL }
        end
    end

    opt play_mode = RENTAL + trackConfig có
        Note over B: Validate vehicle ↔ track type compat<br/>(catalog.compatibleTrackTypes includes trackTypeId?)
    end

    opt fnb_items.length > 0
        loop Mỗi item
            B->>DB: SELECT menu_item WHERE id AND isAvailable=true
            DB-->>B: { price }
        end
    end

    Note over B: totalAmount = slotFee + rentalFee + deposit + fnbTotal<br/>paymentExpiresAt = now + paymentWindowMinutes

    opt play_mode = RENTAL
        loop Mỗi vehicle
            B->>R: SET slot:lock:vehicle:{vehicleId}:{ts} "pending" EX ttl NX
            R-->>B: OK / nil
            alt nil — xe đã bị lock
                B->>R: DEL tất cả locks đã acquire trước đó
                B-->>M: 409 { code: SLOT_LOCKED }
            end
        end
    end

    B->>DB: BEGIN TRANSACTION<br/>INSERT booking (status=PENDING, snapshot với package_used nếu có)<br/>INSERT booking_participant (BOOKER=customer)<br/>INSERT booking_participants (companions)<br/>INSERT booking_vehicles (snapshot giá per vehicle)<br/>INSERT fnb_order + fnb_order_items (nếu có F&B)
    DB-->>B: booking.id

    opt play_mode = RENTAL (cập nhật lock với bookingId thật)
        B->>R: SET slot:lock:vehicle:{vehicleId}:{ts} booking.id EX ttl
    end

    B-->>M: 201 { booking_id, status: PENDING,<br/>payment_expires_at, total_amount, breakdown }
    M->>U: Hiển thị tóm tắt đơn + nút "Thanh toán"
```

---

## 2. Checkout — Freeze Snapshot & VNPay

Customer nhấn "Thanh toán". Service tính lại tổng từ các child rows, đóng băng vào `booking.snapshot`, rồi tạo URL VNPay hoặc confirm inline nếu zero-total.

```mermaid
sequenceDiagram
    autonumber
    participant U as Customer
    participant M as Screen<br/>(PaymentPage)
    participant B as API<br/>(Express / BookingController)
    participant PE as PaymentEngine<br/>(payment.service)
    participant V as VNPay
    participant DB as PostgreSQL

    U->>M: Nhấn "Thanh toán"
    M->>B: POST /api/v1/bookings/:id/checkout
    B->>B: Ownership check (booking.customerId = userId)
    B->>PE: createCheckoutUrl(bookingId, ipAddr)

    PE->>DB: SELECT booking WHERE id AND status=PENDING
    DB-->>PE: booking
    PE->>PE: Check paymentExpiresAt > now
    alt paymentExpiresAt đã qua
        PE->>PE: transition(bookingId, PAYMENT_TIMEOUT)
        PE-->>B: throw AppError PAYMENT_EXPIRED
        B-->>M: 400 { code: PAYMENT_EXPIRED }
    end

    PE->>DB: SELECT booking_vehicles, fnb_orders (PRE_ORDER),<br/>cafe, booking_participants
    DB-->>PE: rows

    Note over PE: Tính lại tổng từ child rows:<br/>slotFee = slotFeeRate × slotCount × playerCount<br/>Nếu booking.customerPackageId != null → slotFee = 0<br/>totalCharged = slotFee + rentalFee + deposit + fnbTotal

    PE->>DB: UPDATE booking SET snapshot = {<br/>slot_fee_total, vehicles[], fnb_total,<br/>total_charged, captured_at, package_used? }
    DB-->>PE: ok

    alt totalCharged = 0 AND customerPackageId != null (Zero-Total Bypass — D3)
        Note over PE: Bỏ qua VNPay — confirm trực tiếp
        PE->>DB: INSERT payment_transaction { gateway=DIRECT, amount=0, status=SUCCESS }
        PE->>PE: transition(bookingId, PAYMENT_CONFIRMED)
        PE->>DB: UPDATE booking SET status=CONFIRMED
        PE->>DB: INSERT payment_components<br/>(SLOT_FEE=0, RENTAL_FEE, SECURITY_DEPOSIT, FB_PREORDER)<br/>Tất cả status = HELD
        PE->>DB: BEGIN TX<br/>UPDATE customer_package SET slots_remaining -= slots_used
        DB-->>PE: ok
        PE-->>B: { payment_url: null, confirmed: true,<br/>slots_used, slots_remaining_after }
        B-->>M: 201 { data: { confirmed: true } }
        M->>U: Hiển thị "Đặt lịch thành công!"

    else Mock mode (vnpay.mockEnabled = true, non-prod)
        PE->>PE: processMockConfirmation(txnRef)
        Note over PE: Confirm inline như IPN
        PE-->>B: { payment_url: /payment/result?status=success&mock=1 }
        B-->>M: 201 { data: { payment_url } }
        M->>U: Redirect tới payment result

    else Thanh toán thực qua VNPay
        PE->>DB: INSERT payment_transaction { gateway=VNPAY, status=PENDING, txnRef }
        Note over PE: txnRef = bookingId.replace(/-/g,'').substring(0,32)
        PE->>V: Tạo VNPay payment URL<br/>HMAC-SHA512(queryString, hashSecret)
        V-->>PE: signed redirect URL

        PE-->>B: { payment_url: "https://sandbox.vnpayment.vn/...", txn_ref, total_amount }
        B-->>M: 201 { data: { payment_url } }
        M->>U: Redirect browser → VNPay payment page
        U->>V: Chọn ngân hàng, nhập thông tin, xác nhận
    end
```

---

## 3. VNPay IPN Callback — Xác Nhận Thanh Toán

VNPay server gọi IPN endpoint sau khi giao dịch hoàn tất. Handler idempotent — an toàn khi gọi nhiều lần cho cùng một `txnRef`.

```mermaid
sequenceDiagram
    autonumber
    participant V as VNPay
    participant B as API<br/>(Express / vnpay.controller)
    participant PE as PaymentEngine<br/>(payment.service)
    participant SM as StateMachine<br/>(booking.service)
    participant DB as PostgreSQL
    participant N as Notify<br/>(emailService)

    V->>B: GET /api/v1/payments/vnpay/ipn<br/>?vnp_TxnRef=...&vnp_SecureHash=...&vnp_ResponseCode=00
    B->>PE: processConfirmation(vnpParams)

    PE->>PE: verifyVnpayParams — HMAC-SHA512<br/>timing-safe compare
    alt Chữ ký không hợp lệ (isValid = false)
        PE-->>B: { rspCode: "97" }
        B-->>V: { RspCode: "97", Message: "Invalid signature" }
    end

    PE->>DB: SELECT payment_transaction WHERE txnRef
    DB-->>PE: tx { id, status, bookingId, customerPackageId }

    alt tx không tồn tại
        PE-->>B: { rspCode: "01", message: "Order not found" }
        B-->>V: { RspCode: "01" }
    end

    alt tx.status = SUCCESS (idempotency guard)
        PE-->>B: { rspCode: "02", message: "Order already confirmed" }
        B-->>V: { RspCode: "02" }
        Note over B: VNPay nhận "02" = đã xử lý rồi, không retry
    end

    alt vnp_ResponseCode ≠ "00" (thanh toán thất bại / bị hủy)
        PE->>DB: UPDATE payment_transaction SET status=FAILED, rawResponse
        PE-->>B: { rspCode: responseCode }
        B-->>V: { RspCode: responseCode }
    end

    PE->>DB: UPDATE payment_transaction SET status=SUCCESS, rawResponse

    alt tx.customerPackageId != null (đây là giao dịch mua gói — không phải booking)
        PE->>DB: UPDATE customer_package SET status=ACTIVE, activatedAt=now
        PE-->>B: { rspCode: "00" }
        B-->>V: { RspCode: "00", Message: "Confirm Success" }

    else tx.bookingId != null (giao dịch booking)
        PE->>SM: transition(bookingId, PAYMENT_CONFIRMED)
        SM->>DB: SELECT booking → validate canTransition
        SM->>DB: UPDATE booking SET status=CONFIRMED
        DB-->>SM: ok
        SM-->>PE: booking (CONFIRMED)

        PE->>DB: SELECT booking_vehicles WHERE bookingId
        DB-->>PE: bookingVehicles[]

        PE->>DB: BEGIN TX<br/>INSERT payment_components:<br/>  SLOT_FEE → amount=snapshot.slot_fee_total, status=HELD<br/>  RENTAL_FEE (per vehicle) → status=HELD<br/>  SECURITY_DEPOSIT (per vehicle) → status=HELD<br/>  FB_PREORDER (nếu fnb_total > 0) → status=HELD
        DB-->>PE: ok

        opt snapshot.package_used != null (D4 — deduct sau khi CONFIRMED)
            PE->>DB: BEGIN TX<br/>UPDATE customer_package<br/>SET slots_remaining -= slots_used<br/>WHERE id = snapshot.package_used.customer_package_id
            DB-->>PE: ok
            PE->>DB: COMMIT
        end

        PE-->>N: sendBookingConfirmation(bookingId) [fire-and-forget]
        PE-->>N: sendBookingInvoice(bookingId) [fire-and-forget]
        Note over N: Lỗi email không block IPN response

        PE-->>B: { rspCode: "00", message: "Confirm Success" }
        B-->>V: { RspCode: "00", Message: "Confirm Success" }
    end

    V->>M: Redirect browser → GET /api/v1/payments/vnpay/return?vnp_TransactionStatus=00&...
    Note over M: Frontend đọc query params và hiển thị kết quả
```

---

## 4. Cancel Booking

Customer hoặc Provider hủy một booking đang ở trạng thái `CONFIRMED`. Lưu ý: `cancelBooking()` **update DB trực tiếp**, không đi qua `transition()`.

```mermaid
sequenceDiagram
    autonumber
    participant U as Customer / Provider
    participant M as Frontend
    participant B as API<br/>(Express / BookingController)
    participant BS as BookingService
    participant PE as PaymentEngine<br/>(payment.service)
    participant DB as PostgreSQL
    participant R as Redis

    U->>M: Nhấn "Hủy đặt lịch" (+ lý do optional)
    M->>B: POST /api/v1/bookings/:id/cancel { reason? }
    B->>B: authenticate + authorize(CUSTOMER | PROVIDER)
    B->>BS: cancelBooking(bookingId, userId, role, reason)

    BS->>DB: SELECT booking WHERE id
    DB-->>BS: booking { status, customerId, playMode, slotStart, snapshot }

    alt status ≠ CONFIRMED
        BS-->>B: throw 400 BOOKING_NOT_CONFIRMED
        B-->>M: 400 { code: BOOKING_NOT_CONFIRMED }
    end

    alt role = CUSTOMER AND customerId ≠ userId
        BS-->>B: throw 403 NOT_BOOKING_OWNER
        B-->>M: 403 { code: NOT_BOOKING_OWNER }
    end

    BS->>DB: UPDATE booking<br/>SET status=CANCELLED, cancelledBy, cancelledAt, cancellationReason
    DB-->>BS: ok

    BS->>DB: SELECT booking_vehicles WHERE bookingId
    DB-->>BS: vehicles[]
    BS->>R: DEL slot:lock:vehicle:{vehicleId}:{ts} (per vehicle)

    opt playMode = BYOC
        BS->>DB: COUNT booking_participants WHERE bookingId
        DB-->>BS: participantCount
        BS->>R: GET slot:byoc:{cafeId}:{ts} → current
        BS->>R: SET slot:byoc:{cafeId}:{ts} max(0, current-count) EX ttl
    end

    BS->>DB: UPDATE fnb_orders SET status=CANCELLED<br/>WHERE booking_id=$1 AND status IN ('PENDING','CONFIRMED')
    DB-->>BS: ok

    opt snapshot.package_used != null AND slotStart > now (D5)
        Note over BS: Hoàn slot nếu hủy trước giờ chạy
        BS->>DB: BEGIN TX<br/>UPDATE customer_package<br/>SET slots_remaining += slots_used
        DB-->>BS: ok
        BS->>DB: COMMIT
    end

    BS-->>B: { refund_amount: 0 }

    B->>PE: processRefund(bookingId, role)
    PE->>DB: SELECT booking + snapshot
    DB-->>PE: booking.snapshot { slot_fee_total, vehicles[], fnb_total }

    Note over PE: calculateRefundAmounts(snapshot, role, slotStart):<br/>CUSTOMER_CANCEL > 24h trước slot: hoàn 100% slot_fee + rental_fee<br/>CUSTOMER_CANCEL ≤ 24h trước slot: slot_fee không hoàn<br/>PROVIDER_CANCEL bất kỳ lúc: hoàn 100% tất cả

    PE->>DB: UPDATE payment_components<br/>SET status=REFUNDED, refundedAmount, refundedAt
    PE->>DB: INSERT payment_transaction<br/>{ type=REFUND, gateway=VNPAY, amount=totalRefund, status=SUCCESS }
    DB-->>PE: ok

    PE-->>B: { slotFeeRefund, rentalFeeRefund, depositRefund, fnbRefund, totalRefund }
    B-->>M: 200 { data: { bookingId, refund: breakdown } }
    M->>U: Hiển thị thông tin hoàn tiền
```

---

## 5. Cron: Payment Timeout & Auto No-Show

Job chạy mỗi phút (`* * * * *`), xử lý hai loại trường hợp tự động.

```mermaid
sequenceDiagram
    autonumber
    participant CJ as CronJob<br/>(booking-timeout.job)
    participant SM as StateMachine<br/>(booking.service)
    participant PE as PaymentEngine<br/>(payment.service)
    participant DB as PostgreSQL
    participant R as Redis

    loop Mỗi 1 phút

        CJ->>DB: SELECT id FROM bookings<br/>WHERE status='PENDING'<br/>AND payment_expires_at < NOW()<br/>AND deleted_at IS NULL
        DB-->>CJ: expired[] (bookings quá hạn thanh toán)

        loop Mỗi booking trong expired[]
            CJ->>SM: transition(bookingId, 'PAYMENT_TIMEOUT')
            SM->>DB: SELECT booking → canTransition check
            SM->>DB: UPDATE booking SET status=CANCELLED
            SM->>DB: SELECT booking_vehicles
            SM->>R: DEL slot:lock:vehicle:* (RENTAL locks)
            opt playMode = BYOC
                SM->>DB: COUNT booking_participants
                SM->>R: DECRBY slot:byoc:{cafeId}:{ts} count
            end
            SM->>DB: UPDATE fnb_orders SET status=CANCELLED<br/>WHERE status IN ('PENDING','CONFIRMED')
        end

        CJ->>DB: SELECT id FROM bookings<br/>WHERE status='CONFIRMED'<br/>AND slot_start + INTERVAL '30 minutes' < NOW()<br/>AND updated_at <= slot_start<br/>AND deleted_at IS NULL
        DB-->>CJ: noShows[] (30 phút sau giờ chạy mà chưa có hoạt động)

        loop Mỗi booking trong noShows[]
            CJ->>SM: transition(bookingId, 'NO_SHOW')
            SM->>DB: UPDATE booking SET status=NO_SHOW
            SM->>DB: UPDATE fnb_orders SET status=CANCELLED<br/>WHERE status IN ('PENDING','CONFIRMED')

            CJ->>PE: processRefund(bookingId, UserRole.PROVIDER, isNoShow=true)
            PE->>DB: SELECT booking + snapshot
            Note over PE: NO_SHOW refund rules:<br/>slot_fee → không hoàn<br/>deposit → hoàn (xe không bàn giao)
            PE->>DB: UPDATE payment_components REFUNDED
            PE->>DB: INSERT payment_transaction REFUND
        end

    end
```

---

## 6. Decision Logic Summary

| Trạng thái / Điều kiện | Hành động |
|------------------------|-----------|
| Booking `PENDING` + `paymentExpiresAt` chưa qua | Checkout được — tạo VNPay URL |
| Booking `PENDING` + `paymentExpiresAt` đã qua | Ném `PAYMENT_EXPIRED`; cron sẽ cancel |
| Duplicate `PENDING` còn hạn | Trả về booking cũ — idempotency |
| Duplicate `PENDING` hết hạn | Auto-expire rồi tạo booking mới |
| `totalCharged = 0` + `customerPackageId != null` | Zero-total bypass: confirm inline, không qua VNPay |
| `vnpay.mockEnabled = true` (non-prod) | Mock confirmation inline khi gọi `/checkout` |
| VNPay IPN `vnp_ResponseCode = "00"` | Transition `PAYMENT_CONFIRMED` → tạo PaymentComponents |
| VNPay IPN gọi lại lần 2 (idempotent) | Trả `rspCode: "02"` — không xử lý lại |
| `tx.customerPackageId != null` trong IPN | Kích hoạt gói — không transition booking |
| Booking `CONFIRMED` + `snapshot.package_used` | Trừ `slots_remaining` khi IPN confirm (D4) |
| Cancel + `slotStart > now` + `package_used` | Hoàn `slots_remaining` (D5) |
| Cancel + `slotStart <= now` + `package_used` | Không hoàn slot |
| `CUSTOMER_CANCEL` > 24h trước slot | Hoàn 100% slot_fee + rental_fee |
| `CUSTOMER_CANCEL` ≤ 24h trước slot | slot_fee không hoàn |
| `PROVIDER_CANCEL` bất kỳ lúc | Hoàn 100% tất cả |
| `NO_SHOW` (cron, 30 phút sau giờ chạy) | Không hoàn slot_fee; hoàn deposit |
| Chỉ `CONFIRMED` mới hủy được | `cancelBooking()` throw 400 nếu status khác |

---

## 7. Key Files

### Backend (`rcfeild-be`)

| Area | Path | Note |
|------|------|-------|
| Controller | `src/controllers/booking.controller.ts` | CRUD + checkout + cancel + listCafe |
| Controller | `src/controllers/vnpay.controller.ts` | IPN + return + create-url |
| Service | `src/services/booking.service.ts` | createBooking, transition, cancelBooking, listCafeBookings |
| Service | `src/services/payment.service.ts` | createCheckoutUrl, processConfirmation, createPaymentComponents, processRefund |
| Service | `src/services/vnpay.service.ts` | createPaymentUrl, verifyVnpayParams |
| Cron | `src/jobs/booking-timeout.job.ts` | PAYMENT_TIMEOUT mỗi phút + NO_SHOW sau 30 phút |
| Routes | `src/routes/booking.routes.ts` | POST / GET /bookings |
| Routes | `src/routes/vnpay.routes.ts` | /payments/vnpay/ipn, /return, /create-url |
| Routes | `src/routes/index.ts` | `GET /provider/cafes/:cafeId/bookings` |
| Entity | `src/models/booking.entity.ts` | Bảng `bookings` |
| Entity | `src/models/booking-vehicle.entity.ts` | Snapshot giá thuê xe |
| Entity | `src/models/payment-transaction.entity.ts` | Giao dịch VNPay / DIRECT / MOCK |
| Entity | `src/models/payment-component.entity.ts` | Các thành phần phân bổ tiền |
| Entity | `src/models/customer-package.entity.ts` | Gói slot của customer |
| Validate | `src/validate/index.ts` | CreateBookingSchema, CancelBookingSchema |

### Frontend (`rcfield-fe`)

| Area | Path | Note |
|------|------|-------|
| API | `src/features/staff/api/staff.api.ts` | getTodayBookings, getFnbOrders |
| Page | `src/pages/staff/StaffDashboardPage.tsx` | Stat cards dùng real API |
| Page | `src/pages/staff/StaffTodayBookingsPage.tsx` | Danh sách lịch + countdown |

---

## 8. Open Questions

1. **VNPay Return Handler**: `handleVnpayReturn` ở `vnpay.controller.ts` — xác nhận nó redirect về frontend hay chỉ response JSON? Cần review để biết flow sau khi khách hoàn tất trên VNPay UI.

2. **COMPLETE transition**: Event `COMPLETE` (`CONFIRMED → COMPLETED`) không có trong booking controller hay cron job — ai trigger? Cần xác nhận đây là inspection checkout flow (session check-out) hay có endpoint riêng chưa implement.

3. **Refund thực tế**: `processRefund` đánh dấu component là `REFUNDED` và ghi `PaymentTransaction` nhưng không gọi VNPay Refund API — khi nào thực sự hoàn tiền về tài khoản ngân hàng? Cần bổ sung VNPay Refund API call.

---

## 9. Application Flow Overview

```mermaid
flowchart LR
    subgraph Customer["Customer (Frontend)"]
        direction TB
        C1["Tạo booking\nPOST /bookings"]
        C2["Checkout\nPOST /bookings/:id/checkout"]
        C3["Thanh toán\nVNPay UI"]
        C4["Xem kết quả\n/payment/result"]
        C5["Hủy\nPOST /bookings/:id/cancel"]
        C1 --> C2 --> C3 --> C4
    end

    subgraph Backend["API (Express + TypeScript)"]
        direction TB
        B1["createBooking()\nValidate + Redis Lock + DB TX"]
        B2["createCheckoutUrl()\nFreeze snapshot"]
        B3a["Zero-total bypass\nConfirm inline"]
        B3b["VNPay redirect URL"]
        B4["handleVnpayIpn()\nVerify + Confirm"]
        B5["cancelBooking()\nRelease locks + Refund"]
        B6["CronJob\nTimeout / No-Show"]
    end

    subgraph DB["PostgreSQL"]
        direction TB
        D1["bookings PENDING"]
        D2["bookings CONFIRMED"]
        D3["bookings CANCELLED / NO_SHOW"]
        D4["payment_components HELD"]
    end

    C1 --> B1 --> D1
    C2 --> B2
    B2 --> B3a --> D2
    B2 --> B3b --> C3 --> B4 --> D2
    B4 --> D4
    C5 --> B5 --> D3
    B6 --> D3

    classDef happy fill:#e6f4ea,stroke:#1e8449,color:#0d3d1f
    classDef error fill:#fde2e2,stroke:#c0392b,color:#7a1f1f
    classDef wait fill:#fff4d6,stroke:#b8860b,color:#5c3c00

    class D2,D4 happy
    class D3 error
    class D1 wait
```

---

## 10. Class Diagram: Booking Lifecycle

```mermaid
classDiagram
    class CafeDetailPage {
        +openBooking()
        +selectSlot()
    }
    class CreateBookingPage {
        +submitBooking()
        +goToCheckout()
    }
    class PaymentResultPage {
        +readVnpayReturn()
        +showStatus()
    }
    class CustomerBookingsPage {
        +cancelBooking()
        +viewDetail()
    }
    class BookingController {
        +create()
        +checkout()
        +cancel()
        +listMine()
    }
    class VnpayController {
        +createPaymentUrl()
        +handleIpn()
        +handleReturn()
    }
    class BookingService {
        +createBooking()
        +transition()
        +cancelBooking()
        +handleTimeouts()
    }
    class PaymentService {
        +freezeSnapshot()
        +createCheckout()
        +confirmPayment()
        +refund()
    }
    class VnpayService {
        +buildPaymentUrl()
        +verifySecureHash()
    }
    class Booking
    class BookingParticipant
    class BookingVehicle
    class FnbOrder
    class PaymentTransaction
    class PaymentComponent
    class CustomerPackage
    class Cafe

    CafeDetailPage --> CreateBookingPage
    CreateBookingPage --> BookingController
    PaymentResultPage --> VnpayController
    CustomerBookingsPage --> BookingController
    BookingController --> BookingService
    BookingController --> PaymentService
    VnpayController --> VnpayService
    VnpayController --> PaymentService
    Booking "1" --> "*" BookingParticipant
    Booking "1" --> "*" BookingVehicle
    Booking "1" --> "*" FnbOrder
    Booking "1" --> "*" PaymentComponent
    PaymentTransaction "*" --> "1" Booking
    CustomerPackage "0..1" --> "*" Booking
    Cafe "1" --> "*" Booking
```

---

## Reference

### Related docs
- `docs/spec/00-overview.md` — Actors, booking channels, roles
- `docs/spec/01-domain-model.md` — Booking, Vehicle, PaymentComponent entities
- `docs/spec/02-state-machine.md` — PENDING → CONFIRMED → COMPLETED / CANCELLED / NO_SHOW
- `docs/spec/03-payment-engine.md` — Refund rules R1/R2/R3, payment component lifecycle
- `specs/009-customer-package-booking/research.md` — D3 (zero-total bypass), D4 (slot deduction timing), D5 (slot refund condition)
- `docs/diagrams/sequence/sequence-flow-redis-usage.md` — Chi tiết Redis key patterns

### Legend
- **StateMachine (SM)** = `booking.service.transition()` — mọi trạng thái tự động đi qua đây; ngoại lệ: `cancelBooking()` update DB trực tiếp
- **PaymentEngine (PE)** = `payment.service` — checkout URL, IPN confirm, refund
- `-->>` = response / async return
- `->>` = request / call
- `opt` = optional step
- `alt/else` = nhánh điều kiện
- `loop` = lặp qua danh sách
- `[IMPLEMENTED]` — tất cả endpoints đã được implement

---

*Last updated: 2026-06-16 · Based on: `booking.service.ts`, `payment.service.ts`, `vnpay.service.ts`, `booking.controller.ts`, `booking.routes.ts`, `vnpay.routes.ts`, `booking-timeout.job.ts`, `routes/index.ts`*
