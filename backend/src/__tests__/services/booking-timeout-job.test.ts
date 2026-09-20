import { AppDataSource } from '../../config/database';
import { processExpiredBookings } from '../../jobs/booking-timeout.job';
import { ProviderStatus, SubscriptionStatus, UserRole } from '../../types';
import { createTestCafe, createTestUser } from '../helpers';

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
  const [contestTemplate] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM contest_templates WHERE contest_format_id = $1 LIMIT 1`,
    [contestFormat.id],
  );

  const [contest] = await AppDataSource.query<{ id: string }[]>(
    `INSERT INTO contests
       (cafe_id, provider_id, name, description, track_type, track_type_id, contest_type_id,
        contest_format_id, contest_template_id, registration_opens_at, registration_closes_at,
        banner_image_url, vehicle_rule, config, starts_at, ends_at, capacity, entry_fee, status, created_by)
     VALUES
       ($1, $2, 'Contest Timeout Job Test', 'Contest timeout job test', $3, $4, $5,
        $6, $7, NOW() - INTERVAL '1 day', NOW() + INTERVAL '1 day',
        NULL, $8, '{}'::jsonb, NOW() + INTERVAL '1 day', NOW() + INTERVAL '2 day', 32, 0, 'OPEN', $2)
     RETURNING id`,
    [
      cafeId,
      providerId,
      trackType.code,
      trackType.id,
      contestType.id,
      contestFormat.id,
      contestTemplate.id,
      JSON.stringify({ vehicle_policy: 'RENTAL_ONLY', assignment_policy: 'AT_CHECK_IN' }),
    ],
  );

  await AppDataSource.query(
    `INSERT INTO contest_cafes (contest_id, cafe_id, role, display_order, check_in_enabled)
     VALUES ($1, $2, 'HOST', 0, TRUE)`,
    [contest.id, cafeId],
  );

  return { contestId: contest.id, trackTypeId: trackType.id };
}

describe('booking-timeout job — contest cascade', () => {
  it('cancels the linked contest registration when a contest booking payment expires', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    await activateProvider(provider.id);
    const cafe = await createTestCafe({ provider_id: provider.id });
    const customer = await createTestUser({ role: UserRole.CUSTOMER });
    const { contestId, trackTypeId } = await createContestFixture(provider.id, cafe.id);

    const [booking] = await AppDataSource.query<{ id: string }[]>(
      `INSERT INTO bookings
         (customer_id, cafe_id, track_type_id, play_mode, source, status, slot_start, slot_end,
          slot_count, payment_expires_at, discount_amount, contest_id)
       VALUES
         ($1, $2, $3, 'RENTAL', 'CONTEST', 'PENDING', NOW() + INTERVAL '25 hours', NOW() + INTERVAL '26 hours',
          1, NOW() - INTERVAL '1 minute', 0, $4)
       RETURNING id`,
      [customer.id, cafe.id, trackTypeId, contestId],
    );

    const [registration] = await AppDataSource.query<{ id: string }[]>(
      `INSERT INTO contest_registrations
         (contest_id, user_id, participant_role_snapshot, vehicle_source, status, check_in_code,
          payment_status, metadata, booking_id)
       VALUES
         ($1, $2, 'CUSTOMER', 'RENTAL', 'PENDING', $3, 'PENDING_PAYMENT', '{}'::jsonb, $4)
       RETURNING id`,
      [contestId, customer.id, Math.random().toString(36).slice(2, 10).toUpperCase(), booking.id],
    );

    await processExpiredBookings();

    const [bookingAfter] = await AppDataSource.query<{ status: string }[]>(
      `SELECT status FROM bookings WHERE id = $1`,
      [booking.id],
    );
    expect(bookingAfter.status).toBe('CANCELLED');

    const [registrationAfter] = await AppDataSource.query<{ status: string }[]>(
      `SELECT status FROM contest_registrations WHERE id = $1`,
      [registration.id],
    );
    expect(registrationAfter.status).toBe('CANCELLED');

    const auditLogs = await AppDataSource.query<{ event_type: string }[]>(
      `SELECT event_type FROM contest_audit_logs WHERE registration_id = $1`,
      [registration.id],
    );
    expect(auditLogs.map((log) => log.event_type)).toContain(
      'registration.cancelled_via_booking_cancel',
    );
  });
});
