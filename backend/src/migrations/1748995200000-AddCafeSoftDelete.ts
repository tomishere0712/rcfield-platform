import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCafeSoftDelete1748995200000 implements MigrationInterface {
  name = 'AddCafeSoftDelete1748995200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_cafes_not_deleted ON cafes(provider_id) WHERE deleted_at IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_cafes_not_deleted`);
    await queryRunner.query(`ALTER TABLE cafes DROP COLUMN IF EXISTS deleted_at`);
  }
}
