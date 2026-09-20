import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSystemPrompt1747872000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE cafe_widget_configs
      ADD COLUMN IF NOT EXISTS system_prompt TEXT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE cafe_widget_configs DROP COLUMN IF EXISTS system_prompt;
    `);
  }
}
