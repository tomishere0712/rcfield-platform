import React, { useState, useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link, useLocation, useNavigate } from "react-router"
import {
  LayoutDashboard,
  CalendarDays,
  Coffee,
  QrCode,
  Building,
  LogOut,
  X,
  AlertTriangle,
  Wrench,
  Search,
  UserRound,
  CircleHelp,
  Menu,
  MonitorSmartphone,
  ChevronDown,
  ChevronRight,
  Trophy,
} from "lucide-react"
import { useStaffOperations } from "../context/StaffOperationContext"
import { cafeApi } from "@/features/cafes/api/cafe.api"
import type { BackendCafe } from "@/features/cafes/types"
import { useAuthStore } from "@/features/auth/stores/auth.store"
import { routePaths } from "@/app/router/route-paths"
import { storageKeys } from "@/shared/lib/storage"
import { toast } from "sonner"
import { cn } from "@/shared/lib/utils"
import { Button } from "@/shared/ui/button"
import { StaffAccountMenu } from "./StaffUI"
import { NotificationBell } from "@/features/notifications/components/NotificationBell"
import { staffApi, staffQueryKeys } from "@/features/staff/api/staff.api"

type NavItem = { label: string; icon: React.ComponentType<{ className?: string }>; path: string }
type NavGroup = { heading: string; items: NavItem[] }

const staffNavGroups: NavGroup[] = [
  {
    heading: "Vận hành",
    items: [
      { label: "Tổng quan", icon: LayoutDashboard, path: routePaths.staffDashboard },
      { label: "Đặt lịch ngày", icon: CalendarDays, path: routePaths.staffTodayBookings },
      { label: "Danh sách giải đấu", icon: Trophy, path: routePaths.staffContests },
      { label: "Gọi món", icon: Coffee, path: routePaths.staffFnbOrders },
      // { label: "Đăng ký xe tự mang", icon: ShieldCheck, path: routePaths.staffByoc },
      // { label: "Gọi món F&B", icon: Coffee, path: routePaths.staffFnbOrders },
      // { label: "Đăng ký xe BYOC", icon: ShieldCheck, path: routePaths.staffByoc },
      { label: "Tra cứu gói chơi", icon: Search, path: routePaths.staffPackages },
    ],
  },
  {
    heading: "Đội xe & Thiết bị",
    items: [
      { label: "Bảo trì đội xe", icon: Wrench, path: routePaths.staffMaintenance },
    ],
  },
]

const staffSidebarScrollKey = "rcfield:staff-sidebar-scroll"

function saveStaffSidebarScroll(element: HTMLElement | null) {
  if (!element) return
  sessionStorage.setItem(staffSidebarScrollKey, String(element.scrollTop))
}

function restoreStaffSidebarScroll(element: HTMLElement | null) {
  if (!element) return
  const savedScrollTop = Number(sessionStorage.getItem(staffSidebarScrollKey) ?? 0)
  if (Number.isFinite(savedScrollTop)) {
    element.scrollTop = savedScrollTop
  }
}

export const StaffShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { assignedCafeId, bookings, startCheckIn, headerProps } = useStaffOperations()
  const location = useLocation()
  const navigate = useNavigate()
  const clearAuthenticated = useAuthStore((state) => state.clearAuthenticated)

  const [activeCafe, setActiveCafe] = useState<BackendCafe | null>(null)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [scanCode, setScanCode] = useState("")
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [expandedNavGroups, setExpandedNavGroups] = useState<Record<string, boolean>>({
    "Vận hành": true,
    "Đội xe & Thiết bị": true,
  })
  const { data: fnbOrders = [] } = useQuery({
    queryKey: staffQueryKeys.fnbOrders(),
    queryFn: staffApi.getFnbOrders,
    enabled: !!assignedCafeId,
    refetchInterval: 30_000,
  })
  const pendingFnbCount = fnbOrders.filter((order) => order.status === "PENDING").length

  // Provider-impersonating-staff mode
  const staffImpersonationRaw = localStorage.getItem(storageKeys.staffImpersonation)
  const staffImpersonation = staffImpersonationRaw
    ? (JSON.parse(staffImpersonationRaw) as { staffId: string; staffName: string; cafeName: string })
    : null

  const handleExitStaffImpersonation = () => {
    const providerAuthRaw = localStorage.getItem(storageKeys.providerAuth)
    if (providerAuthRaw) {
      localStorage.setItem(storageKeys.auth, providerAuthRaw)
      localStorage.removeItem(storageKeys.providerAuth)
    }
    localStorage.removeItem(storageKeys.staffImpersonation)
    window.location.href = routePaths.providerStaff
  }

  const desktopNavRef = React.useRef<HTMLElement | null>(null)
  const mobileNavRef = React.useRef<HTMLElement | null>(null)

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      restoreStaffSidebarScroll(desktopNavRef.current)
      restoreStaffSidebarScroll(mobileNavRef.current)
    })
    return () => cancelAnimationFrame(frame)
  }, [location.pathname, mobileMenuOpen])

  useEffect(() => {
    if (!assignedCafeId) {
      queueMicrotask(() => setActiveCafe(null))
      return
    }

    let mounted = true
    cafeApi
      .getCafe(assignedCafeId)
      .then((cafe) => {
        if (mounted) setActiveCafe(cafe)
      })
      .catch((err) => {
        console.error("Error loading cafe in StaffShell", err)
        if (mounted) {
          setActiveCafe(null)
        }
      })

    return () => {
      mounted = false
    }
  }, [assignedCafeId])

  const handleLogout = () => {
    clearAuthenticated()
    localStorage.removeItem("rcfield:auth")
    sessionStorage.removeItem("rcfield:auth")
    toast.success("Đã đăng xuất khỏi tài khoản nhân viên.")
    navigate(routePaths.login, { replace: true })
  }

  const handleScanSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!scanCode.trim()) return

    const matchedBooking = bookings.find(
      (b) => b.shortCode.toUpperCase() === scanCode.toUpperCase().trim() || b.bookingId === scanCode.trim()
    )

    if (!matchedBooking) {
      toast.error(`Không tìm thấy đơn đặt lịch nào khớp với mã "${scanCode}"!`)
      return
    }

    if (matchedBooking.status !== "CONFIRMED") {
      toast.error(`Đơn đặt lịch ${matchedBooking.shortCode} chưa ở trạng thái có thể nhận xe.`)
      return
    }

    const startedSession = await startCheckIn(matchedBooking.bookingId)
    const sessionId = startedSession?.sessionId ?? startedSession?.id
    setScannerOpen(false)
    setScanCode("")
    if (sessionId) {
      navigate(`/staff/sessions/${sessionId}`)
    }
  }

  // Layout level access block for unassigned staff
  if (!assignedCafeId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#fcf8f8] p-4 text-[#1c1b1b] font-sans">
        <div className="w-full max-w-md rounded-2xl border border-[#e5e2e1] bg-white p-8 shadow-xl text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-[#fff3eb] text-[#ea580c] border border-[#ffdbca]">
            <Building className="h-7 w-7" />
          </div>
          <h2 className="text-xl font-bold text-[#1c1b1b] tracking-tight mb-2">
            Chưa có phân công chi nhánh
          </h2>
          <p className="text-sm text-[#4c4a49] leading-relaxed mb-6">
            Tài khoản nhân viên của bạn hiện chưa được phân công quản lý chi nhánh nào.
            Vui lòng liên hệ với Admin hoặc Nhà cung cấp (Provider) để được phân công trước khi truy cập.
          </p>
          <div className="flex flex-col gap-2">
            <button
              onClick={handleLogout}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#ea580c] py-3 text-sm font-semibold text-white hover:bg-[#d94e0b] shadow-md transition-all duration-200 active:scale-[0.98]"
            >
              <LogOut className="h-4 w-4" />
              Đăng xuất
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-[#fcf8f8] text-[#1c1b1b] font-sans pb-20 md:pb-0">
      {/* PROVIDER-IMPERSONATING-STAFF BANNER */}
      {staffImpersonation && (
        <div className="fixed left-0 right-0 top-0 z-[100] flex h-10 items-center justify-between gap-3 bg-orange-600 px-4 text-white shadow-md">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <MonitorSmartphone className="size-4 shrink-0" />
            <span>Đang xem với tư cách nhân viên: <strong>{staffImpersonation.staffName}</strong> — {staffImpersonation.cafeName}</span>
          </div>
          <button
            onClick={handleExitStaffImpersonation}
            className="flex items-center gap-1.5 rounded-lg border border-white/30 bg-white/10 px-3 py-1 text-xs font-bold hover:bg-white/20 transition-colors shrink-0"
          >
            <X className="size-3.5" />
            Thoát
          </button>
        </div>
      )}
      {/* DESKTOP SIDEBAR */}
      <aside className={cn("fixed bottom-0 left-0 z-50 hidden w-64 flex-col rounded-r-xl border-r border-[#e5e2e1] bg-white p-4 md:flex shadow-sm", staffImpersonation ? "top-10" : "top-0")}>
        <Link to={routePaths.staffDashboard} className="mb-8 flex items-center gap-2.5 px-2">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-orange-600 text-white shadow-md">
            <Building className="size-4" />
          </div>
          <div className="min-w-0">
            <h1 className="whitespace-nowrap text-xl font-bold leading-tight tracking-tight text-[#1c1b1b]">RCField Staff</h1>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#747878]">Cổng nhân viên</p>
          </div>
        </Link>

        <nav
          ref={desktopNavRef}
          onScroll={(event) => saveStaffSidebarScroll(event.currentTarget)}
          className="flex flex-1 flex-col gap-4 overflow-y-auto pr-1"
        >
          {staffNavGroups.map((group) => (
            <div key={group.heading}>
              <button
                type="button"
                onClick={() => setExpandedNavGroups((current) => ({ ...current, [group.heading]: !current[group.heading] }))}
                className="mb-1 flex w-full items-center justify-between rounded-lg px-4 py-2 text-left text-[10px] font-extrabold uppercase tracking-widest text-[#b0b4b4] hover:bg-orange-50/70"
              >
                <span>{group.heading}</span>
                {expandedNavGroups[group.heading] ? <ChevronDown className="size-3.5 text-[#747878]" /> : <ChevronRight className="size-3.5 text-[#747878]" />}
              </button>
              {expandedNavGroups[group.heading] ? <div className="flex flex-col gap-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon
                  const active = location.pathname === item.path || (item.path !== routePaths.staffDashboard && location.pathname.startsWith(item.path))

                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={() => saveStaffSidebarScroll(desktopNavRef.current)}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-bold transition-all duration-150",
                        active
                          ? "border border-orange-100 bg-orange-50 text-orange-700 shadow-sm"
                          : "text-[#444748] hover:bg-[rgb(246,243,242)] hover:text-[rgb(28,27,27)]"
                      )}
                    >
                      <Icon className={cn("size-4.5", active ? "text-orange-600" : "text-[#747878]")} />
                      <span className="min-w-0 flex-1">{item.label}</span>
                      {item.path === routePaths.staffFnbOrders && pendingFnbCount > 0 && (
                        <span className="rounded-full bg-orange-600 px-1.5 py-0.5 text-[10px] font-extrabold leading-none text-white">
                          {pendingFnbCount > 99 ? "99+" : pendingFnbCount}
                        </span>
                      )}
                    </Link>
                  )
                })}
              </div> : null}
            </div>
          ))}
        </nav>

        <div className="mt-3 flex flex-col gap-1 border-t border-[#e5e2e1] pt-3">
          <Link
            to={routePaths.profile}
            className={cn(
              "flex items-center gap-3 rounded-lg px-4 py-3 text-left text-sm font-bold transition-all duration-150",
              location.pathname === routePaths.profile
                ? "border border-orange-100 bg-orange-50 text-orange-700 shadow-sm"
                : "text-[#444748] hover:bg-[rgb(246,243,242)] hover:text-[rgb(28,27,27)]"
            )}
          >
            <UserRound className={cn("size-5", location.pathname === routePaths.profile ? "text-orange-600" : "text-[#747878]")} />
            Hồ sơ cá nhân
          </Link>
          <Link
            to={routePaths.staffHelp}
            className={cn(
              "flex items-center gap-3 rounded-lg px-4 py-3 text-left text-sm font-bold transition-all duration-150",
              location.pathname === routePaths.staffHelp
                ? "border border-orange-100 bg-orange-50 text-orange-700 shadow-sm"
                : "text-[#444748] hover:bg-[rgb(246,243,242)] hover:text-[rgb(28,27,27)]"
            )}
          >
            <CircleHelp className={cn("size-5", location.pathname === routePaths.staffHelp ? "text-orange-600" : "text-[#747878]")} />
            Trợ giúp
          </Link>
          <button onClick={handleLogout} className="flex items-center gap-3 rounded-lg px-4 py-3 text-left text-sm font-bold text-[#444748] hover:bg-red-50 hover:text-red-700">
            <LogOut className="size-5 text-[#747878]" />
            Đăng xuất
          </button>
        </div>
      </aside>

      {/* MOBILE HEADER */}
      <header className={cn("fixed inset-x-0 z-50 flex h-16 items-center justify-between border-b border-orange-200 bg-white px-4 shadow-sm md:hidden", staffImpersonation ? "top-10" : "top-0")}>
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-orange-600 text-white shadow-sm">
            <Building className="size-4" />
          </div>
          <span className="text-sm font-extrabold text-[#1c1b1b] truncate max-w-[180px]">
            {activeCafe ? activeCafe.name : "RCField Staff"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <NotificationBell />
          <Button variant="ghost" size="icon" aria-label="Mở menu" className="text-[#444748] hover:bg-[rgb(246,243,242)]" onClick={() => setMobileMenuOpen(true)}>
            <Menu className="size-5" />
          </Button>
        </div>
      </header>

      {/* MOBILE DRAWER */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
          <div className="relative flex w-full max-w-xs flex-col bg-white p-4 shadow-xl">
            <div className="mb-8 flex items-center justify-between px-2">
              <span className="text-lg font-extrabold text-[#1c1b1b]">Menu Nhân viên</span>
              <Button variant="ghost" size="icon" onClick={() => setMobileMenuOpen(false)} className="text-[#444748] hover:bg-[rgb(246,243,242)]">
                <X className="size-5" />
              </Button>
            </div>

            <nav
              ref={mobileNavRef}
              onScroll={(event) => saveStaffSidebarScroll(event.currentTarget)}
              className="flex flex-1 flex-col gap-4 overflow-y-auto"
            >
              {staffNavGroups.map((group) => (
                <div key={group.heading}>
                  <button
                    type="button"
                    onClick={() => setExpandedNavGroups((current) => ({ ...current, [group.heading]: !current[group.heading] }))}
                    className="mb-1 flex w-full items-center justify-between rounded-lg px-4 py-2 text-left text-[10px] font-extrabold uppercase tracking-widest text-[#b0b4b4] hover:bg-orange-50/70"
                  >
                    <span>{group.heading}</span>
                    {expandedNavGroups[group.heading] ? <ChevronDown className="size-3.5 text-[#747878]" /> : <ChevronRight className="size-3.5 text-[#747878]" />}
                  </button>
                  {expandedNavGroups[group.heading] ? <div className="flex flex-col gap-0.5">
                    {group.items.map((item) => {
                      const Icon = item.icon
                      const active = location.pathname === item.path || (item.path !== routePaths.staffDashboard && location.pathname.startsWith(item.path))

                      return (
                        <Link
                          key={item.path}
                          to={item.path}
                          onClick={() => {
                            saveStaffSidebarScroll(mobileNavRef.current)
                            setMobileMenuOpen(false)
                          }}
                          className={cn(
                            "flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-bold transition-all",
                            active
                              ? "border border-orange-100 bg-orange-50 text-orange-700 shadow-sm"
                              : "text-[#444748] hover:bg-[rgb(246,243,242)]"
                          )}
                        >
                          <Icon className={cn("size-4.5", active ? "text-orange-600" : "text-[#747878]")} />
                          <span className="min-w-0 flex-1">{item.label}</span>
                          {item.path === routePaths.staffFnbOrders && pendingFnbCount > 0 && (
                            <span className="rounded-full bg-orange-600 px-1.5 py-0.5 text-[10px] font-extrabold leading-none text-white">
                              {pendingFnbCount > 99 ? "99+" : pendingFnbCount}
                            </span>
                          )}
                        </Link>
                      )
                    })}
                  </div> : null}
                </div>
              ))}
            </nav>

            <div className="mt-3 flex flex-col gap-1 border-t border-[#e5e2e1] pt-3">
              <Link
                to={routePaths.profile}
                onClick={() => setMobileMenuOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-4 py-3 text-left text-sm font-bold transition-all",
                  location.pathname === routePaths.profile
                    ? "border border-orange-100 bg-orange-50 text-orange-700 shadow-sm"
                    : "text-[#444748] hover:bg-[rgb(246,243,242)]"
                )}
              >
                <UserRound className={cn("size-5", location.pathname === routePaths.profile ? "text-orange-600" : "text-[#747878]")} />
                Hồ sơ cá nhân
              </Link>
              <Link
                to={routePaths.staffHelp}
                onClick={() => setMobileMenuOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-4 py-3 text-left text-sm font-bold transition-all",
                  location.pathname === routePaths.staffHelp
                    ? "border border-orange-100 bg-orange-50 text-orange-700 shadow-sm"
                    : "text-[#444748] hover:bg-[rgb(246,243,242)]"
                )}
              >
                <CircleHelp className={cn("size-5", location.pathname === routePaths.staffHelp ? "text-orange-600" : "text-[#747878]")} />
                Trợ giúp
              </Link>
              <button onClick={handleLogout} className="flex items-center gap-3 rounded-lg px-4 py-3 text-left text-sm font-bold text-[#444748] hover:bg-red-50 hover:text-red-700">
                <LogOut className="size-5 text-[#747878]" />
                Đăng xuất
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MAIN CONTAINER */}
      <main className={cn("w-full flex-1 bg-[#fcf8f8] pb-24 md:ml-64 md:pb-0", staffImpersonation ? "pt-26 md:pt-10" : "pt-16 md:pt-0")}>
        {headerProps ? (
          <header className="sticky top-0 z-40 flex w-full flex-col gap-4 border-b border-[#c4c7c8]/80 bg-[#fcf8f8]/80 px-4 py-4 backdrop-blur-md md:px-6">
            <div className="flex w-full flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                {assignedCafeId && (
                  <div className="flex flex-wrap items-center gap-2 mb-1.5">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide bg-[#fff3eb] text-[#ea580c] border border-[#ffdbca]">
                      <span className="relative flex h-1.5 w-1.5 mr-1.5">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                      </span>
                      {activeCafe ? activeCafe.name : "RC Arena"} • ĐANG TRỰC CA
                    </span>
                  </div>
                )}
                <h2 className="text-2xl font-extrabold leading-[1.1] tracking-tight text-[#1c1b1b] md:text-3xl">{headerProps.title}</h2>
                {headerProps.subtitle && <p className="mt-2 text-xs font-semibold text-[#444748] md:text-sm">{headerProps.subtitle}</p>}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {headerProps.action ? (
                  <div className="flex flex-wrap items-center gap-3 sm:mr-3">
                    {headerProps.action}
                  </div>
                ) : null}
                <div className="hidden items-center gap-4 border-l border-[#c4c7c8]/50 pl-3 md:flex">
                  <NotificationBell />
                  <StaffAccountMenu />
                </div>
              </div>
            </div>
          </header>
        ) : (
          <header className="sticky top-0 z-40 hidden h-16 w-full items-center justify-between border-b border-[#c4c7c8]/80 bg-[#fcf8f8]/80 px-6 backdrop-blur-md md:flex">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-lg bg-orange-600 text-white shadow-md">
                <Building className="size-5" />
              </div>
              <div>
                <h1 className="text-sm font-extrabold text-[#1c1b1b]">
                  {activeCafe ? activeCafe.name : "Chưa chọn chi nhánh"}
                </h1>
                <div className="flex items-center gap-1.5">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-[#10b981]"></span>
                  </span>
                  <p className="text-[10px] text-emerald-600 font-extrabold uppercase tracking-wider">Trực Ca</p>
                </div>
              </div>
            </div>

            {/* Action controls */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-4 border-l border-[#c4c7c8]/50 pl-3">
                <NotificationBell />
                <StaffAccountMenu />
              </div>
            </div>
          </header>
        )}

        {/* SCREEN BODY */}
        <div className="mx-auto max-w-7xl px-4 py-8 md:px-6">{children}</div>
      </main>

      {/* SCANNER MODAL SIMULATOR */}
      {scannerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-[#e5e2e1] bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2 text-orange-600">
                <QrCode className="size-5" />
                <h3 className="font-bold text-[#1c1b1b]">Quét mã QR nhận xe</h3>
              </div>
              <button
                onClick={() => setScannerOpen(false)}
                className="flex size-7 items-center justify-center rounded-full bg-[#f6f3f2] text-[#747878] hover:bg-[#e5e2e1] hover:text-[#1c1b1b]"
              >
                <X className="size-4" />
              </button>
            </div>

            <form onSubmit={handleScanSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#747878] mb-1">
                  Nhập mã đơn đặt lịch
                </label>
                <input
                  type="text"
                  placeholder="Ví dụ: RCF-8829"
                  value={scanCode}
                  onChange={(e) => setScanCode(e.target.value)}
                  className="w-full rounded-lg border border-[#c4c7c8] bg-white px-3 py-2.5 text-sm font-bold text-[#1c1b1b] placeholder-[#b0b4b4] focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                  autoFocus
                />
              </div>

              <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-[11px] text-yellow-800 leading-relaxed flex gap-2">
                <AlertTriangle className="size-5 shrink-0 text-yellow-600" />
                <div>
                  <span className="font-semibold block mb-0.5">Lưu ý vận hành:</span>
                  Nhập mã đơn đặt lịch của khách trong ngày. Sau khi nhận xe, hệ thống sẽ mở phiên để nhân viên lập biên bản bàn giao xe.
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setScannerOpen(false)}
                  className="flex-1 rounded-lg bg-[#f6f3f2] py-2.5 text-sm font-semibold text-[#444748] hover:bg-[#e5e2e1]"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-lg bg-orange-600 py-2.5 text-sm font-semibold text-white hover:bg-orange-500 shadow-md"
                >
                  Xác nhận quét
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
