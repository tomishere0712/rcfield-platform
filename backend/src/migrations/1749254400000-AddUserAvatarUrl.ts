import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserAvatarUrl1749254400000 implements MigrationInterface {
  name = 'AddUserAvatarUrl1749254400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS avatar_url TEXT
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
      DROP COLUMN IF EXISTS avatar_url
    `);
  }
}
