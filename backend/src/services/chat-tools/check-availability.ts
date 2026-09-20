import { Type } from '@google/genai';
import { IsNull } from 'typeorm';
import { AppDataSource } from '../../config/database';
import { CafePricingRule } from '../../models/cafe-pricing-rule.entity';
import { HolidayDate } from '../../models/holiday-date.entity';
import { CafeHolidayOverride } from '../../models/cafe-holiday-override.entity';
import { computeEffectiveMultiplier } from '../pricing.service';
import { getContestBlockedWindows } from '../contest-lock.service';
import { formatVnd, todayInVn, toVnTimeString } from './money';

export const definition = {
  name: 'check_availability',
  description:
    'Kiểm tra slot trống tại chi nhánh theo ngày. Gọi khi khách hỏi về lịch trống, còn slot không, muốn đặt sân vào ngày/giờ nào.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      date: {
        type: Type.STRING,
        description:
          'Ngày cần kiểm tra, định dạng YYYY-MM-DD. Tự suy ra từ context (ngày mai, thứ 6, cuối tuần…). Nếu không xác định được, dùng ngày hôm nay.',
      },
    },
    required: [],
  },
};

export interface CheckAvailabilityArgs {
  date?: string;
}

// cafeId luôn được inject từ widget context — không nhận từ args để tránh cross-cafe query
export async function handler(cafeId: string, args: CheckAvailabilityArgs): Promise<string> {
  const dateStr = args.date ?? todayInVn();
  const ds = AppDataSource;

  const cafeRows = await ds.query<
    {
      byoc_capacity: number;
      slot_duration_minutes: number;
      slot_fee_rate: string;
      name: string;
      operating_hours: Record<
        string,
        { open?: string; close?: string; is_closed?: boolean }
      > | null;
    }[]
  >(
    `SELECT byoc_capacity, slot_duration_minutes, slot_fee_rate, name, operating_hours
       FROM cafes WHERE id = $1`,
    [cafeId],
  );
  if (!cafeRows.length) return JSON.stringify({ error: 'Cafe not found' });

  const byocCapacity = Number(cafeRows[0].byoc_capacity);
  const slotMinutes = Number(cafeRows[0].slot_duration_minutes);
  if (
    !Number.isInteger(byocCapacity) ||
    byocCapacity < 0 ||
    !Number.isInteger(slotMinutes) ||
    slotMinutes <= 0
  ) {
    return JSON.stringify({ error: 'Cafe schedule or BYOC capacity is not configured correctly' });
  }

  // RENTAL capacity = number of currently available vehicles
  const vehicleRows = await ds.query<{ count: string }[]>(
    `SELECT COUNT(*) AS count FROM vehicles
     WHERE cafe_id = $1 AND status = 'AVAILABLE' AND deleted_at IS NULL`,
    [cafeId],
  );
  const totalVehicles = parseInt(vehicleRows[0]?.count ?? '0', 10);

  const vnMidnight = `${dateStr}T00:00:00+07:00`;

  // Per-slot: count BYOC bookings (each = 1 BYOC slot) and booked vehicle IDs for RENTAL
  // Matches the same overlap logic used by the real availability API:
  //   b.slot_start < slot_end AND b.slot_end > slot_start
  const rows = await ds.query<
    {
      slot_time: Date;
      byoc_booked: number;
      rental_booked: number;
    }[]
  >(
    `SELECT
       gs.slot_time,
       COUNT(DISTINCT CASE WHEN b.play_mode = 'BYOC' THEN b.id END)::int       AS byoc_booked,
       COUNT(DISTINCT CASE WHEN b.play_mode = 'RENTAL' THEN bv.vehicle_id END)::int AS rental_booked
     FROM generate_series(
       $3::timestamptz,
       $3::timestamptz + interval '1 day' - ($4 || ' minutes')::interval,
       ($4 || ' minutes')::interval
     ) AS gs(slot_time)
     LEFT JOIN bookings b
       ON b.cafe_id = $1
       AND b.status IN ('PENDING', 'CONFIRMED')
       AND b.slot_start < gs.slot_time + ($4 || ' minutes')::interval
       AND b.slot_end   > gs.slot_time
     LEFT JOIN booking_vehicles bv ON bv.booking_id = b.id AND b.play_mode = 'RENTAL'
     WHERE gs.slot_time >= NOW()
     GROUP BY gs.slot_time
     HAVING
       ($2::int - COUNT(DISTINCT CASE WHEN b.play_mode = 'BYOC'   THEN b.id         END)) > 0
       OR ($5::int - COUNT(DISTINCT CASE WHEN b.play_mode = 'RENTAL' THEN bv.vehicle_id END)) > 0
     ORDER BY gs.slot_time`,
    [cafeId, byocCapacity, vnMidnight, slotMinutes, totalVehicles],
  );

  if (rows.length === 0) {
    return JSON.stringify({ date: dateStr, available: false, message: 'Hết slot trong ngày này.' });
  }

  // Giá từng khung giờ: nạp quy tắc một lần rồi tính thuần, thay vì gọi
  // getEffectiveMultiplier cho từng slot (24 slot = 72 lượt truy vấn thừa).
  const basePrice = parseFloat(cafeRows[0].slot_fee_rate);
  const [rules, systemHolidays, customHolidays] = await Promise.all([
    ds
      .getRepository(CafePricingRule)
      .find({ where: { cafeId, isActive: true, deletedAt: IsNull() } }),
    ds
      .getRepository(HolidayDate)
      .find({ where: { cafeId: IsNull(), holidayDate: dateStr, deletedAt: IsNull() } }),
    ds
      .getRepository(HolidayDate)
      .find({ where: { cafeId, holidayDate: dateStr, deletedAt: IsNull() } }),
  ]);
  const holidays = [...systemHolidays, ...customHolidays];
  const overrides = systemHolidays.length
    ? await ds.getRepository(CafeHolidayOverride).find({ where: { cafeId } })
    : [];

  // Khung giờ bị giải đấu giữ riêng.
  //
  // Thiếu bước này thì công cụ báo "còn slot" cho những khung mà `createBooking`
  // chắc chắn từ chối với `CONTEST_SLOT_LOCKED` — khách được hứa rồi bị nuốt
  // lời ở bước cuối, sau khi đã khai xong mọi thứ.
  const dayStart = new Date(vnMidnight);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const blockedWindows = await getContestBlockedWindows({
    cafeId,
    rangeStart: dayStart,
    rangeEnd: dayEnd,
  });
  const fullBranchWindows = blockedWindows.filter((w) => w.blocksWholeBranch);
  const partialWindows = blockedWindows.filter((w) => !w.blocksWholeBranch);

  /** Khung giờ này có nằm trong khoảng giải đấu khoá CẢ chi nhánh không. */
  function isBlockedByContest(slotTime: Date): boolean {
    const slotEnd = new Date(slotTime.getTime() + slotMinutes * 60 * 1000);
    return fullBranchWindows.some(
      (w) => new Date(w.startsAt) < slotEnd && new Date(w.endsAt) > slotTime,
    );
  }

  /*
    Giờ mở cửa của chi nhánh.

    `generate_series` phía trên rải khung giờ suốt 24 tiếng và chỉ lọc theo sức
    chứa — nó KHÔNG biết quán mấy giờ mở. Nên công cụ này từng mời khách 10h
    sáng Chủ nhật ở một chi nhánh 14h mới mở cửa, rồi `createBooking` từ chối ở
    bước cuối. Cùng kiểu hỏng với chuyện giải đấu: hứa thứ mà bước tạo đơn sẽ
    khước từ.
  */
  const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const hours = cafeRows[0].operating_hours ?? {};

  function isWithinOperatingHours(slotTime: Date): boolean {
    // Thứ trong tuần và giờ đều phải đọc theo giờ Việt Nam, không theo giờ máy chủ.
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Ho_Chi_Minh',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(slotTime);
    const weekday = parts.find((part) => part.type === 'weekday')?.value?.toLowerCase() ?? '';
    const hh = parts.find((part) => part.type === 'hour')?.value ?? '00';
    const mm = parts.find((part) => part.type === 'minute')?.value ?? '00';

    const day = hours[DAY_KEYS.find((key) => key.startsWith(weekday.slice(0, 3))) ?? weekday];
    // Chưa khai giờ cho ngày đó thì không chặn — thà mời thừa rồi bị bước tạo
    // đơn chặn, còn hơn im lặng khoá cả ngày vì thiếu cấu hình.
    if (!day) return true;
    if (day.is_closed) return false;
    if (!day.open || !day.close) return true;

    const now = `${hh}:${mm}`;
    // Khung giờ phải bắt đầu trong giờ mở cửa VÀ kết thúc trước giờ đóng.
    const endMinutes = Number(hh) * 60 + Number(mm) + slotMinutes;
    const [closeH, closeM] = day.close.split(':').map(Number);
    return now >= day.open && endMinutes <= closeH * 60 + closeM;
  }

  const rentalTimes: string[] = [];
  const byocTimes: string[] = [];
  // Chỉ liệt kê khung giờ có giá KHÁC giá gốc. Liệt kê hết thì kết quả phình to
  // và model dễ đọc nhầm giá gốc thành giá đặc biệt.
  const priceByTime: Record<string, string> = {};

  for (const r of rows) {
    const slotTime = new Date(r.slot_time);
    // Bỏ hẳn khỏi danh sách, không phải đánh dấu: đây là khung giờ KHÔNG đặt
    // được, nên nhắc tới nó chỉ làm model gợi ý nhầm.
    if (isBlockedByContest(slotTime)) continue;
    if (!isWithinOperatingHours(slotTime)) continue;
    const t = toVnTimeString(slotTime);
    if (totalVehicles - r.rental_booked > 0) rentalTimes.push(t);
    if (byocCapacity - r.byoc_booked > 0) byocTimes.push(t);

    if (Number.isFinite(basePrice) && basePrice > 0) {
      const { multiplier } = computeEffectiveMultiplier(slotTime, rules, holidays, overrides);
      if (multiplier !== 1) priceByTime[t] = formatVnd(basePrice * multiplier);
    }
  }

  // Cả ngày bị giải đấu chiếm — nói thẳng lý do thay vì để model tự đoán vì sao
  // danh sách khung giờ trống rỗng.
  // Cả ngày không còn khung nào vì quán chưa mở / đã đóng — nói rõ giờ mở cửa
  // thay vì để mô hình đoán vì sao danh sách rỗng.
  if (rentalTimes.length === 0 && byocTimes.length === 0 && fullBranchWindows.length === 0) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Ho_Chi_Minh',
      weekday: 'short',
    }).formatToParts(new Date(vnMidnight));
    const weekday = parts.find((p) => p.type === 'weekday')?.value?.toLowerCase() ?? '';
    const day = hours[DAY_KEYS.find((k) => k.startsWith(weekday.slice(0, 3))) ?? weekday];
    if (day?.is_closed) {
      return JSON.stringify({
        date: dateStr,
        available: false,
        reason: 'CAFE_CLOSED',
        message: 'Ngày này chi nhánh nghỉ ạ.',
      });
    }
    if (day?.open && day?.close) {
      return JSON.stringify({
        date: dateStr,
        available: false,
        reason: 'OUTSIDE_OPERATING_HOURS',
        openingHours: `${day.open}–${day.close}`,
        message: `Ngày này chi nhánh mở cửa ${day.open}–${day.close}, hiện không còn khung giờ trống trong khoảng đó ạ.`,
      });
    }
  }

  if (rentalTimes.length === 0 && byocTimes.length === 0 && fullBranchWindows.length > 0) {
    return JSON.stringify({
      date: dateStr,
      available: false,
      reason: 'CONTEST_RESERVED',
      message: `Ngày này sân được giữ riêng cho giải đấu "${fullBranchWindows[0].contestName}", không nhận đặt lịch thường.`,
    });
  }

  return JSON.stringify({
    date: dateStr,
    available: true,
    ...(partialWindows.length > 0
      ? {
          contestNotice: `Một số đường đua được giữ cho giải đấu "${partialWindows[0].contestName}" trong ngày này. Khung giờ liệt kê dưới đây vẫn còn đường đua khác, nhưng khi đặt cần chọn đúng đường đua không thuộc giải.`,
        }
      : {}),
    slotDurationMinutes: slotMinutes,
    pricing: {
      basePricePerSlot: formatVnd(basePrice),
      priceByTime,
      note: 'Phí sân cho một buổi, tính theo từng người chơi. Thuê xe của quán thì cộng thêm phí thuê xe. Dùng get_pricing nếu khách hỏi kỹ về giá.',
    },
    rental: {
      available: rentalTimes.length > 0,
      availableTimes: rentalTimes,
      note: 'Thuê xe RC tại quán. Phù hợp người mới chơi.',
    },
    byoc: {
      available: byocTimes.length > 0,
      availableTimes: byocTimes,
      note: 'Mang xe RC cá nhân đến chơi, chỉ trả phí sân.',
    },
    note: `Mỗi slot kéo dài ${slotMinutes} phút. Khách chọn giờ bắt đầu để đặt sân.`,
  });
}
