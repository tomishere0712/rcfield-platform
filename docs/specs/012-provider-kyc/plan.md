# Implementation Plan: Provider KYC Verification

**Branch**: `main` | **Date**: 2026-07-06 | **Spec**: [spec.md](./spec.md)

---

## Summary

Thêm bước xác thực danh tính (KYC) vào flow đăng ký Provider. Provider upload giấy tờ (CCCD hoặc GPKD + ảnh mặt bằng) như bước 3 trong form đăng ký. ADMIN review và approve/reject. Provider bị từ chối nộp lại (ghi đè documents cũ). **Không tạo bảng mới** — extend `provider_profiles` với 3 column JSONB/varchar.

---

## Technical Context

**Language/Version**: Node.js 20+, TypeScript strict | React + Vite, TypeScript strict  
**Primary Dependencies**:
- Backend: Express.js, TypeORM, PostgreSQL, multer (memoryStorage), Cloudinary SDK
- Frontend: React Hook Form + Zod, React Query, Tailwind CSS

**Storage**: PostgreSQL (entities), Cloudinary (documents — testing phase)  
**Testing**: Existing Jest setup  
**Target Platform**: Linux server (backend), Browser (frontend)  
**Project Type**: Web service (SaaS multi-tenant)  
**Constraints**:
- File upload max 10MB per file
- Formats: JPEG, PNG (ảnh), PDF (GPKD)
- No auth required for initial KYC upload (bundled with registration)
- `uploadImage()` existing function: image-only, KHÔNG sửa — tạo `uploadFile()` mới

---

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Snapshot-First Pricing | ✅ N/A | Không có financial calculations |
| II. State Machine Gate | ✅ Compliant | ProviderStatus transitions qua `assertTransition()`. Thêm `REJECTED → PENDING`. Không direct-update status. |
| III. Evidence-Based Handover | ✅ N/A | Không ảnh hưởng inspection flow |
| IV. Payment Component Isolation | ✅ N/A | Không có payment components |
| V. Test-First | ✅ Plan | Unit tests cho status transitions và document validation |
| VI. RBAC Enforcement | ✅ Compliant | `/provider/kyc/*` cần PROVIDER role, `/admin/providers/*` giữ ADMIN role middleware |

---

## Project Structure

### Documentation (this feature)

```text
specs/012-provider-kyc/
├── plan.md          ← this file
├── spec.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── api.md
└── tasks.md         ← /speckit-tasks
```

### Source Code — Backend

```text
rcfeild-be/src/
├── migrations/
│   └── {timestamp}-AddKycColumnsToProviderProfiles.ts  ← NEW (ALTER TABLE only)
├── models/
│   └── provider-profile.entity.ts            ← EXTEND: +3 columns
├── services/
│   ├── cloudinary.service.ts                 ← EXTEND: thêm uploadFile()
│   └── provider-onboarding.service.ts        ← EXTEND: register, approve, reject, resubmit, getKycStatus
├── controllers/
│   └── provider-onboarding.controller.ts     ← EXTEND: registerProvider, thêm resubmitKyc, getKycStatus
├── routes/
│   ├── provider-onboarding.routes.ts         ← EXTEND: multipart middleware, thêm KYC routes
│   └── provider-subscription.routes.ts       ← EXTEND: thêm /kyc/status, /kyc/resubmit
├── types/
│   └── index.ts                              ← EXTEND: KycApplicationStatus, KycDocumentType, KycBusinessType
└── validate/
    └── index.ts                              ← EXTEND: RegisterProviderSchema thêm business_type
```

### Source Code — Frontend

```text
rcfield-fe/src/
├── pages/
│   ├── auth/
│   │   └── ProviderRegisterPage.tsx          ← EXTEND: thêm Step 3 (document upload)
│   ├── provider/
│   │   └── ProviderRejectedPage.tsx          ← EXTEND hoặc CREATE: thêm resubmit form
│   └── admin/
│       └── AdminProviderDetailPage.tsx       ← EXTEND: thêm KYC documents section
├── features/
│   └── provider-kyc/                         ← NEW feature folder
│       ├── api/
│       │   └── kyc.api.ts                    ← NEW: resubmit, getKycStatus
│       ├── components/
│       │   ├── KycDocumentUpload.tsx         ← NEW: reusable upload step
│       │   └── KycDocumentViewer.tsx         ← NEW: ADMIN document viewer
│       └── types.ts                          ← NEW
└── features/subscriptions/
    └── api/subscription.api.ts               ← EXTEND: registerProvider thêm FormData support
```

---

## Phase 0: Research ✅

Xem [research.md](./research.md) — 10 decisions, tất cả đã resolved.

Key decisions:
1. **Upload strategy**: multipart/form-data trong single POST (atomic)
2. **Schema**: 2 bảng mới (`provider_kyc_applications`, `provider_kyc_documents`)
3. **Cloudinary**: `uploadFile()` mới với `resource_type: auto` cho PDF support
4. **State machine**: thêm `REJECTED → PENDING` transition
5. **Access control**: Provider chỉ xem document names, ADMIN xem URLs

---

## Phase 1: Design ✅

### Data Model → [data-model.md](./data-model.md)

- 2 bảng mới: `provider_kyc_applications`, `provider_kyc_documents`
- Partial unique index: enforce 1 active application per provider
- TypeORM entities với eager load documents
- Enum extensions: `KycApplicationStatus`, `KycDocumentType`, `KycBusinessType`
- Migration timestamp: `{nextTimestamp}-AddProviderKycTables.ts`

### API Contracts → [contracts/api.md](./contracts/api.md)

- 2 existing endpoints extended (register-provider, admin approve/reject, admin detail)
- 2 new provider endpoints (resubmit, kyc/status)
- multipart/form-data schema cho registration + resubmission

### Quickstart → [quickstart.md](./quickstart.md)

- 17-step implementation order
- 6 E2E test scenarios
- Unit test checklist (12 backend + 5 frontend)

---

## Implementation Notes

### Critical path cho BE

1. Migration phải chạy trước khi start server
2. `uploadFile()` phải tạo trước khi sửa `register()` service
3. `register()` cần transaction bao gồm cả Cloudinary uploads — nếu Cloudinary fail, DB rollback. Implement với try/catch + cleanup (deleteImage) nếu DB transaction fail sau khi đã upload.
4. `getProviderDetail()` là raw SQL query — extend bằng cách JOIN `provider_kyc_applications` + `provider_kyc_documents`, phân quyền qua caller context

### Critical path cho FE

1. `ProviderRegisterPage`: Step 3 dùng `<input type="file">` + `FormData` API thay vì `axios` JSON
2. `subscriptionApi.registerProvider()` cần được đổi signature để accept `FormData`
3. `KycDocumentUpload.tsx` component dùng lại cho cả registration (Step 3) và resubmit form
4. `AdminProviderDetailPage`: KYC docs section render ảnh với `<img>` và PDF với link/iframe

### Gotchas

- multer `memoryStorage()` + `multipart()` phải được mount TRƯỚC Zod validation vì text fields đến qua FormData, không phải JSON body
- `req.body` với multipart là strings, phải validate riêng (Zod `.parse(req.body)` sau multer)
- `resource_type: 'auto'` Cloudinary: PDF sẽ được serve với CDN URL có thể preview nếu viewer browser support (Chrome/Firefox render PDF natively)
