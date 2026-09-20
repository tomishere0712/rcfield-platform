import { useEffect, useMemo, useState, type FormEvent } from "react"
import { ImagePlus, Trash2 } from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import { cafeApi, cafeQueryKeys, trackTypeApi, trackTypeQueryKeys } from "@/features/cafes/api/cafe.api"
import {
  closingTimeInputPattern,
  isValidClosingTime,
  isValidOpeningTime,
  normalizeOperatingTime,
  openingTimeInputPattern,
} from "@/features/cafes/lib/operating-hours"
import type { BackendCafe, CafeImage, CafeOperatingHours, CafeUpsertBody } from "@/features/cafes/types"
import { Button } from "@/shared/ui/button"
import { Checkbox } from "@/shared/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/shared/ui/dialog"
import { Input } from "@/shared/ui/input"
import { Label } from "@/shared/ui/label"
import { Textarea } from "@/shared/ui/textarea"

type ProviderCafeFormValues = CafeUpsertBody

type ProviderCafeFormDialogProps = {
  open: boolean
  cafe: BackendCafe | null
  isPending: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (values: ProviderCafeFormValues, files: File[]) => Promise<void>
  onDeleteImage: (image: CafeImage) => Promise<void>
}

const dayKeys = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]

const defaultValues: ProviderCafeFormValues = {
  name: "",
  description: "",
  phone: "",
  cover_image_url: null,
  address: "",
  district: "",
  city: "TP. Hồ Chí Minh",
  latitude: null,
  longitude: null,
  operating_hours: buildOperatingHours("09:00", "22:00"),
  track_types: [],
  slot_duration_minutes: 60,
  slot_fee_rate: 50000,
  max_concurrent_bookings: 6,
  min_booking_notice_minutes: 30,
  max_advance_booking_days: 30,
  byoc_capacity: 3,
}

export function ProviderCafeFormDialog({
  open,
  cafe,
  isPending,
  onOpenChange,
  onSubmit,
  onDeleteImage,
}: ProviderCafeFormDialogProps) {
  const [values, setValues] = useState<ProviderCafeFormValues>(defaultValues)
  const [openTime, setOpenTime] = useState("09:00")
  const [closeTime, setCloseTime] = useState("22:00")
  const [files, setFiles] = useState<File[]>([])

  const { data: images = [], isLoading: loadingImages } = useQuery({
    queryKey: cafeQueryKeys.images(cafe?.id),
    queryFn: () => cafeApi.listCafeImages(cafe!.id),
    enabled: open && !!cafe?.id,
  })

  const { data: trackTypes = [], isLoading: loadingTrackTypes } = useQuery({
    queryKey: trackTypeQueryKeys.all,
    queryFn: () => trackTypeApi.listAll(),
    staleTime: Infinity,
  })

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!open) return

      if (!cafe) {
        setValues(defaultValues)
        setOpenTime("09:00")
        setCloseTime("22:00")
        setFiles([])
        return
      }

      const sampleHours = cafe.operatingHours.mon ?? Object.values(cafe.operatingHours)[0]
      const nextOpen = sampleHours?.open ?? "09:00"
      const nextClose = sampleHours?.close ?? "22:00"
      setOpenTime(nextOpen)
      setCloseTime(nextClose)
      setValues({
        name: cafe.name,
        description: cafe.description ?? "",
        phone: cafe.phone ?? "",
        cover_image_url: cafe.coverImageUrl ?? null,
        address: cafe.address,
        district: cafe.district,
        city: cafe.city,
        latitude: cafe.latitude === null ? null : Number(cafe.latitude),
        longitude: cafe.longitude === null ? null : Number(cafe.longitude),
        operating_hours: buildOperatingHours(nextOpen, nextClose, cafe.operatingHours),
        track_types: cafe.trackTypes.map((t) => t.id),
        slot_duration_minutes: cafe.slotDurationMinutes,
        slot_fee_rate: Number(cafe.slotFeeRate),
        max_concurrent_bookings: cafe.maxConcurrentBookings,
        min_booking_notice_minutes: cafe.minBookingNoticeMinutes,
        max_advance_booking_days: cafe.maxAdvanceBookingDays,
        byoc_capacity: cafe.byocCapacity,
      })
      setFiles([])
    }, 0)

    return () => window.clearTimeout(timer)
  }, [cafe, open])

  const title = cafe ? "Cập nhật cơ sở" : "Thêm cơ sở"
  const selectedFileLabel = useMemo(() => {
    if (files.length === 0) return "Chưa chọn ảnh"
    return `${files.length} ảnh đã chọn`
  }, [files.length])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const hasValidCoordinates =
      values.latitude !== null &&
      values.longitude !== null &&
      Number.isFinite(values.latitude) &&
      Number.isFinite(values.longitude) &&
      values.latitude !== 0 &&
      values.longitude !== 0
    if (!hasValidCoordinates || !isValidOpeningTime(openTime) || !isValidClosingTime(closeTime)) return
    const body = {
      ...values,
      description: values.description?.trim() ? values.description.trim() : null,
      phone: values.phone?.trim() ? values.phone.trim() : null,
      cover_image_url: values.cover_image_url?.trim() ? values.cover_image_url.trim() : null,
      latitude: values.latitude === null || Number.isNaN(values.latitude) ? null : Number(values.latitude),
      longitude: values.longitude === null || Number.isNaN(values.longitude) ? null : Number(values.longitude),
      operating_hours: buildOperatingHours(openTime, closeTime, values.operating_hours),
    }
    await onSubmit(body, files)
  }

  const setField = <K extends keyof ProviderCafeFormValues>(field: K, value: ProviderCafeFormValues[K]) => {
    setValues((current) => ({ ...current, [field]: value }))
  }

  const toggleTrack = (trackTypeId: string, checked: boolean) => {
    setValues((current) => {
      const next = checked
        ? Array.from(new Set([...current.track_types, trackTypeId]))
        : current.track_types.filter((item) => item !== trackTypeId)
      return { ...current, track_types: next }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92svh] max-w-4xl sm:max-w-4xl overflow-y-auto rounded-xl bg-white p-0">
        <form onSubmit={handleSubmit}>
          <DialogHeader className="border-b border-[#e5e2e1] px-5 py-4">
            <DialogTitle className="text-xl font-bold text-[#1c1b1b]">{title}</DialogTitle>
            <DialogDescription>
              Quản lý dữ liệu cơ sở được đồng bộ trực tiếp với API backend.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField label="Tên cơ sở" value={values.name} onChange={(value) => setField("name", value)} required />
                <TextField label="Số điện thoại" value={values.phone ?? ""} onChange={(value) => setField("phone", value)} />
                <TextField label="Thành phố" value={values.city} onChange={(value) => setField("city", value)} required />
                <TextField label="Quận/Huyện" value={values.district} onChange={(value) => setField("district", value)} required />
              </div>

              <TextField label="Địa chỉ" value={values.address} onChange={(value) => setField("address", value)} required />

              <label className="block space-y-2">
                <span className="text-sm font-bold text-[#1c1b1b]">Mô tả</span>
                <Textarea
                  value={values.description ?? ""}
                  onChange={(event) => setField("description", event.target.value)}
                  className="min-h-24 rounded-lg border-[#c4c7c8]"
                  placeholder="Mô tả đường đua, tiện ích, quy định cơ sở..."
                />
              </label>

              <TextField label="Link ảnh bìa" value={values.cover_image_url ?? ""} onChange={(value) => setField("cover_image_url", value)} />

              <div className="grid gap-3 sm:grid-cols-2">
                <NumberField label="Vĩ độ" value={values.latitude ?? ""} onChange={(value) => setField("latitude", value)} step="0.0000001" />
                <NumberField label="Kinh độ" value={values.longitude ?? ""} onChange={(value) => setField("longitude", value)} step="0.0000001" />
                <NumberField label="Phí slot" value={values.slot_fee_rate} onChange={(value) => setField("slot_fee_rate", value ?? 0)} min={0} />
                <NumberField label="Thời lượng slot" value={values.slot_duration_minutes} onChange={(value) => setField("slot_duration_minutes", value ?? 60)} min={1} />
                <NumberField label="Báo trước phút" value={values.min_booking_notice_minutes} onChange={(value) => setField("min_booking_notice_minutes", value ?? 0)} min={0} />
                <NumberField label="Đặt trước tối đa (ngày)" value={values.max_advance_booking_days} onChange={(value) => setField("max_advance_booking_days", value ?? 1)} min={1} max={365} />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <TextField label="Giờ mở cửa" value={openTime} onChange={setOpenTime} onBlur={() => setOpenTime(normalizeOperatingTime(openTime))} type="text" inputMode="numeric" pattern={openingTimeInputPattern} placeholder="HH:mm" required />
                <TextField label="Giờ đóng cửa" value={closeTime} onChange={setCloseTime} onBlur={() => setCloseTime(normalizeOperatingTime(closeTime))} type="text" inputMode="numeric" pattern={closingTimeInputPattern} placeholder="HH:mm (hoặc 24:00)" required />
              </div>
              {(!isValidOpeningTime(openTime) || !isValidClosingTime(closeTime)) && (
                <p role="alert" className="text-xs font-semibold text-red-600">Giờ mở cửa phải từ 00:00 đến 23:59; giờ đóng có thể là 24:00.</p>
              )}

              <div className="rounded-lg border border-[#e5e2e1] p-3">
                <div className="mb-3 text-sm font-bold text-[#1c1b1b]">Loại track</div>
                {loadingTrackTypes ? (
                  <span className="text-xs text-[#747878] font-semibold">Đang tải danh sách track...</span>
                ) : trackTypes.length === 0 ? (
                  <span className="text-xs text-[#747878]">Chưa có dữ liệu loại track.</span>
                ) : (
                  <div className="flex flex-wrap gap-3">
                    {trackTypes.map((item) => (
                      <Label key={item.id} className="rounded-lg border border-[#e5e2e1] px-3 py-2 cursor-pointer hover:bg-[#f6f3f2]">
                        <Checkbox
                          checked={values.track_types.includes(item.id)}
                          onCheckedChange={(checked) => toggleTrack(item.id, checked === true)}
                        />
                        <span className="font-semibold">{item.name}</span>
                      </Label>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <aside className="space-y-4">
              <div className="rounded-xl border border-[#e5e2e1] bg-[#fcf8f8] p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-bold text-[#1c1b1b]">
                  <ImagePlus className="size-4" />
                  Ảnh gallery
                </div>
                <label className="block cursor-pointer rounded-lg border border-dashed border-[#c4c7c8] bg-white p-4 text-center text-sm font-semibold text-[#444748] hover:bg-[#f6f3f2]">
                  {selectedFileLabel}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    className="sr-only"
                    onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
                  />
                </label>
                {cafe ? (
                  <div className="mt-4 space-y-2">
                    <div className="text-xs font-bold uppercase tracking-wide text-[#747878]">Ảnh hiện tại</div>
                    {loadingImages ? (
                      <div className="h-24 animate-pulse rounded-lg bg-[#e5e2e1]" />
                    ) : images.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-[#c4c7c8] p-3 text-xs font-medium text-[#747878]">
                        Chưa có ảnh gallery.
                      </div>
                    ) : (
                      images.map((image) => (
                        <div key={image.id} className="flex items-center gap-2 rounded-lg border border-[#e5e2e1] bg-white p-2 min-w-0 overflow-hidden">
                          <img src={image.url} alt="" className="size-12 shrink-0 rounded-md object-cover" />
                          <span className="min-w-0 flex-1 truncate text-xs font-medium text-[#444748]">{image.url}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => void onDeleteImage(image)}
                            className="text-red-600 hover:bg-red-50 hover:text-red-700"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                ) : (
                  <p className="mt-3 text-xs font-medium text-[#747878]">
                    Ảnh sẽ được upload sau khi cơ sở được tạo thành công.
                  </p>
                )}
              </div>
            </aside>
          </div>

          <DialogFooter className="px-5">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              Hủy
            </Button>
            <Button
              type="submit"
              disabled={
                isPending ||
                values.track_types.length === 0 ||
                values.latitude === null ||
                values.longitude === null ||
                !Number.isFinite(values.latitude) ||
                !Number.isFinite(values.longitude) ||
                values.latitude === 0 ||
                values.longitude === 0
              }
              className="bg-[#1c1b1b] text-white hover:bg-[#313030]"
            >
              {isPending ? "Đang lưu..." : cafe ? "Lưu thay đổi" : "Tạo cơ sở"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
  required = false,
  inputMode,
  pattern,
  placeholder,
  onBlur,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  required?: boolean
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"]
  pattern?: string
  placeholder?: string
  onBlur?: () => void
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-bold text-[#1c1b1b]">{label}</span>
      <Input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        required={required}
        inputMode={inputMode}
        pattern={pattern}
        placeholder={placeholder}
        className="rounded-lg border-[#c4c7c8]"
      />
    </label>
  )
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = "1",
}: {
  label: string
  value: number | ""
  onChange: (value: number | null) => void
  min?: number
  max?: number
  step?: string
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-bold text-[#1c1b1b]">{label}</span>
      <Input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))}
        className="rounded-lg border-[#c4c7c8]"
      />
    </label>
  )
}

function buildOperatingHours(
  open: string,
  close: string,
  existingHours?: CafeOperatingHours,
): CafeOperatingHours {
  return Object.fromEntries(
    dayKeys.map((day) => [
      day,
      { open, close, is_closed: existingHours?.[day]?.is_closed ?? false },
    ]),
  )
}
