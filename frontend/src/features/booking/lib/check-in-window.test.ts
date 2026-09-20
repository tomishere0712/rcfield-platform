import { describe, expect, it } from "vitest"
import { hasExpiredCheckInWindow, isCheckInDeadlineExpired } from "./check-in-window"

const now = new Date("2026-07-16T10:31:00.000Z").getTime()

describe("check-in window", () => {
  it("expires 30 minutes after the scheduled start", () => {
    expect(isCheckInDeadlineExpired("2026-07-16T10:00:00.000Z", now)).toBe(true)
    expect(isCheckInDeadlineExpired("2026-07-16T10:01:00.000Z", now)).toBe(false)
  })

  it("treats an abandoned CHECKED_IN session as no-show while active play remains valid", () => {
    expect(
      hasExpiredCheckInWindow(
        { status: "CONFIRMED", slotStart: "2026-07-16T10:00:00.000Z", session: { status: "CHECKED_IN" } },
        now,
      ),
    ).toBe(true)
    expect(
      hasExpiredCheckInWindow(
        { status: "CONFIRMED", slotStart: "2026-07-16T10:00:00.000Z", session: { status: "ACTIVE" } },
        now,
      ),
    ).toBe(false)
  })
})
