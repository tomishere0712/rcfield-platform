import { Bookmark, Heart, MapPin, Star } from "lucide-react"
import { Link } from "react-router"
import { motion } from "framer-motion"
import type { Cafe } from "@/shared/data/explore-data"
import { buildCafeDetailPath } from "@/pages/customer/cafe-detail/cafe-detail-utils"
import { formatCurrency } from "@/shared/lib/format"
import { formatDistance } from "../explore-utils"
import { PromoBadge } from "./PromoBadge"
import { cn } from "@/shared/lib/utils"

interface CafeGridCardProps {
  cafe: Cafe
  isFavorite: boolean
  onToggleFavorite: (cafeId: string) => void
  distanceKm?: number
  onQuickView: (cafe: Cafe) => void
  onBookNow: (cafeId: string) => void
  onHover: (cafeId: string | null) => void
}

export function CafeGridCard({
  cafe,
  isFavorite,
  onToggleFavorite,
  distanceKm,
  onQuickView,
  onBookNow,
  onHover,
}: CafeGridCardProps) {
  const slotPrice = cafe.slotFeeRate ?? 0
  const bestPromo = cafe.promotions?.[0] ?? null
  const hasPromo = !!bestPromo

  const discountedPrice = hasPromo ? computeDiscountedPrice(slotPrice, bestPromo) : null
  const ratingLabel = getRatingLabel(cafe.rating)
  const starCount = Math.round(cafe.rating)

  return (
    <motion.div
      className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-sm h-full will-change-transform"
      onMouseEnter={() => onHover(cafe.id)}
      onMouseLeave={() => onHover(null)}
      whileHover={{
        y: -4,
        boxShadow: "0 12px 40px -8px rgba(0,0,0,0.12), 0 4px 16px -4px rgba(0,0,0,0.08)",
        transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] },
      }}
    >
      {/* Top Image Section */}
      <Link
        to={buildCafeDetailPath(cafe)}
        className="relative aspect-[16/10] w-full overflow-hidden bg-slate-100 shrink-0"
      >
        <img
          src={cafe.image}
          alt={cafe.name}
          className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.05]"
        />

        {/* Gradient overlay on hover */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

        {/* Bookmark / Favorite */}
        <motion.button
          type="button"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onToggleFavorite(cafe.id)
          }}
          whileTap={{ scale: 0.85 }}
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 shadow-md backdrop-blur-sm transition-all hover:bg-white"
        >
          {isFavorite ? (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 500, damping: 15 }}
            >
              <Heart className="h-4 w-4 fill-red-500 text-red-500" />
            </motion.div>
          ) : (
            <Bookmark className="h-4 w-4 text-slate-500" />
          )}
        </motion.button>

        {/* Promo overlay badge */}
        {hasPromo && bestPromo.discount_type === "PERCENT" && Number(bestPromo.discount_value) >= 40 && (
          <motion.div
            initial={{ scale: 0, rotate: -12 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 20 }}
            className="absolute bottom-3 right-3 rounded-lg bg-orange-500 px-2.5 py-1 text-[10px] font-bold text-white shadow-md"
          >
            7.7
          </motion.div>
        )}
      </Link>

      {/* Info Section */}
      <div className="flex flex-1 flex-col justify-between p-4 space-y-3">
        <div className="space-y-1.5">
          {/* Title and Rating row */}
          <div className="flex items-start justify-between gap-2">
            <Link
              to={buildCafeDetailPath(cafe)}
              className="line-clamp-1 text-sm font-bold text-slate-900 transition-colors hover:text-orange-600"
            >
              {cafe.name}
            </Link>
            {cafe.rating > 0 && (
              <div className="flex shrink-0 items-center gap-1">
                <span className="rounded-lg bg-orange-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {cafe.rating.toFixed(1)}/5
                </span>
              </div>
            )}
          </div>

          {/* Rating description + Reviews count */}
          {cafe.rating > 0 && (
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <span className="font-semibold text-orange-600">{ratingLabel}</span>
              {cafe.reviewsCount > 0 && (
                <span>({cafe.reviewsCount.toLocaleString("vi-VN")})</span>
              )}
            </div>
          )}

          {/* Badge & Stars */}
          <div className="flex items-center gap-1.5">
            <span className="rounded-md bg-orange-50 px-1.5 py-0.5 text-[9px] font-bold text-orange-600">
              RC CAFE
            </span>
            {starCount > 0 && (
              <div className="flex items-center gap-0.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    className={cn(
                      "h-2.5 w-2.5",
                      i < starCount
                        ? "fill-yellow-400 text-yellow-400"
                        : "fill-slate-200 text-slate-200",
                    )}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Location */}
          <p className="flex items-center gap-1 text-xs text-slate-600">
            <MapPin className="h-3 w-3 shrink-0 text-red-500" />
            <span className="truncate">{cafe.district}, {cafe.city}</span>
            {distanceKm !== undefined && (
              <span className="text-[10px] text-emerald-600 shrink-0">· {formatDistance(distanceKm)}</span>
            )}
          </p>

          {/* Feature tags */}
          {(cafe.trackTypes.length > 0 || cafe.features.length > 0) && (
            <div className="flex flex-wrap gap-1 pt-0.5">
              {cafe.trackTypes.slice(0, 1).map((track) => (
                <span
                  key={track}
                  className="rounded-md border border-slate-100 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-500"
                >
                  {track}
                </span>
              ))}
              {cafe.features.slice(0, 1).map((feat) => (
                <span
                  key={feat}
                  className="rounded-md border border-slate-100 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-500"
                >
                  {feat}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Pricing & CTA */}
        <div className="pt-2 border-t border-slate-100">
          <div className="flex items-end justify-between gap-2">
            <div>
              <p className="text-[10px] text-slate-400">Giá mỗi giờ</p>
              {slotPrice > 0 ? (
                <div>
                  {discountedPrice !== null && (
                    <p className="text-[10px] text-slate-400 line-through leading-none">
                      {formatCurrency(slotPrice)}
                    </p>
                  )}
                  <p className="text-sm font-black text-orange-600 leading-tight">
                    {formatCurrency(discountedPrice ?? slotPrice)} VND
                  </p>
                </div>
              ) : (
                <p className="text-xs font-semibold text-slate-500">{cafe.priceRange}</p>
              )}
            </div>

            {hasPromo && <PromoBadge promotion={bestPromo} />}
          </div>

          {/* Actions */}
          <div className="mt-3 flex gap-1.5">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onQuickView(cafe)
              }}
              className="flex-1 rounded-xl border border-slate-200 bg-white py-1.5 text-center text-xs font-bold text-slate-600 transition-all hover:bg-slate-50 hover:border-slate-300 active:scale-[0.97]"
            >
              Xem nhanh
            </button>
            <button
              type="button"
              onClick={() => onBookNow(cafe.id)}
              className="flex-1 rounded-xl bg-orange-600 py-1.5 text-center text-xs font-bold text-white transition-all hover:bg-orange-700 hover:shadow-md hover:shadow-orange-600/20 active:scale-[0.97]"
            >
              Chọn sân
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

function computeDiscountedPrice(
  originalPrice: number,
  promo: { discount_type: string; discount_value: number; max_discount_amount: number | null },
): number {
  if (promo.discount_type === "PERCENT") {
    const discount = (originalPrice * Number(promo.discount_value)) / 100
    const cappedDiscount = promo.max_discount_amount
      ? Math.min(discount, promo.max_discount_amount)
      : discount
    return Math.max(0, originalPrice - cappedDiscount)
  }
  return Math.max(0, originalPrice - Number(promo.discount_value))
}

function getRatingLabel(rating: number): string {
  if (rating >= 4.8) return "Tuyệt vời"
  if (rating >= 4.5) return "Rất tốt"
  if (rating >= 4.0) return "Tốt"
  if (rating >= 3.5) return "Hài lòng"
  if (rating >= 3.0) return "Trung bình"
  return ""
}
