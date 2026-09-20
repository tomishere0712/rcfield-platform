import { describe, expect, it } from "vitest"

import { getSessionOperationalTiming } from "./session-operational-timing"

describe("getSessionOperationalTiming", () => {
  const plannedEnd = "2026-07-23T13:00:00.000Z"

  it("shows the checkout grace period without ending a session", () => {
    const timing = getSessionOperationalTiming(
      plannedEnd,
      "ACTIVE",
      new Date("2026-07-23T13:05:00.000Z").getTime(),
    )

    expect(timing.state).toBe("DUE_FOR_CHECKOUT")
    expect(timing.minutesPastPlannedEnd).toBe(5)
  })

  it("marks a session overdue after the grace period", () => {
    const timing = getSessionOperationalTiming(
      plannedEnd,
      "ACTIVE",
      new Date("2026-07-23T13:31:00.000Z").getTime(),
    )

    expect(timing.state).toBe("OVERDUE")
    expect(timing.shouldAlert).toBe(true)
  })
})
