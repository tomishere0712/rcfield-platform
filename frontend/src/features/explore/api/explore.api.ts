import { cafeApi } from "@/features/cafes/api/cafe.api"
import { mapCafesToExploreCafes, toCafeListParams } from "@/features/cafes/lib/cafe.mappers"
import type { Cafe, CafeSearchParams } from "@/shared/data/explore-data"

export async function getCafes(params: CafeSearchParams = {}): Promise<Cafe[]> {
  const response = await cafeApi.listCafes(toCafeListParams(params))
  return mapCafesToExploreCafes(response.data)
}
