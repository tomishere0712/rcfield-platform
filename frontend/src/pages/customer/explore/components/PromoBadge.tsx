import type { ActivePromotion } from "@/features/promotions/api/promotion.api"

interface PromoBadgeProps {
  promotion: ActivePromotion
}

export function PromoBadge({ promotion }: PromoBadgeProps) {
  const discountLabel = formatDiscountLabel(promotion)
  const isEpic = promotion.discount_type === "PERCENT" && Number(promotion.discount_value) >= 40

  if (isEpic) {
    return (
      <div className="inline-flex items-center gap-1 rounded bg-orange-500 px-2 py-1 text-[11px] font-bold text-white shadow-sm">
        <span>{discountLabel}</span>
        <span className="rounded bg-white/20 px-1 py-0.5 text-[9px] font-bold">GIẢM SỐC</span>
      </div>
    )
  }

  if (Number(promotion.discount_value) > 0) {
    return (
      <div className="inline-flex flex-col items-end">
        <span className="rounded bg-green-50 px-2 py-0.5 text-[10px] font-bold text-green-600">
          🎫 Special for you!
        </span>
        <span className="mt-0.5 text-xs font-bold text-orange-600">
          {discountLabel}
        </span>
      </div>
    )
  }

  return null
}

function formatDiscountLabel(promotion: ActivePromotion): string {
  if (promotion.discount_type === "PERCENT") {
    return `${Number(promotion.discount_value)}% OFF`
  }
  // FIXED amount
  const amount = Number(promotion.discount_value)
  if (amount >= 1_000_000) {
    return `Giảm ${(amount / 1_000_000).toFixed(1)}tr`
  }
  if (amount >= 1_000) {
    return `Giảm ${Math.round(amount / 1_000)}k`
  }
  return `Giảm ${amount}đ`
}
