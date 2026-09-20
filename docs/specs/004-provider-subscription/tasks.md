# Tasks: Provider Onboarding & Subscription Management

**Input**: Design documents from `specs/004-provider-subscription/`
**Prerequisites**: plan.md ✅ | spec.md ✅ | research.md ✅ | data-model.md ✅ | contracts/api.md ✅ | quickstart.md ✅

**Tests**: Not requested — no test tasks generated.

**Organization**: Tasks grouped by user story. Each story is independently testable.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add enums, install dependencies, prepare migration skeleton — blocks all entities.

- [X] T001 Add enums to `rcfeild-be/src/types/index.ts`: ProviderStatus (PENDING, ACTIVE, REJECTED, SUSPENDED), SubscriptionStatus (TRIAL, ACTIVE, GRACE_PERIOD, EXPIRED), PlanName (TRIAL, STARTER, GROWTH, PRO), PaymentRequestStatus (PENDING, CONFIRMED, REJECTED), NotificationType (10 values per data-model.md)
- [X] T002 Create migration file `rcfeild-be/src/migrations/YYYYMMDD_provider_subscription.ts` with CREATE TABLE statements for all 5 new tables + 2 composite indexes per data-model.md + seed INSERT for subscription_plans
- [X] T003 Install node-cron: run `npm install node-cron` and `npm install --save-dev @types/node-cron` in `rcfeild-be/`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: All 5 entities + NotificationService must exist before any user story service can be written.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T004 [P] Create `rcfeild-be/src/models/provider-profile.entity.ts` — ProviderProfile entity with fields: id, userId, businessName, businessDescription, registrationStatus, rejectionReason, suspendedAt, suspendedReason, createdAt, updatedAt, deletedAt per data-model.md
- [X] T005 [P] Create `rcfeild-be/src/models/subscription-plan.entity.ts` — SubscriptionPlan entity with fields: id, name, branchLimit, aiQuotaPerMonth, channelLimit, pricePerMonth, isTrial, createdAt, updatedAt (no deletedAt per data-model.md)
- [X] T006 [P] Create `rcfeild-be/src/models/provider-subscription.entity.ts` — ProviderSubscription entity with fields: id, providerId, planId, status, startedAt, expiresAt, graceEndsAt, aiMessagesUsed, aiQuotaResetAt, createdAt, updatedAt, deletedAt; add composite indexes on (providerId, status) and (expiresAt, status)
- [X] T007 [P] Create `rcfeild-be/src/models/payment-request.entity.ts` — PaymentRequest entity with fields: id, providerId, planId, status, transferReference, transferDate, transferAmount, adminNotes, reviewedBy, reviewedAt, createdAt, updatedAt, deletedAt per data-model.md
- [X] T008 [P] Create `rcfeild-be/src/models/notification.entity.ts` — Notification entity with fields: id, userId, type, title, message, readAt, createdAt, updatedAt (no deletedAt); add index on (userId, readAt)
- [X] T009 Add all 5 new entities to `rcfeild-be/src/config/database.ts` entities array (auto via glob pattern)
- [ ] T010 Run migration to create tables and seed subscription_plans in `rcfeild-be/` — verify tables exist in DB
- [X] T011 Add Zod validation schemas to `rcfeild-be/src/validate/index.ts`: RegisterProviderSchema (email, password, full_name, phone, business_name, business_description), SubmitPaymentRequestSchema (plan_id, transfer_reference, transfer_date, transfer_amount), AdminRejectSchema (reason: string), AdminSuspendSchema (reason: string), NotificationQuerySchema (page?, limit?, unread_only?)
- [X] T012 Implement `rcfeild-be/src/services/notification.service.ts` — methods: create(userId, type, title, message), listForUser(userId, options), markRead(notificationId, userId), markAllRead(userId) — used by all subsequent services
- [X] T013 Implement `rcfeild-be/src/controllers/notification.controller.ts` and `rcfeild-be/src/routes/notification.routes.ts` — GET /provider/notifications, PUT /provider/notifications/:id/read, PUT /provider/notifications/read-all; all require authenticate + authorize(PROVIDER)

**Checkpoint**: 5 entities created, migration run, NotificationService available — user story work can begin.

---

## Phase 3: User Story 1 — Provider Registration & Admin Approval (Priority: P1) 🎯 MVP

**Goal**: A provider can register, admin can approve/reject, trial subscription + first branch auto-created on approval.

**Independent Test**: Register a new provider via POST /auth/register-provider → admin approves via POST /admin/providers/:id/approve → verify ProviderSubscription(status=TRIAL) + 1 Cafe branch exist in DB + ACCOUNT_APPROVED notification created.

- [X] T014 [P] [US1] Implement `rcfeild-be/src/services/provider-onboarding.service.ts` — methods: register(body) creates User(role=PROVIDER) + ProviderProfile(status=PENDING) in a transaction; approve(providerId, adminId) transitions profile to ACTIVE + creates ProviderSubscription(status=TRIAL, expires_at=now+30d) + creates 1 Cafe branch + sends ACCOUNT_APPROVED notification; reject(providerId, adminId, reason) transitions to REJECTED + sends ACCOUNT_REJECTED notification; all transitions validated against allowed state machine
- [X] T015 [P] [US1] Implement `rcfeild-be/src/services/subscription.service.ts` — method: getActive(providerId) returns current non-EXPIRED subscription with plan; method: createTrial(providerId, trialPlanId) creates initial ProviderSubscription for approved provider
- [X] T016 [US1] Implement `rcfeild-be/src/controllers/provider-onboarding.controller.ts` — handlers: registerProvider (POST /api/v1/auth/register-provider, public), getProviders (GET /api/v1/admin/providers), getProviderDetail (GET /api/v1/admin/providers/:id), approveProvider (POST /api/v1/admin/providers/:id/approve), rejectProvider (POST /api/v1/admin/providers/:id/reject); follow controller comment convention from CLAUDE.md
- [X] T017 [US1] Create `rcfeild-be/src/routes/provider-onboarding.routes.ts` — mount POST /register-provider as public route; mount GET /, GET /:id, POST /:id/approve, POST /:id/reject under authenticate + authorize(ADMIN)
- [X] T018 [US1] Create `rcfeild-be/src/routes/admin-provider.routes.ts` — export adminProviderRouter; register it in `rcfeild-be/src/routes/index.ts` at `/admin/providers`; also register provider-onboarding public route at `/auth/register-provider`
- [X] T019 [P] [US1] Create `rcfield-fe/src/pages/auth/ProviderRegisterPage.tsx` — public registration form with fields: email, password, full_name, phone, business_name, business_description; calls POST /api/v1/auth/register-provider; shows success message on submit
- [X] T020 [P] [US1] Create `rcfield-fe/src/features/subscription/api/subscription.api.ts` and `rcfield-fe/src/features/subscription/types.ts` — define FbChannelStatusResponse-style types for subscription, plans, payment requests; implement getSubscriptionStatus, submitPaymentRequest, listPaymentRequests API methods
- [X] T021 [P] [US1] Create `rcfield-fe/src/pages/admin/AdminProvidersPage.tsx` — table of all providers with columns: business_name, email, registration_status, subscription plan + status, created_at; action buttons: Approve (green), Reject (red) for PENDING rows; Suspend/Unsuspend for ACTIVE/SUSPENDED rows; uses React Query for data fetching
- [X] T022 [US1] Add routes to `rcfield-fe/src/app/router/routes.tsx`: /register-provider (public, ProviderRegisterPage), /admin/providers (AdminProvidersPage, guard admin role); add "Providers" nav item to AdminShell sidebar

**Checkpoint**: Provider can register → Admin approves → Trial subscription + branch created. US1 fully testable.

---

## Phase 4: User Story 2 — Trial Expiry & Grace Period (Priority: P2)

**Goal**: System automatically transitions subscriptions through TRIAL → GRACE_PERIOD → EXPIRED via daily cron; branches soft-deleted on EXPIRED.

**Independent Test**: Manually set a subscription's expires_at to a past date → trigger cron job → verify subscription transitions to GRACE_PERIOD and branch stops accepting bookings; set grace_ends_at to past → trigger cron → verify EXPIRED + branch soft-deleted.

- [X] T023 [US2] Implement `SubscriptionService.transition(subscriptionId, toStatus)` in `rcfeild-be/src/services/subscription.service.ts` — validate against VALID_TRANSITIONS map per research.md; set grace_ends_at = expires_at + 7d when entering GRACE_PERIOD; dispatch notification on each transition; throw AppError(INVALID_SUBSCRIPTION_STATE) on invalid transition
- [X] T024 [US2] Implement `rcfeild-be/src/jobs/subscription-lifecycle.job.ts` — function processExpiredSubscriptions(): query subscriptions WHERE expires_at <= NOW() AND status IN (TRIAL, ACTIVE) → call transition to GRACE_PERIOD for each; function processExpiredGracePeriods(): query WHERE grace_ends_at <= NOW() AND status = GRACE_PERIOD → call transition to EXPIRED + soft-delete all provider's cafes; function sendExpiryWarnings(): query WHERE expires_at <= NOW()+3d AND status = TRIAL AND no TRIAL_EXPIRING_SOON notification sent → create warning notification
- [X] T025 [US2] Register cron schedules in `rcfeild-be/src/jobs/subscription-lifecycle.job.ts` using node-cron: '5 0 * * *' → processExpiredSubscriptions + processExpiredGracePeriods + sendExpiryWarnings; import and call startSubscriptionLifecycleJobs() from `rcfeild-be/src/index.ts`
- [X] T026 [US2] Add suspend/unsuspend methods to `rcfeild-be/src/services/provider-onboarding.service.ts` — suspend(providerId, adminId, reason): transition ACTIVE→SUSPENDED, set suspendedAt + suspendedReason, send ACCOUNT_SUSPENDED notification; unsuspend(providerId, adminId): transition SUSPENDED→ACTIVE, clear suspendedAt, send ACCOUNT_UNSUSPENDED notification
- [X] T027 [US2] Add suspend/unsuspend handlers to `rcfeild-be/src/controllers/provider-onboarding.controller.ts` and routes to `rcfeild-be/src/routes/admin-provider.routes.ts` — POST /admin/providers/:id/suspend and POST /admin/providers/:id/unsuspend under authenticate + authorize(ADMIN)
- [X] T028 [P] [US2] Create `rcfield-fe/src/features/subscription/components/SubscriptionStatusCard.tsx` — displays plan name, status badge (TRIAL/ACTIVE/GRACE_PERIOD/EXPIRED with color coding), expires_at countdown, grace_ends_at warning if in GRACE_PERIOD
- [X] T029 [P] [US2] Create `rcfield-fe/src/features/subscription/components/UsageQuotaBars.tsx` — 3 progress bars: Branches (used/limit), AI Messages (used/monthly quota), Channels (connected/limit); show "Unlimited" text when limit = -1
- [X] T030 [US2] Create `rcfield-fe/src/pages/provider/SubscriptionPage.tsx` — combines SubscriptionStatusCard + UsageQuotaBars; fetches GET /api/v1/provider/subscription; add route /provider/subscription to router guarded by PROVIDER role; add "Subscription" nav item to provider sidebar

**Checkpoint**: Daily cron transitions subscriptions correctly. Provider dashboard shows status. US2 independently testable.

---

## Phase 5: User Story 3 — Subscription Upgrade via Payment Request (Priority: P3)

**Goal**: Provider submits bank transfer proof → Admin confirms → subscription activated/upgraded with stacked expiry date.

**Independent Test**: Submit POST /provider/payment-requests → admin confirms via POST /admin/payment-requests/:id/confirm → verify subscription plan updated, new expires_at = old expires_at + 30 days, SUBSCRIPTION_ACTIVATED notification created, soft-deleted branches restored if subscription was EXPIRED.

- [X] T031 [US3] Implement `rcfeild-be/src/services/payment-request.service.ts` — submit(providerId, body): check no PENDING request exists → create PaymentRequest(status=PENDING); confirm(requestId, adminId, notes?): validate PENDING → run transaction: update PaymentRequest to CONFIRMED + call SubscriptionService.activateFromPayment(providerId, planId) + restore soft-deleted cafes if subscription was EXPIRED + send PAYMENT_REQUEST_CONFIRMED notification; reject(requestId, adminId, reason): update to REJECTED + send PAYMENT_REQUEST_REJECTED notification
- [X] T032 [US3] Implement `SubscriptionService.activateFromPayment(providerId, planId)` in `rcfeild-be/src/services/subscription.service.ts` — compute new expires_at = MAX(current expires_at, NOW()) + 30 days; if status is GRACE_PERIOD or EXPIRED call transition() to ACTIVE; if TRIAL call transition() to ACTIVE; update plan_id if changing plans; reset ai_messages_used = 0; compute next ai_quota_reset_at (1st of next month)
- [X] T033 [US3] Implement `rcfeild-be/src/controllers/payment-request.controller.ts` — handlers: submitPaymentRequest (POST /api/v1/provider/payment-requests), listMyPaymentRequests (GET /api/v1/provider/payment-requests), listAllPaymentRequests (GET /api/v1/admin/payment-requests), confirmPaymentRequest (POST /api/v1/admin/payment-requests/:id/confirm), rejectPaymentRequest (POST /api/v1/admin/payment-requests/:id/reject)
- [X] T034 [US3] Create `rcfeild-be/src/routes/provider-subscription.routes.ts` — GET /subscription (getSubscriptionStatus), POST /payment-requests (submitPaymentRequest), GET /payment-requests (listMyPaymentRequests); all under authenticate + authorize(PROVIDER); add admin payment request routes to `rcfeild-be/src/routes/admin-provider.routes.ts`; register both in `rcfeild-be/src/routes/index.ts`
- [X] T035 [P] [US3] Create `rcfield-fe/src/features/subscription/components/PaymentRequestForm.tsx` — form with: plan selector (dropdown of STARTER/GROWTH/PRO with prices), transfer_reference input, transfer_date picker, transfer_amount input; calls POST /api/v1/provider/payment-requests; shows success/error toast; disables submit if PENDING request already exists
- [X] T036 [P] [US3] Create `rcfield-fe/src/pages/admin/AdminPaymentRequestsPage.tsx` — table with columns: provider business_name, desired plan, transfer_reference, transfer_date, transfer_amount, status, created_at; action buttons: Confirm (green) + Reject (red) for PENDING rows; confirmation modal for both actions; add "Payment Requests" nav item to AdminShell sidebar
- [X] T037 [US3] Update `rcfield-fe/src/pages/provider/SubscriptionPage.tsx` — add PaymentRequestForm section below SubscriptionStatusCard; add payment request history table showing own requests with status badges; add route /admin/payment-requests to router

**Checkpoint**: Full payment → activation flow works. Branch restoration on expired subscription works. US3 independently testable.

---

## Phase 6: User Story 4 — Quota Enforcement (Priority: P4)

**Goal**: System blocks branch creation, channel connection, and AI processing when plan limits are reached; monthly AI quota resets automatically.

**Independent Test**: Set provider to Starter plan (1 branch) → attempt to create second branch → verify 403 PLAN_LIMIT_EXCEEDED; exhaust AI quota → send Messenger message → verify AI does not respond, fallback message sent.

- [X] T038 [US4] Add quota check methods to `rcfeild-be/src/services/subscription.service.ts` — checkBranchQuota(providerId): get active subscription + count non-deleted cafes for provider → throw AppError(403, PLAN_LIMIT_EXCEEDED) if at limit; checkChannelQuota(providerId): get active subscription + count connected channels → throw AppError(403, PLAN_LIMIT_EXCEEDED) if at limit; incrementAIQuota(providerId): atomic UPDATE provider_subscriptions SET ai_messages_used = ai_messages_used + 1 WHERE ... AND (ai_quota_per_month = -1 OR ai_messages_used < ai_quota_per_month) RETURNING ai_messages_used — throw AppError(429, AI_QUOTA_EXCEEDED) if row not updated
- [ ] T039 [US4] Wire branch quota check into cafe branch creation — call SubscriptionService.checkBranchQuota(providerId) at the start of the create branch service method (find or create the relevant service/controller in `rcfeild-be/src/`); also add SUSPENDED account check (throw 403 ACCOUNT_SUSPENDED if provider profile is suspended)
- [X] T040 [US4] Wire channel quota check into `rcfeild-be/src/services/fb-channel.service.ts` — call SubscriptionService.checkChannelQuota(cafeId's providerId) in handleOAuthCallback before saving the channel; also check provider profile is ACTIVE (not SUSPENDED or EXPIRED)
- [X] T041 [US4] Wire AI quota increment into `rcfeild-be/src/controllers/fb-webhook.controller.ts` — call SubscriptionService.incrementAIQuota(providerId) before AI processing; on AI_QUOTA_EXCEEDED error, send a fallback message to the user ("Xin lỗi, hệ thống tạm thời không khả dụng") instead of throwing; log the quota exceeded event
- [X] T042 [US4] Add monthly AI quota reset to `rcfeild-be/src/jobs/subscription-lifecycle.job.ts` — function resetMonthlyAIQuotas(): UPDATE provider_subscriptions SET ai_messages_used = 0, ai_quota_reset_at = first day of next month WHERE ai_quota_reset_at <= NOW(); schedule via node-cron '10 0 1 * *'

**Checkpoint**: All quota limits enforced across branch, channel, and AI operations. Monthly reset runs automatically. US4 independently testable.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T043 [P] Create `rcfield-fe/src/features/notifications/api/notification.api.ts` and `rcfield-fe/src/features/notifications/types.ts` — implement listNotifications, markNotificationRead, markAllRead API methods
- [X] T044 [P] Create `rcfield-fe/src/features/notifications/components/NotificationBell.tsx` — bell icon in header with red badge showing unread count; click opens dropdown list of recent notifications with type icons, title, timestamp, read/unread styling; mark-as-read on click; "Mark all read" button; polls GET /api/v1/provider/notifications every 30 seconds
- [X] T045 Wire NotificationBell into the provider layout shell header (find existing provider shell component in `rcfield-fe/src/`)
- [ ] T046 [P] Update `rcfield-fe/src/pages/admin/AdminProvidersPage.tsx` — add Suspend/Unsuspend action buttons for ACTIVE/SUSPENDED providers with confirmation modal + reason input for suspend
- [X] T047 Add SUSPENDED provider guard to existing provider-facing middleware in `rcfeild-be/src/middlewares/auth.middleware.ts` — after authenticate, check if PROVIDER role user's ProviderProfile.registrationStatus is SUSPENDED → return 403 ACCOUNT_SUSPENDED

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 (enums must exist before entities) — **BLOCKS all user stories**
- **US1 (Phase 3)**: Depends on Phase 2
- **US2 (Phase 4)**: Depends on Phase 2 + US1 (transition() builds on createTrial())
- **US3 (Phase 5)**: Depends on Phase 2 + US2 (activateFromPayment uses transition())
- **US4 (Phase 6)**: Depends on Phase 2 + US1 (needs active subscription to check quotas)
- **Polish (Phase 7)**: Depends on all user stories

### User Story Dependencies

- **US1 (P1)**: Can start after Phase 2 — no dependencies on other stories
- **US2 (P2)**: Depends on US1 — needs an existing TRIAL subscription to transition
- **US3 (P3)**: Depends on US2 — reuses transition() for GRACE_PERIOD→ACTIVE and EXPIRED→ACTIVE
- **US4 (P4)**: Depends on US1 — needs active subscription for quota checks

### Parallel Opportunities

- T004–T008 (all 5 entities): fully parallel
- T014–T015 (ProviderOnboardingService + SubscriptionService.createTrial): parallel — different files
- T019–T021 (frontend pages for US1): parallel — different files
- T028–T029 (SubscriptionStatusCard + UsageQuotaBars): parallel
- T035–T036 (PaymentRequestForm + AdminPaymentRequestsPage): parallel
- T043–T044 (notification API + NotificationBell): parallel

---

## Parallel Example: Phase 2

```
Launch in parallel:
  Task T004: ProviderProfile entity
  Task T005: SubscriptionPlan entity
  Task T006: ProviderSubscription entity
  Task T007: PaymentRequest entity
  Task T008: Notification entity
Then sequential:
  Task T009: Register entities in database.ts
  Task T010: Run migration + seed
  Task T011: Add Zod schemas
  Task T012: NotificationService
  Task T013: Notification controller + routes
```

---

## Implementation Strategy

### MVP (User Story 1 Only)

1. Complete Phase 1: Setup (T001–T003)
2. Complete Phase 2: Foundational (T004–T013)
3. Complete Phase 3: US1 (T014–T022)
4. **STOP and VALIDATE**: Provider can register, admin can approve, trial starts
5. Demo: working onboarding flow end-to-end

### Incremental Delivery

1. Phase 1 + 2 → Foundation ready
2. + Phase 3 (US1) → Provider registration + approval ✓
3. + Phase 4 (US2) → Trial expiry + grace period ✓
4. + Phase 5 (US3) → Payment + subscription activation ✓
5. + Phase 6 (US4) → Quota enforcement ✓
6. + Phase 7 → Polish + notifications ✓

---

## Notes

- `[P]` = different files, no dependencies on incomplete tasks in same phase
- `[USn]` = maps task to user story for traceability
- Constitution Principle II: `SubscriptionService.transition()` is the ONLY allowed mutation point for subscription status
- Constitution Principle VI: every route must apply `authenticate + authorize(...roles)` middleware at router level
- All enums defined in `rcfeild-be/src/types/index.ts`, never inline
- All Zod schemas in `rcfeild-be/src/validate/index.ts`, never in controllers
- Follow controller comment convention: `// POST /api/v1/path [auth]` above each handler
