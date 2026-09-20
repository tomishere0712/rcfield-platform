import { useNavigate } from "react-router"
import { Link } from "react-router"
import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  ArrowRight,
  CalendarCheck,
  ChevronRight,
  Clock,
  CreditCard,
  MapPin,
  Package,
  Trophy,
  Zap,
} from "lucide-react"
import { useAuthStore } from "@/features/auth/stores/auth.store"
import { useMyBookings } from "@/features/booking/hooks/use-booking"
import { useMyPackages } from "@/features/customer-packages/hooks/use-customer-packages"
import { getCafes } from "@/features/explore/api/explore.api"
import { routePaths } from "@/app/router/route-paths"
import { cn } from "@/shared/lib/utils"
import { formatCurrency } from "@/shared/lib/format"
import { Badge } from "@/shared/ui/badge"
import { Button } from "@/shared/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/ui/avatar"
import type { BookingListItem, BookingStatus } from "@/features/booking/types/booking.types"
import type { MyPackageItem } from "@/features/customer-packages/api/customer-package.api"
import type { Cafe } from "@/shared/data/explore-data"
import { ReviewReminderBanner } from "@/features/booking-review/components/ReviewReminderBanner"

// ── helpers ───────────────────────────────────────────────────────────────────

function getInitials(name: string) {
  return name.split(" ").map((p) => p[0]).join("").slice(-2).toUpperCase()
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return "Chào buổi sáng"
  if (h < 18) return "Chào buổi chiều"
  return "Chào buổi tối"
}

const STATUS_META: Record<BookingStatus, { label: string; color: string; dot: string }> = {
  PENDING:   { label: "Chờ thanh toán", color: "bg-amber-50 text-amber-700 border-amber-200",   dot: "bg-amber-400" },
  CONFIRMED: { label: "Đã xác nhận",    color: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
  AWAITING_PAYMENT: { label: "Chờ thanh toán phí phát sinh", color: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-500" },
  COMPLETED: { label: "Hoàn thành",     color: "bg-slate-100 text-slate-500 border-slate-200",  dot: "bg-slate-400" },
  CANCELLED: { label: "Đã hủy",         color: "bg-red-50 text-red-600 border-red-200",          dot: "bg-red-400" },
  NO_SHOW:   { label: "Không đến",      color: "bg-orange-50 text-orange-600 border-orange-200", dot: "bg-orange-400" },
}

// ── sub-components ────────────────────────────────────────────────────────────

function HeroGreeting({ name, avatarUrl }: { name: string; avatarUrl?: string }) {
  return (
    <div className="flex items-center gap-3">
      <Avatar className="h-11 w-11 ring-2 ring-white shadow-md">
        <AvatarImage src={avatarUrl} />
        <AvatarFallback className="bg-orange-100 text-orange-700 font-bold text-sm">
          {getInitials(name)}
        </AvatarFallback>
      </Avatar>
      <div>
        <p className="text-xs text-slate-400 font-medium">{getGreeting()},</p>
        <h1 className="text-lg font-extrabold text-slate-900 leading-tight">{name}</h1>
      </div>
    </div>
  )
}

function QuickActions() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
      {[
        { icon: MapPin,       label: "Tìm sân",      to: routePaths.cafes,              color: "bg-orange-500" },
        { icon: Trophy,       label: "Giải đấu",     to: routePaths.contests,           color: "bg-brand-indigo" },
        { icon: CalendarCheck,label: "Lịch đặt",     to: routePaths.customerBookings,   color: "bg-emerald-500" },
        { icon: Package,      label: "Gói hội viên", to: routePaths.customerPackages,   color: "bg-violet-500" },
      ].map(({ icon: Icon, label, to, color }) => (
        <Link
          key={to}
          to={to}
          className="flex flex-col items-center gap-2.5 rounded-2xl border border-border bg-card px-3 py-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
        >
          <div className={cn("flex h-11 w-11 items-center justify-center rounded-xl text-white shadow-sm", color)}>
            <Icon className="h-5 w-5" />
          </div>
          <span className="text-xs font-bold text-foreground">{label}</span>
        </Link>
      ))}
    </div>
  )
}

function UpcomingBookingCard({ booking }: { booking: BookingListItem }) {
  const meta = STATUS_META[booking.status]
  const slotStart = new Date(booking.slotStart)
  const slotEnd = new Date(booking.slotEnd)
  const shortId = booking.id.substring(0, 8).toUpperCase()

  const dateLabel = slotStart.toLocaleDateString("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit" })
  const timeLabel = `${slotStart.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", hour12: false })} – ${slotEnd.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", hour12: false })}`

  return (
    <Link
      to={`/booking/${booking.id}`}
      className="group flex items-center gap-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
    >
      {/* Date block */}
      <div className="flex w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-orange-50 py-2.5 text-center">
        <span className="text-[10px] font-bold uppercase tracking-wider text-orange-400">
          {slotStart.toLocaleDateString("vi-VN", { month: "short" })}
        </span>
        <span className="text-2xl font-extrabold leading-none text-orange-600">
          {slotStart.getDate()}
        </span>
        <span className="text-[10px] font-semibold text-orange-400">
          {slotStart.toLocaleDateString("vi-VN", { weekday: "short" })}
        </span>
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-1">
          <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold", meta.color)}>
            <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
            {meta.label}
          </span>
          <Badge variant="outline" className={cn("text-[10px] font-bold border-none", booking.playMode === "RENTAL" ? "bg-orange-100 text-orange-700" : "bg-sky-100 text-sky-700")}>
            {booking.playMode === "RENTAL" ? "Thuê xe của quán" : "Mang xe cá nhân"}
          </Badge>
        </div>
        <p className="text-sm font-bold text-slate-800 truncate">{dateLabel} · {timeLabel}</p>
        <p className="text-xs text-slate-400 font-mono mt-0.5">#{shortId}</p>
      </div>

      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 group-hover:text-slate-500 transition-colors" />
    </Link>
  )
}

function ActivePackageCard({ pkg }: { pkg: MyPackageItem }) {
  const [now] = useState(() => Date.now())
  const slotsRemaining = Math.round(Number(pkg.slots_remaining))
  const slotsTotal = Math.round(Number(pkg.slots_total))
  const pct = slotsTotal > 0 ? Math.round((slotsRemaining / slotsTotal) * 100) : 0
  const expiresAt = new Date(pkg.expires_at)
  const daysLeft = Math.ceil((expiresAt.getTime() - now) / (1000 * 60 * 60 * 24))
  const isExpiringSoon = daysLeft <= 7

  return (
    <div className="rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50 to-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-violet-400 mb-0.5">{pkg.cafe_name}</p>
          <h4 className="text-sm font-extrabold text-slate-800 truncate">{pkg.package_name}</h4>
        </div>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-100">
          <Package className="h-4 w-4 text-violet-600" />
        </div>
      </div>

      {/* Slot progress */}
      <div className="mb-2">
        <div className="flex justify-between text-xs font-semibold text-slate-600 mb-1.5">
          <span>Còn <span className="text-violet-700 font-extrabold">{slotsRemaining}</span> / {slotsTotal} slot</span>
          <span>{pct}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-violet-100">
          <div
            className="h-full rounded-full bg-violet-500 transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className={cn("flex items-center gap-1 text-[10px] font-semibold", isExpiringSoon ? "text-red-500" : "text-slate-400")}>
        <Clock className="h-3 w-3" />
        {isExpiringSoon ? `Hết hạn sau ${daysLeft} ngày` : `Hết hạn ${expiresAt.toLocaleDateString("vi-VN")}`}
      </div>
    </div>
  )
}

function NearbyCafeCard({ cafe }: { cafe: Cafe }) {
  const cheapest = cafe.availableVehicles.length > 0
    ? Math.min(...cafe.availableVehicles.map((v) => v.pricePerHour))
    : 0

  return (
    <Link
      to={`/cafes/${cafe.slug ?? cafe.id}`}
      className="group flex-shrink-0 w-48 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-slate-100">
        <img
          src={cafe.image}
          alt={cafe.name}
          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
        />
        {cafe.rating > 0 && (
          <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm">
            ★ {cafe.rating}
          </span>
        )}
      </div>
      <div className="p-3">
        <p className="text-xs font-extrabold text-slate-800 truncate leading-snug">{cafe.name}</p>
        <p className="text-[10px] text-slate-400 truncate mt-0.5">{cafe.city}</p>
        {cheapest > 0 && (
          <p className="mt-2 text-xs font-bold text-orange-600">{formatCurrency(cheapest)}<span className="text-slate-400 font-normal">/giờ</span></p>
        )}
      </div>
    </Link>
  )
}

function SectionHeader({ title, to, linkLabel = "Xem tất cả" }: { title: string; to?: string; linkLabel?: string }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-sm font-extrabold text-slate-800 uppercase tracking-wide">{title}</h2>
      {to && (
        <Link to={to} className="flex items-center gap-1 text-xs font-semibold text-orange-500 hover:text-orange-600 transition-colors">
          {linkLabel} <ArrowRight className="h-3 w-3" />
        </Link>
      )}
    </div>
  )
}

// ── main page ─────────────────────────────────────────────────────────────────

export function CustomerHomePage() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)

  const { data: bookingsData } = useMyBookings({ limit: 3, status: undefined })
  const { data: packagesData } = useMyPackages({ status: "ACTIVE" })
  const { data: cafes = [] } = useQuery({
    queryKey: ["explore", "cafes", {}],
    queryFn: () => getCafes({}),
    staleTime: 5 * 60 * 1000,
  })

  const upcomingBookings = (bookingsData?.data ?? [])
    .filter((b) => b.status === "CONFIRMED" || b.status === "PENDING")
    .slice(0, 3)

  const activePackages = (packagesData ?? []).slice(0, 3)
  const nearbyCafes = cafes.slice(0, 8)

  const hasUpcoming = upcomingBookings.length > 0
  const hasPackages = activePackages.length > 0

  return (
    <div className="min-h-screen bg-[#f8f7f6]">
      {/* ── Hero banner ── */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-4 pb-8 pt-6 md:px-6">
        <div className="mx-auto max-w-2xl">
          <HeroGreeting name={user?.fullName ?? "bạn"} avatarUrl={user?.avatarUrl} />

          {/* Search CTA */}
          <button
            onClick={() => navigate(routePaths.cafes)}
            className="mt-5 flex w-full items-center gap-3 rounded-2xl bg-white/10 border border-white/20 px-4 py-3.5 text-sm text-white/60 hover:bg-white/15 transition-colors backdrop-blur-sm"
          >
            <MapPin className="h-4 w-4 text-orange-400 shrink-0" />
            <span>Tìm sân RC gần bạn...</span>
            <span className="ml-auto flex items-center gap-1.5 rounded-xl bg-orange-500 px-3 py-1.5 text-xs font-bold text-white">
              <Zap className="h-3 w-3" /> Tìm ngay
            </span>
          </button>

          {/* Upcoming booking highlight */}
          {hasUpcoming && (
            <Link
              to={`/booking/${upcomingBookings[0].id}`}
              className="mt-3 flex items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 hover:bg-emerald-500/15 transition-colors"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20">
                <CalendarCheck className="h-4 w-4 text-emerald-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">Lịch sắp tới</p>
                <p className="text-sm font-bold text-white truncate">
                  {new Date(upcomingBookings[0].slotStart).toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit" })}
                  {" · "}
                  {new Date(upcomingBookings[0].slotStart).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", hour12: false })}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-emerald-400" />
            </Link>
          )}

          {/* PENDING payment alert */}
          {upcomingBookings.some((b) => b.status === "PENDING") && (
            <div className="mt-2 flex items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5">
              <CreditCard className="h-4 w-4 shrink-0 text-amber-400" />
              <p className="text-xs font-semibold text-amber-300 flex-1">
                Bạn có đơn đang chờ thanh toán
              </p>
              <Link to={routePaths.customerBookings} className="text-[10px] font-bold text-amber-400 underline underline-offset-2">
                Thanh toán
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="mx-auto max-w-2xl space-y-6 px-4 py-6 md:px-6">

        <ReviewReminderBanner />

        {/* Quick actions */}
        <QuickActions />

        {/* Active packages */}
        {hasPackages && (
          <section>
            <SectionHeader title="Gói hội viên đang dùng" to={routePaths.customerPackages} />
            <div className="grid gap-3 sm:grid-cols-2">
              {activePackages.map((pkg) => (
                <ActivePackageCard key={pkg.id} pkg={pkg} />
              ))}
            </div>
          </section>
        )}

        {/* Upcoming bookings */}
        {hasUpcoming ? (
          <section>
            <SectionHeader title="Lịch đặt của bạn" to={routePaths.customerBookings} />
            <div className="space-y-2.5">
              {upcomingBookings.map((b) => (
                <UpcomingBookingCard key={b.id} booking={b} />
              ))}
            </div>
          </section>
        ) : (
          <section>
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-50">
                <CalendarCheck className="h-7 w-7 text-orange-400" />
              </div>
              <h3 className="text-sm font-extrabold text-slate-800">Chưa có lịch đặt sân</h3>
              <p className="mt-1 text-xs text-slate-400">Tìm sân RC gần bạn và đặt lịch ngay hôm nay</p>
              <Button
                onClick={() => navigate(routePaths.cafes)}
                className="mt-4 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl h-9 text-xs px-5"
              >
                Khám phá sân RC <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            </div>
          </section>
        )}

        {/* Nearby cafes */}
        {nearbyCafes.length > 0 && (
          <section>
            <SectionHeader title="Sân RC nổi bật" to={routePaths.cafes} />
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 md:-mx-6 md:px-6 scrollbar-none">
              {nearbyCafes.map((cafe) => (
                <NearbyCafeCard key={cafe.id} cafe={cafe} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
