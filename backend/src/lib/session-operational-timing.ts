import { SessionStatus } from '../types';

/**
 * A session remains ACTIVE until the vehicle is inspected and returned. These
 * values are deliberately view/alert thresholds, not lifecycle transitions:
 * passing the planned end must never release a vehicle or complete a payment.
 */
export const SESSION_CHECKOUT_GRACE_MINUTES = 10;
export const SESSION_OVERDUE_ALERT_MINUTES = 30;

export type SessionOperationalState = 'NOT_APPLICABLE' | 'ON_TIME' | 'DUE_FOR_CHECKOUT' | 'OVERDUE';

export interface SessionOperationalTiming {
  state: SessionOperationalState;
  plannedEndAt: string;
  graceEndsAt: string;
  minutesUntilPlannedEnd: number;
  minutesPastPlannedEnd: number;
  isPastPlannedEnd: boolean;
  isOverdue: boolean;
  shouldAlert: boolean;
  /**
   * Normal extensions are a prospective agreement only. Once the checkout
   * grace period has elapsed, the team must resolve the return first instead
   * of retroactively changing the booked end time or charging the customer.
   */
  canExtend: boolean;
  graceMinutes: number;
  alertAfterMinutes: number;
}

function toTime(value: Date | string): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

export function getSessionOperationalTiming(
  plannedEndAt: Date | string,
  status: SessionStatus | string,
  now: Date = new Date(),
): SessionOperationalTiming {
  const plannedEndMs = toTime(plannedEndAt);
  const nowMs = now.getTime();
  const isLive = status === SessionStatus.ACTIVE || status === SessionStatus.EXTENDING;
  const validPlannedEnd = Number.isFinite(plannedEndMs);
  const minutesPastPlannedEnd =
    validPlannedEnd && nowMs > plannedEndMs ? Math.floor((nowMs - plannedEndMs) / 60_000) : 0;
  const minutesUntilPlannedEnd =
    validPlannedEnd && nowMs < plannedEndMs ? Math.ceil((plannedEndMs - nowMs) / 60_000) : 0;
  const isPastPlannedEnd = isLive && validPlannedEnd && nowMs > plannedEndMs;
  const isOverdue =
    isLive && validPlannedEnd && nowMs > plannedEndMs + SESSION_CHECKOUT_GRACE_MINUTES * 60_000;
  const shouldAlert =
    isLive && validPlannedEnd && nowMs >= plannedEndMs + SESSION_OVERDUE_ALERT_MINUTES * 60_000;
  const canExtend =
    isLive && validPlannedEnd && nowMs <= plannedEndMs + SESSION_CHECKOUT_GRACE_MINUTES * 60_000;

  const state: SessionOperationalState =
    !isLive || !validPlannedEnd
      ? 'NOT_APPLICABLE'
      : !isPastPlannedEnd
        ? 'ON_TIME'
        : isOverdue
          ? 'OVERDUE'
          : 'DUE_FOR_CHECKOUT';

  const fallback = now.toISOString();
  return {
    state,
    plannedEndAt: validPlannedEnd ? new Date(plannedEndMs).toISOString() : fallback,
    graceEndsAt: validPlannedEnd
      ? new Date(plannedEndMs + SESSION_CHECKOUT_GRACE_MINUTES * 60_000).toISOString()
      : fallback,
    minutesUntilPlannedEnd,
    minutesPastPlannedEnd,
    isPastPlannedEnd,
    isOverdue,
    shouldAlert,
    canExtend,
    graceMinutes: SESSION_CHECKOUT_GRACE_MINUTES,
    alertAfterMinutes: SESSION_OVERDUE_ALERT_MINUTES,
  };
}
