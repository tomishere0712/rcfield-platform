import request from 'supertest';
import { app } from '../../app';
import { AppDataSource } from '../../config/database';
import { ProviderStatus, SubscriptionStatus, UserRole } from '../../types';
import { createTestCafe, createTestUser, createTestVehicle, generateToken } from '../helpers';

/**
 * BR-30. Hai điều kiện mà tài liệu nghiệp vụ khẳng định nhưng code chưa chặn:
 *   1. Xe đang gán cho một phiên chơi chưa kết thúc thì không được xoá — xoá đi
 *      là biên bản trả xe và khoản đền bù mất chỗ bám.
 *   2. Chuyển xe sang RETIRED là quyết định một chiều; đảo ngược được thì trạng
 *      thái này không còn nghĩa "đã loại khỏi đội xe".
 */
async function activateProvider(providerId: string): Promise<void> {
  await AppDataSource.query(
    `INSERT INTO provider_profiles (user_id, business_name, registration_status)
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

async function seedProviderWithVehicle() {
  const provider = await createTestUser({ role: UserRole.PROVIDER });
  await activateProvider(provider.id);
  const cafe = await createTestCafe({ provider_id: provider.id });
  const vehicle = await createTestVehicle({ cafe_id: cafe.id });
  return { provider, cafe, vehicle, token: generateToken(provider) };
}

/** Gắn xe vào một phiên chơi ở trạng thái cho trước. */
async function attachVehicleToSession(
  cafeId: string,
  vehicleId: string,
  sessionStatus: string,
  vehicleStatus: string,
) {
  const customer = await createTestUser({ role: UserRole.CUSTOMER });
  const staff = await createTestUser({ role: UserRole.STAFF });
  const [trackType] = await AppDataSource.query(`SELECT id FROM track_types LIMIT 1`);

  const [booking] = await AppDataSource.query(
    `INSERT INTO bookings
       (customer_id, cafe_id, slot_start, slot_end, play_mode, status, source,
        payment_expires_at, track_type_id)
     VALUES ($1, $2, NOW() - INTERVAL '2 hours', NOW() + INTERVAL '1 hour',
             'RENTAL', 'CONFIRMED', 'APP', NOW() + INTERVAL '15 minutes', $3)
     RETURNING id`,
    [customer.id, cafeId, trackType?.id ?? null],
  );

  const [session] = await AppDataSource.query(
    `INSERT INTO sessions (booking_id, cafe_id, status, planned_end_at, actual_start_at, checked_in_by)
     VALUES ($1, $2, $3, NOW() + INTERVAL '1 hour', NOW() - INTERVAL '1 hour', $4)
     RETURNING id`,
    [booking.id, cafeId, sessionStatus, staff.id],
  );

  await AppDataSource.query(
    `INSERT INTO session_vehicles (session_id, vehicle_source, vehicle_id, status)
     VALUES ($1, 'RENTAL', $2, $3)`,
    [session.id, vehicleId, vehicleStatus],
  );

  return { session };
}

describe('BR-30 — vòng đời xe vật lý', () => {
  it('không xoá được xe đang gán cho phiên chơi chưa kết thúc', async () => {
    const { cafe, vehicle, token } = await seedProviderWithVehicle();
    await attachVehicleToSession(cafe.id, vehicle.id, 'ACTIVE', 'IN_USE');

    const res = await request(app)
      .delete(`/api/v1/cafes/${cafe.id}/vehicle-catalogs/${vehicle.catalog_id}/units/${vehicle.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(409);
    expect(res.body.error?.code ?? res.body.code).toBe('VEHICLE_IN_ACTIVE_SESSION');

    const [row] = await AppDataSource.query(`SELECT deleted_at FROM vehicles WHERE id = $1`, [
      vehicle.id,
    ]);
    expect(row.deleted_at).toBeNull();
  });

  it('phiên đã kết thúc thì xoá xe bình thường', async () => {
    const { cafe, vehicle, token } = await seedProviderWithVehicle();
    await attachVehicleToSession(cafe.id, vehicle.id, 'COMPLETED', 'RETURNED');

    const res = await request(app)
      .delete(`/api/v1/cafes/${cafe.id}/vehicle-catalogs/${vehicle.catalog_id}/units/${vehicle.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const [row] = await AppDataSource.query(`SELECT deleted_at FROM vehicles WHERE id = $1`, [
      vehicle.id,
    ]);
    expect(row.deleted_at).not.toBeNull();
  });

  it('không đưa xe đã RETIRED về trạng thái khác', async () => {
    const { cafe, vehicle, token } = await seedProviderWithVehicle();
    const url = `/api/v1/cafes/${cafe.id}/vehicle-catalogs/${vehicle.catalog_id}/units/${vehicle.id}`;

    const retire = await request(app)
      .patch(url)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'RETIRED' });
    expect(retire.status).toBe(200);

    const revive = await request(app)
      .patch(url)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'AVAILABLE' });

    expect(revive.status).toBe(409);
    expect(revive.body.error?.code ?? revive.body.code).toBe('VEHICLE_RETIRED');

    const [row] = await AppDataSource.query(`SELECT status FROM vehicles WHERE id = $1`, [
      vehicle.id,
    ]);
    expect(row.status).toBe('RETIRED');
  });

  it('xe đang trong phiên chơi thì cũng không cho chuyển sang RETIRED', async () => {
    const { cafe, vehicle, token } = await seedProviderWithVehicle();
    await attachVehicleToSession(cafe.id, vehicle.id, 'ACTIVE', 'IN_USE');

    const res = await request(app)
      .patch(`/api/v1/cafes/${cafe.id}/vehicle-catalogs/${vehicle.catalog_id}/units/${vehicle.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'RETIRED' });

    expect(res.status).toBe(409);
    expect(res.body.error?.code ?? res.body.code).toBe('VEHICLE_IN_ACTIVE_SESSION');
  });
});
