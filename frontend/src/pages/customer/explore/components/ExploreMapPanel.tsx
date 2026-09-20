import { useEffect, useRef, useState } from "react"
import { Loader2, Navigation, X } from "lucide-react"
import type { Cafe } from "@/shared/data/explore-data"
import { haversineKm, type MapBounds, type UserLocation } from "../explore-utils"

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

const makeCafePin = (active: boolean, hovered = false) => {
  const size = active ? 48 : 36
  const iconSize = active ? 22 : 17
  const bg = active ? "#c2410c" : hovered ? "#1c1917" : "#ea580c"
  const shadow = active ? 16 : 8
  const opacity = active ? ".45" : hovered ? ".5" : ".35"

  return L.divIcon({
    className: "",
    html: `<span style="display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:50%;background:${bg};border:3px solid #fff;box-shadow:0 3px ${shadow}px rgba(0,0,0,${opacity})"><svg xmlns="http://www.w3.org/2000/svg" width="${iconSize}" height="${iconSize}" viewBox="0 0 24 24" fill="white"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg></span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -(size + 4)],
  })
}

const USER_PIN = L.divIcon({
  className: "",
  html: `<span style="display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;background:#ea580c;border:3.5px solid #fff;box-shadow:0 0 0 6px rgba(234,88,12,.22)"></span>`,
  iconSize: [26, 26],
  iconAnchor: [13, 13],
})


// Center of Đông Nam Bộ region (HCM + surrounding provinces)
const DEFAULT_CENTER: L.LatLngTuple = [10.777999482727852, 106.68177572531806]
const DEFAULT_ZOOM = 12

export function ExploreMapPanel({
  cafes,
  onSelectCafe,
  userLocation,
  onUserLocation,
  hoveredCafeId,
  onBoundsChange,
}: {
  cafes: Cafe[]
  onSelectCafe: (cafe: Cafe) => void
  userLocation: UserLocation | null
  onUserLocation: (loc: UserLocation | null) => void
  hoveredCafeId: string | null
  onBoundsChange?: (bounds: MapBounds) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markersRef = useRef<Map<string, L.Marker>>(new Map())
  const userMarkerRef = useRef<L.Marker | null>(null)
  const locationRequestedRef = useRef(false)
  const onBoundsChangeRef = useRef(onBoundsChange)
  const cafesRef = useRef(cafes)
  const [geoState, setGeoState] = useState<"idle" | "loading" | "denied">("idle")
  const [activeCafeId, setActiveCafeId] = useState<string | null>(null)

  useEffect(() => { onBoundsChangeRef.current = onBoundsChange }, [onBoundsChange])
  useEffect(() => { cafesRef.current = cafes }, [cafes])

  // Silently check geolocation permission
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
    if (!containerRef.current || mapRef.current) return
    const map = L.map(containerRef.current, {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      zoomControl: true,
      scrollWheelZoom: true,
    })
    L.tileLayer(TILE_URL, { attribution: TILE_ATTR, ...TILE_OPTIONS }).addTo(map)

    const fireBounds = () => {
      const b = map.getBounds()
      onBoundsChangeRef.current?.({
        north: b.getNorth(),
        south: b.getSouth(),
        east: b.getEast(),
        west: b.getWest(),
      })
    }
    map.on("moveend", fireBounds)

    mapRef.current = map
    setTimeout(() => { map.invalidateSize(); fireBounds() }, 0)
    return () => {
      map.off("moveend", fireBounds)
      map.remove()
      mapRef.current = null
    }
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
        onSelectCafe(cafe)
      })
      markersRef.current.set(cafe.id, marker)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cafes])

  // Update marker icons on hover / active change
  useEffect(() => {
    markersRef.current.forEach((marker, id) => {
      const isActive = id === activeCafeId
      const isHovered = !isActive && id === hoveredCafeId
      marker.setIcon(makeCafePin(isActive, isHovered))
      marker.setZIndexOffset(isActive ? 1000 : isHovered ? 500 : 0)
      if (isActive) marker.openPopup()
    })
  }, [activeCafeId, hoveredCafeId])

  // Update user marker & re-center
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    userMarkerRef.current?.remove()
    userMarkerRef.current = null
    if (!userLocation) return

    const latlng = L.latLng(userLocation.lat, userLocation.lng)
    userMarkerRef.current = L.marker(latlng, { icon: USER_PIN, zIndexOffset: 2000 })
      .addTo(map)
      .bindPopup("Vị trí của bạn", { closeButton: false })

    const nearbyPoints = cafesRef.current
      .filter((c) => c.latitude && c.longitude)
      .filter((c) => haversineKm(userLocation.lat, userLocation.lng, c.latitude!, c.longitude!) <= 150)
      .map((c) => L.latLng(c.latitude!, c.longitude!))

    if (nearbyPoints.length > 0) {
      map.fitBounds(L.latLngBounds([latlng, ...nearbyPoints]), { padding: [60, 60], maxZoom: 14 })
    } else {
      map.setView(latlng, 13)
    }
  }, [userLocation])

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
      () => {
        locationRequestedRef.current = false
        setGeoState("denied")
      },
      { timeout: 10000 },
    )
  }

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl [isolation:isolate]">
      {/* Leaflet mount point */}
      <div ref={containerRef} className="absolute inset-0" />

      {/*
        Góc trên bên phải: chỗ duy nhất còn trống trong khung 280px.
        Zoom control của Leaflet chiếm góc trên trái, nút "Toàn màn hình" ở góc
        dưới trái, dòng ghi công ở góc dưới phải.
      */}
      <div className="absolute right-3 top-3 z-[400]">
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
          <button type="button" disabled className="flex items-center gap-1.5 rounded-full border bg-background px-3 py-1.5 text-xs shadow opacity-70">
            <Loader2 className="h-3 w-3 animate-spin" /> Đang xác định...
          </button>
        ) : (
          <button
            type="button"
            onClick={handleRequestLocation}
            disabled={geoState === "denied"}
            className="flex items-center gap-1.5 rounded-full border bg-background px-3 py-1.5 text-xs font-medium shadow hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Navigation className="h-3 w-3" />
            {geoState === "denied" ? "Bị từ chối quyền" : "Dùng vị trí của tôi"}
          </button>
        )}
      </div>
    </div>
  )
}
