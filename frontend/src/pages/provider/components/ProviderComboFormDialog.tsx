import { useEffect, useState, type FormEvent } from "react"
import { Minus, Plus, Trash2 } from "lucide-react"

import type { ComboUpsertBody, MenuCategory, MenuItem } from "@/features/menu/types"
import { CategoryField } from "@/pages/provider/components/ProviderMenuItemFormDialog"
import { Button } from "@/shared/ui/button"
import { Checkbox } from "@/shared/ui/checkbox"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/shared/ui/dialog"
import { Input } from "@/shared/ui/input"
import { Label } from "@/shared/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select"
import { Textarea } from "@/shared/ui/textarea"
import { formatCurrency } from "@/shared/lib/format"

type ProviderComboFormDialogProps = {
  open: boolean
  combo: MenuItem | null
  menuItems: MenuItem[]
  categories: MenuCategory[]
  isPending: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (values: ComboUpsertBody) => Promise<void>
}

type ComponentRow = { item_id: string; quantity: number }

const defaultValues = {
  name: "",
  description: "",
  price: 0,
  category_id: null as string | null,
  image_url: null as string | null,
  is_available: true,
}

export function ProviderComboFormDialog({
  open,
  combo,
  menuItems,
  categories,
  isPending,
  onOpenChange,
  onSubmit,
}: ProviderComboFormDialogProps) {
  const [values, setValues] = useState(defaultValues)
  const [components, setComponents] = useState<ComponentRow[]>([])
  const [addingItemId, setAddingItemId] = useState("")

  const nonComboItems = menuItems.filter((item) => !item.isCombo && item.isAvailable)

  useEffect(() => {
    if (!open) return
    if (!combo) {
      queueMicrotask(() => {
        setValues(defaultValues)
        setComponents([])
        setAddingItemId("")
      })
      return
    }
    const nextValues = {
      name: combo.name,
      description: combo.description ?? "",
      price: Number(combo.price),
      category_id: combo.categoryId,
      image_url: combo.imageUrl ?? null,
      is_available: combo.isAvailable,
    }
    const nextComponents = (combo.components ?? []).map((c) => ({ item_id: c.itemId, quantity: c.quantity }))
    queueMicrotask(() => {
      setValues(nextValues)
      setComponents(nextComponents)
      setAddingItemId("")
    })
  }, [combo, open])

  const addComponent = () => {
    if (!addingItemId) return
    if (components.some((c) => c.item_id === addingItemId)) return
    setComponents((prev) => [...prev, { item_id: addingItemId, quantity: 1 }])
    setAddingItemId("")
  }

  const removeComponent = (itemId: string) => {
    setComponents((prev) => prev.filter((c) => c.item_id !== itemId))
  }

  const changeQuantity = (itemId: string, delta: number) => {
    setComponents((prev) =>
      prev.map((c) =>
        c.item_id === itemId ? { ...c, quantity: Math.max(1, c.quantity + delta) } : c,
      ),
    )
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await onSubmit({
      name: values.name.trim(),
      description: values.description?.trim() || null,
      price: Number(values.price),
      category_id: values.category_id ?? null,
      image_url: values.image_url?.trim() || null,
      is_available: values.is_available,
      components,
    })
  }

  const isValid = values.name.trim().length >= 2 && components.length >= 2

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92svh] max-w-2xl overflow-y-auto rounded-xl bg-white p-0">
        <form onSubmit={handleSubmit}>
          <DialogHeader className="border-b border-[#e5e2e1] px-5 py-4">
            <DialogTitle className="text-xl font-bold text-[#1c1b1b]">
              {combo ? "Cập nhật combo" : "Tạo combo"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 p-5">
            {/* Basic info */}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-2">
                <span className="text-sm font-bold text-[#1c1b1b]">Tên combo</span>
                <Input
                  value={values.name}
                  onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
                  required
                  className="rounded-lg border-[#c4c7c8]"
                />
              </label>
              <label className="block space-y-2">
                <span className="text-sm font-bold text-[#1c1b1b]">Giá combo</span>
                <Input
                  type="number"
                  min={0}
                  step={1000}
                  value={values.price}
                  onChange={(e) => setValues((v) => ({ ...v, price: Number(e.target.value) }))}
                  className="rounded-lg border-[#c4c7c8]"
                />
              </label>
            </div>

            {/* Provider tự chọn danh mục cho combo — hệ thống không tự gán (FR-013) */}
            <CategoryField
              categories={categories}
              value={values.category_id}
              onChange={(value) => setValues((v) => ({ ...v, category_id: value }))}
            />

            <label className="block space-y-2">
              <span className="text-sm font-bold text-[#1c1b1b]">Mô tả</span>
              <Textarea
                value={values.description ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
                className="min-h-20 rounded-lg border-[#c4c7c8]"
              />
            </label>

            {/* Component picker */}
            <div className="space-y-3">
              <span className="text-sm font-bold text-[#1c1b1b]">
                Món trong combo{" "}
                <span className="font-normal text-[#747878]">(tối thiểu 2 món)</span>
              </span>

              <div className="flex gap-2">
                <Select value={addingItemId} onValueChange={setAddingItemId}>
                  <SelectTrigger className="flex-1 rounded-lg border-[#c4c7c8]">
                    <SelectValue placeholder="Chọn món để thêm..." />
                  </SelectTrigger>
                  <SelectContent>
                    {nonComboItems
                      .filter((item) => !components.some((c) => c.item_id === item.id))
                      .map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.name} · {formatCurrency(Number(item.price))}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  onClick={addComponent}
                  disabled={!addingItemId}
                  className="rounded-lg border-[#c4c7c8]"
                >
                  <Plus className="size-4" />
                </Button>
              </div>

              {components.length > 0 ? (
                <div className="divide-y divide-[#e5e2e1] rounded-lg border border-[#e5e2e1]">
                  {components.map((comp) => {
                    const item = menuItems.find((m) => m.id === comp.item_id)
                    return (
                      <div key={comp.item_id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[#1c1b1b]">
                          {item?.name ?? comp.item_id}
                        </span>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="outline"
                            onClick={() => changeQuantity(comp.item_id, -1)}
                            disabled={comp.quantity <= 1}
                            className="rounded-md border-[#c4c7c8]"
                          >
                            <Minus className="size-3.5" />
                          </Button>
                          <span className="w-5 text-center text-sm font-bold">{comp.quantity}</span>
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="outline"
                            onClick={() => changeQuantity(comp.item_id, 1)}
                            className="rounded-md border-[#c4c7c8]"
                          >
                            <Plus className="size-3.5" />
                          </Button>
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="outline"
                            onClick={() => removeComponent(comp.item_id)}
                            className="rounded-md border-red-200 text-red-500 hover:bg-red-50"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-xs text-[#747878]">Chưa có món nào. Thêm ít nhất 2 món.</p>
              )}
            </div>

            <Label className="flex items-center gap-2 rounded-lg border border-[#e5e2e1] px-3 py-3">
              <Checkbox
                checked={values.is_available}
                onCheckedChange={(checked) => setValues((v) => ({ ...v, is_available: checked === true }))}
              />
              Đang bán
            </Label>
          </div>

          <DialogFooter className="px-5 pb-5">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              Hủy
            </Button>
            <Button
              type="submit"
              disabled={isPending || !isValid}
              className="bg-[#1c1b1b] text-white hover:bg-[#313030]"
            >
              {isPending ? "Đang lưu..." : combo ? "Lưu thay đổi" : "Tạo combo"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
