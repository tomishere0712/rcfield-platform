# Contest Module Specification

**Last Updated:** 2026-08-05  
**Status:** Backend-current truth + requested operating flow  
**Related docs:** `docs/spec/business-rules/BR-contest.md`, `docs/architecture/03-contest.md`, `docs/developer/contest-delivery/05-contest-current-backend-vs-requested-flow.md`, `docs/spec/05-api-contracts.md`, `docs/spec/06-database.md`, `docs/spec/09-universal-racing-network.md`, `specs/016-contest-booking-rental/`

---

## 1. Intent

Contest là module tổ chức giải đua ở phạm vi Provider. Provider tạo giải cho một hoặc nhiều cafe của mình, Customer đăng ký, Staff/Provider check-in và vận hành ngày thi đấu, sau đó Provider publish leaderboard local của giải.

Tài liệu này làm rõ **backend hiện có gì** và **những điểm sản phẩm muốn nhưng backend chưa đủ**. FE không được hiểu các gap như tính năng đã hoàn thành.

```text
CONTEST = event/tournament operations
BOOKING = lịch chơi/thuê xe thông thường
SESSION = ca chơi thực tế, inspection, checkout
```

---

## 2. Backend Current vs Requested

| Chủ đề | Backend hiện có | Còn thiếu / cần làm rõ |
|---|---|---|
| Thời gian contest | Có `registration_opens_at`, `registration_closes_at`, `starts_at`, `ends_at`; create validate đăng ký đóng trước hoặc bằng giờ bắt đầu | Cron tự chuyển `OPEN -> CLOSED` và `CLOSED -> RUNNING` (khi đã có match và đến giờ `starts_at`) đã có; vẫn cần monitor job |
| Cafe tham gia | Có `contest_cafes`, `participating_cafe_ids`, chỉ cho cafe ACTIVE thuộc Provider | Update participating_cafe_ids khi đã có registration cần merge metadata thay vì xóa |
| Track type | Có `track_type_id`; registration rental phải có booking cùng track type; create/update yêu cầu **mọi** chi nhánh tham gia đều có sân active đúng loại (xem BR-CT-021) | FE cần hiển thị rõ host/participating branches |
| Runtime format | `getRuntimeFormatFromCatalog` map đủ 3 mã: `TIME_TRIAL`, `QUALIFYING_FINAL`, còn lại `KNOCKOUT` | Trước 2026-08-01 hàm này ép mọi mã không phải TIME_TRIAL về KNOCKOUT, khiến `QualifyingFinalEngine` và `generate-final-bracket` không có đường nào chạm tới |
| Contest↔Booking rental | Có `BookingSource.CONTEST` + `bookings.contest_id` (FK SET NULL); ContestBookingBridge áp `config.rental_policy` (miễn phí sân, cọc FULL/REDUCED/WAIVED, slot_window); WF-A `POST /bookings/contest-rental`; WF-B register kèm `rental_slot`; check-in xe tự sync registration CHECKED_IN; `GET /contests/:id/bookings` | Không còn gap ở backend core; FE theo spec 016 |
| Khóa sân/cafe | Có `config.resource_locks`, `FULL_BRANCH`, `SELECTED_TRACKS`; backend chặn booking trùng contest | FE cần phản ánh đây là current feature, không phải backlog |
| Entry fee | Có `entry_fee`, `entry_fee_amount`, `payment_status`; Provider mark paid/waive thủ công; `CONTEST_ENTRY` payment subject; chặn duplicate payment URL; ghi audit khi tạo link thanh toán và khi thanh toán thất bại; tạo REFUND PENDING khi contest bị hủy; Provider/Admin có endpoint xác nhận hoàn tiền | Chưa nối VNPay IPN tự động xác nhận; refund tiền thật do payment flow xử lý (hoặc xác nhận thủ công) |
| Revenue dashboard | Metrics có registration/match/leaderboard/global sync + revenue summary | Gross/paid/pending/waived/conversion đã có ở metrics |
| Prize | Có thể lưu trong `contests.config.prizes` để hiển thị | Chưa có reward claim, payout, tự phát voucher/package |
| Runtime format | Có `KNOCKOUT`, `TIME_TRIAL` và `QUALIFYING_FINAL` qua `runtime_format`; dùng `contest_matches` | Multi-driver heat nâng cao chưa phải UI/runtime chính |
| Leaderboard | Có publish local leaderboard vào `contests.config.published_leaderboard`; contest -> `COMPLETED`; áp privacy mask theo `racing_profile.public_profile_enabled` / `leaderboard_opt_in` cho public view | Global leaderboard đọc `race_records` sau sync; sync audit ghi cả id từng race record |
| Audit | Có `contest_audit_logs`, Provider đọc `/audit-logs` với pagination; `buildContestAuditSummary` trả về câu tiếng Việt đọc được | FE đã có tab Audit; chưa có incident/ban riêng cho contest (ban đã có) |
| Ban/phá giải | Có `contest_bans` với scope `CONTEST`/`PROVIDER`, evidence, expires, lift | Chưa có contest-specific incident table; chưa có rule tự động chặn đăng ký lại |
| Phí tổ chức giải | Có `contest_fee_plans` + `contest_fee_orders`; `DRAFT -> OPEN` chặn bằng `assertContestFeePaid` (402 `CONTEST_FEE_REQUIRED`); admin đối soát chuyển khoản; duyệt nội dung quảng bá tách riêng (xem mục 7) | Chưa nối payment gateway — vẫn chuyển khoản + đối soát tay; chưa có refund phí khi giải huỷ sau khi đã trả |
| Thể thức đã phát hành | `contest_formats.is_released` tách "còn trong catalog" khỏi "dùng được"; create contest chặn thể thức chưa mở bằng `CONTEST_FORMAT_NOT_RELEASED` | Từ 2026-08-05 cả ba thể thức đều mở; cột giữ lại cho thể thức thêm về sau |
| Lượt chạy tính giờ | `config.runs_per_driver` (1–5, mặc định 3) cho `TIME_TRIAL` và pha vòng loại của `QUALIFYING_FINAL`; mỗi lượt một match, `round_no` = số thứ tự lượt; xếp hạng lấy lap nhanh nhất (BR-CT-027) | Chưa cho thêm lượt sau khi đã bắt đầu thi đấu — số lượt chốt lúc bốc thăm |
| Người thắng ở lượt solo | `TIME_ATTACK` tôn trọng `winners_to_advance = 0`; trận đối kháng vẫn luôn chốt một người thắng (BR-CT-028) | — |
| Chọn người vào chung kết | Gộp nhiều lượt về một dòng, loại người không có thành tích hợp lệ; nhánh chung kết bắt đầu sau vòng loại cuối; dựng lại được khi chưa ai đấu (BR-CT-029, BR-CT-029a) | — |

---

## 3. Create Contest Flow

Provider tạo contest bằng `POST /api/v1/contests`. Payload chính:

- `name`, `description`, `banner_image_url`
- `contest_type_id`, `contest_format_id`, `contest_template_id`
- `track_type_id`
- `participating_cafe_ids`
- `registration_opens_at`, `registration_closes_at`
- `starts_at`, `ends_at`
- `capacity`
- `entry_fee`
- `vehicle_rule`
- `config`

Validation hiện có:

- `ends_at > starts_at`
- `registration_opens_at < registration_closes_at`
- `registration_closes_at <= starts_at`
- cafe tham gia phải ACTIVE và thuộc Provider
- `track_type_id` phải active và **mọi** chi nhánh tham gia đều phải có ít nhất một track config active thuộc loại đó. FE chỉ hiển thị giao (intersection) các loại đường đua của những chi nhánh đã chọn; khi giao rỗng, FE liệt kê đích danh chi nhánh nào đang thiếu loại nào.
- contest type/format/template phải active và khớp nhau
- không được tạo contest nếu resource lock trùng booking đang `PENDING` hoặc `CONFIRMED`

State chính:

```text
DRAFT -> OPEN -> CLOSED -> RUNNING -> COMPLETED
   \       \        \          \
    \       \        \          -> CANCELLED
     \       \        -> CANCELLED
      \       -> CANCELLED
       -> CANCELLED
```

Backend hiện cho Provider chuyển:

- `DRAFT -> OPEN`
- `OPEN -> CLOSED` (thủ công hoặc tự động qua cron khi hết registration window)
- `DRAFT/OPEN/CLOSED/RUNNING -> CANCELLED` (kích hoạt cleanup registrations + matches + refund flags)
- `RUNNING/COMPLETED` xảy ra qua runtime/result/publish flow

---

## 4. Resource Lock: Khóa Sân Hoặc Khóa Cafe

Contest không dùng luồng đóng/mở cửa cafe. Contest dùng `config.resource_locks` để giữ tài nguyên thi đấu trong thời gian `starts_at -> ends_at`.

Shape khuyến nghị:

```json
{
  "resource_locks": [
    {
      "cafe_id": "uuid",
      "scope": "FULL_BRANCH",
      "track_config_ids": []
    },
    {
      "cafe_id": "uuid",
      "scope": "SELECTED_TRACKS",
      "track_config_ids": ["uuid-track-config-1"]
    }
  ]
}
```

Ý nghĩa:

- `FULL_BRANCH`: khóa cả cafe trong thời gian contest, booking thường không được tạo ở cafe đó.
- `SELECTED_TRACKS`: chỉ khóa các track config được chọn. Nếu booking không có `track_config_id`, backend fallback so với `track_type_id`.

Backend hiện có:

- `resolveContestResourceLocks`: tự resolve lock theo cafe và track config active.
- `assertNoContestBookingConflicts`: chặn tạo/update contest nếu đã có booking trùng.
- `assertBookingNotBlockedByContest`: chặn customer booking nếu slot bị contest giữ.
- Cafe availability trả unavailable khi khung giờ bị contest lock.

FE Provider cần:

1. Khi chọn cafe, load danh sách track configs active của cafe đó.
2. Cho Provider chọn khóa cả cafe hoặc chọn từng sân.
3. Hiển thị cảnh báo nếu khóa cả cafe sẽ làm mất booking thường trong thời gian contest.
4. Gửi `resource_locks` trong `config`.

---

## 5. Public Registration Flow

Customer chỉ đăng ký được khi:

- contest `OPEN`
- thời điểm hiện tại nằm trong registration window
- capacity chưa đầy
- user chưa có registration active trong contest
- phải khớp `vehicle_rule.vehicle_policy` (`RENTAL_ONLY`, `BYOC_ONLY`, `MIXED`)
- với `RENTAL`, khách chọn khung giờ thuê ngay trong form đăng ký qua `rental_slot`; backend tạo booking `PENDING` và gộp phí thuê xe + lệ phí giải (nếu có) thành **một giao dịch VNPay duy nhất**.
- với `BYOC`, khai báo tên xe/hãng/class, chờ Provider duyệt; khách có thể sửa khai báo khi registration còn `PENDING`.

Endpoint:

```text
POST /api/v1/contests/:contestId/register
```

Payload RENTAL:

```json
{
  "vehicle_source": "RENTAL",
  "rental_slot": {
    "cafe_id": "uuid",
    "slot_start": "2026-07-20T09:00:00.000Z",
    "slot_end": "2026-07-20T10:00:00.000Z",
    "track_config_id": "uuid | null",
    "vehicle_catalog_id": "uuid | null"
  }
}
```

Backend trả về thêm `booking { id, status, payment_expires_at, total_amount }`. Nếu contest có lệ phí, tổng tiền thanh toán đã gộp cả lệ phí; thành phần `CONTEST_ENTRY_FEE` được giữ `HELD` trong booking snapshot cho tới khi giao dịch thành công.

Payload BYOC:

```json
{
  "vehicle_source": "BYOC",
  "byoc_vehicle_name": "Yokomo MD 2.0",
  "byoc_vehicle_brand": "Yokomo",
  "byoc_vehicle_class": "Drift",
  "byoc_vehicle_notes": "Front motor conversion"
}
```

Khách có thể sửa khai báo BYOC khi registration còn `PENDING`:

```text
PATCH /api/v1/contest-registrations/:registrationId/byoc-declaration
```

Chỉ chủ registration (customer) được gọi; sửa xong ghi audit `registration.byoc_declaration_updated`.

### Contest↔Booking Integration (đã implement 2026-07-23)

Booking thuê xe cho contest là **booking thật**, không phải booking giả:

- `BookingSource.CONTEST` + cột `bookings.contest_id` (FK → contests, `ON DELETE SET NULL`; migration `1784500000000-ContestBookingLink` backfill từ `snapshot.contest_id`).
- Booking contest đi qua core booking/payment/session engine như booking thường: snapshot freeze giá thực thu, VNPay flow chung, expiry chung, checkout/refund chung. **Không có payment path riêng cho contest.**

**Chính sách giá contest — `contest.config.rental_policy`** (ContestBookingBridge trong `contest-rental.service.ts`):

```json
{
  "waive_slot_fee": true,
  "deposit_mode": "FULL | REDUCED | WAIVED",
  "deposit_percent": 50,
  "slot_window": { "before_min": 60, "after_min": 60 }
}
```

- `waive_slot_fee`: miễn phí sân cho booking contest.
- `deposit_mode`: `FULL` (cọc chuẩn), `REDUCED` (cọc = `deposit_percent`%, default 50), `WAIVED` (cọc 0).
- `slot_window`: slot thuê phải nằm trong `starts_at - before_min` → `ends_at + after_min` (default 60/60); vi phạm → lỗi `CONTEST_SLOT_OUTSIDE_WINDOW`.
- Policy chỉ áp lúc pricing; giá thực thu freeze vào snapshot → refund cọc sau checkout tự đúng cho cả 3 chế độ.

**Luồng đăng ký kèm thuê xe (RENTAL):**

- Register với `rental_slot` (payload ở trên) tạo booking `PENDING` ngay trong cùng request.
- Nếu contest có lệ phí, backend thêm thành phần `CONTEST_ENTRY_FEE` vào booking snapshot; khách thanh toán **phí thuê xe + lệ phí giải trong một giao dịch VNPay**.
- FE chỉ cần một màn hình đăng ký duy nhất: chọn nguồn xe (thuê/BYOC), điền thông tin, xác nhận tổng tiền, thanh toán. Không còn stepper 3 bước riêng biệt.
- Provider chỉ approve registration khi booking đã `CONFIRMED`.
- Nếu khách không thanh toán booking đúng hạn, backend tự hủy booking PENDING và cascade hủy registration liên kết (zombie cleanup).

**Cleanup booking khi reject/cancel registration:**

- Booking còn `PENDING` → bị cancel, audit `booking.contest_rental_cancelled`.
- Booking đã thanh toán → giữ nguyên (không hủy tiền đã thu), audit `booking.contest_rental_retained`.

**Đồng bộ vận hành ngày thi:**

- Staff check-in xe cho booking có `contest_id`: nếu customer có registration `CONFIRMED` cùng contest → tự chuyển `CHECKED_IN`, audit `registration.checked_in` với `metadata.trigger='vehicle_check_in'`; response check-in có `contest_checkin { registrationId, synced, previousStatus }`. Fail-open: không có registration hợp lệ thì check-in xe vẫn thành công (`synced=false`). Đồng bộ chỉ một chiều (xe → registration).
- Checkout trả xe booking contest ghi audit `booking.vehicle_checked_out`.
- Provider/Staff xem booking của giải: `GET /api/v1/contests/:contestId/bookings`.
- FE staff: badge Contest trên booking có `contest_id` + toast trạng thái đồng bộ check-in.

Public FE cần hiển thị:

- tên giải, banner, mô tả, luật
- registration open/close
- race start/end
- cafe tham gia
- track type
- capacity và số đăng ký hiện tại
- entry fee
- prize/rules từ config
- trạng thái đăng ký của chính customer nếu đã đăng nhập
- leaderboard nếu đã publish

---

## 6. Entry Fee, VNPay Và Revenue

Backend hiện có dữ liệu phí:

- `contests.entry_fee`
- `contest_registrations.entry_fee_amount`
- `contest_registrations.payment_status`

Payment statuses:

```text
NOT_REQUIRED
PENDING_PAYMENT
PENDING_REVIEW
WAIVED
MARKED_PAID
```

Endpoint thủ công hiện có:

```text
POST /api/v1/contest-registrations/:registrationId/mark-entry-fee-paid
POST /api/v1/contest-registrations/:registrationId/waive-entry-fee
```

Hiện backend **đã có VNPay contest payment** qua `POST /api/v1/contest-registrations/:registrationId/create-entry-fee-payment`. Hệ thống tạo payment transaction với subject `CONTEST_ENTRY`, link `contest_registration_id`. VNPay return/IPN cập nhật `payment_status`.

Khi dùng `rental_slot` để thuê xe ngay trong đăng ký:

- Booking thuê xe được tạo ở trạng thái `PENDING`.
- Nếu contest có lệ phí, backend gộp lệ phí vào snapshot booking dưới dạng thành phần `CONTEST_ENTRY_FEE` với status `HELD`.
- Khách thanh toán **một giao dịch VNPay duy nhất** bao gồm tiền thuê xe (slot/cọc) + lệ phí giải.
- Khi booking thanh toán thành công, registration tự chuyển `paymentStatus` sang `MARKED_PAID` (nếu chưa waived).
- Provider chỉ duyệt đăng ký khi booking đã `CONFIRMED`.

Khi dùng `BYOC`, khách dùng `create-entry-fee-payment` để thanh toán lệ phí riêng; hoặc Provider có thể mark paid/waive thủ công.

- audit `registration.entry_fee_payment_initiated` khi tạo link thanh toán.
- audit `registration.entry_fee_payment_failed` khi thanh toán thất bại.
- audit `registration.entry_fee_paid` khi thanh toán thành công.
- refund policy khi contest bị cancel (tạo `PaymentTransaction` REFUND PENDING, Provider/Admin confirm thủ công qua `POST /contest-registrations/:registrationId/refunds/:refundTxnId/confirm`).

---

## 7. Phí Tổ Chức Giải (Provider → Nền Tảng)

Khoản này đi **ngược chiều** với lệ phí ở mục 6: mục 6 là tiền VĐV trả cho Provider, mục này là tiền Provider trả cho RCField để được mở giải. Hai dòng tiền không dính nhau — nền tảng **không** ăn phần trăm trên lệ phí VĐV.

Phí tính theo **từng giải**, tách hẳn khỏi gói SaaS hằng tháng. Provider đang có gói đăng ký hợp lệ vẫn phải mua gói tổ chức cho mỗi giải.

### Bảng gói — `contest_fee_plans`

| Cột | Ý nghĩa |
|---|---|
| `code`, `name`, `description` | Định danh và mô tả gói |
| `price` | Giá tại thời điểm hiện tại |
| `featured_days` | Số ngày được hiển thị ở popup trang khám phá; `0` = không kèm quảng bá |
| `is_active`, `display_order` | Ẩn/hiện và thứ tự bày ra cho provider |

Seed hiện tại: `BASIC` 200.000đ / `featured_days = 0`, `FEATURED` 500.000đ / `featured_days = 7`.

### Vòng đời đơn — `contest_fee_orders`

```text
PENDING_PAYMENT ──(provider khai báo chuyển khoản)──> PENDING_REVIEW
                                                          │
                                     admin đối soát ──────┼──> PAID
                                                          └──> REJECTED
       └──(provider huỷ khi chưa khai báo)──> CANCELLED
```

- `PENDING_PAYMENT`, `PENDING_REVIEW`, `PAID` là các trạng thái **còn hiệu lực**: một giải chỉ được có tối đa một đơn ở nhóm này (unique index từng phần). `REJECTED`/`CANCELLED` không chặn, nên provider làm lại được.
- Đơn **chốt cứng** `amount` và `featured_days` lúc tạo. Bảng giá đổi về sau không làm thay đổi đơn đã đặt.
- `REJECTED` bắt buộc có `admin_notes` — provider phải biết vì sao mới khai báo lại được.

### Cửa thu phí

`DRAFT → OPEN` gọi `assertContestFeePaid`. Chưa có đơn `PAID` thì trả **402 `CONTEST_FEE_REQUIRED`**. Mở đăng ký là lúc giải bắt đầu tiêu tài nguyên nền tảng và xuất hiện trước khách, nên đó là cửa. Các chuyển trạng thái khác — kể cả `CANCELLED` — không bị chặn.

### Quảng bá tách khỏi thu tiền

Admin xác nhận tiền **không** đồng nghĩa nội dung lên trang chủ. Khi `confirmContestFeeOrder` chạy và `featured_days > 0`, hệ thống sinh một `featured_popups` ở `review_status = PENDING`, `is_active = false`, lấy tên/mô tả/ảnh bìa từ contest. Admin duyệt nội dung ở một hàng đợi riêng (`POST /admin/featured-popups/:popupId/review`). `getActiveFeaturedPopup` chỉ trả popup vừa `is_active` vừa `review_status = APPROVED`.

Khung ngày quảng bá chạy từ **lúc admin duyệt phí**, không phải lúc provider chuyển khoản — provider không mất ngày vì đối soát chậm.

### Endpoint

```text
GET    /api/v1/contest-fee-plans                        [auth]
GET    /api/v1/contests/:contestId/fee                  [PROVIDER, ADMIN]
POST   /api/v1/contests/:contestId/fee/order            [PROVIDER]   chọn gói
DELETE /api/v1/contests/:contestId/fee/order            [PROVIDER]   huỷ khi chưa chuyển khoản
POST   /api/v1/contests/:contestId/fee/transfer         [PROVIDER]   khai báo đã chuyển khoản
GET    /api/v1/admin/contest-fee-orders                 [ADMIN]
POST   /api/v1/admin/contest-fee-orders/:orderId/confirm [ADMIN]
POST   /api/v1/admin/contest-fee-orders/:orderId/reject  [ADMIN]     bắt buộc có lý do
GET    /api/v1/admin/featured-popups/pending            [ADMIN]
POST   /api/v1/admin/featured-popups/:popupId/review     [ADMIN]
```

### Còn thủ công

Thanh toán là **chuyển khoản ngân hàng + admin đối soát tay**, chưa nối payment gateway. Provider tự gõ mã giao dịch; `transfer_amount` gửi lên luôn là `order.amount` chứ không lấy con số provider gõ — chuyển thiếu thì admin phát hiện lúc soi sao kê. Chưa có refund cho phí tổ chức khi giải bị huỷ sau khi đã trả.

---

## 8. Prize / Reward

Backend có thể lưu prize trong `contests.config`, ví dụ:

```json
{
  "prizes": [
    {
      "rank": 1,
      "title": "Champion",
      "description": "Cash 1,000,000 VND"
    }
  ]
}
```

Current behavior:

- prize chỉ là thông tin hiển thị
- cash prize nằm ngoài platform
- không có payout/thuế/fraud workflow
- không tự phát voucher/package
- không có reward claim lifecycle

FE cần hiển thị prize như cam kết thủ công của Provider, không hiển thị như phần thưởng đã được platform bảo đảm thanh toán.

---

## 9. Check-in Và Trạng Thái Người Dùng

Registration state thật:

```text
PENDING -> CONFIRMED -> CHECKED_IN
    \          \
     -> CANCELLED
```

Check-in:

```text
POST /api/v1/contest-registrations/:registrationId/check-in
```

Điều kiện:

- registration phải `CONFIRMED`
- contest phải `CLOSED` hoặc `RUNNING` và nằm trong race window (`starts_at <= now <= ends_at`)
- `checked_in_cafe_id` thuộc contest
- Staff phải assigned đúng cafe đó
- Provider owner có thể thao tác toàn bộ cafe trong contest
- Check-in code được tạo ngẫu nhiên bảo mật và có unique constraint DB
- **BYOC check-in:** staff phải xác nhận (`byocConfirmed=true`) và gửi ít nhất 2 ảnh + checklist bắt buộc (`body`, `power_system`, `wheels`). Nếu bất kỳ hạng mục nào `NOT_OK` hoặc thiếu ảnh/checklist → từ chối check-in. Khai báo BYOC phải đầy đủ (`vehicle_name`) trước khi check-in.
- Transition `CONFIRMED -> CHECKED_IN` thực hiện bằng atomic UPDATE `WHERE status = CONFIRMED`, tránh race condition khi staff check-in và đồng bộ check-in xe cùng lúc.

FE Customer không nên hiển thị quá nhiều trạng thái kỹ thuật. Dùng journey status rút gọn:

| Journey status | Ý nghĩa |
|---|---|
| `PENDING_APPROVAL` | Đã đăng ký, chờ Provider duyệt/phí |
| `APPROVED_WAITING_CHECKIN` | Đã được duyệt, chờ tới ngày thi |
| `CHECKED_IN_WAITING_BRACKET` | Đã check-in, chờ xếp lịch |
| `IN_BRACKET` | Đang trong bracket/lượt thi |
| `ADVANCED` | Đã qua vòng |
| `ELIMINATED` | Đã bị loại |
| `FINISHED` | Giải đã kết thúc |
| `CANCELLED` | Đăng ký bị hủy/từ chối |

---

## 10. Runtime: Knockout Và Time Trial

Tất cả runtime dùng:

```text
contest_matches
contest_match_participants
```

Generate:

```text
POST /api/v1/contests/:contestId/matches/generate
```

Payload:

```json
{
  "cafe_id": "uuid",
  "track_config_id": "uuid-or-null",
  "registration_ids": ["uuid"],
  "drivers_per_match": 2,
  "seeding_mode": "CHECK_IN_ORDER"
}
```

Backend chỉ cho đưa registration đã `CHECKED_IN` vào runtime.  
Generate matches bị chặn nếu contest đã có match `COMPLETED` hoặc `RUNNING` để tránh xóa kết quả đã có.

`updateMatchParticipants` dùng UPSERT thay vì xóa toàn bộ, giữ lại result data đã nhập.  
Không được chỉnh participant khi match đang `RUNNING`.

### Knockout

Khi `runtime_format = KNOCKOUT`:

- backend tạo round/match dạng bracket
- first round nhận participant theo seed/check-in order
- mỗi match có `next_match_id`
- submit result xong có thể advance winner sang match kế tiếp
- leaderboard mode mặc định `KNOCKOUT_WINS`

UI Provider/Staff cần:

- bracket view theo round
- match detail panel
- participant slots/lane/grid
- form nhập `finish_position`, `is_winner`, `score`, `result_note`
- action `Advance winner`
- correction flow có reason và `force_cascade` chỉ cho Provider
- **drag-and-drop advance popup**: khi kéo thả người thi đấu sang vòng sâu hơn, hiển thị popup xác nhận to, responsive (`sm:max-w-3xl`, 95vw mobile), cho phép nhập nhanh đầy đủ kết quả: `finish_position`, `score`, `best_lap_seconds`, `total_time_seconds`, `status` (READY/STARTED/FINISHED/DNS/DNF/DQ), `result_note`, `is_winner`. Toggle "Cập nhật nhanh kết quả trận nguồn" để tránh ghi đè kết quả ngoài ý muốn. Nếu không nhập vị trí về đích, hệ thống tự điền từ cờ winner; status mặc định FINISHED.

### Time Trial

Khi `runtime_format = TIME_TRIAL`:

- mỗi registration tạo một match/lượt thi riêng
- match type `TIME_ATTACK`
- nhập `best_lap_ms` hoặc `total_time_ms`
- leaderboard sort theo `BEST_LAP` hoặc `TOTAL_TIME`

UI Provider/Staff cần:

- danh sách lượt thi theo thứ tự
- form nhập thời gian từng người
- bảng ranking realtime sau khi match completed
- nút publish leaderboard khi mọi lượt đã completed

### Qualifying + Final / Grand Prix (đã implement 2026-07-23)

Khi `runtime_format = QUALIFYING_FINAL` (contest type `GRAND_PRIX`, template `grand_prix_qualifying_final` — seed migration `1784600000000`):

- **Phase QUALIFYING**: mỗi VĐV `CHECKED_IN` chạy một match `TIME_ATTACK` riêng, xếp hạng theo `best_lap_ms` (tái dùng engine TIME_TRIAL).
- **Phase FINAL**: sau khi mọi match QUALIFYING `COMPLETED`, provider gọi:

```text
POST /api/v1/contests/:contestId/matches/generate-final-bracket
```

  Backend lấy top N theo `config.finalists` (default 4) tạo bracket knockout với seeding 1vN, 2vN-1, ... (rank 1 gặp rank N, rank 2 gặp rank N-1).
- Runtime FINAL vận hành như KNOCKOUT; leaderboard mode `KNOCKOUT_WINS`.
- Nếu số VĐV đủ điều kiện ít hơn N, bracket chỉ gồm VĐV thực tế, không bù slot ảo.

UI Provider/Staff cần:

- input `finalists` trong form tạo contest
- bracket views tách rõ 2 phase: Qualifying (ranking best lap) và Final (knockout bracket)

---

## 11. Result Correction Và Publish Leaderboard

Submit result:

```text
POST /api/v1/contest-matches/:matchId/results
```

Correct result:

```text
POST /api/v1/contest-matches/:matchId/results/correct
```

Advance:

```text
POST /api/v1/contest-matches/:matchId/advance
```

Publish:

```text
POST /api/v1/contests/:contestId/leaderboard/publish
```

Guard hiện có:

- result phải thuộc participant của match
- submit result cần `reason`
- match completed mới được correct
- Staff không được `force_cascade`; Provider mới có force_cascade
- nếu downstream đã linked, correction không force sẽ bị chặn
- nếu **bất kỳ downstream match** nào đã completed, force correction cũng bị chặn
- correction xóa toàn bộ downstream participants và reset chúng về `DRAFT`
- publish bị chặn nếu còn match `DRAFT`, `READY`, `RUNNING` hoặc thiếu result
- publish local leaderboard vào `contests.config.published_leaderboard`
- contest chuyển `COMPLETED`
- **publish leaderboard chỉ cho phép Provider owner; STAFF không được publish**
- **không thể submit/correct result sau khi leaderboard đã publish** (409 `CONTEST_LEADERBOARD_PUBLISHED`)

Public sau giải:

- `GET /api/v1/contests/:contestId` cần hiển thị `published_leaderboard` nếu có
- `GET /api/v1/contests/:contestId/matches` vẫn cho xem lại bracket/matches của contest public
- local leaderboard khác global leaderboard
- global leaderboard chỉ đọc `race_records` verified sau `sync-race-records`

---

## 12. Audit Và Metrics

Audit:

```text
GET /api/v1/contests/:contestId/audit-logs?page=1&limit=20
```

Response dạng paginated: `data`, `meta.total`, `meta.page`, `meta.limit`. Mỗi row có thêm:

- `actionSummary`: câu mô tả tiếng Việt ngắn gọn (vd: "Tạo đăng ký #a1b2c3d4 tham gia contest", "Sửa kết quả trận #e5f6...")
- `actorName`: full name của actor khi có actor id; SYSTEM thì để null
- raw `before_json`, `after_json`, `metadata`, `reason` vẫn giữ để audit chi tiết

Metrics:

```text
GET /api/v1/contests/:contestId/metrics
```

Audit events hiện có trong backend gồm:

- `contest.created`
- `contest.updated`
- `contest.opened`
- `contest.closed`
- `contest.cancelled`
- `registration.created`
- `registration.entry_fee_marked_paid`
- `registration.entry_fee_waived`
- `registration.approved`
- `registration.rejected`
- `registration.cancelled`
- `registration.checked_in`
- `booking.contest_rental_cancelled`
- `booking.contest_rental_retained`
- `booking.vehicle_checked_out`
- `contest.matches_generated`
- `match.participants_updated`
- `match.results_submitted`
- `match.results_corrected`
- `match.advanced`
- `contest.leaderboard_published`
- `race_records.synced`

FE Provider cần có tab Audit để xem:

- actor id/role
- event type
- registration/match liên quan
- before/after json
- reason
- created time

---

## 13. Unhappy Cases, Disqualification Và Ban

Backend hiện xử lý được:

- reject/cancel/disqualify registration có reason; disqualify đồng thời xóa participant khỏi matches chưa completed
- cancel contest: hủy registrations, đánh dấu refund_needed cho paid, chuyển matches sang CANCELLED, ghi audit (chỉ Provider owner được cancel)
- contest-specific ban list với scope `CONTEST`/`PROVIDER`, evidence, expires, lift
- sửa result có audit
- chặn Staff thao tác sai cafe
- chặn publish khi match chưa xong hoặc thiếu result
- chặn booking trùng contest lock
- chặn duplicate entry-fee payment URL
- atomic capacity check + unique check-in code
- cleanup PENDING registration khi booking thuê xe hết hạn thanh toán (zombie cleanup)
- QUALIFYING_FINAL format đúng (không bị ép về KNOCKOUT)
- assign contest staff chỉ cho phép staff thuộc cafe của provider
- ADMIN có thể đọc audit log contest để oversight
- các thao tác tác động lớn chỉ Provider owner: cancel, update, publish leaderboard, generate final bracket, waive entry fee

Backend chưa có:

- contest-specific incident table
- rule tự động chặn người đã phá giải đăng ký lại
- automated refund qua payment gateway (refund flag được set, tiền thật cần payment flow xử lý)

Không dùng `users.is_active` để thay contest ban, vì đó là khóa tài khoản toàn hệ thống.

Nếu muốn làm bài bản, phase sau cần:

```text
contest_participant_incidents
contest_bans
contest_disciplinary_actions
```

Minimum behavior đề xuất:

- Staff/Provider report incident với reason/evidence.
- Provider có thể disqualify registration khỏi match/contest.
- Provider có thể ban user khỏi contest hiện tại hoặc khỏi contest của provider trong thời hạn nhất định.
- Ban/unban/disqualify đều ghi audit.
- Customer bị ban không đăng ký được contest nằm trong scope ban.

---

## 14. FE Screen Contract

### Setup — wizard 5 bước (từ 2026-08-01)

Màn hình tạo/sửa giải đấu đi theo trình tự phụ thuộc dữ liệu, mỗi bước validate bằng zod trước khi mở bước sau:

```text
1 Chi nhánh (+ chủ nhà)  →  2 Loại đường đua + phạm vi khoá  →  3 Thể thức + luật xe + giá thuê xe
→  4 Lịch trình & quy mô  →  5 Giới thiệu & xác nhận
```

Quy ước FE:

- **Thể thức chọn bằng template**, không phải ba dropdown rời. Mỗi `contest_template` gắn cứng một cặp (`contest_type`, `contest_format`) nên chọn template là suy ra cả ba id; ba dropdown cũ cho 18 tổ hợp mà chỉ 3 tổ hợp có template thật.
- **`vehicle_rule.vehicle_policy` mặc định `BYOC_ONLY`** cho giải mới. `MIXED` không còn được đề xuất (bắt staff chạy hai quy trình check-in trong cùng một giải) nhưng vẫn hiển thị nếu giải hiện tại đang dùng — backend vẫn chấp nhận giá trị này.
- **`config.rental_policy` có UI** ở bước 3, chỉ hiện khi giải cho thuê xe. Mặc định cho giải MỚI là `waive_slot_fee: true` + `deposit_mode: WAIVED`; giải CŨ chưa có `rental_policy` thì form đọc theo mặc định backend (`waive_slot_fee: false`, `deposit_mode: FULL`) để mở form sửa rồi lưu không âm thầm đổi giá.
- **`vehicle_rule.assignment_policy`** vẫn hiển thị nhưng chưa có logic vận hành nào đọc — FE ghi rõ điều đó cạnh ô chọn.

Provider nên chia contest thành các màn hình/tabs:

1. **Setup**: info, time, cafe, track type, resource locks, prize, fee.
2. **Registrations**: danh sách người đăng ký, payment status, approve/reject/cancel.
3. **Check-in**: lookup/check-in code, cafe check-in.
4. **Runtime**:
   - Knockout bracket UI nếu `runtime_format=KNOCKOUT`
   - Time trial run list/ranking UI nếu `runtime_format=TIME_TRIAL`
5. **Leaderboard**: preview/publish, local snapshot.
6. **Metrics**: counts hiện có, revenue khi backend bổ sung.
7. **Audit**: lịch sử thao tác.

Staff nên có:

- contest list theo cafe assigned
- check-in screen
- runtime screen theo format
- result submit/correct không force cascade

Customer nên có:

- public listing/detail
- registration status rõ ràng
- my contest registrations
- bracket/leaderboard read-only

---

## 15. Implementation Notes

- Không viết docs như thể VNPay contest đã xong.
- Không viết BYOC như đã xong; backend register hiện rental-only.
- Không viết schedule block là future; backend đã có contest lock.
- Không dùng `contests.config.published_leaderboard` làm global leaderboard.
- Không dùng user global deactivate thay contest ban.
