import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  ChevronDown,
  ChevronUp,
  Flag,
  Maximize2,
  RotateCcw,
} from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import {
  trackTypeApi,
  trackTypeQueryKeys,
  amenityApi,
  amenityQueryKeys,
} from "@/features/cafes/api/cafe.api"
import { AmenityIcon } from "@/features/cafes/lib/amenity-icon"
import {
  PRICE_SLIDER_MAX,
  PRICE_SLIDER_MIN,
  PRICE_SLIDER_STEP,
} from "../constants"
import { ExploreMapPanel } from "./ExploreMapPanel"
import type { Cafe } from "@/shared/data/explore-data"
import type { UserLocation, MapBounds } from "../explore-utils"

const emphasizedEase: [number, number, number, number] = [0.22, 1, 0.36, 1]

interface ExploreLeftSidebarProps {
  cafes: Cafe[]
  onSelectCafe: (cafe: Cafe) => void
  userLocation: UserLocation | null
  onUserLocation: (loc: UserLocation | null) => void
  hoveredCafeId: string | null
  onBoundsChange: (bounds: MapBounds) => void
  searchOnMove: boolean
  onSearchOnMoveChange: (v: boolean) => void
  priceMin: number
  priceMax: number
  onPriceMinChange: (v: number) => void
  onPriceMaxChange: (v: number) => void
  onResetPrice: () => void
  popularFilters: string[]
  onTogglePopularFilter: (filter: string) => void
  activeFilterCount: number
  onClearAll: () => void
  /** Mở lớp bản đồ toàn màn hình — state do ExplorePage giữ. */
  onOpenFullMap: () => void
}

const sidebarVariants = {
  hidden: { opacity: 0, x: -20 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { staggerChildren: 0.08, delayChildren: 0.15 },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: emphasizedEase },
  },
}

export function ExploreLeftSidebar({
  cafes,
  onSelectCafe,
  userLocation,
  onUserLocation,
  hoveredCafeId,
  onBoundsChange,
  searchOnMove,
  onSearchOnMoveChange,
  priceMin,
  priceMax,
  onPriceMinChange,
  onPriceMaxChange,
  onResetPrice,
  popularFilters,
  onTogglePopularFilter,
  activeFilterCount,
  onClearAll,
  onOpenFullMap,
}: ExploreLeftSidebarProps) {
  const [showAllPopular, setShowAllPopular] = useState(false)

  const { data: trackTypes = [] } = useQuery({
    queryKey: trackTypeQueryKeys.all,
    queryFn: () => trackTypeApi.listAll(),
  })

  const { data: amenities = [] } = useQuery({
    queryKey: amenityQueryKeys.all,
    queryFn: () => amenityApi.listAll(),
  })

  const popularOptions = useMemo(() => {
    // `icon` của tiện ích là TỪ KHOÁ ("timer", "tool"...), không phải emoji.
    // Trước đây đưa thẳng ra JSX nên bộ lọc hiện chữ "timer" cạnh tên tiện ích.
    // Giữ nguyên từ khoá ở đây, để `AmenityIcon` dịch sang icon lúc render.
    const trackTags = trackTypes
      .filter((t) => t.isActive)
      .map((t) => ({
        id: t.id,
        label: t.name,
        kind: "track" as const,
        iconKeyword: null,
      }))

    const amenityTags = amenities.map((a) => ({
      id: a.title,
      label: a.title,
      kind: "amenity" as const,
      iconKeyword: a.icon ?? null,
    }))

    return [...trackTags, ...amenityTags]
  }, [trackTypes, amenities])

  const visibleOptions = showAllPopular
    ? popularOptions
    : popularOptions.slice(0, 5)
  const isPriceModified =
    priceMin > PRICE_SLIDER_MIN || priceMax < PRICE_SLIDER_MAX

  return (
    <motion.aside
      variants={sidebarVariants}
      initial="hidden"
      animate="visible"
      className="flex w-full flex-col gap-4 py-2"
    >
      {/* Map — enlarged to 280px */}
      <motion.div
        variants={itemVariants}
        className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-100 shadow-sm"
      >
        <div className="h-[280px]">
          <ExploreMapPanel
            cafes={cafes}
            onSelectCafe={onSelectCafe}
            userLocation={userLocation}
            onUserLocation={onUserLocation}
            hoveredCafeId={hoveredCafeId}
            onBoundsChange={onBoundsChange}
          />
        </div>
        {/*
          Nút nhỏ ở góc trái thay cho dải phủ kín đáy bản đồ trước đây: dải đó đè
          lên dòng ghi công Leaflet/OpenStreetMap (bắt buộc phải đọc được) và chồng
          lên các control khác trong khung bản đồ chỉ rộng 280px.
        */}
        <button
          type="button"
          onClick={onOpenFullMap}
          className="absolute bottom-3 left-3 z-10 inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/95 px-3 py-1.5 text-xs font-bold text-slate-700 shadow-md backdrop-blur transition hover:bg-white"
        >
          <Maximize2 className="h-3.5 w-3.5" />
          Toàn màn hình
        </button>
      </motion.div>

      {/* Tách khỏi khung bản đồ — nhãn dài, để trong map thì luôn đè lên nút vị trí */}
      <motion.label
        variants={itemVariants}
        className="flex cursor-pointer select-none items-center gap-2.5 rounded-2xl border border-slate-200/80 bg-white px-4 py-3 text-xs font-semibold text-slate-700 shadow-sm"
      >
        <input
          type="checkbox"
          checked={searchOnMove}
          onChange={(event) => onSearchOnMoveChange(event.target.checked)}
          className="h-4 w-4 accent-orange-600"
        />
        Tìm kiếm khi di chuyển bản đồ
      </motion.label>

      {/* Price range */}
      <motion.div
        variants={itemVariants}
        className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm"
      >
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-bold text-slate-900">Khoảng giá</h4>
          <AnimatePresence>
            {isPriceModified && (
              <motion.button
                type="button"
                onClick={onResetPrice}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="text-xs font-semibold text-orange-600 hover:text-orange-700 transition-colors"
              >
                Đặt lại
              </motion.button>
            )}
          </AnimatePresence>
        </div>
        <p className="mt-1 text-xs text-slate-500">Giá mỗi slot</p>

        {/* Dual range slider */}
        <div className="relative mt-4 h-1.5">
          <div className="absolute inset-0 rounded-full bg-slate-200" />
          <motion.div
            className="absolute h-full rounded-full bg-orange-600"
            animate={{
              left: `${(priceMin / PRICE_SLIDER_MAX) * 100}%`,
              right: `${100 - (priceMax / PRICE_SLIDER_MAX) * 100}%`,
            }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          />
          <input
            type="range"
            min={PRICE_SLIDER_MIN}
            max={PRICE_SLIDER_MAX}
            step={PRICE_SLIDER_STEP}
            value={priceMin}
            onChange={(e) => {
              const val = Number(e.target.value)
              if (val < priceMax) onPriceMinChange(val)
            }}
            className="pointer-events-none absolute inset-0 w-full appearance-none bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-orange-600 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-sm"
          />
          <input
            type="range"
            min={PRICE_SLIDER_MIN}
            max={PRICE_SLIDER_MAX}
            step={PRICE_SLIDER_STEP}
            value={priceMax}
            onChange={(e) => {
              const val = Number(e.target.value)
              if (val > priceMin) onPriceMaxChange(val)
            }}
            className="pointer-events-none absolute inset-0 w-full appearance-none bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-orange-600 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-sm"
          />
        </div>

        {/* Price inputs */}
        <div className="mt-4 flex items-center gap-2">
          <div className="flex flex-1 items-center rounded-lg border border-slate-200 px-2 py-1.5">
            <input
              type="number"
              value={priceMin}
              onChange={(e) => {
                const val = Number(e.target.value)
                if (val >= PRICE_SLIDER_MIN && val < priceMax)
                  onPriceMinChange(val)
              }}
              className="w-full bg-transparent text-xs font-medium text-slate-700 outline-none"
            />
            <span className="ml-1 text-xs text-slate-400">VND</span>
          </div>
          <span className="text-xs text-slate-400">–</span>
          <div className="flex flex-1 items-center rounded-lg border border-slate-200 px-2 py-1.5">
            <input
              type="number"
              value={priceMax}
              onChange={(e) => {
                const val = Number(e.target.value)
                if (val <= PRICE_SLIDER_MAX && val > priceMin)
                  onPriceMaxChange(val)
              }}
              className="w-full bg-transparent text-xs font-medium text-slate-700 outline-none"
            />
            <span className="ml-1 text-xs text-slate-400">VND</span>
          </div>
        </div>
      </motion.div>

      {/* Popular filters */}
      <motion.div
        variants={itemVariants}
        className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm"
      >
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-bold text-slate-900">Lọc phổ biến</h4>
          <button
            type="button"
            onClick={() => setShowAllPopular(!showAllPopular)}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            {showAllPopular ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
        </div>

        <div className="mt-3 space-y-1">
          {visibleOptions.length === 0 && (
            <p className="text-xs text-slate-400">Đang tải bộ lọc...</p>
          )}
          <AnimatePresence mode="popLayout">
            {visibleOptions.map((opt, index) => {
              const isSelected = popularFilters.includes(opt.id)
              return (
                <motion.label
                  key={opt.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ delay: index * 0.03, duration: 0.2 }}
                  className="flex cursor-pointer items-center gap-2.5 rounded-lg px-1 py-1.5 transition-colors hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onTogglePopularFilter(opt.id)}
                    className="h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-200 accent-orange-600"
                  />
                  <span className="shrink-0 text-slate-500">
                    {opt.kind === "track" ? (
                      <Flag className="size-4" />
                    ) : (
                      <AmenityIcon
                        keyword={opt.iconKeyword}
                        className="size-4"
                      />
                    )}
                  </span>
                  <span className="text-sm font-medium text-slate-700">
                    {opt.label}
                  </span>
                </motion.label>
              )
            })}
          </AnimatePresence>
        </div>

        {popularOptions.length > 5 && (
          <button
            type="button"
            onClick={() => setShowAllPopular(!showAllPopular)}
            className="mt-2 text-xs font-semibold text-orange-600 hover:text-orange-700 transition-colors"
          >
            {showAllPopular
              ? "Thu gọn"
              : `Xem Tất cả (${popularOptions.length})`}
          </button>
        )}
      </motion.div>

      {/* Clear all */}
      <AnimatePresence>
        {activeFilterCount > 0 && (
          <motion.button
            type="button"
            onClick={onClearAll}
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ duration: 0.25 }}
            className="flex items-center justify-center gap-1.5 rounded-2xl border border-dashed border-red-300 bg-red-50/50 py-2.5 text-sm font-semibold text-red-500 transition-all hover:bg-red-50 hover:border-red-400"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Xóa tất cả bộ lọc ({activeFilterCount})
          </motion.button>
        )}
      </AnimatePresence>
    </motion.aside>
  )
}
