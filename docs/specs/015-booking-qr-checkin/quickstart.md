# Quickstart & Test Scenarios: QR Code Booking Email & Check-In

**Feature**: 015-booking-qr-checkin  
**Date**: 2026-07-08

---

## Prerequisites

```bash
# Backend
cd rcfeild-be
npm install qrcode @types/qrcode

# Frontend
cd rcfield-fe
npm install jsqr qrcode.react
```

Ensure `API_BASE_URL` env var is set in both `.env` (backend) and `.env` (frontend):
```env
# rcfeild-be/.env
API_BASE_URL=http://localhost:3001

# rcfield-fe/.env
VITE_API_BASE_URL=http://localhost:3001
```

---

## E2E Scenarios

### Scenario 1 — Email check-in gửi sau thanh toán thành công

```
1. Tạo booking (mock payment hoặc real VNPay sandbox)
2. Confirm payment → payment.service.processConfirmation() kích hoạt
3. Kiểm tra: hộp thư customer nhận được 3 email:
   - "Đặt sân thành công" (booking confirmation — đã có)
   - "Hóa đơn đặt sân #XXXXXXXX" (invoice PDF — đã có)
   - "📱 Mã check-in đặt sân #XXXXXXXX" (MỚI — có QR image)
4. Mở email check-in: ảnh QR hiển thị được, scan bằng điện thoại thấy booking UUID
```

### Scenario 2 — QR endpoint trực tiếp

```bash
# Test QR image endpoint
curl http://localhost:3001/api/v1/bookings/{VALID_BOOKING_UUID}/qr \
  -o qr-test.png && open qr-test.png

# Verify PNG returned
file qr-test.png  # → "PNG image data, 256 x 256"

# Invalid UUID → 400
curl http://localhost:3001/api/v1/bookings/not-a-uuid/qr
# → { "error": "VALIDATION_ERROR", "message": "Invalid booking ID format" }
```

### Scenario 3 — Customer app hiển thị QR trong BookingDetailPage

```
1. Login as customer
2. Navigate to /bookings/{confirmedBookingId}
3. Verify: QR code hiển thị bên dưới thông tin booking
4. slot_end của booking đã qua → QR bị ẩn, không hiển thị
5. Booking status = CANCELLED → QR bị ẩn
```

### Scenario 4 — Staff upload ảnh QR để check-in

```
1. Login as staff
2. Navigate to màn hình check-in
3. Chọn "Upload ảnh QR" → upload ảnh chụp màn hình email có QR
4. Hệ thống decode → hiển thị thông tin booking (tên, thời gian, chế độ)
5. Staff nhấn "Xác nhận check-in"
6. → Session được tạo, booking hiển thị checked-in
```

### Scenario 5 — Fallback nhập tay khi QR mờ

```
1. Staff upload ảnh bị mờ / góc nghiêng không đọc được
2. Hệ thống hiển thị: "Không đọc được mã QR. Hãy nhập booking ID thủ công."
3. Input nhập tay xuất hiện (hoặc đã visible song song)
4. Staff nhập booking ID thủ công → tiếp tục bình thường
```

### Scenario 6 — QR của booking đã check-in

```
1. Staff upload QR của booking đã có session (đã check-in)
2. GET /api/v1/bookings/:id trả về data.session != null
3. Frontend hiển thị: "Booking này đã được check-in lúc HH:MM"
4. Không hiện nút xác nhận check-in lần nữa
```

### Scenario 7 — QR của booking bị hủy hoặc slot đã kết thúc

```
1. Staff upload QR của booking CANCELLED
2. Frontend gọi GET /api/v1/bookings/:id → status = CANCELLED
3. Hiển thị: "Booking đã bị hủy, không thể check-in"
4. Tương tự nếu slot đã kết thúc: "Thời gian đặt sân đã kết thúc"
```

### Scenario 8 — Mock payment flow (development)

```bash
# Tạo booking và mock confirm
POST /api/v1/bookings  (auth: customer JWT)
POST /api/v1/bookings/{id}/mock-checkout  (auth: customer JWT)

# Kiểm tra email được gửi trong Brevo dashboard / local log
# Kiểm tra QR endpoint hoạt động
GET /api/v1/bookings/{id}/qr  → PNG
```

---

## Unit Test Checklist

- [ ] `email.service.ts` → `sendCheckInEmail()`: mock `QRCode.toBuffer`, verify `brevoSend()` called với subject chứa "#XXXXXXXX" và `htmlContent` chứa `/api/v1/bookings/{id}/qr`
- [ ] `GET /api/v1/bookings/:id/qr` controller: valid UUID → 200 image/png; invalid UUID → 400 VALIDATION_ERROR
- [ ] `payment.service.ts` → `processConfirmation()`: verify `sendCheckInEmail` được gọi song song với `sendBookingConfirmation` và `sendBookingInvoice`
- [ ] Frontend `BookingDetailPage`: booking CONFIRMED + slot chưa kết thúc → QR hiển thị; CONFIRMED + slot đã kết thúc → QR ẩn; CANCELLED → QR ẩn
- [ ] Frontend staff QR upload: valid QR image → setBookingId called với UUID; blurry image → error message shown; fallback input visible
