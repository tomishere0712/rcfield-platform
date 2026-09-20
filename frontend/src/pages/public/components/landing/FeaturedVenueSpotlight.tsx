import { Link } from "react-router"
import { MapPin, Star } from "lucide-react"
import { motion, useReducedMotion } from "framer-motion"
import { cn } from "@/shared/lib/utils"
import type { FeaturedVenueViewModel } from "./landing-types"

export function FeaturedVenueSpotlight({ venue }: { venue: FeaturedVenueViewModel }) {
  const prefersReducedMotion = useReducedMotion()

  return (
    <motion.article
      initial={prefersReducedMotion ? false : { opacity: 0, y: 24 }}
      whileInView={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true }}
      whileHover={prefersReducedMotion ? undefined : { y: -5 }}
      transition={{ duration: 0.52, ease: [0.22, 1, 0.36, 1] }}
      className="group relative overflow-hidden rounded-[32px] bg-slate-200 shadow-[var(--landing-shadow-soft)]"
    >
      <div className="relative aspect-[1.58]">
        <VenueImage venue={venue} />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950 via-slate-950/75 to-transparent px-6 pb-6 pt-20 text-white lg:px-8 lg:pb-8">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-orange-500 px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-white">
              Nổi bật
            </span>
            {venue.ratingLabel ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-white/16 px-3 py-1 text-xs font-black text-white backdrop-blur">
                <Star className="h-3.5 w-3.5 fill-current" />
                {venue.ratingLabel}
              </span>
            ) : null}
          </div>
          <h3 className="text-3xl font-black tracking-tight">
            <Link to={venue.detailHref} className="transition-colors hover:text-orange-300">
              {venue.name}
            </Link>
          </h3>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-medium text-slate-200">
            <span className="inline-flex items-center gap-2">
              <MapPin className="h-4 w-4 text-orange-300" />
              {venue.districtLabel}
            </span>
            <span>{venue.trackLabel}</span>
          </div>
        </div>
      </div>
    </motion.article>
  )
}

function VenueImage({ venue }: { venue: FeaturedVenueViewModel }) {
  if (!venue.image || !venue.hasRealImage) {
    return (
      <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_top_left,_rgba(251,146,60,0.3),_transparent_34%),linear-gradient(155deg,_#cbd5e1,_#e2e8f0)] px-6 text-center">
        <div className="max-w-sm rounded-[24px] border border-white/55 bg-white/72 px-5 py-4 backdrop-blur">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-orange-600">Cơ sở chưa có ảnh cover</p>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-700">
            RCField vẫn hiển thị thông tin cơ sở thật để bạn đi tiếp vào trang chi tiết.
          </p>
        </div>
      </div>
    )
  }

  return (
    <>
      <img
        src={venue.image}
        alt={venue.name}
        className={cn("h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]")}
      />
      <div className="absolute inset-0 bg-slate-950/10" />
    </>
  )
}
