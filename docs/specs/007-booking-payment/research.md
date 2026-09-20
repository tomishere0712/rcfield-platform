# Research: Booking & Payment Flow

**Feature**: 007-booking-payment | **Date**: 2026-06-08

## Decision 1 — Slot Locking Strategy

**Decision**: Redis atomic operations — `SET NX EX 1800` per vehicle-slot for RENTAL; INCR counter capped at `cafe.byoc_capacity` for BYOC.

**Rationale**: Redis already configured in `env.ts` (ioredis). Atomic `SET NX` guarantees only one booking succeeds per vehicle-slot with automatic TTL expiry (1800s = 30 min payment window). DB-level `SELECT FOR UPDATE` would also work but holds DB connections for the lock duration and has no built-in TTL — requires cleanup jobs.

**RENTAL lock key**: `slot:lock:vehicle:{vehicleId}:{slotStartEpoch}`  
Value: `bookingId` | TTL: 1800s | Lock on: `POST /bookings` | Release on: CONFIRMED or CANCELLED

**BYOC counter key**: `slot:byoc:{cafeId}:{slotStartEpoch}`  
Value: current BYOC booking count | TTL: 1800s beyond last INCR  
On lock: `INCR` then check ≤ `cafe.byoc_capacity` — if over, `DECR` and reject  
On release: `DECR` when booking CANCELLED or expires

**Race condition handling**: RENTAL — if `SET NX` returns nil, slot taken. BYOC — INCR + check is atomic per Redis single-threaded model.

**Alternatives rejected**:
- DB optimistic locking (version field + retry): poor UX, retry complexity
- Postgres advisory locks: no TTL, complex cleanup

---

## Decision 2 — VNPay txnRef Scheme

**Decision**: `txnRef = bookingId` (UUID without dashes, 32 chars) stored in `payment_transactions.txn_ref`.

**Rationale**: VNPay limits txnRef to 100 chars. Using the booking UUID (stripped of dashes = 32 chars) is unique, stable, and maps directly to the booking without extra lookup tables. The `payment_transactions` table has UNIQUE constraint on `txn_ref`.

**Flow**:
1. `POST /bookings/:id/checkout` — inserts PaymentTransaction(status=PENDING, txn_ref=bookingId-nodashes), returns VNPay URL
2. VNPay callback (return/IPN) carries `vnp_TxnRef` → find PaymentTransaction by txn_ref → get bookingId

**Alternatives rejected**:
- Sequential number: predictable, exposes volume
- `booking:{id}:{timestamp}`: longer than needed, no benefit

---

## Decision 3 — IPN Idempotency

**Decision**: UNIQUE constraint on `payment_transactions.txn_ref` acts as the idempotency gate. On IPN: attempt to UPDATE transaction status to SUCCESS; if txn_ref already SUCCESS (duplicate IPN), short-circuit and return `{ RspCode: "00", Message: "Confirm Success" }` without re-processing.

**Rationale**: VNPay may send IPN multiple times (network retry). Processing a second time would attempt to re-CONFIRM an already-CONFIRMED booking and re-create PaymentComponents — both must be no-ops. Checking PaymentTransaction status before booking update is sufficient.

**Algorithm**:
```
IPN arrives with vnp_TxnRef:
  1. verifyVnpayParams() — if invalid hash → return RspCode "97"
  2. find PaymentTransaction by txn_ref
  3. if not found → return RspCode "01" (order not found)
  4. if already SUCCESS → return RspCode "00" (idempotent success, do nothing)
  5. if booking already CONFIRMED → mark transaction SUCCESS, return "00"
  6. validate amount matches
  7. DB transaction:
     a. UPDATE payment_transactions SET status=SUCCESS
     b. BookingService.transition(bookingId, 'PAYMENT_CONFIRMED')
     c. Create PaymentComponents (HELD)
  8. return RspCode "00"
```

---

## Decision 4 — Booking Snapshot Structure

**Decision**: Snapshot written once at `CONFIRMED` transition, immutable thereafter.

```typescript
interface BookingSnapshot {
  slot_fee_rate: number;          // from cafe.slotFeeRate at booking time
  slot_count: number;             // number of slots booked
  slot_fee_total: number;         // slot_fee_rate × slot_count
  vehicles: Array<{
    vehicle_id: string;
    rental_fee: number;           // from vehicle.hourly_rate × slot_count
    security_deposit: number;     // from vehicle catalog
    damage_multiplier: number;
  }>;
  fnb_total: number;              // sum of FnbOrderItem subtotals (0 if no F&B)
  discount_amount: number;        // from promotion (0 if no promotion)
  total_charged: number;          // slot_fee_total + sum(rental_fee) + sum(deposit) + fnb_total - discount
  platform_fee_pct: number;       // 0 (SaaS subscription model, no per-booking commission)
  refund_rules: {
    window_gt_24h_pct: 100;
    window_12_24h_slot_pct: 50;
    window_lt_12h_slot_pct: 0;
    rental_always_pct: 100;
    deposit_always_pct: 100;
  };
  captured_at: string;            // ISO timestamp
}
```

**Rationale**: Captures all values needed for refund calculation without joining live tables. If cafe/vehicle prices change after booking, refunds still compute correctly from this snapshot.

---

## Decision 5 — Booking Timeout Job

**Decision**: `node-cron` running every minute, querying `bookings WHERE status = 'PENDING' AND payment_expires_at < NOW()`.

**Rationale**: Matches the existing job pattern in the codebase (`quota-reset.job.ts`, `subscription-lifecycle.job.ts`). Server restart risk is acceptable — worst case a PENDING booking lives a few extra minutes until the next cron tick. Redis slot locks have independent TTL (1800s) so even if the cron misses a booking, the slot unlocks automatically.

**Implementation**:
```typescript
export function scheduleBookingTimeout(): void {
  cron.schedule('* * * * *', async () => {
    // Find PENDING bookings past payment deadline
    // For each: BookingService.transition(id, 'PAYMENT_TIMEOUT') 
    //           → releases Redis slot locks
  });
}
```

**Alternatives rejected**:
- Per-booking `setTimeout`: lost on server restart
- Redis keyspace events (TTL expiry): more complex setup, requires Redis config change
- Bull/BullMQ job queue: overkill for Phase 1 single-server setup

---

## Decision 6 — VNPay Refund on Cancellation (Phase 1)

**Decision**: VNPay refund API call triggered synchronously from `cancelBooking()` service. VNPay sandbox supports `vnp_Command=refund`. PaymentComponent status → REFUNDED after successful refund API response.

**Rationale**: For Phase 1 sandbox environment, synchronous refund is sufficient. A failed refund throws an AppError so the cancellation is not committed — customer can retry. Production (Phase 2) will need async retry queue.

**Partial refund (R1, 50% SLOT_FEE window)**:  
Two VNPay refund calls: one for 50% slot_fee amount, one for rental_fee + deposit. Or single call for combined partial amount. VNPay supports partial refund via `vnp_Amount` < original. Use single refund call with computed total refund amount.

**Refund amount by rule**:
- R1 >24h: refund = slot_fee_total + sum(rental_fees) + sum(deposits) + fnb_total
- R1 12-24h: refund = (slot_fee_total × 0.5) + sum(rental_fees) + sum(deposits) + fnb_total  
- R1 <12h: refund = sum(rental_fees) + sum(deposits) + fnb_total
- R2 provider cancel: refund = total_charged (100%)
- F&B refund on cancellation: **deferred** — no policy defined yet. For Phase 1, treat F&B like slot_fee in each window (same percentage).

> Note: F&B refund policy is explicitly undefined (spec Clarifications). This assumption should be confirmed before launching cancellation service.
