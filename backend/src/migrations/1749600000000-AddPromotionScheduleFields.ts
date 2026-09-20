import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPromotionScheduleFields1749600000000 implements MigrationInterface {
  name = 'AddPromotionScheduleFields1749600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'promotion_schedule_mode_enum') THEN
          CREATE TYPE promotion_schedule_mode_enum AS ENUM ('ONCE', 'DAILY', 'WEEKLY');
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      ALTER TABLE promotions
        ADD COLUMN IF NOT EXISTS schedule_mode promotion_schedule_mode_enum NOT NULL DEFAULT 'ONCE',
        ADD COLUMN IF NOT EXISTS schedule_start_time TIME,
        ADD COLUMN IF NOT EXISTS schedule_end_time TIME,
        ADD COLUMN IF NOT EXISTS schedule_weekdays TEXT[] NOT NULL DEFAULT '{}';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE promotions
        DROP COLUMN IF EXISTS schedule_weekdays,
        DROP COLUMN IF EXISTS schedule_end_time,
        DROP COLUMN IF EXISTS schedule_start_time,
        DROP COLUMN IF EXISTS schedule_mode;
    `);
    await queryRunner.query(`DROP TYPE IF EXISTS promotion_schedule_mode_enum;`);
  }
}
