import { useState } from "react"
import { useNavigate } from "react-router"
import { useQuery } from "@tanstack/react-query"
import { MapPin, Calendar, Clock, Compass, ChevronDown, Check } from "lucide-react"
import { trackTypeApi } from "@/features/cafes/api/cafe.api"
import { motion, AnimatePresence } from "framer-motion"

const CITIES = [
  { value: "all", label: "Tất cả địa điểm" },
  { value: "TP. Hồ Chí Minh", label: "TP. Hồ Chí Minh" },
  { value: "Hà Nội", label: "Hà Nội" },
  { value: "Đà Nẵng", label: "Đà Nẵng" },
]

const TIME_SLOTS = [
  { value: "all", label: "Mọi khung giờ" },
  { value: "08:00 - 10:00", label: "08:00 - 10:00" },
  { value: "10:00 - 12:00", label: "10:00 - 12:00" },
  { value: "12:00 - 14:00", label: "12:00 - 14:00" },
  { value: "14:00 - 16:00", label: "14:00 - 16:00" },
  { value: "16:00 - 18:00", label: "16:00 - 18:00" },
  { value: "18:00 - 20:00", label: "18:00 - 20:00" },
  { value: "20:00 - 22:00", label: "20:00 - 22:00" },
]

export function QuickSearchPanel() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<"explore" | "booking">("explore")
  
  // Form State
  const [location, setLocation] = useState("all")
  const [trackType, setTrackType] = useState("all")
  const [date, setDate] = useState("")
  const [time, setTime] = useState("all")

  // Dropdown Open States
  const [openDropdown, setOpenDropdown] = useState<"location" | "trackType" | "time" | null>(null)

  // Fetch Track Types from Backend
  const { data: trackTypes = [] } = useQuery({
    queryKey: ["track-types"],
    queryFn: () => trackTypeApi.listAll(),
  })

  const handleSearch = () => {
    const params = new URLSearchParams()
    if (location !== "all") params.append("city", location)
    if (trackType !== "all") params.append("trackType", trackType)
    if (date) params.append("date", date)
    if (time !== "all") params.append("time", time)
    if (activeTab === "booking") params.append("bookingMode", "true")

    navigate(`/cafes?${params.toString()}`)
  }

  const toggleDropdown = (field: "location" | "trackType" | "time") => {
    setOpenDropdown(openDropdown === field ? null : field)
  }

  const closeAllDropdowns = () => setOpenDropdown(null)

  return (
    <div className="w-full max-w-4xl relative z-30" onMouseLeave={closeAllDropdowns}>
      {/* TABS */}
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={() => {
            setActiveTab("explore")
            closeAllDropdowns()
          }}
          className={`relative rounded-t-xl px-5 py-2.5 text-sm font-bold transition-all duration-300 ${
            activeTab === "explore"
              ? "text-white bg-white/10 backdrop-blur-md border-t border-x border-white/20"
              : "text-slate-400 hover:text-white"
          }`}
        >
          Khám phá sân
          {activeTab === "explore" && (
            <motion.div
              layoutId="activeTabGlow"
              className="absolute -bottom-[2px] left-0 right-0 h-[2px] bg-orange-500"
            />
          )}
        </button>
        <button
          onClick={() => {
            setActiveTab("booking")
            closeAllDropdowns()
          }}
          className={`relative rounded-t-xl px-5 py-2.5 text-sm font-bold transition-all duration-300 ${
            activeTab === "booking"
              ? "text-white bg-white/10 backdrop-blur-md border-t border-x border-white/20"
              : "text-slate-400 hover:text-white"
          }`}
        >
          Đặt lịch sân chơi
          {activeTab === "booking" && (
            <motion.div
              layoutId="activeTabGlow"
              className="absolute -bottom-[2px] left-0 right-0 h-[2px] bg-orange-500"
            />
          )}
        </button>
      </div>

      {/* QUICK SEARCH PANEL */}
      <div className="rounded-2xl border border-white/15 bg-white/10 p-2.5 shadow-2xl backdrop-blur-xl md:rounded-3xl grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
        
        {/* 1. Location Selector */}
        <div className="relative md:col-span-3">
          <button
            type="button"
            onClick={() => toggleDropdown("location")}
            className="flex h-12 w-full items-center justify-between rounded-xl bg-white px-4 text-left shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <MapPin className="h-4.5 w-4.5 text-slate-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-3xs font-extrabold uppercase tracking-wider text-slate-400 leading-none">Vị trí</p>
                <p className="text-sm font-bold text-slate-800 truncate mt-0.5">
                  {CITIES.find((c) => c.value === location)?.label || "Tất cả địa điểm"}
                </p>
              </div>
            </div>
            <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
          </button>
          
          <AnimatePresence>
            {openDropdown === "location" && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="absolute left-0 right-0 mt-1.5 max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl z-50"
              >
                {CITIES.map((city) => (
                  <button
                    key={city.value}
                    type="button"
                    onClick={() => {
                      setLocation(city.value)
                      closeAllDropdowns()
                    }}
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-semibold transition hover:bg-slate-50 ${
                      location === city.value ? "text-orange-600 bg-orange-50/50" : "text-slate-700"
                    }`}
                  >
                    {city.label}
                    {location === city.value && <Check className="h-4 w-4 text-orange-600" />}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* 2. Track Type Selector */}
        <div className="relative md:col-span-3">
          <button
            type="button"
            onClick={() => toggleDropdown("trackType")}
            className="flex h-12 w-full items-center justify-between rounded-xl bg-white px-4 text-left shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <Compass className="h-4.5 w-4.5 text-slate-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-3xs font-extrabold uppercase tracking-wider text-slate-400 leading-none">Loại sân</p>
                <p className="text-sm font-bold text-slate-800 truncate mt-0.5">
                  {trackType === "all" ? "Tất cả loại sân" : trackTypes.find((t) => t.code === trackType)?.name || trackType}
                </p>
              </div>
            </div>
            <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
          </button>

          <AnimatePresence>
            {openDropdown === "trackType" && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="absolute left-0 right-0 mt-1.5 max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl z-50"
              >
                <button
                  type="button"
                  onClick={() => {
                    setTrackType("all")
                    closeAllDropdowns()
                  }}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-semibold transition hover:bg-slate-50 ${
                    trackType === "all" ? "text-orange-600 bg-orange-50/50" : "text-slate-700"
                  }`}
                >
                  Tất cả loại sân
                  {trackType === "all" && <Check className="h-4 w-4 text-orange-600" />}
                </button>
                {trackTypes.map((type) => (
                  <button
                    key={type.code}
                    type="button"
                    onClick={() => {
                      setTrackType(type.code)
                      closeAllDropdowns()
                    }}
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-semibold transition hover:bg-slate-50 ${
                      trackType === type.code ? "text-orange-600 bg-orange-50/50" : "text-slate-700"
                    }`}
                  >
                    {type.name}
                    {trackType === type.code && <Check className="h-4 w-4 text-orange-600" />}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* 3. Date Picker */}
        <div className="relative md:col-span-2">
          <div className="flex h-12 w-full items-center justify-between rounded-xl bg-white px-4 text-left shadow-sm">
            <div className="flex items-center gap-2.5 min-w-0 w-full">
              <Calendar className="h-4.5 w-4.5 text-slate-400 shrink-0" />
              <div className="min-w-0 w-full">
                <p className="text-3xs font-extrabold uppercase tracking-wider text-slate-400 leading-none">Ngày chơi</p>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  min={new Date().toISOString().split("T")[0]}
                  className="text-sm font-bold text-slate-800 bg-transparent w-full border-none p-0 focus:outline-none focus:ring-0 mt-0.5 leading-none h-auto shrink-0 select-none [&::-webkit-calendar-picker-indicator]:opacity-40 [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                />
              </div>
            </div>
          </div>
        </div>

        {/* 4. Time Slot Picker */}
        <div className="relative md:col-span-2">
          <button
            type="button"
            onClick={() => toggleDropdown("time")}
            className="flex h-12 w-full items-center justify-between rounded-xl bg-white px-4 text-left shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <Clock className="h-4.5 w-4.5 text-slate-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-3xs font-extrabold uppercase tracking-wider text-slate-400 leading-none">Khung giờ</p>
                <p className="text-sm font-bold text-slate-800 truncate mt-0.5">
                  {TIME_SLOTS.find((t) => t.value === time)?.label || "Mọi khung giờ"}
                </p>
              </div>
            </div>
            <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
          </button>

          <AnimatePresence>
            {openDropdown === "time" && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="absolute left-0 right-0 mt-1.5 max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl z-50"
              >
                {TIME_SLOTS.map((slot) => (
                  <button
                    key={slot.value}
                    type="button"
                    onClick={() => {
                      setTime(slot.value)
                      closeAllDropdowns()
                    }}
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-semibold transition hover:bg-slate-50 ${
                      time === slot.value ? "text-orange-600 bg-orange-50/50" : "text-slate-700"
                    }`}
                  >
                    {slot.label}
                    {time === slot.value && <Check className="h-4 w-4 text-orange-600" />}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* 5. Search Action Button */}
        <div className="md:col-span-2 w-full md:w-auto h-full flex items-center">
          <button
            type="button"
            onClick={handleSearch}
            className="flex h-12 w-full items-center justify-center gap-1.5 rounded-xl bg-orange-600 px-4 font-bold text-white shadow-lg shadow-orange-600/30 transition hover:bg-orange-500 active:scale-[0.98] focus:outline-none"
          >
            {activeTab === "explore" ? "Khám phá sân RC" : "Đặt lịch ngay"}
          </button>
        </div>

      </div>
    </div>
  )
}
