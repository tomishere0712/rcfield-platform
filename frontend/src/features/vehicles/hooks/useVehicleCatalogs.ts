import { useQuery } from "@tanstack/react-query"
import { vehicleApi } from "../api/vehicle.api"
import { vehicleKeys } from "../constants/queryKeys"

export function useVehicleCatalogs(cafeId: string) {
  return useQuery({
    queryKey: vehicleKeys.catalogs(cafeId),
    queryFn: () => vehicleApi.listCatalogs(cafeId),
    enabled: !!cafeId,
  })
}

export function useVehicleCatalogDetail(cafeId: string, catalogId: string) {
  return useQuery({
    queryKey: vehicleKeys.catalog(cafeId, catalogId),
    queryFn: () => vehicleApi.getCatalogDetail(cafeId, catalogId),
    enabled: !!cafeId && !!catalogId,
  })
}
