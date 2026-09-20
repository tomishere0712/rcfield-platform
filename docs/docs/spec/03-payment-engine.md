# 03 — Payment Engine

**Last updated**: 2026-05-15
**Status**: Active

> ⚠️ CRITICAL SPEC. Đọc toàn bộ trước khi viết bất kỳ dòng code nào liên quan đến tiền.
> Viết unit test cho mọi rule trước khi implement.

---

## Nguyên tắc cốt lõi

1. **Snapshot-first**: Mọi tính toán dùng `booking.snapshot`, không dùng giá hiện tại
2. **Component isolation**: Mỗi PaymentComponent có vòng đời độc lập
3. **Immutable ledger**: Không update amount đã tạo — tạo component mới nếu cần điều chỉnh
4. **Không thu phí nền tảng trên booking**: `platform_fee_pct` đặt cứng bằng `0`. Doanh thu nền tảng đến từ phí thuê bao SaaS của Provider. Tiền booking về thẳng Provider.
5. **Race condition**: Dùng DB transaction + row lock khi update component status
6. **Settlement theo session**: Không phải booking — mỗi session khi COMPLETED sẽ trigger settle riêng

---

## Components & Lifecycle

### Luồng thanh toán

> **KHÔNG CÓ CỌC.** Nền tảng đã bỏ security deposit khỏi mọi luồng thanh toán.
> `PaymentComponentType.SECURITY_DEPOSIT` vẫn còn trong enum và logic hoàn cọc
> vẫn xử lý được các bản ghi cũ, nhưng không code nào tạo component này nữa —
> xem `payment.service.ts:527` ("Vehicle deposits are no longer a chargeable
> part of any booking payment"). Không tồn tại cột `market_value` ở đâu cả.

```
Bước 1 — Khách trả trước MỘT lần để booking được CONFIRMED:
  → SLOT_FEE           (HELD)
  → RENTAL_FEE         (HELD) per vehicle
  → FNB_PREORDER       (HELD)
  → CONTEST_ENTRY_FEE  (HELD)  ← chỉ khi booking gắn với đăng ký giải
  → PROMOTION_DISCOUNT (số âm)  ← chỉ khi áp mã giảm giá

  Toàn bộ khoản trên gộp thành một giao dịch VNPay hoặc một mã VietQR
  chuyển khoản. Component tạo với status HELD ngay khi thanh toán thành công.

Phát sinh trong phiên chơi:
  → EXTENSION_FEE  khi đề xuất gia hạn được duyệt   (staff.service.ts:2277)
  → FNB_ON_SITE    khi khách gọi thêm đồ tại quán   (staff.service.ts:2336)

Phát sinh lúc check-out:
  → DAMAGE_CHARGE  khi staff ghi nhận hư hỏng mới   (staff.service.ts:3628)

Bước 2 — Khi SESSION COMPLETED (checkout):
  Thu nốt các component còn PENDING (gia hạn, đồ ăn tại quán, hư hỏng).
  Chuyển các component sang DISBURSED về Provider.
  Không trừ phí nền tảng — platform_fee_pct = 0.
```

**Ví dụ số (không damage, có extension):**
```
total_charges   = 50 + 300 + 75 + 60 = 485k
checkout_amount = 485k − 300k cọc = 185k   ← khách chỉ phải trả thêm 185k
Khách đã trả:   300k (cọc) + 185k (checkout) = 485k ✓
```

**Ví dụ số (có damage 300k):**
```
total_charges   = 485k + 300k damage = 785k
checkout_amount = 785k − 300k cọc = 485k
Khách đã trả:   300k (cọc) + 485k (checkout) = 785k ✓
```

### Lưu ý multi-vehicle

```
Mỗi xe thuê trong booking_vehicles tạo một cặp RENTAL_FEE + SECURITY_DEPOSIT riêng.
Khi settle, deposit được refund/full cho tất cả xe không damage.
Chỉ xe bị damage mới bị trừ deposit tương ứng.
```

---

## Refund Rules

### R1 — Customer huỷ booking

> SLOT_FEE và RENTAL_FEE chưa được charge (PENDING) — "không hoàn" = không charge; "charge" = tạo payment mới.
> DEPOSIT đã HELD — "void" = release hold (không phải refund transaction).

| Thời điểm huỷ | SLOT_FEE | RENTAL_FEE | DEPOSIT |
|---------------|----------|------------|---------|
| > 24h trước slot_start | Không charge (CANCELLED) | Không charge | VOID (released) |
| 12–24h trước slot_start | Charge 50% (phạt) | Không charge | VOID (released) |
| < 12h trước slot_start | Charge 100% (phạt) | Không charge | VOID (released) |
| Sau CHECK_IN (early checkout) | Charge pro-rata theo giờ thực chơi | Charge 100% (đã dùng xe) | VOID sau damage check |

**Pro-rata formula (early checkout):**
```
refund_slot_fee = slot_fee_total × (remaining_minutes / total_booked_minutes)
```

### R2 — Provider huỷ booking

Hoàn 100% tất cả components. Platform KHÔNG thu phí.

### R3 — Timeout / No-show

```
Nếu customer no-show (không đến sau slot_start + 30 phút):
  → SLOT_FEE:        charge 100% (phạt no-show) → txn: PAYMENT slot_fee → DISBURSED Provider
  → RENTAL_FEE:      CANCELLED (xe chưa dùng, không charge)
  → SECURITY_DEPOSIT: VOID (hold released, không charge)
  → FNB_PREORDER:    CANCELLED (không charge)
```

---

## Extension Fee

Không có trần phí gia hạn. Bản trước mô tả `max_extension_fee = security_deposit × 0.50`,
nhưng không tồn tại cọc và cũng không có đoạn kiểm tra trần nào trong mã nguồn.

Mỗi đề xuất gia hạn được duyệt sinh một component `EXTENSION_FEE`
(`staff.service.ts:2277`), thu ở checkout. Giới hạn thực tế đến từ khung giờ hoạt
động của chi nhánh và sức chứa đường đua, không phải từ một con số trần.

Đề xuất gia hạn hết hạn sau **10 phút** nếu khách không phản hồi.

---

## Damage Charge Calculation

```
damage_charge = Σ (parts_price + labor_price) của damage_line_items
                thuộc inspection CHECK_OUT có damage_noted = true
```

Xem `staff.service.ts:3696`. Số tiền cộng thẳng từ danh sách hạng mục hư hỏng do
staff nhập, **không nhân** `damage_multiplier`.

> `vehicle_catalogs.damage_multiplier` và `booking_vehicles.damage_multiplier_snapshot`
> vẫn tồn tại nhưng chưa được dùng vào công thức nào.

Không có cọc để bù trừ: toàn bộ `damage_charge` là khoản thu thêm ở checkout.

**pre_existing_flag ảnh hưởng:**
- Nếu hư hỏng đã được flag ở check-in + customer đã confirm → KHÔNG tính damage_charge cho hư hỏng đó
- Nếu staff không hoàn thành inspection protocol (thiếu ảnh / checklist) → flag không có giá trị

---

## Discount (Mã giảm giá)

> Chi tiết validation và tạo mã: xem `business-rules/BR-promotions.md`

```
subtotal        = slot_fee_total + rental_fee_total
discount_amount = tính từ promotion (PERCENT hoặc FIXED, xem BR-PR-004)
total_charge    = subtotal - discount_amount    ← số tiền customer thực sự trả
```

```
prepaid_amount = slot_fee + rental_fee + fnb_preorder + contest_entry_fee
                 − discount_amount        ← khách trả một lần khi xác nhận booking

checkout_amount = extension_fee + fnb_on_site + damage_charge
                                          ← thu thêm ở checkout, nếu có phát sinh
```

---

## Platform Fee

**Bằng 0.** `platform_fee_pct` đặt cứng bằng `0` trong `payment.service.ts`
(dòng 574 và 1650). Không có khoản nào bị trừ khỏi tiền của Provider.

Doanh thu nền tảng là **phí thuê bao SaaS** mà Provider trả theo gói
(`subscription_plans` / `provider_subscriptions`), cộng phí tổ chức giải
(`contest_fee_plans`). Không phải phần trăm trên booking.

> Bản trước ghi `platform_fee = 0.15 × disbursed_components`. Con số 15% đó chưa
> bao giờ được cài đặt và mâu thuẫn với mô hình doanh thu SaaS.

---

## Security Deposit — ĐÃ BỎ

Nền tảng không còn thu cọc. Không có cột `market_value` ở bất kỳ bảng nào, và
không đoạn mã nào tạo component `SECURITY_DEPOSIT`.

Dấu vết còn lại, giữ để đọc được dữ liệu cũ:

| Thứ còn lại | Trạng thái |
|---|---|
| `PaymentComponentType.SECURITY_DEPOSIT` | còn trong enum, không nơi nào tạo |
| `booking_vehicles.security_deposit_snapshot` | còn cột; 15/17 dòng bằng `0.00` |
| `vehicle_catalogs.security_deposit` | còn cột, không vào công thức nào |
| Logic hoàn cọc trong `payment.service.ts` | còn, chỉ để xử lý bản ghi cũ |

Nguồn: `payment.service.ts:527` — *"Vehicle deposits are no longer a chargeable
part of any booking payment"*, và `:232` — *"There is no vehicle deposit."*

---

## Ví dụ số thực tế

**Setup:**
- Slot 2 tiếng, `slot_fee = 50,000đ`
- RENTAL một xe, `rental_fee = 300,000đ` (150k/h × 2h)
- Đặt trước đồ ăn `fnb_preorder = 40,000đ`

**Case 1: Hoàn thành bình thường, không hư hỏng**
```
Trả trước khi xác nhận booking:
  50,000 + 300,000 + 40,000 = 390,000đ

Checkout: không phát sinh gì → khách trả thêm 0đ
Khách trả tổng:        390,000đ
Provider nhận:         390,000đ   ← không trừ phí nền tảng
```

**Case 2: Có gia hạn và gọi thêm đồ tại quán**
```
Trả trước:             390,000đ
Gia hạn 1 tiếng:       EXTENSION_FEE   = 150,000đ
Gọi thêm tại quán:     FNB_ON_SITE     =  60,000đ

Thu thêm ở checkout:   210,000đ
Khách trả tổng:        600,000đ
Provider nhận:         600,000đ
```

**Case 3: Có hư hỏng ghi nhận lúc check-out**
```
Trả trước:             390,000đ
damage_line_items:     vỏ trước (parts 180,000 + labor 20,000) = 200,000đ
                       → DAMAGE_CHARGE = 200,000đ

Thu thêm ở checkout:   200,000đ
Khách trả tổng:        590,000đ
Provider nhận:         590,000đ
```

> Không ví dụ nào có dòng "cọc" hay "phí nền tảng" — hai khoản đó không tồn tại
> trong hệ thống hiện tại.

---

## Implementation Checklist

- [ ] `BookingSnapshot` type đầy đủ, immutable sau khi tạo
- [ ] `PaymentComponentService` — tạo, hold, disburse, refund (từng method riêng)
- [ ] Unit test R1 (3 time windows + pro-rata)
- [ ] Unit test R2, R3
- [ ] Unit test extension fee cap
- [ ] Unit test damage charge (≤ deposit và > deposit)
- [ ] Unit test platform fee calculation
- [ ] Integration test: full booking lifecycle với payment
- [ ] DB transaction + row lock khi concurrent updates

---

## Thanh toán chuyển khoản theo chi nhánh (feature 019)

Chi nhánh có thể nhận tiền booking thẳng vào tài khoản ngân hàng của mình thay vì
đi qua cổng thanh toán chung. Khách quét mã QR, và **đơn tự xác nhận khi dịch vụ
đối soát báo tiền về** — không ai bấm gì.

### Ranh giới với luồng hiện tại

Luồng VNPay **không đổi một dòng nào**. `createCheckoutUrl` vốn đã nhận cổng làm
tham số với mặc định `'vnpay'`, nên "chi nhánh chưa cấu hình thì dùng cổng chung"
đúng nghĩa là không truyền gì.

### Không tạo component mới

`bank_transactions` **không phải** `PaymentComponent` và danh sách
`PaymentComponentType` không thêm giá trị nào. Nó ghi lại **bằng chứng tiền đã về
tài khoản ngân hàng**, đứng trước và độc lập với việc hệ thống ghi nhận doanh thu.

Component vẫn do `createPaymentComponents` sinh ra khi booking được xác nhận, y
hệt luồng VNPay. Một giao dịch `NEEDS_REVIEW` có tiền thật nằm trong tài khoản
nhưng không sinh component nào — đúng như vậy, vì chưa có dịch vụ nào được bán.

### Một đường xác nhận duy nhất

Webhook gọi lại `processConfirmationResult` — cùng hàm luồng VNPay dùng. Nghĩa là
guard hết hạn giữ chỗ, kiểm số tiền, chống trùng và `transition()` đều áp dụng y
hệt, không có nhánh song song nào để lệch nhau.

⚠️ **Không dùng `processMockConfirmation`** cho đường này. Hàm đó là lối tắt cho
môi trường dev: nó thiếu cả kiểm số tiền lẫn guard hết hạn giữ chỗ.

### Tiền về sau khi hết hạn giữ chỗ

Hệ thống **không bao giờ tự xác nhận lại**, kể cả khi chỗ vẫn còn trống. Giao dịch
treo ở `NEEDS_REVIEW` và người vận hành quyết định giữ chỗ lại hay hoàn tiền. Đây
là khác biệt cốt lõi so với cổng thanh toán: chuyển khoản là hành động một chiều
của khách, tiền đã đi thì hệ thống không tự lấy lại được.

### Nền tảng không thu hộ

Tiền chuyển thẳng vào tài khoản chủ doanh nghiệp. Nền tảng không giữ tiền và không
cắt phần trăm — nhất quán với mô hình doanh thu là phí thuê phần mềm.
