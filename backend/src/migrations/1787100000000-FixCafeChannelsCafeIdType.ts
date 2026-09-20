import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `cafe_channels.cafe_id` được tạo ra là `varchar` trong khi `cafes.id` là
 * `uuid`. Entity khai `type: 'uuid'` nên TypeORM không nhận ra sự lệch này, và
 * mọi truy vấn qua repository vẫn chạy nhờ Postgres tự ép kiểu tham số. Nhưng
 * câu SQL thô JOIN hai bảng thì không có gì để ép:
 *
 *   JOIN cafes c ON c.id = cc.cafe_id
 *   → operator does not exist: uuid = character varying
 *
 * Đây là lỗi 500 trên production ở `checkChannelQuota`, chặn toàn bộ luồng nối
 * trang Facebook (`GET /api/v1/channels/facebook/callback`).
 *
 * Đổi cột về `uuid` và thêm luôn khoá ngoại còn thiếu — cột này trỏ tới `cafes`
 * từ đầu nhưng chưa bao giờ được ràng buộc.
 */
export class FixCafeChannelsCafeIdType1787100000000 implements MigrationInterface {
  name = 'FixCafeChannelsCafeIdType1787100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Dòng mồ côi sẽ làm khoá ngoại dựng không lên. Chúng cũng là dữ liệu chết:
    // mọi đường đọc bảng này đều đi từ một chi nhánh có thật, nên dòng trỏ tới
    // chi nhánh không còn tồn tại thì không ai đọc tới được nữa. Xoá mềm KHÔNG
    // tính là mồ côi — `cafes` vẫn còn dòng đó.
    await queryRunner.query(
      `DELETE FROM cafe_channels cc
       WHERE NOT EXISTS (SELECT 1 FROM cafes c WHERE c.id::text = cc.cafe_id)`,
    );

    await queryRunner.query(
      `ALTER TABLE cafe_channels
       ALTER COLUMN cafe_id TYPE uuid USING cafe_id::uuid`,
    );

    await queryRunner.query(
      `ALTER TABLE cafe_channels
       ADD CONSTRAINT fk_cafe_channels_cafe
       FOREIGN KEY (cafe_id) REFERENCES cafes(id) ON DELETE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE cafe_channels DROP CONSTRAINT IF EXISTS fk_cafe_channels_cafe`,
    );
    await queryRunner.query(
      `ALTER TABLE cafe_channels
       ALTER COLUMN cafe_id TYPE character varying USING cafe_id::text`,
    );
  }
}
