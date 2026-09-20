import { useEffect, useMemo, useState, type FormEvent } from "react"
import {
  ImageIcon,
  ImagePlus,
  Info,
  Loader2,
  MapPin,
  Plus,
  Trash2,
  X,
} from "lucide-react"
import { useQuery } from "@tanstack/react-query"

import { LocationPickerDialog } from "@/shared/components/LocationPickerDialog"

import {
  amenityApi,
  amenityQueryKeys,
  cafeApi,
  cafeQueryKeys,
  trackTypeApi,
  trackTypeQueryKeys,
} from "@/features/cafes/api/cafe.api"
import {
  closingTimeInputPattern,
  getOperatingHoursValidationError,
  isValidClosingTime,
  isValidOpeningTime,
  normalizeOperatingTime,
  openingTimeInputPattern,
} from "@/features/cafes/lib/operating-hours"
import type {
  BackendCafe,
  CafeImage,
  CafeOperatingHour,
  CafeOperatingHours,
  CafeUpsertBody,
} from "@/features/cafes/types"
import { BANNER_RECOMMENDED } from "@/shared/lib/cloudinary"
import { toast } from "sonner"
import { cn, sanitizeImageUrl } from "@/shared/lib/utils"
import { Button } from "@/shared/ui/button"
import { Checkbox } from "@/shared/ui/checkbox"
import { Input } from "@/shared/ui/input"
import { Label } from "@/shared/ui/label"
import { Textarea } from "@/shared/ui/textarea"

type Province = { code: number; name: string }
type Ward = { code: number; name: string }

async function fetchProvinces(): Promise<Province[]> {
  const res = await fetch("https://provinces.open-api.vn/api/v2/p/")
  if (!res.ok) throw new Error("Cannot load provinces")
  return res.json() as Promise<Province[]>
}

async function fetchWards(provinceCode: number): Promise<Ward[]> {
  const res = await fetch(
    `https://provinces.open-api.vn/api/v2/p/${provinceCode}?depth=2`,
  )
  if (!res.ok) throw new Error("Cannot load wards")
  const data = (await res.json()) as { wards?: Ward[] }
  return data.wards ?? []
}

type ProviderCafeFormValues = CafeUpsertBody

type ProviderCafeFormProps = {
  cafe?: BackendCafe | null
  isPending: boolean
  submitLabel?: string
  onSubmit: (
    values: ProviderCafeFormValues,
    galleryFiles: File[],
    coverFile: File | null,
  ) => Promise<void>
  onCancel?: () => void
  onDeleteImage?: (image: CafeImage) => Promise<void>
  /**
   * Có hai hàm này nghĩa là cơ sở đã tồn tại: ảnh chọn xong lưu ngay, không chờ
   * bấm "Lưu thay đổi". Lúc tạo cơ sở mới thì không truyền, vì chưa có cơ sở nào
   * để gắn ảnh vào — khi đó ảnh vẫn đi kèm lượt submit như cũ.
   */
  onUploadCover?: (file: File) => Promise<void>
  onUploadGallery?: (files: File[]) => Promise<void>
}

const dayKeys = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]

const dayLabels: Record<string, string> = {
  mon: "Thứ 2",
  tue: "Thứ 3",
  wed: "Thứ 4",
  thu: "Thứ 5",
  fri: "Thứ 6",
  sat: "Thứ 7",
  sun: "Chủ nhật",
}

function buildDefaultHours(): CafeOperatingHours {
  return Object.fromEntries(
    dayKeys.map((day) => [
      day,
      { open: "09:00", close: "22:00", is_closed: false },
    ]),
  )
}

const defaultValues: ProviderCafeFormValues = {
  name: "",
  description: "",
  phone: "",
  cover_image_url: null,
  address: "",
  district: "",
  city: "Thành phố Hồ Chí Minh",
  latitude: null,
  longitude: null,
  operating_hours: buildDefaultHours(),
  track_types: [],
  slot_duration_minutes: 60,
  slot_fee_rate: 50000,
  max_concurrent_bookings: 6,
  min_booking_notice_minutes: 30,
  max_advance_booking_days: 30,
  byoc_capacity: 3,
  amenity_ids: [],
  rules: [],
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024

/** Đọc kích thước thật của ảnh trước khi nhận. */
function readImageSize(
  file: File,
): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(objectUrl)
      resolve({ width: image.naturalWidth, height: image.naturalHeight })
    }
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      resolve(null)
    }
    image.src = objectUrl
  })
}

/**
 * Chỉ chặn thứ thật sự làm hỏng việc tải lên: dung lượng.
 *
 * Kích thước ảnh không còn bị chặn. Chủ quán chụp bằng điện thoại hay lấy ảnh
 * sẵn có đều dùng được; ảnh nhỏ thì hiện chưa nét chứ không phải là lỗi, nên
 * chỉ nhắc chứ không từ chối. Mốc 5MB thì giữ, vì đó là giới hạn thật của
 * endpoint tải ảnh — vượt qua là hỏng ở server.
 */
async function acceptImage(file: File): Promise<boolean> {
  if (file.size > MAX_IMAGE_BYTES) {
    toast.error(`"${file.name}" nặng hơn 5MB`)
    return false
  }
  const size = await readImageSize(file)
  if (size && size.width < BANNER_RECOMMENDED.width) {
    toast.warning(
      `"${file.name}" rộng ${size.width}px nên có thể hơi mờ khi phóng to. Ảnh vẫn được dùng.`,
    )
  }
  if (size && size.height > size.width) {
    toast.warning(
      `"${file.name}" đang dạng dọc. Ảnh hiển thị dạng ngang nên sẽ bị cắt nhiều.`,
    )
  }
  return true
}

export function ProviderCafeForm({
  cafe = null,
  isPending,
  submitLabel,
  onSubmit,
  onUploadCover,
  onUploadGallery,
  onCancel,
  onDeleteImage,
}: ProviderCafeFormProps) {
  const [values, setValues] = useState<ProviderCafeFormValues>(defaultValues)
  const [files, setFiles] = useState<File[]>([])
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [snap, setSnap] = useState<ProviderCafeFormValues>(defaultValues)
  const [mapOpen, setMapOpen] = useState(false)
  const [provinceCode, setProvinceCode] = useState<number | null>(null)

  const { data: provinces = [], isLoading: loadingProvinces } = useQuery({
    queryKey: ["vn-provinces"],
    queryFn: fetchProvinces,
    staleTime: Infinity,
  })

  const { data: wards = [], isLoading: loadingWards } = useQuery({
    queryKey: ["vn-wards", provinceCode],
    queryFn: () => fetchWards(provinceCode!),
    enabled: provinceCode !== null,
    staleTime: Infinity,
  })

  const [uploadingCover, setUploadingCover] = useState(false)
  const [uploadingGallery, setUploadingGallery] = useState(false)

  const coverPreview = useMemo(() => {
    if (coverFile) return URL.createObjectURL(coverFile)
    return sanitizeImageUrl(values.cover_image_url) ?? null
  }, [coverFile, values.cover_image_url])

  const { data: images = [], isLoading: loadingImages } = useQuery({
    queryKey: cafeQueryKeys.images(cafe?.id),
    queryFn: () => cafeApi.listCafeImages(cafe!.id),
    enabled: !!cafe?.id,
  })

  const { data: amenityCatalog = [] } = useQuery({
    queryKey: amenityQueryKeys.all,
    queryFn: amenityApi.listAll,
    staleTime: Infinity,
  })

  const { data: trackTypes = [], isLoading: loadingTrackTypes } = useQuery({
    queryKey: trackTypeQueryKeys.all,
    queryFn: () => trackTypeApi.listAll(),
    staleTime: Infinity,
  })

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!cafe) {
        setValues(defaultValues)
        setSnap(defaultValues)
        setFiles([])
        return
      }

      const loadedHours: CafeOperatingHours = {}
      dayKeys.forEach((day) => {
        const h = cafe.operatingHours[day]
        loadedHours[day] = {
          open: h?.open ?? "09:00",
          close: h?.close ?? "22:00",
          is_closed: h?.is_closed ?? false,
        }
      })

      const nextValues: ProviderCafeFormValues = {
        name: cafe.name,
        description: cafe.description ?? "",
        phone: cafe.phone ?? "",
        cover_image_url: cafe.coverImageUrl ?? null,
        address: cafe.address,
        district: cafe.district,
        city: cafe.city,
        latitude: cafe.latitude === null ? null : Number(cafe.latitude),
        longitude: cafe.longitude === null ? null : Number(cafe.longitude),
        operating_hours: loadedHours,
        track_types: cafe.trackTypes.map((t) => t.id),
        slot_duration_minutes: cafe.slotDurationMinutes,
        slot_fee_rate: Number(cafe.slotFeeRate),
        max_concurrent_bookings: cafe.maxConcurrentBookings,
        min_booking_notice_minutes: cafe.minBookingNoticeMinutes,
        max_advance_booking_days: cafe.maxAdvanceBookingDays,
        byoc_capacity: cafe.byocCapacity,
        amenity_ids: cafe.amenityIds ?? [],
        rules: cafe.rules ?? [],
      }

      setValues(nextValues)
      setSnap(nextValues)
      setFiles([])
    }, 0)

    return () => window.clearTimeout(timer)
  }, [cafe])

  // Sync provinceCode when cafe data or provinces list becomes available
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!provinces.length) return
      const cityName = cafe?.city ?? defaultValues.city
      const match = provinces.find((p) => p.name === cityName)
      setProvinceCode(match?.code ?? null)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [cafe?.city, provinces])

  const selectedFileLabel = useMemo(() => {
    if (files.length === 0) return "Chọn ảnh để tải lên"
    return `${files.length} ảnh đã chọn`
  }, [files.length])

  const isDirty = useMemo(() => {
    if (files.length > 0) return true
    if (coverFile !== null) return true
    return (Object.keys(values) as Array<keyof ProviderCafeFormValues>).some(
      (key) => {
        const a = values[key]
        const b = snap[key]
        if (Array.isArray(a) && Array.isArray(b)) {
          return JSON.stringify([...a].sort()) !== JSON.stringify([...b].sort())
        }
        if (
          a !== null &&
          b !== null &&
          typeof a === "object" &&
          typeof b === "object"
        ) {
          return JSON.stringify(a) !== JSON.stringify(b)
        }
        return a !== b
      },
    )
  }, [values, snap, files, coverFile])
  const hasValidCoordinates =
    values.latitude !== null &&
    values.longitude !== null &&
    Number.isFinite(values.latitude) &&
    Number.isFinite(values.longitude) &&
    values.latitude !== 0 &&
    values.longitude !== 0
  const operatingHoursError = getOperatingHoursValidationError(
    values.operating_hours,
  )

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!hasValidCoordinates || operatingHoursError) return
    const body: ProviderCafeFormValues = {
      ...values,
      description: values.description?.trim()
        ? values.description.trim()
        : null,
      phone: values.phone?.trim() ? values.phone.trim() : null,
      cover_image_url: values.cover_image_url?.trim()
        ? values.cover_image_url.trim()
        : null,
      latitude:
        values.latitude === null || Number.isNaN(values.latitude)
          ? null
          : Number(values.latitude),
      longitude:
        values.longitude === null || Number.isNaN(values.longitude)
          ? null
          : Number(values.longitude),
    }
    await onSubmit(body, files, coverFile)
    setFiles([])
    setCoverFile(null)
  }

  const setField = <K extends keyof ProviderCafeFormValues>(
    field: K,
    value: ProviderCafeFormValues[K],
  ) => {
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

  const toggleAmenity = (id: string, checked: boolean) => {
    setValues((current) => {
      const next = checked
        ? Array.from(new Set([...(current.amenity_ids ?? []), id]))
        : (current.amenity_ids ?? []).filter((item) => item !== id)
      return { ...current, amenity_ids: next }
    })
  }

  const [newRule, setNewRule] = useState("")

  const addRule = () => {
    const trimmed = newRule.trim()
    if (!trimmed) return
    setValues((current) => ({
      ...current,
      rules: [...(current.rules ?? []), trimmed],
    }))
    setNewRule("")
  }

  const removeRule = (index: number) => {
    setValues((current) => ({
      ...current,
      rules: (current.rules ?? []).filter((_, i) => i !== index),
    }))
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-[#c4c7c8] bg-white"
    >
      <div className="border-b border-[#e5e2e1] px-5 py-4">
        <h3 className="text-xl font-bold text-[#1c1b1b]">
          {cafe ? "Cập nhật cơ sở" : "Thêm cơ sở"}
        </h3>
        {/* <p className="mt-1 text-sm font-medium text-[#444748]">Quản lý dữ liệu cơ sở trực tiếp trên trang, không dùng popup.</p> */}
      </div>

      <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              label="Tên cơ sở"
              tooltip="Tên hiển thị trên trang khám phá và trang đặt lịch của cơ sở"
              value={values.name}
              onChange={(value) => setField("name", value)}
              required
              minLength={2}
              maxLength={255}
            />
            <TextField
              label="Số điện thoại"
              tooltip="Số liên lạc hiển thị cho khách hàng khi xem trang chi tiết cơ sở"
              value={values.phone ?? ""}
              onChange={(value) => setField("phone", value)}
              minLength={9}
              maxLength={20}
            />

            <label className="block space-y-2">
              <span className="flex items-center gap-1.5 text-sm font-bold text-[#1c1b1b]">
                Tỉnh / Thành phố
                {loadingProvinces && (
                  <Loader2 className="size-3 animate-spin text-[#747878]" />
                )}
              </span>
              <select
                required
                value={values.city}
                onChange={(e) => {
                  const name = e.target.value
                  const province = provinces.find((p) => p.name === name)
                  setField("city", name)
                  setField("district", "")
                  setProvinceCode(province?.code ?? null)
                }}
                className="w-full rounded-lg border border-[#c4c7c8] bg-white px-3 py-2 text-sm font-semibold text-[#1c1b1b] outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-200 disabled:opacity-50"
                disabled={loadingProvinces}
              >
                <option value="">— Chọn tỉnh/thành —</option>
                {/* Preserve existing value if not in list (old data) */}
                {values.city &&
                  !provinces.some((p) => p.name === values.city) && (
                    <option value={values.city}>{values.city}</option>
                  )}
                {provinces.map((p) => (
                  <option key={p.code} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-2">
              <span className="flex items-center gap-1.5 text-sm font-bold text-[#1c1b1b]">
                Phường / Xã
                {loadingWards && (
                  <Loader2 className="size-3 animate-spin text-[#747878]" />
                )}
              </span>
              <select
                required
                value={values.district}
                onChange={(e) => setField("district", e.target.value)}
                disabled={!provinceCode || loadingWards}
                className="w-full rounded-lg border border-[#c4c7c8] bg-white px-3 py-2 text-sm font-semibold text-[#1c1b1b] outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-200 disabled:opacity-50"
              >
                <option value="">— Chọn phường/xã —</option>
                {/* Preserve existing value if not in list (old data) */}
                {values.district &&
                  !wards.some((w) => w.name === values.district) && (
                    <option value={values.district}>{values.district}</option>
                  )}
                {wards.map((w) => (
                  <option key={w.code} value={w.name}>
                    {w.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <TextField
            label="Địa chỉ cụ thể"
            tooltip="Số nhà, tên đường (VD: 277B Cách Mạng Tháng 8). Hiển thị trên trang chi tiết và dùng để điều hướng bản đồ"
            value={values.address}
            onChange={(value) => setField("address", value)}
            required
          />

          <label className="block space-y-2">
            <FieldLabel tooltip="Giới thiệu đường đua, tiện ích, quy định — hiển thị nổi bật trên trang chi tiết cơ sở">
              Mô tả
            </FieldLabel>
            <Textarea
              value={values.description ?? ""}
              onChange={(event) => setField("description", event.target.value)}
              className="min-h-24 rounded-lg border-[#c4c7c8]"
              placeholder="Mô tả đường đua, tiện ích, quy định cơ sở..."
            />
          </label>

          <div className="rounded-lg border border-[#e5e2e1] p-3">
            <div className="mb-2 text-sm font-bold text-[#1c1b1b]">
              Vị trí địa lý
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1 rounded-lg border border-[#c4c7c8] bg-[#f6f3f2] px-3 py-2 text-sm font-semibold text-[#444748]">
                {values.latitude != null && values.longitude != null ? (
                  `${Number(values.latitude).toFixed(7)}, ${Number(values.longitude).toFixed(7)}`
                ) : (
                  <span className="text-[#747878]">Chưa chọn vị trí</span>
                )}
              </div>
              <Button
                type="button"
                variant="outline"
                className="h-9 gap-2 rounded-lg border-[#c4c7c8] text-sm font-bold"
                onClick={() => setMapOpen(true)}
              >
                <MapPin className="size-4 text-orange-600" />
                Chọn trên bản đồ
              </Button>
            </div>
          </div>

          <LocationPickerDialog
            open={mapOpen}
            onOpenChange={setMapOpen}
            initialLat={values.latitude}
            initialLng={values.longitude}
            onConfirm={(lat, lng) => {
              setField("latitude", lat)
              setField("longitude", lng)
            }}
          />

          <div className="rounded-lg border border-[#e5e2e1] p-3">
            <div className="mb-3">
              <FieldLabel tooltip="Loại đường đua cơ sở hỗ trợ. Ảnh hưởng đến bộ lọc tìm kiếm — khách có thể lọc cơ sở theo loại track mong muốn">
                Loại track
              </FieldLabel>
            </div>
            {loadingTrackTypes ? (
              <div className="flex items-center gap-2 text-sm text-[#747878] font-semibold">
                <Loader2 className="size-4 animate-spin" /> Đang tải danh sách
                track...
              </div>
            ) : trackTypes.length === 0 ? (
              <span className="text-xs text-[#747878]">
                Chưa có dữ liệu loại track.
              </span>
            ) : (
              <div className="flex flex-wrap gap-3">
                {trackTypes.map((item) => (
                  <Label
                    key={item.id}
                    className="rounded-lg border border-[#e5e2e1] px-3 py-2 cursor-pointer hover:bg-[#f6f3f2]"
                  >
                    <Checkbox
                      checked={values.track_types.includes(item.id)}
                      onCheckedChange={(checked) =>
                        toggleTrack(item.id, checked === true)
                      }
                    />
                    <span className="font-semibold">{item.name}</span>
                  </Label>
                ))}
              </div>
            )}
          </div>

          {amenityCatalog.length > 0 && (
            <div className="rounded-lg border border-[#e5e2e1] p-3">
              <div className="mb-3">
                <FieldLabel tooltip="Trang thiết bị và tiện ích cơ sở hỗ trợ. Admin cấu hình danh sách — bạn chọn những gì cơ sở này có">
                  Trang thiết bị & Tiện ích
                </FieldLabel>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {amenityCatalog.map((item) => (
                  <Label
                    key={item.id}
                    className="rounded-lg border border-[#e5e2e1] px-3 py-2 cursor-pointer hover:bg-[#f6f3f2]"
                  >
                    <Checkbox
                      checked={(values.amenity_ids ?? []).includes(item.id)}
                      onCheckedChange={(checked) =>
                        toggleAmenity(item.id, checked === true)
                      }
                    />
                    <span className="font-semibold">{item.title}</span>
                    {item.description && (
                      <span className="ml-1 text-[#747878] text-xs font-normal">
                        — {item.description}
                      </span>
                    )}
                  </Label>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-lg border border-[#e5e2e1] p-3">
            <div className="mb-3">
              <FieldLabel tooltip="Nội quy cơ sở hiển thị cho khách trước khi đặt lịch. Mỗi dòng là một quy định riêng">
                Quy định cơ sở
              </FieldLabel>
            </div>
            <div className="space-y-2">
              {(values.rules ?? []).map((rule, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 rounded-lg border border-[#e5e2e1] bg-[#f6f3f2] px-3 py-2"
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-[#e5e2e1] text-[10px] font-bold text-[#444748]">
                    {index + 1}
                  </span>
                  <span className="flex-1 text-sm text-[#1c1b1b]">{rule}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => removeRule(index)}
                    className="text-red-500 hover:bg-red-50 hover:text-red-700"
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              ))}
              <div className="flex gap-2">
                <Input
                  value={newRule}
                  onChange={(e) => setNewRule(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      addRule()
                    }
                  }}
                  placeholder="Thêm quy định mới..."
                  className="rounded-lg border-[#c4c7c8] text-sm"
                  maxLength={500}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={addRule}
                  disabled={!newRule.trim()}
                  className="h-9 gap-1.5 rounded-lg border-[#c4c7c8] font-bold text-sm"
                >
                  <Plus className="size-4" />
                  Thêm
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <span className="text-sm font-bold text-[#1c1b1b]">
              Giờ hoạt động
            </span>
            <OperatingHoursField
              value={values.operating_hours}
              onChange={(updated) => setField("operating_hours", updated)}
              error={operatingHoursError}
            />
          </div>
        </div>

        <aside className="space-y-4">
          {/* Cover image */}
          <div className="rounded-xl border border-[#e5e2e1] bg-[#fcf8f8] p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-[#1c1b1b]">
              <ImageIcon className="size-4" />
              Ảnh bìa
            </div>
            <p className="mt-1 mb-3 text-xs leading-5 text-[#747878]">
              Ảnh đại diện của cơ sở. Xuất hiện ở thẻ chi nhánh trên trang khám
              phá, ảnh đầu tiên ở trang chi tiết, và trong đơn đặt của khách.
              Ảnh nằm ngang cỡ {BANNER_RECOMMENDED.width}×
              {BANNER_RECOMMENDED.height}
              px cho hình đẹp nhất, nhưng ảnh cỡ nào cũng dùng được.
            </p>

            {coverPreview ? (
              <div className="relative overflow-hidden rounded-lg border border-[#e5e2e1]">
                <img
                  src={coverPreview}
                  alt="Ảnh bìa"
                  className="h-36 w-full object-cover"
                  onError={(e) => {
                    ;(e.target as HTMLImageElement).style.display = "none"
                  }}
                />
                {coverFile && (
                  <div className="absolute bottom-1.5 left-1.5 rounded bg-orange-600 px-2 py-0.5 text-[10px] font-bold text-white">
                    Ảnh mới
                  </div>
                )}
              </div>
            ) : (
              <div className="flex h-36 items-center justify-center rounded-lg border border-dashed border-[#c4c7c8] bg-white">
                <span className="text-xs font-medium text-[#747878]">
                  Chưa có ảnh bìa
                </span>
              </div>
            )}

            <label className="mt-3 block cursor-pointer rounded-lg border border-dashed border-[#c4c7c8] bg-white p-3 text-center text-sm font-semibold text-[#444748] hover:bg-[#f6f3f2]">
              {uploadingCover
                ? "Đang tải ảnh bìa..."
                : coverFile
                  ? coverFile.name
                  : "Tải ảnh bìa lên"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                disabled={uploadingCover}
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  event.target.value = ""
                  if (!file) return setCoverFile(null)
                  void acceptImage(file).then(async (ok) => {
                    if (!ok) return
                    if (!onUploadCover) {
                      setCoverFile(file)
                      return
                    }
                    setUploadingCover(true)
                    try {
                      await onUploadCover(file)
                      // Ảnh đã nằm trên máy chủ; giữ file trong state nữa chỉ
                      // khiến lượt lưu sau tải lên lần hai.
                      setCoverFile(null)
                    } finally {
                      setUploadingCover(false)
                    }
                  })
                }}
              />
            </label>
          </div>

          {/* Gallery */}
          <div className="rounded-xl border border-[#e5e2e1] bg-[#fcf8f8] p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-[#1c1b1b]">
              <ImagePlus className="size-4" />
              Ảnh gallery
            </div>
            <p className="mt-1 mb-3 text-xs leading-5 text-[#747878]">
              Bộ ảnh khách xem khi bấm vào chi nhánh — không gian quán, đường
              đua, khu pit. Chọn được nhiều ảnh cùng lúc. Ảnh bìa vẫn luôn đứng
              đầu, nên đừng tải lại ảnh bìa vào đây.
            </p>
            <label className="block cursor-pointer rounded-lg border border-dashed border-[#c4c7c8] bg-white p-4 text-center text-sm font-semibold text-[#444748] hover:bg-[#f6f3f2]">
              {uploadingGallery ? "Đang tải ảnh lên..." : selectedFileLabel}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="sr-only"
                disabled={uploadingGallery}
                onChange={(event) => {
                  const picked = Array.from(event.target.files ?? [])
                  event.target.value = ""
                  void Promise.all(picked.map(acceptImage)).then(
                    async (results) => {
                      const accepted = picked.filter(
                        (_, index) => results[index],
                      )
                      if (!accepted.length) return
                      if (!onUploadGallery) {
                        setFiles(accepted)
                        return
                      }
                      setUploadingGallery(true)
                      try {
                        await onUploadGallery(accepted)
                        setFiles([])
                      } finally {
                        setUploadingGallery(false)
                      }
                    },
                  )
                }}
              />
            </label>
            {cafe ? (
              <div className="mt-4 space-y-2">
                <div className="text-xs font-bold uppercase tracking-wide text-[#747878]">
                  Ảnh hiện tại
                </div>
                {loadingImages ? (
                  <div className="h-24 animate-pulse rounded-lg bg-[#e5e2e1]" />
                ) : images.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-[#c4c7c8] p-3 text-xs font-medium text-[#747878]">
                    Chưa có ảnh gallery.
                  </div>
                ) : (
                  /* Lưới thumbnail thay cho danh sách URL thô: đường dẫn
                     Cloudinary không nói cho chủ quán biết đó là ảnh nào. */
                  <div className="grid grid-cols-3 gap-2">
                    {images.map((image, index) => (
                      <div
                        key={image.id}
                        className="group relative aspect-square overflow-hidden rounded-lg border border-[#e5e2e1] bg-white"
                      >
                        <img
                          src={sanitizeImageUrl(image.url)!}
                          alt={`Ảnh gallery ${index + 1}`}
                          className="h-full w-full object-cover"
                        />
                        {onDeleteImage ? (
                          <button
                            type="button"
                            aria-label={`Xoá ảnh ${index + 1}`}
                            onClick={() => void onDeleteImage(image)}
                            className="absolute right-1 top-1 rounded-md bg-white/90 p-1 text-red-600 opacity-0 shadow-sm transition group-hover:opacity-100 focus-visible:opacity-100"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        ) : null}
                      </div>
                    ))}
                  </div>
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

      <div className="flex flex-wrap justify-end gap-3 border-t border-[#e5e2e1] px-5 py-4">
        {onCancel ? (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isPending}
            className="font-bold"
          >
            Hủy
          </Button>
        ) : null}
        <Button
          type="submit"
          disabled={
            isPending ||
            values.track_types.length === 0 ||
            !hasValidCoordinates ||
            !!operatingHoursError ||
            (cafe !== null && !isDirty)
          }
          className="bg-[#1c1b1b] text-white hover:bg-[#313030] font-bold"
        >
          {isPending
            ? "Đang lưu..."
            : (submitLabel ?? (cafe ? "Lưu thay đổi" : "Tạo cơ sở"))}
        </Button>
      </div>
    </form>
  )
}

function OperatingHoursField({
  value,
  onChange,
  error,
}: {
  value: CafeOperatingHours
  onChange: (updated: CafeOperatingHours) => void
  error: string | null
}) {
  const setDay = (day: string, patch: Partial<CafeOperatingHour>) => {
    onChange({ ...value, [day]: { ...value[day], ...patch } })
  }

  return (
    <div className="overflow-hidden rounded-lg border border-[#e5e2e1]">
      <div className="grid grid-cols-[100px_1fr_1fr_40px] gap-0 border-b border-[#e5e2e1] bg-[#f6f3f2] px-3 py-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-[#747878]">
          Ngày
        </span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-[#747878]">
          Mở cửa
        </span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-[#747878]">
          Đóng cửa
        </span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-[#747878]">
          Nghỉ
        </span>
      </div>
      {dayKeys.map((day) => {
        const h = value[day] ?? {
          open: "09:00",
          close: "22:00",
          is_closed: false,
        }
        const isClosed = h.is_closed ?? false
        return (
          <div
            key={day}
            className={cn(
              "grid grid-cols-[100px_1fr_1fr_40px] items-center gap-3 border-b border-[#e5e2e1] px-3 py-2 last:border-0 hover:bg-[#fcf8f8]",
              isClosed && "opacity-50",
            )}
          >
            <span className="text-sm font-semibold text-[#1c1b1b]">
              {dayLabels[day]}
            </span>
            <Input
              type="text"
              inputMode="numeric"
              placeholder="HH:mm"
              pattern={openingTimeInputPattern}
              maxLength={5}
              value={h.open ?? "09:00"}
              disabled={isClosed}
              onChange={(e) => setDay(day, { open: e.target.value })}
              onBlur={(e) =>
                setDay(day, { open: normalizeOperatingTime(e.target.value) })
              }
              aria-invalid={!isClosed && !isValidOpeningTime(h.open)}
              className="h-8 rounded-lg border-[#c4c7c8] text-sm"
            />
            <Input
              type="text"
              inputMode="numeric"
              placeholder="HH:mm"
              pattern={closingTimeInputPattern}
              maxLength={5}
              value={h.close ?? "22:00"}
              disabled={isClosed}
              onChange={(e) => setDay(day, { close: e.target.value })}
              onBlur={(e) =>
                setDay(day, { close: normalizeOperatingTime(e.target.value) })
              }
              aria-invalid={!isClosed && !isValidClosingTime(h.close)}
              className="h-8 rounded-lg border-[#c4c7c8] text-sm"
            />
            <Checkbox
              checked={isClosed}
              onCheckedChange={(checked) =>
                setDay(day, { is_closed: checked === true })
              }
              title="Đóng cửa ngày này"
            />
          </div>
        )
      })}
      <div className="border-t border-[#e5e2e1] bg-[#fcf8f8] px-3 py-2">
        <p className="text-xs text-[#5d5f5f]">
          Nhập theo định dạng HH:mm. Giờ đóng có thể là <strong>24:00</strong>{" "}
          để biểu thị nửa đêm ngày kế tiếp.
        </p>
        {error ? (
          <p role="alert" className="mt-1 text-xs font-semibold text-red-600">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  )
}

function TooltipIcon({ text }: { text: string }) {
  return (
    <span className="group relative cursor-help">
      <Info className="size-3.5 text-[#9ca3af] group-hover:text-[#6b7280]" />
      <span className="pointer-events-none absolute left-0 top-full z-50 mt-1.5 w-56 rounded-lg border border-[#e5e2e1] bg-white px-3 py-2 text-xs font-normal leading-relaxed text-[#444748] opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100">
        {text}
      </span>
    </span>
  )
}

function FieldLabel({
  children,
  tooltip,
}: {
  children: React.ReactNode
  tooltip?: string
}) {
  return (
    <span className="flex items-center gap-1.5 text-sm font-bold text-[#1c1b1b]">
      {children}
      {tooltip && <TooltipIcon text={tooltip} />}
    </span>
  )
}

function TextField({
  label,
  tooltip,
  value,
  onChange,
  type = "text",
  required = false,
  minLength,
  maxLength,
}: {
  label: string
  tooltip?: string
  value: string
  onChange: (value: string) => void
  type?: string
  required?: boolean
  minLength?: number
  maxLength?: number
}) {
  return (
    <label className="block space-y-2">
      <FieldLabel tooltip={tooltip}>{label}</FieldLabel>
      <Input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        minLength={minLength}
        maxLength={maxLength}
        className="rounded-lg border-[#c4c7c8]"
      />
    </label>
  )
}
