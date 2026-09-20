import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCafeSoftDelete1748908800000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE cafes
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_cafes_deleted_at ON cafes(deleted_at)
      WHERE deleted_at IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_cafes_deleted_at;`);
    await queryRunner.query(`ALTER TABLE cafes DROP COLUMN IF EXISTS deleted_at;`);
  }
}
