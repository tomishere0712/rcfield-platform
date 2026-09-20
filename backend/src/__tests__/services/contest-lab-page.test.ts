import { CLIENT_SCRIPT, STYLE, renderContestLab } from '../../dev-tools/contest-lab.template';

/**
 * Trang Contest Lab dựng bằng chuỗi, nên hai lỗi dưới đây không có gì bắt được
 * lúc chạy — trang vẫn trả về 200, chỉ là không làm gì cả:
 *
 *  1. Một dấu backtick lạc trong phần JS sẽ đóng sớm `String.raw`, làm hỏng cả
 *     tệp. TypeScript có báo, nhưng chỉ khi ai đó nhớ chạy nó.
 *  2. Nhúng <script> nội tuyến sẽ bị chính sách bảo mật nội dung của ứng dụng
 *     (`script-src 'self'`) chặn thẳng, và trang chết lặng.
 */
describe('trang Contest Lab', () => {
  it('không nhúng script nội tuyến — CSP của ứng dụng chỉ cho script cùng nguồn', () => {
    const html = renderContestLab();
    expect(html).not.toMatch(/<script(?![^>]*\ssrc=)/i);
    expect(html).toContain('<script src="/dev-tools/contest-lab.js">');
    expect(html).toContain('href="/dev-tools/contest-lab.css"');
  });

  it('phần JS không chứa backtick — sẽ đóng sớm chuỗi String.raw bao quanh nó', () => {
    expect(CLIENT_SCRIPT).not.toContain('`');
  });

  it('trả về đủ ba phần và trang có gắn đủ các ô nhập', () => {
    const html = renderContestLab();
    for (const id of ['pEmail', 'pPwd', 'aEmail', 'aPwd', 'athPwd', 'cCafe', 'cTrack']) {
      expect(html).toContain(`id="${id}"`);
    }
    expect(STYLE.length).toBeGreaterThan(100);
    expect(CLIENT_SCRIPT).toContain('loadTrackTypesForCafe');
  });

  it('mọi ô mà phần JS đụng tới đều có mặt trong HTML', () => {
    // Sắp xếp lại bố cục là chuyển các khối HTML qua lại giữa hai cột, và rất
    // dễ đánh rơi một ô. Mất ô thì `$('id')` trả null, dòng đầu tiên chạm vào
    // nó ném lỗi, và trang chết lặng — không log, không lỗi mạng.
    const html = renderContestLab();
    const ids = Array.from(
      new Set([...CLIENT_SCRIPT.matchAll(/\$\('([A-Za-z][\w-]*)'\)/g)].map((m) => m[1])),
    );
    expect(ids.length).toBeGreaterThan(50);
    // resultPreview được tạo theo từng thể thức ngay trong renderSteps, không
    // nằm sẵn trong HTML để tránh trùng id khi đổi giải.
    expect(ids.filter((id) => id !== 'resultPreview' && !html.includes(`id="${id}"`))).toEqual([]);
  });

  it('thẻ div đóng mở cân nhau', () => {
    // Lệch một thẻ là cả phần sau bị hút vào trong khối trước đó — bố cục vỡ
    // mà trình duyệt vẫn dựng ra được, nên nhìn qua không biết hỏng ở đâu.
    const html = renderContestLab();
    expect((html.match(/<div\b/g) ?? []).length).toBe((html.match(/<\/div>/g) ?? []).length);
  });

  it('khoá mở trang được gắn vào cả CSS lẫn JS', () => {
    // Trình duyệt tải hai tệp con bằng lời gọi riêng và không tự mang theo khoá
    // của trang cha. Quên truyền tiếp thì trang mở ra 200 nhưng trắng trơn —
    // không lỗi mạng, không log, chỉ là không có gì chạy.
    const html = renderContestLab('?key=abc123');
    expect(html).toContain('href="/dev-tools/contest-lab.css?key=abc123"');
    expect(html).toContain('<script src="/dev-tools/contest-lab.js?key=abc123">');
  });

  it('loại sân đọc theo chi nhánh, không đọc danh mục toàn hệ thống', () => {
    // Lấy từ /track-types thì loại sân chi nhánh đã tắt vẫn hiện ra, chọn vào
    // là tạo giải bị từ chối với CONTEST_TRACK_TYPE_UNAVAILABLE.
    expect(CLIENT_SCRIPT).toContain("'/cafes/' + cafeId + '/track-configs'");
    expect(CLIENT_SCRIPT).not.toContain("sel: 'cTrack', path: '/track-types'");
  });
});

describe('mục tài khoản trong Contest Lab', () => {
  const html = renderContestLab();

  it('tách chủ sân và quản trị viên thành hai hộp riêng', () => {
    // Trộn chung một khối thì nhìn vào không biết ô nào của ai, và gõ nhầm mật
    // khẩu bên này sang bên kia là bị khoá đăng nhập 15 phút.
    expect((html.match(/class="acct"/g) ?? []).length).toBe(2);
    expect(html).toContain('>Chủ sân <');
    expect(html).toContain('>Quản trị viên <');
  });

  it('mỗi bên có nút đăng nhập và dòng trạng thái riêng', () => {
    for (const id of ['btnProviderCafes', 'provStatus', 'btnAdminLogin', 'adminStatus']) {
      expect(html).toContain(`id="${id}"`);
    }
  });

  it('ô mật khẩu được che', () => {
    expect((html.match(/type="password"/g) ?? []).length).toBe(2);
  });

  it('bỏ hẳn ô chọn "tạo provider mới" đã ngừng hoạt động', () => {
    // Để lại một lựa chọn không dùng được chỉ khiến người ta thử rồi nhận lỗi.
    expect(html).not.toContain('id="pMode"');
    expect(CLIENT_SCRIPT).not.toContain("$('pMode')");
  });
});

describe('chọn khuôn mẫu giải', () => {
  const html = renderContestLab();

  it('chỉ còn MỘT ô chọn — loại giải và thể thức suy ra từ khuôn mẫu', () => {
    // Mỗi khuôn mẫu ghim sẵn đúng một cặp loại giải + thể thức. Ba ô rời nhau
    // cho ra 18 tổ hợp mà chỉ 3 hợp lệ; 15 tổ hợp còn lại bị backend từ chối
    // bằng CONTEST_TEMPLATE_MISMATCH, và người dùng chọn xong mới biết mình sai.
    expect(html).toContain('id="cTemplate"');
    expect(html).not.toContain('id="cType"');
    expect(html).not.toContain('id="cFormat"');
  });

  it('vẫn hiện ra loại giải và thể thức suy ra, để không phải đoán', () => {
    expect(html).toContain('id="tplStatus"');
    expect(CLIENT_SCRIPT).toContain('showTemplateDerived');
  });

  it('bước tạo giải đọc id từ chính khuôn mẫu, không đọc ô riêng', () => {
    // Đọc ba ô rời là đúng thứ sinh ra tổ hợp lệch ngay từ đầu.
    expect(CLIENT_SCRIPT).toContain('contest_template_id: tpl.id');
    expect(CLIENT_SCRIPT).not.toContain("contest_type_id: $('cType')");
    expect(CLIENT_SCRIPT).not.toContain("contest_format_id: $('cFormat')");
  });
});

describe('tab dọn dữ liệu', () => {
  const html = renderContestLab();

  it('chọn tài khoản bằng bảng tick, không phải gõ mẫu email', () => {
    // Gõ mẫu thì phải tưởng tượng nó khớp những ai; tick thì nhìn thấy đúng
    // từng người mình sắp xoá.
    for (const id of ['pgList', 'pgSearch', 'btnPgLoadUsers', 'btnPgAll', 'btnPgNone']) {
      expect(html).toContain(`id="${id}"`);
    }
    expect(html).not.toContain('id="pgLike"');
  });

  it('giữ state chọn RIÊNG với bảng chọn vận động viên', () => {
    // Dùng chung `ctx.picked` thì tick một người cho thi đấu lại vô tình đưa họ
    // vào danh sách xoá — hai việc trái ngược nhau dùng chung một ô nhớ.
    expect(CLIENT_SCRIPT).toContain('ctx.pgPicked');
    expect(CLIENT_SCRIPT).toContain(
      "callPurge('/dev-tools/purge/users', {\n      ids: ctx.pgPicked",
    );
  });

  it('xoá và xem trước là hai nút riêng, và có ô xác nhận', () => {
    expect(html).toContain('id="btnPgUserPreview"');
    expect(html).toContain('id="btnPgUserRun"');
    expect(html).toContain('id="pgUserConfirm"');
    expect(html).toContain('id="pgContestConfirm"');
  });
});

describe('mặc định khuôn mẫu giải', () => {
  it('chọn sẵn đấu loại trực tiếp, không lấy mục đầu danh sách', () => {
    // Danh mục sắp theo sortOrder và "Đua tính giờ" đang là 0, nên nếu không
    // chỉ định thì ô chọn luôn mặc định vào đua tính giờ. Giải loại trực tiếp
    // mới là thứ hay dựng nhất khi thử — có sơ đồ nhánh, có trận để bấm.
    expect(CLIENT_SCRIPT).toContain("t.code === 'provider_standard_knockout'");
    expect(CLIENT_SCRIPT).toContain('chonMacDinhKhuonMau(rows)');
  });

  it('mặc định chạy TRƯỚC bước khôi phục phiên, để lựa chọn cũ vẫn thắng', () => {
    // Đặt sau thì mỗi lần tải lại trang đều giật lựa chọn của người dùng về
    // loại trực tiếp — đúng cái khó chịu vừa sửa xong, chỉ đổi chiều.
    const iMacDinh = CLIENT_SCRIPT.indexOf('chonMacDinhKhuonMau(rows)');
    const iKhoiPhuc = CLIENT_SCRIPT.indexOf('if (saved.form[id]) $(id).value = saved.form[id]');
    expect(iMacDinh).toBeGreaterThan(-1);
    expect(iKhoiPhuc).toBeGreaterThan(iMacDinh);
  });

  it('chặn dùng lại giải cũ khi đã đổi sang khuôn mẫu khác', () => {
    // Trạng thái phiên nằm trong localStorage nên sống qua cả lần tải lại
    // trang. Im lặng dùng lại giải cũ là dối: người dùng chọn loại trực tiếp,
    // bấm chạy, nhận về giải tính giờ cũ mà không có gì nói vì sao.
    expect(CLIENT_SCRIPT).toContain('cuId && cuId !== tpl.id');
    expect(CLIENT_SCRIPT).toContain('Xoá trạng thái phiên');
  });
});

describe('nạp giải có sẵn và import vận động viên', () => {
  const html = renderContestLab();

  it('hiện snapshot trạng thái thật của giải đang làm việc', () => {
    expect(html).toContain('id="contestSnapshot"');
    expect(CLIENT_SCRIPT).toContain('Chính sách xe:');
    expect(CLIENT_SCRIPT).toContain('Khung đăng ký:');
    expect(CLIENT_SCRIPT).toContain('syncContestForm(contest)');
  });

  it('lấy policy từ API thay vì giá trị cũ còn trên form', () => {
    expect(CLIENT_SCRIPT).toContain('const policy = contestPolicy(contest)');
    expect(CLIENT_SCRIPT).not.toContain("const policy = $('cPolicy').value");
  });

  it('seed lại là idempotent và đồng bộ danh sách đăng ký từ máy chủ', () => {
    expect(CLIENT_SCRIPT).toContain('existingByEmail.has(email.toLowerCase())');
    expect(CLIENT_SCRIPT).toContain('đã có ' + "' + email + '" + ' trong giải — bỏ qua');
    expect(CLIENT_SCRIPT).toContain("e.code === 'CONTEST_ALREADY_REGISTERED'");
    expect(CLIENT_SCRIPT).toContain("e.code === 'CONTEST_CAPACITY_REACHED'");
  });

  it('tự sinh đúng số tài khoản còn thiếu để lấp đầy sức chứa', () => {
    expect(CLIENT_SCRIPT).toContain('Number(contest.capacity || 0) - activeRows.length');
    expect(CLIENT_SCRIPT).toContain('while (candidateLines.length < importTarget)');
    expect(CLIENT_SCRIPT).toContain("'contest.lab.' + contestKey");
    expect(CLIENT_SCRIPT).toContain('candidateLines.slice(0, importTarget)');
  });

  it('báo cáo phương tiện và trạng thái phí sau khi import', () => {
    expect(CLIENT_SCRIPT).toContain("r.source === 'BYOC'");
    expect(CLIENT_SCRIPT).toContain("r.source === 'RENTAL'");
    expect(CLIENT_SCRIPT).toContain('entry_fee_status || r.entryFeeStatus');
  });

  it('reload danh mục giữ nguyên thể thức đang chọn', () => {
    expect(CLIENT_SCRIPT).toContain("const selectedTemplateId = $('cTemplate').value");
    expect(CLIENT_SCRIPT).toContain('rows.some((t) => t.id === selectedTemplateId)');
    expect(CLIENT_SCRIPT).toContain("$('cTemplate').value = selectedTemplateId");
  });

  it('hiện trạng thái bypass và không đóng lại giải đã CLOSED', () => {
    expect(CLIENT_SCRIPT).toContain('contest.check_in_window_bypassed');
    expect(CLIENT_SCRIPT).toContain('contest.registration_window_bypassed');
    expect(CLIENT_SCRIPT).toContain('Đăng ký demo:');
    expect(CLIENT_SCRIPT).toContain('ĐANG MỞ — thời điểm hiện tại nằm trong khung đăng ký');
    expect(CLIENT_SCRIPT).toContain("['CLOSED', 'RUNNING', 'COMPLETED'].includes(current.status)");
    expect(CLIENT_SCRIPT).toContain('không đóng đăng ký lần hai');
  });

  it('mở trạng thái và cổng đăng ký demo theo cách idempotent', () => {
    expect(CLIENT_SCRIPT).toContain('giải đã OPEN — không mở đăng ký lần hai');
    expect(CLIENT_SCRIPT).toContain('/open-registration-now');
    expect(CLIENT_SCRIPT).toContain('Cho phép vận động viên đăng ký ngay');
    expect(CLIENT_SCRIPT).toContain('Date.now() + 30 * 60 * 1000');
    expect(CLIENT_SCRIPT).not.toContain('Date.now() - 60 * 60 * 1000');
  });
});
