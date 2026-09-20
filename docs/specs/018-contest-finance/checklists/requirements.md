# Specification Quality Checklist: Quản lý thu chi giải đấu

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-08
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

### Kết quả validation

Chạy 2 vòng. Vòng 1 phát hiện 4 vấn đề, đã sửa hết ở vòng 2:

1. **Rò rỉ chi tiết triển khai** — bản nháp đầu dùng tên bảng (`contest_ledger_entries`), tên cột (`direction`, `occurred_at`), và đường dẫn endpoint (`GET /v1/contests/:contestId/finance`) ngay trong phần Requirements. Đã viết lại theo ngôn ngữ nghiệp vụ: "bút toán", "chiều tiền", "ngày phát sinh", "báo cáo tài chính của giải". Tên kỹ thuật để dành cho `/speckit-plan`.
2. **Success criteria mang tính kỹ thuật** — bản đầu có "endpoint trả về trong dưới 500ms". Đã đổi thành SC-001 đo theo trải nghiệm người dùng (biết lãi/lỗ trong 10 giây, không cộng tay).
3. **Yêu cầu không kiểm chứng được** — "báo cáo phải chính xác" đã tách thành FR-009 đến FR-016, mỗi cái nêu rõ khoản nào vào nhóm nào.
4. **Thiếu ranh giới phạm vi** — chưa nói rõ có xuất file, có đa tiền tệ, có tách theo chi nhánh hay không. Đã bổ sung vào Assumptions.

### Điểm cần chú ý khi lập kế hoạch

- **Độ tin cậy con số phụ thuộc P0-3 chưa sửa** (huỷ giải không sinh bản ghi hoàn tiền). Chủ doanh nghiệp phải tự ghi các khoản hoàn cho khách như khoản chi thủ công; báo cáo đúng miễn là họ ghi đủ.

  ⚠️ **Đính chính (2026-08-08)**: bản đầu của checklist này và của spec có nêu P0-2 (lệ phí thu hai lần) như một rủi ro đang tồn tại. Sai — claim đó chép từ bản rà soát ngày 02/08 mà không đối chiếu code. Luồng đăng ký hiện tại chỉ có một đường thu lệ phí, `registration.bookingId` luôn `null` lúc đăng ký, và `snapshot.contest_entry_fee` không nơi nào ghi. Xem [research.md — Rủi ro kế thừa](../research.md#rủi-ro-kế-thừa-không-xử-lý-trong-feature-này) để có bằng chứng đầy đủ.
- **User Story 4 chạm vào luồng đang có.** FR-028 thay đổi thao tác đánh dấu đã đóng lệ phí hiện tại (thêm bước chọn phương thức). Đây là breaking change với client đang gọi, cần xử lý trong plan.
- **Quyết định chưa được người dùng xác nhận trực tiếp**: cách xử lý tiền thưởng (ghi như khoản chi, không thêm số tiền vào cơ cấu giải thưởng công khai). Đã ghi trong Assumptions, cần chủ dự án xác nhận trước khi implement.

### Phiên làm rõ 2026-08-08

Đã hỏi và chốt 5 điểm, ghi vào mục `## Clarifications` của spec:

1. **Quản trị viên nền tảng không xem được tài chính giải** → thêm FR-017a. Đây là ngoại lệ có chủ đích so với phần còn lại của hệ thống, nên khi triển khai **không được tái sử dụng nguyên si** hàm kiểm tra quyền cũ (loại đang cho ADMIN đi qua mọi kiểm tra sở hữu).
2. **Danh mục loại khoản là tập đóng** → thêm FR-003a. Không cần bảng danh mục và màn quản lý như feature 017 đã phải làm cho menu.
3. **Nhân viên chỉ ghi được khi giải đang chạy** → thêm FR-018a và FR-019a, 2 kịch bản chấp nhận, 1 edge case. Hệ quả đã ghi rõ trong spec: khoản chuẩn bị hôm trước và thu dọn sau khi bế mạc rơi ra ngoài cửa sổ của nhân viên, chủ doanh nghiệp phải tự nhập.
4. **Không có báo cáo tổng hợp nhiều giải** → ghi vào Assumptions như ranh giới phạm vi.
5. **Đăng ký huỷ khi chưa đóng tiền bị loại khỏi báo cáo** → thêm FR-009a.

### Cảnh báo phát sinh từ phiên làm rõ

Chủ dự án cho biết sẽ **gỡ bỏ luồng khách tự huỷ đăng ký** trong một thay đổi riêng. Hai điểm cần nhớ khi làm việc đó:

- Trạng thái đã huỷ của đăng ký **không biến mất**: huỷ cả giải vẫn chuyển toàn bộ đăng ký sang trạng thái đó (`registration-side-effects.ts:97-123`). FR-009a vẫn phải triển khai, không được coi là nhánh chết.
- `createContestRegistration:148` đang dựa vào trạng thái đã huỷ để cho phép đăng ký lại (`existing.status !== CANCELLED`). Gỡ luồng huỷ sẽ biến nhánh này thành code chết, cần dọn cùng lúc.
