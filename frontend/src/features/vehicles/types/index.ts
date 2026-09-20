export const VehicleTier = {
  STANDARD: "STANDARD",
  PREMIUM: "PREMIUM",
  RESTRICTED: "RESTRICTED",
} as const
export type VehicleTier = (typeof VehicleTier)[keyof typeof VehicleTier]

export const VehicleStatus = {
  AVAILABLE: "AVAILABLE",
  IN_USE: "IN_USE",
  MAINTENANCE: "MAINTENANCE",
  RETIRED: "RETIRED",
} as const
export type VehicleStatus = (typeof VehicleStatus)[keyof typeof VehicleStatus]

import type { TrackType } from "@/features/cafes/types"

export interface CatalogImage {
  id: string
  url: string
  isCover: boolean
}

export interface VehicleCatalog {
  id: string
  cafeId: string
  name: string
  hourlyRate: number
  securityDeposit: number
  tier: VehicleTier
  compatibleTrackTypes: Array<TrackType | string>
  coverImageUrl?: string | null
  cover_image_url?: string | null
  images: CatalogImage[]
  createdAt: string
  updatedAt: string
  total_units?: number
  available_units?: number
  maintenance_units?: number
  _count?: {
    units: number
  }
}

export interface VehicleUnit {
  id: string
  catalogId: string
  identifier: string
  color: string
  status: VehicleStatus
  lastMaintenanceAt: string | null
  last_maintenance_at?: string | null
  distinctive_image_url?: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
  catalog: VehicleCatalog
}

export interface CreateVehicleCatalogDto {
  name: string
  hourlyRate: number
  securityDeposit: number
  tier: VehicleTier
  compatibleTrackTypes: string[]
  images: { url: string; isCover: boolean }[]
}

export type UpdateVehicleCatalogDto = Partial<CreateVehicleCatalogDto>

export interface CreateVehicleUnitDto {
  identifier: string
  color: string
  status?: VehicleStatus
  notes?: string
  lastMaintenanceAt?: string | null
  distinctiveImageUrl?: string | null
}

export type UpdateVehicleUnitDto = Partial<CreateVehicleUnitDto>
