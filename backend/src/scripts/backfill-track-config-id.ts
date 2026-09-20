/* eslint-disable no-console */
/**
 * Backfill bookings.track_config_id for existing bookings that have a matching
 * cafe_track_configs row (cafe_id + track_type_id).
 *
 * Run once after migration: npx ts-node src/scripts/backfill-track-config-id.ts
 */
import { AppDataSource } from '../config/database';

async function main() {
  await AppDataSource.initialize();

  const result = await AppDataSource.query(`
    UPDATE bookings b
    SET track_config_id = ctc.id
    FROM cafe_track_configs ctc
    WHERE b.cafe_id = ctc.cafe_id
      AND b.track_type_id = ctc.track_type_id
      AND ctc.deleted_at IS NULL
      AND b.track_config_id IS NULL
  `);

  console.log('Backfill complete:', result);
  await AppDataSource.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
