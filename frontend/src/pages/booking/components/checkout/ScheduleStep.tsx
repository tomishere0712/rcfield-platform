import { CalendarDays, Clock, PackageCheck, Repeat2 } from "lucide-react"
import type { BookingMode } from "@/features/booking/data/booking-options"
import { bookingCatalog } from "@/features/booking/data/booking-options"
import { Badge } from "@/shared/ui/badge"
import { Button } from "@/shared/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card"
import { Input } from "@/shared/ui/input"
import { cn } from "@/shared/lib/utils"
import { formatCurrency } from "@/shared/lib/format"

type ScheduleStepProps = {
  mode: BookingMode
  onModeChange: (mode: BookingMode) => void
  planId: string
  onPlanChange: (planId: string) => void
  date: string
  onDateChange: (date: string) => void
  time: string
  onTimeChange: (time: string) => void
}

const modeOptions: Array<{ value: BookingMode; label: string; icon: typeof Clock }> = [
  { value: "hourly", label: "Theo giờ", icon: Clock },
  { value: "slotPackage", label: "Gói slot", icon: PackageCheck },
  { value: "recurring", label: "Lịch cố định", icon: Repeat2 },
]

export function ScheduleStep({
  mode,
  onModeChange,
  planId,
  onPlanChange,
  date,
  onDateChange,
  time,
  onTimeChange,
}: ScheduleStepProps) {
  const plans = getPlans(mode)

  return (
    <Card className="rounded-xl shadow-sm">
      <CardHeader>
        <CardTitle>Chọn lịch chơi</CardTitle>
        <p className="text-sm text-muted-foreground">Một booking có thể là SINGLE, PACKAGE hoặc SUBSCRIPTION theo thiết kế Phase 1.</p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-2 md:grid-cols-3">
          {modeOptions.map((item) => {
            const Icon = item.icon
            const isActive = mode === item.value
            return (
              <Button
                key={item.value}
                type="button"
                variant={isActive ? "default" : "outline"}
                className="h-auto justify-start gap-3 p-4"
                onClick={() => {
                  onModeChange(item.value)
                  onPlanChange(getPlans(item.value)[0]?.id ?? "")
                }}
              >
                <Icon className="h-4 w-4" />
                <span className="text-left">
                  <span className="block font-medium">{item.label}</span>
                  <span className={cn("block text-xs", isActive ? "text-primary-foreground/80" : "text-muted-foreground")}>
                    {getModeDescription(item.value)}
                  </span>
                </span>
              </Button>
            )
          })}
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {plans.map((plan) => {
            const isActive = plan.id === planId
            const price = getPlanPrice(plan)
            return (
              <button
                key={plan.id}
                type="button"
                onClick={() => onPlanChange(plan.id)}
                className={cn(
                  "rounded-xl border bg-background p-4 text-left transition hover:border-primary/40",
                  isActive && "border-primary bg-primary/5 ring-2 ring-primary/10",
                )}
              >
                <p className="font-semibold text-foreground">{plan.label}</p>
                <p className="mt-1 min-h-10 text-sm leading-5 text-muted-foreground">{plan.note}</p>
                <div className="mt-3 flex items-end justify-between gap-2">
                  <p className="text-lg font-semibold">{formatCurrency(price)}</p>
                  <Badge variant={isActive ? "default" : "secondary"}>{getPlanMeta(plan)}</Badge>
                </div>
              </button>
            )
          })}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-2">
            <span className="flex items-center gap-2 text-sm font-medium">
              <CalendarDays className="h-4 w-4 text-muted-foreground" /> Ngày chơi
            </span>
            <Input type="date" value={date} onChange={(event) => onDateChange(event.target.value)} />
          </label>
          <div className="space-y-2">
            <span className="flex items-center gap-2 text-sm font-medium">
              <Clock className="h-4 w-4 text-muted-foreground" /> Khung giờ
            </span>
            <div className="grid grid-cols-3 gap-2">
              {bookingCatalog.timeOptions.map((item) => (
                <Button
                  key={item}
                  type="button"
                  variant={time === item ? "default" : "outline"}
                  onClick={() => onTimeChange(item)}
                >
                  {item}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function getPlans(mode: BookingMode) {
  if (mode === "slotPackage") return bookingCatalog.slotPackages
  if (mode === "recurring") return bookingCatalog.recurringPlans
  return bookingCatalog.hourlyPlans
}

function getModeDescription(mode: BookingMode) {
  if (mode === "slotPackage") return "Mua nhiều slot"
  if (mode === "recurring") return "Giữ lịch hằng tuần"
  return "Chọn giờ linh hoạt"
}

function getPlanPrice(plan: ReturnType<typeof getPlans>[number]) {
  if ("price" in plan) return plan.price
  if ("pricePerMonth" in plan) return plan.pricePerMonth
  return plan.pricePerHour * plan.durationHours
}

function getPlanMeta(plan: ReturnType<typeof getPlans>[number]) {
  if ("slots" in plan) return `${plan.slots} slot`
  if ("sessionsPerMonth" in plan) return `${plan.sessionsPerMonth} buổi/tháng`
  return `${plan.durationHours} giờ`
}
