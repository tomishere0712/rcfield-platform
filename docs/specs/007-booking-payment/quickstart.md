# Quickstart: Booking & Payment Flow

**Feature**: 007-booking-payment | **Date**: 2026-06-08

Implementation order and 5 E2E test scenarios. Each scenario is independently testable.

---

## Implementation Order

1. **Migration** — create 7 new tables
2. **Entities** — TypeORM entity classes
3. **Enums** — update `src/types/index.ts`
4. **Unit tests** (TDD) — write failing tests for BookingService.canTransition() and refund rules (R1/R2/R3) BEFORE implementing services
5. **BookingService** — transition(), createBooking(), cancelBooking()
6. **PaymentService** — createPaymentComponents(), processConfirmation(), processRefund()
7. **Update vnpay.controller.ts** — wire IPN/return to PaymentService.processConfirmation()
8. **booking.controller.ts** + **booking.routes.ts**
9. **Provider route** — add GET `/provider/cafes/:cafeId/bookings`
10. **booking-timeout.job.ts** — register in server.ts
11. **Frontend** — wire CreateBookingPage → POST /bookings → POST /bookings/:id/checkout → redirect to VNPay
12. **Frontend** — PaymentResultPage reads query params from VNPay return redirect
13. **Frontend** — BookingDetailPage, CustomerBookingsPage, ProviderBookingsPage

---

## Scenario 1 — Happy Path RENTAL Booking

**Goal**: Customer creates RENTAL booking, pays via VNPay sandbox, booking → CONFIRMED.

**Steps**:
1. `GET /cafes/:cafeId/availability?slot_start=...&slot_end=...&play_mode=RENTAL`
   - Expect: vehicle list with status AVAILABLE
2. `POST /bookings` with vehicle_ids, participants, no fnb_items
   - Expect: 201 with status PENDING, breakdown with slot_fee + rental_fee + deposit
3. `POST /bookings/:id/checkout`
   - Expect: 200 with payment_url pointing to VNPay sandbox
4. Follow payment_url, complete payment in VNPay sandbox
5. VNPay redirects to `/payment/result?status=success&bookingId=...`
6. `GET /bookings/:id`
   - Expect: status CONFIRMED, all payment_components status HELD

**Validation**:
- Redis slot lock exists for vehicleId+slotStart (TTL ~1800)
- Payment transaction in DB with status SUCCESS
- 4 PaymentComponents created: SLOT_FEE + RENTAL_FEE + SECURITY_DEPOSIT (all HELD)
- Booking snapshot JSON is not null

---

## Scenario 2 — BYOC Booking

**Goal**: Customer creates BYOC booking, only slot_fee charged.

**Steps**:
1. `GET /cafes/:cafeId/availability?play_mode=BYOC` — check byoc_remaining > 0
2. `POST /bookings` with play_mode=BYOC, vehicle_ids=[], participants=[{BOOKER}]
   - Expect: breakdown shows only slot_fee, no rental_fee, no deposit
3. `POST /bookings/:id/checkout` → pay → CONFIRMED

**Validation**:
- booking_vehicles table: 0 rows for this booking
- PaymentComponents: only SLOT_FEE HELD
- Redis BYOC counter for cafeId+slot = 1

---

## Scenario 3 — Booking Timeout Auto-Cancel

**Goal**: PENDING booking expires after 30 min without payment.

**Steps**:
1. `POST /bookings` → PENDING (note payment_expires_at)
2. Wait for cron job (or manually set payment_expires_at to past timestamp in DB for testing)
3. Wait 1 minute for next cron tick
4. `GET /bookings/:id`
   - Expect: status CANCELLED
5. `GET /cafes/:cafeId/availability` for same slot
   - Expect: vehicle shows AVAILABLE again (Redis lock released)

**Validation**:
- PaymentComponents: none created (booking never CONFIRMED)
- Redis slot lock: cleared

---

## Scenario 4 — Race Condition (Concurrent Checkout)

**Goal**: Two customers try to book the same vehicle+slot simultaneously — only first succeeds.

**Steps**:
1. Customer A: `POST /bookings` with vehicleId X, slot S → succeeds (PENDING)
2. Customer B: `POST /bookings` with vehicleId X, slot S → expect 409 SLOT_LOCKED
3. Customer A pays → CONFIRMED
4. Customer B: `POST /bookings` with vehicleId X, slot S → expect 400 VEHICLE_UNAVAILABLE

**Validation**: Only 1 CONFIRMED booking for vehicleId X at slot S

---

## Scenario 5 — Customer Cancellation with Partial Refund

**Goal**: Customer cancels a CONFIRMED booking in the 12–24h window → 50% slot fee refunded.

**Setup**: Create CONFIRMED booking where slot_start is 18 hours from now.

**Steps**:
1. `POST /bookings/:id/cancel` with reason
   - Expect: 200 with refund_amount = (slot_fee × 0.5) + rental_fee + deposit
   - refund_breakdown shows slot_fee_refunded = slot_fee × 0.5
2. `GET /bookings/:id`
   - Expect: status CANCELLED, cancelled_at not null
3. Check PaymentComponents:
   - SLOT_FEE → PARTIALLY_REFUNDED, refunded_amount = slot_fee × 0.5
   - RENTAL_FEE → REFUNDED
   - SECURITY_DEPOSIT → REFUNDED

**VNPay sandbox validation**: Refund transaction appears in VNPay sandbox history with correct amount.

---

## Provider Booking List Smoke Test

**Goal**: Provider sees today's bookings for their cafe.

**Steps**:
1. Create 2 CONFIRMED bookings at cafe X for today
2. Login as Provider who owns cafe X
3. `GET /provider/cafes/X/bookings?date=2026-06-15`
   - Expect: 2 bookings, each with customer name, slot time, status, total_charged

---

## Unit Tests to Write (TDD Before Implementation)

```typescript
// booking.service.test.ts
describe('canTransition', () => {
  it('PENDING → CONFIRMED via PAYMENT_CONFIRMED: valid');
  it('PENDING → CANCELLED via PAYMENT_TIMEOUT: valid');
  it('CONFIRMED → CANCELLED via CUSTOMER_CANCEL: valid');
  it('CONFIRMED → CANCELLED via PROVIDER_CANCEL: valid');
  it('CANCELLED → CONFIRMED: throws INVALID_BOOKING_STATE');
  it('CONFIRMED → PENDING: throws INVALID_BOOKING_STATE');
});

// payment.service.test.ts  
describe('R1 refund rules', () => {
  it('>24h before slot: refunds 100% slot_fee + 100% rental + 100% deposit');
  it('12-24h before slot: refunds 50% slot_fee + 100% rental + 100% deposit');
  it('<12h before slot: refunds 0% slot_fee + 100% rental + 100% deposit');
});

describe('R2 provider cancel', () => {
  it('always refunds 100% of all components');
});

describe('R3 no-show timeout', () => {
  it('refunds 0% slot_fee + 100% rental + 100% deposit');
});
```
