import type {
  ContestItem,
  ContestLeaderboardPayload,
  ContestMetrics,
} from "@/features/contests/types"
import {
  Panel,
  PanelTitle,
} from "@/pages/provider/components/ProviderPrimitives"
import { Button } from "@/shared/ui/button"
import { toast } from "sonner"
import {
  formatDurationSeconds,
  getErrorMessage,
} from "@/features/contests/lib/contest-runtime"
import {
  getContestPublishAvailability,
  getLeaderboardModeLabel,
} from "@/features/contests/lib/contest-status"
import type { useContestRuntime } from "@/features/contests/hooks/useContestRuntime"

type RuntimeHook = ReturnType<typeof useContestRuntime>

export function ContestLeaderboardPanel({
  contest,
  leaderboard,
  metrics,
  runtime,
}: {
  contest: ContestItem
  leaderboard: ContestLeaderboardPayload | null
  metrics: ContestMetrics | undefined
  runtime: RuntimeHook
}) {
  // Cửa chặn soi đúng luật backend, kèm lý do cụ thể — trước đây nằm ở nút
  // trùng lặp trên header, giờ về đúng nút thật sự công bố.
  const publishAvailability = getContestPublishAvailability(contest, {
    totalMatches: metrics?.match_counts.total ?? 0,
    unfinishedMatches:
      (metrics?.match_counts.draft ?? 0) +
      (metrics?.match_counts.ready ?? 0) +
      (metrics?.match_counts.running ?? 0),
  })

  const handlePublish = async () => {
    try {
      await runtime.publishLeaderboardMutation.mutateAsync()
      toast.success("Đã công bố bảng xếp hạng")
    } catch (error) {
      toast.error("Không thể công bố bảng xếp hạng", {
        description: getErrorMessage(error).message,
      })
    }
  }

  const handleSync = async () => {
    try {
      const result = await runtime.syncRaceRecordsMutation.mutateAsync()
      toast.success("Đã đồng bộ thành tích lên toàn hệ thống", {
        description: `${result.synced_count} record mới, ${result.superseded_count} record bị thay thế.`,
      })
    } catch (error) {
      toast.error("Không thể đồng bộ thành tích toàn hệ thống", {
        description: getErrorMessage(error).message,
      })
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
      <Panel>
        <PanelTitle
          title="Trạng thái công bố"
          subtitle="Theo dõi bảng xếp hạng nội bộ của giải đấu."
        />
        <div className="space-y-3 text-sm font-semibold text-[#5d5f5f]">
          <StatusRow label="Giải đấu" value={contest.name} />
          <StatusRow
            label="Cách xếp hạng"
            value={getLeaderboardModeLabel(
              leaderboard?.mode ?? metrics?.leaderboard.mode,
            )}
          />
          <StatusRow
            label="Tình trạng công bố"
            value={leaderboard ? "Đã công bố" : "Chưa công bố"}
          />
          <StatusRow
            label="Thời điểm công bố"
            value={leaderboard?.published_at ?? "--"}
          />
          <StatusRow
            label="Dự kiến doanh thu"
            value={formatCurrency(metrics?.revenue?.expected_revenue ?? 0)}
          />
          <StatusRow
            label="Đã thu"
            value={formatCurrency(metrics?.revenue?.paid_revenue ?? 0)}
          />
          <StatusRow
            label="Đồng bộ toàn hệ thống"
            value={metrics?.global_sync.synced ? "Đã đồng bộ" : "Chưa đồng bộ"}
          />
          <StatusRow
            label="Lần đồng bộ gần nhất"
            value={metrics?.global_sync.synced_at ?? "--"}
          />
        </div>
        <Button
          className="mt-4 h-10 rounded-lg bg-[#1c1b1b] text-white hover:bg-[#313030] disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!publishAvailability.allowed}
          onClick={() => void handlePublish()}
        >
          Công bố bảng xếp hạng
        </Button>
        {publishAvailability.allowed ? null : (
          <p className="mt-1.5 text-xs font-semibold text-amber-700">
            {publishAvailability.reason}
          </p>
        )}
        <Button
          variant="outline"
          className="mt-2 h-10 rounded-lg border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100"
          onClick={() => void handleSync()}
          disabled={!leaderboard}
        >
          {metrics?.global_sync.synced
            ? "Đồng bộ lại thành tích"
            : "Đồng bộ lên toàn hệ thống"}
        </Button>
      </Panel>

      <Panel>
        <PanelTitle
          title="Danh sách xếp hạng"
          subtitle="Kết quả hiện tại sau khi công bố bảng xếp hạng."
        />
        {leaderboard?.entries?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="border-b border-[#e5e2e1] text-left text-xs font-extrabold uppercase tracking-wider text-[#747878]">
                  <th className="pb-3">Hạng</th>
                  <th className="pb-3">Người chơi</th>
                  <th className="pb-3">Số trận thắng</th>
                  <th className="pb-3">Lap tốt nhất</th>
                  <th className="pb-3">Tổng thời gian</th>
                  <th className="pb-3">Số trận</th>
                  <th className="pb-3">Vòng cao nhất</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0eeee]">
                {leaderboard.entries.map((entry) => (
                  <tr key={entry.registration_id}>
                    <td className="py-3 font-bold text-[#1c1b1b]">
                      {entry.rank}
                    </td>
                    <td className="py-3">
                      <div className="space-y-1">
                        <p className="font-semibold text-[#1c1b1b]">
                          {entry.display_name ??
                            entry.registration_id.slice(0, 8)}
                        </p>
                        {entry.driver_title_label ? (
                          <p className="text-xs font-bold text-orange-700">
                            {entry.driver_title_label}
                          </p>
                        ) : null}
                      </div>
                    </td>
                    <td className="py-3 text-[#5d5f5f]">{entry.wins}</td>
                    <td className="py-3 text-[#5d5f5f]">
                      {formatDurationSeconds(entry.best_lap_seconds)}
                    </td>
                    <td className="py-3 text-[#5d5f5f]">
                      {formatDurationSeconds(entry.total_time_seconds)}
                    </td>
                    <td className="py-3 text-[#5d5f5f]">
                      {entry.matches_completed}
                    </td>
                    <td className="py-3 text-[#5d5f5f]">
                      {entry.progressed_round}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm font-semibold text-[#747878]">
            Chưa công bố bảng xếp hạng nào.
          </p>
        )}
      </Panel>
    </div>
  )
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-[#e5e2e1] px-3 py-2">
      <span>{label}</span>
      <span className="text-[#1c1b1b]">{value}</span>
    </div>
  )
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value)
}
