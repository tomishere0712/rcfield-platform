# Feature Specification: Quản lý thu chi giải đấu

**Feature Branch**: `018-contest-finance`
**Created**: 2026-08-08
**Status**: Draft
**Input**: User description: "Quản lý thu chi của giải đấu (contest finance) cho Provider — sổ cái thu/chi, tổng hợp lãi lỗ, staff ghi chi phí phát sinh, thu ngoài lệ phí, không cần dự toán."

## Clarifications

### Session 2026-08-08

- Q: Quản trị viên nền tảng có xem được báo cáo tài chính của giải không? → A: Không — báo cáo và sổ thu chi hoàn toàn riêng tư với chủ doanh nghiệp sở hữu giải
- Q: Danh mục loại khoản thu/chi cố định hay cho chủ doanh nghiệp tự thêm? → A: Cố định; khoản lạ dùng loại "Khác" kèm mô tả ở tiêu đề
- Q: Nhân viên được ghi chi phí phát sinh trong khoảng thời gian nào của giải? → A: Chỉ khi giải đang chạy; khoản chuẩn bị trước và dọn dẹp sau do chủ doanh nghiệp tự ghi
- Q: Có màn tổng hợp tài chính nhiều giải cùng lúc không? → A: Không — chỉ báo cáo từng giải riêng lẻ
- Q: Đăng ký bị huỷ khi chưa đóng lệ phí thì tính vào đâu trong báo cáo? → A: Loại hẳn khỏi mọi nhóm lệ phí, không có dòng riêng; luồng khách tự huỷ đăng ký sẽ được gỡ bỏ trong một thay đổi khác

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Provider xem bức tranh tài chính của một giải (Priority: P1)

Chủ doanh nghiệp vừa tổ chức xong một giải đấu và cần biết giải đó lãi hay lỗ. Hiện tại họ phải mở danh sách đăng ký, đếm tay từng người đã đóng lệ phí, rồi tự nhớ xem đã chi bao nhiêu cho giải thưởng và các khoản khác — không có nơi nào ghi lại.

Với tính năng này, chủ doanh nghiệp mở tab **Tài chính** trong workspace của giải và thấy ngay: tổng thu, tổng chi, và số dư ròng. Phần thu tự động gom lệ phí từ danh sách đăng ký; phần chi tự động gồm phí tổ chức đã trả cho nền tảng.

**Why this priority**: Đây là toàn bộ giá trị cốt lõi. Ngay cả khi chưa ghi một bút toán thủ công nào, việc gom lệ phí và phí nền tảng lại thành một con số đã thay thế được thao tác đếm tay hiện tại. Mọi user story còn lại chỉ làm giàu thêm bức tranh này.

**Independent Test**: Tạo một giải có lệ phí, cho vài người đăng ký với các trạng thái thanh toán khác nhau, mua một gói tổ chức và để admin xác nhận đã nhận tiền. Mở tab Tài chính — báo cáo phải hiển thị đúng số đã thu, số chờ thu, số đã miễn, và phí nền tảng, mà không cần nhập tay bất cứ điều gì.

**Acceptance Scenarios**:

1. **Given** một giải có 10 người đăng ký với lệ phí 200.000đ mỗi người, trong đó 6 người đã thanh toán, 3 người chờ thanh toán, 1 người được miễn, **When** chủ doanh nghiệp mở tab Tài chính, **Then** báo cáo hiển thị lệ phí đã thu 1.200.000đ, chờ thu 600.000đ, đã miễn 200.000đ.
2. **Given** giải đó đã mua gói tổ chức 500.000đ và nền tảng đã xác nhận nhận tiền, **When** chủ doanh nghiệp xem phần chi, **Then** có một dòng "Phí tổ chức giải" 500.000đ mà chủ doanh nghiệp không nhập tay, và dòng này không sửa/xoá được.
3. **Given** cùng giải đó chưa có khoản thu chi thủ công nào, **When** xem số dư ròng, **Then** số dư bằng 1.200.000đ − 500.000đ = 700.000đ.
4. **Given** một giải chưa có ai đăng ký và chưa mua gói, **When** mở tab Tài chính, **Then** báo cáo hiển thị mọi con số bằng 0 kèm hướng dẫn bắt đầu ghi khoản thu chi, không báo lỗi.
5. **Given** người đang đăng nhập là nhân viên được phân công vào giải, **When** họ cố truy cập tab Tài chính, **Then** hệ thống từ chối và không để lộ bất kỳ con số tổng hợp nào.

---

### User Story 2 - Nhân viên ghi chi phí phát sinh ngay tại giải (Priority: P2)

Trong lúc giải đang chạy, nhân viên phải chi những khoản không lường trước: mua thêm pin, taxi chở giải thưởng, in lại bảng đấu, nước cho trọng tài. Nếu đợi đến cuối giải mới báo lại chủ doanh nghiệp thì phần lớn sẽ bị quên hoặc nhớ sai số.

Nhân viên đang vận hành giải mở form ghi chi phí, nhập số tiền và **bắt buộc** nêu lý do, lưu lại. Khoản đó vào sổ ngay và chủ doanh nghiệp thấy được trong báo cáo.

**Why this priority**: Không có bước này thì phần chi trong báo cáo sẽ luôn thiếu, vì người trực tiếp tiêu tiền lại là người không có quyền xem báo cáo. Nhưng chủ doanh nghiệp vẫn tự ghi được các khoản chi lớn, nên đây không phải điều kiện tiên quyết.

**Independent Test**: Đăng nhập bằng tài khoản nhân viên được phân công vào một giải đang chạy, ghi một khoản chi kèm lý do, rồi đăng nhập bằng tài khoản chủ doanh nghiệp và kiểm tra khoản đó đã có trong báo cáo cùng tên người ghi.

**Acceptance Scenarios**:

1. **Given** nhân viên được phân công vào giải, **When** họ ghi một khoản chi 150.000đ với lý do "mua pin dự phòng", **Then** khoản đó được lưu, ghi nhận tên người tạo, và xuất hiện trong báo cáo của chủ doanh nghiệp.
2. **Given** nhân viên đang nhập khoản chi, **When** họ bỏ trống lý do, **Then** hệ thống không cho lưu và chỉ rõ lý do là bắt buộc.
3. **Given** nhân viên đã ghi 3 khoản chi, **When** họ mở danh sách khoản chi của mình, **Then** chỉ thấy 3 khoản do chính họ ghi, không thấy khoản của người khác và không thấy bất kỳ số tổng nào.
4. **Given** nhân viên đang xem màn vận hành giải, **When** họ tìm cách ghi một khoản **thu**, **Then** không có lối vào nào cho thao tác đó và hệ thống từ chối nếu bị gọi trực tiếp.
5. **Given** một nhân viên đã bị gỡ khỏi danh sách phân công của giải, **When** họ mở lại màn vận hành, **Then** không ghi thêm được khoản nào, nhưng các khoản đã ghi trước đó vẫn còn nguyên trong báo cáo của chủ doanh nghiệp.
6. **Given** giải đã đóng đăng ký nhưng chưa tới giờ khai mạc, **When** nhân viên mua vật tư chuẩn bị và tìm cách ghi khoản chi, **Then** hệ thống từ chối và chỉ rõ khoản này phải do chủ doanh nghiệp ghi.
7. **Given** giải vừa bế mạc và chuyển sang trạng thái hoàn thành, **When** nhân viên tìm cách ghi khoản taxi chở giải thưởng về, **Then** hệ thống từ chối vì cửa sổ ghi của nhân viên đã đóng.

---

### User Story 3 - Provider ghi khoản thu ngoài lệ phí và mọi khoản chi (Priority: P2)

Giải đấu xe RC hiếm khi chỉ sống bằng lệ phí. Có nhà tài trợ đưa tiền hoặc hiện vật, có bán vé cho người xem, có doanh thu đồ ăn thức uống trong ngày thi. Chiều ngược lại là tiền thưởng, thuê MC, thuê trọng tài, in banner, trang trí.

Chủ doanh nghiệp mở tab Tài chính, thêm từng khoản với loại, số tiền, ngày phát sinh, ghi chú và ảnh chứng từ nếu có. Sửa hoặc xoá được khi nhập sai.

**Why this priority**: Đây là phần làm cho báo cáo phản ánh đúng thực tế. Không có nó thì báo cáo chỉ đúng với những giải không tài trợ, không giải thưởng — tức gần như không giải nào.

**Independent Test**: Thêm một khoản thu tài trợ và một khoản chi tiền thưởng, kiểm tra số dư ròng thay đổi đúng bằng hiệu hai số đó; sửa số tiền một khoản và kiểm tra báo cáo cập nhật; xoá một khoản và kiểm tra nó biến mất khỏi tổng.

**Acceptance Scenarios**:

1. **Given** chủ doanh nghiệp đang ở tab Tài chính, **When** họ thêm khoản thu "Tài trợ từ RC Shop" 2.000.000đ, **Then** tổng thu tăng 2.000.000đ và số dư ròng tăng tương ứng.
2. **Given** giải đã trao thưởng, **When** chủ doanh nghiệp ghi khoản chi loại "Tiền thưởng" 1.500.000đ, **Then** tổng chi tăng 1.500.000đ và khoản đó nằm trong nhóm tiền thưởng khi xem chi theo loại.
3. **Given** một khoản đã ghi sai số tiền, **When** chủ doanh nghiệp sửa lại, **Then** báo cáo tính lại ngay và hệ thống lưu vết ai sửa, sửa lúc nào, từ giá trị nào sang giá trị nào.
4. **Given** một khoản ghi nhầm hoàn toàn, **When** chủ doanh nghiệp xoá nó, **Then** khoản đó không còn trong báo cáo nhưng vẫn truy được trong lịch sử thao tác của giải.
5. **Given** chủ doanh nghiệp nhập số tiền bằng 0 hoặc số âm, **When** họ lưu, **Then** hệ thống từ chối và giải thích rằng muốn ghi giảm thì tạo một khoản ở chiều ngược lại.
6. **Given** một chủ doanh nghiệp khác không sở hữu giải này, **When** họ cố xem hoặc sửa sổ thu chi của giải, **Then** hệ thống từ chối.

---

### User Story 4 - Đối soát lệ phí thu trực tuyến và thu tiền mặt (Priority: P3)

Chủ doanh nghiệp cầm báo cáo đi đối chiếu với sao kê ngân hàng. Vấn đề: hiện tại một đăng ký được đánh dấu "đã thu" bất kể tiền vào qua cổng thanh toán trực tuyến hay do nhân viên bấm tay sau khi nhận tiền mặt tại quầy. Hai loại tiền này nằm ở hai nơi hoàn toàn khác nhau — một cái trên sao kê, một cái trong két.

Tính năng ghi lại phương thức thu cho mỗi khoản lệ phí, và báo cáo tách riêng hai con số.

**Why this priority**: Không có nó thì báo cáo vẫn dùng được để biết lãi lỗ, nhưng không dùng được để đối soát. Đây là bước nâng độ tin cậy, làm sau khi ba story trên đã chạy.

**Independent Test**: Cho một người thanh toán lệ phí qua cổng trực tuyến và một người trả tiền mặt cho nhân viên; báo cáo phải hiển thị hai con số riêng, cộng lại bằng tổng đã thu.

**Acceptance Scenarios**:

1. **Given** 3 người đã thanh toán lệ phí qua cổng trực tuyến và 2 người trả tiền mặt tại quầy, **When** chủ doanh nghiệp xem phần lệ phí, **Then** thấy hai dòng tách biệt "thu trực tuyến" và "thu tiền mặt", tổng hai dòng bằng tổng đã thu.
2. **Given** nhân viên đánh dấu một đăng ký đã đóng lệ phí, **When** họ thực hiện thao tác, **Then** hệ thống yêu cầu chọn phương thức đã nhận tiền (tiền mặt hoặc chuyển khoản) trước khi lưu.
3. **Given** các đăng ký đã tồn tại từ trước khi có tính năng này, **When** chủ doanh nghiệp xem báo cáo, **Then** những khoản không xác định được phương thức hiển thị thành một dòng riêng "chưa rõ phương thức" thay vì bị gán bừa vào một trong hai loại.

---

### Edge Cases

- **Giải bị huỷ**: báo cáo vẫn xem được ở chế độ chỉ đọc; chủ doanh nghiệp vẫn ghi được khoản chi phát sinh sau khi huỷ (ví dụ tiền cọc địa điểm không lấy lại được) nhưng nhân viên thì không.
- **Chi phí chuẩn bị trước và thu dọn sau**: nhân viên chỉ ghi được khi giải đang chạy, nên vật tư mua từ hôm trước hay taxi chở đồ về sau khi bế mạc đều phải do chủ doanh nghiệp ghi. Nhân viên báo lại các khoản này qua kênh ngoài hệ thống.
- **Đăng ký đã đóng lệ phí rồi bị huỷ**: tiền đã vào vẫn tính là đã thu; nếu hoàn lại cho khách thì ghi thành một khoản chi. Báo cáo không tự trừ ngược.
- **Đăng ký bị huỷ khi chưa đóng lệ phí**: biến mất khỏi báo cáo, không nằm ở nhóm nào. Trường hợp này vẫn xảy ra kể cả sau khi gỡ luồng khách tự huỷ, vì huỷ cả giải sẽ chuyển toàn bộ đăng ký sang trạng thái đã huỷ.
- **Khoản phát sinh trước ngày khai mạc hoặc sau ngày bế mạc**: cho phép, vì tiền cọc địa điểm thường trả trước và tiền thưởng thường trả sau.
- **Xoá một khoản đã nằm trong báo cáo đã xem**: báo cáo tính lại theo dữ liệu hiện tại, không giữ bản chụp; lịch sử thao tác giữ lại dấu vết việc xoá.
- **Nhiều người cùng ghi một lúc**: hai người ghi cùng thời điểm không ghi đè lên nhau; mỗi thao tác tạo một bút toán riêng.
- **Giải trải trên nhiều chi nhánh**: báo cáo ở cấp giải, không tách theo chi nhánh.
- **Đăng ký ở trạng thái chờ nền tảng đối soát**: xếp vào nhóm chờ thu, chưa tính là đã thu.
- **Lệ phí đến từ nhiều đường**: báo cáo chỉ lấy một nguồn duy nhất là trạng thái thanh toán của đăng ký, không cộng thêm từ hoá đơn hay giao dịch nào khác.

## Requirements *(mandatory)*

### Functional Requirements

**Sổ thu chi**

- **FR-001**: Hệ thống MUST cho phép ghi một bút toán gắn với đúng một giải đấu, gồm: chiều tiền (thu hoặc chi), loại khoản, tiêu đề, số tiền, ngày phát sinh, ghi chú, và ảnh chứng từ tuỳ chọn.
- **FR-002**: Hệ thống MUST giới hạn loại khoản **thu** trong: điều chỉnh lệ phí, tài trợ, bán vé, đồ ăn thức uống, khác.
- **FR-003**: Hệ thống MUST giới hạn loại khoản **chi** trong: tiền thưởng bằng tiền, giải thưởng hiện vật, địa điểm, nhân sự, truyền thông, đồ ăn thức uống, khác.
- **FR-003a**: Hai danh sách loại khoản trên MUST là tập đóng — chủ doanh nghiệp KHÔNG tự thêm, sửa hay xoá loại. Khoản không thuộc loại nào có sẵn dùng loại "khác" và mô tả ở tiêu đề. Nhờ đó báo cáo của các giải khác nhau so sánh được với nhau.
- **FR-004**: Hệ thống MUST từ chối bút toán có số tiền nhỏ hơn hoặc bằng 0.
- **FR-005**: Hệ thống MUST KHÔNG có khái niệm khoản dự kiến hay ngân sách — mọi bút toán là khoản đã thực sự phát sinh.
- **FR-006**: Hệ thống MUST ghi lại người tạo, vai trò của người tạo tại thời điểm tạo, và thời điểm tạo cho mọi bút toán.
- **FR-007**: Hệ thống MUST cho phép xoá bút toán theo cách vẫn truy lại được về sau, không xoá vĩnh viễn khỏi lịch sử.

**Báo cáo tổng hợp**

- **FR-008**: Hệ thống MUST cung cấp một báo cáo tài chính cho mỗi giải, gồm tổng thu, tổng chi, và số dư ròng bằng tổng thu trừ tổng chi.
- **FR-009**: Báo cáo MUST tự động tính lệ phí từ danh sách đăng ký, tách thành ba nhóm: đã thu, chờ thu, và đã miễn.
- **FR-009a**: Báo cáo MUST loại đăng ký đã huỷ mà chưa từng thu tiền ra khỏi cả ba nhóm trên, và MUST KHÔNG tạo dòng riêng cho chúng. Khoản chưa bao giờ về không được để trong "chờ thu", vì như vậy là tiền ảo.
- **FR-010**: Báo cáo MUST xếp đăng ký ở trạng thái chờ nền tảng đối soát vào nhóm chờ thu.
- **FR-011**: Báo cáo MUST hiển thị lệ phí đã miễn như một con số tham khảo về doanh thu bỏ qua, KHÔNG cộng vào tổng thu.
- **FR-012**: Báo cáo MUST tự động đưa phí tổ chức giải đã trả cho nền tảng vào phần chi như một dòng riêng, chỉ tính những đơn nền tảng đã xác nhận nhận tiền.
- **FR-013**: Dòng phí tổ chức giải MUST KHÔNG sửa hoặc xoá được từ báo cáo, vì nguồn dữ liệu nằm ở quy trình khác.
- **FR-014**: Báo cáo MUST nhóm các khoản thu và chi thủ công theo loại khoản, kèm tổng của từng loại.
- **FR-015**: Báo cáo MUST phản ánh thay đổi ngay sau khi một bút toán được thêm, sửa hoặc xoá, không cần thao tác đồng bộ thủ công.
- **FR-016**: Báo cáo MUST tính lệ phí từ một nguồn duy nhất là trạng thái thanh toán của đăng ký, không cộng thêm từ bất kỳ hoá đơn hay giao dịch nào khác. Hiện luồng đăng ký chỉ có một đường thu lệ phí nên chưa có rủi ro đếm trùng; ràng buộc này giữ để nếu luồng thanh toán gộp được khôi phục thì báo cáo không tự nhân đôi.

**Phân quyền**

- **FR-017**: Chỉ chủ doanh nghiệp sở hữu giải MUST xem được báo cáo tài chính của giải đó.
- **FR-017a**: Quản trị viên nền tảng MUST KHÔNG xem được báo cáo tài chính hay bất kỳ bút toán nào của giải, kể cả số tổng. Đây là ngoại lệ có chủ đích so với các phần khác của hệ thống, nơi quản trị viên có quyền xem xuyên suốt.
- **FR-018**: Chủ doanh nghiệp sở hữu giải MUST tạo, sửa và xoá được bút toán ở cả hai chiều thu và chi.
- **FR-018a**: Chủ doanh nghiệp sở hữu giải MUST ghi được bút toán ở mọi trạng thái của giải, kể cả khi giải còn là bản nháp, đã hoàn thành, hoặc đã bị huỷ — vì tiền cọc địa điểm trả từ sớm còn tiền thưởng trả sau khi kết thúc.
- **FR-019**: Nhân viên được phân công vào giải MUST tạo được bút toán chiều **chi**, và MUST KHÔNG tạo được bút toán chiều thu.
- **FR-019a**: Nhân viên MUST chỉ ghi được bút toán khi giải đang ở trạng thái **đang chạy**. Ở mọi trạng thái khác — nháp, mở đăng ký, đóng đăng ký, hoàn thành, đã huỷ — hệ thống từ chối và chỉ rõ rằng khoản đó phải do chủ doanh nghiệp ghi.
- **FR-020**: Nhân viên MUST bắt buộc nhập lý do khi ghi khoản chi; hệ thống từ chối lưu nếu bỏ trống.
- **FR-021**: Nhân viên MUST chỉ xem lại được những bút toán do chính mình tạo, và MUST KHÔNG xem được bất kỳ con số tổng hợp nào của giải.
- **FR-022**: Nhân viên MUST KHÔNG sửa hoặc xoá được bút toán, kể cả bút toán do chính mình tạo.
- **FR-023**: Nhân viên đã bị gỡ khỏi phân công MUST KHÔNG ghi thêm được bút toán, nhưng các bút toán họ đã ghi MUST vẫn còn hiệu lực trong báo cáo.
- **FR-024**: Chủ doanh nghiệp không sở hữu giải MUST bị từ chối mọi thao tác đọc và ghi trên sổ thu chi của giải đó.

**Lưu vết**

- **FR-025**: Hệ thống MUST ghi vào nhật ký thao tác của giải mỗi lần bút toán được tạo, sửa hoặc xoá, kèm người thực hiện, vai trò, thời điểm và lý do nếu có.
- **FR-026**: Với thao tác sửa, nhật ký MUST lưu cả giá trị trước và sau.

**Đối soát phương thức thu lệ phí**

- **FR-027**: Hệ thống MUST ghi lại phương thức thu cho mỗi khoản lệ phí đã thu: trực tuyến, tiền mặt, hoặc chuyển khoản.
- **FR-028**: Khi đánh dấu một đăng ký đã đóng lệ phí thủ công, hệ thống MUST yêu cầu chọn phương thức đã nhận tiền trước khi lưu.
- **FR-029**: Báo cáo MUST tách lệ phí đã thu theo phương thức, và các khoản cũ không xác định được phương thức MUST hiển thị thành nhóm riêng thay vì gán bừa.

**Hiển thị**

- **FR-030**: Mọi số tiền MUST hiển thị bằng đồng Việt Nam, không có phần thập phân.
- **FR-031**: Toàn bộ nhãn và thông báo MUST bằng tiếng Việt.

### Key Entities

- **Bút toán giải đấu**: Một khoản tiền thực tế đã vào hoặc ra khỏi túi chủ doanh nghiệp vì một giải cụ thể. Thuộc về đúng một giải. Có chiều (thu/chi), loại khoản, số tiền, ngày phát sinh, tiêu đề, ghi chú, chứng từ tuỳ chọn. Gắn với người tạo và vai trò của người đó lúc tạo. Xoá được nhưng vẫn truy lại được.

- **Báo cáo tài chính giải**: Không phải dữ liệu lưu trữ mà là kết quả tính tại thời điểm xem, gộp từ ba nguồn: lệ phí trong danh sách đăng ký, phí tổ chức đã trả cho nền tảng, và các bút toán thủ công. Chỉ chủ doanh nghiệp sở hữu giải xem được.

- **Phương thức thu lệ phí**: Thuộc tính mới của mỗi đăng ký, cho biết tiền lệ phí vào bằng đường nào. Cần thiết để đối chiếu báo cáo với sao kê ngân hàng.

- **Giải đấu**: Đã tồn tại. Cung cấp mức lệ phí, danh sách đăng ký, trạng thái, và quan hệ sở hữu với chủ doanh nghiệp.

- **Đơn phí tổ chức giải**: Đã tồn tại. Khoản chủ doanh nghiệp trả cho nền tảng để quảng bá giải. Chỉ đơn đã được xác nhận nhận tiền mới vào báo cáo.

- **Nhật ký thao tác giải**: Đã tồn tại. Nơi lưu vết mọi thay đổi trên sổ thu chi.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Chủ doanh nghiệp biết được số dư lãi/lỗ của một giải trong vòng 10 giây kể từ khi mở giải đó, không phải cộng tay bất kỳ con số nào — thay cho việc hiện nay phải mở danh sách đăng ký và đếm thủ công.
- **SC-002**: 100% khoản chi do nhân viên ghi trong lúc vận hành giải xuất hiện trong báo cáo của chủ doanh nghiệp ngay sau khi lưu, không cần thao tác đồng bộ.
- **SC-003**: 100% bút toán truy được đủ ba thông tin: ai tạo, tạo lúc nào, và vì lý do gì.
- **SC-004**: Chủ doanh nghiệp đối chiếu được tổng lệ phí đã thu với sao kê ngân hàng, nhờ báo cáo tách riêng số thu trực tuyến, thu tiền mặt và thu chuyển khoản.
- **SC-005**: Nhân viên không tiếp cận được bất kỳ con số tổng hợp tài chính nào của giải qua bất kỳ đường nào trong ứng dụng.
- **SC-006**: Ghi xong một khoản chi phát sinh trong dưới 30 giây, để nhân viên làm được ngay giữa lúc giải đang chạy mà không phải rời vị trí lâu.
- **SC-007**: Sau khi giải kết thúc, chủ doanh nghiệp trả lời được câu hỏi "giải này lãi hay lỗ bao nhiêu" mà không cần mở thêm bất kỳ công cụ nào ngoài ứng dụng.

## Assumptions

- **Tiền thưởng không nhập hai nơi.** Cơ cấu giải thưởng hiện có trên trang công khai giữ nguyên vai trò text mô tả để thu hút người tham gia; số tiền thưởng thực trả được ghi như một khoản chi loại "tiền thưởng". Không thêm trường số tiền vào cơ cấu giải thưởng.
- **Đăng ký đã đóng tiền rồi bị huỷ vẫn tính là đã thu.** Tiền đã vào là đã vào; nếu hoàn lại cho khách thì chủ doanh nghiệp ghi một khoản chi. Báo cáo không tự động trừ ngược, vì hệ thống hiện chưa có quy trình hoàn lệ phí.
- **Luồng khách tự huỷ đăng ký sẽ được gỡ bỏ** trong một thay đổi riêng, nằm ngoài phạm vi tính năng này. Tuy vậy trạng thái đã huỷ KHÔNG biến mất: huỷ cả giải vẫn chuyển toàn bộ đăng ký sang trạng thái đó. Vì thế FR-009a vẫn phải được triển khai, không được coi là nhánh chết.
- **Khoản chi do nhân viên ghi có hiệu lực ngay, không cần chủ doanh nghiệp duyệt.** Chủ doanh nghiệp sửa hoặc xoá được sau đó nếu thấy sai. Thêm bước duyệt sẽ làm chậm việc ghi ngay tại giải, vốn là lý do tồn tại của story 2.
- **Báo cáo ở cấp giải, không tách theo chi nhánh**, kể cả với giải trải trên nhiều chi nhánh. Việc có tiếp tục hỗ trợ giải nhiều chi nhánh hay không đang là một câu hỏi mở của bản rà soát luồng contest, nên tính năng này không phụ thuộc vào câu trả lời đó.
- **Không xuất file báo cáo** (Excel, PDF) trong phạm vi này. Chủ doanh nghiệp xem trực tiếp trên màn hình.
- **Không có báo cáo tổng hợp nhiều giải.** Mỗi báo cáo chỉ nói về một giải. Nhu cầu nhìn toàn kỳ ("năm nay tổ chức 6 giải, tổng lãi bao nhiêu") thuộc về module phân tích doanh thu sẵn có, không nhân bản vào phần giải đấu để tránh hai nơi cùng trả lời một câu hỏi rồi trôi khỏi nhau.
- **Không có tỷ giá hay đa tiền tệ.** Toàn bộ số liệu bằng đồng Việt Nam.
- **Ảnh chứng từ dùng lại cơ chế lưu trữ ảnh sẵn có của hệ thống**, không xây mới.
- **Không đối chiếu tự động với sao kê ngân hàng.** Tính năng chỉ cung cấp số liệu tách theo phương thức để người dùng tự đối chiếu.
- **Nền tảng không thu phần trăm trên thu chi của giải.** Doanh thu nền tảng vẫn là phí thuê bao và phí gói tổ chức giải, phù hợp với mô hình kinh doanh hiện tại. Đây cũng là lý do quản trị viên nền tảng không cần và không được xem thu chi của giải (FR-017a): không có lý do nghiệp vụ nào để nhìn vào chi phí nội bộ của chủ doanh nghiệp, trong khi các chủ doanh nghiệp lại cạnh tranh nhau trên cùng một hệ thống.
- **FR-017a đi ngược quy ước sẵn có của hệ thống.** Các phần khác cho quản trị viên đi qua mọi kiểm tra sở hữu (ví dụ quy trình đối soát phí tổ chức giải). Riêng phần tài chính này phải chặn, nên khi triển khai không được tái sử dụng nguyên si hàm kiểm tra quyền cũ.

## Rủi ro đã biết

Hai vấn đề dưới đây nằm ngoài phạm vi sửa của tính năng này nhưng ảnh hưởng trực tiếp tới độ tin cậy của con số báo cáo. Nguồn: `docs/developer/contest-delivery/07-contest-flow-audit.md`.

- **Vết tích của luồng thanh toán gộp đã bị bỏ.** Bản rà soát ngày 02/08 mô tả một lỗi thu lệ phí hai lần (P0-2), phát sinh khi lệ phí được gộp vào hoá đơn thuê xe mà vẫn tạo được giao dịch riêng. **Lỗi đó không còn tái hiện trên code hiện tại** — luồng đăng ký đã chuyển sang một lần thanh toán duy nhất, không tạo hoá đơn thuê xe lúc đăng ký. Tuy vậy hệ thống còn sót phần khung của luồng cũ chưa dọn: một trường tổng lệ phí trong ảnh chụp giá của hoá đơn chỉ được đọc mà không nơi nào ghi, và một hàm đối chiếu lệ phí theo hoá đơn không còn đường kích hoạt. Chúng vô hại với báo cáo nhưng gây hiểu nhầm khi đọc code, nên nếu luồng thanh toán gộp được khôi phục sau này thì phải rà lại **FR-016** trước.
- **Huỷ giải không sinh bản ghi hoàn tiền (P0-3).** Khi giải bị huỷ, hệ thống không tạo giao dịch hoàn tiền nào. Chủ doanh nghiệp sẽ phải tự ghi các khoản hoàn cho khách như những khoản chi thủ công. Báo cáo phản ánh đúng thực tế miễn là chủ doanh nghiệp ghi đủ.

## Phụ thuộc

- Cơ chế phân công nhân viên vào giải đã có sẵn, dùng để xác định nhân viên nào được ghi chi phí cho giải nào.
- Nhật ký thao tác giải đã có sẵn, dùng làm nơi lưu vết mọi thay đổi trên sổ thu chi.
- Quy trình mua gói tổ chức giải và đối soát của quản trị viên nền tảng đã có sẵn, là nguồn duy nhất cho dòng chi "phí tổ chức giải".
- Màn hình workspace vận hành giải của chủ doanh nghiệp đã có sẵn, là nơi đặt tab Tài chính.
