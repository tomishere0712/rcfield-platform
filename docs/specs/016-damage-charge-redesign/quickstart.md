# Quickstart & Test Scenarios: Thiết kế lại Giá Đền Bù Hư Hỏng Xe

**Date**: 2026-07-14
**Prerequisites**: Có sẵn booking RENTAL đang ở trạng thái `ACTIVE`, session đã CHECK_IN.

---

## Scenario 1 — Happy path: xe hỏng, khách đồng ý ngay

```
1. Staff mở màn hình checkout của session đang ACTIVE
2. Staff chụp 4 ảnh check-out (FRONT, BACK, LEFT, RIGHT)
3. Staff tích "Phát hiện hư hỏng"
4. Staff thêm 2 hạng mục:
   - Hạng mục 1: Bánh xe & lốp, parts_price=150,000, labor_price=50,000
   - Hạng mục 2: Vỏ nhựa (shell), parts_price=80,000, labor_price=0
5. Tổng hiển thị = 280,000 VNĐ
6. Staff bấm "Lưu biên bản"
   → POST /v1/staff/sessions/:id/inspections với damageLineItems
   → Session → CHECKING_OUT
7. Màn hình tổng kết hiển thị: ảnh so sánh + breakdown 2 hạng mục + tổng 280,000
8. Staff quay màn hình cho khách xem
9. Khách đồng ý → Staff bấm "Xác nhận & Quyết toán"
   → POST /v1/staff/sessions/:id/confirm-checkout
   → settleSessionCheckoutBilling chạy
   → damageCharge = 280,000
   → Nếu security_deposit = 300,000: deposit consumed = 280,000, refund = 20,000
   → DAMAGE_CHARGE component DISBURSED (covered by deposit)
   → Session → COMPLETED

Kiểm tra:
✓ Session status = COMPLETED
✓ damage_line_items có 2 records với đúng giá
✓ PaymentComponent DAMAGE_CHARGE amount = 280,000 status = DISBURSED
✓ PaymentComponent SECURITY_DEPOSIT status = PENDING_REFUND, refundedAmount = 20,000
```

---

## Scenario 2 — Tổng đền bù vượt ký quỹ

```
Setup: security_deposit = 200,000

1-6. (Như Scenario 1 nhưng tổng damage = 350,000)
7. Màn hình tổng kết: breakdown + tổng 350,000
8. Staff bấm "Xác nhận & Quyết toán"
   → damageCharge = 350,000
   → depositConsumedByDamage = 200,000 (hết deposit)
   → damageExceedingDeposit = 150,000
   → DAMAGE_CHARGE component amount = 150,000 status = PENDING (thu thêm tại quầy)
   → SECURITY_DEPOSIT status = DISBURSED

Kiểm tra:
✓ DAMAGE_CHARGE component = 150,000, status = PENDING
✓ Staff thấy "Khách cần trả thêm 150,000 tại quầy"
✓ Staff gọi settle-pending-payments sau khi thu tiền
```

---

## Scenario 3 — Hạng mục "Khác"

```
1. Staff thêm hạng mục, chọn "Khác"
2. Ô "Tên hư hỏng" xuất hiện
3. Staff KHÔNG nhập tên → Bấm "Lưu biên bản" → form báo lỗi "Vui lòng nhập tên hư hỏng"
4. Staff nhập "Ăng-ten gãy", parts_price=30,000, labor_price=20,000
5. Bấm "Lưu biên bản" → lưu thành công

Kiểm tra:
✓ DamageLineItem có part_type=OTHER, custom_part_name="Ăng-ten gãy"
✓ Tổng cập nhật ngay khi nhập giá
```

---

## Scenario 4 — Khách tranh chấp, staff điều chỉnh, khách đồng ý

```
1-7. (Như Scenario 1 — màn hình tổng kết đang hiển thị)
8. Khách không đồng ý hạng mục bánh xe
9. Staff bấm "Có tranh chấp" → quay lại form chỉnh sửa
10. Staff xoá hạng mục bánh xe (200,000)
11. Staff thêm lại với giá thấp hơn: parts_price=100,000, labor_price=30,000
12. Tổng mới = 210,000
    → PUT /v1/staff/sessions/:id/inspections/:inspId/damage-items
    → Items cũ soft-deleted, items mới tạo
13. Màn hình tổng kết cập nhật: 210,000
14. Khách đồng ý → Staff bấm "Xác nhận & Quyết toán"

Kiểm tra:
✓ Items cũ có deleted_at != null
✓ Items mới được tạo
✓ DAMAGE_CHARGE tính theo tổng mới = 210,000
```

---

## Scenario 5 — Staff vô tình thoát màn hình tổng kết

```
1-6. (Staff đã lưu biên bản, session đang CHECKING_OUT)
7. Staff thoát app / thiết bị khóa màn hình
8. Staff mở lại → Vào trang chi tiết session :sessionId
9. Session ở CHECKING_OUT → hiển thị nút "Xem lại biên bản"
10. Staff bấm → Điều hướng tới /staff/sessions/:id/checkout-summary
11. Tổng kết hiển thị đầy đủ như trước

Kiểm tra:
✓ Session vẫn CHECKING_OUT
✓ damage_line_items vẫn còn nguyên
✓ Màn hình tổng kết load đúng dữ liệu
```

---

## Scenario 6 — Xe không bị hỏng

```
1. Staff mở màn hình checkout
2. Staff KHÔNG tích "Phát hiện hư hỏng"
3. Bấm "Lưu biên bản"
   → POST /v1/staff/sessions/:id/inspections, damageFlagged=false, damageLineItems=[]
   → inspection.damageNoted = false
4. Màn hình tổng kết: không có section hư hỏng, chỉ có ảnh + "Xác nhận & Quyết toán"
5. Staff bấm "Xác nhận & Quyết toán"
   → settleSessionCheckoutBilling chạy, damageCharge = 0
   → SECURITY_DEPOSIT → PENDING_REFUND, refundedAmount = toàn bộ

Kiểm tra:
✓ damage_line_items count = 0 cho inspection này
✓ Không có DAMAGE_CHARGE component
✓ Deposit được hoàn toàn bộ
```

---

## Scenario 7 — BYOC booking (không áp dụng form hư hỏng)

```
1. Staff checkout một session BYOC
2. Form không hiển thị checkbox "Phát hiện hư hỏng" và không có damage section
3. Checkout tiến hành bình thường

Kiểm tra:
✓ Không có damageLineItems trong request body
✓ Không có DamageLineItem records
```

---

## Scenario 8 — Provider xem lịch sử đền bù

```
1. Provider đăng nhập, vào chi tiết booking đã COMPLETED có hư hỏng
2. Thấy section "Đền bù hư hỏng":
   - Hạng mục 1: Bánh xe & lốp — 150,000 + 50,000 = 200,000
   - Hạng mục 2: Vỏ nhựa — 80,000 + 0 = 80,000
   - Tổng: 280,000
   - Trạng thái: Đã thu (qua ký quỹ)

Kiểm tra:
✓ API trả về damageLineItems trong booking detail
✓ Tổng đền bù hiển thị đúng
✓ Trạng thái (đã thu / vượt ký quỹ / tranh chấp) hiển thị đúng
```

---

## Unit test checklist (BE)

- [ ] `SUM(damage_line_items)` = đúng với 0 items, 1 item, N items
- [ ] Fallback về `damageCostEstimate × 1.5` khi không có line items (legacy records)
- [ ] `damageCharge ≤ deposit`: DAMAGE_CHARGE = DISBURSED, SECURITY_DEPOSIT = PENDING_REFUND
- [ ] `damageCharge > deposit`: DAMAGE_CHARGE = PENDING, SECURITY_DEPOSIT = DISBURSED
- [ ] `damageCharge = 0`: không tạo DAMAGE_CHARGE component
- [ ] `confirm-checkout` với session không ở CHECKING_OUT → lỗi `SESSION_NOT_CHECKING_OUT`
- [ ] `confirm-checkout` với inspectionId đã confirmed → lỗi `ALREADY_CONFIRMED`
- [ ] Validation `partType = OTHER` mà không có `customPartName` → reject
- [ ] Validation `partsPrice < 0` → reject
- [ ] `updateDamageItems` soft-delete items cũ và tạo mới đúng
