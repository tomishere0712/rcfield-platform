import { api } from "@/shared/lib/axios"
import type { NotificationListResponse } from "../types"

export const notificationApi = {
  list: async (params?: { page?: number; limit?: number; unread_only?: boolean }): Promise<NotificationListResponse> => {
    const res = await api.get<NotificationListResponse>("/v1/provider/notifications", { params })
    return res.data
  },

  markRead: async (id: string): Promise<void> => {
    await api.put(`/v1/provider/notifications/${id}/read`)
  },

  markAllRead: async (): Promise<{ success: boolean; updated: number }> => {
    const res = await api.put<{ success: boolean; updated: number }>("/v1/provider/notifications/read-all")
    return res.data
  },
}
