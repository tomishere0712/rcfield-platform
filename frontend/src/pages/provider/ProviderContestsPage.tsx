import { useMemo } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  AlertTriangle,
  CheckCircle2,
  Flag,
  Pencil,
  Play,
  Plus,
  Square,
  Trash2,
  Users,
} from "lucide-react"
import { Link, useNavigate, useSearchParams } from "react-router"
import { toast } from "sonner"

import { routePaths } from "@/app/router/route-paths"
import {
  contestApi,
  contestQueryKeys,
} from "@/features/contests/api/contest.api"
import {
  getContestEditAvailability,
  getContestStatusClass,
  getContestStatusLabel,
} from "@/features/contests/lib/contest-status"
import type { ContestItem, ContestStatus } from "@/features/contests/types"
import {
  Panel,
  PanelTitle,
  ProviderPageHeader,
} from "@/pages/provider/components/ProviderPrimitives"
import { getContestWorkspacePath } from "@/pages/provider/contest-runtime/contest-workspace"
import { ProviderShell } from "@/pages/provider/components/ProviderShell"
import { Badge } from "@/shared/ui/badge"
import { Button } from "@/shared/ui/button"
import { ConfirmDialog } from "@/shared/ui/confirm-dialog"

export function ProviderContestsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const query = searchParams.get("query") ?? ""
  const status = searchParams.get("status") ?? ""
  const formatId = searchParams.get("contest_format_id") ?? ""
  const formatsQuery = useQuery({
    queryKey: contestQueryKeys.catalogFormats(),
    queryFn: contestApi.listContestFormats,
  })

  const contestsQuery = useQuery({
    queryKey: contestQueryKeys.list({
      scope: "managed",
      query,
      status,
      contest_format_id: formatId,
    }),
    queryFn: () =>
      contestApi.listContests({
        scope: "managed",
        limit: 100,
        query: query || undefined,
        status: (status || undefined) as ContestStatus | undefined,
        contest_format_id: formatId || undefined,
      }),
  })
  const laneCountsQuery = useQuery({
    queryKey: contestQueryKeys.list({
      scope: "managed",
      query,
      contest_format_id: formatId,
      lanes: true,
    }),
    queryFn: () =>
      contestApi.listContests({
        scope: "managed",
        limit: 100,
        query: query || undefined,
        contest_format_id: formatId || undefined,
      }),
    enabled: Boolean(status),
  })

  const updateStatusMutation = useMutation({
    mutationFn: async ({
      id,
      action,
    }: {
      id: string
      action: "open" | "close" | "cancel"
    }) => {
      if (action === "open") return contestApi.openContest(id)
      if (action === "close") return contestApi.closeContest(id)
      return contestApi.cancelContest(id)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: contestQueryKeys.all })
    },
  })

  const contests = useMemo(
    () => contestsQuery.data?.data ?? [],
    [contestsQuery.data?.data],
  )
  const laneCountContests = useMemo(
    () => (status ? (laneCountsQuery.data?.data ?? []) : contests),
    [status, laneCountsQuery.data?.data, contests],
  )
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: laneCountContests.length }
    for (const contest of laneCountContests) {
      counts[contest.status] = (counts[contest.status] ?? 0) + 1
    }
    return counts
  }, [laneCountContests])

  const handleStatusAction = async (
    id: string,
    action: "open" | "close" | "cancel",
  ) => {
    try {
      await updateStatusMutation.mutateAsync({ id, action })
      toast.success("Đã cập nhật trạng thái contest")
    } catch (error) {
      toast.error("Không thể cập nhật trạng thái contest", {
        description: getErrorMessage(error),
      })
    }
  }

  return (
    <ProviderShell>
      <ProviderPageHeader
        title="Giải đấu"
        description="Tạo và vận hành các giải đấu theo catalog loại giải, format và template lấy trực tiếp từ hệ thống."
      />

      <Panel className="mt-4">
        <PanelTitle
          title="Danh sách giải đấu"
          action={
            <Button
              type="button"
              onClick={() => navigate(routePaths.providerContestCreate)}
              className="h-10 gap-2 rounded-lg bg-[#1c1b1b] px-4 text-white hover:bg-[#313030] font-bold"
            >
              <Plus className="size-4" />
              Tạo giải đấu
            </Button>
          }
        />
        <div className="mb-4 grid gap-3 lg:grid-cols-3">
          <input
            value={query}
            onChange={(event) =>
              updateContestFilters(searchParams, setSearchParams, {
                query: event.target.value,
              })
            }
            placeholder="Tìm theo tên giải đấu"
            className="h-10 rounded-lg border border-[#c4c7c8] px-3 text-sm"
          />
          <select
            value={status}
            onChange={(event) =>
              updateContestFilters(searchParams, setSearchParams, {
                status: event.target.value,
              })
            }
            className="h-10 rounded-lg border border-[#c4c7c8] px-3 text-sm"
          >
            <option value="">Tất cả trạng thái</option>
            <option value="DRAFT">Bản nháp</option>
            <option value="OPEN">Đang mở đăng ký</option>
            <option value="CLOSED">Đã đóng đăng ký</option>
            <option value="RUNNING">Đang diễn ra</option>
            <option value="COMPLETED">Đã hoàn thành</option>
            <option value="CANCELLED">Đã hủy</option>
          </select>
          <select
            value={formatId}
            onChange={(event) =>
              updateContestFilters(searchParams, setSearchParams, {
                contest_format_id: event.target.value,
              })
            }
            className="h-10 rounded-lg border border-[#c4c7c8] px-3 text-sm"
          >
            <option value="">Tất cả format</option>
            {(formatsQuery.data ?? []).map((format) => (
              <option key={format.id} value={format.id}>
                {format.name}
              </option>
            ))}
          </select>
        </div>
        <div className="mb-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
          {contestStatusLanes.map((lane) => {
            const isActive =
              status === lane.value || (!status && lane.value === "")
            return (
              <button
                key={lane.label}
                type="button"
                onClick={() =>
                  updateContestFilters(searchParams, setSearchParams, {
                    status: lane.value,
                  })
                }
                className={`rounded-xl border px-3 py-3 text-left transition ${
                  isActive
                    ? "border-[#1f2424] bg-[#1f2424] text-white shadow-sm"
                    : "border-[#e5e2e1] bg-[#f7f4f2] text-[#1f2424] hover:border-orange-200 hover:bg-orange-50"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-black uppercase">
                    {lane.label}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-black ${isActive ? "bg-white/15 text-white" : "bg-white text-[#5d5f5f]"}`}
                  >
                    {statusCounts[lane.value || "ALL"] ?? 0}
                  </span>
                </div>
                <p
                  className={`mt-1 text-xs font-semibold ${isActive ? "text-white/75" : "text-[#747878]"}`}
                >
                  {lane.hint}
                </p>
              </button>
            )
          })}
        </div>

        {contestsQuery.isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="h-24 animate-pulse rounded-xl bg-[#f6f3f2]"
              />
            ))}
          </div>
        ) : contestsQuery.isError ? (
          <p className="rounded-xl border border-dashed border-[#c4c7c8] p-8 text-center text-sm font-semibold text-[#747878]">
            Không tải được danh sách giải đấu.
          </p>
        ) : contests.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#c4c7c8] p-10 text-center">
            <Flag className="mx-auto size-8 text-[#c4c7c8]" />
            <p className="mt-3 text-sm font-semibold text-[#747878]">
              Chưa có giải đấu nào.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {contests.map((contest) => (
              <article
                key={contest.id}
                className="rounded-xl border border-[#e5e2e1] bg-white p-5 shadow-sm"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        to={getContestWorkspacePath(contest.id, "overview")}
                        className="text-lg font-extrabold text-[#1c1b1b] hover:text-[#c2410c]"
                      >
                        {contest.name}
                      </Link>
                      <Badge
                        className={`border ${getContestStatusClass(contest.status)}`}
                      >
                        {getContestStatusLabel(contest.status)}
                      </Badge>
                    </div>
                    {/* Không mô tả thì không in gì. Dòng "Chưa có mô tả giải
                        đấu." chiếm nguyên một hàng trên MỌI thẻ để nói rằng
                        không có gì để nói. */}
                    {contest.description ? (
                      <p className="mt-2 text-sm font-medium text-[#5d5f5f]">
                        {contest.description}
                      </p>
                    ) : null}
                    {/*
                      Bỏ "Template" khỏi dòng này: mỗi khuôn mẫu ghim sẵn đúng
                      một thể thức và được đặt trùng tên luôn, nên nó lặp lại y
                      nguyên chữ vừa đọc ở "Format" — hai lần "Đấu loại trực
                      tiếp" cạnh nhau trên từng thẻ.

                      Bỏ luôn các nhãn "Loại:/Format:/Entry fee:": chúng dài hơn
                      chính giá trị, và giá trị thì tự nói được nó là gì.
                    */}
                    <p className="mt-3 text-xs font-semibold text-[#747878]">
                      {[
                        contest.contest_type?.name,
                        contest.contest_format?.name,
                        contest.entry_fee > 0
                          ? `Lệ phí ${formatCurrency(contest.entry_fee)}`
                          : "Miễn lệ phí",
                        `${contest.participating_branches.length} chi nhánh`,
                      ]
                        .filter(Boolean)
                        .join("  ·  ")}
                    </p>
                    <ContestHealthBadges contest={contest} />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {(() => {
                      // Backend `updateContest` chỉ nhận DRAFT/OPEN. Không khoá
                      // thì provider mở được form, điền xong mới ăn lỗi 400.
                      const edit = getContestEditAvailability(contest)
                      return (
                        <Button
                          type="button"
                          variant="outline"
                          disabled={!edit.allowed}
                          title={edit.allowed ? undefined : edit.reason}
                          className="h-9 gap-2 rounded-lg border-[#c4c7c8] bg-[#f6f3f2] text-[#1c1b1b] hover:bg-[#ebe7e7] disabled:cursor-not-allowed disabled:opacity-50"
                          onClick={() =>
                            navigate(
                              routePaths.providerContestEdit.replace(
                                ":contestId",
                                contest.id,
                              ),
                            )
                          }
                        >
                          <Pencil className="size-4" />
                          Sửa
                        </Button>
                      )
                    })()}
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 gap-2 rounded-lg border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                      onClick={() =>
                        navigate(
                          getContestWorkspacePath(contest.id, "overview"),
                        )
                      }
                    >
                      <Flag className="size-4" />
                      Vận hành
                    </Button>
                    {contest.status === "DRAFT" ? (
                      <Button
                        type="button"
                        className="h-9 gap-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
                        onClick={() =>
                          void handleStatusAction(contest.id, "open")
                        }
                      >
                        <Play className="size-4" />
                        Mở
                      </Button>
                    ) : null}
                    {contest.status === "OPEN" ? (
                      <Button
                        type="button"
                        className="h-9 gap-2 rounded-lg bg-amber-600 text-white hover:bg-amber-700"
                        onClick={() =>
                          void handleStatusAction(contest.id, "close")
                        }
                      >
                        <Square className="size-4" />
                        Đóng đăng ký
                      </Button>
                    ) : null}
                    {/*
                      Ẩn hẳn nút Huỷ khi backend chắc chắn từ chối.

                      Bày một cái nút rồi để nó báo lỗi mỗi lần bấm là tệ hơn
                      không có nút: người dùng không biết mình làm sai ở đâu, và
                      lần sau vẫn bấm lại vì nút vẫn ở đó mời gọi.

                      Điều kiện phải TRÙNG với `assertNoCollectedEntryFees` ở
                      backend — cùng một câu hỏi thì phải cùng một câu trả lời.
                    */}
                    {!["COMPLETED", "CANCELLED"].includes(contest.status) &&
                    (contest.public_stats?.entry_fee_paid_count ?? 0) > 0 ? (
                      <p className="max-w-[220px] text-right text-xs font-semibold text-[#747878]">
                        Không huỷ được — {contest.public_stats?.entry_fee_paid_count} người đã
                        nộp lệ phí. Hoàn tiền và miễn lệ phí cho họ trước.
                      </p>
                    ) : null}
                    {!["COMPLETED", "CANCELLED"].includes(contest.status) &&
                    (contest.public_stats?.entry_fee_paid_count ?? 0) === 0 ? (
                      /*
                        Hỏi lại trước khi huỷ. Trước đây một cú bấm là huỷ luôn
                        cả giải LẪN toàn bộ đăng ký của vận động viên, không có
                        bước nào để dừng lại — mà nút "Hủy" thì nằm ngay cạnh
                        "Vận hành" trên mọi thẻ.

                        Backend còn một chốt nữa: giải đã thu lệ phí thì từ chối
                        huỷ và trả về số người cùng số tiền. Hộp thoại này chỉ
                        chặn cú bấm nhầm, không thay cho chốt đó.
                      */
                      <ConfirmDialog
                        title={
                          contest.status === "RUNNING"
                            ? "Huỷ giải đang diễn ra?"
                            : "Huỷ giải đấu này?"
                        }
                        description={[
                          contest.status === "RUNNING"
                            ? "Giải này ĐANG DIỄN RA."
                            : null,
                          `Toàn bộ ${contest.public_stats?.registration_count ?? 0} đăng ký sẽ bị huỷ theo và không khôi phục được.`,
                          // Giải đang chạy thì đã có kết quả trên sân. Nói rõ
                          // thứ sắp mất — người bấm nút đang nghĩ tới việc huỷ
                          // một sự kiện, không nghĩ tới việc xoá thành tích của
                          // những người đã thi đấu xong.
                          (contest.match_stats?.total_rounds ?? 0) > 0
                            ? `${contest.match_stats?.total_rounds} vòng đấu và mọi kết quả đã nhập cũng bị huỷ.`
                            : null,
                          "Nếu đã có người nộp lệ phí, hệ thống sẽ từ chối — hoàn tiền cho họ trước rồi mới huỷ được giải.",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        confirmLabel="Huỷ giải đấu"
                        trigger={
                          <Button
                            type="button"
                            variant="outline"
                            className="h-9 gap-2 rounded-lg border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                          >
                            <Trash2 className="size-4" />
                            Hủy
                          </Button>
                        }
                        onConfirm={() =>
                          void handleStatusAction(contest.id, "cancel")
                        }
                      />
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </Panel>
    </ProviderShell>
  )
}

const contestStatusLanes = [
  { label: "Tất cả", value: "", hint: "Toàn bộ giải đấu" },
  { label: "Bản nháp", value: "DRAFT", hint: "Chuẩn bị cấu hình" },
  { label: "Đang mở", value: "OPEN", hint: "Đang nhận đăng ký" },
  { label: "Đang diễn ra", value: "RUNNING", hint: "Vận hành sơ đồ đấu" },
  { label: "Đã hoàn thành", value: "COMPLETED", hint: "Bảng xếp hạng/kết quả" },
  { label: "Đã hủy", value: "CANCELLED", hint: "Đã hủy" },
] as const

/**
 * Nhãn tình trạng — chỉ hiện thứ ĐANG cần biết ở giai đoạn hiện tại.
 *
 * Trước đây luôn in đủ năm nhãn cho mọi giải, nên một giải mới tạo đã bị cảnh
 * báo vàng "Chưa công bố bảng xếp hạng" (đương nhiên chưa, giải còn chưa chạy),
 * còn một giải đã xong vẫn bị nhắc "Chưa phân công staff" (nhắc để làm gì nữa).
 *
 * Hậu quả không phải là xấu mà là VÔ DỤNG: khi mọi thẻ đều vàng thì màu vàng
 * không còn nghĩa gì, và người dùng phải đọc hết từng chữ để tìm giải nào thật
 * sự cần đụng tới. Có mười giải là thành một bức tường.
 *
 * Luật ở đây: một nhãn chỉ xuất hiện khi nó vừa ĐÚNG LÚC vừa CÓ VIỆC ĐỂ LÀM.
 */
function ContestHealthBadges({ contest }: { contest: ContestItem }) {
  const stats = contest.public_stats
  const registrationCount = stats?.registration_count ?? 0
  const confirmedCount = stats?.confirmed_count ?? 0
  const checkedInCount = stats?.checked_in_count ?? 0
  const capacityRemaining = stats?.capacity_remaining
  const staffCount = contest.staff_assignments?.length ?? 0
  // Danh sách dùng match_stats đi kèm sẵn; runtime_summary chỉ có ở trang chi
  // tiết nên ở đây nó luôn undefined và nhãn từng báo sai là "chưa tạo bracket".
  const matchStats = contest.match_stats
  const totalRounds = matchStats?.total_rounds ?? 0
  const hasLiveMatches = Boolean(matchStats?.has_live_matches)
  const leaderboardPublished = Boolean(contest.published_leaderboard)

  const status = contest.status
  const isFinished = status === "COMPLETED" || status === "CANCELLED"
  const isRunning = status === "RUNNING"
  const isTakingSignups = status === "DRAFT" || status === "OPEN"

  type Chip = {
    key: string
    icon: React.ReactNode
    label: string
    tone: "ok" | "warn" | "neutral" | "live"
  }
  const chips: Chip[] = []

  // Đang chạy: chỉ một thứ đáng nhìn từ danh sách — có trận đang diễn ra không.
  if (isRunning && hasLiveMatches) {
    chips.push({
      key: "live",
      icon: <Flag className="size-3.5" />,
      label: "Đang có trận đấu",
      tone: "live",
    })
  }

  // Số người: luôn có ý nghĩa, nhưng chỗ trống còn lại chỉ đáng quan tâm khi
  // vẫn còn nhận đăng ký.
  chips.push({
    key: "registrations",
    icon: <Users className="size-3.5" />,
    label:
      isTakingSignups &&
      capacityRemaining !== null &&
      capacityRemaining !== undefined
        ? `${registrationCount} đăng ký · còn ${capacityRemaining} chỗ`
        : `${registrationCount} vận động viên`,
    tone: isTakingSignups && registrationCount === 0 ? "warn" : "neutral",
  })

  // Duyệt và điểm danh chỉ là việc trong ngày thi đấu.
  if (!isFinished && !isTakingSignups) {
    chips.push({
      key: "approval",
      icon:
        checkedInCount > 0 ? (
          <CheckCircle2 className="size-3.5" />
        ) : (
          <AlertTriangle className="size-3.5" />
        ),
      label: `${confirmedCount} đã duyệt · ${checkedInCount} đã điểm danh`,
      tone: checkedInCount > 0 ? "ok" : "warn",
    })
  }

  // Thiếu nhân sự chỉ là vấn đề khi giải chưa xong. Giải đã kết thúc mà còn bị
  // nhắc phân công thì đó là tiếng ồn thuần tuý.
  if (!isFinished && staffCount === 0) {
    chips.push({
      key: "staff",
      icon: <AlertTriangle className="size-3.5" />,
      label: "Chưa phân công nhân sự",
      tone: "warn",
    })
  }

  // Chưa bốc thăm chỉ đáng cảnh báo khi đã tới lúc phải bốc.
  if (!isFinished) {
    if (totalRounds > 0) {
      chips.push({
        key: "runtime",
        icon: <CheckCircle2 className="size-3.5" />,
        label: `${totalRounds} vòng đấu`,
        tone: "ok",
      })
    } else if (!isTakingSignups) {
      chips.push({
        key: "runtime",
        icon: <AlertTriangle className="size-3.5" />,
        label: "Chưa bốc thăm",
        tone: "warn",
      })
    }
  }

  // Bảng xếp hạng: chỉ nói khi đã có, hoặc khi giải chạy xong mà còn thiếu.
  if (leaderboardPublished) {
    chips.push({
      key: "leaderboard",
      icon: <CheckCircle2 className="size-3.5" />,
      label: "Đã công bố kết quả",
      tone: "ok",
    })
  } else if (status === "COMPLETED") {
    chips.push({
      key: "leaderboard",
      icon: <AlertTriangle className="size-3.5" />,
      label: "Chưa công bố kết quả",
      tone: "warn",
    })
  }

  if (chips.length === 0) return null

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {chips.map((chip) => (
        <span
          key={chip.key}
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${getHealthBadgeClass(chip.tone)}`}
        >
          {chip.icon}
          {chip.label}
        </span>
      ))}
    </div>
  )
}

function getHealthBadgeClass(tone: "ok" | "warn" | "neutral" | "live") {
  switch (tone) {
    case "ok":
      return "border-emerald-200 bg-emerald-50 text-emerald-700"
    case "warn":
      return "border-amber-200 bg-amber-50 text-amber-800"
    case "live":
      return "border-blue-200 bg-blue-50 text-blue-700"
    default:
      return "border-[#e5e2e1] bg-[#f6f3f2] text-[#5d5f5f]"
  }
}

function updateContestFilters(
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

function formatCurrency(value: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value)
}

function getErrorMessage(error: unknown) {
  const maybe = error as { response?: { data?: { message?: string } } }
  return maybe.response?.data?.message ?? "Vui lòng thử lại."
}
