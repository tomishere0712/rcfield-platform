# BR-Dispute — Quy tắc nghiệp vụ: Xử lý Tranh chấp & Incident

**Last updated**: 2026-05-17  
**Status**: Active

Phase 1 hỗ trợ hai lớp xử lý: **Incident** (log sự cố policy-based) và **Dispute** (tranh chấp chính thức do Admin xét xử). Multi-party arbitration workflow nâng cao là Phase 2.

---

## 1. Incident Policy Resolution

**BR-IR-001** — Incident là log sự cố vận hành  
IF: Có hư hỏng, va chạm, mất phụ kiện hoặc sự cố trong session  
THEN: Tạo `incidents` gắn với `session_id`.

**BR-IR-002** — Evidence dùng inspection  
IF: Incident liên quan damage  
THEN: Evidence chính là `inspections`, `inspection_photos`, `inspection_checklists`.

**BR-IR-003** — Không đủ evidence thì không tính phí  
IF: Thiếu check-in hoặc check-out inspection hợp lệ  
THEN: Không tạo `DAMAGE_CHARGE`, hoặc set `incidents.status = WAIVED`.

**BR-IR-004** — Rental damage  
IF: Damage mới trên xe thuê được xác nhận bằng inspection  
THEN: `responsible_party = CUSTOMER`, `final_amount = min(estimated_amount × damage_multiplier, deposit_cap_policy)`.

**BR-IR-005** — BYOC damage  
IF: Xe BYOC bị hư hại  
THEN: Staff/Admin ghi nhận incident; chỉ charge customer nếu evidence cho thấy customer gây thiệt hại cho tài sản quán hoặc xe thuê.

**BR-IR-006** — Staff/facility fault  
IF: Evidence cho thấy lỗi do staff hoặc cơ sở vật chất  
THEN: `responsible_party = PROVIDER` hoặc `STAFF`, `final_amount = 0` với customer.

**BR-IR-007** — Shared/unknown responsibility  
IF: Không đủ bằng chứng phân trách nhiệm rõ ràng  
THEN: `responsible_party = UNKNOWN` hoặc `SHARED`, `final_amount` do Admin/Staff quyết định.

**BR-IR-008** — Incident hoàn tất khi có đủ:  
`status = RESOLVED / WAIVED` + `responsible_party` + `final_amount` + `resolution_note` + `resolved_by` + `resolved_at`.

**BR-IR-009** — Payment adjustment không sửa ledger cũ  
IF: Resolution cần thu phí  
THEN: Tạo payment component mới (`DAMAGE_CHARGE`) thay vì sửa component cũ.

---

## 2. Dispute (Tranh chấp chính thức)

**BR-DI-001** — Ai có thể mở dispute  
- Customer: mở dispute khi không đồng ý với damage charge tại check-out  
- Customer hoặc Staff: mở dispute bất kỳ lúc nào session đang ACTIVE (sự cố trong khi chơi)

**BR-DI-002** — Không thể mở dispute sau COMPLETED  
IF: `booking.status = COMPLETED`  
THEN: Không thể mở dispute — window đã đóng.

**BR-DI-003** — Chỉ 1 dispute per booking  
Mỗi booking chỉ có tối đa 1 `disputes` record.

**BR-DI-004** — Evidence là inspection  
Check-in photos + checklist = baseline. Check-out photos + checklist = current state. Admin so sánh để phán quyết.

**BR-DI-005** — Provider mất quyền tính damage nếu thiếu evidence  
IF: Staff không hoàn thành inspection protocol (thiếu ảnh hoặc checklist)  
THEN: Provider mất quyền tính `DAMAGE_CHARGE`.

**BR-DI-006** — Pre-existing damage được bảo vệ  
IF: Hư hỏng đã ghi nhận ở check-in (`pre_existing_flag = true`) VÀ customer đã confirm  
THEN: Admin KHÔNG tính khoản đó là damage mới khi xét dispute.

**BR-DI-007** — Chỉ Admin xét xử  
IF: Dispute đang `OPEN` hoặc `UNDER_REVIEW`  
THEN: Chỉ ADMIN (team RCField) có quyền resolve, ghi `resolution`, `resolution_favor`, `resolved_by`, `resolved_at`.
