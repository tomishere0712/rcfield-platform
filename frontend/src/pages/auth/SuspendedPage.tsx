import { useEffect, useState } from "react"
import { useNavigate } from "react-router"
import { useAuthStore } from "@/features/auth/stores/auth.store"
import { subscriptionApi } from "@/features/subscriptions/api/subscription.api"
import { routePaths } from "@/app/router/route-paths"
import { ShieldAlert, LogOut, ArrowLeft, Mail } from "lucide-react"

export function SuspendedPage() {
  const navigate = useNavigate()
  const clearAuthenticated = useAuthStore((state) => state.clearAuthenticated)
  const [reason, setReason] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let isMounted = true
    const fetchReason = async () => {
      try {
        const response = await subscriptionApi.getProviderMe()
        if (response.success && response.data) {
          if (isMounted) {
            setReason(response.data.suspended_reason || "Tài khoản bị tạm khóa do vi phạm các điều khoản hoạt động.")
          }
        }
      } catch (err) {
        console.error("Failed to load suspended reason", err)
      } finally {
        if (isMounted) setLoading(false)
      }
    }
    fetchReason()
    return () => {
      isMounted = false
    }
  }, [])

  const handleLogout = () => {
    clearAuthenticated()
    navigate(routePaths.login)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50/50 px-4">
      <div className="max-w-md w-full bg-white border border-slate-100 shadow-xl shadow-slate-100/50 rounded-2xl p-8 text-center relative overflow-hidden">
        {/* Decorative background gradients */}
        <div className="absolute -top-12 -right-12 w-24 h-24 bg-red-600/10 rounded-full blur-xl" />
        <div className="absolute -bottom-12 -left-12 w-24 h-24 bg-orange-600/10 rounded-full blur-xl" />

        <div className="mx-auto size-16 bg-red-50 rounded-2xl flex items-center justify-center border border-red-100 mb-6">
          <ShieldAlert className="size-8 text-red-600" />
        </div>

        <h1 className="text-2xl font-bold text-slate-800 tracking-tight mb-3">
          Tài khoản đã bị tạm khóa
        </h1>

        <p className="text-sm text-slate-500 leading-relaxed mb-6">
          Tài khoản đối tác này đã bị tạm ngừng hoạt động do vi phạm điều khoản dịch vụ hoặc các lý do vận hành từ quản trị viên.
        </p>

        <div className="bg-red-50/50 border border-red-100/60 rounded-xl p-4 text-left mb-8">
          <h3 className="text-xs font-bold uppercase tracking-wider text-red-600 mb-2">
            Lý do khóa tài khoản
          </h3>
          {loading ? (
            <div className="flex items-center gap-2 text-slate-400 text-xs py-2">
              <span className="size-3 border-2 border-slate-200 border-t-red-600 rounded-full animate-spin" />
              Đang tải lý do khóa...
            </div>
          ) : (
            <p className="text-xs text-slate-700 leading-relaxed font-medium">
              {reason}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <a
            href="mailto:support@rcfield.com"
            className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-xl text-sm transition duration-150 cursor-pointer shadow-md shadow-slate-950/20 active:translate-y-[1px]"
          >
            <Mail className="size-4" />
            Liên hệ ban quản trị (support@rcfield.com)
          </a>

          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 border border-slate-200 text-sm font-semibold rounded-xl text-slate-600 hover:bg-slate-50 active:bg-slate-100 transition duration-150 cursor-pointer"
          >
            <LogOut className="size-4" />
            Đăng xuất & Quay lại đăng nhập
          </button>
          
          <button
            onClick={() => navigate(routePaths.home)}
            className="w-full flex items-center justify-center gap-2 py-2 px-4 text-xs font-semibold rounded-xl text-slate-400 hover:text-slate-600 transition duration-150 cursor-pointer"
          >
            <ArrowLeft className="size-3" />
            Về trang chủ khách hàng
          </button>
        </div>
      </div>
    </div>
  )
}
export default SuspendedPage
