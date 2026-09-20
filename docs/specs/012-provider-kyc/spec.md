# Feature Specification: Provider KYC Verification

**Feature Branch**: `main`  
**Created**: 2026-07-06  
**Status**: Draft  

## Clarifications

### Session 2026-07-06

- Q: Khi Provider nộp lại hồ sơ, hệ thống tạo record mới hay cập nhật record cũ? → A: Mỗi lần nộp tạo một `KycApplication` record mới; record cũ REJECTED giữ nguyên. Provider chỉ có tối đa 1 record ở trạng thái PENDING_REVIEW hoặc APPROVED tại một thời điểm.
- Q: Provider có xem lại được nội dung giấy tờ đã upload không? → A: Không — Provider chỉ thấy danh sách tên file và trạng thái từng tài liệu (đã nộp / chờ duyệt), không xem được nội dung. Chỉ ADMIN xem được nội dung tài liệu.
- Q: Provider chưa nộp hồ sơ lần đầu — UX như thế nào? → A: Upload giấy tờ là bước 3 ngay trong flow đăng ký nhiều bước (Bước 1: Tài khoản → Bước 2: Doanh nghiệp → Bước 3: Giấy tờ xác thực). Provider hoàn tất cả 3 bước mới bấm đăng ký; chưa đăng ký xong thì chưa vào được hệ thống.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Provider Submits Identity Documents (Priority: P1)

Trong quá trình đăng ký tài khoản Provider (form nhiều bước), bước 3 yêu cầu upload giấy tờ xác thực danh tính và địa điểm kinh doanh. Hệ thống yêu cầu giấy tờ khác nhau tùy loại hình: cá nhân hoặc doanh nghiệp. Provider chỉ hoàn tất đăng ký sau khi upload đủ giấy tờ.

**Why this priority**: Đây là bước bắt buộc để mọi Provider đều có danh tính xác thực. Không có bước này, toàn bộ feature KYC không có giá trị.

**Independent Test**: Có thể test độc lập bằng cách chạy qua flow đăng ký Provider 3 bước, upload đủ giấy tờ theo từng loại hình, và xác nhận hệ thống nhận hồ sơ thành công sau khi bấm đăng ký.

**Acceptance Scenarios**:

1. **Given** Provider đang ở bước 3 của form đăng ký và chọn loại hình "Cá nhân", **When** hệ thống hiển thị bước 3, **Then** form yêu cầu upload: CCCD mặt trước, CCCD mặt sau, ảnh mặt bằng.
2. **Given** Provider đang ở bước 3 của form đăng ký và chọn loại hình "Doanh nghiệp", **When** hệ thống hiển thị bước 3, **Then** form yêu cầu upload: Giấy phép kinh doanh, CCCD người đại diện pháp luật, ảnh mặt bằng.
3. **Given** Provider đã upload đủ giấy tờ theo đúng loại hình, **When** Provider bấm hoàn tất đăng ký, **Then** tài khoản được tạo ở trạng thái PENDING_REVIEW, hệ thống thông báo cho ADMIN có hồ sơ mới chờ duyệt.
4. **Given** Provider chưa upload đủ giấy tờ bắt buộc, **When** Provider cố bấm hoàn tất đăng ký, **Then** hệ thống từ chối và chỉ rõ giấy tờ còn thiếu.

---

### User Story 2 - ADMIN Xét Duyệt Hồ Sơ (Priority: P2)

ADMIN xem danh sách hồ sơ Provider đang chờ duyệt, xem toàn bộ giấy tờ đã upload, rồi phê duyệt hoặc từ chối với lý do rõ ràng.

**Why this priority**: Nếu không có bước duyệt, toàn bộ quy trình KYC không có giá trị. Đây là bước hoàn chỉnh vòng lặp xác thực.

**Independent Test**: Có thể test độc lập bằng cách chuẩn bị hồ sơ Provider đã nộp, vào ADMIN dashboard xét duyệt, và xác nhận trạng thái Provider thay đổi đúng sau mỗi quyết định.

**Acceptance Scenarios**:

1. **Given** Có ít nhất một hồ sơ Provider đang chờ duyệt, **When** ADMIN vào trang quản lý hồ sơ, **Then** hệ thống hiển thị danh sách với: tên Provider, loại hình, ngày nộp, trạng thái hiện tại.
2. **Given** ADMIN đang xem hồ sơ của một Provider, **When** ADMIN nhấn "Phê duyệt", **Then** tài khoản Provider được kích hoạt, Provider nhận thông báo tài khoản đã được duyệt.
3. **Given** ADMIN đang xem hồ sơ của một Provider, **When** ADMIN nhấn "Từ chối" và nhập lý do (bắt buộc), **Then** hồ sơ chuyển sang trạng thái bị từ chối, Provider nhận thông báo kèm lý do cụ thể.
4. **Given** ADMIN không nhập lý do khi từ chối, **When** ADMIN cố xác nhận từ chối, **Then** hệ thống yêu cầu nhập lý do trước khi cho phép tiếp tục.

---

### User Story 3 - Provider Nộp Lại Hồ Sơ Sau Từ Chối (Priority: P3)

Provider bị từ chối có thể xem lý do từ chối, chỉnh sửa/thay thế giấy tờ, và nộp lại hồ sơ để xét duyệt lại. Không giới hạn số lần nộp lại.

**Why this priority**: Từ chối do lỗi kỹ thuật (ảnh mờ, sai giấy tờ) là phổ biến. Không có bước này, Provider hợp lệ bị chặn vĩnh viễn do lỗi nhỏ.

**Independent Test**: Có thể test bằng cách tạo hồ sơ đã bị từ chối, vào trang hồ sơ, xem lý do, upload lại giấy tờ mới, và xác nhận hồ sơ quay lại hàng đợi chờ duyệt.

**Acceptance Scenarios**:

1. **Given** Hồ sơ Provider bị từ chối, **When** Provider đăng nhập và xem trạng thái tài khoản, **Then** hệ thống hiển thị lý do từ chối cụ thể do ADMIN nhập.
2. **Given** Provider đang xem lý do từ chối, **When** Provider upload lại giấy tờ đã được sửa và nộp lại, **Then** hồ sơ quay lại hàng đợi chờ ADMIN duyệt, trạng thái chuyển về "Đang chờ xét duyệt".
3. **Given** Provider đã bị từ chối nhiều lần, **When** Provider nộp lại lần thứ N bất kỳ, **Then** hệ thống vẫn chấp nhận (không giới hạn số lần nộp lại).
4. **Given** Provider nộp lại hồ sơ, **When** ADMIN vào hàng đợi, **Then** ADMIN thấy lịch sử các lần nộp trước (ngày nộp, kết quả, lý do từ chối nếu có).

---

### Edge Cases

- Provider đã được duyệt rồi muốn cập nhật giấy tờ (ví dụ: CCCD hết hạn) → ngoài phạm vi v1, xử lý thủ công qua support.
- Provider thay đổi loại hình (từ cá nhân sang doanh nghiệp) sau khi đã nộp hồ sơ → phải nộp lại toàn bộ giấy tờ theo loại hình mới.
- File upload bị lỗi giữa chừng (mất kết nối) → hệ thống không lưu hồ sơ dở dang, Provider thử lại từ đầu.
- ADMIN không duyệt trong thời gian dài → không có SLA cứng ở v1; dashboard hiển thị ngày nộp để ADMIN tự điều phối.
- Cùng số CCCD xuất hiện ở nhiều hồ sơ khác nhau → hệ thống không tự phát hiện ở v1; ADMIN phát hiện qua review thủ công.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Provider PHẢI chọn loại hình kinh doanh (cá nhân / doanh nghiệp) khi bắt đầu nộp hồ sơ.
- **FR-002**: Provider cá nhân PHẢI upload đúng 3 tài liệu bắt buộc: CCCD mặt trước, CCCD mặt sau, ảnh mặt bằng.
- **FR-003**: Provider doanh nghiệp PHẢI upload đúng 3 tài liệu bắt buộc: Giấy phép kinh doanh, CCCD người đại diện pháp luật, ảnh mặt bằng.
- **FR-004**: Hệ thống PHẢI từ chối nộp hồ sơ nếu còn thiếu bất kỳ tài liệu bắt buộc nào, và chỉ rõ tài liệu còn thiếu.
- **FR-005**: ADMIN PHẢI có trang danh sách hồ sơ Provider đang chờ duyệt, sắp xếp theo ngày nộp cũ nhất lên trước.
- **FR-006**: ADMIN PHẢI xem được nội dung (preview/download) từng tài liệu đã upload của Provider trước khi ra quyết định.
- **FR-006b**: Provider CHỈ được xem danh sách tên file và trạng thái từng tài liệu; Provider KHÔNG được xem nội dung tài liệu đã upload.
- **FR-007**: ADMIN PHẢI có thể phê duyệt hồ sơ, kích hoạt tài khoản Provider ngay lập tức.
- **FR-008**: ADMIN PHẢI có thể từ chối hồ sơ kèm lý do bắt buộc (không được để trống).
- **FR-009**: Provider PHẢI nhận thông báo trong hệ thống khi hồ sơ được phê duyệt hoặc từ chối.
- **FR-010**: Provider PHẢI thấy lý do từ chối trên trang quản lý tài khoản của mình.
- **FR-011**: Provider PHẢI có thể thay thế giấy tờ và nộp lại hồ sơ sau khi bị từ chối, không giới hạn số lần.
- **FR-012**: Mọi tài khoản ADMIN PHẢI có quyền xem và xét duyệt hồ sơ KYC.
- **FR-013**: Hệ thống PHẢI lưu lịch sử toàn bộ các lần nộp của mỗi Provider (ngày nộp, quyết định, lý do từ chối).
- **FR-014**: Provider chưa được phê duyệt KYC KHÔNG được phép nhận booking từ khách hàng.

### Key Entities

- **ProviderKycApplication**: Hồ sơ KYC của một Provider — loại hình (cá nhân/doanh nghiệp), trạng thái (PENDING_REVIEW / APPROVED / REJECTED), lý do từ chối, ngày nộp, ngày quyết định, ADMIN xét duyệt. Mỗi lần nộp tạo một record mới; Provider chỉ có tối đa 1 record ở trạng thái PENDING_REVIEW hoặc APPROVED tại một thời điểm. Các record REJECTED cũ được giữ nguyên để làm lịch sử.
- **KycDocument**: Từng tài liệu trong hồ sơ — loại tài liệu (CCCD_FRONT, CCCD_BACK, GPKD, VENUE_PHOTO, REPRESENTATIVE_ID), URL lưu trữ, ngày upload.
- **Provider**: Thực thể hiện có — bổ sung trạng thái xác thực KYC và liên kết tới hồ sơ KYC hiện hành.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Provider có thể hoàn thành nộp hồ sơ đầy đủ trong vòng 5 phút.
- **SC-002**: ADMIN có thể xem xong toàn bộ tài liệu và ra quyết định trong vòng 2 phút cho một hồ sơ.
- **SC-003**: Provider nhận được thông báo kết quả trong vòng 5 phút sau khi ADMIN ra quyết định.
- **SC-004**: 100% Provider đang hoạt động (nhận booking) đều có hồ sơ KYC được phê duyệt.
- **SC-005**: Tỷ lệ Provider hợp lệ bị từ chối do lỗi kỹ thuật (ảnh mờ, thiếu mặt) giảm về 0 sau khi có hướng dẫn rõ trong form upload.

## Assumptions

- Flow đăng ký Provider hiện tại là form nhiều bước (Bước 1: Tài khoản, Bước 2: Doanh nghiệp); tính năng này bổ sung Bước 3: Giấy tờ xác thực vào cuối flow. Provider hoàn tất cả 3 bước mới tạo được tài khoản ở trạng thái PENDING_REVIEW.
- File upload hỗ trợ định dạng ảnh phổ biến (JPEG, PNG) và PDF; dung lượng tối đa mỗi file là 10MB.
- Ảnh mặt bằng phải thể hiện không gian vật lý của sân RC (không phải ảnh chụp từ internet).
- Hệ thống không thực hiện xác thực tự động (OCR, face matching); toàn bộ do ADMIN review thủ công.
- Storage tài liệu dùng Cloudinary trong giai đoạn phát triển/testing; sẽ được chuyển sang storage tuân thủ pháp lý Việt Nam trước khi go-live với dữ liệu thật.
- Thông báo cho Provider dùng cơ chế thông báo trong hệ thống hiện có (không cần email/SMS ở v1).
- Provider không thể tạo lịch và nhận booking cho đến khi hồ sơ KYC được phê duyệt — đây là gate bắt buộc.
