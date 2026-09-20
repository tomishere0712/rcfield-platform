import { useNavigate, useParams, useSearchParams } from "react-router"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { AlertTriangle, ArrowLeft, Loader2, XCircle } from "lucide-react"
import { toast } from "sonner"

import {
  bookingApi,
  bookingQueryKeys,
} from "@/features/booking/api/booking.api"
import { routePaths } from "@/app/router/route-paths"
import { Button } from "@/shared/ui/button"
import { BankTransferQrPanel } from "./components/checkout/BankTransferQrPanel"

/**
 * Trang chờ chuyển khoản, đánh địa chỉ theo `bookingId`.
 *
 * Tồn tại vì `payment_url` phải dẫn tới một trang có thật: khách tải lại trang,
 * mở lại link trong lịch sử, hay bấm thanh toán lần hai đều phải ra đúng mã QR
 * của đơn mình — không phải trang 404.
 *
 * Lấy dữ liệu bằng cách gọi lại checkout: backend trả về đúng giao dịch đang
 * chờ nếu còn hiệu lực, nên gọi nhiều lần không sinh thêm mã tham chiếu mới.
 */
export function BankTransferPaymentPage() {
  const { bookingId } = useParams<{ bookingId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  // `?mode=settlement` là khoản phát sinh cuối phiên (gia hạn, đồ ăn tại quầy,
  // hư hỏng) — endpoint khác, mã tham chiếu khác. Không có tham số thì vẫn là
  // tiền đặt lịch ban đầu, đúng như trước.
  const [searchParams] = useSearchParams()
  const isSettlement = searchParams.get("mode") === "settlement"

  const { data, isLoading, isError } = useQuery({
    queryKey: ["bank-transfer-checkout", bookingId, isSettlement],
    queryFn: async () => {
      const result = isSettlement
        ? await bookingApi.createCheckoutAdditionalPayment(
            bookingId!,
            "bank_transfer",
          )
        : await bookingApi.createCheckout(bookingId!, "bank_transfer")
      // Ném lỗi thay vì trả về phản hồi thiếu mã QR.
      if (!result.bank_transfer) {
        throw new Error("Phản hồi thanh toán không kèm mã QR chuyển khoản")
      }
      return result
    },
    enabled: Boolean(bookingId),
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  })

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1)
    } else {
      navigate(
        isSettlement
          ? routePaths.customerBookingDetail.replace(":bookingId", bookingId!)
          : routePaths.customerBookings,
      )
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (isError || !data?.bank_transfer) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <AlertTriangle className="mx-auto size-12 text-[#adaaaa]" />
        <h1 className="mt-4 text-xl font-black">
          Không mở được trang thanh toán
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {isSettlement
            ? "Khoản phát sinh này có thể đã được thanh toán, hoặc chi nhánh chưa bật nhận chuyển khoản."
            : "Đơn này có thể đã thanh toán xong, đã huỷ, hoặc hết thời gian giữ chỗ."}
        </p>
        <Button
          className="mt-5"
          onClick={() => void navigate(routePaths.customerBookings)}
        >
          Xem đơn của tôi
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <div className="mb-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleBack}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 -ml-2 rounded-lg"
        >
          <ArrowLeft className="h-4 w-4" />
          Quay lại
        </Button>
      </div>

      <h1 className="mb-1 text-2xl font-black">Chuyển khoản để hoàn tất</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Quét mã bằng ứng dụng ngân hàng. Màn hình này tự cập nhật khi quán nhận
        được tiền — bạn không cần bấm gì thêm.
      </p>

      <BankTransferQrPanel
        subject={
          isSettlement
            ? { kind: "settlement", bookingId: bookingId!, txnRef: data.txn_ref }
            : { kind: "booking", bookingId: bookingId! }
        }
        checkout={data.bank_transfer}
        onPaid={() => {
          toast.success("Đã nhận được thanh toán!")
          void queryClient.invalidateQueries({
            queryKey: bookingQueryKeys.detail(bookingId),
          })
        }}
        onContinue={() =>
          void navigate(
            routePaths.customerBookingDetail.replace(":bookingId", bookingId!),
            { replace: true },
          )
        }
      />

      <div className="mt-6 flex flex-col items-center gap-2">
        <Button
          variant="outline"
          onClick={handleBack}
          className="w-full h-11 rounded-xl border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center justify-center gap-2 shadow-sm"
        >
          <XCircle className="h-4 w-4 text-slate-500" />
          Hủy thanh toán / Đổi phương thức
        </Button>
      </div>
    </div>
  )
}
