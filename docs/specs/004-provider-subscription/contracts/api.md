# API Contracts: Provider Onboarding & Subscription Management

**Date**: 2026-05-25
**Base URL**: `/api/v1`
**Auth**: Bearer JWT

---

## Provider Registration

### POST /auth/register-provider

**Auth**: Public

**Description**: Register a new provider account. Account is placed in `PENDING` status until an Admin approves the registration. No subscription is created at this point.

**Request Body**:
```json
{
  "email": "owner@rcbusiness.vn",
  "password": "Str0ngP@ss!",
  "full_name": "Nguyen Van A",
  "phone": "0901234567",
  "business_name": "RC Arena Ha Noi",
  "business_description": "Chuỗi sân xe RC chuyên nghiệp tại Hà Nội"
}
```

**Response 200**:
```json
{
  "message": "Đăng ký thành công. Vui lòng chờ admin duyệt."
}
```

**Errors**: `409 EMAIL_EXISTS` | `400 VALIDATION_ERROR`

---

## Provider Dashboard

### GET /provider/subscription

**Auth**: Bearer – PROVIDER

**Description**: Get the current provider's active subscription status, plan limits, and current-period usage. Returns `404` if the provider has never had a subscription (i.e., registration not yet approved).

**Response 200**:
```json
{
  "plan": {
    "id": "plan_uuid",
    "name": "STARTER",
    "branch_limit": 3,
    "ai_quota_per_month": 500,
    "channel_limit": 2
  },
  "subscription": {
    "id": "sub_uuid",
    "status": "ACTIVE",
    "started_at": "2026-05-01T00:00:00.000Z",
    "expires_at": "2026-06-01T00:00:00.000Z",
    "grace_ends_at": "2026-06-08T00:00:00.000Z",
    "ai_messages_used": 120
  },
  "unread_notifications": 3
}
```

**Errors**: `404 NO_SUBSCRIPTION` | `401 UNAUTHORIZED`

---

### POST /provider/payment-requests

**Auth**: Bearer – PROVIDER

**Description**: Submit a manual bank-transfer payment request for a subscription plan. The provider supplies the bank-transfer reference so an Admin can verify and confirm. Only one `PENDING` request is allowed at a time.

**Request Body**:
```json
{
  "plan_id": "plan_uuid",
  "transfer_reference": "RCF-20260525-0042",
  "transfer_date": "2026-05-25",
  "transfer_amount": 500000
}
```

**Response 200**:
```json
{
  "id": "pr_uuid",
  "status": "PENDING",
  "created_at": "2026-05-25T10:30:00.000Z"
}
```

**Errors**: `400 DUPLICATE_PENDING_REQUEST` | `400 VALIDATION_ERROR` | `404 PLAN_NOT_FOUND`

---

### GET /provider/payment-requests

**Auth**: Bearer – PROVIDER

**Description**: List the current provider's own payment requests, newest first. Paginated.

**Query Params**:
```
page    integer  optional  default: 1
limit   integer  optional  default: 20  max: 100
```

**Response 200**:
```json
{
  "data": [
    {
      "id": "pr_uuid",
      "plan": {
        "id": "plan_uuid",
        "name": "STARTER"
      },
      "status": "PENDING",
      "transfer_reference": "RCF-20260525-0042",
      "transfer_date": "2026-05-25",
      "transfer_amount": 500000,
      "admin_notes": null,
      "created_at": "2026-05-25T10:30:00.000Z"
    }
  ],
  "total": 1
}
```

**Errors**: `401 UNAUTHORIZED`

---

## Notifications

### GET /provider/notifications

**Auth**: Bearer – PROVIDER

**Description**: List in-app notifications for the current provider, newest first. Supports optional filtering to unread-only items.

**Query Params**:
```
page         integer  optional  default: 1
limit        integer  optional  default: 20  max: 100
unread_only  boolean  optional  default: false
```

**Response 200**:
```json
{
  "data": [
    {
      "id": "notif_uuid",
      "type": "SUBSCRIPTION_EXPIRING",
      "title": "Gói dịch vụ sắp hết hạn",
      "message": "Gói STARTER của bạn sẽ hết hạn vào ngày 01/06/2026. Vui lòng gia hạn để tránh gián đoạn dịch vụ.",
      "read_at": null,
      "created_at": "2026-05-25T08:00:00.000Z"
    }
  ],
  "total": 5,
  "unread_count": 3
}
```

**Errors**: `401 UNAUTHORIZED`

---

### PUT /provider/notifications/:id/read

**Auth**: Bearer – PROVIDER

**Description**: Mark a single notification as read. Sets `read_at` to the current timestamp. No-op if already read (still returns success).

**Response 200**:
```json
{
  "success": true
}
```

**Errors**: `404 NOT_FOUND` | `403 FORBIDDEN`

---

### PUT /provider/notifications/read-all

**Auth**: Bearer – PROVIDER

**Description**: Mark all unread notifications belonging to the current provider as read in a single operation. Returns the count of records updated.

**Response 200**:
```json
{
  "success": true,
  "updated": 3
}
```

**Errors**: `401 UNAUTHORIZED`

---

## Admin – Provider Management

### GET /admin/providers

**Auth**: Bearer – ADMIN

**Description**: List all provider accounts with optional status filtering. Returns summary rows including current subscription snapshot.

**Query Params**:
```
status  enum     optional  PENDING | ACTIVE | REJECTED | SUSPENDED
page    integer  optional  default: 1
limit   integer  optional  default: 20  max: 100
```

**Response 200**:
```json
{
  "data": [
    {
      "id": "user_uuid",
      "email": "owner@rcbusiness.vn",
      "full_name": "Nguyen Van A",
      "business_name": "RC Arena Ha Noi",
      "registration_status": "ACTIVE",
      "created_at": "2026-04-10T07:00:00.000Z",
      "subscription": {
        "plan_name": "STARTER",
        "status": "ACTIVE",
        "expires_at": "2026-06-01T00:00:00.000Z"
      }
    }
  ],
  "total": 12
}
```

**Errors**: `400 VALIDATION_ERROR` | `403 FORBIDDEN`

---

### GET /admin/providers/:id

**Auth**: Bearer – ADMIN

**Description**: Get full details for a single provider account, including profile, current subscription, and full payment request history.

**Response 200**:
```json
{
  "user": {
    "id": "user_uuid",
    "email": "owner@rcbusiness.vn",
    "full_name": "Nguyen Van A",
    "phone": "0901234567",
    "registration_status": "ACTIVE",
    "created_at": "2026-04-10T07:00:00.000Z"
  },
  "profile": {
    "business_name": "RC Arena Ha Noi",
    "business_description": "Chuỗi sân xe RC chuyên nghiệp tại Hà Nội"
  },
  "subscription": {
    "id": "sub_uuid",
    "plan": {
      "id": "plan_uuid",
      "name": "STARTER",
      "branch_limit": 3,
      "ai_quota_per_month": 500,
      "channel_limit": 2
    },
    "status": "ACTIVE",
    "started_at": "2026-05-01T00:00:00.000Z",
    "expires_at": "2026-06-01T00:00:00.000Z",
    "grace_ends_at": "2026-06-08T00:00:00.000Z",
    "ai_messages_used": 120
  },
  "payment_requests": [
    {
      "id": "pr_uuid",
      "plan": { "id": "plan_uuid", "name": "STARTER" },
      "status": "CONFIRMED",
      "transfer_reference": "RCF-20260501-0010",
      "transfer_date": "2026-05-01",
      "transfer_amount": 500000,
      "admin_notes": "Đã xác nhận chuyển khoản",
      "created_at": "2026-05-01T09:00:00.000Z"
    }
  ]
}
```

**Errors**: `404 NOT_FOUND` | `403 FORBIDDEN`

---

### POST /admin/providers/:id/approve

**Auth**: Bearer – ADMIN

**Description**: Approve a `PENDING` provider registration. Side effects (executed atomically):
1. Sets `registration_status` → `ACTIVE`.
2. Creates a `TRIAL` subscription using the platform's default trial plan (duration defined by system config).
3. Creates the provider's first branch record.
4. Sends an in-app notification to the provider.

**Request Body**: *(empty — `{}` or omit body)*

**Response 200**:
```json
{
  "success": true,
  "subscription_id": "sub_uuid",
  "branch_id": "branch_uuid"
}
```

**Errors**: `400 ALREADY_PROCESSED` | `404 NOT_FOUND` | `403 FORBIDDEN`

---

### POST /admin/providers/:id/reject

**Auth**: Bearer – ADMIN

**Description**: Reject a `PENDING` provider registration. Sets `registration_status` → `REJECTED` and notifies the provider with the given reason.

**Request Body**:
```json
{
  "reason": "Thông tin doanh nghiệp không hợp lệ."
}
```

**Response 200**:
```json
{
  "success": true
}
```

**Errors**: `400 ALREADY_PROCESSED` | `400 VALIDATION_ERROR` | `404 NOT_FOUND` | `403 FORBIDDEN`

---

### POST /admin/providers/:id/suspend

**Auth**: Bearer – ADMIN

**Description**: Suspend an `ACTIVE` provider account. Sets `registration_status` → `SUSPENDED`. All associated staff sessions are invalidated. Sends an in-app notification to the provider.

**Request Body**:
```json
{
  "reason": "Vi phạm điều khoản sử dụng."
}
```

**Response 200**:
```json
{
  "success": true
}
```

**Errors**: `400 INVALID_STATUS_TRANSITION` | `400 VALIDATION_ERROR` | `404 NOT_FOUND` | `403 FORBIDDEN`

---

### POST /admin/providers/:id/unsuspend

**Auth**: Bearer – ADMIN

**Description**: Restore a `SUSPENDED` provider account back to `ACTIVE`. Sends an in-app notification to the provider.

**Request Body**: *(empty — `{}` or omit body)*

**Response 200**:
```json
{
  "success": true
}
```

**Errors**: `400 INVALID_STATUS_TRANSITION` | `404 NOT_FOUND` | `403 FORBIDDEN`

---

## Admin – Payment Requests

### GET /admin/payment-requests

**Auth**: Bearer – ADMIN

**Description**: List all payment requests across all providers with optional status filtering, newest first. Used by Admins to action pending transfers.

**Query Params**:
```
status  enum     optional  PENDING | CONFIRMED | REJECTED
page    integer  optional  default: 1
limit   integer  optional  default: 20  max: 100
```

**Response 200**:
```json
{
  "data": [
    {
      "id": "pr_uuid",
      "provider": {
        "id": "user_uuid",
        "email": "owner@rcbusiness.vn",
        "business_name": "RC Arena Ha Noi"
      },
      "plan": {
        "id": "plan_uuid",
        "name": "STARTER"
      },
      "status": "PENDING",
      "transfer_reference": "RCF-20260525-0042",
      "transfer_date": "2026-05-25",
      "transfer_amount": 500000,
      "created_at": "2026-05-25T10:30:00.000Z"
    }
  ],
  "total": 7
}
```

**Errors**: `400 VALIDATION_ERROR` | `403 FORBIDDEN`

---

### POST /admin/payment-requests/:id/confirm

**Auth**: Bearer – ADMIN

**Description**: Confirm a `PENDING` payment request. Side effects (executed atomically):
1. Sets payment request `status` → `CONFIRMED`.
2. Activates or upgrades the provider's subscription to the requested plan.
3. Extends expiry: `new_expires_at = MAX(current_expires_at, NOW()) + 30 days` (stacked renewal).
4. Sends an in-app notification to the provider.

**Request Body**:
```json
{
  "notes": "Đã kiểm tra giao dịch ngân hàng. Hợp lệ."
}
```

**Response 200**:
```json
{
  "success": true,
  "new_expires_at": "2026-07-01T00:00:00.000Z"
}
```

**Errors**: `400 ALREADY_PROCESSED` | `404 NOT_FOUND` | `403 FORBIDDEN`

---

### POST /admin/payment-requests/:id/reject

**Auth**: Bearer – ADMIN

**Description**: Reject a `PENDING` payment request. Sets `status` → `REJECTED` and stores the rejection reason. Sends an in-app notification to the provider.

**Request Body**:
```json
{
  "reason": "Số tiền chuyển khoản không khớp với gói đăng ký."
}
```

**Response 200**:
```json
{
  "success": true
}
```

**Errors**: `400 ALREADY_PROCESSED` | `400 VALIDATION_ERROR` | `404 NOT_FOUND` | `403 FORBIDDEN`
