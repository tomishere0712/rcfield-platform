# BR-Contest

**Last updated:** 2026-08-05  
**Status:** Aligned to current backend

---

## 1. Scope Truth

**BR-CT-001 — Contest là bounded context riêng**  
IF: Provider tổ chức giải  
THEN: dùng `contests`, `contest_registrations`, `contest_matches`, `contest_audit_logs`; không tạo booking giả để biểu diễn contest.

**BR-CT-002 — Docs phải phản ánh backend truth**  
IF: Backend đã có route/service/migration hoạt động  
THEN: docs không được ghi là gap.  
IF: Chưa có lifecycle hoàn chỉnh  
THEN: docs phải ghi rõ phần nào mới là current, phần nào vẫn là gap.

---

## 2. Time, Status, Capacity

**BR-CT-010 — Contest có registration window và race window**  
IF: tạo contest  
THEN: phải có `registration_opens_at`, `registration_closes_at`, `starts_at`, `ends_at`.

**BR-CT-011 — Registration close không được sau race start**  
IF: create/update contest  
THEN: `registration_closes_at <= starts_at`.

**BR-CT-012 — Register chỉ khi contest OPEN và trong window**  
IF: contest không `OPEN` hoặc nằm ngoài registration window  
THEN: reject registration.

**BR-CT-013 — Capacity tính registration chưa cancelled**  
IF: số registration active đạt capacity  
THEN: reject registration mới.  
NOTE: capacity check phải atomic (transaction + row-level lock) để tránh race condition overcapacity.

**BR-CT-014 — Auto-close OPEN -> CLOSED khi hết registration window**  
IF: contest `OPEN` và `registration_closes_at` đã qua  
THEN: cron job tự chuyển sang `CLOSED`. Register endpoint vẫn reject theo thời gian là fallback.

**BR-CT-015 — Auto-running CLOSED -> RUNNING khi đến giờ thi**  
IF: contest `CLOSED`, `starts_at` đã qua, `ends_at` chưa qua và đã có ít nhất một `contest_match`  
THEN: cron job tự chuyển sang `RUNNING`. Nếu chưa có match nào thì giữ `CLOSED` cho operator generate matches trước.

---

## 3. Cafe, Track Type, Thể Thức, Resource Lock

**BR-CT-020 — Cafe contest phải thuộc Provider**  
IF: Provider tạo/update contest  
THEN: mọi `participating_cafe_ids` phải active và thuộc Provider đó.

**BR-CT-021 — MỌI chi nhánh tham gia phải có track type của giải**  
IF: create/update contest  
THEN: `track_type_id` phải valid và **mọi** cafe trong `participating_cafe_ids` đều phải có ít nhất một `cafe_track_config` active thuộc track type đó; FE chỉ hiển thị giao (intersection) các loại đường đua của những chi nhánh đã chọn.  
RATIONALE: trước đây chỉ cần một chi nhánh có là qua. Điều đó cho phép tạo giải ở ba chi nhánh nhưng chỉ một nơi có sân Drift — VĐV check-in ở hai chi nhánh còn lại không có chỗ thi đấu, trong khi resource lock vẫn chặn booking thường ở đó.  
NOTE: lỗi `CONTEST_TRACK_TYPE_UNAVAILABLE` trả về `details.missing_cafe_ids` và nêu tên chi nhánh thiếu trong message.

**BR-CT-022 — Resource lock là current feature**  
IF: contest có race window  
THEN: backend dùng `config.resource_locks` để block booking thường trùng tài nguyên/thời gian.

**BR-CT-023 — FULL_BRANCH khóa cả chi nhánh**  
IF: lock scope = `FULL_BRANCH`  
THEN: booking thường overlapping ở cafe đó bị chặn.

**BR-CT-024 — SELECTED_TRACKS khóa một phần tài nguyên**  
IF: lock scope = `SELECTED_TRACKS`  
THEN: booking bị chặn khi trùng track config, hoặc fallback theo `track_type_id` nếu booking thiếu `track_config_id`.

**BR-CT-024a — Sân đúng loại đường đua của giải luôn bị khóa**  
IF: lock scope = `SELECTED_TRACKS`  
THEN: `resolveContestResourceLocks` bắt buộc gộp thêm mọi `cafe_track_config` active có `track_type_id = contest.track_type_id`, kể cả khi provider không chọn; FE hiển thị các sân này ở trạng thái đã tick và không cho bỏ tick.  
RATIONALE: `contestLockBlocksTrack` vốn đã chặn mọi booking trùng loại đường đua của giải (fallback cuối hàm), trong khi `findContestBookingConflicts` lúc tạo giải chỉ soi các sân được chọn. Không đồng bộ hai bên thì provider tưởng sân thi đấu vẫn nhận khách trong khi thực tế đã bị khóa, và booking đang tồn tại trên sân đó không chặn được việc tạo giải đè lên.

**BR-CT-025 — Không cho create/update contest đè booking hiện hữu**  
IF: có booking `PENDING` hoặc `CONFIRMED` overlap lock  
THEN: reject bằng conflict.

**BR-CT-026 — Chỉ tạo giải trên thể thức đã phát hành**  
IF: create contest, hoặc update contest có ĐỔI `contest_format_id` sang thể thức khác  
THEN: `contest_formats.is_released` phải `true`; ngược lại reject `CONTEST_FORMAT_NOT_RELEASED` (400) kèm `details.contest_format_code`, message nêu đích danh tên thể thức.  
IF: update contest KHÔNG đổi thể thức (giải cũ đang nằm trên thể thức chưa phát hành)  
THEN: không chặn — provider vẫn sửa được tên, giờ, sức chứa và vẫn huỷ được giải.  
RATIONALE: `is_active` chỉ nói "còn trong catalog hay không". Tắt `is_active` thì thể thức đang làm dở biến mất khỏi tầm mắt provider; để nguyên thì provider trả phí tổ chức xong mới phát hiện chế độ mình chọn chưa chạy được. Cột riêng cho phép vẫn bày ra kèm nhãn "Sắp có" mà không bán được. Chặn ở mọi lần update thì khoá cứng giải cũ, nên điều kiện phải là "đang đổi thể thức", không phải "thể thức hiện tại chưa mở".  
NOTE: từ 2026-08-05 cả ba thể thức đều `is_released = true`. Cột này giữ lại cho các thể thức thêm về sau.

**BR-CT-027 — Lượt chạy tính giờ: nhiều lượt, lấy lượt nhanh nhất**  
IF: `runtime_format` là `TIME_TRIAL` hoặc `QUALIFYING_FINAL`  
THEN: mỗi VĐV được `config.runs_per_driver` lượt (1–5, mặc định 3), mỗi lượt là một `contest_match` riêng với `round_no` = số thứ tự lượt; bảng xếp hạng lấy lap nhanh nhất trong các lượt của cùng một người.  
RATIONALE: đua tính giờ thật cho mỗi người vài lượt. Trước đây đúng một lượt, mà muốn chạy lại thì phải bốc thăm lại — và bốc lại bị chặn ngay khi có một lượt hoàn tất, nên không có đường nào.

**BR-CT-028 — Lượt chạy một mình không có người thắng**  
IF: match có `match_type = TIME_ATTACK`  
THEN: tôn trọng `advancement_rule.winners_to_advance = 0` — không gán `is_winner` cho ai.  
IF: match đối kháng (`HEAD_TO_HEAD`, `FINAL`), kể cả trận tranh hạng 3 vốn khai `winners_to_advance = 0` vì không đẩy ai đi tiếp  
THEN: vẫn phải chốt đúng một người thắng.  
RATIONALE: `Math.max(1, winnersToAdvance || 1)` nuốt mất số 0 do toán tử `||`, nên mọi lượt chạy một mình đều bị gắn người thắng — vô nghĩa với đua tính giờ và cộng một trận thắng ảo cho tất cả mọi người ở thể thức vòng loại + chung kết. Ranh giới đúng là loại trận, không phải con số.

**BR-CT-029 — Vào chung kết phải có thành tích thật**  
IF: sinh nhánh chung kết của `QUALIFYING_FINAL`  
THEN: chỉ xét người có ít nhất một lượt hợp lệ (không `DNS`/`DNF`/`DQ` và có `best_lap` hoặc `total_time`); mỗi người gộp về một dòng lấy thành tích tốt nhất trước khi xếp hạng; nhánh chung kết bắt đầu từ vòng ngay sau vòng loại cuối.  
IF: số người có thành tích ít hơn `config.finalists`  
THEN: chung kết chỉ gồm những người có thành tích, chỗ trống để trống — không lấp bằng người chưa hoàn thành lượt nào.  
RATIONALE: trước đây thời gian rỗng bị coi như vô cực nhưng vẫn nằm trong danh sách, nên người chưa từng chạy xong vẫn lọt vào chung kết khi còn trống suất. Và khi mỗi người chạy nhiều lượt, xếp hạng trên danh sách thô cho phép một người nhanh chiếm luôn nhiều suất.

**BR-CT-029a — Dựng lại nhánh chung kết khi chưa ai đấu**  
IF: nhánh chung kết đã sinh nhưng chưa match nào `RUNNING`/`COMPLETED` do thi đấu  
THEN: `generate-final-bracket` xoá nhánh cũ và dựng lại.  
IF: đã có trận chung kết thi đấu  
THEN: reject `FINAL_BRACKET_ALREADY_PLAYED` (409).  
RATIONALE: sinh nhầm từng là ngõ cụt — `generate matches` bị khoá vì vòng loại đã xong, còn endpoint này chặn cứng, lối thoát duy nhất là sửa thẳng DB.

---

## 4. Registration, RENTAL, BYOC

**BR-CT-030 — Một user chỉ có một registration active trong contest**  
IF: user đã có registration chưa `CANCELLED`  
THEN: reject duplicate registration.

**BR-CT-031 — RENTAL registration chỉ qua inline rental_slot**  
IF: `vehicle_source = RENTAL`  
THEN: phải gửi `rental_slot`; backend tạo booking `PENDING` với `source = CONTEST`, link `contest_id`; không còn luồng dùng booking có sẵn làm đầu vào đăng ký.

**BR-CT-031a — Entry fee gộp vào booking thanh toán một lần**  
IF: registration dùng `rental_slot` VÀ contest có `entry_fee > 0`  
THEN: backend thêm thành phần `CONTEST_ENTRY_FEE` vào booking snapshot với status `HELD`; khách thanh toán phí thuê xe + lệ phí giải trong một giao dịch VNPay; khi booking `CONFIRMED`, registration tự chuyển `paymentStatus` hợp lệ để Provider approve.

**BR-CT-032 — BYOC registration đã là current backend behavior**  
IF: `vehicle_rule.vehicle_policy != RENTAL_ONLY`  
THEN: customer có thể register với `vehicle_source = BYOC` và khai báo xe.

**BR-CT-033 — BYOC hiện mới dừng ở declaration-based flow**  
IF: customer register BYOC  
THEN: backend đang lưu declaration trong `metadata`; chưa coi `customer_vehicle_id` là contract production-ready hoàn chỉnh.

**BR-CT-033a — BYOC declaration chỉ sửa khi PENDING**  
IF: customer gọi `PATCH /contest-registrations/:id/byoc-declaration`  
THEN: chỉ chủ registration được sửa, chỉ khi registration đang `PENDING`, và phải ghi audit `registration.byoc_declaration_updated`.

**BR-CT-034 — Payment status ban đầu phụ thuộc entry fee**  
IF: `entry_fee > 0`  
THEN: registration vào `PENDING_PAYMENT`.  
IF: `entry_fee = 0`  
THEN: registration vào `PENDING_REVIEW`.

---

## 5. Entry Fee, VNPay, Manual Review

**BR-CT-040 — Entry fee contest có subject riêng**  
IF: customer tạo thanh toán entry fee  
THEN: payment transaction phải dùng `subject_type = CONTEST_ENTRY` và link `contest_registration_id`.

**BR-CT-041 — Contest entry payment URL là current feature**  
IF: customer có registration `PENDING_PAYMENT`  
THEN: backend tạo payment URL qua `create-entry-fee-payment`.  
NOTE: chỉ cho phép một transaction `CONTEST_ENTRY` đang active (PENDING/PENDING_PAYMENT) tại một thời điểm; nếu đã có transaction chưa failed thì reject hoặc reuse thay vì tạo mới, tránh duplicate payment/orphan txn.

**BR-CT-042 — Operator vẫn có manual override**  
IF: Provider/Staff cần duyệt phí thủ công  
THEN: dùng `mark-entry-fee-paid` hoặc `waive-entry-fee`.

**BR-CT-042a — Ghi audit khi khách tạo link thanh toán lệ phí**  
IF: customer gọi `create-entry-fee-payment`  
THEN: ghi audit `registration.entry_fee_payment_initiated` với `txn_ref`, `amount`, `gateway` để truy vết cả các link chưa thanh toán.

**BR-CT-042b — Ghi audit khi thanh toán lệ phí thất bại**  
IF: VNPay/IPN trả về thất bại cho transaction `CONTEST_ENTRY`  
THEN: ghi audit `registration.entry_fee_payment_failed` với `response_code` để provider biết lý do.

**BR-CT-043 — Contest cancel kích hoạt lifecycle cleanup**  
IF: contest chuyển sang `CANCELLED`  
THEN: hủy tất cả registrations chưa cancelled, đánh dấu paid registrations cần refund (`refund_needed=true`, tạo `PaymentTransaction` REFUND PENDING), chuyển matches sang `CANCELLED`, và ghi audit `registration.refund_requested`. Refund tiền thật vẫn do VNPay/IPN flow xử lý.

**BR-CT-043a — Provider/Admin xác nhận hoàn tiền thủ công**  
IF: contest đã bị hủy và có `PaymentTransaction` REFUND PENDING cho registration  
THEN: Provider hoặc Admin gọi `POST /contest-registrations/:registrationId/refunds/:refundTxnId/confirm` để đánh dấu đã hoàn tiền (dù gateway chưa tự động), ghi audit `registration.refund_confirmed`.

---

## 6. Approval, Check-in, Staff

**BR-CT-050 — Approve chỉ khi payment state hợp lệ**  
IF: registration vẫn ở trạng thái phí chưa xử lý  
THEN: không được approve.

**BR-CT-051 — Contest ban chặn approve/check-in**  
IF: participant có active contest/provider ban  
THEN: reject approve hoặc check-in.

**BR-CT-052 — Check-in chỉ cho registration CONFIRMED**  
IF: registration chưa `CONFIRMED`  
THEN: reject check-in.

**BR-CT-052a — BYOC check-in yêu cầu kiểm tra xe thật**  
IF: registration `vehicle_source = BYOC` và staff gọi check-in  
THEN: khai báo phải có `vehicle_name`; staff phải gửi `byocConfirmed=true`, ít nhất 2 ảnh, và checklist đầy đủ các hạng mục bắt buộc (`body`, `power_system`, `wheels`). Nếu bất kỳ hạng mục nào `NOT_OK` hoặc thiếu ảnh/checklist → từ chối check-in. Transition `CONFIRMED -> CHECKED_IN` thực hiện bằng atomic UPDATE `WHERE status = CONFIRMED` để tránh race.

**BR-CT-053 — Staff phải assigned đúng cafe**  
IF: staff lookup/check-in/runtime action  
THEN: staff phải là assigned staff của contest VÀ được assigned vào cafe nơi thao tác diễn ra (`checked_in_cafe_id` hoặc `match.cafe_id`). Provider owner được quyền trên toàn bộ cafe trong contest.

**BR-CT-054 — Các thao tác tác động lớn chỉ thuộc Provider owner**  
IF: cancel contest, update contest info, publish leaderboard, generate final bracket, hoặc waive entry fee  
THEN: chỉ Provider owner của contest được phép; STAFF không được phép thực hiện để giảm rủi ro gian lận và đảm bảo có đầu mối chịu trách nhiệm pháp lý. Các thao tác vận hành ngày thi (check-in, generate matches, submit/correct results, approve/reject registrations, open/close registrations) vẫn cho phép STAFF đã được phân công.

---

## 7. Runtime, Leaderboard, Metrics

**BR-CT-060 — Runtime chỉ nhận registration CHECKED_IN**  
IF: generate matches  
THEN: chỉ dùng registrations đủ điều kiện event-day.

**BR-CT-061 — Runtime format quyết định vận hành**  
IF: `runtime_format = KNOCKOUT`  
THEN: dùng bracket + advance flow.  
IF: `runtime_format = TIME_TRIAL`  
THEN: dùng run list + lap/time ranking flow.

**BR-CT-062 — Publish leaderboard là local snapshot**  
IF: operator publish leaderboard  
THEN: backend lưu `config.published_leaderboard` và đưa contest sang `COMPLETED`.

**BR-CT-063 — Local leaderboard không phải global leaderboard**  
IF: muốn bảng xếp hạng toàn hệ thống  
THEN: đọc từ `race_records`, không đọc trực tiếp từ config contest.

**BR-CT-063a — Published leaderboard tôn trọng privacy của VĐV**
IF: customer xem bảng xếp hạng công bố của contest (không phải operator/admin/bản thân VĐV)  
THEN: backend mask tên/driver_handle/title của những VĐV có `racing_profile.public_profile_enabled = false` hoặc `racing_profile.leaderboard_opt_in = false` thành "VĐV ẩn danh"; operator/admin/self vẫn thấy rõ.

**BR-CT-064 — Metrics hiện đã có revenue summary cơ bản**  
IF: FE gọi metrics  
THEN: có `expected_revenue`, `paid_revenue`, `waived_revenue`, `pending_revenue`, `payment_conversion_rate` cùng registration/match/global sync stats.

---

## 8. Audit, Ban, Disqualify

**BR-CT-070 — Mutation quan trọng phải audit**  
IF: create/update/status/register/fee/check-in/runtime/publish/ban/disqualify  
THEN: ghi `contest_audit_logs`.

**BR-CT-071 — Ban theo contest hoặc provider là current behavior**  
IF: operator muốn chặn participant  
THEN: có thể tạo ban scope `CONTEST` hoặc `PROVIDER`, có `reason`, `evidence`, `expires_at`.

**BR-CT-072 — Lift ban phải có lịch sử**  
IF: operator gỡ ban  
THEN: lưu `lifted_at`, `lifted_by`, `lift_reason` và audit event.

**BR-CT-073 — Disqualify loại participant khỏi active matches**  
IF: operator disqualify participant  
THEN: chuyển registration sang `CANCELLED`, lưu reason và metadata disqualified, đồng thời xóa participant khỏi các `contest_match_participants` của matches chưa `COMPLETED` để bracket không tiếp tục đẩy người bị loại đi tiếp.

**BR-CT-074 — Incident/protest/appeal chưa có module riêng**  
IF: cần quy trình kỷ luật nhiều bước  
THEN: đó vẫn là gap, chưa phải current contract.

---

## 9. Contest↔Booking Rental

**BR-CT-080 — Contest rental booking là booking thật, không booking giả**  
IF: customer thuê xe cho contest bằng `rental_slot` trong đăng ký  
THEN: tạo booking với `source = CONTEST` và `bookings.contest_id` (FK → contests, `ON DELETE SET NULL`); booking đi qua core booking/payment/session engine (snapshot pricing, VNPay flow, expiry, checkout/refund) như booking thường. Không được tạo payment path hay state machine riêng cho contest. WF-A cũ (`POST /bookings/contest-rental`) không còn là entry chính.

**BR-CT-081 — Slot thuê xe contest phải nằm trong slot_window**  
IF: tạo contest rental booking  
THEN: slot phải nằm trong `contest.starts_at - slot_window.before_min` → `contest.ends_at + slot_window.after_min` (đọc từ `contest.config.rental_policy`, default 60/60); vi phạm reject bằng `CONTEST_SLOT_OUTSIDE_WINDOW`. Áp dụng cho cả WF-A và WF-B.

**BR-CT-082 — Chính sách giá contest áp lúc pricing, freeze vào snapshot**  
IF: contest có `config.rental_policy`  
THEN: `waive_slot_fee=true` → phí sân = 0; `deposit_mode=REDUCED` → cọc = `deposit_percent`% mức chuẩn (default 50); `deposit_mode=WAIVED` → cọc 0; `FULL` → cọc chuẩn. Giá thực thu freeze vào snapshot → refund cọc sau checkout tự đúng, không có code refund riêng. Thiếu `rental_policy` → tính giá như booking thường.

**BR-CT-083 — Check-in xe tự đồng bộ check-in registration (một chiều, fail-open)**  
IF: staff check-in xe cho booking có `contest_id` VÀ customer có registration `CONFIRMED` của contest đó  
THEN: registration tự chuyển `CHECKED_IN`, ghi audit `registration.checked_in` với `metadata.trigger='vehicle_check_in'`; response check-in có `contest_checkin { registrationId, synced, previousStatus }`.  
IF: không có registration hợp lệ (chưa duyệt/đã hủy/đã check-in/không tồn tại)  
THEN: check-in xe vẫn thành công bình thường, `synced=false`, không side effect vào contest. Chiều ngược lại (check-in contest thủ công → xe) không tự động. Checkout trả xe ghi audit `booking.vehicle_checked_out`.

**BR-CT-084 — Cleanup booking khi reject/cancel/timeout registration**  
IF: registration có booking contest kèm theo bị reject, cancel, hoặc booking PENDING hết hạn thanh toán  
THEN: booking còn `PENDING` → bị cancel + audit `booking.contest_rental_cancelled` và cascade hủy registration (zombie cleanup); booking đã thanh toán → giữ nguyên + audit `booking.contest_rental_retained` (không hủy tiền đã thu).

**BR-CT-085 — Seeding QUALIFYING_FINAL**  
IF: `runtime_format = QUALIFYING_FINAL`  
THEN: phase QUALIFYING là match `TIME_ATTACK` cho mỗi VĐV `CHECKED_IN`, xếp theo `best_lap_ms`; sau khi mọi match QUALIFYING `COMPLETED`, `generate-final-bracket` đưa top N (`config.finalists`, default 4) vào bracket FINAL knockout với seed đối xứng: rank 1 gặp rank N, rank 2 gặp rank N-1, ...; số VĐV đủ điều kiện ít hơn N thì bracket chỉ gồm VĐV thực tế; leaderboard mode `KNOCKOUT_WINS`.

---

## 10. Phí Tổ Chức Giải Và Quảng Bá

**BR-CT-090 — Phí tổ chức tính theo từng giải, tách khỏi gói SaaS**  
IF: Provider muốn mở đăng ký cho một giải  
THEN: phải có đơn `contest_fee_orders` ở trạng thái `PAID` cho chính giải đó. Gói đăng ký hằng tháng còn hiệu lực **không** thay thế được khoản này, và ngược lại.  
RATIONALE: hai khoản phục vụ hai việc khác nhau — gói SaaS trả cho việc vận hành chi nhánh, phí tổ chức trả cho một sự kiện cụ thể có suất hiển thị riêng.

**BR-CT-091 — Cửa thu phí đặt ở DRAFT → OPEN**  
IF: `changeContestStatus` chuyển sang `OPEN`  
THEN: `assertContestFeePaid` chặn nếu chưa có đơn `PAID`, trả 402 `CONTEST_FEE_REQUIRED`. Chưa đặt gói và đã đặt nhưng chờ đối soát có message khác nhau.  
IF: chuyển sang `CLOSED` hoặc `CANCELLED`  
THEN: không chặn — không được nhốt provider trong một giải họ muốn bỏ.

**BR-CT-092 — Mỗi giải chỉ một đơn còn hiệu lực**  
IF: giải đã có đơn ở `PENDING_PAYMENT`, `PENDING_REVIEW` hoặc `PAID`  
THEN: tạo đơn mới bị reject `CONTEST_FEE_ORDER_EXISTS` (409). `REJECTED` và `CANCELLED` không nằm trong nhóm chặn (unique index từng phần), nên provider bị từ chối vẫn đặt lại được.

**BR-CT-093 — Đơn chốt giá tại thời điểm đặt**  
IF: tạo đơn  
THEN: `amount` và `featured_days` copy từ `contest_fee_plans` vào đơn. Sửa bảng giá về sau không đổi đơn đã đặt.

**BR-CT-094 — Chỉ đặt gói khi giải còn là bản nháp**  
IF: contest không ở `DRAFT`  
THEN: tạo đơn bị reject `CONTEST_FEE_CONTEST_NOT_DRAFT` (400).

**BR-CT-095 — Provider chỉ huỷ đơn khi chưa khai báo chuyển khoản**  
IF: đơn ở `PENDING_PAYMENT`  
THEN: huỷ được để đổi gói khác.  
IF: đơn đã sang `PENDING_REVIEW` hoặc `PAID`  
THEN: reject `CONTEST_FEE_ORDER_NOT_CANCELLABLE` (409) — tiền có thể đã vào tài khoản, việc đóng đơn thuộc về admin.

**BR-CT-096 — Từ chối đơn phí bắt buộc có lý do**  
IF: admin reject đơn  
THEN: `admin_notes` bắt buộc và được gửi cho provider qua notification; provider khai báo lại chuyển khoản được.  
IF: admin confirm  
THEN: đơn sang `PAID`, ghi `reviewed_by` + `reviewed_at`.

**BR-CT-097 — Trả tiền không đồng nghĩa nội dung lên trang chủ**  
IF: đơn được confirm và `featured_days > 0`  
THEN: sinh `featured_popups` với `review_status = PENDING`, `is_active = false`, nội dung lấy từ contest (tên, mô tả, ảnh bìa). Admin duyệt nội dung ở hàng đợi riêng.  
IF: popup chưa `APPROVED`  
THEN: `getActiveFeaturedPopup` không trả về — điều kiện là `is_active = true` VÀ `review_status = APPROVED`.  
NOTE: khung ngày hiển thị tính từ lúc admin duyệt phí, không phải lúc provider chuyển khoản, để đối soát chậm không ăn vào ngày quảng bá đã bán.

**BR-CT-098 — Nền tảng không lấy phần trăm trên lệ phí VĐV**  
IF: giải thu lệ phí từ VĐV  
THEN: toàn bộ khoản đó thuộc Provider. Doanh thu nền tảng từ giải chỉ gồm phí tổ chức ở mục này.

**BR-CT-099 — Thanh toán phí tổ chức hiện là thủ công**  
IF: provider khai báo chuyển khoản  
THEN: `transfer_amount` ghi vào đơn luôn là `order.amount`, không lấy số provider tự gõ; `transfer_reference` và `transfer_date` chỉ để admin tra sao kê.  
NOTE: chưa nối payment gateway; chưa có luồng refund phí tổ chức khi giải bị huỷ sau khi đã trả.
