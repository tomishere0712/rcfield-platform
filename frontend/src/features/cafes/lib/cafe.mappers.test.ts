import { describe, expect, it, vi } from "vitest"
import { cafeApi } from "@/features/cafes/api/cafe.api"
import { getCafes } from "@/features/explore/api/explore.api"
import type { BackendCafe } from "../types"
import { mapCafeToExploreCafe, toCafeListParams } from "./cafe.mappers"

vi.mock("@/features/cafes/api/cafe.api", () => ({
  cafeApi: {
    listCafes: vi.fn(),
  },
}))

const mockedCafeApi = vi.mocked(cafeApi)

describe("cafe mappers", () => {
  it("maps browse payload fields from BE", () => {
    const cafe = buildBackendCafe()
    const mapped = mapCafeToExploreCafe(cafe)

    expect(mapped.rating).toBe(4.7)
    expect(mapped.reviewsCount).toBe(38)
    expect(mapped.priceRange).toBe("Từ 150k/giờ")
    expect(mapped.promotions).toHaveLength(1)
    expect(mapped.features).toEqual(["Serious Inspection"])
  })

  it("maps explore filters to backend query params", () => {
    expect(
      toCafeListParams({
        query: "saigon",
        city: "Hồ Chí Minh",
        trackType: "DRIFT",
        feature: "Serious Inspection",
        vehicleType: "Traxxas",
        sortBy: "rating",
        priceRange: "100to200",
        popularFilters: ["DRIFT", "Serious Inspection"],
      }),
    ).toMatchObject({
      query: "saigon",
      city: "Hồ Chí Minh",
      track_type: "DRIFT",
      amenities: ["Serious Inspection"],
      vehicle_type: "Traxxas",
      sort_by: "rating",
      price_min: 100000,
      price_max: 200000,
      popular_filters: ["DRIFT", "Serious Inspection"],
    })
  })

  it("fetches cafes through one list request only", async () => {
    mockedCafeApi.listCafes.mockResolvedValue({
      success: true,
      meta: { total: 1, page: 1, limit: 100 },
      data: [buildBackendCafe()],
    })

    const cafes = await getCafes({ city: "Hồ Chí Minh" })

    expect(mockedCafeApi.listCafes).toHaveBeenCalledTimes(1)
    expect(mockedCafeApi.listCafes).toHaveBeenCalledWith(
      expect.objectContaining({
        city: "Hồ Chí Minh",
      }),
    )
    expect(cafes).toHaveLength(1)
    expect(cafes[0].promotions).toHaveLength(1)
  })
})

function buildBackendCafe(): BackendCafe {
  return {
    id: "cafe-1",
    providerId: "provider-1",
    name: "RC Arena Sai Gon",
    slug: "rc-arena-sai-gon",
    description: "Indoor RC track",
    phone: "0901234567",
    status: "ACTIVE",
    coverImageUrl: null,
    address: "15 Hoang Van Thai",
    district: "Quan 7",
    city: "Ho Chi Minh",
    latitude: 10.7403,
    longitude: 106.712,
    operatingHours: {},
    trackTypes: [
      { id: "track-1", code: "DRIFT", name: "Drift", sortOrder: 0, isActive: true, description: null },
    ],
    slotDurationMinutes: 60,
    slotFeeRate: 150000,
    maxConcurrentBookings: 8,
    minBookingNoticeMinutes: 30,
    maxAdvanceBookingDays: 30,
    byocCapacity: 4,
    rating: 4.7,
    reviewsCount: 38,
    minPrice: 150000,
    amenityIds: ["amenity-1"],
    rules: [],
    amenities: [
      {
        id: "amenity-1",
        title: "Serious Inspection",
        description: null,
        icon: "shield",
        sortOrder: 0,
      },
    ],
    activePromotions: [
      {
        code: "EXPO25",
        description: "Explore promo",
        discount_type: "PERCENT",
        discount_value: 25,
        max_discount_amount: 50000,
        min_order_amount: 100000,
        applicable_to: "ALL",
        expires_at: null,
      },
    ],
    createdAt: "2026-07-10T00:00:00.000Z",
    updatedAt: "2026-07-10T00:00:00.000Z",
    deletedAt: null,
  }
}
