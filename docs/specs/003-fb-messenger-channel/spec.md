# Feature Specification: Facebook Messenger Channel Integration

**Feature Branch**: `003-fb-messenger-channel`  
**Created**: 2026-05-24  
**Status**: Draft  

## Overview

Cho phép mỗi chi nhánh (cafe) của RCField kết nối một Facebook Page riêng để tiếp nhận và trả lời tin nhắn từ khách hàng qua Facebook Messenger. AI trả lời tự động dựa trên knowledge base của từng chi nhánh — mỗi chi nhánh hoàn toàn độc lập, cấu hình riêng.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Provider kết nối Facebook Page cho chi nhánh (Priority: P1)

Provider quản lý một chi nhánh muốn tích hợp Facebook Messenger để AI tự động trả lời khách hàng nhắn tin vào Page FB của chi nhánh. Provider vào trang cài đặt kênh, nhấn nút "Kết nối với Facebook", được chuyển đến trang xác thực của Facebook để cấp quyền, chọn Page muốn kết nối, sau đó được redirect về hệ thống với trạng thái "Đã kết nối".

**Why this priority**: Đây là điều kiện tiên quyết — không có kết nối thì AI không thể nhận/trả lời tin nhắn FB.

**Independent Test**: Provider nhấn "Kết nối với Facebook", hoàn thành OAuth flow, xác nhận hệ thống hiển thị đúng tên Page và trạng thái kết nối, sau đó gửi thử một tin nhắn đến Page để xác nhận AI phản hồi.

**Acceptance Scenarios**:

1. **Given** Provider đang ở trang cài đặt kênh của chi nhánh mình, **When** nhấn "Kết nối với Facebook", **Then** trình duyệt chuyển đến trang xác thực Facebook (OAuth dialog) yêu cầu cấp quyền quản lý Page.
2. **Given** Provider đã xác thực Facebook thành công và chọn Page, **When** Facebook redirect về hệ thống, **Then** hệ thống lưu kết nối, hiển thị tên Page và trạng thái "Đã kết nối".
3. **Given** Provider hủy hoặc từ chối quyền trên trang Facebook, **When** Facebook redirect về hệ thống, **Then** hệ thống hiển thị thông báo "Kết nối bị hủy" và không lưu bất kỳ thông tin nào.
4. **Given** Provider đã kết nối Facebook Page, **When** nhấn "Ngắt kết nối", **Then** hệ thống xóa cấu hình, AI không còn nhận tin nhắn từ Page đó nữa.
5. **Given** Provider A sở hữu Cafe A, **When** cố truy cập cài đặt kênh của Cafe B, **Then** hệ thống từ chối với lỗi phân quyền.

---

### User Story 2 - Khách hàng nhắn tin qua Facebook Messenger và nhận trả lời từ AI (Priority: P2)

Khách hàng nhắn tin vào Facebook Page của một chi nhánh RCField để hỏi về giá, lịch trống, chính sách. AI của chi nhánh đó tự động đọc knowledge base, trả lời bằng tiếng Việt, kèm gợi ý nhanh phù hợp với định dạng Messenger.

**Why this priority**: Đây là core value của tính năng — khách hàng nhận được câu trả lời tức thì mà không cần nhân viên.

**Independent Test**: Gửi tin nhắn đến một Facebook Page đã kết nối và xác nhận AI phản hồi trong vòng 5 giây với nội dung liên quan đến knowledge base của chi nhánh đó.

**Acceptance Scenarios**:

1. **Given** Khách hàng nhắn vào Page của Cafe A câu hỏi về giá thuê xe, **When** tin nhắn đến hệ thống, **Then** AI trả lời trong vòng 5 giây với nội dung đúng từ KB của Cafe A, không lẫn dữ liệu của Cafe B.
2. **Given** Khách hàng hỏi về lịch trống ngày cụ thể, **When** AI xử lý, **Then** AI kiểm tra lịch đặt thực tế của chi nhánh đó và trả lời chính xác có/không.
3. **Given** AI trả lời khách hàng, **When** có quick replies phù hợp, **Then** Messenger hiển thị các nút gợi ý ngắn gọn (≤ 20 ký tự, tối đa 5 gợi ý) bên dưới tin nhắn.
4. **Given** AI không tìm được thông tin liên quan trong KB, **When** trả lời, **Then** AI thông báo lịch sự rằng không có thông tin và gợi ý liên hệ trực tiếp chi nhánh.
5. **Given** Facebook gửi lại cùng một webhook event (retry), **When** hệ thống nhận, **Then** tin nhắn chỉ được xử lý đúng một lần, không bị trả lời trùng.
6. **Given** Tính năng AI của chi nhánh bị tắt hoặc quota hết, **When** khách nhắn tin, **Then** hệ thống phản hồi lịch sự thay vì im lặng.

---

### User Story 3 - Admin xem tổng quan các kết nối kênh (Priority: P3) ⚠️ DEFERRED — Không nằm trong MVP

Admin của hệ thống có thể xem danh sách tất cả các chi nhánh đang kết nối Facebook Messenger, trạng thái kết nối và thông tin cơ bản (tên Page, ngày kết nối).

**Why this priority**: Cần thiết cho việc vận hành và debug, nhưng không blocking cho core flow.

**Independent Test**: Admin đăng nhập, vào trang quản lý kênh và thấy danh sách các chi nhánh đã kết nối FB với trạng thái chính xác.

**Acceptance Scenarios**:

1. **Given** Có 3 chi nhánh đã kết nối Facebook Page, **When** Admin xem trang quản lý kênh, **Then** thấy đủ 3 chi nhánh với tên Page, trạng thái kết nối và ngày kết nối.
2. **Given** Một chi nhánh có token sắp hết hạn (dưới 7 ngày), **When** Admin xem danh sách, **Then** hệ thống hiển thị cảnh báo rõ ràng cho chi nhánh đó.

---

### Edge Cases

- Điều gì xảy ra khi Facebook gửi webhook nhưng `page_id` không khớp với bất kỳ chi nhánh nào?
- Điều gì xảy ra khi khách gửi sticker, hình ảnh, hoặc voice message thay vì text?
- Điều gì xảy ra khi Page Access Token hết hạn sau khi đã kết nối?
- Điều gì xảy ra khi AI service (Gemini) timeout hoặc lỗi trong lúc xử lý tin nhắn FB?
- Điều gì xảy ra khi khách gửi nhiều tin nhắn liên tiếp rất nhanh (spam)?
- Điều gì xảy ra khi Provider hủy giữa chừng quá trình OAuth trên trang Facebook?
- Điều gì xảy ra khi Provider thu hồi quyền của App trên Facebook sau khi đã kết nối?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Provider PHẢI có thể kết nối một Facebook Page cho chi nhánh thông qua Facebook OAuth — nhấn nút "Kết nối với Facebook", xác thực trên trang Facebook, chọn Page, và được redirect về hệ thống với trạng thái kết nối.
- **FR-002**: Sau khi Provider hoàn thành OAuth, hệ thống PHẢI tự động lấy Page ID và Page Access Token (long-lived) từ Facebook Graph API và lưu trữ mà không yêu cầu Provider nhập tay.
- **FR-003**: Hệ thống PHẢI lưu trữ Page Access Token và App Secret được mã hóa bằng AES-256-GCM tại application layer; khóa mã hóa quản lý qua biến môi trường `CHANNEL_ENCRYPTION_KEY`, không bao giờ lưu vào DB.
- **FR-004**: Hệ thống PHẢI tiếp nhận webhook từ Facebook và phản hồi xác nhận trong vòng 5 giây.
- **FR-005**: Hệ thống PHẢI định danh đúng chi nhánh từ `page_id` trong webhook payload để route đến AI đúng.
- **FR-006**: Hệ thống PHẢI bỏ qua (không xử lý) các tin nhắn không phải dạng text (hình ảnh, sticker, voice).
- **FR-007**: Hệ thống PHẢI loại bỏ tin nhắn trùng lặp khi Facebook gửi webhook retry bằng cách kiểm tra Redis key `facebook:processed:{pageId}:{messageId}` (TTL 5 phút) trước khi xử lý.
- **FR-013**: Hệ thống KHÔNG verify `X-Hub-Signature-256` trong MVP — đây là rủi ro bảo mật đã được chấp nhận có chủ ý và sẽ được bổ sung trong phiên bản tiếp theo.
- **FR-008**: AI PHẢI format câu trả lời phù hợp với Messenger: không dùng markdown, chia nhỏ nếu quá 2000 ký tự, quick replies ≤ 20 ký tự mỗi cái và tối đa 5 gợi ý.
- **FR-009**: Provider PHẢI có thể ngắt kết nối Facebook Page, sau đó AI ngừng nhận và trả lời tin nhắn từ Page đó.
- **FR-010**: Hệ thống PHẢI kiểm tra quota AI của chi nhánh trước khi xử lý tin nhắn từ Facebook — nếu hết quota thì gửi thông báo lịch sự cho người dùng.
- **FR-011**: ~~Admin PHẢI có thể xem danh sách tất cả các chi nhánh đang kết nối kênh Facebook.~~ **DEFERRED** — Không triển khai trong MVP.
- **FR-012**: Mỗi chi nhánh chỉ được kết nối một Facebook Page tại một thời điểm.

### Key Entities

- **CafeChannel**: Thông tin kết nối kênh của một chi nhánh — bao gồm loại kênh, định danh kênh (page_id), trạng thái kết nối, thời điểm kết nối.
- **ChannelCredentials**: Thông tin xác thực đã mã hóa của kênh — bao gồm long-lived Page Access Token lấy tự động qua OAuth; không bao giờ hiển thị dạng nguyên văn ra ngoài. App Secret lưu trong env var phía server, không lưu DB.
- **WebhookEvent**: Sự kiện tin nhắn đến từ Facebook — bao gồm định danh người gửi, nội dung tin nhắn, định danh Page nhận.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Khách hàng nhận được phản hồi từ AI trong vòng 5 giây kể từ khi gửi tin nhắn trên Facebook Messenger.
- **SC-002**: Provider có thể hoàn thành toàn bộ quy trình kết nối Facebook Page trong dưới 3 phút.
- **SC-003**: Hệ thống xử lý đúng 100% các tin nhắn — không bỏ sót, không trả lời trùng.
- **SC-004**: Câu trả lời từ AI trên Messenger hiển thị đúng định dạng — không bị lỗi ký tự, không bị cắt giữa chừng.
- **SC-005**: Thông tin xác thực (token) của Facebook Page không bao giờ lộ ra ngoài dưới dạng nguyên văn.
- **SC-006**: Khi một chi nhánh ngắt kết nối, AI ngừng trả lời tin nhắn từ Page đó ngay lập tức (không delay).

## Clarifications

### Session 2026-05-24

- Q: Hệ thống có cần verify `X-Hub-Signature-256` header từ Facebook trên mỗi webhook request không? → A: Không verify trong MVP — chấp nhận rủi ro bảo mật, sẽ bổ sung sau.
- Q: Phương pháp mã hóa credential Facebook (Page Access Token, App Secret) là gì? → A: Application-level encryption AES-256-GCM, key lưu trong env var `CHANNEL_ENCRYPTION_KEY`.
- Q: Cơ chế deduplication chống xử lý trùng webhook retry là gì? → A: Redis SET key `facebook:processed:{pageId}:{messageId}` TTL 5 phút.
- Q: Scope Admin view (US3) trong MVP là gì? → A: Defer hoàn toàn — US3 không nằm trong MVP, sẽ làm sau.
- Correction: Luồng kết nối FB Page là Facebook OAuth (redirect → chọn Page → callback), không phải nhập tay Page ID/Token/App Secret.

## Assumptions

- Provider đã có sẵn Facebook Page và là admin của Page đó — đây là điều kiện để Facebook OAuth cấp quyền quản lý Page.
- Provider không cần biết hay nhập Page ID, Access Token, hay App Secret — toàn bộ được xử lý tự động qua OAuth flow.
- Facebook App (Meta Developer App) đã được tạo sẵn bởi team RCField — App ID và App Secret cấu hình trong môi trường server, không lộ ra phía client.
- Hệ thống dùng một webhook URL duy nhất cho tất cả Page; `page_id` trong payload xác định chi nhánh tương ứng.
- Không lưu lịch sử hội thoại trong phase này — mỗi tin nhắn được xử lý độc lập.
- Tin nhắn không phải text (hình ảnh, sticker, voice) bị bỏ qua, không trả lời.
- Mỗi chi nhánh chỉ kết nối một Facebook Page tại một thời điểm.
