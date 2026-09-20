import { useMemo } from "react"
import { Check, ChevronRight, Timer, Trophy } from "lucide-react"
import { toast } from "sonner"

import { useGenerateFinalBracket } from "@/features/contests/hooks/use-contest-booking"
import {
  areAllMatchesCompleted,
  formatContestDateTime,
  formatDurationSeconds,
  getErrorMessage,
  getMatchParticipantName,
  getQualifyingStandings,
  splitMatchesByPhase,
} from "@/features/contests/lib/contest-runtime"
import {
  getMatchStatusClass,
  getMatchStatusLabel,
} from "@/features/contests/lib/contest-status"
import type { ContestItem, ContestMatch } from "@/features/contests/types"
import { DriverTitleChip } from "@/features/racing/components/DriverTitleChip"
import { cn } from "@/shared/lib/utils"
import { Badge } from "@/shared/ui/badge"
import { Button } from "@/shared/ui/button"
import { ConfirmDialog } from "@/shared/ui/confirm-dialog"
import {
  Panel,
  PanelTitle,
} from "@/pages/provider/components/ProviderPrimitives"

import { ContestKnockoutBracket } from "./ContestKnockoutBracket"
import type { AdvanceSubmitData } from "./ContestBracketAdvanceModal"

type GrandPrixFlowProps = {
  contest: ContestItem
  matches: ContestMatch[]
  selectedMatchId: string | null
  onSelectMatch: (matchId: string) => void
  onStageAdvance: (
    sourceMatchId: string,
    targetMatchId: string,
    registrationId: string,
    submitResult?: AdvanceSubmitData["submitResult"],
  ) => void
  onUndo: () => void
  onCommit: () => void
  canUndo: boolean
  hasChanges: boolean
}

export function ContestGrandPrixFlow({
  contest,
  matches,
  selectedMatchId,
  onSelectMatch,
  onStageAdvance,
  onUndo,
  onCommit,
  canUndo,
  hasChanges,
}: GrandPrixFlowProps) {
  const { qualifying, final } = useMemo(
    () => splitMatchesByPhase(matches),
    [matches],
  )
  const standings = useMemo(
    () => getQualifyingStandings(qualifying),
    [qualifying],
  )
  const finalistsCount = Math.max(
    2,
    Number(contest.config?.finalists ?? 4) || 4,
  )
  const topFinalists = standings.slice(0, finalistsCount)
  const qualifyingDone = areAllMatchesCompleted(qualifying)
  const completedQualifying = qualifying.filter(
    (match) => match.status === "COMPLETED",
  ).length
  const finalRounds = [...new Set(final.map((match) => match.round_no))].sort(
    (a, b) => a - b,
  )
  const semifinalMatches = final.filter(
    (match) => match.round_no === finalRounds[0],
  )
  const championshipMatches = final.filter(
    (match) =>
      match.round_no === finalRounds.at(-1) &&
      match.metadata?.third_place !== true,
  )
  const semifinalsDone = areAllMatchesCompleted(semifinalMatches)
  const championshipDone = areAllMatchesCompleted(championshipMatches)
  const generateFinalBracket = useGenerateFinalBracket()
  const canGenerateFinal =
    qualifyingDone && topFinalists.length >= 2 && final.length === 0

  const generateHint =
    final.length > 0
      ? "Nhánh top 4 đã được tạo từ kết quả vòng loại."
      : qualifying.length === 0
        ? "Tạo lượt vòng loại trước để bắt đầu giải."
        : !qualifyingDone
          ? `Còn ${qualifying.length - completedQualifying} lượt vòng loại chưa hoàn tất.`
          : topFinalists.length < 2
            ? "Cần ít nhất 2 VĐV có thành tích hợp lệ."
            : `Top ${topFinalists.length} đã sẵn sàng vào nhánh chung kết.`

  const handleGenerateFinal = async () => {
    try {
      await generateFinalBracket.mutateAsync(contest.id)
      toast.success("Đã sinh nhánh chung kết Grand Prix")
    } catch (error) {
      toast.error("Không thể sinh nhánh chung kết", {
        description: getErrorMessage(error).message,
      })
    }
  }

  const steps = [
    {
      label: "Vòng loại",
      helper: qualifying.length
        ? `${completedQualifying}/${qualifying.length} lượt hoàn tất`
        : "Chưa tạo lượt",
      done: qualifyingDone,
      active: !qualifyingDone,
    },
    {
      label: `Top ${finalistsCount} · Bán kết`,
      helper: final.length
        ? `${semifinalMatches.filter((match) => match.status === "COMPLETED").length}/${semifinalMatches.length} trận hoàn tất`
        : "Chờ kết quả vòng loại",
      done: semifinalsDone,
      active: qualifyingDone && !semifinalsDone,
    },
    {
      label: "Chung kết",
      helper: championshipDone
        ? "Đã xác định nhà vô địch"
        : semifinalsDone
          ? "Sẵn sàng tranh cúp"
          : "Chờ bán kết",
      done: championshipDone,
      active: semifinalsDone && !championshipDone,
    },
  ]

  return (
    <div className="space-y-4">
      <Panel>
        <PanelTitle
          title="Lộ trình Grand Prix"
          subtitle="Theo dõi liền mạch từ vòng loại tính giờ đến nhánh top 4 và trận chung kết."
        />

        <ol
          className="grid gap-2 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-center"
          aria-label="Tiến trình Grand Prix"
        >
          {steps.map((step, index) => (
            <GrandPrixStep key={step.label} index={index} {...step} />
          ))}
        </ol>
      </Panel>

      <Panel>
        <PanelTitle
          title="Vòng loại tính giờ"
          subtitle={`Mỗi VĐV lấy thành tích tốt nhất; ${finalistsCount} người đứng đầu đi tiếp theo seed 1–${finalistsCount}.`}
          action={
            <div className="flex max-w-sm flex-col items-end gap-1.5 text-right">
              <ConfirmDialog
                title="Sinh nhánh chung kết?"
                description={`Hệ thống lấy top ${topFinalists.length} VĐV có thành tích hợp lệ và xếp seed theo đúng kết quả vòng loại.`}
                confirmLabel="Sinh nhánh chung kết"
                pendingLabel="Đang sinh nhánh..."
                trigger={
                  <Button
                    type="button"
                    className="h-10 gap-2 rounded-lg bg-[#1c1b1b] text-white hover:bg-[#313030]"
                    disabled={
                      !canGenerateFinal || generateFinalBracket.isPending
                    }
                  >
                    <Trophy className="size-4" />
                    Sinh nhánh top {finalistsCount}
                  </Button>
                }
                onConfirm={handleGenerateFinal}
              />
              <p
                className="text-xs font-semibold text-[#747878]"
                aria-live="polite"
              >
                {generateHint}
              </p>
            </div>
          }
        />

        {topFinalists.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#c4c7c8] px-4 py-8 text-center">
            <Timer className="mx-auto size-7 text-[#b0b4b4]" />
            <p className="mt-2 text-sm font-bold text-[#747878]">
              Chưa có thành tích vòng loại hợp lệ.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {topFinalists.map((standing, index) => (
              <article
                key={standing.registrationId}
                className="rounded-xl border border-[#e5e2e1] bg-white p-3 transition-colors hover:border-orange-200"
              >
                <div className="flex items-center justify-between gap-2">
                  <Badge className="border border-orange-200 bg-orange-50 font-extrabold text-orange-700">
                    Seed {index + 1}
                  </Badge>
                  <span className="font-mono text-sm font-extrabold tabular-nums text-[#1c1b1b]">
                    {formatDurationSeconds(standing.bestLapSeconds)}
                  </span>
                </div>
                <p className="mt-3 truncate text-sm font-extrabold text-[#1c1b1b]">
                  {getMatchParticipantName(standing.participant)}
                </p>
                <DriverTitleChip
                  label={standing.participant.registration?.driver_title_label}
                  className="mt-1 px-1.5 py-0 text-[9px]"
                />
              </article>
            ))}
          </div>
        )}

        <details
          className="group mt-4 rounded-xl border border-[#e5e2e1] bg-white"
          open
        >
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-extrabold text-[#1c1b1b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400">
            <span>Chi tiết {qualifying.length} lượt vòng loại</span>
            <ChevronRight className="size-4 transition-transform duration-200 group-open:rotate-90 motion-reduce:transition-none" />
          </summary>
          <div className="max-h-[420px] overflow-auto border-t border-[#e5e2e1]">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="sticky top-0 z-10 bg-[#fcf8f8] text-xs font-extrabold uppercase tracking-wider text-[#747878]">
                <tr>
                  <th className="px-3 py-2">Lượt</th>
                  <th className="px-3 py-2">Vận động viên</th>
                  <th className="px-3 py-2">Lịch chạy</th>
                  <th className="px-3 py-2">Lap tốt nhất</th>
                  <th className="px-3 py-2">Trạng thái</th>
                  <th className="px-3 py-2 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0eeee]">
                {qualifying.map((match) => {
                  const runner = match.participants[0]
                  const selected = selectedMatchId === match.id
                  return (
                    <tr
                      key={match.id}
                      className={
                        selected ? "bg-orange-50" : "hover:bg-[#fcf8f8]"
                      }
                    >
                      <td className="px-3 py-2 font-extrabold text-[#1c1b1b]">
                        #{match.match_no}
                      </td>
                      <td className="px-3 py-2 font-semibold text-[#1c1b1b]">
                        {runner ? getMatchParticipantName(runner) : "Chưa gán"}
                      </td>
                      <td className="px-3 py-2 font-semibold text-[#5d5f5f]">
                        {formatContestDateTime(match.scheduled_at)}
                      </td>
                      <td className="px-3 py-2 font-mono font-semibold tabular-nums text-[#5d5f5f]">
                        {formatDurationSeconds(runner?.best_lap_seconds)}
                      </td>
                      <td className="px-3 py-2">
                        <Badge
                          className={cn(
                            "border",
                            getMatchStatusClass(match.status),
                          )}
                        >
                          {getMatchStatusLabel(match.status)}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          type="button"
                          variant="outline"
                          className="h-9 rounded-lg px-3 text-xs font-bold"
                          aria-pressed={selected}
                          onClick={() => onSelectMatch(match.id)}
                        >
                          {selected ? "Đang chọn" : "Nhập kết quả"}
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </details>
      </Panel>

      <ContestKnockoutBracket
        matches={final}
        title="Nhánh chung kết Grand Prix"
        emptyMessage="Hoàn tất vòng loại và sinh nhánh top 4 để bắt đầu bán kết."
        selectedMatchId={selectedMatchId}
        onSelectMatch={onSelectMatch}
        onStageAdvance={onStageAdvance}
        onUndo={onUndo}
        onCommit={onCommit}
        canUndo={canUndo}
        hasChanges={hasChanges}
      />
    </div>
  )
}

function GrandPrixStep({
  index,
  label,
  helper,
  done,
  active,
}: {
  index: number
  label: string
  helper: string
  done: boolean
  active: boolean
}) {
  return (
    <>
      <li
        className={cn(
          "flex min-h-16 items-center gap-3 rounded-xl border px-3 py-2",
          done
            ? "border-emerald-200 bg-emerald-50"
            : active
              ? "border-orange-300 bg-orange-50 ring-2 ring-orange-100"
              : "border-[#e5e2e1] bg-[#fcf8f8]",
        )}
        aria-current={active ? "step" : undefined}
      >
        <span
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-full text-xs font-black",
            done
              ? "bg-emerald-600 text-white"
              : active
                ? "bg-orange-500 text-white"
                : "bg-[#e5e2e1] text-[#747878]",
          )}
        >
          {done ? <Check className="size-4" aria-hidden /> : index + 1}
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-extrabold text-[#1c1b1b]">
            {label}
          </span>
          <span className="block text-xs font-semibold text-[#747878]">
            {helper}
          </span>
        </span>
      </li>
      {index < 2 ? (
        <li className="hidden text-[#b0b4b4] md:block" aria-hidden>
          <ChevronRight className="size-5" />
        </li>
      ) : null}
    </>
  )
}
