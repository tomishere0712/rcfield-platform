import { useCallback, useEffect, useRef, useState } from "react"
import { ArrowRight, Calendar, ChevronLeft, ChevronRight, Trophy, Users } from "lucide-react"
import { Link } from "react-router"

import { routePaths } from "@/app/router/route-paths"
import type { FeaturedContestSlot } from "@/features/explore/api/featured-popup.api"
import {
  getContestRegistrationAvailability,
  getEffectiveContestStatus,
  getRegistrationAvailabilityLabel,
} from "@/features/contests/lib/contest-status"
import { cloudinaryImage, IMAGE_RATIO } from "@/shared/lib/cloudinary"
import { cn } from "@/shared/lib/utils"

interface ContestDiscoveryRailProps {
  slots: FeaturedContestSlot[]
  className?: string
}

/**
 * Dải giải đấu được quảng bá ở trang khám phá.
 *
 * Nguồn dữ liệu là các suất quảng bá provider đã trả phí và admin đã duyệt, nên
 * giải không mua gói sẽ không bao giờ lọt vào đây. Không có suất nào đang chạy
 * thì cả khối biến mất thay vì hiện khung rỗng.
 */
export function ContestDiscoveryRail({ slots, className }: ContestDiscoveryRailProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [activeIndex, setActiveIndex] = useState(0)

  const scrollToIndex = useCallback((index: number) => {
    const track = trackRef.current
    if (!track) return
    const child = track.children[index] as HTMLElement | undefined
    if (!child) return
    track.scrollTo({ left: child.offsetLeft - track.offsetLeft, behavior: "smooth" })
  }, [])

  // Đồng bộ chấm chỉ báo khi người dùng tự vuốt, thay vì chỉ khi bấm nút.
  useEffect(() => {
    const track = trackRef.current
    if (!track) return
    const onScroll = () => {
      const children = Array.from(track.children) as HTMLElement[]
      const center = track.scrollLeft + track.clientWidth / 2
      let nearest = 0
      let nearestDistance = Number.POSITIVE_INFINITY
      children.forEach((child, index) => {
        const childCenter = child.offsetLeft - track.offsetLeft + child.clientWidth / 2
        const distance = Math.abs(childCenter - center)
        if (distance < nearestDistance) {
          nearestDistance = distance
          nearest = index
        }
      })
      setActiveIndex(nearest)
    }
    track.addEventListener("scroll", onScroll, { passive: true })
    return () => track.removeEventListener("scroll", onScroll)
  }, [slots.length])

  if (slots.length === 0) return null

  const multiple = slots.length > 1

  return (
    <section className={cn("mb-5", className)}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-3 py-1 text-[11px] font-black text-background">
            <Trophy className="size-3.5 text-brand-amber" />
            Góc giải đấu
          </span>
          <span className="text-xs font-bold text-muted-foreground">
            {slots.length} giải đang được quảng bá
          </span>
        </div>

        <div className="flex items-center gap-2">
          {multiple ? (
            <div className="flex gap-1.5">
              <button
                type="button"
                aria-label="Giải trước"
                onClick={() => scrollToIndex(Math.max(0, activeIndex - 1))}
                disabled={activeIndex === 0}
                className="rounded-lg border border-border bg-card p-1.5 text-foreground transition hover:bg-muted disabled:opacity-40"
              >
                <ChevronLeft className="size-4" />
              </button>
              <button
                type="button"
                aria-label="Giải tiếp theo"
                onClick={() => scrollToIndex(Math.min(slots.length - 1, activeIndex + 1))}
                disabled={activeIndex === slots.length - 1}
                className="rounded-lg border border-border bg-card p-1.5 text-foreground transition hover:bg-muted disabled:opacity-40"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
          ) : null}

          <Link
            to={routePaths.contests}
            className="inline-flex items-center gap-1.5 text-xs font-black text-primary hover:underline"
          >
            Xem tất cả
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </div>

      <div
        ref={trackRef}
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {slots.map((slot) => (
          <FeaturedContestCard key={slot.id} slot={slot} single={!multiple} />
        ))}
      </div>

      {multiple ? (
        <div className="mt-2 flex justify-center gap-1.5">
          {slots.map((slot, index) => (
            <button
              key={slot.id}
              type="button"
              aria-label={`Tới giải ${index + 1}`}
              onClick={() => scrollToIndex(index)}
              className={cn(
                "h-1.5 rounded-full transition-all",
                index === activeIndex ? "w-5 bg-primary" : "w-1.5 bg-border",
              )}
            />
          ))}
        </div>
      ) : null}
    </section>
  )
}

function FeaturedContestCard({ slot, single }: { slot: FeaturedContestSlot; single: boolean }) {
  const contest = slot.contest

  // Suất quảng bá có thể trỏ tới một trang bất kỳ qua cta_url thay vì một giải
  // cụ thể, nên phần trạng thái/lịch chỉ dựng khi thật sự có dữ liệu giải.
  const availability = contest ? getContestRegistrationAvailability(contest) : null
  const status = contest ? getEffectiveContestStatus(contest) : null
  const capacityRemaining = contest?.public_stats?.capacity_remaining

  const to = contest
    ? routePaths.contestDetail.replace(":contestId", contest.id)
    : (slot.cta_url ?? routePaths.contests)

  // Thẻ rộng tối đa 32rem = 512px. Yêu cầu Cloudinary cắt sẵn đúng tỉ lệ khung
  // thay vì để object-cover cắt cứng vào giữa một ảnh sai kích thước.
  const image = cloudinaryImage(slot.image_url ?? contest?.banner_image_url ?? null, {
    width: 512,
    aspectRatio: IMAGE_RATIO.rail,
  })

  return (
    <Link
      to={to}
      className={cn(
        "group relative min-h-[200px] shrink-0 snap-start overflow-hidden rounded-2xl border border-border shadow-sm",
        single ? "w-full" : "w-[min(100%,32rem)]",
      )}
    >
      {image ? (
        <img
          src={image}
          alt={slot.title}
          className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
        />
      ) : (
        <div className="contest-hero-gradient absolute inset-0" />
      )}
      <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/45 to-black/10" />

      <div className="relative flex min-h-[200px] flex-col justify-between p-5 text-white">
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/15 px-3 py-1 text-[11px] font-black backdrop-blur">
            <Trophy className="size-3.5 text-brand-amber" />
            Được quảng bá
          </span>
          {availability ? (
            <span
              className={cn(
                "rounded-full border border-white/20 px-3 py-1 text-[11px] font-black backdrop-blur",
                status === "RUNNING"
                  ? "live-pulse-dot bg-red-500/90 pl-5 text-white"
                  : "bg-white/90 text-foreground",
              )}
            >
              {getRegistrationAvailabilityLabel(availability)}
            </span>
          ) : null}
        </div>

        <div>
          {contest?.contest_format?.name ? (
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-brand-amber">
              {contest.contest_format.name}
            </p>
          ) : null}
          <h3 className="mt-2 line-clamp-2 max-w-xl text-2xl font-black leading-tight">
            {contest?.name ?? slot.title}
          </h3>
          {slot.subtitle && !contest ? (
            <p className="mt-1 line-clamp-2 max-w-xl text-xs font-semibold text-slate-200">
              {slot.subtitle}
            </p>
          ) : null}

          {contest ? (
            <div className="mt-4 flex flex-wrap gap-3 text-xs font-bold text-slate-100">
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="size-3.5" />
                {formatRailDate(contest.starts_at)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Users className="size-3.5" />
                {capacityRemaining === null || capacityRemaining === undefined
                  ? `${contest.public_stats?.registration_count ?? 0} đăng ký`
                  : `Còn ${capacityRemaining} chỗ`}
              </span>
            </div>
          ) : (
            <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-black text-brand-amber">
              {slot.cta_label}
              <ArrowRight className="size-3.5" />
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}

function formatRailDate(value: string | null) {
  if (!value) return "Đang cập nhật"
  return new Date(value).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}
