import { Link, useNavigate } from "react-router"
import type { ReactNode } from "react"
import { ArrowRight, CalendarClock, Download, LogOut, Search, TrendingDown, TrendingUp, UserRound } from "lucide-react"

import { routePaths } from "@/app/router/route-paths"
import { logoutSession } from "@/features/auth/api/auth.api"
import { useAuthStore } from "@/features/auth/stores/auth.store"
import type { BackendCafe } from "@/features/cafes/types"
import type { BranchOperationsItem } from "@/features/dashboard/types/dashboard.types"
import { NotificationBell } from "@/features/notifications/components/NotificationBell"
import type { ProviderTone } from "@/pages/provider/data"
import { storageKeys } from "@/shared/lib/storage"
import { formatCurrency } from "@/shared/lib/format"
import { cn } from "@/shared/lib/utils"
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/ui/avatar"
import { Badge } from "@/shared/ui/badge"
import { Button } from "@/shared/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu"

export function ProviderHeader({
  title,
  description,
  actionLabel,
  actionIcon = <Download className="size-5" />,
  onAction,
}: {
  title: string
  description: string
  actionLabel: string
  actionIcon?: ReactNode
  onAction?: () => void
}) {
  return (
    <ProviderPageHeader
      title={title}
      description={description}
      actions={
        <>
          <Button variant="outline" className="h-10 gap-2 rounded-lg border-[#c4c7c8] bg-[#f1edec] text-[#1c1b1b] hover:bg-[#e5e2e1] font-bold">
            <CalendarClock className="size-5" />
            Tháng này
          </Button>
          <Button type="button" onClick={onAction} className="h-10 gap-2 rounded-lg bg-[#1c1b1b] text-white hover:bg-[#313030] font-bold">
            {actionIcon}
            {actionLabel}
          </Button>
        </>
      }
    />
  )
}
ProviderHeader.displayName = "ProviderHeader"

export function ProviderPageHeader({
  title,
  description,
  actions,
  titleClassName,
  contentClassName,
  h2Title,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  titleClassName?: string
  contentClassName?: string
  h2Title?: string
  flush?: boolean
}) {
  return (
    <header
      className={cn(
        "sticky top-0 z-40 flex w-full flex-col gap-4 border-b border-[#c4c7c8] bg-[#fcf8f8]/80 px-4 py-4 backdrop-blur-md md:px-6"
      )}
    >
      <div className={cn("flex w-full flex-col justify-between gap-4 sm:flex-row sm:items-center", contentClassName)}>
        <div className="min-w-0 flex-1">
          <h2
            title={h2Title ?? (typeof title === "string" ? title : undefined)}
            className={cn("text-3xl font-extrabold leading-[1.1] tracking-tight text-[#1c1b1b] md:text-4xl", titleClassName)}
          >
            {title}
          </h2>
          {typeof description === "string" ? <p className="mt-2 text-sm font-semibold text-[#444748]">{description}</p> : description ? <div className="mt-2">{description}</div> : null}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {actions ? (
            <div className="flex flex-wrap items-center gap-3 sm:mr-3">
              {actions}
            </div>
          ) : null}
          <div className="flex items-center gap-2 border-l border-[#c4c7c8]/50 pl-3">
            <NotificationBell />
            <ProviderAccountMenu />
          </div>
        </div>
      </div>
    </header>
  )
}
ProviderPageHeader.displayName = "ProviderPageHeader"

function ProviderAccountMenu() {
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const clearAuthenticated = useAuthStore((state) => state.clearAuthenticated)

  const displayName = user?.fullName ?? "Provider"
  const email = user?.email ?? "provider@rcfield.vn"

  const handleLogout = async () => {
    const storedAuth = localStorage.getItem(storageKeys.auth) ?? sessionStorage.getItem(storageKeys.auth)

    if (storedAuth) {
      try {
        const auth = JSON.parse(storedAuth) as { accessToken?: string; refreshToken?: string }

        if (auth.accessToken && auth.refreshToken) {
          await logoutSession(auth.accessToken, auth.refreshToken)
        }
      } catch {
        // Local logout still clears the app when the server session is already gone.
      }
    }

    clearAuthenticated()
    localStorage.removeItem(storageKeys.auth)
    sessionStorage.removeItem(storageKeys.auth)
    navigate(routePaths.login, { replace: true })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="flex items-center gap-2 rounded-xl border border-orange-200 bg-white/90 py-1.5 pl-2 pr-3 shadow-sm transition hover:bg-white">
          <Avatar>
            <AvatarImage src={user?.avatarUrl} />
            <AvatarFallback>{getInitials(displayName)}</AvatarFallback>
          </Avatar>
          <span className="hidden max-w-32 truncate text-sm font-bold text-orange-900 xl:block">{displayName}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 rounded-xl p-2">
        <DropdownMenuLabel className="px-2 py-2">
          <div className="flex items-center gap-3">
            <Avatar size="lg">
              <AvatarImage src={user?.avatarUrl} />
              <AvatarFallback>{getInitials(displayName)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-slate-950">{displayName}</p>
              <p className="truncate text-xs text-slate-500">{email}</p>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="cursor-pointer rounded-lg px-2 py-2">
          <Link to={routePaths.profile}>
            <UserRound className="h-4 w-4" />
            Hồ sơ cá nhân
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" className="cursor-pointer rounded-lg px-2 py-2" onClick={handleLogout}>
          <LogOut className="h-4 w-4" />
          Đăng xuất
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(-2)
    .toUpperCase()
}

export function MetricCard({
  label,
  value,
  helper,
  detail,
  actionLabel,
  icon,
  tone,
  compact = false,
  className,
}: {
  label: string
  value: string
  helper: string
  detail?: string
  actionLabel?: string
  icon: ReactNode
  tone: ProviderTone
  compact?: boolean
  className?: string
}) {
  return (
    <article
      className={cn(
        "flex flex-col justify-between rounded-xl border border-[#c4c7c8] bg-white shadow-sm",
        compact ? "min-h-32 p-4" : "min-h-44 p-6",
        className,
      )}
    >
      <div
        className={cn(
          "flex items-start justify-between gap-4",
          compact ? "mb-3" : "mb-4",
        )}
      >
        <span className="text-xs font-bold uppercase tracking-wider text-[#747878] truncate">{label}</span>
        <span className={cn("text-[#5d5f5f] shrink-0", compact ? "[&_svg]:size-5" : "[&_svg]:size-6")}>{icon}</span>
      </div>
      <div>
        <div className={cn("font-extrabold leading-tight tracking-tight text-[#1c1b1b]", compact ? "text-xl" : "text-2xl")}>{value}</div>
        <div className={cn("flex items-center gap-1.5 text-xs font-bold", compact ? "mt-2" : "mt-3", toneText(tone))}>
          {tone === "danger" ? <TrendingDown className="size-4 shrink-0" /> : <TrendingUp className="size-4 shrink-0" />}
          <span className="leading-snug">{helper}</span>
        </div>
        {detail ? <p className="mt-1 text-[11px] font-medium text-[#747878] leading-tight">{detail}</p> : null}
        {actionLabel ? (
          <p className="mt-2 text-xs font-bold text-orange-600 inline-flex items-center gap-1 leading-none group-hover:underline">
            <span>{actionLabel}</span>
            <span aria-hidden="true">→</span>
          </p>
        ) : null}
      </div>
    </article>
  )
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("rounded-xl border border-[#c4c7c8] bg-white p-6 shadow-sm", className)}>{children}</section>
}

export function PanelTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <h3 className="text-lg font-bold leading-tight tracking-tight text-[#1c1b1b]">{title}</h3>
        {subtitle ? <p className="mt-1 text-xs font-semibold text-[#5d5f5f]">{subtitle}</p> : null}
      </div>
      {action ? <span className="shrink-0 text-[#5d5f5f]">{action}</span> : null}
    </div>
  )
}

export function SearchBar() {
  return (
    <div className="mb-5 flex h-11 items-center gap-3 rounded-lg border border-[#c4c7c8] bg-[#f6f3f2] px-3 text-[#747878]">
      <Search className="size-5" />
      <span className="text-sm font-medium">Tìm kiếm hoặc lọc dữ liệu</span>
    </div>
  )
}

export function RevenueBars() {
  const bars = [
    ["T2", 40],
    ["T3", 55],
    ["T4", 45],
    ["T5", 60],
    ["T6", 75],
    ["T7", 95],
    ["CN", 85],
  ] as const

  return (
    <div className="relative min-h-[320px] overflow-hidden rounded-lg bg-[#fcf8f8] px-3 pb-10 pt-6 sm:px-6">
      <div className="absolute inset-x-4 bottom-12 top-6 flex flex-col justify-between text-xs font-medium text-[#747878]">
        {["40M", "30M", "20M", "10M", "0"].map((line) => (
          <div key={line} className="flex items-center gap-3 border-b border-[#e5e2e1]">
            <span className="w-9 text-right font-mono">{line}</span>
          </div>
        ))}
      </div>
      <div className="relative z-10 flex h-[260px] items-end justify-around gap-2 pl-10 sm:gap-4 sm:pl-12">
        {bars.map(([label, value]) => (
          <div key={label} className="group flex h-full flex-1 flex-col items-center justify-end gap-2">
            <div className="relative flex w-full max-w-11 items-end justify-center" style={{ height: `${value}%` }}>
              <div className={cn("h-full w-full rounded-t-lg transition-opacity group-hover:opacity-80", label === "T7" ? "bg-[#1c1b1b]" : label === "CN" ? "bg-[#5d5e66]" : "bg-[#c6c6c7]")} />
            </div>
            <span className={cn("font-mono text-xs font-medium", label === "T7" ? "text-[#1c1b1b]" : "text-[#747878]")}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function BranchList({
  compact = false,
  cafes = [],
  operationsByCafe,
}: {
  compact?: boolean
  cafes?: BackendCafe[]
  operationsByCafe?: Map<string, BranchOperationsItem>
}) {
  if (cafes.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-[#c4c7c8] py-10 text-center">
        <Building2Placeholder />
        <p className="text-sm font-semibold text-[#747878]">Chưa có cơ sở nào</p>
      </div>
    )
  }

  if (compact) {
    return (
      <div className="space-y-2">
        {cafes.map((cafe) => {
          const operation = operationsByCafe?.get(cafe.id)
          return (
            <div key={cafe.id} className="rounded-lg border border-[#e5e2e1] bg-white p-4 transition-colors hover:bg-[#fcf8f8]">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-extrabold text-[#1c1b1b]">{cafe.name}</div>
                  <div className="mt-0.5 text-xs font-medium text-[#747878]">{cafe.district}, {cafe.city}</div>
                </div>
                <StatusBadge status={formatCafeStatus(cafe.status)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <InlineMetric
                  label="Doanh thu"
                  value={operation ? formatCurrency(operation.totalRevenue) : formatSlotFee(cafe.slotFeeRate)}
                />
                <InlineMetric label="Khai thác sân" value={formatOccupancyRate(operation?.occupancyRate)} align="right" />
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {cafes.map((cafe) => {
        const operation = operationsByCafe?.get(cafe.id)

        return (
          <Link
            key={cafe.id}
            to={`/provider/cafes/${cafe.id}`}
            aria-label={`Xem chi tiết ${cafe.name}`}
            className="group flex overflow-hidden rounded-xl border border-[#e5e2e1] bg-white shadow-sm transition-all hover:border-[#b0adac] hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1c1b1b]"
          >
            {/* Content */}
            <div className="flex flex-1 flex-wrap items-center gap-y-3 px-4 py-4 sm:flex-nowrap sm:gap-6">
              {/* Name + location */}
              <div className="min-w-0 flex-1">
                <span className="text-sm font-extrabold text-[#1c1b1b]">{cafe.name}</span>
                <p className="mt-0.5 text-xs font-medium text-[#747878]">{cafe.district}, {cafe.city}</p>
              </div>

              {/* Fixed-width status column keeps every status badge aligned. */}
              <div className="w-[112px] shrink-0 sm:w-[128px]">
                <StatusBadge status={formatCafeStatus(cafe.status)} />
              </div>

              {/* Metrics */}
              <div className="grid w-full shrink-0 grid-cols-2 gap-y-2 items-center sm:w-auto sm:grid-cols-[140px_160px_130px_110px] sm:divide-x sm:divide-[#e5e2e1]">
                <div className="min-w-0 pr-3 sm:pr-4">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-orange-600">Doanh thu</p>
                  <p className="mt-0.5 text-sm font-bold tabular-nums text-[#1c1b1b]">
                    {operation ? formatCurrency(operation.totalRevenue) : "--"}
                  </p>
                  {operation ? (
                    <p className="mt-0.5 text-[10px] font-medium text-[#747878]">
                      {operation.bookingCount} lượt đặt
                    </p>
                  ) : null}
                </div>
                <div className="min-w-0 px-3 sm:px-4">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-[#c4c7c8]">Khai thác sân</p>
                  <p className="mt-0.5 text-sm font-bold text-[#1c1b1b]">{formatOccupancyRate(operation?.occupancyRate)}</p>
                  {operation ? (
                    <p className="mt-0.5 text-[10px] font-medium text-[#747878]">
                      {formatOccupancyUsage(operation)}
                    </p>
                  ) : null}
                </div>
                <div className="min-w-0 px-3 sm:px-4" title={formatFleetDetail(operation)}>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-[#c4c7c8]">Đội xe</p>
                  <p className="mt-0.5 text-sm font-bold text-[#1c1b1b]">{formatFleetCount(operation)}</p>
                  {operation ? (
                    <p className="mt-0.5 text-[10px] font-medium text-[#747878]">
                      {operation.availableVehicles} sẵn sàng
                    </p>
                  ) : null}
                </div>
                <div className="min-w-0 pl-3 sm:pl-4">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-[#c4c7c8]">Phí slot</p>
                  <p className="mt-0.5 text-sm font-bold tabular-nums text-[#1c1b1b]">{formatSlotFee(cafe.slotFeeRate)}</p>
                </div>
              </div>

              {/* Arrow */}
              <ArrowRight className="ml-auto size-4 shrink-0 text-[#c4c7c8] transition-all group-hover:translate-x-0.5 group-hover:text-[#1c1b1b]" />
            </div>
          </Link>
        )
      })}
    </div>
  )
}

function Building2Placeholder() {
  return (
    <svg className="size-8 text-[#c4c7c8]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
    </svg>
  )
}


function formatCafeStatus(status: BackendCafe["status"]) {
  return status === "ACTIVE" ? "Hoạt động" : status === "PENDING" ? "Chờ duyệt" : "Tạm ngưng"
}

function formatSlotFee(value: BackendCafe["slotFeeRate"]) {
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue) || numberValue <= 0) return "--"
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(numberValue)
}

/**
 * Phút-suất → giờ, làm tròn cho người đọc.
 *
 * Đơn vị gốc là "phút-suất": một giờ mở cửa với hai sân chạy song song đếm
 * thành 120. Con số thô lên tới hàng trăm nghìn nên không ai đọc nổi; đổi sang
 * giờ rồi rút gọn hàng nghìn thì so sánh được bằng mắt.
 */
export function formatGio(minutes: number | null | undefined) {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes)) return "--"
  const hours = minutes / 60
  if (hours >= 1000) return `${Math.round(hours / 100) / 10}k giờ`
  if (hours >= 10) return `${Math.round(hours)} giờ`
  return `${Math.round(hours * 10) / 10} giờ`
}

export function formatOccupancyRate(rate: number | null | undefined) {
  if (rate === null || rate === undefined) return "--"
  const percentage = rate * 100
  if (percentage > 0 && percentage < 0.1) return "<0,1%"
  const fractionDigits = percentage > 0 && percentage < 1 ? 1 : 0
  return `${new Intl.NumberFormat("vi-VN", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(percentage)}%`
}

function formatOccupancyUsage(operation: BranchOperationsItem) {
  const hours = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(
    operation.occupiedSlotMinutes / 60,
  )
  return `${operation.bookingCount} lượt · ${hours} giờ`
}

function formatFleetCount(operation: BranchOperationsItem | undefined) {
  return operation ? `${operation.totalVehicles} xe` : "--"
}

function formatFleetDetail(operation: BranchOperationsItem | undefined) {
  if (!operation) return undefined
  return `${operation.totalVehicles} xe · ${operation.availableVehicles} sẵn sàng · ${operation.inUseVehicles} đang dùng · ${operation.maintenanceVehicles} bảo trì`
}

export function ProviderTable({ columns, rows }: { columns: string[]; rows: Array<Array<ReactNode>> }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] border-separate border-spacing-0 text-left text-sm">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column} className="border-b border-[#e5e2e1] px-4 py-3 text-xs font-bold uppercase tracking-wider text-[#747878] bg-[#fcf8f8]/60">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="hover:bg-[#fcf8f8]">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="border-b border-[#e5e2e1] px-4 py-3.5 text-sm font-bold text-[#1c1b1b]">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function InlineMetric({ label, value, align }: { label: string; value: string; align?: "right" }) {
  return (
    <div className={cn(align === "right" && "text-right")}>
      <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[#747878]">{label}</div>
      <div className="font-bold text-[#1c1b1b]">{value}</div>
    </div>
  )
}

export function StatusBadge({ status }: { status: string }) {
  const tone: ProviderTone = status.match(/Bảo trì|Sắp hết|Chờ|thiếu|Tạm|Cần/i)
    ? "warning"
    : status.match(/Đang thuê|Đang kiểm|Đang làm/i)
      ? "info"
      : status.match(/Sự cố|hết/i)
        ? "danger"
        : "success"

  return <Badge className={cn("border font-bold", badgeTone(tone))}>{status}</Badge>
}

export function StateBadge({ state }: { state: string }) {
  const tone: ProviderTone = state === "PENDING" || state === "EXTENDING" ? "warning" : state === "CHECKING_OUT" ? "info" : "success"
  return <Badge className={cn("border font-bold", badgeTone(tone))}>{state}</Badge>
}

export function toneText(tone: ProviderTone) {
  return {
    success: "text-emerald-700",
    warning: "text-amber-700",
    danger: "text-red-600",
    info: "text-blue-700",
    neutral: "text-[#444748]",
  }[tone]
}

export function tonePill(tone: ProviderTone) {
  return {
    success: "bg-emerald-50 text-emerald-700",
    warning: "bg-amber-50 text-amber-700",
    danger: "bg-red-50 text-red-700",
    info: "bg-blue-50 text-blue-700",
    neutral: "bg-[#e5e2e1] text-[#444748]",
  }[tone]
}

export function badgeTone(tone: ProviderTone) {
  return {
    success: "border-emerald-200 bg-emerald-50 text-emerald-700",
    warning: "border-amber-200 bg-amber-50 text-amber-700",
    danger: "border-red-200 bg-red-50 text-red-700",
    info: "border-blue-200 bg-blue-50 text-blue-700",
    neutral: "border-[#c4c7c8] bg-[#f6f3f2] text-[#444748]",
  }[tone]
}
