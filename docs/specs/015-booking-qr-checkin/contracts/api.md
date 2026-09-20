# API Contracts: QR Code Booking Email & Check-In

**Feature**: 015-booking-qr-checkin  
**Date**: 2026-07-08

---

## New Endpoints

### GET /api/v1/bookings/:bookingId/qr

**Purpose**: Trả về ảnh QR PNG chứa booking UUID. Được dùng trong email HTML (`<img src="...">`) và có thể dùng trực tiếp từ browser.

**Auth**: Public — không cần JWT. Email clients cần load ảnh này khi mở email.

**RBAC**: N/A (public)

**Path Params**:
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `bookingId` | UUID | Yes | Booking ID — trở thành nội dung encode vào QR |

**Response 200**:
```
Content-Type: image/png
Cache-Control: public, max-age=3600
Body: PNG binary buffer (256×256px, errorCorrectionLevel M)
```

**Response 400**:
```json
{ "error": "VALIDATION_ERROR", "message": "Invalid booking ID format" }
```
*(Chỉ validate UUID format — không kiểm tra booking có tồn tại hay không. Ảnh QR trả về cho bất kỳ UUID hợp lệ nào.)*

**Implementation note**: Controller gọi `QRCode.toBuffer(bookingId, { width: 256, margin: 2 })` rồi `res.send(buffer)`.

---

## Existing Endpoints Used (unchanged)

### GET /api/v1/bookings/:id `[auth]`

**Used by**: Staff frontend — sau khi decode QR, gọi endpoint này để lấy thông tin booking cho màn hình preview trước khi confirm check-in.

**Response fields relevant to QR check-in flow**:
```json
{
  "success": true,
  "data": {
    "id": "7a1301ff-...",
    "status": "CONFIRMED",
    "slotStart": "2026-07-10T08:00:00+07:00",
    "slotEnd": "2026-07-10T10:00:00+07:00",
    "playMode": "RENTAL",
    "cafe": { "name": "RC Arena Q7", "address": "..." },
    "participants": [...],
    "session": null
  }
}
```

**Check trước khi cho phép confirm**:
- `status !== 'CONFIRMED'` → hiển thị lý do từ chối (đã hủy / chưa thanh toán / đã hoàn thành)
- `session !== null` → booking đã được check-in, hiển thị thông tin session hiện tại

---

### POST /api/v1/staff/bookings/:bookingId/check-in `[auth STAFF, PROVIDER]`

**Used by**: Staff frontend — sau khi preview và staff nhấn "Xác nhận check-in".

**No changes** — endpoint này không thay đổi. QR flow chỉ là cách khác để staff lấy `bookingId`.

**Request**: No body required.

**Response 200**:
```json
{
  "success": true,
  "data": {
    "sessionId": "...",
    "status": "CHECKED_IN",
    "actualStartAt": "2026-07-10T08:03:00+07:00"
  }
}
```

---

## Email Trigger (internal — no API)

### sendCheckInEmail(bookingId: string)

**Triggered by**: `processConfirmation()` và `processMockConfirmation()` trong `payment.service.ts` — cùng nơi đang gọi `sendBookingConfirmation()` và `sendBookingInvoice()`.

**Fire-and-forget**: Wrapped trong `Promise.all([...]).catch()` — không block payment confirmation.

**Email content**:
```
Subject: 📱 Mã check-in đặt sân #XXXXXXXX — RCField
To: customer email
Body: HTML email với:
  - Mã booking text fallback (#XXXXXXXX)
  - <img src="{API_BASE_URL}/api/v1/bookings/{bookingId}/qr" width="220" height="220">
  - Thông tin: tên chi nhánh, địa chỉ, thời gian, chế độ chơi
  - Hướng dẫn: "Trình mã QR này khi đến quán để check-in nhanh"
```

**Email riêng biệt với email hóa đơn** — 2 email khác nhau, không gộp.

---

## Frontend Contracts

### Customer App — BookingDetailPage

**Điều kiện hiển thị QR**:
```typescript
const showQR = booking.status === 'CONFIRMED' && new Date() < new Date(booking.slotEnd);
```

**Component**:
```tsx
import { QRCodeSVG } from 'qrcode.react';
{showQR && <QRCodeSVG value={booking.id} size={200} level="M" includeMargin />}
```

### Staff App — Check-In Screen

**QR Upload decode flow**:
```typescript
// 1. File input onChange handler
const file: File = e.target.files[0];
const img = new Image();
img.onload = () => {
  const canvas = document.createElement('canvas');
  canvas.width = img.width; canvas.height = img.height;
  canvas.getContext('2d')!.drawImage(img, 0, 0);
  const imageData = canvas.getContext('2d')!.getImageData(0, 0, img.width, img.height);
  const result = jsQR(imageData.data, img.width, img.height);
  if (result?.data) {
    setBookingId(result.data); // result.data = UUID string
  } else {
    setError('Không đọc được mã QR. Hãy nhập booking ID thủ công.');
  }
};
img.src = URL.createObjectURL(file);

// 2. Sau khi có bookingId (từ QR hoặc nhập tay):
//    GET /api/v1/bookings/:bookingId → preview
//    Staff confirm → POST /api/v1/staff/bookings/:bookingId/check-in
```
