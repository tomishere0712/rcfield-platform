# Tasks: Booking & Payment Flow

**Input**: Design documents from `specs/007-booking-payment/`  
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Contracts**: [contracts/api.md](contracts/api.md)

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on each other)
- **[Story]**: Maps to user story (US1–US4)
- Constitution Principle V requires **TDD** for all financial + state-machine logic — test tasks in Phase 3 must fail before implementation begins

---

## Phase 1: Setup

**Purpose**: Nothing to scaffold (project exists). Confirm environment prerequisites are in place.

- [X] T001 Verify Redis connection config in `rcfeild-be/src/config/env.ts` — confirm `env.redis.*` and `env.platform.*` values are set and ioredis client is exported from `rcfeild-be/src/config/redis.ts` (create the file if it doesn't exist yet)
- [X] T002 Verify VNPay sandbox config in `rcfeild-be/src/config/env.ts` — confirm `env.vnpay.tmnCode`, `env.vnpay.hashSecret`, `env.vnpay.paymentUrl`, `env.vnpay.returnUrl`, `env.vnpay.ipnUrl` are all set for sandbox

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Migration, all 7 entities, enum updates, and validation schemas that every user story depends on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T003 Add new enum values to `rcfeild-be/src/types/index.ts`: update `BookingStatus` to Phase 1 clean set (PENDING/CONFIRMED/CANCELLED/NO_SHOW/COMPLETED — remove Phase 2 states ACTIVE/EXTENDING/CHECKING_OUT/DISPUTED from the enum; add `BookingParticipantType` (BOOKER/REGISTERED_USER/WALK_IN_GUEST), `PaymentTransactionType` (PAYMENT/REFUND), `PaymentTransactionStatus` (PENDING/SUCCESS/FAILED), `FnbOrderType` (PRE_ORDER/ON_SITE), `FnbOrderStatus` (PENDING/CONFIRMED/CANCELLED)
- [X] T004 Create TypeORM migration `rcfeild-be/src/migrations/{timestamp}-BookingPayment.ts` with `up()` creating all 7 tables: `bookings`, `booking_participants`, `booking_vehicles`, `payment_components`, `payment_transactions`, `fnb_orders`, `fnb_order_items` — with FK constraints, indexes and UNIQUE constraint on `payment_transactions.txn_ref` as defined in data-model.md; `down()` drops all 7 tables in reverse dependency order
- [X] T005 [P] Create `rcfeild-be/src/models/booking.entity.ts` — TypeORM entity for `bookings` table with all columns from data-model.md: id, customer_id, cafe_id, play_mode, source, status, slot_start, slot_end, payment_expires_at, snapshot (jsonb), promotion_id, discount_amount, cancellation_reason, cancelled_by, cancelled_at, created_at, updated_at, deleted_at; add @Index decorators per data-model.md
- [X] T006 [P] Create `rcfeild-be/src/models/booking-participant.entity.ts` — TypeORM entity for `booking_participants` with columns: id, booking_id, user_id (nullable), participant_type, is_primary_responsible, guest_name (nullable), guest_phone (nullable), created_at, updated_at
- [X] T007 [P] Create `rcfeild-be/src/models/booking-vehicle.entity.ts` — TypeORM entity for `booking_vehicles` with columns: id, booking_id, vehicle_id, rental_fee_snapshot, security_deposit_snapshot, damage_multiplier_snapshot, created_at, updated_at
- [X] T008 [P] Create `rcfeild-be/src/models/payment-component.entity.ts` — TypeORM entity for `payment_components` with columns: id, booking_id, booking_vehicle_id (nullable), type (PaymentComponentType enum), amount (numeric — do NOT add setter to allow mutation), status (PaymentComponentStatus), refunded_amount, disbursed_at, refunded_at, created_at, updated_at
- [X] T009 [P] Create `rcfeild-be/src/models/payment-transaction.entity.ts` — TypeORM entity for `payment_transactions` with columns: id, booking_id, type (PaymentTransactionType), gateway, txn_ref (UNIQUE), amount, status (PaymentTransactionStatus), raw_request (jsonb nullable), raw_response (jsonb nullable), created_at, updated_at
- [X] T010 [P] Create `rcfeild-be/src/models/fnb-order.entity.ts` — TypeORM entity for `fnb_orders` with columns: id, booking_id, order_type (FnbOrderType), total_amount, status (FnbOrderStatus), created_at, updated_at
- [X] T011 [P] Create `rcfeild-be/src/models/fnb-order-item.entity.ts` — TypeORM entity for `fnb_order_items` with columns: id, fnb_order_id, menu_item_id, quantity, unit_price, subtotal, notes (nullable), created_at
- [X] T012 Register all 7 new entities in the TypeORM DataSource entities array in `rcfeild-be/src/config/database.ts` (or wherever AppDataSource is configured)
- [X] T013 Create Zod validation schemas in `rcfeild-be/src/validate/booking.validate.ts`: `CreateBookingSchema` (cafe_id, play_mode, slot_start, slot_end, vehicle_ids, participants, fnb_items, promotion_code optional), `CreateCheckoutSchema` (empty body), `CancelBookingSchema` (reason), `ListCafeBookingsSchema` (date, status optional, page, limit)

**Checkpoint**: Run migration (`npm run migration:run`) — 7 new tables created. TypeScript compiles without errors.

---

## Phase 3: User Story 1 — Customer RENTAL Booking (P1) 🎯 MVP

**Goal**: Customer can create a RENTAL booking, pay via VNPay sandbox, booking → CONFIRMED with payment components HELD.

**Independent Test**: Login as customer → `POST /bookings` (RENTAL, 1 vehicle) → `POST /bookings/:id/checkout` → pay in VNPay sandbox → redirect to `/payment/result` → booking shows CONFIRMED with 3 PaymentComponents HELD.

### TDD — Write Failing Tests FIRST (Constitution Principle V) ⚠️

> **Write these tests before implementing services. Confirm tests FAIL, then implement.**

- [X] T014 [P] [US1] Write failing unit tests for `BookingService.canTransition()` covering all valid transitions (PENDING→CONFIRMED, PENDING→CANCELLED) and all invalid transitions (CANCELLED→CONFIRMED, CONFIRMED→PENDING) in `rcfeild-be/src/__tests__/services/booking.service.test.ts` — mock AppDataSource, expect `INVALID_BOOKING_STATE` error on invalid transitions
- [X] T015 [P] [US1] Write failing unit tests for refund rule calculations in `rcfeild-be/src/__tests__/services/payment.service.test.ts`: R1 (>24h → 100% slot fee, 12-24h → 50% slot fee, <12h → 0% slot fee — all return 100% rental + 100% deposit), R2 (provider cancel → 100% all), R3 (no-show → 0% slot fee + 100% rest) — pure functions, no DB mocks needed

### Backend — US1

- [X] T016 [US1] Implement `rcfeild-be/src/services/booking.service.ts` with: `canTransition(current: BookingStatus, event: string): boolean`, `transition(bookingId: string, event: string): Promise<Booking>` (validate → update status in DB transaction → release Redis lock on CANCELLED), `createBooking(customerId: string, body: CreateBookingBody): Promise<Booking>` for RENTAL path — validate cafe ACTIVE, check vehicle availability via Redis SET NX EX 1800, create Booking (PENDING) + BookingParticipants + BookingVehicles + FnbOrder/Items in one DB transaction, calculate price breakdown from live prices (snapshot written later at CONFIRMED)
- [X] T017 [US1] Implement `rcfeild-be/src/services/payment.service.ts` with: `createPaymentComponents(booking: Booking): Promise<void>` — creates SLOT_FEE + RENTAL_FEE + SECURITY_DEPOSIT (+ FNB_PREORDER if fnb_total > 0) all with status HELD in one DB transaction; `processConfirmation(txnRef: string, vnpParams: Record<string, string>): Promise<void>` — idempotent: check PaymentTransaction status, if already SUCCESS return early, else `BookingService.transition(bookingId, 'PAYMENT_CONFIRMED')` + `createPaymentComponents()` + write `booking.snapshot` + UPDATE PaymentTransaction to SUCCESS — all in one DB transaction; `calculateBookingSnapshot(booking: Booking): BookingSnapshot` — reads live prices at confirmation time and returns snapshot object
- [X] T018 [US1] Update `rcfeild-be/src/controllers/vnpay.controller.ts` — `handleVnpayIpn`: call `PaymentService.processConfirmation(vnp_TxnRef, allParams)`, catch errors, always return `{ RspCode, Message }` per VNPay spec; `handleVnpayReturn`: call `PaymentService.processConfirmation(...)` then redirect to `${env.frontendUrl}/payment/result?status=success&bookingId=...` on success or `?status=failed&reason=...` on failure
- [X] T019 [US1] Implement `rcfeild-be/src/controllers/booking.controller.ts` with handlers: `createBooking` (validate + call BookingService.createBooking), `createCheckout` (find PENDING booking owned by requester, create PaymentTransaction PENDING with txn_ref = bookingId-no-dashes, call vnpayService.createPaymentUrl, return payment_url), `getBooking` (fetch with participants + vehicles + payment_components + fnb_order — check ownership or staff/provider access), `listMyBookings` (paginated, filter by status)
- [X] T020 [US1] Create `rcfeild-be/src/routes/booking.routes.ts` with routes: `POST /` → authenticate + authorize(CUSTOMER) → createBooking; `GET /` → authenticate + authorize(CUSTOMER) → listMyBookings; `GET /:id` → authenticate → getBooking; `POST /:id/checkout` → authenticate + authorize(CUSTOMER) → createCheckout; mount router in app.ts as `/api/v1/bookings`
- [X] T021 [US1] Add `GET /cafes/:cafeId/availability` handler to `rcfeild-be/src/controllers/cafe.controller.ts` (or create `availability.controller.ts`) — query params: slot_start, slot_end, play_mode; check cafe ACTIVE; for RENTAL: query vehicles WHERE cafe_id AND status=AVAILABLE, check Redis slot locks; return available vehicles with rental_fee + security_deposit from VehicleCatalog; add route to `rcfeild-be/src/routes/cafe.routes.ts`
- [X] T022 [US1] Create `rcfeild-be/src/jobs/booking-timeout.job.ts` — `scheduleBookingTimeout(): void` using `cron.schedule('* * * * *', ...)` — query `bookings WHERE status='PENDING' AND payment_expires_at < NOW()`, for each call `BookingService.transition(id, 'PAYMENT_TIMEOUT')` which releases Redis slot lock; register in `rcfeild-be/src/server.ts` alongside other jobs

### Frontend — US1

- [X] T023 [P] [US1] Create `rcfield-fe/src/features/booking/types/booking.types.ts` — TypeScript interfaces: `CreateBookingBody`, `BookingResponse`, `BookingListItem`, `CheckoutResponse`, `PaymentComponentResponse`, `AvailabilityResponse`, `BookingBreakdown`
- [X] T024 [P] [US1] Create `rcfield-fe/src/features/booking/api/booking.api.ts` — axios calls: `checkAvailability(cafeId, params)`, `createBooking(body)`, `getBooking(id)`, `listMyBookings(params)`, `createCheckout(bookingId)`, `cancelBooking(id, reason)`; export `bookingQueryKeys` for React Query
- [X] T025 [P] [US1] Create `rcfield-fe/src/features/booking/hooks/use-booking.ts` — `useAvailability(cafeId, params)`, `useBooking(id)`, `useMyBookings(params)`, `useCreateBooking()` mutation, `useCreateCheckout()` mutation
- [X] T026 [US1] Update `rcfield-fe/src/pages/booking/CreateBookingPage.tsx` — replace mock `mockCafes` usage in payment step: on "Xác nhận đặt lịch" call `useCreateBooking()` mutation with real payload (cafeId, slotStart, slotEnd, playMode=RENTAL, vehicleIds, participants, fnbItems); on success call `useCreateCheckout()` to get payment_url; redirect window to payment_url; keep existing ScheduleStep/ParticipantsStep/FnbStep UI intact — only wire the final payment action
- [X] T027 [US1] Update `rcfield-fe/src/pages/booking/PaymentResultPage.tsx` — read URL query params (`status`, `bookingId`) from VNPay return redirect; if `status=success` show CONFIRMED state and fetch booking detail via `useBooking(bookingId)` to display breakdown; if `status=failed` show retry option
- [X] T028 [US1] Update `rcfield-fe/src/pages/booking/BookingDetailPage.tsx` — replace mock data with `useBooking(id)` from React Query; display payment_components breakdown table (type, amount, status); show payment_expires_at countdown for PENDING bookings
- [X] T029 [US1] Update `rcfield-fe/src/pages/customer/CustomerBookingsPage.tsx` — replace mock data with `useMyBookings()` hook; display status badge (PENDING/CONFIRMED/CANCELLED); navigate to BookingDetailPage on row click

**Checkpoint**: Full RENTAL booking flow works end-to-end in sandbox. All 5 unit tests in booking.service.test.ts pass. All 6 refund rule tests in payment.service.test.ts pass.

---

## Phase 4: User Story 2 — Customer BYOC Booking (P2)

**Goal**: Customer can create a BYOC booking (no vehicle selection), only slot_fee charged, BYOC capacity enforced.

**Independent Test**: Login as customer → `POST /bookings` (play_mode=BYOC, vehicle_ids=[]) → pay → CONFIRMED with only SLOT_FEE PaymentComponent. Second booking when capacity full → 400 BYOC_CAPACITY_FULL.

- [X] T030 [US2] Update `BookingService.createBooking` in `rcfeild-be/src/services/booking.service.ts` to handle `play_mode=BYOC`: skip vehicle availability check + BookingVehicle creation; instead INCR Redis BYOC counter `slot:byoc:{cafeId}:{slotStartEpoch}`, check counter ≤ `cafe.byoc_capacity`, DECR and throw `BYOC_CAPACITY_FULL` if exceeded; on timeout/cancel: DECR the counter
- [X] T031 [US2] Update `rcfeild-be/src/controllers/cafe.controller.ts` availability handler — for `play_mode=BYOC` query: return `byoc_remaining = cafe.byocCapacity - currentByocCount` (Redis counter), `available = byoc_remaining > 0`; no vehicles in response
- [X] T032 [US2] Update `rcfield-fe/src/pages/booking/CreateBookingPage.tsx` — enable BYOC mode selection in ScheduleStep: when `play_mode=BYOC` skip vehicle selection step, pass `vehicle_ids=[]` to createBooking call; show BYOC capacity indicator (`byoc_remaining` from availability response)

**Checkpoint**: BYOC booking creates CONFIRMED with only SLOT_FEE. BYOC counter increments correctly. Capacity check blocks over-limit bookings.

---

## Phase 5: User Story 3 — Provider/Staff View Bookings (P3)

**Goal**: Provider and Staff can view the booking list for a specific cafe filtered by date.

**Independent Test**: Create 2 CONFIRMED bookings at cafe X → login as Provider owning cafe X → `GET /provider/cafes/X/bookings?date=2026-06-15` → both bookings appear with customer name, slot time, play mode, status.

- [X] T033 [US3] Add `listCafeBookings(cafeId: string, query: ListCafeBookingsQuery): Promise<PaginatedResult>` to `rcfeild-be/src/services/booking.service.ts` — validate caller owns cafe (Provider) or is assigned to cafe (Staff — check staff_cafe_assignments); query bookings with joins to users (customer name/phone), booking_participants, booking_vehicles; filter by date (slot_start date), optional status
- [X] T034 [US3] Add `listCafeBookings` handler to `rcfeild-be/src/controllers/booking.controller.ts` — validate `ListCafeBookingsSchema`, call service, return paginated list
- [X] T035 [US3] Add route `GET /cafes/:cafeId/bookings` to `rcfeild-be/src/routes/provider-subscription.routes.ts` with `authenticate + authorize(PROVIDER, STAFF) + requireActiveProvider`; OR create `rcfeild-be/src/routes/provider-booking.routes.ts` and mount at `/api/v1/provider` — choose based on existing routing conventions
- [X] T036 [P] [US3] Create `rcfield-fe/src/pages/provider/ProviderBookingsPage.tsx` — date picker (default today), cafe selector if provider has multiple cafes; table showing booking rows: customer name, slot time, play mode, participants count, vehicle names, status badge, total charged; use React Query with `bookingQueryKeys.cafeList(cafeId, date)`; add to provider navigation

**Checkpoint**: Provider logs in, navigates to Bookings, selects a cafe and date, sees all bookings for that day.

---

## Phase 6: User Story 4 — Customer Cancellation (P4)

**Goal**: Customer can cancel a CONFIRMED booking with correct refund per 3-tier policy (R1). Provider can cancel for 100% refund (R2).

**Independent Test**: Create CONFIRMED booking → cancel in each time window → verify refund_amount matches R1 rule → check PaymentComponents updated to REFUNDED/PARTIALLY_REFUNDED.

- [X] T037 [US4] Implement `cancelBooking(bookingId: string, cancelledBy: string, role: UserRole, reason: string): Promise<CancelResult>` in `rcfeild-be/src/services/booking.service.ts` — validate booking is CONFIRMED; calculate refund using `PaymentService.calculateRefundAmount(booking, role)` which applies R1 (customer, 3 time windows based on `slot_start - now()`) or R2 (provider cancel → 100%); call `PaymentService.processRefund()` then `BookingService.transition(bookingId, role === PROVIDER ? 'PROVIDER_CANCEL' : 'CUSTOMER_CANCEL')`; return refund breakdown
- [X] T038 [US4] Implement `PaymentService.processRefund(bookingId: string, refundAmounts: RefundBreakdown): Promise<void>` in `rcfeild-be/src/services/payment.service.ts` — call VNPay refund API (`vnp_Command=refund`) with total refund amount; on VNPay success: UPDATE payment_components status (SLOT_FEE → PARTIALLY_REFUNDED if partial, REFUNDED if full; RENTAL_FEE → REFUNDED; SECURITY_DEPOSIT → REFUNDED; FNB_PREORDER → REFUNDED) in DB transaction; on VNPay failure: throw AppError so entire cancellation rolls back
- [X] T039 [US4] Add `cancelBooking` handler to `rcfeild-be/src/controllers/booking.controller.ts` — validate `CancelBookingSchema`, check ownership (CUSTOMER must own booking, PROVIDER must own cafe), call service, return refund breakdown
- [X] T040 [US4] Add route `POST /bookings/:id/cancel` to `rcfeild-be/src/routes/booking.routes.ts` — authenticate + authorize(CUSTOMER, PROVIDER)
- [X] T041 [US4] Add cancel button + confirmation modal to `rcfield-fe/src/pages/booking/BookingDetailPage.tsx` — show only for CONFIRMED bookings; display estimated refund amount before confirming (call `GET /bookings/:id` and compute client-side from booking.snapshot + current time); call `cancelBooking` mutation on confirm; show refund breakdown in success state
- [X] T042 [US4] Add cancel action to `rcfield-fe/src/pages/provider/ProviderBookingsPage.tsx` — Provider can cancel any CONFIRMED booking in their cafe; show confirmation modal; 100% refund (R2)

**Checkpoint**: Customer cancels in each time window — refund amounts match R1 policy. Provider cancel → 100% refund. VNPay sandbox shows refund transactions.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T043 Add `scheduleBookingTimeout()` call to `rcfeild-be/src/server.ts` alongside existing job registrations (`scheduleQuotaReset`, `scheduleSubscriptionLifecycle`)
- [X] T044 Add `NO_SHOW` timeout transition to `BookingService`: query CONFIRMED bookings where `slot_start + 30 min < NOW()` and no session exists — transition to NO_SHOW; add to booking-timeout.job.ts (Phase 2 feature, but infra can be wired now)
- [X] T045 [P] Add input guard: prevent creating duplicate PENDING bookings for same customer + cafe + slot — check in `BookingService.createBooking` before Redis lock
- [ ] T046 [P] Run all 5 E2E test scenarios from `quickstart.md` manually in sandbox and fix any issues found

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 — **BLOCKS all user stories**
- **Phase 3 (US1)**: Depends on Phase 2 — TDD tests before service implementation
- **Phase 4 (US2)**: Depends on Phase 2 — can start after Phase 3 services exist (adds BYOC path to same service)
- **Phase 5 (US3)**: Depends on Phase 2 — independent of US1/US2 (separate list endpoint)
- **Phase 6 (US4)**: Depends on Phase 3 (needs `BookingService.transition()` and `PaymentService`) — adds cancel methods to existing services
- **Phase 7 (Polish)**: Depends on all user stories

### User Story Dependencies

- **US1 (P1)**: Foundational + own backend → frontend wiring. No dependency on US2–US4.
- **US2 (P2)**: US1 backend complete (reuses `booking.service.ts`, adds BYOC branch). Frontend: update CreateBookingPage only.
- **US3 (P3)**: Foundational only. Can be worked in parallel with US1 by second developer.
- **US4 (P4)**: US1 complete (needs `processConfirmation` + `PaymentTransaction`). Adds cancel flow on top.

### Parallel Opportunities Within US1

```
Phase 3 TDD (T014, T015) → run in parallel (different test files)
Phase 3 entities already done in Phase 2
Phase 3 services (T016, T017) → run in parallel (different service files)
Phase 3 frontend types+api+hooks (T023, T024, T025) → run in parallel (different files)
```

---

## Parallel Example: User Story 1 Backend

```
Agent 1: T014 — booking.service.test.ts (failing tests)
Agent 2: T015 — payment.service.test.ts (failing tests)
↓ (both done)
Agent 1: T016 — booking.service.ts
Agent 2: T017 — payment.service.ts
↓ (both done)
Agent 1: T018 — vnpay.controller.ts update
Agent 2: T019 — booking.controller.ts
↓ (both done)
Agent 1: T020 — booking.routes.ts
Agent 2: T021 — availability endpoint
Agent 3: T022 — booking-timeout.job.ts
```

---

## Implementation Strategy

### MVP First (US1 Only — RENTAL booking end-to-end)

1. Complete Phase 1 + Phase 2 (migration + entities + enums)
2. Complete Phase 3 TDD: write failing tests (T014, T015)
3. Implement services (T016, T017), confirm tests now pass
4. Wire VNPay + controller + routes (T018–T022)
5. Wire frontend (T023–T029)
6. **STOP AND VALIDATE**: Run Scenario 1 from quickstart.md — full RENTAL booking in sandbox
7. Demo if ready

### Incremental Delivery

1. Phase 1 + 2 → foundation ready
2. Phase 3 (US1) → RENTAL booking works → demo
3. Phase 4 (US2) → BYOC mode works → demo
4. Phase 5 (US3) → provider sees bookings → demo
5. Phase 6 (US4) → cancellation + refund → demo

---

## Notes

- All Redis slot lock key formats defined in `research.md` Decision 1
- VNPay txnRef format: `bookingId.replace(/-/g, '')` — defined in `research.md` Decision 2
- IPN idempotency: check `payment_transactions.status` before processing — defined in `research.md` Decision 3
- Booking snapshot written at CONFIRMED, never mutated — Constitution Principle I
- All `BookingService.transition()` calls are the only path to update booking status — Constitution Principle II
- TDD tests (T014, T015) must FAIL before T016/T017 implementation begins — Constitution Principle V
- F&B refund policy on cancellation is undecided — use slot_fee percentage as proxy for Phase 1 (see `research.md` Decision 6)
