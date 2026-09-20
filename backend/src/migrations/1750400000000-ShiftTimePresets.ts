import { MigrationInterface, QueryRunner } from 'typeorm';

export class ShiftTimePresets1750400000000 implements MigrationInterface {
  name = 'ShiftTimePresets1750400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "shift_time_presets" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "provider_id" uuid NOT NULL,
        "label" varchar(120) NOT NULL,
        "start_time" time NOT NULL,
        "end_time" time NOT NULL,
        "sort_order" integer NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz NULL,
        CONSTRAINT "fk_shift_time_presets_provider" FOREIGN KEY ("provider_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_shift_time_presets_provider_sort"
      ON "shift_time_presets" ("provider_id", "sort_order")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_shift_time_presets_provider_label_active"
      ON "shift_time_presets" ("provider_id", "label")
      WHERE "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_shift_time_presets_provider_label_active"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_shift_time_presets_provider_sort"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "shift_time_presets"`);
  }
}
