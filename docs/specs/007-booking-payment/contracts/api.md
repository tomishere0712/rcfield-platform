# API Contracts: Booking & Payment Flow

**Feature**: 007-booking-payment | **Date**: 2026-06-08  
**Base path**: `/api/v1`  
**Auth header**: `Authorization: Bearer <jwt_token>`

---

## 1. Check Slot Availability

**GET** `/cafes/:cafeId/availability`  
**Auth**: Optional  
**Role**: Public

**Query params**:
```
slot_start: ISO datetime (required)
slot_end:   ISO datetime (required)
play_mode:  RENTAL | BYOC | MIXED (required)
```

**Response 200**:
```json
{
  "available": true,
  "byoc_remaining": 3,
  "vehicles": [
    {
      "vehicle_id": "uuid",
      "catalog_name": "Tamiya TT-02",
      "status": "AVAILABLE",
      "rental_fee": 100000,
      "security_deposit": 500000,
      "damage_multiplier": 1.5,
      "cover_image_url": "https://..."
    }
  ]
}
```

**Response 200 (BYOC, capacity full)**:
```json
{ "available": false, "byoc_remaining": 0, "vehicles": [] }
```

**Errors**: 404 cafe not found or not ACTIVE, 400 invalid slot range

---

## 2. Create Booking

**POST** `/bookings`  
**Auth**: Required  
**Role**: CUSTOMER

**Request body**:
```json
{
  "cafe_id": "uuid",
  "play_mode": "RENTAL",
  "slot_start": "2026-06-15T09:00:00+07:00",
  "slot_end": "2026-06-15T11:00:00+07:00",
  "vehicle_ids": ["uuid"],
  "participants": [
    {
      "participant_type": "WALK_IN_GUEST",
      "guest_name": "Nguyễn Văn A",
      "guest_phone": "0901234567"
    }
  ],
  "fnb_items": [
    { "menu_item_id": "uuid", "quantity": 2, "notes": "" }
  ],
  "promotion_code": "SUMMER10"
}
```

**Rules**:
- `vehicle_ids` required for RENTAL and MIXED; must be empty for BYOC
- `participants` array required; must include exactly 1 primary responsible (the CUSTOMER is auto-added as BOOKER + is_primary_responsible)
- `fnb_items` optional — empty array allowed
- `promotion_code` optional — silently ignored if promotion engine not active (Phase 1 assumption)
- Slot lock acquired atomically on success

**Response 201**:
```json
{
  "booking_id": "uuid",
  "status": "PENDING",
  "payment_expires_at": "2026-06-15T08:30:00+07:00",
  "total_amount": 850000,
  "breakdown": {
    "slot_fee": 300000,
    "rental_fee": 200000,
    "security_deposit": 500000,
    "fnb_total": 50000,
    "discount": 0,
    "total": 1050000
  }
}
```

**Errors**:
- 400 `INVALID_SLOT` — slot_start >= slot_end or not aligned to cafe slot_duration
- 400 `VEHICLE_UNAVAILABLE` — vehicle already booked in this slot
- 400 `BYOC_CAPACITY_FULL` — cafe BYOC capacity exceeded for this slot
- 400 `CAFE_CLOSED` — slot outside operating hours
- 409 `SLOT_LOCKED` — concurrent checkout in progress for same vehicle+slot
- 404 `CAFE_NOT_FOUND` — cafe not ACTIVE

---

## 3. Create Payment URL (Checkout)

**POST** `/bookings/:id/checkout`  
**Auth**: Required  
**Role**: CUSTOMER (must be booking owner)

**Request body**: empty `{}`

**Rules**:
- Booking must be PENDING
- Re-entrant: if PaymentTransaction already exists and is PENDING, return existing VNPay URL (do not create duplicate)

**Response 200**:
```json
{
  "payment_url": "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?...",
  "txn_ref": "uuid-no-dashes",
  "expires_at": "2026-06-15T08:30:00+07:00"
}
```

**Errors**:
- 400 `BOOKING_NOT_PENDING` — booking already paid or cancelled
- 403 `NOT_BOOKING_OWNER`

---

## 4. VNPay Return URL (Update existing endpoint)

**GET** `/payments/vnpay/return`  
**Auth**: None (VNPay redirect)

**Query params**: VNPay standard params (`vnp_TxnRef`, `vnp_ResponseCode`, `vnp_SecureHash`, ...)

**Behavior**:
1. Verify HMAC-SHA512 signature
2. Find PaymentTransaction by `vnp_TxnRef`
3. If `vnp_ResponseCode == "00"` (success): confirm booking → CONFIRMED, create PaymentComponents HELD
4. Redirect to frontend: `/payment/result?status=success&bookingId=...` or `?status=failed&...`

**Note**: This endpoint is already implemented (`handleVnpayReturn`) — update to call `BookingPaymentService.processConfirmation()`.

---

## 5. VNPay IPN (Update existing endpoint)

**GET** `/payments/vnpay/ipn`  
**Auth**: None (VNPay server-to-server)

**Query params**: Same as return URL

**Behavior**: Same as return URL but responds with VNPay IPN JSON instead of redirect. Idempotent — if booking already CONFIRMED, returns `{ "RspCode": "00", "Message": "Confirm Success" }`.

**Required VNPay response format**:
```json
{ "RspCode": "00", "Message": "Confirm Success" }
```

Error codes: `"01"` order not found, `"04"` amount mismatch, `"97"` invalid signature, `"99"` unknown error.

**Note**: This endpoint is already implemented (`handleVnpayIpn`) — update to call `BookingPaymentService.processConfirmation()`.

---

## 6. Get Booking Detail

**GET** `/bookings/:id`  
**Auth**: Required  
**Role**: CUSTOMER (own booking), PROVIDER/STAFF (own cafe), ADMIN

**Response 200**:
```json
{
  "id": "uuid",
  "cafe": { "id": "uuid", "name": "RC Cafe Hà Nội", "address": "..." },
  "play_mode": "RENTAL",
  "status": "CONFIRMED",
  "slot_start": "2026-06-15T09:00:00+07:00",
  "slot_end": "2026-06-15T11:00:00+07:00",
  "payment_expires_at": "2026-06-15T08:30:00+07:00",
  "participants": [
    { "participant_type": "BOOKER", "is_primary_responsible": true, "user_id": "uuid", "full_name": "..." }
  ],
  "vehicles": [
    { "vehicle_id": "uuid", "catalog_name": "...", "rental_fee_snapshot": 200000, "security_deposit_snapshot": 500000 }
  ],
  "fnb_order": {
    "id": "uuid",
    "items": [{ "menu_item_id": "uuid", "name": "...", "quantity": 2, "unit_price": 25000, "subtotal": 50000 }],
    "total_amount": 50000
  },
  "payment_components": [
    { "type": "SLOT_FEE", "amount": 300000, "status": "HELD" },
    { "type": "RENTAL_FEE", "amount": 200000, "status": "HELD" },
    { "type": "SECURITY_DEPOSIT", "amount": 500000, "status": "HELD" },
    { "type": "FNB_PREORDER", "amount": 50000, "status": "HELD" }
  ],
  "total_charged": 1050000,
  "created_at": "2026-06-15T08:00:00+07:00"
}
```

**Errors**: 404 not found, 403 access denied

---

## 7. List My Bookings

**GET** `/bookings`  
**Auth**: Required  
**Role**: CUSTOMER

**Query params**: `status` (optional filter), `page` (default 1), `limit` (default 20)

**Response 200**:
```json
{
  "data": [
    {
      "id": "uuid",
      "cafe_name": "RC Cafe Hà Nội",
      "play_mode": "RENTAL",
      "status": "CONFIRMED",
      "slot_start": "2026-06-15T09:00:00+07:00",
      "slot_end": "2026-06-15T11:00:00+07:00",
      "total_charged": 1050000,
      "created_at": "..."
    }
  ],
  "total": 5,
  "page": 1,
  "limit": 20
}
```

---

## 8. Cancel Booking

**POST** `/bookings/:id/cancel`  
**Auth**: Required  
**Role**: CUSTOMER (own booking), PROVIDER (own cafe booking)

**Request body**:
```json
{ "reason": "Bận việc đột xuất" }
```

**Behavior**:
- Booking must be CONFIRMED
- Calculate refund per R1 (customer) or R2 (provider) based on `slot_start` delta and caller role
- Call VNPay refund API with computed refund amount
- Update PaymentComponents status → REFUNDED / PARTIALLY_REFUNDED
- Transition booking → CANCELLED

**Response 200**:
```json
{
  "success": true,
  "refund_amount": 850000,
  "refund_breakdown": {
    "slot_fee_refunded": 150000,
    "rental_fee_refunded": 200000,
    "deposit_refunded": 500000,
    "fnb_refunded": 0
  },
  "refund_note": "Hoàn 50% slot fee (12–24h trước giờ chơi)"
}
```

**Errors**:
- 400 `BOOKING_NOT_CONFIRMED` — cannot cancel a PENDING or already CANCELLED booking
- 403 `NOT_BOOKING_OWNER`
- 500 `REFUND_FAILED` — VNPay refund API error (cancellation not committed)

---

## 9. List Bookings (Provider/Staff)

**GET** `/provider/cafes/:cafeId/bookings`  
**Auth**: Required  
**Role**: PROVIDER (must own cafe), STAFF (must be assigned to cafe)

**Query params**:
```
date: YYYY-MM-DD (required)
status: PENDING | CONFIRMED | CANCELLED (optional)
page: number (default 1)
limit: number (default 50)
```

**Response 200**:
```json
{
  "data": [
    {
      "id": "uuid",
      "customer_name": "Nguyễn Văn B",
      "customer_phone": "0901234567",
      "play_mode": "RENTAL",
      "status": "CONFIRMED",
      "slot_start": "2026-06-15T09:00:00+07:00",
      "slot_end": "2026-06-15T11:00:00+07:00",
      "participant_count": 2,
      "vehicles": ["Tamiya TT-02 #001"],
      "total_charged": 1050000
    }
  ],
  "total": 8,
  "page": 1,
  "limit": 50
}
```

**Errors**: 403 not cafe owner/assigned staff, 404 cafe not found
