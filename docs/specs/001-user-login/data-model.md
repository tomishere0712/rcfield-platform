# Data Model: User Login

**Feature**: 001-user-login | **Date**: 2026-05-14

Both entities map to **existing tables** in the initial migration (`1747180800000-InitialSchema.ts`). No new migration is needed for this feature.

---

## Entity: User

**Table**: `users`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | UUID | PK, generated | |
| `email` | VARCHAR(255) | UNIQUE NOT NULL | Lowercased on write |
| `password_hash` | TEXT | NULL | NULL for GOOGLE-only accounts |
| `role` | `user_role` enum | NOT NULL | CUSTOMER / PROVIDER / STAFF / ADMIN |
| `auth_provider` | `auth_provider` enum | NOT NULL DEFAULT LOCAL | LOCAL / GOOGLE |
| `google_id` | VARCHAR(255) | NULL UNIQUE | Set on first Google login |
| `is_active` | BOOLEAN | NOT NULL DEFAULT true | Admin-controlled lockout |
| `trust_score` | INTEGER | NOT NULL DEFAULT 0 | Not used in auth flow |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT now() | |
| `updated_at` | TIMESTAMPTZ | NOT NULL DEFAULT now() | |
| `deleted_at` | TIMESTAMPTZ | NULL | Soft delete |

**TypeORM file**: `src/models/user.model.ts`

**Key validation rules**:
- `email` must pass `z.string().email()` — reject before DB lookup
- `password` must be `z.string().min(8)` at login (don't expose hash format)
- Google login auto-creates with `role = CUSTOMER`, `auth_provider = GOOGLE`

---

## Entity: RefreshToken

**Table**: `refresh_tokens`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | UUID | PK, generated | |
| `user_id` | UUID | FK → users NOT NULL | Cascade delete |
| `token` | TEXT | NOT NULL | SHA-256 hash of raw token |
| `expires_at` | TIMESTAMPTZ | NOT NULL | now() + 7 days |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT now() | |
| `revoked_at` | TIMESTAMPTZ | NULL | Set on logout or rotation |

**TypeORM file**: `src/models/refresh-token.model.ts`

**Key business rules**:
- `revoked_at IS NULL AND expires_at > now()` → token is valid
- On rotation: set `revoked_at = now()`, create new row
- On theft detection (revoked token reuse): set `revoked_at = now()` on ALL rows where `user_id = X AND revoked_at IS NULL`

---

## Redis Keys (not entities, but part of the data model)

| Key pattern | TTL | Value | Purpose |
|-------------|-----|-------|---------|
| `auth:failed:{email}` | 900s | integer count | Failed login counter per account |
| `auth:rl:{ip}` | 900s | managed by express-rate-limit | Per-IP request counter |

---

## Enum Values (already in DB as PostgreSQL enums)

```
user_role:      CUSTOMER | PROVIDER | STAFF | ADMIN
auth_provider:  LOCAL | GOOGLE
```

---

## Relationships

```
users 1──* refresh_tokens  (user_id FK, cascade on delete)
```

No new relationships introduced by this feature.
