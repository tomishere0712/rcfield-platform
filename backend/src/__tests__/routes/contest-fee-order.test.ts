import request from 'supertest';
import { app } from '../../app';
import { AppDataSource } from '../../config/database';
import { ContestStatus, ProviderStatus, SubscriptionStatus, UserRole } from '../../types';
import { createTestCafe, createTestUser, generateToken } from '../helpers';

/**
 * Phí tổ chức giải — dòng tiền thứ hai của nền tảng, sau phí thuê bao.
 *
 * Mở đăng ký là cửa thu phí: `changeContestStatus` gọi `assertContestFeePaid`
 * trước khi cho DRAFT sang OPEN. Nếu chỗ này thủng thì giải chạy mà nền tảng
 * không thu được đồng nào, và không ai phát hiện cho tới lúc đối soát.
 */

async function activateProvider(providerId: string): Promise<void> {
  await AppDataSource.query(
    `INSERT INTO provider_profiles (user_id, business_name, registration_status)
     VALUES ($1, $2, $3)`,
    [providerId, 'Provider Phí Giải', ProviderStatus.ACTIVE],
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

/** Giải ở trạng thái DRAFT — chỉ lúc này mới đặt được gói tổ chức. */
async function createDraftContest(providerId: string, cafeId: string): Promise<string> {
  const [trackType] = await AppDataSource.query<{ id: string; code: string }[]>(
    `SELECT id, code FROM track_types ORDER BY created_at ASC LIMIT 1`,
  );
  const [contestType] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM contest_types WHERE code = 'PROVIDER_STANDARD' LIMIT 1`,
  );
  const [format] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM contest_formats WHERE code = 'KNOCKOUT' LIMIT 1`,
  );
  const [template] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM contest_templates WHERE contest_format_id = $1 LIMIT 1`,
    [format.id],
  );

  const [contest] = await AppDataSource.query<{ id: string }[]>(
    `INSERT INTO contests
       (cafe_id, provider_id, name, track_type, track_type_id, contest_type_id,
        contest_format_id, contest_template_id, registration_opens_at, registration_closes_at,
        vehicle_rule, config, starts_at, ends_at, capacity, entry_fee, status, created_by)
     VALUES
       ($1, $2, 'Giải kiểm phí tổ chức', $3, $4, $5,
        $6, $7, NOW() - INTERVAL '1 day', NOW() + INTERVAL '5 day',
        $8, $9, NOW() + INTERVAL '7 day', NOW() + INTERVAL '8 day', 16, 0, $10, $2)
     RETURNING id`,
    [
      cafeId,
      providerId,
      trackType.code,
      trackType.id,
      contestType.id,
      format.id,
      template.id,
      JSON.stringify({ vehicle_policy: 'BYOC_ONLY', assignment_policy: 'AT_CHECK_IN' }),
      JSON.stringify({}),
      ContestStatus.DRAFT,
    ],
  );
  await AppDataSource.query(`INSERT INTO contest_cafes (contest_id, cafe_id) VALUES ($1, $2)`, [
    contest.id,
    cafeId,
  ]);
  return contest.id;
}

async function seed() {
  const provider = await createTestUser({ role: UserRole.PROVIDER });
  await activateProvider(provider.id);
  const cafe = await createTestCafe({ provider_id: provider.id });
  const contestId = await createDraftContest(provider.id, cafe.id);
  const [plan] = await AppDataSource.query<{ id: string; price: string }[]>(
    `SELECT id, price FROM contest_fee_plans ORDER BY price ASC LIMIT 1`,
  );
  return {
    provider,
    providerToken: generateToken(provider),
    adminToken: generateToken(await createTestUser({ role: UserRole.ADMIN })),
    cafe,
    contestId,
    plan,
  };
}

const orderOf = async (contestId: string) => {
  const [row] = await AppDataSource.query<{ id: string; status: string; amount: string }[]>(
    `SELECT id, status, amount FROM contest_fee_orders
      WHERE contest_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [contestId],
  );
  return row;
};

const statusOf = async (contestId: string) => {
  const [row] = await AppDataSource.query<{ status: string }[]>(
    `SELECT status FROM contests WHERE id = $1`,
    [contestId],
  );
  return row.status;
};

describe('GET /api/v1/contests/:contestId/fee', () => {
  it('trả về danh sách gói tổ chức để chủ giải chọn', async () => {
    const { contestId, providerToken } = await seed();

    const res = await request(app)
      .get(`/api/v1/contests/${contestId}/fee`)
      .set('Authorization', `Bearer ${providerToken}`)
      .expect(200);

    expect(Array.isArray(res.body.data.plans)).toBe(true);
    expect(res.body.data.plans.length).toBeGreaterThan(0);
    expect(res.body.data.order).toBeNull();
  });
});

describe('POST /api/v1/contests/:contestId/fee/order', () => {
  it('đặt gói thì sinh đơn phí ở trạng thái chờ thanh toán', async () => {
    const { contestId, providerToken, plan } = await seed();

    await request(app)
      .post(`/api/v1/contests/${contestId}/fee/order`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send({ plan_id: plan.id })
      .expect(201);

    const order = await orderOf(contestId);
    expect(order.status).toBe('PENDING_PAYMENT');
    expect(Number(order.amount)).toBe(Number(plan.price));
  });

  it('đặt gói lần thứ hai bị chặn — mỗi giải chỉ một đơn phí đang sống', async () => {
    const { contestId, providerToken, plan } = await seed();
    const url = `/api/v1/contests/${contestId}/fee/order`;

    await request(app)
      .post(url)
      .set('Authorization', `Bearer ${providerToken}`)
      .send({ plan_id: plan.id })
      .expect(201);

    const res = await request(app)
      .post(url)
      .set('Authorization', `Bearer ${providerToken}`)
      .send({ plan_id: plan.id });

    expect(res.status).toBeGreaterThanOrEqual(400);
    const rows = await AppDataSource.query(
      `SELECT id FROM contest_fee_orders WHERE contest_id = $1`,
      [contestId],
    );
    expect(rows).toHaveLength(1);
  });

  it('gói không tồn tại thì từ chối, không tạo đơn rỗng', async () => {
    const { contestId, providerToken } = await seed();

    const res = await request(app)
      .post(`/api/v1/contests/${contestId}/fee/order`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send({ plan_id: '00000000-0000-0000-0000-000000000000' });

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await orderOf(contestId)).toBeUndefined();
  });

  it('người khác không đặt gói cho giải của mình được', async () => {
    const { contestId, plan } = await seed();
    const outsider = await createTestUser({ role: UserRole.PROVIDER });

    await request(app)
      .post(`/api/v1/contests/${contestId}/fee/order`)
      .set('Authorization', `Bearer ${generateToken(outsider)}`)
      .send({ plan_id: plan.id })
      .expect(403);

    expect(await orderOf(contestId)).toBeUndefined();
  });
});

describe('Chuỗi thu phí: khai chuyển khoản → admin duyệt → mở đăng ký', () => {
  it('chưa trả phí thì KHÔNG mở được đăng ký', async () => {
    const { contestId, providerToken, plan } = await seed();

    await request(app)
      .post(`/api/v1/contests/${contestId}/fee/order`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send({ plan_id: plan.id })
      .expect(201);

    const res = await request(app)
      .post(`/api/v1/contests/${contestId}/open`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send({});

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await statusOf(contestId)).toBe(ContestStatus.DRAFT);
  });

  it('admin xác nhận đã nhận tiền thì mới mở được đăng ký', async () => {
    const { contestId, providerToken, adminToken, plan } = await seed();

    await request(app)
      .post(`/api/v1/contests/${contestId}/fee/order`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send({ plan_id: plan.id })
      .expect(201);

    await request(app)
      .post(`/api/v1/contests/${contestId}/fee/transfer`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send({
        transfer_reference: 'CKGIAI' + Date.now(),
        transfer_date: new Date().toISOString().slice(0, 10),
        transfer_amount: Number(plan.price),
      })
      .expect(200);

    const order = await orderOf(contestId);
    await request(app)
      .post(`/api/v1/admin/contest-fee-orders/${order.id}/confirm`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ notes: 'Đã đối chiếu sao kê' })
      .expect(200);

    expect((await orderOf(contestId)).status).toBe('PAID');

    await request(app)
      .post(`/api/v1/contests/${contestId}/open`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send({})
      .expect(200);

    expect(await statusOf(contestId)).toBe(ContestStatus.OPEN);
  });

  it('admin từ chối thì giải vẫn nằm ở nháp, không mở được', async () => {
    const { contestId, providerToken, adminToken, plan } = await seed();

    await request(app)
      .post(`/api/v1/contests/${contestId}/fee/order`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send({ plan_id: plan.id })
      .expect(201);

    // Admin chỉ từ chối được đơn provider ĐÃ khai là chuyển rồi. Từ chối một đơn
    // chưa ai nói đã trả thì vô nghĩa — nên phải qua bước khai báo trước.
    await request(app)
      .post(`/api/v1/contests/${contestId}/fee/transfer`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send({
        transfer_reference: 'CKSAI' + Date.now(),
        transfer_date: new Date().toISOString().slice(0, 10),
        transfer_amount: Number(plan.price),
      })
      .expect(200);

    const order = await orderOf(contestId);
    await request(app)
      .post(`/api/v1/admin/contest-fee-orders/${order.id}/reject`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Không tìm thấy khoản chuyển khoản này' })
      .expect(200);

    const res = await request(app)
      .post(`/api/v1/contests/${contestId}/open`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send({});

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await statusOf(contestId)).toBe(ContestStatus.DRAFT);
  });

  it('provider không tự duyệt đơn phí của chính mình', async () => {
    const { contestId, providerToken, plan } = await seed();

    await request(app)
      .post(`/api/v1/contests/${contestId}/fee/order`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send({ plan_id: plan.id })
      .expect(201);

    const order = await orderOf(contestId);
    await request(app)
      .post(`/api/v1/admin/contest-fee-orders/${order.id}/confirm`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send({})
      .expect(403);

    expect((await orderOf(contestId)).status).toBe('PENDING_PAYMENT');
  });
});

describe('GET /api/v1/admin/contest-fee-orders', () => {
  it('admin xem được đơn phí đang chờ duyệt', async () => {
    const { contestId, providerToken, adminToken, plan } = await seed();

    await request(app)
      .post(`/api/v1/contests/${contestId}/fee/order`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send({ plan_id: plan.id })
      .expect(201);

    const res = await request(app)
      .get('/api/v1/admin/contest-fee-orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const rows = res.body.data?.data ?? res.body.data;
    expect(rows.some((r: { contest_id?: string }) => r.contest_id === contestId)).toBe(true);
  });

  it('provider không xem được đơn phí của toàn nền tảng', async () => {
    const { providerToken } = await seed();

    await request(app)
      .get('/api/v1/admin/contest-fee-orders')
      .set('Authorization', `Bearer ${providerToken}`)
      .expect(403);
  });
});

describe('DELETE /api/v1/contests/:contestId/fee/order', () => {
  it('huỷ đơn chưa thanh toán để chọn lại gói khác', async () => {
    const { contestId, providerToken, plan } = await seed();

    await request(app)
      .post(`/api/v1/contests/${contestId}/fee/order`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send({ plan_id: plan.id })
      .expect(201);

    await request(app)
      .delete(`/api/v1/contests/${contestId}/fee/order`)
      .set('Authorization', `Bearer ${providerToken}`)
      .expect(200);

    const order = await orderOf(contestId);
    expect(order === undefined || order.status !== 'PENDING_PAYMENT').toBe(true);
  });

  it('chưa đặt gói mà huỷ thì báo lỗi rõ ràng', async () => {
    const { contestId, providerToken } = await seed();

    const res = await request(app)
      .delete(`/api/v1/contests/${contestId}/fee/order`)
      .set('Authorization', `Bearer ${providerToken}`);

    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
