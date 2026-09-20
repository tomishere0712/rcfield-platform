import { useEffect, useMemo, useRef, useState } from "react"
import { ArrowLeft, ExternalLink, LayoutList, Loader2, Navigation, RouteIcon, X, ZoomOut } from "lucide-react"
import type { Cafe } from "@/shared/data/explore-data"
import { Badge } from "@/shared/ui/badge"
import { Button } from "@/shared/ui/button"
import { formatDistance, haversineKm, type UserLocation } from "../explore-utils"

import "leaflet/dist/leaflet.css"
import L from "leaflet"

const MAPTILER_KEY = ((import.meta.env.VITE_MAPTILER_KEY as string | undefined) ?? "").trim()
const TILE_URL = MAPTILER_KEY
  ? `https://api.maptiler.com/maps/openstreetmap/{z}/{x}/{y}@2x.jpg?key=${MAPTILER_KEY}`
  : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png"
const TILE_ATTR = MAPTILER_KEY
  ? '&copy; <a href="https://www.maptiler.com/copyright/" target="_blank">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
const TILE_OPTIONS = { tileSize: 512, zoomOffset: -1, maxZoom: 20 } as const

delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl
L.Icon.Default.mergeOptions({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
})

const makeCafePin = (active: boolean) => {
  const size = active ? 48 : 36
  const iconSize = active ? 22 : 17
  return L.divIcon({
    className: "",
    html: `<span style="display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:50%;background:${active ? "#c2410c" : "#ea580c"};border:${active ? "3.5px" : "3px"} solid #fff;box-shadow:0 3px ${active ? 16 : 8}px rgba(0,0,0,.${active ? 45 : 35})"><svg xmlns="http://www.w3.org/2000/svg" width="${iconSize}" height="${iconSize}" viewBox="0 0 24 24" fill="white"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg></span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -(size + 4)],
  })
}

const USER_PIN = L.divIcon({
  className: "",
  html: `<span style="display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;background:#2563eb;border:3.5px solid #fff;box-shadow:0 0 0 6px rgba(37,99,235,.22)"></span>`,
  iconSize: [26, 26],
  iconAnchor: [13, 13],
})

const DEFAULT_CENTER: L.LatLngTuple = [10.95, 106.82]
const DEFAULT_ZOOM = 9

/** Bán kính coi là "cùng một vùng" khi chọn cụm để canh khung hình ban đầu. */
const FOCUS_RADIUS_KM = 150

/**
 * Chọn cụm cơ sở để canh khung hình mở đầu.
 *
 * Fit toàn bộ kết quả nghe hợp lý nhưng hỏng ngay khi danh sách có một điểm lẻ ở
 * xa: chỉ cần một cơ sở Hà Nội là khung hình bị kéo ra tầm cả nước, các pin còn
 * lại co thành chấm. Ở đây lấy điểm trung vị (median) làm mốc — trung vị không bị
 * điểm lẻ kéo lệch như trung bình — rồi giữ những cơ sở nằm trong bán kính quanh nó.
 * Phần còn lại trả về ở `far` để giao diện mời người dùng thu nhỏ khi cần.
 */
function getInitialFocus(cafes: Cafe[]) {
  const located = cafes.filter((cafe) => cafe.latitude && cafe.longitude)
  if (located.length <= 1) return { focus: located, far: [] as Cafe[] }

  const lats = located.map((cafe) => cafe.latitude!).sort((a, b) => a - b)
  const lngs = located.map((cafe) => cafe.longitude!).sort((a, b) => a - b)
  const midLat = lats[Math.floor(lats.length / 2)]
  const midLng = lngs[Math.floor(lngs.length / 2)]

  const focus: Cafe[] = []
  const far: Cafe[] = []
  located.forEach((cafe) => {
    const distance = haversineKm(midLat, midLng, cafe.latitude!, cafe.longitude!)
    if (distance <= FOCUS_RADIUS_KM) focus.push(cafe)
    else far.push(cafe)
  })

  return { focus, far }
}

function toLatLngs(cafes: Cafe[]) {
  return cafes.map((cafe) => L.latLng(cafe.latitude!, cafe.longitude!))
}

interface RouteInfo {
  durationSec: number
  distanceM: number
}

function formatDuration(sec: number): string {
  if (sec < 60) return "< 1 phút"
  const mins = Math.round(sec / 60)
  if (mins < 60) return `${mins} phút`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h} giờ ${m} phút` : `${h} giờ`
}

function formatRouteDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`
  return `${(m / 1000).toFixed(1)} km`
}

export function ExploreMapOverlay({
  cafes,
  userLocation,
  onUserLocation,
  onSelectCafe,
  onClose,
}: {
  cafes: Cafe[]
  userLocation: UserLocation | null
  onUserLocation: (loc: UserLocation | null) => void
  onSelectCafe: (cafe: Cafe) => void
  onClose: () => void
}) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markersRef = useRef<Map<string, L.Marker>>(new Map())
  const userMarkerRef = useRef<L.Marker | null>(null)
  const routeLayerRef = useRef<L.Polyline | null>(null)
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const locationRequestedRef = useRef(false)
  const userLocationRef = useRef(userLocation)

  const [activeCafeId, setActiveCafeId] = useState<string | null>(null)
  const [geoState, setGeoState] = useState<"idle" | "loading" | "denied">("idle")
  const [showMobileList, setShowMobileList] = useState(false)
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null)
  const [routeLoading, setRouteLoading] = useState(false)

  const focusInfo = useMemo(() => getInitialFocus(cafes), [cafes])

  const sortedCafes = useMemo(() => {
    if (!userLocation) return cafes
    return [...cafes]
      .filter((c) => c.latitude && c.longitude)
      .sort(
        (a, b) =>
          haversineKm(userLocation.lat, userLocation.lng, a.latitude!, a.longitude!) -
          haversineKm(userLocation.lat, userLocation.lng, b.latitude!, b.longitude!),
      )
      .concat(cafes.filter((c) => !c.latitude || !c.longitude))
  }, [cafes, userLocation])

  // Prevent body scroll while open
  useEffect(() => {
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = "" }
  }, [])

  // Đóng bằng phím Esc — lớp phủ che kín màn hình nên phải có lối thoát bằng
  // bàn phím, không chỉ mỗi nút "Quay lại danh sách" ở góc trái.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [onClose])

  // Check permission silently
  useEffect(() => {
    if (!navigator.permissions) return
    navigator.permissions
      .query({ name: "geolocation" })
      .then((result) => {
        if (result.state === "denied") setGeoState("denied")
        result.onchange = () => setGeoState(result.state === "denied" ? "denied" : "idle")
      })
      .catch(() => {})
  }, [])

  // Init map once
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return

    const map = L.map(mapContainerRef.current, {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      zoomControl: true,
      scrollWheelZoom: true,
    })

    L.tileLayer(TILE_URL, {
      attribution: TILE_ATTR,
      ...TILE_OPTIONS,
    }).addTo(map)

    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
  }, [])

  // Rebuild cafe markers when cafes change
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    markersRef.current.forEach((m) => m.remove())
    markersRef.current.clear()

    cafes.forEach((cafe) => {
      if (!cafe.latitude || !cafe.longitude) return
      const latlng = L.latLng(cafe.latitude, cafe.longitude)

      const gmapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${cafe.latitude},${cafe.longitude}`
      const marker = L.marker(latlng, { icon: makeCafePin(false) })
        .addTo(map)
        .bindPopup(
          `<div style="min-width:180px;font-family:inherit">
            <strong style="font-size:13px">${cafe.name}</strong><br/>
            <span style="font-size:11px;color:#6b7280">${cafe.district}, ${cafe.city}</span><br/>
            <span style="font-size:12px;font-weight:600;color:#ea580c">${cafe.priceRange}</span>
            <div style="margin-top:8px">
              <a href="${gmapsUrl}" target="_blank" rel="noopener noreferrer"
                style="display:inline-flex;align-items:center;gap:5px;padding:5px 10px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;font-size:11px;font-weight:600;color:#15803d;text-decoration:none">
                <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                Google Maps
              </a>
            </div>
          </div>`,
          { closeButton: false, offset: [0, -4], minWidth: 180 },
        )

      marker.on("click", () => {
        setActiveCafeId(cafe.id)
        setTimeout(() => {
          cardRefs.current.get(cafe.id)?.scrollIntoView({ behavior: "smooth", block: "nearest" })
        }, 100)
      })

      markersRef.current.set(cafe.id, marker)
    })

    // Canh khung hình theo cụm cơ sở chính.
    //
    // Trước đây bản đồ luôn mở ở một toạ độ mặc định nên các pin nằm lọt thỏm ở
    // một góc. Đọc `userLocation` qua ref để effect này không chạy lại khi vị trí
    // đổi — canh khung theo vị trí người dùng đã có effect riêng bên dưới lo,
    // hai bên fit chồng nhau sẽ giật.
    if (userLocationRef.current) return

    const points = toLatLngs(focusInfo.focus)
    if (points.length === 0) return
    if (points.length === 1) {
      map.setView(points[0], 14)
      return
    }
    map.fitBounds(L.latLngBounds(points), { padding: [64, 64], maxZoom: 14 })
  }, [cafes, focusInfo])

  // Update active marker icon + clear route when selection changes
  useEffect(() => {
    markersRef.current.forEach((marker, id) => {
      marker.setIcon(makeCafePin(id === activeCafeId))
      marker.setZIndexOffset(id === activeCafeId ? 1000 : 0)
      if (id === activeCafeId) marker.openPopup()
    })

    // Clear previous route
    routeLayerRef.current?.remove()
    routeLayerRef.current = null
    queueMicrotask(() => {
      setRouteInfo(null)
      setRouteLoading(false)
    })
  }, [activeCafeId])

  // Update user marker
  useEffect(() => {
    userLocationRef.current = userLocation
    const map = mapRef.current
    if (!map) return

    userMarkerRef.current?.remove()
    userMarkerRef.current = null

    if (!userLocation) return

    const latlng = L.latLng(userLocation.lat, userLocation.lng)
    userMarkerRef.current = L.marker(latlng, { icon: USER_PIN, zIndexOffset: 2000 })
      .addTo(map)
      .bindPopup("Vị trí của bạn", { closeButton: false })

    const nearbyPoints = cafes
      .filter((c) => c.latitude && c.longitude)
      .filter((c) => haversineKm(userLocation.lat, userLocation.lng, c.latitude!, c.longitude!) <= 150)
      .map((c) => L.latLng(c.latitude!, c.longitude!))

    if (nearbyPoints.length > 0) {
      map.fitBounds(L.latLngBounds([latlng, ...nearbyPoints]), { padding: [60, 60], maxZoom: 14 })
    } else {
      map.setView(latlng, 13)
    }
  }, [userLocation, cafes])

  const handleSelectFromList = (cafe: Cafe) => {
    setActiveCafeId(cafe.id)
    const map = mapRef.current
    if (!map || !cafe.latitude || !cafe.longitude) return
    map.flyTo([cafe.latitude, cafe.longitude], 15, { animate: true, duration: 0.6 })
  }

  const handleRequestLocation = () => {
    if (!navigator.geolocation || locationRequestedRef.current) return
    locationRequestedRef.current = true
    setGeoState("loading")
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        locationRequestedRef.current = false
        setGeoState("idle")
        onUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude })
      },
      () => { locationRequestedRef.current = false; setGeoState("denied") },
      { timeout: 10000 },
    )
  }

  const handleFetchRoute = async (cafe: Cafe) => {
    if (!userLocation || !cafe.latitude || !cafe.longitude) return
    const map = mapRef.current
    if (!map) return

    setRouteLoading(true)
    routeLayerRef.current?.remove()
    routeLayerRef.current = null
    setRouteInfo(null)

    try {
      const url =
        `https://router.project-osrm.org/route/v1/driving/` +
        `${userLocation.lng},${userLocation.lat};${cafe.longitude},${cafe.latitude}` +
        `?overview=full&geometries=geojson`

      const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
      if (!res.ok) throw new Error("OSRM error")
      const data = await res.json() as {
        code: string
        routes?: Array<{ geometry: { coordinates: [number, number][] }; duration: number; distance: number }>
      }

      const route = data.routes?.[0]
      if (!route) throw new Error("No route")

      // OSRM returns [lng, lat], Leaflet needs [lat, lng]
      const coords: L.LatLngTuple[] = route.geometry.coordinates.map(
        ([lng, lat]) => [lat, lng],
      )

      routeLayerRef.current = L.polyline(coords, {
        color: "#2563eb",
        weight: 5,
        opacity: 0.85,
        lineCap: "round",
        lineJoin: "round",
      }).addTo(map)

      // Fit map to show the full route with both endpoints
      map.fitBounds(routeLayerRef.current.getBounds(), { padding: [50, 50] })

      setRouteInfo({ durationSec: route.duration, distanceM: route.distance })
    } catch {
      // OSRM public API may be rate-limited — fail silently
    } finally {
      setRouteLoading(false)
    }
  }

  const handleFitAll = () => {
    const map = mapRef.current
    const points = toLatLngs([...focusInfo.focus, ...focusInfo.far])
    if (!map || points.length === 0) return
    map.fitBounds(L.latLngBounds(points), { padding: [64, 64], maxZoom: 14 })
  }

  const handleClearRoute = () => {
    routeLayerRef.current?.remove()
    routeLayerRef.current = null
    setRouteInfo(null)
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Top bar */}
      <div className="flex shrink-0 items-center gap-3 border-b bg-background px-4 py-2.5 shadow-sm">
        <Button type="button" variant="ghost" size="sm" onClick={onClose} className="gap-1.5 font-medium">
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Quay lại danh sách</span>
        </Button>
        <span className="text-sm text-muted-foreground">{cafes.length} cơ sở</span>

        <div className="ml-auto flex items-center gap-2">
          {userLocation ? (
            <button
              type="button"
              onClick={() => onUserLocation(null)}
              className="flex items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-medium text-orange-700 shadow-sm hover:bg-orange-100"
            >
              <Navigation className="h-3 w-3 fill-orange-600" />
              Vị trí của bạn
              <X className="h-3 w-3" />
            </button>
          ) : geoState === "loading" ? (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang xác định...
            </span>
          ) : (
            <button
              type="button"
              onClick={handleRequestLocation}
              disabled={geoState === "denied"}
              className="flex items-center gap-1.5 rounded-full border bg-background px-3 py-1.5 text-xs font-medium shadow-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Navigation className="h-3 w-3" />
              {geoState === "denied" ? "Bị từ chối quyền" : "Dùng vị trí của tôi"}
            </button>
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowMobileList((v) => !v)}
            className="gap-1.5 lg:hidden"
          >
            <LayoutList className="h-4 w-4" />
            Danh sách
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="relative flex flex-1 overflow-hidden">
        {/* Left panel — desktop */}
        <div className="hidden w-96 shrink-0 flex-col overflow-y-auto border-r lg:flex">
          {sortedCafes.map((cafe) => {
            const dist =
              userLocation && cafe.latitude && cafe.longitude
                ? haversineKm(userLocation.lat, userLocation.lng, cafe.latitude, cafe.longitude)
                : null
            const isActive = cafe.id === activeCafeId
            const canRoute = !!userLocation && !!cafe.latitude && !!cafe.longitude

            return (
              <div
                key={cafe.id}
                ref={(el) => { if (el) cardRefs.current.set(cafe.id, el); else cardRefs.current.delete(cafe.id) }}
                className={`border-b transition-colors ${isActive ? "bg-orange-50" : "hover:bg-muted/40"}`}
              >
                {/* Card header — clickable */}
                <button
                  type="button"
                  onClick={() => handleSelectFromList(cafe)}
                  className={`flex w-full items-start gap-3 p-3 text-left ${isActive ? "border-l-2 border-l-primary" : "border-l-2 border-l-transparent"}`}
                >
                  <img src={cafe.image} alt={cafe.name} className="h-16 w-16 shrink-0 rounded-lg object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold leading-snug">{cafe.name}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{cafe.district}, {cafe.city}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1">
                      {cafe.trackTypes.slice(0, 2).map((t) => (
                        <Badge key={t} variant="secondary" className="rounded px-1.5 py-0 text-[10px]">{t}</Badge>
                      ))}
                      {dist !== null && (
                        <span className="ml-auto shrink-0 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                          {formatDistance(dist)}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm font-semibold">{cafe.priceRange}</p>
                  </div>
                </button>

                {/* Expanded actions when active */}
                {isActive && (
                  <div className="space-y-2 px-3 pb-3">
                    {/* Route info bar */}
                    {routeInfo && (
                      <div className="flex items-center gap-2 rounded-lg border border-orange-100 bg-orange-50 px-3 py-2">
                        <RouteIcon className="h-3.5 w-3.5 shrink-0 text-orange-600" />
                        <span className="flex-1 text-xs font-medium text-orange-700">
                          {formatDuration(routeInfo.durationSec)} · {formatRouteDistance(routeInfo.distanceM)} đường bộ
                        </span>
                        <button
                          type="button"
                          onClick={handleClearRoute}
                          className="shrink-0 text-orange-400 hover:text-orange-600"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex gap-2">
                      {canRoute && !routeInfo && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={routeLoading}
                          onClick={() => handleFetchRoute(cafe)}
                          className="gap-1 border-orange-200 text-xs text-orange-600 hover:bg-orange-50"
                        >
                          {routeLoading ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <RouteIcon className="h-3 w-3" />
                          )}
                          Chỉ đường
                        </Button>
                      )}
                      {cafe.latitude && cafe.longitude && (
                        <a
                          href={
                            userLocation
                              ? `https://www.google.com/maps/dir/?api=1&origin=${userLocation.lat},${userLocation.lng}&destination=${cafe.latitude},${cafe.longitude}&travelmode=driving`
                              : `https://www.google.com/maps/search/?api=1&query=${cafe.latitude},${cafe.longitude}`
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-md border border-green-200 bg-white px-2.5 py-1.5 text-xs font-medium text-green-700 hover:bg-green-50"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Google Maps
                        </a>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="flex-1 text-xs"
                        onClick={() => onSelectCafe(cafe)}
                      >
                        Xem nhanh
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        className="flex-1 text-xs"
                        onClick={() => onSelectCafe(cafe)}
                      >
                        Đặt nhanh
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Map */}
        <div className="relative flex-1">
          <div ref={mapContainerRef} className="absolute inset-0 [isolation:isolate]" />

          {/* Cụm chính đã được canh khung — mời người dùng thu nhỏ nếu còn cơ sở ở xa */}
          {focusInfo.far.length > 0 && (
            <button
              type="button"
              onClick={handleFitAll}
              className="absolute bottom-6 left-1/2 z-[500] flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full border bg-background/95 px-4 py-2 text-xs font-semibold shadow-lg backdrop-blur transition hover:bg-muted"
            >
              <ZoomOut className="h-3.5 w-3.5 text-orange-600" />
              Thu nhỏ để xem {focusInfo.far.length} cơ sở ở xa
            </button>
          )}
        </div>

        {/* Mobile bottom sheet */}
        {showMobileList && (
          <div className="absolute inset-x-0 bottom-0 z-[500] max-h-[60vh] overflow-y-auto rounded-t-2xl border-t bg-background shadow-2xl lg:hidden">
            <div className="sticky top-0 flex items-center justify-between border-b bg-background px-4 py-3">
              <span className="text-sm font-semibold">{cafes.length} cơ sở</span>
              <button type="button" onClick={() => setShowMobileList(false)}>
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>
            {sortedCafes.map((cafe) => {
              const dist =
                userLocation && cafe.latitude && cafe.longitude
                  ? haversineKm(userLocation.lat, userLocation.lng, cafe.latitude, cafe.longitude)
                  : null
              return (
                <button
                  key={cafe.id}
                  type="button"
                  onClick={() => { handleSelectFromList(cafe); setShowMobileList(false) }}
                  className="flex w-full items-center gap-3 border-b px-4 py-3 text-left hover:bg-muted"
                >
                  <img src={cafe.image} alt={cafe.name} className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{cafe.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{cafe.district}, {cafe.city}</p>
                  </div>
                  {dist !== null && (
                    <span className="shrink-0 text-xs font-medium text-emerald-700">{formatDistance(dist)}</span>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
