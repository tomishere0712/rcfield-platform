# Feature Specification: QR Code Booking Email & Check-In

**Feature Branch**: `015-booking-qr-checkin`  
**Created**: 2026-07-08  
**Status**: Draft  
**Input**: Sau khi booking thành công gửi 2 email: hóa đơn và thông tin check-in kèm mã QR. Staff quét QR để check-in khách hàng.

## Clarifications

### Session 2026-07-08

- Q: Ngoài email, khách hàng có thể xem lại mã QR ở đâu khác không? → A: Email + hiển thị trong app tại trang chi tiết booking (BookingDetailPage)
- Q: Staff dùng thiết bị nào để quét QR? → A: Hiện tại web app cho phép upload ảnh chứa QR để detect. Khi có mobile app tương lai mới dùng live camera scan.
- Q: App khách hàng hiển thị QR ở trạng thái nào? → A: Chỉ hiển thị khi CONFIRMED và còn trong thời hạn slot; ẩn QR sau khi slot kết thúc.
- Q: Khi detect QR từ ảnh thất bại, staff làm gì? → A: Hiển thị thông báo lỗi + cho phép nhập booking ID thủ công ngay trên cùng màn hình.
- Q: QR trong email có hết hạn kỹ thuật không? → A: QR không hết hạn kỹ thuật; hệ thống từ chối check-in nếu slot đã kết thúc theo business rule (báo lý do rõ ràng, không phải "mã hết hạn").

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Nhận email check-in kèm QR và xem QR trong app (Priority: P1)

Sau khi khách hàng hoàn tất thanh toán, hệ thống tự động gửi email xác nhận đặt sân có đính kèm **mã QR**. Đồng thời, mã QR cũng hiển thị ngay trên trang chi tiết booking trong ứng dụng. Khách có thể trình QR từ email hoặc từ app để staff check-in — linh hoạt khi email vào spam hoặc khách không tìm được email.

**Why this priority**: Đây là luồng chính mang lại giá trị trực tiếp cho khách hàng và giải quyết bài toán check-in nhanh tại quán. Không có QR thì mọi thứ sau đó không có ý nghĩa.

**Independent Test**: Hoàn tất một booking → kiểm tra (1) hộp thư có email với QR hiển thị được, (2) trang chi tiết booking trong app hiển thị QR cùng booking đó.

**Acceptance Scenarios**:

1. **Given** khách hàng vừa thanh toán booking thành công, **When** hệ thống xử lý xong giao dịch, **Then** khách nhận được email "Thông tin check-in" trong vòng 2 phút, email hiển thị mã QR rõ ràng kèm thông tin booking (mã đặt sân, tên chi nhánh, thời gian, địa chỉ).
2. **Given** khách hàng mở trang chi tiết booking trong app, **When** booking ở trạng thái CONFIRMED, **Then** mã QR hiển thị ngay trong trang — không cần mở email.
3. **Given** khách hàng mở email hoặc app trên điện thoại, **When** đưa điện thoại cho staff quét, **Then** mã QR hiển thị đủ lớn và rõ nét để camera đọc được.
4. **Given** hệ thống gửi 2 email riêng biệt, **When** khách mở hộp thư, **Then** thấy 2 email tách biệt: (1) email hóa đơn có PDF đính kèm, (2) email check-in có mã QR — không gộp làm một.

---

### User Story 2 — Staff quét QR từ email khách để check-in (Priority: P2)

Khi khách hàng đến quán, staff dùng chức năng camera trên ứng dụng staff để quét mã QR từ email của khách (hiển thị trên màn hình điện thoại khách). Hệ thống nhận diện booking và tự động điền thông tin, staff xác nhận để hoàn tất check-in — không cần nhập booking ID thủ công.

**Why this priority**: Mã QR chỉ có giá trị nếu staff có thể quét được. Không có chức năng quét thì QR chỉ là hình trang trí.

**Independent Test**: Staff mở màn hình check-in → chọn "Upload ảnh QR" → chọn ảnh chứa mã QR → hệ thống detect và hiển thị thông tin booking → staff xác nhận → session được tạo thành công.

**Acceptance Scenarios**:

1. **Given** staff đang ở màn hình check-in, **When** upload ảnh chứa mã QR hợp lệ (chụp màn hình điện thoại khách hoặc ảnh chụp email), **Then** hệ thống detect QR, hiển thị thông tin booking (tên khách, thời gian, chế độ chơi) và staff nhấn xác nhận để check-in.
2. **Given** staff quét một mã QR không thuộc booking nào, **When** hệ thống xử lý, **Then** hiển thị thông báo lỗi rõ ràng, không crash ứng dụng.
3. **Given** booking đã được check-in trước đó, **When** staff quét lại QR của booking đó, **Then** hệ thống thông báo "Booking này đã được check-in" và hiển thị thông tin session hiện tại.
4. **Given** booking chưa được thanh toán (status PENDING hoặc AWAITING_PAYMENT), **When** staff quét QR, **Then** hệ thống từ chối check-in và thông báo lý do.

---

### User Story 3 — Nhận email hóa đơn PDF sau khi đặt sân thành công (Priority: P3)

Đồng thời với email check-in, hệ thống gửi một email riêng chứa hóa đơn chi tiết dưới dạng PDF đính kèm, bao gồm bảng kê các khoản phí (phí sân, thuê xe, cọc, F&B), tổng thanh toán và thông tin giao dịch.

**Why this priority**: Email hóa đơn đã được implement và hoạt động trước đó. Story này đảm bảo nó tiếp tục được gửi song song với email check-in mới, không thay thế lẫn nhau.

**Independent Test**: Sau booking thành công, kiểm tra khách nhận được email hóa đơn có file PDF, mở PDF xem đầy đủ chi tiết phí.

**Acceptance Scenarios**:

1. **Given** khách hàng thanh toán thành công, **When** hệ thống gửi email, **Then** email hóa đơn có tiêu đề "Hóa đơn đặt sân #XXXXXXXX" kèm file PDF đính kèm với đầy đủ chi tiết.
2. **Given** booking có tiền cọc xe, **When** hóa đơn được tạo, **Then** PDF ghi rõ số tiền cọc và thông báo sẽ được hoàn trả sau check-out.

---

### Edge Cases

- Điều gì xảy ra nếu địa chỉ email khách hàng không hợp lệ hoặc mailbox đầy? → Hệ thống ghi lỗi nhưng không làm ảnh hưởng đến trạng thái booking (email gửi là fire-and-forget).
- Điều gì xảy ra nếu booking bị hủy sau khi đã gửi email check-in kèm QR? → QR vẫn tồn tại trong email, nhưng khi staff upload ảnh QR sẽ nhận được thông báo lý do từ chối (đã hủy / đã check-in / slot đã kết thúc) — không phải thông báo "mã hết hạn" vì QR không có expiry kỹ thuật.
- Điều gì xảy ra nếu slot đã kết thúc nhưng QR từ email vẫn còn? → Hệ thống từ chối check-in với lý do "Thời gian đặt sân đã kết thúc" — đây là business rule, không phải lỗi QR.
- Điều gì xảy ra nếu khách mở email trên thiết bị không hỗ trợ hiển thị ảnh? → Email phải có fallback text hiển thị mã booking dạng text (#XXXXXXXX) bên cạnh QR.
- QR có thể bị chụp lại và dùng bởi người khác không? → Hệ thống chỉ cho phép check-in một lần; lần quét sau sẽ báo đã check-in, và staff có thể xác minh danh tính khách hàng.
- Điều gì xảy ra nếu khách hàng đặt nhiều booking? → Mỗi booking có một email và QR riêng biệt, không nhầm lẫn.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Hệ thống PHẢI tự động gửi 2 email riêng biệt ngay sau khi thanh toán booking được xác nhận thành công: email hóa đơn (có PDF đính kèm) và email thông tin check-in (có mã QR).
- **FR-002**: Email check-in PHẢI hiển thị mã QR dưới dạng hình ảnh nhúng trực tiếp trong nội dung email, có thể scan bằng camera điện thoại thông thường.
- **FR-003**: Mã QR PHẢI mã hóa đủ thông tin để hệ thống định danh chính xác booking khi scan — không yêu cầu kết nối mạng để hiển thị QR, chỉ cần để scan.
- **FR-004**: Email check-in PHẢI hiển thị đồng thời mã booking dạng text (#XXXXXXXX) bên cạnh QR như phương án dự phòng khi ảnh không hiển thị được.
- **FR-005**: Email check-in PHẢI bao gồm thông tin: tên chi nhánh, địa chỉ, thời gian đặt sân (bắt đầu – kết thúc), chế độ chơi (thuê xe / BYOC).
- **FR-006**: Ứng dụng staff PHẢI có chức năng **upload ảnh chứa mã QR** (chụp màn hình email hoặc ảnh từ điện thoại khách) để hệ thống tự động detect mã QR và điền thông tin booking vào màn hình check-in. Live camera scan là phạm vi tương lai khi có mobile app.
- **FR-012**: Khi detect QR từ ảnh thất bại, hệ thống PHẢI hiển thị thông báo lỗi rõ ràng và cho phép staff nhập booking ID thủ công ngay trên cùng màn hình — hai phương thức (upload QR và nhập tay) cùng tồn tại trên một màn hình check-in.
- **FR-011**: Trang chi tiết booking trong ứng dụng khách hàng (BookingDetailPage) PHẢI hiển thị mã QR khi booking ở trạng thái CONFIRMED **và thời điểm hiện tại chưa vượt quá giờ kết thúc slot**. QR bị ẩn sau khi slot kết thúc hoặc booking không còn CONFIRMED.
- **FR-007**: Khi quét QR hợp lệ, hệ thống PHẢI hiển thị thông tin booking để staff xác nhận trước khi thực hiện check-in — không tự động check-in ngay khi scan.
- **FR-008**: Hệ thống PHẢI từ chối check-in qua QR nếu booking không ở trạng thái CONFIRMED, và hiển thị lý do rõ ràng (đã hủy, chưa thanh toán, đã check-in).
- **FR-009**: Việc gửi email KHÔNG ĐƯỢC làm chậm hoặc block quá trình xác nhận thanh toán — phải chạy bất đồng bộ.
- **FR-010**: Nếu gửi email thất bại, hệ thống PHẢI ghi lỗi vào log nhưng không rollback trạng thái booking.

### Key Entities

- **Booking**: Đơn đặt sân đã xác nhận — chứa booking ID được mã hóa trong QR. Trạng thái CONFIRMED là điều kiện để check-in hợp lệ.
- **QR Code (Email Asset)**: Hình ảnh được nhúng vào email, encode booking ID. Không lưu trữ trong database — được tạo lại mỗi lần gửi email.
- **Session**: Bản ghi check-in được tạo khi staff xác nhận sau khi scan QR thành công.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% booking được xác nhận thanh toán đều kích hoạt gửi cả 2 email trong vòng 2 phút.
- **SC-002**: Mã QR trong email scan được bằng camera điện thoại thông thường trong vòng 3 giây ở điều kiện ánh sáng bình thường.
- **SC-003**: Thời gian check-in bằng QR (từ lúc mở camera đến khi session được tạo) dưới 15 giây — nhanh hơn so với nhập mã thủ công.
- **SC-004**: Tỉ lệ email check-in được giao thành công đạt trên 95% (đo theo Brevo delivery report).
- **SC-005**: Mỗi QR chỉ cho phép tạo một session check-in — quét thêm không tạo session thứ hai.

## Assumptions

- Email hóa đơn (có PDF) đã được implement và hoạt động — feature này chỉ bổ sung email check-in kèm QR song song, không thay thế.
- Brevo (email provider hiện tại) hỗ trợ nhúng hình ảnh base64 trực tiếp trong HTML email.
- Staff sử dụng ứng dụng web hiện tại — QR detection thông qua upload ảnh (không phải live camera). Live camera scan sẽ được bổ sung trong giai đoạn mobile app tương lai.
- QR chỉ cần encode booking ID (UUID) — không cần chữ ký số hay token có thời hạn vì check-in là hành động vật lý có sự hiện diện của staff tại quán.
- Khách hàng đã đăng ký tài khoản với email hợp lệ khi đặt sân.
- Khách hàng có thể xem QR qua 2 kênh: email (gửi tự động sau thanh toán) và trang chi tiết booking trong app — cả hai kênh đều hợp lệ để trình khi check-in.
