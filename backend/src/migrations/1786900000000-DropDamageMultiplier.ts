import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Gỡ hệ số đền bù hư hỏng khỏi cơ sở dữ liệu.
 *
 * Hai cột này chưa bao giờ tham gia tính tiền. Số tiền hư hỏng luôn là tổng giá
 * linh kiện cộng công thợ do nhân viên nhập ở biên bản trả xe:
 *
 *   damage_charge = Σ (damage_line_items.parts_price + labor_price)
 *
 *   vehicle_catalogs.damage_multiplier          provider nhập vào rồi để đó
 *   booking_vehicles.damage_multiplier_snapshot chép lại lúc đặt lịch, không ai đọc
 *
 * Giữ chúng lại chỉ tạo ra một con số trông như có thẩm quyền về tiền bạc mà
 * thực tế không ảnh hưởng gì — đúng loại nhầm lẫn dễ dẫn tới tranh cãi với khách.
 *
 * Dữ liệu mất đi khi lùi migration: bản lùi dựng lại cột với mặc định 1.00, không
 * khôi phục được hệ số cũ. Chấp nhận được vì không con số nào từng được dùng.
 */
export class DropDamageMultiplier1786900000000 implements MigrationInterface {
  name = 'DropDamageMultiplier1786900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "booking_vehicles" DROP COLUMN IF EXISTS "damage_multiplier_snapshot"`,
    );
    await queryRunner.query(
      `ALTER TABLE "vehicle_catalogs" DROP COLUMN IF EXISTS "damage_multiplier"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "vehicle_catalogs"
      ADD COLUMN IF NOT EXISTS "damage_multiplier" NUMERIC(4,2) NOT NULL DEFAULT 1.00
    `);
    await queryRunner.query(`
      ALTER TABLE "booking_vehicles"
      ADD COLUMN IF NOT EXISTS "damage_multiplier_snapshot" NUMERIC(4,2) NOT NULL DEFAULT 1.00
    `);
  }
}
