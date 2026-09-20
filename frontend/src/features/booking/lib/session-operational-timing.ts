export const SESSION_CHECKOUT_GRACE_MINUTES = 10
export const SESSION_OVERDUE_ALERT_MINUTES = 30

export type SessionOperationalState =
  | "NOT_APPLICABLE"
  | "ON_TIME"
  | "DUE_FOR_CHECKOUT"
  | "OVERDUE"

export type SessionOperationalTiming = {
  state: SessionOperationalState
  minutesUntilPlannedEnd: number
  minutesPastPlannedEnd: number
  isOverdue: boolean
  shouldAlert: boolean
}

/**
 * This is a presentational state only. The backend remains the source of
 * truth for checkout; going beyond the planned end never releases the car.
 */
export function getSessionOperationalTiming(
  plannedEnd: string | null | undefined,
  status: string | null | undefined,
  now = Date.now(),
): SessionOperationalTiming {
  const plannedEndMs = plannedEnd ? new Date(plannedEnd).getTime() : Number.NaN
  const isLive = status === "ACTIVE" || status === "EXTENDING"
  const validPlannedEnd = Number.isFinite(plannedEndMs)
  const minutesPastPlannedEnd =
    validPlannedEnd && now > plannedEndMs ? Math.floor((now - plannedEndMs) / 60_000) : 0
  const minutesUntilPlannedEnd =
    validPlannedEnd && now < plannedEndMs ? Math.ceil((plannedEndMs - now) / 60_000) : 0
  const isPastPlannedEnd = validPlannedEnd && now > plannedEndMs
  const isOverdue = isLive && validPlannedEnd && now > plannedEndMs + SESSION_CHECKOUT_GRACE_MINUTES * 60_000

  return {
    state:
      !isLive || !validPlannedEnd
        ? "NOT_APPLICABLE"
        : !isPastPlannedEnd
          ? "ON_TIME"
          : isOverdue
            ? "OVERDUE"
            : "DUE_FOR_CHECKOUT",
    minutesUntilPlannedEnd,
    minutesPastPlannedEnd,
    isOverdue,
    shouldAlert: isLive && validPlannedEnd && now >= plannedEndMs + SESSION_OVERDUE_ALERT_MINUTES * 60_000,
  }
}
