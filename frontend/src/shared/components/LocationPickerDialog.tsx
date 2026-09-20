import { useEffect, useRef, useState } from "react"
import L from "leaflet"
import type { Map, Marker } from "leaflet"
import "leaflet/dist/leaflet.css"
import { Loader2, MapPin, Navigation } from "lucide-react"

import { Button } from "@/shared/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog"

// Leaflet resolves icon URLs via _getIconUrl which breaks in Vite.
// Deleting it forces mergeOptions to take effect.
function fixLeafletIcons(L: typeof import("leaflet")) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (L.Icon.Default.prototype as any)._getIconUrl

  L.Icon.Default.mergeOptions({
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  })
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialLat?: number | null
  initialLng?: number | null
  onConfirm: (lat: number, lng: number) => void
}

const MAPTILER_KEY = ((import.meta.env.VITE_MAPTILER_KEY as string | undefined) ?? "").trim()
const TILE_URL = MAPTILER_KEY
  ? `https://api.maptiler.com/maps/openstreetmap/{z}/{x}/{y}@2x.jpg?key=${MAPTILER_KEY}`
  : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png"
const TILE_ATTR = MAPTILER_KEY
  ? '&copy; <a href="https://www.maptiler.com/copyright/" target="_blank">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
const TILE_OPTIONS = { tileSize: 512, zoomOffset: -1, maxZoom: 20 } as const

const DEFAULT_CENTER: [number, number] = [10.7769, 106.7009] // Ho Chi Minh City
const DEFAULT_ZOOM = 13

export function LocationPickerDialog({ open, onOpenChange, initialLat, initialLng, onConfirm }: Props) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<Map | null>(null)
  const markerRef = useRef<Marker | null>(null)
  const [selected, setSelected] = useState<{ lat: number; lng: number } | null>(
    initialLat != null && initialLng != null ? { lat: initialLat, lng: initialLng } : null
  )
  const [locating, setLocating] = useState(false)
  const [locateError, setLocateError] = useState<string | null>(null)

  // Sync selected when props change while dialog is closed
  useEffect(() => {
    if (!open) {
      queueMicrotask(() => setSelected(initialLat != null && initialLng != null ? { lat: initialLat, lng: initialLng } : null))
    }
  }, [open, initialLat, initialLng])

  useEffect(() => {
    if (!open) {
      // Cleanup map when dialog closes
      mapInstanceRef.current?.remove()
      mapInstanceRef.current = null
      markerRef.current = null
      return
    }

    let resizeObserver: ResizeObserver | null = null

    // Wait for dialog animation + DOM to settle
    const timer = setTimeout(() => {
      if (!mapRef.current || mapInstanceRef.current) return

      fixLeafletIcons(L)

      const center: [number, number] =
        initialLat != null && initialLng != null
          ? [initialLat, initialLng]
          : DEFAULT_CENTER

      const map = L.map(mapRef.current, { zoomControl: true }).setView(center, DEFAULT_ZOOM)
      mapInstanceRef.current = map

      L.tileLayer(TILE_URL, {
        attribution: TILE_ATTR,
        ...TILE_OPTIONS,
      }).addTo(map)

      // Force map layout recalculation to prevent gray background
      map.invalidateSize()

      // Track size changes (especially during dialog open transitions)
      resizeObserver = new ResizeObserver(() => {
        map.invalidateSize()
      })
      resizeObserver.observe(mapRef.current)

      // Place initial marker if coordinates exist
      if (initialLat != null && initialLng != null) {
        const marker = L.marker([initialLat, initialLng], { draggable: true }).addTo(map)
        markerRef.current = marker
        marker.on("dragend", () => {
          const pos = marker.getLatLng()
          setSelected({ lat: pos.lat, lng: pos.lng })
        })
      }

      map.on("click", (e) => {
        const { lat, lng } = e.latlng
        setSelected({ lat, lng })

        if (markerRef.current) {
          markerRef.current.setLatLng([lat, lng])
        } else {
          const marker = L.marker([lat, lng], { draggable: true }).addTo(map)
          markerRef.current = marker
          marker.on("dragend", () => {
            const pos = marker.getLatLng()
            setSelected({ lat: pos.lat, lng: pos.lng })
          })
        }
      })
    }, 150)

    return () => {
      clearTimeout(timer)
      if (resizeObserver) {
        resizeObserver.disconnect()
      }
    }
  }, [open, initialLat, initialLng])

  const placeMarker = (lat: number, lng: number) => {
    const map = mapInstanceRef.current
    if (!map) return
    setSelected({ lat, lng })
    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lng])
    } else {
      const marker = L.marker([lat, lng], { draggable: true }).addTo(map)
      markerRef.current = marker
      marker.on("dragend", () => {
        const pos = marker.getLatLng()
        setSelected({ lat: pos.lat, lng: pos.lng })
      })
    }
    map.flyTo([lat, lng], Math.max(map.getZoom(), 15), { animate: true, duration: 0.8 })
  }

  const handleLocate = () => {
    if (!navigator.geolocation) {
      setLocateError("Trình duyệt không hỗ trợ định vị.")
      return
    }
    setLocating(true)
    setLocateError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false)
        placeMarker(pos.coords.latitude, pos.coords.longitude)
      },
      () => {
        setLocating(false)
        setLocateError("Không lấy được vị trí. Kiểm tra quyền truy cập vị trí.")
      },
      { timeout: 10_000, enableHighAccuracy: true }
    )
  }

  const handleConfirm = () => {
    if (!selected) return
    onConfirm(selected.lat, selected.lng)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-full max-w-[calc(100%-2rem)] flex-col gap-0 p-0 sm:max-w-4xl">
        <DialogHeader className="border-b border-[#e5e2e1] px-5 py-4">
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="size-4 text-orange-600" />
            Chọn vị trí trên bản đồ
          </DialogTitle>
        </DialogHeader>

        <div className="relative flex-1">
          <div ref={mapRef} className="h-[580px] w-full" />

          {/* My location button — floats top-right over the map */}
          <button
            type="button"
            onClick={handleLocate}
            disabled={locating}
            title="Vị trí của tôi"
            className="absolute right-3 top-3 z-[1000] flex h-9 w-9 items-center justify-center rounded-lg border border-[#c4c7c8] bg-white shadow-md transition hover:bg-orange-50 disabled:opacity-60"
          >
            {locating
              ? <Loader2 className="size-4 animate-spin text-orange-600" />
              : <Navigation className="size-4 text-orange-600" />}
          </button>

          {selected && (
            <div className="absolute bottom-3 left-1/2 z-[1000] -translate-x-1/2 rounded-lg border border-[#e5e2e1] bg-white px-3 py-1.5 text-xs font-semibold text-[#444748] shadow-md">
              {selected.lat.toFixed(7)}, {selected.lng.toFixed(7)}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-[#e5e2e1] px-5 py-4">
          <p className="text-sm font-medium text-[#747878]">
            {locateError
              ? <span className="text-red-600">{locateError}</span>
              : selected
                ? "Kéo ghim hoặc click để thay đổi vị trí."
                : "Click vào bản đồ để chọn vị trí."}
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Hủy
            </Button>
            <Button
              type="button"
              disabled={!selected}
              onClick={handleConfirm}
              className="bg-orange-600 text-white hover:bg-orange-700"
            >
              Xác nhận vị trí
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
