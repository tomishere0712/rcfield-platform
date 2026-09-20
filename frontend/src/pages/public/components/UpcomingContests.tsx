import { useQuery } from "@tanstack/react-query"
import { Calendar, MapPin, Users, Trophy, ArrowRight } from "lucide-react"
import { Link } from "react-router"
import { motion } from "framer-motion"
import { routePaths } from "@/app/router/route-paths"
import { contestApi, contestQueryKeys } from "@/features/contests/api/contest.api"
import { ContestAvailabilityBadge } from "@/features/contests/components"
import { CardListSkeleton } from "@/shared/ui/loading-state"

export function UpcomingContests() {
  const { data: contestsResponse, isLoading } = useQuery({
    queryKey: contestQueryKeys.list({ public: true, limit: 3 }),
    queryFn: () => contestApi.listContests({ limit: 10 }),
  })

  const contests = contestsResponse?.data ?? []

  const upcomingContests = contests
    .filter((c) => {
      const status = c.status
      return status === "OPEN" || status === "RUNNING"
    })
    .slice(0, 3)

  const formatDateTime = (value: string | null) => {
    if (!value) return "--"
    return new Date(value).toLocaleString("vi-VN", {
      dateStyle: "short",
      timeStyle: "short",
    })
  }

  const formatCurrency = (value: number) => {
    if (value === 0) return "Miễn phí"
    return new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: "VND",
      maximumFractionDigits: 0,
    }).format(value)
  }

  if (!isLoading && upcomingContests.length === 0) {
    return null
  }

  return (
    <section className="relative overflow-hidden bg-brand-dark py-24 text-white">
      {/* Ambient backgrounds */}
      <div className="pointer-events-none absolute -top-40 -left-40 size-96 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 size-96 rounded-full bg-accent/10 blur-3xl" />

      <div className="relative mx-auto max-w-7xl px-4 md:px-6">
        {/* Header */}
        <div className="mb-12 flex flex-col md:flex-row md:items-end md:justify-between">
          <div>
            <p className="mb-3 text-xs font-black uppercase tracking-[0.2em] text-primary">
              Hệ thống tranh tài
            </p>
            <h2 className="text-3xl font-black tracking-tight text-white md:text-4xl">
              Giải đấu sắp diễn ra
            </h2>
            <p className="mt-2 max-w-xl text-sm font-medium text-white/70">
              Đăng ký tranh tài cùng các đối thủ xứng tầm, tích lũy điểm hệ số để nâng hạng và danh hiệu trên BXH.
            </p>
          </div>
          <Link
            to={routePaths.contests}
            className="group mt-4 inline-flex items-center gap-1 text-sm font-bold text-primary transition-colors hover:text-brand-amber md:mt-0"
          >
            Xem tất cả giải đấu
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>

        {/* List */}
        {isLoading ? (
          <CardListSkeleton
            count={3}
            className="grid gap-6 space-y-0 sm:grid-cols-2 lg:grid-cols-3"
            itemClassName="h-80 rounded-3xl bg-secondary/50"
          />
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {upcomingContests.map((contest, index) => {
              return (
                <motion.div
                  key={contest.id}
                  initial={{ opacity: 0, y: 25 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1, duration: 0.5 }}
                  whileHover={{ y: -5 }}
                >
                  <Link
                    to={routePaths.contestDetail.replace(":contestId", contest.id)}
                    className="group flex flex-col justify-between overflow-hidden rounded-3xl border border-white/10 bg-secondary p-6 shadow-xl transition hover:border-primary/30"
                  >
                    <div className="space-y-4">
                      {/* Format + Status Badges */}
                      <div className="flex items-center justify-between">
                        <span className="rounded-lg border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-2xs font-extrabold uppercase tracking-wider text-primary">
                          {contest.contest_format?.name || "GP Series"}
                        </span>
                        <ContestAvailabilityBadge
                          contest={contest}
                          className="rounded-full border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-2xs font-extrabold uppercase tracking-wider text-emerald-400"
                        />
                      </div>

                      {/* Title */}
                      <div>
                        <h3 className="line-clamp-1 text-lg font-black text-white leading-snug transition-colors group-hover:text-primary">
                          {contest.name}
                        </h3>
                        <p className="mt-1.5 line-clamp-2 min-h-[2rem] text-xs text-white/60">
                          {contest.description || "Giải đấu kịch tính được tổ chức định kỳ."}
                        </p>
                      </div>

                      {/* Details Info */}
                      <div className="space-y-2 border-t border-white/10 pt-4 text-xs font-semibold text-white/70">
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 shrink-0 text-red-400" />
                          <span className="truncate">
                            {contest.host_branch?.cafe?.name || "Toàn quốc"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 shrink-0 text-brand-amber" />
                          <span>Bắt đầu: {formatDateTime(contest.starts_at)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 shrink-0 text-emerald-400" />
                          <span>Giới hạn: {contest.capacity} racer</span>
                        </div>
                      </div>
                    </div>

                    {/* Pricing / Booking button */}
                    <div className="mt-6 flex items-center justify-between border-t border-white/10 pt-4">
                      <div>
                        <span className="block text-3xs font-extrabold uppercase tracking-wider text-white/50">
                          Lệ phí
                        </span>
                        <span className="text-base font-black text-primary">
                          {formatCurrency(contest.entry_fee)}
                        </span>
                      </div>

                      <span className="inline-flex h-9 items-center gap-1 rounded-xl bg-primary px-4 text-xs font-bold text-primary-foreground transition hover:bg-brand-amber hover:text-accent-foreground active:scale-95">
                        <Trophy className="h-3.5 w-3.5" />
                        Chi tiết
                      </span>
                    </div>
                  </Link>
                </motion.div>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
