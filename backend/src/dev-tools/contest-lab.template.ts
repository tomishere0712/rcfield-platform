/**
 * Trang dựng dữ liệu giải đấu qua API thật.
 *
 * Viết bằng HTML/JS thuần, dựng phía server: công cụ nội bộ không đáng để kéo
 * theo một bước biên dịch, và để nó sống độc lập với giao diện chính — gỡ cả
 * module này đi không kéo theo thay đổi nào bên frontend.
 */

export const STYLE = `
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:ui-sans-serif,-apple-system,'Segoe UI',Roboto,sans-serif;
     background:#0f172a;color:#e2e8f0;line-height:1.5;padding:24px}
.wrap{max-width:1180px;margin:0 auto;display:grid;grid-template-columns:1fr 420px;gap:20px}
@media(max-width:1000px){.wrap{grid-template-columns:1fr}}
h1{font-size:20px;font-weight:800;margin-bottom:4px}
.sub{font-size:13px;color:#94a3b8;margin-bottom:20px}
.head{grid-column:1/-1}
.panel{background:#1e293b;border:1px solid #334155;border-radius:12px;padding:16px;margin-bottom:14px}
.panel h2{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;
          color:#94a3b8;margin-bottom:12px}
label{display:block;font-size:12px;color:#94a3b8;margin:8px 0 3px}
input,select,textarea{width:100%;padding:8px 10px;border-radius:7px;border:1px solid #475569;
       background:#0f172a;color:#e2e8f0;font-size:13px;font-family:inherit}
textarea{font-family:ui-monospace,Menlo,monospace;font-size:12px;min-height:70px}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}
.grid4{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px}
@media(max-width:700px){.grid4{grid-template-columns:1fr 1fr}}
.tabs{display:flex;gap:6px;margin-bottom:14px}
.subbox,.acct{border:1px solid #2b3648;border-radius:10px;padding:14px;margin-top:12px;background:#0e1626}
.subbox h3,.acct h3{margin:0 0 10px;font-size:13px;font-weight:700;color:#cfe0f5}
.acct-role{font-weight:400;font-size:11px;color:#7d8ea6;margin-left:6px}
details>summary{cursor:pointer;font-size:12px;font-weight:700;color:#8fa3bf;
     text-transform:uppercase;letter-spacing:.06em;list-style:none;padding:2px 0}
details>summary::-webkit-details-marker{display:none}
details>summary::before{content:'▸ ';color:#5b7089}
details[open]>summary::before{content:'▾ '}
details>summary:hover{color:#cfe0f5}
.tab{background:#131c2e;border:1px solid #2b3648;color:#8fa3bf;font-weight:600;
     padding:9px 18px;border-radius:8px;cursor:pointer}
.tab.on{background:#1d6feb;border-color:#1d6feb;color:#fff}
.tab-danger{color:#e88}
.tab-danger.on{background:#a33;border-color:#a33;color:#fff}
.danger-note{border-left:3px solid #a33;padding-left:10px}
label.inline{display:flex;align-items:center;gap:8px;margin:10px 0 0;font-weight:400;
     text-transform:none;letter-spacing:0;cursor:pointer}
label.inline input{width:auto;margin:0}
.picker{max-height:260px;overflow-y:auto;border:1px solid #2b3648;border-radius:8px;
        padding:8px;margin-top:8px;font-size:12px;background:#0e1626}
.picker label{display:flex;align-items:center;gap:8px;padding:4px 6px;border-radius:6px;
        cursor:pointer;margin:0;font-weight:400;text-transform:none;letter-spacing:0}
.picker label:hover{background:#182338}
.picker input[type=checkbox]{width:auto;margin:0;flex-shrink:0}
.picker .em{font-family:ui-monospace,Menlo,monospace}
.picker .nm{opacity:.55;margin-left:auto;white-space:nowrap;overflow:hidden;
        text-overflow:ellipsis;max-width:44%}
.built{font-family:ui-monospace,Menlo,monospace;font-size:11px;line-height:1.8}
.built b{display:inline-block;min-width:130px}
.sc-ok{color:#15803d;font-weight:600}
.sc-bad{color:#b91c1c;font-weight:600}
button{padding:9px 14px;border:0;border-radius:8px;background:#2563eb;color:#fff;
       font-size:13px;font-weight:700;cursor:pointer;font-family:inherit}
button:hover{background:#1d4ed8}
button:disabled{background:#475569;cursor:not-allowed}
button.ghost{background:#334155}
button.ghost:hover{background:#475569}
button.warn{background:#b45309}
button.warn:hover{background:#92400e}
.row{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
.step{border:1px solid #334155;border-radius:9px;padding:11px 13px;margin-bottom:8px;
      background:#0f172a;display:flex;align-items:center;gap:11px}
.step .n{width:24px;height:24px;border-radius:50%;background:#334155;color:#cbd5e1;
         font-size:12px;font-weight:700;display:grid;place-items:center;flex-shrink:0}
.step.ok .n{background:#16a34a;color:#fff}
.step.err .n{background:#dc2626;color:#fff}
.step.run .n{background:#2563eb;color:#fff}
.step .t{flex:1;min-width:0}
.step .t b{font-size:13px;font-weight:600;display:block}
.step .t code{font-size:11px;color:#64748b;font-family:ui-monospace,Menlo,monospace;
              display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.step .t .msg{font-size:11px;margin-top:2px}
.step.ok .msg{color:#4ade80}
.step.err .msg{color:#f87171}
#log{background:#020617;border:1px solid #334155;border-radius:10px;padding:12px;
     font-family:ui-monospace,Menlo,monospace;font-size:11px;height:520px;overflow:auto;
     white-space:pre-wrap;word-break:break-word}
.l-req{color:#60a5fa}.l-ok{color:#4ade80}.l-err{color:#f87171}.l-dim{color:#64748b}
.badge{display:inline-block;padding:2px 7px;border-radius:5px;font-size:11px;font-weight:700}
.badge.on{background:#14532d;color:#4ade80}
.badge.off{background:#450a0a;color:#f87171}
.hint{font-size:11px;color:#64748b;margin-top:6px}
`;

/**
 * Trang tham chiếu CSS và JS bằng đường dẫn cùng nguồn, KHÔNG nhúng nội tuyến.
 *
 * Helmet đặt `script-src 'self'` cho toàn bộ ứng dụng, nên thẻ <script> nội tuyến
 * bị chặn thẳng và trang chết lặng — không log, không lỗi mạng, chỉ là mọi thứ
 * không chạy. Tách ra file riêng thì `'self'` đã đủ, không phải nới CSP bằng
 * `unsafe-inline` như trang ngân hàng mô phỏng đang làm.
 *
 * `assetQuery` là chuỗi truy vấn gắn thêm vào đường dẫn CSS/JS. Khi trang bị
 * khoá bằng `DEV_TOOLS_TOKEN`, trình duyệt tải hai tệp con bằng lời gọi riêng
 * và KHÔNG tự mang theo khoá của trang cha — không truyền tiếp thì trang mở
 * được nhưng trắng trơn và câm lặng.
 */
export function renderContestLab(assetQuery = ''): string {
  return `<!doctype html>
<html lang="vi"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Contest Lab · dựng dữ liệu giải đấu qua API</title>
<link rel="stylesheet" href="/dev-tools/contest-lab.css${assetQuery}">
</head><body>
<div class="wrap">
  <div class="head">
    <h1>Contest Lab</h1>
    <p class="sub">Dựng dữ liệu giải đấu bằng cách gọi đúng chuỗi API mà giao diện thật gọi —
       không chèn thẳng vào cơ sở dữ liệu, nên không sinh dữ liệu lệch trạng thái.</p>
  </div>

  <div>
    <div class="tabs">
      <button class="tab on" data-tab="lab">Dựng giải đấu</button>
      <button class="tab" data-tab="users">Tạo tài khoản</button>
      <button class="tab" data-tab="cafes">Tạo chi nhánh</button>
      <button class="tab tab-danger" data-tab="purge">Dọn dữ liệu</button>
    </div>

    <div id="tabPurge" style="display:none">
    <div class="panel">
      <h2>Dọn dữ liệu thử</h2>
      <p class="hint danger-note">Xoá thật, không hoàn tác được. Luôn <b>Xem trước</b> rồi đọc kỹ
        bảng số liệu; nút xoá chỉ mở sau khi bạn gõ lại đúng mục tiêu vào ô xác nhận.
        Cần đăng nhập quản trị viên ở mục 1.</p>

      <div class="subbox">
        <h3>Giải của một chủ sân <span class="acct-role">xoá hẳn giải, đăng ký, trận, đơn phí</span></h3>
        <div class="grid2">
          <div><label>Email hoặc id chủ sân</label><input id="pgProvider" value="tri-provider@gmail.com"></div>
          <div><label>&nbsp;</label>
            <button class="ghost" id="btnPgContestPreview" style="width:100%">Xem trước</button></div>
        </div>
        <div id="pgContestPreview" class="picker">Chưa xem trước.</div>
        <div class="grid2">
          <div><label>Gõ lại email chủ sân để xác nhận</label><input id="pgContestConfirm"></div>
          <div><label>&nbsp;</label>
            <button class="warn" id="btnPgContestRun" style="width:100%">Xoá giải</button></div>
        </div>
        <p class="hint">Phiếu đặt sân KHÔNG bị xoá — chỉ gỡ liên kết tới giải. Tiền của phiếu là
          tiền thật.</p>
      </div>

      <div class="subbox">
        <h3>Tài khoản thử <span class="acct-role">chỉ tài khoản khách</span></h3>
        <div class="row">
          <button class="ghost" id="btnPgLoadUsers">Nạp danh sách khách</button>
          <button class="ghost" id="btnPgAll">Chọn hết đang hiện</button>
          <button class="ghost" id="btnPgNone">Bỏ chọn</button>
        </div>
        <input id="pgSearch" placeholder="Lọc theo email hoặc tên…" style="margin-top:8px">
        <div id="pgList" class="picker">Bấm <b>Nạp danh sách khách</b> để chọn từng người.</div>
        <div class="row">
          <button class="ghost" id="btnPgUserPreview">Xem trước người đã chọn</button>
        </div>
        <div id="pgUserPreview" class="picker">Chưa xem trước.</div>
        <label class="inline"><input type="checkbox" id="pgHard">
          Xoá hẳn thay vì khoá mềm — chỉ được khi tài khoản không còn bản ghi nào trỏ tới</label>
        <label class="inline"><input type="checkbox" id="pgCascade">
          Xoá kèm dữ liệu riêng của khách (gói, đánh giá). Chặn nếu còn phiếu đặt sân hoặc khoản
          đã đối soát ngân hàng</label>
        <div class="grid2">
          <div><label id="pgConfirmLabel">Gõ <code>xoa &lt;số lượng&gt;</code> để xác nhận</label>
            <input id="pgUserConfirm" placeholder="ví dụ: xoa 4"></div>
          <div><label>&nbsp;</label>
            <button class="warn" id="btnPgUserRun" style="width:100%">Thực hiện</button></div>
        </div>
        <p class="hint">Khoá mềm là mặc định: tài khoản biến mất khỏi ứng dụng, không đăng nhập
          được, lịch sử vẫn giữ nguyên. Mẫu quét trúng chủ sân hay nhân viên thì bị chặn — muốn
          làm vậy phải dùng dòng lệnh.</p>
      </div>
    </div>
    </div>

    <div id="tabCafes" style="display:none">
    <div class="panel">
      <h2>Tạo chi nhánh cho provider</h2>
      <p class="hint">Chi nhánh dựng bằng đúng <code>POST /cafes</code> mà giao diện thật gọi, với
        quận huyện và tên đường <b>có thật</b>, toạ độ đúng khu vực, giờ mở cửa khác nhau theo kiểu
        sân. Ảnh bìa để trống — bạn tự thêm sau.</p>
      <p class="hint">Dùng tài khoản provider ở tab <b>Dựng giải đấu</b>. Chưa đăng nhập thì bấm
        nút đăng nhập bên đó trước.</p>
      <div class="grid4">
        <div><label>Số chi nhánh</label><input id="cfCount" type="number" min="1" max="8" value="2"></div>
        <div><label>Thành phố</label><select id="cfCity">
          <option value="">Rải đều cả ba</option>
          <option value="TP. Hồ Chí Minh">TP. Hồ Chí Minh</option>
          <option value="Hà Nội">Hà Nội</option>
          <option value="Đà Nẵng">Đà Nẵng</option>
        </select></div>
        <div><label>Số xe mỗi dòng</label><input id="cfUnits" type="number" min="1" max="8" value="3"></div>
        <div><label>&nbsp;</label><button id="btnGenCafes" style="width:100%">Tạo chi nhánh</button></div>
      </div>
      <label class="inline"><input type="checkbox" id="cfPricing" checked>
        Bảng giá — phụ thu cuối tuần và khung giờ cao điểm</label>
      <label class="inline"><input type="checkbox" id="cfFleet" checked>
        Dòng xe cho thuê kèm từng chiếc xe — thiếu cái này thì không đặt xe được</label>
      <label class="inline"><input type="checkbox" id="cfMenu" checked>
        Thực đơn đồ ăn thức uống theo nhóm</label>
      <label class="inline"><input type="checkbox" id="cfBank" checked>
        Tài khoản nhận chuyển khoản — để hiện mã QR lúc thanh toán</label>
      <label class="inline"><input type="checkbox" id="cfApprove" checked>
        Admin duyệt luôn — chi nhánh mới nằm ở <code>PENDING</code> và
        <b>không hiện ở đâu cả</b> cho tới khi được duyệt</label>
      <div id="cfList" class="picker">Chưa tạo chi nhánh nào trong phiên này.</div>
      <p class="hint" id="cfStatus">Mỗi chi nhánh tính vào hạn mức gói thuê bao của provider.</p>
    </div>
    </div>

    <div id="tabUsers" style="display:none">
    <div class="panel">
      <h2>Tạo tài khoản khách</h2>
      <p class="hint">Sinh tên người Việt mạch lạc — tên đệm đi đúng với tên chính, không ghép bừa.
        Email lấy theo tên chính đã bỏ dấu (<code>Trọng Trí</code> → <code>tri@gmail.com</code>);
        trùng thì tự thêm số đuôi cho tới khi còn trống.</p>
      <div class="grid4">
        <div><label>Số lượng</label><input id="genCount" type="number" min="1" max="100" value="16"></div>
        <div><label>Tên miền email</label><input id="genDomain" value="gmail.com"></div>
        <div><label>Mật khẩu</label><input id="genPwd" value="123456"></div>
        <div><label>&nbsp;</label><button id="btnGenUsers" style="width:100%">Tạo tài khoản</button></div>
      </div>
      <label class="inline"><input type="checkbox" id="genPick" checked>
        Chọn luôn làm vận động viên sau khi tạo xong</label>
      <div id="genList" class="picker">Chưa tạo tài khoản nào trong phiên này.</div>
      <p class="hint" id="genStatus">Tài khoản tạo ra là tài khoản THẬT, đi qua đúng
        <code>POST /auth/register</code> — không chèn thẳng vào bảng.</p>
    </div>
    </div>

    <div id="tabLab">
    <div class="panel">
      <h2>1 · Tài khoản</h2>
      <p class="hint">Hai tài khoản KHÁC NHAU, làm hai việc khác nhau. Trộn chung một khối thì
        nhìn vào không biết ô nào của ai, và gõ nhầm mật khẩu bên này sang bên kia là bị khoá
        đăng nhập 15 phút.</p>

      <div class="acct">
        <h3>Chủ sân <span class="acct-role">tạo giải, duyệt đăng ký, điểm danh</span></h3>
        <div class="grid2">
          <div><label>Email</label><input id="pEmail" value="tri-provider@gmail.com"></div>
          <div><label>Mật khẩu</label><input id="pPwd" value="12345678" type="password"></div>
        </div>
        <div class="row">
          <button class="ghost" id="btnProviderCafes">Đăng nhập &amp; nạp chi nhánh</button>
        </div>
        <p class="hint" id="provStatus">Chưa đăng nhập — ô chi nhánh ở mục 2 còn trống.</p>
        <p class="hint">Phải là tài khoản đã có hồ sơ đối tác <b>được duyệt</b>, không thì mọi
          API của chủ sân trả <code>ACCOUNT_NOT_ACTIVE</code>.</p>
      </div>

      <div class="acct">
        <h3>Quản trị viên <span class="acct-role">xác nhận phí, đọc danh sách khách</span></h3>
        <div class="grid2">
          <div><label>Email</label><input id="aEmail" value="admin@gmail.com"></div>
          <div><label>Mật khẩu</label><input id="aPwd" value="123456" type="password"></div>
        </div>
        <div class="row">
          <button class="ghost" id="btnAdminLogin">Đăng nhập</button>
        </div>
        <p class="hint" id="adminStatus">Chưa đăng nhập. Không bắt buộc bấm — các bước cần
          quyền quản trị sẽ tự đăng nhập bằng thông tin ở trên.</p>
      </div>
    </div>

    <div class="panel">
      <h2>2 · Thông tin giải</h2>
      <div class="grid2">
        <div><label>Tên giải</label><input id="cName" value="Giải thử nghiệm"></div>
        <div><label>Sức chứa</label><input id="cCap" type="number" value="16"></div>
      </div>
      <div class="grid3">
        <div style="grid-column:span 2">
          <label>Thể thức thi đấu — chọn ở ô này</label><select id="cTemplate"></select>
        </div>
        <div><label>&nbsp;</label>
          <p class="hint" id="tplStatus" style="margin:0">Mở ô bên trái để đổi thể thức.</p>
        </div>
      </div>
      <div class="grid3">
        <div><label>Chi nhánh</label><select id="cCafe"></select></div>
        <div><label>Loại sân</label><select id="cTrack"></select></div>
        <div><label>Chính sách xe</label><select id="cPolicy">
          <option value="RENTAL_ONLY">Chỉ thuê xe quán</option>
          <option value="BYOC_ONLY">Chỉ mang xe riêng</option>
          <option value="MIXED">Cả hai</option>
        </select></div>
      </div>
      <div class="grid3">
        <div><label>Phí dự thi mỗi người (đ)</label><input id="cFee" type="number" value="150000"></div>
        <div><label>Phí dự thi xử lý thế nào</label><select id="cFeeMode">
          <option value="paid">Đã thu tiền — MARKED_PAID</option>
          <option value="waived">Miễn phí — WAIVED</option>
          <option value="unpaid">Để nguyên chưa trả — PENDING_PAYMENT</option>
        </select></div>
        <div><label>Giải bắt đầu sau (ngày)</label><input id="cDays" type="number" value="7"></div>
      </div>
      <p class="hint">Để phí bằng <code>0</code> thì mọi đăng ký nằm ở <code>NOT_REQUIRED</code> —
        giải không thu đồng nào và mọi màn hình tiền đều trống. Chọn
        <b>Để nguyên chưa trả</b> thì bước duyệt sau sẽ bị chặn bằng
        <code>ENTRY_FEE_PENDING</code>, đúng như thiết kế.</p>
      <label>Ảnh xe cá nhân — dùng khi vận động viên mang xe riêng</label>
      <input id="byocPhoto"
        value="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTk0T_b5O3R4fn0f8nZ13zRY8TNzvPkkvQIPjxoqwzVdw&amp;s=10">
      <p class="hint">Gửi kèm lúc đăng ký và lúc điểm danh. Ban tổ chức duyệt xe cá nhân
        dựa vào ảnh này, nên bỏ trống là đăng ký thiếu căn cứ.</p>
      <div class="row"><button class="ghost" id="btnLoad">Nạp lại danh mục</button></div>
      <p class="hint" id="catStatus">Đang nạp danh mục…</p>
      <p class="hint" id="trackStatus">Loại sân lấy theo chi nhánh đang chọn.</p>
    </div>

    <div class="panel">
      <h2>3 · Vận động viên</h2>
      <div class="grid2">
        <div><label>Mật khẩu chung của vận động viên</label><input id="athPwd" value="123456"></div>
        <div><label>&nbsp;</label>
          <p class="hint" style="margin:0">Ai khác mật khẩu thì viết
            <code>email:mật_khẩu</code> ở dòng của người đó.</p></div>
      </div>
      <label>Vận động viên</label>
      <div class="row">
        <button class="ghost" id="btnLoadCustomers">Chọn từ tài khoản có sẵn</button>
        <button class="ghost" id="btnPickAll">Chọn hết đang hiện</button>
        <button class="ghost" id="btnPickNone">Bỏ chọn</button>
        <input id="pickN" type="number" min="1" value="16" style="width:74px">
        <button class="ghost" id="btnPickRandom">Lấy ngẫu nhiên</button>
      </div>
      <input id="custSearch" placeholder="Lọc theo email hoặc tên…" style="margin-top:8px">
      <div id="custList" class="picker">Bấm <b>Chọn từ tài khoản có sẵn</b> để nạp danh sách.</div>
      <p class="hint" id="pickStatus">Chưa chọn ai.</p>
      <label>Email vận động viên — mỗi dòng một người</label>
      <textarea id="athletes">contest.customer1@gmail.com
contest.customer2@gmail.com
contest.customer3@gmail.com
contest.customer4@gmail.com</textarea>
      <p class="hint">Ô này vẫn là nguồn duy nhất công cụ đọc — chọn ở trên chỉ để điền nhanh vào đây,
        gõ tay hay dán thêm đều được. Tài khoản chưa tồn tại thì công cụ <b>tự đăng ký</b> qua API.</p>
    </div>

    <div class="panel">
      <h2>4 · Chạy tới một trạng thái</h2>
      <div class="row">
        <button class="ghost" data-goto="5">DRAFT — vừa tạo</button>
        <button class="ghost" data-goto="9">OPEN — đang mở đăng ký</button>
        <button class="ghost" data-goto="12">OPEN + đã duyệt VĐV</button>
        <button class="ghost" data-goto="14">CLOSED + đã điểm danh</button>
        <button class="ghost" data-goto="15">RUNNING — đã có trận</button>
        <button data-goto="17">COMPLETED — đủ kết quả</button>
      </div>
      <div class="row">
        <button class="warn" id="btnCancel">Huỷ giải vừa tạo</button>
        <button class="ghost" id="btnReset">Xoá trạng thái phiên</button>
      </div>
      <p class="hint">Mỗi nút chạy lần lượt từ bước 1 tới bước tương ứng rồi dừng.</p>
    </div>

    <div class="panel">
      <h2>5 · Chạy lô — nhiều giải một lượt</h2>
      <p class="hint">Khai số giải cần cho từng trạng thái. Phần chuẩn bị (tài khoản, gói thuê bao,
        chi nhánh, danh mục) chỉ chạy <b>một lần</b> cho cả lô — mỗi giải sau đó dựng riêng.</p>
      <div class="grid4">
        <div><label>DRAFT</label><input id="bDraft" type="number" min="0" value="1"></div>
        <div><label>OPEN</label><input id="bOpen" type="number" min="0" value="1"></div>
        <div><label>OPEN + đã duyệt</label><input id="bApproved" type="number" min="0" value="0"></div>
        <div><label>CLOSED + điểm danh</label><input id="bClosed" type="number" min="0" value="0"></div>
      </div>
      <div class="grid4">
        <div><label>RUNNING</label><input id="bRunning" type="number" min="0" value="1"></div>
        <div><label>COMPLETED</label><input id="bCompleted" type="number" min="0" value="1"></div>
        <div><label>CANCELLED</label><input id="bCancelled" type="number" min="0" value="0"></div>
        <div><label>&nbsp;</label><button id="btnBatch" style="width:100%">Chạy lô</button></div>
      </div>
      <p class="hint" id="batchStatus">Đủ một bộ để mở màn danh sách giải và thử bộ lọc trạng thái.</p>
    </div>

    <div class="panel">
      <h2>6 · Kịch bản lệch đường</h2>
      <p class="hint">Đường hạnh phúc hiếm khi lộ bug. Mỗi nút dựng một giải <b>riêng</b> rồi cố ý
        đẩy nó chệch khỏi luồng chuẩn, và báo lại hệ thống phản ứng thế nào.</p>
      <div class="row">
        <button class="ghost" data-scenario="noshow">VĐV không điểm danh</button>
        <button class="ghost" data-scenario="withdraw">Bỏ cuộc giữa giải</button>
        <button class="ghost" data-scenario="cancelPaid">Huỷ giải sau khi đã thu phí dự thi</button>
        <button class="ghost" data-scenario="overCapacity">Đăng ký vượt sức chứa</button>
      </div>
      <div id="scResult" class="hint">Chưa chạy kịch bản nào.</div>
    </div>

    <div class="panel">
      <details>
        <summary>Từng bước một — 18 bước, mở ra khi cần chạy lẻ</summary>
        <div id="steps"></div>
      </details>
    </div>
    </div>
  </div>

  <div>
<div class="panel" id="resumePanel" style="display:none">
      <h2>Giải đang làm việc</h2>
      <p class="hint" id="resumeInfo" style="margin:0"></p>
      <div class="picker" id="contestSnapshot" style="margin-top:14px;white-space:pre-line"></div>
      <div class="row">
        <button class="ghost" id="btnRefreshContest">Xem trạng thái hiện tại</button>
        <button class="warn" id="btnNewContest">Bỏ, bắt đầu giải mới</button>
      </div>
      <p class="hint">Bấm một nút ở mục dưới sẽ chạy tiếp trên chính giải này, không tạo giải mới.</p>
    </div>

<div class="panel">
      <h2>Đi tiếp một giải có sẵn</h2>
      <p class="hint">Giải tạo ở nơi khác — trên giao diện thật, bằng seed, hay từ máy khác — thì
        công cụ chưa biết gì về nó. Nạp vào đây để nó đọc lại danh sách đăng ký và trận đấu từ
        máy chủ, rồi chạy tiếp từ đúng chỗ giải đang đứng.</p>
      <div class="row">
        <button class="ghost" id="btnLoadContests">Nạp giải của provider này</button>
      </div>
      <select id="pickContest" style="margin-top:8px"></select>
      <div class="row">
        <button class="ghost" id="btnAdoptContest">Đi tiếp giải đã chọn</button>
      </div>
      <p class="hint" id="adoptStatus">Cần đăng nhập provider ở mục 1 trước.</p>
    </div>

    <div class="panel" style="position:sticky;top:24px">
      <h2>Nhật ký gọi API</h2>
      <div id="log"><span class="l-dim">Chưa chạy bước nào.</span></div>
      <div class="row">
        <button class="ghost" id="btnClear">Xoá nhật ký</button>
        <button class="ghost" id="btnCopy">Chép nhật ký</button>
      </div>
      <div id="ctxBox" class="hint"></div>
    </div>

<div class="panel">
      <h2>Giải đã dựng trong phiên</h2>
      <div id="builtBox" class="hint">Chưa dựng giải nào.</div>
    </div>
  </div>
</div>

<script src="/dev-tools/contest-lab.js${assetQuery}"></script>
</body></html>`;
}

/**
 * Toàn bộ phần chạy phía trình duyệt. Tách hằng riêng cho dễ đọc; nội dung là
 * JavaScript thuần chạy trực tiếp, không qua bước biên dịch nào.
 */
export const CLIENT_SCRIPT = String.raw`
const API = location.origin + '/api/v1';
const ctx = { athletes: [], registrations: [], matches: [] };

const $ = (id) => document.getElementById(id);
const logBox = $('log');

function log(kind, text) {
  const el = document.createElement('div');
  el.className = 'l-' + kind;
  el.textContent = text;
  if (logBox.firstChild && logBox.firstChild.classList && logBox.firstChild.classList.contains('l-dim')) {
    logBox.innerHTML = '';
  }
  logBox.appendChild(el);
  logBox.scrollTop = logBox.scrollHeight;
}

function short(v) {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.length > 400 ? s.slice(0, 400) + ' …' : s;
}

function contestPolicy(contest) {
  return (contest && contest.vehicle_rule && contest.vehicle_rule.vehicle_policy) ||
    (contest && contest.vehicleRule && contest.vehicleRule.vehicle_policy) || 'RENTAL_ONLY';
}

function contestBranches(contest) {
  const rows = (contest && (contest.participating_branches || contest.cafes)) || [];
  return rows.map((row) => row.cafe || row).filter(Boolean);
}

function renderContestSnapshot(contest) {
  const box = $('contestSnapshot');
  if (!box || !contest) return;
  const labels = { BYOC_ONLY: 'Chỉ xe cá nhân (BYOC)', RENTAL_ONLY: 'Chỉ xe thuê', MIXED: 'Xe cá nhân hoặc xe thuê' };
  const branches = contestBranches(contest).map((c) => c.name).filter(Boolean).join(', ') || 'Chưa xác định';
  const fmt = (v) => v ? new Date(v).toLocaleString('vi-VN') : 'Không giới hạn';
  const statusCount = (value) => (ctx.registrations || []).filter((r) => r.status === value).length;
  const sourceCount = (value) => (ctx.registrations || []).filter((r) => r.source === value).length;
  const feeCounts = (ctx.registrations || []).reduce((acc, r) => {
    const key = r.paymentStatus || 'CHƯA XÁC ĐỊNH'; acc[key] = (acc[key] || 0) + 1; return acc;
  }, {});
  const feeSummary = Object.keys(feeCounts).map((k) => k + ': ' + feeCounts[k]).join(', ');
  const now = Date.now();
  const opensAt = contest.registration_opens_at ? new Date(contest.registration_opens_at).getTime() : null;
  const closesAt = contest.registration_closes_at ? new Date(contest.registration_closes_at).getTime() : null;
  const registrationOpenNow = contest.status === 'OPEN' &&
    (!opensAt || opensAt <= now) && (!closesAt || now <= closesAt);
  box.textContent = [
    contest.name + ' [' + contest.status + ']',
    'Chính sách xe: ' + (labels[contestPolicy(contest)] || contestPolicy(contest)),
    'Đăng ký: ' + (ctx.registrations || []).length + '/' + contest.capacity +
      ' · Phí: ' + Number(contest.entry_fee || 0).toLocaleString('vi-VN') + 'đ',
    'Trạng thái VĐV: PENDING ' + statusCount('PENDING') + ' · CONFIRMED ' +
      statusCount('CONFIRMED') + ' · CHECKED_IN ' + statusCount('CHECKED_IN'),
    'Xe: BYOC ' + sourceCount('BYOC') + ' · RENTAL ' + sourceCount('RENTAL') +
      (feeSummary ? ' · Tình trạng phí: ' + feeSummary : ''),
    'Khung đăng ký: ' + fmt(contest.registration_opens_at) + ' → ' + fmt(contest.registration_closes_at),
    'Đăng ký demo: ' + (contest.registration_window_bypassed
      ? 'ĐANG BẬT — giải OPEN nhận VĐV ngay, thao tác có audit log'
      : registrationOpenNow
        ? 'ĐANG MỞ — thời điểm hiện tại nằm trong khung đăng ký'
        : 'ĐANG TẮT — VĐV phải nằm trong khung đăng ký'),
    'Thi đấu: ' + fmt(contest.starts_at) + ' → ' + fmt(contest.ends_at),
    'Chi nhánh: ' + branches,
    'Điểm danh demo: ' + (contest.check_in_window_bypassed
      ? 'ĐANG BẬT — được điểm danh ngay, thao tác có audit log'
      : 'ĐANG TẮT — phải chờ tới giờ bắt đầu giải'),
  ].join('\n');
}

function syncContestForm(contest) {
  const branches = contestBranches(contest);
  const host = (contest.host_branch && contest.host_branch.cafe) || branches[0];
  ctx.contestSnapshot = contest;
  $('cName').value = contest.name || '';
  $('cCap').value = contest.capacity || 0;
  $('cFee').value = Number(contest.entry_fee || 0);
  $('cPolicy').value = contestPolicy(contest);
  if (host && host.id) {
    ctx.cafeId = host.id;
    if ([...$('cCafe').options].some((o) => o.value === host.id)) $('cCafe').value = host.id;
  }
  if (contest.contest_template && contest.contest_template.id) {
    ctx.tplName = contest.contest_template.name;
    if ([...$('cTemplate').options].some((o) => o.value === contest.contest_template.id)) {
      $('cTemplate').value = contest.contest_template.id;
    }
  }
  if (contest.track_type && contest.track_type.id &&
      [...$('cTrack').options].some((o) => o.value === contest.track_type.id)) {
    $('cTrack').value = contest.track_type.id;
  }
  renderContestSnapshot(contest);
}

async function call(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  log('req', method + ' ' + path + (body ? '  ' + short(body) : ''));
  const res = await fetch(API + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch (e) { json = null; }
  if (!res.ok) {
    const msg = (json && (json.message || json.error)) || ('HTTP ' + res.status);
    const code = json && json.code ? ' [' + json.code + ']' : '';
    log('err', '  ✗ ' + res.status + code + ' ' + msg);
    // Gắn mã HTTP vào lỗi: chỗ gọi cần phân biệt 401 với mọi lỗi khác, và
    // dò chuỗi thông báo thì đổi câu chữ một lần là hỏng.
    const err = new Error(msg);
    err.status = res.status;
    err.code = json && json.code;
    err.payload = json;
    throw err;
  }
  log('ok', '  ✓ ' + res.status + '  ' + short(json && json.data !== undefined ? json.data : json));
  return json && json.data !== undefined ? json.data : json;
}

const tokenOf = (r) => r.access_token || r.accessToken || (r.tokens && r.tokens.access_token);

async function login(email, password) {
  const r = await call('POST', '/auth/login', { email, password });
  return { token: tokenOf(r), user: r.user };
}

/**
 * Đăng nhập, chưa có tài khoản thì tạo rồi đăng nhập lại.
 *
 * Danh sách vận động viên mặc định là tài khoản do seed tạo ra; máy nào chưa
 * chạy seed thì chúng không tồn tại và cả bước đăng ký giải chết ngay từ dòng
 * đầu. Tạo qua đúng API đăng ký nên tài khoản sinh ra không khác gì người dùng
 * tự đăng ký.
 */
async function loginOrRegister(email, password, fullName) {
  // HỎI TRƯỚC, đừng thử đăng nhập rồi mới biết. Mỗi lần đăng nhập hụt cộng một
  // vào bộ đếm chống dò mật khẩu; 5 lần là email đó bị khoá 15 phút. Chạy công
  // cụ vài lượt khi tài khoản chưa tồn tại là tự khoá chính mình, và thông báo
  // "Tài khoản bị khoá" khiến người dùng tưởng dữ liệu hỏng.
  const exists = await call('POST', '/auth/check-exists', { email });
  if (!exists.emailExists) {
    log('dim', '  (chưa có tài khoản ' + email + ' — tạo mới qua /auth/register)');
    await call('POST', '/auth/register', {
      full_name: fullName, email, password, role: 'CUSTOMER',
    });
    const fresh = await login(email, password);
    return { ...fresh, createdNow: true };
  }

  try {
    return await login(email, password);
  } catch (e) {
    if (/ACCOUNT_LOCKED|bị khoá/i.test(e.message)) {
      throw new Error('Email ' + email + ' đang bị khoá tạm do đăng nhập sai 5 lần. ' +
        'Chờ 15 phút, hoặc xoá bộ đếm: docker exec rcfeild_redis redis-cli del "auth:failed:' +
        email + '"');
    }
    if (/INVALID_CREDENTIALS|không đúng/i.test(e.message)) {
      throw new Error('Tài khoản ' + email + ' có tồn tại nhưng mật khẩu không đúng. ' +
        'Sửa ô mật khẩu chung, hoặc ghi "' + email + ':mật_khẩu_đúng" ở dòng đó.');
    }
    throw e;
  }
}

/**
 * Tên người Việt dùng cho tài khoản công cụ tự tạo.
 *
 * Đặt "Vận động viên 1" thì mọi màn hình vận hành đều hiện đúng chuỗi đó, và
 * người xem tưởng giao diện đang in nhãn chung thay vì tên thật.
 *
 * Tách nam/nữ vì tên đệm và tên chính đi theo cặp: ghép bừa sẽ ra "Nguyễn Thị
 * Cường" hay "Trần Văn Quỳnh" — người Việt nhìn là biết máy sinh, và một buổi
 * demo mất tin cậy vì đúng những chi tiết nhỏ như thế.
 */
const HO = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Huỳnh', 'Phan', 'Vũ', 'Võ',
  'Đặng', 'Bùi', 'Đỗ', 'Hồ', 'Ngô', 'Dương', 'Lý', 'Đinh', 'Trịnh', 'Mai', 'Lâm'];

const DEM_NAM = ['Văn', 'Minh', 'Quốc', 'Hữu', 'Đức', 'Công', 'Thành', 'Xuân',
  'Bá', 'Đình', 'Trọng', 'Anh'];
const TEN_NAM = ['An', 'Bảo', 'Cường', 'Dũng', 'Đạt', 'Hải', 'Hiếu', 'Hoàng',
  'Huy', 'Khoa', 'Khôi', 'Kiên', 'Lâm', 'Long', 'Nam', 'Nghĩa', 'Phong', 'Phúc',
  'Quân', 'Sơn', 'Thắng', 'Thịnh', 'Trí', 'Trung', 'Tuấn', 'Vinh'];

const DEM_NU = ['Thị', 'Ngọc', 'Thanh', 'Thu', 'Kim', 'Diệu', 'Hồng', 'Mỹ',
  'Phương', 'Khánh', 'Bảo', 'Gia'];
const TEN_NU = ['Anh', 'Chi', 'Dung', 'Duyên', 'Hà', 'Hằng', 'Hạnh', 'Hiền',
  'Hoa', 'Hương', 'Lan', 'Linh', 'Mai', 'My', 'Nga', 'Ngân', 'Nhi', 'Nhung',
  'Oanh', 'Phương', 'Quỳnh', 'Thảo', 'Trang', 'Trâm', 'Uyên', 'Vy', 'Yến'];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/** Một cái tên mạch lạc, kèm phần tên chính để còn dựng email. */
function vietnameseName() {
  const nam = Math.random() < 0.5;
  const ten = nam ? pick(TEN_NAM) : pick(TEN_NU);
  // Tránh trùng họ với tên: "Hoàng Hữu Hoàng", "Lâm Văn Lâm" nghe như máy sinh
  // hơn là tên thật. Vài họ cũng là tên chính nên phải lọc lại.
  let ho = pick(HO);
  for (let i = 0; i < 8 && ho === ten; i++) ho = pick(HO);
  return { full: ho + ' ' + (nam ? pick(DEM_NAM) : pick(DEM_NU)) + ' ' + ten, ten };
}

function fakeVietnameseName() {
  return vietnameseName().full;
}

/** Bỏ dấu để dựng email từ tên: "Trí" thành "tri", "Quỳnh" thành "quynh". */
function slugTen(ten) {
  return ten
    // NFD tách "í" thành "i" cộng một dấu sắc rời, rồi bộ lọc ở cuối dọn nốt
    // phần dấu. Thiếu bước này thì "í" là ký tự nguyên khối không nằm trong
    // [a-z0-9] nên bị xoá cả chữ lẫn dấu — "Trí" ra "tr".
    .normalize('NFD')
    // "đ" phải xử riêng vì nó là một CHỮ CÁI, không phải "d" cộng dấu phụ: NFD
    // không tách được, và bộ lọc cuối sẽ xoá thẳng — "Đạt" ra "at".
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Một dòng vận động viên: "email" hoặc "email:mật_khẩu". */
function parseAthlete(line) {
  const at = line.indexOf('@');
  const sep = line.indexOf(':', at < 0 ? 0 : at);
  if (sep < 0) return { email: line.trim(), password: $('athPwd').value };
  return { email: line.slice(0, sep).trim(), password: line.slice(sep + 1).trim() };
}

/**
 * Điểm danh MỘT đăng ký.
 *
 * Tách khỏi bước điểm danh vì kịch bản "vắng mặt" cần điểm danh có chọn lọc.
 * Chép thành hai bản thì sớm muộn cũng lệch nhau, và bản trong kịch bản sẽ là
 * bản lặng lẽ sai.
 */
async function checkInOne(r, demoNow) {
  const body = { checked_in_cafe_id: ctx.cafeId };
  // Xét theo TỪNG đăng ký, không theo chính sách của giải: giải hỗn hợp có cả
  // người thuê xe lẫn người mang xe riêng, mỗi loại cần dữ liệu khác nhau.
  const isByoc = r.source === 'BYOC' || $('cPolicy').value === 'BYOC_ONLY';
  if (isByoc) {
    body.byoc_confirmed = true;
    // Nhận xe cá nhân bắt buộc có bằng chứng: tối thiểu 2 ảnh và đủ ba hạng mục
    // thân xe, hệ truyền động, bánh. Thiếu là 400, không phải cảnh báo.
    const photo = $('byocPhoto').value.trim() ||
      'https://placehold.co/600x400/png?text=BYOC';
    body.byoc_inspection = {
      // Dùng cùng một ảnh cho hai góc là chấp nhận được ở môi trường thử, miễn
      // là ảnh có thật và tải được.
      photos: [
        { url: photo, angle: 'FRONT' },
        { url: photo, angle: 'REAR' },
      ],
      checklist: [
        { itemKey: 'body', itemLabel: 'Thân xe', status: 'OK' },
        { itemKey: 'power_system', itemLabel: 'Hệ truyền động', status: 'OK' },
        { itemKey: 'wheels', itemLabel: 'Bánh xe', status: 'OK' },
      ],
    };
  } else {
    const units = await call('GET', '/contest-registrations/' + r.id + '/handover-units',
      null, ctx.providerToken);
    const rows = units.data || units;
    const unit = Array.isArray(rows) ? rows[0] : null;
    if (unit) body.rental_vehicle_id = unit.vehicle_id || unit.id;
  }
  if (demoNow) {
    await callDevPost('/dev-tools/contest-registrations/' + r.id + '/check-in-now',
      body, ctx.providerToken);
  } else {
    await call('POST', '/contest-registrations/' + r.id + '/check-in', body, ctx.providerToken);
  }
}

function stableHash(text) {
  let h = 2166136261;
  for (let i = 0; i < String(text).length; i++) {
    h ^= String(text).charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function registrationIdOf(participant) {
  return participant.registration_id || participant.registrationId;
}

function participantLabel(participant) {
  return participant.participant_name || participant.full_name || participant.email ||
    registrationIdOf(participant);
}

function matchTypeOf(match) { return match.match_type || match.matchType || ''; }
function matchMeta(match) { return match.metadata || {}; }
function isCompletedMatch(match) { return match.status === 'COMPLETED' || match.status === 'CANCELLED'; }

function contestFormatCode() {
  const c = ctx.contestSnapshot || {};
  return (c.contest_format && c.contest_format.code) ||
    (c.contestFormat && c.contestFormat.code) || c.format_code || c.formatCode || '';
}

function resultPhaseOf(match) {
  if (matchTypeOf(match) === 'TIME_ATTACK') return 'QUALIFYING';
  return 'FINAL';
}

function resultRowsForMatch(match) {
  const participants = (match.participants || []).filter((p) => registrationIdOf(p));
  if (!participants.length) return [];
  if (matchTypeOf(match) === 'TIME_ATTACK') {
    return participants.map((p) => {
      const id = registrationIdOf(p);
      const runNo = Number(matchMeta(match).run_no || match.round_no || 1);
      const athleteBase = 38 + (stableHash(ctx.contestId + ':' + id) % 11000) / 1000;
      const variation = [0.72, -0.41, 0.18, -0.09][(runNo - 1) % 4];
      const best = Number((athleteBase + variation).toFixed(3));
      const total = Number((best * 3 + 3 + (stableHash(match.id + ':' + id) % 3500) / 1000).toFixed(3));
      return { registration_id: id, label: participantLabel(p), finish_position: 1,
        is_winner: false, best_lap_seconds: best, total_time_seconds: total };
    });
  }
  const winnerIndex = stableHash(ctx.contestId + ':' + match.id) % participants.length;
  const ordered = [participants[winnerIndex]].concat(participants.filter((_p, i) => i !== winnerIndex));
  return ordered.map((p, i) => {
    const id = registrationIdOf(p);
    const best = Number((42 + i * 1.7 + (stableHash(match.id + ':' + id) % 900) / 1000).toFixed(3));
    return { registration_id: id, label: participantLabel(p), finish_position: i + 1,
      is_winner: i === 0, best_lap_seconds: best,
      total_time_seconds: Number((best * 3 + 4 + i * 2.25).toFixed(3)) };
  });
}

function executableMatches(matches, phase) {
  let rows = matches.filter((m) => !isCompletedMatch(m) && (m.participants || []).length &&
    resultPhaseOf(m) === phase);
  if (phase === 'FINAL' && rows.length) {
    const firstRound = Math.min.apply(null, rows.map((m) => Number(m.round_no || 0)));
    rows = rows.filter((m) => Number(m.round_no || 0) === firstRound);
  }
  return rows.sort((a, b) => Number(a.round_no || 0) - Number(b.round_no || 0) ||
    Number(a.match_no || 0) - Number(b.match_no || 0));
}

function resultFingerprint(matches) {
  return matches.map((m) => m.id + ':' + m.status + ':' +
    (m.participants || []).map(registrationIdOf).join(',')).join('|');
}

function renderResultPreview(draft) {
  const target = $('resultPreview');
  if (!target) return;
  if (!draft || !draft.matches.length) {
    target.innerHTML = '<span class="muted">Không có trận sẵn sàng để xem trước.</span>';
    return;
  }
  const rows = [];
  draft.matches.forEach((m) => m.results.forEach((r) => rows.push(
    '<tr><td>' + (m.roundNo || '-') + '/' + (m.matchNo || '-') + '</td><td>' +
    r.label + '</td><td>' + r.best_lap_seconds.toFixed(3) + 's</td><td>' +
    r.total_time_seconds.toFixed(3) + 's</td><td>' + r.finish_position + '</td><td>' +
    (r.is_winner ? 'Thắng' : '') + '</td></tr>')));
  target.innerHTML = '<div class="muted">' + draft.label + '</div><table><thead><tr>' +
    '<th>Vòng/trận</th><th>VĐV</th><th>Best lap</th><th>Total</th><th>Vị trí</th><th></th>' +
    '</tr></thead><tbody>' + rows.join('') + '</tbody></table>';
}

async function createResultPreview(phase) {
  const matches = await fetchMatches();
  const executable = executableMatches(matches, phase);
  ctx.resultDraft = {
    phase,
    fingerprint: resultFingerprint(executable),
    label: phase === 'QUALIFYING' ? 'Vòng tính giờ / vòng loại' : 'Vòng knockout đang sẵn sàng',
    matches: executable.map((m) => ({ id: m.id, roundNo: m.round_no, matchNo: m.match_no,
      results: resultRowsForMatch(m) })),
  };
  renderResultPreview(ctx.resultDraft);
  saveState();
  return 'đã tạo preview ' + ctx.resultDraft.matches.length + ' trận';
}

async function submitResultMatch(match) {
  const results = resultRowsForMatch(match).map((r) => ({
    registration_id: r.registration_id,
    finish_position: r.finish_position,
    is_winner: r.is_winner,
    best_lap_seconds: r.best_lap_seconds,
    total_time_seconds: r.total_time_seconds,
  }));
  await call('POST', '/contest-matches/' + match.id + '/results',
    { results, reason: 'Kết quả xác định từ Contest Lab' }, ctx.providerToken);
}

async function confirmResultPreview() {
  if (!ctx.resultDraft) throw new Error('Hãy tạo dữ liệu xem trước trước khi ghi kết quả.');
  const phase = ctx.resultDraft.phase;
  let matches = await fetchMatches();
  let current = executableMatches(matches, phase);
  if (resultFingerprint(current) !== ctx.resultDraft.fingerprint) {
    ctx.resultDraft = null; renderResultPreview(null); saveState();
    throw new Error('Danh sách trận đã thay đổi. Preview cũ đã huỷ; hãy tạo lại.');
  }
  let done = 0;
  let guard = 0;
  while (current.length && guard++ < 100) {
    for (const match of current) { await submitResultMatch(match); done++; }
    matches = await fetchMatches();
    const next = executableMatches(matches, phase);
    if (next.length && resultFingerprint(next) === resultFingerprint(current)) {
      throw new Error('Vòng đấu không tiến triển sau khi ghi kết quả; đã dừng để tránh lặp vô hạn.');
    }
    current = next;
  }
  if (guard >= 100) throw new Error('Vượt giới hạn an toàn khi xử lý các vòng đấu.');
  ctx.matches = matches; ctx.resultDraft = null; renderResultPreview(null); saveState();
  return 'đã ghi kết quả ' + done + ' trận; backend tự đưa người thắng đi tiếp';
}

/**
 * Chặn các bước chạy trên danh sách đăng ký rỗng.
 *
 * Vòng lặp qua mảng rỗng không chạy lần nào và bước vẫn trả về "đã duyệt 0
 * người" — nhìn hệt như thành công. Xảy ra khi người dùng bấm thẳng vào một
 * bước giữa chừng, hoặc nạp giải có sẵn mà chưa đọc được đăng ký nào.
 */
function assertCoDangKy(viec) {
  if (!ctx.registrations || !ctx.registrations.length) {
    throw new Error('Chưa có đăng ký nào trong phiên để ' + viec + '. Chạy bước "Vận động ' +
      'viên đăng ký" trước, hoặc nạp lại giải ở mục "Đi tiếp một giải có sẵn".');
  }
}

/** Phí dự thi đang thật sự áp dụng — ghi đè của kịch bản thắng giá trị trên form. */
function effectiveEntryFee() {
  const ov = ctx.overrides || {};
  return ov.entry_fee !== undefined ? Number(ov.entry_fee) : Number($('cFee').value);
}

function isoIn(days, hour) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

function fillSelect(id, rows, labelKey) {
  const sel = $(id);
  sel.innerHTML = '';
  if (!rows || !rows.length) {
    // Ô rỗng trơ không mở ra được gì, người dùng tưởng trang hỏng. Luôn để lại
    // một dòng nói rõ tình trạng.
    const o = document.createElement('option');
    o.value = ''; o.textContent = '(chưa nạp được dữ liệu)'; o.disabled = true;
    sel.appendChild(o);
    return;
  }
  rows.forEach((r) => {
    const o = document.createElement('option');
    o.value = r.id;
    o.textContent = r[labelKey] || r.name || r.code || r.id;
    sel.appendChild(o);
  });
}

// ── Các bước ─────────────────────────────────────────────────────────────────
// Mỗi bước là một mắt xích: chạy xong ghi kết quả vào ctx cho bước sau dùng.
const STEPS = [
  {
    name: 'Chuẩn bị tài khoản provider và admin',
    api: 'POST /auth/login  (chủ sân và quản trị viên)',
    run: async () => {
      const a = await login($('aEmail').value, $('aPwd').value);
      ctx.adminToken = a.token;

      const p = await login($('pEmail').value, $('pPwd').value);
      ctx.providerToken = p.token; ctx.providerId = p.user.id;
      return 'provider ' + p.user.id.slice(0, 8) + '…';
    },
  },
  {
    name: 'Bảo đảm provider có gói thuê bao còn hiệu lực',
    api: 'GET /provider/subscription → POST /provider/payment-requests → admin confirm',
    run: async () => {
      let sub;
      try {
        sub = await call('GET', '/provider/subscription', null, ctx.providerToken);
      } catch (e) {
        if (/chưa hoàn thành đăng ký|chưa được phê duyệt/i.test(e.message)) {
          throw new Error('Tài khoản này chưa có hồ sơ đối tác được duyệt nên mọi API ' +
            'provider đều bị chặn. Đổi ô "Provider lấy đâu ra" sang "Tạo mới qua API" rồi chạy lại.');
        }
        throw e;
      }
      const status = sub && (sub.status || (sub.subscription && sub.subscription.status));
      if (status && ['ACTIVE', 'TRIAL', 'GRACE_PERIOD'].includes(status)) {
        return 'đã có gói ' + status + ', bỏ qua thanh toán';
      }
      const plans = await call('GET', '/subscription-plans');
      const list = plans.data || plans;
      const plan = list.find((p) => p.name !== 'TRIAL') || list[0];
      const amount = Number(plan.price_per_month || plan.pricePerMonth || 0);
      const req = await call('POST', '/provider/payment-requests', {
        plan_id: plan.id,
        transfer_reference: 'LAB' + Date.now(),
        transfer_date: new Date().toISOString().slice(0, 10),
        transfer_amount: amount,
      }, ctx.providerToken);
      const id = req.id || (req.payment_request && req.payment_request.id);
      await call('POST', '/admin/payment-requests/' + id + '/confirm', {}, ctx.adminToken);
      return 'đã kích hoạt gói ' + plan.name;
    },
  },
  {
    name: 'Tạo chi nhánh nếu provider chưa có cái nào',
    api: 'GET /cafes → POST /cafes',
    run: async () => {
      const owned = await loadMyCafes();
      if (owned.length) return 'đã có ' + owned.length + ' chi nhánh, ô chọn đã lọc lại';

      const tracks = await call('GET', '/track-types');
      const trackRows = Array.isArray(tracks) ? tracks : tracks.data || [];
      const hours = {};
      ['sun','mon','tue','wed','thu','fri','sat'].forEach((d) => {
        hours[d] = { open: '08:00', close: '22:00', is_closed: false };
      });
      const cafe = await call('POST', '/cafes/', {
        name: 'Sân Lab ' + Date.now(),
        description: 'Chi nhánh do Contest Lab tạo để thử nghiệm',
        address: '1 Đường Thử Nghiệm',
        district: 'Quận 1',
        city: 'TP. Hồ Chí Minh',
        latitude: 10.7769, longitude: 106.7009,
        operating_hours: hours,
        track_types: trackRows.slice(0, 1).map((t) => t.id),
        slot_duration_minutes: 60,
        slot_fee_rate: 50000,
      }, ctx.providerToken);
      ctx.cafeId = cafe.id;
      fillSelect('cCafe', [cafe], 'name');
      await loadTrackTypesForCafe();
      return 'đã tạo chi nhánh ' + cafe.id.slice(0, 8) + '…';
    },
  },
  {
    name: 'Nạp danh mục loại giải, thể thức, khuôn mẫu, chi nhánh, loại sân',
    api: 'GET /contest-catalog/* · /cafes · /track-types',
    run: async () => {
      await loadCatalog();
      return 'đã nạp';
    },
  },
  {
    name: 'Tạo giải — trạng thái DRAFT',
    api: 'POST /contests',
    run: async () => {
      // Đã có giải dang dở thì dùng lại, đừng tạo cái mới. Người dùng bấm nút
      // trạng thái là muốn ĐẨY giải đó đi tiếp, không phải sinh thêm một giải
      // nữa mỗi lần chạy.
      const tpl = selectedTemplate();
      if (!tpl) throw new Error('Chưa chọn khuôn mẫu giải — bấm "Nạp lại danh mục" rồi chọn một cái.');

      if (ctx.contestId) {
        const cur = await call('GET', '/contests/' + ctx.contestId, null, ctx.providerToken);
        // Phiên trước còn dở thì bước này dùng lại giải cũ. Nhưng nếu người dùng
        // vừa đổi sang khuôn mẫu KHÁC, im lặng dùng lại là dối: họ chọn "Đấu
        // loại trực tiếp", bấm chạy, rồi nhận về đúng cái giải tính giờ cũ mà
        // không có gì nói vì sao. Trạng thái phiên nằm trong localStorage nên
        // sống qua cả lần tải lại trang — không tự nhận ra được.
        const cuId = cur.contest_template && cur.contest_template.id;
        if (cuId && cuId !== tpl.id) {
          const tenCu = (cur.contest_template && cur.contest_template.name) || 'khác';
          throw new Error(
            'Phiên đang dở là giải "' + tenCu + '", nhưng bạn đang chọn "' + tpl.name +
            '". Bấm "Xoá trạng thái phiên" ở mục 1 rồi chạy lại để tạo giải mới.'
          );
        }
        ctx.cafeId = ctx.cafeId || $('cCafe').value;
        ctx.tplName = (cur.contest_template && cur.contest_template.name) || null;
        showResume();
        return 'dùng lại giải đang dở — ' + cur.status + ' ' + ctx.contestId.slice(0, 8) + '…';
      }
      const days = Number($('cDays').value);
      // Chạy lô và kịch bản lệch cần đổi vài tham số so với ô nhập trên form —
      // ví dụ sức chứa nhỏ hơn số người để kiểm chốt chặn. Ghi đè qua ctx thay
      // vì sửa giá trị trong ô, để form người dùng gõ không bị thay ngầm.
      const ov = ctx.overrides || {};
      const body = {
        name: $('cName').value +
          (ctx.nameSuffix ? ' — ' + ctx.nameSuffix : '') +
          ' ' + new Date().toLocaleTimeString('vi-VN'),
        // Lấy từ chính khuôn mẫu, không đọc ô riêng: backend đối chiếu ba giá
        // trị này với nhau và từ chối nếu lệch.
        contest_type_id: tpl.contestTypeId || tpl.contest_type_id,
        contest_format_id: tpl.contestFormatId || tpl.contest_format_id,
        contest_template_id: tpl.id,
        track_type_id: $('cTrack').value,
        participating_cafe_ids: [$('cCafe').value],
        starts_at: isoIn(days, 9),
        ends_at: isoIn(days, 18),
        // Luồng tạo thật yêu cầu mốc mở nằm trong tương lai. Bước dev-tool riêng
        // phía sau sẽ mở sớm đúng contest này để khách đăng ký ngay khi demo.
        registration_opens_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        registration_closes_at: isoIn(days - 1 > 0 ? days - 1 : 1, 20),
        capacity: ov.capacity !== undefined ? ov.capacity : Number($('cCap').value),
        entry_fee: ov.entry_fee !== undefined ? ov.entry_fee : Number($('cFee').value),
        vehicle_rule: { vehicle_policy: $('cPolicy').value, assignment_policy: 'AT_CHECK_IN' },
      };
      const c = await call('POST', '/contests', body, ctx.providerToken);
      ctx.contestId = c.id;
      ctx.cafeId = $('cCafe').value;
      ctx.tplName = tpl.name;
      return 'contest ' + c.id.slice(0, 8) + '… trạng thái ' + c.status;
    },
  },
  {
    name: 'Đặt gói tổ chức giải',
    api: 'GET /contest-fee-plans → POST /contests/:id/fee/order',
    run: async () => {
      const st = await call('GET', '/contests/' + ctx.contestId + '/fee', null, ctx.providerToken);
      if (st && (st.status === 'PAID' || st.payment_status === 'PAID' || st.required === false)) {
        ctx.feeSkipped = true;
        return 'giải này không phải trả phí, bỏ qua';
      }
      const plans = await call('GET', '/contest-fee-plans', null, ctx.providerToken);
      const list = plans.data || plans;
      if (!list.length) { ctx.feeSkipped = true; return 'không có gói phí nào, bỏ qua'; }
      const order = await call('POST', '/contests/' + ctx.contestId + '/fee/order',
        { plan_id: list[0].id }, ctx.providerToken);
      ctx.feeOrderId = order.id || (order.order && order.order.id);
      ctx.feeAmount = Number(order.amount || order.total_amount || list[0].price || 0);
      return 'đơn phí ' + String(ctx.feeOrderId).slice(0, 8) + '…';
    },
  },
  {
    name: 'Khai báo đã chuyển khoản phí tổ chức',
    api: 'POST /contests/:id/fee/transfer',
    run: async () => {
      if (ctx.feeSkipped) return 'bỏ qua';
      await call('POST', '/contests/' + ctx.contestId + '/fee/transfer', {
        transfer_reference: 'LABFEE' + Date.now(),
        transfer_date: new Date().toISOString().slice(0, 10),
        transfer_amount: ctx.feeAmount > 0 ? ctx.feeAmount : 1000,
      }, ctx.providerToken);
      return 'đã khai báo';
    },
  },
  {
    name: 'Admin xác nhận đã nhận phí',
    api: 'POST /admin/contest-fee-orders/:id/confirm',
    run: async () => {
      if (ctx.feeSkipped) return 'bỏ qua';
      await call('POST', '/admin/contest-fee-orders/' + ctx.feeOrderId + '/confirm',
        { notes: 'Xác nhận từ Contest Lab' }, ctx.adminToken);
      return 'đã xác nhận';
    },
  },
  {
    name: 'Mở đăng ký — DRAFT sang OPEN',
    api: 'POST /contests/:id/open',
    run: async () => {
      const current = await call('GET', '/contests/' + ctx.contestId, null, ctx.providerToken);
      syncContestForm(current);
      if (current.status === 'OPEN') {
        return 'giải đã OPEN — không mở đăng ký lần hai';
      }
      if (current.status !== 'DRAFT') {
        throw new Error('Không thể mở đăng ký: giải đang ở trạng thái ' + current.status +
          '. Contest Lab không tự lùi trạng thái của giải thật.');
      }
      const c = await call('POST', '/contests/' + ctx.contestId + '/open', {}, ctx.providerToken);
      return 'trạng thái ' + c.status;
    },
  },
  {
    name: 'Cho phép vận động viên đăng ký ngay',
    api: 'POST /dev-tools/contests/:id/open-registration-now',
    run: async () => {
      const c = await callDevPost('/dev-tools/contests/' + ctx.contestId +
        '/open-registration-now', {}, ctx.providerToken);
      syncContestForm(c);
      return 'đã mở cổng đăng ký ngay cho contest ' + ctx.contestId.slice(0, 8) + '…';
    },
  },
  {
    name: 'Vận động viên đăng ký',
    api: 'POST /contests/:id/register  (mỗi người một lần)',
    run: async () => {
      const inputLines = $('athletes').value.split('\n').map((s) => s.trim()).filter(Boolean);
      const contest = await call('GET', '/contests/' + ctx.contestId, null, ctx.providerToken);
      syncContestForm(contest);
      const policy = contestPolicy(contest);
      if (contest.status !== 'OPEN') {
        throw new Error('Không thể import VĐV: giải đang ở trạng thái ' + contest.status +
          '. Chỉ giải OPEN mới nhận đăng ký; Contest Lab không tự lùi trạng thái của giải thật.');
      }

      // Nạp danh sách thật trước khi làm gì. Bấm seed lại phải là thao tác
      // idempotent: người đã có trong giải được giữ nguyên, không POST lần hai.
      const existingRes = await call('GET', '/contests/' + ctx.contestId + '/registrations',
        null, ctx.providerToken);
      const existingRows = existingRes.data || existingRes;
      const activeRows = (Array.isArray(existingRows) ? existingRows : [])
        .filter((r) => !['CANCELLED', 'REJECTED'].includes(r.status));
      const existingByEmail = new Map(activeRows.map((r) => [
        String((r.participant && r.participant.email) || '').toLowerCase(), r,
      ]));
      ctx.athletes = [];
      ctx.registrations = activeRows.map((r) => ({
        id: r.id,
        email: (r.participant && r.participant.email) || r.user_id,
        status: r.status,
        source: r.vehicle_source || r.vehicleSource,
        paymentStatus: r.payment_status || r.entry_fee_status || r.entryFeeStatus,
      }));

      // Hội đồng không thể chờ mở hàng chục tài khoản. Ô danh sách là phần
      // ưu tiên; nếu chưa đủ số chỗ còn lại thì Lab tự sinh email ổn định cho
      // chính giải này. Nếu nhập dư, chỉ lấy đúng số cần để không tạo tài khoản
      // rồi mới phát hiện giải đã full.
      const remaining = Math.max(0, Number(contest.capacity || 0) - activeRows.length);
      const candidateLines = [];
      const seen = new Set(existingByEmail.keys());
      for (const line of inputLines) {
        const parsed = parseAthlete(line);
        const key = parsed.email.toLowerCase();
        if (!seen.has(key)) {
          candidateLines.push(line);
          seen.add(key);
        }
      }
      let generatedNo = 1;
      const contestKey = String(contest.id).replace(/-/g, '').slice(0, 10);
      const importTarget = remaining + (ctx.expectCapacity ? 1 : 0);
      while (candidateLines.length < importTarget) {
        const email = 'contest.lab.' + contestKey + '.' + generatedNo + '@gmail.com';
        generatedNo += 1;
        if (seen.has(email)) continue;
        candidateLines.push(email);
        seen.add(email);
      }
      const lines = candidateLines.slice(0, importTarget);
      const activeEmails = activeRows
        .map((r) => r.participant && r.participant.email).filter(Boolean);
      $('athletes').value = activeEmails.concat(lines).join('\n');
      if (!remaining) log('dim', '  (giải đã đủ ' + activeRows.length + '/' + contest.capacity + ' VĐV)');
      if (lines.length > inputLines.length) {
        log('dim', '  (tự sinh thêm ' + (lines.length - inputLines.length) +
          ' tài khoản để lấp đủ sức chứa)');
      }

      let created = 0;
      for (const [i, line] of lines.entries()) {
        const { email, password } = parseAthlete(line);
        if (existingByEmail.has(email.toLowerCase())) {
          log('dim', '  (đã có ' + email + ' trong giải — bỏ qua, không đăng ký lại)');
          continue;
        }
        const a = await loginOrRegister(email, password, fakeVietnameseName());
        ctx.athletes.push({ email, token: a.token, userId: a.user.id });
        if (a.createdNow) created += 1;
      }
      if (created) log('dim', '  (đã tạo mới ' + created + ' tài khoản)');

      let catalogs = [];
      if (policy !== 'BYOC_ONLY' && ctx.athletes.length) {
        // Danh sách xe cho thuê của giải là endpoint DÀNH CHO KHÁCH — gọi bằng
        // token provider sẽ ăn 403. Dùng token của vận động viên đầu tiên.
        const opts = await call('GET', '/contests/' + ctx.contestId + '/rental-options',
          null, ctx.athletes[0].token);
        // Trả về một object gồm cafes / track_configs / vehicle_catalogs, không
        // phải mảng phẳng.
        const all = (opts && opts.vehicle_catalogs) || [];
        catalogs = all.filter((v) => v.cafe_id === ctx.cafeId);
        if (!catalogs.length) catalogs = all;
        if (!catalogs.length && policy === 'RENTAL_ONLY') {
          throw new Error('Chi nhánh này chưa có dòng xe nào cho thuê — chọn chi nhánh ' +
            'khác, hoặc đổi chính sách xe sang "Chỉ mang xe riêng".');
        }
      }

      const byocBody = (email) => {
        const body = {
          vehicle_source: 'BYOC',
          byoc_vehicle_name: 'Xe test ' + email.split('@')[0],
          byoc_vehicle_brand: 'Traxxas',
          byoc_vehicle_class: 'Buggy 1/10',
        };
        const photo = $('byocPhoto').value.trim() ||
          'https://placehold.co/600x400/png?text=Contest+Lab+BYOC';
        body.byoc_vehicle_photos = [photo];
        return body;
      };

      let idx = 0;
      ctx.capacityRejected = [];
      for (const a of ctx.athletes) {
        const email = a.email;
        let r = null;

        try {
        if (policy === 'BYOC_ONLY') {
          r = await call('POST', '/contests/' + ctx.contestId + '/register',
            byocBody(email), a.token);
        } else {
          // Mỗi dòng xe chỉ có đúng số xe quán đang sở hữu, nên bốn người cùng
          // chọn một dòng là người thứ hai đã hết suất. Xoay vòng qua các dòng,
          // hết sạch thì lùi về xe cá nhân nếu giải cho phép.
          let lastErr = null;
          for (let k = 0; k < catalogs.length && !r; k++) {
            const cat = catalogs[(idx + k) % catalogs.length];
            try {
              r = await call('POST', '/contests/' + ctx.contestId + '/register', {
                vehicle_source: 'RENTAL',
                rental: { cafe_id: ctx.cafeId, vehicle_catalog_id: cat.id },
              }, a.token);
              idx = (idx + k + 1) % catalogs.length;
            } catch (e) {
              lastErr = e;
              if (e.code !== 'CONTEST_RENTAL_CATALOG_FULL' && !/hết suất|FULL/i.test(e.message)) throw e;
            }
          }
          if (!r && policy === 'MIXED') {
            log('dim', '  (hết xe cho thuê — ' + email + ' chuyển sang mang xe riêng)');
            r = await call('POST', '/contests/' + ctx.contestId + '/register',
              byocBody(email), a.token);
          }
          if (!r) {
            throw new Error('Hết suất thuê xe ở mọi dòng xe của chi nhánh. Đội xe của quán ' +
              'nhỏ hơn số vận động viên — giảm số người, đổi chính sách xe sang ' +
              '"Cả hai" để tự lùi về xe cá nhân, hoặc chọn chi nhánh có nhiều xe hơn.');
          }
        }
        } catch (e) {
          // Kịch bản "vượt sức chứa" cố tình đăng ký nhiều hơn số suất, nên bị
          // chặn ở đây là KẾT QUẢ MONG ĐỢI chứ không phải hỏng. Chỉ nuốt đúng
          // lỗi đó — mọi lỗi khác vẫn phải nổ ra, không thì kịch bản báo đạt
          // trong khi thật ra nó chết vì lý do chẳng liên quan.
          if (e.code === 'CONTEST_ALREADY_REGISTERED') {
            log('dim', '  (' + email + ' đã được đăng ký ở lượt khác — đồng bộ lại thay vì báo lỗi)');
            continue;
          }
          if (e.code === 'CONTEST_CAPACITY_REACHED' || /CONTEST_CAPACITY_REACHED|đủ sức chứa/i.test(e.message)) {
            ctx.capacityRejected.push(email);
            log('dim', '  (' + email + ' không import vì giải đã đủ chỗ)');
            continue;
          }
          throw e;
        }
        ctx.registrations.push({ id: r.id, email, status: r.status,
          source: r.vehicle_source || r.vehicleSource,
          paymentStatus: r.payment_status || r.entry_fee_status || r.entryFeeStatus });
      }
      const finalRes = await call('GET', '/contests/' + ctx.contestId + '/registrations',
        null, ctx.providerToken);
      const finalRows = finalRes.data || finalRes;
      ctx.registrations = (Array.isArray(finalRows) ? finalRows : [])
        .filter((r) => !['CANCELLED', 'REJECTED'].includes(r.status))
        .map((r) => ({ id: r.id, email: (r.participant && r.participant.email) || r.user_id,
          status: r.status, source: r.vehicle_source || r.vehicleSource,
          paymentStatus: r.payment_status || r.entry_fee_status || r.entryFeeStatus }));
      renderContestSnapshot(contest);
      const byocCount = ctx.registrations.filter((r) => r.source === 'BYOC').length;
      const rentalCount = ctx.registrations.filter((r) => r.source === 'RENTAL').length;
      const feeCounts = (Array.isArray(finalRows) ? finalRows : []).reduce((acc, r) => {
        const key = r.entry_fee_status || r.entryFeeStatus || 'CHƯA XÁC ĐỊNH';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});
      const feeSummary = Object.entries(feeCounts).map(([key, value]) => key + ': ' + value).join(', ');
      return 'Đã đồng bộ ' + ctx.registrations.length + '/' + contest.capacity + ' VĐV' +
        ' · BYOC: ' + byocCount + ' · xe thuê: ' + rentalCount +
        (feeSummary ? ' · phí [' + feeSummary + ']' : '') +
        (created ? ', tạo mới ' + created + ' tài khoản' : '') +
        (ctx.capacityRejected.length ? ', bỏ qua ' + ctx.capacityRejected.length + ' người vì hết chỗ' : '');
    },
  },
  {
    name: 'Xử lý phí dự thi',
    api: 'POST /contest-registrations/:id/mark-entry-fee-paid · /waive-entry-fee',
    run: async () => {
      assertCoDangKy('xử lý phí dự thi');
      if (effectiveEntryFee() <= 0) return 'giải không thu phí, bỏ qua';

      // Mặc định là ĐÃ THU, không phải miễn phí. Miễn phí là ngoại lệ do ban tổ
      // chức quyết, còn giải thật thì vận động viên đóng tiền — dựng toàn bộ ở
      // WAIVED làm mọi màn hình doanh thu trống trơn và báo cáo thu chi vô nghĩa.
      const mode = $('cFeeMode').value;
      if (mode === 'unpaid') {
        return 'để nguyên PENDING_PAYMENT — bước duyệt sau sẽ bị chặn bằng ' +
          'ENTRY_FEE_PENDING, đúng như thiết kế';
      }

      const path = mode === 'waived' ? '/waive-entry-fee' : '/mark-entry-fee-paid';
      const note = mode === 'waived' ? 'Miễn phí từ Contest Lab' : 'Đã thu phí dự thi';
      for (const r of ctx.registrations) {
        if (['MARKED_PAID', 'WAIVED', 'PENDING_REVIEW', 'NOT_REQUIRED'].includes(r.paymentStatus)) {
          continue;
        }
        await call('POST', '/contest-registrations/' + r.id + path, { note }, ctx.providerToken);
        r.paymentStatus = mode === 'waived' ? 'WAIVED' : 'MARKED_PAID';
      }
      const tong = effectiveEntryFee() * ctx.registrations.length;
      return mode === 'waived'
        ? 'đã miễn phí cho ' + ctx.registrations.length + ' người'
        : 'đã thu ' + tong.toLocaleString('vi-VN') + 'đ của ' +
          ctx.registrations.length + ' người';
    },
  },
  {
    name: 'Duyệt đăng ký',
    api: 'POST /contest-registrations/:id/approve',
    run: async () => {
      assertCoDangKy('duyệt');
      for (const r of ctx.registrations) {
        if (['CONFIRMED', 'CHECKED_IN'].includes(r.status)) continue;
        await call('POST', '/contest-registrations/' + r.id + '/approve', {}, ctx.providerToken);
        r.status = 'CONFIRMED';
      }
      return 'đã duyệt ' + ctx.registrations.length + ' người';
    },
  },
  {
    name: 'Đóng đăng ký — OPEN sang CLOSED',
    api: 'POST /contests/:id/close',
    run: async () => {
      const current = await call('GET', '/contests/' + ctx.contestId, null, ctx.providerToken);
      if (['CLOSED', 'RUNNING', 'COMPLETED'].includes(current.status)) {
        syncContestForm(current);
        return 'giải đã ' + current.status + ' — không đóng đăng ký lần hai';
      }
      const c = await call('POST', '/contests/' + ctx.contestId + '/close', {}, ctx.providerToken);
      return 'trạng thái ' + c.status;
    },
  },
  {
    name: 'Điểm danh vận động viên',
    api: 'POST /contest-registrations/:id/check-in',
    run: async () => {
      assertCoDangKy('điểm danh');
      let done = 0;
      for (const r of ctx.registrations) {
        if (r.status === 'CHECKED_IN') continue;
        await checkInOne(r); done++;
      }
      return 'đã điểm danh đúng thời gian ' + done + ' người';
    },
  },
  {
    name: 'Sinh trận đấu — chuyển sang RUNNING',
    api: 'POST /contests/:id/matches/generate',
    run: async () => {
      const res = await call('POST', '/contests/' + ctx.contestId + '/matches/generate',
        { cafe_id: ctx.cafeId, seeding_mode: 'CHECK_IN_ORDER' }, ctx.providerToken);
      const rows = res.data || res.matches || res;
      ctx.matches = Array.isArray(rows) ? rows : [];
      return 'đã sinh ' + ctx.matches.length + ' trận';
    },
  },
  {
    name: 'Nhập kết quả từng trận',
    api: 'Xem trước → POST /contest-matches/:id/results (backend tự advance)',
    run: async () => {
      const phase = contestFormatCode() === 'KNOCKOUT' ? 'FINAL' : 'QUALIFYING';
      return createResultPreview(phase);
    },
  },
  {
    name: 'Công bố bảng xếp hạng — COMPLETED',
    api: 'POST /contests/:id/leaderboard/publish',
    run: async () => {
      await call('POST', '/contests/' + ctx.contestId + '/leaderboard/publish', {},
        ctx.providerToken);
      const c = await call('GET', '/contests/' + ctx.contestId, null, ctx.providerToken);
      return 'trạng thái ' + c.status;
    },
  },
];

// ── Giao diện ────────────────────────────────────────────────────────────────
function renderSteps() {
  const box = $('steps');
  box.innerHTML = '';
  STEPS.forEach((s, i) => {
    const el = document.createElement('div');
    el.className = 'step';
    el.id = 'step' + i;
    el.innerHTML = '<div class="n">' + (i + 1) + '</div>' +
      '<div class="t"><b>' + s.name + '</b><code>' + s.api + '</code>' +
      '<div class="msg"></div></div>';
    const btn = document.createElement('button');
    btn.className = 'ghost';
    btn.textContent = 'Chạy';
    btn.onclick = () => runOne(i);
    el.appendChild(btn);
    if (i === STEP.CHECKIN) {
      const demo = document.createElement('button');
      demo.className = 'danger';
      demo.textContent = 'Demo — điểm danh ngay';
      demo.onclick = () => runDemoCheckIn(i);
      el.appendChild(demo);
    }
    if (i === STEP.RESULTS) {
      btn.textContent = 'Tạo dữ liệu xem trước';
      const confirm = document.createElement('button');
      confirm.className = 'primary';
      confirm.textContent = 'Xác nhận ghi kết quả';
      confirm.onclick = () => runConfirmResults(i);
      el.appendChild(confirm);
      if (contestFormatCode() === 'QUALIFYING_FINAL') {
        const finals = document.createElement('button');
        finals.className = 'ghost';
        finals.textContent = 'Sinh bracket chung kết';
        finals.onclick = () => runGenerateFinalBracket(i);
        el.appendChild(finals);
        const previewFinal = document.createElement('button');
        previewFinal.className = 'ghost';
        previewFinal.textContent = 'Tạo xem trước chung kết';
        previewFinal.onclick = () => runFinalPreview(i);
        el.appendChild(previewFinal);
      }
      const preview = document.createElement('div');
      preview.id = 'resultPreview';
      preview.className = 'picker';
      preview.style.marginTop = '12px';
      preview.style.overflowX = 'auto';
      el.querySelector('.t').appendChild(preview);
    }
    box.appendChild(el);
    if (i === STEP.RESULTS) renderResultPreview(ctx.resultDraft);
  });
}

async function runDemoCheckIn(i) {
  mark(i, 'run', 'đang điểm danh bằng quyền Contest Lab…');
  try {
    assertCoDangKy('điểm danh');
    let done = 0;
    for (const r of ctx.registrations) {
      if (r.status === 'CHECKED_IN') continue;
      await checkInOne(r, true); done++;
    }
    mark(i, 'ok', 'đã điểm danh ngay ' + done + ' người; mỗi lượt đều có audit CONTEST_LAB');
    await adoptContest(ctx.contestId);
  } catch (e) { mark(i, 'err', e.message); }
}

async function runConfirmResults(i) {
  mark(i, 'run', 'đang ghi kết quả đã xem trước…');
  try { mark(i, 'ok', await confirmResultPreview()); showCtx(); }
  catch (e) { mark(i, 'err', e.message); }
}

async function runGenerateFinalBracket(i) {
  mark(i, 'run', 'đang kiểm tra vòng loại và sinh bracket chung kết…');
  try {
    const result = await call('POST', '/contests/' + ctx.contestId +
      '/matches/generate-final-bracket', {}, ctx.providerToken);
    ctx.matches = result.data || result.matches || result;
    ctx.resultDraft = null; renderResultPreview(null); saveState();
    mark(i, 'ok', 'đã sinh bracket chung kết');
  } catch (e) { mark(i, 'err', e.message); }
}

async function runFinalPreview(i) {
  mark(i, 'run', 'đang tạo preview chung kết…');
  try { mark(i, 'ok', await createResultPreview('FINAL')); }
  catch (e) { mark(i, 'err', e.message); }
}

function mark(i, cls, msg) {
  const el = $('step' + i);
  el.className = 'step ' + cls;
  el.querySelector('.msg').textContent = msg || '';
}

function showCtx() {
  const bits = [];
  if (ctx.contestId) bits.push('contest ' + ctx.contestId);
  if (ctx.registrations.length) bits.push(ctx.registrations.length + ' đăng ký');
  if (ctx.matches.length) bits.push(ctx.matches.length + ' trận');
  $('ctxBox').textContent = bits.join('  ·  ');
}

async function runOne(i, automated) {
  mark(i, 'run', 'đang chạy…');
  try {
    let msg;
    if (automated && i === STEP.CHECKIN) {
      let done = 0;
      for (const r of ctx.registrations) {
        if (r.status === 'CHECKED_IN') continue;
        await checkInOne(r, true); done++;
      }
      msg = 'đã điểm danh ngay ' + done + ' người bằng Contest Lab';
    } else if (automated && i === STEP.RESULTS) {
      const format = contestFormatCode();
      await createResultPreview(format === 'KNOCKOUT' ? 'FINAL' : 'QUALIFYING');
      const first = await confirmResultPreview();
      if (format === 'QUALIFYING_FINAL') {
        await call('POST', '/contests/' + ctx.contestId + '/matches/generate-final-bracket',
          {}, ctx.providerToken);
        await createResultPreview('FINAL');
        msg = first + '; ' + await confirmResultPreview();
      } else msg = first;
    } else {
      msg = await STEPS[i].run();
    }
    mark(i, 'ok', msg);
    showCtx(); showResume(); saveState();
    return true;
  } catch (e) {
    mark(i, 'err', e.message);
    return false;
  }
}

async function runTo(n) {
  for (let i = 0; i < n; i++) {
    const ok = await runOne(i, true);
    if (!ok) { log('err', 'Dừng ở bước ' + (i + 1) + '.'); return; }
  }
  log('ok', '── Xong ' + n + ' bước ──');
}

// ── Chỉ số bước ──────────────────────────────────────────────────────────────
// Chạy lô và kịch bản lệch đều cần nhảy vào giữa chuỗi bước. Đếm tay thì mỗi
// lần chèn một bước là mọi chỗ gọi lệch đi một mà không có gì báo.
const STEP = {
  PRELUDE_END: 4, // 0–3: tài khoản · gói thuê bao · chi nhánh · danh mục
  CREATE: 4,
  FEE_ORDER: 5, FEE_TRANSFER: 6, FEE_CONFIRM: 7,
  OPEN: 8,
  ENABLE_REGISTRATION_NOW: 9,
  REGISTER: 10,
  ENTRY_FEE: 11,
  APPROVE: 12,
  CLOSE: 13,
  CHECKIN: 14,
  GENERATE: 15,
  RESULTS: 16,
  PUBLISH: 17,
};

/** Chạy các bước [from, to) — hỏng bước nào thì dừng và ném lỗi ra ngoài. */
async function runRange(from, to) {
  for (let i = from; i < to; i++) {
    const ok = await runOne(i, true);
    if (!ok) throw new Error('dừng ở bước ' + (i + 1) + ' — ' + STEPS[i].name);
  }
}

/** Bỏ giải hiện tại khỏi phiên để lượt sau dựng một giải mới hoàn toàn. */
function resetContest() {
  ctx.contestId = null; ctx.tplName = null; ctx.registrations = []; ctx.matches = [];
  ctx.resultDraft = null;
  ctx.feeOrderId = null; ctx.feeSkipped = false;
  ctx.overrides = null; ctx.nameSuffix = ''; ctx.expectCapacity = false;
  ctx.capacityRejected = [];
}

/** Danh sách giải đã dựng trong phiên, để còn tìm lại được sau khi chạy lô. */
function noteBuilt(id, label) {
  ctx.built = ctx.built || [];
  ctx.built.unshift({ id, label, at: new Date().toLocaleTimeString('vi-VN') });
  renderBuilt();
}

function renderBuilt() {
  const box = $('builtBox');
  const rows = ctx.built || [];
  if (!rows.length) { box.textContent = 'Chưa dựng giải nào.'; return; }
  box.className = 'built';
  box.innerHTML = rows.map((r) =>
    '<div><b>' + r.label + '</b> ' + r.id + '  <span style="opacity:.6">' + r.at + '</span></div>'
  ).join('');
}

// ── Chạy lô ──────────────────────────────────────────────────────────────────
// Muốn thử màn danh sách giải và bộ lọc trạng thái thì cần nhiều giải ở nhiều
// trạng thái cùng lúc. Chạy tay từng cái là điền lại form mỗi lượt, nên phần
// chuẩn bị được tách ra chạy đúng một lần rồi mới lặp phần dựng giải.
const BATCH = [
  { input: 'bDraft', label: 'DRAFT', to: STEP.CREATE + 1 },
  { input: 'bOpen', label: 'OPEN', to: STEP.OPEN + 1 },
  { input: 'bApproved', label: 'OPEN + đã duyệt', to: STEP.APPROVE + 1 },
  { input: 'bClosed', label: 'CLOSED + điểm danh', to: STEP.CHECKIN + 1 },
  { input: 'bRunning', label: 'RUNNING', to: STEP.GENERATE + 1 },
  { input: 'bCompleted', label: 'COMPLETED', to: STEP.PUBLISH + 1 },
  // Huỷ phải có gì đó để mà huỷ — dựng tới lúc đã duyệt xong người tham gia,
  // rồi mới huỷ, thì mới chạm được phần xử lý người đã ghi danh.
  { input: 'bCancelled', label: 'CANCELLED', to: STEP.APPROVE + 1, cancel: true },
];

async function runBatch() {
  const plan = [];
  BATCH.forEach((b) => {
    const n = Number($(b.input).value) || 0;
    for (let i = 0; i < n; i++) plan.push(b);
  });
  if (!plan.length) {
    $('batchStatus').textContent = 'Chưa khai số giải nào — điền ít nhất một ô rồi bấm lại.';
    return;
  }

  const st = $('batchStatus');
  st.textContent = 'Đang chuẩn bị tài khoản và chi nhánh…';
  log('dim', '── Chạy lô: ' + plan.length + ' giải ──');

  try {
    await runRange(0, STEP.PRELUDE_END);
  } catch (e) {
    st.textContent = 'Phần chuẩn bị hỏng nên không dựng được giải nào: ' + e.message;
    log('err', 'Chạy lô dừng ở phần chuẩn bị.');
    return;
  }

  const done = [];
  const failed = [];
  for (const [i, item] of plan.entries()) {
    st.textContent = 'Giải ' + (i + 1) + '/' + plan.length + ' — đang dựng ' + item.label + '…';
    resetContest();
    ctx.nameSuffix = item.label + ' #' + (i + 1);
    try {
      await runRange(STEP.CREATE, item.to);
      if (item.cancel) {
        await call('POST', '/contests/' + ctx.contestId + '/cancel', {}, ctx.providerToken);
        log('ok', '  đã huỷ giải ' + ctx.contestId.slice(0, 8) + '…');
      }
      noteBuilt(ctx.contestId, item.label);
      done.push(item.label);
    } catch (e) {
      failed.push(item.label + ' (' + e.message + ')');
      log('err', 'Giải ' + (i + 1) + ' hỏng: ' + e.message);
    }
  }

  saveState();
  const counts = {};
  done.forEach((l) => { counts[l] = (counts[l] || 0) + 1; });
  const summary = Object.keys(counts).map((k) => counts[k] + ' ' + k).join(' · ');
  st.textContent = 'Đã dựng ' + done.length + '/' + plan.length + ' giải' +
    (summary ? ' — ' + summary : '') +
    (failed.length ? '. Hỏng: ' + failed.join('; ') : '.');
  log(failed.length ? 'err' : 'ok', '── Chạy lô xong: ' + done.length + '/' + plan.length + ' ──');
}

// ── Kịch bản lệch đường ──────────────────────────────────────────────────────
// Mười tám bước ở trên đều đi đường hạnh phúc, mà lỗi hiếm khi nằm ở đó. Bốn
// kịch bản dưới đây cố ý đẩy giải chệch khỏi luồng chuẩn và ghi lại hệ thống
// phản ứng ra sao.
//
// Hai kịch bản đầu là DỰNG DỮ LIỆU — sinh ra trạng thái khó dựng bằng tay, còn
// đúng sai thì người xem tự đánh giá trên giao diện. Hai kịch bản sau có KẾT
// LUẬN ĐẠT/KHÔNG ĐẠT, vì chúng kiểm một chốt chặn cụ thể.

function scSay(html) { $('scResult').innerHTML = html; }
const scOk = (t) => '<span class="sc-ok">' + t + '</span>';
const scBad = (t) => '<span class="sc-bad">' + t + '</span>';

async function fetchMatches() {
  const all = await call('GET', '/contests/' + ctx.contestId + '/matches', null, ctx.providerToken);
  const rows = all.data || all;
  return Array.isArray(rows) ? rows : [];
}

const SCENARIOS = {
  noshow: {
    label: 'VĐV không điểm danh',
    run: async () => {
      await runRange(0, STEP.PRELUDE_END);
      resetContest();
      ctx.nameSuffix = 'no-show';
      await runRange(STEP.CREATE, STEP.CLOSE + 1);

      if (ctx.registrations.length < 2) throw new Error('Cần ít nhất 2 vận động viên');
      const absent = ctx.registrations[ctx.registrations.length - 1];
      const present = ctx.registrations.slice(0, -1);
      for (const r of present) await checkInOne(r);
      log('dim', '  (' + absent.email + ' cố tình KHÔNG điểm danh)');

      await runRange(STEP.GENERATE, STEP.GENERATE + 1);
      const matches = await fetchMatches();
      const inBracket = matches.some((m) => (m.participants || []).some(
        (p) => (p.registration_id || p.registrationId) === absent.id));

      noteBuilt(ctx.contestId, 'RUNNING (thiếu 1 người)');
      scSay('<b>VĐV không điểm danh</b> — ' + present.length + '/' +
        ctx.registrations.length + ' người có mặt, đã sinh ' + matches.length + ' trận.<br>' +
        'Người vắng ' + (inBracket
          ? scBad('VẪN nằm trong bảng đấu') + ' — nhánh đấu đang chờ một người không tới.'
          : scOk('đã bị loại khỏi bảng đấu') + ' — bảng chỉ gồm người đã điểm danh.') +
        '<br>Giải ' + ctx.contestId);
    },
  },

  withdraw: {
    label: 'Bỏ cuộc giữa giải',
    run: async () => {
      await runRange(0, STEP.PRELUDE_END);
      resetContest();
      ctx.nameSuffix = 'bo-cuoc';
      await runRange(STEP.CREATE, STEP.GENERATE + 1);

      const before = await fetchMatches();
      const quitter = ctx.registrations[0];
      const theirMatch = before.find((m) => (m.participants || []).some(
        (p) => (p.registration_id || p.registrationId) === quitter.id));

      await call('POST', '/contest-registrations/' + quitter.id + '/cancel',
        { reason: 'Bỏ cuộc giữa giải — dựng bằng Contest Lab' }, ctx.providerToken);

      const after = await fetchMatches();
      const stillThere = after.some((m) => (m.participants || []).some(
        (p) => (p.registration_id || p.registrationId) === quitter.id));
      const m2 = theirMatch ? after.find((m) => m.id === theirMatch.id) : null;

      const left = m2 ? (m2.participants || []).length : null;
      noteBuilt(ctx.contestId, 'RUNNING (1 người bỏ cuộc)');
      scSay('<b>Bỏ cuộc giữa giải</b> — ' + quitter.email + ' rút khỏi giải khi đã có ' +
        before.length + ' trận.<br>' +
        'Sau khi huỷ, người đó ' + (stillThere
          ? scBad('vẫn còn trong trận đang chờ') + ' — trận này sẽ treo mãi.'
          : scOk('đã được gỡ khỏi mọi trận chưa đấu') + '.') +
        (m2 ? '<br>Trận của họ giờ ở trạng thái <b>' + m2.status + '</b>, còn <b>' +
          left + '</b> người.' +
          // Trận rỗng không tự kết thúc và cũng không ai đấu được — nó đứng đó
          // chặn giải không sang được vòng sau. Nêu thẳng ra thay vì để lọt.
          (left === 0
            ? ' ' + scBad('Trận rỗng') + ' — không còn ai để đấu mà trận vẫn chưa kết thúc. ' +
              'Kiểm tra xem giải có chốt được vòng này không.'
            : '')
          : '') +
        '<br>Giải ' + ctx.contestId);
    },
  },

  cancelPaid: {
    label: 'Huỷ giải sau khi đã thu phí dự thi',
    run: async () => {
      await runRange(0, STEP.PRELUDE_END);
      resetContest();
      ctx.nameSuffix = 'huy-sau-khi-thu-phi';
      // Kịch bản này chỉ có nghĩa khi CÓ tiền để mà mất. Form đang để 0 thì tự
      // đặt một mức phí, không thì "huỷ giải đã thu phí" thành huỷ giải miễn phí.
      const fee = Number($('cFee').value) > 0 ? Number($('cFee').value) : 50000;
      ctx.overrides = { entry_fee: fee };

      await runRange(STEP.CREATE, STEP.OPEN + 1);
      await runRange(STEP.REGISTER, STEP.REGISTER + 1);

      // Ghi nhận ĐÃ THU TIỀN, không phải miễn phí — khác hẳn bước chuẩn.
      for (const r of ctx.registrations) {
        await call('POST', '/contest-registrations/' + r.id + '/mark-entry-fee-paid',
          { note: 'Đã thu phí dự thi — dựng bằng Contest Lab' }, ctx.providerToken);
      }
      await runRange(STEP.APPROVE, STEP.APPROVE + 1);

      const total = fee * ctx.registrations.length;
      await call('POST', '/contests/' + ctx.contestId + '/cancel', {}, ctx.providerToken);

      const res = await call('GET', '/contests/' + ctx.contestId + '/registrations',
        null, ctx.providerToken);
      const regs = res.data || res;
      // Trạng thái tiền nằm ở payment_status của đăng ký, không phải một trường
      // riêng tên entry_fee_* — đọc sai tên thì báo cáo ra "KHÔNG RÕ" và kịch bản
      // này mất hết ý nghĩa, vì tiền chính là thứ nó theo dõi.
      const counts = {};
      (Array.isArray(regs) ? regs : []).forEach((r) => {
        const paid = r.payment_status || r.paymentStatus || 'KHÔNG RÕ';
        const k = 'tiền ' + paid + ' · đăng ký ' + r.status;
        counts[k] = (counts[k] || 0) + 1;
      });

      noteBuilt(ctx.contestId, 'CANCELLED (đã thu phí)');
      scSay('<b>Huỷ giải sau khi đã thu phí dự thi</b> — ' + ctx.registrations.length +
        ' người đã trả ' + total.toLocaleString('vi-VN') + 'đ, rồi giải bị huỷ.<br>' +
        'Trạng thái phí/đăng ký sau khi huỷ: <b>' +
        Object.keys(counts).map((k) => counts[k] + '× ' + k).join(' · ') + '</b><br>' +
        'Mở giải này trên giao diện và đối chiếu: tiền đã thu có đường về tay khách không?' +
        '<br>Giải ' + ctx.contestId);
    },
  },

  overCapacity: {
    label: 'Đăng ký vượt sức chứa',
    run: async () => {
      const n = $('athletes').value.split('\n').map((s) => s.trim()).filter(Boolean).length;
      if (n < 2) throw new Error('Cần ít nhất 2 vận động viên để thử vượt sức chứa');

      await runRange(0, STEP.PRELUDE_END);
      resetContest();
      ctx.nameSuffix = 'vuot-suc-chua';
      // Sức chứa ít hơn số người đúng một suất: người cuối cùng PHẢI bị chặn.
      ctx.overrides = { capacity: n - 1 };
      ctx.expectCapacity = true;

      await runRange(STEP.CREATE, STEP.OPEN + 1);
      await runRange(STEP.REGISTER, STEP.REGISTER + 1);

      // Xử phí cho những người đã vào được. Bỏ qua bước này thì họ nằm ở
      // PENDING_PAYMENT và job dọn huỷ hết sau 30 phút — giải vừa dựng để xem
      // chốt chặn sức chứa sẽ tự rỗng đi, và lần sau mở lên không còn gì.
      await runRange(STEP.ENTRY_FEE, STEP.ENTRY_FEE + 1);

      const accepted = ctx.registrations.length;
      const rejected = ctx.capacityRejected.length;
      ctx.expectCapacity = false;

      const pass = accepted === n - 1 && rejected === 1;
      noteBuilt(ctx.contestId, 'OPEN (thử vượt sức chứa)');
      scSay('<b>Đăng ký vượt sức chứa</b> — sức chứa ' + (n - 1) + ', cho ' + n +
        ' người cùng đăng ký.<br>Nhận ' + accepted + ', chặn ' + rejected + '. ' +
        (pass
          ? scOk('ĐẠT') + ' — chốt chặn sức chứa hoạt động, người thứ ' + n +
            ' bị từ chối bằng CONTEST_CAPACITY_REACHED.'
          : scBad('KHÔNG ĐẠT') + ' — nhận đủ ' + accepted + ' người trong khi chỉ có ' +
            (n - 1) + ' suất. Giải nhận quá số người mà không có gì chặn lại.') +
        '<br>Giải ' + ctx.contestId);
    },
  },
};

async function runScenario(key) {
  const sc = SCENARIOS[key];
  scSay('Đang chạy <b>' + sc.label + '</b>…');
  log('dim', '── Kịch bản: ' + sc.label + ' ──');
  try {
    await sc.run();
    saveState();
    log('ok', '── Kịch bản xong ──');
  } catch (e) {
    ctx.expectCapacity = false;
    scSay('<b>' + sc.label + '</b> — ' + scBad('không chạy trọn') + ': ' + e.message);
    log('err', 'Kịch bản hỏng: ' + e.message);
  }
}

// Chi nhánh KHÔNG nằm trong danh mục chung — xem chú thích ở loadMyCafes.
/**
 * Chỉ KHUÔN MẪU có ô để chọn.
 *
 * Mỗi khuôn mẫu ghim sẵn đúng một cặp loại giải + thể thức
 * (contest_templates.contest_type_id và contest_format_id). Để ba ô rời
 * nhau thì với 2 loại × 3 thể thức × 3 khuôn mẫu có 18 tổ hợp mà chỉ 3 hợp lệ
 * — 15 tổ hợp còn lại bị backend từ chối bằng CONTEST_TEMPLATE_MISMATCH, và
 * người dùng chọn xong mới biết mình sai.
 *
 * Loại giải và thể thức suy ra từ khuôn mẫu, hiện ra để đọc chứ không cho sửa.
 */
const CATALOG = [
  { sel: 'cTemplate', path: '/contest-catalog/templates', label: 'khuôn mẫu' },
];

/** Danh mục loại giải và thể thức — chỉ để tra TÊN cho khuôn mẫu đang chọn. */
async function loadTemplateLookups() {
  const flat = (x) => (Array.isArray(x) ? x : (x && x.data) || []);
  const [types, formats] = await Promise.all([
    call('GET', '/contest-catalog/types').then(flat).catch(() => []),
    call('GET', '/contest-catalog/formats').then(flat).catch(() => []),
  ]);
  ctx.typeNames = {};
  types.forEach((t) => { ctx.typeNames[t.id] = t.name; });
  ctx.formatNames = {};
  formats.forEach((f) => { ctx.formatNames[f.id] = f.name; });
}

/** Khuôn mẫu đang chọn, kèm hai id nó ghim sẵn. */
/**
 * Chọn sẵn "Đấu loại trực tiếp" thay vì để mục đầu danh sách.
 *
 * Danh mục sắp theo sortOrder, mà "Đua tính giờ" đang là 0 nên nó luôn đứng
 * đầu — tức là mặc định của ô chọn. Nhưng giải loại trực tiếp mới là thứ hay
 * dựng nhất khi thử: nó có sơ đồ nhánh, có trận để bấm, có người thắng đi tiếp.
 * Đua tính giờ chỉ là một bảng thành tích.
 *
 * Chỉ đổi mặc định của CÔNG CỤ này, không đụng sortOrder trong cơ sở dữ liệu:
 * cột đó còn quyết định thứ tự ở màn tạo giải thật của chủ sân.
 *
 * Chạy trước bước khôi phục trạng thái phiên, nên lựa chọn lần trước của người
 * dùng vẫn thắng — đây chỉ là giá trị khởi đầu khi chưa chọn gì.
 */
function chonMacDinhKhuonMau(rows) {
  const uu = (rows || []).find((t) => t.code === 'provider_standard_knockout');
  if (uu) $('cTemplate').value = uu.id;
}

function selectedTemplate() {
  const id = $('cTemplate').value;
  return (ctx.templates || []).find((t) => t.id === id) || null;
}

/** Hiện loại giải và thể thức suy ra, để người dùng thấy mình sắp tạo cái gì. */
function showTemplateDerived() {
  const st = $('tplStatus');
  const tpl = selectedTemplate();
  if (!tpl) { st.textContent = 'Chưa chọn khuôn mẫu.'; return; }
  const typeId = tpl.contestTypeId || tpl.contest_type_id;
  const formatId = tpl.contestFormatId || tpl.contest_format_id;
  st.innerHTML = 'Đang chọn: loại giải <b>' + ((ctx.typeNames || {})[typeId] || '?') +
    '</b> · thể thức <b>' + ((ctx.formatNames || {})[formatId] || '?') + '</b>';
}

/**
 * Ô chi nhánh chỉ liệt kê chi nhánh CỦA provider đang đăng nhập.
 *
 * Nạp cả /cafes công khai thì ô hiện chi nhánh của mọi provider trên hệ thống.
 * Chọn nhầm một cái không thuộc mình, bước tạo giải bị từ chối bằng một lỗi
 * không nhắc gì tới quyền sở hữu — người dùng chọn đúng thứ trang đưa ra mà vẫn
 * sai, và không có cách nào đoán ra tại sao.
 *
 * Vì vậy trước khi đăng nhập provider, ô này để trống có chủ đích.
 */
async function loadMyCafes() {
  const st = $('provStatus');
  if (!ctx.providerToken || !ctx.providerId) {
    fillSelect('cCafe', [], 'name');
    st.textContent = 'Chưa đăng nhập — ô chi nhánh ở mục 2 còn trống.';
    return [];
  }

  let res;
  try {
    // Token khôi phục từ phiên trước có thể đã hết hạn — JWT sống 1 giờ. Mật
    // khẩu vẫn nằm sẵn trong form nên tự đăng nhập lại, thay vì bắt người dùng
    // bấm thêm một nút để làm đúng việc mà công cụ tự làm được.
    res = await thuLaiKhiHetHan(
      () => call('GET', '/cafes?limit=50', null, ctx.providerToken),
      async () => {
        const p = await login($('pEmail').value, $('pPwd').value);
        ctx.providerToken = p.token;
        ctx.providerId = p.user.id;
      },
    );
  } catch (e) {
    ctx.providerToken = null; ctx.providerId = null;
    fillSelect('cCafe', [], 'name');
    st.textContent = 'Không đăng nhập lại được: ' + e.message;
    return [];
  }
  const rows = res.data || res;
  // Danh sách chi nhánh trả về camelCase, khác hầu hết endpoint khác dùng
  // snake_case — nhận cả hai để không phụ thuộc vào một kiểu đặt tên.
  const owned = rows.filter((c) => (c.providerId || c.provider_id) === ctx.providerId);
  fillSelect('cCafe', owned, 'name');
  ctx.cafeId = $('cCafe').value || null;
  await loadTrackTypesForCafe();
  st.textContent = owned.length
    ? 'Provider ' + ctx.providerId.slice(0, 8) + '… — ô chi nhánh đang lọc còn ' +
      owned.length + ' chi nhánh của riêng tài khoản này.'
    : 'Provider này chưa có chi nhánh nào. Bước 3 sẽ tự tạo một cái khi bạn chạy.';
  return owned;
}

// Nạp từng ô ĐỘC LẬP. Gộp vào một Promise.all thì chỉ cần một endpoint hỏng là
// không ô nào được đổ dữ liệu, và người dùng nhìn thấy năm ô rỗng trơ mà không
// biết cái nào hỏng.
/**
 * Loại sân phải lấy theo CHI NHÁNH đang chọn, không phải danh sách toàn hệ thống.
 *
 * Khi tạo giải, hệ thống kiểm bảng cafe_track_configs đang bật của đúng chi nhánh
 * đó. Một loại sân có trong danh mục chung nhưng chi nhánh đã tắt thì vẫn hiện
 * ra ở ô chọn mà tạo giải lại bị từ chối với CONTEST_TRACK_TYPE_UNAVAILABLE —
 * người dùng chọn đúng thứ được đưa ra mà vẫn sai.
 */
async function loadTrackTypesForCafe() {
  const cafeId = $('cCafe').value;
  const st = $('trackStatus');
  if (!cafeId) { fillSelect('cTrack', [], 'name'); return; }
  try {
    const res = await call('GET', '/cafes/' + cafeId + '/track-configs');
    const rows = (Array.isArray(res) ? res : res.data || []).filter((r) => r.is_active !== false);
    fillSelect('cTrack', rows.map((r) => ({
      id: r.track_type_id,
      name: (r.track_type && r.track_type.name) || r.track_type_id,
    })), 'name');
    st.textContent = rows.length
      ? 'Chi nhánh này đang bật ' + rows.length + ' loại sân.'
      : 'Chi nhánh này chưa bật loại sân nào — chọn chi nhánh khác.';
  } catch (e) {
    fillSelect('cTrack', [], 'name');
    st.textContent = 'Không đọc được loại sân của chi nhánh: ' + e.message;
  }
}

// ── Chọn vận động viên từ tài khoản có sẵn ───────────────────────────────────
// Gõ tay từng email thì tới người thứ mười đã hết kiên nhẫn, mà giải thật cần
// mười sáu hoặc ba hai. Bảng chọn đọc thẳng danh sách khách trong hệ thống.

/**
 * Khoá mở trang, lấy lại từ địa chỉ đang mở.
 *
 * Endpoint /dev-tools/customers nằm sau chính hàng rào khoá như trang này. Gọi
 * mà quên kèm khoá thì nhận 404 — trông y hệt "endpoint không tồn tại", và
 * người sửa sẽ đi tìm lỗi ở chỗ hoàn toàn khác.
 */
const DEV_KEY = new URLSearchParams(location.search).get('key');

function devPath(p) {
  if (!DEV_KEY) return p;
  return p + (p.indexOf('?') >= 0 ? '&' : '?') + 'key=' + encodeURIComponent(DEV_KEY);
}

/** Gọi endpoint ngoài /api/v1 — dev-tools nằm ở gốc, không nằm dưới tiền tố API. */
async function callDev(path, token) {
  log('req', 'GET ' + path);
  const res = await fetch(location.origin + devPath(path), {
    headers: token ? { Authorization: 'Bearer ' + token } : {},
  });
  let json = null;
  try { json = await res.json(); } catch (e) { json = null; }
  if (!res.ok) {
    const msg = (json && (json.message || json.error)) || ('HTTP ' + res.status);
    log('err', '  ✗ ' + res.status + ' ' + msg);
    // Gắn mã HTTP vào lỗi: chỗ gọi cần phân biệt 401 với mọi lỗi khác, và
    // dò chuỗi thông báo thì đổi câu chữ một lần là hỏng.
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  log('ok', '  ✓ ' + res.status + '  ' + short(json && json.data !== undefined ? json.data : json));
  return json && json.data !== undefined ? json.data : json;
}

/** Ghi lựa chọn xuống ô nhập — ô đó vẫn là nguồn duy nhất các bước đọc. */
function syncPicked() {
  const picked = ctx.picked || [];
  if (picked.length) $('athletes').value = picked.join('\n');
  const n = picked.length;
  const pow2 = n >= 2 && (n & (n - 1)) === 0;
  $('pickStatus').innerHTML = n
    ? 'Đã chọn <b>' + n + '</b> người. ' + (pow2
        ? scOk('Là luỹ thừa của 2') + ' — bảng nhánh loại trực tiếp tròn vòng.'
        : 'Không phải luỹ thừa của 2 — thể thức loại trực tiếp sẽ có suất trống. ' +
          'Không sao với đua tính giờ hay vòng tròn.')
    : 'Chưa chọn ai — công cụ dùng những gì đang có trong ô bên dưới.';
  saveState();
}

function renderCustomers() {
  const box = $('custList');
  const term = $('custSearch').value.trim().toLowerCase();
  const rows = (ctx.customers || []).filter((c) =>
    !term || c.email.toLowerCase().indexOf(term) >= 0 ||
    (c.full_name || '').toLowerCase().indexOf(term) >= 0);

  if (!rows.length) {
    box.innerHTML = (ctx.customers || []).length
      ? 'Không có ai khớp "' + term + '".'
      : 'Chưa nạp danh sách.';
    return;
  }

  const picked = new Set(ctx.picked || []);
  box.innerHTML = '';
  rows.forEach((c) => {
    const lb = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = picked.has(c.email);
    cb.onchange = () => {
      const set = new Set(ctx.picked || []);
      if (cb.checked) set.add(c.email); else set.delete(c.email);
      ctx.picked = Array.from(set);
      syncPicked();
    };
    const em = document.createElement('span');
    em.className = 'em'; em.textContent = c.email;
    const nm = document.createElement('span');
    nm.className = 'nm'; nm.textContent = c.full_name || '';
    lb.appendChild(cb); lb.appendChild(em); lb.appendChild(nm);
    box.appendChild(lb);
  });
}

/** Những người đang hiện sau bộ lọc — mọi nút chọn hàng loạt đều tính trên tập này. */
function visibleCustomers() {
  const term = $('custSearch').value.trim().toLowerCase();
  return (ctx.customers || []).filter((c) =>
    !term || c.email.toLowerCase().indexOf(term) >= 0 ||
    (c.full_name || '').toLowerCase().indexOf(term) >= 0);
}

/**
 * Chạy một lời gọi cần token, tự đăng nhập lại đúng MỘT lần khi token hết hạn.
 *
 * Token được lưu trong localStorage nên sống qua F5, nhưng JWT chỉ có hiệu lực
 * một giờ. Không tự làm mới thì mọi nút bấm sau một tiếng đều trả 401, và câu
 * "Token invalid or expired" không nói cho người dùng biết phải làm gì — trong
 * khi mật khẩu vẫn đang nằm sẵn trong form ngay trên màn hình.
 *
 * Chỉ thử lại một lần: đăng nhập lại mà vẫn 401 thì lỗi nằm ở tài khoản, thử
 * mãi chỉ tốn thêm lượt và có thể chạm bộ đếm chống dò mật khẩu.
 */
async function thuLaiKhiHetHan(goi, dangNhapLai) {
  try {
    return await goi();
  } catch (e) {
    if (e.status !== 401) throw e;
    log('dim', '  (token hết hạn — đăng nhập lại)');
    await dangNhapLai();
    return goi();
  }
}

/** Token admin còn hiệu lực, đăng nhập nếu chưa có. */
async function layTokenAdmin() {
  const a = await login($('aEmail').value, $('aPwd').value);
  ctx.adminToken = a.token;
  return a.token;
}

async function loadCustomers() {
  const box = $('custList');
  box.textContent = 'Đang nạp…';
  // Danh sách khách chỉ admin đọc được. Đăng nhập ngay tại đây thay vì bắt chạy
  // bước 1 trước — người dùng bấm nút này lúc còn đang điền form.
  if (!ctx.adminToken) await layTokenAdmin();
  ctx.customers = await thuLaiKhiHetHan(
    () => callDev('/dev-tools/customers?limit=500', ctx.adminToken),
    layTokenAdmin,
  );
  ctx.picked = ctx.picked || [];
  renderCustomers();
  log('ok', 'Đã nạp ' + ctx.customers.length + ' tài khoản khách.');
}

// ── Đi tiếp một giải có sẵn ──────────────────────────────────────────────────
//
// Công cụ chỉ tự nhớ giải do CHÍNH nó tạo, và chỉ trong trình duyệt này. Giải
// tạo ở nơi khác thì ctx.registrations rỗng — mà các bước duyệt, điểm danh,
// nhập kết quả đều lặp qua mảng đó. Rỗng thì vòng lặp không chạy lần nào và
// bước vẫn báo "đã duyệt 0 người" như thể xong việc.
//
// Nạp lại từ máy chủ là cách duy nhất để chạy tiếp mà không dựng dữ liệu lệch.

async function loadProviderContests() {
  const st = $('adoptStatus');
  if (!ctx.providerToken) {
    st.textContent = 'Chưa đăng nhập provider — bấm nút đăng nhập ở mục 1 trước.';
    return;
  }
  const res = await call('GET', '/contests?limit=100', null, ctx.providerToken);
  const rows = (res.data || res).filter((c) => c.provider_id === ctx.providerId ||
    c.providerId === ctx.providerId || !c.provider_id);
  fillSelect('pickContest', rows.map((c) => ({
    id: c.id,
    name: '[' + c.status + '] ' + c.name,
  })), 'name');
  st.textContent = rows.length
    ? 'Đã nạp ' + rows.length + ' giải. Chọn một cái rồi bấm đi tiếp.'
    : 'Provider này chưa có giải nào.';
}

/**
 * Nhận một giải có sẵn vào phiên làm việc.
 *
 * Đọc lại đăng ký và trận đấu từ máy chủ chứ không đoán: chỉ giữ những đăng ký
 * CÒN SỐNG, vì người đã huỷ hay bị loại không được đưa vào các bước sau. Duyệt
 * lại một người đã huỷ thì hoặc lỗi, hoặc tệ hơn là kéo họ về giải.
 */
async function adoptContest(contestId) {
  const st = $('adoptStatus');
  if (!contestId) { st.textContent = 'Chưa chọn giải nào.'; return; }
  if (!ctx.providerToken) { st.textContent = 'Chưa đăng nhập provider.'; return; }

  const contest = await call('GET', '/contests/' + contestId, null, ctx.providerToken);

  const regRes = await call('GET', '/contests/' + contestId + '/registrations',
    null, ctx.providerToken);
  const regRows = regRes.data || regRes;
  const CHET = ['CANCELLED', 'REJECTED'];
  const song = (Array.isArray(regRows) ? regRows : []).filter((r) => !CHET.includes(r.status));

  resetContest();
  ctx.contestId = contest.id;
  // Chi nhánh lấy từ chính giải, không lấy từ ô chọn: ô đó có thể đang trỏ
  // chi nhánh khác, và điểm danh sai chi nhánh là dữ liệu lệch không thấy ngay.
  ctx.cafeId = (contest.participating_cafe_ids && contest.participating_cafe_ids[0]) ||
    (contest.cafes && contest.cafes[0] && contest.cafes[0].id) ||
    $('cCafe').value;

  ctx.registrations = song.map((r) => ({
    id: r.id,
    email: (r.participant && r.participant.email) || r.user_id,
    status: r.status,
    source: r.vehicle_source || r.vehicleSource,
    paymentStatus: r.payment_status || r.entry_fee_status || r.entryFeeStatus,
  }));
  syncContestForm(contest);

  try {
    ctx.matches = await fetchMatches();
  } catch (e) { ctx.matches = []; }

  // Điền lại ô nhập vận động viên theo đúng người đang có trong giải, để các
  // bước còn dùng tới danh sách email không chạy trên người của giải khác.
  const emails = ctx.registrations.map((r) => r.email).filter((e) => String(e).includes('@'));
  if (emails.length) $('athletes').value = emails.join('\n');

  saveState(); showResume(); showCtx(); renderSteps();

  const bo = CHET.length && regRows.length !== song.length
    ? ' (bỏ qua ' + (regRows.length - song.length) + ' đăng ký đã huỷ/bị từ chối)'
    : '';
  st.innerHTML = 'Đang đi tiếp <b>' + contest.name + '</b> — trạng thái <b>' + contest.status +
    '</b>, ' + ctx.registrations.length + ' đăng ký còn hiệu lực' + bo + ', ' +
    ctx.matches.length + ' trận.<br>' + goiYBuocTiep(contest.status);
  log('ok', 'Đã nạp giải ' + contest.id + ' — ' + contest.status);
}

/** Chỉ đúng nút nên bấm tiếp, thay vì bắt người dùng tự đoán trong 17 bước. */
function goiYBuocTiep(status) {
  const goiY = {
    DRAFT: 'Bấm <b>OPEN — đang mở đăng ký</b> để mở đăng ký.',
    OPEN: 'Bấm <b>OPEN + đã duyệt VĐV</b> hoặc <b>CLOSED + đã điểm danh</b>.',
    CLOSED: 'Bấm <b>RUNNING — đã có trận</b> để sinh bảng đấu.',
    RUNNING: 'Bấm <b>COMPLETED — đủ kết quả</b> để nhập kết quả và công bố.',
    COMPLETED: 'Giải đã xong — không còn bước nào để chạy.',
    CANCELLED: 'Giải đã huỷ — không chạy tiếp được.',
  };
  return goiY[status] || 'Chọn một nút ở mục dừng-trạng-thái để chạy tiếp.';
}

// ── Tạo chi nhánh ────────────────────────────────────────────────────────────
//
// Toàn bộ số liệu dưới đây là địa danh, tên đường và toạ độ CÓ THẬT. Sinh bừa
// thì bản đồ ghim chi nhánh xuống giữa ruộng hoặc ngoài biển, và người xem demo
// nhận ra ngay — mà bản đồ lại là thứ đầu tiên hiện lên ở trang tìm chi nhánh.

const KHU_VUC = [
  { city: 'TP. Hồ Chí Minh', district: 'Quận 7', lat: 10.7340, lng: 106.7215,
    streets: ['Nguyễn Thị Thập', 'Huỳnh Tấn Phát', 'Nguyễn Lương Bằng'] },
  { city: 'TP. Hồ Chí Minh', district: 'TP. Thủ Đức', lat: 10.8020, lng: 106.7500,
    streets: ['Nguyễn Duy Trinh', 'Đỗ Xuân Hợp', 'Lê Văn Việt'] },
  { city: 'TP. Hồ Chí Minh', district: 'Quận Tân Bình', lat: 10.8010, lng: 106.6520,
    streets: ['Cộng Hòa', 'Hoàng Văn Thụ', 'Trường Chinh'] },
  { city: 'TP. Hồ Chí Minh', district: 'Quận Gò Vấp', lat: 10.8380, lng: 106.6650,
    streets: ['Quang Trung', 'Phan Văn Trị', 'Nguyễn Oanh'] },
  { city: 'TP. Hồ Chí Minh', district: 'Quận Bình Thạnh', lat: 10.8040, lng: 106.7100,
    streets: ['Điện Biên Phủ', 'Xô Viết Nghệ Tĩnh', 'Nguyễn Xí'] },
  { city: 'Hà Nội', district: 'Quận Cầu Giấy', lat: 21.0300, lng: 105.7900,
    streets: ['Trần Thái Tông', 'Duy Tân', 'Nguyễn Phong Sắc'] },
  { city: 'Hà Nội', district: 'Quận Thanh Xuân', lat: 20.9950, lng: 105.8050,
    streets: ['Nguyễn Trãi', 'Lê Văn Lương', 'Khuất Duy Tiến'] },
  { city: 'Hà Nội', district: 'Quận Long Biên', lat: 21.0450, lng: 105.8800,
    streets: ['Nguyễn Văn Cừ', 'Ngô Gia Tự', 'Cổ Linh'] },
  { city: 'Hà Nội', district: 'Quận Hà Đông', lat: 20.9710, lng: 105.7750,
    streets: ['Quang Trung', 'Tô Hiệu', 'Lê Trọng Tấn'] },
  { city: 'Đà Nẵng', district: 'Quận Hải Châu', lat: 16.0600, lng: 108.2100,
    streets: ['Nguyễn Văn Linh', 'Hoàng Diệu', '2 Tháng 9'] },
  { city: 'Đà Nẵng', district: 'Quận Sơn Trà', lat: 16.0800, lng: 108.2300,
    streets: ['Ngô Quyền', 'Phạm Văn Đồng', 'Hồ Nghinh'] },
  { city: 'Đà Nẵng', district: 'Quận Ngũ Hành Sơn', lat: 16.0300, lng: 108.2500,
    streets: ['Võ Nguyên Giáp', 'Lê Văn Hiến', 'Nguyễn Văn Thoại'] },
];

const TEN_QUAN = ['RC Arena', 'Drift House', 'Speed Zone', 'RC Field', 'Turbo Track',
  'Apex RC', 'Nitro Club', 'Off-Road Base', 'Pit Stop RC', 'Redline RC'];

/** Hai kiểu sân có giờ giấc khác hẳn nhau — sân ngoài trời nghỉ thứ Hai. */
const KIEU_SAN = [
  {
    ten: 'trong nhà',
    mo: (d) => ({ open: '09:00', close: '22:00', is_closed: false }),
    mo_ta: 'Sân RC trong nhà, mặt sàn nhựa cho xe on-road và đường drift riêng. ' +
      'Có khu pit sửa xe, quầy cà phê và chỗ ngồi cho người đi kèm.',
  },
  {
    ten: 'ngoài trời',
    // Thứ Hai nghỉ bảo trì mặt sân — chi tiết nhỏ này làm lịch trông như lịch
    // thật thay vì bảy ngày giống hệt nhau.
    mo: (d) => (d === 'mon'
      ? { open: '00:00', close: '00:00', is_closed: true }
      : (d === 'sat' || d === 'sun')
        ? { open: '08:00', close: '22:00', is_closed: false }
        : { open: '14:00', close: '22:00', is_closed: false }),
    mo_ta: 'Sân off-road ngoài trời có địa hình đồi dốc và hố cát, kèm một vòng ' +
      'circuit nền bê tông. Nghỉ thứ Hai để bảo trì mặt sân.',
  },
];

const NOI_QUY = [
  'Không mang xe chạy xăng vào khu vực sân trong nhà',
  'Trẻ dưới 12 tuổi phải có người lớn đi kèm',
  'Kiểm tra pin và tần số trước khi vào sân để tránh nhiễu sóng',
  'Hư hỏng do va chạm cố ý sẽ tính phí theo bảng giá linh kiện',
  'Trả xe đúng giờ, quá 15 phút tính thêm một lượt',
];

/** Dòng xe có thật kèm giá thuê hợp lý theo phân hạng. */
const DONG_XE = [
  { name: 'Tamiya TT-02 Drift Spec', tier: 'STANDARD', rate: 45000,
    desc: 'Xe drift phổ thông, dễ điều khiển, hợp người mới.' },
  { name: 'Yokomo YD-2 EXII', tier: 'PREMIUM', rate: 120000,
    desc: 'Khung drift chuyên dụng, gyro chỉnh được, dành cho người đã quen tay.' },
  { name: 'Traxxas Slash 4x4', tier: 'PREMIUM', rate: 95000,
    desc: 'Short course 4WD, chạy tốt cả nền bê tông lẫn đường đất.' },
  { name: 'Arrma Typhon 3S BLX', tier: 'PREMIUM', rate: 110000,
    desc: 'Buggy tốc độ cao, mô tơ không chổi than, cần sân rộng.' },
  { name: 'Kyosho Fazer Mk2', tier: 'STANDARD', rate: 55000,
    desc: 'Touring on-road bền, phù hợp chạy vòng circuit.' },
  { name: 'Team Associated RC10B7', tier: 'RESTRICTED', rate: 160000,
    desc: 'Buggy thi đấu, chỉ giao cho người đã có kinh nghiệm.' },
  { name: 'Losi Mini-T 2.0', tier: 'STANDARD', rate: 35000,
    desc: 'Xe cỡ nhỏ, hợp sân hẹp và người chơi nhỏ tuổi.' },
];

const MAU_XE = ['Đỏ', 'Xanh dương', 'Đen', 'Trắng', 'Cam', 'Xanh lá', 'Vàng', 'Xám'];

const THUC_DON = [
  { nhom: 'Cà phê', mon: [
    { name: 'Cà phê sữa đá', price: 30000, desc: 'Cà phê phin truyền thống, sữa đặc.' },
    { name: 'Bạc xỉu', price: 35000, desc: 'Nhiều sữa, ít cà phê.' },
    { name: 'Americano', price: 40000, desc: 'Espresso pha loãng, không đường.' },
    { name: 'Cold brew', price: 50000, desc: 'Ủ lạnh 12 tiếng, vị dịu.' },
  ] },
  { nhom: 'Trà và nước ép', mon: [
    { name: 'Trà đào cam sả', price: 45000, desc: 'Đào ngâm, cam tươi, sả đập.' },
    { name: 'Trà vải', price: 42000, desc: 'Trà đen ủ lạnh với vải thiều.' },
    { name: 'Nước ép cam', price: 45000, desc: 'Cam sành vắt tại quầy.' },
  ] },
  { nhom: 'Đồ ăn vặt', mon: [
    { name: 'Khoai tây chiên', price: 45000, desc: 'Ăn kèm sốt phô mai.' },
    { name: 'Gà rán 3 miếng', price: 65000, desc: 'Chiên giòn, kèm tương ớt.' },
    { name: 'Bánh mì que pate', price: 25000, desc: 'Bánh nhỏ ăn nhanh giữa lượt chạy.' },
    { name: 'Mì xào bò', price: 60000, desc: 'Mì trứng xào thịt bò và rau cải.' },
  ] },
];

const MA_NGAN_HANG = ['VCB', 'TCB', 'MB', 'ACB', 'TPB', 'VPB', 'BIDV'];
const NGAY = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/** Số di động Việt Nam hợp lệ — đầu số thật, không phải dãy số bịa. */
function soDienThoai() {
  const dau = ['090', '091', '093', '094', '096', '097', '098', '032', '033',
    '034', '035', '036', '037', '038', '039', '070', '076', '077', '078', '079'];
  let s = pick(dau);
  for (let i = 0; i < 7; i++) s += Math.floor(Math.random() * 10);
  return s;
}

/** Nhích toạ độ vài trăm mét quanh tâm quận, để nhiều chi nhánh không chồng lên nhau. */
function lech(goc) {
  return Math.round((goc + (Math.random() - 0.5) * 0.02) * 1e6) / 1e6;
}

/**
 * Phần tên lấy từ quận để đặt tên quán.
 *
 * Cắt thẳng chữ "Quận " thì "Quận 7" còn trơ lại số 7, ra "Drift House 7" —
 * nghe như chi nhánh thứ bảy chứ không phải quán ở Quận 7.
 */
function tenKhu(district) {
  const so = district.match(/^Quận (\d+)$/);
  if (so) return 'Q' + so[1];
  return district.replace(/^(Quận|Huyện|Thị xã|TP\.) /, '');
}

function duLieuChiNhanh(khu, i) {
  const kieu = KIEU_SAN[i % KIEU_SAN.length];
  const hours = {};
  NGAY.forEach((d) => { hours[d] = kieu.mo(d); });
  return {
    name: TEN_QUAN[i % TEN_QUAN.length] + ' ' + tenKhu(khu.district),
    description: kieu.mo_ta,
    phone: soDienThoai(),
    address: (1 + Math.floor(Math.random() * 300)) + ' ' + pick(khu.streets),
    district: khu.district,
    city: khu.city,
    latitude: lech(khu.lat),
    longitude: lech(khu.lng),
    operating_hours: hours,
    slot_duration_minutes: 60,
    // Giá lẻ theo khu: quán trung tâm đắt hơn, giống thị trường thật.
    slot_fee_rate: [40000, 50000, 60000, 70000][i % 4],
    max_concurrent_bookings: [6, 8, 10, 12][i % 4],
    min_booking_notice_minutes: 60,
    max_advance_booking_days: 30,
    byoc_capacity: [4, 6, 8][i % 3],
    rules: NOI_QUY.slice(0, 3 + (i % 3)),
  };
}

function renderCafes() {
  const box = $('cfList');
  const rows = ctx.builtCafes || [];
  if (!rows.length) { box.textContent = 'Chưa tạo chi nhánh nào trong phiên này.'; return; }
  box.innerHTML = '';
  rows.forEach((c) => {
    const lb = document.createElement('label');
    const em = document.createElement('span');
    em.className = 'em'; em.textContent = c.name;
    const nm = document.createElement('span');
    nm.className = 'nm'; nm.textContent = c.note;
    lb.appendChild(em); lb.appendChild(nm);
    box.appendChild(lb);
  });
}

/**
 * Dựng phần vận hành cho một chi nhánh vừa tạo.
 *
 * Mỗi lớp bọc try riêng: một chi nhánh có bảng giá nhưng chưa có thực đơn vẫn
 * dùng được. Để một lỗi làm đổ cả hàm thì chi nhánh nằm lại nửa vời mà người
 * dùng tưởng nó hỏng hoàn toàn.
 */
async function dungLopVanHanh(cafeId, trackIds, xong, hong) {
  const t = ctx.providerToken;

  if ($('cfPricing').checked) {
    try {
      await call('PUT', '/provider/cafes/' + cafeId + '/pricing/rules', {
        weekend_multiplier: 1.2,
        peak_hours: [
          { start: '11:30', end: '13:30', multiplier: 1.15 },
          { start: '18:00', end: '21:00', multiplier: 1.3 },
        ],
      }, t);
      xong.push('bảng giá');
    } catch (e) { hong.push('bảng giá (' + e.message + ')'); }
  }

  if ($('cfFleet').checked) {
    try {
      const soXe = Math.max(1, Math.min(Number($('cfUnits').value) || 3, 8));
      let dong = 0; let chiec = 0;
      for (const x of DONG_XE.slice(0, 4)) {
        const cat = await call('POST', '/cafes/' + cafeId + '/vehicle-catalogs', {
          name: x.name, description: x.desc, tier: x.tier,
          hourly_rate: x.rate, security_deposit: 0,
          compatible_track_types: trackIds,
        }, t);
        dong++;
        // Dòng xe không có chiếc nào thì khách đặt được mà nhân viên không có gì
        // để giao — phiếu thuê treo ngay ở bước nhận xe.
        const ma = x.name.replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase();
        for (let k = 1; k <= soXe; k++) {
          await call('POST', '/cafes/' + cafeId + '/vehicle-catalogs/' + cat.id + '/units', {
            identifier: ma + '-' + String(k).padStart(2, '0'),
            color: MAU_XE[(dong * 3 + k) % MAU_XE.length],
            status: 'AVAILABLE',
          }, t);
          chiec++;
        }
      }
      xong.push(dong + ' dòng xe / ' + chiec + ' chiếc');
    } catch (e) { hong.push('dòng xe (' + e.message + ')'); }
  }

  if ($('cfMenu').checked) {
    try {
      let mon = 0;
      for (const nhom of THUC_DON) {
        const cat = await call('POST', '/cafes/' + cafeId + '/menu/categories',
          { name: nhom.nhom }, t);
        for (const m of nhom.mon) {
          await call('POST', '/cafes/' + cafeId + '/menu', {
            name: m.name, description: m.desc, price: m.price,
            category_id: cat.id || (cat.data && cat.data.id),
          }, t);
          mon++;
        }
      }
      xong.push(THUC_DON.length + ' nhóm / ' + mon + ' món');
    } catch (e) { hong.push('thực đơn (' + e.message + ')'); }
  }

  if ($('cfBank').checked) {
    try {
      let stk = '';
      for (let i = 0; i < 11; i++) stk += Math.floor(Math.random() * 10);
      await call('PUT', '/cafes/' + cafeId + '/payment-settings', {
        method: 'BANK_TRANSFER',
        bank_code: pick(MA_NGAN_HANG),
        account_number: stk,
        account_name: 'CONG TY RCFIELD',
      }, t);
      xong.push('tài khoản nhận tiền');
    } catch (e) { hong.push('tài khoản ngân hàng (' + e.message + ')'); }
  }
}

async function generateCafes() {
  if (!ctx.providerToken) {
    throw new Error('Chưa đăng nhập provider. Sang tab "Dựng giải đấu" bấm nút ' +
      'đăng nhập trước, vì chi nhánh phải thuộc về một provider cụ thể.');
  }

  const want = Math.max(1, Math.min(Number($('cfCount').value) || 1, 8));
  const cityFilter = $('cfCity').value;
  const st = $('cfStatus');

  const tracks = await call('GET', '/track-types');
  const trackRows = Array.isArray(tracks) ? tracks : tracks.data || [];
  if (!trackRows.length) throw new Error('Hệ thống chưa có loại sân nào — chạy seed loại sân trước.');

  let amenityIds = [];
  try {
    const am = await call('GET', '/amenities');
    const amRows = Array.isArray(am) ? am : am.data || [];
    amenityIds = amRows.slice(0, 5).map((a) => a.id);
  } catch (e) { log('dim', '  (không đọc được tiện ích, bỏ qua)'); }

  // Không lặp lại quận trong cùng một lượt: hai chi nhánh cùng tên cùng quận
  // trông như bấm nhầm hai lần chứ không như một chuỗi cửa hàng.
  const pool = KHU_VUC.filter((k) => !cityFilter || k.city === cityFilter);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
  }

  const created = [];
  const failed = [];
  for (let i = 0; i < want; i++) {
    const khu = pool[i % pool.length];
    st.textContent = 'Chi nhánh ' + (i + 1) + '/' + want + ' — ' + khu.district + '…';
    const body = duLieuChiNhanh(khu, i);
    // Mỗi chi nhánh mở 2–3 loại sân, không phải tất cả — quán thật cũng vậy.
    const trackIds = trackRows.slice(0, 2 + (i % 2)).map((t) => t.id);
    body.track_types = trackIds;
    if (amenityIds.length) body.amenity_ids = amenityIds;

    let cafe;
    try {
      cafe = await call('POST', '/cafes/', body, ctx.providerToken);
    } catch (e) {
      failed.push(body.name + ' (' + e.message + ')');
      // Hết hạn mức chi nhánh thì các lượt sau cũng hỏng y hệt — dừng luôn thay
      // vì gọi thêm bảy lần để nhận cùng một lỗi.
      if (/hạn mức|QUOTA|LIMIT/i.test(e.message)) {
        failed.push('Dừng sớm: gói thuê bao của provider đã hết suất chi nhánh.');
        break;
      }
      continue;
    }

    const xong = [];
    const hong = [];
    await dungLopVanHanh(cafe.id, trackIds, xong, hong);

    if ($('cfApprove').checked) {
      // Chi nhánh mới sinh ra ở PENDING và endpoint /cafes chỉ trả về ACTIVE,
      // nên chưa duyệt thì nó vô hình: không lên bản đồ, không vào được ô chọn
      // chi nhánh, không tạo giải ở đó được. Provider bị CHẶN tự duyệt
      // (cafe.service.ts:816) nên phải mượn tay admin.
      try {
        if (!ctx.adminToken) {
          const a = await login($('aEmail').value, $('aPwd').value);
          ctx.adminToken = a.token;
        }
        await call('PATCH', '/cafes/' + cafe.id + '/status', { status: 'ACTIVE' }, ctx.adminToken);
        xong.push('đã duyệt');
      } catch (e) { hong.push('duyệt (' + e.message + ')'); }
    }
    created.push({
      id: cafe.id,
      name: body.name,
      note: khu.city + ' · ' + xong.join(' · ') + (hong.length ? ' · THIẾU: ' + hong.join(', ') : ''),
    });
    log('ok', '  ' + body.name + ' — ' + xong.join(' · '));
  }

  ctx.builtCafes = created.concat(ctx.builtCafes || []);
  renderCafes();

  // Ô chọn chi nhánh ở tab dựng giải phải thấy ngay chi nhánh mới.
  await loadMyCafes();

  st.textContent = 'Đã tạo ' + created.length + '/' + want + ' chi nhánh' +
    (failed.length ? '. Hỏng: ' + failed.slice(0, 3).join('; ') : '.');
  log(failed.length ? 'err' : 'ok', '── Tạo chi nhánh: ' + created.length + '/' + want + ' ──');
  saveState();
}

// ── Tạo tài khoản khách ──────────────────────────────────────────────────────

/**
 * Tìm một email còn trống dựa trên tên chính.
 *
 * "tri@gmail.com" đẹp nhưng chỉ một người dùng được. Người thứ hai tên Trí phải
 * là "tri2@", thứ ba "tri3@" — hỏi hệ thống từng bước thay vì đoán, vì tài khoản
 * có thể do lần chạy trước hoặc do người khác tạo.
 *
 * Tham số dungTrongLo chặn trùng NGAY TRONG một lượt tạo: hai người cùng tên Trí sinh
 * ra cách nhau một phần nghìn giây thì cả hai đều hỏi lúc "tri@" còn trống, cả
 * hai cùng nhắm vào nó, và người thứ hai đăng ký hỏng.
 */
async function findFreeEmail(ten, domain, dungTrongLo) {
  const base = slugTen(ten) || 'user';
  for (let i = 1; i <= 60; i++) {
    const email = base + (i === 1 ? '' : String(i)) + '@' + domain;
    if (dungTrongLo.has(email)) continue;
    const res = await call('POST', '/auth/check-exists', { email });
    if (!res.emailExists) {
      dungTrongLo.add(email);
      return email;
    }
  }
  return null;
}

function renderGenerated() {
  const box = $('genList');
  const rows = ctx.generated || [];
  if (!rows.length) { box.textContent = 'Chưa tạo tài khoản nào trong phiên này.'; return; }
  box.innerHTML = '';
  rows.forEach((u) => {
    const lb = document.createElement('label');
    const em = document.createElement('span');
    em.className = 'em'; em.textContent = u.email;
    const nm = document.createElement('span');
    nm.className = 'nm'; nm.textContent = u.full_name;
    lb.appendChild(em); lb.appendChild(nm);
    box.appendChild(lb);
  });
}

async function generateUsers() {
  const want = Math.max(1, Math.min(Number($('genCount').value) || 1, 100));
  const domain = $('genDomain').value.trim().replace(/^@/, '') || 'gmail.com';
  const password = $('genPwd').value;
  const st = $('genStatus');

  const created = [];
  const failed = [];
  const dungTrongLo = new Set();

  for (let i = 0; i < want; i++) {
    st.textContent = 'Đang tạo ' + (i + 1) + '/' + want + '…';
    const nguoi = vietnameseName();
    const email = await findFreeEmail(nguoi.ten, domain, dungTrongLo);
    if (!email) {
      failed.push(nguoi.ten + ' (hết biến thể email còn trống)');
      continue;
    }
    try {
      await call('POST', '/auth/register', {
        full_name: nguoi.full, email, password, role: 'CUSTOMER',
      });
      created.push({ email, full_name: nguoi.full });
    } catch (e) {
      failed.push(email + ' (' + e.message + ')');
    }
  }

  ctx.generated = created.concat(ctx.generated || []);
  renderGenerated();

  if ($('genPick').checked && created.length) {
    // Gộp vào lựa chọn sẵn có thay vì thay thế: người dùng có thể đã tick vài
    // tài khoản cũ và muốn dùng chung với đám mới.
    const set = new Set(ctx.picked || []);
    created.forEach((u) => set.add(u.email));
    ctx.picked = Array.from(set);
    syncPicked();
  }

  st.textContent = 'Đã tạo ' + created.length + '/' + want + ' tài khoản' +
    (created.length ? ', mật khẩu chung "' + password + '"' : '') +
    (failed.length ? '. Hỏng: ' + failed.slice(0, 3).join('; ') : '.');
  log(failed.length ? 'err' : 'ok', '── Tạo tài khoản: ' + created.length + '/' + want + ' ──');
  saveState();
}

async function loadCatalog() {
  const flat = (x) => (Array.isArray(x) ? x : (x && x.data) || []);
  // Reload danh mục chỉ làm mới option, không phải lệnh đổi thể thức. Giữ lựa
  // chọn hiện tại (đặc biệt khi vừa nhận một giải có sẵn); chỉ chọn Knockout
  // ở lần tải đầu tiên khi người dùng chưa có lựa chọn nào.
  const selectedTemplateId = $('cTemplate').value ||
    (ctx.contestSnapshot && ctx.contestSnapshot.contest_template &&
      ctx.contestSnapshot.contest_template.id) || '';
  await loadTemplateLookups();
  const results = await Promise.allSettled(CATALOG.map((c) => call('GET', c.path)));
  const ok = [];
  const bad = [];
  results.forEach((r, i) => {
    const c = CATALOG[i];
    if (r.status === 'fulfilled') {
      const rows = flat(r.value);
      if (c.sel === 'cTemplate') ctx.templates = rows;
      fillSelect(c.sel, rows, 'name');
      if (c.sel === 'cTemplate') {
        if (selectedTemplateId && rows.some((t) => t.id === selectedTemplateId)) {
          $('cTemplate').value = selectedTemplateId;
        } else {
          chonMacDinhKhuonMau(rows);
        }
      }
      ok.push(rows.length + ' ' + c.label);
    } else {
      fillSelect(c.sel, [], 'name');
      bad.push(c.label + ' (' + r.reason.message + ')');
    }
  });
  const st = $('catStatus');
  st.textContent = bad.length
    ? 'Nạp thiếu — hỏng: ' + bad.join('; ')
    : 'Đã nạp: ' + ok.join(' · ');
  showTemplateDerived();
  // Chi nhánh phụ thuộc vào việc đã đăng nhập provider hay chưa, nên nạp riêng.
  await loadMyCafes();
  if (bad.length) throw new Error(bad.join('; '));
}

$('btnLoad').onclick = async () => {
  try {
    await loadCatalog();
    log('ok', 'Đã nạp lại danh mục.');
  } catch (e) { log('err', 'Nạp danh mục hỏng: ' + e.message); }
};

document.querySelectorAll('[data-goto]').forEach((b) => {
  b.onclick = () => runTo(Number(b.dataset.goto));
});

// Đăng nhập provider riêng, không chờ tới lúc chạy bước 1 — có token rồi thì ô
// chi nhánh mới lọc được về đúng chi nhánh của người đang dùng.
$('btnProviderCafes').onclick = async () => {
  const st = $('provStatus');
  st.textContent = 'Đang đăng nhập…';
  try {
    const p = await login($('pEmail').value, $('pPwd').value);
    ctx.providerToken = p.token;
    ctx.providerId = p.user.id;
    await loadMyCafes();
    saveState();
  } catch (e) {
    ctx.providerToken = null; ctx.providerId = null;
    fillSelect('cCafe', [], 'name');
    st.textContent = 'Không đăng nhập được: ' + e.message;
    log('err', e.message);
  }
};

$('btnAdminLogin').onclick = async () => {
  const st = $('adminStatus');
  st.textContent = 'Đang đăng nhập…';
  try {
    // Dùng lại đúng hàm mà các bước dùng, để trạng thái hiện ở đây không lệch
    // với token các bước thật sự cầm.
    await layTokenAdmin();
    st.textContent = 'Đã đăng nhập quản trị viên.';
  } catch (e) {
    ctx.adminToken = null;
    st.textContent = 'Không đăng nhập được: ' + e.message;
    log('err', e.message);
  }
};

$('btnBatch').onclick = () => runBatch();

// ── Chuyển tab ───────────────────────────────────────────────────────────────
// Cột nhật ký bên phải KHÔNG nằm trong tab nào: tạo tài khoản cũng gọi API, và
// giấu nhật ký đi thì lúc hỏng không thấy nó hỏng ở đâu.
document.querySelectorAll('[data-tab]').forEach((b) => {
  b.onclick = () => {
    document.querySelectorAll('[data-tab]').forEach((x) => { x.className = 'tab'; });
    b.className = 'tab on';
    $('tabLab').style.display = b.dataset.tab === 'lab' ? '' : 'none';
    $('tabUsers').style.display = b.dataset.tab === 'users' ? '' : 'none';
    $('tabCafes').style.display = b.dataset.tab === 'cafes' ? '' : 'none';
    $('tabPurge').style.display = b.dataset.tab === 'purge' ? '' : 'none';
  };
});

$('btnLoadContests').onclick = async () => {
  try { await loadProviderContests(); } catch (e) {
    $('adoptStatus').textContent = 'Không nạp được: ' + e.message;
    log('err', e.message);
  }
};

$('btnAdoptContest').onclick = async () => {
  try { await adoptContest($('pickContest').value); } catch (e) {
    $('adoptStatus').textContent = 'Không đi tiếp được: ' + e.message;
    log('err', e.message);
  }
};


// ── Dọn dữ liệu thử ──────────────────────────────────────────────────────────
//
// Xem trước và thực hiện là hai endpoint riêng, và endpoint xoá còn đòi gõ lại
// đúng mục tiêu. Bấm nhầm một nút không đủ để mất dữ liệu.

/** Gọi endpoint dọn dữ liệu, tự đăng nhập lại nếu token admin hết hạn. */
async function callPurge(path, body) {
  if (!ctx.adminToken) await layTokenAdmin();
  return thuLaiKhiHetHan(
    () => callDevPost(path, body, ctx.adminToken),
    layTokenAdmin,
  );
}

async function callDevPost(path, body, token) {
  log('req', 'POST ' + path + '  ' + short(body));
  const res = await fetch(location.origin + devPath(path), {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' },
      token ? { Authorization: 'Bearer ' + token } : {}),
    body: JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch (e) { json = null; }
  if (!res.ok) {
    const msg = (json && (json.message || json.error)) || ('HTTP ' + res.status);
    log('err', '  ✗ ' + res.status + ' ' + msg);
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  log('ok', '  ✓ ' + res.status + '  ' + short(json && json.data !== undefined ? json.data : json));
  return json && json.data !== undefined ? json.data : json;
}

function renderCounts(boxId, counts, empty) {
  const box = $(boxId);
  if (!counts || !counts.length) { box.textContent = empty; return; }
  box.className = 'built';
  box.innerHTML = counts.map((c) =>
    '<div><b>' + c.table + '</b> ' + c.count + '</div>').join('');
}

$('btnPgContestPreview').onclick = async () => {
  const box = $('pgContestPreview');
  box.textContent = 'Đang đếm…';
  try {
    const pv = await callPurge('/dev-tools/purge/contests/preview',
      { provider: $('pgProvider').value.trim() });
    if (!pv.counts.length) {
      box.className = 'picker';
      box.textContent = 'Chủ sân ' + pv.provider.email + ' không có giải nào.';
      return;
    }
    renderCounts('pgContestPreview', pv.counts, '');
    log('dim', 'Xác nhận bằng email: ' + pv.provider.email);
  } catch (e) {
    box.className = 'picker'; box.textContent = 'Không xem trước được: ' + e.message;
  }
};

$('btnPgContestRun').onclick = async () => {
  const box = $('pgContestPreview');
  try {
    const r = await callPurge('/dev-tools/purge/contests', {
      provider: $('pgProvider').value.trim(),
      confirm: $('pgContestConfirm').value.trim(),
    });
    box.className = 'picker';
    box.textContent = 'Đã xoá ' + r.deleted + ' giải.';
    $('pgContestConfirm').value = '';
    log('ok', '── Đã xoá ' + r.deleted + ' giải ──');
  } catch (e) {
    box.className = 'picker'; box.textContent = 'Không xoá được: ' + e.message;
  }
};


// ── Bảng chọn tài khoản để dọn ───────────────────────────────────────────────
//
// Giữ state RIÊNG với bảng chọn vận động viên. Dùng chung ctx.picked thì tick
// một người để cho thi đấu lại vô tình đưa họ vào danh sách xoá — hai việc trái
// ngược nhau dùng chung một ô nhớ là chuyện chỉ chờ ngày hỏng.

function pgVisible() {
  const term = $('pgSearch').value.trim().toLowerCase();
  return (ctx.pgUsers || []).filter((c) =>
    !term || c.email.toLowerCase().indexOf(term) >= 0 ||
    (c.full_name || '').toLowerCase().indexOf(term) >= 0);
}

function renderPgList() {
  const box = $('pgList');
  const rows = pgVisible();
  if (!rows.length) {
    box.className = 'picker';
    box.innerHTML = (ctx.pgUsers || []).length ? 'Không ai khớp bộ lọc.' : 'Chưa nạp danh sách.';
    return;
  }
  const chon = new Set(ctx.pgPicked || []);
  box.className = 'picker';
  box.innerHTML = '';
  rows.forEach((c) => {
    const lb = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = chon.has(c.id);
    cb.onchange = () => {
      const set = new Set(ctx.pgPicked || []);
      if (cb.checked) set.add(c.id); else set.delete(c.id);
      ctx.pgPicked = Array.from(set);
      showPgCount();
    };
    const em = document.createElement('span');
    em.className = 'em'; em.textContent = c.email;
    const nm = document.createElement('span');
    nm.className = 'nm'; nm.textContent = c.full_name || '';
    lb.appendChild(cb); lb.appendChild(em); lb.appendChild(nm);
    box.appendChild(lb);
  });
}

function showPgCount() {
  const n = (ctx.pgPicked || []).length;
  $('pgConfirmLabel').innerHTML = n
    ? 'Gõ <code>xoa ' + n + '</code> để xác nhận'
    : 'Gõ <code>xoa &lt;số lượng&gt;</code> để xác nhận';
}

$('btnPgLoadUsers').onclick = async () => {
  const box = $('pgList');
  box.textContent = 'Đang nạp…';
  try {
    if (!ctx.adminToken) await layTokenAdmin();
    ctx.pgUsers = await thuLaiKhiHetHan(
      () => callDev('/dev-tools/customers?limit=500', ctx.adminToken),
      layTokenAdmin,
    );
    ctx.pgPicked = ctx.pgPicked || [];
    renderPgList(); showPgCount();
  } catch (e) {
    box.textContent = 'Không nạp được: ' + e.message;
  }
};

$('pgSearch').oninput = () => renderPgList();

$('btnPgAll').onclick = () => {
  const set = new Set(ctx.pgPicked || []);
  pgVisible().forEach((c) => set.add(c.id));
  ctx.pgPicked = Array.from(set);
  renderPgList(); showPgCount();
};

$('btnPgNone').onclick = () => {
  ctx.pgPicked = [];
  renderPgList(); showPgCount();
};

$('btnPgUserPreview').onclick = async () => {
  const box = $('pgUserPreview');
  box.textContent = 'Đang đếm…';
  try {
    const pv = await callPurge('/dev-tools/purge/users/preview', { ids: ctx.pgPicked || [] });
    if (!pv.users.length) {
      box.className = 'picker'; box.textContent = 'Không tài khoản nào khớp.';
      return;
    }
    box.className = 'built';
    const canhBao = pv.nonCustomers.length
      ? '<div class="sc-bad">Quét trúng ' + pv.nonCustomers.length +
        ' tài khoản KHÔNG phải khách — thu hẹp mẫu lại.</div>'
      : '';
    box.innerHTML = canhBao +
      '<div><b>' + pv.users.length + '</b> tài khoản khớp</div>' +
      (pv.references.length
        ? pv.references.map((r) => '<div>' + r.table + ' — ' + r.count + '</div>').join('')
        : '<div class="sc-ok">Không bản ghi nào trỏ tới — xoá hẳn được.</div>');
  } catch (e) {
    box.className = 'picker'; box.textContent = 'Không xem trước được: ' + e.message;
  }
};

$('btnPgUserRun').onclick = async () => {
  const box = $('pgUserPreview');
  try {
    const r = await callPurge('/dev-tools/purge/users', {
      ids: ctx.pgPicked || [],
      hard: $('pgHard').checked,
      cascade: $('pgCascade').checked,
      confirm: $('pgUserConfirm').value.trim(),
    });
    box.className = 'picker';
    box.textContent = r.mode === 'hard'
      ? 'Đã xoá hẳn ' + r.affected + ' tài khoản.'
      : r.mode === 'soft'
        ? 'Đã khoá mềm ' + r.affected + ' tài khoản — không đăng nhập được, lịch sử vẫn còn.'
        : 'Không có tài khoản nào để xử lý.';
    $('pgUserConfirm').value = '';
    // Xoá xong thì bỏ chọn: để nguyên là lần bấm sau nhắm vào những người
    // không còn tồn tại, và thông báo lỗi sẽ khó hiểu.
    ctx.pgPicked = []; ctx.pgUsers = [];
    renderPgList(); showPgCount();
    log('ok', '── Dọn tài khoản: ' + r.mode + ' ' + r.affected + ' ──');
  } catch (e) {
    box.className = 'picker'; box.textContent = 'Không thực hiện được: ' + e.message;
  }
};

$('btnGenCafes').onclick = async () => {
  $('btnGenCafes').disabled = true;
  try { await generateCafes(); } catch (e) {
    $('cfStatus').textContent = 'Hỏng: ' + e.message;
    log('err', e.message);
  } finally { $('btnGenCafes').disabled = false; }
};

$('btnGenUsers').onclick = async () => {
  $('btnGenUsers').disabled = true;
  try { await generateUsers(); } catch (e) {
    $('genStatus').textContent = 'Hỏng: ' + e.message;
    log('err', e.message);
  } finally { $('btnGenUsers').disabled = false; }
};

// ── Nút của bảng chọn vận động viên ──────────────────────────────────────────
$('btnLoadCustomers').onclick = async () => {
  try { await loadCustomers(); } catch (e) {
    $('custList').textContent = 'Không nạp được: ' + e.message;
    log('err', e.message);
  }
};

$('custSearch').oninput = () => renderCustomers();

$('btnPickAll').onclick = () => {
  const set = new Set(ctx.picked || []);
  visibleCustomers().forEach((c) => set.add(c.email));
  ctx.picked = Array.from(set);
  renderCustomers(); syncPicked();
};

$('btnPickNone').onclick = () => {
  ctx.picked = [];
  renderCustomers(); syncPicked();
};

$('btnPickRandom').onclick = () => {
  const pool = visibleCustomers().slice();
  const want = Math.min(Number($('pickN').value) || 0, pool.length);
  if (!pool.length) { log('err', 'Chưa nạp danh sách tài khoản.'); return; }
  // Xáo Fisher–Yates rồi cắt: lấy ngẫu nhiên kiểu "bốc rồi loại" mới cho mỗi
  // người đúng một suất. Bốc có hoàn lại thì danh sách trùng tên, và bước đăng
  // ký sẽ chết vì một người đăng ký hai lần.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
  }
  ctx.picked = pool.slice(0, want).map((c) => c.email);
  renderCustomers(); syncPicked();
  log('dim', 'Đã lấy ngẫu nhiên ' + ctx.picked.length + '/' + visibleCustomers().length + ' người.');
};

document.querySelectorAll('[data-scenario]').forEach((b) => {
  b.onclick = () => runScenario(b.dataset.scenario);
});

$('btnCancel').onclick = async () => {
  if (!ctx.contestId) { log('err', 'Chưa tạo giải nào trong phiên này.'); return; }
  try {
    await call('POST', '/contests/' + ctx.contestId + '/cancel', {}, ctx.providerToken);
    log('ok', 'Đã huỷ giải ' + ctx.contestId);
  } catch (e) { log('err', e.message); }
};

$('btnReset').onclick = () => {
  resetContest();
  renderSteps(); showCtx(); showResume(); saveState();
  log('dim', 'Đã xoá trạng thái phiên. Dữ liệu đã tạo vẫn còn trong cơ sở dữ liệu.');
};

$('cCafe').onchange = () => loadTrackTypesForCafe();
$('cTemplate').onchange = () => showTemplateDerived();

$('btnClear').onclick = () => { logBox.innerHTML = '<span class="l-dim">Đã xoá.</span>'; };
$('btnCopy').onclick = () => navigator.clipboard.writeText(logBox.innerText);

// ── Nhớ trạng thái qua F5 ────────────────────────────────────────────────────
// Không có phần này thì mỗi lần tải lại trang là mất sạch: phải điền lại form và
// tạo một giải mới, trong khi giải cũ vẫn nằm đó dang dở.
const SAVE_KEY = 'rcfield-contest-lab';
const FORM_IDS = ['pEmail', 'pPwd', 'aEmail', 'aPwd', 'athPwd', 'athletes',
  'cName', 'cCap', 'cTemplate', 'cCafe', 'cTrack', 'cPolicy',
  'cFee', 'cFeeMode', 'cDays', 'byocPhoto',
  'bDraft', 'bOpen', 'bApproved', 'bClosed', 'bRunning', 'bCompleted', 'bCancelled',
  'genCount', 'genDomain', 'genPwd',
  'cfCount', 'cfCity', 'cfUnits', 'pgProvider'];

function saveState() {
  const form = {};
  FORM_IDS.forEach((id) => { const el = $(id); if (el) form[id] = el.value; });
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ form, ctx }));
  } catch (e) { /* hết chỗ lưu thì thôi, không đáng để chặn công cụ */ }
}

function readState() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { return null; }
}

function showResume() {
  const box = $('resumePanel');
  if (!ctx.contestId) { box.style.display = 'none'; return; }
  box.style.display = '';
  const bits = [(ctx.tplName ? ctx.tplName + ' — ' : '') + 'giải ' + ctx.contestId];
  if (ctx.registrations.length) bits.push(ctx.registrations.length + ' đăng ký');
  if (ctx.matches.length) bits.push(ctx.matches.length + ' trận');
  $('resumeInfo').textContent = bits.join('  ·  ');
}

FORM_IDS.forEach((id) => {
  const el = $(id);
  if (el) { el.addEventListener('change', saveState); el.addEventListener('input', saveState); }
});

$('btnRefreshContest').onclick = async () => {
  try {
    await adoptContest(ctx.contestId);
    log('ok', 'Đã đồng bộ lại toàn bộ trạng thái giải đang làm việc.');
  } catch (e) { log('err', e.message); }
};

$('btnNewContest').onclick = () => {
  resetContest();
  saveState(); showResume(); renderSteps();
  log('dim', 'Đã bỏ giải cũ khỏi phiên. Lần chạy tới sẽ tạo giải mới.');
};

renderSteps();

// Năm danh mục dưới đây đều là endpoint công khai, không cần đăng nhập — nạp
// ngay lúc mở trang để các ô chọn không bị rỗng.
log('dim', 'Trang tải lúc ' + new Date().toLocaleTimeString('vi-VN') + ' · API ' + API);

const saved = readState();
if (saved) {
  // Ô nhập chữ khôi phục ngay; ô chọn phải chờ có dữ liệu mới gán được, nếu
  // không giá trị cũ bị bỏ vì lúc đó chưa có lựa chọn nào khớp.
  FORM_IDS.forEach((id) => {
    const el = $(id);
    if (el && saved.form && saved.form[id] !== undefined && el.tagName !== 'SELECT') {
      el.value = saved.form[id];
    }
  });
  Object.assign(ctx, saved.ctx || {});
  ctx.registrations = ctx.registrations || [];
  ctx.matches = ctx.matches || [];
  ctx.athletes = ctx.athletes || [];
  ctx.built = ctx.built || [];
  ctx.picked = ctx.picked || [];
  // Danh sách tài khoản KHÔNG khôi phục — nó là ảnh chụp của cơ sở dữ liệu và
  // sẽ cũ đi. Lựa chọn thì giữ, vì đã nằm sẵn trong ô nhập rồi.
  ctx.customers = [];
  ctx.generated = ctx.generated || [];
  ctx.builtCafes = ctx.builtCafes || [];
  renderBuilt();
  renderGenerated();
  renderCafes();
  if (ctx.picked.length) syncPicked();
  showResume();
  if (ctx.contestId) log('dim', 'Khôi phục phiên trước — giải ' + ctx.contestId);
}

loadCatalog()
  .then(() => {
    if (saved && saved.form) {
      ['cTemplate', 'cCafe', 'cPolicy', 'cFeeMode', 'cfCity'].forEach((id) => {
        if (saved.form[id]) $(id).value = saved.form[id];
      });
      return loadTrackTypesForCafe().then(() => {
        if (saved.form.cTrack) $('cTrack').value = saved.form.cTrack;
      });
    }
  })
  .then(() => log('dim', 'Đã nạp danh mục. Sửa thông tin giải rồi bấm một nút ở mục 4.'))
  .catch((e) => log('err', 'Nạp danh mục thiếu: ' + e.message));
`;
