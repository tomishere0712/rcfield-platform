# Implementation Plan: Thanh toán chuyển khoản theo từng chi nhánh

**Branch**: `019-cafe-bank-payment` | **Date**: 2026-08-11 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/019-cafe-bank-payment/spec.md`

## Summary

Cho mỗi chi nhánh nhận tiền booking vào tài khoản ngân hàng của chính mình qua mã QR, và **tiền về là booking tự xác nhận** — không ai bấm gì.

Cách đạt được: toàn bộ đường đi tiền là mã production thật (sinh mã tham chiếu → dựng VietQR → nhận thông báo tiền về → đối soát → xác nhận booking), chỉ mắt xích **ngân hàng** là mô phỏng. Bên mô phỏng gọi webhook của hệ thống qua HTTP với đúng định dạng của dịch vụ đối soát thật, nên chuyển sang dịch vụ thật là đổi cấu hình, không sửa mã.

Ba điều kiện ràng buộc mọi quyết định thiết kế:

1. **Luồng VNPay không đổi một dòng nào.** `createCheckoutUrl` đã nhận cổng làm tham số với mặc định `'vnpay'`, nên fallback của FR-002 là "không truyền gì".
2. **Không viết nhánh xác nhận riêng.** Webhook gọi lại `processConfirmationResult` — hàm đã có sẵn chống trùng, kiểm số tiền, và guard hết hạn giữ chỗ.
3. **Phần mô phỏng phải gỡ được.** Nó không import gì từ logic đặt lịch; gỡ cả thư mục đi thì luồng thanh toán vẫn chạy.

## Technical Context

**Language/Version**: TypeScript 5.5 strict (không `any`), Node.js 20+
**Primary Dependencies**: Express 4, TypeORM 0.3, `qrcode` 1.5 (đã có), `express-rate-limit` 7 (đã có), `ioredis`, `ws`
**Storage**: PostgreSQL — 2 bảng mới, 1 cột mới; không sửa `bookings`, không sửa `cafes`
**Testing**: Jest 30 + ts-jest, supertest; `jest-setup.ts` truncate mỗi `beforeEach`
**Target Platform**: Linux server (Coolify), frontend React 19 + Vite + Tailwind v4
**Project Type**: Web — backend `rcfeild-be`, frontend `rcfield-fe`
**Performance Goals**: xác nhận đến màn hình khách ≤ 5s (SC-001); WebSocket ~1s, polling 5s dự phòng
**Constraints**: giao diện tiếng Việt, VND không số lẻ; webhook luôn trả 200 khi khoá hợp lệ; điểm nhận thông báo công khai nên phải chặn nhồi rác
**Scale/Scope**: 13 file backend mới + 8 sửa, 4 file frontend mới + 4 sửa

**Không còn NEEDS CLARIFICATION** — 8 quyết định đã chốt qua `/speckit-specify` và `/speckit-clarify`, ghi ở phần Clarifications của spec.

## Constitution Check

*GATE: phải qua trước Phase 0. Đã đánh giá lại sau Phase 1.*

| Principle | Đánh giá | Cách tuân thủ |
|---|---|---|
| **I. Snapshot-First Pricing** | ✅ PASS | Số tiền trên mã QR lấy từ `tx.amount` của `payment_transactions`, vốn được `createCheckoutUrl` ghi từ `snapshot.total_charged` (`payment.service.ts:505`). Đối soát so với `tx.amount`, **không** đọc giá sống từ `cafes` hay `vehicles`. |
| **II. State Machine Gate** | ✅ PASS | Không có chỗ nào chạm `bookings.status`. Đường xác nhận duy nhất là `processConfirmationResult` → `transition(id, 'PAYMENT_CONFIRMED')` (`:1094`). |
| **III. Evidence-Based Handover** | ➖ N/A | Không đụng tới kiểm tra xe. |
| **IV. Payment Component Isolation** | ✅ PASS | `bank_transactions` **không phải** `PaymentComponent`, không thêm giá trị nào vào danh sách type. Component vẫn do `createPaymentComponents` sinh khi booking xác nhận. Phần bất biến của bản ghi (`external_id`, `amount`, `content`, `raw_payload`) không bao giờ sửa; chỉ phán quyết đối soát thay đổi được, kèm `resolved_by`/`resolved_at`. |
| **V. Test-First cho logic tài chính** | ⚠️ **CỔNG CỨNG** | `src/__tests__/services/bank-webhook.test.ts` **phải viết và xác nhận ĐỎ** trước khi cài `matchBankTransaction`. M3 chặn M4. 10 ca bắt buộc liệt kê ở D16 của `research.md`. |
| **VI. RBAC ở tầng router** | ✅ PASS | `authenticate` + `authorize(...)` trên mọi route trừ webhook (xác thực bằng khoá API, đúng bản chất) và route mô phỏng (công khai, tắt được). Kiểm sở hữu bằng `assertCafeOwner` / `isStaffAssignedToCafe`. |

**Kết luận cổng**: PASS. Không có vi phạm cần biện minh → mục Complexity Tracking bỏ trống.

**Lưu ý về Constitution**: phần "Tech Stack & Constraints" ghi `staff_cafe_assignments` là Phase 2, nhưng bảng này **đã tồn tại và đang được dùng** (`auth.service.ts:81`, `contest.helpers.ts:40`). Feature này dùng bảng đó, không tạo mới.

## Project Structure

### Documentation (this feature)

```text
specs/019-cafe-bank-payment/
├── plan.md              # File này
├── spec.md              # 50 FR, 13 SC, 4 user story
├── research.md          # 17 quyết định + 6 cạm bẫy
├── data-model.md        # 2 bảng mới, 1 cột mới
├── quickstart.md        # Kịch bản E2E + checklist test
├── checklists/
│   └── requirements.md  # 16/16 đạt
├── contracts/
│   └── api.md           # 9 endpoint mới + 1 thay đổi tương thích ngược
└── tasks.md             # /speckit-tasks sinh sau
```

### Source Code

```text
rcfeild-be/src/
├── migrations/
│   └── <ts>-CafePaymentSettingsAndBankTransactions.ts   MỚI
├── models/
│   ├── cafe-payment-setting.entity.ts                   MỚI
│   ├── bank-transaction.entity.ts                       MỚI
│   └── payment-transaction.entity.ts                    SỬA  +paymentRefCode
├── services/
│   ├── vietqr.ts                                        MỚI  dựng chuỗi + bảng BIN
│   ├── bank-transfer.gateway.ts                         MỚI  cài PaymentGateway
│   ├── payment-method-resolver.ts                        MỚI  chọn cổng theo chi nhánh
│   ├── bank-webhook.service.ts                          MỚI  ⚠️ test-first
│   ├── cafe-payment-settings.service.ts                 MỚI
│   ├── bank-transaction.service.ts                      MỚI  sổ + gán tay
│   ├── sandbox-bank/
│   │   ├── index.ts                                     MỚI  ⚠️ không import payment/booking
│   │   └── page.template.ts                             MỚI  HTML server-side
│   ├── payment-gateway.interface.ts                     SỬA  +'bank_transfer', +flow
│   ├── payment-gateway.factory.ts                       SỬA  đăng ký cổng
│   └── payment.service.ts                               SỬA  ⚠️ 2 chỗ, xem dưới
├── controllers/
│   ├── bank-payment.controller.ts                       MỚI
│   └── booking.controller.ts                            SỬA  :120 truyền cổng
├── routes/
│   ├── bank-payment.routes.ts                           MỚI
│   └── sandbox-bank.routes.ts                           MỚI  mount có điều kiện
├── validate/                                            SỬA  zod schema
├── config/env.ts                                        SỬA  +sandboxBank, +webhook key
├── app.ts                                               SỬA  mount router
└── __tests__/
    ├── services/bank-webhook.test.ts                    MỚI  ⚠️ VIẾT TRƯỚC
    └── routes/bank-payment.test.ts                      MỚI

rcfield-fe/src/
├── features/payments/api/bank-payment.api.ts            MỚI
├── pages/booking/components/checkout/
│   ├── BankTransferQrPanel.tsx                          MỚI  QR + đếm ngược + chờ
│   └── PaymentStep.tsx                                  SỬA  chọn phương thức thật
├── pages/booking/CreateBookingPage.tsx                  SỬA  :622 rẽ theo flow
├── pages/booking/BookingDetailPage.tsx                  SỬA  :498 rẽ theo flow
├── pages/provider/components/
│   ├── CafePaymentSettingsCard.tsx                      MỚI  cấu hình + QR mẫu
│   └── BankTransactionsPanel.tsx                        MỚI  sổ đối soát
└── pages/staff/                                         SỬA  hàng đợi giao dịch treo
```

**Structure Decision**: Web application — hai repo cạnh nhau trong workspace. Backend theo router-per-domain sẵn có (`routes/` → `controllers/` → `services/` → `models/`). Frontend theo feature-folder. Không tạo tầng kiến trúc mới nào.

### Hai chỗ sửa trong `payment.service.ts` — đều nhỏ và đều bắt buộc

**Chỗ 1 — `:723`, siết nhánh tự xác nhận:**

```ts
// Trước
if (gateway.name === 'MOCK' || env.vnpay.mockEnabled) {
// Sau
if (gateway.name === 'MOCK' || (env.vnpay.mockEnabled && gateway.name === 'VNPAY')) {
```

Không sửa dòng này thì trên môi trường demo (đang bật `VNPAY_MOCK_ENABLED`), **booking chuyển khoản được xác nhận ngay lúc khách vừa chọn phương thức**, trước cả khi mã QR kịp hiện — cả tính năng thành một nút bấm.

**Chỗ 2 — `CheckoutResult` thêm `flow` và `bank_transfer`.** Thuần cộng thêm trường; `flow` mặc định `'redirect'` để hành vi cũ không đổi.

## Execution Milestones

| # | Milestone | Nội dung | Chặn bởi |
|---|---|---|---|
| **M1** | Nền dữ liệu | Migration, 2 entity, cột `payment_ref_code`, thêm bảng vào `jest-setup.ts` | — |
| **M2** | VietQR | `vietqr.ts` — dựng chuỗi EMVCo + bảng BIN tĩnh + test đơn vị | M1 |
| **M3** | ⚠️ **Test đối soát (ĐỎ)** | `bank-webhook.test.ts` với 10 ca ở D16, **xác nhận chạy hỏng** | M1 |
| **M4** | Đối soát | `bank-webhook.service.ts` cho tới khi M3 xanh | **M3** |
| **M5** | Cấu hình nhận tiền | Service + controller + route A1–A5, `assertCafeOwner` | M2 |
| **M6** | Cổng chuyển khoản | `bank-transfer.gateway.ts`, resolver, sửa 2 chỗ `payment.service.ts`, sửa `booking.controller.ts:120` | M4, M5 |
| **M7** | Ngân hàng mô phỏng | Route + trang HTML, kiểm ràng buộc không-import | M4 |
| **M8** | Sổ đối soát | C1–C4, phân quyền chủ/nhân viên, thông báo | M4 |
| **M9** | Frontend | Chọn phương thức, trang QR + realtime + polling, màn cấu hình + QR mẫu, sổ, hàng đợi nhân viên | M6, M8 |

**M3 chặn M4 là cổng Constitution, không phải gợi ý.** Test phải chạy và phải đỏ trước khi có dòng cài đặt nào.

MVP demo được sau **M7**: khách chọn chuyển khoản → quét → booking tự xác nhận. M8 và M9 làm nó dùng được lâu dài.

## Rủi ro triển khai

| Rủi ro | Giảm thiểu |
|---|---|
| Gọi nhầm `processMockConfirmation` | Ghi vào contract bước 9, vào research D1, và ca test 7+8 sẽ đỏ nếu gọi nhầm |
| Quên siết nhánh `:723` | M6 có bước riêng; ca test "bank_transfer không tự xác nhận khi mockEnabled" |
| Dùng `getManagedCafeOrThrow` cho cấu hình ngân hàng | Bảng đối chiếu ở research D15; test 403 cho STAFF ở A1–A5 |
| Vị từ index lệch vị từ truy vấn | Đã ghi rõ trong data-model; đúng lỗi đã gặp ở `track-configs` |
| `numeric` trả về chuỗi | Mọi phép so tiền bọc `Number()` — đã dính ở feature 018 |
| Thiếu bảng trong TRUNCATE | data-model ghi rõ thứ tự `bank_transactions` trước `cafe_payment_settings` |

## Complexity Tracking

> Không có vi phạm Constitution cần biện minh. Mục này để trống.
