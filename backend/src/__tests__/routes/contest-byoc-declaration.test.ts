import request from 'supertest';
import { app } from '../../app';
import { AppDataSource } from '../../config/database';
import { ProviderStatus, SubscriptionStatus, UserRole } from '../../types';
import { createTestCafe, createTestUser, generateToken } from '../helpers';

async function activateProvider(providerId: string): Promise<void> {
  await AppDataSource.query(
    `INSERT INTO provider_profiles (user_id, business_name, registration_status)
     VALUES ($1, $2, $3)`,
    [providerId, 'Contest Provider', ProviderStatus.ACTIVE],
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

async function createContestFixture(
  providerId: string,
  cafeId: string,
  overrides?: Partial<{
    status: 'DRAFT' | 'OPEN' | 'CLOSED' | 'RUNNING';
    vehiclePolicy: 'RENTAL_ONLY' | 'BYOC_ONLY' | 'MIXED';
    startsAt: string;
    endsAt: string;
  }>,
) {
  const [trackType] = await AppDataSource.query<{ id: string; code: string }[]>(
    `SELECT id, code FROM track_types ORDER BY created_at ASC LIMIT 1`,
  );
  const [contestType] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM contest_types WHERE code = 'PROVIDER_STANDARD' LIMIT 1`,
  );
  const [contestFormat] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM contest_formats WHERE code = 'KNOCKOUT' LIMIT 1`,
  );
  const [contestTemplate] = await AppDataSource.query<
    { id: string; default_config: Record<string, unknown> }[]
  >(`SELECT id, default_config FROM contest_templates WHERE contest_format_id = $1 LIMIT 1`, [
    contestFormat.id,
  ]);

  const startsAt = overrides?.startsAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const endsAt = overrides?.endsAt ?? new Date(Date.now() + 26 * 60 * 60 * 1000).toISOString();

  const [contest] = await AppDataSource.query<{ id: string }[]>(
    `INSERT INTO contests
       (cafe_id, provider_id, name, description, track_type, track_type_id, contest_type_id,
        contest_format_id, contest_template_id, registration_opens_at, registration_closes_at,
        banner_image_url, vehicle_rule, config, starts_at, ends_at, capacity, entry_fee, status, created_by)
     VALUES
       ($1, $2, $3, $4, $5, $6, $7,
        $8, $9, NOW() - INTERVAL '1 day', NOW() + INTERVAL '1 day',
        NULL, $10, $11, $12, $13, 32, 0, $14, $2)
     RETURNING id`,
    [
      cafeId,
      providerId,
      'BYOC Declaration Test',
      'BYOC declaration test',
      trackType.code,
      trackType.id,
      contestType.id,
      contestFormat.id,
      contestTemplate.id,
      JSON.stringify({
        vehicle_policy: overrides?.vehiclePolicy ?? 'BYOC_ONLY',
        assignment_policy: 'AT_CHECK_IN',
      }),
      JSON.stringify(contestTemplate.default_config ?? { format: 'KNOCKOUT' }),
      startsAt,
      endsAt,
      overrides?.status ?? 'OPEN',
    ],
  );

  await AppDataSource.query(
    `INSERT INTO contest_cafes (contest_id, cafe_id, role, display_order, check_in_enabled)
     VALUES ($1, $2, 'HOST', 0, TRUE)`,
    [contest.id, cafeId],
  );

  return { contestId: contest.id };
}

async function createRegistrationFixture(
  contestId: string,
  customerId: string,
  overrides?: Partial<{
    status: 'PENDING' | 'CONFIRMED' | 'CHECKED_IN' | 'CANCELLED';
    vehicleSource: 'RENTAL' | 'BYOC';
    metadata: Record<string, unknown>;
  }>,
) {
  const code = Math.random().toString(36).slice(2, 10).toUpperCase();
  const [registration] = await AppDataSource.query<{ id: string }[]>(
    `INSERT INTO contest_registrations
       (contest_id, user_id, participant_role_snapshot, vehicle_source, status, check_in_code,
        payment_status, metadata)
     VALUES
       ($1, $2, 'CUSTOMER', $3, $4, $5, 'NOT_REQUIRED', $6)
     RETURNING id`,
    [
      contestId,
      customerId,
      overrides?.vehicleSource ?? 'BYOC',
      overrides?.status ?? 'PENDING',
      code,
      JSON.stringify(overrides?.metadata ?? {}),
    ],
  );
  return registration;
}

describe('PATCH /contest-registrations/:id/byoc-declaration', () => {
  it('updates the BYOC declaration for the owner while PENDING', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    await activateProvider(provider.id);
    const cafe = await createTestCafe({ provider_id: provider.id });
    const customer = await createTestUser({ role: UserRole.CUSTOMER });
    const token = generateToken(customer);

    const { contestId } = await createContestFixture(provider.id, cafe.id);
    const registration = await createRegistrationFixture(contestId, customer.id, {
      status: 'PENDING',
      vehicleSource: 'BYOC',
      metadata: {
        booking_id: null,
        byoc_declaration: {
          vehicle_name: 'Yokomo MD 2.0',
          vehicle_brand: 'Yokomo',
          vehicle_class: 'Drift',
          notes: null,
        },
      },
    });

    const res = await request(app)
      .patch(`/api/v1/contest-registrations/${registration.id}/byoc-declaration`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        vehicle_name: 'Yokomo MD 3.0',
        vehicle_brand: 'Yokomo',
        vehicle_class: 'RWD Drift',
        notes: 'fixed typo',
      })
      .expect(200);

    expect(res.body.success).toBe(true);

    const [row] = await AppDataSource.query<{ metadata: Record<string, unknown> }[]>(
      `SELECT metadata FROM contest_registrations WHERE id = $1`,
      [registration.id],
    );
    expect(row.metadata.byoc_declaration).toEqual({
      vehicle_name: 'Yokomo MD 3.0',
      vehicle_brand: 'Yokomo',
      vehicle_class: 'RWD Drift',
      notes: 'fixed typo',
      // Sửa bản khai mà không gửi ảnh nghĩa là giữ nguyên ảnh cũ, không phải
      // xoá sạch — bản khai này vốn chưa có ảnh nào nên ra mảng rỗng.
      photos: [],
    });
    // Other metadata keys are preserved.
    expect(row.metadata.booking_id).toBeNull();

    const [audit] = await AppDataSource.query<{ event_type: string; actor_role: string }[]>(
      `SELECT event_type, actor_role FROM contest_audit_logs
       WHERE registration_id = $1 AND event_type = 'registration.byoc_declaration_updated'`,
      [registration.id],
    );
    expect(audit).toBeDefined();
    expect(audit.actor_role).toBe('CUSTOMER');
  });

  it('returns 403 when another customer tries to edit', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    await activateProvider(provider.id);
    const cafe = await createTestCafe({ provider_id: provider.id });
    const owner = await createTestUser({ role: UserRole.CUSTOMER });
    const other = await createTestUser({ role: UserRole.CUSTOMER });
    const otherToken = generateToken(other);

    const { contestId } = await createContestFixture(provider.id, cafe.id);
    const registration = await createRegistrationFixture(contestId, owner.id, {
      status: 'PENDING',
      vehicleSource: 'BYOC',
      metadata: { byoc_declaration: { vehicle_name: 'Yokomo MD 2.0' } },
    });

    const res = await request(app)
      .patch(`/api/v1/contest-registrations/${registration.id}/byoc-declaration`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ vehicle_name: 'Other Car' })
      .expect(403);

    expect(res.body.error?.code ?? res.body.code).toBe('FORBIDDEN');
  });

  it('returns 400 INVALID_REGISTRATION_STATE when status is CONFIRMED', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    await activateProvider(provider.id);
    const cafe = await createTestCafe({ provider_id: provider.id });
    const customer = await createTestUser({ role: UserRole.CUSTOMER });
    const token = generateToken(customer);

    const { contestId } = await createContestFixture(provider.id, cafe.id);
    const registration = await createRegistrationFixture(contestId, customer.id, {
      status: 'CONFIRMED',
      vehicleSource: 'BYOC',
      metadata: { byoc_declaration: { vehicle_name: 'Yokomo MD 2.0' } },
    });

    const res = await request(app)
      .patch(`/api/v1/contest-registrations/${registration.id}/byoc-declaration`)
      .set('Authorization', `Bearer ${token}`)
      .send({ vehicle_name: 'Yokomo MD 3.0' })
      .expect(400);

    expect(res.body.error?.code ?? res.body.code).toBe('INVALID_REGISTRATION_STATE');
  });

  it('returns 400 INVALID_VEHICLE_SOURCE when registration is RENTAL', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    await activateProvider(provider.id);
    const cafe = await createTestCafe({ provider_id: provider.id });
    const customer = await createTestUser({ role: UserRole.CUSTOMER });
    const token = generateToken(customer);

    const { contestId } = await createContestFixture(provider.id, cafe.id, {
      vehiclePolicy: 'MIXED',
    });
    const registration = await createRegistrationFixture(contestId, customer.id, {
      status: 'PENDING',
      vehicleSource: 'RENTAL',
      metadata: {},
    });

    const res = await request(app)
      .patch(`/api/v1/contest-registrations/${registration.id}/byoc-declaration`)
      .set('Authorization', `Bearer ${token}`)
      .send({ vehicle_name: 'Yokomo MD 3.0' })
      .expect(400);

    expect(res.body.error?.code ?? res.body.code).toBe('INVALID_VEHICLE_SOURCE');
  });
});

describe('check-in race fix', () => {
  it('returns 400 REGISTRATION_NOT_CONFIRMED when checking in an already CHECKED_IN registration', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    await activateProvider(provider.id);
    const cafe = await createTestCafe({ provider_id: provider.id });
    const customer = await createTestUser({ role: UserRole.CUSTOMER });
    const token = generateToken(provider);

    const now = new Date();
    const { contestId } = await createContestFixture(provider.id, cafe.id, {
      status: 'RUNNING',
      startsAt: new Date(now.getTime() - 30 * 60 * 1000).toISOString(),
      endsAt: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
    });
    const registration = await createRegistrationFixture(contestId, customer.id, {
      status: 'CHECKED_IN',
      vehicleSource: 'BYOC',
      metadata: { byoc_declaration: { vehicle_name: 'Yokomo MD 2.0' } },
    });

    const res = await request(app)
      .post(`/api/v1/contest-registrations/${registration.id}/check-in`)
      .set('Authorization', `Bearer ${token}`)
      .send({ checked_in_cafe_id: cafe.id })
      .expect(400);

    expect(res.body.error?.code ?? res.body.code).toBe('REGISTRATION_NOT_CONFIRMED');
  });
});
