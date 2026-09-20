---
description: "Task list for 019-cafe-bank-payment"
---

# Tasks: Thanh toán chuyển khoản theo từng chi nhánh

**Input**: Design documents from `/specs/019-cafe-bank-payment/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/api.md](./contracts/api.md), [quickstart.md](./quickstart.md)

**Tests**: **BẮT BUỘC.** Nguyên tắc V của Constitution áp cho logic đối soát tiền — test phải viết trước và xác nhận chạy hỏng. **T014 chặn T015**, ràng buộc cứng, không phải khuyến nghị.

**Organization**: Nhóm theo user story để mỗi story hoàn thành và kiểm thử độc lập.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: chạy song song được (file khác nhau, không phụ thuộc task chưa xong)
- **[Story]**: user story tương ứng (US1–US4)

## Path Conventions

Hai repo tách rời: `rcfeild-be/src/...` (API) và `rcfield-fe/src/...` (SPA). Mọi đường dẫn tính từ gốc workspace.

---

## Phase 1: Setup

**Purpose**: Kiểu dữ liệu và cấu hình môi trường dùng chung cho mọi phase sau

- [X] T001 [P] Thêm kiểu `CafePaymentMethod` (`VNPAY | BANK_TRANSFER`), `BankTransactionMatchStatus` (`MATCHED | NEEDS_REVIEW | IGNORED`) và `BankTransactionMatchReason` (9 giá trị theo [data-model.md](./data-model.md#bảng-lý-do-match_reason)) vào `rcfeild-be/src/types/index.ts` — dùng union kiểu chuỗi, **không** tạo native enum trong Postgres
- [X] T002 [P] Thêm kiểu `CafePaymentSettings`, `BankTransaction`, `BankTransferCheckout` và mở rộng `CheckoutResponse` với `flow` + `bank_transfer` trong `rcfield-fe/src/features/booking/types/booking.types.ts`
- [X] T003 [P] Thêm khối `sandboxBank: { enabled }` và `bankWebhook: { apiKey }` vào `rcfeild-be/src/config/env.ts`, đọc từ `SANDBOX_BANK_ENABLED` và `BANK_WEBHOOK_API_KEY`; ném lỗi lúc khởi động nếu bật sandbox mà thiếu khoá

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Lược đồ dữ liệu và bộ dựng VietQR — mọi user story đều cần

**⚠️ CRITICAL**: Không user story nào bắt đầu được trước khi phase này xong

- [X] T004 Tạo migration `rcfeild-be/src/migrations/<timestamp>-CafePaymentSettingsAndBankTransactions.ts` theo [data-model.md](./data-model.md#migration): bảng `cafe_payment_settings`, bảng `bank_transactions`, cột `payment_transactions.payment_ref_code`, đủ 4 index; `down()` đảo ngược hoàn toàn kể cả `DROP COLUMN`
- [X] T005 [P] Tạo entity `rcfeild-be/src/models/cafe-payment-setting.entity.ts` với `@DeleteDateColumn`, `@CreateDateColumn`, `@UpdateDateColumn` theo chuẩn dự án
- [X] T006 [P] Tạo entity `rcfeild-be/src/models/bank-transaction.entity.ts` — `amount` là `numeric(15,2)`, ⚠️ TypeORM trả về **chuỗi**, mọi phép cộng/so sánh phải bọc `Number()`
- [X] T007 Thêm cột `paymentRefCode: string | null` vào `rcfeild-be/src/models/payment-transaction.entity.ts` (`name: 'payment_ref_code'`, `nullable: true`)
- [X] T008 Thêm `bank_transactions` rồi `cafe_payment_settings` vào danh sách TRUNCATE trong `rcfeild-be/src/__tests__/jest-setup.ts` — ⚠️ đúng thứ tự này vì có khoá ngoại; sai thứ tự gây lỗi FK rải rác giữa các test
- [X] T009 [P] Viết `rcfeild-be/src/__tests__/services/vietqr.test.ts`: chuỗi khớp mẫu EMVCo, CRC-16/CCITT-FALSE đúng, số tiền và nội dung nhúng đúng, mã ngân hàng lạ ném lỗi
- [X] T010 Hiện thực `rcfeild-be/src/services/vietqr.ts` — `buildVietQrPayload({bankBin, accountNumber, amount, memo})` + bảng BIN tĩnh ~40 ngân hàng lớn; **không gọi `api.vietqr.io` lúc chạy** (D9)
- [X] T011 [P] Thêm `generatePaymentRefCode()` vào `rcfeild-be/src/services/vietqr.ts` — `RCF` + 5 ký tự Crockford base32 (bỏ `I`, `L`, `O`, `U`), thử lại khi đụng unique

**Checkpoint**: Lược đồ sẵn sàng, sinh được chuỗi VietQR và mã tham chiếu

---

## Phase 3: User Story 1 — Khách quét QR và booking tự xác nhận (P1) 🎯 MVP

**Goal**: Khách chọn chuyển khoản, quét mã, và màn hình tự đổi sang "Đã thanh toán" trong ≤ 5 giây mà không ai chạm vào.

**Independent Test**: Nạp sẵn một cấu hình nhận tiền đã xác minh cho một chi nhánh (SQL trực tiếp, chưa cần giao diện US2), tạo booking chờ thanh toán, mở màn thanh toán trên một máy, quét mã bằng thiết bị khác và xác nhận. Booking phải `CONFIRMED` và máy thứ nhất phải tự cập nhật. Kịch bản **B3** trong [quickstart.md](./quickstart.md).

### Test trước (cổng cứng Constitution V)

- [X] T012 [P] [US1] Thêm helper dựng payload webhook định dạng SePay vào `rcfeild-be/src/__tests__/helpers/bank-webhook.helper.ts`
- [X] T013 [P] [US1] Thêm fixture tạo `cafe_payment_settings` đã xác minh + booking chờ thanh toán vào `rcfeild-be/src/__tests__/helpers/bank-payment.fixture.ts`
- [X] T014 [US1] ⚠️ **CỔNG CỨNG** — Viết `rcfeild-be/src/__tests__/services/bank-webhook.test.ts` với đủ **10 ca** ở [research.md D16](./research.md#d16--test-first-principle-v-cổng-cứng), chạy `npm test -- bank-webhook` và **xác nhận toàn bộ ĐỎ**. Không được viết một dòng nào của T015 trước khi bước này hoàn tất và ghi lại kết quả đỏ.

### Đối soát và cổng thanh toán

- [X] T015 [US1] Hiện thực `rcfeild-be/src/services/bank-webhook.service.ts` — hàm `matchBankTransaction(payload)` theo đúng **11 bước** ở [contracts/api.md §B1](./contracts/api.md#b1-post-paymentsbank-webhook), chạy tới khi T014 xanh hết. ⚠️ Bước 9 gọi **`processConfirmationResult`** (`payment.service.ts:879`), **tuyệt đối không** `processMockConfirmation` (`:1142`) — hàm sau thiếu cả kiểm số tiền lẫn guard hết hạn giữ chỗ
- [X] T016 [US1] Thêm guard `tx.status === PENDING` trong `bank-webhook.service.ts` (D4): `SUCCESS` → `ALREADY_PAID`, `FAILED` → `SESSION_REPLACED`; đây là hàng rào duy nhất chặn mã QR đã chết thu tiền lần hai
- [X] T017 [US1] Thêm `'bank_transfer'` vào `SUPPORTED_PAYMENT_GATEWAYS` và `'bank_transfer'` vào union `flow` trong `rcfeild-be/src/services/payment-gateway.interface.ts`
- [X] T018 [US1] Tạo `rcfeild-be/src/services/bank-transfer.gateway.ts` cài `PaymentGateway`; `createPaymentUrl` trả `flow: 'bank_transfer'` và URL trỏ về `/payment/bank-transfer/:txnRef`; `verifyCallback` ném lỗi kèm comment giải thích cổng này xác nhận qua webhook
- [X] T019 [US1] Đăng ký cổng mới vào `gatewayMap` trong `rcfeild-be/src/services/payment-gateway.factory.ts`
- [X] T020 [US1] Tạo `rcfeild-be/src/services/payment-method-resolver.ts` — `resolvePaymentMethodsForCafe(cafeId)` trả mảng theo bảng ở [research.md D7](./research.md#d7--chọn-cổng-theo-chi-nhánh); chưa cấu hình hoặc chưa xác minh đều trả `['vnpay']`
- [X] T021 [US1] ⚠️ Siết nhánh tự xác nhận tại `rcfeild-be/src/services/payment.service.ts:723` thành `gateway.name === 'MOCK' || (env.vnpay.mockEnabled && gateway.name === 'VNPAY')` — không sửa thì booking chuyển khoản tự xác nhận ngay khi tạo mã QR trên môi trường demo
- [X] T022 [US1] Mở rộng `CheckoutResult` trong `rcfeild-be/src/services/payment.service.ts` với `flow` (mặc định `'redirect'`) và khối `bank_transfer` theo [contracts/api.md §E1](./contracts/api.md#e1-post-bookingsidcheckout--tương-thích-ngược); sinh và lưu `payment_ref_code` khi cổng là `bank_transfer`
- [X] T023 [US1] Sửa `rcfeild-be/src/controllers/booking.controller.ts:120` truyền tham số cổng vào `createCheckoutUrl`, đọc `payment_method` từ body; vắng mặt → `'vnpay'` để hành vi cũ không đổi; chọn cổng chi nhánh không bật → 400 `PAYMENT_METHOD_UNAVAILABLE`

### Route và mô phỏng ngân hàng

- [X] T024 [US1] Tạo `rcfeild-be/src/routes/bank-webhook.routes.ts` — `POST /payments/bank-webhook`, xác thực `Authorization: Apikey`, `express-rate-limit` 120 req/phút; sai khoá → 401 và **không ghi vào sổ**; khoá hợp lệ → **luôn 200** kể cả khi không khớp
- [X] T025 [US1] Thêm endpoint công khai `GET /cafes/:cafeId/payment-methods` ([contracts/api.md §E2](./contracts/api.md#e2-get-cafescafeidpayment-methods--công-khai)) vào `rcfeild-be/src/routes/cafe.routes.ts`
- [X] T026 [P] [US1] Tạo `rcfeild-be/src/services/sandbox-bank/page.template.ts` — HTML dựng phía server, số tiền điền sẵn không sửa được (FR-028a), nút khoá sau lần bấm đầu (FR-028b), nhãn "Giao dịch mô phỏng" (FR-032a)
- [X] T027 [US1] Tạo `rcfeild-be/src/services/sandbox-bank/index.ts` — gọi webhook của chính hệ thống **qua HTTP** với payload SePay và `gateway: 'SANDBOX'`. ⚠️ File này chỉ được import `env`, `logger` và HTTP client; **cấm import** `payment.service`, `booking.service` hay bất kỳ entity nào (FR-031)
- [X] T028 [US1] Tạo `rcfeild-be/src/routes/sandbox-bank.routes.ts` với `GET /sandbox-bank/pay` và `POST /sandbox-bank/transfer`, rate limit 30 req/phút
- [X] T029 [US1] Mount `bank-webhook.routes.ts` không điều kiện và `sandbox-bank.routes.ts` **chỉ khi** `env.sandboxBank.enabled` trong `rcfeild-be/src/app.ts` — tắt cờ phải cho 404 tự nhiên, không phải middleware chặn

### Kiểm thử luồng

- [X] T030 [US1] Viết `rcfeild-be/src/__tests__/routes/bank-checkout.test.ts`: checkout **không** kèm `payment_method` cho hành vi VNPay y hệt trước (SC-004); chọn `bank_transfer` khi chi nhánh chưa bật → 400; **`bank_transfer` không tự xác nhận khi `VNPAY_MOCK_ENABLED=true`** (kiểm T021)

### Frontend

- [X] T031 [P] [US1] Tạo `rcfield-fe/src/features/payments/api/bank-payment.api.ts` — `getPaymentMethods(cafeId)` và query key tương ứng
- [X] T032 [US1] Sửa `rcfield-fe/src/pages/booking/components/checkout/PaymentStep.tsx` — thay dữ liệu demo bằng danh sách phương thức thật; một phương thức → đi thẳng không hiện lựa chọn (FR-004c); hai phương thức → hiện cả hai, **không chọn sẵn cái nào** (FR-004)
- [X] T033 [US1] Tạo `rcfield-fe/src/pages/booking/components/checkout/BankTransferQrPanel.tsx` — ảnh QR, số tiền, nội dung chuyển khoản, đồng hồ đếm ngược theo `expires_at`, đúng **ba trạng thái** đang chờ / thành công / hết hạn (FR-013a)
- [X] T034 [US1] Thêm cập nhật realtime vào `BankTransferQrPanel.tsx` bằng `useWebSocket` (`rcfield-fe/src/features/notifications/hooks/useWebSocket.ts`) kèm **polling 5 giây dự phòng** (FR-027), dừng cả hai khi thành công hoặc hết hạn
- [X] T035 [US1] Sửa `rcfield-fe/src/pages/booking/CreateBookingPage.tsx:622` rẽ theo `flow`: `'redirect'` giữ nguyên `window.location.href`, `'bank_transfer'` mở panel QR
- [X] T036 [P] [US1] Sửa `rcfield-fe/src/pages/booking/BookingDetailPage.tsx:498` rẽ theo `flow` tương tự

**Checkpoint**: MVP demo được — quét mã là booking tự xác nhận. Kịch bản B3, C2, C3, D1–D9 của [quickstart.md](./quickstart.md) phải xanh.

---

## Phase 4: User Story 2 — Chủ doanh nghiệp khai tài khoản nhận tiền (P2)

**Goal**: Chủ quán tự khai tài khoản cho từng chi nhánh và tự quét mã QR mẫu để bắt lỗi gõ sai số tài khoản trước khi bật.

**Independent Test**: Mở cấu hình chi nhánh, nhập tài khoản, kiểm tra chi nhánh vẫn dùng VNPay khi chưa xác minh; xác nhận quét thử rồi kiểm tra bước thanh toán chuyển sang hiện mã QR. Kịch bản **A1–A6**.

- [X] T037 [P] [US2] Thêm zod schema `UpdateCafePaymentSettingsSchema` vào `rcfeild-be/src/validate/index.ts` — `method` bắt buộc; `BANK_TRANSFER` bắt buộc đủ `bank_code`, `account_number`, `account_name`
- [X] T038 [US2] Tạo `rcfeild-be/src/services/cafe-payment-settings.service.ts` với `getSettings`, `updateSettings`, `verifySettings`, `buildSampleQr`. ⚠️ Dùng `assertCafeOwner` — **không** `getManagedCafeOrThrow` (`cafe.service.ts:441`), hàm đó cho STAFF đi qua và sẽ để nhân viên đọc/sửa số tài khoản của chủ quán
- [X] T039 [US2] Trong `updateSettings` của `rcfeild-be/src/services/cafe-payment-settings.service.ts`, đặt lại `is_verified = false` và `verified_at = null` mỗi khi `bank_code` hoặc `account_number` đổi (FR-008) — làm trong service để còn ghi audit, không dùng trigger
- [X] T040 [US2] Hiện thực `buildSampleQr` trong `rcfeild-be/src/services/cafe-payment-settings.service.ts` gọi thẳng `buildVietQrPayload` với `amount: 10000`, `memo: 'RCFIELD TEST'`. ⚠️ **Không đi qua factory cổng thanh toán** — mã mẫu phải là mã ngân hàng thật kể cả khi `SANDBOX_BANK_ENABLED=true` (FR-006a), nếu không thì hàng rào an toàn duy nhất của story này rỗng
- [X] T041 [US2] Thêm hàm che số tài khoản (`****3210`) vào `rcfeild-be/src/services/cafe-payment-settings.service.ts`, áp cho A1 và mọi chỗ hiển thị ngoài chế độ chỉnh sửa (FR-010)
- [X] T042 [US2] Tạo `rcfeild-be/src/controllers/bank-payment.controller.ts` với 5 handler A1–A5
- [X] T043 [US2] Tạo `rcfeild-be/src/routes/bank-payment.routes.ts` — `authenticate` + `authorize(UserRole.PROVIDER)` ở tầng router (Principle VI), thêm `requireActiveProvider` cho A3 và A5; mount vào `app.ts`
- [X] T044 [US2] Viết `rcfeild-be/src/__tests__/routes/bank-payment-settings.test.ts`: **STAFF gọi A1–A5 đều 403** (kiểm T038), PROVIDER khác chủ 403, ADMIN 403, sửa số tài khoản làm mất xác minh, chưa xác minh thì `payment-methods` chỉ trả `['vnpay']`
- [X] T045 [P] [US2] Thêm `getPaymentSettings`, `updatePaymentSettings`, `getSampleQr`, `verifyPaymentSettings` vào `rcfield-fe/src/features/payments/api/bank-payment.api.ts`
- [X] T046 [US2] Tạo `rcfield-fe/src/pages/provider/components/CafePaymentSettingsCard.tsx` — chọn ngân hàng, nhập tài khoản, khối QR mẫu kèm nút "Tôi đã quét và xác nhận đúng tài khoản", huy hiệu trạng thái xác minh, dòng giải thích chưa cấu hình thì dùng cổng chung
- [X] T047 [US2] Gắn thẻ cấu hình vào màn quản lý chi nhánh của provider trong `rcfield-fe/src/pages/provider/`

**Checkpoint**: Chủ quán tự bật được chuyển khoản cho từng chi nhánh, có hàng rào quét thử

---

## Phase 5: User Story 3 — Đối soát và xử lý giao dịch lệch (P3)

**Goal**: Mọi khoản tiền nhận được đều nhìn thấy, kể cả khoản không khớp; nhân viên xử lý được phần đang treo mà không thấy con số tổng.

**Independent Test**: Gửi một giao dịch mất mã tham chiếu và một giao dịch thiếu tiền; cả hai phải hiện trong sổ với lý do; gán tay một giao dịch vào booking đúng và kiểm booking được xác nhận. Kịch bản **D10, D11, E1–E6**.

- [X] T048 [US3] Tạo `rcfeild-be/src/services/bank-transaction.service.ts` — `listForOwner` (đầy đủ + `summary`), `listPendingForOperator` (chỉ `NEEDS_REVIEW`, **không** `summary`, loại bỏ `UNKNOWN_ACCOUNT`), `assignToBooking`, `markIgnored`. ⚠️ Câu truy vấn phải lọc `deleted_at IS NULL` **khớp đúng vị từ của index** ở [data-model.md](./data-model.md#bảng-mới-2--bank_transactions) — lệch vị từ là nguyên nhân sự cố `track-configs` trước đây
- [X] T049 [US3] `assignToBooking` trong `rcfeild-be/src/services/bank-transaction.service.ts` chạy lại đúng bước 7–10 của webhook, nên **không xác nhận được booking đã hết hạn** (FR-018b); trả 409 `TRANSACTION_ALREADY_RESOLVED` nếu giao dịch không còn `NEEDS_REVIEW`, 400 `AMOUNT_MISMATCH` nếu tiền lệch
- [X] T050 [US3] Thêm thông báo khi giao dịch rơi vào `NEEDS_REVIEW` (FR-018c) — `createNotification` cho chủ chi nhánh + `wsService.pushToCafe` xuống quầy, gọi từ `bank-webhook.service.ts`
- [X] T051 [US3] Thêm 4 handler C1–C4 vào `rcfeild-be/src/controllers/bank-payment.controller.ts`
- [X] T052 [US3] Thêm route C1–C4 vào `rcfeild-be/src/routes/bank-payment.routes.ts` — C1 và C4 `authorize(PROVIDER)`; C2 và C3 `authorize(PROVIDER, STAFF)` kèm kiểm `isStaffAssignedToCafe` (`contest.helpers.ts:40`) trong service
- [X] T053 [US3] Viết `rcfeild-be/src/__tests__/routes/bank-transactions.test.ts`: nhân viên chỉ thấy `NEEDS_REVIEW` của chi nhánh mình, **rà toàn bộ JSON không có trường tổng nào** (SC-013), không thấy `UNKNOWN_ACCOUNT`, gọi `ignore` → 403, nhân viên chi nhánh khác → 403
- [X] T054 [P] [US3] Thêm `listBankTransactions`, `listPendingTransactions`, `assignTransaction`, `ignoreTransaction` vào `rcfield-fe/src/features/payments/api/bank-payment.api.ts`
- [X] T055 [US3] Tạo `rcfield-fe/src/pages/provider/components/BankTransactionsPanel.tsx` — lọc theo trạng thái, hiện lý do chưa khớp, hộp thoại gán vào booking, hộp thoại đánh dấu không liên quan kèm ghi chú bắt buộc
- [X] T056 [US3] Tạo hàng đợi giao dịch treo cho nhân viên trong `rcfield-fe/src/pages/staff/` — chỉ danh sách `NEEDS_REVIEW` và nút gán, **không hiển thị bất kỳ con số tổng nào**

**Checkpoint**: Sổ đối soát khớp được với sao kê ngân hàng; nhân viên xử lý được khách đang đứng chờ

---

## Phase 6: User Story 4 — Chuyển sang ngân hàng thật không sửa code (P4)

**Goal**: Đổi từ ngân hàng mô phỏng sang dịch vụ đối soát thật chỉ bằng thay đổi cấu hình.

**Independent Test**: Tắt cờ mô phỏng, gửi một thông báo đúng định dạng nhà cung cấp thật bằng `curl`, kiểm booking vẫn xác nhận. Kịch bản **F1–F3**.

- [X] T057 [US4] Ghi trạng thái bật/tắt chế độ mô phỏng vào nhật ký khởi động trong `rcfeild-be/src/app.ts` (FR-030a) — đúng một dòng, nêu rõ cách tắt
- [X] T058 [US4] Viết `rcfeild-be/src/__tests__/routes/sandbox-bank.test.ts`: cờ tắt → mọi đường dẫn mô phỏng trả **404** (SC-006), webhook vẫn hoạt động bình thường (SC-005)
- [X] T059 [US4] Thêm test ranh giới import vào `rcfeild-be/src/__tests__/services/sandbox-bank-isolation.test.ts` — đọc mã nguồn `src/services/sandbox-bank/` và `src/routes/sandbox-bank.routes.ts`, khẳng định không có import nào tới `payment.service`, `booking.service` hay thư mục `models/` (FR-031)
- [X] T060 [P] [US4] Ghi 2 biến môi trường mới và ý nghĩa vào `rcfeild-be/.env.example` kèm cảnh báo phải tắt trước khi vận hành thương mại

**Checkpoint**: Đường lên vận hành thật đã thông và kiểm chứng được

---

## Phase 7: Polish & Cross-Cutting

- [X] T061 [P] Thêm mục `019 · Thanh toán chuyển khoản theo chi nhánh` với đủ 6 tài liệu vào `website/sidebars-specs.ts`
- [X] T062 [P] Bổ sung 9 endpoint mới và thay đổi `POST /bookings/:id/checkout` vào `docs/spec/05-api-contracts.md`
- [X] T063 [P] Bổ sung `cafe_payment_settings`, `bank_transactions` và cột `payment_ref_code` vào `docs/spec/06-database.md`
- [X] T064 [P] Bổ sung mục "Thanh toán chuyển khoản theo chi nhánh" vào `docs/spec/03-payment-engine.md`, nêu rõ đây **không** phải `PaymentComponent` và nêu ranh giới với luồng VNPay
- [X] T065 Chạy `npm run lint` và `npm test` trong `rcfeild-be` — toàn bộ xanh, không cảnh báo `any`
- [X] T066 Chạy `npm run build` trong `rcfield-fe` — không lỗi kiểu, không biến thừa
- [ ] T067 Chạy tay 3 kịch bản quyết định **B3**, **D6**, **C2** trong [quickstart.md](./quickstart.md#ba-bài-kiểm-quyết-định) trên máy thật với hai thiết bị

---

## Dependencies

```
Phase 1 (T001–T003)
   ↓
Phase 2 (T004–T011)          ← chặn mọi user story
   ↓
   ├─ US1 (T012–T036)  🎯 MVP
   │     T014 ⚠️ CHẶN CỨNG T015
   │     T012, T013 ┐
   │                ├→ T014 → T015 → T016 → T024
   │     T017 → T018 → T019 ┐
   │     T020 ────────────  ├→ T022 → T023 → T030
   │     T021 ────────────  ┘
   │     T026 → T027 → T028 → T029
   │     T031 → T032 → T033 → T034 → T035, T036
   │
   ├─ US2 (T037–T047)   cần T010 (VietQR) và T038 xong trước T040
   │
   ├─ US3 (T048–T056)   cần T015 (matcher) để có dữ liệu trong sổ
   │
   └─ US4 (T057–T060)   cần T028, T029
         ↓
      Phase 7 (T061–T067)
```

**Thứ tự user story**: US1 → US2 → US3 → US4. US2 và US3 độc lập với nhau, chạy song song được sau khi US1 xong.

**Phụ thuộc chéo duy nhất đáng chú ý**: US3 cần matcher của US1 để sổ có gì mà đối soát. Nếu muốn làm US3 trước, phải nạp dữ liệu `bank_transactions` bằng tay.

## Parallel Execution Examples

**Phase 2** — ba nhánh độc lập sau khi T004 xong:
```
T005, T006  (hai entity, hai file)
T009        (test VietQR)
T011        (sinh mã tham chiếu)
```

**US1 frontend và backend** — sau khi T022 chốt hình dạng phản hồi:
```
Nhánh BE:  T024 → T025 → T026 → T027 → T028 → T029 → T030
Nhánh FE:  T031 → T032 → T033 → T034 → T035 → T036
```

**US2 và US3** — sau khi US1 xong, hai người làm song song hoàn toàn:
```
Người A: T037 → … → T047   (cấu hình nhận tiền)
Người B: T048 → … → T056   (sổ đối soát)
```

**Phase 7** — T061–T064 là bốn file tài liệu khác nhau, chạy cùng lúc.

## Implementation Strategy

### MVP — dừng ở đâu cũng dùng được

**Sau Phase 3 (US1)**: demo được đầy đủ. Khách chọn chuyển khoản, quét mã, booking tự xác nhận. Cấu hình nhận tiền nạp bằng SQL. Đây là thứ mang lên bảo vệ đồ án.

**Sau Phase 4 (US2)**: chủ quán tự bật được cho từng chi nhánh, có hàng rào chống gõ sai số tài khoản.

**Sau Phase 5 (US3)**: dùng được với tiền thật — mọi khoản lệch đều nhìn thấy và xử lý được.

**Sau Phase 6 (US4)**: chuyển sang ngân hàng thật chỉ bằng đổi cấu hình.

### Ba việc dễ làm sai nhất

1. **T014 trước T015.** Cổng Constitution V. Test phải chạy và phải đỏ, ghi lại kết quả, rồi mới viết matcher. Bỏ qua bước này thì ca 7 (booking hết hạn) và ca 8 (transaction đã bị thay thế) rất dễ lọt — cả hai đều là lỗ tiền bạc.
2. **T021 — siết nhánh `payment.service.ts:723`.** Một dòng, và bỏ sót thì cả tính năng thành nút bấm trên môi trường demo.
3. **T038 — `assertCafeOwner` chứ không `getManagedCafeOrThrow`.** Nhầm hàm là nhân viên đọc và sửa được số tài khoản ngân hàng của chủ quán.
