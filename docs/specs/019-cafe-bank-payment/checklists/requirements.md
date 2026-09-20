# Specification Quality Checklist: Thanh toán chuyển khoản theo từng chi nhánh

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-11
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

### Validation iteration 1 — 2026-08-11

**Content Quality**: PASS. Spec mô tả phương thức nhận tiền, mã tham chiếu, sổ đối soát ở mức nghiệp vụ. Không nêu tên bảng, endpoint, thư viện hay ngôn ngữ. Nhà cung cấp dịch vụ đối soát được nhắc ở phần Assumptions như một phụ thuộc kinh doanh, không phải chi tiết kỹ thuật.

**Requirement Completeness**: 3 [NEEDS CLARIFICATION] còn lại, đều là quyết định có tác động lớn và không có mặc định an toàn:

1. **FR-004** — khách có được tự chọn giữa cổng dùng chung và chuyển khoản không (ảnh hưởng phạm vi giao diện và độ phức tạp đối soát)
2. **Edge case: tiền về sau khi hết hạn giữ chỗ** — tình huống duy nhất tiền thật đã đi mà khách không có chỗ (ảnh hưởng an toàn tài chính)
3. **US4 kịch bản 3** — môi trường demo công khai được coi là môi trường thật hay thử (ảnh hưởng bảo mật: bật nhầm mô phỏng cho phép đặt lịch không mất tiền)

Ba mục này được đưa ra hỏi người dùng ở bước tiếp theo. Mọi khoảng trống còn lại đã dùng mặc định hợp lý và ghi vào Assumptions.

**Ràng buộc từ Constitution**: Principle V (Test-First cho logic tài chính) áp dụng cho hàm đối soát thông báo tiền về và hàm chống trùng — phải có kiểm thử viết trước và xác nhận đỏ. Principle VI (RBAC ở tầng router) áp dụng cho FR-009 và FR-025.

### Validation iteration 2 — 2026-08-11 (sau clarification)

Ba câu hỏi đã được trả lời và tích hợp vào spec. **Toàn bộ 16 mục đạt.**

Thay đổi phát sinh từ câu trả lời:

| Quyết định | Ảnh hưởng tới spec |
|-----------|--------------------|
| Khách tự chọn phương thức | FR-004 viết lại; thêm FR-004a/b/c về một phiên thanh toán sống tại một thời điểm; thêm kịch bản US1 #7–9; thêm SC-011; thêm edge case "trả bằng cả hai đường"; thêm rủi ro thu trùng |
| Tiền về muộn luôn treo | Thêm FR-018a/b/c; edge case viết lại và tách thành hai (quá hạn / đúng lúc hết hạn); thêm SC-010; thêm rủi ro việc tay đều đặn |
| Mô phỏng bật ở mọi môi trường | FR-030 viết lại, thêm FR-030a và FR-032a (nhãn "giao dịch mô phỏng" cho khách); US4 kịch bản 3 viết lại; Assumptions cập nhật; thêm rủi ro đặt lịch miễn phí trên site công khai; thêm mục **Trước khi vận hành thương mại** với 4 việc bắt buộc |

**Cảnh báo còn lại**: quyết định bật mô phỏng trên môi trường công khai để lại một lỗ hổng có thật — bất kỳ ai biết đường dẫn đều xác nhận được booking mà không trả tiền. Đây là lựa chọn có ý thức của chủ dự án, đã ghi vào phần Rủi ro và có danh sách khắc phục trước khi vận hành thương mại. Không chặn việc chuyển sang `/speckit-plan`.

### Validation iteration 3 — 2026-08-11 (sau `/speckit-clarify`)

5 câu hỏi nữa đã hỏi và tích hợp. **16/16 mục vẫn đạt.** Spec: 50 FR, 13 SC, 4 user story.

Hai lỗi thật được phát hiện và sửa trong phiên này:

1. **Mâu thuẫn RBAC**: FR-018c yêu cầu thông báo cho *người vận hành chi nhánh* khi có giao dịch treo, nhưng FR-025 và US3 kịch bản 5 lại từ chối nhân viên truy cập sổ giao dịch — nhân viên được báo nhưng không có chỗ xử lý. Đã tách quyền: FR-025 (chủ xem toàn bộ) / FR-025a–c (nhân viên chỉ thấy và gán được giao dịch **đang treo** của chi nhánh mình, không thấy con số tổng). US3 kịch bản 5 viết lại, thêm kịch bản 6–8.
2. **Hàng rào an toàn rỗng**: mã QR mẫu ở US2 là cơ chế duy nhất chặn lỗi gõ sai số tài khoản, nhưng khi chế độ mô phỏng bật (tức mọi môi trường, theo quyết định trước), quét mã mẫu sẽ ra trang mô phỏng chỉ hiển thị lại dữ liệu vừa nhập. Đã thêm FR-006a: mã QR mẫu **luôn là mã ngân hàng thật**, không phụ thuộc cờ mô phỏng.

Các thay đổi khác:

| Quyết định | Ảnh hưởng tới spec |
|-----------|--------------------|
| Khoá nút sau lần bấm đầu + khoản thứ hai treo | FR-019a, FR-028b, US3 kịch bản 8, SC-012, edge case "chuyển khoản hai lần" |
| Trang mô phỏng điền sẵn, không sửa được số tiền | FR-013a (màn QR chỉ 3 trạng thái), FR-028a, edge case "chuyển thiếu tiền" viết lại; quy tắc chặn phía server giữ nguyên cho luồng ngân hàng thật |
| Booking nhân viên tạo ngoài phạm vi | Assumptions bổ sung ranh giới rõ ràng |

**Phạm vi đã siết lại**: không làm giao diện báo thiếu tiền, không làm luồng thanh toán tại quầy. Cả hai đều là lựa chọn thu hẹp có chủ đích, đã ghi rõ lý do trong spec.
