import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phí tổ chức giải — nguồn thu tách hẳn khỏi gói thuê bao SaaS.
 *
 * Provider chọn một gói cho TỪNG giải, chuyển khoản rồi admin đối soát. Trả
 * xong mới mở đăng ký được. Gói có kèm ngày quảng bá thì sau khi duyệt phí sẽ
 * sinh một suất hiển thị ở trạng thái CHỜ DUYỆT NỘI DUNG — admin xem ảnh và
 * tiêu đề rồi mới cho lên trang chủ.
 */
export class ContestFeePlans1785200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS contest_fee_plans (
        id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        code           varchar(40) NOT NULL UNIQUE,
        name           varchar(120) NOT NULL,
        description    text,
        price          numeric(12,2) NOT NULL,
        featured_days  integer NOT NULL DEFAULT 0,
        display_order  integer NOT NULL DEFAULT 0,
        is_active      boolean NOT NULL DEFAULT TRUE,
        created_at     timestamptz NOT NULL DEFAULT now(),
        updated_at     timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE contest_fee_order_status_enum AS ENUM
          ('PENDING_PAYMENT', 'PENDING_REVIEW', 'PAID', 'REJECTED', 'CANCELLED');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS contest_fee_orders (
        id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        contest_id         uuid NOT NULL REFERENCES contests(id),
        provider_id        uuid NOT NULL REFERENCES users(id),
        plan_id            uuid NOT NULL REFERENCES contest_fee_plans(id),
        status             contest_fee_order_status_enum NOT NULL DEFAULT 'PENDING_PAYMENT',
        -- Chốt giá và số ngày quảng bá tại thời điểm đặt: đổi bảng giá về sau
        -- không được làm thay đổi đơn đã trả.
        amount             numeric(12,2) NOT NULL,
        featured_days      integer NOT NULL DEFAULT 0,
        transfer_reference varchar(255),
        transfer_date      date,
        transfer_amount    numeric(12,2),
        admin_notes        text,
        reviewed_by        uuid REFERENCES users(id),
        reviewed_at        timestamptz,
        created_at         timestamptz NOT NULL DEFAULT now(),
        updated_at         timestamptz NOT NULL DEFAULT now()
      );
    `);

    // Mỗi giải chỉ có một đơn còn hiệu lực; đơn bị từ chối hoặc huỷ thì đặt lại
    // được, nên chỉ số bỏ qua hai trạng thái đó.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_contest_fee_orders_active
        ON contest_fee_orders (contest_id)
        WHERE status IN ('PENDING_PAYMENT', 'PENDING_REVIEW', 'PAID');
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_contest_fee_orders_provider
        ON contest_fee_orders (provider_id, status);
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE featured_popup_review_status_enum AS ENUM
          ('PENDING', 'APPROVED', 'REJECTED');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await queryRunner.query(`
      ALTER TABLE featured_popups
        ADD COLUMN IF NOT EXISTS review_status featured_popup_review_status_enum
          NOT NULL DEFAULT 'APPROVED',
        ADD COLUMN IF NOT EXISTS contest_fee_order_id uuid REFERENCES contest_fee_orders(id),
        ADD COLUMN IF NOT EXISTS review_notes text;
    `);

    await queryRunner.query(`
      INSERT INTO contest_fee_plans (code, name, description, price, featured_days, display_order)
      VALUES
        ('BASIC', 'Gói cơ bản',
         'Mở giải và dùng đầy đủ công cụ vận hành: bốc thăm, sơ đồ đấu, điểm danh, bảng xếp hạng.',
         200000, 0, 1),
        ('FEATURED', 'Gói nổi bật',
         'Toàn bộ công cụ của gói cơ bản, kèm 7 ngày hiển thị giải của bạn trên trang chủ RCField.',
         500000, 7, 2)
      ON CONFLICT (code) DO NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE featured_popups
        DROP COLUMN IF EXISTS review_notes,
        DROP COLUMN IF EXISTS contest_fee_order_id,
        DROP COLUMN IF EXISTS review_status;
    `);
    await queryRunner.query(`DROP TYPE IF EXISTS featured_popup_review_status_enum;`);
    await queryRunner.query(`DROP TABLE IF EXISTS contest_fee_orders;`);
    await queryRunner.query(`DROP TYPE IF EXISTS contest_fee_order_status_enum;`);
    await queryRunner.query(`DROP TABLE IF EXISTS contest_fee_plans;`);
  }
}
