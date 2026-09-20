import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFullPageEnabledToWidgetConfig1749340800000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE cafe_widget_configs ADD COLUMN IF NOT EXISTS full_page_enabled BOOLEAN NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE cafe_widget_configs DROP COLUMN IF EXISTS full_page_enabled`,
    );
  }
}
