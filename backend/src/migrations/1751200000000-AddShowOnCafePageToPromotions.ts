import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddShowOnCafePageToPromotions1751200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "promotions" ADD COLUMN IF NOT EXISTS "show_on_cafe_page" boolean NOT NULL DEFAULT true;`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "promotions" DROP COLUMN IF EXISTS "show_on_cafe_page";`);
  }
}
