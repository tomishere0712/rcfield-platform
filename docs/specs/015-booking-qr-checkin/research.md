# Research: QR Code Booking Email & Check-In

**Feature**: 015-booking-qr-checkin  
**Date**: 2026-07-08

---

## Decision 1: Cách nhúng QR vào email HTML

**Decision**: Dùng URL từ backend endpoint riêng `GET /api/v1/bookings/:bookingId/qr` trong thẻ `<img src="...">`.

**Rationale**: Base64 data URI bị Gmail, Outlook và hầu hết email clients block hoặc strip vì lý do bảo mật. CID inline attachment yêu cầu cấu hình phức tạp với Brevo REST API. Giải pháp URL backend là cách duy nhất đảm bảo QR hiển thị được trên tất cả email clients (Gmail, Apple Mail, Android Mail). Booking UUID đủ ngẫu nhiên (128-bit) để làm URL không đoán được — không cần auth thêm cho endpoint này.

**Alternatives considered**:
- `data:image/png;base64,...` trong `<img src>` — bị Gmail và Outlook block, loại bỏ.
- CID inline attachment — Brevo REST API hỗ trợ hạn chế, phức tạp, loại bỏ.
- External QR API (api.qrserver.com) — phụ thuộc dịch vụ bên ngoài, không reliable cho production.
- Upload lên Cloudinary — thêm latency, cần cleanup, over-engineering cho ảnh ephemeral.

---

## Decision 2: Thư viện generate QR backend

**Decision**: `qrcode` npm package (`npm install qrcode @types/qrcode`).

**Rationale**: Package thuần Node.js không cần native dependencies, API đơn giản, generate PNG buffer hoặc data URL trực tiếp. Phù hợp cả cho endpoint `/qr` (stream buffer) và test generation.

```typescript
import QRCode from 'qrcode';
const buffer = await QRCode.toBuffer(bookingId, {
  errorCorrectionLevel: 'M',
  width: 256,
  margin: 2,
});
// res.setHeader('Content-Type', 'image/png'); res.send(buffer);
```

**Alternatives considered**:
- `node-qrcode` — tên khác của cùng package.
- External QR API — loại bỏ (xem Decision 1).

---

## Decision 3: Thư viện decode QR từ ảnh upload (staff frontend)

**Decision**: `jsQR` npm package (`npm install jsqr`).

**Rationale**: Pure JavaScript, không cần native dependencies, hoạt động hoàn toàn client-side qua Web Canvas API. Staff upload ảnh → draw onto canvas → extract ImageData → jsQR decode → booking UUID. Nhẹ (~50KB), không cần server round-trip để decode.

```typescript
import jsQR from 'jsqr';

const img = new Image();
img.onload = () => {
  const canvas = document.createElement('canvas');
  canvas.width = img.width; canvas.height = img.height;
  canvas.getContext('2d')!.drawImage(img, 0, 0);
  const { data } = canvas.getContext('2d')!.getImageData(0, 0, img.width, img.height);
  const result = jsQR(data, img.width, img.height);
  if (result) handleBookingId(result.data); // result.data = booking UUID
};
img.src = URL.createObjectURL(uploadedFile);
```

**Alternatives considered**:
- `@zxing/browser` — nặng hơn, tối ưu cho live camera hơn là image decode.
- `qr-scanner` — tập trung vào camera stream, không phù hợp upload flow.

---

## Decision 4: Thư viện render QR phía customer frontend

**Decision**: `qrcode.react` npm package (`npm install qrcode.react`).

**Rationale**: React component chính thức, render SVG inline, không cần backend call. Customer app đã có `booking.id` từ booking detail query → render trực tiếp.

```tsx
import { QRCodeSVG } from 'qrcode.react';
<QRCodeSVG value={booking.id} size={200} level="M" includeMargin />
```

**Alternatives considered**:
- Backend QR endpoint (dùng cho email) — không cần cho customer app vì render client-side đơn giản hơn.
- `react-qr-code` — tương đương, `qrcode.react` phổ biến hơn và maintained bởi zpao.

---

## Decision 5: Nội dung encode trong QR

**Decision**: Plain booking UUID string (ví dụ: `7a1301ff-fc90-438e-bda7-bb9402d76171`).

**Rationale**: Đơn giản nhất. Staff client decode ra UUID → gọi trực tiếp API check-in. Không cần backend để "giải mã" thêm. UUID là 128-bit ngẫu nhiên, đủ entropy để không đoán được. Không cần token có thời hạn vì hệ thống đã kiểm tra business rules (booking CONFIRMED + slot còn hiệu lực) tại thời điểm check-in.

**Alternatives considered**:
- URL format `https://rcfield.vn/checkin/UUID` — không cần thiết, thêm bytes vào QR.
- Signed JWT — phức tạp không cần thiết cho môi trường vật lý có sự hiện diện của staff.

---

## Decision 6: QR endpoint security

**Decision**: `GET /api/v1/bookings/:bookingId/qr` là public endpoint (không cần JWT auth), chỉ validate UUID format.

**Rationale**: QR image cần được email clients tải khi mở email — email clients không gửi Authorization header. URL đã đủ không đoán được vì chứa UUID. Endpoint chỉ trả về ảnh PNG, không expose thông tin nhạy cảm. Booking ID là thứ customer đã biết.

**Alternatives considered**:
- Signed URL với thời hạn (presigned) — over-engineering, email có thể được mở lại nhiều lần.
- Auth token trong query param — email clients không hỗ trợ, phức tạp không cần thiết.

---

## Decision 7: Xử lý QR trong màn hình check-in staff

**Decision**: Màn hình check-in staff có 2 input mode song song trên cùng một trang: (1) upload ảnh QR, (2) nhập booking ID thủ công. Sau khi có booking ID từ một trong hai cách, gọi `GET /api/v1/bookings/:id` để preview → staff confirm → `POST /api/v1/staff/bookings/:bookingId/check-in`.

**Rationale**: Không cần endpoint mới cho QR decode (client-side). Không cần thay đổi API check-in hiện tại. Staff luôn có fallback nhập tay khi ảnh bị mờ (theo FR-012).

**Alternatives considered**:
- Backend endpoint để decode QR — không cần vì jsQR chạy client-side.
- Tách thành 2 màn hình riêng — tệ hơn về UX, không cần thiết.

---

## Packages to install

**Backend** (`rcfeild-be`):
```bash
npm install qrcode
npm install -D @types/qrcode
```

**Frontend** (`rcfield-fe`):
```bash
npm install jsqr qrcode.react
```

*Note*: `qrcode.react` ships với TypeScript types built-in từ v3+. `jsqr` cần `@types/jsqr` nếu không có bundled types.
