import 'dotenv/config';
import 'reflect-metadata';
import { AppDataSource } from '../config/database';
import { logger } from '../config/logger';

// `cdn.rcfield.vn` was only a placeholder and does not serve the seeded files.
// Keep one reachable image source so staff/customer screens can exercise the
// real image rendering path with seed data.
const SEEDED_VEHICLE_IMAGE_URL =
  'https://images.unsplash.com/photo-1594787318286-3d835c1d207f?auto=format&fit=crop&q=80&w=800';

// ─────────────────────────────────────────────────────────────────────────────
// Seed data: 2 chi nhánh RC cafe thực tế tại Hà Nội và TP.HCM
// Chạy SAU seed-users.ts (cần provider@gmail.com đã tồn tại)
// ─────────────────────────────────────────────────────────────────────────────

async function seed() {
  await AppDataSource.initialize();
  logger.database('Connected');

  // Lấy provider và staff từ seed-users
  const [provider] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM users WHERE email = 'provider@gmail.com'`,
  );
  const [staff] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM users WHERE email = 'staff@gmail.com'`,
  );
  const [admin] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM users WHERE email = 'admin@gmail.com'`,
  );

  if (!provider) {
    logger.error('Seed', 'provider@gmail.com không tồn tại — chạy seed-users.ts trước', null);
    process.exit(1);
  }

  // Get track types from DB
  const trackTypes = await AppDataSource.query<{ id: string; code: string }[]>(
    `SELECT id, code FROM track_types`,
  );
  const driftTrack = trackTypes.find((t) => t.code === 'DRIFT');
  const obstacleTrack = trackTypes.find((t) => t.code === 'OBSTACLE');

  if (!driftTrack || !obstacleTrack) {
    logger.error('Seed', 'DRIFT or OBSTACLE track types not found in DB', null);
    process.exit(1);
  }

  // ─── Cafe 1: RC Arena Hà Nội ─────────────────────────────────────────────

  const [existingCafe1] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM cafes WHERE slug = 'rc-arena-ha-noi'`,
  );

  let cafe1Id: string;

  if (existingCafe1) {
    cafe1Id = existingCafe1.id;
    logger.warn('Seed', 'Skip cafe 1 — already exists: rc-arena-ha-noi');
    await AppDataSource.query(
      `UPDATE cafes
          SET operating_hours = $1,
              status = 'ACTIVE',
              deleted_at = NULL
        WHERE id = $2`,
      [
        JSON.stringify({
          mon: { open: '10:00', close: '24:00' },
          tue: { open: '10:00', close: '24:00' },
          wed: { open: '10:00', close: '24:00' },
          thu: { open: '10:00', close: '24:00' },
          fri: { open: '10:00', close: '24:00' },
          sat: { open: '09:00', close: '24:00' },
          sun: { open: '09:00', close: '24:00' },
        }),
        cafe1Id,
      ],
    );
  } else {
    const [c1] = await AppDataSource.query<{ id: string }[]>(
      `INSERT INTO cafes (
        provider_id, name, slug, description, phone, status,
        address, district, city, latitude, longitude,
        operating_hours, track_types,
        slot_duration_minutes, slot_fee_rate, max_concurrent_bookings,
        min_booking_notice_minutes, byoc_capacity
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
      RETURNING id`,
      [
        provider.id,
        'RC Arena Hà Nội',
        'rc-arena-ha-noi',
        'Sân chơi xe RC chuyên nghiệp đầu tiên tại Hà Nội. Trang bị 2 đường đua: drift track dài 80m và obstacle course với 12 chướng ngại vật. Không gian điều hoà, wifi miễn phí, đồ uống phong phú.',
        '024 3795 6688',
        'ACTIVE',
        '72 Duy Tân, Dịch Vọng Hậu, Cầu Giấy, Hà Nội',
        'Cầu Giấy',
        'Hà Nội',
        21.0285,
        105.7967,
        JSON.stringify({
          mon: { open: '10:00', close: '24:00' },
          tue: { open: '10:00', close: '24:00' },
          wed: { open: '10:00', close: '24:00' },
          thu: { open: '10:00', close: '24:00' },
          fri: { open: '10:00', close: '24:00' },
          sat: { open: '09:00', close: '24:00' },
          sun: { open: '09:00', close: '24:00' },
        }),
        [driftTrack.id, obstacleTrack.id],
        60,
        50000, // slot_fee_rate (phí đặt chỗ 50k/slot)
        6, // max_concurrent_bookings
        30, // min_booking_notice_minutes
        3, // byoc_capacity
      ],
    );
    cafe1Id = c1.id;
    logger.info('Seed', `Created cafe 1 — RC Arena Hà Nội (${cafe1Id})`);
  }

  // Seed track configs for cafe 1
  await seedTrackConfigs(cafe1Id, [driftTrack.id, obstacleTrack.id], 6, 3);

  // ─── Cafe 2: RC Drift Club Sài Gòn ────────────────────────────────────────

  const [existingCafe2] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM cafes WHERE slug = 'rc-drift-club-sai-gon'`,
  );

  let cafe2Id: string;

  if (existingCafe2) {
    cafe2Id = existingCafe2.id;
    logger.warn('Seed', 'Skip cafe 2 — already exists: rc-drift-club-sai-gon');
    await AppDataSource.query(
      `UPDATE cafes
          SET operating_hours = $1,
              status = 'ACTIVE',
              deleted_at = NULL
        WHERE id = $2`,
      [
        JSON.stringify({
          mon: { open: '14:00', close: '24:00' },
          tue: { open: '14:00', close: '24:00' },
          wed: { open: '14:00', close: '24:00' },
          thu: { open: '14:00', close: '24:00' },
          fri: { open: '13:00', close: '24:00' },
          sat: { open: '09:00', close: '24:00' },
          sun: { open: '09:00', close: '24:00' },
        }),
        cafe2Id,
      ],
    );
  } else {
    const [c2] = await AppDataSource.query<{ id: string }[]>(
      `INSERT INTO cafes (
        provider_id, name, slug, description, phone, status,
        address, district, city, latitude, longitude,
        operating_hours, track_types,
        slot_duration_minutes, slot_fee_rate, max_concurrent_bookings,
        min_booking_notice_minutes, byoc_capacity
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
      RETURNING id`,
      [
        provider.id,
        'RC Drift Club Sài Gòn',
        'rc-drift-club-sai-gon',
        'Câu lạc bộ xe RC chuyên drift tại quận 7. Đường đua drift 120m dạng figure-8, sàn epoxy nhẵn bóng đạt chuẩn thi đấu. Tổ chức giải hàng tháng, có lớp học drift cơ bản và nâng cao.',
        '028 6262 7788',
        'ACTIVE',
        '15 Hoàng Văn Thái, Tân Phú, Quận 7, TP. Hồ Chí Minh',
        'Quận 7',
        'TP. Hồ Chí Minh',
        10.7403,
        106.712,
        JSON.stringify({
          mon: { open: '14:00', close: '24:00' },
          tue: { open: '14:00', close: '24:00' },
          wed: { open: '14:00', close: '24:00' },
          thu: { open: '14:00', close: '24:00' },
          fri: { open: '13:00', close: '24:00' },
          sat: { open: '09:00', close: '24:00' },
          sun: { open: '09:00', close: '24:00' },
        }),
        [driftTrack.id],
        60,
        60000, // slot_fee_rate
        8, // max_concurrent_bookings
        60,
        4,
      ],
    );
    cafe2Id = c2.id;
    logger.info('Seed', `Created cafe 2 — RC Drift Club Sài Gòn (${cafe2Id})`);
  }

  // Seed track configs for cafe 2
  await seedTrackConfigs(cafe2Id, [driftTrack.id], 8, 4);

  // ─── Vehicles — Cafe 1 (Hà Nội) ──────────────────────────────────────────

  await seedVehicles(
    cafe1Id,
    [
      {
        name: 'Tamiya TT-02 Drift Spec',
        description:
          'Xe drift nhập khẩu từ Nhật, thân nhựa ABS, khung TT-02 độ lốp drift. Phù hợp người mới học kỹ thuật trượt bánh.',
        tier: 'STANDARD',
        hourly_rate: 80000,
        security_deposit: 0,
        compatible_track_types: ['DRIFT', 'OBSTACLE'],
      },
      {
        name: 'Yokomo YD-2S Plus',
        description:
          'Xe drift mid-motor layout, khung carbon fiber, hệ thống lái servo metal gear. Phản hồi tay lái nhạy, ổn định tốc độ cao. Dành cho người chơi trung cấp trở lên.',
        tier: 'STANDARD',
        hourly_rate: 90000,
        security_deposit: 0,
        compatible_track_types: ['DRIFT'],
      },
      {
        name: 'MST RMX 2.0 S RTR',
        description:
          'Xe drift rear-motor cao cấp, độ nhạy lái chính xác. Thân xe Lexus RC F body kit carbon-look. Lý tưởng cho kỹ thuật drift tandem.',
        tier: 'PREMIUM',
        hourly_rate: 130000,
        security_deposit: 0,
        compatible_track_types: ['DRIFT'],
      },
      {
        name: 'Traxxas Rustler 4×4 VXL',
        description:
          'Buggy 4WD brushless motor, tốc độ tối đa 80km/h. Chuyên obstacle course và địa hình. Cần kinh nghiệm điều khiển — chỉ dành cho người chơi thành thạo.',
        tier: 'PREMIUM',
        hourly_rate: 150000,
        security_deposit: 0,
        compatible_track_types: ['OBSTACLE'],
      },
      {
        name: 'Yokomo YD-2RX Carpet Edition',
        description:
          'Phiên bản giới hạn dành cho thi đấu chuyên nghiệp. Khung nhôm CNC, servo Savöx, ESC Hobbywing 10BL120. Chỉ cho thuê cho thành viên đăng ký trước.',
        tier: 'RESTRICTED',
        hourly_rate: 220000,
        security_deposit: 0,
        compatible_track_types: ['DRIFT'],
      },
      {
        name: 'Tamiya MB-01 Mazda MX-5',
        description:
          'Xe touring 2WD nhỏ gọn với thân Mazda MX-5, dễ điều khiển và phù hợp cho khách lần đầu làm quen với sân RC.',
        tier: 'STANDARD',
        hourly_rate: 75000,
        security_deposit: 0,
        compatible_track_types: ['DRIFT', 'OBSTACLE'],
      },
      {
        name: 'Kyosho Fazer Mk2 Dodge Charger',
        description:
          'Khung 4WD shaft-drive ổn định, thân Dodge Charger cổ điển. Lựa chọn cân bằng cho các buổi tập drift cơ bản.',
        tier: 'STANDARD',
        hourly_rate: 85000,
        security_deposit: 0,
        compatible_track_types: ['DRIFT'],
      },
      {
        name: 'Arrma Senton 4x4 MEGA',
        description:
          'Short-course truck 4WD bền bỉ, gầm cao và lốp địa hình. Phù hợp chạy obstacle với các cú nhảy vừa phải.',
        tier: 'PREMIUM',
        hourly_rate: 145000,
        security_deposit: 0,
        compatible_track_types: ['OBSTACLE'],
      },
      {
        name: 'Axial SCX10 III Jeep Gladiator',
        description:
          'Crawler 4WD mô phỏng Jeep Gladiator, mô-men xoắn lớn và leo chướng ngại vật chậm, chính xác.',
        tier: 'PREMIUM',
        hourly_rate: 155000,
        security_deposit: 0,
        compatible_track_types: ['OBSTACLE'],
      },
      {
        name: 'Team Associated B74.2D',
        description:
          'Buggy 4WD đua địa hình với khung nhẹ và bộ giảm xóc dầu hiệu năng cao, dành cho người chơi đã có kinh nghiệm.',
        tier: 'RESTRICTED',
        hourly_rate: 210000,
        security_deposit: 0,
        compatible_track_types: ['OBSTACLE'],
      },
    ],
    trackTypes,
  );

  // ─── Vehicles — Cafe 2 (Sài Gòn) ─────────────────────────────────────────

  await seedVehicles(
    cafe2Id,
    [
      {
        name: 'HPI RS4 Sport 3 Drift',
        description:
          'Xe drift 4WD shaft-driven kinh điển của HPI. Ổn định, dễ kiểm soát, thích hợp cho người mới học drift. Thân xe Subaru BRZ matte black.',
        tier: 'STANDARD',
        hourly_rate: 90000,
        security_deposit: 0,
        compatible_track_types: ['DRIFT'],
      },
      {
        name: 'Tamiya TA08 Pro Drift',
        description:
          'Phiên bản Pro của dòng TA08 nổi tiếng. Khung aluminum lightweight, hệ thống belt drive mượt mà. Thân xe Toyota GR86 official licensed.',
        tier: 'STANDARD',
        hourly_rate: 95000,
        security_deposit: 0,
        compatible_track_types: ['DRIFT'],
      },
      {
        name: 'Overdose GALM Ver.2',
        description:
          'Xe drift Japan-spec từ hãng Overdose, thiết kế thi đấu chuyên nghiệp. Hệ thống treo độc lập, servo metal full, body kit Silvia S15 chính hãng.',
        tier: 'PREMIUM',
        hourly_rate: 140000,
        security_deposit: 0,
        compatible_track_types: ['DRIFT'],
      },
      {
        name: 'Schumacher Cat K1 Aero',
        description:
          'Touring car chuẩn thi đấu, khung carbon tổng hợp, lốp slick chuyên sàn epoxy. Dành riêng cho vòng thi đấu giải hàng tháng của club.',
        tier: 'RESTRICTED',
        hourly_rate: 200000,
        security_deposit: 0,
        compatible_track_types: ['DRIFT'],
      },
      {
        name: 'MST FXX 2.0 S',
        description:
          'Xe drift front-motor RWD với bộ lái góc rộng, giúp người mới dễ cảm nhận chuyển động văng đuôi trên sân epoxy.',
        tier: 'STANDARD',
        hourly_rate: 85000,
        security_deposit: 0,
        compatible_track_types: ['DRIFT'],
      },
      {
        name: 'Reve D RDX',
        description:
          'Khung RWD hiện đại, trọng tâm thấp và khả năng giữ góc drift ổn định. Phù hợp luyện line và chuyển hướng.',
        tier: 'STANDARD',
        hourly_rate: 95000,
        security_deposit: 0,
        compatible_track_types: ['DRIFT'],
      },
      {
        name: 'Yokomo RD2.0',
        description:
          'Dòng RWD hiệu năng cao với servo phản hồi nhanh và thiết lập treo tinh chỉnh cho các đoạn cua tốc độ cao.',
        tier: 'PREMIUM',
        hourly_rate: 135000,
        security_deposit: 0,
        compatible_track_types: ['DRIFT'],
      },
      {
        name: '3Racing Sakura D5 MR',
        description:
          'Xe drift mid-rear motor linh hoạt, thân xe Nissan Silvia. Lựa chọn thực hành tandem và kiểm soát throttle.',
        tier: 'STANDARD',
        hourly_rate: 90000,
        security_deposit: 0,
        compatible_track_types: ['DRIFT'],
      },
      {
        name: 'Overdose Vacula II',
        description:
          'Khung thi đấu cao cấp bằng carbon, được tinh chỉnh cho người chơi chuyên sâu và các buổi drift nâng cao.',
        tier: 'RESTRICTED',
        hourly_rate: 220000,
        security_deposit: 0,
        compatible_track_types: ['DRIFT'],
      },
    ],
    trackTypes,
  );

  // ─── Menu — Cafe 1 (Hà Nội) ───────────────────────────────────────────────

  await seedMenuItems(cafe1Id, [
    {
      name: 'Trà sữa trân châu đen',
      description: 'Trà oolong pha sữa tươi, trân châu nấu mềm, đường tùy chỉnh',
      price: 35000,
      category: 'DRINK',
    },
    {
      name: 'Cà phê sữa đá',
      description: 'Cà phê phin Đà Lạt pha với sữa đặc Ông Thọ, đá viên',
      price: 25000,
      category: 'DRINK',
    },
    {
      name: 'Matcha latte đá',
      description: 'Matcha Uji Nhật xay mịn, sữa tươi đậm đà, đá viên lớn',
      price: 40000,
      category: 'DRINK',
    },
    {
      name: 'Nước cam ép',
      description: 'Cam tươi ép nguyên chất, không đường, không pha loãng',
      price: 30000,
      category: 'DRINK',
    },
    { name: 'Pepsi / 7UP lon', description: null, price: 15000, category: 'DRINK' },
    { name: 'Nước suối', description: null, price: 10000, category: 'DRINK' },
    {
      name: 'Bánh mì que phô mai',
      description: 'Bánh mì nướng giòn nhân phô mai mozzarella chảy',
      price: 25000,
      category: 'SNACK',
    },
    {
      name: 'Snack vị bò cay',
      description: 'Snack khoai tây lát mỏng vị bò nướng cay Hàn Quốc 60g',
      price: 20000,
      category: 'SNACK',
    },
    {
      name: 'Khoai tây chiên bơ tỏi',
      description: 'Khoai tây wedges chiên vàng, sốt bơ tỏi thơm, phục vụ nóng',
      price: 35000,
      category: 'SNACK',
    },
    {
      name: 'Xúc xích nướng (2 chiếc)',
      description: 'Xúc xích Đức nướng than, kèm mù tạt và tương cà',
      price: 30000,
      category: 'SNACK',
    },
  ]);

  // ─── Menu — Cafe 2 (Sài Gòn) ─────────────────────────────────────────────

  await seedMenuItems(cafe2Id, [
    {
      name: 'Bạc xỉu đá',
      description: 'Cà phê Sài Gòn nhiều sữa ít cà phê — đặc trưng phong cách miền Nam',
      price: 22000,
      category: 'DRINK',
    },
    {
      name: 'Cà phê đen đá',
      description: 'Cà phê hạt Robusta Tây Nguyên pha phin, đậm vị',
      price: 18000,
      category: 'DRINK',
    },
    {
      name: 'Sinh tố xoài',
      description: 'Xoài cát Hoà Lộc xay nhuyễn với sữa chua, không đá',
      price: 35000,
      category: 'DRINK',
    },
    {
      name: 'Trà đào cam sả',
      description: 'Trà đen ngâm đào, thêm cam tươi và sả thơm, đá lạnh',
      price: 30000,
      category: 'DRINK',
    },
    {
      name: 'Lon nước ngọt',
      description: 'Coca-Cola / Pepsi / 7UP / Mirinda',
      price: 15000,
      category: 'DRINK',
    },
    {
      name: 'Bánh tráng trộn',
      description: 'Bánh tráng Tây Ninh trộn xoài, tôm khô, sa tế — đặc sản Sài Gòn',
      price: 25000,
      category: 'SNACK',
    },
    {
      name: 'Hột vịt lộn (2 trứng)',
      description: 'Hột vịt lộn 14 ngày, ăn kèm rau răm và gừng muối',
      price: 20000,
      category: 'SNACK',
    },
    {
      name: 'Bắp rang bơ (ly lớn)',
      description: 'Bắp rang bơ muối kiểu rạp phim, phục vụ trong ly giấy 500ml',
      price: 25000,
      category: 'SNACK',
    },
    {
      name: 'Khô mực nướng',
      description: 'Mực một nắng nướng than, chấm tương me cay, 100g',
      price: 45000,
      category: 'SNACK',
    },
  ]);

  // ─── Staff assignment ──────────────────────────────────────────────────────

  if (staff) {
    const [existingAssign] = await AppDataSource.query<{ id: string; cafe_id: string }[]>(
      `SELECT id, cafe_id FROM staff_cafe_assignments WHERE staff_id = $1`,
      [staff.id],
    );
    if (!existingAssign) {
      await AppDataSource.query(
        `INSERT INTO staff_cafe_assignments (staff_id, cafe_id, assigned_by)
         VALUES ($1, $2, $3)`,
        [staff.id, cafe1Id, provider.id],
      );
      logger.info('Seed', `Staff assigned to RC Arena Hà Nội`);
    } else if (existingAssign.cafe_id !== cafe1Id) {
      await AppDataSource.query(
        `UPDATE staff_cafe_assignments
            SET cafe_id = $1,
                assigned_by = $2
          WHERE id = $3`,
        [cafe1Id, provider.id, existingAssign.id],
      );
      logger.info('Seed', `Staff assignment refreshed to RC Arena Hà Nội`);
    } else {
      logger.warn('Seed', 'Skip staff assignment — already points to RC Arena Hà Nội');
    }
  }

  // ─── Trial subscription for provider ─────────────────────────────────────

  const [existingSub] = await AppDataSource.query<{ id: string; status: string }[]>(
    `SELECT id, status FROM provider_subscriptions WHERE provider_id = $1 AND deleted_at IS NULL`,
    [provider.id],
  );
  if (existingSub) {
    await AppDataSource.query(
      `UPDATE provider_subscriptions
          SET status = 'ACTIVE',
              expires_at = NOW() + INTERVAL '1 year',
              grace_ends_at = NULL,
              updated_at = NOW()
        WHERE id = $1`,
      [existingSub.id],
    );
    logger.info('Seed', 'Subscription refreshed to ACTIVE for provider@gmail.com');
  } else {
    const [trialPlan] = await AppDataSource.query<{ id: string }[]>(
      `SELECT id FROM subscription_plans WHERE name = 'TRIAL'`,
    );
    if (trialPlan) {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      await AppDataSource.query(
        `INSERT INTO provider_subscriptions
          (provider_id, plan_id, status, started_at, expires_at, ai_quota_reset_at)
         VALUES ($1,$2,'ACTIVE',$3,$4,$5)`,
        [provider.id, trialPlan.id, now, expiresAt, nextMonth],
      );
      logger.info('Seed', 'Active subscription created for provider@gmail.com');
    } else {
      logger.warn('Seed', 'Skip subscription — TRIAL plan not found in DB');
    }
  }

  // ─── Feature flags AI_CHATBOT ─────────────────────────────────────────────

  const enabledBy = admin?.id ?? provider.id;

  for (const [cafeId, cafeName] of [
    [cafe1Id, 'RC Arena HN'],
    [cafe2Id, 'RC Drift SGN'],
  ]) {
    const [existingFlag] = await AppDataSource.query<{ id: string }[]>(
      `SELECT id FROM feature_flags WHERE feature_key = 'AI_CHATBOT' AND entity_id = $1`,
      [cafeId],
    );
    if (!existingFlag) {
      await AppDataSource.query(
        `INSERT INTO feature_flags (
          feature_key, display_name, description,
          is_enabled, entity_type, entity_id,
          config, enabled_by, enabled_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now())`,
        [
          'AI_CHATBOT',
          `AI Chat — ${cafeName}`,
          'Tính năng chat AI với RAG knowledge base per chi nhánh',
          true,
          'CAFE',
          cafeId,
          JSON.stringify({ monthly_quota: 1000, used_this_month: 0, quota_reset_day: 1 }),
          enabledBy,
        ],
      );
      logger.info('Seed', `Feature flag AI_CHATBOT created for ${cafeName}`);
    } else {
      logger.warn('Seed', `Skip feature flag — already exists for ${cafeName}`);
    }
  }

  // ─── Widget configs ────────────────────────────────────────────────────────

  await seedWidgetConfig(cafe1Id, {
    greeting_message: 'Xin chào! Tôi là trợ lý AI của RC Arena Hà Nội. Bạn cần hỗ trợ gì?',
    position: 'BOTTOM_RIGHT',
    primary_color: '#1E40AF',
    quick_replies: ['Xem giá thuê xe', 'Kiểm tra slot hôm nay', 'Nội quy sân', 'Menu đồ uống'],
  });

  await seedWidgetConfig(cafe2Id, {
    greeting_message: 'Chào mừng đến RC Drift Club Sài Gòn! Hỏi tôi về sân, xe hoặc lịch giải nhé.',
    position: 'BOTTOM_RIGHT',
    primary_color: '#DC2626',
    quick_replies: ['Giá thuê xe', 'Slot hôm nay', 'Lịch giải tháng này', 'Nội quy'],
  });

  await AppDataSource.query(
    `UPDATE cafes
        SET deleted_at = COALESCE(deleted_at, now()),
            status = 'SUSPENDED'
      WHERE slug = 'rcfield-system'
        AND deleted_at IS NULL`,
  );
  logger.warn('Seed', 'System demo cafe disabled if it existed: rcfield-system');

  await AppDataSource.destroy();
  logger.info('Seed', '─────────────────────────────────────────────');
  logger.info('Seed', 'Done! Cafe IDs for Postman:');
  logger.info('Seed', `  RC Arena Hà Nội:       ${cafe1Id}`);
  logger.info('Seed', `  RC Drift Club Sài Gòn: ${cafe2Id}`);
  logger.info('Seed', '─────────────────────────────────────────────');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function seedTrackConfigs(
  cafeId: string,
  trackTypeIds: string[],
  maxConcurrent: number,
  byocCapacity: number,
) {
  for (const trackTypeId of trackTypeIds) {
    const [existing] = await AppDataSource.query<{ id: string }[]>(
      `SELECT id FROM cafe_track_configs WHERE cafe_id = $1 AND track_type_id = $2 AND deleted_at IS NULL`,
      [cafeId, trackTypeId],
    );

    if (existing) {
      await AppDataSource.query(
        `UPDATE cafe_track_configs
         SET max_concurrent = $1, byoc_capacity = $2
         WHERE id = $3`,
        [maxConcurrent, byocCapacity, existing.id],
      );
    } else {
      await AppDataSource.query(
        `INSERT INTO cafe_track_configs (cafe_id, track_type_id, max_concurrent, byoc_capacity, is_active)
         VALUES ($1, $2, $3, $4, true)`,
        [cafeId, trackTypeId, maxConcurrent, byocCapacity],
      );
      logger.info('Seed', `  Created Track Config for cafe ${cafeId.slice(0, 8)}...`);
    }
  }
}

async function seedVehicles(
  cafeId: string,
  vehicles: {
    name: string;
    description: string;
    tier: string;
    hourly_rate: number;
    security_deposit: number;
    compatible_track_types: string[];
  }[],
  trackTypes: { id: string; code: string }[],
) {
  const targetAvailableUnits = 6;

  for (const v of vehicles) {
    const compatibleTrackTypeIds = v.compatible_track_types.map((code) => {
      const match = trackTypes.find((t) => t.code === code);
      if (!match) throw new Error(`Track type code ${code} not found`);
      return match.id;
    });

    // 1. Check if catalog exists
    const [catalog] = await AppDataSource.query<{ id: string }[]>(
      `SELECT id FROM vehicle_catalogs WHERE cafe_id = $1 AND name = $2 AND deleted_at IS NULL`,
      [cafeId, v.name],
    );

    let catalogId: string;
    if (catalog) {
      catalogId = catalog.id;
      logger.warn('Seed', `Skip vehicle catalog — already exists: ${v.name}`);
    } else {
      const [newCatalog] = await AppDataSource.query<{ id: string }[]>(
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
          v.security_deposit,
          compatibleTrackTypeIds,
          SEEDED_VEHICLE_IMAGE_URL,
        ],
      );
      catalogId = newCatalog.id;
      logger.info('Seed', `  Created Vehicle Catalog: ${v.tier.padEnd(10)} ${v.name}`);

      // Seed catalog images (sort_order 0, 1)
      await AppDataSource.query(
        `INSERT INTO vehicle_catalog_images (catalog_id, url, sort_order)
         VALUES ($1, $2, $3)`,
        [catalogId, SEEDED_VEHICLE_IMAGE_URL, 0],
      );
    }

    // Repair catalogs created by previous seeds that still point to the
    // non-existent placeholder CDN.
    await AppDataSource.query(
      `UPDATE vehicle_catalogs
       SET cover_image_url = $1
       WHERE id = $2
         AND (cover_image_url IS NULL OR cover_image_url LIKE 'https://cdn.rcfield.vn/%')`,
      [SEEDED_VEHICLE_IMAGE_URL, catalogId],
    );

    // 2. Ensure each catalog has enough available units for concurrent booking tests.
    const [availableCount] = await AppDataSource.query<{ count: string }[]>(
      `SELECT COUNT(*)::text AS count
       FROM vehicles
       WHERE catalog_id = $1 AND status = 'AVAILABLE' AND deleted_at IS NULL`,
      [catalogId],
    );
    const missingAvailableUnits = Math.max(targetAvailableUnits - Number(availableCount.count), 0);
    const vehicleCode = v.name
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    const availableColors = ['Blue', 'Silver', 'White', 'Orange', 'Green', 'Purple'];

    for (let i = 0; i < missingAvailableUnits; i += 1) {
      const sequence = Number(availableCount.count) + i + 1;
      const color = availableColors[(sequence - 1) % availableColors.length];
      await AppDataSource.query(
        `INSERT INTO vehicles (
          cafe_id, catalog_id, status, identifier, color,
          distinctive_image_url, notes, metadata
        ) VALUES ($1, $2, 'AVAILABLE', $3, $4, $5, $6, $7)`,
        [
          cafeId,
          catalogId,
          `${vehicleCode}-AVAIL-${String(sequence).padStart(2, '0')}`,
          color,
          SEEDED_VEHICLE_IMAGE_URL,
          'Sẵn sàng cho khách thuê và kiểm thử luồng đặt xe.',
          JSON.stringify({ seeded_for: 'availability_testing', unit_number: sequence }),
        ],
      );
    }

    if (missingAvailableUnits > 0) {
      logger.info(
        'Seed',
        `    Added ${missingAvailableUnits} AVAILABLE unit(s) under ${v.name} (${targetAvailableUnits} available total)`,
      );
    }

    await AppDataSource.query(
      `UPDATE vehicles
       SET distinctive_image_url = $1
       WHERE catalog_id = $2
         AND (distinctive_image_url IS NULL OR distinctive_image_url LIKE 'https://cdn.rcfield.vn/%')`,
      [SEEDED_VEHICLE_IMAGE_URL, catalogId],
    );

    // Keep one unit in each non-available state for operational test cases.
    const testStates = [
      {
        status: 'IN_USE',
        identifier: `${vehicleCode}-IN-USE`,
        color: 'Red',
        notes: 'Đang chạy trong slot đặt trước.',
        metadata: { seeded_for: 'state_testing', body_shell: 'Toyota GR Supra' },
        lastMaintenanceAt: null,
      },
      {
        status: 'MAINTENANCE',
        identifier: `${vehicleCode}-MAINTENANCE`,
        color: 'Yellow',
        notes: 'Đang thay thế động cơ brushless và servo lái.',
        metadata: { seeded_for: 'state_testing', body_shell: 'Nissan GT-R R35' },
        lastMaintenanceAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      },
      {
        status: 'RETIRED',
        identifier: `${vehicleCode}-RETIRED`,
        color: 'Black',
        notes: 'Hỏng hóc nặng khung gầm, ngưng hoạt động chờ thanh lý.',
        metadata: { seeded_for: 'state_testing', body_shell: 'Mazda RX-7' },
        lastMaintenanceAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      },
    ];

    for (const state of testStates) {
      const [stateCount] = await AppDataSource.query<{ count: string }[]>(
        `SELECT COUNT(*)::text AS count
         FROM vehicles
         WHERE catalog_id = $1 AND status = $2 AND deleted_at IS NULL`,
        [catalogId, state.status],
      );
      if (Number(stateCount.count) > 0) continue;

      await AppDataSource.query(
        `INSERT INTO vehicles (
          cafe_id, catalog_id, status, last_maintenance_at, identifier, color,
          distinctive_image_url, notes, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          cafeId,
          catalogId,
          state.status,
          state.lastMaintenanceAt,
          state.identifier,
          state.color,
          SEEDED_VEHICLE_IMAGE_URL,
          state.notes,
          JSON.stringify(state.metadata),
        ],
      );
    }
  }
}

/**
 * Nhãn tiếng Việt cho các mã phân loại dùng trong dữ liệu seed.
 * Danh mục nay do Provider tự tạo — seed dựng sẵn vài danh mục demo cho mỗi cafe
 * rồi gán món vào, không còn enum cố định ở tầng DB.
 */
const SEED_CATEGORY_LABELS: Record<string, string> = {
  FOOD: 'Đồ ăn',
  DRINK: 'Đồ uống',
  SNACK: 'Ăn vặt',
  DESSERT: 'Tráng miệng',
  COMBO: 'Combo',
  OTHER: 'Khác',
};

/** Tạo (hoặc lấy lại) danh mục theo tên cho một chi nhánh. */
async function ensureMenuCategory(cafeId: string, name: string): Promise<string> {
  const [existing] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM menu_categories
      WHERE cafe_id = $1 AND lower(btrim(name)) = lower(btrim($2)) AND deleted_at IS NULL`,
    [cafeId, name],
  );
  if (existing) return existing.id;

  const [created] = await AppDataSource.query<{ id: string }[]>(
    `INSERT INTO menu_categories (cafe_id, name, display_order)
     VALUES ($1, $2, (SELECT COALESCE(MAX(display_order), -1) + 1
                        FROM menu_categories WHERE cafe_id = $1 AND deleted_at IS NULL))
     RETURNING id`,
    [cafeId, name],
  );
  return created.id;
}

async function seedMenuItems(
  cafeId: string,
  items: { name: string; description: string | null; price: number; category: string }[],
) {
  const categoryIdByCode = new Map<string, string>();

  for (const item of items) {
    const [existing] = await AppDataSource.query<{ id: string }[]>(
      `SELECT id FROM menu_items WHERE cafe_id = $1 AND name = $2 AND deleted_at IS NULL`,
      [cafeId, item.name],
    );
    if (existing) continue;

    let categoryId = categoryIdByCode.get(item.category);
    if (!categoryId) {
      const label = SEED_CATEGORY_LABELS[item.category] ?? item.category;
      categoryId = await ensureMenuCategory(cafeId, label);
      categoryIdByCode.set(item.category, categoryId);
    }

    await AppDataSource.query(
      `INSERT INTO menu_items (cafe_id, name, description, price, category_id, is_available)
       VALUES ($1,$2,$3,$4,$5,true)`,
      [cafeId, item.name, item.description, item.price, categoryId],
    );
  }
  logger.info(
    'Seed',
    `  Menu: ${items.length} items, ${categoryIdByCode.size} categories for cafe ${cafeId.slice(0, 8)}...`,
  );
}

async function seedWidgetConfig(
  cafeId: string,
  cfg: {
    greeting_message: string;
    position: string;
    primary_color: string;
    quick_replies: string[];
  },
) {
  await AppDataSource.query(
    `UPDATE cafes
     SET widget_config = widget_config || $1::jsonb
     WHERE id = $2`,
    [
      JSON.stringify({
        greetingMessage: cfg.greeting_message,
        welcomeMessage: cfg.greeting_message,
        position: cfg.position,
        primaryColor: cfg.primary_color,
        quickReplies: cfg.quick_replies,
        isEnabled: true,
      }),
      cafeId,
    ],
  );
  logger.info('Seed', `  Widget config updated for ${cafeId.slice(0, 8)}...`);
}

seed().catch((err) => {
  logger.error('Seed', 'Failed', err);
  process.exit(1);
});
