import { useState } from "react"
import { ChevronDown, Trophy } from "lucide-react"
import type { ContestMatchParticipant } from "@/features/contests/types"
import {
  getMatchParticipantName,
  getMatchParticipantSubtitle,
} from "@/features/contests/lib/contest-runtime"
import { Input } from "@/shared/ui/input"
import { MatchDetailField } from "./MatchDetailField"
import type { MatchResultDraft } from "./match-detail-types"

type EditableResultField =
  | "finish_position"
  | "score"
  | "best_lap_seconds"
  | "total_time_seconds"
  | "is_winner"
  | "result_note"
  | "status"

/**
 * Nhập kết quả cho trận đấu loại 1v1.
 *
 * Chỉ có một điều cần biết: ai thắng. Người thua bị loại nên chẳng có gì để
 * xếp hạng, còn thời gian vòng chạy thuộc về thể thức đua tính giờ. Bốn ô số
 * vẫn giữ lại cho ai muốn lưu kỷ lục, nhưng gập vào để không chắn mất việc
 * chính.
 *
 * Chọn một thay vì tick hai ô độc lập: tick cả hai thì backend lặng lẽ lấy
 * người đầu danh sách, còn không tick ai thì trận đóng mà không có người thắng
 * và vòng sau kẹt vĩnh viễn.
 */
export function MatchKnockoutResultForm({
  results,
  participantMap,
  onUpdateResult,
}: {
  results: MatchResultDraft[]
  participantMap: Map<string, ContestMatchParticipant>
  onUpdateResult: (
    registrationId: string,
    field: EditableResultField,
    value: number | string | boolean | null,
  ) => void
}) {
  const [showDetails, setShowDetails] = useState(false)

  const pickWinner = (winnerId: string) => {
    for (const result of results) {
      const isWinner = result.registration_id === winnerId
      onUpdateResult(result.registration_id, "is_winner", isWinner)
      // Về đích suy ra từ người thắng để bảng xếp hạng và các bước sau có dữ
      // liệu nhất quán mà nhân viên không phải gõ thêm.
      onUpdateResult(
        result.registration_id,
        "finish_position",
        isWinner ? 1 : 2,
      )
      onUpdateResult(result.registration_id, "status", "FINISHED")
    }
  }

  return (
    <section>
      <h4 className="mb-1 text-sm font-extrabold text-[#1c1b1b]">
        Ai thắng trận này?
      </h4>
      <p className="mb-3 text-xs font-semibold text-[#747878]">
        Chọn người thắng rồi lưu — người đó tự sang trận vòng sau.
      </p>

      <div className="grid gap-2 sm:grid-cols-2">
        {results.map((result) => {
          const participant = participantMap.get(result.registration_id)
          const name = participant
            ? getMatchParticipantName(participant)
            : result.registration_id.slice(0, 8)
          const selected = result.is_winner

          return (
            <button
              key={result.registration_id}
              type="button"
              onClick={() => pickWinner(result.registration_id)}
              className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
                selected
                  ? "border-emerald-400 bg-emerald-50"
                  : "border-[#e5e2e1] bg-white hover:border-[#b0b4b4]"
              }`}
            >
              <span
                className={`flex size-8 shrink-0 items-center justify-center rounded-full border ${
                  selected
                    ? "border-emerald-500 bg-emerald-500 text-white"
                    : "border-[#c4c7c8] text-[#c4c7c8]"
                }`}
              >
                <Trophy className="size-4" />
              </span>
              <span className="min-w-0">
                <span
                  className={`block truncate text-sm font-extrabold ${
                    selected ? "text-emerald-800" : "text-[#1c1b1b]"
                  }`}
                >
                  {name}
                </span>
                <span className="block truncate text-xs font-semibold text-[#747878]">
                  {participant
                    ? (getMatchParticipantSubtitle(participant) ?? "—")
                    : "—"}
                </span>
              </span>
            </button>
          )
        })}
      </div>

      <button
        type="button"
        onClick={() => setShowDetails((current) => !current)}
        className="mt-3 flex items-center gap-1 text-xs font-bold text-[#747878] hover:text-[#1c1b1b]"
      >
        <ChevronDown
          className={`size-3.5 transition-transform ${showDetails ? "rotate-180" : ""}`}
        />
        {showDetails
          ? "Ẩn số liệu chi tiết"
          : "Ghi thêm số liệu (không bắt buộc)"}
      </button>

      {showDetails ? (
        <div className="mt-3 space-y-3">
          {results.map((result) => {
            const participant = participantMap.get(result.registration_id)
            return (
              <div
                key={result.registration_id}
                className="rounded-lg border border-[#e5e2e1] p-3"
              >
                <p className="mb-2 text-sm font-bold text-[#1c1b1b]">
                  {participant
                    ? getMatchParticipantName(participant)
                    : result.registration_id.slice(0, 8)}
                </p>
                <div className="grid gap-3 md:grid-cols-3">
                  <MatchDetailField label="Lap tốt nhất (giây)">
                    <Input
                      type="number"
                      step="0.001"
                      value={result.best_lap_seconds ?? ""}
                      onChange={(event) =>
                        onUpdateResult(
                          result.registration_id,
                          "best_lap_seconds",
                          event.target.value
                            ? Number(event.target.value)
                            : null,
                        )
                      }
                    />
                  </MatchDetailField>
                  <MatchDetailField label="Tổng thời gian (giây)">
                    <Input
                      type="number"
                      step="0.001"
                      value={result.total_time_seconds ?? ""}
                      onChange={(event) =>
                        onUpdateResult(
                          result.registration_id,
                          "total_time_seconds",
                          event.target.value
                            ? Number(event.target.value)
                            : null,
                        )
                      }
                    />
                  </MatchDetailField>
                  <MatchDetailField label="Ghi chú">
                    <Input
                      value={result.result_note ?? ""}
                      onChange={(event) =>
                        onUpdateResult(
                          result.registration_id,
                          "result_note",
                          event.target.value || null,
                        )
                      }
                    />
                  </MatchDetailField>
                </div>
              </div>
            )
          })}
        </div>
      ) : null}
    </section>
  )
}
