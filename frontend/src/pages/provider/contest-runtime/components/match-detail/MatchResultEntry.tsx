import type {
  ContestMatch,
  ContestMatchParticipant,
  ContestWalkoverStatus,
} from "@/features/contests/types"
import type { MatchResultDraft } from "./match-detail-types"
import { MatchKnockoutResultForm } from "./MatchKnockoutResultForm"
import { MatchWalkoverDialog } from "./MatchWalkoverDialog"
import { MatchSubmitResultsForm } from "./MatchSubmitResultsForm"

type EditableResultField =
  | "finish_position"
  | "score"
  | "best_lap_seconds"
  | "total_time_seconds"
  | "is_winner"
  | "result_note"
  | "status"

export function MatchResultEntry({
  match,
  results,
  participantMap,
  isKnockoutRuntime,
  hasPendingBracketChanges,
  onUpdateResult,
  onWalkover,
}: {
  match: ContestMatch
  results: MatchResultDraft[]
  participantMap: Map<string, ContestMatchParticipant>
  isKnockoutRuntime: boolean
  hasPendingBracketChanges: boolean
  onUpdateResult: (
    registrationId: string,
    field: EditableResultField,
    value: number | string | boolean | null,
  ) => void
  onWalkover: (body: {
    absent: Array<{ registration_id: string; status: ContestWalkoverStatus }>
    reason: string
  }) => Promise<unknown>
}) {
  const readyForResultEntry =
    match.match_type === "TIME_ATTACK"
      ? match.participants.length >= 1
      : match.participants.length >= 2

  if (!readyForResultEntry) {
    return (
      <section className="rounded-lg border border-dashed border-[#c4c7c8] bg-[#fcf8f8] p-5">
        <h4 className="text-sm font-extrabold text-[#1c1b1b]">
          Chưa mở nhập kết quả
        </h4>
        <p className="mt-2 text-sm font-semibold text-[#747878]">
          {isKnockoutRuntime
            ? "Trận này còn chờ người thắng của vòng trước. Nhập kết quả các trận vòng trước là đối thủ tự hiện ra đây."
            : "Trận này chưa có đủ người thi đấu để nhập kết quả."}
        </p>
        {hasPendingBracketChanges ? (
          <p className="mt-2 text-xs font-bold uppercase tracking-wider text-orange-700">
            Bạn còn thay đổi sơ đồ chưa lưu.
          </p>
        ) : null}
      </section>
    )
  }

  // Đấu loại chỉ cần biết ai thắng; các thể thức khác vẫn nhập đầy đủ số liệu.
  if (isKnockoutRuntime) {
    return (
      <div className="space-y-3">
        <MatchKnockoutResultForm
          results={results}
          participantMap={participantMap}
          onUpdateResult={onUpdateResult}
        />
        <div className="flex flex-wrap items-center gap-2 border-t border-[#e5e2e1] pt-3">
          <p className="text-xs font-semibold text-[#747878]">
            Có người không tới hoặc bỏ cuộc?
          </p>
          <MatchWalkoverDialog
            participants={match.participants}
            onSubmit={onWalkover}
            disabled={match.status === "COMPLETED"}
          />
        </div>
      </div>
    )
  }

  return (
    <MatchSubmitResultsForm
      results={results}
      participantMap={participantMap}
      onUpdateResult={onUpdateResult}
      // Trận đấu loại chỉ cần biết ai thắng — backend không đọc lap hay tổng
      // thời gian của loại trận này ở bất kỳ đâu.
      showTimingFields={match.match_type === "TIME_ATTACK"}
    />
  )
}
