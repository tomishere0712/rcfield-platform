# BR-Racing-Network — Universal Racing Network Rules

**Last updated**: 2026-07-14  
**Status**: Minimal current implementation + planned expansion  
**Owner**: Product / Backend / Frontend / Operations

> Universal Racing Network la lop community/racing layer doc tu contest/session results da verified. Module nay khong thay Provider contest hien tai; no chi public hoa thanh tich duoc xac thuc theo privacy boundary ro rang. Phase hien tai moi implement lop toi gian: `users.racing_profile`, `race_records`, `achievement_definitions` va sync tu contest da publish.

---

## 1. Scope

| Capability | Trạng thái |
|---|---|
| Driver Passport tối giản | Đã implement |
| Global race records từ contest published | Đã implement |
| Global leaderboard public | Đã implement |
| Achievements từ DB + completed play thật | Đã implement |
| Passport QR community check-in riêng | Phase sau |
| Grand Prix Series | Phase sau |
| Team War / Clan War | Phase sau |

---

## 2. Data Verification Rules

**BR-RN-001 — Global leaderboard chỉ đọc verified race records**  
IF: Public leaderboard query runs  
THEN: Chỉ trả `race_records.verification_status = VERIFIED` và không trả record `SUPERSEDED`, `REJECTED`, driver đã opt-out hoặc cafe/provider chưa opt-in.

**BR-RN-002 — Customer không tự tạo official race record**  
IF: Customer tự nhập lap time hoặc upload ảnh kết quả  
THEN: Không được đưa thẳng vào global leaderboard; phải qua Staff/Admin verification hoặc contest/session source hợp lệ.

**BR-RN-003 — Contest result sync chỉ sau local publish**  
IF: Sync race records từ contest  
THEN: Contest phải publish local leaderboard, không còn match non-terminal, và correction/audit phải hoàn tất.

**BR-RN-004 — Result correction phải supersede hoặc re-sync**  
IF: Kết quả contest đã sync bị sửa  
THEN: Race record cũ phải được đánh dấu `SUPERSEDED` hoặc được update qua audited re-sync; global leaderboard không được hiển thị đồng thời cả record cũ và mới.

**BR-RN-005 — Opt-in trước khi public cross-provider**  
IF: Driver chưa bật `leaderboard_opt_in`  
THEN: Race record vẫn có thể lưu nội bộ nhưng không xuất hiện trên public global leaderboard.

---

## 3. Driver Passport Rules

**BR-RN-020 — Một user một driver profile active**  
IF: Customer dùng Driver Passport trong phase hiện tại  
THEN: Mỗi `user_id` có một `users.racing_profile` active về mặt nghiệp vụ; `driver_handle` phải unique case-insensitive.

**BR-RN-021 — Passport QR không phải quyền vào sân**  
IF: Staff scan Driver Passport QR  
THEN: QR chỉ xác định driver/community check-in; booking/session check-in vẫn phải qua booking/session rules riêng.

**BR-RN-022 — Cafe check-in cần staff scope**  
IF: Staff tạo `driver_cafe_checkins`  
THEN: Staff phải được assign vào cafe đó, hoặc Provider owner/Admin thực hiện theo quyền hợp lệ.

**BR-RN-023 — Public passport không lộ dữ liệu nhạy cảm**  
IF: Public xem Driver Passport  
THEN: Không trả email, phone, booking/payment/session private notes, inspection evidence hoặc audit payload.

---

## 4. Achievement Rules

**BR-RN-040 — Achievement definition là source of truth**  
IF: Hệ thống unlock badge  
THEN: Badge phải tồn tại trong `achievement_definitions`, đang active, và rule_code/version phải khớp evaluator.

**BR-RN-041 — Distinct cafe achievement đếm cafe duy nhất**  
IF: Achievement yêu cầu đi qua N cafe trong phase hiện tại  
THEN: Đếm distinct `cafe_id` từ completed play thật (`sessions.status = COMPLETED`, fallback `bookings.status = COMPLETED`), không đếm nhiều lần cùng cafe.

**BR-RN-042 — Race achievement chỉ dùng verified records**  
IF: Achievement dựa trên lap time, rank, podium hoặc số lần đua  
THEN: Chỉ dùng `race_records.verification_status = VERIFIED`.

**BR-RN-043 — Unlock idempotent**  
IF: Achievement evaluator chạy lại  
THEN: Không tạo duplicate unlock trong `users.racing_profile.unlocked_achievements`; nếu phase sau tách `driver_achievements` thì vẫn phải giữ idempotent.

## 4A. Planned Expansion / Next Phase

- Tách `driver_profiles` khỏi `users.racing_profile` nếu public identity cần scale riêng.
- Thêm `driver_cafe_checkins` cho passport QR community check-in độc lập.
- Thêm `driver_achievements` cho analytics/query chuyên sâu.
- Thêm session time attack sync vào `race_records`.
- Thêm Grand Prix Series và Team War sau khi lớp verified record ổn định.

---

## 5. Grand Prix Series Rules

**BR-RN-060 — Series là wrapper, không thay contest**  
IF: Admin/Provider tạo Grand Prix Series  
THEN: Mỗi round phải link tới một contest đã tồn tại; match/result vẫn thuộc contest con.

**BR-RN-061 — Series round chỉ tính contest đã publish**  
IF: Tính điểm series  
THEN: Chỉ dùng contest đã publish leaderboard và race records verified.

**BR-RN-062 — Point rule phải snapshot**  
IF: Series bắt đầu  
THEN: `league_series.point_rule` phải được snapshot; không tính lại lịch sử bằng rule mới nếu không có migration/audit rõ ràng.

**BR-RN-063 — Correction cascade cần audit**  
IF: Contest round bị correct sau khi standings đã tính  
THEN: Series standings phải re-calculate qua job/service có audit event.

---

## 6. Team War Rules

**BR-RN-080 — Team War không mở trước Driver Passport**  
IF: Chưa có Driver Passport và verified race records  
THEN: Không implement Team War runtime vì thiếu identity, ranking và anti-abuse foundation.

**BR-RN-081 — Team membership cần captain approval**  
IF: User join team  
THEN: Captain/manager phải approve trước khi member active.

**BR-RN-082 — Roster lock trước war**  
IF: Team War đã qua thời điểm roster lock  
THEN: Không cho thêm/xóa/thay driver trong war roster, trừ Admin override có audit.

**BR-RN-083 — Team result dùng verified source**  
IF: Team War standings được public  
THEN: Chỉ dùng race records/result đã verified, không dùng self-reported result.

---

## 7. Acceptance Checklist

- [ ] Global leaderboard không trả unverified/superseded/non-opt-in records.
- [ ] Driver Passport public không lộ email/phone/payment/session private data.
- [ ] Contest publish rồi sync tạo race records có source trace.
- [ ] Correct result sau sync không tạo duplicate leaderboard entry.
- [ ] Achievement check-in 5 cafe đếm distinct cafe.
- [ ] Series standings chỉ tính published round contests.
- [ ] Team War được giữ ở phase sau với roster lock/captain approval.
