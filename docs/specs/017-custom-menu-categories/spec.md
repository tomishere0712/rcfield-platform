# Feature Specification: Danh mục F&B do Provider tự tạo

**Feature Branch**: `main` (không tạo nhánh mới — làm trực tiếp trên nhánh hiện tại)
**Created**: 2026-07-25
**Status**: Draft
**Input**: User description: "Refactor F&B category từ hardcode enum sang provider tự tạo (custom menu categories per cafe). Hiện category là Postgres native enum FnbCategory (FOOD/DRINK/SNACK/DESSERT/COMBO/OTHER) hardcode ở backend và FNB_CATEGORIES hardcode ở frontend. Thay bằng bảng menu_categories thuộc từng cafe, provider tự tạo/sửa/xóa/sắp xếp category riêng cho chi nhánh của mình. Không migrate data cũ — món hiện có về 'Chưa phân loại'. Xóa category còn món thì món về 'Chưa phân loại' (không chặn). Bỏ hardcode category=COMBO khi tạo combo, provider tự gán category cho combo; giữ nguyên flag isCombo."

---

## Bối cảnh vấn đề

Hiện tại hệ thống áp một bộ danh mục F&B **cố định, chung cho toàn platform**: Đồ ăn, Đồ uống, Ăn vặt, Tráng miệng, Combo, Khác. Provider không thể thêm, sửa, xóa hay sắp xếp lại. Điều này gây ba vấn đề thực tế:

1. **Không khớp mô hình kinh doanh của từng chi nhánh.** Một quán thiên về cà phê muốn tách "Cà phê" / "Trà" / "Đá xay"; một quán thiên về đồ ăn muốn "Món chính" / "Món phụ" / "Nước". Cả hai đều bị ép vào cùng 6 danh mục chung chung.
2. **Combo bị ép cứng vào danh mục "Combo".** Khi provider ghép nhiều món thành một gói và tự đặt tên (ví dụ "Combo tiết kiệm"), hệ thống tự động gán danh mục "Combo" thay vì để provider quyết định.
3. **Tên danh mục hiển thị sai cho khách.** Ở màn hình chọn món trong luồng đặt lịch và trang chi tiết chi nhánh, hệ thống đang hiển thị **mã kỹ thuật thô** (ví dụ chữ `DRINK`) thay vì tên tiếng Việt ("Đồ uống"). Khách hàng nhìn thấy chuỗi ký tự tiếng Anh vô nghĩa.

Tính năng này trao quyền quản lý danh mục về cho Provider, đồng thời sửa lỗi hiển thị tên danh mục thô ở phía khách hàng.

---

## Clarifications

> Các quyết định dưới đây **thay thế** phần mô tả gốc ở trường `Input` nếu có mâu thuẫn.

### Session 2026-07-25

- Q: Xóa danh mục là xóa cứng (biến mất khỏi dữ liệu) hay xóa mềm (đánh dấu đã xóa)? → A: **Xóa mềm**, theo quy ước `deleted_at` bắt buộc cho mọi entity của dự án. Danh mục đã xóa không hiển thị ở bất kỳ màn hình nào và không chiếm chỗ trong ràng buộc trùng tên, nên Provider tạo lại danh mục cùng tên được ngay.
- Q: Danh mục đang còn món thì xử lý thế nào khi Provider bấm xóa? → A: **Chặn xóa.** Hệ thống từ chối và nêu rõ số món còn lại; Provider phải chuyển hết món sang danh mục khác (hoặc bỏ danh mục của món) rồi mới xóa được danh mục rỗng. *(Quyết định này đảo ngược phương án "cho xóa, món về Chưa phân loại" nêu trong `Input` gốc.)*

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Provider tự tạo và quản lý bộ danh mục cho từng chi nhánh (Priority: P1)

Provider mở phần quản lý Menu F&B của một chi nhánh, thấy khu vực quản lý danh mục riêng. Provider tạo các danh mục phù hợp với chi nhánh đó (ví dụ "Cà phê", "Trà sữa", "Đồ ăn nhẹ"), đổi tên khi cần, sắp xếp lại thứ tự hiển thị, và xóa danh mục không dùng nữa. Mỗi chi nhánh có bộ danh mục độc lập — chi nhánh Tân Bình và chi nhánh Sài Gòn có thể có bộ danh mục hoàn toàn khác nhau.

**Why this priority**: Đây là năng lực cốt lõi của tính năng. Không có bước này thì mọi thứ còn lại không có gì để gán. Bản thân nó đã tạo giá trị: provider có được bộ danh mục đúng với cách họ vận hành.

**Independent Test**: Đăng nhập bằng tài khoản Provider, vào Menu F&B của một chi nhánh, tạo 3 danh mục, đổi tên 1 danh mục, kéo đổi thứ tự, xóa 1 danh mục rỗng. Kiểm tra chi nhánh thứ hai của cùng provider vẫn giữ bộ danh mục riêng, không bị ảnh hưởng.

**Acceptance Scenarios**:

1. **Given** provider đang xem Menu F&B của chi nhánh chưa có danh mục nào, **When** provider tạo danh mục tên "Cà phê", **Then** danh mục xuất hiện trong danh sách danh mục của chi nhánh đó và có thể chọn khi tạo món.
2. **Given** chi nhánh đã có danh mục "Cà phê", **When** provider đổi tên thành "Cà phê & Trà", **Then** tên mới hiển thị ở mọi nơi tham chiếu danh mục đó (quản lý menu, trang khách, màn hình chọn món).
3. **Given** chi nhánh có 4 danh mục, **When** provider sắp xếp lại thứ tự, **Then** thứ tự mới được áp dụng nhất quán ở cả màn hình quản lý lẫn màn hình khách xem menu.
4. **Given** provider A quản lý chi nhánh X, **When** provider A cố truy cập hoặc sửa danh mục của chi nhánh Y thuộc provider khác, **Then** hệ thống từ chối và không tiết lộ dữ liệu chi nhánh Y.
5. **Given** chi nhánh đã có danh mục tên "Cà phê", **When** provider tạo thêm một danh mục cũng tên "Cà phê" cho cùng chi nhánh, **Then** hệ thống từ chối với thông báo trùng tên rõ ràng.
6. **Given** danh mục "Cà phê" đang chứa 5 món, **When** provider bấm xóa danh mục đó, **Then** hệ thống từ chối và thông báo nêu rõ còn 5 món cần xử lý trước.
7. **Given** provider đã chuyển hết món khỏi danh mục "Cà phê", **When** provider xóa danh mục đó, **Then** xóa thành công và danh mục biến mất khỏi mọi màn hình.
8. **Given** provider vừa xóa danh mục "Cà phê", **When** provider tạo lại một danh mục cũng tên "Cà phê" cho chi nhánh đó, **Then** tạo thành công, không bị báo trùng tên với danh mục đã xóa.

---

### User Story 2 — Gán danh mục cho món lẻ và cho combo (Priority: P1)

Khi provider tạo hoặc sửa một món F&B, provider chọn danh mục từ đúng bộ danh mục của chi nhánh đó. Khi provider ghép nhiều món thành combo và tự đặt tên (ví dụ "Combo tiết kiệm"), provider cũng tự chọn danh mục cho combo đó thay vì bị hệ thống ép vào danh mục "Combo" cố định. Món hoặc combo có thể để trống danh mục — khi đó nó thuộc nhóm "Chưa phân loại".

**Why this priority**: Danh mục chỉ có ý nghĩa khi được gán vào món. Cùng với User Story 1, đây là phần tối thiểu để tính năng dùng được thật.

**Independent Test**: Tạo một món lẻ và gán danh mục vừa tạo; tạo một combo gồm 2 món, đặt tên "Combo tiết kiệm" và gán cho nó một danh mục do provider chọn. Kiểm tra cả hai hiển thị đúng danh mục đã gán, và combo **không** bị tự động gán danh mục "Combo".

**Acceptance Scenarios**:

1. **Given** chi nhánh có danh mục "Trà sữa", **When** provider tạo món "Trà đào" và chọn danh mục "Trà sữa", **Then** món được lưu với danh mục đó và hiển thị đúng trong danh sách.
2. **Given** provider đang tạo combo gồm 2 món, **When** provider đặt tên "Combo tiết kiệm" và chọn danh mục "Đồ ăn nhẹ", **Then** combo được lưu với danh mục "Đồ ăn nhẹ", không bị hệ thống ghi đè thành "Combo".
3. **Given** provider đang tạo món mới, **When** provider không chọn danh mục nào, **Then** món được lưu thành công và được xếp vào nhóm "Chưa phân loại".
4. **Given** provider đang tạo món cho chi nhánh X, **When** provider mở danh sách danh mục để chọn, **Then** chỉ thấy danh mục thuộc chi nhánh X, không thấy danh mục của chi nhánh khác.
5. **Given** một combo đã tồn tại, **When** provider xem danh sách menu, **Then** combo vẫn được nhận diện là combo (hiển thị được các món thành phần) độc lập với danh mục mà provider đã gán cho nó.

---

### User Story 3 — Khách hàng và Staff duyệt menu theo danh mục với tên hiển thị đúng (Priority: P2)

Khách hàng xem trang chi tiết chi nhánh hoặc chọn món trong luồng đặt lịch sẽ thấy menu nhóm theo danh mục do provider đặt, hiển thị đúng tên tiếng Việt provider đã nhập. Staff khi thêm món cho khách tại quầy cũng thấy cùng bộ danh mục đó. Nhóm "Chưa phân loại" luôn hiển thị cuối cùng.

**Why this priority**: Đây là nơi giá trị chạm tới người dùng cuối và là nơi sửa lỗi hiển thị mã thô đang tồn tại. Tuy nhiên nó phụ thuộc vào US1 và US2 đã có dữ liệu.

**Independent Test**: Với chi nhánh đã có danh mục và món được gán, mở trang chi tiết chi nhánh bằng tài khoản khách và mở bước chọn món trong luồng đặt lịch. Xác nhận tên danh mục hiển thị đúng tiếng Việt provider đã nhập, không xuất hiện chuỗi mã kỹ thuật.

**Acceptance Scenarios**:

1. **Given** chi nhánh có danh mục "Đồ uống" chứa 3 món, **When** khách mở trang chi tiết chi nhánh, **Then** thấy nhãn "Đồ uống" đúng như provider đã nhập, không phải mã thô.
2. **Given** khách đang ở bước chọn món trong luồng đặt lịch, **When** khách xem danh sách món, **Then** mỗi món hiển thị tên danh mục đúng theo tên provider đặt.
3. **Given** chi nhánh có món chưa gán danh mục, **When** khách xem menu, **Then** các món đó nằm trong nhóm "Chưa phân loại" đặt ở cuối danh sách.
4. **Given** provider đã sắp xếp thứ tự danh mục, **When** khách xem menu, **Then** thứ tự nhóm hiển thị khớp với thứ tự provider đã đặt.
5. **Given** một danh mục không có món nào đang bán, **When** khách xem menu, **Then** danh mục rỗng đó không hiển thị cho khách.
6. **Given** staff đang thêm món cho khách tại quầy, **When** staff duyệt danh sách món, **Then** thấy đúng bộ danh mục của chi nhánh mình đang trực.

---

### User Story 4 — Trợ lý AI trả lời thực đơn theo danh mục do provider đặt (Priority: P3)

Khi khách hỏi trợ lý AI của chi nhánh về thực đơn ("quán có đồ uống gì?"), trợ lý nhóm và trình bày món theo đúng bộ danh mục provider đã tạo, dùng tên tiếng Việt provider đã nhập.

**Why this priority**: Cải thiện chất lượng trả lời của trợ lý nhưng không chặn luồng đặt lịch hay quản lý menu. Có thể triển khai sau khi ba story trên đã ổn định.

**Independent Test**: Với chi nhánh đã cấu hình danh mục, hỏi trợ lý AI về thực đơn và xác nhận câu trả lời nhóm món theo tên danh mục provider đặt, không dùng mã kỹ thuật.

**Acceptance Scenarios**:

1. **Given** chi nhánh có danh mục "Cà phê" và "Trà sữa" với món tương ứng, **When** khách hỏi trợ lý về thực đơn, **Then** trợ lý trình bày món nhóm theo hai tên danh mục đó.
2. **Given** chi nhánh có món chưa phân loại, **When** khách hỏi thực đơn, **Then** trợ lý xếp các món đó vào nhóm "Chưa phân loại".

---

### Edge Cases

- **Xóa danh mục vẫn còn món:** Hệ thống **chặn xóa**. Thông báo phải nêu rõ số món còn lại; Provider phải chuyển hết món sang danh mục khác hoặc bỏ danh mục của món rồi mới xóa được. Món đang tạm ngưng bán vẫn tính là món thuộc danh mục, nên vẫn chặn.
- **Tạo lại danh mục trùng tên với danh mục đã xóa:** Cho phép. Danh mục đã xóa không tham gia ràng buộc trùng tên.
- **Dữ liệu sẵn có sau khi chuyển đổi:** Tất cả món F&B hiện tại sẽ về "Chưa phân loại" — phân loại cũ (Đồ ăn/Đồ uống/Ăn vặt/Tráng miệng/Combo/Khác) **không được giữ lại**. Provider phải tạo lại danh mục và gán lại cho món. Đây là quyết định có chủ đích, đã được xác nhận.
- **Trùng tên danh mục:** Trong cùng một chi nhánh không được có hai danh mục cùng tên (không phân biệt hoa/thường và khoảng trắng thừa). Hai chi nhánh khác nhau được phép trùng tên.
- **Danh mục rỗng:** Danh mục không có món nào vẫn hiển thị ở màn hình quản lý của provider (để provider biết nó tồn tại), nhưng ẩn khỏi màn hình khách hàng.
- **Nhóm "Chưa phân loại" không có món nào:** Ẩn hoàn toàn khỏi màn hình khách hàng, giống như danh mục rỗng. Ở màn hình quản lý cũng không hiển thị nhóm rỗng này.
- **Đổi tên danh mục sau khi khách đã đặt món:** Đơn F&B đã đặt không lưu danh mục, chỉ lưu tên món và giá tại thời điểm đặt. Vì vậy đổi tên hoặc xóa danh mục **không làm thay đổi** hóa đơn, chi tiết booking, màn hình staff hay báo cáo doanh thu đã phát sinh.
- **Món thuộc chi nhánh khác:** Không được gán cho món một danh mục thuộc chi nhánh khác.
- **Tên danh mục rỗng hoặc chỉ có khoảng trắng:** Bị từ chối với thông báo rõ ràng.
- **Số lượng danh mục quá lớn:** Có giới hạn trên hợp lý cho mỗi chi nhánh để tránh menu không dùng được.
- **Xóa toàn bộ danh mục:** Chi nhánh không còn danh mục nào vẫn hoạt động bình thường — mọi món nằm trong "Chưa phân loại".

---

## Requirements *(mandatory)*

### Functional Requirements

**Quản lý danh mục**

- **FR-001**: Hệ thống MUST cho phép Provider tạo danh mục F&B mới thuộc về một chi nhánh cụ thể mà Provider đó sở hữu.
- **FR-002**: Hệ thống MUST cho phép Provider đổi tên một danh mục hiện có của chi nhánh mình.
- **FR-003**: Hệ thống MUST cho phép Provider xóa một danh mục **rỗng** (không còn món nào) của chi nhánh mình. Xóa MUST là xóa mềm: bản ghi được đánh dấu đã xóa thay vì biến mất, MUST KHÔNG hiển thị ở bất kỳ màn hình nào, và MUST KHÔNG chiếm chỗ trong ràng buộc trùng tên tại FR-006.
- **FR-004**: Hệ thống MUST cho phép Provider chỉ định thứ tự hiển thị của các danh mục trong một chi nhánh.
- **FR-005**: Hệ thống MUST lưu danh mục gắn với đúng một chi nhánh; danh mục của chi nhánh này KHÔNG được xuất hiện hay sử dụng được ở chi nhánh khác, kể cả khi hai chi nhánh cùng một Provider.
- **FR-006**: Hệ thống MUST từ chối tạo hoặc đổi tên danh mục nếu tên trùng với một danh mục khác **chưa bị xóa** trong cùng chi nhánh, so sánh không phân biệt hoa/thường và bỏ qua khoảng trắng thừa ở hai đầu. Danh mục đã xóa MUST KHÔNG gây xung đột tên.
- **FR-007**: Hệ thống MUST từ chối tên danh mục rỗng hoặc chỉ gồm khoảng trắng.
- **FR-008**: Hệ thống MUST giới hạn độ dài tên danh mục ở mức hợp lý cho hiển thị (tối đa 50 ký tự) và giới hạn số danh mục tối đa mỗi chi nhánh (tối đa 30).
- **FR-009**: Hệ thống MUST chỉ cho phép Provider sở hữu chi nhánh quản lý danh mục của chi nhánh đó; mọi vai trò khác chỉ được xem. *(Khớp với phạm vi quyền hiện hành của toàn bộ module menu — quản trị viên hệ thống hiện cũng không sửa được món; việc mở quyền cho quản trị viên là hạng mục riêng cho cả module, không thuộc tính năng này.)*

**Gán danh mục cho món**

- **FR-010**: Hệ thống MUST cho phép Provider gán một danh mục cho món F&B khi tạo mới hoặc khi cập nhật.
- **FR-011**: Hệ thống MUST cho phép món F&B không có danh mục; món như vậy được coi là thuộc nhóm "Chưa phân loại".
- **FR-012**: Hệ thống MUST chỉ chấp nhận danh mục thuộc cùng chi nhánh với món; gán danh mục chéo chi nhánh phải bị từ chối.
- **FR-013**: Hệ thống MUST cho phép Provider tự chọn danh mục cho combo giống như món lẻ, và MUST KHÔNG tự động gán bất kỳ danh mục cố định nào cho combo.
- **FR-014**: Hệ thống MUST tiếp tục phân biệt combo với món lẻ như một thuộc tính độc lập với danh mục, để vẫn hiển thị được các món thành phần của combo và vẫn áp dụng được các quy tắc riêng của combo (ví dụ không cho lồng combo vào combo).

**Xóa danh mục**

- **FR-015**: Hệ thống MUST từ chối xóa một danh mục còn chứa ít nhất một món, và MUST nêu rõ số lượng món còn lại trong thông báo từ chối. Món đang tạm ngưng bán vẫn được tính là món thuộc danh mục.
- **FR-016**: Hệ thống MUST cho phép Provider chuyển một món sang danh mục khác hoặc bỏ danh mục của món, để Provider có thể làm rỗng một danh mục trước khi xóa.

**Hiển thị và duyệt menu**

- **FR-017**: Hệ thống MUST hiển thị tên danh mục đúng như Provider đã nhập ở mọi màn hình có hiển thị danh mục, cho mọi vai trò (Provider, Staff, Customer, khách vãng lai) — MUST KHÔNG hiển thị mã kỹ thuật nội bộ.
- **FR-018**: Hệ thống MUST nhóm và sắp xếp menu theo thứ tự danh mục do Provider đặt, ở cả màn hình quản lý lẫn màn hình khách hàng.
- **FR-019**: Hệ thống MUST đặt nhóm "Chưa phân loại" ở cuối cùng sau tất cả danh mục đã đặt tên.
- **FR-020**: Hệ thống MUST cho phép lọc danh sách món theo danh mục trong màn hình quản lý menu của Provider.
- **FR-021**: Hệ thống MUST ẩn khỏi màn hình khách hàng những danh mục không chứa món nào đang bán, đồng thời vẫn hiển thị danh mục rỗng ở màn hình quản lý của Provider.
- **FR-022**: Chỉ số "số lượng danh mục" hiển thị cho Provider MUST phản ánh số danh mục thật của chi nhánh đang chọn.

**Trợ lý AI**

- **FR-023**: Khi trợ lý AI của chi nhánh trả lời câu hỏi về thực đơn, hệ thống MUST nhóm món theo danh mục do Provider đặt và dùng tên hiển thị của danh mục đó.

**Toàn vẹn dữ liệu lịch sử**

- **FR-024**: Việc tạo, đổi tên, sắp xếp hoặc xóa danh mục MUST KHÔNG làm thay đổi bất kỳ đơn F&B đã phát sinh, hóa đơn, chi tiết booking, màn hình phiên chạy của Staff, hay số liệu báo cáo doanh thu đã ghi nhận.
- **FR-025**: Sau khi chuyển đổi hệ thống, toàn bộ món F&B hiện có MUST nằm trong nhóm "Chưa phân loại" và MUST giữ nguyên tên, giá, mô tả, ảnh, trạng thái bán và quan hệ combo.

### Key Entities

- **Danh mục F&B (Menu Category)**: Nhóm phân loại món do Provider tự định nghĩa. Thuộc về đúng một chi nhánh. Có tên hiển thị (duy nhất trong chi nhánh) và thứ tự hiển thị. Một danh mục chứa không hoặc nhiều món.
- **Món F&B (Menu Item)**: Món ăn/thức uống hoặc combo của một chi nhánh. Có tên, giá, mô tả, ảnh, trạng thái đang bán, cờ đánh dấu là combo, và **tùy chọn** thuộc về một danh mục của cùng chi nhánh. Không có danh mục nghĩa là "Chưa phân loại".
- **Chi nhánh (Cafe)**: Đơn vị sở hữu bộ danh mục và bộ món riêng. Hai chi nhánh của cùng một Provider có bộ danh mục hoàn toàn độc lập.
- **Đơn F&B đã phát sinh (F&B Order Item)**: Bản ghi món khách đã đặt, lưu tên món và giá tại thời điểm đặt. **Không tham chiếu danh mục**, nên miễn nhiễm với mọi thay đổi danh mục về sau.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Provider tạo được một bộ 5 danh mục hoàn chỉnh cho một chi nhánh trong vòng dưới 2 phút, không cần hướng dẫn hay hỗ trợ.
- **SC-002**: 100% màn hình có hiển thị danh mục (quản lý menu của Provider, form tạo/sửa món, bước chọn món khi đặt lịch, trang chi tiết chi nhánh, màn hình Staff, câu trả lời trợ lý AI) hiển thị tên tiếng Việt do Provider nhập; không màn hình nào còn hiển thị mã kỹ thuật thô.
- **SC-003**: Provider vận hành nhiều chi nhánh có thể đặt bộ danh mục khác nhau cho từng chi nhánh, và thay đổi ở chi nhánh này không ảnh hưởng chi nhánh kia trong 100% trường hợp kiểm thử.
- **SC-004**: 100% thao tác xóa danh mục còn món bị hệ thống từ chối kèm thông báo nêu đúng số món còn lại; không có món nào bị mất phân loại ngoài chủ ý của Provider.
- **SC-005**: Sau khi chuyển đổi hệ thống, 100% món F&B hiện có vẫn giữ nguyên tên, giá và trạng thái bán; không đơn F&B đã phát sinh nào bị thay đổi giá trị.
- **SC-006**: Provider gán được danh mục tùy ý cho combo trong 100% trường hợp; không combo nào bị hệ thống tự gán danh mục.
- **SC-007**: Khách hàng duyệt menu thấy các nhóm đúng thứ tự Provider đã đặt trong 100% lượt xem, với nhóm "Chưa phân loại" luôn ở cuối.

---

## Assumptions

- **Phạm vi danh mục là cấp chi nhánh, không phải cấp Provider.** Đã được xác nhận trực tiếp: mỗi chi nhánh có bộ danh mục riêng. Provider vận hành nhiều chi nhánh phải tạo danh mục riêng cho từng chi nhánh, chấp nhận việc phải nhập lại nếu muốn bộ danh mục giống nhau.
- **Không chuyển đổi dữ liệu phân loại cũ.** Đã được xác nhận: món hiện có về "Chưa phân loại", Provider tự tạo lại danh mục và gán lại. Hệ quả là ngay sau khi triển khai, menu của mọi chi nhánh sẽ hiển thị toàn bộ món trong một nhóm duy nhất cho tới khi Provider phân loại lại.
- **"Chưa phân loại" là nhóm ngầm định, không phải một danh mục có thể sửa.** Provider không tạo, đổi tên hay xóa được nhóm này; nó chỉ là cách hiển thị các món chưa gán danh mục.
- **Danh mục không có ảnh, mô tả hay trạng thái bật/tắt riêng** trong phạm vi phiên bản này — chỉ có tên và thứ tự. Ẩn danh mục khỏi khách hàng được suy ra tự động từ việc danh mục có món đang bán hay không.
- **Staff không được quản lý danh mục**, chỉ xem. Việc phân loại menu là quyết định kinh doanh thuộc về Provider.
- **Giới hạn 30 danh mục mỗi chi nhánh và 50 ký tự mỗi tên** là mặc định hợp lý cho khả năng đọc của menu, không phải ràng buộc do Provider yêu cầu.
- **Danh mục mới tạo được xếp xuống cuối danh sách** theo thứ tự hiển thị; Provider tự kéo lên vị trí mong muốn nếu cần.
- **Không có chức năng hoàn tác xóa.** Vì chỉ xóa được danh mục rỗng nên rủi ro xóa nhầm là thấp — Provider tạo lại danh mục cùng tên ngay được. Bản ghi đã xóa vẫn được giữ ở tầng dữ liệu (xóa mềm) nhưng không lộ ra giao diện và không có đường khôi phục trong phiên bản này.
- **Việc "làm rỗng danh mục" dùng lại chức năng sửa món sẵn có**, không cần công cụ chuyển hàng loạt riêng. Nếu về sau Provider phản ánh việc sửa tay từng món quá tốn công với danh mục nhiều món, có thể bổ sung thao tác chuyển hàng loạt ở phiên bản sau.

---

## Out of Scope

Những mục sau **không** thuộc phạm vi tính năng này, ghi lại để tránh hiểu nhầm:

- **Kích cỡ đồ uống (size M/L).** Đây là tính năng riêng đã được nêu ra và tạm hoãn. Thiết kế danh mục ở đây không nên cản trở việc bổ sung kích cỡ về sau.
- **Sửa cách Staff tra cứu món khi gọi món tại quầy.** Hiện hệ thống tra món theo **tên món** thay vì theo định danh món. Đây là điểm yếu có sẵn, không liên quan tới danh mục, nhưng sẽ gây lỗi khi triển khai tính năng kích cỡ (hai kích cỡ trùng tên món). Đề xuất xử lý cùng tính năng kích cỡ.
- **Danh mục dùng chung ở cấp Provider hoặc bộ danh mục mẫu (template) để nhân bản sang chi nhánh mới.** Có thể cân nhắc ở phiên bản sau nếu Provider nhiều chi nhánh phản ánh việc nhập lại quá tốn công.
- **Phân cấp danh mục (danh mục con).** Chỉ hỗ trợ một cấp phẳng.
