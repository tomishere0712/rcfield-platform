import { Link } from "react-router"
import { MapPin } from "lucide-react"
import { motion, useReducedMotion } from "framer-motion"
import type { FeaturedVenueViewModel } from "./landing-types"

export function FeaturedVenueStack({ venues }: { venues: FeaturedVenueViewModel[] }) {
  const prefersReducedMotion = useReducedMotion()

  return (
    <div className="grid gap-5">
      {venues.map((venue, index) => (
        <motion.article
          key={venue.id}
          initial={prefersReducedMotion ? false : { opacity: 0, x: 24 }}
          whileInView={prefersReducedMotion ? undefined : { opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: prefersReducedMotion ? 0 : index * 0.08, ease: [0.22, 1, 0.36, 1] }}
          whileHover={prefersReducedMotion ? undefined : { y: -4 }}
          className="group overflow-hidden rounded-[28px] bg-white shadow-[var(--landing-shadow-soft)]"
        >
          <div className="relative aspect-[1.62] bg-[var(--landing-surface-soft)]">
            {venue.image && venue.hasRealImage ? (
              <>
                <img
                  src={venue.image}
                  alt={venue.name}
                  className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-slate-950/10 to-transparent" />
              </>
            ) : (
              <div className="flex h-full items-end bg-[linear-gradient(145deg,_#f8fafc,_#e2e8f0)] p-5">
                <p className="rounded-2xl bg-white/80 px-4 py-3 text-sm font-bold text-slate-600 shadow-sm">
                  Ảnh cơ sở đang cập nhật
                </p>
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 p-5 text-white">
              <h3 className="text-2xl font-black tracking-tight">
                <Link to={venue.detailHref} className="transition-colors hover:text-orange-300">
                  {venue.name}
                </Link>
              </h3>
              <p className="mt-2 flex items-center gap-2 text-sm text-slate-200">
                <MapPin className="h-4 w-4 text-orange-300" />
                {venue.cityLabel}
              </p>
            </div>
          </div>
        </motion.article>
      ))}
    </div>
  )
}
