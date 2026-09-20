import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../app';
import { AppDataSource } from '../../config/database';
import { env } from '../../config/env';
import { redis } from '../../config/redis';
import * as staffService from '../../services/staff.service';
import {
  BookingStatus,
  BookingParticipantType,
  BookingMode,
  UserRole,
  PaymentTransactionStatus,
  PaymentComponentStatus,
  PaymentComponentType,
  FnbOrderStatus,
  FnbOrderType,
  SessionStatus,
  BookingSource,
} from '../../types';
import { createTestCafe, createTestUser, createTestVehicle } from '../helpers';
import { User } from '../../models/user.entity';
import { Booking } from '../../models/booking.entity';
import { BookingParticipant } from '../../models/booking-participant.entity';
import { PaymentTransaction } from '../../models/payment-transaction.entity';
import { PaymentComponent } from '../../models/payment-component.entity';
import { Session } from '../../models/session.entity';

const VN_TZ_OFFSET_MS = 7 * 60 * 60 * 1000;
const OPERATING_DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

interface ExtensionPricingOption {
  extraMinutes: number;
  additionalFee: number;
  available?: boolean;
  blockedReason?: string;
}

function nextLocalDateAt(hour: number, minute = 0): Date {
  const localNow = new Date(Date.now() + VN_TZ_OFFSET_MS);
  let utcMs =
    Date.UTC(
      localNow.getUTCFullYear(),
      localNow.getUTCMonth(),
      localNow.getUTCDate(),
      hour,
      minute,
    ) - VN_TZ_OFFSET_MS;

  if (utcMs <= Date.now() + 2 * 60 * 60 * 1000) {
    utcMs += 24 * 60 * 60 * 1000;
  }

  return new Date(utcMs);
}

function buildWeeklyOperatingHours(open: string, close: string): Record<string, unknown> {
  return OPERATING_DAY_KEYS.reduce<Record<string, unknown>>((hours, day) => {
    hours[day] = { open, close, is_closed: false };
    return hours;
  }, {});
}

describe('POST /api/v1/staff/bookings (Walk-In Booking API)', () => {
  let staffUser: User;
  let staffToken: string;
  let cafe: { id: string };
  let trackTypeId: string;
  let trackConfigId: string;
  let vehicle: { id: string };

  beforeEach(async () => {
    // 1. Create a staff user and cafe
    staffUser = await createTestUser({ role: UserRole.STAFF });
    cafe = await createTestCafe();

    // Link staff to cafe in JWT token
    staffToken = jwt.sign(
      { userId: staffUser.id, email: staffUser.email, role: UserRole.STAFF, cafeId: cafe.id },
      env.jwt.secret,
      { expiresIn: '1h' },
    );

    // 2. Get a track type and create cafe track config
    const [trackType] = await AppDataSource.query(`SELECT id FROM track_types LIMIT 1`);
    trackTypeId = trackType.id;

    const [trackConfig] = await AppDataSource.query<{ id: string }[]>(
      `INSERT INTO cafe_track_configs (cafe_id, track_type_id, max_concurrent, byoc_capacity, is_active)
       VALUES ($1, $2, 2, 5, true)
       RETURNING id`,
      [cafe.id, trackTypeId],
    );
    trackConfigId = trackConfig.id;

    // 3. Create a vehicle
    vehicle = await createTestVehicle({ cafe_id: cafe.id, tier: 'STANDARD' });

    // 4. Configure verified bank payment settings for cafe
    await AppDataSource.query(
      `INSERT INTO cafe_payment_settings
         (cafe_id, method, bank_code, bank_bin, account_number, account_name,
          is_verified, verified_at)
       VALUES ($1, 'BANK_TRANSFER', 'VCB', '970436', '1234567890', 'QUAN RC TEST', true, NOW())`,
      [cafe.id],
    );
  });

  afterEach(async () => {
    // Clean up Redis locks
    const keys = await redis.keys('slot:lock:vehicle:*');
    if (keys.length > 0) {
      await redis.del(keys);
    }
    const byocKeys = await redis.keys('slot:byoc:*');
    if (byocKeys.length > 0) {
      await redis.del(byocKeys);
    }
  });

  it('từ chối check-in khi đã quá 30 phút kể từ giờ bắt đầu', async () => {
    const customer = await createTestUser({ role: UserRole.CUSTOMER });
    const slotStart = new Date(Date.now() - 31 * 60 * 1000);
    const booking = await AppDataSource.getRepository(Booking).save({
      customerId: customer.id,
      cafeId: cafe.id,
      trackTypeId,
      trackConfigId,
      playMode: BookingMode.RENTAL,
      source: BookingSource.APP,
      status: BookingStatus.CONFIRMED,
      slotStart,
      slotEnd: new Date(slotStart.getTime() + 60 * 60 * 1000),
      slotCount: 1,
      paymentExpiresAt: new Date(slotStart.getTime() - 30 * 60 * 1000),
      snapshot: {},
      discountAmount: 0,
    });

    await expect(staffService.startCheckIn(booking.id, staffUser.id)).rejects.toMatchObject({
      code: 'CHECK_IN_WINDOW_EXPIRED',
      statusCode: 400,
    });
    await expect(
      AppDataSource.getRepository(Session).findOne({ where: { bookingId: booking.id } }),
    ).resolves.toBeNull();
  });

  it('tạo booking BYOC thành công, tự sinh tài khoản guest, ghi nhận audit và thanh toán', async () => {
    const slotStart = nextLocalDateAt(10, 0);
    const slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000);

    const body = {
      play_mode: 'BYOC',
      track_type_id: trackTypeId,
      slot_start: slotStart.toISOString(),
      slot_end: slotEnd.toISOString(),
      payment_method: 'CASH',
      vehicle_ids: [],
      participants: [
        {
          guest_name: 'Khách Vãng Lai A',
          guest_phone: '0912345678',
          participant_type: 'WALK_IN_GUEST',
        },
      ],
    };

    const res = await request(app)
      .post('/api/v1/staff/bookings')
      .set('Authorization', `Bearer ${staffToken}`)
      .send(body);

    console.log('BYOC Booking Fail Detail:', res.body);
    expect(res.status).toBe(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.bookingId).toBeTruthy();
    expect(res.body.data.status).toBe(BookingStatus.CONFIRMED);
    expect(res.body.data.paymentStatus).toBe('CAPTURED');

    // 1. Verify Guest User was automatically created
    const userRepo = AppDataSource.getRepository(User);
    const guestUser = await userRepo.findOne({ where: { phone: '0912345678' } });
    expect(guestUser).toBeTruthy();
    expect(guestUser!.email).toBe('0912345678@guest.rcfield.local');
    expect(guestUser!.password_hash).toBeNull();
    expect(guestUser!.is_active).toBe(true);

    // 2. Verify Booking is confirmed and correct source
    const bookingRepo = AppDataSource.getRepository(Booking);
    const booking = await bookingRepo.findOne({ where: { id: res.body.data.bookingId } });
    expect(booking).toBeTruthy();
    expect(booking!.status).toBe(BookingStatus.CONFIRMED);
    expect((booking!.snapshot as Record<string, unknown>).created_by_staff_id).toBe(staffUser.id);

    // 3. Verify PaymentComponents are marked DISBURSED
    const compRepo = AppDataSource.getRepository(PaymentComponent);
    const comps = await compRepo.find({ where: { bookingId: booking!.id } });
    expect(comps.length).toBe(1);
    expect(comps[0].type).toBe(PaymentComponentType.SLOT_FEE);
    expect(comps[0].status).toBe(PaymentComponentStatus.DISBURSED);

    // 4. Verify PaymentTransaction is SUCCESS with audit
    const txRepo = AppDataSource.getRepository(PaymentTransaction);
    const tx = await txRepo.findOne({ where: { bookingId: booking!.id } });
    expect(tx).toBeTruthy();
    expect(tx!.status).toBe(PaymentTransactionStatus.SUCCESS);
    expect(tx!.gateway).toBe('COUNTER_CASH');
    expect((tx!.rawRequest as Record<string, unknown>).created_by_staff_id).toBe(staffUser.id);
  });

  it('tạo booking RENTAL thành công, có xe thuê và ghi nhận phí xe + cọc xe', async () => {
    const testVehicle = await createTestVehicle({ cafe_id: cafe.id, tier: 'STANDARD' });
    const slotStart = nextLocalDateAt(14, 0);
    const slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000);

    const body = {
      play_mode: 'RENTAL',
      track_type_id: trackTypeId,
      slot_start: slotStart.toISOString(),
      slot_end: slotEnd.toISOString(),
      payment_method: 'CASH',
      vehicle_ids: [testVehicle.id],
      participants: [
        {
          guest_name: 'Khách Thuê Xe',
          guest_phone: '0987654321',
          participant_type: 'WALK_IN_GUEST',
        },
      ],
    };

    const res = await request(app)
      .post('/api/v1/staff/bookings')
      .set('Authorization', `Bearer ${staffToken}`)
      .send(body)
      .expect(201);

    expect(res.body.success).toBe(true);

    const booking = await AppDataSource.getRepository(Booking).findOne({
      where: { id: res.body.data.bookingId },
    });
    expect(booking?.trackConfigId).toBe(trackConfigId);

    const compRepo = AppDataSource.getRepository(PaymentComponent);
    const comps = await compRepo.find({ where: { bookingId: res.body.data.bookingId } });
    expect(comps.length).toBe(2); // SLOT_FEE, RENTAL_FEE

    const types = comps.map((c) => c.type);
    expect(types).toContain(PaymentComponentType.SLOT_FEE);
    expect(types).toContain(PaymentComponentType.RENTAL_FEE);
    expect(types).not.toContain(PaymentComponentType.SECURITY_DEPOSIT);

    comps.forEach((c) => {
      expect(c.status).toBe(PaymentComponentStatus.DISBURSED);
    });
  });

  it('trừ sức chứa xe thuê của đơn cũ chưa có track config', async () => {
    await Promise.all([
      createTestVehicle({ cafe_id: cafe.id, tier: 'STANDARD' }),
      createTestVehicle({ cafe_id: cafe.id, tier: 'STANDARD' }),
    ]);
    const slotStart = nextLocalDateAt(10);
    const slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000);

    const [legacyBooking] = await AppDataSource.query<{ id: string }[]>(
      `INSERT INTO bookings
         (customer_id, cafe_id, track_type_id, play_mode, source, status,
          slot_start, slot_end, slot_count, payment_expires_at, discount_amount)
       VALUES ($1, $2, $3, 'RENTAL', 'APP', 'CONFIRMED', $4, $5, 1,
               $6, 0)
       RETURNING id`,
      [
        staffUser.id,
        cafe.id,
        trackTypeId,
        slotStart,
        slotEnd,
        new Date(slotStart.getTime() + 30 * 60 * 1000),
      ],
    );

    await AppDataSource.query(
      `INSERT INTO booking_vehicles
         (booking_id, vehicle_id, hourly_rate_snapshot, rental_fee_snapshot,
          security_deposit_snapshot)
       VALUES ($1, $2, 50000, 50000, 0)`,
      [legacyBooking.id, vehicle.id],
    );

    const res = await request(app)
      .get(`/api/v1/cafes/${cafe.id}/availability`)
      .query({
        slot_start: slotStart.toISOString(),
        slot_end: slotEnd.toISOString(),
        play_mode: BookingMode.RENTAL,
        track_config_id: trackConfigId,
      })
      .expect(200);

    expect(res.body.success).toBe(true);
    // Three vehicles exist; one is assigned to the legacy booking and the
    // track capacity is two, so exactly one vehicle remains bookable.
    expect(res.body.data.vehicles).toHaveLength(1);
  });

  it('today bookings tách F&B đặt trước và F&B gọi tại ca cho khách walk-in', async () => {
    // This test verifies the staff list's F&B aggregation, not booking creation.
    // Anchor the fixture at the database's current time so it remains in the
    // Vietnam "today" query window even when CI runs close to midnight.
    const [bookingFixture] = await AppDataSource.query<{ id: string }[]>(
      `INSERT INTO bookings
         (customer_id, cafe_id, track_type_id, play_mode, source, status,
          slot_start, slot_end, slot_count, payment_expires_at, discount_amount)
       VALUES
         ($1, $2, $3, 'BYOC', $4, 'CONFIRMED', NOW(), NOW() + INTERVAL '1 hour', 1,
          NOW() + INTERVAL '30 minutes', 0)
       RETURNING id`,
      [staffUser.id, cafe.id, trackTypeId, BookingSource.STAFF_MANUAL],
    );
    const bookingId = bookingFixture.id;

    await AppDataSource.query(
      `INSERT INTO fnb_orders (booking_id, session_id, order_type, status, total_amount, created_by, notes)
       VALUES
         ($1, NULL, $2, $3, 10000, $4, 'preorder test'),
         ($1, NULL, $5, $3, 25000, $4, 'onsite test')`,
      [
        bookingId,
        FnbOrderType.PRE_ORDER,
        FnbOrderStatus.PENDING,
        staffUser.id,
        FnbOrderType.ON_SITE,
      ],
    );

    const bookings = await staffService.getTodayBookings(cafe.id);
    const booking = bookings.find((item) => item.bookingId === bookingId);

    expect(booking).toBeTruthy();
    expect(booking!.source).toBe('STAFF_MANUAL');
    expect(booking!.fnbPreorderFee).toBe(10000);
    expect(booking!.fnbOnsiteFee).toBe(25000);
    expect(booking!.totalAmount).toBe(booking!.slotFee + booking!.rentalFee + 10000);
  });

  it('ghi nhận đồ ăn, thức uống gọi trong phiên vào phí phát sinh và bỏ ra khi huỷ', async () => {
    const slotStart = nextLocalDateAt(10);
    const slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000);
    const [bookingRow] = await AppDataSource.query<{ id: string }[]>(
      `INSERT INTO bookings (
         customer_id, cafe_id, track_type_id, play_mode, source, status,
         slot_start, slot_end, slot_count, payment_expires_at, snapshot, discount_amount
       )
       VALUES ($1, $2, $3, 'BYOC', 'STAFF_MANUAL', 'CONFIRMED', $4, $5, 1, NOW(), '{}'::jsonb, 0)
       RETURNING id`,
      [staffUser.id, cafe.id, trackTypeId, slotStart, slotEnd],
    );
    const [menuItem] = await AppDataSource.query<{ id: string }[]>(
      `INSERT INTO menu_items (cafe_id, name, price, is_available)
       VALUES ($1, 'Nước kiểm thử', 30000, true)
       RETURNING id`,
      [cafe.id],
    );
    const session = await AppDataSource.getRepository(Session).save({
      bookingId: bookingRow.id,
      cafeId: cafe.id,
      checkedInBy: staffUser.id,
      status: SessionStatus.ACTIVE,
      actualStartAt: new Date(),
      plannedEndAt: slotEnd,
      actualTotalAmount: 0,
    });

    const order = await staffService.addSessionFnbOrder(session.id, staffUser.id, {
      items: [{ menu_item_id: menuItem.id, quantity: 2 }],
    });
    const componentRepo = AppDataSource.getRepository(PaymentComponent);
    const component = await componentRepo.findOne({
      where: { bookingId: bookingRow.id, type: PaymentComponentType.FNB_ON_SITE },
    });
    expect(component).toMatchObject({ status: PaymentComponentStatus.PENDING });
    expect(Number(component!.amount)).toBe(60000);

    await staffService.updateFnbOrderStatus(
      order.id,
      cafe.id,
      FnbOrderStatus.CANCELLED,
      staffUser.id,
    );
    expect(
      await componentRepo.findOne({
        where: { bookingId: bookingRow.id, type: PaymentComponentType.FNB_ON_SITE },
      }),
    ).toBeNull();
  });

  it('từ chối gia hạn trực tiếp cho đơn đặt trước APP', async () => {
    const slotStart = new Date(Date.now() + 6 * 60 * 60 * 1000);
    slotStart.setMinutes(0, 0, 0);
    const slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000);
    const customer = await createTestUser({
      role: UserRole.CUSTOMER,
      full_name: 'Khách Đặt Trước',
    });
    const [bookingRow] = await AppDataSource.query<{ id: string }[]>(
      `INSERT INTO bookings (
         customer_id, cafe_id, track_type_id, play_mode, source, status,
         slot_start, slot_end, slot_count, payment_expires_at, snapshot, discount_amount
       )
       VALUES ($1, $2, $3, 'BYOC', $4, 'CONFIRMED', $5, $6, 1, NOW(), '{}'::jsonb, 0)
       RETURNING id`,
      [customer.id, cafe.id, trackTypeId, BookingSource.APP, slotStart, slotEnd],
    );

    const session = new Session();
    session.bookingId = bookingRow.id;
    session.cafeId = cafe.id;
    session.status = SessionStatus.ACTIVE;
    session.checkedInBy = staffUser.id;
    session.actualStartAt = new Date();
    session.plannedEndAt = slotEnd;
    session.actualTotalAmount = 0;
    await AppDataSource.getRepository(Session).save(session);

    await expect(
      staffService.proposeExtension(session.id, staffUser.id, {
        extraMinutes: 15,
        direct: true,
      }),
    ).rejects.toMatchObject({ code: 'DIRECT_EXTENSION_NOT_ALLOWED', statusCode: 400 });
  });

  it('ghi nhận phí gia hạn ngay khi khách duyệt đề xuất trên ứng dụng', async () => {
    const slotStart = nextLocalDateAt(10);
    const slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000);
    const customer = await createTestUser({
      role: UserRole.CUSTOMER,
      full_name: 'Khách Duyệt Gia Hạn',
    });
    const [bookingRow] = await AppDataSource.query<{ id: string }[]>(
      `INSERT INTO bookings (
         customer_id, cafe_id, track_type_id, play_mode, source, status,
         slot_start, slot_end, slot_count, payment_expires_at, snapshot, discount_amount
       )
       VALUES ($1, $2, $3, 'BYOC', $4, 'CONFIRMED', $5, $6, 1, NOW(), '{}'::jsonb, 0)
       RETURNING id`,
      [customer.id, cafe.id, trackTypeId, BookingSource.APP, slotStart, slotEnd],
    );
    await AppDataSource.getRepository(PaymentComponent).save({
      bookingId: bookingRow.id,
      type: PaymentComponentType.SLOT_FEE,
      amount: 60000,
      status: PaymentComponentStatus.HELD,
    });

    const session = await AppDataSource.getRepository(Session).save({
      bookingId: bookingRow.id,
      cafeId: cafe.id,
      checkedInBy: staffUser.id,
      status: SessionStatus.ACTIVE,
      actualStartAt: new Date(),
      plannedEndAt: slotEnd,
      actualTotalAmount: 0,
    });

    const proposal = await staffService.proposeExtension(session.id, staffUser.id, {
      extraMinutes: 15,
      direct: false,
    });
    expect(proposal.status).toBe('PENDING');

    await staffService.customerRespondExtension(session.id, customer.id, true);

    const extensionComponent = await AppDataSource.getRepository(PaymentComponent).findOne({
      where: { bookingId: bookingRow.id, type: PaymentComponentType.EXTENSION_FEE },
    });
    expect(extensionComponent).toMatchObject({ status: PaymentComponentStatus.PENDING });
    expect(Number(extensionComponent!.amount)).toBe(Number(proposal.feeAmount));
  });

  it('cho phép gia hạn nếu booking overlap khác track và không còn giữ slot', async () => {
    const slotStart = nextLocalDateAt(10);
    const slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000);

    const res = await request(app)
      .post('/api/v1/staff/bookings')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        play_mode: 'BYOC',
        track_type_id: trackTypeId,
        slot_start: slotStart.toISOString(),
        slot_end: slotEnd.toISOString(),
        payment_method: 'CASH',
        vehicle_ids: [],
        participants: [
          {
            guest_name: 'Khách Gia Hạn',
            guest_phone: '0900000002',
            participant_type: 'WALK_IN_GUEST',
          },
        ],
      })
      .expect(201);

    const session = await staffService.startCheckIn(res.body.data.bookingId, staffUser.id);
    await AppDataSource.getRepository(Session).update(session.id, {
      status: SessionStatus.ACTIVE,
    });

    const [otherTrack] = await AppDataSource.query<{ id: string }[]>(
      `SELECT id FROM track_types WHERE id <> $1 LIMIT 1`,
      [trackTypeId],
    );
    const otherTrackTypeId = otherTrack?.id ?? trackTypeId;
    const otherCustomer = await createTestUser({
      role: UserRole.CUSTOMER,
      full_name: 'Booking khác track',
    });

    await AppDataSource.query(
      `INSERT INTO bookings (
         customer_id, cafe_id, track_type_id, play_mode, source, status,
         slot_start, slot_end, slot_count, payment_expires_at, snapshot, discount_amount
       )
       VALUES ($1, $2, $3, 'RENTAL', 'APP', 'AWAITING_PAYMENT', $4, $5, 2, NOW(), '{}'::jsonb, 0)`,
      [
        otherCustomer.id,
        cafe.id,
        otherTrackTypeId,
        new Date(slotEnd.getTime() - 50 * 60 * 1000),
        new Date(slotEnd.getTime() + 10 * 60 * 1000),
      ],
    );

    const proposal = await staffService.proposeExtension(session.id, staffUser.id, {
      extraMinutes: 15,
      additionalFee: 10000,
      direct: true,
    });

    expect(proposal.status).toBe('APPROVED');

    const updatedBooking = await AppDataSource.getRepository(Booking).findOne({
      where: { id: res.body.data.bookingId },
    });
    const updatedSession = await AppDataSource.getRepository(Session).findOne({
      where: { id: session.id },
    });

    expect(updatedSession!.plannedEndAt.toISOString()).toBe(
      new Date(slotEnd.getTime() + 15 * 60 * 1000).toISOString(),
    );
    expect(updatedBooking!.slotEnd.toISOString()).toBe(updatedSession!.plannedEndAt.toISOString());
  });

  it('cho phép gia hạn nếu booking CONFIRMED cùng track nhưng vẫn còn capacity', async () => {
    const slotStart = nextLocalDateAt(10);
    const slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000);

    const res = await request(app)
      .post('/api/v1/staff/bookings')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        play_mode: 'BYOC',
        track_type_id: trackTypeId,
        slot_start: slotStart.toISOString(),
        slot_end: slotEnd.toISOString(),
        payment_method: 'CASH',
        vehicle_ids: [],
        participants: [
          {
            guest_name: 'Khách Gia Hạn Còn Chỗ',
            guest_phone: '0900000004',
            participant_type: 'WALK_IN_GUEST',
          },
        ],
      })
      .expect(201);

    const session = await staffService.startCheckIn(res.body.data.bookingId, staffUser.id);
    await AppDataSource.getRepository(Session).update(session.id, {
      status: SessionStatus.ACTIVE,
    });

    const conflictCustomer = await createTestUser({
      role: UserRole.CUSTOMER,
      full_name: 'Booking cùng track còn capacity',
    });
    const [conflictBooking] = await AppDataSource.query<{ id: string }[]>(
      `INSERT INTO bookings (
         customer_id, cafe_id, track_type_id, play_mode, source, status,
         slot_start, slot_end, slot_count, payment_expires_at, snapshot, discount_amount
       )
       VALUES ($1, $2, $3, 'BYOC', 'APP', 'CONFIRMED', $4, $5, 1, NOW(), '{}'::jsonb, 0)
       RETURNING id`,
      [
        conflictCustomer.id,
        cafe.id,
        trackTypeId,
        slotEnd,
        new Date(slotEnd.getTime() + 60 * 60 * 1000),
      ],
    );
    await AppDataSource.query(
      `INSERT INTO booking_participants (
         booking_id, user_id, participant_type, is_primary_responsible, guest_name
       )
       VALUES ($1, $2, 'BOOKER', true, 'Booking cùng track còn capacity')`,
      [conflictBooking.id, conflictCustomer.id],
    );

    const proposal = await staffService.proposeExtension(session.id, staffUser.id, {
      extraMinutes: 15,
      additionalFee: 10000,
      direct: true,
    });

    expect(proposal.status).toBe('APPROVED');
  });

  it('backend tự tính phí gia hạn theo duration gốc và bỏ qua additionalFee từ client', async () => {
    const slotStart = nextLocalDateAt(10);
    const slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000);

    const res = await request(app)
      .post('/api/v1/staff/bookings')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        play_mode: 'BYOC',
        track_type_id: trackTypeId,
        slot_start: slotStart.toISOString(),
        slot_end: slotEnd.toISOString(),
        payment_method: 'CASH',
        vehicle_ids: [],
        participants: [
          {
            guest_name: 'Khách Kiểm Tra Giá Gia Hạn',
            guest_phone: '0900000006',
            participant_type: 'WALK_IN_GUEST',
          },
        ],
      })
      .expect(201);

    const session = await staffService.startCheckIn(res.body.data.bookingId, staffUser.id);
    await AppDataSource.getRepository(Session).update(session.id, {
      status: SessionStatus.ACTIVE,
    });

    const slotComp = await AppDataSource.getRepository(PaymentComponent).findOne({
      where: { bookingId: res.body.data.bookingId, type: PaymentComponentType.SLOT_FEE },
    });
    const expectedFee = Math.round(((Number(slotComp!.amount) / 60) * 15) / 1000) * 1000;

    const beforeExtension = await staffService.getSessionDetail(session.id);
    expect(
      beforeExtension.extensionPricingOptions.find(
        (option: ExtensionPricingOption) => option.extraMinutes === 15,
      ).additionalFee,
    ).toBe(expectedFee);

    const firstProposal = await staffService.proposeExtension(session.id, staffUser.id, {
      extraMinutes: 15,
      additionalFee: 1,
      direct: true,
    });
    expect(Number(firstProposal.feeAmount)).toBe(expectedFee);

    const afterExtension = await staffService.getSessionDetail(session.id);
    expect(
      afterExtension.extensionPricingOptions.find(
        (option: ExtensionPricingOption) => option.extraMinutes === 15,
      ).additionalFee,
    ).toBe(expectedFee);

    const secondProposal = await staffService.proposeExtension(session.id, staffUser.id, {
      extraMinutes: 15,
      additionalFee: 1,
      direct: true,
    });
    expect(Number(secondProposal.feeAmount)).toBe(expectedFee);

    const afterSecondExtension = await staffService.getSessionDetail(session.id);
    expect(afterSecondExtension.approvedExtensionFee).toBe(expectedFee * 2);
    expect(afterSecondExtension.approvedExtensionMinutes).toBe(30);
    expect(afterSecondExtension.approvedExtensions).toHaveLength(2);
    expect(afterSecondExtension.approvedExtensions).toEqual([
      expect.objectContaining({ extraMinutes: 15, additionalFee: expectedFee }),
      expect.objectContaining({ extraMinutes: 15, additionalFee: expectedFee }),
    ]);
    expect(afterSecondExtension.extensionProposal.additionalFee).toBe(expectedFee);

    // Approved extensions must become a pending payment component immediately,
    // rather than waiting for checkout to reconstruct the fee.
    const extensionComponent = await AppDataSource.getRepository(PaymentComponent).findOne({
      where: {
        bookingId: res.body.data.bookingId,
        type: PaymentComponentType.EXTENSION_FEE,
      },
    });
    expect(extensionComponent).toMatchObject({
      status: PaymentComponentStatus.PENDING,
    });
    expect(Number(extensionComponent!.amount)).toBe(expectedFee * 2);
  });

  it('từ chối gia hạn vượt quá giờ đóng cửa của cafe', async () => {
    await AppDataSource.query(`UPDATE cafes SET operating_hours = $1 WHERE id = $2`, [
      JSON.stringify(buildWeeklyOperatingHours('09:00', '22:00')),
      cafe.id,
    ]);

    const slotStart = nextLocalDateAt(21, 0);
    const slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000);

    const res = await request(app)
      .post('/api/v1/staff/bookings')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        play_mode: 'BYOC',
        track_type_id: trackTypeId,
        slot_start: slotStart.toISOString(),
        slot_end: slotEnd.toISOString(),
        payment_method: 'CASH',
        vehicle_ids: [],
        participants: [
          {
            guest_name: 'Khách Vượt Giờ Đóng Cửa',
            guest_phone: '0900000007',
            participant_type: 'WALK_IN_GUEST',
          },
        ],
      })
      .expect(201);

    const session = await staffService.startCheckIn(res.body.data.bookingId, staffUser.id);
    await AppDataSource.getRepository(Session).update(session.id, {
      status: SessionStatus.ACTIVE,
    });

    const detail = await staffService.getSessionDetail(session.id);
    const fifteenMinuteOption = detail.extensionPricingOptions.find(
      (option: ExtensionPricingOption) => option.extraMinutes === 15,
    );
    expect(fifteenMinuteOption).toMatchObject({
      available: false,
      blockedReason: expect.stringContaining('Vượt giờ đóng cửa'),
    });

    await expect(
      staffService.proposeExtension(session.id, staffUser.id, {
        extraMinutes: 15,
        additionalFee: 10000,
        direct: true,
      }),
    ).rejects.toMatchObject({ code: 'OPERATING_HOURS_EXCEEDED', statusCode: 409 });
  });

  it('từ chối gia hạn nếu slot cùng track đã hết capacity', async () => {
    await AppDataSource.query(
      `UPDATE cafe_track_configs
       SET byoc_capacity = 1
       WHERE cafe_id = $1 AND track_type_id = $2`,
      [cafe.id, trackTypeId],
    );

    const slotStart = nextLocalDateAt(10);
    const slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000);

    const res = await request(app)
      .post('/api/v1/staff/bookings')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        play_mode: 'BYOC',
        track_type_id: trackTypeId,
        slot_start: slotStart.toISOString(),
        slot_end: slotEnd.toISOString(),
        payment_method: 'CASH',
        vehicle_ids: [],
        participants: [
          {
            guest_name: 'Khách Bị Chặn Gia Hạn',
            guest_phone: '0900000003',
            participant_type: 'WALK_IN_GUEST',
          },
        ],
      })
      .expect(201);

    const session = await staffService.startCheckIn(res.body.data.bookingId, staffUser.id);
    await AppDataSource.getRepository(Session).update(session.id, {
      status: SessionStatus.ACTIVE,
    });

    const conflictCustomer = await createTestUser({
      role: UserRole.CUSTOMER,
      full_name: 'Booking cùng track',
    });
    await AppDataSource.query(
      `INSERT INTO bookings (
         customer_id, cafe_id, track_type_id, play_mode, source, status,
         slot_start, slot_end, slot_count, payment_expires_at, snapshot, discount_amount
       )
       VALUES ($1, $2, $3, 'BYOC', 'APP', 'CONFIRMED', $4, $5, 1, NOW(), '{}'::jsonb, 0)`,
      [
        conflictCustomer.id,
        cafe.id,
        trackTypeId,
        slotEnd,
        new Date(slotEnd.getTime() + 60 * 60 * 1000),
      ],
    );

    await expect(
      staffService.proposeExtension(session.id, staffUser.id, {
        extraMinutes: 15,
        additionalFee: 10000,
        direct: true,
      }),
    ).rejects.toMatchObject({ code: 'SLOT_CONFLICT', statusCode: 409 });
  });

  it('từ chối gia hạn RENTAL nếu xe đang dùng đã được booking kế tiếp giữ', async () => {
    const slotStart = new Date(Date.now() + 9 * 60 * 60 * 1000);
    slotStart.setMinutes(0, 0, 0);
    const slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000);

    const res = await request(app)
      .post('/api/v1/staff/bookings')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        play_mode: 'RENTAL',
        track_type_id: trackTypeId,
        slot_start: slotStart.toISOString(),
        slot_end: slotEnd.toISOString(),
        payment_method: 'CASH',
        vehicle_ids: [vehicle.id],
        participants: [
          {
            guest_name: 'Khách Thuê Xe Bị Chặn Gia Hạn',
            guest_phone: '0900000005',
            participant_type: 'WALK_IN_GUEST',
          },
        ],
      })
      .expect(201);

    const session = await staffService.startCheckIn(res.body.data.bookingId, staffUser.id);
    await AppDataSource.getRepository(Session).update(session.id, {
      status: SessionStatus.ACTIVE,
    });

    const conflictCustomer = await createTestUser({
      role: UserRole.CUSTOMER,
      full_name: 'Booking giữ cùng xe',
    });
    const [conflictBooking] = await AppDataSource.query<{ id: string }[]>(
      `INSERT INTO bookings (
         customer_id, cafe_id, track_type_id, play_mode, source, status,
         slot_start, slot_end, slot_count, payment_expires_at, snapshot, discount_amount
       )
       VALUES ($1, $2, $3, 'RENTAL', 'APP', 'CONFIRMED', $4, $5, 1, NOW(), '{}'::jsonb, 0)
       RETURNING id`,
      [
        conflictCustomer.id,
        cafe.id,
        trackTypeId,
        slotEnd,
        new Date(slotEnd.getTime() + 60 * 60 * 1000),
      ],
    );
    await AppDataSource.query(
      `INSERT INTO booking_vehicles (
         booking_id, vehicle_id, hourly_rate_snapshot, rental_fee_snapshot,
         security_deposit_snapshot
       )
       VALUES ($1, $2, 100000, 100000, 0)`,
      [conflictBooking.id, vehicle.id],
    );

    await expect(
      staffService.proposeExtension(session.id, staffUser.id, {
        extraMinutes: 15,
        additionalFee: 10000,
        direct: true,
      }),
    ).rejects.toMatchObject({ code: 'SLOT_CONFLICT', statusCode: 409 });
  });

  it('từ chối nếu play_mode là RENTAL nhưng vehicle_ids trống (zod superRefine)', async () => {
    const slotStart = new Date(Date.now() + 4 * 60 * 60 * 1000);
    slotStart.setMinutes(0, 0, 0);
    const slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000);

    const body = {
      play_mode: 'RENTAL',
      track_type_id: trackTypeId,
      slot_start: slotStart.toISOString(),
      slot_end: slotEnd.toISOString(),
      payment_method: 'CASH',
      vehicle_ids: [],
      participants: [
        {
          guest_name: 'Khách Lỗi',
          guest_phone: '0911223344',
          participant_type: 'WALK_IN_GUEST',
        },
      ],
    };

    const res = await request(app)
      .post('/api/v1/staff/bookings')
      .set('Authorization', `Bearer ${staffToken}`)
      .send(body)
      .expect(400);

    expect(res.body.errors[0].message).toContain(
      'Chế độ chơi RENTAL yêu cầu chọn ít nhất 1 xe thuê',
    );
  });

  it('từ chối nếu play_mode là BYOC nhưng có chọn xe (zod superRefine)', async () => {
    const slotStart = new Date(Date.now() + 4 * 60 * 60 * 1000);
    slotStart.setMinutes(0, 0, 0);
    const slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000);

    const body = {
      play_mode: 'BYOC',
      track_type_id: trackTypeId,
      slot_start: slotStart.toISOString(),
      slot_end: slotEnd.toISOString(),
      payment_method: 'CASH',
      vehicle_ids: [vehicle.id],
      participants: [
        {
          guest_name: 'Khách Lỗi BYOC',
          guest_phone: '0911223344',
          participant_type: 'WALK_IN_GUEST',
        },
      ],
    };

    const res = await request(app)
      .post('/api/v1/staff/bookings')
      .set('Authorization', `Bearer ${staffToken}`)
      .send(body)
      .expect(400);

    expect(res.body.errors[0].message).toContain(
      'Chế độ chơi BYOC không được chọn xe của cửa hàng',
    );
  });

  it('hỗ trợ đăng ký nhiều người chơi (multi-participant): tạo 1 user chính, lưu đầy đủ BookingParticipant', async () => {
    const slotStart = new Date(Date.now() + 5 * 60 * 60 * 1000);
    slotStart.setMinutes(0, 0, 0);
    const slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000);

    const body = {
      play_mode: 'BYOC',
      track_type_id: trackTypeId,
      slot_start: slotStart.toISOString(),
      slot_end: slotEnd.toISOString(),
      payment_method: 'CASH',
      vehicle_ids: [],
      participants: [
        {
          guest_name: 'Người chịu trách nhiệm',
          guest_phone: '0999000111',
          participant_type: 'WALK_IN_GUEST',
        },
        {
          guest_name: 'Bạn chơi 1',
          guest_phone: '0999000222',
          participant_type: 'WALK_IN_GUEST',
        },
        {
          guest_name: 'Bạn chơi 2',
          guest_phone: '0999000333',
          participant_type: 'WALK_IN_GUEST',
        },
      ],
    };

    const res = await request(app)
      .post('/api/v1/staff/bookings')
      .set('Authorization', `Bearer ${staffToken}`)
      .send(body)
      .expect(201);

    // 1. Only primary participant should have User created in DB
    const userRepo = AppDataSource.getRepository(User);
    const primaryUser = await userRepo.findOne({ where: { phone: '0999000111' } });
    expect(primaryUser).toBeTruthy();

    const companion1 = await userRepo.findOne({ where: { phone: '0999000222' } });
    expect(companion1).toBeNull(); // Should NOT be created as user in database

    // 2. All 3 participants must be saved in BookingParticipant
    const bpRepo = AppDataSource.getRepository(BookingParticipant);
    const participants = await bpRepo.find({ where: { bookingId: res.body.data.bookingId } });
    expect(participants.length).toBe(3);

    const bookers = participants.filter((p) => p.participantType === BookingParticipantType.BOOKER);
    expect(bookers.length).toBe(1);
    expect(bookers[0].userId).toBe(primaryUser!.id);

    const guests = participants.filter(
      (p) => p.participantType === BookingParticipantType.WALK_IN_GUEST,
    );
    expect(guests.length).toBe(2);
    expect(guests.map((g) => g.guestName)).toContain('Bạn chơi 1');
    expect(guests.map((g) => g.guestName)).toContain('Bạn chơi 2');
  });

  it('trả về lỗi 409 conflict nếu xe đã bị trùng lịch đặt', async () => {
    const slotStart = new Date(Date.now() + 6 * 60 * 60 * 1000);
    slotStart.setMinutes(0, 0, 0);
    const slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000);

    const body = {
      play_mode: 'RENTAL',
      track_type_id: trackTypeId,
      slot_start: slotStart.toISOString(),
      slot_end: slotEnd.toISOString(),
      payment_method: 'CASH',
      vehicle_ids: [vehicle.id],
      participants: [
        {
          guest_name: 'Khách A',
          guest_phone: '0922334455',
          participant_type: 'WALK_IN_GUEST',
        },
      ],
    };

    // First booking succeeds
    await request(app)
      .post('/api/v1/staff/bookings')
      .set('Authorization', `Bearer ${staffToken}`)
      .send(body)
      .expect(201);

    // Second booking fails with 409
    const res = await request(app)
      .post('/api/v1/staff/bookings')
      .set('Authorization', `Bearer ${staffToken}`)
      .send(body)
      .expect(409);

    expect(res.body.code).toBe('SLOT_LOCKED');
  });

  it('staff tra cứu được lịch quá khứ hoặc tương lai theo ngày của đúng cơ sở', async () => {
    const customer = await createTestUser({ role: UserRole.CUSTOMER, full_name: 'Khách xem lịch' });
    const slotStart = nextLocalDateAt(10);
    const slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000);
    const booking = await AppDataSource.getRepository(Booking).save({
      customerId: customer.id,
      cafeId: cafe.id,
      trackTypeId,
      trackConfigId,
      playMode: BookingMode.BYOC,
      source: BookingSource.APP,
      status: BookingStatus.CONFIRMED,
      slotStart,
      slotEnd,
      slotCount: 1,
      paymentExpiresAt: slotEnd,
      snapshot: null,
      promotionId: null,
      customerPackageId: null,
      discountAmount: 0,
    });

    const date = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(slotStart);
    const res = await request(app)
      .get('/api/v1/staff/bookings')
      .query({ date })
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].bookingId).toBe(booking.id);
    expect(res.body.data[0].cafeId).toBe(cafe.id);
  });
});
