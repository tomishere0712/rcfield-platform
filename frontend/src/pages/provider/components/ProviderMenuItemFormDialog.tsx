import { useEffect, useState, type FormEvent } from "react"
import { ImagePlus, Plus, Trash2 } from "lucide-react"

import type { MenuCategory, MenuItem, MenuUpsertBody } from "@/features/menu/types"
import { UNCATEGORIZED_LABEL } from "@/features/menu/types"
import { uploadImage } from "@/features/uploads/api/upload.api"
import { Button } from "@/shared/ui/button"
import { Checkbox } from "@/shared/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/shared/ui/dialog"
import { Input } from "@/shared/ui/input"
import { Label } from "@/shared/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select"
import { Textarea } from "@/shared/ui/textarea"

/** Giá trị Select đại diện cho "không gán danh mục" — Radix Select không nhận value rỗng. */
const NO_CATEGORY_VALUE = "__none__"

type ProviderMenuItemFormDialogProps = {
  open: boolean
  item: MenuItem | null
  categories: MenuCategory[]
  isPending: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (values: MenuUpsertBody) => Promise<void>
}

const defaultValues: MenuUpsertBody = {
  name: "",
  description: "",
  price: 0,
  category_id: null,
  image_url: null,
  is_available: true,
  variants: [],
}

export function ProviderMenuItemFormDialog({
  open,
  item,
  categories,
  isPending,
  onOpenChange,
  onSubmit,
}: ProviderMenuItemFormDialogProps) {
  const [values, setValues] = useState<MenuUpsertBody>(defaultValues)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    if (!open) return
    if (!item) {
      queueMicrotask(() => setValues(defaultValues))
      return
    }

    queueMicrotask(() =>
      setValues({
        name: item.name,
        description: item.description ?? "",
        price: Number(item.price),
        category_id: item.categoryId,
        image_url: item.imageUrl ?? null,
        is_available: item.isAvailable,
        variants: (item.variants ?? []).map((variant) => ({
          name: variant.name,
          price: Number(variant.price),
          is_available: variant.isAvailable,
        })),
      }),
    )
  }, [item, open])

  const setField = <K extends keyof MenuUpsertBody>(field: K, value: MenuUpsertBody[K]) => {
    setValues((current) => ({ ...current, [field]: value }))
  }

  const setVariants = (variants: NonNullable<MenuUpsertBody["variants"]>) => {
    setValues((current) => ({
      ...current,
      variants,
      price: variants.length ? Math.min(...variants.map((variant) => Number(variant.price) || 0)) : current.price,
    }))
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const variants = (values.variants ?? [])
      .map((variant) => ({ ...variant, name: variant.name.trim(), price: Number(variant.price) }))
      .filter((variant) => variant.name)
    const displayPrice = variants.length ? Math.min(...variants.map((variant) => variant.price)) : Number(values.price)

    await onSubmit({
      name: values.name.trim(),
      description: values.description?.trim() ? values.description.trim() : null,
      price: displayPrice,
      category_id: values.category_id ?? null,
      image_url: values.image_url?.trim() ? values.image_url.trim() : null,
      is_available: values.is_available ?? true,
      variants,
    })
  }

  const handleUpload = async (file: File | undefined) => {
    if (!file) return
    setUploading(true)
    try {
      const uploaded = await uploadImage(file, "menu")
      setField("image_url", uploaded.url)
    } finally {
      setUploading(false)
    }
  }

  const hasVariants = (values.variants?.length ?? 0) > 0
  const canSubmit = !isPending && !uploading && values.name.trim().length >= 2

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] w-[calc(100vw-2rem)] max-w-[680px] gap-0 overflow-hidden rounded-2xl bg-white p-0 sm:max-w-[680px]">
        <form onSubmit={handleSubmit} className="flex min-h-0 max-h-[90svh] flex-col">
          <DialogHeader className="shrink-0 border-b border-[#e5e2e1] px-5 py-5 sm:px-6">
            <DialogTitle className="text-xl font-bold text-[#1c1b1b]">
              {item ? "Cập nhật món" : "Thêm món"}
            </DialogTitle>
            <DialogDescription>Thiết lập thông tin, giá bán và lựa chọn của món.</DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5 sm:p-6">
            <section className="space-y-3">
              <SectionHeading step="1" title="Thông tin cơ bản" />
              <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
                <TextField label="Tên món" value={values.name} onChange={(value) => setField("name", value)} required />
                <div className="min-w-0">
                  <NumberField
                    label={hasVariants ? "Giá hiển thị từ" : "Giá bán"}
                    value={values.price}
                    onChange={(value) => setField("price", value ?? 0)}
                    min={0}
                    disabled={hasVariants}
                  />
                  {hasVariants && (
                    <p className="mt-1.5 text-[11px] font-medium text-[#747878]">
                      Tự lấy theo lựa chọn có giá thấp nhất.
                    </p>
                  )}
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-orange-100 bg-orange-50/35 p-4 sm:p-5">
              <Label className="flex cursor-pointer items-center gap-2.5">
                <Checkbox
                  checked={hasVariants}
                  onCheckedChange={(checked) => {
                    if (checked === true) {
                      setVariants([
                        { name: "M", price: Number(values.price) || 0, is_available: true },
                        { name: "L", price: (Number(values.price) || 0) + 10000, is_available: true },
                      ])
                    } else {
                      setVariants([])
                    }
                  }}
                />
                <span>
                  <span className="block text-sm font-extrabold text-[#1c1b1b]">Món có size hoặc lựa chọn</span>
                  <span className="mt-0.5 block text-xs font-medium text-[#747878]">
                    Ví dụ: size M/L, loại cà phê hoặc loại nước ngọt.
                  </span>
                </span>
              </Label>

              {hasVariants && (
                <div className="mt-4 border-t border-orange-100 pt-4">
                  <div className="mb-2 grid grid-cols-[minmax(0,1fr)_112px_36px] gap-2 px-1 text-[11px] font-extrabold uppercase tracking-wide text-[#747878]">
                    <span>Tên lựa chọn</span>
                    <span>Giá bán</span>
                    <span className="sr-only">Thao tác</span>
                  </div>
                  <div className="space-y-2">
                    {values.variants!.map((variant, index) => (
                      <div key={index} className="grid min-w-0 grid-cols-[minmax(0,1fr)_112px_36px] items-center gap-2">
                        <Input
                          aria-label={`Tên lựa chọn ${index + 1}`}
                          value={variant.name}
                          maxLength={80}
                          onChange={(event) => {
                            const next = [...values.variants!]
                            next[index] = { ...variant, name: event.target.value }
                            setVariants(next)
                          }}
                          placeholder="Ví dụ: M, L hoặc Pepsi"
                          className="h-10 min-w-0 rounded-lg border-[#c4c7c8] bg-white"
                        />
                        <PriceInput
                          aria-label={`Giá lựa chọn ${index + 1}`}
                          value={variant.price}
                          onChange={(val) => {
                            const next = [...values.variants!]
                            next[index] = { ...variant, price: val }
                            setVariants(next)
                          }}
                          className="h-10 min-w-0 rounded-lg border-[#c4c7c8] bg-white"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          disabled={values.variants!.length <= 1}
                          onClick={() => setVariants(values.variants!.filter((_, currentIndex) => currentIndex !== index))}
                          aria-label="Xóa lựa chọn"
                          className="size-9 text-[#747878] hover:bg-red-50 hover:text-red-600 disabled:opacity-35"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setVariants([
                        ...(values.variants ?? []),
                        { name: "", price: Number(values.price) || 0, is_available: true },
                      ])
                    }
                    className="mt-3 border-orange-200 bg-white text-orange-700 hover:bg-orange-50"
                  >
                    <Plus className="mr-1 size-4" /> Thêm size / lựa chọn
                  </Button>
                  <p className="mt-3 text-xs font-medium leading-5 text-[#747878]">
                    Khách chọn một lựa chọn trước khi thêm món vào đơn.
                  </p>
                </div>
              )}
            </section>

            <section className="space-y-3">
              <SectionHeading step="2" title="Phân loại và trạng thái" />
              <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_170px]">
                <CategoryField
                  categories={categories}
                  value={values.category_id}
                  onChange={(value) => setField("category_id", value)}
                />
                <div className="space-y-2">
                  <span className="text-sm font-bold text-[#1c1b1b]">Trạng thái bán</span>
                  <Label className="flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-[#e5e2e1] bg-white px-3">
                    <Checkbox
                      checked={values.is_available ?? true}
                      onCheckedChange={(checked) => setField("is_available", checked === true)}
                    />
                    <span className="whitespace-nowrap text-sm font-semibold text-[#1c1b1b]">Đang bán</span>
                  </Label>
                </div>
              </div>
            </section>

            <label className="block space-y-2">
              <span className="text-sm font-bold text-[#1c1b1b]">Mô tả</span>
              <Textarea
                value={values.description ?? ""}
                onChange={(event) => setField("description", event.target.value)}
                placeholder="Mô tả ngắn giúp khách dễ chọn món hơn."
                className="min-h-28 resize-y rounded-lg border-[#c4c7c8]"
              />
            </label>

            {values.image_url ? (
              <div className="flex min-w-0 items-center gap-3 rounded-xl border border-[#e5e2e1] bg-[#fcf8f8] p-3.5">
                <img src={values.image_url} alt={`Ảnh ${values.name || "món ăn"}`} className="size-16 shrink-0 rounded-lg object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-[#1c1b1b]">Ảnh món</p>
                  <p className="mt-0.5 text-xs font-medium text-[#747878]">Ảnh đang được dùng trên menu khách hàng.</p>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs font-semibold">
                    <label className="cursor-pointer text-orange-700 hover:underline">
                      {uploading ? "Đang upload..." : "Thay ảnh"}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        disabled={uploading || isPending}
                        className="sr-only"
                        onChange={(event) => void handleUpload(event.target.files?.[0])}
                      />
                    </label>
                    <button type="button" onClick={() => setField("image_url", null)} className="text-red-500 hover:underline">
                      Xóa ảnh
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <label className="block cursor-pointer rounded-xl border border-dashed border-[#c4c7c8] bg-[#fcf8f8] p-4 text-sm font-semibold text-[#444748] transition-colors hover:bg-[#f6f3f2]">
                <span className="flex items-center gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white text-orange-600 shadow-sm">
                    <ImagePlus className="size-4" />
                  </span>
                  <span>
                    <span className="block font-bold text-[#1c1b1b]">{uploading ? "Đang upload ảnh..." : "Thêm ảnh món"}</span>
                    <span className="mt-0.5 block text-xs font-medium text-[#747878]">JPG, PNG hoặc WEBP.</span>
                  </span>
                </span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={uploading || isPending}
                  className="sr-only"
                  onChange={(event) => void handleUpload(event.target.files?.[0])}
                />
              </label>
            )}
          </div>

          <DialogFooter className="!mx-0 !mb-0 shrink-0 border-[#e5e2e1] bg-[#f8fafc] px-5 py-4 sm:px-6">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending || uploading}>
              Hủy
            </Button>
            <Button type="submit" disabled={!canSubmit} className="bg-[#1c1b1b] text-white hover:bg-[#313030]">
              {isPending ? "Đang lưu..." : item ? "Lưu thay đổi" : "Tạo món"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function SectionHeading({ step, title }: { step: string; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex size-5 items-center justify-center rounded-full bg-orange-100 text-[11px] font-extrabold text-orange-700">{step}</span>
      <h3 className="text-sm font-extrabold text-[#1c1b1b]">{title}</h3>
    </div>
  )
}

function TextField({
  label,
  value,
  onChange,
  required = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  required?: boolean
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-bold text-[#1c1b1b]">{label}</span>
      <Input value={value} onChange={(event) => onChange(event.target.value)} required={required} className="rounded-lg border-[#c4c7c8]" />
    </label>
  )
}

export function CategoryField({
  categories,
  value,
  onChange,
}: {
  categories: MenuCategory[]
  value: string | null | undefined
  onChange: (value: string | null) => void
}) {
  return (
    <div className="space-y-2">
      <span className="text-sm font-bold text-[#1c1b1b]">Danh mục</span>
      <Select value={value ?? NO_CATEGORY_VALUE} onValueChange={(next) => onChange(next === NO_CATEGORY_VALUE ? null : next)}>
        <SelectTrigger className="h-10 w-full rounded-lg border-[#c4c7c8]">
          <SelectValue placeholder="Chọn danh mục" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_CATEGORY_VALUE}>{UNCATEGORIZED_LABEL}</SelectItem>
          {categories.map((category) => (
            <SelectItem key={category.id} value={category.id}>
              {category.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {categories.length === 0 && (
        <p className="text-xs font-medium text-[#747878]">Cơ sở chưa có danh mục nào. Tạo danh mục ở nút "Danh mục" phía trên.</p>
      )}
    </div>
  )
}

function NumberField({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  disabled?: boolean
  min?: number
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-bold text-[#1c1b1b]">{label}</span>
      <PriceInput
        value={value}
        onChange={onChange}
        disabled={disabled}
        className="rounded-lg border-[#c4c7c8]"
      />
    </label>
  )
}

interface PriceInputProps extends Omit<React.ComponentProps<typeof Input>, "value" | "onChange"> {
  value: number
  onChange: (val: number) => void
}

function PriceInput({
  value,
  onChange,
  disabled,
  placeholder = "0",
  className,
  ...props
}: PriceInputProps) {
  const [prevValue, setPrevValue] = useState(value)
  const [displayValue, setDisplayValue] = useState(() =>
    value > 0 ? new Intl.NumberFormat("en-US").format(value) : "0"
  )

  if (value !== prevValue) {
    setPrevValue(value)
    if (!(value === 0 && displayValue === "")) {
      setDisplayValue(value > 0 ? new Intl.NumberFormat("en-US").format(value) : "0")
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
    const clean = raw.replace(/\D/g, "")
    if (!clean) {
      setDisplayValue("")
      onChange(0)
      return
    }
    const num = Number(clean)
    setDisplayValue(new Intl.NumberFormat("en-US").format(num))
    onChange(num)
  }

  const handleBlur = () => {
    if (displayValue === "") {
      setDisplayValue("0")
    }
  }

  return (
    <Input
      type="text"
      value={displayValue}
      onChange={handleChange}
      onBlur={handleBlur}
      disabled={disabled}
      placeholder={placeholder}
      className={className}
      {...props}
    />
  )
}
