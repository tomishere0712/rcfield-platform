# Feature Specification: User Login

**Feature Branch**: `001-user-login`  
**Created**: 2026-05-14  
**Status**: Draft  
**Input**: User description: "tôi muốn làm feature login"

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Đăng nhập bằng email và mật khẩu (Priority: P1)

User đã có tài khoản nhập email và mật khẩu để truy cập hệ thống. Sau khi đăng nhập thành công, hệ thống nhận diện được role của user (CUSTOMER / PROVIDER / STAFF / ADMIN) và điều hướng tới màn hình phù hợp.

**Why this priority**: Đây là cổng vào duy nhất cho toàn bộ tính năng trong hệ thống. Không có login thì không có gì hoạt động được.

**Independent Test**: Có thể test hoàn toàn độc lập bằng cách: tạo user trong DB → POST thông tin login → nhận access token hợp lệ → dùng token gọi endpoint được bảo vệ.

**Acceptance Scenarios**:

1. **Given** user có tài khoản LOCAL với email `test@gmail.com` và mật khẩu đúng, **When** user gửi email + mật khẩu, **Then** hệ thống trả về access token (ngắn hạn) và refresh token (dài hạn), kèm thông tin role của user.
2. **Given** user nhập mật khẩu sai, **When** gửi thông tin đăng nhập, **Then** hệ thống từ chối và trả về lỗi, không tiết lộ email có tồn tại hay không.
3. **Given** user nhập email không tồn tại, **When** gửi thông tin đăng nhập, **Then** hệ thống trả về cùng thông báo lỗi như mật khẩu sai (tránh lộ thông tin tài khoản).
4. **Given** user có `is_active = false`, **When** cố đăng nhập, **Then** hệ thống từ chối với thông báo tài khoản bị khoá.

---

### User Story 2 — Đăng nhập bằng Google OAuth (Priority: P2)

User không muốn nhớ mật khẩu, chọn "Đăng nhập bằng Google". Hệ thống xác thực qua Google và tự động tạo tài khoản nếu chưa có, hoặc đăng nhập vào tài khoản hiện có nếu email đã tồn tại.

**Why this priority**: Phần lớn người dùng Việt Nam có tài khoản Google. Giảm friction đăng ký đáng kể, đặc biệt với CUSTOMER.

**Independent Test**: Test bằng cách mock Google OAuth response → hệ thống tạo/tìm user → trả về token hợp lệ.

**Acceptance Scenarios**:

1. **Given** user chưa có tài khoản, **When** xác thực Google thành công với email mới, **Then** hệ thống tự tạo tài khoản với `role = CUSTOMER`, `auth_provider = GOOGLE` và trả về token.
2. **Given** user đã có tài khoản LOCAL với cùng email, **When** đăng nhập Google, **Then** hệ thống liên kết và đăng nhập vào tài khoản hiện có (không tạo tài khoản mới).
3. **Given** Google trả về lỗi hoặc user huỷ, **When** callback được gọi, **Then** hệ thống thông báo lỗi và không tạo session.

---

### User Story 3 — Làm mới access token (Priority: P2)

Access token hết hạn sau 1 giờ. User không bị buộc đăng xuất — hệ thống tự động dùng refresh token để cấp access token mới mà không cần user nhập lại mật khẩu.

**Why this priority**: Trải nghiệm người dùng liên tục. Nếu thiếu tính năng này, user bị đăng xuất sau 1 giờ — không chấp nhận được.

**Independent Test**: Test bằng cách: đăng nhập → lấy refresh token → gọi endpoint refresh → nhận access token mới hợp lệ.

**Acceptance Scenarios**:

1. **Given** refresh token còn hạn, **When** gửi yêu cầu làm mới, **Then** hệ thống cấp access token mới và có thể cấp refresh token mới (rotation).
2. **Given** refresh token hết hạn hoặc không tồn tại, **When** gửi yêu cầu làm mới, **Then** hệ thống từ chối và yêu cầu đăng nhập lại.
3. **Given** refresh token đã bị dùng một lần (nếu áp dụng rotation), **When** dùng lại token cũ, **Then** hệ thống từ chối và vô hiệu hoá toàn bộ session của user (phát hiện token theft).

---

### User Story 4 — Đăng xuất (Priority: P3)

User chủ động đăng xuất khỏi thiết bị hiện tại. Sau khi đăng xuất, các token cũ không còn hoạt động.

**Why this priority**: Tính năng an toàn cơ bản, quan trọng khi user dùng thiết bị công cộng.

**Independent Test**: Đăng nhập → lấy token → đăng xuất → dùng lại token → phải bị từ chối.

**Acceptance Scenarios**:

1. **Given** user đang đăng nhập, **When** gửi yêu cầu đăng xuất kèm access token hợp lệ, **Then** refresh token bị xoá khỏi hệ thống, access token không còn hiệu lực.
2. **Given** user đăng xuất thành công, **When** dùng lại refresh token cũ, **Then** hệ thống từ chối với lỗi xác thực.

---

### Edge Cases

- Điều gì xảy ra nếu user gửi request login liên tục với mật khẩu sai nhiều lần (brute force)?
- Điều gì xảy ra nếu access token hợp lệ nhưng user bị khoá (`is_active = false`) trong thời gian token còn hạn?
- Điều gì xảy ra nếu Google OAuth trả về email đã được dùng bởi tài khoản STAFF hoặc PROVIDER (không phải CUSTOMER)?
- Điều gì xảy ra nếu request đăng nhập thiếu trường bắt buộc (email hoặc password)?

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Hệ thống PHẢI cho phép user đăng nhập bằng email + mật khẩu.
- **FR-002**: Hệ thống PHẢI cho phép user đăng nhập bằng tài khoản Google.
- **FR-003**: Hệ thống PHẢI xác thực mật khẩu theo cơ chế băm an toàn — không lưu mật khẩu dạng plain text.
- **FR-004**: Hệ thống PHẢI trả về access token ngắn hạn (1 giờ) và refresh token dài hạn (7 ngày) sau khi đăng nhập thành công.
- **FR-005**: Hệ thống PHẢI từ chối đăng nhập nếu tài khoản bị khoá (`is_active = false`).
- **FR-006**: Hệ thống PHẢI trả về thông báo lỗi chung khi email hoặc mật khẩu sai — không tiết lộ trường nào sai.
- **FR-007**: Hệ thống PHẢI cho phép làm mới access token bằng refresh token còn hạn.
- **FR-008**: Hệ thống PHẢI vô hiệu hoá refresh token sau khi user đăng xuất.
- **FR-009**: Hệ thống PHẢI tự động tạo tài khoản CUSTOMER khi user đăng nhập Google lần đầu với email chưa tồn tại.
- **FR-010**: Hệ thống PHẢI giới hạn số lần đăng nhập sai liên tiếp để chống brute force (tối đa 5 lần trong 15 phút).
- **FR-011**: Hệ thống PHẢI trả về thông tin role của user trong response đăng nhập để client điều hướng đúng màn hình.
- **FR-012**: Hệ thống PHẢI validate định dạng email và độ dài mật khẩu trước khi xử lý.

### Key Entities

- **User**: Tài khoản người dùng — có email, role, trạng thái kích hoạt, phương thức xác thực (LOCAL hoặc GOOGLE).
- **RefreshToken**: Phiên đăng nhập — liên kết với user, có thời hạn, bị xoá khi đăng xuất.
- **Session**: Khái niệm logic gồm access token + refresh token đại diện cho một lần đăng nhập của user trên một thiết bị.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: User hoàn thành đăng nhập bằng email/mật khẩu trong vòng 3 giây ở điều kiện mạng bình thường.
- **SC-002**: User hoàn thành đăng nhập bằng Google trong vòng 5 giây (bao gồm redirect).
- **SC-003**: 100% các request với access token hết hạn được tự động làm mới mà không yêu cầu user đăng nhập lại.
- **SC-004**: 0% trường hợp lộ thông tin cho biết email có tồn tại hay không qua response lỗi.
- **SC-005**: Sau khi đăng xuất, 100% token cũ bị từ chối trong các lần gọi tiếp theo.
- **SC-006**: Tài khoản tự động bị tạm khoá sau 5 lần đăng nhập sai liên tiếp trong vòng 15 phút.

---

## Assumptions

- STAFF và PROVIDER không tự đăng ký — tài khoản do ADMIN hoặc PROVIDER tạo thủ công. Chỉ CUSTOMER có thể tự đăng nhập Google lần đầu để tạo tài khoản.
- Không có tính năng "Nhớ mật khẩu" (remember me) — refresh token 7 ngày là đủ.
- Xác thực Google dùng luồng OAuth2 Authorization Code — không phải implicit flow.
- Chỉ có 1 phiên hoạt động per user per thiết bị (không multi-session) trong MVP.
- Rate limiting áp dụng theo IP — không cần CAPTCHA cho MVP.
- Khoá tài khoản do brute force là tạm thời (15 phút), không cần ADMIN can thiệp.
