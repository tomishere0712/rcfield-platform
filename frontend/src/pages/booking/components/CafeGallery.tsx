import { useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import type { CafeGalleryImage } from "@/features/booking/data/mock-cafe-detail"
import { cn } from "@/shared/lib/utils"

interface CafeGalleryProps {
  images: CafeGalleryImage[]
  name: string
}

export function CafeGallery({ images }: CafeGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0)

  if (!images.length) return null

  const active = images[activeIndex]

  return (
    <div className="grid grid-cols-[1fr_100px] gap-1.5">
      {/* Main image */}
      <div className="group relative aspect-[4/3] overflow-hidden rounded-xl bg-slate-100">
        <img src={active.src} alt={active.alt} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />
        <div className="absolute bottom-2.5 left-2.5">
          <span className="bg-black/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
            {active.type}
          </span>
        </div>
        {images.length > 1 && (
          <>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setActiveIndex((i) => (i - 1 + images.length) % images.length) }}
              className="absolute left-1.5 top-1/2 -translate-y-1/2 rounded-xl bg-black/40 p-1 text-white opacity-0 transition hover:bg-black/70 group-hover:opacity-100"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setActiveIndex((i) => (i + 1) % images.length) }}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-xl bg-black/40 p-1 text-white opacity-0 transition hover:bg-black/70 group-hover:opacity-100"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </>
        )}
        <div className="absolute right-2 top-2 bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
          {activeIndex + 1}/{images.length}
        </div>
      </div>

      {/* Thumbnail strip */}
      <div className="flex flex-col gap-1 overflow-y-auto">
        {images.map((img, idx) => (
          <button
            key={img.id}
            type="button"
            onClick={() => setActiveIndex(idx)}
            className={cn(
              "relative aspect-[4/3] shrink-0 overflow-hidden rounded-lg border bg-slate-100 transition-all",
              idx === activeIndex ? "border-black" : "border-transparent opacity-60 hover:opacity-100",
            )}
          >
            <img src={img.src} alt={img.alt} className="h-full w-full object-cover" />
          </button>
        ))}
      </div>
    </div>
  )
}
