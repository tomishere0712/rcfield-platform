import request from 'supertest';
import { app } from '../../app';
import { AppDataSource } from '../../config/database';
import {
  ProviderStatus,
  RaceRecordVerificationStatus,
  SubscriptionStatus,
  UserRole,
  VehicleSource,
} from '../../types';
import { createTestCafe, createTestUser, createTestVehicle, generateToken } from '../helpers';

async function activateProvider(providerId: string): Promise<void> {
  await AppDataSource.query(
    `INSERT INTO provider_profiles (user_id, business_name, registration_status)
     VALUES ($1, $2, $3)`,
    [providerId, 'Racing Provider', ProviderStatus.ACTIVE],
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

async function seedAchievementDefinition(params: {
  code: string;
  name: string;
  ruleCode: string;
  threshold: number;
  titleLabel?: string | null;
  sortOrder?: number;
}) {
  await AppDataSource.query(
    `INSERT INTO achievement_definitions
       (code, name, description, badge_icon_url, title_label, rule_code, rule_config, is_active, sort_order)
     VALUES
       ($1, $2, $3, $4, $5, $6, $7, TRUE, $8)`,
    [
      params.code,
      params.name,
      `${params.name} description`,
      `https://cdn.test/${params.code}.png`,
      params.titleLabel ?? null,
      params.ruleCode,
      JSON.stringify({ threshold: params.threshold }),
      params.sortOrder ?? 100,
    ],
  );
}

async function setRacingProfile(
  userId: string,
  profile: {
    driver_handle: string;
    display_name: string;
    public_profile_enabled?: boolean;
    leaderboard_opt_in?: boolean;
  },
) {
  await AppDataSource.query(`UPDATE users SET racing_profile = $2::jsonb WHERE id = $1`, [
    userId,
    JSON.stringify({
      display_name: profile.display_name,
      driver_handle: profile.driver_handle,
      passport_code: `DRV-${profile.driver_handle.toUpperCase()}`,
      public_profile_enabled: profile.public_profile_enabled ?? true,
      leaderboard_opt_in: profile.leaderboard_opt_in ?? true,
    }),
  ]);
}

async function getTrackType() {
  const [trackType] = await AppDataSource.query<{ id: string; code: string }[]>(
    `SELECT id, code FROM track_types ORDER BY created_at ASC LIMIT 1`,
  );
  return trackType;
}

async function getContestCatalog(formatCode: 'TIME_TRIAL' | 'KNOCKOUT') {
  const [contestType] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM contest_types WHERE code = 'PROVIDER_STANDARD' LIMIT 1`,
  );
  const [contestFormat] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM contest_formats WHERE code = $1 LIMIT 1`,
    [formatCode],
  );
  const [contestTemplate] = await AppDataSource.query<
    { id: string; default_config: Record<string, unknown> }[]
  >(`SELECT id, default_config FROM contest_templates WHERE contest_format_id = $1 LIMIT 1`, [
    contestFormat.id,
  ]);

  return { contestType, contestFormat, contestTemplate };
}

async function createContestRegistration(
  contestId: string,
  userId: string,
  checkInCode: string,
): Promise<{ id: string }> {
  const [registration] = await AppDataSource.query<{ id: string }[]>(
    `INSERT INTO contest_registrations
       (contest_id, user_id, participant_role_snapshot, vehicle_source, status, check_in_code, payment_status, metadata, checked_in_at)
     VALUES
       ($1, $2, 'CUSTOMER', $3, 'CHECKED_IN', $4, 'MARKED_PAID', '{}'::jsonb, NOW())
     RETURNING id`,
    [contestId, userId, VehicleSource.RENTAL, checkInCode],
  );
  return registration;
}

async function createContestSyncFixture(params: {
  providerId: string;
  cafeId: string;
  published: boolean;
  unfinished: boolean;
  participantCount?: number;
}) {
  const trackType = await getTrackType();
  const { contestType, contestFormat, contestTemplate } = await getContestCatalog('TIME_TRIAL');

  const config: Record<string, unknown> = {
    ...(contestTemplate.default_config ?? { format: 'TIME_TRIAL' }),
  };

  if (params.published) {
    config.published_leaderboard = {
      mode: 'BEST_LAP',
      match_count: params.participantCount ?? 2,
      published_at: new Date().toISOString(),
      published_by: params.providerId,
      entries: [],
    };
  }

  const [contest] = await AppDataSource.query<{ id: string }[]>(
    `INSERT INTO contests
       (cafe_id, provider_id, name, description, track_type, track_type_id, contest_type_id,
        contest_format_id, contest_template_id, registration_opens_at, registration_closes_at,
        banner_image_url, vehicle_rule, config, starts_at, ends_at, capacity, entry_fee, status, created_by)
     VALUES
       ($1, $2, 'Racing Sync Contest', 'Contest sync fixture', $3, $4, $5,
        $6, $7, NOW() - INTERVAL '2 day', NOW() - INTERVAL '1 day',
        NULL, $8, $9, NOW() - INTERVAL '1 day', NOW(), 32, 0, 'COMPLETED', $2)
     RETURNING id`,
    [
      params.cafeId,
      params.providerId,
      trackType.code,
      trackType.id,
      contestType.id,
      contestFormat.id,
      contestTemplate.id,
      JSON.stringify({ vehicle_policy: 'RENTAL_ONLY', assignment_policy: 'AT_CHECK_IN' }),
      JSON.stringify(config),
    ],
  );

  await AppDataSource.query(
    `INSERT INTO contest_cafes (contest_id, cafe_id, role, display_order, check_in_enabled)
     VALUES ($1, $2, 'HOST', 0, TRUE)`,
    [contest.id, params.cafeId],
  );

  const registrations: Array<{ id: string; userId: string }> = [];
  const participants: Array<{
    id: string;
    userId: string;
    registrationId: string;
    bestLapMs: number;
  }> = [];
  const participantCount = params.participantCount ?? 2;

  for (let index = 0; index < participantCount; index += 1) {
    const customer = await createTestUser({
      role: UserRole.CUSTOMER,
      full_name: `Driver ${index + 1}`,
    });
    await setRacingProfile(customer.id, {
      driver_handle: `driver-${index + 1}`,
      display_name: `Driver ${index + 1}`,
    });
    const registration = await createContestRegistration(
      contest.id,
      customer.id,
      `SYNC${index + 1}`,
    );
    registrations.push({ id: registration.id, userId: customer.id });

    const matchStatus = params.unfinished && index === participantCount - 1 ? 'READY' : 'COMPLETED';
    const [match] = await AppDataSource.query<{ id: string }[]>(
      `INSERT INTO contest_matches
         (contest_id, cafe_id, track_config_id, round_no, match_no, name, match_type, status,
          scheduled_at, started_at, ended_at, advancement_rule, result_summary, metadata, created_by, decided_by, decided_at)
       VALUES
         ($1, $2, NULL, 1, $3, $4, 'TIME_ATTACK', $5,
          NOW() - INTERVAL '2 hour', NOW() - INTERVAL '2 hour', $6,
          '{}'::jsonb, $7, '{}'::jsonb, $8, $8, NOW() - INTERVAL '1 hour')
       RETURNING id`,
      [
        contest.id,
        params.cafeId,
        index + 1,
        `Heat ${index + 1}`,
        matchStatus,
        matchStatus === 'COMPLETED' ? new Date() : null,
        JSON.stringify({ seeded: true }),
        params.providerId,
      ],
    );

    const bestLapMs = 32000 + index * 1000;
    const [participant] = await AppDataSource.query<{ id: string }[]>(
      `INSERT INTO contest_match_participants
         (match_id, registration_id, slot_no, lane, seed_no, status, finish_position,
          best_lap_ms, total_time_ms, score, is_winner, metadata)
       VALUES
         ($1, $2, 1, 'A', $3, $4, $5, $6, $6, 10, TRUE, '{}'::jsonb)
       RETURNING id`,
      [
        match.id,
        registration.id,
        index + 1,
        matchStatus === 'COMPLETED' ? 'FINISHED' : 'READY',
        matchStatus === 'COMPLETED' ? 1 : null,
        matchStatus === 'COMPLETED' ? bestLapMs : null,
      ],
    );

    participants.push({
      id: participant.id,
      userId: customer.id,
      registrationId: registration.id,
      bestLapMs,
    });
  }

  if (params.published) {
    await AppDataSource.query(
      `UPDATE contests
       SET config = jsonb_set(
         config,
         '{published_leaderboard,entries}',
         $2::jsonb
       )
       WHERE id = $1`,
      [
        contest.id,
        JSON.stringify(
          participants.map((participant, index) => ({
            rank: index + 1,
            registration_id: participant.registrationId,
            best_lap_ms: participant.bestLapMs,
            total_time_ms: participant.bestLapMs,
            latest_finish_position: 1,
            matches_completed: 1,
            progressed_round: 1,
          })),
        ),
      ],
    );
  }

  return { contestId: contest.id, registrations, participants };
}

async function createCompletedPlay(params: {
  customerId: string;
  displayName: string;
  cafeId: string;
  vehicleId: string;
  trackTypeId: string;
  startedAt: Date;
}) {
  const endAt = new Date(params.startedAt.getTime() + 60 * 60 * 1000);

  const [booking] = await AppDataSource.query<{ id: string }[]>(
    `INSERT INTO bookings
       (customer_id, cafe_id, booking_mode, source, track_type_id, status, play_mode,
        slot_start, slot_end, slot_count, payment_expires_at, snapshot, notes)
     VALUES
       ($1, $2, 'SINGLE', 'APP', $3, 'COMPLETED', 'RENTAL',
        $4, $5, 1, $6, $7, 'Passport test fixture')
     RETURNING id`,
    [
      params.customerId,
      params.cafeId,
      params.trackTypeId,
      params.startedAt,
      endAt,
      new Date(params.startedAt.getTime() - 30 * 60 * 1000),
      JSON.stringify({ vehicle_id: params.vehicleId }),
    ],
  );

  const [bookingParticipant] = await AppDataSource.query<{ id: string }[]>(
    `INSERT INTO booking_participants
       (booking_id, user_id, participant_type, display_name, phone, is_primary_responsible)
     VALUES
       ($1, $2, 'REGISTERED_USER', $3, '0911111111', TRUE)
     RETURNING id`,
    [booking.id, params.customerId, params.displayName],
  );

  const [bookingVehicle] = await AppDataSource.query<{ id: string }[]>(
    `INSERT INTO booking_vehicles
       (booking_id, vehicle_id, hourly_rate_snapshot, security_deposit_snapshot)
     VALUES
       ($1, $2, 50000, 150000)
     RETURNING id`,
    [booking.id, params.vehicleId],
  );

  const [session] = await AppDataSource.query<{ id: string }[]>(
    `INSERT INTO sessions
       (booking_id, cafe_id, status, checked_in_by, checked_out_by, actual_start_at, actual_end_at, planned_end_at, notes)
     VALUES
       ($1, $2, 'COMPLETED', $3, $3, $4, $5, $5, 'Passport test fixture')
     RETURNING id`,
    [booking.id, params.cafeId, params.customerId, params.startedAt, endAt],
  );

  const [sessionParticipant] = await AppDataSource.query<{ id: string }[]>(
    `INSERT INTO session_participants
       (session_id, booking_participant_id, user_id, display_name, phone, role, is_primary_responsible, checked_in_at)
     VALUES
       ($1, $2, $3, $4, '0911111111', 'DRIVER', TRUE, $5)
     RETURNING id`,
    [session.id, bookingParticipant.id, params.customerId, params.displayName, params.startedAt],
  );

  await AppDataSource.query(
    `INSERT INTO session_vehicles
       (session_id, booking_vehicle_id, vehicle_source, vehicle_id, assigned_to_participant_id, status, started_at, returned_at)
     VALUES
       ($1, $2, 'RENTAL', $3, $4, 'RETURNED', $5, $6)`,
    [
      session.id,
      bookingVehicle.id,
      params.vehicleId,
      sessionParticipant.id,
      params.startedAt,
      endAt,
    ],
  );
}

describe('Racing network routes', () => {
  it('syncs a published contest into verified race records', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    await activateProvider(provider.id);
    const cafe = await createTestCafe({ provider_id: provider.id });
    const token = generateToken(provider);
    const fixture = await createContestSyncFixture({
      providerId: provider.id,
      cafeId: cafe.id,
      published: true,
      unfinished: false,
      participantCount: 2,
    });

    const response = await request(app)
      .post(`/api/v1/contests/${fixture.contestId}/sync-race-records`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.synced_count).toBe(2);
    expect(response.body.data.superseded_count).toBe(0);

    const records = await AppDataSource.query<{ verification_status: string }[]>(
      `SELECT verification_status FROM race_records WHERE contest_id = $1 ORDER BY created_at ASC`,
      [fixture.contestId],
    );
    expect(records).toHaveLength(2);
    expect(records.every((record) => record.verification_status === 'VERIFIED')).toBe(true);
  });

  it('rejects sync when contest leaderboard has not been published', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    await activateProvider(provider.id);
    const cafe = await createTestCafe({ provider_id: provider.id });
    const token = generateToken(provider);
    const fixture = await createContestSyncFixture({
      providerId: provider.id,
      cafeId: cafe.id,
      published: false,
      unfinished: false,
      participantCount: 1,
    });

    const response = await request(app)
      .post(`/api/v1/contests/${fixture.contestId}/sync-race-records`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(409);

    expect(response.body.code).toBe('CONTEST_LEADERBOARD_NOT_PUBLISHED');
  });

  it('rejects sync when contest still has unfinished matches', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    await activateProvider(provider.id);
    const cafe = await createTestCafe({ provider_id: provider.id });
    const token = generateToken(provider);
    const fixture = await createContestSyncFixture({
      providerId: provider.id,
      cafeId: cafe.id,
      published: true,
      unfinished: true,
      participantCount: 2,
    });

    const response = await request(app)
      .post(`/api/v1/contests/${fixture.contestId}/sync-race-records`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(409);

    expect(response.body.code).toBe('CONTEST_MATCHES_INCOMPLETE');
  });

  it('supersedes old race records when synced again after result correction', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    await activateProvider(provider.id);
    const cafe = await createTestCafe({ provider_id: provider.id });
    const token = generateToken(provider);
    const fixture = await createContestSyncFixture({
      providerId: provider.id,
      cafeId: cafe.id,
      published: true,
      unfinished: false,
      participantCount: 1,
    });

    await request(app)
      .post(`/api/v1/contests/${fixture.contestId}/sync-race-records`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(200);

    await AppDataSource.query(
      `UPDATE contest_match_participants
       SET best_lap_ms = 29990, total_time_ms = 29990
       WHERE id = $1`,
      [fixture.participants[0].id],
    );

    const response = await request(app)
      .post(`/api/v1/contests/${fixture.contestId}/sync-race-records`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(200);

    expect(response.body.data.synced_count).toBe(1);
    expect(response.body.data.superseded_count).toBe(1);

    const records = await AppDataSource.query<
      { verification_status: string; best_lap_ms: number }[]
    >(
      `SELECT verification_status, best_lap_ms
       FROM race_records
       WHERE contest_match_participant_id = $1
       ORDER BY created_at ASC`,
      [fixture.participants[0].id],
    );

    expect(records).toHaveLength(2);
    expect(records[0].verification_status).toBe(RaceRecordVerificationStatus.SUPERSEDED);
    expect(records[1]).toMatchObject({
      verification_status: RaceRecordVerificationStatus.VERIFIED,
      best_lap_ms: 29990,
    });
  });

  it('unlocks the 5-cafe achievement only from distinct completed plays and does not duplicate on rerun', async () => {
    await seedAchievementDefinition({
      code: 'SPEED_NOMAD_5_CAFES',
      name: 'Kẻ du mục tốc độ',
      ruleCode: 'DISTINCT_CAFES_FROM_COMPLETED_PLAY',
      threshold: 5,
      titleLabel: 'Kẻ du mục tốc độ',
      sortOrder: 500,
    });

    const customer = await createTestUser({
      role: UserRole.CUSTOMER,
      full_name: 'Passport Driver',
    });
    await setRacingProfile(customer.id, {
      driver_handle: 'passport-driver',
      display_name: 'Passport Driver',
    });
    const token = generateToken(customer);
    const trackType = await getTrackType();

    const cafeA = await createTestCafe();
    const cafeB = await createTestCafe();
    const cafeC = await createTestCafe();
    const cafeD = await createTestCafe();
    const cafeE = await createTestCafe();

    const vehicleA = await createTestVehicle({ cafe_id: cafeA.id });
    const vehicleB = await createTestVehicle({ cafe_id: cafeB.id });
    const vehicleC = await createTestVehicle({ cafe_id: cafeC.id });
    const vehicleD = await createTestVehicle({ cafe_id: cafeD.id });
    const vehicleE = await createTestVehicle({ cafe_id: cafeE.id });

    const startAt = new Date('2026-06-01T09:00:00Z');
    await createCompletedPlay({
      customerId: customer.id,
      displayName: 'Passport Driver',
      cafeId: cafeA.id,
      vehicleId: vehicleA.id,
      trackTypeId: trackType.id,
      startedAt: startAt,
    });
    await createCompletedPlay({
      customerId: customer.id,
      displayName: 'Passport Driver',
      cafeId: cafeB.id,
      vehicleId: vehicleB.id,
      trackTypeId: trackType.id,
      startedAt: new Date(startAt.getTime() + 1 * 24 * 60 * 60 * 1000),
    });
    await createCompletedPlay({
      customerId: customer.id,
      displayName: 'Passport Driver',
      cafeId: cafeC.id,
      vehicleId: vehicleC.id,
      trackTypeId: trackType.id,
      startedAt: new Date(startAt.getTime() + 2 * 24 * 60 * 60 * 1000),
    });
    await createCompletedPlay({
      customerId: customer.id,
      displayName: 'Passport Driver',
      cafeId: cafeD.id,
      vehicleId: vehicleD.id,
      trackTypeId: trackType.id,
      startedAt: new Date(startAt.getTime() + 3 * 24 * 60 * 60 * 1000),
    });
    await createCompletedPlay({
      customerId: customer.id,
      displayName: 'Passport Driver',
      cafeId: cafeA.id,
      vehicleId: vehicleA.id,
      trackTypeId: trackType.id,
      startedAt: new Date(startAt.getTime() + 4 * 24 * 60 * 60 * 1000),
    });

    const beforeDistinctUnlock = await request(app)
      .get('/api/v1/me/driver-passport')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(beforeDistinctUnlock.body.data.stats.completed_plays).toBe(5);
    expect(beforeDistinctUnlock.body.data.stats.distinct_cafes_played).toBe(4);
    expect(beforeDistinctUnlock.body.data.achievements).toHaveLength(0);

    await createCompletedPlay({
      customerId: customer.id,
      displayName: 'Passport Driver',
      cafeId: cafeE.id,
      vehicleId: vehicleE.id,
      trackTypeId: trackType.id,
      startedAt: new Date(startAt.getTime() + 5 * 24 * 60 * 60 * 1000),
    });

    const firstUnlock = await request(app)
      .get('/api/v1/me/driver-passport')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(firstUnlock.body.data.stats.distinct_cafes_played).toBe(5);
    expect(firstUnlock.body.data.achievements).toHaveLength(1);
    expect(firstUnlock.body.data.achievements[0].code).toBe('SPEED_NOMAD_5_CAFES');
    expect(firstUnlock.body.data.current_title.label).toBe('Kẻ du mục tốc độ');

    const secondUnlock = await request(app)
      .get('/api/v1/me/driver-passport')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(secondUnlock.body.data.achievements).toHaveLength(1);
    expect(secondUnlock.body.data.achievements[0].code).toBe('SPEED_NOMAD_5_CAFES');
  });

  it('returns only public verified leaderboard data and hides sensitive fields', async () => {
    await seedAchievementDefinition({
      code: 'GRID_VERIFIED_1',
      name: 'Đã lên sàn đấu',
      ruleCode: 'VERIFIED_RACE_RECORD_COUNT',
      threshold: 1,
    });

    const provider = await createTestUser({ role: UserRole.PROVIDER });
    await activateProvider(provider.id);
    const cafe = await createTestCafe({ provider_id: provider.id });
    const token = generateToken(provider);
    const fixture = await createContestSyncFixture({
      providerId: provider.id,
      cafeId: cafe.id,
      published: true,
      unfinished: false,
      participantCount: 1,
    });

    const hiddenCustomer = await createTestUser({
      role: UserRole.CUSTOMER,
      email: 'hidden-driver@test.com',
      full_name: 'Hidden Driver',
    });
    await setRacingProfile(hiddenCustomer.id, {
      driver_handle: 'hidden-driver',
      display_name: 'Hidden Driver',
      leaderboard_opt_in: false,
    });

    await request(app)
      .post(`/api/v1/contests/${fixture.contestId}/sync-race-records`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(200);

    await AppDataSource.query(
      `INSERT INTO race_records
         (user_id, provider_id, cafe_id, track_config_id, contest_id, match_id, contest_match_participant_id,
          session_id, vehicle_source, source_type, verification_status, best_lap_ms, total_time_ms,
          score, finish_position, recorded_at, verified_at, verified_by, metadata)
       VALUES
         ($1, $2, $3, NULL, NULL, NULL, NULL, NULL, 'RENTAL', 'CONTEST', 'VERIFIED', 28000, 28000,
          10, 1, NOW(), NOW(), $2, '{}'::jsonb)`,
      [hiddenCustomer.id, provider.id, cafe.id],
    );

    await AppDataSource.query(
      `INSERT INTO race_records
         (user_id, provider_id, cafe_id, track_config_id, contest_id, match_id, contest_match_participant_id,
          session_id, vehicle_source, source_type, verification_status, best_lap_ms, total_time_ms,
          score, finish_position, recorded_at, verified_at, verified_by, metadata)
       VALUES
         ($1, $2, $3, NULL, NULL, NULL, NULL, NULL, 'RENTAL', 'CONTEST', 'PENDING', 27000, 27000,
          10, 1, NOW(), NULL, NULL, '{}'::jsonb)`,
      [fixture.participants[0].userId, provider.id, cafe.id],
    );

    const leaderboardResponse = await request(app)
      .get('/api/v1/leaderboards/global')
      .query({ period: 'all_time' })
      .expect(200);

    expect(leaderboardResponse.body.data).toHaveLength(1);
    expect(leaderboardResponse.body.data[0].driver_handle).toBe('driver-1');
    expect(leaderboardResponse.body.data[0]).not.toHaveProperty('email');
    expect(leaderboardResponse.body.data[0]).not.toHaveProperty('phone');
    expect(leaderboardResponse.body.data[0]).not.toHaveProperty('payment_note');

    const driverResponse = await request(app).get('/api/v1/drivers/driver-1').expect(200);

    expect(driverResponse.body.data.driver_handle).toBe('driver-1');
    expect(driverResponse.body.data).not.toHaveProperty('email');
    expect(driverResponse.body.data).not.toHaveProperty('phone');
    expect(driverResponse.body.data).not.toHaveProperty('payment_data');
  });
});
