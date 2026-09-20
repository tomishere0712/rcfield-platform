const CHECK_IN_GRACE_PERIOD_MS = 30 * 60 * 1000;

type SessionLike = { status?: string | null } | null | undefined;

/**
 * Mirrors the backend timeout rule: a confirmed booking is a no-show once the
 * check-in grace period passes and it has not become an active session.
 */
export function isCheckInWindowExpired(
  bookingStatus: string | null | undefined,
  slotStart: string | null | undefined,
  session?: SessionLike,
  now = Date.now()
) {
  if (bookingStatus !== 'CONFIRMED' || !slotStart) return false;
  if (session?.status && !['CHECKED_IN', 'CANCELLED'].includes(session.status)) return false;

  const startAt = new Date(slotStart).getTime();
  return Number.isFinite(startAt) && now > startAt + CHECK_IN_GRACE_PERIOD_MS;
}

export function getDisplayBookingStatus<T extends string>(
  bookingStatus: T,
  slotStart: string | null | undefined,
  session?: SessionLike,
  now = Date.now()
): T | 'NO_SHOW' {
  return isCheckInWindowExpired(bookingStatus, slotStart, session, now) ? 'NO_SHOW' : bookingStatus;
}
