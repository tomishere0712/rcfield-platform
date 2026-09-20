# Feature Specification: Booking Review & Rating

**Feature Branch**: `011-booking-review`  
**Created**: 2026-07-06  
**Status**: Draft  

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Khách hàng đánh giá sau khi hoàn thành booking (Priority: P1)

Sau khi phiên chơi kết thúc và booking được đánh dấu hoàn thành, khách hàng nhận được thông báo mời đánh giá chi nhánh. Khách hàng điền form có sẵn gồm điểm tổng, 3 tiêu chí con (chất lượng xe, thái độ nhân viên, cơ sở vật chất) và ghi chú tùy chọn, sau đó submit. Đánh giá được lưu lại và hiển thị công khai trên trang chi nhánh.

**Why this priority**: Đây là tính năng cốt lõi — không có US1 thì không có dữ liệu đánh giá nào để hiển thị hay phân tích.

**Independent Test**: Tạo 1 booking hoàn thành → nhận noti → submit form 5 sao → kiểm tra rating hiển thị trên trang chi nhánh.

**Acceptance Scenarios**:

1. **Given** booking ở trạng thái COMPLETED, **When** hệ thống đánh dấu hoàn thành, **Then** gửi push notification cho khách trong vòng 5 phút mời đánh giá chi nhánh.
2. **Given** khách nhấn vào noti hoặc mở web, **When** chưa đánh giá booking này, **Then** hiển thị form đánh giá với: điểm tổng (1–5 sao), 3 tiêu chí con (1–5 sao mỗi tiêu chí), ô ghi chú (tùy chọn, tối đa 500 ký tự).
3. **Given** khách điền đủ điểm tổng (bắt buộc), **When** submit, **Then** đánh giá được lưu, form đóng lại, hiển thị thông báo "Cảm ơn bạn đã đánh giá!", không thể submit lại cho booking đó.
4. **Given** khách chưa điền điểm tổng, **When** nhấn submit, **Then** hiển thị lỗi "Vui lòng chọn số sao tổng thể" và không cho submit.
5. **Given** khách nhấn "Bỏ qua", **When** xác nhận bỏ qua, **Then** đánh dấu booking đã dismissed, không hiển thị nhắc nhở lần sau nữa.

---

### User Story 2 — Khách thấy nhắc nhở đánh giá khi vào web (Priority: P1)

Lần sau khách vào web (sau khi đã có booking hoàn thành chưa đánh giá và chưa bỏ qua), hệ thống hiển thị banner/popup nhắc nhở đánh giá.

**Why this priority**: Không phải ai cũng nhấn noti ngay. Nhắc nhở in-app đảm bảo tỉ lệ đánh giá cao hơn.

**Independent Test**: Tạo booking hoàn thành → không nhấn noti → đăng nhập lại → kiểm tra banner nhắc nhở xuất hiện.

**Acceptance Scenarios**:

1. **Given** khách đăng nhập và có booking COMPLETED chưa đánh giá (và chưa bỏ qua), **When** vào trang bất kỳ trong app, **Then** hiển thị banner/card nhắc đánh giá với tên chi nhánh và nút "Đánh giá ngay".
2. **Given** có nhiều booking chưa đánh giá, **When** hiển thị nhắc nhở, **Then** chỉ hiện 1 booking một lần (booking gần nhất trước).
3. **Given** khách nhấn "Bỏ qua" trên banner, **When** xác nhận, **Then** đánh dấu dismissed cho booking đó, banner biến mất, không hiện lại.
4. **Given** tất cả booking đã đánh giá hoặc đã bỏ qua, **When** vào web, **Then** không hiển thị bất kỳ nhắc nhở nào.

---

### User Story 3 — Khách khác xem rating công khai của chi nhánh (Priority: P2)

Trên trang chi nhánh, khách có thể xem điểm rating tổng, điểm theo tiêu chí và danh sách các đánh giá của những người đã chơi.

**Why this priority**: Đây là giá trị công khai của tính năng — giúp khách quyết định chọn chi nhánh nào.

**Independent Test**: Chi nhánh có ít nhất 1 đánh giá → vào trang chi nhánh (không cần đăng nhập) → thấy điểm sao tổng và danh sách review.

**Acceptance Scenarios**:

1. **Given** chi nhánh có ít nhất 1 đánh giá, **When** xem trang chi nhánh, **Then** hiển thị điểm tổng trung bình (1 chữ số thập phân), số lượng đánh giá, và điểm trung bình của 3 tiêu chí con.
2. **Given** trang chi nhánh, **When** cuộn xuống phần đánh giá, **Then** thấy danh sách tối đa 10 review gần nhất gồm: tên người đánh giá (ẩn họ), điểm sao, tiêu chí con, ghi chú, thời gian.
3. **Given** chi nhánh chưa có đánh giá nào, **When** xem trang chi nhánh, **Then** hiển thị "Chưa có đánh giá. Hãy là người đầu tiên!" thay vì điểm sao.
4. **Given** đánh giá có ghi chú trống, **When** hiển thị, **Then** chỉ hiện điểm sao, không hiện phần ghi chú.

---

### User Story 4 — Provider xem tổng hợp rating chi nhánh trong dashboard (Priority: P2)

Provider vào dashboard thấy điểm rating tổng hợp cho từng chi nhánh, xu hướng theo thời gian, và danh sách review gần đây.

**Why this priority**: Provider cần biết khách hàng đánh giá chi nhánh của mình thế nào để cải thiện chất lượng dịch vụ.

**Independent Test**: Chi nhánh có ≥ 3 đánh giá → vào Provider Dashboard → thấy điểm rating và danh sách review.

**Acceptance Scenarios**:

1. **Given** Provider vào dashboard, **When** xem tổng quan chi nhánh, **Then** thấy điểm rating trung bình cho mỗi chi nhánh kèm số lượng đánh giá.
2. **Given** Provider vào trang chi tiết chi nhánh, **When** xem tab đánh giá, **Then** thấy phân tích điểm theo 3 tiêu chí, biểu đồ xu hướng theo tháng, và toàn bộ danh sách review (có phân trang).
3. **Given** có review mới trong 24h, **When** Provider vào dashboard, **Then** badge thông báo "N đánh giá mới".

---

### Edge Cases

- Khách hủy giữa chừng khi đang điền form → dữ liệu chưa submit bị xóa, booking không bị đánh dấu đã đánh giá (vẫn có thể điền lại).
- Booking của BYOC (không thuê xe) → tiêu chí "Chất lượng xe" ẩn, chỉ hiện "Nhân viên" và "Cơ sở vật chất".
- Khách submit đánh giá sau 7 ngày kể từ ngày booking hoàn thành → server từ chối (400 `REVIEW_PERIOD_EXPIRED`); frontend hiển thị inline message "Thời hạn đánh giá đã hết (7 ngày)" thay vì form, kèm nút quay lại — không redirect tự động.
- Provider tự đặt lịch thử (booking với tài khoản nội bộ) → không gửi noti đánh giá, không tính vào rating công khai.
- Ghi chú chứa nội dung không phù hợp → hệ thống không tự kiểm duyệt (v1), Provider có thể ẩn review vi phạm.
- Khách nhấn submit 2 lần liên tiếp (double-tap) → frontend disable nút ngay khi nhấn lần đầu (loading state); unique constraint trên DB là lưới an toàn thụ động nếu 2 request vượt qua được client.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Hệ thống PHẢI tự động gửi thông báo mời đánh giá cho khách trong vòng 5 phút sau khi booking chuyển sang trạng thái COMPLETED.
- **FR-002**: Mỗi booking chỉ được đánh giá đúng 1 lần; sau khi submit không cho phép sửa hoặc xóa.
- **FR-003**: Form đánh giá PHẢI bao gồm: điểm tổng thể (1–5 sao, bắt buộc), điểm chất lượng xe (1–5 sao, tùy chọn), điểm thái độ nhân viên (1–5 sao, tùy chọn), điểm cơ sở vật chất (1–5 sao, tùy chọn), ghi chú văn bản (tùy chọn, tối đa 500 ký tự).
- **FR-004**: Đối với booking BYOC, tiêu chí "Chất lượng xe" PHẢI bị ẩn khỏi form.
- **FR-005**: Thời hạn đánh giá là 7 ngày tính từ ngày booking hoàn thành; quá hạn hệ thống từ chối submit.
- **FR-006**: Khách hàng CÓ THỂ bỏ qua đánh giá; sau khi bỏ qua hệ thống không nhắc lại cho booking đó.
- **FR-007**: Khi khách đăng nhập và có booking chưa đánh giá (chưa dismissed, còn trong hạn 7 ngày), hệ thống PHẢI hiển thị nhắc nhở — tối đa 1 nhắc/lần, ưu tiên booking gần nhất.
- **FR-008**: Rating của chi nhánh PHẢI được hiển thị công khai trên trang chi nhánh (không yêu cầu đăng nhập để xem).
- **FR-009**: Điểm rating tổng của chi nhánh PHẢI được tính là trung bình cộng tất cả `overall_score`, làm tròn đến 1 chữ số thập phân.
- **FR-010**: Provider PHẢI có thể ẩn một review vi phạm (không xóa vĩnh viễn); review bị ẩn không tính vào điểm trung bình.
- **FR-011**: Provider PHẢI thấy badge thông báo khi có review mới trong dashboard.

### Key Entities

- **Review**: Một lượt đánh giá của khách cho một booking. Liên kết 1-1 với booking. Thuộc về 1 cafe. Gồm: điểm tổng, 3 điểm tiêu chí (nullable), ghi chú, trạng thái (visible/hidden), thời gian tạo.
- **ReviewDismissal**: Ghi lại việc khách chọn bỏ qua đánh giá cho một booking cụ thể. Ngăn hệ thống nhắc lại.
- **Cafe Rating Aggregate**: Dữ liệu tổng hợp rating của một chi nhánh (điểm trung bình, số lượng, breakdown theo tiêu chí). Được tính lại mỗi khi có review mới.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Khách hàng hoàn thành form đánh giá trong dưới 2 phút.
- **SC-002**: Thông báo mời đánh giá được gửi trong vòng 5 phút sau khi booking hoàn thành, đạt 100% các booking đủ điều kiện.
- **SC-003**: Tỉ lệ khách submit đánh giá (không bỏ qua) đạt ≥ 40% trong 30 ngày đầu sau khi ra mắt.
- **SC-004**: Trang chi nhánh hiển thị rating tổng hợp chính xác, cập nhật ngay sau khi có đánh giá mới được submit hoặc sau khi Provider ẩn/hiện review (không trễ quá 1 phút, aggregate tính on-the-fly mỗi lần load).
- **SC-005**: Provider thấy rating của từng chi nhánh trong dashboard mà không cần thao tác thêm.

---

## Assumptions

- Hệ thống thông báo (push notification) đã có sẵn và hoạt động — tính năng này chỉ thêm 1 loại noti mới.
- Khách hàng đã đăng nhập khi nhấn vào link đánh giá từ noti; nếu chưa đăng nhập thì redirect về login rồi quay lại form.
- Booking BYOC được phân biệt qua trường `booking_mode` đã có trong hệ thống.
- Chưa có cơ chế kiểm duyệt tự động (v1) — Provider tự ẩn review vi phạm thủ công.
- Hiển thị tên người đánh giá dạng ẩn họ theo format: tên đệm + tên + chữ cái đầu của họ + dấu chấm (ví dụ: "Văn An N."). Áp dụng bằng cách split `full_name` theo khoảng trắng: token đầu là họ, các token còn lại là tên đệm + tên.
- Rating không áp dụng cho booking do chính Provider tạo cho mục đích nội bộ (mock booking).

---

## Clarifications

### Session 2026-07-06

- Q: Khi Provider ẩn/hiện review, điểm trung bình cafe cập nhật ngay hay batch? → A: Cập nhật ngay — aggregate tính on-the-fly mỗi lần load trang (không cache).
- Q: Format hiển thị tên người đánh giá công khai? → A: Tên đệm + tên + chữ cái đầu họ + dấu chấm (ví dụ: "Văn An N.").
- Q: Xử lý double-submit (khách nhấn 2 lần liên tiếp)? → A: Client-side — disable button ngay khi nhấn; DB unique constraint là lưới an toàn thụ động.
- Q: UX khi khách mở link đánh giá đã quá 7 ngày? → A: Hiển thị inline message "Thời hạn đánh giá đã hết (7 ngày)" thay vì form, có nút quay lại.
