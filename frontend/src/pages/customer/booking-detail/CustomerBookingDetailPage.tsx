import { useParams, useNavigate } from "react-router"
import { useQuery } from "@tanstack/react-query"
import { QRCodeSVG } from "qrcode.react"
import {
  MapPin,
  Car,
  User,
  QrCode,
  Clock,
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  HelpCircle,
  Receipt,
  Info,
  Camera,
  Loader2,
} from "lucide-react"
import { Button } from "@/shared/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/shared/ui/card"
import { Badge } from "@/shared/ui/badge"
import { bookingApi, bookingQueryKeys } from "@/features/booking/api/booking.api"
import { customerSessionApi } from "@/features/customer-session/api/customer-session.api"
import { ExtensionAuditCard } from "@/features/customer-session/components/ExtensionAuditCard"
import type { BookingResponse, PaymentComponentType } from "@/features/booking/types/booking.types"
import type { MockInspection } from "@/shared/data/customer-operational-mock-data"
import { VehicleImage } from "@/shared/ui/vehicle-image"
import { ZoomableInspectionImage } from "@/shared/components/ZoomableInspectionImage"
import { hasExpiredCheckInWindow } from "@/features/booking/lib/check-in-window"
import { cn } from "@/shared/lib/utils"

// ── Helpers ────────────────────────────────────────────────────────────────────

const fmt = (val: number) =>
  new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(val)

function sumComponents(components: BookingResponse["payment_components"], ...types: PaymentComponentType[]) {
  return components.filter((c) => types.includes(c.type)).reduce((sum, c) => sum + c.amount, 0)
}

const STATUS_CONFIG = {
  PENDING: {
    label: "Chờ thanh toán",
    color: "bg-amber-500/10 text-amber-600 border-amber-500/20",
    desc: "Đơn đặt của bạn đang chờ thanh toán trong 30 phút.",
  },
  CONFIRMED: {
    label: "Đã duyệt / Sẵn sàng",
    color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
    desc: "Lịch đặt đã duyệt thành công. Hãy đến quán đúng giờ để check-in.",
  },
  AWAITING_PAYMENT: {
    label: "Chờ thanh toán phí phát sinh",
    color: "bg-amber-500/10 text-amber-600 border-amber-500/20",
    desc: "Phiên chơi đã kết thúc. Vui lòng thanh toán khoản phí phát sinh để hoàn tất đơn.",
  },
  COMPLETED: {
    label: "Đã hoàn thành",
    color: "bg-blue-500/10 text-blue-600 border-blue-500/20",
    desc: "Phiên chơi đã kết thúc hoàn chỉnh. Cảm ơn bạn!",
  },
  CANCELLED: {
    label: "Đã hủy",
    color: "bg-red-500/10 text-red-600 border-red-500/20",
    desc: "Lịch đặt này đã bị hủy bỏ.",
  },
  NO_SHOW: {
    label: "Vắng mặt (No Show)",
    color: "bg-slate-500/10 text-slate-600 border-slate-500/20",
    desc: "Bạn đã quá hạn check-in và không có mặt.",
  },
} as const

const PLAY_MODE_LABELS: Record<string, string> = {
  RENTAL: "Thuê xe của cơ sở",
  BYOC: "Mang xe cá nhân",
}

const SESSION_STATUS_LABELS: Record<string, string> = {
  CHECKED_IN: "Đã nhận xe",
  ACTIVE: "Đang chơi",
  EXTENDING: "Đang gia hạn",
  CHECKING_OUT: "Đang trả xe",
  COMPLETED: "Đã hoàn tất",
}

const DIRECTION_LABEL: Record<string, string> = {
  FRONT: "Trước",
  BACK: "Sau",
  LEFT: "Trái",
  RIGHT: "Phải",
  TOP: "Từ trên",
  BOTTOM: "Từ dưới",
  DETAIL: "Cận cảnh",
  OTHER: "Ảnh tình trạng xe",
}

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

// ── Inspection photos card ─────────────────────────────────────────────────────

function InspectionPhotosCard({ inspection }: { inspection: MockInspection }) {
  const isCheckIn = inspection.type === "CHECK_IN"
  return (
    <Card className="border-slate-200/80 shadow-sm bg-white overflow-hidden">
      <CardHeader className="pb-3 border-b border-slate-100 bg-slate-50/50">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-black text-slate-950 uppercase tracking-wider flex items-center gap-2">
            <Camera className="h-4 w-4 text-orange-500" />
            {isCheckIn ? "Biên bản bàn giao xe (Check-in)" : "Biên bản trả xe (Check-out)"}
          </CardTitle>
          <Badge
            className={
              isCheckIn
                ? "bg-sky-100 text-sky-800 border-none font-bold text-[10px]"
                : "bg-emerald-100 text-emerald-800 border-none font-bold text-[10px]"
            }
          >
            {isCheckIn ? "Lúc nhận xe" : "Lúc trả xe"}
          </Badge>
        </div>
        <CardDescription className="text-xs">
          {isCheckIn
            ? "Tình trạng xe tại thời điểm bàn giao — nhân viên kiểm tra và chụp ảnh trước khi phiên chơi bắt đầu."
            : "Tình trạng xe sau khi phiên chơi kết thúc — làm căn cứ đối chiếu và nghiệm thu."}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        {/* Ghi chú */}
        {(inspection.staffNotes || inspection.damageDescription) && (
          <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-3 text-xs space-y-1">
            <p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-500 flex items-center gap-1">
              <Info className="h-3 w-3 text-slate-400" />
              Ghi chú của nhân viên:
            </p>
            <p className="font-semibold text-slate-800 leading-relaxed">
              {inspection.staffNotes || inspection.damageDescription}
            </p>
          </div>
        )}

        {/* Checklist */}
        {inspection.checklist && inspection.checklist.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
              Kiểm tra an toàn linh kiện:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs">
              {inspection.checklist.map((item, idx) => {
                const isOk = item.checked
                return (
                  <div
                    key={idx}
                    className={cn(
                      "flex items-center justify-between p-2 rounded-lg border bg-white text-[11px]",
                      isOk ? "border-slate-100" : "border-amber-200 bg-amber-50/50",
                    )}
                  >
                    <span className="font-semibold text-slate-800 truncate mr-2">
                      {item.label}
                    </span>
                    {isOk ? (
                      <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 shrink-0">
                        ✓ Đạt
                      </span>
                    ) : (
                      <span
                        className="text-[9px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 shrink-0"
                        title={item.notes}
                      >
                        ⚠️ {item.notes || "Có lưu ý"}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Photos */}
        <div className="space-y-1.5">
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
            Hình ảnh ghi nhận ({inspection.photos.length} ảnh):
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {inspection.photos.map((photo, idx) => (
              <div
                key={idx}
                className="rounded-xl overflow-hidden border border-slate-100 shadow-2xs group relative"
              >
                <ZoomableInspectionImage
                  src={photo.url}
                  alt={`Ảnh ${DIRECTION_LABEL[photo.direction] ?? photo.direction}`}
                  className="aspect-video w-full object-cover"
                />
                <div className="bg-slate-50 px-2.5 py-1.5">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                    {DIRECTION_LABEL[photo.direction] ?? photo.direction}
                  </p>
                  {photo.notes && (
                    <p className="text-[11px] text-slate-600 mt-0.5 leading-tight">
                      {photo.notes}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export function CustomerBookingDetailPage() {
  const { bookingId } = useParams<{ bookingId: string }>()
  const navigate = useNavigate()

  const {
    data: booking,
    isLoading,
    isError,
  } = useQuery({
    queryKey: bookingQueryKeys.detail(bookingId),
    queryFn: () => bookingApi.getBooking(bookingId!),
    enabled: !!bookingId,
    refetchInterval: (query) => {
      const data = query.state.data
      if (!data) return false
      const liveBookingStatuses = ["CONFIRMED", "CHECKED_IN", "ACTIVE", "EXTENDING", "CHECKING_OUT"]
      if (liveBookingStatuses.includes(data.status)) return 10_000
      return false
    },
  })

  const sessionId = booking?.session?.id
  const { data: sessionDetail } = useQuery({
    queryKey: ["sessions", sessionId],
    queryFn: () => customerSessionApi.getSessionDetail(sessionId!),
    enabled: !!sessionId,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      if (!status) return false
      const liveSessionStatuses = ["CHECKED_IN", "ACTIVE", "EXTENDING", "CHECKING_OUT"]
      return liveSessionStatuses.includes(status) ? 10_000 : false
    },
  })

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
      </div>
    )
  }

  if (isError || !booking) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <Card className="max-w-md w-full text-center p-8 space-y-4">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto" />
          <h2 className="text-xl font-bold text-slate-900">Không tìm thấy đơn đặt lịch</h2>
          <p className="text-sm text-slate-500">Mã đặt lịch không hợp lệ hoặc bạn không có quyền xem.</p>
          <Button onClick={() => navigate("/customer/bookings")} className="w-full bg-slate-900 text-white rounded-xl">
            Quay lại Lịch đặt sân
          </Button>
        </Card>
      </div>
    )
  }

  // ── Derived display data ────────────────────────────────────────────────────

  const checkInWindowExpired = hasExpiredCheckInWindow(booking)
  const effectiveStatus = checkInWindowExpired ? "NO_SHOW" : booking.status
  const statusConfig = STATUS_CONFIG[effectiveStatus]
  const isPaid = ["CONFIRMED", "COMPLETED", "NO_SHOW"].includes(effectiveStatus)

  const slotFee = sumComponents(booking.payment_components, "SLOT_FEE")
  const rentalFee = sumComponents(booking.payment_components, "RENTAL_FEE")
  const fnbPreorderFee = sumComponents(booking.payment_components, "FNB_PREORDER", "FB_PREORDER")
  const damageBreakdown = booking.damage_breakdown
  // Read damage from payment_components first (backend creates DAMAGE_CHARGE PENDING when inspection submitted),
  // fall back to damage_breakdown field if available.
  const damageComponentAmount = Number(booking.payment_components.find((c) => c.type === "DAMAGE_CHARGE")?.amount ?? 0)
  const damageCharge = damageComponentAmount || (damageBreakdown?.totalDamageCharge ?? 0)
  const hasPendingDamage = booking.payment_components.some((c) => c.type === "DAMAGE_CHARGE" && c.status === "PENDING")
  const totalAmount = slotFee + rentalFee + fnbPreorderFee + damageCharge

  const participantNames = booking.participants.map(
    (p) => p.resolvedName ?? p.guestName ?? "Khách vãng lai",
  )
  const vehicleItems = booking.vehicles

  const slotStartDate = new Date(booking.slotStart)
  const slotEndDate = new Date(booking.slotEnd)

  // ── Inspection photos from session detail ──────────────────────────────────
  const inspectionsWithPhotos = (sessionDetail?.inspections ?? []).filter(
    (ins) => ins.photos.length > 0,
  )
  const checkInInspection = inspectionsWithPhotos.find((i) => i.type === "CHECK_IN")
  const checkOutInspection = inspectionsWithPhotos.find((i) => i.type === "CHECK_OUT")
  const approvedExtensions = sessionDetail?.approvedExtensions ?? []

  const isLiveSession =
    !checkInWindowExpired &&
    sessionDetail && ["ACTIVE", "EXTENDING", "CHECKED_IN", "CHECKING_OUT"].includes(sessionDetail.status)

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-4 md:p-8 font-sans relative overflow-x-clip">

      <div className="absolute top-0 right-0 w-[500px] h-[500px] rounded-full bg-orange-500/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] rounded-full bg-slate-500/5 blur-[120px] pointer-events-none" />

      <div className="max-w-5xl mx-auto space-y-6 relative z-10">

        {/* Top bar */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate("/customer/bookings")}
            className="inline-flex items-center gap-2 text-xs font-extrabold text-slate-500 hover:text-slate-900 transition-colors bg-white px-3.5 py-2 rounded-xl border border-slate-200 shadow-sm"
          >
            <ArrowLeft className="h-4 w-4 text-orange-500" />
            Quay lại Lịch đặt sân
          </button>
          <span className="text-xs font-bold text-slate-400">
            Mã đơn: <strong className="text-slate-800">{booking.id}</strong>
          </span>
        </div>

        {/* Status hero */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <Badge className={`px-2.5 py-1 text-xs font-bold border-none uppercase tracking-wide ${statusConfig.color}`}>
                {statusConfig.label}
              </Badge>
              {isPaid ? (
                <Badge className="bg-emerald-100 text-emerald-800 border-none font-bold text-xs uppercase tracking-wide">
                  Đã thanh toán
                </Badge>
              ) : (
                <Badge className="bg-rose-100 text-rose-800 border-none font-bold text-xs uppercase tracking-wide animate-pulse">
                  Chờ thanh toán
                </Badge>
              )}
            </div>
            <h1 className="text-2xl font-black text-slate-950 tracking-tight">Chi Tiết Đơn Đặt Sân</h1>
            <p className="text-xs text-slate-500 font-semibold">{statusConfig.desc}</p>
          </div>

          {isLiveSession && sessionDetail && (
            <button
              onClick={() => navigate(`/customer/sessions/${sessionDetail.sessionId}`)}
              className="inline-flex items-center gap-2 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white text-xs font-bold px-4 py-3 rounded-xl shadow-md shadow-orange-500/20 transition-all"
            >
              Bạn đang chơi! Xem phiên chơi
              <ExternalLink className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Pending damage charge notice */}
        {hasPendingDamage && (
          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-extrabold text-rose-900">Phát sinh phí đền bù hư hỏng xe</p>
              <p className="text-xs text-rose-700 font-semibold mt-0.5">
                Nhân viên đã ghi nhận hư hỏng. Vui lòng thanh toán <strong>{damageCharge.toLocaleString("vi-VN")}đ</strong> trực tiếp tại quầy.
              </p>
              {sessionDetail && (
                <button
                  onClick={() => navigate(`/customer/sessions/${sessionDetail.sessionId}`)}
                  className="mt-2 text-xs font-bold text-rose-700 underline underline-offset-2"
                >
                  Xem chi tiết biên bản →
                </button>
              )}
            </div>
          </div>
        )}

        {/* 2-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

          {/* Left col (2/3) */}
          <div className="lg:col-span-2 space-y-6">

            {/* Cafe & slot info */}
            <Card className="border-slate-200/80 shadow-sm overflow-hidden bg-white">
              <div className="h-32 bg-gradient-to-r from-slate-900 to-slate-800 relative flex items-center justify-between p-6 overflow-hidden">
                <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px]" />
                <div className="space-y-1 relative z-10 text-white">
                  <span className="text-[10px] font-black text-orange-400 uppercase tracking-widest">Địa điểm chơi</span>
                  <h3 className="text-lg font-black">{booking.cafe?.name ?? "—"}</h3>
                </div>
                <div className="h-16 w-16 rounded-xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center relative z-10 text-white">
                  <MapPin className="h-8 w-8 text-orange-400" />
                </div>
              </div>
              <CardContent className="p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-semibold text-slate-700">
                  <div className="space-y-1 bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                    <span className="block text-[10px] text-slate-400 uppercase font-bold">Địa chỉ</span>
                    <span className="text-slate-900 block mt-0.5">
                      {[booking.cafe?.address, booking.cafe?.city].filter(Boolean).join(", ") || "—"}
                    </span>
                  </div>
                  <div className="space-y-1 bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                    <span className="block text-[10px] text-slate-400 uppercase font-bold">Loại sân</span>
                    <span className="text-slate-900 block font-extrabold mt-0.5">
                      {booking.track_type_name ?? "—"}
                    </span>
                    <Badge className="bg-slate-200 text-slate-800 border-none font-bold text-[9px] mt-2 uppercase">
                      {PLAY_MODE_LABELS[booking.playMode] ?? booking.playMode}
                    </Badge>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-4 bg-orange-50/50 rounded-2xl border border-orange-100 text-xs font-bold text-orange-800">
                  <Clock className="h-5 w-5 text-orange-500 shrink-0" />
                  <div>
                    <span>Khung giờ hẹn: </span>
                    <span className="text-slate-900 font-extrabold">
                      {slotStartDate.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
                      {" – "}
                      {slotEndDate.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <span>
                      {" "}
                      ({slotStartDate.toLocaleDateString("vi-VN", {
                        weekday: "long",
                        day: "numeric",
                        month: "numeric",
                        year: "numeric",
                      })})
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Participants & vehicles */}
            <Card className="border-slate-200/80 shadow-sm bg-white">
              <CardHeader className="pb-3 border-b border-slate-100">
                <CardTitle className="text-sm font-black text-slate-950 uppercase tracking-wider flex items-center gap-2">
                  <Car className="h-4 w-4 text-orange-500" />
                  Tài Nguyên Đặt Trước
                </CardTitle>
                <CardDescription className="text-xs">Người chơi và xe đã đăng ký.</CardDescription>
              </CardHeader>
              <CardContent className="p-6 space-y-5">
                {participantNames.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Người chơi</h4>
                    <div className="space-y-2">
                      {participantNames.map((name, idx) => (
                        <div key={idx} className="flex items-center gap-3 bg-white p-2.5 rounded-xl border border-slate-100 shadow-2xs">
                          <div className="h-8 w-8 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-xs">
                            <User className="h-4 w-4" />
                          </div>
                          <p className="text-xs font-extrabold text-slate-900">{name}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {vehicleItems.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Xe thuê</h4>
                    <div className="space-y-2">
                      {vehicleItems.map((v) => (
                        <div key={v.id} className="flex items-center gap-3 bg-white p-2.5 rounded-xl border border-slate-100 shadow-2xs">
                          <div className="h-8 w-8 rounded-lg overflow-hidden shrink-0">
                            <VehicleImage
                              imageUrl={v.coverImageUrl}
                              alt={v.catalogName ?? "Xe thuê"}
                              className="h-full w-full object-cover"
                              iconClassName="h-4 w-4"
                            />
                          </div>
                          <div>
                            <p className="text-xs font-extrabold text-slate-900">
                              {[v.catalogName, v.identifier].filter(Boolean).join(" · ")}
                            </p>
                            {v.color && <p className="text-[10px] text-slate-400 font-bold">{v.color}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Session summary */}
            {booking.session && !checkInWindowExpired && (
              <Card className="border-slate-200/80 shadow-sm bg-white">
                <CardHeader className="pb-3 border-b border-slate-100">
                  <CardTitle className="text-sm font-black text-slate-950 uppercase tracking-wider flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-orange-500" />
                    Phiên Chơi Thực Tế
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Thông tin session được tạo sau khi nhân viên kích hoạt check-in.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-6">
                  <div
                    className="bg-slate-50 hover:bg-slate-100/80 transition-colors p-4 rounded-2xl border border-slate-200/70 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer"
                    onClick={() => navigate(`/customer/sessions/${booking.session!.id}`)}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-slate-900">{booking.session.id}</span>
                        <Badge className={`text-[9px] px-1.5 py-0.5 font-bold uppercase tracking-wide border-none ${
                          booking.session.status === "ACTIVE" ? "bg-orange-100 text-orange-800" :
                          booking.session.status === "CHECKED_IN" ? "bg-amber-100 text-amber-800 animate-pulse" :
                          booking.session.status === "COMPLETED" ? "bg-emerald-100 text-emerald-800" :
                          "bg-slate-200 text-slate-800"
                        }`}>
                          {booking.session.status === "CHECKED_IN"
                            ? (booking.playMode === "BYOC" ? "Đã vào sân" : "Đã nhận xe")
                            : (SESSION_STATUS_LABELS[booking.session.status] ?? booking.session.status)}
                        </Badge>
                      </div>
                      <p className="text-xs font-semibold text-slate-600">
                        {booking.session.actualStartAt
                          ? `Bắt đầu: ${new Date(booking.session.actualStartAt).toLocaleTimeString("vi-VN")}`
                          : "Chưa kích hoạt"}
                        {booking.session.actualEndAt
                          ? ` — Kết thúc: ${new Date(booking.session.actualEndAt).toLocaleTimeString("vi-VN")}`
                          : ""}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 rounded-lg text-xs font-bold text-orange-600 hover:text-orange-700 hover:bg-orange-50 shrink-0 self-end md:self-center"
                    >
                      Xem chi tiết phiên
                      <ExternalLink className="h-3 w-3 ml-1" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            <ExtensionAuditCard
              extensions={approvedExtensions}
              initialPlannedEnd={booking.slotEnd}
              currentProposal={sessionDetail?.extensionProposal}
            />

            {(!booking.session || checkInWindowExpired) && (
              <Card className="border-slate-200/80 shadow-sm bg-white">
                <CardContent className="p-8 text-center space-y-2 border border-dashed border-slate-200 rounded-xl m-4">
                  <HelpCircle className="h-8 w-8 text-slate-300 mx-auto" />
                  <p className="text-xs font-extrabold text-slate-900">Chưa có phiên chơi thực tế</p>
                  <p className="text-[10px] text-slate-400 font-medium max-w-xs mx-auto">
                    Phiên chơi sẽ được nhân viên kích hoạt khi bạn quét mã check-in tại quầy.
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Damage breakdown */}
            {damageBreakdown && damageBreakdown.lineItems.length > 0 && (
              <Card className="border-rose-200/80 shadow-sm bg-white overflow-hidden">
                <CardHeader className="pb-3 border-b border-rose-100 bg-rose-50/50">
                  <CardTitle className="text-sm font-black text-slate-950 uppercase tracking-wider flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-rose-500" />
                    Đền Bù Hư Hỏng
                  </CardTitle>
                  <CardDescription className="text-xs">Chi tiết các hư hỏng ghi nhận khi trả xe.</CardDescription>
                </CardHeader>
                <CardContent className="p-5 space-y-3">
                  {damageBreakdown.lineItems.map((item) => (
                    <div key={item.id} className="flex items-start justify-between rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs">
                      <div className="space-y-0.5">
                        <p className="font-extrabold text-slate-900">
                          {PART_TYPE_LABELS[item.partType] ?? item.partType}
                          {item.customPartName && (
                            <span className="font-semibold text-slate-500"> — {item.customPartName}</span>
                          )}
                        </p>
                        <div className="flex gap-4 text-[11px] text-slate-500 font-semibold">
                          <span>Linh kiện: {fmt(item.partsPrice)}</span>
                          {item.laborPrice > 0 && <span>Công sửa: {fmt(item.laborPrice)}</span>}
                        </div>
                      </div>
                      <span className="font-extrabold text-rose-600 shrink-0 pl-3">{fmt(item.subtotal)}</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between rounded-xl bg-rose-50 border border-rose-200 p-3.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-black text-rose-900">Tổng đền bù:</span>
                      <Badge className={
                        damageBreakdown.status === "SETTLED"
                          ? "bg-emerald-100 text-emerald-800 border-none font-bold text-[10px]"
                          : damageBreakdown.status === "AWAITING_PAYMENT"
                            ? "bg-rose-100 text-rose-800 border-none font-bold text-[10px] animate-pulse"
                            : "bg-amber-100 text-amber-800 border-none font-bold text-[10px]"
                      }>
                        {damageBreakdown.status === "SETTLED" ? "Đã thu"
                          : damageBreakdown.status === "AWAITING_PAYMENT" ? "Thu thêm"
                          : "Đang xử lý"}
                      </Badge>
                    </div>
                    <span className="text-xl font-extrabold text-rose-700">{fmt(damageBreakdown.totalDamageCharge)}</span>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Inspection photos */}
            {checkInInspection && <InspectionPhotosCard inspection={checkInInspection} />}
            {checkOutInspection && <InspectionPhotosCard inspection={checkOutInspection} />}

          </div>

          {/* Right col (1/3) */}
          <aside className="lg:sticky lg:top-20 lg:self-start">
            <div className="space-y-6 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:pr-1">

            {/* QR check-in */}
            {booking.status === "CONFIRMED" && new Date() < new Date(booking.slotEnd) && (
              <Card className="border-slate-200/80 shadow-md relative overflow-hidden bg-white text-center p-6 space-y-4">
                <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-orange-500 to-orange-600" />
                <div className="space-y-1">
                  <CardTitle className="text-sm font-black text-slate-950 uppercase tracking-wider flex items-center justify-center gap-1.5">
                    <QrCode className="h-4 w-4 text-orange-500" />
                    Mã Check-in Sân
                  </CardTitle>
                  <CardDescription className="text-[10px] font-bold">
                    ĐƯA MÃ NÀY CHO NHÂN VIÊN TẠI QUẦY
                  </CardDescription>
                </div>

                <div className="mx-auto p-3 bg-white border border-slate-200 rounded-2xl shadow-sm inline-block">
                  <QRCodeSVG value={booking.id} size={200} level="M" includeMargin />
                </div>

                <div className="bg-slate-50 border border-slate-100 rounded-xl p-2.5">
                  <code className="text-xs font-black text-slate-800 tracking-widest">
                    #{booking.id.substring(0, 8).toUpperCase()}
                  </code>
                </div>

                <p className="text-[10px] text-slate-400 font-semibold leading-normal px-2">
                  {booking.playMode === "BYOC"
                    ? "Staff tại quán sẽ quét mã QR này để bắt đầu thủ tục vào sân và tạo phiên chơi."
                    : "Staff tại quán sẽ quét mã QR này để bắt đầu thủ tục bàn giao xe và tạo phiên chơi."}
                </p>
              </Card>
            )}

            {/* Bill */}
            <Card className="border-slate-200/80 shadow-md bg-white overflow-hidden">
              <CardHeader className="pb-3 border-b border-slate-100 bg-slate-50/50">
                <CardTitle className="text-xs font-black text-slate-950 uppercase tracking-widest flex items-center gap-2">
                  <Receipt className="h-4 w-4 text-orange-500" />
                  Hóa Đơn
                </CardTitle>
              </CardHeader>
              <CardContent className="p-5 space-y-4 text-xs font-semibold text-slate-700">
                <div className="space-y-2.5">
                  {slotFee > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">Phí slot sân</span>
                      <span className="text-slate-800">{fmt(slotFee)}</span>
                    </div>
                  )}
                  {rentalFee > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">Thuê xe ({vehicleItems.length} chiếc)</span>
                      <span className="text-slate-800">{fmt(rentalFee)}</span>
                    </div>
                  )}
                  {fnbPreorderFee > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">Đồ ăn & thức uống đặt trước</span>
                      <span className="text-slate-800">{fmt(fnbPreorderFee)}</span>
                    </div>
                  )}
                  {damageCharge > 0 && (
                    <div className="flex justify-between text-rose-700">
                      <span className="font-extrabold">Đền bù hư hỏng</span>
                      <span className="font-extrabold">{fmt(damageCharge)}</span>
                    </div>
                  )}
                </div>

                <div className="h-px bg-slate-100" />

                <div className="flex justify-between text-sm font-black">
                  <span className="text-slate-950">Tổng dự kiến</span>
                  <span className="text-orange-600">{fmt(totalAmount)}</span>
                </div>

              </CardContent>
              <CardFooter className="pt-2 pb-4 border-t border-slate-50 justify-center">
                <div className="flex items-center gap-1 text-[10px] text-slate-400 font-bold">
                  <Info className="h-3.5 w-3.5" />
                  Mọi khoản chi tiêu được kiểm toán qua Ledger.
                </div>
              </CardFooter>
            </Card>

            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
