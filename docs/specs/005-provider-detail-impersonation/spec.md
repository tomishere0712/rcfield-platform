# Feature Specification: Admin Provider Detail & View as Provider

**Feature Branch**: `005-provider-detail-impersonation`  
**Created**: 2026-05-28  
**Status**: Draft  

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Admin xem chi tiết một Provider (Priority: P1)

Admin đang ở trang danh sách Provider, click vào tên hoặc row của một provider để xem trang chi tiết. Trang này tổng hợp toàn bộ thông tin cần thiết để Admin đánh giá và xử lý tài khoản: thông tin tài khoản, doanh nghiệp, gói đăng ký, danh sách chi nhánh và các action phù hợp với trạng thái hiện tại.

**Why this priority**: Admin cần xem thông tin đầy đủ trước khi ra quyết định (duyệt, từ chối, khóa). Trang danh sách hiện tại thiếu context để hành động chính xác.

**Independent Test**: Có thể test hoàn toàn bằng cách đăng nhập Admin → vào danh sách Provider → click một provider → kiểm tra hiển thị đủ thông tin và các nút action đúng trạng thái. Không cần tính năng impersonation.

**Acceptance Scenarios**:

1. **Given** Admin đang ở trang `/admin/providers`, **When** click vào row của provider bất kỳ, **Then** navigate sang `/admin/providers/:providerId` và hiển thị đầy đủ thông tin provider đó.
2. **Given** Admin đang ở trang chi tiết của provider trạng thái PENDING, **When** xem trang, **Then** chỉ hiển thị nút "Duyệt" và "Từ chối", không có nút Khóa/Mở khóa.
3. **Given** Admin đang ở trang chi tiết của provider trạng thái ACTIVE, **When** xem trang, **Then** chỉ hiển thị nút "Tạm khóa", không có nút Duyệt/Từ chối.
4. **Given** Admin đang ở trang chi tiết của provider trạng thái SUSPENDED, **When** xem trang, **Then** chỉ hiển thị nút "Mở khóa".
5. **Given** Admin bấm "Duyệt" trên trang chi tiết, **When** xác nhận, **Then** trạng thái provider cập nhật thành ACTIVE và trang tự refresh.
6. **Given** provider có 2 chi nhánh đã tạo, **When** Admin xem trang chi tiết, **Then** danh sách 2 chi nhánh hiển thị với tên, địa chỉ, trạng thái.
7. **Given** provider không có chi nhánh nào, **When** Admin xem trang chi tiết, **Then** danh sách chi nhánh hiển thị trạng thái rỗng phù hợp.

---

### User Story 2 — Admin truy cập hệ thống với tư cách Provider (Impersonation) (Priority: P2)

Admin đang ở trang chi tiết của một provider ACTIVE, bấm nút "Truy cập với tư cách Provider". Hệ thống chuyển Admin vào không gian làm việc của provider đó — Admin thấy đúng dashboard, menu, dữ liệu của provider — để có thể setup hoặc kiểm tra giùm họ mà không cần biết mật khẩu. Một banner màu cam luôn hiển thị nhắc nhở đây là phiên impersonation, và Admin có thể thoát bất cứ lúc nào để quay về phiên Admin gốc.

**Why this priority**: Sau khi có trang chi tiết (P1), khả năng setup giùm provider giúp giảm thời gian onboarding và hỗ trợ kỹ thuật đáng kể.

**Independent Test**: Có thể test bằng cách: Admin vào chi tiết provider ACTIVE → bấm "Truy cập với tư cách Provider" → kiểm tra redirect sang provider dashboard, banner cam hiển thị → navigate vài trang provider → bấm "Thoát" → kiểm tra quay về trang chi tiết provider đúng.

**Acceptance Scenarios**:

1. **Given** Admin đang ở trang chi tiết provider ACTIVE, **When** bấm "Truy cập với tư cách Provider", **Then** hệ thống chuyển sang `/provider/dashboard` với banner cam "Đang truy cập với tư cách: [Tên doanh nghiệp]" và nút "Thoát".
2. **Given** Admin đang ở trang chi tiết provider PENDING/SUSPENDED/REJECTED, **When** xem trang, **Then** nút "Truy cập với tư cách Provider" không xuất hiện.
3. **Given** Admin đang trong phiên impersonation, **When** navigate sang `/provider/cafes`, `/provider/configuration` và các trang khác, **Then** banner cam vẫn hiển thị liên tục, không mất.
4. **Given** Admin đang trong phiên impersonation, **When** bấm "Thoát" trên banner, **Then** quay về `/admin/providers/:providerId` (trang chi tiết của provider vừa impersonate) với phiên Admin gốc được khôi phục.
5. **Given** Admin đang trong phiên impersonation và token impersonation hết hạn (2 giờ), **When** thực hiện bất kỳ action nào, **Then** tự động thoát về phiên Admin gốc thay vì bị đăng xuất hoàn toàn.
6. **Given** Admin đang trong phiên impersonation, **When** thao tác trên các trang provider (xem cafes, config widget...), **Then** tất cả API call đều sử dụng identity của provider đó, không phải admin.
7. **Given** Admin đang ở trang danh sách Provider (không phải trang chi tiết), **When** xem trang, **Then** không có nút impersonation ở đây — chỉ có trên trang chi tiết.

---

### Edge Cases

- Admin đang trong phiên impersonation, mở tab mới và vào `/admin/dashboard` — tab mới vẫn có phiên admin gốc hay không? *(Assumption: mỗi tab độc lập, tab đang impersonate không ảnh hưởng tab khác)*
- Provider bị SUSPENDED trong khi Admin đang impersonate họ — session có bị terminate không? *(Assumption: phiên impersonation vẫn chạy cho đến khi hết hạn tự nhiên hoặc Admin thoát thủ công)*
- Admin bấm nút "Truy cập" hai lần liên tiếp — chỉ tạo một phiên impersonation, không mở thêm.
- Khi đang impersonate, Admin không được phép gọi endpoint `/admin/*` (chỉ có token PROVIDER, không có quyền admin).
- Impersonation token hết hạn trong khi form đang được điền — hiển thị thông báo rõ ràng "Phiên hỗ trợ đã hết hạn" và quay về admin.

---

## Requirements *(mandatory)*

### Functional Requirements

**Provider Detail Page:**

- **FR-001**: Hệ thống PHẢI hiển thị trang chi tiết provider tại đường dẫn `/admin/providers/:providerId`, chỉ truy cập được bởi Admin.
- **FR-002**: Trang chi tiết PHẢI hiển thị: tên đầy đủ, email, số điện thoại, ngày đăng ký tài khoản.
- **FR-003**: Trang chi tiết PHẢI hiển thị thông tin doanh nghiệp: tên doanh nghiệp, mô tả doanh nghiệp.
- **FR-004**: Trang chi tiết PHẢI hiển thị trạng thái tài khoản (PENDING / ACTIVE / REJECTED / SUSPENDED) dưới dạng badge màu phân biệt.
- **FR-005**: Trang chi tiết PHẢI hiển thị thông tin gói đăng ký hiện tại: tên gói, trạng thái subscription, ngày hết hạn, số AI messages đã dùng trong tháng.
- **FR-006**: Trang chi tiết PHẢI hiển thị danh sách các chi nhánh (cafes) thuộc provider đó, bao gồm: tên chi nhánh, địa chỉ, trạng thái chi nhánh.
- **FR-007**: Các nút action PHẢI hiển thị có điều kiện theo trạng thái tài khoản:
  - PENDING → "Duyệt" + "Từ chối"
  - ACTIVE → "Tạm khóa"
  - SUSPENDED → "Mở khóa"
  - REJECTED → không có action
- **FR-008**: Thực hiện action (duyệt/từ chối/khóa/mở khóa) trực tiếp từ trang chi tiết PHẢI cập nhật trạng thái ngay lập tức mà không cần tải lại toàn trang.
- **FR-009**: Trang danh sách Provider PHẢI có thể navigate sang trang chi tiết bằng cách click vào row.

**Impersonation:**

- **FR-010**: Nút "Truy cập với tư cách Provider" PHẢI chỉ hiển thị trên trang chi tiết khi provider có trạng thái ACTIVE.
- **FR-011**: Khi Admin bấm "Truy cập với tư cách Provider", hệ thống PHẢI:
  - Tạo phiên làm việc tạm thời với đầy đủ quyền của provider đó
  - Chuyển hướng sang `/provider/dashboard`
  - Hiển thị banner cảnh báo màu cam cố định ở đầu trang
- **FR-012**: Banner impersonation PHẢI hiển thị: tên doanh nghiệp đang được truy cập và nút "Thoát".
- **FR-013**: Banner PHẢI hiển thị liên tục trên TẤT CẢ các trang trong không gian provider trong suốt phiên impersonation, kể cả khi navigate giữa các trang.
- **FR-014**: Khi bấm "Thoát" trên banner, hệ thống PHẢI:
  - Khôi phục hoàn toàn phiên Admin gốc
  - Chuyển hướng về trang chi tiết của provider vừa impersonate (`/admin/providers/:providerId`)
- **FR-015**: Phiên impersonation PHẢI có thời hạn tối đa 2 giờ. Khi hết hạn, hệ thống tự động khôi phục phiên Admin gốc (không đăng xuất).
- **FR-016**: Trong suốt phiên impersonation, tất cả thao tác quản lý dữ liệu (xem cafes, config widget, kênh...) PHẢI thực hiện dưới identity của provider được impersonate.
- **FR-017**: Admin không được thực hiện các thao tác admin (duyệt provider, sửa plans...) khi đang trong phiên impersonation.
- **FR-018**: Hệ thống PHẢI từ chối yêu cầu tạo phiên impersonation nếu người gọi không phải Admin.

### Key Entities

- **Provider Detail**: Tổng hợp từ User (tài khoản), ProviderProfile (doanh nghiệp), ProviderSubscription (gói), Cafes (chi nhánh).
- **Impersonation Session**: Phiên làm việc tạm thời mang identity của provider, có thời hạn 2 giờ, được tạo bởi Admin, lưu trữ phía client (không cần bảng DB riêng ở MVP).
- **Impersonation Banner**: Thành phần UI hiển thị cố định trong suốt phiên impersonation, chứa tên doanh nghiệp và nút thoát.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Admin có thể xem đầy đủ thông tin chi tiết của một provider (tài khoản + doanh nghiệp + subscription + cafes) trong vòng dưới 3 giây sau khi click.
- **SC-002**: Admin có thể bắt đầu phiên impersonation và truy cập vào provider dashboard trong vòng dưới 5 giây kể từ khi bấm nút "Truy cập với tư cách Provider".
- **SC-003**: Banner impersonation hiển thị liên tục 100% thời gian trong phiên impersonation — không có trường hợp nào banner biến mất khi navigate giữa các trang provider.
- **SC-004**: Khi bấm "Thoát", Admin được đưa về đúng trang chi tiết của provider đó trong vòng dưới 2 giây, với phiên Admin gốc hoạt động bình thường.
- **SC-005**: Khi phiên impersonation hết hạn (2 giờ), Admin được khôi phục phiên gốc tự động — không có trường hợp Admin bị đăng xuất hoàn toàn.
- **SC-006**: 100% các action (Duyệt/Từ chối/Khóa/Mở khóa) từ trang chi tiết hoạt động đúng như từ trang danh sách hiện tại.

---

## Assumptions

- Provider detail page chỉ dành cho Admin — không có route public hay provider tự xem trang này.
- Danh sách cafes trong trang chi tiết chỉ hiển thị tên, địa chỉ, trạng thái — không cần xem chi tiết từng cafe ngay trong trang này.
- Nếu provider chưa có subscription (ví dụ PENDING chưa duyệt), phần subscription hiển thị trạng thái "Chưa có gói".
- Phiên impersonation được lưu hoàn toàn phía client (không cần bảng DB) — đây là MVP.
- Admin token gốc được giữ nguyên trong suốt phiên impersonation và không bị invalidate.
- Mỗi tab trình duyệt độc lập — impersonation ở tab này không ảnh hưởng tab khác.
- Không có giới hạn số lần admin có thể impersonate (không rate-limit ở MVP).
- ProviderStatusGuard sẽ bỏ qua kiểm tra khi phiên là impersonation (vì admin không có provider_profile).
- Trang danh sách Provider hiện tại (`/admin/providers`) giữ nguyên UI, chỉ thêm click handler vào row để navigate sang trang chi tiết.
