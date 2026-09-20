import type { CafeOperatingHours } from "@/features/cafes/types"

const OPENING_TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/
const CLOSING_TIME_PATTERN = /^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/

export const openingTimeInputPattern = "(?:[01]\\d|2[0-3]):[0-5]\\d"
export const closingTimeInputPattern = "(?:(?:[01]\\d|2[0-3]):[0-5]\\d|24:00)"

const dayLabels: Record<string, string> = {
  mon: "Thứ 2",
  tue: "Thứ 3",
  wed: "Thứ 4",
  thu: "Thứ 5",
  fri: "Thứ 6",
  sat: "Thứ 7",
  sun: "Chủ nhật",
}

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const

/**
 * Resolves a YYYY-MM-DD calendar value to the cafe's operating-hours key.
 * Date-only strings must not be parsed in the browser's local timezone because
 * that can move the weekday for customers outside Vietnam.
 */
export function getOperatingDayKeyForCalendarDate(date: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const parsed = new Date(Date.UTC(year, month - 1, day))

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null
  }

  return DAY_KEYS[parsed.getUTCDay()]
}

export function getOperatingHoursForCalendarDate(
  operatingHours: CafeOperatingHours | string | undefined,
  date: string,
) {
  if (!operatingHours || typeof operatingHours === "string") return undefined

  const dayKey = getOperatingDayKeyForCalendarDate(date)
  return dayKey ? operatingHours[dayKey] : undefined
}

export function normalizeOperatingTime(value: string): string {
  const trimmed = value.trim()
  const match = /^(\d{1,2}):(\d{2})$/.exec(trimmed)
  if (!match) return trimmed

  return `${match[1].padStart(2, "0")}:${match[2]}`
}

export function isValidOpeningTime(value?: string): boolean {
  return !!value && OPENING_TIME_PATTERN.test(value)
}

export function isValidClosingTime(value?: string): boolean {
  return !!value && CLOSING_TIME_PATTERN.test(value)
}

export function getOperatingHoursValidationError(hours: CafeOperatingHours): string | null {
  const entries = Object.entries(hours)
  if (entries.length === 0) return "Cần cấu hình giờ hoạt động cho cơ sở."

  for (const [day, schedule] of entries) {
    if (schedule.is_closed) continue

    const dayLabel = dayLabels[day] ?? day
    if (!isValidOpeningTime(schedule.open)) {
      return `Giờ mở cửa ${dayLabel} không hợp lệ. Dùng định dạng HH:mm từ 00:00 đến 23:59.`
    }
    if (!isValidClosingTime(schedule.close)) {
      return `Giờ đóng cửa ${dayLabel} không hợp lệ. Dùng định dạng HH:mm; có thể nhập 24:00 cho nửa đêm.`
    }
  }

  return null
}
