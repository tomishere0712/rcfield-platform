import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropShiftTables1751300000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "staff_shifts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "shift_time_presets"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "shift_positions"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "shift_positions" (
        "id" UUID NOT NULL DEFAULT gen_random_uuid(),
        "provider_id" UUID NOT NULL,
        "name" VARCHAR(120) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_shift_positions" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "shift_time_presets" (
        "id" UUID NOT NULL DEFAULT gen_random_uuid(),
        "provider_id" UUID NOT NULL,
        "label" VARCHAR(120) NOT NULL,
        "start_time" TIME NOT NULL,
        "end_time" TIME NOT NULL,
        "sort_order" INTEGER NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_shift_time_presets" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "staff_shifts" (
        "id" UUID NOT NULL DEFAULT gen_random_uuid(),
        "provider_id" UUID NOT NULL,
        "cafe_id" UUID NOT NULL,
        "staff_id" UUID NOT NULL,
        "position_id" UUID NOT NULL,
        "shift_date" DATE NOT NULL,
        "shift_label" VARCHAR(120),
        "start_time" TIME,
        "end_time" TIME,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_staff_shifts" PRIMARY KEY ("id")
      )
    `);
  }
}
