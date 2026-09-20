import { useCallback, useEffect, useRef, useState } from "react"
import { env } from "@/shared/lib/env"
import {
  AlertCircle,
  AlertTriangle,
  CalendarClock,
  Camera,
  Car,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Clock3,
  FileText,
  Gamepad2,
  Layers,
  MapPin,
  Navigation,
  QrCode,
  RotateCcw,
  Users,
  UtensilsCrossed,
  XCircle,
  Wrench,
} from "lucide-react"
import { Link, useParams, useSearchParams } from "react-router"
import { Badge } from "@/shared/ui/badge"
import { Button } from "@/shared/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card"
import { Separator } from "@/shared/ui/separator"
import { formatCurrency, formatPaymentGatewayInline } from "@/shared/lib/format"
import { getApiErrorInfo } from "@/shared/lib/utils"
import {
  useBooking,
  useCancelBooking,
} from "@/features/booking/hooks/use-booking"
import { customerSessionApi } from "@/features/customer-session/api/customer-session.api"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import type {
  BookingResponse,
  BookingStatus,
} from "@/features/booking/types/booking.types"
import {
  bankPaymentApi,
  bankPaymentQueryKeys,
} from "@/features/payments/api/bank-payment.api"
import { routePaths } from "@/app/router/route-paths"
import { toast } from "sonner"
import {
  bookingApi,
  bookingQueryKeys,
} from "@/features/booking/api/booking.api"
import { useAuthStore } from "@/features/auth/stores/auth.store"
import { staffApi } from "@/features/staff/api/staff.api"
import { VehicleImage } from "@/shared/ui/vehicle-image"
import { ZoomableInspectionImage } from "@/shared/components/ZoomableInspectionImage"
import { hasExpiredCheckInWindow } from "@/features/booking/lib/check-in-window"
import { getSessionOperationalTiming } from "@/features/booking/lib/session-operational-timing"
import {
  useWebSocket,
  type WsMessage,
} from "@/features/notifications/hooks/useWebSocket"
import { ExtensionAuditCard } from "@/features/customer-session/components/ExtensionAuditCard"

interface ChecklistItemUi {
  checked?: boolean
  status?: string
  label?: string
  itemLabel?: string
  itemKey?: string
  notes?: string
  note?: string
}

const DIRECTION_LABELS: Record<string, string> = {
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
  CHASSIS: "Khung gầm",
  SHELL: "Vỏ nhựa (Shell)",
  SPOILER: "Cánh gió",
  TIRE_WHEEL: "Bánh xe / Lốp",
  MOTOR: "Motor / Động cơ",
  SERVO: "Servo / Tay lái",
  REMOTE: "Remote / Điều khiển",
  OTHER: "Khác",
}

const TIER_LABELS: Record<string, string> = {
  STANDARD: "Tiêu chuẩn",
  PREMIUM: "Cao cấp",
  RESTRICTED: "Đặc biệt",
}

const STATUS_LABELS: Record<
  BookingStatus,
  { label: string; className: string }
> = {
  PENDING: {
    label: "Chờ thanh toán",
    className: "bg-amber-100 text-amber-700",
  },
  CONFIRMED: {
    label: "Đã xác nhận",
    className: "bg-emerald-100 text-emerald-700",
  },
  AWAITING_PAYMENT: {
    label: "Chờ thanh toán phí phát sinh",
    className: "bg-amber-100 text-amber-700",
  },
  NO_SHOW: { label: "Không đến", className: "bg-orange-100 text-orange-700" },
  COMPLETED: {
    label: "Hoàn thành",
    className: "bg-indigo-100 text-indigo-700",
  },
  CANCELLED: { label: "Đã hủy", className: "bg-red-100 text-red-700" },
}

function estimateRefund(booking: BookingResponse): {
  slotFee: number
  rentalFee: number
  fnbFee: number
  total: number
  policy: string
} {
  const hoursUntilSlot =
    (new Date(booking.slotStart).getTime() - Date.now()) / 3_600_000
  const slotFeeComponent = booking.payment_components.find(
    (c) => c.type === "SLOT_FEE",
  )
  const slotFee = Number(slotFeeComponent?.amount ?? 0)
  const rentalFee = booking.payment_components
    .filter((c) => c.type === "RENTAL_FEE")
    .reduce((sum, c) => sum + Number(c.amount), 0)
  const fnbFee = booking.payment_components
    .filter((c) => c.type === "FNB_PREORDER" || c.type === "FB_PREORDER")
    .reduce((sum, c) => sum + Number(c.amount), 0)
  const servedFnb = (booking.fnb_orders ?? [])
    .filter(
      (order) =>
        order.orderType === "PRE_ORDER" && order.status === "DELIVERED",
    )
    .reduce((sum, order) => sum + Number(order.totalAmount ?? 0), 0)

  // The backend applies promotions only to the slot + rental subtotal. Mirror
  // that allocation for the preview; the server remains authoritative on save.
  const discountedSubtotal = slotFee + rentalFee
  const discount = Math.min(
    Math.max(0, Number(booking.discountAmount ?? 0)),
    discountedSubtotal,
  )
  const slotDiscount =
    discountedSubtotal > 0
      ? Math.round((discount * slotFee) / discountedSubtotal)
      : 0
  const netSlotFee = Math.max(0, slotFee - slotDiscount)
  const netRentalFee = Math.max(0, rentalFee - (discount - slotDiscount))
  const refundableFnbFee = Math.max(0, fnbFee - servedFnb)

  let slotFeeRefund: number
  let policy: string
  if (hoursUntilSlot > 24) {
    slotFeeRefund = netSlotFee
    policy = "Hoàn 100% phí lịch (hủy trước 24h)"
  } else if (hoursUntilSlot >= 12) {
    slotFeeRefund = Math.round(netSlotFee * 0.5)
    policy = "Hoàn 50% phí lịch (hủy trong 12–24h)"
  } else {
    slotFeeRefund = 0
    policy = "Không hoàn phí lịch (hủy dưới 12h)"
  }
  return {
    slotFee: slotFeeRefund,
    rentalFee: netRentalFee,
    fnbFee: refundableFnbFee,
    total: slotFeeRefund + netRentalFee + refundableFnbFee,
    policy,
  }
}

function CancelDialog({
  booking,
  onConfirm,
  onCancel,
  isPending,
}: {
  booking: BookingResponse
  onConfirm: () => void
  onCancel: () => void
  isPending: boolean
}) {
  const isPendingHold = booking.status === "PENDING"
  const { data: cancellationQuote, isLoading: isLoadingQuote } = useQuery({
    queryKey: ["booking-cancellation-quote", booking.id],
    queryFn: () => bookingApi.getCancellationQuote(booking.id),
    enabled: !isPendingHold,
    staleTime: 0,
  })
  const estimatedRefund = estimateRefund(booking)
  const refund = cancellationQuote
    ? {
        ...estimatedRefund,
        slotFee: cancellationQuote.refund.slotFeeRefund,
        rentalFee: cancellationQuote.refund.rentalFeeRefund,
        fnbFee: cancellationQuote.refund.fnbRefund,
        total: cancellationQuote.refund.totalRefund,
      }
    : estimatedRefund
  const cancellationBlocked = cancellationQuote?.canCancel === false
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95 duration-200">
        <div className="h-12 w-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <div className="space-y-2">
          <h3 className="text-lg font-black text-slate-950">
            {isPendingHold ? "Hủy giữ chỗ?" : "Xác nhận hủy đặt lịch?"}
          </h3>
          <p className="text-xs font-semibold text-slate-500">
            {isPendingHold
              ? "Đơn chưa thanh toán. Vị trí đang giữ sẽ được trả lại ngay và không có khoản tiền nào cần hoàn."
              : cancellationBlocked
                ? cancellationQuote?.reason
                : refund.policy}
          </p>
        </div>
        {!isPendingHold && (
          <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 space-y-1.5 text-xs">
            <div className="flex justify-between text-slate-600">
              <span>Hoàn phí lịch</span>
              <span className="font-mono font-semibold">
                {formatCurrency(refund.slotFee)}
              </span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Hoàn phí thuê xe</span>
              <span className="font-mono font-semibold">
                {formatCurrency(refund.rentalFee)}
              </span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Hoàn đồ ăn & thức uống chưa phục vụ</span>
              <span className="font-mono font-semibold">
                {formatCurrency(refund.fnbFee)}
              </span>
            </div>
            <div className="border-t border-dashed border-slate-200 pt-1.5 flex justify-between font-bold text-slate-800">
              <span>
                {isLoadingQuote
                  ? "Đang kiểm tra khoản hoàn"
                  : "Dự kiến hoàn lại"}
              </span>
              <span className="font-mono text-emerald-600">
                {formatCurrency(refund.total)}
              </span>
            </div>
            <p className="text-[10px] text-slate-400">
              * Khoản hoàn do hệ thống kiểm tra theo tiền thực thu và trạng thái
              dịch vụ hiện tại.
            </p>
          </div>
        )}
        <div className="flex items-center gap-3 justify-end pt-1">
          <Button
            variant="outline"
            className="border-slate-200 font-bold h-10 text-xs rounded-xl"
            onClick={onCancel}
          >
            Không, giữ lịch
          </Button>
          <Button
            className="bg-red-600 hover:bg-red-700 text-white font-bold h-10 text-xs rounded-xl"
            onClick={onConfirm}
            disabled={isPending || isLoadingQuote || cancellationBlocked}
          >
            {isPending
              ? "Đang hủy..."
              : isPendingHold
                ? "Có, hủy giữ chỗ"
                : "Có, xác nhận hủy"}
          </Button>
        </div>
      </div>
    </div>
  )
}

export function BookingDetailPage() {
  const params = useParams()
  const [searchParams] = useSearchParams()
  const bookingId = params.bookingId ?? params.id
  const {
    data: booking,
    isLoading,
    error,
    isError,
    refetch: refetchBooking,
  } = useBooking(bookingId)
  const cancelMutation = useCancelBooking()
  const [showCancelDialog, setShowCancelDialog] = useState(false)
  const queryClient = useQueryClient()
  const role = useAuthStore((s) => s.role)
  const [confirmingRefund, setConfirmingRefund] = useState(false)
  const [refundMethod, setRefundMethod] = useState<"CASH" | "BANK_TRANSFER">(
    "CASH",
  )

  const backUrl =
    role === "staff"
      ? "/staff/today-bookings"
      : role === "provider"
        ? "/provider/bookings"
        : role === "admin"
          ? "/admin/dashboard"
          : "/customer/bookings"

  const handleSettleCash = async () => {
    if (!bookingId) return
    try {
      setSettlingCash(true)
      await staffApi.settlePendingPayments(bookingId)
      toast.success("Đã xác nhận thanh toán tiền mặt thành công")
      void queryClient.invalidateQueries({
        queryKey: bookingQueryKeys.detail(bookingId),
      })
    } catch (err) {
      const axiosError = err as { response?: { data?: { message?: string } } }
      toast.error(
        axiosError.response?.data?.message || "Không thể xác nhận thanh toán",
      )
    } finally {
      setSettlingCash(false)
    }
  }

  const handleConfirmRefund = async () => {
    if (!bookingId) return
    try {
      setConfirmingRefund(true)
      await staffApi.confirmRefund(bookingId, {
        method: refundMethod,
      })
      toast.success("Đã xác nhận hoàn tiền thủ công thành công")
      void queryClient.invalidateQueries({
        queryKey: bookingQueryKeys.detail(bookingId),
      })
    } catch (err) {
      const axiosError = err as { response?: { data?: { message?: string } } }
      toast.error(
        axiosError.response?.data?.message || "Không thể xác nhận hoàn tiền",
      )
    } finally {
      setConfirmingRefund(false)
    }
  }

  const sessionId = booking?.session?.id
  const { data: sessionDetail, refetch: refetchSessionDetail } = useQuery({
    queryKey: ["session-detail", sessionId],
    queryFn: () => customerSessionApi.getSessionDetail(sessionId!),
    enabled: !!sessionId,
    staleTime: 30_000,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      if (!status) return false
      return ["CHECKED_IN", "ACTIVE", "EXTENDING", "CHECKING_OUT"].includes(
        status,
      )
        ? 10_000
        : false
    },
  })

  const refreshBookingState = useCallback(() => {
    void refetchBooking()
    if (sessionId) void refetchSessionDetail()
  }, [refetchBooking, refetchSessionDetail, sessionId])

  const handleRealtimeUpdate = useCallback(
    (message: WsMessage) => {
      const data = message.data as
        | { bookingId?: string; sessionId?: string }
        | undefined
      if (data?.bookingId && data.bookingId !== bookingId) return
      if (data?.sessionId && sessionId && data.sessionId !== sessionId) return

      if (
        [
          "BOOKING_CHECKED_IN",
          "SESSION_UPDATED",
          "SESSION_CHECKIN_INSPECTION",
          "CUSTOMER_CHECKIN_CONFIRMED",
          "CUSTOMER_CHECKOUT_CONFIRMED",
          "SESSION_CHECKOUT_COMPLETED",
          "CUSTOMER_PAYMENT_CONFIRMED",
          "SESSION_CHECKOUT_INSPECTION",
          "SESSION_FNB_ORDER_ADDED",
          "SESSION_FNB_ORDER_UPDATED",
          "FNB_ORDER_SERVED",
          "SESSION_EXTENSION_PROPOSED",
          "SESSION_EXTENSION_UPDATED",
          "CUSTOMER_EXTENSION_APPROVED",
          "CUSTOMER_EXTENSION_REJECTED",
        ].includes(message.event)
      ) {
        refreshBookingState()
      }
    },
    [bookingId, refreshBookingState, sessionId],
  )

  useWebSocket(handleRealtimeUpdate, !!bookingId)

  useEffect(() => {
    const handleSessionDetailRefresh = () => refreshBookingState()
    window.addEventListener(
      "refresh-session-detail",
      handleSessionDetailRefresh,
    )
    return () =>
      window.removeEventListener(
        "refresh-session-detail",
        handleSessionDetailRefresh,
      )
  }, [refreshBookingState])

  useEffect(() => {
    const needsLiveRefresh =
      booking?.status === "AWAITING_PAYMENT" ||
      booking?.status === "CONFIRMED" ||
      ["CHECKED_IN", "ACTIVE", "EXTENDING", "CHECKING_OUT"].includes(
        booking?.session?.status ?? "",
      )
    if (!needsLiveRefresh) return

    const interval = window.setInterval(refreshBookingState, 10_000)
    return () => window.clearInterval(interval)
  }, [booking?.session?.status, booking?.status, refreshBookingState])
  const checkInInspection = sessionDetail?.inspections?.find(
    (ins) => ins.type === "CHECK_IN",
  )
  const checkOutInspection = sessionDetail?.inspections?.find(
    (ins) => ins.type === "CHECK_OUT",
  )
  const checkInPhotos =
    checkInInspection?.photos?.length
      ? checkInInspection.photos
      : (sessionDetail?.inspections
          ?.filter((ins) => ins.type === "CHECK_IN" && ins.photos.length > 0)
          .flatMap((ins) => ins.photos) ?? [])
  const checkOutPhotos =
    checkOutInspection?.photos?.length
      ? checkOutInspection.photos
      : (sessionDetail?.inspections
          ?.filter((ins) => ins.type === "CHECK_OUT" && ins.photos.length > 0)
          .flatMap((ins) => ins.photos) ?? [])
  const checkInChecklist = checkInInspection?.checklist ?? []
  const checkOutChecklist = checkOutInspection?.checklist ?? []
  const checkInStaffNotes = checkInInspection?.staffNotes?.trim() || ""
  const checkOutStaffNotes = checkOutInspection?.staffNotes?.trim() || ""
  type DamageItemRecord = { partType?: string; customPartName?: string | null; partsPrice?: number; laborPrice?: number; lineTotal?: number }
  const checkOutDamageLineItems: DamageItemRecord[] =
    (checkOutInspection as { damageLineItems?: DamageItemRecord[] })?.damageLineItems ??
    (sessionDetail as { checkoutInspection?: { damageLineItems?: DamageItemRecord[] } })?.checkoutInspection?.damageLineItems ??
    (sessionDetail as { damageClaim?: { damageLineItems?: DamageItemRecord[] } })?.damageClaim?.damageLineItems ??
    []
  const checkOutDamageTotal: number =
    Number(
      (checkOutInspection as { totalDamageCharge?: number })?.totalDamageCharge ??
        (sessionDetail as { checkoutInspection?: { totalDamageCharge?: number } })?.checkoutInspection?.totalDamageCharge ??
        (sessionDetail as { damageClaim?: { totalDamageCharge?: number } })?.damageClaim?.totalDamageCharge ??
        0,
    ) ||
    checkOutDamageLineItems.reduce(
      (sum: number, it: DamageItemRecord) =>
        sum + Number(it.partsPrice || 0) + Number(it.laborPrice || 0),
      0,
    )
  const approvedExtensions = sessionDetail?.approvedExtensions ?? []

  const [secondsLeft, setSecondsLeft] = useState(0)
  const [totalDuration, setTotalDuration] = useState(1)
  const [currentTime, setCurrentTime] = useState(() => Date.now())
  // Staff may not have access to the customer-session endpoint. The booking
  // response still carries the authoritative actual start time in that case.
  const actualStartAt =
    sessionDetail?.actualStart ?? booking?.session?.actualStartAt

  useEffect(() => {
    const liveStatus = booking?.session?.status
    const isLive = liveStatus === "ACTIVE" || liveStatus === "EXTENDING"

    const plannedEndStr =
      sessionDetail?.plannedEnd ?? booking?.session?.plannedEndAt
    const actualStartStr = actualStartAt

    if (!isLive || !plannedEndStr) {
      queueMicrotask(() => {
        setSecondsLeft(0)
        setTotalDuration(1)
      })
      return
    }

    const plannedTime = new Date(plannedEndStr).getTime()
    const actualStart = actualStartStr
      ? new Date(actualStartStr).getTime()
      : Date.now()
    const duration = Math.max(1, Math.floor((plannedTime - actualStart) / 1000))
    const tick = () => {
      const now = Date.now()
      setCurrentTime(now)
      setTotalDuration(duration)
      setSecondsLeft(Math.max(0, Math.floor((plannedTime - now) / 1000)))
    }
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [
    actualStartAt,
    sessionDetail,
    booking?.session?.status,
    booking?.session?.plannedEndAt,
  ])

  /**
   * Đồng hồ riêng cho hạn giữ chỗ của đơn chưa thanh toán.
   *
   * Đồng hồ phía trên chỉ chạy khi phiên chơi đang diễn ra — đơn PENDING thì
   * chưa có phiên nào, nên nó thoát sớm và `currentTime` đứng yên ở lúc mở
   * trang. Hệ quả: để trang mở qua giờ hết hạn, nút thanh toán vẫn còn đó và
   * vẫn bấm được, trong khi chỗ đã bị nhả cho người khác.
   *
   * Hết giờ thì hỏi lại máy chủ một lần: nó mới là nơi quyết định đơn chuyển
   * thành gì, giao diện chỉ có nhiệm vụ thôi mời khách trả tiền.
   */
  useEffect(() => {
    if (booking?.status !== "PENDING" || !booking.paymentExpiresAt) return
    const expiresAt = new Date(booking.paymentExpiresAt).getTime()
    if (Date.now() >= expiresAt) return

    const interval = setInterval(() => {
      const now = Date.now()
      setCurrentTime(now)
      if (now >= expiresAt) {
        clearInterval(interval)
        if (bookingId) {
          void queryClient.invalidateQueries({
            queryKey: bookingQueryKeys.detail(bookingId),
          })
        }
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [booking?.status, booking?.paymentExpiresAt, bookingId, queryClient])

  const [payingAdditional, setPayingAdditional] = useState(false)
  const [resumingInitialPayment, setResumingInitialPayment] = useState(false)

  // Chi nhánh có nhận chuyển khoản thẳng không. Chưa cấu hình thì chỉ có VNPay,
  // và khi chỉ có một cách thì không hiện lựa chọn.
  const { data: paymentMethods = ["vnpay" as const] } = useQuery({
    queryKey: bankPaymentQueryKeys.methods(booking?.cafeId),
    queryFn: () => bankPaymentApi.listPaymentMethods(booking!.cafeId),
    enabled: Boolean(booking?.cafeId),
  })
  const canBankTransfer = paymentMethods.includes("bank_transfer")
  const [settlingCash, setSettlingCash] = useState(false)
  const [checkInPhotosOpen, setCheckInPhotosOpen] = useState(false)
  const [checkOutPhotosOpen, setCheckOutPhotosOpen] = useState(false)
  const handoverCardRef = useRef<HTMLDivElement>(null)
  const shouldFocusHandover = searchParams.get("section") === "handover"

  useEffect(() => {
    if (!shouldFocusHandover || checkInPhotos.length === 0) return
    const timer = requestAnimationFrame(() => {
      setCheckInPhotosOpen(true)
      handoverCardRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      })
    })
    return () => cancelAnimationFrame(timer)
  }, [checkInPhotos.length, shouldFocusHandover])

  const operationalTiming = getSessionOperationalTiming(
    sessionDetail?.plannedEnd ?? booking?.session?.plannedEndAt,
    sessionDetail?.status ?? booking?.session?.status,
    currentTime,
  )

  const isByoc = booking?.playMode === "BYOC"
  const currentSessionStatus = sessionDetail?.status ?? booking?.session?.status
  const isCheckoutPending =
    !isByoc &&
    !!currentSessionStatus &&
    ["CHECKED_IN", "ACTIVE", "EXTENDING", "CHECKING_OUT"].includes(
      currentSessionStatus,
    )

  const handlePayAdditionalFees = async () => {
    if (!bookingId) return
    try {
      setPayingAdditional(true)
      const res = await bookingApi.createCheckoutAdditionalPayment(bookingId)
      if (res.payment_url) {
        toast.info("Đang chuyển hướng sang cổng thanh toán VNPAY...")
        window.location.href = res.payment_url
      } else {
        toast.success("Thanh toán thành công (Bypass)")
        void queryClient.invalidateQueries({
          queryKey: bookingQueryKeys.detail(bookingId),
        })
      }
    } catch (err) {
      const axiosError = err as { response?: { data?: { message?: string } } }
      toast.error(
        axiosError.response?.data?.message || "Không thể khởi tạo thanh toán",
      )
    } finally {
      setPayingAdditional(false)
    }
  }

  const handleResumeInitialPayment = async () => {
    if (!bookingId) return
    try {
      setResumingInitialPayment(true)
      const result = await bookingApi.createCheckout(bookingId)
      if (!result.payment_url)
        throw new Error("Không nhận được liên kết thanh toán")
      window.location.href = result.payment_url
    } catch (err) {
      const axiosError = err as { response?: { data?: { message?: string } } }
      toast.error(
        axiosError.response?.data?.message ||
          "Không thể khởi tạo lại thanh toán",
      )
    } finally {
      setResumingInitialPayment(false)
    }
  }

  /**
   * Đường quay lại mã QR chuyển khoản của đơn đang chờ trả tiền.
   *
   * Trỏ sang trang `/payment/bank-transfer/:bookingId` có sẵn chứ không tự dựng
   * lại mã ở đây: trang đó vốn được làm ra đúng cho tình huống này — khách tải
   * lại trang, mở lại link cũ, hay bấm thanh toán lần hai. Backend trả về đúng
   * giao dịch đang chờ nếu còn hiệu lực nên vào lại không sinh mã tham chiếu
   * mới.
   */
  const bankTransferPath = bookingId
    ? routePaths.paymentBankTransfer.replace(":bookingId", bookingId)
    : null

  /**
   * Cùng trang mã QR, nhưng thu khoản phát sinh cuối phiên chứ không phải tiền
   * đặt lịch. Hai khoản mang hai mã tham chiếu khác nhau nên `?mode=settlement`
   * là bắt buộc — thiếu nó thì trang gọi nhầm endpoint đặt lịch và khách quét
   * phải mã của khoản đã trả xong.
   */
  const settlementBankTransferPath = bankTransferPath
    ? `${bankTransferPath}?mode=settlement`
    : null

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

  // Financial totals come from the backend's shared summary. Operational F&B
  // orders and inspection data must not recalculate what the customer owes.
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
      type: component.type,
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
  const rawAdditionalLines =
    financialSummary?.additionalLines ?? fallbackAdditionalLines
  const hasDamageLine = rawAdditionalLines.some(
    (l: { type?: string; label?: string }) =>
      l.type === "DAMAGE_CHARGE" ||
      l.label?.includes("bồi thường") ||
      l.label?.includes("hư hỏng"),
  )
  const additionalLines = [
    ...rawAdditionalLines,
    ...(!hasDamageLine && checkOutDamageTotal > 0
      ? [
          {
            componentId: "checkout-damage-charge",
            type: "DAMAGE_CHARGE" as const,
            label: "Phí bồi thường hư hỏng",
            amount: checkOutDamageTotal,
            status: "PENDING",
            payment: undefined,
          },
        ]
      : []),
  ]
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
    financialSummary?.additionalTotal && hasDamageLine
      ? financialSummary.additionalTotal
      : additionalLines.reduce((sum, line) => sum + Number(line.amount), 0)
  const additionalOutstandingAmount = additionalLines
    .filter((line) => line.status === "PENDING")
    .reduce((sum, line) => sum + Number(line.amount), 0)
  const totalPaidAmount =
    financialSummary?.totalPaidAmount ??
    prepaidPaidAmount +
      Math.max(0, additionalTotal - additionalOutstandingAmount)
  const isPaid =
    financialSummary?.isSettled ?? additionalOutstandingAmount === 0

  const groupedAdditionalLines = (() => {
    const fnbLines = additionalLines.filter(
      (l) => l.type === "FNB_ON_SITE" || l.label.includes("Đồ ăn & thức uống"),
    )
    const otherLines = additionalLines.filter(
      (l) => l.type !== "FNB_ON_SITE" && !l.label.includes("Đồ ăn & thức uống"),
    )

    const paidFnb = fnbLines.filter(
      (l) => l.status === "DISBURSED" || l.status === "CAPTURED",
    )
    const pendingFnb = fnbLines.filter(
      (l) => l.status !== "DISBURSED" && l.status !== "CAPTURED",
    )

    const paidFnbTotal = paidFnb.reduce((sum, l) => sum + Number(l.amount), 0)
    const pendingFnbTotal = pendingFnb.reduce((sum, l) => sum + Number(l.amount), 0)

    const paidGateway = paidFnb.find((l) => l.payment?.gateway)?.payment?.gateway
    const gatewayFormatted = paidGateway ? formatPaymentGatewayInline(paidGateway) : undefined

    const result: Array<{
      id: string
      label: string
      amount: number
      paid: boolean
      gateway?: string
    }> = []

    if (paidFnbTotal > 0 && pendingFnbTotal > 0) {
      result.push({
        id: "fnb-paid-aggregate",
        label: "Đồ ăn & thức uống gọi tại quầy",
        amount: paidFnbTotal,
        paid: true,
        gateway: gatewayFormatted,
      })
      result.push({
        id: "fnb-pending-aggregate",
        label: "Đồ ăn & thức uống gọi tại quầy",
        amount: pendingFnbTotal,
        paid: false,
      })
    } else if (paidFnbTotal > 0) {
      result.push({
        id: "fnb-paid-aggregate",
        label: "Đồ ăn & thức uống gọi tại quầy",
        amount: paidFnbTotal,
        paid: true,
        gateway: gatewayFormatted,
      })
    } else if (pendingFnbTotal > 0) {
      result.push({
        id: "fnb-pending-aggregate",
        label: "Đồ ăn & thức uống gọi tại quầy",
        amount: pendingFnbTotal,
        paid: false,
      })
    }

    for (const line of otherLines) {
      const isPaid = line.status === "DISBURSED" || line.status === "CAPTURED"
      result.push({
        id: line.componentId,
        label: line.label,
        amount: Number(line.amount),
        paid: isPaid,
        gateway: line.payment?.gateway ? formatPaymentGatewayInline(line.payment.gateway) : undefined,
      })
    }

    return result
  })()
  const customerFnbOrders = (() => {
    const list = (
      booking?.fnb_orders?.length
        ? booking.fnb_orders
        : booking?.fnb_order
          ? [booking.fnb_order]
          : []
    ).filter((order) => order.items.length > 0)

    return [...list].sort((a, b) => {
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0
      if (timeA && timeB) return timeA - timeB
      return 0
    })
  })()

  const cancelledFnbOrders = customerFnbOrders.filter(
    (order) => order.status === "CANCELLED",
  )
  const preorderFnbOrders = customerFnbOrders.filter(
    (order) => order.orderType === "PRE_ORDER" && order.status !== "CANCELLED",
  )
  const onsiteFnbOrders = customerFnbOrders.filter(
    (order) => order.orderType === "ON_SITE" && order.status !== "CANCELLED",
  )
  // This supports the merged payload returned by an older server during a
  // rolling deployment. New responses always include one of the two groups above.
  const legacyFnbOrders = customerFnbOrders.filter(
    (order) =>
      order.status !== "CANCELLED" &&
      order.orderType !== "PRE_ORDER" &&
      order.orderType !== "ON_SITE",
  )
  const getFnbGroupTotal = (orders: typeof customerFnbOrders) =>
    orders.reduce(
      (sum, order) =>
        sum +
        (order.totalAmount ??
          order.items.reduce(
            (itemSum, item) => itemSum + Number(item.subtotal),
            0,
          )),
      0,
    )
  const onsiteFnbComponents = (booking?.payment_components ?? []).filter(
    (component) => component.type === "FNB_ON_SITE",
  )
  const pendingOnsiteFnbAmount = onsiteFnbComponents
    .filter((c) => c.status === "PENDING")
    .reduce((sum, c) => sum + Number(c.amount), 0)
  const paidOnsiteFnbAmount = onsiteFnbComponents
    .filter(
      (c) =>
        c.status === "DISBURSED" ||
        c.status === "HELD" ||
        c.status === "CAPTURED",
    )
    .reduce((sum, c) => sum + Number(c.amount), 0)

  const isOnsiteFnbAllPaid =
    onsiteFnbOrders.length > 0 &&
    pendingOnsiteFnbAmount === 0 &&
    paidOnsiteFnbAmount > 0
  const isOnsiteFnbPartiallyPaid =
    pendingOnsiteFnbAmount > 0 && paidOnsiteFnbAmount > 0
  const preorderFnbPaid = initialPaymentWasSuccessful

  // Map each onsite order to whether it is paid or pending
  const onsiteOrderPaidMap = (() => {
    const map = new Map<string, boolean>()
    if (onsiteFnbOrders.length === 0) return map

    if (pendingOnsiteFnbAmount === 0) {
      onsiteFnbOrders.forEach((o) => map.set(o.id, true))
      return map
    }
    if (paidOnsiteFnbAmount === 0) {
      onsiteFnbOrders.forEach((o) => map.set(o.id, false))
      return map
    }

    // Check if there is an exact single order whose amount matches pendingOnsiteFnbAmount
    const exactPendingMatch = onsiteFnbOrders.find(
      (o) =>
        Number(
          o.totalAmount ??
            o.items.reduce((s, it) => s + Number(it.subtotal || 0), 0),
        ) === pendingOnsiteFnbAmount,
    )
    if (exactPendingMatch) {
      onsiteFnbOrders.forEach((o) => {
        map.set(o.id, o.id !== exactPendingMatch.id)
      })
      return map
    }

    // General case: The newly added orders at the end of the session are pending
    let remainingPending = pendingOnsiteFnbAmount
    const reversed = [...onsiteFnbOrders].reverse()
    for (const order of reversed) {
      const orderTotal = Number(
        order.totalAmount ??
          order.items.reduce((s, it) => s + Number(it.subtotal || 0), 0),
      )
      if (remainingPending >= orderTotal && orderTotal > 0) {
        map.set(order.id, false)
        remainingPending -= orderTotal
      } else {
        map.set(order.id, true)
      }
    }
    return map
  })()

  const renderFnbGroup = (
    orders: typeof customerFnbOrders,
    options: {
      title: string
      description: string
      paymentLabel: string
      className: string
      badgeClassName: string
      paidAmount?: number
      pendingAmount?: number
      isPreorder?: boolean
    },
  ) => {
    if (orders.length === 0) return null

    const groupTotal = getFnbGroupTotal(orders)

    return (
      <section
        className={`rounded-xl border p-4 space-y-3 ${options.className}`}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              {options.title}
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              {options.description}
            </p>
          </div>
          <Badge className={`border-0 ${options.badgeClassName}`}>
            {options.paymentLabel}
          </Badge>
        </div>
        <div className="space-y-2.5">
          {orders
            .flatMap((order) =>
              order.items.map((item) => ({ orderId: order.id, item })),
            )
            .map(({ orderId, item }) => {
              const itemSubtotal = Number(item.subtotal)
              const isItemPaid = options.isPreorder
                ? preorderFnbPaid
                : onsiteOrderPaidMap.get(orderId) ?? true

              return (
                <div
                  key={`${orderId}-${item.id}`}
                  className="flex items-start justify-between gap-4 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-slate-900">
                        {item.itemName ?? "Sản phẩm"}
                        {item.variantName && (
                          <span className="text-slate-500">
                            {" "}
                            · {item.variantName}
                          </span>
                        )}
                      </p>
                      {!options.isPreorder && (
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                            isItemPaid
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-amber-100 text-amber-800 border border-amber-300"
                          }`}
                        >
                          {isItemPaid ? "Đã thanh toán" : "Chờ thanh toán"}
                        </span>
                      )}
                    </div>
                    {item.notes && (
                      <p className="mt-1 text-xs text-slate-600">
                        <span className="font-semibold text-slate-700">
                          Ghi chú:
                        </span>{" "}
                        {item.notes}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs text-slate-500">
                      ×{item.quantity} · {formatCurrency(Number(item.unitPrice))}
                    </p>
                    <p className="font-semibold text-slate-900">
                      {formatCurrency(itemSubtotal)}
                    </p>
                  </div>
                </div>
              )
            })}
        </div>
        <div className="space-y-1 border-t border-current/10 pt-3 text-xs text-slate-600">
          {options.pendingAmount !== undefined && options.pendingAmount > 0 && (
            <>
              {options.paidAmount !== undefined && options.paidAmount > 0 && (
                <div className="flex justify-between font-medium text-emerald-700">
                  <span>Đã thanh toán</span>
                  <span>{formatCurrency(options.paidAmount)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-amber-700">
                <span>Còn chờ thanh toán</span>
                <span>{formatCurrency(options.pendingAmount)}</span>
              </div>
            </>
          )}
          <div className="flex justify-between pt-1 text-sm font-semibold text-slate-800">
            <span>Tổng cộng</span>
            <span>{formatCurrency(groupTotal)}</span>
          </div>
        </div>
      </section>
    )
  }
  const gatewayLabel = (gateway?: string | null) => formatPaymentGatewayInline(gateway)

  const refundComponents =
    booking?.payment_components?.filter(
      (c) => c.status === "PENDING_REFUND" || c.status === "REFUNDED",
    ) || []
  const hasRefund = refundComponents.length > 0
  const isRefundPending = refundComponents.some(
    (c) => c.status === "PENDING_REFUND",
  )
  const totalRefundAmount = refundComponents.reduce(
    (sum, c) => sum + Number(c.refundedAmount ?? 0),
    0,
  )

  const refundSlotFee = refundComponents
    .filter((c) => c.type === "SLOT_FEE")
    .reduce((sum, c) => sum + Number(c.refundedAmount ?? 0), 0)
  const refundRentalFee = refundComponents
    .filter((c) => c.type === "RENTAL_FEE")
    .reduce((sum, c) => sum + Number(c.refundedAmount ?? 0), 0)
  const refundFnb = refundComponents
    .filter((c) => c.type === "FNB_PREORDER" || c.type === "FB_PREORDER")
    .reduce((sum, c) => sum + Number(c.refundedAmount ?? 0), 0)

  const checkInWindowExpired = booking
    ? hasExpiredCheckInWindow(booking)
    : false
  const effectiveBookingStatus: BookingStatus | undefined = checkInWindowExpired
    ? "NO_SHOW"
    : booking?.status

  const isActiveSession =
    !!booking?.session &&
    ["ACTIVE", "EXTENDING", "CHECKED_IN", "CHECKING_OUT"].includes(
      booking.session!.status,
    ) &&
    !checkInWindowExpired &&
    !["COMPLETED", "CANCELLED", "NO_SHOW"].includes(booking!.status)

  const statusInfo = effectiveBookingStatus
    ? (STATUS_LABELS[effectiveBookingStatus] ?? STATUS_LABELS.PENDING)
    : null
  const isTerminalBookingStatus = [
    "COMPLETED",
    "CANCELLED",
    "NO_SHOW",
  ].includes(booking?.status ?? "")

  const sessionBadgeOverride =
    booking?.session && !checkInWindowExpired && !isTerminalBookingStatus
      ? (() => {
          switch (booking.session.status) {
            case "CHECKED_IN":
              return {
                label: "Đang check-in",
                className: "bg-amber-100 text-amber-700",
              }
            case "ACTIVE":
              return {
                label: "Đang chơi",
                className: "bg-orange-100 text-orange-700",
              }
            case "EXTENDING":
              return {
                label: "Đang gia hạn",
                className: "bg-orange-100 text-orange-700",
              }
            case "CHECKING_OUT":
              return {
                label: "Đang checkout",
                className: "bg-blue-100 text-blue-700",
              }
            default:
              return null
          }
        })()
      : null

  const displayStatusInfo = sessionBadgeOverride ?? statusInfo

  const handleCancelConfirm = () => {
    if (!booking) return
    cancelMutation.mutate(
      { bookingId: booking.id },
      {
        onSuccess: () => {
          setShowCancelDialog(false)
          toast.success("Đã hủy đơn đặt lịch")
        },
        onError: (error) => {
          const { code, message } = getApiErrorInfo(error)
          if (code === "BOOKING_NOT_CANCELLABLE") {
            setShowCancelDialog(false)
            toast.info("Giữ chỗ không còn hiệu lực hoặc đơn đã được hủy.")
            return
          }
          toast.error(message || "Không thể hủy đơn. Vui lòng thử lại.")
        },
      },
    )
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Đang tải...</p>
      </div>
    )
  }

  if (isError || !booking) {
    const errMsg =
      (error as { response?: { data?: { message?: string } } })?.response?.data
        ?.message ||
      (error as Error)?.message ||
      "Không tìm thấy dữ liệu hoặc không có quyền truy cập."
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <div className="text-center space-y-2">
          <p className="text-red-500 font-bold">Không tìm thấy đơn đặt lịch</p>
          <p className="text-xs text-slate-500 font-mono">
            ID: {bookingId ?? "Không có ID"}
          </p>
          <p className="text-xs text-red-500 bg-red-50 px-4 py-2.5 rounded-xl border border-red-100 max-w-md mx-auto">
            Chi tiết lỗi: {errMsg}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to={backUrl}>Quay lại</Link>
        </Button>
      </div>
    )
  }

  const slotStart = new Date(booking.slotStart)
  const slotEnd = new Date(booking.slotEnd)
  const slotLabel = `${formatTime(slotStart)} - ${formatTime(slotEnd)}, ${formatDate(slotStart)}`
  const paymentExpiry = booking.paymentExpiresAt
    ? new Date(booking.paymentExpiresAt)
    : null
  const paymentHoldIsActive =
    booking.status === "PENDING" &&
    (!paymentExpiry || paymentExpiry.getTime() > currentTime)
  const isCancelledBeforePayment =
    booking.status === "CANCELLED" && !initialPaymentWasSuccessful
  const isHistoricalNonFulfilledBooking =
    booking.status === "CANCELLED" || booking.status === "NO_SHOW"
  const canCancelBooking = role === "customer" || role === "provider"
  const playerCount = booking.participants.length || 1

  const percentage = Math.min(
    100,
    Math.max(0, (secondsLeft / totalDuration) * 100),
  )
  const strokeDashoffset = 283 - (283 * percentage) / 100

  return (
    <div className="min-h-screen bg-muted/30 px-4 py-6 md:px-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="text-sm text-muted-foreground">
          <Link to={backUrl} className="hover:text-foreground">
            Quay lại danh sách
          </Link>
          <span className="mx-2">/</span>
          <span>Đơn đặt #{booking.id.substring(0, 8).toUpperCase()}</span>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
          <main className="space-y-4">
            {booking.session &&
              !checkInWindowExpired &&
              ["ACTIVE", "CHECKED_IN", "EXTENDING", "CHECKING_OUT"].includes(
                booking.session.status,
              ) &&
              !["COMPLETED", "CANCELLED", "NO_SHOW"].includes(booking.status) &&
              (booking.session.status === "ACTIVE" ||
              booking.session.status === "EXTENDING" ? (
                <Card className="rounded-xl shadow-sm overflow-hidden border-orange-100">
                  <div className="h-1 bg-gradient-to-r from-orange-500 to-orange-600" />
                  <CardContent className="p-5">
                    <div className="flex flex-col sm:flex-row items-center gap-5">
                      {/* Circular Countdown */}
                      <div className="relative h-36 w-36 flex-shrink-0 flex items-center justify-center">
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
                        <div className="absolute flex flex-col items-center justify-center space-y-0.5">
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                            {operationalTiming.state === "ON_TIME"
                              ? "CÒN LẠI"
                              : operationalTiming.state === "OVERDUE"
                                ? "QUÁ GIỜ"
                                : isByoc
                                  ? "HẾT GIỜ"
                                  : "ĐẾN GIỜ TRẢ XE"}
                          </span>
                          <span className="text-2xl font-black text-slate-950 tracking-tight tabular-nums">
                            {operationalTiming.state === "ON_TIME"
                              ? formatCountdown(secondsLeft)
                              : operationalTiming.state === "OVERDUE"
                                ? `+${operationalTiming.minutesPastPlannedEnd}p`
                                : isByoc
                                  ? "Hết ca"
                                  : "Trả xe"}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 text-[9px] font-black ${operationalTiming.state === "OVERDUE" ? "text-red-600" : operationalTiming.state === "DUE_FOR_CHECKOUT" ? "text-amber-600" : "text-emerald-500"}`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${operationalTiming.state === "OVERDUE" ? "bg-red-500" : operationalTiming.state === "DUE_FOR_CHECKOUT" ? "bg-amber-500" : "bg-emerald-500 animate-ping"}`}
                            />
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

                      {/* Session info */}
                      <div className="flex-1 space-y-3 text-center sm:text-left">
                        <div>
                          <h4 className="font-black text-slate-950 text-base">
                            {operationalTiming.state === "OVERDUE"
                              ? `Phiên đã quá giờ ${operationalTiming.minutesPastPlannedEnd} phút`
                              : operationalTiming.state === "DUE_FOR_CHECKOUT"
                                ? isByoc
                                  ? "Đã hết giờ chơi"
                                  : "Đã đến giờ trả xe"
                                : "Phiên chơi đang diễn ra"}
                          </h4>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {operationalTiming.state === "OVERDUE"
                              ? isByoc
                                ? "Vui lòng liên hệ quầy để nhân viên hoàn tất phiên chơi."
                                : "Vui lòng trả xe tại quầy để nhân viên kiểm tra và hoàn tất checkout."
                              : booking.session.status === "EXTENDING"
                                ? "Phiên đang được gia hạn thêm"
                                : isByoc && operationalTiming.state === "DUE_FOR_CHECKOUT"
                                  ? "Vui lòng hoàn tất phiên chơi tại quầy."
                                  : "Phiên chơi đang hoạt động bình thường"}
                          </p>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="bg-slate-50 rounded-lg p-2.5 text-left">
                            <p className="text-slate-400 uppercase text-[9px] font-black tracking-wide">
                              Giờ bắt đầu
                            </p>
                            <p className="font-bold text-slate-900 mt-0.5">
                              {actualStartAt
                                ? new Date(actualStartAt).toLocaleTimeString(
                                    "vi-VN",
                                    { hour: "2-digit", minute: "2-digit" },
                                  )
                                : "--:--"}
                            </p>
                          </div>
                          <div className="bg-slate-50 rounded-lg p-2.5 text-left">
                            <p className="text-slate-400 uppercase text-[9px] font-black tracking-wide">
                              Kết thúc dự kiến
                            </p>
                            <p className="font-bold text-slate-900 mt-0.5">
                              {sessionDetail?.plannedEnd
                                ? new Date(
                                    sessionDetail.plannedEnd,
                                  ).toLocaleTimeString("vi-VN", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })
                                : new Date(
                                    booking.session.plannedEndAt,
                                  ).toLocaleTimeString("vi-VN", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                            </p>
                          </div>
                        </div>
                        {role === "staff" && (
                          <Button
                            asChild
                            size="sm"
                            className="bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-bold text-xs"
                          >
                            <Link to={`/staff/sessions/${booking.session.id}`}>
                              Quản lý phiên chơi
                            </Link>
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card className="border-amber-200 bg-amber-50/50 shadow-sm rounded-xl">
                  <CardContent className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4">
                    <div className="flex items-start gap-3">
                      <div className="h-10 w-10 rounded-xl bg-amber-100 flex items-center justify-center text-amber-600 shrink-0">
                        <Clock3 className="h-5 w-5" />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900">
                          {booking.session.status === "CHECKED_IN"
                            ? "Phiên chơi chuẩn bị diễn ra"
                            : "Đang hoàn tất checkout"}
                        </h4>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {booking.session.status === "CHECKED_IN"
                            ? booking.playMode === "BYOC"
                              ? "Nhân viên đang xác nhận xe khách để vào sân"
                              : "Nhân viên đang hoàn tất thủ tục bàn giao xe"
                            : "Vui lòng chờ nhân viên hoàn tất kiểm tra trả xe"}
                        </p>
                      </div>
                    </div>
                    {role === "staff" && (
                      <Button
                        asChild
                        className="bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold px-5"
                      >
                        <Link to={`/staff/sessions/${booking.session.id}`}>
                          Quản lý phiên chơi
                        </Link>
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}

            {/* Header card */}
            <Card className="rounded-xl shadow-sm">
              <CardHeader className="flex flex-row items-start justify-between gap-4">
                <div>
                  <CardTitle className="text-3xl">
                    Đơn đặt #{booking.id.substring(0, 8).toUpperCase()}
                  </CardTitle>
                  <p className="mt-2 text-muted-foreground">
                    Ngày tạo: {formatDateTime(new Date(booking.createdAt))}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {displayStatusInfo && (
                    <Badge
                      className={`${displayStatusInfo.className} hover:${displayStatusInfo.className}`}
                    >
                      {displayStatusInfo.label}
                    </Badge>
                  )}
                  {booking.status === "CANCELLED" && isRefundPending && (
                    <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-amber-200">
                      Chờ xác nhận hoàn tiền
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {(() => {
                  const timelineStatus = checkInWindowExpired
                    ? "NO_SHOW"
                    : booking.status
                  const isPreSessionTerminal = [
                    "NO_SHOW",
                    "CANCELLED",
                  ].includes(timelineStatus)
                  // A terminal booking status wins over stale session rows from
                  // historical data. A no-show never completed check-in or play.
                  const sess =
                    checkInWindowExpired || isPreSessionTerminal
                      ? null
                      : booking.session
                  const sessStatus = sess?.status

                  // Check-in step
                  const showCheckinStep =
                    timelineStatus !== "PENDING" && !isPreSessionTerminal
                  const checkinDone = !checkInWindowExpired && !!sess
                  const checkinActive = sessStatus === "CHECKED_IN"
                  const checkinTitle = checkInWindowExpired
                    ? "Quá giờ check-in"
                    : !sess
                      ? "Chờ check-in"
                      : sessStatus === "CHECKED_IN"
                        ? "Đang check-in"
                        : "Đã check-in"
                  const checkinStaff = sessionDetail?.staffName
                  const checkinDesc = checkInWindowExpired
                    ? "Đơn đã quá thời hạn check-in 30 phút và được ghi nhận là không đến."
                    : !sess
                      ? `Dự kiến: ${slotLabel}`
                      : sessStatus === "CHECKED_IN"
                        ? checkinStaff
                          ? booking.playMode === "BYOC"
                            ? `Nhân viên ${checkinStaff} đang xác nhận thông tin xe tự mang`
                            : `Nhân viên ${checkinStaff} đang xác nhận tình trạng xe bàn giao`
                          : booking.playMode === "BYOC"
                            ? "Nhân viên đang xác nhận thông tin xe tự mang"
                            : "Nhân viên đang xác nhận tình trạng xe bàn giao"
                        : sess.actualStartAt
                          ? `Bắt đầu lúc ${new Date(sess.actualStartAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}${checkinStaff ? ` · NV: ${checkinStaff}` : ""}`
                          : checkinStaff
                            ? `Đã check-in bởi ${checkinStaff}`
                            : "Đã hoàn tất check-in"

                  // Playing step
                  const showPlayStep = !!sess && sessStatus !== "CHECKED_IN"
                  const showCompletionStep = timelineStatus !== "PENDING"
                  const isAwaitingAdditionalPayment =
                    timelineStatus === "AWAITING_PAYMENT"
                  const playDone =
                    sessStatus === "CHECKING_OUT" ||
                    sessStatus === "COMPLETED" ||
                    timelineStatus === "COMPLETED"
                  const playActive =
                    sessStatus === "ACTIVE" || sessStatus === "EXTENDING"
                  const playTitle =
                    sessStatus === "EXTENDING"
                      ? "Đang gia hạn"
                      : sessStatus === "CHECKING_OUT"
                        ? "Đang hoàn tất checkout"
                        : sessStatus === "COMPLETED" ||
                            timelineStatus === "COMPLETED"
                          ? "Đã kết thúc phiên chơi"
                          : "Đang chơi"
                  const playDesc =
                    sessStatus === "ACTIVE" || sessStatus === "EXTENDING"
                      ? `Kết thúc dự kiến: ${new Date(sess!.plannedEndAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}`
                      : sessStatus === "CHECKING_OUT"
                        ? "Nhân viên đang kiểm tra tình trạng xe trả"
                        : sess?.actualEndAt
                          ? `Kết thúc lúc ${new Date(sess.actualEndAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}`
                          : "Phiên chơi đã kết thúc"

                  // Completion step
                  const completedDesc =
                    timelineStatus === "NO_SHOW" ? (
                      "Khách không đến check-in đúng hạn"
                    ) : timelineStatus === "CANCELLED" ? (
                      <div className="space-y-1">
                        <div>Đơn đã được hủy trước khi phiên chơi bắt đầu</div>
                        {booking.cancellationReason && (
                          <div className="text-[11px] font-bold text-red-600 bg-red-50 border border-red-100 rounded-lg px-2.5 py-1 mt-1.5 inline-block">
                            Lý do hủy: {booking.cancellationReason}
                          </div>
                        )}
                      </div>
                    ) : isAwaitingAdditionalPayment ? (
                      "Phiên chơi đã kết thúc. Vui lòng thanh toán phí phát sinh để hoàn tất đơn."
                    ) : timelineStatus === "COMPLETED" && sess?.actualEndAt ? (
                      formatDateTime(new Date(sess.actualEndAt))
                    ) : isByoc ? (
                      "Sau khi hoàn tất phiên chơi"
                    ) : (
                      "Sau khi check-out hoàn tất"
                    )
                  const reservationTitle = initialPaymentWasSuccessful
                    ? "Đặt lịch đã thanh toán"
                    : timelineStatus === "CANCELLED"
                      ? "Giữ chỗ đã hủy"
                      : "Yêu cầu giữ chỗ đã tạo"
                  const reservationDescription = initialPaymentWasSuccessful
                    ? formatDateTime(new Date(booking.createdAt))
                    : timelineStatus === "CANCELLED"
                      ? "Đơn đã được hủy trước khi có thanh toán."
                      : `Tạo lúc: ${formatDateTime(new Date(booking.createdAt))}`

                  return (
                    <div className="relative space-y-6 pl-8">
                      <div className="absolute left-3 top-3 h-[calc(100%-24px)] w-px bg-border" />
                      <TimelineItem
                        icon={
                          initialPaymentWasSuccessful
                            ? CheckCircle2
                            : timelineStatus === "CANCELLED"
                              ? XCircle
                              : Clock3
                        }
                        title={reservationTitle}
                        description={reservationDescription}
                        done={initialPaymentWasSuccessful}
                        active={timelineStatus === "PENDING"}
                      />
                      {timelineStatus === "PENDING" && paymentExpiry && (
                        <TimelineItem
                          icon={Clock3}
                          title="Chờ thanh toán"
                          description={`Hết hạn: ${formatDateTime(paymentExpiry)}`}
                        />
                      )}
                      {showCheckinStep && (
                        <TimelineItem
                          icon={
                            checkInWindowExpired
                              ? XCircle
                              : checkinDone
                                ? CheckCircle2
                                : Clock3
                          }
                          title={checkinTitle}
                          description={checkinDesc}
                          done={checkinDone && !checkinActive}
                          active={checkinActive}
                        />
                      )}
                      {showPlayStep && (
                        <TimelineItem
                          icon={playDone ? CheckCircle2 : Gamepad2}
                          title={playTitle}
                          description={playDesc}
                          done={playDone}
                          active={playActive}
                        />
                      )}
                      {showCompletionStep && (
                        <TimelineItem
                          icon={
                            timelineStatus === "NO_SHOW" ||
                            timelineStatus === "CANCELLED"
                              ? XCircle
                              : CalendarClock
                          }
                          title={
                            timelineStatus === "NO_SHOW"
                              ? "Không đến"
                              : timelineStatus === "CANCELLED"
                                ? "Đã hủy đặt lịch"
                                : isAwaitingAdditionalPayment
                                  ? "Chờ thanh toán phí phát sinh"
                                  : "Hoàn thành"
                          }
                          description={completedDesc}
                          done={timelineStatus === "COMPLETED"}
                          active={isAwaitingAdditionalPayment}
                          failed={
                            timelineStatus === "NO_SHOW" ||
                            timelineStatus === "CANCELLED"
                          }
                        />
                      )}
                    </div>
                  )
                })()}
              </CardContent>
            </Card>

            {role === "customer" && (
              <ExtensionAuditCard
                extensions={approvedExtensions}
                initialPlannedEnd={booking.slotEnd}
                currentProposal={sessionDetail?.extensionProposal}
              />
            )}

            {/* Booking details */}
            <Card className="rounded-xl shadow-sm">
              <CardHeader>
                <CardTitle>Thông tin đặt sân</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Cafe info */}
                {booking.cafe && (
                  <div className="flex gap-3">
                    <MapPin className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" />
                    <div className="flex-1">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Chi nhánh
                      </p>
                      <div className="mt-1 flex items-center gap-2 flex-wrap">
                        <p className="font-semibold">{booking.cafe.name}</p>
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${booking.cafe.name} ${booking.cafe.address} ${booking.cafe.city}`)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-600 hover:bg-blue-100 transition-colors"
                        >
                          <Navigation className="h-3 w-3" />
                          Chỉ đường
                        </a>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {booking.cafe.address}
                        {booking.cafe.city ? `, ${booking.cafe.city}` : ""}
                      </p>
                    </div>
                  </div>
                )}

                <div className="grid gap-5 sm:grid-cols-2">
                  <DetailLine
                    icon={Clock3}
                    label="Thời gian"
                    value={slotLabel}
                  />
                  <DetailLine
                    icon={Car}
                    label="Chế độ chơi"
                    value={
                      booking.playMode === "RENTAL"
                        ? "Thuê xe quán"
                        : "Mang xe riêng"
                    }
                  />
                  {booking.track_type_name && (
                    <DetailLine
                      icon={MapPin}
                      label="Loại sân"
                      value={booking.track_type_name}
                    />
                  )}
                  <DetailLine
                    icon={Users}
                    label="Số người chơi"
                    value={`${playerCount} người`}
                  />
                  {booking.playMode === "RENTAL" &&
                    booking.vehicles.length > 0 && (
                      <DetailLine
                        icon={Car}
                        label="Xe thuê"
                        value={`${booking.vehicles.length} xe`}
                      />
                    )}
                </div>

                {/* Participants list */}
                {booking.participants.length > 0 && (
                  <>
                    <Separator />
                    <div>
                      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Danh sách người chơi
                      </p>
                      <div className="space-y-2">
                        {booking.participants.map((p, i) => {
                          const isBooker =
                            p.isPrimaryResponsible ||
                            p.participantType === "BOOKER"
                          const name =
                            p.resolvedName ??
                            (isBooker ? "Người đặt" : `Khách ${i}`)
                          const phone = p.resolvedPhone
                          return (
                            <div
                              key={p.id}
                              className="flex items-center gap-2 text-sm"
                            >
                              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                                {i + 1}
                              </span>
                              <span className="font-medium">{name}</span>
                              {phone && (
                                <span className="text-muted-foreground">
                                  · {phone}
                                </span>
                              )}
                              {isBooker && (
                                <span className="ml-1 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-semibold text-orange-600">
                                  Người đặt
                                </span>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Rental vehicles detail */}
            {booking.playMode === "RENTAL" && booking.vehicles.length > 0 && (
              <Card className="rounded-xl shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Car className="h-5 w-5" />
                    {isHistoricalNonFulfilledBooking ? "Xe đã giữ" : "Xe thuê"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {isHistoricalNonFulfilledBooking && (
                    <p className="text-xs text-slate-500">
                      Xe chưa được nhận. Thông tin tại thời điểm đặt được lưu để
                      đối soát.
                    </p>
                  )}
                  {booking.vehicles.map((v, i) => (
                    <div
                      key={v.id}
                      className="flex items-center gap-4 rounded-xl border p-3"
                    >
                      <div className="h-16 w-24 shrink-0 overflow-hidden rounded-lg bg-muted">
                        <VehicleImage
                          imageUrl={v.coverImageUrl}
                          alt={v.catalogName ?? "Xe thuê"}
                          className="h-full w-full object-cover"
                          fallbackClassName="bg-muted text-muted-foreground/50"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold truncate">
                          {v.catalogName ?? `Xe ${i + 1}`}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          {v.tier && (
                            <span className="capitalize">
                              {TIER_LABELS[v.tier] ?? v.tier}
                            </span>
                          )}
                          {v.color && <span>{v.color}</span>}
                          {v.identifier && <span>#{v.identifier}</span>}
                        </div>
                      </div>
                      {v.rentalFeeSnapshot != null && (
                        <div className="text-right text-sm shrink-0">
                          <p className="text-xs text-muted-foreground">
                            {isHistoricalNonFulfilledBooking
                              ? "Giá thuê khi đặt"
                              : "Phí thuê"}
                          </p>
                          <p className="font-semibold">
                            {formatCurrency(Number(v.rentalFeeSnapshot))}
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Food and drink orders stay separated by when they were placed. */}
            {customerFnbOrders.length > 0 && (
              <Card className="rounded-xl shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <UtensilsCrossed className="h-5 w-5" />
                    Đồ ăn & thức uống
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {renderFnbGroup(preorderFnbOrders, {
                    title: "Đặt trước khi đến sân",
                    description: preorderFnbPaid
                      ? "Các món này đã được thanh toán cùng đơn đặt lịch."
                      : "Các món này sẽ được thanh toán cùng đơn đặt lịch.",
                    paymentLabel: preorderFnbPaid
                      ? "Đã thanh toán"
                      : "Chờ thanh toán",
                    className: preorderFnbPaid
                      ? "border-emerald-200 bg-emerald-50/40"
                      : "border-amber-200 bg-amber-50/40",
                    badgeClassName: preorderFnbPaid
                      ? "bg-emerald-100 text-emerald-700 font-bold"
                      : "bg-amber-100 text-amber-700 font-bold",
                    isPreorder: true,
                  })}
                  {renderFnbGroup(onsiteFnbOrders, {
                    title: "Gọi trong phiên chơi",
                    description: isOnsiteFnbAllPaid
                      ? "Các món phát sinh trong lúc chơi đã được thanh toán đầy đủ."
                      : isOnsiteFnbPartiallyPaid
                        ? `Đã thanh toán ${formatCurrency(paidOnsiteFnbAmount)}; còn ${formatCurrency(pendingOnsiteFnbAmount)} đang chờ thanh toán.`
                        : "Các món phát sinh trong lúc chơi và được quyết toán riêng.",
                    paymentLabel: isOnsiteFnbAllPaid
                      ? "Đã thanh toán"
                      : isOnsiteFnbPartiallyPaid
                        ? `Chờ thanh toán · ${formatCurrency(pendingOnsiteFnbAmount)}`
                        : "Chờ thanh toán",
                    className: isOnsiteFnbAllPaid
                      ? "border-emerald-200 bg-emerald-50/40"
                      : "border-amber-200 bg-amber-50/40",
                    badgeClassName: isOnsiteFnbAllPaid
                      ? "bg-emerald-100 text-emerald-700 font-bold"
                      : "bg-amber-100 text-amber-800 font-bold border border-amber-300",
                    paidAmount: paidOnsiteFnbAmount,
                    pendingAmount: pendingOnsiteFnbAmount,
                  })}
                  {renderFnbGroup(legacyFnbOrders, {
                    title: "Đồ ăn & thức uống",
                    description:
                      "Chi tiết thời điểm gọi món chưa có trong dữ liệu cũ.",
                    paymentLabel: "Danh sách món",
                    className: "border-slate-200 bg-slate-50",
                    badgeClassName: "bg-slate-200 text-slate-700",
                  })}
                  {renderFnbGroup(cancelledFnbOrders, {
                    title: "Món đã hủy",
                    description:
                      booking.status === "NO_SHOW"
                        ? "Khách không đến; các món này không được phục vụ."
                        : "Các món này đã được hủy cùng đơn đặt lịch.",
                    paymentLabel: "Đã hủy",
                    className: "border-rose-200 bg-rose-50/40",
                    badgeClassName: "bg-rose-100 text-rose-700",
                  })}
                </CardContent>
              </Card>
            )}

            {/* Check-in handover card */}
            {(checkInPhotos.length > 0 ||
              checkInChecklist.length > 0 ||
              Boolean(checkInStaffNotes)) && (
              <Card
                ref={handoverCardRef}
                className="rounded-xl shadow-sm overflow-hidden scroll-mt-24"
              >
                <button
                  type="button"
                  onClick={() => setCheckInPhotosOpen((v) => !v)}
                  className="w-full flex items-center justify-between gap-3 px-6 py-4 hover:bg-muted/30 transition-colors text-left"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/10 text-orange-600">
                      <Camera className="h-5 w-5 shrink-0" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm text-foreground">
                        {booking.playMode === "BYOC"
                          ? "Biên bản & ảnh xác nhận xe khách (Check-in)"
                          : "Biên bản & ảnh bàn giao xe (Check-in)"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {[
                          checkInPhotos.length > 0
                            ? `${checkInPhotos.length} ảnh`
                            : null,
                          checkInChecklist.length > 0
                            ? `${checkInChecklist.length} mục kiểm tra`
                            : null,
                          booking.playMode === "BYOC"
                            ? "Biên bản xe khách"
                            : "Biên bản bàn giao xe",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                  </div>
                  <ChevronDown
                    className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-200 ${checkInPhotosOpen ? "rotate-180" : ""}`}
                  />
                </button>
                {checkInPhotosOpen && (
                  <CardContent className="pt-0 pb-5 space-y-4">
                    {/* Ghi chú của nhân viên */}
                    {checkInStaffNotes && (
                      <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 text-xs text-amber-900 flex items-start gap-2.5">
                        <FileText className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                        <div className="flex-1">
                          <p className="font-bold text-amber-950 mb-0.5">
                            Ghi chú của nhân viên trực ca:
                          </p>
                          <p className="text-amber-900 leading-relaxed whitespace-pre-line">
                            {checkInStaffNotes}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Checklist kiểm tra xe */}
                    {checkInChecklist.length > 0 && (
                      <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
                        <div className="flex items-center justify-between mb-2.5">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                            <ClipboardCheck className="h-4 w-4 text-emerald-600" />
                            <span>
                              {booking.playMode === "BYOC"
                                ? "Checklist an toàn xe tự mang (Check-in)"
                                : "Checklist kiểm tra kỹ thuật khi nhận xe"}
                            </span>
                          </div>
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-full border border-emerald-200">
                            {
                              checkInChecklist.filter(
                                (c: ChecklistItemUi) =>
                                  c.checked !== false &&
                                  c.status !== "DAMAGED" &&
                                  c.status !== "NOT_OK",
                              ).length
                            }
                            /{checkInChecklist.length} Hạng mục đạt
                          </span>
                        </div>
                        <div className="grid sm:grid-cols-2 gap-2">
                          {checkInChecklist.map((item: ChecklistItemUi, idx) => {
                            const isOk =
                              item.checked !== false &&
                              item.status !== "DAMAGED" &&
                              item.status !== "NOT_OK"
                            const label =
                              item.label ||
                              item.itemLabel ||
                              item.itemKey ||
                              `Hạng mục ${idx + 1}`
                            const note = item.notes || item.note
                            return (
                              <div
                                key={idx}
                                className="flex items-start gap-2 rounded-lg bg-white p-2.5 border border-slate-200/80 text-xs shadow-2xs"
                              >
                                {isOk ? (
                                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
                                ) : (
                                  <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                                )}
                                <div className="min-w-0 flex-1">
                                  <p className="font-semibold text-slate-800 leading-snug">
                                    {label}
                                  </p>
                                  {note ? (
                                    <p className="text-[11px] text-slate-500 mt-0.5 italic">
                                      {note}
                                    </p>
                                  ) : null}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* Danh sách ảnh */}
                    {checkInPhotos.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                          <Camera className="h-3.5 w-3.5 text-slate-500" />
                          <span>
                            {booking.playMode === "BYOC"
                              ? `Ảnh chụp xác nhận xe khách (${checkInPhotos.length} ảnh)`
                              : `Ảnh chụp hiện trạng bàn giao xe (${checkInPhotos.length} ảnh)`}
                          </span>
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                          {checkInPhotos.map((photo, idx) => (
                            <div
                              key={idx}
                              className="overflow-hidden rounded-xl border border-border"
                            >
                              <ZoomableInspectionImage
                                src={photo.url}
                                alt={
                                  DIRECTION_LABELS[photo.direction] ??
                                  photo.direction
                                }
                                className="aspect-video w-full object-cover"
                              />
                              <div className="bg-muted/50 px-2.5 py-1.5">
                                <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                                  {DIRECTION_LABELS[photo.direction] ??
                                    photo.direction}
                                </p>
                                {photo.notes && (
                                  <p className="mt-0.5 text-[11px] leading-tight text-foreground">
                                    {photo.notes}
                                  </p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            )}

            {/* Check-out return card */}
            {(checkOutPhotos.length > 0 ||
              checkOutChecklist.length > 0 ||
              Boolean(checkOutStaffNotes)) && (
              <Card className="rounded-xl shadow-sm overflow-hidden">
                <button
                  type="button"
                  onClick={() => setCheckOutPhotosOpen((v) => !v)}
                  className="w-full flex items-center justify-between gap-3 px-6 py-4 hover:bg-muted/30 transition-colors text-left"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/10 text-orange-600">
                      <Camera className="h-5 w-5 shrink-0" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm text-foreground">
                        Biên bản & ảnh trả xe (Check-out)
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {[
                          checkOutPhotos.length > 0
                            ? `${checkOutPhotos.length} ảnh`
                            : null,
                          checkOutChecklist.length > 0
                            ? `${checkOutChecklist.length} mục kiểm tra`
                            : null,
                          "Căn cứ đối chiếu hiện trạng",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                  </div>
                  <ChevronDown
                    className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-200 ${checkOutPhotosOpen ? "rotate-180" : ""}`}
                  />
                </button>
                {checkOutPhotosOpen && (
                  <CardContent className="pt-0 pb-5 space-y-4">
                    {/* Ghi chú của nhân viên khi trả xe */}
                    {checkOutStaffNotes && (
                      <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 text-xs text-amber-900 flex items-start gap-2.5">
                        <FileText className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                        <div className="flex-1">
                          <p className="font-bold text-amber-950 mb-0.5">
                            Ghi chú trả xe của nhân viên:
                          </p>
                          <p className="text-amber-900 leading-relaxed whitespace-pre-line">
                            {checkOutStaffNotes}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Checklist kiểm tra khi trả xe */}
                    {checkOutChecklist.length > 0 && (
                      <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
                        <div className="flex items-center justify-between mb-2.5">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                            <ClipboardCheck className="h-4 w-4 text-emerald-600" />
                            <span>Checklist nghiệm thu khi trả xe</span>
                          </div>
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-full border border-emerald-200">
                            {
                              checkOutChecklist.filter(
                                (c: ChecklistItemUi) =>
                                  c.checked !== false &&
                                  c.status !== "DAMAGED" &&
                                  c.status !== "NOT_OK",
                              ).length
                            }
                            /{checkOutChecklist.length} Hạng mục đạt
                          </span>
                        </div>
                        <div className="grid sm:grid-cols-2 gap-2">
                          {checkOutChecklist.map((item: ChecklistItemUi, idx) => {
                            const isOk =
                              item.checked !== false &&
                              item.status !== "DAMAGED" &&
                              item.status !== "NOT_OK"
                            const label =
                              item.label ||
                              item.itemLabel ||
                              item.itemKey ||
                              `Hạng mục ${idx + 1}`
                            const note = item.notes || item.note
                            return (
                              <div
                                key={idx}
                                className="flex items-start gap-2 rounded-lg bg-white p-2.5 border border-slate-200/80 text-xs shadow-2xs"
                              >
                                {isOk ? (
                                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
                                ) : (
                                  <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                                )}
                                <div className="min-w-0 flex-1">
                                  <p className="font-semibold text-slate-800 leading-snug">
                                    {label}
                                  </p>
                                  {note ? (
                                    <p className="text-[11px] text-slate-500 mt-0.5 italic">
                                      {note}
                                    </p>
                                  ) : null}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* Bảng kê hư hỏng & bồi thường linh kiện nếu có */}
                    {checkOutDamageTotal > 0 && (
                      <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-3.5 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-rose-900">
                            <Wrench className="h-4 w-4 text-rose-600" />
                            <span>Bảng kê bồi thường hư hại & sửa chữa xe</span>
                          </div>
                          <span className="text-xs font-extrabold text-rose-700 bg-rose-100 px-2.5 py-0.5 rounded-full border border-rose-200">
                            +{formatCurrency(checkOutDamageTotal)}
                          </span>
                        </div>

                        <div className="space-y-1.5">
                          {checkOutDamageLineItems.map((item, idx: number) => {
                            const partLabel =
                              (item.partType
                                ? (PART_TYPE_LABELS as Record<string, string>)[
                                    item.partType
                                  ]
                                : undefined) ??
                              item.partType ??
                              item.customPartName ??
                              `Linh kiện ${idx + 1}`
                            const lineTotal =
                              Number(item.lineTotal) ||
                              Number(item.partsPrice || 0) + Number(item.laborPrice || 0)
                            return (
                              <div
                                key={idx}
                                className="flex items-center justify-between rounded-lg bg-white p-2.5 border border-rose-100 text-xs shadow-2xs"
                              >
                                <div>
                                  <p className="font-bold text-slate-900">
                                    {partLabel}
                                    {item.customPartName && item.partType !== "OTHER" && (
                                      <span className="font-normal text-slate-500">
                                        {" "}
                                        — {item.customPartName}
                                      </span>
                                    )}
                                  </p>
                                  <p className="text-[11px] text-slate-500 mt-0.5">
                                    Linh kiện: {formatCurrency(Number(item.partsPrice || 0))}
                                    {Number(item.laborPrice || 0) > 0 &&
                                      ` · Công sửa: ${formatCurrency(Number(item.laborPrice))}`}
                                  </p>
                                </div>
                                <span className="font-extrabold text-rose-600 tabular-nums">
                                  {formatCurrency(lineTotal)}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* Danh sách ảnh */}
                    {checkOutPhotos.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                          <Camera className="h-3.5 w-3.5 text-slate-500" />
                          <span>
                            Ảnh chụp hiện trạng lúc trả xe ({checkOutPhotos.length} ảnh)
                          </span>
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                          {checkOutPhotos.map((photo, idx) => (
                            <div
                              key={idx}
                              className="overflow-hidden rounded-xl border border-border"
                            >
                              <ZoomableInspectionImage
                                src={photo.url}
                                alt={
                                  DIRECTION_LABELS[photo.direction] ??
                                  photo.direction
                                }
                                className="aspect-video w-full object-cover"
                              />
                              <div className="bg-muted/50 px-2.5 py-1.5">
                                <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                                  {DIRECTION_LABELS[photo.direction] ??
                                    photo.direction}
                                </p>
                                {photo.notes && (
                                  <p className="mt-0.5 text-[11px] leading-tight text-foreground">
                                    {photo.notes}
                                  </p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            )}
          </main>

          <aside className="lg:sticky lg:top-20 lg:self-start">
            <div className="space-y-4 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:pr-1">
              {booking.status === "CONFIRMED" &&
                !checkInWindowExpired &&
                new Date() < new Date(booking.slotEnd) && (
                  <Card className="rounded-xl text-center shadow-sm">
                    <CardHeader>
                      <CardTitle className="flex items-center justify-center gap-2">
                        <QrCode className="h-4 w-4 text-orange-500" />
                        Mã Check-in
                      </CardTitle>
                      <p className="text-sm text-muted-foreground">
                        {booking.playMode === "BYOC"
                          ? "Quét mã này tại quầy để check-in vào sân"
                          : "Quét mã này tại quầy để nhận xe"}
                      </p>
                    </CardHeader>
                    <CardContent className="flex flex-col items-center gap-3">
                      <div className="p-3 bg-white border rounded-xl shadow-sm">
                        <img
                          src={`${env.apiUrl}/v1/bookings/${bookingId}/qr`}
                          width={180}
                          height={180}
                          alt="QR Check-in"
                          className="rounded"
                        />
                      </div>
                      <Badge
                        variant="secondary"
                        className="font-mono tracking-widest"
                      >
                        #{booking.id.substring(0, 8).toUpperCase()}
                      </Badge>
                    </CardContent>
                  </Card>
                )}

              <Card className="rounded-xl shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Thanh toán</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      {booking.status === "PENDING" ? (
                        <Clock3 className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                      ) : isCancelledBeforePayment ? (
                        <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      )}
                      <span
                        className={`text-xs font-bold ${
                          booking.status === "PENDING"
                            ? "text-amber-700"
                            : isCancelledBeforePayment
                              ? "text-red-700"
                              : "text-emerald-700"
                        }`}
                      >
                        {booking.status === "PENDING"
                          ? "Chờ khách thanh toán"
                          : isCancelledBeforePayment
                            ? "Đơn đã hủy trước khi thanh toán"
                            : `Đã thanh toán qua ${gatewayLabel(initialPaymentGateway)}`}
                      </span>
                    </div>
                    <div className="pl-5 space-y-1.5">
                      {prepaidLines.map((line) => (
                        <div
                          key={line.componentId}
                          className="flex justify-between text-sm"
                        >
                          <span className="text-slate-500">{line.label}</span>
                          <span className="font-semibold tabular-nums">
                            {formatCurrency(Number(line.amount))}
                          </span>
                        </div>
                      ))}
                      {prepaidDiscountAmount > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500">Ưu đãi áp dụng</span>
                          <span className="font-semibold text-emerald-600 tabular-nums">
                            −{formatCurrency(prepaidDiscountAmount)}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between text-sm font-bold border-t border-slate-100 pt-1.5">
                        <span className="text-slate-800">
                          {booking.status === "PENDING"
                            ? "Tổng cần thanh toán"
                            : initialPaymentWasSuccessful
                              ? "Đã thanh toán khi đặt lịch"
                              : "Chưa phát sinh thanh toán"}
                        </span>
                        <span className="text-slate-900 tabular-nums">
                          {formatCurrency(
                            booking.status === "PENDING"
                              ? prepaidServiceAmount
                              : prepaidPaidAmount,
                          )}
                        </span>
                      </div>
                    </div>
                  </div>

                  {(isActiveSession ||
                    booking.status === "COMPLETED" ||
                    booking.status === "AWAITING_PAYMENT") && (
                    <>
                      <Separator />
                      <div className="space-y-2">
                        <div className="flex items-center gap-1.5">
                          <Clock3 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <span className="text-xs font-bold text-slate-600">
                            Chi tiết phí phát sinh
                          </span>
                        </div>
                        <div className="pl-5 space-y-1.5">
                          {groupedAdditionalLines.length > 0 ? (
                            groupedAdditionalLines.map((line) => (
                              <div
                                key={line.id}
                                className="flex items-start justify-between gap-3 text-sm"
                              >
                                <div>
                                  <span className="text-slate-500">
                                    {line.label}
                                  </span>
                                  <p
                                    className={`mt-0.5 text-[10px] font-medium ${line.paid ? "text-emerald-600" : "text-amber-700 font-bold"}`}
                                  >
                                    {line.paid
                                      ? `Đã thanh toán${line.gateway ? ` · ${line.gateway}` : ""}`
                                      : "Chờ thanh toán"}
                                  </p>
                                </div>
                                <span className="font-semibold text-orange-600 tabular-nums shrink-0">
                                  +{formatCurrency(line.amount)}
                                </span>
                              </div>
                            ))
                          ) : (
                            <p className="text-sm text-slate-400">
                              Không phát sinh phí tại quầy.
                            </p>
                          )}
                          <div className="flex justify-between text-sm font-bold border-t border-slate-100 pt-1.5">
                            <span className="text-slate-800">
                              Tổng phí phát sinh
                            </span>
                            <span className="text-orange-600 tabular-nums">
                              {formatCurrency(additionalTotal)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </>
                  )}

                  <div className="flex justify-between rounded-xl bg-slate-50 px-3 py-2.5 text-sm">
                    <span className="font-bold text-slate-700">
                      Tổng đã thanh toán
                    </span>
                    <span className="font-extrabold text-slate-950 tabular-nums">
                      {formatCurrency(totalPaidAmount)}
                    </span>
                  </div>

                  <PackageUsedBadge snapshot={booking.snapshot} />

                  {/* Status footer */}
                  {!isPaid && additionalOutstandingAmount > 0 ? (
                    <div className="space-y-3">
                      {isCheckoutPending ? (
                        <div className="rounded-xl bg-amber-100/70 border border-amber-300 p-3.5 text-xs text-amber-950 font-semibold space-y-1">
                          <div className="flex items-center gap-1.5 font-bold text-amber-950">
                            <AlertTriangle className="h-4 w-4 text-amber-700 shrink-0" />
                            <span>Chờ hoàn tất kiểm tra & trả xe</span>
                          </div>
                          <p className="text-[11px] leading-relaxed text-amber-900">
                            {role === "customer"
                              ? "Vui lòng hoàn tất kiểm tra và trả xe tại quầy với Nhân viên trước khi thực hiện thanh toán các khoản phát sinh."
                              : "Khách đang trong ca chơi. Vui lòng thực hiện BƯỚC 1: KIỂM TRA TRẢ XE ở thẻ phía trên để chốt toàn bộ chi phí trước khi thu tiền mặt."}
                          </p>
                        </div>
                      ) : (
                        <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 font-medium leading-relaxed">
                          <p>
                            Còn{" "}
                            <strong>
                              {formatCurrency(additionalOutstandingAmount)}
                            </strong>{" "}
                            phí phát sinh chưa thanh toán.
                          </p>
                          <p className="mt-1 text-amber-700">
                            Chi tiết từng khoản được hiển thị ngay phía trên.
                          </p>
                        </div>
                      )}
                      {role === "customer" && (
                        <>
                          {canBankTransfer && settlementBankTransferPath && (
                            <Button
                              asChild={!isCheckoutPending}
                              disabled={isCheckoutPending}
                              variant={isCheckoutPending ? "outline" : "default"}
                              className={
                                isCheckoutPending
                                  ? "w-full font-bold text-xs h-10 rounded-xl bg-amber-100/90 text-amber-950 border-amber-300 cursor-not-allowed disabled:opacity-100 disabled:bg-amber-100 disabled:text-amber-950 disabled:border-amber-300"
                                  : "w-full bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs h-10 rounded-xl"
                              }
                            >
                              {isCheckoutPending ? (
                                <span className="flex items-center justify-center gap-1.5">
                                  <QrCode className="size-4 shrink-0 text-amber-700" />
                                  <span>Quét mã chuyển khoản (Chờ xác nhận trả xe)</span>
                                </span>
                              ) : (
                                <Link to={settlementBankTransferPath}>
                                  <QrCode className="mr-1.5 size-4" />
                                  Quét mã chuyển khoản
                                </Link>
                              )}
                            </Button>
                          )}
                          <Button
                            onClick={handlePayAdditionalFees}
                            disabled={payingAdditional || isCheckoutPending}
                            variant={isCheckoutPending ? "outline" : canBankTransfer ? "outline" : "default"}
                            className={
                              isCheckoutPending
                                ? "w-full font-bold text-xs h-10 rounded-xl bg-amber-100/90 text-amber-950 border-amber-300 cursor-not-allowed disabled:opacity-100 disabled:bg-amber-100 disabled:text-amber-950 disabled:border-amber-300"
                                : canBankTransfer
                                  ? "w-full font-bold text-xs h-10 rounded-xl border border-orange-500 text-orange-600 hover:bg-orange-50"
                                  : "w-full bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs h-10 rounded-xl"
                            }
                          >
                            {payingAdditional
                              ? "Đang khởi tạo..."
                              : isCheckoutPending
                                ? "Thanh toán qua VNPAY (Chờ xác nhận trả xe)"
                                : "Thanh toán qua VNPAY"}
                          </Button>
                        </>
                      )}
                      {role === "staff" && (
                        <Button
                          onClick={handleSettleCash}
                          disabled={settlingCash || isCheckoutPending}
                          variant={isCheckoutPending ? "outline" : "default"}
                          className={
                            isCheckoutPending
                              ? "w-full font-bold text-xs h-10 rounded-xl bg-amber-100/90 text-amber-950 border-amber-300 cursor-not-allowed disabled:opacity-100 disabled:bg-amber-100 disabled:text-amber-950 disabled:border-amber-300"
                              : "w-full bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs h-10 rounded-xl"
                          }
                        >
                          {settlingCash
                            ? "Đang xác nhận..."
                            : isCheckoutPending
                              ? "🔒 Cần kiểm tra trả xe trước khi thu tiền"
                              : "✓ Xác nhận đã thu tiền mặt"}
                        </Button>
                      )}
                    </div>
                  ) : additionalTotal > 0 && isPaid ? (
                    <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3 text-xs text-emerald-700 font-bold flex items-center gap-1.5 justify-center">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Đã thanh toán đầy đủ
                    </div>
                  ) : booking.status === "PENDING" ? (
                    <div className="space-y-3">
                      <div className="rounded-xl bg-amber-50 border border-amber-100 p-3 text-xs text-amber-700 font-medium text-center">
                        {paymentHoldIsActive ? (
                          <>
                            Chờ thanh toán
                            {paymentExpiry
                              ? ` · Giữ chỗ đến ${formatDateTime(paymentExpiry)}`
                              : ""}
                          </>
                        ) : (
                          "Thời hạn giữ chỗ đã hết. Vui lòng tạo đơn đặt mới."
                        )}
                      </div>
                      {role === "customer" && paymentHoldIsActive && (
                        <div className="space-y-2">
                          {/*
                            Chuyển khoản để trên và làm nút chính: nếu chi
                            nhánh có nhận, đó là cách tiền về thẳng túi họ và
                            đơn tự xác nhận. VNPay lùi xuống thành lựa chọn phụ
                            thay vì là con đường duy nhất như trước.
                          */}
                          {canBankTransfer && bankTransferPath && (
                            <Button
                              asChild
                              className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs h-10 rounded-xl"
                            >
                              <Link to={bankTransferPath}>
                                Chuyển khoản — hiện mã QR
                              </Link>
                            </Button>
                          )}
                          <Button
                            onClick={handleResumeInitialPayment}
                            disabled={resumingInitialPayment}
                            variant={canBankTransfer ? "outline" : undefined}
                            className={
                              canBankTransfer
                                ? "w-full font-bold text-xs h-10 rounded-xl"
                                : "w-full bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs h-10 rounded-xl"
                            }
                          >
                            {resumingInitialPayment
                              ? "Đang khởi tạo..."
                              : "Thanh toán lại qua VNPay"}
                          </Button>
                        </div>
                      )}
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              {hasRefund && (
                <Card className="rounded-xl shadow-sm border border-emerald-100 bg-emerald-50/10">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm font-bold text-slate-800">
                      <RotateCcw className="h-4 w-4 text-emerald-600" />
                      Thông tin hoàn tiền
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-1.5 text-xs">
                      {refundSlotFee > 0 && (
                        <div className="flex justify-between text-slate-600">
                          <span>Hoàn phí lịch sân:</span>
                          <span className="font-semibold">
                            {formatCurrency(refundSlotFee)}
                          </span>
                        </div>
                      )}
                      {refundRentalFee > 0 && (
                        <div className="flex justify-between text-slate-600">
                          <span>Hoàn phí thuê xe:</span>
                          <span className="font-semibold">
                            {formatCurrency(refundRentalFee)}
                          </span>
                        </div>
                      )}
                      {refundFnb > 0 && (
                        <div className="flex justify-between text-slate-600">
                          <span>Hoàn đồ ăn & thức uống đặt trước:</span>
                          <span className="font-semibold">
                            {formatCurrency(refundFnb)}
                          </span>
                        </div>
                      )}
                      <div className="border-t border-dashed border-slate-200 pt-2 flex justify-between font-extrabold text-slate-800 text-sm">
                        <span>Tổng tiền hoàn:</span>
                        <span className="text-emerald-600">
                          {formatCurrency(totalRefundAmount)}
                        </span>
                      </div>
                    </div>

                    {isRefundPending ? (
                      <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 space-y-1">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-amber-850">
                          <Clock3 className="h-3.5 w-3.5 text-amber-600" />
                          Đang chờ hoàn tiền tại quầy
                        </div>
                        <p className="text-[10px] text-amber-700 leading-relaxed font-semibold">
                          Giao dịch hoàn tiền đang được nhân viên xử lý thủ công
                          (tiền mặt/chuyển khoản) tại quầy.
                        </p>
                      </div>
                    ) : (
                      <div className="rounded-lg bg-emerald-100/70 border border-emerald-200 p-3 space-y-1">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-800">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                          Đã hoàn tiền thành công
                        </div>
                        <p className="text-[10px] text-emerald-700 leading-relaxed font-semibold">
                          Nhân viên đã xác nhận hoàn trả đầy đủ{" "}
                          {formatCurrency(totalRefundAmount)} cho quý khách tại
                          quầy.
                        </p>
                      </div>
                    )}

                    {isRefundPending && role === "staff" && (
                      <div className="space-y-2 rounded-xl border border-orange-100 bg-orange-50/40 p-3">
                        <p className="text-[11px] font-bold text-slate-700">
                          Thông tin hoàn tiền thực tế
                        </p>
                        <select
                          value={refundMethod}
                          onChange={(event) =>
                            setRefundMethod(
                              event.target.value as "CASH" | "BANK_TRANSFER",
                            )
                          }
                          disabled={confirmingRefund}
                          className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700"
                        >
                          <option value="CASH">Tiền mặt tại quầy</option>
                          <option value="BANK_TRANSFER">Chuyển khoản</option>
                        </select>
                        <Button
                          onClick={handleConfirmRefund}
                          disabled={confirmingRefund}
                          className="w-full bg-[#ea580c] hover:bg-[#ea580c]/90 text-white font-extrabold text-xs h-10 rounded-xl flex items-center justify-center gap-1.5 shadow-sm"
                        >
                          {confirmingRefund ? (
                            "Đang xử lý..."
                          ) : (
                            <>
                              <CheckCircle2 className="h-4 w-4" />
                              Xác nhận đã hoàn tiền
                            </>
                          )}
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {canCancelBooking &&
                booking.status === "PENDING" &&
                !checkInWindowExpired && (
                  <Button
                    variant="destructive"
                    className="w-full"
                    onClick={() => setShowCancelDialog(true)}
                  >
                    <XCircle className="h-4 w-4" /> Hủy giữ chỗ
                  </Button>
                )}
            </div>
          </aside>
        </div>
      </div>

      {showCancelDialog && (
        <CancelDialog
          booking={booking}
          onConfirm={handleCancelConfirm}
          onCancel={() => setShowCancelDialog(false)}
          isPending={cancelMutation.isPending}
        />
      )}
    </div>
  )
}

function PackageUsedBadge({
  snapshot,
}: {
  snapshot: Record<string, unknown> | null
}) {
  if (!snapshot) return null
  const pkg = snapshot.package_used as
    | { package_name?: string; slots_used?: number }
    | undefined
  if (!pkg?.package_name) return null
  return (
    <div className="flex items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs">
      <Layers className="h-3.5 w-3.5 shrink-0 text-orange-500" />
      <div className="flex-1 min-w-0">
        <span className="font-semibold text-orange-800">Gói slot: </span>
        <span className="text-orange-700">{pkg.package_name}</span>
      </div>
      {pkg.slots_used != null && (
        <span className="shrink-0 font-bold text-orange-600">
          −{pkg.slots_used} slot
        </span>
      )}
    </div>
  )
}

function TimelineItem({
  icon: Icon,
  title,
  description,
  done = false,
  active = false,
  failed = false,
}: {
  icon: typeof CheckCircle2
  title: string
  description: React.ReactNode
  done?: boolean
  active?: boolean
  failed?: boolean
}) {
  return (
    <div className="relative">
      <span
        className={`absolute -left-8 flex h-7 w-7 items-center justify-center rounded-full border bg-background ${
          failed
            ? "text-red-600 border-red-200 bg-red-50"
            : done
              ? "text-emerald-600 border-emerald-200"
              : active
                ? "text-orange-500 border-orange-200 bg-orange-50"
                : "text-muted-foreground"
        }`}
      >
        <Icon className="h-4 w-4" />
      </span>
      <p
        className={`font-semibold ${
          failed ? "text-red-600" : active ? "text-orange-600" : ""
        }`}
      >
        {title}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  )
}

function DetailLine({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Car
  label: string
  value: string
}) {
  return (
    <div className="flex gap-3">
      <Icon className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" />
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="mt-1 font-semibold">{value}</p>
      </div>
    </div>
  )
}

function formatCountdown(totalSecs: number) {
  const hours = Math.floor(totalSecs / 3600)
  const mins = Math.floor((totalSecs % 3600) / 60)
  const secs = totalSecs % 60
  if (hours > 0) {
    return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
}

function formatTime(d: Date) {
  return d.toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
}

function formatDate(d: Date) {
  return d.toLocaleDateString("vi-VN")
}

function formatDateTime(d: Date) {
  return `${formatDate(d)}, ${formatTime(d)}`
}
