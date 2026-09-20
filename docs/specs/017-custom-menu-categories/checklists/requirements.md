# Specification Quality Checklist: Danh mục F&B do Provider tự tạo

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-07-25
**Feature**: [spec.md](../spec.md)

## Content Quality

- [X] No implementation details (languages, frameworks, APIs)
- [X] Focused on user value and business needs
- [X] Written for non-technical stakeholders
- [X] All mandatory sections completed

## Requirement Completeness

- [X] No [NEEDS CLARIFICATION] markers remain
- [X] Requirements are testable and unambiguous
- [X] Success criteria are measurable
- [X] Success criteria are technology-agnostic (no implementation details)
- [X] All acceptance scenarios are defined
- [X] Edge cases are identified
- [X] Scope is clearly bounded
- [X] Dependencies and assumptions identified

## Feature Readiness

- [X] All functional requirements have clear acceptance criteria
- [X] User scenarios cover primary flows
- [X] Feature meets measurable outcomes defined in Success Criteria
- [X] No implementation details leak into specification

## Notes

**Validation pass 1 — các điểm đã sửa:**

1. *No implementation details* — Bản nháp đầu dùng tên bảng và tên cột kỹ thuật (`menu_categories`, `category_id`, `FnbCategory`) trong phần Requirements. Đã viết lại theo ngôn ngữ nghiệp vụ ("danh mục thuộc về chi nhánh", "món không có danh mục"). Tên kỹ thuật chỉ còn xuất hiện trong trường `Input` (nguyên văn mô tả của người dùng) và phần Bối cảnh vấn đề — đây là chỗ hợp lệ vì mô tả hiện trạng.
2. *Requirements testable* — FR-008 ban đầu ghi "giới hạn hợp lý" không kiểm thử được; đã chốt số cụ thể (50 ký tự, 30 danh mục) và ghi rõ trong Assumptions rằng đây là mặc định do đội ngũ chọn, không phải yêu cầu từ Provider.
3. *Edge cases* — Bổ sung 4 trường hợp ban đầu bị thiếu: danh mục rỗng hiển thị thế nào, xóa hết danh mục, tên chỉ có khoảng trắng, và tác động của việc đổi tên lên đơn đã phát sinh.
4. *Scope bounded* — Bổ sung mục **Out of Scope** để tách bạch tính năng kích cỡ đồ uống (đang hoãn) và điểm yếu tra cứu món theo tên của Staff.

**Quyết định đã được người dùng xác nhận trực tiếp:**

| Câu hỏi | Quyết định | Nguồn |
|---------|-----------|-------|
| Phạm vi danh mục | Cấp **chi nhánh**, mỗi cafe một bộ riêng | Trao đổi trước `/speckit-specify` |
| Dữ liệu phân loại cũ | **Không** chuyển đổi — Provider tạo lại từ đầu | Trao đổi trước `/speckit-specify` |
| Combo | Provider **tự đặt tên và tự gán danh mục**; bỏ ép danh mục "Combo" | Trao đổi trước `/speckit-specify` |
| Cơ chế xóa | **Xóa mềm** (`deleted_at`); danh mục đã xóa không chiếm chỗ ràng buộc trùng tên | `/speckit-clarify` 2026-07-25 |
| Xóa danh mục còn món | **Chặn xóa** — phải làm rỗng danh mục trước | `/speckit-clarify` 2026-07-25 |

⚠️ **Quyết định "Xóa danh mục còn món" đã bị đảo ngược** trong phiên clarify: phương án ban đầu là "cho xóa, món về Chưa phân loại", nay chuyển thành "chặn xóa". FR-003, FR-006, FR-015, FR-016, SC-004, hai edge case và Assumptions đã được cập nhật theo. Trường `Input` ở đầu spec vẫn giữ nguyên văn mô tả gốc và **không còn phản ánh quyết định hiện tại** — phần Clarifications ghi rõ điều này và là nguồn có thẩm quyền.

**Mặc định tự chốt trong phiên clarify (không tiêu câu hỏi, do tác động thấp):**

- Danh mục mới tạo xếp xuống cuối danh sách thứ tự hiển thị.
- Nhóm "Chưa phân loại" khi rỗng thì ẩn hoàn toàn, ở cả màn quản lý lẫn màn khách.
- Món đang tạm ngưng bán **vẫn tính** là món thuộc danh mục, nên vẫn chặn xóa (ghi rõ trong FR-015).

**Rủi ro cần lưu ý khi lập kế hoạch (`/speckit-plan`):**

- FR-025 (giữ nguyên toàn bộ món sau chuyển đổi) là yêu cầu chặt nhất về mặt dữ liệu — cần kiểm chứng kỹ ở bước lập kế hoạch, đặc biệt với dữ liệu seed và bộ kiểm thử hiện có đang gán phân loại theo giá trị cố định.
- FR-024 đã được xác minh trên code hiện tại: đơn F&B đã phát sinh không lưu tham chiếu danh mục, nên hóa đơn, chi tiết booking, màn hình Staff và báo cáo doanh thu không bị ảnh hưởng.
