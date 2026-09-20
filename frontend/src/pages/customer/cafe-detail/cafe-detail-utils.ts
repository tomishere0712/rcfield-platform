import type { Cafe } from "@/shared/data/explore-data"

export function buildCafeDetailPath(cafe: Cafe) {
  return `/cafes/${cafe.slug}`
}

export function buildCafeBookingPath(
  cafeId: string,
  mode = "hourly",
  options?: {
    date?: string
    slot?: string
    slotEnd?: string
    vehicleId?: string
    fnb?: string
    step?: string
  }
) {
  const params = new URLSearchParams({ cafeId, mode })
  if (options?.date) params.set("date", options.date)
  if (options?.slot) params.set("slot", options.slot)
  if (options?.slotEnd) params.set("slotEnd", options.slotEnd)
  if (options?.vehicleId) params.set("vehicleId", options.vehicleId)
  if (options?.fnb) params.set("fnb", options.fnb)
  if (options?.step) params.set("step", options.step)
  return `/booking/create?${params.toString()}`
}
