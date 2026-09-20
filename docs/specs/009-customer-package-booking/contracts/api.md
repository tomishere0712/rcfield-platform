# API Contracts: Customer Package Purchase & Booking

**Feature**: `specs/009-customer-package-booking/spec.md`
**Date**: 2026-06-11

All endpoints follow existing conventions: `express-validator` / zod, `authenticate` middleware for auth-required routes, `authorize(...roles)` for RBAC.

---

## 1. GET /api/v1/cafes/:cafeId/packages/public

**Auth**: None (public)
**Role**: Any / anonymous
**Description**: List ACTIVE packages for a cafe. Used by customers before purchase.

### Response 200

```json
{
  "data": [
    {
      "id": "uuid",
      "code": "string",
      "name": "string",
      "description": "string | null",
      "slot_count": 5,
      "price": 250000,
      "valid_days": 30,
      "billing_period": "MONTH",
      "benefits": ["string"],
      "applicable_play_modes": ["RENTAL", "BYOC"],
      "is_popular": false
    }
  ]
}
```

**Filters**: Only `status = ACTIVE` packages. Internal fields (`cost_price`, provider notes, `INACTIVE`/`ARCHIVED` packages) are excluded.

---

## 2. POST /api/v1/cafes/:cafeId/packages/:packageId/purchase

**Auth**: Required (`authenticate`)
**Role**: `CUSTOMER`
**Description**: Initiate package purchase. Creates a `CustomerPackage` in `PENDING_PAYMENT` and a `PaymentTransaction` linked to it. Returns VNPay checkout URL.

### Request Body

```typescript
// Zod schema: PurchasePackageSchema
{
  // no body fields — package and cafe are path params
}
```

### Validation (service layer)
- `packageId` must exist, belong to `cafeId`, and have `status = ACTIVE`
- Customer cannot already have an `ACTIVE` package from the same `packageId` with `slots_remaining > 0`? → No restriction (spec: accumulation is allowed, FR-004)

### Response 200

```json
{
  "customer_package_id": "uuid",
  "payment_url": "https://sandbox.vnpayment.vn/...",
  "txn_ref": "string",
  "amount": 250000,
  "expires_at": "ISO8601"
}
```

### Error Responses

| Code | Error Code | Condition |
|------|-----------|-----------|
| 404 | `PACKAGE_NOT_FOUND` | packageId not found or not in cafeId |
| 400 | `PACKAGE_INACTIVE` | package.status ≠ ACTIVE |

---

## 3. GET /api/v1/customers/me/packages

**Auth**: Required (`authenticate`)
**Role**: `CUSTOMER`
**Description**: List all packages owned by the authenticated customer, sorted by `created_at DESC`.

### Query Parameters

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `status` | `ACTIVE\|EXHAUSTED\|EXPIRED\|PENDING_PAYMENT` | — | Filter by status (optional) |
| `cafe_id` | uuid | — | Filter by cafe (optional) |

### Response 200

```json
{
  "data": [
    {
      "id": "uuid",
      "package_id": "uuid",
      "cafe_id": "uuid",
      "cafe_name": "string",
      "package_name": "string",
      "slots_total": 5,
      "slots_remaining": 3,
      "expires_at": "ISO8601",
      "status": "ACTIVE",
      "purchased_price": 250000,
      "created_at": "ISO8601"
    }
  ]
}
```

---

## 4. GET /api/v1/customers/me/packages/:customerPackageId/usage

**Auth**: Required (`authenticate`)
**Role**: `CUSTOMER`
**Description**: List bookings that used a specific customer package (usage history for US3).

### Response 200

```json
{
  "data": [
    {
      "booking_id": "uuid",
      "slot_start": "ISO8601",
      "slot_end": "ISO8601",
      "slots_used": 2,
      "cafe_name": "string",
      "booking_status": "CONFIRMED"
    }
  ]
}
```

### Error Responses

| Code | Error Code | Condition |
|------|-----------|-----------|
| 404 | `CUSTOMER_PACKAGE_NOT_FOUND` | Not found or not owned by current customer |

---

## 5. POST /api/v1/bookings (MODIFIED)

**Auth**: Required (`authenticate`)
**Role**: `CUSTOMER`
**Description**: Existing booking creation endpoint. Extended with optional `customer_package_id`.

### Request Body Changes

Add optional field to existing `CreateBookingSchema`:

```typescript
customer_package_id?: z.string().uuid().optional()
```

### New Validation (when `customer_package_id` provided)

1. `customer_package_id` must exist and belong to the authenticated customer
2. `customer_package.cafe_id` must match `body.cafe_id`
3. `customer_package.status` must be `ACTIVE`
4. `customer_package.expires_at` must be > `now()`
5. Compute `slots_needed = ceil((slotEnd - slotStart) / cafe.slotDurationMinutes)`
6. `customer_package.slots_remaining` must be ≥ `slots_needed`
7. Package's `applicable_play_modes` must include `body.play_mode`

### Response Changes (when package applied)

When `customer_package_id` is provided and `totalCharged === 0`:

```json
{
  "booking_id": "uuid",
  "payment_url": null,
  "confirmed": true,
  "slots_used": 2,
  "slots_remaining_after": 1
}
```

When `customer_package_id` is provided and `totalCharged > 0` (rental + deposit + FnB):

```json
{
  "booking_id": "uuid",
  "payment_url": "https://sandbox.vnpayment.vn/...",
  "confirmed": false,
  "slots_used": 2
}
```

### Error Responses (new codes)

| Code | Error Code | Condition |
|------|-----------|-----------|
| 400 | `PACKAGE_INSUFFICIENT_SLOTS` | `slots_remaining < slots_needed` |
| 400 | `PACKAGE_EXPIRED` | `expires_at < now()` or status ≠ ACTIVE |
| 400 | `PACKAGE_CAFE_MISMATCH` | package.cafe_id ≠ booking.cafe_id |
| 400 | `PACKAGE_PLAY_MODE_MISMATCH` | play_mode not in applicable_play_modes |

---

## 6. VNPay IPN — processConfirmation (MODIFIED, internal)

Not a new public endpoint. The existing `POST /api/v1/payments/vnpay/ipn` handler routes to `processConfirmation`.

### Logic change

After txnRef lookup finds a `PaymentTransaction`:

```
if (tx.customerPackageId != null) {
  → activateCustomerPackage(tx.customerPackageId)
  → mark tx.status = SUCCESS
} else {
  → existing booking confirmation logic
  → deductSlots if booking.snapshot.package_used exists
}
```

`activateCustomerPackage`:
1. Load `CustomerPackage` WHERE id = `tx.customerPackageId`
2. Set `status = ACTIVE`, `expires_at = now() + validDays days`
3. Save

`deductSlots` (called inside booking CONFIRMED transition):
1. `SELECT * FROM customer_packages WHERE id = :id FOR UPDATE`
2. Decrement `slots_remaining -= slots_used` (read from `snapshot.package_used.slots_used`)
3. If `slots_remaining === 0` → set `status = EXHAUSTED`
4. Save within same DB transaction as payment components

---

## Zod Schemas Summary

All schemas in `src/validate/index.ts`:

```typescript
// ── customer_packages ─────────────────────────────────────────────────────────

// PurchasePackageSchema — no body (path params only)
export const PurchasePackageSchema = z.object({});

// ListMyPackagesQuerySchema
export const ListMyPackagesQuerySchema = z.object({
  status: z.enum(['ACTIVE', 'EXHAUSTED', 'EXPIRED', 'PENDING_PAYMENT']).optional(),
  cafe_id: z.string().uuid().optional(),
});

// ── bookings (addition) ────────────────────────────────────────────────────────
// Add to existing CreateBookingSchema:
customer_package_id: z.string().uuid().optional(),
```
