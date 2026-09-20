import { Link, useNavigate } from "react-router"
import type { ReactNode } from "react"
import { ArrowUpRight, ArrowDownRight, Search, LogOut, UserRound } from "lucide-react"

import { routePaths } from "@/app/router/route-paths"
import { logoutSession } from "@/features/auth/api/auth.api"
import { useAuthStore } from "@/features/auth/stores/auth.store"
import { storageKeys } from "@/shared/lib/storage"
import { cn } from "@/shared/lib/utils"
import { Badge } from "@/shared/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu"
import { NotificationBell } from "@/features/notifications/components/NotificationBell"

export function AdminHeader({
  title,
  description,
  actions,
}: {
  title: string
  description: string
  actions?: ReactNode
}) {
  return (
    <header
      className="sticky top-0 z-40 flex w-full flex-col gap-4 border-b border-[#c4c7c8]/80 bg-[#fcf8f8]/80 px-4 py-4 backdrop-blur-md md:px-6"
    >
      <div className="flex w-full flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <h2 className="text-3xl font-extrabold leading-[1.1] tracking-tight text-[#1c1b1b] md:text-4xl">{title}</h2>
          <p className="mt-2 text-sm font-semibold text-[#444748]">{description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {actions ? (
            <div className="flex flex-wrap items-center gap-3 sm:mr-3">
              {actions}
            </div>
          ) : null}
          <div className="flex items-center gap-2 border-l border-[#c4c7c8]/50 pl-3">
            <NotificationBell />
            <AdminAccountMenu />
          </div>
        </div>
      </div>
    </header>
  )
}
AdminHeader.displayName = "AdminHeader"

function AdminAccountMenu() {
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const clearAuthenticated = useAuthStore((state) => state.clearAuthenticated)

  const displayName = user?.fullName ?? "Admin"
  const email = user?.email ?? "admin@rcfield.vn"

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

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((part) => part[0])
      .join("")
      .slice(-2)
      .toUpperCase()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="flex items-center gap-2 rounded-xl border border-orange-200 bg-white/90 py-1.5 pl-2 pr-3 shadow-sm transition hover:bg-white">
          <Avatar>
            <AvatarImage src={user?.avatarUrl} />
            <AvatarFallback>{getInitials(displayName)}</AvatarFallback>
          </Avatar>
          <span className="hidden max-w-32 truncate text-sm font-bold text-orange-950 xl:block">{displayName}</span>
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

export function AdminMetricCard({
  label,
  value,
  helper,
  icon,
  trend = "up",
}: {
  label: string
  value: string
  helper: string
  icon: ReactNode
  trend?: "up" | "down"
}) {
  return (
    <article className="flex min-h-[140px] flex-col justify-between rounded-xl border border-[#e5e2e1] bg-white p-5 shadow-sm transition-all duration-200 hover:shadow-md">
      <div className="flex items-start justify-between gap-4">
        <span className="text-xs font-bold uppercase tracking-wider text-[#747878]">{label}</span>
        <span className="text-[#747878] [&_svg]:size-5">{icon}</span>
      </div>
      <div className="mt-2">
        <div className="text-2xl font-extrabold leading-tight tracking-tight text-[#1c1b1b]">{value}</div>
        <div className="mt-1.5 flex items-center gap-1 text-xs font-bold">
          {trend === "up" ? (
            <span className="inline-flex items-center text-emerald-600">
              <ArrowUpRight className="mr-0.5 size-3.5" />
              {helper}
            </span>
          ) : (
            <span className="inline-flex items-center text-red-500">
              <ArrowDownRight className="mr-0.5 size-3.5" />
              {helper}
            </span>
          )}
        </div>
      </div>
    </article>
  )
}

export function AdminPanel({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("rounded-xl border border-[#e5e2e1] bg-white p-5 shadow-sm", className)}>{children}</section>
}

export function AdminPanelTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div>
        <h3 className="text-lg font-bold leading-tight tracking-tight text-[#1c1b1b]">{title}</h3>
        {subtitle ? <p className="mt-1 text-xs font-semibold text-[#5d5f5f]">{subtitle}</p> : null}
      </div>
      {action ? <span className="text-[#5d5f5f]">{action}</span> : null}
    </div>
  )
}

export function AdminSearchBar({
  placeholder = "Tìm kiếm...",
  value,
  onChange,
}: {
  placeholder?: string
  value?: string
  onChange?: (val: string) => void
}) {
  return (
    <div className="relative flex h-10 w-full max-w-sm items-center gap-2 rounded-lg border border-[#e5e2e1] bg-white px-3 text-[#747878] focus-within:border-orange-500/50 focus-within:ring-2 focus-within:ring-orange-500/10">
      <Search className="size-4 text-[#747878]" />
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        className="w-full bg-transparent text-sm font-semibold text-[#1c1b1b] placeholder-[#747878] outline-none"
      />
    </div>
  )
}

export function AdminTable({ columns, rows }: { columns: string[]; rows: Array<Array<ReactNode>> }) {
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
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-8 text-center text-sm font-semibold text-[#747878]">
                Không tìm thấy dữ liệu phù hợp.
              </td>
            </tr>
          ) : (
            rows.map((row, index) => (
              <tr key={index} className="hover:bg-[#fcf8f8] transition-colors">
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="border-b border-[#e5e2e1] px-4 py-3.5 text-sm font-bold text-[#1c1b1b]">
                    {cell}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

export function CafeStatusBadge({ status }: { status: string }) {
  const cnMap = {
    ACTIVE: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50",
    APPROVED: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50",
    PENDING: "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50",
    REJECTED: "border-red-200 bg-red-50 text-red-700 hover:bg-red-50",
    SUSPENDED: "border-zinc-200 bg-zinc-100 text-zinc-600 hover:bg-zinc-100",
  }

  return (
    <Badge className={cn("border font-bold shadow-none rounded-md px-2 py-0.5", cnMap[status as keyof typeof cnMap] || "border-gray-200 bg-gray-50 text-gray-700")}>
      {(status === "APPROVED" || status === "ACTIVE") && "Hoạt động"}
      {status === "PENDING" && "Chờ duyệt"}
      {status === "REJECTED" && "Từ chối"}
      {status === "SUSPENDED" && "Tạm ngưng"}
    </Badge>
  )
}

export function DisputeStatusBadge({ status }: { status: string }) {
  const cnMap = {
    OPEN: "border-red-200 bg-red-50 text-red-700 hover:bg-red-50",
    UNDER_REVIEW: "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50",
    RESOLVED: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50",
    WAIVED: "border-zinc-200 bg-zinc-100 text-zinc-600 hover:bg-zinc-100",
  }

  return (
    <Badge className={cn("border font-bold shadow-none rounded-md px-2 py-0.5", cnMap[status as keyof typeof cnMap] || "border-gray-200 bg-gray-50 text-gray-700")}>
      {status === "OPEN" && "Mới mở"}
      {status === "UNDER_REVIEW" && "Đang xử lý"}
      {status === "RESOLVED" && "Đã phân quyết"}
      {status === "WAIVED" && "Được miễn giảm"}
    </Badge>
  )
}

export function UserStatusBadge({ status }: { status: string }) {
  return (
    <Badge
      className={cn(
        "border font-bold shadow-none rounded-md px-2 py-0.5",
        status === "ACTIVE"
          ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50"
          : "border-red-200 bg-red-50 text-red-700 hover:bg-red-50"
      )}
    >
      {status === "ACTIVE" ? "Đang hoạt động" : "Bị khóa"}
    </Badge>
  )
}

export function PaymentStatusBadge({ status }: { status: string }) {
  const cnMap = {
    SUCCESS: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50",
    PENDING: "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50",
    FAILED: "border-red-200 bg-red-50 text-red-700 hover:bg-red-50",
  }

  return (
    <Badge className={cn("border font-bold shadow-none rounded-md px-2 py-0.5", cnMap[status as keyof typeof cnMap] || "border-gray-200 bg-gray-50 text-gray-700")}>
      {status === "SUCCESS" && "Thành công"}
      {status === "PENDING" && "Chờ duyệt"}
      {status === "FAILED" && "Thất bại"}
    </Badge>
  )
}

export function FeatureStatusBadge({ status }: { status: string }) {
  const cnMap = {
    READY: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50",
    MOCK: "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50",
    DISABLED: "border-zinc-200 bg-zinc-100 text-zinc-600 hover:bg-zinc-100",
  }

  return (
    <Badge className={cn("border font-bold shadow-none rounded-md px-2.5 py-0.5 font-mono text-[10px]", cnMap[status as keyof typeof cnMap] || "border-gray-200 bg-gray-50 text-gray-700")}>
      {status}
    </Badge>
  )
}
