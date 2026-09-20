import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sổ thu chi của giải đấu + phương thức thu lệ phí.
 *
 * Trước đây provider không có chỗ nào ghi tiền ra vào của một giải: chỉ có mức
 * lệ phí trên từng đăng ký, không có endpoint nào cộng lại, và không có bảng
 * nào cho khoản chi.
 *
 * Cố ý KHÔNG dùng native enum của Postgres cho `direction`/`category`: thêm giá
 * trị vào enum đòi `ALTER TYPE`, thao tác không chạy chung transaction với DDL
 * khác. Ràng buộc tập giá trị giữ ở tầng zod.
 */
export class ContestLedgerAndEntryFeeMethod1786300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS contest_ledger_entries (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        contest_id      UUID NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
        direction       VARCHAR(3)  NOT NULL,
        category        VARCHAR(30) NOT NULL,
        title           VARCHAR(255) NOT NULL,
        amount          NUMERIC(15,2) NOT NULL,
        occurred_at     TIMESTAMPTZ NOT NULL,
        note            TEXT,
        receipt_url     TEXT,
        created_by      UUID NOT NULL REFERENCES users(id),
        created_by_role VARCHAR(30) NOT NULL,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at      TIMESTAMPTZ,

        CONSTRAINT chk_contest_ledger_amount_positive CHECK (amount > 0),
        CONSTRAINT chk_contest_ledger_direction CHECK (direction IN ('IN','OUT'))
      )
    `);

    // Cả ba index đều lọc bản ghi chưa xoá, vì mọi truy vấn của tính năng đều
    // bỏ qua bút toán đã xoá mềm.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_contest_ledger_contest
        ON contest_ledger_entries(contest_id) WHERE deleted_at IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_contest_ledger_contest_direction
        ON contest_ledger_entries(contest_id, direction) WHERE deleted_at IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_contest_ledger_creator
        ON contest_ledger_entries(contest_id, created_by) WHERE deleted_at IS NULL
    `);

    // Nullable, không backfill: không có cách nào suy ngược phương thức của các
    // khoản đã thu trước đây, và gán bừa còn tệ hơn để trống.
    await queryRunner.query(`
      ALTER TABLE contest_registrations
        ADD COLUMN IF NOT EXISTS entry_fee_payment_method VARCHAR(20)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE contest_registrations DROP COLUMN IF EXISTS entry_fee_payment_method`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS contest_ledger_entries CASCADE`);
  }
}
