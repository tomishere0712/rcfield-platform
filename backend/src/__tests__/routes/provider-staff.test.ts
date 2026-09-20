import request from 'supertest';
import bcrypt from 'bcrypt';
import { app } from '../../app';
import { AppDataSource } from '../../config/database';
import { ProviderStatus, SubscriptionStatus, UserRole } from '../../types';
import { createTestCafe, createTestUser, generateToken } from '../helpers';
import { emailService } from '../../services/email.service';

async function activateProvider(providerId: string): Promise<void> {
  await AppDataSource.query(
    `INSERT INTO provider_profiles (user_id, business_name, registration_status)
     VALUES ($1, $2, $3)`,
    [providerId, 'Test RC Business', ProviderStatus.ACTIVE],
  );

  const [plan] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM subscription_plans WHERE is_trial = true LIMIT 1`,
  );

  await AppDataSource.query(
    `INSERT INTO provider_subscriptions
       (provider_id, plan_id, status, started_at, expires_at, ai_quota_reset_at)
     VALUES ($1, $2, $3, NOW(), NOW() + INTERVAL '14 days', NOW() + INTERVAL '30 days')`,
    [providerId, plan.id, SubscriptionStatus.TRIAL],
  );
}

describe('POST /api/v1/provider/staff', () => {
  let sendInviteSpy: jest.SpyInstance;
  let capturedInviteUrl = '';

  beforeEach(() => {
    capturedInviteUrl = '';
    sendInviteSpy = jest
      .spyOn(emailService, 'sendStaffInvite')
      .mockImplementation(async (input) => {
        capturedInviteUrl = input.inviteUrl;
        return Promise.resolve();
      });
  });

  afterEach(() => {
    sendInviteSpy.mockRestore();
  });

  it('provider ACTIVE tạo được tài khoản STAFF và gán vào cafe của mình', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    await activateProvider(provider.id);
    const cafe = await createTestCafe({ provider_id: provider.id });

    const res = await request(app)
      .post('/api/v1/provider/staff')
      .set('Authorization', `Bearer ${generateToken(provider)}`)
      .send({
        cafe_id: cafe.id,
        full_name: 'Nguyen Staff',
        email: 'Staff.New@Example.com',
        phone: '0901234567',
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      email: 'staff.new@example.com',
      fullName: 'Nguyen Staff',
      phone: '0901234567',
      role: UserRole.STAFF,
      cafeId: cafe.id,
      assignedBy: provider.id,
    });
    expect(res.body.data).not.toHaveProperty('password_hash');
    expect(res.body.data).not.toHaveProperty('access_token');
    expect(res.body.data).not.toHaveProperty('refresh_token');

    const [staff] = await AppDataSource.query<
      {
        id: string;
        email: string;
        role: string;
        password_hash: string | null;
        is_active: boolean;
      }[]
    >(`SELECT id, email, role, password_hash, is_active FROM users WHERE id = $1`, [
      res.body.data.id,
    ]);
    expect(staff.email).toBe('staff.new@example.com');
    expect(staff.role).toBe(UserRole.STAFF);
    expect(staff.is_active).toBe(false);
    expect(staff.password_hash).toBeNull();

    const [assignment] = await AppDataSource.query<
      { staff_id: string; cafe_id: string; assigned_by: string }[]
    >(`SELECT staff_id, cafe_id, assigned_by FROM staff_cafe_assignments WHERE staff_id = $1`, [
      staff.id,
    ]);
    expect(assignment).toEqual({
      staff_id: staff.id,
      cafe_id: cafe.id,
      assigned_by: provider.id,
    });

    // Verify token was sent in the email invite
    expect(sendInviteSpy).toHaveBeenCalled();
    const urlObj = new URL(capturedInviteUrl);
    const token = urlObj.searchParams.get('token');
    expect(token).toBeTruthy();

    // Now test the activation flow
    const activateRes = await request(app)
      .post('/api/v1/auth/staff-invite/activate')
      .send({
        token,
        password: 'secret123',
      })
      .expect(200);

    expect(activateRes.body.success).toBe(true);
    expect(activateRes.body.data).toHaveProperty('access_token');
    expect(activateRes.body.data).toHaveProperty('refresh_token');

    // Verify user is now active in database and has correct password
    const [activatedStaff] = await AppDataSource.query<
      { id: string; password_hash: string; is_active: boolean }[]
    >(`SELECT id, password_hash, is_active FROM users WHERE id = $1`, [staff.id]);
    expect(activatedStaff.is_active).toBe(true);
    await expect(bcrypt.compare('secret123', activatedStaff.password_hash)).resolves.toBe(true);
  });

  it('không cho tạo staff khi không đăng nhập', async () => {
    const res = await request(app).post('/api/v1/provider/staff').send({}).expect(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('không cho CUSTOMER tạo staff', async () => {
    const customer = await createTestUser({ role: UserRole.CUSTOMER });

    const res = await request(app)
      .post('/api/v1/provider/staff')
      .set('Authorization', `Bearer ${generateToken(customer)}`)
      .send({})
      .expect(403);

    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('không cho provider chưa ACTIVE tạo staff', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    await AppDataSource.query(
      `INSERT INTO provider_profiles (user_id, business_name, registration_status)
       VALUES ($1, $2, $3)`,
      [provider.id, 'Pending RC Business', ProviderStatus.PENDING],
    );

    const res = await request(app)
      .post('/api/v1/provider/staff')
      .set('Authorization', `Bearer ${generateToken(provider)}`)
      .send({})
      .expect(403);

    expect(res.body.code).toBe('ACCOUNT_NOT_ACTIVE');
  });

  it('không cho provider tạo staff cho cafe thuộc provider khác', async () => {
    const owner = await createTestUser({ role: UserRole.PROVIDER });
    const other = await createTestUser({ role: UserRole.PROVIDER });
    await activateProvider(other.id);
    const cafe = await createTestCafe({ provider_id: owner.id });

    const res = await request(app)
      .post('/api/v1/provider/staff')
      .set('Authorization', `Bearer ${generateToken(other)}`)
      .send({
        cafe_id: cafe.id,
        full_name: 'Blocked Staff',
        email: 'blocked@example.com',
        password: 'secret123',
      })
      .expect(404);

    expect(res.body.code).toBe('CAFE_NOT_FOUND');

    const [{ count }] = await AppDataSource.query<{ count: string }[]>(
      `SELECT COUNT(*)::int AS count FROM users WHERE email = $1`,
      ['blocked@example.com'],
    );
    expect(Number(count)).toBe(0);
  });

  it('không tạo staff nếu email đã tồn tại', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    await activateProvider(provider.id);
    const cafe = await createTestCafe({ provider_id: provider.id });
    await createTestUser({ email: 'exists@example.com', role: UserRole.CUSTOMER });

    const res = await request(app)
      .post('/api/v1/provider/staff')
      .set('Authorization', `Bearer ${generateToken(provider)}`)
      .send({
        cafe_id: cafe.id,
        full_name: 'Duplicate Staff',
        email: 'EXISTS@example.com',
        password: 'secret123',
      })
      .expect(409);

    expect(res.body.code).toBe('EMAIL_ALREADY_EXISTS');

    const [{ count }] = await AppDataSource.query<{ count: string }[]>(
      `SELECT COUNT(*)::int AS count FROM staff_cafe_assignments`,
    );
    expect(Number(count)).toBe(0);
  });

  it('validate body trước khi tạo staff', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    await activateProvider(provider.id);

    const res = await request(app)
      .post('/api/v1/provider/staff')
      .set('Authorization', `Bearer ${generateToken(provider)}`)
      .send({
        cafe_id: 'not-a-uuid',
        full_name: 'A',
        email: 'not-email',
        phone: '123',
        password: '123',
      })
      .expect(400);

    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});
