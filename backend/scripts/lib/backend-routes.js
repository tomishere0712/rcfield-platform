'use strict';
/**
 * Liệt kê MỌI route backend đã đăng ký, kèm tệp khai báo.
 *
 * Tách riêng để `check-api-contract.js` và `api-coverage.js` dùng chung một
 * nguồn sự thật. Hai bản sao của cùng đoạn quét route sớm muộn cũng lệch nhau,
 * và lúc đó hai báo cáo cho hai con số khác nhau về cùng một hệ thống.
 */
const fs = require('fs');
const path = require('path');

const METHODS = ['get', 'post', 'put', 'patch', 'delete'];
const SRC_DIR = path.join(__dirname, '..', '..', 'src');
const ROUTES_DIR = path.join(SRC_DIR, 'routes');

/**
 * Chuẩn hoá đường dẫn để so được giữa các nguồn khác nhau.
 * Tham số động viết `:name` ở backend, `${...}` ở frontend, và là uuid thật
 * trong test — đưa hết về `{}`.
 */
function normalize(url) {
  return (
    url
      .replace(/^\/api\/v1/, '')
      .replace(/^\/v1/, '')
      .replace(/\$\{[^}]*\}/g, '{}')
      .replace(/:[A-Za-z_][A-Za-z0-9_]*/g, '{}')
      .replace(/\?.*$/, '')
      .replace(/\/+$/, '') || '/'
  );
}

/** @returns {Map<string, string>} "METHOD /path" → tên tệp khai báo */
function collectBackendRoutes() {
  const indexSrc = fs.readFileSync(path.join(ROUTES_DIR, 'index.ts'), 'utf8');
  const appSrc = fs.readFileSync(path.join(SRC_DIR, 'app.ts'), 'utf8');

  const importMap = new Map();
  for (const src of [indexSrc, appSrc]) {
    const re = /import\s*\{?\s*([\w\s,]+?)\s*\}?\s*from\s*['"]\.\/(?:routes\/)?([\w.\-]+)['"]/g;
    let m;
    while ((m = re.exec(src))) {
      for (const name of m[1].split(',').map((x) => x.trim())) importMap.set(name, m[2]);
    }
  }

  const mounts = [];
  for (const src of [indexSrc, appSrc]) {
    const re = /\.use\(\s*['"]([^'"]+)['"]\s*,\s*(\w+)/g;
    let m;
    while ((m = re.exec(src))) {
      mounts.push({
        prefix: m[1].replace(/^\/api\/v1/, '').replace(/^\/v1/, ''),
        varName: m[2],
      });
    }
  }

  const routes = new Map();

  /** Các biến router khai trong một tệp, để biết tệp có nhiều router hay không. */
  function declaredRouters(src) {
    const out = new Set();
    const re = /(?:export\s+)?const\s+(\w+)\s*=\s*Router\s*\(/g;
    let m;
    while ((m = re.exec(src))) out.add(m[1]);
    return out;
  }

  function collectFromRouter(file, prefix, seen = new Set(), routerVar = null) {
    const full = path.join(ROUTES_DIR, `${file}.ts`);
    // Khoá gồm cả prefix: cùng một tệp gắn ở hai prefix là hai bộ route khác nhau.
    const visitKey = `${full}|${prefix}|${routerVar ?? ''}`;
    if (!fs.existsSync(full) || seen.has(visitKey)) return;
    seen.add(visitKey);
    const src = fs.readFileSync(full, 'utf8');

    // Bắt cả TÊN BIẾN router đứng trước, không chỉ phương thức.
    //
    // Một tệp có thể khai nhiều router gắn ở nhiều prefix khác nhau —
    // `bank-payment.routes.ts` có `banksRouter`, `bankTransactionRouter` và
    // `cafeBankPaymentRouter`. Quét cả tệp rồi gán hết cho mọi prefix sẽ sinh ra
    // endpoint ma: `/banks/payment-settings` và `/bank-transactions/payment-settings`
    // cùng xuất hiện trong khi thật ra chỉ tồn tại một cái.
    const re = new RegExp(
      `(\\w+)\\.(${METHODS.join('|')})\\s*\\(\\s*['"]([^'"]*)['"]`,
      'g',
    );
    let m;
    while ((m = re.exec(src))) {
      // Tệp chỉ khai một router thì nhận hết; nhiều router thì chỉ nhận đúng
      // biến đang được gắn vào prefix này.
      if (routerVar && m[1] !== routerVar && declaredRouters(src).size > 1) continue;
      const p = normalize((prefix + m[3]).replace(/\/+/g, '/'));
      routes.set(`${m[2].toUpperCase()} ${p}`, `${file}.ts`);
    }

    // Router lồng khai ngay trong tệp con, không phải ở index.ts.
    const localImports = new Map();
    const ri = /import\s*\{?\s*([\w\s,]+?)\s*\}?\s*from\s*['"]\.\/([\w.\-]+)['"]/g;
    let mi;
    while ((mi = ri.exec(src))) {
      for (const name of mi[1].split(',').map((x) => x.trim())) localImports.set(name, mi[2]);
    }

    const nested = /\.use\(\s*['"]([^'"]+)['"]\s*,\s*(\w+)/g;
    while ((m = nested.exec(src))) {
      const childFile = localImports.get(m[2]) ?? importMap.get(m[2]);
      if (childFile) collectFromRouter(childFile, `${prefix}${m[1]}`, seen);
    }
  }

  for (const { prefix, varName } of mounts) {
    const file = importMap.get(varName);
    if (file) collectFromRouter(file, prefix, new Set(), varName);
  }

  // Route khai thẳng trong index.ts, ví dụ /track-types.
  const direct = new RegExp(`router\\.(${METHODS.join('|')})\\s*\\(\\s*['"]([^'"]+)['"]`, 'g');
  let m;
  while ((m = direct.exec(indexSrc))) {
    routes.set(`${m[1].toUpperCase()} ${normalize(m[2])}`, 'index.ts');
  }

  return routes;
}

/** Gom route theo miền nghiệp vụ, lấy đoạn đầu của đường dẫn. */
function domainOf(routeKey) {
  const p = routeKey.split(' ')[1] ?? '/';
  const seg = p.split('/').filter(Boolean);
  if (!seg.length) return 'khác';
  if (seg[0] === 'admin') return `admin/${seg[1] ?? ''}`.replace(/\/$/, '');
  return seg[0];
}

module.exports = { METHODS, normalize, collectBackendRoutes, domainOf };
