import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixFnbOrderItemsDropLegacyOrderIdColumn1751000000001 implements MigrationInterface {
  name = 'FixFnbOrderItemsDropLegacyOrderIdColumn1751000000001';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Backfill fnb_order_id from order_id for any rows that slipped through if column exists
    const hasOrderIdColumn = await queryRunner.hasColumn('fnb_order_items', 'order_id');
    if (hasOrderIdColumn) {
      await queryRunner.query(`
        UPDATE fnb_order_items SET fnb_order_id = order_id WHERE fnb_order_id IS NULL AND order_id IS NOT NULL;
      `);
    }

    // Make fnb_order_id NOT NULL now that all rows are backfilled
    await queryRunner.query(`
      ALTER TABLE fnb_order_items ALTER COLUMN fnb_order_id SET NOT NULL;
    `);

    // Drop the legacy order_id column — entity uses fnb_order_id
    await queryRunner.query(`
      ALTER TABLE fnb_order_items DROP COLUMN IF EXISTS order_id;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE fnb_order_items ADD COLUMN order_id uuid;
    `);
    await queryRunner.query(`
      UPDATE fnb_order_items SET order_id = fnb_order_id;
    `);
    await queryRunner.query(`
      ALTER TABLE fnb_order_items ALTER COLUMN order_id SET NOT NULL;
    `);
    await queryRunner.query(`
      ALTER TABLE fnb_order_items ALTER COLUMN fnb_order_id DROP NOT NULL;
    `);
  }
}
