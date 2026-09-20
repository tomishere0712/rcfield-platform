import 'dotenv/config';
import 'reflect-metadata';
import { AppDataSource } from '../config/database';
import { logger } from '../config/logger';
import { syncContestRaceRecords } from '../services/racing-network.service';
import { UserRole } from '../types';

const RACING_SEED_TAG = '[SEED-RACING]';

const DEMO_CAFES = [
  {
    name: 'RC Arena Hà Nội',
    slug: 'rc-arena-ha-noi',
    city: 'Hà Nội',
    district: 'Cầu Giấy',
    address: '72 Duy Tân, Dịch Vọng Hậu, Cầu Giấy, Hà Nội',
  },
  {
    name: 'RC Drift Club Sài Gòn',
    slug: 'rc-drift-club-sai-gon',
    city: 'TP. Hồ Chí Minh',
    district: 'Quận 7',
    address: '15 Hoàng Văn Thái, Tân Phú, Quận 7, TP. Hồ Chí Minh',
  },
  {
    name: 'RC Speedway Đà Nẵng',
    slug: 'rc-speedway-da-nang',
    city: 'Đà Nẵng',
    district: 'Hải Châu',
    address: '118 Bạch Đằng, Hải Châu 1, Hải Châu, Đà Nẵng',
  },
  {
    name: 'RC Circuit Hải Phòng',
    slug: 'rc-circuit-hai-phong',
    city: 'Hải Phòng',
    district: 'Lê Chân',
    address: '35 Tô Hiệu, Trại Cau, Lê Chân, Hải Phòng',
  },
  {
    name: 'RC Riverside Cần Thơ',
    slug: 'rc-riverside-can-tho',
    city: 'Cần Thơ',
    district: 'Ninh Kiều',
    address: '9 Trần Văn Khéo, Cái Khế, Ninh Kiều, Cần Thơ',
  },
] as const;

const ACHIEVEMENT_DEFINITIONS = [
  {
    code: 'SPEED_NOMAD_5_CAFES',
    name: 'Kẻ du mục tốc độ',
    description: 'Mở khóa khi hoàn tất lượt chơi thật tại 5 quán cafe khác nhau trong hệ thống.',
    badge_icon_url: 'https://cdn.rcfield.vn/badges/speed-nomad-5-cafes.png',
    title_label: 'Kẻ du mục tốc độ',
    rule_code: 'DISTINCT_CAFES_FROM_COMPLETED_PLAY',
    rule_config: { threshold: 5 },
    sort_order: 500,
  },
  {
    code: 'ROAD_REGULAR_3_PLAYS',
    name: 'Tay lái chăm sân',
    description: 'Mở khóa khi hoàn tất ít nhất 3 lượt chơi thật.',
    badge_icon_url: 'https://cdn.rcfield.vn/badges/road-regular-3-plays.png',
    title_label: null,
    rule_code: 'COMPLETED_PLAY_COUNT',
    rule_config: { threshold: 3 },
    sort_order: 200,
  },
  {
    code: 'GRID_VERIFIED_1',
    name: 'Đã lên sàn đấu',
    description: 'Mở khóa khi có ít nhất 1 verified race record từ contest đã publish.',
    badge_icon_url: 'https://cdn.rcfield.vn/badges/grid-verified-1.png',
    title_label: null,
    rule_code: 'VERIFIED_RACE_RECORD_COUNT',
    rule_config: { threshold: 1 },
    sort_order: 300,
  },
  {
    code: 'BEST_LAP_UNDER_32000',
    name: 'Phá mốc 32 giây',
    description: 'Mở khóa khi best lap verified thấp hơn hoặc bằng 32 giây.',
    badge_icon_url: 'https://cdn.rcfield.vn/badges/best-lap-under-32.png',
    title_label: null,
    rule_code: 'BEST_LAP_UNDER_MS',
    rule_config: { threshold: 32000 },
    sort_order: 400,
  },
] as const;

async function ensureBaseUsers() {
  const [provider] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM users WHERE email = 'provider@gmail.com' LIMIT 1`,
  );
  const [staff] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM users WHERE email = 'staff@gmail.com' LIMIT 1`,
  );
  const [customer] = await AppDataSource.query<{ id: string; full_name: string }[]>(
    `SELECT id, full_name FROM users WHERE email = 'customer@gmail.com' LIMIT 1`,
  );

  if (!provider || !staff || !customer) {
    throw new Error(
      'Thiếu provider@gmail.com, staff@gmail.com hoặc customer@gmail.com. Hãy chạy seed-users.ts trước.',
    );
  }

  return { provider, staff, customer };
}

async function ensureDriftTrackType() {
  const [trackType] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM track_types WHERE code = 'DRIFT' LIMIT 1`,
  );
  if (!trackType) {
    throw new Error('Thiếu track type DRIFT. Hãy chạy migration/seed liên quan trước.');
  }
  return trackType;
}

async function ensureCafe(
  providerId: string,
  cafe: (typeof DEMO_CAFES)[number],
  trackTypeId: string,
): Promise<{ id: string; slug: string; name: string }> {
  const [existing] = await AppDataSource.query<{ id: string; slug: string; name: string }[]>(
    `SELECT id, slug, name FROM cafes WHERE slug = $1 LIMIT 1`,
    [cafe.slug],
  );

  if (existing) return existing;

  const [created] = await AppDataSource.query<{ id: string; slug: string; name: string }[]>(
    `INSERT INTO cafes
       (provider_id, name, slug, description, phone, status, address, district, city,
        operating_hours, track_types, slot_duration_minutes, slot_fee_rate,
        max_concurrent_bookings, min_booking_notice_minutes, byoc_capacity)
     VALUES
       ($1, $2, $3, $4, $5, 'ACTIVE', $6, $7, $8,
        $9, $10, 60, 70000, 6, 30, 4)
     RETURNING id, slug, name`,
    [
      providerId,
      cafe.name,
      cafe.slug,
      `${cafe.name} - chi nhánh seed cho Universal Racing Network demo.`,
      '0900000000',
      cafe.address,
      cafe.district,
      cafe.city,
      JSON.stringify({
        mon: { open: '09:00', close: '22:00' },
        tue: { open: '09:00', close: '22:00' },
        wed: { open: '09:00', close: '22:00' },
        thu: { open: '09:00', close: '22:00' },
        fri: { open: '09:00', close: '22:00' },
        sat: { open: '09:00', close: '22:00' },
        sun: { open: '09:00', close: '22:00' },
      }),
      [trackTypeId],
    ],
  );

  logger.info('Seed', `Created racing demo cafe ${cafe.slug}`);
  return created;
}

async function ensureTrackConfig(cafeId: string, trackTypeId: string): Promise<void> {
  const [existing] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id
       FROM cafe_track_configs
      WHERE cafe_id = $1 AND track_type_id = $2 AND deleted_at IS NULL
      LIMIT 1`,
    [cafeId, trackTypeId],
  );
  if (existing) return;

  await AppDataSource.query(
    `INSERT INTO cafe_track_configs
       (cafe_id, track_type_id, max_concurrent, byoc_capacity, is_active)
     VALUES ($1, $2, 6, 4, TRUE)`,
    [cafeId, trackTypeId],
  );
}

async function ensureVehicleForCafe(cafeId: string, cafeSlug: string, trackTypeId: string) {
  const [existingVehicle] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM vehicles WHERE cafe_id = $1 AND deleted_at IS NULL ORDER BY created_at ASC LIMIT 1`,
    [cafeId],
  );
  if (existingVehicle) {
    return existingVehicle.id;
  }

  const [catalog] = await AppDataSource.query<{ id: string }[]>(
    `INSERT INTO vehicle_catalogs
       (cafe_id, name, description, tier, hourly_rate, security_deposit, compatible_track_types)
     VALUES
       ($1, $2, $3, 'STANDARD', 85000, 0, $4)
     RETURNING id`,
    [
      cafeId,
      `Demo Drift Spec - ${cafeSlug}`,
      `${RACING_SEED_TAG} xe demo để tạo completed play và leaderboard thật.`,
      [trackTypeId],
    ],
  );

  const [vehicle] = await AppDataSource.query<{ id: string }[]>(
    `INSERT INTO vehicles
       (cafe_id, catalog_id, status, identifier, color, notes, metadata)
     VALUES
       ($1, $2, 'AVAILABLE', $3, 'Orange', $4, $5)
     RETURNING id`,
    [
      cafeId,
      catalog.id,
      `RACE-${cafeSlug.toUpperCase()}`,
      `${RACING_SEED_TAG} vehicle`,
      JSON.stringify({ seeded_for: 'universal_racing_network' }),
    ],
  );

  logger.info('Seed', `Created racing demo vehicle for ${cafeSlug}`);
  return vehicle.id;
}

async function upsertAchievementDefinitions() {
  for (const definition of ACHIEVEMENT_DEFINITIONS) {
    await AppDataSource.query(
      `INSERT INTO achievement_definitions
         (code, name, description, badge_icon_url, title_label, rule_code, rule_config, is_active, sort_order)
       VALUES
         ($1, $2, $3, $4, $5, $6, $7, TRUE, $8)
       ON CONFLICT (code) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         badge_icon_url = EXCLUDED.badge_icon_url,
         title_label = EXCLUDED.title_label,
         rule_code = EXCLUDED.rule_code,
         rule_config = EXCLUDED.rule_config,
         is_active = EXCLUDED.is_active,
         sort_order = EXCLUDED.sort_order,
         updated_at = NOW()`,
      [
        definition.code,
        definition.name,
        definition.description,
        definition.badge_icon_url,
        definition.title_label,
        definition.rule_code,
        JSON.stringify(definition.rule_config),
        definition.sort_order,
      ],
    );
  }
}

async function cleanupCompletedPlaySeeds(customerId: string) {
  await AppDataSource.query(
    `DELETE FROM inspection_checklists
     WHERE inspection_id IN (
       SELECT i.id
       FROM inspections i
       JOIN sessions s ON s.id = i.session_id
       WHERE s.notes LIKE $1
     )`,
    [`%${RACING_SEED_TAG}%`],
  );
  await AppDataSource.query(
    `DELETE FROM inspections
     WHERE session_id IN (SELECT id FROM sessions WHERE notes LIKE $1)`,
    [`%${RACING_SEED_TAG}%`],
  );
  await AppDataSource.query(
    `DELETE FROM session_vehicles
     WHERE session_id IN (SELECT id FROM sessions WHERE notes LIKE $1)`,
    [`%${RACING_SEED_TAG}%`],
  );
  await AppDataSource.query(
    `DELETE FROM session_participants
     WHERE session_id IN (SELECT id FROM sessions WHERE notes LIKE $1)`,
    [`%${RACING_SEED_TAG}%`],
  );
  await AppDataSource.query(`DELETE FROM sessions WHERE notes LIKE $1`, [`%${RACING_SEED_TAG}%`]);
  await AppDataSource.query(
    `DELETE FROM booking_vehicles
     WHERE booking_id IN (SELECT id FROM bookings WHERE notes LIKE $1)`,
    [`%${RACING_SEED_TAG}%`],
  );
  await AppDataSource.query(
    `DELETE FROM booking_participants
     WHERE booking_id IN (SELECT id FROM bookings WHERE notes LIKE $1)`,
    [`%${RACING_SEED_TAG}%`],
  );
  await AppDataSource.query(
    `DELETE FROM payment_components
     WHERE booking_id IN (SELECT id FROM bookings WHERE notes LIKE $1)`,
    [`%${RACING_SEED_TAG}%`],
  );
  await AppDataSource.query(`DELETE FROM bookings WHERE customer_id = $1 AND notes LIKE $2`, [
    customerId,
    `%${RACING_SEED_TAG}%`,
  ]);
}

async function createCompletedPlay(params: {
  customerId: string;
  staffId: string;
  cafeId: string;
  trackTypeId: string;
  vehicleId: string;
  displayName: string;
  note: string;
  startAt: Date;
  endAt: Date;
}) {
  const [booking] = await AppDataSource.query<{ id: string }[]>(
    `INSERT INTO bookings
       (customer_id, cafe_id, booking_mode, source, track_type_id, status, play_mode,
        slot_start, slot_end, slot_count, payment_expires_at, snapshot, notes)
     VALUES
       ($1, $2, 'SINGLE', 'APP', $3, 'COMPLETED', 'RENTAL',
        $4, $5, 1, $6, $7, $8)
     RETURNING id`,
    [
      params.customerId,
      params.cafeId,
      params.trackTypeId,
      params.startAt,
      params.endAt,
      new Date(params.startAt.getTime() - 60 * 60 * 1000),
      JSON.stringify({ seeded_for: 'racing_network', vehicle_id: params.vehicleId }),
      `${params.note} ${RACING_SEED_TAG}`,
    ],
  );

  const [bookingParticipant] = await AppDataSource.query<{ id: string }[]>(
    `INSERT INTO booking_participants
       (booking_id, user_id, participant_type, display_name, phone, is_primary_responsible)
     VALUES
       ($1, $2, 'REGISTERED_USER', $3, '0912345678', TRUE)
     RETURNING id`,
    [booking.id, params.customerId, params.displayName],
  );

  const [bookingVehicle] = await AppDataSource.query<{ id: string }[]>(
    `INSERT INTO booking_vehicles
       (booking_id, vehicle_id, hourly_rate_snapshot, security_deposit_snapshot)
     VALUES
       ($1, $2, 85000, 0)
     RETURNING id`,
    [booking.id, params.vehicleId],
  );

  const [session] = await AppDataSource.query<{ id: string }[]>(
    `INSERT INTO sessions
       (booking_id, cafe_id, status, checked_in_by, checked_out_by, actual_start_at, actual_end_at, planned_end_at, notes)
     VALUES
       ($1, $2, 'COMPLETED', $3, $3, $4, $5, $5, $6)
     RETURNING id`,
    [
      booking.id,
      params.cafeId,
      params.staffId,
      params.startAt,
      params.endAt,
      `${params.note} ${RACING_SEED_TAG}`,
    ],
  );

  const [sessionParticipant] = await AppDataSource.query<{ id: string }[]>(
    `INSERT INTO session_participants
       (session_id, booking_participant_id, user_id, display_name, phone, role, is_primary_responsible, checked_in_at)
     VALUES
       ($1, $2, $3, $4, '0912345678', 'DRIVER', TRUE, $5)
     RETURNING id`,
    [session.id, bookingParticipant.id, params.customerId, params.displayName, params.startAt],
  );

  const [sessionVehicle] = await AppDataSource.query<{ id: string }[]>(
    `INSERT INTO session_vehicles
       (session_id, booking_vehicle_id, vehicle_source, vehicle_id, assigned_to_participant_id, status, started_at, returned_at)
     VALUES
       ($1, $2, 'RENTAL', $3, $4, 'RETURNED', $5, $6)
     RETURNING id`,
    [
      session.id,
      bookingVehicle.id,
      params.vehicleId,
      sessionParticipant.id,
      params.startAt,
      params.endAt,
    ],
  );

  const [inspection] = await AppDataSource.query<{ id: string }[]>(
    `INSERT INTO inspections
       (session_id, session_vehicle_id, type, subject_type, performed_by, pre_existing_flag, damage_noted, customer_confirmed)
     VALUES
       ($1, $2, 'CHECK_OUT', 'RENTAL_VEHICLE', $3, FALSE, FALSE, TRUE)
     RETURNING id`,
    [session.id, sessionVehicle.id, params.staffId],
  );

  await AppDataSource.query(
    `INSERT INTO inspection_checklists (inspection_id, item_key, item_label, status, note)
     VALUES
       ($1, 'tires', 'Lốp xe', 'OK', ''),
       ($1, 'battery', 'Pin', 'OK', ''),
       ($1, 'shell', 'Vỏ xe', 'OK', '')`,
    [inspection.id],
  );
}

async function seedCompletedPlayHistory(params: {
  providerId: string;
  staffId: string;
  customerId: string;
  customerName: string;
  trackTypeId: string;
}) {
  await cleanupCompletedPlaySeeds(params.customerId);

  const demoCafeRows: Array<{ id: string; slug: string; name: string }> = [];
  for (const cafe of DEMO_CAFES) {
    const cafeRow = await ensureCafe(params.providerId, cafe, params.trackTypeId);
    await ensureTrackConfig(cafeRow.id, params.trackTypeId);
    await ensureVehicleForCafe(cafeRow.id, cafeRow.slug, params.trackTypeId);
    demoCafeRows.push(cafeRow);
  }

  const vehicleByCafe = await AppDataSource.query<{ cafe_id: string; id: string }[]>(
    `SELECT DISTINCT ON (cafe_id) cafe_id, id
     FROM vehicles
     WHERE cafe_id = ANY($1::uuid[])
       AND deleted_at IS NULL
     ORDER BY cafe_id, created_at ASC`,
    [demoCafeRows.map((item) => item.id)],
  );
  const vehicleMap = new Map(vehicleByCafe.map((item) => [item.cafe_id, item.id]));

  const baseStart = new Date('2026-06-20T10:00:00+07:00');
  for (const [index, cafe] of demoCafeRows.entries()) {
    const vehicleId = vehicleMap.get(cafe.id);
    if (!vehicleId) {
      throw new Error(`Cafe ${cafe.slug} không có vehicle để seed completed play.`);
    }

    const startAt = new Date(baseStart.getTime() + index * 24 * 60 * 60 * 1000);
    const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);

    await createCompletedPlay({
      customerId: params.customerId,
      staffId: params.staffId,
      cafeId: cafe.id,
      trackTypeId: params.trackTypeId,
      vehicleId,
      displayName: params.customerName,
      note: `Completed play at ${cafe.slug}`,
      startAt,
      endAt,
    });
  }

  logger.info('Seed', `Created ${demoCafeRows.length} completed plays across distinct cafes`);
}

async function ensureCustomerPassport(customerId: string, fullName: string) {
  await AppDataSource.query(
    `UPDATE users
     SET racing_profile = COALESCE(racing_profile, '{}'::jsonb) || $2::jsonb
     WHERE id = $1`,
    [
      customerId,
      JSON.stringify({
        display_name: fullName,
        driver_handle: 'khach-hang-demo',
        passport_code: 'DRV-DEMO01',
        public_profile_enabled: true,
        leaderboard_opt_in: true,
      }),
    ],
  );
}

async function syncSeedContest(providerId: string) {
  const [contest] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id
     FROM contests
     WHERE name = '[SEED-CONTEST] Victory Challenge RC Time Attack 2026'
     LIMIT 1`,
  );

  if (!contest) {
    throw new Error(
      'Không tìm thấy contest seed completed. Hãy chạy seed-contests.ts trước khi seed racing network.',
    );
  }

  const result = await syncContestRaceRecords(contest.id, {
    userId: providerId,
    role: UserRole.PROVIDER,
  });

  logger.info(
    'Seed',
    `Global sync ready: ${result.synced_count} synced, ${result.superseded_count} superseded`,
  );
}

async function main() {
  await AppDataSource.initialize();
  logger.database('Connected');

  const { provider, staff, customer } = await ensureBaseUsers();
  const trackType = await ensureDriftTrackType();

  await ensureCustomerPassport(customer.id, customer.full_name);
  await upsertAchievementDefinitions();
  await seedCompletedPlayHistory({
    providerId: provider.id,
    staffId: staff.id,
    customerId: customer.id,
    customerName: customer.full_name,
    trackTypeId: trackType.id,
  });
  await syncSeedContest(provider.id);

  await AppDataSource.destroy();
  logger.info('Seed', 'Universal Racing Network demo seed completed.');
}

main().catch((error) => {
  logger.error('Seed', 'Failed seeding racing network demo', error);
  process.exit(1);
});
