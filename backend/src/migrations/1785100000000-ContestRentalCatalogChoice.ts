import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * VĐV thuê xe chọn DÒNG XE lúc đăng ký, không còn chọn khung giờ.
 *
 * Trước đây đăng ký thuê xe tạo luôn một booking thật với slot do khách tự chọn,
 * nên tiền được tính bằng giá giờ × số giờ khách chọn — hai người cùng một giải
 * trả khác nhau, và giải vừa khoá tài nguyên vừa tự tạo booking đè lên chính chỗ
 * đã khoá.
 *
 * Nay đăng ký chỉ ghi nhận dòng xe khách muốn mượn (giữ chỗ theo số xe có thật);
 * chiếc xe cụ thể và phiếu mượn xe 0đ được tạo lúc check-in khi nhân viên giao xe.
 */
export class ContestRentalCatalogChoice1785100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE contest_registrations
        ADD COLUMN IF NOT EXISTS rental_catalog_id UUID NULL REFERENCES vehicle_catalogs(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS rental_cafe_id UUID NULL REFERENCES cafes(id) ON DELETE SET NULL;
    `);

    // Đếm suất còn lại của từng dòng xe khi có người đăng ký là truy vấn nóng
    // nhất của luồng đăng ký thuê xe.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_contest_registrations_rental_catalog
        ON contest_registrations(contest_id, rental_catalog_id)
        WHERE rental_catalog_id IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_contest_registrations_rental_catalog;
    `);
    await queryRunner.query(`
      ALTER TABLE contest_registrations
        DROP COLUMN IF EXISTS rental_catalog_id,
        DROP COLUMN IF EXISTS rental_cafe_id;
    `);
  }
}
