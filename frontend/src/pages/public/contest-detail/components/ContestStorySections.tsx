import { useState, type ReactNode } from "react"
import {
  CheckCircle2,
  Flag,
  Gauge,
  MapPin,
  Medal,
  Route,
  Trophy,
  Users,
} from "lucide-react"

import { formatContestDateTime } from "@/features/contests/lib/contest-runtime"
import type { ContestBranch, ContestItem } from "@/features/contests/types"
import { cn } from "@/shared/lib/utils"

import {
  formatCurrency,
  formatPrizeReward,
  getVehiclePolicyBlurb,
  getVehiclePolicyLabel,
} from "../utils"
import { PageSection, Reveal, SectionHeading } from "./SectionShell"

/* -------------------------------------------------------------------------- */
/* Giới thiệu                                                                  */
/* -------------------------------------------------------------------------- */

export function ContestAboutSection({ contest }: { contest: ContestItem }) {
  const stats = contest.public_stats
  const capacity = contest.capacity
  const registered = stats?.registration_count ?? 0
  const remaining = stats?.capacity_remaining ?? null
  const fillRatio =
    capacity && capacity > 0 ? Math.min(1, registered / capacity) : null
  // Giải khép lại thì "suất còn lại" chẳng còn nghĩa gì — không ai vào được
  // nữa. Tô cam con số đó là mời gọi vào một cánh cửa đã đóng.
  const contestOver =
    contest.status === "COMPLETED" || contest.status === "CANCELLED"

  return (
    <PageSection id="gioi-thieu" tone="light">
      <Reveal>
        <SectionHeading
          eyebrow="Về giải đấu"
          title="Đôi nét về giải đấu"
          lead={
            contestOver
              ? "Giải đã khép lại — đây là những gì ban tổ chức đã công bố."
              : "Trước khi ghi danh, đây là những gì ban tổ chức muốn bạn biết."
          }
        />
      </Reveal>

      <Reveal index={1}>
        <p className="mt-10 max-w-3xl whitespace-pre-line text-lg font-medium leading-9 text-slate-700">
          {contest.description?.trim() ||
            "Ban tổ chức chưa viết phần giới thiệu chi tiết. Bạn có thể xem thể thức, lịch trình và giải thưởng ở các phần bên dưới để hình dung rõ hơn về giải đấu này."}
        </p>
      </Reveal>

      <Reveal index={2}>
        <div className="mt-14 border-t border-slate-200 pt-10">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-10 lg:grid-cols-4 lg:divide-x lg:divide-slate-200">
            <BigStat
              value={String(registered)}
              label="Tay đua đã ghi danh"
              icon={<Users className="size-4" />}
            />
            <BigStat
              value={String(stats?.confirmed_count ?? 0)}
              label="Đã xác nhận suất"
              icon={<CheckCircle2 className="size-4" />}
            />
            {contestOver ? (
              <BigStat
                value={capacity ? String(capacity) : "∞"}
                label="Sức chứa của giải"
                icon={<Flag className="size-4" />}
              />
            ) : (
              <BigStat
                value={remaining === null ? "∞" : String(remaining)}
                label={
                  remaining === null ? "Không giới hạn suất" : "Suất còn lại"
                }
                icon={<Flag className="size-4" />}
                highlight={remaining !== null && remaining <= 5}
              />
            )}
            <BigStat
              value={formatCurrency(contest.entry_fee)}
              label="Lệ phí tham dự"
              icon={<Trophy className="size-4" />}
            />
          </dl>

          {fillRatio !== null ? (
            <div className="mt-10">
              <div className="flex items-baseline justify-between text-sm font-bold">
                <span className="text-slate-500">
                  {contestOver
                    ? `Chốt ở ${Math.round(fillRatio * 100)}% sức chứa`
                    : `Đã lấp đầy ${Math.round(fillRatio * 100)}% sức chứa`}
                </span>
                <span className="text-slate-900">
                  {registered}/{capacity} tay đua
                </span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={cn(
                    "h-full rounded-full transition-[width] duration-700 ease-out",
                    contestOver
                      ? "bg-slate-400"
                      : "bg-gradient-to-r from-orange-500 to-brand-amber",
                  )}
                  style={{ width: `${Math.max(fillRatio * 100, 3)}%` }}
                />
              </div>
            </div>
          ) : null}
        </div>
      </Reveal>
    </PageSection>
  )
}

function BigStat({
  value,
  label,
  icon,
  highlight = false,
}: {
  value: string
  label: string
  icon: ReactNode
  highlight?: boolean
}) {
  return (
    <div className="lg:px-8 lg:first:pl-0">
      <div className="flex items-center gap-2 text-slate-400">
        {icon}
        <dt className="text-2xs font-black uppercase tracking-[0.16em]">
          {label}
        </dt>
      </div>
      <dd
        className={cn(
          "mt-3 text-4xl font-black leading-none tracking-tight",
          highlight ? "text-orange-600" : "text-slate-900",
        )}
      >
        {value}
      </dd>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Thể thức & luật chơi                                                        */
/* -------------------------------------------------------------------------- */

export function ContestFormatSection({ contest }: { contest: ContestItem }) {
  const vehiclePolicy = contest.vehicle_rule?.vehicle_policy as
    | string
    | undefined

  const rules = [
    {
      icon: <Trophy className="size-5" />,
      title: contest.contest_format?.name ?? "Đang cập nhật",
      caption: "Thể thức",
      body:
        contest.contest_format?.description ??
        "Ban tổ chức sẽ công bố cách tính kết quả và cách phân vòng trong điều lệ giải.",
    },
    {
      icon: <Route className="size-5" />,
      title: contest.track_type?.name ?? "Đang cập nhật",
      caption: "Đường đua",
      body:
        contest.track_type?.description ??
        "Mặt sân và bố cục đường đua do chi nhánh tổ chức chuẩn bị theo chuẩn giải.",
    },
    {
      icon: <Gauge className="size-5" />,
      title: getVehiclePolicyLabel(vehiclePolicy),
      caption: "Luật sử dụng xe",
      body: getVehiclePolicyBlurb(vehiclePolicy),
    },
    {
      icon: <Users className="size-5" />,
      title:
        contest.capacity === null
          ? "Không giới hạn"
          : `${contest.capacity} tay đua`,
      caption: "Quy mô",
      body: `Giải diễn ra tại ${contest.participating_branches.length} điểm thi đấu trong hệ thống RCField.`,
    },
  ]

  return (
    <PageSection id="the-thuc" tone="dark" className="overflow-hidden">
      <div className="pointer-events-none absolute -left-40 top-0 size-96 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-32 size-96 rounded-full bg-accent/10 blur-3xl" />

      <div className="relative">
        <Reveal>
          <SectionHeading
            eyebrow="Luật chơi"
            title="Thể thức & quy định"
            lead="Bốn điều dưới đây là tất cả những gì bạn cần nắm trước khi bước ra vạch xuất phát."
            tone="dark"
          />
        </Reveal>

        <div className="mt-14 grid gap-10 md:grid-cols-2 lg:grid-cols-4 lg:gap-0 lg:divide-x lg:divide-white/10">
          {rules.map((rule, index) => (
            <Reveal
              key={rule.caption}
              index={index}
              className="lg:px-8 lg:first:pl-0"
            >
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 text-primary">
                  {rule.icon}
                </span>
                <span className="text-2xs font-black uppercase tracking-[0.2em] text-white/40">
                  {String(index + 1).padStart(2, "0")} · {rule.caption}
                </span>
              </div>
              <h3 className="mt-5 text-xl font-black leading-snug text-white">
                {rule.title}
              </h3>
              <p className="mt-3 text-sm font-medium leading-7 text-white/60">
                {rule.body}
              </p>
            </Reveal>
          ))}
        </div>
      </div>
    </PageSection>
  )
}

/* -------------------------------------------------------------------------- */
/* Lịch trình                                                                  */
/* -------------------------------------------------------------------------- */

export function ContestScheduleSection({ contest }: { contest: ContestItem }) {
  // Chốt mốc "bây giờ" một lần khi mount — lịch trình tính theo ngày nên không
  // cần chạy lại mỗi lần render, và giữ nó ổn định giúp component thuần khiết.
  const [now] = useState(() => Date.now())
  // Giải kết thúc hoặc bị huỷ thì mọi cột mốc đều đã thuộc về quá khứ, kể cả khi
  // đồng hồ chưa chạy tới: ban tổ chức xong sớm hơn lịch là chuyện thường. Không
  // xét trạng thái thì trang vẫn đếm ngược tới ngày khởi tranh của một giải đã
  // trao cúp.
  const contestOver =
    contest.status === "COMPLETED" || contest.status === "CANCELLED"
  const milestones = [
    { label: "Mở đăng ký", at: contest.registration_opens_at },
    { label: "Đóng đăng ký", at: contest.registration_closes_at },
    { label: "Khởi tranh", at: contest.starts_at },
    { label: "Kết thúc dự kiến", at: contest.ends_at },
  ].map((milestone) => {
    const time = milestone.at ? new Date(milestone.at).getTime() : null
    return {
      ...milestone,
      passed:
        contestOver || (time !== null && !Number.isNaN(time) && time <= now),
    }
  })
  const nextIndex = milestones.findIndex((milestone) => !milestone.passed)

  return (
    <PageSection id="lich-trinh" tone="light">
      <Reveal>
        <SectionHeading
          eyebrow="Lịch trình"
          title="Hành trình của giải"
          lead={
            contestOver
              ? "Giải đã khép lại — đây là các mốc thời gian đã diễn ra."
              : "Bốn cột mốc để bạn canh thời gian — từ lúc mở cổng ghi danh đến khi trao cúp."
          }
        />
      </Reveal>

      <div className="relative mt-14">
        <div className="pointer-events-none absolute left-0 right-0 top-[15px] hidden h-px bg-gradient-to-r from-orange-200 via-orange-300 to-transparent md:block" />

        <div className="grid gap-10 md:grid-cols-4 md:gap-6">
          {milestones.map((milestone, index) => {
            const isNext = index === nextIndex
            return (
              <Reveal key={milestone.label} index={index} className="relative">
                <span
                  className={cn(
                    "flex size-8 items-center justify-center rounded-full border-2 bg-white transition",
                    milestone.passed
                      ? "border-orange-500 text-orange-500"
                      : isNext
                        ? "border-orange-500 text-orange-500 ring-4 ring-orange-100"
                        : "border-slate-300 text-slate-300",
                  )}
                >
                  <span
                    className={cn(
                      "size-2.5 rounded-full",
                      milestone.passed || isNext
                        ? "bg-orange-500"
                        : "bg-slate-300",
                    )}
                  />
                </span>
                <p className="mt-5 text-2xs font-black uppercase tracking-[0.16em] text-slate-400">
                  {milestone.label}
                </p>
                <p className="mt-2 text-lg font-black leading-tight text-slate-900">
                  {formatContestDateTime(milestone.at)}
                </p>
                <p
                  className={cn(
                    "mt-2 text-xs font-bold",
                    milestone.passed
                      ? "text-slate-400"
                      : isNext
                        ? "text-orange-600"
                        : "text-slate-400",
                  )}
                >
                  {milestone.passed
                    ? contestOver
                      ? "Đã xong"
                      : "Đã qua"
                    : isNext
                      ? "Cột mốc kế tiếp"
                      : "Sắp tới"}
                </p>
              </Reveal>
            )
          })}
        </div>
      </div>
    </PageSection>
  )
}

/* -------------------------------------------------------------------------- */
/* Giải thưởng                                                                 */
/* -------------------------------------------------------------------------- */

type PrizeEntry = { rank: string; reward: string; note: string | null }

export function ContestPrizeSection({
  prizeItems,
}: {
  prizeItems: Array<Record<string, unknown>>
}) {
  const entries = toPrizeEntries(prizeItems)
  const podium = entries.slice(0, 3)
  const rest = entries.slice(3)
  // Thứ tự bục: hạng nhì bên trái, hạng nhất ở giữa, hạng ba bên phải.
  const podiumOrder = [podium[1], podium[0], podium[2]].filter(
    (entry): entry is PrizeEntry => Boolean(entry),
  )

  return (
    <PageSection id="giai-thuong" tone="warm">
      <Reveal>
        <SectionHeading
          eyebrow="Phần thưởng"
          title="Vinh danh người về đích"
          lead="Không chỉ là cúp — thành tích tại giải còn cộng vào danh hiệu của bạn trên bảng xếp hạng toàn hệ thống."
        />
      </Reveal>

      {entries.length === 0 ? (
        <Reveal index={1}>
          <div className="mt-12 flex items-center gap-4 border-l-4 border-amber-300 bg-white/60 py-5 pl-6 pr-4">
            <Medal className="size-6 shrink-0 text-amber-500" />
            <p className="text-sm font-semibold leading-7 text-slate-600">
              Cơ cấu giải thưởng sẽ được ban tổ chức công bố trong điều lệ giải
              trước ngày khởi tranh.
            </p>
          </div>
        </Reveal>
      ) : (
        <>
          <div className="mt-14 grid gap-6 sm:grid-cols-3 sm:items-end">
            {podiumOrder.map((entry) => {
              const place = podium.indexOf(entry) + 1
              return (
                <Reveal
                  key={`${place}-${entry.rank}`}
                  index={place}
                  className={cn(place === 1 && "order-first sm:order-none")}
                >
                  <PodiumColumn entry={entry} place={place} />
                </Reveal>
              )
            })}
          </div>

          {rest.length > 0 ? (
            <Reveal index={4}>
              <ul className="mt-12 divide-y divide-amber-200/60 border-t border-amber-200/60">
                {rest.map((entry, index) => (
                  <li
                    key={`${entry.rank}-${index}`}
                    className="flex flex-wrap items-baseline justify-between gap-2 py-5"
                  >
                    <span className="text-sm font-black uppercase tracking-wide text-amber-700">
                      {entry.rank}
                    </span>
                    <span className="flex-1 text-right text-base font-bold text-slate-900">
                      {entry.reward}
                      {entry.note ? (
                        <span className="ml-2 text-xs font-semibold text-slate-500">
                          {entry.note}
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </Reveal>
          ) : null}
        </>
      )}
    </PageSection>
  )
}

const PODIUM_STYLE: Record<
  number,
  { bar: string; height: string; label: string }
> = {
  1: {
    bar: "bg-gradient-to-b from-amber-300 to-amber-500 text-amber-950",
    height: "h-36 sm:h-44",
    label: "text-amber-600",
  },
  2: {
    bar: "bg-gradient-to-b from-slate-200 to-slate-400 text-slate-800",
    height: "h-28 sm:h-32",
    label: "text-slate-500",
  },
  3: {
    bar: "bg-gradient-to-b from-orange-200 to-orange-400 text-orange-950",
    height: "h-24 sm:h-28",
    label: "text-orange-600",
  },
}

function PodiumColumn({ entry, place }: { entry: PrizeEntry; place: number }) {
  const style = PODIUM_STYLE[place] ?? PODIUM_STYLE[3]

  return (
    <div className="flex flex-col items-center text-center">
      <Trophy className={cn("size-7", style.label)} />
      <p className="mt-4 text-xs font-black uppercase tracking-[0.16em] text-slate-400">
        {entry.rank}
      </p>
      <p className="mt-2 text-lg font-black leading-snug tabular-nums text-slate-900">
        {formatPrizeReward(entry.reward)}
      </p>
      {entry.note ? (
        <p className="mt-1 text-xs font-semibold text-slate-500">
          {entry.note}
        </p>
      ) : null}
      <div
        className={cn(
          "mt-6 flex w-full items-center justify-center rounded-t-2xl text-5xl font-black tabular-nums",
          style.bar,
          style.height,
        )}
      >
        {place}
      </div>
    </div>
  )
}

function toPrizeEntries(items: Array<Record<string, unknown>>): PrizeEntry[] {
  return items.map((item, index) => ({
    rank: String(item.position ?? item.rank ?? `Top ${index + 1}`),
    reward: String(
      item.label ?? item.reward ?? item.prize ?? "Công bố trong điều lệ",
    ),
    note: item.note ? String(item.note) : null,
  }))
}

/* -------------------------------------------------------------------------- */
/* Địa điểm                                                                    */
/* -------------------------------------------------------------------------- */

export function ContestVenueSection({ contest }: { contest: ContestItem }) {
  const hostBranchId = contest.host_branch?.id ?? null
  const branches = contest.participating_branches

  return (
    <PageSection id="dia-diem" tone="light">
      <Reveal>
        <SectionHeading
          eyebrow="Địa điểm"
          title="Nơi bạn sẽ tranh tài"
          lead={
            branches.length > 1
              ? "Giải diễn ra ở nhiều chi nhánh — chọn điểm gần bạn nhất khi đăng ký."
              : "Toàn bộ các vòng đấu diễn ra tại chi nhánh dưới đây."
          }
        />
      </Reveal>

      <Reveal index={1}>
        {branches.length === 0 ? (
          <p className="mt-10 border-l-4 border-slate-200 py-4 pl-6 text-sm font-semibold text-slate-500">
            Ban tổ chức chưa công bố điểm thi đấu.
          </p>
        ) : (
          <ul className="mt-10 divide-y divide-slate-200 border-y border-slate-200">
            {branches.map((branch) => (
              <VenueRow
                key={branch.id}
                branch={branch}
                isHost={branch.id === hostBranchId}
              />
            ))}
          </ul>
        )}
      </Reveal>
    </PageSection>
  )
}

function VenueRow({
  branch,
  isHost,
}: {
  branch: ContestBranch
  isHost: boolean
}) {
  const location = [branch.cafe?.district, branch.cafe?.city]
    .filter(Boolean)
    .join(", ")

  return (
    <li className="group flex flex-wrap items-center gap-x-5 gap-y-3 py-6 transition-colors hover:bg-slate-50/70">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-orange-50 text-orange-600">
        <MapPin className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-lg font-black text-slate-900">
          {branch.cafe?.name ?? "Chi nhánh đang cập nhật"}
        </p>
        <p className="mt-1 text-sm font-medium text-slate-500">
          {location || "Địa chỉ đang cập nhật"}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {isHost ? (
          <span className="rounded-full bg-slate-900 px-3 py-1 text-2xs font-black uppercase tracking-wider text-white">
            Chủ nhà
          </span>
        ) : null}
        {branch.check_in_enabled ? (
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-2xs font-black uppercase tracking-wider text-emerald-700">
            Nhận check-in
          </span>
        ) : null}
      </div>
    </li>
  )
}
