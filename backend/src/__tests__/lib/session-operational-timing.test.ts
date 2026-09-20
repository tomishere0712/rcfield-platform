import { SessionStatus } from '../../types';
import {
  getSessionOperationalTiming,
  SESSION_CHECKOUT_GRACE_MINUTES,
  SESSION_OVERDUE_ALERT_MINUTES,
} from '../../lib/session-operational-timing';

describe('getSessionOperationalTiming', () => {
  const plannedEnd = new Date('2026-07-23T13:00:00.000Z');

  it('keeps an active session on time before its planned end', () => {
    const timing = getSessionOperationalTiming(
      plannedEnd,
      SessionStatus.ACTIVE,
      new Date('2026-07-23T12:45:00.000Z'),
    );

    expect(timing.state).toBe('ON_TIME');
    expect(timing.minutesUntilPlannedEnd).toBe(15);
    expect(timing.shouldAlert).toBe(false);
    expect(timing.canExtend).toBe(true);
  });

  it('requires checkout during the grace period without ending the session', () => {
    const timing = getSessionOperationalTiming(
      plannedEnd,
      SessionStatus.ACTIVE,
      new Date('2026-07-23T13:05:00.000Z'),
    );

    expect(timing.state).toBe('DUE_FOR_CHECKOUT');
    expect(timing.minutesPastPlannedEnd).toBe(5);
    expect(timing.isOverdue).toBe(false);
    expect(timing.canExtend).toBe(true);
  });

  it('marks an unreturned active session as overdue and alerts after the threshold', () => {
    const timing = getSessionOperationalTiming(
      plannedEnd,
      SessionStatus.ACTIVE,
      new Date('2026-07-23T13:30:00.000Z'),
    );

    expect(timing.state).toBe('OVERDUE');
    expect(timing.minutesPastPlannedEnd).toBe(SESSION_OVERDUE_ALERT_MINUTES);
    expect(timing.isOverdue).toBe(true);
    expect(timing.shouldAlert).toBe(true);
    expect(timing.canExtend).toBe(false);
    expect(timing.graceMinutes).toBe(SESSION_CHECKOUT_GRACE_MINUTES);
  });

  it('does not turn a completed session into an operational alert', () => {
    const timing = getSessionOperationalTiming(
      plannedEnd,
      SessionStatus.COMPLETED,
      new Date('2026-07-23T15:00:00.000Z'),
    );

    expect(timing.state).toBe('NOT_APPLICABLE');
    expect(timing.shouldAlert).toBe(false);
  });
});
