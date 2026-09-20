import { describe, expect, it } from '@jest/globals';

import { getDisplayBookingStatus, isCheckInWindowExpired } from './check-in-window';

const slotStart = '2026-07-17T10:00:00+07:00';
const withinWindow = new Date('2026-07-17T10:29:59+07:00').getTime();
const afterWindow = new Date('2026-07-17T10:30:01+07:00').getTime();

describe('check-in window', () => {
  it('keeps a confirmed booking available during the 30-minute check-in grace period', () => {
    expect(isCheckInWindowExpired('CONFIRMED', slotStart, null, withinWindow)).toBe(false);
  });

  it('presents a confirmed booking without an active session as no-show after the grace period', () => {
    expect(isCheckInWindowExpired('CONFIRMED', slotStart, null, afterWindow)).toBe(true);
    expect(getDisplayBookingStatus('CONFIRMED', slotStart, null, afterWindow)).toBe('NO_SHOW');
  });

  it('does not mark an active session as no-show', () => {
    expect(isCheckInWindowExpired('CONFIRMED', slotStart, { status: 'ACTIVE' }, afterWindow)).toBe(false);
  });

  it('marks a stale CHECKED_IN handover as no-show until the backend timeout job persists it', () => {
    expect(isCheckInWindowExpired('CONFIRMED', slotStart, { status: 'CHECKED_IN' }, afterWindow)).toBe(true);
  });
});
