import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import { LayoutGrid, List } from "lucide-react"
import { trackTypeApi, trackTypeQueryKeys } from "@/features/cafes/api/cafe.api"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select"
import { SORT_OPTIONS, FEATURE_OPTIONS } from "../constants"
import type { SortOption } from "@/shared/data/explore-data"

interface ExploreResultsHeaderProps {
  city: string
  resultCount: number
  sortBy: SortOption
  onSortByChange: (v: SortOption) => void
  viewMode: "grid" | "list"
  onViewModeChange: (v: "grid" | "list") => void
  // Inline filter chips
  trackType: string
  onTrackTypeChange: (v: string) => void
  feature: string
  onFeatureChange: (v: string) => void
  vehicleType: string
  onVehicleTypeChange: (v: string) => void
  priceRange: string
  onPriceRangeChange: (v: string) => void
  query: string
  onQueryChange: (v: string) => void
}

const VEHICLE_OPTIONS = [
  { value: "all", label: "Loại xe" },
  { value: "Drift", label: "Drift" },
  { value: "Offroad", label: "Offroad" },
  { value: "Touring", label: "Touring" },
  { value: "Mini", label: "Mini-Z" },
]

export function ExploreResultsHeader({
  city,
  resultCount,
  sortBy,
  onSortByChange,
  viewMode,
  onViewModeChange,
  trackType,
  onTrackTypeChange,
  feature,
  onFeatureChange,
  vehicleType,
  onVehicleTypeChange,
  query,
  onQueryChange,
}: ExploreResultsHeaderProps) {
  const { data: trackTypes = [] } = useQuery({
    queryKey: trackTypeQueryKeys.all,
    queryFn: () => trackTypeApi.listAll(),
  })

  const trackOptions = useMemo(
    () => [
      { value: "all", label: "Loại sân" },
      ...trackTypes.map((t) => ({ value: t.code, label: t.name })),
    ],
    [trackTypes],
  )

  const cityLabel = city === "all" ? "Tất cả" : city

  return (
    <div className="space-y-3">
      {/* Title row */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{cityLabel}</h1>
          <p className="text-sm text-slate-500">{resultCount} nơi giao lưu được tìm thấy</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="hidden text-sm text-slate-500 sm:inline">Xếp theo:</span>
            <Select value={sortBy} onValueChange={(v) => onSortByChange(v as SortOption)}>
              <SelectTrigger className="h-9 w-[160px] rounded-lg border-slate-200 bg-white text-sm font-semibold text-orange-600 focus:ring-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden text-sm text-slate-500 sm:inline">Xem:</span>
            <div className="flex items-center rounded-full border border-slate-200 bg-white p-0.5 shadow-sm">
              <button
                type="button"
                onClick={() => onViewModeChange("grid")}
                className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                  viewMode === "grid"
                    ? "bg-orange-50 text-orange-600"
                    : "text-slate-400 hover:text-slate-600"
                }`}
                title="Xem dạng ô"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <div className="h-4 w-px bg-slate-200" />
              <button
                type="button"
                onClick={() => onViewModeChange("list")}
                className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                  viewMode === "list"
                    ? "bg-orange-50 text-orange-600"
                    : "text-slate-400 hover:text-slate-600"
                }`}
                title="Xem dạng danh sách"
              >
                <List className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Search + filter chips row — desktop */}
      <div className="hidden items-center gap-2 md:flex">
        {/* Search input inline */}
        <div className="relative flex flex-1 items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 focus-within:border-orange-500">
          <input
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Tìm kiếm cơ sở..."
            className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
          />
        </div>

        <InlineFilterChip
          value={trackType}
          onChange={onTrackTypeChange}
          options={trackOptions}
        />
        <InlineFilterChip
          value={feature}
          onChange={onFeatureChange}
          options={FEATURE_OPTIONS.map((f) => ({ value: f.value, label: f.value === "all" ? "Tiện ích" : f.label }))}
        />
        <InlineFilterChip
          value={vehicleType}
          onChange={onVehicleTypeChange}
          options={VEHICLE_OPTIONS}
        />
      </div>
    </div>
  )
}

function InlineFilterChip({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  const isActive = value !== "all" && value !== ""
  return (
    <Select value={value || "all"} onValueChange={onChange}>
      <SelectTrigger
        className={`h-8 shrink-0 rounded-full border px-3 text-xs font-semibold transition-colors focus:ring-0 ${
          isActive
            ? "border-slate-800 bg-slate-800 text-white [&>svg]:text-white"
            : "border-slate-200 bg-white text-slate-700"
        }`}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
