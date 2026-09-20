import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Dịch nốt phần TÊN của catalog contest sang tiếng Việt.
 *
 * Migration 1784900000000 đã dịch mô tả nhưng bỏ sót `name` của contest_types và
 * contest_formats. Hai trường này hiển thị thành chip ngay trên từng thẻ thể thức
 * ở màn tạo giải đấu, nên provider vẫn đọc thấy "Provider Standard", "Time Trial",
 * "Knockout" — đúng những chữ họ không hiểu.
 *
 * "Grand Prix" giữ nguyên: đây là tên riêng của một thể thức đua đã quen thuộc,
 * dịch ra sẽ lạ hơn là để nguyên.
 */
export class ContestCatalogVietnameseNames1785000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE contest_types SET name = 'Giải tiêu chuẩn' WHERE code = 'PROVIDER_STANDARD';
    `);

    await queryRunner.query(`
      UPDATE contest_formats SET name = 'Đua tính giờ' WHERE code = 'TIME_TRIAL';
    `);
    await queryRunner.query(`
      UPDATE contest_formats SET name = 'Đấu loại trực tiếp' WHERE code = 'KNOCKOUT';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE contest_types SET name = 'Provider Standard' WHERE code = 'PROVIDER_STANDARD';
    `);
    await queryRunner.query(`
      UPDATE contest_formats SET name = 'Time Trial' WHERE code = 'TIME_TRIAL';
    `);
    await queryRunner.query(`
      UPDATE contest_formats SET name = 'Knockout' WHERE code = 'KNOCKOUT';
    `);
  }
}
