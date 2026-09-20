#!/usr/bin/env node
/**
 * Soi chỗ "đứt" giữa frontend và backend.
 *
 * Đối chiếu MỌI lệnh gọi API trong mã frontend với MỌI route đã đăng ký ở
 * backend, rồi chỉ ra hai loại lệch:
 *
 *   ĐỨT   — frontend gọi một endpoint backend KHÔNG có. Chạy lên là 404, và
 *           thường không ai biết cho tới khi người dùng bấm đúng nút đó.
 *   THỪA  — backend có endpoint mà không frontend nào gọi. Không gây lỗi, nhưng
 *           là bề mặt tấn công và mã chết cần rà.
 *
 * Đây chính là loại lỗi đã xảy ra thật: `/v1/explore/featured-popups` tồn tại ở
 * nhánh phát triển nhưng chưa lên production, nên trang khám phá gọi vào hư không.
 *
 * Dùng:
 *   node scripts/check-api-contract.js <thư-mục-frontend> [--json]
 */
'use strict';

const fs = require('fs');
const path = require('path');

const feRoot = process.argv[2];
const asJson = process.argv.includes('--json');
if (!feRoot || !fs.existsSync(feRoot)) {
  console.error('Dùng: node scripts/check-api-contract.js <thư-mục-frontend> [--json]');
  process.exit(1);
}

const { METHODS, normalize, collectBackendRoutes } = require('./lib/backend-routes');

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', 'dist', '.git', 'build', 'coverage'].includes(entry.name)) continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

// ── Thu thập lệnh gọi ở frontend ─────────────────────────────────────────────
const feCalls = new Map(); // "METHOD path" -> [file:line]
for (const file of walk(path.join(feRoot, 'src'))) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    // api.get<T>("/v1/...") | api.post(`/v1/...`)
    const re = new RegExp(
      `\\bapi\\.(${METHODS.join('|')})\\s*(?:<[^>]*>)?\\s*\\(\\s*[\`"']([^\`"']+)`,
      'g',
    );
    let m;
    while ((m = re.exec(line))) {
      const key = `${m[1].toUpperCase()} ${normalize(m[2])}`;
      const where = `${path.relative(feRoot, file)}:${i + 1}`;
      if (!feCalls.has(key)) feCalls.set(key, []);
      feCalls.get(key).push(where);
    }
  });
}

// ── Thu thập route ở backend ─────────────────────────────────────────────────
//
// Dùng chung module với `api-coverage.js`. Giữ hai bản sao của cùng đoạn quét
// route thì hai báo cáo sớm muộn cho hai con số khác nhau về cùng một hệ thống.
const beRoutes = collectBackendRoutes();

// ── Đối chiếu ────────────────────────────────────────────────────────────────
const broken = [];
for (const [call, where] of feCalls) {
  if (!beRoutes.has(call)) broken.push({ call, where });
}
const unused = [...beRoutes.keys()].filter((r) => !feCalls.has(r)).sort();

if (asJson) {
  console.log(
    JSON.stringify({ broken, unused, feCalls: feCalls.size, beRoutes: beRoutes.size }, null, 2),
  );
} else {
  console.log(`Frontend gọi ${feCalls.size} endpoint · Backend đăng ký ${beRoutes.size} route\n`);
  if (broken.length === 0) {
    console.log('✅ Không có endpoint nào bị đứt.');
  } else {
    console.log(`🔴 ${broken.length} endpoint ĐỨT — frontend gọi nhưng backend không có:\n`);
    for (const b of broken) {
      console.log(`  ${b.call}`);
      for (const w of b.where.slice(0, 3)) console.log(`      ${w}`);
    }
  }
  console.log(
    `\n⚪ ${unused.length} route backend không frontend nào gọi (tham khảo, không phải lỗi).`,
  );
}

process.exitCode = broken.length > 0 ? 1 : 0;
