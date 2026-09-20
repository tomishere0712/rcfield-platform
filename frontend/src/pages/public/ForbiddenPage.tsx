import { Link } from "react-router"
import { ShieldOff } from "lucide-react"

import { routePaths } from "@/app/router/route-paths"
import { Button } from "@/shared/ui/button"

export function ForbiddenPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6 text-center">
      <div className="flex size-16 items-center justify-center rounded-2xl border border-slate-200 bg-white">
        <ShieldOff className="size-7 text-slate-400" />
      </div>
      <h1 className="mt-6 text-2xl font-extrabold tracking-tight text-slate-900">
        Bạn không có quyền vào trang này
      </h1>
      <p className="mt-2 max-w-md text-sm font-semibold text-slate-500">
        Trang này dành cho một vai trò khác. Nếu bạn nghĩ đây là nhầm lẫn, hãy
        đăng nhập lại bằng đúng tài khoản hoặc liên hệ quản trị viên.
      </p>
      <Button asChild className="mt-6 h-11 rounded-full px-6 font-bold">
        <Link to={routePaths.home}>Về trang chủ</Link>
      </Button>
    </main>
  )
}
