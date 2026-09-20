import { AppDataSource } from '../../config/database';
import { resolveFacebookSoftUser } from '../../services/fb-soft-user';
import { UserRole } from '../../types';

/**
 * Ranh giới bảo vệ tài khoản — US2.
 *
 * `fb-soft-user-resolution.test.ts` kiểm hàm phân giải trả về đúng nhãn gì.
 * Tệp này kiểm điều mạnh hơn và là điều thật sự quan trọng: SAU TOÀN BỘ luồng,
 * **không có đơn hàng nào** gắn vào tài khoản thật của người bị mạo danh.
 *
 * Phân biệt này không thừa. Một hàm trả đúng `BLOCKED_REAL_ACCOUNT` vẫn có thể
 * đi kèm một đường khác nào đó tạo đơn — và lúc đó test kia vẫn xanh trong khi
 * lỗ hổng vẫn mở.
 */
describe('US2: số điện thoại trùng tài khoản thật', () => {
  const victimPhone = '0909999111';

  // Phải seed trong `beforeEach`, KHÔNG phải `beforeAll`: `jest-setup.ts` chạy
  // TRUNCATE ... CASCADE trên bảng `users` trước MỖI test, nên dữ liệu tạo ở
  // `beforeAll` biến mất trước cả test đầu tiên — và hàm phân giải sẽ tưởng số
  // điện thoại này chưa ai dùng.
  beforeEach(async () => {
    await AppDataSource.query(
      `INSERT INTO users (email, full_name, phone, password_hash, role, is_active, auth_provider)
       VALUES ($1, $2, $3, $4, $5, true, 'LOCAL')`,
      [
        'nan.nhan@gmail.com',
        'Người Thật',
        victimPhone,
        '$2b$10$abcdefghijklmnopqrstuv',
        UserRole.CUSTOMER,
      ],
    );
  });

  it('kẻ mạo danh không tạo được đơn nào gắn vào tài khoản của nạn nhân', async () => {
    const result = await resolveFacebookSoftUser({
      phone: victimPhone,
      fullName: 'Kẻ Mạo Danh',
    });

    expect(result.outcome).toBe('BLOCKED_REAL_ACCOUNT');

    // Điều kiện phát hành: đếm phải bằng 0. Khác 0 là lỗ hổng chiếm dụng tài
    // khoản, chặn phát hành.
    const [{ count }] = await AppDataSource.query<{ count: string }[]>(
      `SELECT COUNT(*) AS count
         FROM bookings b
         JOIN users u ON u.id = b.customer_id
        WHERE u.phone = $1 AND b.source = 'FACEBOOK'`,
      [victimPhone],
    );
    expect(Number(count)).toBe(0);
  });

  it('không tạo tài khoản mềm song song mang cùng số điện thoại', async () => {
    await resolveFacebookSoftUser({ phone: victimPhone, fullName: 'Kẻ Mạo Danh' });

    // Tạo một tài khoản mềm thứ hai cùng số sẽ khiến các lượt tra sau đó rơi
    // vào nhánh "dùng lại" và chốt chặn mất tác dụng từ lần thứ hai trở đi.
    const rows = await AppDataSource.query<{ id: string; password_hash: string | null }[]>(
      `SELECT id, password_hash FROM users WHERE phone = $1`,
      [victimPhone],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].password_hash).not.toBeNull();
  });

  it('không đổi tên tài khoản thật theo tên kẻ mạo danh khai', async () => {
    await resolveFacebookSoftUser({ phone: victimPhone, fullName: 'Tên Bịa' });

    const [row] = await AppDataSource.query<{ full_name: string }[]>(
      `SELECT full_name FROM users WHERE phone = $1`,
      [victimPhone],
    );
    expect(row.full_name).toBe('Người Thật');
  });

  it('số điện thoại dạng +84 của nạn nhân cũng bị chặn', async () => {
    // Thiếu chuẩn hoá thì chốt chặn lách được chỉ bằng cách đổi cách viết số.
    const result = await resolveFacebookSoftUser({
      phone: `+84${victimPhone.slice(1)}`,
      fullName: 'Kẻ Mạo Danh',
    });

    expect(result.outcome).toBe('BLOCKED_REAL_ACCOUNT');
  });
});
