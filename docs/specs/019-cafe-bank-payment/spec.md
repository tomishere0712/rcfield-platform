# Feature Specification: Thanh toán chuyển khoản theo từng chi nhánh

**Feature Branch**: `019-cafe-bank-payment`
**Created**: 2026-08-11
**Status**: Draft
**Input**: User description: "Cho phép mỗi chi nhánh nhận tiền booking vào tài khoản ngân hàng của chính mình qua mã QR, tiền vào là tự động xác nhận booking như thanh toán ngân hàng thật. Toàn bộ đường đi tiền là thật; chỉ mô phỏng mắt xích ngân hàng để demo được khi chưa đăng ký dịch vụ đối soát. Chi nhánh chưa cấu hình thì rơi về cổng thanh toán dùng chung như hiện tại, luồng hiện tại giữ nguyên."

## Clarifications

### Session 2026-08-11

- Q: Khi chi nhánh đã bật nhận chuyển khoản, khách có được chọn giữa cổng dùng chung và chuyển khoản không? → A: Có — khách chọn một trong hai; hệ thống phải đảm bảo mỗi booking chỉ có một phiên thanh toán sống tại một thời điểm để không thu hai lần
- Q: Tiền về sau khi hết hạn giữ chỗ thì xử lý thế nào? → A: Luôn treo cho người vận hành xử lý tay; hệ thống không bao giờ tự xác nhận lại booking đã quá hạn, kể cả khi chỗ vẫn còn trống
- Q: Chế độ ngân hàng mô phỏng có bị chặn ở môi trường thật không? → A: Không chặn — bật được ở mọi môi trường để demo; việc tắt đi khi chuyển sang vận hành thương mại là quyết định vận hành, thực hiện bằng biến môi trường
- Q: Khách chuyển khoản hai lần cho cùng một booking thì xử lý sao? → A: Trang mô phỏng phải khoá nút xác nhận ngay sau lần bấm đầu để không bấm được lần hai; phía server, khoản đầu xác nhận booking và mọi khoản sau đó treo lại chờ hoàn
- Q: Ai xử lý những giao dịch bị treo? → A: Nhân viên chi nhánh xem và gán được các giao dịch **đang treo** của chi nhánh mình; toàn bộ sổ giao dịch và mọi con số tổng vẫn chỉ chủ doanh nghiệp thấy
- Q: Booking do nhân viên tạo tại quầy có dùng mã QR không? → A: Không — nằm ngoài phạm vi tính năng này, giữ nguyên cách thanh toán hiện tại
- Q: Khách thấy gì khi chuyển thiếu tiền? → A: Không cần giao diện riêng — trang mô phỏng điền sẵn số tiền nên không chuyển thiếu được; trang mã QR chỉ có ba trạng thái đang chờ / thành công / hết hạn. Quy tắc chặn ở phía server vẫn giữ để phòng luồng ngân hàng thật
- Q: Mã QR mẫu để chủ quán tự kiểm tra tài khoản có bị thay bằng mã mô phỏng không? → A: Không — mã QR mẫu luôn là mã ngân hàng thật kể cả khi chế độ mô phỏng đang bật, vì đây là hàng rào duy nhất chứng minh số tài khoản có thật

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Khách quét QR và booking tự xác nhận (Priority: P1)

Khách đang ở bước thanh toán của một booking tại chi nhánh đã bật nhận chuyển khoản. Màn hình cho khách chọn: trả qua cổng thanh toán dùng chung như trước, hoặc chuyển khoản thẳng cho quán. Khách chọn chuyển khoản, và màn hình hiện một mã QR kèm số tiền và nội dung chuyển khoản. Khách rút điện thoại quét mã, xác nhận chuyển khoản trên điện thoại, rồi bỏ điện thoại xuống.

Trong vòng vài giây, **màn hình đặt lịch trên máy tính tự đổi sang "Đã thanh toán"** mà không ai chạm vào nó. Booking được xác nhận, chỗ giữ được chốt, email xác nhận gửi đi — giống hệt như khi thanh toán qua cổng dùng chung.

Đằng sau, hệ thống nhận được một thông báo "tiền đã về tài khoản" mang đúng định dạng của dịch vụ đối soát ngân hàng, tự đối chiếu nội dung chuyển khoản với booking đang chờ, kiểm tra số tiền, chống ghi nhận trùng, rồi mới xác nhận. Đây là phần chạy thật và dùng được với tiền thật; chỉ có bên phát ra thông báo đó là mô phỏng khi chưa đăng ký dịch vụ.

**Why this priority**: Đây là toàn bộ giá trị của tính năng và là thứ duy nhất khách nhìn thấy. Nếu chỉ làm story này (với cấu hình tài khoản được nạp sẵn), đã có một vòng thanh toán chạy được đầu-cuối và demo được trước hội đồng. Mọi story còn lại chỉ làm nó vận hành được lâu dài.

**Independent Test**: Nạp sẵn một cấu hình nhận tiền cho một chi nhánh, tạo một booking ở trạng thái chờ thanh toán, mở màn hình thanh toán trên một máy, quét mã bằng một thiết bị khác và xác nhận chuyển khoản. Booking phải chuyển sang đã xác nhận và màn hình máy thứ nhất phải tự cập nhật, không cần bấm tải lại.

**Acceptance Scenarios**:

1. **Given** một chi nhánh đã bật nhận chuyển khoản và một booking 350.000đ đang chờ thanh toán, **When** khách quét mã và xác nhận chuyển khoản đúng số tiền, **Then** booking chuyển sang đã xác nhận, chỗ giữ được chốt, và màn hình thanh toán tự đổi trạng thái trong vòng 5 giây mà không cần thao tác nào.
2. **Given** cùng booking đó, **When** hệ thống nhận được thông báo tiền về, **Then** thông báo đó phải mang khoá xác thực hợp lệ; thông báo không có hoặc sai khoá bị từ chối và không làm thay đổi bất kỳ booking nào.
3. **Given** một thông báo tiền về đã được xử lý thành công, **When** cùng thông báo đó được gửi lại thêm 9 lần, **Then** booking chỉ được xác nhận một lần, không phát sinh bản ghi giao dịch trùng, và mọi lần gửi lại đều được trả lời là đã tiếp nhận.
4. **Given** một chi nhánh **chưa** cấu hình nhận chuyển khoản, **When** khách đến bước thanh toán, **Then** hệ thống đi thẳng vào cổng thanh toán dùng chung như hiện tại, không hiển thị lựa chọn phương thức và không hiển thị mã QR — không có bất kỳ thay đổi nào so với hành vi trước tính năng này.
5. **Given** kết nối cập nhật tức thời bị gián đoạn, **When** tiền về, **Then** màn hình thanh toán vẫn phát hiện được trạng thái mới trong vòng 10 giây bằng cơ chế kiểm tra định kỳ dự phòng.
6. **Given** mã QR đang hiển thị, **When** hết thời gian giữ chỗ mà chưa có tiền về, **Then** màn hình thông báo hết hạn và ngừng chờ, chỗ giữ được nhả như luồng hiện tại.
7. **Given** chi nhánh đã bật nhận chuyển khoản, **When** khách đến bước thanh toán, **Then** khách thấy cả hai lựa chọn và tự chọn một; không lựa chọn nào được coi là mặc định thay khách.
8. **Given** khách đã chọn chuyển khoản và mã QR đang hiển thị, **When** khách quay lại và đổi sang cổng dùng chung, **Then** mã QR cũ hết hiệu lực trước khi phiên thanh toán mới được mở, sao cho không tồn tại hai đường thu tiền sống cùng lúc trên một booking.
9. **Given** khách đã đổi sang cổng dùng chung và thanh toán thành công, **When** một khoản tiền chuyển khoản theo mã QR cũ vẫn về tới, **Then** hệ thống **không** thu nhận nó vào booking đã trả, mà đưa vào sổ đối soát ở trạng thái cần xử lý để hoàn lại cho khách.

---

### User Story 2 - Chủ doanh nghiệp khai tài khoản nhận tiền cho từng chi nhánh (Priority: P2)

Chủ doanh nghiệp mở phần cấu hình của một chi nhánh và thấy mục **Nhận thanh toán**. Họ chọn ngân hàng, nhập số tài khoản và tên chủ tài khoản.

Trước khi được bật, hệ thống sinh ra một **mã QR mẫu số tiền nhỏ** và yêu cầu chủ doanh nghiệp tự quét thử bằng điện thoại để nhìn tận mắt xem tên người nhận hiện lên có đúng là mình không. Chỉ khi họ xác nhận đã kiểm tra, chi nhánh mới thực sự chuyển sang nhận chuyển khoản; trước đó, mọi booking của chi nhánh vẫn đi qua cổng dùng chung.

Mã QR mẫu này **luôn là mã ngân hàng thật**, kể cả khi chế độ mô phỏng đang bật. Nếu nó cũng bị thay bằng mã mô phỏng thì việc quét thử chỉ hiển thị lại đúng những gì chủ quán vừa gõ vào — hàng rào an toàn trở thành hình thức và lỗi gõ sai số tài khoản đi lọt.

Mỗi chi nhánh có tài khoản riêng — hai chi nhánh của cùng một chủ doanh nghiệp có thể nhận tiền vào hai tài khoản khác nhau.

**Why this priority**: Không có bước này thì tính năng không mở rộng ra ngoài một chi nhánh được nạp tay. Bước tự quét thử là hàng rào duy nhất chặn được lỗi gõ nhầm một chữ số — lỗi khiến tiền của mọi khách chạy vào tài khoản người lạ mà hệ thống không có cách nào tự phát hiện.

**Independent Test**: Mở cấu hình một chi nhánh, nhập một tài khoản, kiểm tra rằng chi nhánh vẫn dùng cổng dùng chung khi chưa xác nhận quét thử; sau khi xác nhận, kiểm tra rằng bước thanh toán chuyển sang hiển thị mã QR với đúng tài khoản vừa nhập.

**Acceptance Scenarios**:

1. **Given** một chi nhánh chưa có cấu hình nhận tiền, **When** chủ doanh nghiệp nhập ngân hàng, số tài khoản và tên chủ tài khoản rồi lưu, **Then** cấu hình được lưu ở trạng thái **chưa xác minh** và chi nhánh vẫn dùng cổng dùng chung.
2. **Given** cấu hình đang ở trạng thái chưa xác minh, **When** chủ doanh nghiệp quét mã QR mẫu và bấm xác nhận đúng tài khoản, **Then** cấu hình chuyển sang đã xác minh và từ booking tiếp theo trở đi chi nhánh nhận tiền bằng mã QR.
3. **Given** chi nhánh đang nhận chuyển khoản, **When** chủ doanh nghiệp sửa số tài khoản, **Then** cấu hình quay lại trạng thái chưa xác minh, chi nhánh tạm rơi về cổng dùng chung, và phải quét thử lại mới bật lại được.
4. **Given** một chủ doanh nghiệp có hai chi nhánh, **When** họ cấu hình hai tài khoản khác nhau, **Then** mỗi chi nhánh sinh mã QR về đúng tài khoản của mình.
5. **Given** người đang đăng nhập không phải chủ sở hữu chi nhánh đó, **When** họ cố xem hoặc sửa cấu hình nhận tiền, **Then** hệ thống từ chối và không để lộ số tài khoản.
6. **Given** một cấu hình đã lưu, **When** hiển thị lại trên màn hình danh sách, **Then** số tài khoản được che bớt, chỉ hiện đầy đủ khi đang ở chế độ chỉnh sửa.
7. **Given** chế độ mô phỏng đang bật, **When** chủ doanh nghiệp quét mã QR mẫu, **Then** điện thoại mở **app ngân hàng thật** với đúng số tài khoản vừa nhập — không phải trang mô phỏng — để họ đọc được tên chủ tài khoản do ngân hàng trả về.

---

### User Story 3 - Đối soát và xử lý giao dịch lệch (Priority: P3)

Chủ doanh nghiệp mở sổ giao dịch ngân hàng của chi nhánh và thấy **mọi khoản tiền hệ thống nhận được báo về**, kể cả những khoản không khớp với booking nào: khách chuyển sai nội dung, chuyển thiếu tiền, hoặc chuyển nhầm.

Với những khoản chưa khớp, họ thấy rõ lý do chưa khớp và có thể gán thủ công vào đúng booking, hoặc đánh dấu là không liên quan.

Nhân viên trực quầy cũng cần xử lý được, vì họ là người đối mặt khách đang đứng hỏi "tôi chuyển rồi mà sao chưa được". Nhưng nhân viên **chỉ thấy đúng những giao dịch đang treo của chi nhánh mình** — không thấy sổ đầy đủ, không thấy bất kỳ con số tổng nào. Số dư tài khoản ngân hàng vẫn là chuyện riêng của chủ doanh nghiệp.

**Why this priority**: Đây là thứ biến tính năng từ "chạy được lúc demo" thành "dùng được với tiền thật". Không có sổ này thì mọi giao dịch lệch biến mất không dấu vết, và con số trong hệ thống không bao giờ khớp được với sao kê ngân hàng.

**Independent Test**: Gửi vào hệ thống một giao dịch có nội dung không chứa mã tham chiếu và một giao dịch thiếu tiền so với booking. Cả hai phải xuất hiện trong sổ với lý do chưa khớp; gán thủ công một giao dịch vào booking đúng và kiểm tra booking được xác nhận.

**Acceptance Scenarios**:

1. **Given** khách chuyển đúng số tiền nhưng nội dung bị mất mã tham chiếu, **When** hệ thống nhận được báo tiền về, **Then** giao dịch được lưu vào sổ với trạng thái **chưa khớp**, không booking nào bị thay đổi, và thông báo được trả lời là đã tiếp nhận.
2. **Given** khách chuyển thiếu so với số tiền booking, **When** hệ thống nhận được báo tiền về, **Then** giao dịch được lưu với trạng thái **thiếu tiền** kèm số còn thiếu, và booking **không** được xác nhận.
3. **Given** khách chuyển thừa, **When** hệ thống nhận được báo tiền về, **Then** booking được xác nhận và phần chênh lệch được ghi rõ trong sổ để chủ doanh nghiệp tự xử lý.
4. **Given** một giao dịch đang ở trạng thái chưa khớp, **When** chủ doanh nghiệp gán nó vào một booking đang chờ thanh toán có số tiền khớp, **Then** booking được xác nhận và giao dịch chuyển sang đã khớp, kèm ghi nhận ai đã gán và lúc nào.
5. **Given** người đang đăng nhập là nhân viên chi nhánh, **When** họ mở phần đối soát, **Then** họ chỉ thấy các giao dịch **đang treo** của chi nhánh mình, không thấy giao dịch đã xử lý xong và không thấy bất kỳ con số tổng nào.
6. **Given** nhân viên đang xem một giao dịch treo, **When** họ gán nó vào một booking đang chờ thanh toán có số tiền khớp, **Then** thao tác thành công và được ghi lại đúng tên nhân viên đó.
7. **Given** một giao dịch báo về không thuộc tài khoản của chi nhánh nào trong hệ thống, **When** hệ thống nhận được, **Then** giao dịch vẫn được lưu lại để không mất dấu vết, không gắn với chi nhánh nào, và không nhân viên nào thấy được.
8. **Given** hai khoản tiền cùng về cho một booking (khách chuyển hai lần), **When** khoản thứ nhất đã xác nhận booking, **Then** khoản thứ hai xuất hiện trong sổ ở trạng thái treo kèm lý do "đã thanh toán rồi", chờ hoàn lại cho khách.

---

### User Story 4 - Chuyển sang ngân hàng thật mà không sửa code (Priority: P4)

Khi doanh nghiệp đăng ký dịch vụ đối soát ngân hàng thật, người vận hành hệ thống chỉ cần: khai địa chỉ nhận thông báo của hệ thống vào trang quản trị của nhà cung cấp dịch vụ, đổi chế độ của chi nhánh sang nhận tiền thật, và tắt chế độ mô phỏng.

Không sửa một dòng mã nào trong luồng đặt lịch, luồng xác nhận, hay luồng đối soát.

**Why this priority**: Đây là điều kiện để bảo vệ được thiết kế trước hội đồng và là lý do phần mô phỏng phải bám đúng định dạng của nhà cung cấp thật ngay từ đầu. Nó không thêm chức năng cho người dùng cuối nên xếp cuối, nhưng ràng buộc cách ba story trên được xây.

**Independent Test**: Tắt chế độ mô phỏng, gửi vào hệ thống một thông báo đúng định dạng của nhà cung cấp thật bằng công cụ gửi yêu cầu bất kỳ, và kiểm tra booking được xác nhận đúng như khi dùng bên mô phỏng.

**Acceptance Scenarios**:

1. **Given** chế độ mô phỏng đang tắt, **When** một thông báo tiền về đúng định dạng nhà cung cấp thật được gửi tới, **Then** hệ thống xử lý y hệt như với bên mô phỏng và xác nhận booking.
2. **Given** chế độ mô phỏng đang tắt, **When** bất kỳ ai truy cập các đường dẫn của bên mô phỏng, **Then** hệ thống trả về không tồn tại — không phải chỉ ẩn nút trên giao diện.
3. **Given** hệ thống đang chạy ở bất kỳ môi trường nào, **When** người vận hành bật hoặc tắt chế độ mô phỏng bằng cấu hình vận hành, **Then** thay đổi có hiệu lực sau khi khởi động lại mà không cần sửa mã, và trạng thái đang bật/tắt được ghi rõ vào nhật ký khởi động.
4. **Given** phần mô phỏng bị gỡ bỏ hoàn toàn khỏi hệ thống, **When** chạy toàn bộ kiểm thử của luồng thanh toán, **Then** không có kiểm thử nào hỏng — chứng minh phần thật không phụ thuộc phần mô phỏng.

---

### Edge Cases

- **Tiền về sau khi hết hạn giữ chỗ**: khách chuyển khoản chậm, tiền đã vào tài khoản chủ quán nhưng chỗ đã bị nhả. Hệ thống **không bao giờ tự xác nhận lại**, kể cả khi chỗ vẫn còn trống — giao dịch được treo ở trạng thái cần xử lý và người vận hành quyết định giữ chỗ lại hay hoàn tiền. Điều này áp dụng cả khi tiền về chỉ chậm vài giây.
- **Tiền về đúng lúc hết hạn**: hệ thống phải xét theo trạng thái booking chứ không chỉ theo đồng hồ — chỉ tự xác nhận khi booking vẫn đang chờ thanh toán **và** chưa quá hạn; mọi trường hợp còn lại đều treo.
- **Khách trả bằng cả hai đường**: khách chọn chuyển khoản, đổi ý sang cổng dùng chung và trả xong, nhưng vẫn quét mã QR cũ. Hệ thống phải nhận ra booking đã trả và treo khoản tiền thừa thay vì cộng dồn hoặc bỏ qua.
- **Khách chuyển khoản hai lần**: ở luồng mô phỏng không xảy ra được vì nút bị khoá sau lần bấm đầu; ở luồng ngân hàng thật thì hoàn toàn có thể, vì khách quét lại mã QR cũ hoặc tự chuyển trong app. Khoản đầu xác nhận booking, khoản sau treo chờ hoàn.
- **Khách chuyển thiếu tiền**: không xảy ra ở luồng mô phỏng vì số tiền được điền sẵn và không sửa được. Ở luồng ngân hàng thật, khách có thể sửa số tiền trong app hoặc gõ tay số tài khoản thay vì quét — nên quy tắc chặn phía server vẫn phải có, dù giao diện không cần trạng thái riêng cho nó.
- **Hai booking cùng số tiền, cùng thời điểm**: hệ thống không được đoán theo số tiền; việc khớp phải dựa trên mã tham chiếu duy nhất, và khi không có mã thì để chưa khớp thay vì khớp nhầm.
- **Chủ doanh nghiệp đổi số tài khoản khi đang có booking chờ thanh toán**: mã QR đã hiển thị cho khách trỏ về tài khoản cũ. Hệ thống phải vẫn nhận được tiền vào tài khoản cũ cho những booking đó, hoặc buộc khách lấy mã mới.
- **Khách quét mã rồi không chuyển khoản**: booking hết hạn và nhả chỗ như luồng hiện tại, không có giao dịch nào được ghi.
- **Khách chuyển đúng nhưng thông báo không bao giờ tới** (dịch vụ đối soát lỗi): booking hết hạn dù tiền đã về. Giao dịch sẽ xuất hiện trong sổ khi dịch vụ gửi bù, và rơi vào tình huống "tiền về sau khi hết hạn".
- **Thông báo tiền về mang khoá xác thực sai**: bị từ chối, ghi log, không lưu vào sổ giao dịch để tránh bị nhồi rác.
- **Chi nhánh bị khoá do hết hạn gói dịch vụ**: mã QR không được sinh ra và chi nhánh không nhận được booking mới, đúng như ràng buộc hiện có.
- **Khách mở màn hình thanh toán trên chính điện thoại đang quét**: mã QR phải bấm được để mở thẳng, không bắt buộc phải quét bằng thiết bị thứ hai.
- **Cùng một khoản tiền được báo về hai lần bởi hai nguồn khác nhau** (bên mô phỏng và dịch vụ thật cùng bật): chống trùng phải dựa trên mã giao dịch của ngân hàng, không phải nguồn gửi.

## Requirements *(mandatory)*

### Functional Requirements

**Chọn phương thức thanh toán**

- **FR-001**: Hệ thống MUST xác định các phương thức thanh toán khả dụng theo từng chi nhánh tại thời điểm khách bắt đầu thanh toán.
- **FR-002**: Hệ thống MUST dùng cổng thanh toán dùng chung hiện tại khi chi nhánh chưa có cấu hình nhận tiền, hoặc có nhưng chưa được xác minh.
- **FR-003**: Hệ thống MUST giữ nguyên hoàn toàn hành vi của luồng thanh toán qua cổng dùng chung — tính năng này không được làm thay đổi bất kỳ bước nào của luồng đó.
- **FR-004**: Khi chi nhánh đã bật nhận chuyển khoản, hệ thống MUST cho khách tự chọn giữa cổng thanh toán dùng chung và chuyển khoản, và MUST không chọn sẵn thay khách.
- **FR-004a**: Hệ thống MUST đảm bảo mỗi booking chỉ có **một phiên thanh toán còn hiệu lực** tại một thời điểm; khi khách đổi phương thức, phiên cũ MUST bị vô hiệu trước khi phiên mới được mở.
- **FR-004b**: Hệ thống MUST không thu nhận tiền chuyển khoản vào một booking đã được thanh toán bằng phương thức khác; khoản tiền đó MUST được đưa vào sổ đối soát ở trạng thái cần xử lý.
- **FR-004c**: Hệ thống MUST hiển thị lựa chọn phương thức chỉ khi có từ hai phương thức khả dụng trở lên; khi chỉ có một, MUST đi thẳng vào phương thức đó.

**Cấu hình tài khoản nhận tiền**

- **FR-005**: Chủ doanh nghiệp MUST khai được ngân hàng, số tài khoản và tên chủ tài khoản riêng cho từng chi nhánh mình sở hữu.
- **FR-006**: Hệ thống MUST sinh được mã QR mẫu với số tiền tượng trưng để chủ doanh nghiệp tự quét kiểm tra trước khi bật.
- **FR-006a**: Mã QR mẫu MUST luôn là mã chuyển khoản ngân hàng thật, **kể cả khi chế độ mô phỏng đang bật** — nếu không, bước xác minh chỉ hiển thị lại dữ liệu người dùng vừa nhập và mất hoàn toàn tác dụng.
- **FR-007**: Hệ thống MUST giữ cấu hình ở trạng thái chưa xác minh cho tới khi chủ doanh nghiệp xác nhận đã quét thử, và MUST không dùng tài khoản chưa xác minh để nhận tiền.
- **FR-008**: Hệ thống MUST đưa cấu hình về trạng thái chưa xác minh mỗi khi số tài khoản hoặc ngân hàng bị thay đổi.
- **FR-009**: Hệ thống MUST chỉ cho chủ doanh nghiệp sở hữu chi nhánh xem và sửa cấu hình nhận tiền; nhân viên và chủ doanh nghiệp khác MUST bị từ chối.
- **FR-010**: Hệ thống MUST che bớt số tài khoản khi hiển thị ngoài chế độ chỉnh sửa.

**Mã tham chiếu và mã QR**

- **FR-011**: Hệ thống MUST gắn cho mỗi booking một mã tham chiếu ngắn, duy nhất trong toàn hệ thống, dùng làm nội dung chuyển khoản.
- **FR-012**: Mã QR MUST mang sẵn số tiền chính xác và nội dung chuyển khoản, để khách không phải tự gõ.
- **FR-013**: Màn hình thanh toán MUST hiển thị số tiền, nội dung chuyển khoản và thời gian còn lại của việc giữ chỗ song song với mã QR.
- **FR-013a**: Màn hình mã QR MUST chỉ có đúng ba trạng thái: **đang chờ**, **thành công**, **hết hạn**. Không có trạng thái trung gian cho việc chuyển thiếu, vì mã QR đã mang sẵn số tiền nên khách không phải tự gõ.

**Nhận báo tiền về và xác nhận**

- **FR-014**: Hệ thống MUST cung cấp một điểm nhận thông báo tiền về, dùng chung cho cả nguồn mô phỏng và dịch vụ đối soát thật.
- **FR-015**: Hệ thống MUST từ chối thông báo không mang khoá xác thực hợp lệ.
- **FR-016**: Hệ thống MUST bỏ qua các giao dịch không phải tiền vào.
- **FR-017**: Hệ thống MUST rút mã tham chiếu ra khỏi nội dung chuyển khoản bằng cách dò tìm, không so khớp toàn chuỗi — vì ngân hàng có thể thêm ký tự vào nội dung.
- **FR-018**: Hệ thống MUST đối chiếu số tiền nhận được với số tiền booking đang chờ, và MUST không xác nhận booking khi số tiền nhận được nhỏ hơn.
- **FR-019**: Hệ thống MUST chống ghi nhận trùng dựa trên mã giao dịch của ngân hàng, sao cho cùng một thông báo gửi nhiều lần chỉ có tác dụng một lần.
- **FR-019a**: Khi nhiều giao dịch **khác nhau** cùng mang một mã tham chiếu về tới, hệ thống MUST chỉ dùng khoản đầu tiên để xác nhận booking; mọi khoản sau MUST được treo lại kèm lý do "booking đã thanh toán" thay vì cộng dồn hay bỏ qua.
- **FR-018a**: Hệ thống MUST chỉ tự xác nhận booking khi booking vẫn đang chờ thanh toán **và** chưa quá thời hạn giữ chỗ.
- **FR-018b**: Khi tiền về sau khi booking đã hết hạn hoặc đã chuyển sang trạng thái khác, hệ thống MUST **không** tự xác nhận lại và MUST không tự giữ chỗ, kể cả khi chỗ vẫn còn trống — giao dịch MUST được treo ở trạng thái cần người vận hành xử lý.
- **FR-018c**: Hệ thống MUST thông báo cho người vận hành chi nhánh khi có giao dịch rơi vào trạng thái cần xử lý, để tiền của khách không nằm im không ai biết.
- **FR-020**: Hệ thống MUST dùng đúng cơ chế xác nhận booking đang được cổng dùng chung sử dụng, không tạo nhánh xác nhận riêng.
- **FR-021**: Hệ thống MUST luôn trả lời "đã tiếp nhận" cho mọi thông báo hợp lệ về mặt xác thực, kể cả khi không khớp booking nào — để dịch vụ đối soát không gửi lại vô hạn.

**Sổ giao dịch và đối soát**

- **FR-022**: Hệ thống MUST lưu lại mọi giao dịch nhận được, kể cả giao dịch không khớp booking, không thuộc chi nhánh nào, hoặc thiếu tiền.
- **FR-023**: Mỗi giao dịch MUST có trạng thái khớp rõ ràng và lý do khi chưa khớp.
- **FR-024**: Chủ doanh nghiệp MUST gán được thủ công một giao dịch chưa khớp vào một booking đang chờ thanh toán, và thao tác này MUST được ghi lại kèm người thực hiện.
- **FR-025**: Hệ thống MUST chỉ cho chủ doanh nghiệp sở hữu chi nhánh xem **toàn bộ** sổ giao dịch của chi nhánh đó, bao gồm mọi con số tổng.
- **FR-025a**: Nhân viên được phân công vào chi nhánh MUST xem và gán được các giao dịch **đang treo** của chi nhánh mình, để xử lý được khách đang đứng chờ tại quầy.
- **FR-025b**: Nhân viên MUST không xem được giao dịch đã xử lý xong, không xem được giao dịch của chi nhánh khác, và MUST không thấy bất kỳ con số tổng hợp nào về tiền của chi nhánh.
- **FR-025c**: Giao dịch không thuộc tài khoản của chi nhánh nào MUST chỉ hiển thị cho chủ doanh nghiệp, không hiển thị cho nhân viên.

**Cập nhật màn hình khách**

- **FR-026**: Màn hình thanh toán MUST tự chuyển trạng thái khi booking được xác nhận, không cần khách thao tác — vì khách quét mã trên một thiết bị khác với thiết bị đang mở màn hình.
- **FR-027**: Hệ thống MUST có cơ chế dự phòng để màn hình vẫn phát hiện được trạng thái mới khi kênh cập nhật tức thời bị gián đoạn.

**Chế độ mô phỏng**

- **FR-028**: Hệ thống MUST cung cấp một bên mô phỏng ngân hàng, hiển thị được thông tin người nhận, số tiền, nội dung chuyển khoản và cho phép xác nhận chuyển khoản, để demo được khi chưa đăng ký dịch vụ đối soát.
- **FR-028a**: Trang mô phỏng MUST điền sẵn toàn bộ thông tin bao gồm số tiền; khách MUST không sửa được số tiền và chỉ việc bấm xác nhận.
- **FR-028b**: Trang mô phỏng MUST khoá nút xác nhận ngay sau lần bấm đầu tiên, để không tạo ra hai giao dịch từ một phiên.
- **FR-029**: Bên mô phỏng MUST phát ra thông báo tiền về đúng định dạng và đúng cách xác thực của dịch vụ đối soát thật.
- **FR-030**: Bên mô phỏng MUST bật/tắt được ở mọi môi trường bằng một cấu hình vận hành duy nhất, và khi tắt MUST không truy cập được qua bất kỳ đường dẫn nào — không phải chỉ ẩn nút trên giao diện.
- **FR-030a**: Hệ thống MUST ghi rõ vào nhật ký khởi động rằng chế độ mô phỏng đang bật hay tắt, để người vận hành không bị nhầm về trạng thái đang chạy.
- **FR-031**: Bên mô phỏng MUST không được phụ thuộc trực tiếp vào logic đặt lịch — gỡ bỏ nó khỏi hệ thống MUST không làm hỏng luồng thanh toán.
- **FR-032**: Chế độ mô phỏng MUST là lựa chọn ở cấp môi trường vận hành, không phải lựa chọn chủ doanh nghiệp bật được từ giao diện.
- **FR-032a**: Khi chế độ mô phỏng đang bật, màn hình thanh toán MUST nói rõ với khách rằng đây là giao dịch mô phỏng, để không ai hiểu nhầm là đã trả tiền thật.

**Ghi nhận và truy vết**

- **FR-033**: Hệ thống MUST ghi lại mọi thay đổi cấu hình nhận tiền, mọi lần xác minh, và mọi lần gán giao dịch thủ công, kèm người thực hiện và thời điểm.
- **FR-034**: Hệ thống MUST lưu nguyên vẹn nội dung thông báo tiền về nhận được, phục vụ đối chiếu khi có tranh chấp.

### Key Entities

- **Cấu hình nhận tiền của chi nhánh**: gắn với đúng một chi nhánh; gồm phương thức nhận tiền, ngân hàng, số tài khoản, tên chủ tài khoản, trạng thái đã xác minh hay chưa, thời điểm xác minh. Là thứ quyết định chi nhánh dùng cổng dùng chung hay nhận chuyển khoản.
- **Mã tham chiếu thanh toán**: chuỗi ngắn duy nhất gắn với một booking, xuất hiện trong nội dung chuyển khoản; là cầu nối duy nhất giữa một khoản tiền trong sao kê ngân hàng và một booking trong hệ thống.
- **Giao dịch ngân hàng nhận được**: một khoản tiền hệ thống được báo là đã về tài khoản; gồm mã giao dịch của ngân hàng (dùng để chống trùng), tài khoản nhận, số tiền, nội dung, thời điểm, trạng thái khớp, lý do chưa khớp, booking đã khớp (nếu có), và toàn văn thông báo gốc. Đây là sổ đối soát với sao kê ngân hàng.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Từ lúc khách xác nhận chuyển khoản trên điện thoại đến lúc màn hình đặt lịch trên thiết bị khác đổi trạng thái, không quá 5 giây, và không cần bất kỳ thao tác thủ công nào của khách hay nhân viên.
- **SC-002**: 100% giao dịch tiền vào mà hệ thống được báo đều xuất hiện trong sổ đối soát, kể cả giao dịch không khớp booking nào.
- **SC-003**: Gửi lại cùng một thông báo tiền về 10 lần chỉ tạo ra 1 bản ghi giao dịch và 1 lần xác nhận booking.
- **SC-004**: 100% booking của các chi nhánh chưa cấu hình nhận tiền vẫn đi qua cổng thanh toán dùng chung với hành vi không khác gì trước khi có tính năng này.
- **SC-005**: Chuyển từ ngân hàng mô phỏng sang dịch vụ đối soát thật hoàn tất chỉ bằng thay đổi cấu hình vận hành, không sửa dòng mã nào trong luồng đặt lịch, xác nhận hay đối soát.
- **SC-006**: Khi cờ mô phỏng tắt, 100% đường dẫn của bên mô phỏng trả về không tồn tại.
- **SC-007**: Không có booking nào được xác nhận khi số tiền nhận được nhỏ hơn số tiền phải trả.
- **SC-010**: Không có booking nào được xác nhận sau khi đã quá hạn giữ chỗ — 100% trường hợp tiền về muộn đều dừng ở trạng thái chờ người vận hành xử lý.
- **SC-011**: Không có booking nào bị thu tiền hai lần khi khách đổi qua lại giữa hai phương thức thanh toán, kiểm chứng bằng kịch bản đổi phương thức rồi trả bằng cả hai đường.
- **SC-012**: Mọi khoản tiền về vượt quá số phải trả của một booking đều xuất hiện trong sổ đối soát ở trạng thái treo — không khoản nào bị cộng dồn im lặng hoặc biến mất.
- **SC-013**: Nhân viên không truy cập được bất kỳ con số tổng nào về tiền của chi nhánh, kiểm chứng bằng cách rà toàn bộ dữ liệu trả về cho tài khoản nhân viên.
- **SC-008**: Chủ doanh nghiệp hoàn tất khai báo và tự kiểm tra tài khoản nhận tiền của một chi nhánh trong dưới 3 phút, và phát hiện được lỗi gõ sai số tài khoản ngay tại bước quét thử.
- **SC-009**: Tổng số tiền các giao dịch đã khớp trong sổ đối soát của một chi nhánh bằng đúng tổng tiền các booking đã xác nhận qua chuyển khoản của chi nhánh đó trong cùng khoảng thời gian.

## Assumptions

- Dịch vụ đối soát ngân hàng được lấy làm chuẩn định dạng là loại dịch vụ đọc biến động số dư rồi đẩy thông báo về hệ thống (SePay, Casso và tương đương). Định dạng thông báo và cách xác thực bám theo nhà cung cấp này để việc chuyển đổi sau này không phải sửa mã.
- Tính năng này chỉ xử lý **tiền vào** cho bước thanh toán booking do **khách tự đặt**. Hoàn tiền, thanh toán bù lúc trả xe, và các khoản phát sinh tại quầy vẫn theo cơ chế hiện có, không đi qua đường này.
- Booking do nhân viên tạo thủ công (khách vãng lai, khách gọi điện) **nằm ngoài phạm vi** — giữ nguyên cách thanh toán hiện tại, không hiển thị mã QR trên màn quầy. Đây là hướng mở rộng tự nhiên cho lần sau, nhưng không được tính vào tính năng này để phạm vi khỏi phình ra.
- Không thu hộ: tiền chuyển thẳng vào tài khoản của chủ doanh nghiệp, nền tảng không giữ tiền và không cắt phần trăm — đúng với mô hình doanh thu là phí thuê phần mềm.
- Tài khoản ngân hàng do chủ doanh nghiệp tự khai và tự chịu trách nhiệm. Bước quét thử mã QR mẫu là cơ chế kiểm tra duy nhất ở phiên bản này; không có bước quản trị viên nền tảng duyệt tài khoản, và không đối chiếu với hồ sơ định danh doanh nghiệp.
- Chế độ mô phỏng được bật ở mọi môi trường trong giai đoạn đồ án, kể cả môi trường demo công khai, để trình diễn được ở bất cứ đâu. Việc tắt nó là một quyết định vận hành khi chuyển sang thương mại, không phải ràng buộc do hệ thống tự áp. Không có đường nào để chủ doanh nghiệp tự bật hoặc tắt nó từ giao diện.
- Bên mô phỏng không cần đăng nhập — khách quét mã bằng camera là mở được ngay, giống như mở app ngân hàng.
- Khách hàng thực hiện thanh toán đang đăng nhập, nên kênh cập nhật tức thời có thể nhắm tới đúng người dùng đó.
- Việc giữ chỗ và thời hạn thanh toán vẫn theo cơ chế hiện có; tính năng này không thay đổi thời gian giữ chỗ.
- Giao diện tiếng Việt, tiền tệ VND hiển thị không có số lẻ thập phân.

## Rủi ro đã biết

- **Tiền thật đã chuyển nhưng dịch vụ có thể không được cung cấp**: khác với cổng thanh toán dùng chung (nơi tiền chỉ bị trừ khi giao dịch thành công), chuyển khoản là hành động một chiều của khách. Mọi tình huống lệch — chuyển chậm, chuyển thiếu, sai nội dung — đều để lại tiền trong tài khoản chủ quán mà khách chưa có chỗ. Sổ đối soát ở User Story 3 là cơ chế duy nhất phát hiện được những trường hợp này, nên không nên đưa tính năng vào dùng thật khi chưa có nó.
- **Sai số tài khoản không thể tự phát hiện**: hệ thống không có cách nào biết số tài khoản chủ doanh nghiệp nhập vào có phải của họ hay không. Nếu bỏ qua bước quét thử, tiền của mọi khách sẽ chảy vào tài khoản người lạ và chỉ bị phát hiện khi có người khiếu nại.
- **Chế độ mô phỏng bật trên môi trường công khai**: theo quyết định ở phần Clarifications, bên mô phỏng chạy ở mọi môi trường kể cả `rcfield.site`. Hệ quả là **bất kỳ ai biết đường dẫn đều tự xác nhận được booking mà không trả đồng nào**. Chấp nhận được trong giai đoạn đồ án vì chưa có tiền thật chạy qua hệ thống, nhưng phải xử lý trước khi có khách hàng trả tiền — xem mục "Trước khi vận hành thương mại" bên dưới.
- **Khách chuyển chậm vài giây vẫn bị treo**: theo quyết định luôn treo khi quá hạn, một khách chuyển khoản đúng nhưng thông báo tới muộn 5 giây cũng phải chờ người vận hành xử lý tay. Đây là đánh đổi có chủ đích để không bao giờ tự đặt chỗ ngoài ý muốn, nhưng sẽ tạo việc tay đều đặn nếu thời hạn giữ chỗ quá ngắn so với tốc độ chuyển khoản thực tế.
- **Hai phương thức song song làm tăng bề mặt thu trùng**: cho khách tự chọn nghĩa là một booking có thể có hai đường tiền đi vào. FR-004a và FR-004b là hàng rào duy nhất; nếu cài sai, khách bị trừ tiền hai lần và hệ thống không tự phát hiện.
- **Phụ thuộc bên thứ ba khi chạy thật**: nếu dịch vụ đối soát ngừng gửi thông báo, mọi booking chuyển khoản sẽ hết hạn dù khách đã trả tiền. Cần theo dõi và có đường xử lý thủ công qua sổ đối soát.

## Trước khi vận hành thương mại

Danh sách này không thuộc phạm vi triển khai của tính năng, nhưng phải hoàn tất trước khi hệ thống nhận đồng tiền thật đầu tiên:

1. Tắt chế độ mô phỏng bằng biến môi trường và xác nhận mọi đường dẫn của bên mô phỏng trả về không tồn tại.
2. Đăng ký dịch vụ đối soát ngân hàng và khai địa chỉ nhận thông báo của hệ thống vào trang quản trị của nhà cung cấp.
3. Đổi khoá xác thực của điểm nhận thông báo sang khoá do nhà cung cấp cấp, không dùng lại khoá đã xuất hiện trong quá trình demo.
4. Rà soát lại các chi nhánh đang ở chế độ mô phỏng và buộc khai lại tài khoản nhận tiền thật kèm bước quét thử.

