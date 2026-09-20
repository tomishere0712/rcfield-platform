import { CalendarDays, MapPin, Search, Car } from "lucide-react"
import { useState } from "react"
import { useNavigate } from "react-router"
import { routePaths } from "@/app/router/route-paths"
import { CITY_OPTIONS } from "@/pages/customer/explore/constants"
import { quickBookingVehicleOptions } from "@/shared/data/landing-data"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select"

export function QuickBookingSearch() {
  const navigate = useNavigate()
  const [city, setCity] = useState("all")
  const [date, setDate] = useState("")
  const [vehicleType, setVehicleType] = useState("all")

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const params = new URLSearchParams()
    if (city !== "all") params.set("city", city)
    if (date) params.set("date", date)
    if (vehicleType !== "all") params.set("vehicleType", vehicleType)
    navigate(`${routePaths.cafes}${params.toString() ? `?${params.toString()}` : ""}`)
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-3xl border border-slate-200/60 bg-white/60 p-1 shadow-xl shadow-slate-200/40 backdrop-blur-md md:p-1.5">
      <div className="rounded-[1.25rem] bg-white p-5 shadow-sm md:p-6">
        <div className="mb-6 space-y-2">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-600">Đặt lịch nhanh</p>
          <h2 className="text-2xl font-black tracking-tight text-slate-950">Bạn muốn chạy ở đâu?</h2>
          <p className="text-sm font-medium leading-6 text-slate-500">Chọn tiêu chí cơ bản, hệ thống sẽ mở danh sách cơ sở phù hợp.</p>
        </div>

        <div className="grid gap-3">
          <label className="space-y-2">
            <span className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-500"><MapPin className="h-4 w-4 text-orange-500" /> Thành phố</span>
            <Select value={city} onValueChange={setCity}>
              <SelectTrigger className="h-12 rounded-xl border-slate-200 bg-slate-50/50 font-bold">
                <SelectValue placeholder="Chọn thành phố" />
              </SelectTrigger>
              <SelectContent>
                {CITY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <label className="space-y-2">
            <span className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-500"><CalendarDays className="h-4 w-4 text-orange-500" /> Ngày chơi</span>
            <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="h-12 rounded-xl border-slate-200 bg-slate-50/50 font-bold" />
          </label>

          <label className="space-y-2">
            <span className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-500"><Car className="h-4 w-4 text-orange-500" /> Loại xe</span>
            <Select value={vehicleType} onValueChange={setVehicleType}>
              <SelectTrigger className="h-12 rounded-xl border-slate-200 bg-slate-50/50 font-bold">
                <SelectValue placeholder="Chọn loại xe" />
              </SelectTrigger>
              <SelectContent>
                {quickBookingVehicleOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        </div>

        <Button type="submit" className="mt-5 h-12 w-full rounded-xl bg-orange-600 font-black text-white shadow-md shadow-orange-600/25 transition-all hover:bg-slate-950 hover:shadow-slate-900/25">
          <Search className="h-4 w-4" /> Tìm cơ sở phù hợp
        </Button>
      </div>
    </form>
  )
}
