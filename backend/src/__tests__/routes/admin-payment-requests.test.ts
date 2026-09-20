import request from 'supertest';
import { app } from '../../app';
import { AppDataSource } from '../../config/database';
import { PaymentRequestStatus, ProviderStatus, SubscriptionStatus, UserRole } from '../../types';
import { createTestUser, generateToken } from '../helpers';

/**
 * Duyệt yêu cầu thanh toán gói thuê bao — cửa tiền vào của nền tảng.
 *
 * Đây là chỗ một cú bấm của admin biến khoản chuyển khoản thành 30 ngày dịch vụ.
 * Bấm nhầm hai lần thì provider được thêm 30 ngày chưa trả tiền; duyệt một yêu
 * cầu đã từ chối thì tiền không có mà dịch vụ vẫn chạy. Cả hai đều không lộ ra
 * cho tới lúc đối soát cuối tháng.
 */
async function seedProviderWithPendingRequest(amountOverride?: number) {
  const provider = await createTestUser({ role: UserRole.PROVIDER });
  await AppDataSource.query(
    `INSERT INTO provider_profiles (user_id, business_name, registration_status)
     VALUES ($1, $2, $3)`,
    [provider.id, 'RC Shop Thanh Toán', ProviderStatus.ACTIVE],
  );

  const [plan] = await AppDataSource.query<{ id: string; price_per_month: string }[]>(
    `SELECT id, price_per_month FROM subscription_plans
      WHERE name <> 'TRIAL' ORDER BY price_per_month LIMIT 1`,
  );

  const amount = amountOverride ?? Number(plan.price_per_month);
  const [row] = await AppDataSource.query<{ id: string }[]>(
    `INSERT INTO payment_requests
       (provider_id, plan_id, transfer_reference, transfer_date, transfer_amount, status)
     VALUES ($1, $2, $3, CURRENT_DATE, $4, $5)
     RETURNING id`,
    [provider.id, plan.id, 'CK' + Date.now(), amount, PaymentRequestStatus.PENDING],
  );

  return { provider, plan, requestId: row.id, amount };
}

async function adminToken() {
  return generateToken(await createTestUser({ role: UserRole.ADMIN }));
}

async function readRequest(id: string) {
  const [row] = await AppDataSource.query<{ status: string; reviewed_by: string | null }[]>(
    `SELECT status, reviewed_by FROM payment_requests WHERE id = $1`,
    [id],
  );
  return row;
}

async function readSubscription(providerId: string) {
  const [row] = await AppDataSource.query<{ status: string; expires_at: string }[]>(
    `SELECT status, expires_at FROM provider_subscriptions WHERE provider_id = $1`,
    [providerId],
  );
  return row;
}

describe('GET /api/v1/admin/payment-requests', () => {
  it('admin xem được danh sách yêu cầu đang chờ duyệt', async () => {
    const { requestId } = await seedProviderWithPendingRequest();

    const res = await request(app)
      .get('/api/v1/admin/payment-requests')
      .set('Authorization', `Bearer ${await adminToken()}`)
      .expect(200);

    const rows = res.body.data?.data ?? res.body.data;
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.some((r: { id: string }) => r.id === requestId)).toBe(true);
  });

  it('provider không xem được danh sách của toàn nền tảng', async () => {
    const { provider } = await seedProviderWithPendingRequest();

    await request(app)
      .get('/api/v1/admin/payment-requests')
      .set('Authorization', `Bearer ${generateToken(provider)}`)
      .expect(403);
  });

  it('không đăng nhập thì không xem được', async () => {
    await request(app).get('/api/v1/admin/payment-requests').expect(401);
  });
});

describe('POST /api/v1/admin/payment-requests/:id/confirm', () => {
  it('xác nhận thì đơn chuyển CONFIRMED và gói thuê bao được kích hoạt', async () => {
    const { provider, requestId } = await seedProviderWithPendingRequest();

    await request(app)
      .post(`/api/v1/admin/payment-requests/${requestId}/confirm`)
      .set('Authorization', `Bearer ${await adminToken()}`)
      .send({ notes: 'Đã đối chiếu sao kê' })
      .expect(200);

    expect((await readRequest(requestId)).status).toBe(PaymentRequestStatus.CONFIRMED);

    const sub = await readSubscription(provider.id);
    expect(sub).toBeDefined();
    expect([SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIAL]).toContain(sub.status);

    // Gói chạy 30 ngày kể từ lúc xác nhận.
    const days = (new Date(sub.expires_at).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29);
    expect(days).toBeLessThan(31);
  });

  it('ghi lại ai là người duyệt, để còn truy trách nhiệm', async () => {
    const admin = await createTestUser({ role: UserRole.ADMIN });
    const { requestId } = await seedProviderWithPendingRequest();

    await request(app)
      .post(`/api/v1/admin/payment-requests/${requestId}/confirm`)
      .set('Authorization', `Bearer ${generateToken(admin)}`)
      .send({})
      .expect(200);

    expect((await readRequest(requestId)).reviewed_by).toBe(admin.id);
  });

  it('bấm xác nhận lần thứ hai bị chặn — không cộng dồn thêm 30 ngày', async () => {
    const { provider, requestId } = await seedProviderWithPendingRequest();
    const token = await adminToken();

    await request(app)
      .post(`/api/v1/admin/payment-requests/${requestId}/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(200);
    const first = await readSubscription(provider.id);

    const second = await request(app)
      .post(`/api/v1/admin/payment-requests/${requestId}/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(second.status).toBe(400);
    expect(second.body.code).toBe('ALREADY_PROCESSED');
    expect((await readSubscription(provider.id)).expires_at).toEqual(first.expires_at);
  });

  it('yêu cầu đã từ chối thì không xác nhận ngược lại được', async () => {
    const { requestId } = await seedProviderWithPendingRequest();
    const token = await adminToken();

    await request(app)
      .post(`/api/v1/admin/payment-requests/${requestId}/reject`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Không tìm thấy khoản chuyển này trong sao kê' })
      .expect(200);

    await request(app)
      .post(`/api/v1/admin/payment-requests/${requestId}/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(400);
  });

  it('id không tồn tại thì trả 404', async () => {
    await request(app)
      .post('/api/v1/admin/payment-requests/00000000-0000-0000-0000-000000000000/confirm')
      .set('Authorization', `Bearer ${await adminToken()}`)
      .send({})
      .expect(404);
  });

  it('provider không tự duyệt yêu cầu của chính mình', async () => {
    const { provider, requestId } = await seedProviderWithPendingRequest();

    await request(app)
      .post(`/api/v1/admin/payment-requests/${requestId}/confirm`)
      .set('Authorization', `Bearer ${generateToken(provider)}`)
      .send({})
      .expect(403);

    // Quan trọng hơn mã lỗi: gói KHÔNG được kích hoạt.
    expect(await readSubscription(provider.id)).toBeUndefined();
  });
});

describe('POST /api/v1/admin/payment-requests/:id/reject', () => {
  it('từ chối thì đơn chuyển REJECTED và không có gói nào được tạo', async () => {
    const { provider, requestId } = await seedProviderWithPendingRequest();

    await request(app)
      .post(`/api/v1/admin/payment-requests/${requestId}/reject`)
      .set('Authorization', `Bearer ${await adminToken()}`)
      .send({ reason: 'Số tiền không khớp với gói đã chọn' })
      .expect(200);

    expect((await readRequest(requestId)).status).toBe(PaymentRequestStatus.REJECTED);
    expect(await readSubscription(provider.id)).toBeUndefined();
  });

  it('từ chối phải nêu lý do — provider cần biết vì sao mà làm lại', async () => {
    const { requestId } = await seedProviderWithPendingRequest();

    const res = await request(app)
      .post(`/api/v1/admin/payment-requests/${requestId}/reject`)
      .set('Authorization', `Bearer ${await adminToken()}`)
      .send({});

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect((await readRequest(requestId)).status).toBe(PaymentRequestStatus.PENDING);
  });
});
