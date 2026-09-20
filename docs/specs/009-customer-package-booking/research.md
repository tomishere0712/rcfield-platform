# Research: Customer Package Purchase & Booking Application

**Feature**: `specs/009-customer-package-booking/spec.md`
**Date**: 2026-06-11
**Status**: Complete — all decisions resolved

---

## Decision 1: PaymentTransaction Schema Extension for Package Purchase

**Decision**: Make `payment_transactions.booking_id` nullable. Add a nullable `customer_package_id` FK column. Enforce a DB-level `CHECK` constraint ensuring exactly one of (`booking_id`, `customer_package_id`) is non-null:

```sql
ALTER TABLE payment_transactions
  ALTER COLUMN booking_id DROP NOT NULL,
  ADD COLUMN customer_package_id uuid REFERENCES customer_packages(id),
  ADD CONSTRAINT chk_payment_tx_source
    CHECK (
      (booking_id IS NOT NULL)::int + (customer_package_id IS NOT NULL)::int = 1
    );
```

**Rationale**: Package purchases must reuse the existing VNPay IPN infrastructure — txnRef generation, signature verification, idempotency guard, and `processConfirmation` routing are all written once and shared by both paths. A separate `package_payment_transactions` table would duplicate this logic and require a second IPN handler or a multiplexer in the webhook route.

**Alternatives considered**:
- Separate table (`package_payment_transactions`): avoids touching an existing schema but duplicates VNPay plumbing and forces a union-style txnRef lookup.
- Single `entity_type` discriminator column + nullable `entity_id`: less type-safe — no FK enforcement, and the CHECK constraint is harder to express.

---

## Decision 2: IPN Routing for Package Purchase vs Booking

**Decision**: In `processConfirmation`, after txnRef lookup resolves a `PaymentTransaction`, branch on `tx.customerPackageId`:

```
if (tx.customerPackageId) → activateCustomerPackage(tx.customerPackageId)
else                       → existing booking transition logic
```

Both branches share: VNPay signature verification, SUCCESS/FAILED status check, idempotency guard (skip if `tx.status` is already `CONFIRMED`), and marking `tx.status = CONFIRMED`.

**Rationale**: A single IPN endpoint keeps the webhook route simple and avoids duplicate signature verification. The only semantic difference between the two payment types is what happens after the transaction is confirmed — everything upstream (txnRef lookup, HMAC check, idempotency) is identical.

**Alternatives considered**:
- Two separate IPN endpoints (`/ipn/booking` and `/ipn/package`): redundant VNPay verification code in both handlers; VNPay only allows one configured return URL per merchant.
- Strategy pattern with a `PaymentHandler` interface: over-engineered for two cases; a simple `if` is readable and sufficient.

---

## Decision 3: Zero-Total Booking (Package Covers Full Cost)

**Decision**: In `createCheckoutUrl`, after computing `totalCharged`, if `totalCharged === 0`:
1. Skip VNPay URL generation.
2. Call a direct confirm path (equivalent to `processMockConfirmation`) inline, within a DB transaction — create payment components as `DISBURSED`, transition booking to `CONFIRMED`, deduct `slots_remaining`.
3. Return `{ payment_url: null, confirmed: true, booking_id }`.

The frontend checks the `confirmed` flag; if `true`, it skips the payment redirect and goes directly to the booking confirmation screen.

**Rationale**: VNPay rejects `amount = 0` (sandbox minimum is 10,000 VND). This scenario is valid: a customer with a package that covers the full `slot_fee` and has no rental, deposit, or F&B components pays nothing extra. The direct confirm is safe because the package slot was already validated and locked at booking creation; no money changes hands.

**Alternatives considered**:
- Send 1 VND as a placeholder: violates payment integrity; creates false transaction records.
- Block zero-total bookings: breaks the core package value proposition.
- Separate "apply package" endpoint called after booking creation: two-step flow is error-prone (partial state if second call fails).

---

## Decision 4: Slot Deduction Timing

**Decision**: Deduct `customer_packages.slots_remaining` inside `processConfirmation` (after the booking transitions to `CONFIRMED`), within the same DB transaction as creating payment components. Use pessimistic locking:

```sql
SELECT * FROM customer_packages WHERE id = :id FOR UPDATE;
```

The number of slots to deduct is read from `booking.snapshot.package_used.slots_used` (snapshot, not recomputed).

**Rationale**: Constitution Principle II — side effects must only materialize at confirmed state. Deducting at booking creation would cause slots to disappear for a booking that is later cancelled due to payment failure or timeout. `FOR UPDATE` is necessary because two concurrent IPN callbacks (e.g., two bookings by the same customer using the same package) could both read `slots_remaining = 1`, both proceed, and over-deduct.

**Alternatives considered**:
- Deduct at booking creation (optimistic): exposes slots to double-spend if payment fails; violates Constitution Principle II.
- Optimistic locking with version column: a lost update is non-fatal in most domains, but slot inventory is financial — pessimistic lock is the right default here.
- Application-level mutex (Redis SETNX): adds an external dependency for a case already solvable with a DB-level lock.

---

## Decision 5: Slot Refund on Cancellation Condition

**Decision**: In `cancelBooking`, after transitioning to `CANCELLED`, evaluate:

```
if booking.slotStart > now()  →  refund slots_used back to customer_packages.slots_remaining
if booking.slotStart <= now() →  no refund (slot window already opened)
```

The number of slots to refund is read from `booking.snapshot.package_used.slots_used` (never recomputed from current package config). The refund increment uses the same `FOR UPDATE` lock as the deduction.

**Rationale**: Constitution Principle I — always read financial quantities from the snapshot, not from current state. If the package was modified after booking (e.g., slot value changed), the refund must mirror exactly what was deducted at confirmation time. The cut-off at `slot_start` matches the no-refund-after-play rule confirmed by the product owner.

**Alternatives considered**:
- Always refund: overly generous; rewards no-shows.
- Never refund: penalises legitimate advance cancellations; conflicts with general cancellation policy (R1/R2 in payment spec).
- Refund based on cancellation lead time (e.g., > 24h): more complex; product owner confirmed `slotStart > now()` is the correct boundary.

---

## Decision 6: Public Package Listing for Customers

**Decision**: Add a new unauthenticated route alongside the existing provider-only route:

```
GET /api/v1/cafes/:cafeId/packages/public
  → No auth required (or optional bearer — anonymous and authenticated both work)
  → Returns only packages where status = ACTIVE
  → Omits internal fields (cost_price, provider_notes, etc.)

GET /api/v1/providers/:providerId/cafes/:cafeId/packages   (unchanged)
  → Requires PROVIDER or ADMIN role
  → Returns all statuses + full fields
```

**Rationale**: RBAC Principle VI — public browsing data does not require authentication. Customers must be able to see available packages before deciding to purchase (or even before logging in). The provider-only route is unchanged to preserve existing management flows.

**Alternatives considered**:
- Expose packages on the existing provider route with a public mode: RBAC middleware would need conditional logic; cleaner to split routes.
- Add a `visibility` flag to the existing route: adds complexity without benefit — active packages are always public by definition.
- Require login to view packages: unnecessary friction before purchase intent; conflicts with standard SaaS browse-before-auth pattern.

---

## Decision 7: CustomerPackageStatus Transitions

**Decision**: Define three terminal/progressive states with the following transitions:

```
PENDING_PAYMENT → ACTIVE       (on IPN confirmation: activateCustomerPackage)
ACTIVE          → EXHAUSTED    (on deductSlots: when slots_remaining reaches 0)
ACTIVE          → EXPIRED      (daily cron job: when expires_at < NOW() AND slots_remaining > 0)
EXHAUSTED       → (terminal)   (visible in purchase history, cannot be used)
EXPIRED         → (terminal)   (visible in purchase history, cannot be used)
```

The daily expiry cron follows the same pattern as `subscription-lifecycle.job.ts` — query `WHERE status = 'ACTIVE' AND expires_at < NOW()` in batches, bulk-update to `EXPIRED`.

**Rationale**: Mirrors the existing subscription lifecycle pattern in the codebase, which reduces implementation surface and makes the job familiar to maintainers. `EXHAUSTED` and `EXPIRED` are distinct terminal states so customer history clearly shows whether a package ran out of slots or timed out. Active-but-expired packages cannot be used for new bookings — the `applyPackage` service method checks `status = ACTIVE AND expires_at > NOW() AND slots_remaining > 0` before allowing application.

**Alternatives considered**:
- Single `INACTIVE` terminal state: loses the distinction between exhausted and expired, which is useful for customer support and analytics.
- No expiry cron — check at usage time: `ACTIVE` packages with `expires_at < NOW()` would still appear as available; lazy evaluation is less reliable for display and reporting.
- Expiry via DB trigger: hard to test, hard to monitor, violates the codebase convention of keeping business logic in service/job layer.
