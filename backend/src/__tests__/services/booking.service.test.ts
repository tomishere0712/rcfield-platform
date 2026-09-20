import { BookingStatus } from '../../types';
import {
  canTransition,
  getPackageCreditRefundRatio,
  isWithinMaxAdvanceBookingDays,
  meetsMinimumBookingNotice,
} from '../../services/booking.service';
import { UserRole } from '../../types';

describe('BookingService.canTransition', () => {
  it('PENDING → CONFIRMED via PAYMENT_CONFIRMED is valid', () => {
    expect(canTransition(BookingStatus.PENDING, 'PAYMENT_CONFIRMED')).toBe(true);
  });

  it('PENDING → CANCELLED via PAYMENT_TIMEOUT is valid', () => {
    expect(canTransition(BookingStatus.PENDING, 'PAYMENT_TIMEOUT')).toBe(true);
  });

  it('PENDING → CANCELLED via HOLD_CANCELLED is valid', () => {
    expect(canTransition(BookingStatus.PENDING, 'HOLD_CANCELLED')).toBe(true);
  });

  it('CONFIRMED → CANCELLED via CUSTOMER_CANCEL is valid', () => {
    expect(canTransition(BookingStatus.CONFIRMED, 'CUSTOMER_CANCEL')).toBe(true);
  });

  it('CONFIRMED → CANCELLED via PROVIDER_CANCEL is valid', () => {
    expect(canTransition(BookingStatus.CONFIRMED, 'PROVIDER_CANCEL')).toBe(true);
  });

  it('CANCELLED → CONFIRMED is invalid', () => {
    expect(canTransition(BookingStatus.CANCELLED, 'PAYMENT_CONFIRMED')).toBe(false);
  });

  it('CONFIRMED → PENDING is invalid', () => {
    expect(canTransition(BookingStatus.CONFIRMED, 'PAYMENT_CONFIRMED')).toBe(false);
  });

  it('PENDING → CUSTOMER_CANCEL is invalid', () => {
    expect(canTransition(BookingStatus.PENDING, 'CUSTOMER_CANCEL')).toBe(false);
  });

  it('COMPLETED → CANCELLED is invalid', () => {
    expect(canTransition(BookingStatus.COMPLETED, 'CUSTOMER_CANCEL')).toBe(false);
  });
});

describe('BookingService.meetsMinimumBookingNotice', () => {
  const now = new Date('2026-07-15T12:00:00.000Z');

  it('accepts a slot exactly at the configured lead time', () => {
    expect(meetsMinimumBookingNotice(new Date('2026-07-15T12:30:00.000Z'), 30, now)).toBe(true);
  });

  it('rejects a slot that is too close to its start time', () => {
    expect(meetsMinimumBookingNotice(new Date('2026-07-15T12:29:59.000Z'), 30, now)).toBe(false);
  });
});

describe('BookingService.isWithinMaxAdvanceBookingDays', () => {
  const now = new Date('2026-07-15T12:00:00.000Z'); // 19:00 in Viet Nam

  it('allows a booking that finishes on the last configured calendar day', () => {
    expect(
      isWithinMaxAdvanceBookingDays(
        new Date('2026-08-14T15:00:00.000Z'), // 22:00 VN, day 30
        new Date('2026-08-14T16:00:00.000Z'), // 23:00 VN, day 30
        30,
        now,
      ),
    ).toBe(true);
  });

  it('rejects a booking on the first day outside the configured window', () => {
    expect(
      isWithinMaxAdvanceBookingDays(
        new Date('2026-08-14T17:00:00.000Z'), // 00:00 VN, day 31
        new Date('2026-08-14T18:00:00.000Z'),
        30,
        now,
      ),
    ).toBe(false);
  });
});

describe('BookingService.getPackageCreditRefundRatio', () => {
  const now = new Date('2026-08-07T12:00:00.000Z');

  it.each([
    ['refunds all credits before 24 hours', UserRole.CUSTOMER, '2026-08-08T13:00:00.000Z', 1],
    [
      'refunds half credits at the 12-hour boundary',
      UserRole.CUSTOMER,
      '2026-08-08T00:00:00.000Z',
      0.5,
    ],
    ['does not refund credits inside 12 hours', UserRole.CUSTOMER, '2026-08-07T23:59:59.000Z', 0],
    [
      'refunds all credits for a cafe cancellation before start',
      UserRole.PROVIDER,
      '2026-08-07T18:00:00.000Z',
      1,
    ],
    [
      'does not refund credits after the slot starts',
      UserRole.PROVIDER,
      '2026-08-07T11:59:59.000Z',
      0,
    ],
  ])('%s', (_name, role, slotStart, expected) => {
    expect(getPackageCreditRefundRatio(role as UserRole, new Date(slotStart), now)).toBe(expected);
  });
});
