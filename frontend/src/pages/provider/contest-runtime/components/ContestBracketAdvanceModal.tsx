import { useState, useId } from "react"
import type {
  ContestMatch,
  ContestMatchParticipant,
  ContestParticipantStatus,
} from "@/features/contests/types"
import {
  formatDurationSeconds,
  formatMatchLabel,
  getMatchParticipantName,
  getMatchParticipantSubtitle,
} from "@/features/contests/lib/contest-runtime"
import { getParticipantStatusLabel } from "@/features/contests/lib/contest-status"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Label } from "@/shared/ui/label"
import { DriverTitleChip } from "@/features/racing/components/DriverTitleChip"
import {
  Trophy,
  ArrowRight,
  UserCheck,
  Timer,
  Flag,
  Award,
  NotebookPen,
} from "lucide-react"

export type AdvanceModalPayload = {
  sourceMatch: ContestMatch
  targetMatch: ContestMatch
  participant: ContestMatchParticipant
}

export type AdvanceSubmitData = {
  sourceMatchId: string
  targetMatchId: string
  registrationId: string
  submitResult?: {
    finishPosition?: number | null
    score?: number | null
    bestLapSeconds?: number | null
    totalTimeSeconds?: number | null
    status?: ContestParticipantStatus
    isWinner?: boolean
    resultNote?: string | null
  }
}

const participantStatuses: ContestParticipantStatus[] = [
  "READY",
  "STARTED",
  "FINISHED",
  "DNS",
  "DNF",
  "DQ",
]

function parseNumberInput(value: string): number | null {
  if (value === "" || value === "-") return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function ContestBracketAdvanceModal({
  isOpen,
  onClose,
  payload,
  onConfirm,
}: {
  isOpen: boolean
  onClose: () => void
  payload: AdvanceModalPayload | null
  onConfirm: (data: AdvanceSubmitData) => void
}) {
  const [finishPosition, setFinishPosition] = useState<string>("")
  const [score, setScore] = useState<string>("10")
  const [bestLapSeconds, setBestLapSeconds] = useState<string>("")
  const [totalTimeSeconds, setTotalTimeSeconds] = useState<string>("")
  const [status, setStatus] = useState<ContestParticipantStatus>("FINISHED")
  const [resultNote, setResultNote] = useState<string>("")
  /*
    Không còn ô chọn "ai là người thắng".

    Hành động ở đây là KÉO NGƯỜI NÀY SANG VÒNG SAU — trong sơ đồ đấu loại, đó
    chính là tuyên bố họ thắng trận nguồn. Hỏi lại bằng một ô tick là hỏi lại
    đúng thứ vừa nói bằng thao tác kéo.

    Tệ hơn, ô đó từng nằm BÊN TRONG khối "cập nhật nhanh kết quả" vốn mặc định
    tắt — nên kéo thả bình thường thì trận nguồn không được ghi người thắng nào,
    và bảng xếp hạng cuối giải thiếu dữ liệu mà không ai biết.
  */
  const [quickUpdateResult, setQuickUpdateResult] = useState<boolean>(false)

  const formId = useId()
  const finishPositionId = `${formId}-finish-position`
  const scoreId = `${formId}-score`
  const bestLapId = `${formId}-best-lap`
  const totalTimeId = `${formId}-total-time`
  const statusId = `${formId}-status`
  const noteId = `${formId}-note`

  const [prevPayload, setPrevPayload] = useState(payload)
  if (prevPayload !== payload) {
    setPrevPayload(payload)
    if (payload?.participant) {
      const p = payload.participant
      setFinishPosition(
        p.finish_position !== null ? String(p.finish_position) : "",
      )
      setScore(p.score !== null ? String(p.score) : "10")
      setBestLapSeconds(
        p.best_lap_seconds !== null ? String(p.best_lap_seconds) : "",
      )
      setTotalTimeSeconds(
        p.total_time_seconds !== null ? String(p.total_time_seconds) : "",
      )
      setStatus(p.status ?? "FINISHED")
      setResultNote(p.result_note ?? "")
      setQuickUpdateResult(false)
    }
  }

  if (!payload) return null

  const { sourceMatch, targetMatch, participant } = payload
  /*
    Trận này có tính giờ không.

    Đấu loại trực tiếp chỉ quan tâm AI THẮNG. `KnockoutEngine.buildResultSummary`
    ở backend chỉ đọc đúng `isWinner`; lap và tổng thời gian không được đọc ở
    đâu cả, và bảng xếp hạng đấu loại xếp theo vòng đi được với số trận thắng
    thật, không theo thời gian.

    Nên với trận đấu loại, hai ô thời gian là chỗ để gõ vào rồi không ai dùng —
    tệ hơn là nó khiến người nhập tưởng phải có số mới lưu được kết quả.

    Suy từ chính trận đấu (`match_type`) chứ không truyền thêm thể thức từ ngoài
    vào: một giải Grand Prix có CẢ hai loại trận, nên cờ theo giải sẽ sai ở một
    nửa số trận.
  */
  const laTranTinhGio = sourceMatch.match_type === "TIME_ATTACK"

  const participantName = getMatchParticipantName(participant)
  const participantSubtitle = getMatchParticipantSubtitle(participant)

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    onConfirm({
      sourceMatchId: sourceMatch.id,
      targetMatchId: targetMatch.id,
      registrationId: participant.registration_id,
      // Luôn ghi người thắng. Chỉ phần THÀNH TÍCH (lap, điểm, ghi chú) mới phụ
      // thuộc vào ô "nhập thêm thành tích" — không nhập thì giữ nguyên số cũ
      // chứ không ghi đè bằng rỗng.
      submitResult: {
        isWinner: true,
        ...(quickUpdateResult
          ? {
              finishPosition: parseNumberInput(finishPosition),
              score: parseNumberInput(score),
              bestLapSeconds: parseNumberInput(bestLapSeconds),
              totalTimeSeconds: parseNumberInput(totalTimeSeconds),
              status,
              resultNote: resultNote || null,
            }
          : {}),
      },
    })
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-3xl max-w-[95vw] max-h-[90vh] overflow-y-auto rounded-2xl p-0 bg-white border border-[#e5e2e1] shadow-xl">
        <DialogHeader className="space-y-2 px-6 pt-6 pb-4 border-b border-[#e5e2e1]">
          <div className="flex items-center gap-2.5 text-orange-600 font-extrabold text-sm uppercase tracking-wider">
            <Trophy className="size-4.5" />
            <span>Xác nhận đưa người thi đấu đi tiếp</span>
          </div>
          <DialogTitle className="text-lg font-extrabold text-[#1c1b1b]">
            Chuyển {participantName} vào {formatMatchLabel(targetMatch)}
          </DialogTitle>
          <DialogDescription className="text-xs text-[#747878] font-medium leading-relaxed">
            Bạn đang kéo thả tay đua từ{" "}
            <strong>{formatMatchLabel(sourceMatch)}</strong> sang{" "}
            <strong>{formatMatchLabel(targetMatch)}</strong> (Vòng{" "}
            {targetMatch.round_no}).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 px-6 py-4">
          {/* Card thông tin chuyển trận */}
          <div className="rounded-xl border border-orange-200 bg-orange-50/60 p-4 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#747878]">
                Trận nguồn
              </p>
              <p className="text-sm font-extrabold text-[#1c1b1b] truncate">
                {formatMatchLabel(sourceMatch)}
              </p>
              <div className="mt-2 flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <UserCheck className="size-3.5 shrink-0 text-orange-600" />
                  <span className="text-sm font-bold text-[#1c1b1b] truncate">
                    {participantName}
                  </span>
                </div>
                {participantSubtitle ? (
                  <p className="text-xs text-[#747878] truncate pl-5">
                    {participantSubtitle}
                  </p>
                ) : null}
              </div>
            </div>
            <ArrowRight className="size-6 shrink-0 text-orange-500" />
            <div className="min-w-0 text-right">
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#747878]">
                Trận đích
              </p>
              <p className="text-sm font-extrabold text-[#1c1b1b] truncate">
                {formatMatchLabel(targetMatch)}
              </p>
              <p className="mt-2 text-xs font-semibold text-emerald-700">
                Vòng {targetMatch.round_no}
              </p>
            </div>
          </div>

          {/*
            Nói thẳng thứ sắp được ghi, thay vì bắt người dùng tick để khẳng
            định lại điều họ vừa làm bằng thao tác kéo.
          */}
          <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-sm font-semibold text-emerald-900">
            <Trophy className="size-4 shrink-0 text-emerald-600 mt-0.5" />
            <span>
              {participantName} được ghi nhận <b>thắng</b>{" "}
              {formatMatchLabel(sourceMatch)}, đối thủ ghi nhận thua.
            </span>
          </div>

          {/* Tuỳ chọn: nhập thêm thành tích chi tiết cho trận nguồn */}
          <div className="space-y-4">
            <label className="flex items-center gap-3 cursor-pointer text-sm font-bold text-[#1c1b1b] rounded-xl border border-[#e5e2e1] bg-[#fcf8f8] p-3.5 transition-colors hover:bg-[#f6f3f2]">
              <input
                type="checkbox"
                checked={quickUpdateResult}
                onChange={(e) => setQuickUpdateResult(e.target.checked)}
                className="size-4 rounded border-[#c4c7c8] text-orange-600 focus:ring-orange-500"
              />
              <span>
                {laTranTinhGio
                  ? "Nhập thêm thành tích (lap, điểm, ghi chú) — không bắt buộc"
                  : "Ghi thêm chi tiết trận (trạng thái, ghi chú) — không bắt buộc"}
              </span>
            </label>

            {quickUpdateResult && (
              <div className="space-y-4 p-4 rounded-xl border border-[#e5e2e1] bg-[#fcf8f8]">
                <div className="flex items-center gap-2 text-orange-700 font-bold text-sm">
                  <Award className="size-4" />
                  <span>Kết quả của {participantName}</span>
                  <DriverTitleChip
                    label={participant.registration?.driver_title_label}
                    className="px-2 py-0 text-[10px]"
                  />
                </div>

                {/* Bốn ô số chỉ có nghĩa ở trận tính giờ. Trận đấu loại thì
                    thắng thua đã quyết bằng thao tác kéo, không có gì để đo. */}
                {laTranTinhGio && (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-1.5">
                    <Label
                      htmlFor={finishPositionId}
                      className="flex items-center gap-1.5 text-xs font-bold text-[#444748]"
                    >
                      <Flag className="size-3.5 text-[#747878]" />
                      Về đích
                    </Label>
                    <Input
                      id={finishPositionId}
                      type="number"
                      min={1}
                      value={finishPosition}
                      onChange={(e) => setFinishPosition(e.target.value)}
                      placeholder="1"
                      className="h-10 text-sm bg-white"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label
                      htmlFor={scoreId}
                      className="flex items-center gap-1.5 text-xs font-bold text-[#444748]"
                    >
                      <Award className="size-3.5 text-[#747878]" />
                      Điểm
                    </Label>
                    <Input
                      id={scoreId}
                      type="number"
                      value={score}
                      onChange={(e) => setScore(e.target.value)}
                      placeholder="10"
                      className="h-10 text-sm bg-white"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label
                      htmlFor={bestLapId}
                      className="flex items-center gap-1.5 text-xs font-bold text-[#444748]"
                    >
                      <Timer className="size-3.5 text-[#747878]" />
                      Lap tốt nhất (giây)
                    </Label>
                    <Input
                      id={bestLapId}
                      type="number"
                      step="0.001"
                      value={bestLapSeconds}
                      onChange={(e) => setBestLapSeconds(e.target.value)}
                      placeholder="13.5"
                      className="h-10 text-sm bg-white"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label
                      htmlFor={totalTimeId}
                      className="flex items-center gap-1.5 text-xs font-bold text-[#444748]"
                    >
                      <Timer className="size-3.5 text-[#747878]" />
                      Tổng thời gian (giây)
                    </Label>
                    <Input
                      id={totalTimeId}
                      type="number"
                      step="0.001"
                      value={totalTimeSeconds}
                      onChange={(e) => setTotalTimeSeconds(e.target.value)}
                      placeholder="40.5"
                      className="h-10 text-sm bg-white"
                    />
                  </div>
                </div>
                )}

                <div className="grid gap-4 sm:grid-cols-[220px_minmax(0,1fr)]">
                  <div className="space-y-1.5">
                    <Label
                      htmlFor={statusId}
                      className="flex items-center gap-1.5 text-xs font-bold text-[#444748]"
                    >
                      <UserCheck className="size-3.5 text-[#747878]" />
                      Trạng thái người chơi
                    </Label>
                    <select
                      id={statusId}
                      value={status}
                      onChange={(e) =>
                        setStatus(e.target.value as ContestParticipantStatus)
                      }
                      className="h-10 w-full rounded-lg border border-[#c4c7c8] bg-white px-3 text-sm font-medium text-[#1c1b1b] focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                    >
                      {participantStatuses.map((s) => (
                        <option key={s} value={s}>
                          {getParticipantStatusLabel(s)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <Label
                      htmlFor={noteId}
                      className="flex items-center gap-1.5 text-xs font-bold text-[#444748]"
                    >
                      <NotebookPen className="size-3.5 text-[#747878]" />
                      Ghi chú kết quả
                    </Label>
                    <Input
                      id={noteId}
                      value={resultNote}
                      onChange={(e) => setResultNote(e.target.value)}
                      placeholder="VD: Thắng trận, về nhất..."
                      className="h-10 text-sm bg-white"
                    />
                  </div>
                </div>

                <div
                  className="text-xs font-semibold text-[#747878]"
                  hidden={!laTranTinhGio}
                >
                  Lap tốt nhất:{" "}
                  {formatDurationSeconds(parseNumberInput(bestLapSeconds))} ·
                  Tổng thời gian:{" "}
                  {formatDurationSeconds(parseNumberInput(totalTimeSeconds))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="pt-2 pb-2 gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="rounded-lg text-sm font-bold h-10"
            >
              Hủy
            </Button>
            <Button
              type="submit"
              className="rounded-lg bg-[#1c1b1b] text-white hover:bg-[#313030] text-sm font-bold h-10 gap-1.5"
            >
              <UserCheck className="size-4" />
              Chuyển vòng & Xếp sơ đồ
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
