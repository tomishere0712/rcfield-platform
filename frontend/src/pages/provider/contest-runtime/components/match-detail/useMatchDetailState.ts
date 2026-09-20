import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import type {
  ContestMatch,
  ContestSubmitResultsBody,
} from "@/features/contests/types"
import {
  contestCorrectResultsSchema,
  contestSubmitResultsSchema,
} from "@/features/contests/schemas/contest.schema"
import { getErrorMessage } from "@/features/contests/lib/contest-runtime"
import type { ContestRuntimeHook } from "./match-detail-types"
import type {
  MatchParticipantDraft,
  MatchResultDraft,
} from "./match-detail-types"

export function useMatchDetailState(
  match: ContestMatch | null,
  runtime: ContestRuntimeHook,
  /**
   * Gọi sau khi lưu kết quả thành công.
   *
   * Ở đua tính giờ, nhân viên nhập liên tiếp hàng chục lượt. Không có bước tự
   * chuyển sang lượt kế thì mỗi lượt tốn thêm một vòng cuộn lên chọn dòng khác.
   */
  onResultsSaved?: (savedMatchId: string) => void,
) {
  const [participants, setParticipants] = useState<MatchParticipantDraft[]>([])
  const [results, setResults] = useState<MatchResultDraft[]>([])
  const [reason, setReason] = useState("")
  const [forceCascade, setForceCascade] = useState(false)

  useEffect(() => {
    if (!match) return
    queueMicrotask(() => {
      setParticipants(
        match.participants.map((participant) => ({
          registration_id: participant.registration_id,
          slot_no: participant.slot_no,
          lane: participant.lane,
          grid_position: participant.grid_position,
          seed_no: participant.seed_no,
        })),
      )
      setResults(
        match.participants.map((participant) => ({
          registration_id: participant.registration_id,
          finish_position: participant.finish_position,
          score: participant.score,
          best_lap_seconds: participant.best_lap_seconds,
          total_time_seconds: participant.total_time_seconds,
          is_winner: participant.is_winner,
          result_note: participant.result_note,
          status: participant.status,
        })),
      )
      setReason("")
      setForceCascade(false)
    })
  }, [match])

  const participantMap = useMemo(
    () =>
      new Map(
        match?.participants.map((participant) => [
          participant.registration_id,
          participant,
        ]) ?? [],
      ),
    [match],
  )

  const readyForResultEntry = useMemo(
    () =>
      match?.match_type === "TIME_ATTACK"
        ? match.participants.length >= 1
        : (match?.participants.length ?? 0) >= 2,
    [match],
  )

  const updateParticipantValue = (
    registrationId: string,
    field: "slot_no" | "lane" | "grid_position" | "seed_no",
    value: number | string | null,
  ) => {
    setParticipants((current) =>
      current.map((participant) =>
        participant.registration_id === registrationId
          ? { ...participant, [field]: value }
          : participant,
      ),
    )
  }

  const updateResultValue = (
    registrationId: string,
    field:
      | "finish_position"
      | "score"
      | "best_lap_seconds"
      | "total_time_seconds"
      | "is_winner"
      | "result_note"
      | "status",
    value: number | string | boolean | null,
  ) => {
    setResults((current) =>
      current.map((result) =>
        result.registration_id === registrationId
          ? { ...result, [field]: value }
          : result,
      ),
    )
  }

  const buildResultPayload = (): ContestSubmitResultsBody => ({
    reason: reason.trim() || "Cập nhật kết quả thi đấu",
    results: results.map((result) => ({
      registration_id: result.registration_id,
      finish_position: result.finish_position,
      score: result.score,
      best_lap_seconds: result.best_lap_seconds,
      total_time_seconds: result.total_time_seconds,
      is_winner: result.is_winner,
      result_note: result.result_note,
      status: result.status,
    })),
  })

  const handleSaveParticipants = async () => {
    if (!match) return
    const slotNumbers = participants.map((participant) => participant.slot_no)
    if (new Set(slotNumbers).size !== slotNumbers.length) {
      toast.error("Mỗi người chơi phải có vị trí khác nhau")
      return
    }

    try {
      await runtime.updateParticipantsMutation.mutateAsync({
        matchId: match.id,
        body: { participants },
      })
      toast.success("Đã cập nhật thứ tự thi đấu")
    } catch (error) {
      toast.error("Không thể cập nhật người chơi", {
        description: getErrorMessage(error).message,
      })
    }
  }

  const handleSubmitResults = async () => {
    if (!match) return
    const rawPayload = buildResultPayload()
    const winners = rawPayload.results.filter((item) => item.is_winner)
    const finishPositions = rawPayload.results
      .map((item) => item.finish_position)
      .filter((item): item is number => typeof item === "number")

    if (match.match_type !== "TIME_ATTACK" && winners.length !== 1) {
      toast.error("Lượt đối kháng cần chọn đúng 1 người thắng")
      return
    }
    if (new Set(finishPositions).size !== finishPositions.length) {
      toast.error("Vị trí về đích không được trùng nhau")
      return
    }

    const result = contestSubmitResultsSchema.safeParse(rawPayload)
    if (!result.success) {
      const firstError = result.error.issues[0]
      toast.error(`Dữ liệu chưa hợp lệ: ${firstError.message}`)
      return
    }

    try {
      await runtime.submitResultsMutation.mutateAsync({
        matchId: match.id,
        body: result.data,
      })
      toast.success("Đã lưu kết quả")
      onResultsSaved?.(match.id)
    } catch (error) {
      toast.error("Không thể lưu kết quả", {
        description: getErrorMessage(error).message,
      })
    }
  }

  const handleCorrectResults = async () => {
    if (!match) return
    const rawPayload = {
      ...buildResultPayload(),
      force_cascade: forceCascade,
    }

    const result = contestCorrectResultsSchema.safeParse(rawPayload)
    if (!result.success) {
      const firstError = result.error.issues[0]
      toast.error(`Dữ liệu chưa hợp lệ: ${firstError.message}`)
      return
    }

    try {
      await runtime.correctResultsMutation.mutateAsync({
        matchId: match.id,
        body: result.data,
      })
      toast.success("Đã sửa kết quả")
    } catch (error) {
      toast.error("Không thể sửa kết quả", {
        description: getErrorMessage(error).message,
      })
    }
  }

  const handleWalkover = async (body: {
    absent: Array<{ registration_id: string; status: "DNS" | "DNF" | "DQ" }>
    reason: string
  }) => {
    if (!match) return
    await runtime.walkoverMutation.mutateAsync({ matchId: match.id, body })
  }

  const handleAdvance = async () => {
    if (!match) return
    const hasWinner = results.some((result) => result.is_winner)
    if (match.match_type !== "TIME_ATTACK" && !hasWinner) {
      toast.error("Cần chọn người thắng trước khi đẩy sang vòng sau")
      return
    }

    try {
      await runtime.advanceMatchMutation.mutateAsync(match.id)
      toast.success("Đã đẩy người thắng vào vòng sau")
    } catch (error) {
      toast.error("Không thể chuyển người thắng sang vòng sau", {
        description: getErrorMessage(error).message,
      })
    }
  }

  return {
    participants,
    results,
    reason,
    forceCascade,
    participantMap,
    readyForResultEntry,
    setReason,
    setForceCascade,
    updateParticipantValue,
    updateResultValue,
    handleSaveParticipants,
    handleSubmitResults,
    handleCorrectResults,
    handleAdvance,
    handleWalkover,
  }
}
