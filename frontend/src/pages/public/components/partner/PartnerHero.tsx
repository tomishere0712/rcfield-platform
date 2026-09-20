import { ArrowRight, MessageCircle } from "lucide-react"
import { Link } from "react-router"
import { routePaths } from "@/app/router/route-paths"
import { Button } from "@/shared/ui/button"
import { ZALO_OA_URL, STATS } from "./partner-data"

function DashboardMockup() {
  return (
    <div className="w-full max-w-[480px] rounded-2xl border border-white/10 bg-slate-900 shadow-2xl shadow-black/60 overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center gap-2 border-b border-white/10 bg-slate-800/60 px-4 py-3">
        <div className="h-2.5 w-2.5 rounded-full bg-red-500/70" />
        <div className="h-2.5 w-2.5 rounded-full bg-yellow-500/70" />
        <div className="h-2.5 w-2.5 rounded-full bg-green-500/70" />
        <span className="ml-2 text-[10px] text-slate-500">RCField Dashboard</span>
      </div>
      {/* KPI row */}
      <div className="grid grid-cols-3 gap-px border-b border-white/10 bg-white/5">
        {[
          { label: "Hôm nay", value: "8 booking" },
          { label: "Doanh thu", value: "2.4tr" },
          { label: "Xe trống", value: "4 xe" },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-slate-900 px-3 py-3">
            <p className="text-[10px] text-slate-500">{kpi.label}</p>
            <p className="mt-0.5 text-sm font-black text-white">{kpi.value}</p>
          </div>
        ))}
      </div>
      {/* Booking rows */}
      <div className="divide-y divide-white/5 px-4">
        {[
          { time: "09:00–11:00", customer: "Minh Tuấn", vehicle: "Traxxas Slash 4x4", status: "ĐANG CHƠI", color: "text-emerald-400" },
          { time: "11:00–13:00", customer: "Quốc Bảo",  vehicle: "Arrma Kraton 8S",   status: "SẮP TỚI",   color: "text-blue-400" },
          { time: "14:00–16:00", customer: "Thảo Vy",   vehicle: "Losi LMT",           status: "SẮP TỚI",   color: "text-blue-400" },
        ].map((row) => (
          <div key={row.time} className="flex items-center justify-between py-2.5">
            <div>
              <p className="text-xs font-semibold text-white">{row.customer}</p>
              <p className="text-[10px] text-slate-500">{row.vehicle} · {row.time}</p>
            </div>
            <span className={`text-[10px] font-bold ${row.color}`}>{row.status}</span>
          </div>
        ))}
      </div>
      {/* Mini bar chart */}
      <div className="border-t border-white/5 px-4 py-3">
        <p className="mb-2 text-[10px] text-slate-500">Doanh thu 7 ngày</p>
        <div className="flex items-end gap-1 h-10">
          {[40, 65, 45, 80, 55, 90, 70].map((h, i) => (
            <div
              key={i}
              className="flex-1 rounded-sm bg-orange-500/60"
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

export function PartnerHero() {
  return (
    <section className="relative overflow-hidden bg-slate-950">
      {/* Ambient glows */}
      <div className="pointer-events-none absolute -top-40 left-1/3 h-[700px] w-[700px] rounded-full bg-orange-600/15 blur-[160px]" aria-hidden />
      <div className="pointer-events-none absolute bottom-0 right-1/4 h-[400px] w-[400px] rounded-full bg-indigo-600/10 blur-[120px]" aria-hidden />

      <div className="relative mx-auto grid min-h-screen max-w-7xl items-center gap-12 px-4 py-20 md:px-6 lg:grid-cols-2 lg:py-0">
        {/* Left — copy */}
        <div className="space-y-8 lg:py-24">
          {/* Eyebrow */}
          <div className="inline-flex items-center gap-2 rounded-full border border-orange-500/30 bg-orange-500/10 px-4 py-1.5 text-xs font-black uppercase tracking-widest text-orange-400">
            <span className="h-1.5 w-1.5 animate-pulse motion-reduce:animate-none rounded-full bg-orange-400" />
            Dành cho chủ sân RC Cafe
          </div>

          {/* Headline */}
          <div className="space-y-4">
            <h1 className="text-4xl font-black leading-[1.05] tracking-tight text-white sm:text-5xl xl:text-6xl">
              Vận hành sân RC{" "}
              <span className="bg-gradient-to-r from-orange-400 to-orange-600 bg-clip-text text-transparent">
                chuyên nghiệp,
              </span>
              <br />
              không cần nhân viên trực 24/7.
            </h1>
            <p className="max-w-lg text-base font-medium leading-7 text-slate-400 md:text-lg">
              RCField giúp chủ sân tự động hoá đặt lịch, bàn giao xe có bằng chứng, và tư vấn khách qua AI — tất cả trong một nền tảng.
            </p>
          </div>

          {/* CTAs */}
          <div className="flex flex-wrap gap-3">
            <Button
              asChild
              size="lg"
              className="group h-13 rounded-xl bg-orange-600 px-7 font-black text-white shadow-xl shadow-orange-600/30 transition-all hover:bg-orange-500 hover:shadow-orange-500/40 hover:shadow-2xl hover:-translate-y-0.5"
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
              className="h-13 rounded-xl border-white/15 bg-white/5 px-7 font-black text-white backdrop-blur-sm hover:bg-white/10 hover:border-white/25"
            >
              <a href={ZALO_OA_URL} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="mr-2 h-4 w-4" />
                Liên hệ tư vấn
              </a>
            </Button>
          </div>

          {/* Stats */}
          <div className="flex flex-wrap items-center gap-6 border-t border-white/10 pt-6">
            {STATS.map((s) => (
              <div key={s.label}>
                <p className="text-2xl font-black text-white">{s.value}</p>
                <p className="text-xs font-semibold text-slate-500">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Right — dashboard mockup */}
        <div className="hidden lg:flex lg:items-center lg:justify-center">
          <DashboardMockup />
        </div>
      </div>
    </section>
  )
}
