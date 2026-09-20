# Feature Specification: Branch AI Chat Assistant

**Feature Branch**: `002-branch-ai-chat-rag`
**Created**: 2026-05-17
**Status**: Draft

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Customer hỏi thông tin chi nhánh (Priority: P1)

Khách hàng truy cập trang chi nhánh và muốn biết thông tin nhanh về giá thuê, loại xe, giờ mở cửa, nội quy sân mà không cần tự tìm trong trang. Họ gõ câu hỏi bằng tiếng Việt tự nhiên vào widget chat và nhận câu trả lời chính xác từ knowledge base của chi nhánh đó.

**Why this priority**: Đây là giá trị cốt lõi của feature — giảm ma sát cho khách hàng khi tìm hiểu thông tin trước khi đặt lịch.

**Independent Test**: Có thể kiểm tra độc lập bằng cách gọi chat endpoint với một câu hỏi về thông tin tĩnh và xác nhận câu trả lời phản ánh đúng dữ liệu KB của chi nhánh đó.

**Acceptance Scenarios**:

1. **Given** chi nhánh đã có KB với thông tin giá, **When** khách gửi "Giá thuê xe bao nhiêu?", **Then** bot trả lời với mức giá chính xác của chi nhánh đó.
2. **Given** khách hỏi thông tin không có trong KB, **When** câu hỏi được gửi, **Then** bot trả lời "Tôi chưa có thông tin về điều này, vui lòng liên hệ trực tiếp chi nhánh."
3. **Given** khách hỏi bằng tiếng Việt có dấu hoặc không dấu, **When** câu hỏi được gửi, **Then** bot hiểu và trả lời đúng ngôn ngữ tiếng Việt.
4. **Given** khách gửi nhiều tin nhắn liên tiếp trong cùng một phiên, **When** hỏi câu liên quan đến câu trước, **Then** bot hiểu ngữ cảnh hội thoại và trả lời mạch lạc.

---

### User Story 2 — Customer hỏi slot trống theo thời gian thực (Priority: P1)

Khách hàng muốn biết ngay hôm nay hoặc một ngày cụ thể còn slot chơi không, không cần vào trang đặt lịch để kiểm tra. Bot tra cứu dữ liệu đặt lịch thực tế và trả lời.

**Why this priority**: Thông tin slot trống thay đổi liên tục — đây là câu hỏi phổ biến nhất trước khi quyết định đặt lịch. Giải quyết nhanh giúp tăng tỷ lệ chuyển đổi.

**Independent Test**: Có thể kiểm tra bằng cách tạo booking chiếm slot, sau đó hỏi "Hôm nay còn slot không?" và xác nhận bot trả về đúng số slot còn trống.

**Acceptance Scenarios**:

1. **Given** khách hỏi "Chiều nay 3h còn chỗ không?", **When** bot nhận câu hỏi, **Then** bot tra cứu slot trống và trả lời số slot còn khả dụng vào 15:00 hôm nay.
2. **Given** khách hỏi "Cuối tuần này còn không?", **When** bot nhận câu hỏi, **Then** bot tra cứu và liệt kê các khung giờ còn trống trong ngày thứ 7 và chủ nhật gần nhất.
3. **Given** tất cả slot đã đầy, **When** khách hỏi, **Then** bot thông báo hết slot và gợi ý ngày/giờ khác còn trống gần nhất.
4. **Given** khách hỏi "Hôm nay" nhưng không chỉ rõ giờ, **When** bot tra cứu, **Then** bot trả về tất cả khung giờ còn trống trong ngày.

---

### User Story 3 — Provider upload tài liệu vào knowledge base (Priority: P1)

Provider (chủ doanh nghiệp) muốn thêm/cập nhật nội dung cho trợ lý AI của chi nhánh mình: nội quy sân, chính sách huỷ, FAQ, thông báo sự kiện đặc biệt. Họ upload file từ máy tính lên dashboard.

**Why this priority**: Không có KB thì bot không thể trả lời. Provider cần tự kiểm soát nội dung KB mà không cần kỹ thuật can thiệp.

**Independent Test**: Có thể kiểm tra bằng cách upload một file nội quy, sau đó gọi chat endpoint hỏi về nội dung trong file và xác nhận bot trả lời đúng.

**Acceptance Scenarios**:

1. **Given** Provider chọn file PDF/DOCX/TXT dưới 10MB, **When** upload thành công, **Then** file được xử lý và trạng thái chuyển thành "Đã sẵn sàng" trong vài giây đến vài phút.
2. **Given** Provider upload file trên 10MB hoặc sai định dạng, **When** submit, **Then** hệ thống từ chối và hiển thị thông báo lỗi rõ ràng.
3. **Given** Provider xóa một tài liệu đã upload, **When** xóa thành công, **Then** nội dung từ tài liệu đó không còn xuất hiện trong câu trả lời của bot.
4. **Given** Provider upload lại tài liệu đã tồn tại (cùng tên), **When** upload thành công, **Then** nội dung cũ bị thay thế hoàn toàn bằng nội dung mới.
5. **Given** Provider của chi nhánh A, **When** cố gắng upload KB cho chi nhánh B, **Then** hệ thống từ chối với lỗi không có quyền.

---

### User Story 5 — Provider cấu hình giao diện và hành vi chat widget (Priority: P2)

Provider muốn tùy chỉnh chat widget cho chi nhánh của mình: lời chào ban đầu, vị trí hiển thị, màu sắc, avatar bot, và các nút quick reply để khách click nhanh khi mới vào chat.

**Why this priority**: Giúp widget phù hợp với thương hiệu từng chi nhánh và cải thiện trải nghiệm đầu tiên của Customer, nhưng không blocking P1 functionality.

**Independent Test**: Có thể kiểm tra bằng cách lưu config rồi gọi `GET /chat/config` và xác nhận trả về đúng giá trị đã set.

**Acceptance Scenarios**:

1. **Given** Provider set greeting "Chào mừng đến với RC Arena! Tôi có thể giúp gì?", **When** Customer mở widget, **Then** bot hiển thị đúng câu chào đó thay vì câu mặc định.
2. **Given** Provider set 3 quick replies: "Xem giá", "Kiểm tra slot", "Nội quy sân", **When** Customer mở widget lần đầu, **Then** 3 nút đó hiển thị sẵn để click.
3. **Given** Provider chưa cấu hình widget, **When** Customer mở widget, **Then** hiển thị cấu hình mặc định của hệ thống.
4. **Given** Provider update config, **When** lưu thành công, **Then** widget phản ánh config mới ngay lần reload tiếp theo.

---

### User Story 4 — Provider xem danh sách tài liệu KB (Priority: P2)

Provider muốn biết chi nhánh của mình đang có những tài liệu gì trong KB, trạng thái xử lý và ngày upload.

**Why this priority**: Cần thiết để Provider quản lý và duy trì KB, nhưng không blocking P1 stories.

**Independent Test**: Có thể kiểm tra độc lập bằng cách upload 2-3 file rồi gọi list API và xác nhận trả về đúng danh sách.

**Acceptance Scenarios**:

1. **Given** chi nhánh có 3 tài liệu, **When** Provider xem danh sách, **Then** hiển thị đủ 3 tài liệu với tên file, trạng thái (đang xử lý/đã sẵn sàng/lỗi) và ngày upload.
2. **Given** chi nhánh chưa có tài liệu nào, **When** Provider xem danh sách, **Then** hiển thị trạng thái trống và hướng dẫn upload.

---

### Edge Cases

- File PDF bị mã hóa (password-protected) → từ chối với thông báo rõ ràng.
- File chứa chủ yếu là hình ảnh, ít text → xử lý phần text có được, không lỗi.
- Câu hỏi của Customer về slot trống với ngày trong quá khứ → bot trả lời lịch sự rằng ngày đã qua.
- Câu hỏi không liên quan đến sân RC (ví dụ: "Hôm nay thời tiết thế nào?") → bot từ chối lịch sự và redirect về chủ đề liên quan.
- Provider upload file trong khi file cũ cùng tên đang được xử lý → hệ thống xử lý tuần tự, không race condition.
- Chi nhánh chưa có KB nhưng khách đã chat → bot trả lời bằng thông tin cơ bản từ profile cafe trong DB.

---

## Clarifications

### Session 2026-05-17

- Q: Chat endpoint là public — rate limiting và access control được xử lý thế nào? → A: Tính năng AI được Admin bật/tắt per-cafe thông qua `feature_flags`. Quota request hàng tháng do Admin set thủ công khi Provider thanh toán gói dịch vụ AI. Mỗi chat request trừ quota; hết quota thì trả về thông báo hết lượt. Billing/payment tự động là Phase 2.
- Q: Staff có được phép upload/xóa tài liệu KB không? → A: Không. Chỉ Provider (chủ sở hữu chi nhánh) mới được quản lý KB. Staff không có quyền này.
- Q: Khi Gemini API bị lỗi hoặc timeout, hệ thống phản hồi thế nào? → A: Trả về thông báo thân thiện "Trợ lý tạm thời không khả dụng, vui lòng thử lại sau" — không retry, không fallback phức tạp.
- Q: Provider biết tài liệu xử lý xong bằng cách nào? → A: WebSocket — server push event khi status thay đổi (PENDING → INDEXED | FAILED). WebSocket sẽ được dùng chung cho nhiều tính năng khác trong hệ thống.
- Q: Câu hỏi đơn giản (chào hỏi, hỏi slot) có cần gọi Gemini không? → A: Không. Dùng lại Mekit NLU service (Python/FastAPI + sentence-transformers) để phân loại intent trước. Câu đơn giản trả về ngay hoặc query DB trực tiếp, chỉ câu phức tạp mới gọi Gemini RAG. Intents cấu hình qua JSON, không hardcode.
- Q: Response có cần format đặc biệt cho UI không? → A: Có. Response trả về `response_type` để FE biết cách render: `text` (markdown plain), `slot_list` (danh sách slot có thể click), `vehicle_list` (danh sách xe dạng card), `quick_replies` (nút gợi ý follow-up). Mọi response đều có `answer` text làm fallback.
- Q: Quota reset `used_this_month` bằng cách nào? → A: Thủ công — Admin gọi API update `feature_flags.config` để set `used_this_month = 0`. Không có cron job tự động trong Phase 1.

---

## Requirements *(mandatory)*

### Functional Requirements

**NLU Intent Routing**

- **FR-021**: Trước khi quyết định xử lý, hệ thống PHẢI gọi NLU service để phân loại intent của message.
- **FR-022**: Intent `fast_answer` (chào hỏi, cảm ơn, tạm biệt) PHẢI được trả lời ngay lập tức bằng `greeting_message` từ widget config — không gọi Gemini hay query DB.
- **FR-022a**: Response của `fast_answer` PHẢI kèm `quick_replies` từ widget config (nếu có) để Customer chọn nhanh.
- **FR-023**: Intent `slot_check` (hỏi lịch/slot trống) PHẢI được xử lý bằng cách query thẳng DB — không qua RAG, không gọi Gemini — và trả về `response_type: "slot_list"` với danh sách slot có thể click.
- **FR-024**: Các intent còn lại (`pricing_query`, `policy_query`, `vehicle_query`, `fnb_query`, `rag_query`) PHẢI đi qua pipeline RAG + Gemini đầy đủ, trả về `response_type` phù hợp với intent (`vehicle_list` cho vehicle/pricing query, `text` cho policy/FAQ).
- **FR-024a**: Mọi response PHẢI có field `answer` (text/markdown) làm fallback khi FE không hỗ trợ `response_type` đó.
- **FR-025**: Khi NLU service không khả dụng, hệ thống PHẢI fallback về route `rag_query` (gọi Gemini như bình thường) — không trả lỗi cho Customer.
- **FR-026**: Danh sách intent và examples PHẢI được cấu hình qua file JSON, không hardcode trong source code.

**Chat — Customer facing**

- **FR-001**: Hệ thống PHẢI cung cấp endpoint chat riêng cho từng chi nhánh, không cần xác thực từ phía Customer.
- **FR-001a**: Trước khi xử lý mỗi chat request, hệ thống PHẢI kiểm tra: (1) cafe có feature flag `ai_chat` được bật không — nếu không, trả 503; (2) còn quota tháng không — nếu hết, trả 429.
- **FR-002**: Hệ thống PHẢI trả lời câu hỏi dựa trên knowledge base của đúng chi nhánh được hỏi — không được lẫn KB của chi nhánh khác.
- **FR-003**: Hệ thống PHẢI hỗ trợ conversation history nhiều lượt trong cùng một phiên chat (multi-turn).
- **FR-004**: Hệ thống PHẢI tự động tra cứu slot trống theo thời gian thực khi Customer hỏi về lịch/slot.
- **FR-005**: Hệ thống PHẢI trả lời bằng tiếng Việt.
- **FR-006**: Hệ thống PHẢI từ chối lịch sự các câu hỏi nằm ngoài phạm vi thông tin chi nhánh RC.
- **FR-007**: Khi KB không có thông tin để trả lời, hệ thống PHẢI thừa nhận và gợi ý liên hệ trực tiếp chi nhánh thay vì bịa đặt.
- **FR-007a**: Khi Gemini API không phản hồi hoặc trả về lỗi, hệ thống PHẢI trả về thông báo thân thiện "Trợ lý tạm thời không khả dụng, vui lòng thử lại sau" với HTTP 503.

**AI Feature Gating — Admin facing**

- **FR-017**: Admin PHẢI có khả năng bật/tắt tính năng AI chat cho từng chi nhánh thông qua `feature_flags`.
- **FR-018**: Admin PHẢI có khả năng set quota request hàng tháng (`monthly_quota`) và ngày reset quota (`quota_reset_date`) cho từng chi nhánh trong `feature_flags.config`.
- **FR-019**: Hệ thống PHẢI tự động increment `used_this_month` sau mỗi chat request thành công.
- **FR-020**: Khi `used_this_month >= monthly_quota`, hệ thống PHẢI trả về thông báo hết lượt thay vì gọi AI API.

**Widget Configuration — Provider facing**

- **FR-027**: Hệ thống PHẢI cho phép Provider xem và cập nhật cấu hình widget cho chi nhánh thuộc sở hữu của mình.
- **FR-028**: Cấu hình widget PHẢI bao gồm: lời chào ban đầu (`greeting_message`), vị trí widget (`position`: bottom-right / bottom-left), màu sắc chủ đạo (`primary_color`: hex), avatar URL (`avatar_url`), và danh sách quick replies (`quick_replies`: array of string, tối đa 5).
- **FR-029**: Khi chi nhánh chưa có config, hệ thống PHẢI trả về giá trị mặc định thay vì lỗi.
- **FR-030**: `GET /api/cafes/:cafeId/chat/config` PHẢI là public endpoint — widget FE gọi khi khởi tạo, không cần auth.
- **FR-031**: `PUT /api/cafes/:cafeId/chat/config` chỉ PROVIDER sở hữu cafe đó mới được gọi.

**Knowledge Base — Provider facing**

- **FR-008**: Hệ thống PHẢI cho phép Provider upload tài liệu (PDF, DOCX, TXT, Markdown) cho chi nhánh thuộc sở hữu của mình.
- **FR-009**: Hệ thống PHẢI từ chối file vượt quá 10MB với thông báo lỗi rõ ràng.
- **FR-010**: Hệ thống PHẢI từ chối file sai định dạng với thông báo lỗi rõ ràng.
- **FR-011**: Hệ thống PHẢI xử lý tài liệu bất đồng bộ sau khi upload — không bắt Provider chờ.
- **FR-012**: Hệ thống PHẢI cập nhật trạng thái tài liệu: `Đang xử lý` → `Đã sẵn sàng` hoặc `Lỗi`.
- **FR-012a**: Sau khi trạng thái tài liệu thay đổi, hệ thống PHẢI push WebSocket event đến Provider đang kết nối để thông báo kết quả xử lý ngay lập tức.
- **FR-013**: Hệ thống PHẢI cho phép Provider xem danh sách tài liệu đã upload của chi nhánh.
- **FR-014**: Hệ thống PHẢI cho phép Provider xóa tài liệu; việc xóa PHẢI loại bỏ hoàn toàn nội dung đó khỏi KB.
- **FR-015**: Hệ thống PHẢI thay thế nội dung cũ khi Provider upload lại tài liệu cùng tên.
- **FR-016**: Provider chỉ ĐƯỢC phép quản lý KB của các chi nhánh thuộc sở hữu của mình.

### Key Entities

- **KbDocument**: Tài liệu gốc do Provider upload. Gắn với một chi nhánh. Có trạng thái xử lý (đang xử lý / đã sẵn sàng / lỗi). Lưu nội dung text gốc.
- **KbChunk**: Đoạn văn bản nhỏ được tách ra từ KbDocument sau xử lý. Gắn với chi nhánh và tài liệu gốc. Là đơn vị cơ bản để tra cứu ngữ nghĩa.
- **NluIntent**: Phân loại ý định của message. Được NLU service trả về. Quyết định route xử lý (fast / slot_check / rag). Không lưu DB.
- **CafeWidgetConfig**: Cấu hình giao diện và hành vi chat widget per cafe. Bao gồm: lời chào ban đầu, vị trí widget, màu sắc chủ đạo, avatar URL, danh sách quick replies. Có giá trị mặc định khi Provider chưa cấu hình.
- **Cafe** (đã có): Nguồn dữ liệu bổ sung — tên, địa chỉ, giờ mở cửa, loại sân được dùng để trả lời câu hỏi cơ bản kể cả khi KB chưa có tài liệu.
- **Booking** (đã có): Nguồn dữ liệu để tra cứu slot trống theo thời gian thực.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Customer nhận được câu trả lời trong thời gian phù hợp với từng loại câu hỏi: chào hỏi/đơn giản dưới 200ms, hỏi slot trống dưới 500ms, câu hỏi cần tra cứu KB dưới 3 giây.
- **SC-002**: Bot trả lời đúng thông tin ít nhất 90% câu hỏi về dữ liệu có trong KB (đo bằng bộ test câu hỏi chuẩn).
- **SC-003**: Bot không bao giờ trả lời thông tin của chi nhánh A cho Customer đang chat với chi nhánh B (isolation tuyệt đối).
- **SC-004**: Provider upload tài liệu dưới 5MB và KB sẵn sàng trong vòng 60 giây.
- **SC-005**: Khi hỏi về slot trống, thông tin trả về phản ánh đúng trạng thái booking trong DB tại thời điểm hỏi.
- **SC-006**: Tỷ lệ lỗi xử lý tài liệu (FAILED status) dưới 5% với các file đúng định dạng và dưới giới hạn kích thước.

---

## Assumptions

- Conversation history được lưu và quản lý phía client (browser/app) — backend không lưu lịch sử chat vào DB trong phase này.
- Chi nhánh chưa có KB vẫn có thể được chat — bot sẽ trả lời dựa trên dữ liệu cơ bản từ bảng `cafes` (tên, địa chỉ, giờ mở cửa).
- Provider đã đăng nhập và có JWT token hợp lệ khi quản lý KB; Customer không cần xác thực để chat.
- Mỗi tài liệu upload là độc lập — không có quan hệ phân cấp giữa các tài liệu.
- Slot trống được tính dựa trên `max_concurrent_bookings` của cafe trừ đi số booking đang CONFIRMED/ACTIVE trong khung giờ đó.
- Phase này chỉ implement backend API; frontend widget sẽ làm trong phase tiếp theo.
- Chỉ hỗ trợ text-based documents — không cần OCR cho ảnh trong file PDF.
- WebSocket infrastructure được xây dựng để dùng chung cho toàn hệ thống (không chỉ riêng tính năng AI chat). Phase này implement nền tảng WebSocket và event đầu tiên là `kb_document.status_changed`.
- NLU service là tái sử dụng codebase Mekit NLU (Python/FastAPI + sentence-transformers), chỉ thay file intents JSON cho domain RC. Chạy như Docker container riêng, chỉ expose nội bộ — không public ra internet.
- NLU service load model một lần lúc khởi động; inference sau đó ~10ms/request không phụ thuộc external API.
