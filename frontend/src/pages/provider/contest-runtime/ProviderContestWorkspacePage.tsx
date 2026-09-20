import { useCallback, useEffect, useMemo, useState } from "react"
import {
  BarChart3,
  CalendarCheck2,
  Flag,
  PlayCircle,
  MoreHorizontal,
  CircleDollarSign,
} from "lucide-react"
import {
  Navigate,
  useBeforeUnload,
  useBlocker,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router"
import { toast } from "sonner"
import { routePaths } from "@/app/router/route-paths"
import { useContestWorkspace } from "@/features/contests/hooks/useContestWorkspace"
import { useQuery } from "@tanstack/react-query"
import {
  contestApi,
  contestQueryKeys,
} from "@/features/contests/api/contest.api"
import {
  applyStagedParticipants,
  formatMatchLabel,
  getErrorMessage,
  getMatchParticipantName,
  getMatchPhase,
  getPublishedLeaderboard,
  findNextPendingMatchId,
} from "@/features/contests/lib/contest-runtime"
import { getContestEditAvailability } from "@/features/contests/lib/contest-status"
import { cn } from "@/shared/lib/utils"
import type {
  ContestEntryFeePaymentStatus,
  ContestMatchStatus,
  ContestParticipantStatus,
  ContestRegistrationStatus,
  ContestUpdateMatchParticipantsBody,
  ContestAuditLogsQuery,
} from "@/features/contests/types"
import {
  ProviderPageHeader,
  MetricCard,
} from "@/pages/provider/components/ProviderPrimitives"
import { ProviderShell } from "@/pages/provider/components/ProviderShell"
import { Badge } from "@/shared/ui/badge"
import { ConfirmDialog } from "@/shared/ui/confirm-dialog"
import { Button } from "@/shared/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu"
import { ContestAuditPanel } from "./components/ContestAuditPanel"
import { ContestFinancePanel } from "./components/ContestFinancePanel"
import { ContestStaffPanel } from "./components/ContestStaffPanel"
import { ContestFeePanel } from "./components/ContestFeePanel"
import { ContestKnockoutBracket } from "./components/ContestKnockoutBracket"
import { ContestGrandPrixFlow } from "./components/ContestGrandPrixFlow"
import { ContestLeaderboardPanel } from "./components/ContestLeaderboardPanel"
import { ContestMatchBoard } from "./components/ContestMatchBoard"
import { ContestMatchDetailPanel } from "./components/match-detail/ContestMatchDetailPanel"
import { ContestRegistrationPanel } from "./components/ContestRegistrationPanel"
import { ContestRuntimeOverview } from "./components/ContestRuntimeOverview"
import {
  defaultContestWorkspaceSection,
  type ContestWorkspaceSectionKey,
} from "./contest-workspace"

const sectionSummaries: Record<ContestWorkspaceSectionKey, string> = {
  overview: "Tổng quan điều hành, trạng thái giải và các chỉ số sẵn sàng.",
  registrations:
    "Duyệt đăng ký, xử lý lệ phí, điểm danh và kỷ luật người chơi.",
  bracket: "Bốc thăm sơ đồ, theo dõi từng trận và nhập kết quả.",
  leaderboard: "Theo dõi bản nháp, công bố và đồng bộ bảng xếp hạng.",
  finance: "Thu chi của giải: lệ phí đã thu, phí tổ chức và số dư lãi lỗ.",
  audit: "Xem lại toàn bộ nhật ký thao tác phát sinh trong contest.",
  staff: "Phân công nhân viên được vận hành giải này.",
}

export function ProviderContestWorkspacePage({
  section = defaultContestWorkspaceSection,
}: {
  section?: ContestWorkspaceSectionKey
}) {
  const navigate = useNavigate()
  const { contestId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const registrationStatus = searchParams.get("registrationStatus") ?? ""
  const paymentStatus = searchParams.get("paymentStatus") ?? ""
  const registrationQuery = searchParams.get("registrationQuery") ?? ""
  const matchStatus = searchParams.get("matchStatus") ?? ""
  const participantQuery = searchParams.get("participantQuery") ?? ""
  const roundNo = searchParams.get("roundNo") ?? ""
  const auditPage = Math.max(1, Number(searchParams.get("auditPage") || "1"))
  const auditLimit = [10, 20, 50, 100].includes(
    Number(searchParams.get("auditLimit")),
  )
    ? Number(searchParams.get("auditLimit"))
    : 20

  const needsRegistrations =
    section === "overview" ||
    section === "registrations" ||
    section === "bracket"
  const needsMatches = section === "overview" || section === "bracket"
  const needsMetrics = section === "overview" || section === "leaderboard"
  const needsAuditLogs = section === "audit"
  // Lệnh cấm theo người nên nạp cùng danh sách người chơi; phân công nhân viên
  // là việc riêng, chỉ tab Nhân sự mới cần.
  const needsBans = section === "registrations"
  const needsStaff = section === "staff"

  const workspace = useContestWorkspace(contestId, {
    registrations: {
      status: (registrationStatus || undefined) as
        | ContestRegistrationStatus
        | undefined,
      payment_status: (paymentStatus || undefined) as
        | ContestEntryFeePaymentStatus
        | undefined,
      query: registrationQuery || undefined,
    },
    matches: {
      status: (matchStatus || undefined) as ContestMatchStatus | undefined,
      participant_query: participantQuery || undefined,
      round_no: roundNo ? Number(roundNo) : undefined,
    },
    auditLogs: {
      page: auditPage,
      limit: auditLimit,
    } as ContestAuditLogsQuery,
    enabled: {
      registrations: needsRegistrations,
      matches: needsMatches,
      metrics: needsMetrics,
      auditLogs: needsAuditLogs,
      staffAssignments: needsStaff,
      bans: needsBans,
      staffOptions: needsStaff,
    },
  })

  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null)
  const [selectedCafeId, setSelectedCafeId] = useState("")
  const [stagedParticipantsByMatch, setStagedParticipantsByMatch] = useState<
    Record<string, ContestUpdateMatchParticipantsBody["participants"]>
  >({})
  const [stagedHistory, setStagedHistory] = useState<
    Array<Record<string, ContestUpdateMatchParticipantsBody["participants"]>>
  >([])

  const contest = workspace.runtime.contestQuery.data
  const registrations = workspace.runtime.registrationsQuery.data ?? []
  const apiMatches = useMemo(
    () => workspace.runtime.matchesQuery.data ?? [],
    [workspace.runtime.matchesQuery.data],
  )
  const matches = useMemo(
    () => applyStagedParticipants(apiMatches, stagedParticipantsByMatch),
    [apiMatches, stagedParticipantsByMatch],
  )
  const metrics = workspace.runtime.metricsQuery.data
  // Ba thẻ luôn hiện; đồng bộ và doanh thu chỉ hiện khi thật sự có gì để nói.
  const visibleMetricCount =
    3 +
    (metrics?.leaderboard.published ? 1 : 0) +
    ((contest?.entry_fee ?? 0) > 0 ? 1 : 0)
  const auditLogsResponse = workspace.runtime.auditLogsQuery.data
  const auditLogs = auditLogsResponse?.data ?? []
  const auditMeta = auditLogsResponse?.meta
  const leaderboard = getPublishedLeaderboard(contest)
  const selectedMatch = useMemo(
    () => matches.find((match) => match.id === selectedMatchId) ?? null,
    [matches, selectedMatchId],
  )
  const runtimeFormat = String(
    contest?.config?.runtime_format ??
      contest?.config?.format ??
      contest?.contest_format?.code ??
      "KNOCKOUT",
  )
  const isKnockoutRuntime = runtimeFormat === "KNOCKOUT"
  const isQualifyingFinalRuntime = runtimeFormat === "QUALIFYING_FINAL"
  const isBracketRuntime = isKnockoutRuntime || isQualifyingFinalRuntime

  const feeQuery = useQuery({
    queryKey: contestQueryKeys.fee(contestId),
    queryFn: () => contestApi.getContestFeeStatus(contestId!),
    enabled: Boolean(contestId) && section === "overview",
  })
  const order = feeQuery.data?.order ?? null

  const selectedMatchIsKnockout =
    isKnockoutRuntime ||
    (isQualifyingFinalRuntime &&
      selectedMatch !== null &&
      getMatchPhase(selectedMatch) === "FINAL")
  const hasStagedBracketChanges =
    Object.keys(stagedParticipantsByMatch).length > 0

  // Sơ đồ kéo thả chỉ nằm trong bộ nhớ tới khi bấm Lưu. Chặn cả ba đường làm
  // mất nó: đóng/tải lại tab, chuyển sang mục khác của workspace, và bấm sang
  // trang khác trong ứng dụng.
  useBeforeUnload(
    useCallback(
      (event: BeforeUnloadEvent) => {
        if (!hasStagedBracketChanges) return
        event.preventDefault()
      },
      [hasStagedBracketChanges],
    ),
  )

  const bracketBlocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      hasStagedBracketChanges &&
      currentLocation.pathname !== nextLocation.pathname,
  )

  useEffect(() => {
    if (contest && !selectedCafeId) {
      queueMicrotask(() => {
        setSelectedCafeId(
          contest.host_branch?.cafe_id ??
            contest.participating_branches[0]?.cafe_id ??
            "",
        )
      })
    }
  }, [contest, selectedCafeId])

  useEffect(() => {
    if (!selectedMatchId && matches.length > 0) {
      queueMicrotask(() => setSelectedMatchId(matches[0].id))
    }
  }, [matches, selectedMatchId])

  // Đua tính giờ có hàng chục lượt nhập liên tiếp. Lưu xong đưa luôn con trỏ
  // sang lượt chưa xong kế tiếp, để khỏi cuộn ngược lên danh sách chọn từng dòng.
  const handleResultsSaved = useCallback(
    (savedMatchId: string) => {
      const nextId = findNextPendingMatchId(matches, savedMatchId)
      if (nextId) setSelectedMatchId(nextId)
    },
    [matches],
  )

  useEffect(() => {
    queueMicrotask(() => {
      setStagedParticipantsByMatch({})
      setStagedHistory([])
    })
  }, [contestId])

  // Sơ đồ knockout và Grand Prix phải luôn nhận đủ trận. Nếu URL còn bộ lọc
  // từ thể thức dạng danh sách, xoá chúng ngay để không làm khuyết cây/standings.
  useEffect(() => {
    if (
      section !== "bracket" ||
      !isBracketRuntime ||
      (!matchStatus && !participantQuery && !roundNo)
    ) {
      return
    }
    const next = new URLSearchParams(searchParams)
    next.delete("matchStatus")
    next.delete("participantQuery")
    next.delete("roundNo")
    setSearchParams(next, { replace: true })
  }, [
    isBracketRuntime,
    matchStatus,
    participantQuery,
    roundNo,
    searchParams,
    section,
    setSearchParams,
  ])

  const handleAuditPageChange = (nextPage: number) => {
    updateWorkspaceSearchParams(searchParams, setSearchParams, {
      auditPage: String(nextPage),
      auditLimit: String(auditLimit),
    })
  }

  const handleSyncRaceRecords = async () => {
    try {
      const result =
        await workspace.runtime.syncRaceRecordsMutation.mutateAsync()
      toast.success("Đã đồng bộ thành tích toàn hệ thống", {
        description: `${result.synced_count} record mới, ${result.superseded_count} record bị thay thế.`,
      })
    } catch (error) {
      toast.error("Không thể đồng bộ thành tích", {
        description: getErrorMessage(error).message,
      })
    }
  }

  const stageParticipantAdvance = async (
    sourceMatchId: string,
    targetMatchId: string,
    registrationId: string,
    submitResult?: {
      finishPosition?: number | null
      score?: number | null
      bestLapSeconds?: number | null
      totalTimeSeconds?: number | null
      status?: ContestParticipantStatus
      isWinner?: boolean
      resultNote?: string | null
    },
  ) => {
    const sourceMatch = matches.find((match) => match.id === sourceMatchId)
    const targetMatch = matches.find((match) => match.id === targetMatchId)
    if (!sourceMatch || !targetMatch) return
    const participant = sourceMatch.participants.find(
      (item) => item.registration_id === registrationId,
    )
    if (!participant) return
    if (targetMatch.round_no <= sourceMatch.round_no) {
      toast.error("Chỉ được đưa người đi tiếp sang vòng sâu hơn")
      return
    }
    if (targetMatch.status === "COMPLETED") {
      toast.error("Không thể chỉnh trận đã hoàn tất")
      return
    }

    if (submitResult) {
      try {
        const otherParticipant = sourceMatch.participants.find(
          (p) => p.registration_id !== registrationId,
        )
        const derivedFinishPosition =
          submitResult.finishPosition ?? (submitResult.isWinner ? 1 : 2)
        const derivedStatus = submitResult.status ?? "FINISHED"
        /*
          Không nhập thành tích thì GIỮ NGUYÊN số cũ, đừng ghi đè bằng rỗng.

          Hộp thoại giờ luôn gửi kết quả (để ghi người thắng), còn phần lap và
          điểm chỉ có khi người dùng mở ô "nhập thêm thành tích". Nếu ở đây vẫn
          quy về `null` thì mỗi lần kéo thả lại xoá sạch thành tích đã nhập ở
          màn nhập kết quả trước đó.
        */
        const updatedResults = [
          {
            registration_id: registrationId,
            score: submitResult.score ?? participant.score ?? 10,
            best_lap_seconds:
              submitResult.bestLapSeconds ?? participant.best_lap_seconds ?? null,
            total_time_seconds:
              submitResult.totalTimeSeconds ?? participant.total_time_seconds ?? null,
            is_winner: submitResult.isWinner ?? true,
            finish_position: derivedFinishPosition,
            status: derivedStatus,
            result_note: submitResult.resultNote ?? participant.result_note ?? null,
          },
        ]
        if (otherParticipant) {
          updatedResults.push({
            registration_id: otherParticipant.registration_id,
            score: otherParticipant.score ?? 0,
            best_lap_seconds: otherParticipant.best_lap_seconds ?? null,
            total_time_seconds: otherParticipant.total_time_seconds ?? null,
            is_winner: !submitResult.isWinner,
            finish_position: derivedFinishPosition === 1 ? 2 : 1,
            status: otherParticipant.status ?? "FINISHED",
            result_note: otherParticipant.result_note ?? null,
          })
        }
        await workspace.runtime.submitResultsMutation.mutateAsync({
          matchId: sourceMatchId,
          body: {
            reason: `Chuyển người thi đấu từ sơ đồ ${formatMatchLabel(sourceMatch)}`,
            results: updatedResults,
          },
        })
        toast.success(
          `Đã cập nhật kết quả cho ${formatMatchLabel(sourceMatch)}`,
        )
      } catch (err) {
        toast.error("Không thể cập nhật kết quả trận nguồn", {
          description: getErrorMessage(err).message,
        })
      }
    }

    setStagedParticipantsByMatch((current) => {
      setStagedHistory((history) => [...history, current])
      const currentTarget =
        current[targetMatchId] ??
        targetMatch.participants.map((item) => ({
          registration_id: item.registration_id,
          slot_no: item.slot_no,
          lane: item.lane,
          grid_position: item.grid_position,
          seed_no: item.seed_no,
        }))

      const deduped = currentTarget.filter(
        (item) => item.registration_id !== registrationId,
      )
      if (deduped.length >= 2) {
        toast.error("Trận knockout chỉ nhận tối đa 2 người")
        return current
      }

      const nextSlotNo = deduped.length + 1
      return {
        ...current,
        [targetMatchId]: [
          ...deduped,
          {
            registration_id: registrationId,
            slot_no: nextSlotNo,
            lane: `L${nextSlotNo}`,
            grid_position: null,
            seed_no: participant.seed_no,
          },
        ],
      }
    })

    toast.success(
      `Đã xếp ${getMatchParticipantName(participant)} vào ${formatMatchLabel(targetMatch)}`,
    )
  }

  const undoStagedBracket = () => {
    setStagedHistory((history) => {
      const previous = history.at(-1)
      if (!previous) return history
      setStagedParticipantsByMatch(previous)
      return history.slice(0, -1)
    })
  }

  const commitStagedBracket = async () => {
    const entries = Object.entries(stagedParticipantsByMatch)
    if (entries.length === 0) return
    try {
      for (const [matchId, participants] of entries) {
        await workspace.runtime.updateParticipantsMutation.mutateAsync({
          matchId,
          body: { participants },
        })
      }
      setStagedParticipantsByMatch({})
      setStagedHistory([])
      toast.success("Đã lưu nhánh đấu")
    } catch (error) {
      toast.error("Không thể lưu nhánh đấu", {
        description: getErrorMessage(error).message,
      })
    }
  }

  if (!contestId) {
    return <Navigate replace to={routePaths.providerContests} />
  }

  if (workspace.runtime.contestQuery.isLoading) {
    return (
      <ProviderShell>
        <ProviderPageHeader
          title="Điều hành giải đấu"
          description="Đang tải dữ liệu contest..."
        />
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="h-32 animate-pulse rounded-xl bg-[#f6f3f2]"
            />
          ))}
        </div>
      </ProviderShell>
    )
  }

  if (!contest) {
    return (
      <ProviderShell>
        <ProviderPageHeader
          title="Điều hành giải đấu"
          description="Không tìm thấy contest để vận hành."
        />
      </ProviderShell>
    )
  }

  // Khoá sửa giải theo đúng luật backend áp, kèm lý do — thay vì cho bấm rồi
  // mới nhận lỗi 400 mà người dùng không hiểu vì sao. Cửa chặn công bố nằm ở
  // chính nút công bố trong tab Bảng xếp hạng.
  const editAvailability = getContestEditAvailability(contest)

  const showFeePanel = !(order?.status === "PAID" && contest.status !== "DRAFT")

  const moreAction = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8 border-[#c4c7c8] bg-white text-[#1c1b1b] hover:bg-[#f6f3f2] rounded-lg"
        >
          <MoreHorizontal className="size-4" />
          <span className="sr-only">Thao tác khác</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-52 rounded-xl p-1.5 border border-[#c4c7c8] bg-white shadow-md z-50"
      >
        <DropdownMenuItem
          disabled={!editAvailability.allowed}
          title={editAvailability.allowed ? undefined : editAvailability.reason}
          className="cursor-pointer rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[#1c1b1b] hover:bg-[#f6f3f2] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          onClick={() =>
            navigate(
              routePaths.providerContestEdit.replace(":contestId", contest.id),
            )
          }
        >
          Chỉnh sửa giải đấu
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!metrics?.leaderboard.published}
          className="cursor-pointer rounded-lg px-2.5 py-1.5 text-xs font-semibold text-orange-700 hover:bg-orange-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          onClick={() => void handleSyncRaceRecords()}
        >
          Đồng bộ toàn hệ thống
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  return (
    <ProviderShell contentClassName="max-w-none">
      <ProviderPageHeader
        title={
          <span
            className="block max-w-full truncate text-xl font-extrabold tracking-tight text-[#1c1b1b] md:text-2xl"
            title={contest.name}
          >
            {contest.name}
          </span>
        }
        h2Title={contest.name}
        description={
          <p className="text-[11px] font-semibold text-[#5d5f5f]">
            {sectionSummaries[section]}
          </p>
        }
        titleClassName="w-full"
        contentClassName="sm:items-center"
      />

      {section === "overview" && showFeePanel ? (
        <div className="mb-4">
          <ContestFeePanel contest={contest} action={moreAction} />
        </div>
      ) : null}

      {section === "overview" ? (
        // Hai thẻ cuối có thể ẩn, nên số cột phải bám theo số thẻ thật. Cố định
        // 4 cột thì khi đủ 5 thẻ, thẻ thứ năm rơi xuống một hàng riêng bỏ trống
        // ba ô bên cạnh.
        <section
          className={cn(
            "mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2",
            visibleMetricCount === 5
              ? "xl:grid-cols-5"
              : visibleMetricCount === 4
                ? "xl:grid-cols-4"
                : "xl:grid-cols-3",
          )}
        >
          <MetricCard
            label="Đăng ký"
            value={String(
              metrics?.registration_counts.total ?? registrations.length,
            )}
            helper={`${metrics?.registration_counts.confirmed ?? 0} đã duyệt / ${metrics?.registration_counts.checked_in ?? 0} đã check-in`}
            icon={<Flag />}
            tone="info"
            compact
          />
          <MetricCard
            label="Thi đấu"
            value={String(metrics?.match_counts.total ?? matches.length)}
            helper={`${metrics?.match_counts.completed ?? 0} đã hoàn tất`}
            icon={<PlayCircle />}
            tone="success"
            compact
          />
          <MetricCard
            label="Bảng xếp hạng"
            value={metrics?.leaderboard.published ? "Đã công bố" : "Bản nháp"}
            helper={
              metrics?.leaderboard.published_at
                ? new Date(metrics.leaderboard.published_at).toLocaleString(
                    "vi-VN",
                  )
                : "Chưa công bố"
            }
            icon={<BarChart3 />}
            tone={metrics?.leaderboard.published ? "success" : "warning"}
            compact
          />
          {/* Đồng bộ thành tích chỉ xảy ra sau khi công bố bảng xếp hạng, nên
              trước đó thẻ này luôn đứng ở "Chưa đồng bộ" — một ô chiếm chỗ để
              nói rằng chưa tới lượt nó. */}
          {metrics?.leaderboard.published ? (
            <MetricCard
              label="Đồng bộ toàn hệ thống"
              value={metrics.global_sync.synced ? "Đã đồng bộ" : "Chưa đồng bộ"}
              helper={
                metrics.global_sync.synced_at
                  ? new Date(metrics.global_sync.synced_at).toLocaleString(
                      "vi-VN",
                    )
                  : "Chưa đồng bộ thành tích"
              }
              icon={<CalendarCheck2 />}
              tone={metrics.global_sync.synced ? "success" : "neutral"}
              compact
            />
          ) : null}
          {/* Giải miễn phí thì cả ba con số doanh thu đều là 0đ mãi mãi. */}
          {contest.entry_fee > 0 ? (
            <MetricCard
              label="Doanh thu lệ phí"
              value={formatVnd(metrics?.revenue?.paid_revenue ?? 0)}
              helper={`Dự kiến ${formatVnd(metrics?.revenue?.expected_revenue ?? 0)} · Chờ ${formatVnd(metrics?.revenue?.pending_revenue ?? 0)}`}
              icon={<CircleDollarSign />}
              tone="success"
              compact
            />
          ) : null}
        </section>
      ) : (
        <section className="mb-3 flex flex-wrap items-center gap-2">
          <Badge className="border border-[#c4c7c8] bg-white px-2.5 py-1 text-xs text-[#444748]">
            {sectionSummaries[section]}
          </Badge>
        </section>
      )}

      {section === "overview" ? (
        <ContestRuntimeOverview
          contest={contest}
          registrations={registrations}
          matches={matches}
          metrics={metrics}
          action={!showFeePanel ? moreAction : undefined}
        />
      ) : null}

      {section === "registrations" ? (
        <ContestRegistrationPanel
          contest={contest}
          registrations={registrations}
          workspace={workspace}
          selectedCafeId={selectedCafeId}
          onChangeSelectedCafeId={setSelectedCafeId}
        />
      ) : null}

      {section === "bracket" ? (
        <div className="space-y-4">
          {/* Lọc bớt trận sẽ làm khuyết cây nhánh — sơ đồ chỉ đúng khi có đủ
              mọi trận. Các thể thức dạng danh sách thì vẫn cần lọc. */}
          {isBracketRuntime ? null : (
            <section className="grid gap-3 rounded-xl border border-[#e5e2e1] bg-white p-4 lg:grid-cols-3">
              <input
                value={participantQuery}
                onChange={(event) =>
                  updateWorkspaceSearchParams(searchParams, setSearchParams, {
                    participantQuery: event.target.value,
                  })
                }
                placeholder="Tìm theo tên người thi đấu"
                className="h-10 rounded-lg border border-[#c4c7c8] px-3 text-sm"
              />
              <select
                value={matchStatus}
                onChange={(event) =>
                  updateWorkspaceSearchParams(searchParams, setSearchParams, {
                    matchStatus: event.target.value,
                  })
                }
                className="h-10 rounded-lg border border-[#c4c7c8] px-3 text-sm"
              >
                <option value="">Tất cả trạng thái trận</option>
                <option value="DRAFT">Nháp</option>
                <option value="READY">Sẵn sàng</option>
                <option value="RUNNING">Đang chạy</option>
                <option value="COMPLETED">Đã xong</option>
                <option value="CANCELLED">Đã huỷ</option>
              </select>
              <input
                value={roundNo}
                onChange={(event) =>
                  updateWorkspaceSearchParams(searchParams, setSearchParams, {
                    roundNo: event.target.value.replace(/[^\d]/g, ""),
                  })
                }
                placeholder="Lọc theo vòng"
                className="h-10 rounded-lg border border-[#c4c7c8] px-3 text-sm"
              />
            </section>
          )}

          {isKnockoutRuntime ? (
            <div className="space-y-4">
              {/* Sơ đồ cây đã vẽ đúng những trận này rồi nên không liệt kê lại. */}
              <ContestMatchBoard
                contest={contest}
                registrations={registrations}
                matches={matches}
                selectedMatchId={selectedMatchId}
                onSelectMatch={setSelectedMatchId}
                runtime={workspace.runtime}
                showGenerate
                showMatchList={false}
              />
              <ContestKnockoutBracket
                matches={matches}
                selectedMatchId={selectedMatchId}
                onSelectMatch={setSelectedMatchId}
                canUndo={stagedHistory.length > 0}
                hasChanges={hasStagedBracketChanges}
                onUndo={undoStagedBracket}
                onCommit={commitStagedBracket}
                onStageAdvance={stageParticipantAdvance}
              />
            </div>
          ) : isQualifyingFinalRuntime ? (
            <div className="space-y-4">
              <ContestMatchBoard
                contest={contest}
                registrations={registrations}
                matches={matches}
                selectedMatchId={selectedMatchId}
                onSelectMatch={setSelectedMatchId}
                runtime={workspace.runtime}
                showGenerate
                showMatchList={false}
              />
              <ContestGrandPrixFlow
                contest={contest}
                matches={matches}
                selectedMatchId={selectedMatchId}
                onSelectMatch={setSelectedMatchId}
                canUndo={stagedHistory.length > 0}
                hasChanges={hasStagedBracketChanges}
                onUndo={undoStagedBracket}
                onCommit={commitStagedBracket}
                onStageAdvance={stageParticipantAdvance}
              />
            </div>
          ) : (
            <ContestMatchBoard
              contest={contest}
              registrations={registrations}
              matches={matches}
              selectedMatchId={selectedMatchId}
              onSelectMatch={setSelectedMatchId}
              runtime={workspace.runtime}
            />
          )}

          <ContestMatchDetailPanel
            match={selectedMatch}
            runtime={workspace.runtime}
            isKnockoutRuntime={selectedMatchIsKnockout}
            hasPendingBracketChanges={hasStagedBracketChanges}
            onResultsSaved={handleResultsSaved}
          />
        </div>
      ) : null}

      {section === "leaderboard" ? (
        <ContestLeaderboardPanel
          contest={contest}
          leaderboard={leaderboard}
          metrics={metrics}
          runtime={workspace.runtime}
        />
      ) : null}

      {section === "finance" ? (
        <ContestFinancePanel contestId={contestId} />
      ) : null}

      {section === "audit" ? (
        <ContestAuditPanel
          logs={auditLogs}
          page={auditPage}
          limit={auditLimit}
          total={auditMeta?.total ?? auditLogs.length}
          onPageChange={handleAuditPageChange}
        />
      ) : null}

      {section === "staff" ? <ContestStaffPanel workspace={workspace} /> : null}

      <ConfirmDialog
        open={bracketBlocker.state === "blocked"}
        onOpenChange={(open) => {
          if (!open) bracketBlocker.reset?.()
        }}
        title="Sơ đồ chưa được lưu"
        description="Bạn đã kéo người sang trận khác nhưng chưa bấm Lưu sơ đồ. Rời khỏi đây là mất hết thay đổi đó."
        confirmLabel="Rời đi, bỏ thay đổi"
        cancelLabel="Ở lại để lưu"
        destructive
        onConfirm={() => bracketBlocker.proceed?.()}
      />
    </ProviderShell>
  )
}

function formatVnd(value: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value)
}

function updateWorkspaceSearchParams(
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
