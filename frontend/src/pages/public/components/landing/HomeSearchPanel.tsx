import { useMemo, useState } from "react"
import { useNavigate } from "react-router"
import { useQuery } from "@tanstack/react-query"
import { CalendarDays, Car, Clock3, MapPin, Search, Waypoints, ArrowRight, ChevronDown } from "lucide-react"
import { motion, useReducedMotion } from "framer-motion"
import { trackTypeApi } from "@/features/cafes/api/cafe.api"
import { getCafes } from "@/features/explore/api/explore.api"
import { Button } from "@/shared/ui/button"
import { cn } from "@/shared/lib/utils"

const TIME_SLOTS = [
  "Mọi khung giờ",
  "08:00 - 10:00",
  "10:00 - 12:00",
  "12:00 - 14:00",
  "14:00 - 16:00",
  "16:00 - 18:00",
  "18:00 - 20:00",
  "20:00 - 22:00",
] as const

type FieldShellProps = {
  icon: React.ReactNode
  label: string
  hasChevron?: boolean
  children: React.ReactNode
}

export function HomeSearchPanel() {
  const navigate = useNavigate()
  const prefersReducedMotion = useReducedMotion()
  const [cafeId, setCafeId] = useState("all")
  const [trackType, setTrackType] = useState("all")
  const [date, setDate] = useState("")
  const [time, setTime] = useState("all")
  const [playMode, setPlayMode] = useState("all")

  const { data: cafes = [] } = useQuery({
    queryKey: ["landing", "search-cafes"],
    queryFn: () => getCafes({ limit: 100 }),
  })

  const { data: trackTypes = [] } = useQuery({
    queryKey: ["landing", "track-types"],
    queryFn: () => trackTypeApi.listAll(),
  })

  // Sorted list of cafe branches
  const sortedCafes = useMemo(() => {
    return [...cafes].sort((a, b) => a.name.localeCompare(b.name, "vi"))
  }, [cafes])

  // Filter cafes matching current selection
  const matchingCafes = useMemo(() => {
    if (cafeId === "all") return cafes
    return cafes.filter((c) => c.id === cafeId)
  }, [cafes, cafeId])

  // Extract available track types from matching cafes
  const availableTrackTypeCodes = useMemo(() => {
    const codeSet = new Set<string>()
    const nameSet = new Set<string>()

    matchingCafes.forEach((cafe) => {
      cafe.trackTypeIds?.forEach((id) => codeSet.add(id))
      cafe.trackTypes?.forEach((t) => {
        nameSet.add(t.toLowerCase().replace(/[^a-z0-9]/g, ""))
      })
    })

    return { codeSet, nameSet }
  }, [matchingCafes])

  // Filter track type dropdown options dynamically
  const trackTypeOptions = useMemo(() => {
    const options = [{ value: "all", label: "Tất cả loại sân" }]

    trackTypes.forEach((item) => {
      const codeMatch =
        availableTrackTypeCodes.codeSet.has(item.code) ||
        availableTrackTypeCodes.codeSet.has(item.id)
      const normalizedName = item.name.toLowerCase().replace(/[^a-z0-9]/g, "")
      const normalizedCode = item.code.toLowerCase().replace(/[^a-z0-9]/g, "")

      const nameMatch = Array.from(availableTrackTypeCodes.nameSet).some(
        (n) =>
          n.includes(normalizedName) ||
          n.includes(normalizedCode) ||
          normalizedName.includes(n),
      )

      if (cafeId === "all" || codeMatch || nameMatch) {
        options.push({ value: item.code, label: item.name })
      }
    })

    return options
  }, [trackTypes, availableTrackTypeCodes, cafeId])

  // When cafe changes, reset trackType if selected type is no longer available
  const handleCafeChange = (newCafeId: string) => {
    setCafeId(newCafeId)
    if (trackType !== "all") {
      const isStillValid = trackTypeOptions.some((opt) => opt.value === trackType)
      if (!isStillValid) {
        setTrackType("all")
      }
    }
  }

  const isSpecificCafeSelected = cafeId !== "all"
  const isBookingReady = isSpecificCafeSelected && (date !== "" || time !== "all" || playMode !== "all")

  const handleSearch = () => {
    if (isSpecificCafeSelected) {
      if (isBookingReady || date || time !== "all") {
        // Direct navigation to booking creation wizard with filled details
        const params = new URLSearchParams({ cafeId })
        if (date) params.set("date", date)
        if (time !== "all") params.set("time", time)
        if (playMode !== "all") params.set("playMode", playMode)
        navigate(`/booking/create?${params.toString()}`)
        return
      }
      // Navigate to explore with specific cafe filter
      const params = new URLSearchParams({ cafeId })
      if (trackType !== "all") params.set("trackType", trackType)
      navigate(`/cafes?${params.toString()}`)
      return
    }

    // All Cafes search
    const params = new URLSearchParams()
    if (trackType !== "all") params.set("trackType", trackType)
    if (date) params.set("date", date)
    if (time !== "all") params.set("time", time)
    if (playMode !== "all") params.set("playMode", playMode)
    navigate(`/cafes?${params.toString()}`)
  }

  return (
    <motion.div
      initial={prefersReducedMotion ? false : { opacity: 0, y: 18 }}
      whileInView={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="home-search-panel rounded-[28px] border border-white/70 bg-white/92 p-4 shadow-[var(--landing-shadow-soft)] backdrop-blur-xl xl:p-5"
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-[1.2fr_1.1fr_1fr_1fr_1.1fr_auto] items-center">
        {/* 1. Branch Selector */}
        <FieldShell icon={<MapPin className="h-3.5 w-3.5" />} label="Chi nhánh">
          <select
            value={cafeId}
            onChange={(event) => handleCafeChange(event.target.value)}
            className={fieldClassName}
          >
            <option value="all">Tất cả chi nhánh</option>
            {sortedCafes.map((cafe) => (
              <option key={cafe.id} value={cafe.id}>
                {cafe.name}
              </option>
            ))}
          </select>
        </FieldShell>

        {/* 2. Track Type Selector */}
        <FieldShell icon={<Waypoints className="h-3.5 w-3.5" />} label="Loại sân">
          <select
            value={trackType}
            onChange={(event) => setTrackType(event.target.value)}
            className={fieldClassName}
          >
            {trackTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </FieldShell>

        {/* 3. Date Picker */}
        <FieldShell icon={<CalendarDays className="h-3.5 w-3.5" />} label="Ngày chơi" hasChevron={false}>
          <input
            type="date"
            value={date}
            min={new Date().toISOString().split("T")[0]}
            onChange={(event) => setDate(event.target.value)}
            className={cn(fieldClassName, "pr-0 cursor-pointer text-slate-800")}
          />
        </FieldShell>

        {/* 4. Time Slot Picker */}
        <FieldShell icon={<Clock3 className="h-3.5 w-3.5" />} label="Khung giờ">
          <select
            value={time}
            onChange={(event) => setTime(event.target.value)}
            className={fieldClassName}
          >
            <option value="all">Mọi khung giờ</option>
            {TIME_SLOTS.filter((item) => item !== "Mọi khung giờ").map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </FieldShell>

        {/* 5. Play Mode Selector */}
        <FieldShell icon={<Car className="h-3.5 w-3.5" />} label="Hình thức">
          <select
            value={playMode}
            onChange={(event) => setPlayMode(event.target.value)}
            className={fieldClassName}
          >
            <option value="all">Tất cả hình thức</option>
            <option value="RENTAL">Thuê xe quán</option>
            <option value="BYOC">Mang xe riêng</option>
          </select>
        </FieldShell>

        {/* 6. Action Button */}
        <div className="flex items-end">
          <Button
            type="button"
            onClick={handleSearch}
            className="h-[58px] w-full rounded-2xl bg-orange-600 px-6 text-sm font-black text-white shadow-[0_18px_42px_-20px_rgba(234,88,12,0.8)] transition-all hover:bg-orange-500 hover:shadow-orange-500/30 xl:min-w-[190px]"
          >
            {isBookingReady ? (
              <>
                <ArrowRight className="mr-2 h-4 w-4 shrink-0" />
                Đặt lịch ngay
              </>
            ) : isSpecificCafeSelected ? (
              <>
                <Search className="mr-2 h-4 w-4 shrink-0" />
                Xem sân chơi
              </>
            ) : (
              <>
                <Search className="mr-2 h-4 w-4 shrink-0" />
                Khám phá sân
              </>
            )}
          </Button>
        </div>
      </div>
    </motion.div>
  )
}

function FieldShell({ icon, label, hasChevron = true, children }: FieldShellProps) {
  return (
    <label className="relative flex min-h-[58px] w-full flex-col justify-center rounded-2xl border border-slate-200/90 bg-slate-50/90 px-3.5 py-1.5 transition-all hover:bg-slate-100/80 focus-within:border-orange-500/50 focus-within:bg-white focus-within:ring-2 focus-within:ring-orange-500/20 cursor-pointer">
      <span className="mb-0.5 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-slate-400 select-none whitespace-nowrap">
        <span className="text-orange-500/90 shrink-0">{icon}</span>
        <span>{label}</span>
      </span>
      <div className="relative flex items-center w-full min-w-0">
        {children}
        {hasChevron && (
          <ChevronDown className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 shrink-0" />
        )}
      </div>
    </label>
  )
}

const fieldClassName =
  "w-full appearance-none [-webkit-appearance:none] [-moz-appearance:none] bg-none [background-image:none] border-0 bg-transparent p-0 pr-5 text-sm font-bold text-slate-900 outline-none cursor-pointer leading-tight"
