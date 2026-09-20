import 'dotenv/config';
import 'reflect-metadata';
import { AppDataSource } from '../config/database';
import { User } from '../models/user.entity';
import { Booking } from '../models/booking.entity';
import { Session } from '../models/session.entity';
import { Vehicle } from '../models/vehicle.entity';
import { VehicleStatus } from '../types';
import * as staffService from '../services/staff.service';

const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const CYAN = '\x1b[36m';
const DIM = '\x1b[2m';

function print(message: string, ...args: unknown[]) {
  let formatted = message;
  for (const arg of args) {
    if (typeof arg === 'object') {
      formatted += ' ' + JSON.stringify(arg, null, 2);
    } else {
      formatted += ' ' + String(arg);
    }
  }
  process.stdout.write(formatted + '\n');
}

function printError(message: string, ...args: unknown[]) {
  let formatted = message;
  for (const arg of args) {
    if (typeof arg === 'object') {
      formatted += ' ' + JSON.stringify(arg, null, 2);
    } else {
      formatted += ' ' + String(arg);
    }
  }
  process.stderr.write(formatted + '\n');
}

let createdBookingId: string | null = null;
const touchedVehicleStatuses = new Map<string, VehicleStatus>();

function assertEqual(label: string, actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

async function rememberVehicleStatus(vehicle: Vehicle | null | undefined): Promise<void> {
  if (vehicle && !touchedVehicleStatuses.has(vehicle.id)) {
    touchedVehicleStatuses.set(vehicle.id, vehicle.status);
  }
}

async function loadSession(sessionId: string): Promise<Session> {
  const session = await AppDataSource.getRepository(Session).findOne({ where: { id: sessionId } });
  if (!session) {
    throw new Error(`Session ${sessionId} not found`);
  }
  return session;
}

async function cleanupTestBooking(bookingId: string): Promise<void> {
  const ds = AppDataSource;

  await ds.query(
    `DELETE FROM fnb_order_items WHERE fnb_order_id IN (SELECT id FROM fnb_orders WHERE booking_id = $1)`,
    [bookingId],
  );
  await ds.query(`DELETE FROM fnb_orders WHERE booking_id = $1`, [bookingId]);

  const sessionIds = await ds.query<{ id: string }[]>(
    `SELECT id FROM sessions WHERE booking_id = $1`,
    [bookingId],
  );
  for (const s of sessionIds) {
    const inspIds = await ds.query<{ id: string }[]>(
      `SELECT id FROM inspections WHERE session_id = $1`,
      [s.id],
    );
    for (const insp of inspIds) {
      await ds.query(`DELETE FROM inspection_checklists WHERE inspection_id = $1`, [insp.id]);
      await ds.query(`DELETE FROM inspection_photos WHERE inspection_id = $1`, [insp.id]);
    }
    await ds.query(`DELETE FROM inspections WHERE session_id = $1`, [s.id]);
    await ds.query(`DELETE FROM extension_proposals WHERE session_id = $1`, [s.id]);
    await ds.query(`DELETE FROM session_vehicles WHERE session_id = $1`, [s.id]);
    await ds.query(`DELETE FROM session_participants WHERE session_id = $1`, [s.id]);
  }
  await ds.query(`DELETE FROM sessions WHERE booking_id = $1`, [bookingId]);
  await ds.query(`DELETE FROM booking_vehicles WHERE booking_id = $1`, [bookingId]);
  await ds.query(`DELETE FROM booking_participants WHERE booking_id = $1`, [bookingId]);
  await ds.query(`DELETE FROM payment_transactions WHERE booking_id = $1`, [bookingId]);
  await ds.query(`DELETE FROM payment_components WHERE booking_id = $1`, [bookingId]);
  await ds.query(`DELETE FROM bookings WHERE id = $1`, [bookingId]);

  for (const [vehicleId, status] of touchedVehicleStatuses) {
    await ds.getRepository(Vehicle).update(vehicleId, { status });
  }
  touchedVehicleStatuses.clear();

  print(`${DIM}[Cleanup] Test booking and touched vehicle states restored.${RESET}\n`);
}

async function main() {
  print(
    `\n${BOLD}${CYAN}=== STARTING STAFF-CUSTOMER REAL SESSION FLOW INTEGRATION TEST ===${RESET}\n`,
  );

  await AppDataSource.initialize();
  const ds = AppDataSource;

  const staff = await ds.getRepository(User).findOne({ where: { email: 'staff@gmail.com' } });
  if (!staff) {
    printError(`${RED}staff@gmail.com not found.${RESET}`);
    process.exit(1);
  }

  const [assignment] = await ds.query<{ cafe_id: string }[]>(
    `SELECT cafe_id FROM staff_cafe_assignments WHERE staff_id = $1`,
    [staff.id],
  );
  if (!assignment) {
    printError(`${RED}No cafe assignment found for staff user.${RESET}`);
    process.exit(1);
  }
  const cafeId = assignment.cafe_id;
  print(`[1] Staff: ${BOLD}${staff.full_name}${RESET}  Cafe: ${DIM}${cafeId}${RESET}`);

  print(`[2] Creating a fresh test booking...`);
  const [customer] = await ds.query<{ id: string }[]>(
    `SELECT id FROM users WHERE email = 'customer@gmail.com'`,
  );
  if (!customer) {
    printError(`${RED}customer@gmail.com not found.${RESET}`);
    process.exit(1);
  }

  const [track] = await ds.query<{ id: string }[]>(`SELECT id FROM track_types LIMIT 1`);
  if (!track) {
    printError(`${RED}No track types found. Run migrations.${RESET}`);
    process.exit(1);
  }

  const testVehicle = await ds
    .getRepository(Vehicle)
    .createQueryBuilder('v')
    .where('v.cafeId = :cafeId', { cafeId })
    .andWhere('v.status = :status', { status: VehicleStatus.AVAILABLE })
    .getOne();
  await rememberVehicleStatus(testVehicle);

  const slotStart = new Date();
  const slotEnd = new Date(Date.now() + 2 * 3600000);

  const [freshBooking] = await ds.query<{ id: string }[]>(
    `INSERT INTO bookings (cafe_id, customer_id, track_type_id, play_mode, status, slot_start, slot_end, slot_count, payment_expires_at, notes)
     VALUES ($1, $2, $3, 'RENTAL', 'CONFIRMED', $4, $5, 4, $6, '[TEST] Staff-Customer Real Flow')
     RETURNING id`,
    [cafeId, customer.id, track.id, slotStart, slotEnd, slotEnd],
  );
  const bookingId = freshBooking.id;
  createdBookingId = bookingId;
  print(`[3] Test booking created: ${BOLD}${bookingId}${RESET}`);

  await ds.query(
    `INSERT INTO booking_participants (booking_id, user_id, participant_type, is_primary_responsible) VALUES ($1, $2, 'BOOKER', true)`,
    [bookingId, customer.id],
  );

  let vehicleId: string | null = null;
  if (testVehicle) {
    await ds.query(
      `INSERT INTO booking_vehicles (booking_id, vehicle_id, hourly_rate_snapshot, security_deposit_snapshot)
       VALUES ($1, $2, 100000, 0)`,
      [bookingId, testVehicle.id],
    );
    vehicleId = testVehicle.id;
    print(`[4] Assigned vehicle: ${DIM}${vehicleId}${RESET}`);
  } else {
    print(
      `${YELLOW}[4] No AVAILABLE vehicles at this cafe - rental vehicle steps will run without assigned fleet.${RESET}`,
    );
  }

  print(`\n${BOLD}[STEP 5] Staff starts check-in...${RESET}`);
  const session = await staffService.startCheckIn(bookingId, staff.id);
  assertEqual('Initial session status', session.status, 'CHECKED_IN');
  print(
    `${GREEN}✓ Session created. ID: ${BOLD}${session.id}${RESET}  Status: ${BOLD}${session.status}${RESET}`,
  );

  print(`\n${BOLD}[STEP 6] Staff submits check-in inspection...${RESET}`);
  const checkInInspection = await staffService.submitInspection(session.id, staff.id, {
    type: 'CHECK_IN',
    photos: [
      { angle: 'FRONT', url: 'https://images.unsplash.com/front.jpg', notes: 'Front angle clear.' },
      { angle: 'BACK', url: 'https://images.unsplash.com/back.jpg', notes: 'Back angle clear.' },
    ],
    checklist: [
      { itemKey: 'battery', itemLabel: 'Pin sạc đầy', status: 'OK', note: '100% sạc' },
      { itemKey: 'wheels', itemLabel: 'Lốp drift', status: 'OK', note: 'Đã tra dầu' },
    ],
    staffNotes: 'Mọi thứ trong trạng thái hoàn hảo.',
    damageFlagged: false,
  });
  print(`${GREEN}✓ Check-in inspection submitted. ID: ${BOLD}${checkInInspection.id}${RESET}`);

  print(`\n${BOLD}[STEP 7] Verify check-in is auto-confirmed...${RESET}`);
  const activeSession = await loadSession(session.id);
  assertEqual(
    'Session status after check-in inspection submission',
    activeSession.status,
    'ACTIVE',
  );
  print(`${GREEN}✓ Session is now auto-confirmed and ${BOLD}${activeSession.status}${RESET}`);

  print(`\n${BOLD}[STEP 8] Staff proposes 30-minute extension...${RESET}`);
  const extension = await staffService.proposeExtension(session.id, staff.id, {
    extraMinutes: 30,
    additionalFee: 75000,
  });
  assertEqual('Extension proposal status', extension.status, 'PENDING');
  print(
    `${GREEN}✓ Extension proposed. ID: ${BOLD}${extension.id}${RESET}  Status: ${BOLD}${extension.status}${RESET}`,
  );

  print(`\n${BOLD}[STEP 9] Customer approves extension...${RESET}`);
  const extensionResponse = await staffService.customerRespondExtension(
    session.id,
    customer.id,
    true,
  );
  assertEqual('Customer extension response status', extensionResponse.sessionStatus, 'ACTIVE');
  const extendedSession = await loadSession(session.id);
  assertEqual('Session status after customer extension response', extendedSession.status, 'ACTIVE');
  print(
    `${GREEN}✓ Customer approved. New planned end: ${BOLD}${extendedSession.plannedEndAt.toISOString()}${RESET}`,
  );

  print(`\n${BOLD}[STEP 10] Staff adds on-site F&B order...${RESET}`);
  const [menuItem] = await ds.query<{ id: string }[]>(
    `SELECT id FROM menu_items
     WHERE cafe_id = $1 AND is_available = true AND deleted_at IS NULL
     ORDER BY created_at ASC
     LIMIT 1`,
    [cafeId],
  );
  if (menuItem) {
    const fnbOrder = await staffService.addSessionFnbOrder(session.id, staff.id, {
      items: [{ menu_item_id: menuItem.id, quantity: 2 }],
    });
    print(
      `${GREEN}✓ F&B order placed. ID: ${BOLD}${fnbOrder.id}${RESET}  Total: ${BOLD}${Number(fnbOrder.totalAmount).toLocaleString()} VND${RESET}`,
    );
  } else {
    print(`${YELLOW}Skipped - no available menu item found for cafe ${cafeId}.${RESET}`);
  }

  print(`\n${BOLD}[STEP 11] Staff swaps vehicle if another available unit exists...${RESET}`);
  if (!vehicleId) {
    print(`${YELLOW}Skipped - no vehicle was assigned at start.${RESET}`);
  } else {
    const swapVehicle = await ds
      .getRepository(Vehicle)
      .createQueryBuilder('v')
      .where('v.cafeId = :cafeId', { cafeId })
      .andWhere('v.status = :status', { status: VehicleStatus.AVAILABLE })
      .andWhere('v.id != :old', { old: vehicleId })
      .getOne();

    if (!swapVehicle) {
      print(`${YELLOW}Skipped - no other AVAILABLE vehicle found.${RESET}`);
    } else {
      await rememberVehicleStatus(swapVehicle);
      await staffService.swapSessionVehicle(
        session.id,
        vehicleId,
        swapVehicle.id,
        VehicleStatus.MAINTENANCE,
        staff.id,
      );
      print(
        `${GREEN}✓ Swapped ${DIM}${vehicleId}${RESET}${GREEN} -> ${BOLD}${swapVehicle.id}${RESET}`,
      );
    }
  }

  print(`\n${BOLD}[STEP 12] Staff submits check-out inspection with damage flag...${RESET}`);
  const checkOutInspection = await staffService.submitInspection(session.id, staff.id, {
    type: 'CHECK_OUT',
    photos: [
      {
        angle: 'FRONT',
        url: 'https://images.unsplash.com/front-damaged.jpg',
        notes: 'Front damage visible.',
      },
    ],
    checklist: [
      { itemKey: 'battery', itemLabel: 'Pin sạc đầy', status: 'OK', note: 'Còn 40%' },
      { itemKey: 'wheels', itemLabel: 'Lốp drift', status: 'BROKEN', note: 'Vỡ vành bánh trước' },
    ],
    staffNotes: 'Khách đâm vào dải phân cách gây mẻ vành.',
    damageFlagged: true,
    damageDetails: {
      description: 'Vỡ vành bánh trước bên trái',
      estimatedCost: 100000,
      finalCharge: 150000,
    },
  });
  print(`${GREEN}✓ Check-out inspection submitted. ID: ${BOLD}${checkOutInspection.id}${RESET}`);

  print(`\n${BOLD}[STEP 13] Customer confirms check-out inspection...${RESET}`);
  const checkOutResponse = await staffService.customerConfirmInspection(
    session.id,
    checkOutInspection.id,
    customer.id,
    true,
  );
  assertEqual('Customer check-out response status', checkOutResponse.sessionStatus, 'COMPLETED');
  const completedSession = await loadSession(session.id);
  assertEqual(
    'Session status after customer check-out confirmation',
    completedSession.status,
    'COMPLETED',
  );
  print(`${GREEN}✓ Customer confirmed. Session status: ${BOLD}${completedSession.status}${RESET}`);

  print(`\n${BOLD}[STEP 14] Staff settles pending payments at counter...${RESET}`);
  await staffService.settlePendingPayments(bookingId, staff.id);
  print(`${GREEN}✓ Counter payments settled successfully.${RESET}`);

  const finalBooking = await ds.getRepository(Booking).findOne({ where: { id: bookingId } });
  const finalSession = await ds.getRepository(Session).findOne({ where: { id: session.id } });
  assertEqual('Final session status', finalSession?.status, 'COMPLETED');
  assertEqual('Final booking status', finalBooking?.status, 'COMPLETED');

  print(`\n${BOLD}${GREEN}═══════════════════════════════════════════════${RESET}`);
  print(`${BOLD}${GREEN}  ✓ STAFF-CUSTOMER REAL FLOW PASSED${RESET}`);
  print(`${BOLD}${GREEN}═══════════════════════════════════════════════${RESET}`);
  print(`  Session Status  : ${BOLD}${finalSession?.status ?? 'N/A'}${RESET}`);
  print(`  Booking Status  : ${BOLD}${finalBooking?.status ?? 'N/A'}${RESET}`);
  print(
    `  Actual Total    : ${BOLD}${Number(finalSession?.actualTotalAmount ?? 0).toLocaleString()} VND${RESET}`,
  );
  print('');

  await cleanupTestBooking(bookingId);
  createdBookingId = null;
  await ds.destroy();
}

main().catch(async (err) => {
  printError(
    `\n${RED}Test failed with error:${RESET}`,
    err instanceof Error ? err.stack || err.message : err,
  );

  if (AppDataSource.isInitialized) {
    if (createdBookingId) {
      try {
        await cleanupTestBooking(createdBookingId);
      } catch (cleanupErr) {
        printError(`${RED}Cleanup failed:${RESET}`, cleanupErr);
      }
    }
    await AppDataSource.destroy();
  }

  process.exit(1);
});
