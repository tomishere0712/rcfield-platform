import { useState, useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link, useNavigate, useSearchParams } from "react-router"
import {
  AlertTriangle,
  CheckCircle2,
  Plus,
  Wrench,
  Car,
  Search,
  Activity,
  Eye,
  MoreVertical,
  Edit2,
  Trash2,
  Compass,
  ChevronRight,
} from "lucide-react"

import { routePaths } from "@/app/router/route-paths"
import { cafeApi, cafeQueryKeys } from "@/features/cafes/api/cafe.api"
import { useVehicleUnits } from "@/features/vehicles/hooks/useVehicleUnits"
import { useVehicleCatalogs } from "@/features/vehicles/hooks/useVehicleCatalogs"
import { useDeleteVehicleCatalog } from "@/features/vehicles/hooks/useVehicleCatalogMutations"
import { VehicleStatus, VehicleTier } from "@/features/vehicles/types"
import type { VehicleUnit, VehicleCatalog } from "@/features/vehicles/types"
import { ProviderPageHeader } from "@/pages/provider/components/ProviderPrimitives"
import { ProviderShell } from "@/pages/provider/components/ProviderShell"
import { cn, sanitizeImageUrl, getCatalogImageUrl } from "@/shared/lib/utils"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Badge } from "@/shared/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select"
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

export function ProviderVehiclesPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get("tab") || "vehicles"
  const queryCafeId = searchParams.get("cafeId") || ""
  
  const [localSelectedCafeId, setLocalSelectedCafeId] = useState<string>("")
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState<"ALL" | VehicleStatus>("ALL")
  
  const [currentPage, setCurrentPage] = useState(1)
  const [currentCatalogPage, setCurrentCatalogPage] = useState(1)
  
  const [isCatalogDeleteOpen, setIsCatalogDeleteOpen] = useState(false)
  const [catalogToDelete, setCatalogToDelete] = useState<VehicleCatalog | null>(null)

  const { data: cafesData, isLoading: isCafesLoading } = useQuery({
    queryKey: cafeQueryKeys.list({ page: 1, limit: 100, scope: "managed" }),
    queryFn: () => cafeApi.listCafes({ page: 1, limit: 100, scope: "managed" }),
  })
  const cafes = cafesData?.data ?? []

  const selectedCafeId = localSelectedCafeId || queryCafeId || cafes[0]?.id || ""

  const { data: units = [], isLoading: isUnitsLoading } = useVehicleUnits(selectedCafeId)
  const { data: catalogs = [], isLoading: isCatalogsLoading } = useVehicleCatalogs(selectedCafeId)

  const deleteCatalogMutation = useDeleteVehicleCatalog(selectedCafeId)

  useEffect(() => {
    queueMicrotask(() => {
      setCurrentPage(1)
      setCurrentCatalogPage(1)
    })
  }, [selectedCafeId])

  const getCatalogForUnit = (unit: VehicleUnit) => {
    return catalogs.find((c) => c.id === (unit.catalogId || unit.catalog?.id))
  }

  const totalCount = units.length
  const activeCount = units.filter((u) => u.status === VehicleStatus.AVAILABLE || u.status === VehicleStatus.IN_USE).length
  const maintenanceCount = units.filter((u) => u.status === VehicleStatus.MAINTENANCE).length
  const retiredCount = units.filter((u) => u.status === VehicleStatus.RETIRED).length

  const filteredUnits = units.filter((unit) => {
    if (statusFilter !== "ALL" && unit.status !== statusFilter) {
      return false
    }
    if (searchTerm.trim() !== "") {
      const query = searchTerm.toLowerCase()
      const catalog = getCatalogForUnit(unit)
      const matchesIdentifier = unit.identifier.toLowerCase().includes(query)
      const matchesCatalogName = catalog?.name?.toLowerCase().includes(query) || false
      const matchesColor = unit.color?.toLowerCase().includes(query) || false
      const matchesNotes = unit.notes?.toLowerCase().includes(query) || false
      return matchesIdentifier || matchesCatalogName || matchesColor || matchesNotes
    }
    return true
  })

  const VEHICLE_PAGE_SIZE = 6
  const totalVehiclePages = Math.ceil(filteredUnits.length / VEHICLE_PAGE_SIZE)
  const paginatedUnits = filteredUnits.slice(
    (currentPage - 1) * VEHICLE_PAGE_SIZE,
    currentPage * VEHICLE_PAGE_SIZE
  )

  const CATALOG_PAGE_SIZE = 6
  const totalCatalogPages = Math.ceil(catalogs.length / CATALOG_PAGE_SIZE)
  const paginatedCatalogs = catalogs.slice(
    (currentCatalogPage - 1) * CATALOG_PAGE_SIZE,
    currentCatalogPage * CATALOG_PAGE_SIZE
  )

  const handleCafeChange = (val: string) => {
    setLocalSelectedCafeId(val)
    setSearchParams({ tab, cafeId: val })
  }

  const handleTabChange = (newTab: string) => {
    setSearchParams({ tab: newTab, cafeId: selectedCafeId })
  }

  const handleDeleteCatalogSubmit = async () => {
    if (!catalogToDelete) return
    try {
      await deleteCatalogMutation.mutateAsync(catalogToDelete.id)
      setIsCatalogDeleteOpen(false)
      setCatalogToDelete(null)
    } catch {
      // Mutation already surfaces failure state through its own handlers.
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
        title="Quản lý Đội xe"
        description="Theo dõi tình trạng vận hành của xe và thiết lập danh mục mẫu xe của bạn."
      />

      <div className="p-4 md:p-6 space-y-6">
        <div className="flex flex-col gap-4 rounded-xl border border-[#c4c7c8] bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            {cafes.length > 0 ? (
              <div className="flex items-center gap-2.5">
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

            {tab === "vehicles" ? (
              <Button
                disabled={!selectedCafeId}
                onClick={() => navigate(`${routePaths.providerVehicleUnitCreateWithoutCatalog}?cafeId=${selectedCafeId}`)}
                className="h-10 gap-2 rounded-lg bg-[#1c1b1b] text-white hover:bg-[#313030] font-bold shadow-sm"
              >
                <Plus className="size-4" />
                Thêm xe mới
              </Button>
            ) : (
              <Button
                disabled={!selectedCafeId}
                onClick={() => navigate(`${routePaths.providerVehicleCatalogCreate}?cafeId=${selectedCafeId}`)}
                className="h-10 gap-2 rounded-lg bg-[#1c1b1b] text-white hover:bg-[#313030] font-bold shadow-sm"
              >
                <Plus className="size-4" />
                Thêm danh mục mới
              </Button>
            )}
          </div>
        </div>

        <div className="flex border-b border-[#e5e2e1]">
          <button
            onClick={() => handleTabChange("vehicles")}
            className={cn(
              "px-6 py-3 text-sm font-bold border-b-2 transition-all mr-2",
              tab === "vehicles"
                ? "border-orange-600 text-orange-600 font-extrabold"
                : "border-transparent text-zinc-500 hover:text-zinc-800 hover:border-zinc-300"
            )}
          >
            Danh sách xe ({totalCount})
          </button>
          <button
            onClick={() => handleTabChange("catalogs")}
            className={cn(
              "px-6 py-3 text-sm font-bold border-b-2 transition-all",
              tab === "catalogs"
                ? "border-orange-600 text-orange-600 font-extrabold"
                : "border-transparent text-zinc-500 hover:text-zinc-800 hover:border-zinc-300"
            )}
          >
            Danh mục mẫu xe ({catalogs.length})
          </button>
        </div>

        {isCafesLoading ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-64 animate-pulse rounded-xl bg-gray-100" />
            ))}
          </div>
        ) : cafes.length === 0 ? (
          <div className="flex min-h-[400px] flex-col items-center justify-center rounded-xl border border-dashed border-[#c4c7c8] bg-white p-8 text-center shadow-sm">
            <div className="flex size-14 items-center justify-center rounded-full bg-[#f6f3f2] text-[#747878] mb-4">
              <AlertTriangle className="size-7" />
            </div>
            <h3 className="text-lg font-bold text-[#1c1b1b] mb-1">Chưa có cơ sở hoạt động</h3>
            <p className="text-sm font-semibold text-[#444748] max-w-sm mb-6">
              Bạn cần tạo và kích hoạt ít nhất một cơ sở (Cafe) trước khi có thể cấu hình và giám sát đội xe.
            </p>
            <Button
              onClick={() => navigate(routePaths.providerCafeCreate)}
              className="h-10 bg-[#1c1b1b] text-white rounded-lg hover:bg-[#313030] font-bold"
            >
              Tạo cơ sở của bạn ngay
            </Button>
          </div>
        ) : tab === "vehicles" ? (
          // TAB 1: FLEET VEHICLES
          <>
            {/* KPI Cards */}
            <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <KpiCard
                label="Tổng số xe"
                value={totalCount.toString()}
                icon={Car}
                accentClass="text-indigo-600"
                bgClass="bg-indigo-50"
                description="Tổng phương tiện đăng ký"
              />
              <KpiCard
                label="Sẵn sàng & Đang thuê"
                value={activeCount.toString()}
                icon={Activity}
                accentClass="text-emerald-600"
                bgClass="bg-emerald-50"
                description="Đang hoạt động tốt"
              />
              <KpiCard
                label="Đang bảo dưỡng"
                value={maintenanceCount.toString()}
                icon={Wrench}
                accentClass="text-amber-600"
                bgClass="bg-amber-50"
                description="Cần kiểm tra định kỳ"
              />
              <KpiCard
                label="Ngừng hoạt động / Hỏng"
                value={retiredCount.toString()}
                icon={AlertTriangle}
                accentClass="text-rose-600"
                bgClass="bg-rose-50"
                description={retiredCount > 0 ? "Yêu cầu xử lý gấp" : "Không có sự cố"}
              />
            </section>

            {/* Dashboard Sections */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              {/* Detailed status grid */}
              <section className="flex flex-col gap-4 lg:col-span-8">
                {/* Search and Filters Bar */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="relative flex-1 w-full sm:min-w-[320px] sm:max-w-sm">
                    <Search className="absolute left-3 top-3 size-4 text-zinc-400" />
                    <Input
                      placeholder="Tìm xe theo mã, tên mẫu, màu..."
                      value={searchTerm}
                      onChange={(e) => {
                        setSearchTerm(e.target.value)
                        setCurrentPage(1)
                      }}
                      className="pl-9 h-10 rounded-xl border-zinc-200 bg-white text-xs font-semibold text-zinc-800 shadow-sm placeholder:text-zinc-400 focus-visible:ring-1 focus-visible:ring-zinc-200"
                    />
                  </div>

                  {/* Filter Tabs */}
                  <div className="flex items-center gap-1 overflow-x-auto rounded-xl bg-zinc-100 p-1">
                    {([
                      { value: "ALL", label: "Tất cả", count: units.length },
                      { value: "AVAILABLE", label: "Sẵn sàng", count: units.filter(u => u.status === "AVAILABLE").length },
                      { value: "IN_USE", label: "Đang thuê", count: units.filter(u => u.status === "IN_USE").length },
                      { value: "MAINTENANCE", label: "Bảo trì", count: units.filter(u => u.status === "MAINTENANCE").length },
                      { value: "RETIRED", label: "Ngừng chạy", count: units.filter(u => u.status === "RETIRED").length },
                    ] as const).map((f) => {
                      const isActive = statusFilter === f.value
                      return (
                        <button
                          key={f.value}
                          type="button"
                          onClick={() => {
                            setStatusFilter(f.value)
                            setCurrentPage(1)
                          }}
                          className={cn(
                            "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all shrink-0",
                            isActive
                              ? "bg-white text-zinc-900 shadow-sm"
                              : "text-zinc-600 hover:text-zinc-900"
                          )}
                        >
                          {f.label}
                          <span
                            className={cn(
                              "rounded-full px-1.5 py-0.5 text-[10px] font-extrabold",
                              isActive ? "bg-zinc-100 text-zinc-900" : "bg-zinc-200 text-zinc-700"
                            )}
                          >
                            {f.count}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                <h3 className="text-lg font-extrabold leading-tight tracking-tight text-zinc-800 mt-2">
                  Chi tiết trạng thái đội xe
                </h3>

                {isUnitsLoading ? (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {Array.from({ length: 2 }).map((_, i) => (
                      <div key={i} className="h-44 animate-pulse rounded-xl bg-gray-100" />
                    ))}
                  </div>
                ) : filteredUnits.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-zinc-200 bg-white p-12 text-center shadow-sm">
                    <Car className="size-10 text-zinc-300 mx-auto mb-2" />
                    <p className="text-sm font-bold text-zinc-800">Không tìm thấy phương tiện nào</p>
                    <p className="text-xs font-semibold text-zinc-500 mt-1 max-w-xs mx-auto">
                      Hãy thử thay đổi điều kiện tìm kiếm hoặc thêm xe mới vào danh mục hoạt động.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      {paginatedUnits.map((unit) => (
                        <FleetHealthCard
                          key={unit.id}
                          unit={unit}
                          catalog={getCatalogForUnit(unit)}
                          cafeId={selectedCafeId}
                        />
                      ))}
                    </div>

                    {/* Vehicles Pagination */}
                    {totalVehiclePages > 1 && (
                      <div className="flex items-center justify-between border-t border-[#e5e2e1] pt-4">
                        <p className="text-xs font-bold text-[#747878]">
                          Hiển thị {Math.min((currentPage - 1) * VEHICLE_PAGE_SIZE + 1, filteredUnits.length)} - {Math.min(currentPage * VEHICLE_PAGE_SIZE, filteredUnits.length)} trong số {filteredUnits.length} xe
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
                          {Array.from({ length: totalVehiclePages }).map((_, idx) => {
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
                            disabled={currentPage === totalVehiclePages}
                            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalVehiclePages))}
                            className="h-8 rounded-lg text-xs font-bold border-[#c4c7c8] text-[#444748] hover:bg-zinc-50"
                          >
                            Trang sau
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </section>

              {/* Maintenance list section */}
              <aside className="flex flex-col gap-4 lg:col-span-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-extrabold leading-tight tracking-tight text-zinc-800">
                    Hàng đợi bảo trì & Hỏng
                  </h3>
                  <Badge className="bg-amber-100 text-amber-800 font-extrabold border-amber-200">
                    {units.filter((u) => u.status === VehicleStatus.MAINTENANCE || u.status === VehicleStatus.RETIRED).length} xe
                  </Badge>
                </div>

                <div className="rounded-2xl border border-zinc-200 bg-zinc-50/50 p-4 shadow-sm min-h-[300px] max-h-[480px] overflow-y-auto">
                  <div className="flex flex-col gap-3">
                    {units.filter((u) => u.status === VehicleStatus.MAINTENANCE || u.status === VehicleStatus.RETIRED).length === 0 ? (
                      <div className="flex flex-col items-center justify-center p-8 text-center text-zinc-500 my-auto">
                        <CheckCircle2 className="size-8 text-emerald-500 mb-2" />
                        <p className="text-xs font-bold text-zinc-700">Đội xe khỏe mạnh</p>
                        <p className="text-[10px] text-zinc-400 mt-0.5">Không có phương tiện nào đang bảo dưỡng hoặc gặp sự cố.</p>
                      </div>
                    ) : (
                      units
                        .filter((u) => u.status === VehicleStatus.MAINTENANCE || u.status === VehicleStatus.RETIRED)
                        .map((unit) => (
                          <QueueItem
                            key={unit.id}
                            unit={unit}
                            catalog={getCatalogForUnit(unit)}
                            cafeId={selectedCafeId}
                          />
                        ))
                    )}
                  </div>
                </div>
              </aside>
            </div>
          </>
        ) : (
          // TAB 2: VEHICLE CATALOGS
          isCatalogsLoading ? (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-64 animate-pulse rounded-xl bg-gray-100" />
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
                onClick={() => navigate(`${routePaths.providerVehicleCatalogCreate}?cafeId=${selectedCafeId}`)}
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
                              onClick={() => navigate(`${routePaths.providerVehicleCatalogEdit.replace(":catalogId", catalog.id)}?cafeId=${selectedCafeId}`)}
                              className="cursor-pointer gap-2 py-2"
                            >
                              <Edit2 className="size-4" />
                              <span>Chỉnh sửa</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                setCatalogToDelete(catalog)
                                setIsCatalogDeleteOpen(true)
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

              {/* Catalogs Pagination */}
              {totalCatalogPages > 1 && (
                <div className="flex items-center justify-between border-t border-[#e5e2e1] pt-6">
                  <p className="text-xs font-bold text-[#747878]">
                    Hiển thị {Math.min((currentCatalogPage - 1) * CATALOG_PAGE_SIZE + 1, catalogs.length)} - {Math.min(currentCatalogPage * CATALOG_PAGE_SIZE, catalogs.length)} trong số {catalogs.length} danh mục
                  </p>
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={currentCatalogPage === 1}
                      onClick={() => setCurrentCatalogPage(prev => Math.max(prev - 1, 1))}
                      className="h-8 rounded-lg text-xs font-bold border-[#c4c7c8] text-[#444748] hover:bg-zinc-50"
                    >
                      Trang trước
                    </Button>
                    {Array.from({ length: totalCatalogPages }).map((_, idx) => {
                      const page = idx + 1
                      const isCurrent = currentCatalogPage === page
                      return (
                        <Button
                          key={page}
                          variant={isCurrent ? "default" : "outline"}
                          size="sm"
                          onClick={() => setCurrentCatalogPage(page)}
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
                      disabled={currentCatalogPage === totalCatalogPages}
                      onClick={() => setCurrentCatalogPage(prev => Math.min(prev + 1, totalCatalogPages))}
                      className="h-8 rounded-lg text-xs font-bold border-[#c4c7c8] text-[#444748] hover:bg-zinc-50"
                    >
                      Trang sau
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )
        )}
      </div>

      {/* Dialog: Delete Catalog Confirmation */}
      <Dialog open={isCatalogDeleteOpen} onOpenChange={setIsCatalogDeleteOpen}>
        <DialogContent className="max-w-md rounded-xl bg-white border border-[#c4c7c8] p-6">
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
                setIsCatalogDeleteOpen(false)
                setCatalogToDelete(null)
              }}
              className="h-10 rounded-lg border-[#c4c7c8] font-bold"
            >
              Hủy
            </Button>
            <Button
              type="button"
              onClick={handleDeleteCatalogSubmit}
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

function KpiCard({
  label,
  value,
  icon: Icon,
  description,
  accentClass,
  bgClass,
}: {
  label: string
  value: string
  icon: React.ComponentType<{ className?: string }>
  description?: string
  accentClass: string
  bgClass: string
}) {
  return (
    <article className="relative overflow-hidden rounded-2xl border border-zinc-200/60 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
      <div className={cn("absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-xl", bgClass)}>
        <Icon className={cn("size-5", accentClass)} />
      </div>
      <div className="space-y-1">
        <p className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-wider">{label}</p>
        <p className="text-3xl font-extrabold text-zinc-900 leading-tight">{value}</p>
        {description && <p className="text-[11px] font-bold text-zinc-500">{description}</p>}
      </div>
    </article>
  )
}

function FleetHealthCard({
  unit,
  catalog,
  cafeId,
}: {
  unit: VehicleUnit
  catalog: VehicleCatalog | undefined
  cafeId: string
}) {
  const navigate = useNavigate()
  const catalogId = unit.catalogId || unit.catalog?.id || ""

  // Visual status indicators mapping
  const statusConfig = {
    AVAILABLE: {
      label: "Sẵn sàng",
      bg: "bg-emerald-50 border-emerald-200 text-emerald-700",
      dot: "bg-emerald-500",
    },
    IN_USE: {
      label: "Đang cho thuê",
      bg: "bg-blue-50 border-blue-200 text-blue-700",
      dot: "bg-blue-500",
    },
    MAINTENANCE: {
      label: "Đang bảo trì",
      bg: "bg-amber-50 border-amber-200 text-amber-700",
      dot: "bg-amber-500",
    },
    RETIRED: {
      label: "Hỏng / Ngừng chạy",
      bg: "bg-rose-50 border-rose-200 text-rose-700",
      dot: "bg-rose-500",
    },
  }[unit.status] || {
    label: "Không xác định",
    bg: "bg-gray-50 border-gray-200 text-gray-700",
    dot: "bg-gray-500",
  }

  // Tier design
  const tierConfig = {
    PREMIUM: {
      label: "Premium",
      badge: "bg-amber-100/70 text-amber-800 border-amber-200/50",
    },
    RESTRICTED: {
      label: "Restricted",
      badge: "bg-purple-100/70 text-purple-800 border-purple-200/50",
    },
    STANDARD: {
      label: "Standard",
      badge: "bg-zinc-100 text-zinc-800 border-zinc-200/50",
    },
  }[catalog?.tier || "STANDARD"]

  // Resolve Image Url (with fallbacks so it is never blank!)
  const imageUrl = sanitizeImageUrl(unit.distinctive_image_url) 
    || sanitizeImageUrl(catalog?.coverImageUrl) 
    || (catalog?.images && catalog.images.length > 0 ? sanitizeImageUrl(catalog.images[0].url) : null)
    || "https://images.unsplash.com/photo-1594787318286-3d835c1d207f?q=80&w=200&auto=format&fit=crop";

  return (
    <article className="group relative overflow-hidden rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition-all hover:border-zinc-300 hover:shadow-md">
      <div className="flex gap-4">
        {/* Vehicle Image */}
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-zinc-100 bg-zinc-50">
          <img
            src={imageUrl}
            alt={unit.identifier}
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
            onError={(e) => {
              ;(e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1594787318286-3d835c1d207f?q=80&w=200&auto=format&fit=crop"
            }}
          />
        </div>

        {/* Vehicle Primary Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h4 className="text-base font-extrabold text-zinc-900 truncate leading-snug">
                {unit.identifier}
              </h4>
              <p className="text-xs font-bold text-zinc-400 truncate mt-0.5">
                {catalog?.name || "Mẫu xe chưa tải"}
              </p>
            </div>
          </div>

          {/* Badges row */}
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-extrabold", statusConfig.bg)}>
              <span className={cn("size-1.5 rounded-full", statusConfig.dot)} />
              {statusConfig.label}
            </span>
            <span className={cn("rounded-full border px-2.5 py-0.5 text-[10px] font-extrabold", tierConfig.badge)}>
              {tierConfig.label}
            </span>
          </div>
        </div>
      </div>

      {/* Detail grids */}
      <div className="mt-4 grid grid-cols-2 gap-3 border-t border-zinc-100 pt-3.5 text-xs">
        <div className="space-y-0.5">
          <span className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-wider">Màu sắc</span>
          <p className="font-extrabold text-zinc-800">{unit.color || "Không rõ"}</p>
        </div>
        <div className="space-y-0.5">
          <span className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-wider">Bảo trì gần nhất</span>
          <p className="font-extrabold text-zinc-800">
            {(() => {
              const dateStr = unit.last_maintenance_at || unit.lastMaintenanceAt
              return dateStr ? new Date(dateStr).toLocaleDateString("vi-VN") : "Chưa ghi nhận"
            })()}
          </p>
        </div>
      </div>

      {/* Tracks compatibility */}
      {catalog?.compatibleTrackTypes && catalog.compatibleTrackTypes.length > 0 && (
        <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-wider mr-1">Đường chạy:</span>
          {catalog.compatibleTrackTypes.map((t) => (
            <span key={typeof t === "string" ? t : t.id} className="rounded bg-zinc-100 px-2 py-0.5 text-[9px] font-bold text-zinc-600">
              {typeof t === "string" ? t : t.name}
            </span>
          ))}
        </div>
      )}

      {/* Notes block */}
      {unit.notes && (
        <div className="mt-3.5 rounded-xl bg-zinc-50 p-2.5 text-[11px] font-semibold text-zinc-600 italic border-l-2 border-zinc-300 line-clamp-2">
          Ghi chú: {unit.notes}
        </div>
      )}

      {/* Actions */}
      <div className="mt-4 flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            navigate(`${routePaths.providerVehicleDetail.replace(":catalogId", catalogId).replace(":vehicleId", unit.id)}?cafeId=${cafeId}&from=vehicles`)
          }}
          className="h-8 rounded-xl text-xs font-bold gap-1 border-zinc-200 text-zinc-700 hover:bg-zinc-50"
        >
          <Eye className="size-3.5" />
          Xem chi tiết
        </Button>
      </div>
    </article>
  )
}

function QueueItem({
  unit,
  catalog,
  cafeId,
}: {
  unit: VehicleUnit
  catalog: VehicleCatalog | undefined
  cafeId: string
}) {
  const isRetired = unit.status === VehicleStatus.RETIRED
  const Icon = isRetired ? AlertTriangle : Wrench

  const catalogId = unit.catalogId || unit.catalog?.id || ""

  return (
    <Link
      to={`${routePaths.providerVehicleDetail
        .replace(":catalogId", catalogId)
        .replace(":vehicleId", unit.id)}?cafeId=${cafeId}&from=vehicles`}
      className={cn(
        "flex gap-3 rounded-xl border p-3.5 transition-all hover:-translate-y-0.5 hover:shadow-sm bg-white",
        isRetired
          ? "border-rose-200/80 hover:border-rose-300"
          : "border-amber-200/80 hover:border-amber-300"
      )}
    >
      <div className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-xl",
        isRetired ? "bg-rose-50 text-rose-600" : "bg-amber-50 text-amber-600"
      )}>
        <Icon className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex items-center justify-between gap-3">
          <span className="text-xs font-extrabold text-zinc-800 truncate">{unit.identifier}</span>
          <span className={cn(
            "shrink-0 rounded px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider",
            isRetired ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800"
          )}>
            {isRetired ? "KHẨN CẤP" : "HÔM NAY"}
          </span>
        </div>
        <p className="text-[11px] font-bold text-zinc-400 truncate">{catalog?.name || "Mẫu xe"}</p>
        {unit.notes && (
          <p className="line-clamp-2 text-[11px] text-zinc-500 font-semibold italic mt-1 border-l-2 border-zinc-200 pl-1.5">
            "{unit.notes}"
          </p>
        )}
      </div>
    </Link>
  )
}
