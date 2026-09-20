# 04 — Inspection Flow

**Last updated**: 2026-05-16  
**Status**: Active

---

## Tổng quan

Inspection là cơ chế tạo **digital evidence** tại mọi điểm bàn giao tài sản.
Không có inspection hợp lệ → không có cơ sở tính `DAMAGE_CHARGE` hoặc xử lý incident theo policy.

---

## CHECK-IN Flow

> **THAY ĐỔI:** Check-in giờ tạo một `Session` mới (không làm booking chuyển ACTIVE).
> Inspection gắn với session, có thể inspect từng xe riêng qua `inspection.session_vehicle_id`.

### RENTAL mode
```
1. Staff mở app → chọn booking → bắt đầu Check-in
2. System tạo Session (status = CHECKED_IN)
3. Staff lấy xe từ fleet (vehicle.status → IN_USE)
4. Staff chụp ảnh tình trạng xe theo bốn góc quy ước: FRONT, BACK, LEFT, RIGHT
   - Mỗi ảnh upload lên Cloudinary, lưu URL về DB
   - Zod cho phép TỐI ĐA 6 ảnh và KHÔNG bắt buộc ảnh nào
     (`photos: z.array(...).max(6).optional()`)
   - Bốn góc là quy ước vận hành, hệ thống không chặn khi thiếu
5. Staff hoàn thành checklist:
   - scratches: string (mô tả vết trầy, hoặc "none")
   - cracks: string
   - missing_parts: string
   - notes: string (tự do)
6. Nếu có hư hỏng có sẵn → bật pre_existing_flag = true
7. System tạo Inspection (type: CHECK_IN) gắn với session
8. Staff gắn inspection vào từng session_vehicle (multi-vehicle support)
9. Gửi thông báo đến Customer
10. Customer xem ảnh + checklist → bấm "Xác nhận"
    - customer_confirmed = true, customer_confirmed_at = now()
    - POST /sessions/:sessionId/inspection/confirm
    - KHÔNG có tự động xác nhận. Chưa xác nhận thì cứ chờ.
11. Session transition: CHECKED_IN → ACTIVE
```

### BYOC mode
```
Bước 1-4 tương tự nhưng:
- KHÔNG lấy xe từ fleet
- Staff chụp ảnh xe của Customer (4 góc)
- Staff chụp thêm ảnh cơ sở vật chất (track, barriers, decorations)
  → dùng để assess facility_damage_charge nếu có
- Checklist kiểm tra an toàn xe customer:
  - battery_secured: boolean
  - no_sharp_protrusions: boolean
  - weight_compliant: boolean
  - notes: string
```

---

## CHECK-OUT Flow

```
1. Staff mở app → chọn booking → chọn session đang ACTIVE → bắt đầu Check-out
2. Session transition: ACTIVE → CHECKING_OUT
3. Staff chụp lại theo cùng bốn góc với check-in cho từng xe
4. Staff hoàn thành checklist (giống check-in format) cho từng xe
5. Staff tự đối chiếu với bản check-in để quyết định có hư hỏng mới hay không
   - KHÔNG có so sánh tự động. Hệ thống chỉ hiển thị hai bản ghi cạnh nhau.
6. Staff đánh dấu: "Có damage mới" hoặc "Không có damage"
7. Nếu có damage:
   - Staff nhập từng hạng mục vào `damage_line_items` (parts_price, labor_price)
   - damage_charge = Σ (parts_price + labor_price)   ← không nhân multiplier
   - Gửi thông báo đến Customer kèm bằng chứng
   - Customer xác nhận hoặc phản đối
8. Nếu không có damage:
   - Gửi thông báo đến Customer để xác nhận check-out
9. Sau khi staff hoàn tất check-out:
   - Session transition: CHECKING_OUT → COMPLETED
   - Thu nốt các component còn PENDING (gia hạn, F&B tại quán, hư hỏng)
   - vehicle.status → AVAILABLE, hoặc → MAINTENANCE nếu có ghi nhận hư hỏng
     (`staff.service.ts:2936`)
   - Nếu tất cả sessions của booking đã COMPLETED → booking.status → COMPLETED
```

---

## Validation Rules

| Rule | Mô tả | Hệ thống có chặn? |
|------|-------|---|
| **Staff phải được assign vào cafe** | Kiểm tra qua `staff_cafe_assignments` — không thể check-in booking của cafe khác | ✅ có |
| **Không thể check-in 2 lần** | Mỗi session chỉ có 1 CHECK_IN inspection | ✅ có |
| **Tối đa 6 ảnh mỗi inspection** | `z.array(...).max(6)` | ✅ có |
| **Chụp đủ bốn góc** | FRONT, BACK, LEFT, RIGHT | ❌ **không** — ảnh là `optional()`, đây là quy ước vận hành |
| **Checklist đầy đủ** | scratches / cracks / missing_parts / notes | ❌ không bắt buộc ở tầng schema |

> Bản trước ghi *"Thiếu 1 trong 4 góc → không thể submit inspection"*. Ràng buộc
> đó chưa được cài đặt. Nếu muốn bằng chứng bàn giao thật sự chặt — vốn là giá
> trị cốt lõi của sản phẩm — cần thêm validation ở `validate/index.ts` chứ không
> dựa vào staff nhớ.

---

## Photo Storage

**Provider**: Cloudinary — upload ảnh, lưu URL về DB. Không tự manage storage.

```
Lưu vào DB:
- `inspections`: biên bản kiểm tra
- `inspection_photos`: từng ảnh theo góc chụp
- `inspection_checklists`: từng checklist item

Folder convention trên Cloudinary:
  inspections/{session_id}/{session_vehicle_id}/{check_in|check_out}/{angle}

Retention: tối thiểu 90 ngày sau booking COMPLETED
           nếu có incident: giữ đến 30 ngày sau incident RESOLVED/WAIVED
           nếu có dispute: giữ đến 30 ngày sau dispute RESOLVED
```

---

## Damage Charge & Incident Policy Implications

Khi xét damage charge hoặc incident:
- Check-in photos + checklist là **baseline** (trạng thái khi bàn giao)
- Check-out photos + checklist là **current state** (trạng thái khi trả)
- `pre_existing_flag` + `customer_confirmed` → hư hỏng có sẵn, Provider không được tính
- Nếu Provider thiếu ảnh hoặc checklist → **mất quyền tính damage**
- Phase 1 có 2 lớp xử lý: `incidents` (policy-based, Staff/Admin áp rule) và `disputes` (tranh chấp chính thức, Admin xét xử)
- Multi-party arbitration workflow nâng cao chuyển sang Phase 2
