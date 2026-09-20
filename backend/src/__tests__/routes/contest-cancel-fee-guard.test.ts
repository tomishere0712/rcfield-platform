import request from 'supertest';
import { app } from '../../app';
import { AppDataSource } from '../../config/database';
import { ProviderStatus, SubscriptionStatus, UserRole } from '../../types';
import { createTestCafe, createTestUser, generateToken } from '../helpers';

/**
 * Không huỷ được giải khi lệ phí đã thu.
 *
 * Nền tảng không có luồng hoàn lệ phí. Trước đây huỷ giải vẫn chạy trót lọt:
 * mọi đăng ký bị huỷ, một cờ `refund_needed` ghi vào metadata, và cờ đó không
 * nơi nào đọc. Mười lăm người đã trả tiền là chừng ấy khoản nợ biến mất khỏi
 * mọi giao diện.
 *
 * Chốt chặn bám theo TIỀN chứ không theo trạng thái giải — test dưới đây khoá
 * cả hai chiều: chưa thu thì vẫn huỷ được, thu rồi thì chặn.
 */

async function activateProvider(providerId: string): Promise<void> {
  await AppDataSource.query(
    `INSERT INTO provider_profiles (user_id, business_name, registration_status)
     VALUES ($1, $2, $3)`,
    [providerId, 'Cancel Guard Provider', ProviderStatus.ACTIVE],
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

async function createOpenContest(providerId: string, cafeId: string): Promise<string> {
  const [trackType] = await AppDataSource.query<{ id: string; code: string }[]>(
    `SELECT id, code FROM track_types ORDER BY created_at ASC LIMIT 1`,
  );
  const [contestType] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM contest_types WHERE code = 'PROVIDER_STANDARD' LIMIT 1`,
  );
  const [contestFormat] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM contest_formats WHERE code = 'KNOCKOUT' LIMIT 1`,
  );
  const [contestTemplate] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM contest_templates WHERE contest_format_id = $1 LIMIT 1`,
    [contestFormat.id],
  );

  const [contest] = await AppDataSource.query<{ id: string }[]>(
    `INSERT INTO contests
       (cafe_id, provider_id, name, track_type, track_type_id, contest_type_id,
        contest_format_id, contest_template_id, registration_opens_at, registration_closes_at,
        vehicle_rule, config, starts_at, ends_at, capacity, entry_fee, status, created_by)
     VALUES
       ($1, $2, 'Giải test chốt chặn huỷ', $3, $4, $5,
        $6, $7, NOW() - INTERVAL '1 day', NOW() + INTERVAL '5 day',
        $8, $9, NOW() + INTERVAL '7 day', NOW() + INTERVAL '8 day', 16, 100000, 'OPEN', $2)
     RETURNING id`,
    [
      cafeId,
      providerId,
      trackType.code,
      trackType.id,
      contestType.id,
      contestFormat.id,
      contestTemplate.id,
      JSON.stringify({ vehicle_policy: 'BYOC_ONLY', assignment_policy: 'AT_CHECK_IN' }),
      JSON.stringify({ format: 'KNOCKOUT', runtime_format: 'KNOCKOUT' }),
    ],
  );
  return contest.id;
}

async function addRegistration(
  contestId: string,
  paymentStatus: 'MARKED_PAID' | 'PENDING' | 'WAIVED',
): Promise<void> {
  const racer = await createTestUser({ role: UserRole.CUSTOMER });
  await AppDataSource.query(
    `INSERT INTO contest_registrations
       (contest_id, user_id, status, vehicle_source, entry_fee_amount, payment_status)
     VALUES ($1, $2, 'CONFIRMED', 'BYOC', 100000, $3)`,
    [contestId, racer.id, paymentStatus],
  );
}

describe('POST /api/v1/contests/:contestId/cancel — chốt chặn lệ phí đã thu', () => {
  let ownerToken: string;
  let contestId: string;

  beforeEach(async () => {
    const owner = await createTestUser({ role: UserRole.PROVIDER });
    ownerToken = generateToken({ id: owner.id, email: owner.email, role: UserRole.PROVIDER });
    await activateProvider(owner.id);
    const cafe = await createTestCafe({ provider_id: owner.id });
    contestId = await createOpenContest(owner.id, cafe.id);
  });

  it('chưa ai nộp lệ phí thì vẫn huỷ được', async () => {
    await addRegistration(contestId, 'PENDING');

    const res = await request(app)
      .post(`/api/v1/contests/${contestId}/cancel`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
  });

  it('đã có người nộp lệ phí thì bị chặn, kèm số người và số tiền', async () => {
    await addRegistration(contestId, 'MARKED_PAID');
    await addRegistration(contestId, 'MARKED_PAID');
    await addRegistration(contestId, 'PENDING');

    const res = await request(app)
      .post(`/api/v1/contests/${contestId}/cancel`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(409);
    expect(res.body.code ?? res.body.error?.code).toBe('CONTEST_HAS_COLLECTED_FEES');
    // Chỉ đếm người ĐÃ nộp, không đếm người còn nợ.
    expect(JSON.stringify(res.body)).toContain('2');
  });

  it('miễn lệ phí hết thì mở lại được đường huỷ', async () => {
    await addRegistration(contestId, 'MARKED_PAID');

    const blocked = await request(app)
      .post(`/api/v1/contests/${contestId}/cancel`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(blocked.status).toBe(409);

    // Chủ sân hoàn tiền mặt rồi chốt sổ từng đăng ký.
    await AppDataSource.query(
      `UPDATE contest_registrations SET payment_status = 'WAIVED' WHERE contest_id = $1`,
      [contestId],
    );

    const allowed = await request(app)
      .post(`/api/v1/contests/${contestId}/cancel`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(allowed.status).toBe(200);
  });

  it('đăng ký đã huỷ trước đó không tính vào chốt chặn', async () => {
    await addRegistration(contestId, 'MARKED_PAID');
    await AppDataSource.query(
      `UPDATE contest_registrations SET status = 'CANCELLED' WHERE contest_id = $1`,
      [contestId],
    );

    const res = await request(app)
      .post(`/api/v1/contests/${contestId}/cancel`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
  });
});
