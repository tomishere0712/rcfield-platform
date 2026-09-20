import { ArrowRight } from "lucide-react"
import { Link } from "react-router"
import { routePaths } from "@/app/router/route-paths"
import { Button } from "@/shared/ui/button"

export function LandingCta() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-orange-600 to-orange-500 py-24 text-white">
      {/* Texture overlay */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(255,255,255,0.15)_0%,_transparent_60%)]" />
      <div className="pointer-events-none absolute -bottom-24 -right-16 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
      <div className="pointer-events-none absolute -left-12 top-0 h-48 w-48 rounded-full bg-black/10 blur-2xl" />

      <div className="relative mx-auto max-w-4xl px-4 text-center md:px-6">
        <p className="mb-4 text-xs font-black uppercase tracking-[0.2em] text-orange-100">
          Miễn phí, không cần thẻ
        </p>
        <h2 className="mb-5 text-4xl font-black leading-tight tracking-tight md:text-5xl">
          Đặt lịch phiên chơi đầu tiên <br className="hidden md:block" />
          ngay hôm nay.
        </h2>
        <p className="mx-auto mb-10 max-w-xl text-base font-medium leading-7 text-orange-100">
          Tạo tài khoản trong 30 giây. Tìm sân, chọn giờ, đặt xe — tất cả online, không cần gọi điện.
        </p>

        <div className="flex flex-wrap justify-center gap-3">
          <Button
            asChild
            size="lg"
            className="group h-13 rounded-xl bg-white px-8 font-black text-orange-600 shadow-xl shadow-orange-900/20 transition-all hover:bg-slate-50 hover:shadow-2xl hover:-translate-y-0.5"
          >
            <Link to={routePaths.register}>
              Tạo tài khoản miễn phí
              <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="ghost"
            className="h-13 rounded-xl border border-white/30 px-8 font-black text-white hover:bg-white/10"
          >
            <Link to={routePaths.cafes}>Xem sân trước</Link>
          </Button>
        </div>

        <p className="mt-8 text-xs font-semibold text-orange-200">
          Đã có tài khoản?{" "}
          <Link to={routePaths.login} className="underline underline-offset-2 hover:text-white transition-colors">
            Đăng nhập tại đây
          </Link>
        </p>
      </div>
    </section>
  )
}
