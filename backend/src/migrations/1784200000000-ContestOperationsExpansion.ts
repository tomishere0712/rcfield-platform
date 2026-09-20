import { MigrationInterface, QueryRunner } from 'typeorm';

export class ContestOperationsExpansion1784200000000 implements MigrationInterface {
  public transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS contest_staff_assignments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        contest_id UUID NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
        staff_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        assigned_by UUID NOT NULL REFERENCES users(id),
        assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_contest_staff_assignments_unique
        ON contest_staff_assignments(contest_id, staff_id);
      CREATE INDEX IF NOT EXISTS idx_contest_staff_assignments_staff
        ON contest_staff_assignments(staff_id, contest_id);
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS contest_bans (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        provider_id UUID NOT NULL REFERENCES users(id),
        contest_id UUID REFERENCES contests(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        scope_type VARCHAR(20) NOT NULL DEFAULT 'CONTEST',
        reason TEXT NOT NULL,
        evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_by UUID NOT NULL REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ,
        lifted_at TIMESTAMPTZ,
        lifted_by UUID REFERENCES users(id),
        lift_reason TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_contest_bans_active_lookup
        ON contest_bans(user_id, provider_id, contest_id, lifted_at, expires_at);
      CREATE INDEX IF NOT EXISTS idx_contest_bans_contest
        ON contest_bans(contest_id, created_at DESC);
    `);

    await queryRunner.query(`
      ALTER TABLE payment_transactions
        ADD COLUMN IF NOT EXISTS contest_registration_id UUID REFERENCES contest_registrations(id),
        ADD COLUMN IF NOT EXISTS subject_type VARCHAR(40) NOT NULL DEFAULT 'BOOKING';

      CREATE INDEX IF NOT EXISTS idx_payment_transactions_contest_registration_id
        ON payment_transactions(contest_registration_id);
      CREATE INDEX IF NOT EXISTS idx_payment_transactions_subject_type
        ON payment_transactions(subject_type);
    `);

    await queryRunner.query(`
      ALTER TABLE contest_match_participants
        ADD COLUMN IF NOT EXISTS best_lap_seconds NUMERIC(10,3),
        ADD COLUMN IF NOT EXISTS total_time_seconds NUMERIC(10,3);
    `);

    await queryRunner.query(`
      UPDATE contest_match_participants
      SET best_lap_seconds = ROUND((best_lap_ms::numeric / 1000.0), 3)
      WHERE best_lap_ms IS NOT NULL
        AND best_lap_seconds IS NULL;
    `);

    await queryRunner.query(`
      UPDATE contest_match_participants
      SET total_time_seconds = ROUND((total_time_ms::numeric / 1000.0), 3)
      WHERE total_time_ms IS NOT NULL
        AND total_time_seconds IS NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE contest_match_participants
        DROP COLUMN IF EXISTS best_lap_seconds,
        DROP COLUMN IF EXISTS total_time_seconds;
    `);

    await queryRunner.query(`
      ALTER TABLE payment_transactions
        DROP COLUMN IF EXISTS contest_registration_id,
        DROP COLUMN IF EXISTS subject_type;
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS contest_bans CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS contest_staff_assignments CASCADE;`);
  }
}
