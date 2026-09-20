import type { ReactNode } from "react"
import {
  Calendar,
  MapPin,
  Sparkles,
  Timer,
  Trophy,
  Users,
} from "lucide-react"
import { Link } from "react-router"

import { routePaths } from "@/app/router/route-paths"
import { ContestAvailabilityBadge } from "@/features/contests/components"
import {
  getContestCtaLabel,
  getContestRegistrationAvailability,
  getEffectiveContestStatus,
} from "@/features/contests/lib/contest-status"
import type { ContestItem } from "@/features/contests/types"
import { cn } from "@/shared/lib/utils"

interface ContestExploreCardProps {
  contest: ContestItem
}

export function ContestExploreCard({ contest }: ContestExploreCardProps) {
  const effectiveStatus = getEffectiveContestStatus(contest)
  const registrationAvailability = getContestRegistrationAvailability(contest)
  const hasBanner = Boolean(contest.banner_image_url)
  const publicStats = contest.public_stats
  const runtimeSummary = contest.runtime_summary
  const capacityRemaining = publicStats?.capacity_remaining

  return (
    <Link
      to={routePaths.contestDetail.replace(":contestId", contest.id)}
      className="group flex h-full flex-col overflow-hidden rounded-[28px] border border-border bg-card shadow-sm transition duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-xl hover:shadow-muted/40"
    >
      <div className="relative block aspect-[16/10] overflow-hidden">
        {hasBanner ? (
          <img
            src={contest.banner_image_url!}
            alt={contest.name}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="contest-hero-gradient absolute inset-0" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/15 to-transparent" />
        <div className="absolute left-4 top-4 flex flex-wrap gap-2">
          <ContestAvailabilityBadge
            contest={contest}
            className="rounded-full px-2.5 py-1 text-[10px] font-extrabold shadow-sm backdrop-blur-md"
          />
          {effectiveStatus === "RUNNING" ? (
            <span className="live-pulse-dot rounded-full border border-white/15 bg-white/10 pl-5 pr-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-white">
              Live bracket
            </span>
          ) : null}
        </div>
        <div className="absolute bottom-4 left-4 right-4">
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-brand-amber">
                {contest.contest_type?.name ?? "RC Contest"}
              </p>
              <h3 className="mt-2 line-clamp-2 text-xl font-black text-white">
                {contest.name}
              </h3>
            </div>
            <div className="rounded-2xl border border-white/15 bg-black/20 px-3 py-2 text-right backdrop-blur">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-300">
                Lệ phí
              </p>
              <p className="text-sm font-black text-white">
                {formatEntryFee(contest.entry_fee)}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col justify-between p-5">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Tag>{contest.contest_format?.name ?? "Thể thức"}</Tag>
            <Tag>{contest.track_type?.name ?? "Track"}</Tag>
            {contest.highlight_rounds?.length ? (
              <Tag tone="accent">
                {contest.highlight_rounds.length} vòng nổi bật
              </Tag>
            ) : null}
          </div>

          <p className="line-clamp-2 min-h-10 text-sm leading-6 text-muted-foreground">
            {contest.description ||
              "Xem tiến trình thi đấu, bracket các vòng và kết quả được công bố từ giải."}
          </p>

          <div className="grid gap-3 text-sm font-semibold text-muted-foreground">
            <MetaRow
              icon={<MapPin className="h-4 w-4 text-red-500" />}
              value={contest.host_branch?.cafe?.name || "Tất cả chi nhánh"}
            />
            <MetaRow
              icon={<Calendar className="h-4 w-4 text-muted-foreground" />}
              value={`${formatDateTime(contest.starts_at)} - ${formatDateTime(contest.ends_at)}`}
            />
            <MetaRow
              icon={<Users className="h-4 w-4 text-muted-foreground" />}
              value={
                capacityRemaining === null || capacityRemaining === undefined
                  ? contest.capacity
                    ? `Sức chứa ${contest.capacity} tay đua`
                    : "Không giới hạn số người chơi"
                  : `Còn ${capacityRemaining} chỗ trên ${contest.capacity ?? "mức mở"}`
              }
            />
          </div>

          {capacityRemaining !== null && capacityRemaining !== undefined && contest.capacity ? (
            <div>
              <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                <span>Chỗ còn</span>
                <span>
                  {capacityRemaining}/{contest.capacity}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{
                    width: `${Math.min(100, Math.round((capacityRemaining / contest.capacity) * 100))}%`,
                  }}
                />
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-3 gap-2">
            <Metric
              icon={<Users className="size-3.5" />}
              label="Đăng ký"
              value={String(publicStats?.registration_count ?? 0)}
            />
            <Metric
              icon={<Sparkles className="size-3.5" />}
              label="Xác nhận"
              value={String(publicStats?.confirmed_count ?? 0)}
            />
            <Metric
              icon={<Trophy className="size-3.5" />}
              label="Vòng"
              value={String(runtimeSummary?.total_rounds ?? 0)}
            />
          </div>

          {effectiveStatus === "RUNNING" || effectiveStatus === "COMPLETED" ? (
            <div className="rounded-2xl border border-primary/10 bg-primary/5 p-3">
              <div className="flex items-center gap-2 text-primary">
                <Timer className="size-4" />
                <p className="text-xs font-black uppercase tracking-wide">
                  Theo dõi vòng đấu
                </p>
              </div>
              <p className="mt-2 text-sm font-semibold text-muted-foreground">
                {runtimeSummary?.has_live_matches
                  ? "Giải đang có trận live. Vào chi tiết để xem sơ đồ và người vào vòng trong."
                  : "Bracket và lịch sử từng vòng đã sẵn sàng để xem trong trang chi tiết."}
              </p>
            </div>
          ) : null}
        </div>

        <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Hành động
            </p>
            <p className="text-sm font-extrabold text-foreground">
              {getContestCtaLabel(registrationAvailability, effectiveStatus)}
            </p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-foreground px-4 py-2.5 text-xs font-black text-background transition group-hover:bg-primary">
            Chi tiết
          </span>
        </div>
      </div>
    </Link>
  )
}

function Tag({
  children,
  tone = "muted",
}: {
  children: ReactNode
  tone?: "muted" | "accent"
}) {
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide",
        tone === "accent"
          ? "bg-accent/20 text-accent-foreground"
          : "bg-muted text-muted-foreground",
      )}
    >
      {children}
    </span>
  )
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: ReactNode
  label: string
  value: string
}) {
  return (
    <div className="rounded-2xl border border-border bg-muted/50 p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground">{icon}</div>
      <p className="mt-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="text-sm font-black text-foreground">{value}</p>
    </div>
  )
}

function MetaRow({
  icon,
  value,
}: {
  icon: ReactNode
  value: string
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="shrink-0">{icon}</span>
      <span className="truncate">{value}</span>
    </div>
  )
}

function formatDateTime(isoString?: string | null) {
  if (!isoString) return "--"
  try {
    const date = new Date(isoString)
    return date.toLocaleString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit",
    })
  } catch {
    return isoString
  }
}

function formatEntryFee(value: number) {
  if (value <= 0) return "Miễn phí"
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value)
}
