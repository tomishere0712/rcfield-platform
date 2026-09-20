import { useState } from "react"
import { useParams, useNavigate, Link, useSearchParams } from "react-router"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeft, Plus, Car, AlertTriangle, Trash2 } from "lucide-react"

import { routePaths } from "@/app/router/route-paths"
import { cafeApi, cafeQueryKeys } from "@/features/cafes/api/cafe.api"
import { useVehicleCatalogDetail } from "@/features/vehicles/hooks/useVehicleCatalogs"
import { useVehicleUnits } from "@/features/vehicles/hooks/useVehicleUnits"
import { useDeleteVehicleUnit } from "@/features/vehicles/hooks/useVehicleUnitMutations"
import { VehicleStatus, VehicleTier } from "@/features/vehicles/types"
import type { VehicleUnit } from "@/features/vehicles/types"
import { ProviderPageHeader } from "@/pages/provider/components/ProviderPrimitives"
import { ProviderShell } from "@/pages/provider/components/ProviderShell"
import { sanitizeImageUrl } from "@/shared/lib/utils"
import { Button } from "@/shared/ui/button"
import { Badge } from "@/shared/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog"

export function ProviderVehicleCatalogDetailPage() {
  const { catalogId = "" } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const queryCafeId = searchParams.get("cafeId") || ""

  const [localSelectedCafeId] = useState<string>("")
  const [isDeleteUnitOpen, setIsDeleteUnitOpen] = useState(false)
  const [unitToDelete, setUnitToDelete] = useState<VehicleUnit | null>(null)
  const [activeImageIndex, setActiveImageIndex] = useState(0)

  // Fetch managed cafes to find which cafe contains this catalog
  const { data: cafesData } = useQuery({
    queryKey: cafeQueryKeys.list({ page: 1, limit: 100, scope: "managed" }),
    queryFn: () => cafeApi.listCafes({ page: 1, limit: 100, scope: "managed" }),
  })
  const cafes = cafesData?.data ?? []

  const selectedCafeId =
    localSelectedCafeId || queryCafeId || cafes[0]?.id || ""

  // Fetch catalog details
  const {
    data: catalog,
    isLoading: isCatalogLoading,
    isError: isCatalogError,
  } = useVehicleCatalogDetail(selectedCafeId, catalogId)

  // Fetch units for this catalog
  const { data: units = [], isLoading: isUnitsLoading } = useVehicleUnits(
    selectedCafeId,
    { catalog_id: catalogId },
  )

  // Mutations
  const deleteUnitMutation = useDeleteVehicleUnit(selectedCafeId, catalogId)

  const handleDeleteUnitSubmit = async () => {
    if (!unitToDelete) return
    try {
      await deleteUnitMutation.mutateAsync(unitToDelete.id)
      setIsDeleteUnitOpen(false)
      setUnitToDelete(null)
    } catch {
      // error handled
    }
  }

  const formatVND = (value: number) => {
    return new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: "VND",
      maximumFractionDigits: 0,
    }).format(value)
  }

  const statusColors: Record<VehicleStatus, string> = {
    AVAILABLE: "bg-emerald-50 text-emerald-700 border-emerald-200",
    IN_USE: "bg-blue-50 text-blue-700 border-blue-200",
    MAINTENANCE: "bg-amber-50 text-amber-700 border-amber-200",
    RETIRED: "bg-red-50 text-red-700 border-red-200",
  }

  const statusLabels: Record<VehicleStatus, string> = {
    AVAILABLE: "Sẵn sàng",
    IN_USE: "Đang thuê",
    MAINTENANCE: "Bảo trì",
    RETIRED: "Hỏng/Ngừng chạy",
  }

  if (isCatalogLoading) {
    return (
      <ProviderShell>
        <div className="p-6 space-y-4 animate-pulse">
          <div className="h-10 w-40 bg-gray-200 rounded" />
          <div className="h-64 bg-gray-200 rounded-xl" />
        </div>
      </ProviderShell>
    )
  }

  if (isCatalogError || !catalog) {
    return (
      <ProviderShell>
        <div className="p-6 text-center max-w-md mx-auto mt-20">
          <AlertTriangle className="size-12 text-amber-500 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-[#1c1b1b]">
            Không tìm thấy danh mục
          </h3>
          <p className="text-sm text-[#444748] mt-2 mb-6">
            Danh mục phương tiện này không tồn tại hoặc cơ sở hiện tại chưa được
            tải đúng cách.
          </p>
          <Button
            onClick={() =>
              navigate(`/provider/cafes/${selectedCafeId}?tab=catalogs`)
            }
            className="bg-[#1c1b1b] text-white"
          >
            Quay lại danh sách
          </Button>
        </div>
      </ProviderShell>
    )
  }

  const catalogImages =
    catalog.images && catalog.images.length > 0
      ? catalog.images.map((img) => img.url)
      : catalog.coverImageUrl
        ? [catalog.coverImageUrl]
        : []

  return (
    <ProviderShell>
      <ProviderPageHeader
        title={catalog.name}
        description="Xem chi tiết các thông số kỹ thuật và quản lý danh sách xe thuộc danh mục này."
      />

      <div className="p-4 md:p-6 space-y-6">
        {/* Controls Block */}
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#c4c7c8] bg-white p-4 shadow-sm">
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              navigate(`/provider/cafes/${selectedCafeId}?tab=catalogs`)
            }
            className="h-10 gap-2 rounded-lg border-[#c4c7c8] bg-[#f1edec] text-[#1c1b1b] hover:bg-[#e5e2e1] font-bold"
          >
            <ArrowLeft className="size-4" />
            Quay lại danh mục
          </Button>
          <Button
            onClick={() =>
              navigate(
                routePaths.providerVehicleUnitCreate.replace(
                  ":catalogId",
                  catalogId,
                ) + `?cafeId=${selectedCafeId}`,
              )
            }
            className="h-10 gap-2 rounded-lg bg-[#1c1b1b] text-white hover:bg-[#313030] font-bold"
          >
            <Plus className="size-4" />
            Thêm xe mới
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Specs Details Section */}
          <section className="lg:col-span-4 space-y-6">
            <div className="rounded-xl border border-[#c4c7c8] bg-white overflow-hidden shadow-sm">
              {catalogImages.length > 0 ? (
                <div className="space-y-2">
                  <div className="relative aspect-video w-full overflow-hidden bg-gray-100">
                    <img
                      src={sanitizeImageUrl(catalogImages[activeImageIndex])!}
                      alt={catalog.name}
                      className="w-full h-full object-cover transition-all duration-300"
                    />
                  </div>
                  {catalogImages.length > 1 && (
                    <div className="flex gap-2 px-4 pb-3 overflow-x-auto scrollbar-none">
                      {catalogImages.map((imgUrl, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setActiveImageIndex(idx)}
                          className={`size-12 rounded-md overflow-hidden border-2 shrink-0 transition-colors ${
                            activeImageIndex === idx
                              ? "border-orange-600"
                              : "border-[#e5e2e1]"
                          }`}
                        >
                          <img
                            src={sanitizeImageUrl(imgUrl)!}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="w-full h-48 bg-[#f6f3f2] flex items-center justify-center text-[#c4c7c8]">
                  <Car className="size-16 stroke-[1]" />
                </div>
              )}
              <div className="p-5 space-y-4">
                <div>
                  <span className="text-[10px] font-extrabold text-[#747878] uppercase tracking-wider block mb-1">
                    Phân hạng
                  </span>
                  <Badge
                    className={
                      catalog.tier === VehicleTier.RESTRICTED
                        ? "bg-red-50 text-red-700 border-red-200"
                        : catalog.tier === VehicleTier.PREMIUM
                          ? "bg-amber-50 text-amber-700 border-amber-200"
                          : "bg-[#e5e2e1] text-[#1c1b1b] border-[#c4c7c8]"
                    }
                  >
                    {catalog.tier}
                  </Badge>
                </div>

                <div>
                  <span className="text-[10px] font-extrabold text-[#747878] uppercase tracking-wider block mb-1">
                    Đơn giá thuê & Hệ số
                  </span>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-sm">
                      <span className="text-[#444748] font-bold">
                        Giá thuê giờ:
                      </span>
                      <strong className="text-[#1c1b1b] font-extrabold">
                        {formatVND(catalog.hourlyRate)}/h
                      </strong>
                    </div>
                  </div>
                </div>

                <div className="border-t border-[#e5e2e1] pt-3">
                  <span className="text-[10px] font-extrabold text-[#747878] uppercase tracking-wider block mb-1">
                    Đường tương thích
                  </span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {(catalog.compatibleTrackTypes || []).map((t) => (
                      <Badge
                        key={typeof t === "string" ? t : t.id}
                        variant="outline"
                        className="text-xs font-bold"
                      >
                        {typeof t === "string" ? t : t.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Physical Units List Section */}
          <section className="lg:col-span-8 space-y-4">
            <div className="rounded-xl border border-[#c4c7c8] bg-white shadow-sm overflow-hidden p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-xl font-bold text-[#1c1b1b]">
                    Danh sách xe
                  </h3>
                  <p className="text-xs font-medium text-[#747878] mt-0.5">
                    Tổng cộng {units.length} xe đang hoạt động tại cơ sở
                  </p>
                </div>
              </div>

              {isUnitsLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <div
                      key={index}
                      className="h-12 animate-pulse bg-gray-100 rounded-lg"
                    />
                  ))}
                </div>
              ) : units.length === 0 ? (
                <div className="text-center py-12 border border-dashed border-[#c4c7c8] rounded-lg">
                  <Car className="size-10 text-[#747878] mx-auto mb-2" />
                  <h4 className="text-sm font-bold text-[#1c1b1b]">
                    Chưa có xe nào
                  </h4>
                  <p className="text-xs font-semibold text-[#444748] mt-1 mb-4">
                    Chưa có xe cụ thể nào được gán cho mẫu danh mục này.
                  </p>
                  <Button
                    onClick={() =>
                      navigate(
                        routePaths.providerVehicleUnitCreate.replace(
                          ":catalogId",
                          catalogId,
                        ) + `?cafeId=${selectedCafeId}`,
                      )
                    }
                    className="h-9 text-xs bg-[#1c1b1b] text-white hover:bg-[#313030] rounded-lg font-bold"
                  >
                    Thêm xe đầu tiên
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-[#e5e2e1] bg-[#fcf8f8]/60">
                        <th className="pb-3 pt-2 text-xs font-bold uppercase tracking-wider text-[#747878]">
                          Mã xe (Identifier)
                        </th>
                        <th className="pb-3 pt-2 text-xs font-bold uppercase tracking-wider text-[#747878]">
                          Màu sắc
                        </th>
                        <th className="pb-3 pt-2 text-xs font-bold uppercase tracking-wider text-[#747878]">
                          Trạng thái
                        </th>
                        <th className="pb-3 pt-2 text-xs font-bold uppercase tracking-wider text-[#747878]">
                          Bảo trì gần nhất
                        </th>
                        <th className="pb-3 pt-2 text-xs font-bold uppercase tracking-wider text-[#747878] text-right">
                          Hành động
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {units.map((unit) => (
                        <tr
                          key={unit.id}
                          className="border-b border-[#e5e2e1] hover:bg-[#fcf8f8] transition-colors"
                        >
                          <td className="py-3.5 text-sm font-bold text-[#1c1b1b]">
                            <div className="flex items-center gap-2.5">
                              {unit.distinctive_image_url ? (
                                <img
                                  src={
                                    sanitizeImageUrl(
                                      unit.distinctive_image_url,
                                    )!
                                  }
                                  alt=""
                                  className="size-10 rounded-md object-cover border border-[#e5e2e1] shrink-0"
                                />
                              ) : (
                                <div className="size-10 rounded-md bg-[#f6f3f2] flex items-center justify-center border border-[#e5e2e1] shrink-0 text-[#747878]">
                                  <Car className="size-5" />
                                </div>
                              )}
                              <span>{unit.identifier}</span>
                            </div>
                          </td>
                          <td className="py-3.5 text-sm text-[#1c1b1b] font-bold">
                            <span className="inline-flex items-center gap-1.5">
                              <span
                                className="size-3 rounded-full border border-gray-300"
                                style={{
                                  backgroundColor:
                                    unit.color === "Đỏ"
                                      ? "#dc2626"
                                      : unit.color === "Xanh"
                                        ? "#2563eb"
                                        : unit.color === "Vàng"
                                          ? "#f59e0b"
                                          : unit.color === "Trắng"
                                            ? "#ffffff"
                                            : unit.color === "Đen"
                                              ? "#1a1a1a"
                                              : "#888888",
                                }}
                              />
                              {unit.color}
                            </span>
                          </td>
                          <td className="py-3.5">
                            <Badge
                              className={`border font-bold ${statusColors[unit.status]}`}
                            >
                              {statusLabels[unit.status]}
                            </Badge>
                          </td>
                          <td className="py-3.5 text-sm font-bold text-[#1c1b1b]">
                            {(() => {
                              const dateStr =
                                unit.last_maintenance_at ||
                                unit.lastMaintenanceAt
                              return dateStr
                                ? new Date(dateStr).toLocaleDateString("vi-VN")
                                : "Chưa ghi nhận"
                            })()}
                          </td>
                          <td className="py-3.5 text-right space-x-2">
                            <Button
                              asChild
                              variant="outline"
                              className="h-8 px-2.5 rounded-md border-[#c4c7c8] text-xs font-bold"
                            >
                              <Link
                                to={`${routePaths.providerVehicleDetail
                                  .replace(":catalogId", catalogId)
                                  .replace(
                                    ":vehicleId",
                                    unit.id,
                                  )}?cafeId=${selectedCafeId}`}
                              >
                                Sửa chi tiết
                              </Link>
                            </Button>
                            <Button
                              onClick={() => {
                                setUnitToDelete(unit)
                                setIsDeleteUnitOpen(true)
                              }}
                              variant="ghost"
                              className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* Dialog: Delete physical unit confirmation */}
      <Dialog open={isDeleteUnitOpen} onOpenChange={setIsDeleteUnitOpen}>
        <DialogContent className="max-w-sm rounded-xl bg-white border border-[#c4c7c8] p-6">
          <DialogHeader>
            <div className="flex size-10 items-center justify-center rounded-full bg-red-50 text-red-600 mb-2">
              <AlertTriangle className="size-5" />
            </div>
            <DialogTitle className="text-base font-bold text-[#1c1b1b]">
              Xác nhận xóa xe?
            </DialogTitle>
            <DialogDescription className="text-xs text-[#444748] pt-1">
              Bạn có chắc chắn muốn xóa xe mã số{" "}
              <strong>{unitToDelete?.identifier}</strong> khỏi hệ thống? Hành
              động này không thể hoàn tác.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-5">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsDeleteUnitOpen(false)
                setUnitToDelete(null)
              }}
              className="h-9 text-xs rounded-lg border-[#c4c7c8] font-bold"
            >
              Hủy
            </Button>
            <Button
              type="button"
              onClick={handleDeleteUnitSubmit}
              disabled={deleteUnitMutation.isPending}
              className="h-9 text-xs rounded-lg bg-red-600 text-white hover:bg-red-700 font-bold"
            >
              {deleteUnitMutation.isPending ? "Đang xóa..." : "Xác nhận xóa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ProviderShell>
  )
}
