# Quickstart: Provider KYC Verification

**Feature**: 012-provider-kyc  
**Date**: 2026-07-06

---

## Implementation Order

Thực hiện theo thứ tự này để mỗi bước có thể test độc lập:

```
1.  Migration — ALTER TABLE provider_profiles ADD COLUMN business_type, kyc_documents, kyc_submitted_at
2.  Types — thêm KycDocumentType, KycBusinessType, KycDocumentItem vào src/types/index.ts
3.  ProviderProfile entity — thêm 3 fields mới
4.  Cloudinary — thêm uploadFile() hỗ trợ PDF (resource_type: auto) — KHÔNG sửa uploadImage()
5.  multer config — kycUpload: memoryStorage, 10MB limit, accept JPEG/PNG/PDF, named fields
6.  provider-onboarding.service — cập nhật PROVIDER_STATUS_TRANSITIONS (REJECTED → PENDING)
7.  provider-onboarding.service — mở rộng register() upload files + lưu kyc_documents JSONB
8.  provider-onboarding.service — thêm resubmit() + getKycStatus()
9.  provider-onboarding.service — mở rộng getProviderDetail() include kyc data (cho ADMIN)
10. Validation schema — cập nhật RegisterProviderSchema thêm business_type
11. Controller — cập nhật registerProvider (multipart), thêm resubmitKyc(), getKycStatus()
12. Routes — provider-onboarding: multipart middleware; thêm /provider/kyc/* routes
13. Frontend — ProviderRegisterPage thêm Step 3 (KycDocumentUpload component)
14. Frontend — /rejected page thêm resubmit form
15. Frontend — AdminProviderDetailPage thêm KYC documents section
```

---

## E2E Scenarios

### Scenario 1: Provider cá nhân đăng ký thành công

```
1. Điền Step 1 (Tài khoản): full_name, email, phone, password
2. Điền Step 2 (Doanh nghiệp): business_name, business_description
3. Điền Step 3 (Giấy tờ): chọn "Cá nhân", upload CCCD front, CCCD back, venue photo
4. Bấm "Hoàn tất đăng ký"
5. ✅ Server tạo User + ProviderProfile(PENDING) + KycApplication(PENDING_REVIEW) + 3 documents
6. ✅ Frontend hiển thị success screen "Đang chờ xét duyệt"
7. ✅ ADMIN nhận notification
```

### Scenario 2: Provider thiếu giấy tờ

```
1. Step 3: chọn "Cá nhân", upload CCCD front, SKIP CCCD back và venue photo
2. Bấm "Hoàn tất đăng ký"
3. ✅ Frontend: field "CCCD mặt sau" và "Ảnh mặt bằng" highlight error (client validation)
4. ✅ Server fallback: 400 MISSING_DOCUMENTS nếu client bypass
5. ✅ Không có User nào được tạo
```

### Scenario 3: ADMIN duyệt

```
1. ADMIN login → vào AdminProvidersPage → filter PENDING
2. Nhấn vào provider → xem AdminProviderDetailPage
3. ✅ Section "Giấy tờ xác thực" hiển thị các ảnh/file với labels rõ ràng
4. ADMIN nhấn "Phê duyệt"
5. ✅ ProviderProfile.registrationStatus → ACTIVE
6. ✅ KycApplication.status → APPROVED
7. ✅ Provider nhận in-app notification "Tài khoản đã được duyệt"
8. ✅ Provider login → ProviderStatusGuard thấy ACTIVE → vào dashboard
```

### Scenario 4: ADMIN từ chối + Provider nộp lại

```
1. ADMIN nhấn "Từ chối" → nhập reason: "Ảnh CCCD mờ"
2. ✅ ProviderProfile.registrationStatus → REJECTED
3. ✅ KycApplication.status → REJECTED, rejection_reason = "Ảnh CCCD mờ"
4. ✅ Provider nhận notification với lý do
5. Provider login → ProviderStatusGuard → /rejected page
6. ✅ /rejected page hiển thị: "Lý do từ chối: Ảnh CCCD mờ"
7. ✅ /rejected page có button "Nộp lại hồ sơ"
8. Provider click → upload lại CCCD front/back/venue với ảnh rõ nét
9. ✅ POST /provider/kyc/resubmit → KycApplication mới (PENDING_REVIEW)
10. ✅ ProviderProfile.registrationStatus → PENDING
11. ✅ /rejected page → tự redirect về /pending-review (do status đã là PENDING)
12. ✅ ADMIN thấy provider quay lại queue PENDING
```

### Scenario 5: Provider doanh nghiệp

```
1. Step 3: chọn "Doanh nghiệp"
2. ✅ Form thay đổi: ẩn CCCD front/back, hiện GPKD + CCCD người đại diện
3. Upload GPKD (PDF), CCCD người đại diện (JPEG), venue photo (PNG)
4. ✅ Server nhận 3 files, upload lên Cloudinary folder rcfield/kyc/{applicationId}/
5. ✅ KycApplication.businessType = BUSINESS, 3 documents với đúng documentType
```

### Scenario 6: Nộp lại nhiều lần

```
1. Provider đã bị từ chối 2 lần trước
2. Nộp lại lần 3 → POST /provider/kyc/resubmit
3. ✅ Server accept (không giới hạn)
4. ✅ GET /provider/kyc/status → history[] có 2 lần bị từ chối, latestApplication mới
5. ADMIN xem detail → kyc_applications[] có 3 records, sắp xếp mới nhất đầu tiên
```

---

## Unit Test Checklist

### Backend

- [ ] `register()` với valid INDIVIDUAL files → tạo User + ProviderProfile + KycApplication + 3 docs
- [ ] `register()` với valid BUSINESS files → tạo 3 docs đúng documentType
- [ ] `register()` thiếu file bắt buộc → throw `MISSING_DOCUMENTS`
- [ ] `register()` email trùng → throw `EMAIL_EXISTS`, không upload files
- [ ] `approve()` → KycApplication.status = APPROVED, ProviderProfile.status = ACTIVE
- [ ] `reject()` → KycApplication.status = REJECTED, reason saved ở cả 2 nơi
- [ ] `resubmit()` từ REJECTED → KycApplication mới, ProviderProfile → PENDING
- [ ] `resubmit()` từ PENDING → throw `RESUBMIT_NOT_ALLOWED`
- [ ] `getKycStatus()` → trả documents WITHOUT cloudinaryUrl
- [ ] `getProviderDetail()` → ADMIN response trả documents WITH cloudinaryUrl
- [ ] PROVIDER_STATUS_TRANSITIONS: REJECTED → PENDING allowed
- [ ] Partial unique index: không cho 2 PENDING_REVIEW applications cùng provider

### Frontend

- [ ] Step 3 render đúng fields theo business_type selection
- [ ] Validation: highlight missing required files trước khi submit
- [ ] /rejected page: hiển thị rejection_reason
- [ ] /rejected page: form nộp lại hoạt động
- [ ] AdminProviderDetailPage: hiển thị documents với image preview
