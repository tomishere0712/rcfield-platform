import { describe, expect, it } from "vitest"

import {
  getOperatingDayKeyForCalendarDate,
  getOperatingHoursForCalendarDate,
  getOperatingHoursValidationError,
  isValidClosingTime,
  isValidOpeningTime,
  normalizeOperatingTime,
} from "./operating-hours"

describe("operating-hours", () => {
  it("accepts 24:00 only as a closing time", () => {
    expect(isValidOpeningTime("24:00")).toBe(false)
    expect(isValidClosingTime("24:00")).toBe(true)
    expect(
      getOperatingHoursValidationError({
        mon: { open: "14:00", close: "24:00", is_closed: false },
      }),
    ).toBeNull()
  })

  it("rejects malformed operating times", () => {
    expect(
      getOperatingHoursValidationError({
        mon: { open: "14:00", close: "24:30", is_closed: false },
      }),
    ).toContain("Giờ đóng cửa")
    expect(
      getOperatingHoursValidationError({
        mon: { open: "29:00", close: "22:00", is_closed: false },
      }),
    ).toContain("Giờ mở cửa")
  })

  it("does not require times for a closed day and normalizes one-digit hours", () => {
    expect(getOperatingHoursValidationError({ sun: { is_closed: true } })).toBeNull()
    expect(normalizeOperatingTime("9:05")).toBe("09:05")
  })

  it("resolves a date-only value to the correct operating day without timezone drift", () => {
    expect(getOperatingDayKeyForCalendarDate("2026-07-26")).toBe("sun")
    expect(getOperatingDayKeyForCalendarDate("2026-02-30")).toBeNull()
    expect(
      getOperatingHoursForCalendarDate(
        { sun: { is_closed: true }, mon: { open: "09:00", close: "22:00" } },
        "2026-07-26",
      ),
    ).toEqual({ is_closed: true })
  })
})
