import { MigrationInterface, QueryRunner } from 'typeorm';

export class ContestRiskRegisterFixes1784400000000 implements MigrationInterface {
  public transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Unique check-in code per contest to prevent collisions and lookup ambiguity.
    await queryRunner.query(`
      ALTER TABLE contest_registrations
        ADD CONSTRAINT uq_contest_registrations_check_in_code UNIQUE (check_in_code);
    `);

    // Partial unique index: one active ban per (provider, user, contest scope).
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_contest_bans_active_scope
        ON contest_bans (provider_id, user_id, COALESCE(contest_id, '00000000-0000-0000-0000-000000000000'))
        WHERE lifted_at IS NULL;
    `);

    // Index to speed up contest status auto-close scans.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_contests_status_registration_closes_at
        ON contests (status, registration_closes_at)
        WHERE status = 'OPEN';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_contests_status_registration_closes_at;
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS uq_contest_bans_active_scope;
    `);

    await queryRunner.query(`
      ALTER TABLE contest_registrations
        DROP CONSTRAINT IF EXISTS uq_contest_registrations_check_in_code;
    `);
  }
}
