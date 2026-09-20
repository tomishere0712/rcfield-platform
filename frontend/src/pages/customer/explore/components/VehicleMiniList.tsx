import { Car, Clock } from "lucide-react"
import type { Vehicle } from "@/shared/data/explore-data"
import { Button } from "@/shared/ui/button"
import { formatCurrency } from "@/shared/lib/format"

export function VehicleMiniList({ cafeId, vehicles, onBookNow }: { cafeId: string; vehicles: Vehicle[]; onBookNow: (cafeId: string, vehicleId?: string) => void }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {vehicles.map((vehicle) => (
        <article key={vehicle.id} className="w-36 shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="aspect-[4/3] overflow-hidden bg-slate-200">
            <img src={vehicle.image} alt={vehicle.name} className="h-full w-full object-cover" />
          </div>
          <div className="space-y-1.5 p-2">
            <p className="truncate text-xs font-black text-slate-950">{vehicle.name}</p>
            <p className="flex items-center gap-1 text-[11px] font-bold text-slate-500"><Car className="h-3 w-3" /> {vehicle.scale}</p>
            <p className="text-[11px] font-black text-orange-600">{formatCurrency(vehicle.pricePerHour)}/h</p>
            <Button
              type="button"
              size="sm"
              disabled={vehicle.status !== "available"}
              onClick={() => onBookNow(cafeId, vehicle.id)}
              className="h-7 w-full rounded-xl bg-slate-950 text-[11px] font-black text-white hover:bg-orange-600"
            >
              {vehicle.status === "available" ? "Thuê xe" : <><Clock className="h-3 w-3" /> Bận</>}
            </Button>
          </div>
        </article>
      ))}
    </div>
  )
}
