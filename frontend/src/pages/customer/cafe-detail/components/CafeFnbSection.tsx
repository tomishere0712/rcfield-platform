import { useMemo } from "react"
import { Coffee, Minus, Plus } from "lucide-react"
import { UNCATEGORIZED_LABEL, type MenuItem } from "@/features/menu/types"
import { formatCurrency } from "@/shared/lib/format"
import { cn } from "@/shared/lib/utils"

import { CafeSection, SectionNote } from "./SectionShell"

type CafeFnbSectionProps = {
  menuItems: MenuItem[]
  isLoading?: boolean
  isError?: boolean
  fnbQuantities: Record<string, number>
  onChangeFnb: (quantities: Record<string, number>) => void
}

/**
 * Gom món theo danh mục, giữ nguyên thứ tự API trả về (đã sắp theo display_order
 * của danh mục, nhóm "Chưa phân loại" xếp cuối).
 *
 * ⚠️ Nhóm rỗng được loại bỏ tự nhiên vì chỉ sinh ra từ chính danh sách món đã lọc —
 * KHÔNG dùng `itemCount` của endpoint danh mục, vì trường đó đếm cả món tạm ngưng
 * bán nên danh mục toàn món ẩn vẫn có itemCount > 0 mà vẫn phải giấu khỏi khách.
 */
function groupByCategory(menuItems: MenuItem[]): Array<{ label: string; items: MenuItem[] }> {
  const groups: Array<{ label: string; items: MenuItem[] }> = []
  const indexByLabel = new Map<string, number>()

  for (const item of menuItems) {
    const label = item.categoryName ?? UNCATEGORIZED_LABEL
    const existing = indexByLabel.get(label)
    if (existing === undefined) {
      indexByLabel.set(label, groups.length)
      groups.push({ label, items: [item] })
    } else {
      groups[existing].items.push(item)
    }
  }

  return groups
}

/**
 * Menu đặt trước dạng hàng ngang, nhóm theo danh mục.
 *
 * Bản cũ là lưới thẻ ảnh 5:3: món không có ảnh thì phần lớn diện tích thẻ là một
 * cái cốc xám, tên danh mục lặp lại trên từng thẻ dù ngay trên đã có tiêu đề nhóm,
 * và nhãn "Có sẵn" luôn đúng vì trang chỉ tải món đang bán. Hàng ngang bỏ hết
 * những thứ đó và cho thấy gấp ba số món trên cùng một chiều cao.
 */
export function CafeFnbSection({ menuItems, isLoading = false, isError = false, fnbQuantities, onChangeFnb }: CafeFnbSectionProps) {
  const groups = useMemo(() => groupByCategory(menuItems), [menuItems])

  const selectedCount = useMemo(
    () => Object.values(fnbQuantities).reduce((sum, qty) => sum + qty, 0),
    [fnbQuantities],
  )

  const handleIncrement = (id: string) => {
    const current = fnbQuantities[id] ?? 0
    onChangeFnb({ ...fnbQuantities, [id]: current + 1 })
  }

  const handleDecrement = (id: string) => {
    const current = fnbQuantities[id] ?? 0
    if (current <= 1) {
      const copy = { ...fnbQuantities }
      delete copy[id]
      onChangeFnb(copy)
    } else {
      onChangeFnb({ ...fnbQuantities, [id]: current - 1 })
    }
  }

  return (
    <CafeSection
      title="Đặt trước đồ ăn & thức uống"
      lead="Chọn trước để quán chuẩn bị sẵn, tới nơi là có ngay — thanh toán chung một lần với tiền sân."
      action={
        selectedCount > 0 ? (
          <span className="rounded-full bg-orange-50 px-3 py-1.5 text-sm font-bold text-orange-700">
            Đã chọn {selectedCount} món
          </span>
        ) : null
      }
    >
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-20 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      ) : isError ? (
        <SectionNote>Không tải được menu đồ ăn từ máy chủ.</SectionNote>
      ) : menuItems.length === 0 ? (
        <SectionNote>Cơ sở này chưa mở bán đồ ăn hoặc thức uống.</SectionNote>
      ) : (
        <div className="space-y-8">
          {groups.map((group) => (
            <div key={group.label}>
              <h3 className="text-sm font-black uppercase tracking-[0.14em] text-slate-400">
                {group.label}
              </h3>
              <ul className="mt-3 divide-y divide-slate-200 border-y border-slate-200">
                {group.items.map((item) => {
                  const quantity = fnbQuantities[item.id] ?? 0
                  const hasSelected = quantity > 0

                  return (
                    <li
                      key={item.id}
                      className={cn(
                        "flex items-center gap-4 py-3.5 transition-colors",
                        hasSelected && "bg-orange-50/50",
                      )}
                    >
                      <span className="size-16 shrink-0 overflow-hidden rounded-xl bg-slate-100">
                        {item.imageUrl ? (
                          <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <span className="grid h-full place-items-center text-slate-300">
                            <Coffee className="size-5" />
                          </span>
                        )}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="block text-base font-bold text-slate-950">{item.name}</span>
                        {item.description && (
                          <span className="mt-0.5 line-clamp-1 block text-sm text-slate-500">
                            {item.description}
                          </span>
                        )}
                      </span>

                      <span className="shrink-0 text-base font-black text-slate-950">
                        {formatCurrency(Number(item.price))}
                      </span>

                      {hasSelected ? (
                        <span className="flex shrink-0 items-center gap-1 rounded-full border border-orange-200 bg-white p-1">
                          <button
                            type="button"
                            aria-label={`Bớt một ${item.name}`}
                            onClick={() => handleDecrement(item.id)}
                            className="grid size-8 place-items-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                          >
                            <Minus className="size-4" />
                          </button>
                          <span className="min-w-6 text-center text-sm font-black tabular-nums text-slate-950">
                            {quantity}
                          </span>
                          <button
                            type="button"
                            aria-label={`Thêm một ${item.name}`}
                            onClick={() => handleIncrement(item.id)}
                            className="grid size-8 place-items-center rounded-full text-orange-600 transition hover:bg-orange-50"
                          >
                            <Plus className="size-4" />
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleIncrement(item.id)}
                          className="shrink-0 rounded-full border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 transition hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700"
                        >
                          Thêm
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </CafeSection>
  )
}
