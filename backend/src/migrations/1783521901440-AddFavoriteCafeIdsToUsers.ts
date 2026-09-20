import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFavoriteCafeIdsToUsers1783521901440 implements MigrationInterface {
  name = 'AddFavoriteCafeIdsToUsers1783521901440';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "favorite_cafe_ids" uuid array NOT NULL DEFAULT '{}'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "favorite_cafe_ids"`);
  }
}
