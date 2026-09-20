import { describe, expect, it } from "vitest"

import { toVietnamSlotISOString } from "./use-booking"

describe("toVietnamSlotISOString", () => {
  it("returns an empty value instead of throwing for malformed date or time", () => {
    expect(toVietnamSlotISOString("15/07/2026", "09:00")).toBe("")
    expect(toVietnamSlotISOString("2026-07-15", "invalid")).toBe("")
  })

  it("converts 24:00 to midnight of the following Vietnam day", () => {
    expect(toVietnamSlotISOString("2026-07-15", "24:00")).toBe(
      "2026-07-15T17:00:00.000Z",
    )
  })
})
