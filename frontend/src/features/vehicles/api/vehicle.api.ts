import { api } from "@/shared/lib/axios"
import type {
  VehicleCatalog,
  VehicleUnit,
  CreateVehicleCatalogDto,
  UpdateVehicleCatalogDto,
  CreateVehicleUnitDto,
  UpdateVehicleUnitDto,
  VehicleStatus,
} from "../types"

interface ApiResponse<T> {
  success: boolean
  data: T
}

export const vehicleApi = {
  // Catalog APIs
  listCatalogs: async (cafeId: string): Promise<VehicleCatalog[]> => {
    const res = await api.get<ApiResponse<VehicleCatalog[]>>(
      `/v1/cafes/${cafeId}/vehicle-catalogs`,
    )
    return res.data.data
  },

  getCatalogDetail: async (
    cafeId: string,
    catalogId: string,
  ): Promise<VehicleCatalog> => {
    const res = await api.get<ApiResponse<VehicleCatalog>>(
      `/v1/cafes/${cafeId}/vehicle-catalogs/${catalogId}`,
    )
    return res.data.data
  },

  createCatalog: async (
    cafeId: string,
    data: CreateVehicleCatalogDto,
  ): Promise<VehicleCatalog> => {
    const payload = {
      name: data.name,
      tier: data.tier,
      hourly_rate: data.hourlyRate,
      security_deposit: data.securityDeposit,
      compatible_track_types: data.compatibleTrackTypes,
      cover_image_url: data.images?.[0]?.url || null,
      images: data.images
        ? data.images.map((img, idx) => ({ url: img.url, sort_order: idx }))
        : [],
    }
    const res = await api.post<ApiResponse<VehicleCatalog>>(
      `/v1/cafes/${cafeId}/vehicle-catalogs`,
      payload,
    )
    return res.data.data
  },

  updateCatalog: async (
    cafeId: string,
    catalogId: string,
    data: UpdateVehicleCatalogDto,
  ): Promise<VehicleCatalog> => {
    const payload = {
      name: data.name,
      tier: data.tier,
      hourly_rate: data.hourlyRate,
      security_deposit: data.securityDeposit,
      compatible_track_types: data.compatibleTrackTypes,
      cover_image_url: data.images?.[0]?.url ?? undefined,
      images: data.images
        ? data.images.map((img, idx) => ({ url: img.url, sort_order: idx }))
        : undefined,
    }
    const res = await api.patch<ApiResponse<VehicleCatalog>>(
      `/v1/cafes/${cafeId}/vehicle-catalogs/${catalogId}`,
      payload,
    )
    return res.data.data
  },

  deleteCatalog: async (cafeId: string, catalogId: string): Promise<void> => {
    await api.delete(`/v1/cafes/${cafeId}/vehicle-catalogs/${catalogId}`)
  },

  // Vehicle Unit APIs
  createUnit: async (
    cafeId: string,
    catalogId: string,
    data: CreateVehicleUnitDto,
  ): Promise<VehicleUnit> => {
    const payload = {
      status: data.status,
      identifier: data.identifier,
      color: data.color,
      notes: data.notes,
      last_maintenance_at: data.lastMaintenanceAt,
      distinctive_image_url: data.distinctiveImageUrl,
    }
    const res = await api.post<ApiResponse<VehicleUnit>>(
      `/v1/cafes/${cafeId}/vehicle-catalogs/${catalogId}/units`,
      payload,
    )
    return res.data.data
  },

  listUnits: async (
    cafeId: string,
    filters?: {
      status?: VehicleStatus
      catalog_id?: string
      search?: string
      exclude_retired?: boolean
    },
  ): Promise<VehicleUnit[]> => {
    const res = await api.get<ApiResponse<VehicleUnit[]>>(
      `/v1/cafes/${cafeId}/vehicles`,
      {
        params: filters,
      },
    )
    return res.data.data
  },

  getUnitDetail: async (
    cafeId: string,
    catalogId: string,
    unitId: string,
  ): Promise<VehicleUnit> => {
    const res = await api.get<ApiResponse<VehicleUnit>>(
      `/v1/cafes/${cafeId}/vehicle-catalogs/${catalogId}/units/${unitId}`,
    )
    return res.data.data
  },

  updateUnit: async (
    cafeId: string,
    catalogId: string,
    unitId: string,
    data: UpdateVehicleUnitDto,
  ): Promise<VehicleUnit> => {
    const payload = {
      status: data.status,
      identifier: data.identifier,
      color: data.color,
      notes: data.notes,
      last_maintenance_at: data.lastMaintenanceAt,
      distinctive_image_url: data.distinctiveImageUrl,
    }
    const res = await api.patch<ApiResponse<VehicleUnit>>(
      `/v1/cafes/${cafeId}/vehicle-catalogs/${catalogId}/units/${unitId}`,
      payload,
    )
    return res.data.data
  },

  deleteUnit: async (
    cafeId: string,
    catalogId: string,
    unitId: string,
  ): Promise<void> => {
    await api.delete(
      `/v1/cafes/${cafeId}/vehicle-catalogs/${catalogId}/units/${unitId}`,
    )
  },
}
