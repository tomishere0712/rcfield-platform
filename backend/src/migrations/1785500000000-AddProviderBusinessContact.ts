import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Mã số thuế và email liên hệ của doanh nghiệp.
 *
 * Trang hồ sơ provider đang bày hai ô này nhưng không có cột nào chứa: giá trị
 * hiện ra là chuỗi cắm cứng trong code, giống hệt nhau ở mọi tài khoản, và nút
 * "Lưu" chỉ ghi vào localStorage rồi báo thành công.
 *
 * Cột để NULL được vì hồ sơ đăng ký từ trước không có hai thông tin này; phía
 * API thì bắt buộc với mọi đăng ký mới, nên chỉ dữ liệu cũ mới trống.
 */
export class AddProviderBusinessContact1785500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE provider_profiles
        ADD COLUMN IF NOT EXISTS tax_code       VARCHAR(20) NULL,
        ADD COLUMN IF NOT EXISTS business_email VARCHAR(255) NULL;
    `);

    // Mã số thuế Việt Nam là duy nhất theo doanh nghiệp. Chỉ soi các hồ sơ chưa
    // xoá và có khai, để hồ sơ cũ bỏ trống không đụng nhau.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_profiles_tax_code
        ON provider_profiles(tax_code)
        WHERE tax_code IS NOT NULL AND deleted_at IS NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_provider_profiles_tax_code;`);
    await queryRunner.query(`
      ALTER TABLE provider_profiles
        DROP COLUMN IF EXISTS tax_code,
        DROP COLUMN IF EXISTS business_email;
    `);
  }
}
