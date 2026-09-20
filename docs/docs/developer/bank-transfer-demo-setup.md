# Chạy thử thanh toán chuyển khoản

Hướng dẫn dựng và kiểm thử tính năng nhận tiền chuyển khoản theo chi nhánh trên
máy của bạn. Spec đầy đủ: [`specs/019-cafe-bank-payment/`](../../specs/019-cafe-bank-payment/spec.md).

Cần **hai thiết bị**: máy tính chạy hệ thống, và một điện thoại **cùng mạng wifi**
để quét mã QR.

---

## 1. Lấy địa chỉ IP của máy bạn

Mã QR phải chứa địa chỉ mà **điện thoại** truy cập được. Dùng `localhost` là
hỏng: quét bằng điện thoại thì `localhost` trỏ về chính cái điện thoại đó, không
phải máy tính đang chạy backend.

**macOS**

```bash
ipconfig getifaddr en0 || ipconfig getifaddr en1
```

**Windows** — chạy `ipconfig` rồi lấy dòng `IPv4 Address` của card wifi đang dùng.

**Linux**

```bash
hostname -I | awk '{print $1}'
```

Kết quả dạng `192.168.x.x` hoặc `10.x.x.x`. Ghi lại, dưới đây gọi là `<IP-CỦA-BẠN>`.

---

## 2. Khai biến môi trường

Trong `rcfeild-be/.env`:

```bash
SANDBOX_BANK_ENABLED=true
BANK_WEBHOOK_API_KEY=<khoá của bạn>
API_BASE_URL=http://<IP-CỦA-BẠN>:3000
```

Sinh khoá bằng lệnh này rồi dán vào:

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

> ⚠️ Khoá **chỉ được dùng chữ và số ASCII**. Header HTTP không mang được ký tự có
> dấu — đặt khoá tiếng Việt thì bên mô phỏng ném lỗi ngay lúc gọi webhook, và
> triệu chứng là bấm nút xác nhận trên điện thoại không ra gì cả.

Backend từ chối khởi động nếu bật `SANDBOX_BANK_ENABLED` mà thiếu khoá — cố ý,
để lỗi hiện ra lúc khởi động chứ không phải lúc khách đang quét mã.

---

## 3. Khởi động và kiểm tra kết nối

```bash
cd rcfeild-be && npm run dev
```

Nhật ký khởi động phải có dòng:

```
[SandboxBank] ĐANG BẬT — mọi người quét mã QR đều tự xác nhận được booking...
```

Không thấy dòng này thì `SANDBOX_BANK_ENABLED` chưa vào; kiểm lại `.env` và
khởi động lại.

**Kiểm điện thoại có tới được máy tính không** — mở trình duyệt trên điện thoại:

```
http://<IP-CỦA-BẠN>:3000/api/v1/cafes
```

Ra dữ liệu JSON là được. Không ra thì:

- Hai thiết bị khác wifi
- Tường lửa máy tính chặn cổng 3000 (macOS: System Settings → Network → Firewall)
- Wifi bật chế độ cô lập thiết bị (hay gặp ở wifi quán, ký túc xá) — dùng điểm
  phát sóng từ điện thoại thay thế

---

## 4. Bật nhận chuyển khoản cho một chi nhánh

Đăng nhập tài khoản chủ doanh nghiệp:

1. **Cơ sở → chọn chi nhánh → QUẢN LÝ KINH DOANH → Nhận thanh toán**
2. Chọn ngân hàng, nhập số tài khoản và tên chủ tài khoản (viết không dấu)
3. Bấm **Lưu tài khoản**
4. Bấm **Xem mã QR mẫu**, quét bằng app ngân hàng để kiểm tra tên người nhận
5. Bấm **Tôi đã quét và xác nhận đúng tài khoản**

Chưa làm bước 5 thì chi nhánh vẫn dùng cổng thanh toán chung và màn thanh toán
sẽ **không hiện lựa chọn nào** — đó là hành vi đúng, không phải lỗi.

Mã QR mẫu luôn là mã ngân hàng thật kể cả khi chế độ mô phỏng đang bật. Nếu nó
cũng bị thay bằng mã mô phỏng thì việc quét thử chỉ hiển thị lại đúng dữ liệu vừa
gõ vào, và hàng rào chống gõ sai số tài khoản trở thành vô nghĩa.

---

## 5. Các bài kiểm thử

### Bài 1 — Vòng chính

1. Đặt lịch tại chi nhánh vừa bật, tới bước Thanh toán
2. Thấy **hai lựa chọn** → chọn **Chuyển khoản ngân hàng** → Xác nhận
3. Màn hình hiện mã QR, số tiền, nội dung `RCFxxxxx` và đồng hồ đếm ngược.
   **Chép lại mã** để dùng cho các bài sau
4. Quét mã bằng camera điện thoại → mở trang ngân hàng mô phỏng
5. Bấm **Xác nhận chuyển khoản**

✅ Máy tính **tự đổi** sang "Đã thanh toán" trong vài giây, không ai chạm vào.
Vào chi tiết đơn phải ghi "Đã thanh toán qua chuyển khoản ngân hàng".

### Bài 2 — Sổ đối soát

**Cơ sở → chi nhánh → Nhận thanh toán → Đối soát chuyển khoản**, lọc **Đã khớp**.

✅ Thấy khoản tiền vừa rồi. Đây là thứ đối chiếu được với sao kê ngân hàng.

### Bài 3 — Tiền về muộn phải treo

Bài quan trọng nhất về mặt tiền bạc.

Rút ngắn thời gian chờ cho dễ thử: đặt `PAYMENT_WINDOW_MINUTES=2` trong `.env`
rồi khởi động lại.

1. Đặt đơn mới, chọn chuyển khoản, chép mã `RCFyyyyy`
2. **Không quét.** Chờ hết đồng hồ đếm ngược
3. Mở trên điện thoại: `http://<IP-CỦA-BẠN>:3000/api/v1/sandbox-bank/pay?ref=RCFyyyyy`
4. Bấm xác nhận

✅ Đơn **không** được xác nhận. Khoản tiền nằm ở **Cần xử lý** với lý do
"Tiền về sau khi hết hạn giữ chỗ".

❌ Nếu đơn được xác nhận: hệ thống đang gọi nhầm hàm xác nhận. Báo ngay.

### Bài 4 — Không thu hai lần

1. Đặt đơn mới, chọn chuyển khoản, chép mã `RCFzzzzz`
2. Quay lại, đổi sang **VNPay**, thanh toán xong
3. Mở link mã cũ trên điện thoại, bấm xác nhận

✅ Đơn không bị thu thêm lần nữa. Khoản tiền vào **Cần xử lý** với lý do
"Khách đã đổi cách thanh toán".

### Bài 5 — Quyền của nhân viên

Đăng nhập tài khoản nhân viên được phân công vào chi nhánh đó, mở dashboard.

✅ Cuối trang có khối **"Tiền chuyển khoản chờ xử lý"**, ghép được khoản treo vào
đơn, nhưng **không thấy bất kỳ con số tổng nào** và không mở được sổ đầy đủ.

### Bài 6 — Tắt mô phỏng, phần thật vẫn chạy

Đặt `SANDBOX_BANK_ENABLED=false`, khởi động lại.

```bash
# Đường dẫn mô phỏng phải biến mất hoàn toàn
curl -o /dev/null -w "%{http_code}\n" \
  "http://localhost:3000/api/v1/sandbox-bank/pay?ref=RCF12345"     # → 404

# Điểm nhận thông báo tiền về vẫn hoạt động
curl -X POST http://localhost:3000/api/v1/payments/bank-webhook \
  -H "Authorization: Apikey $BANK_WEBHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"id":990099,"gateway":"SEPAY","transactionDate":"2026-08-11 23:00:00",
       "accountNumber":"<số tài khoản đã khai>","content":"RCFzzzzz",
       "transferType":"in","transferAmount":50000,"referenceCode":"T.1"}'   # → 200
```

✅ Đây là bài chứng minh phần đối soát là mã production, chỉ có ngân hàng là mô
phỏng. Gỡ hẳn thư mục `src/services/sandbox-bank/` đi thì hệ thống vẫn nhận được
tiền thật.

Nhớ bật lại `true` sau khi thử.

---

## Hỏng ở đâu thì xem gì

| Triệu chứng | Nguyên nhân thường gặp |
|---|---|
| Màn thanh toán không hiện lựa chọn phương thức | Chi nhánh chưa xác minh — làm lại mục 4 bước 5 |
| Điện thoại không mở được trang quét | Khác wifi, tường lửa, hoặc `API_BASE_URL` còn là `localhost` |
| Bấm xác nhận trên điện thoại không ra gì | Khoá API có ký tự tiếng Việt, hoặc backend chưa khởi động lại |
| Ra trang 404 sau khi bấm thanh toán | Frontend chưa nạp mã mới — tải lại trang |
| Đơn tự xác nhận ngay khi vừa hiện mã QR | `VNPAY_MOCK_ENABLED` đang rò sang luồng chuyển khoản — báo ngay, đây là lỗi |
| Backend không khởi động được | Bật `SANDBOX_BANK_ENABLED` mà thiếu `BANK_WEBHOOK_API_KEY` |

---

## Trước khi vận hành thương mại

Không thuộc phạm vi chạy thử, nhưng phải xong trước đồng tiền thật đầu tiên:

1. `SANDBOX_BANK_ENABLED=false` và xác nhận mọi đường dẫn mô phỏng trả 404
2. Đăng ký dịch vụ đối soát ngân hàng (SePay, Casso hoặc tương đương), khai địa
   chỉ webhook `https://<tên-miền>/api/v1/payments/bank-webhook` vào trang quản
   trị của họ
3. Đổi `BANK_WEBHOOK_API_KEY` sang khoá nhà cung cấp cấp — **không dùng lại khoá
   đã xuất hiện trong quá trình demo**
4. Buộc mọi chi nhánh khai lại tài khoản và quét thử mã QR mẫu lần nữa

Khi mô phỏng còn bật, **bất kỳ ai biết đường dẫn đều tự xác nhận được đơn mà
không trả đồng nào**. Chấp nhận được trong giai đoạn đồ án vì chưa có tiền thật
chạy qua hệ thống, nhưng không được để sót khi bàn giao.
