# Data Model: Customer Package Purchase & Booking

**Feature**: `specs/009-customer-package-booking/spec.md`
**Date**: 2026-06-11
**Status**: Complete

---

## New Entity: CustomerPackage

Table: `customer_packages`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `uuid` | PK, default gen_random_uuid() | |
| `customer_id` | `uuid` | NOT NULL, FK → `users(id)` | Owner |
| `package_id` | `uuid` | NOT NULL, FK → `packages(id)` | Source template |
| `cafe_id` | `uuid` | NOT NULL, FK → `cafes(id)` | Denormalized for fast lookup — matches `packages.cafe_id` |
| `slots_total` | `int` | NOT NULL | Snapshot of `packages.slot_count` at purchase time |
| `slots_remaining` | `int` | NOT NULL, CHECK ≥ 0 | Decremented on each CONFIRMED booking |
| `expires_at` | `timestamptz` | NOT NULL | `purchase_confirmed_at + packages.valid_days days` |
| `status` | `varchar(20)` | NOT NULL, default `PENDING_PAYMENT` | `CustomerPackageStatus` enum |
| `purchased_price` | `numeric(15,2)` | NOT NULL | Snapshot of `packages.price` at purchase time |
| `package_name_snapshot` | `varchar(255)` | NOT NULL | Snapshot of `packages.name` at purchase time |
| `created_at` | `timestamptz` | NOT NULL, default now() | |
| `updated_at` | `timestamptz` | NOT NULL, default now() | |

**Indexes**:
- `IDX_customer_packages_customer_id` on `(customer_id)`
- `IDX_customer_packages_cafe_id_status` on `(cafe_id, status)`
- `IDX_customer_packages_status_expires_at` on `(status, expires_at)` — for expiry cron

**Relationships**:
- `customer_packages` →many-to-one→ `users` (via `customer_id`)
- `customer_packages` →many-to-one→ `packages` (via `package_id`)
- `customer_packages` →many-to-one→ `cafes` (via `cafe_id`)
- `customer_packages` →one-to-many→ `bookings` (via `bookings.customer_package_id`)

---

## New Enum: CustomerPackageStatus

Add to `src/types/index.ts`:

```typescript
export enum CustomerPackageStatus {
  PENDING_PAYMENT = 'PENDING_PAYMENT', // created, awaiting IPN
  ACTIVE          = 'ACTIVE',          // paid and usable
  EXHAUSTED       = 'EXHAUSTED',       // slots_remaining = 0
  EXPIRED         = 'EXPIRED',         // expires_at < NOW(), still had slots
}
```

State transitions:
```
PENDING_PAYMENT → ACTIVE       (IPN success: activateCustomerPackage)
ACTIVE          → EXHAUSTED    (deductSlots: slots_remaining hits 0)
ACTIVE          → EXPIRED      (daily cron: expires_at < NOW() AND slots_remaining > 0)
EXHAUSTED       → terminal
EXPIRED         → terminal
```

---

## New Enum value: PaymentComponentType.PACKAGE_PURCHASE

Add to `src/types/index.ts` under `PaymentComponentType`:

```typescript
PACKAGE_PURCHASE = 'PACKAGE_PURCHASE',
```

---

## Modified Entity: Booking

Table: `bookings` — add one nullable column

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `customer_package_id` | `uuid` | nullable, FK → `customer_packages(id)` | Null if no package applied |

**Index**: `IDX_bookings_customer_package_id` on `(customer_package_id)` (sparse — most rows NULL).

---

## Modified Entity: PaymentTransaction

Table: `payment_transactions` — make `booking_id` nullable, add `customer_package_id`

| Column | Change | Notes |
|--------|--------|-------|
| `booking_id` | `NOT NULL` → `nullable` | Package purchases have no booking |
| `customer_package_id` | ADD `uuid nullable`, FK → `customer_packages(id)` | Null for booking payments |

**Check constraint** (exactly one source):
```sql
CONSTRAINT chk_payment_tx_source
  CHECK (
    (booking_id IS NOT NULL)::int + (customer_package_id IS NOT NULL)::int = 1
  )
```

**Index**: `IDX_payment_transactions_customer_package_id` on `(customer_package_id)`.

---

## Modified Interface: BookingSnapshot

Extend `BookingSnapshot` in `src/services/payment.service.ts` with optional `package_used` field:

```typescript
package_used?: {
  customer_package_id: string;
  package_id:          string;
  package_name:        string;
  slots_used:          number;
};
```

Written at `createCheckoutUrl` time (or direct-confirm time for zero-total). Never updated after written.

---

## Migration Plan

Single migration file: `src/migrations/1750300000000-CustomerPackages.ts`

**Up** (idempotent — all `IF NOT EXISTS`):
1. Create `customer_packages` table
2. Add `bookings.customer_package_id` nullable FK
3. Make `payment_transactions.booking_id` nullable
4. Add `payment_transactions.customer_package_id` nullable FK
5. Add `chk_payment_tx_source` CHECK constraint
6. Create all new indexes

**Down**:
Reverse in order — drop CHECK constraint, drop FKs, drop column additions, drop `customer_packages` table.

---

## Entity Diagram

```
packages (existing)
  └──< customer_packages (NEW)
         ├── customer_id  →  users
         ├── cafe_id      →  cafes
         └──< bookings.customer_package_id (nullable FK)

payment_transactions (modified)
  ├── booking_id          → bookings (nullable)
  └── customer_package_id → customer_packages (nullable)
  [CHECK: exactly one non-null]
```
