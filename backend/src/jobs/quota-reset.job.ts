import cron from 'node-cron';
import { AppDataSource } from '../config/database';
import { logger } from '../config/logger';

// Runs daily at 00:05 — resets used_this_month for any cafe whose quota_reset_day matches today
export function scheduleQuotaReset(): void {
  cron.schedule('5 0 * * *', async () => {
    const today = new Date().getDate();
    logger.info('QuotaReset', `running day=${today}`);

    try {
      const result = await AppDataSource.query<{ count: string }[]>(
        `UPDATE feature_flags
         SET config = jsonb_set(config, '{used_this_month}', '0')
         WHERE feature_key = 'AI_CHATBOT'
           AND entity_type = 'CAFE'
           AND (config->>'quota_reset_day')::int = $1
         RETURNING id`,
        [today],
      );

      logger.info('QuotaReset', `reset ${result.length} cafe(s) on day ${today}`);
    } catch (err) {
      logger.error('QuotaReset', 'failed', err);
    }
  });

  logger.info('QuotaReset', 'Cron scheduled — Runs daily at 00:05');
}
