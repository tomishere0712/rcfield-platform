import { useQuery } from "@tanstack/react-query"
import { adminDashboardApi } from "../api/admin-dashboard.api"

export function useAdminDashboard(params?: { period?: string; from?: string; to?: string }) {
  const query = useQuery({
    queryKey: ["admin-dashboard", "summary", params],
    queryFn: () => adminDashboardApi.getSummary(params),
    staleTime: 30000,
  })

  return {
    summary: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  }
}
export type UseAdminDashboardReturn = ReturnType<typeof useAdminDashboard>;
