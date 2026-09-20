import request from 'supertest';
import { randomUUID } from 'crypto';
import { app } from '../../app';
import { AppDataSource } from '../../config/database';
import { BookingMode, ProviderStatus, SubscriptionStatus, UserRole } from '../../types';
import { createBooking } from '../../services/booking.service';
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

async function createContestFixture(providerId: string, cafeId: string) {
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

  const [contest] = await AppDataSource.query<{ id: string }[]>(
    `INSERT INTO contests
       (cafe_id, provider_id, name, description, track_type, track_type_id, contest_type_id,
        contest_format_id, contest_template_id, registration_opens_at, registration_closes_at,
        banner_image_url, vehicle_rule, config, starts_at, ends_at, capacity, entry_fee, status, created_by)
     VALUES
       ($1, $2, $3, $4, $5, $6, $7,
        $8, $9, NOW() - INTERVAL '1 day', NOW() + INTERVAL '1 day',
        NULL, $10, $11, NOW() + INTERVAL '1 day', NOW() + INTERVAL '2 days', 32, 0, 'OPEN', $2)
     RETURNING id`,
    [
      cafeId,
      providerId,
      'Contest Booking Guards Test',
      'Contest booking guards test',
      trackType.code,
      trackType.id,
      contestType.id,
      contestFormat.id,
      contestTemplate.id,
      JSON.stringify({ vehicle_policy: 'RENTAL_ONLY', assignment_policy: 'AT_CHECK_IN' }),
      JSON.stringify(contestTemplate.default_config ?? { format: 'KNOCKOUT' }),
    ],
  );

  return { contestId: contest.id, trackTypeId: trackType.id };
}

describe('Contest booking guards', () => {
  it('rejects createBooking when contest_id is attached outside the contest flow', async () => {
    const slotStart = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
    const slotEnd = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000).toISOString();

    await expect(
      createBooking(randomUUID(), {
        cafe_id: randomUUID(),
        play_mode: BookingMode.RENTAL,
        slot_start: slotStart,
        slot_end: slotEnd,
        vehicle_ids: [],
        participants: [],
        fnb_items: [],
        contest_id: randomUUID(),
      }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'CONTEST_ID_NOT_ALLOWED' });
  });

  it('cancels the linked contest registration when the booking is cancelled', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    await activateProvider(provider.id);
    const cafe = await createTestCafe({ provider_id: provider.id });
    const customer = await createTestUser({ role: UserRole.CUSTOMER });
    const customerToken = generateToken(customer);

    const { contestId, trackTypeId } = await createContestFixture(provider.id, cafe.id);

    const [booking] = await AppDataSource.query<{ id: string }[]>(
      `INSERT INTO bookings
         (customer_id, cafe_id, play_mode, slot_start, slot_end, status, track_type_id, payment_expires_at, contest_id, source)
       VALUES ($1, $2, 'RENTAL', NOW() + INTERVAL '2 days', NOW() + INTERVAL '2 days 1 hour', 'CONFIRMED', $3, NOW() + INTERVAL '1 day', $4, 'CONTEST')
       RETURNING id`,
      [customer.id, cafe.id, trackTypeId, contestId],
    );

    const checkInCode = Math.random().toString(36).slice(2, 10).toUpperCase();
    const [registration] = await AppDataSource.query<{ id: string }[]>(
      `INSERT INTO contest_registrations
         (contest_id, user_id, participant_role_snapshot, vehicle_source, status, check_in_code,
          payment_status, metadata, booking_id)
       VALUES ($1, $2, 'CUSTOMER', 'RENTAL', 'CONFIRMED', $3, 'NOT_REQUIRED', '{}', $4)
       RETURNING id`,
      [contestId, customer.id, checkInCode, booking.id],
    );

    await request(app)
      .post(`/api/v1/bookings/${booking.id}/cancel`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ reason: 'Đổi lịch' })
      .expect(200);

    const [updated] = await AppDataSource.query<{ status: string }[]>(
      `SELECT status FROM contest_registrations WHERE id = $1`,
      [registration.id],
    );
    expect(updated.status).toBe('CANCELLED');

    const [audit] = await AppDataSource.query<{ event_type: string }[]>(
      `SELECT event_type FROM contest_audit_logs
       WHERE registration_id = $1 AND event_type = 'registration.cancelled_via_booking_cancel'`,
      [registration.id],
    );
    expect(audit).toBeTruthy();
  });
});
