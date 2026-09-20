import { ArrowRight, MapPin, ReceiptText, ShieldCheck } from "lucide-react"
import type { BookingMode } from "@/features/booking/data/booking-options"
import { bookingCatalog, bookingModeCopy } from "@/features/booking/data/booking-options"
import type { Cafe, Vehicle } from "@/shared/data/explore-data"
import { Button } from "@/shared/ui/button"
import { formatCurrency } from "@/shared/lib/format"
import type { BookingScheduleValue } from "./BookingScheduleFields"

export function BookingSummaryPanel({
  cafe,
  vehicle,
  mode,
  planId,
  schedule,
}: {
  cafe?: Cafe
  vehicle?: Vehicle
  mode: BookingMode
  planId: string
  schedule: BookingScheduleValue
}) {
  const plan = findPlan(mode, planId)
  const subtotal = getPlanPrice(mode, planId)
  const vehicleFee = vehicle ? 50000 : 0
  const serviceFee = mode === "recurring" ? 0 : 15000
  const total = subtotal + vehicleFee + serviceFee

  return (
    <aside className="sticky top-24 rounded-[1.75rem] border border-white/70 bg-white/85 p-5 shadow-2xl shadow-slate-300/40 backdrop-blur-xl">
      <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-600">Tóm tắt đặt lịch</p>
          <h2 className="mt-1 text-xl font-black text-slate-950">{bookingModeCopy[mode].title}</h2>
        </div>
        <ReceiptText className="h-6 w-6 text-slate-400" />
      </div>

      <div className="space-y-4 py-5 text-sm font-bold text-slate-600">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-slate-400">Cơ sở</p>
          <p className="mt-1 text-slate-950">{cafe?.name ?? "Chưa chọn cơ sở"}</p>
          {cafe && <p className="mt-1 flex items-center gap-1 text-xs text-slate-500"><MapPin className="h-3.5 w-3.5 text-orange-600" /> {cafe.district}, {cafe.city}</p>}
        </div>
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-slate-400">Gói đang chọn</p>
          <p className="mt-1 text-slate-950">{plan?.label}</p>
          <p className="mt-1 text-xs text-slate-500">{schedule.date || "Chưa chọn ngày"} · {schedule.time} · {schedule.weekday}</p>
        </div>
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-slate-400">Xe thuê</p>
          <p className="mt-1 text-slate-950">{vehicle?.name ?? "Không chọn xe thuê"}</p>
        </div>
      </div>

      <div className="space-y-3 rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-600">
        <Line label="Phí lịch chơi" value={subtotal} />
        <Line label="Phí giữ xe thuê" value={vehicleFee} />
        <Line label="Phí dịch vụ" value={serviceFee} />
        <div className="border-t border-slate-200 pt-3">
          <Line label="Tổng tạm tính" value={total} strong />
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 p-3 text-xs font-bold leading-5 text-emerald-800">
        <ShieldCheck className="mr-1 inline h-4 w-4" /> Booking demo đang tách data. Khi gắn API, chỉ thay catalog, cafe detail và submit endpoint.
      </div>

      <Button className="mt-5 h-12 w-full rounded-2xl bg-slate-950 font-black text-white hover:bg-orange-600">
        Tiếp tục thanh toán <ArrowRight className="h-4 w-4" />
      </Button>
    </aside>
  )
}

function findPlan(mode: BookingMode, planId: string) {
  if (mode === "hourly") return bookingCatalog.hourlyPlans.find((item) => item.id === planId)
  if (mode === "slotPackage") return bookingCatalog.slotPackages.find((item) => item.id === planId)
  return bookingCatalog.recurringPlans.find((item) => item.id === planId)
}

function getPlanPrice(mode: BookingMode, planId: string) {
  const plan = findPlan(mode, planId)
  if (!plan) return 0
  if ("price" in plan) return plan.price
  if ("pricePerMonth" in plan) return plan.pricePerMonth
  return plan.pricePerHour * plan.durationHours
}

function Line({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={strong ? "text-slate-950" : undefined}>{label}</span>
      <span className={strong ? "text-xl font-black text-slate-950" : "text-slate-950"}>{formatCurrency(value)}</span>
    </div>
  )
}
