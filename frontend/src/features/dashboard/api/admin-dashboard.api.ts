import { api } from "@/shared/lib/axios"

export interface AdminKpiItem {
  value: string
  helper: string
}

export interface AdminKpi {
  totalCafes: AdminKpiItem
  totalUsers: AdminKpiItem
  totalRevenue?: AdminKpiItem
  monthlyRevenue?: AdminKpiItem
  activeSessions: AdminKpiItem
}

export interface CafeGrowthItem {
  name: string
  value: number
}

export interface SaaSRevenueItem {
  name: string
  count: number
  revenue: number
}

export interface ActiveSessionsTrendItem {
  name: string
  value: number
}

export interface RecentCafeItem {
  id: string
  name: string
  providerName: string
  email: string
  saasPlan: string
  status: string
  createdDate: string
}

export interface AdminDashboardSummary {
  kpi: AdminKpi
  cafeGrowth: CafeGrowthItem[]
  revenueByPlan: SaaSRevenueItem[]
  revenueByContestPlan: SaaSRevenueItem[]
  activeSessionsTrend: ActiveSessionsTrendItem[]
  recentCafes: RecentCafeItem[]
}

export const adminDashboardApi = {
  getSummary: async (params?: { period?: string; from?: string; to?: string }): Promise<AdminDashboardSummary> => {
    const res = await api.get<{ success: boolean; data: AdminDashboardSummary }>("/v1/admin/dashboard/summary", { params })
    return res.data.data
  },
}
