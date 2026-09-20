# Research: Staff Management — Provider Invite Flow

## Decision 1: Pending State Representation

**Decision**: Derive the "Pending" status from `is_active = false` + existence of an active (unused, not expired) invite token. No new column on `users` table.

**Rationale**: Avoids adding an enum/column to the `users` table. The invite token lifecycle *is* the Pending lifecycle — a staff account is Pending exactly while it has an outstanding invite. When activated, `is_active` flips to `true` and the token is marked `used_at`. When manually disabled, `is_active = false` and no active token exists.

**State derivation logic** (list endpoint):
```
has_active_token AND is_active = false → "PENDING"
is_active = true                       → "ACTIVE"
no_active_token AND is_active = false  → "DISABLED"
```

**Alternatives considered**:
- Add `account_status ENUM('PENDING','ACTIVE','DISABLED')` to `staff_cafe_assignments` — rejected: duplicates information already captured by `is_active` + token state; two sources of truth risk diverging.
- Add `status` column to `users` — rejected: affects all user types, over-broad change for a staff-only concern.

---

## Decision 2: cafeId in JWT for STAFF users

**Decision**: Include `cafeId` in the JWT payload for STAFF-role users. Modify `issueTokenPair` in `auth.service.ts` to call `getAssignedCafeId(user.id)` when `user.role === STAFF` and embed it in the token as `cafeId`. Extend `AuthPayload` in `types/index.ts` with optional `cafeId?: string`.

**Rationale**: `getAssignedCafeId()` already exists in `auth.service.ts` and is called on every login response. Embedding in the JWT eliminates a DB lookup on every authenticated staff request. A staff member's cafe assignment doesn't change during normal operation — if they are reassigned, the new JWT on their next login reflects the change. This mirrors how `registrationStatus` is embedded in the PROVIDER login response.

**Alternatives considered**:
- DB lookup in a staff middleware on every request — rejected: adds latency per request; cafeId is stable auth data.
- Separate `/staff/me` endpoint to fetch cafeId — rejected: FE would need an extra round-trip before any staff feature works.

---

## Decision 3: Invite Token Storage

**Decision**: New `staff_invite_tokens` DB table, following exact same pattern as `password_reset_tokens` entity. Token value stored as SHA-256 hash of the raw token (never store raw in DB).

**Rationale**: Tokens must survive server restarts. The `password_reset_tokens` pattern is already proven in the codebase: DB-backed, hashed, with `expires_at` and `used_at` columns. Reusing this pattern is consistent and requires no new infrastructure.

**Token generation**: `crypto.randomBytes(32).toString('hex')` — 256-bit raw token, hashed with SHA-256 before storage. Raw token goes in the email URL.

**TTL**: 48 hours from creation (`expires_at = now() + 48h`).

**Resend behavior**: Delete all existing tokens for the user, create a new one. This automatically invalidates old tokens without a separate "revoked" flag.

**Alternatives considered**:
- Redis with TTL — rejected: tokens need to survive cache eviction/restart; a Redis failure would break all pending invite links.
- JWT as invite token — rejected: can't be invalidated before expiry (no blacklist); harder to detect "already used".

---

## Decision 4: Invite Flow Changes to `createStaffForProvider`

**Decision**: Modify the existing `createStaffForProvider` function to:
1. Create user with `is_active: false` (was `true`)
2. Generate invite token + persist hashed value to `staff_invite_tokens`
3. Call `emailService.sendStaffInvite()` — on failure, log error but do NOT throw (account persists in Pending state per Q2 clarification)

The existing `POST /provider/staff` endpoint becomes the invite endpoint. No new endpoint needed for the invite creation step.

**Rationale**: Minimal diff from the existing implementation. The semantic is the same — creating a staff account — the only change is that the account starts inactive and needs email activation. Reusing the existing endpoint avoids route proliferation.

**Alternatives considered**:
- New `POST /provider/staff/invite` endpoint — rejected: duplicates ownership validation logic already in `createStaffForProvider`.

---

## Decision 5: Account Activation Endpoint Placement

**Decision**: Two new public (unauthenticated) endpoints under `/api/v1/auth/staff-invite/`:
- `GET /api/v1/auth/staff-invite/validate?token=xxx` — validates token and returns staff email (FE shows "You're activating account for X@email.com")
- `POST /api/v1/auth/staff-invite/activate` — accepts `{ token, password }`, activates account, returns JWT pair for immediate login

Both in new `staff-invite.routes.ts` (no `authenticate` middleware), new `staff-invite.controller.ts`.

**Rationale**: Matches the existing pattern of password-reset being public endpoints under `/auth/`. The invite token is the authentication mechanism — no JWT needed. Splitting into validate + activate allows the FE to show a confirmation screen before the password form, improving UX.

**Alternatives considered**:
- Single `POST /auth/staff-invite/activate` only — rejected: FE can't show the "activating for X@email.com" confirmation without a pre-validation call; UX degraded.
- Add to existing `auth.routes.ts` inline — feasible but makes the file larger; a dedicated routes file is cleaner and follows the router-per-domain pattern.
