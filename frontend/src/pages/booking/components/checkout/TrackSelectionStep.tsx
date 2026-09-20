import { useMemo, useState } from "react"
import {
  CheckCircle2,
  ImageOff,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Images,
} from "lucide-react"
import { useTrackConfigs } from "@/features/cafes/hooks/useTrackConfigs"
import type { TrackConfig } from "@/features/cafes/types"
import { useDailyAvailability } from "@/features/booking/hooks/use-booking"
import { cn } from "@/shared/lib/utils"
import { Input } from "@/shared/ui/input"
import {
  DailySlotGrid,
  type DailySlot,
  type DailySlotStatus,
} from "@/pages/customer/cafe-detail/components/DailySlotGrid"
import type { HourlySlotAvailability } from "@/features/booking/hooks/use-booking"
import { SlotPriceLabel } from "@/shared/components/SlotPriceLabel"
import { TrackAlbumDialog } from "@/shared/components/TrackAlbumDialog"

type PlayMode = "RENTAL" | "BYOC"

function addCalendarDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number)
  const result = new Date(Date.UTC(year, month - 1, day + days))
  return result.toISOString().slice(0, 10)
}

interface TrackSelectionStepProps {
  cafeId: string
  date: string
  setDate: (d: string) => void
  selectedSlot: string
  setSelectedSlot: (s: string) => void
  selectedSlotEnd: string | null
  setSelectedSlotEnd: (s: string | null) => void
  selectedTrackConfig: TrackConfig | null
  onSelectTrack: (config: TrackConfig) => void
  slotDurationMinutes: number
  minBookingNoticeMinutes?: number
  minBookingDate: string
  maxAdvanceBookingDays: number
  openHour: number
  closeHour: number
  isClosedDate: boolean
  isScheduleConfigured: boolean
  playMode: PlayMode
  onPlayModeChange: (mode: PlayMode) => void
  /** Effective price per hour from the pricing preview API (optional) */
  effectivePricePerHour?: number
  /** Dynamic pricing label, e.g. "Cuối tuần" or "Giờ cao điểm" (optional) */
  pricingLabel?: string | null
}

export function TrackSelectionStep({
  cafeId,
  date,
  setDate,
  selectedSlot,
  setSelectedSlot,
  selectedSlotEnd,
  setSelectedSlotEnd,
  selectedTrackConfig,
  onSelectTrack,
  slotDurationMinutes,
  minBookingNoticeMinutes = 0,
  minBookingDate,
  maxAdvanceBookingDays,
  openHour,
  closeHour,
  isClosedDate,
  isScheduleConfigured,
  playMode,
  onPlayModeChange,
  effectivePricePerHour,
  pricingLabel,
}: TrackSelectionStepProps) {
  const { data: configs = [], isLoading } = useTrackConfigs(cafeId)
  const maxBookingDate = addCalendarDays(minBookingDate, maxAdvanceBookingDays)

  const handleDateChange = (nextDate: string) => {
    setDate(nextDate)
    setSelectedSlot("")
    setSelectedSlotEnd(null)
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
    )
  }

  if (configs.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-8 text-center">
        <ImageOff className="mx-auto mb-2 size-8 text-muted-foreground" />
        <p className="text-sm font-medium text-muted-foreground">
          Cơ sở chưa cấu hình loại sân
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Vui lòng liên hệ cơ sở để biết thêm thông tin.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Track grid */}
      <div>
        <h2 className="mb-1 text-lg font-bold tracking-tight">Chọn loại sân</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Bấm vào sân bạn muốn chơi
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {configs.map((config) => (
            <TrackCard
              key={config.id}
              config={config}
              isSelected={selectedTrackConfig?.id === config.id}
              onSelect={() => {
                onSelectTrack(config)
                setSelectedSlot("")
                setSelectedSlotEnd(null)
                // Auto-switch to supported mode when track changes
                if (config.max_concurrent === 0 && playMode === "RENTAL") {
                  onPlayModeChange("BYOC")
                } else if (config.byoc_capacity === 0 && playMode === "BYOC") {
                  onPlayModeChange("RENTAL")
                }
              }}
            />
          ))}
        </div>
      </div>

      {/* Slot picker — shown after track is selected */}
      {selectedTrackConfig && !isScheduleConfigured && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p>
            {isClosedDate
              ? "Cơ sở nghỉ vào ngày đã chọn. Vui lòng chọn ngày khác."
              : "Cơ sở chưa cấu hình giờ hoạt động hoặc thời lượng slot hợp lệ cho ngày này. Vui lòng chọn ngày khác hoặc liên hệ cơ sở."}
          </p>
          {isClosedDate && (
            <label className="mt-3 flex items-center gap-2 text-xs font-semibold">
              <CalendarDays className="size-4" />
              <span>Chọn ngày khác</span>
              <Input
                type="date"
                value={date}
                min={minBookingDate}
                max={maxBookingDate}
                onChange={(event) => handleDateChange(event.target.value)}
                className="h-8 w-auto bg-white text-xs"
              />
            </label>
          )}
        </div>
      )}

      {selectedTrackConfig && isScheduleConfigured && (
        <SlotPicker
          cafeId={cafeId}
          trackConfig={selectedTrackConfig}
          date={date}
          setDate={setDate}
          selectedSlot={selectedSlot}
          setSelectedSlot={setSelectedSlot}
          selectedSlotEnd={selectedSlotEnd}
          setSelectedSlotEnd={setSelectedSlotEnd}
          slotDurationMinutes={slotDurationMinutes}
          minBookingNoticeMinutes={minBookingNoticeMinutes}
          minBookingDate={minBookingDate}
          maxAdvanceBookingDays={maxAdvanceBookingDays}
          openHour={openHour}
          closeHour={closeHour}
          playMode={playMode}
          onPlayModeChange={onPlayModeChange}
        />
      )}

      {/* Dynamic pricing label — shown when a slot is selected */}
      {selectedSlot && effectivePricePerHour !== undefined && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-100 bg-amber-50/60 px-3 py-2">
          <span className="text-xs text-[#5c5a5a]">Giá slot:</span>
          <SlotPriceLabel
            effectivePrice={effectivePricePerHour}
            label={pricingLabel ?? null}
          />
        </div>
      )}
    </div>
  )
}

function SlotPicker({
  cafeId,
  trackConfig,
  date,
  setDate,
  selectedSlot,
  setSelectedSlot,
  selectedSlotEnd,
  setSelectedSlotEnd,
  slotDurationMinutes,
  minBookingNoticeMinutes = 0,
  minBookingDate,
  maxAdvanceBookingDays,
  openHour,
  closeHour,
  playMode,
  onPlayModeChange,
}: {
  cafeId: string
  trackConfig: TrackConfig
  date: string
  setDate: (d: string) => void
  selectedSlot: string
  setSelectedSlot: (s: string) => void
  selectedSlotEnd: string | null
  setSelectedSlotEnd: (s: string | null) => void
  slotDurationMinutes: number
  minBookingNoticeMinutes?: number
  minBookingDate: string
  maxAdvanceBookingDays: number
  openHour: number
  closeHour: number
  playMode: PlayMode
  onPlayModeChange: (mode: PlayMode) => void
}) {
  const { data: dailyAvailability, isLoading } = useDailyAvailability(
    cafeId,
    date,
    openHour,
    closeHour,
    trackConfig.id,
  )

  const slots = useMemo<DailySlot[]>(() => {
    if (!dailyAvailability) return []
    return buildSlotsFromAvailability(dailyAvailability, playMode)
  }, [dailyAvailability, playMode])

  const hasRental = trackConfig.max_concurrent > 0
  const hasByoc = trackConfig.byoc_capacity > 0
  const maxBookingDate = addCalendarDays(minBookingDate, maxAdvanceBookingDays)

  return (
    <div className="rounded-xl border border-orange-100 bg-orange-50/30 p-4 space-y-4">
      <h3 className="text-sm font-bold text-[#1c1b1b]">Chọn ngày & giờ</h3>

      {/* Play mode toggle */}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={!hasRental}
          onClick={() => {
            onPlayModeChange("RENTAL")
            setSelectedSlot("")
            setSelectedSlotEnd(null)
          }}
          className={cn(
            "flex-1 rounded-lg py-2 text-xs font-bold transition-colors border",
            !hasRental && "opacity-40 cursor-not-allowed",
            hasRental && playMode === "RENTAL"
              ? "bg-orange-500 text-white border-orange-500"
              : hasRental
                ? "bg-white text-[#747878] border-[#e5e2e1] hover:border-orange-300 hover:text-orange-600"
                : "bg-white text-[#747878] border-[#e5e2e1]",
          )}
        >
          Thuê xe
          {!hasRental && (
            <span className="ml-1 text-[10px] font-normal">Không hỗ trợ</span>
          )}
        </button>
        <button
          type="button"
          disabled={!hasByoc}
          onClick={() => {
            onPlayModeChange("BYOC")
            setSelectedSlot("")
            setSelectedSlotEnd(null)
          }}
          className={cn(
            "flex-1 rounded-lg py-2 text-xs font-bold transition-colors border",
            !hasByoc && "opacity-40 cursor-not-allowed",
            hasByoc && playMode === "BYOC"
              ? "bg-orange-500 text-white border-orange-500"
              : hasByoc
                ? "bg-white text-[#747878] border-[#e5e2e1] hover:border-orange-300 hover:text-orange-600"
                : "bg-white text-[#747878] border-[#e5e2e1]",
          )}
        >
          Sử dụng xe cá nhân
          {!hasByoc && (
            <span className="ml-1 text-[10px] font-normal">Không hỗ trợ</span>
          )}
        </button>
      </div>

      <label className="flex items-center gap-2">
        <CalendarDays className="size-4 text-muted-foreground" />
        <span className="text-xs font-semibold text-[#1c1b1b]">Ngày chạy</span>
        <Input
          type="date"
          value={date}
          min={minBookingDate}
          max={maxBookingDate}
          onChange={(event) => {
            setDate(event.target.value)
            setSelectedSlot("")
            setSelectedSlotEnd(null)
          }}
          className="h-8 w-auto text-xs"
        />
      </label>
      <p className="-mt-2 text-[11px] font-medium text-muted-foreground">
        Có thể đặt lịch đến hết ngày {new Date(`${maxBookingDate}T00:00:00`).toLocaleDateString("vi-VN")}.
      </p>

      <div
        className={cn(
          "transition-opacity",
          isLoading && "pointer-events-none opacity-40",
        )}
      >
        {isLoading && (
          <p className="mb-2 text-[10px] text-muted-foreground animate-pulse">
            Đang kiểm tra slot...
          </p>
        )}
        <DailySlotGrid
          slots={slots}
          selectedSlotId={selectedSlot}
          selectedSlotEndId={selectedSlotEnd ?? undefined}
          onSelectSlot={setSelectedSlot}
          slotDurationMinutes={slotDurationMinutes}
          minBookingNoticeMinutes={minBookingNoticeMinutes}
          openHour={openHour}
          closeHour={closeHour}
          date={date}
          onSelectRange={(start, end) => {
            setSelectedSlot(start)
            setSelectedSlotEnd(end || null)
          }}
        />
      </div>
    </div>
  )
}

function TrackCard({
  config,
  isSelected,
  onSelect,
}: {
  config: TrackConfig
  isSelected: boolean
  onSelect: () => void
}) {
  const [imageIdx, setImageIdx] = useState(0)
  const [showAlbum, setShowAlbum] = useState(false)
  const images = config.images ?? []
  const hasImages = images.length > 0
  const currentImage = images[imageIdx] || images[0]

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation()
    setImageIdx((prev) => (prev > 0 ? prev - 1 : images.length - 1))
  }

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation()
    setImageIdx((prev) => (prev < images.length - 1 ? prev + 1 : 0))
  }

  const handleOpenAlbum = (e: React.MouseEvent) => {
    e.stopPropagation()
    setShowAlbum(true)
  }

  return (
    <>
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "group relative overflow-hidden rounded-xl border-2 text-left transition-all",
          isSelected
            ? "border-orange-500 shadow-[0_0_0_3px_rgba(249,115,22,0.15)]"
            : "border-border hover:border-orange-300 hover:shadow-sm",
        )}
      >
        {/* Cover image fixed 16:9 */}
        <div
          className="relative w-full overflow-hidden bg-muted"
          style={{ aspectRatio: "16/9" }}
        >
          {hasImages ? (
            <img
              src={currentImage}
              alt={config.track_type?.name}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-102"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <ImageOff className="size-8 text-muted-foreground/40" />
            </div>
          )}

          {/* Selected Checkmark Badge */}
          {isSelected && (
            <div className="absolute right-2 top-2 z-10 rounded-full bg-orange-500 p-0.5 shadow">
              <CheckCircle2 className="size-4 text-white" />
            </div>
          )}

          {/* Photos Count & Album Open Button */}
          {hasImages && (
            <div className="absolute top-2 left-2 z-10 flex items-center gap-1">
              <button
                type="button"
                onClick={handleOpenAlbum}
                className="flex items-center gap-1 rounded-md bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur-xs transition hover:bg-black/80 hover:scale-105"
                title="Xem album ảnh"
              >
                <Images className="size-3" />
                <span>{images.length} ảnh</span>
              </button>
            </div>
          )}

          {/* Carousel Next / Prev Controls */}
          {images.length > 1 && (
            <>
              <button
                type="button"
                onClick={handlePrev}
                className="absolute left-1.5 top-1/2 -translate-y-1/2 z-10 flex size-7 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/80"
                title="Ảnh trước"
              >
                <ChevronLeft className="size-4" />
              </button>
              <button
                type="button"
                onClick={handleNext}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 z-10 flex size-7 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/80"
                title="Ảnh tiếp"
              >
                <ChevronRight className="size-4" />
              </button>

              {/* Dots indicator */}
              <div className="absolute bottom-2 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-full bg-black/40 px-2 py-0.5 backdrop-blur-xs">
                {images.slice(0, 5).map((_, idx) => (
                  <span
                    key={idx}
                    className={cn(
                      "size-1.5 rounded-full transition-all",
                      idx === imageIdx
                        ? "w-3 bg-white"
                        : "bg-white/60 hover:bg-white/90",
                    )}
                  />
                ))}
                {images.length > 5 && (
                  <span className="text-[9px] font-bold text-white/80">
                    +{images.length - 5}
                  </span>
                )}
              </div>
            </>
          )}

          {/* Quick Expand Icon on Hover */}
          {hasImages && (
            <button
              type="button"
              onClick={handleOpenAlbum}
              className="absolute bottom-2 right-2 z-10 flex size-6 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/80"
              title="Phóng to album"
            >
              <Maximize2 className="size-3" />
            </button>
          )}
        </div>

        <div className="p-3">
          <p className="font-bold text-[#1c1b1b]">
            {config.track_type?.name ?? "Loại sân"}
          </p>
          <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
            {config.max_concurrent > 0 ? (
              <span>{config.max_concurrent} chỗ thuê xe</span>
            ) : (
              <span className="text-[#c4c7c8]">Không có xe thuê</span>
            )}
            {config.byoc_capacity > 0 ? (
              <span>{config.byoc_capacity} chỗ xe tự mang</span>
            ) : (
              <span className="text-[#c4c7c8]">Không nhận xe riêng</span>
            )}
          </div>
          {config.description && (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
              {config.description}
            </p>
          )}
        </div>
      </button>

      {/* Lightbox Album Modal */}
      <TrackAlbumDialog
        trackConfig={config}
        isOpen={showAlbum}
        onClose={() => setShowAlbum(false)}
        initialIndex={imageIdx}
      />
    </>
  )
}

function buildSlotsFromAvailability(
  hourlyData: HourlySlotAvailability[],
  playMode: PlayMode,
): DailySlot[] {
  return hourlyData.map(({ hour, data }) => {
    const startTime = `${String(hour).padStart(2, "0")}:00`
    const endTime = `${String(hour + 1).padStart(2, "0")}:00`
    if (!data) {
      return {
        id: startTime,
        startTime,
        endTime,
        status: "booked" as DailySlotStatus,
        remaining: 0,
        rentalCount: 0,
        byocRemaining: 0,
        capacityKind: playMode === "RENTAL" ? "rental_vehicle" : "byoc_spot",
      }
    }

    const rentalCount = data.vehicles?.length ?? 0
    const byocRemaining = data.byoc_remaining ?? 0

    let remaining: number
    let available: boolean
    if (playMode === "RENTAL") {
      remaining = rentalCount
      available = rentalCount > 0
    } else {
      remaining = byocRemaining
      available = byocRemaining > 0
    }

    /*
      Sân bị giải đấu giữ riêng KHÔNG phải là "hết chỗ".

      Trước đây cả hai cùng ra nhãn "Hết", nên một ngày có giải hiện mười ba
      khung giờ "Hết" liên tiếp và khách kết luận quán kín lịch — trong khi sự
      thật là hôm đó có giải, hôm sau vẫn trống. Hai tình huống dẫn tới hai hành
      động khác nhau: hết chỗ thì thử giờ khác trong ngày, có giải thì đổi ngày.
    */
    let status: DailySlotStatus
    if (data.unavailable_reason === "CONTEST") status = "contest"
    else if (!available) status = "booked"
    else if (remaining <= 2) status = "limited"
    else status = "available"

    return {
      id: startTime,
      startTime,
      endTime,
      status,
      remaining,
      rentalCount: playMode === "BYOC" ? 0 : rentalCount,
      byocRemaining: playMode === "RENTAL" ? 0 : byocRemaining,
      capacityKind: playMode === "RENTAL" ? "rental_vehicle" : "byoc_spot",
      contestName: data.contest?.name,
    }
  })
}
