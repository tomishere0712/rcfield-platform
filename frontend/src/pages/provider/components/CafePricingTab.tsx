import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  CalendarDays,
  Check,
  Clock3,
  Lock,
  Pencil,
  Plus,
  RotateCcw,
  Tag,
  Trash2,
  X,
} from "lucide-react"
import { toast } from "sonner"

import {
  pricingApi,
  pricingQueryKeys,
  type CreateHolidayBody,
  type HolidayItem,
  type PeakHourInput,
  type PricingRule,
} from "@/features/pricing/api/pricing.api"
import { cafeApi, cafeQueryKeys } from "@/features/cafes/api/cafe.api"
import type { BackendCafe, CafeUpsertBody } from "@/features/cafes/types"
import { Panel, PanelTitle } from "@/pages/provider/components/ProviderPrimitives"
import { Badge } from "@/shared/ui/badge"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Label } from "@/shared/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select"
import { Separator } from "@/shared/ui/separator"
import { Switch } from "@/shared/ui/switch"
import { cn } from "@/shared/lib/utils"

const YEAR_OPTIONS = [2025, 2026, 2027]

// ── CafePricingTab ─────────────────────────────────────────────────────────────

export function CafePricingTab({ cafeId, cafe }: { cafeId: string; cafe: BackendCafe }) {
  const queryClient = useQueryClient()
  const [holidayYear, setHolidayYear] = useState(new Date().getFullYear())

  const pricingQuery = useQuery({
    queryKey: pricingQueryKeys.provider(cafeId),
    queryFn: () => pricingApi.getProviderPricing(cafeId),
    enabled: !!cafeId,
  })

  const holidaysQuery = useQuery({
    queryKey: pricingQueryKeys.holidays(cafeId, holidayYear),
    queryFn: () => pricingApi.listHolidays(cafeId, holidayYear),
    enabled: !!cafeId,
  })

  const invalidatePricing = () =>
    queryClient.invalidateQueries({ queryKey: pricingQueryKeys.provider(cafeId) })
  const invalidateHolidays = () =>
    queryClient.invalidateQueries({ queryKey: pricingQueryKeys.holidays(cafeId, holidayYear) })

  const basePrice = pricingQuery.data?.base_price_per_hour ?? 0
  const rules = pricingQuery.data?.rules ?? []
  const weekendRule = rules.find((r) => r.rule_type === "WEEKEND")
  const peakRules = rules.filter((r) => r.rule_type === "PEAK_HOURS")

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-6">
      <div className="space-y-4 lg:col-span-7">
        <SlotSettingsPanel cafeId={cafeId} cafe={cafe} onSaved={invalidatePricing} />
        <BasePricePanel basePrice={basePrice} />
        <WeekendRulePanel
          cafeId={cafeId}
          weekendRule={weekendRule ?? null}
          basePrice={basePrice}
          peakRules={peakRules}
          onSaved={invalidatePricing}
        />
        <PeakHoursPanel
          cafeId={cafeId}
          peakRules={peakRules}
          basePrice={basePrice}
          weekendRule={weekendRule ?? null}
          onSaved={invalidatePricing}
        />
      </div>

      <div className="space-y-4 lg:col-span-5">
        <HolidayPanel
          cafeId={cafeId}
          year={holidayYear}
          onYearChange={setHolidayYear}
          holidays={holidaysQuery.data?.holidays ?? []}
          loading={holidaysQuery.isLoading}
          onChanged={invalidateHolidays}
        />
      </div>
    </div>
  )
}

// ── Slot Settings Panel ────────────────────────────────────────────────────────

function SlotSettingsPanel({
  cafeId,
  cafe,
  onSaved,
}: {
  cafeId: string
  cafe: BackendCafe
  onSaved: () => void
}) {
  const queryClient = useQueryClient()
  const [slotFee, setSlotFee] = useState(Number(cafe.slotFeeRate))
  const [slotDuration, setSlotDuration] = useState(cafe.slotDurationMinutes)
  const [bookingNotice, setBookingNotice] = useState(cafe.minBookingNoticeMinutes)
  const [maxAdvanceBookingDays, setMaxAdvanceBookingDays] = useState(cafe.maxAdvanceBookingDays)
  const [isEditing, setIsEditing] = useState(false)

  useEffect(() => {
    queueMicrotask(() => {
      setSlotFee(Number(cafe.slotFeeRate))
      setSlotDuration(cafe.slotDurationMinutes)
      setBookingNotice(cafe.minBookingNoticeMinutes)
      setMaxAdvanceBookingDays(cafe.maxAdvanceBookingDays)
    })
  }, [cafe])

  const updateMutation = useMutation({
    mutationFn: () => {
      const body: CafeUpsertBody = {
        name: cafe.name,
        description: cafe.description ?? null,
        phone: cafe.phone ?? null,
        cover_image_url: cafe.coverImageUrl ?? null,
        address: cafe.address,
        district: cafe.district,
        city: cafe.city,
        latitude: cafe.latitude === null ? null : Number(cafe.latitude),
        longitude: cafe.longitude === null ? null : Number(cafe.longitude),
        operating_hours: cafe.operatingHours,
        track_types: cafe.trackTypes.map((t) => t.id),
        slot_fee_rate: slotFee,
        slot_duration_minutes: slotDuration,
        max_concurrent_bookings: cafe.maxConcurrentBookings,
        min_booking_notice_minutes: bookingNotice,
        max_advance_booking_days: maxAdvanceBookingDays,
        byoc_capacity: cafe.byocCapacity,
        amenity_ids: cafe.amenityIds ?? [],
        rules: cafe.rules ?? [],
      }
      return cafeApi.updateCafe(cafeId, body)
    },
    onSuccess: async () => {
      toast.success("Đã cập nhật cài đặt slot")
      setIsEditing(false)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: cafeQueryKeys.detail(cafeId) }),
        onSaved(),
      ])
    },
    onError: () => toast.error("Cập nhật thất bại"),
  })

  const handleCancel = () => {
    setSlotFee(Number(cafe.slotFeeRate))
    setSlotDuration(cafe.slotDurationMinutes)
    setBookingNotice(cafe.minBookingNoticeMinutes)
    setMaxAdvanceBookingDays(cafe.maxAdvanceBookingDays)
    setIsEditing(false)
  }

  return (
    <Panel>
      <div className="flex items-center justify-between">
        <PanelTitle title="Cài đặt slot" subtitle="Giá và thời gian đặt trước" />
        {!isEditing && (
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 rounded-lg border-[#c4c7c8] text-sm"
            onClick={() => setIsEditing(true)}
          >
            <Pencil className="size-3.5" />
            Chỉnh sửa
          </Button>
        )}
      </div>

      {!isEditing ? (
        <div className="mt-3 space-y-2">
          <SlotInfoRow label="Phí slot" value={`${slotFee.toLocaleString("vi-VN")}đ / slot`} />
          <SlotInfoRow label="Đặt trước tối thiểu" value={`${bookingNotice} phút`} />
          <SlotInfoRow label="Đặt trước tối đa" value={`${maxAdvanceBookingDays} ngày`} />
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label className="text-xs text-[#5c5a5a]">Phí slot (VNĐ)</Label>
              <Input
                type="text"
                inputMode="numeric"
                value={slotFee === 0 ? "" : slotFee.toLocaleString("vi-VN")}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, "")
                  setSlotFee(digits === "" ? 0 : Number(digits))
                }}
                className="rounded-lg border-[#c4c7c8]"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-[#5c5a5a]">Báo trước (phút)</Label>
              <Input
                type="number"
                min={0}
                value={bookingNotice}
                onChange={(e) => setBookingNotice(Number(e.target.value) || 0)}
                className="rounded-lg border-[#c4c7c8]"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-[#5c5a5a]">Đặt trước tối đa (ngày)</Label>
              <Input
                type="number"
                min={1}
                max={365}
                value={maxAdvanceBookingDays}
                onChange={(e) => setMaxAdvanceBookingDays(Math.min(365, Math.max(1, Number(e.target.value) || 1)))}
                className="rounded-lg border-[#c4c7c8]"
              />
            </div>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <Button
              size="sm"
              className="rounded-lg bg-[#1c1b1b] text-white hover:bg-[#313030]"
              onClick={() => updateMutation.mutate()}
              disabled={updateMutation.isPending}
            >
              <Check className="size-3.5 mr-1" />
              Lưu
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="rounded-lg border-[#c4c7c8]"
              onClick={handleCancel}
              disabled={updateMutation.isPending}
            >
              <X className="size-3.5 mr-1" />
              Hủy
            </Button>
          </div>
        </div>
      )}
    </Panel>
  )
}

function SlotInfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-[#f8f5f4] px-4 py-2.5">
      <span className="text-sm text-[#5c5a5a]">{label}</span>
      <span className="text-sm font-semibold text-[#1c1b1b]">{value}</span>
    </div>
  )
}

// ── Base Price Panel ───────────────────────────────────────────────────────────

function BasePricePanel({ basePrice }: { basePrice: number }) {
  return (
    <Panel>
      <PanelTitle title="Giá cơ bản hiệu lực" subtitle="Phí slot × hệ số ngày/giờ (tham khảo)" />
      <div className="flex items-center gap-3 rounded-lg bg-[#f8f5f4] px-4 py-3">
        <Tag className="size-5 text-[#8a8685]" />
        <span className="text-lg font-bold text-[#1c1b1b]">
          {basePrice.toLocaleString("vi-VN")}đ / giờ
        </span>
        <span className="ml-auto text-xs text-[#8a8685]">Hệ số × 1.0 (mặc định)</span>
      </div>
    </Panel>
  )
}

// ── Weekend Rule Panel ─────────────────────────────────────────────────────────

function WeekendRulePanel({
  cafeId,
  weekendRule,
  basePrice,
  peakRules,
  onSaved,
}: {
  cafeId: string
  weekendRule: PricingRule | null
  basePrice: number
  peakRules: PricingRule[]
  onSaved: () => void
}) {
  const [enabled, setEnabled] = useState(!!weekendRule)
  const [multiplier, setMultiplier] = useState(weekendRule?.multiplier ?? 1.5)

  useEffect(() => {
    queueMicrotask(() => {
      setEnabled(!!weekendRule)
      setMultiplier(weekendRule?.multiplier ?? 1.5)
    })
  }, [weekendRule])

  const updateMutation = useMutation({
    mutationFn: (weekendMultiplier: number | null) =>
      pricingApi.updatePricingRules(cafeId, {
        weekend_multiplier: weekendMultiplier,
        peak_hours: peakRules.map((r) => ({
          start: r.peak_start_time!,
          end: r.peak_end_time!,
          multiplier: r.multiplier,
        })),
      }),
    onSuccess: () => {
      toast.success("Đã cập nhật hệ số cuối tuần")
      onSaved()
    },
    onError: () => toast.error("Cập nhật thất bại"),
  })

  const handleToggle = (checked: boolean) => {
    setEnabled(checked)
    if (!checked) updateMutation.mutate(null)
  }

  const effectivePrice = enabled ? basePrice * multiplier : basePrice

  return (
    <Panel>
      <div className="flex items-center justify-between">
        <PanelTitle title="Hệ số cuối tuần" subtitle="Thứ 7 & Chủ nhật" />
        <Switch checked={enabled} onCheckedChange={handleToggle} disabled={updateMutation.isPending} />
      </div>

      {enabled && (
        <div className="mt-4 space-y-3">
          <div className="flex items-center gap-3">
            <Label className="w-24 shrink-0 text-sm text-[#5c5a5a]">Hệ số ×</Label>
            <Input
              type="number"
              step="0.1"
              min="1.0"
              max="5.0"
              value={multiplier}
              onChange={(e) => setMultiplier(parseFloat(e.target.value) || 1.0)}
              className="w-28 rounded-lg border-[#c4c7c8]"
            />
            <span className="text-sm text-[#8a8685]">
              → {effectivePrice.toLocaleString("vi-VN")}đ/h
            </span>
          </div>
          <Button
            size="sm"
            className="rounded-lg bg-[#1c1b1b] text-white hover:bg-[#313030]"
            onClick={() => updateMutation.mutate(multiplier)}
            disabled={updateMutation.isPending}
          >
            Lưu
          </Button>
        </div>
      )}
    </Panel>
  )
}

// ── Peak Hours Panel — inline editing ─────────────────────────────────────────

function PeakHoursPanel({
  cafeId,
  peakRules,
  basePrice,
  weekendRule,
  onSaved,
}: {
  cafeId: string
  peakRules: PricingRule[]
  basePrice: number
  weekendRule: PricingRule | null
  onSaved: () => void
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [peaks, setPeaks] = useState<PeakHourInput[]>([])

  // Sync local state when switching into edit mode
  const startEditing = () => {
    setPeaks(
      peakRules.map((r) => ({
        start: r.peak_start_time ?? "18:00",
        end: r.peak_end_time ?? "21:00",
        multiplier: r.multiplier,
      })),
    )
    setIsEditing(true)
  }

  const cancelEditing = () => setIsEditing(false)

  const updateMutation = useMutation({
    mutationFn: (newPeaks: PeakHourInput[]) =>
      pricingApi.updatePricingRules(cafeId, {
        weekend_multiplier: weekendRule?.multiplier ?? null,
        peak_hours: newPeaks,
      }),
    onSuccess: () => {
      toast.success("Đã cập nhật khung giờ cao điểm")
      setIsEditing(false)
      onSaved()
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      const code = err.response?.data?.error
      toast.error(
        code === "OVERLAPPING_PEAK_HOURS"
          ? "Khung giờ bị trùng. Vui lòng kiểm tra lại."
          : "Cập nhật thất bại",
      )
    },
  })

  const addPeak = () =>
    setPeaks((prev) => [...prev, { start: "18:00", end: "21:00", multiplier: 1.3 }])

  const removePeak = (idx: number) =>
    setPeaks((prev) => prev.filter((_, i) => i !== idx))

  const updatePeak = (idx: number, field: keyof PeakHourInput, value: string | number) =>
    setPeaks((prev) => prev.map((p, i) => (i === idx ? { ...p, [field]: value } : p)))

  return (
    <Panel>
      <div className="flex items-center justify-between">
        <PanelTitle title="Giờ cao điểm" subtitle={`${peakRules.length} khung giờ`} />
        {!isEditing && (
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 rounded-lg border-[#c4c7c8] text-sm"
            onClick={startEditing}
          >
            <Pencil className="size-3.5" />
            Chỉnh sửa
          </Button>
        )}
      </div>

      {/* Read-only view */}
      {!isEditing && (
        peakRules.length === 0 ? (
          <p className="mt-3 text-sm text-[#8a8685]">Chưa có khung giờ cao điểm.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {peakRules.map((r) => (
              <div key={r.id} className="flex items-center gap-3 rounded-lg bg-[#f8f5f4] px-3 py-2">
                <Clock3 className="size-4 shrink-0 text-[#8a8685]" />
                <span className="text-sm font-medium text-[#1c1b1b]">
                  {r.peak_start_time} – {r.peak_end_time}
                </span>
                <Badge variant="secondary" className="ml-auto rounded-full text-xs">
                  ×{r.multiplier}
                </Badge>
                <span className="text-xs text-[#8a8685]">
                  {(basePrice * r.multiplier).toLocaleString("vi-VN")}đ/h
                </span>
              </div>
            ))}
          </div>
        )
      )}

      {/* Inline edit form */}
      {isEditing && (
        <div className="mt-4 space-y-3">
          {peaks.map((p, idx) => (
            <div key={idx} className="flex items-end gap-2 rounded-lg border border-[#e5e2e1] bg-[#faf8f7] p-3">
              <div className="flex-1 space-y-1">
                <Label className="text-xs text-[#5c5a5a]">Từ</Label>
                <Input
                  type="time"
                  value={p.start}
                  onChange={(e) => updatePeak(idx, "start", e.target.value)}
                  className="rounded-lg border-[#c4c7c8]"
                />
              </div>
              <div className="flex-1 space-y-1">
                <Label className="text-xs text-[#5c5a5a]">Đến</Label>
                <Input
                  type="time"
                  value={p.end}
                  onChange={(e) => updatePeak(idx, "end", e.target.value)}
                  className="rounded-lg border-[#c4c7c8]"
                />
              </div>
              <div className="w-24 space-y-1">
                <Label className="text-xs text-[#5c5a5a]">Hệ số ×</Label>
                <Input
                  type="number"
                  step="0.1"
                  min="1.0"
                  max="5.0"
                  value={p.multiplier}
                  onChange={(e) => updatePeak(idx, "multiplier", parseFloat(e.target.value) || 1.0)}
                  className="rounded-lg border-[#c4c7c8]"
                />
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="shrink-0 text-red-400 hover:text-red-600"
                onClick={() => removePeak(idx)}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}

          <button
            type="button"
            onClick={addPeak}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-[#c4c7c8] py-2 text-sm text-[#8a8685] transition-colors hover:border-[#a0a0a0] hover:text-[#5c5a5a]"
          >
            <Plus className="size-3.5" />
            Thêm khung giờ
          </button>

          <div className="flex items-center gap-2 pt-1">
            <Button
              size="sm"
              className="rounded-lg bg-[#1c1b1b] text-white hover:bg-[#313030]"
              onClick={() => updateMutation.mutate(peaks)}
              disabled={updateMutation.isPending}
            >
              <Check className="size-3.5 mr-1" />
              Lưu
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="rounded-lg border-[#c4c7c8]"
              onClick={cancelEditing}
              disabled={updateMutation.isPending}
            >
              <X className="size-3.5 mr-1" />
              Hủy
            </Button>
          </div>
        </div>
      )}
    </Panel>
  )
}

// ── Holiday Panel — inline editing ─────────────────────────────────────────────

function HolidayPanel({
  cafeId,
  year,
  onYearChange,
  holidays,
  loading,
  onChanged,
}: {
  cafeId: string
  year: number
  onYearChange: (y: number) => void
  holidays: HolidayItem[]
  loading: boolean
  onChanged: () => void
}) {
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const systemHolidays = holidays.filter((h) => h.holiday_type === "SYSTEM")
  const customHolidays = holidays.filter((h) => h.holiday_type === "CUSTOM")

  const deleteMutation = useMutation({
    mutationFn: (holidayId: string) => pricingApi.deleteHoliday(cafeId, holidayId),
    onSuccess: () => {
      toast.success("Đã xóa ngày lễ")
      onChanged()
    },
    onError: () => toast.error("Xóa thất bại"),
  })

  const resetOverrideMutation = useMutation({
    mutationFn: (holidayId: string) => pricingApi.deleteHolidayOverride(cafeId, holidayId),
    onSuccess: () => {
      toast.success("Đã đặt lại hệ số mặc định")
      onChanged()
    },
    onError: () => toast.error("Đặt lại thất bại"),
  })

  return (
    <Panel>
      <div className="flex items-center justify-between">
        <PanelTitle
          title="Ngày lễ"
          subtitle={`${holidays.length} ngày trong năm ${year}`}
        />
        <div className="flex items-center gap-2">
          <Select value={String(year)} onValueChange={(v) => onYearChange(Number(v))}>
            <SelectTrigger className="h-8 w-24 rounded-lg border-[#c4c7c8] text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {YEAR_OPTIONS.map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            className={cn(
              "gap-1.5 rounded-lg text-sm",
              showAddForm
                ? "bg-white border border-[#c4c7c8] text-[#5c5a5a] hover:bg-[#f8f5f4]"
                : "bg-[#1c1b1b] text-white hover:bg-[#313030]",
            )}
            onClick={() => {
              setShowAddForm((v) => !v)
              setEditingId(null)
            }}
          >
            {showAddForm ? <X className="size-3.5" /> : <Plus className="size-3.5" />}
            {showAddForm ? "Hủy" : "Thêm"}
          </Button>
        </div>
      </div>

      {/* Inline add form */}
      {showAddForm && (
        <AddHolidayInline
          cafeId={cafeId}
          onSaved={() => {
            setShowAddForm(false)
            onChanged()
          }}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      {loading ? (
        <div className="mt-4 space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-[#f0eceb]" />
          ))}
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {systemHolidays.length > 0 && (
            <div className="space-y-1">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[#8a8685]">
                Ngày lễ quốc gia
              </p>
              {systemHolidays.map((h) => {
                const effective = h.override_multiplier ?? h.multiplier
                const isEditingThis = editingId === h.id
                return (
                  <div key={h.id}>
                    <div className="flex items-center gap-2 rounded-lg border border-[#e5e2e1] bg-white px-3 py-2">
                      <Lock className="size-3.5 shrink-0 text-[#8a8685]" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-[#1c1b1b]">{h.name}</p>
                        <p className="text-xs text-[#8a8685]">{h.date}</p>
                      </div>
                      <Badge
                        variant={h.override_multiplier !== null ? "outline" : "secondary"}
                        className={cn(
                          "rounded-full text-xs",
                          h.override_multiplier !== null && "border-amber-300 text-amber-700",
                        )}
                      >
                        ×{effective}
                      </Badge>
                      <div className="flex items-center gap-0.5">
                        <Button
                          size="icon"
                          variant="ghost"
                          className={cn("size-7", isEditingThis ? "text-orange-600" : "text-[#5c5a5a]")}
                          onClick={() => setEditingId(isEditingThis ? null : h.id)}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        {h.override_multiplier !== null && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-7 text-[#8a8685]"
                            onClick={() => resetOverrideMutation.mutate(h.id)}
                            disabled={resetOverrideMutation.isPending}
                            title="Đặt lại về mặc định"
                          >
                            <RotateCcw className="size-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                    {isEditingThis && (
                      <EditHolidayInline
                        cafeId={cafeId}
                        holiday={h}
                        onSaved={() => {
                          setEditingId(null)
                          onChanged()
                        }}
                        onCancel={() => setEditingId(null)}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {systemHolidays.length > 0 && customHolidays.length > 0 && (
            <Separator className="bg-[#e5e2e1]" />
          )}

          {customHolidays.length > 0 && (
            <div className="space-y-1">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[#8a8685]">
                Ngày lễ tùy chỉnh
              </p>
              {customHolidays.map((h) => {
                const isEditingThis = editingId === h.id
                return (
                  <div key={h.id}>
                    <div className="flex items-center gap-2 rounded-lg border border-[#e5e2e1] bg-white px-3 py-2">
                      <CalendarDays className="size-3.5 shrink-0 text-[#8a8685]" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-[#1c1b1b]">{h.name}</p>
                        <p className="text-xs text-[#8a8685]">{h.date}</p>
                      </div>
                      <Badge variant="secondary" className="rounded-full text-xs">
                        ×{h.multiplier}
                      </Badge>
                      <div className="flex items-center gap-0.5">
                        <Button
                          size="icon"
                          variant="ghost"
                          className={cn("size-7", isEditingThis ? "text-orange-600" : "text-[#5c5a5a]")}
                          onClick={() => setEditingId(isEditingThis ? null : h.id)}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7 text-red-400 hover:text-red-600"
                          onClick={() => deleteMutation.mutate(h.id)}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                    {isEditingThis && (
                      <EditHolidayInline
                        cafeId={cafeId}
                        holiday={h}
                        onSaved={() => {
                          setEditingId(null)
                          onChanged()
                        }}
                        onCancel={() => setEditingId(null)}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {holidays.length === 0 && !showAddForm && (
            <p className="text-sm text-[#8a8685]">Chưa có ngày lễ nào trong năm {year}.</p>
          )}
        </div>
      )}
    </Panel>
  )
}

// ── Inline Add Holiday Form ────────────────────────────────────────────────────

function AddHolidayInline({
  cafeId,
  onSaved,
  onCancel,
}: {
  cafeId: string
  onSaved: () => void
  onCancel: () => void
}) {
  const [date, setDate] = useState("")
  const [name, setName] = useState("")
  const [multiplier, setMultiplier] = useState(1.5)

  const createMutation = useMutation({
    mutationFn: (body: CreateHolidayBody) => pricingApi.createHoliday(cafeId, body),
    onSuccess: () => {
      toast.success("Đã thêm ngày lễ")
      onSaved()
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      const code = err.response?.data?.error
      toast.error(
        code === "HOLIDAY_DATE_CONFLICT"
          ? "Ngày này đã có ngày lễ. Vui lòng chọn ngày khác."
          : "Thêm thất bại",
      )
    },
  })

  return (
    <div className="mt-3 rounded-lg border border-orange-200 bg-orange-50/40 p-4 space-y-3">
      <p className="text-xs font-semibold text-[#5c5a5a] uppercase tracking-wide">Thêm ngày lễ tùy chỉnh</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-[#5c5a5a]">Ngày</Label>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border-[#c4c7c8] bg-white"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-[#5c5a5a]">Hệ số ×</Label>
          <Input
            type="number"
            step="0.1"
            min="1.0"
            max="5.0"
            value={multiplier}
            onChange={(e) => setMultiplier(parseFloat(e.target.value) || 1.0)}
            className="rounded-lg border-[#c4c7c8] bg-white"
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-[#5c5a5a]">Tên ngày lễ</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="VD: Ngày thành lập cơ sở"
          className="rounded-lg border-[#c4c7c8] bg-white"
        />
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          className="rounded-lg bg-[#1c1b1b] text-white hover:bg-[#313030]"
          disabled={!date || !name || createMutation.isPending}
          onClick={() => createMutation.mutate({ date, name, multiplier })}
        >
          <Check className="size-3.5 mr-1" />
          Thêm
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="rounded-lg border-[#c4c7c8]"
          onClick={onCancel}
          disabled={createMutation.isPending}
        >
          Hủy
        </Button>
      </div>
    </div>
  )
}

// ── Inline Edit Holiday Form ───────────────────────────────────────────────────

function EditHolidayInline({
  cafeId,
  holiday,
  onSaved,
  onCancel,
}: {
  cafeId: string
  holiday: HolidayItem
  onSaved: () => void
  onCancel: () => void
}) {
  const isSystem = holiday.holiday_type === "SYSTEM"
  const [multiplier, setMultiplier] = useState(holiday.override_multiplier ?? holiday.multiplier)
  const [name, setName] = useState(holiday.name)

  useEffect(() => {
    queueMicrotask(() => {
      setMultiplier(holiday.override_multiplier ?? holiday.multiplier)
      setName(holiday.name)
    })
  }, [holiday])

  const updateMutation = useMutation({
    mutationFn: () =>
      pricingApi.updateHoliday(cafeId, holiday.id, {
        multiplier,
        ...(!isSystem ? { name } : {}),
      }),
    onSuccess: () => {
      toast.success(isSystem ? "Đã cập nhật hệ số override" : "Đã cập nhật ngày lễ")
      onSaved()
    },
    onError: () => toast.error("Cập nhật thất bại"),
  })

  return (
    <div className="mx-1 mb-1 rounded-b-lg border border-t-0 border-[#e5e2e1] bg-[#faf8f7] px-3 py-3 space-y-3">
      {isSystem && (
        <p className="text-xs text-[#8a8685]">
          Override cho cơ sở này. Hệ thống mặc định: ×{holiday.multiplier}
        </p>
      )}
      {!isSystem && (
        <div className="space-y-1">
          <Label className="text-xs text-[#5c5a5a]">Tên ngày lễ</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-lg border-[#c4c7c8] bg-white"
          />
        </div>
      )}
      <div className="flex items-center gap-3">
        <Label className="shrink-0 text-xs text-[#5c5a5a]">Hệ số ×</Label>
        <Input
          type="number"
          step="0.1"
          min="1.0"
          max="5.0"
          value={multiplier}
          onChange={(e) => setMultiplier(parseFloat(e.target.value) || 1.0)}
          className="w-28 rounded-lg border-[#c4c7c8] bg-white"
        />
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          className="rounded-lg bg-[#1c1b1b] text-white hover:bg-[#313030]"
          disabled={updateMutation.isPending}
          onClick={() => updateMutation.mutate()}
        >
          <Check className="size-3.5 mr-1" />
          Lưu
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="rounded-lg border-[#c4c7c8]"
          onClick={onCancel}
          disabled={updateMutation.isPending}
        >
          Hủy
        </Button>
      </div>
    </div>
  )
}
