import { MigrationInterface, QueryRunner } from 'typeorm';

export class ShiftManagement1750300000000 implements MigrationInterface {
  name = 'ShiftManagement1750300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS shift_positions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        provider_id UUID NOT NULL REFERENCES users(id),
        name VARCHAR(120) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ NULL
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_shift_positions_provider_name_active
      ON shift_positions(provider_id, lower(name))
      WHERE deleted_at IS NULL
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS staff_shifts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        provider_id UUID NOT NULL REFERENCES users(id),
        position_id UUID NOT NULL REFERENCES shift_positions(id),
        staff_id UUID NOT NULL REFERENCES users(id),
        shift_date DATE NOT NULL,
        shift_label VARCHAR(120) NULL,
        start_time TIME NULL,
        end_time TIME NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_staff_shift_cell UNIQUE(provider_id, position_id, shift_date, staff_id)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_staff_shifts_provider_week
      ON staff_shifts(provider_id, shift_date)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS staff_shifts`);
    await queryRunner.query(`DROP TABLE IF EXISTS shift_positions`);
  }
}
