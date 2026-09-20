import 'dotenv/config';
import 'reflect-metadata';
import { AppDataSource } from '../config/database';
import { logger } from '../config/logger';

/**
 * Bật nhận tiền bằng chuyển khoản (mã QR VietQR) cho các chi nhánh mẫu.
 *
 * Không có dòng nào trong `cafe_payment_settings` thì `resolvePaymentMethodsForCafe`
 * chỉ trả về VNPay, nên màn hình thanh toán KHÔNG hiện lựa chọn quét mã — luồng
 * này trở nên không demo được dù mã nguồn đã đủ.
 *
 * Ba điều kiện phải đủ cả, thiếu một là hệ thống lặng lẽ rơi về VNPay:
 *   1. `method = 'BANK_TRANSFER'`
 *   2. đủ bộ ba `bank_bin` + `account_number` + `account_name`
 *   3. `is_verified = true` — cố ý chặt, vì dùng một số tài khoản chưa ai kiểm
 *      là cách nhanh nhất để tiền của khách chảy vào tài khoản người lạ.
 *
 * Số tài khoản dưới đây là số giả dùng cho môi trường thử. Ở bản chạy thật, chủ
 * quán tự khai số của mình rồi tự quét thử để hệ thống đánh dấu đã xác minh.
 */
const BANKS: Array<{ code: string; bin: string; label: string }> = [
  { code: 'VCB', bin: '970436', label: 'Vietcombank' },
  { code: 'TCB', bin: '970407', label: 'Techcombank' },
  { code: 'MB', bin: '970422', label: 'MB Bank' },
  { code: 'ACB', bin: '970416', label: 'ACB' },
  { code: 'BIDV', bin: '970418', label: 'BIDV' },
];

/** Bỏ dấu tiếng Việt — tên chủ tài khoản ngân hàng luôn là chữ không dấu, in hoa. */
function toBankAccountName(cafeName: string): string {
  const stripped = cafeName
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
  return stripped
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function seed(): Promise<void> {
  await AppDataSource.initialize();
  logger.database('Connected');

  const cafes = await AppDataSource.query<{ id: string; name: string }[]>(
    `SELECT id, name FROM cafes WHERE deleted_at IS NULL ORDER BY created_at`,
  );

  if (!cafes.length) {
    logger.warn('SeedPayment', 'Chưa có chi nhánh nào — chạy seed-cafes.ts trước');
    await AppDataSource.destroy();
    return;
  }

  let created = 0;
  for (const [index, cafe] of cafes.entries()) {
    const bank = BANKS[index % BANKS.length];
    // Số tài khoản giả nhưng đúng định dạng: 4–19 chữ số, khác nhau giữa các
    // chi nhánh vì đối soát tra chi nhánh THEO số tài khoản nhận.
    const accountNumber = `9704${String(index + 1).padStart(2, '0')}${'0'.repeat(4)}${index + 1}`;

    const [existing] = await AppDataSource.query<{ id: string }[]>(
      `SELECT id FROM cafe_payment_settings WHERE cafe_id = $1`,
      [cafe.id],
    );
    if (existing) {
      logger.warn('SeedPayment', `Skip — đã có cấu hình: ${cafe.name}`);
      continue;
    }

    await AppDataSource.query(
      `INSERT INTO cafe_payment_settings
         (cafe_id, method, bank_code, bank_bin, account_number, account_name,
          is_verified, verified_at)
       VALUES ($1, 'BANK_TRANSFER', $2, $3, $4, $5, true, NOW())`,
      [cafe.id, bank.code, bank.bin, accountNumber, toBankAccountName(cafe.name)],
    );
    created += 1;
    logger.info('SeedPayment', `${cafe.name} → ${bank.label} ${accountNumber}`);
  }

  logger.info('SeedPayment', `Done — bật chuyển khoản cho ${created} chi nhánh`);
  await AppDataSource.destroy();
}

seed().catch(async (err) => {
  logger.error('SeedPayment', 'Failed', err);
  await AppDataSource.destroy().catch(() => undefined);
  process.exit(1);
});
