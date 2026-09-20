import { useEffect, useMemo, useState } from "react"
import { Flag, PlayCircle, Trophy } from "lucide-react"
import { contestGenerateMatchesSchema } from "@/features/contests/schemas/contest.schema"
import type {
  ContestItem,
  ContestMatch,
  ContestRegistration,
} from "@/features/contests/types"
import {
  areAllMatchesCompleted,
  formatContestDateTime,
  formatDurationSeconds,
  formatMatchLabel,
  getContestRuntimeFormat,
  getEligibleRuntimeRegistrations,
  getErrorMessage,
  getMatchParticipantName,
  getQualifyingStandings,
  getRegistrationDisplayName,
  groupMatchesByRound,
  isQualifyingFinalFormat,
  splitMatchesByPhase,
} from "@/features/contests/lib/contest-runtime"
import {
  getContestDrawAvailability,
  getParticipantAnomalyBadge,
  getMatchStatusClass,
  getMatchStatusLabel,
  getMatchTypeLabel,
  getRegistrationStatusLabel,
} from "@/features/contests/lib/contest-status"
import { useGenerateFinalBracket } from "@/features/contests/hooks/use-contest-booking"
import {
  Panel,
  PanelTitle,
} from "@/pages/provider/components/ProviderPrimitives"
import { DriverTitleChip } from "@/features/racing/components/DriverTitleChip"
import { Badge } from "@/shared/ui/badge"
import { Button } from "@/shared/ui/button"
import { ConfirmDialog } from "@/shared/ui/confirm-dialog"
import { toast } from "sonner"
import type { useContestRuntime } from "@/features/contests/hooks/useContestRuntime"

type RuntimeHook = ReturnType<typeof useContestRuntime>

export function ContestMatchBoard({
  contest,
  registrations,
  matches,
  selectedMatchId,
  onSelectMatch,
  runtime,
  showGenerate = true,
  showMatchList = true,
}: {
  contest: ContestItem
  registrations: ContestRegistration[]
  matches: ContestMatch[]
  selectedMatchId: string | null
  onSelectMatch: (matchId: string) => void
  runtime: RuntimeHook
  showGenerate?: boolean
  /** Đấu loại đã có sơ đồ cây vẽ đúng những trận này nên tắt danh sách đi cho khỏi trùng. */
  showMatchList?: boolean
}) {
  const runtimeFormat = getContestRuntimeFormat(contest)
  // Đấu loại bốc thăm ngẫu nhiên từ toàn bộ người đã duyệt; các thể thức khác
  // vẫn xếp lượt tại chỗ theo người đã điểm danh.
  const isKnockoutDraw = runtimeFormat === "KNOCKOUT"
  const eligibleRegistrations = useMemo(
    () =>
      getEligibleRuntimeRegistrations(registrations, {
        includeConfirmed: isKnockoutDraw,
      }),
    [registrations, isKnockoutDraw],
  )
  const [selectedRegistrationIds, setSelectedRegistrationIds] = useState<
    string[]
  >([])
  const [selectedCafeId, setSelectedCafeId] = useState("")
  const [seedingMode, setSeedingMode] = useState<"MANUAL" | "CHECK_IN_ORDER">(
    "CHECK_IN_ORDER",
  )

  useEffect(() => {
    queueMicrotask(() => {
      setSelectedRegistrationIds(eligibleRegistrations.map((item) => item.id))
    })
  }, [eligibleRegistrations])

  useEffect(() => {
    queueMicrotask(() => {
      setSelectedCafeId(
        contest.host_branch?.cafe_id ??
          contest.participating_branches[0]?.cafe_id ??
          "",
      )
    })
  }, [contest])

  const matchGroups = useMemo(() => groupMatchesByRound(matches), [matches])

  /**
   * Nói trước sắp sinh ra bao nhiêu lượt và mỗi lượt mấy người.
   *
   * Không có dòng này thì đua tính giờ là cái bẫy: chọn 15 người rồi bấm tạo,
   * ra 15 lượt mỗi lượt MỘT người — trông như hệ thống bỏ qua thứ mình vừa
   * chọn. Thật ra thể thức nó vậy: chạy một mình bấm giờ, không có đối thủ
   * cùng lượt.
   */
  const generatePreview = useMemo(() => {
    const selectedCount = selectedRegistrationIds.length
    // Phải khớp TỪNG CHI TIẾT với `resolveRunsPerDriver` ở backend: thiếu cấu
    // hình thì mặc định 3 lượt, và luôn kẹp trong khoảng 1–5. Đoán mặc định là 1
    // thì khối "Sẽ tạo ra" báo 15 lượt rồi hệ thống sinh ra 45 — đúng kiểu nói
    // dối mà khối này sinh ra để dẹp.
    const rawRuns = Number(contest.config?.runs_per_driver)
    const runsPerDriver = Number.isFinite(rawRuns)
      ? Math.min(5, Math.max(1, Math.floor(rawRuns)))
      : 3

    if (runtimeFormat === "TIME_TRIAL" || isQualifyingFinalFormat(runtimeFormat)) {
      const totalRuns = selectedCount * runsPerDriver
      const phase = isQualifyingFinalFormat(runtimeFormat) ? " vòng loại" : ""
      return {
        headline: `${totalRuns} lượt chạy${phase} · mỗi lượt 1 vận động viên`,
        note:
          runsPerDriver > 1
            ? `${selectedCount} VĐV × ${runsPerDriver} lượt mỗi người. Đua tính giờ chạy một mình bấm giờ, lấy vòng nhanh nhất qua tất cả các lượt.`
            : "Đua tính giờ chạy một mình bấm giờ, không có đối thủ cùng lượt. Các lượt cách nhau 5 phút." +
              (isQualifyingFinalFormat(runtimeFormat)
                ? " Nhánh chung kết 2 người mỗi trận sinh sau, từ bảng xếp hạng vòng loại."
                : ""),
      }
    }

    return {
      headline: `${Math.ceil(selectedCount / 2)} trận · mỗi trận 2 vận động viên`,
      note: "Đấu loại trực tiếp ghép cặp, người thắng đi tiếp. Số lẻ thì có người được vào thẳng vòng sau.",
    }
  }, [selectedRegistrationIds, contest.config, runtimeFormat])

  const isQualifyingFinal = isQualifyingFinalFormat(runtimeFormat)
  const { qualifying: qualifyingMatches, final: finalMatches } = useMemo(
    () => splitMatchesByPhase(matches),
    [matches],
  )
  const qualifyingStandings = useMemo(
    () => getQualifyingStandings(qualifyingMatches),
    [qualifyingMatches],
  )
  const finalistsCount = Number(contest.config?.finalists ?? 4) || 4
  const generateFinalBracketMutation = useGenerateFinalBracket()
  const allQualifyingCompleted = areAllMatchesCompleted(qualifyingMatches)
  const canGenerateFinalBracket =
    isQualifyingFinal && allQualifyingCompleted && finalMatches.length === 0
  const generateFinalHint = !isQualifyingFinal
    ? null
    : finalMatches.length > 0
      ? "Nhánh chung kết đã được tạo."
      : qualifyingMatches.length === 0
        ? "Chưa có trận vòng loại nào."
        : !allQualifyingCompleted
          ? "Hoàn tất tất cả trận vòng loại để sinh nhánh chung kết."
          : null

  const handleGenerateFinalBracket = async () => {
    try {
      await generateFinalBracketMutation.mutateAsync(contest.id)
      toast.success("Đã sinh nhánh chung kết")
    } catch (error) {
      toast.error("Không thể sinh nhánh chung kết", {
        description: getErrorMessage(error).message,
      })
    }
  }

  // Trận thắng do gặp ô trống không tính là đã thi đấu, nên vẫn bốc lại được
  // chừng nào chưa ai thật sự chạy — đúng luật `isDecidedByPlay` ở backend.
  const hasPlayedMatch = matches.some(
    (match) =>
      match.status === "RUNNING" ||
      (match.status === "COMPLETED" &&
        match.metadata?.bye !== true &&
        match.metadata?.empty_slot !== true),
  )
  const drawAvailability = getContestDrawAvailability(contest, {
    eligibleCount: eligibleRegistrations.length,
    hasPlayedMatch,
  })

  const handleGenerate = async () => {
    // Bốc thăm không gửi danh sách người: backend tự lấy toàn bộ người đã duyệt
    // rồi xáo bằng seed lưu lại được, nên không ai can thiệp được vào lá thăm.
    // Không gửi `drivers_per_match`: thể thức tự quyết số người mỗi lượt, và
    // backend lấy giá trị từ cấu hình giải khi trường này vắng mặt.
    const rawData = isKnockoutDraw
      ? { cafe_id: selectedCafeId }
      : {
          cafe_id: selectedCafeId,
          registration_ids: selectedRegistrationIds,
          seeding_mode: seedingMode,
        }

    const result = contestGenerateMatchesSchema.safeParse(rawData)
    if (!result.success) {
      toast.error(
        isKnockoutDraw ? "Không thể bốc thăm" : "Không thể tạo lượt thi đấu",
        { description: result.error.issues[0]?.message },
      )
      return
    }

    try {
      await runtime.generateMatchesMutation.mutateAsync(result.data)
      toast.success(
        isKnockoutDraw ? "Đã bốc thăm xong sơ đồ đấu" : "Đã tạo các lượt đấu",
      )
    } catch (error) {
      toast.error(
        isKnockoutDraw ? "Không thể bốc thăm" : "Không thể tạo lượt đấu",
        {
          description: getErrorMessage(error).message,
        },
      )
    }
  }

  return (
    <div
      className={`grid gap-4 ${
        showGenerate && showMatchList ? "xl:grid-cols-[0.9fr_1.1fr]" : ""
      }`}
    >
      {showGenerate ? (
        <Panel>
          <PanelTitle
            title={isKnockoutDraw ? "Bốc thăm sơ đồ đấu" : "Tạo lượt thi đấu"}
            subtitle={
              isKnockoutDraw
                ? "Xáo ngẫu nhiên toàn bộ người đã duyệt rồi xếp vào sơ đồ. Bốc xong đăng ký đóng lại và sơ đồ công khai cho khách xem."
                : "Chỉ người chơi đã điểm danh mới được đưa vào thi đấu."
            }
          />
          <div className="space-y-4">
            <Field label="Chi nhánh vận hành">
              <select
                className="h-10 w-full rounded-lg border border-[#c4c7c8] bg-white px-3 text-sm"
                value={selectedCafeId}
                onChange={(event) => setSelectedCafeId(event.target.value)}
              >
                {contest.participating_branches.map((branch) => (
                  <option key={branch.id} value={branch.cafe_id}>
                    {branch.cafe?.name ?? branch.cafe_id}
                  </option>
                ))}
              </select>
            </Field>

            {isKnockoutDraw ? null : (
              <div className="space-y-4">
                <Field label="Cách xếp thứ tự">
                  <select
                    className="h-10 w-full rounded-lg border border-[#c4c7c8] bg-white px-3 text-sm"
                    value={seedingMode}
                    onChange={(event) =>
                      setSeedingMode(event.target.value as typeof seedingMode)
                    }
                  >
                    <option value="CHECK_IN_ORDER">
                      Theo thứ tự điểm danh
                    </option>
                    <option value="MANUAL">Theo danh sách đã chọn</option>
                  </select>
                </Field>

                {/*
                  Thay cho ô "Số người mỗi trận/lượt" đã bỏ.

                  Ô đó cho gõ một con số nhưng KHÔNG engine nào đọc — thể thức tự
                  quyết số người mỗi lượt. Gõ 2 vào giải đua tính giờ vẫn ra 15
                  lượt một người, và người dùng không hiểu vì sao con số mình vừa
                  nhập biến mất. Thà nói thẳng sắp tạo ra cái gì.
                */}
                <div className="rounded-lg border border-[#e5e2e1] bg-[#fcf8f8] p-3">
                  <p className="text-xs font-extrabold uppercase tracking-wider text-[#747878]">
                    Sẽ tạo ra
                  </p>
                  <p className="mt-1 text-sm font-semibold text-[#1c1b1b]">
                    {generatePreview.headline}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-[#747878]">
                    {generatePreview.note}
                  </p>
                </div>
              </div>
            )}

            <div>
              <p className="mb-2 text-xs font-extrabold uppercase tracking-wider text-[#747878]">
                {isKnockoutDraw
                  ? `${eligibleRegistrations.length} người sẽ vào sơ đồ`
                  : "Người chơi đủ điều kiện vào thi đấu"}
              </p>
              <div className="max-h-72 space-y-2 overflow-y-auto rounded-lg border border-[#e5e2e1] bg-[#fcf8f8] p-3">
                {eligibleRegistrations.map((registration) => {
                  const checked = selectedRegistrationIds.includes(
                    registration.id,
                  )
                  return (
                    <label
                      key={registration.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-[#e5e2e1] bg-white px-3 py-2"
                    >
                      <span className="flex items-center gap-2">
                        {/* Bốc thăm lấy cả giải nên không có gì để tick chọn. */}
                        {isKnockoutDraw ? null : (
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) =>
                              setSelectedRegistrationIds((current) =>
                                event.target.checked
                                  ? [...current, registration.id]
                                  : current.filter(
                                      (item) => item !== registration.id,
                                    ),
                              )
                            }
                          />
                        )}
                        <span>
                          <span className="flex flex-wrap items-center gap-2 text-sm font-bold text-[#1c1b1b]">
                            <span>
                              {getRegistrationDisplayName(registration)}
                            </span>
                            <DriverTitleChip
                              label={registration.participant?.driverTitleLabel}
                            />
                          </span>
                          {registration.participant?.email ? (
                            <span className="block text-xs font-medium text-[#747878]">
                              {registration.participant.email}
                            </span>
                          ) : null}
                        </span>
                      </span>
                      <span className="text-xs font-semibold text-[#747878]">
                        {getRegistrationStatusLabel(registration.status)} ·{" "}
                        {registration.checkInCode ?? "--"}
                      </span>
                    </label>
                  )
                })}
                {eligibleRegistrations.length === 0 ? (
                  <p className="text-sm font-semibold text-[#747878]">
                    {isKnockoutDraw
                      ? "Chưa có người nào được duyệt vào giải."
                      : "Chưa có người đăng ký đủ điều kiện thi đấu."}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="space-y-2">
              <Button
                className="h-10 gap-2 rounded-lg bg-[#1c1b1b] text-white hover:bg-[#313030] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={
                  !drawAvailability.allowed ||
                  runtime.generateMatchesMutation.isPending
                }
                onClick={() => void handleGenerate()}
              >
                <PlayCircle className="size-4" />
                {isKnockoutDraw
                  ? matches.length > 0
                    ? "Bốc thăm lại"
                    : "Bốc thăm"
                  : "Tạo lượt thi đấu"}
              </Button>
              {drawAvailability.allowed ? null : (
                <p className="text-xs font-semibold text-amber-700">
                  {drawAvailability.reason}
                </p>
              )}
              {isKnockoutDraw &&
              drawAvailability.allowed &&
              matches.length > 0 ? (
                <p className="text-xs font-semibold text-[#747878]">
                  Bốc lại sẽ xoá sơ đồ hiện tại và xáo lại từ đầu.
                </p>
              ) : null}
            </div>
          </div>
        </Panel>
      ) : null}

      {showMatchList ? (
        <Panel>
          <PanelTitle
            title="Danh sách trận/lượt"
            subtitle={
              isQualifyingFinal
                ? "Vòng loại tính giờ trước, sau đó sinh nhánh chung kết từ bảng xếp hạng."
                : "Theo dõi theo từng vòng và chọn để nhập kết quả."
            }
            action={
              isQualifyingFinal ? (
                <div className="flex flex-col items-end gap-1">
                  <ConfirmDialog
                    title="Sinh nhánh chung kết?"
                    description={`Hệ thống sẽ lấy top ${finalistsCount} VĐV theo hạng vòng loại (lap tốt nhất) để xếp nhánh knockout chung kết.`}
                    confirmLabel="Sinh nhánh chung kết"
                    trigger={
                      <Button
                        type="button"
                        className="h-9 gap-2 rounded-lg bg-[#1c1b1b] text-white hover:bg-[#313030]"
                        disabled={!canGenerateFinalBracket}
                      >
                        <Trophy className="size-4" />
                        Sinh bracket chung kết
                      </Button>
                    }
                    onConfirm={handleGenerateFinalBracket}
                  />
                  {generateFinalHint ? (
                    <p className="text-xs font-semibold text-[#747878]">
                      {generateFinalHint}
                    </p>
                  ) : null}
                </div>
              ) : undefined
            }
          />
          {matches.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[#c4c7c8] p-10 text-center">
              <Flag className="mx-auto size-8 text-[#c4c7c8]" />
              <p className="mt-3 text-sm font-semibold text-[#747878]">
                Chưa có lượt đấu nào.
              </p>
            </div>
          ) : isQualifyingFinal ? (
            <div className="space-y-4">
              {qualifyingStandings.length > 0 ? (
                <div>
                  <h4 className="mb-2 text-sm font-extrabold uppercase tracking-wider text-[#747878]">
                    Bảng xếp hạng vòng loại
                  </h4>
                  <div className="overflow-x-auto rounded-lg border border-[#e5e2e1]">
                    <table className="w-full min-w-[520px] text-sm">
                      <thead>
                        <tr className="border-b border-[#e5e2e1] bg-[#fcf8f8] text-left text-xs font-extrabold uppercase tracking-wider text-[#747878]">
                          <th className="px-3 py-2">Hạng</th>
                          <th className="px-3 py-2">Người chơi</th>
                          <th className="px-3 py-2">Lap tốt nhất</th>
                          <th className="px-3 py-2">Tổng thời gian</th>
                          <th className="px-3 py-2">Ghi chú</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#f0eeee]">
                        {qualifyingStandings.map((standing, index) => (
                          <tr key={standing.registrationId}>
                            <td className="px-3 py-2 font-bold text-[#1c1b1b]">
                              {index + 1}
                            </td>
                            <td className="px-3 py-2">
                              <span className="flex flex-wrap items-center gap-2 font-semibold text-[#1c1b1b]">
                                {getMatchParticipantName(standing.participant)}
                                <DriverTitleChip
                                  label={
                                    standing.participant.registration
                                      ?.driver_title_label
                                  }
                                  className="px-2 py-0 text-[10px]"
                                />
                              </span>
                            </td>
                            <td className="px-3 py-2 font-semibold text-[#5d5f5f]">
                              {formatDurationSeconds(standing.bestLapSeconds)}
                            </td>
                            <td className="px-3 py-2 font-semibold text-[#5d5f5f]">
                              {formatDurationSeconds(standing.totalTimeSeconds)}
                            </td>
                            <td className="px-3 py-2">
                              {index < finalistsCount ? (
                                <Badge className="border border-emerald-200 bg-emerald-50 text-emerald-700">
                                  Vào chung kết
                                </Badge>
                              ) : null}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}

              <MatchPhaseSection
                title="Vòng loại (Qualifying)"
                matches={qualifyingMatches}
                selectedMatchId={selectedMatchId}
                onSelectMatch={onSelectMatch}
              />
              <MatchPhaseSection
                title="Chung kết (Final)"
                matches={finalMatches}
                emptyLabel="Chưa có nhánh chung kết. Hoàn tất vòng loại rồi bấm “Sinh nhánh chung kết”."
                selectedMatchId={selectedMatchId}
                onSelectMatch={onSelectMatch}
              />
            </div>
          ) : (
            <div className="space-y-4">
              {matchGroups.map((group) => (
                <div key={group.roundNo}>
                  {/*
                    Với đua tính giờ, `roundNo` là lượt chạy THỨ MẤY CỦA MỖI VĐV
                    chứ không phải vòng đấu — gọi là "Vòng 2" khiến người xem
                    tưởng đây là vòng trong, tức là đã loại bớt người ở vòng
                    trước. Thực tế cả 15 người đều chạy lại lượt hai.
                  */}
                  <h4 className="mb-2 text-sm font-extrabold uppercase tracking-wider text-[#747878]">
                    {isTimeTrialGroup(group.matches)
                      ? `Lượt chạy ${group.roundNo} · toàn bộ vận động viên`
                      : `Vòng ${group.roundNo}`}
                  </h4>
                  {isTimeTrialGroup(group.matches) ? (
                    <TimeTrialTable
                      matches={group.matches}
                      selectedMatchId={selectedMatchId}
                      onSelectMatch={onSelectMatch}
                    />
                  ) : (
                    <div className="grid gap-3 lg:grid-cols-2">
                      {group.matches.map((match) => (
                        <button
                          key={match.id}
                          type="button"
                          onClick={() => onSelectMatch(match.id)}
                          className={`rounded-lg border p-4 text-left transition-colors ${
                            selectedMatchId === match.id
                              ? "border-orange-200 bg-orange-50"
                              : "border-[#e5e2e1] bg-white hover:bg-[#fcf8f8]"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-extrabold text-[#1c1b1b]">
                                {formatMatchLabel(match)}
                              </p>
                              <p className="mt-1 text-xs font-semibold text-[#747878]">
                                Dự kiến:{" "}
                                {formatContestDateTime(match.scheduled_at)}
                              </p>
                            </div>
                            <Badge
                              className={`border ${getMatchStatusClass(match.status)}`}
                            >
                              {getMatchStatusLabel(match.status)}
                            </Badge>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-[#5d5f5f]">
                            <span>{getMatchTypeLabel(match.match_type)}</span>
                            <span>
                              {match.participants.length} người thi đấu
                            </span>
                            <span>Trận #{match.match_no}</span>
                          </div>
                          <div className="mt-3 space-y-1">
                            {match.participants
                              .slice(0, 3)
                              .map((participant) => (
                                <div
                                  key={participant.id}
                                  className="flex flex-wrap items-center gap-2 text-xs font-semibold text-[#5d5f5f]"
                                >
                                  <span>
                                    {getMatchParticipantName(participant)}
                                  </span>
                                  <DriverTitleChip
                                    label={
                                      participant.registration
                                        ?.driver_title_label
                                    }
                                    className="px-2 py-0 text-[10px]"
                                  />
                                </div>
                              ))}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Panel>
      ) : null}
    </div>
  )
}

/**
 * Đua tính giờ: mỗi "trận" là một lượt chạy của đúng MỘT người.
 *
 * Vẽ mỗi lượt thành một thẻ lớn thì ba dòng "Tính giờ", "1 người thi đấu" và tên
 * vận động viên lặp lại y hệt ở mọi thẻ, trong khi thứ nhân viên thật sự cần là
 * so thời gian giữa các lượt. Một giải 8 người ba vòng ra 24 thẻ — cuộn mỏi tay
 * mà vẫn không so được ai nhanh hơn ai.
 */
function isTimeTrialGroup(matches: ContestMatch[]): boolean {
  return (
    matches.length > 0 &&
    matches.every(
      (match) =>
        match.match_type === "TIME_ATTACK" && match.participants.length <= 1,
    )
  )
}

/** Giây sang dạng người đọc được: 62.4 → "1:02.4", 45.2 → "45.2s". */
function formatSeconds(value: number | null | undefined): string {
  if (value === null || value === undefined) return "--"
  if (value < 60) return `${value.toFixed(1)}s`
  const minutes = Math.floor(value / 60)
  const seconds = value - minutes * 60
  return `${minutes}:${seconds.toFixed(1).padStart(4, "0")}`
}

function formatClock(value: string | null | undefined): string {
  if (!value) return "--"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "--"
  return date.toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  })
}

function TimeTrialTable({
  matches,
  selectedMatchId,
  onSelectMatch,
}: {
  matches: ContestMatch[]
  selectedMatchId?: string | null
  onSelectMatch: (matchId: string) => void
}) {
  // Ngày thi đấu in một lần ở đầu bảng thay vì lặp ở từng dòng.
  const day = matches[0]?.scheduled_at
    ? new Date(matches[0].scheduled_at).toLocaleDateString("vi-VN")
    : null

  return (
    <div className="overflow-hidden rounded-lg border border-[#e5e2e1] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e5e2e1] bg-[#fcf8f8] px-3 py-2">
        <span className="text-xs font-extrabold uppercase tracking-wider text-[#747878]">
          Đua tính giờ · {matches.length} lượt · mỗi lượt 1 người
        </span>
        {day ? (
          <span className="text-xs font-semibold text-[#747878]">{day}</span>
        ) : null}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead>
            <tr className="border-b border-[#e5e2e1] text-xs font-extrabold uppercase tracking-wider text-[#747878]">
              <th className="px-3 py-2 font-extrabold">Thứ tự chạy</th>
              <th className="px-3 py-2 font-extrabold">Vận động viên</th>
              <th className="px-3 py-2 font-extrabold">Giờ chạy</th>
              <th className="px-3 py-2 font-extrabold">Vòng nhanh nhất</th>
              <th className="px-3 py-2 font-extrabold">Tổng thời gian</th>
              <th className="px-3 py-2 font-extrabold">Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {matches.map((match) => {
              const runner = match.participants[0]
              const selected = selectedMatchId === match.id
              return (
                <tr
                  key={match.id}
                  onClick={() => onSelectMatch(match.id)}
                  className={`cursor-pointer border-b border-[#f0eeed] last:border-b-0 transition-colors ${
                    selected ? "bg-orange-50" : "hover:bg-[#fcf8f8]"
                  }`}
                >
                  <td className="px-3 py-2 font-extrabold text-[#1c1b1b]">
                    #{match.match_no}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-[#1c1b1b]">
                        {runner ? getMatchParticipantName(runner) : "Chưa gán"}
                      </span>
                      <DriverTitleChip
                        label={runner?.registration?.driver_title_label}
                        className="px-2 py-0 text-[10px]"
                      />
                    </div>
                  </td>
                  <td className="px-3 py-2 font-semibold text-[#5d5f5f]">
                    {formatClock(match.scheduled_at)}
                  </td>
                  <td className="px-3 py-2 font-semibold text-[#5d5f5f]">
                    {formatSeconds(runner?.best_lap_seconds)}
                  </td>
                  <td className="px-3 py-2 font-semibold text-[#5d5f5f]">
                    {formatSeconds(runner?.total_time_seconds)}
                  </td>
                  <td className="px-3 py-2">
                    <Badge
                      className={`border ${getMatchStatusClass(match.status)}`}
                    >
                      {getMatchStatusLabel(match.status)}
                    </Badge>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-extrabold uppercase tracking-wider text-[#747878]">
        {label}
      </p>
      {children}
    </div>
  )
}

function MatchPhaseSection({
  title,
  matches,
  emptyLabel,
  selectedMatchId,
  onSelectMatch,
}: {
  title: string
  matches: ContestMatch[]
  emptyLabel?: string
  selectedMatchId: string | null
  onSelectMatch: (matchId: string) => void
}) {
  const groups = groupMatchesByRound(matches)
  return (
    <div>
      <h4 className="mb-2 text-sm font-extrabold uppercase tracking-wider text-[#747878]">
        {title}
      </h4>
      {matches.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[#c4c7c8] p-4 text-sm font-semibold text-[#747878]">
          {emptyLabel ?? "Chưa có trận nào."}
        </p>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => (
            <div key={group.roundNo} className="grid gap-3 lg:grid-cols-2">
              {group.matches.map((match) => (
                <MatchCard
                  key={match.id}
                  match={match}
                  selected={selectedMatchId === match.id}
                  onSelect={() => onSelectMatch(match.id)}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function MatchCard({
  match,
  selected,
  onSelect,
}: {
  match: ContestMatch
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`rounded-lg border p-4 text-left transition-colors ${
        selected
          ? "border-orange-200 bg-orange-50"
          : "border-[#e5e2e1] bg-white hover:bg-[#fcf8f8]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-extrabold text-[#1c1b1b]">
            {formatMatchLabel(match)}
          </p>
          <p className="mt-1 text-xs font-semibold text-[#747878]">
            Dự kiến: {formatContestDateTime(match.scheduled_at)}
          </p>
        </div>
        <Badge className={`border ${getMatchStatusClass(match.status)}`}>
          {getMatchStatusLabel(match.status)}
        </Badge>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-[#5d5f5f]">
        <span>{getMatchTypeLabel(match.match_type)}</span>
        <span>{match.participants.length} người thi đấu</span>
        <span>Trận #{match.match_no}</span>
      </div>
      <div className="mt-3 space-y-1">
        {match.participants.slice(0, 3).map((participant) => (
          <div
            key={participant.id}
            className="flex flex-wrap items-center gap-2 text-xs font-semibold text-[#5d5f5f]"
          >
            <span>{getMatchParticipantName(participant)}</span>
            <DriverTitleChip
              label={participant.registration?.driver_title_label}
              className="px-2 py-0 text-[10px]"
            />
            {/* Vắng mặt / bỏ cuộc / bị loại — cùng nhãn với sơ đồ đấu, để hai
                màn hình không kể hai câu chuyện khác nhau về cùng một trận. */}
            {(() => {
              const anomaly = getParticipantAnomalyBadge(participant.status)
              if (!anomaly) return null
              return (
                <span
                  title={anomaly.full}
                  className={`rounded-full border px-1.5 py-0 text-[10px] font-bold ${anomaly.className}`}
                >
                  {anomaly.short}
                </span>
              )
            })()}
          </div>
        ))}
      </div>
    </button>
  )
}
