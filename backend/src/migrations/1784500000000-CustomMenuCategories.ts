import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Thay danh mục F&B cố định (Postgres enum `fnb_category_enum`) bằng bảng
 * `menu_categories` do Provider tự quản lý cho từng chi nhánh.
 *
 * ⚠️ KHÔNG chuyển đổi dữ liệu phân loại cũ — toàn bộ món hiện có sẽ về
 * "Chưa phân loại" (`category_id IS NULL`). Đây là quyết định nghiệp vụ đã chốt,
 * xem specs/017-custom-menu-categories/spec.md mục Clarifications.
 * Hệ quả: `down()` KHÔNG khôi phục được phân loại cũ.
 */
export class CustomMenuCategories1784500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Bảng danh mục, thuộc về từng chi nhánh
    await queryRunner.query(`
      CREATE TABLE "menu_categories" (
        "id"            UUID NOT NULL DEFAULT gen_random_uuid(),
        "cafe_id"       UUID NOT NULL,
        "name"          VARCHAR(50) NOT NULL,
        "display_order" INT NOT NULL DEFAULT 0,
        "created_at"    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at"    TIMESTAMP WITH TIME ZONE NULL,
        CONSTRAINT "PK_menu_categories" PRIMARY KEY ("id"),
        CONSTRAINT "FK_menu_categories_cafe"
          FOREIGN KEY ("cafe_id") REFERENCES "cafes"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_menu_categories_cafe_id" ON "menu_categories" ("cafe_id")`,
    );

    // Trùng tên chỉ xét trên bản ghi CHƯA xóa mềm — nếu thiếu mệnh đề WHERE,
    // Provider sẽ không tạo lại được danh mục vừa xóa cùng tên (FR-006).
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_menu_categories_cafe_name"
        ON "menu_categories" ("cafe_id", lower(btrim("name")))
        WHERE "deleted_at" IS NULL
    `);

    // 2. Khóa ngoại trên menu_items.
    // ON DELETE RESTRICT chỉ chặn DELETE thật (script dọn dữ liệu, sửa tay DB).
    // Nó KHÔNG thực thi FR-015 vì xóa danh mục là xóa mềm (UPDATE deleted_at) —
    // việc chặn xóa danh mục còn món hoàn toàn nằm ở menu-category.service.
    await queryRunner.query(`
      ALTER TABLE "menu_items"
        ADD COLUMN "category_id" UUID NULL,
        ADD CONSTRAINT "FK_menu_items_category"
          FOREIGN KEY ("category_id") REFERENCES "menu_categories"("id")
          ON DELETE RESTRICT
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_menu_items_category_id" ON "menu_items" ("category_id")`,
    );

    // 3. Bỏ cột enum cũ — không map dữ liệu (FR-025)
    await queryRunner.query(`ALTER TABLE "menu_items" DROP COLUMN "category"`);

    // 4. Bỏ type enum. An toàn vì chỉ menu_items.category tham chiếu nó.
    await queryRunner.query(`DROP TYPE IF EXISTS "fnb_category_enum"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // ⚠️ Rollback tạo lại cột `category` với toàn bộ giá trị NULL và xóa mọi
    // danh mục Provider đã tạo. Phân loại cũ KHÔNG được khôi phục.
    await queryRunner.query(
      `CREATE TYPE "fnb_category_enum" AS ENUM ('FOOD', 'DRINK', 'SNACK', 'DESSERT', 'COMBO', 'OTHER')`,
    );
    await queryRunner.query(
      `ALTER TABLE "menu_items" ADD COLUMN "category" "fnb_category_enum" NULL`,
    );
    await queryRunner.query(`ALTER TABLE "menu_items" DROP CONSTRAINT "FK_menu_items_category"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_menu_items_category_id"`);
    await queryRunner.query(`ALTER TABLE "menu_items" DROP COLUMN "category_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "menu_categories"`);
  }
}
