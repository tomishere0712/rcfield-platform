import { useState, useEffect, useRef } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Bell, CheckCheck, X } from "lucide-react"
import { useNavigate } from "react-router"
import { cn } from "@/shared/lib/utils"
import { useAuthStore } from "@/features/auth/stores/auth.store"
import { notificationApi } from "../api/notification.api"
import { resolveNotificationRoute } from "../lib/notification-routing"
import type { Notification } from "../types"


function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "vừa xong"
  if (mins < 60) return `${mins} phút trước`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} giờ trước`
  return `${Math.floor(hours / 24)} ngày trước`
}

export function NotificationBell() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const user = useAuthStore((state) => state.user)
  const hasAccess = user?.role === "provider" || user?.role === "staff" || user?.role === "customer"

  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => notificationApi.list({ limit: 15 }),
    refetchInterval: hasAccess ? 30000 : undefined,
    enabled: !!hasAccess,
  })

  const markReadMutation = useMutation({
    mutationFn: (id: string) => notificationApi.markRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  })

  const markAllMutation = useMutation({
    mutationFn: () => notificationApi.markAllRead(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  })

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  if (!hasAccess) return null

  const notifications = data?.data ?? []
  const unreadCount = data?.unreadCount ?? 0

  const handleNotificationClick = (n: Notification) => {
    if (!n.readAt) markReadMutation.mutate(n.id)
    setOpen(false)

    const directRoute = resolveNotificationRoute(n.data?.route)
    if (directRoute) {
      navigate(directRoute)
      return
    }

    const contestId = typeof n.data?.contest_id === "string" ? n.data.contest_id : null
    const isProviderContestFeeNotification =
      user?.role === "provider" && typeof n.data?.contest_fee_order_id === "string"
    const sessionId = typeof n.data?.sessionId === "string" ? n.data.sessionId : null
    const bookingId = typeof n.data?.bookingId === "string" ? n.data.bookingId : null
    if (contestId && (n.type.startsWith("CONTEST_") || isProviderContestFeeNotification)) {
      if (user?.role === "customer") {
        navigate(`/contests/${contestId}`)
      } else if (user?.role === "provider") {
        navigate(`/provider/contests/${contestId}/overview`)
      } else if (user?.role === "staff") {
        navigate(`/staff/contests/${contestId}/check-in`)
      }
    } else if (n.type === "SESSION_OVERDUE_ALERT") {
      if (user?.role === "staff" && sessionId) {
        navigate(`/staff/sessions/${sessionId}`)
      } else if (user?.role === "provider") {
        navigate("/provider/dashboard")
      }
    } else if (
      n.type === "SESSION_CHECKIN_INSPECTION" ||
      n.type === "SESSION_CHECKOUT_INSPECTION"
    ) {
      if (bookingId) {
        navigate(`/customer/bookings/${bookingId}?section=handover`)
      } else if (sessionId) {
        navigate(`/customer/bookings`)
      } else {
        navigate("/customer/bookings")
      }
    } else if (n.type === "SESSION_EXTENSION_PROPOSED") {
      navigate(sessionId ? `/customer/extension-response/${sessionId}` : "/customer/bookings")
    } else if (n.type === "SESSION_FNB_ORDER_ADDED") {
      if (bookingId) {
        navigate(`/booking/${bookingId}`)
      } else {
        navigate(sessionId ? `/customer/sessions/${sessionId}` : "/customer/bookings")
      }
    } else if (n.type === "BOOKING_REVIEW_REQUEST") {
      navigate(
        bookingId
          ? `/customer/bookings?reviewBookingId=${encodeURIComponent(bookingId)}`
          : "/customer/bookings",
      )
    } else if (
      n.type === "VEHICLE_MAINTENANCE_CREATED" ||
      n.type === "MAINTENANCE_LOG_UPDATED" ||
      n.type === "DAMAGE_REPORTED" ||
      n.data?.route === "/staff/maintenance"
    ) {
      navigate("/staff/maintenance")
    } else if (
      n.type === "CUSTOMER_CHECKIN_CONFIRMED" ||
      n.type === "CUSTOMER_CHECKOUT_CONFIRMED" ||
      n.type === "CUSTOMER_INSPECTION_DISPUTED" ||
      n.type === "CUSTOMER_EXTENSION_APPROVED" ||
      n.type === "CUSTOMER_EXTENSION_REJECTED" ||
      n.type === "CUSTOMER_PAYMENT_CONFIRMED"
    ) {
      if (user?.role === "customer") {
        navigate(bookingId ? `/customer/bookings/${bookingId}` : "/customer/bookings")
      } else if (user?.role === "staff" && sessionId) {
        navigate(`/staff/sessions/${sessionId}`)
      }
    } else if (n.type === "BOOKING_CANCELLED") {
      if (user?.role === "customer") {
        navigate(bookingId ? `/customer/bookings/${bookingId}` : "/customer/bookings")
      } else if (user?.role === "staff") {
        navigate(bookingId ? `/staff/bookings/${bookingId}` : "/staff/today-bookings")
      } else if (user?.role === "provider") {
        navigate("/provider/bookings")
      }
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex size-9 items-center justify-center rounded-full hover:bg-slate-100 transition-colors"
        aria-label="Thông báo"
      >
        <Bell className="size-5 text-slate-600" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-extrabold text-white leading-none">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-80 rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <span className="text-sm font-bold text-slate-800">Thông báo</span>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={() => markAllMutation.mutate()}
                  className="text-xs font-semibold text-orange-600 hover:underline flex items-center gap-1"
                >
                  <CheckCheck className="size-3.5" /> Đọc tất cả
                </button>
              )}
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="size-4" />
              </button>
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-slate-50">
            {notifications.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-400">Không có thông báo nào</div>
            ) : (
              notifications.map((n: Notification) => (
                <button
                  key={n.id}
                  className={cn(
                    "w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors",
                    !n.readAt && "bg-orange-50/60",
                  )}
                  onClick={() => handleNotificationClick(n)}
                >
                  <div className="flex items-start gap-2.5">
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-xs font-bold truncate", !n.readAt ? "text-slate-800" : "text-slate-600")}>
                        {n.title}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-2">{n.message}</p>
                      <p className="text-[10px] text-slate-300 mt-1">{timeAgo(n.createdAt)}</p>
                    </div>
                    {!n.readAt && <span className="size-2 rounded-full bg-orange-500 shrink-0 mt-1" />}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
