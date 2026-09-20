# Feature Specification: Customer Package Purchase & Booking Application

**Feature Branch**: `009-customer-package-booking`  
**Created**: 2026-06-11  
**Status**: Draft  

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Browse & Purchase Package (Priority: P1)

Khách hàng vào trang chi nhánh, xem danh sách gói đang bán, chọn 1 gói phù hợp và thanh toán qua cổng thanh toán. Sau khi thanh toán thành công, gói được kích hoạt trong tài khoản khách hàng với số slot và ngày hết hạn tương ứng.

**Why this priority**: Không có bước mua gói thì toàn bộ feature không hoạt động. Đây là prerequisite bắt buộc.

**Independent Test**: Có thể test độc lập bằng cách: đăng nhập customer → vào trang cafe → mua gói → kiểm tra gói xuất hiện trong "Gói của tôi" với đúng số slot và ngày hết hạn.

**Acceptance Scenarios**:

1. **Given** customer đã đăng nhập và xem trang cafe A, **When** customer chọn gói "5 buổi - 1 tháng" và xác nhận thanh toán qua cổng, **Then** gói được tạo trong tài khoản với `slots_remaining = 5`, `expires_at = 30 ngày từ hôm nay`, trạng thái `ACTIVE`.
2. **Given** customer đã chọn gói và được chuyển sang trang thanh toán, **When** thanh toán thất bại hoặc khách huỷ, **Then** không có gói nào được tạo, khách quay lại trang chọn gói.
3. **Given** customer xem danh sách gói của cafe, **When** gói có trạng thái `INACTIVE`, **Then** gói đó không hiển thị cho customer.
4. **Given** customer đã có gói cùng cafe còn hạn, **When** mua thêm gói mới cùng loại, **Then** hệ thống cho phép mua (tích lũy, không ghi đè).

---

### User Story 2 - Apply Package When Booking (Priority: P2)

Khi tạo booking, khách hàng có thể chọn áp dụng một gói đang sở hữu cho chi nhánh đó. Khi dùng gói: slot_fee = 0, vẫn thanh toán rental_fee + security_deposit + FnB nếu có. Nếu tổng tiền còn lại = 0 thì booking được xác nhận ngay mà không cần qua cổng thanh toán.

**Why this priority**: Đây là lý do tồn tại của feature — khách mua gói để tiết kiệm chi phí đặt sân.

**Independent Test**: Có thể test sau khi US1 hoàn thành: dùng gói đã mua để đặt sân → xác nhận slot bị trừ đúng, slot_fee = 0 trong hoá đơn.

**Acceptance Scenarios**:

1. **Given** customer có gói "5 buổi" tại cafe A với `slots_remaining = 5`, **When** đặt sân 2 tiếng (cafe có slot 60 phút), **Then** booking được tạo với slot_fee = 0, `slots_used = 2` ghi vào snapshot, `slots_remaining` giảm xuống 3 sau khi CONFIRMED.
2. **Given** customer chọn gói khi đặt RENTAL (thuê xe), **When** total = rental_fee + deposit > 0, **Then** customer vẫn được redirect đến cổng thanh toán để trả rental_fee + deposit.
3. **Given** customer chọn gói khi đặt BYOC không có FnB, **When** total = 0 (chỉ có slot_fee đã được cover), **Then** booking chuyển sang CONFIRMED ngay, không mở cổng thanh toán.
4. **Given** customer muốn dùng gói nhưng `slots_remaining < slots_needed`, **When** tạo booking, **Then** hệ thống báo lỗi "Không đủ slot trong gói", không cho phép tiếp tục.
5. **Given** customer muốn dùng gói đã hết hạn (`expires_at < now`), **When** tạo booking, **Then** hệ thống báo lỗi "Gói đã hết hạn".
6. **Given** customer không chọn gói, **When** tạo booking, **Then** flow thanh toán hoạt động bình thường như hiện tại (slot_fee được tính đầy đủ).

---

### User Story 3 - View My Packages (Priority: P3)

Khách hàng xem danh sách các gói đã mua: số slot còn lại, ngày hết hạn, lịch sử sử dụng từng gói.

**Why this priority**: UX cần thiết nhưng không block US1 và US2. Khách cần biết còn bao nhiêu slot.

**Independent Test**: Sau khi mua gói (US1) và dùng gói (US2): xem màn hình "Gói của tôi" → thấy đúng `slots_remaining` và lịch sử booking đã dùng gói.

**Acceptance Scenarios**:

1. **Given** customer có 2 gói (1 còn hạn, 1 đã hết hạn), **When** vào "Gói của tôi", **Then** gói còn hạn hiển thị `ACTIVE`, gói hết hạn hiển thị `EXPIRED`.
2. **Given** customer xem chi tiết một gói, **When** gói đó đã được dùng trong 3 booking, **Then** hiển thị lịch sử 3 booking kèm số slot đã dùng mỗi lần.

---

### User Story 4 - Slot Refund on Cancellation (Priority: P4)

Khi booking đã dùng gói bị huỷ, slot được hoàn lại có điều kiện: chỉ hoàn nếu huỷ trước thời điểm check-in (slot_start). Nếu huỷ sau giờ check-in hoặc no-show thì không hoàn slot.

**Why this priority**: Business rule quan trọng nhưng edge case — không block core flow.

**Independent Test**: Tạo booking dùng gói → huỷ trước giờ → kiểm tra slot được hoàn. Tạo booking → để quá giờ → kiểm tra slot không được hoàn.

**Acceptance Scenarios**:

1. **Given** booking CONFIRMED dùng 2 slot, **When** customer huỷ trước `slot_start`, **Then** `slots_remaining` tăng lên 2, booking chuyển CANCELLED.
2. **Given** booking CONFIRMED dùng 2 slot, **When** customer huỷ sau `slot_start` (hoặc booking chuyển NO_SHOW), **Then** slot không được hoàn, `slots_remaining` giữ nguyên.
3. **Given** booking huỷ có hoàn slot, **When** gói đã hết hạn tại thời điểm huỷ, **Then** slot vẫn được hoàn (gói có thể expired nhưng vẫn có slots).

---

### Edge Cases

- Customer mua gói của cafe A, không thể dùng ở cafe B.
- Gói hết slot (`slots_remaining = 0`) phải tự động chuyển trạng thái `EXHAUSTED`.
- Khi payment callback thất bại sau khi đã trừ slot (race condition): cần rollback slot.
- Customer không thể áp dụng 2 gói cho 1 booking (1 booking chỉ dùng tối đa 1 gói).
- Nếu gói hết hạn giữa lúc tạo booking và lúc payment callback về: booking vẫn hợp lệ (validation tại thời điểm tạo booking).

---

## Requirements *(mandatory)*

### Functional Requirements

**Mua gói:**
- **FR-001**: Khách hàng PHẢI được xem danh sách các gói đang `ACTIVE` của một chi nhánh.
- **FR-002**: Khách hàng PHẢI được thanh toán để mua gói qua cổng thanh toán.
- **FR-003**: Hệ thống PHẢI tạo bản ghi sở hữu gói sau khi thanh toán thành công, với số slot và ngày hết hạn chính xác.
- **FR-004**: Mỗi lần mua tạo ra 1 bản ghi gói mới (không cộng dồn vào gói cũ cùng loại).

**Áp dụng gói khi booking:**
- **FR-005**: Khi tạo booking, khách hàng CÓ THỂ chọn một gói đang sở hữu tại cafe đó.
- **FR-006**: Hệ thống PHẢI tính `slots_needed = booking_duration_minutes / cafe.slotDurationMinutes`.
- **FR-007**: Hệ thống PHẢI từ chối nếu `slots_remaining < slots_needed` hoặc gói đã hết hạn.
- **FR-008**: Khi dùng gói, `slot_fee` PHẢI bằng 0 trong tổng tiền thanh toán.
- **FR-009**: Nếu tổng tiền còn lại (rental + deposit + FnB) = 0, booking PHẢI được xác nhận ngay mà không qua cổng thanh toán.
- **FR-010**: Slot PHẢI bị trừ khỏi `slots_remaining` tại thời điểm booking chuyển sang CONFIRMED.
- **FR-011**: Snapshot của booking PHẢI ghi lại thông tin gói đã dùng (`package_id`, `package_name`, `slots_used`).
- **FR-012**: Một booking CHỈ được áp dụng tối đa 1 gói.

**Xem gói:**
- **FR-013**: Khách hàng PHẢI được xem danh sách gói đang sở hữu kèm `slots_remaining` và `expires_at`.
- **FR-014**: Khách hàng PHẢI được xem lịch sử các booking đã sử dụng từng gói.

**Hoàn slot:**
- **FR-015**: Khi booking bị huỷ TRƯỚC `slot_start`, slot PHẢI được hoàn lại vào gói.
- **FR-016**: Khi booking bị huỷ SAU `slot_start` hoặc chuyển NO_SHOW, slot KHÔNG được hoàn.

### Key Entities

- **CustomerPackage**: Gói mà một khách hàng đã mua tại một cafe cụ thể. Thuộc tính: khách hàng, gói gốc (Package), cafe, số slot còn lại, ngày hết hạn, trạng thái (ACTIVE / EXHAUSTED / EXPIRED).
- **Package** *(đã tồn tại)*: Gói được provider tạo ra để bán, định nghĩa số slot, giá, thời hạn.
- **Booking** *(cập nhật)*: Thêm tham chiếu tùy chọn đến `CustomerPackage` được áp dụng.
- **BookingSnapshot** *(cập nhật)*: Thêm trường `package_used` ghi lại thông tin gói tại thời điểm xác nhận.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Khách hàng hoàn tất mua gói (từ chọn gói đến nhận xác nhận) trong vòng 3 phút.
- **SC-002**: Booking sử dụng gói với total = 0 được xác nhận ngay lập tức (không cần chờ cổng thanh toán).
- **SC-003**: Số slot hiển thị trên màn hình "Gói của tôi" luôn khớp với số slot thực tế đã dùng (độ chính xác 100%).
- **SC-004**: Hệ thống không cho phép dùng gói quá số slot còn lại trong bất kỳ trường hợp đồng thời nào (race condition safe).
- **SC-005**: Tỷ lệ hoàn slot thành công khi đủ điều kiện đạt 100% (không có slot bị mất do lỗi hệ thống).

---

## Assumptions

- Gói là cá nhân: 1 gói chỉ thuộc về 1 khách hàng, không chia sẻ được.
- Gói chỉ dùng được tại đúng cafe đã mua, không dùng liên chi nhánh.
- 1 slot trong gói = 1 khung giờ (`slotDurationMinutes`) của cafe — đặt 2 tiếng tốn 2 slots.
- Gói không cover rental_fee, security_deposit, hay FnB — chỉ cover slot_fee.
- Ngày hết hạn tính từ ngày thanh toán thành công (không phải ngày sử dụng đầu tiên).
- Gói EXHAUSTED (hết slot) vẫn hiển thị trong lịch sử, không bị xóa.
- Không giới hạn số gói customer có thể sở hữu cùng lúc tại 1 cafe.
- Thanh toán mua gói dùng cùng cổng VNPay như thanh toán booking.
- Provider có thể tạo/sửa/vô hiệu hóa gói nhưng không thể xóa gói đã có customer mua.
