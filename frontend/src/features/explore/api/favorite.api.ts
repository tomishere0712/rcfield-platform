import { api } from "@/shared/lib/axios"

export const favoriteApi = {
  getFavorites: async (): Promise<string[]> => {
    const res = await api.get<{ success: boolean; data: string[] }>("/v1/customer/favorites")
    return res.data.data
  },

  addFavorite: async (cafeId: string): Promise<void> => {
    await api.post(`/v1/customer/favorites/${cafeId}`)
  },

  removeFavorite: async (cafeId: string): Promise<void> => {
    await api.delete(`/v1/customer/favorites/${cafeId}`)
  },

  syncFavorites: async (cafeIds: string[]): Promise<string[]> => {
    const res = await api.post<{ success: boolean; data: string[] }>("/v1/customer/favorites/sync", { cafeIds })
    return res.data.data
  },
}
