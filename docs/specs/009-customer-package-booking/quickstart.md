# Quickstart: Customer Package Purchase & Booking

**Feature**: `specs/009-customer-package-booking/spec.md`
**Date**: 2026-06-11

---

## Implementation Order

Follow this order strictly — each phase unblocks the next.

### Phase 1 — Foundation (types, entity, migration)
1. Add `CustomerPackageStatus` enum to `src/types/index.ts`
2. Add `PACKAGE_PURCHASE` to `PaymentComponentType` in `src/types/index.ts`
3. Create `src/models/customer-package.entity.ts`
4. Modify `src/models/booking.entity.ts` — add nullable `customerPackageId` column
5. Modify `src/models/payment-transaction.entity.ts` — make `bookingId` nullable, add `customerPackageId`
6. Write migration `src/migrations/1750300000000-CustomerPackages.ts`
7. Run migration: `npm run migration:run`

### Phase 2 — Package Service (US1 + US3)
8. Create `src/services/customer-package.service.ts`:
   - `purchasePackage(cafeId, packageId, viewer)` — creates PENDING_PAYMENT record + payment tx + VNPay URL
   - `activateCustomerPackage(customerPackageId)` — called from IPN, sets status=ACTIVE, expires_at
   - `listMyPackages(customerId, query)` — GET /customers/me/packages
   - `getPackageUsageHistory(customerPackageId, customerId)` — GET usage
   - `deductSlots(customerPackageId, slotsUsed, queryRunner)` — called from payment service
   - `refundSlots(customerPackageId, slotsUsed, queryRunner)` — called from booking service cancel

### Phase 3 — Public Package Listing (US1)
9. Add `GET /api/v1/cafes/:cafeId/packages/public` route to `src/routes/cafe.routes.ts` (no auth)
10. Add controller handler in `src/controllers/cafe.controller.ts` (or create `customer-package.controller.ts`)

### Phase 4 — Booking Integration (US2)
11. Extend `CreateBookingSchema` in `src/validate/index.ts` — add `customer_package_id?`
12. Modify `createBooking` in `src/services/booking.service.ts`:
    - Accept `customer_package_id` in `CreateBookingBody`
    - Validate package ownership, cafe match, mode compat, slots available, not expired
    - Compute `slots_needed`, set `slotFee = 0` in line-item calculation
    - Store `customer_package_id` on booking entity
    - Write `package_used` into snapshot before calling `createCheckoutUrl`
13. Modify `createCheckoutUrl` in `src/services/payment.service.ts`:
    - If `totalCharged === 0` (package covers everything): skip VNPay, call direct-confirm inline, return `{ payment_url: null, confirmed: true }`
    - Otherwise: normal VNPay flow

### Phase 5 — IPN Integration (US2 slot deduction)
14. Modify `processConfirmation` in `src/services/payment.service.ts`:
    - After txnRef lookup: branch on `tx.customerPackageId`
    - If package purchase → `activateCustomerPackage`
    - If booking → existing logic + call `deductSlots` if `snapshot.package_used` present
15. Modify `processMockConfirmation` — same `deductSlots` hook

### Phase 6 — Slot Refund (US4)
16. Modify `cancelBooking` in `src/services/booking.service.ts`:
    - After transitioning to CANCELLED, check if `booking.snapshot.package_used` exists
    - If `booking.slotStart > new Date()` → call `refundSlots`

### Phase 7 — Customer Package Routes
17. Create `src/controllers/customer-package.controller.ts`
18. Create `src/routes/customer-package.routes.ts` — mount purchase, list, history
19. Register routes in `src/app.ts`

### Phase 8 — Expiry Cron
20. Create `src/jobs/package-expiry.job.ts` — daily cron, batch-update `ACTIVE → EXPIRED` where `expires_at < NOW()`

---

## E2E Scenarios

### Scenario 1 — Happy path: Buy package, apply to zero-total booking

```
1. Provider creates package: { name: "5 buổi", slot_count: 5, price: 200000, valid_days: 30, applicable_play_modes: ["BYOC"] }
2. Customer: GET /cafes/:cafeId/packages/public → sees package
3. Customer: POST /cafes/:cafeId/packages/:packageId/purchase → gets VNPay URL
4. VNPay IPN fires → activateCustomerPackage → CustomerPackage.status = ACTIVE, slots_remaining = 5
5. Customer: POST /bookings { cafe_id, play_mode: "BYOC", slot_start, slot_end (2h at 60min cafe = 2 slots), customer_package_id }
   - slotFee = 0, no rental, no deposit → totalCharged = 0
   - Direct confirm fires inline: booking.status = CONFIRMED, slots_remaining = 3
   - Response: { payment_url: null, confirmed: true }
6. Customer: GET /customers/me/packages → sees { slots_remaining: 3, status: ACTIVE }
```

### Scenario 2 — Apply package to RENTAL booking (still pays rental + deposit)

```
1. Customer has ACTIVE package (5 slots)
2. Customer: POST /bookings { play_mode: "RENTAL", vehicle_ids: [x], customer_package_id }
   - slotFee = 0, but rental_fee = 80000, deposit = 200000 → totalCharged = 280000
   - Normal VNPay URL returned: { payment_url: "...", confirmed: false }
3. VNPay IPN → booking CONFIRMED → deductSlots(2) → slots_remaining = 3
```

### Scenario 3 — Slot refund on early cancellation

```
1. Customer has booking CONFIRMED with 2 slots deducted (slots_remaining = 3)
2. slotStart is tomorrow
3. Customer: DELETE /bookings/:bookingId/cancel
   → slotStart > now() → refundSlots(2) → slots_remaining = 5
   → booking.status = CANCELLED
```

### Scenario 4 — Package blocks on insufficient slots

```
1. Customer has package with slots_remaining = 1
2. Booking duration = 2h at 60min cafe → slots_needed = 2
3. POST /bookings with customer_package_id → 400 PACKAGE_INSUFFICIENT_SLOTS
```

### Scenario 5 — Package purchase IPN routing

```
1. POST /cafes/:cafeId/packages/:packageId/purchase
   → creates customer_package (PENDING_PAYMENT), payment_transaction (customer_package_id set, booking_id NULL)
2. VNPay IPN arrives with txnRef
   → lookup tx → tx.customerPackageId is set → activateCustomerPackage branch
   → customer_package.status = ACTIVE, expires_at = now() + 30 days
   → NOT the booking confirmation branch
```

---

## Unit Test Checklist

- `deductSlots`: concurrent deductions with FOR UPDATE — second call after first empties slots returns error
- `refundSlots`: correct increment, status back to ACTIVE if was EXHAUSTED? (no — EXHAUSTED is terminal per spec)
- `createBooking` with package: `slotFee = 0` in line items
- `createBooking` with package: expired package → 400 PACKAGE_EXPIRED
- `createBooking` with package: wrong cafe → 400 PACKAGE_CAFE_MISMATCH
- `processConfirmation`: routes to `activateCustomerPackage` when `tx.customerPackageId` set
- `processConfirmation`: calls `deductSlots` when booking snapshot has `package_used`
- `cancelBooking`: refunds slots only when `slotStart > now()`
- `cancelBooking`: no slot refund when `slotStart <= now()`
- `cancelBooking`: no slot refund when `snapshot.package_used` is absent
