import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPublicIdToCafeImages1749168000000 implements MigrationInterface {
  name = 'AddPublicIdToCafeImages1749168000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE cafe_images
      ADD COLUMN IF NOT EXISTS public_id TEXT
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE cafe_images
      DROP COLUMN IF EXISTS public_id
    `);
  }
}
