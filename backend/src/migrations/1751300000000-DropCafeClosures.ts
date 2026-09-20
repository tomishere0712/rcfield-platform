import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropCafeClosures1751300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "cafe_closures"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "cafe_closures" (
        "id" UUID NOT NULL DEFAULT gen_random_uuid(),
        "cafe_id" UUID NOT NULL,
        "closed_date" DATE NOT NULL,
        "reason" VARCHAR(255),
        "created_by" UUID,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cafe_closures" PRIMARY KEY ("id")
      )
    `);
  }
}
