import { useState } from "react"
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  CreditCard,
  Hash,
  Home,
  Loader2,
  ReceiptText,
  RotateCcw,
  Trophy,
} from "lucide-react"
import { Link, useSearchParams } from "react-router"
import { useQuery } from "@tanstack/react-query"
import { routePaths } from "@/app/router/route-paths"
import { Button } from "@/shared/ui/button"
import { Card, CardContent } from "@/shared/ui/card"
import { bookingApi } from "@/features/booking/api/booking.api"
import { formatCurrency, formatPaymentGateway } from "@/shared/lib/format"

/**
 * A result page is a payment receipt, not the booking invoice. The booking
 * detail remains the single place that consolidates all booking and
 * additional fees across the booking lifecycle.
 */
export function PaymentResultPage() {
  const [now] = useState(() => Date.now())
  const [searchParams] = useSearchParams()
  const status = searchParams.get("status")
  const txnRef = searchParams.get("txn_ref")
  const reason = searchParams.get("reason")
  const responseCode = searchParams.get("response_code")
  const gatewayReportedSuccess = status === "success"
  const isCounterPayment = txnRef?.startsWith("ctr_") ?? false
  /**
   * Phí dự thi đi theo một luồng khác hẳn đơn đặt sân, và trang này vốn viết
   * cho đơn đặt: nói "giữ chỗ", dẫn về "danh sách đơn đặt", mời "đặt lịch mới".
   * Khách vừa huỷ thanh toán một giải đấu đọc vào không hiểu mình đang ở đâu.
   */
  const isContestEntry = txnRef?.startsWith("contest_") ?? false

  const {
    data: transaction,
    isFetching: isFetchingTransaction,
    isError: isTransactionError,
  } = useQuery({
    queryKey: ["payment-result-transaction", txnRef],
    queryFn: () => bookingApi.getPaymentTransaction(txnRef!),
    // The return URL is only a client redirect. Always verify its transaction
    // record before deciding whether this payment actually succeeded.
    enabled: !!txnRef,
    retry: 1,
  })

  const bookingId =
    searchParams.get("booking_id") ??
    searchParams.get("bookingId") ??
    transaction?.bookingId ??
    (txnRef ? txnRefToBookingId(txnRef) : undefined)
  const { data: booking, isFetching: isFetchingBooking } = useQuery({
    queryKey: ["payment-result-booking", bookingId],
    queryFn: () => bookingApi.getBooking(bookingId!),
    enabled: !!bookingId,
    retry: 1,
  })
  const isPackageReturn = txnRef?.startsWith("pkg_") === true
  // A URL parameter alone can be edited or arrive before the server-side IPN.
  // Only a persisted SUCCESS transaction is proof that money was accepted.
  const isSuccess = gatewayReportedSuccess && !!txnRef && (isPackageReturn || transaction?.status === "SUCCESS")
  const isVerifyingSuccess = gatewayReportedSuccess && (!txnRef || (!isPackageReturn && transaction?.status !== "SUCCESS"))
  const verificationUnavailable = isVerifyingSuccess && (!txnRef || isTransactionError || transaction?.status === "FAILED")
  const isCheckingFailedPayment = !gatewayReportedSuccess && !!txnRef && !transaction && isFetchingTransaction
  const isCheckingFailedBooking = !gatewayReportedSuccess && !!bookingId && !booking && isFetchingBooking
  const isCheckingOutcome = isCheckingFailedPayment || isCheckingFailedBooking
  const isPendingHold = booking?.status === "PENDING"
  const isContestBooking = Boolean(booking?.contestId)
  const paymentExpiry = booking?.paymentExpiresAt ? new Date(booking.paymentExpiresAt) : null
  const holdIsActive = isPendingHold && (!paymentExpiry || paymentExpiry.getTime() > now)
  const isAdditionalPayment = transaction?.additionalPayment ?? isCounterPayment
  const isPackagePurchase =
    isSuccess && isPackageReturn && isTransactionError
  const paidAmount = transaction ? Number(transaction.amount) : undefined
  const receiptLines = transaction?.components ?? []
  const paymentTitle = isAdditionalPayment
    ? "Biên nhận thanh toán phí phát sinh"
    : isPackagePurchase
      ? "Thanh toán gói thành công"
      : isContestEntry
        ? "Đã thanh toán phí dự thi"
        : "Biên nhận thanh toán đơn đặt"

  const handleResumePayment = async () => {
    if (!bookingId) return
    try {
      const result = await bookingApi.createCheckout(bookingId)
      if (!result.payment_url) throw new Error("Không nhận được liên kết thanh toán")
      window.location.href = result.payment_url
    } catch {
      // The booking detail has the definitive status and provides a safe
      // recovery path when the checkout link cannot be recreated here.
      window.location.href = `/booking/${bookingId}`
    }
  }

  const userCancelled = responseCode === "24"

  // Mã 24 nghĩa là khách TỰ bấm huỷ ở cổng, và máy chủ huỷ luôn đăng ký giải để
  // nhả suất cho người khác. Mọi mã khác là hỏng ngoài ý muốn — sai OTP, lỗi
  // ngân hàng — nên đăng ký vẫn còn và khách trả lại được.
  const failureDescription = isContestEntry
    ? userCancelled
      ? "Bạn đã huỷ giao dịch tại VNPay, nên đăng ký dự giải này cũng được huỷ theo và suất đã trả lại cho người khác. Muốn tham gia thì đăng ký lại từ đầu."
      : "Giao dịch chưa hoàn tất. Đăng ký dự giải của bạn vẫn được giữ trong thời hạn thanh toán — hãy thử thanh toán lại."
    : userCancelled
      ? "Bạn đã hủy giao dịch tại VNPay. Đơn vẫn được giữ chỗ trong thời hạn thanh toán, nếu còn hiệu lực."
      : "Giao dịch chưa hoàn tất. Đơn chỉ được giữ chỗ đến hết thời hạn thanh toán; bạn có thể tiếp tục thanh toán nếu đơn còn hiệu lực."

  return (
    <main className="min-h-screen bg-[#f3f6f8] px-4 py-10 md:px-6 md:py-16">
      <Card className="mx-auto max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <CardContent className="p-0">
          <section className="px-6 py-8 md:px-10 md:py-10">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className={`flex size-14 shrink-0 items-center justify-center rounded-2xl ${isSuccess ? "bg-emerald-50 text-emerald-700" : isVerifyingSuccess ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-600"}`}>
                {isSuccess ? <CheckCircle2 className="size-8" /> : <AlertCircle className="size-8" />}
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${isSuccess ? "bg-emerald-50 text-emerald-700" : isVerifyingSuccess ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"}`}>
                {isSuccess ? "Đã hoàn tất" : isVerifyingSuccess ? "Đang xác thực" : "Chưa hoàn tất"}
              </span>
            </div>

            <div className="mt-5">
              <h1 className="text-3xl font-black tracking-tight text-slate-950 md:text-4xl">
                {isSuccess
                  ? paymentTitle
                  : verificationUnavailable
                    ? "Chưa thể xác thực thanh toán"
                    : isVerifyingSuccess
                      ? "Đang xác thực thanh toán"
                      : isContestEntry
                        ? userCancelled
                          ? "Đã huỷ đăng ký dự giải"
                          : "Chưa thanh toán được phí dự thi"
                        : "Thanh toán chưa hoàn tất"}
              </h1>
              <p className="mt-3 max-w-xl text-sm font-medium leading-6 text-slate-600">
                {isSuccess
                  ? isAdditionalPayment
                    ? "Biên nhận này chỉ ghi nhận khoản phát sinh vừa thanh toán. Tổng kết toàn bộ đơn nằm trong chi tiết đơn đặt."
                    : isPackagePurchase
                      ? "Gói của bạn đã được kích hoạt và sẵn sàng sử dụng."
                      : "Biên nhận này ghi nhận khoản thanh toán của đơn. Các khoản phát sinh sau phiên chơi sẽ được thanh toán riêng nếu có."
                  : isVerifyingSuccess
                    ? verificationUnavailable
                      ? "Chưa thể đối chiếu giao dịch ngay lúc này. Vui lòng mở chi tiết đơn để kiểm tra trước khi thực hiện bất kỳ thanh toán nào khác."
                      : "Chúng tôi đang đối chiếu giao dịch với hệ thống thanh toán. Vui lòng không thanh toán lại trong lúc này."
                    : failureDescription}
              </p>
            </div>

            {isSuccess && isFetchingTransaction && !transaction && (
              <div className="mt-6 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600">
                <Loader2 className="size-5 animate-spin text-orange-500" />
                Đang tải biên nhận thanh toán...
              </div>
            )}

            {verificationUnavailable && (
              <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold leading-6 text-amber-800">
                Không tạo giao dịch mới từ trang này để tránh thanh toán trùng.
              </div>
            )}

            {isSuccess && typeof paidAmount === "number" && (
              <PaymentReceipt
                additionalPayment={isAdditionalPayment}
                amount={paidAmount}
                lines={receiptLines}
                txnRef={txnRef}
                gateway={transaction?.gateway}
                paidAt={transaction?.paidAt}
              />
            )}

            {!isSuccess && !isVerifyingSuccess && (reason || responseCode) && (
              <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold leading-6 text-red-700">
                {reason ? `Lý do: ${reason}` : `Mã phản hồi VNPay: ${responseCode}`}
              </div>
            )}

            {!isSuccess && !isVerifyingSuccess && !isContestEntry && isFetchingBooking && (
              <div className="mt-6 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600">
                <Loader2 className="size-5 animate-spin text-orange-500" />
                Đang kiểm tra thời hạn giữ chỗ...
              </div>
            )}

            {isCheckingFailedPayment && !isContestEntry && (
              <div className="mt-6 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600">
                <Loader2 className="size-5 animate-spin text-orange-500" />
                Đang kiểm tra trạng thái đơn đặt...
              </div>
            )}

            {!isSuccess && !isVerifyingSuccess && paymentExpiry && (
              <p className={`mt-4 text-sm font-semibold ${holdIsActive ? "text-amber-700" : "text-red-700"}`}>
                {holdIsActive
                  ? `Giữ chỗ đến: ${formatPaymentTime(booking?.paymentExpiresAt ?? undefined)}`
                  : "Thời hạn giữ chỗ của đơn đã kết thúc."}
              </p>
            )}
          </section>

          <footer className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 px-6 py-5 sm:flex-row sm:items-center sm:justify-between md:px-10">
            {isPackagePurchase ? (
              <Button asChild size="lg" className="h-11 rounded-lg bg-orange-600 px-5 text-sm font-bold hover:bg-orange-700">
                <Link to="/customer/packages">
                  <Home className="size-4" /> Xem gói của tôi
                </Link>
              </Button>
            ) : isContestEntry ? (
              <Button asChild size="lg" variant="outline" className="h-11 rounded-lg px-5 text-sm font-bold">
                <Link to={routePaths.customerContestRegistrations}>
                  <Trophy className="size-4" /> Đăng ký dự giải của tôi
                </Link>
              </Button>
            ) : (
              <Button asChild size="lg" variant="outline" className="h-11 rounded-lg px-5 text-sm font-bold">
                <Link to="/customer/bookings">
                  <Home className="size-4" /> Danh sách đơn đặt
                </Link>
              </Button>
            )}

            {isContestBooking && bookingId ? (
              <Button asChild size="lg" variant="outline" className="h-11 rounded-lg px-5 text-sm font-bold">
                <Link to={`${routePaths.customerContestRegistrations}?bookingId=${encodeURIComponent(bookingId)}`}>
                  <Trophy className="size-4" /> Xem đăng ký giải
                </Link>
              </Button>
            ) : null}

            {isSuccess && isContestEntry ? (
              // Phí dự thi không có đơn đặt để mở, nên nút chính dẫn về nơi
              // khách theo dõi đăng ký và mã điểm danh của mình.
              <Button asChild size="lg" className="h-11 rounded-lg bg-orange-600 px-5 text-sm font-bold hover:bg-orange-700">
                <Link to={routePaths.customerContestRegistrations}>
                  Xem đăng ký dự giải <ArrowRight className="size-4" />
                </Link>
              </Button>
            ) : isSuccess && bookingId ? (
              <Button asChild size="lg" className="h-11 rounded-lg bg-orange-600 px-5 text-sm font-bold hover:bg-orange-700">
                <Link to={`/booking/${bookingId}`}>
                  Xem chi tiết đơn đặt <ArrowRight className="size-4" />
                </Link>
              </Button>
            ) : !isSuccess && !isVerifyingSuccess && !isCheckingOutcome && holdIsActive && bookingId ? (
              <Button size="lg" onClick={handleResumePayment} className="h-11 rounded-lg bg-orange-600 px-5 text-sm font-bold hover:bg-orange-700">
                <RotateCcw className="size-4" /> Thanh toán lại
              </Button>
            ) : !isSuccess && isVerifyingSuccess && verificationUnavailable && bookingId ? (
              <Button asChild size="lg" className="h-11 rounded-lg bg-orange-600 px-5 text-sm font-bold hover:bg-orange-700">
                <Link to={`/booking/${bookingId}`}>
                  Kiểm tra đơn đặt <ArrowRight className="size-4" />
                </Link>
              </Button>
            ) : !isSuccess && !isVerifyingSuccess && !isCheckingOutcome && isContestEntry ? (
              // Huỷ rồi thì phải đăng ký lại từ đầu, nên dẫn thẳng về danh sách
              // giải chứ không mời "thanh toán lại" một đăng ký đã không còn.
              <Button asChild size="lg" className="h-11 rounded-lg bg-orange-600 px-5 text-sm font-bold hover:bg-orange-700">
                <Link to={routePaths.contests}>
                  <Trophy className="size-4" /> {userCancelled ? "Đăng ký lại" : "Xem giải đấu"}
                </Link>
              </Button>
            ) : !isSuccess && !isVerifyingSuccess && !isCheckingOutcome ? (
              <Button asChild size="lg" className="h-11 rounded-lg bg-orange-600 px-5 text-sm font-bold hover:bg-orange-700">
                <Link to="/booking/create">
                  <RotateCcw className="size-4" /> Đặt lịch mới
                </Link>
              </Button>
            ) : null}
          </footer>
        </CardContent>
      </Card>
    </main>
  )
}

function PaymentReceipt({
  additionalPayment,
  amount,
  lines,
  txnRef,
  gateway,
  paidAt,
}: {
  additionalPayment: boolean
  amount: number
  lines: { type: string; amount: number }[]
  txnRef: string | null
  gateway?: string
  paidAt?: string
}) {
  const hasLines = lines.length > 0

  return (
    <section className="mt-7 rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4 md:p-5">
      <div className="flex items-center gap-2 text-emerald-900">
        <ReceiptText className="size-5" />
        <h2 className="font-bold">Chi tiết khoản vừa thanh toán</h2>
      </div>

      <div className="mt-4 divide-y divide-emerald-100 border-y border-emerald-100">
        {hasLines ? (
          lines.map((line, index) => (
            <ReceiptLine
              key={`${line.type}-${index}`}
              label={formatPaymentResultComponent(line.type, additionalPayment)}
              amount={Number(line.amount)}
            />
          ))
        ) : (
          <ReceiptLine
            label={additionalPayment ? "Phí phát sinh tại quầy" : "Khoản thanh toán đơn đặt"}
            amount={amount}
          />
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-4 rounded-xl bg-emerald-100 px-4 py-3 text-emerald-950">
        <span className="font-bold">Tổng đã thanh toán lần này</span>
        <span className="text-xl font-black tabular-nums">{formatCurrency(amount)}</span>
      </div>

      {additionalPayment && (
        <p className="mt-3 text-xs font-medium leading-5 text-emerald-800">
          Không bao gồm khoản thanh toán ban đầu của đơn.
        </p>
      )}

      <div className="mt-5 grid gap-3 border-t border-emerald-100 pt-4 text-sm sm:grid-cols-2">
        <ReceiptMeta icon={<CreditCard className="size-4" />} label="Phương thức" value={formatGateway(gateway)} />
        <ReceiptMeta icon={<Clock3 className="size-4" />} label="Thời gian thanh toán" value={formatPaymentTime(paidAt)} />
        {txnRef && (
          <div className="sm:col-span-2">
            <ReceiptMeta icon={<Hash className="size-4" />} label="Mã giao dịch" value={txnRef} mono />
          </div>
        )}
      </div>
    </section>
  )
}

function ReceiptLine({ label, amount }: { label: string; amount: number }) {
  const isDiscount = amount < 0
  return (
    <div className="flex items-center justify-between gap-4 py-3 text-sm">
      <span className="text-emerald-950">{label}</span>
      <span className={`shrink-0 font-bold tabular-nums ${isDiscount ? "text-emerald-700" : "text-emerald-950"}`}>
        {isDiscount ? "-" : ""}{formatCurrency(Math.abs(amount))}
      </span>
    </div>
  )
}

function ReceiptMeta({
  icon,
  label,
  value,
  mono = false,
}: {
  icon: React.ReactNode
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex min-w-0 items-start gap-2 text-slate-600">
      <span className="mt-0.5 shrink-0 text-slate-400">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
        <p className={`mt-0.5 break-all font-bold text-slate-900 ${mono ? "font-mono text-xs" : ""}`}>{value}</p>
      </div>
    </div>
  )
}

function formatPaymentResultComponent(type: string, additionalPayment: boolean): string {
  const labels: Record<string, string> = {
    BOOKING_PAYMENT: "Khoản thanh toán đơn đặt",
    COUNTER_SERVICE: "Phí phát sinh tại quầy",
    SLOT_FEE: "Phí lịch chơi",
    RENTAL_FEE: "Phí thuê xe",
    CONTEST_ENTRY_FEE: "Phí tham gia giải đấu",
    FNB_PREORDER: additionalPayment ? "Đồ ăn & thức uống gọi tại quầy" : "Đồ ăn & thức uống đặt trước",
    FB_PREORDER: additionalPayment ? "Đồ ăn & thức uống gọi tại quầy" : "Đồ ăn & thức uống đặt trước",
    FNB_ON_SITE: "Đồ ăn & thức uống gọi tại quầy",
    EXTENSION_FEE: "Phí gia hạn ca chơi",
    DAMAGE_CHARGE: "Phí đền bù hư hỏng",
    PROMOTION_DISCOUNT: "Ưu đãi áp dụng",
  }
  return labels[type] ?? (additionalPayment ? "Phí phát sinh tại quầy" : "Khoản thanh toán đơn đặt")
}

function formatGateway(gateway?: string): string {
  return formatPaymentGateway(gateway)
}

function formatPaymentTime(value?: string): string {
  if (!value) return "Đang cập nhật"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Đang cập nhật"
  return date.toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function txnRefToBookingId(txnRef: string): string | undefined {
  if (txnRef.length !== 32) return undefined
  return [
    txnRef.substring(0, 8),
    txnRef.substring(8, 12),
    txnRef.substring(12, 16),
    txnRef.substring(16, 20),
    txnRef.substring(20, 32),
  ].join("-")
}
