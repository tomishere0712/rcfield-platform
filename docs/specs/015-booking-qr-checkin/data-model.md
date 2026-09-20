# Data Model: QR Code Booking Email & Check-In

**Feature**: 015-booking-qr-checkin  
**Date**: 2026-07-08

---

## Không có bảng mới

Feature này không thêm bảng database mới. QR code là ephemeral asset được generate on-the-fly, không lưu trữ.

---

## Existing Tables Used

### `bookings`
Nguồn dữ liệu chính cho cả email và QR generation.

| Column | Type | Role in feature |
|--------|------|----------------|
| `id` | UUID PK | Nội dung được encode vào QR; URL param cho endpoint `/qr` |
| `status` | enum | Kiểm tra CONFIRMED trước khi check-in; customer app ẩn QR nếu không phải CONFIRMED |
| `slot_start` | timestamptz | Hiển thị trong email check-in |
| `slot_end` | timestamptz | Customer app: so sánh với `now()` để ẩn QR khi slot kết thúc |
| `play_mode` | enum | Hiển thị trong email check-in (RENTAL / BYOC) |
| `cafe_id` | UUID FK | Join để lấy tên, địa chỉ chi nhánh |
| `customer_id` | UUID FK | Join để lấy email, tên khách hàng |

### `cafes`
Join từ `bookings.cafe_id`.

| Column | Type | Role in feature |
|--------|------|----------------|
| `name` | text | Hiển thị trong email check-in |
| `address` | text | Hiển thị trong email check-in |

### `users`
Join từ `bookings.customer_id`.

| Column | Type | Role in feature |
|--------|------|----------------|
| `email` | text | Địa chỉ gửi email check-in |
| `full_name` | text | Tên hiển thị trong email |

### `sessions`
Được tạo bởi existing `startCheckIn()` service sau khi staff confirm QR check-in.

| Column | Type | Role in feature |
|--------|------|----------------|
| `id` | UUID PK | Session được tạo sau QR check-in |
| `booking_id` | UUID FK | Link về booking |
| `checked_in_by` | UUID FK | Staff ID thực hiện check-in |
| `status` | enum | CHECKED_IN sau khi tạo |
| `actual_start_at` | timestamptz | Set khi check-in |

---

## QR Code — Không lưu DB

QR code là hình ảnh PNG được generate động từ `booking.id`:

```
QR content = booking UUID
            (e.g. "7a1301ff-fc90-438e-bda7-bb9402d76171")

QR image = generated on-the-fly by `qrcode` npm package
         = served from endpoint GET /api/v1/bookings/:id/qr
         = rendered client-side by `qrcode.react` in customer app
```

**Không có bảng `qr_codes`** — không cần revoke, không cần expiry record, không cần lookup. Hệ thống kiểm tra booking status tại thời điểm check-in thay vì tại thời điểm scan.

---

## State Transition (existing — không thay đổi)

```
Booking: CONFIRMED
    │
    │  Staff uploads QR image → jsQR decode → booking UUID
    │  → GET /api/v1/bookings/:id (preview)
    │  → Staff confirms
    │  → POST /api/v1/staff/bookings/:bookingId/check-in
    ▼
Session: CHECKED_IN  (created by existing startCheckIn service)
Booking: vẫn CONFIRMED (booking status không đổi khi check-in)
```

Existing `startCheckIn()` đã handle idempotency (trả về session hiện tại nếu đã check-in).
