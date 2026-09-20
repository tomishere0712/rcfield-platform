import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Thêm cột lưu mã đơn PayOS cho đơn phí tổ chức giải.
 *
 * Vì sao cột riêng chứ không dùng lại `transfer_reference`: cột cũ giữ mã giao
 * dịch do provider tự gõ khi chuyển khoản tay. Hai cách trả tiền nay chạy song
 * song, nên webhook PayOS phải tra được đúng đơn của mình mà không đụng vào đơn
 * chuyển khoản tay — dùng chung một cột thì không phân biệt được.
 *
 * Chỉ mục là UNIQUE nhưng có điều kiện `IS NOT NULL`: PayOS không được gửi hai
 * lần cùng một mã về hai đơn khác nhau, còn đơn trả tay thì để trống thoải mái.
 */
export class ContestFeeOrderPayosOrderCode1786800000000 implements MigrationInterface {
  name = 'ContestFeeOrderPayosOrderCode1786800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "contest_fee_orders"
      ADD COLUMN IF NOT EXISTS "payos_order_code" character varying(30)
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_contest_fee_orders_payos_order_code"
      ON "contest_fee_orders" ("payos_order_code")
      WHERE "payos_order_code" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_contest_fee_orders_payos_order_code"`);
    await queryRunner.query(
      `ALTER TABLE "contest_fee_orders" DROP COLUMN IF EXISTS "payos_order_code"`,
    );
  }
}
