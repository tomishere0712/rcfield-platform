import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bảng `feature_flags` khai 8 cờ từ ngày đầu, nhưng chỉ 2 cờ thật sự được đọc
 * trong mã: `AI_CHATBOT` (theo từng chi nhánh) và `AI_REVENUE_ANALYTICS`.
 *
 * Bảy dòng GLOBAL còn lại không có chỗ nào đọc — bật hay tắt đều không đổi
 * hành vi hệ thống. Để lại chúng trên màn hình quản trị là mời admin bấm vào
 * thứ không có tác dụng, nên xoá hẳn.
 *
 * Dòng `AI_CHATBOT` cấp GLOBAL cũng nằm trong danh sách xoá: mã chỉ tra cờ này
 * theo `entity_type = 'CAFE'`, dòng GLOBAL không bao giờ được đọc tới.
 */
const DEAD_GLOBAL_FLAGS: Array<[string, string, boolean]> = [
  ['FNB', 'Quản lý F&B', true],
  ['DISPUTE', 'Xử lý tranh chấp', true],
  ['EXTENSION', 'Gia hạn slot', true],
  ['ANALYTICS', 'Báo cáo & Analytics', true],
  ['AI_DAMAGE_DETECTION', 'Phát hiện hư hỏng bằng AI', false],
  ['AI_CHATBOT', 'Chatbot hỗ trợ khách hàng (AI)', false],
  ['AI_ANALYTICS', 'Phân tích dữ liệu bằng AI', false],
];

export class DropUnusedFeatureFlags1787000000000 implements MigrationInterface {
  name = 'DropUnusedFeatureFlags1787000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM feature_flags
       WHERE entity_type = 'GLOBAL' AND feature_key = ANY($1)`,
      [DEAD_GLOBAL_FLAGS.map(([key]) => key)],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const [key, name, enabled] of DEAD_GLOBAL_FLAGS) {
      await queryRunner.query(
        `INSERT INTO feature_flags (feature_key, display_name, is_enabled, entity_type)
         VALUES ($1, $2, $3, 'GLOBAL')`,
        [key, name, enabled],
      );
    }
  }
}
