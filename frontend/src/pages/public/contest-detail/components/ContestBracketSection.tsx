import { Swords, Timer, Trophy } from "lucide-react"

import {
  formatContestDateTime,
  formatDurationSeconds,
  formatMatchLabel,
  getMatchParticipantName,
  getQualifyingStandings,
  isQualifyingFinalFormat,
  splitMatchesByPhase,
} from "@/features/contests/lib/contest-runtime"
import { getContestStatusLabel } from "@/features/contests/lib/contest-status"
import type {
  ContestHighlightRound,
  ContestItem,
  ContestMatch,
  ContestMatchParticipant,
  ContestRegistration,
} from "@/features/contests/types"
import { DriverTitleChip } from "@/features/racing/components/DriverTitleChip"
import { cn } from "@/shared/lib/utils"
import { Card } from "@/shared/ui/card"
import { EmptyState } from "@/shared/ui/empty-state"
import { CardListSkeleton } from "@/shared/ui/loading-state"

import { Info } from "./DetailPrimitives"

export function ContestRuntimeOverview({
  effectiveStatus,
  runtimeSummary,
  highlightRounds,
}: {
  effectiveStatus: ContestItem["status"]
  runtimeSummary: ContestItem["runtime_summary"]
  highlightRounds: ContestHighlightRound[]
}) {
  return (
    <>
      <Card className="rounded-3xl border border-slate-200/80 p-6 sm:p-8 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-extrabold text-slate-900">
              Theo dõi các vòng đấu
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Ai cũng xem được sơ đồ đấu, danh sách người đi tiếp và lịch sử thi
              đấu khi giải đang diễn ra hoặc đã hoàn thành.
            </p>
          </div>
          <span className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-bold text-orange-700">
            {getContestStatusLabel(effectiveStatus)}
          </span>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-4">
          <Info
            label="Tổng số trận"
            value={String(runtimeSummary?.total_matches ?? 0)}
          />
          <Info
            label="Tổng số vòng"
            value={String(runtimeSummary?.total_rounds ?? 0)}
          />
          <Info
            label="Vòng hiện tại"
            value={
              runtimeSummary?.current_round_no
                ? `Vòng ${runtimeSummary.current_round_no}`
                : "--"
            }
          />
          <Info
            label="Đã hoàn thành"
            value={String(runtimeSummary?.completed_matches ?? 0)}
          />
        </div>
      </Card>

      <Card className="rounded-3xl border border-slate-200/80 p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <Trophy className="size-5 text-orange-500" />
          <h3 className="text-lg font-extrabold text-slate-900">
            Người đã vào vòng trong
          </h3>
        </div>
        <div className="mt-5 space-y-4">
          {highlightRounds.length === 0 ? (
            <EmptyState
              title="Chưa có dữ liệu vòng đấu nổi bật để hiển thị."
              className="rounded-2xl border-slate-200 p-5"
            />
          ) : (
            highlightRounds.map((round) => (
              <div
                key={round.round_no}
                className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-extrabold text-slate-900">
                      {round.label || `Vòng ${round.round_no}`}
                    </p>
                    <p className="text-xs font-semibold text-slate-500">
                      {round.completed_match_count}/{round.match_count} trận đã
                      chốt kết quả
                    </p>
                  </div>
                  <span className="rounded-full bg-slate-900 px-3 py-1 text-[11px] font-bold text-white">
                    {round.winners.length} người đi tiếp
                  </span>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {round.winners.map((winner) => (
                    <div
                      key={`${round.round_no}-${winner.registration_id}`}
                      className="rounded-xl border border-orange-100 bg-white p-3"
                    >
                      <p className="font-bold text-slate-900">
                        {winner.participant_name ??
                          winner.participant_email ??
                          `Registration ${winner.registration_id.slice(0, 8)}`}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Đi tiếp từ{" "}
                        {winner.source_match_name ?? "trận đã hoàn thành"}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    </>
  )
}

export function ContestBracketBoard({
  matches,
  groupedMatches,
  existingRegistration,
  loading,
  format,
}: {
  matches: ContestMatch[]
  groupedMatches: Array<{ roundNo: number; matches: ContestMatch[] }>
  existingRegistration: ContestRegistration | null
  loading: boolean
  format?: string
}) {
  if (isQualifyingFinalFormat(format)) {
    return (
      <QualifyingFinalBracketBoard
        matches={matches}
        existingRegistration={existingRegistration}
        loading={loading}
      />
    )
  }

  return (
    <Card className="rounded-3xl border border-slate-200/80 p-6 sm:p-8 shadow-sm">
      <div className="flex items-center gap-2 text-slate-900">
        <Swords className="size-5 text-orange-500" />
        <h3 className="text-lg font-extrabold">Sơ đồ thi đấu</h3>
      </div>
      <p className="mt-2 text-sm text-slate-500">
        Người thắng mỗi trận đi tiếp sang nhánh bên phải. Trận có bạn thi đấu
        được viền cam để dễ lần theo đường mình đã đi.
      </p>

      <div className="mt-5">
        {loading ? (
          <CardListSkeleton
            count={3}
            className="grid gap-4 space-y-0 lg:grid-cols-3"
            itemClassName="h-72 rounded-2xl"
          />
        ) : matches.length === 0 ? (
          <EmptyState
            title="Giải đấu này chưa công bố trận nào trên sơ đồ đấu."
            className="rounded-2xl border-slate-200 p-6"
          />
        ) : (
          <BracketRoundColumns
            groups={groupedMatches}
            existingRegistration={existingRegistration}
          />
        )}
      </div>
    </Card>
  )
}

function QualifyingFinalBracketBoard({
  matches,
  existingRegistration,
  loading,
}: {
  matches: ContestMatch[]
  existingRegistration: ContestRegistration | null
  loading: boolean
}) {
  const { qualifying, final } = splitMatchesByPhase(matches)
  const standings = getQualifyingStandings(qualifying)
  const finalGroups = groupMatchesByRoundLocal(final)

  return (
    <>
      <Card className="rounded-3xl border border-slate-200/80 p-6 sm:p-8 shadow-sm">
        <div className="flex items-center gap-2 text-slate-900">
          <Timer className="size-5 text-orange-500" />
          <h3 className="text-lg font-extrabold">Vòng loại (Qualifying)</h3>
        </div>
        <p className="mt-2 text-sm text-slate-500">
          Mỗi VĐV chạy một lượt tính giờ, xếp hạng theo lap tốt nhất. Các VĐV
          đứng đầu bảng sẽ vào nhánh chung kết knockout.
        </p>

        <div className="mt-5">
          {loading ? (
            <CardListSkeleton
              count={2}
              className="grid gap-4 space-y-0 lg:grid-cols-2"
              itemClassName="h-40 rounded-2xl"
            />
          ) : standings.length === 0 ? (
            <EmptyState
              title="Chưa có kết quả vòng loại nào được công bố."
              className="rounded-2xl border-slate-200 p-6"
            />
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/60 text-left text-xs font-extrabold uppercase tracking-wider text-slate-400">
                    <th className="px-4 py-3">Hạng</th>
                    <th className="px-4 py-3">VĐV</th>
                    <th className="px-4 py-3">Lap tốt nhất</th>
                    <th className="px-4 py-3">Tổng thời gian</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {standings.map((standing, index) => {
                    const isMine =
                      standing.participant.registration?.is_my_registration ||
                      standing.registrationId === existingRegistration?.id
                    return (
                      <tr
                        key={standing.registrationId}
                        className={isMine ? "bg-orange-50/60" : undefined}
                      >
                        <td className="px-4 py-3 font-bold text-slate-900">
                          {index + 1}
                        </td>
                        <td className="px-4 py-3">
                          <span className="flex flex-wrap items-center gap-2 font-bold text-slate-900">
                            {getMatchParticipantName(standing.participant)}
                            <DriverTitleChip
                              label={
                                standing.participant.registration
                                  ?.driver_title_label
                              }
                            />
                          </span>
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-600">
                          {formatDurationSeconds(standing.bestLapSeconds)}
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-600">
                          {formatDurationSeconds(standing.totalTimeSeconds)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      <Card className="rounded-3xl border border-slate-200/80 p-6 sm:p-8 shadow-sm">
        <div className="flex items-center gap-2 text-slate-900">
          <Swords className="size-5 text-orange-500" />
          <h3 className="text-lg font-extrabold">Chung kết (Final)</h3>
        </div>
        <p className="mt-2 text-sm text-slate-500">
          Nhánh knockout dành cho các VĐV vượt qua vòng loại, xếp seed theo hạng
          qualifying.
        </p>

        <div className="mt-5">
          {loading ? (
            <CardListSkeleton
              count={3}
              className="grid gap-4 space-y-0 lg:grid-cols-3"
              itemClassName="h-72 rounded-2xl"
            />
          ) : final.length === 0 ? (
            <EmptyState
              title="Chưa có nhánh chung kết. Ban tổ chức sẽ công bố sau khi vòng loại kết thúc."
              className="rounded-2xl border-slate-200 p-6"
            />
          ) : (
            <BracketRoundColumns
              groups={finalGroups}
              existingRegistration={existingRegistration}
            />
          )}
        </div>
      </Card>
    </>
  )
}

function groupMatchesByRoundLocal(matches: ContestMatch[]) {
  return matches.reduce<Array<{ roundNo: number; matches: ContestMatch[] }>>(
    (groups, match) => {
      const group = groups.find((item) => item.roundNo === match.round_no)
      if (group) {
        group.matches.push(match)
        return groups
      }
      groups.push({ roundNo: match.round_no, matches: [match] })
      return groups
    },
    [],
  )
}

/**
 * Sơ đồ đấu cho khách xem.
 *
 * Khác bản của ban tổ chức ở mục đích: bên đó là bàn làm việc — thẻ nhỏ, dày
 * đặc, bấm để nhập kết quả. Bên này là thứ để khoe: người thắng nổi bật bằng
 * nền chuyển sắc, người thua mờ đi, và trận của chính bạn được viền cam để
 * lướt mắt là thấy ngay đường mình đã đi.
 */
const CONNECTOR = 26
const COLUMN_WIDTH = 268

function getPublicRoundName(roundIndex: number, totalRounds: number): string {
  const fromFinal = totalRounds - 1 - roundIndex
  if (fromFinal === 0) return "Chung kết"
  if (fromFinal === 1) return "Bán kết"
  if (fromFinal === 2) return "Tứ kết"
  if (fromFinal === 3) return "Vòng 1/8"
  return `Vòng ${roundIndex + 1}`
}

function BracketRoundColumns({
  groups,
  existingRegistration,
}: {
  groups: Array<{ roundNo: number; matches: ContestMatch[] }>
  existingRegistration: ContestRegistration | null
}) {
  const bracketGroups = groups
    .map((group) => ({
      ...group,
      matches: group.matches.filter(
        (match) => match.metadata?.third_place !== true,
      ),
    }))
    .filter((group) => group.matches.length > 0)
  const thirdPlaceMatch = groups
    .flatMap((group) => group.matches)
    .find((match) => match.metadata?.third_place === true)
  const totalRounds = bracketGroups.length

  return (
    <div className="space-y-6">
      <div className="overflow-x-auto pb-2">
        <div className="min-w-max">
          <div className="mb-3 flex" style={{ gap: CONNECTOR * 2 }}>
            {bracketGroups.map((group, roundIndex) => {
              const isFinal = roundIndex === totalRounds - 1
              return (
                <div
                  key={group.roundNo}
                  className="shrink-0 text-center"
                  style={{ width: COLUMN_WIDTH }}
                >
                  <p
                    className={cn(
                      "text-xs font-black uppercase tracking-[0.18em]",
                      isFinal ? "text-orange-600" : "text-slate-400",
                    )}
                  >
                    {getPublicRoundName(roundIndex, totalRounds)}
                  </p>
                </div>
              )
            })}
          </div>

          <div className="flex items-stretch" style={{ gap: CONNECTOR * 2 }}>
            {bracketGroups.map((group, roundIndex) => {
              const isLastRound = roundIndex === bracketGroups.length - 1
              return (
                <div
                  key={group.roundNo}
                  className="flex shrink-0 flex-col"
                  style={{ width: COLUMN_WIDTH }}
                >
                  {group.matches.map((match, matchIndex) => (
                    <div
                      key={match.id}
                      className="relative flex flex-1 items-center"
                    >
                      <BracketMatchCard
                        match={match}
                        existingRegistration={existingRegistration}
                        isFinal={isLastRound}
                      />

                      {isLastRound ? null : (
                        <span
                          aria-hidden
                          className="absolute top-1/2 border-t-2 border-slate-200"
                          style={{ right: -CONNECTOR, width: CONNECTOR }}
                        />
                      )}
                      {isLastRound || matchIndex % 2 === 1 ? null : (
                        <span
                          aria-hidden
                          className="absolute top-1/2 h-full border-l-2 border-slate-200"
                          style={{ right: -CONNECTOR }}
                        />
                      )}
                      {roundIndex === 0 ? null : (
                        <span
                          aria-hidden
                          className="absolute top-1/2 border-t-2 border-slate-200"
                          style={{ left: -CONNECTOR, width: CONNECTOR }}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {thirdPlaceMatch ? (
        <div className="border-t border-slate-200 pt-5">
          <p className="mb-3 text-xs font-black uppercase tracking-[0.18em] text-slate-400">
            Tranh hạng 3
          </p>
          <div className="max-w-[268px]">
            <BracketMatchCard
              match={thirdPlaceMatch}
              existingRegistration={existingRegistration}
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}

function BracketMatchCard({
  match,
  existingRegistration,
  isFinal = false,
}: {
  match: ContestMatch
  existingRegistration: ContestRegistration | null
  isFinal?: boolean
}) {
  const hasMyParticipant = match.participants.some(
    (participant) =>
      participant.registration?.is_my_registration ||
      participant.registration_id === existingRegistration?.id,
  )
  const isBye = match.metadata?.bye === true
  const isEmpty = match.metadata?.empty_slot === true

  return (
    <article
      className={cn(
        "w-full overflow-hidden rounded-2xl border shadow-sm transition",
        hasMyParticipant
          ? "border-orange-300 ring-2 ring-orange-100"
          : isFinal
            ? "border-amber-200"
            : "border-slate-200",
        isEmpty ? "opacity-55" : "",
      )}
    >
      <div
        className={cn(
          "flex items-center justify-between gap-2 px-3.5 py-2",
          isFinal
            ? "bg-gradient-to-r from-amber-50 to-orange-50"
            : "bg-slate-50/80",
        )}
      >
        <p className="truncate text-xs font-black text-slate-900">
          {isFinal ? (
            <Trophy className="mr-1 inline size-3.5 text-amber-500" />
          ) : null}
          {formatMatchLabel(match)}
        </p>
        <span className="shrink-0 text-[11px] font-bold text-slate-400">
          {isEmpty ? "—" : formatContestDateTime(match.scheduled_at)}
        </span>
      </div>

      <div className="divide-y divide-slate-100 bg-white">
        {[0, 1].map((slotIndex) => {
          const participant = match.participants[slotIndex]
          if (!participant) {
            return (
              <p
                key={slotIndex}
                className="px-3.5 py-2.5 text-xs font-semibold italic text-slate-300"
              >
                {isEmpty
                  ? "Ô trống"
                  : isBye
                    ? "Không có đối thủ"
                    : "Chờ vòng trước"}
              </p>
            )
          }
          return (
            <BracketParticipantRow
              key={participant.id}
              participant={participant}
              decided={match.status === "COMPLETED"}
              highlight={
                participant.registration?.is_my_registration ||
                participant.registration_id === existingRegistration?.id
              }
            />
          )
        })}
      </div>
    </article>
  )
}

function BracketParticipantRow({
  participant,
  highlight = false,
  decided = false,
}: {
  participant: ContestMatchParticipant
  highlight?: boolean
  decided?: boolean
}) {
  const won = participant.is_winner === true
  // Chỉ làm mờ người thua khi trận đã ngã ngũ; trận chưa đấu mà đã mờ một bên
  // thì trông như đã có kết quả.
  const lost = decided && !won

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3.5 py-2.5",
        won ? "bg-gradient-to-r from-emerald-50 to-transparent" : "",
        highlight && !won ? "bg-orange-50/60" : "",
      )}
    >
      {won ? (
        <Trophy className="size-3.5 shrink-0 text-emerald-600" />
      ) : (
        <span className="size-3.5 shrink-0" />
      )}
      <p
        className={cn(
          "min-w-0 flex-1 truncate text-sm",
          won
            ? "font-black text-emerald-900"
            : lost
              ? "font-semibold text-slate-400"
              : "font-bold text-slate-800",
        )}
      >
        {getMatchParticipantName(participant)}
      </p>
      <DriverTitleChip
        label={participant.registration?.driver_title_label}
        className="shrink-0 px-1.5 py-0 text-[9px]"
      />
      {highlight ? (
        <span className="shrink-0 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-black text-orange-700">
          Bạn
        </span>
      ) : null}
    </div>
  )
}
