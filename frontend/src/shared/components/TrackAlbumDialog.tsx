import { useState, useEffect } from "react"
import {
  ChevronLeft,
  ChevronRight,
  X,
  Car,
  UserCheck,
  Info,
  Layers,
} from "lucide-react"
import type { TrackConfig } from "@/features/cafes/types"
import { cn } from "@/shared/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog"
import { Badge } from "@/shared/ui/badge"

interface TrackAlbumDialogProps {
  trackConfig: TrackConfig | null
  isOpen: boolean
  onClose: () => void
  initialIndex?: number
}

export function TrackAlbumDialog({
  trackConfig,
  isOpen,
  onClose,
  initialIndex = 0,
}: TrackAlbumDialogProps) {
  if (!trackConfig) return null

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[92svh] max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl sm:max-w-4xl"
      >
        {isOpen && (
          <TrackAlbumDialogContent
            trackConfig={trackConfig}
            initialIndex={initialIndex}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function TrackAlbumDialogContent({
  trackConfig,
  initialIndex,
  onClose,
}: {
  trackConfig: TrackConfig
  initialIndex: number
  onClose: () => void
}) {
  const images = trackConfig.images ?? []
  const hasImages = images.length > 0
  const [currentIndex, setCurrentIndex] = useState(
    Math.min(initialIndex, Math.max(0, images.length - 1)),
  )

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        setCurrentIndex((prev) =>
          prev > 0 ? prev - 1 : images.length - 1,
        )
      } else if (e.key === "ArrowRight") {
        setCurrentIndex((prev) =>
          prev < images.length - 1 ? prev + 1 : 0,
        )
      } else if (e.key === "Escape") {
        onClose()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [images.length, onClose])

  const currentImage = images[currentIndex] || images[0]

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1))
  }

  const handleNext = () => {
    setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0))
  }

  return (
    <>
      <DialogHeader className="sr-only">
        <DialogTitle>
          Album ảnh: {trackConfig.track_type?.name ?? "Loại sân"}
        </DialogTitle>
      </DialogHeader>

      {/* Top Header Bar */}
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-orange-100 text-orange-600">
            <Layers className="size-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-slate-900">
                {trackConfig.track_type?.name ?? "Loại sân"}
              </h3>
              {hasImages && (
                <Badge
                  variant="secondary"
                  className="bg-slate-100 text-xs font-semibold text-slate-700"
                >
                  {currentIndex + 1} / {images.length}
                </Badge>
              )}
            </div>
            <p className="text-xs text-slate-500">
              Chi tiết hình ảnh và thông số kỹ thuật sân
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="flex size-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200 hover:text-slate-800"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex flex-col overflow-y-auto max-h-[calc(92svh-60px)]">
        {/* Main Photo Viewer */}
        <div className="relative aspect-video w-full bg-slate-950 flex items-center justify-center overflow-hidden">
          {hasImages ? (
            <img
              src={currentImage}
              alt={`${trackConfig.track_type?.name} - Ảnh ${currentIndex + 1}`}
              className="h-full w-full object-contain select-none"
            />
          ) : (
            <div className="text-sm font-medium text-slate-400">
              Chưa có hình ảnh cho loại sân này
            </div>
          )}

          {/* Prev / Next controls */}
          {images.length > 1 && (
            <>
              <button
                type="button"
                onClick={handlePrev}
                className="absolute left-3 top-1/2 -translate-y-1/2 flex size-10 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition hover:bg-black/80 hover:scale-105 active:scale-95"
              >
                <ChevronLeft className="size-6" />
              </button>
              <button
                type="button"
                onClick={handleNext}
                className="absolute right-3 top-1/2 -translate-y-1/2 flex size-10 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition hover:bg-black/80 hover:scale-105 active:scale-95"
              >
                <ChevronRight className="size-6" />
              </button>
            </>
          )}
        </div>

        {/* Thumbnails Row */}
        {images.length > 1 && (
          <div className="flex items-center gap-2 overflow-x-auto bg-slate-900 p-3 border-b border-slate-800">
            {images.map((imgUrl, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setCurrentIndex(idx)}
                className={cn(
                  "relative size-14 shrink-0 overflow-hidden rounded-lg border-2 transition-all",
                  idx === currentIndex
                    ? "border-orange-500 scale-105 shadow-md ring-2 ring-orange-400/50"
                    : "border-transparent opacity-60 hover:opacity-100 hover:border-white/50",
                )}
              >
                <img
                  src={imgUrl}
                  alt={`Thumbnail ${idx + 1}`}
                  className="h-full w-full object-cover"
                />
              </button>
            ))}
          </div>
        )}

        {/* Track Details & Specs */}
        <div className="p-5 space-y-4 bg-white">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3.5">
              <div className="flex size-9 items-center justify-center rounded-lg bg-orange-100 text-orange-600">
                <Car className="size-5" />
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500">
                  Sức chứa thuê xe
                </p>
                <p className="text-sm font-bold text-slate-900">
                  {trackConfig.max_concurrent > 0
                    ? `${trackConfig.max_concurrent} xe cùng lúc`
                    : "Không có xe thuê sẵn"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3.5">
              <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
                <UserCheck className="size-5" />
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500">
                  Xe tự mang (BYOC)
                </p>
                <p className="text-sm font-bold text-slate-900">
                  {trackConfig.byoc_capacity > 0
                    ? `Tối đa ${trackConfig.byoc_capacity} xe`
                    : "Không nhận xe riêng"}
                </p>
              </div>
            </div>
          </div>

          {trackConfig.description && (
            <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                <Info className="size-3.5" />
                Mô tả loại sân
              </div>
              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                {trackConfig.description}
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
