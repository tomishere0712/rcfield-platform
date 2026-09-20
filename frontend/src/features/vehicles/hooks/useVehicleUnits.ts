import { useQuery } from "@tanstack/react-query"
import { vehicleApi } from "../api/vehicle.api"
import { vehicleKeys } from "../constants/queryKeys"
import type { VehicleStatus } from "../types"

export function useVehicleUnits(
  cafeId: string,
  filters?: { status?: VehicleStatus; catalog_id?: string; search?: string; exclude_retired?: boolean },
) {
  return useQuery({
    queryKey: vehicleKeys.units(cafeId, filters),
    queryFn: () => vehicleApi.listUnits(cafeId, filters),
    enabled: !!cafeId,
  })
}

export function useVehicleUnitDetail(cafeId: string, catalogId: string, unitId: string) {
  return useQuery({
    queryKey: vehicleKeys.unit(cafeId, catalogId, unitId),
    queryFn: () => vehicleApi.getUnitDetail(cafeId, catalogId, unitId),
    enabled: !!cafeId && !!catalogId && !!unitId,
  })
}
