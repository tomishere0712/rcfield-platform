import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeft, CheckCircle2, Clock, Copy, Loader2, TimerOff } from "lucide-react"
import { toast } from "sonner"

import { bookingApi } from "@/features/booking/api/booking.api"
import { customerPackageApi } from "@/features/customer-packages/api/customer-package.api"
import type { BankTransferCheckout } from "@/features/booking/types/booking.types"
import { useWebSocket } from "@/features/notifications/hooks/useWebSocket"
import { Button } from "@/shared/ui/button"
import { cn } from "@/shared/lib/utils"
import { routePaths } from "@/app/router/route-paths"

/**
 * Màn chờ chuyển khoản.
 *
 * Khách quét mã bằng điện thoại, còn màn hình này ở trên máy khác — nên nó phải
 * tự biết khi nào tiền về. Hai đường song song:
 *
 * 1. WebSocket, thường về trong ~1 giây.
 * 2. Hỏi lại mỗi 5 giây, làm lưới an toàn. Mất kết nối một lần lúc demo là hỏng
 *    cả buổi, và một truy vấn nhỏ mỗi 5 giây rẻ hơn nhiều so với rủi ro đó.
 *
 * Đúng ba trạng thái: đang chờ, thành công, hết hạn. Không có trạng thái trung
 * gian cho việc chuyển thiếu — mã QR đã mang sẵn số tiền nên khách không tự gõ.
 */

type Phase = "waiting" | "paid" | "expired"

function formatVnd(value: number) {
  return `${value.toLocaleString("vi-VN")}đ`
}

function useCountdown(expiresAt: string): number {
  const target = useMemo(() => new Date(expiresAt).getTime(), [expiresAt])
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, Math.floor((target - Date.now()) / 1000)),
  )

  useEffect(() => {
    const id = setInterval(() => {
      setRemaining(Math.max(0, Math.floor((target - Date.now()) / 1000)))
    }, 1000)
    return () => clearInterval(id)
  }, [target])

  return remaining
}

/** Số giây để khách kịp đọc màn hình thành công trước khi chuyển trang. */
const REDIRECT_SECONDS = 10

/**
 * Thứ đang được trả tiền.
 *
 * Cách nhận biết "tiền đã về" khác nhau theo từng loại: phiếu đặt sân đổi trạng
 * thái khỏi PENDING, còn gói slot thì chuyển sang ACTIVE. Toàn bộ phần hiển thị
 * — mã QR, đếm ngược, màn thành công — giống hệt nhau, nên chỉ tách đúng phần
 * nhận biết ra thành tham số thay vì chép cả màn hình ra bản thứ hai.
 */
export type PaymentSubject =
  | { kind: "booking"; bookingId: string }
  | { kind: "package"; customerPackageId: string }
  /**
   * Khoản phát sinh cuối phiên: gia hạn, đồ ăn tại quầy, đền bù hư hỏng.
   *
   * KHÔNG dùng `kind: "booking"` cho trường hợp này. Lúc tất toán, đơn đã ở
   * CONFIRMED hoặc COMPLETED chứ không còn PENDING — mà cách nhận biết của
   * nhánh booking là "đơn đã rời khỏi PENDING chưa". Điều kiện đó đúng ngay từ
   * lần hỏi đầu tiên, nên màn hình báo đã thanh toán trước khi có đồng nào về.
   *
   * Ở đây phải soi chính GIAO DỊCH, không soi trạng thái đơn.
   */
  | { kind: "settlement"; bookingId: string; txnRef: string }

export function BankTransferQrPanel({
  subject,
  checkout,
  onPaid,
  onContinue,
  onExpired,
  onPayLater,
  onChangeMethod,
}: {
  subject: PaymentSubject
  checkout: BankTransferCheckout
  /** Chạy đúng một lần ngay khi phát hiện tiền về. */
  onPaid: () => void
  /** Chạy khi hết đếm ngược, hoặc khi khách bấm đi ngay. */
  onContinue?: () => void
  onExpired?: () => void
  /** Chạy khi khách bấm chọn thanh toán sau (giữ chỗ trong 30 phút). */
  onPayLater?: () => void
  /** Chạy khi khách muốn đổi phương thức thanh toán khác. */
  onChangeMethod?: () => void
}) {
  const bookingId = subject.kind === "booking" ? subject.bookingId : null
  // Chỉ giữ đúng một mẩu state: "realtime đã báo tiền về chưa". Hết hạn và
  // "đã trả theo dữ liệu hỏi lại" đều suy ra được, nên không cần state riêng —
  // và suy ra thì không bao giờ lệch nhau.
  const [paidByRealtime, setPaidByRealtime] = useState(false)
  const remaining = useCountdown(checkout.expires_at)

  // Đường 1 — realtime.
  useWebSocket(
    useCallback(
      (msg) => {
        const data = msg.data as {
          bookingId?: string
          booking_id?: string
        } | null
        const id = data?.bookingId ?? data?.booking_id
        // Chỉ nhánh đơn đặt mới tin sự kiện này. Khoản phát sinh cuối phiên có
        // nhiều lý do khiến đơn được cập nhật mà chẳng liên quan tới tiền.
        if (!bookingId || id !== bookingId) return
        if (msg.event === "BOOKING_UPDATED" || msg.event === "BOOKING_PAID") {
          setPaidByRealtime(true)
        }
      },
      [bookingId],
    ),
    !paidByRealtime,
  )

  // Đường 2 — lưới an toàn khi realtime rớt.
  const { data: booking } = useQuery({
    queryKey: ["booking-payment-poll", bookingId],
    queryFn: () => bookingApi.getBooking(bookingId!),
    enabled: Boolean(bookingId) && !paidByRealtime && remaining > 0,
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
  })

  // Gói slot không có sự kiện realtime riêng, nên chỉ dựa vào hỏi lại. Đọc
  // nguyên danh sách gói của khách rồi lọc ra đúng gói đang chờ — rẻ hơn thêm
  // một endpoint chỉ để tra một dòng.
  const packageId = subject.kind === "package" ? subject.customerPackageId : null
  const { data: myPackages } = useQuery({
    queryKey: ["package-payment-poll", packageId],
    queryFn: () => customerPackageApi.listMine(),
    enabled: Boolean(packageId) && remaining > 0,
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
  })

  // Khoản phát sinh cuối phiên: hỏi thẳng giao dịch, vì trạng thái đơn không
  // nói được gì — nó đã rời PENDING từ lúc khách trả tiền đặt lịch.
  const settlementRef = subject.kind === "settlement" ? subject.txnRef : null
  const { data: settlementTx } = useQuery({
    queryKey: ["settlement-payment-poll", settlementRef],
    queryFn: () => bookingApi.getPaymentTransaction(settlementRef!),
    enabled: Boolean(settlementRef) && remaining > 0,
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
    retry: false,
  })

  const paidByPolling = settlementRef
    ? settlementTx?.status === "SUCCESS"
    : bookingId
      ? Boolean(booking?.status && booking.status !== "PENDING")
      : Boolean(myPackages?.some((p) => p.id === packageId && p.status === "ACTIVE"))
  const paid = paidByRealtime || paidByPolling

  const phase: Phase = paid ? "paid" : remaining <= 0 ? "expired" : "waiting"

  // Báo ra ngoài đúng một lần cho mỗi trạng thái cuối.
  const notified = useRef<Phase | null>(null)
  useEffect(() => {
    if (phase === "waiting" || notified.current === phase) return
    notified.current = phase
    if (phase === "paid") onPaid()
    else onExpired?.()
  }, [phase, onPaid, onExpired])

  if (phase === "paid") {
    return <PaidPanel onContinue={onContinue} />
  }

  if (phase === "expired") {
    return (
      <div className="rounded-2xl border border-[#e5e2e1] bg-[#fcf8f8] p-8 text-center">
        <TimerOff className="mx-auto size-12 text-[#adaaaa]" />
        <h3 className="mt-4 text-lg font-black text-[#1c1b1b]">
          Hết thời gian giữ chỗ
        </h3>
        <p className="mt-1.5 text-sm text-[#747878]">
          Mã này không còn hiệu lực. Nếu bạn đã chuyển tiền, liên hệ quán để
          được hỗ trợ — tiền vẫn được ghi nhận trong sổ đối soát.
        </p>
        {onContinue && (
          <Button
            type="button"
            className="mt-5 bg-slate-900 hover:bg-slate-800 text-white font-bold h-10 px-5 text-xs rounded-xl"
            onClick={onContinue}
          >
            Quay lại đơn của tôi
          </Button>
        )}
      </div>
    )
  }

  const minutes = Math.floor(remaining / 60)
  const seconds = remaining % 60
  const urgent = remaining <= 120

  return (
    <div className="rounded-2xl border border-[#e5e2e1] bg-white p-6">
      {/*
        Bó toàn bộ nội dung vào đúng MỘT cột hẹp. Trước đây thẻ QR bị giới hạn
        300px còn hai dòng số tài khoản kéo hết chiều ngang panel, nên số tài
        khoản văng sang mép phải cách mã QR cả gang tay — mắt phải nhảy qua một
        vùng trống lớn để nối hai thứ vốn thuộc về nhau.
      */}
      <div className="mx-auto w-full max-w-[340px]">
        {checkout.is_sandbox && (
          <div className="mb-4 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
            <span className="font-bold">Giao dịch mô phỏng.</span> Không có tiền
            thật nào được chuyển.
          </div>
        )}

        {/*
          ⚠️ Chỉ gắn nhãn VietQR khi đây là mã ngân hàng THẬT. Ở chế độ mô
          phỏng, nội dung mã là đường dẫn tới trang ngân hàng giả lập chứ không
          phải chuỗi VietQR — dán logo VietQR lên đó là nói dối khách rằng họ
          sắp quét một mã ngân hàng.

          Nhưng chỗ của logo vẫn phải có gì đó, nếu không thẻ mô phỏng bị hụt
          mất phần đầu và trông như tải lỗi. Thay bằng một nhãn chữ, cũng để ai
          chụp riêng thẻ gửi đi vẫn biết đây là mã giả lập.
        */}
        <div
          className={cn(
            "rounded-xl border bg-white p-5 text-center",
            checkout.is_sandbox ? "border-amber-200" : "border-[#e5e2e1]",
          )}
        >
          {checkout.is_sandbox ? (
            <span className="inline-flex h-9 items-center rounded-full bg-amber-100 px-3 text-[11px] font-black uppercase tracking-[0.14em] text-amber-800">
              Mã mô phỏng
            </span>
          ) : (
            <img
              src="/brand/vietqr-logo.png"
              alt="VietQR"
              width={831}
              height={311}
              className="mx-auto h-9 w-auto"
            />
          )}

          <div
            className={cn(
              "relative mx-auto mt-3 w-fit rounded-xl border-2 p-1.5",
              checkout.is_sandbox ? "border-amber-300" : "border-[#1e427e]",
            )}
          >
            <img
              src={checkout.qr_image_data_url}
              alt={`Mã QR chuyển ${formatVnd(checkout.amount)} tới ${checkout.account_name}`}
              className="block size-56"
            />

            {!checkout.is_sandbox && (
              <span className="absolute left-1/2 top-1/2 flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-lg bg-white">
                <img
                  src="/brand/vietqr-mark.png"
                  alt=""
                  aria-hidden
                  width={223}
                  height={223}
                  className="size-7"
                />
              </span>
            )}
          </div>

          {/*
            Dưới mã QR chỉ nói NGƯỜI NHẬN là ai — thứ khách phải soi trước khi
            bấm xác nhận trong app ngân hàng. Số tài khoản không nằm ở đây: nó
            đã có ở khối bên dưới kèm nút sao chép, và bày hai lần trên cùng một
            màn hình khiến người đọc tưởng là hai tài khoản khác nhau.

            Cũng bỏ luôn nhãn "Tên chủ TK:" / "Ngân hàng:". Nhãn kèm giá trị
            viết theo lối `inline` rồi căn giữa thì mỗi dòng dài một kiểu, mép
            trái mép phải đều so le — chính là chỗ trông "không đều". Đặt ngay
            dưới một mã QR, một cái tên in đậm và một tên ngân hàng đã tự nói
            được nó là gì.
          */}
          <div className="mt-3 leading-snug">
            <p className="text-sm font-bold text-[#1c1b1b]">
              {checkout.account_name}
            </p>
            <p className="mt-0.5 text-xs text-[#747878]">{checkout.bank_name}</p>
          </div>
        </div>

        {/*
          Số tiền và đồng hồ đếm ngược thuộc về giao dịch này chứ không thuộc
          về tài khoản, nên để ngoài thẻ. Số tiền là chữ to nhất màn hình:
          khách cần biết mình sắp mất bao nhiêu trước khi bấm xác nhận trong
          app ngân hàng.
        */}
        <div className="mt-5 text-center">
          <p className="text-[2rem] font-black leading-none tracking-tight text-[#1c1b1b]">
            {formatVnd(checkout.amount)}
          </p>
          <div
            className={cn(
              "mt-2.5 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold tabular-nums",
              urgent ? "bg-red-50 text-red-700" : "bg-[#f6f4f4] text-[#5d5f5f]",
            )}
          >
            <Clock className="size-3.5" />
            Còn {minutes}:{String(seconds).padStart(2, "0")}
          </div>
        </div>

        {/*
          Lối thoát cho người quét không được, phải gõ tay trong app ngân hàng.
          Chỉ bày hai thứ thật sự phải gõ — số tài khoản và nội dung; ngân hàng
          và tên chủ tài khoản đã nằm trên thẻ ngay trên kia rồi.
        */}
        <div className="mt-5 divide-y divide-[#f1eeee] rounded-xl bg-[#fbfafa] px-3.5 text-sm">
          <Row label="Số tài khoản" value={checkout.account_number} copyable numeric />
          <Row label="Nội dung" value={checkout.ref_code} copyable highlight />
        </div>

        <p className="mt-4 flex items-center justify-center gap-2 text-sm text-[#747878]">
          <Loader2 className="size-4 animate-spin" />
          Đang chờ quán nhận tiền — màn hình sẽ tự cập nhật
        </p>

        <p className="mt-2 text-center text-xs leading-relaxed text-[#adaaaa]">
          Quét mã thì nội dung đã điền sẵn. Nếu gõ tay, giữ đúng nội dung trên
          để hệ thống nhận ra đơn của bạn.
        </p>

        {/* Nút tuỳ chọn thanh toán sau hoặc đổi phương thức thanh toán */}
        <div className="mt-6 flex flex-col gap-2.5 pt-3 border-t border-[#f1eeee]">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (onPayLater) {
                onPayLater()
              } else if (bookingId) {
                toast.info("Đơn đặt lịch đã được giữ chỗ! Bạn có 30 phút để hoàn tất thanh toán.")
                window.location.href = routePaths.customerBookingDetail.replace(
                  ":bookingId",
                  bookingId,
                )
              }
            }}
            className="w-full h-10.5 rounded-xl border-orange-200 bg-[#fff3eb]/40 hover:bg-[#fff3eb] text-xs font-bold text-[#ea580c] hover:text-[#c2410c] flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs"
          >
            <Clock className="size-4 text-[#ea580c]" />
            <span>Thanh toán sau (Giữ chỗ 30 phút)</span>
          </Button>

          {onChangeMethod && (
            <Button
              type="button"
              variant="ghost"
              onClick={onChangeMethod}
              className="w-full h-9 rounded-xl text-xs font-semibold text-[#747878] hover:text-[#1c1b1b] hover:bg-[#f6f4f4] flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="size-3.5" />
              <span>Đổi phương thức thanh toán khác</span>
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function Row({
  label,
  value,
  copyable,
  highlight,
  numeric,
}: {
  label: string
  value: string
  copyable?: boolean
  highlight?: boolean
  /** Dãy số dài — dùng chữ số đều bề ngang để hai hàng thẳng cột với nhau. */
  numeric?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <dt className="shrink-0 text-[#747878]">{label}</dt>
      <dd className="flex min-w-0 items-center gap-1.5">
        <span
          className={cn(
            "truncate font-bold text-[#1c1b1b]",
            numeric && "tabular-nums",
            highlight && "rounded bg-orange-50 px-2 py-0.5 text-orange-700",
          )}
        >
          {value}
        </span>
        {copyable && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="size-7 shrink-0 p-0"
            onClick={() => {
              void navigator.clipboard.writeText(value)
              toast.success("Đã sao chép")
            }}
          >
            <Copy className="size-3.5" />
          </Button>
        )}
      </dd>
    </div>
  )
}

/**
 * Màn thành công, tự chuyển trang sau vài giây.
 *
 * Chuyển ngay lập tức thì khách chưa kịp đọc gì đã thấy trang khác — với một
 * giao dịch vừa trừ tiền thật, khoảnh khắc xác nhận rõ ràng đáng giá hơn vài
 * giây tiết kiệm được. Vẫn để nút đi ngay cho người không muốn chờ.
 */
function PaidPanel({ onContinue }: { onContinue?: () => void }) {
  const [remaining, setRemaining] = useState(REDIRECT_SECONDS)

  useEffect(() => {
    const id = setInterval(() => {
      setRemaining((current) => (current <= 0 ? 0 : current - 1))
    }, 1000)
    return () => clearInterval(id)
  }, [])

  const done = remaining <= 0
  useEffect(() => {
    if (done) onContinue?.()
  }, [done, onContinue])

  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
      <CheckCircle2 className="mx-auto size-14 text-emerald-600" />
      <h3 className="mt-4 text-xl font-black text-emerald-900">
        Đã thanh toán
      </h3>
      <p className="mt-1.5 text-sm text-emerald-800">
        Quán đã nhận được tiền. Đơn của bạn được xác nhận.
      </p>

      {onContinue && (
        <>
          <p
            className="mt-5 text-sm text-emerald-800"
            aria-live="polite"
            aria-atomic="true"
          >
            Chuyển sang đơn của bạn sau{" "}
            <span className="font-black tabular-nums">{remaining}</span> giây
          </p>

          <Button
            type="button"
            className="mt-3 h-10 bg-emerald-600 hover:bg-emerald-700"
            onClick={onContinue}
          >
            Xem đơn của tôi ngay
          </Button>
        </>
      )}
    </div>
  )
}
