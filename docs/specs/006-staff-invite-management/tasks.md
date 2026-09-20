# Tasks: Staff Management — Provider Invite Flow

**Input**: Design documents from `specs/006-staff-invite-management/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/api.md ✅, quickstart.md ✅

**Organization**: Tasks grouped by user story — each phase is independently testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on each other)
- **[Story]**: Which user story this task belongs to (US1–US4)

---

## Phase 1: Setup (Infrastructure)

**Purpose**: New DB table + entity + type changes that ALL user stories depend on.

- [X] T001 Write migration `rcfeild-be/src/migrations/TIMESTAMP-AddStaffInviteTokens.ts` — CREATE TABLE `staff_invite_tokens` (id, user_id, token, expires_at, used_at, created_at) with index on user_id
- [X] T002 Create TypeORM entity `rcfeild-be/src/models/staff-invite-token.entity.ts` — mirrors `password-reset-token.entity.ts` pattern
- [X] T003 Add optional `cafeId?: string` to `AuthPayload` interface in `rcfeild-be/src/types/index.ts`
- [X] T004 Modify `issueTokenPair` in `rcfeild-be/src/services/auth.service.ts` — call `getAssignedCafeId(user.id)` when `role === STAFF`, embed `cafeId` in JWT payload
- [X] T005 Add `sendStaffInvite({ to, fullName, inviteUrl })` method to `rcfeild-be/src/services/email.service.ts` — follows `sendPasswordResetCode` pattern using Brevo
- [X] T006 [P] Add `InviteStaffSchema` to `rcfeild-be/src/validate/index.ts` — fields: `cafe_id` (uuid), `full_name` (string), `email` (email), `phone` (string, optional). Remove `password` field from previous schema.
- [X] T007 [P] Add `ActivateStaffSchema` to `rcfeild-be/src/validate/index.ts` — fields: `token` (string), `password` (min 8 chars)

**Checkpoint**: DB table ready, entity registered in TypeORM, JWT includes cafeId for STAFF, email method exists, schemas defined — US implementation can begin.

---

## Phase 2: Foundational (Route Registration)

**Purpose**: Register all new routers in the main routes index — must come after route files are created but is listed here as a reminder.

> ⚠️ Complete route file creation tasks in Phase 3–6 first, then return here to register.

- [X] T008 Register `staffInviteRouter` and `staffRouter` in `rcfeild-be/src/routes/index.ts`:
  - `router.use('/auth/staff-invite', staffInviteRouter)` (public)
  - `router.use('/staff', staffRouter)` (authenticated STAFF)

---

## Phase 3: US1 — Provider Invites a New Staff Member (Priority: P1) 🎯 MVP

**Goal**: Provider fills form → system creates Pending account → sends invite email.

**Independent Test**: `POST /provider/staff` creates user with `is_active=false`, creates row in `staff_invite_tokens`, returns `{ status: "PENDING", emailSent: true/false }`.

### Implementation

- [X] T009 [US1] Modify `createStaffForProvider` in `rcfeild-be/src/services/staff.service.ts`:
  - Change `is_active: true` → `is_active: false` on user creation
  - Generate raw invite token (`crypto.randomBytes(32).toString('hex')`)
  - Hash token with SHA-256, save to `staff_invite_tokens` with `expires_at = now() + 48h`
  - Call `emailService.sendStaffInvite({ to, fullName, inviteUrl })` — catch errors, log, do NOT rethrow (per clarification Q2)
  - Return `{ ...profile, emailSent: boolean }` instead of just profile
- [X] T010 [US1] Update `createStaff` handler in `rcfeild-be/src/controllers/staff.controller.ts`:
  - Use updated `InviteStaffSchema` (no password field)
  - Pass `req.user.userId` as providerId
  - Return 201 with `{ success: true, data: { id, email, fullName, cafeId, status: "PENDING", emailSent } }`

**Checkpoint**: `POST /provider/staff` with valid body creates Pending staff, invite email attempted, `emailSent` in response.

---

## Phase 4: US2 — Provider Views and Manages Staff List (Priority: P2)

**Goal**: Provider sees list with statuses, can deactivate/reactivate, resend invite.

**Independent Test**: Seed 3 staff (1 PENDING, 1 ACTIVE, 1 DISABLED) → `GET /provider/staff` returns all 3 with correct statuses. `PATCH /:staffId/deactivate` flips ACTIVE → DISABLED.

### Implementation

- [X] T011 [P] [US2] Add `listStaffForProvider(providerId: string, cafeId?: string)` to `rcfeild-be/src/services/staff.service.ts`:
  - JOIN `users` + `staff_cafe_assignments` + `cafes` + LEFT JOIN `staff_invite_tokens` (active: used_at IS NULL AND expires_at > NOW())
  - Derive status: PENDING / ACTIVE / DISABLED per research.md Decision 1
  - Filter by `cafe.provider_id = providerId`, optionally filter by `cafeId`
  - Return `StaffListItem[]` per data-model.md
- [X] T012 [P] [US2] Add `deactivateStaff(providerId: string, staffId: string)` to `rcfeild-be/src/services/staff.service.ts`:
  - Verify staff belongs to a cafe owned by providerId
  - Reject if `is_active = false` AND no active token (already DISABLED) → 409 STAFF_ALREADY_DISABLED
  - Set `users.is_active = false`
- [X] T013 [P] [US2] Add `reactivateStaff(providerId: string, staffId: string)` to `rcfeild-be/src/services/staff.service.ts`:
  - Verify ownership
  - Reject if `is_active = true` → 409 STAFF_NOT_DISABLED
  - Reject if `is_active = false` AND active invite token exists → 409 STAFF_PENDING_ACTIVATION
  - Set `users.is_active = true`
- [X] T014 [P] [US2] Add `resendInvite(providerId: string, staffId: string)` to `rcfeild-be/src/services/staff.service.ts`:
  - Verify ownership
  - Reject if `users.is_active = true` → 409 STAFF_ALREADY_ACTIVE
  - Delete existing `staff_invite_tokens` for user, create new token (48h TTL)
  - Call `emailService.sendStaffInvite()` — catch errors, return `{ emailSent: boolean }`
- [X] T015 [US2] Add handlers to `rcfeild-be/src/controllers/staff.controller.ts`:
  - `listStaff`: GET handler, reads optional `?cafe_id` query param
  - `deactivateStaff`: PATCH handler, reads `req.params.staffId`
  - `reactivateStaff`: PATCH handler, reads `req.params.staffId`
  - `resendInvite`: POST handler, reads `req.params.staffId`
- [X] T016 [US2] Add routes to `rcfeild-be/src/routes/provider-subscription.routes.ts`:
  - `GET /staff` → `staffController.listStaff`
  - `PATCH /staff/:staffId/deactivate` → `staffController.deactivateStaff`
  - `PATCH /staff/:staffId/reactivate` → `staffController.reactivateStaff`
  - `POST /staff/:staffId/resend-invite` → `staffController.resendInvite`
  - All behind existing `authenticate, authorize(PROVIDER), requireActiveProvider`
- [X] T017 [P] [US2] Create `rcfield-fe/src/features/staff/api/staff.api.ts` — React Query functions:
  - `staffQueryKeys` object
  - `staffApi.listStaff(cafeId?)` → GET /provider/staff
  - `staffApi.inviteStaff(body)` → POST /provider/staff
  - `staffApi.deactivateStaff(staffId)` → PATCH /provider/staff/:staffId/deactivate
  - `staffApi.reactivateStaff(staffId)` → PATCH /provider/staff/:staffId/reactivate
  - `staffApi.resendInvite(staffId)` → POST /provider/staff/:staffId/resend-invite
- [X] T018 [US2] Modify `rcfield-fe/src/pages/provider/ProviderStaffPage.tsx` — replace all mock data with real API:
  - Use `useQuery(staffQueryKeys.list(), staffApi.listStaff)` for staff list
  - Use `useMutation(staffApi.inviteStaff)` for invite form submission
  - Use `useMutation(staffApi.deactivateStaff)` / `reactivateStaff` / `resendInvite` for row actions
  - Show `emailSent: false` warning banner when invite created but email failed

**Checkpoint**: Provider staff page fully functional with real API — list, invite, deactivate, reactivate, resend.

---

## Phase 5: US3 — Staff Activates Account via Email (Priority: P3)

**Goal**: Staff clicks invite link → validates token → sets password → account active → auto-login.

**Independent Test**: Valid token → `GET /auth/staff-invite/validate` returns email. `POST /auth/staff-invite/activate` with valid token + password returns JWT, user `is_active = true` in DB.

### Implementation

- [X] T019 [P] [US3] Add `validateInviteToken(rawToken: string)` to `rcfeild-be/src/services/staff.service.ts`:
  - Hash raw token with SHA-256
  - Look up in `staff_invite_tokens` where `token = hash AND used_at IS NULL`
  - Throw `INVITE_TOKEN_INVALID` (400) if not found
  - Throw `INVITE_TOKEN_EXPIRED` (410) if `expires_at <= now()`
  - Return `{ email, fullName }` from joined `users`
- [X] T020 [P] [US3] Add `activateStaffAccount(rawToken: string, password: string)` to `rcfeild-be/src/services/staff.service.ts`:
  - Validate token (reuse `validateInviteToken` logic)
  - Hash password with bcrypt(10)
  - Set `users.password_hash = hash`, `users.is_active = true`
  - Set `staff_invite_tokens.used_at = now()`
  - Issue JWT pair via `authService.issueTokenPair(user)` (or equivalent inline)
  - Return JWT pair + user profile with cafeId
- [X] T021 [US3] Create `rcfeild-be/src/controllers/staff-invite.controller.ts`:
  - `validateToken`: GET handler, reads `?token` query param, returns `{ email, fullName }`
  - `activateAccount`: POST handler, validates with `ActivateStaffSchema`, calls service
- [X] T022 [US3] Create `rcfeild-be/src/routes/staff-invite.routes.ts`:
  - NO `authenticate` middleware
  - `GET /validate` → `staffInviteController.validateToken`
  - `POST /activate` → `staffInviteController.activateAccount`
  - Export `staffInviteRouter`
- [X] T023 [US3] Create `rcfield-fe/src/pages/staff/activate/StaffActivatePage.tsx`:
  - On mount: call `GET /auth/staff-invite/validate?token=<token_from_url>` 
  - If 410: show "Link đã hết hạn, liên hệ Provider để gửi lại"
  - If 400: show "Link không hợp lệ"
  - If 200: show "Kích hoạt tài khoản cho [email]" + password form
  - On submit: call `POST /auth/staff-invite/activate`, on success redirect to staff dashboard
- [X] T024 [US3] Add `/staff-invite/activate` route to FE router (wherever routes are configured in `rcfield-fe/src/`) pointing to `StaffActivatePage`

**Checkpoint**: Staff can click invite link, set password, be auto-logged in to staff dashboard.

---

## Phase 6: US4 — Staff Views Real Operational Data (Priority: P4)

**Goal**: Staff dashboard shows today's actual bookings for their assigned cafe (no mock data).

**Independent Test**: STAFF JWT with `cafeId` → `GET /staff/today-bookings` returns array of bookings for that cafe today (empty array if no bookings, not error).

### Implementation

- [X] T025 [P] [US4] Add `getTodayBookings(cafeId: string)` to `rcfeild-be/src/services/staff.service.ts`:
  - Query `bookings` where `cafe_id = cafeId` AND date portion of `start_time` = today (UTC+7) AND `status IN ('CONFIRMED', 'ACTIVE', 'EXTENDING', 'CHECKING_OUT')`
  - JOIN customer user for `customerName`, `customerPhone`
  - JOIN vehicle (if RENTAL mode) for `vehicleName`
  - Return array of `TodayBookingItem` per contracts/api.md
- [X] T026 [P] [US4] Add `todayBookings` handler to `rcfeild-be/src/controllers/staff.controller.ts`:
  - Read `cafeId` from `req.user.cafeId` (populated from JWT per Phase 1 T004)
  - Throw 403 if `cafeId` is missing (staff not yet assigned)
  - Return `{ success: true, data: [...] }`
- [X] T027 [US4] Create `rcfeild-be/src/routes/staff.routes.ts`:
  - `staffRouter.use(authenticate, authorize(UserRole.STAFF))`
  - `GET /today-bookings` → `staffController.todayBookings`
  - Export `staffRouter`
- [X] T028 [US4] Modify `rcfield-fe/src/pages/staff/StaffTodayBookingsPage.tsx` — replace mock data:
  - Add `useQuery(['staff', 'today-bookings'], () => api.get('/staff/today-bookings'))` 
  - Render real booking list; show empty state when array is empty
  - Show loading skeleton during fetch

**Checkpoint**: Staff logs in (with valid cafeId in JWT), dashboard shows real bookings.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T029 Complete Phase 2 T008 — register `staffInviteRouter` and `staffRouter` in `rcfeild-be/src/routes/index.ts`
- [X] T030 [P] Run TypeScript compiler (`tsc --noEmit`) in `rcfeild-be/` — fix any type errors from `AuthPayload.cafeId` addition
- [ ] T031 [P] Run migration to verify `staff_invite_tokens` table created correctly: `npm run migration:run` in `rcfeild-be/`
- [ ] T032 Validate end-to-end with quickstart.md Scenario A (invite → activate → login → today-bookings)
- [ ] T033 [P] Validate Scenario E (email conflict) and Scenario C (Brevo failure path)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Route Registration)**: Depends on all route files being created (Phases 3–6)
- **Phase 3 (US1)**: Depends on Phase 1 complete
- **Phase 4 (US2)**: Depends on Phase 1 + Phase 3 complete (list endpoint needs invite tokens to exist)
- **Phase 5 (US3)**: Depends on Phase 1 complete (can run parallel to Phase 4)
- **Phase 6 (US4)**: Depends on Phase 1 (cafeId in JWT) — can run parallel to Phases 4 & 5
- **Phase 7 (Polish)**: Depends on Phases 3–6 complete

### User Story Dependencies

- **US1 (P1)**: Depends on Phase 1 only — start first
- **US2 (P2)**: Depends on Phase 1 + US1 (status derivation needs invite tokens table populated)
- **US3 (P3)**: Depends on Phase 1 only — can run parallel with US2
- **US4 (P4)**: Depends on Phase 1 (cafeId in JWT) only — can run parallel with US2 & US3

### Parallel Opportunities Within Phases

**Phase 1**: T006 and T007 (both in validate/index.ts — do sequentially but in same edit)

**Phase 4 (US2)**: T011, T012, T013, T014 are all additions to staff.service.ts — write in same pass. T017 (FE api file) is parallel to T015/T016 (BE).

**Phase 5 (US3)**: T019 and T020 (both service additions) — parallel write. T023 (FE page) parallel to T021/T022 (BE).

**Phase 6 (US4)**: T025 and T026 (service + controller) parallel. T027 (routes) after. T028 (FE) parallel to T025-T027.

---

## Implementation Strategy

### MVP (US1 + US2 only — Provider side complete)

1. Phase 1: Setup (T001–T007)
2. Phase 3: US1 — Invite staff (T009–T010)
3. Phase 4: US2 — List & manage (T011–T018)
4. Phase 2: Register routes (T008 partial)
5. **STOP & VALIDATE**: Provider can invite, view list, deactivate, resend — all with real API

### Increment 2 (Add staff activation)

6. Phase 5: US3 — Activation page (T019–T024)
7. **VALIDATE**: Staff can receive email, click link, set password, login

### Increment 3 (Full operational data)

8. Phase 6: US4 — Today's bookings (T025–T028)
9. Phase 7: Polish & E2E validation (T029–T033)
10. **VALIDATE**: Full quickstart.md Scenario A passes

---

## Notes

- All tasks touching `staff.service.ts` in Phase 4 can be written in a single pass (add all 4 functions at once) — don't edit the same file 4 times separately
- `rcfeild-be` vs `rcfield-fe` — note the spelling difference: backend is `rcfeild-be`, frontend is `rcfield-fe`
- `staff_invite_tokens.token` stores the SHA-256 hash; the raw token goes in the email URL only
- cafeId added to JWT only for `UserRole.STAFF` — no change for CUSTOMER/PROVIDER/ADMIN tokens
- Brevo failure must NOT throw — catch error, set `emailSent = false`, continue
