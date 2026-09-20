# Tasks: Customer Package Purchase & Booking

**Input**: Design documents from `specs/009-customer-package-booking/`
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/api.md ✓, quickstart.md ✓

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4)
- Exact file paths are included in all descriptions

---

## Phase 1: Setup

**Purpose**: Verify project is ready — no new project initialization needed (existing Express monolith).

- [x] T001 Confirm `rcfeild-be` compiles cleanly: run `npm run build` from `rcfeild-be/` and fix any pre-existing TypeScript errors before starting

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Types, entities, and migration that ALL four user stories depend on. Nothing else can start until T007 completes.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T002 Add `CustomerPackageStatus` enum (PENDING_PAYMENT, ACTIVE, EXHAUSTED, EXPIRED) to `rcfeild-be/src/types/index.ts` under the `// ── Payment` section
- [x] T003 Add `PACKAGE_PURCHASE = 'PACKAGE_PURCHASE'` to `PaymentComponentType` enum in `rcfeild-be/src/types/index.ts`
- [x] T004 [P] Create `rcfeild-be/src/models/customer-package.entity.ts` — `CustomerPackage` entity with columns: `id`, `customer_id`, `package_id`, `cafe_id`, `slots_total`, `slots_remaining`, `expires_at`, `status` (CustomerPackageStatus), `purchased_price`, `package_name_snapshot`, `created_at`, `updated_at`; indexes on `(customer_id)`, `(cafe_id, status)`, `(status, expires_at)`
- [x] T005 [P] Add nullable `customerPackageId` UUID column (`customer_package_id`) to `rcfeild-be/src/models/booking.entity.ts`
- [x] T006 [P] Modify `rcfeild-be/src/models/payment-transaction.entity.ts` — make `bookingId` column nullable (`nullable: true`), add nullable `customerPackageId` UUID column (`customer_package_id`)
- [x] T007 Write migration `rcfeild-be/src/migrations/1750300000000-CustomerPackages.ts` — idempotent up/down: (1) CREATE TABLE `customer_packages` with all columns + indexes, (2) ADD COLUMN `bookings.customer_package_id` nullable FK, (3) ALTER `payment_transactions.booking_id` DROP NOT NULL, (4) ADD COLUMN `payment_transactions.customer_package_id` nullable FK, (5) ADD CONSTRAINT `chk_payment_tx_source` CHECK that exactly one of `booking_id`/`customer_package_id` is non-null
- [x] T008 Run migration: `cd rcfeild-be && npm run migration:run` — verify no errors and `customer_packages` table exists

**Checkpoint**: Foundation ready — all four user stories can now be implemented

---

## Phase 3: User Story 1 — Browse & Purchase Package (Priority: P1) 🎯 MVP

**Goal**: Customer can view ACTIVE packages for a cafe and purchase one via VNPay. After IPN callback, `CustomerPackage` is ACTIVE with correct `slots_remaining` and `expires_at`.

**Independent Test**: Seed one Package record with status=ACTIVE → `GET /api/v1/cafes/:cafeId/packages/public` returns it → `POST /cafes/:cafeId/packages/:packageId/purchase` (auth as CUSTOMER) returns VNPay URL → simulate IPN → `CustomerPackage.status = ACTIVE`, `slots_remaining = package.slot_count`

### Implementation for User Story 1

- [x] T009 [P] [US1] Create `rcfeild-be/src/services/customer-package.service.ts` with stub exports and implement `purchasePackage(cafeId, packageId, viewer)`: validate package exists + ACTIVE, create `CustomerPackage` with `status=PENDING_PAYMENT`, create `PaymentTransaction` with `customerPackageId` set (and `bookingId` null), generate VNPay txnRef + URL, return `{ customer_package_id, payment_url, txn_ref, amount, expires_at }`
- [x] T010 [P] [US1] Add `getPublicPackages(cafeId)` function to `rcfeild-be/src/services/package.service.ts` — query packages WHERE `cafeId = :cafeId AND status = ACTIVE`, return public-safe fields only (exclude cost_price / internal fields)
- [x] T011 [US1] Add `PurchasePackageSchema = z.object({})` to `rcfeild-be/src/validate/index.ts` under `// ── customer_packages` section
- [x] T012 [US1] Create `rcfeild-be/src/controllers/customer-package.controller.ts` — add `purchasePackage` handler: validate path params, call `customer-package.service.purchasePackage`, return 200
- [x] T013 [US1] Add `GET /api/v1/cafes/:cafeId/packages/public` route (no auth middleware) to `rcfeild-be/src/routes/cafe.routes.ts` — wire to `getPublicPackages` service or new cafe controller method
- [x] T014 [US1] Create `rcfeild-be/src/routes/customer-package.routes.ts` — add `POST /api/v1/cafes/:cafeId/packages/:packageId/purchase` with `authenticate` + `authorize(UserRole.CUSTOMER)` middleware, wired to `customerPackageController.purchasePackage`
- [x] T015 [US1] Register `customer-package.routes.ts` in `rcfeild-be/src/app.ts` (or wherever routes are mounted)
- [x] T016 [US1] Add `activateCustomerPackage(customerPackageId: string, queryRunner?: QueryRunner)` to `rcfeild-be/src/services/customer-package.service.ts` — set `status=ACTIVE`, compute `expires_at = now() + validDays days` (read `validDays` from joined `packages` row), save
- [x] T017 [US1] Modify `processConfirmation` in `rcfeild-be/src/services/payment.service.ts` — after txnRef lookup: if `tx.customerPackageId != null` → call `activateCustomerPackage(tx.customerPackageId)` + mark `tx.status = SUCCESS`; else → existing booking confirmation branch (D2 from research.md)

**Checkpoint**: US1 fully functional — customer can purchase a package and see it activated after VNPay IPN

---

## Phase 4: User Story 2 — Apply Package When Booking (Priority: P2)

**Goal**: Customer applies an owned ACTIVE package during booking creation. `slot_fee = 0` in line items. If total = 0, booking is confirmed immediately (no VNPay). If total > 0, VNPay handles rental/deposit/FnB. Slots deducted on CONFIRMED.

**Independent Test**: Use a CUSTOMER with an ACTIVE package (5 slots) at cafe X → POST /bookings with `customer_package_id` for a 2h BYOC booking (no FnB, no rental) → response: `{payment_url: null, confirmed: true}` → verify `CustomerPackage.slots_remaining = 3`; then try same with RENTAL booking → VNPay URL returned → IPN → slots_remaining decrements

### Implementation for User Story 2

- [x] T018 [P] [US2] Extend `BookingSnapshot` interface in `rcfeild-be/src/services/payment.service.ts` — add optional field `package_used?: { customer_package_id: string; package_id: string; package_name: string; slots_used: number }`
- [x] T019 [P] [US2] Add `customer_package_id: z.string().uuid().optional()` to `CreateBookingSchema` in `rcfeild-be/src/validate/index.ts`; add `ListMyPackagesQuerySchema` with optional `status` and `cafe_id` fields
- [x] T020 [US2] Add `deductSlots(customerPackageId: string, slotsUsed: number, queryRunner: QueryRunner)` to `rcfeild-be/src/services/customer-package.service.ts` — `SELECT ... FOR UPDATE` on `customer_packages`, decrement `slots_remaining`, set `status=EXHAUSTED` if reaches 0, save within transaction (D4 from research.md)
- [x] T021 [US2] Modify `CreateBookingBody` interface and `createBooking` in `rcfeild-be/src/services/booking.service.ts`: accept `customer_package_id?`; when provided: load and validate package (ownership, cafe match, applicable_play_modes, status=ACTIVE, expires_at > now, slots_remaining ≥ slots_needed); compute `slots_needed = ceil((slotEnd - slotStart in minutes) / cafe.slotDurationMinutes)`; set `slotFee = 0`; write `package_used` into the snapshot payload; store `customer_package_id` on the `Booking` entity before save
- [x] T022 [US2] Modify `createCheckoutUrl` in `rcfeild-be/src/services/payment.service.ts` — after computing `totalCharged`: if `totalCharged === 0` AND package applied → skip VNPay URL; inline-confirm the booking (create DISBURSED payment components, call `transition(bookingId, 'PAYMENT_CONFIRMED')`, call `deductSlots` via `queryRunner`); return `{ payment_url: null, confirmed: true, booking_id, slots_used, slots_remaining_after }` (D3 from research.md)
- [x] T023 [US2] Modify `processConfirmation` in `rcfeild-be/src/services/payment.service.ts` (booking branch) — after booking transitions to CONFIRMED: if `booking.snapshot.package_used` exists → call `deductSlots(package_used.customer_package_id, package_used.slots_used, queryRunner)` (D4 from research.md)
- [x] T024 [US2] Modify `processMockConfirmation` in `rcfeild-be/src/services/payment.service.ts` — add same `deductSlots` call as T023

**Checkpoint**: US2 functional — bookings with package applied work for both zero-total (inline confirm) and non-zero-total (VNPay) paths

---

## Phase 5: User Story 3 — View My Packages (Priority: P3)

**Goal**: Customer sees all owned packages with `slots_remaining`, `expires_at`, status, and per-package booking history.

**Independent Test**: After running US1 scenario (buy package) + US2 scenario (use package in 2 bookings) → `GET /customers/me/packages` shows correct `slots_remaining`; `GET /customers/me/packages/:id/usage` shows 2 usage entries

### Implementation for User Story 3

- [x] T025 [P] [US3] Add `listMyPackages(customerId: string, query: { status?, cafe_id? })` to `rcfeild-be/src/services/customer-package.service.ts` — query `customer_packages` JOIN `cafes` WHERE `customer_id = :customerId`; apply optional filters; order by `created_at DESC`; return array with `cafe_name`, `package_name`, `slots_total`, `slots_remaining`, `expires_at`, `status`, `purchased_price`
- [x] T026 [P] [US3] Add `getPackageUsageHistory(customerPackageId: string, customerId: string)` to `rcfeild-be/src/services/customer-package.service.ts` — verify ownership, query `bookings WHERE customer_package_id = :customerPackageId` JOIN cafes, return `booking_id`, `slot_start`, `slot_end`, `slots_used` (from `snapshot.package_used.slots_used`), `cafe_name`, `booking_status`
- [x] T027 [US3] Add `listMyPackages` and `getUsageHistory` handlers to `rcfeild-be/src/controllers/customer-package.controller.ts` — validate query with `ListMyPackagesQuerySchema`, call service methods, return 200
- [x] T028 [US3] Add routes to `rcfeild-be/src/routes/customer-package.routes.ts`: `GET /api/v1/customers/me/packages` and `GET /api/v1/customers/me/packages/:customerPackageId/usage` — both require `authenticate` + `authorize(UserRole.CUSTOMER)`

**Checkpoint**: US3 functional — customer can see all packages and per-package usage history

---

## Phase 6: User Story 4 — Slot Refund on Cancellation (Priority: P4)

**Goal**: When a booking that used a package is cancelled before `slot_start`, slots are returned to the `CustomerPackage`. No refund if cancelled after `slot_start` or on NO_SHOW.

**Independent Test**: CONFIRMED booking with 2 slots deducted (slots_remaining=3) and `slotStart` tomorrow → cancel → `slots_remaining = 5`; then: CONFIRMED booking with `slotStart` in the past → cancel → `slots_remaining` unchanged

### Implementation for User Story 4

- [x] T029 [US4] Add `refundSlots(customerPackageId: string, slotsUsed: number, queryRunner: QueryRunner)` to `rcfeild-be/src/services/customer-package.service.ts` — `SELECT ... FOR UPDATE`, increment `slots_remaining`, restore `status = ACTIVE` if was EXHAUSTED (spec FR-015 — refund to exhausted package is valid per edge case), save within transaction
- [x] T030 [US4] Modify `cancelBooking` in `rcfeild-be/src/services/booking.service.ts` — after `transition(bookingId, 'CUSTOMER_CANCEL')` or `'PROVIDER_CANCEL'`: read `booking.snapshot?.package_used`; if present AND `booking.slotStart > new Date()` → call `refundSlots(package_used.customer_package_id, package_used.slots_used)` within DB transaction (D5 from research.md)

**Checkpoint**: All 4 user stories functional — full feature complete

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Expiry cron + verification pass

- [x] T031 [P] Create `rcfeild-be/src/jobs/package-expiry.job.ts` — daily cron (00:05 VN time) that batch-queries `customer_packages WHERE status = 'ACTIVE' AND expires_at < NOW()` and bulk-updates to `status = 'EXPIRED'`; follow pattern from `subscription-lifecycle.job.ts`
- [x] T032 [P] Register `package-expiry.job.ts` in the cron setup file (wherever `subscription-lifecycle.job.ts` is registered, e.g. `src/jobs/index.ts` or `src/app.ts`)
- [x] T033 Verify all error codes from `contracts/api.md` are thrown correctly: `PACKAGE_NOT_FOUND`, `PACKAGE_INACTIVE`, `PACKAGE_INSUFFICIENT_SLOTS`, `PACKAGE_EXPIRED`, `PACKAGE_CAFE_MISMATCH`, `PACKAGE_PLAY_MODE_MISMATCH`, `CUSTOMER_PACKAGE_NOT_FOUND`
- [x] T034 Add controller comment headers per `rcfeild-be/CLAUDE.md` convention to all new handlers in `src/controllers/customer-package.controller.ts` (format: `// METHOD /api/v1/path  [auth]`)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 — **BLOCKS all user stories**
- **US1 (Phase 3)**: Depends on Phase 2 — can start once migration runs
- **US2 (Phase 4)**: Depends on Phase 2 + partially on US1 (needs `activateCustomerPackage` for IPN routing)
- **US3 (Phase 5)**: Depends on Phase 2 only — reads existing data, no new mutations
- **US4 (Phase 6)**: Depends on Phase 2 + US2 (needs `snapshot.package_used` written by booking flow)
- **Polish (Phase 7)**: Depends on all user stories complete

### User Story Dependencies

- **US1 (P1)**: Unblocked after Phase 2 — no story dependencies
- **US2 (P2)**: Needs US1's `activateCustomerPackage` (for the IPN routing change in T017) before T023 can be tested end-to-end; T021/T022 (booking flow) can be coded in parallel
- **US3 (P3)**: Fully independent of US1/US2 — reads data written by other stories but can be coded/tested with seeded data
- **US4 (P4)**: Needs US2's `snapshot.package_used` field (T018 + T021) to be in place before the refund hook makes sense

### Within Each User Story

- Models before services
- Services before controllers
- Controllers before routes
- Core service logic before integration hooks

### Parallel Opportunities

- T004, T005, T006 (entity files) — different files, run together
- T009, T010 (new service + listing logic) — different files, run together
- T018, T019 (snapshot interface + schema extension) — different files, run together
- T025, T026 (two new service methods for US3) — different files, run together
- T031, T032 (cron creation + registration) — run together

---

## Parallel Example: Phase 2 (Foundation)

```
# Run together (different files):
Task T004: Create customer-package.entity.ts
Task T005: Modify booking.entity.ts (add customerPackageId)
Task T006: Modify payment-transaction.entity.ts (nullable bookingId, add customerPackageId)

# Then sequential:
Task T007: Write migration (depends on T004-T006)
Task T008: Run migration (depends on T007)
```

## Parallel Example: User Story 2

```
# Run together (different files):
Task T018: Extend BookingSnapshot interface in payment.service.ts
Task T019: Add customer_package_id to CreateBookingSchema in validate/index.ts

# Then sequential:
Task T020: deductSlots in customer-package.service.ts (new method, no conflicts)
Task T021: Modify createBooking in booking.service.ts (depends on T018, T019)
Task T022: Modify createCheckoutUrl in payment.service.ts (depends on T020, T021)
Task T023: Modify processConfirmation in payment.service.ts (depends on T020)
Task T024: Modify processMockConfirmation (same file as T022/T023 — sequential)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001)
2. Complete Phase 2: Foundational (T002–T008) — run migration
3. Complete Phase 3: User Story 1 (T009–T017)
4. **STOP and VALIDATE**: Public package listing + purchase + IPN activation works
5. Demo: customer sees packages, buys one, package becomes ACTIVE

### Incremental Delivery

1. Setup + Foundational → types/entity/migration in place
2. US1 → customer can buy packages (MVP)
3. US2 → packages can be applied to bookings (core value)
4. US3 → customer can view owned packages (UX)
5. US4 → slot refund on cancellation (edge case polish)
6. Polish → expiry cron + verification

---

## Notes

- All new code must follow `rcfeild-be/CLAUDE.md` conventions: controller comment headers, `logger` not `console.log`, zod schemas in `src/validate/index.ts`, enums in `src/types/index.ts`
- `deductSlots` and `refundSlots` MUST use `SELECT ... FOR UPDATE` (pessimistic lock) — race condition protection per SC-004
- `snapshot.package_used.slots_used` is the authoritative value for deduction/refund — never recompute from current booking duration (Constitution Principle I)
- Zero-total booking bypass (T022) must NOT call VNPay — VNPay rejects amount=0
- `checkPaymentExpiry` job must not be modified — existing timeout handles PENDING bookings regardless of package
