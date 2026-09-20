# BR-Payment — Quy tắc nghiệp vụ: Thanh toán

**Last updated**: 2026-05-15
**Status**: Active

> **THAY ĐỔI:** Settlement giờ trigger bởi `session.COMPLETED` (không phải `booking.COMPLETED`).
> Mỗi session settle riêng. Booking chỉ xác nhận đã thanh toán xong khi tất cả sessions settled.
> Multi-vehicle: mỗi xe có RENTAL_FEE riêng. Hệ thống KHÔNG còn thu cọc.

## 1. Nguyên tắc cốt lõi

**BR-PM-001** — Snapshot-first  
Mọi tính toán tiền đều đọc từ `booking.snapshot` — KHÔNG dùng giá hiện tại của Cafe hoặc Vehicle

**BR-PM-002** — Immutable ledger  
Không được update `amount` của PaymentComponent đã tạo. Nếu cần điều chỉnh → tạo component mới

**BR-PM-003** — Component isolation  
Mỗi PaymentComponent có vòng đời độc lập (PENDING → HELD → DISBURSED / REFUNDED)

---

## 2. Tạo components

**BR-PM-004** — Components khi booking CONFIRMED  
IF: Booking chuyển sang CONFIRMED (thanh toán thành công)  
THEN: Tạo các components sau:
- `SLOT_FEE` (HELD) — luôn tạo
- `RENTAL_FEE` (HELD) — tạo cho mỗi xe thuê trong `booking_vehicles`
- `FNB_PREORDER` (HELD) — nếu có đặt trước đồ ăn
- `CONTEST_ENTRY_FEE` (HELD) — nếu booking gắn với đăng ký giải
- `PROMOTION_DISCOUNT` (số âm) — nếu áp mã giảm giá

KHÔNG tạo `SECURITY_DEPOSIT`: hệ thống đã bỏ cọc.

**BR-PM-004a** — FB_PREORDER component
IF: Booking có F&B pre-order
THEN: Tạo `FB_PREORDER` (HELD) component, gộp vào 1 lần thanh toán

**BR-PM-005** — Extension fee component  
IF: Extension được approve (theo session)  
THEN: Tạo `EXTENSION_FEE` (PENDING), liên kết `session_id`, thu ở checkout. Không có trần cộng dồn — xem BR-EX-004.

**BR-PM-006** — Damage charge component  
IF: Check-out có damage và staff ghi nhận hạng mục hư hỏng  
THEN: Tạo `DAMAGE_CHARGE` (HELD → DISBURSED)

---

## 3. Settlement khi COMPLETED

**BR-PM-007** — Disburse về Provider (khi session COMPLETED)
Khi session COMPLETED, disburse các components sau về Provider cho session đó:
- `SLOT_FEE` (toàn bộ hoặc pro-rata nếu early checkout)
- `RENTAL_FEE` (từng xe)
- `EXTENSION_FEE`
- `DAMAGE_CHARGE` (nếu có)

**BR-PM-008** — Thu phần phát sinh (khi session COMPLETED)
Khi session COMPLETED, thu nốt các component còn `PENDING`:
`EXTENSION_FEE`, `FNB_ON_SITE`, `DAMAGE_CHARGE`.
Không có cọc để hoàn.

**BR-PM-009** — Platform fee  
```
platform_fee = 0
```
Nền tảng **không** thu phần trăm trên bất kỳ khoản nào của booking.
`platform_fee_pct` đặt cứng bằng `0` trong `payment.service.ts` (dòng 574, 1650).
Doanh thu nền tảng là phí thuê bao SaaS và phí tổ chức giải của Provider.

---

## 4. Refund rules

**BR-PM-010** — R1: Customer huỷ (theo thời điểm)

| Thời điểm huỷ | SLOT_FEE | RENTAL_FEE | F&B pre-order |
|---------------|----------|-----------|---------|
| > 24h trước slot_start | 100% | 100% | 100% |
| 12–24h trước slot_start | 50% | 100% | 100% |
| < 12h trước slot_start | 0% | 100% | 100% |
| Sau CHECK_IN (early checkout) | Pro-rata | 0% | 0% |

Nguồn: `payment.service.ts:255-271`.

**Pro-rata formula (early checkout):**
```
refund_slot_fee = slot_fee_total × (remaining_minutes / total_booked_minutes)
```

**BR-PM-011** — R2: Provider huỷ  
IF: Provider huỷ booking  
THEN: Hoàn 100% tất cả components. Platform KHÔNG thu phí.

**BR-PM-012** — R3: Timeout / No-show  
IF: Customer no-show (không check-in trong 30 phút sau slot_start)  
THEN:
- SLOT_FEE: hoàn 0%
- RENTAL_FEE: hoàn 100%
- F&B pre-order: hoàn 100%

---

## 5. Damage charge

**BR-PM-013** — Công thức tính damage  
```
damage_charge = Σ (parts_price + labor_price) của damage_line_items
```
Cộng thẳng từ danh sách hạng mục hư hỏng staff nhập ở inspection CHECK_OUT
(`staff.service.ts:3696`). **Không** nhân `damage_multiplier` — cột đó tồn tại
nhưng chưa vào công thức nào.

**BR-PM-014** — Không bù trừ vào cọc  
Không có cọc để trừ. Toàn bộ `damage_charge` là khoản thu thêm ở checkout,
khách trả cùng lúc với phí gia hạn và đồ ăn tại quán.

**BR-PM-016** — Pre-existing damage không tính  
IF: Hư hỏng đã được flag ở check-in (`pre_existing_flag = true`) VÀ customer đã confirm  
THEN: KHÔNG tính `damage_charge` cho hư hỏng đó

---

## 6. F&B payment

**BR-PM-017** — F&B pre-order: gộp 1 transaction  
IF: Customer đặt F&B pre-order khi booking  
THEN: Thanh toán F&B pre-order gộp cùng booking fee vào 1 lần qua gateway

**BR-PM-018** — F&B on-site: vào hoá đơn checkout  
IF: Staff ghi F&B order tại quán  
THEN: Tạo component `FNB_ON_SITE` (`staff.service.ts:2336`), thu cùng lúc với phí
gia hạn và tiền hư hỏng ở checkout.

> Bản trước ghi khoản này "ngoài platform, khách trả thẳng Provider". Không đúng
> với mã hiện tại: nó đi qua đúng ledger như mọi component khác. Nền tảng vẫn
> không thu phần trăm nào trên đó.
