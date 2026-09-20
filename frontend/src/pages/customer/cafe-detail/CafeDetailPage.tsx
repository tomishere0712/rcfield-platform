import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link, useParams } from "react-router"
import { motion } from "framer-motion"
import { useSectionEntrance } from "@/shared/lib/motion"
import { usePageMeta } from "@/shared/lib/use-page-meta"
import { routePaths } from "@/app/router/route-paths"
import {
  cafeApi,
  cafeQueryKeys,
  CAFE_CONFIGURATION_REFETCH_INTERVAL_MS,
} from "@/features/cafes/api/cafe.api"
import {
  mapCafeToExploreCafe,
  mapCatalogToExploreVehicle,
} from "@/features/cafes/lib/cafe.mappers"
import { vehicleApi } from "@/features/vehicles/api/vehicle.api"
import { menuApi, menuQueryKeys } from "@/features/menu/api/menu.api"
import { ChatWidget } from "@/features/chat/components/ChatWidget"
import { Button } from "@/shared/ui/button"
import { CafeBookingCard } from "./components/CafeBookingCard"
import { CafeContestsSection } from "./components/CafeContestsSection"
import {
  CafeAboutSection,
  CafeReviewsSection,
  CafeBusinessSection,
  CafeRulesSection,
} from "./components/CafeDetailContent"
import { CafeDetailHero } from "./components/CafeDetailHero"
import { CafeFnbSection } from "./components/CafeFnbSection"
import { CafePackagesSection } from "./components/CafePackagesSection"
import { CafePromoBanner } from "./components/CafePromoBanner"
import { CafeVehiclesSection } from "./components/CafeVehiclesSection"
import { CafeSection } from "./components/SectionShell"
import { TrackConfigList } from "./components/TrackConfigList"
import { useCafeConfigurationRefresh } from "@/features/cafes/hooks/useCafeConfigurationRefresh"
import { useTrackConfigs } from "@/features/cafes/hooks/useTrackConfigs"
import type { BookingMode } from "@/features/booking/data/booking-options"

export function CafeDetailPage() {
  const { cafeSlug } = useParams()
  const {
    data: cafeList,
    isLoading: listLoading,
    isError: listError,
    refetch: refetchList,
  } = useQuery({
    queryKey: cafeQueryKeys.list({ page: 1, limit: 100 }),
    queryFn: () => cafeApi.listCafes({ page: 1, limit: 100 }),
  })

  const resolvedCafe = cafeList?.data.find((item) => item.slug === cafeSlug)
  const {
    data: cafeDetail,
    isLoading: detailLoading,
    isError: detailError,
    refetch: refetchDetail,
  } = useQuery({
    queryKey: cafeQueryKeys.detail(resolvedCafe?.id),
    queryFn: () => cafeApi.getCafe(resolvedCafe!.id),
    enabled: !!resolvedCafe?.id,
    refetchInterval: CAFE_CONFIGURATION_REFETCH_INTERVAL_MS,
    refetchOnWindowFocus: "always",
  })
  useCafeConfigurationRefresh(resolvedCafe?.id, refetchDetail)
  const { data: cafeImages = [] } = useQuery({
    queryKey: cafeQueryKeys.images(resolvedCafe?.id),
    queryFn: () => cafeApi.listCafeImages(resolvedCafe!.id),
    enabled: !!resolvedCafe?.id,
  })
  const {
    data: cafeMenu,
    isLoading: menuLoading,
    isError: menuError,
  } = useQuery({
    queryKey: menuQueryKeys.list(resolvedCafe?.id, {
      page: 1,
      limit: 100,
      available: true,
    }),
    queryFn: () =>
      menuApi.listMenuItems(resolvedCafe!.id, {
        page: 1,
        limit: 100,
        available: true,
      }),
    enabled: !!resolvedCafe?.id,
  })
  const { data: catalogs = [] } = useQuery({
    queryKey: ["cafe-catalogs", resolvedCafe?.id],
    queryFn: () => vehicleApi.listCatalogs(resolvedCafe!.id),
    enabled: !!resolvedCafe?.id,
  })

  // Ảnh loại sân cũng là ảnh của cơ sở — gộp vào album ở hero, vì nhiều quán mới
  // chỉ upload đúng một ảnh đại diện, và album một tấm thì chẳng có gì để xem.
  const { data: trackConfigs = [] } = useTrackConfigs(resolvedCafe?.id ?? "")
  const trackImages = useMemo(
    () => trackConfigs.flatMap((config) => config.images ?? []),
    [trackConfigs],
  )

  const sourceCafe = cafeDetail ?? resolvedCafe
  const cafe = useMemo(() => {
    if (!sourceCafe) return undefined
    const mapped = mapCafeToExploreCafe(sourceCafe, cafeImages)
    if (catalogs && catalogs.length > 0) {
      mapped.availableVehicles = catalogs.map(mapCatalogToExploreVehicle)
    }
    return mapped
  }, [sourceCafe, cafeImages, catalogs])

  // Hoisted Booking Selections
  const [selectedVehicleId, setSelectedVehicleId] = useState<
    string | undefined
  >(undefined)
  const [fnbQuantities, setFnbQuantities] = useState<Record<string, number>>({})
  const [bookingMode] = useState<BookingMode>("hourly")
  const [selectedDate, setSelectedDate] = useState(
    new Date().toLocaleDateString("sv-SE"),
  )

  /*
    Tiêu đề và mô tả riêng cho từng cơ sở.

    Trước đây mọi trang dùng chung một tiêu đề trong `index.html`, nên kết quả
    tìm kiếm của mười cơ sở khác nhau đọc lên y hệt nhau và Google không có lý
    do gì để xếp trang nào lên trước.

    Phải gọi trước các nhánh return sớm bên dưới — quy tắc hook.
  */
  usePageMeta(
    cafe
      ? {
          title: `${cafe.name} — Sân RC tại ${cafe.city}`,
          description: [
            `Đặt lịch chơi xe RC tại ${cafe.name}, ${cafe.district ? `${cafe.district}, ` : ""}${cafe.city}.`,
            cafe.slotFeeRate
              ? `Giá từ ${cafe.slotFeeRate.toLocaleString("vi-VN")}đ mỗi giờ.`
              : "",
            "Xem khung giờ còn trống, thuê xe tại sân hoặc mang xe cá nhân.",
          ]
            .filter(Boolean)
            .join(" "),
          image: cafe.image || undefined,
        }
      : null,
  )

  // Cùng bộ biến thể với danh sách ở trang Khám phá, có tôn trọng reduced-motion.
  // Phải gọi trước mọi nhánh return sớm bên dưới (quy tắc hook).
  const sectionEntrance = useSectionEntrance()
  const entranceProps = (index: number) => ({
    custom: index,
    variants: sectionEntrance,
    initial: "hidden" as const,
    animate: "visible" as const,
  })

  if (listLoading || detailLoading) {
    return (
      <div className="mx-auto w-full max-w-[1440px] px-4 py-6 md:px-6">
        <div className="mb-4 h-4 w-72 animate-pulse rounded bg-slate-100" />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-5">
            <div className="h-[380px] animate-pulse rounded-2xl bg-slate-100" />
            <div className="h-40 animate-pulse rounded-2xl bg-slate-100" />
          </div>
          <div className="hidden h-[420px] animate-pulse rounded-2xl bg-slate-100 lg:block" />
        </div>
      </div>
    )
  }

  if (listError || (detailError && !resolvedCafe)) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center">
        <h1 className="text-2xl font-bold text-slate-950">
          Không tải được dữ liệu cơ sở
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Vui lòng kiểm tra BE tại{" "}
          <span className="font-mono">localhost:3000</span> hoặc thử tải lại.
        </p>
        <Button
          type="button"
          onClick={() => {
            if (listError) void refetchList()
            if (detailError) void refetchDetail()
          }}
          className="mt-4 bg-slate-950 font-semibold text-white hover:bg-orange-600"
        >
          Tải lại
        </Button>
      </div>
    )
  }

  if (!resolvedCafe || !cafe) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center">
        <h1 className="text-2xl font-bold text-slate-950">
          Không tìm thấy cơ sở
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Cơ sở này không tồn tại hoặc đã bị ẩn.
        </p>
        <Button
          asChild
          className="mt-4 bg-slate-950 font-semibold text-white hover:bg-orange-600"
        >
          <Link to={routePaths.cafes}>Quay lại khám phá</Link>
        </Button>
      </div>
    )
  }

  const bookingCard = (
    <CafeBookingCard
      cafe={cafe}
      selectedVehicleId={selectedVehicleId}
      onClearVehicle={() => setSelectedVehicleId(undefined)}
      fnbQuantities={fnbQuantities}
      onClearFnb={() => setFnbQuantities({})}
      mode={bookingMode}
      selectedDate={selectedDate}
      setSelectedDate={setSelectedDate}
      menuItems={cafeMenu?.data ?? []}
    />
  )

  /*
    Thứ tự phần trên trang đi theo trình tự người ta ra quyết định:
    sân chạy được gì → chỗ này thế nào → thuê xe gì → có gói/khuyến mãi không →
    ăn uống → người khác nói gì → giải đấu → luật lệ.

    Bản cũ đặt "Giải đấu" ngay dưới ảnh, còn "Loại sân" thì tận cuối trang sau cả
    menu đồ ăn — khách lần đầu phải cuộn qua bốn khối mới biết sân này chạy được
    thể loại gì.
  */
  const sections = [
    <TrackSection key="tracks" cafeId={resolvedCafe.id} />,
    <CafeAboutSection
      key="about"
      description={cafe.description}
      amenities={cafeDetail?.amenities}
    />,
    <CafeVehiclesSection
      key="vehicles"
      cafe={cafe}
      selectedVehicleId={selectedVehicleId}
      onSelectVehicle={setSelectedVehicleId}
    />,
    <CafePackagesSection key="packages" cafeId={resolvedCafe.id} />,
    <CafeFnbSection
      key="fnb"
      menuItems={cafeMenu?.data ?? []}
      isLoading={menuLoading}
      isError={menuError}
      fnbQuantities={fnbQuantities}
      onChangeFnb={setFnbQuantities}
    />,
    <CafeReviewsSection key="reviews" cafeId={resolvedCafe.id} />,
    <CafeContestsSection key="contests" cafeId={resolvedCafe.id} />,
    <CafeRulesSection key="rules" rules={cafeDetail?.rules} />,
    <CafeBusinessSection
      key="business"
      business={cafeDetail?.provider_business}
    />,
  ]

  return (
    <div className="bg-white pb-16">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="mx-auto flex w-full max-w-[1440px] items-center gap-1.5 px-4 pb-1 pt-3 text-sm text-slate-500 md:px-6"
      >
        <Link to={routePaths.cafes} className="hover:text-slate-900">
          Cơ sở
        </Link>
        <span>/</span>
        <span className="text-slate-400">{cafe.city}</span>
        <span>/</span>
        <span className="text-slate-900">{cafe.name}</span>
      </motion.div>

      <main className="mx-auto w-full max-w-[1440px] px-4 md:px-6">
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-12">
          <div className="min-w-0">
            <motion.div {...entranceProps(0)}>
              <CafeDetailHero cafe={cafe} trackImages={trackImages} />
            </motion.div>

            <motion.div {...entranceProps(1)} className="mt-6">
              <CafePromoBanner cafeId={resolvedCafe.id} />
            </motion.div>

            {/* Thẻ đặt lịch chèn ngay sau ảnh trên màn hình hẹp, nơi không có cột phải */}
            <motion.div {...entranceProps(2)} className="mt-6 lg:hidden">
              {bookingCard}
            </motion.div>

            {/*
              `empty:hidden` là bắt buộc, không phải trang trí: gói slot, bảng vàng
              và giải đấu tự trả về null khi cơ sở chưa có dữ liệu. Không có nó thì
              mỗi phần vắng mặt vẫn để lại một đường kẻ và 96px khoảng trống.
            */}
            <div className="mt-12 space-y-12">
              {sections.map((section, index) => (
                <motion.div
                  key={section.key}
                  {...entranceProps(Math.min(index + 3, 8))}
                  className="border-t border-slate-200/80 pt-12 empty:hidden first:border-0 first:pt-0"
                >
                  {section}
                </motion.div>
              ))}
            </div>
          </div>

          {/* Giữ position:sticky ở chính <aside> - bọc motion.div ra ngoài sẽ tạo
              containing block mới do transform và làm hỏng dính khi cuộn. */}
          <aside className="hidden lg:sticky lg:top-20 lg:block">
            <motion.div {...entranceProps(2)}>{bookingCard}</motion.div>
          </aside>
        </div>
      </main>

      <ChatWidget cafeId={resolvedCafe.id} />
    </div>
  )
}

/**
 * Gọi `useTrackConfigs` ngay tại đây thay vì để `TrackConfigList` tự lo, để khi
 * cơ sở chưa cấu hình sân nào thì cả phần biến mất — chứ không để lại một tiêu đề
 * lơ lửng không có nội dung bên dưới.
 */
function TrackSection({ cafeId }: { cafeId: string }) {
  const { data: configs = [], isLoading } = useTrackConfigs(cafeId)
  if (!isLoading && configs.length === 0) return null

  return (
    <CafeSection
      title="Loại sân tại cơ sở"
      lead="Mỗi loại sân có mặt đường và sức chứa riêng — chọn loại phù hợp ở bước đặt lịch."
    >
      <TrackConfigList cafeId={cafeId} />
    </CafeSection>
  )
}
