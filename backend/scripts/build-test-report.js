#!/usr/bin/env node
/**
 * Dựng báo cáo kiểm thử từ kết quả Jest.
 *
 * Đọc `--json` gốc của Jest nên KHÔNG cần thêm phụ thuộc nào (`jest-junit` và
 * họ hàng đều không cần thiết cho việc này).
 *
 * Sinh ra ba tệp, mỗi tệp phục vụ một người đọc khác nhau:
 *   junit.xml        — định dạng chuẩn cho công cụ CI/QA đọc máy
 *   test-report.html — bản trình bày để đính kèm báo cáo đồ án
 *   test-report.md   — tóm tắt hiện thẳng trên trang tổng kết của GitHub Actions
 *
 * Dùng:
 *   node scripts/build-test-report.js <jest.json> [coverage-summary.json] [thư-mục-ra]
 */
'use strict';

const fs = require('fs');
const path = require('path');

const { areaOf, AREAS } = require('./report-areas');

const [, , resultsPath, coveragePath, outDirArg] = process.argv;
const argOf = (name) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const readJsonOrNull = (file) => {
  if (!file || !fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};
const apiContract = readJsonOrNull(argOf('api-contract'));
const apiSmoke = readJsonOrNull(argOf('api-smoke'));
const apiCoverage = readJsonOrNull(argOf('api-coverage'));
if (!resultsPath) {
  console.error('Thiếu đường dẫn tới tệp JSON kết quả Jest.');
  process.exit(1);
}

const outDir = outDirArg || 'test-report';
fs.mkdirSync(outDir, { recursive: true });

/**
 * Đọc kết quả Jest, chấp nhận việc KHÔNG có kết quả.
 *
 * Khi Jest chết giữa chừng — hết bộ nhớ, quá giờ, container DB sập — thì tệp
 * JSON không bao giờ được ghi. Nếu để script này văng theo, cả dây chuyền phía
 * sau đổ: không báo cáo, không artifact, không mail. Mà đó lại đúng là lúc cần
 * mail nhất.
 *
 * Nên khi thiếu dữ liệu, vẫn dựng một báo cáo tối thiểu nói rõ "tiến trình chết
 * trước khi kịp ghi kết quả" và chỉ người đọc sang nhật ký.
 */
function readResults() {
  if (!fs.existsSync(resultsPath)) {
    console.warn(`Không thấy ${resultsPath} — tiến trình test có thể đã chết giữa chừng.`);
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
  } catch (err) {
    console.warn(`Không đọc được ${resultsPath}: ${err.message}`);
    return null;
  }
}

const results = readResults() ?? {
  crashed: true,
  testResults: [],
  numTotalTestSuites: 0,
  numFailedTestSuites: 0,
  numTotalTests: 0,
  numPassedTests: 0,
  numFailedTests: 0,
  numPendingTests: 0,
  numTodoTests: 0,
};

const coverage =
  coveragePath && fs.existsSync(coveragePath)
    ? JSON.parse(fs.readFileSync(coveragePath, 'utf8')).total
    : null;

const escapeXml = (value) =>
  String(value).replace(
    /[<>&"']/g,
    (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[ch],
  );
const escapeHtml = (value) =>
  String(value).replace(/[<>&]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[ch]);

/** Rút gọn đường dẫn tuyệt đối thành đường dẫn trong kho cho dễ đọc. */
function shortPath(filePath) {
  const marker = `${path.sep}src${path.sep}`;
  const at = filePath.lastIndexOf(marker);
  return at === -1 ? path.basename(filePath) : filePath.slice(at + 1);
}

const suites = results.testResults.map((suite) => {
  const cases = suite.assertionResults ?? suite.testResults ?? [];
  return {
    name: shortPath(suite.name ?? suite.testFilePath ?? 'unknown'),
    durationMs: Math.max(0, (suite.endTime ?? 0) - (suite.startTime ?? 0)),
    cases: cases.map((c) => ({
      title: [...(c.ancestorTitles ?? []), c.title].filter(Boolean).join(' › '),
      status: c.status,
      durationMs: c.duration ?? 0,
      failure: (c.failureMessages ?? []).join('\n'),
    })),
  };
});

const totals = {
  suites: results.numTotalTestSuites,
  suitesFailed: results.numFailedTestSuites,
  tests: results.numTotalTests,
  passed: results.numPassedTests,
  failed: results.numFailedTests,
  skipped: results.numPendingTests,
  todo: results.numTodoTests ?? 0,
  durationMs: suites.reduce((sum, s) => sum + s.durationMs, 0),
};
const passRate = totals.tests ? ((totals.passed / totals.tests) * 100).toFixed(2) : '0.00';

// Gom theo miền nghiệp vụ để người đọc thấy "test bảo đảm điều gì", thay vì một
// danh sách đường dẫn tệp chỉ lập trình viên hiểu.
const areaMap = new Map();
for (const suite of suites) {
  const area = areaOf(suite.name);
  if (!areaMap.has(area.key)) {
    areaMap.set(area.key, { ...area, suites: 0, cases: 0, passed: 0, failed: 0, notRun: 0 });
  }
  const bucket = areaMap.get(area.key);
  bucket.suites += 1;
  bucket.cases += suite.cases.length;
  bucket.passed += suite.cases.filter((c) => c.status === 'passed').length;
  bucket.failed += suite.cases.filter((c) => c.status === 'failed').length;
  // Ca bỏ qua và ca mới khai chưa viết. Không tách ra thì bảng có dòng "89 ca /
  // 75 đạt / ĐẠT" và người đọc lập tức hỏi 14 ca còn lại đi đâu.
  bucket.notRun += suite.cases.filter((c) => c.status !== 'passed' && c.status !== 'failed').length;
}
const areaOrder = [...AREAS.map((a) => a.key), 'other'];
const areas = areaOrder.map((k) => areaMap.get(k)).filter(Boolean);
const generatedAt = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

// ── junit.xml ────────────────────────────────────────────────────────────────
const junit = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  `<testsuites name="RCField Backend" tests="${totals.tests}" failures="${totals.failed}" skipped="${totals.skipped}" time="${(totals.durationMs / 1000).toFixed(3)}">`,
  ...suites.map((suite) => {
    const failed = suite.cases.filter((c) => c.status === 'failed').length;
    const skipped = suite.cases.filter(
      (c) => c.status !== 'failed' && c.status !== 'passed',
    ).length;
    return [
      `  <testsuite name="${escapeXml(suite.name)}" tests="${suite.cases.length}" failures="${failed}" skipped="${skipped}" time="${(suite.durationMs / 1000).toFixed(3)}">`,
      ...suite.cases.map((c) => {
        const open = `    <testcase classname="${escapeXml(suite.name)}" name="${escapeXml(c.title)}" time="${(c.durationMs / 1000).toFixed(3)}"`;
        if (c.status === 'failed') {
          return `${open}>\n      <failure>${escapeXml(c.failure)}</failure>\n    </testcase>`;
        }
        if (c.status !== 'passed') return `${open}>\n      <skipped/>\n    </testcase>`;
        return `${open}/>`;
      }),
      '  </testsuite>',
    ].join('\n');
  }),
  '</testsuites>',
].join('\n');
fs.writeFileSync(path.join(outDir, 'junit.xml'), junit);

// ── test-report.md ───────────────────────────────────────────────────────────
const covRow = (label, m) => (m ? `| ${label} | ${m.pct}% | ${m.covered}/${m.total} |` : '');
const crashNoteMd = results.crashed
  ? [
      '> ⚠️ **Tiến trình kiểm thử chết trước khi ghi được kết quả.**',
      '> Thường gặp: hết bộ nhớ, quá thời gian, hoặc container cơ sở dữ liệu sập.',
      '> Các con số dưới đây là 0 vì không có dữ liệu, KHÔNG phải vì không có test.',
      '> Mở nhật ký lần chạy để xem nguyên nhân.',
      '',
    ]
  : [];

const md = [
  '# Báo cáo kiểm thử — RCField Backend',
  '',
  `**Thời điểm chạy:** ${generatedAt} (giờ Việt Nam)`,
  '',
  ...crashNoteMd,
  '## Tổng hợp',
  '',
  '| Chỉ số | Giá trị |',
  '|---|---|',
  `| Bộ kiểm thử | ${totals.suites} (${totals.suitesFailed} lỗi) |`,
  `| Tổng số ca | ${totals.tests} |`,
  `| Đạt | **${totals.passed}** |`,
  `| Lỗi | ${totals.failed} |`,
  `| Bỏ qua | ${totals.skipped} |`,
  `| Chưa viết (todo) | ${totals.todo} |`,
  `| Tỷ lệ đạt | **${passRate}%** |`,
  `| Thời gian | ${(totals.durationMs / 1000).toFixed(1)} giây |`,
  '',
  ...(coverage
    ? [
        '## Độ phủ mã nguồn',
        '',
        '| Loại | Tỷ lệ | Đã phủ / Tổng |',
        '|---|---|---|',
        covRow('Câu lệnh (statements)', coverage.statements),
        covRow('Nhánh (branches)', coverage.branches),
        covRow('Hàm (functions)', coverage.functions),
        covRow('Dòng (lines)', coverage.lines),
        '',
      ]
    : []),
  '## Kiểm thử bảo đảm điều gì',
  '',
  '| Nghiệp vụ | Số ca | Đạt | Bảo đảm |',
  '|---|---:|---:|---|',
  ...areas.map((a) => `| ${a.name} | ${a.cases} | ${a.passed} | ${a.guarantee} |`),
  '',
  ...(apiCoverage
    ? [
        '## Độ phủ kiểm thử API',
        '',
        `- **${apiCoverage.covered}/${apiCoverage.total}** endpoint đã được gọi thật ` +
          `trong kiểm thử tích hợp — **${apiCoverage.pct}%**.`,
        '',
        '| Miền | Đã phủ | Tổng | Tỷ lệ |',
        '|---|---:|---:|---:|',
        ...apiCoverage.domains.map(
          (d) => `| \`${d.name}\` | ${d.covered} | ${d.total} | ${d.pct}% |`,
        ),
        '',
      ]
    : []),
  ...(apiContract
    ? [
        '## Giao kèo API giao diện ↔ máy chủ',
        '',
        `- Giao diện gọi **${apiContract.feCalls}** endpoint, máy chủ đăng ký **${apiContract.beRoutes}**.`,
        `- Gọi vào endpoint không tồn tại: **${apiContract.broken.length}**.`,
        ...apiContract.broken.map((b) => `  - \`${b.call}\``),
        '',
      ]
    : []),
  ...(apiSmoke
    ? [
        '## Gọi thử endpoint máy chủ',
        '',
        `- Đã gọi **${apiSmoke.total}** endpoint đọc dữ liệu.`,
        `- Trả lỗi máy chủ: **${apiSmoke.broken.length}**.`,
        ...apiSmoke.broken.map((b) => `  - \`${b.route}\` → ${b.status}`),
        '',
      ]
    : []),
  ...(totals.failed > 0
    ? [
        '## Ca lỗi',
        '',
        ...suites.flatMap((s) =>
          s.cases.filter((c) => c.status === 'failed').map((c) => `- \`${s.name}\` — ${c.title}`),
        ),
        '',
      ]
    : []),
].join('\n');
fs.writeFileSync(path.join(outDir, 'test-report.md'), md);

// ── test-report.html ─────────────────────────────────────────────────────────
const ok = totals.failed === 0;
const contractBroken = apiContract ? apiContract.broken.length : null;
const smokeBroken = apiSmoke ? apiSmoke.broken.length : null;

const allGreen = ok && !results.crashed && (contractBroken ?? 0) === 0 && (smokeBroken ?? 0) === 0;

const conclusion = results.crashed
  ? 'Tiến trình kiểm thử chết trước khi ghi được kết quả — chưa kết luận được.'
  : allGreen
    ? `Toàn bộ ${totals.passed} ca kiểm thử tự động đạt. Không phát hiện endpoint nào gọi sai hoặc trả lỗi máy chủ.`
    : (() => {
        const issues = [];
        if (totals.failed) issues.push(`${totals.failed} ca kiểm thử lỗi`);
        if (contractBroken)
          issues.push(`${contractBroken} endpoint giao diện gọi vào chỗ không tồn tại`);
        if (smokeBroken) issues.push(`${smokeBroken} endpoint trả lỗi máy chủ`);
        return `${totals.passed}/${totals.tests} ca kiểm thử đạt. Còn tồn đọng: ${issues.join('; ')}.`;
      })();

const html = `<!doctype html>
<html lang="vi"><head><meta charset="utf-8">
<title>Báo cáo kiểm thử — RCField Backend</title>
<style>
 body{font:14px/1.65 system-ui,-apple-system,Segoe UI,sans-serif;color:#1c1b1b;margin:0;padding:32px;background:#faf9f8}
 .wrap{max-width:980px;margin:0 auto}
 h1{font-size:24px;margin:0 0 4px} .sub{color:#747878;margin-bottom:20px}
 h2{font-size:17px;margin:32px 0 6px}
 .lead{color:#5d5f5f;margin:0 0 12px;max-width:70ch}
 .verdict{padding:16px 20px;border-radius:12px;margin-bottom:24px;font-weight:600}
 .verdict.ok{background:#ecfdf5;border:1px solid #a7f3d0;color:#065f46}
 .verdict.bad{background:#fef2f2;border:1px solid #fecaca;color:#991b1b}
 .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:8px}
 .card{background:#fff;border:1px solid #e5e2e1;border-radius:12px;padding:14px}
 .card .k{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#747878}
 .card .v{font-size:24px;font-weight:800;margin-top:4px}
 .ok{color:#047857} .bad{color:#b91c1c}
 table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #e5e2e1;border-radius:12px;overflow:hidden}
 th,td{padding:10px 12px;text-align:left;border-bottom:1px solid #f0eeed;font-size:13px;vertical-align:top}
 th{background:#f6f3f2;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#5d5f5f}
 tr:last-child td{border-bottom:none}
 td.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
 .pill{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;white-space:nowrap}
 .pill.ok{background:#d1fae5;color:#047857} .pill.bad{background:#fee2e2;color:#b91c1c}
 .pill.warn{background:#fef3c7;color:#92400e}
 .note{background:#fff;border:1px solid #e5e2e1;border-left:3px solid #c4c7c8;border-radius:8px;padding:12px 16px;color:#5d5f5f;font-size:13px}
 code{background:#f6f3f2;padding:1px 5px;border-radius:4px;font-size:12px}
</style></head><body><div class="wrap">
<h1>Báo cáo kiểm thử — RCField Backend</h1>
<p class="sub">Chạy tự động lúc ${escapeHtml(generatedAt)} (giờ Việt Nam)</p>

<div class="verdict ${allGreen && !results.crashed ? 'ok' : 'bad'}">${escapeHtml(conclusion)}</div>

<h2>Số liệu tổng hợp</h2>
<div class="cards">
 <div class="card"><div class="k">Tổng số ca</div><div class="v">${totals.tests}</div></div>
 <div class="card"><div class="k">Đạt</div><div class="v ok">${totals.passed}</div></div>
 <div class="card"><div class="k">Lỗi</div><div class="v ${ok ? 'ok' : 'bad'}">${totals.failed}</div></div>
 <div class="card"><div class="k">Tỷ lệ đạt</div><div class="v ${ok ? 'ok' : 'bad'}">${passRate}%</div></div>
 <div class="card"><div class="k">Nhóm nghiệp vụ</div><div class="v">${areas.length}</div></div>
 <div class="card"><div class="k">Thời gian</div><div class="v">${(totals.durationMs / 1000).toFixed(0)}s</div></div>
</div>

<h2>Kiểm thử tự động bảo đảm điều gì</h2>
<p class="lead">Mỗi dòng là một mảng nghiệp vụ của hệ thống. Cột cuối nói rõ: nếu nhóm ca đó đạt thì điều gì được bảo đảm.</p>
<table><tr><th>Nghiệp vụ</th><th>Số ca</th><th>Đạt</th><th>Chưa chạy</th><th>Kết quả</th><th>Bảo đảm điều gì</th></tr>
${areas
  .map(
    (a) => `<tr>
      <td><strong>${escapeHtml(a.name)}</strong><div style="color:#747878;font-size:12px;margin-top:2px">${a.suites} bộ kiểm thử</div></td>
      <td class="num">${a.cases}</td>
      <td class="num">${a.passed}</td>
      <td class="num" style="color:#747878">${a.notRun || '—'}</td>
      <td><span class="pill ${a.failed ? 'bad' : 'ok'}">${a.failed ? `${a.failed} LỖI` : 'ĐẠT'}</span></td>
      <td>${escapeHtml(a.guarantee)}</td>
    </tr>`,
  )
  .join('\n')}
</table>

<p class="lead" style="margin-top:10px">
  Cột <em>chưa chạy</em> gồm ca tạm bỏ qua và ca đã khai tên nhưng chưa viết nội dung
  (${totals.skipped} bỏ qua, ${totals.todo} chưa viết). Chúng không phải ca lỗi,
  nhưng cũng chưa bảo đảm được gì.
</p>

${
  apiCoverage
    ? `<h2>Độ phủ kiểm thử API</h2>
<p class="lead">Đếm số endpoint đã được gọi thật qua HTTP trong bộ kiểm thử chạy trên cơ sở dữ liệu thật. Khác với độ phủ dòng lệnh: một service phủ nhiều dòng vẫn có thể chưa endpoint nào đi qua lớp xác thực, phân quyền và kiểm dữ liệu vào.</p>
<div class="cards">
 <div class="card"><div class="k">Đã có kiểm thử</div><div class="v ok">${apiCoverage.covered}</div></div>
 <div class="card"><div class="k">Tổng endpoint</div><div class="v">${apiCoverage.total}</div></div>
 <div class="card"><div class="k">Tỷ lệ</div><div class="v ${apiCoverage.pct >= 60 ? 'ok' : ''}">${apiCoverage.pct}%</div></div>
</div>
<p class="lead">Xếp theo <strong>số endpoint còn thiếu</strong> — đó là khối lượng việc còn lại, và cũng là thứ tự rủi ro. Xếp theo phần trăm thì một miền 0/1 nằm ngang hàng với miền 4/45.</p>
<table style="margin-top:12px"><tr><th>Miền</th><th class="num">Còn thiếu</th><th class="num">Đã phủ</th><th class="num">Tổng</th><th class="num">Tỷ lệ</th></tr>
${apiCoverage.domains
  .map((d) => {
    // Ba mức, không phải đạt/hỏng. Bảng chỉ hai màu thì mọi thứ dưới chuẩn đều
    // đỏ như nhau, và người đọc không thấy được chỗ nào đáng lo trước.
    const cls = d.level === 'ok' ? 'ok' : d.level === 'warn' ? 'warn' : 'bad';
    return `<tr><td><code>${escapeHtml(d.name)}</code></td><td class="num">${d.missing || '—'}</td><td class="num">${d.covered}</td><td class="num">${d.total}</td><td class="num"><span class="pill ${cls}">${d.pct}%</span></td></tr>`;
  })
  .join('\n')}
</table>
<p class="lead" style="margin-top:10px">
  Đây là số liệu để biết còn phải viết thêm ở đâu, không phải điểm đánh giá chất lượng.
  Endpoint chưa có kiểm thử tích hợp không có nghĩa là nó hỏng — nghĩa là chưa ai gọi thử qua HTTP.
</p>
`
    : ''
}

${
  apiContract
    ? `<h2>Kiểm tra giao kèo API giữa giao diện và máy chủ</h2>
<p class="lead">Đối chiếu mọi lệnh gọi API trong mã giao diện với mọi endpoint máy chủ đăng ký, để phát hiện chỗ giao diện gọi vào endpoint không tồn tại.</p>
<div class="cards">
 <div class="card"><div class="k">Giao diện gọi</div><div class="v">${apiContract.feCalls}</div></div>
 <div class="card"><div class="k">Máy chủ đăng ký</div><div class="v">${apiContract.beRoutes}</div></div>
 <div class="card"><div class="k">Gọi vào chỗ trống</div><div class="v ${contractBroken ? 'bad' : 'ok'}">${contractBroken}</div></div>
</div>
${
  contractBroken
    ? `<table style="margin-top:12px"><tr><th>Endpoint giao diện gọi</th><th>Nơi gọi</th></tr>
${apiContract.broken
  .map(
    (b) =>
      `<tr><td><code>${escapeHtml(b.call)}</code></td><td style="color:#747878">${escapeHtml(b.where[0] || '')}</td></tr>`,
  )
  .join('\n')}</table>`
    : '<div class="note">Không có endpoint nào bị gọi vào chỗ trống.</div>'
}`
    : ''
}

${
  apiSmoke
    ? `<h2>Gọi thử endpoint máy chủ</h2>
<p class="lead">Gọi thật từng endpoint đọc dữ liệu, dùng mã định danh lấy từ cơ sở dữ liệu, để phát hiện endpoint vỡ khi chạy. Chỉ gọi loại đọc để không làm thay đổi dữ liệu.</p>
<div class="cards">
 <div class="card"><div class="k">Đã gọi</div><div class="v">${apiSmoke.total}</div></div>
 <div class="card"><div class="k">Trả lỗi máy chủ</div><div class="v ${smokeBroken ? 'bad' : 'ok'}">${smokeBroken}</div></div>
 <div class="card"><div class="k">Phản hồi chậm</div><div class="v">${apiSmoke.slow ? apiSmoke.slow.length : 0}</div></div>
</div>
${
  smokeBroken
    ? `<table style="margin-top:12px"><tr><th>Endpoint</th><th>Mã</th><th>Thông báo</th></tr>
${apiSmoke.broken
  .map(
    (b) =>
      `<tr><td><code>${escapeHtml(b.route)}</code></td><td class="num">${b.status === -1 ? 'chết' : b.status}</td><td style="color:#747878">${escapeHtml((b.note || '').slice(0, 120))}</td></tr>`,
  )
  .join('\n')}</table>`
    : '<div class="note">Không endpoint nào trả lỗi máy chủ.</div>'
}`
    : ''
}

${
  coverage
    ? `<h2>Độ phủ mã nguồn</h2>
<p class="lead">Tỷ lệ mã nguồn thực sự được chạy qua trong lúc kiểm thử. Đây là số đo tự động, không phải ước lượng.</p>
<table><tr><th>Loại</th><th>Tỷ lệ</th><th>Đã phủ / Tổng</th></tr>
${['statements', 'branches', 'functions', 'lines']
  .map((k) =>
    coverage[k]
      ? `<tr><td>${{ statements: 'Câu lệnh', branches: 'Nhánh rẽ', functions: 'Hàm', lines: 'Dòng' }[k]}</td><td class="num">${coverage[k].pct}%</td><td class="num">${coverage[k].covered}/${coverage[k].total}</td></tr>`
      : '',
  )
  .join('\n')}</table>`
    : ''
}

<h2>Phạm vi chưa được kiểm thử tự động</h2>
<div class="note">
  Nêu rõ để không hiểu nhầm bản báo cáo này bảo đảm nhiều hơn thực tế:
  <ul style="margin:8px 0 0;padding-left:20px">
    <li>Giao diện người dùng chỉ kiểm ở mức hàm xử lý, chưa mô phỏng thao tác thật trên trình duyệt.</li>
    <li>Thanh toán chạy trên môi trường thử của VNPay và mô phỏng chuyển khoản, không phải giao dịch tiền thật.</li>
    <li>Chưa kiểm tải cao, chưa kiểm xâm nhập, chưa kiểm trên ma trận trình duyệt và thiết bị.</li>
    ${apiSmoke ? '<li>Phép gọi thử endpoint chỉ chạy loại đọc; các thao tác ghi được kiểm qua bộ kiểm thử tự động ở trên.</li>' : ''}
  </ul>
</div>

</div></body></html>`;
fs.writeFileSync(path.join(outDir, 'test-report.html'), html);

console.log(
  results.crashed
    ? `Đã dựng báo cáo tối thiểu trong ${outDir}/ — không có kết quả để đọc (tiến trình test đã chết).`
    : `Đã dựng báo cáo trong ${outDir}/ — ${totals.passed}/${totals.tests} ca đạt (${passRate}%), ${totals.suites} bộ kiểm thử`,
);
