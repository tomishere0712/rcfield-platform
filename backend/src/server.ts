import 'dotenv/config';
import { createServer } from 'http';
import { app } from './app';
import { AppDataSource } from './config/database';
import { redis } from './config/redis';
import { env } from './config/env';
import { logger } from './config/logger';
import { wsService } from './services/websocket.service';
import { scheduleQuotaReset } from './jobs/quota-reset.job';
import { startSubscriptionLifecycleJobs } from './jobs/subscription-lifecycle.job';
import { scheduleBookingTimeout } from './jobs/booking-timeout.job';
import { startPackageExpiryJob } from './jobs/package-expiry.job';
import { startContestReminderJob } from './jobs/contest-reminder.job';
import { startFbChatWorker, stopFbChatWorker } from './workers/fb-chat.worker';

async function bootstrap() {
  try {
    let redisReady = false;

    await AppDataSource.initialize();
    const hasPendingMigrations = await AppDataSource.showMigrations();
    if (hasPendingMigrations) {
      if (!env.db.autoMigrate) {
        throw new Error(
          'Pending database migrations detected. Run `npm run migration:run` or enable DB_AUTO_MIGRATE.',
        );
      }

      const appliedMigrations = await AppDataSource.runMigrations({ transaction: 'each' });
      logger.database(`Applied ${appliedMigrations.length} pending migration(s)`);
    }

    logger.database(`PostgreSQL connected on port ${env.db.port}`);

    // Note: Database notification type column was migrated to VARCHAR(255), so pg_enum checks are no longer required.

    try {
      await redis.connect();
      redisReady = true;
      logger.info('Redis', `Connected on port ${env.redis.port}`);
    } catch (err) {
      if (env.redis.required) {
        throw err;
      }
      logger.warn('Redis', 'Connection failed; continuing in degraded mode', err);
    }

    const httpServer = createServer(app);
    wsService.init(httpServer);
    scheduleQuotaReset();
    startSubscriptionLifecycleJobs();
    scheduleBookingTimeout();
    startPackageExpiryJob();
    startContestReminderJob();
    if (redisReady && env.features.fbChatQueueEnabled) {
      startFbChatWorker();
    } else if (!redisReady) {
      logger.warn('FbChatWorker', 'Skipped startup because Redis is unavailable');
    } else {
      logger.warn('FbChatWorker', 'Skipped startup because FB_CHAT_QUEUE_ENABLED=false');
    }

    // Cổng đã có người dùng là chuyện xảy ra thường xuyên lúc phát triển, và
    // vệt lỗi mặc định của Node không nói ra điều đó. Nói thẳng, kèm cách gỡ.
    httpServer.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        logger.error(
          'Bootstrap',
          `Cổng ${env.PORT} đang bị một tiến trình khác giữ. Thường là lần chạy trước ` +
            `chưa thoát hẳn. Xem ai giữ: lsof -nP -iTCP:${env.PORT} -sTCP:LISTEN`,
        );
      } else {
        logger.error('Bootstrap', 'HTTP server error', err);
      }
      process.exit(1);
    });

    httpServer.listen(env.PORT, () => {
      logger.server(`Running on http://localhost:${env.PORT}`);
    });

    /**
     * Thoát cho bằng được, để lần khởi động sau còn giành lại được cổng.
     *
     * `httpServer.close()` chỉ NGỪNG NHẬN kết nối mới rồi chờ những kết nối
     * đang mở tự đóng. WebSocket là kết nối sống lâu — một tab trình duyệt mở
     * sẵn là đủ để hàm gọi lại không bao giờ chạy, tiến trình treo mãi và vẫn
     * giữ cổng 3000. nodemon khởi động bản mới, bản mới ăn EADDRINUSE và chết.
     * Nhìn từ ngoài là "tự nhiên backend hỏng".
     *
     * Nên phải chủ động cắt: đóng WebSocket, huỷ nốt socket HTTP còn treo, và
     * vẫn để một hạn chót phòng khi có thứ khác níu tiến trình lại.
     */
    let closing = false;
    const shutdown = async (signal: string) => {
      if (closing) return;
      closing = true;
      logger.server(`Shutting down (${signal})...`);

      const hanChot = setTimeout(() => {
        logger.warn('Bootstrap', 'Quá hạn tắt êm, thoát cứng để nhả cổng');
        process.exit(0);
      }, 5000);
      // Hạn chót không được giữ tiến trình sống thêm khi mọi thứ khác đã xong.
      hanChot.unref();

      wsService.shutdown();
      await stopFbChatWorker().catch((err) =>
        logger.error('Bootstrap', 'stopFbChatWorker failed', err),
      );

      httpServer.close(() => {
        clearTimeout(hanChot);
        process.exit(0);
      });
      // Socket HTTP còn treo (keep-alive, SSE) cũng chặn `close` y như WebSocket.
      httpServer.closeAllConnections?.();
    };

    process.once('SIGTERM', () => void shutdown('SIGTERM'));
    process.once('SIGINT', () => void shutdown('SIGINT'));
    // nodemon khởi động lại bằng SIGUSR2, KHÔNG phải SIGTERM. Thiếu dòng này
    // thì mọi lần lưu tệp đều bỏ lại một tiến trình còn ôm cổng.
    process.once('SIGUSR2', () => void shutdown('SIGUSR2'));
  } catch (err) {
    logger.error('Bootstrap', 'Failed to start', err);
    process.exit(1);
  }
}

void bootstrap();
