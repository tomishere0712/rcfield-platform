# Schema Index — RCField

> Quick-reference cho agent. Đọc file này trước khi tạo table/entity mới để tránh trùng.  
> Schema đầy đủ: `docs/spec/06-database.md` · Migration: `src/migrations/1747180800000-InitialSchema.ts`

---

## Danh sách 26 bảng

### USER & AUTH

| Bảng | Mô tả | Cột quan trọng |
|------|-------|---------------|
| `users` | Tất cả users — 4 roles | `id`, `email`, `role` (CUSTOMER/PROVIDER/STAFF/ADMIN), `trust_score`, `auth_provider` (LOCAL/GOOGLE), `deleted_at` |
| `refresh_tokens` | JWT refresh session | `user_id → users`, `token` (hashed), `expires_at` |
| `password_reset_tokens` | Reset password (TTL 15 phút) | `user_id → users`, `token`, `expires_at`, `used_at` |

### CAFE (CHI NHÁNH)

| Bảng | Mô tả | Cột quan trọng |
|------|-------|---------------|
| `cafes` | Chi nhánh — config per-branch | `id`, `provider_id → users`, `slug` (unique), `status` (PENDING/ACTIVE/SUSPENDED), `track_types[]`, `slot_duration_minutes`, `slot_fee_rate`, `byoc_capacity` |
| `cafe_images` | Gallery ảnh chi nhánh | `cafe_id → cafes`, `url` (Cloudinary), `sort_order` |
| `cafe_closures` | Ngày đóng cửa đặc biệt | `cafe_id → cafes`, `closed_date` (DATE), UNIQUE(cafe_id, closed_date) |
| `cafe_announcements` | Banner / thông báo chi nhánh | `cafe_id → cafes`, `title`, `starts_at`, `ends_at`, `is_active`, `created_by → users` |

### STAFF

| Bảng | Mô tả | Cột quan trọng |
|------|-------|---------------|
| `staff_cafe_assignments` | Assign staff vào chi nhánh | `staff_id → users` (UNIQUE — 1 staff chỉ thuộc 1 cafe), `cafe_id → cafes`, `assigned_by → users` |

### FLEET (ĐỘI XE)

| Bảng | Mô tả | Cột quan trọng |
|------|-------|---------------|
| `vehicles` | Xe của từng chi nhánh | `cafe_id → cafes`, `tier` (STANDARD/PREMIUM/RESTRICTED), `status` (AVAILABLE/IN_USE/MAINTENANCE/RETIRED), `hourly_rate`, `security_deposit`, `damage_multiplier`, `compatible_track_types[]`, `deleted_at` |
| `vehicle_images` | Gallery ảnh xe | `vehicle_id → vehicles`, `url` (Cloudinary), `sort_order` |
| `vehicle_maintenance_logs` | Lịch sử bảo trì xe | `vehicle_id → vehicles`, `type` (SCHEDULED/REPAIR/INSPECTION), `performed_by → users` (nullable), `related_booking_id → bookings` (nullable) |

### BOOKING

| Bảng | Mô tả | Cột quan trọng |
|------|-------|---------------|
| `bookings` | Đơn đặt lịch | `customer_id → users`, `cafe_id → cafes`, `vehicle_id → vehicles` (null nếu BYOC), `mode` (RENTAL/BYOC), `source` (APP/STAFF_MANUAL), `track_type`, `status` (PENDING/CONFIRMED/ACTIVE/EXTENDING/CHECKING_OUT/DISPUTED/COMPLETED/CANCELLED), `slot_start`, `slot_end`, `slot_count`, `payment_expires_at`, `snapshot` (jsonb), `promotion_id → promotions` (nullable), `discount_amount` |
| `inspection_records` | Check-in/out kèm ảnh | `booking_id → bookings`, `type` (CHECK_IN/CHECK_OUT), `performed_by → users`, `photos` (jsonb), `checklist` (jsonb), `pre_existing_flag`, `damage_noted`, UNIQUE(booking_id, type) |
| `extension_proposals` | Đề xuất gia hạn slot | `booking_id → bookings`, `proposed_by → users`, `duration_minutes`, `fee_amount`, `status` (PENDING/APPROVED/REJECTED/EXPIRED) |
| `disputes` | Tranh chấp | `booking_id → bookings` (UNIQUE), `opened_by → users`, `status` (OPEN/UNDER_REVIEW/RESOLVED), `resolution_favor` (CUSTOMER/PROVIDER), `resolved_by → users` |

### PAYMENT

| Bảng | Mô tả | Cột quan trọng |
|------|-------|---------------|
| `payment_components` | Ledger thanh toán — immutable | `booking_id → bookings`, `type` (SLOT_FEE/RENTAL_FEE/SECURITY_DEPOSIT/EXTENSION_FEE/DAMAGE_CHARGE/FB_PREORDER), `amount`, `status` (PENDING/HELD/DISBURSED/REFUNDED/PARTIALLY_REFUNDED), `disbursed_to → users` |
| `payment_transactions` | Raw log từ payment gateway | `booking_id → bookings`, `gateway`, `gateway_transaction_id`, `type` (PAYMENT/REFUND), `raw_request` (jsonb), `raw_response` (jsonb) |

### PROMOTIONS

| Bảng | Mô tả | Cột quan trọng |
|------|-------|---------------|
| `promotions` | Mã giảm giá | `code` (UNIQUE khi active), `discount_type` (PERCENT/FIXED), `discount_value`, `max_discount_amount`, `applicable_to` (ALL/RENTAL/BYOC), `cafe_id → cafes` (null = global toàn chuỗi), `uses_count`, `max_uses`, `max_uses_per_user` |
| `promotion_usages` | Log mỗi lần dùng mã | `promotion_id → promotions`, `booking_id → bookings` (UNIQUE), `user_id → users`, `discount_amount` |

### F&B

| Bảng | Mô tả | Cột quan trọng |
|------|-------|---------------|
| `menu_items` | Menu F&B per chi nhánh | `cafe_id → cafes`, `price`, `category`, `is_available`, `deleted_at` |
| `fnb_orders` | Đơn F&B | `booking_id → bookings`, `type` (PRE_ORDER/ON_SITE), `status` (PENDING/CONFIRMED/DELIVERED/CANCELLED), `created_by → users` |
| `fnb_order_items` | Line items của đơn F&B | `order_id → fnb_orders`, `menu_item_id → menu_items`, `quantity`, `unit_price` (snapshot), `item_name_snapshot` |

### REVIEWS & NOTIFICATIONS

| Bảng | Mô tả | Cột quan trọng |
|------|-------|---------------|
| `reviews` | Đánh giá sau khi chơi | `booking_id → bookings` (UNIQUE), `cafe_id → cafes`, `customer_id → users`, `rating` (1–5), `is_visible` |
| `notification_logs` | Lịch sử notification | `user_id → users`, `booking_id → bookings` (nullable), `channel` (PUSH/SMS/EMAIL), `status` (SENT/FAILED/PENDING) |

### SYSTEM

| Bảng | Mô tả | Cột quan trọng |
|------|-------|---------------|
| `feature_flags` | Bật/tắt tính năng | `feature_key` (UNIQUE), `is_enabled`, `is_trial`, `trial_ends_at` |
| `trust_score_logs` | Lịch sử trust_score — immutable | `user_id → users`, `booking_id → bookings` (nullable), `delta`, `score_before`, `score_after`, `reason` (NO_SHOW/DAMAGE_CONFIRMED/DISPUTE_LOST/BOOKING_STREAK/ADMIN_ADJUSTMENT) |

---

## Enums nhanh

```
UserRole:           CUSTOMER | PROVIDER | STAFF | ADMIN
AuthProvider:       LOCAL | GOOGLE
CafeStatus:         PENDING | ACTIVE | SUSPENDED
VehicleTier:        STANDARD | PREMIUM | RESTRICTED
VehicleStatus:      AVAILABLE | IN_USE | MAINTENANCE | RETIRED
BookingMode:        RENTAL | BYOC
BookingSource:      APP | STAFF_MANUAL
BookingStatus:      PENDING | CONFIRMED | ACTIVE | EXTENDING | CHECKING_OUT | DISPUTED | COMPLETED | CANCELLED
TrackType:          DRIFT | CIRCUIT | OFFROAD  (text, không phải enum)
PaymentComponentType:    SLOT_FEE | RENTAL_FEE | SECURITY_DEPOSIT | EXTENSION_FEE | DAMAGE_CHARGE | FB_PREORDER
PaymentComponentStatus:  PENDING | HELD | DISBURSED | REFUNDED | PARTIALLY_REFUNDED
DiscountType:       PERCENT | FIXED
PromoApplicableTo:  ALL | RENTAL | BYOC
FnbOrderType:       PRE_ORDER | ON_SITE
FnbOrderStatus:     PENDING | CONFIRMED | DELIVERED | CANCELLED
TrustScoreReason:   NO_SHOW | DAMAGE_CONFIRMED | DISPUTE_LOST | BOOKING_STREAK | ADMIN_ADJUSTMENT
MaintenanceType:    SCHEDULED | REPAIR | INSPECTION
```

---

## Quy tắc quan trọng

- Mọi bảng dùng `uuid` làm PK với `DEFAULT gen_random_uuid()`
- Tiền tệ: `NUMERIC(15,2)` — không dùng `float`
- Soft delete: chỉ `users`, `vehicles`, `menu_items` có `deleted_at`
- `bookings.snapshot` (jsonb) là nguồn duy nhất để tính tiền — không đọc giá từ `cafes`/`vehicles`
- `promotions.cafe_id = NULL` → global; `NOT NULL` → chỉ 1 chi nhánh
- `staff_cafe_assignments.staff_id` có UNIQUE constraint — 1 staff chỉ thuộc 1 cafe
- Redis keys: `slot:rental:{cafeId}:{vehicleId}:{date}:{slotStart}` (SET NX, TTL 1800s)
