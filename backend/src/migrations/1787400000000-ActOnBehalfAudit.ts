import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ghi lại việc nhân viên thao tác THAY cho khách.
 *
 * ── Vì sao cần cột mới ──────────────────────────────────────────────────────
 *
 * Khách dùng tài khoản mềm (đặt qua Facebook, khách vãng lai) không đăng nhập
 * được, nên nhân viên phải bấm hộ ở hai chỗ: duyệt gia hạn và xác nhận biên bản
 * trả xe.
 *
 * `inspections` hiện chỉ có `customer_confirmed` và `customer_confirmed_at` —
 * không có chỗ nào nói AI đã bấm. Ghi vào đó rồi để trống người thực hiện thì
 * bản ghi đọc lên như thể chính khách đã tự ký, mà đó chính là thứ Nguyên tắc
 * III của hiến chương tồn tại để ngăn: biên bản bàn giao phải là bằng chứng
 * chống tranh chấp, và một bằng chứng ghi sai người ký thì tệ hơn không có.
 *
 * Nhật ký chạy KHÔNG thay thế được: nó xoay vòng, không truy vấn được theo
 * phiên, và không ai mang log ra đối chất với khách.
 *
 * `extension_proposals` đã có sẵn `responded_by` nên chỉ cần thêm cờ.
 *
 * Cả ba cột đều nullable / có mặc định, dữ liệu cũ không cần lấp.
 */
export class ActOnBehalfAudit1787400000000 implements MigrationInterface {
  name = 'ActOnBehalfAudit1787400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE inspections
        ADD COLUMN IF NOT EXISTS confirmed_by uuid NULL REFERENCES users(id),
        ADD COLUMN IF NOT EXISTS confirmed_on_behalf boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS on_behalf_reason text NULL
    `);

    await queryRunner.query(`
      ALTER TABLE extension_proposals
        ADD COLUMN IF NOT EXISTS responded_on_behalf boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS on_behalf_reason text NULL
    `);

    // Hàng đợi rà soát: "những lần nhân viên ký hộ" là câu hỏi có thật khi đối
    // chất. Vị từ khớp đúng vị từ câu truy vấn, nếu không Postgres bỏ qua index.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS ix_inspections_on_behalf
        ON inspections (confirmed_by, customer_confirmed_at DESC)
        WHERE confirmed_on_behalf = true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS ix_inspections_on_behalf`);
    await queryRunner.query(`
      ALTER TABLE extension_proposals
        DROP COLUMN IF EXISTS on_behalf_reason,
        DROP COLUMN IF EXISTS responded_on_behalf
    `);
    await queryRunner.query(`
      ALTER TABLE inspections
        DROP COLUMN IF EXISTS on_behalf_reason,
        DROP COLUMN IF EXISTS confirmed_on_behalf,
        DROP COLUMN IF EXISTS confirmed_by
    `);
  }
}
