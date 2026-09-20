import type { Cafe, CafeSearchParams, Vehicle } from "@/shared/data/explore-data"
import { PRICE_SLIDER_MAX, PRICE_SLIDER_MIN } from "./constants"

export type CafeViewMode = "grid" | "list"
export type SearchTarget = "cafes" | "contests"
export type VehicleWithCafe = Vehicle & { cafe: Cafe }
export type UserLocation = { lat: number; lng: number }
export type MapBounds = { north: number; south: number; east: number; west: number }

export function cafeInBounds(cafe: { latitude?: number | null; longitude?: number | null }, bounds: MapBounds): boolean {
  if (!cafe.latitude || !cafe.longitude) return false
  return (
    cafe.latitude <= bounds.north &&
    cafe.latitude >= bounds.south &&
    cafe.longitude <= bounds.east &&
    cafe.longitude >= bounds.west
  )
}

const DEFAULT_VALUE = "all"

export function normalizeFilterValue(value?: string | null) {
  return value && value.trim() !== "" ? value : DEFAULT_VALUE
}

export function flattenCafeVehicles(cafes: Cafe[]): VehicleWithCafe[] {
  return cafes.flatMap((cafe) => cafe.availableVehicles.map((vehicle) => ({ ...vehicle, cafe })))
}

export function filterCafes(cafes: Cafe[], params: CafeSearchParams): Cafe[] {
  return cafes.filter((cafe) => {
    const query = params.query?.trim().toLowerCase() ?? ""
    const cafeId = normalizeFilterValue(params.cafeId)
    const city = normalizeFilterValue(params.city)
    const trackType = normalizeFilterValue(params.trackType)
    const priceRange = normalizeFilterValue(params.priceRange)
    const feature = normalizeFilterValue(params.feature)
    const vehicleType = normalizeFilterValue(params.vehicleType)
    const playMode = normalizeFilterValue(params.playMode)

    const matchesCafeId = cafeId === DEFAULT_VALUE || cafe.id === cafeId

    const matchesQuery =
      query === "" ||
      cafe.name.toLowerCase().includes(query) ||
      cafe.address.toLowerCase().includes(query) ||
      cafe.district.toLowerCase().includes(query) ||
      cafe.city.toLowerCase().includes(query)

    const matchesCity =
      city === DEFAULT_VALUE ||
      cafe.city.toLowerCase().includes(city.toLowerCase()) ||
      city.toLowerCase().includes(cafe.city.toLowerCase())

    const normalizedTrackParam = trackType.toLowerCase().replace(/_/g, "")
    const matchesTrack =
      trackType === DEFAULT_VALUE ||
      cafe.trackTypes.some((type) =>
        type.toLowerCase().replace(/[^a-z0-9]/g, "").includes(normalizedTrackParam),
      ) ||
      cafe.trackTypeIds?.includes(trackType)
    const matchesFeature = feature === DEFAULT_VALUE || cafe.features.includes(feature)
    const matchesVehicleType =
      vehicleType === DEFAULT_VALUE ||
      cafe.availableVehicles.some((vehicle) => vehicle.type.toLowerCase().includes(vehicleType.toLowerCase()) || vehicle.scale.includes(vehicleType))
    const matchesPrice = priceRange === DEFAULT_VALUE || cafe.availableVehicles.some((vehicle) => isVehicleInPriceRange(vehicle.pricePerHour, priceRange))

    const matchesPlayMode =
      playMode === DEFAULT_VALUE ||
      (playMode === "RENTAL" && cafe.availableVehicles && cafe.availableVehicles.length > 0) ||
      (playMode === "BYOC" && (cafe.byocCapacity === undefined || cafe.byocCapacity > 0))

    // Price slider filter — uses slotFeeRate
    const matchesPriceSlider = matchesPriceSliderRange(cafe, params.priceMin, params.priceMax)

    // Popular filters — match track types or features
    const matchesPopular = matchesPopularFilters(cafe, params.popularFilters)

    return matchesCafeId && matchesQuery && matchesCity && matchesTrack && matchesFeature && matchesVehicleType && matchesPrice && matchesPlayMode && matchesPriceSlider && matchesPopular
  })
}

function matchesPriceSliderRange(cafe: Cafe, priceMin?: number, priceMax?: number): boolean {
  if (priceMin === undefined && priceMax === undefined) return true
  if (priceMin === PRICE_SLIDER_MIN && priceMax === PRICE_SLIDER_MAX) return true

  const cafePrice = cafe.slotFeeRate ?? 0
  if (cafePrice === 0) return true

  const min = priceMin ?? PRICE_SLIDER_MIN
  const max = priceMax ?? PRICE_SLIDER_MAX
  return cafePrice >= min && cafePrice <= max
}

function matchesPopularFilters(cafe: Cafe, popularFilters?: string[]): boolean {
  if (!popularFilters || popularFilters.length === 0) return true

  return popularFilters.every((filter) => {
    const matchesTrack = cafe.trackTypes.some((t) => t.toLowerCase().includes(filter.toLowerCase()))
    const matchesFeature = cafe.features.some((f) => f.toLowerCase().includes(filter.toLowerCase()))
    const matchesTrackId = cafe.trackTypeIds?.includes(filter)
    return matchesTrack || matchesFeature || matchesTrackId
  })
}

export function sortCafes(cafes: Cafe[], sortBy: CafeSearchParams["sortBy"]): Cafe[] {
  if (!sortBy || sortBy === "popularity") return cafes

  return [...cafes].sort((a, b) => {
    switch (sortBy) {
      case "price_asc":
        return (a.slotFeeRate ?? 0) - (b.slotFeeRate ?? 0)
      case "price_desc":
        return (b.slotFeeRate ?? 0) - (a.slotFeeRate ?? 0)
      case "rating":
        return b.rating - a.rating
      default:
        return 0
    }
  })
}

export function getActiveFilterCount(params: CafeSearchParams) {
  let count = [params.cafeId, params.city, params.trackType, params.priceRange, params.feature, params.vehicleType, params.date, params.time, params.playMode].filter(
    (value) => value !== undefined && value !== "" && value !== DEFAULT_VALUE,
  ).length

  if (params.priceMin !== undefined && params.priceMin > PRICE_SLIDER_MIN) count++
  if (params.priceMax !== undefined && params.priceMax < PRICE_SLIDER_MAX) count++
  if (params.popularFilters && params.popularFilters.length > 0) count += params.popularFilters.length

  return count
}

export function buildBookingUrl(
  cafeId: string,
  vehicleId?: string,
  extra?: { date?: string; time?: string; playMode?: string },
) {
  const params = new URLSearchParams({ cafeId })
  if (vehicleId) params.set("vehicleId", vehicleId)
  if (extra?.date) params.set("date", extra.date)
  if (extra?.time && extra.time !== "all") params.set("time", extra.time)
  if (extra?.playMode && extra.playMode !== "all") params.set("playMode", extra.playMode)
  return `/booking/create?${params.toString()}`
}

function isVehicleInPriceRange(price: number, range: string) {
  if (range === "under100") return price < 100000
  if (range === "100to200") return price >= 100000 && price <= 200000
  if (range === "over200") return price > 200000
  return true
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`
  if (km < 10) return `${km.toFixed(1)} km`
  return `${Math.round(km).toLocaleString("vi-VN")} km`
}
