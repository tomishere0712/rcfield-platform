import { useState, type FormEvent } from "react"
import { useParams, useNavigate, useSearchParams } from "react-router"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeft, Car, Save, ImagePlus } from "lucide-react"
import { toast } from "sonner"

import { uploadImage } from "@/features/uploads/api/upload.api"
import { sanitizeImageUrl } from "@/shared/lib/utils"

import { routePaths } from "@/app/router/route-paths"
import { cafeApi, cafeQueryKeys } from "@/features/cafes/api/cafe.api"
import { useVehicleCatalogDetail, useVehicleCatalogs } from "@/features/vehicles/hooks/useVehicleCatalogs"
import { useCreateVehicleUnit } from "@/features/vehicles/hooks/useVehicleUnitMutations"
import { VehicleStatus } from "@/features/vehicles/types"
import type { CreateVehicleUnitDto } from "@/features/vehicles/types"
import { ProviderPageHeader } from "@/pages/provider/components/ProviderPrimitives"
import { ProviderShell } from "@/pages/provider/components/ProviderShell"
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
import { Textarea } from "@/shared/ui/textarea"

export function ProviderVehicleUnitFormPage() {
  const { catalogId: routeCatalogId = "" } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const urlCafeId = searchParams.get("cafeId") || ""

  // Form states
  const [selectedCatalogId, setSelectedCatalogId] = useState(routeCatalogId)
  const [formIdentifier, setFormIdentifier] = useState("")
  const [formColor, setFormColor] = useState("")
  const [formStatus, setFormStatus] = useState<VehicleStatus>(VehicleStatus.AVAILABLE)
  const [formNotes, setFormNotes] = useState("")
  const [formImageUrl, setFormImageUrl] = useState("")
  const [uploading, setUploading] = useState(false)

  const handleUpload = async (file: File | undefined) => {
    if (!file) return
    setUploading(true)
    try {
      const uploaded = await uploadImage(file, "vehicles")
      setFormImageUrl(uploaded.url)
      toast.success("Tải ảnh lên thành công!")
    } catch {
      toast.error("Không thể tải ảnh lên, vui lòng thử lại.")
    } finally {
      setUploading(false)
    }
  }

  // Fetch managed cafes to select active cafe if none provided in search param
  const { data: cafesData } = useQuery({
    queryKey: cafeQueryKeys.list({ page: 1, limit: 100, scope: "managed" }),
    queryFn: () => cafeApi.listCafes({ page: 1, limit: 100, scope: "managed" }),
  })
  const cafes = cafesData?.data ?? []
  const selectedCafeId = urlCafeId || cafes[0]?.id || ""

  // Fetch catalogs for this cafe (needed if catalogId is not in route params)
  const { data: catalogs = [] } = useVehicleCatalogs(selectedCafeId)

  // Fetch catalog details for context (if routeCatalogId exists)
  const { data: catalog } = useVehicleCatalogDetail(selectedCafeId, selectedCatalogId)

  // Creation mutation
  const createUnitMutation = useCreateVehicleUnit(selectedCafeId, selectedCatalogId)

  const handleFormSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!selectedCatalogId) {
      toast.error("Vui lòng chọn danh mục mẫu xe")
      return
    }
    if (!formIdentifier.trim()) {
      toast.error("Vui lòng điền mã định danh xe")
      return
    }

    const payload: CreateVehicleUnitDto = {
      identifier: formIdentifier.trim(),
      color: formColor.trim() || "Mặc định",
      status: formStatus,
      notes: formNotes.trim() || undefined,
      distinctiveImageUrl: formImageUrl || undefined,
    }

    try {
      await createUnitMutation.mutateAsync(payload)
      if (routeCatalogId) {
        navigate(`${routePaths.providerVehicleCatalogDetail.replace(":catalogId", routeCatalogId)}?cafeId=${selectedCafeId}`)
      } else {
        navigate(`/provider/cafes/${selectedCafeId}?tab=vehicles`)
      }
    } catch {
      // error toast handled in hook
    }
  }

  return (
    <ProviderShell>
      <ProviderPageHeader
        title="Thêm xe mới"
        description="Gán một xe thực tế vào danh mục mẫu xe."
      />

      <div className="w-full space-y-6 p-4 md:p-6">
        <div className="flex items-center justify-start">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (routeCatalogId) {
                navigate(`${routePaths.providerVehicleCatalogDetail.replace(":catalogId", routeCatalogId)}?cafeId=${selectedCafeId}`)
              } else {
                navigate(`/provider/cafes/${selectedCafeId}?tab=vehicles`)
              }
            }}
            className="h-10 gap-2 rounded-lg border-[#c4c7c8] bg-[#f1edec] text-[#1c1b1b] hover:bg-[#e5e2e1] font-bold"
          >
            <ArrowLeft className="size-4" />
            {routeCatalogId ? "Quay lại chi tiết mẫu" : "Quay lại danh sách xe"}
          </Button>
        </div>

        <form onSubmit={handleFormSubmit} className="rounded-xl border border-[#c4c7c8] bg-white shadow-sm overflow-hidden p-6 space-y-6">
          {routeCatalogId ? (
            <div className="flex items-center gap-4 pb-4 border-b border-[#e5e2e1]">
              <div className="flex size-12 items-center justify-center rounded-xl bg-[#f6f3f2] text-[#444748]">
                <Car className="size-6" />
              </div>
              <div>
                <span className="text-xs font-bold text-[#747878] uppercase tracking-wider block">Mẫu xe thuộc danh mục</span>
                <strong className="text-base text-[#1c1b1b] font-extrabold">
                  {catalog?.name || "Đang tải..."}
                </strong>
              </div>
            </div>
          ) : (
            <div className="space-y-1.5 pb-4 border-b border-[#e5e2e1]">
              <Label htmlFor="catalog-select" className="text-sm font-bold text-[#1c1b1b]">
                Chọn danh mục mẫu xe <span className="text-red-500">*</span>
              </Label>
              <Select value={selectedCatalogId} onValueChange={setSelectedCatalogId}>
                <SelectTrigger id="catalog-select" className="h-10 w-full rounded-lg border-[#c4c7c8] bg-white text-sm font-bold text-zinc-800 shadow-sm focus:ring-1 focus:ring-zinc-200">
                  <SelectValue placeholder="Chọn danh mục xe" />
                </SelectTrigger>
                <SelectContent>
                  {catalogs.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id} className="font-semibold">
                      {cat.name} ({cat.total_units ?? cat._count?.units ?? 0} xe)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="unit-identifier" className="text-sm font-bold text-[#1c1b1b]">
                Mã xe (Identifier) <span className="text-red-500">*</span>
              </Label>
              <Input
                id="unit-identifier"
                placeholder="Ví dụ: XE-DRIFT-01"
                value={formIdentifier}
                onChange={(e) => setFormIdentifier(e.target.value)}
                required
                className="h-10 rounded-lg border-[#c4c7c8]"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="unit-color" className="text-sm font-bold text-[#1c1b1b]">
                  Màu sắc
                </Label>
                <Input
                  id="unit-color"
                  placeholder="Ví dụ: Đỏ, Xanh"
                  value={formColor}
                  onChange={(e) => setFormColor(e.target.value)}
                  className="h-10 rounded-lg border-[#c4c7c8]"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="unit-status" className="text-sm font-bold text-[#1c1b1b]">
                  Trạng thái đầu
                </Label>
                <Select
                  value={formStatus}
                  onValueChange={(val) => setFormStatus(val as VehicleStatus)}
                >
                  <SelectTrigger id="unit-status" className="h-10 w-full rounded-lg border-[#c4c7c8] bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={VehicleStatus.AVAILABLE}>Sẵn sàng thuê (AVAILABLE)</SelectItem>
                    <SelectItem value={VehicleStatus.MAINTENANCE}>Đang bảo trì (MAINTENANCE)</SelectItem>
                    <SelectItem value={VehicleStatus.RETIRED}>Ngừng hoạt động (RETIRED)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Distinctive Identification Image */}
            <div className="space-y-2">
              <Label htmlFor="unit-image" className="text-sm font-bold text-[#1c1b1b]">
                Hình ảnh nhận diện xe (Đặc điểm riêng)
              </Label>
              <div className="grid gap-3 sm:grid-cols-[1fr_120px] sm:items-center">
                <Input
                  id="unit-image"
                  placeholder="Nhập link ảnh nhận diện hoặc tải lên từ thiết bị"
                  value={formImageUrl}
                  onChange={(e) => setFormImageUrl(e.target.value)}
                  className="h-10 rounded-lg border-[#c4c7c8]"
                />
                <label className="block cursor-pointer rounded-lg border border-dashed border-[#c4c7c8] bg-[#fcf8f8] px-3 py-2 text-center text-xs font-semibold text-[#444748] hover:bg-[#f6f3f2]">
                  <span className="flex items-center justify-center gap-1.5">
                    <ImagePlus className="size-4 text-orange-600" />
                    {uploading ? "Đang tải..." : "Tải ảnh"}
                  </span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={uploading}
                    className="sr-only"
                    onChange={(event) => void handleUpload(event.target.files?.[0])}
                  />
                </label>
              </div>
              {formImageUrl ? (
                <div className="flex items-center gap-3 rounded-lg border border-[#e5e2e1] bg-[#fcf8f8] p-2 mt-1 min-w-0 overflow-hidden">
                  <img src={sanitizeImageUrl(formImageUrl)!} alt="" className="size-12 shrink-0 rounded-md object-cover" />
                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-[#444748]">{formImageUrl}</span>
                </div>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="unit-notes" className="text-sm font-bold text-[#1c1b1b]">
                Ghi chú tình trạng xe
              </Label>
              <Textarea
                id="unit-notes"
                placeholder="Nhập tình trạng lốp, pin, motor..."
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                rows={4}
                className="rounded-lg border-[#c4c7c8]"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-[#e5e2e1] flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (routeCatalogId) {
                  navigate(`${routePaths.providerVehicleCatalogDetail.replace(":catalogId", routeCatalogId)}?cafeId=${selectedCafeId}`)
                } else {
                  navigate(`${routePaths.providerVehicles}?tab=vehicles&cafeId=${selectedCafeId}`)
                }
              }}
              className="h-10 rounded-lg border-[#c4c7c8] font-bold"
            >
              Hủy bỏ
            </Button>
            <Button
              type="submit"
              disabled={createUnitMutation.isPending}
              className="h-10 gap-2 rounded-lg bg-[#1c1b1b] text-white hover:bg-[#313030] font-bold"
            >
              <Save className="size-4" />
              {createUnitMutation.isPending ? "Đang lưu..." : "Thêm xe"}
            </Button>
          </div>
        </form>
      </div>
    </ProviderShell>
  )
}
