import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bản chụp thông tin lấy từ Cục Thuế khi tra mã số thuế lúc đăng ký.
 *
 * Lưu lại chứ không tra lại mỗi lần hiển thị: dữ liệu Cục Thuế đổi theo thời
 * gian, còn hồ sơ cần giữ đúng thứ đã dùng để xét duyệt. `tax_verified_at`
 * NULL nghĩa là chưa xác minh được — admin nhìn vào đó để soi kỹ khi duyệt KYC.
 */
export class AddProviderTaxVerification1785600000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE provider_profiles
        ADD COLUMN IF NOT EXISTS business_legal_name VARCHAR(255) NULL,
        ADD COLUMN IF NOT EXISTS business_address    TEXT NULL,
        ADD COLUMN IF NOT EXISTS tax_status          VARCHAR(255) NULL,
        ADD COLUMN IF NOT EXISTS tax_verified_at     TIMESTAMPTZ NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE provider_profiles
        DROP COLUMN IF EXISTS business_legal_name,
        DROP COLUMN IF EXISTS business_address,
        DROP COLUMN IF EXISTS tax_status,
        DROP COLUMN IF EXISTS tax_verified_at;
    `);
  }
}
