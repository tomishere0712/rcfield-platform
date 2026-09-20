import { useNavigate } from "react-router"
import { useAuthStore } from "@/features/auth/stores/auth.store"
import { routePaths } from "@/app/router/route-paths"
import { Clock, LogOut, ArrowLeft } from "lucide-react"

export function PendingReviewPage() {
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const clearAuthenticated = useAuthStore((state) => state.clearAuthenticated)

  const handleLogout = () => {
    clearAuthenticated()
    navigate(routePaths.login)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50/50 px-4">
      <div className="max-w-md w-full bg-white border border-slate-100 shadow-xl shadow-slate-100/50 rounded-2xl p-8 text-center relative overflow-hidden">
        {/* Decorative background gradients */}
        <div className="absolute -top-12 -right-12 w-24 h-24 bg-amber-500/10 rounded-full blur-xl" />
        <div className="absolute -bottom-12 -left-12 w-24 h-24 bg-orange-600/10 rounded-full blur-xl" />

        <div className="mx-auto size-16 bg-amber-50 rounded-2xl flex items-center justify-center border border-amber-100 mb-6 animate-pulse">
          <Clock className="size-8 text-amber-500" />
        </div>

        <h1 className="text-2xl font-bold text-slate-800 tracking-tight mb-3">
          Hồ sơ của bạn đang được duyệt
        </h1>

        <p className="text-sm text-slate-500 leading-relaxed mb-6">
          Cảm ơn bạn đã đăng ký làm đối tác của chúng tôi. Tài khoản{" "}
          <strong className="text-slate-700">{user?.email}</strong> hiện đang nằm trong hàng đợi phê duyệt của quản trị viên. Quy trình này thường mất từ 1 - 2 ngày làm việc.
        </p>

        <div className="bg-slate-50 rounded-xl p-4 text-left border border-slate-100 mb-8">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
            Thông tin tiếp theo
          </h3>
          <ul className="text-xs text-slate-600 space-y-2 list-disc list-inside">
            <li>Chúng tôi sẽ gửi email thông báo khi tài khoản được kích hoạt.</li>
            <li>Sau khi duyệt, bạn sẽ được tự động kích hoạt gói dùng thử 30 ngày.</li>
            <li>Trong trường hợp cần chỉnh sửa hoặc có thắc mắc, vui lòng liên hệ hot-line hỗ trợ.</li>
          </ul>
        </div>

        <div className="flex flex-col gap-3">
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
export default PendingReviewPage
