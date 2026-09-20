import { CalendarClock, Clock, PackageCheck, Repeat2 } from "lucide-react"
import type { BookingMode } from "@/features/booking/data/booking-options"
import { bookingModeCopy } from "@/features/booking/data/booking-options"
import { cn } from "@/shared/lib/utils"

const modeIcons = {
  hourly: Clock,
  slotPackage: PackageCheck,
  recurring: Repeat2,
}

const modeAccent = {
  hourly: "from-orange-500 to-red-500",
  slotPackage: "from-sky-500 to-cyan-500",
  recurring: "from-emerald-500 to-teal-500",
}

export function BookingModeSelector({ value, onChange }: { value: BookingMode; onChange: (value: BookingMode) => void }) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {(Object.keys(bookingModeCopy) as BookingMode[]).map((mode) => {
        const Icon = modeIcons[mode]
        const isActive = value === mode
        return (
          <button
            key={mode}
            type="button"
            onClick={() => onChange(mode)}
            className={cn(
              "group rounded-2xl border bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg",
              isActive ? "border-slate-950 ring-2 ring-slate-950/10" : "border-slate-200",
            )}
          >
            <span className={cn("mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br text-white", modeAccent[mode])}>
              <Icon className="h-5 w-5" />
            </span>
            <span className="flex items-center gap-2 text-base font-black text-slate-950">
              {bookingModeCopy[mode].title}
              {isActive && <CalendarClock className="h-4 w-4 text-orange-600" />}
            </span>
            <span className="mt-2 block text-sm font-medium leading-6 text-slate-500">{bookingModeCopy[mode].description}</span>
          </button>
        )
      })}
    </div>
  )
}
