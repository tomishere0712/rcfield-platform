import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Viết lại mô tả catalog contest bằng tiếng Việt có dấu.
 *
 * Các migration seed trước đó ghi chuỗi không dấu ("Xep hang dua tren best lap...")
 * và những chuỗi này hiển thị thẳng ra màn hình tạo giải đấu cho provider đọc.
 * Nội dung nghiệp vụ không đổi, chỉ sửa phần chữ.
 */
export class ContestCatalogVietnameseText1784900000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE contest_formats SET description = 'Mỗi VĐV chạy một lượt tính giờ riêng, xếp hạng theo lap tốt nhất hoặc tổng thời gian'
      WHERE code = 'TIME_TRIAL';
    `);
    await queryRunner.query(`
      UPDATE contest_formats SET description = 'Đấu loại trực tiếp theo nhánh, người thắng đi tiếp vào vòng sau'
      WHERE code = 'KNOCKOUT';
    `);
    await queryRunner.query(`
      UPDATE contest_formats SET name = 'Vòng loại + Chung kết',
        description = 'Vòng loại tính giờ, top N vào nhánh chung kết đấu loại trực tiếp'
      WHERE code = 'QUALIFYING_FINAL';
    `);

    await queryRunner.query(`
      UPDATE contest_types SET description = 'Giải đấu do provider tự tổ chức trong hệ thống chi nhánh của mình'
      WHERE code = 'PROVIDER_STANDARD';
    `);
    await queryRunner.query(`
      UPDATE contest_types SET description = 'Giải đấu mô phỏng Grand Prix: vòng loại tính giờ rồi chung kết đấu loại trực tiếp'
      WHERE code = 'GRAND_PRIX';
    `);

    await queryRunner.query(`
      UPDATE contest_templates SET name = 'Đua tính giờ',
        description = 'Mỗi VĐV chạy một lượt, xếp hạng theo thành tích thời gian'
      WHERE code = 'provider_standard_time_trial';
    `);
    await queryRunner.query(`
      UPDATE contest_templates SET name = 'Đấu loại trực tiếp',
        description = 'Nhánh đấu loại, 2 tay đua mỗi trận, người thắng đi tiếp'
      WHERE code = 'provider_standard_knockout';
    `);
    await queryRunner.query(`
      UPDATE contest_templates SET name = 'Grand Prix',
        description = 'Vòng loại tính giờ, top N vào chung kết đấu loại trực tiếp'
      WHERE code = 'grand_prix_qualifying_final';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE contest_formats SET description = 'Xep hang dua tren best lap hoac tong thoi gian' WHERE code = 'TIME_TRIAL';
    `);
    await queryRunner.query(`
      UPDATE contest_formats SET description = 'Dau loai truc tiep theo nhanh dau' WHERE code = 'KNOCKOUT';
    `);
    await queryRunner.query(`
      UPDATE contest_formats SET name = 'Qualifying + Final',
        description = 'Vong loai tinh gio (time attack), top N vao chung ket dau loai truc tiep'
      WHERE code = 'QUALIFYING_FINAL';
    `);
    await queryRunner.query(`
      UPDATE contest_types SET description = 'Contest do provider van hanh trong he thong cafe cua minh' WHERE code = 'PROVIDER_STANDARD';
    `);
    await queryRunner.query(`
      UPDATE contest_types SET description = 'Giai dau mo phong Grand Prix/F1: vong loai tinh gio roi chung ket knockout' WHERE code = 'GRAND_PRIX';
    `);
    await queryRunner.query(`
      UPDATE contest_templates SET name = 'Provider Standard Time Trial',
        description = 'Template mac dinh cho giai provider format time trial'
      WHERE code = 'provider_standard_time_trial';
    `);
    await queryRunner.query(`
      UPDATE contest_templates SET name = 'Provider Standard Knockout',
        description = 'Template mac dinh cho giai provider format knockout'
      WHERE code = 'provider_standard_knockout';
    `);
    await queryRunner.query(`
      UPDATE contest_templates SET name = 'Grand Prix Qualifying Final',
        description = 'Template mac dinh cho giai Grand Prix: vong loai time attack, top finalists vao chung ket knockout'
      WHERE code = 'grand_prix_qualifying_final';
    `);
  }
}
