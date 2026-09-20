import request from 'supertest';
import { app } from '../../app';
import { AppDataSource } from '../../config/database';
import { ProviderStatus, SubscriptionStatus, UserRole } from '../../types';
import { createTestCafe, createTestUser, generateToken } from '../helpers';

/**
 * RBAC của báo cáo tài chính giải.
 *
 * Đây là ngoại lệ có chủ đích so với phần còn lại của module contest: STAFF và
 * ADMIN đều bị chặn. Test này tồn tại để lần refactor sau không vô tình thay
 * `assertContestFinanceOwner` bằng một guard rộng hơn.
 */

async function activateProvider(providerId: string): Promise<void> {
  await AppDataSource.query(
    `INSERT INTO provider_profiles (user_id, business_name, registration_status)
     VALUES ($1, $2, $3)`,
    [providerId, 'Finance Route Provider', ProviderStatus.ACTIVE],
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

async function createContest(providerId: string, cafeId: string): Promise<string> {
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
       ($1, $2, 'Giải test RBAC tài chính', $3, $4, $5,
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

describe('GET /api/v1/contests/:contestId/finance', () => {
  let ownerId: string;
  let ownerToken: string;
  let contestId: string;

  beforeEach(async () => {
    const owner = await createTestUser({ role: UserRole.PROVIDER });
    ownerId = owner.id;
    ownerToken = generateToken({ id: owner.id, email: owner.email, role: UserRole.PROVIDER });
    await activateProvider(ownerId);
    const cafe = await createTestCafe({ provider_id: ownerId });
    contestId = await createContest(ownerId, cafe.id);
  });

  it('provider sở hữu giải đọc được báo cáo', async () => {
    const res = await request(app)
      .get(`/api/v1/contests/${contestId}/finance`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.contest_id).toBe(contestId);
    expect(res.body.data.summary).toHaveProperty('net');
  });

  it('giải chưa có dữ liệu trả 200 với số 0, không phải 404', async () => {
    const res = await request(app)
      .get(`/api/v1/contests/${contestId}/finance`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.summary.total_income).toBe(0);
    expect(res.body.data.summary.total_expense).toBe(0);
    expect(res.body.data.summary.net).toBe(0);
  });

  it('provider khác bị chặn', async () => {
    const other = await createTestUser({ role: UserRole.PROVIDER });
    await activateProvider(other.id);
    const token = generateToken({ id: other.id, email: other.email, role: UserRole.PROVIDER });

    const res = await request(app)
      .get(`/api/v1/contests/${contestId}/finance`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it('STAFF bị chặn dù được phân công vào giải', async () => {
    const staff = await createTestUser({ role: UserRole.STAFF });
    await AppDataSource.query(
      `INSERT INTO contest_staff_assignments (contest_id, staff_id, assigned_by)
       VALUES ($1, $2, $3)`,
      [contestId, staff.id, ownerId],
    );
    const token = generateToken({ id: staff.id, email: staff.email, role: UserRole.STAFF });

    const res = await request(app)
      .get(`/api/v1/contests/${contestId}/finance`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it('ADMIN bị chặn — ngoại lệ có chủ đích so với các module khác', async () => {
    const admin = await createTestUser({ role: UserRole.ADMIN });
    const token = generateToken({ id: admin.id, email: admin.email, role: UserRole.ADMIN });

    const res = await request(app)
      .get(`/api/v1/contests/${contestId}/finance`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it('không có token thì 401', async () => {
    const res = await request(app).get(`/api/v1/contests/${contestId}/finance`);
    expect(res.status).toBe(401);
  });
});

describe('Sổ thu chi giải — ghi, sửa, xoá', () => {
  let ownerId: string;
  let ownerToken: string;
  let contestId: string;

  const validEntry = {
    direction: 'OUT',
    category: 'PRIZE_CASH',
    title: 'Tiền thưởng hạng nhất',
    amount: 1_500_000,
    occurred_at: new Date().toISOString(),
  };

  beforeEach(async () => {
    const owner = await createTestUser({ role: UserRole.PROVIDER });
    ownerId = owner.id;
    ownerToken = generateToken({ id: owner.id, email: owner.email, role: UserRole.PROVIDER });
    await activateProvider(ownerId);
    const cafe = await createTestCafe({ provider_id: ownerId });
    contestId = await createContest(ownerId, cafe.id);
  });

  async function createStaffAssignedToContest() {
    const staff = await createTestUser({ role: UserRole.STAFF });
    await AppDataSource.query(
      `INSERT INTO contest_staff_assignments (contest_id, staff_id, assigned_by)
       VALUES ($1, $2, $3)`,
      [contestId, staff.id, ownerId],
    );
    return {
      staff,
      token: generateToken({ id: staff.id, email: staff.email, role: UserRole.STAFF }),
    };
  }

  it('provider ghi được khoản chi và khoản đó vào báo cáo', async () => {
    const created = await request(app)
      .post(`/api/v1/contests/${contestId}/ledger-entries`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send(validEntry);

    expect(created.status).toBe(201);
    expect(created.body.data.amount).toBe(1_500_000);
    expect(typeof created.body.data.amount).toBe('number');

    const report = await request(app)
      .get(`/api/v1/contests/${contestId}/finance`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(report.body.data.expense.total).toBe(1_500_000);
  });

  it('provider ghi được ở mọi trạng thái giải, kể cả đã huỷ', async () => {
    await AppDataSource.query(`UPDATE contests SET status = 'CANCELLED' WHERE id = $1`, [
      contestId,
    ]);

    const res = await request(app)
      .post(`/api/v1/contests/${contestId}/ledger-entries`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send(validEntry);

    expect(res.status).toBe(201);
  });

  it('số tiền <= 0 bị chặn', async () => {
    for (const amount of [0, -100000]) {
      const res = await request(app)
        .post(`/api/v1/contests/${contestId}/ledger-entries`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ ...validEntry, amount });
      expect(res.status).toBe(400);
    }
  });

  it('loại khoản không khớp chiều tiền bị chặn', async () => {
    const res = await request(app)
      .post(`/api/v1/contests/${contestId}/ledger-entries`)
      .set('Authorization', `Bearer ${ownerToken}`)
      // PRIZE_CASH là loại chi, không dùng cho chiều thu.
      .send({ ...validEntry, direction: 'IN', category: 'PRIZE_CASH' });

    expect(res.status).toBe(400);
  });

  it('nhân viên ghi được khoản chi khi giải đang chạy', async () => {
    await AppDataSource.query(`UPDATE contests SET status = 'RUNNING' WHERE id = $1`, [contestId]);
    const { token } = await createStaffAssignedToContest();

    const res = await request(app)
      .post(`/api/v1/contests/${contestId}/ledger-entries`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validEntry, category: 'OTHER', note: 'Mua pin dự phòng' });

    expect(res.status).toBe(201);
    expect(res.body.data.created_by.role).toBe(UserRole.STAFF);
  });

  it('nhân viên thiếu lý do bị chặn', async () => {
    await AppDataSource.query(`UPDATE contests SET status = 'RUNNING' WHERE id = $1`, [contestId]);
    const { token } = await createStaffAssignedToContest();

    const res = await request(app)
      .post(`/api/v1/contests/${contestId}/ledger-entries`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validEntry, category: 'OTHER' });

    expect(res.status).toBe(400);
  });

  it('nhân viên không ghi được khoản thu', async () => {
    await AppDataSource.query(`UPDATE contests SET status = 'RUNNING' WHERE id = $1`, [contestId]);
    const { token } = await createStaffAssignedToContest();

    const res = await request(app)
      .post(`/api/v1/contests/${contestId}/ledger-entries`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        direction: 'IN',
        category: 'SPONSORSHIP',
        title: 'Tài trợ',
        amount: 500000,
        occurred_at: new Date().toISOString(),
        note: 'thử lách',
      });

    expect(res.status).toBe(403);
    expect(res.body.code ?? res.body.error?.code).toBe('CONTEST_LEDGER_STAFF_INCOME_FORBIDDEN');
  });

  it('nhân viên bị chặn khi giải chưa chạy hoặc đã kết thúc', async () => {
    const { token } = await createStaffAssignedToContest();

    for (const status of ['CLOSED', 'COMPLETED']) {
      await AppDataSource.query(`UPDATE contests SET status = $1 WHERE id = $2`, [
        status,
        contestId,
      ]);
      const res = await request(app)
        .post(`/api/v1/contests/${contestId}/ledger-entries`)
        .set('Authorization', `Bearer ${token}`)
        .send({ ...validEntry, category: 'OTHER', note: 'Vật tư chuẩn bị' });

      expect(res.status).toBe(409);
    }
  });

  it('danh sách của nhân viên chỉ có khoản của chính mình và không có số tổng', async () => {
    await AppDataSource.query(`UPDATE contests SET status = 'RUNNING' WHERE id = $1`, [contestId]);
    const { token } = await createStaffAssignedToContest();

    await request(app)
      .post(`/api/v1/contests/${contestId}/ledger-entries`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validEntry, category: 'OTHER', note: 'Của nhân viên' });
    await request(app)
      .post(`/api/v1/contests/${contestId}/ledger-entries`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ ...validEntry, title: 'Của chủ quán' });

    const res = await request(app)
      .get(`/api/v1/contests/${contestId}/ledger-entries/mine`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].note).toBe('Của nhân viên');
    expect(res.body).not.toHaveProperty('meta');
    expect(res.body).not.toHaveProperty('summary');
  });

  it('nhân viên không sửa hay xoá được, kể cả khoản của chính mình', async () => {
    await AppDataSource.query(`UPDATE contests SET status = 'RUNNING' WHERE id = $1`, [contestId]);
    const { token } = await createStaffAssignedToContest();

    const created = await request(app)
      .post(`/api/v1/contests/${contestId}/ledger-entries`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validEntry, category: 'OTHER', note: 'Khoản của tôi' });
    const entryId = created.body.data.id;

    const patched = await request(app)
      .patch(`/api/v1/contest-ledger-entries/${entryId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 1 });
    expect(patched.status).toBe(403);

    const deleted = await request(app)
      .delete(`/api/v1/contest-ledger-entries/${entryId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(deleted.status).toBe(403);
  });

  it('provider sửa được, và bút toán đã xoá thì trả 404', async () => {
    const created = await request(app)
      .post(`/api/v1/contests/${contestId}/ledger-entries`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send(validEntry);
    const entryId = created.body.data.id;

    const patched = await request(app)
      .patch(`/api/v1/contest-ledger-entries/${entryId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ amount: 1_200_000 });
    expect(patched.status).toBe(200);
    expect(patched.body.data.amount).toBe(1_200_000);

    const deleted = await request(app)
      .delete(`/api/v1/contest-ledger-entries/${entryId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(deleted.status).toBe(200);

    // Khoản đã xoá biến khỏi báo cáo...
    const report = await request(app)
      .get(`/api/v1/contests/${contestId}/finance`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(report.body.data.expense.total).toBe(0);

    // ...và sửa lại thì 404 chứ không âm thầm thành công.
    const patchedAgain = await request(app)
      .patch(`/api/v1/contest-ledger-entries/${entryId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ amount: 999 });
    expect(patchedAgain.status).toBe(404);
  });

  it('provider khác không đọc và không ghi được sổ của giải này', async () => {
    const other = await createTestUser({ role: UserRole.PROVIDER });
    await activateProvider(other.id);
    const token = generateToken({ id: other.id, email: other.email, role: UserRole.PROVIDER });

    const read = await request(app)
      .get(`/api/v1/contests/${contestId}/ledger-entries`)
      .set('Authorization', `Bearer ${token}`);
    expect(read.status).toBe(403);

    const write = await request(app)
      .post(`/api/v1/contests/${contestId}/ledger-entries`)
      .set('Authorization', `Bearer ${token}`)
      .send(validEntry);
    expect(write.status).toBe(403);
  });

  it('mọi thao tác đều để lại dấu trong nhật ký giải', async () => {
    const created = await request(app)
      .post(`/api/v1/contests/${contestId}/ledger-entries`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send(validEntry);
    const entryId = created.body.data.id;

    await request(app)
      .patch(`/api/v1/contest-ledger-entries/${entryId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ amount: 1_200_000 });
    await request(app)
      .delete(`/api/v1/contest-ledger-entries/${entryId}`)
      .set('Authorization', `Bearer ${ownerToken}`);

    const logs = await AppDataSource.query<
      { event_type: string; before_json: unknown; after_json: unknown }[]
    >(
      `SELECT event_type, before_json, after_json FROM contest_audit_logs
        WHERE contest_id = $1 AND event_type LIKE 'ledger.%'
        ORDER BY created_at ASC`,
      [contestId],
    );

    expect(logs.map((log) => log.event_type)).toEqual([
      'ledger.entry_created',
      'ledger.entry_updated',
      'ledger.entry_deleted',
    ]);
    // Bản sửa phải giữ đủ cả giá trị trước lẫn sau để tái dựng được lịch sử.
    expect(logs[1].before_json).toBeTruthy();
    expect(logs[1].after_json).toBeTruthy();
  });
});
