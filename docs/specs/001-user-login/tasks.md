# Tasks: User Login

**Input**: Design documents from `specs/001-user-login/`
**Prerequisites**: plan.md ✅ · spec.md ✅ · research.md ✅ · data-model.md ✅ · contracts/auth.md ✅

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies between them)
- **[Story]**: Which user story this task belongs to (US1–US4)

## Path Convention

All source paths are relative to `rcfeild-be/` (the backend root).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install new dependency and extend env config before any implementation begins.

- [x] T001 Install `google-auth-library` dependency — run `npm install google-auth-library` in `rcfeild-be/`
- [x] T002 Add `GOOGLE_CLIENT_ID` env variable to `src/config/env.ts` (typed string, required), `.env.example` (with placeholder comment), and `.env.test` (any string for tests — real verification will be mocked)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: TypeORM entities and shared helpers that ALL user stories depend on. Must be complete before any story phase begins.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T003 [P] Create `User` TypeORM entity in `src/models/user.model.ts` — map to existing `users` table with columns: `id` (uuid PK), `email` (varchar unique), `password_hash` (text nullable), `role` (user_role enum), `auth_provider` (auth_provider enum), `google_id` (varchar nullable), `is_active` (boolean), `trust_score` (int), `created_at`, `updated_at`, `deleted_at` (@DeleteDateColumn)
- [x] T004 [P] Create `RefreshToken` TypeORM entity in `src/models/refresh-token.model.ts` — map to existing `refresh_tokens` table with columns: `id` (uuid PK), `user_id` (uuid FK → User), `token` (text — stores SHA-256 hash), `expires_at` (timestamptz), `created_at`, `revoked_at` (timestamptz nullable)
- [x] T005 Register `User` and `RefreshToken` entities in `src/config/database.ts` entities array (both existing entities from other models should remain unchanged)
- [x] T006 [P] Extend `createTestUser()` helper in `src/__tests__/helpers/index.ts` to accept optional `password` param — when provided, bcrypt-hash it and store in `password_hash` column; default to no hash (for token-based auth tests that don't need login)

**Checkpoint**: Foundation ready — run `npm test -- health` to confirm test DB still works.

---

## Phase 3: User Story 1 — Đăng nhập bằng email và mật khẩu (Priority: P1) 🎯 MVP

**Goal**: User can submit email + password and receive a valid JWT access token (1h) + opaque refresh token (7d) with their role. Brute-force protection locks the account after 5 consecutive failures.

**Independent Test**: `createTestUser({ password: 'secret123' })` → `POST /api/v1/auth/login` → 200 + tokens + `user.role`; then hit with wrong password 5× → 403 `ACCOUNT_LOCKED`.

### Implementation for User Story 1

- [x] T007 [US1] Implement private `issueTokenPair(user)` helper inside `src/services/auth.service.ts` — signs JWT access token (`{ sub, role }`, 1h expiry using `JWT_SECRET`), generates `crypto.randomBytes(32).toString('hex')` as raw refresh token, stores `SHA-256(raw)` in `refresh_tokens` table with `expires_at = now() + 7 days`, returns `{ access_token, refresh_token: raw }`
- [x] T008 [US1] Implement `loginWithPassword(email, password)` in `src/services/auth.service.ts` — validate with Zod inside service is wrong; validation belongs in controller. Service: (1) check Redis `auth:failed:{email}` ≥ 5 → throw `AppError('ACCOUNT_LOCKED', 403)`; (2) find user by email (User repo); (3) if not found OR `password_hash` null OR bcrypt.compare fails → INCR Redis counter (expire 900s) → throw `AppError('INVALID_CREDENTIALS', 401)`; (4) if `is_active = false` → throw `AppError('ACCOUNT_LOCKED', 403)`; (5) on success → DEL Redis counter → call `issueTokenPair(user)` → return `{ access_token, refresh_token, user: { id, email, role } }`
- [x] T009 [US1] Create `src/controllers/auth.controller.ts` with `login` handler — Zod schema: `{ email: z.string().email(), password: z.string().min(8) }`; call `authService.loginWithPassword()`; return `{ success: true, data: { access_token, refresh_token, user } }` on success; let errors propagate to global error middleware
- [x] T010 [US1] Create `src/routes/auth.routes.ts` — apply `rateLimit({ windowMs: 15*60*1000, max: 100 })` to the router; mount `POST /login` → `authController.login`
- [x] T011 [US1] Mount auth router at `/auth` in `src/routes/index.ts` — add `router.use('/auth', authRouter)`
- [x] T012 [US1] Write integration tests for US1 in `src/__tests__/routes/auth.test.ts`:
  - `POST /api/v1/auth/login` with correct credentials → 200 + `access_token` + `refresh_token` + `user.role`
  - Wrong password → 401 `INVALID_CREDENTIALS` (same message as non-existent email)
  - Non-existent email → 401 `INVALID_CREDENTIALS`
  - `is_active = false` user → 403 `ACCOUNT_LOCKED`
  - 5 wrong-password attempts → 6th attempt → 403 `ACCOUNT_LOCKED`
  - Missing `email` field → 400 `VALIDATION_ERROR`

**Checkpoint**: `npm test -- auth` passes all US1 cases. `POST /api/v1/auth/login` works end-to-end.

---

## Phase 4: User Story 2 — Đăng nhập bằng Google OAuth (Priority: P2)

**Goal**: User sends a Google ID token; backend verifies it, auto-creates a CUSTOMER account if email is new (or links to existing LOCAL account), and returns JWT tokens.

**Independent Test**: Mock `google-auth-library`'s `OAuth2Client.verifyIdToken()` in tests → `POST /api/v1/auth/google` → 200 + tokens; assert new user row created for new email.

### Implementation for User Story 2

- [x] T013 [US2] Implement `loginWithGoogle(idToken)` in `src/services/auth.service.ts` — (1) call `new OAuth2Client(GOOGLE_CLIENT_ID).verifyIdToken({ idToken, audience: GOOGLE_CLIENT_ID })`; on failure throw `AppError('GOOGLE_AUTH_FAILED', 401)`; (2) extract `email`, `sub` (google_id) from payload; (3) find user by email: if found with LOCAL → update `google_id` and `auth_provider = GOOGLE`; if found with GOOGLE → use as-is; if not found → create `{ email, role: CUSTOMER, auth_provider: GOOGLE, google_id: sub, is_active: true }`; (4) check `is_active`; (5) call `issueTokenPair(user)`
- [x] T014 [US2] Add `googleLogin` handler to `src/controllers/auth.controller.ts` — Zod schema: `{ id_token: z.string().min(1) }`; call `authService.loginWithGoogle()`; return standard success shape
- [x] T015 [US2] Add `POST /google` route to `src/routes/auth.routes.ts` → `authController.googleLogin`
- [x] T016 [US2] Write integration tests for US2 in `src/__tests__/routes/auth.test.ts` (mock `google-auth-library` using `jest.mock()`):
  - New email → 200 + user created with `role = CUSTOMER`, `auth_provider = GOOGLE`
  - Existing LOCAL email → 200 + same user linked (no duplicate created)
  - Invalid/expired ID token (mock throws) → 401 `GOOGLE_AUTH_FAILED`
  - `is_active = false` Google user → 403 `ACCOUNT_LOCKED`

**Checkpoint**: `npm test -- auth` passes all US1 + US2 cases.

---

## Phase 5: User Story 3 — Làm mới access token (Priority: P2)

**Goal**: Client can exchange a valid refresh token for a new access + refresh token pair. Reusing a revoked token triggers full session wipe (theft detection).

**Independent Test**: Login → save `refresh_token` → `POST /api/v1/auth/refresh` → 200 + new tokens; then use old refresh token → 401.

### Implementation for User Story 3

- [x] T017 [US3] Implement `refreshTokens(rawToken)` in `src/services/auth.service.ts` — (1) hash: `SHA-256(rawToken)`; (2) find row in `refresh_tokens` by `token = hash`; (3) if not found → 401; (4) if `revoked_at IS NOT NULL` → theft detected: set `revoked_at = now()` on ALL rows where `user_id = row.user_id AND revoked_at IS NULL` → throw `AppError('INVALID_REFRESH_TOKEN', 401)`; (5) if `expires_at <= now()` → 401; (6) set `revoked_at = now()` on current row; (7) load user; (8) call `issueTokenPair(user)` → return `{ access_token, refresh_token }`
- [x] T018 [US3] Add `refresh` handler to `src/controllers/auth.controller.ts` — Zod schema: `{ refresh_token: z.string().min(1) }`; return `{ success: true, data: { access_token, refresh_token } }`
- [x] T019 [US3] Add `POST /refresh` route to `src/routes/auth.routes.ts` → `authController.refresh`
- [x] T020 [US3] Write integration tests for US3 in `src/__tests__/routes/auth.test.ts`:
  - Valid refresh token → 200 + new `access_token` + new `refresh_token`; old refresh token now returns 401
  - Expired refresh token (manually set `expires_at = past` in DB) → 401 `INVALID_REFRESH_TOKEN`
  - Non-existent token → 401 `INVALID_REFRESH_TOKEN`
  - Reuse revoked token (old token after rotation) → 401 + all other sessions wiped (verify in DB)

**Checkpoint**: `npm test -- auth` passes all US1 + US2 + US3 cases.

---

## Phase 6: User Story 4 — Đăng xuất (Priority: P3)

**Goal**: User sends their refresh token to logout; that token is revoked immediately and returns 200. Subsequent use of the old refresh token returns 401.

**Independent Test**: Login → `POST /api/v1/auth/logout` (with access token + refresh token) → 200; `POST /api/v1/auth/refresh` with old token → 401.

### Implementation for User Story 4

- [x] T021 [US4] Implement `logout(userId, rawRefreshToken)` in `src/services/auth.service.ts` — hash incoming token; find row where `token = hash AND user_id = userId`; if found and `revoked_at IS NULL`, set `revoked_at = now()`; always return void (idempotent — 200 even if not found)
- [x] T022 [US4] Add `logout` handler to `src/controllers/auth.controller.ts` — Zod schema: `{ refresh_token: z.string().min(1) }`; handler requires `req.user` from `authenticate` middleware; call `authService.logout(req.user.id, refresh_token)`; return `{ success: true, message: 'Đăng xuất thành công' }`
- [x] T023 [US4] Add `POST /logout` route to `src/routes/auth.routes.ts` with `authenticate` middleware BEFORE controller: `router.post('/logout', authenticate, authController.logout)`
- [x] T024 [US4] Write integration tests for US4 in `src/__tests__/routes/auth.test.ts`:
  - Valid access token + valid refresh token → 200
  - After logout, old refresh token → 401 on `POST /refresh`
  - Missing `Authorization` header → 401 `UNAUTHORIZED`
  - Already-revoked refresh token in body → still 200 (idempotent)

**Checkpoint**: `npm test -- auth` passes all US1–US4 cases. Full auth flow complete.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [x] T025 [P] Update `src/__tests__/helpers/index.ts` — export a `hashPassword(plain: string)` helper so test files can create users with known passwords without duplicating bcrypt calls
- [x] T026 [P] Update `rcfeild-be/SCHEMA.md` — add a note under `refresh_tokens` row: "token col stores SHA-256 hash of raw token; revoked_at set on logout/rotation"
- [x] T027 Run full test suite `npm test` and fix any regressions from mounting the auth router (e.g., route conflicts, middleware order)
- [x] T028 [P] Verify Zod validation error shape from `auth.controller.ts` is handled by the global error middleware in `src/middlewares/error.middleware.ts` — add `ZodError` handling if not already present

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Phase 2 — first MVP deliverable
- **US2 (Phase 4)**: Depends on Phase 2; parallel with US3 after Phase 2 complete
- **US3 (Phase 5)**: Depends on Phase 2 and `issueTokenPair` from US1 (T007); parallel with US2
- **US4 (Phase 6)**: Depends on `authenticate` middleware (already exists) and `issueTokenPair` (T007); can start after Phase 3 foundational service work
- **Polish (Phase 7)**: Depends on all user story phases complete

### User Story Dependencies

- **US1 (P1)**: No story dependencies — implement first
- **US2 (P2)**: Shares `issueTokenPair` from US1 (T007); implement after T007 is done
- **US3 (P2)**: Shares `issueTokenPair` from US1 (T007); can be done in parallel with US2
- **US4 (P3)**: Depends on `authenticate` middleware (already in codebase); shares `issueTokenPair` from US1

### Within Each Phase

- T003 and T004 → parallel (different files)
- T005 → after T003 + T004
- T007 → before T008 (service before controller)
- T008 → before T009 (controller before route)
- T009 → before T010 (route before mounting)
- T012 → after T007–T011 (tests after implementation, or write first in TDD style)

---

## Parallel Opportunities

### Phase 2 (Foundational)

```bash
# Run in parallel:
Task T003: "Create User entity in src/models/user.model.ts"
Task T004: "Create RefreshToken entity in src/models/refresh-token.model.ts"
Task T006: "Extend createTestUser helper in src/__tests__/helpers/index.ts"
```

### Phase 4 + Phase 5 (after Phase 3 complete)

```bash
# US2 and US3 can be implemented in parallel:
Dev A: Phase 4 (US2 — Google OAuth)
Dev B: Phase 5 (US3 — Token Refresh)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001–T002)
2. Complete Phase 2: Foundational (T003–T006) — CRITICAL, blocks everything
3. Complete Phase 3: User Story 1 (T007–T012)
4. **STOP and VALIDATE**: `npm test -- auth` → all US1 tests pass
5. Manual smoke test: real login with a seeded user
6. Deploy if ready

### Incremental Delivery

1. Setup + Foundational → entities registered, helper extended
2. US1 → email/password login working → deploy MVP
3. US2 + US3 in parallel → Google login + token refresh
4. US4 → logout
5. Polish → full suite green

---

## Notes

- `[P]` tasks touch different files and have no shared dependencies — safe to run in parallel
- `[US#]` label maps each task to a specific user story for traceability
- `authenticate` middleware already exists at `src/middlewares/auth.middleware.ts` — do not rewrite
- `AppError` class already exists at `src/types/index.ts` — use it for all thrown errors
- Global error middleware at `src/middlewares/error.middleware.ts` already handles `AppError` — verify it also handles `ZodError` (T028)
- No new DB migration needed — `users` and `refresh_tokens` tables already exist
