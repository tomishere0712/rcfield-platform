import { Link } from "react-router"
import { useQuery } from "@tanstack/react-query"
import { ArrowRight, Bot, Building2, MessageSquareText } from "lucide-react"
import { motion, useReducedMotion } from "framer-motion"
import { routePaths } from "@/app/router/route-paths"
import { subscriptionApi } from "@/features/subscriptions/api/subscription.api"
import type { SubscriptionPlan } from "@/features/subscriptions/types"
import { fadeUpItem, landingViewport, staggerContainer } from "./landing-motion"
import { SectionIntro } from "./SectionIntro"

export function HomePartnerTeaser() {
  const prefersReducedMotion = useReducedMotion()
  const { data: plans = [], isLoading } = useQuery({
    queryKey: ["landing", "partner-plans"],
    queryFn: subscriptionApi.listSubscriptionPlans,
    staleTime: 5 * 60 * 1000,
  })

  const visiblePlans = [...plans]
    .sort((left, right) => left.pricePerMonth - right.pricePerMonth)
    .slice(0, 3)

  return (
    <section className="bg-[#f8f6f2] py-22 md:py-26">
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        <SectionIntro
          eyebrow="Dành cho chủ sân"
          title="Một phần năng lực từ trang đối tác"
          description="Khối này chỉ dùng dữ liệu gói thật từ hệ thống để chủ sân xem nhanh quy mô vận hành và khả năng AI/chatbot đang có trên trang đối tác."
          action={
            <Link
              to={routePaths.partnerLanding}
              className="inline-flex items-center gap-2 text-sm font-black text-orange-600 transition-colors hover:text-orange-700"
            >
              Xem trang đối tác
              <ArrowRight className="h-4 w-4" />
            </Link>
          }
        />

        <motion.div
          variants={staggerContainer}
          initial={prefersReducedMotion ? false : "hidden"}
          whileInView={prefersReducedMotion ? undefined : "visible"}
          viewport={landingViewport}
          className="mt-10 grid gap-5 lg:grid-cols-3"
        >
          {isLoading
            ? Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  className="h-[244px] animate-pulse rounded-[28px] border border-slate-200 bg-white shadow-[var(--landing-shadow-soft)]"
                />
              ))
            : visiblePlans.map((plan) => (
                <motion.article
                  key={plan.id}
                  variants={fadeUpItem}
                  className="rounded-[28px] border border-slate-200 bg-white p-7 shadow-[var(--landing-shadow-soft)]"
                >
                  <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-orange-600">
                    {plan.aiQuotaPerMonth > 0 ? <Bot className="h-5 w-5" /> : <Building2 className="h-5 w-5" />}
                  </div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-orange-600">{plan.name}</p>
                  <h3 className="mt-3 text-xl font-black tracking-tight text-slate-950">
                    {formatPlanPrice(plan)}
                  </h3>
                  <div className="mt-4 space-y-2 text-sm text-slate-600">
                    <p className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-slate-400" />
                      {formatBranchLimit(plan.branchLimit)}
                    </p>
                    <p className="flex items-center gap-2">
                      <MessageSquareText className="h-4 w-4 text-slate-400" />
                      {plan.aiQuotaPerMonth.toLocaleString("vi-VN")} AI messages / tháng
                    </p>
                    <p className="flex items-center gap-2">
                      <ArrowRight className="h-4 w-4 text-slate-400" />
                      {formatChannelLimit(plan.channelLimit)}
                    </p>
                  </div>
                </motion.article>
              ))}
        </motion.div>
      </div>
    </section>
  )
}

function formatPlanPrice(plan: SubscriptionPlan) {
  if (plan.isTrial) return "Dùng thử miễn phí"
  return `${Math.round(plan.pricePerMonth).toLocaleString("vi-VN")}đ / tháng`
}

function formatBranchLimit(limit: number) {
  if (limit <= 0) return "Không giới hạn chi nhánh"
  return `${limit} chi nhánh`
}

function formatChannelLimit(limit: number) {
  if (limit <= 0) return "Không giới hạn kênh"
  return `${limit} kênh Facebook / Zalo`
}
