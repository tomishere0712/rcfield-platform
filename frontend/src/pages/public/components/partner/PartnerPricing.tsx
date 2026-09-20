import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router"
import { Check, MessageCircle } from "lucide-react"
import { subscriptionApi } from "@/features/subscriptions/api/subscription.api"
import type { PlanName } from "@/features/subscriptions/types"
import { routePaths } from "@/app/router/route-paths"
import { Button } from "@/shared/ui/button"
import { PLAN_DISPLAY, ZALO_OA_URL, formatPrice } from "./partner-data"

const PLAN_ORDER: PlanName[] = ["TRIAL", "STARTER", "GROWTH", "PRO"]

function PricingSkeletons() {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="h-[320px] animate-pulse rounded-[8px] bg-slate-100"
        />
      ))}
    </div>
  )
}

function ContactBanner() {
  return (
    <div className="rounded-[8px] border border-amber-200 bg-amber-50 p-10 text-center">
      <p className="mb-2 text-lg font-black text-slate-900">Không thể tải bảng giá hiện tại</p>
      <p className="mb-6 text-sm text-slate-600">
        Vui lòng liên hệ để được tư vấn và nhận báo giá trực tiếp từ đội ngũ RCField.
      </p>
      <Button asChild className="h-12 rounded-[8px] bg-[#ff6b00] px-6 font-black text-white hover:bg-orange-600 min-h-[44px]">
        <a href={ZALO_OA_URL} target="_blank" rel="noopener noreferrer">
          <MessageCircle className="mr-2 size-4" />
          Liên hệ qua Zalo
        </a>
      </Button>
    </div>
  )
}

export function PartnerPricing() {
  const { data: plans, isLoading, isError } = useQuery({
    queryKey: ["subscription-plans"],
    queryFn: subscriptionApi.listSubscriptionPlans,
    staleTime: 5 * 60 * 1000,
  })

  const sortedPlans = plans
    ? PLAN_ORDER.map((name) => plans.find((p) => p.name === name)).filter(Boolean)
    : []

  return (
    <section className="bg-slate-50 py-24 border-t border-slate-100">
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        {/* Header */}
        <div className="mb-16 text-center">
          <p className="mb-3 text-xs font-extrabold uppercase tracking-[0.2em] text-[#ff6b00]">
            Bảng giá
          </p>
          <h2 className="text-3xl font-black text-slate-900 md:text-4xl">
            Gói phù hợp cho mọi quy mô sân
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base font-medium text-slate-500">
            Bắt đầu miễn phí 30 ngày — không cần thẻ tín dụng, không cam kết dài hạn.
          </p>
        </div>

        {/* Content */}
        {isLoading ? (
          <PricingSkeletons />
        ) : isError || sortedPlans.length === 0 ? (
          <ContactBanner />
        ) : (
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4 items-stretch pt-4">
            {sortedPlans.map((plan) => {
              if (!plan) return null
              const meta = PLAN_DISPLAY[plan.name as PlanName]
              const { price, period } = formatPrice(plan)
              const getPlanCleanFeatures = (name: PlanName): string[] => {
                switch (name) {
                  case "TRIAL":
                    return ["1 chi nhánh", "500 tin nhắn AI/tháng"]
                  case "STARTER":
                    return ["1 chi nhánh", "1.000 tin nhắn AI/tháng"]
                  case "GROWTH":
                    return ["3 chi nhánh", "5.000 tin nhắn AI/tháng", "Báo cáo doanh thu"]
                  case "PRO":
                    return ["Không giới hạn chi nhánh", "Ưu tiên hỗ trợ 24/7"]
                  default:
                    return []
                }
              }
              const features = getPlanCleanFeatures(plan.name as PlanName)
              const isPro = plan.name === "PRO"
              const isHighlighted = meta.isHighlighted

              return (
                <div
                  key={plan.id}
                  className={`relative flex flex-col rounded-[8px] p-8 transition-all duration-300 ${
                    isHighlighted
                      ? "bg-[#ff6b00] text-white shadow-xl shadow-orange-500/30 scale-105 z-10 border-0"
                      : "border border-slate-100 bg-white shadow-sm hover:border-[#ff6b00]/30 hover:shadow-md"
                  }`}
                >
                  {/* Highlight popular badge */}
                  {isHighlighted && meta.badge && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-white px-4 py-1 text-2xs font-extrabold uppercase tracking-wider text-[#ff6b00] shadow-sm">
                      {meta.badge}
                    </div>
                  )}

                  {/* Plan Name */}
                  <h3
                    className={`text-sm font-extrabold uppercase tracking-widest ${
                      isHighlighted ? "text-white/80" : "text-slate-500"
                    }`}
                  >
                    {meta.label}
                  </h3>

                  {/* Plan Price */}
                  <div className="mt-4 mb-8">
                    <span className="text-3xl font-black">{price}</span>
                    <span className={`ml-1 text-sm ${isHighlighted ? "text-white/85" : "text-slate-500"}`}>
                      {period}
                    </span>
                    {plan.isTrial && (
                      <p className={`mt-1 text-[11px] font-semibold ${isHighlighted ? "text-white/75" : "text-slate-400"}`}>
                        Không cần thẻ tín dụng
                      </p>
                    )}
                  </div>

                  {/* Features List */}
                  <ul className="flex-1 space-y-4 mb-8">
                    {features.map((f) => (
                      <li key={f} className="flex items-start gap-3 text-sm">
                        <Check
                          className={`size-4 shrink-0 mt-0.5 ${
                            isHighlighted ? "text-white" : "text-[#ff6b00]"
                          }`}
                        />
                        <span className={isHighlighted ? "text-white/90 font-medium" : "text-slate-600 font-medium"}>
                          {f}
                        </span>
                      </li>
                    ))}
                  </ul>

                   {/* Action CTA Button */}
                   {isPro ? (
                     <a
                       href={ZALO_OA_URL}
                       target="_blank"
                       rel="noopener noreferrer"
                       className={`flex min-h-[44px] items-center justify-center rounded-[8px] px-4 py-3 text-sm font-extrabold transition-all duration-200 ${
                         isHighlighted
                           ? "bg-white text-[#ff6b00] hover:bg-orange-50"
                           : "border border-[#ff6b00] text-[#ff6b00] hover:bg-[#ff6b00] hover:text-white bg-transparent"
                       }`}
                     >
                       {meta.cta}
                     </a>
                   ) : (
                     <Link
                       to={routePaths.providerRegister}
                       className={`flex min-h-[44px] items-center justify-center rounded-[8px] px-4 py-3 text-sm font-extrabold transition-all duration-200 ${
                         isHighlighted
                           ? "bg-white text-[#ff6b00] hover:bg-orange-50"
                           : "border border-[#ff6b00] text-[#ff6b00] hover:bg-[#ff6b00] hover:text-white bg-transparent"
                       }`}
                     >
                       {meta.cta}
                     </Link>
                   )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
