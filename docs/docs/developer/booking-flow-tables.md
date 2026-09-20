# Booking Flow — Các bảng tham gia và ý nghĩa

> Trace từ source code: `booking.service.ts`, `payment.service.ts`, `staff.service.ts` và các entity tương ứng.

---

## Tổng quan luồng

```
[1] Customer tạo booking
        │
        ▼
[2] Thanh toán qua VNPay (IPN callback)
        │
        ▼
[3] Staff check-in → tạo Session
        │
        ▼
[4] Inspection: staff chụp ảnh & ghi nhận tình trạng xe
        │
        ▼
[5] Customer xác nhận inspection
        │
        ▼
[6] Session diễn ra (chơi xe)
        │
        ▼
[7] Staff checkout → tính tiền thực tế → giải phóng xe
        │
        ▼
[8] Thanh toán bổ sung (damage / extension) qua VNPay lần 2
        │
        ▼
[9] Hoàn tiền đặt cọc / Giải ngân cho Provider
```

---

## Giai đoạn 1 — Tạo Booking

### `bookings`
Bảng trung tâm của toàn bộ luồng. Mỗi đơn đặt lịch tạo ra 1 row.

| Cột quan trọng | Ý nghĩa |
|----------------|---------|
| `customer_id` | Ai đặt |
| `cafe_id` | Chi nhánh nào |
| `play_mode` | `RENTAL` (thuê xe quán) hoặc `BYOC` (mang xe cá nhân) |
| `slot_start / slot_end` | Khung giờ đặt |
| `status` | `PENDING → CONFIRMED → COMPLETED / CANCELLED` |
| `snapshot` | JSON đóng băng giá tại thời điểm đặt (multiplier, track config, package_used, promotion) |
| `payment_expires_at` | Deadline thanh toán — quá hạn tự huỷ |
| `discount_amount` | Số tiền giảm từ promo code |
| `promotion_id` | FK đến `promotions` — promo code được áp dụng |
| `customer_package_id` | FK đến `customer_packages` — nếu dùng gói |

> **Tại sao có `snapshot`?** Giá slot có thể thay đổi theo giờ (dynamic pricing). `snapshot` đóng băng giá lúc đặt để checkout sau này không tính lại từ giá hiện tại.

---

### `booking_participants`
Ai sẽ tham gia buổi chơi — bao gồm người đặt (BOOKER) và người đi cùng (COMPANION / GUEST).

| Cột quan trọng | Ý nghĩa |
|----------------|---------|
| `booking_id` | FK đến `bookings` |
| `user_id` | Nếu là user có tài khoản |
| `participant_type` | `BOOKER` / `COMPANION` / `GUEST` |
| `is_primary_responsible` | Người chịu trách nhiệm chính (= BOOKER) |
| `guest_name / guest_phone` | Nếu là khách vãng lai (không có tài khoản) |

> **Tại sao cần bảng này?** Slot fee tính theo số người. Cần biết có bao nhiêu người để tính `slot_fee = rate × slot_count × player_count`.

---

### `booking_vehicles`
Xe nào được đặt trước cho booking này (chỉ có khi `play_mode = RENTAL`).

| Cột quan trọng | Ý nghĩa |
|----------------|---------|
| `booking_id` | FK đến `bookings` |
| `vehicle_id` | FK đến `vehicles` — xe cụ thể được chọn |
| `hourly_rate_snapshot` | Giá thuê/giờ lúc đặt (đóng băng) |
| `rental_fee_snapshot` | Phí thuê đã tính sẵn lúc đặt |
| `security_deposit_snapshot` | Tiền đặt cọc xe lúc đặt |
| `damage_multiplier_snapshot` | Hệ số tính phí hư hỏng theo tier xe |

> **Tại sao snapshot giá?** Giá xe có thể cập nhật bởi Provider. Snapshot đảm bảo customer trả đúng giá lúc họ đặt.

---

### `fnb_orders`
Đơn F&B pre-order kèm theo booking (customer đặt đồ ăn/uống trước).

| Cột quan trọng | Ý nghĩa |
|----------------|---------|
| `booking_id` | FK đến `bookings` |
| `order_type` | `PRE_ORDER` (đặt khi booking) hoặc `SESSION_ORDER` (gọi thêm tại quán) |
| `total_amount` | Tổng tiền đơn F&B |
| `status` | `PENDING → CONFIRMED → CANCELLED` |

---

### `fnb_order_items`
Chi tiết từng món trong đơn F&B.

| Cột quan trọng | Ý nghĩa |
|----------------|---------|
| `fnb_order_id` | FK đến `fnb_orders` |
| `menu_item_id` | FK đến `menu_items` |
| `quantity` | Số lượng |
| `unit_price` | Giá tại thời điểm đặt |
| `subtotal` | `unit_price × quantity` |

---

## Giai đoạn 2 — Thanh toán

### `payment_transactions`
Giao dịch thanh toán thực tế qua VNPay. 1 booking = 1 transaction.

| Cột quan trọng | Ý nghĩa |
|----------------|---------|
| `booking_id` | FK đến `bookings` (nullable — package purchase thì không có booking_id) |
| `customer_package_id` | FK đến `customer_packages` (nếu là mua gói) |
| `txn_ref` | Mã giao dịch gửi sang VNPay (unique) |
| `amount` | Số tiền thực tế charge |
| `status` | `PENDING → SUCCESS / FAILED` |
| `gateway` | `VNPAY` |
| `raw_request / raw_response` | JSON gốc từ VNPay — lưu để audit |

> **Tại sao lưu raw_request/response?** Khi có tranh chấp thanh toán, cần đối chiếu với dữ liệu VNPay gốc.

---

### `payment_components`
Breakdown chi tiết từng khoản trong booking. 1 booking có nhiều components.

| `type` | Ý nghĩa |
|--------|---------|
| `SLOT_FEE` | Tiền thuê sân |
| `RENTAL_FEE` | Tiền thuê xe |
| `SECURITY_DEPOSIT` | Tiền đặt cọc xe |
| `EXTENSION_FEE` | Phí gia hạn thêm giờ |
| `DAMAGE_CHARGE` | Phí bồi thường hư hỏng xe |
| `FNB_PREORDER` | Tiền F&B pre-order |
| `PACKAGE_PURCHASE` | Tiền mua gói slot |

| `status` | Ý nghĩa |
|---------|---------|
| `PENDING` | Chờ thanh toán |
| `HELD` | Đã thu (đang giữ — chưa giải ngân cho Provider) |
| `DISBURSED` | Đã giải ngân cho Provider |
| `PENDING_REFUND` | Hệ thống tính xong số hoàn, chờ Staff xác nhận |
| `REFUNDED` | Đã hoàn toàn bộ |
| `PARTIALLY_REFUNDED` | Hoàn một phần (trừ phí hư hỏng) |

> **Tại sao tách ra nhiều components thay vì 1 con số tổng?** Mỗi khoản có vòng đời riêng. Ví dụ: `SECURITY_DEPOSIT` bị HELD khi check-in, chỉ REFUNDED sau checkout nếu xe nguyên vẹn.

---

## Giai đoạn 3 — Check-in & Session

### `sessions`
Phiên chơi thực tế — chỉ được tạo khi Staff bấm check-in.

| Cột quan trọng | Ý nghĩa |
|----------------|---------|
| `booking_id` | FK đến `bookings` |
| `cafe_id` | Chi nhánh đang diễn ra |
| `status` | `CHECKED_IN → IN_PROGRESS → COMPLETED` |
| `checked_in_by` | Staff nào thực hiện check-in |
| `checked_out_by` | Staff nào thực hiện checkout |
| `actual_start_at` | Giờ thực tế bắt đầu (có thể khác slot_start) |
| `actual_end_at` | Giờ thực tế kết thúc |
| `planned_end_at` | Giờ dự kiến kết thúc (= slot_end hoặc sau gia hạn) |
| `actual_total_amount` | Cộng dồn trong lúc chơi: slot + F&B ON_SITE + extension. **Chưa có damage** — damage chỉ thêm vào lúc checkout |
| `notes` | JSONB — lúc checkout ghi `settlement` JSON với đầy đủ breakdown (extension, F&B, damage, deposit) |

> **Tại sao tách `sessions` khỏi `bookings`?** Booking là "ý định đặt lịch". Session là "thực tế diễn ra". Thời gian thực tế khác với slot đặt trước (check-in muộn, gia hạn...).

---

### `session_participants`
Copy từ `booking_participants` xuống khi check-in — ghi nhận ai thực sự có mặt.

| Cột quan trọng | Ý nghĩa |
|----------------|---------|
| `session_id` | FK đến `sessions` |
| `booking_participant_id` | FK gốc từ `booking_participants` |
| `checked_in_at` | Thời điểm xác nhận có mặt |
| `role` | `DRIVER` / `OBSERVER` |

---

### `session_vehicles`
Xe nào thực sự được dùng trong session — theo dõi trạng thái từng xe.

| Cột quan trọng | Ý nghĩa |
|----------------|---------|
| `session_id` | FK đến `sessions` |
| `booking_vehicle_id` | FK đến `booking_vehicles` (nếu từ booking) |
| `vehicle_source` | `BOOKING` (từ đặt trước) hoặc `WALK_IN` (cấp tại quán) |
| `vehicle_id` | Xe của quán |
| `customer_vehicle_id` | Xe của khách (BYOC) |
| `status` | `ASSIGNED → IN_USE → RETURNED / DAMAGED` |
| `started_at / returned_at` | Thời điểm bắt đầu và trả xe |

---

### `extension_proposals`
Đề xuất gia hạn giờ chơi — Staff đề xuất, Customer approve/reject.

| Cột quan trọng | Ý nghĩa |
|----------------|---------|
| `session_id` | FK đến `sessions` |
| `duration_minutes` | Gia hạn thêm bao nhiêu phút |
| `fee_amount` | Phí gia hạn tính sẵn |
| `status` | `PENDING → APPROVED / REJECTED / EXPIRED / CANCELLED` |
| `proposed_by` | Staff đề xuất |
| `responded_by` | Customer phản hồi |
| `responded_at` | Thời điểm Customer phản hồi |

> **Lưu ý về tiền**: `fee_amount` chỉ nằm ở đây trong lúc session đang chạy. Khi Staff bấm checkout, hệ thống mới đọc tất cả APPROVED proposals và tạo `EXTENSION_FEE` payment_component. Đồng thời `sessions.actual_total_amount` được cộng thêm ngay khi Customer approve.

---

### `fnb_orders` (ON_SITE — gọi thêm tại quán)
Cùng bảng `fnb_orders` nhưng `order_type = ON_SITE` thay vì `PRE_ORDER`.

| Điểm khác biệt | PRE_ORDER | ON_SITE |
|---------------|-----------|---------|
| Khi nào tạo | Lúc customer đặt booking | Lúc staff ghi order trong session |
| `booking_id` | Có | Nullable |
| `session_id` | NULL | FK đến `sessions` |
| Thanh toán | Gộp vào VNPay booking | Gộp vào counter bill lúc checkout |

> **Platform không thu phí F&B ON_SITE.** Tiền F&B tại quán được gộp vào `totalCounterBill` để Staff thu tại chỗ — không đi qua VNPay lần 2 trừ khi khách chọn thanh toán online.

---

## Giai đoạn 4 — Inspection

### `inspections`
Biên bản kiểm tra tình trạng xe trước/sau khi chơi. Đây là **bằng chứng pháp lý** tránh tranh chấp hư hỏng.

| Cột quan trọng | Ý nghĩa |
|----------------|---------|
| `session_id` | FK đến `sessions` |
| `session_vehicle_id` | FK đến `session_vehicles` — xe nào được inspect |
| `type` | `PRE_SESSION` (trước) hoặc `POST_SESSION` (sau) |
| `subject_type` | `RENTAL_VEHICLE` hoặc `BYOC_VEHICLE` |
| `performed_by` | Staff thực hiện inspect |
| `pre_existing_flag` | Hư hỏng đã có từ trước (không tính phí) |
| `damage_noted` | Có phát hiện hư hỏng không |
| `damage_description` | Mô tả hư hỏng |
| `damage_cost_estimate` | Số tiền bồi thường ước tính |
| `ai_analysis_json` | Kết quả AI phân tích ảnh (nếu có) |
| `customer_confirmed` | Customer đã xác nhận biên bản chưa |
| `customer_confirmed_at` | Thời điểm xác nhận |

> **Tại sao cần customer confirm?** Nếu xe bị hỏng nhưng customer không xác nhận, không thể tính phí. Customer confirm = đồng ý với kết quả inspection.

---

## Giai đoạn 5 — Checkout & Thanh toán bổ sung

### Khi Staff bấm checkout

Staff kết thúc session. Hệ thống tổng hợp các khoản phát sinh thực tế:

- **Phí gia hạn** (`EXTENSION_FEE`): nếu session chạy quá `planned_end_at`
- **Phí bồi thường hư hỏng** (`DAMAGE_CHARGE`): lấy từ `inspections.damage_cost_estimate` của POST_SESSION inspection

Nếu tổng phát sinh > 0, hệ thống tạo một giao dịch VNPay thứ hai.

---

### `payment_transactions` — giao dịch bổ sung

| Điểm đặc biệt | Ý nghĩa |
|---------------|---------|
| `txn_ref` bắt đầu bằng `ctr_` | Counter payment — phân biệt với giao dịch booking gốc khi IPN về |
| `amount` | Tổng các khoản phát sinh (extension + damage) |
| `status` | `PENDING → SUCCESS` sau khi IPN callback xác nhận |

> **Tại sao cần giao dịch thứ 2?** Giao dịch đầu (khi đặt) chỉ charge những khoản đã biết trước (slot, rental, deposit, FNB pre-order). Damage và extension chỉ xác định được tại checkout, nên phải tạo transaction riêng.

---

### `payment_components` — trạng thái sau checkout

Khi IPN callback xác nhận `ctr_` transaction thành công, hệ thống cập nhật các component:

| Component | Trạng thái mới | Giải thích |
|-----------|---------------|-----------|
| `SLOT_FEE` | `HELD → DISBURSED` | Phí sân đã thu, giải ngân cho Provider |
| `RENTAL_FEE` | `HELD → DISBURSED` | Phí thuê xe đã thu, giải ngân cho Provider |
| `FNB_PREORDER` | `HELD → DISBURSED` | F&B pre-order đã thu, giải ngân cho Provider |
| `EXTENSION_FEE` | `PENDING → DISBURSED` | Phí gia hạn vừa được thanh toán xong |
| `DAMAGE_CHARGE` | `PENDING → DISBURSED` | Phí bồi thường vừa được thanh toán xong |
| `SECURITY_DEPOSIT` | `HELD → PENDING_REFUND` | Đặt cọc chuyển sang chờ hoàn — chờ Staff xác nhận số hoàn |

---

### `sessions` — kết thúc session

| Cột | Cập nhật |
|-----|---------|
| `status` | `IN_PROGRESS → COMPLETED` |
| `actual_end_at` | Giờ thực tế Staff bấm checkout |
| `actual_total_amount` | Tổng tiền thực tế (slot + rental + extension + damage + FNB) |
| `checked_out_by` | Staff thực hiện checkout |

---

### `session_vehicles` — trả xe

| Cột | Cập nhật |
|-----|---------|
| `status` | `IN_USE → RETURNED` (bình thường) hoặc `DAMAGED` (nếu có damage) |
| `returned_at` | Thời điểm xe được trả |

---

## Giai đoạn 6 — Hoàn tiền đặt cọc & Giải ngân

### `payment_components` — hoàn cọc

Sau khi Staff xác nhận kết quả inspection POST_SESSION:

| Trường hợp | SECURITY_DEPOSIT chuyển sang |
|-----------|------------------------------|
| Xe nguyên vẹn | `PENDING_REFUND → REFUNDED` (hoàn 100%) |
| Xe bị hỏng (damage < deposit) | `PENDING_REFUND → PARTIALLY_REFUNDED` (hoàn phần còn lại) |
| Xe bị hỏng (damage ≥ deposit) | `PENDING_REFUND → REFUNDED` với `refunded_amount = 0` (cọc bù damage) |

---

### `payment_transactions` — giao dịch hoàn tiền

Khi `processRefund()` chạy:

| Cột quan trọng | Ý nghĩa |
|----------------|---------|
| `booking_id` | FK đến `bookings` |
| `amount` | Số tiền hoàn thực tế |
| `status` | `SUCCESS` ngay (không qua gateway) |
| `gateway` | `DIRECT` — hoàn ngoài hệ thống (chuyển khoản thủ công hoặc ví nội bộ) |
| `txn_ref` | Mã nội bộ (không gửi sang VNPay) |

> **Tại sao gateway = DIRECT?** VNPay refund API phức tạp và có phí. Hệ thống chỉ ghi nhận số tiền hoàn để audit; việc chuyển tiền thực tế do Admin/Provider thực hiện thủ công.

---

### Luồng `processRefund()` — chi tiết

```
Staff xác nhận hoàn cọc
        │
        ▼
Tính số tiền hoàn từng component (dựa trên snapshot, trừ damage_charge)
        │
        ▼
Cập nhật payment_components:
  SECURITY_DEPOSIT: PENDING_REFUND → REFUNDED / PARTIALLY_REFUNDED
  (ghi refunded_amount)
        │
        ▼
Tạo payment_transactions mới:
  type = REFUND, gateway = DIRECT, status = SUCCESS
        │
        ▼
Cập nhật bookings.status = COMPLETED
```

---

## Tổng tiền cuối cùng — nằm ở đâu?

Không có 1 cột duy nhất. Tổng tiền được phân tán theo mục đích:

| Nơi lưu | Chứa gì | Cập nhật khi nào | Đủ không? |
|---------|---------|-----------------|-----------|
| `sessions.actual_total_amount` | slot + F&B ON_SITE + extension (cộng dồn) | Mỗi lần staff thêm F&B / customer approve gia hạn | Thiếu damage |
| `session.notes['settlement']` | JSON đầy đủ: extension + F&B + damage + deposit | Khi Staff bấm checkout | **Đầy đủ nhất** |
| `payment_components` | Từng khoản với status riêng | Tạo lúc booking, cập nhật suốt vòng đời | Cần SUM query |
| `bookings` | Không có cột total | — | Không có |

```json
// session.notes['settlement'] — ví dụ:
{
  "totalExtensionFee": 150000,
  "totalOnsiteFnb": 80000,
  "damageCharge": 500000,
  "depositAmount": 300000,
  "depositConsumedByDamage": 300000,
  "depositRefundAmount": 0,
  "totalCounterBill": 430000
}
```

---

## Sơ đồ quan hệ bảng

```
bookings
  ├── booking_participants     (ai tham gia)
  ├── booking_vehicles         (xe đặt trước, giá snapshot)
  ├── fnb_orders (PRE_ORDER)
  │     └── fnb_order_items    (từng món ăn/uống)
  ├── payment_transactions     (giao dịch VNPay gốc + ctr_ bổ sung + DIRECT hoàn tiền)
  ├── payment_components       (breakdown: slot/rental/deposit/damage/extension...)
  └── sessions                 (phiên chơi thực tế — notes.settlement = tổng kết cuối)
        ├── session_participants   (ai thực sự check-in)
        ├── session_vehicles      (xe đang dùng → RETURNED / DAMAGED sau checkout)
        ├── extension_proposals   (gia hạn giờ chơi — fee_amount cộng vào actual_total_amount)
        ├── fnb_orders (ON_SITE)  (gọi thêm món trong session)
        │     └── fnb_order_items
        └── inspections           (biên bản tình trạng xe PRE / POST session)
```

---

## Bảng tham chiếu (không ghi nhưng được đọc)

| Bảng | Dùng để làm gì trong booking flow |
|------|------------------------------------|
| `cafes` | Lấy `slot_fee_rate`, `slot_duration_minutes`, trạng thái ACTIVE |
| `vehicles` | Kiểm tra xe còn AVAILABLE không |
| `vehicle_catalogs` | Lấy `hourly_rate`, `damage_multiplier` để tính giá |
| `menu_items` | Kiểm tra món F&B còn available, lấy giá |
| `promotions` | Validate promo code, tính discount |
| `customer_packages` | Validate gói slot (còn hạn, đủ slot, đúng cafe) |
| `cafe_track_configs` | Lấy cấu hình sân (BYOC capacity, compatible track types) |
| `pricing_rules` | Lấy multiplier theo khung giờ (dynamic pricing) |
