# API Contracts: Provider KYC Verification

**Feature**: 012-provider-kyc  
**Date**: 2026-07-06

---

## Endpoints Overview

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| POST | `/api/v1/auth/register-provider` | ❌ | — | Đăng ký provider + nộp KYC (extend existing) |
| POST | `/api/v1/provider/kyc/resubmit` | ✅ | PROVIDER | Nộp lại hồ sơ sau khi bị từ chối |
| GET | `/api/v1/provider/kyc/status` | ✅ | PROVIDER | Xem trạng thái KYC + danh sách tên file |
| GET | `/api/v1/admin/providers/:id` | ✅ | ADMIN | Xem chi tiết + KYC documents (extend) |
| POST | `/api/v1/admin/providers/:id/approve` | ✅ | ADMIN | Phê duyệt (existing) |
| POST | `/api/v1/admin/providers/:id/reject` | ✅ | ADMIN | Từ chối (existing) |

---

## 1. POST `/api/v1/auth/register-provider`

**Changed**: JSON → `multipart/form-data`

### Request fields

**Text:**

| Field | Required | Notes |
|-------|----------|-------|
| `full_name` | ✅ | min 2 chars |
| `email` | ✅ | |
| `phone` | ❌ | |
| `password` | ✅ | min 8 chars |
| `business_name` | ✅ | |
| `business_description` | ❌ | max 1000 |
| `business_type` | ✅ | `INDIVIDUAL` \| `BUSINESS` |

**Files** (max 10MB/file, JPEG/PNG hoặc PDF cho GPKD):

| Field | INDIVIDUAL | BUSINESS |
|-------|-----------|---------|
| `cccd_front` | ✅ | — |
| `cccd_back` | ✅ | — |
| `gpkd` | — | ✅ |
| `representative_id` | — | ✅ |
| `venue_photo` | ✅ | ✅ |

### Zod Schema (text fields)

```typescript
export const RegisterProviderSchema = z.object({
  full_name: z.string().min(2).max(255),
  email: z.string().email(),
  phone: z.string().min(9).max(20).optional(),
  password: z.string().min(8).max(128),
  business_name: z.string().min(2).max(255),
  business_description: z.string().max(1000).optional(),
  business_type: z.enum(['INDIVIDUAL', 'BUSINESS']),
});
```

### Response `201`

```json
{ "success": true, "data": { "id": "uuid", "email": "you@company.com" } }
```

### Errors

| Code | Error | |
|------|-------|-|
| 409 | `EMAIL_EXISTS` | |
| 400 | `MISSING_DOCUMENTS` | Thiếu file bắt buộc |
| 422 | `UNSUPPORTED_FORMAT` | Sai định dạng |

---

## 2. POST `/api/v1/provider/kyc/resubmit`

**Auth**: PROVIDER  
**Content-Type**: `multipart/form-data`

### Request fields

| Field | Required |
|-------|----------|
| `business_type` | ✅ |
| Files (theo business_type) | ✅ |

### Response `201`

```json
{
  "success": true,
  "data": {
    "status": "PENDING",
    "kycSubmittedAt": "2026-07-06T10:00:00Z"
  }
}
```

### Errors

| Code | Error | |
|------|-------|-|
| 400 | `RESUBMIT_NOT_ALLOWED` | Status không phải REJECTED |
| 400 | `MISSING_DOCUMENTS` | |

---

## 3. GET `/api/v1/provider/kyc/status`

**Auth**: PROVIDER

### Response `200`

```json
{
  "success": true,
  "data": {
    "providerStatus": "REJECTED",
    "businessType": "INDIVIDUAL",
    "rejectionReason": "Ảnh CCCD mờ, không đọc được số",
    "kycSubmittedAt": "2026-07-05T10:00:00Z",
    "documents": [
      { "documentType": "CCCD_FRONT", "originalFilename": "cccd-truoc.jpg" },
      { "documentType": "CCCD_BACK",  "originalFilename": "cccd-sau.jpg" },
      { "documentType": "VENUE_PHOTO","originalFilename": "san-rc.jpg" }
    ]
  }
}
```

**Note**: Không có `cloudinaryUrl` — Provider chỉ thấy tên file.

---

## 4. GET `/api/v1/admin/providers/:id` — extend

**Changed**: Thêm `kyc` object vào response

### Response `200` (thêm phần kyc)

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "provider@example.com",
    "full_name": "Nguyễn Văn A",
    "business_name": "RC Cafe Bình Thạnh",
    "registration_status": "PENDING",
    "kyc": {
      "businessType": "INDIVIDUAL",
      "submittedAt": "2026-07-06T09:00:00Z",
      "documents": [
        { "documentType": "CCCD_FRONT",  "cloudinaryUrl": "https://...", "originalFilename": "cccd-truoc.jpg" },
        { "documentType": "CCCD_BACK",   "cloudinaryUrl": "https://...", "originalFilename": "cccd-sau.jpg" },
        { "documentType": "VENUE_PHOTO", "cloudinaryUrl": "https://...", "originalFilename": "san-rc.jpg" }
      ]
    }
  }
}
```

---

## 5 & 6. Approve / Reject — không thay đổi interface

Giữ nguyên request/response. Logic backend tự lấy `kyc_documents` từ `provider_profiles` khi cần log — không cần thay đổi API surface.
