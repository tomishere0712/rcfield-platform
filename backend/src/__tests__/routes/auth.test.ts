import request from 'supertest';
import { app } from '../../app';
import { AppDataSource } from '../../config/database';
import { redis } from '../../config/redis';
import { createTestUser, DEFAULT_PASSWORD } from '../helpers';
import { UserRole } from '../../types';

beforeEach(async () => {
  // Clear brute-force counters between tests
  const keys = await redis.keys('auth:failed:*');
  if (keys.length > 0) await redis.del(keys);
});

// ── US1: Email + password login ───────────────────────────────────────────────

describe('POST /api/v1/auth/login', () => {
  it('đăng nhập thành công → 200 + tokens + role', async () => {
    const user = await createTestUser({ role: UserRole.CUSTOMER });
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: DEFAULT_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.access_token).toBeDefined();
    expect(res.body.data.refresh_token).toBeDefined();
    expect(res.body.data.user.role).toBe(UserRole.CUSTOMER);
    expect(res.body.data.user.email).toBe(user.email);
  });

  it('mật khẩu sai → 401 INVALID_CREDENTIALS', async () => {
    const user = await createTestUser();
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: 'WrongPassword1' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('email không tồn tại → 401 INVALID_CREDENTIALS (cùng message)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@test.com', password: DEFAULT_PASSWORD });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('tài khoản bị khoá (is_active=false) → 403 ACCOUNT_LOCKED', async () => {
    const user = await createTestUser({ is_active: false });
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: DEFAULT_PASSWORD });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ACCOUNT_LOCKED');
  });

  it('5 lần sai liên tiếp → lần 6 bị khoá 403 ACCOUNT_LOCKED', async () => {
    const user = await createTestUser();
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: 'WrongPassword1' });
    }
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: DEFAULT_PASSWORD });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ACCOUNT_LOCKED');
  });

  it('thiếu email → 400 VALIDATION_ERROR', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ password: DEFAULT_PASSWORD });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('mật khẩu quá ngắn → 400 VALIDATION_ERROR', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'test@test.com', password: 'short' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});

// ── US2: Google OAuth login ───────────────────────────────────────────────────

jest.mock('google-auth-library', () => {
  const mockVerifyIdToken = jest.fn();
  return {
    OAuth2Client: jest.fn().mockImplementation(() => ({
      verifyIdToken: mockVerifyIdToken,
    })),
    __mockVerifyIdToken: mockVerifyIdToken,
  };
});

function mockGoogleSuccess(email: string) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { __mockVerifyIdToken } = require('google-auth-library');
  __mockVerifyIdToken.mockResolvedValueOnce({
    getPayload: () => ({ email, sub: 'google-sub-123' }),
  });
}

function mockGoogleFailure() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { __mockVerifyIdToken } = require('google-auth-library');
  __mockVerifyIdToken.mockRejectedValueOnce(new Error('Invalid token'));
}

describe('POST /api/v1/auth/google', () => {
  it('email mới → tạo tài khoản CUSTOMER + trả về tokens', async () => {
    mockGoogleSuccess('newgoogle@gmail.com');
    const res = await request(app).post('/api/v1/auth/google').send({ id_token: 'fake-id-token' });

    expect(res.status).toBe(200);
    expect(res.body.data.user.role).toBe(UserRole.CUSTOMER);
    expect(res.body.data.user.email).toBe('newgoogle@gmail.com');
    expect(res.body.data.access_token).toBeDefined();

    // Verify user created in DB
    const [row] = await AppDataSource.query(`SELECT auth_provider FROM users WHERE email = $1`, [
      'newgoogle@gmail.com',
    ]);
    expect(row.auth_provider).toBe('GOOGLE');
  });

  it('email đã tồn tại (LOCAL) → đăng nhập thành công, không tạo tài khoản mới', async () => {
    const user = await createTestUser({ email: 'existing@gmail.com' });
    mockGoogleSuccess('existing@gmail.com');

    const res = await request(app).post('/api/v1/auth/google').send({ id_token: 'fake-id-token' });

    expect(res.status).toBe(200);
    expect(res.body.data.user.id).toBe(user.id);

    // Chỉ 1 user trong DB
    const [{ count }] = await AppDataSource.query(
      `SELECT COUNT(*) as count FROM users WHERE email = $1`,
      ['existing@gmail.com'],
    );
    expect(parseInt(count)).toBe(1);
  });

  it('Google token không hợp lệ → 401 GOOGLE_AUTH_FAILED', async () => {
    mockGoogleFailure();
    const res = await request(app).post('/api/v1/auth/google').send({ id_token: 'bad-token' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('GOOGLE_AUTH_FAILED');
  });

  it('tài khoản Google bị khoá → 403 ACCOUNT_LOCKED', async () => {
    await createTestUser({ email: 'locked@gmail.com', is_active: false, auth_provider: 'GOOGLE' });
    mockGoogleSuccess('locked@gmail.com');

    const res = await request(app).post('/api/v1/auth/google').send({ id_token: 'fake-id-token' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ACCOUNT_LOCKED');
  });
});

// ── US3: Token refresh ────────────────────────────────────────────────────────

describe('POST /api/v1/auth/refresh', () => {
  it('refresh token hợp lệ → tokens mới, token cũ bị vô hiệu hoá', async () => {
    const user = await createTestUser();
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: DEFAULT_PASSWORD });

    const oldRefreshToken = login.body.data.refresh_token;

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refresh_token: oldRefreshToken });

    expect(res.status).toBe(200);
    expect(res.body.data.access_token).toBeDefined();
    expect(res.body.data.refresh_token).toBeDefined();
    expect(res.body.data.refresh_token).not.toBe(oldRefreshToken);

    // Token cũ bị vô hiệu hoá
    const retry = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refresh_token: oldRefreshToken });
    expect(retry.status).toBe(401);
    expect(retry.body.code).toBe('INVALID_REFRESH_TOKEN');
  });

  it('refresh token không tồn tại → 401 INVALID_REFRESH_TOKEN', async () => {
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refresh_token: 'totally-fake-token-that-does-not-exist' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_REFRESH_TOKEN');
  });

  it('refresh token đã hết hạn → 401 INVALID_REFRESH_TOKEN', async () => {
    const user = await createTestUser();
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: DEFAULT_PASSWORD });

    const refreshToken = login.body.data.refresh_token;

    // Expire the token manually in DB
    const crypto = await import('crypto');
    const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    await AppDataSource.query(
      `UPDATE refresh_tokens SET expires_at = NOW() - INTERVAL '1 second' WHERE token = $1`,
      [hash],
    );

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refresh_token: refreshToken });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_REFRESH_TOKEN');
  });
});

// ── US4: Logout ───────────────────────────────────────────────────────────────

describe('POST /api/v1/auth/logout', () => {
  it('đăng xuất thành công → 200; refresh token cũ bị từ chối', async () => {
    const user = await createTestUser();
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: DEFAULT_PASSWORD });

    const { access_token, refresh_token } = login.body.data;

    const res = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${access_token}`)
      .send({ refresh_token });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Refresh token cũ bị từ chối
    const retry = await request(app).post('/api/v1/auth/refresh').send({ refresh_token });
    expect(retry.status).toBe(401);
  });

  it('không có Authorization header → 401 UNAUTHORIZED', async () => {
    const res = await request(app)
      .post('/api/v1/auth/logout')
      .send({ refresh_token: 'some-token' });

    expect(res.status).toBe(401);
  });

  it('đăng xuất lần 2 cùng token → vẫn 200 (idempotent)', async () => {
    const user = await createTestUser();
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: DEFAULT_PASSWORD });

    const { access_token, refresh_token } = login.body.data;

    await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${access_token}`)
      .send({ refresh_token });

    const res = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${access_token}`)
      .send({ refresh_token });

    expect(res.status).toBe(200);
  });
});

describe('POST /api/v1/auth/register', () => {
  it('đăng ký tài khoản mới thành công', async () => {
    const email = `newuser_${Date.now()}@test.com`;
    const res = await request(app).post('/api/v1/auth/register').send({
      email,
      full_name: 'Test Register User',
      phone: '0912345678',
      password: 'Password123',
      role: 'CUSTOMER',
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe(email);
    expect(res.body.data.user.phone).toBe('0912345678');
  });

  it('đăng ký với số điện thoại của guest user có sẵn → nâng cấp tài khoản guest đó thay vì tạo mới', async () => {
    const { User } = await import('../../models/user.entity');
    const userRepo = AppDataSource.getRepository(User);
    const guestPhone = '0981112222';
    const guestEmail = `${guestPhone}@guest.rcfield.local`;

    // 1. Tạo guest user vãng lai từ trước
    const guest = await userRepo.save(
      userRepo.create({
        email: guestEmail,
        full_name: 'Khách Vãng Lai',
        phone: guestPhone,
        password_hash: null,
        role: UserRole.CUSTOMER,
        is_active: true,
      }),
    );

    // 2. Gọi API đăng ký với số điện thoại đó và email thật
    const realEmail = 'realcustomer@gmail.com';
    const res = await request(app).post('/api/v1/auth/register').send({
      email: realEmail,
      full_name: 'Khách Nâng Cấp',
      phone: guestPhone,
      password: 'Password123',
      role: 'CUSTOMER',
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.id).toBe(guest.id); // Trùng ID khách vãng lai ban đầu!
    expect(res.body.data.user.email).toBe(realEmail);
    expect(res.body.data.user.phone).toBe(guestPhone);

    // 3. Đảm bảo email cũ guest.rcfield.local không còn tồn tại
    const oldUser = await userRepo.findOne({ where: { email: guestEmail } });
    expect(oldUser).toBeNull();
  });
});
