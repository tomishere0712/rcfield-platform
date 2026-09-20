import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router"
import { motion } from "framer-motion"
import { Star, MapPin, ArrowRight } from "lucide-react"
import { getCafes } from "@/features/explore/api/explore.api"
import { Button } from "@/shared/ui/button"
import { routePaths } from "@/app/router/route-paths"
import { formatCurrency } from "@/shared/lib/format"
import {
  buildCafeBookingPath,
  buildCafeDetailPath,
} from "@/pages/customer/cafe-detail/cafe-detail-utils"

export function FeaturedCafes() {
  const { data: cafes = [], isLoading } = useQuery({
    queryKey: ["explore", "cafes", { limit: 6 }],
    queryFn: () => getCafes({ limit: 6 }),
  })

  // Filter or sort by rating
  const topCafes = [...cafes]
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 3)

  return (
    <section className="bg-slate-50 py-24">
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end md:justify-between mb-12">
          <div>
            <p className="mb-3 text-xs font-black uppercase tracking-[0.2em] text-orange-600">
              Điểm đến lý tưởng
            </p>
            <h2 className="text-3xl font-black tracking-tight text-slate-950 md:text-4xl">
              Cơ sở RC Cafe nổi bật
            </h2>
            <p className="mt-2 text-sm font-medium text-slate-500 max-w-xl">
              Danh sách các cơ sở được cộng đồng đánh giá cao nhất về chất lượng track, độ hoành tráng và dịch vụ đi kèm.
            </p>
          </div>
          <Link
            to={routePaths.cafes}
            className="group mt-4 inline-flex items-center gap-1 text-sm font-bold text-orange-600 hover:text-orange-700 md:mt-0 transition-colors"
          >
            Xem tất cả cơ sở
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-96 animate-pulse rounded-3xl bg-slate-200/60" />
            ))}
          </div>
        ) : topCafes.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center">
            <p className="text-slate-400 font-semibold">Chưa có cơ sở nào hoạt động.</p>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {topCafes.map((cafe, index) => {
              return (
                <motion.div
                  key={cafe.id}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                  whileHover={{ y: -6 }}
                  className="group flex flex-col overflow-hidden rounded-3xl border border-slate-200/50 bg-white shadow-sm transition-all hover:shadow-xl hover:shadow-slate-200/50"
                >
                  {/* Cover image */}
                  <Link
                    to={buildCafeDetailPath(cafe)}
                    className="relative aspect-[16/10] overflow-hidden bg-slate-100"
                  >
                    <img
                      src={cafe.image}
                      alt={cafe.name}
                      className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/40 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                    
                    {cafe.rating > 0 && (
                      <div className="absolute top-4 right-4 flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-xs font-bold text-slate-900 shadow-md backdrop-blur-sm">
                        <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />
                        {cafe.rating.toFixed(1)}
                      </div>
                    )}
                  </Link>

                  {/* Body info */}
                  <div className="flex flex-1 flex-col justify-between p-6">
                    <div className="space-y-3">
                      <div>
                        <span className="rounded-full bg-orange-50 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-orange-600">
                          RC Branch
                        </span>
                      </div>
                      <Link
                        to={buildCafeDetailPath(cafe)}
                        className="block text-lg font-black text-slate-900 hover:text-orange-600 transition-colors leading-snug line-clamp-1"
                      >
                        {cafe.name}
                      </Link>

                      <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                        <MapPin className="h-3.5 w-3.5 text-red-500 shrink-0" />
                        {cafe.district}, {cafe.city}
                      </p>

                      {/* Tracks */}
                      {cafe.trackTypes.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {cafe.trackTypes.map((t) => (
                            <span
                              key={t}
                              className="rounded-lg bg-slate-100 px-2.5 py-0.5 text-2xs font-bold text-slate-600"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Bottom row */}
                    <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
                      <div>
                        <span className="text-3xs font-extrabold uppercase tracking-wider text-slate-400 block">
                          Giá mỗi giờ
                        </span>
                        <span className="text-sm font-black text-orange-600">
                          {cafe.slotFeeRate ? `${formatCurrency(cafe.slotFeeRate)} VND` : "Giá liên hệ"}
                        </span>
                      </div>

                      <Button
                        asChild
                        size="sm"
                        className="rounded-xl bg-orange-600 px-4 font-bold text-white shadow-md shadow-orange-600/10 hover:bg-orange-700 hover:shadow-lg active:scale-95"
                      >
                        <Link to={buildCafeBookingPath(cafe.id)}>
                          Đặt lịch
                        </Link>
                      </Button>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
