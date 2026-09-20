import {
  getBookableSlotMinutes,
  getOccupancyRate,
  getVietnamCurrentMonthRange,
  getVietnamCurrentMonthToDateRange,
} from '../../lib/provider-occupancy';

describe('provider occupancy helpers', () => {
  const allDayHours = {
    sun: { open: '09:00', close: '21:00' },
    mon: { open: '09:00', close: '21:00' },
    tue: { open: '09:00', close: '21:00' },
    wed: { open: '09:00', close: '21:00' },
    thu: { open: '09:00', close: '21:00' },
    fri: { open: '09:00', close: '21:00' },
    sat: { open: '09:00', close: '21:00' },
  };

  it('uses Vietnam operating hours and clips the range to the requested period', () => {
    const bookable = getBookableSlotMinutes(
      allDayHours,
      2,
      new Date('2026-07-20T05:00:00.000Z'), // 12:00 Vietnam
      new Date('2026-07-21T08:00:00.000Z'), // 15:00 Vietnam next day
    );

    // 9 hours on day one + 6 hours on day two, with two concurrent slots.
    expect(bookable).toBe(1_800);
  });

  it('does not count closed days and caps invalid over-capacity data at 100%', () => {
    const hours = { mon: { is_closed: true } };
    expect(
      getBookableSlotMinutes(
        hours,
        5,
        new Date('2026-07-19T17:00:00.000Z'),
        new Date('2026-07-20T17:00:00.000Z'),
      ),
    ).toBe(0);
    expect(getOccupancyRate(600, 300)).toBe(1);
    expect(getOccupancyRate(0, 0)).toBeNull();
  });

  it('creates calendar-month bounds in Vietnam time', () => {
    expect(getVietnamCurrentMonthRange(new Date('2026-07-31T18:00:00.000Z'))).toEqual({
      from: '2026-07-31T17:00:00.000Z',
      to: '2026-08-31T17:00:00.000Z',
    });
  });

  it('creates month-to-date bounds without counting future capacity', () => {
    expect(getVietnamCurrentMonthToDateRange(new Date('2026-08-09T04:30:00.000Z'))).toEqual({
      from: '2026-07-31T17:00:00.000Z',
      to: '2026-08-09T04:30:00.000Z',
    });
  });
});
