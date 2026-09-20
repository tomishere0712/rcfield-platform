import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixFnbOrdersDropLegacyTypeColumn1751000000000 implements MigrationInterface {
  name = 'FixFnbOrdersDropLegacyTypeColumn1751000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Backfill order_type from type for any rows that slipped through if column exists
    const hasTypeColumn = await queryRunner.hasColumn('fnb_orders', 'type');
    if (hasTypeColumn) {
      await queryRunner.query(`
        UPDATE fnb_orders SET order_type = type::text WHERE order_type IS NULL AND type IS NOT NULL;
      `);
    }

    // Make order_type NOT NULL now that all rows are backfilled
    await queryRunner.query(`
      ALTER TABLE fnb_orders ALTER COLUMN order_type SET NOT NULL;
    `);

    // Drop the legacy enum column — entity uses order_type (varchar)
    await queryRunner.query(`
      ALTER TABLE fnb_orders DROP COLUMN IF EXISTS type;
    `);

    // Drop the now-unused enum type if nothing else references it
    await queryRunner.query(`
      DROP TYPE IF EXISTS fnb_order_type_enum;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE fnb_order_type_enum AS ENUM ('PRE_ORDER', 'ON_SITE');
    `);
    await queryRunner.query(`
      ALTER TABLE fnb_orders ADD COLUMN type fnb_order_type_enum;
    `);
    await queryRunner.query(`
      UPDATE fnb_orders SET type = order_type::fnb_order_type_enum;
    `);
    await queryRunner.query(`
      ALTER TABLE fnb_orders ALTER COLUMN type SET NOT NULL;
    `);
    await queryRunner.query(`
      ALTER TABLE fnb_orders ALTER COLUMN order_type DROP NOT NULL;
    `);
  }
}
