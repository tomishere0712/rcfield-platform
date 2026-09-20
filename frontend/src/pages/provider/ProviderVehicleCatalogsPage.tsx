import { useState, useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  Plus,
  Car,
  MoreVertical,
  Edit2,
  Trash2,
  AlertTriangle,
  Compass,
  ChevronRight,
} from "lucide-react"
import { Link, useNavigate, useSearchParams } from "react-router"

import { routePaths } from "@/app/router/route-paths"
import { cafeApi, cafeQueryKeys } from "@/features/cafes/api/cafe.api"
import {
  useVehicleCatalogs,
} from "@/features/vehicles/hooks/useVehicleCatalogs"
import {
  useDeleteVehicleCatalog,
} from "@/features/vehicles/hooks/useVehicleCatalogMutations"
import { VehicleTier } from "@/features/vehicles/types"
import type { VehicleCatalog } from "@/features/vehicles/types"
import { ProviderPageHeader } from "@/pages/provider/components/ProviderPrimitives"
import { ProviderShell } from "@/pages/provider/components/ProviderShell"
import { getCatalogImageUrl, cn } from "@/shared/lib/utils"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select"


export function ProviderVehicleCatalogsPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const queryCafeId = searchParams.get("cafeId") || ""
  const [localSelectedCafeId, setLocalSelectedCafeId] = useState<string>("")
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [catalogToDelete, setCatalogToDelete] = useState<VehicleCatalog | null>(null)

  // Fetch managed cafes
  const { data: cafesData, isLoading: isCafesLoading } = useQuery({
    queryKey: cafeQueryKeys.list({ page: 1, limit: 100, scope: "managed" }),
    queryFn: () => cafeApi.listCafes({ page: 1, limit: 100, scope: "managed" }),
  })
  const cafes = cafesData?.data ?? []

  const selectedCafeId = localSelectedCafeId || queryCafeId || cafes[0]?.id || ""

  const {
    data: catalogs = [],
    isLoading: isCatalogsLoading,
  } = useVehicleCatalogs(selectedCafeId)

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1)
  const PAGE_SIZE = 6
  const totalPages = Math.ceil(catalogs.length / PAGE_SIZE)
  const paginatedCatalogs = catalogs.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  )

  useEffect(() => {
    queueMicrotask(() => setCurrentPage(1))
  }, [selectedCafeId])

  // Mutations
  const deleteCatalogMutation = useDeleteVehicleCatalog(selectedCafeId)

  const handleStartCreate = () => {
    navigate(`${routePaths.providerVehicleCatalogCreate}?cafeId=${selectedCafeId}`)
  }

  const handleStartEdit = (catalog: VehicleCatalog) => {
    navigate(
      `${routePaths.providerVehicleCatalogEdit.replace(":catalogId", catalog.id)}?cafeId=${selectedCafeId}`,
    )
  }

  const handleCafeChange = (val: string) => {
    setLocalSelectedCafeId(val)
    setSearchParams({ cafeId: val })
  }

  const handleDeleteSubmit = async () => {
    if (!catalogToDelete) return
    try {
      await deleteCatalogMutation.mutateAsync(catalogToDelete.id)
      setIsDeleteOpen(false)
      setCatalogToDelete(null)
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

  return (
    <ProviderShell>
      <ProviderPageHeader
        title="Danh mục xe thuê"
        description="Định nghĩa phân hạng, cấu hình đơn giá và quản lý mẫu xe RC của bạn."
      />

      <div className="p-4 md:p-6 space-y-6">
        {/* Controls Block */}
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#c4c7c8] bg-white p-4 shadow-sm">
          {cafes.length > 0 ? (
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold uppercase tracking-wider text-[#747878]">Cơ sở hoạt động:</span>
              <Select value={selectedCafeId} onValueChange={handleCafeChange}>
                <SelectTrigger className="h-10 w-64 rounded-lg border-[#c4c7c8] bg-white text-sm font-bold text-[#1c1b1b]">
                  <SelectValue placeholder="Chọn cơ sở" />
                </SelectTrigger>
                <SelectContent>
                  {cafes.map((c) => (
                    <SelectItem key={c.id} value={c.id} className="font-semibold">
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div />
          )}

          <Button
            disabled={!selectedCafeId}
            onClick={handleStartCreate}
            className="h-10 gap-2 rounded-lg bg-[#1c1b1b] text-white hover:bg-[#313030] font-bold"
          >
            <Plus className="size-4" />
            Thêm danh mục mới
          </Button>
        </div>
        {isCafesLoading ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="h-64 animate-pulse rounded-xl bg-gray-100" />
            ))}
          </div>
        ) : cafes.length === 0 ? (
          <div className="flex min-h-[400px] flex-col items-center justify-center rounded-xl border border-dashed border-[#c4c7c8] bg-white p-8 text-center shadow-sm">
            <div className="flex size-14 items-center justify-center rounded-full bg-[#f6f3f2] text-[#747878] mb-4">
              <AlertTriangle className="size-7" />
            </div>
            <h3 className="text-lg font-bold text-[#1c1b1b] mb-1">Chưa có cơ sở hoạt động</h3>
            <p className="text-sm font-semibold text-[#444748] max-w-sm mb-6">
              Bạn cần tạo và kích hoạt ít nhất một cơ sở (Cafe) trước khi có thể cấu hình danh mục phương tiện.
            </p>
            <Button
              onClick={() => navigate(routePaths.providerCafeCreate)}
              className="h-10 bg-[#1c1b1b] text-white rounded-lg hover:bg-[#313030] font-bold"
            >
              Tạo cơ sở của bạn ngay
            </Button>
          </div>
        ) : isCatalogsLoading ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="h-64 animate-pulse rounded-xl bg-gray-100" />
            ))}
          </div>
        ) : catalogs.length === 0 ? (
          <div className="flex min-h-[400px] flex-col items-center justify-center rounded-xl border border-dashed border-[#c4c7c8] bg-white p-8 text-center shadow-sm">
            <div className="flex size-14 items-center justify-center rounded-full bg-[#f6f3f2] text-[#747878] mb-4">
              <Car className="size-7" />
            </div>
            <h3 className="text-lg font-bold text-[#1c1b1b] mb-1">Chưa có danh mục xe nào</h3>
            <p className="text-sm font-semibold text-[#444748] max-w-sm mb-6">
              Cơ sở này chưa có danh mục mẫu xe nào. Hãy tạo danh mục mẫu đầu tiên để bắt đầu nhập thông số và giá thuê xe.
            </p>
            <Button
              onClick={handleStartCreate}
              className="h-10 bg-[#1c1b1b] text-white rounded-lg hover:bg-[#313030] font-bold"
            >
              Tạo danh mục xe đầu tiên
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {paginatedCatalogs.map((catalog) => (
                <div
                  key={catalog.id}
                  className="group relative overflow-hidden rounded-xl border border-[#c4c7c8] bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md"
                >
                  {/* Catalog Cover Image */}
                  <div className="h-44 w-full bg-[#f6f3f2] relative overflow-hidden">
                    {getCatalogImageUrl(catalog) ? (
                      <img
                        src={getCatalogImageUrl(catalog)!}
                        alt={catalog.name}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[#c4c7c8]">
                        <Car className="size-16 stroke-[1]" />
                      </div>
                    )}

                    {/* Tier Badge */}
                    <div className="absolute left-3 top-3">
                      <Badge
                        className={
                          catalog.tier === VehicleTier.RESTRICTED
                            ? "bg-red-50 text-red-700 border border-red-200"
                            : catalog.tier === VehicleTier.PREMIUM
                              ? "bg-amber-50 text-amber-700 border border-amber-200"
                              : "bg-[#e5e2e1] text-[#1c1b1b] border border-[#c4c7c8]"
                        }
                      >
                        {catalog.tier}
                      </Badge>
                    </div>

                    {/* Catalog Menu Button */}
                    <div className="absolute right-3 top-3">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="flex size-8 items-center justify-center rounded-full bg-white/90 shadow-sm text-[#444748] hover:bg-white hover:text-[#1c1b1b] transition-colors"
                          >
                            <MoreVertical className="size-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40 rounded-lg bg-white border-[#c4c7c8]">
                          <DropdownMenuItem
                            onClick={() => handleStartEdit(catalog)}
                            className="cursor-pointer gap-2 py-2"
                          >
                            <Edit2 className="size-4" />
                            <span>Chỉnh sửa</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setCatalogToDelete(catalog)
                              setIsDeleteOpen(true)
                            }}
                            className="cursor-pointer gap-2 py-2 text-red-600 focus:text-red-700 focus:bg-red-50"
                          >
                            <Trash2 className="size-4" />
                            <span>Xóa danh mục</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>

                  {/* Card Info */}
                  <div className="p-5">
                    <h4 className="text-lg font-extrabold text-[#1c1b1b] mb-1 group-hover:text-amber-800 transition-colors line-clamp-1">
                      {catalog.name}
                    </h4>
                    <div className="flex items-center gap-1 text-xs font-semibold text-[#747878] mb-4">
                      <Compass className="size-3.5" />
                      <span className="truncate">
                        {(catalog.compatibleTrackTypes || []).map((t) => typeof t === "string" ? t : t.name).join(", ")}
                      </span>
                    </div>

                    {/* Pricing Details */}
                    <div className="grid grid-cols-2 gap-3 p-3 bg-[#f6f3f2] rounded-lg mb-4 text-xs">
                      <div>
                        <span className="text-[#747878] font-bold block mb-0.5">Giá thuê giờ</span>
                        <strong className="text-sm text-[#1c1b1b] font-extrabold">
                          {formatVND(catalog.hourlyRate)}
                        </strong>
                      </div>
                    </div>

                    {/* Card Bottom Row */}
                    <div className="flex items-center justify-between border-t border-[#e5e2e1] pt-4 mt-2">
                      <div className="flex items-center gap-1.5 text-sm font-bold text-[#444748]">
                        <Car className="size-4 text-[#747878]" />
                        <span>{catalog.total_units ?? catalog._count?.units ?? 0} xe</span>
                      </div>

                      <Link
                        to={`${routePaths.providerVehicleCatalogDetail.replace(":catalogId", catalog.id)}?cafeId=${selectedCafeId}`}
                        className="inline-flex items-center text-xs font-extrabold text-slate-800 hover:text-black transition-colors"
                      >
                        Quản lý xe
                        <ChevronRight className="size-3.5 ml-0.5" />
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-[#e5e2e1] pt-6">
                <p className="text-xs font-bold text-[#747878]">
                  Hiển thị {Math.min((currentPage - 1) * PAGE_SIZE + 1, catalogs.length)} - {Math.min(currentPage * PAGE_SIZE, catalogs.length)} trong số {catalogs.length} danh mục
                </p>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    className="h-8 rounded-lg text-xs font-bold border-[#c4c7c8] text-[#444748] hover:bg-zinc-50"
                  >
                    Trang trước
                  </Button>
                  {Array.from({ length: totalPages }).map((_, idx) => {
                    const page = idx + 1
                    const isCurrent = currentPage === page
                    return (
                      <Button
                        key={page}
                        variant={isCurrent ? "default" : "outline"}
                        size="sm"
                        onClick={() => setCurrentPage(page)}
                        className={cn(
                          "h-8 w-8 rounded-lg text-xs font-bold",
                          isCurrent
                            ? "bg-[#1c1b1b] text-white hover:bg-[#313030]"
                            : "border-[#c4c7c8] text-[#444748] hover:bg-zinc-50"
                        )}
                      >
                        {page}
                      </Button>
                    )
                  })}
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                    className="h-8 rounded-lg text-xs font-bold border-[#c4c7c8] text-[#444748] hover:bg-zinc-50"
                  >
                    Trang sau
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>



      {/* Dialog: Delete Catalog Confirmation */}
      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent className="max-w-md sm:max-w-md rounded-xl bg-white border border-[#c4c7c8] p-6">
          <DialogHeader>
            <div className="flex size-12 items-center justify-center rounded-full bg-red-50 text-red-600 mb-2">
              <AlertTriangle className="size-6" />
            </div>
            <DialogTitle className="text-lg font-bold text-[#1c1b1b]">
              Xác nhận xóa danh mục?
            </DialogTitle>
            <DialogDescription className="text-sm text-[#444748] pt-1">
              Bạn có chắc chắn muốn xóa danh mục <strong>{catalogToDelete?.name}</strong>? Hành động này sẽ
              xóa toàn bộ cấu hình giá của danh mục này và không thể hoàn tác.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsDeleteOpen(false)
                setCatalogToDelete(null)
              }}
              className="h-10 rounded-lg border-[#c4c7c8] font-bold"
            >
              Hủy
            </Button>
            <Button
              type="button"
              onClick={handleDeleteSubmit}
              disabled={deleteCatalogMutation.isPending}
              className="h-10 rounded-lg bg-red-600 text-white hover:bg-red-700 font-bold"
            >
              {deleteCatalogMutation.isPending ? "Đang xóa..." : "Xác nhận xóa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ProviderShell>
  )
}
