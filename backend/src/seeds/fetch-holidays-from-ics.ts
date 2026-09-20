/**
 * Fetch Vietnamese national holidays from a Google Calendar ICS feed and
 * upsert them into holiday_dates as SYSTEM records (cafe_id=NULL, multiplier=1.0).
 *
 * Usage:
 *   HOLIDAYS_ICS_URL=<google-calendar-ics-url> npx ts-node src/seeds/fetch-holidays-from-ics.ts [year]
 *
 * The ICS URL is the "Public address in iCal format" from Google Calendar settings.
 * Year defaults to the current year if not provided.
 */

import 'dotenv/config';
import 'reflect-metadata';
import ical from 'node-ical';
import { AppDataSource } from '../config/database';
import { logger } from '../config/logger';

async function fetchHolidays(): Promise<void> {
  const icsUrl = process.env.HOLIDAYS_ICS_URL;
  if (!icsUrl) {
    logger.error('Seed', 'HOLIDAYS_ICS_URL env var is not set', null);
    process.exit(1);
  }

  const targetYear = process.argv[2] ? parseInt(process.argv[2], 10) : new Date().getFullYear();
  logger.info('Seed', `Fetching holidays for year ${targetYear} from ICS feed`);

  const events = await ical.fromURL(icsUrl);

  const holidays: Array<{ date: string; name: string }> = [];
  for (const key in events) {
    const event = events[key];
    if (!event || event.type !== 'VEVENT') continue;

    const vevent = event as ical.VEvent;
    const start = vevent.start as Date | undefined;
    if (!start || start.getFullYear() !== targetYear) continue;

    const month = String(start.getMonth() + 1).padStart(2, '0');
    const day = String(start.getDate()).padStart(2, '0');
    const date = `${targetYear}-${month}-${day}`;
    const name = (vevent.summary as string | undefined) ?? 'Ngày lễ';

    holidays.push({ date, name });
  }

  if (holidays.length === 0) {
    logger.warn('Seed', `No events found for year ${targetYear} in the ICS feed`);
    process.exit(0);
  }

  logger.info('Seed', `Found ${holidays.length} holidays — upserting into holiday_dates`);

  await AppDataSource.initialize();

  for (const { date, name } of holidays) {
    await AppDataSource.query(
      `
      INSERT INTO holiday_dates (holiday_date, name, multiplier, holiday_type, cafe_id)
      VALUES ($1, $2, 1.0, 'SYSTEM', NULL)
      ON CONFLICT DO NOTHING
      `,
      [date, name],
    );
    logger.info('Seed', `Upserted: ${date} — ${name}`);
  }

  logger.info('Seed', 'Done');
  await AppDataSource.destroy();
}

fetchHolidays().catch((err) => {
  logger.error('Seed', 'fetch-holidays-from-ics failed', err);
  process.exit(1);
});
