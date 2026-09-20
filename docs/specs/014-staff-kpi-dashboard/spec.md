# Feature Specification: Staff KPI Dashboard

**Feature Branch**: `014-staff-kpi-dashboard`  
**Created**: 2026-07-08  
**Status**: Draft

## Clarifications

### Session 2026-07-08

- Q: KPI thứ 5 đo gì — "Thời gian online TB/ngày" hay "Số ngày hoạt động"? → A: Số ngày hoạt động (activeDaysCount) — ngày có ít nhất 1 hành động nghiệp vụ.
- Q: Cửa sổ "check-in đúng giờ" tính thế nào? → A: ±15 phút quanh slot_start (cả sớm lẫn muộn đều được tính đúng giờ).
- Q: Provider mở trang chi tiết nhân viên bằng cách nào? → A: Qua mục "Xem chi tiết" trong dropdown menu "..." trên card — không làm card thành link.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Xem KPI tổng quan của nhân viên (Priority: P1)

Provider (chủ sân) nhấn vào card nhân viên trên trang quản lý nhân sự để xem trang chi tiết. Trang hiển thị profile đầy đủ và 5 chỉ số KPI chính của nhân viên đó, có thể lọc theo khoảng thời gian 7 ngày / 30 ngày / 90 ngày.

**Why this priority**: Đây là core value của tính năng — Provider cần biết nhân viên nào làm việc hiệu quả để ra quyết định quản lý.

**Independent Test**: Có thể test độc lập bằng cách mở trang `/provider/staff/:id`, kiểm tra 5 KPI card hiển thị đúng số liệu, và nút lọc thời gian thay đổi được giá trị.

**Acceptance Scenarios**:

1. **Given** Provider đang xem `/provider/staff`, **When** mở menu "..." trên card nhân viên và chọn "Xem chi tiết", **Then** điều hướng đến `/provider/staff/:id` với tên nhân viên và 5 KPI card hiển thị đúng.
2. **Given** Provider đang xem trang KPI của nhân viên với filter "30 ngày", **When** chuyển sang "7 ngày", **Then** tất cả 5 KPI card cập nhật giá trị theo đúng khoảng thời gian mới.
3. **Given** Nhân viên chưa có hoạt động nào trong khoảng thời gian đã chọn, **When** Provider xem KPI, **Then** các card hiển thị giá trị 0 kèm thông báo "Chưa có dữ liệu trong khoảng thời gian này."
4. **Given** Provider chọn một nhân viên không thuộc chi nhánh của mình, **When** truy cập trang chi tiết, **Then** hệ thống từ chối truy cập và hiển thị thông báo lỗi phù hợp.

---

### User Story 2 - Xem lịch sử hoạt động (Activity Timeline) (Priority: P2)

Provider xem danh sách các sự kiện nghiệp vụ gần đây của nhân viên theo thứ tự thời gian: booking đã check-in, FnB order đã xử lý, session được gia hạn. Mỗi sự kiện hiển thị thời gian, loại hành động và thông tin booking/order liên quan.

**Why this priority**: Timeline giúp Provider hiểu được pattern làm việc của nhân viên, không chỉ nhìn số tổng — nhưng có thể bổ sung sau khi KPI tổng quan đã hoạt động.

**Independent Test**: Có thể test bằng cách kiểm tra phần Timeline hiển thị đúng 20 sự kiện gần nhất, sắp xếp từ mới đến cũ, với đúng loại hành động và thời gian.

**Acceptance Scenarios**:

1. **Given** Nhân viên đã thực hiện nhiều hành động, **When** Provider xem Timeline, **Then** các sự kiện hiển thị theo thứ tự từ mới đến cũ, mỗi sự kiện có timestamp và mô tả rõ ràng.
2. **Given** Timeline hiển thị 20 sự kiện đầu tiên, **When** Provider cuộn xuống cuối, **Then** có thể tải thêm 20 sự kiện tiếp theo.
3. **Given** Nhân viên không có hoạt động nào, **When** Provider xem Timeline, **Then** hiển thị trạng thái trống với thông báo phù hợp.

---

### Edge Cases

- Nhân viên mới được mời nhưng chưa check-in lần nào → tất cả KPI = 0, không lỗi.
- Provider xem nhân viên của chi nhánh khác (không thuộc mình) → trả về lỗi 403.
- Khoảng thời gian được chọn không có dữ liệu → hiển thị 0, không crash.
- `last_active_at` là NULL (nhân viên chưa từng đăng nhập) → hiển thị "Chưa có dữ liệu".
- Số liệu KPI rất lớn (>9999) → hiển thị đúng định dạng (ví dụ: 10.2K).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Hệ thống PHẢI cho phép Provider điều hướng đến trang chi tiết nhân viên bằng cách chọn mục "Xem chi tiết" trong dropdown menu "..." trên card nhân viên (cùng menu với các thao tác Vô hiệu hóa, Chuyển chi nhánh, v.v.).
- **FR-002**: Trang chi tiết PHẢI hiển thị đầy đủ thông tin profile: ảnh đại diện (chữ cái đầu), họ tên, email, số điện thoại, chi nhánh, trạng thái tài khoản, ngày tham gia, chỉ báo online.
- **FR-003**: Hệ thống PHẢI hiển thị 5 KPI card: (1) Tổng booking đã check-in, (2) FnB orders đã xử lý, (3) Số lần gia hạn session đã duyệt, (4) Tỉ lệ check-in đúng giờ (%), (5) Số ngày hoạt động (số ngày có ít nhất 1 hành động nghiệp vụ trong khoảng thời gian được chọn).
- **FR-004**: Provider PHẢI có thể lọc tất cả KPI theo 3 khoảng thời gian: 7 ngày / 30 ngày / 90 ngày tính từ thời điểm hiện tại.
- **FR-005**: Hệ thống PHẢI tính KPI từ dữ liệu nghiệp vụ hiện có (bookings, sessions, fnb_orders) mà không cần bảng log bổ sung.
- **FR-006**: Tỉ lệ check-in đúng giờ được tính là % số booking được check-in trong khoảng ±15 phút quanh giờ bắt đầu đã đặt (tức là từ 15 phút trước đến 15 phút sau `slot_start`).
- **FR-007**: Trang PHẢI hiển thị Activity Timeline gồm tối đa 20 sự kiện gần nhất, hỗ trợ phân trang (tải thêm).
- **FR-008**: Provider chỉ được phép xem chi tiết nhân viên thuộc các chi nhánh do mình quản lý — hệ thống PHẢI kiểm tra quyền này.
- **FR-009**: Trang PHẢI có nút quay lại danh sách nhân viên.
- **FR-010**: Khi KPI đang tải, hệ thống PHẢI hiển thị skeleton placeholder thay vì layout trống.

### Key Entities

- **StaffKpiSummary**: Tập hợp 5 chỉ số KPI của một nhân viên trong một khoảng thời gian — checkins, fnbOrders, extensions, onTimeRate, activeDaysCount.
- **StaffActivityEvent**: Một sự kiện trong timeline — loại hành động (CHECK_IN / FNB_ORDER / EXTENSION), thời gian, booking/order id liên quan, tên khách hàng (nếu có).
- **StaffDetail**: Mở rộng của StaffListItem — bổ sung ngày tham gia (`activatedAt`) và `lastActiveAt`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Provider mở được trang chi tiết nhân viên trong vòng 2 giây từ lúc nhấn vào card.
- **SC-002**: Tất cả 5 KPI card cập nhật giá trị trong vòng 1 giây sau khi Provider thay đổi bộ lọc thời gian.
- **SC-003**: Provider không thể truy cập trang chi tiết nhân viên của Provider khác — hệ thống trả về lỗi rõ ràng trong 100% trường hợp.
- **SC-004**: Trang hiển thị đúng trên cả desktop và mobile (responsive).
- **SC-005**: Timeline hiển thị đúng thứ tự thời gian (mới nhất trước) và đúng loại sự kiện trong 100% test case.

## Assumptions

- KPI được tính real-time từ dữ liệu nghiệp vụ hiện có — không cache, không pre-aggregate (phù hợp với quy mô hiện tại).
- "Check-in đúng giờ" định nghĩa là: check-in diễn ra trong vòng 15 phút trước hoặc sau giờ bắt đầu booking.
- Activity Timeline chỉ gồm 3 loại sự kiện nghiệp vụ: CHECK_IN, FNB_ORDER, EXTENSION — không bao gồm login/logout.
- Chỉ Provider xem được trang này — Staff và Admin không có route này.
- Dữ liệu online presence (`last_active_at`) đã được triển khai (xem migration `1752400000000-AddLastActiveAt`).
- "Số ngày hoạt động" (activeDaysCount) tính bằng cách đếm số ngày phân biệt có ít nhất 1 sự kiện nghiệp vụ (check-in, FnB order, hoặc extension proposal) — không phụ thuộc vào `last_active_at`.
