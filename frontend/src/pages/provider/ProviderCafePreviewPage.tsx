import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeft, Eye } from "lucide-react"
import { useNavigate, useParams } from "react-router"

import { cafeApi, cafeQueryKeys } from "@/features/cafes/api/cafe.api"
import { mapCafeToExploreCafe, mapCatalogToExploreVehicle } from "@/features/cafes/lib/cafe.mappers"
import { useTrackConfigs } from "@/features/cafes/hooks/useTrackConfigs"
import { vehicleApi } from "@/features/vehicles/api/vehicle.api"
import { menuApi, menuQueryKeys } from "@/features/menu/api/menu.api"
import { Button } from "@/shared/ui/button"
import { CafeBookingCard } from "@/pages/customer/cafe-detail/components/CafeBookingCard"
import {
  CafeAboutSection,
  CafeRulesSection,
} from "@/pages/customer/cafe-detail/components/CafeDetailContent"
import { CafeSection, SectionRule } from "@/pages/customer/cafe-detail/components/SectionShell"
import { CafeDetailHero } from "@/pages/customer/cafe-detail/components/CafeDetailHero"
import { TrackConfigList } from "@/pages/customer/cafe-detail/components/TrackConfigList"
import { CafeFnbSection } from "@/pages/customer/cafe-detail/components/CafeFnbSection"
import { CafeVehiclesSection } from "@/pages/customer/cafe-detail/components/CafeVehiclesSection"
import type { BookingMode } from "@/features/booking/data/booking-options"

export function ProviderCafePreviewPage() {
  const { cafeId } = useParams<{ cafeId: string }>()
  const navigate = useNavigate()

  const { data: cafeDetail, isLoading, isError } = useQuery({
    queryKey: cafeQueryKeys.detail(cafeId),
    queryFn: () => cafeApi.getCafe(cafeId!),
    enabled: !!cafeId,
  })

  const { data: images = [] } = useQuery({
    queryKey: cafeQueryKeys.images(cafeId),
    queryFn: () => cafeApi.listCafeImages(cafeId!),
    enabled: !!cafeId,
  })

  const { data: cafeMenu, isLoading: menuLoading, isError: menuError } = useQuery({
    queryKey: menuQueryKeys.list(cafeId, { page: 1, limit: 100, available: true }),
    queryFn: () => menuApi.listMenuItems(cafeId!, { page: 1, limit: 100, available: true }),
    enabled: !!cafeId,
  })

  const { data: catalogs = [] } = useQuery({
    queryKey: ["cafe-catalogs", cafeId],
    queryFn: () => vehicleApi.listCatalogs(cafeId!),
    enabled: !!cafeId,
  })

  const { data: trackConfigs = [] } = useTrackConfigs(cafeId ?? "")
  const trackImages = useMemo(
    () => trackConfigs.flatMap((config) => config.images ?? []),
    [trackConfigs],
  )

  const cafe = useMemo(() => {
    if (!cafeDetail) return undefined
    const mapped = mapCafeToExploreCafe(cafeDetail, images)
    if (catalogs.length > 0) {
      mapped.availableVehicles = catalogs.map(mapCatalogToExploreVehicle)
    }
    return mapped
  }, [cafeDetail, images, catalogs])

  const [selectedVehicleId, setSelectedVehicleId] = useState<string | undefined>(undefined)
  const [fnbQuantities, setFnbQuantities] = useState<Record<string, number>>({})
  const [bookingMode] = useState<BookingMode>("hourly")
  const [selectedDate, setSelectedDate] = useState(new Date().toLocaleDateString("sv-SE"))

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white">
        <PreviewBanner onBack={() => navigate(-1)} cafeName="..." />
        <div className="w-full px-4 py-6 md:px-6 2xl:px-8">
          <div className="h-[360px] animate-pulse rounded-2xl bg-slate-100" />
        </div>
      </div>
    )
  }

  if (isError || !cafe || !cafeDetail) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-white">
        <p className="text-sm text-slate-500">Không tải được dữ liệu cơ sở.</p>
        <Button variant="outline" onClick={() => navigate(-1)} className="gap-2 font-bold">
          <ArrowLeft className="size-4" />
          Quay lại
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

  return (
    <div className="min-h-screen bg-white pb-10">
      <PreviewBanner onBack={() => navigate(-1)} cafeName={cafe.name} />

      <div className="flex w-full items-center gap-1.5 px-4 pt-3 pb-1 text-xs text-slate-400 md:px-6 2xl:px-8">
        <span>Cơ sở</span>
        <span>/</span>
        <span>{cafe.city}</span>
        <span>/</span>
        <span className="text-slate-600">{cafe.name}</span>
      </div>

      <main className="w-full px-4 md:px-6 2xl:px-8">
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0">
            <CafeDetailHero cafe={cafe} trackImages={trackImages} />

            <div className="mt-6 lg:hidden">{bookingCard}</div>

            {/* Cùng thứ tự với trang khách thấy: loại sân → giới thiệu → xe → đồ ăn → quy định */}
            <div className="mt-12 space-y-12">
              <TrackSection cafeId={cafeId!} />
              <SectionRule />
              <CafeAboutSection
                description={cafe.description}
                amenities={cafeDetail.amenities}
              />
              <SectionRule />
              <CafeVehiclesSection
                cafe={cafe}
                selectedVehicleId={selectedVehicleId}
                onSelectVehicle={setSelectedVehicleId}
              />
              <SectionRule />
              <CafeFnbSection
                menuItems={cafeMenu?.data ?? []}
                isLoading={menuLoading}
                isError={menuError}
                fnbQuantities={fnbQuantities}
                onChangeFnb={setFnbQuantities}
              />
              <SectionRule />
              <CafeRulesSection rules={cafeDetail.rules} />
            </div>
          </div>

          <aside className="hidden lg:sticky lg:top-[88px] lg:block">{bookingCard}</aside>
        </div>
      </main>
    </div>
  )
}

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

function PreviewBanner({ onBack, cafeName }: { onBack: () => void; cafeName: string }) {
  return (
    <div className="sticky top-0 z-50 flex items-center gap-3 bg-amber-500 px-4 py-2.5 shadow-md">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onBack}
        className="h-7 gap-1.5 rounded-md px-2 text-amber-950 hover:bg-amber-400 font-bold text-xs"
      >
        <ArrowLeft className="size-3.5" />
        Quay lại
      </Button>
      <div className="flex flex-1 items-center gap-2">
        <Eye className="size-4 shrink-0 text-amber-950" />
        <span className="text-sm font-bold text-amber-950">
          Bản xem trước — "{cafeName}"
        </span>
      </div>
    </div>
  )
}
