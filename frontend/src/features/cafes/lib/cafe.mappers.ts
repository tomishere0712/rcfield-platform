import type { Cafe, Vehicle } from "@/shared/data/explore-data"
import type {
  BackendCafe,
  CafeImage,
  CafeListParams,
  TrackType,
} from "../types"
import { sanitizeImageUrl, getCatalogImageUrl } from "@/shared/lib/utils"

export const CAFE_PLACEHOLDER_IMAGE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1200' height='800' viewBox='0 0 1200 800'%3E%3Crect width='1200' height='800' fill='%23f1f5f9'/%3E%3Cpath d='M216 520c76-132 174-198 294-198 80 0 145 29 195 86 34-22 73-33 117-33 72 0 131 28 178 85 31 37 52 81 64 132H136c18-26 45-50 80-72z' fill='%23cbd5e1'/%3E%3Ccircle cx='442' cy='250' r='82' fill='%23fb923c'/%3E%3Ctext x='600' y='670' text-anchor='middle' font-family='Arial, sans-serif' font-size='54' font-weight='700' fill='%23334155'%3ERCField Cafe%3C/text%3E%3C/svg%3E"

export function mapCafeToExploreCafe(
  cafe: BackendCafe,
  images: CafeImage[] = [],
): Cafe {
  const imageUrls = buildImageUrls(cafe, images)
  const slotFeeRate = toNumber(cafe.slotFeeRate)
  const minPrice = toNumber(cafe.minPrice ?? cafe.slotFeeRate)

  return {
    id: cafe.id,
    providerId: cafe.providerId,
    name: cafe.name,
    slug: cafe.slug,
    rating: toNumber(cafe.rating),
    reviewsCount: toNumber(cafe.reviewsCount),
    phone: cafe.phone,
    status: cafe.status,
    address: cafe.address,
    district: cafe.district,
    city: cafe.city,
    image: imageUrls[0] ?? CAFE_PLACEHOLDER_IMAGE,
    images: imageUrls,
    priceRange:
      minPrice > 0
        ? `Từ ${formatCompactCurrency(minPrice)}/giờ`
        : "Chưa cập nhật",
    slotDurationMinutes: cafe.slotDurationMinutes,
    slotFeeRate,
    maxConcurrentBookings: cafe.maxConcurrentBookings,
    minBookingNoticeMinutes: cafe.minBookingNoticeMinutes,
    byocCapacity: cafe.byocCapacity,
    trackTypes: cafe.trackTypes.map(formatTrackType),
    trackTypeIds: cafe.trackTypes.map((t) => t.id),
    // Map amenities từ BE thay vì hardcode [] — fallback [] nếu BE chưa trả
    features: cafe.amenities?.map((a) => a.title) ?? [],
    amenities: cafe.amenities ?? [],
    operatingHours: cafe.operatingHours,
    description: cafe.description ?? "Cơ sở chưa cập nhật mô tả.",
    coordinates: buildMapCoordinates(cafe.latitude, cafe.longitude),
    latitude: toNumber(cafe.latitude) || null,
    longitude: toNumber(cafe.longitude) || null,
    availableVehicles: [],
    promotions: cafe.activePromotions ?? [],
  }
}

export function mapCafesToExploreCafes(cafes: BackendCafe[]): Cafe[] {
  return cafes.map((cafe) => mapCafeToExploreCafe(cafe))
}

export function toCafeListParams(params: {
  city?: string
  trackType?: string
  query?: string
  feature?: string
  vehicleType?: string
  sortBy?: "popularity" | "price_asc" | "price_desc" | "rating"
  priceRange?: string
  priceMin?: number
  priceMax?: number
  popularFilters?: string[]
  date?: string
  time?: string
  playMode?: string
  page?: number
  limit?: number
}): CafeListParams {
  const { min, max } = mapPriceRangeToBounds(params.priceRange)
  return {
    page: params.page ?? 1,
    limit: params.limit ?? 100,
    city: isActiveFilter(params.city) ? params.city : undefined,
    track_type: mapTrackTypeParam(params.trackType),
    query: isActiveFilter(params.query) ? params.query : undefined,
    price_min: params.priceMin ?? min,
    price_max: params.priceMax ?? max,
    amenities: isActiveFilter(params.feature) ? [params.feature!] : undefined,
    vehicle_type: isActiveFilter(params.vehicleType)
      ? params.vehicleType
      : undefined,
    sort_by: params.sortBy,
    popular_filters: params.popularFilters?.length
      ? params.popularFilters
      : undefined,
    date: isActiveFilter(params.date) ? params.date : undefined,
    time: isActiveFilter(params.time) ? params.time : undefined,
    play_mode: isActiveFilter(params.playMode)
      ? (params.playMode as "RENTAL" | "BYOC")
      : undefined,
  }
}

export function formatTrackType(trackType: TrackType | string) {
  if (trackType && typeof trackType === "object" && "name" in trackType) {
    return trackType.name
  }
  if (typeof trackType === "string") {
    return trackType
      .toLowerCase()
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ")
  }
  return ""
}

export function getCafeImageUrls(cafe: BackendCafe, images: CafeImage[] = []) {
  return buildImageUrls(cafe, images)
}

export function getCafeSlotFeeRate(cafe: BackendCafe) {
  return toNumber(cafe.slotFeeRate)
}

function buildImageUrls(cafe: BackendCafe, images: CafeImage[]) {
  const sortedImages = [...images].sort((a, b) => a.sortOrder - b.sortOrder)
  const mapped = [
    ...sortedImages.map((image) => sanitizeImageUrl(image.url)),
    sanitizeImageUrl(cafe.coverImageUrl),
    CAFE_PLACEHOLDER_IMAGE,
  ].filter(Boolean) as string[]
  return Array.from(new Set(mapped))
}

function buildMapCoordinates(
  latitude: BackendCafe["latitude"],
  longitude: BackendCafe["longitude"],
) {
  const lat = toNumber(latitude)
  const lng = toNumber(longitude)

  if (!lat || !lng) return { x: 50, y: 50 }

  return {
    x: clamp(((lng + 180) / 360) * 100, 8, 92),
    y: clamp(((90 - lat) / 180) * 100, 8, 92),
  }
}

function mapTrackTypeParam(trackType?: string): string | undefined {
  if (!isActiveFilter(trackType)) return undefined
  return trackType
}

function mapPriceRangeToBounds(range?: string) {
  if (!isActiveFilter(range)) {
    return {
      min: undefined as number | undefined,
      max: undefined as number | undefined,
    }
  }
  if (range === "under100") return { min: undefined, max: 100000 }
  if (range === "100to200") return { min: 100000, max: 200000 }
  if (range === "over200") return { min: 200000, max: undefined }
  return { min: undefined, max: undefined }
}

function isActiveFilter(value?: string | null) {
  return !!value && value !== "all"
}

function toNumber(value: number | string | null | undefined) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function formatCompactCurrency(value: number) {
  if (value >= 1_000_000) return `${Math.round(value / 100_000) / 10}tr`
  if (value >= 1_000) return `${Math.round(value / 1_000)}k`
  return String(value)
}

type VehicleCatalogLike = {
  id: string
  name?: string | null
  tier?: string
  compatibleTrackTypes?: Array<
    string | { id?: string; code?: string; name?: string }
  > | null
  hourlyRate?: number | string
  securityDeposit?: number | string
  available_units?: number | null
  total_units?: number | null
  _count?: { units?: number | null } | null
  coverImageUrl?: string | null
}

export function mapCatalogToExploreVehicle(
  catalog: VehicleCatalogLike,
): Vehicle {
  const brandName = catalog.name ? catalog.name.split(" ")[0] : "Tamiya"
  let specBattery = "2S LiPo"
  let specMotor = "Brushed 540"
  let specScale = "1/10"

  if (catalog.tier === "PREMIUM") {
    specBattery = "3S LiPo"
    specMotor = "Brushless 3300KV"
    specScale = "1/10"
  } else if (catalog.tier === "RESTRICTED") {
    specBattery = "4S LiPo"
    specMotor = "Brushless 2200KV"
    specScale = "1/8"
  } else if (catalog.tier === "STANDARD") {
    specBattery = "2S LiPo"
    specMotor = "Brushless 2500KV"
    specScale = "1/10"
  }

  const compatibleTrack =
    Array.isArray(catalog.compatibleTrackTypes) &&
    catalog.compatibleTrackTypes.length > 0
      ? formatCatalogTrackType(catalog.compatibleTrackTypes[0])
      : "Drift"

  const availableCount =
    catalog.available_units ?? catalog.total_units ?? catalog._count?.units ?? 0

  return {
    id: catalog.id,
    name: catalog.name || "Xe địa hình RC",
    scale: specScale,
    type: compatibleTrack,
    image:
      getCatalogImageUrl(catalog) ||
      "https://images.unsplash.com/photo-1594787318286-3d835c1d207f?q=80&w=600&auto=format&fit=crop",
    pricePerHour: toNumber(catalog.hourlyRate),
    securityDeposit: toNumber(catalog.securityDeposit),
    status: availableCount > 0 ? "available" : "maintenance",
    availableCount,
    specs: {
      battery: specBattery,
      motor: specMotor,
      brand: brandName,
    },
  }
}

function formatCatalogTrackType(
  trackType: string | { code?: string; name?: string },
) {
  if (typeof trackType === "string") return formatTrackType(trackType)
  if (trackType.name) return trackType.name
  if (trackType.code) return formatTrackType(trackType.code)
  return "Drift"
}
