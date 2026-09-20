import request from 'supertest';
import { app } from '../../app';
import { AppDataSource } from '../../config/database';
import { processContestReminders } from '../../jobs/contest-reminder.job';
import { createCheckoutUrl, processMockConfirmation } from '../../services/payment.service';
import {
  NotificationType,
  ProviderStatus,
  SubscriptionStatus,
  UserRole,
  VehicleSource,
} from '../../types';
import { createTestCafe, createTestUser, createTestVehicle, generateToken } from '../helpers';

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
  formatCode: 'TIME_TRIAL' | 'KNOCKOUT',
  overrides?: Partial<{
    entryFee: number;
    vehiclePolicy: 'RENTAL_ONLY' | 'BYOC_ONLY' | 'MIXED';
    capacity: number;
  }>,
) {
  const [trackType] = await AppDataSource.query<{ id: string; code: string }[]>(
    `SELECT id, code FROM track_types ORDER BY created_at ASC LIMIT 1`,
  );
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

  const [contest] = await AppDataSource.query<{ id: string }[]>(
    `INSERT INTO contests
       (cafe_id, provider_id, name, description, track_type, track_type_id, contest_type_id,
        contest_format_id, contest_template_id, registration_opens_at, registration_closes_at,
        banner_image_url, vehicle_rule, config, starts_at, ends_at, capacity, entry_fee, status, created_by)
     VALUES
       ($1, $2, $3, $4, $5, $6, $7,
        $8, $9, NOW() - INTERVAL '1 day', NOW() + INTERVAL '1 day',
        NULL, $10, $11, NOW() + INTERVAL '1 day', NOW() + INTERVAL '2 day', $13, $12, 'OPEN', $2)
     RETURNING id`,
    [
      cafeId,
      providerId,
      `Contest ${formatCode}`,
      `Contest test cho ${formatCode}`,
      trackType.code,
      trackType.id,
      contestType.id,
      contestFormat.id,
      contestTemplate.id,
      JSON.stringify({
        vehicle_policy: overrides?.vehiclePolicy ?? 'RENTAL_ONLY',
        assignment_policy: 'AT_CHECK_IN',
      }),
      JSON.stringify(contestTemplate.default_config ?? { format: formatCode }),
      overrides?.entryFee ?? 0,
      overrides?.capacity ?? 32,
    ],
  );

  await AppDataSource.query(
    `INSERT INTO contest_cafes (contest_id, cafe_id, role, display_order, check_in_enabled)
     VALUES ($1, $2, 'HOST', 0, TRUE)`,
    [contest.id, cafeId],
  );

  return { contestId: contest.id, trackTypeId: trackType.id };
}

async function createContestPayload(
  cafeId: string,
  formatCode: 'TIME_TRIAL' | 'KNOCKOUT',
  overrides?: Partial<{
    starts_at: string;
    ends_at: string;
    registration_opens_at: string;
    registration_closes_at: string;
    config: Record<string, unknown>;
  }>,
) {
  const [trackType] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM track_types ORDER BY created_at ASC LIMIT 1`,
  );
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

  const startsAt = overrides?.starts_at ?? new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();
  const endsAt = overrides?.ends_at ?? new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString();

  // createContest requires participating cafes to operate the contest's track type.
  await AppDataSource.query(
    `INSERT INTO cafe_track_configs (cafe_id, track_type_id, max_concurrent, byoc_capacity, is_active)
     VALUES ($1, $2, 2, 5, true)`,
    [cafeId, trackType.id],
  );

  return {
    name: `Contest ${formatCode}`,
    description: `Contest test cho ${formatCode}`,
    contest_type_id: contestType.id,
    contest_format_id: contestFormat.id,
    contest_template_id: contestTemplate.id,
    track_type_id: trackType.id,
    participating_cafe_ids: [cafeId],
    starts_at: startsAt,
    ends_at: endsAt,
    registration_opens_at:
      overrides?.registration_opens_at ?? new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    registration_closes_at:
      overrides?.registration_closes_at ?? new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
    capacity: 32,
    entry_fee: 0,
    banner_image_url: null,
    vehicle_rule: { vehicle_policy: 'RENTAL_ONLY', assignment_policy: 'AT_CHECK_IN' },
    config: {
      ...(contestTemplate.default_config ?? {}),
      ...(overrides?.config ?? {}),
    },
  };
}

async function createRegistrationFixture(
  contestId: string,
  status: 'CONFIRMED' | 'CHECKED_IN' = 'CHECKED_IN',
) {
  const customer = await createTestUser({ role: UserRole.CUSTOMER });
  const code = Math.random().toString(36).slice(2, 10).toUpperCase();
  const checkedInAt = status === 'CHECKED_IN' ? new Date() : null;
  const [registration] = await AppDataSource.query<{ id: string; user_id: string }[]>(
    `INSERT INTO contest_registrations
       (contest_id, user_id, participant_role_snapshot, vehicle_source, status, check_in_code,
        payment_status, metadata, checked_in_at)
     VALUES
       ($1, $2, 'CUSTOMER', $3, $4, $5, 'MARKED_PAID', '{}'::jsonb, $6)
     RETURNING id, user_id`,
    [contestId, customer.id, VehicleSource.RENTAL, status, code, checkedInAt],
  );
  return registration;
}

describe('Contest runtime routes', () => {
  it('time trial flow: generate matches, submit results, publish leaderboard, read metrics and audit logs', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    await activateProvider(provider.id);
    const cafe = await createTestCafe({ provider_id: provider.id });
    const token = generateToken(provider);
    const { contestId } = await createContestFixture(provider.id, cafe.id, 'TIME_TRIAL');
    const registrationA = await createRegistrationFixture(contestId, 'CHECKED_IN');
    const registrationB = await createRegistrationFixture(contestId, 'CHECKED_IN');

    const generateRes = await request(app)
      .post(`/api/v1/contests/${contestId}/matches/generate`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        cafe_id: cafe.id,
        registration_ids: [registrationA.id, registrationB.id],
      })
      .expect(201);

    // 2 VĐV × 3 lượt mặc định. Đua tính giờ thật cho mỗi người vài lượt rồi lấy
    // lap tốt nhất; trước đây mỗi người đúng một lượt và không có đường chạy lại.
    expect(generateRes.body.success).toBe(true);
    expect(generateRes.body.data).toHaveLength(6);
    expect(generateRes.body.data[0].participants).toHaveLength(1);

    const matchesRes = await request(app)
      .get(`/api/v1/contests/${contestId}/matches`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    // Lap tốt nhất của A là 34.00 ở lượt 2, của B là 33.10 ở lượt 1 — bảng xếp
    // hạng phải lấy đúng hai con số đó chứ không phải lượt cuối cùng nhập.
    const lapsByRegistration: Record<string, number[]> = {
      [registrationA.id]: [35.21, 34.0, 36.5],
      [registrationB.id]: [33.1, 38.0, 39.0],
    };

    for (const match of matchesRes.body.data) {
      const participant = match.participants[0];
      const lap = lapsByRegistration[participant.registration_id][match.metadata.run_no - 1];
      await request(app)
        .post(`/api/v1/contest-matches/${match.id}/results`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          reason: `Lượt ${match.metadata.run_no}`,
          results: [
            {
              registration_id: participant.registration_id,
              best_lap_seconds: lap,
              total_time_seconds: lap,
            },
          ],
        })
        .expect(200);
    }

    // Chạy một mình thì không có "người thắng". Trước đây mọi lượt đều gắn
    // is_winner vì `Math.max(1, 0 || 1)` nuốt mất số 0 đã khai trong luật trận.
    const afterResultsRes = await request(app)
      .get(`/api/v1/contests/${contestId}/matches`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const anyWinner = afterResultsRes.body.data.some(
      (match: { participants: { is_winner: boolean }[] }) =>
        match.participants.some((participant) => participant.is_winner),
    );
    expect(anyWinner).toBe(false);

    const leaderboardRes = await request(app)
      .post(`/api/v1/contests/${contestId}/leaderboard/publish`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(200);

    expect(leaderboardRes.body.data.mode).toBe('BEST_LAP');
    expect(leaderboardRes.body.data.entries).toHaveLength(2);
    expect(leaderboardRes.body.data.entries[0]).toMatchObject({
      registration_id: registrationB.id,
      rank: 1,
      best_lap_seconds: 33.1,
    });
    expect(leaderboardRes.body.data.entries[1]).toMatchObject({
      registration_id: registrationA.id,
      rank: 2,
      best_lap_seconds: 34.0,
    });

    const metricsRes = await request(app)
      .get(`/api/v1/contests/${contestId}/metrics`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(metricsRes.body.data.match_counts.completed).toBe(6);
    expect(metricsRes.body.data.leaderboard.published).toBe(true);

    const auditRes = await request(app)
      .get(`/api/v1/contests/${contestId}/audit-logs`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(auditRes.body.data.map((item: { eventType: string }) => item.eventType)).toEqual(
      expect.arrayContaining([
        'contest.matches_generated',
        'match.results_submitted',
        'contest.leaderboard_published',
      ]),
    );
  });

  it('knockout flow: advance winners and require force correction when downstream already linked', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    await activateProvider(provider.id);
    const cafe = await createTestCafe({ provider_id: provider.id });
    const token = generateToken(provider);
    // 4 suất cho đúng 4 tay đua: sơ đồ đầy, không có ô trống nào.
    const { contestId } = await createContestFixture(provider.id, cafe.id, 'KNOCKOUT', {
      capacity: 4,
    });
    const registrationA = await createRegistrationFixture(contestId, 'CHECKED_IN');
    const registrationB = await createRegistrationFixture(contestId, 'CHECKED_IN');
    const registrationC = await createRegistrationFixture(contestId, 'CHECKED_IN');
    const registrationD = await createRegistrationFixture(contestId, 'CHECKED_IN');

    const generateRes = await request(app)
      .post(`/api/v1/contests/${contestId}/matches/generate`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        cafe_id: cafe.id,
        registration_ids: [registrationA.id, registrationB.id, registrationC.id, registrationD.id],
        drivers_per_match: 2,
      })
      .expect(201);

    const roundOneMatches = generateRes.body.data.filter(
      (match: { round_no: number }) => match.round_no === 1,
    );
    const semifinal = roundOneMatches[0];
    const semifinalWinner = semifinal.participants[0].registration_id;
    const semifinalLoser = semifinal.participants[1].registration_id;

    await request(app)
      .post(`/api/v1/contest-matches/${semifinal.id}/results`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        reason: 'Semifinal done',
        results: [
          {
            registration_id: semifinalWinner,
            finish_position: 1,
            is_winner: true,
          },
          {
            registration_id: semifinalLoser,
            finish_position: 2,
          },
        ],
      })
      .expect(200);

    const advanceRes = await request(app)
      .post(`/api/v1/contest-matches/${semifinal.id}/advance`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(200);

    const finalMatch = advanceRes.body.data.find(
      (match: { round_no: number }) => match.round_no === 2,
    );
    expect(finalMatch.participants).toHaveLength(1);
    expect(finalMatch.participants[0].registration_id).toBe(semifinalWinner);

    const blockedCorrectionRes = await request(app)
      .post(`/api/v1/contest-matches/${semifinal.id}/results/correct`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        reason: 'Swap semifinal result',
        results: [
          {
            registration_id: semifinalWinner,
            finish_position: 2,
          },
          {
            registration_id: semifinalLoser,
            finish_position: 1,
            is_winner: true,
          },
        ],
      })
      .expect(409);

    expect(blockedCorrectionRes.body.code).toBe('MATCH_CORRECTION_REQUIRES_FORCE');

    const forcedCorrectionRes = await request(app)
      .post(`/api/v1/contest-matches/${semifinal.id}/results/correct`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        reason: 'Force swap semifinal result',
        force_cascade: true,
        results: [
          {
            registration_id: semifinalWinner,
            finish_position: 2,
          },
          {
            registration_id: semifinalLoser,
            finish_position: 1,
            is_winner: true,
          },
        ],
      })
      .expect(200);

    // Sửa xong là người thắng mới sang vòng sau ngay, không phải bấm advance
    // thêm lần nữa. Người thắng cũ bị gỡ chứ không nằm lại bên cạnh.
    const correctedFinal = forcedCorrectionRes.body.data.find(
      (match: { round_no: number }) => match.round_no === 2,
    );
    expect(correctedFinal.participants).toHaveLength(1);
    expect(correctedFinal.participants[0].registration_id).toBe(semifinalLoser);

    // Bấm đồng bộ lại vẫn ra đúng như vậy — phép đẩy là bất biến.
    const reAdvanceRes = await request(app)
      .post(`/api/v1/contest-matches/${semifinal.id}/advance`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(200);

    const updatedFinal = reAdvanceRes.body.data.find(
      (match: { round_no: number }) => match.round_no === 2,
    );
    expect(updatedFinal.participants).toHaveLength(1);
    expect(updatedFinal.participants[0].registration_id).toBe(semifinalLoser);
  });

  it('không cho tạo runtime từ registration chưa check-in', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    await activateProvider(provider.id);
    const cafe = await createTestCafe({ provider_id: provider.id });
    const token = generateToken(provider);
    const { contestId } = await createContestFixture(provider.id, cafe.id, 'TIME_TRIAL');
    const registration = await createRegistrationFixture(contestId, 'CONFIRMED');

    const res = await request(app)
      .post(`/api/v1/contests/${contestId}/matches/generate`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        cafe_id: cafe.id,
        registration_ids: [registration.id],
      })
      .expect(400);

    expect(res.body.code).toBe('REGISTRATION_NOT_RUNTIME_READY');
  });

  it('chặn tạo contest khi trùng booking đã có', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    await activateProvider(provider.id);
    const cafe = await createTestCafe({ provider_id: provider.id });
    const customer = await createTestUser({ role: UserRole.CUSTOMER });
    const token = generateToken(provider);
    const payload = await createContestPayload(cafe.id, 'KNOCKOUT');

    await AppDataSource.query(
      `INSERT INTO bookings
         (customer_id, cafe_id, track_type_id, play_mode, source, status, slot_start, slot_end, slot_count, payment_expires_at, discount_amount)
       VALUES
         ($1, $2, $3, 'RENTAL', 'APP', 'CONFIRMED', $4, $5, 1, NOW() + INTERVAL '30 minutes', 0)`,
      [customer.id, cafe.id, payload.track_type_id, payload.starts_at, payload.ends_at],
    );

    const res = await request(app)
      .post('/api/v1/contests')
      .set('Authorization', `Bearer ${token}`)
      .send(payload)
      .expect(409);

    expect(res.body.code).toBe('CONTEST_BOOKING_CONFLICT');
  });

  it('chặn tạo contest khi chi nhánh tham gia không có loại đường đua đó', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    await activateProvider(provider.id);
    const cafe = await createTestCafe({ provider_id: provider.id });
    const token = generateToken(provider);
    const payload = await createContestPayload(cafe.id, 'KNOCKOUT');

    const [otherTrackType] = await AppDataSource.query<{ id: string }[]>(
      `SELECT id FROM track_types WHERE id <> $1 LIMIT 1`,
      [payload.track_type_id],
    );

    const res = await request(app)
      .post('/api/v1/contests')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...payload, track_type_id: otherTrackType.id })
      .expect(400);

    expect(res.body.code).toBe('CONTEST_TRACK_TYPE_UNAVAILABLE');
  });

  it('availability báo hết chỗ khi khung giờ đã bị contest giữ', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    await activateProvider(provider.id);
    const cafe = await createTestCafe({ provider_id: provider.id });
    const token = generateToken(provider);
    // Bài này kiểm tra việc giữ chỗ, thể thức chỉ là thứ đi kèm. Phải là thể
    // thức đã mở vì tạo giải qua API nay chặn thể thức còn dở; các bài khác
    // trong file dựng contest thẳng bằng SQL nên không vướng.
    const payload = await createContestPayload(cafe.id, 'KNOCKOUT');

    await request(app)
      .post('/api/v1/contests')
      .set('Authorization', `Bearer ${token}`)
      .send(payload)
      .expect(201);

    const res = await request(app)
      .get(`/api/v1/cafes/${cafe.id}/availability`)
      .query({
        slot_start: payload.starts_at,
        slot_end: payload.ends_at,
        play_mode: 'RENTAL',
      })
      .expect(200);

    expect(res.body.data.available).toBe(false);
    expect(res.body.data.vehicles).toHaveLength(0);
  });

  it('assigned staff có thể check-in, vận hành runtime và xem metrics của contest được bàn giao', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    await activateProvider(provider.id);
    const staff = await createTestUser({ role: UserRole.STAFF });
    const cafe = await createTestCafe({ provider_id: provider.id });
    const providerToken = generateToken(provider);
    const staffToken = generateToken(staff);
    const { contestId } = await createContestFixture(provider.id, cafe.id, 'TIME_TRIAL');
    const registration = await createRegistrationFixture(contestId, 'CONFIRMED');

    await request(app)
      .post(`/api/v1/contests/${contestId}/staff-assignments`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send({ staff_id: staff.id })
      .expect(200);

    // Staff must also be assigned to the cafe to operate there.
    await AppDataSource.query(
      `INSERT INTO staff_cafe_assignments (staff_id, cafe_id, assigned_by)
       VALUES ($1, $2, $3)`,
      [staff.id, cafe.id, provider.id],
    );

    // Check-in requires the contest to be CLOSED or RUNNING and within the race window.
    await AppDataSource.query(
      `UPDATE contests
       SET starts_at = NOW() - INTERVAL '1 hour', ends_at = NOW() + INTERVAL '1 hour'
       WHERE id = $1`,
      [contestId],
    );

    await request(app)
      .post(`/api/v1/contests/${contestId}/close`)
      .set('Authorization', `Bearer ${providerToken}`)
      .expect(200);

    await request(app)
      .post(`/api/v1/contest-registrations/${registration.id}/check-in`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ checked_in_cafe_id: cafe.id })
      .expect(200);

    const generateRes = await request(app)
      .post(`/api/v1/contests/${contestId}/matches/generate`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ cafe_id: cafe.id, registration_ids: [registration.id] })
      .expect(201);

    const matchId = generateRes.body.data[0].id;
    await request(app)
      .post(`/api/v1/contest-matches/${matchId}/results`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        reason: 'Staff run time trial',
        results: [
          {
            registration_id: registration.id,
            finish_position: 1,
            best_lap_seconds: 32.45,
            total_time_seconds: 32.45,
          },
        ],
      })
      .expect(200);

    const metricsRes = await request(app)
      .get(`/api/v1/contests/${contestId}/metrics`)
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200);

    expect(metricsRes.body.data.match_counts.completed).toBe(1);
    expect(metricsRes.body.data.registration_counts.checked_in).toBe(1);
  });

  it('staff thuộc cafe nhưng chưa được phân công trực tiếp vào contest thì không có quyền vận hành', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    await activateProvider(provider.id);
    const staff = await createTestUser({ role: UserRole.STAFF });
    const cafe = await createTestCafe({ provider_id: provider.id });
    const staffToken = generateToken(staff);
    const { contestId } = await createContestFixture(provider.id, cafe.id, 'TIME_TRIAL');

    await AppDataSource.query(
      `INSERT INTO staff_cafe_assignments (staff_id, cafe_id, assigned_by)
       VALUES ($1, $2, $3)`,
      [staff.id, cafe.id, provider.id],
    );

    const res = await request(app)
      .get(`/api/v1/contests/${contestId}/metrics`)
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(403);

    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('customer có thể đăng ký BYOC contest khi contest cho phép và provider duyệt thủ công', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    await activateProvider(provider.id);
    const cafe = await createTestCafe({ provider_id: provider.id });
    const customer = await createTestUser({ role: UserRole.CUSTOMER });
    const providerToken = generateToken(provider);
    const customerToken = generateToken(customer);
    const { contestId } = await createContestFixture(provider.id, cafe.id, 'TIME_TRIAL', {
      vehiclePolicy: 'MIXED',
    });

    const registerRes = await request(app)
      .post(`/api/v1/contests/${contestId}/register`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        vehicle_source: 'BYOC',
        byoc_vehicle_name: 'MST RMX 2.5',
        byoc_vehicle_brand: 'MST',
        byoc_vehicle_class: 'Drift',
      })
      .expect(201);

    expect(registerRes.body.data.vehicle_source).toBe('BYOC');
    expect(registerRes.body.data.metadata.byoc_declaration.vehicle_name).toBe('MST RMX 2.5');

    const approvedRes = await request(app)
      .post(`/api/v1/contest-registrations/${registerRes.body.data.id}/approve`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send({ reason: 'BYOC declaration accepted' })
      .expect(200);

    expect(approvedRes.body.data.status).toBe('CONFIRMED');
  });

  it('chặn đăng ký BYOC khi contest yêu cầu RENTAL_ONLY', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    await activateProvider(provider.id);
    const cafe = await createTestCafe({ provider_id: provider.id });
    const customer = await createTestUser({ role: UserRole.CUSTOMER });
    const customerToken = generateToken(customer);
    const { contestId } = await createContestFixture(provider.id, cafe.id, 'TIME_TRIAL', {
      vehiclePolicy: 'RENTAL_ONLY',
    });

    const res = await request(app)
      .post(`/api/v1/contests/${contestId}/register`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        vehicle_source: 'BYOC',
        byoc_vehicle_name: 'MST RMX 2.5',
      })
      .expect(400);

    expect(res.body.code).toBe('CONTEST_VEHICLE_POLICY_VIOLATED');
  });

  it('chặn đăng ký RENTAL khi contest chỉ cho BYOC_ONLY', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    await activateProvider(provider.id);
    const cafe = await createTestCafe({ provider_id: provider.id });
    const customer = await createTestUser({ role: UserRole.CUSTOMER });
    const customerToken = generateToken(customer);
    const { contestId } = await createContestFixture(provider.id, cafe.id, 'TIME_TRIAL', {
      vehiclePolicy: 'BYOC_ONLY',
    });

    const res = await request(app)
      .post(`/api/v1/contests/${contestId}/register`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        vehicle_source: 'RENTAL',
      })
      .expect(400);

    expect(res.body.code).toBe('CONTEST_VEHICLE_POLICY_VIOLATED');
  });

  it('ban contest sẽ chặn customer đăng ký mới', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    await activateProvider(provider.id);
    const cafe = await createTestCafe({ provider_id: provider.id });
    const customer = await createTestUser({ role: UserRole.CUSTOMER });
    const providerToken = generateToken(provider);
    const customerToken = generateToken(customer);
    const { contestId } = await createContestFixture(provider.id, cafe.id, 'TIME_TRIAL', {
      vehiclePolicy: 'MIXED',
    });

    await request(app)
      .post(`/api/v1/contests/${contestId}/bans`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send({
        user_id: customer.id,
        scope_type: 'CONTEST',
        reason: 'Intentional sabotage',
      })
      .expect(201);

    const res = await request(app)
      .post(`/api/v1/contests/${contestId}/register`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        vehicle_source: 'BYOC',
        byoc_vehicle_name: 'Yokomo YD-2',
      })
      .expect(403);

    expect(res.body.code).toBe('CONTEST_PARTICIPANT_BANNED');
  });

  it('customer có thể tạo payment URL cho contest entry fee của đăng ký BYOC', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    await activateProvider(provider.id);
    const cafe = await createTestCafe({ provider_id: provider.id });
    const customer = await createTestUser({ role: UserRole.CUSTOMER });
    const customerToken = generateToken(customer);
    const { contestId } = await createContestFixture(provider.id, cafe.id, 'TIME_TRIAL', {
      entryFee: 150000,
      vehiclePolicy: 'MIXED',
    });
    const registerRes = await request(app)
      .post(`/api/v1/contests/${contestId}/register`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        vehicle_source: 'BYOC',
        byoc_vehicle_name: 'Yokomo YD-2',
      })
      .expect(201);

    const paymentRes = await request(app)
      .post(`/api/v1/contest-registrations/${registerRes.body.data.id}/create-entry-fee-payment`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({})
      .expect(201);

    expect(paymentRes.body.data.payment_url).toContain('vnp');
    expect(paymentRes.body.data.txn_ref).toContain('contest_');
  });

  it('dang ky thue xe o giai mien phi duoc xac nhan tu dong', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    await activateProvider(provider.id);
    const cafe = await createTestCafe({ provider_id: provider.id });
    const customer = await createTestUser({ role: UserRole.CUSTOMER });
    const customerToken = generateToken(customer);
    const { contestId, trackTypeId } = await createContestFixture(
      provider.id,
      cafe.id,
      'TIME_TRIAL',
    );
    const vehicle = await createTestVehicle({
      cafe_id: cafe.id,
      compatible_track_types: [trackTypeId],
    });

    const registerRes = await request(app)
      .post(`/api/v1/contests/${contestId}/register`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        vehicle_source: 'RENTAL',
        rental: {
          cafe_id: cafe.id,
          vehicle_catalog_id: vehicle.catalog_id,
        },
      })
      .expect(201);

    expect(registerRes.body.success).toBe(true);

    const notifications = await AppDataSource.query<{ type: string; title: string }[]>(
      `SELECT type, title FROM notifications WHERE user_id = $1 ORDER BY created_at DESC`,
      [customer.id],
    );

    const types = notifications.map((item) => item.type);
    expect(types).toContain(NotificationType.CONTEST_REGISTRATION_CREATED);
    // Giải miễn phí + thuê xe của quán: không có gì để duyệt nên hệ thống xác
    // nhận luôn, khách nhận được mã check-in ngay thay vì chờ provider bấm nút.
    expect(types).toContain(NotificationType.CONTEST_REGISTRATION_APPROVED);

    const [registration] = await AppDataSource.query<{ status: string }[]>(
      `SELECT status FROM contest_registrations WHERE id = $1`,
      [registerRes.body.data.id],
    );
    expect(registration.status).toBe('CONFIRMED');
  });

  it('boc tham dau loai truoc ngay thi tu nguoi da duyet, va boc lai duoc khi chua ai thi dau', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    await activateProvider(provider.id);
    const cafe = await createTestCafe({ provider_id: provider.id });
    const token = generateToken(provider);
    const { contestId } = await createContestFixture(provider.id, cafe.id, 'KNOCKOUT', {
      capacity: 8,
    });

    // 5 người MỚI ĐƯỢC DUYỆT, chưa ai check-in — đúng tình huống bốc thăm trước ngày thi.
    for (let i = 0; i < 5; i += 1) {
      await createRegistrationFixture(contestId, 'CONFIRMED');
    }

    // Không gửi registration_ids: hệ thống tự bốc cả giải.
    const drawRes = await request(app)
      .post(`/api/v1/contests/${contestId}/matches/generate`)
      .set('Authorization', `Bearer ${token}`)
      .send({ cafe_id: cafe.id })
      .expect(201);

    // 5 người trong sơ đồ 8 suất: 1 trận thật + 3 suất thắng do ô trống.
    const playable = drawRes.body.data.filter(
      (match: { status: string }) => match.status !== 'COMPLETED',
    );
    expect(playable).toHaveLength(4);

    // Lá thăm được lưu lại để dựng lại khi có khiếu nại.
    const [contestRow] = await AppDataSource.query<
      { config: { bracket_draw?: { seed: number; registration_order: string[] } } }[]
    >(`SELECT config FROM contests WHERE id = $1`, [contestId]);
    expect(typeof contestRow.config.bracket_draw?.seed).toBe('number');
    expect(contestRow.config.bracket_draw?.registration_order).toHaveLength(5);

    // Bốc lại: các trận gặp ô trống tuy COMPLETED nhưng chưa ai thi đấu thật,
    // nên không được tính là khoá sơ đồ.
    await request(app)
      .post(`/api/v1/contests/${contestId}/matches/generate`)
      .set('Authorization', `Bearer ${token}`)
      .send({ cafe_id: cafe.id })
      .expect(201);
  });

  it('khong cho boc lai khi da co tran thi dau that', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    await activateProvider(provider.id);
    const cafe = await createTestCafe({ provider_id: provider.id });
    const token = generateToken(provider);
    const { contestId } = await createContestFixture(provider.id, cafe.id, 'KNOCKOUT', {
      capacity: 8,
    });
    for (let i = 0; i < 8; i += 1) {
      await createRegistrationFixture(contestId, 'CONFIRMED');
    }

    const drawRes = await request(app)
      .post(`/api/v1/contests/${contestId}/matches/generate`)
      .set('Authorization', `Bearer ${token}`)
      .send({ cafe_id: cafe.id })
      .expect(201);

    const firstMatch = drawRes.body.data.find(
      (match: { round_no: number; participants: unknown[] }) =>
        match.round_no === 1 && match.participants.length === 2,
    );
    await request(app)
      .post(`/api/v1/contest-matches/${firstMatch.id}/results`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        reason: 'Ket qua vong 1',
        results: [
          {
            registration_id: firstMatch.participants[0].registration_id,
            finish_position: 1,
            is_winner: true,
          },
          {
            registration_id: firstMatch.participants[1].registration_id,
            finish_position: 2,
          },
        ],
      })
      .expect(200);

    const res = await request(app)
      .post(`/api/v1/contests/${contestId}/matches/generate`)
      .set('Authorization', `Bearer ${token}`)
      .send({ cafe_id: cafe.id })
      .expect(409);
    expect(res.body.code).toBe('CONTEST_RUNTIME_LOCKED');
  });

  it('boc tham dau loai can it nhat 2 nguoi da duyet', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    await activateProvider(provider.id);
    const cafe = await createTestCafe({ provider_id: provider.id });
    const token = generateToken(provider);
    const { contestId } = await createContestFixture(provider.id, cafe.id, 'KNOCKOUT', {
      capacity: 8,
    });
    await createRegistrationFixture(contestId, 'CONFIRMED');

    const res = await request(app)
      .post(`/api/v1/contests/${contestId}/matches/generate`)
      .set('Authorization', `Bearer ${token}`)
      .send({ cafe_id: cafe.id })
      .expect(400);
    expect(res.body.code).toBe('CONTEST_NOT_ENOUGH_PARTICIPANTS');
  });

  it('staff duoc phan cong xem duoc danh sach giai cua chi nhanh', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    await activateProvider(provider.id);
    const cafe = await createTestCafe({ provider_id: provider.id });
    const staff = await createTestUser({ role: UserRole.STAFF });
    await AppDataSource.query(
      `INSERT INTO staff_cafe_assignments (staff_id, cafe_id, assigned_by) VALUES ($1, $2, $3)`,
      [staff.id, cafe.id, provider.id],
    );
    const { contestId } = await createContestFixture(provider.id, cafe.id, 'KNOCKOUT');
    await AppDataSource.query(
      `INSERT INTO contest_staff_assignments (contest_id, staff_id, assigned_by) VALUES ($1, $2, $3)`,
      [contestId, staff.id, provider.id],
    );

    // Nhánh staff có join contest_staff_assignments; cộng thêm skip/take của
    // phân trang là đủ để TypeORM đổi sang đường DISTINCT-subquery — chính chỗ
    // từng nổ 500 vì orderBy dùng tên cột DB.
    const res = await request(app)
      .get(`/api/v1/cafes/${cafe.id}/contests`)
      .set('Authorization', `Bearer ${generateToken(staff)}`)
      .expect(200);

    expect(res.body.data.map((item: { id: string }) => item.id)).toContain(contestId);
  });

  it('staff chua duoc phan cong thi khong thay giai', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    await activateProvider(provider.id);
    const cafe = await createTestCafe({ provider_id: provider.id });
    const staff = await createTestUser({ role: UserRole.STAFF });
    await AppDataSource.query(
      `INSERT INTO staff_cafe_assignments (staff_id, cafe_id, assigned_by) VALUES ($1, $2, $3)`,
      [staff.id, cafe.id, provider.id],
    );
    await createContestFixture(provider.id, cafe.id, 'KNOCKOUT');

    const res = await request(app)
      .get(`/api/v1/cafes/${cafe.id}/contests`)
      .set('Authorization', `Bearer ${generateToken(staff)}`)
      .expect(200);

    expect(res.body.data).toHaveLength(0);
  });

  it('nhan vien giao xe cho VDV thue xe ngay luc diem danh', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    await activateProvider(provider.id);
    const cafe = await createTestCafe({ provider_id: provider.id });
    const customer = await createTestUser({ role: UserRole.CUSTOMER });
    const providerToken = generateToken(provider);
    const customerToken = generateToken(customer);
    const { contestId, trackTypeId } = await createContestFixture(
      provider.id,
      cafe.id,
      'KNOCKOUT',
      { vehiclePolicy: 'RENTAL_ONLY', capacity: 8 },
    );
    const vehicle = await createTestVehicle({
      cafe_id: cafe.id,
      compatible_track_types: [trackTypeId],
    });

    const registerRes = await request(app)
      .post(`/api/v1/contests/${contestId}/register`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        vehicle_source: 'RENTAL',
        rental: { cafe_id: cafe.id, vehicle_catalog_id: vehicle.catalog_id },
      })
      .expect(201);
    const registrationId = registerRes.body.data.id;

    // Giải miễn phí + thuê xe: đã tự động xác nhận, chỉ còn chờ ngày thi.
    await AppDataSource.query(
      `UPDATE contests SET status = 'CLOSED', starts_at = NOW() - INTERVAL '10 minutes' WHERE id = $1`,
      [contestId],
    );

    const unitsRes = await request(app)
      .get(`/api/v1/contest-registrations/${registrationId}/handover-units`)
      .set('Authorization', `Bearer ${providerToken}`)
      .expect(200);
    expect(unitsRes.body.data.map((u: { id: string }) => u.id)).toContain(vehicle.id);

    // Chưa chọn xe thì không cho điểm danh.
    const missingRes = await request(app)
      .post(`/api/v1/contest-registrations/${registrationId}/check-in`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send({ checked_in_cafe_id: cafe.id })
      .expect(400);
    expect(missingRes.body.code).toBe('CONTEST_HANDOVER_VEHICLE_REQUIRED');

    await request(app)
      .post(`/api/v1/contest-registrations/${registrationId}/check-in`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send({ checked_in_cafe_id: cafe.id, rental_vehicle_id: vehicle.id })
      .expect(200);

    // Phiếu mượn xe 0đ được dựng và gắn vào đăng ký.
    const [registration] = await AppDataSource.query<
      { status: string; booking_id: string | null; vehicle_id: string | null }[]
    >(`SELECT status, booking_id, vehicle_id FROM contest_registrations WHERE id = $1`, [
      registrationId,
    ]);
    expect(registration.status).toBe('CHECKED_IN');
    expect(registration.booking_id).toBeTruthy();
    expect(registration.vehicle_id).toBe(vehicle.id);

    const [booking] = await AppDataSource.query<
      { status: string; source: string; contest_id: string }[]
    >(`SELECT status, source, contest_id FROM bookings WHERE id = $1`, [registration.booking_id]);
    expect(booking.status).toBe('CONFIRMED');
    expect(booking.source).toBe('CONTEST');
    expect(booking.contest_id).toBe(contestId);

    const [bookingVehicle] = await AppDataSource.query<
      { rental_fee_snapshot: string; security_deposit_snapshot: string }[]
    >(
      `SELECT rental_fee_snapshot, security_deposit_snapshot FROM booking_vehicles WHERE booking_id = $1`,
      [registration.booking_id],
    );
    expect(Number(bookingVehicle.rental_fee_snapshot)).toBe(0);
    expect(Number(bookingVehicle.security_deposit_snapshot)).toBe(0);

    // Phiên chơi mở sẵn để chạy tiếp inspection / tính hư hỏng.
    const [session] = await AppDataSource.query<{ id: string; status: string }[]>(
      `SELECT id, status FROM sessions WHERE booking_id = $1`,
      [registration.booking_id],
    );
    expect(session.status).toBe('CHECKED_IN');
    const sessionVehicles = await AppDataSource.query<{ vehicle_id: string }[]>(
      `SELECT vehicle_id FROM session_vehicles WHERE session_id = $1`,
      [session.id],
    );
    expect(sessionVehicles.map((sv) => sv.vehicle_id)).toEqual([vehicle.id]);

    // Xe đã giao thì không còn hiện cho người khác chọn.
    const unitsAfter = await request(app)
      .get(`/api/v1/contest-registrations/${registrationId}/handover-units`)
      .set('Authorization', `Bearer ${providerToken}`)
      .expect(200);
    expect(unitsAfter.body.data.map((u: { id: string }) => u.id)).not.toContain(vehicle.id);
  });

  it('dang ky thue xe chi chon dong xe, khong sinh phieu xe va khong co tien thue', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    await activateProvider(provider.id);
    const cafe = await createTestCafe({ provider_id: provider.id });
    const customer = await createTestUser({ role: UserRole.CUSTOMER });
    const providerToken = generateToken(provider);
    const customerToken = generateToken(customer);
    const { contestId, trackTypeId } = await createContestFixture(
      provider.id,
      cafe.id,
      'TIME_TRIAL',
      { vehiclePolicy: 'RENTAL_ONLY' },
    );
    const vehicle = await createTestVehicle({
      cafe_id: cafe.id,
      compatible_track_types: [trackTypeId],
    });

    const registerRes = await request(app)
      .post(`/api/v1/contests/${contestId}/register`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        vehicle_source: 'RENTAL',
        rental: {
          cafe_id: cafe.id,
          vehicle_catalog_id: vehicle.catalog_id,
        },
      })
      .expect(201);

    // Dòng xe được ghi nhận, nhưng chưa gán chiếc nào và chưa có phiếu mượn xe.
    const [registration] = await AppDataSource.query<
      {
        rental_catalog_id: string | null;
        rental_cafe_id: string | null;
        booking_id: string | null;
        vehicle_id: string | null;
      }[]
    >(
      `SELECT rental_catalog_id, rental_cafe_id, booking_id, vehicle_id
         FROM contest_registrations WHERE id = $1`,
      [registerRes.body.data.id],
    );
    expect(registration.rental_catalog_id).toBe(vehicle.catalog_id);
    expect(registration.rental_cafe_id).toBe(cafe.id);
    expect(registration.booking_id).toBeNull();
    expect(registration.vehicle_id).toBeNull();

    // Không booking nào được tạo, nên không có gì để tính tiền theo giờ.
    const bookings = await AppDataSource.query<{ id: string }[]>(
      `SELECT id FROM bookings WHERE contest_id = $1`,
      [contestId],
    );
    expect(bookings).toHaveLength(0);

    // Giải không thu lệ phí thì duyệt được ngay, không còn chờ booking CONFIRMED.
    const approveRes = await request(app)
      .post(`/api/v1/contest-registrations/${registerRes.body.data.id}/approve`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send({ reason: 'Duyet ngay' })
      .expect(200);
    expect(approveRes.body.data.status).toBe('CONFIRMED');
  });

  it('giu cho dong xe theo so xe co that', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    await activateProvider(provider.id);
    const cafe = await createTestCafe({ provider_id: provider.id });
    const firstCustomer = await createTestUser({ role: UserRole.CUSTOMER });
    const secondCustomer = await createTestUser({ role: UserRole.CUSTOMER });
    const { contestId, trackTypeId } = await createContestFixture(
      provider.id,
      cafe.id,
      'TIME_TRIAL',
      { vehiclePolicy: 'RENTAL_ONLY' },
    );
    // createTestVehicle tạo một catalog kèm đúng một chiếc.
    const vehicle = await createTestVehicle({
      cafe_id: cafe.id,
      compatible_track_types: [trackTypeId],
    });

    await request(app)
      .post(`/api/v1/contests/${contestId}/register`)
      .set('Authorization', `Bearer ${generateToken(firstCustomer)}`)
      .send({
        vehicle_source: 'RENTAL',
        rental: { cafe_id: cafe.id, vehicle_catalog_id: vehicle.catalog_id },
      })
      .expect(201);

    const secondRes = await request(app)
      .post(`/api/v1/contests/${contestId}/register`)
      .set('Authorization', `Bearer ${generateToken(secondCustomer)}`)
      .send({
        vehicle_source: 'RENTAL',
        rental: { cafe_id: cafe.id, vehicle_catalog_id: vehicle.catalog_id },
      })
      .expect(409);

    expect(secondRes.body.code).toBe('CONTEST_RENTAL_CATALOG_FULL');
  });

  it('le phi giai chi con mot duong thanh toan, khong gop vao phieu xe', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    await activateProvider(provider.id);
    const cafe = await createTestCafe({ provider_id: provider.id });
    const customer = await createTestUser({ role: UserRole.CUSTOMER });
    const customerToken = generateToken(customer);
    const { contestId, trackTypeId } = await createContestFixture(
      provider.id,
      cafe.id,
      'TIME_TRIAL',
      { entryFee: 150000, vehiclePolicy: 'RENTAL_ONLY' },
    );
    const vehicle = await createTestVehicle({
      cafe_id: cafe.id,
      compatible_track_types: [trackTypeId],
    });

    const registerRes = await request(app)
      .post(`/api/v1/contests/${contestId}/register`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        vehicle_source: 'RENTAL',
        rental: { cafe_id: cafe.id, vehicle_catalog_id: vehicle.catalog_id },
      })
      .expect(201);

    expect(registerRes.body.data.payment_status).toBe('PENDING_PAYMENT');

    // Không còn booking để gộp lệ phí vào, nên cũng không còn thành phần
    // CONTEST_ENTRY_FEE nằm song song với đường CONTEST_ENTRY.
    const components = await AppDataSource.query<{ type: string }[]>(
      `SELECT type FROM payment_components WHERE type = 'CONTEST_ENTRY_FEE'`,
    );
    expect(components).toHaveLength(0);

    const paymentRes = await request(app)
      .post(`/api/v1/contest-registrations/${registerRes.body.data.id}/create-entry-fee-payment`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({})
      .expect(201);
    expect(paymentRes.body.data.amount).toBe(150000);
  });

  it('provider co the xem rental options va available vehicles cua contest', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    await activateProvider(provider.id);
    const cafe = await createTestCafe({ provider_id: provider.id });
    const customer = await createTestUser({ role: UserRole.CUSTOMER });
    const customerToken = generateToken(customer);
    const providerToken = generateToken(provider);
    const { contestId } = await createContestFixture(provider.id, cafe.id, 'TIME_TRIAL', {
      vehiclePolicy: 'RENTAL_ONLY',
    });
    const vehicle = await createTestVehicle({
      cafe_id: cafe.id,
      compatible_track_types: [],
    });

    const optionsRes = await request(app)
      .get(`/api/v1/contests/${contestId}/rental-options`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);

    expect(optionsRes.body.success).toBe(true);
    expect(optionsRes.body.data.cafes.map((c: { id: string }) => c.id)).toContain(cafe.id);
    expect(optionsRes.body.data.vehicle_catalogs.map((c: { id: string }) => c.id)).toContain(
      vehicle.catalog_id,
    );

    const availableRes = await request(app)
      .get(`/api/v1/contests/${contestId}/available-rental-vehicles`)
      .set('Authorization', `Bearer ${customerToken}`)
      .query({ cafe_id: cafe.id })
      .expect(200);

    const group = availableRes.body.data.find(
      (g: { catalog_id: string }) => g.catalog_id === vehicle.catalog_id,
    );
    expect(group).toBeTruthy();
    expect(group.remaining_slots).toBeGreaterThan(0);
    // Thuê xe trong giải là miễn phí nên không còn giá giờ để hiển thị.
    expect(group.hourly_rate).toBeUndefined();

    await request(app)
      .post(`/api/v1/contests/${contestId}/register`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        vehicle_source: 'RENTAL',
        rental: {
          cafe_id: cafe.id,
          vehicle_catalog_id: vehicle.catalog_id,
        },
      })
      .expect(201);

    const availableAfterRes = await request(app)
      .get(`/api/v1/contests/${contestId}/available-rental-vehicles`)
      .set('Authorization', `Bearer ${customerToken}`)
      .query({ cafe_id: cafe.id })
      .expect(200);

    const groupAfter = availableAfterRes.body.data.find(
      (g: { catalog_id: string }) => g.catalog_id === vehicle.catalog_id,
    );
    // Đăng ký giữ chỗ dòng xe, nên suất còn lại giảm đi mà không cần booking nào.
    expect(groupAfter.remaining_slots).toBe(group.remaining_slots - 1);
  });

  it('admin co the tao featured popup va public lay popup active uu tien cao nhat', async () => {
    const admin = await createTestUser({ role: UserRole.ADMIN });
    const adminToken = generateToken(admin);
    const now = Date.now();

    const inactive = await request(app)
      .post('/api/v1/admin/featured-popups')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Popup het han',
        subtitle: 'Khong nen hien ra',
        image_url: 'https://example.com/popup-old.jpg',
        cta_label: 'Xem ngay',
        cta_url: 'https://example.com/old',
        starts_at: new Date(now - 4 * 24 * 60 * 60 * 1000).toISOString(),
        ends_at: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
        is_active: true,
        priority: 10,
      })
      .expect(201);

    expect(inactive.body.data.id).toBeTruthy();

    const active = await request(app)
      .post('/api/v1/admin/featured-popups')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Giai dang hot',
        subtitle: 'Popup dang active',
        image_url: 'https://example.com/popup-hot.jpg',
        cta_label: 'Dang ky ngay',
        cta_url: 'https://example.com/hot',
        starts_at: new Date(now - 60 * 60 * 1000).toISOString(),
        ends_at: new Date(now + 24 * 60 * 60 * 1000).toISOString(),
        is_active: true,
        priority: 200,
      })
      .expect(201);

    expect(active.body.data.title).toBe('Giai dang hot');

    const publicRes = await request(app).get('/api/v1/explore/featured-popup').expect(200);

    expect(publicRes.body.data).toMatchObject({
      title: 'Giai dang hot',
      priority: 200,
    });
  });

  it('contest reminder chi gui mot lan cho moi moc nhac', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    await activateProvider(provider.id);
    const cafe = await createTestCafe({ provider_id: provider.id });
    const customer = await createTestUser({ role: UserRole.CUSTOMER });

    const [trackType] = await AppDataSource.query<{ id: string; code: string }[]>(
      `SELECT id, code FROM track_types ORDER BY created_at ASC LIMIT 1`,
    );
    const [contestType] = await AppDataSource.query<{ id: string }[]>(
      `SELECT id FROM contest_types WHERE code = 'PROVIDER_STANDARD' LIMIT 1`,
    );
    const [contestFormat] = await AppDataSource.query<{ id: string }[]>(
      `SELECT id FROM contest_formats WHERE code = 'TIME_TRIAL' LIMIT 1`,
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
         ($1, $2, 'Reminder Contest', 'Contest sap dien ra', $3, $4, $5,
          $6, $7, NOW() - INTERVAL '1 day', NOW() + INTERVAL '30 minutes',
          NULL, '{"vehicle_policy":"MIXED","assignment_policy":"AT_CHECK_IN"}'::jsonb, $8, NOW() + INTERVAL '90 minutes', NOW() + INTERVAL '3 hours', 16, 0, 'OPEN', $2)
       RETURNING id`,
      [
        cafe.id,
        provider.id,
        trackType.code,
        trackType.id,
        contestType.id,
        contestFormat.id,
        contestTemplate.id,
        JSON.stringify(contestTemplate.default_config ?? {}),
      ],
    );

    await AppDataSource.query(
      `INSERT INTO contest_cafes (contest_id, cafe_id, role, display_order, check_in_enabled)
       VALUES ($1, $2, 'HOST', 0, TRUE)`,
      [contest.id, cafe.id],
    );

    await AppDataSource.query(
      `INSERT INTO contest_registrations
         (contest_id, user_id, participant_role_snapshot, vehicle_source, status, check_in_code, payment_status, metadata)
       VALUES
         ($1, $2, 'CUSTOMER', 'BYOC', 'CONFIRMED', 'ABC12345', 'PENDING_REVIEW', '{}'::jsonb)`,
      [contest.id, customer.id],
    );

    await processContestReminders();
    await processContestReminders();

    const reminderNotifications = await AppDataSource.query<{ total: string }[]>(
      `SELECT COUNT(*)::text AS total
         FROM notifications
        WHERE user_id = $1
          AND type = $2`,
      [customer.id, NotificationType.CONTEST_REMINDER],
    );

    expect(Number(reminderNotifications[0].total)).toBe(1);
  });
});
