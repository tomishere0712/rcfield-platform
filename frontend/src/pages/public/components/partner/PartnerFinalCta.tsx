import { ArrowRight, MessageCircle, CheckCircle2 } from "lucide-react"
import { Link } from "react-router"
import { routePaths } from "@/app/router/route-paths"
import { Button } from "@/shared/ui/button"
import { ZALO_OA_URL } from "./partner-data"

const TRUST_ITEMS = [
  "Không cần thẻ tín dụng",
  "Hủy bất cứ lúc nào",
  "Hỗ trợ setup miễn phí",
  "Bảo mật dữ liệu chuẩn SSL",
]

export function PartnerFinalCta() {
  return (
    <section className="relative overflow-hidden bg-slate-950 py-24 md:py-32">
      {/* Dot-grid texture */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: "radial-gradient(circle, #fff 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
        aria-hidden
      />

      {/* Ambient glow */}
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-orange-600/10 blur-[140px]"
        aria-hidden
      />

      <div className="relative mx-auto max-w-3xl px-4 text-center md:px-6">
        {/* Eyebrow */}
        <p className="mb-4 text-xs font-black uppercase tracking-widest text-orange-400">
          Sẵn sàng chưa?
        </p>

        {/* Headline */}
        <h2 className="text-4xl font-black leading-tight text-white md:text-5xl">
          Đưa sân RC của bạn lên{" "}
          <span className="bg-gradient-to-r from-orange-400 to-orange-600 bg-clip-text text-transparent">
            tầm cao mới
          </span>
        </h2>

        <p className="mx-auto mt-5 max-w-lg text-base leading-7 text-slate-400">
          Tham gia cùng 50+ RC Cafe đang vận hành chuyên nghiệp với RCField. Dùng thử 30 ngày miễn phí — không rủi ro.
        </p>

        {/* CTAs */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Button
            asChild
            size="lg"
            className="group h-13 min-h-[44px] rounded-xl bg-orange-600 px-8 font-black text-white shadow-xl shadow-orange-600/30 transition-all hover:bg-orange-500 hover:shadow-orange-500/40 hover:shadow-2xl hover:-translate-y-0.5"
          >
            <Link to={routePaths.providerRegister}>
              Bắt đầu miễn phí 30 ngày
              <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </Button>

          <Button
            asChild
            size="lg"
            variant="outline"
            className="h-13 min-h-[44px] rounded-xl border-white/15 bg-white/5 px-8 font-black text-white backdrop-blur-sm hover:bg-white/10 hover:border-white/25"
          >
            <a href={ZALO_OA_URL} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="mr-2 h-4 w-4" />
              Liên hệ tư vấn
            </a>
          </Button>
        </div>

        {/* Trust strip */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
          {TRUST_ITEMS.map((item) => (
            <div key={item} className="flex items-center gap-2 text-sm text-slate-500">
              <CheckCircle2 className="size-3.5 text-emerald-500/70" />
              {item}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
