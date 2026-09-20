import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGoogleIdToUsers1747612800001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(255)`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id
      ON users(google_id)
      WHERE google_id IS NOT NULL AND deleted_at IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_users_google_id`);
    await queryRunner.query(`ALTER TABLE users DROP COLUMN IF EXISTS google_id`);
  }
}
