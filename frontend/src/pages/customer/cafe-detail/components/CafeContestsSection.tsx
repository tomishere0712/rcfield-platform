import { useQuery } from "@tanstack/react-query"
import { CalendarClock, ChevronRight, Trophy } from "lucide-react"
import { Link } from "react-router"

import { routePaths } from "@/app/router/route-paths"
import { contestApi, contestQueryKeys } from "@/features/contests/api/contest.api"
import { formatContestDateTime } from "@/features/contests/lib/contest-runtime"
import type { ContestItem } from "@/features/contests/types"
import { formatCurrency } from "@/shared/lib/format"

import { CafeSection } from "./SectionShell"

// Chỉ render khi quán có contest đang mở đăng ký - không có thì ẩn hoàn toàn.
export function CafeContestsSection({ cafeId }: { cafeId: string }) {
  const { data } = useQuery({
    queryKey: contestQueryKeys.list({ cafe_id: cafeId, status: "OPEN", limit: 6 }),
    queryFn: () => contestApi.listCafeContests(cafeId, { status: "OPEN", limit: 6 }),
    staleTime: 60_000,
  })

  const contests = data?.data ?? []
  if (contests.length === 0) return null

  return (
    <CafeSection
      title="Giải đấu đang mở đăng ký"
      lead={`Quán đang tổ chức ${contests.length} giải — chưa có xe vẫn tham gia được, chọn "Thuê xe tại quầy" khi đăng ký.`}
      action={
        <Link
          to={routePaths.contests}
          className="text-sm font-bold text-orange-600 hover:text-orange-700"
        >
          Xem tất cả giải
        </Link>
      }
    >
      <ul className="divide-y divide-slate-200 border-y border-slate-200">
        {contests.map((contest) => (
          <CafeContestRow key={contest.id} contest={contest} />
        ))}
      </ul>
    </CafeSection>
  )
}

function CafeContestRow({ contest }: { contest: ContestItem }) {
  return (
    <li>
      <Link
        to={routePaths.contestDetail.replace(":contestId", contest.id)}
        className="group flex items-center gap-4 py-4 transition-colors hover:bg-slate-50"
      >
        {contest.banner_image_url ? (
          <img
            src={contest.banner_image_url}
            alt=""
            className="size-16 shrink-0 rounded-xl object-cover"
          />
        ) : (
          <span className="flex size-16 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-500">
            <Trophy className="size-6" />
          </span>
        )}

        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-bold text-slate-950 group-hover:text-orange-600">
            {contest.name}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
            <CalendarClock className="size-4 shrink-0" />
            <span className="truncate">{formatContestDateTime(contest.starts_at)}</span>
          </p>
          <p className="mt-1 text-sm text-slate-600">
            {contest.contest_format?.name ?? "Thi đấu"} · {contest.track_type?.name ?? "Track"} · Lệ phí{" "}
            <span className="font-bold text-orange-600">
              {contest.entry_fee > 0 ? formatCurrency(contest.entry_fee) : "Miễn phí"}
            </span>
          </p>
        </div>

        <span className="flex shrink-0 items-center gap-1 rounded-full bg-slate-900 px-4 py-2 text-sm font-bold text-white transition group-hover:bg-orange-600">
          Đăng ký
          <ChevronRight className="size-4" />
        </span>
      </Link>
    </li>
  )
}
