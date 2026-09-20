import type { CafeOperatingHours } from '../types';

/**
 * Mốc thời gian và giờ hoạt động theo múi giờ Việt Nam.
 *
 * Gom về một nơi vì logic này quyết định một slot rơi vào ngày nào — chép thành
 * hai bản trong hệ thống đặt lịch thì sớm muộn hai bản lệch nhau, và triệu
 * chứng sẽ là "đặt được ở màn này nhưng bị từ chối ở màn kia" quanh nửa đêm.
 */

export const VN_TZ_OFFSET_MS = 7 * 60 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/** Nửa đêm theo giờ Việt Nam của ngày chứa `value`, trả về dưới dạng mốc UTC. */
export function getVietnamLocalMidnightUtcMs(value: Date): number {
  const local = new Date(value.getTime() + VN_TZ_OFFSET_MS);
  return (
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - VN_TZ_OFFSET_MS
  );
}

/** Khoá thứ trong tuần (`mon`, `tue`, …) dùng để tra bảng giờ hoạt động. */
export function getOperatingDayKey(localMidnightUtcMs: number): string {
  const local = new Date(localMidnightUtcMs + VN_TZ_OFFSET_MS);
  return DAY_KEYS[local.getUTCDay()]!;
}

/** `'HH:MM'` thành số phút từ nửa đêm. `null` khi chuỗi không hợp lệ. */
export function parseOperatingTimeToMinutes(value?: string): number | null {
  if (!value) return null;
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours === 24 && minutes === 0) return 24 * 60;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/**
 * Khung giờ mở cửa của một ngày cụ thể. `null` khi ngày đó nghỉ hoặc chưa khai.
 *
 * Giờ đóng nhỏ hơn hoặc bằng giờ mở nghĩa là quán bán qua nửa đêm, nên khung
 * được kéo sang ngày hôm sau thay vì coi là cấu hình sai.
 */
/**
 * Quán còn mở liên tục suốt khoảng `[start, end)` hay không.
 *
 * Nối các khung giờ của những ngày liền nhau. Quán khai `00:00–24:00` mọi ngày
 * là mở 24/7 — khung của ngày N kết thúc đúng lúc khung ngày N+1 bắt đầu, nên
 * một khoảng vắt qua nửa đêm vẫn nằm trọn trong giờ mở cửa.
 *
 * Tách ra đây vì trước đó hai nơi tự tính theo hai cách khác nhau: lúc TẠO
 * booking thì nối khung nên đặt được 23:00–01:00, còn lúc GIA HẠN chỉ lấy khung
 * của một ngày nên gia hạn từ 23:00 sang 00:15 lại bị chặn — cùng một quán,
 * cùng một khoảng thời gian, hai câu trả lời trái ngược.
 */
export function isRangeWithinOperatingHours(
  operatingHours: CafeOperatingHours | null | undefined,
  start: Date,
  end: Date,
): boolean {
  const firstLocalDay = getVietnamLocalMidnightUtcMs(start) - DAY_MS;
  const lastLocalDay = getVietnamLocalMidnightUtcMs(new Date(end.getTime() - 1)) + DAY_MS;

  const windows: { openAt: Date; closeAt: Date }[] = [];
  for (let candidate = firstLocalDay; candidate <= lastLocalDay; candidate += DAY_MS) {
    const window = buildOperatingWindow(operatingHours, candidate);
    if (window) windows.push(window);
  }

  let coveredUntil = start.getTime();
  const requestedEnd = end.getTime();
  while (coveredUntil < requestedEnd) {
    const covering = windows.filter(
      (window) =>
        window.openAt.getTime() <= coveredUntil && window.closeAt.getTime() > coveredUntil,
    );
    const latestClose = Math.max(...covering.map((window) => window.closeAt.getTime()));
    if (!Number.isFinite(latestClose)) break;
    coveredUntil = latestClose;
  }

  return coveredUntil >= requestedEnd;
}

export function buildOperatingWindow(
  operatingHours: CafeOperatingHours | null | undefined,
  localMidnightUtcMs: number,
): { openAt: Date; closeAt: Date } | null {
  const schedule = operatingHours?.[getOperatingDayKey(localMidnightUtcMs)];
  if (!schedule || schedule.is_closed) return null;

  const openMinutes = parseOperatingTimeToMinutes(schedule.open);
  const closeMinutes = parseOperatingTimeToMinutes(schedule.close);
  if (openMinutes === null || closeMinutes === null) return null;

  const closeOffsetMinutes = closeMinutes <= openMinutes ? closeMinutes + 24 * 60 : closeMinutes;
  return {
    openAt: new Date(localMidnightUtcMs + openMinutes * 60 * 1000),
    closeAt: new Date(localMidnightUtcMs + closeOffsetMinutes * 60 * 1000),
  };
}
