import { useMemo, useState } from "react"
import { AlertTriangle, Trophy } from "lucide-react"
import { DriverTitleChip } from "@/features/racing/components/DriverTitleChip"
import {
  formatContestDateTime,
  getMatchParticipantName,
  groupMatchesByRound,
} from "@/features/contests/lib/contest-runtime"
import { getParticipantAnomalyBadge } from "@/features/contests/lib/contest-status"
import type {
  ContestMatch,
  ContestMatchParticipant,
} from "@/features/contests/types"
import {
  Panel,
  PanelTitle,
} from "@/pages/provider/components/ProviderPrimitives"
import { Badge } from "@/shared/ui/badge"
import { Button } from "@/shared/ui/button"
import {
  ContestBracketAdvanceModal,
  type AdvanceModalPayload,
  type AdvanceSubmitData,
} from "./ContestBracketAdvanceModal"

/**
 * Nửa khoảng cách giữa hai cột vòng — cũng là nơi đặt đường dọc nối cặp đấu.
 * Đoạn ngang bên trái và bên phải đều dài đúng bằng số này nên ba nét gặp nhau
 * thành chữ T cân, không lệch.
 */
const CONNECTOR = 28
const COLUMN_WIDTH = 236
const LINE = "#c4c7c8"

/** Tên vòng đếm ngược từ chung kết, khớp cách backend đặt tên trận. */
function getRoundName(roundIndex: number, totalRounds: number): string {
  const fromFinal = totalRounds - 1 - roundIndex
  if (fromFinal === 0) return "Chung kết"
  if (fromFinal === 1) return "Bán kết"
  if (fromFinal === 2) return "Tứ kết"
  if (fromFinal === 3) return "Vòng 1/8"
  return `Vòng ${roundIndex + 1}`
}

function isThirdPlaceMatch(match: ContestMatch): boolean {
  return match.metadata?.third_place === true
}

export function ContestKnockoutBracket({
  matches,
  selectedMatchId,
  onSelectMatch,
  onStageAdvance,
  onUndo,
  onCommit,
  canUndo,
  hasChanges,
  readOnly = false,
  title = "Sơ đồ đấu",
  emptyMessage = "Chưa bốc thăm nên chưa có sơ đồ.",
}: {
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
  /** Nhân viên chỉ xem và chọn trận; sắp lại cặp đấu là việc của ban tổ chức. */
  readOnly?: boolean
  title?: string
  emptyMessage?: string
}) {
  // Trận tranh hạng 3 nằm cùng vòng với chung kết nhưng không nhận người thắng
  // từ đâu cả, để chung vào cây sẽ làm lệch toàn bộ đường nối.
  const thirdPlaceMatch = useMemo(
    () => matches.find(isThirdPlaceMatch) ?? null,
    [matches],
  )
  const groups = useMemo(
    () =>
      groupMatchesByRound(matches.filter((match) => !isThirdPlaceMatch(match))),
    [matches],
  )

  const [draggingPayload, setDraggingPayload] = useState<{
    sourceMatchId: string
    registrationId: string
  } | null>(null)
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)
  const [advanceModalPayload, setAdvanceModalPayload] =
    useState<AdvanceModalPayload | null>(null)

  const handleDrop = (targetMatch: ContestMatch, payloadRaw: string) => {
    setDropTargetId(null)
    setDraggingPayload(null)
    if (!payloadRaw) return

    try {
      const parsed = JSON.parse(payloadRaw) as {
        sourceMatchId: string
        registrationId: string
      }
      const sourceMatch = matches.find((m) => m.id === parsed.sourceMatchId)
      if (!sourceMatch) return

      const participant = sourceMatch.participants.find(
        (p) => p.registration_id === parsed.registrationId,
      )
      if (!participant) return
      if (targetMatch.round_no <= sourceMatch.round_no) return

      setAdvanceModalPayload({ sourceMatch, targetMatch, participant })
    } catch {
      return
    }
  }

  const totalRounds = groups.length

  const renderCard = (match: ContestMatch) => (
    <BracketMatchCard
      match={match}
      selected={selectedMatchId === match.id}
      onSelect={() => onSelectMatch(match.id)}
      dropTargetId={dropTargetId}
      onDropTargetChange={setDropTargetId}
      onDrop={handleDrop}
      draggingPayload={draggingPayload}
      onDragStart={setDraggingPayload}
      onDragEnd={() => setDraggingPayload(null)}
      readOnly={readOnly}
    />
  )

  return (
    <Panel>
      <PanelTitle
        title={title}
        subtitle={
          readOnly
            ? "Người thắng mỗi trận đi sang trận nối bên phải. Nhấp vào trận để nhập kết quả."
            : "Người thắng mỗi trận đi sang trận nối bên phải. Nhấp vào trận để nhập kết quả; kéo tay đua sang vòng sau chỉ dùng khi cần sửa sai."
        }
        action={
          readOnly ? null : (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="rounded-lg text-xs font-bold"
                disabled={!canUndo}
                onClick={onUndo}
              >
                Hoàn tác
              </Button>
              <Button
                type="button"
                className="rounded-lg bg-[#1c1b1b] text-xs font-bold text-white hover:bg-[#313030]"
                disabled={!hasChanges}
                onClick={onCommit}
              >
                Lưu sơ đồ
              </Button>
            </div>
          )
        }
      />

      {hasChanges && !readOnly ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
          <AlertTriangle className="size-4 shrink-0 text-amber-700" />
          <p className="text-xs font-bold text-amber-900">
            Sơ đồ đang có thay đổi chưa lưu — rời khỏi trang là mất.
          </p>
          <Button
            type="button"
            className="ml-auto h-7 rounded-lg bg-amber-700 px-3 text-xs font-bold text-white hover:bg-amber-800"
            onClick={onCommit}
          >
            Lưu ngay
          </Button>
        </div>
      ) : null}

      {groups.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[#c4c7c8] p-8 text-center text-sm font-semibold text-[#747878]">
          {emptyMessage}
        </div>
      ) : (
        <div className="overflow-x-auto pb-2">
          <div className="min-w-max">
            <div className="mb-2 flex" style={{ gap: CONNECTOR * 2 }}>
              {groups.map((group, roundIndex) => (
                <div
                  key={group.roundNo}
                  className="shrink-0 text-center"
                  style={{ width: COLUMN_WIDTH }}
                >
                  <p className="text-xs font-extrabold uppercase tracking-wider text-[#747878]">
                    {getRoundName(roundIndex, totalRounds)}
                  </p>
                  <p className="text-[10px] font-bold text-[#b0b4b4]">
                    {group.matches.length} trận
                  </p>
                </div>
              ))}
            </div>

            <div className="flex items-stretch" style={{ gap: CONNECTOR * 2 }}>
              {groups.map((group, roundIndex) => {
                const isLastRound = roundIndex === groups.length - 1
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
                        {renderCard(match)}

                        {/* Đoạn ngang chạy ra khỏi trận, dừng ở trục dọc. */}
                        {isLastRound ? null : (
                          <span
                            aria-hidden
                            className="absolute top-1/2"
                            style={{
                              right: -CONNECTOR,
                              width: CONNECTOR,
                              borderTop: `2px solid ${LINE}`,
                            }}
                          />
                        )}

                        {/* Trục dọc gộp cặp: vẽ từ trận trên xuống đúng một ô,
                            tức chạm chính giữa trận dưới của cặp. */}
                        {isLastRound || matchIndex % 2 === 1 ? null : (
                          <span
                            aria-hidden
                            className="absolute top-1/2 h-full"
                            style={{
                              right: -CONNECTOR,
                              borderLeft: `2px solid ${LINE}`,
                            }}
                          />
                        )}

                        {/* Đoạn ngang đi vào trận, nối tiếp trục dọc bên trái. */}
                        {roundIndex === 0 ? null : (
                          <span
                            aria-hidden
                            className="absolute top-1/2"
                            style={{
                              left: -CONNECTOR,
                              width: CONNECTOR,
                              borderTop: `2px solid ${LINE}`,
                            }}
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
      )}

      {thirdPlaceMatch ? (
        <div className="mt-6 border-t border-[#e5e2e1] pt-4">
          <p className="mb-2 text-xs font-extrabold uppercase tracking-wider text-[#747878]">
            Tranh hạng 3
          </p>
          <div className="max-w-[236px]">{renderCard(thirdPlaceMatch)}</div>
        </div>
      ) : null}

      <ContestBracketAdvanceModal
        isOpen={Boolean(advanceModalPayload)}
        onClose={() => setAdvanceModalPayload(null)}
        payload={advanceModalPayload}
        onConfirm={(data: AdvanceSubmitData) =>
          onStageAdvance(
            data.sourceMatchId,
            data.targetMatchId,
            data.registrationId,
            data.submitResult,
          )
        }
      />
    </Panel>
  )
}

function BracketMatchCard({
  match,
  selected,
  onSelect,
  dropTargetId,
  onDropTargetChange,
  onDrop,
  draggingPayload,
  onDragStart,
  onDragEnd,
  readOnly = false,
}: {
  match: ContestMatch
  selected: boolean
  onSelect: () => void
  dropTargetId: string | null
  onDropTargetChange: (id: string | null) => void
  onDrop: (match: ContestMatch, payload: string) => void
  draggingPayload: { sourceMatchId: string; registrationId: string } | null
  onDragStart: (payload: {
    sourceMatchId: string
    registrationId: string
  }) => void
  onDragEnd: () => void
  readOnly?: boolean
}) {
  const isBye = match.metadata?.bye === true
  const isEmpty = match.metadata?.empty_slot === true
  const isDone = match.status === "COMPLETED"
  const isLive = match.status === "RUNNING"

  return (
    <div
      onClick={onSelect}
      className={`w-full cursor-pointer rounded-lg border bg-white transition-colors ${
        selected
          ? "border-orange-400 ring-2 ring-orange-200"
          : isLive
            ? "border-blue-300"
            : "border-[#e5e2e1] hover:border-[#b0b4b4]"
      } ${isEmpty ? "opacity-60" : ""}`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-[#f0edec] px-2.5 py-1.5">
        <p className="truncate text-[11px] font-extrabold text-[#1c1b1b]">
          {match.name ?? `Trận ${match.match_no}`}
        </p>
        <span className="shrink-0 text-[10px] font-bold text-[#b0b4b4]">
          {isEmpty
            ? "—"
            : isLive
              ? "Đang đấu"
              : formatContestDateTime(match.scheduled_at)}
        </span>
      </div>

      <div className="divide-y divide-[#f0edec]">
        {[0, 1].map((slotIndex) => {
          const participant = match.participants[slotIndex]
          const slotId = `${match.id}-${slotIndex}`
          const isDropTarget = dropTargetId === slotId

          return (
            <div
              key={slotIndex}
              className={`px-2.5 py-1.5 transition-colors ${
                isDropTarget ? "bg-orange-100" : ""
              } ${participant?.is_winner ? "bg-emerald-50/70" : ""} ${
                participant?.metadata?.staged === true
                  ? "border-l-2 border-amber-500 bg-amber-50/70"
                  : ""
              }`}
              onDragOver={
                readOnly
                  ? undefined
                  : (event) => {
                      event.preventDefault()
                      event.dataTransfer.dropEffect = "move"
                      onDropTargetChange(slotId)
                    }
              }
              onDragLeave={
                readOnly ? undefined : () => onDropTargetChange(null)
              }
              onDrop={
                readOnly
                  ? undefined
                  : (event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      onDrop(match, event.dataTransfer.getData("text/plain"))
                    }
              }
            >
              {participant ? (
                <ParticipantSlot
                  participant={participant}
                  match={match}
                  isDragging={
                    draggingPayload?.sourceMatchId === match.id &&
                    draggingPayload?.registrationId ===
                      participant.registration_id
                  }
                  onDragStart={() =>
                    onDragStart({
                      sourceMatchId: match.id,
                      registrationId: participant.registration_id,
                    })
                  }
                  onDragEnd={onDragEnd}
                  readOnly={readOnly}
                />
              ) : (
                <EmptySlot bye={isBye} empty={isEmpty} done={isDone} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Ô không có người: phân biệt rõ ba trường hợp khác hẳn nhau — đối thủ là ô
 * trống nên người kia được đi tiếp, cả hai ô đều trống, và đang chờ người thắng
 * vòng trước. Gọi hết là "trống" thì ban tổ chức không biết trận nào cần làm gì.
 */
function EmptySlot({
  bye,
  empty,
  done,
}: {
  bye: boolean
  empty: boolean
  done: boolean
}) {
  if (empty) {
    return (
      <p className="text-[11px] font-semibold italic text-[#b0b4b4]">Ô trống</p>
    )
  }
  if (bye) {
    return (
      <p className="text-[11px] font-semibold italic text-[#b0b4b4]">
        Không có đối thủ
      </p>
    )
  }
  return (
    <p className="text-[11px] font-semibold italic text-[#b0b4b4]">
      {done ? "—" : "Chờ vòng trước"}
    </p>
  )
}

function ParticipantSlot({
  participant,
  match,
  isDragging,
  onDragStart,
  onDragEnd,
  readOnly = false,
}: {
  participant: ContestMatchParticipant
  match: ContestMatch
  isDragging: boolean
  onDragStart: () => void
  onDragEnd: () => void
  readOnly?: boolean
}) {
  const canDrag = !readOnly && Boolean(participant.registration_id)

  return (
    <div
      className={`flex items-center gap-1.5 transition-opacity ${
        isDragging ? "opacity-40" : ""
      } ${canDrag ? "cursor-grab active:cursor-grabbing" : ""}`}
      draggable={canDrag}
      onDragStart={(event) => {
        if (!canDrag) {
          event.preventDefault()
          return
        }
        event.dataTransfer.setData(
          "text/plain",
          JSON.stringify({
            sourceMatchId: match.id,
            registrationId: participant.registration_id,
          }),
        )
        onDragStart()
      }}
      onDragEnd={onDragEnd}
    >
      <p
        className={`min-w-0 flex-1 truncate text-[11px] ${
          participant.is_winner
            ? "font-extrabold text-emerald-800"
            : "font-semibold text-[#1c1b1b]"
        }`}
      >
        {getMatchParticipantName(participant)}
      </p>
      <DriverTitleChip
        label={participant.registration?.driver_title_label}
        className="px-1 py-0 text-[9px]"
      />
      {/*
        Vắng mặt / bỏ cuộc / bị loại phải hiện ra ngay trên sơ đồ.

        Không có nhãn này thì người bị xử thua vắng mặt trông y hệt người thua
        trên sân, và nhìn vào sơ đồ không biết trận đó có diễn ra hay không —
        thông tin đó cần cho cả ban tổ chức lẫn người khiếu nại.
      */}
      {(() => {
        const anomaly = getParticipantAnomalyBadge(participant.status)
        if (!anomaly) return null
        return (
          <Badge
            variant="outline"
            title={anomaly.full}
            className={`shrink-0 px-1 text-[9px] font-bold ${anomaly.className}`}
          >
            {anomaly.short}
          </Badge>
        )
      })()}
      {participant.is_winner ? (
        <Badge
          variant="outline"
          className="shrink-0 gap-0.5 border-emerald-200 bg-emerald-50 px-1 text-[9px] font-bold text-emerald-700"
        >
          <Trophy className="size-2.5" />
        </Badge>
      ) : null}
    </div>
  )
}
