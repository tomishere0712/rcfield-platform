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
    C->>UI: Select branch, slot, play mode, vehicles, F&B, and package
    UI->>API: POST /api/v1/bookings
    API->>API: Authenticate CUSTOMER and validate payload
    API->>BS: createBooking(customerId, payload)
    BS->>DB: Find duplicate PENDING booking by customer/cafe/slot
    alt Existing booking is still valid
        DB-->>BS: Existing PENDING booking
        BS-->>API: Return existing booking (idempotent)
        API-->>UI: 201 booking_id + payment_expires_at
    else Existing booking expired or not found
        BS->>DB: Cancel expired PENDING booking when present
        BS->>DB: Load ACTIVE cafe and slot configuration
        BS->>BS: Validate timing, slot count, and play mode
        
    end
```

## 2. Availability, Price Snapshot, and Pending Booking

```mermaid
sequenceDiagram
    autonumber
    actor C as Customer
    participant UI as Screen<br/>(CreateBookingPage)
    participant API as API<br/>(BookingController)
    participant BS as Service<br/>(booking.service.ts)
    participant DB as Database<br/>(PostgreSQL)
    participant R as Cache<br/>(Redis)
    C->>UI: Confirm booking configuration and continue
    UI->>API: Continue POST /api/v1/bookings
    API->>BS: Continue createBooking()
    opt customer_package_id is provided
        BS->>DB: Validate owner, cafe, expiry, and slots_remaining
    end
    BS->>DB: Load track config, available vehicles, and pricing
    BS->>DB: Load menu and variants for F&B preorder
    BS->>BS: Calculate slot + rental + F&B - promotion (deposit excluded)
    
    alt BYOC
        BS->>R: Reserve capacity by cafe/slot
    else RENTAL or MIXED
        BS->>R: SET NX lock for each vehicle/slot
    end
    alt Capacity exhausted or lock failed
        BS->>R: Release acquired locks/counter
        BS-->>API: 409 SLOT_LOCKED / capacity error
    else Resources available
        BS->>DB: TX: INSERT bookings PENDING
        BS->>DB: INSERT participants, vehicles, F&B preorder
        DB-->>BS: booking_id + payment_expires_at
        BS-->>API: Booking summary + breakdown
        API-->>UI: 201 PENDING
        UI-->>C: Display PENDING booking and payment deadline
        
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
    C->>UI: Click Pay
    UI->>API: POST /api/v1/bookings/:id/checkout
    API->>API: Validate ownership
    API->>PE: createCheckoutUrl(bookingId, ip, gateway?)
    PE->>DB: Lock/read booking PENDING
    alt payment_expires_at has passed
        PE->>DB: Transition PAYMENT_TIMEOUT
        PE-->>API: PAYMENT_EXPIRED
        API-->>UI: 400 Payment expired
    else Payment window is valid
        PE->>DB: Load vehicles, participants, F&B, and promotion
        PE->>PE: Calculate prepaid total from frozen data
        PE->>DB: UPDATE booking.snapshot
        PE->>DB: Resolve verified cafe_payment_settings
        alt Branch enables BANK_TRANSFER
            PE->>PE: Select BANK_TRANSFER
        else Default gateway
            PE->>PE: Select VNPAY
        end
        
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
    alt Total is zero with customer package
        PE->>DB: INSERT payment_transaction DIRECT SUCCESS
        PE->>PE: Shared confirmation result
        PE-->>UI: confirmed=true, payment_url=null
    else Payment is required
        PE->>DB: Find valid PENDING attempt
        alt Same-gateway attempt is still valid
            DB-->>PE: Reuse payment_url / VietQR
        else Create a new attempt
            PE->>PE: Generate new txn_ref
            opt BANK_TRANSFER
                PE->>DB: Allocate unique payment_ref_code
            end
            PE->>GW: createPaymentUrl(amount, txn_ref)
            GW-->>PE: payment_url + expiry
            PE->>DB: INSERT payment_transaction PENDING
        end
        PE-->>UI: URL/QR + txn_ref + total_amount
        UI-->>C: Open VNPay or display VietQR
    end
```

## 5. Shared Payment Confirmation and Booking Ledger

```mermaid
sequenceDiagram
    autonumber
    actor CB as Payment Gateway<br/>(VNPay / Bank Webhook)
    participant PE as Service<br/>(payment.service.ts)
    participant SM as StateMachine<br/>(booking.service.ts)
    participant DB as Database<br/>(PostgreSQL)
    participant N as Service<br/>(notification.service.ts)
    CB->>PE: processConfirmationResult(verified result)
    PE->>DB: Lock transaction by txn_ref
    alt Missing / invalid signature or amount
        PE-->>CB: Reject confirmation
    else Already SUCCESS
        PE-->>CB: Idempotent already-confirmed
    else Booking is not PENDING or payment is late
        PE->>DB: Mark NEEDS_REVIEW + reason
        PE-->>CB: Do not auto-confirm
    else Valid confirmation
        PE->>DB: Transaction → SUCCESS
        PE->>SM: transition(PAYMENT_CONFIRMED)
        SM->>DB: Booking PENDING → CONFIRMED
        PE->>DB: INSERT HELD components<br/>slot, rental, F&B, contest, and discount when applicable
        opt Customer package is used
            PE->>DB: Decrement slots_remaining in transaction
        end
        PE-->>N: Send confirmation/invoice asynchronously
        PE-->>CB: Confirmation success
        
    end
```

## 6. Bank Transfer Webhook and Reconciliation Review

```mermaid
sequenceDiagram
    autonumber
    actor Bank as Third-party<br/>(Bank Webhook)
    participant WH as Service<br/>(bank-webhook.service.ts)
    participant DB as Database<br/>(PostgreSQL)
    participant PE as Service<br/>(payment.service.ts)
    actor P as Provider / Assigned Staff
    participant Ops as Screen<br/>(Provider Reconciliation)
    Bank->>WH: external_id, amount, content, signature
    WH->>WH: Verify signature + normalize payload
    WH->>DB: Upsert bank_transactions by external_id
    WH->>DB: Match payment_ref_code
    alt Reference and amount match a PENDING booking
        WH->>PE: processConfirmationResult(BANK_TRANSFER)
        PE-->>WH: Booking CONFIRMED
        WH->>DB: bank_transaction MATCHED
    else Missing reference, wrong amount, or late payment
        WH->>DB: NEEDS_REVIEW + reason
        WH-->>Ops: Push BANK_TRANSFER_NEEDS_REVIEW
        P->>Ops: Open reconciliation alert for review
        Ops->>DB: Load reconciliation evidence
        Ops-->>P: Display reference, amount, and reason
        
    end
    WH-->>Bank: 2xx idempotent acknowledgement
```
