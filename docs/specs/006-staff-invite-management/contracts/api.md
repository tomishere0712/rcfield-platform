# API Contracts: Staff Management — Provider Invite Flow

Base path: `/api/v1`

---

## Provider Endpoints

All require: `authenticate` + `authorize(PROVIDER)` + `requireActiveProvider`

---

### 1. List Staff

```
GET /provider/staff
```

**Query params**: `cafe_id` (optional UUID — filter by branch)

**Response 200**:
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "email": "staff@example.com",
      "fullName": "Nguyễn Văn A",
      "phone": "0901234567",
      "cafeId": "uuid",
      "cafeName": "RCField Quận 1",
      "status": "ACTIVE",
      "createdAt": "2026-06-01T10:00:00Z",
      "activatedAt": "2026-06-02T08:00:00Z"
    }
  ]
}
```

**Status values**: `"PENDING"` | `"ACTIVE"` | `"DISABLED"`

---

### 2. Invite Staff (modified existing endpoint)

```
POST /provider/staff
```

**Body**:
```json
{
  "cafe_id": "uuid",
  "full_name": "Nguyễn Văn A",
  "email": "staff@example.com",
  "phone": "0901234567"        // optional
}
```

> Note: `password` field removed — staff sets their own password via invite link.

**Response 201**:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "staff@example.com",
    "fullName": "Nguyễn Văn A",
    "cafeId": "uuid",
    "status": "PENDING",
    "emailSent": true
  }
}
```

`emailSent: false` when Brevo fails — account still created; Provider can resend.

**Error responses**:
| Code | HTTP | Condition |
|------|------|-----------|
| `EMAIL_ALREADY_EXISTS` | 409 | Email registered with any role |
| `CAFE_NOT_FOUND` | 404 | Cafe doesn't exist or not owned by Provider |

---

### 3. Deactivate Staff

```
PATCH /provider/staff/:staffId/deactivate
```

**No body required.**

**Response 200**:
```json
{ "success": true, "data": { "id": "uuid", "status": "DISABLED" } }
```

**Error responses**:
| Code | HTTP | Condition |
|------|------|-----------|
| `STAFF_NOT_FOUND` | 404 | Staff doesn't belong to this Provider |
| `STAFF_ALREADY_DISABLED` | 409 | Already disabled |

---

### 4. Reactivate Staff

```
PATCH /provider/staff/:staffId/reactivate
```

**No body required.**

**Response 200**:
```json
{ "success": true, "data": { "id": "uuid", "status": "ACTIVE" } }
```

**Error responses**:
| Code | HTTP | Condition |
|------|------|-----------|
| `STAFF_NOT_FOUND` | 404 | Staff doesn't belong to this Provider |
| `STAFF_NOT_DISABLED` | 409 | Not currently disabled |
| `STAFF_PENDING_ACTIVATION` | 409 | Still pending — use resend-invite instead |

---

### 5. Resend Invite

```
POST /provider/staff/:staffId/resend-invite
```

**No body required.** Creates new token, invalidates old one, sends new email.

**Response 200**:
```json
{ "success": true, "data": { "emailSent": true } }
```

**Error responses**:
| Code | HTTP | Condition |
|------|------|-----------|
| `STAFF_NOT_FOUND` | 404 | Staff doesn't belong to this Provider |
| `STAFF_ALREADY_ACTIVE` | 409 | Account already activated — resend not applicable |

---

## Public Endpoints (no authentication)

These live under `/api/v1/auth/staff-invite/`. No `authenticate` middleware.

---

### 6. Validate Invite Token

```
GET /auth/staff-invite/validate?token=<raw_token>
```

**Response 200**:
```json
{
  "success": true,
  "data": {
    "email": "staff@example.com",
    "fullName": "Nguyễn Văn A"
  }
}
```

**Error responses**:
| Code | HTTP | Condition |
|------|------|-----------|
| `INVITE_TOKEN_INVALID` | 400 | Token not found or already used |
| `INVITE_TOKEN_EXPIRED` | 410 | Token past 48h expiry |

---

### 7. Activate Staff Account

```
POST /auth/staff-invite/activate
```

**Body**:
```json
{
  "token": "<raw_token>",
  "password": "MyPassword123"
}
```

Password validation: minimum 8 characters.

**Response 200**:
```json
{
  "success": true,
  "data": {
    "access_token": "eyJ...",
    "refresh_token": "abc123...",
    "user": {
      "id": "uuid",
      "email": "staff@example.com",
      "fullName": "Nguyễn Văn A",
      "role": "STAFF",
      "cafeId": "uuid"
    }
  }
}
```

On success: sets `users.is_active = true`, `users.password_hash = bcrypt(password)`, marks token `used_at = now()`, issues JWT pair.

**Error responses**:
| Code | HTTP | Condition |
|------|------|-----------|
| `INVITE_TOKEN_INVALID` | 400 | Token not found or already used |
| `INVITE_TOKEN_EXPIRED` | 410 | Token past 48h expiry |
| `VALIDATION_ERROR` | 422 | Password < 8 chars |

---

## Staff Endpoints

Require: `authenticate` + `authorize(STAFF)`

---

### 8. Today's Bookings

```
GET /staff/today-bookings
```

No query params. `cafeId` is read from `req.user.cafeId` (embedded in JWT).

**Response 200**:
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "customerName": "Khách A",
      "customerPhone": "0912345678",
      "startTime": "2026-06-08T09:00:00Z",
      "endTime": "2026-06-08T11:00:00Z",
      "status": "CONFIRMED",
      "mode": "RENTAL",
      "vehicleName": "RC Car #3"
    }
  ]
}
```

Returns bookings for today (server timezone: UTC+7) where `cafe_id = req.user.cafeId` and `status IN ('CONFIRMED', 'ACTIVE', 'EXTENDING', 'CHECKING_OUT')`.
