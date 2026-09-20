import { MigrationInterface, QueryRunner } from 'typeorm';

export class ContestBookingLink1784500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Link bookings to contests via a dedicated nullable FK column.
    await queryRunner.query(`
      ALTER TABLE bookings
        ADD COLUMN IF NOT EXISTS contest_id uuid NULL;
    `);

    await queryRunner.query(`
      ALTER TABLE bookings
        ADD CONSTRAINT fk_bookings_contest_id
        FOREIGN KEY (contest_id) REFERENCES contests (id) ON DELETE SET NULL;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_bookings_contest_id
        ON bookings (contest_id);
    `);

    // Backfill from legacy snapshot jsonb (snapshot->>'contest_id').
    await queryRunner.query(`
      UPDATE bookings
      SET contest_id = (snapshot->>'contest_id')::uuid
      WHERE contest_id IS NULL
        AND snapshot ? 'contest_id'
        AND snapshot->>'contest_id' IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_bookings_contest_id;
    `);

    await queryRunner.query(`
      ALTER TABLE bookings
        DROP CONSTRAINT IF EXISTS fk_bookings_contest_id;
    `);

    await queryRunner.query(`
      ALTER TABLE bookings
        DROP COLUMN IF EXISTS contest_id;
    `);
  }
}
