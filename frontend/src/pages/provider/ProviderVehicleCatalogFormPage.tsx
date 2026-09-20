import { useState, useEffect, type FormEvent } from "react"
import { useParams, useNavigate, useSearchParams, Link } from "react-router"
import { useQuery } from "@tanstack/react-query"
import {
  ArrowLeft,
  ArrowRight,
  ImagePlus,
  Save,
  Car,
  AlertTriangle,
  Star,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"

import { uploadImage } from "@/features/uploads/api/upload.api"
import {
  cafeApi,
  cafeQueryKeys,
  trackTypeApi,
  trackTypeQueryKeys,
} from "@/features/cafes/api/cafe.api"
import { useVehicleCatalogDetail } from "@/features/vehicles/hooks/useVehicleCatalogs"
import {
  useCreateVehicleCatalog,
  useUpdateVehicleCatalog,
} from "@/features/vehicles/hooks/useVehicleCatalogMutations"
import { VehicleTier } from "@/features/vehicles/types"
import type {
  CreateVehicleCatalogDto,
  UpdateVehicleCatalogDto,
} from "@/features/vehicles/types"
import { ProviderPageHeader } from "@/pages/provider/components/ProviderPrimitives"
import { ProviderShell } from "@/pages/provider/components/ProviderShell"
import { cn, sanitizeImageUrl } from "@/shared/lib/utils"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Label } from "@/shared/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select"
import { Checkbox } from "@/shared/ui/checkbox"

export function ProviderVehicleCatalogFormPage() {
  const { catalogId } = useParams()
  const isEdit = !!catalogId

  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const urlCafeId = searchParams.get("cafeId") || ""

  const [uploading, setUploading] = useState(false)

  // Fetch managed cafes to select active cafe if none provided in search param
  const { data: cafesData, isLoading: isCafesLoading } = useQuery({
    queryKey: cafeQueryKeys.list({ page: 1, limit: 100, scope: "managed" }),
    queryFn: () => cafeApi.listCafes({ page: 1, limit: 100, scope: "managed" }),
  })
  const cafes = cafesData?.data ?? []
  const selectedCafeId = urlCafeId || cafes[0]?.id || ""

  // Fetch catalog details if in edit mode
  const { data: catalog, isLoading: isCatalogLoading } =
    useVehicleCatalogDetail(selectedCafeId, catalogId || "")

  const { data: trackTypes = [], isLoading: loadingTrackTypes } = useQuery({
    queryKey: trackTypeQueryKeys.all,
    queryFn: () => trackTypeApi.listAll(),
    staleTime: Infinity,
  })

  // Mutations
  const createCatalogMutation = useCreateVehicleCatalog(selectedCafeId)
  const updateCatalogMutation = useUpdateVehicleCatalog(
    selectedCafeId,
    catalogId || "",
  )

  // Form states
  const [formName, setFormName] = useState("")
  const [formTier, setFormTier] = useState<VehicleTier>(VehicleTier.STANDARD)
  const [formHourlyRate, setFormHourlyRate] = useState<number>(20000)
  const [formImages, setFormImages] = useState<string[]>([])
  const [manualUrl, setManualUrl] = useState("")
  const [formTracks, setFormTracks] = useState<string[]>([])

  // Pre-populate fields in edit mode
  useEffect(() => {
    if (isEdit && catalog) {
      queueMicrotask(() => {
        setFormName(catalog.name)
        setFormTier(catalog.tier)
        setFormHourlyRate(catalog.hourlyRate)
        if (catalog.images && catalog.images.length > 0) {
          setFormImages(catalog.images.map((img) => img.url))
        } else if (catalog.coverImageUrl) {
          setFormImages([catalog.coverImageUrl])
        } else {
          setFormImages([])
        }
        setFormTracks(
          (catalog.compatibleTrackTypes || []).map((trackType) =>
            typeof trackType === "string" ? trackType : trackType.id,
          ),
        )
      })
    }
  }, [isEdit, catalog])

  const MAX_IMAGES = 8

  const handleUploadMultiple = async (files: FileList | null) => {
    if (!files || files.length === 0) return

    const currentCount = formImages.length
    if (currentCount >= MAX_IMAGES) {
      toast.error(`Album đã đạt giới hạn tối đa ${MAX_IMAGES} ảnh.`)
      return
    }

    const availableSlots = MAX_IMAGES - currentCount
    const filesToUpload = Array.from(files).slice(0, availableSlots)

    if (files.length > availableSlots) {
      toast.warning(
        `Chỉ có thể tải thêm ${availableSlots} ảnh để không vượt quá giới hạn ${MAX_IMAGES} ảnh.`,
      )
    }

    setUploading(true)
    let successCount = 0
    let failCount = 0

    try {
      const promises = filesToUpload.map(async (file) => {
        try {
          const uploaded = await uploadImage(file, "vehicles")
          return uploaded.url
        } catch {
          failCount++
          return null
        }
      })

      const results = await Promise.all(promises)
      const validUrls = results.filter((url): url is string => url !== null)

      if (validUrls.length > 0) {
        await applyImages([...formImages, ...validUrls])
        successCount = validUrls.length
      }

      if (successCount > 0 && failCount > 0) {
        toast.warning(
          `Tải lên thành công ${successCount} ảnh, thất bại ${failCount} ảnh.`,
        )
      } else if (successCount > 0) {
        toast.success(`Tải lên thành công ${successCount} ảnh!`)
      } else if (failCount > 0) {
        toast.error("Không thể tải ảnh lên, vui lòng thử lại.")
      }
    } catch {
      toast.error("Đã xảy ra lỗi khi tải ảnh.")
    } finally {
      setUploading(false)
    }
  }

  const handleAddManualUrl = () => {
    if (manualUrl.trim()) {
      if (formImages.length >= MAX_IMAGES) {
        toast.error(`Album đã đạt giới hạn tối đa ${MAX_IMAGES} ảnh.`)
        return
      }
      void applyImages([...formImages, manualUrl.trim()])
      setManualUrl("")
      toast.success("Đã thêm ảnh vào album!")
    }
  }

  /**
   * Mọi thay đổi về album ảnh đi qua đây.
   *
   * Danh mục đang sửa thì ghi thẳng vào máy chủ; thêm ảnh lưu ngay mà xoá ảnh
   * lại phải bấm "Cập nhật" là kiểu nửa vời khó đoán nhất cho người dùng.
   */
  const applyImages = async (nextImages: string[]) => {
    setFormImages(nextImages)
    if (!isEdit) return
    try {
      await updateCatalogMutation.mutateAsync({
        images: nextImages.map((url, index) => ({ url, isCover: index === 0 })),
      } as UpdateVehicleCatalogDto)
    } catch {
      toast.error("Chưa lưu được thay đổi ảnh vào danh mục")
    }
  }

  const handleMoveImage = (index: number, direction: "left" | "right") => {
    const copy = [...formImages]
    const targetIndex = direction === "left" ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= copy.length) return
    const temp = copy[index]
    copy[index] = copy[targetIndex]
    copy[targetIndex] = temp
    void applyImages(copy)
  }

  const handleSetCover = (index: number) => {
    const copy = [...formImages]
    const [item] = copy.splice(index, 1)
    void applyImages([item, ...copy])
  }

  const handleRemoveImage = (index: number) => {
    void applyImages(formImages.filter((_, i) => i !== index))
  }

  const handleTrackChange = (trackId: string, checked: boolean) => {
    if (checked) {
      if (!formTracks.includes(trackId)) {
        setFormTracks([...formTracks, trackId])
      }
    } else {
      setFormTracks(formTracks.filter((t) => t !== trackId))
    }
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!selectedCafeId) {
      toast.error("Không tìm thấy ID cơ sở hoạt động. Vui lòng thử lại.")
      return
    }
    if (!formName.trim()) {
      toast.error("Vui lòng điền tên danh mục")
      return
    }
    if (formTracks.length === 0) {
      toast.error("Vui lòng chọn ít nhất một loại đường chạy tương thích")
      return
    }

    const payload = {
      name: formName.trim(),
      tier: formTier,
      hourlyRate: Number(formHourlyRate),
      securityDeposit: 0,
      compatibleTrackTypes: formTracks,
      images: formImages.map((url, idx) => ({ url, isCover: idx === 0 })),
    }

    try {
      if (isEdit) {
        await updateCatalogMutation.mutateAsync(
          payload as UpdateVehicleCatalogDto,
        )
      } else {
        await createCatalogMutation.mutateAsync(
          payload as CreateVehicleCatalogDto,
        )
      }
      // Navigate back to catalogs view with active cafe pre-selected
      navigate(`/provider/cafes/${selectedCafeId}?tab=catalogs`)
    } catch {
      // toast is shown in mutation error handlers
    }
  }

  const isFormLoading = isCafesLoading || (isEdit && isCatalogLoading)

  return (
    <ProviderShell>
      <ProviderPageHeader
        title={isEdit ? "Chỉnh sửa danh mục" : "Thêm danh mục mới"}
        description={
          isEdit
            ? "Cập nhật thông số và hình ảnh của danh mục xe."
            : "Tạo cấu hình danh mục phương tiện mới."
        }
      />

      <div className="w-full space-y-6 p-4 md:p-6">
        {/* Back Button */}
        <div>
          <Link
            to={`/provider/cafes/${selectedCafeId}?tab=catalogs`}
            className="inline-flex items-center gap-1.5 text-sm font-bold text-[#747878] hover:text-[#1c1b1b] transition-colors"
          >
            <ArrowLeft className="size-4" />
            Quay lại danh sách danh mục
          </Link>
        </div>

        {isFormLoading ? (
          <div className="rounded-xl border border-[#c4c7c8] bg-white p-6 shadow-sm space-y-6">
            <div className="h-6 w-1/4 animate-pulse rounded bg-gray-100" />
            <div className="grid gap-6 md:grid-cols-2">
              <div className="h-10 animate-pulse rounded bg-gray-100" />
              <div className="h-10 animate-pulse rounded bg-gray-100" />
              <div className="h-10 animate-pulse rounded bg-gray-100" />
              <div className="h-10 animate-pulse rounded bg-gray-100" />
            </div>
            <div className="h-28 animate-pulse rounded bg-gray-100" />
            <div className="h-10 w-32 animate-pulse rounded bg-gray-100" />
          </div>
        ) : !selectedCafeId ? (
          <div className="flex min-h-[300px] flex-col items-center justify-center rounded-xl border border-dashed border-[#c4c7c8] bg-white p-8 text-center shadow-sm">
            <div className="flex size-14 items-center justify-center rounded-full bg-[#f6f3f2] text-[#747878] mb-4">
              <AlertTriangle className="size-7" />
            </div>
            <h3 className="text-lg font-bold text-[#1c1b1b] mb-1">
              Thiếu cơ sở hoạt động
            </h3>
            <p className="text-sm font-semibold text-[#444748] max-w-sm">
              Bạn cần chọn hoặc sở hữu ít nhất một cơ sở để thực hiện thao tác
              này.
            </p>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="rounded-xl border border-[#c4c7c8] bg-white p-6 shadow-sm space-y-6"
          >
            <div className="border-b border-[#e5e2e1] pb-4">
              <h3 className="text-lg font-bold text-[#1c1b1b] flex items-center gap-2">
                <Car className="size-5 text-orange-600" />
                Cấu hình thông số danh mục
              </h3>
              <p className="text-xs text-[#747878] mt-1 font-semibold">
                Điền đầy đủ thông tin để định cấu hình đơn giá và tính tương
                thích của dòng xe RC này.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="form-name"
                className="text-sm font-bold text-[#1c1b1b]"
              >
                Tên danh mục <span className="text-red-500">*</span>
              </Label>
              <Input
                id="form-name"
                placeholder="Ví dụ: Schumacher Cat K1 Aero"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                required
                className="h-10 rounded-lg border-[#c4c7c8]"
              />
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              {/* Vehicle Tier Select */}
              <div className="space-y-1.5">
                <Label
                  htmlFor="form-tier"
                  className="text-sm font-bold text-[#1c1b1b]"
                >
                  Hạng xe
                </Label>
                <Select
                  key={formTier}
                  value={formTier}
                  onValueChange={(val) => setFormTier(val as VehicleTier)}
                >
                  <SelectTrigger
                    id="form-tier"
                    className="h-10 w-full rounded-lg border-[#c4c7c8] bg-white font-semibold"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={VehicleTier.STANDARD}>
                      Phổ thông
                    </SelectItem>
                    <SelectItem value={VehicleTier.PREMIUM}>Cao cấp</SelectItem>
                    <SelectItem value={VehicleTier.RESTRICTED}>
                      Hạn chế
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              {/* Hourly Rate */}
              <div className="space-y-1.5">
                <Label
                  htmlFor="form-rate"
                  className="text-sm font-bold text-[#1c1b1b]"
                >
                  Giá thuê giờ (VND) <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="form-rate"
                  type="number"
                  min="0"
                  value={formHourlyRate}
                  onChange={(e) => setFormHourlyRate(Number(e.target.value))}
                  required
                  className="h-10 rounded-lg border-[#c4c7c8] font-semibold"
                />
              </div>
            </div>

            {/* Album Ảnh Dòng Xe */}
            <div className="space-y-4 rounded-lg border border-[#e5e2e1] bg-[#fcf8f8] p-4">
              <div>
                <Label className="text-sm font-bold text-[#1c1b1b]">
                  Album hình ảnh mẫu xe ({formImages.length}/{MAX_IMAGES})
                </Label>
                <p className="text-xs text-[#747878] font-semibold mt-0.5">
                  Tải lên nhiều hình ảnh của dòng xe này. Ảnh đầu tiên (thứ tự
                  1) sẽ làm ảnh bìa đại diện. Tối đa {MAX_IMAGES} ảnh.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
                <div className="flex gap-2">
                  <Input
                    placeholder="Nhập link ảnh thủ công..."
                    value={manualUrl}
                    onChange={(e) => setManualUrl(e.target.value)}
                    className="h-10 rounded-lg border-[#c4c7c8] bg-white flex-1"
                    disabled={formImages.length >= MAX_IMAGES}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleAddManualUrl}
                    className="h-10 rounded-lg border-[#c4c7c8] font-bold shrink-0 bg-white"
                    disabled={formImages.length >= MAX_IMAGES}
                  >
                    Thêm link
                  </Button>
                </div>
                {formImages.length < MAX_IMAGES ? (
                  <label className="block cursor-pointer rounded-lg border border-dashed border-[#c4c7c8] bg-white px-4 py-2 text-center text-xs font-semibold text-[#444748] hover:bg-[#f6f3f2] h-10 flex items-center justify-center">
                    <span className="flex items-center justify-center gap-1.5">
                      <ImagePlus className="size-4 text-orange-600" />
                      {uploading ? "Đang tải..." : "Tải nhiều ảnh lên"}
                    </span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      multiple
                      disabled={uploading}
                      className="sr-only"
                      onChange={(event) =>
                        void handleUploadMultiple(event.target.files)
                      }
                    />
                  </label>
                ) : (
                  <div className="h-10 px-4 flex items-center justify-center rounded-lg border border-zinc-200 bg-zinc-100 text-xs font-semibold text-zinc-400 select-none">
                    Album đã đầy ({MAX_IMAGES}/{MAX_IMAGES})
                  </div>
                )}
              </div>

              {formImages.length > 0 ? (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 pt-2">
                  {formImages.map((url, idx) => {
                    const isCover = idx === 0
                    return (
                      <div
                        key={idx}
                        className={cn(
                          "group relative flex flex-col overflow-hidden rounded-xl border bg-white shadow-sm transition-all duration-200",
                          isCover
                            ? "border-orange-500 ring-2 ring-orange-500/20"
                            : "border-zinc-200",
                        )}
                      >
                        <div className="relative aspect-video w-full overflow-hidden bg-zinc-100">
                          <img
                            src={sanitizeImageUrl(url)!}
                            alt=""
                            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                          />

                          {/* Position Badge */}
                          <span className="absolute right-2 top-2 flex size-5 items-center justify-center rounded-full bg-black/60 text-[10px] font-bold text-white shadow-sm">
                            {idx + 1}
                          </span>

                          {/* Cover Badge */}
                          {isCover ? (
                            <span className="absolute left-2 top-2 flex items-center gap-0.5 rounded-full bg-orange-600 px-2 py-0.5 text-[9px] font-extrabold text-white shadow-sm">
                              <Star className="size-2.5 fill-white animate-pulse" />
                              Ảnh bìa
                            </span>
                          ) : null}
                        </div>

                        {/* Control Actions Footer */}
                        <div className="flex items-center justify-between border-t border-zinc-100 bg-zinc-50/50 p-1.5">
                          <div className="flex items-center gap-0.5">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              disabled={idx === 0}
                              onClick={() => handleMoveImage(idx, "left")}
                              className="text-zinc-500 hover:bg-zinc-200/60 hover:text-zinc-800 disabled:opacity-30"
                              title="Di chuyển sang trái"
                            >
                              <ArrowLeft className="size-3.5" />
                            </Button>

                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              disabled={isCover}
                              onClick={() => handleSetCover(idx)}
                              className={cn(
                                "text-zinc-500 hover:bg-zinc-200/60 hover:text-zinc-800",
                                isCover &&
                                  "text-orange-600 hover:bg-orange-50 hover:text-orange-700",
                              )}
                              title="Đặt làm ảnh bìa"
                            >
                              <Star
                                className={cn(
                                  "size-3.5",
                                  isCover && "fill-orange-600 text-orange-600",
                                )}
                              />
                            </Button>

                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              disabled={idx === formImages.length - 1}
                              onClick={() => handleMoveImage(idx, "right")}
                              className="text-zinc-500 hover:bg-zinc-200/60 hover:text-zinc-800 disabled:opacity-30"
                              title="Di chuyển sang phải"
                            >
                              <ArrowRight className="size-3.5" />
                            </Button>
                          </div>

                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleRemoveImage(idx)}
                            className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                            title="Xóa ảnh"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </div>
                    )
                  })}

                  {/* Integrated Upload Card Placeholder */}
                  {formImages.length < MAX_IMAGES && (
                    <label
                      className={cn(
                        "group relative aspect-video flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-[#c4c7c8] hover:border-orange-500 bg-white hover:bg-orange-50/20 transition-all duration-200 cursor-pointer shadow-xs",
                        uploading && "pointer-events-none opacity-50",
                      )}
                    >
                      <ImagePlus className="size-6 text-zinc-400 group-hover:text-orange-600 transition-colors" />
                      <span className="text-[10px] font-bold text-zinc-500 group-hover:text-orange-600 mt-1 transition-colors">
                        Thêm ảnh ({formImages.length}/{MAX_IMAGES})
                      </span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        multiple
                        disabled={uploading}
                        className="sr-only"
                        onChange={(e) =>
                          void handleUploadMultiple(e.target.files)
                        }
                      />
                    </label>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 border border-dashed border-[#c4c7c8] rounded-xl bg-white/50">
                  <p className="text-xs text-[#747878] font-bold">
                    Chưa có ảnh nào trong album mẫu xe này.
                  </p>
                </div>
              )}
            </div>

            {/* Compatible Track Types */}
            <div className="space-y-2">
              <Label className="text-sm font-bold text-[#1c1b1b] block">
                Đường chạy tương thích <span className="text-red-500">*</span>
              </Label>
              <div className="grid grid-cols-2 gap-3 border border-[#c4c7c8] rounded-lg p-4 bg-gray-50 max-h-48 overflow-y-auto">
                {loadingTrackTypes ? (
                  <span className="text-xs text-[#747878] font-semibold">
                    Đang tải danh sách track...
                  </span>
                ) : trackTypes.length === 0 ? (
                  <span className="text-xs text-[#747878]">
                    Không tìm thấy dữ liệu đường chạy.
                  </span>
                ) : (
                  trackTypes.map((track) => (
                    <div key={track.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`form-track-${track.id}`}
                        checked={formTracks.includes(track.id)}
                        onCheckedChange={(checked) =>
                          handleTrackChange(track.id, !!checked)
                        }
                      />
                      <label
                        htmlFor={`form-track-${track.id}`}
                        className="text-xs font-semibold text-[#444748] cursor-pointer select-none"
                      >
                        {track.name}
                      </label>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 border-t border-[#e5e2e1] pt-6 mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  navigate(`/provider/cafes/${selectedCafeId}?tab=catalogs`)
                }
                className="h-10 px-6 rounded-lg border-[#c4c7c8] font-bold text-[#1c1b1b] hover:bg-gray-50"
              >
                Hủy
              </Button>
              <Button
                type="submit"
                disabled={
                  uploading ||
                  createCatalogMutation.isPending ||
                  updateCatalogMutation.isPending
                }
                className="h-10 px-6 rounded-lg bg-[#1c1b1b] text-white hover:bg-[#313030] font-bold flex items-center gap-2 shadow-sm"
              >
                <Save className="size-4" />
                {isEdit ? "Cập nhật danh mục" : "Tạo danh mục"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </ProviderShell>
  )
}
