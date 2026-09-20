# Quickstart: Thanh toán chuyển khoản theo từng chi nhánh

**Feature**: `019-cafe-bank-payment` · **Date**: 2026-08-11 · **Phase**: 1

---

## Chuẩn bị

```bash
# rcfeild-be/.env
SANDBOX_BANK_ENABLED=true
BANK_WEBHOOK_API_KEY=<chuỗi ngẫu nhiên đủ dài>
```

```bash
cd rcfeild-be
npm run migration:run
npm run dev
```

Nhật ký khởi động phải hiện đúng một dòng trạng thái (FR-030a):

```
[SandboxBank] ENABLED — mọi môi trường đều nhận, tắt bằng SANDBOX_BANK_ENABLED=false
```

⚠️ `VNPAY_MOCK_ENABLED` bật hay tắt đều **không** được ảnh hưởng tới luồng chuyển khoản. Nếu bật mà booking chuyển khoản tự xác nhận ngay khi tạo mã QR, nhánh `payment.service.ts:723` chưa được siết.

---

## Kịch bản E2E

### Nhóm A — Cấu hình nhận tiền (US2)

**A1. Khai tài khoản, chi nhánh vẫn dùng VNPay**
Chủ quán mở cấu hình chi nhánh → thẻ "Nhận thanh toán" → chọn Vietcombank, nhập số tài khoản và tên → Lưu.
✅ Cấu hình lưu ở trạng thái **chưa xác minh**. `GET /cafes/:id/payment-methods` vẫn trả `["vnpay"]`. Đặt thử một booking → vẫn chuyển hướng VNPay.

**A2. Quét mã QR mẫu bằng điện thoại thật**
Bấm "Xem mã QR mẫu" → quét bằng camera điện thoại.
✅ Điện thoại mở **app ngân hàng thật**, hiện đúng tên chủ tài khoản do ngân hàng trả về, số tiền 10.000đ, nội dung `RCFIELD TEST`.
⚠️ Nếu ra trang mô phỏng thì FR-006a chưa được cài — hàng rào an toàn của cả US2 đang rỗng.

**A3. Xác nhận đã kiểm tra**
Bấm "Tôi đã quét và xác nhận đúng tài khoản".
✅ `is_verified = true`. `payment-methods` trả `["vnpay","bank_transfer"]`.

**A4. Đổi số tài khoản làm mất xác minh**
Sửa một chữ số trong số tài khoản → Lưu.
✅ Quay về chưa xác minh, `payment-methods` trả `["vnpay"]`. Phải quét thử lại.

**A5. Nhân viên bị chặn**
Đăng nhập tài khoản nhân viên của chính chi nhánh đó, gọi `GET /cafes/:id/payment-settings`.
✅ 403. ⚠️ Nếu 200 thì đang dùng `getManagedCafeOrThrow` — hàm đó cho STAFF đi qua.

**A6. Che số tài khoản**
✅ Màn hiển thị cho `****3210`; số đầy đủ chỉ xuất hiện ở endpoint chỉnh sửa.

---

### Nhóm B — Vòng thanh toán chính (US1)

**B1. Khách chọn phương thức**
Đặt lịch tại chi nhánh đã bật → tới bước thanh toán.
✅ Thấy **cả hai** lựa chọn, không cái nào chọn sẵn.

**B2. Chi nhánh chưa bật thì không hiện lựa chọn**
Đặt lịch tại chi nhánh chưa cấu hình.
✅ Đi thẳng VNPay, không hiện phần chọn phương thức (FR-004c). Đây là bài kiểm chứng SC-004.

**B3. ⭐ Vòng chính — quét là tự xác nhận**
Chọn chuyển khoản → trang hiện mã QR, số tiền, nội dung `RCFxxxxx`, đồng hồ đếm ngược.
Quét bằng **điện thoại khác** → mở trang ngân hàng mô phỏng → bấm "Xác nhận chuyển khoản".
✅ Trong ≤ 5 giây, **màn hình máy tính tự đổi sang "Đã thanh toán"** mà không ai chạm vào (SC-001). Booking `CONFIRMED`, `payment_components` được tạo, email xác nhận gửi đi.

**B4. Nút mô phỏng khoá sau lần bấm đầu**
Bấm nhanh hai lần trên trang mô phỏng.
✅ Lần thứ hai không có tác dụng (FR-028b).

**B5. Số tiền không sửa được**
Xem mã nguồn trang mô phỏng.
✅ Ô số tiền là văn bản tĩnh hoặc `readonly` (FR-028a).

**B6. Nhãn mô phỏng**
✅ Trang thanh toán có nhãn "Giao dịch mô phỏng" khi cờ đang bật (FR-032a).

**B7. Mất WebSocket vẫn nhận được**
Ngắt mạng vài giây sau khi bấm xác nhận rồi nối lại.
✅ Trang vẫn phát hiện trạng thái mới trong ≤ 10 giây nhờ polling (FR-027).

**B8. Hết hạn**
Mở trang QR, không chuyển khoản, chờ hết đồng hồ.
✅ Trang báo hết hạn và ngừng chờ; chỗ giữ được nhả như luồng hiện tại.

**B9. Ba trạng thái, không hơn**
✅ Trang QR chỉ có: đang chờ, thành công, hết hạn (FR-013a).

---

### Nhóm C — Đổi phương thức, không thu hai lần (FR-004a/b)

**C1. Đổi sang VNPay làm chết mã QR cũ**
Chọn chuyển khoản, chụp lại mã QR → quay lại → chọn VNPay.
✅ Transaction cũ chuyển `FAILED` với `reason: 'CHECKOUT_ATTEMPT_EXPIRED_OR_REPLACED'`.

**C2. ⭐ Tiền về theo mã QR đã chết**
Sau C1, thanh toán xong bằng VNPay, rồi mở lại đường dẫn mô phỏng của mã QR cũ và bấm xác nhận.
✅ Booking **không** bị đụng vào. Giao dịch vào sổ ở `NEEDS_REVIEW` / `SESSION_REPLACED`.
⚠️ Nếu booking bị xác nhận lần nữa hoặc tiền bị cộng dồn — D4 chưa được cài, khách đã bị thu hai lần. Đây là bài kiểm chứng SC-011.

**C3. Chuyển hai lần**
Gửi hai webhook với `external_id` khác nhau, cùng `ref_code`, cùng số tiền.
✅ Khoản đầu xác nhận booking (`MATCHED`); khoản sau `NEEDS_REVIEW` / `ALREADY_PAID`. Kiểm chứng SC-012.

---

### Nhóm D — Đối soát (US3)

Gửi webhook bằng `curl`:

```bash
curl -X POST http://localhost:3000/api/v1/payments/bank-webhook \
  -H "Authorization: Apikey $BANK_WEBHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"id":92704,"gateway":"Vietcombank","transactionDate":"2026-08-11 14:02:37",
       "accountNumber":"0123453210","content":"RCF7K2M9 chuyen tien",
       "transferType":"in","transferAmount":350000,"referenceCode":"MBVCB.327"}'
```

**D1. Chống trùng** — gửi cùng payload 10 lần.
✅ 1 bản ghi, 1 lần xác nhận, cả 10 lần đều trả 200 (SC-003).

**D2. Mất mã tham chiếu** — `content: "chuyen tien mua ca phe"`.
✅ 200 `matched:false`, sổ ghi `NO_REF_CODE`, không booking nào đổi.

**D3. Mã lẫn trong ký tự thừa** — `content: "CT DEN:520 RCF7K2M9 TU MB"`.
✅ Vẫn khớp — regex dò tìm, không so khớp toàn chuỗi (FR-017).

**D4. Thiếu tiền** — `transferAmount: 300000` cho booking 350.000đ.
✅ Booking **không** xác nhận. Sổ ghi `SHORT_PAID` (SC-007).

**D5. Thừa tiền** — `transferAmount: 400000`.
✅ Booking **có** xác nhận, sổ ghi `OVERPAID`, phần chênh hiện rõ.

**D6. ⭐ Tiền về sau khi hết hạn**
Để booking quá `payment_expires_at`, rồi gửi webhook đúng mã và đúng tiền.
✅ Booking **không** được xác nhận, kể cả khi chỗ vẫn còn trống. Sổ ghi `BOOKING_EXPIRED`, có thông báo cho chủ quán (SC-010).
⚠️ Nếu booking được xác nhận — đang gọi `processMockConfirmation` thay vì `processConfirmationResult`.

**D7. Không phải tiền vào** — `transferType: "out"`.
✅ 200, bỏ qua, không ghi sổ.

**D8. Sai khoá** — bỏ header `Authorization`.
✅ 401, **không** ghi vào sổ (nếu ghi thì sổ thành bãi rác, hỏng SC-002).

**D9. Tài khoản lạ** — `accountNumber` không thuộc chi nhánh nào.
✅ Vẫn lưu để không mất dấu vết, `cafe_id = NULL`, `UNKNOWN_ACCOUNT`. Chỉ chủ quán thấy.

**D10. Gán tay**
Chủ quán mở sổ, chọn giao dịch `NO_REF_CODE`, gán vào một booking đang chờ có số tiền khớp.
✅ Booking xác nhận, giao dịch thành `MATCHED`, ghi `resolved_by` + `resolved_at`.

**D11. Không gán được vào booking đã hết hạn**
✅ Từ chối — đúng ràng buộc FR-018b, phải hoàn tiền tay.

---

### Nhóm E — Phân quyền nhân viên (FR-025a/b/c)

**E1. Nhân viên chỉ thấy hàng đợi treo**
✅ Chỉ `NEEDS_REVIEW` của chi nhánh mình; không thấy giao dịch đã xử lý.

**E2. Nhân viên không thấy con số tổng**
Rà **toàn bộ** JSON trả về cho tài khoản nhân viên.
✅ Không có trường `summary`, không có tổng tiền nào (SC-013).

**E3. Nhân viên gán được**
✅ Thành công, `resolved_by` là chính nhân viên đó.

**E4. Nhân viên không bỏ qua được** — gọi `POST /bank-transactions/:id/ignore`.
✅ 403.

**E5. Nhân viên không thấy giao dịch tài khoản lạ**
✅ Hàng `UNKNOWN_ACCOUNT` không xuất hiện (FR-025c).

**E6. Nhân viên chi nhánh khác**
✅ 403.

---

### Nhóm F — Tắt mô phỏng (US4)

**F1.** `SANDBOX_BANK_ENABLED=false`, khởi động lại.
✅ `GET /api/v1/sandbox-bank/pay?ref=...` → **404**, không phải 403 hay trang trống (FR-030).

**F2.** Webhook vẫn hoạt động với `curl` thủ công.
✅ Booking vẫn xác nhận được — chứng minh phần thật không phụ thuộc phần mô phỏng (SC-005).

**F3. ⭐ Gỡ hẳn phần mô phỏng**
Đổi tên `src/services/sandbox-bank/` và `src/routes/sandbox-bank.routes.ts`, gỡ dòng mount.
✅ `npm run build` và `npm test` đều xanh (FR-031).

---

## Checklist test tự động

### Backend — `src/__tests__/services/bank-webhook.test.ts` ⚠️ VIẾT TRƯỚC, PHẢI ĐỎ

- [ ] Rút mã từ nội dung có ký tự thừa hai bên
- [ ] Không có mã → `NO_REF_CODE`, không booking nào đổi
- [ ] Cùng `external_id` × 10 → 1 bản ghi, 1 lần xác nhận
- [ ] Hai `external_id`, cùng mã → khoản đầu `MATCHED`, khoản sau `ALREADY_PAID`
- [ ] Thiếu tiền → không xác nhận, `SHORT_PAID`
- [ ] Thừa tiền → xác nhận, `OVERPAID`
- [ ] **Booking quá hạn → treo, `BOOKING_EXPIRED`, không xác nhận**
- [ ] **Transaction `FAILED` → treo, `SESSION_REPLACED`, không xác nhận**
- [ ] Sai khoá → 401, không ghi sổ
- [ ] Tài khoản lạ → vẫn lưu, `cafe_id = NULL`

### Backend — `src/__tests__/routes/bank-payment.test.ts`

- [ ] STAFF gọi A1–A5 → 403 (không dùng `getManagedCafeOrThrow`)
- [ ] PROVIDER khác chủ → 403 mọi endpoint
- [ ] ADMIN → 403 trên cấu hình và sổ
- [ ] Sửa số tài khoản → `is_verified` về false
- [ ] Chưa xác minh → `payment-methods` chỉ trả `["vnpay"]`
- [ ] Nhân viên: chỉ `NEEDS_REVIEW`, không `summary`, không `UNKNOWN_ACCOUNT`
- [ ] Nhân viên gọi `ignore` → 403
- [ ] `POST /bookings/:id/checkout` **không** kèm `payment_method` → hành vi VNPay y hệt trước
- [ ] Chọn `bank_transfer` khi chi nhánh chưa bật → 400
- [ ] **`bank_transfer` không tự xác nhận khi `VNPAY_MOCK_ENABLED=true`**

### Backend — `src/__tests__/services/vietqr.test.ts`

- [ ] Chuỗi sinh ra khớp mẫu EMVCo, CRC đúng
- [ ] Số tiền và nội dung nhúng đúng
- [ ] Mã ngân hàng lạ → ném lỗi
- [ ] Mã QR mẫu **không** đổi khi bật/tắt `SANDBOX_BANK_ENABLED`

### Frontend

- [ ] Một phương thức → không hiện phần chọn
- [ ] Hai phương thức → hiện, không chọn sẵn cái nào
- [ ] `flow: "redirect"` → chuyển hướng như cũ
- [ ] `flow: "bank_transfer"` → hiện trang QR
- [ ] Nhận sự kiện realtime → đổi trạng thái
- [ ] Polling dự phòng chạy khi mất kết nối
- [ ] Hết đếm ngược → trạng thái hết hạn, ngừng polling
- [ ] Số tài khoản che ở màn hiển thị

---

## Ba bài kiểm quyết định

Nếu chỉ chạy được ba bài, chạy ba bài này:

| Bài | Kiểm điều gì | Hỏng nghĩa là |
|---|---|---|
| **B3** | Quét là tự xác nhận | Cả tính năng không hoạt động |
| **D6** | Tiền về muộn thì treo | Đang gọi nhầm hàm xác nhận; tiền thật có thể vào mà chỗ đã mất |
| **C2** | Mã QR chết không thu được tiền | Khách bị thu hai lần |

---

## Trước khi vận hành thương mại

Không thuộc phạm vi triển khai, nhưng phải xong trước đồng tiền thật đầu tiên:

1. `SANDBOX_BANK_ENABLED=false` và xác nhận F1 trả 404
2. Đăng ký dịch vụ đối soát, khai địa chỉ webhook vào trang quản trị của họ
3. Đổi `BANK_WEBHOOK_API_KEY` sang khoá của nhà cung cấp — **không dùng lại khoá đã xuất hiện lúc demo**
4. Buộc mọi chi nhánh khai lại tài khoản và quét thử lại
