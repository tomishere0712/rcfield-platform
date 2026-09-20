import axios from "axios"
import { api } from "@/shared/lib/axios"
import type { AmenityCatalogItem, BackendCafe, CafeImage, CafeListParams, CafeListResponse, CafeStatus, CafeUpsertBody, ApiEnvelope, CafeWidgetConfig, WidgetConfigBody, KbDocument, KbContentType, TrackType, TrackConfig, CreateTrackConfigBody, UpdateTrackConfigBody } from "../types"

function debugCafeApi(message: string, details?: unknown) {
  if (import.meta.env.DEV) {
    console.debug(`[CafeAPI] ${message}`, details ?? "")
  }
}

export const cafeQueryKeys = {
  all: ["cafes"] as const,
  list: (params?: CafeListParams) => [...cafeQueryKeys.all, "list", params ?? {}] as const,
  detail: (id?: string) => [...cafeQueryKeys.all, "detail", id] as const,
  images: (cafeId?: string) => [...cafeQueryKeys.all, "images", cafeId] as const,
  widgetConfig: (cafeId?: string) => [...cafeQueryKeys.all, "widget-config", cafeId] as const,
  kbDocuments: (cafeId?: string) => [...cafeQueryKeys.all, "kb-documents", cafeId] as const,
  trackConfigs: (cafeId?: string, includeInactive?: boolean) =>
    [...cafeQueryKeys.all, "track-configs", cafeId, includeInactive ?? false] as const,
}

// Customer booking screens need to reflect schedule changes made by providers
// without requiring the customer to reload the page.
export const CAFE_CONFIGURATION_REFETCH_INTERVAL_MS = 15_000
export const CAFE_CONFIGURATION_UPDATED_EVENT = "rcfield:cafe-configuration-updated"
export const CAFE_CONFIGURATION_BROADCAST_CHANNEL = "rcfield:cafe-configuration"

export type CafeConfigurationUpdatedDetail = {
  cafeId: string
}

function notifyCafeConfigurationUpdated(cafeId: string) {
  if (typeof window === "undefined") return

  const detail: CafeConfigurationUpdatedDetail = { cafeId }
  window.dispatchEvent(
    new CustomEvent<CafeConfigurationUpdatedDetail>(
      CAFE_CONFIGURATION_UPDATED_EVENT,
      { detail },
    ),
  )

  if (typeof BroadcastChannel === "undefined") return

  const channel = new BroadcastChannel(CAFE_CONFIGURATION_BROADCAST_CHANNEL)
  channel.postMessage(detail)
  channel.close()
}

export const cafeApi = {
  listCafes: async (params: CafeListParams = {}): Promise<CafeListResponse> => {
    debugCafeApi("GET /v1/cafes", params)
    const res = await api.get<CafeListResponse>("/v1/cafes", { params })
    debugCafeApi("GET /v1/cafes response", { total: res.data.meta?.total, count: res.data.data.length })
    return res.data
  },

  getCafe: async (cafeId: string): Promise<BackendCafe> => {
    debugCafeApi("GET /v1/cafes/:id", { cafeId })
    const res = await api.get<ApiEnvelope<BackendCafe>>(`/v1/cafes/${cafeId}`)
    return res.data.data
  },

  createCafe: async (body: CafeUpsertBody): Promise<BackendCafe> => {
    debugCafeApi("POST /v1/cafes", { name: body.name, city: body.city, track_types: body.track_types })
    const res = await api.post<ApiEnvelope<BackendCafe>>("/v1/cafes", body)
    debugCafeApi("POST /v1/cafes response", { cafeId: res.data.data.id, status: res.data.data.status })
    return res.data.data
  },

  updateCafe: async (cafeId: string, body: Partial<CafeUpsertBody>): Promise<BackendCafe> => {
    debugCafeApi("PATCH /v1/cafes/:id", { cafeId, fields: Object.keys(body) })
    const res = await api.patch<ApiEnvelope<BackendCafe>>(`/v1/cafes/${cafeId}`, body)
    debugCafeApi("PATCH /v1/cafes/:id response", { cafeId: res.data.data.id, status: res.data.data.status })
    notifyCafeConfigurationUpdated(res.data.data.id)
    return res.data.data
  },

  updateCafeStatus: async (cafeId: string, status: CafeStatus): Promise<BackendCafe> => {
    debugCafeApi("PATCH /v1/cafes/:id/status", { cafeId, status })
    const res = await api.patch<ApiEnvelope<BackendCafe>>(`/v1/cafes/${cafeId}/status`, { status })
    return res.data.data
  },

  listCafeImages: async (cafeId: string): Promise<CafeImage[]> => {
    debugCafeApi("GET /v1/cafes/:id/images", { cafeId })
    const res = await api.get<ApiEnvelope<CafeImage[]>>(`/v1/cafes/${cafeId}/images`)
    return res.data.data
  },

  uploadCafeImages: async (cafeId: string, files: File[], sortOrder = 0): Promise<CafeImage[]> => {
    debugCafeApi("POST /v1/cafes/:id/images", { cafeId, count: files.length, sortOrder })
    const formData = new FormData()
    files.forEach((file) => formData.append("files", file))
    formData.append("sort_order", String(sortOrder))

    const res = await api.post<ApiEnvelope<CafeImage[]>>(`/v1/cafes/${cafeId}/images`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    })
    return res.data.data
  },

  deleteCafeImage: async (imageId: string): Promise<void> => {
    debugCafeApi("DELETE /v1/cafe-images/:id", { imageId })
    await api.delete(`/v1/cafe-images/${imageId}`)
  },

  getWidgetConfig: async (cafeId: string): Promise<CafeWidgetConfig> => {
    const res = await api.get<ApiEnvelope<CafeWidgetConfig>>(`/v1/cafes/${cafeId}/widget-config`)
    return res.data.data
  },

  updateWidgetConfig: async (cafeId: string, body: WidgetConfigBody): Promise<CafeWidgetConfig> => {
    const res = await api.put<ApiEnvelope<CafeWidgetConfig>>(`/v1/cafes/${cafeId}/widget-config`, body)
    return res.data.data
  },

  listKbDocuments: async (cafeId: string): Promise<KbDocument[]> => {
    const res = await api.get<{ data: KbDocument[]; total: number }>(`/v1/cafes/${cafeId}/kb/documents`)
    return res.data.data
  },

  uploadKbDocument: async (cafeId: string, file: File, title: string, contentType: KbContentType): Promise<KbDocument> => {
    const formData = new FormData()
    formData.append("file", file)
    formData.append("title", title)
    formData.append("content_type", contentType)
    const res = await api.post<KbDocument>(`/v1/cafes/${cafeId}/kb/documents`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    })
    return res.data
  },

  deleteKbDocument: async (cafeId: string, documentId: string): Promise<void> => {
    await api.delete(`/v1/cafes/${cafeId}/kb/documents/${documentId}`)
  },
}

export const amenityApi = {
  listAll: async (): Promise<AmenityCatalogItem[]> => {
    const res = await api.get<AmenityCatalogItem[]>("/v1/amenities")
    return res.data
  },
}

export const amenityQueryKeys = {
  all: ["amenities"] as const,
}

type AmenityBody = {
  title: string
  description?: string | null
  icon: string
  sort_order: number
}

export const adminAmenityApi = {
  listAll: async (): Promise<AmenityCatalogItem[]> => {
    const res = await api.get<AmenityCatalogItem[]>("/v1/admin/amenities")
    return res.data
  },
  create: async (body: AmenityBody): Promise<AmenityCatalogItem> => {
    const res = await api.post<AmenityCatalogItem>("/v1/admin/amenities", body)
    return res.data
  },
  update: async (id: string, body: Partial<AmenityBody>): Promise<AmenityCatalogItem> => {
    const res = await api.patch<AmenityCatalogItem>(`/v1/admin/amenities/${id}`, body)
    return res.data
  },
  remove: async (id: string): Promise<void> => {
    await api.delete(`/v1/admin/amenities/${id}`)
  },
}

export const adminAmenityQueryKeys = {
  all: ["admin-amenities"] as const,
}

export const trackTypeApi = {
  listAll: async (): Promise<TrackType[]> => {
    const res = await api.get<TrackType[]>("/v1/track-types")
    return res.data
  },
}

export const trackTypeQueryKeys = {
  all: ["track-types"] as const,
}

type TrackTypeBody = {
  code: string
  name: string
  description?: string | null
  sort_order: number
  is_active: boolean
}

export const adminTrackTypeApi = {
  listAll: async (): Promise<TrackType[]> => {
    const res = await api.get<TrackType[]>("/v1/admin/track-types")
    return res.data
  },
  create: async (body: TrackTypeBody): Promise<TrackType> => {
    const res = await api.post<TrackType>("/v1/admin/track-types", body)
    return res.data
  },
  update: async (id: string, body: Partial<TrackTypeBody>): Promise<TrackType> => {
    const res = await api.patch<TrackType>(`/v1/admin/track-types/${id}`, body)
    return res.data
  },
}

export const adminTrackTypeQueryKeys = {
  all: ["admin-track-types"] as const,
}

async function getFallbackTrackConfigs(cafeId: string): Promise<TrackConfig[]> {
  const cafe = await cafeApi.getCafe(cafeId)
  return cafe.trackTypes
    .filter((trackType) => trackType.isActive)
    .map((trackType) => ({
      id: trackType.id,
      cafe_id: cafe.id,
      track_type_id: trackType.id,
      track_type: {
        id: trackType.id,
        code: trackType.code,
        name: trackType.name,
        description: trackType.description,
      },
      max_concurrent: cafe.maxConcurrentBookings,
      byoc_capacity: cafe.byocCapacity,
      images: [],
      description: trackType.description,
      sort_order: trackType.sortOrder,
      is_active: trackType.isActive,
      created_at: cafe.createdAt,
      updated_at: cafe.updatedAt,
    }))
}

export const trackConfigApi = {
  listTrackConfigs: async (
    cafeId: string,
    options?: { includeInactive?: boolean },
  ): Promise<TrackConfig[]> => {
    try {
      const res = await api.get<ApiEnvelope<TrackConfig[]>>(
        `/v1/cafes/${cafeId}/track-configs`,
        options?.includeInactive ? { params: { include_inactive: true } } : undefined,
      )
      if (res.data.data.length > 0) return res.data.data
      return getFallbackTrackConfigs(cafeId)
    } catch (error) {
      if (!axios.isAxiosError(error)) {
        throw error
      }

      if (import.meta.env.DEV) {
        console.warn("[CafeAPI] Falling back to cafe.trackTypes for track configs", {
          cafeId,
          status: error.response?.status,
          message: error.response?.data,
        })
      }

      return getFallbackTrackConfigs(cafeId)
    }
  },

  createTrackConfig: async (cafeId: string, body: CreateTrackConfigBody): Promise<TrackConfig> => {
    const res = await api.post<ApiEnvelope<TrackConfig>>(`/v1/cafes/${cafeId}/track-configs`, body)
    return res.data.data
  },

  updateTrackConfig: async (cafeId: string, configId: string, body: UpdateTrackConfigBody): Promise<TrackConfig> => {
    const res = await api.patch<ApiEnvelope<TrackConfig>>(`/v1/cafes/${cafeId}/track-configs/${configId}`, body)
    return res.data.data
  },

  uploadTrackConfigImages: async (cafeId: string, configId: string, files: File[]): Promise<string[]> => {
    const formData = new FormData()
    files.forEach((file) => formData.append("files", file))
    const res = await api.post<ApiEnvelope<{ images: string[] }>>(
      `/v1/cafes/${cafeId}/track-configs/${configId}/images`,
      formData,
      { headers: { "Content-Type": "multipart/form-data" } },
    )
    return res.data.data.images
  },
}
