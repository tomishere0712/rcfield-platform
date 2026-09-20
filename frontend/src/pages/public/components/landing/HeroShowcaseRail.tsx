import { useEffect, useState } from "react"
import { Link } from "react-router"
import { ArrowRight, MapPin, Star } from "lucide-react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { Button } from "@/shared/ui/button"
import { cn } from "@/shared/lib/utils"
import { heroFloat, softReveal } from "./landing-motion"
import type { HeroVenueCardViewModel } from "./landing-types"

type HeroShowcaseRailProps = {
  venues: HeroVenueCardViewModel[]
  isLoading: boolean
}

/** Khoảng thời gian mỗi chi nhánh giữ vị trí chính. */
const ROTATE_INTERVAL_MS = 5000

export function HeroShowcaseRail({ venues, isLoading }: HeroShowcaseRailProps) {
  const prefersReducedMotion = useReducedMotion()
  const [activeIndex, setActiveIndex] = useState(0)
  const [isPaused, setIsPaused] = useState(false)

  const total = venues.length

  // Danh sách chi nhánh tải về sau khi component đã mount, nên chỉ số đang giữ
  // có thể trỏ ra ngoài mảng. Chốt lại lúc render thay vì đồng bộ bằng effect.
  const safeIndex = total > 0 ? activeIndex % total : 0

  useEffect(() => {
    // Một chi nhánh thì không có gì để xoay. Dừng khi con trỏ đang ở trên thẻ
    // để thẻ không đổi ngay dưới tay người đang định bấm "Đặt lịch ngay".
    if (total < 2 || isPaused || prefersReducedMotion) return

    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % total)
    }, ROTATE_INTERVAL_MS)

    return () => window.clearInterval(timer)
  }, [total, isPaused, prefersReducedMotion])

  if (isLoading) {
    return (
      <div className="relative hidden h-[470px] lg:block">
        <div className="absolute right-0 top-5 z-10 h-[420px] w-[320px] animate-pulse rounded-[32px] bg-white/70" />
        <div className="absolute left-1 top-12 z-0 h-[145px] w-[170px] animate-pulse rounded-[24px] bg-white/60" />
      </div>
    )
  }

  if (venues.length === 0) {
    return (
      <div className="hidden lg:flex lg:h-[470px] lg:items-center lg:justify-center">
        <div className="max-w-sm rounded-[32px] border border-slate-200 bg-white/80 p-8 text-center shadow-[var(--landing-shadow-soft)]">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-orange-600">
            Đang cập nhật
          </p>
          <h3 className="mt-3 text-2xl font-black text-slate-950">
            Chưa có cơ sở hiển thị
          </h3>
          <p className="mt-3 text-sm leading-7 text-slate-600">
            Khi dữ liệu cơ sở sẵn sàng, khu vực này sẽ hiển thị các sân nổi bật
            để bạn đặt lịch nhanh.
          </p>
        </div>
      </div>
    )
  }

  // Không cố định chi nhánh nào — thẻ chính chạy tuần tự, thẻ phụ luôn là chi
  // nhánh kế tiếp trong vòng xoay để người xem thấy trước cái sắp tới.
  const primaryVenue = venues[safeIndex]
  const secondaryVenue = total > 1 ? venues[(safeIndex + 1) % total] : undefined

  return (
    <div
      className="relative hidden h-[470px] lg:block"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocusCapture={() => setIsPaused(true)}
      onBlurCapture={() => setIsPaused(false)}
    >
      {secondaryVenue ? (
        <AnimatePresence mode="wait">
          <FloatingMiniCard
            key={secondaryVenue.id}
            venue={secondaryVenue}
            className="left-1 top-12 z-0 w-[170px]"
          />
        </AnimatePresence>
      ) : null}

      <motion.div
        variants={softReveal}
        initial={prefersReducedMotion ? false : "hidden"}
        animate={prefersReducedMotion ? undefined : "visible"}
        whileHover={prefersReducedMotion ? undefined : "hover"}
        className="absolute right-0 top-5 z-10"
      >
        <motion.article
          variants={heroFloat}
          initial="rest"
          whileHover="hover"
          className="w-[320px] overflow-hidden rounded-[32px] border border-white/80 bg-white shadow-[var(--landing-shadow-strong)]"
        >
          {/* Khung thẻ đứng yên, chỉ nội dung bên trong đổi — chuyển cảnh êm hơn
              nhiều so với việc cả tấm thẻ biến mất rồi hiện lại. */}
          <AnimatePresence mode="wait">
            <motion.div
              key={primaryVenue.id}
              initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={prefersReducedMotion ? undefined : { opacity: 0, y: -10 }}
              transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="relative aspect-video overflow-hidden bg-[var(--landing-surface-soft)]">
                <VenueVisual venue={primaryVenue} size="hero" />
              </div>
              <div className="space-y-3 p-5">
                <div>
                  <h3 className="line-clamp-2 text-xl font-black tracking-tight text-slate-950">
                    <Link
                      to={primaryVenue.detailHref}
                      className="transition-colors hover:text-orange-600"
                    >
                      {primaryVenue.name}
                    </Link>
                  </h3>
                  <p className="mt-1.5 flex items-center gap-2 text-sm font-medium text-slate-500">
                    <MapPin className="h-4 w-4 text-orange-500" />
                    {primaryVenue.cityLabel}
                  </p>
                </div>

                <div className="flex items-center justify-between rounded-2xl bg-[var(--landing-surface-soft)] px-4 py-2.5">
                  <div>
                    <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-slate-400">
                      Trạng thái
                    </p>
                    <p className="mt-1 text-sm font-bold text-slate-700">
                      {primaryVenue.availabilityLabel}
                    </p>
                  </div>
                  {primaryVenue.ratingLabel ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-3 py-1.5 text-xs font-black text-orange-600">
                      <Star className="h-3.5 w-3.5 fill-current" />
                      {primaryVenue.ratingLabel}
                    </span>
                  ) : null}
                </div>

                <Button
                  asChild
                  className="h-12 w-full rounded-2xl bg-orange-600 text-sm font-black text-white hover:bg-orange-500"
                >
                  <Link to={primaryVenue.bookingHref}>
                    Đặt lịch ngay
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </motion.div>
          </AnimatePresence>
        </motion.article>

        {/* Chấm chỉ báo — cho biết đây là vòng xoay và cho người xem tự chọn,
            thay vì buộc họ chờ hết lượt. */}
        {total > 1 ? (
          <div className="mt-4 flex items-center justify-center gap-2">
            {venues.map((venue, index) => (
              <button
                key={venue.id}
                type="button"
                onClick={() => setActiveIndex(index)}
                aria-label={`Xem ${venue.name}`}
                aria-current={index === safeIndex}
                className={cn(
                  "h-1.5 rounded-full transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500",
                  index === safeIndex
                    ? "w-6 bg-orange-500"
                    : "w-1.5 bg-slate-300 hover:bg-slate-400",
                )}
              />
            ))}
          </div>
        ) : null}
      </motion.div>
    </div>
  )
}

function FloatingMiniCard({
  venue,
  className,
}: {
  venue: HeroVenueCardViewModel
  className?: string
}) {
  const prefersReducedMotion = useReducedMotion()

  return (
    <motion.article
      variants={softReveal}
      initial={prefersReducedMotion ? false : "hidden"}
      animate={prefersReducedMotion ? undefined : "visible"}
      whileHover={prefersReducedMotion ? undefined : { y: -4 }}
      className={cn(
        "absolute overflow-hidden rounded-[24px] border border-white/70 bg-white/92 shadow-[var(--landing-shadow-soft)]",
        className,
      )}
    >
      <div className="relative aspect-[1.4] overflow-hidden bg-[var(--landing-surface-soft)]">
        <VenueVisual venue={venue} size="mini" />
      </div>
      <div className="space-y-1 p-3">
        <h3 className="line-clamp-2 text-sm font-black leading-5 text-slate-950">
          {venue.name}
        </h3>
        <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
          <MapPin className="h-3 w-3 shrink-0 text-orange-500" />
          <span className="truncate">{venue.cityLabel}</span>
        </p>
      </div>
    </motion.article>
  )
}

function VenueVisual({
  venue,
  size,
}: {
  venue: HeroVenueCardViewModel
  size: "hero" | "mini"
}) {
  if (!venue.image || !venue.hasRealImage) {
    return (
      <div className="h-full bg-[radial-gradient(circle_at_top_left,_rgba(251,146,60,0.24),_transparent_38%),linear-gradient(145deg,_#f8fafc_8%,_#e2e8f0_100%)]" />
    )
  }

  return (
    <>
      <img
        src={venue.image}
        alt={venue.name}
        className={cn(
          "h-full w-full object-cover",
          size === "hero"
            ? "transition-transform duration-700 hover:scale-[1.03]"
            : "",
        )}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/25 via-transparent to-transparent" />
    </>
  )
}
