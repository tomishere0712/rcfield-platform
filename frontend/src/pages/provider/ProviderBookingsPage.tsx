import { useState, useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  AlertTriangle,
  CalendarClock,
  CreditCard,
  XCircle,
  ChevronLeft,
  ChevronRight,
  Wrench,
  Clock,
  User,
  PlayCircle,
  Calendar,
  CheckCircle2,
  RotateCcw,
  UtensilsCrossed,
  Tag,
  Receipt,
  Layers,
  MapPin,
} from "lucide-react"
import { toast } from "sonner"

import { cafeApi, cafeQueryKeys } from "@/features/cafes/api/cafe.api"
import { useCafeBookings, useCancelBooking, useBooking } from "@/features/booking/hooks/use-booking"
import { formatPaymentGateway } from "@/shared/lib/format"
import { sanitizeImageUrl } from "@/shared/lib/utils"
import type { BookingStatus, CafeBookingListItem } from "@/features/booking/types/booking.types"
import { MetricCard, Panel, PanelTitle, ProviderPageHeader } from "@/pages/provider/components/ProviderPrimitives"
import { ProviderShell } from "@/pages/provider/components/ProviderShell"
import { Badge } from "@/shared/ui/badge"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select"

const PART_TYPE_LABELS: Record<string, string> = {
  TIRE_WHEEL: "Bánh xe",
  SPOILER: "Cánh gió",
  CHASSIS: "Khung gầm",
  MOTOR: "Motor",
  SHELL: "Vỏ nhựa",
  SERVO: "Servo",
  REMOTE: "Tay điều khiển",
  OTHER: "Khác",
}

const DAMAGE_STATUS_LABELS: Record<string, { label: string; className: string }> = {
  SETTLED: { label: "Đã thu", className: "bg-emerald-100 text-emerald-800" },
  AWAITING_PAYMENT: { label: "Thu thêm", className: "bg-orange-100 text-orange-800" },
  PENDING: { label: "Đang xử lý", className: "bg-amber-100 text-amber-800" },
}

const STATUS_LABELS: Record<BookingStatus, { label: string; className: string }> = {
  PENDING: { label: "Chờ thanh toán", className: "bg-amber-100 text-amber-800" },
  CONFIRMED: { label: "Đã xác nhận", className: "bg-emerald-100 text-emerald-800" },
  AWAITING_PAYMENT: { label: "Chờ thanh toán phí phát sinh", className: "bg-amber-100 text-amber-800" },
  NO_SHOW: { label: "Không đến", className: "bg-orange-100 text-orange-800" },
  COMPLETED: { label: "Hoàn thành", className: "bg-indigo-100 text-indigo-800" },
  CANCELLED: { label: "Đã hủy", className: "bg-red-100 text-red-800" },
}

/**
 * Nhãn trạng thái hiển thị cho một đơn — TRẠNG THÁI ĐƠN THẮNG TRẠNG THÁI PHIÊN.
 *
 * Trước đây trạng thái phiên được xét trước và không có điều kiện gì, nên
 * `AWAITING_PAYMENT` ("chờ thu phí phát sinh") không bao giờ hiện ra được: nhãn
 * có sẵn trong `STATUS_LABELS` nhưng nhánh phiên đã trả về "Đang chơi" từ
 * trước. Đơn đã chốt sổ chờ thu tiền vẫn nhấp nháy xanh "Đang chơi", và người
 * ở quầy không có cách nào biết đơn nào còn nợ tiền.
 *
 * Cùng lỗi đó còn che được cả đơn ĐÃ HUỶ: phiên treo ở ACTIVE thì đơn huỷ vẫn
 * hiện "Đang chơi".
 *
 * Ba trạng thái dưới đây là trạng thái CHỐT của đơn — chúng chỉ đạt tới khi mọi
 * phiên đã đóng, nên gặp phiên còn "đang chạy" nghĩa là dữ liệu lệch. Lúc đó sự
 * thật về TIỀN mới là thứ đáng hiện.
 */
const SETTLED_BOOKING_STATUSES = ["CANCELLED", "AWAITING_PAYMENT", "COMPLETED"] as const

/**
 * Quá bao lâu so với giờ dự kiến thì thôi gọi là "đang chơi".
 *
 * Bằng đúng `SESSION_CHECKOUT_GRACE_MINUTES` của backend
 * (`lib/session-operational-timing.ts`). Hai bên phải cùng một con số, nếu
 * không thì nhân viên nhận cảnh báo "quá giờ" trong khi màn hình vẫn xanh
 * "đang chơi", và không ai biết bên nào nói thật.
 */
const CHECKOUT_GRACE_MINUTES = 10

function getBookingDisplayStatus(
  bookingStatus: string,
  sessionStatus?: string | null,
  sessionPlannedEndAt?: string | null,
): { label: string; className: string; pulse?: boolean } {
  if (
    (SETTLED_BOOKING_STATUSES as readonly string[]).includes(bookingStatus)
  ) {
    const settled = STATUS_LABELS[bookingStatus as BookingStatus]
    if (settled) return settled
  }

  /*
    Phiên đã quá giờ trả xe thì KHÔNG còn là "đang chơi".

    Phiên chỉ đóng khi có người làm biên bản trả xe kèm ảnh — hệ thống cố ý
    không tự đóng, vì tự đóng là dựng ra một lần bàn giao không có bằng chứng.
    Hệ quả: một phiên khách bỏ về mà quên trả xe sẽ nằm ở ACTIVE mãi mãi, và
    nhãn cũ vẫn nhấp nháy xanh "Đang chơi" sau mười bốn ngày.

    Đó là sự thật về DỮ LIỆU nhưng là lời nói dối về TÌNH HÌNH: không ai đang
    chơi cả, và việc cần làm là đi tìm chiếc xe.
  */
  const quaGio =
    Boolean(sessionPlannedEndAt) &&
    Date.now() >
      new Date(sessionPlannedEndAt as string).getTime() +
        CHECKOUT_GRACE_MINUTES * 60_000

  if (sessionStatus === "ACTIVE" || sessionStatus === "EXTENDING") {
    if (quaGio) {
      return {
        label: "Quá giờ, chưa trả xe",
        className: "bg-red-100 text-red-800",
      }
    }
    return sessionStatus === "ACTIVE"
      ? {
          label: "Đang chơi",
          className: "bg-emerald-100 text-emerald-800",
          pulse: true,
        }
      : { label: "Đang gia hạn", className: "bg-amber-100 text-amber-800" }
  }
  if (sessionStatus === "CHECKING_OUT") {
    return { label: "Chờ trả xe", className: "bg-blue-100 text-blue-800" }
  }

  return (
    STATUS_LABELS[bookingStatus as BookingStatus] ?? {
      label: bookingStatus,
      className: "bg-slate-100 text-slate-700",
    }
  )
}

const PLAY_MODE_LABELS: Record<string, string> = {
  RENTAL: "Thuê xe",
  BYOC: "Xe riêng",
}

const FNB_STATUS_LABELS: Record<string, { label: string; className: string }> = {
  PENDING: { label: "Chờ phục vụ", className: "bg-amber-100 text-amber-800" },
  CONFIRMED: { label: "Đã xác nhận", className: "bg-blue-100 text-blue-800" },
  PREPARING: { label: "Đang chuẩn bị", className: "bg-blue-100 text-blue-800" },
  DELIVERED: { label: "Đã giao món", className: "bg-emerald-100 text-emerald-800" },
  COMPLETED: { label: "Đã hoàn thành", className: "bg-emerald-100 text-emerald-800" },
  CANCELLED: { label: "Đã hủy", className: "bg-red-100 text-red-800" },
}

function formatCurrency(amount: number) {
  return amount.toLocaleString("vi-VN") + "đ"
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", hour12: false })
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("vi-VN", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

function formatDateTime(iso: string | Date) {
  return new Date(iso).toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

function gatewayLabel(gateway?: string | null) {
  return formatPaymentGateway(gateway)
}

function BookingDetailDrawer({ bookingId, onClose }: { bookingId: string; onClose: () => void }) {
  const { data: booking, isLoading } = useBooking(bookingId)
  const damage = booking?.damage_breakdown
  const [visible, setVisible] = useState(false)

  const booker = booking?.participants?.find((p) => p.participantType === "BOOKER") ?? booking?.participants?.[0]

  // Trigger slide-in animation after mount
  useEffect(() => {
    const t = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(t)
  }, [])

  const handleClose = () => {
    setVisible(false)
    setTimeout(onClose, 280)
  }

  // Financial calculations
  const snapshot = booking?.snapshot as Record<string, unknown> | null
  const snapshotSlotFee = Number(
    snapshot?.slot_fee_total ?? snapshot?.slot_fee ?? 0,
  )
  const snapshotRentalFee = Number(
    (snapshot?.vehicles as Array<Record<string, unknown>> | undefined)?.reduce(
      (sum: number, v: Record<string, unknown>) =>
        sum + Number(v.rental_fee ?? 0),
      0,
    ) ??
      snapshot?.rental_fee ??
      0,
  )
  const snapshotFnbPreorder = Number(
    snapshot?.fnb_total ?? snapshot?.fnb_preorder_fee ?? 0,
  )
  const snapshotContestEntryFee = Number(snapshot?.contest_entry_fee ?? 0)

  const initialPaymentWasSuccessful =
    (booking?.payment_transactions ?? []).some(
      (transaction) =>
        transaction.type === "PAYMENT" && transaction.status === "SUCCESS",
    ) ||
    (booking?.payment_components ?? []).some(
      (component) =>
        ["SLOT_FEE", "RENTAL_FEE", "FNB_PREORDER", "FB_PREORDER"].includes(
          component.type,
        ) &&
        [
          "HELD",
          "CAPTURED",
          "DISBURSED",
          "REFUNDED",
          "PARTIALLY_REFUNDED",
          "PENDING_REFUND",
        ].includes(component.status),
    )

  const initialPaymentGateway = (booking?.payment_transactions ?? []).find(
    (transaction) =>
      transaction.type === "PAYMENT" && transaction.status === "SUCCESS",
  )?.gateway

  const financialSummary = booking?.financial_summary
  const fallbackPrepaidLines = [
    {
      componentId: "slot-fee",
      label: "Phí lịch chơi",
      amount: Number(snapshotSlotFee),
    },
    {
      componentId: "rental-fee",
      label: "Phí thuê xe",
      amount: Number(snapshotRentalFee),
    },
    {
      componentId: "fnb-preorder",
      label: "Đồ ăn & thức uống đặt trước",
      amount: Number(snapshotFnbPreorder),
    },
    {
      componentId: "contest-entry-fee",
      label: "Phí tham gia giải đấu",
      amount: Number(snapshotContestEntryFee),
    },
  ].filter((line) => line.amount > 0)

  const fallbackAdditionalLines = (booking?.payment_components ?? [])
    .filter(
      (component) =>
        !["SLOT_FEE", "RENTAL_FEE", "CONTEST_ENTRY_FEE"].includes(
          component.type,
        ) &&
        !(
          (component.type === "FNB_PREORDER" ||
            component.type === "FB_PREORDER") &&
          component.status === "HELD"
        ),
    )
    .map((component) => ({
      componentId: component.id,
      label:
        component.type === "FNB_ON_SITE" ||
        component.type === "FNB_PREORDER" ||
        component.type === "FB_PREORDER"
          ? "Đồ ăn & thức uống gọi tại quầy"
          : component.type === "EXTENSION_FEE"
            ? "Phí gia hạn ca chơi"
            : component.type === "DAMAGE_CHARGE"
              ? "Phí bồi thường hư hỏng"
              : "Khoản phát sinh khác",
      amount: Number(component.amount),
      status: component.status,
      payment: undefined,
    }))

  const rawPrepaidLines = financialSummary?.prepaidLines ?? fallbackPrepaidLines
  const seenPrepaidLines = new Set<string>()
  const prepaidLines = rawPrepaidLines.filter((line) => {
    const key = `${line.componentId || ''}_${line.label}_${line.amount}`
    if (seenPrepaidLines.has(key)) return false
    seenPrepaidLines.add(key)
    return true
  })
  const additionalLines =
    financialSummary?.additionalLines ?? fallbackAdditionalLines
  const prepaidDiscountAmount =
    financialSummary?.prepaidDiscountAmount ??
    Number(booking?.discountAmount ?? 0)
  const prepaidServiceAmount = Math.max(
    0,
    prepaidLines.reduce((sum, line) => sum + Number(line.amount), 0) -
      prepaidDiscountAmount,
  )
  const prepaidPaidAmount =
    financialSummary?.prepaidPaidAmount ??
    (initialPaymentWasSuccessful ? prepaidServiceAmount : 0)
  const additionalTotal =
    financialSummary?.additionalTotal ??
    additionalLines.reduce((sum, line) => sum + Number(line.amount), 0)
  const additionalOutstandingAmount =
    financialSummary?.additionalOutstandingAmount ??
    additionalLines
      .filter((line) => line.status === "PENDING")
      .reduce((sum, line) => sum + Number(line.amount), 0)
  const totalPaidAmount =
    financialSummary?.totalPaidAmount ??
    (prepaidPaidAmount +
      Math.max(0, additionalTotal - additionalOutstandingAmount))
  const refundComponents = (booking?.payment_components ?? []).filter(
    (c) =>
      c.status === "REFUNDED" ||
      c.status === "PENDING_REFUND" ||
      c.status === "PARTIALLY_REFUNDED" ||
      Number(c.refundedAmount ?? 0) > 0,
  )
  const totalRefundedAmount =
    financialSummary?.totalRefundedAmount ??
    refundComponents.reduce(
      (sum, c) => sum + Number(c.refundedAmount || c.amount || 0),
      0,
    )
  const netPaidAmount =
    financialSummary?.netPaidAmount ??
    Math.max(0, totalPaidAmount - totalRefundedAmount)
  const outstandingAmount =
    financialSummary?.outstandingAmount ??
    (booking?.status === "PENDING"
      ? prepaidServiceAmount
      : additionalOutstandingAmount)

  const pkgUsed = snapshot?.package_used as
    | { package_name?: string; slots_used?: number }
    | undefined

  const fnbOrders = (
    booking?.fnb_orders?.length
      ? booking.fnb_orders
      : booking?.fnb_order
        ? [booking.fnb_order]
        : []
  ).filter((order) => order.items && order.items.length > 0)

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="fixed inset-0 bg-black/40 transition-opacity duration-300"
        style={{ opacity: visible ? 1 : 0 }}
        onClick={handleClose}
      />
      <div
        className="relative z-10 w-full max-w-lg bg-white shadow-2xl flex flex-col h-full overflow-y-auto transition-transform duration-300 ease-out"
        style={{ transform: visible ? "translateX(0)" : "translateX(100%)" }}
      >
        <div className="flex items-center justify-between p-5 border-b border-slate-100 sticky top-0 bg-white/95 backdrop-blur-sm z-20">
          <div>
            <h2 className="text-base font-black text-slate-900">
              Chi tiết đặt lịch #{bookingId.substring(0, 8).toUpperCase()}
            </h2>
            {booking && (
              <p className="text-[11px] text-slate-400 mt-0.5">
                Ngày tạo: {formatDateTime(booking.createdAt)}
              </p>
            )}
          </div>
          <button
            onClick={handleClose}
            className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-lg hover:bg-slate-100"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center text-sm text-slate-400">
            Đang tải thông tin đặt lịch...
          </div>
        ) : !booking ? (
          <div className="flex-1 flex items-center justify-center text-sm text-slate-400">
            Không tìm thấy thông tin đặt lịch.
          </div>
        ) : (
          <div className="p-5 space-y-6">
            {/* Status + mode + Check-in code badges */}
            <div className="flex items-center gap-2 flex-wrap">
              {(() => {
                const shown = getBookingDisplayStatus(
                  booking.status,
                  booking.session?.status,
                  booking.session?.plannedEndAt,
                )
                return (
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${shown.className}${shown.pulse ? " animate-pulse" : ""}`}
                  >
                    {shown.label}
                  </span>
                )
              })()}
              <span
                className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${booking.playMode === "RENTAL" ? "bg-orange-100 text-orange-800" : "bg-blue-100 text-blue-800"}`}
              >
                {booking.playMode === "RENTAL" ? "Thuê xe" : "Xe riêng"}
              </span>
              {booking.checkInCode && (
                <Badge
                  variant="outline"
                  className="font-mono text-[11px] bg-slate-50 border-slate-300 font-bold text-slate-800 ml-auto"
                >
                  Mã Check-in: #{booking.checkInCode}
                </Badge>
              )}
            </div>

            {/* Cancellation info if cancelled */}
            {booking.status === "CANCELLED" && (
              <div className="rounded-xl border border-red-200 bg-red-50/60 p-3.5 space-y-1 text-xs text-red-900">
                <div className="flex items-center gap-1.5 font-bold">
                  <XCircle className="h-4 w-4 text-red-600 shrink-0" />
                  <span>Đơn đặt lịch đã bị hủy</span>
                </div>
                {booking.cancelledBy && (
                  <p className="text-[11px] text-red-800">
                    Người hủy: <strong>{booking.cancelledBy}</strong>
                  </p>
                )}
                {booking.cancellationReason && (
                  <p className="text-[11px] text-red-800">
                    Lý do: <em>{booking.cancellationReason}</em>
                  </p>
                )}
              </div>
            )}

            {/* Time and Venue info */}
            <div className="rounded-xl bg-slate-50 border border-slate-100 p-4 space-y-3">
              <div className="flex items-start gap-3">
                <div className="h-9 w-9 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center shrink-0">
                  <Calendar className="h-4 w-4" />
                </div>
                <div className="flex-1">
                  <p className="text-xs font-semibold text-slate-500">Ngày đặt & Giờ chơi</p>
                  <p className="text-sm font-bold text-slate-900 mt-0.5">
                    {formatDate(booking.slotStart)}
                  </p>
                  <div className="flex items-center gap-2 mt-1 text-xs text-slate-700">
                    <Clock className="h-3.5 w-3.5 text-slate-400" />
                    <span className="font-semibold">
                      {formatTime(booking.slotStart)} –{" "}
                      {formatTime(booking.session?.plannedEndAt || booking.slotEnd)}
                    </span>
                    {booking.session?.approvedExtensionMinutes &&
                    booking.session.approvedExtensionMinutes > 0 ? (
                      <span className="font-bold text-orange-600 text-[11px]">
                        (+{booking.session.approvedExtensionMinutes}p gia hạn)
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>

              {(booking.cafe || booking.track_type_name) && (
                <div className="border-t border-slate-200/70 pt-2.5 space-y-1.5 text-xs text-slate-600">
                  {booking.cafe && (
                    <div className="flex items-center gap-2">
                      <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <span className="font-semibold text-slate-800">
                        {booking.cafe.name}
                        {booking.cafe.address ? ` · ${booking.cafe.address}` : ""}
                      </span>
                    </div>
                  )}
                  {booking.track_type_name && (
                    <div className="flex items-center gap-2">
                      <PlayCircle className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <span>Loại sân: <strong className="text-slate-800">{booking.track_type_name}</strong></span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Customer info with Avatar */}
            {booker?.resolvedName && (
              <div className="flex items-center gap-3 bg-slate-50 border border-slate-100 rounded-xl p-3.5">
                <div className="h-11 w-11 rounded-full overflow-hidden bg-slate-200 flex-shrink-0 flex items-center justify-center border border-slate-100">
                  {booker.resolvedAvatarUrl ? (
                    <img
                      src={sanitizeImageUrl(booker.resolvedAvatarUrl ?? undefined) ?? undefined}
                      alt={booker.resolvedName}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <User className="h-5 w-5 text-slate-400" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <p className="font-bold text-xs text-slate-900">{booker.resolvedName}</p>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-600 font-semibold">
                      Người đặt
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {booker.resolvedPhone || "Chưa cập nhật số điện thoại"}
                  </p>
                </div>
              </div>
            )}

            {/* Vehicles list with images */}
            <div className="space-y-2.5">
              <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">
                Phương tiện ({booking.vehicles.length > 0 ? `${booking.vehicles.length} xe` : "Xe riêng"})
              </p>
              {booking.vehicles.length === 0 ? (
                <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 text-xs text-slate-500 font-medium">
                  Khách mang xe riêng (BYOC)
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2">
                  {booking.vehicles.map((v, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-3 bg-slate-50 border border-slate-100 rounded-xl p-3"
                    >
                      <div className="h-12 w-20 rounded-lg overflow-hidden bg-slate-100 flex-shrink-0 flex items-center justify-center border border-slate-200">
                        {v.coverImageUrl ? (
                          <img
                            src={sanitizeImageUrl(v.coverImageUrl ?? undefined) ?? undefined}
                            alt={v.catalogName || "Xe thuê"}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <Wrench className="h-5 w-5 text-slate-400" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-xs text-slate-900 truncate">
                          {v.catalogName || "Xe thuê"}
                        </p>
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          {v.tier
                            ? v.tier === "STANDARD"
                              ? "Tiêu Chuẩn"
                              : v.tier === "PREMIUM"
                                ? "Cao Cấp"
                                : "Giới Hạn"
                            : "Tiêu Chuẩn"}
                          {v.color ? ` • ${v.color}` : ""}
                          {v.identifier ? ` • #${v.identifier}` : ""}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* F&B Orders (if any) */}
            {fnbOrders.length > 0 && (
              <div className="space-y-2.5">
                <div className="flex items-center gap-2">
                  <UtensilsCrossed className="h-4 w-4 text-orange-500" />
                  <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                    Đồ ăn & Thức uống ({fnbOrders.reduce((sum, o) => sum + o.items.reduce((itemSum, i) => itemSum + i.quantity, 0), 0)} món)
                  </p>
                </div>
                <div className="space-y-2">
                  {fnbOrders.map((order, orderIdx) => (
                    <div
                      key={order.id || orderIdx}
                      className="border border-slate-100 rounded-xl overflow-hidden bg-slate-50/50"
                    >
                      <div className="bg-slate-100/70 px-3 py-1.5 flex items-center justify-between text-[11px] font-semibold text-slate-700">
                        <span>{order.orderType === "PRE_ORDER" ? "Đặt trước cùng lịch" : "Gọi thêm tại quầy"}</span>
                        {order.status && (
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${FNB_STATUS_LABELS[order.status]?.className ?? "bg-slate-200 text-slate-700"}`}
                          >
                            {FNB_STATUS_LABELS[order.status]?.label ?? order.status}
                          </span>
                        )}
                      </div>
                      <div className="divide-y divide-slate-100">
                        {order.items.map((item, itemIdx) => (
                          <div
                            key={item.id || itemIdx}
                            className="p-2.5 flex items-center justify-between text-xs"
                          >
                            <div className="min-w-0 pr-2">
                              <p className="font-bold text-slate-800 truncate">
                                {item.itemName || "Món F&B"}
                              </p>
                              <p className="text-[10px] text-slate-400">
                                {item.variantName ? `${item.variantName} · ` : ""}
                                {formatCurrency(Number(item.unitPrice))} x {item.quantity}
                              </p>
                            </div>
                            <span className="font-bold text-slate-900 shrink-0 tabular-nums">
                              {formatCurrency(Number(item.subtotal || item.unitPrice * item.quantity))}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Chi tiết thanh toán & Tiền bạc (FINANCIAL BREAKDOWN) */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Receipt className="h-4 w-4 text-emerald-600" />
                <span className="text-sm font-black text-slate-900">Chi tiết thanh toán & Tiền</span>
              </div>

              <div className="border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden text-xs">
                {/* Trạng thái thanh toán ban đầu */}
                <div className="bg-slate-50 px-3.5 py-2.5 border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold">
                    {booking.status === "PENDING" ? (
                      <Clock className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                    ) : booking.status === "CANCELLED" && !initialPaymentWasSuccessful ? (
                      <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                    )}
                    <span
                      className={
                        booking.status === "PENDING"
                          ? "text-amber-700"
                          : booking.status === "CANCELLED" && !initialPaymentWasSuccessful
                            ? "text-red-700"
                            : "text-emerald-700"
                      }
                    >
                      {booking.status === "PENDING"
                        ? "Chờ thanh toán đặt lịch"
                        : booking.status === "CANCELLED" && !initialPaymentWasSuccessful
                          ? "Đã hủy trước khi thanh toán"
                          : `Đã thanh toán qua ${gatewayLabel(initialPaymentGateway)}`}
                    </span>
                  </div>
                </div>

                {/* Danh mục chi phí ban đầu */}
                <div className="p-3.5 space-y-2">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                    Dịch vụ đặt trước
                  </div>
                  {prepaidLines.map((line) => (
                    <div key={line.componentId} className="flex items-center justify-between text-slate-700">
                      <span>{line.label}</span>
                      <span className="font-semibold tabular-nums text-slate-900">
                        {formatCurrency(Number(line.amount))}
                      </span>
                    </div>
                  ))}
                  {prepaidDiscountAmount > 0 && (
                    <div className="flex items-center justify-between text-emerald-600 font-medium">
                      <span className="flex items-center gap-1">
                        <Tag className="h-3 w-3" />
                        Ưu đãi / Giảm giá
                      </span>
                      <span className="font-bold tabular-nums">−{formatCurrency(prepaidDiscountAmount)}</span>
                    </div>
                  )}
                  {pkgUsed?.package_name && (
                    <div className="flex items-center justify-between text-orange-700 bg-orange-50 border border-orange-200 rounded-lg px-2.5 py-1 text-[11px]">
                      <span className="flex items-center gap-1 font-semibold">
                        <Layers className="h-3 w-3 text-orange-500" />
                        Gói áp dụng: {pkgUsed.package_name}
                      </span>
                      {pkgUsed.slots_used != null && (
                        <span className="font-bold">−{pkgUsed.slots_used} lượt</span>
                      )}
                    </div>
                  )}
                  <div className="flex items-center justify-between font-bold border-t border-slate-100 pt-2 text-slate-900">
                    <span>
                      {booking.status === "PENDING"
                        ? "Tổng tiền cần trả đặt lịch"
                        : "Đã thanh toán khi đặt"}
                    </span>
                    <span className="tabular-nums">
                      {formatCurrency(
                        booking.status === "PENDING" ? prepaidServiceAmount : prepaidPaidAmount,
                      )}
                    </span>
                  </div>
                </div>

                {/* Phí phát sinh tại quầy nếu có */}
                {additionalLines.length > 0 && (
                  <div className="border-t border-slate-100 p-3.5 space-y-2 bg-slate-50/50">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                      Phí phát sinh tại quầy
                    </div>
                    {additionalLines.map((line) => {
                      const isPaid =
                        line.status === "DISBURSED" ||
                        line.status === "CAPTURED" ||
                        line.status === "HELD"
                      return (
                        <div key={line.componentId} className="flex items-start justify-between gap-2">
                          <div>
                            <span className="text-slate-700 font-medium">{line.label}</span>
                            <p
                              className={`text-[10px] font-semibold ${isPaid ? "text-emerald-600" : "text-amber-700"}`}
                            >
                              {isPaid
                                ? `✓ Đã thanh toán${line.payment?.gateway ? ` (${gatewayLabel(line.payment.gateway)})` : ""}`
                                : "⏳ Chờ thu tiền"}
                            </p>
                          </div>
                          <span className="font-bold text-orange-600 tabular-nums shrink-0">
                            +{formatCurrency(Number(line.amount))}
                          </span>
                        </div>
                      )
                    })}
                    <div className="flex items-center justify-between font-bold border-t border-slate-100 pt-2 text-slate-900">
                      <span>Tổng phí phát sinh</span>
                      <span className="text-orange-600 tabular-nums">
                        +{formatCurrency(additionalTotal)}
                      </span>
                    </div>
                  </div>
                )}

                {/* Tổng kết tiền bạc */}
                <div className="border-t border-slate-200 bg-slate-100/90 p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800 text-xs">Tổng đã thanh toán</span>
                    <span className="text-sm font-black text-emerald-700 tabular-nums">
                      {formatCurrency(totalPaidAmount)}
                    </span>
                  </div>
                  {totalRefundedAmount > 0 && (
                    <>
                      <div className="flex items-center justify-between text-xs text-slate-600">
                        <span>Tiền đã hoàn lại:</span>
                        <span className="font-semibold text-emerald-700 tabular-nums">
                          −{formatCurrency(totalRefundedAmount)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-slate-900 border-t border-slate-200/80 pt-1.5 font-bold">
                        <span>Thực thu (Doanh thu giữ lại):</span>
                        <span className="font-black text-slate-900 tabular-nums">
                          {formatCurrency(netPaidAmount)}
                        </span>
                      </div>
                    </>
                  )}
                  {outstandingAmount > 0 && (
                    <div className="flex items-center justify-between text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                      <span className="font-bold flex items-center gap-1">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                        Còn phải thanh toán:
                      </span>
                      <span className="font-black text-amber-900 tabular-nums">
                        {formatCurrency(outstandingAmount)}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Thông tin hoàn tiền nếu có */}
              {(totalRefundedAmount > 0 || refundComponents.length > 0) && (
                <div className="border border-emerald-200 bg-emerald-50/50 rounded-xl p-3.5 space-y-2 text-xs">
                  <div className="flex items-center gap-1.5 font-bold text-emerald-900">
                    <RotateCcw className="h-3.5 w-3.5 text-emerald-600" />
                    <span>Thông tin hoàn tiền</span>
                  </div>
                  <div className="space-y-1 text-slate-600">
                    {refundComponents.map((c) => (
                      <div key={c.id} className="flex items-center justify-between">
                        <span>
                          {c.type === "SLOT_FEE"
                            ? "Hoàn phí lịch sân"
                            : c.type === "RENTAL_FEE"
                              ? "Hoàn phí thuê xe"
                              : c.type === "FNB_PREORDER" || c.type === "FB_PREORDER"
                                ? "Hoàn cọc F&B"
                                : "Khoản hoàn khác"}
                        </span>
                        <span className="font-semibold text-emerald-700 tabular-nums">
                          {formatCurrency(Number(c.refundedAmount || c.amount || 0))}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between font-bold border-t border-emerald-200/80 pt-1.5 text-emerald-900">
                    <span>Tổng tiền hoàn</span>
                    <span className="font-black tabular-nums">{formatCurrency(totalRefundedAmount)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Session info */}
            {booking.session && (
              <div className="rounded-xl bg-slate-50 border border-slate-100 p-3.5 text-xs space-y-2">
                <p className="font-semibold text-slate-700 text-[11px] uppercase tracking-wide">
                  Ca chơi đang diễn ra
                </p>
                <div className="flex items-center justify-between text-slate-500">
                  <span>Trạng thái</span>
                  <span className="font-bold text-slate-800">
                    {(() => {
                      switch (booking.session.status) {
                        case "ACTIVE":
                          return "Đang chơi"
                        case "EXTENDING":
                          return `Đang gia hạn (${booking.session.proposedExtensionMinutes || 15} phút)`
                        case "CHECKING_OUT":
                          return "Chờ trả xe"
                        case "COMPLETED":
                          return "Hoàn thành"
                        case "CANCELLED":
                          return "Đã hủy"
                        default:
                          return booking.session.status
                      }
                    })()}
                  </span>
                </div>
                {booking.session.actualStartAt && (
                  <div className="flex items-center justify-between text-slate-500">
                    <span>Bắt đầu thực tế</span>
                    <span className="font-medium text-slate-700">
                      {new Date(booking.session.actualStartAt).toLocaleTimeString("vi-VN", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                )}
                {booking.session.status === "ACTIVE" && (
                  <div className="flex items-center justify-between text-slate-500">
                    <span>Thời lượng chơi còn lại</span>
                    <SessionTimer
                      plannedEndAt={booking.session.plannedEndAt}
                      actualStartAt={booking.session.actualStartAt}
                      status={booking.session.status}
                    />
                  </div>
                )}
                {booking.session.actualEndAt && (
                  <div className="flex items-center justify-between text-slate-500">
                    <span>Kết thúc thực tế</span>
                    <span className="font-medium text-slate-700">
                      {new Date(booking.session.actualEndAt).toLocaleTimeString("vi-VN", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Damage breakdown */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Wrench className="h-4 w-4 text-orange-500" />
                <span className="text-sm font-black text-slate-900">Đền bù hư hỏng</span>
                {damage && (() => {
                  const s = DAMAGE_STATUS_LABELS[damage.status] ?? DAMAGE_STATUS_LABELS.PENDING
                  return (
                    <span
                      className={`ml-auto inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${s.className}`}
                    >
                      {s.label}
                    </span>
                  )
                })()}
              </div>

              {!damage ? (
                <div className="rounded-xl bg-slate-50 border border-slate-100 p-4 text-center">
                  <p className="text-xs text-slate-400">Không có hư hỏng xe trong lần thuê này.</p>
                </div>
              ) : damage.lineItems.length === 0 ? (
                <p className="text-xs text-slate-400">Chưa có hạng mục hư hỏng nào được ghi nhận.</p>
              ) : (
                <div className="border border-slate-100 rounded-xl overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50">
                      <tr className="text-left text-slate-500 font-semibold">
                        <th className="py-2 px-3">Hạng mục</th>
                        <th className="py-2 px-3 text-right">Linh kiện</th>
                        <th className="py-2 px-3 text-right">Công</th>
                        <th className="py-2 px-3 text-right">Thành tiền</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {damage.lineItems.map((item) => (
                        <tr key={item.id}>
                          <td className="py-2 px-3 font-medium text-slate-800">
                            {PART_TYPE_LABELS[item.partType] ?? item.partType}
                            {item.customPartName && (
                              <span className="block text-[10px] text-slate-400">
                                {item.customPartName}
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-right text-slate-600">
                            {item.partsPrice.toLocaleString("vi-VN")}đ
                          </td>
                          <td className="py-2 px-3 text-right text-slate-600">
                            {item.laborPrice.toLocaleString("vi-VN")}đ
                          </td>
                          <td className="py-2 px-3 text-right font-bold text-slate-800">
                            {item.subtotal.toLocaleString("vi-VN")}đ
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-orange-50 border-t border-orange-100">
                      <tr>
                        <td colSpan={3} className="py-2.5 px-3 font-black text-slate-900 text-xs">
                          Tổng đền bù
                        </td>
                        <td className="py-2.5 px-3 text-right font-black text-orange-700">
                          {damage.totalDamageCharge.toLocaleString("vi-VN")}đ
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

type BookingPeriodPreset = "TODAY" | "YESTERDAY" | "TOMORROW" | "LAST_7_DAYS" | "ALL_TIME" | "CUSTOM"

const DATE_TIME_ZONE = "Asia/Ho_Chi_Minh"

function getVietnamToday() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: DATE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date())
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${value.year}-${value.month}-${value.day}`
}

function shiftCalendarDate(date: string, offset: number) {
  const shifted = new Date(`${date}T12:00:00Z`)
  shifted.setUTCDate(shifted.getUTCDate() + offset)
  return shifted.toISOString().slice(0, 10)
}

const today = getVietnamToday()

const BOOKING_STATUS_FILTERS: Array<{ value: BookingStatus | "ALL"; label: string }> = [
  { value: "ALL", label: "Tất cả" },
  { value: "PENDING", label: "Chờ thanh toán" },
  { value: "CONFIRMED", label: "Đã xác nhận" },
  { value: "AWAITING_PAYMENT", label: "Chờ thanh toán thêm" },
  { value: "COMPLETED", label: "Hoàn thành" },
  { value: "NO_SHOW", label: "Không đến" },
  { value: "CANCELLED", label: "Đã hủy" },
]

const BOOKING_PERIOD_OPTIONS: Array<{ value: BookingPeriodPreset; label: string }> = [
  { value: "TODAY", label: "Hôm nay" },
  { value: "YESTERDAY", label: "Hôm qua" },
  { value: "TOMORROW", label: "Ngày mai" },
  { value: "LAST_7_DAYS", label: "7 ngày gần đây" },
  { value: "ALL_TIME", label: "Tất cả lịch sử" },
  { value: "CUSTOM", label: "Chọn khoảng ngày" },
]

interface BookingPeriodParams {
  date?: string
  from?: string
  to?: string
  label: string
}

function getBookingPeriodParams(
  period: BookingPeriodPreset,
  customFrom: string,
  customTo: string,
): BookingPeriodParams {
  switch (period) {
    case "YESTERDAY":
      return { date: shiftCalendarDate(today, -1), label: "hôm qua" }
    case "TOMORROW":
      return { date: shiftCalendarDate(today, 1), label: "ngày mai" }
    case "LAST_7_DAYS":
      return { from: shiftCalendarDate(today, -6), to: today, label: "7 ngày gần đây" }
    case "ALL_TIME":
      return { label: "tất cả lịch sử" }
    case "CUSTOM":
      return { from: customFrom, to: customTo, label: "khoảng ngày đã chọn" }
    default:
      return { date: today, label: "hôm nay" }
  }
}

function CancelDialog({
  booking,
  onConfirm,
  onCancel,
  isPending,
}: {
  booking: CafeBookingListItem
  onConfirm: (reason: string) => void
  onCancel: () => void
  isPending: boolean
}) {
  const [reason, setReason] = useState("")
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl p-6 space-y-5">
        <div className="h-12 w-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <div className="space-y-1">
          <h3 className="text-lg font-black text-slate-950">Xác nhận hủy đặt lịch?</h3>
          <p className="text-xs text-slate-500">
            Mã đặt lịch: <span className="font-bold text-slate-700">#{booking.id.substring(0, 8).toUpperCase()}</span>
            {" · "}
            {formatTime(booking.slotStart)} – {formatTime(booking.slotEnd)}
          </p>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-700">Lý do hủy (tùy chọn)</label>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Nhập lý do..."
            className="text-sm"
          />
        </div>
        <div className="flex items-center gap-3 justify-end">
          <Button variant="outline" className="font-bold text-xs h-10 rounded-xl" onClick={onCancel}>
            Không, giữ lịch
          </Button>
          <Button
            className="bg-red-600 hover:bg-red-700 text-white font-bold text-xs h-10 rounded-xl"
            onClick={() => onConfirm(reason)}
            disabled={isPending}
          >
            {isPending ? "Đang hủy..." : "Xác nhận hủy"}
          </Button>
        </div>
      </div>
    </div>
  )
}

function SessionTimer({ plannedEndAt, status }: { plannedEndAt: string; actualStartAt?: string; status: string }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (status !== 'ACTIVE') return
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [status])

  if (status !== 'ACTIVE') {
    return (
      <span className="text-slate-700 font-mono font-medium">
        {status === 'EXTENDING' ? 'Gia hạn' : 'Chờ xác nhận'}
      </span>
    )
  }

  const end = new Date(plannedEndAt).getTime()
  const diff = end - now
  const isOverdue = diff < 0
  const absDiff = Math.abs(diff)

  const hrs = Math.floor(absDiff / 3600000)
  const mins = Math.floor((absDiff % 3600000) / 60000)
  const secs = Math.floor((absDiff % 60000) / 1000)

  const format = (n: number) => String(n).padStart(2, "0")
  const timeFormatted = `${format(hrs)}:${format(mins)}:${format(secs)}`
  const displayStr = isOverdue ? `Quá giờ: ${timeFormatted}` : timeFormatted

  return (
    <span className={isOverdue ? "text-red-500 font-bold" : "text-slate-700 font-mono font-medium"}>
      {displayStr}
    </span>
  )
}

export function ProviderBookingsPage() {
  const [selectedCafeId, setSelectedCafeId] = useState<string>("")
  const [cancelTarget, setCancelTarget] = useState<CafeBookingListItem | null>(null)
  const [detailBookingId, setDetailBookingId] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState<BookingStatus | "ALL">("ALL")
  /*
    Mặc định xem TẤT CẢ, không phải hôm nay.

    Chủ sân mở trang này để nắm tình hình cả chuỗi, không phải để trực quầy —
    việc trực từng ca là của màn hình nhân viên. Lọc sẵn theo hôm nay khiến
    trang trắng trơn vào bất kỳ ngày nào không có đơn, và ba ô thống kê phía
    trên đều về 0. Nhìn vào không phân biệt được "chưa có đơn nào" với "hệ thống
    hỏng" — thứ mà một danh sách rỗng luôn gợi ý trước.
  */
  const [periodPreset, setPeriodPreset] = useState<BookingPeriodPreset>("ALL_TIME")
  const [customFrom, setCustomFrom] = useState(today)
  const [customTo, setCustomTo] = useState(today)
  const limit = 20

  const { data: cafesData } = useQuery({
    queryKey: cafeQueryKeys.list({ page: 1, limit: 100, scope: "managed" }),
    queryFn: () => cafeApi.listCafes({ page: 1, limit: 100, scope: "managed" }),
  })
  const cafes = cafesData?.data ?? []
  const activeCafeId = selectedCafeId || cafes[0]?.id
  const period = getBookingPeriodParams(periodPreset, customFrom, customTo)

  const { data, isLoading, refetch } = useCafeBookings(activeCafeId, {
    date: period.date,
    from: period.from,
    to: period.to,
    status: statusFilter === "ALL" ? undefined : statusFilter,
    page,
    limit,
  })
  const bookings = data?.data ?? []
  const total = data?.total ?? 0
  const summary = data?.summary

  const cancelMutation = useCancelBooking()
  const pendingPaymentCount = (summary?.pendingPaymentCount ?? 0) + (summary?.awaitingAdditionalPaymentCount ?? 0)

  const handleCancelConfirm = (reason: string) => {
    if (!cancelTarget) return
    cancelMutation.mutate(
      { bookingId: cancelTarget.id, reason: reason || undefined },
      {
        onSuccess: () => {
          setCancelTarget(null)
          toast.success("Đã hủy lịch đặt thành công!")
          void refetch()
        },
        onError: () => {
          toast.error("Không thể hủy đơn. Vui lòng thử lại.")
        },
      },
    )
  }

  return (
    <ProviderShell>
      <ProviderPageHeader
        title="Danh sách đặt lịch"
        description="Theo dõi lịch đặt theo ngày, cơ sở và trạng thái xử lý."
      />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard
          label="Tổng lịch"
          value={summary ? String(summary.totalBookings) : "--"}
          helper={
            summary
              ? `Trong ${period.label}`
              : "Đang tải tổng lịch"
          }
          icon={<CalendarClock />}
          tone="info"
        />
        <MetricCard
          label="Phiên đang diễn ra"
          value={summary ? String(summary.activeSessionCount) : "--"}
          helper={
            summary?.activeSessionCount
              ? `Có trong ${period.label}`
              : `Không có trong ${period.label}`
          }
          icon={<PlayCircle />}
          tone={summary?.activeSessionCount ? "info" : "neutral"}
        />
        <MetricCard
          label="Đơn chờ thanh toán"
          value={summary ? String(pendingPaymentCount) : "--"}
          helper={
            summary
              ? `${summary.pendingPaymentCount} chờ thanh toán lịch · ${summary.awaitingAdditionalPaymentCount} chờ phí phát sinh`
              : "Đang tải trạng thái thanh toán"
          }
          icon={<CreditCard />}
          tone={pendingPaymentCount > 0 ? "warning" : "success"}
        />
      </section>

      <Panel className="mt-4">
        <PanelTitle
          title="Danh sách đặt lịch"
          subtitle="Lọc theo cơ sở, thời gian và trạng thái xử lý."
          action={
            <div className="flex flex-wrap items-center gap-3">
              {cafes.length > 1 && (
                <Select value={activeCafeId} onValueChange={(v) => { setSelectedCafeId(v); setPage(1) }}>
                  <SelectTrigger className="h-9 w-52 text-xs rounded-lg">
                    <SelectValue placeholder="Chọn cơ sở" />
                  </SelectTrigger>
                  <SelectContent>
                    {cafes.map((cafe) => (
                      <SelectItem key={cafe.id} value={cafe.id} className="text-xs">
                        {cafe.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Select
                value={periodPreset}
                onValueChange={(value) => {
                  setPeriodPreset(value as BookingPeriodPreset)
                  setPage(1)
                }}
              >
                <SelectTrigger className="h-9 w-44 rounded-lg text-xs">
                  <SelectValue placeholder="Chọn thời gian" />
                </SelectTrigger>
                <SelectContent>
                  {BOOKING_PERIOD_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value} className="text-xs">
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {periodPreset === "CUSTOM" && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-slate-500">Từ</span>
                  <Input
                    type="date"
                    value={customFrom}
                    max={customTo}
                    aria-label="Từ ngày"
                    onChange={(event) => {
                      setCustomFrom(event.target.value)
                      setPage(1)
                    }}
                    className="h-9 w-36 rounded-lg text-xs"
                  />
                  <span className="text-xs font-medium text-slate-500">đến</span>
                  <Input
                    type="date"
                    value={customTo}
                    min={customFrom}
                    aria-label="Đến ngày"
                    onChange={(event) => {
                      setCustomTo(event.target.value)
                      setPage(1)
                    }}
                    className="h-9 w-36 rounded-lg text-xs"
                  />
                </div>
              )}
              <Select
                value={statusFilter}
                onValueChange={(value) => {
                  setStatusFilter(value as BookingStatus | "ALL")
                  setPage(1)
                }}
              >
                <SelectTrigger className="h-9 w-48 rounded-lg text-xs">
                  <SelectValue placeholder="Tất cả trạng thái" />
                </SelectTrigger>
                <SelectContent>
                  {BOOKING_STATUS_FILTERS.map((filter) => (
                    <SelectItem key={filter.value} value={filter.value} className="text-xs">
                      {filter.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          }
        />

        {isLoading ? (
          <div className="py-12 text-center text-sm text-slate-500">Đang tải...</div>
        ) : bookings.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">
            Không có lịch phù hợp trong {period.label}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-left text-slate-500 font-semibold">
                  <th className="pb-3 pl-1 w-[12%]">Mã</th>
                  <th className="pb-3 w-[26%]">Khách hàng</th>
                  <th className="pb-3 w-[20%]">Thời gian</th>
                  <th className="pb-3 w-[12%]">Chế độ</th>
                  <th className="pb-3 w-[15%]">Trạng thái</th>
                  <th className="pb-3 text-right pr-1 w-[15%]">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {bookings.map((booking) => {
                  const canCancel = (booking.status === "CONFIRMED" || booking.status === "PENDING") && !booking.sessionStatus
                  return (
                    <tr key={booking.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-3 pl-1 font-mono font-bold text-slate-800">
                        #{booking.id.substring(0, 8).toUpperCase()}
                      </td>
                      <td className="py-3">
                        <p className="font-semibold text-slate-800">{booking.customerName}</p>
                        {booking.customerPhone && (
                          <p className="text-[10px] text-slate-400">{booking.customerPhone}</p>
                        )}
                      </td>
                      <td className="py-3 text-slate-700">
                        <div className="font-semibold text-slate-800">
                          {formatTime(booking.slotStart)} – {formatTime(booking.slotEnd)}
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5 font-medium">
                          <Calendar className="h-3 w-3 text-slate-400 shrink-0" />
                          <span>{formatDate(booking.slotStart)}</span>
                        </div>
                      </td>
                      <td className="py-3">
                        <Badge className={`text-[10px] px-1.5 py-0 border-none font-bold ${booking.playMode === "RENTAL" ? "bg-orange-100 text-orange-800" : "bg-blue-100 text-blue-800"}`}>
                          {PLAY_MODE_LABELS[booking.playMode] ?? booking.playMode}
                        </Badge>
                      </td>
                      <td className="py-3">
                        {(() => {
                          const shown = getBookingDisplayStatus(
                            booking.status,
                            booking.sessionStatus,
                            booking.sessionPlannedEndAt,
                          )
                          return (
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${shown.className}${shown.pulse ? " animate-pulse" : ""}`}
                            >
                              {shown.label}
                            </span>
                          )
                        })()}
                      </td>
                      <td className="py-3 pr-1 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[10px] font-bold border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg px-2"
                            onClick={() => setDetailBookingId(booking.id)}
                          >
                            Chi tiết
                          </Button>
                          {canCancel && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-[10px] font-bold border-red-200 text-red-600 hover:bg-red-50 rounded-lg px-2"
                              onClick={() => setCancelTarget(booking)}
                            >
                              <XCircle className="h-3 w-3 mr-1" />
                              Hủy
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {total > limit && (
              <div className="flex items-center justify-center gap-3 pt-4 border-t border-slate-100">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-xs text-slate-500">
                  {page} / {Math.ceil(total / limit)}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  disabled={page >= Math.ceil(total / limit)}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        )}
      </Panel>

      {cancelTarget && (
        <CancelDialog
          booking={cancelTarget}
          onConfirm={handleCancelConfirm}
          onCancel={() => setCancelTarget(null)}
          isPending={cancelMutation.isPending}
        />
      )}

      {detailBookingId && (
        <BookingDetailDrawer
          bookingId={detailBookingId}
          onClose={() => setDetailBookingId(null)}
        />
      )}
    </ProviderShell>
  )
}
