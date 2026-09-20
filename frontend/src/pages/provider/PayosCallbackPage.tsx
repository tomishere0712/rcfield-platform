import { useEffect, useState } from "react"
import { useSearchParams, useNavigate } from "react-router"
import { motion } from "framer-motion"
import { CheckCircle2, XCircle, Loader2, Sparkles, AlertCircle } from "lucide-react"

import { Button } from "@/shared/ui/button"
import { subscriptionApi } from "@/features/subscriptions/api/subscription.api"
import type { PaymentRequest } from "@/features/subscriptions/types"

export function PayosCallbackPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [verifyStatus, setVerifyStatus] = useState<"success" | "cancel" | "error">("error")
  const [errorMessage, setErrorMessage] = useState("")
  // Kiểu lấy thẳng từ `verifyPayOSPayment`, không cần `any`: dùng `any` ở đây
  // làm mất luôn cảnh báo khi tên trường đổi, mà chỗ này đọc `status` và
  // `adminNotes` để quyết định hiện màn thành công hay chờ duyệt.
  const [paymentRequest, setPaymentRequest] = useState<PaymentRequest | null>(
    null,
  )

  const orderCode = searchParams.get("orderCode")
  const status = searchParams.get("status")

  useEffect(() => {
    async function verify() {
      if (!orderCode) {
        setVerifyStatus("error")
        setErrorMessage("Thiếu mã đơn hàng để đối soát thanh toán.")
        setLoading(false)
        return
      }

      // Nếu trạng thái từ URL là cancel, ta xử lý trực tiếp luôn
      if (status === "cancel") {
        try {
          // Vẫn gọi verify lên BE để cập nhật DB thành REJECTED (huỷ)
          await subscriptionApi.verifyPayOSPayment({ orderCode: Number(orderCode) })
        } catch (e) {
          console.error("Failed to sync cancel status to BE:", e)
        }
        setVerifyStatus("cancel")
        setLoading(false)
        return
      }

      try {
        const response = await subscriptionApi.verifyPayOSPayment({
          orderCode: Number(orderCode),
        })

        if (response.success && response.data) {
          setPaymentRequest(response.data)
          
          const isConfirmed = response.data.status === "CONFIRMED"
          const isPendingPaid = response.data.status === "PENDING" && response.data.adminNotes?.includes("Đã thanh toán")
          
          if (isConfirmed || isPendingPaid) {
            setVerifyStatus("success")
          } else if (response.data.status === "REJECTED") {
            setVerifyStatus("cancel")
          } else {
            setVerifyStatus("error")
            setErrorMessage(response.data.adminNotes ?? "Giao dịch chưa được xác nhận thanh toán.")
          }
        } else {
          setVerifyStatus("error")
          setErrorMessage("Không thể đối soát giao dịch thanh toán.")
        }
      } catch (err) {
        console.error("Verify payment failed:", err)
        setVerifyStatus("error")
        setErrorMessage(
          (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
            "Đã có lỗi xảy ra khi xác thực giao dịch.",
        )
      } finally {
        setLoading(false)
      }
    }

    verify()
  }, [orderCode, status])

  const handleGoBack = () => {
    navigate("/provider/subscriptions")
  }

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#f8fafc] px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center max-w-md w-full bg-white p-8 rounded-3xl border border-slate-200/80 shadow-[0_20px_40px_rgba(0,0,0,0.04)] text-center"
        >
          <Loader2 className="size-12 animate-spin text-[#8ea6ff] mb-4" />
          <h2 className="text-xl font-bold text-slate-800">Đang đối soát thanh toán</h2>
          <p className="text-sm text-slate-500 mt-2">
            Vui lòng không đóng trình duyệt hoặc tải lại trang trong khi chúng tôi xác thực giao dịch của bạn...
          </p>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#f8fafc] px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="max-w-md w-full bg-white p-8 rounded-3xl border border-slate-200/80 shadow-[0_20px_50px_rgba(0,0,0,0.06)] text-center relative overflow-hidden"
      >
        {verifyStatus === "success" && (
          <>
            <div className="absolute -top-12 -left-12 size-32 rounded-full bg-emerald-50 opacity-50 blur-2xl" />
            <div className="absolute -bottom-12 -right-12 size-32 rounded-full bg-sky-50 opacity-50 blur-2xl" />
            
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.1, type: "spring", stiffness: 120 }}
              className="mx-auto flex size-20 items-center justify-center rounded-full bg-emerald-50 text-emerald-500 mb-6"
            >
              <CheckCircle2 className="size-12" />
            </motion.div>

            <h2 className="text-2xl font-black text-slate-800 tracking-tight flex items-center justify-center gap-1.5">
              Thanh toán thành công!
              <Sparkles className="size-5 text-amber-500 animate-pulse" />
            </h2>
            
            <p className="text-sm font-medium text-slate-500 mt-3 leading-relaxed">
              Đơn hàng của bạn đã được thanh toán thành công qua PayOS và đang chờ Admin phê duyệt. Vui lòng chờ.
            </p>

            <div className="mt-6 rounded-2xl bg-emerald-50/50 border border-emerald-100 p-4 text-left">
              <div className="flex justify-between items-center text-xs font-semibold text-slate-600">
                <span>Mã đơn hàng:</span>
                <span className="font-bold text-slate-800">#{orderCode}</span>
              </div>
              <div className="flex justify-between items-center text-xs font-semibold text-slate-600 mt-2">
                <span>Cổng thanh toán:</span>
                <span className="font-bold text-slate-800">PayOS - VietQR</span>
              </div>
              <div className="flex justify-between items-center text-xs font-semibold text-slate-600 mt-2">
                <span>Trạng thái:</span>
                <span className={`font-bold ${paymentRequest?.status === "CONFIRMED" ? "text-emerald-600" : "text-amber-600"}`}>
                  {paymentRequest?.status === "CONFIRMED" ? "Đã kích hoạt" : "Chờ Admin duyệt"}
                </span>
              </div>
            </div>
          </>
        )}

        {verifyStatus === "cancel" && (
          <>
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.1, type: "spring", stiffness: 120 }}
              className="mx-auto flex size-20 items-center justify-center rounded-full bg-amber-50 text-amber-500 mb-6"
            >
              <AlertCircle className="size-12" />
            </motion.div>

            <h2 className="text-2xl font-black text-slate-800 tracking-tight">
              Thanh toán bị huỷ
            </h2>
            
            <p className="text-sm font-medium text-slate-500 mt-3 leading-relaxed">
              Bạn đã huỷ giao dịch thanh toán hoặc liên kết đã hết hạn. Đừng lo lắng, bạn có thể thực hiện thanh toán lại bất cứ lúc nào từ lịch sử giao dịch.
            </p>
          </>
        )}

        {verifyStatus === "error" && (
          <>
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.1, type: "spring", stiffness: 120 }}
              className="mx-auto flex size-20 items-center justify-center rounded-full bg-red-50 text-red-500 mb-6"
            >
              <XCircle className="size-12" />
            </motion.div>

            <h2 className="text-2xl font-black text-slate-800 tracking-tight">
              Lỗi thanh toán
            </h2>
            
            <p className="text-sm font-medium text-slate-500 mt-3 leading-relaxed">
              {errorMessage || "Không thể xác nhận giao dịch thanh toán của bạn."}
            </p>
          </>
        )}

        <Button
          onClick={handleGoBack}
          className="mt-8 w-full h-11 rounded-full font-bold shadow-md hover:shadow-lg transition-all"
        >
          Quay lại trang Hội viên
        </Button>
      </motion.div>
    </div>
  )
}
