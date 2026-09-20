import type { ContestMatchParticipant } from "@/features/contests/types"
import {
  formatDurationSeconds,
  getMatchParticipantName,
  getMatchParticipantSubtitle,
} from "@/features/contests/lib/contest-runtime"
import { getParticipantStatusLabel } from "@/features/contests/lib/contest-status"
import { DriverTitleChip } from "@/features/racing/components/DriverTitleChip"
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

export function MatchSubmitResultsForm({
  results,
  participantMap,
  onUpdateResult,
  showTimingFields,
}: {
  results: MatchResultDraft[]
  participantMap: Map<string, ContestMatchParticipant>
  onUpdateResult: (
    registrationId: string,
    field: EditableResultField,
    value: number | string | boolean | null,
  ) => void
  /**
   * Có hiện hai ô lap và tổng thời gian không.
   *
   * Chỉ trận tính giờ mới dùng tới. Ở đấu loại trực tiếp, kết quả là ai thắng —
   * `KnockoutEngine.buildResultSummary` chỉ đọc `isWinner`, và bảng xếp hạng xếp
   * theo vòng đi được chứ không theo thời gian. Bày hai ô đó ra khiến người nhập
   * tưởng phải có số mới lưu được.
   */
  showTimingFields: boolean
}) {
  return (
    <section>
      <h4 className="mb-2 text-sm font-extrabold text-[#1c1b1b]">
        Nhập kết quả
      </h4>
      <div className="space-y-3">
        {results.map((result) => (
          <div
            key={result.registration_id}
            className="rounded-lg border border-[#e5e2e1] p-3"
          >
            <div className="mb-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-bold text-[#1c1b1b]">
                  {participantMap.get(result.registration_id)
                    ? getMatchParticipantName(
                        participantMap.get(result.registration_id),
                      )
                    : result.registration_id.slice(0, 8)}
                </p>
                <DriverTitleChip
                  label={
                    participantMap.get(result.registration_id)?.registration
                      ?.driver_title_label
                  }
                  className="px-2 py-0 text-[10px]"
                />
              </div>
              <p className="text-xs font-medium text-[#747878]">
                {participantMap.get(result.registration_id)
                  ? (getMatchParticipantSubtitle(
                      participantMap.get(result.registration_id),
                    ) ?? "Chưa có email hoặc mã điểm danh")
                  : "Chưa có thông tin bổ sung"}
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <MatchDetailField label="Về đích">
                <Input
                  type="number"
                  value={result.finish_position ?? ""}
                  onChange={(event) =>
                    onUpdateResult(
                      result.registration_id,
                      "finish_position",
                      event.target.value ? Number(event.target.value) : null,
                    )
                  }
                />
              </MatchDetailField>
              <MatchDetailField label="Điểm">
                <Input
                  type="number"
                  value={result.score ?? ""}
                  onChange={(event) =>
                    onUpdateResult(
                      result.registration_id,
                      "score",
                      event.target.value ? Number(event.target.value) : null,
                    )
                  }
                />
              </MatchDetailField>
              {showTimingFields && (
              <MatchDetailField label="Lap tốt nhất (giây)">
                <Input
                  type="number"
                  step="0.001"
                  value={result.best_lap_seconds ?? ""}
                  onChange={(event) =>
                    onUpdateResult(
                      result.registration_id,
                      "best_lap_seconds",
                      event.target.value ? Number(event.target.value) : null,
                    )
                  }
                />
              </MatchDetailField>
              )}
              {showTimingFields && (
              <MatchDetailField label="Tổng thời gian (giây)">
                <Input
                  type="number"
                  step="0.001"
                  value={result.total_time_seconds ?? ""}
                  onChange={(event) =>
                    onUpdateResult(
                      result.registration_id,
                      "total_time_seconds",
                      event.target.value ? Number(event.target.value) : null,
                    )
                  }
                />
              </MatchDetailField>
              )}
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-[180px_minmax(0,1fr)]">
              <MatchDetailField label="Trạng thái người chơi">
                <select
                  className="h-10 rounded-lg border border-[#c4c7c8] bg-white px-3 text-sm"
                  value={result.status}
                  onChange={(event) =>
                    onUpdateResult(
                      result.registration_id,
                      "status",
                      event.target.value,
                    )
                  }
                >
                  <option value="READY">
                    {getParticipantStatusLabel("READY")}
                  </option>
                  <option value="STARTED">
                    {getParticipantStatusLabel("STARTED")}
                  </option>
                  <option value="FINISHED">
                    {getParticipantStatusLabel("FINISHED")}
                  </option>
                  <option value="DNS">
                    {getParticipantStatusLabel("DNS")}
                  </option>
                  <option value="DNF">
                    {getParticipantStatusLabel("DNF")}
                  </option>
                  <option value="DQ">{getParticipantStatusLabel("DQ")}</option>
                </select>
              </MatchDetailField>
              <MatchDetailField label="Ghi chú kết quả">
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
            <label className="mt-3 flex items-center gap-2 text-sm font-semibold text-[#1c1b1b]">
              <input
                type="checkbox"
                checked={result.is_winner}
                onChange={(event) =>
                  onUpdateResult(
                    result.registration_id,
                    "is_winner",
                    event.target.checked,
                  )
                }
              />
              Đánh dấu người thắng
            </label>
            {showTimingFields && (
            <div className="mt-2 text-xs font-semibold text-[#747878]">
              Lap tốt nhất: {formatDurationSeconds(result.best_lap_seconds)} ·
              Tổng thời gian: {formatDurationSeconds(result.total_time_seconds)}
            </div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
