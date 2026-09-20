import { ArrowRight, MapPin, Star } from "lucide-react"
import { Link } from "react-router"
import { useQuery } from "@tanstack/react-query"
import { routePaths } from "@/app/router/route-paths"
import { Button } from "@/shared/ui/button"
import { getCafes } from "@/features/explore/api/explore.api"
import { QuickSearchPanel } from "./QuickSearchPanel"

const FALLBACK_CAFES = [
  {
    image: "https://images.unsplash.com/photo-1594787318286-3d835c1d207f?auto=format&fit=crop&q=80&w=600",
    name: "RC Tân Bình",
    city: "TP. Hồ Chí Minh",
    rating: 4.9,
  },
  {
    image: "https://images.unsplash.com/photo-1531384441138-2736e62e0919?auto=format&fit=crop&q=80&w=600",
    name: "RC Arena Sài Gòn",
    city: "TP. Hồ Chí Minh",
    rating: 4.8,
  },
  {
    image: "https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?auto=format&fit=crop&q=80&w=600",
    name: "PlayZone RC Cafe",
    city: "Hà Nội",
    rating: 4.7,
  },
]

export function LandingHero() {
  const { data: cafes = [] } = useQuery({
    queryKey: ["explore", "cafes", { limit: 3 }],
    queryFn: () => getCafes({ limit: 3 }),
  })

  // Merge loaded cafes with fallback ones if list is short
  const heroCafes = Array.from({ length: 3 }).map((_, idx) => {
    const loaded = cafes[idx]
    if (loaded) {
      return {
        id: loaded.id,
        image: loaded.image,
        name: loaded.name,
        city: loaded.city || loaded.district,
        rating: loaded.rating || 4.5,
      }
    }
    return FALLBACK_CAFES[idx]
  })

  return (
    <section className="relative overflow-hidden bg-slate-950">
      {/* Ambient glows */}
      <div className="pointer-events-none absolute -top-32 left-1/4 h-[600px] w-[600px] rounded-full bg-orange-600/20 blur-[140px]" />
      <div className="pointer-events-none absolute bottom-0 right-1/4 h-[400px] w-[400px] rounded-full bg-indigo-600/15 blur-[120px]" />

      <div className="relative mx-auto grid min-h-[100svh] max-w-7xl items-center gap-12 px-4 py-20 md:px-6 lg:grid-cols-2 lg:py-0">
        {/* Left — copy */}
        <div className="space-y-8 lg:py-24">
          <div className="inline-flex items-center gap-2 rounded-full border border-orange-500/30 bg-orange-500/10 px-4 py-1.5 text-xs font-black uppercase tracking-widest text-orange-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-orange-400" />
            Nền tảng đặt lịch RC tại Việt Nam
          </div>

          <div className="space-y-4">
            <h1 className="text-5xl font-black leading-[1.05] tracking-tight text-white md:text-6xl xl:text-7xl">
              Chạy RC{" "}
              <span className="bg-gradient-to-r from-orange-400 to-orange-600 bg-clip-text text-transparent">
                đúng sân,
              </span>
              <br />
              đúng giờ, <br />không lo cọc.
            </h1>
            <p className="max-w-lg text-base font-medium leading-7 text-slate-400 md:text-lg">
              Tìm RC Cafe gần bạn, chọn khung giờ, đặt xe thuê và thanh toán trực tuyến — tất cả trong vài phút.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              asChild
              size="lg"
              className="group h-13 rounded-xl bg-orange-600 px-7 font-black text-white shadow-xl shadow-orange-600/30 transition-all hover:bg-orange-50 hover:shadow-orange-500/40 hover:shadow-2xl hover:-translate-y-0.5"
            >
              <Link to={routePaths.cafes}>
                Khám phá sân RC
                <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="h-13 rounded-xl border-white/15 bg-white/5 px-7 font-black text-white backdrop-blur-sm hover:bg-white/10 hover:border-white/25"
            >
              <Link to={routePaths.register}>Tạo tài khoản miễn phí</Link>
            </Button>
          </div>

          {/* Social proof */}
          <div className="flex flex-wrap items-center gap-6 border-t border-white/10 pt-6">
            {[
              { value: "50+", label: "RC Cafe" },
              { value: "12k+", label: "Phiên chơi" },
              { value: "4.8★", label: "Đánh giá TB" },
            ].map((s) => (
              <div key={s.label}>
                <p className="text-2xl font-black text-white">{s.value}</p>
                <p className="text-xs font-semibold text-slate-500">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Right — cafe cards stack */}
        <div className="relative hidden h-[620px] lg:block">
          {/* Main card */}
          <div className="absolute right-0 top-1/2 w-72 -translate-y-1/2 overflow-hidden rounded-3xl border border-white/10 bg-slate-900 shadow-2xl shadow-black/50">
            <div className="relative aspect-[4/3] overflow-hidden">
              <img
                src={heroCafes[0].image}
                alt={heroCafes[0].name}
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 to-transparent" />
              <div className="absolute bottom-3 left-3 right-3">
                <p className="font-black text-white">{heroCafes[0].name}</p>
                <div className="mt-1 flex items-center gap-1.5">
                  <MapPin className="h-3 w-3 text-slate-300" />
                  <span className="text-xs text-slate-300">{heroCafes[0].city}</span>
                  <span className="ml-auto flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-bold text-amber-400">
                    <Star className="h-3 w-3 fill-amber-400" /> {heroCafes[0].rating.toFixed(1)}
                  </span>
                </div>
              </div>
            </div>
            <div className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400">Slot trống hôm nay</span>
                <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-black text-emerald-400">● Còn chỗ</span>
              </div>
              <Button asChild className="mt-3 w-full rounded-xl bg-orange-600 font-black text-white hover:bg-orange-500" size="sm">
                <Link to={routePaths.cafes}>Đặt lịch ngay</Link>
              </Button>
            </div>
          </div>

          {/* Card 2 — top left */}
          <div className="absolute left-4 top-12 w-52 overflow-hidden rounded-2xl border border-white/10 bg-slate-900/80 shadow-xl shadow-black/40 backdrop-blur-sm">
            <div className="relative aspect-[4/3] overflow-hidden">
              <img src={heroCafes[1].image} alt={heroCafes[1].name} className="h-full w-full object-cover opacity-90" />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-900/70 to-transparent" />
              <div className="absolute bottom-2 left-2 right-2">
                <p className="text-sm font-black text-white">{heroCafes[1].name}</p>
                <p className="text-[10px] text-slate-300">{heroCafes[1].city}</p>
              </div>
            </div>
          </div>

          {/* Card 3 — bottom left */}
          <div className="absolute bottom-16 left-0 w-52 overflow-hidden rounded-2xl border border-white/10 bg-slate-900/80 shadow-xl shadow-black/40 backdrop-blur-sm">
            <div className="relative aspect-[4/3] overflow-hidden">
              <img src={heroCafes[2].image} alt={heroCafes[2].name} className="h-full w-full object-cover opacity-90" />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-900/70 to-transparent" />
              <div className="absolute bottom-2 left-2 right-2">
                <p className="text-sm font-black text-white">{heroCafes[2].name}</p>
                <p className="text-[10px] text-slate-300">{heroCafes[2].city}</p>
              </div>
            </div>
          </div>

          {/* Floating badge */}
          <div className="absolute bottom-28 right-4 rounded-2xl border border-white/10 bg-slate-800/90 px-4 py-3 shadow-xl backdrop-blur-sm">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Vừa đặt xong</p>
            <p className="mt-1 text-sm font-black text-white font-display">Nguyễn Minh Tuấn</p>
            <p className="text-xs text-orange-400 font-semibold">Track Drift · 14:00 – 16:00</p>
          </div>
        </div>
      </div>

      {/* Quick Search Panel (Centered horizontally at the bottom of the Hero section) */}
      <div className="relative mx-auto max-w-7xl px-4 md:px-6 pb-20">
        <QuickSearchPanel />
      </div>
    </section>
  )
}
