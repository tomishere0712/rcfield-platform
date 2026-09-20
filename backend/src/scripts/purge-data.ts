/* eslint-disable no-console */
import 'reflect-metadata';
import { AppDataSource } from '../config/database';
import { env } from '../config/env';
import {
  executeContestPurge,
  hardDeleteUsers,
  previewContestPurge,
  previewUserPurge,
  softDeleteUsers,
  type PurgeCount,
} from '../services/purge.service';

/**
 * Dọn dữ liệu thử từ dòng lệnh.
 *
 * Toàn bộ logic nằm ở `purge.service` — tệp này chỉ đọc tham số, in bảng và
 * quyết định commit hay quay lại. Contest Lab gọi đúng những hàm đó qua HTTP,
 * nên hai đường không thể lệch chốt chặn.
 *
 * Ba rào chắn, theo đúng thứ tự nguy hiểm:
 *
 *  1. CHẠY KHÔ là mặc định. Không có --yes thì giao dịch luôn quay lại.
 *  2. Trên production còn phải thêm --production.
 *  3. Mẫu email quét trúng vai trò vận hành thì dừng, đòi --include-staff.
 */

type Args = Record<string, string | boolean>;

function parseArgs(argv: string[]): { cmd: string; args: Args } {
  const [cmd = '', ...rest] = argv;
  const args: Args = {};
  for (const item of rest) {
    const m = /^--([\w-]+)(?:=(.*))?$/.exec(item);
    if (m) args[m[1]] = m[2] ?? true;
  }
  return { cmd, args };
}

function bang(rows: Array<Record<string, string | number>>): void {
  if (!rows.length) {
    console.log('   (không có gì)');
    return;
  }
  const cols = Object.keys(rows[0]);
  const w = cols.map((c) => Math.max(c.length, ...rows.map((r) => String(r[c]).length)));
  console.log('   ' + cols.map((c, i) => c.padEnd(w[i])).join('  '));
  rows.forEach((r) =>
    console.log('   ' + cols.map((c, i) => String(r[c]).padEnd(w[i])).join('  ')),
  );
}

const asRows = (counts: PurgeCount[]) => counts.map((c) => ({ bang: c.table, so: c.count }));

/** In thẳng môi trường và CSDL ra, để nhìn là biết sắp đụng vào cái gì. */
function assertMoiTruong(args: Args): void {
  console.log(`Môi trường: ${env.NODE_ENV} · CSDL: ${env.db.url ? '(DATABASE_URL)' : env.db.name}`);
  if (env.NODE_ENV === 'production' && !args.production) {
    throw new Error(
      'Đang trỏ vào PRODUCTION. Thêm --production nếu bạn thật sự muốn xoá dữ liệu thật.',
    );
  }
}

async function main() {
  const { cmd, args } = parseArgs(process.argv.slice(2));
  const apply = Boolean(args.yes);

  if (!['contests', 'users'].includes(cmd)) {
    console.log(
      'Dùng:\n' +
        '  npm run purge -- contests --provider=<email|id> [--yes]\n' +
        '  npm run purge -- users --like=<mẫu email> [--hard] [--cascade] [--include-staff] [--yes]\n' +
        '\nMặc định CHẠY KHÔ: chỉ in ra, không đổi gì.',
    );
    process.exit(1);
  }

  try {
    assertMoiTruong(args);
  } catch (err) {
    // Bắt riêng: rào chắn môi trường hay bị chạm nhất, và một vệt lỗi Node dài
    // mười dòng che mất đúng câu cần đọc.
    console.error('\n' + (err as Error).message);
    process.exit(1);
  }

  await AppDataSource.initialize();
  const qr = AppDataSource.createQueryRunner();
  await qr.connect();
  await qr.startTransaction();
  try {
    if (cmd === 'contests') {
      const pv = await previewContestPurge(qr, String(args.provider ?? ''));
      console.log(`\nChủ sân: ${pv.provider.email}  (${pv.provider.id})`);
      if (!pv.contestIds.length) {
        console.log('Không có giải nào.');
      } else {
        console.log('\nSẽ xoá:');
        bang(asRows(pv.counts));
        if (apply) {
          await executeContestPurge(qr, pv.contestIds);
          console.log(`\nĐã xoá ${pv.contestIds.length} giải.`);
        } else {
          console.log('\nCHẠY KHÔ — chưa xoá gì. Thêm --yes để thực hiện.');
        }
      }
    } else {
      const like = String(args.like ?? '');
      const pv = await previewUserPurge(qr, { like });
      if (!pv.users.length) {
        console.log(`Không có tài khoản nào khớp "${like}".`);
      } else {
        if (pv.nonCustomers.length && !args['include-staff']) {
          console.log(`\n${pv.nonCustomers.length} tài khoản KHÔNG phải khách hàng bị quét trúng:`);
          bang(pv.nonCustomers.map((u) => ({ email: u.email, vai_tro: u.role })));
          throw new Error('Thêm --include-staff nếu thật sự muốn đụng tới các vai trò này.');
        }

        console.log(`\nKhớp ${pv.users.length} tài khoản:`);
        bang(pv.users.slice(0, 10).map((u) => ({ email: u.email, vai_tro: u.role })));
        if (pv.users.length > 10) console.log(`   … và ${pv.users.length - 10} tài khoản nữa`);
        console.log('\nĐang bị tham chiếu ở:');
        bang(pv.references.map((r) => ({ bang_cot: r.table, so_ban_ghi: r.count })));

        const hard = Boolean(args.hard);
        const cascade = Boolean(args.cascade);
        const ids = pv.users.map((u) => u.id);

        if (hard && !pv.canHardDelete && !cascade) {
          console.log(
            '\nKhông xoá hẳn được: còn bản ghi trỏ vào các tài khoản này.\n' +
              'Thêm --cascade để xoá kèm dữ liệu riêng của khách, hoặc bỏ --hard để khoá mềm.',
          );
        } else if (!apply) {
          console.log(`\nCHẠY KHÔ — chưa đổi gì. Thêm --yes để ${hard ? 'xoá hẳn' : 'khoá mềm'}.`);
        } else if (hard) {
          await hardDeleteUsers(qr, ids, cascade);
          console.log(`\nĐã xoá hẳn ${ids.length} tài khoản.`);
        } else {
          await softDeleteUsers(qr, ids);
          console.log(
            `\nĐã khoá mềm ${ids.length} tài khoản — biến mất khỏi ứng dụng, không đăng nhập ` +
              'được, lịch sử vẫn giữ nguyên.',
          );
        }
      }
    }

    if (apply) await qr.commitTransaction();
    else await qr.rollbackTransaction();
  } catch (err) {
    await qr.rollbackTransaction();
    console.error('\nHỎNG — đã quay lại toàn bộ, không đổi gì:', (err as Error).message);
    process.exitCode = 1;
  } finally {
    await qr.release();
    await AppDataSource.destroy();
  }
}

void main();
