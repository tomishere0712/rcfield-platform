import { MigrationInterface, QueryRunner } from 'typeorm';

export class ScopeStaffShiftsByCafe1750500000000 implements MigrationInterface {
  name = 'ScopeStaffShiftsByCafe1750500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "staff_shifts" ADD COLUMN IF NOT EXISTS "cafe_id" uuid`);
    await queryRunner.query(`
      UPDATE "staff_shifts" s
         SET "cafe_id" = a."cafe_id"
        FROM "staff_cafe_assignments" a
        JOIN "cafes" c ON c."id" = a."cafe_id"
       WHERE a."staff_id" = s."staff_id"
         AND c."provider_id" = s."provider_id"
         AND s."cafe_id" IS NULL
    `);
    await queryRunner.query(`
      DELETE FROM "staff_shifts"
       WHERE "cafe_id" IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "staff_shifts"
      ALTER COLUMN "cafe_id" SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "staff_shifts"
      ADD CONSTRAINT "fk_staff_shifts_cafe"
      FOREIGN KEY ("cafe_id") REFERENCES "cafes"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(
      `ALTER TABLE "staff_shifts" DROP CONSTRAINT IF EXISTS "uq_staff_shift_cell"`,
    );
    await queryRunner.query(`
      ALTER TABLE "staff_shifts"
      ADD CONSTRAINT "uq_staff_shift_cell"
      UNIQUE("provider_id", "cafe_id", "position_id", "shift_date", "staff_id")
    `);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_staff_shifts_provider_week"`);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_staff_shifts_provider_cafe_week"
      ON "staff_shifts" ("provider_id", "cafe_id", "shift_date")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_staff_shifts_provider_cafe_week"`);
    await queryRunner.query(
      `ALTER TABLE "staff_shifts" DROP CONSTRAINT IF EXISTS "uq_staff_shift_cell"`,
    );
    await queryRunner.query(`
      ALTER TABLE "staff_shifts"
      ADD CONSTRAINT "uq_staff_shift_cell"
      UNIQUE("provider_id", "position_id", "shift_date", "staff_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_staff_shifts_provider_week"
      ON "staff_shifts" ("provider_id", "shift_date")
    `);
    await queryRunner.query(
      `ALTER TABLE "staff_shifts" DROP CONSTRAINT IF EXISTS "fk_staff_shifts_cafe"`,
    );
    await queryRunner.query(`ALTER TABLE "staff_shifts" DROP COLUMN IF EXISTS "cafe_id"`);
  }
}
