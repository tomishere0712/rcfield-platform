import request from 'supertest';
import { app } from '../../app';
import { AppDataSource } from '../../config/database';
import { BookingStatus, UserRole } from '../../types';
import { createTestCafe, createTestUser, generateToken } from '../helpers';

/**
 * Màn hình quản lý người dùng của admin.
 *
 * Đây là chỗ một cú bấm chặn người ta đăng nhập được nữa. Hai nhóm rủi ro:
 * khoá NHẦM người (quy sai trách nhiệm huỷ lịch), và khoá mất đường vào hệ
 * thống (admin khoá admin). Cả hai đều không lộ ra cho tới lúc có người kêu.
 */

const LY_DO = 'Huỷ lịch liên tục 5 lần trong tháng, đã nhắc nhở qua điện thoại';

async function adminToken() {
  return generateToken(await createTestUser({ role: UserRole.ADMIN }));
}

/** Tạo booking cho khách với người huỷ chỉ định — ai huỷ là điều quan trọng nhất. */
async function seedBooking(customerId: string, status: BookingStatus, cancelledBy?: string | null) {
  const [cafe] = await AppDataSource.query<{ id: string; track_types: string[] }[]>(
    `SELECT id, track_types FROM cafes LIMIT 1`,
  );
  const [track] = await AppDataSource.query<{ id: string }[]>(`SELECT id FROM track_types LIMIT 1`);
  const start = new Date(Date.now() - 86_400_000);
  const end = new Date(start.getTime() + 3_600_000);
  await AppDataSource.query(
    `INSERT INTO bookings
       (customer_id, cafe_id, track_type_id, booking_mode, source, status,
        slot_start, slot_end, slot_count, payment_expires_at, snapshot,
        cancelled_by, cancelled_at, cancellation_reason)
     VALUES ($1, $2, $10, 'SINGLE', 'APP', $3, $4, $5, 1, $6, '{}'::jsonb, $7, $8, $9)`,
    [
      customerId,
      cafe.id,
      status,
      start,
      end,
      end,
      cancelledBy ?? null,
      cancelledBy ? new Date() : null,
      cancelledBy ? 'lý do thử nghiệm' : null,
      cafe.track_types?.[0] ?? track.id,
    ],
  );
}

/** Một chi nhánh tối thiểu, vì thống kê hành vi đọc qua bảng bookings. */
async function ensureCafe() {
  const [row] = await AppDataSource.query<{ count: string }[]>(`SELECT COUNT(*) FROM cafes`);
  if (Number(row.count) === 0) await createTestCafe();
}

async function readUser(id: string) {
  const [row] = await AppDataSource.query<{ is_active: boolean }[]>(
    `SELECT is_active FROM users WHERE id = $1`,
    [id],
  );
  return row;
}

async function readLogs(userId: string) {
  return AppDataSource.query<{ action: string; reason: string; metadata: unknown }[]>(
    `SELECT action, reason, metadata FROM user_moderation_logs WHERE user_id = $1`,
    [userId],
  );
}

describe('GET /api/v1/admin/users', () => {
  it('chỉ admin xem được danh sách người dùng', async () => {
    const customer = await createTestUser({ role: UserRole.CUSTOMER });
    await request(app).get('/api/v1/admin/users').expect(401);
    await request(app)
      .get('/api/v1/admin/users')
      .set('Authorization', `Bearer ${generateToken(customer)}`)
      .expect(403);
  });

  it('không trả về mật khẩu băm', async () => {
    await createTestUser({ role: UserRole.CUSTOMER });
    const res = await request(app)
      .get('/api/v1/admin/users')
      .set('Authorization', `Bearer ${await adminToken()}`)
      .expect(200);
    expect(JSON.stringify(res.body)).not.toContain('password');
  });

  it('tách riêng khách TỰ huỷ với bị người khác huỷ', async () => {
    // Đây là chốt chặn chống khoá nhầm: khách bị quán huỷ lịch không có lỗi gì,
    // gộp chung vào là admin khoá đúng người đang chịu thiệt.
    await ensureCafe();
    const customer = await createTestUser({ role: UserRole.CUSTOMER });
    const staff = await createTestUser({ role: UserRole.STAFF });

    await seedBooking(customer.id, BookingStatus.CANCELLED, customer.id);
    await seedBooking(customer.id, BookingStatus.CANCELLED, customer.id);
    await seedBooking(customer.id, BookingStatus.CANCELLED, staff.id);
    await seedBooking(customer.id, BookingStatus.NO_SHOW);
    await seedBooking(customer.id, BookingStatus.COMPLETED);

    const res = await request(app)
      .get(`/api/v1/admin/users?q=${encodeURIComponent(customer.email)}`)
      .set('Authorization', `Bearer ${await adminToken()}`)
      .expect(200);

    const row = res.body.data.find((r: { id: string }) => r.id === customer.id);
    expect(row.behaviour.total_bookings).toBe(5);
    expect(row.behaviour.self_cancelled).toBe(2);
    expect(row.behaviour.cancelled_by_others).toBe(1);
    expect(row.behaviour.no_show).toBe(1);
    expect(row.behaviour.completed).toBe(1);
    // Hỏng hẹn = tự huỷ + vắng mặt = 3/5. Lần bị quán huỷ KHÔNG tính vào.
    expect(row.behaviour.broken_rate).toBe(60);
  });

  it('người chưa đặt lần nào có tỉ lệ hỏng hẹn bằng 0, không phải null', async () => {
    // Chia cho 0 ra NaN, mà NaN vào JSON thành null — giao diện hiện ô trống và
    // người xem tưởng dữ liệu lỗi.
    const fresh = await createTestUser({ role: UserRole.CUSTOMER });
    const res = await request(app)
      .get(`/api/v1/admin/users?q=${encodeURIComponent(fresh.email)}`)
      .set('Authorization', `Bearer ${await adminToken()}`)
      .expect(200);
    const row = res.body.data.find((r: { id: string }) => r.id === fresh.id);
    expect(row.behaviour.broken_rate).toBe(0);
    expect(row.behaviour.total_bookings).toBe(0);
  });

  it('xếp theo rủi ro đưa người hỏng hẹn nhiều nhất lên đầu', async () => {
    await ensureCafe();
    const nang = await createTestUser({ role: UserRole.CUSTOMER });
    const nhe = await createTestUser({ role: UserRole.CUSTOMER });
    for (let i = 0; i < 4; i++) await seedBooking(nang.id, BookingStatus.NO_SHOW);
    await seedBooking(nhe.id, BookingStatus.COMPLETED);

    const res = await request(app)
      .get('/api/v1/admin/users?sort=risk&limit=100')
      .set('Authorization', `Bearer ${await adminToken()}`)
      .expect(200);

    const ids = (res.body.data as { id: string }[]).map((r) => r.id);
    expect(ids.indexOf(nang.id)).toBeLessThan(ids.indexOf(nhe.id));
  });

  it('lọc được theo trạng thái khoá', async () => {
    const locked = await createTestUser({ role: UserRole.CUSTOMER });
    await AppDataSource.query(`UPDATE users SET is_active = false WHERE id = $1`, [locked.id]);

    const res = await request(app)
      .get('/api/v1/admin/users?status=locked&limit=100')
      .set('Authorization', `Bearer ${await adminToken()}`)
      .expect(200);

    const rows = res.body.data as { id: string; is_active: boolean }[];
    expect(rows.some((r) => r.id === locked.id)).toBe(true);
    expect(rows.every((r) => r.is_active === false)).toBe(true);
  });
});

describe('POST /api/v1/admin/users/:id/lock', () => {
  it('khoá thì tài khoản không đăng nhập được nữa', async () => {
    const customer = await createTestUser({ role: UserRole.CUSTOMER, password: 'matkhau123' });

    await request(app)
      .post(`/api/v1/admin/users/${customer.id}/lock`)
      .set('Authorization', `Bearer ${await adminToken()}`)
      .send({ reason: LY_DO })
      .expect(200);

    expect((await readUser(customer.id)).is_active).toBe(false);

    // Quan trọng hơn cờ trong bảng: người đó thật sự không vào được.
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: customer.email, password: 'matkhau123' });
    expect(login.status).toBe(403);
    expect(login.body.code).toBe('ACCOUNT_LOCKED');
  });

  it('ghi lại ai khoá, vì sao, và số liệu làm căn cứ lúc đó', async () => {
    await ensureCafe();
    const admin = await createTestUser({ role: UserRole.ADMIN });
    const customer = await createTestUser({ role: UserRole.CUSTOMER });
    await seedBooking(customer.id, BookingStatus.NO_SHOW);
    await seedBooking(customer.id, BookingStatus.CANCELLED, customer.id);

    await request(app)
      .post(`/api/v1/admin/users/${customer.id}/lock`)
      .set('Authorization', `Bearer ${generateToken(admin)}`)
      .send({ reason: LY_DO })
      .expect(200);

    const logs = await readLogs(customer.id);
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe('LOCK');
    expect(logs[0].reason).toBe(LY_DO);
    // Chụp số liệu tại thời điểm quyết định: đọc lại từ bookings về sau sẽ ra
    // con số khác, và khi đó nhật ký không giải thích được vì sao lúc ấy khoá.
    const meta = logs[0].metadata as { behaviour_at_decision: { no_show: number } };
    expect(meta.behaviour_at_decision.no_show).toBe(1);
  });

  it('không nêu lý do thì không khoá được', async () => {
    const customer = await createTestUser({ role: UserRole.CUSTOMER });
    const token = await adminToken();

    for (const body of [{}, { reason: '   ' }, { reason: 'spam' }]) {
      const res = await request(app)
        .post(`/api/v1/admin/users/${customer.id}/lock`)
        .set('Authorization', `Bearer ${token}`)
        .send(body);
      expect(res.status).toBeGreaterThanOrEqual(400);
    }
    expect((await readUser(customer.id)).is_active).toBe(true);
    expect(await readLogs(customer.id)).toHaveLength(0);
  });

  it('KHÔNG khoá được tài khoản quản trị viên khác', async () => {
    // Admin khoá lẫn nhau là cách nhanh nhất để không còn ai vào được trang
    // quản trị, và không có đường tự mở lại từ trong ứng dụng.
    const nanNhan = await createTestUser({ role: UserRole.ADMIN });
    const res = await request(app)
      .post(`/api/v1/admin/users/${nanNhan.id}/lock`)
      .set('Authorization', `Bearer ${await adminToken()}`)
      .send({ reason: LY_DO });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CANNOT_MODERATE_ADMIN');
    expect((await readUser(nanNhan.id)).is_active).toBe(true);
  });

  it('không tự khoá chính mình', async () => {
    const admin = await createTestUser({ role: UserRole.ADMIN });
    const res = await request(app)
      .post(`/api/v1/admin/users/${admin.id}/lock`)
      .set('Authorization', `Bearer ${generateToken(admin)}`)
      .send({ reason: LY_DO });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('CANNOT_LOCK_SELF');
    expect((await readUser(admin.id)).is_active).toBe(true);
  });

  it('khoá hai lần bị chặn — không ghi thêm nhật ký cho việc không xảy ra', async () => {
    const customer = await createTestUser({ role: UserRole.CUSTOMER });
    const token = await adminToken();

    await request(app)
      .post(`/api/v1/admin/users/${customer.id}/lock`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: LY_DO })
      .expect(200);

    const lan2 = await request(app)
      .post(`/api/v1/admin/users/${customer.id}/lock`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: LY_DO });

    expect(lan2.status).toBe(400);
    expect(lan2.body.code).toBe('ALREADY_IN_STATE');
    expect(await readLogs(customer.id)).toHaveLength(1);
  });

  it('provider không khoá được ai', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    const customer = await createTestUser({ role: UserRole.CUSTOMER });

    await request(app)
      .post(`/api/v1/admin/users/${customer.id}/lock`)
      .set('Authorization', `Bearer ${generateToken(provider)}`)
      .send({ reason: LY_DO })
      .expect(403);

    expect((await readUser(customer.id)).is_active).toBe(true);
  });
});

describe('POST /api/v1/admin/users/:id/unlock', () => {
  it('mở khoá thì đăng nhập lại được, và lịch sử giữ nguyên cả hai lần', async () => {
    const customer = await createTestUser({ role: UserRole.CUSTOMER, password: 'matkhau123' });
    const token = await adminToken();

    await request(app)
      .post(`/api/v1/admin/users/${customer.id}/lock`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: LY_DO })
      .expect(200);

    await request(app)
      .post(`/api/v1/admin/users/${customer.id}/unlock`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Khách đã liên hệ giải trình và cam kết không tái phạm' })
      .expect(200);

    expect((await readUser(customer.id)).is_active).toBe(true);
    await request(app)
      .post('/api/v1/auth/login')
      .send({ email: customer.email, password: 'matkhau123' })
      .expect(200);

    // Mở khoá KHÔNG xoá dấu vết lần khoá trước — nếu không thì bật lại là mọi
    // lịch sử kỷ luật biến mất.
    const logs = await readLogs(customer.id);
    expect(logs.map((l) => l.action).sort()).toEqual(['LOCK', 'UNLOCK']);
  });
});

describe('GET /api/v1/admin/users/:id', () => {
  it('trả về hành vi, lịch đặt gần đây và lịch sử kỷ luật', async () => {
    await ensureCafe();
    const customer = await createTestUser({ role: UserRole.CUSTOMER });
    await seedBooking(customer.id, BookingStatus.CANCELLED, customer.id);

    await request(app)
      .post(`/api/v1/admin/users/${customer.id}/lock`)
      .set('Authorization', `Bearer ${await adminToken()}`)
      .send({ reason: LY_DO })
      .expect(200);

    const res = await request(app)
      .get(`/api/v1/admin/users/${customer.id}`)
      .set('Authorization', `Bearer ${await adminToken()}`)
      .expect(200);

    expect(res.body.data.behaviour.self_cancelled).toBe(1);
    expect(res.body.data.recent_bookings).toHaveLength(1);
    expect(res.body.data.recent_bookings[0].cancelled_by_self).toBe(true);
    expect(res.body.data.moderation_history).toHaveLength(1);
    expect(res.body.data.moderation_history[0].reason).toBe(LY_DO);
  });

  it('id không tồn tại thì 404', async () => {
    await request(app)
      .get('/api/v1/admin/users/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${await adminToken()}`)
      .expect(404);
  });
});
