import { CalendarDays, Clock, Repeat2 } from "lucide-react"
import type { BookingMode } from "@/features/booking/data/booking-options"
import { bookingCatalog } from "@/features/booking/data/booking-options"
import { Input } from "@/shared/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select"

export type BookingScheduleValue = {
  date: string
  time: string
  weekday: string
}

export function BookingScheduleFields({
  mode,
  value,
  onChange,
}: {
  mode: BookingMode
  value: BookingScheduleValue
  onChange: (value: BookingScheduleValue) => void
}) {
  const patchValue = (patch: Partial<BookingScheduleValue>) => onChange({ ...value, ...patch })

  return (
    <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-3">
      <label className="space-y-2">
        <span className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-500"><CalendarDays className="h-4 w-4 text-orange-600" /> {mode === "recurring" ? "Ngày bắt đầu" : "Ngày chơi"}</span>
        <Input type="date" value={value.date} onChange={(event) => patchValue({ date: event.target.value })} className="h-11 rounded-xl border-slate-200 font-bold" />
      </label>
      <label className="space-y-2">
        <span className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-500"><Clock className="h-4 w-4 text-orange-600" /> Giờ bắt đầu</span>
        <Select value={value.time} onValueChange={(time) => patchValue({ time })}>
          <SelectTrigger className="h-11 rounded-xl border-slate-200 font-bold"><SelectValue /></SelectTrigger>
          <SelectContent>
            {bookingCatalog.timeOptions.map((time) => <SelectItem key={time} value={time}>{time}</SelectItem>)}
          </SelectContent>
        </Select>
      </label>
      <label className="space-y-2">
        <span className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-500"><Repeat2 className="h-4 w-4 text-orange-600" /> {mode === "recurring" ? "Ngày lặp" : "Ưu tiên"}</span>
        <Select value={value.weekday} onValueChange={(weekday) => patchValue({ weekday })}>
          <SelectTrigger className="h-11 rounded-xl border-slate-200 font-bold"><SelectValue /></SelectTrigger>
          <SelectContent>
            {bookingCatalog.weekdayOptions.map((weekday) => <SelectItem key={weekday} value={weekday}>{weekday}</SelectItem>)}
          </SelectContent>
        </Select>
      </label>
    </div>
  )
}
