# Research: Thanh toán chuyển khoản theo từng chi nhánh

**Feature**: `019-cafe-bank-payment` · **Date**: 2026-08-11 · **Phase**: 0

Mọi quyết định dưới đây đã đối chiếu với mã nguồn hiện tại qua codegraph. Số dòng trích dẫn là vị trí thật tại thời điểm khảo sát.

---

## D1 — Hàm xác nhận nào được tái sử dụng

**Decision**: Webhook ngân hàng gọi **`processConfirmationResult(result: PaymentVerificationResult)`** tại `payment.service.ts:879`, sau khi tự dựng một `PaymentVerificationResult` từ payload ngân hàng.

**Rationale**: Hàm này đã làm sẵn gần hết những gì spec yêu cầu:

| Yêu cầu spec | Đã có sẵn |
|---|---|
| FR-019 chống trùng | `:890` — `tx.status === SUCCESS` → trả `'02'` |
| FR-018 chặn khi số tiền lệch | `:903` — `Number(tx.amount) !== Number(result.amount)` |
| **FR-018a/b treo khi hết hạn giữ chỗ** | `:915–939` — kiểm `booking.status !== PENDING \|\| booking.paymentExpiresAt <= now` → đánh dấu tx FAILED với `reason: 'BOOKING_HOLD_NO_LONGER_ACTIVE'`, trả `'99'` |
| Principle II — state machine | `:1094` — `transition(id, 'PAYMENT_CONFIRMED')` |
| Principle IV — payment component | `:1104` — `createPaymentComponents` |
| Email + realtime | `:1127–1136` |

FR-018a/b tưởng là việc mới, thực ra **đã được cài từ trước** cho luồng VNPay. Không viết lại.

**Alternatives rejected**:

- **`processMockConfirmation` (`:1142`)** — ⚠️ **cạm bẫy lớn nhất của feature này.** Trông giống hệt `processConfirmationResult` và cùng dẫn tới `transition(...)`, nhưng **không có kiểm số tiền và không có guard hết hạn giữ chỗ**. Nó là đường tắt cho môi trường dev. Webhook gọi nhầm hàm này sẽ âm thầm vi phạm FR-018, FR-018a và FR-018b mà không test nào hiện tại bắt được.
- Viết nhánh xác nhận riêng cho chuyển khoản — vi phạm FR-020 và Principle II, và sẽ lệch khỏi luồng VNPay ngay lần sửa đầu tiên.

---

## D2 — Chuyển thừa tiền, trong khi hàm dùng chung so sánh bằng tuyệt đối

**Vấn đề**: `processConfirmationResult:903` từ chối khi `amount !== expected`, tức **chuyển thừa cũng bị đánh trượt**. Nhưng US3 kịch bản 3 yêu cầu chuyển thừa vẫn xác nhận booking và ghi phần chênh vào sổ.

**Decision**: Không sửa `processConfirmationResult`. Việc chuẩn hoá nằm ở tầng webhook, trước khi gọi:

| Tiền nhận được | Hành động |
|---|---|
| `< expected` | Không gọi hàm xác nhận. Ghi sổ `NEEDS_REVIEW` / `SHORT_PAID`. |
| `= expected` | Gọi bình thường. |
| `> expected` | Gọi với `amount = tx.amount` (đúng bằng số phải trả) để qua được phép so sánh, đồng thời ghi sổ phần chênh với `match_reason = 'OVERPAID'`. Payload ngân hàng thật vẫn được lưu nguyên trong `raw_payload`, nên số liệu đối soát không bị bóp méo. |

**Rationale**: FR-003 cấm thay đổi hành vi luồng VNPay. Nới điều kiện thành `<` bên trong hàm dùng chung sẽ khiến VNPay bắt đầu chấp nhận giao dịch thừa tiền — một thay đổi không ai yêu cầu, nằm trong hàm không có test bao phủ.

---

## D3 — Mã tham chiếu nằm ở bảng nào

**Decision**: Cột mới `payment_ref_code` trên **`payment_transactions`**, không phải trên `bookings`. Định dạng `RCF` + 5 ký tự Crockford base32 (bỏ I, L, O, U) → 8 ký tự, unique.

**Rationale**: Đây là điểm mấu chốt để FR-004a hoạt động **mà không cần viết thêm code**. `createCheckoutUrl` đã tạo `txnRef` mới cho mỗi lần thử (`:682`) và **đánh dấu lần thử PENDING trước đó thành FAILED** với `reason: 'CHECKOUT_ATTEMPT_EXPIRED_OR_REPLACED'` (`:669–678`). Gắn mã tham chiếu vào transaction nghĩa là:

- Khách đổi từ chuyển khoản sang VNPay → transaction cũ chết → mã QR cũ trỏ tới một transaction FAILED → tiền về sau đó rơi vào `NEEDS_REVIEW` thay vì cộng vào booking. Đúng US1 kịch bản 9.
- Không tồn tại hai mã sống cùng lúc, vì không tồn tại hai transaction PENDING cùng lúc.

**Alternative rejected**: đặt mã trên `bookings`. Mã sẽ sống dai hơn phiên thanh toán; quét lại mã QR cũ sau khi đã trả bằng VNPay sẽ tìm thấy một booking hợp lệ và có nguy cơ thu tiền lần hai. Đây chính là rủi ro FR-004b sinh ra để chặn.

---

## D4 — Chỉ xác nhận khi transaction còn sống

**Decision**: Trước khi gọi `processConfirmationResult`, tầng webhook bắt buộc kiểm `tx.status === PENDING`. Mọi trạng thái khác → ghi sổ `NEEDS_REVIEW` kèm lý do tương ứng (`ALREADY_PAID` nếu SUCCESS, `SESSION_REPLACED` nếu FAILED).

**Rationale**: `processConfirmationResult` chỉ chặn trường hợp `SUCCESS` (`:890`). Một transaction **FAILED** — do khách đổi phương thức, hoặc do lần thử trước hết hạn — vẫn lọt qua và chạy tiếp xuống `transition(...)`. Với luồng VNPay điều này không xảy ra vì VNPay không gọi lại một txnRef đã bị thay thế; với chuyển khoản thì hoàn toàn có thể, vì mã QR cũ vẫn nằm trong lịch sử điện thoại khách.

Đây là hàng rào duy nhất cho FR-004b và FR-019a. Phải có test riêng.

---

## D5 — Một bảng sổ giao dịch, trạng thái tách khỏi lý do

**Decision**: Bảng `bank_transactions` với **hai cột riêng**: `match_status` (3 giá trị) và `match_reason` (varchar, nullable).

```
match_status:  MATCHED | NEEDS_REVIEW | IGNORED
match_reason:  NO_REF_CODE | REF_NOT_FOUND | SHORT_PAID | OVERPAID
             | ALREADY_PAID | SESSION_REPLACED | BOOKING_EXPIRED
             | UNKNOWN_ACCOUNT | null
```

**Rationale**: Nhân viên chỉ cần lọc `NEEDS_REVIEW` (FR-025a) — một điều kiện, một index. Gộp cả hai vào một enum sẽ tạo ra 9 giá trị mà truy vấn của nhân viên phải liệt kê 7 trong số đó, và mỗi lý do mới thêm sau này lại phải sửa mọi chỗ lọc.

Dùng `varchar` + `CHECK` thay vì native enum, theo đúng tiền lệ đã chốt ở feature 018 (`contest_ledger_entries.category`) — thêm giá trị mới không cần `ALTER TYPE`.

**Chống trùng (FR-019)**: unique index từng phần trên `(gateway, external_id) WHERE deleted_at IS NULL`. `external_id` là mã giao dịch do ngân hàng cấp, không phải mã của mình.

---

## D6 — Cấu hình nhận tiền: bảng riêng

**Decision**: Bảng `cafe_payment_settings`, một hàng mỗi chi nhánh (unique `cafe_id` where `deleted_at IS NULL`).

**Rationale**: `cafes` đã rất rộng và là bảng đọc nhiều nhất hệ thống (mọi trang công khai). Số tài khoản ngân hàng cần vòng đời riêng, cần audit riêng, và chỗ dành sẵn cho khoá API dịch vụ đối soát đã mã hoá. Đã kiểm: `cafe.entity.ts` hiện **không có** trường nào liên quan ngân hàng.

---

## D7 — Chọn cổng theo chi nhánh

**Decision**: Hàm `resolvePaymentMethodsForCafe(cafeId)` trả về danh sách phương thức khả dụng, đặt ở `src/services/payment-method-resolver.ts`.

```
settings không tồn tại        → ['vnpay']
method = VNPAY                → ['vnpay']
method = BANK_TRANSFER, chưa verified → ['vnpay']
method = BANK_TRANSFER, verified      → ['vnpay', 'bank_transfer']
```

**Rationale**: `createCheckoutUrl(bookingId, ipAddr, customReturnUrl, gatewayName = 'vnpay')` (`:425`) **đã nhận cổng làm tham số và mặc định là vnpay**. Fallback của FR-002 vì thế đúng nghĩa là "không truyền gì". Chỗ duy nhất phải sửa trong luồng thanh toán hiện tại là `booking.controller.ts:120`, nơi hiện gọi `createCheckoutUrl(bookingId, ipAddr, req.body?.return_url)` không kèm cổng.

Trả về **danh sách** chứ không phải một giá trị, vì FR-004 cho khách tự chọn và FR-004c bắt ẩn phần chọn khi chỉ có một phương thức.

---

## D8 — Cổng `bank_transfer`

**Decision**: File mới `src/services/bank-transfer.gateway.ts`, cài `PaymentGateway`, đăng ký vào factory, thêm `'bank_transfer'` vào `SUPPORTED_PAYMENT_GATEWAYS` (hiện là `['vnpay', 'mock']`).

`createPaymentUrl` trả `payment_url` trỏ về route frontend `/payment/bank-transfer/:txnRef` và `flow: 'bank_transfer'` (thêm nhánh vào union `'redirect' | 'mock_page'`).

`verifyCallback` **ném lỗi** — cổng này không nhận callback đồng bộ; xác nhận đi qua webhook. Ghi rõ trong comment để người sau không tưởng là thiếu sót.

### ⚠️ Cạm bẫy: nhánh tự xác nhận ở `payment.service.ts:723`

```ts
if (gateway.name === 'MOCK' || env.vnpay.mockEnabled) {
  await processMockConfirmation(txnRef);   // xác nhận NGAY lúc tạo URL
```

Môi trường demo đang bật `VNPAY_MOCK_ENABLED`. Nếu không đụng gì, **mọi booking chuyển khoản sẽ được xác nhận ngay khi khách vừa bấm chọn phương thức**, trước cả khi mã QR kịp hiện. Toàn bộ tính năng biến thành một nút bấm.

**Decision**: siết điều kiện thành `gateway.name === 'MOCK' || (env.vnpay.mockEnabled && gateway.name === 'VNPAY')`. Hành vi VNPay giữ nguyên tuyệt đối; `bank_transfer` không bao giờ đi vào nhánh này.

---

## D9 — Sinh mã VietQR

**Decision**: Tự dựng chuỗi EMVCo/VietQR trong `src/services/vietqr.ts`, kèm danh sách BIN ngân hàng dạng hằng số tĩnh (~40 ngân hàng lớn). Render ảnh QR bằng `qrcode` — **đã có sẵn trong dependencies** và đang được dùng ở `booking.controller.ts:809`.

**Rationale**: Không gọi `api.vietqr.io` lúc chạy. Sinh mã thanh toán mà phụ thuộc mạng ngoài nghĩa là dịch vụ đó sập thì không ai đặt lịch được — đổi một phụ thuộc cứng lấy vài chục dòng bảng tra.

**Alternatives rejected**: dùng ảnh QR do provider tự tải lên. QR tĩnh không mang số tiền và không mang nội dung chuyển khoản, nên không đối soát tự động được — mất toàn bộ giá trị của tính năng.

**Hệ quả — bảng tra phải có đúng một bản**: bảng tĩnh nằm ở backend vì backend là nơi validate `bank_code` lúc lưu. Giao diện đọc qua `GET /banks` (A0) chứ **không được chép lại mảng ngân hàng vào mã frontend**. Bản chép thứ hai sẽ lệch — lệch thiếu thì chủ quán không chọn được ngân hàng của mình, lệch thừa thì bấm Lưu ăn 422 `UNKNOWN_BANK_CODE`. Đây là lỗi đã từng xảy ra thật: frontend chép 20/40 ngân hàng, khiến PVcomBank, SCB, Timo, NCB, VietBank… không cấu hình được.

---

## D10 — Module ngân hàng mô phỏng

**Decision**: `src/routes/sandbox-bank.routes.ts` + `src/services/sandbox-bank/`, chỉ mount khi `env.sandboxBank.enabled`. Trang thanh toán là HTML dựng phía server, không cần build frontend.

Module này **chỉ được phép import**: `env`, `logger`, và một HTTP client. **Cấm import** `payment.service`, `booking.service`, hay bất kỳ entity nào. Nó gọi webhook của chính hệ thống qua HTTP như một bên thứ ba thật sự.

**Rationale**: FR-031 — gỡ cả thư mục đi thì luồng thanh toán vẫn chạy. Ràng buộc import là cách duy nhất biến điều đó thành sự thật kiểm chứng được thay vì một lời hứa.

**Hai yêu cầu giao diện đã chốt ở clarification**: số tiền điền sẵn và không sửa được (FR-028a); nút xác nhận khoá ngay sau lần bấm đầu (FR-028b).

---

## D11 — Mã QR mẫu luôn thật (FR-006a)

**Decision**: Mã QR mẫu gọi thẳng `buildVietQrPayload()` với `amount = 10000`, `memo = 'RCFIELD TEST'`. **Không đi qua factory cổng thanh toán**, nên không chịu ảnh hưởng của `env.sandboxBank.enabled`.

**Rationale**: Nếu mã mẫu cũng bị thay bằng mã mô phỏng thì việc quét thử chỉ hiển thị lại đúng dữ liệu chủ quán vừa gõ — hàng rào an toàn duy nhất của US2 trở thành hình thức. Tách nó khỏi đường cổng thanh toán là cách rẻ nhất để nó không bao giờ bị ảnh hưởng bởi cờ môi trường.

---

## D12 — Cập nhật màn hình khách

**Decision**: WebSocket qua `wsService.pushToUser(booking.customerId, ...)` — `processConfirmationResult` đã gọi `broadcastBookingUpdated` (`:1127`), nên không cần thêm sự kiện mới. Frontend dùng `useWebSocket` sẵn có (`src/features/notifications/hooks/useWebSocket.ts`).

**Dự phòng (FR-027)**: polling `GET /bookings/:id` mỗi 5 giây trong lúc trang QR đang chờ, dừng khi thành công hoặc hết hạn. SC-001 cho 5 giây, WebSocket đáp ứng ~1 giây; polling là lưới an toàn cho kịch bản demo, nơi rớt kết nối một lần là hỏng cả buổi.

---

## D13 — Chặn nhồi rác vào điểm nhận thông báo

**Decision**: `express-rate-limit` (đã có trong dependencies) áp lên `/payments/bank-webhook` và toàn bộ route mô phỏng. Sai khoá xác thực → 401 và **không ghi vào `bank_transactions`**.

**Rationale**: Điểm nhận thông báo là công khai theo bản chất. Ghi cả request sai khoá vào sổ sẽ biến sổ đối soát thành bãi rác và làm hỏng SC-002.

---

## D14 — Thông báo giao dịch treo (FR-018c)

**Decision**: Tái sử dụng `createNotification` + `wsService.pushToCafe(cafeId, ...)`. Gửi cho chủ chi nhánh và đẩy realtime xuống quầy.

---

## D15 — Phân quyền

**Decision**: `authenticate` + `authorize(...)` ở tầng router (Principle VI), cộng kiểm quyền sở hữu trong service.

### ⚠️ Cạm bẫy: `getManagedCafeOrThrow` cho STAFF đi qua

`cafe.service.ts:441–456` — hàm này chấp nhận **cả PROVIDER chủ sở hữu lẫn STAFF được phân công**. Dùng nó cho màn cấu hình tài khoản ngân hàng sẽ để nhân viên đọc và sửa được số tài khoản của chủ quán, vi phạm FR-009.

| Việc | Dùng hàm nào |
|---|---|
| Cấu hình nhận tiền (FR-009) | `assertCafeOwner(cafe, providerId)` — chỉ chủ |
| Sổ giao dịch đầy đủ (FR-025) | `assertCafeOwner` |
| Giao dịch treo cho nhân viên (FR-025a) | `isStaffAssignedToCafe(staffId, cafeId)` — `contest.helpers.ts:40` |
| ~~Bất kỳ việc nào ở trên~~ | ~~`getManagedCafeOrThrow`~~ |

`requireActiveProvider` áp cho các route ghi cấu hình, theo tiền lệ đã có.

---

## D16 — Test-first (Principle V, cổng cứng)

Logic đối soát quyết định tiền của khách có được ghi nhận hay không, nên rơi thẳng vào Principle V.

**`src/__tests__/services/bank-webhook.test.ts` phải được viết và xác nhận ĐỎ trước khi cài `matchBankTransaction`.** Các ca bắt buộc:

1. Rút mã tham chiếu từ nội dung có ký tự thừa hai bên (FR-017)
2. Nội dung không chứa mã → `NEEDS_REVIEW` / `NO_REF_CODE`, không booking nào đổi
3. Cùng `external_id` gửi 10 lần → 1 bản ghi, 1 lần xác nhận (FR-019, SC-003)
4. Hai `external_id` khác nhau cùng mã tham chiếu → khoản đầu xác nhận, khoản sau `OVERPAID` treo (FR-019a)
5. Thiếu tiền → không xác nhận (FR-018, SC-007)
6. Thừa tiền → xác nhận + ghi phần chênh (US3 kịch bản 3)
7. Booking đã quá `payment_expires_at` → treo, không xác nhận dù chỗ còn trống (FR-018b, SC-010)
8. Transaction ở trạng thái FAILED → treo, không xác nhận (D4)
9. Sai khoá xác thực → 401, không ghi sổ
10. Số tài khoản không thuộc chi nhánh nào → vẫn lưu, `UNKNOWN_ACCOUNT`, không gắn chi nhánh (US3 kịch bản 7)

Ca 7 và 8 là hai ca dễ tưởng đã có sẵn nhất — ca 7 đúng là đã có trong `processConfirmationResult`, nhưng ca 8 thì chưa, và cả hai chỉ đúng nếu D1 được tuân thủ.

---

## D17 — Lưu trữ và khối lượng

**Decision**: `bank_transactions` giữ vĩnh viễn, soft delete theo chuẩn dự án. Không phân vùng, không dọn tự động.

**Rationale**: Đây là sổ đối soát với sao kê ngân hàng — xoá đi là mất khả năng giải trình khi có tranh chấp. Khối lượng ở quy mô hiện tại là hàng nghìn hàng mỗi năm mỗi chi nhánh, không đáng để tối ưu sớm.

---

## Tổng hợp cạm bẫy

| # | Cạm bẫy | Hậu quả nếu vấp |
|---|---|---|
| 1 | Gọi `processMockConfirmation` thay vì `processConfirmationResult` | Mất guard hết hạn giữ chỗ và kiểm số tiền — vi phạm FR-018/018a/018b, không test nào bắt |
| 2 | Không siết nhánh `:723` khi `VNPAY_MOCK_ENABLED` bật | Booking chuyển khoản tự xác nhận trước khi hiện mã QR — tính năng vô nghĩa |
| 3 | Dùng `getManagedCafeOrThrow` cho cấu hình ngân hàng | Nhân viên đọc và sửa được số tài khoản của chủ quán |
| 4 | Đặt mã tham chiếu trên `bookings` thay vì `payment_transactions` | Mã QR cũ sống dai hơn phiên thanh toán → thu tiền hai lần |
| 5 | Chỉ kiểm `status === SUCCESS` mà quên `=== PENDING` | Transaction đã bị thay thế vẫn xác nhận được booking |
| 6 | Nới phép so sánh số tiền bên trong `processConfirmationResult` | Đổi hành vi luồng VNPay đang chạy, vi phạm FR-003 |
