# API Contracts: Thanh toán chuyển khoản theo từng chi nhánh

**Feature**: `019-cafe-bank-payment` · **Date**: 2026-08-11 · **Phase**: 1

Base: `/api/v1`. Mọi lỗi theo `AppError(message, statusCode, code)` sẵn có.

**Tổng**: 10 endpoint mới, 1 thay đổi tương thích ngược trên endpoint có sẵn, 2 route mô phỏng tắt được.

---

## A0. `GET /banks` — công khai

Bảng tra ngân hàng hỗ trợ VietQR, để giao diện dựng ô chọn ở màn cấu hình nhận tiền.

```json
{
  "success": true,
  "data": {
    "banks": [
      { "code": "ABBANK", "name": "ABBANK" },
      { "code": "ACB", "name": "ACB" },
      { "code": "AGR", "name": "Agribank" }
    ]
  }
}
```

- Nguồn: hằng `VIETQR_BANKS` trong `src/services/vietqr.ts` — **cùng bảng mà A3 dùng để validate**. Giao diện tuyệt đối không chép lại danh sách này: hai bản sao lệch nhau thì chủ quán dùng ngân hàng bị thiếu không cấu hình được, dù hệ thống thừa sức dựng QR cho họ.
- **Không trả `bin`.** BIN là thứ đi thẳng vào chuỗi QR, giao diện không cần biết.
- Sắp theo tên (`localeCompare` tiếng Việt). Tĩnh hoàn toàn — không chạm DB, không gọi mạng ngoài (D9), giao diện cache cả phiên.

---

## A. Cấu hình nhận tiền — PROVIDER chủ sở hữu

Router: `src/routes/bank-payment.routes.ts`
Middleware: `authenticate` → `authorize(UserRole.PROVIDER)` → (route ghi) `requireActiveProvider`
Service dùng `assertCafeOwner`. **Không dùng `getManagedCafeOrThrow`** — nó cho STAFF đi qua.

### A1. `GET /cafes/:cafeId/payment-settings`

Đọc cấu hình nhận tiền.

```json
{
  "success": true,
  "data": {
    "method": "BANK_TRANSFER",
    "bank_code": "VCB",
    "bank_name": "Vietcombank",
    "account_number": "****3210",
    "account_name": "BUI TRONG TRI",
    "is_verified": true,
    "verified_at": "2026-08-11T03:12:00.000Z"
  }
}
```

- Chi nhánh chưa cấu hình → `data: null`, HTTP 200 (không phải 404).
- `account_number` **luôn che** ở endpoint này (FR-010). Số đầy đủ chỉ trả ở A2.

### A2. `GET /cafes/:cafeId/payment-settings/edit`

Số tài khoản đầy đủ, phục vụ màn chỉnh sửa. Tách riêng để số đầy đủ không lọt vào phản hồi mà giao diện chỉ hiển thị.

### A3. `PUT /cafes/:cafeId/payment-settings`

```json
{
  "method": "BANK_TRANSFER",
  "bank_code": "VCB",
  "account_number": "0123453210",
  "account_name": "BUI TRONG TRI"
}
```

- `method = 'BANK_TRANSFER'` bắt buộc có đủ ba trường ngân hàng.
- `bank_code` phải nằm trong danh sách BIN tĩnh (chính là danh sách A0 trả về); sai → 422 `UNKNOWN_BANK_CODE`.
- **Luôn ghi `is_verified = false`** khi `bank_code` hoặc `account_number` đổi (FR-008).
- Phản hồi giống A1, kèm `"is_verified": false`.

| Mã lỗi | HTTP | Khi nào |
|---|---|---|
| `FORBIDDEN` | 403 | không phải chủ chi nhánh |
| `UNKNOWN_BANK_CODE` | 422 | mã ngân hàng không có trong danh sách |
| `BANK_DETAILS_REQUIRED` | 400 | chọn BANK_TRANSFER mà thiếu trường |

### A4. `GET /cafes/:cafeId/payment-settings/sample-qr`

Mã QR mẫu để chủ quán tự quét kiểm tra (FR-006).

```json
{
  "success": true,
  "data": {
    "qr_payload": "00020101021238…",
    "qr_image_data_url": "data:image/png;base64,…",
    "amount": 10000,
    "memo": "RCFIELD TEST"
  }
}
```

⚠️ **Luôn là mã ngân hàng thật, kể cả khi `SANDBOX_BANK_ENABLED=true`** (FR-006a). Endpoint này gọi thẳng bộ dựng VietQR, không đi qua factory cổng thanh toán.

### A5. `POST /cafes/:cafeId/payment-settings/verify`

Chủ quán xác nhận đã quét thử và thấy đúng tên mình.

Body rỗng. Đặt `is_verified = true`, `verified_at = now()`, `verified_by = req.user.userId`.

- Chưa có cấu hình BANK_TRANSFER → 400 `NOTHING_TO_VERIFY`.
- Từ lần gọi này chi nhánh mới thực sự nhận chuyển khoản.

---

## B. Điểm nhận thông báo tiền về — công khai, xác thực bằng khoá

### B1. `POST /payments/bank-webhook`

**Không có `authenticate`.** Xác thực bằng header, đúng cách dịch vụ đối soát làm việc.

```
Authorization: Apikey <BANK_WEBHOOK_API_KEY>
Content-Type: application/json
```

Payload — bám đúng định dạng SePay để chuyển sang dịch vụ thật không phải sửa mã (FR-029, SC-005):

```json
{
  "id": 92704,
  "gateway": "Vietcombank",
  "transactionDate": "2026-08-11 14:02:37",
  "accountNumber": "0123453210",
  "content": "RCF7K2M9 chuyen tien",
  "transferType": "in",
  "transferAmount": 350000,
  "referenceCode": "MBVCB.3278907687",
  "accumulated": 19077000,
  "subAccount": null,
  "code": null,
  "description": ""
}
```

**Phản hồi — luôn 200 khi khoá hợp lệ** (FR-021), kể cả khi không khớp booking nào. Trả khác 200 sẽ khiến dịch vụ đối soát gửi lại vô hạn.

```json
{ "success": true, "matched": true, "booking_id": "…" }
```

| Tình huống | HTTP | Body | Ghi sổ |
|---|---|---|---|
| Khớp sạch | 200 | `matched: true` | `MATCHED` |
| Thừa tiền | 200 | `matched: true` | `MATCHED` / `OVERPAID` |
| Không có mã, sai mã, thiếu tiền, đã trả, hết hạn | 200 | `matched: false` | `NEEDS_REVIEW` + lý do |
| `transferType != "in"` | 200 | `ignored: true` | không ghi |
| Trùng `external_id` | 200 | `duplicate: true` | không ghi thêm |
| Sai/thiếu khoá | **401** | `INVALID_WEBHOOK_KEY` | **không ghi** (D13) |

**Thứ tự xử lý bắt buộc** (mỗi bước sai là một lỗ tiền bạc):

1. Xác thực khoá → sai thì 401, dừng, không ghi gì
2. Bỏ qua nếu không phải tiền vào
3. Chống trùng theo `(gateway, external_id)` → đã có thì 200 và dừng
4. Tra chi nhánh theo `accountNumber` → không ra thì ghi `UNKNOWN_ACCOUNT`, dừng
5. Rút mã tham chiếu bằng regex `/RCF[0-9A-Z]{5}/` — **dò tìm, không so khớp toàn chuỗi** (FR-017)
6. Tra `payment_transactions` theo `payment_ref_code`
7. **Kiểm `tx.status === PENDING`** — SUCCESS → `ALREADY_PAID`, FAILED → `SESSION_REPLACED` (D4)
8. So số tiền: nhỏ hơn → `SHORT_PAID` dừng; lớn hơn → ghi `OVERPAID` rồi đi tiếp
9. Gọi `processConfirmationResult` với `amount = tx.amount`
10. `rspCode '99'` trả về (booking hết hạn) → ghi `BOOKING_EXPIRED`, **không** xác nhận
11. Ghi sổ kết quả cuối, đẩy thông báo nếu `NEEDS_REVIEW`

⚠️ Bước 9 gọi **`processConfirmationResult`** (`payment.service.ts:879`), **không phải** `processMockConfirmation` (`:1142`) — hàm sau thiếu cả kiểm số tiền lẫn guard hết hạn.

Rate limit: 120 req/phút mỗi IP.

---

## C. Sổ đối soát

### C1. `GET /cafes/:cafeId/bank-transactions` — PROVIDER chủ sở hữu

Query: `?status=MATCHED|NEEDS_REVIEW|IGNORED&page=1&limit=20`

```json
{
  "success": true,
  "data": {
    "items": [{
      "id": "…", "amount": 350000, "content": "RCF7K2M9 chuyen tien",
      "ref_code": "RCF7K2M9", "transaction_date": "2026-08-11T14:02:37.000Z",
      "match_status": "NEEDS_REVIEW", "match_reason": "BOOKING_EXPIRED",
      "booking_id": null, "resolved_by": null
    }],
    "total": 42,
    "summary": { "matched_total": 12500000, "needs_review_count": 3 }
  }
}
```

### C2. `GET /cafes/:cafeId/bank-transactions/pending` — STAFF được phân công

Hàng đợi xử lý của nhân viên (FR-025a).

- Guard: `isStaffAssignedToCafe(staffId, cafeId)` — `contest.helpers.ts:40`.
- **Chỉ trả `match_status = 'NEEDS_REVIEW'`**, không phân trang theo trạng thái khác.
- **Không có trường `summary`** — FR-025b cấm nhân viên thấy mọi con số tổng.
- Loại bỏ hàng có `match_reason = 'UNKNOWN_ACCOUNT'` (FR-025c).
- PROVIDER gọi endpoint này cũng được, tiện dùng chung giao diện.

### C3. `POST /bank-transactions/:id/assign` — PROVIDER chủ sở hữu hoặc STAFF được phân công

```json
{ "booking_id": "…", "note": "Khách chuyển sai nội dung, đã đối chiếu sao kê" }
```

- Chỉ gán được giao dịch đang `NEEDS_REVIEW`; khác → 409 `TRANSACTION_ALREADY_RESOLVED`.
- Booking phải đang chờ thanh toán và số tiền phải khớp; lệch → 400 `AMOUNT_MISMATCH`.
- Chạy đúng bước 7–10 của B1, nên **cũng không xác nhận được booking đã hết hạn** — vẫn phải hoàn tiền tay. Đây là ràng buộc FR-018b, không phải thiếu sót.
- Ghi `resolved_by`, `resolved_at`, `resolution_note`.

### C4. `POST /bank-transactions/:id/ignore` — PROVIDER chủ sở hữu

```json
{ "note": "Tiền chuyển nhầm từ người quen, đã hoàn" }
```

`note` bắt buộc. Nhân viên **không** gọi được endpoint này — đánh dấu một khoản tiền là không liên quan là quyết định của chủ.

---

## D. Route ngân hàng mô phỏng — tắt được, không lên thật

Mount **chỉ khi** `SANDBOX_BANK_ENABLED=true`. Khi tắt: router không được đăng ký → 404 tự nhiên, không phải chặn bằng middleware (FR-030).

### D1. `GET /sandbox-bank/pay?ref=RCF7K2M9`

Trả HTML dựng phía server, giao diện app ngân hàng: tên chủ tài khoản, số tài khoản, số tiền, nội dung, nút "Xác nhận chuyển khoản".

- Số tiền **điền sẵn và không sửa được** (FR-028a).
- Nút **khoá ngay sau lần bấm đầu** (FR-028b).
- Có nhãn rõ "Giao dịch mô phỏng" (FR-032a).
- `ref` không tồn tại → trang báo lỗi thân thiện, không phải JSON.

### D2. `POST /sandbox-bank/transfer`

```json
{ "ref": "RCF7K2M9" }
```

Gọi `POST /payments/bank-webhook` **qua HTTP** với payload định dạng SePay và header `Authorization: Apikey`, `gateway: 'SANDBOX'`.

⚠️ Module này **không được import** `payment.service`, `booking.service` hay bất kỳ entity nào (FR-031, D10). Gỡ cả thư mục đi thì luồng thanh toán vẫn phải chạy.

Rate limit: 30 req/phút mỗi IP.

---

## E. Thay đổi trên endpoint có sẵn

### E1. `POST /bookings/:id/checkout` — tương thích ngược

**Hiện tại**: `booking.controller.ts:120` gọi `createCheckoutUrl(bookingId, ipAddr, req.body?.return_url)` — không truyền cổng, nên luôn là `'vnpay'`.

**Sau thay đổi**: nhận thêm `payment_method` tuỳ chọn trong body.

```json
{ "return_url": "…", "payment_method": "bank_transfer" }
```

| `payment_method` | Hành vi |
|---|---|
| vắng mặt | **`'vnpay'` — y hệt hiện tại, không đổi gì** |
| `"vnpay"` | như hiện tại |
| `"bank_transfer"` | cổng chuyển khoản, nếu chi nhánh có bật |

Chọn `bank_transfer` khi chi nhánh không bật → 400 `PAYMENT_METHOD_UNAVAILABLE`.

**Phản hồi bổ sung trường** (các trường cũ giữ nguyên vị trí và ý nghĩa):

```json
{
  "payment_url": "https://app…/payment/bank-transfer/b_abc…",
  "txn_ref": "b_abc…",
  "total_amount": 350000,
  "flow": "bank_transfer",
  "bank_transfer": {
    "qr_payload": "00020101021238…",
    "qr_image_data_url": "data:image/png;base64,…",
    "ref_code": "RCF7K2M9",
    "bank_name": "Vietcombank",
    "account_number": "0123453210",
    "account_name": "BUI TRONG TRI",
    "amount": 350000,
    "expires_at": "2026-08-11T14:32:00.000Z"
  }
}
```

`flow` là `"redirect"` cho VNPay. Frontend hiện **chưa đọc trường này ở đâu cả** — thêm vào là an toàn, và nhánh mặc định phải là chuyển hướng để hành vi cũ không đổi (FR-003).

### E2. `GET /cafes/:cafeId/payment-methods` — công khai

Danh sách phương thức khả dụng, để màn thanh toán biết có cần hiện phần chọn hay không (FR-004c).

```json
{ "success": true, "data": { "methods": ["vnpay", "bank_transfer"] } }
```

Chi nhánh chưa cấu hình → `["vnpay"]`. Một phần tử → frontend đi thẳng, không hiện lựa chọn.

---

## Bảng phân quyền

| Endpoint | CUSTOMER | STAFF | PROVIDER chủ | PROVIDER khác | ADMIN |
|---|---|---|---|---|---|
| A1–A5 cấu hình | ✗ | **✗** | ✓ | ✗ | ✗ |
| B1 webhook | — chỉ khoá API — |
| C1 sổ đầy đủ | ✗ | **✗** | ✓ | ✗ | ✗ |
| C2 hàng đợi treo | ✗ | ✓ được phân công | ✓ | ✗ | ✗ |
| C3 gán tay | ✗ | ✓ được phân công | ✓ | ✗ | ✗ |
| C4 bỏ qua | ✗ | **✗** | ✓ | ✗ | ✗ |
| D1–D2 mô phỏng | — công khai, tắt được — |
| E1 checkout | ✓ chủ booking | ✗ | ✗ | ✗ | ✗ |
| E2 phương thức | ✓ công khai | ✓ | ✓ | ✓ | ✓ |

ADMIN **không** có quyền xem cấu hình ngân hàng hay sổ giao dịch của chi nhánh — nhất quán với quyết định ở feature 018 rằng tài chính của chủ doanh nghiệp là riêng tư với nền tảng.

---

## Biến môi trường

| Biến | Mặc định | Ghi chú |
|---|---|---|
| `SANDBOX_BANK_ENABLED` | `false` | bật ở mọi môi trường được (quyết định clarification) |
| `BANK_WEBHOOK_API_KEY` | — | bắt buộc khi một trong hai cờ trên bật |

Ghi rõ trạng thái bật/tắt vào nhật ký khởi động (FR-030a).
