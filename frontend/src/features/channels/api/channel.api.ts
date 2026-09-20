import { api } from "@/shared/lib/axios"
import type { FbAuthUrlResponse, FbChannelStatusResponse } from "../types"

export const channelApi = {
  getAuthUrl: async (cafeId: string, returnPath?: string): Promise<FbAuthUrlResponse> => {
    const res = await api.get<FbAuthUrlResponse>("/v1/channels/facebook/auth-url", {
      params: { cafeId, returnPath },
    })
    return res.data
  },

  getStatus: async (cafeId: string): Promise<FbChannelStatusResponse> => {
    const res = await api.get<FbChannelStatusResponse>("/v1/channels/facebook/status", {
      params: { cafeId },
    })
    return res.data
  },

  testConnection: async (cafeId: string): Promise<{ pageName: string; pageId: string }> => {
    const res = await api.post<{ success: boolean; pageName: string; pageId: string }>(
      "/v1/channels/facebook/test",
      null,
      { params: { cafeId } },
    )
    return res.data
  },

  disconnect: async (cafeId: string): Promise<void> => {
    await api.delete("/v1/channels/facebook", { params: { cafeId } })
  },
}
