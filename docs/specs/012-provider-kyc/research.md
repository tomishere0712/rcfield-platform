# Research: Provider KYC Verification

**Feature**: 012-provider-kyc  
**Date**: 2026-07-06  
**Status**: Complete

---

## Decision 1: File upload timing — multipart/form-data trong một POST duy nhất

**Decision**: Mở rộng `POST /api/v1/auth/register-provider` để nhận `multipart/form-data` thay vì JSON thuần. Frontend gom tất cả text fields + files thành một request.

**Rationale**: Đảm bảo tính nguyên tử (atomic) — nếu upload thất bại, toàn bộ registration không được tạo. Tránh orphaned provider accounts không có KYC documents. Phù hợp với UX "bấm một lần hoàn tất".

**Alternatives considered**:
- Two-phase: register trước → trả interim JWT → upload documents. Phức tạp hơn, cần thêm endpoint, JWT scope riêng.
- Frontend upload trực tiếp lên Cloudinary (unsigned): Expose Cloudinary API key ra client — rủi ro bảo mật.

---

## Decision 2: Schema — extend `provider_profiles` với 3 column mới (không tạo bảng mới)

**Decision**: Thêm `business_type` (varchar), `kyc_documents` (jsonb), `kyc_submitted_at` (timestamptz) vào `provider_profiles`. Resubmit ghi đè JSONB column — không lưu lịch sử.

**Rationale**: Yêu cầu lịch sử (FR-013) đã được chủ đích loại bỏ để đơn giản hóa schema. Không cần entity mới, không cần migration phức tạp. JSONB đủ cho use case: ADMIN chỉ cần xem documents của lần nộp hiện tại.

**Alternatives considered**:
- 2 bảng riêng (`provider_kyc_applications` + `provider_kyc_documents`): lưu được lịch sử nhưng phức tạp hơn; bị reject vì team ưu tiên đơn giản.

---

## Decision 3: Cloudinary resource_type — dùng `auto` thay vì `image`

**Decision**: Upload KYC documents với `resource_type: 'auto'` để hỗ trợ cả JPEG/PNG và PDF. Tạo overload mới `uploadFile()` trong `cloudinary.service.ts` — không sửa `uploadImage()` hiện tại để tránh regression.

**Rationale**: GPKD thường là PDF scan. `resource_type: 'image'` từ chối PDF. `resource_type: 'auto'` Cloudinary tự nhận dạng format.

**Alternatives considered**:
- Chỉ cho phép JPEG/PNG: Loại nhiều provider hợp lệ không biết convert PDF sang ảnh.
- Dùng `resource_type: 'raw'`: Không có URL preview cho ADMIN.

---

## Decision 4: Cloudinary folder structure

**Decision**: `rcfield/kyc/{applicationId}/` — không dùng `providerId` trong path.

**Rationale**: `applicationId` đủ unique. Dùng providerId cũng được nhưng thêm một level folder không cần thiết. Consistent với pattern `rcfield/tracks/{cafeId}/{configId}` trong codebase.

**Alternatives considered**: `rcfield/kyc/{providerId}/{applicationId}/` — hơi dài, không cần.

---

## Decision 5: ProviderStatus transitions — thêm REJECTED → PENDING

**Decision**: Cập nhật `PROVIDER_STATUS_TRANSITIONS` trong `provider-onboarding.service.ts`:
```
REJECTED: [ProviderStatus.PENDING]   // was: []
```

**Rationale**: Resubmission tạo KycApplication mới với status PENDING_REVIEW, đồng thời reset `provider_profiles.registration_status` về PENDING. Đây là điều kiện để ADMIN thấy hồ sơ trong queue.

**Alternatives considered**: Thêm enum value mới `RESUBMITTED` — không cần thiết, ADMIN chỉ cần biết "có hồ sơ mới chờ duyệt" (= PENDING).

---

## Decision 6: Provider xem KYC status — endpoint mới `/provider/kyc/status`

**Decision**: Tạo `GET /api/v1/provider/kyc/status` [PROVIDER auth]. Trả application status + danh sách tên file (không trả URL). KycDocument chỉ expose `documentType` và `fileName` — không expose `cloudinaryUrl`.

**Rationale**: Spec clarification Q2 — Provider không được xem nội dung tài liệu. Chỉ cần biết đã nộp gì và trạng thái.

**Alternatives considered**: Extend `GET /api/v1/provider/me` — làm phình response của endpoint đang dùng cho nhiều mục đích.

---

## Decision 7: ADMIN xem documents — trả `cloudinaryUrl` trong detail API

**Decision**: `GET /api/v1/admin/providers/:id` (extend `getProviderDetail`) sẽ trả thêm `kyc_applications` array gồm `status`, `business_type`, `rejection_reason`, `submitted_at` và `documents[]` với `documentType` + `cloudinaryUrl`.

**Rationale**: ADMIN cần xem ảnh trực tiếp. Cloudinary public URL đủ cho phase testing. Khi đổi sang private storage, chỉ cần thay URL generation ở 1 chỗ.

**Alternatives considered**: Separate endpoint `GET /api/v1/admin/providers/:id/kyc` — thêm round trip không cần thiết khi ADMIN đang xem detail provider.

---

## Decision 8: multer config cho KYC endpoint

**Decision**: Tạo multer instance riêng `kycUpload` với:
- `storage: memoryStorage()` (consistent với pattern hiện tại)
- `limits: { fileSize: 10 * 1024 * 1024 }` (10MB)
- `fileFilter`: chấp nhận `image/jpeg`, `image/png`, `image/jpg`, `application/pdf`
- `fields`: `cccd_front` (1), `cccd_back` (1), `gpkd` (1), `representative_id` (1), `venue_photo` (1)

**Rationale**: Field names rõ ràng hơn generic array. `memoryStorage()` đã được dùng xuyên suốt codebase.

---

## Decision 9: Validation — business_type quyết định required documents

**Decision**: Validation logic trong controller (trước khi gọi service):
- `business_type === 'INDIVIDUAL'`: require `cccd_front`, `cccd_back`, `venue_photo`
- `business_type === 'BUSINESS'`: require `gpkd`, `representative_id`, `venue_photo`

**Rationale**: FR-002, FR-003, FR-004. Server-side validation là source of truth, frontend replicates.

---

## Decision 10: Resubmit endpoint

**Decision**: `POST /api/v1/provider/kyc/resubmit` [PROVIDER auth] — nhận multipart/form-data tương tự registration. Chỉ cho phép nếu `registrationStatus === REJECTED`. Tạo KycApplication mới, reset `registrationStatus → PENDING`.

**Rationale**: Tách biệt rõ ràng với registration endpoint. Cần auth vì provider đã có account. Guard: chỉ REJECTED providers mới được resubmit.
