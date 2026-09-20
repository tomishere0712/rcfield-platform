import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Gỡ 7 bảng còn sót từ `InitialSchema` và `Phase1Completion` mà sản phẩm hiện tại
 * không còn đi qua: không entity, không service, không endpoint nào đọc hay ghi.
 *
 * Vì sao chúng vô hình cho tới giờ: cả 7 đều không có entity TypeORM, nên đọc
 * `src/models` sẽ không thấy chúng tồn tại. Thứ duy nhất còn chạm vào là seed
 * script — đã gỡ trong cùng thay đổi này.
 *
 * Ba bảng bị thay thế bởi bảng khác chứ không phải bị bỏ:
 *   notification_logs  → notifications
 *   promotion_usages   → promotions (đếm lượt dùng ngay trên bảng chính)
 *   package_usages     → customer_packages
 *
 * `disputes`, `incidents`, `trust_score_logs`, `cafe_announcements` là tính năng
 * từng phác thảo trong schema đầu nhưng chưa bao giờ nối vào luồng nghiệp vụ.
 *
 * KHÔNG gộp nhóm `subscriptions` và `customer_vehicles` vào đây: hai bảng đó còn
 * khoá ngoại từ bảng đang sống trỏ tới, và `customer_vehicles` vẫn lộ ra ngoài
 * API qua `contest/payload.ts`. Bỏ chúng là đổi hợp đồng API, phải tách riêng.
 */
export class DropUnusedOperationalTables1786600000000 implements MigrationInterface {
  private static readonly TABLES = [
    'cafe_announcements',
    'notification_logs',
    'package_usages',
    'promotion_usages',
    'disputes',
    'incidents',
    'trust_score_logs',
  ];

  /** Các enum type chỉ 7 bảng trên dùng — không bảng nào khác tham chiếu. */
  private static readonly ENUMS = [
    'dispute_favor_enum',
    'dispute_status_enum',
    'incident_status_enum',
    'incident_type_enum',
    'notification_channel_enum',
    'notification_status_enum',
    'responsible_party_enum',
    'trust_score_reason_enum',
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Chốt chặn có chủ ý: `DB_AUTO_MIGRATE` mặc định bật, nên migration này chạy
    // không người trông khi deploy. Nếu môi trường nào đó thật sự có dữ liệu
    // trong 7 bảng này thì giả định "đã chết" của ta sai — dừng deploy để người
    // đọc log còn kịp biết, thay vì xoá âm thầm.
    const nonEmpty: string[] = [];
    for (const table of DropUnusedOperationalTables1786600000000.TABLES) {
      const exists = await queryRunner.hasTable(table);
      if (!exists) continue;
      const [{ count }] = await queryRunner.query(`SELECT COUNT(*)::int AS count FROM "${table}"`);
      if (count > 0) nonEmpty.push(`${table} (${count} dòng)`);
    }

    if (nonEmpty.length > 0) {
      throw new Error(
        `Huỷ bỏ migration: các bảng lẽ ra phải rỗng nhưng đang có dữ liệu — ${nonEmpty.join(', ')}. ` +
          `Kiểm tra lại trước khi xoá; nếu dữ liệu đó bỏ được thì xoá tay rồi chạy lại migration.`,
      );
    }

    for (const table of DropUnusedOperationalTables1786600000000.TABLES) {
      await queryRunner.query(`DROP TABLE IF EXISTS "${table}"`);
    }

    for (const type of DropUnusedOperationalTables1786600000000.ENUMS) {
      await queryRunner.query(`DROP TYPE IF EXISTS "${type}"`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "dispute_favor_enum" AS ENUM ('CUSTOMER', 'PROVIDER')`);
    await queryRunner.query(
      `CREATE TYPE "dispute_status_enum" AS ENUM ('OPEN', 'UNDER_REVIEW', 'RESOLVED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "incident_status_enum" AS ENUM ('RECORDED', 'REVIEWED', 'RESOLVED', 'WAIVED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "incident_type_enum" AS ENUM ('RENTAL_DAMAGE', 'BYOC_DAMAGE', 'COLLISION', 'LOST_ACCESSORY', 'STAFF_HANDLING', 'FACILITY', 'OTHER')`,
    );
    await queryRunner.query(
      `CREATE TYPE "notification_channel_enum" AS ENUM ('PUSH', 'SMS', 'EMAIL')`,
    );
    await queryRunner.query(
      `CREATE TYPE "notification_status_enum" AS ENUM ('SENT', 'FAILED', 'PENDING')`,
    );
    await queryRunner.query(
      `CREATE TYPE "responsible_party_enum" AS ENUM ('CUSTOMER', 'PROVIDER', 'STAFF', 'SHARED', 'UNKNOWN')`,
    );
    await queryRunner.query(
      `CREATE TYPE "trust_score_reason_enum" AS ENUM ('NO_SHOW', 'DAMAGE_CONFIRMED', 'BOOKING_STREAK', 'ADMIN_ADJUSTMENT')`,
    );

    await queryRunner.query(`
      CREATE TABLE "cafe_announcements" (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        cafe_id uuid NOT NULL,
        title character varying(255) NOT NULL,
        content text,
        image_url text,
        starts_at timestamptz NOT NULL DEFAULT now(),
        ends_at timestamptz,
        is_active boolean NOT NULL DEFAULT true,
        created_by uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT cafe_announcements_pkey PRIMARY KEY (id),
        CONSTRAINT cafe_announcements_cafe_id_fkey FOREIGN KEY (cafe_id) REFERENCES cafes(id),
        CONSTRAINT cafe_announcements_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_cafe_announcements_cafe_id ON cafe_announcements (cafe_id, is_active, starts_at DESC)`,
    );

    await queryRunner.query(`
      CREATE TABLE "notification_logs" (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL,
        booking_id uuid,
        type character varying(100) NOT NULL,
        channel notification_channel_enum NOT NULL,
        title character varying(255) NOT NULL,
        body text NOT NULL,
        status notification_status_enum NOT NULL DEFAULT 'PENDING',
        error text,
        sent_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        session_id uuid,
        CONSTRAINT notification_logs_pkey PRIMARY KEY (id),
        CONSTRAINT notification_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id),
        CONSTRAINT notification_logs_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES bookings(id),
        CONSTRAINT notification_logs_session_id_fkey FOREIGN KEY (session_id) REFERENCES sessions(id)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_notification_logs_user_id ON notification_logs (user_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_notification_logs_booking_id ON notification_logs (booking_id)`,
    );

    await queryRunner.query(`
      CREATE TABLE "package_usages" (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        customer_package_id uuid NOT NULL,
        booking_id uuid NOT NULL,
        used_slots integer NOT NULL DEFAULT 1,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT package_usages_pkey PRIMARY KEY (id),
        CONSTRAINT package_usages_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES bookings(id)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_package_usages_customer_package_id ON package_usages (customer_package_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_package_usages_booking_id ON package_usages (booking_id)`,
    );

    await queryRunner.query(`
      CREATE TABLE "promotion_usages" (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        promotion_id uuid NOT NULL,
        booking_id uuid NOT NULL,
        user_id uuid NOT NULL,
        discount_amount numeric(15,2) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT promotion_usages_pkey PRIMARY KEY (id),
        CONSTRAINT promotion_usages_booking_id_key UNIQUE (booking_id),
        CONSTRAINT promotion_usages_promotion_id_fkey FOREIGN KEY (promotion_id) REFERENCES promotions(id),
        CONSTRAINT promotion_usages_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES bookings(id),
        CONSTRAINT promotion_usages_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX idx_promotion_usages_booking ON promotion_usages (booking_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_promotion_usages_promotion_id ON promotion_usages (promotion_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_promotion_usages_user_id ON promotion_usages (user_id)`,
    );

    await queryRunner.query(`
      CREATE TABLE "disputes" (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        booking_id uuid NOT NULL,
        opened_by uuid NOT NULL,
        reason text NOT NULL,
        evidence_photos text[] NOT NULL DEFAULT '{}'::text[],
        status dispute_status_enum NOT NULL DEFAULT 'OPEN',
        resolution text,
        resolution_favor dispute_favor_enum,
        resolved_by uuid,
        resolved_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT disputes_pkey PRIMARY KEY (id),
        CONSTRAINT disputes_booking_id_key UNIQUE (booking_id),
        CONSTRAINT disputes_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES bookings(id),
        CONSTRAINT disputes_opened_by_fkey FOREIGN KEY (opened_by) REFERENCES users(id),
        CONSTRAINT disputes_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES users(id)
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX idx_disputes_booking_id ON disputes (booking_id)`);
    await queryRunner.query(`CREATE INDEX idx_disputes_status ON disputes (status)`);

    await queryRunner.query(`
      CREATE TABLE "incidents" (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        session_id uuid NOT NULL,
        reported_by uuid NOT NULL,
        type incident_type_enum NOT NULL,
        status incident_status_enum NOT NULL DEFAULT 'RECORDED',
        occurred_at timestamptz NOT NULL,
        description text NOT NULL,
        estimated_amount numeric(15,2),
        responsible_party responsible_party_enum NOT NULL DEFAULT 'UNKNOWN',
        final_amount numeric(15,2),
        resolution_note text,
        resolved_by uuid,
        resolved_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT incidents_pkey PRIMARY KEY (id),
        CONSTRAINT incidents_session_id_fkey FOREIGN KEY (session_id) REFERENCES sessions(id),
        CONSTRAINT incidents_reported_by_fkey FOREIGN KEY (reported_by) REFERENCES users(id),
        CONSTRAINT incidents_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES users(id)
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_incidents_session_id ON incidents (session_id)`);
    await queryRunner.query(`CREATE INDEX idx_incidents_status ON incidents (status)`);

    await queryRunner.query(`
      CREATE TABLE "trust_score_logs" (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL,
        booking_id uuid,
        delta numeric(5,2) NOT NULL,
        score_before numeric(5,2) NOT NULL,
        score_after numeric(5,2) NOT NULL,
        reason trust_score_reason_enum NOT NULL,
        note text,
        created_by uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        session_id uuid,
        CONSTRAINT trust_score_logs_pkey PRIMARY KEY (id),
        CONSTRAINT trust_score_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id),
        CONSTRAINT trust_score_logs_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES bookings(id),
        CONSTRAINT trust_score_logs_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id),
        CONSTRAINT trust_score_logs_session_id_fkey FOREIGN KEY (session_id) REFERENCES sessions(id)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_trust_score_logs_user_id ON trust_score_logs (user_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_trust_score_logs_booking_id ON trust_score_logs (booking_id)`,
    );
  }
}
