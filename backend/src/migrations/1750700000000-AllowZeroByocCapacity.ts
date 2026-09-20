import { MigrationInterface, QueryRunner } from 'typeorm';

export class AllowZeroByocCapacity1750700000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    // Drop old constraint that blocked byoc_capacity = 0 (BYOC-only tracks need >= 1,
    // but rental-only tracks must be allowed to set byoc_capacity = 0)
    await queryRunner.query(`
      ALTER TABLE cafe_track_configs
        DROP CONSTRAINT IF EXISTS cafe_track_configs_byoc_capacity_check
    `);

    // New constraint: at least one mode must be active per track
    await queryRunner.query(`
      ALTER TABLE cafe_track_configs
        ADD CONSTRAINT track_has_at_least_one_mode
        CHECK (max_concurrent > 0 OR byoc_capacity > 0)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE cafe_track_configs
        DROP CONSTRAINT IF EXISTS track_has_at_least_one_mode
    `);
    await queryRunner.query(`
      ALTER TABLE cafe_track_configs
        ADD CONSTRAINT cafe_track_configs_byoc_capacity_check
        CHECK (byoc_capacity >= 1)
    `);
  }
}
