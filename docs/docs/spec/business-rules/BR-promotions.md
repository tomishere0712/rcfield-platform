# BR-Promotions — Quy tắc nghiệp vụ: Mã giảm giá

**Last updated**: 2026-05-16  
**Status**: Active

---

## 1. Phạm vi áp dụng

**BR-PR-001** — Scope của mã giảm giá  
Mỗi promotion có `cafe_id`:

```
cafe_id IS NULL  →  Global: áp dụng toàn chuỗi, tất cả chi nhánh
cafe_id = X      →  Local: chỉ áp dụng tại chi nhánh X
```

Khi customer nhập mã tại chi nhánh Y:
- Nếu `promotion.cafe_id IS NULL` → hợp lệ
- Nếu `promotion.cafe_id = Y` → hợp lệ
- Nếu `promotion.cafe_id ≠ Y` → từ chối, báo lỗi "Mã không áp dụng tại chi nhánh này"

**BR-PR-002** — Ai được tạo mã  

| Role | Quyền tạo |
|------|-----------|
| ADMIN | Global (`cafe_id = NULL`) hoặc bất kỳ chi nhánh |
| PROVIDER | Global (`cafe_id = NULL`) hoặc bất kỳ chi nhánh của chuỗi |
| STAFF | Phase 1 chỉ khi provider/admin cấp quyền theo account policy; assignment chi tiết là Phase 2 |
| CUSTOMER | Không được tạo |

---

## 2. Validation khi áp mã

**BR-PR-003** — Thứ tự validate (fail nhanh — dừng ngay lỗi đầu tiên)

```
1. Code tồn tại trong DB
2. is_active = true
3. starts_at ≤ now() ≤ expires_at  (nếu expires_at IS NULL thì bỏ qua bước này)
4. cafe_id IS NULL  HOẶC  cafe_id = booking.cafe_id
5. applicable_to = 'ALL'  HOẶC  applicable_to = booking.play_mode (RENTAL/BYOC/MIXED)
6. booking_subtotal ≥ min_order_amount  (nếu min_order_amount IS NOT NULL)
7. uses_count < max_uses  (nếu max_uses IS NOT NULL)  ← check với SELECT FOR UPDATE để tránh race
8. Số lần user đã dùng mã này < max_uses_per_user
```

`booking_subtotal` = `slot_fee_total + rental_fee_total` (không tính deposit)

---

## 3. Tính discount_amount

**BR-PR-004** — Công thức tính giảm giá

```
IF discount_type = 'PERCENT':
    raw_discount = booking_subtotal × (discount_value / 100)
    discount_amount = MIN(raw_discount, max_discount_amount)   ← nếu max_discount_amount IS NULL thì không cap
    
IF discount_type = 'FIXED':
    discount_amount = MIN(discount_value, booking_subtotal)    ← không giảm quá tổng đơn
```

**BR-PR-005** — Những gì KHÔNG được discount  
Mã giảm giá chỉ áp lên `slot_fee` và `rental_fee`. Không áp lên `fnb_preorder`,
`contest_entry_fee`, phí gia hạn hay tiền hư hỏng.

> Bản trước ghi "`security_deposit` không bị ảnh hưởng". Hệ thống đã bỏ cọc, quy
> tắc đó không còn đối tượng để áp dụng.

---

## 4. Áp mã vào booking

**BR-PR-006** — Thời điểm lock usage  
Mã được lock tại thời điểm tạo booking (status = PENDING):

```
BEGIN TRANSACTION;
  UPDATE promotions
     SET uses_count = uses_count + 1
   WHERE id = :promoId
     AND (max_uses IS NULL OR uses_count < max_uses)
     AND is_active = true
     AND (expires_at IS NULL OR expires_at > now())
  RETURNING id;                     ← 0 rows = mã đã hết lượt, rollback + báo lỗi

  INSERT INTO promotion_usages (promotion_id, booking_id, user_id, discount_amount)
  VALUES (:promoId, :bookingId, :userId, :discountAmount);
COMMIT;
```

**BR-PR-007** — Rollback khi booking bị huỷ trước khi thanh toán  
IF: Booking bị auto-cancel do hết 30 phút payment window (status PENDING → CANCELLED)  
THEN: Cron job xử lý (không dùng Redis — promo rollback là DB operation):
```
UPDATE promotions SET uses_count = uses_count - 1 WHERE id = :promoId;
DELETE FROM promotion_usages WHERE booking_id = :bookingId;
```
NOTE: Redis TTL chỉ giải phóng slot (availability). Promo rollback do cron đảm nhiệm sau đó.

**BR-PR-008** — 1 booking chỉ dùng 1 mã  
`promotion_usages.booking_id` có UNIQUE constraint — không thể áp 2 mã cho 1 booking.

---

## 5. Ảnh hưởng đến Platform Fee

**BR-PR-009** — Platform fee tính trên số tiền sau discount  

```
subtotal        = slot_fee_total + rental_fee_total
discount_amount = tính theo BR-PR-004
total_charge    = subtotal - discount_amount

Khi COMPLETED:
  platform_fee = 0
```

Provider nhận trọn số tiền khách trả. Nền tảng không trừ phần trăm nào, và cũng
không bù phần discount thay Provider — mã giảm giá do Provider tự chịu.

---

## 6. Snapshot

**BR-PR-010** — Promo phải được ghi vào snapshot tại thời điểm tạo booking  

```json
{
  "slot_fee_rate": 150000,
  "rental_fee": 100000,
  "platform_fee_pct": 0,
  "track_type": "DRIFT",
  "slot_count": 2,
  "promo": {
    "code": "SUMMER20",
    "discount_type": "PERCENT",
    "discount_value": 20,
    "max_discount_amount": 100000
  },
  "calculated": {
    "slot_fee_total": 300000,
    "rental_fee_total": 100000,
    "subtotal": 400000,
    "discount_amount": 80000,
    "total_charge": 320000
  }
}
```

Mọi tính toán hoàn tiền sau này đều đọc từ `snapshot.calculated` — không recompute từ promo hiện tại.

**Nếu không có promo:**

```json
{
  "promo": null,
  "calculated": {
    "subtotal": 400000,
    "discount_amount": 0,
    "total_charge": 400000
  }
}
```

---

## 7. Hoàn tiền khi có discount

**BR-PR-011** — Hoàn tiền tính trên `total_charge`, không phải `subtotal`

Ví dụ: customer đặt 400k, giảm 80k, trả 320k. Huỷ trước 24h:

```
Hoàn SLOT_FEE: 100% của slot_fee_portion_in_total_charge
```

Cụ thể, proportion được giữ nguyên:

```
slot_fee_ratio   = slot_fee_total / subtotal            = 300k/400k = 75%
rental_fee_ratio = rental_fee_total / subtotal          = 100k/400k = 25%

slot_fee_charged   = total_charge × slot_fee_ratio      = 320k × 75% = 240k
rental_fee_charged = total_charge × rental_fee_ratio    = 320k × 25% = 80k

Huỷ > 24h → hoàn 100% slot_fee_charged + 100% rental_fee_charged = 320k
```

NOTE: Tiền discount không "hoàn" vì chưa bao giờ thu — chỉ hoàn những gì thực tế đã charge.
