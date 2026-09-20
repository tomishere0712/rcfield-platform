import cron from 'node-cron';
import { AppDataSource } from '../config/database';
import { logger } from '../config/logger';

async function expireActivePackages(): Promise<void> {
  const result = await AppDataSource.query<{ count: string }[]>(
    `UPDATE customer_packages
     SET status = 'EXPIRED', updated_at = NOW()
     WHERE status = 'ACTIVE'
       AND expires_at < NOW()
     RETURNING id`,
  );
  if (result.length) {
    logger.info('PackageExpiry', `expired ${result.length} package(s)`);
  }
}

export function startPackageExpiryJob(): void {
  cron.schedule('5 0 * * *', async () => {
    logger.info('PackageExpiry', 'Running daily package expiry check');
    try {
      await expireActivePackages();
    } catch (err) {
      logger.error('PackageExpiry', 'expiry job failed', err);
    }
  });

  // Chạy ngay một lần khi khởi động: nếu server không hoạt động vào 00:05
  // (rất thường gặp ở môi trường dev) thì các gói quá hạn sẽ kẹt ở ACTIVE
  // cho tới lần chạy kế tiếp. Lần chạy này dọn ngay khi server lên.
  void expireActivePackages().catch((err) => {
    logger.error('PackageExpiry', 'startup expiry sweep failed', err);
  });

  logger.info('PackageExpiry', 'Cron scheduled — Runs daily at 00:05 + once on startup');
}
