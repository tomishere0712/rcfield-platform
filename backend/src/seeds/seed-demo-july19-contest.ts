import 'dotenv/config';
import 'reflect-metadata';
import bcrypt from 'bcrypt';
import { AppDataSource } from '../config/database';
import { logger } from '../config/logger';

// ─────────────────────────────────────────────────────────────────────────────
// Demo seed for 19/07/2026 — a realistic tournament the user can join at 7pm
// ─────────────────────────────────────────────────────────────────────────────

const DEMO_CONTEST_NAME = 'RC Field Vietnam Drift Masters 2026 — Demo Night';

const BANNER_URL =
  'https://images.unsplash.com/photo-1568605117036-5fecc6207a71?auto=format&fit=crop&w=1600&q=80';

const RULEBOOK_SOURCE_URL =
  'https://www.redbull.com/vn-vi/events/red-bull-drifting-world-championship';

const DEMO_RACER = {
  email: 'rcfield.demo.racer@gmail.com',
  full_name: 'Nguyễn Văn Demo',
  password: '123456',
};

const SEEDED_RACERS = [
  { email: 'seed.racer.01@gmail.com', full_name: 'Nguyễn Hoàng Phúc' },
  { email: 'seed.racer.02@gmail.com', full_name: 'Trần Gia Bảo' },
  { email: 'seed.racer.03@gmail.com', full_name: 'Lê Minh Quân' },
  { email: 'seed.racer.04@gmail.com', full_name: 'Phạm Nhật Nam' },
  { email: 'seed.racer.05@gmail.com', full_name: 'Đỗ Khánh Linh' },
  { email: 'seed.racer.06@gmail.com', full_name: 'Võ Quốc Hưng' },
  { email: 'seed.racer.07@gmail.com', full_name: 'Bùi Thành Đạt' },
  { email: 'seed.racer.08@gmail.com', full_name: 'Ngô Tuệ An' },
  { email: 'seed.racer.09@gmail.com', full_name: 'Hồ Hải Long' },
  { email: 'seed.racer.10@gmail.com', full_name: 'Dương Minh Khoa' },
  { email: 'seed.racer.11@gmail.com', full_name: 'Lý Quang Huy' },
  { email: 'seed.racer.12@gmail.com', full_name: 'Trịnh Công Chính' },
  { email: 'seed.racer.13@gmail.com', full_name: 'Mai Thanh Tùng' },
  { email: 'seed.racer.14@gmail.com', full_name: 'Vũ Hoàng Nam' },
  { email: 'seed.racer.15@gmail.com', full_name: 'Phan Đức Thịnh' },
  { email: 'seed.racer.16@gmail.com', full_name: 'Lâm Hùng Dũng' },
  { email: 'seed.racer.17@gmail.com', full_name: 'Tô Hoàng Việt' },
];

const DANANG_CAFE = {
  slug: 'rc-speed-park-da-nang',
  name: 'RC Speed Park Đà Nẵng',
  description:
    'Câu lạc bộ RC hiện đại tại trung tâm Đà Nẵng. Đường đua drift chuẩn 100m, sàn epoxy nhẵn bóng, khu vực F&B và sân tập mở cho mọi cấp độ. Chi nhánh thứ ba của RC Field, đại diện miền Trung trong chuỗi giải đấu quốc gia.',
  phone: '0236 123 4567',
  address: '99 Nguyễn Văn Linh, Hải Châu, Đà Nẵng',
  district: 'Hải Châu',
  city: 'Đà Nẵng',
  latitude: 16.0471,
  longitude: 108.2062,
};

// Local time +07:00 for 19/07/2026
const REGISTRATION_OPEN = new Date('2026-07-19T18:00:00+07:00');
const REGISTRATION_CLOSE = new Date('2026-07-19T19:30:00+07:00');
const STARTS_AT = new Date('2026-07-19T19:30:00+07:00');
const ENDS_AT = new Date('2026-07-19T23:00:00+07:00');

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function ensureUser(email: string, fullName: string): Promise<string> {
  const [existing] = await AppDataSource.query<{ id: string; full_name: string }[]>(
    `SELECT id, full_name FROM users WHERE email = $1 AND deleted_at IS NULL LIMIT 1`,
    [email],
  );

  if (existing) {
    if (existing.full_name !== fullName) {
      await AppDataSource.query(`UPDATE users SET full_name = $2 WHERE id = $1`, [
        existing.id,
        fullName,
      ]);
    }
    return existing.id;
  }

  const passwordHash = await bcrypt.hash('123456', 10);
  const [created] = await AppDataSource.query<{ id: string }[]>(
    `INSERT INTO users (email, full_name, password_hash, role, is_active)
     VALUES ($1, $2, $3, 'CUSTOMER', TRUE)
     RETURNING id`,
    [email, fullName, passwordHash],
  );
  logger.info('SeedDemo', `Created customer ${email}`);
  return created.id;
}

async function loadProviderContext(): Promise<{
  providerId: string;
  staffId: string | null;
  providerOtherId: string;
  staffOtherId: string | null;
  cafeHN: { id: string; name: string; slug: string };
  cafeSG: { id: string; name: string; slug: string } | null;
  catalog: {
    contestTypeId: string;
    knockoutFormatId: string;
    knockoutTemplateId: string;
    driftTrackTypeId: string;
  };
}> {
  const [provider] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM users WHERE email = 'provider@gmail.com' AND deleted_at IS NULL LIMIT 1`,
  );
  if (!provider) throw new Error('provider@gmail.com not found. Run seed-users.ts first.');

  const [providerOther] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM users WHERE email = 'provider_other@gmail.com' AND deleted_at IS NULL LIMIT 1`,
  );
  if (!providerOther) {
    throw new Error('provider_other@gmail.com not found. Run seed-users.ts first.');
  }

  const [staff] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM users WHERE email = 'staff@gmail.com' AND deleted_at IS NULL LIMIT 1`,
  );
  const [staffOther] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM users WHERE email = 'staff_other@gmail.com' AND deleted_at IS NULL LIMIT 1`,
  );

  const [cafeHN] = await AppDataSource.query<{ id: string; name: string; slug: string }[]>(
    `SELECT id, name, slug FROM cafes WHERE slug = 'rc-arena-ha-noi' AND deleted_at IS NULL LIMIT 1`,
  );
  if (!cafeHN) throw new Error('RC Arena Hà Nội not found. Run seed-cafes.ts first.');

  const [cafeSG] = await AppDataSource.query<{ id: string; name: string; slug: string }[]>(
    `SELECT id, name, slug FROM cafes WHERE slug = 'rc-drift-club-sai-gon' AND deleted_at IS NULL LIMIT 1`,
  );

  const [contestType] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM contest_types WHERE code = 'PROVIDER_STANDARD' LIMIT 1`,
  );
  const [knockoutFormat] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM contest_formats WHERE code = 'KNOCKOUT' LIMIT 1`,
  );
  const [knockoutTemplate] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM contest_templates WHERE code = 'provider_standard_knockout' LIMIT 1`,
  );
  const [driftTrack] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM track_types WHERE code = 'DRIFT' LIMIT 1`,
  );

  if (!contestType || !knockoutFormat || !knockoutTemplate || !driftTrack) {
    throw new Error('Contest catalog or DRIFT track type missing. Run migrations first.');
  }

  return {
    providerId: provider.id,
    staffId: staff?.id ?? null,
    providerOtherId: providerOther.id,
    staffOtherId: staffOther?.id ?? null,
    cafeHN,
    cafeSG,
    catalog: {
      contestTypeId: contestType.id,
      knockoutFormatId: knockoutFormat.id,
      knockoutTemplateId: knockoutTemplate.id,
      driftTrackTypeId: driftTrack.id,
    },
  };
}

async function ensureProviderOtherActive(providerOtherId: string): Promise<void> {
  const [profile] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM provider_profiles WHERE user_id = $1 AND deleted_at IS NULL`,
    [providerOtherId],
  );

  if (!profile) {
    await AppDataSource.query(
      `INSERT INTO provider_profiles (user_id, business_name, registration_status)
       VALUES ($1, $2, 'ACTIVE')`,
      [providerOtherId, 'RC Speed Park Đà Nẵng Business'],
    );
    logger.info('SeedDemo', 'Activated provider_other profile');
  } else {
    await AppDataSource.query(
      `UPDATE provider_profiles
       SET registration_status = 'ACTIVE', updated_at = NOW()
       WHERE user_id = $1 AND deleted_at IS NULL`,
      [providerOtherId],
    );
  }

  const [existingSub] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM provider_subscriptions WHERE provider_id = $1 AND deleted_at IS NULL`,
    [providerOtherId],
  );
  if (!existingSub) {
    const [trialPlan] = await AppDataSource.query<{ id: string }[]>(
      `SELECT id FROM subscription_plans WHERE name = 'TRIAL' LIMIT 1`,
    );
    if (trialPlan) {
      await AppDataSource.query(
        `INSERT INTO provider_subscriptions
           (provider_id, plan_id, status, started_at, expires_at, ai_quota_reset_at)
         VALUES ($1, $2, 'TRIAL', NOW(), NOW() + INTERVAL '30 days', NOW() + INTERVAL '1 month')`,
        [providerOtherId, trialPlan.id],
      );
      logger.info('SeedDemo', 'Created TRIAL subscription for provider_other');
    }
  }
}

async function getOrCreateDanangCafe(
  providerOtherId: string,
  staffOtherId: string | null,
  driftTrackTypeId: string,
): Promise<string> {
  const [existing] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM cafes WHERE slug = $1 AND deleted_at IS NULL LIMIT 1`,
    [DANANG_CAFE.slug],
  );

  if (existing) {
    await AppDataSource.query(
      `UPDATE cafes
       SET status = 'ACTIVE', deleted_at = NULL, provider_id = $2
       WHERE id = $1`,
      [existing.id, providerOtherId],
    );
    logger.warn('SeedDemo', `Reused existing cafe ${DANANG_CAFE.slug}`);
    return existing.id;
  }

  const [created] = await AppDataSource.query<{ id: string }[]>(
    `INSERT INTO cafes (
      provider_id, name, slug, description, phone, status,
      address, district, city, latitude, longitude,
      operating_hours, track_types,
      slot_duration_minutes, slot_fee_rate, max_concurrent_bookings,
      min_booking_notice_minutes, byoc_capacity
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
    RETURNING id`,
    [
      providerOtherId,
      DANANG_CAFE.name,
      DANANG_CAFE.slug,
      DANANG_CAFE.description,
      DANANG_CAFE.phone,
      'ACTIVE',
      DANANG_CAFE.address,
      DANANG_CAFE.district,
      DANANG_CAFE.city,
      DANANG_CAFE.latitude,
      DANANG_CAFE.longitude,
      JSON.stringify({
        mon: { open: '10:00', close: '23:00' },
        tue: { open: '10:00', close: '23:00' },
        wed: { open: '10:00', close: '23:00' },
        thu: { open: '10:00', close: '23:00' },
        fri: { open: '10:00', close: '24:00' },
        sat: { open: '09:00', close: '24:00' },
        sun: { open: '09:00', close: '24:00' },
      }),
      [driftTrackTypeId],
      60,
      60000,
      6,
      30,
      3,
    ],
  );
  logger.info('SeedDemo', `Created ${DANANG_CAFE.name} (${created.id})`);

  await AppDataSource.query(
    `INSERT INTO cafe_track_configs (cafe_id, track_type_id, max_concurrent, byoc_capacity, is_active)
     VALUES ($1, $2, $3, $4, TRUE)`,
    [created.id, driftTrackTypeId, 6, 3],
  );

  await seedVehiclesForDanang(created.id, driftTrackTypeId);
  await seedMenuForDanang(created.id);

  if (staffOtherId) {
    const [existingAssign] = await AppDataSource.query<{ id: string }[]>(
      `SELECT id FROM staff_cafe_assignments WHERE staff_id = $1`,
      [staffOtherId],
    );
    if (!existingAssign) {
      await AppDataSource.query(
        `INSERT INTO staff_cafe_assignments (staff_id, cafe_id, assigned_by)
         VALUES ($1, $2, $3)`,
        [staffOtherId, created.id, providerOtherId],
      );
      logger.info('SeedDemo', `Assigned staff_other to ${DANANG_CAFE.name}`);
    }
  }

  return created.id;
}

async function seedVehiclesForDanang(cafeId: string, driftTrackTypeId: string): Promise<void> {
  const vehicles = [
    {
      name: 'Sakura D5 Sport',
      description:
        'Khung drift nhẹ, bố trí mid-motor cân bằng, phù hợp tập trượt và thi đấu entry-level.',
      tier: 'STANDARD',
      hourly_rate: 85000,
    },
    {
      name: 'Yokomo YD-2E',
      description:
        'RWD drift chuẩn thi đấu với servo nhanh và treo độ nhạy, thích hợp đường đua epoxy.',
      tier: 'STANDARD',
      hourly_rate: 95000,
    },
    {
      name: 'MST RMX 2.0 S',
      description: 'Rear-motor drift cao cấp, độ chính xác cao, body kit Lexus RC F carbon-look.',
      tier: 'PREMIUM',
      hourly_rate: 130000,
    },
    {
      name: 'Reve D RDX Plus',
      description: 'Khung carbon RWD hiện đại, trọng tâm thấp, giữ góc drift ổn định ở tốc độ cao.',
      tier: 'PREMIUM',
      hourly_rate: 140000,
    },
    {
      name: 'Overdose Vacula II',
      description: 'Phiên bản giới hạn dành cho drift chuyên nghiệp, nhôm CNC và servo metal gear.',
      tier: 'RESTRICTED',
      hourly_rate: 220000,
    },
    {
      name: 'Tamiya TT-02D Drift',
      description:
        'Xe drift 4WD shaft-driven dễ điều khiển, lựa chọn lý tưởng cho người mới tại miền Trung.',
      tier: 'STANDARD',
      hourly_rate: 80000,
    },
  ];

  for (const v of vehicles) {
    const [existing] = await AppDataSource.query<{ id: string }[]>(
      `SELECT id FROM vehicle_catalogs WHERE cafe_id = $1 AND name = $2 AND deleted_at IS NULL`,
      [cafeId, v.name],
    );
    if (existing) continue;

    const [catalog] = await AppDataSource.query<{ id: string }[]>(
      `INSERT INTO vehicle_catalogs (
        cafe_id, name, description, tier,
        hourly_rate, security_deposit, compatible_track_types,
        cover_image_url
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING id`,
      [
        cafeId,
        v.name,
        v.description,
        v.tier,
        v.hourly_rate,
        0,
        [driftTrackTypeId],
        'https://cdn.rcfield.vn/vehicles/tamiya-cover.jpg',
      ],
    );

    const vehicleCode = v.name
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    for (let i = 1; i <= 4; i += 1) {
      await AppDataSource.query(
        `INSERT INTO vehicles (
          cafe_id, catalog_id, status, identifier, color,
          distinctive_image_url, notes, metadata
        ) VALUES ($1, $2, 'AVAILABLE', $3, $4, $5, $6, $7)`,
        [
          cafeId,
          catalog.id,
          `${vehicleCode}-AVAIL-${String(i).padStart(2, '0')}`,
          'Blue',
          'https://cdn.rcfield.vn/vehicles/unit-blue.jpg',
          'Sẵn sàng cho thuê và thi đấu.',
          JSON.stringify({ seeded_for: 'demo_july19', unit_number: i }),
        ],
      );
    }
  }

  logger.info('SeedDemo', `Seeded vehicles for ${DANANG_CAFE.name}`);
}

async function seedMenuForDanang(cafeId: string): Promise<void> {
  const items = [
    {
      name: 'Trà đào thơm',
      description: 'Trà đen thơm vị đào tươi, đá lạnh',
      price: 30000,
      category: 'DRINK',
    },
    {
      name: 'Cà phê sữa Đà Nẵng',
      description: 'Cà phê rang xay phố Hội, sữa đặc',
      price: 25000,
      category: 'DRINK',
    },
    {
      name: 'Sinh tố bơ',
      description: 'Bơ sáp xay nhuyễn, sữa đặc',
      price: 35000,
      category: 'DRINK',
    },
    {
      name: 'Nước ép dứa',
      description: 'Dứa tươi ép nguyên chất, không đường',
      price: 25000,
      category: 'DRINK',
    },
    {
      name: 'Bánh mì gà nướng',
      description: 'Bánh mì nướng giòn nhân gà xé phay sốt mayonnaise',
      price: 35000,
      category: 'SNACK',
    },
    {
      name: 'Cá viên chiên',
      description: 'Cá viên chiên giòn, kèm tương ớt',
      price: 20000,
      category: 'SNACK',
    },
    {
      name: 'Khoai lang chiên',
      description: 'Khoai lang kén chiên vàng, nhân phô mai',
      price: 25000,
      category: 'SNACK',
    },
  ];

  for (const item of items) {
    const [existing] = await AppDataSource.query<{ id: string }[]>(
      `SELECT id FROM menu_items WHERE cafe_id = $1 AND name = $2 AND deleted_at IS NULL`,
      [cafeId, item.name],
    );
    if (existing) continue;
    await AppDataSource.query(
      `INSERT INTO menu_items (cafe_id, name, description, price, category, is_available)
       VALUES ($1, $2, $3, $4, $5, TRUE)`,
      [cafeId, item.name, item.description, item.price, item.category],
    );
  }
  logger.info('SeedDemo', `Seeded ${items.length} menu items for ${DANANG_CAFE.name}`);
}

async function cleanupDemoContest(): Promise<void> {
  const contests = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM contests WHERE name = $1 AND deleted_at IS NULL`,
    [DEMO_CONTEST_NAME],
  );
  if (contests.length === 0) return;

  const ids = contests.map((c) => c.id);
  await AppDataSource.query(
    `DELETE FROM payment_transactions
     WHERE contest_registration_id IN (SELECT id FROM contest_registrations WHERE contest_id = ANY($1::uuid[]))`,
    [ids],
  );
  await AppDataSource.query(
    `DELETE FROM contest_staff_assignments WHERE contest_id = ANY($1::uuid[])`,
    [ids],
  );
  await AppDataSource.query(`DELETE FROM contest_bans WHERE contest_id = ANY($1::uuid[])`, [ids]);
  await AppDataSource.query(`DELETE FROM contest_audit_logs WHERE contest_id = ANY($1::uuid[])`, [
    ids,
  ]);
  await AppDataSource.query(
    `DELETE FROM contest_match_participants
     WHERE match_id IN (SELECT id FROM contest_matches WHERE contest_id = ANY($1::uuid[]))`,
    [ids],
  );
  await AppDataSource.query(`DELETE FROM contest_matches WHERE contest_id = ANY($1::uuid[])`, [
    ids,
  ]);
  await AppDataSource.query(
    `DELETE FROM contest_registrations WHERE contest_id = ANY($1::uuid[])`,
    [ids],
  );
  await AppDataSource.query(`DELETE FROM contest_cafes WHERE contest_id = ANY($1::uuid[])`, [ids]);
  await AppDataSource.query(`DELETE FROM contests WHERE id = ANY($1::uuid[])`, [ids]);
  logger.info('SeedDemo', `Cleaned ${contests.length} existing demo contest(s)`);
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
): Promise<void> {
  await AppDataSource.query(
    `INSERT INTO contest_cafes (contest_id, cafe_id, role, display_order, check_in_enabled)
     VALUES ($1, $2, $3, $4, TRUE)`,
    [contestId, cafeId, role, displayOrder],
  );
}

async function addContestStaffAssignment(
  contestId: string,
  staffId: string,
  assignedBy: string,
): Promise<void> {
  await AppDataSource.query(
    `INSERT INTO contest_staff_assignments (contest_id, staff_id, assigned_by)
     VALUES ($1, $2, $3)
     ON CONFLICT (contest_id, staff_id) DO NOTHING`,
    [contestId, staffId, assignedBy],
  );
}

async function insertRegistration(params: {
  contestId: string;
  userId: string;
  vehicleSource?: 'RENTAL' | 'BYOC';
  vehicleId: string | null;
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
       (contest_id, user_id, participant_role_snapshot, vehicle_source, vehicle_id,
        status, check_in_code, checked_in_cafe_id, checked_in_by, checked_in_at,
        payment_status, entry_fee_amount, entry_fee_due_at, cancelled_by, cancelled_at,
        cancellation_reason, metadata)
     VALUES
       ($1, $2, 'CUSTOMER', $3, $4,
        $5, $6, $7, $8, $9,
        $10, $11, NOW() + INTERVAL '3 days', NULL, NULL,
        $12, $13)
     RETURNING id`,
    [
      params.contestId,
      params.userId,
      params.vehicleSource ?? 'RENTAL',
      params.vehicleId,
      params.status,
      params.checkInCode,
      params.checkedInCafeId ?? null,
      params.checkedInBy ?? null,
      params.checkedInAt ?? null,
      params.paymentStatus,
      params.entryFeeAmount,
      params.cancellationReason ?? null,
      JSON.stringify({ demo_july19: true, ...(params.metadata ?? {}) }),
    ],
  );
  return registration.id;
}

async function insertContestEntryPayment(params: {
  registrationId: string;
  amount: number;
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  txnRef: string;
}): Promise<void> {
  await AppDataSource.query(
    `INSERT INTO payment_transactions
       (booking_id, contest_registration_id, subject_type, type, gateway, txn_ref,
        amount, status, raw_request, raw_response)
     VALUES
       (NULL, $1, 'CONTEST_ENTRY', 'PAYMENT', 'VNPAY', $2,
        $3, $4, $5, $6)`,
    [
      params.registrationId,
      params.txnRef,
      params.amount,
      params.status,
      JSON.stringify({ registrationId: params.registrationId }),
      JSON.stringify({ vnp_ResponseCode: '00', vnp_TransactionStatus: '00' }),
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
}): Promise<void> {
  await AppDataSource.query(
    `INSERT INTO contest_audit_logs
       (contest_id, registration_id, match_id, actor_id, actor_role, event_type, after_json, reason, metadata)
     VALUES
       ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      params.contestId,
      params.registrationId ?? null,
      params.matchId ?? null,
      params.actorId,
      params.actorRole,
      params.eventType,
      JSON.stringify(params.afterJson ?? {}),
      params.reason ?? null,
      JSON.stringify({ demo_july19: true }),
    ],
  );
}

async function pickAvailableVehicle(cafeId: string): Promise<string> {
  const [vehicle] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id
     FROM vehicles
     WHERE cafe_id = $1 AND status = 'AVAILABLE' AND deleted_at IS NULL
     ORDER BY created_at ASC
     LIMIT 1`,
    [cafeId],
  );
  if (!vehicle) throw new Error(`No available vehicle found for cafe ${cafeId}`);
  return vehicle.id;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  await AppDataSource.initialize();
  logger.database('Connected');

  const context = await loadProviderContext();
  await ensureProviderOtherActive(context.providerOtherId);

  const cafeDaNangId = await getOrCreateDanangCafe(
    context.providerOtherId,
    context.staffOtherId,
    context.catalog.driftTrackTypeId,
  );

  // Create demo racers
  const demoUserId = await ensureUser(DEMO_RACER.email, DEMO_RACER.full_name);
  const racerIds = await Promise.all(SEEDED_RACERS.map((r) => ensureUser(r.email, r.full_name)));

  await cleanupDemoContest();

  const contestId = await insertContest({
    cafeId: context.cafeHN.id,
    providerId: context.providerId,
    name: DEMO_CONTEST_NAME,
    description:
      'Giải đấu drift RC quốc gia 2026 — đêm chung kết khu vực miền Bắc, miền Trung và miền Nam. ' +
      '16 tay đua đã sẵn sàng, chỉ còn 1 slot cuối cùng cho bạn. ' +
      'Thể thức đối kháng loại trực tiếp 1v1, cho phép thuê xe tại chỗ hoặc mang xe cá nhân (BYOC). ' +
      'Đăng ký mở từ 18h00, sân khấu bắt đầu lúc 19h30 tối 19/07/2026.',
    status: 'OPEN',
    trackTypeId: context.catalog.driftTrackTypeId,
    contestTypeId: context.catalog.contestTypeId,
    contestFormatId: context.catalog.knockoutFormatId,
    contestTemplateId: context.catalog.knockoutTemplateId,
    registrationOpensAt: REGISTRATION_OPEN,
    registrationClosesAt: REGISTRATION_CLOSE,
    startsAt: STARTS_AT,
    endsAt: ENDS_AT,
    capacity: 17,
    entryFee: 100000,
    vehicleRule: {
      vehicle_policy: 'MIXED',
      assignment_policy: 'PRE_ASSIGNED',
      byoc_require_tech_inspection: true,
    },
    config: {
      format: 'KNOCKOUT',
      runtime_format: 'KNOCKOUT',
      drivers_per_match: 2,
      seeding_mode: 'CHECK_IN_ORDER',
      auto_bye: true,
      competition_mechanic: 'HEAD_TO_HEAD_ELIMINATION',
      resource_locks: [
        { cafe_id: context.cafeHN.id, scope: 'FULL_BRANCH', track_config_ids: [] },
        ...(context.cafeSG
          ? [{ cafe_id: context.cafeSG.id, scope: 'SELECTED_TRACKS', track_config_ids: [] }]
          : []),
        { cafe_id: cafeDaNangId, scope: 'SELECTED_TRACKS', track_config_ids: [] },
      ],
      rulebook: { source_reference: RULEBOOK_SOURCE_URL, race_day_date: '2026-07-19' },
      prizes: [
        { rank: 1, title: 'Vô địch', description: 'Cúp vô địch + 2.000.000 VND tiền thưởng' },
        { rank: 2, title: 'Á quân', description: 'Huy chương bạc + 1.000.000 VND' },
        { rank: 3, title: 'Hạng 3', description: 'Huy chương đồng + 500.000 VND' },
      ],
    },
    bannerImageUrl: BANNER_URL,
  });

  await addContestCafe(contestId, context.cafeHN.id, 'HOST', 0);
  if (context.cafeSG) await addContestCafe(contestId, context.cafeSG.id, 'PARTICIPATING', 1);
  await addContestCafe(contestId, cafeDaNangId, 'PARTICIPATING', 2);
  if (context.staffId)
    await addContestStaffAssignment(contestId, context.staffId, context.providerId);

  await writeAudit({
    contestId,
    actorId: context.providerId,
    actorRole: 'PROVIDER',
    eventType: 'contest.created',
    afterJson: { status: 'OPEN' },
  });

  // Prepare vehicles
  const hostVehicle = await pickAvailableVehicle(context.cafeHN.id);
  const sgVehicle = context.cafeSG ? await pickAvailableVehicle(context.cafeSG.id) : hostVehicle;
  const dnVehicle = await pickAvailableVehicle(cafeDaNangId);

  // Registrations: 15 seeded + 1 demo + 1 empty slot (capacity 17)
  const regs: { id: string; userId: string; status: string; paymentStatus: string }[] = [];

  const pushReg = async (params: {
    userId: string;
    vehicleSource: 'RENTAL' | 'BYOC';
    vehicleId: string | null;
    status: string;
    paymentStatus: string;
    checkInCode: string;
    checkedInCafeId?: string | null;
    checkedInBy?: string | null;
    checkedInAt?: Date | null;
    cancellationReason?: string | null;
    metadata?: Record<string, unknown>;
  }) => {
    const id = await insertRegistration({
      contestId,
      userId: params.userId,
      vehicleSource: params.vehicleSource,
      vehicleId: params.vehicleId,
      status: params.status,
      paymentStatus: params.paymentStatus,
      entryFeeAmount: 100000,
      checkInCode: params.checkInCode,
      checkedInCafeId: params.checkedInCafeId,
      checkedInBy: params.checkedInBy,
      checkedInAt: params.checkedInAt,
      cancellationReason: params.cancellationReason,
      metadata: params.metadata,
    });
    regs.push({
      id,
      userId: params.userId,
      status: params.status,
      paymentStatus: params.paymentStatus,
    });
    return id;
  };

  // 6 confirmed + paid (rentals from different branches)
  const confirmedPaidIds: string[] = [];
  const confirmedPaidVehicles = [
    hostVehicle,
    sgVehicle,
    dnVehicle,
    hostVehicle,
    dnVehicle,
    sgVehicle,
  ];
  for (let i = 0; i < 6; i += 1) {
    const id = await pushReg({
      userId: racerIds[i],
      vehicleSource: 'RENTAL',
      vehicleId: confirmedPaidVehicles[i],
      status: 'CONFIRMED',
      paymentStatus: 'MARKED_PAID',
      checkInCode: `DMOP${String(i + 1).padStart(3, '0')}`,
    });
    confirmedPaidIds.push(id);
    await insertContestEntryPayment({
      registrationId: id,
      amount: 100000,
      status: 'SUCCESS',
      txnRef: `demo_july19_confirmed_${i + 1}`,
    });
  }

  // 1 BYOC confirmed + paid
  const byocId = await pushReg({
    userId: racerIds[6],
    vehicleSource: 'BYOC',
    vehicleId: null,
    status: 'CONFIRMED',
    paymentStatus: 'MARKED_PAID',
    checkInCode: 'DM-BYOC-001',
    metadata: { byoc_vehicle: 'Yokomo YD-2S Plus', tech_inspection: 'passed' },
  });
  await insertContestEntryPayment({
    registrationId: byocId,
    amount: 100000,
    status: 'SUCCESS',
    txnRef: 'demo_july19_byoc_paid',
  });

  // 3 pending + pending payment
  const pendingIds: string[] = [];
  for (let i = 0; i < 3; i += 1) {
    const id = await pushReg({
      userId: racerIds[7 + i],
      vehicleSource: 'RENTAL',
      vehicleId: hostVehicle,
      status: 'PENDING',
      paymentStatus: 'PENDING_PAYMENT',
      checkInCode: `DMPD${String(i + 1).padStart(3, '0')}`,
    });
    pendingIds.push(id);
    await insertContestEntryPayment({
      registrationId: id,
      amount: 100000,
      status: 'PENDING',
      txnRef: `demo_july19_pending_${i + 1}`,
    });
  }

  // 2 waived
  for (let i = 0; i < 2; i += 1) {
    await pushReg({
      userId: racerIds[10 + i],
      vehicleSource: 'RENTAL',
      vehicleId: dnVehicle,
      status: 'CONFIRMED',
      paymentStatus: 'WAIVED',
      checkInCode: `DMWV${String(i + 1).padStart(3, '0')}`,
      metadata: { fee_note: 'Sponsored driver' },
    });
  }

  // 2 cancelled
  for (let i = 0; i < 2; i += 1) {
    await pushReg({
      userId: racerIds[12 + i],
      vehicleSource: 'RENTAL',
      vehicleId: hostVehicle,
      status: 'CANCELLED',
      paymentStatus: 'PENDING_PAYMENT',
      checkInCode: `DMCX${String(i + 1).padStart(3, '0')}`,
      cancellationReason: i === 0 ? 'Khách đổi lịch cá nhân' : 'Không đủ thời gian chuẩn bị xe',
    });
  }

  // 1 checked-in (paid)
  const checkedInId = await pushReg({
    userId: racerIds[14],
    vehicleSource: 'RENTAL',
    vehicleId: hostVehicle,
    status: 'CHECKED_IN',
    paymentStatus: 'MARKED_PAID',
    checkInCode: 'DMCK001',
    checkedInCafeId: context.cafeHN.id,
    checkedInBy: context.staffId ?? context.providerId,
    checkedInAt: new Date('2026-07-19T18:45:00+07:00'),
  });
  await insertContestEntryPayment({
    registrationId: checkedInId,
    amount: 100000,
    status: 'SUCCESS',
    txnRef: 'demo_july19_checked_in_paid',
  });

  // 2 extra confirmed + paid (fills the grid to 16 active + 1 empty slot)
  const extraPaidIds: string[] = [];
  for (let i = 0; i < 2; i += 1) {
    const id = await pushReg({
      userId: racerIds[15 + i],
      vehicleSource: 'RENTAL',
      vehicleId: i === 0 ? sgVehicle : dnVehicle,
      status: 'CONFIRMED',
      paymentStatus: 'MARKED_PAID',
      checkInCode: `DMEX${String(i + 1).padStart(3, '0')}`,
    });
    extraPaidIds.push(id);
    await insertContestEntryPayment({
      registrationId: id,
      amount: 100000,
      status: 'SUCCESS',
      txnRef: `demo_july19_extra_${i + 1}`,
    });
  }

  // Demo racer — confirmed + paid, BYOC vehicle pre-assigned
  const demoRegId = await pushReg({
    userId: demoUserId,
    vehicleSource: 'BYOC',
    vehicleId: null,
    status: 'CONFIRMED',
    paymentStatus: 'MARKED_PAID',
    checkInCode: 'DMDEMO001',
    metadata: { byoc_vehicle: 'Sakura D5 Sport', role: 'demo_account' },
  });
  await insertContestEntryPayment({
    registrationId: demoRegId,
    amount: 100000,
    status: 'SUCCESS',
    txnRef: 'demo_july19_demo_account_paid',
  });

  // Audit trail
  for (const id of confirmedPaidIds) {
    await writeAudit({
      contestId,
      actorId: context.providerId,
      actorRole: 'PROVIDER',
      eventType: 'registration.approved',
      registrationId: id,
      afterJson: { status: 'CONFIRMED', paymentStatus: 'MARKED_PAID' },
    });
  }
  for (const id of extraPaidIds) {
    await writeAudit({
      contestId,
      actorId: context.providerId,
      actorRole: 'PROVIDER',
      eventType: 'registration.approved',
      registrationId: id,
      afterJson: { status: 'CONFIRMED', paymentStatus: 'MARKED_PAID' },
    });
  }
  await writeAudit({
    contestId,
    actorId: context.providerId,
    actorRole: 'PROVIDER',
    eventType: 'registration.approved',
    registrationId: byocId,
    afterJson: { status: 'CONFIRMED', vehicleSource: 'BYOC' },
    reason: 'BYOC tech inspection passed',
  });
  for (const id of pendingIds) {
    await writeAudit({
      contestId,
      actorId: context.providerId,
      actorRole: 'PROVIDER',
      eventType: 'registration.created',
      registrationId: id,
      afterJson: { status: 'PENDING' },
    });
  }
  await writeAudit({
    contestId,
    actorId: context.providerId,
    actorRole: 'PROVIDER',
    eventType: 'registration.checked_in',
    registrationId: checkedInId,
    afterJson: { status: 'CHECKED_IN', checkedInCafeId: context.cafeHN.id },
  });
  await writeAudit({
    contestId,
    actorId: context.providerId,
    actorRole: 'PROVIDER',
    eventType: 'registration.approved',
    registrationId: demoRegId,
    afterJson: { status: 'CONFIRMED', paymentStatus: 'MARKED_PAID', vehicleSource: 'BYOC' },
  });

  // Summary verification
  const [regCount] = await AppDataSource.query<{ count: string }[]>(
    `SELECT COUNT(*)::text AS count FROM contest_registrations WHERE contest_id = $1`,
    [contestId],
  );
  const [activeCount] = await AppDataSource.query<{ count: string }[]>(
    `SELECT COUNT(*)::text AS count FROM contest_registrations WHERE contest_id = $1 AND status != 'CANCELLED'`,
    [contestId],
  );
  const [paidCount] = await AppDataSource.query<{ count: string }[]>(
    `SELECT COUNT(*)::text AS count FROM contest_registrations WHERE contest_id = $1 AND payment_status = 'MARKED_PAID'`,
    [contestId],
  );

  logger.info('SeedDemo', '─────────────────────────────────────────────');
  logger.info('SeedDemo', `Contest created: ${contestId}`);
  logger.info('SeedDemo', `Demo racer: ${DEMO_RACER.email} / 123456`);
  logger.info('SeedDemo', `Total registrations: ${regCount.count} (active: ${activeCount.count})`);
  logger.info('SeedDemo', `Paid registrations: ${paidCount.count}`);
  logger.info('SeedDemo', `Capacity: 17 — empty slots left: ${17 - Number(activeCount.count)}`);
  logger.info('SeedDemo', '─────────────────────────────────────────────');

  await AppDataSource.destroy();
}

main().catch((error) => {
  logger.error('SeedDemo', 'Failed', error);
  process.exit(1);
});
