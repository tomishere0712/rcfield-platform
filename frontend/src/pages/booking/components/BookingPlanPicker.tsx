import type { BookingMode, HourlyPlan, RecurringPlan, SlotPackage } from "@/features/booking/data/booking-options"
import { bookingCatalog } from "@/features/booking/data/booking-options"
import { cn } from "@/shared/lib/utils"
import { formatCurrency } from "@/shared/lib/format"

type BookingOption = HourlyPlan | SlotPackage | RecurringPlan

export function BookingPlanPicker({
  mode,
  selectedId,
  onSelect,
}: {
  mode: BookingMode
  selectedId: string
  onSelect: (id: string) => void
}) {
  const options = getOptions(mode)

  return (
    <div className="grid gap-3 lg:grid-cols-3">
      {options.map((option) => {
        const isSelected = selectedId === option.id
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onSelect(option.id)}
            className={cn(
              "rounded-2xl border bg-white p-4 text-left shadow-sm transition hover:border-orange-300 hover:shadow-md",
              isSelected && "border-orange-500 bg-orange-50/60 ring-2 ring-orange-500/10",
            )}
          >
            <span className="text-sm font-black text-slate-950">{option.label}</span>
            <span className="mt-1 block text-xs font-bold leading-5 text-slate-500">{option.note}</span>
            <span className="mt-4 block text-xl font-black text-slate-950">{formatCurrency(getPrice(option))}</span>
            <span className="text-xs font-bold text-orange-700">{getMeta(option)}</span>
          </button>
        )
      })}
    </div>
  )
}

function getOptions(mode: BookingMode): BookingOption[] {
  if (mode === "hourly") return bookingCatalog.hourlyPlans
  if (mode === "slotPackage") return bookingCatalog.slotPackages
  return bookingCatalog.recurringPlans
}

function getPrice(option: BookingOption) {
  if ("price" in option) return option.price
  if ("pricePerMonth" in option) return option.pricePerMonth
  return option.pricePerHour * option.durationHours
}

function getMeta(option: BookingOption) {
  if ("slots" in option) return `${option.slots} slot · ${option.minutesPerSlot} phút/slot`
  if ("sessionsPerMonth" in option) return `${option.sessionsPerMonth} buổi/tháng`
  return `${option.durationHours} giờ · ${formatCurrency(option.pricePerHour)}/giờ`
}
