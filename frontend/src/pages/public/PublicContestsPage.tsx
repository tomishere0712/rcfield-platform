import { useMemo, useState, type ReactNode } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  Calendar,
  MapPin,
  Users,
  Award,
  ShieldAlert,
  Trophy,
  Flame,
  CheckCircle2,
} from "lucide-react"
import { Link } from "react-router"

import { routePaths } from "@/app/router/route-paths"
import {
  contestApi,
  contestQueryKeys,
} from "@/features/contests/api/contest.api"
import { ContestAvailabilityBadge } from "@/features/contests/components"
import {
  getContestCtaLabel,
  getContestRegistrationAvailability,
  getEffectiveContestStatus,
} from "@/features/contests/lib/contest-status"
import type { ContestItem } from "@/features/contests/types"
import { Badge } from "@/shared/ui/badge"
import { EmptyState } from "@/shared/ui/empty-state"
import { CardListSkeleton } from "@/shared/ui/loading-state"
import { Input } from "@/shared/ui/input"
import { cn } from "@/shared/lib/utils"

type StatusFilter = "all" | "live-open" | "upcoming" | "past"

const FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "Tất cả" },
  { value: "live-open", label: "Đang diễn ra / Mở đăng ký" },
  { value: "upcoming", label: "Sắp mở đăng ký" },
  { value: "past", label: "Đã kết thúc" },
]

export function PublicContestsPage() {
  const [query, setQuery] = useState("")
  const [formatFilter, setFormatFilter] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")

  const contestsQuery = useQuery({
    queryKey: contestQueryKeys.list({ public: true }),
    queryFn: () => contestApi.listContests({ limit: 100 }),
  })
  const formatsQuery = useQuery({
    queryKey: contestQueryKeys.catalogFormats(),
    queryFn: contestApi.listContestFormats,
  })

  const allContests = useMemo(
    () => contestsQuery.data?.data ?? [],
    [contestsQuery.data?.data],
  )

  const filteredContests = useMemo(() => {
    return allContests.filter((contest) => {
      const matchesQuery =
        !query ||
        contest.name.toLowerCase().includes(query.toLowerCase()) ||
        (contest.description ?? "").toLowerCase().includes(query.toLowerCase())
      const matchesFormat =
        !formatFilter || contest.contest_format?.id === formatFilter
      return matchesQuery && matchesFormat
    })
  }, [allContests, query, formatFilter])

  const rankedContests = useMemo(() => {
    const matches = filteredContests.filter((contest) =>
      matchesStatusFilter(contest, statusFilter),
    )
    return rankContestsForDiscovery(matches)
  }, [filteredContests, statusFilter])

  const formatOptions = useMemo(
    () =>
      (formatsQuery.data ?? []).map((f) => ({ value: f.id, label: f.name })),
    [formatsQuery.data],
  )

  const openCount = allContests.filter(
    (item) => getContestRegistrationAvailability(item) === "AVAILABLE",
  ).length
  const liveCount = allContests.filter(
    (item) => getEffectiveContestStatus(item) === "RUNNING",
  ).length

  return (
    <main className="w-full bg-background py-8">
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* Hero */}
        <div className="mb-6 overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
          <div className="relative overflow-hidden bg-brand-dark px-5 py-8 sm:px-8 sm:py-10">
            <div className="pointer-events-none absolute inset-0 opacity-40">
              <div className="absolute -right-20 -top-20 size-80 rounded-full bg-brand-orange/30 blur-3xl" />
              <div className="absolute -bottom-20 -left-10 size-72 rounded-full bg-brand-indigo/30 blur-3xl" />
            </div>
            <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
              <div className="max-w-2xl">
                <Badge className="mb-4 border-white/10 bg-white/10 text-primary-foreground hover:bg-white/15">
                  <Trophy className="mr-1.5 size-3.5" />
                  Hệ thống giải đấu
                </Badge>
                <h1 className="text-3xl font-black text-white sm:text-4xl lg:text-5xl">
                  Đấu Trường RC Field
                </h1>
                <p className="mt-3 max-w-xl text-sm font-medium leading-7 text-white/80">
                  Chọn giải đấu phù hợp, xem các cặp đấu và bảng xếp hạng công khai, rồi
                  đăng ký thi đấu tại chi nhánh gần bạn.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <SummaryStat label="Giải" value={String(allContests.length)} />
                <SummaryStat
                  label="Đang mở"
                  value={String(openCount)}
                  accent="emerald"
                />
                <SummaryStat
                  label="Đang diễn ra"
                  value={String(liveCount)}
                  accent="orange"
                />
              </div>
            </div>
          </div>
        </div>

        {contestsQuery.isLoading ? (
          <CardListSkeleton
            count={3}
            className="grid gap-6 space-y-0 md:grid-cols-2 lg:grid-cols-3"
            itemClassName="h-96 rounded-2xl"
          />
        ) : (
          <>
            {/* Filter bar */}
            <div className="mb-6 rounded-2xl border border-border bg-card p-4 shadow-sm">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Tìm giải đấu..."
                  className="h-11"
                />
                <select
                  value={formatFilter}
                  onChange={(event) => setFormatFilter(event.target.value)}
                  className="h-11 rounded-xl border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  <option value="">Tất cả thể thức</option>
                  {formatOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {FILTER_OPTIONS.map((option) => (
                  <FilterPill
                    key={option.value}
                    active={statusFilter === option.value}
                    onClick={() => setStatusFilter(option.value)}
                  >
                    {option.label}
                  </FilterPill>
                ))}
              </div>
            </div>

            {rankedContests.length === 0 ? (
              <EmptyState
                icon={ShieldAlert}
                title="Chưa có giải đấu phù hợp"
                description="Thử đổi bộ lọc hoặc quay lại sau để xem giải đấu mới."
                className="rounded-3xl border-2 border-border bg-card p-16 shadow-sm"
              />
            ) : (
              <div className="space-y-6">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-black text-foreground">
                      Tất cả giải đấu
                    </h2>
                    <p className="text-sm font-medium text-muted-foreground">
                      Ưu tiên hiển thị các giải đấu được đăng ký gói phí tổ chức cao hơn từ nhà cung cấp.
                    </p>
                  </div>
                </div>

                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {rankedContests.map((contest) => (
                    <ContestListCard key={contest.id} contest={contest} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </main>
  )
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-4 py-2 text-xs font-bold transition-all",
        active
          ? "bg-primary text-primary-foreground shadow-sm shadow-primary/25"
          : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground",
      )}
    >
      {children}
    </button>
  )
}



function ContestListCard({ contest }: { contest: ContestItem }) {
  const effectiveStatus = getEffectiveContestStatus(contest)
  const registrationAvailability = getContestRegistrationAvailability(contest)
  const remaining = contest.public_stats?.capacity_remaining

  return (
    <Link
      to={routePaths.contestDetail.replace(":contestId", contest.id)}
      className="group flex min-h-full flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-sm transition-all hover:-translate-y-1 hover:border-primary/30 hover:shadow-md"
    >
      <div className="relative h-36 overflow-hidden bg-brand-dark">
        {contest.banner_image_url ? (
          <img
            src={contest.banner_image_url}
            alt={contest.name}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="contest-hero-gradient h-full w-full" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
        <div className="absolute left-4 right-4 top-4 flex items-center justify-between gap-2">
          <span className="inline-flex items-center rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-black uppercase text-foreground shadow-sm">
            {contest.contest_format?.name || "Standard"}
          </span>
          <ContestAvailabilityBadge
            contest={contest}
            className="rounded-full px-2.5 py-1 text-[10px] font-black shadow-sm"
          />
        </div>
        <div className="absolute bottom-4 left-4 right-4 flex items-center gap-1.5 text-white">
          <Award className="size-4 shrink-0" />
          <span className="truncate text-xs font-black">
            {contest.contest_type?.name || "Tự do"}
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <h3 className="line-clamp-2 text-lg font-black text-foreground transition group-hover:text-primary">
          {contest.name}
        </h3>
        <p className="mt-2 line-clamp-2 min-h-10 text-sm font-medium leading-5 text-muted-foreground">
          {contest.description ||
            "Xem thể thức, lịch thi đấu, sơ đồ đấu và kết quả công bố."}
        </p>

        <div className="mt-5 grid gap-2 text-xs font-bold text-muted-foreground">
          <MetaLine
            icon={<MapPin className="size-4 text-red-500" />}
            value={contest.host_branch?.cafe?.name || "Tất cả chi nhánh"}
          />
          <MetaLine
            icon={<Calendar className="size-4 text-muted-foreground" />}
            value={`Bắt đầu ${formatDateTime(contest.starts_at)}`}
          />
          <MetaLine
            icon={<Users className="size-4 text-muted-foreground" />}
            value={`${contest.public_stats?.registration_count ?? 0} đăng ký · ${getCapacityLabel(contest)}`}
          />
        </div>

        {remaining !== null && remaining !== undefined && contest.capacity ? (
          <div className="mt-4">
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              <span>Chỗ còn</span>
              <span>
                {remaining}/{contest.capacity}
              </span>
            </div>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{
                  width: `${Math.min(100, Math.round((remaining / contest.capacity) * 100))}%`,
                }}
              />
            </div>
          </div>
        ) : null}

        <div className="mt-auto pt-5">
          <div className="flex items-center justify-between border-t border-border pt-4">
            <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              Lệ phí
            </span>
            <span className="text-sm font-black text-primary">
              {formatCurrency(contest.entry_fee)}
            </span>
          </div>
          <div className="mt-4 rounded-full bg-foreground px-4 py-2.5 text-center text-xs font-black text-background transition group-hover:bg-primary">
            {getContestCtaLabel(registrationAvailability, effectiveStatus)}
          </div>
        </div>
      </div>
    </Link>
  )
}

function MetaLine({ icon, value }: { icon: ReactNode; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="shrink-0">{icon}</span>
      <span className="truncate">{value}</span>
    </div>
  )
}

function SummaryStat({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent?: "emerald" | "orange"
}) {
  return (
    <div className="min-w-20 rounded-xl border border-white/10 bg-white/10 px-3 py-2 backdrop-blur-sm">
      <p className="text-base font-black text-white">{value}</p>
      <p className="flex items-center justify-center gap-1 text-[10px] font-bold uppercase tracking-wide text-white/70">
        {accent === "emerald" && (
          <CheckCircle2 className="size-3 text-emerald-400" />
        )}
        {accent === "orange" && <Flame className="size-3 text-orange-400" />}
        {label}
      </p>
    </div>
  )
}

function matchesStatusFilter(contest: ContestItem, filter: StatusFilter) {
  if (filter === "all") return true
  const effectiveStatus = getEffectiveContestStatus(contest)
  const availability = getContestRegistrationAvailability(contest)
  if (filter === "live-open") {
    return effectiveStatus === "RUNNING" || availability === "AVAILABLE"
  }
  if (filter === "upcoming") return availability === "NOT_OPEN_YET"
  if (filter === "past") return effectiveStatus === "COMPLETED"
  return true
}

function rankContestsForDiscovery(contests: ContestItem[]) {
  const score = (contest: ContestItem) => {
    const effectiveStatus = getEffectiveContestStatus(contest)
    const availability = getContestRegistrationAvailability(contest)
    if (effectiveStatus === "RUNNING") return 0
    if (availability === "AVAILABLE") return 1
    if (availability === "NOT_OPEN_YET") return 2
    if (effectiveStatus === "COMPLETED") return 3
    return 4
  }

  return [...contests].sort((a, b) => {
    const statusDiff = score(a) - score(b)
    if (statusDiff !== 0) return statusDiff

    // Ưu tiên giải mà Provider chi trả phí tổ chức (provider_fee_amount) cao hơn cho Admin (500k -> 200k -> 150k -> 0k)
    const feeA = Number(a.provider_fee_amount) || 0
    const feeB = Number(b.provider_fee_amount) || 0
    const feeDiff = feeB - feeA
    if (feeDiff !== 0) return feeDiff

    return new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()
  })
}

function getCapacityLabel(contest: ContestItem) {
  const remaining = contest.public_stats?.capacity_remaining
  if (remaining !== null && remaining !== undefined) return `${remaining} chỗ`
  if (contest.capacity) return `${contest.capacity} suất`
  return "Mở"
}

function formatDateTime(value: string | null) {
  if (!value) return "--"
  return new Date(value).toLocaleString("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  })
}

function formatCurrency(value: number) {
  if (value === 0) return "Miễn phí"
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value)
}
