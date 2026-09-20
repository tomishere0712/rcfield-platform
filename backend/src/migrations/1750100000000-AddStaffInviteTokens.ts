import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStaffInviteTokens1750100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE staff_invite_tokens (
        id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token       TEXT        NOT NULL,
        expires_at  TIMESTAMPTZ NOT NULL,
        used_at     TIMESTAMPTZ NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX idx_staff_invite_tokens_user_id ON staff_invite_tokens(user_id);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS staff_invite_tokens CASCADE;
    `);
  }
}
