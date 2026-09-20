import { MigrationInterface, QueryRunner } from 'typeorm';

export class AllowMultipleStaffShiftsPerCell1750600000000 implements MigrationInterface {
  name = 'AllowMultipleStaffShiftsPerCell1750600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "staff_shifts" DROP CONSTRAINT IF EXISTS "uq_staff_shift_cell"`,
    );
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_staff_shifts_cell_staff"
      ON "staff_shifts" ("provider_id", "cafe_id", "position_id", "shift_date", "staff_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_staff_shifts_cell_staff"`);
    await queryRunner.query(`
      ALTER TABLE "staff_shifts"
      ADD CONSTRAINT "uq_staff_shift_cell"
      UNIQUE("provider_id", "cafe_id", "position_id", "shift_date", "staff_id")
    `);
  }
}
