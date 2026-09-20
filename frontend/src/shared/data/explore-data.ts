import type { ActivePromotion } from "@/features/promotions/api/promotion.api"
import type { AmenityCatalogItem } from "@/features/cafes/types"

export type VehicleStatus = "available" | "rented" | "maintenance"

export interface Vehicle {
  id: string
  name: string
  scale: string
  type: string
  image: string
  pricePerHour: number
  securityDeposit?: number
  status: VehicleStatus
  availableCount?: number
  specs: {
    battery: string
    motor: string
    brand: string
  }
  compatibleTrackTypes?: { id: string; code: string; name: string }[]
}

export type CafeOperatingHour = {
  open?: string
  close?: string
  is_closed?: boolean
}

export interface Cafe {
  id: string
  providerId?: string
  name: string
  slug: string
  rating: number
  reviewsCount: number
  phone?: string | null
  status?: "PENDING" | "ACTIVE" | "SUSPENDED"
  address: string
  district: string
  city: string
  image: string
  images?: string[]
  priceRange: string
  slotDurationMinutes?: number
  slotFeeRate?: number
  maxConcurrentBookings?: number
  minBookingNoticeMinutes?: number
  byocCapacity?: number
  trackTypes: string[]
  trackTypeIds?: string[]
  features: string[]
  amenities?: AmenityCatalogItem[]
  description: string
  coordinates: { x: number; y: number }
  latitude?: number | null
  longitude?: number | null
  availableVehicles: Vehicle[]
  operatingHours?: Record<string, CafeOperatingHour> | string
  promotions?: ActivePromotion[]
}

export type SortOption = "popularity" | "price_asc" | "price_desc" | "rating"

export type CafeSearchParams = {
  query?: string
  cafeId?: string
  city?: string
  trackType?: string
  priceRange?: string
  feature?: string
  date?: string
  time?: string
  /** Năng lực chi nhánh: RENTAL (có xe cho thuê) hoặc BYOC (nhận xe khách mang). */
  playMode?: string
  vehicleType?: string
  sortBy?: SortOption
  priceMin?: number
  priceMax?: number
  popularFilters?: string[]
  page?: number
  limit?: number
}

export type ExploreCafe = Cafe
export type ExploreVehicle = Vehicle

export { mockCafes } from "./mock-cafes"
