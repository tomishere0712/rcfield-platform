import { api } from "@/shared/lib/axios"
import type {
  ProviderKpi,
  RevenueTrendItem,
  RevenueBreakdownItem,
  BookingChannelItem,
  BranchPerformanceItem,
  BranchOperationsItem,
  RecentBookingItem,
  RevenuePeriod,
  ProviderTopStats,
  AiInsightResult,
} from "../types/dashboard.types"

export const providerDashboardApi = {
  getKpi: async (params: { from?: string; to?: string; cafeId?: string | null }): Promise<ProviderKpi> => {
    const res = await api.get<{ success: boolean; data: ProviderKpi }>("/v1/provider/dashboard/kpi", {
      params: {
        from: params.from || undefined,
        to: params.to || undefined,
        cafeId: params.cafeId || undefined,
      },
    })
    return res.data.data
  },

  getRevenueTrend: async (params: {
    period: RevenuePeriod
    from?: string
    to?: string
    cafeId?: string | null
  }): Promise<RevenueTrendItem[]> => {
    const res = await api.get<{ success: boolean; data: RevenueTrendItem[] }>("/v1/provider/dashboard/revenue-trend", {
      params: {
        period: params.period,
        from: params.from || undefined,
        to: params.to || undefined,
        cafeId: params.cafeId || undefined,
      },
    })
    return res.data.data
  },

  getRevenueBreakdown: async (params: {
    from?: string
    to?: string
    cafeId?: string | null
  }): Promise<RevenueBreakdownItem[]> => {
    const res = await api.get<{ success: boolean; data: RevenueBreakdownItem[] }>("/v1/provider/dashboard/revenue-breakdown", {
      params: {
        from: params.from || undefined,
        to: params.to || undefined,
        cafeId: params.cafeId || undefined,
      },
    })
    return res.data.data
  },

  getBookingChannels: async (params: {
    from?: string
    to?: string
    cafeId?: string | null
  }): Promise<BookingChannelItem[]> => {
    const res = await api.get<{ success: boolean; data: BookingChannelItem[] }>(
      "/v1/provider/dashboard/booking-channels",
      {
        params: {
          from: params.from || undefined,
          to: params.to || undefined,
          cafeId: params.cafeId || undefined,
        },
      },
    )
    return res.data.data
  },

  getBranchPerformance: async (params: { from?: string; to?: string }): Promise<BranchPerformanceItem[]> => {
    const res = await api.get<{ success: boolean; data: BranchPerformanceItem[] }>("/v1/provider/dashboard/branch-performance", {
      params: {
        from: params.from || undefined,
        to: params.to || undefined,
      },
    })
    return res.data.data
  },

  getBranchOperations: async (params: { from?: string; to?: string } = {}): Promise<BranchOperationsItem[]> => {
    const res = await api.get<{ success: boolean; data: BranchOperationsItem[] }>("/v1/provider/dashboard/branch-operations", {
      params: {
        from: params.from || undefined,
        to: params.to || undefined,
      },
    })
    return res.data.data
  },

  getRecentBookings: async (params: {
    limit?: number
    from?: string
    to?: string
    cafeId?: string | null
  }): Promise<RecentBookingItem[]> => {
    const res = await api.get<{ success: boolean; data: RecentBookingItem[] }>("/v1/provider/dashboard/recent-bookings", {
      params: {
        limit: params.limit || undefined,
        from: params.from || undefined,
        to: params.to || undefined,
        cafeId: params.cafeId || undefined,
      },
    })
    return res.data.data
  },

  getTopStats: async (params: {
    from?: string
    to?: string
    cafeId?: string | null
  }): Promise<ProviderTopStats> => {
    const res = await api.get<{ success: boolean; data: ProviderTopStats }>("/v1/provider/dashboard/top-stats", {
      params: {
        from: params.from || undefined,
        to: params.to || undefined,
        cafeId: params.cafeId || undefined,
      },
    })
    return res.data.data
  },

  generateAiInsights: async (params: {
    from: string
    to: string
    cafeId?: string | null
  }): Promise<AiInsightResult> => {
    const res = await api.post<{ success: boolean; type: string; data: AiInsightResult["data"] }>(
      "/v1/provider/dashboard/ai-insights",
      undefined,
      {
        params: {
          from: params.from,
          to: params.to,
          cafeId: params.cafeId || undefined,
        },
      },
    )
    return { type: res.data.type, data: res.data.data } as AiInsightResult
  },

  getProviderFeatureFlags: async (): Promise<Record<string, boolean>> => {
    const res = await api.get<{ success: boolean; data: Record<string, boolean> }>(
      "/v1/provider/dashboard/feature-flags",
    )
    return res.data.data
  },
}
