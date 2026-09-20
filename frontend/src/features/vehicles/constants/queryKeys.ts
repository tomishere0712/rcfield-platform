export const vehicleKeys = {
  all: ["vehicles"] as const,
  catalogs: (cafeId: string) => [...vehicleKeys.all, "catalogs", cafeId] as const,
  catalog: (cafeId: string, catalogId: string) => [...vehicleKeys.catalogs(cafeId), catalogId] as const,
  units: (cafeId: string, filters?: unknown) => 
    filters
      ? ([...vehicleKeys.all, "units", cafeId, filters] as const)
      : ([...vehicleKeys.all, "units", cafeId] as const),
  unit: (cafeId: string, catalogId: string, unitId: string) => [...vehicleKeys.all, "unit", cafeId, catalogId, unitId] as const,
}
