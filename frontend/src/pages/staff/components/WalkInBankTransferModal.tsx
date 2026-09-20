import { useState, useEffect, useMemo, useRef, useCallback } from "react"
import {
  CheckCircle2,
  Copy,
  Clock,
  Loader2,
  X,
  ShieldCheck,
  Smartphone,
  RotateCcw,
} from "lucide-react"
import { toast } from "sonner"
import type {
  BankTransferCheckout,
  PaymentComponentResponse,
  PaymentTransactionResponse,
} from "@/features/booking/types/booking.types"
import { useWebSocket } from "@/features/notifications/hooks/useWebSocket"
import { bookingApi } from "@/features/booking/api/booking.api"
import { formatCurrency } from "@/shared/lib/format"
import { useStaffOperations } from "@/pages/staff/context/StaffOperationContext"

interface WalkInBankTransferModalProps {
  isOpen: boolean
  bookingId: string
  bookingCode?: string
  bankTransfer: BankTransferCheckout
  autoCheckIn: boolean
  onSuccess: (bookingId: string, autoCheckIn: boolean) => void
  onClose: () => void
  onCancelAndChangeMethod?: (bookingId: string) => Promise<void>
}

function useCountdown(expiresAt: string): { minutes: number; seconds: number; isExpired: boolean } {
  const target = useMemo(() => new Date(expiresAt).getTime(), [expiresAt])
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, Math.floor((target - Date.now()) / 1000)),
  )

  useEffect(() => {
    const interval = setInterval(() => {
      const diff = Math.max(0, Math.floor((target - Date.now()) / 1000))
      setRemaining(diff)
      if (diff <= 0) clearInterval(interval)
    }, 1000)
    return () => clearInterval(interval)
  }, [target])

  const minutes = Math.floor(remaining / 60)
  const seconds = remaining % 60
  return { minutes, seconds, isExpired: remaining <= 0 }
}

export function WalkInBankTransferModal({
  isOpen,
  bookingId,
  bookingCode,
  bankTransfer,
  autoCheckIn,
  onSuccess,
  onClose,
  onCancelAndChangeMethod,
}: WalkInBankTransferModalProps) {
  const [isPaid, setIsPaid] = useState(false)
  const [isConfirming, setIsConfirming] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  const { confirmWalkInBankTransfer } = useStaffOperations()
  const { minutes, seconds } = useCountdown(bankTransfer.expires_at)
  const hasTriggeredSuccess = useRef(false)

  const handleCancelAndChange = async () => {
    if (!onCancelAndChangeMethod) {
      onClose()
      return
    }
    try {
      setIsCancelling(true)
      await onCancelAndChangeMethod(bookingId)
    } finally {
      setIsCancelling(false)
    }
  }

  const handleSuccess = useCallback(() => {
    if (hasTriggeredSuccess.current) return
    hasTriggeredSuccess.current = true
    setIsPaid(true)
    toast.success("Khách đã chuyển khoản thành công!")
    setTimeout(() => {
      onSuccess(bookingId, autoCheckIn)
    }, 1500)
  }, [bookingId, autoCheckIn, onSuccess])

  // 1. Realtime WebSocket listener
  useWebSocket(
    useCallback(
      (msg) => {
        const data = msg.data as {
          bookingId?: string
          booking_id?: string
          action?: string
          status?: string
        } | null
        const id = data?.bookingId ?? data?.booking_id
        if (!bookingId || id !== bookingId) return
        if (
          (msg.event === "BOOKING_UPDATED" && data?.action === "PAYMENT_CONFIRMED") ||
          msg.event === "BOOKING_PAID" ||
          msg.event === "BOOKING_PAYMENT_UPDATED" ||
          msg.event === "CUSTOMER_PAYMENT_CONFIRMED" ||
          msg.event === "payment.success"
        ) {
          handleSuccess()
        }
      },
      [bookingId, handleSuccess],
    ),
    isOpen && !isPaid,
  )

  // 2. Polling every 3s as fallback
  useEffect(() => {
    if (!isOpen || isPaid || !bookingId) return
    const pollInterval = setInterval(async () => {
      try {
        const detail = await bookingApi.getBooking(bookingId)
        if (!detail) return

        const transactions: PaymentTransactionResponse[] =
          detail.payment_transactions ?? []

        const matchingTx = transactions.find(
          (t) =>
            t.status === "SUCCESS" &&
            t.amount === bankTransfer.amount &&
            t.gateway === "VIETQR",
        )

        const components: PaymentComponentResponse[] =
          detail.payment_components ?? []
        const hasPendingComponents = components.some(
          (c) => c.status === "PENDING" || c.status === "PENDING_REFUND",
        )

        if (matchingTx && !hasPendingComponents) {
          handleSuccess()
        } else if (
          detail.status !== "PENDING" &&
          !hasPendingComponents &&
          components.length > 0
        ) {
          handleSuccess()
        }
      } catch {
        // Silent poll error
      }
    }, 3000)

    return () => clearInterval(pollInterval)
  }, [isOpen, isPaid, bookingId, bankTransfer.ref_code, bankTransfer.amount, handleSuccess])

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    toast.info(`Đã sao chép ${label}`)
  }

  const handleManualConfirm = async () => {
    setIsConfirming(true)
    try {
      const res = await confirmWalkInBankTransfer(bookingId)
      if (res?.success) {
        handleSuccess()
      }
    } finally {
      setIsConfirming(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-xl bg-orange-100 text-[#ea580c]">
              <Smartphone className="size-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Thanh Toán Chuyển Khoản QR
              </h3>
              <p className="text-xs text-slate-500">
                Mã đơn: <span className="font-bold text-[#ea580c]">{bookingCode || bookingId.slice(0, 8).toUpperCase()}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleCancelAndChange}
            disabled={isCancelling || isConfirming}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition-all cursor-pointer disabled:opacity-50"
            title="Đóng & Hủy giữ chỗ này"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5">
          {isPaid ? (
            /* PAID SUCCESS SCREEN */
            <div className="py-8 text-center space-y-4 animate-in zoom-in-95 duration-300">
              <div className="mx-auto flex size-20 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 shadow-inner">
                <CheckCircle2 className="size-12" />
              </div>
              <div className="space-y-1">
                <h4 className="text-xl font-black text-slate-900">
                  Thanh Toán Thành Công!
                </h4>
                <p className="text-sm text-slate-600">
                  Hệ thống đã nhận được tiền và xác nhận đơn đặt chỗ.
                </p>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 inline-block">
                <span className="text-xs text-emerald-800 font-medium">Số tiền đã nhận:</span>
                <p className="text-lg font-black text-emerald-700">
                  {formatCurrency(bankTransfer.amount)}
                </p>
              </div>
              <div className="pt-2 flex items-center justify-center gap-2 text-xs text-slate-500 font-medium">
                <Loader2 className="size-4 animate-spin text-[#ea580c]" />
                <span>{autoCheckIn ? "Đang chuyển vào ca chơi..." : "Đang hoàn tất đơn..."}</span>
              </div>
            </div>
          ) : (
            /* QR PAYMENT SCANNING VIEW */
            <>
              {/* Timer Bar */}
              <div className="flex items-center justify-between rounded-xl bg-orange-50/80 border border-orange-100 px-4 py-2.5 text-xs">
                <div className="flex items-center gap-1.5 font-semibold text-orange-900">
                  <Clock className="size-4 text-[#ea580c]" />
                  <span>Thời gian giữ chỗ thanh toán:</span>
                </div>
                <span className="font-mono font-black text-sm text-[#ea580c]">
                  {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
                </span>
              </div>

              {/* QR Image & Bank Details Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 items-center">
                {/* QR Code Frame */}
                <div className="flex flex-col items-center justify-center p-3 rounded-2xl bg-white border border-slate-200 shadow-xs">
                  <div className="relative size-48 overflow-hidden rounded-xl bg-slate-50 flex items-center justify-center">
                    {bankTransfer.qr_image_data_url ? (
                      <img
                        src={bankTransfer.qr_image_data_url}
                        alt="VietQR Payment"
                        className="size-full object-contain"
                      />
                    ) : (
                      <div className="text-center p-4 text-xs text-slate-400">
                        Đang tạo mã QR...
                      </div>
                    )}
                  </div>
                  <span className="mt-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Quét bằng mọi App Ngân hàng
                  </span>
                </div>

                {/* Transfer Information */}
                <div className="space-y-2.5 text-xs">
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-2.5 space-y-0.5">
                    <span className="text-[10px] uppercase font-bold text-slate-500">Ngân hàng</span>
                    <p className="font-bold text-slate-900 text-xs">{bankTransfer.bank_name}</p>
                  </div>

                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-2.5 space-y-0.5">
                    <span className="text-[10px] uppercase font-bold text-slate-500">Chủ tài khoản</span>
                    <p className="font-bold text-slate-900 text-xs">{bankTransfer.account_name}</p>
                  </div>

                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-2.5 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-500 block">Số tài khoản</span>
                      <span className="font-mono font-bold text-slate-900 text-xs">{bankTransfer.account_number}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(bankTransfer.account_number, "Số tài khoản")}
                      className="rounded-lg p-1.5 text-slate-500 hover:bg-white hover:text-slate-900 transition-all cursor-pointer"
                      title="Sao chép"
                    >
                      <Copy className="size-3.5" />
                    </button>
                  </div>

                  <div className="rounded-xl border border-orange-200 bg-orange-50/50 p-2.5 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-orange-800 block">Nội dung chuyển khoản</span>
                      <span className="font-mono font-extrabold text-[#ea580c] text-xs">{bankTransfer.ref_code}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(bankTransfer.ref_code, "Nội dung chuyển khoản")}
                      className="rounded-lg p-1.5 text-[#ea580c] hover:bg-white transition-all cursor-pointer"
                      title="Sao chép"
                    >
                      <Copy className="size-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Total Amount Banner */}
              <div className="rounded-xl border border-[#ffdbca] bg-[#fff7ed] p-3.5 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-700 block">Tổng số tiền cần thanh toán:</span>
                  <span className="text-[11px] text-slate-500">Khách quét mã sẽ tự điền chính xác số tiền</span>
                </div>
                <span className="text-lg font-black text-[#ea580c]">
                  {formatCurrency(bankTransfer.amount)}
                </span>
              </div>

              {/* Realtime Waiting Indicator */}
              <div className="flex items-center justify-center gap-2 py-1 text-xs text-slate-600 font-medium">
                <Loader2 className="size-4 animate-spin text-[#ea580c]" />
                <span>Đang chờ khách quét mã và chuyển tiền...</span>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex flex-col sm:flex-row items-center gap-2 justify-between border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleCancelAndChange}
                  disabled={isCancelling || isConfirming}
                  className="w-full sm:w-auto flex items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-red-50/70 px-3.5 py-2.5 text-xs font-bold text-red-600 hover:bg-red-100/80 transition-all cursor-pointer disabled:opacity-50"
                  title="Hủy giữ chỗ này để đổi sang tiền mặt hoặc chọn xe khác"
                >
                  {isCancelling ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <RotateCcw className="size-3.5" />
                  )}
                  <span>Hủy đơn & Đổi cách khác</span>
                </button>

                <div className="flex w-full sm:w-auto flex-col sm:flex-row items-center gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={isCancelling || isConfirming}
                    className="w-full sm:w-auto rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all cursor-pointer disabled:opacity-50"
                  >
                    Đóng & Lưu chờ sau
                  </button>

                  <button
                    type="button"
                    onClick={handleManualConfirm}
                    disabled={isConfirming || isCancelling}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isConfirming ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <ShieldCheck className="size-4" />
                    )}
                    <span>Xác nhận đã nhận tiền</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
