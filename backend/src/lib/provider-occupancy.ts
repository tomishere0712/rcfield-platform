import { CafeOperatingHours } from '../types';

const VIETNAM_UTC_OFFSET_MS = 7 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

type VietnamCalendarDate = {
  year: number;
  monthIndex: number;
  day: number;
};

function toVietnamCalendarDate(value: Date): VietnamCalendarDate {
  const local = new Date(value.getTime() + VIETNAM_UTC_OFFSET_MS);
  return {
    year: local.getUTCFullYear(),
    monthIndex: local.getUTCMonth(),
    day: local.getUTCDate(),
  };
}

function parseTimeToMinutes(value?: string): number | null {
  if (!value || !/^([01]\d|2[0-3]):[0-5]\d$|^24:00$/.test(value)) return null;
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

/**
 * Calculates the number of bookable slot-minutes for one cafe. Operating hours
 * are interpreted in Vietnam time because every cafe currently operates in VN.
 * A closing time earlier than its opening time is an overnight schedule.
 */
export function getBookableSlotMinutes(
  operatingHours: CafeOperatingHours | null | undefined,
  concurrentCapacity: number,
  from: Date,
  to: Date,
): number {
  if (
    !operatingHours ||
    !Number.isFinite(concurrentCapacity) ||
    concurrentCapacity <= 0 ||
    !Number.isFinite(from.getTime()) ||
    !Number.isFinite(to.getTime()) ||
    from >= to
  ) {
    return 0;
  }

  const firstDay = toVietnamCalendarDate(from);
  const lastDay = toVietnamCalendarDate(new Date(to.getTime() - 1));
  const cursor = new Date(Date.UTC(firstDay.year, firstDay.monthIndex, firstDay.day));
  const finalDay = Date.UTC(lastDay.year, lastDay.monthIndex, lastDay.day);
  let total = 0;

  while (cursor.getTime() <= finalDay) {
    const dayKey = DAY_KEYS[cursor.getUTCDay()];
    const schedule = operatingHours[dayKey];
    const openMinutes = parseTimeToMinutes(schedule?.open);
    const closeMinutes = parseTimeToMinutes(schedule?.close);

    if (!schedule?.is_closed && openMinutes !== null && closeMinutes !== null) {
      const openAt =
        Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate()) +
        openMinutes * MINUTE_MS -
        VIETNAM_UTC_OFFSET_MS;
      const closesNextDay = closeMinutes <= openMinutes;
      const closeAt =
        Date.UTC(
          cursor.getUTCFullYear(),
          cursor.getUTCMonth(),
          cursor.getUTCDate() + (closesNextDay ? 1 : 0),
        ) +
        closeMinutes * MINUTE_MS -
        VIETNAM_UTC_OFFSET_MS;
      const intervalStart = Math.max(openAt, from.getTime());
      const intervalEnd = Math.min(closeAt, to.getTime());

      if (intervalEnd > intervalStart) {
        total += ((intervalEnd - intervalStart) / MINUTE_MS) * concurrentCapacity;
      }
    }

    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return total;
}

export function getOccupancyRate(
  occupiedSlotMinutes: number,
  bookableSlotMinutes: number,
): number | null {
  if (!Number.isFinite(bookableSlotMinutes) || bookableSlotMinutes <= 0) return null;
  const occupied = Number.isFinite(occupiedSlotMinutes) ? Math.max(0, occupiedSlotMinutes) : 0;
  return Math.min(1, occupied / bookableSlotMinutes);
}

export function getVietnamCurrentMonthRange(now: Date = new Date()): { from: string; to: string } {
  const current = toVietnamCalendarDate(now);
  const from = new Date(Date.UTC(current.year, current.monthIndex, 1) - VIETNAM_UTC_OFFSET_MS);
  const to = new Date(Date.UTC(current.year, current.monthIndex + 1, 1) - VIETNAM_UTC_OFFSET_MS);
  return { from: from.toISOString(), to: to.toISOString() };
}

/**
 * Returns the elapsed part of the current calendar month in Vietnam time.
 * Dashboard utilisation must not include future opening capacity: doing so
 * makes a month-to-date metric look artificially close to zero early in the
 * month.
 */
export function getVietnamCurrentMonthToDateRange(now: Date = new Date()): {
  from: string;
  to: string;
} {
  const { from } = getVietnamCurrentMonthRange(now);
  return { from, to: now.toISOString() };
}
