import { useState, useEffect, useCallback } from "react"
import { useParams, useNavigate } from "react-router"
import { useQueryClient } from "@tanstack/react-query"
import { type MockSessionDetail, type MockExtensionProposal } from "@/shared/data/customer-operational-mock-data"
import { customerSessionApi } from "@/features/customer-session/api/customer-session.api"
import { bookingQueryKeys } from "@/features/booking/api/booking.api"
import { 
  Clock, 
  Sparkles, 
  Check, 
  X, 
  AlertTriangle,
  ArrowRight,
  Info
} from "lucide-react"
import { Button } from "@/shared/ui/button"
import { Card, CardDescription, CardTitle } from "@/shared/ui/card"
import { Badge } from "@/shared/ui/badge"
import { toast } from "sonner"
import { getSessionOperationalTiming } from "@/features/booking/lib/session-operational-timing"

export function CustomerExtensionResponsePage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const [session, setSession] = useState<MockSessionDetail | null>(null)
  const [proposal, setProposal] = useState<MockExtensionProposal | null>(null)
  const [timeLeft, setTimeLeft] = useState<number>(10 * 60) // 10 minutes countdown
  const [now, setNow] = useState(0)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [loadError, setLoadError] = useState<string>("")
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)

  const loadSession = useCallback(async (silent = false) => {
    if (!sessionId) {
      setIsLoading(false)
      return
    }
    if (!silent) setIsLoading(true)
    setLoadError("")
    try {
      const detail = await customerSessionApi.getSessionDetail(sessionId)
      const pendingProposal = detail.extensionProposal?.status === "PENDING" ? detail.extensionProposal : null

      setSession(detail)
      setProposal(pendingProposal)
      setNow(Date.now())
      if (pendingProposal) {
        const expiry = new Date(pendingProposal.expiresAt).getTime()
        setTimeLeft(Math.max(0, Math.floor((expiry - Date.now()) / 1000)))
      }
    } catch (err) {
      const message =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined
      setLoadError(message ?? "Không thể tải đề xuất gia hạn.")
      setSession(null)
      setProposal(null)
    } finally {
      if (!silent) setIsLoading(false)
    }
  }, [sessionId])

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
    return () => window.removeEventListener("refresh-session-detail", handleRefresh)
  }, [loadSession])

  // Count down
  useEffect(() => {
    if (timeLeft <= 0) return
    const timer = setInterval(() => {
      setNow(Date.now())
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [timeLeft])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <Card className="max-w-md w-full text-center p-8 space-y-4">
          <Clock className="h-12 w-12 text-orange-500 mx-auto animate-pulse" />
          <h2 className="text-xl font-bold text-slate-900">Đang tải đề xuất gia hạn</h2>
          <p className="text-sm text-slate-500">Hệ thống đang lấy yêu cầu mới nhất từ staff.</p>
        </Card>
      </div>
    )
  }

  if (!session || !proposal) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <Card className="max-w-md w-full text-center p-8 space-y-4">
          <AlertTriangle className="h-12 w-12 text-red-500 mx-auto" />
          <h2 className="text-xl font-bold text-slate-900">Không tìm thấy đề xuất gia hạn</h2>
          <p className="text-sm text-slate-500">{loadError || `Đề xuất gia hạn cho phiên ${sessionId} không tồn tại hoặc đã hết hạn.`}</p>
          <Button onClick={() => navigate("/customer/bookings")} className="w-full bg-slate-900 text-white rounded-xl">
            Quay lại Lịch đặt sân
          </Button>
        </Card>
      </div>
    )
  }

  // Format time
  const extensionWindowClosed =
    getSessionOperationalTiming(session.plannedEnd, session.status, now).state === "OVERDUE"

  if (extensionWindowClosed) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <Card className="max-w-md w-full text-center p-8 space-y-4">
          <AlertTriangle className="h-12 w-12 text-red-500 mx-auto" />
          <h2 className="text-xl font-bold text-slate-900">Không thể gia hạn sau khi phiên đã quá giờ</h2>
          <p className="text-sm text-slate-500">
            Nhân viên sẽ xử lý trả xe trước. Thời điểm xử lý muộn không tự phát sinh phí cho bạn.
          </p>
          <Button onClick={() => navigate(`/customer/bookings/${session.bookingId}`)} className="w-full bg-slate-900 text-white rounded-xl">
            Xem đơn đặt lịch
          </Button>
        </Card>
      </div>
    )
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(val)
  }

  // Handle Action
  const handleAction = async (approve: boolean) => {
    setIsSubmitting(true)
    try {
      await customerSessionApi.respondExtension(session.sessionId, approve)
      if (approve) {
        toast.success("Đã đồng ý gia hạn phiên chơi!", {
          description: `Thời gian chơi của bạn đã được cộng thêm ${proposal.extraMinutes} phút thành công.`
        })
      } else {
        toast.warning("Đã từ chối gia hạn phiên chơi.", {
          description: "Phiên chơi giữ nguyên thời hạn kết thúc cũ."
        })
      }
      await queryClient.invalidateQueries({ queryKey: bookingQueryKeys.detail(session.bookingId) })
      navigate(`/customer/bookings/${session.bookingId}`)
    } catch (err) {
      const message =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined
      toast.error(message ?? "Không thể gửi phản hồi gia hạn.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-4 md:p-8 font-sans flex items-center justify-center relative">
      {/* Decorative Glow */}
      <div className="absolute top-0 right-0 w-[400px] h-[400px] rounded-full bg-orange-400/5 blur-[100px] pointer-events-none" />

      <Card className="max-w-md w-full border-slate-200/80 shadow-xl bg-white relative overflow-hidden p-6 space-y-6">
        
        {/* Glow Line Indicator */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-orange-500 to-orange-600" />

        {/* Heading */}
        <div className="text-center space-y-1">
          <Badge className="bg-orange-100 text-orange-800 border-none font-bold text-[9px] uppercase tracking-wider">
            Yêu cầu từ nhân viên sân chơi
          </Badge>
          <CardTitle className="text-lg font-black text-slate-950 uppercase tracking-tight flex items-center justify-center gap-1 mt-2">
            <Sparkles className="h-5 w-5 text-orange-500 shrink-0" />
            Đồng Ý Gia Hạn Sân
          </CardTitle>
          <CardDescription className="text-xs">
            Bạn có muốn chơi thêm để hoàn tất trận đua kịch tính?
          </CardDescription>
        </div>

        {/* Countdown Box */}
        <div className="bg-rose-50 border border-rose-100 p-4 rounded-2xl flex flex-col items-center justify-center space-y-1 text-center">
          <div className="flex items-center gap-2 text-rose-600 font-extrabold text-xs">
            <Clock className="h-4.5 w-4.5 animate-pulse" />
            ĐỀ XUẤT TỰ HỦY SAU
          </div>
          <span className="text-2xl font-black text-rose-600 tracking-tight">
            {timeLeft > 0 ? formatTime(timeLeft) : "00:00"}
          </span>
          <span className="text-[9px] text-rose-400 font-semibold uppercase">
            Hết thời gian này sẽ tự động từ chối
          </span>
        </div>

        {/* Details breakdown */}
        <div className="space-y-4 text-xs font-semibold text-slate-700 bg-slate-50 p-4.5 rounded-2xl border border-slate-200/60 shadow-2xs">
          
          <div className="flex justify-between items-center">
            <span className="text-slate-400">Thời gian cộng thêm</span>
            <span className="text-slate-950 font-black text-sm text-orange-600 flex items-center gap-1.5">
              +{proposal.extraMinutes} phút
              <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
            </span>
          </div>

          <div className="h-px bg-slate-200 my-1" />

          <div className="flex justify-between">
            <span className="text-slate-400">Thời gian kết thúc mới</span>
            <span className="text-slate-900 font-extrabold">
              {new Date(proposal.newPlannedEnd).toLocaleTimeString("vi-VN", {hour: "2-digit", minute: "2-digit"})}
            </span>
          </div>

          <div className="flex justify-between">
            <span className="text-slate-400">Chi phí phụ thu thêm</span>
            <span className="text-slate-900 font-black text-sm">
              {formatCurrency(proposal.additionalFee)}
            </span>
          </div>

          <div className="p-2.5 bg-orange-50/50 rounded-xl text-[9px] text-orange-800 leading-normal border border-orange-100 flex gap-1.5">
            <Info className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" />
            <span>Phí gia hạn sẽ được tự động cộng vào hóa đơn thực tế và cấn trừ trực tiếp tại quầy check-out sau đó.</span>
          </div>
        </div>

        {/* Buttons Action */}
        <div className="space-y-3.5 pt-2">
          <Button
            onClick={() => handleAction(true)}
            disabled={isSubmitting || timeLeft <= 0}
            className="w-full bg-slate-950 hover:bg-slate-900 text-white font-extrabold text-xs h-12 rounded-xl shadow-md cursor-pointer transition-all flex items-center justify-center gap-1.5"
          >
            <Check className="h-4.5 w-4.5 text-orange-400 stroke-[3]" />
            Có, tôi đồng ý chơi thêm
          </Button>

          <Button
            variant="outline"
            onClick={() => handleAction(false)}
            disabled={isSubmitting}
            className="w-full border-slate-200 hover:bg-slate-50 text-slate-600 font-extrabold text-xs h-12 rounded-xl cursor-pointer transition-all flex items-center justify-center gap-1.5"
          >
            <X className="h-4.5 w-4.5 text-slate-400" />
            Không, tôi muốn giữ lịch cũ
          </Button>
        </div>

      </Card>

    </div>
  )
}
