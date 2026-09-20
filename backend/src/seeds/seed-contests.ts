import 'dotenv/config';
import 'reflect-metadata';
import bcrypt from 'bcrypt';
import { AppDataSource } from '../config/database';
import { logger } from '../config/logger';

const SEED_CONTEST_PREFIX = '[SEED-CONTEST]';
// Anchor the whole contest story to "today at 09:00 local time" so that
// OPEN/RUNNING contests never go stale no matter when the seed is re-run.
// All registration windows, starts_at and ends_at are expressed as offsets
// from this anchor inside main().
const CONTEST_STORY_DATE = (() => {
  const anchor = new Date();
  anchor.setHours(9, 0, 0, 0);
  return anchor;
})();
const VICTORY_CHALLENGE_SOURCE_URL =
  'https://baokhanhhoa.vn/the-thao/202605/giai-dua-xe-o-to-the-thao-dia-hinh-quoc-te-victory-challenge-2026-tro-lai-nha-trang-42b4cb8/';
const VICTORY_CHALLENGE_BANNER_URL =
  'https://baokhanhhoa.vn/file/e7837c02857c8ca30185a8c39b582c03/052026/poster_victory_20260513161312.jpg';
const TEST_CUSTOMERS = [
  { email: 'customer@gmail.com', full_name: 'Khách Hàng' },
  { email: 'contest.customer1@gmail.com', full_name: 'Nguyễn Hoàng Phúc' },
  { email: 'contest.customer2@gmail.com', full_name: 'Trần Gia Bảo' },
  { email: 'contest.customer3@gmail.com', full_name: 'Lê Minh Quân' },
  { email: 'contest.customer4@gmail.com', full_name: 'Phạm Nhật Nam' },
  { email: 'contest.customer5@gmail.com', full_name: 'Đỗ Khánh Linh' },
  { email: 'contest.customer6@gmail.com', full_name: 'Võ Quốc Hưng' },
  { email: 'contest.customer7@gmail.com', full_name: 'Bùi Thành Đạt' },
  { email: 'contest.customer8@gmail.com', full_name: 'Ngô Tuệ An' },
];

type SeedUser = {
  id: string;
  email: string;
};

type SeedContestCatalog = {
  contestTypeId: string;
  knockoutFormatId: string;
  timeTrialFormatId: string;
  knockoutTemplateId: string;
  timeTrialTemplateId: string;
  driftTrackTypeId: string;
};

type SeedCafe = {
  id: string;
  name: string;
  slug: string;
};

async function ensureContestSchemaReady(): Promise<void> {
  const [{ exists }] = await AppDataSource.query<{ exists: boolean }[]>(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name = 'contest_types'
     )`,
  );

  if (!exists) {
    throw new Error(
      'Thiếu bảng contest_types. Hãy chạy npm run migration:run trước khi seed contest.',
    );
  }
}

async function ensureUser(email: string, fullName: string): Promise<SeedUser> {
  const [existing] = await AppDataSource.query<(SeedUser & { full_name: string })[]>(
    `SELECT id, email, full_name FROM users WHERE email = $1 LIMIT 1`,
    [email],
  );
  if (existing) {
    if (existing.full_name !== fullName) {
      await AppDataSource.query(`UPDATE users SET full_name = $2 WHERE id = $1`, [
        existing.id,
        fullName,
      ]);
    }
    return { id: existing.id, email: existing.email };
  }

  const passwordHash = await bcrypt.hash('123456', 10);
  const [created] = await AppDataSource.query<SeedUser[]>(
    `INSERT INTO users (email, full_name, password_hash, role, is_active)
     VALUES ($1, $2, $3, 'CUSTOMER', TRUE)
     RETURNING id, email`,
    [email, fullName, passwordHash],
  );
  logger.info('Seed', `Created contest user ${email}`);
  return created;
}

async function loadProviderContext(): Promise<{
  providerId: string;
  staffId: string | null;
  cafes: SeedCafe[];
  catalog: SeedContestCatalog;
}> {
  const [provider] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM users WHERE email = 'provider@gmail.com' LIMIT 1`,
  );
  if (!provider) {
    throw new Error('provider@gmail.com không tồn tại. Hãy chạy seed-users.ts trước.');
  }

  const [staff] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM users WHERE email = 'staff@gmail.com' LIMIT 1`,
  );

  const cafes = await AppDataSource.query<SeedCafe[]>(
    `SELECT id, name, slug
     FROM cafes
     WHERE provider_id = $1
     ORDER BY created_at ASC`,
    [provider.id],
  );
  if (cafes.length === 0) {
    throw new Error('Không tìm thấy cafe của provider@gmail.com. Hãy chạy seed-cafes.ts trước.');
  }

  const [contestType] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM contest_types WHERE code = 'PROVIDER_STANDARD' LIMIT 1`,
  );
  const [knockoutFormat] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM contest_formats WHERE code = 'KNOCKOUT' LIMIT 1`,
  );
  const [timeTrialFormat] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM contest_formats WHERE code = 'TIME_TRIAL' LIMIT 1`,
  );
  const [knockoutTemplate] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM contest_templates WHERE code = 'provider_standard_knockout' LIMIT 1`,
  );
  const [timeTrialTemplate] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM contest_templates WHERE code = 'provider_standard_time_trial' LIMIT 1`,
  );
  const [driftTrack] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM track_types WHERE code = 'DRIFT' LIMIT 1`,
  );

  if (
    !contestType ||
    !knockoutFormat ||
    !timeTrialFormat ||
    !knockoutTemplate ||
    !timeTrialTemplate ||
    !driftTrack
  ) {
    throw new Error(
      'Thiếu contest catalog hoặc DRIFT track type. Hãy chạy migration contest trước.',
    );
  }

  return {
    providerId: provider.id,
    staffId: staff?.id ?? null,
    cafes,
    catalog: {
      contestTypeId: contestType.id,
      knockoutFormatId: knockoutFormat.id,
      timeTrialFormatId: timeTrialFormat.id,
      knockoutTemplateId: knockoutTemplate.id,
      timeTrialTemplateId: timeTrialTemplate.id,
      driftTrackTypeId: driftTrack.id,
    },
  };
}

async function cleanupSeedContests(): Promise<void> {
  const contests = await AppDataSource.query<{ id: string; name: string }[]>(
    `SELECT id, name FROM contests WHERE name LIKE $1`,
    [`${SEED_CONTEST_PREFIX}%`],
  );
  if (contests.length === 0) return;

  const contestIds = contests.map((item) => item.id);
  // Featured popups and fee orders are seeded from the contest story too. They
  // reference contests directly, so clean them before re-creating the story.
  await AppDataSource.query(`DELETE FROM featured_popups WHERE contest_id = ANY($1::uuid[])`, [
    contestIds,
  ]);
  await AppDataSource.query(`DELETE FROM contest_fee_orders WHERE contest_id = ANY($1::uuid[])`, [
    contestIds,
  ]);
  await AppDataSource.query(`DELETE FROM race_records WHERE contest_id = ANY($1::uuid[])`, [
    contestIds,
  ]);
  await AppDataSource.query(
    `DELETE FROM payment_transactions
     WHERE contest_registration_id IN (
       SELECT id FROM contest_registrations WHERE contest_id = ANY($1::uuid[])
     )`,
    [contestIds],
  );
  await AppDataSource.query(
    `DELETE FROM contest_staff_assignments WHERE contest_id = ANY($1::uuid[])`,
    [contestIds],
  );
  await AppDataSource.query(`DELETE FROM contest_bans WHERE contest_id = ANY($1::uuid[])`, [
    contestIds,
  ]);
  await AppDataSource.query(`DELETE FROM contest_audit_logs WHERE contest_id = ANY($1::uuid[])`, [
    contestIds,
  ]);
  await AppDataSource.query(
    `DELETE FROM contest_match_participants
     WHERE match_id IN (
       SELECT id FROM contest_matches WHERE contest_id = ANY($1::uuid[])
     )`,
    [contestIds],
  );
  await AppDataSource.query(`DELETE FROM contest_matches WHERE contest_id = ANY($1::uuid[])`, [
    contestIds,
  ]);
  await AppDataSource.query(
    `DELETE FROM contest_registrations WHERE contest_id = ANY($1::uuid[])`,
    [contestIds],
  );
  await AppDataSource.query(`DELETE FROM contest_cafes WHERE contest_id = ANY($1::uuid[])`, [
    contestIds,
  ]);
  await AppDataSource.query(`DELETE FROM contests WHERE id = ANY($1::uuid[])`, [contestIds]);
  logger.info('Seed', `Cleaned ${contests.length} existing seed contest(s)`);
}

async function insertContest(params: {
  cafeId: string;
  providerId: string;
  name: string;
  description: string;
  status: string;
  trackTypeId: string;
  contestTypeId: string;
  contestFormatId: string;
  contestTemplateId: string;
  registrationOpensAt: Date;
  registrationClosesAt: Date;
  startsAt: Date;
  endsAt: Date;
  capacity: number;
  entryFee: number;
  vehicleRule: Record<string, unknown>;
  config: Record<string, unknown>;
  bannerImageUrl?: string | null;
}): Promise<string> {
  const [contest] = await AppDataSource.query<{ id: string }[]>(
    `INSERT INTO contests
       (cafe_id, provider_id, name, description, track_type, track_type_id, contest_type_id,
        contest_format_id, contest_template_id, registration_opens_at, registration_closes_at,
        banner_image_url, vehicle_rule, config, starts_at, ends_at, capacity, entry_fee, status, created_by)
     VALUES
       ($1, $2, $3, $4, 'DRIFT', $5, $6,
        $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $2)
     RETURNING id`,
    [
      params.cafeId,
      params.providerId,
      params.name,
      params.description,
      params.trackTypeId,
      params.contestTypeId,
      params.contestFormatId,
      params.contestTemplateId,
      params.registrationOpensAt,
      params.registrationClosesAt,
      params.bannerImageUrl ?? null,
      JSON.stringify(params.vehicleRule),
      JSON.stringify(params.config),
      params.startsAt,
      params.endsAt,
      params.capacity,
      params.entryFee,
      params.status,
    ],
  );
  return contest.id;
}

async function addContestCafe(
  contestId: string,
  cafeId: string,
  role: 'HOST' | 'PARTICIPATING',
  displayOrder: number,
) {
  await AppDataSource.query(
    `INSERT INTO contest_cafes (contest_id, cafe_id, role, display_order, check_in_enabled)
     VALUES ($1, $2, $3, $4, TRUE)`,
    [contestId, cafeId, role, displayOrder],
  );
}

async function insertRegistration(params: {
  contestId: string;
  userId: string;
  vehicleSource?: 'RENTAL' | 'BYOC';
  vehicleId: string | null;
  bookingId?: string | null;
  status: string;
  paymentStatus: string;
  entryFeeAmount: number;
  checkInCode: string;
  checkedInCafeId?: string | null;
  checkedInBy?: string | null;
  checkedInAt?: Date | null;
  cancellationReason?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<string> {
  const [registration] = await AppDataSource.query<{ id: string }[]>(
    `INSERT INTO contest_registrations
       (contest_id, user_id, participant_role_snapshot, vehicle_source, vehicle_id, booking_id,
        status, check_in_code, checked_in_cafe_id, checked_in_by, checked_in_at,
        payment_status, entry_fee_amount, entry_fee_due_at, cancelled_by, cancelled_at,
        cancellation_reason, metadata)
     VALUES
       ($1, $2, 'CUSTOMER', $3, $4, $5,
        $6, $7, $8, $9, $10,
        $11, $12, NOW() + INTERVAL '3 days', NULL, NULL,
        $13, $14)
     RETURNING id`,
    [
      params.contestId,
      params.userId,
      params.vehicleSource ?? 'RENTAL',
      params.vehicleId,
      params.bookingId ?? null,
      params.status,
      params.checkInCode,
      params.checkedInCafeId ?? null,
      params.checkedInBy ?? null,
      params.checkedInAt ?? null,
      params.paymentStatus,
      params.entryFeeAmount,
      params.cancellationReason ?? null,
      JSON.stringify({ seeded: true, ...(params.metadata ?? {}) }),
    ],
  );
  return registration.id;
}

async function addContestStaffAssignment(contestId: string, staffId: string, assignedBy: string) {
  await AppDataSource.query(
    `INSERT INTO contest_staff_assignments (contest_id, staff_id, assigned_by)
     VALUES ($1, $2, $3)
     ON CONFLICT (contest_id, staff_id) DO NOTHING`,
    [contestId, staffId, assignedBy],
  );
}

async function insertContestBan(params: {
  providerId: string;
  contestId: string | null;
  userId: string;
  scopeType: 'CONTEST' | 'PROVIDER';
  reason: string;
  createdBy: string;
  expiresAt?: Date | null;
  liftedAt?: Date | null;
  liftedBy?: string | null;
  liftReason?: string | null;
  evidence?: Record<string, unknown>;
}) {
  await AppDataSource.query(
    `INSERT INTO contest_bans
       (provider_id, contest_id, user_id, scope_type, reason, evidence, created_by, expires_at, lifted_at, lifted_by, lift_reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      params.providerId,
      params.contestId,
      params.userId,
      params.scopeType,
      params.reason,
      JSON.stringify(params.evidence ?? { seeded: true }),
      params.createdBy,
      params.expiresAt ?? null,
      params.liftedAt ?? null,
      params.liftedBy ?? null,
      params.liftReason ?? null,
    ],
  );
}

async function writeAudit(params: {
  contestId: string;
  actorId: string | null;
  actorRole: string | null;
  eventType: string;
  registrationId?: string;
  matchId?: string;
  afterJson?: Record<string, unknown> | null;
  reason?: string | null;
}) {
  await AppDataSource.query(
    `INSERT INTO contest_audit_logs
       (contest_id, registration_id, match_id, actor_id, actor_role, event_type, after_json, reason, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      params.contestId,
      params.registrationId ?? null,
      params.matchId ?? null,
      params.actorId,
      params.actorRole,
      params.eventType,
      JSON.stringify(params.afterJson ?? {}),
      params.reason ?? null,
      JSON.stringify({ seeded: true }),
    ],
  );
}

async function insertMatch(params: {
  contestId: string;
  cafeId: string;
  roundNo: number;
  matchNo: number;
  name: string;
  matchType: string;
  status: string;
  nextMatchId?: string | null;
  scheduledAt: Date;
  createdBy: string;
  decidedBy?: string | null;
  decidedAt?: Date | null;
  startedAt?: Date | null;
  endedAt?: Date | null;
  advancementRule?: Record<string, unknown>;
  resultSummary?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}): Promise<string> {
  const [match] = await AppDataSource.query<{ id: string }[]>(
    `INSERT INTO contest_matches
       (contest_id, cafe_id, track_config_id, round_no, match_no, name, match_type, status,
        scheduled_at, started_at, ended_at, next_match_id, advancement_rule, result_summary,
        metadata, created_by, decided_by, decided_at)
     VALUES
       ($1, $2, NULL, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12, $13,
        $14, $15, $16, $17)
     RETURNING id`,
    [
      params.contestId,
      params.cafeId,
      params.roundNo,
      params.matchNo,
      params.name,
      params.matchType,
      params.status,
      params.scheduledAt,
      params.startedAt ?? null,
      params.endedAt ?? null,
      params.nextMatchId ?? null,
      JSON.stringify(params.advancementRule ?? {}),
      JSON.stringify(params.resultSummary ?? {}),
      JSON.stringify(params.metadata ?? { seeded: true }),
      params.createdBy,
      params.decidedBy ?? null,
      params.decidedAt ?? null,
    ],
  );
  return match.id;
}

async function insertMatchParticipant(params: {
  matchId: string;
  registrationId: string;
  slotNo: number;
  lane?: string | null;
  seedNo?: number | null;
  status: string;
  finishPosition?: number | null;
  bestLapMs?: number | null;
  totalTimeMs?: number | null;
  isWinner?: boolean;
  resultNote?: string | null;
}) {
  await AppDataSource.query(
    `INSERT INTO contest_match_participants
       (match_id, registration_id, slot_no, lane, seed_no, status, finish_position,
        best_lap_ms, total_time_ms, is_winner, result_note, metadata)
     VALUES
       ($1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12)`,
    [
      params.matchId,
      params.registrationId,
      params.slotNo,
      params.lane ?? null,
      params.seedNo ?? null,
      params.status,
      params.finishPosition ?? null,
      params.bestLapMs ?? null,
      params.totalTimeMs ?? null,
      params.isWinner ?? false,
      params.resultNote ?? null,
      JSON.stringify({ seeded: true }),
    ],
  );
}

async function insertContestEntryPayment(params: {
  registrationId: string;
  contestId: string;
  amount: number;
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  txnRef: string;
  gateway?: string;
  rawResponse?: Record<string, unknown> | null;
}) {
  await AppDataSource.query(
    `INSERT INTO payment_transactions
       (booking_id, contest_registration_id, subject_type, type, gateway, txn_ref,
        amount, status, raw_request, raw_response)
     VALUES
       (NULL, $1, 'CONTEST_ENTRY', 'PAYMENT', $2, $3,
        $4, $5, $6, $7)`,
    [
      params.registrationId,
      params.gateway ?? 'VNPAY',
      params.txnRef,
      params.amount,
      params.status,
      JSON.stringify({ registrationId: params.registrationId, contestId: params.contestId }),
      JSON.stringify(params.rawResponse ?? null),
    ],
  );
}

async function main() {
  await AppDataSource.initialize();
  logger.database('Connected');

  await ensureContestSchemaReady();
  const { providerId, staffId, cafes, catalog } = await loadProviderContext();
  const [hostCafe, secondaryCafe] = cafes;
  const customers = await Promise.all(
    TEST_CUSTOMERS.map((item) => ensureUser(item.email, item.full_name)),
  );

  const vehicles = await AppDataSource.query<{ id: string; cafe_id: string }[]>(
    `SELECT id, cafe_id
     FROM vehicles
     WHERE cafe_id = ANY($1::uuid[])
     ORDER BY created_at ASC`,
    [cafes.map((item) => item.id)],
  );
  const hostVehicleId = vehicles.find((item) => item.cafe_id === hostCafe.id)?.id ?? null;
  const secondaryVehicleId =
    (secondaryCafe && vehicles.find((item) => item.cafe_id === secondaryCafe.id)?.id) ?? null;

  const [hostTrackConfig] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id
     FROM cafe_track_configs
     WHERE cafe_id = $1 AND track_type_id = $2 AND deleted_at IS NULL
     ORDER BY created_at ASC
     LIMIT 1`,
    [hostCafe.id, catalog.driftTrackTypeId],
  );
  const hostTrackConfigId = hostTrackConfig?.id ?? null;

  await cleanupSeedContests();
  await AppDataSource.query(`DELETE FROM contest_bans WHERE provider_id = $1 AND reason LIKE $2`, [
    providerId,
    'Seeded %',
  ]);

  const now = new Date(CONTEST_STORY_DATE);
  const oneHour = 60 * 60 * 1000;
  const oneDay = 24 * oneHour;
  const draftContestId = await insertContest({
    cafeId: hostCafe.id,
    providerId,
    name: `${SEED_CONTEST_PREFIX} Victory Challenge RC Cup 2026 - Bản Nháp Điều Hành`,
    description:
      'Bản nháp nội bộ để provider hoàn thiện poster, điều lệ, cơ cấu giải thưởng và danh sách chi nhánh tham gia trước khi mở công khai.',
    status: 'DRAFT',
    trackTypeId: catalog.driftTrackTypeId,
    contestTypeId: catalog.contestTypeId,
    contestFormatId: catalog.knockoutFormatId,
    contestTemplateId: catalog.knockoutTemplateId,
    registrationOpensAt: new Date(now.getTime() + oneDay),
    registrationClosesAt: new Date(now.getTime() + oneDay * 2),
    startsAt: new Date(now.getTime() + oneDay * 3),
    endsAt: new Date(now.getTime() + oneDay * 3 + 4 * oneHour),
    capacity: 16,
    entryFee: 150000,
    vehicleRule: { vehicle_policy: 'RENTAL_ONLY', assignment_policy: 'AT_CHECK_IN' },
    config: {
      format: 'KNOCKOUT',
      runtime_format: 'KNOCKOUT',
      drivers_per_match: 2,
      seeding_mode: 'MANUAL',
      auto_bye: true,
      competition_mechanic: 'HEAD_TO_HEAD_ELIMINATION',
      resource_locks: [
        { cafe_id: hostCafe.id, scope: 'FULL_BRANCH', track_config_ids: [] },
        ...(secondaryCafe
          ? [{ cafe_id: secondaryCafe.id, scope: 'SELECTED_TRACKS', track_config_ids: [] }]
          : []),
      ],
      rulebook: {
        source_reference: VICTORY_CHALLENGE_SOURCE_URL,
        race_day_date: now.toISOString().slice(0, 10),
      },
    },
    bannerImageUrl: VICTORY_CHALLENGE_BANNER_URL,
  });
  await addContestCafe(draftContestId, hostCafe.id, 'HOST', 0);
  if (secondaryCafe) await addContestCafe(draftContestId, secondaryCafe.id, 'PARTICIPATING', 1);
  if (staffId) await addContestStaffAssignment(draftContestId, staffId, providerId);
  await writeAudit({
    contestId: draftContestId,
    actorId: providerId,
    actorRole: 'PROVIDER',
    eventType: 'contest.created',
    afterJson: { status: 'DRAFT' },
  });

  const openContestId = await insertContest({
    cafeId: hostCafe.id,
    providerId,
    name: `${SEED_CONTEST_PREFIX} Victory Challenge RC Sprint Qualifier 2026`,
    description:
      'Vòng tuyển chọn đang mở đăng ký cho giải đối kháng 1v1. Seed data ưu tiên tạo nhiều registration states để test dashboard.',
    status: 'OPEN',
    trackTypeId: catalog.driftTrackTypeId,
    contestTypeId: catalog.contestTypeId,
    contestFormatId: catalog.knockoutFormatId,
    contestTemplateId: catalog.knockoutTemplateId,
    registrationOpensAt: new Date(now.getTime() - oneDay),
    registrationClosesAt: new Date(now.getTime() + oneDay),
    startsAt: new Date(now.getTime() + oneDay * 2),
    endsAt: new Date(now.getTime() + oneDay * 2 + 5 * oneHour),
    capacity: 16,
    entryFee: 100000,
    vehicleRule: { vehicle_policy: 'RENTAL_ONLY', assignment_policy: 'AT_CHECK_IN' },
    config: {
      format: 'KNOCKOUT',
      runtime_format: 'KNOCKOUT',
      drivers_per_match: 2,
      seeding_mode: 'MANUAL',
      auto_bye: true,
      competition_mechanic: 'QUALIFIER_TO_KNOCKOUT',
      resource_locks: [
        { cafe_id: hostCafe.id, scope: 'FULL_BRANCH', track_config_ids: [] },
        ...(secondaryCafe
          ? [{ cafe_id: secondaryCafe.id, scope: 'SELECTED_TRACKS', track_config_ids: [] }]
          : []),
      ],
      source_reference: VICTORY_CHALLENGE_SOURCE_URL,
      prizes: [
        { rank: 1, title: 'Champion', description: 'Cúp vô địch + voucher 1.500.000 VND' },
        { rank: 2, title: 'Runner-up', description: 'Huy chương bạc + voucher 800.000 VND' },
        { rank: 3, title: 'Top 3', description: 'Huy chương đồng + voucher 500.000 VND' },
      ],
    },
    bannerImageUrl: VICTORY_CHALLENGE_BANNER_URL,
  });
  await addContestCafe(openContestId, hostCafe.id, 'HOST', 0);
  if (secondaryCafe) await addContestCafe(openContestId, secondaryCafe.id, 'PARTICIPATING', 1);
  if (staffId) await addContestStaffAssignment(openContestId, staffId, providerId);

  // Khách đăng ký qua giao diện thật là đã trả phí xong rồi; chưa trả chỉ xảy
  // ra khi họ thoát giữa chừng ở cổng thanh toán, và job dọn sẽ huỷ đăng ký
  // đó sau 30 phút. Để PENDING_PAYMENT ở đây thì dòng dữ liệu mẫu này TỰ BIẾN
  // MẤT nửa tiếng sau khi seed, và người demo không hiểu vì sao.
  const openPendingId = await insertRegistration({
    contestId: openContestId,
    userId: customers[0].id,
    vehicleId: hostVehicleId,
    status: 'PENDING',
    paymentStatus: 'MARKED_PAID',
    entryFeeAmount: 100000,
    checkInCode: 'OPENP001',
  });
  const openConfirmedId = await insertRegistration({
    contestId: openContestId,
    userId: customers[1].id,
    vehicleId: secondaryVehicleId ?? hostVehicleId,
    status: 'CONFIRMED',
    paymentStatus: 'MARKED_PAID',
    entryFeeAmount: 100000,
    checkInCode: 'OPENC001',
  });
  const openWaivedId = await insertRegistration({
    contestId: openContestId,
    userId: customers[2].id,
    vehicleId: hostVehicleId,
    status: 'CONFIRMED',
    paymentStatus: 'WAIVED',
    entryFeeAmount: 100000,
    checkInCode: 'OPENW001',
    metadata: { fee_note: 'Media guest' },
  });
  const openCancelledId = await insertRegistration({
    contestId: openContestId,
    userId: customers[3].id,
    vehicleId: hostVehicleId,
    status: 'CANCELLED',
    paymentStatus: 'PENDING_PAYMENT',
    entryFeeAmount: 100000,
    checkInCode: 'OPENCX01',
    cancellationReason: 'Customer changed plan',
  });
  const openCheckedInId = await insertRegistration({
    contestId: openContestId,
    userId: customers[4].id,
    vehicleId: hostVehicleId,
    status: 'CHECKED_IN',
    paymentStatus: 'MARKED_PAID',
    entryFeeAmount: 100000,
    checkInCode: 'OPENI001',
    checkedInCafeId: hostCafe.id,
    checkedInBy: staffId ?? providerId,
    checkedInAt: new Date(now.getTime() - 30 * 60 * 1000),
  });
  await writeAudit({
    contestId: openContestId,
    actorId: providerId,
    actorRole: 'PROVIDER',
    eventType: 'registration.created',
    registrationId: openPendingId,
    afterJson: { status: 'PENDING' },
  });
  await writeAudit({
    contestId: openContestId,
    actorId: providerId,
    actorRole: 'PROVIDER',
    eventType: 'registration.approved',
    registrationId: openConfirmedId,
    afterJson: { status: 'CONFIRMED' },
  });
  await writeAudit({
    contestId: openContestId,
    actorId: providerId,
    actorRole: 'PROVIDER',
    eventType: 'registration.entry_fee_waived',
    registrationId: openWaivedId,
    afterJson: { paymentStatus: 'WAIVED' },
    reason: 'Media guest',
  });
  await writeAudit({
    contestId: openContestId,
    actorId: customers[3].id,
    actorRole: 'CUSTOMER',
    eventType: 'registration.cancelled',
    registrationId: openCancelledId,
    afterJson: { status: 'CANCELLED' },
    reason: 'Customer changed plan',
  });
  await writeAudit({
    contestId: openContestId,
    actorId: staffId ?? providerId,
    actorRole: staffId ? 'STAFF' : 'PROVIDER',
    eventType: 'registration.checked_in',
    registrationId: openCheckedInId,
    afterJson: { status: 'CHECKED_IN', checkedInCafeId: hostCafe.id },
  });
  await insertContestEntryPayment({
    registrationId: openConfirmedId,
    contestId: openContestId,
    amount: 100000,
    status: 'SUCCESS',
    txnRef: 'seed_contest_open_confirmed_paid',
    rawResponse: { vnp_ResponseCode: '00', vnp_TransactionStatus: '00' },
  });
  await insertContestEntryPayment({
    registrationId: openPendingId,
    contestId: openContestId,
    amount: 100000,
    status: 'PENDING',
    txnRef: 'seed_contest_open_pending_payment',
  });

  const byocContestId = await insertContest({
    cafeId: hostCafe.id,
    providerId,
    name: `${SEED_CONTEST_PREFIX} Victory Challenge Mixed Garage Showcase 2026`,
    description:
      'Contest demo cho luồng MIXED/BYOC, dùng để test public detail, provider registration review và hành vi xe cá nhân.',
    status: 'OPEN',
    trackTypeId: catalog.driftTrackTypeId,
    contestTypeId: catalog.contestTypeId,
    contestFormatId: catalog.timeTrialFormatId,
    contestTemplateId: catalog.timeTrialTemplateId,
    registrationOpensAt: new Date(now.getTime() - oneDay),
    registrationClosesAt: new Date(now.getTime() + oneDay),
    startsAt: new Date(now.getTime() + oneDay),
    endsAt: new Date(now.getTime() + oneDay + 4 * oneHour),
    capacity: 20,
    entryFee: 0,
    vehicleRule: { vehicle_policy: 'MIXED', assignment_policy: 'PRE_ASSIGNED' },
    config: {
      format: 'TIME_TRIAL',
      runtime_format: 'TIME_TRIAL',
      drivers_per_match: 1,
      seeding_mode: 'CHECK_IN_ORDER',
      leaderboard_mode: 'BEST_LAP',
      resource_locks: [{ cafe_id: hostCafe.id, scope: 'SELECTED_TRACKS', track_config_ids: [] }],
      prizes: [{ rank: 1, title: 'Best Build + Fastest Line', description: 'Bộ tuning kit' }],
    },
    bannerImageUrl: VICTORY_CHALLENGE_BANNER_URL,
  });
  await addContestCafe(byocContestId, hostCafe.id, 'HOST', 0);
  if (staffId) await addContestStaffAssignment(byocContestId, staffId, providerId);

  const byocPendingId = await insertRegistration({
    contestId: byocContestId,
    userId: customers[5].id,
    vehicleSource: 'BYOC',
    vehicleId: null,
    status: 'PENDING',
    paymentStatus: 'PENDING_REVIEW',
    entryFeeAmount: 0,
    checkInCode: 'BYOCP001',
    metadata: {
      byoc_declaration: {
        vehicle_name: 'Yokomo MD 2.0',
        vehicle_brand: 'Yokomo',
        vehicle_class: 'Drift',
      },
    },
  });
  const byocConfirmedId = await insertRegistration({
    contestId: byocContestId,
    userId: customers[6].id,
    vehicleSource: 'BYOC',
    vehicleId: null,
    status: 'CONFIRMED',
    paymentStatus: 'PENDING_REVIEW',
    entryFeeAmount: 0,
    checkInCode: 'BYOCC001',
    metadata: {
      byoc_declaration: {
        vehicle_name: 'MST RMX 2.5',
        vehicle_brand: 'MST',
        vehicle_class: 'Drift',
        notes: 'Front motor conversion',
      },
    },
  });
  await writeAudit({
    contestId: byocContestId,
    actorId: customers[5].id,
    actorRole: 'CUSTOMER',
    eventType: 'registration.created',
    registrationId: byocPendingId,
    afterJson: { status: 'PENDING', vehicleSource: 'BYOC' },
  });
  await writeAudit({
    contestId: byocContestId,
    actorId: providerId,
    actorRole: 'PROVIDER',
    eventType: 'registration.approved',
    registrationId: byocConfirmedId,
    afterJson: { status: 'CONFIRMED', vehicleSource: 'BYOC' },
    reason: 'BYOC declaration accepted',
  });

  const closedContestId = await insertContest({
    cafeId: hostCafe.id,
    providerId,
    name: `${SEED_CONTEST_PREFIX} Victory Challenge Community Cup 2026 - Closed Grid`,
    description:
      'Contest đã đóng đăng ký nhưng chưa vào runtime, dùng để test màn registrations, fee review, disqualify và audit.',
    status: 'CLOSED',
    trackTypeId: catalog.driftTrackTypeId,
    contestTypeId: catalog.contestTypeId,
    contestFormatId: catalog.knockoutFormatId,
    contestTemplateId: catalog.knockoutTemplateId,
    registrationOpensAt: new Date(now.getTime() - oneDay * 3),
    registrationClosesAt: new Date(now.getTime() - 2 * oneHour),
    startsAt: new Date(now.getTime() + oneDay),
    endsAt: new Date(now.getTime() + oneDay + 6 * oneHour),
    capacity: 12,
    entryFee: 150000,
    vehicleRule: { vehicle_policy: 'RENTAL_ONLY', assignment_policy: 'AT_CHECK_IN' },
    config: {
      format: 'KNOCKOUT',
      runtime_format: 'KNOCKOUT',
      drivers_per_match: 2,
      seeding_mode: 'CHECK_IN_ORDER',
      auto_bye: true,
      leaderboard_mode: 'KNOCKOUT_WINS',
      resource_locks: [{ cafe_id: hostCafe.id, scope: 'FULL_BRANCH', track_config_ids: [] }],
    },
    bannerImageUrl: VICTORY_CHALLENGE_BANNER_URL,
  });
  await addContestCafe(closedContestId, hostCafe.id, 'HOST', 0);
  if (secondaryCafe) await addContestCafe(closedContestId, secondaryCafe.id, 'PARTICIPATING', 1);
  if (staffId) await addContestStaffAssignment(closedContestId, staffId, providerId);

  const closedRegs = await Promise.all([
    insertRegistration({
      contestId: closedContestId,
      userId: customers[0].id,
      vehicleId: hostVehicleId,
      status: 'CONFIRMED',
      paymentStatus: 'MARKED_PAID',
      entryFeeAmount: 150000,
      checkInCode: 'CLOSE001',
    }),
    insertRegistration({
      contestId: closedContestId,
      userId: customers[1].id,
      vehicleId: hostVehicleId,
      status: 'CONFIRMED',
      paymentStatus: 'WAIVED',
      entryFeeAmount: 150000,
      checkInCode: 'CLOSE002',
    }),
    // Chưa duyệt nhưng ĐÃ trả tiền — xem chú thích ở openPendingId.
    insertRegistration({
      contestId: closedContestId,
      userId: customers[2].id,
      vehicleId: hostVehicleId,
      status: 'PENDING',
      paymentStatus: 'MARKED_PAID',
      entryFeeAmount: 150000,
      checkInCode: 'CLOSE003',
    }),
    insertRegistration({
      contestId: closedContestId,
      userId: customers[7].id,
      vehicleId: hostVehicleId,
      status: 'CANCELLED',
      paymentStatus: 'PENDING_PAYMENT',
      entryFeeAmount: 150000,
      checkInCode: 'CLOSE004',
      cancellationReason: 'Rejected due to duplicate roster',
      metadata: { disqualified: true },
    }),
  ]);
  await writeAudit({
    contestId: closedContestId,
    actorId: providerId,
    actorRole: 'PROVIDER',
    eventType: 'registration.disqualified',
    registrationId: closedRegs[3],
    afterJson: { status: 'CANCELLED' },
    reason: 'Rejected due to duplicate roster',
  });
  const closedPendingReviewId = await insertRegistration({
    contestId: closedContestId,
    userId: customers[4].id,
    vehicleId: hostVehicleId,
    status: 'CONFIRMED',
    paymentStatus: 'PENDING_REVIEW',
    entryFeeAmount: 150000,
    checkInCode: 'CLOSE005',
    metadata: { fee_note: 'Uploaded bank transfer receipt, awaiting staff review' },
  });
  await insertContestEntryPayment({
    registrationId: closedPendingReviewId,
    contestId: closedContestId,
    amount: 150000,
    status: 'PENDING',
    txnRef: 'seed_contest_closed_pending_review',
    rawResponse: { bank_transfer_receipt_url: 'https://example.com/receipts/close005.jpg' },
  });

  const runningContestId = await insertContest({
    cafeId: hostCafe.id,
    providerId,
    name: `${SEED_CONTEST_PREFIX} Victory Challenge RC Cup 2026 - Nhánh Đối Kháng`,
    description:
      'Giải đang diễn ra trong ngày hôm nay. Người chơi check-in tại RC Arena Hà Nội, staff xử lý event-day và provider theo dõi bracket.',
    status: 'RUNNING',
    trackTypeId: catalog.driftTrackTypeId,
    contestTypeId: catalog.contestTypeId,
    contestFormatId: catalog.knockoutFormatId,
    contestTemplateId: catalog.knockoutTemplateId,
    registrationOpensAt: new Date(now.getTime() - oneDay * 4),
    registrationClosesAt: new Date(now.getTime() - oneDay * 2),
    startsAt: new Date(now.getTime() - 6 * oneHour),
    endsAt: new Date(now.getTime() + 6 * oneHour),
    capacity: 12,
    entryFee: 0,
    vehicleRule: { vehicle_policy: 'RENTAL_ONLY', assignment_policy: 'AT_CHECK_IN' },
    config: {
      format: 'KNOCKOUT',
      runtime_format: 'KNOCKOUT',
      drivers_per_match: 2,
      seeding_mode: 'CHECK_IN_ORDER',
      auto_bye: true,
      leaderboard_mode: 'KNOCKOUT_WINS',
      competition_mechanic: 'HEAD_TO_HEAD_ELIMINATION',
      source_reference: VICTORY_CHALLENGE_SOURCE_URL,
      prizes: [
        { rank: 1, title: 'Nhà vô địch', description: 'Cúp + bộ pin drift race spec' },
        { rank: 2, title: 'Á quân', description: 'Voucher bảo dưỡng xe RC 700.000 VND' },
      ],
    },
    bannerImageUrl: VICTORY_CHALLENGE_BANNER_URL,
  });
  await addContestCafe(runningContestId, hostCafe.id, 'HOST', 0);
  if (secondaryCafe) await addContestCafe(runningContestId, secondaryCafe.id, 'PARTICIPATING', 1);
  if (staffId) await addContestStaffAssignment(runningContestId, staffId, providerId);

  const runningRegs = await Promise.all([
    insertRegistration({
      contestId: runningContestId,
      userId: customers[0].id,
      vehicleId: hostVehicleId,
      status: 'CHECKED_IN',
      paymentStatus: 'NOT_REQUIRED',
      entryFeeAmount: 0,
      checkInCode: 'RUNN001',
      checkedInCafeId: hostCafe.id,
      checkedInBy: staffId ?? providerId,
      checkedInAt: new Date(now.getTime() - 7 * oneHour),
    }),
    insertRegistration({
      contestId: runningContestId,
      userId: customers[1].id,
      vehicleId: hostVehicleId,
      status: 'CHECKED_IN',
      paymentStatus: 'NOT_REQUIRED',
      entryFeeAmount: 0,
      checkInCode: 'RUNN002',
      checkedInCafeId: hostCafe.id,
      checkedInBy: staffId ?? providerId,
      checkedInAt: new Date(now.getTime() - 7 * oneHour + 5 * 60 * 1000),
    }),
    insertRegistration({
      contestId: runningContestId,
      userId: customers[2].id,
      vehicleId: hostVehicleId,
      status: 'CHECKED_IN',
      paymentStatus: 'NOT_REQUIRED',
      entryFeeAmount: 0,
      checkInCode: 'RUNN003',
      checkedInCafeId: hostCafe.id,
      checkedInBy: staffId ?? providerId,
      checkedInAt: new Date(now.getTime() - 7 * oneHour + 10 * 60 * 1000),
    }),
    insertRegistration({
      contestId: runningContestId,
      userId: customers[3].id,
      vehicleId: hostVehicleId,
      status: 'CHECKED_IN',
      paymentStatus: 'NOT_REQUIRED',
      entryFeeAmount: 0,
      checkInCode: 'RUNN004',
      checkedInCafeId: hostCafe.id,
      checkedInBy: staffId ?? providerId,
      checkedInAt: new Date(now.getTime() - 7 * oneHour + 15 * 60 * 1000),
    }),
    insertRegistration({
      contestId: runningContestId,
      userId: customers[4].id,
      vehicleId: hostVehicleId,
      status: 'CHECKED_IN',
      paymentStatus: 'NOT_REQUIRED',
      entryFeeAmount: 0,
      checkInCode: 'RUNN005',
      checkedInCafeId: hostCafe.id,
      checkedInBy: staffId ?? providerId,
      checkedInAt: new Date(now.getTime() - 7 * oneHour + 20 * 60 * 1000),
    }),
    insertRegistration({
      contestId: runningContestId,
      userId: customers[5].id,
      vehicleId: hostVehicleId,
      status: 'CHECKED_IN',
      paymentStatus: 'NOT_REQUIRED',
      entryFeeAmount: 0,
      checkInCode: 'RUNN006',
      checkedInCafeId: hostCafe.id,
      checkedInBy: staffId ?? providerId,
      checkedInAt: new Date(now.getTime() - 7 * oneHour + 25 * 60 * 1000),
    }),
    insertRegistration({
      contestId: runningContestId,
      userId: customers[6].id,
      vehicleId: hostVehicleId,
      status: 'CHECKED_IN',
      paymentStatus: 'NOT_REQUIRED',
      entryFeeAmount: 0,
      checkInCode: 'RUNN007',
      checkedInCafeId: hostCafe.id,
      checkedInBy: staffId ?? providerId,
      checkedInAt: new Date(now.getTime() - 7 * oneHour + 30 * 60 * 1000),
    }),
    insertRegistration({
      contestId: runningContestId,
      userId: customers[7].id,
      vehicleId: hostVehicleId,
      status: 'CHECKED_IN',
      paymentStatus: 'NOT_REQUIRED',
      entryFeeAmount: 0,
      checkInCode: 'RUNN008',
      checkedInCafeId: hostCafe.id,
      checkedInBy: staffId ?? providerId,
      checkedInAt: new Date(now.getTime() - 7 * oneHour + 35 * 60 * 1000),
    }),
  ]);

  const runningFinalId = await insertMatch({
    contestId: runningContestId,
    cafeId: hostCafe.id,
    roundNo: 2,
    matchNo: 1,
    name: 'Chung kết',
    matchType: 'FINAL',
    status: 'DRAFT',
    scheduledAt: new Date(now.getTime() + oneHour),
    createdBy: providerId,
    advancementRule: { winners_to_advance: 0, format: 'KNOCKOUT' },
  });
  const runningSemi1Id = await insertMatch({
    contestId: runningContestId,
    cafeId: hostCafe.id,
    roundNo: 1,
    matchNo: 1,
    name: 'Bán kết 1',
    matchType: 'HEAD_TO_HEAD',
    status: 'COMPLETED',
    nextMatchId: runningFinalId,
    scheduledAt: new Date(now.getTime() - 2 * oneHour),
    startedAt: new Date(now.getTime() - 110 * 60 * 1000),
    endedAt: new Date(now.getTime() - 100 * 60 * 1000),
    decidedAt: new Date(now.getTime() - 100 * 60 * 1000),
    createdBy: providerId,
    decidedBy: providerId,
    advancementRule: { winners_to_advance: 1, format: 'KNOCKOUT' },
    resultSummary: { winner_registration_id: runningRegs[0], participants_count: 2 },
  });
  const runningSemi2Id = await insertMatch({
    contestId: runningContestId,
    cafeId: hostCafe.id,
    roundNo: 1,
    matchNo: 2,
    name: 'Bán kết 2',
    matchType: 'HEAD_TO_HEAD',
    status: 'READY',
    nextMatchId: runningFinalId,
    scheduledAt: new Date(now.getTime() + 30 * 60 * 1000),
    createdBy: providerId,
    advancementRule: { winners_to_advance: 1, format: 'KNOCKOUT' },
  });

  await insertMatchParticipant({
    matchId: runningSemi1Id,
    registrationId: runningRegs[0],
    slotNo: 1,
    lane: 'L1',
    seedNo: 1,
    status: 'FINISHED',
    finishPosition: 1,
    isWinner: true,
  });
  await insertMatchParticipant({
    matchId: runningSemi1Id,
    registrationId: runningRegs[1],
    slotNo: 2,
    lane: 'L2',
    seedNo: 2,
    status: 'DNF',
    finishPosition: null,
    isWinner: false,
    resultNote: 'Did not finish: motor overheated on lap 6',
  });
  await insertMatchParticipant({
    matchId: runningSemi2Id,
    registrationId: runningRegs[2],
    slotNo: 1,
    lane: 'L1',
    seedNo: 3,
    status: 'READY',
  });
  await insertMatchParticipant({
    matchId: runningSemi2Id,
    registrationId: runningRegs[3],
    slotNo: 2,
    lane: 'L2',
    seedNo: 4,
    status: 'READY',
  });
  await insertMatchParticipant({
    matchId: runningFinalId,
    registrationId: runningRegs[0],
    slotNo: 1,
    lane: 'L1',
    seedNo: 1,
    status: 'READY',
  });
  await writeAudit({
    contestId: runningContestId,
    actorId: providerId,
    actorRole: 'PROVIDER',
    eventType: 'contest.matches_generated',
    afterJson: { generated_match_count: 3 },
  });
  await writeAudit({
    contestId: runningContestId,
    actorId: providerId,
    actorRole: 'PROVIDER',
    eventType: 'match.results_submitted',
    matchId: runningSemi1Id,
    afterJson: { status: 'COMPLETED' },
  });
  await writeAudit({
    contestId: runningContestId,
    actorId: providerId,
    actorRole: 'PROVIDER',
    eventType: 'match.advanced',
    matchId: runningSemi1Id,
    afterJson: { next_match_id: runningFinalId, winners: [runningRegs[0]] },
  });

  const completedContestId = await insertContest({
    cafeId: hostCafe.id,
    providerId,
    name: `${SEED_CONTEST_PREFIX} Victory Challenge RC Time Attack 2026`,
    description:
      'Nội dung time attack đã hoàn tất và đã publish leaderboard, dùng để FE test bảng xếp hạng cuối giải và lịch sử thi đấu.',
    status: 'COMPLETED',
    trackTypeId: catalog.driftTrackTypeId,
    contestTypeId: catalog.contestTypeId,
    contestFormatId: catalog.timeTrialFormatId,
    contestTemplateId: catalog.timeTrialTemplateId,
    registrationOpensAt: new Date(now.getTime() - oneDay * 8),
    registrationClosesAt: new Date(now.getTime() - oneDay * 6),
    startsAt: new Date(now.getTime() - oneDay * 5),
    endsAt: new Date(now.getTime() - oneDay * 5 + 3 * oneHour),
    capacity: 12,
    entryFee: 0,
    vehicleRule: { vehicle_policy: 'RENTAL_ONLY', assignment_policy: 'AT_CHECK_IN' },
    config: {
      format: 'TIME_TRIAL',
      drivers_per_match: 1,
      seeding_mode: 'CHECK_IN_ORDER',
      leaderboard_mode: 'BEST_LAP',
      competition_mechanic: 'TIME_ATTACK_BEST_LAP',
      source_reference: VICTORY_CHALLENGE_SOURCE_URL,
      prizes: [
        { rank: 1, title: 'Fastest Lap', description: 'Cúp best lap + voucher 1.000.000 VND' },
        { rank: 2, title: 'Top 2', description: 'Voucher 600.000 VND' },
        { rank: 3, title: 'Top 3', description: 'Voucher 300.000 VND' },
      ],
      published_leaderboard: {
        mode: 'BEST_LAP',
        match_count: 3,
        published_at: new Date(now.getTime() - oneDay * 4).toISOString(),
        published_by: providerId,
        entries: [
          {
            rank: 1,
            registration_id: 'seed-registration-a',
            wins: 1,
            best_lap_ms: 31880,
            total_time_ms: 31880,
            latest_finish_position: 1,
            matches_completed: 1,
            progressed_round: 1,
          },
          {
            rank: 2,
            registration_id: 'seed-registration-b',
            wins: 1,
            best_lap_ms: 32540,
            total_time_ms: 32540,
            latest_finish_position: 1,
            matches_completed: 1,
            progressed_round: 1,
          },
          {
            rank: 3,
            registration_id: 'seed-registration-c',
            wins: 1,
            best_lap_ms: 33990,
            total_time_ms: 33990,
            latest_finish_position: 1,
            matches_completed: 1,
            progressed_round: 1,
          },
        ],
      },
    },
    bannerImageUrl: VICTORY_CHALLENGE_BANNER_URL,
  });
  await addContestCafe(completedContestId, hostCafe.id, 'HOST', 0);
  if (staffId) await addContestStaffAssignment(completedContestId, staffId, providerId);

  const completedRegs = await Promise.all([
    insertRegistration({
      contestId: completedContestId,
      userId: customers[0].id,
      vehicleId: hostVehicleId,
      status: 'CHECKED_IN',
      paymentStatus: 'NOT_REQUIRED',
      entryFeeAmount: 0,
      checkInCode: 'TIME001',
      checkedInCafeId: hostCafe.id,
      checkedInBy: staffId ?? providerId,
      checkedInAt: new Date(now.getTime() - oneDay * 5 - oneHour),
    }),
    insertRegistration({
      contestId: completedContestId,
      userId: customers[1].id,
      vehicleId: hostVehicleId,
      status: 'CHECKED_IN',
      paymentStatus: 'NOT_REQUIRED',
      entryFeeAmount: 0,
      checkInCode: 'TIME002',
      checkedInCafeId: hostCafe.id,
      checkedInBy: staffId ?? providerId,
      checkedInAt: new Date(now.getTime() - oneDay * 5 - oneHour + 5 * 60 * 1000),
    }),
    insertRegistration({
      contestId: completedContestId,
      userId: customers[2].id,
      vehicleId: hostVehicleId,
      status: 'CHECKED_IN',
      paymentStatus: 'NOT_REQUIRED',
      entryFeeAmount: 0,
      checkInCode: 'TIME003',
      checkedInCafeId: hostCafe.id,
      checkedInBy: staffId ?? providerId,
      checkedInAt: new Date(now.getTime() - oneDay * 5 - oneHour + 10 * 60 * 1000),
    }),
  ]);

  await AppDataSource.query(
    `UPDATE contests
     SET config = jsonb_set(
       config,
       '{published_leaderboard,entries}',
       $2::jsonb
     )
     WHERE id = $1`,
    [
      completedContestId,
      JSON.stringify([
        {
          rank: 1,
          registration_id: completedRegs[0],
          wins: 1,
          best_lap_ms: 31880,
          total_time_ms: 31880,
          latest_finish_position: 1,
          matches_completed: 1,
          progressed_round: 1,
        },
        {
          rank: 2,
          registration_id: completedRegs[1],
          wins: 1,
          best_lap_ms: 32540,
          total_time_ms: 32540,
          latest_finish_position: 1,
          matches_completed: 1,
          progressed_round: 1,
        },
        {
          rank: 3,
          registration_id: completedRegs[2],
          wins: 1,
          best_lap_ms: 33990,
          total_time_ms: 33990,
          latest_finish_position: 1,
          matches_completed: 1,
          progressed_round: 1,
        },
      ]),
    ],
  );

  const timeMatchA = await insertMatch({
    contestId: completedContestId,
    cafeId: hostCafe.id,
    roundNo: 1,
    matchNo: 1,
    name: 'Lượt chạy 1',
    matchType: 'TIME_ATTACK',
    status: 'COMPLETED',
    scheduledAt: new Date(now.getTime() - oneDay * 5),
    startedAt: new Date(now.getTime() - oneDay * 5),
    endedAt: new Date(now.getTime() - oneDay * 5 + 10 * 60 * 1000),
    decidedAt: new Date(now.getTime() - oneDay * 5 + 10 * 60 * 1000),
    createdBy: providerId,
    decidedBy: providerId,
    advancementRule: { winners_to_advance: 0, format: 'TIME_TRIAL' },
    resultSummary: {
      leaderboard_mode: 'BEST_LAP',
      winner_registration_id: completedRegs[0],
      best_lap_ms: 31880,
      total_time_ms: 31880,
    },
  });
  const timeMatchB = await insertMatch({
    contestId: completedContestId,
    cafeId: hostCafe.id,
    roundNo: 1,
    matchNo: 2,
    name: 'Lượt chạy 2',
    matchType: 'TIME_ATTACK',
    status: 'COMPLETED',
    scheduledAt: new Date(now.getTime() - oneDay * 5 + 15 * 60 * 1000),
    startedAt: new Date(now.getTime() - oneDay * 5 + 15 * 60 * 1000),
    endedAt: new Date(now.getTime() - oneDay * 5 + 25 * 60 * 1000),
    decidedAt: new Date(now.getTime() - oneDay * 5 + 25 * 60 * 1000),
    createdBy: providerId,
    decidedBy: providerId,
    advancementRule: { winners_to_advance: 0, format: 'TIME_TRIAL' },
    resultSummary: {
      leaderboard_mode: 'BEST_LAP',
      winner_registration_id: completedRegs[1],
      best_lap_ms: 32540,
      total_time_ms: 32540,
    },
  });
  const timeMatchC = await insertMatch({
    contestId: completedContestId,
    cafeId: hostCafe.id,
    roundNo: 1,
    matchNo: 3,
    name: 'Lượt chạy 3',
    matchType: 'TIME_ATTACK',
    status: 'COMPLETED',
    scheduledAt: new Date(now.getTime() - oneDay * 5 + 30 * 60 * 1000),
    startedAt: new Date(now.getTime() - oneDay * 5 + 30 * 60 * 1000),
    endedAt: new Date(now.getTime() - oneDay * 5 + 40 * 60 * 1000),
    decidedAt: new Date(now.getTime() - oneDay * 5 + 40 * 60 * 1000),
    createdBy: providerId,
    decidedBy: providerId,
    advancementRule: { winners_to_advance: 0, format: 'TIME_TRIAL' },
    resultSummary: {
      leaderboard_mode: 'BEST_LAP',
      winner_registration_id: completedRegs[2],
      best_lap_ms: 33990,
      total_time_ms: 33990,
    },
  });

  await insertMatchParticipant({
    matchId: timeMatchA,
    registrationId: completedRegs[0],
    slotNo: 1,
    seedNo: 1,
    status: 'FINISHED',
    finishPosition: 1,
    bestLapMs: 31880,
    totalTimeMs: 31880,
    isWinner: true,
  });
  await insertMatchParticipant({
    matchId: timeMatchB,
    registrationId: completedRegs[1],
    slotNo: 1,
    seedNo: 2,
    status: 'FINISHED',
    finishPosition: 1,
    bestLapMs: 32540,
    totalTimeMs: 32540,
    isWinner: true,
  });
  await insertMatchParticipant({
    matchId: timeMatchC,
    registrationId: completedRegs[2],
    slotNo: 1,
    seedNo: 3,
    status: 'FINISHED',
    finishPosition: 1,
    bestLapMs: 33990,
    totalTimeMs: 33990,
    isWinner: true,
  });
  await writeAudit({
    contestId: completedContestId,
    actorId: providerId,
    actorRole: 'PROVIDER',
    eventType: 'contest.leaderboard_published',
    afterJson: { published: true },
  });

  const cancelledContestId = await insertContest({
    cafeId: hostCafe.id,
    providerId,
    name: `${SEED_CONTEST_PREFIX} Victory Challenge Night Rush 2026 - Đã Hủy`,
    description:
      'Giải đêm bị hủy do sân thi đấu bảo trì đột xuất, dùng để test trạng thái CANCELLED, thông báo cho ngườ chơi và luồng hoàn phí.',
    status: 'CANCELLED',
    trackTypeId: catalog.driftTrackTypeId,
    contestTypeId: catalog.contestTypeId,
    contestFormatId: catalog.knockoutFormatId,
    contestTemplateId: catalog.knockoutTemplateId,
    registrationOpensAt: new Date(now.getTime() - oneDay * 2),
    registrationClosesAt: new Date(now.getTime() + oneDay),
    startsAt: new Date(now.getTime() + oneDay * 2),
    endsAt: new Date(now.getTime() + oneDay * 2 + 3 * oneHour),
    capacity: 8,
    entryFee: 120000,
    vehicleRule: { vehicle_policy: 'RENTAL_ONLY', assignment_policy: 'AT_CHECK_IN' },
    config: {
      format: 'KNOCKOUT',
      runtime_format: 'KNOCKOUT',
      drivers_per_match: 2,
      seeding_mode: 'CHECK_IN_ORDER',
      auto_bye: true,
      competition_mechanic: 'HEAD_TO_HEAD_ELIMINATION',
      resource_locks: [{ cafe_id: hostCafe.id, scope: 'FULL_BRANCH', track_config_ids: [] }],
      cancellation: {
        cancelled_at: new Date(now.getTime() - 3 * oneHour).toISOString(),
        cancelled_by: providerId,
        reason: 'Track maintenance — unsafe surface conditions',
      },
    },
    bannerImageUrl: VICTORY_CHALLENGE_BANNER_URL,
  });
  await addContestCafe(cancelledContestId, hostCafe.id, 'HOST', 0);
  if (staffId) await addContestStaffAssignment(cancelledContestId, staffId, providerId);

  const cancelledConfirmedId = await insertRegistration({
    contestId: cancelledContestId,
    userId: customers[0].id,
    vehicleId: hostVehicleId,
    status: 'CONFIRMED',
    paymentStatus: 'MARKED_PAID',
    entryFeeAmount: 120000,
    checkInCode: 'CANCC001',
  });
  const cancelledCancelledId = await insertRegistration({
    contestId: cancelledContestId,
    userId: customers[1].id,
    vehicleId: hostVehicleId,
    status: 'CANCELLED',
    paymentStatus: 'PENDING_PAYMENT',
    entryFeeAmount: 120000,
    checkInCode: 'CANCC002',
    cancellationReason: 'Cancelled together with the contest',
  });
  await writeAudit({
    contestId: cancelledContestId,
    actorId: providerId,
    actorRole: 'PROVIDER',
    eventType: 'registration.approved',
    registrationId: cancelledConfirmedId,
    afterJson: { status: 'CONFIRMED' },
  });
  await writeAudit({
    contestId: cancelledContestId,
    actorId: providerId,
    actorRole: 'PROVIDER',
    eventType: 'registration.cancelled',
    registrationId: cancelledCancelledId,
    afterJson: { status: 'CANCELLED' },
    reason: 'Cancelled together with the contest',
  });
  await writeAudit({
    contestId: cancelledContestId,
    actorId: providerId,
    actorRole: 'PROVIDER',
    eventType: 'contest.cancelled',
    afterJson: { status: 'CANCELLED' },
    reason: 'Track maintenance — unsafe surface conditions',
  });
  await insertContestEntryPayment({
    registrationId: cancelledConfirmedId,
    contestId: cancelledContestId,
    amount: 120000,
    status: 'SUCCESS',
    txnRef: 'seed_contest_cancelled_paid',
    rawResponse: { vnp_ResponseCode: '00', vnp_TransactionStatus: '00' },
  });

  const bracketContestId = await insertContest({
    cafeId: hostCafe.id,
    providerId,
    name: `${SEED_CONTEST_PREFIX} Victory Challenge Grand Prix 2026 - Nhánh 8 Tay Đua`,
    description:
      'Bracket knockout đầy đủ 8 tay đua với chuỗi next_match_id hoàn chỉnh: 4 trận tứ kết đã xong, bán kết 1 xong, bán kết 2 sẵn sàng, chung kết nháp.',
    status: 'RUNNING',
    trackTypeId: catalog.driftTrackTypeId,
    contestTypeId: catalog.contestTypeId,
    contestFormatId: catalog.knockoutFormatId,
    contestTemplateId: catalog.knockoutTemplateId,
    registrationOpensAt: new Date(now.getTime() - oneDay * 4),
    registrationClosesAt: new Date(now.getTime() - oneDay * 2),
    startsAt: new Date(now.getTime() - 5 * oneHour),
    endsAt: new Date(now.getTime() + 5 * oneHour),
    capacity: 8,
    entryFee: 0,
    vehicleRule: { vehicle_policy: 'RENTAL_ONLY', assignment_policy: 'AT_CHECK_IN' },
    config: {
      format: 'KNOCKOUT',
      runtime_format: 'KNOCKOUT',
      drivers_per_match: 2,
      seeding_mode: 'CHECK_IN_ORDER',
      auto_bye: true,
      leaderboard_mode: 'KNOCKOUT_WINS',
      competition_mechanic: 'HEAD_TO_HEAD_ELIMINATION',
      source_reference: VICTORY_CHALLENGE_SOURCE_URL,
      prizes: [
        { rank: 1, title: 'Grand Champion', description: 'Cúp Grand Prix + 2.000.000 VND' },
        { rank: 2, title: 'Runner-up', description: 'Voucher 1.000.000 VND' },
      ],
    },
    bannerImageUrl: VICTORY_CHALLENGE_BANNER_URL,
  });
  await addContestCafe(bracketContestId, hostCafe.id, 'HOST', 0);
  if (staffId) await addContestStaffAssignment(bracketContestId, staffId, providerId);

  const bracketRegs = await Promise.all(
    customers.slice(0, 8).map((customer, index) =>
      insertRegistration({
        contestId: bracketContestId,
        userId: customer.id,
        vehicleId: hostVehicleId,
        status: 'CHECKED_IN',
        paymentStatus: 'NOT_REQUIRED',
        entryFeeAmount: 0,
        checkInCode: `BRAC${String(index + 1).padStart(3, '0')}`,
        checkedInCafeId: hostCafe.id,
        checkedInBy: staffId ?? providerId,
        checkedInAt: new Date(now.getTime() - 6 * oneHour + index * 5 * 60 * 1000),
      }),
    ),
  );

  const bracketFinalId = await insertMatch({
    contestId: bracketContestId,
    cafeId: hostCafe.id,
    roundNo: 3,
    matchNo: 1,
    name: 'Chung kết',
    matchType: 'FINAL',
    status: 'DRAFT',
    scheduledAt: new Date(now.getTime() + 2 * oneHour),
    createdBy: providerId,
    advancementRule: { winners_to_advance: 0, format: 'KNOCKOUT' },
  });
  const bracketSemi1Id = await insertMatch({
    contestId: bracketContestId,
    cafeId: hostCafe.id,
    roundNo: 2,
    matchNo: 1,
    name: 'Bán kết 1',
    matchType: 'HEAD_TO_HEAD',
    status: 'COMPLETED',
    nextMatchId: bracketFinalId,
    scheduledAt: new Date(now.getTime() - oneHour),
    startedAt: new Date(now.getTime() - 55 * 60 * 1000),
    endedAt: new Date(now.getTime() - 45 * 60 * 1000),
    decidedAt: new Date(now.getTime() - 45 * 60 * 1000),
    createdBy: providerId,
    decidedBy: providerId,
    advancementRule: { winners_to_advance: 1, format: 'KNOCKOUT' },
    resultSummary: { winner_registration_id: bracketRegs[0], participants_count: 2 },
  });
  const bracketSemi2Id = await insertMatch({
    contestId: bracketContestId,
    cafeId: hostCafe.id,
    roundNo: 2,
    matchNo: 2,
    name: 'Bán kết 2',
    matchType: 'HEAD_TO_HEAD',
    status: 'READY',
    nextMatchId: bracketFinalId,
    scheduledAt: new Date(now.getTime() + 30 * 60 * 1000),
    createdBy: providerId,
    advancementRule: { winners_to_advance: 1, format: 'KNOCKOUT' },
  });
  const bracketQuarterIds: string[] = [];
  for (let quarter = 0; quarter < 4; quarter += 1) {
    const winnerReg = bracketRegs[quarter * 2];
    const quarterId = await insertMatch({
      contestId: bracketContestId,
      cafeId: hostCafe.id,
      roundNo: 1,
      matchNo: quarter + 1,
      name: `Tứ kết ${quarter + 1}`,
      matchType: 'HEAD_TO_HEAD',
      status: 'COMPLETED',
      nextMatchId: quarter < 2 ? bracketSemi1Id : bracketSemi2Id,
      scheduledAt: new Date(now.getTime() - 4 * oneHour + quarter * 30 * 60 * 1000),
      startedAt: new Date(now.getTime() - 4 * oneHour + quarter * 30 * 60 * 1000),
      endedAt: new Date(now.getTime() - 4 * oneHour + quarter * 30 * 60 * 1000 + 10 * 60 * 1000),
      decidedAt: new Date(now.getTime() - 4 * oneHour + quarter * 30 * 60 * 1000 + 10 * 60 * 1000),
      createdBy: providerId,
      decidedBy: providerId,
      advancementRule: { winners_to_advance: 1, format: 'KNOCKOUT' },
      resultSummary: { winner_registration_id: winnerReg, participants_count: 2 },
    });
    bracketQuarterIds.push(quarterId);
    await insertMatchParticipant({
      matchId: quarterId,
      registrationId: winnerReg,
      slotNo: 1,
      lane: 'L1',
      seedNo: quarter * 2 + 1,
      status: 'FINISHED',
      finishPosition: 1,
      isWinner: true,
    });
    await insertMatchParticipant({
      matchId: quarterId,
      registrationId: bracketRegs[quarter * 2 + 1],
      slotNo: 2,
      lane: 'L2',
      seedNo: quarter * 2 + 2,
      status: quarter === 3 ? 'DQ' : 'FINISHED',
      finishPosition: quarter === 3 ? null : 2,
      isWinner: false,
      resultNote: quarter === 3 ? 'Disqualified: car failed post-race tech inspection' : null,
    });
  }
  await insertMatchParticipant({
    matchId: bracketSemi1Id,
    registrationId: bracketRegs[0],
    slotNo: 1,
    lane: 'L1',
    seedNo: 1,
    status: 'FINISHED',
    finishPosition: 1,
    isWinner: true,
  });
  await insertMatchParticipant({
    matchId: bracketSemi1Id,
    registrationId: bracketRegs[2],
    slotNo: 2,
    lane: 'L2',
    seedNo: 3,
    status: 'FINISHED',
    finishPosition: 2,
    isWinner: false,
  });
  await insertMatchParticipant({
    matchId: bracketSemi2Id,
    registrationId: bracketRegs[4],
    slotNo: 1,
    lane: 'L1',
    seedNo: 5,
    status: 'READY',
  });
  await insertMatchParticipant({
    matchId: bracketSemi2Id,
    registrationId: bracketRegs[6],
    slotNo: 2,
    lane: 'L2',
    seedNo: 7,
    status: 'READY',
  });
  await insertMatchParticipant({
    matchId: bracketFinalId,
    registrationId: bracketRegs[0],
    slotNo: 1,
    lane: 'L1',
    seedNo: 1,
    status: 'READY',
  });
  await writeAudit({
    contestId: bracketContestId,
    actorId: providerId,
    actorRole: 'PROVIDER',
    eventType: 'contest.matches_generated',
    afterJson: { generated_match_count: 7 },
  });
  for (const quarterId of bracketQuarterIds) {
    await writeAudit({
      contestId: bracketContestId,
      actorId: providerId,
      actorRole: 'PROVIDER',
      eventType: 'match.results_submitted',
      matchId: quarterId,
      afterJson: { status: 'COMPLETED' },
    });
  }
  await writeAudit({
    contestId: bracketContestId,
    actorId: providerId,
    actorRole: 'PROVIDER',
    eventType: 'match.results_submitted',
    matchId: bracketSemi1Id,
    afterJson: { status: 'COMPLETED' },
  });
  await writeAudit({
    contestId: bracketContestId,
    actorId: providerId,
    actorRole: 'PROVIDER',
    eventType: 'match.advanced',
    matchId: bracketSemi1Id,
    afterJson: { next_match_id: bracketFinalId, winners: [bracketRegs[0]] },
  });

  const byeContestId = await insertContest({
    cafeId: hostCafe.id,
    providerId,
    name: `${SEED_CONTEST_PREFIX} Victory Challenge Lucky Draw Cup 2026 - Nhánh Bye`,
    description:
      'Giải 7 tay đua nên vòng đầu có một suất bye (trận chỉ có 1 participant), dùng để test UI bye-round và luồng auto-advance.',
    status: 'RUNNING',
    trackTypeId: catalog.driftTrackTypeId,
    contestTypeId: catalog.contestTypeId,
    contestFormatId: catalog.knockoutFormatId,
    contestTemplateId: catalog.knockoutTemplateId,
    registrationOpensAt: new Date(now.getTime() - oneDay * 3),
    registrationClosesAt: new Date(now.getTime() - oneDay),
    startsAt: new Date(now.getTime() - 4 * oneHour),
    endsAt: new Date(now.getTime() + 4 * oneHour),
    capacity: 8,
    entryFee: 0,
    vehicleRule: { vehicle_policy: 'RENTAL_ONLY', assignment_policy: 'AT_CHECK_IN' },
    config: {
      format: 'KNOCKOUT',
      runtime_format: 'KNOCKOUT',
      drivers_per_match: 2,
      seeding_mode: 'CHECK_IN_ORDER',
      auto_bye: true,
      leaderboard_mode: 'KNOCKOUT_WINS',
      competition_mechanic: 'HEAD_TO_HEAD_ELIMINATION',
      resource_locks: [{ cafe_id: hostCafe.id, scope: 'FULL_BRANCH', track_config_ids: [] }],
    },
    bannerImageUrl: VICTORY_CHALLENGE_BANNER_URL,
  });
  await addContestCafe(byeContestId, hostCafe.id, 'HOST', 0);
  if (staffId) await addContestStaffAssignment(byeContestId, staffId, providerId);

  const byeRegs = await Promise.all(
    customers.slice(0, 7).map((customer, index) =>
      insertRegistration({
        contestId: byeContestId,
        userId: customer.id,
        vehicleId: hostVehicleId,
        status: 'CHECKED_IN',
        paymentStatus: 'NOT_REQUIRED',
        entryFeeAmount: 0,
        checkInCode: `BYEC${String(index + 1).padStart(3, '0')}`,
        checkedInCafeId: hostCafe.id,
        checkedInBy: staffId ?? providerId,
        checkedInAt: new Date(now.getTime() - 5 * oneHour + index * 5 * 60 * 1000),
      }),
    ),
  );

  const byeFinalId = await insertMatch({
    contestId: byeContestId,
    cafeId: hostCafe.id,
    roundNo: 3,
    matchNo: 1,
    name: 'Chung kết',
    matchType: 'FINAL',
    status: 'DRAFT',
    scheduledAt: new Date(now.getTime() + 3 * oneHour),
    createdBy: providerId,
    advancementRule: { winners_to_advance: 0, format: 'KNOCKOUT' },
  });
  const byeSemi1Id = await insertMatch({
    contestId: byeContestId,
    cafeId: hostCafe.id,
    roundNo: 2,
    matchNo: 1,
    name: 'Bán kết 1',
    matchType: 'HEAD_TO_HEAD',
    status: 'READY',
    nextMatchId: byeFinalId,
    scheduledAt: new Date(now.getTime() + oneHour),
    createdBy: providerId,
    advancementRule: { winners_to_advance: 1, format: 'KNOCKOUT' },
  });
  const byeSemi2Id = await insertMatch({
    contestId: byeContestId,
    cafeId: hostCafe.id,
    roundNo: 2,
    matchNo: 2,
    name: 'Bán kết 2',
    matchType: 'HEAD_TO_HEAD',
    status: 'DRAFT',
    nextMatchId: byeFinalId,
    scheduledAt: new Date(now.getTime() + 2 * oneHour),
    createdBy: providerId,
    advancementRule: { winners_to_advance: 1, format: 'KNOCKOUT' },
  });
  const byeQuarter1Id = await insertMatch({
    contestId: byeContestId,
    cafeId: hostCafe.id,
    roundNo: 1,
    matchNo: 1,
    name: 'Tứ kết 1',
    matchType: 'HEAD_TO_HEAD',
    status: 'COMPLETED',
    nextMatchId: byeSemi1Id,
    scheduledAt: new Date(now.getTime() - 3 * oneHour),
    startedAt: new Date(now.getTime() - 3 * oneHour),
    endedAt: new Date(now.getTime() - 3 * oneHour + 10 * 60 * 1000),
    decidedAt: new Date(now.getTime() - 3 * oneHour + 10 * 60 * 1000),
    createdBy: providerId,
    decidedBy: providerId,
    advancementRule: { winners_to_advance: 1, format: 'KNOCKOUT' },
    resultSummary: { winner_registration_id: byeRegs[0], participants_count: 2 },
  });
  const byeQuarter2Id = await insertMatch({
    contestId: byeContestId,
    cafeId: hostCafe.id,
    roundNo: 1,
    matchNo: 2,
    name: 'Tứ kết 2',
    matchType: 'HEAD_TO_HEAD',
    status: 'COMPLETED',
    nextMatchId: byeSemi1Id,
    scheduledAt: new Date(now.getTime() - 3 * oneHour + 30 * 60 * 1000),
    startedAt: new Date(now.getTime() - 3 * oneHour + 30 * 60 * 1000),
    endedAt: new Date(now.getTime() - 3 * oneHour + 40 * 60 * 1000),
    decidedAt: new Date(now.getTime() - 3 * oneHour + 40 * 60 * 1000),
    createdBy: providerId,
    decidedBy: providerId,
    advancementRule: { winners_to_advance: 1, format: 'KNOCKOUT' },
    resultSummary: { winner_registration_id: byeRegs[2], participants_count: 2 },
  });
  const byeQuarter3Id = await insertMatch({
    contestId: byeContestId,
    cafeId: hostCafe.id,
    roundNo: 1,
    matchNo: 3,
    name: 'Tứ kết 3',
    matchType: 'HEAD_TO_HEAD',
    status: 'READY',
    nextMatchId: byeSemi2Id,
    scheduledAt: new Date(now.getTime() + 30 * 60 * 1000),
    createdBy: providerId,
    advancementRule: { winners_to_advance: 1, format: 'KNOCKOUT' },
  });
  const byeQuarter4Id = await insertMatch({
    contestId: byeContestId,
    cafeId: hostCafe.id,
    roundNo: 1,
    matchNo: 4,
    name: 'Tứ kết 4 (Bye)',
    matchType: 'HEAD_TO_HEAD',
    status: 'COMPLETED',
    nextMatchId: byeSemi2Id,
    scheduledAt: new Date(now.getTime() - 3 * oneHour + oneHour),
    startedAt: new Date(now.getTime() - 3 * oneHour + oneHour),
    endedAt: new Date(now.getTime() - 3 * oneHour + oneHour),
    decidedAt: new Date(now.getTime() - 3 * oneHour + oneHour),
    createdBy: providerId,
    decidedBy: providerId,
    advancementRule: { winners_to_advance: 1, format: 'KNOCKOUT' },
    resultSummary: {
      winner_registration_id: byeRegs[6],
      participants_count: 1,
      bye: true,
    },
    metadata: { seeded: true, bye: true },
  });
  await insertMatchParticipant({
    matchId: byeQuarter1Id,
    registrationId: byeRegs[0],
    slotNo: 1,
    lane: 'L1',
    seedNo: 1,
    status: 'FINISHED',
    finishPosition: 1,
    isWinner: true,
  });
  await insertMatchParticipant({
    matchId: byeQuarter1Id,
    registrationId: byeRegs[1],
    slotNo: 2,
    lane: 'L2',
    seedNo: 2,
    status: 'FINISHED',
    finishPosition: 2,
    isWinner: false,
  });
  await insertMatchParticipant({
    matchId: byeQuarter2Id,
    registrationId: byeRegs[2],
    slotNo: 1,
    lane: 'L1',
    seedNo: 3,
    status: 'FINISHED',
    finishPosition: 1,
    isWinner: true,
  });
  await insertMatchParticipant({
    matchId: byeQuarter2Id,
    registrationId: byeRegs[3],
    slotNo: 2,
    lane: 'L2',
    seedNo: 4,
    status: 'DNS',
    finishPosition: null,
    isWinner: false,
    resultNote: 'Did not start: vehicle battery failure at the grid',
  });
  await insertMatchParticipant({
    matchId: byeQuarter3Id,
    registrationId: byeRegs[4],
    slotNo: 1,
    lane: 'L1',
    seedNo: 5,
    status: 'READY',
  });
  await insertMatchParticipant({
    matchId: byeQuarter3Id,
    registrationId: byeRegs[5],
    slotNo: 2,
    lane: 'L2',
    seedNo: 6,
    status: 'READY',
  });
  await insertMatchParticipant({
    matchId: byeQuarter4Id,
    registrationId: byeRegs[6],
    slotNo: 1,
    lane: 'L1',
    seedNo: 7,
    status: 'FINISHED',
    finishPosition: 1,
    isWinner: true,
  });
  await insertMatchParticipant({
    matchId: byeSemi1Id,
    registrationId: byeRegs[0],
    slotNo: 1,
    lane: 'L1',
    seedNo: 1,
    status: 'READY',
  });
  await insertMatchParticipant({
    matchId: byeSemi1Id,
    registrationId: byeRegs[2],
    slotNo: 2,
    lane: 'L2',
    seedNo: 3,
    status: 'READY',
  });
  await writeAudit({
    contestId: byeContestId,
    actorId: providerId,
    actorRole: 'PROVIDER',
    eventType: 'contest.matches_generated',
    afterJson: { generated_match_count: 7, bye_count: 1 },
  });
  await writeAudit({
    contestId: byeContestId,
    actorId: providerId,
    actorRole: 'PROVIDER',
    eventType: 'match.bye_advanced',
    matchId: byeQuarter4Id,
    afterJson: { next_match_id: byeSemi2Id, winners: [byeRegs[6]] },
    reason: 'Auto-advance: no opponent in bracket slot',
  });

  const runningTimeTrialContestId = await insertContest({
    cafeId: hostCafe.id,
    providerId,
    name: `${SEED_CONTEST_PREFIX} Victory Challenge Midnight Time Attack 2026`,
    description:
      'Nội dung time attack đang chạy: một lượt RUNNING, các lượt còn lại READY, dùng để test live leaderboard và màn theo dõi lượt chạy.',
    status: 'RUNNING',
    trackTypeId: catalog.driftTrackTypeId,
    contestTypeId: catalog.contestTypeId,
    contestFormatId: catalog.timeTrialFormatId,
    contestTemplateId: catalog.timeTrialTemplateId,
    registrationOpensAt: new Date(now.getTime() - oneDay * 3),
    registrationClosesAt: new Date(now.getTime() - oneDay),
    startsAt: new Date(now.getTime() - 2 * oneHour),
    endsAt: new Date(now.getTime() + 3 * oneHour),
    capacity: 12,
    entryFee: 0,
    vehicleRule: { vehicle_policy: 'RENTAL_ONLY', assignment_policy: 'AT_CHECK_IN' },
    config: {
      format: 'TIME_TRIAL',
      runtime_format: 'TIME_TRIAL',
      drivers_per_match: 1,
      seeding_mode: 'CHECK_IN_ORDER',
      leaderboard_mode: 'BEST_LAP',
      competition_mechanic: 'TIME_ATTACK_BEST_LAP',
      source_reference: VICTORY_CHALLENGE_SOURCE_URL,
      prizes: [{ rank: 1, title: 'Fastest Lap', description: 'Voucher 500.000 VND' }],
    },
    bannerImageUrl: VICTORY_CHALLENGE_BANNER_URL,
  });
  await addContestCafe(runningTimeTrialContestId, hostCafe.id, 'HOST', 0);
  if (staffId) await addContestStaffAssignment(runningTimeTrialContestId, staffId, providerId);

  const runningTimeTrialRegs = await Promise.all(
    customers.slice(0, 4).map((customer, index) =>
      insertRegistration({
        contestId: runningTimeTrialContestId,
        userId: customer.id,
        vehicleId: hostVehicleId,
        status: 'CHECKED_IN',
        paymentStatus: 'NOT_REQUIRED',
        entryFeeAmount: 0,
        checkInCode: `RTTA${String(index + 1).padStart(3, '0')}`,
        checkedInCafeId: hostCafe.id,
        checkedInBy: staffId ?? providerId,
        checkedInAt: new Date(now.getTime() - 3 * oneHour + index * 5 * 60 * 1000),
      }),
    ),
  );

  const runningTimeMatch1Id = await insertMatch({
    contestId: runningTimeTrialContestId,
    cafeId: hostCafe.id,
    roundNo: 1,
    matchNo: 1,
    name: 'Lượt chạy 1',
    matchType: 'TIME_ATTACK',
    status: 'RUNNING',
    scheduledAt: new Date(now.getTime() - 30 * 60 * 1000),
    startedAt: new Date(now.getTime() - 5 * 60 * 1000),
    createdBy: providerId,
    advancementRule: { winners_to_advance: 0, format: 'TIME_TRIAL' },
  });
  const runningTimeMatch2Id = await insertMatch({
    contestId: runningTimeTrialContestId,
    cafeId: hostCafe.id,
    roundNo: 1,
    matchNo: 2,
    name: 'Lượt chạy 2',
    matchType: 'TIME_ATTACK',
    status: 'READY',
    scheduledAt: new Date(now.getTime() + 15 * 60 * 1000),
    createdBy: providerId,
    advancementRule: { winners_to_advance: 0, format: 'TIME_TRIAL' },
  });
  const runningTimeMatch3Id = await insertMatch({
    contestId: runningTimeTrialContestId,
    cafeId: hostCafe.id,
    roundNo: 1,
    matchNo: 3,
    name: 'Lượt chạy 3',
    matchType: 'TIME_ATTACK',
    status: 'READY',
    scheduledAt: new Date(now.getTime() + 30 * 60 * 1000),
    createdBy: providerId,
    advancementRule: { winners_to_advance: 0, format: 'TIME_TRIAL' },
  });
  const runningTimeMatch4Id = await insertMatch({
    contestId: runningTimeTrialContestId,
    cafeId: hostCafe.id,
    roundNo: 1,
    matchNo: 4,
    name: 'Lượt chạy 4',
    matchType: 'TIME_ATTACK',
    status: 'READY',
    scheduledAt: new Date(now.getTime() + 45 * 60 * 1000),
    createdBy: providerId,
    advancementRule: { winners_to_advance: 0, format: 'TIME_TRIAL' },
  });
  await insertMatchParticipant({
    matchId: runningTimeMatch1Id,
    registrationId: runningTimeTrialRegs[0],
    slotNo: 1,
    seedNo: 1,
    status: 'STARTED',
  });
  await insertMatchParticipant({
    matchId: runningTimeMatch2Id,
    registrationId: runningTimeTrialRegs[1],
    slotNo: 1,
    seedNo: 2,
    status: 'READY',
  });
  await insertMatchParticipant({
    matchId: runningTimeMatch3Id,
    registrationId: runningTimeTrialRegs[2],
    slotNo: 1,
    seedNo: 3,
    status: 'READY',
  });
  await insertMatchParticipant({
    matchId: runningTimeMatch4Id,
    registrationId: runningTimeTrialRegs[3],
    slotNo: 1,
    seedNo: 4,
    status: 'READY',
  });
  await writeAudit({
    contestId: runningTimeTrialContestId,
    actorId: providerId,
    actorRole: 'PROVIDER',
    eventType: 'contest.matches_generated',
    afterJson: { generated_match_count: 4 },
  });
  await writeAudit({
    contestId: runningTimeTrialContestId,
    actorId: staffId ?? providerId,
    actorRole: staffId ? 'STAFF' : 'PROVIDER',
    eventType: 'match.started',
    matchId: runningTimeMatch1Id,
    afterJson: { status: 'RUNNING' },
  });

  await insertContestBan({
    providerId,
    contestId: byocContestId,
    userId: customers[5].id,
    scopeType: 'CONTEST',
    reason: 'Seeded contest ban for UI review',
    createdBy: providerId,
    expiresAt: new Date(now.getTime() + oneDay * 7),
    evidence: {
      note: 'Customer repeatedly ignored marshal instructions during practice.',
      evidence_url: 'https://example.com/contest-ban-evidence',
    },
  });
  await insertContestBan({
    providerId,
    contestId: null,
    userId: customers[6].id,
    scopeType: 'PROVIDER',
    reason: 'Seeded provider-wide ban for anti-cheat review',
    createdBy: providerId,
    expiresAt: new Date(now.getTime() + oneDay * 30),
    evidence: {
      note: 'Provider-scope ban demo record.',
      evidence_url: 'https://example.com/provider-ban-evidence',
    },
  });
  await writeAudit({
    contestId: byocContestId,
    actorId: providerId,
    actorRole: 'PROVIDER',
    eventType: 'contest.participant_banned',
    afterJson: { scope_type: 'CONTEST', user_id: customers[5].id },
    reason: 'Seeded contest ban for UI review',
  });
  await writeAudit({
    contestId: byocContestId,
    actorId: providerId,
    actorRole: 'PROVIDER',
    eventType: 'contest.participant_banned',
    afterJson: { scope_type: 'PROVIDER', user_id: customers[6].id },
    reason: 'Seeded provider-wide ban for anti-cheat review',
  });

  if (hostTrackConfigId) {
    await AppDataSource.query(
      `UPDATE contest_matches
       SET track_config_id = $1
       WHERE contest_id = ANY($2::uuid[])
         AND track_config_id IS NULL`,
      [
        hostTrackConfigId,
        [
          runningContestId,
          completedContestId,
          bracketContestId,
          byeContestId,
          runningTimeTrialContestId,
        ],
      ],
    );
  } else {
    logger.warn(
      'Seed',
      'No cafe_track_configs found for host cafe — match track_config_id left NULL',
    );
  }

  logger.info('Seed', `Contest seed ready for provider@gmail.com at cafe ${hostCafe.slug}`);
  logger.info('Seed', `Draft contest: ${draftContestId}`);
  logger.info('Seed', `Open contest: ${openContestId}`);
  logger.info('Seed', `Mixed/BYOC contest: ${byocContestId}`);
  logger.info('Seed', `Closed contest: ${closedContestId}`);
  logger.info('Seed', `Running contest: ${runningContestId}`);
  logger.info('Seed', `Completed contest: ${completedContestId}`);
  logger.info('Seed', `Cancelled contest: ${cancelledContestId}`);
  logger.info('Seed', `Full bracket contest: ${bracketContestId}`);
  logger.info('Seed', `Bye-round contest: ${byeContestId}`);
  logger.info('Seed', `Running time-trial contest: ${runningTimeTrialContestId}`);

  await AppDataSource.destroy();
}

main().catch((error) => {
  logger.error('Seed', 'Failed seeding contests', error);
  process.exit(1);
});
