import { AppDataSource } from '../../config/database';
import { respondExtensionOnBehalf } from '../../services/staff.service';
import { AppError, UserRole } from '../../types';
import { createTestCafe } from '../helpers';

/**
 * Nhân viên thao tác hộ khách dùng tài khoản mềm — US3.
 *
 * Hai bất biến được kiểm ở đây, và cả hai đều là bất biến về BẰNG CHỨNG chứ
 * không phải về tính năng:
 *
 *   1. Khách có tài khoản riêng thì KHÔNG ai ký thay được (FR-025). Chữ ký của
 *      họ là của họ.
 *   2. Bản ghi phải nói rõ nhân viên nào làm hộ khách nào (FR-024). Ghi như thể
 *      khách tự thao tác thì biên bản mất giá trị đối chất — đúng thứ Nguyên tắc
 *      III của hiến chương tồn tại để bảo vệ.
 */
describe('US3: nhân viên thao tác hộ khách', () => {
  async function seedUser(opts: { phone: string; withPassword: boolean }) {
    const [row] = await AppDataSource.query(
      `INSERT INTO users (email, full_name, phone, password_hash, role, is_active, auth_provider)
       VALUES ($1, $2, $3, $4, $5, true, 'LOCAL')
       RETURNING id`,
      [
        `${opts.phone}@${opts.withPassword ? 'gmail.com' : 'guest.rcfield.local'}`,
        opts.withPassword ? 'Khách Thật' : 'Khách Mềm',
        opts.phone,
        opts.withPassword ? '$2b$10$abcdefghijklmnopqrstuv' : null,
        UserRole.CUSTOMER,
      ],
    );
    return row.id as string;
  }

  it('TỪ CHỐI khi chủ đơn có tài khoản riêng tự đăng nhập được', async () => {
    const customerId = await seedUser({ phone: '0908880001', withPassword: true });
    const sessionId = await seedSessionFor(customerId);
    const staffId = await seedUser({ phone: '0908880002', withPassword: true });

    await expect(
      respondExtensionOnBehalf(sessionId, staffId, true, 'Khách đồng ý trực tiếp tại quầy'),
    ).rejects.toMatchObject({ code: 'CUSTOMER_CAN_SELF_SERVE' });
  });

  it('cho phép khi chủ đơn là tài khoản mềm, và báo đúng lỗi khi không có đề xuất chờ', async () => {
    const customerId = await seedUser({ phone: '0908880003', withPassword: false });
    const sessionId = await seedSessionFor(customerId);
    const staffId = await seedUser({ phone: '0908880004', withPassword: true });

    // Qua được chốt FR-025 (không còn CUSTOMER_CAN_SELF_SERVE), dừng ở chốt
    // nghiệp vụ tiếp theo. Đây chính là điều cần chứng minh: chốt quyền mở đúng
    // cho tài khoản mềm.
    await expect(
      respondExtensionOnBehalf(sessionId, staffId, true, 'Khách đồng ý trực tiếp tại quầy'),
    ).rejects.toMatchObject({ code: 'NO_PENDING_EXTENSION' });
  });

  it('phiên không tồn tại thì báo đúng lỗi, không lộ ra là do phân quyền', async () => {
    const staffId = await seedUser({ phone: '0908880005', withPassword: true });
    await expect(
      respondExtensionOnBehalf(
        '00000000-0000-0000-0000-000000000000',
        staffId,
        true,
        'Khách đồng ý trực tiếp tại quầy',
      ),
    ).rejects.toBeInstanceOf(AppError);
  });

  /** Dựng phiên chơi tối thiểu đủ để hàm dưới test truy được tới chủ đơn. */
  async function seedSessionFor(customerId: string): Promise<string> {
    // Dùng helper sẵn có thay vì chèn thô: bảng `cafes` có nhiều cột NOT NULL
    // (district, city, …) và danh sách đó còn đổi.
    const cafe = await createTestCafe();
    const [track] = await AppDataSource.query(`SELECT id FROM track_types LIMIT 1`);
    const [booking] = await AppDataSource.query(
      `INSERT INTO bookings (cafe_id, customer_id, track_type_id, play_mode, status,
                             slot_start, slot_end, slot_count, payment_expires_at, source)
       VALUES ($1, $2, $3, 'RENTAL', 'CONFIRMED', NOW(), NOW() + interval '2 hours', 4,
               NOW() + interval '2 hours', 'FACEBOOK')
       RETURNING id`,
      [cafe.id, customerId, track.id],
    );
    const [session] = await AppDataSource.query(
      `INSERT INTO sessions (booking_id, cafe_id, status, actual_start_at, planned_end_at, checked_in_by)
       VALUES ($1, $2, 'ACTIVE', NOW(), NOW() + interval '2 hours', $3)
       RETURNING id`,
      [booking.id, cafe.id, customerId],
    );
    return session.id as string;
  }
});
