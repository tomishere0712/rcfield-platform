import { MigrationInterface, QueryRunner } from 'typeorm';

export class FnbCategoryEnumAndCombo1751300000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "fnb_category_enum" AS ENUM ('FOOD', 'DRINK', 'SNACK', 'DESSERT', 'COMBO', 'OTHER')`,
    );

    await queryRunner.query(
      `ALTER TABLE "menu_items" ADD COLUMN "is_combo" BOOLEAN NOT NULL DEFAULT FALSE`,
    );

    // Map existing free-text values to enum, unknown values → OTHER, NULL stays NULL
    await queryRunner.query(`
      ALTER TABLE "menu_items"
        ALTER COLUMN "category" TYPE "fnb_category_enum"
        USING CASE
          WHEN category ILIKE '%ăn%' OR category ILIKE '%food%' THEN 'FOOD'::"fnb_category_enum"
          WHEN category ILIKE '%uống%' OR category ILIKE '%drink%' THEN 'DRINK'::"fnb_category_enum"
          WHEN category ILIKE '%vặt%' OR category ILIKE '%snack%' THEN 'SNACK'::"fnb_category_enum"
          WHEN category ILIKE '%tráng%' OR category ILIKE '%dessert%' THEN 'DESSERT'::"fnb_category_enum"
          WHEN category ILIKE '%combo%' THEN 'COMBO'::"fnb_category_enum"
          WHEN category IS NULL THEN NULL
          ELSE 'OTHER'::"fnb_category_enum"
        END
    `);

    await queryRunner.query(`
      CREATE TABLE "menu_item_components" (
        "id" UUID NOT NULL DEFAULT gen_random_uuid(),
        "combo_id" UUID NOT NULL,
        "item_id" UUID NOT NULL,
        "quantity" SMALLINT NOT NULL DEFAULT 1,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_menu_item_components" PRIMARY KEY ("id"),
        CONSTRAINT "FK_mic_combo" FOREIGN KEY ("combo_id") REFERENCES "menu_items"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_mic_item" FOREIGN KEY ("item_id") REFERENCES "menu_items"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_mic_combo_id" ON "menu_item_components" ("combo_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "menu_item_components"`);
    await queryRunner.query(
      `ALTER TABLE "menu_items" ALTER COLUMN "category" TYPE VARCHAR(100) USING category::text`,
    );
    await queryRunner.query(`ALTER TABLE "menu_items" DROP COLUMN "is_combo"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "fnb_category_enum"`);
  }
}
