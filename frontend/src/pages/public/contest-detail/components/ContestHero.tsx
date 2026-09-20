import { useEffect, useState } from "react"
import { ArrowLeft, CalendarDays, ChevronDown } from "lucide-react"
import { Link } from "react-router"

import { routePaths } from "@/app/router/route-paths"
import { ContestStatusBadge } from "@/features/contests/components"
import { formatContestDateTime } from "@/features/contests/lib/contest-runtime"
import type { ContestItem } from "@/features/contests/types"

import { formatCurrency } from "../utils"

export function ContestHero({
  contest,
  effectiveStatus,
  ctaTarget,
  onJump,
}: {
  contest: ContestItem
  effectiveStatus: ContestItem["status"]
  /** Mục mà nút chính dẫn tới — trang cha biết phần Diễn biến có tồn tại không. */
  ctaTarget: string
  onJump: (sectionId: string) => void
}) {
  const milestone = getHeroMilestone(contest, effectiveStatus)
  const contestOver =
    effectiveStatus === "COMPLETED" || effectiveStatus === "CANCELLED"
  const countdown = useCountdown(milestone?.at)

  return (
    <section className="relative isolate overflow-hidden bg-brand-dark text-white">
      {contest.banner_image_url ? (
        <img
          src={contest.banner_image_url}
          alt=""
          aria-hidden
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        <div className="contest-hero-gradient absolute inset-0" />
      )}
      <div className="absolute inset-0 bg-gradient-to-br from-black/90 via-black/65 to-black/25" />
      <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black/80 to-transparent" />

      <div className="relative mx-auto flex min-h-[560px] max-w-7xl flex-col gap-12 px-4 py-8 sm:px-6 lg:min-h-[640px] lg:py-12">
        <Link
          to={routePaths.contests}
          className="inline-flex w-fit items-center gap-2 text-sm font-bold text-white/60 transition hover:text-white"
        >
          <ArrowLeft className="size-4" />
          <span>Quay lại danh sách giải đấu</span>
        </Link>

        <div className="flex flex-1 flex-col justify-center gap-7">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-3 py-1 text-2xs font-black uppercase tracking-[0.16em] text-brand-amber backdrop-blur">
              {contest.contest_type?.name ?? "Giải đấu"} ·{" "}
              {contest.contest_format?.name ?? "Standard"}
            </span>
            <ContestStatusBadge
              status={effectiveStatus}
              className="h-auto px-3 py-1 font-semibold"
            />
          </div>

          <div className="max-w-4xl">
            <h1 className="text-4xl font-black leading-[1.05] tracking-tight sm:text-6xl">
              {contest.name}
            </h1>
            <p className="mt-5 max-w-2xl text-base font-medium leading-8 text-white/75">
              {contest.description?.trim()
                ? truncate(contest.description, 180)
                : contestOver
                  ? "Giải đã khép lại — xem lại thể thức, sơ đồ đấu và bảng xếp hạng chung cuộc bên dưới."
                  : "Một cuộc tranh tài mở cho mọi tay lái — xem thể thức, lịch trình, giải thưởng và giữ suất của bạn ngay bên dưới."}
            </p>
          </div>

          {countdown && milestone ? (
            <div>
              <p className="text-2xs font-black uppercase tracking-[0.2em] text-white/50">
                {milestone.label}
              </p>
              <div className="mt-3 flex items-end gap-6">
                <CountdownUnit value={countdown.days} unit="ngày" />
                <CountdownUnit value={countdown.hours} unit="giờ" />
                <CountdownUnit value={countdown.minutes} unit="phút" />
                <CountdownUnit value={countdown.seconds} unit="giây" />
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            {/* Giải đã khép lại thì mời đăng ký là mất công người xem: bấm vào
                chỉ tới một khối báo "đã kết thúc". Dẫn thẳng sang kết quả. */}
            <button
              type="button"
              onClick={() => onJump(ctaTarget)}
              className="inline-flex h-12 items-center gap-2 rounded-2xl bg-primary px-7 text-sm font-black text-primary-foreground shadow-lg shadow-primary/25 transition hover:bg-brand-amber hover:text-accent-foreground active:scale-[0.98]"
            >
              {contestOver
                ? ctaTarget === "dien-bien"
                  ? "Xem kết quả"
                  : "Xem chi tiết"
                : "Đăng ký tham gia"}
            </button>
            <button
              type="button"
              onClick={() => onJump("lich-trinh")}
              className="inline-flex h-12 items-center gap-2 rounded-2xl border border-white/25 px-6 text-sm font-bold text-white/85 backdrop-blur transition hover:border-white/50 hover:bg-white/10 hover:text-white"
            >
              <CalendarDays className="size-4" />
              Xem lịch trình
            </button>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-6 border-t border-white/15 pt-7 lg:grid-cols-4 lg:divide-x lg:divide-white/15">
          <HeroFact
            label="Chi nhánh tổ chức"
            value={contest.host_branch?.cafe?.name ?? "Đang cập nhật"}
          />
          <HeroFact
            label="Khởi tranh"
            value={formatContestDateTime(contest.starts_at)}
          />
          <HeroFact label="Lệ phí" value={formatCurrency(contest.entry_fee)} />
          <HeroFact
            label="Sức chứa"
            value={
              contest.capacity === null
                ? "Không giới hạn"
                : `${contest.capacity} tay đua`
            }
          />
        </dl>

        <button
          type="button"
          onClick={() => onJump("gioi-thieu")}
          aria-label="Cuộn tới phần giới thiệu"
          className="mx-auto -mt-4 hidden size-10 items-center justify-center rounded-full border border-white/20 text-white/60 transition hover:border-white/40 hover:text-white lg:flex"
        >
          <ChevronDown className="size-5" />
        </button>
      </div>
    </section>
  )
}

function HeroFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="lg:px-6 lg:first:pl-0">
      <dt className="text-2xs font-black uppercase tracking-[0.16em] text-white/45">
        {label}
      </dt>
      <dd className="mt-2 text-base font-black text-white">{value}</dd>
    </div>
  )
}

function CountdownUnit({ value, unit }: { value: number; unit: string }) {
  return (
    <div className="text-center">
      <p className="text-4xl font-black tabular-nums leading-none text-white sm:text-5xl">
        {String(value).padStart(2, "0")}
      </p>
      <p className="mt-2 text-2xs font-bold uppercase tracking-[0.16em] text-white/50">
        {unit}
      </p>
    </div>
  )
}

/**
 * Mốc thời gian đáng đếm ngược nhất ở thời điểm hiện tại.
 *
 * Ưu tiên mốc mà khách còn có thể hành động (mở/đóng đăng ký) trước mốc khởi tranh;
 * giải đang chạy hoặc đã khép lại thì không đếm ngược gì cả.
 */
function getHeroMilestone(
  contest: ContestItem,
  effectiveStatus: ContestItem["status"],
): { label: string; at: string } | null {
  if (
    effectiveStatus === "RUNNING" ||
    effectiveStatus === "COMPLETED" ||
    effectiveStatus === "CANCELLED"
  ) {
    return null
  }

  const now = Date.now()
  const opensAt = toTime(contest.registration_opens_at)
  if (opensAt && opensAt > now) {
    return { label: "Mở đăng ký sau", at: contest.registration_opens_at! }
  }

  const closesAt = toTime(contest.registration_closes_at)
  if (closesAt && closesAt > now) {
    return { label: "Đóng đăng ký sau", at: contest.registration_closes_at! }
  }

  const startsAt = toTime(contest.starts_at)
  if (startsAt && startsAt > now) {
    return { label: "Khởi tranh sau", at: contest.starts_at }
  }

  return null
}

function toTime(value: string | null | undefined) {
  if (!value) return null
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? null : time
}

function useCountdown(target: string | null | undefined) {
  const targetTime = toTime(target)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!targetTime) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [targetTime])

  if (!targetTime) return null
  const remaining = targetTime - now
  if (remaining <= 0) return null

  return {
    days: Math.floor(remaining / 86_400_000),
    hours: Math.floor((remaining / 3_600_000) % 24),
    minutes: Math.floor((remaining / 60_000) % 60),
    seconds: Math.floor((remaining / 1000) % 60),
  }
}

function truncate(value: string, max: number) {
  const text = value.trim()
  if (text.length <= max) return text
  return `${text.slice(0, max).trimEnd()}…`
}
