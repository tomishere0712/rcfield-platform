import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMaxConcurrentToTrackConfig1750200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add max_concurrent column — defaults to the cafe's current max_concurrent_bookings as a sensible backfill
    await queryRunner.query(`
      ALTER TABLE cafe_track_configs
      ADD COLUMN IF NOT EXISTS max_concurrent INT NOT NULL DEFAULT 10;
    `);

    // Best-effort backfill: copy each cafe's max_concurrent_bookings into its track configs
    await queryRunner.query(`
      UPDATE cafe_track_configs ctc
      SET max_concurrent = COALESCE(c.max_concurrent_bookings, 10)
      FROM cafes c
      WHERE c.id = ctc.cafe_id
        AND ctc.deleted_at IS NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE cafe_track_configs DROP COLUMN IF EXISTS max_concurrent;
    `);
  }
}
