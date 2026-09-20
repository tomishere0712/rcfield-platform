import { AlertCircle, Car, Check, UserRound, Users, X } from "lucide-react"
import { useState } from "react"
import type { CustomerPlayMode } from "@/features/customer-booking/data/customer-booking-demo"
import type { Cafe } from "@/shared/data/explore-data"
import type { VehicleUnit } from "@/features/vehicles/types"
import { Button } from "@/shared/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card"
import { Input } from "@/shared/ui/input"
import { Badge } from "@/shared/ui/badge"
import { cn, sanitizeImageUrl } from "@/shared/lib/utils"
import { formatCurrency } from "@/shared/lib/format"
import type { TrackConfig } from "@/features/cafes/types"

export type Companion = { name: string; phone: string }

/** Kiểm tra SĐT Việt Nam: 10 chữ số, bắt đầu bằng 0 */
export function isValidVietnamesePhone(phone: string): boolean {
  return /^0\d{9}$/.test(phone.trim())
}

/** Trả về true nếu SĐT hợp lệ hoặc bỏ trống */
export function isPhoneOkOrEmpty(phone: string): boolean {
  const trimmed = phone.trim()
  return trimmed === "" || isValidVietnamesePhone(trimmed)
}

function CatalogVehicleImage({ src, alt }: { src: string; alt: string }) {
  const [isImageUnavailable, setIsImageUnavailable] = useState(false)

  if (isImageUnavailable) {
    return (
      <div className="flex h-40 w-full items-center justify-center bg-slate-100">
        <Car className="size-10 text-slate-400" />
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={alt}
      className="h-40 w-full object-cover object-center"
      onError={() => setIsImageUnavailable(true)}
    />
  )
}

type ParticipantsStepProps = {
  cafe: Cafe
  playMode: CustomerPlayMode
  onPlayModeChange: (mode: CustomerPlayMode) => void
  participants: number
  onParticipantsChange: (value: number) => void
  companions: Companion[]
  onCompanionsChange: (companions: Companion[]) => void
  selectedVehicleIds: string[]
  onVehicleSelect: (ids: string[]) => void
  byocRemaining?: number
  selectedTrackConfig?: TrackConfig | null
  catalogUnits?: VehicleUnit[]
  selectableVehicleIds?: string[]
  isVehicleAvailabilityLoading?: boolean
}

export function ParticipantsStep({
  cafe,
  playMode,
  participants,
  onParticipantsChange,
  companions,
  onCompanionsChange,
  selectedVehicleIds,
  onVehicleSelect,
  byocRemaining,
  selectedTrackConfig,
  catalogUnits,
  selectableVehicleIds,
  isVehicleAvailabilityLoading = false,
}: ParticipantsStepProps) {
  const isByocFull =
    playMode === "BYOC" && byocRemaining !== undefined && byocRemaining === 0
  // BYOC: 1 người = 1 xe = 1 slot → hard cap theo byocRemaining
  // RENTAL: participants là informational (nhóm bao nhiêu người đến), 1 booking = 1 xe thuê
  const maxParticipants = playMode === "BYOC" ? (byocRemaining ?? 1) : 10
  const selectableVehicleIdSet = new Set(selectableVehicleIds ?? [])
  const visibleVehicles = cafe.availableVehicles.filter((vehicle) => {
    const isCompatible =
      !selectedTrackConfig ||
      !vehicle.compatibleTrackTypes ||
      vehicle.compatibleTrackTypes.length === 0 ||
      vehicle.compatibleTrackTypes.some(
        (track) =>
          track.id === selectedTrackConfig.track_type_id ||
          track.code === selectedTrackConfig.track_type?.code,
      )
    if (vehicle.status !== "available" || !isCompatible) return false
    if (!catalogUnits) return true

    return catalogUnits.some(
      (unit) =>
        unit.catalogId === vehicle.id &&
        (selectableVehicleIds === undefined ||
          selectableVehicleIdSet.has(unit.id)),
    )
  })

  function handleParticipantsChange(value: number) {
    const clamped = Math.max(1, Math.min(maxParticipants, value))
    onParticipantsChange(clamped)
    // Sync companions array length to clamped - 1 (booker is always participant #1)
    const companionCount = clamped - 1
    const updated = Array.from(
      { length: companionCount },
      (_, i) => companions[i] ?? { name: "", phone: "" },
    )
    onCompanionsChange(updated)
  }

  function updateCompanion(
    index: number,
    field: keyof Companion,
    value: string,
  ) {
    const updated = companions.map((c, i) =>
      i === index ? { ...c, [field]: value } : c,
    )
    onCompanionsChange(updated)
  }

  /** Kiểm tra SĐT của 1 companion: lỗi nếu có nhập nhưng sai định dạng */
  function getPhoneError(phone: string): string | null {
    const trimmed = phone.trim()
    if (trimmed === "") return null
    return isValidVietnamesePhone(trimmed)
      ? null
      : "SĐT phải gồm 10 chữ số và bắt đầu bằng số 0"
  }

  return (
    <Card className="rounded-xl shadow-sm">
      <CardHeader>
        <CardTitle>Ai đến chơi cùng bạn?</CardTitle>
        <p className="text-sm text-muted-foreground">
          Bạn là người chơi chính. Có bạn bè đi cùng? Thêm tên họ vào đây — nhân
          viên sẽ hỗ trợ bổ sung thông tin còn thiếu lúc check-in.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Play mode — read-only, already selected in step 1 */}
        <div className="flex items-center gap-2 rounded-lg border border-orange-100 bg-orange-50/50 px-4 py-2.5">
          <span className="text-sm text-muted-foreground">Hình thức:</span>
          <span className="text-sm font-semibold text-orange-700">
            {playMode === "RENTAL" ? "Thuê xe" : "Mang xe cá nhân"}
          </span>
        </div>

        {/* BYOC full warning */}
        {isByocFull && (
          <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
            <div>
              <p className="text-sm font-semibold text-red-800">
                Khung giờ này đã hết chỗ cho xe tự mang rồi
              </p>
              <p className="mt-0.5 text-xs text-red-600">
                Bạn có thể chuyển sang thuê xe của quán, hoặc chọn khung giờ
                khác.
              </p>
            </div>
          </div>
        )}

        {/* Participant count */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-medium">
            <Users className="h-4 w-4 text-muted-foreground" /> Bao nhiêu người
            sẽ chơi?
          </label>
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 w-9 rounded-lg p-0"
              onClick={() => handleParticipantsChange(participants - 1)}
              disabled={participants <= 1}
            >
              −
            </Button>
            <span className="w-8 text-center text-base font-semibold">
              {participants}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 w-9 rounded-lg p-0"
              onClick={() => handleParticipantsChange(participants + 1)}
              disabled={participants >= maxParticipants}
            >
              +
            </Button>
            <span className="text-xs text-muted-foreground">
              {playMode === "BYOC"
                ? byocRemaining === undefined
                  ? "đang kiểm tra chỗ trống"
                  : `/ còn ${maxParticipants} chỗ · mỗi người 1 xe`
                : "người chơi · mỗi người thuê 1 xe"}
            </span>
          </div>
          {playMode === "BYOC" &&
            participants >= maxParticipants &&
            !isByocFull && (
              <p className="text-xs text-amber-600">
                Bạn đã chọn hết số chỗ xe tự mang còn trống trong khung giờ này.
              </p>
            )}
        </div>

        {/* Companion details */}
        {participants > 1 && (
          <div className="space-y-3">
            <p className="text-sm font-medium text-slate-700">
              Ai đi cùng bạn?
              <span className="ml-1.5 text-xs font-normal text-rose-500">
                (cần điền tên để đặt lịch)
              </span>
            </p>
            {companions.map((companion, i) => {
              const phoneError = getPhoneError(companion.phone)
              return (
                <div key={i} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500">
                      {i + 2}
                    </div>
                    <Input
                      placeholder="Tên người chơi"
                      value={companion.name}
                      onChange={(e) =>
                        updateCompanion(i, "name", e.target.value)
                      }
                      className="h-9 text-sm"
                    />
                    <Input
                      placeholder="Số điện thoại"
                      value={companion.phone}
                      onChange={(e) =>
                        updateCompanion(i, "phone", e.target.value)
                      }
                      maxLength={10}
                      className={cn(
                        "h-9 w-36 shrink-0 text-sm",
                        phoneError &&
                          "border-rose-400 focus-visible:ring-rose-300",
                      )}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-9 w-9 shrink-0 rounded-lg p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => handleParticipantsChange(participants - 1)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  {phoneError && (
                    <p className="pl-9 text-[11px] text-rose-500">
                      {phoneError}
                    </p>
                  )}
                </div>
              )
            })}
            <p className="text-[11px] text-muted-foreground">
              Chưa có SĐT cũng không sao — nhân viên sẽ hỏi thêm lúc check-in.
            </p>
          </div>
        )}

        {/* RENTAL: vehicle picker */}
        {playMode !== "BYOC" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-2 text-sm font-medium">
                <Car className="h-4 w-4 text-muted-foreground" /> Chọn xe bạn
                muốn lái
                <span className="text-xs font-normal text-rose-500">
                  (cần chọn {participants} xe)
                </span>
              </p>
              <div className="flex items-center gap-2">
                {selectedVehicleIds.length > 0 && (
                  <Badge
                    variant={
                      selectedVehicleIds.length >= participants
                        ? "default"
                        : "destructive"
                    }
                  >
                    {selectedVehicleIds.length}/{participants} xe
                  </Badge>
                )}
                <Badge variant="secondary">
                  {visibleVehicles.length} mẫu xe có thể chọn
                </Badge>
              </div>
            </div>
            {selectedVehicleIds.length < participants &&
              selectedVehicleIds.length > 0 && (
                <p className="text-xs text-rose-500">
                  Còn thiếu {participants - selectedVehicleIds.length} xe nữa là
                  đủ.
                </p>
              )}
            {selectedVehicleIds.length === 0 && (
              <p className="text-xs text-rose-500">
                Nhấn vào chiếc xe bạn muốn lái để tiếp tục.
              </p>
            )}
            {isVehicleAvailabilityLoading ? (
              <div className="h-28 animate-pulse rounded-xl bg-muted" />
            ) : visibleVehicles.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Không còn xe trống, phù hợp với sân đã chọn trong khung giờ này.
                Vui lòng chọn slot hoặc sân khác.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {visibleVehicles.map((vehicle) => {
                  const isCompatible =
                    !selectedTrackConfig ||
                    !vehicle.compatibleTrackTypes ||
                    vehicle.compatibleTrackTypes.length === 0 ||
                    vehicle.compatibleTrackTypes.some(
                      (t) =>
                        t.id === selectedTrackConfig.track_type_id ||
                        t.code === selectedTrackConfig.track_type?.code,
                    )
                  const isCatalogDisabled =
                    vehicle.status !== "available" || !isCompatible

                  // Units belonging to this catalog
                  const unitList =
                    catalogUnits?.filter(
                      (unit) =>
                        unit.catalogId === vehicle.id &&
                        (selectableVehicleIds === undefined ||
                          selectableVehicleIdSet.has(unit.id)),
                    ) ?? []
                  const hasUnits = unitList.length > 0
                  const availableUnits = unitList.filter(
                    (u) => u.status === "AVAILABLE",
                  )

                  // Unit-level selection: collect unit IDs from this catalog in selectedVehicleIds
                  const selectedUnitIds = unitList
                    .map((u) => u.id)
                    .filter((id) => selectedVehicleIds.includes(id))
                  // Catalog-level (legacy stepper) selection count
                  const catalogQty = selectedVehicleIds.filter(
                    (id) => id === vehicle.id,
                  ).length
                  const totalQty = selectedUnitIds.length + catalogQty

                  function toggleUnit(unitId: string) {
                    if (selectedVehicleIds.includes(unitId)) {
                      onVehicleSelect(
                        selectedVehicleIds.filter((id) => id !== unitId),
                      )
                    } else if (selectedVehicleIds.length < participants) {
                      onVehicleSelect([...selectedVehicleIds, unitId])
                    }
                  }

                  function decrement() {
                    const idx = selectedVehicleIds.lastIndexOf(vehicle.id)
                    if (idx === -1) return
                    const next = [...selectedVehicleIds]
                    next.splice(idx, 1)
                    onVehicleSelect(next)
                  }

                  function increment() {
                    onVehicleSelect([...selectedVehicleIds, vehicle.id])
                  }

                  const maxQty = Math.min(
                    vehicle.availableCount ?? participants,
                    participants,
                  )
                  const canAdd =
                    !isCatalogDisabled &&
                    catalogQty < maxQty &&
                    selectedVehicleIds.length < participants

                  return (
                    <div
                      key={vehicle.id}
                      className={cn(
                        "overflow-hidden rounded-xl border bg-background transition",
                        totalQty > 0 && "border-primary ring-2 ring-primary/10",
                        isCatalogDisabled &&
                          !hasUnits &&
                          "opacity-50 bg-slate-50/50",
                      )}
                    >
                      {/* Catalog image */}
                      <div className="relative">
                        <CatalogVehicleImage
                          src={vehicle.image}
                          alt={vehicle.name}
                        />
                        {!isCompatible && (
                          <div className="absolute left-2 top-2">
                            <Badge className="text-[9px] px-1.5 py-0.5 bg-amber-500 text-white border-none">
                              K.Tương thích
                            </Badge>
                          </div>
                        )}
                      </div>

                      <div className="space-y-2.5 p-3">
                        {/* Name + price */}
                        <div>
                          <p className="line-clamp-1 text-sm font-semibold">
                            {vehicle.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {vehicle.type}
                          </p>
                          <p className="text-sm font-semibold mt-0.5">
                            {formatCurrency(vehicle.pricePerHour)}/giờ
                          </p>
                        </div>

                        {/* Unit grid (click to select) OR catalog stepper */}
                        {hasUnits ? (
                          <div className="space-y-1.5">
                            <p className="text-[11px] font-medium text-muted-foreground">
                              Chọn chiếc bạn thích —{" "}
                              <span
                                className={cn(
                                  selectedUnitIds.length > 0
                                    ? "text-primary font-bold"
                                    : "",
                                )}
                              >
                                {availableUnits.length} xe đang rảnh
                              </span>
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {unitList.map((unit) => {
                                const imgSrc =
                                  sanitizeImageUrl(
                                    unit.distinctive_image_url,
                                  ) || vehicle.image
                                const isSelected = selectedVehicleIds.includes(
                                  unit.id,
                                )
                                const isAvailable = unit.status === "AVAILABLE"
                                const canPick =
                                  isAvailable &&
                                  (isSelected ||
                                    selectedVehicleIds.length < participants)
                                return (
                                  <button
                                    key={unit.id}
                                    type="button"
                                    disabled={!canPick}
                                    onClick={() => toggleUnit(unit.id)}
                                    className={cn(
                                      "flex flex-col items-center gap-0.5 rounded-lg border-2 p-1 transition",
                                      isSelected
                                        ? "border-primary bg-primary/5"
                                        : "border-zinc-200 hover:border-zinc-400",
                                      !isAvailable &&
                                        "cursor-not-allowed opacity-40",
                                      !canPick &&
                                        isAvailable &&
                                        "cursor-not-allowed opacity-50",
                                    )}
                                  >
                                    <div className="relative size-10 overflow-hidden rounded-md bg-zinc-100">
                                      <img
                                        src={imgSrc}
                                        alt={unit.identifier}
                                        className="h-full w-full object-cover"
                                        onError={(e) => {
                                          ;(e.target as HTMLImageElement).src =
                                            vehicle.image
                                        }}
                                      />
                                      {isSelected && (
                                        <div className="absolute inset-0 flex items-center justify-center bg-primary/25">
                                          <Check className="size-4 text-primary drop-shadow" />
                                        </div>
                                      )}
                                      {!isAvailable && (
                                        <div className="absolute inset-0 flex items-end justify-center bg-black/30 pb-0.5">
                                          <span className="text-[8px] font-bold text-white leading-none">
                                            Bận
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                    <span className="max-w-[42px] truncate text-[10px] font-bold leading-none text-zinc-800">
                                      {unit.identifier}
                                    </span>
                                    {unit.color && (
                                      <span className="max-w-[42px] truncate text-[9px] leading-none text-muted-foreground">
                                        {unit.color}
                                      </span>
                                    )}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 w-7 rounded-md p-0 text-base"
                              disabled={catalogQty === 0}
                              onClick={decrement}
                            >
                              −
                            </Button>
                            <span className="w-5 text-center text-sm font-semibold tabular-nums">
                              {catalogQty}
                            </span>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 w-7 rounded-md p-0 text-base"
                              disabled={!canAdd}
                              onClick={increment}
                            >
                              +
                            </Button>
                            {vehicle.availableCount !== undefined &&
                              vehicle.availableCount > 0 && (
                                <span className="text-[11px] text-muted-foreground">
                                  / {vehicle.availableCount} xe
                                </span>
                              )}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* BYOC info */}
        {playMode !== "RENTAL" && (
          <div
            className={cn(
              "rounded-xl border p-4",
              isByocFull
                ? "border-red-200 bg-red-50/50"
                : "border-slate-200 bg-muted/40",
            )}
          >
            <div className="flex items-start gap-3">
              <UserRound
                className={cn(
                  "mt-0.5 h-5 w-5 shrink-0",
                  isByocFull ? "text-red-400" : "text-muted-foreground",
                )}
              />
              <div className="flex-1">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-sm">
                    Mang xe của bạn đến — nhân viên kiểm tra tại quầy
                  </p>
                  {byocRemaining !== undefined && (
                    <Badge
                      variant={byocRemaining > 0 ? "secondary" : "destructive"}
                      className="shrink-0 text-xs"
                    >
                      {byocRemaining > 0
                        ? `Còn ${byocRemaining} chỗ xe tự mang`
                        : "Hết chỗ xe tự mang"}
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Mỗi người tham gia sử dụng xe tự mang sẽ chiếm một chỗ trong
                  khung giờ. Nhân viên sẽ xác nhận xe của bạn ngay khi đến.
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
