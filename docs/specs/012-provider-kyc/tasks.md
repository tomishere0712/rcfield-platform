# Tasks: Provider KYC Verification

**Feature**: 012-provider-kyc  
**Input**: `specs/012-provider-kyc/`  
**Prerequisites**: plan.md ✅ | spec.md ✅ | data-model.md ✅ | contracts/api.md ✅ | research.md ✅ | quickstart.md ✅

**Organization**: Tasks grouped by user story — each phase independently testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no shared dependencies)
- **[Story]**: User story this task belongs to (US1, US2, US3)
- Exact file paths are included in every task description

---

## Phase 1: Setup

**Purpose**: No new project structure needed — extending existing codebase. Create the frontend feature folder.

- [X] T001 Create feature folder `rcfield-fe/src/features/provider-kyc/` with subdirectories `api/`, `components/`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared infrastructure that ALL user stories depend on. MUST be complete before any story work begins.

**⚠️ CRITICAL**: No user story can start until this phase is complete.

- [X] T002 Run DB migration — create `rcfeild-be/src/migrations/{timestamp}-AddKycColumnsToProviderProfiles.ts` with `ALTER TABLE provider_profiles ADD COLUMN business_type varchar(20), kyc_documents jsonb NOT NULL DEFAULT '[]', kyc_submitted_at timestamptz`
- [X] T003 [P] Add TypeScript enums and interface to `rcfeild-be/src/types/index.ts`: `KycBusinessType { INDIVIDUAL, BUSINESS }`, `KycDocumentType { CCCD_FRONT, CCCD_BACK, GPKD, REPRESENTATIVE_ID, VENUE_PHOTO }`, `KycDocumentItem { documentType, cloudinaryUrl, cloudinaryPublicId, originalFilename }`
- [X] T004 Extend `rcfeild-be/src/models/provider-profile.entity.ts` — add 3 `@Column` fields: `businessType: KycBusinessType | null`, `kycDocuments: KycDocumentItem[]`, `kycSubmittedAt: Date | null` (depends on T003)
- [X] T005 [P] Add `uploadFile(buffer, folder, originalname)` method to `rcfeild-be/src/services/cloudinary.service.ts` — use `resource_type: 'auto'` to support JPEG/PNG/PDF; do NOT modify existing `uploadImage()`
- [X] T006 [P] Create `kycUpload` multer instance in `rcfeild-be/src/config/multer.config.ts` (or inline at top of routes file) — `memoryStorage()`, 10MB limit, accept `image/jpeg|image/png|image/jpg|application/pdf`, named fields: `cccd_front(1)`, `cccd_back(1)`, `gpkd(1)`, `representative_id(1)`, `venue_photo(1)`
- [X] T007 [P] Add KYC TypeScript types to `rcfield-fe/src/features/provider-kyc/types.ts` — `KycBusinessType`, `KycDocumentType`, `KycDocumentItem`, `KycStatusResponse` matching API contracts

**Checkpoint**: Migration applied + entity updated + Cloudinary uploadFile() ready + multer config ready → shared infrastructure complete

---

## Phase 3: User Story 1 — Provider Submits Identity Documents (Priority: P1) 🎯 MVP

**Goal**: Provider completes 3-step registration with document upload as Step 3. Server creates User + ProviderProfile(PENDING) atomically with Cloudinary uploads.

**Independent Test**: Run through full 3-step registration as INDIVIDUAL (cccd_front + cccd_back + venue_photo) and as BUSINESS (gpkd + representative_id + venue_photo). Verify ProviderProfile is created with `kyc_documents` populated and `registrationStatus = PENDING`.

### Implementation for User Story 1

- [X] T008 [US1] Update `RegisterProviderSchema` in `rcfeild-be/src/validate/index.ts` — add `business_type: z.enum(['INDIVIDUAL', 'BUSINESS'])` as required field
- [X] T009 [US1] Extend `register()` in `rcfeild-be/src/services/provider-onboarding.service.ts` — accept `files: Record<string, Express.Multer.File[]>`, validate required docs per business_type (throw `MISSING_DOCUMENTS` if missing), upload each file via `cloudinary.uploadFile()` into folder `rcfield/kyc/{profileId}/`, save `kyc_documents` JSONB array + `business_type` + `kyc_submitted_at` on ProviderProfile; wrap Cloudinary uploads + DB save in try/catch (delete uploaded files if DB fails)
- [X] T010 [US1] Update `registerProvider()` handler in `rcfeild-be/src/controllers/provider-onboarding.controller.ts` — parse `req.files` from multer, validate `business_type` + required files, call updated `register()` service; multer populates `req.body` as strings (not JSON) so run Zod parse AFTER multer
- [X] T011 [US1] Update `rcfeild-be/src/routes/provider-onboarding.routes.ts` — mount `kycUpload.fields([...])` middleware on `POST /auth/register-provider` BEFORE Zod validation middleware
- [X] T012 [P] [US1] Create `KycDocumentUpload` component in `rcfield-fe/src/features/provider-kyc/components/KycDocumentUpload.tsx` — accepts `businessType` prop, renders correct file input fields (INDIVIDUAL: cccd_front, cccd_back, venue_photo; BUSINESS: gpkd, representative_id, venue_photo), client-side file validation (type + size), highlights missing required files on submit attempt
- [X] T013 [US1] Extend `rcfield-fe/src/pages/auth/ProviderRegisterPage.tsx` — add Step 3 using `KycDocumentUpload` component, track selected files in state, update form submit to build `FormData` with all text fields + file fields instead of JSON body
- [X] T014 [US1] Update `registerProvider()` in `rcfield-fe/src/features/subscriptions/api/subscription.api.ts` — change signature to accept `FormData`, send `Content-Type: multipart/form-data` (let browser set boundary automatically, do NOT manually set Content-Type header when using FormData)

**Checkpoint**: Full 3-step registration works end-to-end. ProviderProfile created with kyc_documents. Frontend shows "Đang chờ xét duyệt" success screen.

---

## Phase 4: User Story 2 — ADMIN Xét Duyệt Hồ Sơ (Priority: P2)

**Goal**: ADMIN sees provider detail page with KYC documents (with Cloudinary preview URLs). Approve/reject flows already exist — extend the detail response to include KYC data.

**Independent Test**: Create a provider with Phase 3 flow, log in as ADMIN, open provider detail page. Verify KYC section shows document thumbnails/links. Approve → provider status becomes ACTIVE. Reject with reason → provider status becomes REJECTED with reason visible.

### Implementation for User Story 2

- [X] T015 [US2] Extend `getProviderDetail()` in `rcfeild-be/src/services/provider-onboarding.service.ts` — join/include `kyc_documents`, `business_type`, `kyc_submitted_at`, `rejection_reason` from ProviderProfile; return as nested `kyc` object with `documents[]` including `cloudinaryUrl` (ADMIN-only response path)
- [X] T016 [US2] Verify `approve()` and `reject()` service methods in `rcfeild-be/src/services/provider-onboarding.service.ts` correctly update `registrationStatus` and trigger in-app notification with rejection reason in message; add rejection_reason to notification payload if not already present
- [X] T017 [P] [US2] Create `KycDocumentViewer` component in `rcfield-fe/src/features/provider-kyc/components/KycDocumentViewer.tsx` — accepts `documents: KycDocumentItem[]`, renders `<img>` for image documents, `<a target="_blank">` link for PDF, shows `documentType` label in Vietnamese
- [X] T018 [US2] Extend `rcfield-fe/src/pages/admin/AdminProviderDetailPage.tsx` — add "Giấy tờ xác thực" section using `KycDocumentViewer`, display `businessType`, `submittedAt`; section only renders when `kyc` object is present in API response

**Checkpoint**: ADMIN can view all KYC documents inline on provider detail page. Approve/reject flows with notifications work correctly.

---

## Phase 5: User Story 3 — Provider Nộp Lại Hồ Sơ Sau Từ Chối (Priority: P3)

**Goal**: Rejected provider can see rejection reason, upload new docs via `/rejected` page, resubmit to reset status to PENDING. No limit on resubmission count.

**Independent Test**: Create provider, reject via ADMIN with reason "Ảnh mờ". Log in as provider → lands on `/rejected` page. Verify rejection reason is shown. Upload new docs and submit → ProviderProfile.registrationStatus becomes PENDING. ADMIN sees provider in queue again.

### Implementation for User Story 3

- [X] T019 [US3] Update `PROVIDER_STATUS_TRANSITIONS` in `rcfeild-be/src/services/provider-onboarding.service.ts` — change `REJECTED: []` to `REJECTED: [ProviderStatus.PENDING]` to allow resubmission state transition
- [X] T020 [US3] Add `resubmit(providerId, files, businessType)` method to `rcfeild-be/src/services/provider-onboarding.service.ts` — guard: throw `RESUBMIT_NOT_ALLOWED` if `registrationStatus !== REJECTED`; upload new files to Cloudinary folder `rcfield/kyc/{profileId}/resubmit-{timestamp}/`; overwrite `kyc_documents`, `business_type`, `kyc_submitted_at` on ProviderProfile; call `assertTransition(REJECTED → PENDING)` to set new status
- [X] T021 [US3] Add `getKycStatus(providerId)` method to `rcfeild-be/src/services/provider-onboarding.service.ts` — return `{ providerStatus, businessType, rejectionReason, kycSubmittedAt, documents[] }` where `documents[]` contains only `{ documentType, originalFilename }` (NO cloudinaryUrl — provider cannot view doc content)
- [X] T022 [US3] Add `resubmitKyc()` and `getKycStatus()` handlers to `rcfeild-be/src/controllers/provider-onboarding.controller.ts` — `resubmitKyc` parses multer files + business_type, validates required docs, calls service; `getKycStatus` reads from JWT providerId
- [X] T023 [US3] Add routes to `rcfeild-be/src/routes/provider-subscription.routes.ts` — `POST /provider/kyc/resubmit` (PROVIDER auth + kycUpload middleware), `GET /provider/kyc/status` (PROVIDER auth)
- [X] T024 [P] [US3] Create `rcfield-fe/src/features/provider-kyc/api/kyc.api.ts` — export `resubmitKyc(formData: FormData)` → `POST /api/v1/provider/kyc/resubmit`, `getKycStatus()` → `GET /api/v1/provider/kyc/status`
- [X] T025 [US3] Extend `rcfield-fe/src/pages/provider/ProviderRejectedPage.tsx` — show `rejectionReason` from `getKycStatus()` API, embed `KycDocumentUpload` component with current `businessType` pre-selected, call `resubmitKyc()` on submit, redirect to `/pending-review` on success (ProviderStatusGuard will handle routing once status becomes PENDING)

**Checkpoint**: Full resubmit cycle works. Scenario 4 from quickstart.md passes end-to-end.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, sidebar updates, and validation against E2E scenarios.

- [X] T026 [P] Update `website/sidebars-specs.ts` — add `012-provider-kyc` category with items: `provider-kyc/spec`, `provider-kyc/plan`, `provider-kyc/data-model`, `provider-kyc/research`, `provider-kyc/quickstart`, `provider-kyc/tasks`, `provider-kyc/contracts/api`
- [ ] T027 Walk through all 6 E2E scenarios in `specs/012-provider-kyc/quickstart.md` manually (or via Postman/browser) and confirm each ✅ checkpoint passes

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Setup)         → no dependencies, start immediately
Phase 2 (Foundational)  → depends on Phase 1, BLOCKS all user stories
Phase 3 (US1 - P1)      → depends on Phase 2 completion
Phase 4 (US2 - P2)      → depends on Phase 2 completion + Phase 3 (register flow must work to create test data)
Phase 5 (US3 - P3)      → depends on Phase 2 completion + Phase 3 (need existing REJECTED provider)
Phase 6 (Polish)        → depends on all story phases complete
```

### User Story Dependencies

- **US1 (P1)**: Depends only on Foundational. Independent of US2/US3.
- **US2 (P2)**: Depends on US1 to create test data (need registered provider). Backend change (`getProviderDetail`) is independent.
- **US3 (P3)**: Depends on US2 to create a rejected provider for testing. `resubmit()` service is independent.

### Within Each Phase

- T003 (types) must complete before T004 (entity)
- T005, T006, T007 can run in parallel with T003/T004 (different files)
- T008 (schema validation) must complete before T009 (service) for full validation testing
- T009 (service) must complete before T010 (controller)
- T010 (controller) must complete before T011 (routes)
- T012 (KycDocumentUpload component) can run in parallel with T013/T014 (different files)
- T013 (page) depends on T012 (component)
- T014 (api) is independent of T012/T013

---

## Parallel Execution Examples

### Phase 2 — run together after T002 migration:

```
Agent A: T003 (BE types/index.ts) → T004 (entity)
Agent B: T005 (cloudinary.service.ts uploadFile)
Agent C: T006 (multer kycUpload config)
Agent D: T007 (FE types.ts)
```

### Phase 3 — run together after T011 (routes):

```
Agent A: T012 (FE KycDocumentUpload component)
Agent B: T013 (FE ProviderRegisterPage Step 3) — waits for T012
Agent C: T014 (FE subscription.api.ts FormData)
```

### Phase 5 — run together:

```
Agent A: T019 (state machine) → T020 (resubmit service) → T021 (getKycStatus service)
Agent B: T024 (FE kyc.api.ts)
```

---

## Implementation Strategy

### MVP (User Story 1 Only)

1. Phase 1: Setup (T001)
2. Phase 2: Foundational (T002–T007)
3. Phase 3: US1 (T008–T014)
4. **STOP and VALIDATE**: Full 3-step registration works, Provider is created PENDING
5. Demo-ready for registration flow

### Full Feature Incremental Delivery

1. MVP above → ADMIN can register providers with KYC docs
2. Add US2 (T015–T018) → ADMIN can review and approve/reject
3. Add US3 (T019–T025) → Rejected providers can resubmit
4. Polish (T026–T027) → Docs + E2E validation

---

## Notes

- `[P]` = different files, no shared incomplete dependencies — safe to parallelize
- multer middleware MUST be mounted BEFORE Zod validation (multipart `req.body` = strings, not JSON)
- When sending `FormData` from React, do NOT set `Content-Type` header manually — browser sets it with boundary
- `rcfeild-be` path uses typo ("rcfeild") — this matches the actual repo directory name
- `uploadFile()` uses `resource_type: 'auto'` — do NOT change existing `uploadImage()` (regression risk)
- Resubmit overwrites `kyc_documents` JSONB — no history of previous submissions is stored (intentional trade-off)
- `assertTransition()` in state machine must be called for all status changes — never direct-update status
