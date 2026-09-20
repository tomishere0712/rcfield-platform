# Quickstart: Quản lý thu chi giải đấu

**Feature**: `018-contest-finance` | **Date**: 2026-08-08 | **Phase**: 1

---

## Chuẩn bị

```bash
cd rcfeild-be
npm run migration:run          # chạy 1785700000000-ContestLedgerAndEntryFeeMethod
npm run dev                    # http://localhost:3000

cd ../rcfield-fe
npm run dev                    # http://localhost:5173
```

Tài khoản seed (`npm run seed`, mật khẩu `123456`): `provider@gmail.com`, `staff@gmail.com`, `customer@gmail.com`.

Cần một giải thuộc `provider@gmail.com` với vài đăng ký ở trạng thái thanh toán khác nhau — `npm run seed:contests` dựng sẵn.

---

## Kịch bản E2E

### S1 — Báo cáo rỗng không vỡ

Tạo giải mới, chưa ai đăng ký, chưa mua gói. Mở tab **Tài chính**.

✅ Mọi số bằng 0, hiện hướng dẫn bắt đầu ghi khoản thu chi. **Không** phải `404`, không phải màn trắng.

### S2 — Lệ phí gom tự động

Giải lệ phí 200.000đ: 6 đăng ký `MARKED_PAID`, 3 `PENDING_PAYMENT`, 1 `WAIVED`.

✅ Đã thu 1.200.000đ · Chờ thu 600.000đ · Đã miễn 200.000đ
✅ `summary.total_income` = 1.200.000đ — **không** cộng khoản miễn

### S3 — `PENDING_REVIEW` nằm ở chờ thu

Chuyển một đăng ký sang `PENDING_REVIEW`.

✅ Rơi vào *chờ thu*, không phải *đã thu* ([D8](./research.md#d8--ánh-xạ-trạng-thái-thanh-toán-vào-nhóm-báo-cáo))

### S4 — Đổi lệ phí giữa chừng không làm sai số cũ

Sau khi 6 người đã đóng 200.000đ, sửa `contests.entry_fee` thành 500.000đ. Tải lại báo cáo.

✅ Đã thu vẫn **1.200.000đ**, không nhảy lên 3.000.000đ

Đây là bẫy Nguyên tắc I. Sai ở đây nghĩa là code đang đọc `contests.entry_fee` thay vì `contest_registrations.entry_fee_amount` ([D7](./research.md#d7--lệ-phí-đọc-từ-contest_registrationsentry_fee_amount-tuyệt-đối-không-từ-contestsentry_fee)).

### S5 — Phí tổ chức vào phần chi, không sửa được

Mua gói tổ chức 500.000đ, để admin xác nhận đã nhận tiền.

✅ Phần chi có dòng *Phí tổ chức giải* 500.000đ
✅ Dòng đó **không có** nút sửa/xoá (FR-013)
✅ Đơn ở trạng thái `PENDING_REVIEW` thì **chưa** xuất hiện — chỉ `PAID` mới tính

### S6 — Nhân viên ghi chi phí phát sinh

Đăng nhập `staff@gmail.com`, giải **đang chạy**, ghi 150.000đ / lý do "mua pin dự phòng".

✅ Lưu thành công
✅ Bỏ trống lý do → chặn, báo lý do bắt buộc (FR-020)
✅ Provider mở tab Tài chính thấy khoản đó kèm tên người ghi

### S7 — Cửa sổ thời gian của nhân viên

Cùng nhân viên đó, giải ở trạng thái **đóng đăng ký** (chưa chạy).

✅ `409 CONTEST_LEDGER_STAFF_WINDOW_CLOSED`, thông báo chỉ rõ khoản này phải do chủ doanh nghiệp ghi (FR-019a)
✅ Lặp lại khi giải đã **hoàn thành** → cũng bị chặn

### S8 — Nhân viên không chạm được vào tiền vào

Gọi thẳng API bằng token nhân viên với `direction: "IN"`.

✅ `403 CONTEST_LEDGER_STAFF_INCOME_FORBIDDEN`
✅ Trên giao diện không có lối vào nào để chọn chiều thu

### S9 — Nhân viên không thấy số tổng

Nhân viên mở danh sách bút toán của mình.

✅ Chỉ thấy bút toán do chính mình tạo, không thấy của người khác
✅ Không có bất kỳ con số tổng nào trên màn hình (FR-021)
✅ Gọi thẳng `GET /contests/:id/finance` bằng token nhân viên → `403`

### S10 — Quản trị viên nền tảng bị chặn

Đăng nhập `admin@gmail.com`, gọi `GET /contests/:contestId/finance`.

✅ `403 FORBIDDEN` (FR-017a)

Đây là điểm khác biệt có chủ đích so với phần còn lại của hệ thống — quản trị viên xem được đơn phí tổ chức nhưng **không** xem được sổ thu chi. Sai ở đây nghĩa là code đã tái dùng nhầm guard ([D5](./research.md#d5--guard-mới-assertcontestfinanceowner-không-tái-dùng-guard-sẵn-có)).

### S11 — Thu ngoài lệ phí và tiền thưởng

Provider ghi: thu *Tài trợ RC Shop* 2.000.000đ; chi *Tiền thưởng hạng nhất* 1.500.000đ.

✅ Tổng thu +2.000.000đ, tổng chi +1.500.000đ, ròng đổi đúng 500.000đ
✅ Khoản thưởng nằm trong nhóm `PRIZE_CASH` khi xem chi theo loại

### S12 — Sửa và xoá

Sửa 1.500.000đ → 1.200.000đ, rồi xoá một khoản khác.

✅ Báo cáo tính lại ngay, không cần reload thủ công (FR-015)
✅ Tab **Nhật ký** hiện `ledger.entry_updated` với giá trị trước và sau (FR-026)
✅ Khoản đã xoá biến khỏi báo cáo nhưng vẫn có `ledger.entry_deleted` trong nhật ký
✅ `PATCH` lại bút toán đã xoá → `404`

### S13 — Số tiền không hợp lệ

Nhập `0` rồi `-100000`.

✅ Cả hai bị chặn, thông báo gợi ý tạo khoản chiều ngược lại nếu muốn ghi giảm (US3 kịch bản 5)

### S14 — Cách ly giữa các chủ doanh nghiệp

Đăng nhập `provider_other@gmail.com`, gọi API sổ thu chi của giải thuộc `provider@gmail.com`.

✅ `403` ở cả đọc lẫn ghi (FR-024)

### S15 — Đối soát phương thức thu

Một người trả qua VNPay, một người trả tiền mặt (nhân viên đánh dấu, chọn *Tiền mặt*).

✅ Báo cáo tách `ONLINE` và `CASH` riêng, cộng lại bằng tổng đã thu
✅ Đăng ký cũ có sẵn trong DB rơi vào nhóm *chưa rõ phương thức* (FR-029)
✅ Đánh dấu đã thu mà không chọn phương thức → `400` (FR-028)

### S16 — Miễn lệ phí không đòi phương thức

Miễn lệ phí cho một đăng ký.

✅ Không hỏi phương thức thu
✅ `entry_fee_payment_method` của đăng ký đó về `NULL`

Bẫy: `ContestMarkFeePaidSchema` đang dùng chung cho cả hai handler. Nếu quên tách schema, kịch bản này sẽ đòi `payment_method` một cách vô lý ([contracts §8](./contracts/api.md#8-️-thay-đổi-phá-vỡ--post-contest-registrationsregistrationidmark-entry-fee-paid)).

### S17 — Đăng ký huỷ

Huỷ một đăng ký `PENDING_PAYMENT`, và một đăng ký `MARKED_PAID`.

✅ Cái chưa trả tiền biến mất khỏi cả ba nhóm (FR-009a)
✅ Cái đã trả tiền **vẫn** ở nhóm đã thu

### S18 — Ảnh chứng từ

Upload ảnh JPG cho một khoản chi.

✅ Trả URL Cloudinary, hiện thumbnail trên dòng bút toán
✅ Upload file PDF → `422 UNSUPPORTED_FORMAT`
✅ Upload file >5MB → bị multer chặn

---

## Checklist test backend

`src/__tests__/services/contest-finance.test.ts` — **viết trước, phải fail trước khi code** (Nguyên tắc V, [D14](./research.md#d14--test-viết-trước-cho-hàm-tổng-hợp-báo-cáo)):

- [ ] Lệ phí đọc từ `entry_fee_amount`, không từ `contests.entry_fee` (S4)
- [ ] `PENDING_REVIEW` → chờ thu (S3)
- [ ] `WAIVED` không cộng vào `total_income` (S2)
- [ ] Đăng ký huỷ chưa trả tiền bị loại khỏi mọi nhóm (S17)
- [ ] Đăng ký huỷ đã trả tiền vẫn ở đã thu (S17)
- [ ] Phí tổ chức chỉ tính đơn `PAID` (S5)
- [ ] `net` = `total_income` − `total_expense`, có phí tổ chức trong tổng chi
- [ ] Bút toán xoá mềm không lọt vào bất kỳ tổng nào (S12)
- [ ] `NULL` phương thức gom vào `UNKNOWN`, không vào `CASH` (S15)
- [ ] Cột `numeric` cộng đúng — không nối chuỗi ([bẫy TypeORM](./data-model.md#entity-srcmodelscontest-ledger-entryentityts))

`src/__tests__/routes/contest-finance.test.ts`:

- [ ] PROVIDER owner đọc được báo cáo
- [ ] PROVIDER khác → 403 (S14)
- [ ] STAFF → 403 (S9)
- [ ] ADMIN → 403 (S10)
- [ ] STAFF `direction: IN` → 403 (S8)
- [ ] STAFF ghi ngoài `RUNNING` → 409 (S7)
- [ ] STAFF thiếu `note` → 400 (S6)
- [ ] STAFF `PATCH`/`DELETE` → 403 (FR-022)
- [ ] `amount <= 0` → 400 (S13)
- [ ] `mark-entry-fee-paid` thiếu `payment_method` → 400 (S15)
- [ ] `waive-entry-fee` **không** đòi `payment_method` (S16)
- [ ] Giải rỗng → 200 với số 0, không 404 (S1)

```bash
cd rcfeild-be && npm test -- contest-finance
```

## Checklist test frontend

- [ ] Tab **Tài chính** chỉ hiện với PROVIDER sở hữu giải
- [ ] Số tiền định dạng VND không phần thập phân (FR-030)
- [ ] Toàn bộ nhãn tiếng Việt (FR-031)
- [ ] Sửa/xoá bút toán → invalidate query báo cáo, số cập nhật ngay (S12)
- [ ] Dòng phí tổ chức không render nút sửa/xoá (S5)
- [ ] Form nhân viên chỉ hiện khi giải đang chạy (S7)
- [ ] Dialog đánh dấu đã thu lệ phí có ô chọn phương thức, không cho gửi khi bỏ trống (S15)

---

## Các lỗi sẽ gặp nếu làm ẩu

| Triệu chứng | Nguyên nhân |
|---|---|
| Tổng tiền ra chuỗi dài vô lý như `"1500000200000"` | Quên `Number()` khi cộng cột `numeric` — TypeORM trả về chuỗi |
| Quản trị viên xem được báo cáo | Dùng `assertContestOperator` hoặc sao chép `getContestForProvider` thay vì guard mới ([D5](./research.md#d5--guard-mới-assertcontestfinanceowner-không-tái-dùng-guard-sẵn-có)) |
| Nhân viên xem được số tổng | Endpoint `/mine` trả kèm `meta.total` hoặc `summary` |
| Miễn lệ phí báo lỗi thiếu `payment_method` | Quên tách `ContestWaiveFeeSchema` khỏi `ContestMarkFeePaidSchema` |
| Doanh thu nhảy khi provider sửa mức lệ phí | Đọc `contests.entry_fee` thay vì snapshot trên registration |
| Tổng thu cao hơn thực tế đúng bằng khoản miễn | Cộng nhầm `waived_total` vào `total_income` |
| Migration fail giữa chừng | Có `ALTER TYPE` lọt vào — không được dùng native enum ([D2](./research.md#d2--category-là-varchar-kiểm-ở-tầng-zod-không-dùng-native-enum-của-postgres)) |
