import { useRef, useState } from "react"
import {
  ImagePlus,
  PlusCircle,
  ToggleLeft,
  ToggleRight,
  Upload,
  X,
  Check,
  Pencil,
  Trash2,
  Star,
  ChevronLeft,
  ChevronRight,
  Images,
  Loader2,
} from "lucide-react"
import { trackTypeApi } from "@/features/cafes/api/cafe.api"
import {
  useTrackConfigs,
  useCreateTrackConfig,
  useUpdateTrackConfig,
  useUploadTrackConfigImages,
} from "@/features/cafes/hooks/useTrackConfigs"
import type { TrackConfig, CreateTrackConfigBody, UpdateTrackConfigBody } from "@/features/cafes/types"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Label } from "@/shared/ui/label"
import { Textarea } from "@/shared/ui/textarea"
import { Badge } from "@/shared/ui/badge"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select"
import { useQuery } from "@tanstack/react-query"
import { trackTypeQueryKeys } from "@/features/cafes/api/cafe.api"
import { cn } from "@/shared/lib/utils"

interface TrackConfigManagerProps {
  cafeId: string
}

const EMPTY_FORM = { track_type_id: "", max_concurrent: "5", byoc_capacity: "0", description: "", sort_order: "0" }

export function TrackConfigManager({ cafeId }: TrackConfigManagerProps) {
  // Màn quản lý là nơi duy nhất cần thấy sân đã tắt — không thấy thì không bật
  // lại được.
  const { data: configs = [], isLoading } = useTrackConfigs(cafeId, {
    includeInactive: true,
  })
  const { data: trackTypes = [], isLoading: trackTypesLoading } = useQuery({
    queryKey: trackTypeQueryKeys.all,
    queryFn: () => trackTypeApi.listAll(),
  })

  const createMutation = useCreateTrackConfig(cafeId)
  const updateMutation = useUpdateTrackConfig(cafeId)
  const uploadMutation = useUploadTrackConfigImages(cafeId)

  const [showAddForm, setShowAddForm] = useState(false)
  const [deactivatingConfig, setDeactivatingConfig] = useState<TrackConfig | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const handleCreate = async () => {
    const mc = parseInt(form.max_concurrent, 10) || 0
    const bc = parseInt(form.byoc_capacity, 10) || 0
    if (!form.track_type_id || (mc === 0 && bc === 0)) return
    const body: CreateTrackConfigBody = {
      track_type_id: form.track_type_id,
      max_concurrent: mc,
      byoc_capacity: bc,
      description: form.description.trim() || undefined,
      sort_order: parseInt(form.sort_order, 10) || 0,
    }
    await createMutation.mutateAsync(body)
    setShowAddForm(false)
    setForm(EMPTY_FORM)
  }

  const handleCancelAdd = () => {
    setShowAddForm(false)
    setForm(EMPTY_FORM)
  }

  const handleToggleActive = (config: TrackConfig) => {
    if (config.is_active) {
      setDeactivatingConfig(config)
    } else {
      updateMutation.mutate({ configId: config.id, body: { is_active: true } })
    }
  }

  const handleConfirmDeactivate = () => {
    if (!deactivatingConfig) return
    updateMutation.mutate({ configId: deactivatingConfig.id, body: { is_active: false } })
    setDeactivatingConfig(null)
  }

  const handleUploadImages = async (configId: string, files: File[]) => {
    if (!files.length) return
    try {
      await uploadMutation.mutateAsync({ configId, files })
    } catch {
      // Handled by mutation toast
    }
  }

  const handleReplaceCoverImage = async (configId: string, file: File) => {
    try {
      const config = configs.find((c) => c.id === configId || c.track_type_id === configId)
      // Upload the single file to get url
      const uploadedImages = await uploadMutation.mutateAsync({ configId, files: [file] })
      // If config had other images, ensure the new image is the first cover and previous images follow
      if (config && config.images.length > 0) {
        const newCoverUrl = uploadedImages[0]
        const remainingImages = config.images.filter((img) => img !== newCoverUrl)
        const reordered = [newCoverUrl, ...remainingImages]
        await updateMutation.mutateAsync({ configId, body: { images: reordered }, silent: true })
      }
    } catch {
      // Handled by mutation toast
    }
  }

  const handleSetCover = async (config: TrackConfig, targetIndex: number) => {
    if (targetIndex === 0 || !config.images[targetIndex]) return
    const targetUrl = config.images[targetIndex]
    const updatedImages = [targetUrl, ...config.images.filter((_, idx) => idx !== targetIndex)]
    try {
      await updateMutation.mutateAsync({
        configId: config.id,
        body: { images: updatedImages },
      })
    } catch {
      // Handled by mutation toast
    }
  }

  const handleDeleteImage = async (config: TrackConfig, targetIndex: number) => {
    const updatedImages = config.images.filter((_, idx) => idx !== targetIndex)
    try {
      await updateMutation.mutateAsync({
        configId: config.id,
        body: { images: updatedImages },
        successMessage: "Đã xóa ảnh khỏi loại sân",
      })
    } catch {
      // Handled by mutation toast
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-3 rounded-xl border border-[#c4c7c8] bg-white p-5">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="h-44 animate-pulse rounded-xl bg-[#f6f3f2]" />
        ))}
      </div>
    )
  }

  const usedTrackTypeIds = new Set(configs.map((c) => c.track_type_id))
  const availableTrackTypes = trackTypes.filter((tt) => !usedTrackTypeIds.has(tt.id))

  return (
    <div className="space-y-4 rounded-xl border border-[#c4c7c8] bg-white p-5 shadow-sm">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#f0edec] pb-4">
        <div>
          <h3 className="text-base font-bold text-[#1c1b1b]">Cấu hình loại sân & Đường đua</h3>
          <p className="text-xs text-[#747878] mt-0.5">
            Cấu hình sức chứa (xe thuê, xe riêng), ảnh đại diện và album hình ảnh cho từng loại sân tại cơ sở.
          </p>
        </div>
        {!showAddForm && (
          <Button
            type="button"
            size="sm"
            onClick={() => setShowAddForm(true)}
            disabled={availableTrackTypes.length === 0 && trackTypes.length > 0}
            className="h-9 gap-1.5 rounded-lg font-bold text-xs bg-orange-600 hover:bg-orange-700 text-white shrink-0"
          >
            <PlusCircle className="size-4" />
            Thêm loại sân
          </Button>
        )}
      </div>

      {/* Inline add form */}
      {showAddForm && (
        <div className="rounded-xl border-2 border-orange-300 bg-orange-50/40 p-5 transition-all">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm font-bold text-[#1c1b1b] flex items-center gap-2">
              <PlusCircle className="size-4 text-orange-600" />
              Thêm cấu hình loại sân mới
            </p>
            <button
              type="button"
              onClick={handleCancelAdd}
              className="flex size-7 items-center justify-center rounded-full text-[#747878] hover:bg-orange-100 hover:text-[#1c1b1b]"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* Track type selector */}
            <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
              <Label className="text-xs font-bold text-[#1c1b1b]">Loại sân</Label>
              {trackTypesLoading ? (
                <div className="h-10 animate-pulse rounded-md bg-white" />
              ) : availableTrackTypes.length === 0 ? (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Tất cả loại sân đã được cấu hình cho cơ sở này.
                </p>
              ) : (
                <Select value={form.track_type_id} onValueChange={(v) => setForm((f) => ({ ...f, track_type_id: v }))}>
                  <SelectTrigger className="h-10 bg-white border-[#c4c7c8]">
                    <SelectValue placeholder="Chọn loại sân..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableTrackTypes.map((tt) => (
                      <SelectItem key={tt.id} value={tt.id}>{tt.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-[#1c1b1b]">
                Số chỗ thuê xe tối đa
              </Label>
              <Input
                type="number"
                min={0}
                value={form.max_concurrent}
                onChange={(e) => setForm((f) => ({ ...f, max_concurrent: e.target.value }))}
                className="h-10 bg-white border-[#c4c7c8]"
              />
              <p className="text-[10px] text-[#747878]">Số xe thuê có thể cùng tham gia sân</p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-[#1c1b1b]">
                Số chỗ xe riêng tối đa
              </Label>
              <Input
                type="number"
                min={0}
                value={form.byoc_capacity}
                onChange={(e) => setForm((f) => ({ ...f, byoc_capacity: e.target.value }))}
                className="h-10 bg-white border-[#c4c7c8]"
              />
              <p className="text-[10px] text-[#747878]">0 = sân không nhận khách mang xe riêng</p>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs font-bold text-[#1c1b1b]">Mô tả sân (tuỳ chọn)</Label>
              <Textarea
                rows={2}
                placeholder="Sân drift ngoài trời, bề mặt asphalt cao cấp, diện tích 500m²..."
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                className="bg-white resize-none border-[#c4c7c8]"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-[#1c1b1b]">Thứ tự hiển thị</Label>
              <Input
                type="number"
                min={0}
                value={form.sort_order}
                onChange={(e) => setForm((f) => ({ ...f, sort_order: e.target.value }))}
                className="h-10 bg-white border-[#c4c7c8]"
              />
            </div>
          </div>

          <div className="mt-4 flex items-center justify-end gap-2 border-t border-orange-200/60 pt-4">
            <Button type="button" variant="outline" size="sm" onClick={handleCancelAdd} className="h-8 font-bold text-xs">
              Hủy
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => void handleCreate()}
              disabled={!form.track_type_id || ((parseInt(form.max_concurrent, 10) || 0) === 0 && (parseInt(form.byoc_capacity, 10) || 0) === 0) || createMutation.isPending}
              className="h-8 gap-1.5 font-bold text-xs bg-orange-600 hover:bg-orange-700 text-white"
            >
              <Check className="size-3.5" />
              {createMutation.isPending ? "Đang lưu..." : "Lưu loại sân"}
            </Button>
          </div>
        </div>
      )}

      {/* Config list */}
      {configs.length === 0 && !showAddForm ? (
        <div className="rounded-xl border border-dashed border-[#c4c7c8] bg-[#fafafa] p-10 text-center">
          <ImagePlus className="mx-auto mb-2 size-10 text-[#c4c7c8]" />
          <p className="text-sm font-semibold text-[#444748]">Chưa có cấu hình loại sân nào</p>
          <p className="mt-1 text-xs text-[#747878]">Bấm "Thêm loại sân" để thiết lập loại sân cho cơ sở của bạn</p>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2">
          {configs.map((config) => (
            <TrackConfigCard
              key={config.id}
              config={config}
              onToggleActive={() => handleToggleActive(config)}
              onReplaceCover={(file) => void handleReplaceCoverImage(config.id, file)}
              onUploadMoreImages={(files) => void handleUploadImages(config.id, files)}
              onSetCover={(idx) => void handleSetCover(config, idx)}
              onDeleteImage={(idx) => void handleDeleteImage(config, idx)}
              onSaveEdit={(body) => updateMutation.mutate({ configId: config.id, body })}
              isToggling={updateMutation.isPending}
              isUploading={uploadMutation.isPending}
              isSaving={updateMutation.isPending}
            />
          ))}
        </div>
      )}

      {/* Deactivation confirmation */}
      <AlertDialog open={!!deactivatingConfig} onOpenChange={(open) => !open && setDeactivatingConfig(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-bold">Tắt loại sân</AlertDialogTitle>
            <AlertDialogDescription>
              Loại sân "<strong>{deactivatingConfig?.track_type?.name}</strong>" sẽ không còn hiển thị với khách đặt lịch.
              Nếu còn booking sắp tới, hành động này sẽ bị chặn.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-bold">Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDeactivate}
              className="bg-red-600 text-white font-bold hover:bg-red-700"
            >
              Tắt loại sân
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function TrackConfigCard({
  config,
  onToggleActive,
  onReplaceCover,
  onUploadMoreImages,
  onSetCover,
  onDeleteImage,
  onSaveEdit,
  isToggling,
  isUploading,
  isSaving,
}: {
  config: TrackConfig
  onToggleActive: () => void
  onReplaceCover: (file: File) => void
  onUploadMoreImages: (files: File[]) => void
  onSetCover: (index: number) => void
  onDeleteImage: (index: number) => void
  onSaveEdit: (body: UpdateTrackConfigBody) => void
  isToggling: boolean
  isUploading: boolean
  isSaving: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [showAlbum, setShowAlbum] = useState(false)
  const [activeImageIdx, setActiveImageIdx] = useState(0)

  const replaceCoverInputRef = useRef<HTMLInputElement>(null)
  const addImagesInputRef = useRef<HTMLInputElement>(null)

  const [editForm, setEditForm] = useState({
    max_concurrent: String(config.max_concurrent ?? 5),
    byoc_capacity: String(config.byoc_capacity ?? 0),
    description: config.description ?? "",
    sort_order: String(config.sort_order ?? 0),
  })

  const images = config.images || []
  const coverImage = images[0] ?? null
  const currentPreviewImage = images[activeImageIdx] ?? coverImage

  const handleSave = () => {
    const mc = parseInt(editForm.max_concurrent, 10) || 0
    const bc = parseInt(editForm.byoc_capacity, 10) || 0
    const so = parseInt(editForm.sort_order, 10) || 0
    if (mc < 0 || bc < 0 || (mc === 0 && bc === 0)) return
    onSaveEdit({
      max_concurrent: mc,
      byoc_capacity: bc,
      description: editForm.description.trim() || undefined,
      sort_order: Math.max(0, so),
    })
    setEditing(false)
  }

  const handleCancel = () => {
    setEditForm({
      max_concurrent: String(config.max_concurrent ?? 5),
      byoc_capacity: String(config.byoc_capacity ?? 0),
      description: config.description ?? "",
      sort_order: String(config.sort_order ?? 0),
    })
    setEditing(false)
  }

  const onSelectCoverFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      onReplaceCover(e.target.files[0])
      e.target.value = ""
    }
  }

  const onSelectAddFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      const fileList = Array.from(e.target.files)
      onUploadMoreImages(fileList)
      e.target.value = ""
    }
  }

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border bg-white shadow-sm transition-all",
        config.is_active ? "border-[#c4c7c8]" : "border-[#e5e2e1] bg-[#fafafa] opacity-75"
      )}
    >
      {/* Cover / Preview Area (16:9) */}
      <div className="relative aspect-video w-full overflow-hidden bg-neutral-900 group">
        {currentPreviewImage ? (
          <img
            src={currentPreviewImage}
            alt={config.track_type?.name ?? "Loại sân"}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-102"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-[#f0edec] text-[#747878]">
            <ImagePlus className="size-10 text-[#c4c7c8]" />
            <span className="text-xs font-semibold">Chưa có ảnh loại sân</span>
          </div>
        )}

        {/* Cover badge */}
        {coverImage && (
          <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-bold text-white shadow-md backdrop-blur-xs">
            <Star className="size-3 fill-amber-400 text-amber-400" />
            {activeImageIdx === 0 ? "Ảnh bìa chính" : `Ảnh ${activeImageIdx + 1}/${images.length}`}
          </div>
        )}

        {/* Image count badge */}
        {images.length > 1 && (
          <div className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-bold text-white shadow-md backdrop-blur-xs">
            <Images className="size-3" />
            {images.length} ảnh
          </div>
        )}

        {/* Carousel prev/next arrows if multiple images */}
        {images.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => setActiveImageIdx((i) => (i > 0 ? i - 1 : images.length - 1))}
              className="absolute left-2 top-1/2 -translate-y-1/2 flex size-7 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity hover:bg-black/80 group-hover:opacity-100"
              title="Ảnh trước"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => setActiveImageIdx((i) => (i < images.length - 1 ? i + 1 : 0))}
              className="absolute right-2 top-1/2 -translate-y-1/2 flex size-7 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity hover:bg-black/80 group-hover:opacity-100"
              title="Ảnh tiếp theo"
            >
              <ChevronRight className="size-4" />
            </button>
          </>
        )}

        {/* Hover Action Overlay */}
        <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
          <Button
            type="button"
            size="sm"
            onClick={() => replaceCoverInputRef.current?.click()}
            disabled={isUploading}
            className="h-8 gap-1.5 rounded-lg bg-orange-600 font-bold text-xs text-white hover:bg-orange-700 shadow-md"
          >
            {isUploading ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Đang tải...
              </>
            ) : (
              <>
                <Upload className="size-3.5" />
                {coverImage ? "Đổi ảnh bìa" : "Tải ảnh đại diện"}
              </>
            )}
          </Button>

          {images.length > 0 && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setShowAlbum(!showAlbum)}
              className="h-8 gap-1.5 rounded-lg bg-white/90 font-bold text-xs text-[#1c1b1b] hover:bg-white shadow-md"
            >
              <Images className="size-3.5" />
              {showAlbum ? "Đóng album" : "Quản lý album"}
            </Button>
          )}
        </div>
      </div>

      {/* Hidden File Inputs */}
      <input
        ref={replaceCoverInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={onSelectCoverFile}
      />
      <input
        ref={addImagesInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={onSelectAddFiles}
      />

      {/* Album Strip (Collapsible or toggled) */}
      {showAlbum && (
        <div className="border-b border-[#e5e2e1] bg-[#fcfbfa] p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-bold text-[#1c1b1b] flex items-center gap-1.5">
              <Images className="size-3.5 text-orange-600" />
              Album ảnh loại sân ({images.length}/20)
            </span>
            {images.length < 20 && (
              <button
                type="button"
                onClick={() => addImagesInputRef.current?.click()}
                disabled={isUploading}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-orange-600 hover:text-orange-700"
              >
                <PlusCircle className="size-3" />
                Thêm ảnh
              </button>
            )}
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 pt-1">
            {images.map((url, idx) => {
              const isCover = idx === 0
              const isSelected = idx === activeImageIdx
              return (
                <div
                  key={idx}
                  className={cn(
                    "group/thumb relative size-16 shrink-0 cursor-pointer overflow-hidden rounded-lg border-2 transition-all",
                    isSelected ? "border-orange-600 ring-2 ring-orange-500/20" : "border-[#e5e2e1] hover:border-[#747878]"
                  )}
                  onClick={() => setActiveImageIdx(idx)}
                >
                  <img src={url} alt="" className="h-full w-full object-cover" />
                  
                  {isCover && (
                    <span className="absolute left-0.5 top-0.5 rounded-sm bg-orange-600 px-1 py-0.2 text-[8px] font-extrabold text-white">
                      Bìa
                    </span>
                  )}

                  {/* Thumbnail action hover buttons */}
                  <div className="absolute inset-0 flex items-center justify-center gap-1 bg-black/60 opacity-0 transition-opacity group-hover/thumb:opacity-100">
                    {!isCover && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          onSetCover(idx)
                          setActiveImageIdx(0)
                        }}
                        className="rounded p-1 text-white hover:bg-black/40 hover:text-amber-400"
                        title="Đặt làm ảnh bìa"
                      >
                        <Star className="size-3" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onDeleteImage(idx)
                        if (activeImageIdx >= images.length - 1) {
                          setActiveImageIdx(Math.max(0, images.length - 2))
                        }
                      }}
                      className="rounded p-1 text-white hover:bg-black/40 hover:text-red-400"
                      title="Xóa ảnh"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                </div>
              )
            })}

            {images.length < 20 && (
              <button
                type="button"
                onClick={() => addImagesInputRef.current?.click()}
                disabled={isUploading}
                className="flex size-16 shrink-0 flex-col items-center justify-center rounded-lg border-2 border-dashed border-[#c4c7c8] bg-white text-[#747878] transition-colors hover:border-orange-500 hover:bg-orange-50/50 hover:text-orange-600"
                title="Tải thêm ảnh"
              >
                <PlusCircle className="size-5" />
                <span className="mt-0.5 text-[9px] font-bold">Thêm</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Card Content & Details */}
      <div className="flex flex-1 flex-col p-4">
        {/* Header — name + status badge */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-base font-bold text-[#1c1b1b]">{config.track_type?.name ?? config.track_type_id}</span>
          <Badge
            variant="outline"
            className={cn(
              "text-[10px] font-bold px-2 py-0.5",
              config.is_active ? "border-green-300 bg-green-50 text-green-700" : "border-[#e5e2e1] bg-[#f6f3f2] text-[#747878]"
            )}
          >
            {config.is_active ? "Đang hoạt động" : "Tạm tắt"}
          </Badge>
        </div>

        {/* Inline edit form */}
        {editing ? (
          <div className="mt-3 space-y-3 rounded-lg border border-[#e5e2e1] bg-[#fafafa] p-3">
            {(() => {
              const mc = parseInt(editForm.max_concurrent, 10) || 0
              const bc = parseInt(editForm.byoc_capacity, 10) || 0
              const bothZero = mc === 0 && bc === 0
              return (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-[11px] font-bold text-[#1c1b1b]">Chỗ thuê xe tối đa</Label>
                      <Input
                        type="number"
                        min={0}
                        value={editForm.max_concurrent}
                        onChange={(e) => setEditForm((f) => ({ ...f, max_concurrent: e.target.value }))}
                        className={cn("h-8 bg-white text-xs", bothZero && "border-rose-400")}
                      />
                      <p className="text-[10px] text-[#747878]">0 = không có xe thuê</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] font-bold text-[#1c1b1b]">Chỗ xe riêng tối đa</Label>
                      <Input
                        type="number"
                        min={0}
                        value={editForm.byoc_capacity}
                        onChange={(e) => setEditForm((f) => ({ ...f, byoc_capacity: e.target.value }))}
                        className={cn("h-8 bg-white text-xs", bothZero && "border-rose-400")}
                      />
                      <p className="text-[10px] text-[#747878]">0 = không nhận xe riêng</p>
                    </div>
                  </div>
                  {bothZero && (
                    <p className="text-[10px] text-rose-500 font-semibold">Sân phải có ít nhất một hình thức (thuê xe hoặc xe riêng)</p>
                  )}
                </div>
              )
            })()}
            <div className="space-y-1">
              <Label className="text-[11px] font-bold text-[#1c1b1b]">Mô tả loại sân</Label>
              <Textarea
                rows={2}
                value={editForm.description}
                onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                className="resize-none bg-white text-xs"
                placeholder="Mô tả bề mặt, chiều dài, tính chất sân..."
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] font-bold text-[#1c1b1b]">Thứ tự hiển thị</Label>
              <Input
                type="number"
                min={0}
                value={editForm.sort_order}
                onChange={(e) => setEditForm((f) => ({ ...f, sort_order: e.target.value }))}
                className="h-8 bg-white text-xs"
              />
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-[#e5e2e1] pt-2">
              <Button type="button" variant="outline" size="sm" onClick={handleCancel} className="h-7 text-xs font-semibold">
                Hủy
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleSave}
                disabled={isSaving || ((parseInt(editForm.max_concurrent, 10) || 0) === 0 && (parseInt(editForm.byoc_capacity, 10) || 0) === 0)}
                className="h-7 gap-1 text-xs font-semibold bg-orange-600 hover:bg-orange-700 text-white"
              >
                <Check className="size-3" />
                {isSaving ? "Đang lưu..." : "Lưu"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-2 flex-1">
            {config.description ? (
              <p className="text-xs leading-relaxed text-[#747878] line-clamp-2">{config.description}</p>
            ) : (
              <p className="text-xs italic text-[#c4c7c8]">Chưa có mô tả loại sân</p>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-[#747878]">
              <div className="rounded-md bg-[#f6f3f2] px-2 py-1">
                Thuê xe: <span className="font-bold text-[#1c1b1b]">{config.max_concurrent}</span> chỗ
              </div>
              <div className="rounded-md bg-[#f6f3f2] px-2 py-1">
                Xe riêng:{" "}
                {config.byoc_capacity > 0 ? (
                  <span className="font-bold text-[#1c1b1b]">{config.byoc_capacity} chỗ</span>
                ) : (
                  <span className="text-[#a0a3a3]">Không nhận</span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Action footer */}
        {!editing && (
          <div className="mt-4 flex items-center justify-between border-t border-[#f0edec] pt-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onToggleActive}
              disabled={isToggling}
              className="h-8 gap-1.5 rounded-lg px-2 text-xs font-bold text-[#747878] hover:text-[#1c1b1b]"
            >
              {config.is_active
                ? <><ToggleRight className="size-4 text-orange-600" /> Tắt sân</>
                : <><ToggleLeft className="size-4 text-neutral-400" /> Bật sân</>}
            </Button>

            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowAlbum(!showAlbum)}
                className="h-8 gap-1 rounded-lg px-2 text-xs font-bold text-[#747878] hover:text-[#1c1b1b]"
              >
                <Images className="size-3.5 text-orange-600" />
                Ảnh ({images.length})
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setEditing(true)}
                className="h-8 gap-1.5 rounded-lg px-2 text-xs font-bold text-[#747878] hover:text-[#1c1b1b]"
              >
                <Pencil className="size-3.5" /> Sửa
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

