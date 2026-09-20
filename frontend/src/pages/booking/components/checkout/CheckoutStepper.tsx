import { Check, CreditCard, ShoppingBag, Users, CalendarClock, Layers } from "lucide-react"
import type { CheckoutStep } from "@/features/customer-booking/data/customer-booking-demo"
import { cn } from "@/shared/lib/utils"

const ALL_STEP_DEFS: Array<{ id: CheckoutStep; label: string; icon: typeof CalendarClock }> = [
  { id: "track", label: "Chọn sân", icon: Layers },
  { id: "schedule", label: "Lịch chơi", icon: CalendarClock },
  { id: "participants", label: "Người & xe", icon: Users },
  { id: "fnb", label: "Đồ ăn & Thức uống", icon: ShoppingBag },
  { id: "payment", label: "Thanh toán", icon: CreditCard },
]

export function CheckoutStepper({
  currentStep,
  visibleSteps,
}: {
  currentStep: CheckoutStep
  visibleSteps?: CheckoutStep[]
}) {
  const steps = visibleSteps
    ? ALL_STEP_DEFS.filter((s) => visibleSteps.includes(s.id))
    : ALL_STEP_DEFS

  const currentIndex = steps.findIndex((step) => step.id === currentStep)

  return (
    <div className="w-full px-4 py-4">
      <div className="flex items-start justify-center">
        {steps.map((step, index) => {
          const Icon = step.icon
          const isActive = step.id === currentStep
          const isDone = index < currentIndex
          const isLast = index === steps.length - 1

          return (
            <div key={step.id} className={cn("flex items-start", !isLast && "flex-1 min-w-0")}>
              {/* Step circle + label */}
              <div className="flex flex-col items-center gap-2 shrink-0">
                <div
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all duration-200",
                    isDone && "border-orange-500 bg-orange-500 text-white shadow-sm",
                    isActive && "border-orange-500 bg-white text-orange-500 shadow-[0_0_0_4px_rgba(249,115,22,0.12)]",
                    !isDone && !isActive && "border-slate-200 bg-white text-slate-300",
                  )}
                >
                  {isDone ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </div>
                <div
                  className={cn(
                    "text-center w-20",
                    step.id === "fnb" && "w-28",
                  )}
                >
                  <p
                    className={cn(
                      "text-xs font-semibold leading-tight",
                      step.id === "fnb" && "whitespace-nowrap text-[11px]",
                      isActive && "text-slate-900",
                      isDone && "text-orange-600",
                      !isDone && !isActive && "text-slate-400",
                    )}
                  >
                    {step.label}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Bước {index + 1}</p>
                </div>
              </div>

              {/* Connector line */}
              {!isLast && (
                <div className="relative flex-1 mx-2 mt-[19px]">
                  <div className="h-0.5 w-full rounded-full bg-slate-200" />
                  {isDone && (
                    <div className="absolute inset-0 h-0.5 rounded-full bg-orange-500 transition-all duration-300" />
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
