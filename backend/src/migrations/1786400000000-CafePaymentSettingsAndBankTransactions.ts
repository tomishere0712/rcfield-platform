import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Nhận tiền booking vào tài khoản ngân hàng của từng chi nhánh.
 *
 * Ba thay đổi:
 *
 * 1. `cafe_payment_settings` — tài khoản nhận tiền của một chi nhánh. Tách bảng
 *    riêng thay vì nhét cột vào `cafes` vì `cafes` là bảng đọc nhiều nhất hệ
 *    thống (mọi trang công khai), còn dữ liệu ngân hàng cần vòng đời riêng và
 *    chỗ dành sẵn cho khoá API dịch vụ đối soát đã mã hoá.
 *
 * 2. `bank_transactions` — sổ đối soát với sao kê ngân hàng. Ghi MỌI khoản tiền
 *    được báo về, kể cả khoản không khớp booking nào; không có bảng này thì mọi
 *    giao dịch lệch biến mất không dấu vết.
 *
 * 3. `payment_transactions.payment_ref_code` — mã tham chiếu ngắn nhúng vào nội
 *    dung chuyển khoản. Cố ý đặt trên transaction chứ KHÔNG trên booking:
 *    `createCheckoutUrl` đã tạo transaction mới và giết transaction cũ mỗi lần
 *    khách đổi phương thức, nên gắn mã ở đây thì một mã QR cũ tự hết hiệu lực.
 *    Gắn ở booking thì mã sống dai hơn phiên thanh toán và khách bị thu hai lần.
 *
 * Cố ý KHÔNG dùng native enum của Postgres cho `method`/`match_status`/
 * `match_reason` — thêm giá trị vào enum đòi `ALTER TYPE`, không chạy chung
 * transaction với DDL khác, và mọi câu chèn thô đều phải ép kiểu tường minh.
 */
export class CafePaymentSettingsAndBankTransactions1786400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS cafe_payment_settings (
        id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        cafe_id        UUID NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
        method         VARCHAR(20) NOT NULL DEFAULT 'VNPAY',
        bank_code      VARCHAR(20),
        bank_bin       VARCHAR(10),
        account_number VARCHAR(32),
        account_name   VARCHAR(160),
        is_verified    BOOLEAN NOT NULL DEFAULT FALSE,
        verified_at    TIMESTAMPTZ,
        verified_by    UUID REFERENCES users(id),
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at     TIMESTAMPTZ,
        CONSTRAINT chk_cafe_payment_settings_method
          CHECK (method IN ('VNPAY','BANK_TRANSFER')),
        CONSTRAINT chk_cafe_payment_settings_bank_details
          CHECK (
            method <> 'BANK_TRANSFER'
            OR (bank_bin IS NOT NULL
                AND account_number IS NOT NULL
                AND account_name IS NOT NULL)
          ),
        CONSTRAINT chk_cafe_payment_settings_verified
          CHECK (is_verified = FALSE OR verified_at IS NOT NULL)
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS ux_cafe_payment_settings_cafe
        ON cafe_payment_settings (cafe_id)
        WHERE deleted_at IS NULL
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS bank_transactions (
        id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        gateway                VARCHAR(20) NOT NULL,
        external_id            VARCHAR(100) NOT NULL,
        cafe_id                UUID REFERENCES cafes(id) ON DELETE SET NULL,
        payment_transaction_id UUID REFERENCES payment_transactions(id) ON DELETE SET NULL,
        account_number         VARCHAR(32) NOT NULL,
        amount                 NUMERIC(15,2) NOT NULL,
        content                TEXT NOT NULL,
        ref_code               VARCHAR(16),
        transaction_date       TIMESTAMPTZ NOT NULL,
        match_status           VARCHAR(20) NOT NULL,
        match_reason           VARCHAR(32),
        raw_payload            JSONB NOT NULL,
        resolved_by            UUID REFERENCES users(id),
        resolved_at            TIMESTAMPTZ,
        resolution_note        TEXT,
        created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at             TIMESTAMPTZ,
        CONSTRAINT chk_bank_transactions_amount CHECK (amount > 0),
        CONSTRAINT chk_bank_transactions_status
          CHECK (match_status IN ('MATCHED','NEEDS_REVIEW','IGNORED')),
        CONSTRAINT chk_bank_transactions_matched_has_tx
          CHECK (match_status <> 'MATCHED' OR payment_transaction_id IS NOT NULL)
      )
    `);

    // Chống ghi nhận trùng: dịch vụ đối soát gửi lại cùng một giao dịch nhiều
    // lần là hành vi bình thường, không phải lỗi.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS ux_bank_transactions_external
        ON bank_transactions (gateway, external_id)
        WHERE deleted_at IS NULL
    `);

    // Hàng đợi xử lý của nhân viên. Vị từ của index phải khớp đúng vị từ câu
    // truy vấn, nếu không Postgres bỏ qua index — đúng lỗi đã gặp ở track_configs.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS ix_bank_transactions_review
        ON bank_transactions (cafe_id, created_at DESC)
        WHERE deleted_at IS NULL AND match_status = 'NEEDS_REVIEW'
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS ix_bank_transactions_cafe
        ON bank_transactions (cafe_id, transaction_date DESC)
        WHERE deleted_at IS NULL
    `);

    await queryRunner.query(`
      ALTER TABLE payment_transactions
        ADD COLUMN IF NOT EXISTS payment_ref_code VARCHAR(16)
    `);

    // Không backfill: giao dịch cũ thuộc luồng VNPay, không cần mã tham chiếu.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS ux_payment_transactions_ref_code
        ON payment_transactions (payment_ref_code)
        WHERE payment_ref_code IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS ux_payment_transactions_ref_code`);
    await queryRunner.query(
      `ALTER TABLE payment_transactions DROP COLUMN IF EXISTS payment_ref_code`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS ix_bank_transactions_cafe`);
    await queryRunner.query(`DROP INDEX IF EXISTS ix_bank_transactions_review`);
    await queryRunner.query(`DROP INDEX IF EXISTS ux_bank_transactions_external`);
    await queryRunner.query(`DROP TABLE IF EXISTS bank_transactions`);
    await queryRunner.query(`DROP INDEX IF EXISTS ux_cafe_payment_settings_cafe`);
    await queryRunner.query(`DROP TABLE IF EXISTS cafe_payment_settings`);
  }
}
