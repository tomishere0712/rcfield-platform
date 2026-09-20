# Đặc tả tính năng: Thiết kế lại Nghiệp vụ Tính Giá Đền Bù Hư Hỏng Xe

**Thư mục spec**: `specs/016-damage-charge-redesign`
**Ngày tạo**: 2026-07-14
**Trạng thái**: Đã làm rõ — sẵn sàng plan

---

## Bối cảnh nghiệp vụ

Khi khách thuê xe RC tại quán (chế độ RENTAL) và gây ra hư hỏng trong ca chơi, staff phải lập biên bản đền bù tại thời điểm trả xe (check-out). Cơ chế hiện tại dùng slider ước tính 10k–500k VNĐ và hệ số nhân tự động theo tên xe (premium = 1.5×), không phản ánh giá thực tế của linh kiện RC và không tạo ra bằng chứng đủ chi tiết để khách chấp nhận hoặc khiếu nại một cách có căn cứ.

Tính năng này thay thế hoàn toàn cơ chế ước tính bằng một form nhập giá từng hạng mục hư hỏng — staff được huấn luyện biết giá linh kiện, nhập trực tiếp giá linh kiện và phí công sửa chữa cho từng mục bị hỏng. Kết quả là một biên bản đền bù có breakdown minh bạch, khách đọc được và có thể đối chiếu với ảnh chụp tại chỗ.

---

## Làm rõ

### Phiên 2026-07-14

- Q: Khi khách ghi nhận tranh chấp tại quầy, hệ thống xử lý như thế nào? → A: Tranh chấp được xử lý ngay tại quầy trong cùng phiên checkout. Staff chỉnh sửa danh sách hạng mục, hiển thị lại biên bản, khách xác nhận rồi mới quyết toán. Chỉ khi không thể thống nhất tại chỗ mới chuyển lên Provider (quyết toán tạm giữ).
- Q: Sau khi quyết toán chạy, nếu cần điều chỉnh giảm mức đền bù, hệ thống hỗ trợ đến đâu? → A: Không có điều chỉnh sau quyết toán trong flow bình thường — tranh chấp được giải quyết tại chỗ trước khi quyết toán chạy.
- Q: Nếu màn hình tổng kết bị đóng trước khi khách xác nhận, staff xử lý thế nào? → A: Staff có thể điều hướng trở lại màn hình checkout của booking và xem lại toàn bộ tổng kết bất cứ lúc nào cho đến khi quyết toán hoàn tất.

---

## Kịch bản người dùng & Kiểm thử *(bắt buộc)*

### Kịch bản 1 — Staff lập danh sách hư hỏng có giá cụ thể (Ưu tiên: P1)

Khi kiểm tra xe trả (check-out), nhân viên phát hiện xe có một hoặc nhiều bộ phận bị hỏng. Staff thêm từng hạng mục hư hỏng vào biên bản, chọn loại bộ phận, nhập giá linh kiện thực tế và phí công sửa chữa. Hệ thống tự tính tổng đền bù và hiển thị để staff xác nhận trước khi lưu.

**Lý do ưu tiên P1**: Đây là điểm thay đổi cốt lõi — nếu không có form này, toàn bộ luồng đền bù không thể hoạt động đúng. Mọi kịch bản còn lại đều phụ thuộc vào dữ liệu breakdown được tạo ở đây.

**Kiểm thử độc lập**: Có thể kiểm thử hoàn toàn bằng cách staff điền form hư hỏng và xem biên bản được lưu với đầy đủ breakdown — không cần phía khách thực hiện bất kỳ hành động nào.

**Kịch bản chấp nhận**:

1. **Cho trước** staff đang ở màn hình check-out của một phiên RENTAL, **khi** staff tích vào ô "Phát hiện hư hỏng" và bấm "Thêm hạng mục", **thì** một dòng mới xuất hiện gồm: dropdown loại bộ phận, ô giá linh kiện (VNĐ), ô phí công (VNĐ), nút xoá.
2. **Cho trước** staff đã thêm ít nhất một hạng mục với giá hợp lệ, **khi** staff xem phần tổng kết, **thì** hiển thị từng dòng hạng mục (tên bộ phận, giá linh kiện, phí công, thành tiền) và tổng cộng toàn bộ.
3. **Cho trước** staff chọn "Khác" trong dropdown loại bộ phận, **khi** form hiển thị, **thì** xuất hiện thêm ô nhập tên hư hỏng tự do (bắt buộc điền).
4. **Cho trước** staff chưa nhập giá linh kiện cho một hạng mục, **khi** staff bấm "Lưu biên bản", **thì** form báo lỗi tại đúng dòng đó và không cho phép lưu.
5. **Cho trước** staff đã hoàn tất tất cả hạng mục, **khi** staff bấm "Lưu biên bản", **thì** biên bản được lưu với đầy đủ breakdown và tổng đền bù.

---

### Kịch bản 2 — Staff trình bày biên bản cho khách xác nhận tại chỗ (Ưu tiên: P2)

Sau khi staff điền xong danh sách hư hỏng và bấm "Lưu biên bản", hệ thống hiển thị một màn hình tổng kết biên bản để staff quay thiết bị cho khách xem trực tiếp tại quầy. Khách đọc từng hạng mục, đối chiếu với ảnh, rồi xác nhận tại chỗ. Không có luồng thông báo async qua app — cả staff và khách đều có mặt tại quầy trong suốt quy trình check-out.

**Lý do ưu tiên P2**: Tính minh bạch đối với khách là mục tiêu chính, nhưng xác nhận tại chỗ đơn giản hơn và không tạo trễ quyết toán. Phụ thuộc vào P1.

**Kiểm thử độc lập**: Test bằng cách staff lưu biên bản có hư hỏng và kiểm tra màn hình tổng kết hiển thị đúng, đầy đủ để khách có thể đọc.

**Kịch bản chấp nhận**:

1. **Cho trước** staff đã bấm "Lưu biên bản" với 2 hạng mục hư hỏng, **khi** màn hình tổng kết hiển thị, **thì** thấy đúng 2 hạng mục với tên, giá linh kiện, phí công, thành tiền và tổng cộng — đủ rõ để khách đứng cạnh đọc được.
2. **Cho trước** màn hình tổng kết đang hiển thị, **khi** staff và khách đối chiếu ảnh, **thì** ảnh check-in và ảnh check-out của cùng góc hiển thị cạnh nhau, có thể phóng to.
3. **Cho trước** khách đồng ý sau khi xem tại chỗ, **khi** staff bấm "Xác nhận & Quyết toán", **thì** hệ thống tiến hành khấu trừ ký quỹ và quyết toán ngay lập tức.
4. **Cho trước** khách không đồng ý một hoặc nhiều hạng mục, **khi** staff bấm "Có tranh chấp", **thì** hệ thống cho phép staff quay lại chỉnh sửa danh sách hạng mục hư hỏng, sau đó hiển thị lại biên bản cập nhật để khách xem và xác nhận tại chỗ trước khi quyết toán.
5. **Cho trước** staff và khách không thể thống nhất ngay tại quầy sau khi đã điều chỉnh, **khi** staff bấm "Chuyển lên Provider", **thì** tranh chấp được ghi nhận kèm ghi chú để Provider xem xét; luồng xử lý tiếp theo phía Provider nằm ngoài phạm vi phiên bản này.

---

### Kịch bản 3 — Provider xem lịch sử đền bù theo booking (Ưu tiên: P3)

Provider muốn xem lại chi tiết các khoản đền bù đã xảy ra tại chi nhánh: booking nào, xe nào, hạng mục hư hỏng gì, giá bao nhiêu, khách có tranh chấp không.

**Lý do ưu tiên P3**: Giá trị quản lý cho Provider, không ảnh hưởng đến luồng nghiệp vụ chính. Có thể triển khai sau khi P1 và P2 hoạt động ổn định.

**Kiểm thử độc lập**: Test bằng cách đăng nhập vai Provider, vào chi tiết booking có hư hỏng, và xem đầy đủ breakdown.

**Kịch bản chấp nhận**:

1. **Cho trước** một booking đã hoàn thành có ghi nhận hư hỏng, **khi** Provider mở chi tiết booking đó, **thì** thấy phần "Đền bù hư hỏng" với breakdown từng hạng mục và trạng thái (đã thu / đang tranh chấp / đã hoàn ký quỹ).
2. **Cho trước** Provider xem danh sách phiên trong ngày, **khi** lọc theo "Có hư hỏng", **thì** chỉ hiển thị các phiên đã ghi nhận hư hỏng, kèm tổng tiền đền bù của mỗi phiên.

---

### Các tình huống biên

- Xe không bị hỏng gì → staff không tích ô "Phát hiện hư hỏng" → form hạng mục không xuất hiện, biên bản lưu bình thường.
- Tổng đền bù ≤ ký quỹ → toàn bộ khấu trừ từ ký quỹ, phần còn lại hoàn cho khách.
- Tổng đền bù > ký quỹ → ký quỹ bị giữ lại toàn bộ, phần vượt yêu cầu khách thanh toán thêm tại quầy.
- Staff thêm một hạng mục rồi xoá → tổng đền bù tự cập nhật lại ngay lập tức.
- Khách không đồng ý tại quầy → staff quay lại chỉnh sửa danh sách hạng mục ngay trong phiên, cập nhật giá, hiển thị lại biên bản → khách xem lại và xác nhận → quyết toán chạy với mức đã thống nhất.
- Nếu staff và khách vẫn không thống nhất sau khi đã điều chỉnh → staff chuyển lên Provider kèm ghi chú. (Luồng xử lý phía Provider nằm ngoài phạm vi phiên bản này.)
- Booking BYOC → không có form hư hỏng (khách tự chịu trách nhiệm xe cá nhân).
- Mọi booking (kể cả STAFF_MANUAL) đều đi qua màn hình tổng kết để khách nhìn thấy biên bản tại chỗ trước khi quyết toán — không có luồng auto-confirm hay async qua app.

---

## Yêu cầu *(bắt buộc)*

### Yêu cầu chức năng

- **FR-001**: Khi staff tích "Phát hiện hư hỏng" trong biên bản check-out, hệ thống PHẢI cho phép thêm nhiều hạng mục hư hỏng (không giới hạn số lượng).
- **FR-002**: Mỗi hạng mục hư hỏng PHẢI bao gồm: loại bộ phận (chọn từ danh sách chuẩn hoặc nhập tự do), giá linh kiện (VNĐ, bắt buộc, ≥ 0), phí công sửa chữa (VNĐ, không bắt buộc, mặc định 0).
- **FR-003**: Danh sách loại bộ phận chuẩn PHẢI bao gồm tối thiểu: Bánh xe & lốp, Cánh gió, Khung gầm, Motor điện, Vỏ nhựa (shell), Trục lái (servo), Điều khiển từ xa (remote), Khác.
- **FR-004**: Khi chọn "Khác", hệ thống PHẢI yêu cầu nhập tên hư hỏng tự do (bắt buộc, không để trống).
- **FR-005**: Hệ thống PHẢI tính và hiển thị tổng đền bù theo thời gian thực khi staff thêm, sửa hoặc xoá hạng mục. Công thức: **Tổng đền bù = Σ (giá linh kiện + phí công)** cho mọi hạng mục.
- **FR-006**: Hệ thống PHẢI từ chối lưu biên bản nếu bất kỳ hạng mục nào thiếu giá linh kiện hợp lệ, và chỉ ra đúng hạng mục bị lỗi.
- **FR-007**: Biên bản check-out lưu vào hệ thống PHẢI chứa đầy đủ breakdown từng hạng mục (loại bộ phận, mô tả nếu có, giá linh kiện, phí công, thành tiền dòng) và tổng đền bù.
- **FR-008**: Sau khi staff lưu biên bản có hư hỏng, hệ thống PHẢI hiển thị màn hình tổng kết gồm: ảnh check-in và ảnh check-out cạnh nhau (có thể phóng to), danh sách từng hạng mục hư hỏng, tổng đền bù — đủ rõ để khách đứng cạnh đọc tại quầy.
- **FR-009**: Màn hình tổng kết PHẢI có nút "Xác nhận & Quyết toán" (khách đồng ý tại chỗ) và nút "Có tranh chấp" (khách không đồng ý). Staff có thể điều hướng trở lại màn hình tổng kết này bất cứ lúc nào (thông qua trang checkout của booking) cho đến khi quyết toán hoàn tất.
- **FR-010**: Khi staff bấm "Có tranh chấp", hệ thống PHẢI cho phép staff quay lại chỉnh sửa danh sách hạng mục hư hỏng trong cùng phiên checkout, sau đó hiển thị lại màn hình tổng kết để khách xác nhận tại chỗ. Quyết toán chỉ chạy sau khi khách xác nhận lần cuối. Nếu không thể thống nhất tại quầy, staff có thể chuyển lên Provider kèm ghi chú tranh chấp; luồng xử lý tiếp theo nằm ngoài phạm vi phiên bản này.
- **FR-011**: Khoản đền bù PHẢI được ưu tiên khấu trừ từ ký quỹ đang giữ trước; phần vượt quá ký quỹ mới tính thêm tại quầy.
- **FR-012**: Hệ thống PHẢI loại bỏ hoàn toàn cơ chế slider ước tính và hệ số nhân tự động theo tên xe.
- **FR-013**: Hệ thống KHÔNG gửi thông báo async yêu cầu khách xác nhận biên bản qua app — toàn bộ xác nhận diễn ra tại chỗ.

### Thực thể dữ liệu chính

- **Hạng mục hư hỏng (DamageLineItem)**: Loại bộ phận (từ danh sách chuẩn), mô tả tự do (khi chọn "Khác"), giá linh kiện, phí công, thành tiền dòng. Thuộc về một biên bản check-out.
- **Biên bản kiểm xe (Inspection)**: Thực thể đã tồn tại, cần mở rộng để lưu danh sách DamageLineItem thay vì chỉ một giá trị đơn.
- **Phản hồi tại quầy**: Trạng thái (đồng ý tại chỗ / có tranh chấp), ghi chú tranh chấp nếu có, thời điểm xác nhận.

---

## Tiêu chí thành công *(bắt buộc)*

### Kết quả đo lường được

- **SC-001**: Staff hoàn tất toàn bộ form hư hỏng (thêm hạng mục, nhập giá, lưu biên bản) trong dưới 3 phút với tối đa 5 hạng mục.
- **SC-002**: 100% biên bản check-out có hư hỏng đều chứa ít nhất một hạng mục với giá linh kiện cụ thể — không còn biên bản nào chỉ có tổng đền bù mà không có breakdown.
- **SC-003**: Tỷ lệ khiếu nại phải chuyển lên Provider không vượt quá 10% tổng số biên bản có hư hỏng (thể hiện khách có thể tự đánh giá và đồng ý khi breakdown rõ ràng).
- **SC-004**: Không có trường hợp nào tổng đền bù tính ra sai lệch so với tổng cộng thủ công các hạng mục đã nhập.
- **SC-005**: Khách có thể hoàn thành đọc biên bản và đối chiếu ảnh tại quầy trong dưới 3 phút kể từ khi staff quay màn hình tổng kết.

---

## Giả định

- Staff đã được huấn luyện và biết giá thị trường của các linh kiện RC phổ biến; hệ thống không cần gợi ý giá tham khảo trong phiên bản đầu.
- Danh sách loại bộ phận chuẩn do nhóm vận hành cung cấp và có thể được cấu hình bởi Admin về sau; phiên bản đầu dùng danh sách cố định.
- Chỉ áp dụng cho booking chế độ RENTAL — BYOC không có form hư hỏng (khách tự chịu trách nhiệm xe cá nhân).
- Cả staff và khách đều có mặt tại quầy trong suốt quy trình check-out — không có trường hợp khách checkout từ xa. Do đó xác nhận biên bản diễn ra tại chỗ, không cần luồng async qua app. Áp dụng cho mọi loại booking kể cả STAFF_MANUAL.
- Cơ chế ký quỹ và quy trình quyết toán hiện có không thay đổi — chỉ thay đổi nguồn dữ liệu tính tổng đền bù (từ breakdown thay vì giá trị đơn).
- Ảnh check-in và check-out đã được chụp và lưu từ luồng inspection hiện tại; tính năng này dùng lại, không thay đổi quy trình chụp ảnh.
- Staff là người xử lý tranh chấp trực tiếp; chỉ những case phức tạp (khách kiên quyết không chấp nhận, tổng tiền lớn) mới được chuyển lên Provider. Phiên bản này cần đảm bảo tranh chấp được lưu đủ dữ liệu breakdown và ghi chú để Staff và Provider đều có thể xem xét.
