import { api } from "@/shared/lib/axios"
import type {
  ProviderSubscription,
  ProviderListItem,
  ProviderDetail,
  PaymentRequest,
  AdminPaymentRequestItem,
  PaymentRequestStatus,
  ProviderStatus,
  SubscriptionPlan,
  CafeListItem,
  ImpersonateResponse,
  TaxLookupResult,
  LedgerRow,
  LedgerSummary,
} from "../types"

interface PaginatedResponse<T> {
  data: T[]
  total: number
}

export const subscriptionApi = {
  getSubscriptionStatus: async (): Promise<{
    success: boolean
    data: ProviderSubscription | null
    /** Thời điểm đã tiêu suất dùng thử; null nghĩa là chưa dùng. */
    trial_used_at: string | null
    /**
     * Số kênh chat đang kết nối.
     *
     * Đến từ backend chứ không tự đếm ở đây: nó dùng chung câu truy vấn với
     * chốt chặn hạn mức, nên thanh hiển thị không thể lệch với thứ đang chặn.
     */
    channels_used: number
  }> => {
    const res = await api.get<{
      success: boolean
      data: ProviderSubscription | null
      trial_used_at: string | null
      channels_used: number
    }>("/v1/provider/subscription")
    return res.data
  },

  submitPaymentRequest: async (body: {
    plan_id: string
    transfer_reference: string
    transfer_date: string
    transfer_amount: number
  }): Promise<{ success: boolean; data: PaymentRequest }> => {
    const res = await api.post<{ success: boolean; data: PaymentRequest }>(
      "/v1/provider/payment-requests",
      body,
    )
    return res.data
  },

  listMyPaymentRequests: async (
    page = 1,
    limit = 20,
  ): Promise<PaginatedResponse<PaymentRequest>> => {
    const res = await api.get<PaginatedResponse<PaymentRequest>>(
      "/v1/provider/payment-requests",
      {
        params: { page, limit },
      },
    )
    return res.data
  },

  getPayOSLink: async (body: {
    plan_id?: string
    payment_request_id?: string
  }): Promise<{
    success: boolean
    data: { checkoutUrl: string; orderCode: number }
  }> => {
    const res = await api.post<{
      success: boolean
      data: { checkoutUrl: string; orderCode: number }
    }>("/v1/provider/payment-requests/payos-link", body)
    return res.data
  },

  verifyPayOSPayment: async (body: {
    orderCode: number
  }): Promise<{ success: boolean; data: PaymentRequest }> => {
    const res = await api.post<{
      success: boolean
      data: PaymentRequest
    }>("/v1/payments/payos/verify-payment", body)
    return res.data
  },

  /**
   * Tra mã số thuế trên dữ liệu Cục Thuế (qua backend, không gọi thẳng bên thứ ba).
   *
   * Luôn trả 200 — "không tìm thấy" là câu trả lời hợp lệ, không phải lỗi.
   */
  lookupBusiness: async (taxCode: string): Promise<TaxLookupResult> => {
    const res = await api.get<{ success: boolean; data: TaxLookupResult }>(
      `/v1/business-lookup/${encodeURIComponent(taxCode)}`,
    )
    return res.data.data
  },

  registerProvider: async (
    formData: FormData,
  ): Promise<{ success: boolean; data: { id: string; email: string } }> => {
    // Do NOT set Content-Type manually — browser sets multipart boundary automatically
    const res = await api.post<{
      success: boolean
      data: { id: string; email: string }
    }>("/v1/auth/register-provider", formData)
    return res.data
  },

  listProviders: async (params?: {
    status?: ProviderStatus
    page?: number
    limit?: number
  }): Promise<PaginatedResponse<ProviderListItem>> => {
    const res = await api.get<PaginatedResponse<ProviderListItem>>(
      "/v1/admin/providers",
      { params },
    )
    return res.data
  },

  getProviderDetail: async (
    id: string,
  ): Promise<{ success: boolean; data: ProviderDetail }> => {
    const res = await api.get<{ success: boolean; data: ProviderDetail }>(
      `/v1/admin/providers/${id}`,
    )
    return res.data
  },

  approveProvider: async (id: string): Promise<void> => {
    await api.post(`/v1/admin/providers/${id}/approve`)
  },

  rejectProvider: async (id: string, reason: string): Promise<void> => {
    await api.post(`/v1/admin/providers/${id}/reject`, { reason })
  },

  suspendProvider: async (id: string, reason: string): Promise<void> => {
    await api.post(`/v1/admin/providers/${id}/suspend`, { reason })
  },

  unsuspendProvider: async (id: string): Promise<void> => {
    await api.post(`/v1/admin/providers/${id}/unsuspend`)
  },

  listPlatformLedger: async (params: {
    source?: "SAAS" | "CONTEST_FEE"
    status?: string
    q?: string
    page?: number
    limit?: number
  }): Promise<{
    success: boolean
    data: LedgerRow[]
    summary: LedgerSummary
    total: number
    page: number
    limit: number
  }> => {
    const res = await api.get<{
      success: boolean
      data: LedgerRow[]
      summary: LedgerSummary
      total: number
      page: number
      limit: number
    }>("/v1/admin/payments", { params })
    return res.data
  },

  listAllPaymentRequests: async (params?: {
    status?: PaymentRequestStatus
    page?: number
    limit?: number
  }): Promise<PaginatedResponse<AdminPaymentRequestItem>> => {
    const res = await api.get<PaginatedResponse<AdminPaymentRequestItem>>(
      "/v1/admin/payment-requests",
      { params },
    )
    return res.data
  },

  confirmPaymentRequest: async (id: string, notes?: string): Promise<void> => {
    await api.post(`/v1/admin/payment-requests/${id}/confirm`, { notes })
  },

  rejectPaymentRequest: async (id: string, reason: string): Promise<void> => {
    await api.post(`/v1/admin/payment-requests/${id}/reject`, { reason })
  },

  listSubscriptionPlans: async (): Promise<SubscriptionPlan[]> => {
    const res = await api.get<SubscriptionPlan[]>("/v1/subscription-plans")
    return res.data
  },

  updateSubscriptionPlan: async (
    id: string,
    body: {
      branch_limit?: number
      ai_quota_per_month?: number
      channel_limit?: number
      price_per_month?: number
    },
  ): Promise<SubscriptionPlan> => {
    const res = await api.patch<SubscriptionPlan>(
      `/v1/admin/subscription-plans/${id}`,
      body,
    )
    return res.data
  },

  getProviderMe: async (): Promise<{
    success: boolean
    data: ProviderDetail
  }> => {
    const res = await api.get<{ success: boolean; data: ProviderDetail }>(
      "/v1/provider/me",
    )
    return res.data
  },

  updateProviderMe: async (body: {
    business_name?: string
    business_description?: string | null
    tax_code?: string
    business_email?: string
  }): Promise<ProviderDetail> => {
    const res = await api.patch<{ success: boolean; data: ProviderDetail }>(
      "/v1/provider/me",
      body,
    )
    return res.data.data
  },

  getProviderCafes: async (id: string): Promise<CafeListItem[]> => {
    const res = await api.get<{ data: CafeListItem[] }>(
      `/v1/admin/providers/${id}/cafes`,
    )
    return res.data.data
  },

  impersonateProvider: async (id: string): Promise<ImpersonateResponse> => {
    const res = await api.post<ImpersonateResponse>(
      `/v1/admin/providers/${id}/impersonate`,
    )
    return res.data
  },
}
