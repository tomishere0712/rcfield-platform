import 'dotenv/config';
import 'reflect-metadata';
import { AppDataSource } from '../config/database';
import { logger } from '../config/logger';

const SEED_TAG = '[SEED-COMMERCIAL]';
const FEATURED_IMAGE_URL =
  'https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=1600&q=85';

type SeedCafe = {
  id: string;
  slug: string;
  name: string;
};

type PackageSeed = {
  code: string;
  name: string;
  description: string;
  slotCount: number;
  price: number;
  validDays: number;
  billingPeriod: 'WEEK' | 'MONTH';
  benefits: string[];
  applicablePlayModes: Array<'RENTAL' | 'BYOC'>;
  isPopular: boolean;
};

type PromotionSeed = {
  code: string;
  description: string;
  discountType: 'PERCENT' | 'FIXED';
  discountValue: number;
  maxDiscountAmount: number | null;
  minOrderAmount: number | null;
  applicableTo: 'ALL' | 'RENTAL' | 'BYOC';
  scheduleMode: 'ONCE' | 'DAILY' | 'WEEKLY';
  scheduleStartTime: string | null;
  scheduleEndTime: string | null;
  scheduleWeekdays: string[];
};

const packageSeeds: Record<string, PackageSeed[]> = {
  'rc-arena-ha-noi': [
    {
      code: 'ARENA-WEEK-3',
      name: 'Gói Khởi động 3 lượt',
      description: `${SEED_TAG} Gói tuần cho người mới làm quen với sân RC Arena Hà Nội.`,
      slotCount: 3,
      price: 135000,
      validDays: 7,
      billingPeriod: 'WEEK',
      benefits: [
        '3 lượt chơi trong 7 ngày',
        'Đặt lịch trước',
        'Áp dụng thuê xe hoặc mang xe riêng',
      ],
      applicablePlayModes: ['RENTAL', 'BYOC'],
      isPopular: false,
    },
    {
      code: 'ARENA-MONTH-8',
      name: 'Gói Luyện tay lái 8 lượt',
      description: `${SEED_TAG} Gói tháng tiết kiệm cho khách chơi đều tại RC Arena Hà Nội.`,
      slotCount: 8,
      price: 340000,
      validDays: 30,
      billingPeriod: 'MONTH',
      benefits: [
        '8 lượt chơi trong 30 ngày',
        'Ưu tiên giữ chỗ giờ thấp điểm',
        'Dùng được cho cả hai hình thức chơi',
      ],
      applicablePlayModes: ['RENTAL', 'BYOC'],
      isPopular: true,
    },
    {
      code: 'ARENA-MONTH-12',
      name: 'Gói Thành viên 12 lượt',
      description: `${SEED_TAG} Gói dành cho khách thường xuyên tại RC Arena Hà Nội.`,
      slotCount: 12,
      price: 480000,
      validDays: 30,
      billingPeriod: 'MONTH',
      benefits: [
        '12 lượt chơi trong 30 ngày',
        'Hỗ trợ đổi lịch theo chính sách',
        'Ưu đãi 10% đồ uống tại quầy',
      ],
      applicablePlayModes: ['RENTAL', 'BYOC'],
      isPopular: false,
    },
  ],
  'rc-drift-club-sai-gon': [
    {
      code: 'DRIFT-WEEK-3',
      name: 'Gói Vào sân 3 lượt',
      description: `${SEED_TAG} Gói tuần linh hoạt tại RC Drift Club Sài Gòn.`,
      slotCount: 3,
      price: 165000,
      validDays: 7,
      billingPeriod: 'WEEK',
      benefits: [
        '3 lượt chơi trong 7 ngày',
        'Ưu tiên đặt lịch online',
        'Dùng cho thuê xe hoặc mang xe riêng',
      ],
      applicablePlayModes: ['RENTAL', 'BYOC'],
      isPopular: false,
    },
    {
      code: 'DRIFT-MONTH-8',
      name: 'Gói Drift đều 8 lượt',
      description: `${SEED_TAG} Gói tháng cho khách luyện line drift thường xuyên.`,
      slotCount: 8,
      price: 420000,
      validDays: 30,
      billingPeriod: 'MONTH',
      benefits: [
        '8 lượt chơi trong 30 ngày',
        'Giữ ưu đãi khi đặt lịch trước',
        'Phù hợp xe thuê và xe cá nhân',
      ],
      applicablePlayModes: ['RENTAL', 'BYOC'],
      isPopular: true,
    },
    {
      code: 'DRIFT-MONTH-12',
      name: 'Gói Thành viên Drift 12 lượt',
      description: `${SEED_TAG} Gói tháng tối ưu cho người chơi quen sân.`,
      slotCount: 12,
      price: 600000,
      validDays: 30,
      billingPeriod: 'MONTH',
      benefits: [
        '12 lượt chơi trong 30 ngày',
        'Ưu đãi 10% menu tại quầy',
        'Nhắc hạn dùng gói trước 3 ngày',
      ],
      applicablePlayModes: ['RENTAL', 'BYOC'],
      isPopular: false,
    },
  ],
};

const promotionSeeds: Record<string, PromotionSeed[]> = {
  'rc-arena-ha-noi': [
    {
      code: 'ARENA10',
      description: `${SEED_TAG} Giảm 10% phí lượt chơi, tối đa 30.000đ cho đơn từ 100.000đ.`,
      discountType: 'PERCENT',
      discountValue: 10,
      maxDiscountAmount: 30000,
      minOrderAmount: 100000,
      applicableTo: 'ALL',
      scheduleMode: 'ONCE',
      scheduleStartTime: null,
      scheduleEndTime: null,
      scheduleWeekdays: [],
    },
    {
      code: 'ARENANIGHT',
      description: `${SEED_TAG} Giảm 25.000đ cho lượt thuê xe bắt đầu từ 20:00 đến 23:00.`,
      discountType: 'FIXED',
      discountValue: 25000,
      maxDiscountAmount: null,
      minOrderAmount: 150000,
      applicableTo: 'RENTAL',
      scheduleMode: 'DAILY',
      scheduleStartTime: '20:00',
      scheduleEndTime: '23:00',
      scheduleWeekdays: [],
    },
  ],
  'rc-drift-club-sai-gon': [
    {
      code: 'DRIFT15',
      description: `${SEED_TAG} Giảm 15% phí lượt chơi, tối đa 40.000đ cho đơn từ 120.000đ.`,
      discountType: 'PERCENT',
      discountValue: 15,
      maxDiscountAmount: 40000,
      minOrderAmount: 120000,
      applicableTo: 'ALL',
      scheduleMode: 'ONCE',
      scheduleStartTime: null,
      scheduleEndTime: null,
      scheduleWeekdays: [],
    },
    {
      code: 'BYOCWEEKEND',
      description: `${SEED_TAG} Giảm 20.000đ cho khách mang xe riêng vào cuối tuần.`,
      discountType: 'FIXED',
      discountValue: 20000,
      maxDiscountAmount: null,
      minOrderAmount: 60000,
      applicableTo: 'BYOC',
      scheduleMode: 'WEEKLY',
      scheduleStartTime: null,
      scheduleEndTime: null,
      scheduleWeekdays: ['SAT', 'SUN'],
    },
  ],
};

function plusDays(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

async function loadContext() {
  const [provider] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM users WHERE email = 'provider@gmail.com' AND deleted_at IS NULL LIMIT 1`,
  );
  const [admin] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM users WHERE email = 'admin@gmail.com' AND deleted_at IS NULL LIMIT 1`,
  );
  const customers = await AppDataSource.query<{ id: string; email: string; full_name: string }[]>(
    `SELECT id, email, full_name
       FROM users
      WHERE email = ANY($1::varchar[]) AND deleted_at IS NULL`,
    [['customer@gmail.com', 'customer_other@gmail.com']],
  );
  const cafes = await AppDataSource.query<SeedCafe[]>(
    `SELECT id, slug, name
       FROM cafes
      WHERE slug = ANY($1::varchar[]) AND deleted_at IS NULL`,
    [Object.keys(packageSeeds)],
  );

  if (!provider || !admin || customers.length !== 2 || cafes.length !== 2) {
    throw new Error(
      'Thiếu provider/admin/customer hoặc 2 chi nhánh demo. Hãy chạy seed-users.ts và seed-cafes.ts trước.',
    );
  }

  return { provider, admin, customers, cafes };
}

async function upsertPackages(
  cafe: SeedCafe,
): Promise<Map<string, { id: string; price: number; name: string }>> {
  const result = new Map<string, { id: string; price: number; name: string }>();
  for (const item of packageSeeds[cafe.slug] ?? []) {
    const [existing] = await AppDataSource.query<{ id: string }[]>(
      `SELECT id FROM packages WHERE cafe_id = $1 AND code = $2 AND deleted_at IS NULL LIMIT 1`,
      [cafe.id, item.code],
    );
    const values = [
      item.name,
      item.description,
      item.slotCount,
      item.price,
      item.validDays,
      item.billingPeriod,
      item.benefits,
      item.applicablePlayModes,
      item.isPopular,
    ];
    let id = existing?.id;
    if (id) {
      await AppDataSource.query(
        `UPDATE packages
            SET name = $1, description = $2, slot_count = $3, price = $4, valid_days = $5,
                billing_period = $6, benefits = $7, applicable_play_modes = $8,
                is_popular = $9, status = 'ACTIVE', updated_at = NOW()
          WHERE id = $10`,
        [...values, id],
      );
    } else {
      const [created] = await AppDataSource.query<{ id: string }[]>(
        `INSERT INTO packages
           (cafe_id, code, name, description, slot_count, price, valid_days, billing_period,
            benefits, applicable_play_modes, is_popular, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'ACTIVE')
         RETURNING id`,
        [cafe.id, item.code, ...values],
      );
      id = created.id;
    }
    result.set(item.code, { id, price: item.price, name: item.name });
  }
  return result;
}

async function upsertPromotions(cafe: SeedCafe, providerId: string): Promise<void> {
  const startsAt = plusDays(-1);
  const expiresAt = plusDays(90);
  for (const item of promotionSeeds[cafe.slug] ?? []) {
    const [existing] = await AppDataSource.query<{ id: string }[]>(
      `SELECT id FROM promotions WHERE cafe_id = $1 AND code = $2 LIMIT 1`,
      [cafe.id, item.code],
    );
    const values = [
      item.description,
      item.discountType,
      item.discountValue,
      item.maxDiscountAmount,
      item.minOrderAmount,
      item.applicableTo,
      startsAt,
      expiresAt,
      item.scheduleMode,
      item.scheduleStartTime,
      item.scheduleEndTime,
      item.scheduleWeekdays,
    ];
    if (existing) {
      await AppDataSource.query(
        `UPDATE promotions
            SET description = $1, discount_type = $2, discount_value = $3,
                max_discount_amount = $4, min_order_amount = $5, applicable_to = $6,
                starts_at = $7, expires_at = $8, schedule_mode = $9,
                schedule_start_time = $10, schedule_end_time = $11, schedule_weekdays = $12,
                is_active = TRUE, show_on_cafe_page = TRUE, updated_at = NOW()
          WHERE id = $13`,
        [...values, existing.id],
      );
    } else {
      await AppDataSource.query(
        `INSERT INTO promotions
           (code, description, discount_type, discount_value, max_discount_amount,
            min_order_amount, applicable_to, cafe_id, starts_at, expires_at, schedule_mode,
            schedule_start_time, schedule_end_time, schedule_weekdays, is_active,
            show_on_cafe_page, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, TRUE, TRUE, $15)`,
        [item.code, ...values.slice(0, 6), cafe.id, ...values.slice(6), providerId],
      );
    }
  }
}

async function ensureCustomerPackage(params: {
  customerId: string;
  cafeId: string;
  packageId: string;
  packageName: string;
  packagePrice: number;
  slotsTotal: number;
  slotsRemaining: number;
  txnRef: string;
}): Promise<void> {
  const [existing] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id
       FROM customer_packages
      WHERE customer_id = $1 AND package_id = $2
      ORDER BY created_at ASC
      LIMIT 1`,
    [params.customerId, params.packageId],
  );
  let customerPackageId = existing?.id;
  if (customerPackageId) {
    await AppDataSource.query(
      `UPDATE customer_packages
          SET slots_total = $1, slots_remaining = $2, expires_at = $3, status = 'ACTIVE',
              purchased_price = $4, package_name_snapshot = $5, updated_at = NOW()
        WHERE id = $6`,
      [
        params.slotsTotal,
        params.slotsRemaining,
        plusDays(25),
        params.packagePrice,
        params.packageName,
        customerPackageId,
      ],
    );
  } else {
    const [created] = await AppDataSource.query<{ id: string }[]>(
      `INSERT INTO customer_packages
         (customer_id, package_id, cafe_id, slots_total, slots_remaining, expires_at,
          status, purchased_price, package_name_snapshot)
       VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE', $7, $8)
       RETURNING id`,
      [
        params.customerId,
        params.packageId,
        params.cafeId,
        params.slotsTotal,
        params.slotsRemaining,
        plusDays(25),
        params.packagePrice,
        params.packageName,
      ],
    );
    customerPackageId = created.id;
  }

  const [transaction] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM payment_transactions WHERE txn_ref = $1 LIMIT 1`,
    [params.txnRef],
  );
  if (transaction) {
    await AppDataSource.query(
      `UPDATE payment_transactions
          SET customer_package_id = $1, subject_type = 'CUSTOMER_PACKAGE', amount = $2,
              status = 'SUCCESS', raw_response = $3, updated_at = NOW()
        WHERE id = $4`,
      [
        customerPackageId,
        params.packagePrice,
        JSON.stringify({ seeded: true, payment_method: 'VNPAY_MOCK' }),
        transaction.id,
      ],
    );
  } else {
    await AppDataSource.query(
      `INSERT INTO payment_transactions
         (booking_id, customer_package_id, subject_type, type, gateway, txn_ref, amount,
          status, raw_request, raw_response)
       VALUES (NULL, $1, 'CUSTOMER_PACKAGE', 'PAYMENT', 'VNPAY', $2, $3,
               'SUCCESS', $4, $5)`,
      [
        customerPackageId,
        params.txnRef,
        params.packagePrice,
        JSON.stringify({ seeded: true, cafeId: params.cafeId }),
        JSON.stringify({ seeded: true, payment_method: 'VNPAY_MOCK' }),
      ],
    );
  }
}

async function ensureContestCommercialState(providerId: string, adminId: string): Promise<void> {
  const [featuredPlan] = await AppDataSource.query<
    { id: string; price: number; featured_days: number }[]
  >(`SELECT id, price, featured_days FROM contest_fee_plans WHERE code = 'FEATURED' LIMIT 1`);
  const [openContest] = await AppDataSource.query<
    {
      id: string;
      name: string;
      banner_image_url: string | null;
    }[]
  >(
    `SELECT id, name, banner_image_url
       FROM contests
      WHERE name LIKE '[SEED-CONTEST]%' AND status = 'OPEN'
      ORDER BY starts_at ASC
      LIMIT 1`,
  );
  if (!featuredPlan || !openContest) {
    logger.warn('SeedCommercial', 'Skip contest fee/popup - contest seed data is not available');
    return;
  }

  const [existingOrder] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM contest_fee_orders WHERE contest_id = $1 LIMIT 1`,
    [openContest.id],
  );
  let orderId = existingOrder?.id;
  if (orderId) {
    await AppDataSource.query(
      `UPDATE contest_fee_orders
          SET plan_id = $1, provider_id = $2, status = 'PAID', amount = $3,
              featured_days = $4, transfer_reference = 'SEED-FEATURED-PAID',
              transfer_date = CURRENT_DATE, transfer_amount = $3, admin_notes = $5,
              reviewed_by = $6, reviewed_at = NOW(), updated_at = NOW()
        WHERE id = $7`,
      [
        featuredPlan.id,
        providerId,
        featuredPlan.price,
        featuredPlan.featured_days,
        `${SEED_TAG} Đã đối soát để demo luồng phí tổ chức giải.`,
        adminId,
        orderId,
      ],
    );
  } else {
    const [created] = await AppDataSource.query<{ id: string }[]>(
      `INSERT INTO contest_fee_orders
         (contest_id, provider_id, plan_id, status, amount, featured_days, transfer_reference,
          transfer_date, transfer_amount, admin_notes, reviewed_by, reviewed_at)
       VALUES ($1, $2, $3, 'PAID', $4, $5, 'SEED-FEATURED-PAID', CURRENT_DATE, $4, $6, $7, NOW())
       RETURNING id`,
      [
        openContest.id,
        providerId,
        featuredPlan.id,
        featuredPlan.price,
        featuredPlan.featured_days,
        `${SEED_TAG} Đã đối soát để demo luồng phí tổ chức giải.`,
        adminId,
      ],
    );
    orderId = created.id;
  }

  const popupTitle = `${SEED_TAG} Giải đấu nổi bật`;
  const [existingPopup] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM featured_popups WHERE title = $1 LIMIT 1`,
    [popupTitle],
  );
  const popupValues = [
    `Đăng ký ${openContest.name.replace('[SEED-CONTEST] ', '')} ngay hôm nay.`,
    openContest.banner_image_url ?? FEATURED_IMAGE_URL,
    'Xem giải đấu',
    `/contests/${openContest.id}`,
    openContest.id,
    plusDays(-1),
    plusDays(7),
    orderId,
  ];
  if (existingPopup) {
    await AppDataSource.query(
      `UPDATE featured_popups
          SET subtitle = $1, image_url = $2, cta_label = $3, cta_url = $4, contest_id = $5,
              starts_at = $6, ends_at = $7, is_active = TRUE, review_status = 'APPROVED',
              contest_fee_order_id = $8, review_notes = $9, priority = 100, updated_by = $10,
              updated_at = NOW()
        WHERE id = $11`,
      [...popupValues, `${SEED_TAG} Nội dung demo đã duyệt.`, adminId, existingPopup.id],
    );
  } else {
    await AppDataSource.query(
      `INSERT INTO featured_popups
         (title, subtitle, image_url, cta_label, cta_url, contest_id, placement, audience_scope,
          starts_at, ends_at, is_active, review_status, contest_fee_order_id, review_notes,
          priority, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, 'EXPLORE', 'ALL', $7, $8, TRUE, 'APPROVED', $9, $10,
               100, $11, $11)`,
      [popupTitle, ...popupValues, `${SEED_TAG} Nội dung demo đã duyệt.`, adminId],
    );
  }
}

async function main(): Promise<void> {
  await AppDataSource.initialize();
  logger.database('Connected');
  const { provider, admin, customers, cafes } = await loadContext();
  const packagesByCafe = new Map<
    string,
    Map<string, { id: string; price: number; name: string }>
  >();

  for (const cafe of cafes) {
    packagesByCafe.set(cafe.slug, await upsertPackages(cafe));
    await upsertPromotions(cafe, provider.id);
  }

  const hanoi = cafes.find((item) => item.slug === 'rc-arena-ha-noi')!;
  const saigon = cafes.find((item) => item.slug === 'rc-drift-club-sai-gon')!;
  const hanoiPopular = packagesByCafe.get(hanoi.slug)!.get('ARENA-MONTH-8')!;
  const saigonPopular = packagesByCafe.get(saigon.slug)!.get('DRIFT-MONTH-8')!;
  const primaryCustomer = customers.find((item) => item.email === 'customer@gmail.com')!;
  const kelvin = customers.find((item) => item.email === 'customer_other@gmail.com')!;

  await ensureCustomerPackage({
    customerId: primaryCustomer.id,
    cafeId: hanoi.id,
    packageId: hanoiPopular.id,
    packageName: hanoiPopular.name,
    packagePrice: hanoiPopular.price,
    slotsTotal: 8,
    slotsRemaining: 5,
    txnRef: 'seed_pkg_customer_arena_month8',
  });
  await ensureCustomerPackage({
    customerId: kelvin.id,
    cafeId: saigon.id,
    packageId: saigonPopular.id,
    packageName: saigonPopular.name,
    packagePrice: saigonPopular.price,
    slotsTotal: 8,
    slotsRemaining: 6,
    txnRef: 'seed_pkg_kelvin_drift_month8',
  });
  await ensureContestCommercialState(provider.id, admin.id);

  await AppDataSource.destroy();
  logger.info('SeedCommercial', 'Commercial demo data is ready.');
}

main().catch(async (error) => {
  logger.error('SeedCommercial', 'Failed', error);
  if (AppDataSource.isInitialized) await AppDataSource.destroy();
  process.exit(1);
});
