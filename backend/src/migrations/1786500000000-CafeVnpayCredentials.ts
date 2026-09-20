import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Thông tin cổng VNPay riêng của từng chi nhánh.
 *
 * Đúng mô hình thực tế: mỗi chi nhánh là một điểm bán, có hợp đồng và tài khoản
 * merchant riêng với VNPay, tiền về thẳng tài khoản của họ. Nền tảng không đứng
 * giữa giữ tiền.
 *
 * Để `NULL` nghĩa là chi nhánh chưa khai và sẽ dùng cổng cấp nền tảng — xem
 * `resolveVnpayCredentials`. Đây là đường lui có chủ ý, không phải thiếu sót:
 * ký hợp đồng merchant với VNPay đòi tư cách pháp nhân, nên trong giai đoạn
 * chưa có, mọi chi nhánh chạy chung một cổng sandbox.
 *
 * Khoá ký lưu dạng đã mã hoá, không lưu thô: ai đọc được bảng này mà lấy được
 * `hash_secret` thì ký được giao dịch giả và hệ thống không phân biệt nổi với
 * giao dịch thật.
 */
export class CafeVnpayCredentials1786500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE cafe_payment_settings
        ADD COLUMN IF NOT EXISTS vnpay_tmn_code VARCHAR(32),
        ADD COLUMN IF NOT EXISTS vnpay_hash_secret_encrypted TEXT
    `);

    // Khai một nửa còn nguy hiểm hơn không khai: có mã merchant mà thiếu khoá ký
    // thì mọi giao dịch của chi nhánh đó hỏng ở bước xác thực chữ ký.
    await queryRunner.query(`
      ALTER TABLE cafe_payment_settings
        ADD CONSTRAINT chk_cafe_payment_settings_vnpay_pair
        CHECK (
          (vnpay_tmn_code IS NULL AND vnpay_hash_secret_encrypted IS NULL)
          OR (vnpay_tmn_code IS NOT NULL AND vnpay_hash_secret_encrypted IS NOT NULL)
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE cafe_payment_settings
        DROP CONSTRAINT IF EXISTS chk_cafe_payment_settings_vnpay_pair
    `);
    await queryRunner.query(`
      ALTER TABLE cafe_payment_settings
        DROP COLUMN IF EXISTS vnpay_hash_secret_encrypted,
        DROP COLUMN IF EXISTS vnpay_tmn_code
    `);
  }
}
