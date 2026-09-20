# Implementation Plan: Quản lý thu chi giải đấu

**Branch**: `main` (không tạo nhánh riêng — hook `speckit.git.feature` đang tắt trong `.specify/extensions.yml`) | **Date**: 2026-08-08 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/018-contest-finance/spec.md`

## Summary

Thêm sổ cái thu/chi cho từng giải đấu và một báo cáo tài chính gộp ba nguồn: lệ phí từ đăng ký, phí tổ chức đã trả cho nền tảng, và các bút toán do người dùng nhập. Chủ doanh nghiệp sở hữu giải là người duy nhất xem được báo cáo; nhân viên chỉ ghi được khoản chi phát sinh trong lúc giải đang chạy và không thấy bất kỳ con số tổng nào.

Một bảng mới `contest_ledger_entries` với cột `direction` (`IN`/`OUT`) thay cho hai bảng thu/chi riêng. Báo cáo tính tại chỗ, không cache — mỗi giải chỉ cỡ vài chục dòng. Phí tổ chức là dòng chi **tính động** từ `contest_fee_orders`, không phải hàng trong sổ, nên không bao giờ lệch với nguồn và không cần guard chặn sửa/xoá riêng.

Kèm theo là một thay đổi phá vỡ có chủ đích: thêm cột `contest_registrations.entry_fee_payment_method` và bắt buộc chọn phương thức khi đánh dấu đã thu lệ phí, để tổng thu tách được thành trực tuyến / tiền mặt / chuyển khoản. Không có nó, báo cáo cho biết lãi lỗ nhưng không đối chiếu được với sao kê ngân hàng.

Ba điểm dễ sai nhất đã được nhận diện: guard quyền phải viết mới chứ không tái dùng loại sẵn có (chúng cho STAFF hoặc ADMIN đi qua), cột `numeric` của TypeORM trả về chuỗi nên cộng thẳng sẽ nối chuỗi, và `ContestMarkFeePaidSchema` đang dùng chung cho cả thao tác miễn lệ phí nên phải tách đôi.

## Technical Context

**Language/Version**: TypeScript strict mode (không dùng `any`); Node.js 20+ (BE), React 18 + Vite (FE)
**Primary Dependencies**: Express.js router-per-domain, TypeORM, zod, multer + Cloudinary (BE); React Query, Zustand, Tailwind (FE)
**Storage**: PostgreSQL — bảng mới `contest_ledger_entries`; thêm 1 cột vào `contest_registrations`; không đổi kiểu cột nào
**Testing**: Jest + supertest (`src/__tests__/services/`, `src/__tests__/routes/`), chạy trên DB thật qua `jest-setup.ts`
**Target Platform**: Linux server (API) + trình duyệt (SPA tiếng Việt)
**Project Type**: Web application — hai repo tách rời `rcfeild-be` (API) và `rcfield-fe` (SPA)
**Performance Goals**: Không đặt mục tiêu riêng — mỗi giải cỡ vài chục đăng ký và vài chục bút toán, nằm gọn trong ngân sách hiện tại của workspace giải
**Constraints**: `amount > 0` (ràng buộc DB), tiêu đề ≤255 ký tự, ghi chú ≤1000 ký tự, ảnh chứng từ ≤5MB và chỉ JPG/PNG/WEBP; tiền lưu `numeric(15,2)`, hiển thị VND không thập phân
**Scale/Scope**: 15 file backend (7 tạo mới) + 11 file frontend (4 tạo mới), 1 migration, 3 mã lỗi mới

## Constitution Check

*GATE: Phải qua trước Phase 0. Kiểm lại sau Phase 1.*

| # | Nguyên tắc | Áp dụng? | Kết luận |
|---|---|---|---|
| I | Snapshot-First Pricing | **Có** | ✅ **PASS** — mọi phép cộng lệ phí đọc `contest_registrations.entry_fee_amount` (snapshot chốt lúc đăng ký tại `registrations.ts:190`), tuyệt đối không đọc `contests.entry_fee`. Cách sai lại là cách trực giác nhất nên đã gài test bắt (quickstart S4). Xem [D7](./research.md#d7--lệ-phí-đọc-từ-contest_registrationsentry_fee_amount-tuyệt-đối-không-từ-contestsentry_fee). |
| II | Booking/Session State Machine Gate | Không | ✅ **PASS** — bút toán không có cột `status`, chỉ có xoá mềm. Không chuyển trạng thái booking hay session nào. FR-019a **đọc** `contests.status` để chặn quyền, không ghi. |
| III | Evidence-Based Handover | Không | ✅ **PASS** — không chạm inspection. Ảnh chứng từ là ảnh tuỳ chọn của một bút toán, không phải bằng chứng bàn giao tài sản, nên không chịu ràng buộc 4 ảnh + checklist. |
| IV | Payment Component Isolation | **Có, ở ranh giới** | ✅ **PASS** — sổ cái **không** phải `PaymentComponent`: không tạo `payment_components`, không sinh `payment_transactions`, không dính phí nền tảng 15%. Nó ghi tiền chảy ngoài đường thanh toán của nền tảng. Vì thế quy tắc "bất biến sau khi tạo" không áp vào đây và bút toán được phép sửa. Tinh thần truy vết vẫn giữ bằng xoá mềm cộng `before_json`/`after_json` bắt buộc trong `contest_audit_logs`. Xem [D3](./research.md#d3--sổ-cái-không-phải-payment_components) và [D4](./research.md#d4--cho-phép-sửaxoá-bút-toán-bù-lại-bằng-audit-trướcsau-và-xoá-mềm). |
| V | Test-First cho logic tài chính & trạng thái | **Có** | ✅ **PASS có điều kiện** — `contest-finance.test.ts` **phải viết trước và fail trước** khi hiện thực `buildContestFinanceReport`. 10 bất biến bắt buộc liệt kê trong [quickstart](./quickstart.md#checklist-test-backend). Đây là ràng buộc cứng của milestone M2, không phải khuyến nghị. |
| VI | RBAC Enforcement | **Có** | ✅ **PASS** — vai trò khai ở tầng router (`authenticate` + `authorize(...)`), quyền sở hữu giải kiểm ở service qua guard mới `assertContestFinanceOwner`. Constitution cấm dùng kiểm tra trong service **làm phương tiện duy nhất**; ở đây router vẫn chặn vai trò trước, service chỉ thêm lớp sở hữu — đúng khuôn mẫu module contest đang dùng. |

**Ràng buộc kỹ thuật bổ sung từ Constitution**:
- *"Every entity MUST have `created_at`, `updated_at`, `deleted_at`"* → `contest_ledger_entries` có đủ ba, và `deleted_at` chính là cơ chế xoá của FR-007.
- *"Tables: snake_case plural"* → `contest_ledger_entries`. *"Models: PascalCase singular"* → `ContestLedgerEntry`.
- *"Validation MUST occur in the route/controller layer, not inside services"* → toàn bộ zod schema đặt ở `src/validate/index.ts`, parse trong controller.
- *"Enums: SCREAMING_SNAKE_CASE"* → `ContestLedgerDirection.IN`, `ContestLedgerExpenseCategory.PRIZE_CASH`.
- *"Contests là Phase 1"* → tính năng nằm trong phạm vi Phase 1 đã được Constitution 1.4.0 chốt, không cần promote gì.

**Kết quả gate**: PASS. Mục Nguyên tắc IV là một quyết định ranh giới đã được lập luận rõ, không phải vi phạm cần miễn trừ → mục Complexity Tracking để trống.

**Kiểm lại sau Phase 1**: Thiết kế ở `data-model.md` và `contracts/api.md` không làm phát sinh vi phạm mới. Điểm cần canh là Nguyên tắc V — nếu ai đó viết `buildContestFinanceReport` trước test thì gate này hỏng dù mọi thứ khác đúng.

## Project Structure

### Documentation (this feature)

```text
specs/018-contest-finance/
├── plan.md              # File này
├── spec.md              # Đặc tả nghiệp vụ (đã qua /speckit-clarify — 5 câu)
├── research.md          # Phase 0 — 14 quyết định kỹ thuật
├── data-model.md        # Phase 1 — schema, migration, hình dạng báo cáo, sự kiện audit
├── quickstart.md        # Phase 1 — 18 kịch bản E2E + checklist test
├── contracts/
│   └── api.md           # Phase 1 — 7 endpoint mới + 1 thay đổi phá vỡ
├── checklists/
│   └── requirements.md  # Checklist chất lượng spec
└── tasks.md             # Phase 2 — do /speckit-tasks tạo, KHÔNG thuộc /speckit-plan
```

### Source Code (repository root)

```text
rcfeild-be/src/
├── models/
│   ├── contest-ledger-entry.entity.ts        # TẠO MỚI — entity ContestLedgerEntry
│   └── contest-registration.entity.ts        # SỬA — thêm cột entryFeePaymentMethod
├── migrations/
│   └── 1785700000000-ContestLedgerAndEntryFeeMethod.ts   # TẠO MỚI
├── services/contest/
│   ├── ledger.ts                             # TẠO MỚI — CRUD bút toán
│   ├── finance.ts                            # TẠO MỚI — buildContestFinanceReport
│   ├── guards.ts                             # SỬA — thêm assertContestFinanceOwner
│   ├── registrations.ts                      # SỬA — markEntryFeePaid nhận payment_method,
│   │                                         #        waiveEntryFee set NULL
│   └── index.ts                              # SỬA — barrel export
├── controllers/
│   ├── contest-finance.controller.ts         # TẠO MỚI — 7 handler
│   └── contest.controller.ts                 # SỬA — markEntryFeePaid truyền payment_method
├── routes/
│   └── contest.routes.ts                     # SỬA — đăng ký 7 route mới
├── types/index.ts                            # SỬA — 4 enum mới
├── validate/index.ts                         # SỬA — schema sổ cái; TÁCH ContestWaiveFeeSchema
└── __tests__/
    ├── services/contest-finance.test.ts      # TẠO MỚI — viết TRƯỚC (Nguyên tắc V)
    └── routes/contest-finance.test.ts        # TẠO MỚI

rcfield-fe/src/
├── features/contests/
│   ├── api/contest-finance.api.ts            # TẠO MỚI — client 7 endpoint
│   ├── api/contest.api.ts                    # SỬA — thêm query key finance/ledger
│   └── types/index.ts                        # SỬA — kiểu mới; ContestRuntimeTab thêm "finance"
├── pages/provider/contest-runtime/
│   ├── ProviderContestWorkspacePage.tsx      # SỬA — render panel Tài chính
│   ├── contest-workspace.ts                  # SỬA — thêm section key
│   └── components/
│       ├── ContestRuntimeTabs.tsx            # SỬA — thêm tab "Tài chính"
│       ├── ContestFinancePanel.tsx           # TẠO MỚI — báo cáo + danh sách sổ
│       └── finance/
│           ├── LedgerEntryFormModal.tsx      # TẠO MỚI — form tạo/sửa
│           └── LedgerEntryTable.tsx          # TẠO MỚI — bảng bút toán
└── pages/staff/contest/
    ├── StaffContestRuntimePage.tsx           # SỬA — gắn form chi phí phát sinh
    └── components/
        └── StaffExpenseFormCard.tsx          # TẠO MỚI — form nhân viên
```

**Structure Decision**: Web application hai repo. Backend theo router-per-domain sẵn có — route gộp vào `contest.routes.ts` để giữ toàn cảnh phân quyền của module contest ở một chỗ, nhưng controller và service tách file riêng để không phình `contest.controller.ts` (đã 676 dòng). Service đặt trong thư mục `services/contest/` đã được tách nhỏ sẵn (`catalog.ts`, `registrations.ts`, `guards.ts`, `payload.ts`...), thêm `ledger.ts` và `finance.ts` là đúng khuôn. Frontend đặt panel trong `contest-runtime/components/` cạnh `ContestFeePanel.tsx` đang có.

## Execution Milestones

| M | Nội dung | Chặn bởi |
|---|---|---|
| **M1** | Migration + entity + 4 enum + zod schema (gồm **tách** `ContestWaiveFeeSchema`) | — |
| **M2** | ⚠️ Viết `contest-finance.test.ts` với 10 bất biến, chạy và **xác nhận fail** | M1 |
| **M3** | `finance.ts` — `buildContestFinanceReport`, chạy tới khi M2 xanh | M2 |
| **M4** | `guards.ts` — `assertContestFinanceOwner`; `ledger.ts` — CRUD + audit | M1 |
| **M5** | Controller + 7 route + upload chứng từ; test route | M3, M4 |
| **M6** | Thay đổi phá vỡ: `markEntryFeePaid` nhận `payment_method`, `waiveEntryFee` set NULL | M1 |
| **M7** | FE provider: tab Tài chính, báo cáo, bảng sổ, form tạo/sửa | M5 |
| **M8** | FE staff: form chi phí phát sinh + ô chọn phương thức trong dialog đánh dấu đã thu | M5, M6 |
| **M9** | Chạy trọn 18 kịch bản E2E trong quickstart | M7, M8 |

M6 phải deploy **đồng thời** BE và FE — client cũ gửi body rỗng sẽ nhận `400` ngay khi BE lên trước.

## Complexity Tracking

> Không có vi phạm Constitution cần biện minh. Mục này để trống.
