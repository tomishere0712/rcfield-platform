import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router"
import type { CafeSearchParams, SortOption } from "@/shared/data/explore-data"
import type { CafeViewMode, SearchTarget } from "./explore-utils"
import { getActiveFilterCount, normalizeFilterValue } from "./explore-utils"
import { PRICE_SLIDER_MAX, PRICE_SLIDER_MIN } from "./constants"

export function useExploreFilters() {
  const [searchParams] = useSearchParams()
  const [searchTarget, setSearchTarget] = useState<SearchTarget>("cafes")
  const [viewMode, setViewMode] = useState<CafeViewMode>("grid")
  const [query, setQuery] = useState(searchParams.get("query") ?? "")
  const [debouncedQuery, setDebouncedQuery] = useState(query)
  const [cafeId, setCafeId] = useState(normalizeFilterValue(searchParams.get("cafeId")))
  const [city, setCity] = useState(normalizeFilterValue(searchParams.get("city")))
  const [trackType, setTrackType] = useState(normalizeFilterValue(searchParams.get("trackType")))
  const [priceRange, setPriceRange] = useState(normalizeFilterValue(searchParams.get("priceRange")))
  const [feature, setFeature] = useState(normalizeFilterValue(searchParams.get("feature")))
  const [vehicleType, setVehicleType] = useState(normalizeFilterValue(searchParams.get("vehicleType")))
  const [date, setDate] = useState(searchParams.get("date") ?? "")
  const [time, setTime] = useState(normalizeFilterValue(searchParams.get("time")))
  const [playMode, setPlayMode] = useState(normalizeFilterValue(searchParams.get("playMode")))
  const [sortBy, setSortBy] = useState<SortOption>("popularity")
  const [priceMin, setPriceMin] = useState(PRICE_SLIDER_MIN)
  const [priceMax, setPriceMax] = useState(PRICE_SLIDER_MAX)
  const [popularFilters, setPopularFilters] = useState<string[]>([])

  const [prevParams, setPrevParams] = useState(searchParams)
  if (prevParams !== searchParams) {
    setPrevParams(searchParams)
    setQuery(searchParams.get("query") ?? "")
    setCafeId(normalizeFilterValue(searchParams.get("cafeId")))
    setCity(normalizeFilterValue(searchParams.get("city")))
    setTrackType(normalizeFilterValue(searchParams.get("trackType")))
    setPriceRange(normalizeFilterValue(searchParams.get("priceRange")))
    setFeature(normalizeFilterValue(searchParams.get("feature")))
    setVehicleType(normalizeFilterValue(searchParams.get("vehicleType")))
    setDate(searchParams.get("date") ?? "")
    setTime(normalizeFilterValue(searchParams.get("time")))
    setPlayMode(normalizeFilterValue(searchParams.get("playMode")))
  }

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300)
    return () => clearTimeout(timer)
  }, [query])

  const params: CafeSearchParams = useMemo(
    () => ({
      query: debouncedQuery,
      cafeId,
      city,
      trackType,
      priceRange,
      feature,
      vehicleType,
      date,
      time,
      playMode,
      sortBy,
      priceMin,
      priceMax,
      popularFilters,
    }),
    [debouncedQuery, cafeId, city, trackType, priceRange, feature, vehicleType, date, time, playMode, sortBy, priceMin, priceMax, popularFilters],
  )

  const activeFilterCount = useMemo(() => getActiveFilterCount(params), [params])

  const clearFilters = () => {
    setQuery("")
    setDebouncedQuery("")
    setCafeId("all")
    setCity("all")
    setTrackType("all")
    setPriceRange("all")
    setFeature("all")
    setVehicleType("all")
    setDate("")
    setTime("all")
    setPlayMode("all")
    setSortBy("popularity")
    setPriceMin(PRICE_SLIDER_MIN)
    setPriceMax(PRICE_SLIDER_MAX)
    setPopularFilters([])
  }

  const resetPriceSlider = () => {
    setPriceMin(PRICE_SLIDER_MIN)
    setPriceMax(PRICE_SLIDER_MAX)
  }

  const togglePopularFilter = (filter: string) => {
    setPopularFilters((prev) =>
      prev.includes(filter) ? prev.filter((f) => f !== filter) : [...prev, filter],
    )
  }

  return {
    activeFilterCount,
    clearFilters,
    params,
    searchTarget,
    setSearchTarget,
    viewMode,
    setViewMode,
    query,
    setQuery,
    cafeId,
    setCafeId,
    city,
    setCity,
    trackType,
    setTrackType,
    priceRange,
    setPriceRange,
    feature,
    setFeature,
    vehicleType,
    setVehicleType,
    date,
    setDate,
    time,
    setTime,
    playMode,
    setPlayMode,
    sortBy,
    setSortBy,
    priceMin,
    setPriceMin,
    priceMax,
    setPriceMax,
    popularFilters,
    setPopularFilters,
    togglePopularFilter,
    resetPriceSlider,
  }
}
