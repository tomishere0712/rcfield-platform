/* eslint-disable no-console */
/**
 * Reset all booking-related data for dev testing.
 * Preserves: users, cafes, vehicles, catalogs, menu items, track configs.
 * Deletes: bookings, booking_vehicles, booking_participants, fnb_orders,
 *          fnb_order_items, payment_requests, payment_components,
 *          payment_transactions, and Redis slot locks.
 *
 * Usage:
 *   npx ts-node --transpile-only src/scripts/reset-bookings.ts
 *   npx ts-node --transpile-only src/scripts/reset-bookings.ts --keep-users
 */
import 'dotenv/config';
import 'reflect-metadata';
import { AppDataSource } from '../config/database';
import { redis } from '../config/redis';
import { logger } from '../config/logger';

async function resetBookings() {
  await AppDataSource.initialize();

  const q = AppDataSource.query.bind(AppDataSource);

  logger.info('Reset', 'Deleting booking-related data...');

  // Delete in FK-safe order
  await q(`DELETE FROM notifications`);
  await q(`DELETE FROM inspections`);
  await q(`DELETE FROM extension_proposals`);
  await q(`DELETE FROM fnb_order_items`);
  await q(`DELETE FROM fnb_orders`);
  await q(`DELETE FROM session_vehicles`);
  await q(`DELETE FROM sessions`);
  await q(`DELETE FROM booking_vehicles`);
  await q(`DELETE FROM booking_participants`);
  await q(`DELETE FROM payment_transactions`);
  await q(`DELETE FROM payment_components`);
  await q(`DELETE FROM payment_requests`);
  await q(`DELETE FROM bookings`);

  logger.info('Reset', 'Cleared all booking tables');

  // Clear Redis slot locks (pattern: slot:* and byoc:*)
  const slotKeys = await redis.keys('slot:*');
  const byocKeys = await redis.keys('byoc:*');
  const lockKeys = await redis.keys('lock:*');
  const allKeys = [...slotKeys, ...byocKeys, ...lockKeys];

  if (allKeys.length > 0) {
    await redis.del(allKeys);
    logger.info('Reset', `Cleared ${allKeys.length} Redis keys`);
  } else {
    logger.info('Reset', 'No Redis keys to clear');
  }

  // Print current counts so you know what's left
  const [{ count: cafeCount }] = await q(`SELECT COUNT(*) as count FROM cafes`);
  const [{ count: catalogCount }] = await q(`SELECT COUNT(*) as count FROM vehicle_catalogs`);
  const [{ count: vehicleCount }] = await q(`SELECT COUNT(*) as count FROM vehicles`);
  const [{ count: menuCount }] = await q(`SELECT COUNT(*) as count FROM menu_items`);
  const [{ count: userCount }] = await q(`SELECT COUNT(*) as count FROM users`);

  console.log('\n✓ Reset complete. Remaining data:');
  console.log(`  Users:           ${userCount}`);
  console.log(`  Cafes:           ${cafeCount}`);
  console.log(`  Vehicle catalogs:${catalogCount}`);
  console.log(`  Vehicles:        ${vehicleCount}`);
  console.log(`  Menu items:      ${menuCount}`);
  console.log('\nReady to test booking flow again.\n');

  await AppDataSource.destroy();
  process.exit(0);
}

resetBookings().catch((err) => {
  console.error('Reset failed:', err);
  process.exit(1);
});
