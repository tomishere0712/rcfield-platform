# 08 - VNPay Booking Payment Flow

**Last updated**: 2026-06-08
**Status**: Implementation handoff

> Tai lieu nay danh cho nguoi tiep tuc hoan thien luong thanh toan booking bang VNPay.
> Doc kem `03-payment-engine.md` truoc khi update tien, booking status, hoac ledger.

---

## Muc tieu

Hoan tat luong:

1. Customer tao booking.
2. BE tao payment transaction dang `PENDING`.
3. FE lay payment URL va redirect sang VNPay.
4. VNPay redirect customer ve return URL.
5. VNPay goi IPN/callback ve BE.
6. BE verify chu ky, cap nhat DB trong transaction.
7. FE hien thi ket qua thanh toan va booking da duoc confirm.

---

## Hien trang BE da co

Trong `rcfield-be`, da co gateway adapter co ban:

| Endpoint | Auth | Muc dich |
|----------|------|----------|
| `POST /api/v1/payments/vnpay/create-url` | Bearer token | Tao URL thanh toan VNPay |
| `GET /api/v1/payments/vnpay/return` | Public | VNPay redirect customer ve sau khi thanh toan |
| `GET /api/v1/payments/vnpay/ipn` | Public | VNPay server-to-server callback |

File lien quan:

- `src/config/env.ts`: expose `env.vnpay`
- `src/services/vnpay.service.ts`: tao payment URL, sign HMAC SHA512, verify params
- `src/controllers/vnpay.controller.ts`: create URL, return handler, IPN handler
- `src/routes/vnpay.routes.ts`: route VNPay
- `src/validate/index.ts`: `CreateVnpayPaymentSchema`

Phan nay moi dung o muc gateway. Chua cap nhat booking/payment DB sau IPN.

---

## Env can dung

Local `.env` va `.env.example` phai co cung bo key:

```env
VNPAY_TMN_CODE=your-tmn-code
VNPAY_HASH_SECRET=your-hash-secret
VNPAY_URL=https://sandbox.vnpayment.vn/paymentv2/vpcpay.html
VNPAY_RETURN_URL=http://localhost:3000/api/v1/payments/vnpay/return
VNPAY_IPN_URL=http://localhost:3000/api/v1/payments/vnpay/ipn
VNPAY_LOCALE=vn
VNPAY_CURR_CODE=VND
```

Neu test that voi VNPay sandbox, `localhost` khong duoc VNPay goi tu ben ngoai. Can doi:

```env
VNPAY_RETURN_URL=https://<public-domain>/api/v1/payments/vnpay/return
VNPAY_IPN_URL=https://<public-domain>/api/v1/payments/vnpay/ipn
```

Vi du public domain co the la ngrok URL khi dev local, hoac domain deploy staging.

---

## Quy tac DB can dam bao

VNPay khong phai nguon quyet dinh duy nhat tren FE. Trang thai thanh toan chi duoc chap nhan khi BE verify IPN/return thanh cong.

BE can co it nhat cac record sau truoc khi redirect customer sang VNPay:

| Bang | Field can co | Ghi chu |
|------|--------------|---------|
| `bookings` | `id`, `status`, `payment_expires_at` | Ban dau `PENDING` |
| `payment_transactions` | `id`, `booking_id`, `gateway`, `gateway_transaction_id`, `amount`, `status`, `raw_payload` | Luu request/response gateway |
| `payment_components` | `booking_id`, `type`, `amount`, `status` | Theo `03-payment-engine.md` |

Neu schema hien tai chua co enum/status phu hop, can bo sung bang migration truoc khi noi IPN.

Trang thai de xuat:

```txt
payment_transactions.status:
PENDING | SUCCESS | FAILED | EXPIRED | INVALID_SIGNATURE

payment_transactions.gateway:
VNPAY
```

---

## Txn Ref

`vnp_TxnRef` phai unique va trace duoc ve DB.

Dinh dang de xuat:

```txt
BOOKING_<bookingId>_<paymentTransactionId>
```

Hoac neu muon ngan hon:

```txt
B_<paymentTransactionId>
```

Khong nen de FE tu tuong tao `txn_ref`. FE chi nen goi endpoint BE theo `booking_id`; BE tu tao transaction va `txn_ref`.

---

## BE can lam tiep

### 1. Doi create-url thanh booking-aware

Endpoint hien tai:

```txt
POST /api/v1/payments/vnpay/create-url
```

Body hien tai:

```json
{
  "amount": 100000,
  "txn_ref": "ORDER_123",
  "order_info": "Thanh toan don ORDER_123",
  "order_type": "other"
}
```

Can doi thanh:

```txt
POST /api/v1/bookings/:bookingId/payments/vnpay
```

Body de xuat:

```json
{
  "return_path": "/payment/result"
}
```

BE se:

1. Authenticate customer.
2. Kiem tra booking thuoc customer.
3. Kiem tra booking status la `PENDING`.
4. Kiem tra booking chua het `payment_expires_at`.
5. Tinh amount tu `payment_components`, khong tin amount tu FE.
6. Tao `payment_transactions` status `PENDING`.
7. Tao `txn_ref` tu transaction vua tao.
8. Goi `createPaymentUrl(...)`.
9. Tra ve `payment_url`.

Response de xuat:

```json
{
  "success": true,
  "data": {
    "booking_id": "uuid",
    "payment_transaction_id": "uuid",
    "payment_url": "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?...",
    "expires_at": "2026-06-08T08:30:00.000Z"
  }
}
```

### 2. IPN la nguon cap nhat DB chinh

Route:

```txt
GET /api/v1/payments/vnpay/ipn
```

Sau khi `verifyVnpayParams(req.query)`:

1. Neu signature sai:
   - Luu audit neu co the.
   - Tra `{ "RspCode": "97", "Message": "Invalid signature" }`.
2. Parse `txn_ref` de tim `payment_transactions`.
3. Neu khong tim thay:
   - Tra `{ "RspCode": "01", "Message": "Order not found" }`.
4. So sanh amount:
   - `vnp_Amount / 100` phai bang transaction amount trong DB.
   - Sai amount thi tra `{ "RspCode": "04", "Message": "Invalid amount" }`.
5. Neu transaction da `SUCCESS`:
   - Tra `{ "RspCode": "00", "Message": "Confirm Success" }` de idempotent.
6. Neu `vnp_ResponseCode === "00"` va `vnp_TransactionStatus === "00"`:
   - Trong DB transaction:
     - Update `payment_transactions.status = SUCCESS`.
     - Set `gateway_transaction_id = vnp_TransactionNo`.
     - Luu `bank_code`, `pay_date`, `raw_payload`.
     - Update payment components lien quan sang `HELD` hoac `CAPTURED` tuy phase.
     - Update `bookings.status = CONFIRMED`.
     - Giu/confirm slot da lock.
   - Tra `{ "RspCode": "00", "Message": "Confirm Success" }`.
7. Neu payment fail:
   - Update `payment_transactions.status = FAILED`.
   - Giu booking `PENDING` neu chua het han, hoac `CANCELLED` neu da timeout.
   - Tra `{ "RspCode": "02", "Message": "Payment failed" }`.

### 3. Return URL chi de dieu huong FE

Route:

```txt
GET /api/v1/payments/vnpay/return
```

Return URL co the verify params, nhung khong nen la noi duy nhat cap nhat DB vi browser redirect co the bi mat.

Return handler nen:

1. Verify signature.
2. Parse `txn_ref`.
3. Tim booking/payment transaction.
4. Redirect FE ve:

```txt
<FRONTEND_URL>/payment/result?gateway=vnpay&status=success&booking_id=<id>&txn_ref=<txnRef>
```

Neu fail:

```txt
<FRONTEND_URL>/payment/result?gateway=vnpay&status=failed&booking_id=<id>&txn_ref=<txnRef>&response_code=<code>
```

FE sau do goi API lay booking status that tu DB.

### 4. Them endpoint query ket qua thanh toan

FE can endpoint de polling/doc ket qua:

```txt
GET /api/v1/bookings/:bookingId/payment-status
```

Response de xuat:

```json
{
  "success": true,
  "data": {
    "booking_id": "uuid",
    "booking_status": "CONFIRMED",
    "payment_status": "SUCCESS",
    "amount": 300000,
    "gateway": "VNPAY",
    "gateway_transaction_id": "14123456",
    "paid_at": "2026-06-08T08:15:00.000Z"
  }
}
```

### 5. Xu ly timeout

Job timeout booking can:

1. Tim booking `PENDING` co `payment_expires_at < now`.
2. Neu khong co transaction `SUCCESS`:
   - Update booking `CANCELLED`.
   - Release slot lock.
   - Update transaction `EXPIRED`.
3. Neu IPN thanh cong den sau timeout:
   - Kiem tra rule nghiep vu. De xuat: neu booking da cancelled vi timeout thi tra refund/manual review, khong auto confirm.

---

## FE can goi nhu the nao

### 1. Tao booking

FE goi API tao booking nhu spec hien tai:

```txt
POST /api/v1/bookings
```

Response can co:

```json
{
  "success": true,
  "data": {
    "id": "booking-uuid",
    "status": "PENDING",
    "payment_expires_at": "2026-06-08T08:30:00.000Z",
    "payment_amount": 300000
  }
}
```

### 2. Tao URL VNPay

FE goi:

```txt
POST /api/v1/bookings/:bookingId/payments/vnpay
Authorization: Bearer <jwt>
```

Body:

```json
{
  "return_path": "/payment/result"
}
```

Response:

```json
{
  "success": true,
  "data": {
    "payment_url": "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?...",
    "payment_transaction_id": "uuid",
    "expires_at": "2026-06-08T08:30:00.000Z"
  }
}
```

### 3. Redirect sang VNPay

FE dung:

```ts
window.location.href = data.payment_url;
```

Khong mo popup neu chua can, vi redirect full page on dinh hon cho gateway.

### 4. Trang ket qua thanh toan

Route FE:

```txt
/payment/result
```

Doc query:

```txt
gateway=vnpay
status=success|failed
booking_id=<bookingId>
txn_ref=<txnRef>
response_code=<code>
```

Ngay khi load page, FE khong nen tin query string de hien "da thanh toan" vinh vien. FE can goi:

```txt
GET /api/v1/bookings/:bookingId/payment-status
```

Neu DB tra:

```txt
booking_status = CONFIRMED
payment_status = SUCCESS
```

Thi hien thanh toan thanh cong va link sang booking detail.

Neu DB van `PENDING`, FE polling moi 2-3 giay trong khoang 30 giay vi IPN co the ve cham:

```txt
PENDING -> hien "Dang xac nhan thanh toan..."
SUCCESS -> hien success
FAILED -> hien failed, cho nut thanh toan lai neu booking chua timeout
CANCELLED/EXPIRED -> hien het han thanh toan
```

---

## Mapping VNPay response code

Can luu ca `vnp_ResponseCode` va `vnp_TransactionStatus` vao `raw_payload`.

Xu ly toi thieu:

| Dieu kien | Ket qua |
|----------|---------|
| Signature invalid | Khong update booking, IPN `RspCode=97` |
| `vnp_ResponseCode=00` va `vnp_TransactionStatus=00` | Payment success |
| `vnp_ResponseCode!=00` | Payment failed/cancelled |
| Amount khong khop DB | Khong confirm, IPN `RspCode=04` |
| Transaction khong ton tai | IPN `RspCode=01` |
| Transaction da success | Tra success idempotent |

---

## Test checklist

- [ ] Tao booking `PENDING`, payment amount lay tu DB, khong lay tu FE.
- [ ] Create VNPay URL co `vnp_SecureHash`.
- [ ] Sai signature IPN khong update booking.
- [ ] IPN success update transaction `SUCCESS` va booking `CONFIRMED`.
- [ ] IPN fail update transaction `FAILED`, booking van `PENDING` neu chua timeout.
- [ ] IPN duplicate khong double-confirm, khong double ledger.
- [ ] Amount sai khong confirm.
- [ ] Return URL redirect dung FE route.
- [ ] FE payment result page polling DB, khong tin query string.
- [ ] Timeout job cancel booking neu khong co payment success.

---

## Viec can lam ngay tiep theo

1. Them migration/status cho `payment_transactions` neu schema hien tai chua du.
2. Implement endpoint booking-aware `POST /api/v1/bookings/:bookingId/payments/vnpay`.
3. Update IPN handler de cap nhat DB trong transaction.
4. Update return handler de redirect kem `booking_id`.
5. Them `GET /api/v1/bookings/:bookingId/payment-status`.
6. FE noi nut thanh toan vao endpoint booking-aware.
7. FE tao `/payment/result` polling DB va hien ket qua.
