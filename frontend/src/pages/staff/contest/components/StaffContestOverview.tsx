import { Link } from "react-router"
import {
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  Flag,
  MapPin,
  QrCode,
  Users,
  Wrench,
} from "lucide-react"

import { getContestCheckInAvailability } from "@/features/contests/lib/contest-status"
import { routePaths } from "@/app/router/route-paths"
import type { ContestItem, ContestMetrics } from "@/features/contests/types"
import { StaffCard } from "@/pages/staff/components/StaffUI"
import { cn } from "@/shared/lib/utils"

/**
 * Tổng quan giải cho nhân viên trực ca.
 *
 * Trước đây nhân viên chỉ có sơ đồ đấu và ô nhập kết quả — không biết giải diễn
 * ra ở đâu, khách mang xe hay thuê xe quán, còn bao nhiêu người chưa điểm danh.
 * Những thông tin đó nằm rải trong thẻ ở màn danh sách rồi biến mất khi vào
 * trong. Khối này gom lại theo đúng thứ tự nhân viên cần trong ca trực.
 */
export function StaffContestOverview({
  contest,
  metrics,
  contestId,
}: {
  contest?: ContestItem
  metrics?: ContestMetrics
  contestId?: string
}) {
  if (!contest) return null

  const policy = String(contest.vehicle_rule?.vehicle_policy ?? "RENTAL_ONLY")

  // Giải chạy ở một hoặc nhiều chi nhánh. Nhân viên chỉ trực một nơi, nên hiện
  // tên chi nhánh đầu tiên là đủ định vị; nhiều hơn thì ghi rõ có bao nhiêu.
  const branches = contest.participating_branches ?? []
  const branchLabel =
    branches.length > 1
      ? `${branches.length} chi nhánh`
      : (branches[0]?.cafe?.name ?? null)
  const counts = metrics?.registration_counts
  const matchCounts = metrics?.match_counts

  // Dùng lại đúng luật của trang danh sách giải thay vì tự đặt luật riêng: chỉ
  // điểm danh được khi giải đã đóng đăng ký hoặc đang chạy, và đang trong khung
  // giờ thi đấu. Hai màn hình lệch luật thì nhân viên thấy nút ở chỗ này, bấm
  // vào lại không dùng được.
  const checkInAvailability = getContestCheckInAvailability(contest)

  const total = counts?.total ?? 0
  const confirmed = counts?.confirmed ?? 0
  const checkedIn = counts?.checked_in ?? 0
  const pending = counts?.pending ?? 0

  // Điểm danh xong thì trạng thái chuyển CONFIRMED → CHECKED_IN, nên `confirmed`
  // tụt về 0 khi cả giải đã tới đủ. Đếm "đủ điều kiện thi đấu" phải gộp cả hai,
  // nếu không thẻ hiện 0 người đủ điều kiện trong khi giải đang chạy.
  const eligible = confirmed + checkedIn

  // Người đã duyệt nhưng chưa tới — con số nhân viên phải canh trong ca.
  const waitingCheckIn = Math.max(0, confirmed - checkedIn)

  const matchesDone = matchCounts?.completed ?? 0
  const matchesTotal = matchCounts?.total ?? 0
  const matchesLeft = Math.max(
    0,
    matchesTotal - matchesDone - (matchCounts?.cancelled ?? 0),
  )

  return (
    <StaffCard>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-lg font-black text-[#1c1b1b]">{contest.name}</h2>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[#747878]">
            <span className="inline-flex items-center gap-1.5">
              <Flag className="size-3.5 text-[#adaaaa]" />
              {contest.contest_format?.name ?? "Giải đấu"}
            </span>
            {branchLabel ? (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-3.5 text-[#adaaaa]" />
                {branchLabel}
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="size-3.5 text-[#adaaaa]" />
              {formatRange(contest.starts_at, contest.ends_at)}
            </span>
          </p>
        </div>

        {!contestId ? null : checkInAvailability.canCheckIn ? (
          <Link
            to={routePaths.staffContestCheckIn.replace(":contestId", contestId)}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-black text-white transition hover:bg-orange-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"
          >
            <QrCode className="size-4" />
            Mở điểm danh
          </Link>
        ) : (
          <span
            title={checkInAvailability.reason}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-[#e5e2e1] bg-[#f6f3f2] px-4 py-2 text-sm font-bold text-[#9ca3af]"
          >
            <QrCode className="size-4" />
            {checkInAvailability.reason}
          </span>
        )}
      </div>

      {/* Chính sách xe quyết định việc nhân viên phải làm lúc khách tới, nên đặt
          ngay dưới tiêu đề chứ không lẫn vào đám số liệu. */}
      <div
        className={cn(
          "mt-4 flex items-start gap-2.5 rounded-lg px-3 py-2.5 text-sm",
          policy === "BYOC_ONLY"
            ? "bg-sky-50 text-sky-900"
            : "bg-amber-50 text-amber-900",
        )}
      >
        <Wrench className="mt-0.5 size-4 shrink-0 opacity-70" />
        <span>
          {policy === "BYOC_ONLY" ? (
            <>
              <span className="font-bold">Khách mang xe riêng.</span> Khi điểm
              danh cần kiểm tra xe của khách, không giao xe quán.
            </>
          ) : policy === "MIXED" ? (
            <>
              <span className="font-bold">Có cả hai loại.</span> Xem từng đăng
              ký để biết khách thuê xe quán hay mang xe riêng.
            </>
          ) : (
            <>
              <span className="font-bold">Thuê xe quán.</span> Khi điểm danh cần
              giao xe và lập phiếu mượn cho từng vận động viên.
            </>
          )}
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          icon={Users}
          label="Đã đăng ký"
          value={
            contest.capacity ? `${total}/${contest.capacity}` : String(total)
          }
          hint={pending > 0 ? `${pending} chờ duyệt` : "Không ai chờ duyệt"}
        />
        <Stat
          icon={CheckCircle2}
          label="Đã duyệt"
          value={String(eligible)}
          hint="Đủ điều kiện thi đấu"
        />
        <Stat
          icon={ClipboardCheck}
          label="Đã điểm danh"
          value={String(checkedIn)}
          hint={
            waitingCheckIn > 0
              ? `Còn ${waitingCheckIn} người chưa tới`
              : checkedIn > 0
                ? "Đã đủ người"
                : "Chưa có ai"
          }
          tone={waitingCheckIn > 0 ? "warn" : undefined}
        />
        <Stat
          icon={Flag}
          label="Trận đã xong"
          value={matchesTotal ? `${matchesDone}/${matchesTotal}` : "—"}
          hint={
            matchesTotal === 0
              ? "Chưa bốc thăm"
              : matchesLeft > 0
                ? `Còn ${matchesLeft} trận`
                : "Đã chạy hết"
          }
        />
      </div>
    </StaffCard>
  )
}

function Stat({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: typeof Users
  label: string
  value: string
  hint: string
  tone?: "warn"
}) {
  return (
    <div className="rounded-lg border border-[#e5e2e1] bg-white p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.14em] text-[#adaaaa]">
        <Icon className="size-3.5" />
        {label}
      </div>
      <p className="mt-1.5 text-xl font-black text-[#1c1b1b]">{value}</p>
      <p
        className={cn(
          "mt-0.5 text-xs",
          tone === "warn" ? "font-semibold text-orange-600" : "text-[#747878]",
        )}
      >
        {hint}
      </p>
    </div>
  )
}

function formatRange(startsAt?: string | null, endsAt?: string | null) {
  if (!startsAt) return "Đang cập nhật"
  const start = new Date(startsAt)
  const end = endsAt ? new Date(endsAt) : null

  const time = (date: Date) =>
    date.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })
  const day = (date: Date) =>
    date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })

  if (!end) return `${time(start)} ${day(start)}`
  // Cùng ngày thì bỏ ngày lặp lại ở vế sau cho gọn.
  return day(start) === day(end)
    ? `${time(start)} → ${time(end)} · ${day(start)}`
    : `${time(start)} ${day(start)} → ${time(end)} ${day(end)}`
}
