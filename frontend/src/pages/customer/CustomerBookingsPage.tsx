import { useState } from "react"
import { Link, useNavigate } from "react-router"
import {
  AlertTriangle,
  XCircle,
  HelpCircle,
  Clock,
  CreditCard,
  Loader2,
  ChevronRight,
  Car,
  QrCode,
} from "lucide-react"
import { routePaths } from "@/app/router/route-paths"
import { Button } from "@/shared/ui/button"
import { Badge } from "@/shared/ui/badge"
import { cn, getApiErrorInfo } from "@/shared/lib/utils"
import { toast } from "sonner"
import { CustomerSubNav } from "./components/CustomerSubNav"
import { CustomerPageShell } from "./components/CustomerPageShell"
import { ReviewReminderBanner } from "@/features/booking-review/components/ReviewReminderBanner"
import {
  useMyBookings,
  useCancelBooking,
  useCreateCheckout,
} from "@/features/booking/hooks/use-booking"
import type { BookingStatus, BookingListItem } from "@/features/booking/types/booking.types"
import { hasExpiredCheckInWindow } from "@/features/booking/lib/check-in-window"

type FilterKey = "all" | BookingStatus
type PlayModeFilter = "all" | "RENTAL" | "BYOC"

const STATUS_LABELS: Record<BookingStatus, { label: string; badge: string }> = {
  PENDING: {
    label: "Chờ thanh toán",
    badge: "bg-amber-100 text-amber-800 border-none font-bold text-xs",
  },
  CONFIRMED: {
    label: "Đã xác nhận",
    badge: "bg-emerald-100 text-emerald-800 border-none font-bold text-xs",
  },
  AWAITING_PAYMENT: {
    label: "Chờ thanh toán phí phát sinh",
    badge: "bg-amber-100 text-amber-800 border-none font-bold text-xs",
  },
  NO_SHOW: {
    label: "Không đến",
    badge: "bg-orange-100 text-orange-800 border-none font-bold text-xs",
  },
  COMPLETED: {
    label: "Hoàn thành",
    badge: "bg-indigo-100 text-indigo-800 border-none font-bold text-xs",
  },
  CANCELLED: {
    label: "Đã hủy",
    badge: "bg-red-100 text-red-800 border-none font-bold text-xs",
  },
}

const ACCENT: Record<BookingStatus, string> = {
  PENDING: "bg-amber-400",
  CONFIRMED: "bg-emerald-500",
  AWAITING_PAYMENT: "bg-amber-500",
  NO_SHOW: "bg-orange-400",
  COMPLETED: "bg-indigo-500",
  CANCELLED: "bg-slate-300",
}

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: "all", label: "Tất cả" },
  { key: "PENDING", label: "Chờ thanh toán" },
  { key: "AWAITING_PAYMENT", label: "Chờ thanh toán phí phát sinh" },
  { key: "CONFIRMED", label: "Đã xác nhận" },
  { key: "NO_SHOW", label: "Không đến" },
  { key: "COMPLETED", label: "Hoàn thành" },
  { key: "CANCELLED", label: "Đã hủy" },
]

const PLAY_MODE_FILTERS: Array<{ key: PlayModeFilter; label: string }> = [
  { key: "all", label: "Tất cả loại đơn" },
  { key: "RENTAL", label: "Thuê xe của quán" },
  { key: "BYOC", label: "Mang xe cá nhân" },
]

export function CustomerBookingsPage() {
  const navigate = useNavigate()
  const [now] = useState(() => Date.now())
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all")
  const [playModeFilter, setPlayModeFilter] = useState<PlayModeFilter>("all")
  const [currentPage, setCurrentPage] = useState(1)
  const [cancelTarget, setCancelTarget] = useState<string | null>(null)
  const [paymentTarget, setPaymentTarget] = useState<BookingListItem | null>(null)
  const [resumingId, setResumingId] = useState<string | null>(null)

  const handleFilterChange = (filter: FilterKey) => {
    setActiveFilter(filter)
    setCurrentPage(1)
  }

  const handlePlayModeFilterChange = (filter: PlayModeFilter) => {
    setPlayModeFilter(filter)
    setCurrentPage(1)
  }

  const PAGE_SIZE = 10
  const status = activeFilter === "all" ? undefined : activeFilter
  const play_mode = playModeFilter === "all" ? undefined : playModeFilter
  const { data, isLoading } = useMyBookings({
    status,
    play_mode,
    page: currentPage,
    limit: PAGE_SIZE,
  })
  const cancelMutation = useCancelBooking()
  const checkoutMutation = useCreateCheckout()

  const handleResumePayment = (bookingId: string) => {
    setResumingId(bookingId)
    checkoutMutation.mutate(bookingId, {
      onSuccess: (result) => {
        if (!result.payment_url) {
          toast.error("Không thể tạo link thanh toán. Vui lòng thử lại.")
          setResumingId(null)
          return
        }
        window.location.href = result.payment_url
      },
      onError: () => {
        toast.error("Không thể tạo link thanh toán. Vui lòng thử lại.")
        setResumingId(null)
      },
    })
  }

  const bookings = data?.data ?? []
  const cancelTargetBooking = bookings.find(
    (booking) => booking.id === cancelTarget,
  )
  const totalBookings = data?.total ?? 0
  const totalPages = Math.ceil(totalBookings / PAGE_SIZE)

  const handleCancelConfirm = () => {
    if (!cancelTarget) return
    const isCancellingHold =
      bookings.find((booking) => booking.id === cancelTarget)?.status ===
      "PENDING"
    cancelMutation.mutate(
      { bookingId: cancelTarget },
      {
        onSuccess: () => {
          setCancelTarget(null)
          toast.success(
            isCancellingHold
              ? "Đã hủy giữ chỗ."
              : "Đã hủy lịch đặt thành công!",
          )
        },
        onError: (error) => {
          const { code, message } = getApiErrorInfo(error)
          if (code === "BOOKING_NOT_CANCELLABLE") {
            setCancelTarget(null)
            toast.info("Giữ chỗ không còn hiệu lực hoặc đơn đã được hủy.")
            return
          }
          toast.error(message || "Không thể hủy đơn. Vui lòng thử lại.")
        },
      },
    )
  }

  return (
    <CustomerPageShell>
      <CustomerSubNav activeTab="bookings" />

      <ReviewReminderBanner />

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => handleFilterChange(f.key)}
            className={`py-2 px-4 rounded-xl text-xs font-bold transition-all duration-200 ${activeFilter === f.key ? "bg-slate-950 text-white shadow-md shadow-slate-900/20" : "bg-white border border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2.5">
        <span className="inline-flex items-center gap-1.5 px-1.5 text-xs font-extrabold text-slate-600">
          <Car className="h-3.5 w-3.5 text-orange-500" />
          Hình thức chơi
        </span>
        {PLAY_MODE_FILTERS.map((filter) => (
          <button
            key={filter.key}
            onClick={() => handlePlayModeFilterChange(filter.key)}
            className={cn(
              "rounded-xl px-3 py-1.5 text-xs font-bold transition-colors",
              playModeFilter === filter.key
                ? "bg-orange-500 text-white shadow-sm shadow-orange-500/20"
                : "text-slate-600 hover:bg-orange-50 hover:text-orange-700",
            )}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="py-16 text-center text-sm text-slate-500">
          Đang tải dữ liệu...
        </div>
      ) : bookings.length === 0 ? (
        <div className="py-16 bg-white border border-dashed border-slate-200 rounded-2xl text-center space-y-3">
          <HelpCircle className="h-10 w-10 text-slate-300 mx-auto" />
          <p className="text-sm font-semibold text-slate-500">
            Không tìm thấy lịch đặt nào
          </p>
          <p className="text-xs text-slate-400 max-w-xs mx-auto">
            Bạn không có giao dịch đặt lịch nào khớp với bộ lọc đã chọn.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden divide-y divide-slate-100">
            {bookings.map((booking) => {
              const sessStatus = booking.session?.status
              const checkInExpired = hasExpiredCheckInWindow(booking)
              const sessionOverride: { label: string; badge: string } | null =
                checkInExpired
                  ? null
                  : sessStatus === "ACTIVE"
                    ? {
                        label: "Đang chơi",
                        badge:
                          "bg-orange-100 text-orange-800 border-none font-bold text-xs",
                      }
                    : sessStatus === "EXTENDING"
                      ? {
                          label: "Đang gia hạn",
                          badge:
                            "bg-orange-100 text-orange-800 border-none font-bold text-xs",
                        }
                      : sessStatus === "CHECKED_IN"
                        ? {
                            label: "Đang check-in",
                            badge:
                              "bg-amber-100 text-amber-800 border-none font-bold text-xs",
                          }
                        : sessStatus === "CHECKING_OUT"
                          ? {
                              label: "Đang checkout",
                              badge:
                                "bg-blue-100 text-blue-800 border-none font-bold text-xs",
                            }
                          : null
              const effectiveStatus = checkInExpired
                ? "NO_SHOW"
                : booking.status
              const statusInfo =
                sessionOverride ??
                STATUS_LABELS[effectiveStatus] ??
                STATUS_LABELS.PENDING
              const accentOverride =
                !checkInExpired &&
                (sessStatus === "ACTIVE" || sessStatus === "EXTENDING")
                  ? "bg-orange-400"
                  : !checkInExpired &&
                      (sessStatus === "CHECKED_IN" ||
                        sessStatus === "CHECKING_OUT")
                    ? "bg-amber-400"
                    : null
              const accent =
                accentOverride ?? ACCENT[effectiveStatus] ?? "bg-slate-300"
              const slotStart = new Date(booking.slotStart)
              const slotEnd = new Date(booking.slotEnd)
              const shortId = booking.id.substring(0, 8).toUpperCase()
              const isPast = slotStart.getTime() < now
              const paymentHoldIsActive =
                booking.status === "PENDING" &&
                (!booking.paymentExpiresAt ||
                  new Date(booking.paymentExpiresAt).getTime() > now)

              return (
                <div
                  key={booking.id}
                  className="flex items-center gap-3 px-4 py-3.5 hover:bg-slate-50/70 transition-colors"
                >
                  <div
                    className={cn(
                      "w-1 self-stretch rounded-full shrink-0",
                      accent,
                    )}
                  />

                  <div className="min-w-0 flex-1 grid grid-cols-1 sm:grid-cols-[auto_1fr_auto] gap-x-4 gap-y-1 items-center">
                    {/* ID + status */}
                    <div className="flex items-center gap-2 sm:flex-col sm:items-start sm:gap-0.5 sm:w-28">
                      <span className="text-sm font-extrabold text-slate-900 font-mono">
                        #{shortId}
                      </span>
                      <Badge
                        className={cn("text-[10px] shrink-0", statusInfo.badge)}
                      >
                        {statusInfo.label}
                      </Badge>
                    </div>

                    {/* Date, time, mode */}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 font-medium">
                      <span className="font-semibold text-slate-800 sm:w-24 shrink-0">
                        {slotStart.toLocaleDateString("vi-VN")}
                      </span>
                      <span className="text-slate-400 sm:w-28 shrink-0">
                        {slotStart.toLocaleTimeString("vi-VN", {
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: false,
                        })}
                        {" – "}
                        {slotEnd.toLocaleTimeString("vi-VN", {
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: false,
                        })}
                      </span>
                      <Badge
                        className={cn(
                          "text-[10px] border-none font-bold shrink-0",
                          booking.playMode === "RENTAL"
                            ? "bg-orange-100 text-orange-700"
                            : "bg-blue-100 text-blue-700",
                        )}
                      >
                        {booking.playMode === "RENTAL"
                          ? "Thuê xe của quán"
                          : "Mang xe cá nhân"}
                      </Badge>
                      {booking.status === "PENDING" &&
                        booking.paymentExpiresAt && (
                          <span className="flex items-center gap-1 text-amber-600 font-semibold ml-2">
                            <Clock className="h-3 w-3" />
                            Giữ chỗ đến:{" "}
                            {new Date(
                              booking.paymentExpiresAt,
                            ).toLocaleTimeString("vi-VN", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 justify-end">
                      {paymentHoldIsActive && !isPast && (
                        <Button
                          size="sm"
                          className="h-8 px-3 bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs rounded-lg shadow-sm"
                          onClick={() => setPaymentTarget(booking)}
                          disabled={resumingId === booking.id}
                        >
                          {resumingId === booking.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <>
                              <CreditCard className="h-3.5 w-3.5 mr-1" />
                              Thanh toán lại
                            </>
                          )}
                        </Button>
                      )}
                      {(booking.status === "CONFIRMED" ||
                        booking.status === "PENDING") &&
                        !isPast && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 px-2 text-red-500 hover:text-red-600 hover:bg-red-50"
                            onClick={() => setCancelTarget(booking.id)}
                          >
                            <XCircle className="h-4 w-4" />
                          </Button>
                        )}
                      <Button
                        asChild
                        size="sm"
                        variant="ghost"
                        className="h-8 px-2 text-slate-500 hover:text-slate-800"
                      >
                        <Link to={`/customer/bookings/${booking.id}`}>
                          <ChevronRight className="h-4 w-4" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-100 pt-4 mt-2">
              <p className="text-xs font-bold text-slate-500">
                Hiển thị{" "}
                {Math.min((currentPage - 1) * PAGE_SIZE + 1, totalBookings)} -{" "}
                {Math.min(currentPage * PAGE_SIZE, totalBookings)} trong số{" "}
                {totalBookings} đơn đặt lịch
              </p>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage === 1}
                  onClick={() =>
                    setCurrentPage((prev) => Math.max(prev - 1, 1))
                  }
                  className="h-8 rounded-lg text-xs font-bold border-slate-200 text-slate-600 hover:bg-zinc-50"
                >
                  Trang trước
                </Button>
                {Array.from({ length: totalPages }).map((_, idx) => {
                  const page = idx + 1
                  const isCurrent = currentPage === page
                  return (
                    <Button
                      key={page}
                      variant={isCurrent ? "default" : "outline"}
                      size="sm"
                      onClick={() => setCurrentPage(page)}
                      className={cn(
                        "h-8 w-8 rounded-lg text-xs font-bold",
                        isCurrent
                          ? "bg-slate-900 text-white hover:bg-slate-850"
                          : "border-slate-200 text-slate-600 hover:bg-zinc-50",
                      )}
                    >
                      {page}
                    </Button>
                  )
                })}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage === totalPages}
                  onClick={() =>
                    setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                  }
                  className="h-8 rounded-lg text-xs font-bold border-slate-200 text-slate-600 hover:bg-zinc-50"
                >
                  Trang sau
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {cancelTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200/80 shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95 duration-200 text-left">
            <div className="h-12 w-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center text-xl shrink-0">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-black text-slate-950">
                {cancelTargetBooking?.status === "PENDING"
                  ? "Hủy giữ chỗ?"
                  : "Xác nhận hủy đặt lịch sân?"}
              </h3>
              <p className="text-xs font-semibold text-slate-500 leading-relaxed">
                {cancelTargetBooking?.status === "PENDING" ? (
                  "Đơn chưa thanh toán. Vị trí đang giữ sẽ được trả lại ngay và không có khoản tiền nào cần hoàn."
                ) : (
                  <>
                    Hủy trước <strong className="text-slate-800">24 giờ</strong>
                    : hoàn 100% phí lịch. Hủy trong 12–24h: hoàn 50%. Dưới 12h:
                    không hoàn phí lịch. Phí thuê xe và món chưa phục vụ được
                    hoàn theo trạng thái thực tế.
                  </>
                )}
              </p>
            </div>
            <div className="flex items-center gap-3 justify-end pt-2">
              <Button
                variant="outline"
                className="border-slate-200 font-bold h-10 text-xs rounded-xl"
                onClick={() => setCancelTarget(null)}
              >
                Không, giữ lịch
              </Button>
              <Button
                className="bg-red-600 hover:bg-red-700 text-white font-bold h-10 text-xs rounded-xl"
                onClick={handleCancelConfirm}
                disabled={cancelMutation.isPending}
              >
                {cancelMutation.isPending
                  ? "Đang hủy..."
                  : cancelTargetBooking?.status === "PENDING"
                    ? "Có, hủy giữ chỗ"
                    : "Có, xác nhận hủy"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {paymentTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200/80 shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95 duration-200 text-left">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center font-bold">
                  <CreditCard className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-950">
                    Chọn phương thức thanh toán
                  </h3>
                  <p className="text-xs text-slate-500 font-semibold">
                    Mã đơn #{paymentTarget.id.substring(0, 8).toUpperCase()}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 rounded-full text-slate-400 hover:text-slate-600"
                onClick={() => setPaymentTarget(null)}
              >
                <XCircle className="h-5 w-5" />
              </Button>
            </div>

            <div className="space-y-3">
              {/* Option 1: Chuyển khoản VietQR */}
              <button
                type="button"
                onClick={() => {
                  const bookingId = paymentTarget.id
                  setPaymentTarget(null)
                  void navigate(
                    routePaths.paymentBankTransfer.replace(":bookingId", bookingId),
                  )
                }}
                className="w-full flex items-center justify-between p-4 rounded-xl border border-slate-200 hover:border-orange-500 bg-white hover:bg-orange-50/50 transition-all text-left group cursor-pointer"
              >
                <div className="flex items-center gap-3.5">
                  <div className="h-11 w-11 rounded-xl bg-orange-500 text-white flex items-center justify-center shrink-0 shadow-md group-hover:scale-105 transition-transform">
                    <QrCode className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="font-bold text-slate-900 text-sm group-hover:text-orange-600 transition-colors">
                      Chuyển khoản VietQR
                    </div>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                      Quét mã QR bằng app Ngân hàng (Tự động xác nhận)
                    </p>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-slate-400 group-hover:text-orange-500 transition-colors shrink-0" />
              </button>

              {/* Option 2: VNPay Online */}
              <button
                type="button"
                onClick={() => {
                  const bookingId = paymentTarget.id
                  setPaymentTarget(null)
                  handleResumePayment(bookingId)
                }}
                disabled={resumingId === paymentTarget.id}
                className="w-full flex items-center justify-between p-4 rounded-xl border border-slate-200 hover:border-blue-500 bg-white hover:bg-blue-50/50 transition-all text-left group cursor-pointer disabled:opacity-50"
              >
                <div className="flex items-center gap-3.5">
                  <div className="h-11 w-11 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-md group-hover:scale-105 transition-transform">
                    <CreditCard className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="font-bold text-slate-900 text-sm group-hover:text-blue-600 transition-colors flex items-center gap-1.5">
                      VNPAY Online
                      {resumingId === paymentTarget.id && (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />
                      )}
                    </div>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                      Thẻ ATM, Visa, Ví VNPAY (Chuyển sang cổng VNPay)
                    </p>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-slate-400 group-hover:text-blue-500 transition-colors shrink-0" />
              </button>
            </div>

            <div className="pt-1 text-center">
              <Button
                variant="outline"
                className="w-full border-slate-200 font-bold h-10 text-xs rounded-xl text-slate-600 hover:bg-slate-50"
                onClick={() => setPaymentTarget(null)}
              >
                Hủy bỏ
              </Button>
            </div>
          </div>
        </div>
      )}
    </CustomerPageShell>
  )
}
