# Feature Specification: Booking & Payment Flow

**Feature Branch**: `003-fb-messenger-channel` (current)
**Created**: 2026-06-08
**Status**: Draft

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Customer Tạo Booking RENTAL (Priority: P1)

Một khách hàng đã đăng nhập muốn đặt lịch chơi RC theo chế độ RENTAL (thuê xe của quán). Họ chọn cafe, chọn ngày giờ, chọn xe muốn thuê, thêm người chơi cùng, chọn thêm đồ ăn/thức uống trước (pre-order F&B tuỳ chọn), xem lại tổng tiền cần thanh toán, và hoàn tất qua cổng thanh toán. Sau khi thanh toán thành công, booking chuyển sang trạng thái CONFIRMED và khách nhận xác nhận.

**Why this priority**: Đây là luồng doanh thu cốt lõi — không có booking RENTAL thì toàn bộ hệ thống không tạo ra giá trị. P1 vì tất cả tính năng khác phụ thuộc vào luồng này hoạt động đúng.

**Independent Test**: Có thể test đầy đủ bằng cách: đăng nhập customer → tạo booking RENTAL 1 xe → thanh toán sandbox → xác nhận booking CONFIRMED hiển thị đúng trên màn hình khách.

**Acceptance Scenarios**:

1. **Given** khách đã đăng nhập và cafe có ít nhất 1 xe AVAILABLE trong khung giờ được chọn, **When** khách hoàn tất checkout và thanh toán thành công, **Then** booking được tạo với trạng thái CONFIRMED, slot bị khoá cho xe đó, và màn hình hiển thị xác nhận cùng breakdown chi tiết (slot fee, rental fee, deposit, F&B nếu có).

2. **Given** khách đang trong quá trình checkout (booking PENDING), **When** hết 30 phút mà chưa thanh toán, **Then** booking tự động bị huỷ và slot được giải phóng cho người khác đặt.

3. **Given** có 2 khách đang checkout cùng xe cùng khung giờ, **When** một người hoàn tất thanh toán trước, **Then** người kia nhận thông báo lỗi "xe đã được đặt" và không bị trừ tiền.

4. **Given** khách chọn thêm F&B pre-order, **When** thanh toán thành công, **Then** tổng tiền bao gồm cả F&B và danh sách món được lưu cùng booking.

---

### User Story 2 — Customer Tạo Booking BYOC (Priority: P2)

Khách hàng mang xe cá nhân đến chơi (BYOC — Bring Your Own Car). Họ không cần chọn xe của quán mà chỉ cần đặt slot tại sân. Hệ thống kiểm tra sức chứa BYOC của cafe trong khung giờ đó. Thanh toán chỉ bao gồm slot fee (không có rental fee hay security deposit).

**Why this priority**: BYOC là chế độ chơi thứ hai của hệ thống, phục vụ nhóm khách có xe riêng — thường chiếm 30–40% booking. Cần làm sau RENTAL vì chia sẻ cùng checkout flow, chỉ khác ở loại phí và kiểm tra capacity.

**Independent Test**: Đăng nhập customer → tạo booking BYOC → thanh toán → CONFIRMED chỉ có slot fee, không có rental fee/deposit.

**Acceptance Scenarios**:

1. **Given** cafe còn slot BYOC trong khung giờ được chọn, **When** khách hoàn tất booking BYOC, **Then** slot BYOC counter giảm 1, booking CONFIRMED chỉ có slot_fee trong breakdown, không có rental_fee hay security_deposit.

2. **Given** cafe đã đạt giới hạn BYOC capacity trong khung giờ đó, **When** khách cố tạo booking BYOC, **Then** hệ thống báo lỗi "sân đã đủ số lượng xe cá nhân trong khung giờ này".

---

### User Story 3 — Provider/Staff Xem Danh Sách Booking (Priority: P3)

Provider và Staff có thể xem danh sách booking của cafe mình theo ngày. Họ cần biết ai đặt, giờ nào, chế độ gì, và trạng thái hiện tại để chuẩn bị vận hành.

**Why this priority**: Quan trọng cho vận hành nhưng không blocking — Provider/Staff vẫn có thể vận hành nếu chỉ nhận thông báo. Làm sau khi booking flow hoạt động ổn định.

**Independent Test**: Tạo ít nhất 1 booking CONFIRMED → đăng nhập provider → vào trang quản lý booking → booking xuất hiện với đúng thông tin.

**Acceptance Scenarios**:

1. **Given** cafe có ít nhất 1 booking trong ngày hôm nay, **When** provider/staff vào trang booking của cafe, **Then** danh sách hiển thị đầy đủ: tên khách, giờ, chế độ chơi, số người, trạng thái.

2. **Given** provider có nhiều chi nhánh, **When** provider xem danh sách booking, **Then** có thể lọc theo chi nhánh và ngày cụ thể.

---

### User Story 4 — Customer Huỷ Booking (Priority: P4)

Khách hàng có thể huỷ booking đã CONFIRMED. Hệ thống áp dụng chính sách hoàn tiền theo thời gian: hoàn 100% nếu huỷ trước 24 giờ, hoàn 50% slot fee nếu huỷ trong khoảng 12–24 giờ, không hoàn slot fee nếu huỷ trong vòng 12 giờ trước giờ chơi. Rental fee và security deposit luôn được hoàn. **F&B pre-order refund policy chưa được xác định — cần quyết định trước khi implement cancellation service.**

**Why this priority**: Cần thiết cho trải nghiệm khách nhưng phức tạp hơn về nghiệp vụ. Làm sau khi booking+payment core ổn định.

**Independent Test**: Tạo booking CONFIRMED → huỷ trong các mốc thời gian khác nhau → kiểm tra số tiền hoàn đúng theo policy.

**Acceptance Scenarios**:

1. **Given** booking CONFIRMED còn hơn 24 giờ trước giờ chơi, **When** khách huỷ, **Then** hoàn toàn bộ số tiền đã thanh toán.

2. **Given** booking CONFIRMED còn 12–24 giờ trước giờ chơi, **When** khách huỷ, **Then** hoàn 50% slot fee + 100% rental fee + 100% security deposit.

3. **Given** booking CONFIRMED còn dưới 12 giờ trước giờ chơi, **When** khách huỷ, **Then** không hoàn slot fee, hoàn 100% rental fee + 100% security deposit.

---

### Edge Cases

- **Slot conflict race condition**: 2 người checkout cùng xe cùng slot → chỉ người thanh toán trước được giữ slot, người sau bị từ chối với thông báo rõ ràng.
- **Thanh toán timeout**: Sau 30 phút không thanh toán, booking tự động CANCELLED và slot lock được giải phóng.
- **VNPay callback thất bại**: Nếu IPN không nhận được, hệ thống có cơ chế reconcile khi khách redirect về (return URL). Booking không CONFIRMED cho đến khi xác nhận được thanh toán.
- **Thanh toán thành công nhưng IPN đến trễ**: Booking đã được xác nhận qua return URL → IPN đến sau → idempotent, không xử lý lại.
- **Khách chọn xe không còn AVAILABLE**: Nếu xe bị đổi trạng thái MAINTENANCE sau khi khách bắt đầu checkout nhưng trước khi hoàn tất → báo lỗi khi tạo booking.
- **Số tiền F&B = 0**: Cho phép checkout không có F&B, chỉ tính slot fee + rental/deposit.
- **BYOC + RENTAL (MIXED mode)**: Một booking có thể có cả xe thuê lẫn xe cá nhân — kiểm tra cả vehicle slot lock và BYOC capacity.

---

## Requirements *(mandatory)*

### Functional Requirements

**Booking Creation**

- **FR-001**: Khách đăng nhập MUST có thể tạo booking tại bất kỳ cafe ACTIVE nào bằng cách chọn: khung giờ, chế độ chơi (RENTAL/BYOC/MIXED), xe thuê (nếu RENTAL/MIXED), số người và thông tin người chơi.
- **FR-002**: Hệ thống MUST kiểm tra tính khả dụng của xe thuê theo khung giờ trước khi cho phép checkout — không cho chọn xe đã được đặt trong cùng slot.
- **FR-003**: Hệ thống MUST kiểm tra sức chứa BYOC của cafe theo khung giờ và từ chối nếu đã đầy.
- **FR-004**: Hệ thống MUST tạm khoá slot trong tối đa 30 phút khi khách bắt đầu checkout để ngăn đặt trùng.
- **FR-005**: Hệ thống MUST tính toán và hiển thị breakdown chi tiết tổng tiền trước khi khách xác nhận thanh toán: slot fee, rental fee (nếu có), security deposit (nếu có), F&B pre-order (nếu có), discount (nếu có), tổng cộng.
- **FR-006**: Hệ thống MUST cho phép khách thêm F&B pre-order (tuỳ chọn) vào booking trước khi thanh toán.
- **FR-007**: Giá phí (slot fee, rental fee, security deposit) MUST được snapshot vào booking tại thời điểm tạo và không thay đổi dù cafe sau đó điều chỉnh giá.

**Payment**

- **FR-008**: Hệ thống MUST tạo link thanh toán và chuyển hướng khách đến cổng thanh toán.
- **FR-009**: Hệ thống MUST xác nhận kết quả thanh toán qua cả hai kênh: redirect sau thanh toán (return URL) và thông báo máy chủ tức thời (IPN). Booking chỉ CONFIRMED khi thanh toán được xác nhận hợp lệ.
- **FR-010**: Hệ thống MUST xử lý idempotent cho IPN — không xử lý lại booking đã CONFIRMED.
- **FR-011**: Nếu không nhận được xác nhận thanh toán trong 30 phút, booking MUST tự động bị huỷ.
- **FR-012**: Sau khi booking CONFIRMED, hệ thống MUST cập nhật trạng thái các payment component: slot fee và rental fee chuyển sang HELD, security deposit chuyển sang HELD.

**Booking Cancellation**

- **FR-013**: Khách MUST có thể huỷ booking CONFIRMED của mình.
- **FR-014**: Hệ thống MUST áp dụng chính sách hoàn tiền theo 3 mốc thời gian: >24h (100%), 12–24h (50% slot fee + 100% rest), <12h (0% slot fee + 100% rest).
- **FR-015**: Provider MUST có thể huỷ booking của cafe mình — luôn hoàn 100% cho khách.

**Visibility**

- **FR-016**: Provider MUST có thể xem danh sách booking của từng cafe, lọc theo ngày.
- **FR-017**: Staff MUST có thể xem danh sách booking của cafe mình theo ngày.
- **FR-018**: Khách MUST có thể xem lịch sử booking của mình và chi tiết từng booking.

### Key Entities

- **Booking**: Đơn đặt lịch — lưu thông tin ai đặt, cafe nào, khung giờ, chế độ chơi, trạng thái, snapshot giá tại thời điểm đặt.
- **BookingParticipant**: Người chơi *dự kiến* — có thể là user đã có tài khoản, tài khoản khách đã đăng ký, hoặc người đi cùng vãng lai (WALK_IN_GUEST). Người đặt chính (`is_primary_responsible = true`) chịu trách nhiệm tài chính. Người thay thế thực tế được ghi nhận qua SessionParticipant tại check-in — không sửa BookingParticipant.
- **BookingVehicle**: Xe thuê dự kiến trong booking — lưu snapshot giá/deposit tại thời điểm đặt.
- **PaymentComponent**: Từng khoản phí riêng biệt trong booking (slot fee, rental fee, security deposit, F&B...) — bất biến sau khi tạo, chỉ thay đổi trạng thái.
- **PaymentTransaction**: Log giao dịch với cổng thanh toán — lưu request/response thô để đối soát.
- **FnbOrder / FnbOrderItem**: Đơn F&B pre-order gắn với booking.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Khách hoàn tất toàn bộ quy trình đặt lịch và thanh toán trong dưới 5 phút từ lúc chọn cafe đến lúc nhận xác nhận booking.
- **SC-002**: Tỷ lệ booking bị lỗi do conflict slot (đặt trùng) xuống dưới 0.1% trong điều kiện bình thường.
- **SC-003**: Hệ thống xử lý đồng thời ít nhất 50 phiên checkout song song mà không có booking bị đặt trùng.
- **SC-004**: Kết quả thanh toán được phản ánh vào trạng thái booking trong vòng 10 giây sau khi khách hoàn tất ở cổng thanh toán.
- **SC-005**: Booking quá hạn 30 phút không thanh toán được tự động huỷ trong vòng 1 phút sau khi hết hạn.
- **SC-006**: 100% các booking CONFIRMED hiển thị đúng breakdown chi tiết tiền (slot fee, rental fee, deposit, F&B) khớp với số tiền thực tế đã thu.
- **SC-007**: Tỷ lệ hoàn tiền đúng theo policy đạt 100% — không có trường hợp hoàn sai mốc thời gian.

---

## Assumptions

- Khách hàng đã có tài khoản và đăng nhập trước khi đặt lịch (luồng đăng ký tài khoản không trong scope của feature này).
- Cafe đã được duyệt (ACTIVE) và có ít nhất 1 xe trong fleet (với RENTAL) hoặc còn BYOC capacity.
- Cổng thanh toán sandbox đã được cấu hình với credentials hợp lệ — chỉ cần wire vào luồng booking.
- Slot duration của cafe là đơn vị tối thiểu cho booking (ví dụ 1 giờ) — không hỗ trợ booking lẻ phút trong Phase 1.
- Một booking chỉ gắn với một khung giờ liên tục (slot_start → slot_end) — không hỗ trợ đặt nhiều slot rời rạc.
- Session/check-in flow (khi khách đến quán) là Phase 2, không trong scope này.
- Hệ thống gửi thông báo (email/push) sau booking CONFIRMED là nice-to-have, không blocking Phase 1.
- Promotion/mã giảm giá là optional trong Phase 1 — UI có thể hiện field nhập mã nhưng backend validation có thể skip nếu chưa có promotion engine.
- Staff tạo booking thủ công cho walk-in customer (source: STAFF_MANUAL) là Phase 2.
- MIXED mode (vừa thuê xe vừa BYOC) được hỗ trợ về data model nhưng UI Phase 1 chỉ cần hỗ trợ RENTAL và BYOC thuần.

## Clarifications

### Session 2026-06-08

- Q: Phase scope cho cancellation — có làm cancellation refund trong Phase 1 không? → A: Có, làm cả cancellation (US4) vì đây là nghiệp vụ cơ bản khách cần.
- Q: Staff tạo booking thủ công có trong Phase 1 không? → A: Không — để Phase 2, Phase 1 chỉ làm customer tự đặt qua app.
- Q: F&B pre-order refund policy khi huỷ booking là gì? → A: Chưa xác định — deferred, cần quyết định trước khi implement cancellation service.
- Q: Booking participants có thể thay đổi sau khi CONFIRMED không (ví dụ bạn đặt hộ nhưng người khác tới chơi thay)? → A: Không — BookingParticipant bất biến sau CONFIRMED. Người chơi thực tế được ghi nhận qua SessionParticipant tại check-in (Phase 2) — session_participants.booking_participant_id nullable cho phép thêm người hoàn toàn mới không có trong booking gốc (BR-BK-000-H).
