import { useMemo, useState, type ReactNode } from "react"
import { useQuery } from "@tanstack/react-query"
import { AlertTriangle, BarChart3, Building2, Plus, TrendingUp } from "lucide-react"
import { useNavigate } from "react-router"

import { routePaths } from "@/app/router/route-paths"
import { providerDashboardApi } from "@/features/dashboard/api/provider-dashboard.api"
import { cafeApi, cafeQueryKeys } from "@/features/cafes/api/cafe.api"
import { subscriptionApi } from "@/features/subscriptions/api/subscription.api"
import { formatCurrency } from "@/shared/lib/format"
import { BranchList, formatOccupancyRate, Panel, PanelTitle, ProviderPageHeader } from "@/pages/provider/components/ProviderPrimitives"
import { ProviderShell } from "@/pages/provider/components/ProviderShell"
import { cn } from "@/shared/lib/utils"
import { Button } from "@/shared/ui/button"

type Tone = "success" | "warning" | "danger" | "neutral"
type PeriodPreset = "today" | "last7Days" | "currentMonth" | "all" | "custom"

function getTodayRange() {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
  return { from: from.toISOString(), to: to.toISOString() }
}

function getLastSevenDaysRange(now = new Date()) {
  const from = new Date(now)
  from.setDate(from.getDate() - 7)
  return { from: from.toISOString(), to: now.toISOString() }
}

function getAllTimeRange() {
  return { from: "2020-01-01T00:00:00.000Z", to: new Date().toISOString() }
}

function formatHours(minutes: number) {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(minutes / 60)
}

function CafeStatCard({
  label,
  value,
  helper,
  detail,
  icon,
  tone,
}: {
  label: string
  value: string
  helper: string
  detail?: ReactNode
  icon: ReactNode
  tone: Tone
}) {
  const iconCls = {
    success: "bg-emerald-50 text-emerald-700",
    warning: "bg-amber-50 text-amber-600",
    danger:  "bg-red-50 text-red-600",
    neutral: "bg-[#f6f3f2] text-[#747878]",
  }[tone]
  const helperCls = {
    success: "text-emerald-700",
    warning: "text-amber-600",
    danger: "text-red-600",
    neutral: "text-[#5d5f5f]",
  }[tone]

  return (
    <article className="flex flex-col justify-between rounded-xl border border-[#c4c7c8] bg-white p-5 shadow-sm min-h-[156px]">
      <div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#747878]">{label}</p>
          <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg [&>svg]:size-4", iconCls)}>{icon}</span>
        </div>
        <p className="mt-2 text-[26px] font-extrabold leading-none tracking-tight text-[#1c1b1b]">{value}</p>
      </div>
      <div className="mt-3 space-y-1">
        <p className={cn("text-xs font-semibold leading-snug", helperCls)}>{helper}</p>
        {typeof detail === "string" ? (
          <p className="text-[11px] font-medium text-[#747878] leading-tight">{detail}</p>
        ) : (
          detail
        )}
      </div>
    </article>
  )
}

export function ProviderCafesPage() {
  const navigate = useNavigate()
  const listParams = { page: 1, limit: 100, scope: "managed" as const }
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>("currentMonth")
  const [customFrom, setCustomFrom] = useState("")
  const [customTo, setCustomTo] = useState("")

  const operationQueryParams = useMemo(() => {
    switch (periodPreset) {
      case "today":
        return getTodayRange()
      case "last7Days":
        return getLastSevenDaysRange()
      case "all":
        return getAllTimeRange()
      case "custom":
        if (customFrom && customTo) {
          return {
            from: new Date(customFrom).toISOString(),
            to: new Date(customTo + "T23:59:59.999Z").toISOString(),
          }
        }
        return {}
      case "currentMonth":
      default:
        return {}
    }
  }, [periodPreset, customFrom, customTo])

  const periodLabel = useMemo(() => {
    switch (periodPreset) {
      case "today":
        return "Hôm nay"
      case "last7Days":
        return "7 ngày qua"
      case "all":
        return "Toàn thời gian"
      case "custom":
        return customFrom && customTo
          ? `${customFrom.split("-").reverse().join("/")} – ${customTo.split("-").reverse().join("/")}`
          : "Khoảng ngày chọn"
      case "currentMonth":
      default:
        return "Tháng này"
    }
  }, [periodPreset, customFrom, customTo])

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: cafeQueryKeys.list(listParams),
    queryFn: async () => {
      const firstPage = await cafeApi.listCafes(listParams)
      const pageCount = Math.ceil(firstPage.meta.total / listParams.limit)
      if (pageCount <= 1) return firstPage

      const remainingPages = await Promise.all(
        Array.from({ length: pageCount - 1 }, (_, index) =>
          cafeApi.listCafes({ ...listParams, page: index + 2 }),
        ),
      )
      return {
        ...firstPage,
        data: [firstPage.data, ...remainingPages.map((page) => page.data)].flat(),
      }
    },
  })

  const {
    data: branchOperations = [],
    isLoading: isLoadingOperations,
    isError: isOperationsError,
  } = useQuery({
    queryKey: ["provider-dashboard", "branch-operations", periodPreset, operationQueryParams],
    queryFn: () => providerDashboardApi.getBranchOperations(operationQueryParams),
    staleTime: 15_000,
  })

  /*
    Hạn mức chi nhánh của gói.

    Backend chặn ở `checkBranchQuota` khi tạo cơ sở, nhưng trước đây giao diện
    không biết gì về hạn mức: provider bấm "Thêm cơ sở", điền hết một biểu mẫu
    dài — địa chỉ, toạ độ, giờ hoạt động, loại đường — rồi mới ăn lỗi ở bước
    cuối. Biết trước thì chặn ngay từ cái nút, kèm lý do.
  */
  const { data: subscription } = useQuery({
    queryKey: ["provider-subscription", "branch-quota"],
    queryFn: () => subscriptionApi.getSubscriptionStatus(),
    staleTime: 60_000,
  })

  const cafes = useMemo(() => data?.data ?? [], [data?.data])

  const activeCount = cafes.filter((c) => c.status === "ACTIVE").length
  const pendingCount = cafes.filter((c) => c.status === "PENDING").length

  const operationsByCafe = useMemo(
    () => new Map(branchOperations.map((operation) => [operation.cafeId, operation])),
    [branchOperations],
  )
  const sortedCafes = useMemo(
    () =>
      [...cafes].sort(
        (a, b) =>
          (operationsByCafe.get(b.id)?.totalRevenue ?? 0) -
            (operationsByCafe.get(a.id)?.totalRevenue ?? 0) ||
          a.name.localeCompare(b.name, "vi"),
      ),
    [cafes, operationsByCafe],
  )
  const totalRevenue = branchOperations.reduce(
    (total, operation) => total + operation.totalRevenue,
    0,
  )
  const totalBookableSlotMinutes = branchOperations.reduce(
    (total, operation) => total + operation.bookableSlotMinutes,
    0,
  )
  const totalOccupiedSlotMinutes = branchOperations.reduce(
    (total, operation) => total + operation.occupiedSlotMinutes,
    0,
  )
  const averageOccupancyRate =
    totalBookableSlotMinutes > 0
      ? Math.min(1, totalOccupiedSlotMinutes / totalBookableSlotMinutes)
      : null
  const maintenanceVehicleCount = branchOperations.reduce(
    (total, operation) => total + operation.maintenanceVehicles,
    0,
  )
  const overdueSessionCount = branchOperations.reduce(
    (total, operation) => total + operation.overdueSessionCount,
    0,
  )
  const suspendedCount = branchOperations.filter(
    (operation) => operation.cafeStatus === "SUSPENDED",
  ).length
  const cafesLoaded = !isLoading && !isError
  // `-1` là quy ước "không giới hạn", không phải trừ một chi nhánh.
  const branchLimit = subscription?.data?.plan?.branchLimit ?? null
  const hasBranchLimit = branchLimit !== null && branchLimit >= 0
  // Chưa tải xong danh sách thì chưa kết luận là đã hết hạn mức, tránh khoá
  // nhầm nút trong lúc đang tải.
  const branchQuotaReached =
    cafesLoaded && hasBranchLimit && cafes.length >= (branchLimit as number)
  const operationsLoaded = !isLoadingOperations && !isOperationsError
  const occupancyValue =
    operationsLoaded && averageOccupancyRate !== null
      ? formatOccupancyRate(averageOccupancyRate)
      : "--"
  const totalBookingCount = branchOperations.reduce(
    (total, operation) => total + operation.bookingCount,
    0,
  )

  const occupancyHelper =
    totalBookingCount > 0
      ? `Khách đã đặt: ${formatHours(totalOccupiedSlotMinutes)} giờ sân`
      : `Chưa có lượt đặt sân`
  const occupancyDetail =
    operationsLoaded
      ? `Tổng giờ sân có thể phục vụ: ${formatHours(totalBookableSlotMinutes)} giờ`
      : undefined

  const operationalValue = overdueSessionCount > 0
    ? `${overdueSessionCount} phiên quá giờ`
    : suspendedCount > 0
      ? `${suspendedCount} cơ sở tạm ngưng`
      : maintenanceVehicleCount > 0
        ? `${maintenanceVehicleCount} xe bảo trì`
        : "Hoạt động tốt"

  const operationalHelper = overdueSessionCount > 0
    ? "Cần kiểm tra và xử lý tại cơ sở"
    : suspendedCount > 0
      ? "Cơ sở đang tạm ngưng đón khách"
      : maintenanceVehicleCount > 0
        ? "Tạm ngưng phục vụ xe đang sửa"
        : "Không có vấn đề cần xử lý"

  return (
    <ProviderShell>
      <ProviderPageHeader
        title="Quản lý cơ sở"
        description="Tạo, cập nhật và kiểm soát trạng thái các cơ sở xe RC thuộc provider của bạn."
      />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <CafeStatCard
          label="Tổng doanh thu"
          value={operationsLoaded ? formatCurrency(totalRevenue) : "--"}
          helper={
            isLoadingOperations
              ? "Đang tải doanh thu..."
              : isOperationsError
                ? "Không thể tải doanh thu"
                : totalBookingCount > 0
                  ? `${totalBookingCount} lượt đặt toàn chuỗi`
                  : "Chưa có lượt đặt trong kỳ"
          }
          detail={operationsLoaded ? `Thời gian: ${periodLabel}` : undefined}
          icon={<BarChart3 />}
          tone={isOperationsError ? "danger" : "success"}
        />
        <CafeStatCard
          label="Cơ sở hoạt động"
          value={cafesLoaded ? `${activeCount}/${cafes.length}` : "--"}
          helper={
            isLoading
              ? "Đang tải trạng thái cơ sở"
              : isError
                ? "Không thể tải trạng thái"
                : cafes.length === 0
                  ? "Chưa có cơ sở"
                  : pendingCount > 0
                    ? `${pendingCount} cơ sở đang chờ duyệt`
                    : "Tất cả cơ sở đã kích hoạt"
          }
          detail={
            cafesLoaded
              ? hasBranchLimit
                ? `Đang quản lý ${cafes.length}/${branchLimit} chi nhánh theo gói`
                : `Đang quản lý ${cafes.length} chi nhánh`
              : undefined
          }
          icon={<Building2 />}
          tone={isError ? "danger" : "neutral"}
        />
        <CafeStatCard
          label="Tỷ lệ khai thác sân"
          value={occupancyValue}
          helper={
            isLoadingOperations
              ? "Đang tải dữ liệu vận hành"
              : isOperationsError
                ? "Không thể tải dữ liệu"
                : averageOccupancyRate === null
                  ? "Chưa có dữ liệu sức chứa"
                  : occupancyHelper
          }
          detail={occupancyDetail}
          icon={<TrendingUp />}
          tone={isOperationsError ? "danger" : "neutral"}
        />
        <CafeStatCard
          label="Việc cần xử lý"
          value={operationsLoaded ? operationalValue : "--"}
          helper={
            isLoadingOperations
              ? "Đang tải cảnh báo..."
              : isOperationsError
                ? "Không thể tải cảnh báo"
                : operationalHelper
          }
          detail={
            operationsLoaded ? (
              <div className="mt-2.5 grid grid-cols-3 gap-1 rounded-lg border border-[#e2e4e5] bg-[#fbf9f8] p-1 text-center">
                <div className="px-1 py-0.5">
                  <span className={cn("block text-xs font-black leading-none", overdueSessionCount > 0 ? "text-red-600" : "text-[#1c1b1b]")}>
                    {overdueSessionCount}
                  </span>
                  <span className="mt-0.5 block text-[9px] font-semibold text-[#747878] leading-tight">
                    Phiên quá giờ
                  </span>
                </div>
                <div className="border-x border-[#e2e4e5] px-1 py-0.5">
                  <span className={cn("block text-xs font-black leading-none", maintenanceVehicleCount > 0 ? "text-amber-600" : "text-[#1c1b1b]")}>
                    {maintenanceVehicleCount}
                  </span>
                  <span className="mt-0.5 block text-[9px] font-semibold text-[#747878] leading-tight">
                    Xe bảo trì
                  </span>
                </div>
                <div className="px-1 py-0.5">
                  <span className={cn("block text-xs font-black leading-none", suspendedCount > 0 ? "text-red-600" : "text-[#1c1b1b]")}>
                    {suspendedCount}
                  </span>
                  <span className="mt-0.5 block text-[9px] font-semibold text-[#747878] leading-tight">
                    Cơ sở tạm ngưng
                  </span>
                </div>
              </div>
            ) : undefined
          }
          icon={<AlertTriangle />}
          tone={
            isOperationsError
              ? "danger"
              : overdueSessionCount > 0 || suspendedCount > 0
                ? "danger"
                : maintenanceVehicleCount > 0
                  ? "warning"
                  : "success"
          }
        />
      </section>

      <Panel className="mt-4">
        <PanelTitle
          title="Danh sách cơ sở"
          subtitle={isOperationsError ? "Không thể tải số liệu vận hành để sắp xếp" : `Sắp xếp theo doanh thu (${periodLabel.toLowerCase()})`}
          action={
            branchQuotaReached ? (
              /*
                Hết hạn mức thì đổi hẳn nút thành lối nâng gói, không để một nút
                bị khoá đứng trơ ra. Nút mờ chỉ nói "không được" mà không nói
                vì sao và phải làm gì tiếp.
              */
              <div className="flex flex-col items-end gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate(routePaths.providerSubscriptions)}
                  className="h-9 gap-2 rounded-lg px-4 text-sm font-bold"
                >
                  Nâng gói để thêm cơ sở
                </Button>
                <span className="text-xs text-[#747878]">
                  Gói hiện tại cho tối đa {branchLimit} chi nhánh, bạn đã dùng{" "}
                  {cafes.length}.
                </span>
              </div>
            ) : (
              <Button
                type="button"
                onClick={() => navigate(routePaths.providerCafeCreate)}
                className="h-9 gap-2 rounded-lg bg-[#1c1b1b] px-4 text-sm text-white hover:bg-[#313030] font-bold"
              >
                <Plus className="size-4" />
                Thêm cơ sở
              </Button>
            )
          }
        />

        {/* Bộ lọc thời gian nằm trong phần Danh sách cơ sở */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#e2e4e5] bg-[#fbf9f8] p-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1.5 text-xs font-bold text-[#747878]">Khoảng thời gian:</span>
            {(
              [
                { id: "today", label: "Hôm nay" },
                { id: "last7Days", label: "7 ngày" },
                { id: "currentMonth", label: "Tháng này" },
                { id: "all", label: "Tất cả" },
                { id: "custom", label: "Trong khoảng" },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setPeriodPreset(item.id)}
                className={cn(
                  "h-8 rounded-md px-3 text-xs font-bold transition-all",
                  periodPreset === item.id
                    ? "bg-[#1c1b1b] text-white shadow-sm"
                    : "bg-white text-[#5d5f5f] hover:bg-neutral-100 border border-[#c4c7c8]/60 hover:text-[#1c1b1b]"
                )}
              >
                {item.label}
              </button>
            ))}
          </div>

          {periodPreset === "custom" && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-bold text-[#747878]">Từ:</span>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="h-8 rounded-md border border-[#c4c7c8] bg-white px-2 text-xs font-medium text-[#1c1b1b] focus:outline-none focus:ring-1 focus:ring-[#1c1b1b]"
              />
              <span className="font-bold text-[#747878]">Đến:</span>
              <input
                type="date"
                value={customTo}
                min={customFrom || undefined}
                onChange={(e) => setCustomTo(e.target.value)}
                className="h-8 rounded-md border border-[#c4c7c8] bg-white px-2 text-xs font-medium text-[#1c1b1b] focus:outline-none focus:ring-1 focus:ring-[#1c1b1b]"
              />
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-[72px] animate-pulse rounded-xl bg-[#f6f3f2]" />
            ))}
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <AlertTriangle className="size-8 text-[#c4c7c8]" />
            <p className="text-sm font-medium text-[#747878]">Không thể tải danh sách cơ sở</p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="rounded-lg border border-[#c4c7c8] px-4 py-2 text-sm font-bold text-[#1c1b1b] hover:bg-[#f6f3f2] transition-colors"
            >
              Thử lại
            </button>
          </div>
        ) : (
          <BranchList cafes={sortedCafes} operationsByCafe={operationsByCafe} />
        )}
      </Panel>
    </ProviderShell>
  )
}
