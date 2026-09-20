import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Thêm `FACEBOOK` vào `booking_source_enum`.
 *
 * `bookings.source` là enum GỐC của Postgres, không phải varchar — được tạo ở
 * `1747180800000-InitialSchema.ts:14` và đã mở rộng hai lần
 * (`SYSTEM_SUBSCRIPTION`, `CONTEST`). Nên chỉ sửa enum TypeScript là chưa đủ:
 * lệnh chèn đơn Facebook đầu tiên sẽ hỏng lúc chạy chứ không hỏng lúc biên dịch.
 *
 * Không có nó thì đơn từ Facebook buộc phải ghi là `APP`, và báo cáo doanh thu
 * theo kênh sai vĩnh viễn — dữ liệu đã trộn thì không tách lại được.
 *
 * `ADD VALUE` đứng MỘT MÌNH trong migration này, theo đúng tiền lệ
 * `1784700000000-AddContestBookingSource.ts`. Postgres không cho dùng giá trị
 * enum vừa thêm ngay trong cùng transaction đã thêm nó, nên gộp chung với DDL
 * hay lệnh cập nhật dữ liệu khác là hỏng.
 */
export class AddFacebookBookingSource1787300000000 implements MigrationInterface {
  name = 'AddFacebookBookingSource1787300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE booking_source_enum ADD VALUE IF NOT EXISTS 'FACEBOOK';`);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Postgres không xoá được một giá trị khỏi enum mà không dựng lại cả kiểu.
    // Dựng lại đòi phải bỏ mọi cột đang dùng kiểu đó, tức là đụng vào `bookings`
    // — quá nặng cho một thao tác lùi. Để nguyên: `FACEBOOK` thừa trong enum
    // không gây hại gì.
  }
}
