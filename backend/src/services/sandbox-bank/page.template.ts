/**
 * Trang thanh toán của ngân hàng mô phỏng, dựng phía server.
 *
 * Không dùng framework frontend: trang này phải mở được bằng camera điện thoại
 * bất kỳ mà không cần build gì, và phải sống độc lập với SPA để việc gỡ bỏ cả
 * module mô phỏng không kéo theo thay đổi nào bên frontend.
 */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatVnd(amount: number): string {
  return `${amount.toLocaleString('vi-VN')}đ`;
}

const BASE_STYLE = `
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
       background:#f1f5f9;color:#0f172a;min-height:100vh;display:flex;
       align-items:center;justify-content:center;padding:20px}
  .card{background:#fff;border-radius:20px;width:100%;max-width:420px;
        box-shadow:0 20px 50px rgba(15,23,42,.12);overflow:hidden}
  .bar{background:#0f4c81;color:#fff;padding:18px 22px}
  .bar h1{font-size:17px;font-weight:800;letter-spacing:.2px}
  .bar p{font-size:12px;opacity:.8;margin-top:2px}
  .sim{background:#fef3c7;color:#92400e;font-size:12px;font-weight:700;
       padding:9px 22px;border-bottom:1px solid #fde68a}
  .body{padding:22px}
  .row{display:flex;justify-content:space-between;gap:14px;padding:12px 0;
       border-bottom:1px solid #f1f5f9;font-size:14px}
  .row:last-of-type{border-bottom:0}
  .row span:first-child{color:#64748b}
  .row span:last-child{font-weight:700;text-align:right;word-break:break-word}
  .amount{font-size:28px;font-weight:900;color:#0f4c81;text-align:center;
          padding:18px 0 6px}
  .memo{text-align:center;font-size:12px;color:#64748b;padding-bottom:14px}
  button{width:100%;padding:15px;border:0;border-radius:12px;background:#0f4c81;
         color:#fff;font-size:15px;font-weight:800;cursor:pointer;margin-top:8px}
  button:disabled{background:#94a3b8;cursor:not-allowed}
  .note{font-size:11px;color:#94a3b8;text-align:center;margin-top:14px;
        line-height:1.5}
  .ok{text-align:center;padding:40px 22px}
  .ok .tick{width:64px;height:64px;border-radius:50%;background:#16a34a;
            color:#fff;font-size:34px;line-height:64px;margin:0 auto 16px}
  .ok h2{font-size:19px;font-weight:800;margin-bottom:8px}
  .ok p{font-size:13px;color:#64748b;line-height:1.6}
  .err{padding:36px 22px;text-align:center}
  .err h2{font-size:18px;font-weight:800;margin-bottom:10px}
  .err p{font-size:13px;color:#64748b;line-height:1.6}
`;

export interface SandboxPayPageInput {
  refCode: string;
  amount: number;
  bankName: string;
  accountNumber: string;
  accountName: string;
  /** Mã tra cứu đơn. `null` với khoản không gắn phiếu đặt sân. */
  bookingCode?: string | null;
}

export function renderPayPage(input: SandboxPayPageInput): string {
  const { refCode, amount, bankName, accountNumber, accountName, bookingCode } = input;

  return `<!doctype html>
<html lang="vi"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<title>Chuyển khoản · ${escapeHtml(bankName)}</title>
<style>${BASE_STYLE}</style>
</head><body>
<div class="card" id="card">
  <div class="bar">
    <h1>${escapeHtml(bankName)}</h1>
    <p>Xác nhận chuyển khoản</p>
  </div>
  <div class="sim">⚠️ Giao dịch mô phỏng — không có tiền thật được chuyển</div>
  <div class="body">
    <div class="amount">${formatVnd(amount)}</div>
    <div class="memo">Nội dung: <strong>${escapeHtml(refCode)}</strong></div>
    <div class="row"><span>Người nhận</span><span>${escapeHtml(accountName)}</span></div>
    <div class="row"><span>Số tài khoản</span><span>${escapeHtml(accountNumber)}</span></div>
    <div class="row"><span>Ngân hàng</span><span>${escapeHtml(bankName)}</span></div>
    <button id="pay" type="button">Xác nhận chuyển khoản</button>
    <p class="note">Số tiền và nội dung do bên bán ấn định, không sửa được.</p>
  </div>
</div>
<script>
  (function () {
    var button = document.getElementById('pay');
    var card = document.getElementById('card');
    var sent = false;

    button.addEventListener('click', function () {
      // Khoá ngay lần bấm đầu. Không có bước này, bấm nhanh hai lần sẽ tạo hai
      // giao dịch riêng biệt và khách bị trừ tiền hai lần.
      if (sent) return;
      sent = true;
      button.disabled = true;
      button.textContent = 'Đang xử lý…';

      fetch('/api/v1/sandbox-bank/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: ${JSON.stringify(refCode)} })
      })
        .then(function (r) { return r.json(); })
        .then(function () {
          // Mã đơn hiện NGAY tại đây. Với khách đặt qua Facebook, màn hình này
          // là xác nhận chính thức — họ không đăng nhập được, và tin nhắn
          // Messenger có thể không tới nơi.
          card.innerHTML =
            '<div class="ok"><div class="tick">✓</div>' +
            '<h2>Chuyển khoản thành công</h2>' +
            ${JSON.stringify(
              bookingCode
                ? `<p>Mã đơn của bạn: <strong>${escapeHtml(bookingCode)}</strong><br>Đưa mã này cho nhân viên khi tới quán.</p>`
                : '',
            )} +
            '<p>Bạn có thể quay lại màn hình đặt lịch.<br>' +
            'Đơn hàng sẽ tự xác nhận trong giây lát.</p></div>';
        })
        .catch(function () {
          button.disabled = false;
          button.textContent = 'Thử lại';
          sent = false;
        });
    });
  })();
</script>
</body></html>`;
}

export function renderErrorPage(message: string): string {
  return `<!doctype html>
<html lang="vi"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Không tìm thấy giao dịch</title>
<style>${BASE_STYLE}</style>
</head><body>
<div class="card">
  <div class="bar"><h1>Ngân hàng mô phỏng</h1></div>
  <div class="err">
    <h2>Không thực hiện được</h2>
    <p>${escapeHtml(message)}</p>
  </div>
</div>
</body></html>`;
}
