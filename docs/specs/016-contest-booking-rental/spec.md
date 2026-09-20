# Feature Specification: Contest ↔ Booking Rental Integration

**Feature Branch**: `016-contest-booking-rental`  
**Created**: 2026-07-23  
**Status**: Implemented (docs viết sau khi implement)  
**Input**: Kết nối Contest với Booking: khách thuê xe riêng cho contest với chính sách giá riêng (miễn phí sân, cọc giảm/miễn), đăng ký contest kèm thuê xe một chạm, đồng bộ vận hành check-in xe ↔ check-in đăng ký, và format thi đấu mới QUALIFYING_FINAL (kiểu Grand Prix/F1).

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — WF-A: Thuê xe riêng cho contest, chưa đăng ký (Priority: P1)

Khách muốn thuê xe để chuẩn bị/tập luyện hoặc thi đấu cho một contest cụ thể, nhưng chưa (hoặc không) đăng ký giải ngay lúc đó. Khách chọn nguồn xe "Thuê xe tại quầy" trong form đăng ký contest (hoặc dùng API trực tiếp), chọn xe và khung giờ; hệ thống tạo booking thật với `source = CONTEST`, link `contest_id`, áp chính sách giá của contest (`rental_policy`), validate khung giờ nằm trong cửa sổ cho phép quanh giờ thi. Entry point chính ở FE là trong `ContestRegistrationPanel`, không còn banner trên `CreateBookingPage` để tránh gây nhầm lẫn khi quán không có contest.

**Why this priority**: Đây là nền của mọi liên kết Contest↔Booking — booking contest là booking thật, đi qua core booking/payment engine, không phải flow giả.

**Independent Test**: Gọi `POST /bookings/contest-rental` với contest hợp lệ → booking được tạo với `source=CONTEST`, `contest_id` được gắn, giá phản ánh `rental_policy`; chọn slot nằm ngoài cửa sổ cho phép → nhận lỗi `CONTEST_SLOT_OUTSIDE_WINDOW`; không có registration nào được tạo.

**Acceptance Scenarios**:

1. **Given** contest đang mở và có `config.rental_policy`, **When** khách tạo contest-rental booking với slot nằm trong `slot_window`, **Then** booking được tạo với `source=CONTEST`, `contest_id=<contestId>` và tổng tiền theo chính sách contest.
2. **Given** contest có `slot_window { before_min: 60, after_min: 60 }` (mặc định), **When** khách chọn slot bắt đầu sớm hơn 60 phút trước giờ thi hoặc kết thúc muộn hơn 60 phút sau giờ kết thúc, **Then** hệ thống reject với mã lỗi `CONTEST_SLOT_OUTSIDE_WINDOW`.
3. **Given** contest-rental booking đã tạo, **When** kiểm tra danh sách registration của contest, **Then** không có registration nào được tạo tự động từ booking này.

---

### User Story 2 — WF-B: Đăng ký contest kèm thuê xe một chạm (Priority: P1)

Khách đăng ký contest theo hướng RENTAL và thuê xe ngay trong form đăng ký qua `rental_slot`. FE dẫn khách qua stepper 3 bước: chọn nguồn xe (BYOC / xe đã thuê / thuê mới) → chọn xe & slot → xác nhận và thanh toán gộp. Backend tạo booking PENDING gắn `contest_id` và trả về cùng response đăng ký; provider chỉ duyệt đăng ký khi booking đã thanh toán.

**Why this priority**: Đây là luồng chuyển đổi chính của contest — giảm ma sát đăng ký cho người không có xe (BYOC không bắt buộc).

**Independent Test**: `POST /contests/:id/register` với `rental_slot` → response chứa cả registration và `booking { id, status, payment_expires_at, total_amount }`; thanh toán booking → registration đủ điều kiện được provider duyệt.

**Acceptance Scenarios**:

1. **Given** contest cho phép RENTAL, **When** khách register kèm `rental_slot` hợp lệ, **Then** response trả về registration kèm object `booking { id, status, payment_expires_at, total_amount }` để FE chuyển sang bước thanh toán.
2. **Given** registration vừa tạo kèm booking PENDING, **When** provider reject hoặc khách cancel registration, **Then** booking PENDING bị cancel theo (audit `booking.contest_rental_cancelled`).
3. **Given** registration có booking đã thanh toán, **When** registration bị reject/cancel, **Then** booking được giữ nguyên (không hủy tiền đã thu), ghi audit `booking.contest_rental_retained`.
4. **Given** booking đã CONFIRMED từ WF-B, **When** provider mở danh sách registration, **Then** registration đó đủ điều kiện approve theo rule booking-đã-thanh-toán hiện hữu.

---

### User Story 3 — Đồng bộ vận hành: check-in xe tự check-in đăng ký (Priority: P2)

Ngày thi, staff check-in xe cho booking có `contest_id` như mọi booking thường. Nếu khách có registration CONFIRMED của contest đó, hệ thống tự chuyển registration sang CHECKED_IN — staff không phải check-in hai lần ở hai màn hình. Khi trả xe (checkout), hệ thống ghi audit để truy vết.

**Why this priority**: Đây là điểm giảm thao tác vận hành lớn nhất ngày thi đấu; vẫn giữ được luồng check-in contest thủ công hiện hữu làm đường dự phòng.

**Independent Test**: Tạo booking contest + registration CONFIRMED → staff gọi check-in xe → response có `contest_checkin { registrationId, synced: true, previousStatus: 'CONFIRMED' }`, registration chuyển CHECKED_IN, audit `registration.checked_in` với `metadata.trigger='vehicle_check_in'`.

**Acceptance Scenarios**:

1. **Given** booking có `contest_id` và registration CONFIRMED của cùng contest/khách, **When** staff check-in xe, **Then** registration tự chuyển CHECKED_IN và response check-in chứa `contest_checkin { registrationId, synced: true, previousStatus }`.
2. **Given** booking có `contest_id` nhưng registration không ở trạng thái CONFIRMED (chưa duyệt/đã hủy/không tồn tại), **When** staff check-in xe, **Then** check-in xe vẫn thành công bình thường, `contest_checkin.synced = false`, không có side effect vào contest.
3. **Given** staff check-out trả xe cho booking contest, **When** checkout hoàn tất, **Then** hệ thống ghi audit `booking.vehicle_checked_out` phục vụ truy vết.
4. **Given** staff mở danh sách booking hôm nay, **When** booking có `contest_id`, **Then** FE hiển thị badge Contest và toast thông báo trạng thái đồng bộ check-in sau thao tác.

---

### User Story 4 — Chính sách giá contest (rental_policy) (Priority: P2)

Provider cấu hình cho contest một chính sách thuê xe riêng: miễn phí sân (slot fee), giảm hoặc miễn cọc xe. Hệ thống áp policy này khi tính tiền booking contest, freeze giá thực thu vào snapshot như mọi booking khác — nhờ đó hoàn cọc sau checkout tự động đúng mà không cần code refund riêng.

**Why this priority**: Ưu đãi giá là lý do chính để có flow thuê xe contest riêng thay vì booking thường.

**Independent Test**: Contest có `rental_policy { waive_slot_fee: true, deposit_mode: 'REDUCED', deposit_percent: 50 }` → tạo contest-rental booking → snapshot không có phí sân, cọc = 50% cọc chuẩn; checkout → refund cọc đúng số đã freeze.

**Acceptance Scenarios**:

1. **Given** `rental_policy.waive_slot_fee = true`, **When** tạo booking contest, **Then** snapshot giá không bao gồm phí sân (slot fee = 0).
2. **Given** `deposit_mode = REDUCED` và `deposit_percent = 50`, **When** tính cọc, **Then** cọc = 50% mức cọc chuẩn; `deposit_percent` không khai báo thì mặc định 50.
3. **Given** `deposit_mode = WAIVED`, **When** tính cọc, **Then** cọc = 0; `deposit_mode = FULL` thì cọc như booking thường.
4. **Given** contest không khai báo `rental_policy` trong config, **When** tạo booking contest, **Then** hệ thống dùng default an toàn (`slot_window` 60/60, cọc và phí sân theo chuẩn booking thường).
5. **Given** booking contest đã thanh toán với cọc giảm, **When** checkout không phát sinh hư hỏng, **Then** số tiền cọc hoàn lại khớp với số đã freeze trong snapshot.

---

### User Story 5 — Format QUALIFYING_FINAL (Grand Prix) (Priority: P3)

Provider tổ chức giải theo format hai phase kiểu Grand Prix/F1: vòng QUALIFYING — mỗi VĐV chạy TIME_ATTACK, xếp hạng theo best lap; top N (mặc định 4) vào vòng FINAL — bracket knockout được seed theo thứ hạng qualifying (hạng 1 gặp hạng N, hạng 2 gặp hạng N-1, ...). Leaderboard giải dùng KNOCKOUT_WINS.

**Why this priority**: Format mở rộng, không chặn các flow rental/check-in ở trên; phục vụ giải đấu lớn cần vòng loại công bằng.

**Independent Test**: Contest dùng template `grand_prix_qualifying_final` → generate matches phase QUALIFYING → nhập kết quả best lap → `POST /contests/:id/matches/generate-final-bracket` → bracket FINAL có đúng top N, seed 1vN, 2vN-1; FE hiển thị 2 phase tách biệt.

**Acceptance Scenarios**:

1. **Given** contest `runtime_format = QUALIFYING_FINAL`, **When** generate matches phase QUALIFYING, **Then** mỗi VĐV CHECKED_IN có một match TIME_ATTACK riêng, xếp hạng theo `best_lap_ms`.
2. **Given** tất cả match QUALIFYING đã completed, **When** provider gọi `POST /contests/:contestId/matches/generate-final-bracket`, **Then** top N theo `config.finalists` (default 4) được đưa vào bracket FINAL knockout với seeding 1vN, 2vN-1, ...
3. **Given** bracket FINAL đã sinh, **When** provider xem leaderboard, **Then** leaderboard mode là `KNOCKOUT_WINS`.
4. **Given** FE provider/staff mở màn hình runtime, **When** contest là QUALIFYING_FINAL, **Then** bracket views tách rõ 2 phase Qualifying và Final; form tạo contest có input `finalists`.

---

### Edge Cases

- Contest bị hủy sau khi đã có booking contest: `bookings.contest_id` dùng FK `ON DELETE SET NULL` nên xóa contest không mất booking; huỷ contest theo lifecycle hiện hữu xử lý registrations, booking đã thanh toán do khách tự quản (giữ nguyên như booking thường).
- Dữ liệu booking contest tồn tại trước migration: migration `1784500000000-ContestBookingLink` backfill `contest_id` từ `snapshot.contest_id` nên booking cũ vẫn được nhận diện là booking contest.
- Registration CONFIRMED nhưng khách tự check-in contest thủ công trước khi nhận xe: khi staff check-in xe sau đó, registration đã CHECKED_IN → `contest_checkin.synced = false`, không lỗi, không ghi đè.
- `rental_slot` nằm ngoài `slot_window` trong WF-B: reject bằng `CONTEST_SLOT_OUTSIDE_WINDOW` giống WF-A.
- Booking contest PENDING hết hạn thanh toán (`payment_expires_at`): xử lý theo core booking expiry hiện hữu; registration vẫn chờ, không được duyệt cho tới khi có booking CONFIRMED.
- Số VĐV CHECKED_IN ít hơn `config.finalists`: bracket FINAL chỉ gồm các VĐV đủ điều kiện thực tế (không bù slot ảo).
- Kết quả QUALIFYING hòa best lap: thứ hạng/seed quyết định bởi tie-break của runtime ranking hiện hữu; không có rule mới.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Hệ thống PHẢI có `BookingSource.CONTEST` và cột `bookings.contest_id` (FK → contests, `ON DELETE SET NULL`), kèm migration backfill từ `snapshot.contest_id`.
- **FR-002**: Hệ thống PHẢI đọc chính sách thuê xe contest từ `contest.config.rental_policy` với shape `{ waive_slot_fee, deposit_mode: FULL|REDUCED|WAIVED, deposit_percent (default 50), slot_window: { before_min, after_min } (default 60/60) }`, có default an toàn khi thiếu config.
- **FR-003**: Mọi booking contest PHẢI được tạo và tính tiền qua core booking/payment engine hiện hữu — giá thực thu freeze vào snapshot, không có flow thanh toán/refund riêng cho contest.
- **FR-004**: `POST /bookings/contest-rental` (WF-A) PHẢI validate slot nằm trong `slot_window` quanh race window của contest; vi phạm trả lỗi `CONTEST_SLOT_OUTSIDE_WINDOW`; endpoint KHÔNG được tạo registration.
- **FR-005**: `POST /contests/:contestId/register` kèm `rental_slot` (WF-B) PHẢI trả thêm `booking { id, status, payment_expires_at, total_amount }` trong response.
- **FR-006**: Khi registration bị reject/cancel, booking contest kèm theo PHẢI được xử lý: PENDING → cancel (audit `booking.contest_rental_cancelled`); đã thanh toán → giữ nguyên (audit `booking.contest_rental_retained`).
- **FR-007**: Staff check-in xe cho booking có `contest_id` PHẢI tự đồng bộ registration CONFIRMED (cùng contest, cùng khách) sang CHECKED_IN, ghi audit `registration.checked_in` với `metadata.trigger='vehicle_check_in'`, và response PHẢI chứa `contest_checkin { registrationId, synced, previousStatus }`; check-in xe KHÔNG được fail khi không có registration hợp lệ.
- **FR-008**: Checkout trả xe của booking contest PHẢI ghi audit `booking.vehicle_checked_out`.
- **FR-009**: Hệ thống PHẢI có `GET /contests/:contestId/bookings` cho provider/staff xem các booking liên kết contest.
- **FR-010**: Hệ thống PHẢI hỗ trợ `runtime_format = QUALIFYING_FINAL`: phase QUALIFYING (TIME_ATTACK mỗi VĐV, xếp theo best lap) → phase FINAL knockout cho top N (`config.finalists`, default 4) với seeding 1vN, 2vN-1, ...; leaderboard dùng `KNOCKOUT_WINS`; route `POST /contests/:contestId/matches/generate-final-bracket`; kèm contest type GRAND_PRIX + template `grand_prix_qualifying_final` (seed migration).
- **FR-011**: FE PHẢI có stepper đăng ký 3 bước (nguồn xe → xe/slot → xác nhận thanh toán gộp) trong `ContestRegistrationPanel`, dùng `contest-booking.api.ts` + hooks use-contest-booking. Thuê xe cho contest KHÔNG còn xuất hiện như banner trên `CreateBookingPage` để tránh lộn xộn luồng đặt lịch thường.
- **FR-012**: FE staff PHẢI hiển thị badge Contest cho booking có `contest_id` và toast trạng thái đồng bộ check-in; FE provider PHẢI có input `finalists` và bracket views tách 2 phase Qualifying/Final.

### Key Entities

- **Booking (contest-linked)**: booking thật với `source = CONTEST` và `contest_id`; đi qua toàn bộ lifecycle booking/payment/session hiện hữu.
- **ContestRentalPolicy** (`contest.config.rental_policy`): cấu hình giá/cọc/cửa sổ slot của contest — đọc bởi ContestBookingBridge.
- **ContestRegistration**: với WF-B, link tới booking contest qua rental_slot; được auto CHECKED_IN khi nhận xe.
- **QUALIFYING_FINAL runtime**: hai phase matches — QUALIFYING (TIME_ATTACK, best lap) và FINAL (knockout seeded); contest type GRAND_PRIX + template `grand_prix_qualifying_final`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% booking contest được tạo qua core booking engine (có snapshot giá freeze, thanh toán VNPay/mock chung, expiry chung) — không có payment path riêng.
- **SC-002**: Staff check-in xe cho VĐV có registration CONFIRMED hoàn tất cả hai check-in (xe + contest) trong một thao tác; không có thao tác check-in contest thủ công thứ hai bắt buộc.
- **SC-003**: Slot nằm ngoài `slot_window` bị reject 100% với mã lỗi `CONTEST_SLOT_OUTSIDE_WINDOW` (không tạo booking mồi).
- **SC-004**: Refund cọc sau checkout của booking contest khớp 100% với số cọc đã freeze trong snapshot, cho cả 3 chế độ FULL/REDUCED/WAIVED.
- **SC-005**: Bracket FINAL của QUALIFYING_FINAL luôn có đúng min(N, số VĐV đủ điều kiện) người chơi và seeding đối xứng 1vN, 2vN-1.

## Assumptions

- `rental_policy` là opt-in per contest trong `config`; contest không khai báo thì booking contest tính giá như booking thường (chỉ khác `source`/`contest_id`).
- WF-A và WF-B tạo cùng một loại booking contest; khác nhau duy nhất ở điểm vào (CreateBookingPage vs form đăng ký contest) và việc WF-B link registration.
- Một khách có thể có booking contest (WF-A) rồi sau đó đăng ký bằng chính booking đó qua đường "booking đã có" của registration flow hiện hữu.
- Auto check-in registration chỉ một chiều (xe → registration); check-in contest thủ công không tự check-in xe.
- Docs này viết sau khi implement; mọi FR ở trên phản ánh backend/frontend hiện có tại 2026-07-23, không phải gap.
