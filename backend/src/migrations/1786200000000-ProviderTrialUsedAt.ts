import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Đánh dấu provider đã tiêu suất dùng thử.
 *
 * Trước đây không có cách nào biết một provider đã dùng gói dùng thử hay chưa:
 * `activateFromPayment` ghi đè `plan_id` lên chính bản ghi subscription cũ, nên
 * dấu vết gói dùng thử bị xoá ngay lần đổi gói đầu tiên. Hệ quả là gói dùng thử
 * chọn lại được vô hạn.
 */
export class ProviderTrialUsedAt1786200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE provider_profiles ADD COLUMN IF NOT EXISTS trial_used_at TIMESTAMPTZ`,
    );

    // Backfill: `createTrial` là đường duy nhất tạo subscription đầu tiên của
    // một provider, nên ai đã có bản ghi subscription thì chắc chắn đã tiêu
    // suất dùng thử. Lấy mốc sớm nhất làm thời điểm dùng.
    await queryRunner.query(`
      UPDATE provider_profiles p
         SET trial_used_at = s.first_started_at
        FROM (
          SELECT provider_id, MIN(started_at) AS first_started_at
            FROM provider_subscriptions
           GROUP BY provider_id
        ) s
       WHERE s.provider_id = p.user_id
         AND p.trial_used_at IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE provider_profiles DROP COLUMN IF EXISTS trial_used_at`);
  }
}
