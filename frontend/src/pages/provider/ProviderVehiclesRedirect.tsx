import { useQuery } from "@tanstack/react-query"
import { cafeApi, cafeQueryKeys } from "@/features/cafes/api/cafe.api"
import { useSearchParams, Navigate } from "react-router"

export function ProviderVehiclesRedirect() {
  const [searchParams] = useSearchParams()
  const queryCafeId = searchParams.get("cafeId") || ""
  const tab = searchParams.get("tab") || "catalogs"

  const { data: cafesData, isLoading } = useQuery({
    queryKey: cafeQueryKeys.list({ page: 1, limit: 100, scope: "managed" }),
    queryFn: () => cafeApi.listCafes({ page: 1, limit: 100, scope: "managed" }),
  })

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#fcf8f8]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-orange-600 border-t-transparent" />
      </div>
    )
  }

  const cafes = cafesData?.data ?? []
  const selectedCafeId = queryCafeId || cafes[0]?.id || ""

  if (!selectedCafeId) {
    return <Navigate replace to="/provider/cafes" />
  }

  return <Navigate replace to={`/provider/cafes/${selectedCafeId}?tab=${tab}`} />
}
