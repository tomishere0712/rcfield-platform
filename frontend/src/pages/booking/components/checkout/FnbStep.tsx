import { useMemo } from "react"
import {
  Check,
  Clock3,
  Flame,
  Minus,
  Plus,
  Sparkles,
  UtensilsCrossed,
} from "lucide-react"
import type { MenuItem, PopularMenuItem } from "@/features/menu/types"
import { fnbSelectionKey, UNCATEGORIZED_LABEL } from "@/features/menu/types"
import { Badge } from "@/shared/ui/badge"
import { Button } from "@/shared/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card"
import { Input } from "@/shared/ui/input"
import { formatCurrency } from "@/shared/lib/format"
import { cn } from "@/shared/lib/utils"

type FnbStepProps = {
  menuItems: MenuItem[]
  popularItems?: PopularMenuItem[]
  isLoading?: boolean
  quantities: Record<string, number>
  notes: Record<string, string>
  onQuantityChange: (
    itemId: string,
    variantId: string | undefined,
    quantity: number,
  ) => void
  onNoteChange: (selectionKey: string, note: string) => void
}

function toPrice(value: MenuItem["price"]): number {
  return typeof value === "string" ? parseFloat(value) : value
}

/**
 * Số tiền tiết kiệm khi mua combo so với mua lẻ từng món thành phần.
 * Tính từ giá thật của các món trong cùng menu — trả null nếu thiếu giá của
 * bất kỳ thành phần nào, để không bao giờ hiện con số phỏng đoán.
 */
function comboSaving(
  combo: MenuItem,
  priceById: Map<string, number>,
): number | null {
  if (!combo.isCombo || !combo.components?.length) return null

  let sum = 0
  for (const component of combo.components) {
    const price =
      component.variantPrice === null || component.variantPrice === undefined
        ? priceById.get(component.itemId)
        : toPrice(component.variantPrice)
    if (price === undefined) return null
    sum += price * component.quantity
  }

  const saving = sum - toPrice(combo.price)
  return saving > 0 ? saving : null
}

export function FnbStep({
  menuItems,
  popularItems = [],
  isLoading,
  quantities,
  notes,
  onQuantityChange,
  onNoteChange,
}: FnbStepProps) {
  const availableItems = useMemo(
    () => menuItems.filter((item) => item.isAvailable),
    [menuItems],
  )

  // Giá của MỌI món (kể cả món tạm ẩn) để tính đúng giá trị combo
  const priceById = useMemo(
    () => new Map(menuItems.map((item) => [item.id, toPrice(item.price)])),
    [menuItems],
  )

  const orderCountById = useMemo(
    () => new Map(popularItems.map((p) => [p.menuItemId, p.orderCount])),
    [popularItems],
  )

  // Chỉ giữ món phổ biến còn đang bán — backend đã lọc ngưỡng tối thiểu
  const highlighted = useMemo(
    () =>
      popularItems
        .map((p) => availableItems.find((item) => item.id === p.menuItemId))
        .filter((item): item is MenuItem => Boolean(item)),
    [popularItems, availableItems],
  )
  const highlightedIds = useMemo(
    () => new Set(highlighted.map((i) => i.id)),
    [highlighted],
  )

  const restGroups = useMemo(() => {
    const groups: Array<{ label: string; items: MenuItem[] }> = []
    const indexByLabel = new Map<string, number>()

    for (const item of availableItems) {
      if (highlightedIds.has(item.id)) continue
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
  }, [availableItems, highlightedIds])

  const renderCard = (item: MenuItem, rank?: number) => (
    <FnbCard
      key={item.id}
      item={item}
      quantities={quantities}
      notes={notes}
      onQuantityChange={(variantId, quantity) =>
        onQuantityChange(item.id, variantId, quantity)
      }
      onNoteChange={onNoteChange}
      saving={comboSaving(item, priceById)}
      orderCount={orderCountById.get(item.id)}
      isTopSeller={rank === 0}
    />
  )

  return (
    <Card className="rounded-xl shadow-sm">
      <CardHeader className="space-y-3">
        <div>
          <CardTitle>Gọi món trước, đến là có ngay</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Quán chuẩn bị sẵn theo giờ bạn đặt, khỏi mất thời gian chờ giữa buổi
            chơi.
          </p>
        </div>

        <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Clock3 className="h-3.5 w-3.5 text-orange-500" />
            Đồ có sẵn khi bạn tới sân
          </span>
          <span className="flex items-center gap-1.5">
            <Check className="h-3.5 w-3.5 text-orange-500" />
            Thanh toán chung một lần với phí sân
          </span>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {isLoading ? (
          <div className="grid gap-3 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-32 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        ) : availableItems.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-10 text-center">
            <UtensilsCrossed className="h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm font-medium text-muted-foreground">
              Cơ sở chưa có menu F&B
            </p>
            <p className="text-xs text-muted-foreground">
              Bạn có thể gọi trực tiếp tại quán khi đến.
            </p>
          </div>
        ) : (
          <>
            {highlighted.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <Flame className="h-4 w-4 text-orange-500" />
                  <h3 className="text-sm font-bold">Khách ở đây hay gọi</h3>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {highlighted.map((item, index) => renderCard(item, index))}
                </div>
              </section>
            )}

            {restGroups.map((group) => (
              <section key={group.label} className="space-y-3">
                <h3 className="text-sm font-bold">{group.label}</h3>
                <div className="grid gap-3 md:grid-cols-2">
                  {group.items.map((item) => renderCard(item))}
                </div>
              </section>
            ))}
          </>
        )}

        {availableItems.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Không bắt buộc — bạn vẫn có thể gọi thêm tại quán, nhưng sẽ phải chờ
            pha chế.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * Ô ghi chú cho một lựa chọn đã thêm vào đơn.
 *
 * Trước đây ghi chú nằm ở khối "Món đã chọn" cuối trang. Bỏ khối đó vì mọi thứ
 * còn lại của nó — số lượng, thành tiền, chọn biến thể, xoá — đều đã làm được
 * ngay trên thẻ món. Riêng ghi chú thì không, nên nó dọn về đây thay vì biến
 * mất: khách gõ "ít đá" ngay dưới đúng món vừa thêm.
 */
function NoteInput({
  selectionKey,
  label,
  notes,
  onNoteChange,
}: {
  selectionKey: string
  label: string
  notes: Record<string, string>
  onNoteChange: (selectionKey: string, note: string) => void
}) {
  return (
    <Input
      value={notes[selectionKey] ?? ""}
      maxLength={500}
      onChange={(event) => onNoteChange(selectionKey, event.target.value)}
      placeholder="Ghi chú (ví dụ: ít đá, không hành)"
      aria-label={`Ghi chú cho ${label}`}
      className="mt-2 h-8 rounded-md border-orange-200 bg-orange-50/40 text-xs placeholder:text-slate-400"
    />
  )
}

function FnbCard({
  item,
  quantities,
  notes,
  onQuantityChange,
  onNoteChange,
  saving,
  orderCount,
  isTopSeller,
}: {
  item: MenuItem
  quantities: Record<string, number>
  notes: Record<string, string>
  onQuantityChange: (variantId: string | undefined, quantity: number) => void
  onNoteChange: (selectionKey: string, note: string) => void
  saving: number | null
  orderCount?: number
  isTopSeller?: boolean
}) {
  const price = toPrice(item.price)
  const variants = (item.variants ?? []).filter(
    (variant) => variant.isAvailable,
  )
  const fixedQuantity = quantities[item.id] ?? 0
  const selectedCount = variants.length
    ? variants.reduce(
        (sum, variant) =>
          sum + (quantities[fnbSelectionKey(item.id, variant.id)] ?? 0),
        0,
      )
    : fixedQuantity
  const isSelected = selectedCount > 0

  return (
    <div
      className={cn(
        "grid grid-cols-[104px_1fr] overflow-hidden rounded-xl border bg-background transition-colors duration-200",
        isSelected && "border-orange-400 bg-orange-50/40",
      )}
    >
      <div className="relative">
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt={item.name}
            className="h-full min-h-32 w-full object-cover"
          />
        ) : (
          <div className="flex h-full min-h-32 w-full items-center justify-center bg-muted">
            <UtensilsCrossed className="h-6 w-6 text-muted-foreground/40" />
          </div>
        )}
        {isSelected && (
          <span className="absolute left-1.5 top-1.5 rounded-full bg-orange-500 px-2 py-0.5 text-[10px] font-bold text-white shadow">
            {selectedCount}
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-col justify-between gap-2 p-3">
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="line-clamp-1 text-sm font-semibold">{item.name}</p>
            {item.categoryName ? (
              <Badge
                variant="secondary"
                className={cn(
                  "shrink-0",
                  item.isCombo &&
                    "bg-orange-100 text-orange-700 hover:bg-orange-100",
                )}
              >
                {item.categoryName}
              </Badge>
            ) : item.isCombo ? (
              <Badge className="shrink-0 bg-orange-100 text-orange-700 hover:bg-orange-100">
                Combo
              </Badge>
            ) : null}
          </div>

          {item.isCombo && item.components && item.components.length > 0 && (
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
              {item.components
                .map(
                  (c) => `${c.quantity > 1 ? `${c.quantity}× ` : ""}${c.name}`,
                )
                .join(" + ")}
            </p>
          )}

          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-sm font-semibold">
              {variants.length
                ? `Từ ${formatCurrency(Math.min(...variants.map((variant) => toPrice(variant.price))))}`
                : formatCurrency(price)}
            </p>
            {saving !== null && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                <Sparkles className="h-3 w-3" />
                Rẻ hơn {formatCurrency(saving)} so với gọi lẻ
              </span>
            )}
          </div>

          {/* Số liệu thật từ đơn đã phát sinh — không hiện gì nếu backend không trả về */}
          {orderCount !== undefined && (
            <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
              <Flame className="h-3 w-3 text-orange-500" />
              {isTopSeller ? "Được gọi nhiều nhất · " : ""}
              {orderCount} lượt đặt gần đây
            </p>
          )}
        </div>

        {variants.length ? (
          <div className="space-y-1.5">
            {variants.map((variant) => {
              const key = fnbSelectionKey(item.id, variant.id)
              const quantity = quantities[key] ?? 0
              return (
                <div key={variant.id}>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-medium text-muted-foreground">
                      {variant.name} · {formatCurrency(toPrice(variant.price))}
                    </span>
                    {quantity > 0 ? (
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          className="h-7 w-7 rounded-md"
                          onClick={() =>
                            onQuantityChange(variant.id, quantity - 1)
                          }
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </Button>
                        <span className="w-4 text-center font-bold">
                          {quantity}
                        </span>
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          className="h-7 w-7 rounded-md"
                          onClick={() =>
                            onQuantityChange(variant.id, quantity + 1)
                          }
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 rounded-md px-2 text-xs"
                        onClick={() => onQuantityChange(variant.id, 1)}
                      >
                        Thêm
                      </Button>
                    )}
                  </div>
                  {quantity > 0 && (
                    <NoteInput
                      selectionKey={key}
                      label={`${item.name} ${variant.name}`}
                      notes={notes}
                      onNoteChange={onNoteChange}
                    />
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-end">
              {isSelected ? (
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    aria-label={`Bớt một ${item.name}`}
                    className="h-9 w-9 rounded-lg"
                    onClick={() =>
                      onQuantityChange(
                        undefined,
                        Math.max(0, fixedQuantity - 1),
                      )
                    }
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <span className="w-7 text-center text-sm font-bold tabular-nums">
                    {fixedQuantity}
                  </span>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    aria-label={`Thêm một ${item.name}`}
                    className="h-9 w-9 rounded-lg"
                    onClick={() =>
                      onQuantityChange(undefined, fixedQuantity + 1)
                    }
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-9 gap-1.5 rounded-lg px-3 font-semibold"
                  onClick={() => onQuantityChange(undefined, 1)}
                >
                  <Plus className="h-4 w-4" />
                  Thêm
                </Button>
              )}
            </div>
            {isSelected && (
              <NoteInput
                selectionKey={item.id}
                label={item.name}
                notes={notes}
                onNoteChange={onNoteChange}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
