import cron from 'node-cron';
import { AppDataSource } from '../config/database';
import { ProviderSubscription } from '../models/provider-subscription.entity';
import { NotificationType, SubscriptionStatus } from '../types';
import { transition } from '../services/subscription.service';
import { createNotification } from '../services/notification.service';
import { logger } from '../config/logger';

async function processExpiredSubscriptions(): Promise<void> {
  const repo = AppDataSource.getRepository(ProviderSubscription);
  const expired = await repo
    .createQueryBuilder('ps')
    .where('ps.expires_at <= NOW()')
    .andWhere('ps.status IN (:...statuses)', {
      statuses: [SubscriptionStatus.TRIAL, SubscriptionStatus.ACTIVE],
    })
    .andWhere('ps.deleted_at IS NULL')
    .getMany();

  for (const sub of expired) {
    try {
      await transition(sub.id, SubscriptionStatus.GRACE_PERIOD);
      logger.info('SubscriptionLifecycle', `→ GRACE_PERIOD sub=${sub.id}`);
    } catch (err) {
      logger.error('SubscriptionLifecycle', `transition failed sub=${sub.id}`, err);
    }
  }
}

async function processExpiredGracePeriods(): Promise<void> {
  const repo = AppDataSource.getRepository(ProviderSubscription);
  const graceExpired = await repo
    .createQueryBuilder('ps')
    .where('ps.grace_ends_at <= NOW()')
    .andWhere('ps.status = :status', { status: SubscriptionStatus.GRACE_PERIOD })
    .andWhere('ps.deleted_at IS NULL')
    .getMany();

  for (const sub of graceExpired) {
    try {
      await transition(sub.id, SubscriptionStatus.EXPIRED);
      await AppDataSource.query(
        `UPDATE cafes SET deleted_at = NOW(), updated_at = NOW()
         WHERE provider_id = $1 AND deleted_at IS NULL`,
        [sub.providerId],
      );
      logger.info(
        'SubscriptionLifecycle',
        `→ EXPIRED, cafes soft-deleted provId=${sub.providerId}`,
      );
    } catch (err) {
      logger.error('SubscriptionLifecycle', `grace expiry failed sub=${sub.id}`, err);
    }
  }
}

/**
 * Bao nhiêu ngày trước khi hết hạn thì báo cho chủ sân.
 *
 * Gói trả phí báo sớm hơn vì việc gia hạn của họ TỐN THỜI GIAN: chuyển khoản,
 * nộp chứng từ, rồi chờ quản trị viên duyệt. Ba ngày không đủ cho chuỗi đó, và
 * người quên gia hạn hầu như luôn là quên chứ không phải muốn nghỉ — để họ rơi
 * vào ân hạn là mất doanh thu của cả hai bên.
 *
 * Gói dùng thử giữ ba ngày: chưa trả đồng nào, và nhắc quá sớm thì thành làm
 * phiền người còn đang cân nhắc.
 */
const CANH_BAO_HET_HAN = [
  {
    trangThai: SubscriptionStatus.ACTIVE,
    soNgay: 7,
    loai: NotificationType.SUBSCRIPTION_EXPIRING_SOON,
    tieuDe: 'Gói đăng ký sắp hết hạn',
    noiDung: (ngay: number) =>
      `Gói đăng ký của bạn sẽ hết hạn sau ${ngay} ngày. Gia hạn sớm để chi nhánh không bị gián đoạn nhận đặt lịch.`,
  },
  {
    trangThai: SubscriptionStatus.TRIAL,
    soNgay: 3,
    loai: NotificationType.TRIAL_EXPIRING_SOON,
    tieuDe: 'Gói dùng thử sắp hết hạn',
    noiDung: (ngay: number) =>
      `Gói dùng thử của bạn sẽ hết hạn sau ${ngay} ngày. Hãy đăng ký gói để tiếp tục sử dụng.`,
  },
] as const;

/** Xuất ra để test gọi thẳng, không phải chờ lịch chạy. */
export async function sendExpiryWarnings(): Promise<void> {
  for (const canhBao of CANH_BAO_HET_HAN) {
    /*
      Cửa sổ chống trùng lấy ĐÚNG bằng cửa sổ cảnh báo.

      Ngắn hơn thì mỗi lần chạy lại gửi thêm một thông báo giống hệt — công việc
      này chạy theo lịch nên đó là hàng chục cái mỗi ngày. Dài hơn thì chủ sân
      gia hạn xong, gói mới lại sắp hết, mà lần này không được báo.
    */
    const subs = await AppDataSource.query<Array<{ provider_id: string; expires_at: string }>>(
      `SELECT ps.id, ps.provider_id, ps.expires_at
         FROM provider_subscriptions ps
        WHERE ps.status = $1
          AND ps.deleted_at IS NULL
          AND ps.expires_at > NOW()
          AND ps.expires_at <= NOW() + ($2 || ' days')::interval
          AND NOT EXISTS (
            SELECT 1 FROM notifications n
             WHERE n.user_id = ps.provider_id
               AND n.type = $3
               AND n.created_at > NOW() - ($2 || ' days')::interval
          )`,
      [canhBao.trangThai, String(canhBao.soNgay), canhBao.loai],
    );

    for (const sub of subs) {
      try {
        const daysLeft = Math.max(
          1,
          Math.ceil((new Date(sub.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
        );
        await createNotification(
          sub.provider_id,
          canhBao.loai,
          canhBao.tieuDe,
          canhBao.noiDung(daysLeft),
          { route: '/provider/subscriptions' },
        );
        logger.info(
          'SubscriptionLifecycle',
          `cảnh báo hết hạn (${canhBao.trangThai}) gửi tới provId=${sub.provider_id}`,
        );
      } catch (err) {
        logger.error('SubscriptionLifecycle', 'gửi cảnh báo hết hạn thất bại', err);
      }
    }
  }
}

async function resetMonthlyAIQuotas(): Promise<void> {
  const result = await AppDataSource.query<{ count: string }[]>(
    `UPDATE provider_subscriptions
     SET ai_messages_used = 0,
         ai_quota_reset_at = date_trunc('month', NOW()) + INTERVAL '1 month',
         updated_at = NOW()
     WHERE status IN ('TRIAL', 'ACTIVE', 'GRACE_PERIOD')
       AND deleted_at IS NULL
       AND ai_quota_reset_at <= NOW()
     RETURNING id`,
  );
  if (result.length) {
    logger.info('SubscriptionLifecycle', `AI quota reset for ${result.length} subscription(s)`);
  }
}

export function startSubscriptionLifecycleJobs(): void {
  cron.schedule('5 0 * * *', async () => {
    logger.info('SubscriptionLifecycle', 'Running daily lifecycle check');
    await processExpiredSubscriptions();
    await processExpiredGracePeriods();
    await sendExpiryWarnings();
    await resetMonthlyAIQuotas();
  });

  logger.info('SubscriptionLifecycle', 'Cron scheduled — Runs daily at 00:05');
}
