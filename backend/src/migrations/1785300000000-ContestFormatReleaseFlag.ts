import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tách "còn trong catalog" khỏi "đã dùng được".
 *
 * `is_active` chỉ trả lời được một câu: có hiện trong danh sách hay không. Nhưng
 * ba thể thức đang bày ra cho provider chọn thì mới KNOCKOUT chạy trọn luồng;
 * TIME_TRIAL và QUALIFYING_FINAL còn dở. Tắt `is_active` thì hai thể thức kia
 * biến mất hẳn, provider không biết chúng đang được làm; để nguyên thì provider
 * trả phí tổ chức xong mới phát hiện chế độ mình chọn chưa xong việc.
 *
 * Nên thêm một cột riêng: vẫn hiện trong catalog, kèm nhãn "Sắp có", nhưng không
 * chọn để tạo giải được. Mặc định `true` để mọi thể thức có sẵn giữ nguyên hành
 * vi; chỉ hai thể thức chưa xong bị hạ xuống.
 */
export class ContestFormatReleaseFlag1785300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE contest_formats
        ADD COLUMN IF NOT EXISTS is_released BOOLEAN NOT NULL DEFAULT TRUE;
    `);

    await queryRunner.query(`
      UPDATE contest_formats
         SET is_released = FALSE, updated_at = NOW()
       WHERE code IN ('TIME_TRIAL', 'QUALIFYING_FINAL');
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE contest_formats
        DROP COLUMN IF EXISTS is_released;
    `);
  }
}
