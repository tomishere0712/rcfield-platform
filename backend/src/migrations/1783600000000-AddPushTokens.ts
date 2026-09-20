import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPushTokens1783600000000 implements MigrationInterface {
  name = 'AddPushTokens1783600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "push_tokens" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "token" text NOT NULL,
        "platform" varchar(30),
        "device_id" varchar(255),
        "device_name" varchar(255),
        "app_version" varchar(50),
        "last_seen_at" timestamptz NOT NULL DEFAULT NOW(),
        "revoked_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT NOW(),
        "updated_at" timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_push_tokens" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_push_tokens_token" UNIQUE ("token"),
        CONSTRAINT "FK_push_tokens_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_push_tokens_user_revoked" ON "push_tokens" ("user_id", "revoked_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_push_tokens_user_revoked"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "push_tokens"`);
  }
}
