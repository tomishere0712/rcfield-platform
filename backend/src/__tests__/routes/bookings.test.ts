import request from 'supertest';
import { app } from '../../app';
import { AppDataSource } from '../../config/database';
import { UserRole } from '../../types';
import { createTestUser, createTestCafe, createTestVehicle, generateToken } from '../helpers';

// Template — bổ sung khi implement BookingController

describe('POST /api/v1/bookings', () => {
  let customerToken: string;
  let cafeId: string;
  let vehicleId: string;

  beforeEach(async () => {
    const customer = await createTestUser({ role: UserRole.CUSTOMER });
    customerToken = generateToken(customer);

    const cafe = await createTestCafe({ track_types: ['DRIFT', 'CIRCUIT'] });
    cafeId = cafe.id;

    const vehicle = await createTestVehicle({ cafe_id: cafeId, tier: 'STANDARD' });
    vehicleId = vehicle.id;
  });

  it.todo('tạo booking RENTAL thành công → 201 + status PENDING');
  it.todo('tạo booking BYOC thành công → 201 + vehicle_id null');
  it.todo('từ chối nếu cafe status != ACTIVE → 400 CAFE_NOT_ACTIVE');
  it.todo('từ chối nếu xe đã bị đặt trong cùng slot → 409 SLOT_UNAVAILABLE');
  it.todo('từ chối nếu BYOC capacity đã đầy → 409 BYOC_CAPACITY_FULL');
  it.todo('từ chối nếu không có token → 401 UNAUTHORIZED');
  it.todo('slot_start phải nằm trong boundary của cafe → 400 INVALID_SLOT');
});

describe('GET /api/v1/bookings/:id', () => {
  it.todo('customer lấy được booking của mình');
  it.todo('customer không lấy được booking của người khác → 403');
  it.todo('staff lấy được mọi booking trong chi nhánh mình');

  it('chỉ cho staff của chi nhánh xem đơn, đồng thời giữ lịch sử xe và F&B đã hủy', async () => {
    const customer = await createTestUser({ role: UserRole.CUSTOMER });
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    const cafe = await createTestCafe({ provider_id: provider.id });
    const vehicle = await createTestVehicle({ cafe_id: cafe.id, tier: 'PREMIUM' });
    const [trackType] = await AppDataSource.query<{ id: string }[]>(
      `SELECT id FROM track_types LIMIT 1`,
    );
    const [booking] = await AppDataSource.query<{ id: string }[]>(
      `INSERT INTO bookings
         (customer_id, cafe_id, slot_start, slot_end, play_mode, status, source,
          payment_expires_at, track_type_id, snapshot)
       VALUES ($1, $2, NOW() - INTERVAL '2 hours', NOW() - INTERVAL '1 hour', 'RENTAL',
               'CANCELLED', 'APP', NOW() - INTERVAL '30 minutes', $3, '{}'::jsonb)
       RETURNING id`,
      [customer.id, cafe.id, trackType.id],
    );

    await AppDataSource.query(
      `INSERT INTO booking_vehicles
         (booking_id, vehicle_id, hourly_rate_snapshot, rental_fee_snapshot,
          security_deposit_snapshot, catalog_name_snapshot,
          tier_snapshot, identifier_snapshot, color_snapshot, cover_image_url_snapshot)
       VALUES ($1, $2, 80000, 80000, 0, $3, 'PREMIUM', $4, 'Orange', $5)`,
      [
        booking.id,
        vehicle.id,
        'Xe lịch sử đã giữ',
        'HISTORICAL-CAR-01',
        'https://example.test/history-car.jpg',
      ],
    );

    const [menuItem] = await AppDataSource.query<{ id: string }[]>(
      `INSERT INTO menu_items (cafe_id, name, price)
       VALUES ($1, 'Nước suối hiện tại', 10000)
       RETURNING id`,
      [cafe.id],
    );
    const [fnbOrder] = await AppDataSource.query<{ id: string }[]>(
      `INSERT INTO fnb_orders
         (booking_id, session_id, order_type, total_amount, status, created_by)
       VALUES ($1, NULL, 'PRE_ORDER', 10000, 'CANCELLED', $2)
       RETURNING id`,
      [booking.id, customer.id],
    );
    await AppDataSource.query(
      `INSERT INTO fnb_order_items
         (fnb_order_id, menu_item_id, quantity, unit_price, subtotal, item_name_snapshot)
       VALUES ($1, $2, 1, 10000, 10000, 'Nước suối đã đặt')`,
      [fnbOrder.id, menuItem.id],
    );

    const staff = await createTestUser({ role: UserRole.STAFF });
    const staffToken = generateToken(staff);

    const forbidden = await request(app)
      .get(`/api/v1/bookings/${booking.id}`)
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(403);
    expect(forbidden.body.code).toBe('BOOKING_CAFE_FORBIDDEN');

    await AppDataSource.query(
      `INSERT INTO staff_cafe_assignments (staff_id, cafe_id, assigned_by)
       VALUES ($1, $2, $3)`,
      [staff.id, cafe.id, provider.id],
    );

    const allowed = await request(app)
      .get(`/api/v1/bookings/${booking.id}`)
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200);

    expect(allowed.body.data.vehicles).toEqual([
      expect.objectContaining({
        catalogName: 'Xe lịch sử đã giữ',
        tier: 'PREMIUM',
        identifier: 'HISTORICAL-CAR-01',
        color: 'Orange',
        coverImageUrl: 'https://example.test/history-car.jpg',
      }),
    ]);
    expect(allowed.body.data.fnb_orders).toEqual([
      expect.objectContaining({
        status: 'CANCELLED',
        totalAmount: 10000,
        items: [expect.objectContaining({ itemName: 'Nước suối đã đặt' })],
      }),
    ]);
    expect(allowed.body.data.fnb_order).toEqual(expect.objectContaining({ status: 'CANCELLED' }));
  });
});

describe('PATCH /api/v1/bookings/:id/cancel', () => {
  it.todo('huỷ trước 24h → hoàn 100%');
  it.todo('huỷ 12-24h → hoàn 50% slot_fee');
  it.todo('huỷ dưới 12h → hoàn 0% slot_fee');
  it.todo('không thể huỷ booking đang ACTIVE → 400');
});
