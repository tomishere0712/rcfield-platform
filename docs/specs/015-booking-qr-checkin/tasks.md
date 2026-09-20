# Tasks: QR Code Booking Email & Check-In

**Input**: Design documents from `specs/015-booking-qr-checkin/`  
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/api.md ✅

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Cài package mới và cấu hình env — không có bảng DB mới cần migrate.

- [X] T001 Install `qrcode` và `@types/qrcode` vào rcfeild-be/package.json (chạy `npm install qrcode @types/qrcode` trong rcfeild-be/)
- [X] T002 [P] Install `jsqr` và `qrcode.react` vào rcfield-fe/package.json (chạy `npm install jsqr qrcode.react` trong rcfield-fe/)
- [X] T003 Thêm `apiBaseUrl: process.env.API_BASE_URL ?? 'http://localhost:3001'` vào rcfeild-be/src/config/env.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Backend QR endpoint — cần có trước khi email template dùng URL endpoint này.

**⚠️ CRITICAL**: Phase 3 (email) phụ thuộc vào endpoint này phải tồn tại và hoạt động.

- [X] T004 Implement `getBookingQr()` handler trong rcfeild-be/src/controllers/booking.controller.ts: validate UUID format → `QRCode.toBuffer(id, { width: 256, margin: 2 })` → `res.setHeader('Content-Type', 'image/png')` + `res.setHeader('Cache-Control', 'public, max-age=3600')` → `res.send(buffer)`; trả 400 VALIDATION_ERROR nếu không phải UUID
- [X] T005 Đăng ký route public `GET /:id/qr` trong rcfeild-be/src/routes/booking.routes.ts — **TRƯỚC** middleware `authenticate`, không cần auth (email clients cần load ảnh không có JWT)

**Checkpoint**: `curl http://localhost:3001/api/v1/bookings/{valid-uuid}/qr -o qr.png && file qr.png` → "PNG image data, 256 x 256"

---

## Phase 3: User Story 1 — Email check-in kèm QR + Customer app display (Priority: P1) 🎯 MVP

**Goal**: Sau thanh toán thành công, khách nhận email thứ 3 có QR; đồng thời xem QR trong app tại trang chi tiết booking khi slot còn hiệu lực.

**Independent Test**: Mock payment → kiểm tra Brevo nhận request gửi email thứ 3 với subject chứa "Mã check-in"; mở BookingDetailPage với booking CONFIRMED + slot chưa kết thúc → QR hiển thị.

### Implementation for User Story 1

- [X] T006 [P] [US1] Thêm method `sendCheckInEmail(bookingId: string)` vào rcfeild-be/src/services/email.service.ts: query booking + cafe + user → build HTML email với `<img src="${env.apiBaseUrl}/api/v1/bookings/${bookingId}/qr" width="220" height="220">` và text fallback `#${shortRef}` → gọi `this.brevoSend()`; subject: `📱 Mã check-in đặt sân #${shortRef} — RCField`
- [X] T007 [US1] Thêm `emailService.sendCheckInEmail(bookingId)` vào Promise.all trong `processConfirmation()` và `processMockConfirmation()` tại rcfeild-be/src/services/payment.service.ts (cùng chỗ đang có sendBookingConfirmation + sendBookingInvoice)
- [X] T008 [P] [US1] Thêm QR display section vào rcfield-fe/src/pages/customer/booking-detail/CustomerBookingDetailPage.tsx: import `QRCodeSVG` từ `qrcode.react`; điều kiện hiển thị `booking.status === 'CONFIRMED' && new Date() < new Date(booking.slotEnd)`; render `<QRCodeSVG value={booking.id} size={200} level="M" includeMargin />` + text fallback `#{booking.id.substring(0,8).toUpperCase()}`; ẩn QR hoàn toàn nếu điều kiện false

**Checkpoint**: Mock checkout → hộp thư nhận 3 email (confirmation + invoice + check-in QR); mở BookingDetailPage với booking CONFIRMED → QR hiển thị; slot_end đã qua → QR ẩn.

---

## Phase 4: User Story 2 — Staff upload ảnh QR để check-in (Priority: P2)

**Goal**: Màn hình check-in staff có 2 input mode song song: upload ảnh QR (jsQR decode) và nhập tay. Sau khi có booking ID, hiện preview booking → staff xác nhận → check-in.

**Independent Test**: Upload ảnh chứa QR hợp lệ → thông tin booking xuất hiện; upload ảnh mờ → error message + input nhập tay vẫn hoạt động; nhập tay booking ID → tiếp tục bình thường.

### Implementation for User Story 2

- [X] T009 [P] [US2] Tạo component mới `QrCheckinUploader` tại rcfield-fe/src/features/staff/components/QrCheckinUploader.tsx: nhận prop `onDecoded: (bookingId: string) => void`; `<input type="file" accept="image/*">` onChange handler: tạo canvas → draw image → `jsQR(imageData.data, width, height)` → nếu `result?.data` gọi `onDecoded(result.data)`; nếu không decode được hiển thị error "Không đọc được mã QR. Hãy nhập booking ID thủ công."
- [X] T010 [US2] Tích hợp `QrCheckinUploader` vào rcfield-fe/src/pages/staff/StaffTodayBookingsPage.tsx: thêm state `bookingId` dùng chung cho cả 2 input mode; render `<QrCheckinUploader onDecoded={setBookingId} />` + divider "hoặc" + `<Input>` nhập tay; sau khi có `bookingId` gọi `GET /api/v1/bookings/:id` để preview thông tin (status, tên khách, thời gian, chế độ); nếu `status !== 'CONFIRMED'` hiện thông báo lý do từ chối; nếu `session !== null` hiện "Đã check-in lúc ..."; nếu hợp lệ hiện nút "Xác nhận check-in" → gọi existing API `POST /api/v1/staff/bookings/:id/check-in`

**Checkpoint**: Upload ảnh QR của booking CONFIRMED → preview hiển thị → nhấn xác nhận → session được tạo; upload ảnh mờ → error + nhập tay vẫn hoạt động; QR booking đã check-in → cảnh báo không tạo session thứ hai.

---

## Phase 5: User Story 3 — Invoice email vẫn gửi song song (Priority: P3)

**Goal**: Đảm bảo `sendBookingInvoice()` tiếp tục được gửi cùng Promise.all sau khi thêm email check-in mới, không bị thay thế.

**Independent Test**: Sau mock payment, hộp thư nhận đủ cả email hóa đơn (có PDF đính kèm) lẫn email check-in (có QR) — không thiếu email nào.

### Implementation for User Story 3

- [X] T011 [US3] Verify và document trong rcfeild-be/src/services/payment.service.ts rằng Promise.all sau khi sửa ở T007 chứa đúng 4 calls: `sendBookingConfirmation`, `sendBookingInvoice`, `sendCheckInEmail`, `pushBookingNew` — không có email nào bị bỏ hoặc thay thế

**Checkpoint**: Thực hiện mock checkout → kiểm tra log backend thấy 3 dòng "EmailService ... sent" (confirmation, invoice, check-in QR).

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T012 [P] Kiểm tra TypeScript build không lỗi sau khi thêm package mới: chạy `npx tsc --noEmit` trong rcfeild-be/ và rcfield-fe/
- [X] T013 [P] Cập nhật rcfeild-be/src/routes/booking.routes.ts comment: ghi rõ `GET /:id/qr` là public route (no auth) với lý do "email clients load ảnh không có JWT"
- [ ] T014 Chạy test suite hiện tại (`npm test`) trong rcfeild-be/ — đảm bảo không regression trong booking.test.ts và chat.test.ts

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: Không phụ thuộc — bắt đầu ngay
- **Phase 2 (Foundational)**: Phụ thuộc T001 (package cài xong) — endpoint `/qr` cần `qrcode` package
- **Phase 3 (US1)**: Phụ thuộc Phase 2 (T004, T005) — email dùng URL endpoint `/qr`; T006 và T008 có thể chạy song song
- **Phase 4 (US2)**: Phụ thuộc T002 (jsqr package); T009 và T010 phụ thuộc nhau (T009 trước T010)
- **Phase 5 (US3)**: Phụ thuộc T007 — verify sau khi wiring đã xong
- **Phase 6 (Polish)**: Sau khi tất cả phases hoàn thành

### User Story Dependencies

- **US1**: Depends on Phase 2 (QR endpoint phải có trước khi email dùng URL đó)
- **US2**: Độc lập với US1 — chỉ cần T002 (jsqr)
- **US3**: Sub-task của US1 wiring — verify sau T007

### Parallel Opportunities

- **T001 + T002**: Cài package backend và frontend song song
- **T006 + T008**: Backend email method và frontend QR display hoàn toàn độc lập — khác file, khác repo
- **T009**: Độc lập với US1, bắt đầu sau T002
- **T012 + T013**: Polish tasks độc lập nhau

---

## Parallel Example: Phase 3 (US1)

```bash
# Sau khi Phase 2 hoàn thành:
Task A: T006 — rcfeild-be/src/services/email.service.ts (sendCheckInEmail)
Task B: T008 — rcfield-fe/.../CustomerBookingDetailPage.tsx (QR display)
# Chạy đồng thời — khác file, khác repo
# T007 (payment.service wiring) chờ T006 xong
```

---

## Implementation Strategy

### MVP (Phase 1 + 2 + 3 only)

1. Cài packages → QR endpoint → sendCheckInEmail → wire vào payment → QR trong app
2. **STOP**: Test email QR nhận được + app hiển thị QR
3. Deploy → khách hàng đã có thể nhận và xem QR

### Full Feature (thêm Phase 4)

4. Thêm QrCheckinUploader → integrate vào StaffTodayBookingsPage
5. Test upload → decode → check-in flow
6. Deploy → staff có thể check-in bằng QR upload

### Tổng: 14 tasks — 4 có thể parallel
