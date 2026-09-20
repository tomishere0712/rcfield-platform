# Feature Specification: Cafe Track Config

**Feature Branch**: `003-fb-messenger-channel` (current)
**Created**: 2026-06-09
**Status**: Draft

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Provider Configures Track Types for Branch (Priority: P1)

Provider (chủ doanh nghiệp) muốn cấu hình các loại sân tại một chi nhánh: upload ảnh thực tế sân, đặt BYOC capacity riêng cho từng loại sân, và ghi mô tả ngắn.

**Why this priority**: Đây là dữ liệu nền tảng cho toàn bộ flow booking theo track — không có config này thì customer không chọn được sân, availability check không hoạt động đúng.

**Independent Test**: Provider đăng nhập, vào quản lý chi nhánh, thêm loại sân "Drift" với 3 ảnh và BYOC capacity = 4. Sau khi lưu, trang chi tiết chi nhánh hiển thị mục "Các loại sân" với ảnh và thông tin đúng.

**Acceptance Scenarios**:

1. **Given** provider đã đăng nhập và đang ở trang quản lý chi nhánh, **When** provider chọn thêm loại sân từ danh sách track types toàn cục, **Then** hệ thống hiển thị form nhập BYOC capacity, mô tả, và cho phép upload ảnh.
2. **Given** provider điền đầy đủ thông tin (BYOC capacity ≥ 1), **When** provider lưu, **Then** config được lưu trong danh sách quản lý của provider. Config chỉ hiển thị với customer sau khi có ít nhất 1 ảnh được upload.
3. **Given** chi nhánh đã có track config, **When** provider chỉnh sửa BYOC capacity hoặc ảnh, **Then** thay đổi được áp dụng ngay lập tức.
4. **Given** chi nhánh đã có track config, **When** provider xóa một loại sân, **Then** hệ thống cảnh báo nếu còn booking tương lai trên sân đó và yêu cầu xác nhận.
5. **Given** provider upload ảnh sân, **When** file hợp lệ (JPEG/PNG, ≤ 10MB), **Then** ảnh được lưu và hiển thị đúng thứ tự.

---

### User Story 2 - Customer Views Track Types on Branch Page (Priority: P2)

Customer xem trang chi tiết một chi nhánh và thấy phần giới thiệu các loại sân tại đó: ảnh thực tế, tên sân, mô tả, và BYOC capacity.

**Why this priority**: Giúp customer biết sân nào phù hợp trước khi booking, tăng tỉ lệ chuyển đổi.

**Independent Test**: Customer truy cập trang chi nhánh, cuộn xuống mục "Loại sân", thấy danh sách các sân với ảnh và thông tin. Không cần đăng nhập.

**Acceptance Scenarios**:

1. **Given** chi nhánh có 2 loại sân được config, **When** customer vào trang chi nhánh, **Then** phần "Các loại sân" hiển thị đủ 2 sân với ảnh, tên, mô tả, và số chỗ BYOC.
2. **Given** chi nhánh chưa config loại sân nào, **When** customer vào trang, **Then** phần sân không hiển thị hoặc hiển thị thông báo "Chưa có thông tin loại sân".
3. **Given** một sân có nhiều ảnh, **When** customer xem, **Then** ảnh có thể vuốt/click xem từng ảnh.

---

### User Story 3 - Customer Selects Track When Booking (Priority: P1)

Khi customer bắt đầu booking, bước đầu tiên là chọn loại sân. Sau đó chọn BYOC/RENTAL, rồi chọn xe tương thích với sân đó.

**Why this priority**: Thay đổi core booking flow — cần có trước khi các bước tiếp theo hoạt động đúng.

**Independent Test**: Customer chọn sân "Drift" → chọn RENTAL → chỉ thấy xe có `compatible_track_types` bao gồm "Drift" → chọn slot → checkout thành công. Booking lưu đúng `track_type_id`.

**Acceptance Scenarios**:

1. **Given** chi nhánh có 2 loại sân, **When** customer bắt đầu booking, **Then** bước đầu tiên hiển thị danh sách sân kèm ảnh và số chỗ BYOC còn lại cho khung giờ đang chọn.
2. **Given** customer đã chọn sân "Drift", **When** chuyển sang chọn xe (RENTAL), **Then** chỉ hiển thị xe có `compatible_track_types` bao gồm "Drift" — xe không tương thích bị ẩn.
3. **Given** customer chọn BYOC trên sân đã hết chỗ, **When** confirm, **Then** hệ thống báo lỗi "Sân này đã hết chỗ BYOC cho khung giờ đã chọn" và không cho tiến tiếp.
4. **Given** customer đặt lịch từ trang chi nhánh (có preselected slot), **When** vào checkout, **Then** step chọn sân vẫn được hiển thị (không bị skip).

---

### User Story 4 - Multi-Slot Booking (Priority: P2)

Customer có thể chọn nhiều slot liên tiếp (ví dụ 9h, 10h, 11h = booking 3 tiếng) thay vì chỉ 1 slot 1 giờ.

**Why this priority**: Tăng giá trị đặt lịch, giảm phiền phức cho nhóm muốn chơi lâu.

**Independent Test**: Customer chọn 3 slot liên tiếp (9h–12h). Hệ thống kiểm tra capacity cho cả 3 slot trước khi cho phép tiến tiếp. Booking được tạo với `slot_start = 9h`, `slot_end = 12h`.

**Acceptance Scenarios**:

1. **Given** slot grid hiển thị, **When** customer click 1 slot để chọn giờ bắt đầu, **Then** hiện stepper/dropdown số giờ (1–8). Khi chọn số giờ, các slot tương ứng được highlight và hiển thị tổng thời gian (ví dụ "3 tiếng").
2. **Given** customer chọn 3 slot (9h–12h) nhưng slot 10h–11h đã full, **When** hệ thống check availability, **Then** thông báo "Slot 10:00 đã hết chỗ" và không cho tiến tiếp.
3. **Given** customer chọn slot không liên tiếp (9h và 11h bỏ qua 10h), **Then** hệ thống không cho phép và yêu cầu chọn các slot liên tiếp.
4. **Given** booking multi-slot được tạo thành công, **When** availability được check cho bất kỳ slot nào trong range đó, **Then** capacity đó bị trừ đi 1.

---

### Edge Cases

- Provider xóa track type đang có booking active → hệ thống không cho xóa, yêu cầu xử lý booking trước.
- Customer chọn track type nhưng chi nhánh không có xe nào tương thích → hiển thị cảnh báo "Chưa có xe thuê cho loại sân này, chỉ đặt được BYOC".
- Migrate dữ liệu hiện tại: `cafe.byocCapacity` → nếu cafe có `trackTypes[]`, tạo `cafe_track_configs` với `byoc_capacity = cafe.byocCapacity` cho từng track. Nếu không có track, giữ nguyên `byocCapacity` fallback. Sau khi tạo `cafe_track_configs`, backfill `track_config_id` vào tất cả booking active/tương lai theo logic: match `cafe_id + track_type_id` → `cafe_track_configs.id`.
- Extension session (gia hạn giờ chơi) có thể xung đột với booking tiếp theo → **out of scope, xử lý trong Phase 2 session management**.

## Requirements *(mandatory)*

### Functional Requirements

**Provider — Track Config:**
- **FR-001**: Provider MUST be able to add a global track type to their branch with BYOC capacity (integer ≥ 1). Images are uploaded separately after config creation. A config without images is saved but NOT visible to customers until at least one image is uploaded.
- **FR-002**: Provider MUST be able to upload multiple images per track config, with drag-to-reorder support.
- **FR-003**: Provider MUST be able to edit BYOC capacity and images of an existing track config.
- **FR-004**: Provider MUST be able to deactivate a track config; system MUST block deactivation if there are upcoming PENDING/CONFIRMED bookings on that track. Provider MUST also be able to reactivate a previously deactivated config. Provider dashboard shows both active and inactive configs.
- **FR-005**: Provider MUST be able to set an optional short description per track config.

**Customer — Branch Page:**
- **FR-006**: Customer MUST be able to view all active track configs of a branch without logging in.
- **FR-007**: Track display MUST show: track name, description, images (swipeable), and BYOC capacity.

**Booking Flow:**
- **FR-008**: Booking flow MUST present track type selection as the first step before BYOC/RENTAL and vehicle selection.
- **FR-009**: When RENTAL is selected, system MUST only show vehicles whose `compatible_track_types` includes the selected track type.
- **FR-010**: Availability check MUST use per-track `byoc_capacity` (from `cafe_track_configs`) instead of `cafe.byocCapacity`.
- **FR-011**: Availability check MUST use overlap logic: count bookings where `slot_start < requested_end AND slot_end > requested_start` on the same track.
- **FR-012**: System MUST validate at booking creation that selected vehicles are compatible with the booked track type.
- **FR-013**: Customer MUST be able to select multiple consecutive slots (minimum 1, maximum 8) to create a single booking spanning that duration.
- **FR-014**: System MUST check capacity for every slot in a multi-slot range before confirming the booking.

### Key Entities

- **CafeTrackConfig**: Bản ghi cấu hình sân vật lý của 1 chi nhánh. Thuộc tính: `cafe_id`, `track_type_id` (FK → global `track_types`), `byoc_capacity`, `images[]`, `description`, `sort_order`, `is_active`.
- **TrackType** (existing, global): Danh mục loại sân do Admin quản lý. Thuộc tính: `code`, `name`, `description`, `is_active`.
- **Booking** (updated): Thêm FK `track_config_id → cafe_track_configs` (bên cạnh `track_type_id` hiện tại để tương thích ngược).
- **VehicleCatalog** (existing): `compatible_track_types: uuid[]` — không thay đổi, tiếp tục dùng global `track_type_id`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Provider hoàn thành config 1 loại sân (thêm ảnh + set capacity) trong dưới 3 phút.
- **SC-002**: Trang chi tiết chi nhánh hiển thị đầy đủ thông tin các loại sân trong dưới 2 giây.
- **SC-003**: Booking flow với track selection hoàn thành trong dưới 5 phút (từ lúc vào trang đến thanh toán).
- **SC-004**: 100% booking được tạo phải có `track_config_id` hợp lệ — không có booking "orphan" không có sân.
- **SC-005**: Capacity check cho multi-slot booking không cho phép overbooking trên bất kỳ slot nào trong range.
- **SC-006**: Danh sách xe RENTAL hiển thị cho customer chỉ chứa xe tương thích với sân đã chọn — 0 xe không tương thích lọt qua.

## Assumptions

- Global `TrackType` catalog do Admin quản lý và đã có sẵn dữ liệu (Drift, Obstacle, Speed, etc.) trước khi Provider cấu hình.
- Migration dữ liệu: `cafe.byocCapacity` được copy sang `cafe_track_configs.byoc_capacity` cho các chi nhánh đã có `trackTypes[]` configured.
- `cafe.byocCapacity` và `cafe.trackTypes[]` được deprecated nhưng giữ lại trong DB để tương thích ngược trong giai đoạn chuyển đổi.
- Session extension conflict (gia hạn giờ xung đột với booking tiếp theo) là **out of scope** — thuộc Phase 2 session management.
- Multi-slot chỉ cho phép chọn slot **liên tiếp** — không cho phép chọn slot rời rạc trong 1 booking.
- Số slot tối đa trong 1 booking là 8 (8 giờ), dựa trên giờ mở cửa thực tế của cafe (thường 8–10 giờ/ngày).
- Ảnh sân được lưu trên Cloudinary (same as cafe images hiện tại).

## Clarifications

### Session 2026-06-09

- Q: Khi kiểm tra BYOC availability sau migration, các booking cũ (có `track_type_id` khớp nhưng `track_config_id = NULL`) có được tính vào capacity không? → A: Backfill `track_config_id` vào tất cả booking active/tương lai trong data migration (match theo `cafe_id + track_type_id`). Dự án đang trong giai đoạn dev, chưa có production data.
- Q: Ảnh có bắt buộc khi tạo track config không? → A: Không bắt buộc khi tạo. Tạo config và upload ảnh là hai bước riêng. Config chưa có ảnh được lưu nhưng không hiển thị với customer cho đến khi có ít nhất 1 ảnh.
- Q: Sau khi provider deactivate track config, có thể reactivate không? → A: Có — provider thấy cả active và inactive trong dashboard, có thể toggle bật/tắt tự do.
- Q: Customer chọn multi-slot bằng UX pattern nào? → A: Click 1 slot chọn giờ bắt đầu → stepper/dropdown chọn số giờ (1–8). Các slot được highlight tương ứng.
