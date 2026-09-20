import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Mở nốt hai thể thức còn lại sau khi đã sửa xong phần vận hành.
 *
 * Chúng bị hạ xuống "Sắp có" ở migration 1785300000000 vì đang dở: đua tính giờ
 * chỉ cho mỗi VĐV đúng một lượt, và cả hai đều gắn "người thắng" cho một lượt
 * chạy một mình. Riêng vòng loại + chung kết còn cho người chưa hoàn thành lượt
 * nào lọt vào chung kết, và sinh nhầm nhánh chung kết thì không có đường sửa.
 *
 * Nay đã xử lý xong nên trả cả hai về trạng thái dùng được.
 */
export class ReleaseRemainingContestFormats1785400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE contest_formats
         SET is_released = TRUE, updated_at = NOW()
       WHERE code IN ('TIME_TRIAL', 'QUALIFYING_FINAL');
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE contest_formats
         SET is_released = FALSE, updated_at = NOW()
       WHERE code IN ('TIME_TRIAL', 'QUALIFYING_FINAL');
    `);
  }
}
