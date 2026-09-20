import { useQuery } from "@tanstack/react-query"
import { Trophy, ArrowRight } from "lucide-react"
import { Link } from "react-router"
import { motion } from "framer-motion"
import { routePaths } from "@/app/router/route-paths"
import { racingApi, racingQueryKeys } from "@/features/racing/api/racing.api"
import { DriverIdentity } from "@/features/racing/components/DriverIdentity"

export function GlobalLeaderboardPreview() {
  const params = {
    period: "all_time" as const,
    limit: 5,
  }

  const { data: rows = [], isLoading } = useQuery({
    queryKey: racingQueryKeys.globalLeaderboard(params),
    queryFn: () => racingApi.listGlobalLeaderboard(params),
  })

  function formatLap(value?: number | null) {
    if (value === null || value === undefined) return "--"
    return `${(value / 1000).toFixed(3)}s`
  }

  return (
    <section className="bg-slate-50 py-24">
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end md:justify-between mb-12">
          <div>
            <p className="mb-3 text-xs font-black uppercase tracking-[0.2em] text-orange-600">
              Mạng lưới đua xe liên kết
            </p>
            <h2 className="text-3xl font-black tracking-tight text-slate-950 md:text-4xl">
              Bảng xếp hạng toàn cầu
            </h2>
            <p className="mt-2 text-sm font-medium text-slate-500 max-w-xl">
              Bảng xếp hạng hợp nhất toàn quốc lưu giữ kỷ lục lap time của các tay đua xuất sắc nhất hệ thống.
            </p>
          </div>
          <Link
            to={routePaths.globalLeaderboard}
            className="group mt-4 inline-flex items-center gap-1 text-sm font-bold text-orange-600 hover:text-orange-700 md:mt-0 transition-colors"
          >
            Xem bảng xếp hạng đầy đủ
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>

        {/* Leaderboard Table/Cards */}
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-2xl bg-slate-200/60" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center">
            <Trophy className="mx-auto h-12 w-12 text-slate-300 mb-3" />
            <p className="text-slate-400 font-semibold">Chưa có thông tin bảng xếp hạng.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-3xl border border-slate-200/60 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50">
                  <tr className="text-left text-xs font-black uppercase tracking-wide text-slate-400">
                    <th className="px-6 py-4 w-20">Hạng</th>
                    <th className="px-6 py-4">Tay đua</th>
                    <th className="px-6 py-4">Cơ sở</th>
                    <th className="px-6 py-4">Loại xe</th>
                    <th className="px-6 py-4 text-right">Vòng nhanh nhất</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.slice(0, 5).map((entry, index) => {
                    const rankBg =
                      entry.rank === 1
                        ? "bg-amber-500 text-white font-black shadow-md shadow-amber-500/20"
                        : entry.rank === 2
                        ? "bg-slate-300 text-slate-800 font-black shadow-md shadow-slate-300/20"
                        : entry.rank === 3
                        ? "bg-amber-700 text-white font-black shadow-md shadow-amber-700/20"
                        : "bg-slate-100 text-slate-600 font-bold"

                    return (
                      <motion.tr
                        key={entry.id}
                        initial={{ opacity: 0, x: -15 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: index * 0.08, duration: 0.4 }}
                        className="align-middle hover:bg-slate-50/50 transition-colors"
                      >
                        {/* Rank */}
                        <td className="px-6 py-4">
                          <div className={`flex size-8 items-center justify-center rounded-full text-xs ${rankBg}`}>
                            {entry.rank}
                          </div>
                        </td>

                        {/* Driver */}
                        <td className="px-6 py-4">
                          <DriverIdentity
                            name={entry.display_name}
                            avatarUrl={entry.avatar_url}
                            titleLabel={entry.current_title?.label}
                            titleCode={entry.current_title?.code}
                            handle={entry.driver_handle ?? undefined}
                            size="sm"
                          />
                        </td>

                        {/* Cafe */}
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="font-bold text-slate-800">{entry.cafe.name}</span>
                            <span className="text-2xs font-semibold text-slate-400">{entry.cafe.city}</span>
                          </div>
                        </td>

                        {/* Vehicle Source */}
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center rounded-lg px-2.5 py-0.5 text-2xs font-bold tracking-wider ${
                            entry.vehicle_source === "RENTAL"
                              ? "bg-orange-50 text-orange-600"
                              : "bg-emerald-50 text-emerald-600"
                          }`}>
                            {entry.vehicle_source}
                          </span>
                        </td>

                        {/* Best Lap */}
                        <td className="px-6 py-4 text-right">
                          <span className="text-base font-black text-orange-600">
                            {formatLap(entry.best_lap_ms)}
                          </span>
                        </td>
                      </motion.tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
