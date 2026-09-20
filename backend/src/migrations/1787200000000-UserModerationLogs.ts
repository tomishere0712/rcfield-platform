import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Nhật ký admin khoá / mở khoá tài khoản người dùng.
 *
 * Khoá một tài khoản là chặn người ta dùng dịch vụ, nên phải trả lời được ba
 * câu: ai khoá, khoá lúc nào, vì lý do gì. `users.is_active` chỉ giữ được trạng
 * thái hiện tại — bật lại là mọi dấu vết biến mất, và tháng sau không ai dựng
 * lại được vì sao tài khoản đó từng bị khoá.
 *
 * Không dùng `contest_audit_logs`: bảng đó gắn cứng vào một giải đấu
 * (`contest_id NOT NULL`), còn việc khoá tài khoản chẳng thuộc giải nào.
 */
export class UserModerationLogs1787200000000 implements MigrationInterface {
  name = 'UserModerationLogs1787200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_moderation_logs" (
        "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id"     uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "actor_id"    uuid NOT NULL REFERENCES "users"("id"),
        "action"      varchar(32) NOT NULL,
        "reason"      text NOT NULL,
        "metadata"    jsonb NOT NULL DEFAULT '{}'::jsonb,
        "created_at"  timestamptz NOT NULL DEFAULT NOW()
      )
    `);

    // Truy vấn duy nhất của màn hình chi tiết: lịch sử của MỘT người, mới nhất
    // trước. Chỉ mục theo đúng thứ tự đó nên không phải sắp xếp lại.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_user_moderation_logs_user"
      ON "user_moderation_logs" ("user_id", "created_at" DESC)
    `);

    // Không xoá dòng nào: nhật ký mà sửa được thì không còn là nhật ký. Ghi đè
    // hay xoá lịch sử kỷ luật là đúng thứ cần chặn ở tầng cơ sở dữ liệu.
    await queryRunner.query(`
      ALTER TABLE "user_moderation_logs"
      ADD CONSTRAINT "chk_user_moderation_action"
      CHECK ("action" IN ('LOCK', 'UNLOCK'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "user_moderation_logs"`);
  }
}
