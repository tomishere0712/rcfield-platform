import { useEffect, useRef } from "react"
import { MatchStatusBadge } from "@/features/contests/components"
import { getMatchTypeLabel } from "@/features/contests/lib/contest-status"
import type { ContestMatch } from "@/features/contests/types"
import {
  Panel,
  PanelTitle,
} from "@/pages/provider/components/ProviderPrimitives"
import { Badge } from "@/shared/ui/badge"
import { MatchActions } from "./MatchActions"
import { MatchParticipantReorderList } from "./MatchParticipantReorderList"
import { MatchParticipantView } from "./MatchParticipantView"
import { MatchResultEntry } from "./MatchResultEntry"
import type { ContestRuntimeHook } from "./match-detail-types"
import { useMatchDetailState } from "./useMatchDetailState"

export function ContestMatchDetailPanel({
  match,
  runtime,
  isKnockoutRuntime = false,
  hasPendingBracketChanges = false,
  onResultsSaved,
}: {
  match: ContestMatch | null
  runtime: ContestRuntimeHook
  isKnockoutRuntime?: boolean
  hasPendingBracketChanges?: boolean
  onResultsSaved?: (savedMatchId: string) => void
}) {
  // Danh sách lượt đấu dài (giải 8 người ba vòng ra 24 dòng) đẩy form nhập kết
  // quả xuống tận cuối trang. Chọn xong một lượt mà phải tự cuộn đi tìm chỗ nhập
  // thì thao tác nào cũng mất hai bước thừa.
  const panelRef = useRef<HTMLDivElement | null>(null)
  const lastScrolledMatchId = useRef<string | null>(null)
  const mounted = useRef(false)

  useEffect(() => {
    if (!match?.id || match.id === lastScrolledMatchId.current) return
    lastScrolledMatchId.current = match.id
    // Lần dựng đầu tiên thì đứng yên. Mở trang bằng đường dẫn có sẵn lượt được
    // chọn mà màn hình tự nhảy xuống giữa trang là mất phương hướng.
    if (!mounted.current) {
      mounted.current = true
      return
    }
    const node = panelRef.current
    if (!node) return
    const rect = node.getBoundingClientRect()
    // Đã nhìn thấy sẵn thì đừng giật màn hình.
    if (rect.top >= 0 && rect.bottom <= window.innerHeight) return
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches
    node.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "start",
    })
  }, [match?.id])

  const {
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
  } = useMatchDetailState(match, runtime, onResultsSaved)

  if (!match) {
    return (
      <Panel>
        <PanelTitle
          title="Chi tiết trận đấu"
          subtitle="Chọn một trận hoặc lượt thi đấu để xem chi tiết."
        />
        <p className="text-sm font-semibold text-[#747878]">
          Chưa có lượt đấu nào được chọn.
        </p>
      </Panel>
    )
  }

  return (
    <div ref={panelRef} className="scroll-mt-4">
      <Panel>
        <PanelTitle
          title={
            match.name ?? `Vòng ${match.round_no} · Trận ${match.match_no}`
          }
          subtitle={
            isKnockoutRuntime
              ? "Chọn người thắng rồi lưu — người đó tự sang trận vòng sau."
              : "Sắp thứ tự thi đấu, nhập kết quả và chỉnh sửa khi cần."
          }
        />

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <MatchStatusBadge status={match.status} />
          <Badge className="border border-[#c4c7c8] bg-[#f6f3f2] text-[#444748]">
            {getMatchTypeLabel(match.match_type)}
          </Badge>
        </div>

        <div className="space-y-4">
          {!isKnockoutRuntime ? (
            <MatchParticipantReorderList
              participants={participants}
              participantMap={participantMap}
              onUpdateParticipant={updateParticipantValue}
              onSave={handleSaveParticipants}
            />
          ) : !readyForResultEntry ? (
            // Đủ người rồi thì form "Ai thắng trận này?" bên dưới đã liệt kê
            // đúng hai người này kèm email — lặp lại ở đây chỉ để xem vị trí/
            // trạng thái, không thêm thông tin gì mới, chỉ tổ dài trang.
            <MatchParticipantView match={match} />
          ) : null}

          <MatchResultEntry
            match={match}
            results={results}
            participantMap={participantMap}
            isKnockoutRuntime={isKnockoutRuntime}
            hasPendingBracketChanges={hasPendingBracketChanges}
            onUpdateResult={updateResultValue}
            onWalkover={handleWalkover}
          />

          <MatchActions
            reason={reason}
            onReasonChange={setReason}
            forceCascade={forceCascade}
            onForceCascadeChange={setForceCascade}
            readyForResultEntry={readyForResultEntry}
            hasPendingBracketChanges={hasPendingBracketChanges}
            onSubmitResults={handleSubmitResults}
            onCorrectResults={handleCorrectResults}
            onAdvance={handleAdvance}
          />
        </div>
      </Panel>
    </div>
  )
}
