import request from 'supertest';
import { app } from '../../app';
import { AppDataSource } from '../../config/database';
import {
  BankTransactionGateway,
  BankTransactionMatchReason,
  BankTransactionMatchStatus,
  ProviderStatus,
  SubscriptionStatus,
  UserRole,
} from '../../types';
import { createTestCafe, createTestUser, generateToken } from '../helpers';
import { seedBankPaymentScenario } from '../helpers/bank-payment.fixture';

/**
 * Phân quyền cấu hình nhận tiền và sổ đối soát.
 *
 * Ranh giới quan trọng nhất: **nhân viên không được chạm vào số tài khoản ngân
 * hàng của chủ quán**, và không được thấy bất kỳ con số tổng nào. Bộ test này
 * tồn tại chủ yếu để bắt lỗi dùng nhầm `getManagedCafeOrThrow` — hàm đó cho
 * STAFF đi qua và trông rất giống hàm đúng.
 */
async function activateProvider(providerId: string): Promise<void> {
  await AppDataSource.query(
    `INSERT INTO provider_profiles (user_id, business_name, registration_status)
     VALUES ($1, $2, $3)`,
    [providerId, 'Bank Provider', ProviderStatus.ACTIVE],
  );

  const [plan] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM subscription_plans WHERE is_trial = true LIMIT 1`,
  );

  await AppDataSource.query(
    `INSERT INTO provider_subscriptions
       (provider_id, plan_id, status, started_at, expires_at, ai_quota_reset_at)
     VALUES ($1, $2, $3, NOW(), NOW() + INTERVAL '14 days', NOW() + INTERVAL '30 days')`,
    [providerId, plan.id, SubscriptionStatus.TRIAL],
  );
}

const VALID_BODY = {
  method: 'BANK_TRANSFER',
  bank_code: 'VCB',
  account_number: '0123453210',
  account_name: 'BUI TRONG TRI',
};

describe('cấu hình nhận tiền của chi nhánh', () => {
  let providerId: string;
  let providerToken: string;
  let cafeId: string;

  beforeEach(async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    providerId = provider.id;
    providerToken = generateToken(provider);
    await activateProvider(providerId);
    const cafe = await createTestCafe({ provider_id: providerId });
    cafeId = cafe.id;
  });

  it('chưa cấu hình thì trả null với 200, không phải 404', async () => {
    const res = await request(app)
      .get(`/api/v1/cafes/${cafeId}/payment-settings`)
      .set('Authorization', `Bearer ${providerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeNull();
  });

  it('lưu xong vẫn ở trạng thái chưa xác minh, chi nhánh vẫn dùng VNPay', async () => {
    const put = await request(app)
      .put(`/api/v1/cafes/${cafeId}/payment-settings`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send(VALID_BODY);

    expect(put.status).toBe(200);
    expect(put.body.data.is_verified).toBe(false);

    const methods = await request(app).get(`/api/v1/cafes/${cafeId}/payment-methods`);
    expect(methods.body.data.methods).toEqual(['vnpay']);
  });

  it('xác minh xong mới bật được chuyển khoản', async () => {
    await request(app)
      .put(`/api/v1/cafes/${cafeId}/payment-settings`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send(VALID_BODY);

    const verify = await request(app)
      .post(`/api/v1/cafes/${cafeId}/payment-settings/verify`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send({});

    expect(verify.status).toBe(200);
    expect(verify.body.data.is_verified).toBe(true);

    const methods = await request(app).get(`/api/v1/cafes/${cafeId}/payment-methods`);
    expect(methods.body.data.methods).toEqual(['vnpay', 'bank_transfer']);
  });

  it('đổi số tài khoản làm mất xác minh, phải quét thử lại', async () => {
    await request(app)
      .put(`/api/v1/cafes/${cafeId}/payment-settings`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send(VALID_BODY);
    await request(app)
      .post(`/api/v1/cafes/${cafeId}/payment-settings/verify`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send({});

    const changed = await request(app)
      .put(`/api/v1/cafes/${cafeId}/payment-settings`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send({ ...VALID_BODY, account_number: '0123453211' });

    expect(changed.body.data.is_verified).toBe(false);

    const methods = await request(app).get(`/api/v1/cafes/${cafeId}/payment-methods`);
    expect(methods.body.data.methods).toEqual(['vnpay']);
  });

  it('che số tài khoản ở màn hiển thị, chỉ hiện đủ ở màn chỉnh sửa', async () => {
    await request(app)
      .put(`/api/v1/cafes/${cafeId}/payment-settings`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send(VALID_BODY);

    const masked = await request(app)
      .get(`/api/v1/cafes/${cafeId}/payment-settings`)
      .set('Authorization', `Bearer ${providerToken}`);
    expect(masked.body.data.account_number).not.toBe('0123453210');
    expect(masked.body.data.account_number).toMatch(/3210$/);

    const full = await request(app)
      .get(`/api/v1/cafes/${cafeId}/payment-settings/edit`)
      .set('Authorization', `Bearer ${providerToken}`);
    expect(full.body.data.account_number).toBe('0123453210');
  });

  it('mã ngân hàng không hỗ trợ thì từ chối', async () => {
    const res = await request(app)
      .put(`/api/v1/cafes/${cafeId}/payment-settings`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send({ ...VALID_BODY, bank_code: 'KHONG_TON_TAI' });

    expect(res.status).toBe(422);
    expect(res.body.code ?? res.body.error?.code).toBe('UNKNOWN_BANK_CODE');
  });

  it('chọn chuyển khoản mà thiếu thông tin ngân hàng thì từ chối', async () => {
    const res = await request(app)
      .put(`/api/v1/cafes/${cafeId}/payment-settings`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send({ method: 'BANK_TRANSFER' });

    expect(res.status).toBe(400);
  });

  it('mã QR mẫu là mã ngân hàng thật, không phải đường dẫn mô phỏng', async () => {
    await request(app)
      .put(`/api/v1/cafes/${cafeId}/payment-settings`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send(VALID_BODY);

    const res = await request(app)
      .get(`/api/v1/cafes/${cafeId}/payment-settings/sample-qr`)
      .set('Authorization', `Bearer ${providerToken}`);

    expect(res.status).toBe(200);
    // Chuỗi EMVCo, không phải URL — kể cả khi ngân hàng mô phỏng đang bật.
    expect(res.body.data.qr_payload.startsWith('000201')).toBe(true);
    expect(res.body.data.qr_payload).not.toContain('http');
    expect(res.body.data.qr_payload).toContain('0123453210');
    expect(res.body.data.amount).toBe(10000);
  });

  // ── Phân quyền ─────────────────────────────────────────────────────────────

  it('NHÂN VIÊN của chính chi nhánh vẫn bị chặn ở mọi endpoint cấu hình', async () => {
    const staff = await createTestUser({ role: UserRole.STAFF });
    await AppDataSource.query(
      `INSERT INTO staff_cafe_assignments (staff_id, cafe_id, assigned_by)
       VALUES ($1, $2, $3)`,
      [staff.id, cafeId, providerId],
    );
    const staffToken = generateToken(staff);

    const paths = [
      ['get', `/api/v1/cafes/${cafeId}/payment-settings`],
      ['get', `/api/v1/cafes/${cafeId}/payment-settings/edit`],
      ['get', `/api/v1/cafes/${cafeId}/payment-settings/sample-qr`],
      ['put', `/api/v1/cafes/${cafeId}/payment-settings`],
      ['post', `/api/v1/cafes/${cafeId}/payment-settings/verify`],
    ] as const;

    for (const [method, path] of paths) {
      const res = await request(app)
        [method](path)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({});
      expect(res.status).toBe(403);
    }
  });

  it('chủ doanh nghiệp khác không xem được cấu hình của chi nhánh này', async () => {
    const other = await createTestUser({ role: UserRole.PROVIDER });
    await activateProvider(other.id);

    const res = await request(app)
      .get(`/api/v1/cafes/${cafeId}/payment-settings`)
      .set('Authorization', `Bearer ${generateToken(other)}`);

    expect(res.status).toBe(403);
  });

  it('quản trị viên nền tảng cũng không xem được — tài chính là riêng tư', async () => {
    const admin = await createTestUser({ role: UserRole.ADMIN });
    const res = await request(app)
      .get(`/api/v1/cafes/${cafeId}/payment-settings`)
      .set('Authorization', `Bearer ${generateToken(admin)}`);

    expect(res.status).toBe(403);
  });
});

describe('sổ đối soát: chủ quán và nhân viên thấy khác nhau', () => {
  let fx: Awaited<ReturnType<typeof seedBankPaymentScenario>>;
  let providerToken: string;
  let staffToken: string;

  beforeEach(async () => {
    fx = await seedBankPaymentScenario();
    await activateProvider(fx.providerId);

    const [provider] = await AppDataSource.query(`SELECT * FROM users WHERE id = $1`, [
      fx.providerId,
    ]);
    providerToken = generateToken(provider);

    const staff = await createTestUser({ role: UserRole.STAFF });
    await AppDataSource.query(
      `INSERT INTO staff_cafe_assignments (staff_id, cafe_id, assigned_by)
       VALUES ($1, $2, $3)`,
      [staff.id, fx.cafeId, fx.providerId],
    );
    staffToken = generateToken(staff);

    // Một giao dịch treo và một giao dịch vào tài khoản lạ.
    await AppDataSource.query(
      `INSERT INTO bank_transactions
         (gateway, external_id, cafe_id, account_number, amount, content,
          transaction_date, match_status, match_reason, raw_payload)
       VALUES
         ($1, 'ext-review', $2, $3, 350000, 'khong co ma', NOW(), $4, $5, '{}'::jsonb),
         ($1, 'ext-unknown', $2, '9999999999', 120000, 'la', NOW(), $4, $6, '{}'::jsonb)`,
      [
        BankTransactionGateway.SANDBOX,
        fx.cafeId,
        fx.accountNumber,
        BankTransactionMatchStatus.NEEDS_REVIEW,
        BankTransactionMatchReason.NO_REF_CODE,
        BankTransactionMatchReason.UNKNOWN_ACCOUNT,
      ],
    );
  });

  it('chủ quán thấy sổ đầy đủ kèm con số tổng', async () => {
    const res = await request(app)
      .get(`/api/v1/cafes/${fx.cafeId}/bank-transactions`)
      .set('Authorization', `Bearer ${providerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.summary).toBeDefined();
    expect(res.body.data.items.length).toBeGreaterThanOrEqual(2);
  });

  it('nhân viên KHÔNG xem được sổ đầy đủ', async () => {
    const res = await request(app)
      .get(`/api/v1/cafes/${fx.cafeId}/bank-transactions`)
      .set('Authorization', `Bearer ${staffToken}`);

    expect(res.status).toBe(403);
  });

  it('nhân viên thấy hàng đợi treo nhưng KHÔNG có con số tổng nào', async () => {
    const res = await request(app)
      .get(`/api/v1/cafes/${fx.cafeId}/bank-transactions/pending`)
      .set('Authorization', `Bearer ${staffToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);

    // Rà TOÀN BỘ phản hồi: không được có bất kỳ khoá tổng hợp nào.
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('summary');
    expect(serialized).not.toContain('matched_total');
    expect(serialized).not.toContain('needs_review_count');
  });

  it('nhân viên không thấy giao dịch vào tài khoản lạ', async () => {
    const res = await request(app)
      .get(`/api/v1/cafes/${fx.cafeId}/bank-transactions/pending`)
      .set('Authorization', `Bearer ${staffToken}`);

    const reasons = res.body.data.map((r: { match_reason: string }) => r.match_reason);
    expect(reasons).not.toContain(BankTransactionMatchReason.UNKNOWN_ACCOUNT);
    expect(reasons).toContain(BankTransactionMatchReason.NO_REF_CODE);
  });

  it('nhân viên không đánh dấu "không liên quan" được', async () => {
    const [row] = await AppDataSource.query(
      `SELECT id FROM bank_transactions WHERE external_id = 'ext-review'`,
    );

    const res = await request(app)
      .post(`/api/v1/bank-transactions/${row.id}/ignore`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ note: 'thử bỏ qua' });

    expect(res.status).toBe(403);
  });

  it('nhân viên chi nhánh khác bị chặn khỏi hàng đợi', async () => {
    const outsider = await createTestUser({ role: UserRole.STAFF });
    const res = await request(app)
      .get(`/api/v1/cafes/${fx.cafeId}/bank-transactions/pending`)
      .set('Authorization', `Bearer ${generateToken(outsider)}`);

    expect(res.status).toBe(403);
  });

  it('nhân viên gán được giao dịch treo vào đơn hàng', async () => {
    const [row] = await AppDataSource.query(
      `SELECT id FROM bank_transactions WHERE external_id = 'ext-review'`,
    );

    const res = await request(app)
      .post(`/api/v1/bank-transactions/${row.id}/assign`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ booking_id: fx.bookingId, note: 'khách chuyển sai nội dung' });

    expect(res.status).toBe(200);
    expect(res.body.data.match_status).toBe(BankTransactionMatchStatus.MATCHED);
  });

  it('gán lần thứ hai vào cùng giao dịch bị từ chối', async () => {
    const [row] = await AppDataSource.query(
      `SELECT id FROM bank_transactions WHERE external_id = 'ext-review'`,
    );

    await request(app)
      .post(`/api/v1/bank-transactions/${row.id}/assign`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send({ booking_id: fx.bookingId });

    const second = await request(app)
      .post(`/api/v1/bank-transactions/${row.id}/assign`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send({ booking_id: fx.bookingId });

    expect(second.status).toBe(409);
  });

  it('bỏ qua một khoản tiền bắt buộc phải ghi lý do', async () => {
    const [row] = await AppDataSource.query(
      `SELECT id FROM bank_transactions WHERE external_id = 'ext-review'`,
    );

    const res = await request(app)
      .post(`/api/v1/bank-transactions/${row.id}/ignore`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send({});

    expect(res.status).toBe(400);
  });
});
