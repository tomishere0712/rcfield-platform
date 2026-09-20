import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMaxAdvanceBookingDays1784300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE cafes
      ADD COLUMN IF NOT EXISTS max_advance_booking_days INTEGER NOT NULL DEFAULT 30;
    `);
    await queryRunner.query(`
      ALTER TABLE cafes
      DROP CONSTRAINT IF EXISTS chk_cafes_max_advance_booking_days;
    `);
    await queryRunner.query(`
      ALTER TABLE cafes
      ADD CONSTRAINT chk_cafes_max_advance_booking_days
      CHECK (max_advance_booking_days BETWEEN 1 AND 365);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE cafes
      DROP CONSTRAINT IF EXISTS chk_cafes_max_advance_booking_days;
    `);
    await queryRunner.query(`
      ALTER TABLE cafes
      DROP COLUMN IF EXISTS max_advance_booking_days;
    `);
  }
}
