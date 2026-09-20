import { Link } from "react-router"
import { AlertCircle, ChevronRight } from "lucide-react"
import { useAuthStore } from "@/features/auth/stores/auth.store"

export function CompleteProfileBanner() {
  const { isAuthenticated, role, user } = useAuthStore()

  const showBanner = isAuthenticated && role === "customer" && !user?.phone

  if (!showBanner) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[9999] border-t border-amber-200 bg-[#fffbeb] py-3 px-4 shadow-lg animate-in fade-in slide-in-from-bottom-5 duration-300">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 flex-wrap text-sm font-medium md:px-6">
        <div className="flex items-center gap-2 text-[#92400e]">
          <AlertCircle className="h-5 w-5 shrink-0 text-amber-600 animate-pulse" />
          <span>Còn 1 bước nữa để hoàn thiện hồ sơ của bạn. Vui lòng thêm số điện thoại để thuận tiện cho việc đặt sân.</span>
        </div>
        <Link
          to="/profile?focus=phone"
          className="inline-flex items-center gap-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg px-4 py-2 text-xs font-semibold shadow-sm transition-colors shrink-0"
        >
          Thêm số điện thoại ngay
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  )
}
