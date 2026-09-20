import { api } from "@/shared/lib/axios"
import type { KycStatusResponse } from "../types"

export const kycApi = {
  getKycStatus: async (): Promise<{ success: boolean; data: KycStatusResponse }> => {
    const res = await api.get<{ success: boolean; data: KycStatusResponse }>("/v1/provider/kyc/status")
    return res.data
  },

  resubmitKyc: async (
    formData: FormData,
  ): Promise<{ success: boolean; data: { status: string; kycSubmittedAt: string } }> => {
    const res = await api.post<{ success: boolean; data: { status: string; kycSubmittedAt: string } }>(
      "/v1/provider/kyc/resubmit",
      formData,
    )
    return res.data
  },
}
