import { AppDataSource } from '../../config/database';
import { resolveFacebookSoftUser } from '../../services/fb-soft-user';
import { GUEST_EMAIL_SUFFIX, UserRole } from '../../types';

/**
 * Phân giải tài khoản mềm cho khách đặt qua Facebook — Nguyên tắc V của
 * Constitution: test viết trước, xác nhận đỏ, rồi mới hiện thực.
 *
 * Đây là logic tài chính chứ không phải logic hội thoại: hàm này quyết định
 * TIỀN CỦA AI bị tính và đơn hàng thuộc về ai. Sai ở đây không phải là bot trả
 * lời vụng, mà là đơn hàng của người lạ gắn vào tài khoản thật của một khách
 * khác.
 *
 * Luồng khách vãng lai tại quầy (`booking.service.ts`) dùng lại BẤT KỲ người
 * dùng nào trùng số điện thoại. Ở quầy thì chấp nhận được vì staff đứng đối mặt
 * khách. Qua Messenger thì không ai xác minh gì — nên chốt `password_hash` ở Ca
 * 3 là ranh giới duy nhất giữa "khách vãng lai tiện lợi" và "ai gõ số của bạn
 * cũng đặt hộ bạn được".
 */
describe('fb-soft-user: phân giải tài khoản mềm', () => {
  const suffix = GUEST_EMAIL_SUFFIX;

  async function findUsersByPhone(phone: string) {
    return AppDataSource.query(`SELECT * FROM users WHERE phone = $1 ORDER BY created_at ASC`, [
      phone,
    ]);
  }

  async function seedSoftUser(phone: string, fullName = 'Khách Cũ') {
    const [row] = await AppDataSource.query(
      `INSERT INTO users (email, full_name, phone, password_hash, role, is_active, auth_provider)
       VALUES ($1, $2, $3, NULL, $4, true, 'LOCAL')
       RETURNING *`,
      [`${phone}${suffix}`, fullName, phone, UserRole.CUSTOMER],
    );
    return row;
  }

  async function seedRealUser(phone: string) {
    const [row] = await AppDataSource.query(
      `INSERT INTO users (email, full_name, phone, password_hash, role, is_active, auth_provider)
       VALUES ($1, $2, $3, $4, $5, true, 'LOCAL')
       RETURNING *`,
      [
        `that_${phone}@gmail.com`,
        'Người Thật',
        phone,
        '$2b$10$abcdefghijklmnopqrstuv',
        UserRole.CUSTOMER,
      ],
    );
    return row;
  }

  // Số riêng cho từng ca — dùng chung một số thì ca trước rò rỉ trạng thái sang ca sau.
  let seq = 0;
  function freshPhone(): string {
    seq += 1;
    return `09${String(10_000_000 + seq).slice(0, 8)}`;
  }

  // ── Ca 1 ────────────────────────────────────────────────────────────────────
  it('tạo tài khoản mềm mới khi chưa ai dùng số điện thoại đó', async () => {
    const phone = freshPhone();

    const result = await resolveFacebookSoftUser({ phone, fullName: 'Nam' });

    expect(result.outcome).toBe('CREATED');
    if (result.outcome !== 'CREATED') return;

    expect(result.user.phone).toBe(phone);
    expect(result.user.full_name).toBe('Nam');
    expect(result.user.role).toBe(UserRole.CUSTOMER);
    // Không mật khẩu — đây chính là thứ khiến nó "mềm": không đăng nhập được.
    expect(result.user.password_hash).toBeNull();
    expect(result.user.email).toBe(`${phone}${suffix}`);
  });

  // ── Ca 2 ────────────────────────────────────────────────────────────────────
  it('dùng lại đúng tài khoản mềm cũ khi cùng số điện thoại đặt lần nữa', async () => {
    const phone = freshPhone();
    const existing = await seedSoftUser(phone);

    const result = await resolveFacebookSoftUser({ phone, fullName: 'Khách Cũ' });

    expect(result.outcome).toBe('REUSED');
    if (result.outcome !== 'REUSED') return;
    expect(result.user.id).toBe(existing.id);

    // Lịch sử đặt lịch của khách phải nằm chung một chỗ, không tách làm hai.
    const rows = await findUsersByPhone(phone);
    expect(rows).toHaveLength(1);
  });

  // ── Ca 3 — ranh giới bảo vệ tài khoản ───────────────────────────────────────
  it('TỪ CHỐI khi số điện thoại đã thuộc về một tài khoản thật có mật khẩu', async () => {
    const phone = freshPhone();
    const real = await seedRealUser(phone);

    const result = await resolveFacebookSoftUser({ phone, fullName: 'Kẻ Mạo Danh' });

    expect(result.outcome).toBe('BLOCKED_REAL_ACCOUNT');

    // Không được đụng gì vào tài khoản thật — không đổi tên, không tạo bản sao.
    const rows = await findUsersByPhone(phone);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(real.id);
    expect(rows[0].full_name).toBe('Người Thật');
  });

  // ── Ca 4 ────────────────────────────────────────────────────────────────────
  it('chuẩn hoá số điện thoại: dạng 0xx và +84xx ra cùng một tài khoản', async () => {
    const local = freshPhone(); // 09xxxxxxxx
    const international = `+84${local.slice(1)}`;

    const first = await resolveFacebookSoftUser({ phone: local, fullName: 'Nam' });
    const second = await resolveFacebookSoftUser({ phone: international, fullName: 'Nam' });

    expect(first.outcome).toBe('CREATED');
    expect(second.outcome).toBe('REUSED');
    if (first.outcome !== 'CREATED' || second.outcome !== 'REUSED') return;
    expect(second.user.id).toBe(first.user.id);

    // Thiếu chuẩn hoá thì một người thành hai khách, và Ca 3 bị lách được bằng
    // cách gõ số của nạn nhân ở dạng còn lại.
    const rows = await findUsersByPhone(local);
    expect(rows).toHaveLength(1);
  });

  // ── Ca 5 ────────────────────────────────────────────────────────────────────
  it('từ chối số điện thoại sai định dạng thay vì tạo tài khoản rác', async () => {
    for (const bad of ['090123', 'không có số', '0901234567890123', '']) {
      const result = await resolveFacebookSoftUser({ phone: bad, fullName: 'Nam' });
      expect(result.outcome).toBe('INVALID_PHONE');
    }
  });

  // ── Ca 6 ────────────────────────────────────────────────────────────────────
  it('cập nhật tên khi khách cũ khai tên khác ở lần đặt sau', async () => {
    const phone = freshPhone();
    await seedSoftUser(phone, 'Tên Cũ');

    const result = await resolveFacebookSoftUser({ phone, fullName: 'Tên Mới' });

    expect(result.outcome).toBe('REUSED');
    const rows = await findUsersByPhone(phone);
    expect(rows[0].full_name).toBe('Tên Mới');
  });

  // ── Ca 7 ────────────────────────────────────────────────────────────────────
  it('không bao giờ ghi email thật của khách đè lên email tổng hợp', async () => {
    const phone = freshPhone();

    const result = await resolveFacebookSoftUser({
      phone,
      fullName: 'Nam',
      email: 'nam.that@gmail.com',
    });

    expect(result.outcome).toBe('CREATED');
    if (result.outcome !== 'CREATED') return;

    // Email liên lạc thuộc về ĐƠN HÀNG, không thuộc về danh tính. Ghi đè ở đây
    // sẽ đổ vỡ khi địa chỉ đó đã thuộc tài khoản khác, và mở lại đúng kiểu
    // chiếm dụng mà Ca 3 vừa chặn.
    expect(result.user.email).toBe(`${phone}${suffix}`);
  });
});
