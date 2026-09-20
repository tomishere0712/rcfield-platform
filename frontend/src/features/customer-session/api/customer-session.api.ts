import { api } from "@/shared/lib/axios"
import type { MockSessionDetail } from "@/shared/data/customer-operational-mock-data"

export const customerSessionApi = {
  getSessionDetail: async (sessionId: string): Promise<MockSessionDetail> => {
    const res = await api.get<{ success: boolean; data: MockSessionDetail }>(`/v1/sessions/${sessionId}`)
    return res.data.data
  },

  confirmInspection: async (
    sessionId: string,
    inspectionId: string,
    data: { agreed: boolean; disagreementNote?: string },
  ): Promise<{ success: boolean; agreed: boolean; sessionStatus: string }> => {
    const res = await api.post<{
      success: boolean
      data: { success: boolean; agreed: boolean; sessionStatus: string }
    }>(`/v1/sessions/${sessionId}/inspections/${inspectionId}/confirm`, data)
    return res.data.data
  },

  respondExtension: async (
    sessionId: string,
    approved: boolean,
  ): Promise<{ success: boolean; approved: boolean; newPlannedEnd: string; sessionStatus: string }> => {
    const res = await api.post<{
      success: boolean
      data: { success: boolean; approved: boolean; newPlannedEnd: string; sessionStatus: string }
    }>(`/v1/sessions/${sessionId}/extensions/respond`, { approved })
    return res.data.data
  },
}
