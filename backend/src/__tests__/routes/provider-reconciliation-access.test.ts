import request from 'supertest';
import { app } from '../../app';
import { AppDataSource } from '../../config/database';
import { ProviderStatus, SubscriptionStatus, UserRole } from '../../types';
import { createTestCafe, createTestUser, generateToken } from '../helpers';

/**
 * Ai được xem sổ đối soát.
 *
 * Đây là màn hình phơi ra toàn bộ dòng tiền của một doanh nghiệp: từng khoản
 * thu, số tài khoản ngân hàng, và nút xuất cả kỳ ra tệp. Nên ranh giới truy cập
 * phải được canh bằng test, không thể dựa vào việc nhớ gắn đủ middleware —
 * quên một cái thì endpoint vẫn chạy bình thường, chỉ là mở cho nhầm người.
 *
 * Ba lớp, mỗi lớp chặn một thứ khác nhau và không lớp nào thay được lớp kia:
 *
 *  1. `authenticate`        — không token thì không vào.
 *  2. `authorize(PROVIDER)` — đúng vai. Khách và nhân viên bị chặn ở đây.
 *  3. `requireActiveProvider` — hồ sơ đối tác đang ACTIVE. Thiếu lớp này thì
 *     tài khoản ĐÃ BỊ TẠM KHOÁ vẫn kéo được cả sổ tiền, vì hai lớp trên chỉ xét
 *     vai trò chứ không xét trạng thái hồ sơ.
 *
 * Lớp thứ tư nằm ở tầng truy vấn chứ không phải middleware: mệnh đề
 * `cafes.provider_id` lấy từ token. Nó được canh riêng ở
 * `services/bank-reconciliation.test.ts`.
 */

const DUONG_DAN = '/api/v1/provider/reconciliation';

async function taoChuSan(status: ProviderStatus) {
  const provider = await createTestUser({ role: UserRole.PROVIDER });
  await AppDataSource.query(
    `INSERT INTO provider_profiles (user_id, business_name, registration_status)
     VALUES ($1, $2, $3)`,
    [provider.id, 'Chủ sân đối soát', status],
  );
  const [plan] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM subscription_plans WHERE is_trial = true LIMIT 1`,
  );
  await AppDataSource.query(
    `INSERT INTO provider_subscriptions
       (provider_id, plan_id, status, started_at, expires_at, ai_quota_reset_at)
     VALUES ($1, $2, $3, NOW(), NOW() + INTERVAL '14 days', NOW() + INTERVAL '30 days')`,
    [provider.id, plan.id, SubscriptionStatus.TRIAL],
  );
  await createTestCafe({ provider_id: provider.id });
  return { provider, token: generateToken(provider) };
}

describe('quyền vào sổ đối soát', () => {
  it('không có token thì không vào được', async () => {
    await request(app).get(DUONG_DAN).expect(401);
    await request(app).get(`${DUONG_DAN}/export`).expect(401);
  });

  it('khách hàng không vào được', async () => {
    // Sổ này chứa doanh thu của quán. Khách không có việc gì ở đây.
    const customer = await createTestUser({ role: UserRole.CUSTOMER });
    const token = generateToken(customer);

    await request(app).get(DUONG_DAN).set('Authorization', `Bearer ${token}`).expect(403);
    await request(app)
      .get(`${DUONG_DAN}/export`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('nhân viên không vào được', async () => {
    // Nhân viên đã có hàng đợi riêng ở /bank-transactions/pending — chỉ những
    // khoản đang treo của chi nhánh mình, không kèm con số tổng nào. Họ cần xử
    // lý được khách đang đứng ở quầy, không cần biết cả kỳ quán thu bao nhiêu.
    const staff = await createTestUser({ role: UserRole.STAFF });
    const token = generateToken(staff);

    await request(app).get(DUONG_DAN).set('Authorization', `Bearer ${token}`).expect(403);
    await request(app)
      .get(`${DUONG_DAN}/export`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('quản trị viên không vào bằng cửa này', async () => {
    // ADMIN có sổ riêng ở /admin/payment-ledger. Mở luôn cửa của chủ sân cho
    // admin nghe thì tiện, nhưng endpoint này lọc dữ liệu theo `provider_id`
    // lấy từ token — admin đi vào sẽ nhận về một sổ RỖNG, trông y như quán
    // chưa thu được đồng nào. Chặn thẳng vẫn đúng hơn là trả về số liệu sai.
    const admin = await createTestUser({ role: UserRole.ADMIN });
    const token = generateToken(admin);

    await request(app).get(DUONG_DAN).set('Authorization', `Bearer ${token}`).expect(403);
  });

  it('chủ sân đang hoạt động thì vào được', async () => {
    const { token } = await taoChuSan(ProviderStatus.ACTIVE);

    const res = await request(app)
      .get(DUONG_DAN)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('summary');
  });

  it('chủ sân bị tạm khoá thì KHÔNG kéo được sổ tiền', async () => {
    // Ca quan trọng nhất của tệp này. `authenticate` + `authorize` đều cho qua
    // vì token vẫn hợp lệ và vai vẫn là PROVIDER — chỉ `requireActiveProvider`
    // mới chặn. Quên gắn nó thì tài khoản bị khoá vẫn xuất được cả kỳ ra CSV.
    const { token } = await taoChuSan(ProviderStatus.SUSPENDED);

    const res = await request(app)
      .get(DUONG_DAN)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
    expect(res.body.code ?? res.body.error?.code).toBe('ACCOUNT_SUSPENDED');

    await request(app)
      .get(`${DUONG_DAN}/export`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('hồ sơ bị từ chối thì không vào được', async () => {
    const { token } = await taoChuSan(ProviderStatus.REJECTED);
    await request(app).get(DUONG_DAN).set('Authorization', `Bearer ${token}`).expect(403);
  });

  it('chưa lập hồ sơ đối tác thì không vào được', async () => {
    // Tài khoản mang vai PROVIDER nhưng chưa có `provider_profiles` — tạo bằng
    // seed hoặc còn dở dang giữa chừng luồng đăng ký.
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    const token = generateToken(provider);

    await request(app).get(DUONG_DAN).set('Authorization', `Bearer ${token}`).expect(403);
  });
});
