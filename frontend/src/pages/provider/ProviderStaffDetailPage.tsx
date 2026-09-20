import { useState, useEffect, useMemo } from "react"
import { useParams, useNavigate } from "react-router"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeft, Mail, MapPin, Phone, CheckCircle2, Clock, Utensils, AlertCircle, Loader2, ChevronDown, Smartphone, UserCog, LogOut } from "lucide-react"
import { toast } from "sonner"

import { ProviderShell } from "@/pages/provider/components/ProviderShell"
import { cn } from "@/shared/lib/utils"
import { Button } from "@/shared/ui/button"
import {
  staffApi,
  staffQueryKeys,
  type StaffActivityEvent,
} from "@/features/staff/api/staff.api"
import { routePaths } from "@/app/router/route-paths"

type Period = "7d" | "30d" | "90d"

const PERIODS: { value: Period; label: string }[] = [
  { value: "7d", label: "7 ngày" },
  { value: "30d", label: "30 ngày" },
  { value: "90d", label: "90 ngày" },
]

const STATUS_LABELS = {
  ACTIVE: "Đã kích hoạt",
  PENDING: "Chờ kích hoạt",
  DISABLED: "Vô hiệu hóa",
}

const STATUS_STYLES = {
  ACTIVE: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  PENDING: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  DISABLED: "bg-[#ebe7e7] text-[#747878] ring-1 ring-[#c4c7c8]",
}

function isOnline(lastActiveAt: string | null): boolean {
  if (!lastActiveAt) return false
  return Date.now() - new Date(lastActiveAt).getTime() < 10 * 60 * 1000
}

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" })
}

function formatEventTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" }) +
    " " + d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })
}

function formatKpiNumber(n: number): string {
  if (n >= 10000) return (n / 1000).toFixed(1) + "K"
  return n.toString()
}

function KpiCardSkeleton() {
  return (
    <div className="rounded-xl border border-[#c4c7c8] bg-white p-5">
      <div className="mb-1 h-3 w-20 animate-pulse rounded bg-[#ebe7e7]" />
      <div className="h-8 w-16 animate-pulse rounded bg-[#ebe7e7]" />
    </div>
  )
}

function ActivityIcon({ type }: { type: StaffActivityEvent["type"] }) {
  if (type === "CHECK_IN") return <CheckCircle2 className="size-4 text-emerald-500" />
  if (type === "CHECK_OUT") return <LogOut className="size-4 text-[#747878]" />
  if (type === "FNB_ORDER") return <Utensils className="size-4 text-orange-500" />
  return <Clock className="size-4 text-[#5b9bd5]" />
}

type BookingGroup = {
  bookingId: string
  bookingLabel: string
  bookingSource: "APP" | "STAFF_MANUAL"
  latestTime: string
  checkInTime: string | null
  subEvents: StaffActivityEvent[]
}

function groupByBooking(events: StaffActivityEvent[]): BookingGroup[] {
  const map = new Map<string, BookingGroup>()
  for (const e of events) {
    let g = map.get(e.bookingId)
    if (!g) {
      g = {
        bookingId: e.bookingId,
        bookingLabel: "Booking #" + e.bookingId.slice(0, 6).toUpperCase(),
        bookingSource: e.bookingSource,
        latestTime: e.eventTime,
        checkInTime: null,
        subEvents: [],
      }
      map.set(e.bookingId, g)
    }
    if (e.eventTime > g.latestTime) g.latestTime = e.eventTime
    if (e.type === "CHECK_IN") {
      g.checkInTime = e.eventTime
    } else {
      // CHECK_OUT, FNB_ORDER, EXTENSION_APPROVED all go to sub-events
      g.subEvents.push(e)
    }
  }
  return Array.from(map.values())
    .sort((a, b) => b.latestTime.localeCompare(a.latestTime))
    .map((g) => ({ ...g, subEvents: [...g.subEvents].sort((a, b) => a.eventTime.localeCompare(b.eventTime)) }))
}

export function ProviderStaffDetailPage() {
  const { staffId } = useParams<{ staffId: string }>()
  const navigate = useNavigate()
  const [period, setPeriod] = useState<Period>("30d")
  const [activityOffset, setActivityOffset] = useState(0)
  const [allEvents, setAllEvents] = useState<StaffActivityEvent[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  const {
    data: profile,
    isLoading: profileLoading,
    isError: profileError,
  } = useQuery({
    queryKey: staffQueryKeys.staffDetail(staffId!),
    queryFn: () => staffApi.getStaffDetail(staffId!),
    enabled: !!staffId,
    retry: false,
  })

  useEffect(() => {
    if (profileError) {
      toast.error("Không có quyền xem nhân viên này.")
      navigate(routePaths.providerStaff)
    }
  }, [profileError, navigate])

  const { data: kpi, isLoading: kpiLoading } = useQuery({
    queryKey: staffQueryKeys.staffKpi(staffId!, period),
    queryFn: () => staffApi.getStaffKpi(staffId!, period),
    enabled: !!staffId && !profileError,
  })

  const { isLoading: activityLoading } = useQuery({
    queryKey: [...staffQueryKeys.staffActivity(staffId!), 0],
    queryFn: async () => {
      const result = await staffApi.getStaffActivity(staffId!, 20, 0)
      setAllEvents(result.events)
      setHasMore(result.hasMore)
      setActivityOffset(20)
      return result
    },
    enabled: !!staffId && !profileError,
  })

  const loadMore = async () => {
    if (!staffId || loadingMore) return
    setLoadingMore(true)
    try {
      const result = await staffApi.getStaffActivity(staffId, 20, activityOffset)
      setAllEvents((prev) => [...prev, ...result.events])
      setHasMore(result.hasMore)
      setActivityOffset((prev) => prev + result.events.length)
    } catch {
      toast.error("Không thể tải thêm hoạt động.")
    } finally {
      setLoadingMore(false)
    }
  }

  const bookingGroups = useMemo(() => groupByBooking(allEvents), [allEvents])

  if (profileError) return null

  return (
    <ProviderShell>
      {/* Back button */}
      <button
        className="mb-6 flex items-center gap-2 text-sm font-medium text-[#747878] hover:text-[#1c1b1b]"
        onClick={() => navigate(routePaths.providerStaff)}
      >
        <ArrowLeft className="size-4" />
        Quay lại danh sách nhân viên
      </button>

      {profileLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-6 animate-spin text-[#747878]" />
        </div>
      ) : profile ? (
        <>
          {/* Profile Header */}
          <div className="mb-8 flex items-start gap-4 rounded-xl border border-[#c4c7c8] bg-[#fcf8f8] p-6">
            <div className="relative shrink-0">
              <div className={cn(
                "flex size-14 items-center justify-center rounded-full text-xl font-bold",
                profile.status === "ACTIVE" ? "bg-orange-100 text-orange-700" : "bg-[#ebe7e7] text-[#747878]",
              )}>
                {profile.fullName.charAt(0).toUpperCase()}
              </div>
              {profile.status === "ACTIVE" && isOnline(profile.lastActiveAt) && (
                <span className="absolute bottom-0 right-0 size-3.5 rounded-full border-2 border-[#fcf8f8] bg-emerald-500" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold text-[#1c1b1b]">{profile.fullName}</h1>
                <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold", STATUS_STYLES[profile.status])}>
                  <span className={cn("size-1.5 rounded-full", {
                    "bg-emerald-500": profile.status === "ACTIVE",
                    "bg-amber-400": profile.status === "PENDING",
                    "bg-[#c4c7c8]": profile.status === "DISABLED",
                  })} />
                  {STATUS_LABELS[profile.status]}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                <div className="flex items-center gap-2 text-sm text-[#5d5f5f]">
                  <Mail className="size-3.5 shrink-0 text-[#c4c7c8]" />
                  <span className="truncate">{profile.email}</span>
                </div>
                {profile.phone && (
                  <div className="flex items-center gap-2 text-sm text-[#5d5f5f]">
                    <Phone className="size-3.5 shrink-0 text-[#c4c7c8]" />
                    <span>{profile.phone}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm text-[#5d5f5f]">
                  <MapPin className="size-3.5 shrink-0 text-[#c4c7c8]" />
                  <span>{profile.cafeName}</span>
                </div>
                <div className="text-xs text-[#747878]">
                  Tham gia: {formatDate(profile.activatedAt ?? profile.createdAt)}
                </div>
              </div>
            </div>
          </div>

          {/* Period Selector */}
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-bold text-[#1c1b1b]">Chỉ số hiệu suất</h2>
            <div className="flex rounded-lg border border-[#c4c7c8] bg-white p-0.5">
              {PERIODS.map((p) => (
                <button
                  key={p.value}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                    period === p.value
                      ? "bg-[#1c1b1b] text-white"
                      : "text-[#747878] hover:text-[#1c1b1b]",
                  )}
                  onClick={() => setPeriod(p.value)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* KPI Cards */}
          <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {kpiLoading ? (
              Array.from({ length: 5 }).map((_, i) => <KpiCardSkeleton key={i} />)
            ) : kpi ? (
              <>
                <div className="rounded-xl border border-[#c4c7c8] bg-white p-5">
                  <p className="mb-1 text-xs font-medium text-[#747878]">Lượt check-in đã làm</p>
                  <p className="text-2xl font-bold text-[#1c1b1b]">{formatKpiNumber(kpi.totalCheckIns)}</p>
                </div>
                <div className="rounded-xl border border-[#c4c7c8] bg-white p-5">
                  <p className="mb-1 text-xs font-medium text-[#747878]">FnB đã giao</p>
                  <p className="text-2xl font-bold text-[#1c1b1b]">{formatKpiNumber(kpi.totalFnbOrdersHandled)}</p>
                </div>
                <div className="rounded-xl border border-[#c4c7c8] bg-white p-5">
                  <p className="mb-1 text-xs font-medium text-[#747878]">Gia hạn đã duyệt</p>
                  <p className="text-2xl font-bold text-[#1c1b1b]">{formatKpiNumber(kpi.totalExtensionsApproved)}</p>
                </div>
                <div className="rounded-xl border border-[#c4c7c8] bg-white p-5">
                  <p className="mb-1 text-xs font-medium text-[#747878]">Check-in đúng giờ</p>
                  <p className="text-2xl font-bold text-[#1c1b1b]">
                    {kpi.onTimeCheckInRate != null ? `${kpi.onTimeCheckInRate}%` : "—"}
                  </p>
                </div>
                <div className="rounded-xl border border-[#c4c7c8] bg-white p-5">
                  <p className="mb-1 text-xs font-medium text-[#747878]">Ngày hoạt động</p>
                  <p className="text-2xl font-bold text-[#1c1b1b]">{kpi.activeDaysCount}</p>
                </div>
              </>
            ) : null}
          </div>

          {/* Activity Timeline */}
          <div>
            <h2 className="mb-4 text-base font-bold text-[#1c1b1b]">Lịch sử hoạt động</h2>

            {activityLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="size-5 animate-spin text-[#747878]" />
              </div>
            ) : bookingGroups.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-12 text-center">
                <Clock className="size-8 text-[#c4c7c8]" />
                <p className="text-sm font-medium text-[#1c1b1b]">Chưa có hoạt động nào</p>
                <p className="text-xs text-[#747878]">Các sự kiện check-in, FnB và gia hạn sẽ hiển thị tại đây.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {bookingGroups.map((group) => (
                  <div
                    key={group.bookingId}
                    className="overflow-hidden rounded-xl border border-[#e5e2e1] bg-white"
                  >
                    {/* Booking header row */}
                    <div className="flex items-center gap-3 px-4 py-3">
                      <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
                      <span className="text-sm font-semibold text-[#1c1b1b]">{group.bookingLabel}</span>
                      {group.bookingSource === "APP" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-600 ring-1 ring-blue-200">
                          <Smartphone className="size-2.5" />
                          Online
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#ebe7e7] px-2 py-0.5 text-[10px] font-semibold text-[#747878] ring-1 ring-[#c4c7c8]">
                          <UserCog className="size-2.5" />
                          Thủ công
                        </span>
                      )}
                      <span className="ml-auto text-xs tabular-nums text-[#747878]">
                        {formatEventTime(group.checkInTime ?? group.latestTime)}
                      </span>
                    </div>
                    {/* Sub-events */}
                    {group.subEvents.length > 0 && (
                      <div className="border-t border-[#f0eded]">
                        {group.subEvents.map((e) => (
                          <div
                            key={`${e.type}-${e.id}`}
                            className="flex items-center gap-3 border-t border-[#f0eded] px-4 py-2.5 first:border-t-0"
                          >
                            <span className="ml-1 size-4 shrink-0" />
                            <ActivityIcon type={e.type} />
                            <span className="flex-1 text-xs text-[#5d5f5f]">{e.label}</span>
                            <span className="text-xs tabular-nums text-[#c4c7c8]">{formatEventTime(e.eventTime)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}

                {hasMore && (
                  <div className="pt-2 text-center">
                    <Button
                      variant="outline"
                      className="h-9 gap-2 border-[#c4c7c8] text-sm text-[#444748] hover:bg-[#f6f3f2]"
                      disabled={loadingMore}
                      onClick={loadMore}
                    >
                      {loadingMore ? <Loader2 className="size-4 animate-spin" /> : <ChevronDown className="size-4" />}
                      Tải thêm
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle className="size-4 shrink-0" />
          Không tìm thấy nhân viên.
        </div>
      )}
    </ProviderShell>
  )
}
