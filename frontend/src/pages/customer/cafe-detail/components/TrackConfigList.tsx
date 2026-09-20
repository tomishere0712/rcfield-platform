import { useState } from "react"
import {
  ChevronLeft,
  ChevronRight,
  Images,
  Maximize2,
  Car,
  UserCheck,
  ImageOff,
} from "lucide-react"
import { useTrackConfigs } from "@/features/cafes/hooks/useTrackConfigs"
import type { TrackConfig } from "@/features/cafes/types"
import { cn } from "@/shared/lib/utils"
import { TrackAlbumDialog } from "@/shared/components/TrackAlbumDialog"

export function TrackConfigList({ cafeId }: { cafeId: string }) {
  const { data: configs = [], isLoading } = useTrackConfigs(cafeId)

  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-64 animate-pulse rounded-2xl bg-slate-100"
          />
        ))}
      </div>
    )
  }

  if (configs.length === 0) return null

  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {configs.map((config) => (
        <TrackCard key={config.id} config={config} />
      ))}
    </div>
  )
}

function TrackCard({ config }: { config: TrackConfig }) {
  const [imageIdx, setImageIdx] = useState(0)
  const [showAlbum, setShowAlbum] = useState(false)
  const images = config.images ?? []
  const hasImages = images.length > 0
  const currentImage = images[imageIdx] || images[0]

  const prev = (e: React.MouseEvent) => {
    e.stopPropagation()
    setImageIdx((i) => (i > 0 ? i - 1 : images.length - 1))
  }

  const next = (e: React.MouseEvent) => {
    e.stopPropagation()
    setImageIdx((i) => (i < images.length - 1 ? i + 1 : 0))
  }

  const openAlbum = (e: React.MouseEvent) => {
    e.stopPropagation()
    setShowAlbum(true)
  }

  return (
    <>
      <article className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white transition-all hover:border-orange-200 hover:shadow-md">
        {/* Cover / Carousel Image */}
        <div
          onClick={openAlbum}
          className="relative aspect-video w-full cursor-pointer overflow-hidden bg-slate-100"
        >
          {hasImages ? (
            <img
              src={currentImage}
              alt={`${config.track_type?.name ?? "Loại sân"} ${imageIdx + 1}`}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-103"
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-1 text-slate-400">
              <ImageOff className="size-7" />
              <span className="text-xs font-medium">Chưa có ảnh</span>
            </div>
          )}

          {/* Photo count badge */}
          {hasImages && (
            <div className="absolute left-2.5 top-2.5 z-10">
              <span className="flex items-center gap-1 rounded-md bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur-xs">
                <Images className="size-3" />
                <span>{images.length} ảnh</span>
              </span>
            </div>
          )}

          {/* Carousel Arrows */}
          {images.length > 1 && (
            <>
              <button
                type="button"
                onClick={prev}
                className="absolute left-2 top-1/2 z-10 flex size-7 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition hover:bg-black/80 group-hover:opacity-100"
                title="Ảnh trước"
              >
                <ChevronLeft className="size-4" />
              </button>
              <button
                type="button"
                onClick={next}
                className="absolute right-2 top-1/2 z-10 flex size-7 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition hover:bg-black/80 group-hover:opacity-100"
                title="Ảnh tiếp"
              >
                <ChevronRight className="size-4" />
              </button>

              {/* Dots indicator */}
              <div className="absolute bottom-2 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-full bg-black/40 px-2 py-0.5 backdrop-blur-xs">
                {images.slice(0, 5).map((_, i) => (
                  <span
                    key={i}
                    className={cn(
                      "size-1.5 rounded-full transition-all",
                      i === imageIdx ? "w-3 bg-white" : "bg-white/60",
                    )}
                  />
                ))}
                {images.length > 5 && (
                  <span className="text-[9px] font-bold text-white/80">
                    +{images.length - 5}
                  </span>
                )}
              </div>
            </>
          )}

          {/* Quick expand button */}
          {hasImages && (
            <button
              type="button"
              onClick={openAlbum}
              className="absolute bottom-2 right-2 z-10 flex size-6 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition hover:bg-black/80 group-hover:opacity-100"
              title="Phóng to album"
            >
              <Maximize2 className="size-3" />
            </button>
          )}
        </div>

        {/* Info content */}
        <div className="flex flex-1 flex-col p-4">
          <div className="flex items-start justify-between gap-2">
            <h4 className="text-base font-bold text-slate-900">
              {config.track_type?.name ?? "Loại sân"}
            </h4>
            {hasImages && (
              <button
                type="button"
                onClick={openAlbum}
                className="text-xs font-semibold text-orange-600 hover:text-orange-700 hover:underline"
              >
                Xem album
              </button>
            )}
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-600">
            <span className="flex items-center gap-1.5 font-medium">
              <Car className="size-3.5 text-orange-500" />
              {config.max_concurrent > 0 ? (
                <span>{config.max_concurrent} xe thuê</span>
              ) : (
                <span className="text-slate-400">Không có xe thuê</span>
              )}
            </span>
            <span className="flex items-center gap-1.5 font-medium">
              <UserCheck className="size-3.5 text-emerald-500" />
              {config.byoc_capacity > 0 ? (
                <span>Tối đa {config.byoc_capacity} xe tự mang</span>
              ) : (
                <span className="text-slate-400">Không nhận xe riêng</span>
              )}
            </span>
          </div>

          {config.description && (
            <p className="mt-2.5 line-clamp-2 text-xs leading-5 text-slate-500">
              {config.description}
            </p>
          )}
        </div>
      </article>

      {/* Lightbox Album Dialog */}
      <TrackAlbumDialog
        trackConfig={config}
        isOpen={showAlbum}
        onClose={() => setShowAlbum(false)}
        initialIndex={imageIdx}
      />
    </>
  )
}
