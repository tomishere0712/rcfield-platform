import { Link } from "react-router"
import { useQuery } from "@tanstack/react-query"
import { ArrowRight } from "lucide-react"
import { motion, useReducedMotion } from "framer-motion"
import { routePaths } from "@/app/router/route-paths"
import { getCafes } from "@/features/explore/api/explore.api"
import { Button } from "@/shared/ui/button"
import { HomeSearchPanel } from "./HomeSearchPanel"
import { HeroShowcaseRail } from "./HeroShowcaseRail"
import { fadeUpItem, landingViewport, staggerContainer } from "./landing-motion"
import { mapCafeToHeroVenue, rankLandingCafes } from "./landing-mappers"
import { ANDROID_APK_URL } from "./AndroidAppDownloadSection"

export function HomeHeroSection() {
  const prefersReducedMotion = useReducedMotion()
  const { data: cafes = [], isLoading } = useQuery({
    queryKey: ["landing", "hero-cafes"],
    queryFn: () => getCafes({ limit: 6 }),
  })

  const venues = rankLandingCafes(cafes).slice(0, 3).map(mapCafeToHeroVenue)
  const stats = buildHeroStats(cafes)

  return (
    <section className="home-landing relative overflow-hidden bg-[var(--landing-background)]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(circle_at_top_left,_rgba(251,146,60,0.22),_transparent_38%),radial-gradient(circle_at_top_right,_rgba(15,23,42,0.08),_transparent_34%)]" />

      <div className="mx-auto max-w-7xl px-4 pb-20 pt-10 md:px-6 lg:pb-28 lg:pt-18">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_460px] lg:items-center">
          <motion.div
            variants={staggerContainer}
            initial={prefersReducedMotion ? false : "hidden"}
            whileInView={prefersReducedMotion ? undefined : "visible"}
            viewport={landingViewport}
            className="space-y-8"
          >
            <motion.div variants={fadeUpItem} className="inline-flex items-center rounded-full border border-orange-200 bg-white/80 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-orange-600 shadow-[var(--landing-shadow-soft)]">
              Đặt sân RC nhanh và rõ ràng
            </motion.div>

            <motion.div variants={fadeUpItem} className="space-y-5">
              <h1 className="max-w-3xl text-5xl font-black leading-[0.98] tracking-tight text-slate-950 md:text-6xl xl:text-[4.7rem]">
                Chạy RC <span className="text-orange-600">đúng sân</span>, đúng giờ, không lo cọc.
              </h1>
              <p className="max-w-xl text-base font-medium leading-8 text-slate-600 md:text-lg">
                Tìm RC Cafe gần bạn, chọn khung giờ, đặt xe thuê và thanh toán trực tuyến trong một trải nghiệm gọn gàng, minh bạch và dễ hiểu.
              </p>
            </motion.div>

            <motion.div variants={fadeUpItem} className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  asChild
                  size="lg"
                  className="h-13 rounded-2xl bg-orange-600 px-7 font-black text-white shadow-[0_20px_42px_-20px_rgba(234,88,12,0.8)] hover:bg-orange-500"
                >
                  <Link to={routePaths.cafes}>
                    Khám phá sân RC
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>

                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="h-13 rounded-2xl border-slate-200 bg-white/80 px-7 font-black text-slate-800 shadow-[var(--landing-shadow-soft)] hover:border-slate-300 hover:bg-white"
                >
                  <Link to={routePaths.register}>Tạo tài khoản miễn phí</Link>
                </Button>
              </div>

              {/* Nút Tải App Android thiết kế viền cam bo cong pill-shape nằm bên dưới */}
              <div>
                <a
                  href={ANDROID_APK_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-3.5 rounded-full border border-orange-300 bg-white px-5 py-2.5 shadow-md hover:border-orange-400 hover:shadow-lg hover:-translate-y-0.5 transition-all group"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-50 text-[#FF5500] group-hover:scale-110 transition-transform">
                    <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24">
                      <path d="M17.523 15.3414C17.06 15.3414 16.691 14.9659 16.691 14.5029C16.691 14.0399 17.06 13.6644 17.523 13.6644C17.986 13.6644 18.355 14.0399 18.355 14.5029C18.355 14.9659 17.986 15.3414 17.523 15.3414ZM6.477 15.3414C6.014 15.3414 5.645 14.9659 5.645 14.5029C5.645 14.0399 6.014 13.6644 6.477 13.6644C6.94 13.6644 7.309 14.0399 7.309 14.5029C7.309 14.9659 6.94 15.3414 6.477 15.3414ZM17.947 10.7099L19.645 7.7669C19.789 7.5179 19.703 7.2029 19.454 7.0589C19.205 6.9149 18.89 7.0009 18.746 7.2499L17.009 10.2579C15.539 9.5889 13.844 9.2029 12 9.2029C10.156 9.2029 8.461 9.5889 6.991 10.2579L5.254 7.2499C5.11 7.0009 4.795 6.9149 4.546 7.0589C4.297 7.2029 4.211 7.5179 4.355 7.7669L6.053 10.7099C2.793 12.5139 0.548 15.8679 0.088 19.7999H23.912C23.452 15.8679 21.207 12.5139 17.947 10.7099Z" />
                    </svg>
                  </div>
                  <div className="text-left">
                    <div className="text-[11px] font-bold text-slate-600 leading-none">Tải xuống cho</div>
                    <div className="text-sm font-black text-slate-900 leading-tight mt-0.5">Android (APK)</div>
                  </div>
                </a>
              </div>
            </motion.div>

            <motion.div variants={fadeUpItem} className="grid gap-3 sm:grid-cols-3">
              {stats.map((item) => (
                <div
                  key={item.label}
                  className="rounded-[24px] border border-white/70 bg-white/78 px-5 py-4 shadow-[var(--landing-shadow-soft)]"
                >
                  <p className="text-lg font-black text-slate-950">{item.value}</p>
                  <p className="mt-1 text-sm font-medium text-slate-500">{item.label}</p>
                </div>
              ))}
            </motion.div>
          </motion.div>

          <HeroShowcaseRail venues={venues} isLoading={isLoading} />
        </div>

        <div className="mt-10 lg:mt-12">
          <HomeSearchPanel />
        </div>
      </div>
    </section>
  )
}

function buildHeroStats(cafes: Awaited<ReturnType<typeof getCafes>>) {
  const activeCafes = cafes.length
  const activeCities = new Set(cafes.map((cafe) => cafe.city).filter(Boolean)).size
  const averageRating =
    cafes.length > 0
      ? cafes.reduce((sum, cafe) => sum + (Number.isFinite(cafe.rating) ? cafe.rating : 0), 0) / cafes.length
      : 0

  return [
    {
      label: "RC Cafe đang mở",
      value: activeCafes > 0 ? String(activeCafes) : "0",
    },
    {
      label: "Tỉnh thành có sân",
      value: activeCities > 0 ? String(activeCities) : "0",
    },
    {
      label: "Đánh giá trung bình",
      // Trang chủ chưa có đánh giá nào thì nói thẳng là chưa có, thay vì "N/A"
      // — viết tắt tiếng Anh giữa một trang tiếng Việt.
      value: averageRating > 0 ? averageRating.toFixed(1) : "Chưa có",
    },
  ]
}
