/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState } from "react"
import { useParams, useNavigate, useSearchParams } from "react-router"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeft, Car, AlertTriangle, Save, ImagePlus } from "lucide-react"
import { toast } from "sonner"

import { uploadImage } from "@/features/uploads/api/upload.api"
import { sanitizeImageUrl } from "@/shared/lib/utils"

import { routePaths } from "@/app/router/route-paths"
import { cafeApi, cafeQueryKeys } from "@/features/cafes/api/cafe.api"
import { useVehicleCatalogDetail } from "@/features/vehicles/hooks/useVehicleCatalogs"
import { useVehicleUnitDetail } from "@/features/vehicles/hooks/useVehicleUnits"
import { useUpdateVehicleUnit } from "@/features/vehicles/hooks/useVehicleUnitMutations"
import { VehicleStatus } from "@/features/vehicles/types"
import type { UpdateVehicleUnitDto } from "@/features/vehicles/types"
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

export function ProviderVehicleDetailPage() {
  const { catalogId = "", vehicleId = "" } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const queryCafeId = searchParams.get("cafeId") || ""

  const [localSelectedCafeId] = useState<string>("")

  // Form states
  const [formColor, setFormColor] = useState("")
  const [formStatus, setFormStatus] = useState<VehicleStatus>(
    VehicleStatus.AVAILABLE,
  )
  const [formNotes, setFormNotes] = useState("")
  const [formLastMaintenance, setFormLastMaintenance] = useState("")
  const [formImageUrl, setFormImageUrl] = useState("")
  const [uploading, setUploading] = useState(false)

  /**
   * Xe này đã tồn tại nên ảnh lưu ngay, không chờ bấm "Lưu". Tải xong mà rời
   * trang thì ảnh đã nằm trên Cloudinary nhưng xe vẫn trống — đúng kiểu mất công
   * vô ích mà người dùng không hiểu vì sao.
   */
  const handleUpload = async (file: File | undefined) => {
    if (!file) return
    setUploading(true)
    try {
      const uploaded = await uploadImage(file, "vehicles")
      setFormImageUrl(uploaded.url)
      await updateUnitMutation.mutateAsync({
        distinctiveImageUrl: uploaded.url,
      })
    } catch {
      toast.error("Không thể tải ảnh lên, vui lòng thử lại.")
    } finally {
      setUploading(false)
    }
  }

  // Fetch managed cafes
  const { data: cafesData } = useQuery({
    queryKey: cafeQueryKeys.list({ page: 1, limit: 100, scope: "managed" }),
    queryFn: () => cafeApi.listCafes({ page: 1, limit: 100, scope: "managed" }),
  })
  const cafes = cafesData?.data ?? []

  const selectedCafeId =
    localSelectedCafeId || queryCafeId || cafes[0]?.id || ""
  const fromPage = searchParams.get("from") || ""

  const handleBack = () => {
    if (fromPage === "vehicles" || fromPage === "catalogs") {
      navigate(`/provider/cafes/${selectedCafeId}?tab=catalogs`)
    } else {
      navigate(
        `${routePaths.providerVehicleCatalogDetail.replace(":catalogId", catalogId)}?cafeId=${selectedCafeId}`,
      )
    }
  }

  // Fetch catalog detail for reference
  const { data: catalog } = useVehicleCatalogDetail(selectedCafeId, catalogId)

  // Fetch physical unit details
  const {
    data: unit,
    isLoading: isUnitLoading,
    isError: isUnitError,
  } = useVehicleUnitDetail(selectedCafeId, catalogId, vehicleId)

  // Update mutation
  const updateUnitMutation = useUpdateVehicleUnit(
    selectedCafeId,
    catalogId,
    vehicleId,
  )

  // Populate form when unit details load
  useEffect(() => {
    if (unit) {
      setFormColor(unit.color)
      setFormStatus(unit.status)
      setFormNotes(unit.notes || "")
      setFormImageUrl(unit.distinctive_image_url || "")
      const lastMaint = unit.last_maintenance_at || unit.lastMaintenanceAt
      if (lastMaint) {
        // Format to YYYY-MM-DD for date input
        const date = new Date(lastMaint)
        const year = date.getFullYear()
        const month = String(date.getMonth() + 1).padStart(2, "0")
        const day = String(date.getDate()).padStart(2, "0")
        setFormLastMaintenance(`${year}-${month}-${day}`)
      } else {
        setFormLastMaintenance("")
      }
    }
  }, [unit])

  const handleSetTodayMaintenance = () => {
    const today = new Date()
    const year = today.getFullYear()
    const month = String(today.getMonth() + 1).padStart(2, "0")
    const day = String(today.getDate()).padStart(2, "0")
    setFormLastMaintenance(`${year}-${month}-${day}`)
  }

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!unit) return

    const payload: UpdateVehicleUnitDto = {
      color: formColor || "Mặc định",
      status: formStatus,
      notes: formNotes,
      lastMaintenanceAt: formLastMaintenance
        ? new Date(formLastMaintenance).toISOString()
        : null,
      distinctiveImageUrl: formImageUrl || null,
    }

    try {
      await updateUnitMutation.mutateAsync(payload)
      handleBack()
    } catch {
      // error handled in hook
    }
  }

  if (isUnitLoading) {
    return (
      <ProviderShell>
        <div className="p-6 space-y-4 animate-pulse">
          <div className="h-10 w-48 bg-gray-200 rounded" />
          <div className="h-96 bg-gray-200 rounded-xl" />
        </div>
      </ProviderShell>
    )
  }

  if (isUnitError || !unit) {
    return (
      <ProviderShell>
        <div className="p-6 text-center max-w-md mx-auto mt-20">
          <AlertTriangle className="size-12 text-amber-500 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-[#1c1b1b]">
            Không tìm thấy xe
          </h3>
          <p className="text-sm text-[#444748] mt-2 mb-6">
            Xe này không tồn tại hoặc bạn không có quyền xem/cập nhật thông tin
            chi tiết của xe này.
          </p>
          <Button
            onClick={handleBack}
            className="bg-[#1c1b1b] text-white font-bold"
          >
            Quay lại
          </Button>
        </div>
      </ProviderShell>
    )
  }

  return (
    <ProviderShell>
      <ProviderPageHeader
        title={`Mã xe: ${unit.identifier}`}
        description="Xem thông tin chi tiết và cập nhật các thông số bảo trì, vận hành của xe."
      />

      <div className="w-full space-y-6 p-4 md:p-6">
        <div className="flex items-center justify-start">
          <Button
            type="button"
            variant="outline"
            onClick={handleBack}
            className="h-10 gap-2 rounded-lg border-[#c4c7c8] bg-[#f1edec] text-[#1c1b1b] hover:bg-[#e5e2e1] font-bold"
          >
            <ArrowLeft className="size-4" />
            Quay lại danh sách
          </Button>
        </div>
        <form
          onSubmit={handleFormSubmit}
          className="rounded-xl border border-[#c4c7c8] bg-white shadow-sm p-6 space-y-6"
        >
          <div className="flex items-center gap-4 pb-4 border-b border-[#e5e2e1]">
            <div className="flex size-12 items-center justify-center rounded-xl bg-[#f6f3f2] text-[#444748]">
              <Car className="size-6" />
            </div>
            <div>
              <span className="text-xs font-bold text-[#747878] uppercase tracking-wider block">
                Mẫu xe thuộc danh mục
              </span>
              <strong className="text-base text-[#1c1b1b] font-extrabold">
                {catalog?.name || "Đang tải..."}
              </strong>
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label
                  htmlFor="edit-unit-color"
                  className="text-sm font-bold text-[#1c1b1b]"
                >
                  Màu sắc xe
                </Label>
                <Input
                  id="edit-unit-color"
                  placeholder="Ví dụ: Đỏ, Xanh"
                  value={formColor}
                  onChange={(e) => setFormColor(e.target.value)}
                  className="h-10 rounded-lg border-[#c4c7c8]"
                />
              </div>

              <div className="space-y-1.5">
                <Label
                  htmlFor="edit-unit-status"
                  className="text-sm font-bold text-[#1c1b1b]"
                >
                  Trạng thái hoạt động
                </Label>
                <Select
                  value={formStatus}
                  onValueChange={(val) => setFormStatus(val as VehicleStatus)}
                >
                  <SelectTrigger
                    id="edit-unit-status"
                    className="h-10 w-full rounded-lg border-[#c4c7c8] bg-white"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={VehicleStatus.AVAILABLE}>
                      Sẵn sàng thuê (AVAILABLE)
                    </SelectItem>
                    <SelectItem value={VehicleStatus.IN_USE}>
                      Đang cho thuê (IN_USE)
                    </SelectItem>
                    <SelectItem value={VehicleStatus.MAINTENANCE}>
                      Đang bảo trì (MAINTENANCE)
                    </SelectItem>
                    <SelectItem value={VehicleStatus.RETIRED}>
                      Ngừng hoạt động (RETIRED)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="edit-unit-maintenance"
                className="text-sm font-bold text-[#1c1b1b]"
              >
                Ngày bảo trì gần nhất
              </Label>
              <div className="flex flex-wrap gap-2">
                <Input
                  id="edit-unit-maintenance"
                  type="date"
                  value={formLastMaintenance}
                  onChange={(e) => setFormLastMaintenance(e.target.value)}
                  className="h-10 rounded-lg border-[#c4c7c8] flex-1 min-w-0"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleSetTodayMaintenance}
                  className="h-10 shrink-0 rounded-lg border-[#c4c7c8] font-bold"
                >
                  Đặt hôm nay
                </Button>
              </div>
            </div>

            {/* Distinctive Identification Image */}
            <div className="space-y-2">
              <Label className="text-sm font-bold text-[#1c1b1b]">
                Hình ảnh nhận diện xe (Đặc điểm riêng)
              </Label>
              {formImageUrl ? (
                <div className="flex items-center gap-3 rounded-xl border border-[#e5e2e1] bg-[#fcf8f8] p-3">
                  <img
                    src={sanitizeImageUrl(formImageUrl)!}
                    alt=""
                    className="size-16 shrink-0 rounded-lg object-cover border border-[#e5e2e1]"
                  />
                  <div className="flex-1 min-w-0 space-y-2">
                    <p className="text-xs font-semibold text-zinc-500 truncate">
                      {formImageUrl.split("/").pop() || formImageUrl}
                    </p>
                    <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-[#c4c7c8] bg-white px-3 py-1.5 text-xs font-semibold text-[#444748] hover:bg-[#f6f3f2]">
                      <ImagePlus className="size-3.5 text-orange-600" />
                      {uploading ? "Đang tải..." : "Đổi ảnh"}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        disabled={uploading}
                        className="sr-only"
                        onChange={(event) =>
                          void handleUpload(event.target.files?.[0])
                        }
                      />
                    </label>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFormImageUrl("")}
                    className="text-xs font-bold text-red-500 hover:text-red-700 shrink-0"
                  >
                    Xóa
                  </button>
                </div>
              ) : (
                <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[#c4c7c8] bg-[#fcf8f8] p-6 text-center hover:bg-[#f6f3f2]">
                  <ImagePlus className="size-8 text-orange-400" />
                  <div>
                    <p className="text-sm font-bold text-[#444748]">
                      {uploading
                        ? "Đang tải lên..."
                        : "Nhấn để tải ảnh nhận diện xe"}
                    </p>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      JPG, PNG, WEBP · tối đa 10MB
                    </p>
                  </div>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={uploading}
                    className="sr-only"
                    onChange={(event) =>
                      void handleUpload(event.target.files?.[0])
                    }
                  />
                </label>
              )}
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="edit-unit-notes"
                className="text-sm font-bold text-[#1c1b1b]"
              >
                Ghi chú / Nhật ký tình trạng xe
              </Label>
              <Textarea
                id="edit-unit-notes"
                placeholder="Nhập ghi chú chi tiết về tình trạng vỏ, pin, motor hoặc lịch sử sửa chữa..."
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
              onClick={handleBack}
              className="h-10 rounded-lg border-[#c4c7c8] font-bold"
            >
              Hủy bỏ
            </Button>
            <Button
              type="submit"
              disabled={updateUnitMutation.isPending}
              className="h-10 gap-2 rounded-lg bg-[#1c1b1b] text-white hover:bg-[#313030] font-bold"
            >
              <Save className="size-4" />
              {updateUnitMutation.isPending
                ? "Đang cập nhật..."
                : "Lưu thay đổi"}
            </Button>
          </div>
        </form>
      </div>
    </ProviderShell>
  )
}
