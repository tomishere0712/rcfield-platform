const CHECK_IN_GRACE_MINUTES = 30

type BookingCheckInState = {
  status?: string | null
  source?: string | null
  slotStart?: string | Date | null
  slotEnd?: string | Date | null
  createdAt?: string | Date | null
  session?: { status?: string | null } | null
}

/**
 * A confirmed booking is no longer eligible for check-in 30 minutes after its
 * scheduled start for online bookings.
 * Walk-in bookings (STAFF_MANUAL) remain eligible as long as slotEnd has not passed or was recently created.
 */
export function isCheckInDeadlineExpired(
  slotStart: string | Date | null | undefined,
  now = Date.now(),
  options?: {
    source?: string | null
    slotEnd?: string | Date | null
    createdAt?: string | Date | null
  },
): boolean {
  if (!slotStart) return false

  if (options?.source === "STAFF_MANUAL") {
    if (options?.createdAt) {
      const createdTime = new Date(options.createdAt).getTime()
      if (Number.isFinite(createdTime) && createdTime + CHECK_IN_GRACE_MINUTES * 60_000 > now) {
        return false
      }
    }
    if (options.slotEnd) {
      return new Date(options.slotEnd).getTime() <= now
    }
    return false
  }

  if (options?.createdAt) {
    const createdTime = new Date(options.createdAt).getTime()
    if (Number.isFinite(createdTime) && createdTime + CHECK_IN_GRACE_MINUTES * 60_000 > now) {
      return false
    }
  }

  const startAt = new Date(slotStart).getTime()
  return Number.isFinite(startAt) && startAt + CHECK_IN_GRACE_MINUTES * 60_000 < now
}

/**
 * A CHECKED_IN session only represents the handover in progress. When that
 * handover is abandoned past the deadline, present the booking as NO_SHOW
 * until the timeout job persists the final status.
 */
export function hasExpiredCheckInWindow(booking: BookingCheckInState, now = Date.now()): boolean {
  if (
    booking.status !== "CONFIRMED" ||
    !isCheckInDeadlineExpired(booking.slotStart, now, {
      source: booking.source,
      slotEnd: booking.slotEnd,
      createdAt: booking.createdAt,
    })
  ) {
    return false
  }

  return !booking.session || booking.session.status === "CHECKED_IN"
}
