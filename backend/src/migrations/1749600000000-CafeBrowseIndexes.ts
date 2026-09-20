import { MigrationInterface, QueryRunner } from 'typeorm';

export class CafeBrowseIndexes1749600000000 implements MigrationInterface {
  name = 'CafeBrowseIndexes1749600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_cafes_track_types_gin" ON "cafes" USING GIN ("track_types")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_cafes_amenity_ids_gin" ON "cafes" USING GIN ("amenity_ids")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_cafes_slot_fee_rate" ON "cafes" ("slot_fee_rate")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_promotions_browse_active" ON "promotions" ("cafe_id", "starts_at" DESC)
       WHERE "is_active" = TRUE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_promotions_browse_active"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cafes_slot_fee_rate"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cafes_amenity_ids_gin"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cafes_track_types_gin"`);
  }
}
