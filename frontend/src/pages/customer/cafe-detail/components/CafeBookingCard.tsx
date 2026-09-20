import { useMemo } from "react"
import { Link } from "react-router"
import { CalendarDays, X } from "lucide-react"
import type { BookingMode } from "@/features/booking/data/booking-options"
import type { MenuItem } from "@/features/menu/types"
import type { Cafe } from "@/shared/data/explore-data"
import { formatCurrency } from "@/shared/lib/format"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { buildCafeBookingPath } from "../cafe-detail-utils"

type CafeBookingCardProps = {
  cafe: Cafe
  selectedVehicleId?: string
  onClearVehicle?: () => void
  fnbQuantities: Record<string, number>
  onClearFnb?: () => void
  mode: BookingMode
  selectedDate: string
  setSelectedDate: (date: string) => void
  menuItems: MenuItem[]
}

/**
 * Bảng tóm tắt & điểm khởi hành của luồng đặt lịch.
 *
 * Đây KHÔNG phải nơi chốt giờ: khung giờ trống phụ thuộc vào loại sân, mà loại sân
 * chỉ được chọn ở bước sau. Trước đây component nhận `selectedSlotId`, `setMode`…
 * rồi không dùng tới, khiến người đọc code tưởng chỗ này chọn được giờ. Nay chỉ
 * nhận đúng những gì nó thật sự dùng, và nói rõ với khách bước tiếp theo làm gì.
 */
export function CafeBookingCard({
  cafe,
  selectedVehicleId,
  onClearVehicle,
  fnbQuantities,
  onClearFnb,
  mode,
  selectedDate,
  setSelectedDate,
  menuItems,
}: CafeBookingCardProps) {
  const slotFeeRate = Number(cafe.slotFeeRate ?? 0)
  const slotDuration = cafe.slotDurationMinutes
  const hasConfiguredSlotDuration =
    typeof slotDuration === "number" &&
    Number.isInteger(slotDuration) &&
    slotDuration > 0
  const durationLabel = hasConfiguredSlotDuration
    ? slotDuration === 60
      ? "1 giờ"
      : `${slotDuration} phút`
    : "Chưa cấu hình"

  const selectedFnb = useMemo(() => {
    const items = Object.entries(fnbQuantities)
      .filter(([, qty]) => qty > 0)
      .map(([id, qty]) => {
        const item = menuItems.find((m) => m.id === id)
        return item ? { item, qty } : null
      })
      .filter((entry): entry is { item: MenuItem; qty: number } => entry !== null)

    return {
      items,
      count: items.reduce((sum, entry) => sum + entry.qty, 0),
      total: items.reduce((sum, entry) => sum + Number(entry.item.price) * entry.qty, 0),
    }
  }, [fnbQuantities, menuItems])

  const selectedVehicle = cafe.availableVehicles.find((v) => v.id === selectedVehicleId)
  const vehiclePrice = selectedVehicle?.pricePerHour ?? 0

  // Tiền sân + tiền xe tính theo từng slot; đồ ăn đặt trước chỉ tính một lần cho
  // cả đơn. Bản cũ cộng cả ba rồi gắn nhãn "Tạm tính / slot" — con số đó sai ngay
  // khi khách đặt từ 2 slot trở lên, và lệch với hoá đơn ở bước thanh toán.
  const perSlotTotal = slotFeeRate + vehiclePrice
  const orderTotal = perSlotTotal + selectedFnb.total

  const serializedFnb = Object.entries(fnbQuantities)
    .filter(([, qty]) => qty > 0)
    .map(([id, qty]) => `${id}:${qty}`)
    .join(",")

  const bookingPath = buildCafeBookingPath(cafe.id, mode, {
    date: selectedDate,
    vehicleId: selectedVehicleId,
    fnb: serializedFnb || undefined,
  })

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_18px_60px_rgba(15,23,42,0.10)]">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-2xl font-black text-slate-950">
          {formatCurrency(slotFeeRate)}
          <span className="ml-1.5 text-sm font-semibold text-slate-500">/ {durationLabel}</span>
        </p>
      </div>

      <label className="mt-5 block space-y-2">
        <span className="flex items-center gap-2 text-sm font-bold text-slate-800">
          <CalendarDays className="size-4 text-slate-400" />
          Ngày muốn chơi
        </span>
        <Input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="h-11 rounded-xl text-sm"
        />
      </label>

      {/* Những gì khách đã chọn ở các phần bên trái — trước đây chỉ hiện thành một
          dòng tiền, khách cuộn xa rồi thì không nhớ mình chọn xe nào, món gì. */}
      {(selectedVehicle || selectedFnb.count > 0) && (
        <div className="mt-5 space-y-2.5 border-t border-slate-200 pt-4">
          {selectedVehicle && (
            <SelectionRow
              label="Xe thuê"
              value={selectedVehicle.name}
              onClear={onClearVehicle}
              clearLabel="Bỏ chọn xe"
            />
          )}
          {selectedFnb.count > 0 && (
            <SelectionRow
              label="Đặt trước"
              value={
                selectedFnb.items.length === 1
                  ? `${selectedFnb.items[0].qty}× ${selectedFnb.items[0].item.name}`
                  : `${selectedFnb.count} món`
              }
              onClear={onClearFnb}
              clearLabel="Bỏ chọn đồ ăn"
            />
          )}
        </div>
      )}

      <div className="mt-5 space-y-2 border-t border-slate-200 pt-4 text-sm">
        <div className="flex items-center justify-between text-slate-600">
          <span>Tiền sân ({durationLabel})</span>
          <span className="tabular-nums">{formatCurrency(slotFeeRate)}</span>
        </div>
        {vehiclePrice > 0 && (
          <div className="flex items-center justify-between text-slate-600">
            <span>Thuê xe ({durationLabel})</span>
            <span className="tabular-nums">+{formatCurrency(vehiclePrice)}</span>
          </div>
        )}
        <div className="flex items-center justify-between border-t border-dashed border-slate-200 pt-2 font-bold text-slate-900">
          <span>Mỗi slot</span>
          <span className="tabular-nums">{formatCurrency(perSlotTotal)}</span>
        </div>

        {selectedFnb.total > 0 && (
          <>
            <div className="flex items-center justify-between pt-1 text-slate-600">
              <span>Đồ ăn đặt trước (một lần)</span>
              <span className="tabular-nums">+{formatCurrency(selectedFnb.total)}</span>
            </div>
            <div className="flex items-center justify-between border-t border-dashed border-slate-200 pt-2">
              <span className="font-bold text-slate-900">Tạm tính cho 1 slot</span>
              <span className="text-base font-black tabular-nums text-orange-600">
                {formatCurrency(orderTotal)}
              </span>
            </div>
          </>
        )}
      </div>

      <Button
        asChild
        className="mt-5 h-12 w-full rounded-xl bg-orange-500 text-base font-bold text-white shadow-md transition-all hover:bg-orange-600 active:scale-[0.98]"
      >
        <Link to={bookingPath}>Chọn giờ & đặt lịch →</Link>
      </Button>

      <p className="mt-3 text-center text-sm text-slate-500">
        Bước sau bạn chọn loại sân và khung giờ còn trống. Chưa trừ tiền ở bước này.
      </p>
    </div>
  )
}

function SelectionRow({
  label,
  value,
  onClear,
  clearLabel,
}: {
  label: string
  value: string
  onClear?: () => void
  clearLabel: string
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="shrink-0 text-slate-500">{label}</span>
      <span className="min-w-0 flex-1 truncate text-right font-bold text-slate-900">{value}</span>
      {onClear && (
        <button
          type="button"
          onClick={onClear}
          aria-label={clearLabel}
          className="grid size-6 shrink-0 place-items-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  )
}
