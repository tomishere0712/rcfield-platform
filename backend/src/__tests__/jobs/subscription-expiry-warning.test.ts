import { AppDataSource } from '../../config/database';
import { sendExpiryWarnings } from '../../jobs/subscription-lifecycle.job';
import { NotificationType, SubscriptionStatus, UserRole } from '../../types';
import { createTestUser } from '../helpers';

/**
 * Cảnh báo gói sắp hết hạn.
 *
 * Hai luật dễ hỏng theo hai hướng ngược nhau:
 *
 *   • gửi thiếu — chủ sân trả tiền rơi vào ân hạn mà không được báo, và mất
 *     doanh thu của cả hai bên vì hầu như luôn là quên chứ không phải muốn nghỉ;
 *   • gửi thừa — công việc này chạy theo lịch, thiếu chốt chống trùng là hàng
 *     chục thông báo giống hệt nhau mỗi ngày.
 *
 * Nên test khoá cả hai chiều, không chỉ chiều "có gửi".
 */

async function taoGoi(options: {
  status: SubscriptionStatus;
  ngayConLai: number;
}): Promise<string> {
  const provider = await createTestUser({ role: UserRole.PROVIDER });
  const [plan] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM subscription_plans WHERE name = $1 LIMIT 1`,
    [options.status === SubscriptionStatus.TRIAL ? 'TRIAL' : 'GROWTH'],
  );
  await AppDataSource.query(
    `INSERT INTO provider_subscriptions
       (provider_id, plan_id, status, started_at, expires_at, ai_quota_reset_at)
     VALUES ($1, $2, $3, NOW() - INTERVAL '10 days',
             NOW() + ($4 || ' days')::interval, NOW() + INTERVAL '30 days')`,
    [provider.id, plan.id, options.status, String(options.ngayConLai)],
  );
  return provider.id;
}

async function demThongBao(providerId: string, type: NotificationType): Promise<number> {
  const [row] = await AppDataSource.query<{ count: string }[]>(
    `SELECT COUNT(*)::text AS count FROM notifications WHERE user_id = $1 AND type = $2`,
    [providerId, type],
  );
  return Number(row?.count ?? 0);
}

describe('sendExpiryWarnings', () => {
  it('gói trả phí còn 5 ngày → được cảnh báo', async () => {
    const providerId = await taoGoi({ status: SubscriptionStatus.ACTIVE, ngayConLai: 5 });

    await sendExpiryWarnings();

    await expect(
      demThongBao(providerId, NotificationType.SUBSCRIPTION_EXPIRING_SOON),
    ).resolves.toBe(1);
  });

  it('gói trả phí còn 20 ngày → chưa báo, còn quá sớm', async () => {
    const providerId = await taoGoi({ status: SubscriptionStatus.ACTIVE, ngayConLai: 20 });

    await sendExpiryWarnings();

    await expect(
      demThongBao(providerId, NotificationType.SUBSCRIPTION_EXPIRING_SOON),
    ).resolves.toBe(0);
  });

  it('chạy nhiều lần vẫn chỉ MỘT thông báo — công việc này chạy theo lịch', async () => {
    const providerId = await taoGoi({ status: SubscriptionStatus.ACTIVE, ngayConLai: 3 });

    await sendExpiryWarnings();
    await sendExpiryWarnings();
    await sendExpiryWarnings();

    await expect(
      demThongBao(providerId, NotificationType.SUBSCRIPTION_EXPIRING_SOON),
    ).resolves.toBe(1);
  });

  it('gói dùng thử vẫn giữ ngưỡng 3 ngày, và mang loại thông báo riêng', async () => {
    const sapHet = await taoGoi({ status: SubscriptionStatus.TRIAL, ngayConLai: 2 });
    const conXa = await taoGoi({ status: SubscriptionStatus.TRIAL, ngayConLai: 5 });

    await sendExpiryWarnings();

    await expect(demThongBao(sapHet, NotificationType.TRIAL_EXPIRING_SOON)).resolves.toBe(1);
    // Năm ngày lọt vào cửa sổ 7 ngày của gói trả phí — nhưng đây là gói dùng
    // thử, ngưỡng của nó là 3, nên phải im.
    await expect(demThongBao(conXa, NotificationType.TRIAL_EXPIRING_SOON)).resolves.toBe(0);
    await expect(demThongBao(sapHet, NotificationType.SUBSCRIPTION_EXPIRING_SOON)).resolves.toBe(0);
  });

  it('gói đã hết hạn rồi thì không cảnh báo nữa — đã có luồng ân hạn lo', async () => {
    const providerId = await taoGoi({ status: SubscriptionStatus.ACTIVE, ngayConLai: -2 });

    await sendExpiryWarnings();

    await expect(
      demThongBao(providerId, NotificationType.SUBSCRIPTION_EXPIRING_SOON),
    ).resolves.toBe(0);
  });
});
