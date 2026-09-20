import { useMemo } from "react"
import { Trophy } from "lucide-react"

import { getLeaderboardModeLabel } from "@/features/contests/lib/contest-status"

import {
  formatContestDateTime,
  formatDurationSeconds,
  getMatchParticipantName,
} from "@/features/contests/lib/contest-runtime"
import type {
  ContestLeaderboardPayload,
  ContestMatch,
} from "@/features/contests/types"
import { DriverIdentity } from "@/features/racing/components/DriverIdentity"
import { Card } from "@/shared/ui/card"
import { EmptyState } from "@/shared/ui/empty-state"

import { Info } from "./DetailPrimitives"

export function ContestLeaderboardSection({
  leaderboard,
  matches,
}: {
  leaderboard: ContestLeaderboardPayload | null
  matches: ContestMatch[]
}) {
  const participantNameByRegistrationId = useMemo(() => {
    const names = new Map<string, string>()
    for (const match of matches) {
      for (const participant of match.participants) {
        const name = getMatchParticipantName(participant)
        if (!name.startsWith("Registration ")) {
          names.set(participant.registration_id, name)
        }
      }
    }
    return names
  }, [matches])

  return (
    <Card className="rounded-3xl border border-slate-200/80 p-6 sm:p-8 shadow-sm">
      <div className="flex items-center gap-2">
        <Trophy className="size-5 text-orange-500" />
        <h3 className="text-lg font-extrabold text-slate-900">
          Bảng xếp hạng công bố
        </h3>
      </div>
      <p className="mt-2 text-sm text-slate-500">
        Bảng xếp hạng chỉ hiển thị khi provider đã publish kết quả chính thức.
      </p>

      {!leaderboard?.entries?.length ? (
        <EmptyState
          title="Giải đấu này chưa công bố bảng xếp hạng."
          className="mt-5 rounded-2xl border-slate-200 p-6"
        />
      ) : (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <Info
              label="Chế độ xếp hạng"
              value={getLeaderboardModeLabel(leaderboard.mode)}
            />
            <Info
              label="Số người trên bảng"
              value={String(leaderboard.entries.length)}
            />
            <Info
              label="Công bố lúc"
              value={formatContestDateTime(leaderboard.published_at)}
            />
          </div>
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-extrabold uppercase tracking-wider text-slate-400">
                  <th className="pb-3">Hạng</th>
                  <th className="pb-3">Người chơi</th>
                  <th className="pb-3">Thắng</th>
                  <th className="pb-3">Lap tốt nhất</th>
                  <th className="pb-3">Tổng thời gian</th>
                  <th className="pb-3">Số trận</th>
                  <th className="pb-3">Vòng cao nhất</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {leaderboard.entries.map((entry) => (
                  <tr key={entry.registration_id}>
                    <td className="py-3 font-black text-slate-900">
                      {entry.rank}
                    </td>
                    <td className="py-3">
                      <DriverIdentity
                        name={
                          entry.display_name ??
                          participantNameByRegistrationId.get(
                            entry.registration_id,
                          ) ??
                          `Ngườii chơi #${entry.registration_id.slice(0, 8)}`
                        }
                        avatarUrl={entry.avatar_url}
                        titleLabel={entry.driver_title_label}
                        handle={entry.driver_handle ?? undefined}
                        size="sm"
                      />
                    </td>
                    <td className="py-3 text-slate-600">{entry.wins}</td>
                    <td className="py-3 text-slate-600">
                      {formatDurationSeconds(entry.best_lap_seconds)}
                    </td>
                    <td className="py-3 text-slate-600">
                      {formatDurationSeconds(entry.total_time_seconds)}
                    </td>
                    <td className="py-3 text-slate-600">
                      {entry.matches_completed}
                    </td>
                    <td className="py-3 text-slate-600">
                      {entry.progressed_round}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  )
}
