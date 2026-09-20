import { useQuery } from "@tanstack/react-query"
import { ChevronLeft, ChevronRight, Clock, Sparkles, Ticket } from "lucide-react"
import { useState } from "react"
import { promotionApi } from "@/features/promotions/api/promotion.api"
import type { ActivePromotion } from "@/features/promotions/api/promotion.api"
import { formatCurrency } from "@/shared/lib/format"

function formatDiscount(p: ActivePromotion): string {
  if (p.discount_type === "PERCENT") {
    const suffix = p.max_discount_amount ? ` (tối đa ${formatCurrency(p.max_discount_amount)})` : ""
    return `Giảm ${p.discount_value}%${suffix}`
  }
  return `Giảm ${formatCurrency(p.discount_value)}`
}

function formatExpiry(expiresAt: string | null): string | null {
  if (!expiresAt) return null
  const d = new Date(expiresAt)
  const now = new Date()
  const diffMs = d.getTime() - now.getTime()
  const diffDays = Math.ceil(diffMs / 86_400_000)
  if (diffDays <= 0) return null
  if (diffDays === 1) return "Hết hạn hôm nay"
  if (diffDays <= 7) return `Còn ${diffDays} ngày`
  return `HSD: ${d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })}`
}

function PromoSlide({ promo }: { promo: ActivePromotion }) {
  const expiry = formatExpiry(promo.expires_at)
  const modeLabel =
    promo.applicable_to === "RENTAL"
      ? "Thuê xe"
      : promo.applicable_to === "BYOC"
        ? "Xe cá nhân"
        : null

  return (
    <div className="flex items-center gap-3 min-w-0 flex-1">
      {/* Discount badge — white card, nổi bật nhất */}
      <div className="shrink-0 flex flex-col items-center justify-center bg-white rounded-lg px-3 py-2 shadow-sm min-w-[90px] text-center">
        <span className="text-orange-600 font-black text-lg leading-tight">{formatDiscount(promo)}</span>
        {modeLabel && (
          <span className="text-orange-400 text-[10px] font-semibold uppercase tracking-wide mt-0.5">{modeLabel}</span>
        )}
      </div>

      {/* Code + meta */}
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Sparkles className="h-3.5 w-3.5 text-yellow-200 shrink-0" />
          <span className="font-mono text-base font-black tracking-widest text-white">
            {promo.code}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {promo.description && (
            <span className="text-xs text-orange-100 truncate">{promo.description}</span>
          )}
          {expiry && (
            <span className="flex items-center gap-1 text-[11px] text-yellow-200 shrink-0">
              <Clock className="h-3 w-3" />
              {expiry}
            </span>
          )}
          {promo.min_order_amount && (
            <span className="text-[11px] text-orange-200 shrink-0">
              · Đơn từ {formatCurrency(promo.min_order_amount)}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

export function CafePromoBanner({ cafeId }: { cafeId: string }) {
  const [index, setIndex] = useState(0)

  const { data: promos = [] } = useQuery({
    queryKey: ["cafe-promos-active", cafeId],
    queryFn: () => promotionApi.listActive(cafeId),
    staleTime: 2 * 60 * 1000,
  })

  if (!promos.length) return null

  const current = promos[index]
  const hasMultiple = promos.length > 1

  return (
    <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-yellow-500 via-orange-500 to-red-500 px-4 py-3.5 shadow-lg shadow-orange-300">
      {/* Decorative circles */}
      <div className="pointer-events-none absolute -right-4 -top-6 h-20 w-20 rounded-full bg-white/10" />
      <div className="pointer-events-none absolute right-10 -bottom-6 h-14 w-14 rounded-full bg-white/10" />
      <div className="pointer-events-none absolute -left-4 -bottom-4 h-16 w-16 rounded-full bg-white/10" />

      {/* Ticket icon deco */}
      <Ticket className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 h-16 w-16 text-white/5" />

      <div className="relative flex items-center gap-3">
        <PromoSlide promo={current} />

        {hasMultiple && (
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <span className="text-[11px] text-orange-100">{index + 1}/{promos.length}</span>
            <button
              onClick={() => setIndex((i) => (i - 1 + promos.length) % promos.length)}
              className="rounded p-0.5 text-white hover:bg-white/20 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setIndex((i) => (i + 1) % promos.length)}
              className="rounded p-0.5 text-white hover:bg-white/20 transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
