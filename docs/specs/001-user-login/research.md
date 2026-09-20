# Research: User Login

**Feature**: 001-user-login | **Date**: 2026-05-14

---

## Decision 1: Google OAuth2 implementation approach

**Decision**: Frontend gets a Google ID token (via `@react-oauth/google` or Google One Tap) and POSTs it to `POST /api/v1/auth/google`. Backend verifies the ID token server-side using `google-auth-library`'s `OAuth2Client.verifyIdToken()`.

**Rationale**: The spec states "OAuth2 Authorization Code — không phải implicit flow." The ID-token approach satisfies this because verification happens on the server (not the client), and the token originates from a server-initiated grant. It's also simpler than implementing a full server-side code exchange (no redirect endpoint needed in the REST API, no CORS redirect issues).

**Alternatives considered**:
- Full server-side code exchange (`GET /auth/google` → redirect → `GET /auth/google/callback`): More complex, requires server-side session or cookie for redirect state, harder to test with Supertest. Adds a redirect endpoint to the REST API which doesn't fit the React SPA pattern.
- Passport.js with `passport-google-oauth20`: Heavy abstraction, forces Express session middleware, overkill for a single OAuth provider.

**New dependency**: `npm install google-auth-library` (~lightweight, no `googleapis` megapackage).

---

## Decision 2: Refresh token storage

**Decision**: Store `SHA-256(refreshToken)` in the `refresh_tokens.token` column. The raw token (a 64-char hex string of `crypto.randomBytes(32)`) is returned to the client but never stored. On validation, hash the incoming token and compare with DB.

**Rationale**: If the DB is compromised, attackers cannot use the stored hash to forge sessions because SHA-256 is one-way. The `refresh_tokens` table already has a `token TEXT` column (from the initial migration) — no migration needed, just store the hash there instead of the raw token.

**Alternatives considered**:
- Store raw token: Simple but a DB compromise exposes all active sessions immediately.
- bcrypt for refresh token: Too slow for token validation on every API call. SHA-256 is appropriate here (refresh tokens already have sufficient entropy from `crypto.randomBytes(32)`).

---

## Decision 3: Brute-force protection mechanism

**Decision**: Use Redis keys with TTL for per-account failed attempt tracking:
- Key: `auth:failed:{email}` → INCR on each failure, expire 900s (15 min)
- If count ≥ 5 → return `ACCOUNT_LOCKED` (same TTL window)
- Key: `auth:lockout:{email}` is not needed — the counter itself IS the lockout (if ≥ 5, locked)

Per-IP rate limiting uses `express-rate-limit` (already installed) with a `RedisStore` wrapper — 100 requests per 15 min per IP for the `/api/v1/auth/*` routes.

**Rationale**: Redis TTL means lockout auto-expires after 15 minutes with zero cron overhead. The spec says "Khoá tài khoản do brute force là tạm thời (15 phút), không cần ADMIN can thiệp." This approach satisfies that exactly.

**Alternatives considered**:
- Store `failed_attempts` + `locked_until` in the `users` table: Requires a migration, adds write pressure to the users table on every failed login, and doesn't auto-expire (needs cron to reset).
- Pure `express-rate-limit` (IP only): Doesn't protect against distributed attacks from multiple IPs targeting one account.

---

## Decision 4: Refresh token rotation and theft detection

**Decision**:
- On every `POST /api/v1/auth/refresh`: mark old refresh token as revoked (`revoked_at = now()`), issue new access token + new refresh token pair.
- If a request comes in with a **revoked** refresh token: invalidate ALL non-revoked refresh tokens for that `user_id` (full session wipe) and return `INVALID_REFRESH_TOKEN`. This detects token theft where the attacker has the old token and the legitimate user has the new one.

**Rationale**: RFC 6819 recommends refresh token rotation. The `refresh_tokens` table already has a `revoked_at` column. Session wipe on reuse prevents replay attacks.

**Alternatives considered**:
- Single-use without rotation: Simpler but doesn't detect theft.
- No rotation (long-lived static refresh token): High risk if token leaks.

---

## Decision 5: Account lockout vs is_active

**Decision**: Two separate concepts:
- `users.is_active = false`: Permanent admin-set lockout → `ACCOUNT_LOCKED` message, cannot be unlocked by user.
- Redis `auth:failed:{email}` ≥ 5: Temporary brute-force lockout → `ACCOUNT_LOCKED` message, auto-expires in 15 min.
- Both return the same HTTP 403 with code `ACCOUNT_LOCKED` (spec FR-006: don't differentiate error reasons to avoid information disclosure... but wait, FR-005 specifically says to reject "tài khoản bị khoá" so we do tell the user it's locked, just not WHY it's locked).

**Rationale**: Spec says `is_active = false` should return "thông báo tài khoản bị khoá." Same message for brute-force lockout is acceptable and gives no extra information to attackers.

---

## Decision 6: JWT signing

**Decision**: Use `HS256` (HMAC-SHA-256) with separate secrets for access and refresh tokens (already configured as `JWT_SECRET` and `JWT_REFRESH_SECRET` in `env.ts`). Access token payload: `{ sub: userId, role, iat, exp }`. Refresh token is opaque (random bytes, not a JWT).

**Rationale**: HS256 is simpler than RS256 for a single-server deployment. Two secrets mean compromising one doesn't affect the other. The refresh token being opaque (not a JWT) means its validity is always checked against the DB — a revoked refresh token cannot be used even if it hasn't technically "expired" yet.

**Alternatives considered**:
- RS256 (asymmetric): Useful for distributed validation, not needed here since there's one API server.
- Refresh token as JWT: Would allow refresh without a DB lookup, but then revocation requires a blocklist (same DB cost anyway) or waiting for expiry.
