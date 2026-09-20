# BR-Inspection — Quy tắc nghiệp vụ: Check-in / Check-out

**Last updated**: 2026-05-16
**Status**: Active

> **THAY ĐỔI:** Inspection giờ gắn với `Session` và `SessionVehicle`.
> Có thể inspect từng xe riêng (multi-vehicle). Bảng chính là `inspections`, ảnh nằm ở `inspection_photos`, checklist nằm ở `inspection_checklists`.

## 1. Nguyên tắc

Inspection là cơ chế tạo **digital evidence** tại mọi điểm bàn giao tài sản.  
Không có inspection hợp lệ → không có cơ sở tính `DAMAGE_CHARGE`.

---

## 2. Yêu cầu ảnh & checklist

**BR-IN-001** — Ảnh theo bốn góc (quy ước, chưa cưỡng chế)  
IF: Staff đang submit inspection (check-in hoặc check-out)  
THEN: Chụp theo bốn góc FRONT, BACK, LEFT, RIGHT  
NOTE: Schema hiện tại là `photos: z.array(...).max(6).optional()` — **tối đa 6 ảnh
và không bắt buộc ảnh nào**. Thiếu góc vẫn submit được. Muốn cưỡng chế phải thêm
validation, xem 04-inspection-flow.md.

**BR-IN-002** — Checklist  
Các trường `scratches`, `cracks`, `missing_parts`, `notes` được thiết kế để staff
điền đủ, nhưng tầng schema chưa bắt buộc.

**BR-IN-003** — Pre_existing_flag  
Có giá trị khi inspection có ảnh, có checklist, và Customer đã xác nhận. Vì hai
điều kiện đầu chưa được hệ thống cưỡng chế, giá trị chứng cứ của cờ này phụ thuộc
vào kỷ luật vận hành của staff.

---

## 3. Check-in

**BR-IN-004** — Chỉ 1 check-in per session
Mỗi session chỉ được có đúng 1 `Inspection` loại `CHECK_IN`

**BR-IN-005** — Staff phải thuộc chi nhánh  
IF: Staff không được assign vào chi nhánh của session đó (`staff_cafe_assignments`)  
THEN: Không thể thực hiện check-in

**BR-IN-006** — RENTAL check-in: lấy xe từ fleet  
IF: `play_mode = RENTAL` hoặc session vehicle có `vehicle_source = RENTAL`  
THEN: Staff lấy xe → `vehicle.status → IN_USE` → chụp 4 góc xe → checklist

**BR-IN-007** — BYOC check-in: xe của Customer  
IF: `play_mode = BYOC` hoặc session vehicle có `vehicle_source = BYOC`  
THEN: Staff chụp 4 góc xe của Customer + ảnh cơ sở vật chất (track, barriers)  
Checklist an toàn: `battery_secured`, `no_sharp_protrusions`, `weight_compliant`, `notes`

**BR-IN-008** — Customer confirm check-in  
IF: Inspection CHECK_IN được tạo  
THEN: Push notification đến Customer → Customer xem ảnh + checklist → confirm  
Không có timeout. Chưa xác nhận thì inspection cứ chờ — hệ thống không tự
xác nhận thay khách.

**BR-IN-009** — Session chuyển ACTIVE sau check-in  
IF: Customer confirm check-in  
THEN: `session.status → ACTIVE`

---

## 4. Check-out

**BR-IN-010** — Check-out bắt đầu từ ACTIVE  
IF: Staff bắt đầu check-out  
THEN: `session.status → CHECKING_OUT` ngay lập tức

**BR-IN-011** — Chụp cùng bốn góc như check-in  
Staff chụp lại theo bốn góc để đối chiếu với ảnh check-in

**BR-IN-012** — Staff đánh dấu damage  
Hệ thống **không so sánh tự động**; staff tự đối chiếu hai bản ghi rồi chọn:
- "Không có damage" → thông báo Customer xác nhận check-out
- "Có damage mới" → nhập từng hạng mục vào `damage_line_items` → thông báo Customer

**BR-IN-013** — Customer xác nhận không có damage  
Không có timeout tự động. Session chuyển COMPLETED khi staff hoàn tất check-out.

**BR-IN-014** — Customer nhận thông báo damage  
Không có timeout tự động chốt tiền.  
IF: Customer xác nhận → COMPLETED  
IF: Customer từ chối → có 2 hướng xử lý:
- Tạo `incidents` (incident policy-based): Staff/Admin áp rule, ghi `responsible_party` + `resolution_note`
- Mở `disputes` (tranh chấp chính thức): Admin xét xử dựa trên digital evidence từ inspection

---

## 5. Lưu trữ ảnh

**BR-IN-015** — Cloudinary folder convention  
```
inspections/{session_id}/{session_vehicle_id}/{check_in|check_out}/{front|back|left|right}
```
Upload lên Cloudinary → lấy URL về lưu vào `inspection_photos.url`; checklist lưu ở `inspection_checklists`.

**BR-IN-016** — Retention  
- Tối thiểu 90 ngày sau booking COMPLETED
- Nếu có incident: giữ đến 30 ngày sau incident RESOLVED/WAIVED
- Nếu có dispute: giữ đến 30 ngày sau dispute RESOLVED
