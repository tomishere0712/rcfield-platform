import { MigrationInterface, QueryRunner } from 'typeorm';

export class ScopePromotionCodeByCafe1749254600000 implements MigrationInterface {
  name = 'ScopePromotionCodeByCafe1749254600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_promotions_code`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_promotions_cafe_code
      ON promotions(cafe_id, code)
      WHERE is_active = TRUE AND cafe_id IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_promotions_cafe_code`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_promotions_code
      ON promotions(code)
      WHERE is_active = TRUE
    `);
  }
}
