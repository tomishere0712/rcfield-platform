import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { usePageMeta } from "@/shared/lib/use-page-meta"
import { useNavigate } from "react-router"
import { motion, AnimatePresence } from "framer-motion"
import { ArrowRight, Trophy } from "lucide-react"
import { cardVariants, emphasizedEase } from "@/shared/lib/motion"
import { getCafes } from "@/features/explore/api/explore.api"
import {
  contestApi,
  contestQueryKeys,
} from "@/features/contests/api/contest.api"
import {
  featuredPopupApi,
  featuredPopupQueryKeys,
} from "@/features/explore/api/featured-popup.api"
import { toast } from "sonner"
import type { Cafe } from "@/shared/data/explore-data"
import { ExploreMapOverlay } from "./components/ExploreMapOverlay"
import { ExploreSearchBar } from "./components/ExploreSearchBar"
import { ExploreLeftSidebar } from "./components/ExploreLeftSidebar"
import { ExploreResultsHeader } from "./components/ExploreResultsHeader"
import { CafeHorizontalCard } from "./components/CafeHorizontalCard"
import { CafeGridCard } from "./components/CafeGridCard"
import { ContestExploreCard } from "./components/ContestExploreCard"
import { ContestDiscoveryRail } from "./components/ContestDiscoveryRail"
import { CafeQuickViewDialog } from "./components/CafeQuickViewDialog"
import {
  buildBookingUrl,
  cafeInBounds,
  filterCafes,
  haversineKm,
  type MapBounds,
  type UserLocation,
} from "./explore-utils"
import { useExploreFilters } from "./useExploreFilters"
import { Map } from "lucide-react"
import { useAuthStore } from "@/features/auth/stores/auth.store"
import { favoriteApi } from "@/features/explore/api/favorite.api"
import { Dialog, DialogContent } from "@/shared/ui/dialog"

// emphasizedEase + cardVariants nay nằm ở shared/lib/motion để trang chi tiết cơ sở
// dùng đúng cùng bộ giá trị — sửa một chỗ là cả hai trang đổi theo.

export function ExplorePage() {
  const navigate = useNavigate()
  const filters = useExploreFilters()

  usePageMeta({
    title: "Tìm sân chơi xe RC gần bạn",
    description:
      "Danh sách sân chơi xe RC trên toàn quốc: xem giá theo giờ, loại đường đua, tiện ích và khung giờ còn trống. Lọc theo thành phố và đặt lịch trực tuyến.",
  })
  const [quickViewCafe, setQuickViewCafe] = useState<Cafe | null>(null)
  const [showMap, setShowMap] = useState(false)
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null)
  const [hoveredCafeId, setHoveredCafeId] = useState<string | null>(null)
  const [mapBounds, setMapBounds] = useState<MapBounds | null>(null)
  const [searchOnMove, setSearchOnMove] = useState(false)
  const [dismissedPopupId, setDismissedPopupId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<"grid" | "list">(() => {
    return (
      (localStorage.getItem("explore_view_mode") as "grid" | "list") || "list"
    )
  })

  const handleViewModeChange = (mode: "grid" | "list") => {
    setViewMode(mode)
    localStorage.setItem("explore_view_mode", mode)
  }
  const listRef = useRef<HTMLDivElement>(null)
  const boundsTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  )

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => {
    try {
      const favsStr = localStorage.getItem("rcfield_favorite_cafes")
      if (favsStr) {
        const parsed = JSON.parse(favsStr)
        if (Array.isArray(parsed)) return parsed
      }
    } catch (e) {
      console.warn("Failed to load favorites from localStorage", e)
    }
    return []
  })

  useEffect(() => {
    const loadFavs = async () => {
      let localFavs: string[] = []
      try {
        const favsStr = localStorage.getItem("rcfield_favorite_cafes")
        if (favsStr) {
          const parsed = JSON.parse(favsStr)
          if (Array.isArray(parsed)) localFavs = parsed
        }
      } catch (e) {
        console.warn("Failed to parse local favorites", e)
      }

      if (isAuthenticated) {
        try {
          const isSynced =
            localStorage.getItem("rcfield_favorites_synced") === "true"
          if (!isSynced) {
            const mergedFavs = await favoriteApi.syncFavorites(localFavs)
            setFavoriteIds(mergedFavs)
            localStorage.setItem(
              "rcfield_favorite_cafes",
              JSON.stringify(mergedFavs),
            )
            localStorage.setItem("rcfield_favorites_synced", "true")
          } else {
            const dbFavs = await favoriteApi.getFavorites()
            setFavoriteIds(dbFavs)
            localStorage.setItem(
              "rcfield_favorite_cafes",
              JSON.stringify(dbFavs),
            )
          }
        } catch (e) {
          console.error("Failed to load favorites from backend", e)
          setFavoriteIds(localFavs)
        }
      } else {
        localStorage.removeItem("rcfield_favorites_synced")
        setFavoriteIds(localFavs)
      }
    }

    loadFavs()
  }, [isAuthenticated])

  const handleToggleFavorite = useCallback(
    async (cafeId: string) => {
      const isFav = favoriteIds.includes(cafeId)
      const updated = isFav
        ? favoriteIds.filter((id) => id !== cafeId)
        : [...favoriteIds, cafeId]

      setFavoriteIds(updated)
      try {
        localStorage.setItem("rcfield_favorite_cafes", JSON.stringify(updated))
        if (isFav) {
          toast.success("Đã xóa khỏi danh sách yêu thích")
          if (isAuthenticated) {
            await favoriteApi.removeFavorite(cafeId)
          }
        } else {
          toast.success("Đã thêm vào danh sách yêu thích")
          if (isAuthenticated) {
            await favoriteApi.addFavorite(cafeId)
          }
        }
      } catch (e) {
        console.error("Failed to toggle favorite:", e)
        setFavoriteIds(favoriteIds)
        try {
          localStorage.setItem(
            "rcfield_favorite_cafes",
            JSON.stringify(favoriteIds),
          )
        } catch (err) {
          console.error(err)
        }
      }
    },
    [favoriteIds, isAuthenticated],
  )

  const handleBoundsChange = useCallback((bounds: MapBounds) => {
    clearTimeout(boundsTimerRef.current)
    boundsTimerRef.current = setTimeout(() => setMapBounds(bounds), 150)
  }, [])

  const {
    data: cafes = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["explore", "cafes", filters.params],
    queryFn: () => getCafes(filters.params),
  })

  const {
    data: contestsData,
    isLoading: isLoadingContests,
    isError: isErrorContests,
  } = useQuery({
    queryKey: contestQueryKeys.list({ public: true }),
    queryFn: () => contestApi.listContests({ limit: 100 }),
    enabled: filters.searchTarget === "contests",
  })

  const contests = useMemo(() => contestsData?.data ?? [], [contestsData?.data])

  // Dải giải đấu chỉ hiển thị suất provider đã trả phí quảng bá và admin đã
  // duyệt. Backend đã lọc sẵn nên ở đây không rank/slice gì thêm — thứ tự do
  // `priority` của suất quyết định.
  const { data: featuredContestSlots = [] } = useQuery({
    queryKey: featuredPopupQueryKeys.activeList(),
    queryFn: featuredPopupApi.listActive,
  })

  const featuredPopupQuery = useQuery({
    queryKey: featuredPopupQueryKeys.active(),
    queryFn: featuredPopupApi.getActive,
  })
  const activeFeaturedPopup = featuredPopupQuery.data
  const popupDismissed =
    !activeFeaturedPopup ||
    dismissedPopupId === activeFeaturedPopup.id ||
    sessionStorage.getItem(
      `explore_featured_popup_dismissed_${activeFeaturedPopup.id}`,
    ) === "true"

  const filteredContests = useMemo(() => {
    const query = filters.query.trim().toLowerCase()
    const ranked = [...contests].sort((a, b) => {
      const statusScore = (status: string) => {
        switch (status) {
          case "RUNNING":
            return 0
          case "OPEN":
            return 1
          case "CLOSED":
            return 2
          case "COMPLETED":
            return 3
          default:
            return 4
        }
      }
      return statusScore(a.status) - statusScore(b.status)
    })
    if (!query) return ranked
    return ranked.filter(
      (c) =>
        c.name.toLowerCase().includes(query) ||
        (c.description && c.description.toLowerCase().includes(query)) ||
        (c.host_branch?.cafe?.name &&
          c.host_branch.cafe.name.toLowerCase().includes(query)),
    )
  }, [contests, filters.query])

  useEffect(() => {
    if (searchOnMove) listRef.current?.scrollTo({ top: 0, behavior: "smooth" })
  }, [mapBounds, searchOnMove])

  const filteredCafes = useMemo(() => {
    let visible = filterCafes(cafes, filters.params)
    if (searchOnMove && mapBounds)
      visible = visible.filter((c) => cafeInBounds(c, mapBounds))

    return [...visible].sort((a, b) => {
      const isFavA = favoriteIds.includes(a.id)
      const isFavB = favoriteIds.includes(b.id)

      if (isFavA && !isFavB) return -1
      if (!isFavA && isFavB) return 1

      if (userLocation) {
        const hasA = a.latitude && a.longitude
        const hasB = b.latitude && b.longitude
        if (!hasA && !hasB) return 0
        if (!hasA) return 1
        if (!hasB) return -1
        return (
          haversineKm(
            userLocation.lat,
            userLocation.lng,
            a.latitude!,
            a.longitude!,
          ) -
          haversineKm(
            userLocation.lat,
            userLocation.lng,
            b.latitude!,
            b.longitude!,
          )
        )
      }
      return 0
    })
  }, [cafes, userLocation, mapBounds, searchOnMove, favoriteIds, filters.params])

  const handleBookNow = (cafeId: string, vehicleId?: string) => {
    navigate(
      buildBookingUrl(cafeId, vehicleId, {
        date: filters.date,
        time: filters.time,
        playMode: filters.playMode,
      }),
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100/50 flex flex-col">
      {/* Top search bar */}
      <ExploreSearchBar
        city={filters.city}
        onCityChange={filters.setCity}
        date={filters.date}
        onDateChange={filters.setDate}
        query={filters.query}
        onQueryChange={filters.setQuery}
        onSubmit={() => {
          void refetch()
          listRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          })
        }}
      />

      <div className="mx-auto flex w-full max-w-[1200px] flex-1 gap-6 px-4 py-6 md:px-6">
        {/* LEFT — Sidebar with map + filters (desktop only) */}
        {filters.searchTarget === "cafes" && (
          <div className="hidden w-[280px] shrink-0 lg:block">
            <div className="sticky top-[96px] max-h-[calc(100vh-7rem)] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
              <ExploreLeftSidebar
                cafes={filteredCafes}
                onSelectCafe={setQuickViewCafe}
                userLocation={userLocation}
                onUserLocation={setUserLocation}
                hoveredCafeId={hoveredCafeId}
                onBoundsChange={handleBoundsChange}
                searchOnMove={searchOnMove}
                onSearchOnMoveChange={setSearchOnMove}
                priceMin={filters.priceMin}
                priceMax={filters.priceMax}
                onPriceMinChange={filters.setPriceMin}
                onPriceMaxChange={filters.setPriceMax}
                onResetPrice={filters.resetPriceSlider}
                popularFilters={filters.popularFilters}
                onTogglePopularFilter={filters.togglePopularFilter}
                activeFilterCount={filters.activeFilterCount}
                onClearAll={filters.clearFilters}
                onOpenFullMap={() => setShowMap(true)}
              />
            </div>
          </div>
        )}

        {/* CENTER — Results list */}
        <div ref={listRef} className="flex-1 min-w-0">
          {/* Premium Segmented Switcher */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.35 }}
            className="mb-6 flex items-center justify-between border-b border-border pb-4"
          >
            <div className="flex gap-1 rounded-xl bg-muted p-1">
              <button
                type="button"
                onClick={() => filters.setSearchTarget("cafes")}
                className={`relative rounded-lg px-4 py-2 text-xs font-bold transition-all duration-300 ${
                  filters.searchTarget === "cafes"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Cơ sở RC Cafe
              </button>
              <button
                type="button"
                onClick={() => filters.setSearchTarget("contests")}
                className={`relative rounded-lg px-4 py-2 text-xs font-bold transition-all duration-300 ${
                  filters.searchTarget === "contests"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Giải đấu RC
              </button>
            </div>
            <AnimatePresence mode="wait">
              {filters.searchTarget === "contests" && (
                <motion.span
                  key="contest-count"
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 8 }}
                  className="text-xs font-semibold text-muted-foreground"
                >
                  {filteredContests.length} giải đấu khả dụng
                </motion.span>
              )}
            </AnimatePresence>
          </motion.div>

          <AnimatePresence mode="wait">
            {filters.searchTarget === "cafes" ? (
              <motion.div
                key="cafes-tab"
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 16 }}
                transition={{ duration: 0.3, ease: emphasizedEase }}
              >
                {/* Results header */}
                <div className="sticky top-[68px] lg:top-[80px] z-20 bg-gradient-to-b from-slate-50 via-slate-50 to-slate-50/95 pb-3 pt-2 mb-4 backdrop-blur-sm">
                  <ExploreResultsHeader
                    city={filters.city}
                    resultCount={filteredCafes.length}
                    sortBy={filters.sortBy}
                    onSortByChange={filters.setSortBy}
                    viewMode={viewMode}
                    onViewModeChange={handleViewModeChange}
                    trackType={filters.trackType}
                    onTrackTypeChange={filters.setTrackType}
                    feature={filters.feature}
                    onFeatureChange={filters.setFeature}
                    vehicleType={filters.vehicleType}
                    onVehicleTypeChange={filters.setVehicleType}
                    priceRange={filters.priceRange}
                    onPriceRangeChange={filters.setPriceRange}
                    query={filters.query}
                    onQueryChange={filters.setQuery}
                  />
                </div>

                <ContestDiscoveryRail slots={featuredContestSlots} />

                {/* Card list */}
                <AnimatePresence mode="popLayout">
                  {isLoading ? (
                    <motion.div
                      key="loading"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                    >
                      <ExploreLoadingState viewMode={viewMode} />
                    </motion.div>
                  ) : isError ? (
                    <motion.div
                      key="error"
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="rounded-2xl border border-slate-200/80 bg-white p-12 text-center shadow-sm"
                    >
                      <h3 className="text-lg font-semibold">
                        Không tải được dữ liệu cơ sở
                      </h3>
                      <p className="mt-2 text-sm text-slate-500">
                        Vui lòng thử lại sau hoặc kiểm tra kết nối API.
                      </p>
                      <button
                        type="button"
                        onClick={() => void refetch()}
                        className="mt-4 rounded-xl bg-orange-600 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-orange-700 hover:-translate-y-0.5 hover:shadow-md"
                      >
                        Tải lại
                      </button>
                    </motion.div>
                  ) : filteredCafes.length === 0 ? (
                    <motion.div
                      key="empty"
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="rounded-2xl border border-slate-200/80 bg-white p-12 text-center shadow-sm"
                    >
                      <h3 className="text-lg font-semibold">
                        Không có cơ sở trong khu vực này
                      </h3>
                      <p className="mt-2 text-sm text-slate-500">
                        {searchOnMove && mapBounds
                          ? "Di chuyển hoặc thu nhỏ bản đồ để xem thêm cơ sở."
                          : "Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm."}
                      </p>
                    </motion.div>
                  ) : (
                    <motion.main
                      key={`results-${viewMode}`}
                      className={
                        viewMode === "grid"
                          ? "grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
                          : "space-y-4"
                      }
                    >
                      {filteredCafes.map((cafe, index) => {
                        const dist =
                          userLocation && cafe.latitude && cafe.longitude
                            ? haversineKm(
                                userLocation.lat,
                                userLocation.lng,
                                cafe.latitude,
                                cafe.longitude,
                              )
                            : undefined
                        return (
                          <motion.div
                            key={cafe.id}
                            custom={index}
                            variants={cardVariants}
                            initial="hidden"
                            animate="visible"
                            exit="exit"
                            layout
                          >
                            {viewMode === "grid" ? (
                              <CafeGridCard
                                cafe={cafe}
                                isFavorite={favoriteIds.includes(cafe.id)}
                                onToggleFavorite={handleToggleFavorite}
                                distanceKm={dist}
                                onQuickView={setQuickViewCafe}
                                onBookNow={handleBookNow}
                                onHover={setHoveredCafeId}
                              />
                            ) : (
                              <CafeHorizontalCard
                                cafe={cafe}
                                isFavorite={favoriteIds.includes(cafe.id)}
                                onToggleFavorite={handleToggleFavorite}
                                distanceKm={dist}
                                onQuickView={setQuickViewCafe}
                                onBookNow={handleBookNow}
                                onHover={setHoveredCafeId}
                              />
                            )}
                          </motion.div>
                        )
                      })}
                    </motion.main>
                  )}
                </AnimatePresence>
              </motion.div>
            ) : (
              <motion.div
                key="contests-tab"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.3, ease: emphasizedEase }}
              >
                {/* Contest results list */}
                <div className="mb-4">
                  <h2 className="text-lg font-extrabold text-slate-950">
                    Giải đấu RC nổi bật
                  </h2>
                  <p className="text-xs text-slate-500">
                    Các cuộc đua tốc độ và kỹ thuật diễn ra tại các chi nhánh RC
                    Cafe
                  </p>
                </div>

                <main>
                  {isLoadingContests ? (
                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                      {Array.from({ length: 6 }).map((_, i) => (
                        <div
                          key={i}
                          className="h-64 animate-pulse rounded-2xl bg-slate-200/50"
                        />
                      ))}
                    </div>
                  ) : isErrorContests ? (
                    <div className="rounded-2xl border border-slate-200/80 bg-white p-12 text-center shadow-sm">
                      <h3 className="text-lg font-semibold">
                        Không tải được dữ liệu giải đấu
                      </h3>
                      <p className="mt-2 text-sm text-slate-500">
                        Vui lòng thử lại sau hoặc kiểm tra kết nối API.
                      </p>
                    </div>
                  ) : filteredContests.length === 0 ? (
                    <div className="rounded-2xl border border-slate-200/80 bg-white p-12 text-center shadow-sm">
                      <h3 className="text-lg font-semibold">
                        Chưa tìm thấy giải đấu nào
                      </h3>
                      <p className="mt-2 text-sm text-slate-500">
                        Thử thay đổi từ khóa tìm kiếm ở thanh trên.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                      {filteredContests.map((contest, index) => (
                        <motion.div
                          key={contest.id}
                          custom={index}
                          variants={cardVariants}
                          initial="hidden"
                          animate="visible"
                        >
                          <ContestExploreCard contest={contest} />
                        </motion.div>
                      ))}
                    </div>
                  )}
                </main>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Mobile: floating "Xem bản đồ" button */}
      {filters.searchTarget === "cafes" && (
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.4 }}
          className="fixed bottom-5 left-1/2 z-40 -translate-x-1/2 lg:hidden"
        >
          <button
            type="button"
            onClick={() => setShowMap(true)}
            className="flex items-center gap-2 rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-xl shadow-slate-900/30 transition-all hover:bg-slate-800 hover:shadow-2xl hover:-translate-y-0.5 active:scale-[0.97]"
          >
            <Map className="h-4 w-4" /> Xem bản đồ
          </button>
        </motion.div>
      )}

      {/* Mobile full-screen map overlay */}
      {showMap && filters.searchTarget === "cafes" && (
        <ExploreMapOverlay
          cafes={filteredCafes}
          userLocation={userLocation}
          onUserLocation={setUserLocation}
          onSelectCafe={(cafe) => {
            setQuickViewCafe(cafe)
          }}
          onClose={() => setShowMap(false)}
        />
      )}

      <CafeQuickViewDialog
        cafe={quickViewCafe}
        onClose={() => setQuickViewCafe(null)}
        onBookNow={handleBookNow}
      />

      <Dialog
        open={Boolean(activeFeaturedPopup) && !popupDismissed}
        onOpenChange={(open) => {
          if (!open && activeFeaturedPopup) {
            setDismissedPopupId(activeFeaturedPopup.id)
            sessionStorage.setItem(
              `explore_featured_popup_dismissed_${activeFeaturedPopup.id}`,
              "true",
            )
          }
        }}
      >
        {/*
          Phải là `sm:max-w-3xl`, không phải `max-w-3xl`. DialogContent mặc định
          có `sm:max-w-sm`; Tailwind xếp các lớp kèm media query xuống sau, nên
          lớp không breakpoint luôn thua và modal bị ép còn 384px trên desktop —
          đó là lý do nội dung bên trong trông chật cứng.
        */}
        <DialogContent className="overflow-hidden border-none p-0 sm:max-w-3xl">
          {activeFeaturedPopup ? (
            <FeaturedContestPopup
              title={activeFeaturedPopup.title}
              subtitle={activeFeaturedPopup.subtitle}
              imageUrl={activeFeaturedPopup.image_url}
              ctaLabel={activeFeaturedPopup.cta_label}
              onAction={() => {
                const popup = activeFeaturedPopup
                if (!popup) return
                sessionStorage.setItem(
                  `explore_featured_popup_dismissed_${popup.id}`,
                  "true",
                )
                setDismissedPopupId(popup.id)
                if (popup.contest_id) {
                  navigate(`/contests/${popup.contest_id}`)
                  return
                }
                if (popup.cta_url) {
                  window.location.assign(popup.cta_url)
                }
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}

/**
 * Popup giải đấu nổi bật trên trang khám phá.
 *
 * Bốn thứ đã sửa so với bản trước:
 *
 * 1. Chữ tiếng Việt mất hết dấu ("Kham pha giai dau dang hot") — đọc như lỗi
 *    encoding, mà đây là thứ đầu tiên khách nhìn thấy khi vào trang.
 * 2. Dòng "Popup dong do admin dieu phoi" là ghi chú nội bộ lọt ra ngoài. Khách
 *    không cần biết ai điều phối popup; nó còn chiếm nửa hàng nên nút CTA bị ép
 *    hẹp lại thành hình tròn với chữ xuống ba dòng.
 * 3. Nút CTA thiếu `shrink-0` nên bị flex bóp méo.
 * 4. Nút đóng X của Dialog nằm đè lên dòng chữ đầu — cột nội dung nay chừa lề
 *    phải cho nó.
 */
function FeaturedContestPopup({
  title,
  subtitle,
  imageUrl,
  ctaLabel,
  onAction,
}: {
  title: string
  subtitle: string | null
  imageUrl: string | null
  ctaLabel: string
  onAction: () => void
}) {
  return (
    <div className="grid overflow-hidden bg-[#101317] text-white md:grid-cols-2">
      <div className="relative aspect-[4/3] md:aspect-auto md:min-h-[300px]">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={title}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,#fb923c,transparent_42%),linear-gradient(135deg,#111827,#1f2937_55%,#7c2d12)]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-tr from-black/70 via-black/20 to-transparent" />
        <div className="absolute bottom-4 left-4 flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-orange-200 backdrop-blur">
          <Trophy className="size-3.5" />
          Giải đấu nổi bật
        </div>
      </div>

      <div className="flex flex-col justify-between gap-6 p-6 pr-12 md:p-7 md:pr-12">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-wider text-orange-300">
            Đang mở đăng ký
          </p>
          <h2 className="mt-2 line-clamp-2 text-2xl font-black leading-tight md:text-3xl">
            {title}
          </h2>
          {subtitle ? (
            <p className="mt-3 line-clamp-4 text-sm leading-6 text-slate-300">
              {subtitle}
            </p>
          ) : (
            <p className="mt-3 text-sm leading-6 text-slate-300">
              Xem thể lệ, lệ phí và số suất còn lại trước khi đăng ký.
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={onAction}
          className="inline-flex shrink-0 items-center justify-center gap-2 self-stretch rounded-xl bg-orange-500 px-5 py-3 text-sm font-black text-white transition hover:bg-orange-400 md:self-start"
        >
          {ctaLabel}
          <ArrowRight className="size-4" />
        </button>
      </div>
    </div>
  )
}

function ExploreLoadingState({ viewMode }: { viewMode: "grid" | "list" }) {
  if (viewMode === "grid") {
    return (
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, duration: 0.3 }}
            className="flex flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm h-full"
          >
            <div className="aspect-[16/10] w-full animate-pulse bg-slate-100" />
            <div className="flex-1 space-y-3 p-4">
              <div className="h-5 w-2/3 animate-pulse rounded-lg bg-slate-100" />
              <div className="h-4 w-1/3 animate-pulse rounded-lg bg-slate-100" />
              <div className="h-4 w-1/2 animate-pulse rounded-lg bg-slate-100" />
              <div className="pt-2 border-t border-slate-100 flex justify-between items-center">
                <div className="h-4 w-1/3 animate-pulse rounded-lg bg-slate-100" />
                <div className="h-8 w-1/2 animate-pulse rounded-lg bg-slate-100" />
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.08, duration: 0.3 }}
          className="flex overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm"
        >
          <div className="h-[200px] w-[280px] shrink-0 animate-pulse bg-slate-100" />
          <div className="flex-1 space-y-3 p-4">
            <div className="h-5 w-2/3 animate-pulse rounded-lg bg-slate-100" />
            <div className="h-4 w-1/3 animate-pulse rounded-lg bg-slate-100" />
            <div className="h-4 w-1/2 animate-pulse rounded-lg bg-slate-100" />
            <div className="flex gap-2">
              <div className="h-6 w-16 animate-pulse rounded-lg bg-slate-100" />
              <div className="h-6 w-16 animate-pulse rounded-lg bg-slate-100" />
            </div>
          </div>
          <div className="w-[180px] shrink-0 border-l p-4">
            <div className="h-6 w-full animate-pulse rounded-lg bg-slate-100" />
            <div className="mt-2 h-8 w-full animate-pulse rounded-lg bg-slate-100" />
            <div className="mt-auto h-10 w-full animate-pulse rounded-lg bg-slate-100" />
          </div>
        </motion.div>
      ))}
    </div>
  )
}
