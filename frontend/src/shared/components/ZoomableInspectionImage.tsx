import { useState, useCallback } from "react"
import { ImageOff, Minus, Plus, RefreshCw, ZoomIn } from "lucide-react"

import { cn, sanitizeImageUrl } from "@/shared/lib/utils"
import { Button } from "@/shared/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/shared/ui/dialog"

type ZoomableInspectionImageProps = {
  src: string
  alt: string
  className?: string
  buttonClassName?: string
}

const MIN_ZOOM = 1
const MAX_ZOOM = 3.5
const ZOOM_STEP = 0.5

/** High-performance Lightbox with zero-lag opening and hardware-accelerated zoom. */
export function ZoomableInspectionImage({
  src,
  alt,
  className,
  buttonClassName,
}: ZoomableInspectionImageProps) {
  const [open, setOpen] = useState(false)
  const [zoom, setZoom] = useState(MIN_ZOOM)
  const [failedSource, setFailedSource] = useState<string | null>(null)
  const imageSrc = sanitizeImageUrl(src)

  const [prevImageSrc, setPrevImageSrc] = useState(imageSrc)
  if (prevImageSrc !== imageSrc) {
    setPrevImageSrc(imageSrc)
    setFailedSource(null)
  }

  const handleOpen = useCallback(() => {
    setZoom(MIN_ZOOM)
    setOpen(true)
  }, [])

  const changeZoom = (direction: 1 | -1) => {
    setZoom((current) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current + direction * ZOOM_STEP)))
  }

  const resetZoom = () => setZoom(MIN_ZOOM)

  if (!imageSrc || failedSource === imageSrc) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={cn(
          "flex items-center justify-center overflow-hidden bg-slate-100 text-slate-400",
          buttonClassName,
          className,
        )}
      >
        <ImageOff className="size-4" aria-hidden="true" />
      </div>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className={cn(
          "group relative block w-full overflow-hidden text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ea580c] focus-visible:ring-offset-2 cursor-pointer",
          buttonClassName,
        )}
        aria-label={`Phóng to ${alt}`}
      >
        <img
          src={imageSrc}
          alt={alt}
          loading="lazy"
          onError={() => setFailedSource(imageSrc)}
          className={cn("h-full w-full object-cover", className)}
        />
        <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/30 group-focus-visible:bg-black/30">
          <span className="rounded-full bg-black/75 p-2 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 shadow-md">
            <ZoomIn className="size-4" />
          </span>
        </span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-h-[92vh] max-w-[calc(100%-2rem)] sm:max-w-4xl gap-3 overflow-hidden bg-slate-950 p-4 text-white border border-slate-800 shadow-2xl rounded-2xl z-50"
          showCloseButton
        >
          <DialogHeader className="pr-10">
            <DialogTitle className="text-sm font-extrabold text-white truncate">{alt}</DialogTitle>
            <DialogDescription className="text-xs font-medium text-slate-400">
              Dùng nút +/- để phóng to, thu nhỏ mượt mà.
            </DialogDescription>
          </DialogHeader>

          {/* Full Image Container with Smooth Scaling */}
          <div className="relative flex min-h-[320px] max-h-[68vh] items-center justify-center overflow-auto rounded-xl bg-black p-2">
            <div
              className="flex items-center justify-center w-full h-full will-change-transform transition-transform duration-200 ease-out origin-center"
              style={{
                transform: `scale(${zoom})`,
                WebkitBackfaceVisibility: "hidden",
              }}
            >
              <img
                src={imageSrc}
                alt={alt}
                onError={() => setFailedSource(imageSrc)}
                className="max-h-[60vh] max-w-full object-contain rounded-lg shadow-lg select-none"
              />
            </div>
          </div>

          {/* Control Strip */}
          <div className="flex items-center justify-center gap-3 pt-1">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={zoom <= MIN_ZOOM}
              onClick={() => changeZoom(-1)}
              className="h-8 w-8 rounded-full p-0 bg-slate-800 text-white hover:bg-slate-700 disabled:opacity-30"
              aria-label="Thu nhỏ ảnh"
            >
              <Minus className="size-4" />
            </Button>

            <span className="min-w-16 text-center text-xs font-mono font-extrabold text-orange-400 bg-slate-900 px-2.5 py-1 rounded-full border border-slate-800">
              {Math.round(zoom * 100)}%
            </span>

            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={zoom >= MAX_ZOOM}
              onClick={() => changeZoom(1)}
              className="h-8 w-8 rounded-full p-0 bg-slate-800 text-white hover:bg-slate-700 disabled:opacity-30"
              aria-label="Phóng to ảnh"
            >
              <Plus className="size-4" />
            </Button>

            {zoom > MIN_ZOOM && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={resetZoom}
                className="h-8 px-2 text-xs font-bold text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg gap-1"
              >
                <RefreshCw className="size-3" />
                Đặt lại
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
