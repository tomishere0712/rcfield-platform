import request from 'supertest';
import { app } from '../../app';
import { AppDataSource } from '../../config/database';
import { env } from '../../config/env';
import { ProviderStatus, SubscriptionStatus, UserRole, VehicleSource } from '../../types';
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
      'Contest Validation Test',
      'Contest validation test',
      trackType.code,
      trackType.id,
      contestType.id,
      contestFormat.id,
      contestTemplate.id,
      JSON.stringify({
        vehicle_policy: overrides?.vehiclePolicy ?? 'RENTAL_ONLY',
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

  return { contestId: contest.id, trackTypeId: trackType.id };
}

async function createRegistrationFixture(
  contestId: string,
  customerId: string,
  overrides?: Partial<{
    status: 'PENDING' | 'CONFIRMED' | 'CHECKED_IN' | 'CANCELLED';
    vehicleSource: 'RENTAL' | 'BYOC';
    bookingId: string | null;
    metadata: Record<string, unknown>;
  }>,
) {
  const code = Math.random().toString(36).slice(2, 10).toUpperCase();
  const [registration] = await AppDataSource.query<{ id: string; user_id: string }[]>(
    `INSERT INTO contest_registrations
       (contest_id, user_id, participant_role_snapshot, vehicle_source, status, check_in_code,
        payment_status, metadata, booking_id)
     VALUES
       ($1, $2, 'CUSTOMER', $3, $4, $5, 'NOT_REQUIRED', $6, $7)
     RETURNING id, user_id`,
    [
      contestId,
      customerId,
      overrides?.vehicleSource ?? 'RENTAL',
      overrides?.status ?? 'CONFIRMED',
      code,
      JSON.stringify(overrides?.metadata ?? {}),
      overrides?.bookingId ?? null,
    ],
  );
  return registration;
}

describe('Contest registration validation', () => {
  it('chặn đăng ký trước giờ mở khi bypass tắt', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    await activateProvider(provider.id);
    const cafe = await createTestCafe({ provider_id: provider.id });
    const customer = await createTestUser({ role: UserRole.CUSTOMER });
    const { contestId } = await createContestFixture(provider.id, cafe.id, {
      status: 'OPEN',
      vehiclePolicy: 'BYOC_ONLY',
    });
    await AppDataSource.query(
      `UPDATE contests SET registration_opens_at = NOW() + INTERVAL '1 day',
         registration_closes_at = NOW() + INTERVAL '2 days' WHERE id = $1`,
      [contestId],
    );

    const original = env.bypassContestRegistrationWindow;
    (env as { bypassContestRegistrationWindow: boolean }).bypassContestRegistrationWindow = false;
    try {
      const res = await request(app)
        .post(`/api/v1/contests/${contestId}/register`)
        .set('Authorization', `Bearer ${generateToken(customer)}`)
        .send({ vehicle_source: 'BYOC', byoc_vehicle_name: 'Xe demo' })
        .expect(400);
      expect(res.body.code).toBe('CONTEST_REGISTRATION_NOT_OPEN_YET');
    } finally {
      (env as { bypassContestRegistrationWindow: boolean }).bypassContestRegistrationWindow =
        original;
    }
  });

  it('bypass chỉ bỏ qua cửa sổ giờ và ghi audit riêng', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    await activateProvider(provider.id);
    const cafe = await createTestCafe({ provider_id: provider.id });
    const customer = await createTestUser({ role: UserRole.CUSTOMER });
    const { contestId } = await createContestFixture(provider.id, cafe.id, {
      status: 'OPEN',
      vehiclePolicy: 'BYOC_ONLY',
    });
    await AppDataSource.query(
      `UPDATE contests SET registration_opens_at = NOW() + INTERVAL '1 day',
         registration_closes_at = NOW() + INTERVAL '2 days' WHERE id = $1`,
      [contestId],
    );

    const original = env.bypassContestRegistrationWindow;
    (env as { bypassContestRegistrationWindow: boolean }).bypassContestRegistrationWindow = true;
    try {
      await request(app)
        .post(`/api/v1/contests/${contestId}/register`)
        .set('Authorization', `Bearer ${generateToken(customer)}`)
        .send({ vehicle_source: 'BYOC', byoc_vehicle_name: 'Xe demo' })
        .expect(201);
    } finally {
      (env as { bypassContestRegistrationWindow: boolean }).bypassContestRegistrationWindow =
        original;
    }

    const rows = await AppDataSource.query<{ event_type: string }[]>(
      `SELECT event_type FROM contest_audit_logs
       WHERE contest_id = $1 AND event_type = 'registration.created_outside_window'`,
      [contestId],
    );
    expect(rows).toHaveLength(1);
    const [registration] = await AppDataSource.query<{ entry_fee_due_at: Date }[]>(
      `SELECT entry_fee_due_at FROM contest_registrations
       WHERE contest_id = $1 AND user_id = $2`,
      [contestId, customer.id],
    );
    expect(new Date(registration.entry_fee_due_at).getTime()).toBeGreaterThan(Date.now());
  });

  it('bypass thời gian vẫn không cho đăng ký contest DRAFT', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    await activateProvider(provider.id);
    const cafe = await createTestCafe({ provider_id: provider.id });
    const customer = await createTestUser({ role: UserRole.CUSTOMER });
    const { contestId } = await createContestFixture(provider.id, cafe.id, {
      status: 'DRAFT',
      vehiclePolicy: 'BYOC_ONLY',
    });

    const original = env.bypassContestRegistrationWindow;
    (env as { bypassContestRegistrationWindow: boolean }).bypassContestRegistrationWindow = true;
    try {
      const res = await request(app)
        .post(`/api/v1/contests/${contestId}/register`)
        .set('Authorization', `Bearer ${generateToken(customer)}`)
        .send({ vehicle_source: 'BYOC', byoc_vehicle_name: 'Xe demo' })
        .expect(400);
      expect(res.body.code).toBe('CONTEST_NOT_OPEN');
    } finally {
      (env as { bypassContestRegistrationWindow: boolean }).bypassContestRegistrationWindow =
        original;
    }
  });

  it('rejects check-in when BYOC declaration is missing vehicle name', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    await activateProvider(provider.id);
    const cafe = await createTestCafe({ provider_id: provider.id });
    const customer = await createTestUser({ role: UserRole.CUSTOMER });
    const token = generateToken(provider);

    const now = new Date();
    const startsAt = new Date(now.getTime() - 30 * 60 * 1000).toISOString();
    const endsAt = new Date(now.getTime() + 30 * 60 * 1000).toISOString();
    const { contestId } = await createContestFixture(provider.id, cafe.id, {
      status: 'RUNNING',
      vehiclePolicy: 'BYOC_ONLY',
      startsAt,
      endsAt,
    });

    const registration = await createRegistrationFixture(contestId, customer.id, {
      status: 'CONFIRMED',
      vehicleSource: 'BYOC',
      metadata: {},
    });

    await request(app)
      .post(`/api/v1/contest-registrations/${registration.id}/check-in`)
      .set('Authorization', `Bearer ${token}`)
      .send({ checked_in_cafe_id: cafe.id })
      .expect(400);
  });

  it('allows check-in when BYOC declaration and inspection are complete', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    await activateProvider(provider.id);
    const cafe = await createTestCafe({ provider_id: provider.id });
    const customer = await createTestUser({ role: UserRole.CUSTOMER });
    const token = generateToken(provider);

    const now = new Date();
    const startsAt = new Date(now.getTime() - 30 * 60 * 1000).toISOString();
    const endsAt = new Date(now.getTime() + 30 * 60 * 1000).toISOString();
    const { contestId } = await createContestFixture(provider.id, cafe.id, {
      status: 'RUNNING',
      vehiclePolicy: 'BYOC_ONLY',
      startsAt,
      endsAt,
    });

    const registration = await createRegistrationFixture(contestId, customer.id, {
      status: 'CONFIRMED',
      vehicleSource: 'BYOC',
      metadata: {
        byoc_declaration: {
          vehicle_name: 'Yokomo MD 2.0',
          vehicle_brand: 'Yokomo',
          vehicle_class: 'Drift',
        },
      },
    });

    const res = await request(app)
      .post(`/api/v1/contest-registrations/${registration.id}/check-in`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        checked_in_cafe_id: cafe.id,
        byoc_confirmed: true,
        byoc_inspection: {
          photos: [
            { url: 'https://example.com/byoc-body.jpg', angle: 'body' },
            { url: 'https://example.com/byoc-power.jpg', angle: 'power_system' },
          ],
          checklist: [
            { itemKey: 'body', itemLabel: 'Thân xe', status: 'OK' },
            { itemKey: 'power_system', itemLabel: 'Hệ thống nguồn', status: 'OK' },
            { itemKey: 'wheels', itemLabel: 'Bánh xe', status: 'OK' },
          ],
        },
      })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('CHECKED_IN');
  });

  it('allows check-in with no checklist or inspection photos at all — chỉ cần tick xác nhận', async () => {
    // Checklist + ảnh kiểm tra tại quầy đã bỏ (không còn bắt buộc ở BE). Chỉ
    // còn khai báo xe lúc đăng ký + tick xác nhận đạt chuẩn lúc check-in.
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    await activateProvider(provider.id);
    const cafe = await createTestCafe({ provider_id: provider.id });
    const customer = await createTestUser({ role: UserRole.CUSTOMER });
    const token = generateToken(provider);

    const now = new Date();
    const startsAt = new Date(now.getTime() - 30 * 60 * 1000).toISOString();
    const endsAt = new Date(now.getTime() + 30 * 60 * 1000).toISOString();
    const { contestId } = await createContestFixture(provider.id, cafe.id, {
      status: 'RUNNING',
      vehiclePolicy: 'BYOC_ONLY',
      startsAt,
      endsAt,
    });

    const registration = await createRegistrationFixture(contestId, customer.id, {
      status: 'CONFIRMED',
      vehicleSource: 'BYOC',
      metadata: {
        byoc_declaration: {
          vehicle_name: 'Yokomo MD 2.0',
        },
      },
    });

    const res = await request(app)
      .post(`/api/v1/contest-registrations/${registration.id}/check-in`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        checked_in_cafe_id: cafe.id,
        byoc_confirmed: true,
      })
      .expect(200);

    expect(res.body.data.status).toBe('CHECKED_IN');
  });

  it('rejects RENTAL registration without a chosen vehicle model', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    await activateProvider(provider.id);
    const cafe = await createTestCafe({ provider_id: provider.id });
    const customer = await createTestUser({ role: UserRole.CUSTOMER });
    const customerToken = generateToken(customer);

    const { contestId } = await createContestFixture(provider.id, cafe.id, {
      status: 'OPEN',
      vehiclePolicy: 'RENTAL_ONLY',
    });

    const res = await request(app)
      .post(`/api/v1/contests/${contestId}/register`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        vehicle_source: 'RENTAL',
      })
      .expect(400);

    expect(res.body.code).toBe('CONTEST_RENTAL_CHOICE_REQUIRED');
  });
});
