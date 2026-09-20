import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNotificationData1783600000001 implements MigrationInterface {
  name = 'AddNotificationData1783600000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "notifications" ADD COLUMN "data" jsonb`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "notifications" DROP COLUMN IF EXISTS "data"`);
  }
}
