import { useCallback, useMemo, useState } from "react"
import { useParams, useSearchParams } from "react-router"
import { useQuery } from "@tanstack/react-query"

import {
  contestApi,
  contestQueryKeys,
} from "@/features/contests/api/contest.api"
import { useContestRuntime } from "@/features/contests/hooks/useContestRuntime"
import {
  findNextPendingMatchId,
  getContestRuntimeFormat,
} from "@/features/contests/lib/contest-runtime"
import { getMatchStatusLabel } from "@/features/contests/lib/contest-status"
import type { ContestMatchStatus } from "@/features/contests/types"
import { ContestKnockoutBracket } from "@/pages/provider/contest-runtime/components/ContestKnockoutBracket"
import { ContestMatchBoard } from "@/pages/provider/contest-runtime/components/ContestMatchBoard"
import { ContestMatchDetailPanel } from "@/pages/provider/contest-runtime/components/match-detail/ContestMatchDetailPanel"
import { StaffSearchInput } from "../components/StaffSearchInput"
import { StaffSelect } from "../components/StaffSelect"
import { StaffCard, StaffHeader } from "../components/StaffUI"
import { StaffContestOverview } from "./components/StaffContestOverview"
import { StaffExpenseFormCard } from "./components/StaffExpenseFormCard"

const matchStatusOptions = [
  { value: "DRAFT", label: getMatchStatusLabel("DRAFT") },
  { value: "READY", label: getMatchStatusLabel("READY") },
  { value: "RUNNING", label: getMatchStatusLabel("RUNNING") },
  { value: "COMPLETED", label: getMatchStatusLabel("COMPLETED") },
  { value: "CANCELLED", label: getMatchStatusLabel("CANCELLED") },
]

export default function StaffContestRuntimePage() {
  const { contestId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const participantQuery = searchParams.get("participantQuery") ?? ""
  const matchStatus = searchParams.get("matchStatus") ?? ""
  const roundNo = searchParams.get("roundNo") ?? ""
  const runtime = useContestRuntime(contestId, {
    matches: {
      participant_query: participantQuery || undefined,
      status: (matchStatus || undefined) as ContestMatchStatus | undefined,
      round_no: roundNo ? Number(roundNo) : undefined,
    },
  })
  const contestQuery = useQuery({
    queryKey: contestQueryKeys.detail(contestId),
    queryFn: () => contestApi.getContest(contestId!),
    enabled: Boolean(contestId),
  })
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null)
  const contest = contestQuery.data
  const isKnockoutRuntime = getContestRuntimeFormat(contest) === "KNOCKOUT"
  const matches = useMemo(
    () => runtime.matchesQuery.data ?? [],
    [runtime.matchesQuery.data],
  )
  const selectedMatch = useMemo(
    () =>
      matches.find((match) => match.id === selectedMatchId) ??
      matches[0] ??
      null,
    [matches, selectedMatchId],
  )

  // Đua tính giờ có hàng chục lượt nhập liên tiếp. Lưu xong đưa luôn con trỏ
  // sang lượt chưa xong kế tiếp, để nhân viên khỏi cuộn ngược lên danh sách
  // chọn từng dòng một. Phải khai TRƯỚC mọi nhánh return sớm — hook đặt trong
  // nhánh điều kiện là sai thứ tự hook giữa các lần dựng.
  const handleResultsSaved = useCallback(
    (savedMatchId: string) => {
      const nextId = findNextPendingMatchId(matches, savedMatchId)
      if (nextId) setSelectedMatchId(nextId)
    },
    [matches],
  )

  if (!contest) {
    return (
      <div className="space-y-6">
        <StaffHeader
          title="Vận hành lượt đấu"
          subtitle="Không tìm thấy giải đấu để vận hành lượt đấu."
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <StaffHeader
        title={`${contest.name} · Vận hành lượt đấu`}
        subtitle={
          isKnockoutRuntime
            ? "Nhấp vào trận trên sơ đồ để chọn người thắng hoặc xử thua vắng mặt. Người thắng tự sang vòng sau."
            : "Nhân viên được phân công có thể xem lượt đấu, đổi thứ tự người chơi, nhập kết quả và chuyển sang lượt tiếp theo."
        }
      />

      {/* Lọc bớt trận sẽ làm khuyết cây nhánh, nên đấu loại không dùng bộ lọc. */}
      {isKnockoutRuntime ? null : (
        <StaffCard className="grid gap-3 lg:grid-cols-3">
          <StaffSearchInput
            value={participantQuery}
            onChange={(value) =>
              updateRuntimeParams(searchParams, setSearchParams, {
                participantQuery: value,
              })
            }
            placeholder="Tìm người chơi theo tên"
          />
          <StaffSelect
            value={matchStatus}
            onChange={(value) =>
              updateRuntimeParams(searchParams, setSearchParams, {
                matchStatus: value,
              })
            }
            options={matchStatusOptions}
            placeholder="Tất cả trạng thái lượt đấu"
          />
          <StaffSearchInput
            value={roundNo}
            onChange={(value) =>
              updateRuntimeParams(searchParams, setSearchParams, {
                roundNo: value.replace(/[^\d]/g, ""),
              })
            }
            placeholder="Lọc theo vòng"
          />
        </StaffCard>
      )}

      {/* Tổng quan đặt đầu tiên: nhân viên cần biết mình đang trực giải nào, ở
          đâu, khách mang xe hay thuê xe, còn ai chưa tới — trước khi nhìn sơ đồ. */}
      <StaffContestOverview
        contest={contest}
        metrics={runtime.metricsQuery.data}
        contestId={contestId}
      />

      <div className="space-y-4">
        {/* Đấu loại: nhân viên xem sơ đồ cây giống ban tổ chức, nhưng không sắp
            lại được cặp đấu — bốc thăm là việc của ban tổ chức. */}
        {isKnockoutRuntime ? (
          <ContestKnockoutBracket
            matches={matches}
            selectedMatchId={selectedMatch?.id ?? null}
            onSelectMatch={setSelectedMatchId}
            onStageAdvance={() => {}}
            onUndo={() => {}}
            onCommit={() => {}}
            canUndo={false}
            hasChanges={false}
            readOnly
          />
        ) : (
          <ContestMatchBoard
            contest={contest}
            registrations={[]}
            matches={matches}
            selectedMatchId={selectedMatch?.id ?? null}
            onSelectMatch={setSelectedMatchId}
            runtime={runtime}
            showGenerate={false}
          />
        )}
        <ContestMatchDetailPanel
          match={selectedMatch}
          runtime={runtime}
          isKnockoutRuntime={isKnockoutRuntime}
          onResultsSaved={handleResultsSaved}
        />

        {/* Đặt cuối trang: việc chính của màn này là vận hành trận đấu. Thẻ chi
            phí tự ẩn khi giải chưa chạy nên không chiếm chỗ vô ích. */}
        <StaffExpenseFormCard
          contestId={contestId}
          contestStatus={contest?.status}
        />
      </div>
    </div>
  )
}

function updateRuntimeParams(
  currentParams: URLSearchParams,
  setSearchParams: ReturnType<typeof useSearchParams>[1],
  updates: Record<string, string>,
) {
  const next = new URLSearchParams(currentParams)
  for (const [key, value] of Object.entries(updates)) {
    if (!value) next.delete(key)
    else next.set(key, value)
  }
  setSearchParams(next)
}
