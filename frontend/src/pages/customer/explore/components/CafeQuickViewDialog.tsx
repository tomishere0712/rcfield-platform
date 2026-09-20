import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  Clock3,
  MapPin,
  Phone,
  ShieldCheck,
  TimerReset,
  Users,
  X,
} from "lucide-react"
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
import type { Cafe } from "@/shared/data/explore-data"
import { Badge } from "@/shared/ui/badge"
import { Button } from "@/shared/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog"
import { VehicleMiniList } from "./VehicleMiniList"
import { useCafeConfigurationRefresh } from "@/features/cafes/hooks/useCafeConfigurationRefresh"

export function CafeQuickViewDialog({
  cafe,
  onClose,
  onBookNow,
}: {
  cafe: Cafe | null
  onClose: () => void
  onBookNow: (cafeId: string, vehicleId?: string) => void
}) {
  const {
    data: cafeDetail,
    isFetching: loadingDetail,
    refetch: refetchCafe,
  } = useQuery({
    queryKey: cafeQueryKeys.detail(cafe?.id),
    queryFn: () => cafeApi.getCafe(cafe!.id),
    enabled: !!cafe?.id,
    refetchInterval: CAFE_CONFIGURATION_REFETCH_INTERVAL_MS,
    refetchOnWindowFocus: "always",
  })
  useCafeConfigurationRefresh(cafe?.id, refetchCafe)
  const { data: cafeImages = [] } = useQuery({
    queryKey: cafeQueryKeys.images(cafe?.id),
    queryFn: () => cafeApi.listCafeImages(cafe!.id),
    enabled: !!cafe?.id,
  })
  const { data: vehicleCatalogs = [] } = useQuery({
    queryKey: ["cafes", cafe?.id, "vehicle-catalogs"],
    queryFn: () => vehicleApi.listCatalogs(cafe!.id),
    enabled: !!cafe?.id,
  })
  const displayCafe = useMemo(() => {
    const baseCafe = cafeDetail
      ? mapCafeToExploreCafe(cafeDetail, cafeImages)
      : cafe
    if (!baseCafe) return null
    return {
      ...baseCafe,
      availableVehicles: vehicleCatalogs.map(mapCatalogToExploreVehicle),
    }
  }, [cafe, cafeDetail, cafeImages, vehicleCatalogs])

  return (
    <Dialog open={!!displayCafe} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[90svh] max-w-3xl sm:max-w-3xl overflow-hidden border border-slate-200 bg-white p-0"
      >
        {displayCafe && (
          <>
            <DialogHeader className="sr-only">
              <DialogTitle>{displayCafe.name}</DialogTitle>
              <DialogDescription>
                Xem nhanh thông tin cơ sở RCField.
              </DialogDescription>
            </DialogHeader>
            <div className="relative h-64 overflow-hidden bg-slate-100">
              <img
                src={displayCafe.image}
                alt={displayCafe.name}
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/20 to-transparent" />
              <Button
                type="button"
                size="icon"
                variant="secondary"
                onClick={onClose}
                className="absolute right-4 top-4 rounded-full bg-white/90"
              >
                <X className="h-4 w-4 text-slate-700" />
              </Button>
              <div className="absolute bottom-5 left-5 right-5 text-white">
                <div className="mb-2 flex flex-wrap gap-2">
                  {displayCafe.status && (
                    <Badge className="bg-white/90 font-black text-slate-950">
                      {formatStatus(displayCafe.status)}
                    </Badge>
                  )}
                  {loadingDetail && (
                    <Badge className="bg-white/80 font-black text-slate-700">
                      Đang cập nhật...
                    </Badge>
                  )}
                  {displayCafe.features.includes("Serious Inspection") && (
                    <Badge className="bg-emerald-600 font-black text-white">
                      <ShieldCheck className="h-3 w-3" /> Serious Inspection
                    </Badge>
                  )}
                </div>
                <h2 className="text-2xl font-black tracking-tight">
                  {displayCafe.name}
                </h2>
                <p className="mt-1 flex items-center gap-1 text-sm font-bold text-slate-200">
                  <MapPin className="h-4 w-4 text-orange-400" />{" "}
                  {displayCafe.address}
                </p>
              </div>
            </div>
            <div className="max-h-[calc(90svh-16rem)] overflow-y-auto p-5">
              <div className="grid gap-5 md:grid-cols-[1fr_260px]">
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                      Giới thiệu
                    </p>
                    <p className="mt-2 text-sm font-medium leading-6 text-slate-600">
                      {displayCafe.description}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                      Track
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {displayCafe.trackTypes.length > 0 ? (
                        displayCafe.trackTypes.map((item) => (
                          <Badge
                            key={item}
                            variant="secondary"
                            className="bg-slate-100 font-bold text-slate-700"
                          >
                            {item}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-sm font-medium text-slate-500">
                          Chưa cập nhật loại track.
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <QuickInfo
                      icon={MapPin}
                      label="Khu vực"
                      value={`${displayCafe.district}, ${displayCafe.city}`}
                    />
                    <QuickInfo
                      icon={Phone}
                      label="Liên hệ"
                      value={displayCafe.phone || "Chưa cập nhật"}
                    />
                    <QuickInfo
                      icon={Clock3}
                      label="Thời lượng slot"
                      value={
                        displayCafe.slotDurationMinutes
                          ? `${displayCafe.slotDurationMinutes} phút`
                          : "Chưa cập nhật"
                      }
                    />
                    <QuickInfo
                      icon={Users}
                      label="Sức chứa xe tự mang"
                      value={
                        displayCafe.byocCapacity !== undefined
                          ? `${displayCafe.byocCapacity}`
                          : "Chưa cập nhật"
                      }
                    />
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                    Giá tham khảo
                  </p>
                  <p className="mt-2 text-xl font-black text-slate-950">
                    {displayCafe.priceRange}
                  </p>
                  <div className="mt-4 space-y-2 text-xs font-semibold text-slate-600">
                    <span className="flex items-center gap-2">
                      <TimerReset className="h-4 w-4 text-orange-500" />{" "}
                      {displayCafe.minBookingNoticeMinutes !== undefined
                        ? `Báo trước ${displayCafe.minBookingNoticeMinutes} phút`
                        : "Chưa cập nhật thời gian báo trước"}
                    </span>
                  </div>
                  <Button
                    type="button"
                    onClick={() => onBookNow(displayCafe.id)}
                    className="mt-4 h-10 w-full rounded-xl bg-orange-600 font-black text-white hover:bg-orange-700"
                  >
                    Đặt sân này
                  </Button>
                </div>
              </div>
              {displayCafe.availableVehicles.length > 0 ? (
                <div className="mt-6">
                  <p className="mb-3 text-xs font-black uppercase tracking-wide text-slate-400">
                    Xe thuê tại cơ sở
                  </p>
                  <VehicleMiniList
                    cafeId={displayCafe.id}
                    vehicles={displayCafe.availableVehicles}
                    onBookNow={onBookNow}
                  />
                </div>
              ) : (
                <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm font-medium text-slate-500">
                  Cơ sở này chưa công khai dữ liệu xe thuê.
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function QuickInfo({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof MapPin
  label: string
  value: string
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <span className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wide text-slate-400">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </span>
      <span className="mt-1 block text-sm font-bold text-slate-900">
        {value}
      </span>
    </div>
  )
}

function formatStatus(status: NonNullable<Cafe["status"]>) {
  if (status === "ACTIVE") return "Đang hoạt động"
  if (status === "PENDING") return "Chờ duyệt"
  return "Tạm ngưng"
}
