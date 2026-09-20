import { useMemo, useState } from "react"
import { ChevronDown, ChevronUp } from "lucide-react"
import type { Vehicle } from "@/shared/data/explore-data"
import { cn } from "@/shared/lib/utils"
import { Badge } from "@/shared/ui/badge"

interface BookingVehiclePickerProps {
  vehicles: Vehicle[]
  selectedId?: string
  onSelect: (id: string) => void
}

/** Hai hàng đầy của lưới 3 cột. */
const COLLAPSED_COUNT = 6

/**
 * Chọn xe thuê — lưới 3 cột thẻ ảnh, gọn nhẹ trong luồng đặt lịch.
 *
 * Quán nhiều xe thì lưới này đẩy nút đặt lịch xuống dưới tầm mắt, nên chỉ mở
 * sẵn hai hàng.
 *
 * Ngưỡng gấp ở đây khác trang chi tiết cơ sở: bên đó là danh sách một cột nên
 * giấu một mẫu chỉ bớt đúng một dòng, không bù nổi chỗ của nút. Còn lưới 3 cột
 * thì thẻ thứ bảy tự mở ra cả một HÀNG mới cao bằng thẻ ảnh — giấu một thẻ đã
 * bớt được cả hàng đó.
 */
export function BookingVehiclePicker({ vehicles, selectedId, onSelect }: BookingVehiclePickerProps) {
  const [expanded, setExpanded] = useState(false)
  const collapsible = vehicles.length > COLLAPSED_COUNT

  const visible = useMemo(() => {
    if (expanded || !collapsible) return vehicles
    const head = vehicles.slice(0, COLLAPSED_COUNT)
    if (!selectedId || head.some((v) => v.id === selectedId)) return head
    // Xe đang chọn nằm ngoài hai hàng đầu thì kéo lên, không thì người dùng thu
    // gọn xong là mất dấu chiếc mình vừa chọn dù nó vẫn đang được tính tiền.
    const selected = vehicles.find((v) => v.id === selectedId)
    return selected ? [selected, ...head.slice(0, COLLAPSED_COUNT - 1)] : head
  }, [vehicles, expanded, collapsible, selectedId])

  if (!vehicles.length) return null

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
        Chọn xe thuê (tùy chọn)
        {collapsible && <span className="ml-1 normal-case text-slate-400">· {vehicles.length} mẫu</span>}
      </p>
      <div className="grid grid-cols-3 gap-2">
        {visible.map((v) => {
          const isSelected = selectedId === v.id
          const isUnavailable = v.status !== "available"
          return (
            <button
              key={v.id}
              type="button"
              disabled={isUnavailable}
              onClick={() => onSelect(v.id)}
              className={cn(
                "rounded-xl border p-2 text-left transition-all duration-200",
                isSelected
                  ? "border-slate-900 bg-slate-900 text-white shadow-md shadow-slate-900/15"
                  : isUnavailable
                    ? "cursor-not-allowed border-slate-100 bg-slate-50 opacity-50 rounded-xl"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm",
              )}
            >
              <div className="aspect-[4/3] overflow-hidden bg-slate-100">
                <img src={v.image} alt={v.name} className="h-full w-full object-cover" />
              </div>
              <div className="mt-1.5 space-y-0.5">
                <p className={cn("truncate text-xs font-semibold", isSelected ? "text-white" : "text-slate-900")}>
                  {v.name}
                </p>
                <p className={cn("text-[10px] font-medium", isSelected ? "text-white/70" : "text-slate-500")}>
                  {v.type} · {v.scale}
                </p>
                {isUnavailable && (
                  <Badge variant="outline" className="mt-1 border-red-200 bg-red-50 text-[10px] text-red-600">
                    Đang bận
                  </Badge>
                )}
              </div>
            </button>
          )
        })}
      </div>

      {collapsible && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-50"
        >
          {expanded ? (
            <>
              Thu gọn
              <ChevronUp className="size-3.5" />
            </>
          ) : (
            <>
              Xem thêm {vehicles.length - visible.length} mẫu xe
              <ChevronDown className="size-3.5" />
            </>
          )}
        </button>
      )}
    </div>
  )
}
