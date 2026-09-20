import { Link } from "react-router"
import { useQuery } from "@tanstack/react-query"
import { ArrowRight } from "lucide-react"
import { getCafes } from "@/features/explore/api/explore.api"
import { routePaths } from "@/app/router/route-paths"
import { FeaturedVenueSpotlight } from "./FeaturedVenueSpotlight"
import { FeaturedVenueStack } from "./FeaturedVenueStack"
import { SectionIntro } from "./SectionIntro"
import { mapCafeToFeaturedVenue, rankLandingCafes } from "./landing-mappers"

export function FeaturedVenuesSection() {
  const { data: cafes = [], isLoading } = useQuery({
    queryKey: ["landing", "featured-cafes"],
    queryFn: () => getCafes({ limit: 12 }),
  })

  const rankedVenues = rankLandingCafes(cafes).slice(0, 3).map(mapCafeToFeaturedVenue)
  const [spotlightVenue, ...stackVenues] = rankedVenues

  return (
    <section className="bg-white py-22 md:py-28">
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        <SectionIntro
          eyebrow="Điểm đến lý tưởng"
          title="Cơ sở RC Cafe nổi bật"
          description="Danh sách các cơ sở được ưu tiên hiển thị theo chất lượng dữ liệu hiện có, mức độ hoàn thiện và đánh giá của người chơi."
          action={
            <Link
              to={routePaths.cafes}
              className="inline-flex items-center gap-2 text-sm font-black text-orange-600 transition-colors hover:text-orange-700"
            >
              Xem tất cả cơ sở
              <ArrowRight className="h-4 w-4" />
            </Link>
          }
        />

        <div className="mt-10">
          {isLoading ? (
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.9fr)_minmax(280px,0.9fr)]">
              <div className="aspect-[1.58] animate-pulse rounded-[32px] bg-slate-200/80" />
              <div className="grid gap-5">
                <div className="aspect-[1.62] animate-pulse rounded-[28px] bg-slate-200/70" />
                <div className="aspect-[1.62] animate-pulse rounded-[28px] bg-slate-200/70" />
              </div>
            </div>
          ) : spotlightVenue ? (
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.9fr)_minmax(280px,0.9fr)]">
              <FeaturedVenueSpotlight venue={spotlightVenue} />
              <FeaturedVenueStack venues={stackVenues} />
            </div>
          ) : (
            <div className="rounded-[32px] border border-dashed border-slate-300 bg-[var(--landing-surface-soft)] px-8 py-14 text-center">
              <p className="text-sm font-black uppercase tracking-[0.18em] text-orange-600">Chưa có dữ liệu phù hợp</p>
              <p className="mt-3 text-base font-medium leading-7 text-slate-600">
                Homepage sẽ tự hiển thị cơ sở nổi bật khi backend trả về danh sách quán đang hoạt động.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
