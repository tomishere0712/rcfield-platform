import request from 'supertest';
import { app } from '../../app';
import { AppDataSource } from '../../config/database';
import { env } from '../../config/env';
import { CustomerPackageStatus, PaymentTransactionStatus, UserRole } from '../../types';
import { createTestCafe, createTestUser, generateToken } from '../helpers';

/**
 * Mua gói slot bằng chuyển khoản quét mã QR.
 *
 * Tiền về thẳng tài khoản của chi nhánh bán gói, giống luồng đặt sân. Nửa sau
 * đã có sẵn — webhook tra giao dịch theo mã tham chiếu rồi kích hoạt gói — nên
 * điều phải canh ở đây là nửa đầu dựng đúng: mã tham chiếu nằm trên GIAO DỊCH,
 * và gói KHÔNG được tự kích hoạt trước khi tiền thật về.
 */

async function seedCafeWithBank() {
  const cafe = await createTestCafe();
  await AppDataSource.query(
    `INSERT INTO cafe_payment_settings
       (cafe_id, method, bank_code, bank_bin, account_number, account_name,
        is_verified, verified_at)
     VALUES ($1, 'BANK_TRANSFER', 'VCB', '970436', '1234567890', 'QUAN RC TEST', true, NOW())`,
    [cafe.id],
  );
  return cafe;
}

async function seedPackage(cafeId: string, price = 100000) {
  const [pkg] = await AppDataSource.query<{ id: string }[]>(
    `INSERT INTO packages
       (cafe_id, code, name, slot_count, valid_days, price, status,
        applicable_play_modes, billing_period, benefits, is_popular)
     VALUES ($1, $3, 'Gói 4 lượt', 4, 30, $2, 'ACTIVE',
             ARRAY['RENTAL']::text[], 'MONTH', ARRAY[]::text[], false)
     RETURNING id`,
    [cafeId, price, 'PKG' + Math.random().toString(36).slice(2, 10).toUpperCase()],
  );
  return pkg.id;
}

async function readPackageState(customerPackageId: string) {
  const [row] = await AppDataSource.query<{ status: string }[]>(
    `SELECT status FROM customer_packages WHERE id = $1`,
    [customerPackageId],
  );
  return row;
}

async function readTx(customerPackageId: string) {
  const [row] = await AppDataSource.query<
    { gateway: string; payment_ref_code: string | null; status: string; subject_type: string }[]
  >(
    `SELECT gateway, payment_ref_code, status, subject_type
       FROM payment_transactions WHERE customer_package_id = $1`,
    [customerPackageId],
  );
  return row;
}

function purchase(cafeId: string, packageId: string, token: string, gateway?: string) {
  return request(app)
    .post(`/api/v1/cafes/${cafeId}/packages/${packageId}/purchase`)
    .set('Authorization', `Bearer ${token}`)
    .send(gateway ? { gateway } : {});
}

describe('mua gói slot bằng chuyển khoản', () => {
  it('trả về mã QR và thông tin tài khoản của chính chi nhánh bán gói', async () => {
    const cafe = await seedCafeWithBank();
    const packageId = await seedPackage(cafe.id);
    const customer = await createTestUser({ role: UserRole.CUSTOMER });

    const res = await purchase(cafe.id, packageId, generateToken(customer), 'bank_transfer');
    expect(res.status).toBe(200);

    const d = res.body.data;
    expect(d.flow).toBe('bank_transfer');
    // Không có đường chuyển hướng: khách ở lại trang quét mã.
    expect(d.payment_url).toBeNull();
    expect(d.bank_transfer.account_number).toBe('1234567890');
    expect(d.bank_transfer.account_name).toBe('QUAN RC TEST');
    expect(d.bank_transfer.amount).toBe(100000);
    expect(d.bank_transfer.qr_image_data_url).toMatch(/^data:image\/png;base64,/);
    expect(d.bank_transfer.ref_code).toMatch(/^[A-Z0-9]+$/);
  });

  it('mã tham chiếu nằm trên GIAO DỊCH, không nằm trên gói', async () => {
    // Gắn lên gói thì mã QR của lần thử trước vẫn còn hiệu lực sau khi khách mở
    // phiên mới, và một lần chuyển khoản có thể khớp nhầm phiên đã bỏ.
    const cafe = await seedCafeWithBank();
    const packageId = await seedPackage(cafe.id);
    const customer = await createTestUser({ role: UserRole.CUSTOMER });

    const res = await purchase(cafe.id, packageId, generateToken(customer), 'bank_transfer');
    const cpId = res.body.data.customer_package_id;

    const tx = await readTx(cpId);
    expect(tx.payment_ref_code).toBe(res.body.data.bank_transfer.ref_code);
    expect(tx.gateway).toBe('BANK_TRANSFER');
    expect(tx.subject_type).toBe('CUSTOMER_PACKAGE');

    const cols = await AppDataSource.query<{ column_name: string }[]>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'customer_packages' AND column_name LIKE '%ref%'`,
    );
    expect(cols).toHaveLength(0);
  });

  it('gói vẫn CHỜ THANH TOÁN cho tới khi tiền thật về, KỂ CẢ khi bật mô phỏng VNPay', async () => {
    // Chốt chặn quan trọng nhất, và phải BẬT cờ mô phỏng mới kiểm được.
    //
    // `VNPAY_MOCK_ENABLED` tự xác nhận đơn ngay lúc tạo. Nhánh chuyển khoản mà
    // rơi vào đó thì gói sáng lên trước khi mã QR kịp hiện ra, và cả luồng đối
    // soát không bao giờ được chạy thử — hỏng âm thầm, vì nhìn bề ngoài mọi thứ
    // vẫn "thành công".
    //
    // Môi trường test để cờ này tắt, nên nếu không tự bật lên thì ca test xanh
    // vì đường mô phỏng không hề chạy, chứ không phải vì nó bị chặn đúng.
    const original = env.vnpay.mockEnabled;
    (env.vnpay as { mockEnabled: boolean }).mockEnabled = true;
    try {
      const cafe = await seedCafeWithBank();
      const packageId = await seedPackage(cafe.id);
      const customer = await createTestUser({ role: UserRole.CUSTOMER });

      const res = await purchase(cafe.id, packageId, generateToken(customer), 'bank_transfer');
      const cpId = res.body.data.customer_package_id;

      expect((await readPackageState(cpId)).status).toBe(CustomerPackageStatus.PENDING_PAYMENT);
      expect((await readTx(cpId)).status).toBe(PaymentTransactionStatus.PENDING);
    } finally {
      (env.vnpay as { mockEnabled: boolean }).mockEnabled = original;
    }
  });

  it('chi nhánh chưa khai tài khoản thì từ chối, và KHÔNG để lại giao dịch rác', async () => {
    const cafe = await createTestCafe(); // không có cafe_payment_settings
    const packageId = await seedPackage(cafe.id);
    const customer = await createTestUser({ role: UserRole.CUSTOMER });

    const res = await purchase(cafe.id, packageId, generateToken(customer), 'bank_transfer');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('PAYMENT_METHOD_UNAVAILABLE');

    // Dựng QR trước khi ghi giao dịch, nên không có dòng nào nằm lại chờ một
    // khoản tiền vĩnh viễn không tới.
    const [row] = await AppDataSource.query<{ count: string }[]>(
      `SELECT COUNT(*)::text AS count FROM payment_transactions t
         JOIN customer_packages cp ON cp.id = t.customer_package_id
        WHERE cp.cafe_id = $1`,
      [cafe.id],
    );
    expect(Number(row.count)).toBe(0);
  });

  it('mỗi lần mở phiên cấp một mã tham chiếu khác nhau', async () => {
    const cafe = await seedCafeWithBank();
    const customer = await createTestUser({ role: UserRole.CUSTOMER });
    const codes = new Set<string>();

    // Mỗi gói chỉ mua được một lần nên phải dùng gói khác nhau.
    for (let i = 0; i < 3; i++) {
      const packageId = await seedPackage(cafe.id, 100000 + i);
      const res = await purchase(cafe.id, packageId, generateToken(customer), 'bank_transfer');
      codes.add(res.body.data.bank_transfer.ref_code);
    }
    expect(codes.size).toBe(3);
  });

  it('không khai cổng thì vẫn đi VNPay như cũ', async () => {
    // Những chỗ gọi cũ chưa biết tới trường `gateway`; đổi mặc định là làm hỏng
    // luồng mua gói đang chạy.
    const cafe = await seedCafeWithBank();
    const packageId = await seedPackage(cafe.id);
    const customer = await createTestUser({ role: UserRole.CUSTOMER });

    const res = await purchase(cafe.id, packageId, generateToken(customer));
    expect(res.status).toBe(200);
    expect(res.body.data.flow).toBe('redirect');
    expect(res.body.data.payment_url).toBeTruthy();
    expect((await readTx(res.body.data.customer_package_id)).gateway).toBe('VNPAY');
  });

  it('không đăng nhập thì không mở được phiên thanh toán', async () => {
    const cafe = await seedCafeWithBank();
    const packageId = await seedPackage(cafe.id);
    await request(app)
      .post(`/api/v1/cafes/${cafe.id}/packages/${packageId}/purchase`)
      .send({ gateway: 'bank_transfer' })
      .expect(401);
  });
});
