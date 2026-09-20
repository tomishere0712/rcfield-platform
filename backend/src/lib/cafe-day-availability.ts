import type { CafeOperatingHours } from '../types';
import { DAY_MS, buildOperatingWindow, getVietnamLocalMidnightUtcMs } from './vietnam-time';

/**
 * "Chi nhánh này còn chỗ trống trong ngày X không?" — dùng cho bộ lọc ngày ở
 * màn tìm kiếm.
 *
 * ⚠️ Đây là phép LỌC SƠ BỘ, không phải kiểm tra chỗ trống chính xác. Kiểm tra
 * chính xác nằm ở `GET /cafes/:id/availability`, và nó đắt hơn nhiều: phải tách
 * BYOC và thuê xe, tách theo từng cấu hình đường đua, cộng thêm bộ đếm Redis
 * cho các giao dịch đang treo và khoá giải đấu. Chạy nguyên bộ đó cho mọi chi
 * nhánh × mọi slot trong ngày ở một endpoint danh sách là không khả thi.
 *
 * Vì thế chỗ này chỉ xét: ngày đó có mở cửa không, slot còn nằm trong tương lai
 * không, và số đơn đang giữ chỗ đã chạm `max_concurrent_bookings` chưa.
 *
 * Sai số cố ý nghiêng về phía HIỆN THỪA chứ không ẩn nhầm: bỏ qua bộ đếm Redis
 * và khoá giải đấu nghĩa là một chi nhánh gần đầy vẫn có thể lọt vào danh sách.
 * Khách bấm vào rồi mới biết hết chỗ thì chỉ mất công một nhịp; ẩn nhầm một chi
 * nhánh đang còn chỗ thì chủ quán mất khách mà không ai biết.
 */

export interface CafeDaySchedule {
  cafeId: string;
  operatingHours: CafeOperatingHours | null;
  slotDurationMinutes: number;
  maxConcurrentBookings: number;
  minBookingNoticeMinutes: number;
  maxAdvanceBookingDays: number;
}

/** Một đơn đang chiếm chỗ, chỉ cần khoảng thời gian. */
export interface OccupyingBooking {
  cafeId: string;
  slotStart: Date;
  slotEnd: Date;
}

/**
 * Các mốc bắt đầu slot còn đặt được trong ngày, theo giờ hoạt động.
 *
 * Trả mảng rỗng khi ngày đó nghỉ, đã quá hạn đặt trước, hoặc mọi slot đều đã
 * trôi qua so với `now` (tính cả thời gian báo trước tối thiểu).
 */
export function listBookableSlotStarts(
  schedule: CafeDaySchedule,
  dayMidnightUtcMs: number,
  now: Date,
): Date[] {
  const { slotDurationMinutes } = schedule;
  if (!Number.isInteger(slotDurationMinutes) || slotDurationMinutes <= 0) return [];

  // Quá xa so với hạn đặt trước của chi nhánh.
  const todayMidnight = getVietnamLocalMidnightUtcMs(now);
  const lastBookableDay = todayMidnight + schedule.maxAdvanceBookingDays * DAY_MS;
  if (dayMidnightUtcMs > lastBookableDay) return [];
  if (dayMidnightUtcMs < todayMidnight) return [];

  const window = buildOperatingWindow(schedule.operatingHours, dayMidnightUtcMs);
  if (!window) return [];

  const earliestStart = now.getTime() + schedule.minBookingNoticeMinutes * 60 * 1000;
  const slotMs = slotDurationMinutes * 60 * 1000;

  const starts: Date[] = [];
  for (
    let cursor = window.openAt.getTime();
    cursor + slotMs <= window.closeAt.getTime();
    cursor += slotMs
  ) {
    if (cursor >= earliestStart) starts.push(new Date(cursor));
  }
  return starts;
}

/**
 * Còn ít nhất một slot chưa chạm trần số đơn đồng thời hay không.
 *
 * Một đơn chiếm slot khi khoảng của nó giao với khoảng của slot — dùng đúng
 * phép giao nửa mở `start < slotEnd && end > slotStart` như chỗ kiểm tra chỗ
 * trống thật, để hai nơi không cho ra kết quả khác nhau ở hai đầu mút.
 */
export function hasFreeSlotOnDay(
  schedule: CafeDaySchedule,
  dayMidnightUtcMs: number,
  now: Date,
  bookings: OccupyingBooking[],
): boolean {
  const slotStarts = listBookableSlotStarts(schedule, dayMidnightUtcMs, now);
  if (slotStarts.length === 0) return false;

  // Trần bằng 0 nghĩa là chi nhánh không nhận đơn nào.
  if (schedule.maxConcurrentBookings <= 0) return false;

  const slotMs = schedule.slotDurationMinutes * 60 * 1000;
  return slotStarts.some((slotStart) => {
    const slotStartMs = slotStart.getTime();
    const slotEndMs = slotStartMs + slotMs;
    const occupied = bookings.reduce(
      (count, booking) =>
        booking.slotStart.getTime() < slotEndMs && booking.slotEnd.getTime() > slotStartMs
          ? count + 1
          : count,
      0,
    );
    return occupied < schedule.maxConcurrentBookings;
  });
}
