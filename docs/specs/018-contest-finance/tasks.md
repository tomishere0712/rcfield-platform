---
description: "Task list for 018-contest-finance"
---

# Tasks: Quản lý thu chi giải đấu

**Input**: Design documents from `/specs/018-contest-finance/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/api.md](./contracts/api.md), [quickstart.md](./quickstart.md)

**Tests**: **BẮT BUỘC**, không phải tuỳ chọn. Nguyên tắc V của Constitution yêu cầu test cho logic tài chính phải viết trước và xác nhận fail trước khi hiện thực. T008 chặn T009 — đây là ràng buộc cứng.

**Organization**: Nhóm theo user story để mỗi story hoàn thành và kiểm thử độc lập.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: chạy song song được (file khác nhau, không phụ thuộc task chưa xong)
- **[Story]**: user story tương ứng (US1–US4)

## Path Conventions

Hai repo tách rời: `rcfeild-be/src/...` (API) và `rcfield-fe/src/...` (SPA). Mọi đường dẫn dưới đây tính từ gốc workspace.

---

## Phase 1: Setup

**Purpose**: Khai báo kiểu dùng chung cho mọi phase sau

- [X] T001 [P] Thêm 4 enum `ContestLedgerDirection`, `ContestLedgerIncomeCategory`, `ContestLedgerExpenseCategory`, `ContestEntryFeePaymentMethod` vào `rcfeild-be/src/types/index.ts` theo [data-model.md](./data-model.md#enum-typescript-srctypesindexts) — lưu ý `FNB` và `OTHER` cố ý trùng ở cả enum thu lẫn chi
- [X] T002 [P] Thêm kiểu `ContestLedgerEntry`, `ContestFinanceReport` và bổ sung `"finance"` vào union `ContestRuntimeTab` trong `rcfield-fe/src/features/contests/types/index.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: Không story nào bắt đầu được trước khi phase này xong

- [X] T003 Tạo migration `rcfeild-be/src/migrations/1786300000000-ContestLedgerAndEntryFeeMethod.ts` (đổi từ 1785700000000 — timestamp đó đã bị `AddBookingVehicleDisplaySnapshots` chiếm sau đợt merge) — bảng `contest_ledger_entries` với `CHECK (amount > 0)` và `CHECK (direction IN ('IN','OUT'))`, 3 partial index `WHERE deleted_at IS NULL`, cộng `ALTER TABLE contest_registrations ADD COLUMN entry_fee_payment_method VARCHAR(20)`. **Không** dùng `CREATE TYPE ... AS ENUM` ([D2](./research.md#d2--category-là-varchar-kiểm-ở-tầng-zod-không-dùng-native-enum-của-postgres))
- [X] T004 [P] Tạo entity `rcfeild-be/src/models/contest-ledger-entry.entity.ts` với `@DeleteDateColumn` cho `deleted_at`
- [X] T005 [P] Thêm cột `entryFeePaymentMethod: string | null` vào `rcfeild-be/src/models/contest-registration.entity.ts`
- [X] T006 [P] Thêm `assertContestFinanceOwner(contestId, viewer)` vào `rcfeild-be/src/services/contest/guards.ts` — bọc `assertContestOwner` (`contest.helpers.ts:22`), chỉ chấp nhận PROVIDER sở hữu giải. **Tuyệt đối không** gọi `assertContestOperator` (cho STAFF qua) và không sao chép `getContestForProvider` của `contest-fee.service.ts:65` (cho ADMIN qua) — [D5](./research.md#d5--guard-mới-assertcontestfinanceowner-không-tái-dùng-guard-sẵn-có)
- [X] T007 Chạy `cd rcfeild-be && npm run migration:run` rồi `npm run migration:revert` để xác nhận cả `up` lẫn `down` sạch, sau đó chạy lại `up`

**Checkpoint**: Schema và guard sẵn sàng — các story bắt đầu được

---

## Phase 3: User Story 1 — Provider xem bức tranh tài chính (Priority: P1) 🎯 MVP

**Goal**: Chủ doanh nghiệp mở tab Tài chính và thấy ngay lãi/lỗ của giải, gom tự động từ lệ phí và phí tổ chức, không cần nhập tay gì.

**Independent Test**: Tạo giải có lệ phí, cho vài người đăng ký ở các trạng thái thanh toán khác nhau, mua gói tổ chức và để admin xác nhận. Mở tab Tài chính — số phải đúng mà không cần bất kỳ bút toán thủ công nào. Tương ứng kịch bản S1–S5, S10 trong [quickstart](./quickstart.md).

### Tests for User Story 1 ⚠️ VIẾT TRƯỚC

> Chạy và **xác nhận FAIL** trước khi làm T009. Đây là gate Nguyên tắc V, không phải khuyến nghị.

- [X] T008 [US1] Viết `rcfeild-be/src/__tests__/services/contest-finance.test.ts` phủ đủ 10 bất biến trong [checklist quickstart](./quickstart.md#checklist-test-backend): đọc snapshot chứ không đọc `contests.entry_fee`; `PENDING_REVIEW` vào chờ thu; `WAIVED` không cộng tổng thu; đăng ký huỷ chưa trả tiền bị loại; đăng ký huỷ đã trả tiền vẫn ở đã thu; phí tổ chức chỉ tính đơn `PAID`; `net` đúng công thức; bút toán xoá mềm không lọt tổng; `NULL` phương thức gom vào `UNKNOWN`; cộng `numeric` không nối chuỗi. Chạy `npm test -- contest-finance` và xác nhận đỏ

### Implementation for User Story 1

- [X] T009 [US1] Tạo `rcfeild-be/src/services/contest/finance.ts` với `buildContestFinanceReport(contestId)` — 3 nguồn dữ liệu theo [data-model](./data-model.md#ba-nguồn-dữ-liệu), trả đúng hình dạng đã định. Bọc `Number()` mọi cột `numeric`. Chạy tới khi T008 xanh
- [X] T010 [US1] Export `buildContestFinanceReport` trong `rcfeild-be/src/services/contest/index.ts`
- [X] T011 [US1] Tạo `rcfeild-be/src/controllers/contest-finance.controller.ts` với handler `getFinanceReport`, dùng `requireViewer` + `assertContestFinanceOwner`
- [X] T012 [US1] Đăng ký `GET /contests/:contestId/finance` trong `rcfeild-be/src/routes/contest.routes.ts` với `authenticate` + `authorize(UserRole.PROVIDER)`, **không** kèm `requireActiveProvider` ([D6](./research.md#d6--requireactiveprovider-chỉ-áp-cho-endpoint-ghi-không-áp-cho-endpoint-đọc))
- [X] T013 [P] [US1] Tạo `rcfeild-be/src/__tests__/routes/contest-finance.test.ts` phủ RBAC 4 vai trò: PROVIDER owner 200; PROVIDER khác 403; STAFF 403; ADMIN 403 (S10 — FR-017a). Thêm ca giải rỗng trả 200 với số 0, không 404
- [X] T014 [P] [US1] Tạo `rcfield-fe/src/features/contests/api/contest-finance.api.ts` với `getContestFinance(contestId)` và query key `["contests", contestId, "finance"]`
- [X] T015 [US1] Tạo `rcfield-fe/src/pages/provider/contest-runtime/components/ContestFinancePanel.tsx` — thẻ tổng thu / tổng chi / ròng, nhóm lệ phí 3 dòng, chi theo loại, dòng phí tổ chức **không có** nút sửa/xoá. Định dạng VND không thập phân
- [X] T016 [US1] ~~ContestRuntimeTabs.tsx~~ → **sai file**: component đó không được import ở đâu (code chết). Điều hướng thật là `contestWorkspaceSections` trong `contest-workspace.ts` + route `providerContestFinance`
- [X] T017 [US1] Nối panel vào `rcfield-fe/src/pages/provider/contest-runtime/ProviderContestWorkspacePage.tsx` và thêm section key vào `rcfield-fe/src/pages/provider/contest-runtime/contest-workspace.ts`

**Checkpoint**: US1 xong — provider trả lời được "giải này lãi hay lỗ" mà không đếm tay. Có thể deploy như MVP.

---

## Phase 4: User Story 2 — Nhân viên ghi chi phí phát sinh (Priority: P2)

**Goal**: Nhân viên đang vận hành giải ghi được khoản chi kèm lý do bắt buộc, và khoản đó vào báo cáo của provider ngay.

**Independent Test**: Đăng nhập tài khoản nhân viên, giải đang chạy, ghi một khoản chi kèm lý do; đăng nhập provider kiểm tra khoản đó có trong báo cáo cùng tên người ghi. Kịch bản S6–S9.

⚠️ Story này tạo endpoint `POST /contests/:contestId/ledger-entries` mà **US3 dùng lại** — xem mục Dependencies.

- [X] T018 [P] [US2] Thêm `CreateContestLedgerEntrySchema` vào `rcfeild-be/src/validate/index.ts` dùng `z.discriminatedUnion('direction', ...)` để tập `category` hợp lệ phụ thuộc `direction`; `amount` số nguyên dương; `title` 1–255; `note` ≤1000
- [X] T019 [US2] Tạo `rcfeild-be/src/services/contest/ledger.ts` với `createLedgerEntry(contestId, viewer, body)` — chụp `created_by`/`created_by_role` từ token; nếu viewer là STAFF thì chặn `direction: IN` (403 `CONTEST_LEDGER_STAFF_INCOME_FORBIDDEN`), chặn khi `contest.status !== RUNNING` (409 `CONTEST_LEDGER_STAFF_WINDOW_CLOSED`), và bắt buộc `note`; ghi audit `ledger.entry_created` với `metadata.ledger_entry_id`
- [X] T020 [US2] Thêm handler `createEntry` và `listMyEntries` vào `rcfeild-be/src/controllers/contest-finance.controller.ts` — `listMyEntries` lọc cứng `created_by = viewer.userId` và **không** trả bất kỳ số tổng nào
- [X] T021 [US2] Đăng ký `POST /contests/:contestId/ledger-entries` (`authorize(PROVIDER, STAFF)` + `requireActiveProvider`) và `GET /contests/:contestId/ledger-entries/mine` (`authorize(STAFF)`, không `requireActiveProvider`) trong `rcfeild-be/src/routes/contest.routes.ts`
- [X] T022 [P] [US2] Bổ sung ca vào `rcfeild-be/src/__tests__/routes/contest-finance.test.ts`: STAFF gửi `direction: IN` → 403; STAFF ghi khi giải `CLOSED` và `COMPLETED` → 409; STAFF thiếu `note` → 400; PROVIDER ghi được ở mọi trạng thái kể cả `DRAFT`/`CANCELLED` (FR-018a); `/mine` không chứa trường tổng nào
- [X] T023 [P] [US2] Thêm `createLedgerEntry` và `listMyLedgerEntries` vào `rcfield-fe/src/features/contests/api/contest-finance.api.ts`
- [X] T024 [US2] Tạo `rcfield-fe/src/pages/staff/contest/components/StaffExpenseFormCard.tsx` — chỉ chiều chi, ô lý do bắt buộc, danh sách khoản của chính mình, không hiển thị tổng
- [X] T025 [US2] Gắn form vào `rcfield-fe/src/pages/staff/contest/StaffContestRuntimePage.tsx`, chỉ render khi giải đang chạy

**Checkpoint**: US2 xong — chi phí phát sinh tại giải không còn rơi rụng.

---

## Phase 5: User Story 3 — Provider ghi thu ngoài lệ phí và mọi khoản chi (Priority: P2)

**Goal**: Chủ doanh nghiệp tự thêm khoản tài trợ, vé, tiền thưởng, thuê MC…; sửa và xoá khi nhập sai.

**Independent Test**: Thêm một khoản thu và một khoản chi, kiểm tra ròng đổi đúng bằng hiệu; sửa số tiền và kiểm tra báo cáo cập nhật; xoá và kiểm tra biến mất khỏi tổng. Kịch bản S11–S14, S18.

- [X] T026 [P] [US3] Thêm `UpdateContestLedgerEntrySchema` (tập con các trường, **không** cho đổi `direction`) và `ListContestLedgerQuerySchema` (`direction`, `category`, `from`, `to`) vào `rcfeild-be/src/validate/index.ts`
- [X] T027 [US3] Bổ sung `listLedgerEntries`, `updateLedgerEntry`, `softDeleteLedgerEntry` vào `rcfeild-be/src/services/contest/ledger.ts` — cả ba dùng `assertContestFinanceOwner`; ghi audit `ledger.entry_updated` với đủ `before_json`/`after_json` (FR-026) và `ledger.entry_deleted`; mọi truy vấn lọc `deleted_at IS NULL`
- [X] T028 [US3] Thêm `uploadLedgerReceipt` vào `rcfeild-be/src/services/contest/ledger.ts` dùng `uploadImage` của `cloudinary.service`, folder `rcfield/contests/${providerId}/receipts` — theo khuôn `uploadContestBanner` (`contests-crud.ts:489`)
- [X] T029 [US3] Thêm handler `listEntries`, `updateEntry`, `deleteEntry`, `uploadReceipt` vào `rcfeild-be/src/controllers/contest-finance.controller.ts`; `uploadReceipt` kiểm mimetype ở controller như `uploadBanner` (`contest.controller.ts:663`)
- [X] T030 [US3] Đăng ký 4 route trong `rcfeild-be/src/routes/contest.routes.ts`: `GET /contests/:contestId/ledger-entries`, `PATCH /contest-ledger-entries/:entryId`, `DELETE /contest-ledger-entries/:entryId`, `POST /contests/:contestId/ledger-entries/receipt` (multer memoryStorage, 5MB)
- [X] T031 [P] [US3] Bổ sung ca test route: `amount = 0` và `amount < 0` → 400; STAFF `PATCH`/`DELETE` → 403 kể cả bút toán của chính mình (FR-022); `PATCH` bút toán đã xoá mềm → 404; provider khác → 403 ở cả đọc lẫn ghi (S14); upload PDF → 422
- [X] T032 [P] [US3] Thêm `listLedgerEntries`, `updateLedgerEntry`, `deleteLedgerEntry`, `uploadLedgerReceipt` vào `rcfield-fe/src/features/contests/api/contest-finance.api.ts`
- [X] T033 [P] [US3] Tạo `rcfield-fe/src/pages/provider/contest-runtime/components/finance/LedgerEntryTable.tsx` — cột loại, tiêu đề, số tiền, ngày phát sinh, người ghi, thumbnail chứng từ, nút sửa/xoá
- [X] T034 [US3] Tạo `rcfield-fe/src/pages/provider/contest-runtime/components/finance/LedgerEntryFormModal.tsx` — dùng chung cho tạo và sửa; danh mục loại đổi theo chiều thu/chi; chặn số tiền ≤0 kèm gợi ý tạo khoản chiều ngược lại; upload chứng từ trước rồi gắn URL
- [X] T035 [US3] Nối bảng và modal vào `ContestFinancePanel.tsx`; sau mỗi lần tạo/sửa/xoá phải `invalidateQueries` cả key `finance` lẫn `ledger-entries` để báo cáo cập nhật ngay (FR-015)

**Checkpoint**: US3 xong — báo cáo phản ánh đúng thực tế của một giải có tài trợ và giải thưởng.

---

## Phase 6: User Story 4 — Đối soát lệ phí trực tuyến và tiền mặt (Priority: P3)

**Goal**: Tổng thu tách được theo phương thức để đối chiếu với sao kê ngân hàng.

**Independent Test**: Một người trả qua VNPay, một người trả tiền mặt; báo cáo hiện hai con số riêng, cộng lại bằng tổng đã thu. Kịch bản S15–S16.

⚠️ **Thay đổi phá vỡ** — T036–T038 và T041 phải deploy **đồng thời** BE và FE.

- [ ] T036 [US4] Trong `rcfeild-be/src/validate/index.ts`: thêm `payment_method: z.enum(['CASH','TRANSFER'])` **bắt buộc** vào `ContestMarkFeePaidSchema`, đồng thời **tách** `ContestWaiveFeeSchema` mới chỉ có `note`. Schema cũ đang dùng chung cho cả hai handler (`contest.controller.ts:226` và `:241`) — quên tách là miễn lệ phí sẽ đòi phương thức thu một cách vô lý
- [ ] T037 [US4] Trong `rcfeild-be/src/services/contest/registrations.ts`: `markEntryFeePaid` ghi `entryFeePaymentMethod` từ tham số; `waiveEntryFee` set về `NULL` (bất biến: cột chỉ có nghĩa khi `payment_status = MARKED_PAID`)
- [ ] T038 [US4] Trong `rcfeild-be/src/controllers/contest.controller.ts`: `markEntryFeePaid` truyền `body.payment_method` xuống service; `waiveEntryFee` chuyển sang parse `ContestWaiveFeeSchema`
- [ ] T039 [US4] Gán `entryFeePaymentMethod = 'ONLINE'` tại **cả ba** điểm đặt `MARKED_PAID` trong `rcfeild-be/src/services/payment.service.ts`: `processConfirmationResult` (~:738) và `processMockConfirmation` (~:943) là hai đường VNPay đang chạy thật — bỏ sót là khoản đó lặng lẽ rơi vào nhóm "chưa rõ phương thức". Điểm thứ ba `markContestEntryFeePaidOnBookingSuccess` (~:630) hiện **không có đường kích hoạt** (nó tìm đăng ký theo `booking_id`, mà luồng đăng ký đặt `bookingId = null`) — vẫn gán để phòng khi luồng thanh toán gộp được khôi phục, nhưng đừng mất thời gian viết test cho nó
- [ ] T040 [P] [US4] Bổ sung ca test: `mark-entry-fee-paid` thiếu `payment_method` → 400; `mark-entry-fee-paid` với `payment_method: 'ONLINE'` → 400 (chỉ luồng VNPay tự gán); `waive-entry-fee` **không** đòi `payment_method` và set cột về `NULL`; thanh toán VNPay hoàn tất → cột thành `ONLINE`
- [ ] T041 [US4] Thêm ô chọn phương thức (Tiền mặt / Chuyển khoản) vào dialog đánh dấu đã thu lệ phí trong `rcfield-fe/src/pages/provider/contest-runtime/components/registration/` — chặn gửi khi chưa chọn
- [ ] T042 [US4] Hiển thị 4 dòng tách theo phương thức (trực tuyến, tiền mặt, chuyển khoản, chưa rõ) trong phần lệ phí của `ContestFinancePanel.tsx`

**Checkpoint**: Cả 4 story hoạt động độc lập.

---

## Phase 7: Polish & Cross-Cutting

- [ ] T043 Chạy trọn 18 kịch bản E2E trong [quickstart.md](./quickstart.md#kịch-bản-e2e)
- [ ] T044 [P] Chạy `cd rcfeild-be && npm run lint && npx tsc --noEmit` và `cd rcfield-fe && npm run lint && npx tsc --noEmit`
- [ ] T045 [P] Cập nhật `docs/spec/03-contest.md` và `docs/spec/business-rules/BR-contest.md` với luồng thu chi mới — quy tắc PR của dự án bắt buộc đổi business logic thì phải sửa spec trong cùng PR
- [ ] T046 [P] Thêm `'contest-finance/tasks'` vào mục `018 · Contest Finance` trong `website/sidebars-specs.ts`
- [ ] T047 Đối chiếu lại bảng "Các lỗi sẽ gặp nếu làm ẩu" ở [cuối quickstart](./quickstart.md#các-lỗi-sẽ-gặp-nếu-làm-ẩu) — 7 triệu chứng, xác nhận không dính cái nào

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 Setup**: không phụ thuộc gì, bắt đầu ngay
- **Phase 2 Foundational**: cần Phase 1 — **chặn toàn bộ** user story
- **Phase 3–6 User Stories**: đều cần Phase 2 xong
- **Phase 7 Polish**: cần các story mong muốn đã xong

### User Story Dependencies

- **US1 (P1)**: độc lập hoàn toàn sau Phase 2. Báo cáo vẫn chạy khi bảng sổ cái rỗng — phần thu/chi thủ công chỉ hiện 0
- **US2 (P2)**: độc lập sau Phase 2
- **US3 (P2)**: ⚠️ **phụ thuộc T018–T021 của US2** — hai story P2 dùng chung endpoint `POST /contests/:contestId/ledger-entries` và schema tạo bút toán. Làm US2 trước rồi mới tới US3. Đây là phụ thuộc thật, không nên giả vờ hai story rời nhau
- **US4 (P3)**: độc lập sau Phase 2. Nếu bỏ US4 thì `collected_by_method` của US1 gom hết vào `UNKNOWN` — đúng hành vi FR-029 dành cho dữ liệu cũ, không vỡ gì

### Within Each User Story

- T008 (test) **phải fail** trước khi làm T009 — gate Nguyên tắc V
- Entity/schema → service → controller → route → FE
- Test route viết song song được với FE của cùng story

### Parallel Opportunities

- T001, T002 song song (hai repo khác nhau)
- T004, T005, T006 song song sau khi T003 xong (ba file khác nhau)
- T013, T014 song song (test BE vs api client FE)
- T022, T023 song song
- T026, T031, T032, T033 song song
- Sau Phase 2: một người làm US1, người khác làm US2→US3, người thứ ba làm US4

---

## Parallel Example: User Story 1

```bash
# Sau khi T012 xong, chạy song song:
Task: "T013 Test route RBAC 4 vai trò trong rcfeild-be/src/__tests__/routes/contest-finance.test.ts"
Task: "T014 API client trong rcfield-fe/src/features/contests/api/contest-finance.api.ts"
```

```bash
# Phase 2 sau khi T003 xong:
Task: "T004 Entity ContestLedgerEntry"
Task: "T005 Cột entryFeePaymentMethod trên ContestRegistration"
Task: "T006 Guard assertContestFinanceOwner"
```

---

## Implementation Strategy

### MVP First (chỉ US1)

1. Phase 1 Setup (T001–T002)
2. Phase 2 Foundational (T003–T007) — **chặn mọi thứ**
3. Phase 3 US1 (T008–T017), nhớ T008 phải đỏ trước
4. **DỪNG và KIỂM CHỨNG**: chạy S1–S5 và S10
5. Deploy được — provider đã trả lời được "lãi hay lỗ" thay cho việc đếm tay

### Incremental Delivery

1. Setup + Foundational → nền sẵn sàng
2. US1 → kiểm chứng độc lập → deploy (MVP)
3. US2 → nhân viên ghi được chi phí tại giải → deploy
4. US3 → sổ đầy đủ hai chiều, sửa/xoá được → deploy
5. US4 → đối soát được với sao kê → deploy đồng thời BE+FE

### Ghi chú triển khai

- **T036–T041 là thay đổi phá vỡ.** BE lên trước FE là mọi lần đánh dấu đã thu lệ phí sẽ ăn `400`. Deploy hai repo cùng lúc hoặc tạm cho `payment_method` optional rồi siết sau
- Commit sau mỗi task hoặc mỗi nhóm hợp lý
- Dừng ở bất kỳ checkpoint nào để kiểm chứng story độc lập

---

## Tổng kết

| Phase | Story | Số task |
|---|---|---|
| 1 — Setup | — | 2 |
| 2 — Foundational | — | 5 |
| 3 — Báo cáo tài chính | US1 (P1) 🎯 | 10 |
| 4 — Nhân viên ghi chi phí | US2 (P2) | 8 |
| 5 — Sổ thu chi đầy đủ | US3 (P2) | 10 |
| 6 — Đối soát phương thức | US4 (P3) | 7 |
| 7 — Polish | — | 5 |
| **Tổng** | | **47** |
