import { AppDataSource } from '../../config/database';
import { authService } from '../../services/auth.service';
import { resolveFacebookSoftUser } from '../../services/fb-soft-user';
import { UserRole } from '../../types';

/**
 * Vòng đời tài khoản mềm: đặt qua Facebook → đăng ký tài khoản thật → đặt tiếp.
 *
 * Bất biến quan trọng nhất là **giữ nguyên `id`**. Nâng cấp bằng cách tạo dòng
 * mới thì mọi đơn hàng cũ nằm lại ở tài khoản mềm — khách đăng nhập vào và thấy
 * lịch sử trống rỗng, mà không có cách nào gộp lại vì hai dòng khác `id`.
 */
describe('vòng đời tài khoản mềm → tài khoản thật', () => {
  const phone = '0912345678';

  async function findByPhone() {
    return AppDataSource.query<
      { id: string; email: string; password_hash: string | null; full_name: string }[]
    >(`SELECT id, email, password_hash, full_name FROM users WHERE phone = $1`, [phone]);
  }

  it('đăng ký bằng số đã có tài khoản mềm thì NÂNG CẤP tại chỗ, giữ nguyên id', async () => {
    const created = await resolveFacebookSoftUser({ phone, fullName: 'Khách FB' });
    expect(created.outcome).toBe('CREATED');
    if (created.outcome !== 'CREATED') return;
    const softId = created.user.id;

    await authService.registerWithPassword({
      email: 'that@gmail.com',
      full_name: 'Người Thật',
      password: 'Test@123456',
      phone,
      role: UserRole.CUSTOMER,
    });

    const rows = await findByPhone();
    // Một dòng duy nhất, đúng id cũ — lịch sử đặt lịch đi theo.
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(softId);
    expect(rows[0].email).toBe('that@gmail.com');
    expect(rows[0].password_hash).not.toBeNull();
  });

  it('đăng ký bằng dạng +84 của số đó cũng nâng cấp, KHÔNG tạo tài khoản thứ hai', async () => {
    // Tài khoản mềm luôn lưu dạng 0xxxxxxxxx. Tra thô bằng '+84…' thì không thấy
    // dòng nào và hệ thống tạo tài khoản mới, bỏ rơi lịch sử cũ.
    const created = await resolveFacebookSoftUser({ phone, fullName: 'Khách FB' });
    if (created.outcome !== 'CREATED') return;
    const softId = created.user.id;

    await authService.registerWithPassword({
      email: 'that2@gmail.com',
      full_name: 'Người Thật',
      password: 'Test@123456',
      phone: `+84${phone.slice(1)}`,
      role: UserRole.CUSTOMER,
    });

    const rows = await findByPhone();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(softId);
  });

  it('sau khi nâng cấp, đặt qua Facebook bằng số đó bị CHẶN và mời đăng nhập', async () => {
    await resolveFacebookSoftUser({ phone, fullName: 'Khách FB' });
    await authService.registerWithPassword({
      email: 'that3@gmail.com',
      full_name: 'Người Thật',
      password: 'Test@123456',
      phone,
      role: UserRole.CUSTOMER,
    });

    // Đúng theo FR-012: tài khoản đã có mật khẩu thì không ai đặt hộ được nữa,
    // kể cả chính chủ qua Messenger — vì Messenger không chứng minh được danh tính.
    const again = await resolveFacebookSoftUser({ phone, fullName: 'Khách FB' });
    expect(again.outcome).toBe('BLOCKED_REAL_ACCOUNT');
  });

  it('số đã thuộc tài khoản THẬT thì đăng ký bị từ chối, không nâng cấp nhầm', async () => {
    await AppDataSource.query(
      `INSERT INTO users (email, full_name, phone, password_hash, role, is_active, auth_provider)
       VALUES ('nguoi.khac@gmail.com', 'Người Khác', $1, '$2b$10$abcdefghijklmnopqrstuv', $2, true, 'LOCAL')`,
      [phone, UserRole.CUSTOMER],
    );

    await expect(
      authService.registerWithPassword({
        email: 'ke.mao.danh@gmail.com',
        full_name: 'Kẻ Mạo Danh',
        password: 'Test@123456',
        phone,
        role: UserRole.CUSTOMER,
      }),
    ).rejects.toMatchObject({ code: 'REGISTRATION_CONFLICT' });
  });
});
