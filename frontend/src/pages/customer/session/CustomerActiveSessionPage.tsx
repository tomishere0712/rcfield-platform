import { useState, useEffect, useCallback } from "react"
import { useParams, useNavigate, Link } from "react-router"
import { type MockSessionDetail } from "@/shared/data/customer-operational-mock-data"
import { customerSessionApi } from "@/features/customer-session/api/customer-session.api"
import {
  Clock,
  Car,
  Coffee,
  ArrowLeft,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  Sparkles,
} from "lucide-react"
import { Button } from "@/shared/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card"
import { Badge } from "@/shared/ui/badge"
import { getSessionOperationalTiming } from "@/features/booking/lib/session-operational-timing"

const PART_TYPE_LABELS: Record<string, string> = {
  TIRE_WHEEL: "Bánh xe / Lốp",
  SPOILER: "Cánh gió",
  CHASSIS: "Khung gầm",
  MOTOR: "Motor / Động cơ",
  SHELL: "Vỏ nhựa (Shell)",
  SERVO: "Servo / Tay lái",
  REMOTE: "Remote / Điều khiển",
  OTHER: "Khác",
}

export function CustomerActiveSessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()

  const [session, setSession] = useState<MockSessionDetail | null>(null)
  const [bookingId, setBookingId] = useState<string>("")
  const [secondsLeft, setSecondsLeft] = useState<number>(0)
  const [totalDuration, setTotalDuration] = useState<number>(1) // For percentage calculation
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [loadError, setLoadError] = useState<string>("")
  const [currentTime, setCurrentTime] = useState(() => Date.now())

  const loadSession = useCallback(
    async (silent = false) => {
      if (!sessionId) {
        setIsLoading(false)
        return
      }
      if (!silent) setIsLoading(true)
      setLoadError("")
      try {
        const detail = await customerSessionApi.getSessionDetail(sessionId)
        setSession(detail)
        setBookingId(detail.bookingId)

        if (detail.status === "ACTIVE" || detail.status === "EXTENDING") {
          const plannedTime = new Date(detail.plannedEnd).getTime()
          const actualStart = detail.actualStart
            ? new Date(detail.actualStart).getTime()
            : Date.now()
          const now = Date.now()

          setSecondsLeft(Math.max(0, Math.floor((plannedTime - now) / 1000)))
          setTotalDuration(
            Math.max(1, Math.floor((plannedTime - actualStart) / 1000)),
          )
        } else {
          setSecondsLeft(0)
          setTotalDuration(1)
        }
      } catch (err) {
        const message =
          err && typeof err === "object" && "response" in err
            ? (err as { response?: { data?: { message?: string } } }).response
                ?.data?.message
            : undefined
        setLoadError(message ?? "Không thể tải phiên chơi.")
        setSession(null)
        setBookingId("")
      } finally {
        if (!silent) setIsLoading(false)
      }
    },
    [sessionId],
  )

  useEffect(() => {
    queueMicrotask(() => {
      void loadSession()
    })
  }, [loadSession])

  useEffect(() => {
    const handleRefresh = () => {
      void loadSession(true)
    }
    window.addEventListener("refresh-session-detail", handleRefresh)
    return () =>
      window.removeEventListener("refresh-session-detail", handleRefresh)
  }, [loadSession])

  // Count down clock simulation
  useEffect(() => {
    if (secondsLeft <= 0) return
    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [secondsLeft])

  useEffect(() => {
    if (!session || !["ACTIVE", "EXTENDING"].includes(session.status)) return
    const interval = window.setInterval(() => setCurrentTime(Date.now()), 30_000)
    return () => window.clearInterval(interval)
  }, [session])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <Card className="max-w-md w-full text-center p-8 space-y-4">
          <Clock className="h-12 w-12 text-orange-500 mx-auto animate-pulse" />
          <h2 className="text-xl font-bold text-slate-900">
            Đang tải phiên chơi
          </h2>
          <p className="text-sm text-slate-500">
            Hệ thống đang lấy trạng thái phiên mới nhất.
          </p>
        </Card>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <Card className="max-w-md w-full text-center p-8 space-y-4">
          <AlertTriangle className="h-12 w-12 text-red-500 mx-auto" />
          <h2 className="text-xl font-bold text-slate-900">
            Không tìm thấy phiên chơi
          </h2>
          <p className="text-sm text-slate-500">
            {loadError ||
              `Mã phiên chơi ${sessionId} không hợp lệ hoặc đã kết thúc hoàn tất.`}
          </p>
          <Button
            onClick={() => navigate("/customer/bookings")}
            className="w-full bg-slate-900 text-white rounded-xl"
          >
            Quay lại Lịch đặt sân
          </Button>
        </Card>
      </div>
    )
  }

  // Format countdown text helper
  const formatCountdown = (totalSecs: number) => {
    const hours = Math.floor(totalSecs / 3600)
    const mins = Math.floor((totalSecs % 3600) / 60)
    const secs = totalSecs % 60

    if (hours > 0) {
      return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
    }
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }

  // Circular progress calculation
  const percentage = Math.min(
    100,
    Math.max(0, (secondsLeft / totalDuration) * 100),
  )
  const strokeDashoffset = 283 - (283 * percentage) / 100 // 283 is circle circumference (r=45, 2 * pi * r)
  const operationalTiming = getSessionOperationalTiming(
    session.plannedEnd,
    session.status,
    currentTime,
  )
  const isByoc = Boolean(
    session.vehicles &&
      session.vehicles.length > 0 &&
      session.vehicles.every((v) => v.type === "BYOC"),
  )

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: "VND",
    }).format(val)
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-4 md:p-8 font-sans relative overflow-x-hidden">
      {/* Decorative Glows */}
      <div className="absolute top-0 right-[5%] w-[400px] h-[400px] rounded-full bg-orange-400/5 blur-[100px] pointer-events-none animate-pulse" />
      <div className="absolute bottom-[5%] left-[5%] w-[400px] h-[400px] rounded-full bg-slate-400/5 blur-[100px] pointer-events-none" />

      <div className="max-w-4xl mx-auto space-y-6 relative z-10">
        {/* Top Navigation */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate(`/customer/bookings/${bookingId}`)}
            className="inline-flex items-center gap-2 text-xs font-extrabold text-slate-500 hover:text-slate-900 transition-colors bg-white px-3.5 py-2 rounded-xl border border-slate-200 shadow-sm"
          >
            <ArrowLeft className="h-4 w-4 text-orange-500" />
            Chi tiết Đơn đặt {bookingId}
          </button>

          <span className="text-xs font-bold text-slate-400">
            Mã Phiên Chơi:{" "}
            <strong className="text-slate-800">{session.sessionId}</strong>
          </span>
        </div>

        {/* DYNAMIC FLASH ALERT NOTIFICATIONS */}
        {session.status === "EXTENDING" && session.extensionProposal && operationalTiming.state !== "OVERDUE" && (
          <div className="bg-gradient-to-r from-orange-500 to-orange-600 border border-orange-400 text-white rounded-2xl p-5 shadow-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-4 animate-bounce">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-orange-200 animate-spin" />
                <span className="text-xs font-black uppercase tracking-wider text-orange-100">
                  ĐỀ XUẤT GIA HẠN ĐANG CHỜ
                </span>
              </div>
              <h3 className="text-base font-black">
                Staff đề xuất gia hạn thêm{" "}
                {session.extensionProposal.extraMinutes} phút chơi!
              </h3>
              <p className="text-xs text-orange-100 font-semibold leading-relaxed">
                Chi phí phụ thu:{" "}
                <strong className="text-white">
                  {formatCurrency(session.extensionProposal.additionalFee)}
                </strong>
                . Xác nhận trước khi hết hạn!
              </p>
            </div>

            <Link
              to={`/customer/extension-response/${session.sessionId}`}
              className="bg-white hover:bg-slate-50 text-slate-950 text-xs font-black px-4.5 py-3 rounded-xl shadow-md transition-all flex items-center gap-1.5 shrink-0 hover:scale-102 cursor-pointer"
            >
              Xem & Phản hồi ngay
              <ArrowRight className="h-4 w-4 text-orange-500" />
            </Link>
          </div>
        )}

        {session.status === "EXTENDING" && session.extensionProposal && operationalTiming.state === "OVERDUE" && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-900 shadow-sm">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
              <div>
                <p className="text-sm font-black">Yêu cầu gia hạn không còn được xử lý</p>
                <p className="mt-1 text-xs leading-relaxed text-red-800">
                  {isByoc
                    ? "Phiên đã quá giờ và cần được nhân viên hoàn tất phiên chơi. Hệ thống không tự tính phí quá giờ theo thời điểm kết thúc."
                    : "Phiên đã quá giờ và cần được nhân viên kiểm tra, trả xe. Hệ thống không tự tính phí quá giờ theo thời điểm checkout."}
                </p>
              </div>
            </div>
          </div>
        )}

        {session.status === "CHECKING_OUT" && session.damageClaim && (
          <div className="bg-rose-50 border border-rose-200 text-rose-950 rounded-2xl p-5 shadow-md space-y-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <span className="text-xs font-black uppercase tracking-wider text-rose-600">
                  Phát hiện hư hỏng sau phiên chơi
                </span>
                <p className="text-sm font-bold text-rose-950">
                  {session.damageClaim.description}
                </p>
              </div>
            </div>

            {session.damageClaim.damageLineItems.length > 0 && (
              <div className="space-y-2">
                {session.damageClaim.damageLineItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start justify-between bg-white/70 rounded-xl border border-rose-100 px-3 py-2 text-xs"
                  >
                    <div className="space-y-0.5">
                      <p className="font-extrabold text-rose-900">
                        {PART_TYPE_LABELS[item.partType] ?? item.partType}
                        {item.customPartName && (
                          <span className="font-semibold text-rose-700">
                            {" "}
                            — {item.customPartName}
                          </span>
                        )}
                      </p>
                      <div className="flex gap-3 text-[11px] text-rose-700 font-semibold">
                        <span>
                          Linh kiện: {item.partsPrice.toLocaleString("vi-VN")}đ
                        </span>
                        {item.laborPrice > 0 && (
                          <span>
                            Công sửa: {item.laborPrice.toLocaleString("vi-VN")}đ
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="font-extrabold text-rose-700 shrink-0 pl-3">
                      {item.lineTotal.toLocaleString("vi-VN")}đ
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between rounded-xl bg-rose-100 border border-rose-200 px-4 py-2.5">
                  <span className="text-sm font-black text-rose-900">
                    Tổng phí bồi thường:
                  </span>
                  <span className="text-base font-extrabold text-rose-700">
                    {session.damageClaim.totalDamageCharge.toLocaleString(
                      "vi-VN",
                    )}
                    đ
                  </span>
                </div>
              </div>
            )}

            <p className="text-[11px] text-rose-700 font-semibold">
              Nhân viên sẽ xác nhận trực tiếp. Nếu có thắc mắc, vui lòng trao
              đổi tại quầy.
            </p>
          </div>
        )}

        {(operationalTiming.state === "DUE_FOR_CHECKOUT" || operationalTiming.state === "OVERDUE") && (
          <div className={`rounded-2xl border p-5 shadow-sm ${
            operationalTiming.state === "OVERDUE"
              ? "border-red-200 bg-red-50 text-red-950"
              : "border-amber-200 bg-amber-50 text-amber-950"
          }`}>
            <div className="flex items-start gap-3">
              <AlertTriangle className={`mt-0.5 h-5 w-5 shrink-0 ${operationalTiming.state === "OVERDUE" ? "text-red-600" : "text-amber-600"}`} />
              <div>
                <p className="text-sm font-black">
                  {operationalTiming.state === "OVERDUE"
                    ? `Phiên đã quá giờ ${operationalTiming.minutesPastPlannedEnd} phút`
                    : isByoc
                      ? "Đã hết giờ chơi"
                      : "Đã đến giờ trả xe"}
                </p>
                <p className="mt-1 text-xs font-semibold leading-relaxed opacity-80">
                  {isByoc
                    ? "Vui lòng liên hệ quầy để nhân viên hoàn tất phiên chơi cho bạn."
                    : "Vui lòng trả xe tại quầy để nhân viên kiểm tra và hoàn tất phiên. Xe vẫn được giữ trong phiên cho đến khi checkout hoàn thành."}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Live Dashboard Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
          {/* Circular Countdown Card (Col-span 1) */}
          <Card className="border-slate-200/80 shadow-md bg-white text-center p-6 flex flex-col items-center justify-center relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-orange-500 to-orange-600" />

            <div className="space-y-1 mb-6">
              <CardTitle className="text-sm font-black text-slate-950 uppercase tracking-wider flex items-center justify-center gap-1">
                <Clock className="h-4.5 w-4.5 text-orange-500" />
                Thời Gian Phiên Chơi
              </CardTitle>
              <CardDescription className="text-[10px] font-bold">
                Countdown thời gian thực tại sân
              </CardDescription>
            </div>

            {/* Circular Timer Visual */}
            <div className="relative h-48 w-48 flex items-center justify-center mb-6">
              <svg
                className="w-full h-full transform -rotate-90"
                viewBox="0 0 100 100"
              >
                <circle
                  cx="50"
                  cy="50"
                  r="45"
                  className="stroke-slate-100 fill-none"
                  strokeWidth="6"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="45"
                  className="stroke-orange-500 fill-none transition-all duration-1000 ease-linear"
                  strokeWidth="6"
                  strokeDasharray="283"
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                />
              </svg>

              {/* Inner details */}
              <div className="absolute flex flex-col items-center justify-center space-y-1">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">
                  {operationalTiming.state === "ON_TIME"
                    ? "CÒN LẠI"
                    : operationalTiming.state === "OVERDUE"
                      ? "QUÁ GIỜ"
                      : isByoc
                        ? "HẾT GIỜ"
                        : "ĐẾN GIỜ TRẢ XE"}
                </span>
                <span className="text-3xl font-black text-slate-950 tracking-tight leading-none">
                  {operationalTiming.state === "ON_TIME"
                    ? formatCountdown(secondsLeft)
                    : operationalTiming.state === "OVERDUE"
                      ? `+${operationalTiming.minutesPastPlannedEnd}p`
                      : isByoc
                        ? "Hết ca"
                        : "Trả xe"}
                </span>
                <span className={`inline-flex items-center gap-1 text-[9px] font-black leading-none ${operationalTiming.state === "OVERDUE" ? "text-red-600" : operationalTiming.state === "DUE_FOR_CHECKOUT" ? "text-amber-600" : "text-emerald-500"}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${operationalTiming.state === "OVERDUE" ? "bg-red-500" : operationalTiming.state === "DUE_FOR_CHECKOUT" ? "bg-amber-500" : "bg-emerald-500 animate-ping"}`} />
                  {operationalTiming.state === "ON_TIME"
                    ? "ĐANG CHƠI"
                    : isByoc
                      ? operationalTiming.state === "OVERDUE"
                        ? "QUÁ GIỜ"
                        : "HẾT GIỜ CHƠI"
                      : "CHỜ TRẢ XE"}
                </span>
              </div>
            </div>

            {/* Time stamps */}
            <div className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl grid grid-cols-2 gap-1 text-xs font-semibold text-slate-700">
              <div className="border-r border-slate-200">
                <span className="block text-[9px] text-slate-400 uppercase font-black">
                  Giờ bắt đầu
                </span>
                <span className="text-slate-900 mt-0.5 block">
                  {session.actualStart
                    ? new Date(session.actualStart).toLocaleTimeString(
                        "vi-VN",
                        { hour: "2-digit", minute: "2-digit" },
                      )
                    : "--:--"}
                </span>
              </div>
              <div>
                <span className="block text-[9px] text-slate-400 uppercase font-black">
                  Giờ dự kiến hết
                </span>
                <span className="text-slate-900 mt-0.5 block">
                  {new Date(session.plannedEnd).toLocaleTimeString("vi-VN", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            </div>
          </Card>

          {/* Allocation Details & F&B (Col-span 2) */}
          <div className="md:col-span-2 space-y-6">
            {/* Assigned Vehicles */}
            <Card className="border-slate-200/80 shadow-sm bg-white">
              <CardHeader className="pb-3 border-b border-slate-100">
                <CardTitle className="text-sm font-black text-slate-950 uppercase tracking-wider flex items-center gap-2">
                  <Car className="h-4.5 w-4.5 text-orange-500" />
                  Thiết Bị Xe Đang Chơi
                </CardTitle>
                <CardDescription className="text-xs">
                  Xe đang hoạt động và hồ sơ Serious Inspection check-in đính
                  kèm.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6">
                <div className="space-y-4">
                  {session.vehicles.map((v) => (
                    <div
                      key={v.vehicleId}
                      className="flex flex-col sm:flex-row items-center gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200/60 shadow-2xs"
                    >
                      {v.imageUrl && (
                        <div className="h-20 w-32 rounded-xl overflow-hidden border border-slate-200 bg-slate-950 shrink-0">
                          <img
                            src={v.imageUrl}
                            alt={v.name}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}
                      <div className="space-y-1.5 text-center sm:text-left flex-1">
                        <div className="flex flex-wrap items-center justify-center sm:justify-start gap-1.5">
                          <h4 className="text-sm font-black text-slate-950">
                            {v.name}
                          </h4>
                          <Badge
                            className={`text-[9px] px-1.5 py-0 border-none font-extrabold ${v.type === "RENT" ? "bg-orange-100 text-orange-800" : "bg-blue-100 text-blue-800"}`}
                          >
                            {v.type === "RENT" ? "Xe Thuê" : "Xe tự mang"}
                          </Badge>
                        </div>
                        <p className="text-[10px] text-slate-400 font-bold">
                          MÃ THIẾT BỊ: {v.vehicleId}
                        </p>

                        {/* Inspection status check */}
                        <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-bold pt-1 justify-center sm:justify-start">
                          <ShieldCheck className="h-4 w-4 text-emerald-500" />
                          Đã vượt qua Serious Inspection Check-in
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* F&B Live Orders */}
            <Card className="border-slate-200/80 shadow-sm bg-white">
              <CardHeader className="pb-3 border-b border-slate-100">
                <CardTitle className="text-sm font-black text-slate-950 uppercase tracking-wider flex items-center gap-2">
                  <Coffee className="h-4.5 w-4.5 text-orange-500" />
                  Đồ ăn & thức uống tại quầy
                </CardTitle>
                <CardDescription className="text-xs">
                  Danh sách món ăn đặt trực tiếp trong phiên chơi của bạn.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6">
                {session.fnbOrders && session.fnbOrders.length > 0 ? (
                  <div className="space-y-4">
                    {(
                      session.fnbOrders as Array<{
                        orderId: string
                        orderType?: string
                        status?: string
                        items: { name: string; variantName?: string | null; qty: number; price: number; notes?: string | null }[]
                        total: number
                      }>
                    ).map((order) => {
                      const isPreorder = order.orderType === "PRE_ORDER"
                      const statusLabel =
                        order.status === "DELIVERED"
                          ? "Đã phục vụ"
                          : order.status === "CONFIRMED"
                            ? "Đang chuẩn bị"
                            : "Chờ xác nhận"
                      const statusClass =
                        order.status === "DELIVERED"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-amber-100 text-amber-700"
                      return (
                        <div
                          key={order.orderId}
                          className="bg-slate-50 p-4 rounded-xl border border-slate-200/60 text-xs font-semibold text-slate-700"
                        >
                          <div className="flex justify-between border-b border-slate-200 pb-2 mb-2 font-black text-slate-900">
                            <span className="flex items-center gap-1.5">
                              {isPreorder ? (
                                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[9px] font-bold text-blue-600 border border-blue-100">
                                  Đặt trước
                                </span>
                              ) : (
                                <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[9px] font-bold text-orange-600 border border-orange-100">
                                  Tại quầy
                                </span>
                              )}
                            </span>
                            <Badge
                              className={`${statusClass} font-bold text-[9px] border-none`}
                            >
                              {statusLabel}
                            </Badge>
                          </div>

                          <div className="space-y-1.5">
                            {order.items.map((item, idx) => (
                              <div key={idx} className="flex justify-between">
                                <span className="text-slate-500">
                                  {item.name}{item.variantName ? ` · ${item.variantName}` : ""}{" "}
                                  <strong className="text-slate-800">
                                    ×{item.qty}
                                  </strong>
                                  {item.notes && <span className="block mt-0.5 text-[10px] text-orange-700">Ghi chú: {item.notes}</span>}
                                </span>
                                <span className="text-slate-800">
                                  {formatCurrency(item.price * item.qty)}
                                </span>
                              </div>
                            ))}
                          </div>

                          <div className="h-px bg-slate-200 my-2" />
                          <div className="flex justify-between font-black text-slate-950">
                            <span>Tổng</span>
                            <span>{formatCurrency(order.total)}</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="text-center py-6 border border-dashed border-slate-200 rounded-xl space-y-1 text-xs">
                    <Coffee className="h-8 w-8 text-slate-300 mx-auto" />
                    <p className="font-extrabold text-slate-900">
                      Chưa có đơn đồ ăn & thức uống
                    </p>
                    <p className="text-[10px] text-slate-400 font-medium">
                      Bạn có thể đặt món trực tiếp tại sân chơi bằng cách liên
                      hệ với Staff.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
