import type { ReactNode } from "react"
import {
  ArrowRight,
  Ban,
  CheckCircle,
  Clock,
  type LucideIcon,
} from "lucide-react"

import type {
  ContestItem,
  ContestMatch,
  ContestMetrics,
  ContestRegistration,
} from "@/features/contests/types"
import {
  getContestRuntimeFormat,
  getEligibleRuntimeRegistrations,
} from "@/features/contests/lib/contest-runtime"
import {
  getContestFormatLabel,
  getContestStatusLabel,
} from "@/features/contests/lib/contest-status"
import {
  Panel,
  PanelTitle,
} from "@/pages/provider/components/ProviderPrimitives"
import { cn } from "@/shared/lib/utils"

/**
 * Tổng quan giải — một bảng thông tin, không phải một rổ thẻ.
 *
 * Bản cũ vẽ 14 ô có viền lồng trong 3 panel cũng có viền, mà phần lớn nội dung
 * lặp lại: "Đấu loại trực tiếp" hiện 3 lần, tên chi nhánh 2 lần, còn cả khối
 * "Mức sẵn sàng vận hành" chỉ chép lại đúng những con số đã nằm ở hàng chỉ số
 * phía trên. Nhiều viền không làm thông tin dễ đọc hơn, chỉ làm mắt phải nhảy
 * qua nhiều đường kẻ hơn.
 *
 * Nay: một panel, các dòng nhãn–giá trị ngăn bằng nét mảnh, và thay cho khối
 * "sẵn sàng vận hành" là MỘT câu nói thẳng việc kế tiếp phải làm.
 */
export function ContestRuntimeOverview({
  contest,
  registrations,
  matches,
  metrics,
  action,
}: {
  contest: ContestItem
  registrations: ContestRegistration[]
  matches: ContestMatch[]
  metrics: ContestMetrics | undefined
  action?: ReactNode
}) {
  const runtimeFormat = getContestRuntimeFormat(contest)
  const formatLabel = getContestFormatLabel(
    runtimeFormat || contest.contest_format?.code,
  )
  const templateName = contest.contest_template?.name ?? null
  const branches = contest.participating_branches

  return (
    <Panel>
      <PanelTitle
        title="Tóm tắt giải đấu"
        subtitle="Thông tin và tham số vận hành đang áp dụng."
        action={action}
      />

      <NextStep
        {...getNextStep({ contest, registrations, matches, metrics })}
      />

      <Group title="Giải đấu">
        <Row label="Trạng thái" value={getContestStatusLabel(contest.status)} />
        <Row label="Loại giải" value={contest.contest_type?.name ?? "--"} />
        <Row label="Thể thức" value={formatLabel} />
        {/* Mẫu vận hành gắn cứng vào một thể thức nên tên hai bên thường trùng
            nhau. Lặp lại y nguyên không thêm thông tin nào. */}
        {templateName && templateName !== formatLabel ? (
          <Row label="Mẫu vận hành" value={templateName} />
        ) : null}
        {runtimeFormat === "QUALIFYING_FINAL" ? (
          <Row
            label="Số VĐV vào chung kết"
            value={String(contest.config?.finalists ?? 4)}
          />
        ) : null}
        <Row
          label="Xe thi đấu"
          value={getVehiclePolicyLabel(contest.vehicle_rule?.vehicle_policy)}
        />
        <Row label="Lệ phí" value={formatEntryFee(contest.entry_fee)} />
        <Row
          label={branches.length > 1 ? "Chi nhánh" : "Địa điểm"}
          value={
            branches.length === 0 ? (
              "--"
            ) : (
              <span className="space-y-0.5">
                {branches.map((branch) => (
                  <span key={branch.id} className="block">
                    {branch.cafe?.name ?? branch.cafe_id}
                    {branch.cafe?.district ? (
                      <span className="font-medium text-[#747878]">
                        {" · "}
                        {branch.cafe.district}, {branch.cafe.city}
                      </span>
                    ) : null}
                  </span>
                ))}
              </span>
            )
          }
        />
      </Group>

      <Group title="Lịch">
        {/* tabular-nums giữ chữ số cùng bề rộng nên hai dòng ngày giờ thẳng cột
            với nhau thay vì so le. */}
        <Row
          label="Nhận đăng ký"
          value={
            <span className="tabular-nums">
              {formatRange(
                contest.registration_opens_at,
                contest.registration_closes_at,
              )}
            </span>
          }
        />
        <Row
          label="Thi đấu"
          value={
            <span className="tabular-nums">
              {formatRange(contest.starts_at, contest.ends_at)}
            </span>
          }
        />
      </Group>
    </Panel>
  )
}

/** `action` = provider phải ra tay; `waiting` = đang chạy, chưa tới lượt mình. */
type NextStepTone = "action" | "waiting" | "done" | "closed"

/**
 * Việc kế tiếp provider phải làm, theo đúng thứ tự vận hành thật.
 *
 * Thay cho bảng "sẵn sàng vận hành" cũ: bảng đó liệt kê 4 chỉ số nhưng không
 * nói phải làm gì với chúng, mà cả 4 đều đã có ở hàng chỉ số phía trên.
 *
 * Trả kèm `tone` vì một dải màu cam duy nhất sẽ báo động cả lúc giải đã xong
 * lẫn lúc giải bị huỷ — màu mất hết ý nghĩa nếu trạng thái nào cũng như nhau.
 */
function getNextStep({
  contest,
  registrations,
  matches,
  metrics,
}: {
  contest: ContestItem
  registrations: ContestRegistration[]
  matches: ContestMatch[]
  metrics: ContestMetrics | undefined
}): { message: string; tone: NextStepTone } {
  if (contest.status === "CANCELLED") {
    return { message: "Giải đã huỷ.", tone: "closed" }
  }
  if (metrics?.leaderboard.published || contest.status === "COMPLETED") {
    return { message: "Đã công bố bảng xếp hạng. Giải kết thúc.", tone: "done" }
  }

  if (contest.status === "DRAFT") {
    return {
      message:
        "Giải còn là bản nháp — mở đăng ký để bắt đầu nhận vận động viên.",
      tone: "action",
    }
  }

  const activeCount = registrations.filter(
    (item) => item.status !== "CANCELLED",
  ).length

  if (contest.status === "OPEN") {
    if (activeCount === 0) {
      return {
        message: "Đang mở đăng ký, chưa có ai đăng ký.",
        tone: "waiting",
      }
    }
    const capacity = contest.capacity ?? 0
    return {
      message:
        capacity > 0
          ? `Đang mở đăng ký — ${activeCount}/${capacity} suất đã có người.`
          : `Đang mở đăng ký — ${activeCount} người đã đăng ký.`,
      tone: "waiting",
    }
  }

  if (matches.length === 0) {
    return {
      message: "Đã đóng đăng ký. Bốc thăm để tạo sơ đồ thi đấu.",
      tone: "action",
    }
  }

  const remaining = matches.filter(
    (match) => match.status !== "COMPLETED" && match.status !== "CANCELLED",
  ).length
  if (remaining > 0) {
    const eligible = getEligibleRuntimeRegistrations(registrations).length
    return {
      message:
        eligible === 0
          ? `Còn ${remaining} trận chưa có kết quả. Chưa ai điểm danh trong ngày thi.`
          : `Còn ${remaining} trận chưa có kết quả.`,
      tone: "waiting",
    }
  }

  return {
    message: "Mọi trận đã có kết quả — công bố bảng xếp hạng để kết thúc giải.",
    tone: "action",
  }
}

const NEXT_STEP_STYLE: Record<
  NextStepTone,
  { wrapper: string; icon: string; Icon: LucideIcon }
> = {
  action: {
    wrapper: "border-orange-300 bg-orange-50/60",
    icon: "text-orange-600",
    Icon: ArrowRight,
  },
  waiting: {
    wrapper: "border-[#c4c7c8] bg-[#f6f3f2]",
    icon: "text-[#5d5f5f]",
    Icon: Clock,
  },
  done: {
    wrapper: "border-emerald-300 bg-emerald-50/60",
    icon: "text-emerald-700",
    Icon: CheckCircle,
  },
  closed: {
    wrapper: "border-[#c4c7c8] bg-[#f6f3f2]",
    icon: "text-[#747878]",
    Icon: Ban,
  },
}

function NextStep({ message, tone }: { message: string; tone: NextStepTone }) {
  // Biểu tượng đi kèm màu, không để màu tự gánh nghĩa: người không phân biệt
  // được cam với xanh vẫn đọc ra đây là việc phải làm hay việc đã xong.
  const { wrapper, icon, Icon } = NEXT_STEP_STYLE[tone]
  return (
    <div className={cn("flex gap-2.5 border-l-2 py-2.5 pl-4", wrapper)}>
      <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", icon)} />
      <p className="text-sm font-semibold leading-6 text-[#1c1b1b]">
        {message}
      </p>
    </div>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-6">
      {/* #adaaaa trên nền trắng chỉ đạt 2.2:1 — dưới ngưỡng 4.5:1 của WCAG AA
          cho chữ nhỏ. #5d5f5f đạt ~6.5:1 mà vẫn nhạt hơn nhãn từng dòng. */}
      <h4 className="text-xs font-black uppercase tracking-[0.14em] text-[#5d5f5f]">
        {title}
      </h4>
      <dl className="mt-2 grid gap-x-10 md:grid-cols-2">{children}</dl>
    </section>
  )
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-[#f0eded] py-2.5">
      <dt className="shrink-0 text-sm font-semibold text-[#747878]">{label}</dt>
      <dd className="text-right text-sm font-bold text-[#1c1b1b]">{value}</dd>
    </div>
  )
}

function getVehiclePolicyLabel(policy: unknown): string {
  // Enum thô như "BYOC_ONLY" từng rò thẳng ra màn hình provider.
  switch (policy) {
    case "BYOC_ONLY":
      return "Khách tự mang xe"
    case "RENTAL_ONLY":
      return "Thuê xe của quán"
    case "MIXED":
      return "Xe thuê hoặc xe cá nhân"
    default:
      return "--"
  }
}

function formatEntryFee(value: number): string {
  if (!value || value <= 0) return "Miễn phí"
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value)
}

/**
 * Gộp mốc đầu–cuối thành một dòng, bỏ ngày lặp khi cùng ngày.
 *
 * Bốn mốc thời gian trước đây chiếm 4 ô riêng và lặp lại năm 2026 bốn lần.
 */
function formatRange(from?: string | null, to?: string | null): string {
  if (!from && !to) return "--"
  if (!from) return `đến ${formatFull(to)}`
  if (!to) return `từ ${formatFull(from)}`

  const start = new Date(from)
  const end = new Date(to)
  const sameDay = start.toDateString() === end.toDateString()
  return sameDay
    ? `${formatTime(start)} → ${formatTime(end)} · ${formatDate(end)}`
    : `${formatFull(from)} → ${formatFull(to)}`
}

function formatFull(value?: string | null): string {
  if (!value) return "--"
  const date = new Date(value)
  return `${formatTime(date)} ${formatDate(date)}`
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}
