# API Contracts: Auth

**Feature**: 001-user-login | **Date**: 2026-05-14
**Base path**: `/api/v1/auth`
**Auth middleware**: Public endpoints — no `authenticate` middleware. Logout requires `authenticate`.

---

## POST /api/v1/auth/login

Email + password login.

**Request**

```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "plaintextPassword"
}
```

| Field | Type | Validation |
|-------|------|-----------|
| `email` | string | required, valid email format |
| `password` | string | required, min 8 characters |

**Responses**

```jsonc
// 200 OK — login successful
{
  "success": true,
  "data": {
    "access_token": "eyJhbGci...",   // JWT, expires in 1 hour
    "refresh_token": "a3f9b2...",    // opaque hex string, expires in 7 days
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "role": "CUSTOMER"             // CUSTOMER | PROVIDER | STAFF | ADMIN
    }
  }
}

// 400 Bad Request — validation failed
{
  "success": false,
  "code": "VALIDATION_ERROR",
  "errors": [{ "field": "email", "message": "Invalid email" }]
}

// 401 Unauthorized — wrong credentials (same message for wrong email OR wrong password)
{
  "success": false,
  "code": "INVALID_CREDENTIALS",
  "message": "Email hoặc mật khẩu không đúng"
}

// 403 Forbidden — account locked (admin-disabled or brute-force temporary lock)
{
  "success": false,
  "code": "ACCOUNT_LOCKED",
  "message": "Tài khoản bị khoá"
}

// 429 Too Many Requests — per-IP rate limit exceeded
{
  "success": false,
  "code": "TOO_MANY_REQUESTS",
  "message": "Quá nhiều yêu cầu, vui lòng thử lại sau"
}
```

**Business rules applied**:
- Check Redis `auth:failed:{email}` — if ≥ 5, return 403 before any DB lookup
- Check `users.is_active` — if false, return 403 (increment failed counter first? No — `is_active` check happens after user found but before bcrypt compare)
- On bcrypt failure: INCR Redis counter (TTL 900s), return 401
- On success: reset Redis counter (DEL `auth:failed:{email}`), create refresh token row

---

## POST /api/v1/auth/google

Google OAuth2 login — verify ID token server-side.

**Request**

```http
POST /api/v1/auth/google
Content-Type: application/json

{
  "id_token": "eyJhbGciOiJSUzI1NiIs..."
}
```

| Field | Type | Validation |
|-------|------|-----------|
| `id_token` | string | required, non-empty |

**Responses**

```jsonc
// 200 OK — login or auto-registration successful
{
  "success": true,
  "data": {
    "access_token": "eyJhbGci...",
    "refresh_token": "a3f9b2...",
    "user": {
      "id": "uuid",
      "email": "user@gmail.com",
      "role": "CUSTOMER"
    }
  }
}

// 401 Unauthorized — invalid or expired Google ID token
{
  "success": false,
  "code": "GOOGLE_AUTH_FAILED",
  "message": "Xác thực Google thất bại"
}

// 403 Forbidden — account locked
{
  "success": false,
  "code": "ACCOUNT_LOCKED",
  "message": "Tài khoản bị khoá"
}
```

**Business rules applied**:
- Verify `id_token` via `google-auth-library` `OAuth2Client.verifyIdToken({ idToken, audience: GOOGLE_CLIENT_ID })`
- Extract `email`, `sub` (google_id), `name` from payload
- If email exists with `auth_provider = LOCAL`: link (set `google_id`, `auth_provider = GOOGLE`) and login
- If email exists with `auth_provider = GOOGLE`: login normally
- If email not found: create new user `{ role: CUSTOMER, auth_provider: GOOGLE, google_id: sub, is_active: true }`
- Check `is_active` after user found/created

---

## POST /api/v1/auth/refresh

Exchange a valid refresh token for a new access + refresh token pair.

**Request**

```http
POST /api/v1/auth/refresh
Content-Type: application/json

{
  "refresh_token": "a3f9b2..."
}
```

**Responses**

```jsonc
// 200 OK — tokens rotated
{
  "success": true,
  "data": {
    "access_token": "eyJhbGci...",
    "refresh_token": "d8e1c4..."   // new token — old one is now revoked
  }
}

// 401 Unauthorized — expired, not found, or already revoked
{
  "success": false,
  "code": "INVALID_REFRESH_TOKEN",
  "message": "Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại"
}

// 401 Unauthorized — revoked token reused (theft detected)
// Same response code/shape, but ALL sessions for the user are wiped server-side
{
  "success": false,
  "code": "INVALID_REFRESH_TOKEN",
  "message": "Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại"
}
```

**Business rules applied**:
- Hash incoming token: `SHA-256(refresh_token)`
- Look up in `refresh_tokens` where `token = hash`
- If not found → 401
- If found and `revoked_at IS NOT NULL` → theft detected: set `revoked_at = now()` on ALL rows for `user_id` → 401
- If found and `expires_at <= now()` → 401
- If valid: set `revoked_at = now()` on old row, create new row, return new pair

---

## POST /api/v1/auth/logout

Revoke the current session's refresh token.

**Middleware**: `authenticate` (verifies access token)

**Request**

```http
POST /api/v1/auth/logout
Authorization: Bearer eyJhbGci...
Content-Type: application/json

{
  "refresh_token": "a3f9b2..."
}
```

**Responses**

```jsonc
// 200 OK — session revoked
{
  "success": true,
  "message": "Đăng xuất thành công"
}

// 401 Unauthorized — missing or invalid access token
{
  "success": false,
  "code": "UNAUTHORIZED",
  "message": "Không có quyền truy cập"
}
```

**Business rules applied**:
- `authenticate` middleware validates the access token JWT
- Find refresh token row by `SHA-256(refresh_token)` AND `user_id = req.user.id`
- Set `revoked_at = now()` (idempotent — if already revoked, still return 200)
- Return 200 regardless of whether the refresh token was found (avoid token enumeration)

---

## Error code reference

| Code | HTTP | Trigger |
|------|------|---------|
| `VALIDATION_ERROR` | 400 | Zod schema failure |
| `INVALID_CREDENTIALS` | 401 | Wrong email or password |
| `GOOGLE_AUTH_FAILED` | 401 | Google ID token invalid |
| `INVALID_REFRESH_TOKEN` | 401 | Refresh token invalid/expired/revoked |
| `UNAUTHORIZED` | 401 | Missing/invalid access token |
| `ACCOUNT_LOCKED` | 403 | `is_active = false` OR ≥5 failed attempts |
| `TOO_MANY_REQUESTS` | 429 | Per-IP rate limit exceeded |
