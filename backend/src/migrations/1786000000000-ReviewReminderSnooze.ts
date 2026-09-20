import { MigrationInterface, QueryRunner } from 'typeorm';

export class ReviewReminderSnooze1786000000000 implements MigrationInterface {
  name = 'ReviewReminderSnooze1786000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE bookings
      ADD COLUMN IF NOT EXISTS review_snoozed_until TIMESTAMPTZ NULL
    `);

    // Historic notifications are preserved. New review requests carry a
    // dedicated key so the unique index prevents concurrent duplicate sends.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_notifications_review_request_key"
      ON notifications (user_id, type, (data ->> 'reviewRequestKey'))
      WHERE type = 'BOOKING_REVIEW_REQUEST'
        AND data ? 'reviewRequestKey'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_notifications_review_request_key"`);
    await queryRunner.query(`
      ALTER TABLE bookings
      DROP COLUMN IF EXISTS review_snoozed_until
    `);
  }
}
