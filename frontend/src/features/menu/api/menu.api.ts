import { api } from "@/shared/lib/axios"
import type {
  ApiEnvelope,
  ComboUpsertBody,
  MenuCategory,
  MenuCategoryUpsertBody,
  MenuItem,
  MenuListParams,
  MenuListResponse,
  MenuUpsertBody,
  PopularMenuItem,
} from "../types"

function debugMenuApi(message: string, details?: unknown) {
  if (import.meta.env.DEV) {
    console.debug(`[MenuAPI] ${message}`, details ?? "")
  }
}

export const menuQueryKeys = {
  all: ["menu"] as const,
  list: (cafeId?: string, params?: MenuListParams) => [...menuQueryKeys.all, "list", cafeId, params ?? {}] as const,
}

export const menuCategoryQueryKeys = {
  all: ["menu-categories"] as const,
  list: (cafeId?: string) => [...menuCategoryQueryKeys.all, "list", cafeId] as const,
}

export const popularMenuQueryKeys = {
  all: ["menu-popular"] as const,
  list: (cafeId?: string) => [...popularMenuQueryKeys.all, "list", cafeId] as const,
}

export const menuApi = {
  listMenuItems: async (cafeId: string, params: MenuListParams = {}): Promise<MenuListResponse> => {
    debugMenuApi("GET /v1/cafes/:cafeId/menu", { cafeId, params })
    const response = await api.get<MenuListResponse>(`/v1/cafes/${cafeId}/menu`, { params })
    debugMenuApi("GET /v1/cafes/:cafeId/menu response", {
      cafeId,
      total: response.data.meta.total,
      count: response.data.data.length,
    })
    return response.data
  },

  createMenuItem: async (cafeId: string, body: MenuUpsertBody): Promise<MenuItem> => {
    debugMenuApi("POST /v1/cafes/:cafeId/menu", { cafeId, name: body.name, categoryId: body.category_id })
    const response = await api.post<ApiEnvelope<MenuItem>>(`/v1/cafes/${cafeId}/menu`, body)
    return response.data.data
  },

  updateMenuItem: async (cafeId: string, itemId: string, body: Partial<MenuUpsertBody>): Promise<MenuItem> => {
    debugMenuApi("PATCH /v1/cafes/:cafeId/menu/:itemId", { cafeId, itemId, fields: Object.keys(body) })
    const response = await api.patch<ApiEnvelope<MenuItem>>(`/v1/cafes/${cafeId}/menu/${itemId}`, body)
    return response.data.data
  },

  deleteMenuItem: async (cafeId: string, itemId: string): Promise<void> => {
    debugMenuApi("DELETE /v1/cafes/:cafeId/menu/:itemId", { cafeId, itemId })
    await api.delete(`/v1/cafes/${cafeId}/menu/${itemId}`)
  },

  createCombo: async (cafeId: string, body: ComboUpsertBody): Promise<MenuItem> => {
    debugMenuApi("POST /v1/cafes/:cafeId/menu/combos", { cafeId, name: body.name })
    const response = await api.post<ApiEnvelope<MenuItem>>(`/v1/cafes/${cafeId}/menu/combos`, body)
    return response.data.data
  },

  updateCombo: async (cafeId: string, itemId: string, body: Partial<ComboUpsertBody>): Promise<MenuItem> => {
    debugMenuApi("PATCH /v1/cafes/:cafeId/menu/combos/:itemId", { cafeId, itemId })
    const response = await api.patch<ApiEnvelope<MenuItem>>(`/v1/cafes/${cafeId}/menu/combos/${itemId}`, body)
    return response.data.data
  },

  listPopularItems: async (cafeId: string): Promise<PopularMenuItem[]> => {
    debugMenuApi("GET /v1/cafes/:cafeId/menu/popular", { cafeId })
    const response = await api.get<ApiEnvelope<PopularMenuItem[]>>(`/v1/cafes/${cafeId}/menu/popular`)
    return response.data.data
  },

  // ── Danh mục ────────────────────────────────────────────────────────────────

  listCategories: async (cafeId: string): Promise<MenuCategory[]> => {
    debugMenuApi("GET /v1/cafes/:cafeId/menu/categories", { cafeId })
    const response = await api.get<ApiEnvelope<MenuCategory[]>>(`/v1/cafes/${cafeId}/menu/categories`)
    return response.data.data
  },

  createCategory: async (cafeId: string, body: MenuCategoryUpsertBody): Promise<MenuCategory> => {
    debugMenuApi("POST /v1/cafes/:cafeId/menu/categories", { cafeId, name: body.name })
    const response = await api.post<ApiEnvelope<MenuCategory>>(`/v1/cafes/${cafeId}/menu/categories`, body)
    return response.data.data
  },

  updateCategory: async (cafeId: string, categoryId: string, body: MenuCategoryUpsertBody): Promise<MenuCategory> => {
    debugMenuApi("PATCH /v1/cafes/:cafeId/menu/categories/:categoryId", { cafeId, categoryId })
    const response = await api.patch<ApiEnvelope<MenuCategory>>(
      `/v1/cafes/${cafeId}/menu/categories/${categoryId}`,
      body,
    )
    return response.data.data
  },

  deleteCategory: async (cafeId: string, categoryId: string): Promise<void> => {
    debugMenuApi("DELETE /v1/cafes/:cafeId/menu/categories/:categoryId", { cafeId, categoryId })
    await api.delete(`/v1/cafes/${cafeId}/menu/categories/${categoryId}`)
  },

  reorderCategories: async (cafeId: string, categoryIds: string[]): Promise<MenuCategory[]> => {
    debugMenuApi("PATCH /v1/cafes/:cafeId/menu/categories/reorder", { cafeId, count: categoryIds.length })
    const response = await api.patch<ApiEnvelope<MenuCategory[]>>(
      `/v1/cafes/${cafeId}/menu/categories/reorder`,
      { category_ids: categoryIds },
    )
    return response.data.data
  },
}
