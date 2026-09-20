# Feature Specification: Staff Management — Provider Invite Flow

**Feature Branch**: `006-staff-invite-management`  
**Created**: 2026-06-02  
**Status**: Draft

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Provider Invites a New Staff Member (Priority: P1)

Provider (chủ doanh nghiệp) muốn thêm nhân viên vào một chi nhánh. Provider điền thông tin nhân viên (email, họ tên, số điện thoại) và chọn chi nhánh. Hệ thống tạo tài khoản ở trạng thái chờ kích hoạt và gửi email mời cho nhân viên. Nhân viên xuất hiện trong danh sách với trạng thái "Chờ kích hoạt".

**Why this priority**: Không có luồng mời, Provider không thể onboard nhân viên mới — đây là điểm khởi đầu của toàn bộ tính năng.

**Independent Test**: Có thể kiểm thử độc lập bằng cách: Provider tạo lời mời → kiểm tra nhân viên xuất hiện trong danh sách với trạng thái "Chờ kích hoạt" → kiểm tra email được gửi tới địa chỉ đã điền.

**Acceptance Scenarios**:

1. **Given** Provider đăng nhập và có ít nhất 1 chi nhánh đang hoạt động, **When** Provider điền đầy đủ email/họ tên/SĐT và chọn chi nhánh rồi bấm "Gửi lời mời", **Then** hệ thống tạo tài khoản ở trạng thái Pending, nhân viên mới xuất hiện trong danh sách, và email lời mời được gửi đến địa chỉ đã điền.
2. **Given** Provider thử mời một email đã tồn tại trong hệ thống, **When** Provider bấm "Gửi lời mời", **Then** hệ thống hiển thị thông báo lỗi rõ ràng và không tạo tài khoản trùng lặp.
3. **Given** Provider đã gửi lời mời cho một nhân viên chưa kích hoạt, **When** Provider chọn "Gửi lại lời mời" cho nhân viên đó, **Then** hệ thống gửi email lời mời mới với token mới và token cũ vô hiệu.
4. **Given** Provider thử mời nhân viên vào một chi nhánh không thuộc quyền quản lý của mình, **When** thao tác được gửi lên, **Then** hệ thống từ chối và trả về lỗi xác thực quyền.

---

### User Story 2 — Provider Xem và Quản Lý Danh Sách Nhân Viên (Priority: P2)

Provider muốn xem tất cả nhân viên của mình (có thể lọc theo chi nhánh), biết trạng thái từng người, và có thể vô hiệu hóa tài khoản nhân viên khi cần (nghỉ việc, vi phạm nội quy).

**Why this priority**: Provider cần kiểm soát được ai có quyền truy cập hệ thống của từng chi nhánh. Sau khi mời được nhân viên (US1), Provider cần quản lý danh sách đó.

**Independent Test**: Có thể kiểm thử bằng cách tạo sẵn 1 số nhân viên (seeded data) → Provider xem danh sách → lọc theo chi nhánh → vô hiệu hóa 1 nhân viên → nhân viên đó không còn đăng nhập được.

**Acceptance Scenarios**:

1. **Given** Provider có nhân viên ở nhiều chi nhánh khác nhau, **When** Provider mở trang quản lý nhân viên, **Then** Provider thấy danh sách toàn bộ nhân viên với thông tin: tên, email, chi nhánh, trạng thái (Active / Chờ kích hoạt / Vô hiệu hóa).
2. **Given** Danh sách nhân viên hiển thị, **When** Provider chọn lọc theo một chi nhánh cụ thể, **Then** chỉ hiển thị nhân viên thuộc chi nhánh đó.
3. **Given** Một nhân viên đang ở trạng thái Active, **When** Provider chọn "Vô hiệu hóa" và xác nhận, **Then** tài khoản chuyển sang trạng thái Vô hiệu hóa và nhân viên không thể đăng nhập cho đến khi được kích hoạt lại.
4. **Given** Một nhân viên đang ở trạng thái Vô hiệu hóa, **When** Provider chọn "Kích hoạt lại", **Then** tài khoản trở lại Active và nhân viên có thể đăng nhập.

---

### User Story 3 — Nhân Viên Kích Hoạt Tài Khoản Qua Email (Priority: P3)

Nhân viên nhận email lời mời, click vào link, đặt mật khẩu cho tài khoản của mình, rồi được chuyển vào giao diện làm việc của nhân viên.

**Why this priority**: Đây là cầu nối giữa Provider tạo tài khoản (US1) và nhân viên thực sự sử dụng hệ thống. Cần US1 hoàn thiện trước.

**Independent Test**: Dùng invite token hợp lệ (được tạo bởi US1) → nhân viên đặt mật khẩu → đăng nhập bằng email + mật khẩu mới → vào được giao diện staff dashboard.

**Acceptance Scenarios**:

1. **Given** Nhân viên có email lời mời chứa link kích hoạt hợp lệ, **When** nhân viên click link và nhập mật khẩu mới (đủ độ mạnh), **Then** tài khoản chuyển sang Active, nhân viên được đăng nhập tự động và vào giao diện nhân viên.
2. **Given** Link kích hoạt đã hết hạn (quá 48 giờ), **When** nhân viên click link, **Then** hệ thống thông báo link hết hạn và hướng dẫn liên hệ Provider để được gửi lại lời mời.
3. **Given** Link kích hoạt đã được sử dụng trước đó, **When** nhân viên click link lần hai, **Then** hệ thống từ chối và thông báo link không còn hiệu lực.
4. **Given** Nhân viên nhập mật khẩu không đủ yêu cầu (ví dụ: ít hơn 8 ký tự), **When** nhân viên bấm xác nhận, **Then** hệ thống hiển thị yêu cầu mật khẩu cụ thể và không hoàn tất kích hoạt.

---

### User Story 4 — Nhân Viên Xem Dữ Liệu Vận Hành Thực Tế (Priority: P4)

Nhân viên đã kích hoạt tài khoản đăng nhập vào giao diện và thấy dữ liệu thực từ hệ thống thay vì dữ liệu mẫu: danh sách booking hôm nay tại chi nhánh mình phụ trách, có thể thực hiện check-in và check-out cho khách.

**Why this priority**: Đây là giá trị vận hành cuối cùng — nhân viên dùng được hệ thống trong công việc hàng ngày. Phụ thuộc vào US3 (tài khoản phải active) và booking feature đã tồn tại.

**Independent Test**: Nhân viên đăng nhập → trang dashboard hiển thị đúng danh sách booking của ngày hôm nay cho chi nhánh của nhân viên đó (không phải dữ liệu mock). Nếu không có booking nào hôm nay thì hiển thị trạng thái trống.

**Acceptance Scenarios**:

1. **Given** Nhân viên đăng nhập vào hệ thống, **When** nhân viên vào trang dashboard, **Then** trang hiển thị danh sách booking hôm nay của chi nhánh mình (dữ liệu thật), bao gồm trạng thái booking và thông tin khách hàng.
2. **Given** Không có booking nào trong ngày, **When** nhân viên xem dashboard, **Then** hiển thị thông báo trống thân thiện, không báo lỗi.
3. **Given** Nhân viên đang xem một booking đã được xác nhận, **When** khách đến và nhân viên thực hiện check-in, **Then** trạng thái booking chuyển sang Active và thông tin hiển thị cập nhật ngay.

---

### Edge Cases

- Khi Provider invite một email đã có account (bất kỳ role nào: CUSTOMER, PROVIDER, ADMIN, STAFF), hệ thống từ chối và hiển thị lỗi. Provider phải dùng email khác.
- Điều gì xảy ra khi Provider xóa chi nhánh mà nhân viên đang được gán vào?
- Khi nhân viên đang trong ca làm (có booking ACTIVE) bị vô hiệu hóa: tài khoản chuyển Disabled tức thì, nhưng session đang chạy vẫn hợp lệ đến khi JWT tự hết hạn — không bị kick ngay. Lần đăng nhập tiếp theo sẽ bị từ chối.
- Link kích hoạt bị forward cho người khác — ai click đầu tiên được?
- Provider có tối đa bao nhiêu nhân viên? (Giả định: không giới hạn cứng trong phiên bản này)

## Clarifications

### Session 2026-06-08

- Q: Khi Provider invite email đã tồn tại trong hệ thống (bất kỳ role nào), xử lý thế nào? → A: Từ chối toàn bộ — báo lỗi, không phân biệt role của tài khoản hiện tại.
- Q: Nếu gửi email invite thất bại (Brevo lỗi), tài khoản Pending có bị xóa không? → A: Giữ lại — tài khoản Pending tồn tại dù email thất bại; Provider dùng "Gửi lại lời mời" để thử lại.
- Q: Nhân viên bị vô hiệu hóa trong khi đang có booking ACTIVE, xử lý thế nào? → A: Vô hiệu hóa ngay (Disabled tức thì), session JWT hiện tại vẫn chạy đến khi hết hạn tự nhiên — không cần token blacklist.

## Requirements *(mandatory)*

### Functional Requirements

**Quản lý nhân viên — phía Provider**

- **FR-001**: Hệ thống PHẢI cho phép Provider tạo lời mời nhân viên bằng cách cung cấp: email, họ tên, số điện thoại (tùy chọn), và chi nhánh được gán.
- **FR-002**: Hệ thống PHẢI xác minh email lời mời chưa được đăng ký trong hệ thống với bất kỳ role nào (CUSTOMER, PROVIDER, ADMIN, STAFF) trước khi tạo tài khoản. Nếu email đã tồn tại, hệ thống từ chối và hiển thị thông báo lỗi — không phân biệt role của tài khoản hiện tại.
- **FR-003**: Hệ thống PHẢI tạo tài khoản nhân viên ở trạng thái Pending và cố gắng gửi email kích hoạt có chứa link an toàn, dùng một lần, có thời hạn 48 giờ. Nếu gửi email thất bại, tài khoản Pending vẫn được giữ lại — Provider nhìn thấy nhân viên trong danh sách và có thể dùng "Gửi lại lời mời" để thử gửi lại sau.
- **FR-004**: Hệ thống PHẢI cho phép Provider xem danh sách nhân viên với thông tin: tên, email, chi nhánh, trạng thái tài khoản, thời điểm tạo.
- **FR-005**: Hệ thống PHẢI cho phép Provider lọc danh sách nhân viên theo chi nhánh.
- **FR-006**: Hệ thống PHẢI cho phép Provider vô hiệu hóa tài khoản nhân viên đang Active hoặc Pending. Tài khoản bị vô hiệu hóa không thể đăng nhập.
- **FR-007**: Hệ thống PHẢI cho phép Provider kích hoạt lại tài khoản nhân viên đã bị vô hiệu hóa.
- **FR-008**: Hệ thống PHẢI cho phép Provider gửi lại lời mời cho nhân viên đang ở trạng thái Pending. Token cũ phải bị vô hiệu khi token mới được tạo.
- **FR-009**: Hệ thống CHỈ cho phép Provider quản lý nhân viên của các chi nhánh thuộc quyền sở hữu của Provider đó. Provider không thể thao tác trên chi nhánh của Provider khác.

**Kích hoạt tài khoản — phía nhân viên**

- **FR-010**: Hệ thống PHẢI cung cấp trang kích hoạt tài khoản cho nhân viên truy cập qua link trong email.
- **FR-011**: Hệ thống PHẢI xác thực token kích hoạt: từ chối token đã hết hạn hoặc đã sử dụng, hiển thị thông báo lỗi phù hợp.
- **FR-012**: Hệ thống PHẢI yêu cầu nhân viên đặt mật khẩu đáp ứng tiêu chuẩn tối thiểu: ít nhất 8 ký tự.
- **FR-013**: Sau khi kích hoạt thành công, hệ thống PHẢI chuyển trạng thái tài khoản từ Pending sang Active và đăng nhập nhân viên vào giao diện làm việc.

**Dữ liệu vận hành — phía nhân viên**

- **FR-014**: Hệ thống PHẢI cung cấp API trả về danh sách booking trong ngày hôm nay cho chi nhánh mà nhân viên được gán, chỉ dành cho nhân viên của chi nhánh đó.
- **FR-015**: Nhân viên PHẢI chỉ truy cập được dữ liệu của chi nhánh mình — không thể xem dữ liệu chi nhánh khác.

### Key Entities

- **StaffAccount**: Tài khoản nhân viên — email, họ tên, SĐT, trạng thái (Pending / Active / Disabled), chi nhánh được gán, thời điểm tạo, thời điểm kích hoạt.
- **InviteToken**: Token kích hoạt dùng một lần — giá trị token (chuỗi ngẫu nhiên an toàn), liên kết với tài khoản nhân viên, thời điểm tạo, thời điểm hết hạn (48 giờ), trạng thái đã sử dụng.
- **CafeAssignment**: Quan hệ gán nhân viên vào chi nhánh — 1 nhân viên chỉ thuộc 1 chi nhánh tại mọi thời điểm.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Provider có thể hoàn tất việc tạo lời mời nhân viên trong dưới 60 giây.
- **SC-002**: Email lời mời đến hộp thư nhân viên trong vòng 2 phút sau khi Provider gửi.
- **SC-003**: Nhân viên có thể hoàn tất kích hoạt tài khoản (nhận email → đặt mật khẩu → vào giao diện) trong dưới 3 phút.
- **SC-004**: 100% token kích hoạt hết hạn bị từ chối — không tài khoản nào có thể được kích hoạt bằng link quá 48 giờ.
- **SC-005**: Nhân viên bị vô hiệu hóa không thể đăng nhập trong vòng 5 giây sau khi Provider thực hiện thao tác vô hiệu hóa.
- **SC-006**: Nhân viên chỉ thấy dữ liệu của chi nhánh mình — không thể truy cập dữ liệu chi nhánh khác trong bất kỳ trường hợp nào.

## Assumptions

- Hệ thống email (Brevo transactional) đã được tích hợp sẵn trong backend — tính năng này chỉ cần thêm template email invite vào service có sẵn, không cần setup email provider mới.
- Invite token hết hạn sau 48 giờ kể từ thời điểm tạo — đây là khoảng thời gian hợp lý để nhân viên phản hồi.
- Mỗi nhân viên chỉ thuộc 1 chi nhánh duy nhất (không có khái niệm nhân viên phủ trách nhiều chi nhánh).
- Chỉ có 1 role nhân viên duy nhất (không có chức danh, phân cấp hay ca làm việc).
- Provider chỉ có thể mời nhân viên vào các chi nhánh thuộc quyền sở hữu của mình.
- Giao diện nhân viên (dashboard, danh sách booking, inspection flow) đã được thiết kế và xây dựng sẵn với dữ liệu mẫu — phạm vi tính năng này là kết nối giao diện đó với dữ liệu thực, không làm lại giao diện.
- Tính năng này không bao gồm quản lý ca làm việc (shift scheduling).
- Provider có subscription active mới được phép thực hiện các thao tác quản lý nhân viên.

## Out of Scope

- Quản lý ca làm việc (shift scheduling)
- Phân quyền chi tiết theo vai trò nhân viên (chỉ có 1 role)
- Nhân viên tự đăng ký (không có self-registration)
- Đăng nhập nhân viên qua mạng xã hội (Google, Facebook)
- Nhân viên phụ trách nhiều chi nhánh cùng lúc
- Thống kê/báo cáo hiệu suất nhân viên
