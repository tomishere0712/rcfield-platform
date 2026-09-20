import request from 'supertest';
import { app } from '../../app';
import { AppDataSource } from '../../config/database';
import { CafeStatus, ProviderStatus, SubscriptionStatus, UserRole } from '../../types';
import {
  createTestAmenity,
  createTestCafe,
  createTestUser,
  createTestVehicle,
  generateToken,
} from '../helpers';

async function activateProvider(providerId: string): Promise<void> {
  await AppDataSource.query(
    `INSERT INTO provider_profiles
       (user_id, business_name, registration_status)
     VALUES ($1, $2, $3)`,
    [providerId, 'Test RC Business', ProviderStatus.ACTIVE],
  );

  const [plan] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM subscription_plans WHERE name = 'TRIAL' LIMIT 1`,
  );

  await AppDataSource.query(
    `INSERT INTO provider_subscriptions
       (provider_id, plan_id, status, started_at, expires_at, ai_quota_reset_at)
     VALUES ($1, $2, $3, NOW(), NOW() + INTERVAL '30 days', NOW() + INTERVAL '1 month')`,
    [providerId, plan.id, SubscriptionStatus.TRIAL],
  );
}

let driftId: string;
let obstacleId: string;

beforeAll(async () => {
  const trackTypes = await AppDataSource.query(`SELECT id, code FROM track_types`);
  const trackTypeMap = new Map<string, string>(
    trackTypes.map((t: { id: string; code: string }) => [t.code, t.id]),
  );
  driftId = trackTypeMap.get('DRIFT')!;
  obstacleId = trackTypeMap.get('OBSTACLE')!;
});

function cafeBody(overrides: Record<string, unknown> = {}) {
  return {
    name: 'RC Test Track',
    description: 'Indoor RC track',
    phone: '0931234567',
    address: '123 Nguyen Van Linh',
    district: 'Quan 7',
    city: 'Ho Chi Minh',
    latitude: 10.7403,
    longitude: 106.712,
    operating_hours: {
      mon: { open: '09:00', close: '22:00', is_closed: false },
    },
    track_types: [driftId, obstacleId],
    slot_duration_minutes: 60,
    slot_fee_rate: 150000,
    max_concurrent_bookings: 10,
    byoc_capacity: 5,
    ...overrides,
  };
}

function nextVietnamSundayAt(hour: number): Date {
  const vietnamOffsetMs = 7 * 60 * 60 * 1000;
  const vietnamNow = new Date(Date.now() + vietnamOffsetMs);
  const daysUntilSunday = (7 - vietnamNow.getUTCDay()) % 7;
  const sunday = new Date(
    Date.UTC(
      vietnamNow.getUTCFullYear(),
      vietnamNow.getUTCMonth(),
      vietnamNow.getUTCDate() + daysUntilSunday,
      hour - 7,
    ),
  );

  if (sunday.getTime() <= Date.now()) sunday.setUTCDate(sunday.getUTCDate() + 7);
  return sunday;
}

async function addReview(cafeId: string, rating: number) {
  const [customer] = await AppDataSource.query(
    `INSERT INTO users (email, full_name, password_hash, role, is_active, auth_provider)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      `reviewer_${Date.now()}_${Math.random().toString(36).slice(2)}@test.com`,
      'Reviewer',
      'hash',
      UserRole.CUSTOMER,
      true,
      'LOCAL',
    ],
  );

  const [trackType] = await AppDataSource.query(`SELECT id FROM track_types LIMIT 1`);

  const [booking] = await AppDataSource.query(
    `INSERT INTO bookings
       (customer_id, cafe_id, track_type_id, play_mode, source, status, slot_start, slot_end, payment_expires_at)
     VALUES ($1, $2, $3, 'BYOC', 'APP', 'COMPLETED', NOW() - INTERVAL '2 hours', NOW() - INTERVAL '1 hour', NOW() + INTERVAL '15 minutes')
     RETURNING *`,
    [customer.id, cafeId, trackType.id],
  );

  await AppDataSource.query(
    `INSERT INTO reviews (booking_id, cafe_id, customer_id, rating, status, created_at)
     VALUES ($1, $2, $3, $4, $5, NOW())`,
    [booking.id, cafeId, customer.id, rating, 'VISIBLE'],
  );
}

async function addPromotion(cafeId: string) {
  const admin = await createTestUser({ role: UserRole.ADMIN });
  const startsAt = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await AppDataSource.query(
    `INSERT INTO promotions
       (code, description, discount_type, discount_value, max_discount_amount,
        min_order_amount, max_uses, max_uses_per_user, uses_count, applicable_to,
        cafe_id, starts_at, expires_at, schedule_mode, schedule_start_time,
        schedule_end_time, schedule_weekdays, is_active, show_on_cafe_page, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
    [
      'EXPO25',
      'Explore promo',
      'PERCENT',
      25,
      50000,
      100000,
      null,
      1,
      0,
      'ALL',
      cafeId,
      startsAt,
      expiresAt,
      'ONCE',
      null,
      null,
      [],
      true,
      true,
      admin.id,
    ],
  );
}

describe('Cafe routes', () => {
  it('không trả chỗ trống cho ngày cơ sở nghỉ', async () => {
    const cafe = await createTestCafe({ status: CafeStatus.ACTIVE });
    const sundayStart = nextVietnamSundayAt(10);
    const sundayEnd = new Date(sundayStart.getTime() + 60 * 60 * 1000);

    await AppDataSource.query(`UPDATE cafes SET operating_hours = $1::jsonb WHERE id = $2`, [
      JSON.stringify({ sun: { is_closed: true } }),
      cafe.id,
    ]);

    const response = await request(app).get(`/api/v1/cafes/${cafe.id}/availability`).query({
      slot_start: sundayStart.toISOString(),
      slot_end: sundayEnd.toISOString(),
      play_mode: 'RENTAL',
    });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('OUTSIDE_OPERATING_HOURS');
  });

  it('chấp nhận 24:00 là giờ đóng cửa, nhưng từ chối giờ vận hành không hợp lệ', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    await activateProvider(provider.id);
    const token = generateToken(provider);

    const closesAtMidnight = await request(app)
      .post('/api/v1/cafes')
      .set('Authorization', `Bearer ${token}`)
      .send(cafeBody({ operating_hours: { mon: { open: '14:00', close: '24:00' } } }));

    expect(closesAtMidnight.status).toBe(201);
    expect(closesAtMidnight.body.data.operatingHours.mon.close).toBe('24:00');

    const invalidHours = await request(app)
      .post('/api/v1/cafes')
      .set('Authorization', `Bearer ${token}`)
      .send(cafeBody({ operating_hours: { mon: { open: '14:00', close: '24:30' } } }));

    expect(invalidHours.status).toBe(400);
  });

  it('provider đã đăng ký ACTIVE tạo cafe được, status mặc định PENDING', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    await activateProvider(provider.id);

    const res = await request(app)
      .post('/api/v1/cafes')
      .set('Authorization', `Bearer ${generateToken(provider)}`)
      .send(cafeBody());

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.providerId).toBe(provider.id);
    expect(res.body.data.status).toBe(CafeStatus.PENDING);
  });

  it('provider chưa được duyệt không CRUD được cafe', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });

    await AppDataSource.query(
      `INSERT INTO provider_profiles
         (user_id, business_name, registration_status)
       VALUES ($1, $2, $3)`,
      [provider.id, 'Pending RC Business', ProviderStatus.PENDING],
    );

    const res = await request(app)
      .post('/api/v1/cafes')
      .set('Authorization', `Bearer ${generateToken(provider)}`)
      .send(cafeBody());

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ACCOUNT_NOT_ACTIVE');
  });

  it('provider chỉ update được cafe thuộc sở hữu của mình', async () => {
    const owner = await createTestUser({ role: UserRole.PROVIDER });
    const other = await createTestUser({ role: UserRole.PROVIDER });
    await activateProvider(owner.id);
    await activateProvider(other.id);
    const cafe = await createTestCafe({ provider_id: owner.id });

    const denied = await request(app)
      .patch(`/api/v1/cafes/${cafe.id}`)
      .set('Authorization', `Bearer ${generateToken(other)}`)
      .send({ name: 'Other Update' });

    expect(denied.status).toBe(403);

    const allowed = await request(app)
      .patch(`/api/v1/cafes/${cafe.id}`)
      .set('Authorization', `Bearer ${generateToken(owner)}`)
      .send({ name: 'Owner Update' });

    expect(allowed.status).toBe(200);
    expect(allowed.body.data.name).toBe('Owner Update');
  });

  it('public list chỉ trả ACTIVE và có pagination meta', async () => {
    await createTestCafe({ status: CafeStatus.ACTIVE });
    await createTestCafe({ status: CafeStatus.PENDING });

    const res = await request(app).get('/api/v1/cafes?page=1&limit=10');

    expect(res.status).toBe(200);
    expect(res.body.meta).toMatchObject({ total: 1, page: 1, limit: 10 });
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].status).toBe(CafeStatus.ACTIVE);
  });

  it('public list cho phép filter status=ACTIVE', async () => {
    await createTestCafe({ status: CafeStatus.ACTIVE });
    await createTestCafe({ status: CafeStatus.PENDING });

    const res = await request(app).get('/api/v1/cafes?status=ACTIVE');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].status).toBe(CafeStatus.ACTIVE);
  });

  /*
    Màn "Duyệt cơ sở" của admin sống chết bằng hai truy vấn này.

    Trước đây admin cũng bị ép `status = ACTIVE` như khách vãng lai, rồi bộ lọc
    cộng thêm một điều kiện trạng thái nữa — hỏi cơ sở chờ duyệt thành
    `status='ACTIVE' AND status='PENDING'`, luôn trả về rỗng. Provider tạo cơ sở
    xong nó nằm im mãi vì admin không bao giờ nhìn thấy để duyệt.
  */
  it('admin lọc được cơ sở đang chờ duyệt', async () => {
    const admin = await createTestUser({ role: UserRole.ADMIN });
    await createTestCafe({ status: CafeStatus.ACTIVE });
    const pendingCafe = await createTestCafe({ status: CafeStatus.PENDING });

    const res = await request(app)
      .get('/api/v1/cafes?status=PENDING')
      .set('Authorization', `Bearer ${generateToken(admin)}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe(pendingCafe.id);
    expect(res.body.data[0].status).toBe(CafeStatus.PENDING);
  });

  it('admin không lọc trạng thái thì thấy đủ mọi trạng thái', async () => {
    // Bốn ô đếm ở màn duyệt cơ sở tính từ đúng lần gọi không lọc này.
    const admin = await createTestUser({ role: UserRole.ADMIN });
    await createTestCafe({ status: CafeStatus.ACTIVE });
    await createTestCafe({ status: CafeStatus.PENDING });
    await createTestCafe({ status: CafeStatus.SUSPENDED });

    const res = await request(app)
      .get('/api/v1/cafes?limit=100')
      .set('Authorization', `Bearer ${generateToken(admin)}`);

    expect(res.status).toBe(200);
    const statuses = (res.body.data as Array<{ status: string }>).map((c) => c.status);
    expect(statuses).toEqual(
      expect.arrayContaining([CafeStatus.ACTIVE, CafeStatus.PENDING, CafeStatus.SUSPENDED]),
    );
  });

  it('public list bỏ qua filter status chưa public và chỉ trả ACTIVE', async () => {
    await createTestCafe({ status: CafeStatus.ACTIVE });
    await createTestCafe({ status: CafeStatus.PENDING });

    const res = await request(app).get('/api/v1/cafes?status=PENDING');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].status).toBe(CafeStatus.ACTIVE);
  });

  it('provider managed list chỉ trả cafe thuộc sở hữu của provider', async () => {
    const owner = await createTestUser({ role: UserRole.PROVIDER });
    const other = await createTestUser({ role: UserRole.PROVIDER });
    await createTestCafe({ provider_id: owner.id, status: CafeStatus.ACTIVE });
    await createTestCafe({ provider_id: owner.id, status: CafeStatus.PENDING });
    await createTestCafe({ provider_id: owner.id, status: CafeStatus.SUSPENDED });
    await createTestCafe({ provider_id: other.id, status: CafeStatus.ACTIVE });

    const res = await request(app)
      .get('/api/v1/cafes?scope=managed&page=1&limit=20')
      .set('Authorization', `Bearer ${generateToken(owner)}`);

    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(3);
    expect(res.body.data).toHaveLength(3);
    expect(
      res.body.data.every((cafe: { providerId: string }) => cafe.providerId === owner.id),
    ).toBe(true);
  });

  it('owner xem được draft detail, public không xem được', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    const cafe = await createTestCafe({ provider_id: provider.id, status: CafeStatus.PENDING });

    const hidden = await request(app).get(`/api/v1/cafes/${cafe.id}`);
    expect(hidden.status).toBe(404);

    const visible = await request(app)
      .get(`/api/v1/cafes/${cafe.id}`)
      .set('Authorization', `Bearer ${generateToken(provider)}`);

    expect(visible.status).toBe(200);
    expect(visible.body.data.address).toBeDefined();
    expect(visible.body.data.operatingHours).toBeDefined();
    expect(visible.body.data.trackTypes).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'DRIFT' })]),
    );
    expect(visible.body.data.status).toBe(CafeStatus.PENDING);
  });

  it('admin cập nhật status cafe được', async () => {
    const admin = await createTestUser({ role: UserRole.ADMIN });
    const cafe = await createTestCafe({ status: CafeStatus.PENDING });

    const res = await request(app)
      .patch(`/api/v1/cafes/${cafe.id}/status`)
      .set('Authorization', `Bearer ${generateToken(admin)}`)
      .send({ status: CafeStatus.ACTIVE });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe(CafeStatus.ACTIVE);
  });

  it('provider không đổi được status cafe thuộc provider khác', async () => {
    const owner = await createTestUser({ role: UserRole.PROVIDER });
    const other = await createTestUser({ role: UserRole.PROVIDER });
    const cafe = await createTestCafe({ provider_id: owner.id, status: CafeStatus.ACTIVE });

    const res = await request(app)
      .patch(`/api/v1/cafes/${cafe.id}/status`)
      .set('Authorization', `Bearer ${generateToken(other)}`)
      .send({ status: CafeStatus.SUSPENDED });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('provider không tự approve cafe PENDING', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    const cafe = await createTestCafe({ provider_id: provider.id, status: CafeStatus.PENDING });

    const res = await request(app)
      .patch(`/api/v1/cafes/${cafe.id}/status`)
      .set('Authorization', `Bearer ${generateToken(provider)}`)
      .send({ status: CafeStatus.ACTIVE });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('provider owner được tạm ngưng và kích hoạt lại cafe đang hoạt động', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    const cafe = await createTestCafe({ provider_id: provider.id, status: CafeStatus.ACTIVE });

    const suspended = await request(app)
      .patch(`/api/v1/cafes/${cafe.id}/status`)
      .set('Authorization', `Bearer ${generateToken(provider)}`)
      .send({ status: CafeStatus.SUSPENDED });

    expect(suspended.status).toBe(200);
    expect(suspended.body.data.status).toBe(CafeStatus.SUSPENDED);

    const active = await request(app)
      .patch(`/api/v1/cafes/${cafe.id}/status`)
      .set('Authorization', `Bearer ${generateToken(provider)}`)
      .send({ status: CafeStatus.ACTIVE });

    expect(active.status).toBe(200);
    expect(active.body.data.status).toBe(CafeStatus.ACTIVE);
  });

  it('public list lọc theo khoảng giá, tiện ích, loại xe và sắp xếp từ BE', async () => {
    const amenity = await createTestAmenity({ title: 'Serious Inspection', icon: 'shield' });
    const lowPriceCafe = await createTestCafe({
      status: CafeStatus.ACTIVE,
      slot_fee_rate: 90000,
      amenity_ids: [amenity.id],
    });
    const highPriceCafe = await createTestCafe({
      status: CafeStatus.ACTIVE,
      slot_fee_rate: 220000,
    });
    await createTestVehicle({ cafe_id: lowPriceCafe.id, compatible_track_types: ['DRIFT'] });
    await createTestVehicle({ cafe_id: highPriceCafe.id, compatible_track_types: ['OBSTACLE'] });
    await addReview(lowPriceCafe.id, 5);
    await addReview(highPriceCafe.id, 3);
    await addPromotion(lowPriceCafe.id);

    const priceRes = await request(app).get('/api/v1/cafes?price_min=80000&price_max=100000');
    expect(priceRes.status).toBe(200);
    expect(priceRes.body.data).toHaveLength(1);
    expect(priceRes.body.data[0].id).toBe(lowPriceCafe.id);

    const amenityRes = await request(app).get(
      `/api/v1/cafes?amenities=${encodeURIComponent(amenity.title)}`,
    );
    expect(amenityRes.status).toBe(200);
    expect(amenityRes.body.data).toHaveLength(1);
    expect(amenityRes.body.data[0].id).toBe(lowPriceCafe.id);

    const vehicleRes = await request(app).get('/api/v1/cafes?vehicle_type=Traxxas');
    expect(vehicleRes.status).toBe(200);
    expect(vehicleRes.body.data).toHaveLength(2);

    const ratingRes = await request(app).get('/api/v1/cafes?sort_by=rating');
    expect(ratingRes.status).toBe(200);
    expect(ratingRes.body.data[0].id).toBe(lowPriceCafe.id);

    const popularityRes = await request(app).get('/api/v1/cafes?sort_by=popularity');
    expect(popularityRes.status).toBe(200);
    expect(popularityRes.body.data[0].id).toBe(lowPriceCafe.id);

    expect(priceRes.body.data[0]).toMatchObject({
      rating: 5,
      reviewsCount: 1,
      minPrice: 90000,
    });
    expect(priceRes.body.data[0].activePromotions).toHaveLength(1);
    expect(priceRes.body.data[0].amenities).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: amenity.id, title: amenity.title })]),
    );
  });

  it('tạo cafe thiếu tọa độ hoặc tọa độ bằng 0 bị từ chối', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    await activateProvider(provider.id);

    const missingCoordinates = await request(app)
      .post('/api/v1/cafes')
      .set('Authorization', `Bearer ${generateToken(provider)}`)
      .send(cafeBody({ latitude: null, longitude: null }));

    expect(missingCoordinates.status).toBe(400);

    const zeroCoordinates = await request(app)
      .post('/api/v1/cafes')
      .set('Authorization', `Bearer ${generateToken(provider)}`)
      .send(cafeBody({ latitude: 0, longitude: 0 }));

    expect(zeroCoordinates.status).toBe(400);
  });
});
