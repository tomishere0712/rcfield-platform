import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLastActiveAt1752400000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ NULL;
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`
      ALTER TABLE users DROP COLUMN IF EXISTS last_active_at;
    `);
  }
}
