import { CalendarDays, MapPin, Search } from "lucide-react"
import { motion } from "framer-motion"
import { Button } from "@/shared/ui/button"
import { CITY_OPTIONS } from "../constants"

interface ExploreSearchBarProps {
  city: string
  onCityChange: (value: string) => void
  date: string
  onDateChange: (value: string) => void
  query: string
  onQueryChange: (value: string) => void
  /** Bấm nút tìm hoặc gõ Enter trong ô tìm kiếm. */
  onSubmit: () => void
}

export function ExploreSearchBar({
  city,
  onCityChange,
  date,
  onDateChange,
  query,
  onQueryChange,
  onSubmit,
}: ExploreSearchBarProps) {
  return (
    <motion.section
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="relative z-30 shrink-0 border-b border-slate-200/60 bg-white/80 shadow-sm backdrop-blur-xl"
    >
      {/*
        Bọc trong `form` để gõ Enter trong ô tìm kiếm cũng tìm được, không chỉ
        bấm nút. Bộ lọc vốn đã áp dụng ngay khi đổi, nên nút này không phải là
        thứ kích hoạt tìm kiếm — nó tải lại kết quả và kéo màn hình xuống chỗ
        danh sách, đúng thứ người ta mong đợi khi bấm. Trước đây nút không gắn
        `onClick` nào, bấm vào không xảy ra gì.
      */}
      <form
        onSubmit={(event) => {
          event.preventDefault()
          onSubmit()
        }}
        className="mx-auto flex w-full max-w-[1200px] flex-col gap-3 px-4 py-4 md:flex-row md:items-center md:px-6"
      >
        {/* Location */}
        <motion.div
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1, duration: 0.35 }}
          className="relative flex flex-1 items-center gap-2 rounded-xl border border-slate-200/80 bg-white px-3.5 py-2.5 transition-all duration-200 focus-within:border-orange-400 focus-within:ring-2 focus-within:ring-orange-100 focus-within:shadow-sm"
        >
          <MapPin className="h-4 w-4 shrink-0 text-orange-600" />
          <select
            value={city}
            onChange={(e) => onCityChange(e.target.value)}
            className="w-full cursor-pointer appearance-none bg-transparent text-sm font-semibold text-slate-700 outline-none"
          >
            {CITY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </motion.div>

        {/* Date */}
        <motion.div
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.15, duration: 0.35 }}
          className="relative flex items-center gap-2 rounded-xl border border-slate-200/80 bg-white px-3.5 py-2.5 transition-all duration-200 focus-within:border-orange-400 focus-within:ring-2 focus-within:ring-orange-100 focus-within:shadow-sm md:w-[200px]"
        >
          <CalendarDays className="h-4 w-4 shrink-0 text-slate-400" />
          <input
            type="date"
            value={date}
            onChange={(e) => onDateChange(e.target.value)}
            placeholder="Chọn ngày"
            className="w-full cursor-pointer bg-transparent text-sm font-semibold text-slate-700 outline-none"
          />
        </motion.div>

        {/* Search text (mobile only) */}
        <motion.div
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2, duration: 0.35 }}
          className="relative flex flex-1 items-center gap-2 rounded-xl border border-slate-200/80 bg-white px-3.5 py-2.5 transition-all duration-200 focus-within:border-orange-400 focus-within:ring-2 focus-within:ring-orange-100 focus-within:shadow-sm md:hidden"
        >
          <Search className="h-4 w-4 shrink-0 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Tìm tên cơ sở, quận, thành phố..."
            className="w-full bg-transparent text-sm font-semibold text-slate-700 outline-none placeholder:text-slate-400"
          />
        </motion.div>

        {/* Search CTA */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.25, duration: 0.3 }}
        >
          <Button
            type="submit"
            className="h-11 w-full gap-2 rounded-xl bg-orange-600 px-6 text-sm font-bold text-white shadow-md shadow-orange-600/20 transition-all duration-200 hover:bg-orange-700 hover:shadow-lg hover:shadow-orange-600/30 hover:-translate-y-0.5 active:scale-[0.98] md:w-auto"
          >
            Tìm RC Cafe
            <Search className="h-4 w-4" />
          </Button>
        </motion.div>
      </form>
    </motion.section>
  )
}
