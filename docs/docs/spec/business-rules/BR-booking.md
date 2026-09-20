# BR-Booking — Quy tắc nghiệp vụ: Đặt lịch

**Last updated**: 2026-05-15
**Status**: Active

> **Lưu ý:** Booking giờ chỉ quản lý đơn đặt lịch dự kiến.
> Các quy tắc vận hành (check-in, extension, settlement) chuyển sang session. Xem `02-state-machine.md`.

## 1. Slot system

**BR-BK-000-A** — Fixed slots
Hệ thống generate sẵn các khung giờ theo `cafe.slot_duration_minutes`:
```
slot_duration = 60 phút → slots: 09:00, 10:00, 11:00, ..., 21:00
slot_duration = 90 phút → slots: 09:00, 10:30, 12:00, ..., 19:30
```
Customer chỉ được chọn `slot_start` trùng với boundary đó — không tự nhập giờ tự do.

**BR-BK-000-B** — Multi-slot booking  
Customer chọn giờ bắt đầu + số tiếng (1h / 2h / 3h / 4h):
```
slot_start = 10:00, slot_count = 2 → slot_end = 12:00
```
Hệ thống check tất cả N slots liên tiếp đều available trước khi cho đặt.

**BR-BK-000-C** — Availability check RENTAL  
IF: Customer muốn đặt xe X cho sân T trong khung giờ T  
THEN: Xe X available khi:
1. `vehicle.status = AVAILABLE`
2. Không có `booking_vehicles` nào của xe X thuộc booking `PENDING` hoặc `CONFIRMED` overlap khung giờ T
3. `vehicle.compatible_track_types` rỗng **HOẶC** chứa `booking.track_type` customer chọn

**BR-BK-000-D** — Availability check BYOC  
IF: Customer muốn đặt BYOC trong khung giờ T  
THEN: BYOC available khi:
1. Số BYOC booking trong khung giờ T có `status NOT IN ('CANCELLED')` < `cafe.byoc_capacity`
2. `booking.track_type` phải thuộc `cafe.track_types` (sân đó phải tồn tại tại chi nhánh)  
NOTE: Hệ thống KHÔNG kiểm tra xe của customer có phù hợp sân không — customer tự chịu trách nhiệm

**BR-BK-000-E** — Nhiều khách cùng slot  
Nhiều customer có thể book cùng 1 khung giờ nếu mỗi người đặt xe khác nhau (RENTAL) hoặc còn chỗ BYOC:
```
Slot 10:00–11:00:
  Khách A → xe Traxxas Slash   ✅
  Khách B → xe Arrma Kraton    ✅ (xe khác, không conflict)
  Khách C → BYOC               ✅ (nếu byoc_capacity chưa đầy)
  Khách D → xe Traxxas Slash   ❌ (xe đã bị A đặt)
```

**BR-BK-000-F** — Track type selection
Customer chọn loại sân (`DRIFT` / `CIRCUIT` / `OFFROAD`) trước khi chọn xe:

**BR-BK-000-G** — Multi-vehicle booking (RENTAL)
IF: Customer muốn thuê nhiều xe trong 1 booking (2+ RENTAL vehicles)
THEN: Tất cả xe đều phải available trong cùng khung giờ. Mỗi xe tạo 1 row trong `booking_vehicles`.
NOTE: Mỗi xe có `rental_fee` riêng. Xử lý refund/damage per-vehicle độc lập.
NOTE: `play_mode` chỉ nhận `RENTAL` hoặc `BYOC`. Giá trị `MIXED` còn trong enum DB
      nhưng code không tạo được và chưa booking nào dùng.

**BR-BK-000-H** — Guest participants (không có app)
IF: Customer booking cho người khác không có app
THEN: Tạo `booking_participant` với `participant_type = WALK_IN_GUEST`, điền tên + SĐT.
NOTE: Người đặt chính (`is_primary_responsible = true`) vẫn chịu trách nhiệm tài chính.

**BR-BK-000-I** — MIXED mode booking

> ⛔ **QUY TẮC KHÔNG CÒN HIỆU LỰC.** `bookings.play_mode` chỉ nhận `RENTAL` hoặc
> `BYOC`. Giá trị `MIXED` còn trong enum DB nhưng code không tạo được và chưa
> booking nào dùng. Ngoài ra cột `session_vehicles.customer_vehicle_id` đã bị
> xoá cùng bảng `customer_vehicles`.

Nhóm vừa thuê xe quán vừa mang xe riêng hiện phải tách thành hai booking:
một `RENTAL` và một `BYOC`.

Quy tắc chọn sân vẫn áp dụng cho cả hai chế độ:
- Sân phải thuộc `cafe.track_types`
- RENTAL: hệ thống chỉ hiển thị xe có `compatible_track_types` rỗng hoặc chứa sân đã chọn
- BYOC: hiển thị tất cả sân của cafe, customer tự quyết định

---

## 2. Tạo booking

**BR-BK-001** — Snapshot giá tại thời điểm tạo  
IF: Customer tạo booking  
THEN: System snapshot toàn bộ giá (slot_fee_rate, rental_fee, damage_multiplier, platform_fee_pct) vào `booking.snapshot`  
NOTE: `platform_fee_pct` luôn bằng `0`; `security_deposit_snapshot` còn cột nhưng luôn bằng `0`  
NOTE: Mọi tính toán tiền SAU ĐÓ đều dùng snapshot — không dùng giá hiện tại của Cafe/Vehicle

**BR-BK-002** — Play mode  
IF: Customer chọn xe từ fleet của quán  
THEN: `play_mode = RENTAL`, tạo một hoặc nhiều row trong `booking_vehicles`  
IF: Customer mang xe cá nhân  
THEN: `play_mode = BYOC`; không lưu xe trong `booking_vehicles`, chốt xe thực tế ở `session_vehicles`

**BR-BK-003** — Cafe phải ACTIVE  
IF: Cafe có `status ≠ ACTIVE`  
THEN: Không cho phép tạo booking tại cafe đó

**BR-BK-004** — Không được đặt trùng slot  
IF: Xe đã có booking PENDING hoặc CONFIRMED trong khung giờ đó  
THEN: Từ chối booking mới cho xe đó trong cùng khung giờ

**BR-BK-005** — Booking channels  
Customer có thể tạo booking qua 3 kênh:
- App trực tiếp (Customer tự đặt)
- Shareable link (Provider/Staff tạo link → Customer bấm vào đặt)
- Staff tạo thủ công (walk-in hoặc gọi điện)

---

## 3. Thanh toán & xác nhận

**BR-BK-006** — Slot lock bằng Redis trước khi tạo booking  
IF: Customer xác nhận đặt lịch  
THEN: Hệ thống thực hiện theo thứ tự:
1. SET NX Redis key cho slot (RENTAL) hoặc INCR counter (BYOC) — TTL 1800s
2. Nếu Redis báo slot đang bị giữ → từ chối ngay, KHÔNG tạo booking
3. Nếu Redis thành công → tạo booking (status = PENDING) trong DB

NOTE: Redis key hết TTL → slot tự giải phóng về mặt availability (người khác có thể đặt).  
Cron job cập nhật `booking.status = CANCELLED` và rollback promo sau đó (không cần tức thì).

**BR-BK-006-B** — Window thanh toán  
IF: Booking ở status = PENDING  
THEN: Customer phải hoàn thành thanh toán trước `payment_expires_at` — mặc định 30 phút, đổi được qua biến môi trường `PAYMENT_WINDOW_MINUTES`  
IF: Thanh toán thành công  
THEN: `booking.status = CONFIRMED`, DEL Redis key  
IF: Quá `payment_expires_at` mà chưa thanh toán  
THEN: Redis key hết TTL tự giải phóng slot. Cron cập nhật status = CANCELLED + rollback promo.

**BR-BK-007** — F&B pre-order gộp vào 1 lần thanh toán  
IF: Customer chọn F&B pre-order khi đặt lịch  
THEN: Tổng thanh toán = booking fee + F&B pre-order fee (1 transaction duy nhất)

---

## 4. Huỷ booking

**BR-BK-008** — Customer huỷ trước 24h  
IF: Customer huỷ và thời điểm huỷ > 24h trước `slot_start`  
THEN: Hoàn 100% SLOT_FEE + 100% RENTAL_FEE + 100% F&B pre-order

**BR-BK-009** — Customer huỷ 12–24h trước giờ chơi  
IF: Customer huỷ và thời điểm huỷ trong khoảng 12–24h trước `slot_start`  
THEN: Hoàn 50% SLOT_FEE + 100% RENTAL_FEE + 100% F&B pre-order

**BR-BK-010** — Customer huỷ dưới 12h trước giờ chơi  
IF: Customer huỷ và thời điểm huỷ < 12h trước `slot_start`  
THEN: Hoàn 0% SLOT_FEE + 100% RENTAL_FEE + 100% F&B pre-order

**BR-BK-011** — Provider/Staff huỷ booking  
IF: Provider hoặc Staff huỷ booking (bất kỳ thời điểm nào)  
THEN: Hoàn 100% tất cả components. Platform KHÔNG thu phí

**BR-BK-012** — Huỷ sau khi đã check-in  
IF: Booking đã có session thực tế đang `ACTIVE`, `CHECKING_OUT` hoặc `COMPLETED`  
THEN: Không thể huỷ booking; xử lý bằng check-out, payment settlement và incident policy nếu có sự cố

---

## 5. No-show

**BR-BK-013** — Timeout no-show  
IF: Booking đang CONFIRMED và Staff không check-in trong vòng 30 phút sau `slot_start`  
THEN: Auto-cancel  
- SLOT_FEE: hoàn 0% (phí huỷ muộn)  
- RENTAL_FEE: hoàn 100%  
- F&B pre-order: hoàn 100%

---

## 6. Eligibility

**BR-BK-014** — Eligibility BYOC  
IF: Customer chọn BYOC  
THEN: Không cần điều kiện đặc biệt về trust_score

**BR-BK-015** — Eligibility RENTAL xe STANDARD  
IF: Customer muốn thuê xe STANDARD  
THEN: Cho phép tất cả customer (không phụ thuộc trust_score)

**BR-BK-016** — Eligibility RENTAL xe PREMIUM  
IF: Customer muốn thuê xe PREMIUM  
THEN: Cần đủ điều kiện (điều kiện cụ thể TBD — trust_score hoặc lịch sử booking)

**BR-BK-017** — Eligibility RENTAL xe RESTRICTED  
IF: Customer muốn thuê xe RESTRICTED  
THEN: Hạn chế, cần xét duyệt (trust_score cao, điều kiện cụ thể TBD)
