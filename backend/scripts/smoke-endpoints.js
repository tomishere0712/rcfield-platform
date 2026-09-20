#!/usr/bin/env node
/**
 * Gọi thử mọi endpoint GET của backend và chỉ ra cái nào đang lỗi.
 *
 * Vì sao chỉ GET: POST/PATCH/DELETE làm thay đổi dữ liệu. Một bộ kiểm nhanh mà
 * tạo booking hay xoá chi nhánh thì tệ hơn cái nó phát hiện được.
 *
 * Tham số đường dẫn (`:cafeId`, `:bookingId`…) được thay bằng ID THẬT lấy từ cơ
 * sở dữ liệu. Nhét uuid bịa vào thì mọi thứ trả 404 và chẳng kiểm được gì —
 * lỗi thật thường nằm sau bước tra cứu bản ghi.
 *
 * Cách đọc kết quả:
 *   5xx        → LỖI THẬT. Máy chủ vỡ, không phải người gọi sai.
 *   401 / 403  → bình thường, endpoint đòi đăng nhập hoặc đúng vai trò.
 *   404        → bình thường nếu không tìm được ID phù hợp để thay.
 *   400        → bình thường, thiếu tham số truy vấn bắt buộc.
 *
 * Dùng:
 *   node scripts/smoke-endpoints.js [http://localhost:3000] [--json]
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
require('dotenv').config();

const BASE = process.argv.find((a) => a.startsWith('http')) || 'http://localhost:3000';
const asJson = process.argv.includes('--json');
const routesDir = path.join(__dirname, '..', 'src', 'routes');

// ── Gom mọi route GET, kể cả router lồng ─────────────────────────────────────
const indexSrc = fs.readFileSync(path.join(routesDir, 'index.ts'), 'utf8');
const appSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.ts'), 'utf8');

function importsOf(src) {
  const map = new Map();
  const re = /import\s*\{?\s*([\w\s,]+?)\s*\}?\s*from\s*['"]\.\/(?:routes\/)?([\w.\-]+)['"]/g;
  let m;
  while ((m = re.exec(src))) {
    for (const n of m[1].split(',').map((x) => x.trim())) map.set(n, m[2]);
  }
  return map;
}
const rootImports = new Map([...importsOf(indexSrc), ...importsOf(appSrc)]);

const routes = new Map(); // path -> tệp khai báo
function collect(file, prefix, seen = new Set()) {
  const full = path.join(routesDir, `${file}.ts`);
  if (!fs.existsSync(full) || seen.has(full)) return;
  seen.add(full);
  const src = fs.readFileSync(full, 'utf8');

  let m;
  const get = /\.get\s*\(\s*['"]([^'"]*)['"]/g;
  while ((m = get.exec(src))) {
    routes.set(`${prefix}${m[1]}`.replace(/\/+/g, '/').replace(/\/$/, '') || '/', `${file}.ts`);
  }

  const local = importsOf(src);
  const nested = /\.use\(\s*['"]([^'"]+)['"]\s*,\s*(\w+)/g;
  while ((m = nested.exec(src))) {
    const child = local.get(m[2]) ?? rootImports.get(m[2]);
    if (child) collect(child, `${prefix}${m[1]}`, seen);
  }
}

for (const src of [indexSrc, appSrc]) {
  const re = /\.use\(\s*['"]([^'"]+)['"]\s*,\s*(\w+)/g;
  let m;
  while ((m = re.exec(src))) {
    const file = rootImports.get(m[2]);
    if (file) collect(file, m[1].replace(/^\/api\/v1/, '').replace(/^\/v1/, ''));
  }
}
{
  const re = /router\.get\s*\(\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(indexSrc))) routes.set(m[1], 'index.ts');
}

// ── Lấy ID thật để thay vào tham số ──────────────────────────────────────────
async function loadIds() {
  const c = new Client({
    host: process.env.DB_HOST,
    port: +(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
  });
  await c.connect();
  const one = async (sql) => {
    try {
      const r = await c.query(sql);
      return r.rows[0]?.id ?? null;
    } catch {
      return null;
    }
  };
  const ids = {
    cafeId: await one("SELECT id FROM cafes WHERE deleted_at IS NULL AND status='ACTIVE' LIMIT 1"),
    bookingId: await one('SELECT id FROM bookings LIMIT 1'),
    sessionId: await one('SELECT id FROM sessions LIMIT 1'),
    contestId: await one('SELECT id FROM contests LIMIT 1'),
    userId: await one('SELECT id FROM users LIMIT 1'),
    providerId: await one("SELECT id FROM users WHERE role='PROVIDER' LIMIT 1"),
    vehicleId: await one('SELECT id FROM vehicles LIMIT 1'),
    menuItemId: await one('SELECT id FROM menu_items LIMIT 1'),
    planId: await one('SELECT id FROM subscription_plans LIMIT 1'),
    trackTypeId: await one('SELECT id FROM track_types LIMIT 1'),
  };
  const slug = await c.query("SELECT slug FROM cafes WHERE deleted_at IS NULL LIMIT 1");
  ids.cafeSlug = slug.rows[0]?.slug ?? 'khong-co';
  await c.end();
  return ids;
}

function fillParams(routePath, ids) {
  return routePath.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, (_, name) => {
    if (ids[name]) return ids[name];
    // Tên tham số lạ thì đoán theo hậu tố, rồi mới rơi về uuid rỗng.
    if (/slug/i.test(name)) return ids.cafeSlug;
    if (/cafe/i.test(name)) return ids.cafeId ?? '';
    if (/booking/i.test(name)) return ids.bookingId ?? '';
    if (/session/i.test(name)) return ids.sessionId ?? '';
    if (/contest/i.test(name)) return ids.contestId ?? '';
    if (/user|staff|provider/i.test(name)) return ids.userId ?? '';
    return '00000000-0000-0000-0000-000000000000';
  });
}

(async () => {
  const ids = await loadIds();
  const list = [...routes.entries()].sort();
  const results = [];

  for (const [routePath, file] of list) {
    const url = BASE + '/api/v1' + fillParams(routePath, ids);
    const started = Date.now();
    let status = 0;
    let note = '';
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      status = res.status;
      if (status >= 500) note = (await res.text()).slice(0, 160).replace(/\s+/g, ' ');
    } catch (err) {
      status = -1;
      note = err.name === 'TimeoutError' ? 'quá 15 giây không phản hồi' : err.message;
    }
    results.push({ route: routePath, file, url, status, ms: Date.now() - started, note });
  }

  const broken = results.filter((r) => r.status >= 500 || r.status === -1);
  const slow = results.filter((r) => r.ms > 3000 && r.status < 500 && r.status !== -1);

  if (asJson) {
    console.log(JSON.stringify({ total: results.length, broken, slow, results }, null, 2));
  } else {
    const byStatus = results.reduce((acc, r) => ((acc[r.status] = (acc[r.status] || 0) + 1), acc), {});
    console.log(`Đã gọi ${results.length} endpoint GET tại ${BASE}\n`);
    console.log('Phân bố mã trả về:');
    for (const [s, n] of Object.entries(byStatus).sort()) {
      const label = s === '-1' ? 'không kết nối được' : s;
      console.log(`  ${String(label).padStart(4)}  ${n}`);
    }

    console.log('');
    if (broken.length === 0) {
      console.log('✅ Không endpoint nào trả 5xx.');
    } else {
      console.log(`🔴 ${broken.length} endpoint LỖI:\n`);
      for (const b of broken) {
        console.log(`  ${b.status === -1 ? 'CHẾT' : b.status}  ${b.route}   (${b.file})`);
        if (b.note) console.log(`        ${b.note}`);
      }
    }
    if (slow.length) {
      console.log(`\n🐢 ${slow.length} endpoint chậm hơn 3 giây:`);
      for (const s of slow) console.log(`  ${s.ms}ms  ${s.route}`);
    }
  }

  process.exitCode = broken.length > 0 ? 1 : 0;
})().catch((err) => {
  console.error('Lỗi khi chạy:', err.message);
  process.exit(1);
});
