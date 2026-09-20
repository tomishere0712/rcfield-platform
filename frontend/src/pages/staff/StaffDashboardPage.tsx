import React, { useState, useEffect } from "react"
import { useNavigate } from "react-router"
import { useQuery } from "@tanstack/react-query"
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from "recharts"
import {
  Play,
  ClipboardList,
  QrCode,
  Coffee,
  Car,
  ArrowRight,
  Camera,
} from "lucide-react"
import { useStaffOperations } from "./context/StaffOperationContext"
import { staffApi, staffQueryKeys } from "@/features/staff/api/staff.api"
import { cafeApi } from "@/features/cafes/api/cafe.api"
import type { BackendCafe } from "@/features/cafes/types"
import { toast } from "sonner"
import { cn } from "@/shared/lib/utils"
import {
  StaffHeader,
  StaffCard,
  StaffBadge,
  StaffButton,
  StaffStatCard,
} from "./components/StaffUI"
import { StaffPendingTransfersCard } from "./components/StaffPendingTransfersCard"
import { StaffCameraQrScannerModal } from "@/features/staff/components/StaffCameraQrScannerModal"

export default function StaffDashboardPage() {
  const navigate = useNavigate()
  const {
    assignedCafeId,
    bookings,
    sessions,
    startCheckIn,
  } = useStaffOperations()

  const [activeCafe, setActiveCafe] = useState<BackendCafe | null>(null)
  const [scanCode, setScanCode] = useState("")
  const [isCameraScannerOpen, setIsCameraScannerOpen] = useState(false)

  const { data: todayBookings = [] } = useQuery({
    queryKey: staffQueryKeys.todayBookings(),
    queryFn: staffApi.getTodayBookings,
    refetchInterval: 60_000,
  })

  const { data: fnbOrdersReal = [] } = useQuery({
    queryKey: staffQueryKeys.fnbOrders(),
    queryFn: staffApi.getFnbOrders,
    refetchInterval: 30_000,
  })

  // Load active cafe details
  useEffect(() => {
    if (assignedCafeId) {
      cafeApi
        .getCafe(assignedCafeId)
        .then((data) => {
          setActiveCafe(data)
        })
        .catch((err) => {
          console.error("Error loading cafe details:", err)
          toast.error("Không thể tải thông tin chi nhánh chi tiết.")
        })
    } else {
      queueMicrotask(() => setActiveCafe(null))
    }
  }, [assignedCafeId])

  const processBookingCheckIn = async (rawCode: string) => {
    const trimmed = rawCode.trim().toUpperCase()
    if (!trimmed) return

    setScanCode(rawCode.trim())

    const match = bookings.find(
      (b) => b.shortCode.toUpperCase() === trimmed || b.bookingId === rawCode.trim()
    )

    if (!match) {
      toast.error(`Mã đặt lịch "${rawCode}" không tồn tại trong hôm nay!`)
      return
    }

    if (match.status === "CANCELLED") {
      toast.error("Đơn đặt lịch này đã bị hủy!")
      return
    }

    if (match.status === "COMPLETED") {
      toast.error("Đơn đặt lịch này đã hoàn thành trước đó!")
      return
    }

    if (match.status === "NO_SHOW") {
      toast.error("Đơn đặt lịch này đã bị đánh dấu vắng mặt (No-Show)!")
      return
    }

    if (match.sessions && match.sessions.length > 0) {
      const activeSession = match.sessions[0]
      toast.info(`Đơn đặt lịch này đã nhận xe. Đang chuyển đến phiên chạy ${activeSession.sessionId}...`)
      navigate(`/staff/sessions/${activeSession.sessionId}`)
      return
    }

    const startedSession = await startCheckIn(match.bookingId)
    const newSessionId = startedSession?.sessionId ?? startedSession?.id
    if (newSessionId) {
      toast.success(`Quét mã QR ${match.shortCode} thành công!`)
      navigate(`/staff/sessions/${newSessionId}`)
    }
  }

  const handleQRSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!scanCode.trim()) return
    await processBookingCheckIn(scanCode)
  }

  // 1. Unassigned cafe guard fallback (layout guard handles most, but safe fallback here)
  if (!assignedCafeId) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-center p-4">
        <StaffCard className="max-w-md w-full p-8 text-center" variant="warning">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-[#fff3eb] text-[#ea580c]">
            <QrCode className="size-7" />
          </div>
          <h2 className="text-xl font-bold text-[#1c1b1b] mb-2">Chưa được phân công</h2>
          <p className="text-sm text-[#6b7280] mb-6">
            Tài khoản nhân viên của bạn chưa có lịch phân công hoặc liên kết chi nhánh.
            Vui lòng liên hệ với quản lý chi nhánh của bạn.
          </p>
        </StaffCard>
      </div>
    )
  }

  const activeSessions = sessions.filter((s) => s.status === "ACTIVE" || s.status === "EXTENDING")
  const pendingInspections = sessions.filter((s) => s.status === "CHECKED_IN" || s.status === "CHECKING_OUT")
  const activeFnbCount = fnbOrdersReal.filter((o) => o.status === "PENDING" || o.status === "CONFIRMED").length

  // Thống kê Booking theo trạng thái cho biểu đồ
  const bookingStatusCounts = todayBookings.reduce((acc: Record<string, number>, b) => {
    acc[b.status] = (acc[b.status] || 0) + 1
    return acc
  }, {})

  const bookingChartData = [
    { name: "Chờ thanh toán", value: bookingStatusCounts["PENDING"] || 0, color: "#f59e0b" },
    { name: "Đã xác nhận", value: bookingStatusCounts["CONFIRMED"] || 0, color: "#3b82f6" },
    { name: "Hoàn thành", value: bookingStatusCounts["COMPLETED"] || 0, color: "#10b981" },
    { name: "Đã hủy", value: bookingStatusCounts["CANCELLED"] || 0, color: "#ef4444" },
    { name: "Vắng mặt", value: bookingStatusCounts["NO_SHOW"] || 0, color: "#6b7280" },
  ].filter((item) => item.value > 0)

  // Thống kê đơn F&B cho biểu đồ Donut
  const fnbStatusCounts = fnbOrdersReal.reduce((acc: Record<string, number>, o) => {
    acc[o.status] = (acc[o.status] || 0) + 1
    return acc
  }, {})

  const fnbChartData = [
    { name: "Chờ xử lý", value: fnbStatusCounts["PENDING"] || 0, color: "#f59e0b" },
    { name: "Đã xác nhận", value: fnbStatusCounts["CONFIRMED"] || 0, color: "#3b82f6" },
    { name: "Đã phục vụ", value: fnbStatusCounts["DELIVERED"] || 0, color: "#10b981" },
  ].filter((item) => item.value > 0)

  return (
    <div className="space-y-6">
      {/* 1. Header Area */}
      <StaffHeader
        title="Trực Ca Chi Nhánh"
        subtitle="Quản lý phiên chạy xe, đồ ăn thức uống và an toàn đường đua theo thời gian thực"
      />

      {/* 3. Metric Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StaffStatCard
          title="Đang chạy"
          value={activeSessions.length}
          description="Phiên chạy xe đang chạy"
          icon={Play}
        />
        <StaffStatCard
          title="Tổng lịch hôm nay"
          value={todayBookings.length}
          description="Đơn đặt lịch trong ngày"
          icon={ClipboardList}
        />
        <StaffStatCard
          title="Đợi kiểm xe"
          value={pendingInspections.length}
          description="Nhận xe / trả xe"
          icon={Car}
        />
        <StaffStatCard
          title="Đơn đồ ăn, thức uống chờ"
          value={activeFnbCount}
          description="Đang chế biến & phục vụ"
          icon={Coffee}
        />
      </div>

      {/* 4. Action Forms Panel */}
      <div className="grid md:grid-cols-3 gap-6">
        {/* Check-In QR Simulator / Camera Scanner */}
        <StaffCard className="md:col-span-2 space-y-4" glow>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-[#ea580c]">
              <QrCode className="size-5" />
              <h3 className="font-bold text-[#1c1b1b] text-base">Quét mã QR nhận xe</h3>
            </div>
            <button
              type="button"
              onClick={() => setIsCameraScannerOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-[#ea580c] bg-[#fff3eb] hover:bg-[#ffe5d4] rounded-lg transition-colors border border-[#ffdbca] shadow-xs cursor-pointer"
            >
              <Camera className="size-4" />
              <span>Mở Camera quét</span>
            </button>
          </div>

          <form onSubmit={handleQRSubmit} className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="Nhập mã đơn đặt lịch (ví dụ: RCF-8829)"
                value={scanCode}
                onChange={(e) => setScanCode(e.target.value)}
                className="w-full rounded-lg border border-[#e5e2e1] bg-white px-4 py-2.5 pr-11 text-sm font-semibold text-[#1c1b1b] focus:border-[#ea580c] focus:outline-none focus:ring-1 focus:ring-[#ea580c] placeholder-[#a09e9d] transition-all"
              />
              <button
                type="button"
                onClick={() => setIsCameraScannerOpen(true)}
                title="Mở camera quét mã QR"
                className="absolute right-2 top-1/2 -translate-y-1/2 flex size-7 items-center justify-center rounded-md text-[#747878] hover:bg-[#fff3eb] hover:text-[#ea580c] transition-colors cursor-pointer"
              >
                <Camera className="size-4" />
              </button>
            </div>
            <StaffButton type="submit" variant="primary">
              Nhận xe
            </StaffButton>
          </form>
          <p className="text-xs text-[#6b7280] leading-relaxed">
            Nhập mã đơn, dùng máy quét hoặc bấm <strong>Mở Camera quét</strong> để nhận diện nhanh mã QR của khách và mở giao diện bàn giao xe.
          </p>
        </StaffCard>

        {/* Walk-in Booking Shortcut */}
        <StaffCard className="flex flex-col justify-between p-6">
          <div>
            <h4 className="font-bold text-[#1c1b1b] text-base mb-1">Khách vãng lai</h4>
            <p className="text-xs text-[#6b7280] leading-relaxed">
              Tạo và ghi nhận nhanh thông tin lượt chơi, cấu hình xe chạy trực tiếp cho khách mua vé tại quầy.
            </p>
          </div>
          <StaffButton
            variant="outline"
            className="w-full mt-4 text-[#ea580c] border-orange-200 bg-[#fff3eb]/30 hover:bg-[#fff3eb]"
            onClick={() => navigate("/staff/today-bookings?tab=walkin")}
          >
            + Lập đơn chơi trực tiếp
          </StaffButton>
        </StaffCard>
      </div>

      {/* 4.5 Thống kê Hoạt động & Biểu đồ */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Biểu đồ đơn đặt lịch */}
        <StaffCard className="p-5 flex flex-col justify-between">
          <div>
            <h3 className="font-bold text-[#1c1b1b] text-base mb-1">Trạng thái đặt lịch hôm nay</h3>
            <p className="text-xs text-[#6b7280] mb-4">Biểu đồ phân bổ trạng thái đơn đặt lịch</p>
          </div>
          {bookingChartData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-xs text-[#6b7280] italic">
              Chưa có dữ liệu đặt lịch hôm nay
            </div>
          ) : (
            <div className="h-48 w-full flex items-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={bookingChartData}
                    cx="50%"
                    cy="50%"
                    outerRadius={65}
                    dataKey="value"
                    nameKey="name"
                  >
                    {bookingChartData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => [`${value} đơn`, "Số lượng"]} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </StaffCard>

        {/* Biểu đồ F&B Donut */}
        <StaffCard className="p-5 flex flex-col justify-between">
          <div>
            <h3 className="font-bold text-[#1c1b1b] text-base mb-1">Chuẩn bị món hôm nay</h3>
            <p className="text-xs text-[#6b7280] mb-4">Biểu đồ phân bổ trạng thái chuẩn bị món ăn & nước uống</p>
          </div>
          {fnbChartData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-xs text-[#6b7280] italic">
              Chưa có đơn đồ ăn, thức uống nào hôm nay
            </div>
          ) : (
            <div className="h-48 w-full flex items-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={fnbChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={65}
                    paddingAngle={3}
                    dataKey="value"
                    nameKey="name"
                  >
                    {fnbChartData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => [`${value} đơn`, "Số lượng"]} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </StaffCard>
      </div>

      {/* 5. Live Track View */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-[#1c1b1b] tracking-tight">Trạng Thái Làn Đua Thời Gian Thực</h3>
          <span className="text-[10px] text-[#6b7280] font-bold uppercase tracking-wider bg-[#f5f3f2] px-2 py-0.5 rounded border border-[#e5e2e1]">
            Live Map
          </span>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {(activeCafe?.trackTypes || []).map((t) => {
            const trackSessions = activeSessions.filter((s) => {
              const b = bookings.find((bk) => bk.bookingId === s.bookingId)
              return b?.trackType === t.code || b?.trackName?.toLowerCase().includes(t.name.toLowerCase())
            })

            const isOccupied = trackSessions.length > 0
            const activeSession = trackSessions[0]
            const matchingBooking = activeSession
              ? bookings.find((b) => b.bookingId === activeSession.bookingId)
              : null

            return (
              <StaffCard
                key={t.id}
                onClick={() => {
                  if (activeSession) {
                    navigate(`/staff/sessions/${activeSession.sessionId}`)
                  } else {
                    navigate(`/staff/today-bookings?tab=walkin&track=${encodeURIComponent(t.name)}&type=${t.code}`)
                  }
                }}
                className={cn(
                  "cursor-pointer transition-all duration-200 hover:scale-[1.01] hover:-translate-y-[2px]",
                  isOccupied
                    ? "border-emerald-200 bg-emerald-50/20 hover:border-emerald-300"
                    : "hover:border-orange-200"
                )}
              >
                <div className="flex items-center justify-between mb-4">
                  <span className="font-bold text-sm text-[#1c1b1b]">{t.name}</span>
                  <StaffBadge variant={isOccupied ? "success" : "neutral"}>
                    <span
                      className={cn(
                        "size-1.5 rounded-full mr-1.5",
                        isOccupied ? "bg-emerald-500 animate-pulse" : "bg-gray-400"
                      )}
                    />
                    {isOccupied ? "BẬN" : "SẴN SÀNG"}
                  </StaffBadge>
                </div>

                {isOccupied && activeSession && matchingBooking ? (
                  <div className="space-y-3.5">
                    <div className="flex justify-between items-start bg-white/60 p-2.5 rounded-lg border border-[#e5e2e1]/60">
                      <div>
                        <p className="text-[10px] font-semibold text-[#6b7280] uppercase">Khách hàng</p>
                        <p className="text-sm font-bold text-[#1c1b1b] mt-0.5">
                          {matchingBooking.plannedParticipants[0] || "Khách hàng"}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-semibold text-[#6b7280] uppercase">Mã số</p>
                        <p className="text-sm font-bold text-[#1c1b1b] mt-0.5">{matchingBooking.shortCode}</p>
                      </div>
                    </div>

                    <div className="flex justify-between items-center text-xs text-[#4c4a49] pt-2 border-t border-dashed border-[#e5e2e1]">
                      <span className="flex items-center gap-1.5 font-medium">
                        <Car className="size-3.5 text-[#6b7280]" />
                        {activeSession.vehicles[0]?.name || "Xe tự mang"}
                      </span>
                      <span className="flex items-center gap-1 text-[#ea580c] font-bold">
                        Chi tiết <ArrowRight className="size-3" />
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="py-6 text-center text-[#6b7280] space-y-1.5 bg-[#fcf8f8]/50 rounded-lg border border-dashed border-[#e5e2e1]">
                    <p className="text-xs font-medium">Chưa có phiên chạy hoạt động</p>
                    <p className="text-[10px] text-[#ea580c] font-bold tracking-wide uppercase">
                      + Tạo ca chạy tại quầy
                    </p>
                  </div>
                )}
              </StaffCard>
            )
          })}

          {activeCafe?.trackTypes && activeCafe.trackTypes.length === 0 && (
            <div className="col-span-full rounded-xl border border-dashed border-[#e5e2e1] bg-white p-8 text-center text-[#6b7280] text-xs font-semibold italic">
              Chi nhánh này hiện chưa được cấu hình đường đua nào.
            </div>
          )}

          {/* Khách chuyển khoản mà hệ thống không tự ghép được vào đơn sẽ nằm
              ở đây. Đặt cuối trang vì phần lớn ca trực sẽ trống, nhưng luôn
              hiển thị để nhân viên biết chỗ tìm khi khách hỏi. */}
          <div className="col-span-full">
            <StaffPendingTransfersCard cafeId={assignedCafeId ?? undefined} />
          </div>
        </div>
      </div>

      {/* Camera QR Scanner Modal */}
      <StaffCameraQrScannerModal
        isOpen={isCameraScannerOpen}
        onClose={() => setIsCameraScannerOpen(false)}
        onScanSuccess={(code) => {
          processBookingCheckIn(code)
        }}
      />
    </div>
  )
}
