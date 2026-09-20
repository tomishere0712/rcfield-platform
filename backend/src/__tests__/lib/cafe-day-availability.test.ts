import {
  hasFreeSlotOnDay,
  listBookableSlotStarts,
  type CafeDaySchedule,
  type OccupyingBooking,
} from '../../lib/cafe-day-availability';

/** Nửa đêm giờ Việt Nam của một ngày, dưới dạng mốc UTC. */
const vnMidnight = (isoDate: string) => Date.parse(`${isoDate}T00:00:00+07:00`);
const vnTime = (isoDate: string, time: string) => new Date(`${isoDate}T${time}:00+07:00`);

const ALL_DAYS_OPEN = Object.fromEntries(
  ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map((day) => [
    day,
    { open: '08:00', close: '20:00' },
  ]),
);

const baseSchedule: CafeDaySchedule = {
  cafeId: 'cafe-1',
  operatingHours: ALL_DAYS_OPEN,
  slotDurationMinutes: 60,
  maxConcurrentBookings: 2,
  minBookingNoticeMinutes: 0,
  maxAdvanceBookingDays: 30,
};

const booking = (isoDate: string, from: string, to: string): OccupyingBooking => ({
  cafeId: 'cafe-1',
  slotStart: vnTime(isoDate, from),
  slotEnd: vnTime(isoDate, to),
});

describe('listBookableSlotStarts', () => {
  const day = '2026-08-20';
  const now = vnTime('2026-08-19', '10:00');

  it('liệt kê đủ slot trong khung giờ mở cửa', () => {
    const starts = listBookableSlotStarts(baseSchedule, vnMidnight(day), now);
    // 08:00 → 20:00, mỗi slot 60 phút = 12 slot
    expect(starts).toHaveLength(12);
    expect(starts[0]).toEqual(vnTime(day, '08:00'));
    expect(starts[starts.length - 1]).toEqual(vnTime(day, '19:00'));
  });

  it('trả rỗng khi ngày đó chi nhánh nghỉ', () => {
    const closed: CafeDaySchedule = {
      ...baseSchedule,
      operatingHours: { ...ALL_DAYS_OPEN, thu: { is_closed: true } },
    };
    // 2026-08-20 là thứ Năm
    expect(listBookableSlotStarts(closed, vnMidnight(day), now)).toEqual([]);
  });

  it('trả rỗng cho ngày đã qua', () => {
    expect(listBookableSlotStarts(baseSchedule, vnMidnight('2026-08-10'), now)).toEqual([]);
  });

  it('trả rỗng khi vượt hạn đặt trước của chi nhánh', () => {
    const schedule = { ...baseSchedule, maxAdvanceBookingDays: 3 };
    expect(listBookableSlotStarts(schedule, vnMidnight('2026-09-30'), now)).toEqual([]);
  });

  it('bỏ các slot không kịp thời gian báo trước tối thiểu', () => {
    const schedule = { ...baseSchedule, minBookingNoticeMinutes: 120 };
    const sameDayNow = vnTime(day, '09:30');
    const starts = listBookableSlotStarts(schedule, vnMidnight(day), sameDayNow);
    // Sớm nhất phải từ 11:30 trở đi → slot 12:00
    expect(starts[0]).toEqual(vnTime(day, '12:00'));
  });

  it('kéo dài sang hôm sau khi quán bán qua nửa đêm', () => {
    const overnight: CafeDaySchedule = {
      ...baseSchedule,
      operatingHours: Object.fromEntries(
        Object.keys(ALL_DAYS_OPEN).map((d) => [d, { open: '20:00', close: '02:00' }]),
      ),
    };
    const starts = listBookableSlotStarts(overnight, vnMidnight(day), now);
    expect(starts).toHaveLength(6); // 20:00 → 02:00 hôm sau
    expect(starts[starts.length - 1]).toEqual(vnTime('2026-08-21', '01:00'));
  });
});

describe('hasFreeSlotOnDay', () => {
  const day = '2026-08-20';
  const now = vnTime('2026-08-19', '10:00');
  const midnight = vnMidnight(day);

  it('còn chỗ khi chưa có đơn nào', () => {
    expect(hasFreeSlotOnDay(baseSchedule, midnight, now, [])).toBe(true);
  });

  it('còn chỗ khi một slot đầy nhưng slot khác trống', () => {
    const full = [booking(day, '08:00', '09:00'), booking(day, '08:00', '09:00')];
    expect(hasFreeSlotOnDay(baseSchedule, midnight, now, full)).toBe(true);
  });

  it('hết chỗ khi mọi slot đều chạm trần', () => {
    const bookings: OccupyingBooking[] = [];
    for (let hour = 8; hour < 20; hour += 1) {
      const from = `${String(hour).padStart(2, '0')}:00`;
      const to = `${String(hour + 1).padStart(2, '0')}:00`;
      bookings.push(booking(day, from, to), booking(day, from, to));
    }
    expect(hasFreeSlotOnDay(baseSchedule, midnight, now, bookings)).toBe(false);
  });

  it('đơn chỉ chạm mép slot thì không tính là chiếm chỗ', () => {
    // Đơn 07:00–08:00 kết thúc đúng lúc slot 08:00 bắt đầu.
    const touching = [booking(day, '07:00', '08:00'), booking(day, '07:00', '08:00')];
    expect(hasFreeSlotOnDay(baseSchedule, midnight, now, touching)).toBe(true);
  });

  it('hết chỗ khi trần số đơn đồng thời bằng 0', () => {
    const schedule = { ...baseSchedule, maxConcurrentBookings: 0 };
    expect(hasFreeSlotOnDay(schedule, midnight, now, [])).toBe(false);
  });
});
