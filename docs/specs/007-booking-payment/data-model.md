# Data Model: Booking & Payment Flow

**Feature**: 007-booking-payment | **Date**: 2026-06-08

All 7 new tables map directly to the 46-table Phase 1 Operational Core schema in `docs/spec/06-database.md`.

---

## New Enums (additions to `src/types/index.ts`)

```typescript
// Booking
export enum BookingStatus {
  PENDING     = 'PENDING',     // created, awaiting payment (30 min window)
  CONFIRMED   = 'CONFIRMED',   // payment received
  CANCELLED   = 'CANCELLED',   // cancelled by customer or provider
  NO_SHOW     = 'NO_SHOW',     // slot_start + 30 min with no check-in (Phase 2)
  COMPLETED   = 'COMPLETED',   // session completed (Phase 2)
}
// Note: Existing BookingStatus enum has extra Phase 2 states (ACTIVE, EXTENDING,
// CHECKING_OUT, DISPUTED) — replace with this clean set. Phase 2 will add back as needed.

export enum BookingParticipantType {
  BOOKER          = 'BOOKER',
  REGISTERED_USER = 'REGISTERED_USER',
  WALK_IN_GUEST   = 'WALK_IN_GUEST',   // BR-BK-000-H
}

export enum PaymentTransactionType {
  PAYMENT = 'PAYMENT',
  REFUND  = 'REFUND',
}

export enum PaymentTransactionStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED  = 'FAILED',
}

export enum FnbOrderType {
  PRE_ORDER = 'PRE_ORDER',
  ON_SITE   = 'ON_SITE',
}

export enum FnbOrderStatus {
  PENDING   = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  CANCELLED = 'CANCELLED',
}
```

---

## Entity 1 — Booking

**Table**: `bookings`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, default gen_random_uuid() | |
| customer_id | uuid | FK users(id) NOT NULL | Booking owner |
| cafe_id | uuid | FK cafes(id) NOT NULL | |
| play_mode | varchar(10) | NOT NULL | RENTAL / BYOC / MIXED |
| source | varchar(20) | NOT NULL, default 'APP' | APP / STAFF_MANUAL |
| status | varchar(20) | NOT NULL, default 'PENDING' | BookingStatus enum |
| slot_start | timestamptz | NOT NULL | |
| slot_end | timestamptz | NOT NULL | |
| payment_expires_at | timestamptz | NOT NULL | slot_start + 30 min at creation |
| snapshot | jsonb | NULL | Written once at CONFIRMED |
| promotion_id | uuid | FK promotions(id), NULL | Optional discount |
| discount_amount | numeric(15,2) | NOT NULL, default 0 | |
| cancellation_reason | text | NULL | |
| cancelled_by | uuid | FK users(id), NULL | |
| cancelled_at | timestamptz | NULL | |
| created_at | timestamptz | NOT NULL | |
| updated_at | timestamptz | NOT NULL | |
| deleted_at | timestamptz | NULL | Soft delete |

**Indexes**:
- `(customer_id)` — customer booking history
- `(cafe_id, slot_start)` — availability queries
- `(status, payment_expires_at)` — timeout job query
- `(cafe_id, status, slot_start)` — provider booking list

---

## Entity 2 — BookingParticipant

**Table**: `booking_participants`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK | |
| booking_id | uuid | FK bookings(id) NOT NULL | |
| user_id | uuid | FK users(id), NULL | NULL for walk-in guests |
| participant_type | varchar(30) | NOT NULL | BookingParticipantType |
| is_primary_responsible | boolean | NOT NULL, default false | Financial responsibility |
| guest_name | varchar(255) | NULL | For WALK_IN_GUEST |
| guest_phone | varchar(20) | NULL | For WALK_IN_GUEST |
| created_at | timestamptz | NOT NULL | |
| updated_at | timestamptz | NOT NULL | |

**Indexes**: `(booking_id)`

**Rules**:
- Exactly 1 participant with `is_primary_responsible = true` per booking
- Immutable after booking CONFIRMED (substitution at session level — Phase 2)

---

## Entity 3 — BookingVehicle

**Table**: `booking_vehicles`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK | |
| booking_id | uuid | FK bookings(id) NOT NULL | |
| vehicle_id | uuid | FK vehicles(id) NOT NULL | |
| rental_fee_snapshot | numeric(15,2) | NOT NULL | hourly_rate × slot_count at booking time |
| security_deposit_snapshot | numeric(15,2) | NOT NULL | From vehicle catalog |
| damage_multiplier_snapshot | numeric(4,2) | NOT NULL | |
| created_at | timestamptz | NOT NULL | |
| updated_at | timestamptz | NOT NULL | |

**Indexes**: `(booking_id)`, `(vehicle_id, booking_id)` for conflict checks

**Rules**: Only for RENTAL and MIXED mode bookings. BYOC has no booking_vehicles rows.

---

## Entity 4 — PaymentComponent

**Table**: `payment_components`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK | |
| booking_id | uuid | FK bookings(id) NOT NULL | |
| booking_vehicle_id | uuid | FK booking_vehicles(id), NULL | For vehicle-specific components |
| type | varchar(30) | NOT NULL | PaymentComponentType enum |
| amount | numeric(15,2) | NOT NULL | IMMUTABLE after insert |
| status | varchar(30) | NOT NULL, default 'PENDING' | PaymentComponentStatus |
| refunded_amount | numeric(15,2) | NOT NULL, default 0 | For PARTIALLY_REFUNDED |
| disbursed_at | timestamptz | NULL | |
| refunded_at | timestamptz | NULL | |
| created_at | timestamptz | NOT NULL | |
| updated_at | timestamptz | NOT NULL | |

**Indexes**: `(booking_id)`, `(booking_id, type)`

**Phase 1 components created on CONFIRMED**:
- SLOT_FEE (1 per booking) → HELD
- RENTAL_FEE (1 per booking_vehicle) → HELD
- SECURITY_DEPOSIT (1 per booking_vehicle) → HELD
- FNB_PREORDER (1 per booking, if F&B exists) → HELD

**Rules**: `amount` is write-once. Adjustments create a new component. Status transitions require DB row-level lock.

---

## Entity 5 — PaymentTransaction

**Table**: `payment_transactions`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK | |
| booking_id | uuid | FK bookings(id) NOT NULL | |
| type | varchar(20) | NOT NULL | PAYMENT / REFUND |
| gateway | varchar(20) | NOT NULL, default 'VNPAY' | |
| txn_ref | varchar(100) | UNIQUE NOT NULL | bookingId (no dashes) for PAYMENT |
| amount | numeric(15,2) | NOT NULL | |
| status | varchar(20) | NOT NULL, default 'PENDING' | PENDING/SUCCESS/FAILED |
| raw_request | jsonb | NULL | VNPay params sent |
| raw_response | jsonb | NULL | VNPay callback params |
| created_at | timestamptz | NOT NULL | |
| updated_at | timestamptz | NOT NULL | |

**Indexes**: `(booking_id)`, UNIQUE `(txn_ref)`

**IPN idempotency**: UNIQUE on `txn_ref` + status check before processing.

---

## Entity 6 — FnbOrder

**Table**: `fnb_orders`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK | |
| booking_id | uuid | FK bookings(id) NOT NULL | |
| order_type | varchar(20) | NOT NULL | PRE_ORDER / ON_SITE |
| total_amount | numeric(15,2) | NOT NULL, default 0 | |
| status | varchar(20) | NOT NULL, default 'PENDING' | |
| created_at | timestamptz | NOT NULL | |
| updated_at | timestamptz | NOT NULL | |

**Indexes**: `(booking_id)`

---

## Entity 7 — FnbOrderItem

**Table**: `fnb_order_items`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK | |
| fnb_order_id | uuid | FK fnb_orders(id) NOT NULL | |
| menu_item_id | uuid | FK menu_items(id) NOT NULL | |
| quantity | int | NOT NULL, check > 0 | |
| unit_price | numeric(15,2) | NOT NULL | Snapshot of price at order time |
| subtotal | numeric(15,2) | NOT NULL | quantity × unit_price |
| notes | text | NULL | Special instructions |
| created_at | timestamptz | NOT NULL | |

**Indexes**: `(fnb_order_id)`

---

## Entity Relationships

```
users (1) ──── (N) bookings (via customer_id)
cafes (1) ──── (N) bookings (via cafe_id)
bookings (1) ── (N) booking_participants
bookings (1) ── (N) booking_vehicles ── (1) vehicles
bookings (1) ── (N) payment_components
booking_vehicles (1) ── (N) payment_components (vehicle-specific components)
bookings (1) ── (N) payment_transactions
bookings (1) ── (0..1) fnb_orders (PRE_ORDER type)
fnb_orders (1) ── (N) fnb_order_items ── (1) menu_items
promotions (1) ── (N) bookings (optional discount)
```

---

## Booking State Transitions

```
                 [PAYMENT_CONFIRMED via VNPay]
PENDING ─────────────────────────────────────► CONFIRMED
   │                                                │
   │ [PAYMENT_TIMEOUT after 30 min]                 │ [CUSTOMER_CANCEL]
   ▼                                                │ [PROVIDER_CANCEL]
CANCELLED ◄─────────────────────────────────────────┘

CONFIRMED ──► NO_SHOW   (Phase 2 — slot_start + 30 min no check-in)
CONFIRMED ──► COMPLETED (Phase 2 — all sessions done)
```

**Valid events for Phase 1**:
- `PAYMENT_CONFIRMED` — PENDING → CONFIRMED
- `PAYMENT_TIMEOUT` — PENDING → CANCELLED
- `CUSTOMER_CANCEL` — CONFIRMED → CANCELLED
- `PROVIDER_CANCEL` — CONFIRMED → CANCELLED

All transitions must go through `BookingService.transition(bookingId, event)` — never direct status updates.

---

## BYOC Capacity Check

`cafe.byoc_capacity` (int, default 5) — max simultaneous BYOC bookings per slot.

Redis counter: `slot:byoc:{cafeId}:{slotStartEpoch}` — INCR on lock, DECR on release.
DB query for availability display: `COUNT(bookings) WHERE cafe_id AND play_mode IN ('BYOC','MIXED') AND slot_start = ? AND status IN ('PENDING','CONFIRMED')`.
