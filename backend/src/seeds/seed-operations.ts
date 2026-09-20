import 'dotenv/config';
import 'reflect-metadata';
import { AppDataSource } from '../config/database';
import { logger } from '../config/logger';

async function seed() {
  await AppDataSource.initialize();
  logger.database('Connected');

  // 1. Get users
  const [customer] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM users WHERE email = 'customer@gmail.com'`,
  );
  const [staff] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM users WHERE email = 'staff@gmail.com'`,
  );
  const [provider] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM users WHERE email = 'provider@gmail.com'`,
  );

  if (!customer || !staff || !provider) {
    logger.error('Seed', 'Required users not found. Run seed-users.ts first.', null);
    process.exit(1);
  }

  // 2. Get cafes
  const cafes = await AppDataSource.query<{ id: string; slug: string }[]>(
    `SELECT id, slug FROM cafes`,
  );
  if (cafes.length === 0) {
    logger.error('Seed', 'No cafes found. Run seed-cafes.ts first.', null);
    process.exit(1);
  }
  const cafe = cafes.find((c) => c.slug === 'rc-arena-ha-noi') || cafes[0];

  // 3. Get vehicles
  const vehicles = await AppDataSource.query<
    {
      id: string;
      name: string;
      hourly_rate: string;
      security_deposit: string;
    }[]
  >(
    `SELECT v.id, c.name, c.hourly_rate, c.security_deposit 
     FROM vehicles v 
     JOIN vehicle_catalogs c ON v.catalog_id = c.id 
     WHERE v.cafe_id = $1 AND v.deleted_at IS NULL`,
    [cafe.id],
  );
  if (vehicles.length === 0) {
    logger.error('Seed', 'No vehicles found. Run seed-cafes.ts first.', null);
    process.exit(1);
  }

  // 4. Get menu items
  const menuItems = await AppDataSource.query<{ id: string; name: string; price: string }[]>(
    `SELECT id, name, price FROM menu_items WHERE cafe_id = $1 AND deleted_at IS NULL`,
    [cafe.id],
  );

  // 5. Get track types
  const tracks = await AppDataSource.query<{ id: string; code: string }[]>(
    `SELECT id, code FROM track_types`,
  );
  const driftTrack = tracks.find((t) => t.code === 'DRIFT') || tracks[0];
  const obstacleTrack = tracks.find((t) => t.code === 'OBSTACLE') || tracks[0];

  if (!driftTrack || !obstacleTrack) {
    logger.error('Seed', 'Track types DRIFT or OBSTACLE not found in database.', null);
    process.exit(1);
  }

  // Clear existing operations seed data to prevent duplication
  logger.info('Seed', 'Clearing existing operations seed data...');
  await AppDataSource.query(
    `DELETE FROM fnb_order_items WHERE fnb_order_id IN (SELECT id FROM fnb_orders WHERE notes LIKE '%[SEED]%')`,
  );
  await AppDataSource.query(`DELETE FROM fnb_orders WHERE notes LIKE '%[SEED]%'`);
  await AppDataSource.query(
    `DELETE FROM extension_proposals WHERE session_id IN (SELECT id FROM sessions WHERE notes LIKE '%[SEED]%')`,
  );
  await AppDataSource.query(
    `DELETE FROM inspection_checklists WHERE inspection_id IN (SELECT id FROM inspections WHERE performed_by = $1)`,
    [staff.id],
  );
  await AppDataSource.query(
    `DELETE FROM inspection_photos WHERE inspection_id IN (SELECT id FROM inspections WHERE performed_by = $1)`,
    [staff.id],
  );
  await AppDataSource.query(`DELETE FROM inspections WHERE performed_by = $1`, [staff.id]);
  await AppDataSource.query(
    `DELETE FROM session_vehicles WHERE session_id IN (SELECT id FROM sessions WHERE notes LIKE '%[SEED]%')`,
  );
  await AppDataSource.query(
    `DELETE FROM session_participants WHERE session_id IN (SELECT id FROM sessions WHERE notes LIKE '%[SEED]%')`,
  );
  await AppDataSource.query(`DELETE FROM sessions WHERE notes LIKE '%[SEED]%'`);
  await AppDataSource.query(
    `DELETE FROM booking_vehicles WHERE booking_id IN (SELECT id FROM bookings WHERE notes LIKE '%[SEED]%')`,
  );
  await AppDataSource.query(
    `DELETE FROM booking_participants WHERE booking_id IN (SELECT id FROM bookings WHERE notes LIKE '%[SEED]%')`,
  );
  await AppDataSource.query(
    `DELETE FROM payment_components WHERE booking_id IN (SELECT id FROM bookings WHERE notes LIKE '%[SEED]%')`,
  );
  await AppDataSource.query(
    `DELETE FROM vehicle_maintenance_logs WHERE description LIKE '%[SEED]%'`,
  );
  await AppDataSource.query(`DELETE FROM bookings WHERE notes LIKE '%[SEED]%'`);

  const now = new Date();

  // Helper helper to generate ISO format offset time
  const getOffsetTime = (hours: number, mins = 0) => {
    const d = new Date(now.getTime());
    d.setHours(d.getHours() + hours);
    d.setMinutes(d.getMinutes() + mins);
    return d;
  };

  logger.info('Seed', 'Inserting operational mock data...');

  // ─────────────────────────────────────────────────────────────────────────────
  // BOOKING 1: Completed Booking (Yesterday)
  // ─────────────────────────────────────────────────────────────────────────────
  const booking1Start = getOffsetTime(-26);
  const booking1End = getOffsetTime(-25);
  const v1 = vehicles[0];

  const [b1] = await AppDataSource.query<{ id: string }[]>(
    `INSERT INTO bookings (
      customer_id, cafe_id, booking_mode, source, track_type_id, status,
      slot_start, slot_end, slot_count, payment_expires_at, snapshot, notes
    ) VALUES ($1, $2, 'SINGLE', 'APP', $3, 'COMPLETED', $4, $5, 1, $6, $7, $8) RETURNING id`,
    [
      customer.id,
      cafe.id,
      driftTrack.id,
      booking1Start,
      booking1End,
      getOffsetTime(-27),
      JSON.stringify({ vehicle_name: v1.name, hourly_rate: v1.hourly_rate }),
      'Khách hàng muốn thuê xe drift mượt. [SEED]',
    ],
  );

  // Booking Vehicle
  const [bv1] = await AppDataSource.query<{ id: string }[]>(
    `INSERT INTO booking_vehicles (
      booking_id, vehicle_id, hourly_rate_snapshot, security_deposit_snapshot
    ) VALUES ($1, $2, $3, $4) RETURNING id`,
    [b1.id, v1.id, Number(v1.hourly_rate), 0],
  );

  // Booking Participant
  const [bp1] = await AppDataSource.query<{ id: string }[]>(
    `INSERT INTO booking_participants (
      booking_id, user_id, participant_type, display_name, phone, is_primary_responsible
    ) VALUES ($1, $2, 'REGISTERED_USER', 'Khách Hàng', '0912345678', true) RETURNING id`,
    [b1.id, customer.id],
  );

  // Session
  const [s1] = await AppDataSource.query<{ id: string }[]>(
    `INSERT INTO sessions (
      booking_id, cafe_id, status, checked_in_by, checked_out_by, actual_start_at, actual_end_at, planned_end_at, notes
    ) VALUES ($1, $2, 'COMPLETED', $3, $3, $4, $5, $5, $6) RETURNING id`,
    [b1.id, cafe.id, staff.id, booking1Start, booking1End, 'Session 1 completed. [SEED]'],
  );

  // Session Participant
  const [sp1] = await AppDataSource.query<{ id: string }[]>(
    `INSERT INTO session_participants (
      session_id, booking_participant_id, user_id, display_name, phone, role, is_primary_responsible, checked_in_at
    ) VALUES ($1, $2, $3, 'Khách Hàng', '0912345678', 'DRIVER', true, $4) RETURNING id`,
    [s1.id, bp1.id, customer.id, booking1Start],
  );

  // Session Vehicle
  const [sv1] = await AppDataSource.query<{ id: string }[]>(
    `INSERT INTO session_vehicles (
      session_id, booking_vehicle_id, vehicle_source, vehicle_id, assigned_to_participant_id, status, started_at, returned_at
    ) VALUES ($1, $2, 'RENTAL', $3, $4, 'RETURNED', $5, $6) RETURNING id`,
    [s1.id, bv1.id, v1.id, sp1.id, booking1Start, booking1End],
  );

  // Seed Inspection Check-in
  const [insp1Checkin] = await AppDataSource.query<{ id: string }[]>(
    `INSERT INTO inspections (
      session_id, session_vehicle_id, type, subject_type, performed_by, pre_existing_flag, damage_noted
    ) VALUES ($1, $2, 'CHECK_IN', 'RENTAL_VEHICLE', $3, false, false) RETURNING id`,
    [s1.id, sv1.id, staff.id],
  );

  await AppDataSource.query(
    `INSERT INTO inspection_checklists (inspection_id, item_key, item_label, status, note) VALUES
     ($1, 'tires', 'Lốp xe', 'OK', ''),
     ($1, 'battery', 'Pin', 'OK', ''),
     ($1, 'shell', 'Vỏ xe', 'OK', '')`,
    [insp1Checkin.id],
  );

  // Seed Inspection Check-out
  const [insp1Checkout] = await AppDataSource.query<{ id: string }[]>(
    `INSERT INTO inspections (
      session_id, session_vehicle_id, type, subject_type, performed_by, pre_existing_flag, damage_noted, customer_confirmed
    ) VALUES ($1, $2, 'CHECK_OUT', 'RENTAL_VEHICLE', $3, false, false, true) RETURNING id`,
    [s1.id, sv1.id, staff.id],
  );

  await AppDataSource.query(
    `INSERT INTO inspection_checklists (inspection_id, item_key, item_label, status, note) VALUES
     ($1, 'tires', 'Lốp xe', 'OK', ''),
     ($1, 'battery', 'Pin', 'OK', ''),
     ($1, 'shell', 'Vỏ xe', 'OK', '')`,
    [insp1Checkout.id],
  );

  // Seed F&B order for Booking 1
  if (menuItems.length > 0) {
    const fnb1 = menuItems[0];
    const qty = 2;
    const itemTotal = Number(fnb1.price) * qty;

    const [order1] = await AppDataSource.query<{ id: string }[]>(
      `INSERT INTO fnb_orders (
        booking_id, session_id, order_type, status, total_amount, created_by, confirmed_by, confirmed_at, notes
      ) VALUES ($1, $2, 'ON_SITE', 'DELIVERED', $3, $4, $5, $6, $7) RETURNING id`,
      [b1.id, s1.id, itemTotal, customer.id, staff.id, booking1Start, 'Giao đá lạnh nhiều. [SEED]'],
    );

    await AppDataSource.query(
      `INSERT INTO fnb_order_items (
        fnb_order_id, menu_item_id, quantity, unit_price, subtotal
      ) VALUES ($1, $2, $3, $4, $5)`,
      [order1.id, fnb1.id, qty, fnb1.price, itemTotal],
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // BOOKING 2: Currently Active Session (with pending extension and active logs)
  // ─────────────────────────────────────────────────────────────────────────────
  const booking2Start = getOffsetTime(-1, 30); // 1h30 ago
  const booking2End = getOffsetTime(0, 30); // expires 30m later
  const v2 = vehicles[1] || vehicles[0];

  const [b2] = await AppDataSource.query<{ id: string }[]>(
    `INSERT INTO bookings (
      customer_id, cafe_id, booking_mode, source, track_type_id, status,
      slot_start, slot_end, slot_count, payment_expires_at, snapshot, notes
    ) VALUES ($1, $2, 'SINGLE', 'APP', $3, 'CONFIRMED', $4, $5, 2, $6, $7, $8) RETURNING id`,
    [
      customer.id,
      cafe.id,
      obstacleTrack.id,
      booking2Start,
      booking2End,
      getOffsetTime(-2),
      JSON.stringify({ vehicle_name: v2.name, hourly_rate: v2.hourly_rate }),
      'Khách hàng mang theo pin dự phòng. [SEED]',
    ],
  );

  // Booking Vehicle
  const [bv2] = await AppDataSource.query<{ id: string }[]>(
    `INSERT INTO booking_vehicles (
      booking_id, vehicle_id, hourly_rate_snapshot, security_deposit_snapshot
    ) VALUES ($1, $2, $3, $4) RETURNING id`,
    [b2.id, v2.id, Number(v2.hourly_rate), 0],
  );

  // Booking Participant
  const [bp2] = await AppDataSource.query<{ id: string }[]>(
    `INSERT INTO booking_participants (
      booking_id, user_id, participant_type, display_name, phone, is_primary_responsible
    ) VALUES ($1, $2, 'REGISTERED_USER', 'Khách Hàng', '0912345678', true) RETURNING id`,
    [b2.id, customer.id],
  );

  // Active Session
  const [s2] = await AppDataSource.query<{ id: string }[]>(
    `INSERT INTO sessions (
      booking_id, cafe_id, status, checked_in_by, actual_start_at, planned_end_at, notes
    ) VALUES ($1, $2, 'ACTIVE', $3, $4, $5, $6) RETURNING id`,
    [b2.id, cafe.id, staff.id, booking2Start, booking2End, 'Đang đua tập trung. [SEED]'],
  );

  // Session Participant
  const [sp2] = await AppDataSource.query<{ id: string }[]>(
    `INSERT INTO session_participants (
      session_id, booking_participant_id, user_id, display_name, phone, role, is_primary_responsible, checked_in_at
    ) VALUES ($1, $2, $3, 'Khách Hàng', '0912345678', 'DRIVER', true, $4) RETURNING id`,
    [s2.id, bp2.id, customer.id, booking2Start],
  );

  // Session Vehicle
  const [sv2] = await AppDataSource.query<{ id: string }[]>(
    `INSERT INTO session_vehicles (
      session_id, booking_vehicle_id, vehicle_source, vehicle_id, assigned_to_participant_id, status, started_at
    ) VALUES ($1, $2, 'RENTAL', $3, $4, 'IN_USE', $5) RETURNING id`,
    [s2.id, bv2.id, v2.id, sp2.id, booking2Start],
  );

  // Check-in completed
  const [insp2Checkin] = await AppDataSource.query<{ id: string }[]>(
    `INSERT INTO inspections (
      session_id, session_vehicle_id, type, subject_type, performed_by, pre_existing_flag, damage_noted
    ) VALUES ($1, $2, 'CHECK_IN', 'RENTAL_VEHICLE', $3, true, false) RETURNING id`,
    [s2.id, sv2.id, staff.id],
  );

  await AppDataSource.query(
    `INSERT INTO inspection_checklists (inspection_id, item_key, item_label, status, note) VALUES
     ($1, 'tires', 'Lốp xe', 'OK', ''),
     ($1, 'battery', 'Pin', 'OK', ''),
     ($1, 'shell', 'Vỏ xe', 'SCRATCHED', 'Vết trầy xước nhẹ mui xe')`,
    [insp2Checkin.id],
  );

  // Pending Extension Proposal
  await AppDataSource.query(
    `INSERT INTO extension_proposals (
      session_id, proposed_by, duration_minutes, fee_amount, status
    ) VALUES ($1, $2, $3, $4, 'PENDING')`,
    [s2.id, customer.id, 30, Number(v2.hourly_rate) * 0.5],
  );

  // F&B order pending
  if (menuItems.length > 1) {
    const fnb2 = menuItems[1];
    const qty = 1;

    const [order2] = await AppDataSource.query<{ id: string }[]>(
      `INSERT INTO fnb_orders (
        booking_id, session_id, order_type, status, total_amount, created_by, notes
      ) VALUES ($1, $2, 'ON_SITE', 'PENDING', $3, $4, $5) RETURNING id`,
      [b2.id, s2.id, fnb2.price, customer.id, 'Ít đường sữa. [SEED]'],
    );

    await AppDataSource.query(
      `INSERT INTO fnb_order_items (
        fnb_order_id, menu_item_id, quantity, unit_price, subtotal
      ) VALUES ($1, $2, $3, $4, $5)`,
      [order2.id, fnb2.id, qty, fnb2.price, Number(fnb2.price) * qty],
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // BOOKING 3: Disputed Session (Crash incident & damage log)
  // ─────────────────────────────────────────────────────────────────────────────
  const booking3Start = getOffsetTime(-5);
  const booking3End = getOffsetTime(-4);
  const v3 = vehicles[2] || vehicles[0];

  const [b3] = await AppDataSource.query<{ id: string }[]>(
    `INSERT INTO bookings (
      customer_id, cafe_id, booking_mode, source, track_type_id, status,
      slot_start, slot_end, slot_count, payment_expires_at, snapshot, notes
    ) VALUES ($1, $2, 'SINGLE', 'APP', $3, 'COMPLETED', $4, $5, 1, $6, $7, $8) RETURNING id`,
    [
      customer.id,
      cafe.id,
      driftTrack.id,
      booking3Start,
      booking3End,
      getOffsetTime(-6),
      JSON.stringify({ vehicle_name: v3.name, hourly_rate: v3.hourly_rate }),
      'Yêu cầu xe có led gầm. [SEED]',
    ],
  );

  // Booking Vehicle
  const [bv3] = await AppDataSource.query<{ id: string }[]>(
    `INSERT INTO booking_vehicles (
      booking_id, vehicle_id, hourly_rate_snapshot, security_deposit_snapshot
    ) VALUES ($1, $2, $3, $4) RETURNING id`,
    [b3.id, v3.id, Number(v3.hourly_rate), 0],
  );

  // Booking Participant
  const [bp3] = await AppDataSource.query<{ id: string }[]>(
    `INSERT INTO booking_participants (
      booking_id, user_id, participant_type, display_name, phone, is_primary_responsible
    ) VALUES ($1, $2, 'REGISTERED_USER', 'Khách Hàng', '0912345678', true) RETURNING id`,
    [b3.id, customer.id],
  );

  // Checking out / Disputed session
  const [s3] = await AppDataSource.query<{ id: string }[]>(
    `INSERT INTO sessions (
      booking_id, cafe_id, status, checked_in_by, actual_start_at, planned_end_at, notes
    ) VALUES ($1, $2, 'CHECKING_OUT', $3, $4, $5, $6) RETURNING id`,
    [b3.id, cafe.id, staff.id, booking3Start, booking3End, 'Gặp tai nạn hỏng hóc xe. [SEED]'],
  );

  // Session Participant
  const [sp3] = await AppDataSource.query<{ id: string }[]>(
    `INSERT INTO session_participants (
      session_id, booking_participant_id, user_id, display_name, phone, role, is_primary_responsible, checked_in_at
    ) VALUES ($1, $2, $3, 'Khách Hàng', '0912345678', 'DRIVER', true, $4) RETURNING id`,
    [s3.id, bp3.id, customer.id, booking3Start],
  );

  // Session Vehicle
  const [sv3] = await AppDataSource.query<{ id: string }[]>(
    `INSERT INTO session_vehicles (
      session_id, booking_vehicle_id, vehicle_source, vehicle_id, assigned_to_participant_id, status, started_at, returned_at
    ) VALUES ($1, $2, 'RENTAL', $3, $4, 'DAMAGED', $5, $6) RETURNING id`,
    [s3.id, bv3.id, v3.id, sp3.id, booking3Start, booking3End],
  );

  // Check-in OK
  const [insp3Checkin] = await AppDataSource.query<{ id: string }[]>(
    `INSERT INTO inspections (
      session_id, session_vehicle_id, type, subject_type, performed_by, pre_existing_flag, damage_noted
    ) VALUES ($1, $2, 'CHECK_IN', 'RENTAL_VEHICLE', $3, false, false) RETURNING id`,
    [s3.id, sv3.id, staff.id],
  );

  await AppDataSource.query(
    `INSERT INTO inspection_checklists (inspection_id, item_key, item_label, status, note) VALUES
     ($1, 'tires', 'Lốp xe', 'OK', ''),
     ($1, 'battery', 'Pin', 'OK', ''),
     ($1, 'shell', 'Vỏ xe', 'OK', '')`,
    [insp3Checkin.id],
  );

  // Check-out DAMAGED
  const [insp3Checkout] = await AppDataSource.query<{ id: string }[]>(
    `INSERT INTO inspections (
      session_id, session_vehicle_id, type, subject_type, performed_by, pre_existing_flag, damage_noted, damage_description, damage_cost_estimate
    ) VALUES ($1, $2, 'CHECK_OUT', 'RENTAL_VEHICLE', $3, false, true, $4, 250000) RETURNING id`,
    [s3.id, sv3.id, staff.id, 'Va chạm mạnh vào thành chắn khúc cua 3 gây gãy nẹp cản trước.'],
  );

  await AppDataSource.query(
    `INSERT INTO inspection_checklists (inspection_id, item_key, item_label, status, note) VALUES
     ($1, 'tires', 'Lốp xe', 'OK', ''),
     ($1, 'battery', 'Pin', 'OK', ''),
     ($1, 'shell', 'Vỏ xe', 'BROKEN', 'Bể cản trước nhựa ABS')`,
    [insp3Checkout.id],
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // BOOKING 4: Confirmed upcoming Single Booking (In 2 Hours)
  // ─────────────────────────────────────────────────────────────────────────────
  const booking4Start = getOffsetTime(2);
  const booking4End = getOffsetTime(3);
  const v4 = vehicles[0];

  const [b4] = await AppDataSource.query<{ id: string }[]>(
    `INSERT INTO bookings (
      customer_id, cafe_id, booking_mode, source, track_type_id, status,
      slot_start, slot_end, slot_count, payment_expires_at, snapshot, notes
    ) VALUES ($1, $2, 'SINGLE', 'APP', $3, 'CONFIRMED', $4, $5, 1, $6, $7, $8) RETURNING id`,
    [
      customer.id,
      cafe.id,
      driftTrack.id,
      booking4Start,
      booking4End,
      getOffsetTime(1),
      JSON.stringify({ vehicle_name: v4.name, hourly_rate: v4.hourly_rate }),
      'Khách hàng thân thiết cần sạc pin đầy 100%. [SEED]',
    ],
  );

  await AppDataSource.query(
    `INSERT INTO booking_vehicles (
      booking_id, vehicle_id, hourly_rate_snapshot, security_deposit_snapshot
    ) VALUES ($1, $2, $3, $4)`,
    [b4.id, v4.id, Number(v4.hourly_rate), 0],
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // BOOKING 5: Confirmed upcoming BYOC booking (In 1 Hour)
  // ─────────────────────────────────────────────────────────────────────────────
  const booking5Start = getOffsetTime(1);
  const booking5End = getOffsetTime(2);

  await AppDataSource.query(
    `INSERT INTO bookings (
      customer_id, cafe_id, booking_mode, source, track_type_id, status,
      slot_start, slot_end, slot_count, payment_expires_at, snapshot, play_mode, notes
    ) VALUES ($1, $2, 'SINGLE', 'APP', $3, 'CONFIRMED', $4, $5, 1, $6, $7, 'BYOC', $8)`,
    [
      customer.id,
      cafe.id,
      driftTrack.id,
      booking5Start,
      booking5End,
      getOffsetTime(0, 30),
      JSON.stringify({ byoc_fee: 50000 }),
      'Khách tự mang xe Tamiya custom. [SEED]',
    ],
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // VEHICLE MAINTENANCE LOGS
  // ─────────────────────────────────────────────────────────────────────────────
  const vMaint = vehicles[2] || vehicles[0];
  await AppDataSource.query(
    `INSERT INTO vehicle_maintenance_logs (
      vehicle_id, type, description, cost, performed_by, performed_at, next_scheduled_at
    ) VALUES ($1, 'REPAIR', $2, 150000, $3, $4, $5)`,
    [
      vMaint.id,
      'Thay bánh răng hộp số nhựa bằng bánh răng thép hợp kim cường lực. [SEED]',
      staff.id,
      getOffsetTime(-48),
      getOffsetTime(720),
    ],
  );

  await AppDataSource.query(
    `INSERT INTO vehicle_maintenance_logs (
      vehicle_id, type, description, cost, performed_by, performed_at
    ) VALUES ($1, 'INSPECTION', $2, 0, $3, $4)`,
    [
      vMaint.id,
      'Kiểm tra định kỳ bộ nhận tín hiệu RX và độ rơ lốp. [SEED]',
      staff.id,
      getOffsetTime(-12),
    ],
  );

  await AppDataSource.destroy();
  logger.info('Seed', '─────────────────────────────────────────────');
  logger.info('Seed', 'Simulated Operational Data Seed Completed successfully.');
  logger.info('Seed', '─────────────────────────────────────────────');
}

seed().catch((err) => {
  logger.error('Seed', 'Failed seeding operations', err);
  process.exit(1);
});
