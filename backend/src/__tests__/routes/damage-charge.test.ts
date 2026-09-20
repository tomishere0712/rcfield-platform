import request from 'supertest';
import { app } from '../../app';
import { AppDataSource } from '../../config/database';
import { PaymentComponentStatus, PaymentComponentType, UserRole } from '../../types';
import { createTestCafe, createTestUser, generateToken } from '../helpers';

// ── Helpers ───────────────────────────────────────────────────────────────────

interface PaymentComponentRow {
  type: string;
  status: string;
  amount?: string;
  refunded_amount?: string;
}

interface LineItemSeed {
  partType: string;
  partsPrice: number;
  laborPrice: number;
}

const rentalInspectionPhotos = [
  { angle: 'FRONT', url: 'https://example.com/inspection-front.jpg' },
  { angle: 'BACK', url: 'https://example.com/inspection-back.jpg' },
  { angle: 'LEFT', url: 'https://example.com/inspection-left.jpg' },
  { angle: 'RIGHT', url: 'https://example.com/inspection-right.jpg' },
];

async function seedCheckoutScenario(opts: {
  depositAmount: number;
  lineItems?: LineItemSeed[];
  damageCostEstimate?: number;
  sessionStatus?: string;
  customerConfirmed?: boolean;
}) {
  const customer = await createTestUser({ role: UserRole.CUSTOMER });
  const staff = await createTestUser({ role: UserRole.STAFF });
  const cafe = await createTestCafe();

  const [trackType] = await AppDataSource.query(`SELECT id FROM track_types LIMIT 1`);

  const [booking] = await AppDataSource.query(
    `INSERT INTO bookings
       (customer_id, cafe_id, slot_start, slot_end, play_mode, status, source, payment_expires_at, track_type_id)
     VALUES ($1, $2, NOW() - INTERVAL '2 hours', NOW() + INTERVAL '1 hour',
             'RENTAL', 'CONFIRMED', 'APP', NOW() + INTERVAL '15 minutes', $3)
     RETURNING *`,
    [customer.id, cafe.id, trackType?.id ?? null],
  );

  await AppDataSource.query(
    `INSERT INTO payment_components (booking_id, type, amount, status)
     VALUES ($1, $2, $3, $4)`,
    [booking.id, PaymentComponentType.SECURITY_DEPOSIT, opts.depositAmount, 'HELD'],
  );

  const sessionStatus = opts.sessionStatus ?? 'CHECKING_OUT';
  const [session] = await AppDataSource.query(
    `INSERT INTO sessions (booking_id, cafe_id, status, planned_end_at, actual_start_at, checked_in_by)
     VALUES ($1, $2, $3, NOW() + INTERVAL '1 hour', NOW() - INTERVAL '1 hour', $4)
     RETURNING *`,
    [booking.id, cafe.id, sessionStatus, customer.id],
  );

  const damageNoted = (opts.lineItems?.length ?? 0) > 0 || opts.damageCostEstimate != null;
  const [inspection] = await AppDataSource.query(
    `INSERT INTO inspections
       (session_id, type, subject_type, performed_by,
       damage_noted, damage_cost_estimate, pre_existing_flag, customer_confirmed)
     VALUES ($1, 'CHECK_OUT', 'RENTAL_VEHICLE', $2, $3, $4, true, $5)
     RETURNING *`,
    [
      session.id,
      staff.id,
      damageNoted,
      opts.damageCostEstimate ?? null,
      opts.customerConfirmed ?? false,
    ],
  );

  for (const li of opts.lineItems ?? []) {
    await AppDataSource.query(
      `INSERT INTO damage_line_items (inspection_id, part_type, parts_price, labor_price)
       VALUES ($1, $2, $3, $4)`,
      [inspection.id, li.partType, li.partsPrice, li.laborPrice],
    );
  }

  return {
    staffToken: generateToken(staff),
    booking,
    session,
    inspection,
    staff,
  };
}

// ── POST /api/v1/staff/sessions/:id/inspections ────────────────────────────────

describe('POST /api/v1/staff/sessions/:id/inspections — submitInspection', () => {
  it('lưu 2 damage line items vào DB và trả về totalDamageCharge đúng', async () => {
    const staff = await createTestUser({ role: UserRole.STAFF });
    const customer = await createTestUser({ role: UserRole.CUSTOMER });
    const cafe = await createTestCafe();
    const [trackType] = await AppDataSource.query(`SELECT id FROM track_types LIMIT 1`);

    const [booking] = await AppDataSource.query(
      `INSERT INTO bookings
         (customer_id, cafe_id, slot_start, slot_end, play_mode, status, source, payment_expires_at, track_type_id)
       VALUES ($1, $2, NOW() - INTERVAL '2 hours', NOW() + INTERVAL '1 hour',
               'RENTAL', 'CONFIRMED', 'APP', NOW() + INTERVAL '1 hour', $3)
       RETURNING *`,
      [customer.id, cafe.id, trackType?.id ?? null],
    );

    const [session] = await AppDataSource.query(
      `INSERT INTO sessions (booking_id, cafe_id, status, planned_end_at, actual_start_at, checked_in_by)
       VALUES ($1, $2, 'ACTIVE', NOW() + INTERVAL '1 hour', NOW() - INTERVAL '1 hour', $3)
       RETURNING *`,
      [booking.id, cafe.id, customer.id],
    );

    const res = await request(app)
      .post(`/api/v1/staff/sessions/${session.id}/inspections`)
      .set('Authorization', `Bearer ${generateToken(staff)}`)
      .send({
        type: 'CHECK_OUT',
        photos: rentalInspectionPhotos,
        damageFlagged: true,
        damageLineItems: [
          { partType: 'TIRE_WHEEL', partsPrice: 150000, laborPrice: 50000 },
          { partType: 'SHELL', partsPrice: 80000, laborPrice: 0 },
        ],
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.damageLineItems).toHaveLength(2);
    expect(res.body.data.totalDamageCharge).toBe(280000);

    // Kiểm tra DB trực tiếp
    const rows = await AppDataSource.query(
      `SELECT * FROM damage_line_items WHERE inspection_id = $1 AND deleted_at IS NULL`,
      [res.body.data.inspectionId],
    );
    expect(rows).toHaveLength(2);
    expect(Number(rows[0].parts_price) + Number(rows[0].labor_price)).toBeGreaterThan(0);
  });

  it('session chuyển sang CHECKING_OUT sau CHECK_OUT submission', async () => {
    const staff = await createTestUser({ role: UserRole.STAFF });
    const customer = await createTestUser({ role: UserRole.CUSTOMER });
    const cafe = await createTestCafe();
    const [trackType] = await AppDataSource.query(`SELECT id FROM track_types LIMIT 1`);

    const [booking] = await AppDataSource.query(
      `INSERT INTO bookings
         (customer_id, cafe_id, slot_start, slot_end, play_mode, status, source, payment_expires_at, track_type_id)
       VALUES ($1, $2, NOW() - INTERVAL '2 hours', NOW() + INTERVAL '1 hour',
               'RENTAL', 'CONFIRMED', 'APP', NOW() + INTERVAL '1 hour', $3)
       RETURNING *`,
      [customer.id, cafe.id, trackType?.id ?? null],
    );

    const [session] = await AppDataSource.query(
      `INSERT INTO sessions (booking_id, cafe_id, status, planned_end_at, actual_start_at, checked_in_by)
       VALUES ($1, $2, 'ACTIVE', NOW() + INTERVAL '1 hour', NOW() - INTERVAL '1 hour', $3)
       RETURNING *`,
      [booking.id, cafe.id, customer.id],
    );

    await request(app)
      .post(`/api/v1/staff/sessions/${session.id}/inspections`)
      .set('Authorization', `Bearer ${generateToken(staff)}`)
      .send({
        type: 'CHECK_OUT',
        photos: rentalInspectionPhotos,
        damageFlagged: false,
        damageLineItems: [],
      })
      .expect(201);

    const [updated] = await AppDataSource.query(`SELECT status FROM sessions WHERE id = $1`, [
      session.id,
    ]);
    expect(updated.status).toBe('CHECKING_OUT');
  });

  it('từ chối partsPrice âm → 422/400', async () => {
    const staff = await createTestUser({ role: UserRole.STAFF });
    const customer = await createTestUser({ role: UserRole.CUSTOMER });
    const cafe = await createTestCafe();
    const [trackType] = await AppDataSource.query(`SELECT id FROM track_types LIMIT 1`);

    const [booking] = await AppDataSource.query(
      `INSERT INTO bookings
         (customer_id, cafe_id, slot_start, slot_end, play_mode, status, source, payment_expires_at, track_type_id)
       VALUES ($1, $2, NOW() - INTERVAL '2 hours', NOW() + INTERVAL '1 hour',
               'RENTAL', 'CONFIRMED', 'APP', NOW() + INTERVAL '1 hour', $3)
       RETURNING *`,
      [customer.id, cafe.id, trackType?.id ?? null],
    );

    const [session] = await AppDataSource.query(
      `INSERT INTO sessions (booking_id, cafe_id, status, planned_end_at, actual_start_at, checked_in_by)
       VALUES ($1, $2, 'ACTIVE', NOW() + INTERVAL '1 hour', NOW() - INTERVAL '1 hour', $3)
       RETURNING *`,
      [booking.id, cafe.id, customer.id],
    );

    const res = await request(app)
      .post(`/api/v1/staff/sessions/${session.id}/inspections`)
      .set('Authorization', `Bearer ${generateToken(staff)}`)
      .send({
        type: 'CHECK_OUT',
        damageFlagged: true,
        damageLineItems: [{ partType: 'SHELL', partsPrice: -5000, laborPrice: 0 }],
      });

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });
});

// ── POST /api/v1/staff/sessions/:id/confirm-checkout ──────────────────────────

describe('POST /api/v1/staff/sessions/:id/confirm-checkout', () => {
  it('trả thành công khi khách đã hoàn tất checkout trước lúc staff làm mới trang', async () => {
    const { staffToken, session, inspection } = await seedCheckoutScenario({
      depositAmount: 300000,
      sessionStatus: 'COMPLETED',
      customerConfirmed: true,
    });

    const res = await request(app)
      .post(`/api/v1/staff/sessions/${session.id}/confirm-checkout`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ inspectionId: inspection.id })
      .expect(200);

    expect(res.body.data).toMatchObject({
      sessionStatus: 'COMPLETED',
      alreadyCompleted: true,
    });
  });

  it('từ chối khi session không ở CHECKING_OUT', async () => {
    const { staffToken, session, inspection } = await seedCheckoutScenario({
      depositAmount: 300000,
      lineItems: [{ partType: 'TIRE_WHEEL', partsPrice: 150000, laborPrice: 50000 }],
      sessionStatus: 'ACTIVE', // sai state
    });

    const res = await request(app)
      .post(`/api/v1/staff/sessions/${session.id}/confirm-checkout`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ inspectionId: inspection.id })
      .expect(400);

    expect(res.body.code).toBe('INVALID_SESSION_STATE');
  });

  it('Scenario 1: damageCharge ≤ deposit → DAMAGE_CHARGE=DISBURSED, SECURITY_DEPOSIT=PENDING_REFUND', async () => {
    // damage = 150k+50k + 80k = 280k, deposit = 300k → deposit covers fully
    const { staffToken, session, inspection, booking } = await seedCheckoutScenario({
      depositAmount: 300000,
      lineItems: [
        { partType: 'TIRE_WHEEL', partsPrice: 150000, laborPrice: 50000 },
        { partType: 'SHELL', partsPrice: 80000, laborPrice: 0 },
      ],
    });

    const res = await request(app)
      .post(`/api/v1/staff/sessions/${session.id}/confirm-checkout`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ inspectionId: inspection.id })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.sessionStatus).toBe('COMPLETED');

    const comps = (await AppDataSource.query(
      `SELECT type, status, amount, refunded_amount FROM payment_components WHERE booking_id = $1`,
      [booking.id],
    )) as PaymentComponentRow[];
    const deposit = comps.find((c) => c.type === PaymentComponentType.SECURITY_DEPOSIT);
    const damage = comps.find((c) => c.type === PaymentComponentType.DAMAGE_CHARGE);

    expect(deposit?.status).toBe(PaymentComponentStatus.PENDING_REFUND);
    expect(Number(deposit?.refunded_amount)).toBe(20000); // 300k - 280k = 20k

    expect(damage).toBeDefined();
    expect(damage?.status).toBe(PaymentComponentStatus.DISBURSED);
    expect(Number(damage?.amount)).toBe(280000);
  });

  it('Scenario 2: damageCharge > deposit → DAMAGE_CHARGE=PENDING, SECURITY_DEPOSIT=DISBURSED', async () => {
    // damage = 350k, deposit = 200k → vượt 150k
    const { staffToken, session, inspection, booking } = await seedCheckoutScenario({
      depositAmount: 200000,
      lineItems: [{ partType: 'CHASSIS', partsPrice: 300000, laborPrice: 50000 }],
    });

    await request(app)
      .post(`/api/v1/staff/sessions/${session.id}/confirm-checkout`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ inspectionId: inspection.id })
      .expect(200);

    const comps = (await AppDataSource.query(
      `SELECT type, status, amount FROM payment_components WHERE booking_id = $1`,
      [booking.id],
    )) as PaymentComponentRow[];
    const deposit = comps.find((c) => c.type === PaymentComponentType.SECURITY_DEPOSIT);
    const damage = comps.find((c) => c.type === PaymentComponentType.DAMAGE_CHARGE);

    expect(deposit?.status).toBe(PaymentComponentStatus.DISBURSED);

    expect(damage).toBeDefined();
    expect(damage?.status).toBe(PaymentComponentStatus.PENDING);
    expect(Number(damage?.amount)).toBe(150000); // phần vượt deposit

    // Booking chuyển AWAITING_PAYMENT vì còn PENDING component
    const [bk] = await AppDataSource.query(`SELECT status FROM bookings WHERE id = $1`, [
      booking.id,
    ]);
    expect(bk.status).toBe('AWAITING_PAYMENT');
  });

  it('Scenario 3: damageCharge = 0 (không hư hỏng) → không tạo DAMAGE_CHARGE, deposit hoàn toàn bộ', async () => {
    const { staffToken, session, inspection, booking } = await seedCheckoutScenario({
      depositAmount: 300000,
      lineItems: [], // no damage
    });

    // Cập nhật inspection thành damageNoted=false (không hư hỏng thực sự)
    await AppDataSource.query(`UPDATE inspections SET damage_noted = false WHERE id = $1`, [
      inspection.id,
    ]);

    await request(app)
      .post(`/api/v1/staff/sessions/${session.id}/confirm-checkout`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ inspectionId: inspection.id })
      .expect(200);

    const comps = (await AppDataSource.query(
      `SELECT type, status, refunded_amount FROM payment_components WHERE booking_id = $1`,
      [booking.id],
    )) as PaymentComponentRow[];
    const deposit = comps.find((c) => c.type === PaymentComponentType.SECURITY_DEPOSIT);
    const damage = comps.find((c) => c.type === PaymentComponentType.DAMAGE_CHARGE);

    expect(deposit?.status).toBe(PaymentComponentStatus.PENDING_REFUND);
    expect(Number(deposit?.refunded_amount)).toBe(300000); // hoàn toàn bộ

    expect(damage).toBeUndefined();
  });

  it('Scenario legacy: damageNoted=true nhưng không có line items → không tạo damage charge (fallback đã bị xóa)', async () => {
    // Legacy record: damageNoted nhưng không có line items, có damageCostEstimate = 100k
    const { staffToken, session, inspection, booking } = await seedCheckoutScenario({
      depositAmount: 500000,
      lineItems: [], // không có line items
      damageCostEstimate: 100000, // legacy field, không còn được dùng để tính phí
    });
    // inspection.damageNoted đã được set = true trong seedCheckoutScenario khi damageCostEstimate != null

    await request(app)
      .post(`/api/v1/staff/sessions/${session.id}/confirm-checkout`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ inspectionId: inspection.id })
      .expect(200);

    const comps = (await AppDataSource.query(
      `SELECT type, status, amount FROM payment_components WHERE booking_id = $1`,
      [booking.id],
    )) as PaymentComponentRow[];
    const damage = comps.find((c) => c.type === PaymentComponentType.DAMAGE_CHARGE);

    // Sau khi xóa fallback, không có line items thì không tạo DAMAGE_CHARGE
    expect(damage).toBeUndefined();
  });

  it('session chuyển sang COMPLETED sau khi confirm', async () => {
    const { staffToken, session, inspection } = await seedCheckoutScenario({
      depositAmount: 300000,
      lineItems: [{ partType: 'MOTOR', partsPrice: 200000, laborPrice: 30000 }],
    });

    await request(app)
      .post(`/api/v1/staff/sessions/${session.id}/confirm-checkout`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ inspectionId: inspection.id })
      .expect(200);

    const [row] = await AppDataSource.query(`SELECT status FROM sessions WHERE id = $1`, [
      session.id,
    ]);
    expect(row.status).toBe('COMPLETED');
  });

  it('trả về 401 khi không có token', async () => {
    const { session, inspection } = await seedCheckoutScenario({
      depositAmount: 300000,
      lineItems: [],
    });

    await request(app)
      .post(`/api/v1/staff/sessions/${session.id}/confirm-checkout`)
      .send({ inspectionId: inspection.id })
      .expect(401);
  });
});

// ── PUT /api/v1/staff/sessions/:id/inspections/:inspId/damage-items ───────────

describe('PUT /api/v1/staff/sessions/:id/inspections/:inspId/damage-items', () => {
  it('soft-delete items cũ và tạo items mới, trả về tổng mới', async () => {
    const { staffToken, session, inspection } = await seedCheckoutScenario({
      depositAmount: 300000,
      lineItems: [
        { partType: 'TIRE_WHEEL', partsPrice: 150000, laborPrice: 50000 },
        { partType: 'SHELL', partsPrice: 80000, laborPrice: 0 },
      ],
    });

    const res = await request(app)
      .put(`/api/v1/staff/sessions/${session.id}/inspections/${inspection.id}/damage-items`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        damageLineItems: [{ partType: 'TIRE_WHEEL', partsPrice: 100000, laborPrice: 30000 }],
      })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.totalDamageCharge).toBe(130000);
    expect(res.body.data.damageLineItems).toHaveLength(1);

    // Items cũ phải có deleted_at != null
    const deleted = await AppDataSource.query(
      `SELECT * FROM damage_line_items
       WHERE inspection_id = $1 AND deleted_at IS NOT NULL`,
      [inspection.id],
    );
    expect(deleted).toHaveLength(2);

    // Items mới phải tồn tại (không bị xóa)
    const active = await AppDataSource.query(
      `SELECT * FROM damage_line_items
       WHERE inspection_id = $1 AND deleted_at IS NULL`,
      [inspection.id],
    );
    expect(active).toHaveLength(1);
    expect(Number(active[0].parts_price)).toBe(100000);
    expect(Number(active[0].labor_price)).toBe(30000);
  });

  it('chấp nhận mảng rỗng → xóa hết items, totalDamageCharge = 0', async () => {
    const { staffToken, session, inspection } = await seedCheckoutScenario({
      depositAmount: 300000,
      lineItems: [{ partType: 'MOTOR', partsPrice: 200000, laborPrice: 0 }],
    });

    const res = await request(app)
      .put(`/api/v1/staff/sessions/${session.id}/inspections/${inspection.id}/damage-items`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ damageLineItems: [] })
      .expect(200);

    expect(res.body.data.totalDamageCharge).toBe(0);
    expect(res.body.data.damageLineItems).toHaveLength(0);

    const deleted = await AppDataSource.query(
      `SELECT * FROM damage_line_items
       WHERE inspection_id = $1 AND deleted_at IS NOT NULL`,
      [inspection.id],
    );
    expect(deleted).toHaveLength(1);
  });

  it('từ chối partType=OTHER không có customPartName → 400/422', async () => {
    const { staffToken, session, inspection } = await seedCheckoutScenario({
      depositAmount: 300000,
      lineItems: [],
    });

    const res = await request(app)
      .put(`/api/v1/staff/sessions/${session.id}/inspections/${inspection.id}/damage-items`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        damageLineItems: [{ partType: 'OTHER', partsPrice: 30000 }],
      });

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });
});

/**
 * Nhãn trạng thái đơn phải nói đúng sự thật về tiền.
 *
 * Bẫy ở đây rất dễ tái phát: đường BYOC trong `submitInspection` ghi `COMPLETED`
 * vào đơn TRƯỚC khi gọi hàm tất toán — mà chính hàm đó mới sinh ra khoản gia
 * hạn, đồ ăn tại quầy và hư hỏng. Ghi trước rồi không soát lại thì đơn còn nợ
 * vẫn đeo nhãn "Hoàn thành", và khách nhìn thấy mâu thuẫn ngay trên màn hình.
 *
 * Phải đi qua ĐÚNG endpoint của khách mang xe riêng. Đường `confirm-checkout`
 * vốn đã soát lại đúng, test qua đó sẽ xanh cả khi lỗi còn nguyên.
 */
describe('BYOC checkout: nhãn trạng thái đơn phải khớp với tiền còn nợ', () => {
  async function seedByocSession(extensionFee: number | null) {
    const staff = await createTestUser({ role: UserRole.STAFF });
    const customer = await createTestUser({ role: UserRole.CUSTOMER });
    const cafe = await createTestCafe();
    const [trackType] = await AppDataSource.query(`SELECT id FROM track_types LIMIT 1`);

    const [booking] = await AppDataSource.query(
      `INSERT INTO bookings
         (customer_id, cafe_id, slot_start, slot_end, play_mode, status, source, payment_expires_at, track_type_id)
       VALUES ($1, $2, NOW() - INTERVAL '2 hours', NOW() + INTERVAL '1 hour',
               'BYOC', 'CONFIRMED', 'APP', NOW() + INTERVAL '1 hour', $3)
       RETURNING *`,
      [customer.id, cafe.id, trackType?.id ?? null],
    );

    const [session] = await AppDataSource.query(
      `INSERT INTO sessions (booking_id, cafe_id, status, planned_end_at, actual_start_at, checked_in_by)
       VALUES ($1, $2, 'ACTIVE', NOW() + INTERVAL '1 hour', NOW() - INTERVAL '1 hour', $3)
       RETURNING *`,
      [booking.id, cafe.id, staff.id],
    );

    if (extensionFee !== null) {
      await AppDataSource.query(
        `INSERT INTO extension_proposals
           (session_id, duration_minutes, fee_amount, status, proposed_by)
         VALUES ($1, 15, $2, 'APPROVED', $3)`,
        [session.id, extensionFee, staff.id],
      );
    }

    return { staffToken: generateToken(staff), booking, session };
  }

  async function checkOut(sessionId: string, token: string) {
    await request(app)
      .post(`/api/v1/staff/sessions/${sessionId}/inspections`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'CHECK_OUT',
        photos: rentalInspectionPhotos,
        damageFlagged: false,
        damageLineItems: [],
      })
      .expect(201);
  }

  async function bookingStatus(bookingId: string): Promise<string> {
    const [row] = await AppDataSource.query(`SELECT status FROM bookings WHERE id = $1`, [
      bookingId,
    ]);
    return row.status;
  }

  it('còn phí gia hạn chưa trả thì đơn là AWAITING_PAYMENT, không phải COMPLETED', async () => {
    const { staffToken, session, booking } = await seedByocSession(16000);
    await checkOut(session.id, staffToken);

    // Khoản nợ phải tồn tại thật, không phải test tự huyễn hoặc.
    const [comp] = await AppDataSource.query(
      `SELECT amount, status FROM payment_components
        WHERE booking_id = $1 AND type = $2`,
      [booking.id, PaymentComponentType.EXTENSION_FEE],
    );
    expect(comp?.status).toBe(PaymentComponentStatus.PENDING);
    expect(Number(comp.amount)).toBe(16000);

    expect(await bookingStatus(booking.id)).toBe('AWAITING_PAYMENT');
  });

  it('không phát sinh khoản nào thì đơn là COMPLETED như cũ', async () => {
    const { staffToken, session, booking } = await seedByocSession(null);
    await checkOut(session.id, staffToken);

    expect(await bookingStatus(booking.id)).toBe('COMPLETED');
  });
});
