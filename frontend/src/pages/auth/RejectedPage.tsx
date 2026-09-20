import { useEffect, useState } from "react"
import { useNavigate } from "react-router"
import { useAuthStore } from "@/features/auth/stores/auth.store"
import { kycApi } from "@/features/provider-kyc/api/kyc.api"
import { KycDocumentUpload } from "@/features/provider-kyc/components/KycDocumentUpload"
import type { KycBusinessType } from "@/features/provider-kyc/types"
import type { KycFiles } from "@/features/provider-kyc/components/KycDocumentUpload"
import { routePaths } from "@/app/router/route-paths"
import { XCircle, LogOut, ArrowLeft, RefreshCw, SendHorizonal } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/shared/ui/button"

const REQUIRED_FIELDS: Record<KycBusinessType, string[]> = {
  INDIVIDUAL: ["cccd_front", "cccd_back", "venue_photo"],
  BUSINESS: ["gpkd", "representative_id", "venue_photo"],
}

const FIELD_LABELS: Record<string, string> = {
  cccd_front: "CCCD mặt trước",
  cccd_back: "CCCD mặt sau",
  gpkd: "Giấy phép kinh doanh",
  representative_id: "CCCD người đại diện",
  venue_photo: "Ảnh mặt bằng",
}

export function RejectedPage() {
  const navigate = useNavigate()
  const clearAuthenticated = useAuthStore((state) => state.clearAuthenticated)

  const [reason, setReason] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [showResubmit, setShowResubmit] = useState(false)
  const [businessType, setBusinessType] = useState<KycBusinessType>("INDIVIDUAL")
  const [kycFiles, setKycFiles] = useState<KycFiles>({})
  const [fileErrors, setFileErrors] = useState<Partial<Record<string, string>>>({})
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let isMounted = true
    const fetchStatus = async () => {
      try {
        const response = await kycApi.getKycStatus()
        if (response.success && response.data && isMounted) {
          setReason(response.data.rejectionReason || "Thông tin hồ sơ không khớp hoặc không hợp lệ.")
          if (response.data.businessType) {
            setBusinessType(response.data.businessType)
          }
        }
      } catch {
        // silently fall back to generic message
      } finally {
        if (isMounted) setLoading(false)
      }
    }
    fetchStatus()
    return () => { isMounted = false }
  }, [])

  const validateFiles = (): boolean => {
    const required = REQUIRED_FIELDS[businessType]
    const errors: Partial<Record<string, string>> = {}
    for (const field of required) {
      if (!kycFiles[field]) {
        errors[field] = `${FIELD_LABELS[field]} là bắt buộc`
      }
    }
    setFileErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleResubmit = async () => {
    if (!validateFiles()) return

    setSubmitting(true)
    try {
      const formData = new FormData()
      formData.append("business_type", businessType)
      for (const [fieldName, file] of Object.entries(kycFiles)) {
        if (file) formData.append(fieldName, file)
      }

      await kycApi.resubmitKyc(formData)
      toast.success("Hồ sơ đã được nộp lại thành công. Đang chờ xét duyệt...")
      // ProviderStatusGuard will redirect to /pending-review once status becomes PENDING
      navigate(routePaths.pendingReview, { replace: true })
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg ?? "Nộp lại hồ sơ thất bại. Vui lòng thử lại.")
    } finally {
      setSubmitting(false)
    }
  }

  const handleLogout = () => {
    clearAuthenticated()
    navigate(routePaths.login)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50/50 px-4 py-12">
      <div className="max-w-lg w-full bg-white border border-slate-100 shadow-xl shadow-slate-100/50 rounded-2xl p-8 relative overflow-hidden">
        {/* Decorative background gradients */}
        <div className="absolute -top-12 -right-12 w-24 h-24 bg-red-500/10 rounded-full blur-xl" />
        <div className="absolute -bottom-12 -left-12 w-24 h-24 bg-orange-600/10 rounded-full blur-xl" />

        <div className="mx-auto size-16 bg-red-50 rounded-2xl flex items-center justify-center border border-red-100 mb-6">
          <XCircle className="size-8 text-red-500" />
        </div>

        <h1 className="text-2xl font-bold text-slate-800 tracking-tight mb-3 text-center">
          Đăng ký đối tác bị từ chối
        </h1>

        <p className="text-sm text-slate-500 leading-relaxed mb-6 text-center">
          Chúng tôi rất tiếc phải thông báo rằng yêu cầu trở thành đối tác của bạn đã bị từ chối sau khi được xem xét kỹ lưỡng.
        </p>

        <div className="bg-red-50/50 border border-red-100/60 rounded-xl p-4 text-left mb-6">
          <h3 className="text-xs font-bold uppercase tracking-wider text-red-500 mb-2">
            Lý do từ chối
          </h3>
          {loading ? (
            <div className="flex items-center gap-2 text-slate-400 text-xs py-2">
              <span className="size-3 border-2 border-slate-200 border-t-red-500 rounded-full animate-spin" />
              Đang tải lý do từ chối...
            </div>
          ) : (
            <p className="text-xs text-slate-700 leading-relaxed font-medium">{reason}</p>
          )}
        </div>

        {!showResubmit ? (
          <div className="flex flex-col gap-3">
            <button
              onClick={() => setShowResubmit(true)}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-orange-600 hover:bg-orange-700 text-white font-semibold rounded-xl text-sm transition duration-150 cursor-pointer shadow-md shadow-orange-600/20 active:translate-y-[1px]"
            >
              <RefreshCw className="size-4" />
              Nộp lại hồ sơ
            </button>

            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 border border-slate-200 text-sm font-semibold rounded-xl text-slate-600 hover:bg-slate-50 active:bg-slate-100 transition duration-150 cursor-pointer"
            >
              <LogOut className="size-4" />
              Quay lại Đăng nhập
            </button>

            <button
              onClick={() => navigate(routePaths.home)}
              className="w-full flex items-center justify-center gap-2 py-2 px-4 text-xs font-semibold rounded-xl text-slate-400 hover:text-slate-600 transition duration-150 cursor-pointer"
            >
              <ArrowLeft className="size-3" />
              Về trang chủ khách hàng
            </button>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="space-y-1.5">
              <p className="text-xs font-bold text-slate-700">Loại hình kinh doanh</p>
              <div className="grid grid-cols-2 gap-3">
                {(["INDIVIDUAL", "BUSINESS"] as KycBusinessType[]).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => { setBusinessType(type); setKycFiles({}); setFileErrors({}) }}
                    className={`h-10 rounded-xl border-2 text-xs font-bold transition-colors ${
                      businessType === type
                        ? "border-orange-500 bg-orange-50 text-orange-700"
                        : "border-slate-200 text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    {type === "INDIVIDUAL" ? "Cá nhân" : "Doanh nghiệp"}
                  </button>
                ))}
              </div>
            </div>

            <KycDocumentUpload
              businessType={businessType}
              files={kycFiles}
              errors={fileErrors}
              onChange={(fieldName, file) => {
                setKycFiles((prev) => ({ ...prev, [fieldName]: file }))
                if (fileErrors[fieldName]) {
                  setFileErrors((prev) => { const next = { ...prev }; delete next[fieldName]; return next })
                }
              }}
            />

            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                className="w-1/3 h-11 border-slate-200 rounded-xl text-slate-600 font-bold"
                onClick={() => { setShowResubmit(false); setKycFiles({}); setFileErrors({}) }}
              >
                Hủy
              </Button>
              <Button
                type="button"
                disabled={submitting}
                className="w-2/3 h-11 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl gap-2"
                onClick={handleResubmit}
              >
                {submitting ? (
                  <><span className="size-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Đang gửi...</>
                ) : (
                  <><SendHorizonal className="size-4" /> Nộp lại hồ sơ</>
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
export default RejectedPage
