import { api } from "@/shared/lib/axios"
import type { FeaturedPopupItem } from "@/features/explore/api/featured-popup.api"

export type FeaturedPopupUpsertBody = {
  title: string
  subtitle?: string | null
  image_url?: string | null
  cta_label: string
  cta_url?: string | null
  contest_id?: string | null
  starts_at: string
  ends_at: string
  is_active?: boolean
  priority?: number
}

export const adminFeaturedPopupApi = {
  list: async (): Promise<FeaturedPopupItem[]> => {
    const res = await api.get<{ success: boolean; data: FeaturedPopupItem[] }>(
      "/v1/admin/featured-popups",
    )
    return res.data.data ?? []
  },

  create: async (body: FeaturedPopupUpsertBody): Promise<FeaturedPopupItem> => {
    const res = await api.post<{ success: boolean; data: FeaturedPopupItem }>(
      "/v1/admin/featured-popups",
      body,
    )
    return res.data.data
  },

  update: async (
    popupId: string,
    body: Partial<FeaturedPopupUpsertBody>,
  ): Promise<FeaturedPopupItem> => {
    const res = await api.patch<{ success: boolean; data: FeaturedPopupItem }>(
      `/v1/admin/featured-popups/${popupId}`,
      body,
    )
    return res.data.data
  },
}
