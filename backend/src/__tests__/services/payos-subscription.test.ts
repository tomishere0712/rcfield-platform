import { AppDataSource } from '../../config/database';

// Không gọi ra PayOS thật: test này kiểm luật của mình sau khi cổng báo đã nhận
// tiền, không kiểm mạng của họ.
jest.mock('@payos/node', () => ({
  PayOS: jest.fn(() => ({
    paymentRequests: {
      create: jest.fn(),
      get: jest.fn(),
      cancel: jest.fn(),
    },
    webhooks: { verify: jest.fn() },
  })),
}));

import { handlePayOSPaid } from '../../services/payos.service';
import { PaymentRequest } from '../../models/payment-request.entity';
import { PaymentRequestStatus, ProviderStatus, SubscriptionStatus, UserRole } from '../../types';
import { createTestUser } from '../helpers';

async function seedPendingPayosRequest() {
  const provider = await createTestUser({ role: UserRole.PROVIDER });
  await AppDataSource.query(
    `INSERT INTO provider_profiles (user_id, business_name, registration_status)
     VALUES ($1, $2, $3)`,
    [provider.id, 'RC Shop PayOS', ProviderStatus.ACTIVE],
  );

  const [plan] = await AppDataSource.query<{ id: string; price_per_month: string }[]>(
    `SELECT id, price_per_month FROM subscription_plans WHERE name <> 'TRIAL' ORDER BY price_per_month LIMIT 1`,
  );

  const repo = AppDataSource.getRepository(PaymentRequest);
  const request = await repo.save(
    repo.create({
      providerId: provider.id,
      planId: plan.id,
      transferReference: '123456789',
      transferDate: new Date().toISOString().slice(0, 10),
      transferAmount: Number(plan.price_per_month),
      status: PaymentRequestStatus.PENDING,
    }),
  );

  return { provider, plan, request };
}

describe('handlePayOSPaid — cổng báo đã nhận tiền gói thuê bao', () => {
  it('xác nhận đơn ngay, không chờ admin duyệt', async () => {
    const { provider, request } = await seedPendingPayosRequest();

    await handlePayOSPaid(request);

    const [row] = await AppDataSource.query<{ status: string; admin_notes: string }[]>(
      `SELECT status, admin_notes FROM payment_requests WHERE id = $1`,
      [request.id],
    );
    expect(row.status).toBe(PaymentRequestStatus.CONFIRMED);

    const [sub] = await AppDataSource.query<{ status: string; expires_at: string }[]>(
      `SELECT status, expires_at FROM provider_subscriptions WHERE provider_id = $1`,
      [provider.id],
    );
    expect(sub).toBeDefined();
    expect([SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIAL]).toContain(sub.status);

    // Gói chạy 30 ngày kể từ lúc xác nhận.
    const days = (new Date(sub.expires_at).getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    expect(days).toBeGreaterThan(29);
    expect(days).toBeLessThan(31);
  });

  it('gọi lại lần nữa không cộng thêm hạn — webhook gửi trùng là chuyện thường', async () => {
    const { provider, request } = await seedPendingPayosRequest();

    await handlePayOSPaid(request);
    const [first] = await AppDataSource.query<{ expires_at: string }[]>(
      `SELECT expires_at FROM provider_subscriptions WHERE provider_id = $1`,
      [provider.id],
    );

    const reloaded = await AppDataSource.getRepository(PaymentRequest).findOneOrFail({
      where: { id: request.id },
    });
    await handlePayOSPaid(reloaded);

    const [second] = await AppDataSource.query<{ expires_at: string }[]>(
      `SELECT expires_at FROM provider_subscriptions WHERE provider_id = $1`,
      [provider.id],
    );
    expect(second.expires_at).toEqual(first.expires_at);
  });

  it('đơn đã bị từ chối thì cổng báo về cũng không kích hoạt', async () => {
    const { provider, request } = await seedPendingPayosRequest();
    await AppDataSource.getRepository(PaymentRequest).update(request.id, {
      status: PaymentRequestStatus.REJECTED,
    });

    const rejected = await AppDataSource.getRepository(PaymentRequest).findOneOrFail({
      where: { id: request.id },
    });
    await handlePayOSPaid(rejected);

    const [row] = await AppDataSource.query<{ status: string }[]>(
      `SELECT status FROM payment_requests WHERE id = $1`,
      [request.id],
    );
    expect(row.status).toBe(PaymentRequestStatus.REJECTED);

    const subs = await AppDataSource.query(
      `SELECT id FROM provider_subscriptions WHERE provider_id = $1`,
      [provider.id],
    );
    expect(subs).toHaveLength(0);
  });
});
