import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  CalendarDays,
  Clock3,
  Lock,
  Pencil,
  Plus,
  RotateCcw,
  Tag,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"

import { cafeApi, cafeQueryKeys } from "@/features/cafes/api/cafe.api"
import { useAuthStore } from "@/features/auth/stores/auth.store"
import {
  pricingApi,
  pricingQueryKeys,
  type CreateHolidayBody,
  type HolidayItem,
  type PeakHourInput,
  type PricingRule,
} from "@/features/pricing/api/pricing.api"
import { Panel, PanelTitle, ProviderPageHeader } from "@/pages/provider/components/ProviderPrimitives"
import { ProviderShell } from "@/pages/provider/components/ProviderShell"
import { Badge } from "@/shared/ui/badge"
import { Button } from "@/shared/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/shared/ui/dialog"
import { Input } from "@/shared/ui/input"
import { Label } from "@/shared/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select"
import { Separator } from "@/shared/ui/separator"
import { Switch } from "@/shared/ui/switch"

const YEAR_OPTIONS = [2025, 2026, 2027]

// ── Main Page ──────────────────────────────────────────────────────────────────

export function ProviderPricingPage() {
  const queryClient = useQueryClient()
  const providerId = useAuthStore((state) => state.user?.id)
  const [selectedCafeId, setSelectedCafeId] = useState<string>("")
  const [holidayYear, setHolidayYear] = useState(new Date().getFullYear())

  // Cafe list
  const cafesQuery = useQuery({
    queryKey: cafeQueryKeys.list({ page: 1, limit: 100, scope: "managed" }),
    queryFn: () => cafeApi.listCafes({ page: 1, limit: 100, scope: "managed" }),
  })
  const cafes = (cafesQuery.data?.data ?? []).filter((c) => !providerId || c.providerId === providerId)

  useEffect(() => {
    if (!selectedCafeId && cafes.length > 0) {
      queueMicrotask(() => setSelectedCafeId(cafes[0].id))
    }
  }, [cafes, selectedCafeId])

  // Pricing rules
  const pricingQuery = useQuery({
    queryKey: pricingQueryKeys.provider(selectedCafeId),
    queryFn: () => pricingApi.getProviderPricing(selectedCafeId),
    enabled: !!selectedCafeId,
  })

  // Holidays
  const holidaysQuery = useQuery({
    queryKey: pricingQueryKeys.holidays(selectedCafeId, holidayYear),
    queryFn: () => pricingApi.listHolidays(selectedCafeId, holidayYear),
    enabled: !!selectedCafeId,
  })

  const invalidatePricing = () => {
    queryClient.invalidateQueries({ queryKey: pricingQueryKeys.provider(selectedCafeId) })
  }
  const invalidateHolidays = () => {
    queryClient.invalidateQueries({ queryKey: pricingQueryKeys.holidays(selectedCafeId, holidayYear) })
  }

  const basePrice = pricingQuery.data?.base_price_per_hour ?? 0
  const rules = pricingQuery.data?.rules ?? []
  const weekendRule = rules.find((r) => r.rule_type === "WEEKEND")
  const peakRules = rules.filter((r) => r.rule_type === "PEAK_HOURS")

  return (
    <ProviderShell>
      <ProviderPageHeader
        title="Cấu hình giá"
        description="Thiết lập giá cơ bản, hệ số cuối tuần, khung giờ cao điểm và ngày lễ cho từng cơ sở."
      />

      {/* Cafe selector */}
      {cafes.length > 1 && (
        <div className="mb-4 flex items-center gap-3">
          <Label className="shrink-0 text-sm font-medium text-[#5c5a5a]">Cơ sở</Label>
          <Select value={selectedCafeId} onValueChange={setSelectedCafeId}>
            <SelectTrigger className="w-56 rounded-lg border-[#c4c7c8] bg-white">
              <SelectValue placeholder="Chọn cơ sở" />
            </SelectTrigger>
            <SelectContent>
              {cafes.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {!selectedCafeId ? (
        <div className="flex h-40 items-center justify-center text-sm text-[#8a8685]">
          Chưa có cơ sở nào. Vui lòng tạo cơ sở trước.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-6">
          {/* Left column: pricing rules */}
          <div className="space-y-4 lg:col-span-7">
            <BasePricePanel basePrice={basePrice} />
            <WeekendRulePanel
              cafeId={selectedCafeId}
              weekendRule={weekendRule ?? null}
              basePrice={basePrice}
              onSaved={invalidatePricing}
              peakRules={peakRules}
            />
            <PeakHoursPanel
              cafeId={selectedCafeId}
              peakRules={peakRules}
              basePrice={basePrice}
              weekendRule={weekendRule ?? null}
              onSaved={invalidatePricing}
            />
          </div>

          {/* Right column: holiday management */}
          <div className="space-y-4 lg:col-span-5">
            <HolidayPanel
              cafeId={selectedCafeId}
              year={holidayYear}
              onYearChange={setHolidayYear}
              holidays={holidaysQuery.data?.holidays ?? []}
              loading={holidaysQuery.isLoading}
              onChanged={invalidateHolidays}
            />
          </div>
        </div>
      )}
    </ProviderShell>
  )
}

// ── Base Price Panel ───────────────────────────────────────────────────────────

function BasePricePanel({ basePrice }: { basePrice: number }) {
  return (
    <Panel>
      <PanelTitle title="Giá cơ bản" subtitle="Được cấu hình trong phần thông tin cơ sở" />
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
  onSaved,
  peakRules,
}: {
  cafeId: string
  weekendRule: PricingRule | null
  basePrice: number
  onSaved: () => void
  peakRules: PricingRule[]
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

  const handleSave = () => {
    if (enabled) updateMutation.mutate(multiplier)
  }

  const effectivePrice = enabled ? basePrice * multiplier : basePrice

  return (
    <Panel>
      <div className="flex items-center justify-between">
        <PanelTitle
          title="Hệ số cuối tuần"
          subtitle="Thứ 7 &amp; Chủ nhật"
        />
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
              → {(effectivePrice).toLocaleString("vi-VN")}đ/h
            </span>
          </div>
          <Button
            size="sm"
            className="rounded-lg bg-[#1c1b1b] text-white hover:bg-[#313030]"
            onClick={handleSave}
            disabled={updateMutation.isPending}
          >
            Lưu
          </Button>
        </div>
      )}
    </Panel>
  )
}

// ── Peak Hours Panel ──────────────────────────────────────────────────────────

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
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [peaks, setPeaks] = useState<PeakHourInput[]>([])

  useEffect(() => {
    queueMicrotask(() => {
      setPeaks(
        peakRules.map((r) => ({
          start: r.peak_start_time ?? "18:00",
          end: r.peak_end_time ?? "21:00",
          multiplier: r.multiplier,
        })),
      )
    })
  }, [peakRules])

  const updateMutation = useMutation({
    mutationFn: (newPeaks: PeakHourInput[]) =>
      pricingApi.updatePricingRules(cafeId, {
        weekend_multiplier: weekendRule?.multiplier ?? null,
        peak_hours: newPeaks,
      }),
    onSuccess: () => {
      toast.success("Đã cập nhật khung giờ cao điểm")
      setEditDialogOpen(false)
      onSaved()
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      const code = err.response?.data?.error
      if (code === "OVERLAPPING_PEAK_HOURS") {
        toast.error("Khung giờ bị trùng. Vui lòng kiểm tra lại.")
      } else {
        toast.error("Cập nhật thất bại")
      }
    },
  })

  const addPeak = () =>
    setPeaks((prev) => [...prev, { start: "18:00", end: "21:00", multiplier: 1.3 }])

  const removePeak = (idx: number) => setPeaks((prev) => prev.filter((_, i) => i !== idx))

  const updatePeak = (idx: number, field: keyof PeakHourInput, value: string | number) =>
    setPeaks((prev) => prev.map((p, i) => (i === idx ? { ...p, [field]: value } : p)))

  return (
    <Panel>
      <div className="flex items-center justify-between">
        <PanelTitle title="Giờ cao điểm" subtitle={`${peakRules.length} khung giờ`} />
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 rounded-lg border-[#c4c7c8] text-sm"
          onClick={() => setEditDialogOpen(true)}
        >
          <Pencil className="size-3.5" />
          Chỉnh sửa
        </Button>
      </div>

      {peakRules.length === 0 ? (
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
      )}

      {/* Edit dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Chỉnh sửa khung giờ cao điểm</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {peaks.map((p, idx) => (
              <div key={idx} className="flex items-end gap-2">
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
                  className="shrink-0 text-red-500 hover:text-red-600"
                  onClick={() => removePeak(idx)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}

            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 rounded-lg border-dashed border-[#c4c7c8]"
              onClick={addPeak}
            >
              <Plus className="size-3.5" />
              Thêm khung giờ
            </Button>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Hủy
            </Button>
            <Button
              className="bg-[#1c1b1b] text-white hover:bg-[#313030]"
              onClick={() => updateMutation.mutate(peaks)}
              disabled={updateMutation.isPending}
            >
              Lưu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Panel>
  )
}

// ── Holiday Panel ──────────────────────────────────────────────────────────────

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
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false)
  const [selectedHoliday, setSelectedHoliday] = useState<HolidayItem | null>(null)

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
            className="gap-1.5 rounded-lg bg-[#1c1b1b] text-white hover:bg-[#313030]"
            onClick={() => setAddDialogOpen(true)}
          >
            <Plus className="size-3.5" />
            Thêm
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="mt-4 space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-[#f0eceb]" />
          ))}
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {/* System holidays */}
          {systemHolidays.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-[#8a8685]">
                Ngày lễ quốc gia
              </p>
              {systemHolidays.map((h) => {
                const effective = h.override_multiplier ?? h.multiplier
                return (
                  <div
                    key={h.id}
                    className="flex items-center gap-2 rounded-lg border border-[#e5e2e1] bg-white px-3 py-2"
                  >
                    <Lock className="size-3.5 shrink-0 text-[#8a8685]" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[#1c1b1b]">{h.name}</p>
                      <p className="text-xs text-[#8a8685]">{h.date}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {h.override_multiplier !== null && (
                        <Badge variant="outline" className="rounded-full border-amber-300 text-amber-700 text-xs">
                          ×{effective}
                        </Badge>
                      )}
                      {effective === 1.0 && (
                        <Badge variant="secondary" className="rounded-full text-xs">
                          ×1.0
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-7 text-[#5c5a5a]"
                        onClick={() => {
                          setSelectedHoliday(h)
                          setOverrideDialogOpen(true)
                        }}
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
                )
              })}
            </div>
          )}

          {systemHolidays.length > 0 && customHolidays.length > 0 && (
            <Separator className="bg-[#e5e2e1]" />
          )}

          {/* Custom holidays */}
          {customHolidays.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-[#8a8685]">
                Ngày lễ tùy chỉnh
              </p>
              {customHolidays.map((h) => (
                <div
                  key={h.id}
                  className="flex items-center gap-2 rounded-lg border border-[#e5e2e1] bg-white px-3 py-2"
                >
                  <CalendarDays className="size-3.5 shrink-0 text-[#8a8685]" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[#1c1b1b]">{h.name}</p>
                    <p className="text-xs text-[#8a8685]">{h.date}</p>
                  </div>
                  <Badge variant="secondary" className="rounded-full text-xs">
                    ×{h.multiplier}
                  </Badge>
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7 text-[#5c5a5a]"
                      onClick={() => {
                        setSelectedHoliday(h)
                        setOverrideDialogOpen(true)
                      }}
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
              ))}
            </div>
          )}

          {holidays.length === 0 && (
            <p className="text-sm text-[#8a8685]">Chưa có ngày lễ nào trong năm {year}.</p>
          )}
        </div>
      )}

      {/* Add custom holiday dialog */}
      <AddHolidayDialog
        cafeId={cafeId}
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onSaved={onChanged}
      />

      {/* Edit / override dialog */}
      {selectedHoliday && (
        <EditHolidayDialog
          cafeId={cafeId}
          holiday={selectedHoliday}
          open={overrideDialogOpen}
          onOpenChange={(open) => {
            setOverrideDialogOpen(open)
            if (!open) setSelectedHoliday(null)
          }}
          onSaved={onChanged}
        />
      )}
    </Panel>
  )
}

// ── Add Holiday Dialog ─────────────────────────────────────────────────────────

function AddHolidayDialog({
  cafeId,
  open,
  onOpenChange,
  onSaved,
}: {
  cafeId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const [date, setDate] = useState("")
  const [name, setName] = useState("")
  const [multiplier, setMultiplier] = useState(1.5)

  const createMutation = useMutation({
    mutationFn: (body: CreateHolidayBody) => pricingApi.createHoliday(cafeId, body),
    onSuccess: () => {
      toast.success("Đã thêm ngày lễ")
      onOpenChange(false)
      setDate("")
      setName("")
      setMultiplier(1.5)
      onSaved()
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      const code = err.response?.data?.error
      if (code === "HOLIDAY_DATE_CONFLICT") {
        toast.error("Ngày này đã có ngày lễ. Vui lòng chọn ngày khác.")
      } else {
        toast.error("Thêm thất bại")
      }
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Thêm ngày lễ tùy chỉnh</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Ngày</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-lg border-[#c4c7c8]"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Tên ngày lễ</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="VD: Ngày thành lập cơ sở"
              className="rounded-lg border-[#c4c7c8]"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Hệ số ×</Label>
            <Input
              type="number"
              step="0.1"
              min="1.0"
              max="5.0"
              value={multiplier}
              onChange={(e) => setMultiplier(parseFloat(e.target.value) || 1.0)}
              className="rounded-lg border-[#c4c7c8]"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Hủy</Button>
          <Button
            className="bg-[#1c1b1b] text-white hover:bg-[#313030]"
            disabled={!date || !name || createMutation.isPending}
            onClick={() => createMutation.mutate({ date, name, multiplier })}
          >
            Thêm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Edit / Override Dialog ─────────────────────────────────────────────────────

function EditHolidayDialog({
  cafeId,
  holiday,
  open,
  onOpenChange,
  onSaved,
}: {
  cafeId: string
  holiday: HolidayItem
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const isSystem = holiday.holiday_type === "SYSTEM"
  const currentMultiplier = holiday.override_multiplier ?? holiday.multiplier
  const [multiplier, setMultiplier] = useState(currentMultiplier)
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
      onOpenChange(false)
      onSaved()
    },
    onError: () => toast.error("Cập nhật thất bại"),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {isSystem ? "Đặt hệ số cho ngày lễ quốc gia" : "Chỉnh sửa ngày lễ"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-lg bg-[#f8f5f4] px-3 py-2">
            <p className="text-sm font-medium text-[#1c1b1b]">{holiday.name}</p>
            <p className="text-xs text-[#8a8685]">{holiday.date}</p>
          </div>

          {!isSystem && (
            <div className="space-y-1.5">
              <Label>Tên ngày lễ</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="rounded-lg border-[#c4c7c8]"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>{isSystem ? "Hệ số áp dụng cho cơ sở này ×" : "Hệ số ×"}</Label>
            <Input
              type="number"
              step="0.1"
              min="1.0"
              max="5.0"
              value={multiplier}
              onChange={(e) => setMultiplier(parseFloat(e.target.value) || 1.0)}
              className="rounded-lg border-[#c4c7c8]"
            />
            {isSystem && (
              <p className="text-xs text-[#8a8685]">
                Hệ số mặc định hệ thống: ×{holiday.multiplier}. Override chỉ áp dụng cho cơ sở này.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Hủy</Button>
          <Button
            className="bg-[#1c1b1b] text-white hover:bg-[#313030]"
            disabled={updateMutation.isPending}
            onClick={() => updateMutation.mutate()}
          >
            Lưu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
