import request from 'supertest';
import { app } from '../../app';
import { AppDataSource } from '../../config/database';
import {
  ContestFeeOrderStatus,
  ContestStatus,
  PaymentRequestStatus,
  PaymentTransactionStatus,
  PaymentTransactionType,
  ProviderStatus,
  UserRole,
} from '../../types';
import { createTestCafe, createTestUser, generateToken } from '../helpers';

/**
 * Sổ này chỉ theo dõi tiền PROVIDER TRẢ CHO NỀN TẢNG:
 *
 *   SAAS        — phí thuê phần mềm
 *   CONTEST_FEE — phí tổ chức giải
 *
 * Tiền khách trả cho quán đi qua hệ thống nhưng là tiền của chi nhánh (nền tảng
 * thu 0% trên đơn đặt lịch), nên KHÔNG được xuất hiện ở đây — seed một giao dịch
 * đặt lịch để chốt rằng nó bị loại thật.
 */
async function seedLedger() {
  const admin = await createTestUser({ role: UserRole.ADMIN });
  const provider = await createTestUser({ role: UserRole.PROVIDER });
  const customer = await createTestUser({ role: UserRole.CUSTOMER });

  await AppDataSource.query(
    `INSERT INTO provider_profiles (user_id, business_name, registration_status)
     VALUES ($1, $2, $3)`,
    [provider.id, 'Drift Town Sài Gòn', ProviderStatus.ACTIVE],
  );

  const cafe = await createTestCafe({ provider_id: provider.id });
  const [trackType] = await AppDataSource.query(`SELECT id FROM track_types LIMIT 1`);

  // 1. Khách trả tiền một đơn đặt lịch
  const [booking] = await AppDataSource.query(
    `INSERT INTO bookings
       (customer_id, cafe_id, slot_start, slot_end, play_mode, status, source,
        payment_expires_at, track_type_id)
     VALUES ($1, $2, NOW(), NOW() + INTERVAL '1 hour', 'RENTAL', 'CONFIRMED', 'APP',
             NOW() + INTERVAL '30 minutes', $3)
     RETURNING id`,
    [customer.id, cafe.id, trackType?.id ?? null],
  );
  await AppDataSource.query(
    `INSERT INTO payment_transactions
       (booking_id, gateway, type, amount, status, txn_ref, subject_type)
     VALUES ($1, 'VNPAY', $2, 450000, $3, 'TXN-TEST-1', 'BOOKING')`,
    [booking.id, PaymentTransactionType.PAYMENT, PaymentTransactionStatus.SUCCESS],
  );

  // 2. Provider trả tiền gói thuê bao
  const [plan] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM subscription_plans WHERE name <> 'TRIAL' ORDER BY price_per_month LIMIT 1`,
  );
  await AppDataSource.query(
    `INSERT INTO payment_requests
       (provider_id, plan_id, status, transfer_reference, transfer_date, transfer_amount)
     VALUES ($1, $2, $3, 'SAAS-REF-1', CURRENT_DATE, 1100000)`,
    [provider.id, plan.id, PaymentRequestStatus.CONFIRMED],
  );

  // 3. Provider trả phí tổ chức giải
  const [contest] = await AppDataSource.query(
    `INSERT INTO contests (cafe_id, name, starts_at, ends_at, status, created_by, provider_id, track_type)
     VALUES ($1, 'Giải mùa hè', NOW() + INTERVAL '7 days', NOW() + INTERVAL '8 days', $2, $3, $3, 'DRIFT')
     RETURNING id`,
    [cafe.id, ContestStatus.DRAFT, provider.id],
  );
  const [feePlan] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM contest_fee_plans ORDER BY price LIMIT 1`,
  );
  await AppDataSource.query(
    `INSERT INTO contest_fee_orders (contest_id, provider_id, plan_id, status, amount)
     VALUES ($1, $2, $3, $4, 200000)`,
    [contest.id, provider.id, feePlan.id, ContestFeeOrderStatus.PAID],
  );

  return { admin, provider, adminToken: generateToken(admin) };
}

describe('GET /api/v1/admin/payments — tiền provider trả cho nền tảng', () => {
  it('chỉ gồm phí thuê bao và phí tổ chức giải', async () => {
    const { adminToken } = await seedLedger();

    const res = await request(app)
      .get('/api/v1/admin/payments')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const sources = res.body.data.map((row: { source: string }) => row.source);
    expect(sources).toEqual(expect.arrayContaining(['SAAS', 'CONTEST_FEE']));
    // Giao dịch đặt lịch của khách không thuộc sổ này.
    expect(sources).not.toContain('BOOKING');

    const summary = res.body.summary;
    expect(Number(summary.saas_revenue)).toBe(1100000);
    expect(Number(summary.contest_fee_revenue)).toBe(200000);
    expect(Number(summary.platform_revenue)).toBe(1300000);
    expect(summary.booking_volume).toBeUndefined();
  });

  it('lọc theo nguồn tiền', async () => {
    const { adminToken } = await seedLedger();

    const res = await request(app)
      .get('/api/v1/admin/payments?source=SAAS')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    for (const row of res.body.data) {
      expect(row.source).toBe('SAAS');
    }
  });

  it('mỗi dòng nêu rõ đối tác và phương thức để đối soát được', async () => {
    const { adminToken } = await seedLedger();

    const res = await request(app)
      .get('/api/v1/admin/payments?source=CONTEST_FEE')
      .set('Authorization', `Bearer ${adminToken}`);

    const row = res.body.data[0];
    expect(row.party).toBe('Drift Town Sài Gòn');
    expect(row.subject).toBe('Giải mùa hè');
    expect(Number(row.amount)).toBe(200000);
    expect(row.status).toBe('PAID');
  });

  it('khoản chờ xử lý được cộng riêng, không tính vào doanh thu', async () => {
    const { adminToken, provider } = await seedLedger();
    const [plan] = await AppDataSource.query<{ id: string }[]>(
      `SELECT id FROM subscription_plans WHERE name <> 'TRIAL' ORDER BY price_per_month LIMIT 1`,
    );
    await AppDataSource.query(
      `INSERT INTO payment_requests
         (provider_id, plan_id, status, transfer_reference, transfer_date, transfer_amount)
       VALUES ($1, $2, $3, 'SAAS-REF-PENDING', CURRENT_DATE, 6800000)`,
      [provider.id, plan.id, PaymentRequestStatus.PENDING],
    );

    const res = await request(app)
      .get('/api/v1/admin/payments')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(Number(res.body.summary.pending_amount)).toBe(6800000);
    expect(Number(res.body.summary.platform_revenue)).toBe(1300000);
  });

  it('không phải admin thì không xem được', async () => {
    await seedLedger();
    const provider = await createTestUser({ role: UserRole.PROVIDER });

    const res = await request(app)
      .get('/api/v1/admin/payments')
      .set('Authorization', `Bearer ${generateToken(provider)}`);

    expect(res.status).toBe(403);
  });
});
