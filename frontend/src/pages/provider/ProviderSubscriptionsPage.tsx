import { useMemo, useRef, useState } from "react"
import { useSearchParams } from "react-router"
import { useQuery, useMutation } from "@tanstack/react-query"
import { toast } from "sonner"
import { AnimatePresence, motion, type Variants } from "framer-motion"
import {
  ArrowDownCircle,
  ArrowUpCircle,
  CheckCircle2,
  CreditCard,
  Loader2,
  MessageSquareText,
  Network,
  Sparkles,
  Store,
  Flame,
} from "lucide-react"

import { ProviderPageHeader } from "@/pages/provider/components/ProviderPrimitives"
import { ProviderShell } from "@/pages/provider/components/ProviderShell"
import { UsageQuotaBars } from "@/features/subscriptions/components/UsageQuotaBars"
import { PaymentRequestForm } from "@/features/subscriptions/components/PaymentRequestForm"
import { subscriptionApi } from "@/features/subscriptions/api/subscription.api"
import { cafeApi, cafeQueryKeys } from "@/features/cafes/api/cafe.api"
import { Badge } from "@/shared/ui/badge"
import { Button } from "@/shared/ui/button"
import type { PaymentRequestStatus, PlanName, SubscriptionPlan } from "@/features/subscriptions/types"

const PLAN_ORDER: Record<PlanName, number> = {
  TRIAL: 0,
  STARTER: 1,
  GROWTH: 2,
  PRO: 3,
}

const PLAN_COPY: Record<PlanName, { title: string; subtitle: string; accent: string; button: string; features: string[] }> = {
  TRIAL: {
    title: "Dùng thử",
    subtitle: "Bắt đầu miễn phí và kiểm tra luồng vận hành cơ bản.",
    accent: "bg-sky-300",
    button: "from-sky-400 to-cyan-400 hover:from-sky-500 hover:to-cyan-500",
    features: ["1 chi nhánh", "500 AI messages mỗi tháng", "1 kênh kết nối"],
  },
  STARTER: {
    title: "Starter",
    subtitle: "Phù hợp provider mới bắt đầu quản lý một điểm kinh doanh.",
    accent: "bg-emerald-300",
    button: "from-emerald-400 to-teal-400 hover:from-emerald-500 hover:to-teal-500",
    features: ["Quản lý chi nhánh cơ bản", "Quota AI vừa đủ", "Kết nối kênh bán hàng chính"],
  },
  GROWTH: {
    title: "Growth",
    subtitle: "Dành cho provider đang mở rộng quy mô và cần thêm tài nguyên.",
    accent: "bg-rose-300",
    button: "from-rose-400 to-orange-400 hover:from-rose-500 hover:to-orange-500",
    features: ["Nhiều chi nhánh hơn", "Tăng giới hạn AI messages", "Mở thêm kênh kết nối"],
  },
  PRO: {
    title: "Pro",
    subtitle: "Gói cao nhất cho đội vận hành cần giới hạn tài nguyên lớn.",
    accent: "bg-violet-300",
    button: "from-violet-400 to-fuchsia-400 hover:from-violet-500 hover:to-fuchsia-500",
    features: ["Giới hạn tài nguyên cao nhất", "Ưu tiên mở rộng vận hành", "Phù hợp mô hình nhiều điểm bán"],
  },
}

const PR_STATUS_LABELS: Record<PaymentRequestStatus, string> = {
  PENDING: "Chờ xác nhận",
  CONFIRMED: "Đã xác nhận",
  REJECTED: "Bị từ chối",
}

const PR_STATUS_COLORS: Record<PaymentRequestStatus, string> = {
  PENDING: "bg-amber-100 text-amber-800 border-amber-200",
  CONFIRMED: "bg-emerald-100 text-emerald-800 border-emerald-200",
  REJECTED: "bg-red-100 text-red-800 border-red-200",
}

const pricingContainer: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.08 },
  },
}

const pricingCard: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.28, ease: "easeOut" } },
}

function formatCurrency(value: number) {
  if (value === 0) return "Miễn phí"
  return new Intl.NumberFormat("vi-VN").format(value) + "đ"
}

function formatPaymentAmount(value: number | string) {
  const amount = Number(value)
  if (Number.isNaN(amount)) return `${value} đ`
  return `${amount.toLocaleString("vi-VN", { maximumFractionDigits: 0 })} đ`
}

function formatLimit(value: number, unit: string) {
  if (value === -1) return `Không giới hạn ${unit}`
  return `${value.toLocaleString("vi-VN")} ${unit}`
}

function formatDate(value?: string | null) {
  if (!value) return "Chưa có"
  return new Date(value).toLocaleDateString("vi-VN")
}

function daysUntil(value?: string | null) {
  if (!value) return null
  const diff = new Date(value).getTime() - Date.now()
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
}

export function ProviderSubscriptionsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const formRef = useRef<HTMLDivElement | null>(null)
  const [selectedPlanId, setSelectedPlanId] = useState(searchParams.get("plan_id") ?? "")

  const { data: subData, isLoading: isSubscriptionLoading } = useQuery({
    queryKey: ["provider-subscription"],
    queryFn: () => subscriptionApi.getSubscriptionStatus(),
  })

  const { data: plans = [], isLoading: isPlansLoading } = useQuery({
    queryKey: ["subscription-plans"],
    queryFn: () => subscriptionApi.listSubscriptionPlans(),
  })

  const { data: prData } = useQuery({
    queryKey: ["my-payment-requests"],
    queryFn: () => subscriptionApi.listMyPaymentRequests(),
  })

  const payMutation = useMutation({
    mutationFn: (requestId: string) =>
      subscriptionApi.getPayOSLink({ payment_request_id: requestId }),
    onSuccess: (res) => {
      if (res.data?.checkoutUrl) {
        toast.success("Tạo link thanh toán thành công! Đang chuyển hướng...")
        window.location.href = res.data.checkoutUrl
      } else {
        toast.error("Không tạo được liên kết thanh toán")
      }
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg ?? "Thanh toán lại thất bại. Vui lòng thử lại sau.")
    },
  })

  const { data: cafeData } = useQuery({
    queryKey: cafeQueryKeys.list({ limit: 1, scope: "managed" }),
    queryFn: () => cafeApi.listCafes({ limit: 1, scope: "managed" }),
  })

  const subscription = subData?.data ?? null
  // Gói dùng thử cấp tự động một lần khi duyệt hồ sơ. Đã tiêu rồi thì không
  // chọn lại được — backend cũng chặn, đây chỉ là để giao diện nói đúng sự thật.
  const trialUsed = Boolean(subData?.trial_used_at)
  const requests = prData?.data ?? []
  const hasPending = requests.some((request) => request.status === "PENDING")
  const branchCount = cafeData?.meta.total ?? 0
  const channelCount = subData?.channels_used ?? 0
  const currentPlanId = subscription?.planId
  const currentPlanName = subscription?.plan?.name
  const currentRank = currentPlanName ? PLAN_ORDER[currentPlanName] : -1
  const expiresInDays = daysUntil(subscription?.expiresAt)

  const sortedPlans = useMemo(
    () => [...plans].sort((a, b) => PLAN_ORDER[a.name] - PLAN_ORDER[b.name]),
    [plans],
  )

  const handleChoosePlan = (plan: SubscriptionPlan) => {
    setSelectedPlanId(plan.id)
    setSearchParams({ plan_id: plan.id })
    window.setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80)
  }

  const getActionLabel = (plan: SubscriptionPlan) => {
    if (plan.id === currentPlanId) return "Gói đang sử dụng"
    if (plan.isTrial && trialUsed) return "Đã dùng thử"
    const rank = PLAN_ORDER[plan.name]
    if (currentRank >= 0 && rank < currentRank) return "Downgrade gói"
    if (currentRank >= 0 && rank > currentRank) return "Nâng cấp gói"
    return plan.isTrial ? "Chọn dùng thử" : "Chọn gói"
  }

  const getActionIcon = (plan: SubscriptionPlan) => {
    if (plan.id === currentPlanId) return CheckCircle2
    if (plan.isTrial && trialUsed) return CheckCircle2
    const rank = PLAN_ORDER[plan.name]
    if (currentRank >= 0 && rank < currentRank) return ArrowDownCircle
    if (currentRank >= 0 && rank > currentRank) return ArrowUpCircle
    return CreditCard
  }

  return (
    <ProviderShell>
      <ProviderPageHeader title="Hội viên" description="Quản lý gói đăng ký và lịch sử thanh toán." />
      <div className="space-y-6">
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="rounded-xl border border-[#e5e2e1] bg-white p-5 shadow-sm"
        >
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-[#d92d20]">
                <Sparkles className="size-4" />
                Gói hiện tại
              </div>
              <h2 className="mt-2 text-2xl font-black text-[#1c1b1b]">
                {isSubscriptionLoading ? "Đang tải..." : currentPlanName ? `${currentPlanName} Plan` : "Chưa có gói đăng ký"}
              </h2>
              <p className="mt-1 text-sm font-semibold text-[#747878]">
                {expiresInDays !== null
                  ? `Còn ${expiresInDays} ngày, hết hạn ${formatDate(subscription?.expiresAt)}`
                  : "Chọn một gói bên dưới để gửi yêu cầu kích hoạt."}
              </p>
            </div>
            {subscription?.status && (
              <Badge className="w-fit border-0 bg-[#12b76a] px-3 py-1.5 text-white">
                Đang sử dụng
              </Badge>
            )}
          </div>
        </motion.section>

        <UsageQuotaBars
          subscription={subscription}
          branchCount={branchCount}
          channelCount={channelCount}
        />

        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.08 }}
          className="px-4 py-8 md:px-8"
        >
          <div className="mb-8 text-center">
            <h2 className="mt-2 text-2xl font-semibold tracking-normal text-[#26323d] md:text-3xl">
              Bảng giá gói đăng ký
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-sm font-medium text-[#71879a]">
              Chọn gói phù hợp với quy mô và nhu cầu vận hành của bạn.
            </p>
          </div>

          {isPlansLoading ? (
            <div className="flex min-h-64 items-center justify-center rounded-[28px] bg-[#f7f9fb]">
              <Loader2 className="size-6 animate-spin text-[#7891a5]" />
            </div>
          ) : (
            <motion.div
              variants={pricingContainer}
              initial="hidden"
              animate="show"
              className={`mx-auto grid grid-cols-1 sm:grid-cols-2 ${
                sortedPlans.length === 4
                  ? "lg:grid-cols-4"
                  : sortedPlans.length === 3
                    ? "lg:grid-cols-3"
                    : "lg:grid-cols-2"
              } gap-4 xl:gap-6 2xl:gap-8 w-full max-w-fit justify-center justify-items-center`}
            >
              {sortedPlans.map((plan) => {
                const copy = PLAN_COPY[plan.name]
                const isCurrent = plan.id === currentPlanId
                const isSelected = plan.id === selectedPlanId
                // Gói dùng thử đã tiêu thì khoá luôn, không cho mở form thanh toán.
                const isLocked = plan.isTrial && trialUsed && !isCurrent
                const isDisabled = isCurrent || isLocked
                const ActionIcon = getActionIcon(plan)

                return (
                  <motion.article
                    key={plan.id}
                    role={isDisabled ? undefined : "button"}
                    tabIndex={isDisabled ? undefined : 0}
                    variants={pricingCard}
                    whileHover={{ y: -5 }}
                    whileTap={{ y: -1 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                    onClick={() => {
                      if (!isDisabled) handleChoosePlan(plan)
                    }}
                    onKeyDown={(event) => {
                      if (isDisabled) return
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault()
                        handleChoosePlan(plan)
                      }
                    }}
                    className={`relative flex h-[492px] w-full max-w-[280px] transform-gpu flex-col rounded-[32px] border border-white/80 bg-[#f6fbff]/95 px-4 py-6 text-center shadow-[0_18px_38px_rgba(91,124,153,0.18)] outline-none will-change-transform focus-visible:ring-2 focus-visible:ring-[#8ea6ff]/70 sm:max-w-[260px] md:max-w-[270px] lg:max-w-[225px] xl:max-w-[250px] 2xl:h-[520px] 2xl:max-w-[280px] 2xl:px-7 2xl:py-7 ${
                      isCurrent ? "cursor-default" : "cursor-pointer"
                    } ${
                      isSelected ? "ring-2 ring-[#8ea6ff]/70" : ""
                    }`}
                  >
                    {plan.name === "GROWTH" && (
                      <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="absolute left-4 top-4 flex items-center gap-1 rounded-full bg-gradient-to-r from-orange-500 to-red-500 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-white shadow-md animate-pulse z-10"
                      >
                        <Flame className="size-3 fill-white" />
                        Nổi bật
                      </motion.div>
                    )}

                    {isCurrent && (
                      <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="absolute right-4 top-4 rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase tracking-wider text-[#12b76a] shadow-sm z-10"
                      >
                        Đang sử dụng
                      </motion.div>
                    )}

                    <div className="mx-auto mb-4 mt-2 h-[52px] w-full">
                      <h3 className="text-base font-semibold text-[#425466]">{copy.title}</h3>
                      <div className={`mx-auto mt-3 h-px w-28 ${copy.accent}`} />
                    </div>

                    <div className="mb-1 flex h-[56px] items-end justify-center gap-1 text-[#182533]">
                      <span className="text-4xl font-light tracking-normal">{formatCurrency(plan.pricePerMonth)}</span>
                    </div>
                    <p className="h-5 text-xs font-semibold text-[#71879a]">
                      {plan.isTrial ? "Dùng thử miễn phí" : "VND / tháng"}
                    </p>

                    <p className="mx-auto mt-5 h-[46px] max-w-[210px] text-[11px] font-medium leading-relaxed text-[#8ba0b1]">
                      {copy.subtitle}
                    </p>

                    <div className="mt-4 h-[74px] space-y-2 text-left">
                      <div className="flex items-center gap-2 text-[11px] font-semibold text-[#607587]">
                        <Store className="size-3.5 text-[#89a0b3]" />
                        {formatLimit(plan.branchLimit, "chi nhánh")}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] font-semibold text-[#607587]">
                        <MessageSquareText className="size-3.5 text-[#89a0b3]" />
                        {formatLimit(plan.aiQuotaPerMonth, "AI messages/tháng")}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] font-semibold text-[#607587]">
                        <Network className="size-3.5 text-[#89a0b3]" />
                        {formatLimit(plan.channelLimit, "kênh kết nối")}
                      </div>
                    </div>

                    <div className="mt-4 h-[78px] space-y-2">
                      {copy.features.map((feature) => (
                        <div key={feature} className="flex items-center gap-2 text-left text-[11px] font-medium text-[#71879a]">
                          <CheckCircle2 className="size-3 shrink-0 text-emerald-400" />
                          <span className="line-clamp-1">{feature}</span>
                        </div>
                      ))}
                    </div>

                    <Button
                      type="button"
                      disabled={isDisabled}
                      onClick={(event) => {
                        event.stopPropagation()
                        if (isDisabled) return
                        handleChoosePlan(plan)
                      }}
                      className={`mt-auto h-9 rounded-full border-0 bg-gradient-to-r px-5 text-xs font-black text-white shadow-[0_10px_24px_rgba(137,120,255,0.28)] transition ${
                        isDisabled ? "from-slate-200 to-slate-300 text-slate-500 shadow-none" : copy.button
                      }`}
                    >
                      <ActionIcon className="size-3.5" />
                      {getActionLabel(plan)}
                    </Button>
                  </motion.article>
                )
              })}
            </motion.div>
          )}
        </motion.section>

        <AnimatePresence>
          {selectedPlanId && (
            <motion.section
              ref={formRef}
              initial={{ opacity: 0, y: 18, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, y: 12, height: 0 }}
              transition={{ duration: 0.28 }}
              className="scroll-mt-6 overflow-hidden"
            >
              <PaymentRequestForm
                hasPendingRequest={hasPending}
                selectedPlanId={selectedPlanId}
                onSelectedPlanChange={(planId) => {
                  setSelectedPlanId(planId)
                  if (planId) setSearchParams({ plan_id: planId })
                }}
              />
            </motion.section>
          )}
        </AnimatePresence>

        {requests.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-[#e5e2e1] bg-white">
            <div className="border-b border-[#e5e2e1] bg-[#fcf8f8] px-5 py-4">
              <h3 className="text-base font-bold text-[#1c1b1b]">Lịch sử yêu cầu thanh toán</h3>
            </div>
            <table className="w-full text-sm">
              <thead className="border-b border-[#e5e2e1] bg-[#fcf8f8]/60 text-xs font-bold uppercase tracking-wider text-[#747878]">
                <tr>
                  <th className="px-4 py-3 text-left">Gói</th>
                  <th className="px-4 py-3 text-left">Số tiền</th>
                  <th className="px-4 py-3 text-left">Ngày CK</th>
                  <th className="px-4 py-3 text-left">Trạng thái</th>
                  <th className="px-4 py-3 text-left">Ghi chú Admin</th>
                  <th className="px-4 py-3 text-left">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e5e2e1]">
                {requests.map((request) => {
                  const plan = plans.find((p) => p.id === request.planId)
                  const planName = plan ? plan.name : "Gói không rõ"

                  return (
                    <tr key={request.id} className="transition-colors hover:bg-[#fcf8f8]">
                      <td className="px-4 py-3 font-bold text-[#1c1b1b]">{planName}</td>
                      <td className="px-4 py-3 font-bold text-[#1c1b1b]">
                        {formatPaymentAmount(request.transferAmount)}
                      </td>
                      <td className="px-4 py-3 text-xs font-semibold text-[#5d5f5f]">
                        {new Date(request.transferDate).toLocaleDateString("vi-VN")}
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={`border text-[11px] font-semibold ${PR_STATUS_COLORS[request.status]}`}>
                          {PR_STATUS_LABELS[request.status]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs font-semibold text-[#5d5f5f]">{request.adminNotes ?? "-"}</td>
                      <td className="px-4 py-3">
                        {(request.status === "REJECTED" || (request.status === "PENDING" && !request.adminNotes?.includes("Đã thanh toán"))) && (
                          <Button
                            disabled={payMutation.isPending}
                            onClick={() => payMutation.mutate(request.id)}
                            className="h-7 text-[10px] px-2.5 rounded-full font-extrabold bg-[#7891a5] hover:bg-[#607587] text-white transition-all shadow-sm flex items-center gap-1 w-fit"
                          >
                            {payMutation.isPending && payMutation.variables === request.id ? (
                              <Loader2 className="size-3 animate-spin" />
                            ) : null}
                            {request.status === "PENDING" ? "Thanh toán" : "Thanh toán lại"}
                          </Button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </ProviderShell>
  )
}
