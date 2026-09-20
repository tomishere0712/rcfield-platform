import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Makes F&B items sellable in optional choices (size M/L, drink type, ...).
 * Existing items remain fixed-price because no variant row is created for them.
 */
export class MenuItemVariants1784600000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "menu_item_variants" (
        "id"            UUID NOT NULL DEFAULT gen_random_uuid(),
        "menu_item_id"  UUID NOT NULL,
        "name"          VARCHAR(80) NOT NULL,
        "price"         NUMERIC(15,2) NOT NULL CHECK ("price" >= 0),
        "display_order" INT NOT NULL DEFAULT 0,
        "is_available"  BOOLEAN NOT NULL DEFAULT TRUE,
        "created_at"    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_menu_item_variants" PRIMARY KEY ("id"),
        CONSTRAINT "FK_menu_item_variants_item"
          FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_menu_item_variants_item_name"
      ON "menu_item_variants" ("menu_item_id", lower(btrim("name")))
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_menu_item_variants_item_order" ON "menu_item_variants" ("menu_item_id", "display_order")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_menu_item_variants_item_available" ON "menu_item_variants" ("menu_item_id", "is_available")`,
    );

    await queryRunner.query(`
      ALTER TABLE "menu_item_components"
        ADD COLUMN "variant_id" UUID NULL,
        ADD CONSTRAINT "FK_menu_item_components_variant"
          FOREIGN KEY ("variant_id") REFERENCES "menu_item_variants"("id") ON DELETE SET NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "fnb_order_items"
        ADD COLUMN "menu_item_variant_id" UUID NULL,
        ADD COLUMN "variant_name_snapshot" VARCHAR(80) NULL,
        ADD CONSTRAINT "FK_fnb_order_items_variant"
          FOREIGN KEY ("menu_item_variant_id") REFERENCES "menu_item_variants"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_fnb_order_items_variant_id" ON "fnb_order_items" ("menu_item_variant_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_fnb_order_items_variant_id"`);
    await queryRunner.query(
      `ALTER TABLE "fnb_order_items" DROP CONSTRAINT "FK_fnb_order_items_variant"`,
    );
    await queryRunner.query(`ALTER TABLE "fnb_order_items" DROP COLUMN "variant_name_snapshot"`);
    await queryRunner.query(`ALTER TABLE "fnb_order_items" DROP COLUMN "menu_item_variant_id"`);
    await queryRunner.query(
      `ALTER TABLE "menu_item_components" DROP CONSTRAINT "FK_menu_item_components_variant"`,
    );
    await queryRunner.query(`ALTER TABLE "menu_item_components" DROP COLUMN "variant_id"`);
    await queryRunner.query(`DROP TABLE "menu_item_variants"`);
  }
}
