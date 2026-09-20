import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { Flag, QrCode } from "lucide-react"
import { Link, useSearchParams } from "react-router"
import { routePaths } from "@/app/router/route-paths"
import {
  contestApi,
  contestQueryKeys,
} from "@/features/contests/api/contest.api"
import {
  getContestCheckInAvailability,
  getContestStatusClass,
  getContestStatusLabel,
} from "@/features/contests/lib/contest-status"
import type { ContestStatus } from "@/features/contests/types"
import { formatContestDateTime } from "@/features/contests/lib/contest-runtime"
import { StaffSearchInput } from "../components/StaffSearchInput"
import { StaffSelect } from "../components/StaffSelect"
import { StaffBadge, StaffCard, StaffHeader } from "../components/StaffUI"

const statusOptions = [
  { value: "OPEN", label: "Đang mở đăng ký" },
  { value: "CLOSED", label: "Đã đóng đăng ký" },
  { value: "RUNNING", label: "Đang diễn ra" },
]

export default function StaffContestsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const query = searchParams.get("query") ?? ""
  const status = searchParams.get("status") ?? ""
  const formatId = searchParams.get("contest_format_id") ?? ""

  const hasActiveFilters = Boolean(query || status || formatId)

  const formatsQuery = useQuery({
    queryKey: contestQueryKeys.catalogFormats(),
    queryFn: contestApi.listContestFormats,
  })

  // Lấy theo PHÂN CÔNG GIẢI, không theo chi nhánh đang trực.
  //
  // Trước đây màn này hỏi "chi nhánh tôi trực có giải nào" nên giải ở chi nhánh
  // khác mà nhân viên được phân công vào lại không hiện — thao tác "phân công
  // staff vào giải" của chủ quán gần như không có tác dụng nhìn thấy được.
  // Backend đã hiểu đúng từ đầu: `assertContestOperator` cho qua dựa trên
  // `contest_staff_assignments` chứ không xét chi nhánh.
  const contestsQuery = useQuery({
    queryKey: contestQueryKeys.list({
      scope: "managed",
      staff: true,
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

  const contests = useMemo(
    () =>
      (contestsQuery.data?.data ?? []).filter((contest) =>
        ["OPEN", "CLOSED", "RUNNING"].includes(contest.status),
      ),
    [contestsQuery.data],
  )

  const formatOptions = useMemo(
    () =>
      (formatsQuery.data ?? []).map((format) => ({
        value: format.id,
        label: format.name,
      })),
    [formatsQuery.data],
  )

  return (
    <div className="space-y-6">
      <StaffHeader
        title="Danh sách giải đấu"
        subtitle="Chọn giải đấu thuộc cơ sở hiện tại để tra cứu người đăng ký và thực hiện điểm danh."
      />

      <div className="grid gap-3 rounded-xl border border-[#e5e2e1] bg-white p-4 lg:grid-cols-3">
        <StaffSearchInput
          value={query}
          onChange={(value) =>
            updateContestFilters(searchParams, setSearchParams, {
              query: value,
            })
          }
          placeholder="Tìm theo tên giải đấu"
        />
        <StaffSelect
          value={status}
          onChange={(value) =>
            updateContestFilters(searchParams, setSearchParams, {
              status: value,
            })
          }
          options={statusOptions}
          placeholder="Tất cả trạng thái"
        />
        <StaffSelect
          value={formatId}
          onChange={(value) =>
            updateContestFilters(searchParams, setSearchParams, {
              contest_format_id: value,
            })
          }
          options={formatOptions}
          placeholder="Tất cả thể thức"
        />
      </div>

      {contestsQuery.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="h-28 animate-pulse rounded-xl bg-[#f5f3f2]"
            />
          ))}
        </div>
      ) : contests.length === 0 ? (
        <StaffCard className="py-10 text-center">
          <Flag className="mx-auto size-8 text-[#c4c7c8]" />
          {hasActiveFilters ? (
            <>
              <p className="mt-3 text-sm font-bold text-[#4c4a49]">
                Không có giải đấu nào khớp bộ lọc.
              </p>
              <button
                type="button"
                onClick={() => setSearchParams({})}
                className="mt-3 text-sm font-bold text-orange-600 underline"
              >
                Xoá bộ lọc
              </button>
            </>
          ) : (
            <>
              {/*
                Danh sách này chỉ hiện giải mà nhân viên ĐƯỢC PHÂN CÔNG vào,
                không phải mọi giải của chi nhánh. Câu "không có giải phù hợp"
                khiến nhân viên tưởng quán chưa có giải nào và không biết phải
                làm gì tiếp.
              */}
              <p className="mt-3 text-sm font-bold text-[#4c4a49]">
                Bạn chưa được phân công vào giải đấu nào ở chi nhánh này.
              </p>
              <p className="mx-auto mt-2 max-w-md text-sm text-[#747878]">
                Nếu quán đang có giải và bạn phụ trách vận hành, hãy nhờ chủ
                quán thêm bạn vào giải đó — mở giải đấu, vào tab "Kỷ luật / Nhân
                sự" rồi phân công nhân viên.
              </p>
            </>
          )}
        </StaffCard>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {contests.map((contest) => (
            <StaffContestCard key={contest.id} contest={contest} />
          ))}
        </div>
      )}
    </div>
  )
}

/** Xe thi đấu quyết định nhân viên phải chuẩn bị gì trong ngày thi. */
function getVehicleDutyLabel(vehicleRule: Record<string, unknown> | undefined) {
  switch (String(vehicleRule?.vehicle_policy ?? "")) {
    case "BYOC_ONLY":
      return "Khách mang xe — cần kiểm tra xe khi điểm danh"
    case "RENTAL_ONLY":
      return "Thuê xe quán — cần giao xe khi điểm danh"
    case "MIXED":
      return "Cả xe khách lẫn xe quán — cần cả kiểm tra lẫn giao xe"
    default:
      return null
  }
}

function StaffContestCard({
  contest,
}: {
  contest: import("@/features/contests/types").ContestItem
}) {
  const stats = contest.public_stats
  const vehicleDuty = getVehicleDutyLabel(contest.vehicle_rule)
  const checkIn = getContestCheckInAvailability(contest)

  return (
    <StaffCard className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-extrabold text-[#1c1b1b]">
            {contest.name}
          </h3>
          <p className="mt-1 text-sm font-semibold text-[#6b7280]">
            {contest.contest_format?.name ?? "--"} ·{" "}
            {contest.track_type?.name ?? "--"}
          </p>
        </div>
        <span
          className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${getContestStatusClass(contest.status)}`}
        >
          {getContestStatusLabel(contest.status)}
        </span>
      </div>

      {/*
        Nhân viên trực một chi nhánh nên "Chi nhánh tham gia: 1" chẳng nói được
        gì. Thứ họ cần biết trước khi vào ca là: mấy giờ thi, phải chuẩn bị xe
        hay kiểm tra xe, và bao nhiêu người sẽ tới.
      */}
      <div className="rounded-xl border border-[#e5e2e1] bg-[#fcfbfb] p-3">
        <p className="text-xs font-bold uppercase tracking-wide text-[#9ca3af]">
          Giờ thi đấu
        </p>
        <p className="mt-0.5 text-sm font-extrabold text-[#1c1b1b]">
          {formatContestDateTime(contest.starts_at)}
          {contest.ends_at
            ? ` → ${formatContestDateTime(contest.ends_at)}`
            : ""}
        </p>
        {vehicleDuty ? (
          <p className="mt-2 text-sm font-semibold text-[#5d5f5f]">
            {vehicleDuty}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        {stats ? (
          <>
            <StaffBadge variant="neutral">
              Đã đăng ký: {stats.registration_count}
              {contest.capacity ? `/${contest.capacity}` : ""}
            </StaffBadge>
            <StaffBadge variant="neutral">
              Đã duyệt: {stats.confirmed_count}
            </StaffBadge>
            <StaffBadge variant="neutral">
              Đã điểm danh: {stats.checked_in_count}
            </StaffBadge>
          </>
        ) : null}
        {contest.entry_fee > 0 ? (
          <StaffBadge variant="orange">
            Lệ phí: {contest.entry_fee.toLocaleString("vi-VN")}đ
          </StaffBadge>
        ) : (
          <StaffBadge variant="neutral">Miễn lệ phí</StaffBadge>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {/*
          Backend chặn điểm danh ngoài khung giờ thi đấu. Cho bấm rồi mới báo
          lỗi 400 giữa ca trực là kiểu bắt nhân viên tự đoán; khoá kèm lý do thì
          họ biết ngay còn phải chờ gì.
        */}
        {checkIn.canCheckIn ? (
          <Link
            to={routePaths.staffContestCheckIn.replace(
              ":contestId",
              contest.id,
            )}
            className="inline-flex items-center gap-2 rounded-lg bg-[#ea580c] px-4 py-2 text-sm font-bold text-white hover:bg-[#d94e0b]"
          >
            <QrCode className="size-4" />
            Mở điểm danh
          </Link>
        ) : (
          <span
            title={checkIn.reason}
            className="inline-flex cursor-not-allowed items-center gap-2 rounded-lg border border-[#e5e2e1] bg-[#f6f3f2] px-4 py-2 text-sm font-bold text-[#9ca3af]"
          >
            <QrCode className="size-4" />
            {checkIn.reason}
          </span>
        )}
        <Link
          to={routePaths.staffContestRuntime.replace(":contestId", contest.id)}
          className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-bold text-blue-700 hover:bg-blue-100"
        >
          <Flag className="size-4" />
          Vận hành lượt đấu
        </Link>
      </div>
    </StaffCard>
  )
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
