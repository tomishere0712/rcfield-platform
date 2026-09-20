import { Bookmark, Heart, MapPin, Star } from "lucide-react"
import { Link } from "react-router"
import { motion } from "framer-motion"
import type { Cafe } from "@/shared/data/explore-data"
import { buildCafeDetailPath } from "@/pages/customer/cafe-detail/cafe-detail-utils"
import { formatCurrency } from "@/shared/lib/format"
import { formatDistance } from "../explore-utils"
import { PromoBadge } from "./PromoBadge"
import { cn } from "@/shared/lib/utils"

interface CafeHorizontalCardProps {
  cafe: Cafe
  isFavorite: boolean
  onToggleFavorite: (cafeId: string) => void
  distanceKm?: number
  onQuickView: (cafe: Cafe) => void
  onBookNow: (cafeId: string) => void
  onHover: (cafeId: string | null) => void
}

export function CafeHorizontalCard({
  cafe,
  isFavorite,
  onToggleFavorite,
  distanceKm,
  onQuickView,
  onBookNow,
  onHover,
}: CafeHorizontalCardProps) {
  const slotPrice = cafe.slotFeeRate ?? 0
  const bestPromo = cafe.promotions?.[0] ?? null
  const hasPromo = !!bestPromo

  const discountedPrice = hasPromo ? computeDiscountedPrice(slotPrice, bestPromo) : null
  const ratingLabel = getRatingLabel(cafe.rating)

  const starCount = Math.round(cafe.rating)

  return (
    <motion.div
      className="group flex overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-sm will-change-transform"
      onMouseEnter={() => onHover(cafe.id)}
      onMouseLeave={() => onHover(null)}
      whileHover={{
        y: -3,
        boxShadow: "0 12px 40px -8px rgba(0,0,0,0.1), 0 4px 16px -4px rgba(0,0,0,0.06)",
        transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] },
      }}
    >
      {/* LEFT — Image */}
      <Link
        to={buildCafeDetailPath(cafe)}
        className="relative h-auto w-[240px] shrink-0 overflow-hidden bg-slate-100 lg:w-[280px]"
      >
        <img
          src={cafe.image}
          alt={cafe.name}
          className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.05]"
        />

        {/* Gradient overlay on hover */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/15 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

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

        {/* Image gallery mini dots */}
        {cafe.images && cafe.images.length > 1 && (
          <div className="absolute bottom-3 left-3 flex gap-1">
            {cafe.images.slice(0, 3).map((img, i) => (
              <div
                key={i}
                className="h-8 w-8 overflow-hidden rounded-lg border border-white/70 bg-white/80 shadow-sm"
              >
                <img src={img} alt="" className="h-full w-full object-cover" />
              </div>
            ))}
            {cafe.images.length > 3 && (
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800/70 text-[10px] font-bold text-white backdrop-blur-sm">
                Xem ảnh
              </div>
            )}
          </div>
        )}

        {/* Promo overlay badge */}
        {hasPromo && bestPromo.discount_type === "PERCENT" && Number(bestPromo.discount_value) >= 40 && (
          <div className="absolute bottom-3 right-3 rounded-lg bg-orange-500 px-2 py-1 text-[10px] font-bold text-white shadow-md">
            7.7
          </div>
        )}
      </Link>

      {/* CENTER — Info */}
      <div className="flex min-w-0 flex-1 flex-col justify-between p-4">
        <div>
          {/* Name + Rating */}
          <div className="flex items-start justify-between gap-3">
            <Link
              to={buildCafeDetailPath(cafe)}
              className="line-clamp-1 text-base font-bold text-slate-900 transition-colors hover:text-orange-600"
            >
              {cafe.name}
            </Link>
            {cafe.rating > 0 && (
              <div className="flex shrink-0 items-center gap-1.5">
                <span className="rounded-lg bg-orange-600 px-1.5 py-0.5 text-xs font-bold text-white">
                  {cafe.rating.toFixed(1)}/5
                </span>
                <span className="text-xs font-semibold text-slate-600">{ratingLabel}</span>
              </div>
            )}
          </div>

          {/* Reviews count */}
          {cafe.reviewsCount > 0 && (
            <p className="mt-0.5 text-right text-[11px] text-slate-400">
              ({cafe.reviewsCount.toLocaleString("vi-VN")} đánh giá)
            </p>
          )}

          {/* RC CAFE badge + stars */}
          <div className="mt-1.5 flex items-center gap-2">
            <span className="rounded-md bg-orange-50 px-1.5 py-0.5 text-[10px] font-bold text-orange-600">
              RC CAFE
            </span>
            {starCount > 0 && (
              <div className="flex items-center gap-0.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    className={cn(
                      "h-3 w-3",
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
          <p className="mt-2 flex items-center gap-1 text-sm text-slate-600">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-red-500" />
            <span className="line-clamp-1">{cafe.district}, {cafe.city}</span>
            {distanceKm !== undefined && (
              <span className="ml-1 text-xs text-emerald-600">· {formatDistance(distanceKm)}</span>
            )}
          </p>

          {/* Feature tags */}
          {(cafe.trackTypes.length > 0 || cafe.features.length > 0) && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {cafe.trackTypes.slice(0, 2).map((track) => (
                <span
                  key={track}
                  className="rounded-md border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-600"
                >
                  {track}
                </span>
              ))}
              {cafe.features.slice(0, 2).map((feat) => (
                <span
                  key={feat}
                  className="rounded-md border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-600"
                >
                  {feat}
                </span>
              ))}
              {(cafe.trackTypes.length + cafe.features.length) > 4 && (
                <span className="rounded-md border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-400">
                  +{cafe.trackTypes.length + cafe.features.length - 4}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Promo banner (7.7 style) */}
        {hasPromo && bestPromo.discount_type === "PERCENT" && Number(bestPromo.discount_value) >= 40 && (
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-orange-50 px-2.5 py-1.5">
            <span className="rounded-md bg-orange-500 px-1.5 py-0.5 text-[10px] font-bold text-white">7.7</span>
            <span className="text-xs font-semibold text-orange-700">
              Deal hot chỉ có ở 7.7 EPIC
            </span>
          </div>
        )}
      </div>

      {/* RIGHT — Price + CTA */}
      <div className="flex w-[180px] shrink-0 flex-col items-end justify-between border-l border-slate-100 p-4 lg:w-[200px]">
        <div className="w-full text-right">
          {/* Promo badge */}
          {hasPromo && <PromoBadge promotion={bestPromo} />}

          {/* Price */}
          {slotPrice > 0 && (
            <div className="mt-1">
              {discountedPrice !== null && (
                <p className="text-sm text-slate-400 line-through">
                  {formatCurrency(slotPrice)} VND
                </p>
              )}
              <p className="text-lg font-bold text-orange-600">
                {formatCurrency(discountedPrice ?? slotPrice)} VND
              </p>
              <p className="text-[11px] text-slate-400">Giá mỗi giờ</p>
            </div>
          )}

          {slotPrice === 0 && (
            <p className="text-sm font-medium text-slate-400">{cafe.priceRange}</p>
          )}
        </div>

        <div className="mt-3 flex w-full flex-col gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onQuickView(cafe)
            }}
            className="w-full rounded-xl border border-slate-200 bg-white py-1.5 text-xs font-semibold text-slate-600 transition-all hover:bg-slate-50 hover:border-slate-300 active:scale-[0.97]"
          >
            Xem nhanh
          </button>
          <button
            type="button"
            onClick={() => onBookNow(cafe.id)}
            className="w-full rounded-xl bg-orange-600 py-2.5 text-sm font-bold text-white transition-all hover:bg-orange-700 hover:shadow-md hover:shadow-orange-600/20 active:scale-[0.97]"
          >
            Chọn sân
          </button>
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
  // FIXED
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
