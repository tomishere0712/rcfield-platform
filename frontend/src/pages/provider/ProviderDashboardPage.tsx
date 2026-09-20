import { Link, useSearchParams } from "react-router"
import { useState, useEffect, useCallback, useMemo } from "react"
import {
  ArrowRight,
  BarChart3,
  Car,
  CheckCircle2,
  ClipboardList,
  Download,
  PlayCircle,
  Users,
  Wrench,
  Building2,
  Clock,
  Sparkles,
  PartyPopper,
  TrendingUp,
  TrendingDown,
  CalendarRange,
  X,
} from "lucide-react"
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts"

import type { LegendPayload, TooltipValueType } from "recharts"
import { useQuery } from "@tanstack/react-query"

import { routePaths } from "@/app/router/route-paths"
import { ProviderPageHeader } from "@/pages/provider/components/ProviderPrimitives"
import { ProviderShell } from "@/pages/provider/components/ProviderShell"
import { cn } from "@/shared/lib/utils"
import { Button } from "@/shared/ui/button"
import { toast } from "sonner"
import { useProviderDashboard } from "@/features/dashboard/hooks/useProviderDashboard"
import { providerDashboardApi } from "@/features/dashboard/api/provider-dashboard.api"
import { cafeApi } from "@/features/cafes/api/cafe.api"
import { vehicleApi } from "@/features/vehicles/api/vehicle.api"
import type { BookingChannelItem, RevenuePeriod, RecentBookingItem } from "@/features/dashboard/types/dashboard.types"
import { AiInsightsPanel } from "@/features/dashboard/components/AiInsightsPanel"
import ExcelJS from "exceljs"
import { saveAs } from "file-saver"

function formatTooltipCurrency(value: TooltipValueType | undefined): string {
  const numericValue = Array.isArray(value) ? value[0] : value
  return formatCurrency(Number(numericValue ?? 0))
}

const FEE_COLOR_MAP: Record<string, string> = {
  SLOT_FEE: "#ec4899",
  RENTAL_FEE: "#3b82f6",
  FNB_PREORDER: "#ef4444",
  EXTENSION_FEE: "#10b981",
  DAMAGE_CHARGE: "#f59e0b",
  PACKAGE_PURCHASE: "#8b5cf6",
}

const drawPieChartCanvas = (data: { label: string; amount: number; type: string }[]): string => {
  const canvas = document.createElement("canvas")
  canvas.width = 500
  canvas.height = 360
  const ctx = canvas.getContext("2d")
  if (!ctx) return ""

  // Vẽ nền trắng
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const total = data.reduce((sum, item) => sum + item.amount, 0)
  if (total === 0) return ""

  const centerX = 160
  const centerY = 180
  const radius = 110

  let startAngle = -Math.PI / 2

  // 1. Vẽ các lát bánh Donut
  data.forEach((item) => {
    const sliceAngle = (item.amount / total) * 2 * Math.PI
    const endAngle = startAngle + sliceAngle

    ctx.beginPath()
    ctx.moveTo(centerX, centerY)
    ctx.arc(centerX, centerY, radius, startAngle, endAngle)
    ctx.closePath()

    ctx.fillStyle = FEE_COLOR_MAP[item.type] || "#cccccc"
    ctx.fill()

    ctx.strokeStyle = "#ffffff"
    ctx.lineWidth = 2
    ctx.stroke()

    startAngle = endAngle
  })

  // 2. Vẽ vòng tròn trắng ở giữa để tạo Donut Chart
  ctx.beginPath()
  ctx.arc(centerX, centerY, radius * 0.55, 0, 2 * Math.PI)
  ctx.fillStyle = "#ffffff"
  ctx.fill()

  // 3. Vẽ chú thích (Legend) ở bên phải
  const legendX = 310
  let legendY = 60
  const boxSize = 12

  // Tiêu đề nhỏ cho Legend
  ctx.fillStyle = "#0f172a"
  ctx.font = "bold 12px Calibri, sans-serif"
  ctx.fillText("Tỷ trọng nguồn thu", legendX, legendY - 20)

  data.forEach((item) => {
    ctx.fillStyle = FEE_COLOR_MAP[item.type] || "#cccccc"
    ctx.fillRect(legendX, legendY, boxSize, boxSize)

    const percentage = ((item.amount / total) * 100).toFixed(1)
    
    ctx.fillStyle = "#334155"
    ctx.font = "bold 11px Calibri, sans-serif"
    ctx.textAlign = "left"
    ctx.textBaseline = "middle"
    ctx.fillText(`${item.label} (${percentage}%)`, legendX + boxSize + 8, legendY + boxSize / 2)

    legendY += 24
  })

  return canvas.toDataURL("image/png")
}

export function ProviderDashboardPage() {
  const [onboardingCompleted, setOnboardingCompleted] = useState(() => {
    return localStorage.getItem("onboarding_completed") === "true"
  })

  const [viewSetup, setViewSetup] = useState(() => {
    return localStorage.getItem("view_setup") === "true"
  })

  // Lấy dữ liệu danh sách chi nhánh của Provider để check onboarding thật
  const { data: cafesData, isLoading: isLoadingCafes } = useQuery({
    queryKey: ["provider-cafes-list-onboarding"],
    queryFn: () => cafeApi.listCafes({ scope: "managed", limit: 100 }),
    staleTime: 30000,
  })
  const cafes = cafesData?.data ?? []

  // Check các bước onboarding dựa trên dữ liệu thật
  const branchesCreated = cafes.length > 0
  const operationalHoursSet = cafes.some(
    (c) => c.operatingHours && Object.keys(c.operatingHours).length > 0,
  )

  const firstCafeId = cafes[0]?.id
  const { data: vehiclesData, isLoading: isLoadingVehicles } = useQuery({
    queryKey: ["provider-vehicles-list-onboarding", firstCafeId],
    queryFn: () =>
      firstCafeId ? vehicleApi.listUnits(firstCafeId) : Promise.resolve([]),
    enabled: !!firstCafeId,
    staleTime: 30000,
  })
  const vehiclesAdded = (vehiclesData ?? []).length > 0

  const steps = {
    branchesCreated,
    vehiclesAdded,
    operationalHoursSet,
  }

  const completedCount = Object.values(steps).filter(Boolean).length
  const allStepsCompleted = completedCount === 3

  // Tự động kích hoạt dashboard khi người dùng hoàn thành 3 bước thật sự trên DB
  // nhưng chỉ tự động khi họ không ở chế độ chủ động xem lại setup
  useEffect(() => {
    if (allStepsCompleted && !onboardingCompleted && !viewSetup) {
      queueMicrotask(() => {
        localStorage.setItem("onboarding_completed", "true")
        setOnboardingCompleted(true)
        toast.success(
          "Chúc mừng! Bạn đã hoàn thành tất cả các bước thiết lập cơ bản. Kích hoạt Dashboard thành công!",
        )
      })
    }
  }, [allStepsCompleted, onboardingCompleted, viewSetup])

  const handleCompleteAll = () => {
    if (allStepsCompleted) {
      localStorage.setItem("onboarding_completed", "true")
      localStorage.removeItem("view_setup")
      setOnboardingCompleted(true)
      setViewSetup(false)
      toast.success("Chào mừng bạn đến với Dashboard quản trị!")
    } else {
      toast.error(
        "Bạn cần hoàn thành cả 3 bước thiết lập cơ bản (Tạo chi nhánh, đăng ký xe và giờ hoạt động) để vào Dashboard.",
      )
    }
  }



  const isLoadingOnboarding =
    isLoadingCafes || (branchesCreated && isLoadingVehicles)

  if (isLoadingOnboarding) {
    return (
      <ProviderShell>
        <div className="flex h-[60vh] items-center justify-center">
          <div className="text-center space-y-3">
            <div className="size-8 rounded-full border-4 border-orange-500 border-t-transparent animate-spin mx-auto" />
            <p className="text-sm font-bold text-slate-500">
              Đang kiểm tra trạng thái thiết lập...
            </p>
          </div>
        </div>
      </ProviderShell>
    )
  }

  const showOnboarding = !allStepsCompleted || viewSetup || !onboardingCompleted

  if (showOnboarding) {
    return (
      <ProviderShell>
        <ProviderPageHeader
          title="Thiết lập tài khoản"
          description="Hoàn thành các bước hướng dẫn dưới đây để kích hoạt đầy đủ tính năng"
        />

        <OnboardingChecklist steps={steps} onCompleteAll={handleCompleteAll} />
      </ProviderShell>
    )
  }

  return <RealDashboard />
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCurrency(amount: number): string {
  if (amount >= 1_000_000_000)
    return `${(amount / 1_000_000_000).toFixed(1)}T ₫`
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}M ₫`
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(0)}K ₫`
  return `${amount.toLocaleString("vi-VN")} ₫`
}

function getDefaultDateRange(period: RevenuePeriod): {
  from: string
  to: string
} {
  const to = new Date()
  const from = new Date()

  // Thiết lập thời gian cố định trong ngày để tránh thay đổi mili giây kích hoạt API liên tục
  to.setHours(23, 59, 59, 999)

  if (period === "daily") {
    from.setDate(from.getDate() - 14)
  } else if (period === "weekly") {
    from.setDate(from.getDate() - 84)
  } else {
    from.setMonth(from.getMonth() - 12)
  }
  from.setHours(0, 0, 0, 0)

  return { from: from.toISOString(), to: to.toISOString() }
}

const CHART_COLORS = {
  slotFee: "#ec4899",
  rentalFee: "#3b82f6",
  fnbPreorder: "#ef4444",
  extensionFee: "#10b981",
  damageCharge: "#f59e0b",
  packageFee: "#8b5cf6",
  contestFee: "#0ea5e9",
}

// Map màu cố định theo type — dùng cho cả AreaChart lẫn PieChart


const PIE_COLORS = ["#ec4899", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"]

// ── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  icon,
  trend,
  trendText,
  accentColor = "orange",
}: {
  label: string
  value: string
  sub?: string
  icon: React.ReactNode
  trend?: "up" | "down" | "neutral"
  trendText?: string
  accentColor?: string
}) {
  const trendIcon =
    trend === "up" ? (
      <TrendingUp className="size-3.5 text-emerald-600" />
    ) : trend === "down" ? (
      <TrendingDown className="size-3.5 text-red-500" />
    ) : null
  const trendColor =
    trend === "up"
      ? "text-emerald-600"
      : trend === "down"
        ? "text-red-500"
        : "text-slate-500"

  return (
    <div className="group relative overflow-hidden rounded-xl border border-[#e5e2e1] bg-white p-5 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5">
      <div
        className="absolute top-0 right-0 size-24 rounded-full opacity-5 blur-2xl"
        style={{
          background:
            accentColor === "orange"
              ? "#ea580c"
              : accentColor === "blue"
                ? "#3b82f6"
                : "#8b5cf6",
        }}
      />
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-[#747878]">
          {label}
        </span>
        <div
          className={cn(
            "flex size-8 items-center justify-center rounded-lg [&_svg]:size-4",
            accentColor === "orange"
              ? "bg-orange-50 text-orange-600"
              : accentColor === "blue"
                ? "bg-blue-50 text-blue-600"
                : accentColor === "purple"
                  ? "bg-purple-50 text-purple-600"
                  : "bg-emerald-50 text-emerald-600",
          )}
        >
          {icon}
        </div>
      </div>
      <div className="text-2xl font-extrabold tracking-tight text-[#1c1b1b]">
        {value}
      </div>
      {sub && (
        <p className="mt-0.5 text-xs text-[#747878] font-medium">{sub}</p>
      )}
      {trendText && (
        <div className="mt-2 flex items-center gap-1">
          {trendIcon}
          <span className={cn("text-xs font-semibold", trendColor)}>
            {trendText}
          </span>
        </div>
      )}
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-[#e5e2e1] bg-white p-5 shadow-sm animate-pulse">
      <div className="mb-3 h-4 w-24 rounded bg-slate-100" />
      <div className="h-8 w-32 rounded bg-slate-100" />
      <div className="mt-2 h-3 w-20 rounded bg-slate-100" />
    </div>
  )
}

function BookingStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    CONFIRMED: {
      label: "Đã xác nhận",
      cls: "bg-blue-50 text-blue-700 border-blue-200",
    },
    COMPLETED: {
      label: "Hoàn thành",
      cls: "bg-emerald-50 text-emerald-700 border-emerald-200",
    },
    CANCELLED: {
      label: "Đã hủy",
      cls: "bg-red-50 text-red-700 border-red-200",
    },
    PENDING: {
      label: "Chờ TT",
      cls: "bg-amber-50 text-amber-700 border-amber-200",
    },
    NO_SHOW: {
      label: "Vắng mặt",
      cls: "bg-slate-50 text-slate-600 border-slate-200",
    },
  }
  const { label, cls } = map[status] ?? {
    label: status,
    cls: "bg-slate-50 text-slate-500 border-slate-200",
  }
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-bold",
        cls,
      )}
    >
      {label}
    </span>
  )
}

function FleetStatusItem({
  label,
  value,
  icon,
  color,
}: {
  label: string
  value: number
  icon: React.ReactNode
  color: "emerald" | "blue" | "red"
}) {
  const colorMap = {
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-100",
    blue: "bg-blue-50 text-blue-700 border-blue-100",
    red: "bg-red-50 text-red-700 border-red-100",
  }
  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-lg border p-3",
        colorMap[color],
      )}
    >
      <div className="flex items-center gap-2.5">
        {icon}
        <span className="text-xs font-bold">{label}</span>
      </div>
      <span className="text-xl font-extrabold">{value}</span>
    </div>
  )
}

// ── Real Dashboard (hiển thị sau onboarding) ─────────────────────────────────

function RealDashboard() {
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedCafeId = searchParams.get("cafeId") || null
  const [period, setPeriod] = useState<RevenuePeriod>("daily")
  const [customFrom, setCustomFrom] = useState("")
  const [customTo, setCustomTo] = useState("")
  const [hoveredSeries, setHoveredSeries] = useState<string | null>(null)
  const [hoveredLegendSeries, setHoveredLegendSeries] = useState<string | null>(null)
  const [selectedLegendSeries, setSelectedLegendSeries] = useState<string | null>(null)
  const [activeTooltipIndex, setActiveTooltipIndex] = useState<number | undefined>(undefined)
  const [hoveredPieType, setHoveredPieType] = useState<string | null>(null)

  const handleCafeChange = (newCafeId: string | null) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (newCafeId) {
        next.set("cafeId", newCafeId)
      } else {
        next.delete("cafeId")
      }
      return next
    })
  }

  // Sử dụng useMemo để tránh tính toán lại và thay đổi tham chiếu object ở mỗi lần render
  const defaultRange = useMemo(() => getDefaultDateRange(period), [period])
  const from = customFrom || defaultRange.from
  const to = customTo || defaultRange.to

  const { data: cafesData } = useQuery({
    queryKey: ["provider-cafes-list"],
    queryFn: () => cafeApi.listCafes({ scope: "managed", limit: 100 }),
    staleTime: 300_000,
  })
  const cafes = cafesData?.data ?? []

  const { data: featureFlags } = useQuery({
    queryKey: ["provider-feature-flags"],
    queryFn: providerDashboardApi.getProviderFeatureFlags,
    staleTime: 5 * 60_000,
  })
  const isAiAnalyticsEnabled = featureFlags?.AI_REVENUE_ANALYTICS ?? false

  const { kpi, trend, breakdown, channels, branches, recent, topStats, isLoading } =
    useProviderDashboard({
      cafeId: selectedCafeId,
      period,
      from,
      to,
    })

  const handleExportReport = async () => {
    if (!kpi) {
      toast.error("Không có dữ liệu để xuất báo cáo!")
      return
    }

    const toastId = toast.loading("Đang nạp dữ liệu đơn đặt...")
    let exportBookings: RecentBookingItem[]
    try {
      exportBookings = await providerDashboardApi.getRecentBookings({
        from,
        to,
        cafeId: selectedCafeId
      })
    } catch {
      toast.dismiss(toastId)
      toast.error("Không thể tải danh sách đơn đặt để xuất báo cáo.")
      return
    }
    toast.dismiss(toastId)

    // 1. Tạo Workbook mới
    const workbook = new ExcelJS.Workbook()
    workbook.creator = "RCField System"

    // Định nghĩa bảng màu và style chung (Slate 900 cho Header, Gray 100 cho Alternating)
    const headerFill: ExcelJS.Fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0F172A" } // Slate 900
    }
    const headerFont: Partial<ExcelJS.Font> = {
      name: "Calibri",
      size: 11,
      bold: true,
      color: { argb: "FFFFFFFF" }
    }
    const headerAlignment: Partial<ExcelJS.Alignment> = {
      vertical: "middle",
      horizontal: "center",
      wrapText: true
    }
    const cellBorder: Partial<ExcelJS.Borders> = {
      top: { style: "thin", color: { argb: "FFE2E8F0" } },
      left: { style: "thin", color: { argb: "FFE2E8F0" } },
      bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
      right: { style: "thin", color: { argb: "FFE2E8F0" } }
    }

    // ────────────────────────────────────────────────────────────────────────────
    // SHEET 1: TỔNG QUAN
    // ────────────────────────────────────────────────────────────────────────────
    const wsKpi = workbook.addWorksheet("Tổng quan")
    wsKpi.views = [{ showGridLines: true }]

    // Tiêu đề báo cáo
    wsKpi.mergeCells("A1:C1")
    const titleCell = wsKpi.getCell("A1")
    titleCell.value = "BÁO CÁO DOANH THU HỆ THỐNG RCFIELD"
    titleCell.font = { name: "Calibri", size: 16, bold: true, color: { argb: "FFEA580C" } } // Màu cam
    titleCell.alignment = { vertical: "middle", horizontal: "left" }

    wsKpi.addRow([`Thời gian xuất: ${new Date().toLocaleString("vi-VN")}`])
    wsKpi.addRow([`Chi nhánh: ${selectedCafeId ? (cafes.find((c: { id: string; name: string }) => c.id === selectedCafeId)?.name || "Chi nhánh đã chọn") : "Tất cả chi nhánh"}`])
    wsKpi.addRow([`Khoảng thời gian: Từ ${new Date(from).toLocaleDateString("vi-VN")} đến ${new Date(to).toLocaleDateString("vi-VN")}`])
    wsKpi.addRow([]) // Dòng trống

    // Header bảng
    const kpiHeaderRow = wsKpi.addRow(["Chỉ số", "Giá trị", "Mô tả"])
    kpiHeaderRow.height = 25
    kpiHeaderRow.eachCell((cell) => {
      cell.fill = headerFill
      cell.font = headerFont
      cell.alignment = headerAlignment
      cell.border = cellBorder
    })

    const completionRate = kpi.totalBookings > 0 ? ((kpi.completedBookings / kpi.totalBookings) * 100).toFixed(0) : "0"
    const vehicleRate = (kpi.vehicleUtilizationRate * 100).toFixed(0)

    const kpiRows = [
      ["Tổng doanh thu (đ)", kpi.totalRevenue, "Doanh thu thực tế"],
      ["Tổng lượt đặt", kpi.totalBookings, "Tất cả trạng thái"],
      ["Tỷ lệ hoàn thành đơn", `${completionRate}%`, `${kpi.completedBookings}/${kpi.totalBookings} lượt`],
      ["Tỷ lệ xe hoạt động", `${vehicleRate}%`, `${kpi.inUseVehicles}/${kpi.totalVehicles} xe`],
      ["Khách hàng mới", kpi.newCustomers, "Lần đầu đặt trong kỳ"]
    ]

    kpiRows.forEach((row, index) => {
      const addedRow = wsKpi.addRow(row)
      addedRow.height = 22
      addedRow.eachCell((cell, colNum) => {
        cell.border = cellBorder
        cell.font = { name: "Calibri", size: 11 }
        if (colNum === 2) {
          cell.alignment = { horizontal: "right", vertical: "middle" }
          if (typeof cell.value === "number") {
            cell.numFmt = "#,##0"
          }
        } else {
          cell.alignment = { horizontal: "left", vertical: "middle" }
        }
        if (index % 2 === 1) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } }
        }
      })
    })

    // Tự động giãn cột
    wsKpi.columns.forEach((column) => {
      let maxLen = 0
      column.eachCell?.({ includeEmpty: false }, (cell) => {
        const valStr = cell.value ? cell.value.toString() : ""
        if (valStr.length > maxLen) maxLen = valStr.length
      })
      column.width = Math.max(maxLen + 4, 15)
    })

    // ────────────────────────────────────────────────────────────────────────────
    // SHEET 2: PHÂN BỔ DOANH THU (NGUỒN THU)
    // ────────────────────────────────────────────────────────────────────────────
    const wsBreakdown = workbook.addWorksheet("Nguồn thu")
    wsBreakdown.views = [{ showGridLines: true }]

    wsBreakdown.mergeCells("A1:B1")
    const bdTitle = wsBreakdown.getCell("A1")
    bdTitle.value = "PHÂN BỔ DOANH THU THEO NGUỒN THU"
    bdTitle.font = { name: "Calibri", size: 14, bold: true, color: { argb: "FF0F172A" } }
    wsBreakdown.addRow([]) // Dòng trống

    const bdHeader = wsBreakdown.addRow(["Nguồn thu", "Doanh thu (đ)"])
    bdHeader.height = 25
    bdHeader.eachCell((cell) => {
      cell.fill = headerFill
      cell.font = headerFont
      cell.alignment = headerAlignment
      cell.border = cellBorder
    })

    if (breakdown && breakdown.length > 0) {
      breakdown.forEach((item: { label: string; amount: number }, index: number) => {
        const row = wsBreakdown.addRow([item.label, item.amount])
        row.height = 22
        row.eachCell((cell, colNum) => {
          cell.border = cellBorder
          cell.font = { name: "Calibri", size: 11 }
          if (colNum === 2) {
            cell.alignment = { horizontal: "right", vertical: "middle" }
            cell.numFmt = "#,##0"
          } else {
            cell.alignment = { horizontal: "left", vertical: "middle" }
          }
          if (index % 2 === 1) {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } }
          }
        })
      })
    } else {
      const emptyRow = wsBreakdown.addRow(["Không có dữ liệu", 0])
      emptyRow.eachCell(cell => cell.border = cellBorder)
    }

    wsBreakdown.columns.forEach((column) => {
      let maxLen = 0
      column.eachCell?.({ includeEmpty: false }, (cell) => {
        const valStr = cell.value ? cell.value.toString() : ""
        if (valStr.length > maxLen) maxLen = valStr.length
      })
      column.width = Math.max(maxLen + 4, 18)
    })

    // Thêm biểu đồ Donut trực quan phân bổ doanh thu nguồn thu
    const chartBase64 = drawPieChartCanvas(breakdown)
    if (chartBase64) {
      const imageId = workbook.addImage({
        base64: chartBase64,
        extension: "png"
      })
      wsBreakdown.addImage(imageId, {
        tl: { col: 3, row: 2 }, // Đặt tại D3
        ext: { width: 450, height: 324 }
      })
    }

    // ────────────────────────────────────────────────────────────────────────────
    // SHEET 3: CHI NHÁNH
    // ────────────────────────────────────────────────────────────────────────────
    const wsBranches = workbook.addWorksheet("Chi nhánh")
    wsBranches.views = [{ showGridLines: true }]

    wsBranches.mergeCells("A1:C1")
    const brTitle = wsBranches.getCell("A1")
    brTitle.value = "DOANH THU CHI TIẾT THEO CHI NHÁNH"
    brTitle.font = { name: "Calibri", size: 14, bold: true, color: { argb: "FF0F172A" } }
    wsBranches.addRow([]) // Dòng trống

    const brHeader = wsBranches.addRow(["Tên chi nhánh", "Doanh thu (đ)", "Số lượt đặt"])
    brHeader.height = 25
    brHeader.eachCell((cell) => {
      cell.fill = headerFill
      cell.font = headerFont
      cell.alignment = headerAlignment
      cell.border = cellBorder
    })

    if (branches && branches.length > 0) {
      branches.forEach((item: { cafeName: string; totalRevenue: number; bookingCount: number }, index: number) => {
        const row = wsBranches.addRow([
          item.cafeName,
          item.totalRevenue,
          item.bookingCount
        ])
        row.height = 22
        row.eachCell((cell, colNum) => {
          cell.border = cellBorder
          cell.font = { name: "Calibri", size: 11 }
          if (colNum === 2 || colNum === 3) {
            cell.alignment = { horizontal: "right", vertical: "middle" }
            if (colNum === 2) cell.numFmt = "#,##0"
          } else {
            cell.alignment = { horizontal: "left", vertical: "middle" }
          }
          if (index % 2 === 1) {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } }
          }
        })
      })
    } else {
      const emptyRow = wsBranches.addRow(["Không có dữ liệu", 0, 0])
      emptyRow.eachCell(cell => cell.border = cellBorder)
    }

    wsBranches.columns.forEach((column) => {
      let maxLen = 0
      column.eachCell?.({ includeEmpty: false }, (cell) => {
        const valStr = cell.value ? cell.value.toString() : ""
        if (valStr.length > maxLen) maxLen = valStr.length
      })
      column.width = Math.max(maxLen + 4, 18)
    })

    // ────────────────────────────────────────────────────────────────────────────
    // SHEET 4: XU HƯỚNG
    // ────────────────────────────────────────────────────────────────────────────
    const wsTrend = workbook.addWorksheet("Xu hướng")
    wsTrend.views = [{ showGridLines: true }]

    wsTrend.mergeCells("A1:G1")
    const trTitle = wsTrend.getCell("A1")
    trTitle.value = "XU HƯỚNG DOANH THU THEO THỜI GIAN"
    trTitle.font = { name: "Calibri", size: 14, bold: true, color: { argb: "FF0F172A" } }
    wsTrend.addRow([]) // Dòng trống

    const trHeader = wsTrend.addRow([
      "Thời gian",
      "Phí sân (đ)",
      "Thuê xe (đ)",
      "Đồ ăn & thức uống (đ)",
      "Phí gia hạn (đ)",
      "Phí bồi thường (đ)",
      "Phí gói (đ)",
      "Phí dự giải (đ)"
    ])
    trHeader.height = 25
    trHeader.eachCell((cell) => {
      cell.fill = headerFill
      cell.font = headerFont
      cell.alignment = headerAlignment
      cell.border = cellBorder
    })

    if (trend && trend.length > 0) {
      trend.forEach((item, index: number) => {
        const row = wsTrend.addRow([
          item.label,
          item.slotFee || 0,
          item.rentalFee || 0,
          item.fnbPreorder || 0,
          item.extensionFee || 0,
          item.damageCharge || 0,
          item.packageFee || 0,
          item.contestFee || 0
        ])
        row.height = 22
        row.eachCell((cell, colNum) => {
          cell.border = cellBorder
          cell.font = { name: "Calibri", size: 11 }
          if (colNum > 1) {
            cell.alignment = { horizontal: "right", vertical: "middle" }
            cell.numFmt = "#,##0"
          } else {
            cell.alignment = { horizontal: "center", vertical: "middle" }
          }
          if (index % 2 === 1) {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } }
          }
        })
      })
    } else {
      const emptyRow = wsTrend.addRow(["Không có dữ liệu", 0, 0, 0, 0, 0, 0])
      emptyRow.eachCell(cell => cell.border = cellBorder)
    }

    wsTrend.columns.forEach((column) => {
      let maxLen = 0
      column.eachCell?.({ includeEmpty: false }, (cell) => {
        const valStr = cell.value ? cell.value.toString() : ""
        if (valStr.length > maxLen) maxLen = valStr.length
      })
      column.width = Math.max(maxLen + 4, 15)
    })

    // ────────────────────────────────────────────────────────────────────────────
    // SHEET 5: CHI TIẾT ĐƠN ĐẶT (BOOKINGS)
    // ────────────────────────────────────────────────────────────────────────────
    const wsBookings = workbook.addWorksheet("Đơn đặt")
    wsBookings.views = [{ showGridLines: true }]

    wsBookings.mergeCells("A1:G1")
    const bkTitle = wsBookings.getCell("A1")
    bkTitle.value = "DANH SÁCH CHI TIẾT ĐƠN ĐẶT TRONG KỲ"
    bkTitle.font = { name: "Calibri", size: 14, bold: true, color: { argb: "FF0F172A" } }
    wsBookings.addRow([]) // Dòng trống

    const bkHeader = wsBookings.addRow([
      "Mã đơn đặt",
      "Chi nhánh",
      "Khách hàng",
      "Chế độ chơi",
      "Thời gian bắt đầu",
      "Trạng thái",
      "Tổng thanh toán (đ)"
    ])
    bkHeader.height = 25
    bkHeader.eachCell((cell) => {
      cell.fill = headerFill
      cell.font = headerFont
      cell.alignment = headerAlignment
      cell.border = cellBorder
    })

    const translatePlayMode = (mode: string) => {
      if (mode === "RENTAL") return "Thuê xe"
      if (mode === "BYOC") return "Tự mang xe"
      return mode
    }

    const translateStatus = (status: string) => {
      const map: Record<string, string> = {
        CONFIRMED: "Đã xác nhận",
        COMPLETED: "Hoàn thành",
        CANCELLED: "Đã hủy",
        PENDING: "Chờ thanh toán",
        NO_SHOW: "Vắng mặt",
      }
      return map[status] || status
    }

    if (exportBookings && exportBookings.length > 0) {
      exportBookings.forEach((item: RecentBookingItem, index: number) => {
        const formattedDate = new Date(item.slotStart).toLocaleString("vi-VN")
        const row = wsBookings.addRow([
          item.bookingId,
          item.cafeName,
          item.customerName,
          translatePlayMode(item.playMode),
          formattedDate,
          translateStatus(item.status),
          item.totalCharged
        ])
        row.height = 22
        row.eachCell((cell, colNum) => {
          cell.border = cellBorder
          cell.font = { name: "Calibri", size: 11 }
          
          if (colNum === 7) {
            cell.alignment = { horizontal: "right", vertical: "middle" }
            cell.numFmt = "#,##0"
          } else if (colNum === 4 || colNum === 5 || colNum === 6) {
            cell.alignment = { horizontal: "center", vertical: "middle" }
          } else {
            cell.alignment = { horizontal: "left", vertical: "middle" }
          }

          if (index % 2 === 1) {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } }
          }
        })
      })
    } else {
      const emptyRow = wsBookings.addRow(["Không có dữ liệu đơn đặt", "", "", "", "", "", 0])
      emptyRow.eachCell(cell => cell.border = cellBorder)
    }

    wsBookings.columns.forEach((column) => {
      let maxLen = 0
      column.eachCell?.({ includeEmpty: false }, (cell) => {
        const valStr = cell.value ? cell.value.toString() : ""
        if (valStr.length > maxLen) maxLen = valStr.length
      })
      column.width = Math.max(maxLen + 4, 15)
    })

    // 6. Ghi và tải file Excel xuống
    const buffer = await workbook.xlsx.writeBuffer()
    const branchNameSafe = selectedCafeId 
      ? (cafes.find((c: { id: string; name: string }) => c.id === selectedCafeId)?.name || "branch").replace(/\s+/g, "_") 
      : "cac_chi_nhanh"
    const dateStr = new Date().toISOString().substring(0, 10)
    
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
    saveAs(blob, `Bao_cao_doanh_thu_${branchNameSafe}_${dateStr}.xlsx`)

    toast.success("Tải báo cáo Excel thành công!")
  }

  const handleFromChange = useCallback(
    (val: string) => {
      if (!val) {
        setCustomFrom("")
        return
      }
      const fromIso = new Date(val).toISOString()
      setCustomFrom(fromIso)

      if (customTo) {
        const currentToDate = new Date(customTo)
        const newFromDate = new Date(val)
        if (currentToDate < newFromDate) {
          setCustomTo(new Date(val + "T23:59:59").toISOString())
        }
      }
    },
    [customTo],
  )

  const handleToChange = useCallback(
    (val: string) => {
      if (!val) {
        setCustomTo("")
        return
      }
      const toIso = new Date(val + "T23:59:59").toISOString()
      setCustomTo(toIso)

      if (customFrom) {
        const currentFromDate = new Date(customFrom)
        const newToDate = new Date(val)
        if (currentFromDate > newToDate) {
          setCustomFrom(new Date(val).toISOString())
        }
      }
    },
    [customFrom],
  )

  const handleClearDateRange = useCallback(() => {
    setCustomFrom("")
    setCustomTo("")
  }, [])

  const handlePeriodChange = useCallback((p: RevenuePeriod) => {
    setPeriod(p)
    setCustomFrom("")
    setCustomTo("")
  }, [])

  return (
    <ProviderShell>
      <ProviderPageHeader
        title="Tổng quan hệ thống"
        description={`Dữ liệu cập nhật hôm nay, ${new Date().toLocaleDateString("vi-VN", { day: "numeric", month: "long", year: "numeric" })}`}
      />

      {/* Thanh bộ lọc */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Building2 className="size-4 text-[#747878]" />
          <select
            value={selectedCafeId ?? ""}
            onChange={(e) => handleCafeChange(e.target.value || null)}
            className="w-full sm:w-auto rounded-lg border border-[#c4c7c8] bg-white px-3 py-1.5 text-sm font-semibold text-[#1c1b1b] focus:border-orange-400 focus:outline-none"
          >
            <option value="">Tất cả chi nhánh</option>
            {cafes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <div className="flex rounded-lg border border-[#c4c7c8] bg-[#f1edec] p-0.5 w-full sm:w-auto justify-between sm:justify-start">
            {(["daily", "weekly", "monthly"] as RevenuePeriod[]).map((p) => (
              <button
                key={p}
                onClick={() => handlePeriodChange(p)}
                className={cn(
                  "flex-1 sm:flex-none text-center rounded-md px-3 py-1.5 text-xs font-bold transition-all",
                  period === p && !customFrom
                    ? "bg-white text-[#1c1b1b] shadow-sm"
                    : "text-[#5d5f5f] hover:text-[#1c1b1b]",
                )}
              >
                {p === "daily"
                  ? "14 ngày"
                  : p === "weekly"
                    ? "12 tuần"
                    : "12 tháng"}
              </button>
            ))}
          </div>

          <div className="flex flex-1 sm:flex-none items-center justify-between sm:justify-start gap-1.5 rounded-lg border border-[#c4c7c8] bg-white px-3 py-1.5 w-full sm:w-auto">
            <CalendarRange className="size-3.5 text-[#747878] shrink-0" />
            <input
              type="date"
              value={customFrom ? customFrom.substring(0, 10) : ""}
              max={customTo ? customTo.substring(0, 10) : undefined}
              onChange={(e) => handleFromChange(e.target.value)}
              className="text-xs font-semibold text-[#1c1b1b] focus:outline-none bg-transparent w-full"
            />
            <span className="text-xs text-[#747878] shrink-0">–</span>
            <input
              type="date"
              value={customTo ? customTo.substring(0, 10) : ""}
              min={customFrom ? customFrom.substring(0, 10) : undefined}
              onChange={(e) => handleToChange(e.target.value)}
              className="text-xs font-semibold text-[#1c1b1b] focus:outline-none bg-transparent w-full"
            />
          </div>

          {(customFrom || customTo) && (
            <Button
              variant="outline"
              size="icon"
              onClick={handleClearDateRange}
              className="h-9 w-9 rounded-lg border-red-200 bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700 font-bold shrink-0"
              title="Xóa bộ lọc ngày"
            >
              <X className="size-4" />
            </Button>
          )}

          <Button
            variant="outline"
            onClick={handleExportReport}
            className="h-9 gap-1.5 rounded-lg border-[#c4c7c8] text-xs font-bold flex-1 sm:flex-none justify-center"
          >
            <Download className="size-3.5" />
            Xuất báo cáo
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <section className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <KpiCard
              label="Tổng doanh thu"
              value={kpi ? formatCurrency(kpi.totalRevenue) : "—"}
              sub="Doanh thu thực tế"
              icon={<BarChart3 />}
              accentColor="orange"
              trend={kpi && kpi.totalRevenue > 0 ? "up" : "neutral"}
              trendText={
                kpi ? `${kpi.completedBookings} booking hoàn thành` : ""
              }
            />
            <KpiCard
              label="Tổng lượt đặt"
              value={kpi ? kpi.totalBookings.toLocaleString("vi-VN") : "—"}
              sub="Tất cả trạng thái"
              icon={<ClipboardList />}
              accentColor="blue"
              trend={kpi && kpi.cancellationRate < 0.1 ? "up" : "down"}
              trendText={
                kpi
                  ? `${(kpi.cancellationRate * 100).toFixed(1)}% tỷ lệ hủy`
                  : ""
              }
            />
            <KpiCard
              label="Tỷ lệ hoàn thành đơn"
              value={
                kpi
                  ? `${kpi.totalBookings > 0 ? ((kpi.completedBookings / kpi.totalBookings) * 100).toFixed(0) : 0}%`
                  : "—"
              }
              sub={kpi ? `${kpi.completedBookings}/${kpi.totalBookings} lượt hoàn tất` : ""}
              icon={<CheckCircle2 />}
              accentColor="green"
              trend={kpi && kpi.totalBookings > 0 && kpi.completedBookings / kpi.totalBookings >= 0.8 ? "up" : "neutral"}
              trendText=""
            />
            <KpiCard
              label="Tỷ lệ xe hoạt động"
              value={
                kpi ? `${(kpi.vehicleUtilizationRate * 100).toFixed(0)}%` : "—"
              }
              sub={kpi ? `${kpi.inUseVehicles}/${kpi.totalVehicles} xe` : ""}
              icon={<Car />}
              accentColor="purple"
              trend={kpi && kpi.vehicleUtilizationRate > 0.7 ? "up" : "down"}
              trendText={kpi ? `${kpi.maintenanceVehicles} xe bảo trì` : ""}
            />
            <KpiCard
              label="Khách hàng mới"
              value={kpi ? kpi.newCustomers.toLocaleString("vi-VN") : "—"}
              sub="Lần đầu đặt trong kỳ"
              icon={<Users />}
              accentColor="green"
              trend={kpi && kpi.newCustomers > 0 ? "up" : "neutral"}
              trendText=""
            />
          </>
        )}
      </section>

      {/* Charts row 1: Area + Pie */}
      <section className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-12">
        <div className="rounded-xl border border-[#e5e2e1] bg-white p-5 shadow-sm xl:col-span-8">
          <div className="mb-4">
            <h3 className="text-sm font-extrabold text-[#1c1b1b]">
              Xu hướng doanh thu
            </h3>
            <p className="text-xs text-[#747878] mt-0.5">
              Phân tích theo loại — phí sân, thuê xe, đồ ăn & thức uống
            </p>
          </div>
          {trend.length === 0 && !isLoading ? (
            <div className="flex h-56 items-center justify-center text-sm text-[#747878]">
              Chưa có dữ liệu trong kỳ này
            </div>
          ) : (
            <div className="h-56 w-full text-xs relative">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={trend}
                  margin={{ top: 5, right: 5, left: -15, bottom: 0 }}
                  onMouseMove={(state) => {
                    const chartState = state as { activeTooltipIndex?: number }
                    if (chartState && chartState.activeTooltipIndex !== undefined && chartState.activeTooltipIndex !== null) {
                      setActiveTooltipIndex(chartState.activeTooltipIndex)
                    }
                  }}
                  onMouseLeave={() => {
                    setActiveTooltipIndex(undefined)
                  }}
                >
                  <Tooltip
                    formatter={(
                      value: TooltipValueType | undefined,
                      name: number | string | undefined,
                      item: unknown,
                    ) => {
                      const activeSeries = hoveredLegendSeries || selectedLegendSeries
                      if (activeSeries) {
                        const payloadItem = item as { dataKey?: string | number; props?: { dataKey?: string | number } } | undefined
                        const targetKey = String(payloadItem?.dataKey || payloadItem?.props?.dataKey || "")
                        const seriesLabels: Record<string, string> = {
                          slotFee: "Phí sân",
                          rentalFee: "Thuê xe",
                          fnbPreorder: "Đồ ăn & thức uống",
                          extensionFee: "Phí gia hạn",
                          damageCharge: "Phí bồi thường",
                          packageFee: "Phí gói",
                          contestFee: "Phí dự giải",
                        }
                        if (targetKey !== activeSeries && String(name) !== seriesLabels[activeSeries]) {
                          return null
                        }
                      }
                      return [formatTooltipCurrency(value), String(name || "")]
                    }}
                    contentStyle={{
                      borderRadius: "10px",
                      border: "1px solid #e5e2e1",
                      fontSize: 12,
                    }}
                  />
                  <defs>
                    {Object.entries(CHART_COLORS).map(([key, color]) => (
                      <linearGradient
                        key={key}
                        id={`db-grad-${key}`}
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop offset="5%" stopColor={color} stopOpacity={0.2} />
                        <stop
                          offset="95%"
                          stopColor={color}
                          stopOpacity={0.02}
                        />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#f0ede9"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="label"
                    stroke="#b0b4b4"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 10 }}
                  />
                  <YAxis
                    stroke="#b0b4b4"
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => formatCurrency(v)}
                    tick={{ fontSize: 10 }}
                  />
                  <Legend
                     wrapperStyle={{ fontSize: 11, paddingTop: 8, cursor: "pointer" }}
                     onMouseEnter={(entry: LegendPayload) =>
                       setHoveredLegendSeries(
                         typeof entry.dataKey === "string"
                           ? entry.dataKey
                           : null,
                       )
                     }
                     onMouseLeave={() => setHoveredLegendSeries(null)}
                     onClick={(entry: LegendPayload) => {
                       const key = typeof entry.dataKey === "string" ? entry.dataKey : null
                       setSelectedLegendSeries((prev) => (prev === key ? null : key))
                     }}
                   />
                  <Area
                    type="monotone"
                    dataKey="slotFee"
                    name="Phí sân"
                    stroke={CHART_COLORS.slotFee}
                    fill="url(#db-grad-slotFee)"
                    strokeWidth={
                      hoveredLegendSeries === "slotFee" ||
                      selectedLegendSeries === "slotFee" ||
                      hoveredSeries === "slotFee"
                        ? 3.5
                        : 2
                    }
                    strokeOpacity={
                      hoveredLegendSeries === null && selectedLegendSeries === null ||
                      hoveredLegendSeries === "slotFee" ||
                      selectedLegendSeries === "slotFee"
                        ? 1
                        : 0.15
                    }
                    fillOpacity={
                      hoveredLegendSeries === null && selectedLegendSeries === null ||
                      hoveredLegendSeries === "slotFee" ||
                      selectedLegendSeries === "slotFee"
                        ? 1
                        : 0.15
                    }
                    onMouseEnter={() => setHoveredSeries("slotFee")}
                    onMouseLeave={() => setHoveredSeries(null)}
                  />
                  <Area
                    type="monotone"
                    dataKey="rentalFee"
                    name="Thuê xe"
                    stroke={CHART_COLORS.rentalFee}
                    fill="url(#db-grad-rentalFee)"
                    strokeWidth={
                      hoveredLegendSeries === "rentalFee" ||
                      selectedLegendSeries === "rentalFee" ||
                      hoveredSeries === "rentalFee"
                        ? 3.5
                        : 2
                    }
                    strokeOpacity={
                      hoveredLegendSeries === null && selectedLegendSeries === null ||
                      hoveredLegendSeries === "rentalFee" ||
                      selectedLegendSeries === "rentalFee"
                        ? 1
                        : 0.15
                    }
                    fillOpacity={
                      hoveredLegendSeries === null && selectedLegendSeries === null ||
                      hoveredLegendSeries === "rentalFee" ||
                      selectedLegendSeries === "rentalFee"
                        ? 1
                        : 0.15
                    }
                    onMouseEnter={() => setHoveredSeries("rentalFee")}
                    onMouseLeave={() => setHoveredSeries(null)}
                  />
                  <Area
                    type="monotone"
                    dataKey="fnbPreorder"
                    name="Đồ ăn & thức uống"
                    stroke={CHART_COLORS.fnbPreorder}
                    fill="url(#db-grad-fnbPreorder)"
                    strokeWidth={
                      hoveredLegendSeries === "fnbPreorder" ||
                      selectedLegendSeries === "fnbPreorder" ||
                      hoveredSeries === "fnbPreorder"
                        ? 3.5
                        : 2
                    }
                    strokeOpacity={
                      hoveredLegendSeries === null && selectedLegendSeries === null ||
                      hoveredLegendSeries === "fnbPreorder" ||
                      selectedLegendSeries === "fnbPreorder"
                        ? 1
                        : 0.15
                    }
                    fillOpacity={
                      hoveredLegendSeries === null && selectedLegendSeries === null ||
                      hoveredLegendSeries === "fnbPreorder" ||
                      selectedLegendSeries === "fnbPreorder"
                        ? 1
                        : 0.15
                    }
                    onMouseEnter={() => setHoveredSeries("fnbPreorder")}
                    onMouseLeave={() => setHoveredSeries(null)}
                  />

                  <Area
                    type="monotone"
                    dataKey="extensionFee"
                    name="Phí gia hạn"
                    stroke={CHART_COLORS.extensionFee}
                    fill="url(#db-grad-extensionFee)"
                    strokeWidth={
                      hoveredLegendSeries === "extensionFee" ||
                      selectedLegendSeries === "extensionFee" ||
                      hoveredSeries === "extensionFee"
                        ? 3.5
                        : 2
                    }
                    strokeOpacity={
                      hoveredLegendSeries === null && selectedLegendSeries === null ||
                      hoveredLegendSeries === "extensionFee" ||
                      selectedLegendSeries === "extensionFee"
                        ? 1
                        : 0.15
                    }
                    fillOpacity={
                      hoveredLegendSeries === null && selectedLegendSeries === null ||
                      hoveredLegendSeries === "extensionFee" ||
                      selectedLegendSeries === "extensionFee"
                        ? 1
                        : 0.15
                    }
                    onMouseEnter={() => setHoveredSeries("extensionFee")}
                    onMouseLeave={() => setHoveredSeries(null)}
                  />
                  <Area
                    type="monotone"
                    dataKey="damageCharge"
                    name="Phí bồi thường"
                    stroke={CHART_COLORS.damageCharge}
                    fill="url(#db-grad-damageCharge)"
                    strokeWidth={
                      hoveredLegendSeries === "damageCharge" ||
                      selectedLegendSeries === "damageCharge" ||
                      hoveredSeries === "damageCharge"
                        ? 3.5
                        : 2
                    }
                    strokeOpacity={
                      hoveredLegendSeries === null && selectedLegendSeries === null ||
                      hoveredLegendSeries === "damageCharge" ||
                      selectedLegendSeries === "damageCharge"
                        ? 1
                        : 0.15
                    }
                    fillOpacity={
                      hoveredLegendSeries === null && selectedLegendSeries === null ||
                      hoveredLegendSeries === "damageCharge" ||
                      selectedLegendSeries === "damageCharge"
                        ? 1
                        : 0.15
                    }
                    onMouseEnter={() => setHoveredSeries("damageCharge")}
                    onMouseLeave={() => setHoveredSeries(null)}
                  />
                  <Area
                    type="monotone"
                    dataKey="packageFee"
                    name="Phí gói"
                    stroke={CHART_COLORS.packageFee}
                    fill="url(#db-grad-packageFee)"
                    strokeWidth={
                      hoveredLegendSeries === "packageFee" ||
                      selectedLegendSeries === "packageFee" ||
                      hoveredSeries === "packageFee"
                        ? 3.5
                        : 2
                    }
                    strokeOpacity={
                      hoveredLegendSeries === null && selectedLegendSeries === null ||
                      hoveredLegendSeries === "packageFee" ||
                      selectedLegendSeries === "packageFee"
                        ? 1
                        : 0.15
                    }
                    fillOpacity={
                      hoveredLegendSeries === null && selectedLegendSeries === null ||
                      hoveredLegendSeries === "packageFee" ||
                      selectedLegendSeries === "packageFee"
                        ? 1
                        : 0.15
                    }
                    onMouseEnter={() => setHoveredSeries("packageFee")}
                    onMouseLeave={() => setHoveredSeries(null)}
                  />
                  <Area
                    type="monotone"
                    dataKey="contestFee"
                    name="Phí dự giải"
                    stroke={CHART_COLORS.contestFee}
                    fill="url(#db-grad-contestFee)"
                    strokeWidth={
                      hoveredLegendSeries === "contestFee" ||
                      selectedLegendSeries === "contestFee" ||
                      hoveredSeries === "contestFee"
                        ? 3.5
                        : 2
                    }
                    strokeOpacity={
                      hoveredLegendSeries === null && selectedLegendSeries === null ||
                      hoveredLegendSeries === "contestFee" ||
                      selectedLegendSeries === "contestFee"
                        ? 1
                        : 0.15
                    }
                    fillOpacity={
                      hoveredLegendSeries === null && selectedLegendSeries === null ||
                      hoveredLegendSeries === "contestFee" ||
                      selectedLegendSeries === "contestFee"
                        ? 1
                        : 0.15
                    }
                    onMouseEnter={() => setHoveredSeries("contestFee")}
                    onMouseLeave={() => setHoveredSeries(null)}
                  />
                </AreaChart>
              </ResponsiveContainer>
              {/* Floating tooltip tự chế khi hover Legend tag hoặc click chọn khóa */}
              {(() => {
                const activeSeries = hoveredLegendSeries || selectedLegendSeries
                if (!activeSeries || trend.length === 0) return null

                const seriesLabels: Record<string, string> = {
                  slotFee: "Phí sân",
                  rentalFee: "Thuê xe",
                  fnbPreorder: "Đồ ăn & thức uống",
                  extensionFee: "Phí gia hạn",
                  damageCharge: "Phí bồi thường",
                  packageFee: "Phí gói",
                  contestFee: "Phí dự giải",
                }
                const color = (CHART_COLORS as Record<string, string>)[activeSeries] || "#000000"

                // Trường hợp 1: Người dùng đang rê chuột trên biểu đồ -> hiện tuần hiện tại & tổng tuần
                if (activeTooltipIndex !== undefined && activeTooltipIndex !== null) {
                  const point = trend[activeTooltipIndex]
                  if (!point) return null
                  const val = Number((point as unknown as Record<string, unknown>)[activeSeries] ?? 0)
                  return (
                    <div
                      key="legend-tooltip-hovering"
                      style={{
                        position: "absolute",
                        top: 8,
                        right: 8,
                        background: "white",
                        border: "1px solid #e5e2e1",
                        borderRadius: 10,
                        padding: "8px 12px",
                        fontSize: 12,
                        pointerEvents: "none",
                        zIndex: 50,
                        boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                        minWidth: 180,
                      }}
                    >
                      <p style={{ color: "#747878", fontWeight: 600, marginBottom: 4, fontSize: 11 }}>
                        {point.label} {selectedLegendSeries ? "📌" : ""}
                      </p>
                      <p style={{ color, fontWeight: 700, margin: "0 0 4px 0" }}>
                        {seriesLabels[activeSeries]}: {formatCurrency(val)}
                      </p>
                      <p style={{ color: "#1c1b1b", fontWeight: 600, margin: 0, fontSize: 11, borderTop: "1px solid #f0ede9", paddingTop: 4 }}>
                        Tổng tuần này: {formatCurrency(point.total)}
                      </p>
                    </div>
                  )
                }

                // Trường hợp 2: Hover/Lock tĩnh (không rê chuột trên chart) -> hiển thị tổng quan cả kỳ của phí đó
                const totalInPeriod = trend.reduce((sum, item) => sum + (Number((item as unknown as Record<string, unknown>)[activeSeries]) || 0), 0)
                return (
                  <div
                    key="legend-tooltip-static"
                    style={{
                      position: "absolute",
                      top: 8,
                      right: 8,
                      background: "white",
                      border: "1px solid #e5e2e1",
                      borderRadius: 10,
                      padding: "8px 12px",
                      fontSize: 12,
                      pointerEvents: "none",
                      zIndex: 50,
                      boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                      minWidth: 200,
                    }}
                  >
                    <p style={{ color: "#747878", fontWeight: 600, marginBottom: 4, fontSize: 11 }}>
                      {seriesLabels[activeSeries]} {selectedLegendSeries ? "📌 Đang khoá" : ""}
                    </p>
                    <p style={{ color, fontWeight: 700, margin: "0 0 4px 0", fontSize: 13 }}>
                      Tổng cả kỳ: {formatCurrency(totalInPeriod)}
                    </p>
                    <p style={{ color: "#a0a4a4", fontSize: 10, margin: 0, fontStyle: "italic" }}>
                      {selectedLegendSeries 
                        ? "Rê chuột vào biểu đồ để xem chi tiết từng tuần" 
                        : "Click vào tag để khoá đường xem chi tiết"}
                    </p>
                  </div>
                )
              })()}
            </div>
          )}

        </div>

        <div className="rounded-xl border border-[#e5e2e1] bg-white p-5 shadow-sm xl:col-span-4">
          <div className="mb-4">
            <h3 className="text-sm font-extrabold text-[#1c1b1b]">
              Phân bổ doanh thu
            </h3>
            <p className="text-xs text-[#747878] mt-0.5">
              Tỷ trọng từng nguồn thu
            </p>
          </div>
          {breakdown.length === 0 && !isLoading ? (
            <div className="flex h-36 items-center justify-center text-sm text-[#747878]">
              Chưa có dữ liệu
            </div>
          ) : (
            <div className="h-36 w-full text-xs">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={breakdown}
                    cx="50%"
                    cy="50%"
                    innerRadius={42}
                    outerRadius={62}
                    paddingAngle={3}
                    dataKey="amount"
                    nameKey="label"
                    onMouseEnter={(_, index) => {
                      setHoveredPieType(breakdown[index]?.type || null)
                    }}
                    onMouseLeave={() => setHoveredPieType(null)}
                  >
                    {breakdown.map((item, i) => (
                      <Cell
                        key={i}
                        fill={FEE_COLOR_MAP[item.type] ?? PIE_COLORS[i % PIE_COLORS.length]}
                        opacity={
                          hoveredPieType === null ||
                            hoveredPieType === item.type
                            ? 1
                            : 0.15
                        }
                        style={{
                          cursor: "pointer",
                          transition: "opacity 0.2s ease",
                        }}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: TooltipValueType | undefined) =>
                      formatTooltipCurrency(value)
                    }
                    contentStyle={{
                      borderRadius: "10px",
                      border: "1px solid #e5e2e1",
                      fontSize: 12,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="mt-2 space-y-1.5 border-t border-[#f0ede9] pt-3">
            {breakdown.map((item, i) => (
              <div
                key={item.type}
                className={cn(
                  "flex items-center justify-between text-xs p-1 rounded transition-colors cursor-pointer",
                  hoveredPieType === item.type
                    ? "bg-slate-50 font-extrabold"
                    : "",
                )}
                onMouseEnter={() => setHoveredPieType(item.type)}
                onMouseLeave={() => setHoveredPieType(null)}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="size-2 rounded-full"
                    style={{ background: FEE_COLOR_MAP[item.type] ?? PIE_COLORS[i % PIE_COLORS.length] }}
                  />
                  <span
                    className={cn(
                      "font-semibold text-[#5d5f5f]",
                      hoveredPieType === item.type && "text-[#1c1b1b]",
                    )}
                  >
                    {item.label}
                  </span>
                </div>
                <span className="font-bold text-[#1c1b1b]">
                  {formatCurrency(item.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <BookingChannelsCard channels={channels} isLoading={isLoading} />

      {/* Charts row 2: Branch bar + Fleet */}
      <section className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-12">
        <div className="rounded-xl border border-[#e5e2e1] bg-white p-5 shadow-sm xl:col-span-7">
          <div className="mb-4">
            <h3 className="text-sm font-extrabold text-[#1c1b1b]">
              Hiệu suất chi nhánh
            </h3>
            <p className="text-xs text-[#747878] mt-0.5">
              So sánh doanh thu theo cơ sở
            </p>
          </div>
          {branches.length === 0 && !isLoading ? (
            <div className="flex h-40 items-center justify-center text-sm text-[#747878]">
              Chưa có cơ sở nào
            </div>
          ) : (
            <div className="h-40 w-full text-xs">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={branches}
                  layout="vertical"
                  margin={{ top: 0, right: 40, left: 0, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#f0ede9"
                    horizontal={false}
                  />
                  <XAxis
                    type="number"
                    stroke="#b0b4b4"
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => formatCurrency(v)}
                    tick={{ fontSize: 9 }}
                  />
                  <YAxis
                    type="category"
                    dataKey="cafeName"
                    stroke="#b0b4b4"
                    tickLine={false}
                    axisLine={false}
                    width={100}
                    tick={{ fontSize: 10, fontWeight: 700 }}
                  />
                  <Tooltip
                    formatter={(v: unknown) => formatCurrency(Number(v || 0))}
                    contentStyle={{
                      borderRadius: "10px",
                      border: "1px solid #e5e2e1",
                      fontSize: 12,
                    }}
                  />
                  <Bar
                    dataKey="totalRevenue"
                    name="Doanh thu"
                    fill="#ea580c"
                    radius={[0, 4, 4, 0]}
                    maxBarSize={22}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-[#e5e2e1] bg-white p-5 shadow-sm xl:col-span-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-extrabold text-[#1c1b1b]">
                Tình trạng đội xe
              </h3>
              <p className="text-xs text-[#747878] mt-0.5">
                {kpi ? `Tổng ${kpi.totalVehicles} xe` : "Đang tải..."}
              </p>
            </div>
            <Button
              asChild
              variant="outline"
              className="h-8 gap-1.5 rounded-lg border-[#c4c7c8] text-xs font-bold"
            >
              <Link to={routePaths.providerVehicles}>
                Quản lý <ArrowRight className="size-3" />
              </Link>
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-3">
            <FleetStatusItem
              label="Sẵn sàng hoạt động"
              value={kpi?.availableVehicles ?? 0}
              icon={<CheckCircle2 className="size-4" />}
              color="emerald"
            />
            <FleetStatusItem
              label="Đang cho thuê"
              value={kpi?.inUseVehicles ?? 0}
              icon={<PlayCircle className="size-4" />}
              color="blue"
            />
            <FleetStatusItem
              label="Bảo trì / sửa chữa"
              value={kpi?.maintenanceVehicles ?? 0}
              icon={<Wrench className="size-4" />}
              color="red"
            />
          </div>
        </div>
      </section>

      {/* Báo cáo xếp hạng (Top Statistics) */}
      <section className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Top F&B Items */}
        <div className="rounded-xl border border-[#e5e2e1] bg-white p-5 shadow-sm">
          <div className="mb-4">
            <h3 className="text-sm font-extrabold text-[#1c1b1b] flex items-center gap-1.5">
              <span>Món ăn được mua nhiều</span>
            </h3>
            <p className="text-xs text-[#747878] mt-0.5">
              Top 5 món bán chạy nhất trong kỳ
            </p>
          </div>
          {isLoading ? (
            <div className="space-y-2 py-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="h-10 w-full animate-pulse bg-slate-100 rounded-lg"
                />
              ))}
            </div>
          ) : !topStats?.topFnb || topStats.topFnb.length === 0 ? (
            <div className="py-10 text-center text-xs text-[#747878]">
              Chưa có dữ liệu đồ ăn & thức uống
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#f0ede9] text-[#747878] font-bold text-left">
                    <th className="pt-3.5 pb-2 leading-relaxed">TÊN MÓN</th>
                    <th className="pt-3.5 pb-2 text-right leading-relaxed">
                      SỐ LƯỢNG
                    </th>
                    <th className="pt-3.5 pb-2 text-right leading-relaxed">
                      DOANH THU
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {topStats.topFnb.map((item, idx) => (
                    <tr
                      key={item.menuItemId || idx}
                      className="border-t border-[#f0ede9] hover:bg-[#fcf8f8]/60 transition-colors"
                    >
                      <td className="py-2.5">
                        <div className="font-semibold text-[#1c1b1b]">
                          {item.itemName}
                        </div>
                        {!selectedCafeId && (
                          <div className="text-[10px] text-slate-400 font-semibold">
                            {item.cafeName}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 text-right font-bold text-[#5d5f5f]">
                        {item.totalQuantity}
                      </td>
                      <td className="py-2.5 text-right font-extrabold text-[#1c1b1b]">
                        {formatCurrency(item.totalRevenue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Top Track Types */}
        <div className="rounded-xl border border-[#e5e2e1] bg-white p-5 shadow-sm">
          <div className="mb-4">
            <h3 className="text-sm font-extrabold text-[#1c1b1b] flex items-center gap-1.5">
              <span>Sân được book nhiều</span>
            </h3>
            <p className="text-xs text-[#747878] mt-0.5">
              Top 5 loại đường đua được yêu thích nhất
            </p>
          </div>
          {isLoading ? (
            <div className="space-y-2 py-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="h-10 w-full animate-pulse bg-slate-100 rounded-lg"
                />
              ))}
            </div>
          ) : !topStats?.topTracks || topStats.topTracks.length === 0 ? (
            <div className="py-10 text-center text-xs text-[#747878]">
              Chưa có dữ liệu đặt sân
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#f0ede9] text-[#747878] font-bold text-left">
                    <th className="pt-3.5 pb-2 leading-relaxed">TÊN SÂN</th>
                    <th className="pt-3.5 pb-2 leading-relaxed">MÃ CODE</th>
                    <th className="pt-3.5 pb-2 text-right leading-relaxed">
                      LƯỢT ĐẶT
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {topStats.topTracks.map((item, idx) => (
                    <tr
                      key={item.trackTypeId || idx}
                      className="border-t border-[#f0ede9] hover:bg-[#fcf8f8]/60 transition-colors"
                    >
                      <td className="py-2.5">
                        <div className="font-semibold text-[#1c1b1b]">
                          {item.trackTypeName}
                        </div>
                        {!selectedCafeId && (
                          <div className="text-[10px] text-slate-400 font-semibold">
                            {item.cafeName}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-600">
                          {item.trackTypeCode}
                        </span>
                      </td>
                      <td className="py-2.5 text-right font-extrabold text-[#1c1b1b]">
                        {item.bookingCount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Top Customers */}
        <div className="rounded-xl border border-[#e5e2e1] bg-white p-5 shadow-sm">
          <div className="mb-4">
            <h3 className="text-sm font-extrabold text-[#1c1b1b] flex items-center gap-1.5">
              <span>Khách hàng thường xuyên nhất</span>
            </h3>
            <p className="text-xs text-[#747878] mt-0.5">
              Top 5 khách hàng đặt sân tích cực nhất
            </p>
          </div>
          {isLoading ? (
            <div className="space-y-2 py-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="h-10 w-full animate-pulse bg-slate-100 rounded-lg"
                />
              ))}
            </div>
          ) : !topStats?.topCustomers || topStats.topCustomers.length === 0 ? (
            <div className="py-10 text-center text-xs text-[#747878]">
              Chưa có dữ liệu khách hàng
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#f0ede9] text-[#747878] font-bold text-left">
                    <th className="pt-3.5 pb-2 leading-relaxed">KHÁCH HÀNG</th>
                    <th className="pt-3.5 pb-2 text-right leading-relaxed">
                      LƯỢT BOOK
                    </th>
                    <th className="pt-3.5 pb-2 text-right leading-relaxed">
                      CHI TIÊU
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {topStats.topCustomers.map((item, idx) => (
                    <tr
                      key={item.customerId || idx}
                      className="border-t border-[#f0ede9] hover:bg-[#fcf8f8]/60 transition-colors"
                    >
                      <td className="py-2.5">
                        <div className="font-semibold text-[#1c1b1b]">
                          {item.customerName}
                        </div>
                        <div className="text-[10px] text-[#747878]">
                          {item.customerEmail}
                        </div>
                      </td>
                      <td className="py-2.5 text-right font-bold text-[#5d5f5f]">
                        {item.bookingCount}
                      </td>
                      <td className="py-2.5 text-right font-extrabold text-[#1c1b1b]">
                        {formatCurrency(item.totalSpent)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Top Vehicle Catalogs */}
        <div className="rounded-xl border border-[#e5e2e1] bg-white p-5 shadow-sm">
          <div className="mb-4">
            <h3 className="text-sm font-extrabold text-[#1c1b1b] flex items-center gap-1.5">
              <span>Loại xe được book nhiều</span>
            </h3>
            <p className="text-xs text-[#747878] mt-0.5">
              Top 5 dòng xe mẫu được thuê nhiều nhất
            </p>
          </div>
          {isLoading ? (
            <div className="space-y-2 py-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="h-10 w-full animate-pulse bg-slate-100 rounded-lg"
                />
              ))}
            </div>
          ) : !topStats?.topVehicles || topStats.topVehicles.length === 0 ? (
            <div className="py-10 text-center text-xs text-[#747878]">
              Chưa có dữ liệu thuê xe
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#f0ede9] text-[#747878] font-bold text-left">
                    <th className="pt-3.5 pb-2 leading-relaxed">MẪU XE</th>
                    <th className="pt-3.5 pb-2 leading-relaxed">PHÂN HẠNG</th>
                    <th className="pt-3.5 pb-2 text-right leading-relaxed">
                      LƯỢT THUÊ
                    </th>
                    <th className="pt-3.5 pb-2 text-right leading-relaxed">
                      DOANH THU
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {topStats.topVehicles.map((item, idx) => (
                    <tr
                      key={item.catalogId || idx}
                      className="border-t border-[#f0ede9] hover:bg-[#fcf8f8]/60 transition-colors"
                    >
                      <td className="py-2.5">
                        <div className="font-semibold text-[#1c1b1b]">
                          {item.catalogName}
                        </div>
                        {!selectedCafeId && (
                          <div className="text-[10px] text-slate-400 font-semibold">
                            {item.cafeName}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5">
                        <span
                          className={`inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-bold border ${item.catalogTier === "RESTRICTED"
                            ? "bg-red-50 text-red-700 border-red-200"
                            : item.catalogTier === "PREMIUM"
                              ? "bg-amber-50 text-amber-700 border-amber-200"
                              : "bg-slate-100 text-slate-700 border-slate-200"
                            }`}
                        >
                          {item.catalogTier}
                        </span>
                      </td>
                      <td className="py-2.5 text-right font-bold text-[#5d5f5f]">
                        {item.bookingCount}
                      </td>
                      <td className="py-2.5 text-right font-extrabold text-[#1c1b1b]">
                        {formatCurrency(item.rentalRevenue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Top Gói dịch vụ — span full width để không để ô trống */}
        <div className="rounded-xl border border-[#e5e2e1] bg-white p-5 shadow-sm lg:col-span-2">
          <div className="mb-4">
            <h3 className="text-sm font-extrabold text-[#1c1b1b] flex items-center gap-1.5">
              <span>Gói dịch vụ bán chạy</span>
            </h3>
            <p className="text-xs text-[#747878] mt-0.5">
              Top 5 gói được mua nhiều nhất trong kỳ
            </p>
          </div>
          {isLoading ? (
            <div className="space-y-2 py-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="h-10 w-full animate-pulse bg-slate-100 rounded-lg"
                />
              ))}
            </div>
          ) : !topStats?.topPackages || topStats.topPackages.length === 0 ? (
            <div className="py-10 text-center text-xs text-[#747878]">
              Chưa có dữ liệu gói dịch vụ
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#f0ede9] text-[#747878] font-bold text-left">
                    <th className="pt-3.5 pb-2 leading-relaxed">TÊN GÓI</th>
                    <th className="pt-3.5 pb-2 text-right leading-relaxed">
                      LƯỢT MUA
                    </th>
                    <th className="pt-3.5 pb-2 text-right leading-relaxed">
                      DOANH THU
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {topStats.topPackages.map((item, idx) => (
                    <tr
                      key={item.packageId || idx}
                      className="border-t border-[#f0ede9] hover:bg-[#fcf8f8]/60 transition-colors"
                    >
                      <td className="py-2.5">
                        <div className="font-semibold text-[#1c1b1b]">
                          {item.packageName}
                        </div>
                        {!selectedCafeId && (
                          <div className="text-[10px] text-slate-400 font-semibold">
                            {item.cafeName}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 text-right font-bold text-[#5d5f5f]">
                        <span className="inline-flex items-center gap-0.5">
                          <span className="inline-block size-1.5 rounded-full" style={{ background: "#8b5cf6" }} />
                          {item.purchaseCount}
                        </span>
                      </td>
                      <td className="py-2.5 text-right font-extrabold text-[#1c1b1b]">
                        {formatCurrency(item.totalRevenue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* Recent Bookings */}
      <section className="mt-5">
        <div className="rounded-xl border border-[#e5e2e1] bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-[#f0ede9] px-5 py-4">
            <div>
              <h3 className="text-sm font-extrabold text-[#1c1b1b]">
                Booking gần đây
              </h3>
              <p className="text-xs text-[#747878] mt-0.5">
                8 booking mới nhất
              </p>
            </div>
            <Button
              asChild
              variant="outline"
              className="h-8 gap-1.5 rounded-lg border-[#c4c7c8] text-xs font-bold"
            >
              <Link to={routePaths.providerBookings}>
                Xem tất cả <ArrowRight className="size-3" />
              </Link>
            </Button>
          </div>
          <div className="overflow-x-auto">
            {recent.length === 0 && !isLoading ? (
              <div className="py-10 text-center text-sm text-[#747878]">
                Chưa có booking nào
              </div>
            ) : (
              <table className="w-full min-w-[600px] text-sm">
                <thead>
                  <tr className="bg-[#fcf8f8]/60 text-xs font-bold uppercase tracking-wider text-[#747878]">
                    <th className="px-5 py-3 text-left">Chi nhánh</th>
                    <th className="px-5 py-3 text-left">Khách hàng</th>
                    <th className="px-5 py-3 text-left">Chế độ</th>
                    <th className="px-5 py-3 text-left">Thời gian</th>
                    <th className="px-5 py-3 text-left">Trạng thái</th>
                    <th className="px-5 py-3 text-right">Tổng tiền</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((b) => (
                    <tr
                      key={b.bookingId}
                      className="border-t border-[#f0ede9] transition-colors hover:bg-[#fcf8f8]"
                    >
                      <td className="px-5 py-3 font-semibold text-[#1c1b1b]">
                        {b.cafeName}
                      </td>
                      <td className="px-5 py-3 text-[#5d5f5f]">
                        {b.customerName}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs font-bold",
                            b.playMode === "RENTAL"
                              ? "bg-orange-50 text-orange-700"
                              : "bg-blue-50 text-blue-700",
                          )}
                        >
                          {b.playMode === "RENTAL" ? "Thuê xe" : "Xe tự mang"}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-xs text-[#747878]">
                        {new Date(b.slotStart).toLocaleString("vi-VN", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </td>
                      <td className="px-5 py-3">
                        <BookingStatusBadge status={b.status} />
                      </td>
                      <td className="px-5 py-3 text-right font-extrabold text-[#1c1b1b]">
                        {formatCurrency(Number(b.totalCharged))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </section>

      {/* AI Revenue Analytics Panel */}
      <section className="mt-6">
        <AiInsightsPanel
          from={from.slice(0, 10)}
          to={to.slice(0, 10)}
          cafeId={selectedCafeId}
          isFeatureEnabled={isAiAnalyticsEnabled}
        />
      </section>
    </ProviderShell>
  )
}

function OnboardingChecklist({
  steps,
  onCompleteAll,
}: {
  steps: {
    branchesCreated: boolean
    vehiclesAdded: boolean
    operationalHoursSet: boolean
  }
  onCompleteAll: () => void
}) {
  const completedCount = Object.values(steps).filter(Boolean).length
  const progressPercent = Math.round((completedCount / 3) * 100)
  const allStepsCompleted = completedCount === 3

  return (
    <div className="w-full space-y-6 py-2">
      {/* Celebration & Welcome Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-orange-100 bg-gradient-to-br from-orange-50/70 via-white to-orange-50/20 p-8 shadow-sm">
        <div className="absolute top-0 right-0 w-[300px] h-[300px] rounded-full bg-orange-200/20 blur-[80px] pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-100 text-orange-800 text-xs font-bold">
              <PartyPopper className="size-4 text-orange-600 animate-bounce" />
              🎉 Tài khoản đã được duyệt!
            </div>
            <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
              Chào mừng đối tác RCField
            </h1>
            <p className="text-slate-600 max-w-xl text-sm leading-relaxed">
              Gói dùng thử{" "}
              <strong className="text-orange-700 font-extrabold">
                30 ngày
              </strong>{" "}
              đang chạy. Hãy hoàn thành các bước hướng dẫn thiết lập bên dưới để
              bắt đầu quản lý.
            </p>
          </div>

          <div className="flex flex-col items-center justify-center bg-white border border-slate-200/80 rounded-xl p-5 shadow-sm min-w-[160px] self-start md:self-center">
            <span className="text-3xl font-black text-slate-900">
              {progressPercent}%
            </span>
            <span className="text-xs font-bold text-slate-500 mt-1">
              TIẾN TRÌNH THIẾT LẬP
            </span>
            <div className="w-28 h-2 bg-slate-100 rounded-full mt-3 overflow-hidden">
              <div
                className="h-full bg-orange-500 transition-all duration-500 rounded-full animate-pulse"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-base font-bold text-slate-800 px-1">
          Việc cần làm ngay:
        </h3>
      </div>

      {/* Steps List */}
      <div className="space-y-4">
        {/* Step 1: Cafe/Branch */}
        <div
          className={cn(
            "group relative flex items-start gap-5 p-6 rounded-xl border transition-all bg-white",
            steps.branchesCreated
              ? "border-emerald-100 bg-emerald-50/10"
              : "border-slate-200 hover:border-orange-200",
          )}
        >
          <div className="mt-1 flex items-center justify-center text-slate-300">
            {steps.branchesCreated ? (
              <CheckCircle2 className="size-7 text-emerald-600 fill-emerald-50" />
            ) : (
              <div className="size-7 rounded-full border-2 border-slate-300" />
            )}
          </div>

          <div className="flex-1 space-y-3">
            <div>
              <div className="flex items-center gap-2">
                <h3
                  className={cn(
                    "text-base font-extrabold text-[#1c1b1b]",
                    steps.branchesCreated && "line-through text-slate-500/60",
                  )}
                >
                  Tạo chi nhánh đầu tiên
                </h3>
                <Building2 className="size-4.5 text-slate-400" />
              </div>
              <p className="text-[#444748] text-xs font-semibold mt-1 max-w-2xl">
                Cấu hình thông tin cơ sở RC Cafe của bạn để khách hàng có thể
                đặt lịch chơi và thuê xe.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Button
                asChild
                className={cn(
                  "h-9 rounded-lg px-4 text-xs font-bold transition-all",
                  steps.branchesCreated
                    ? "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    : "bg-slate-950 text-white hover:bg-slate-900 shadow-sm",
                )}
              >
                <Link to={routePaths.providerCafes}>
                  {steps.branchesCreated
                    ? "Quản lý cơ sở"
                    : "Thiết lập cơ sở ngay"}
                  <ArrowRight className="size-3.5 ml-1.5" />
                </Link>
              </Button>
            </div>
          </div>
        </div>

        {/* Step 2: Add vehicles */}
        <div
          className={cn(
            "group relative flex items-start gap-5 p-6 rounded-xl border transition-all bg-white",
            steps.vehiclesAdded
              ? "border-emerald-100 bg-emerald-50/10"
              : "border-slate-200 hover:border-orange-200",
          )}
        >
          <div className="mt-1 flex items-center justify-center text-slate-300">
            {steps.vehiclesAdded ? (
              <CheckCircle2 className="size-7 text-emerald-600 fill-emerald-50" />
            ) : (
              <div className="size-7 rounded-full border-2 border-slate-300" />
            )}
          </div>

          <div className="flex-1 space-y-3">
            <div>
              <div className="flex items-center gap-2">
                <h3
                  className={cn(
                    "text-base font-extrabold text-[#1c1b1b]",
                    steps.vehiclesAdded && "line-through text-slate-500/60",
                  )}
                >
                  Thêm xe vào fleet (đội xe)
                </h3>
                <Car className="size-4.5 text-slate-400" />
              </div>
              <p className="text-[#444748] text-xs font-semibold mt-1 max-w-2xl">
                Khai báo danh mục xe RC cho thuê có sẵn tại cơ sở để khách hàng
                chọn khi làm booking.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Button
                asChild
                disabled={!steps.branchesCreated}
                className={cn(
                  "h-9 rounded-lg px-4 text-xs font-bold transition-all",
                  steps.vehiclesAdded
                    ? "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    : "bg-slate-950 text-white hover:bg-slate-900 shadow-sm",
                )}
              >
                {steps.branchesCreated ? (
                  <Link to={routePaths.providerVehicles}>
                    {steps.vehiclesAdded ? "Quản lý đội xe" : "Đăng ký xe mới"}
                    <ArrowRight className="size-3.5 ml-1.5" />
                  </Link>
                ) : (
                  <span>Đăng ký xe mới (Cần tạo cơ sở trước)</span>
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Step 3: Operating Hours */}
        <div
          className={cn(
            "group relative flex items-start gap-5 p-6 rounded-xl border transition-all bg-white",
            steps.operationalHoursSet
              ? "border-emerald-100 bg-emerald-50/10"
              : "border-slate-200 hover:border-orange-200",
          )}
        >
          <div className="mt-1 flex items-center justify-center text-slate-300">
            {steps.operationalHoursSet ? (
              <CheckCircle2 className="size-7 text-emerald-600 fill-emerald-50" />
            ) : (
              <div className="size-7 rounded-full border-2 border-slate-300" />
            )}
          </div>

          <div className="flex-1 space-y-3">
            <div>
              <div className="flex items-center gap-2">
                <h3
                  className={cn(
                    "text-base font-extrabold text-[#1c1b1b]",
                    steps.operationalHoursSet &&
                    "line-through text-slate-500/60",
                  )}
                >
                  Cài đặt giờ hoạt động
                </h3>
                <Clock className="size-4.5 text-slate-400" />
              </div>
              <p className="text-[#444748] text-xs font-semibold mt-1 max-w-2xl">
                Cài đặt khung giờ làm việc mở cửa và đóng cửa hàng ngày tại cơ
                sở của bạn.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Button
                asChild
                disabled={!steps.branchesCreated}
                className={cn(
                  "h-9 rounded-lg px-4 text-xs font-bold transition-all",
                  steps.operationalHoursSet
                    ? "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    : "bg-slate-950 text-white hover:bg-slate-900 shadow-sm",
                )}
              >
                {steps.branchesCreated ? (
                  <Link to={routePaths.providerCafes}>
                    {steps.operationalHoursSet
                      ? "Quản lý khung giờ"
                      : "Thiết lập giờ mở cửa"}
                    <ArrowRight className="size-3.5 ml-1.5" />
                  </Link>
                ) : (
                  <span>Thiết lập giờ mở cửa (Cần tạo cơ sở trước)</span>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Bypass Footer */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-5 rounded-xl border border-slate-200/80 bg-slate-50/50">
        <span className="text-xs text-slate-500 font-medium max-w-md">
          <strong>Mẹo:</strong> Sau khi cấu hình xong cả 3 bước thiết lập thực
          tế trên hệ thống, nút kích hoạt bên dưới sẽ sẵn sàng để bạn truy cập
          Dashboard.
        </span>
        <div className="flex gap-3">
          <Button
            onClick={onCompleteAll}
            disabled={!allStepsCompleted}
            className={cn(
              "h-10 px-5 text-xs font-bold gap-2 shadow-md rounded-lg transition-all",
              allStepsCompleted
                ? "bg-orange-600 text-white hover:bg-orange-700 cursor-pointer"
                : "bg-slate-200 text-slate-400 cursor-not-allowed",
            )}
          >
            Kích Hoạt Dashboard
            <Sparkles className="size-4 animate-pulse" />
          </Button>
        </div>
      </div>
    </div>
  )
}

/**
 * Cơ cấu đơn đặt theo kênh — khách tự đặt qua app, nhân viên tạo tại quầy,
 * hay đến từ giải đấu. Hiển thị cả số đơn lẫn doanh thu vì hai chỉ số này có
 * thể lệch nhau: kênh nhiều đơn chưa chắc là kênh mang về nhiều tiền hơn.
 */
function BookingChannelsCard({
  channels,
  isLoading,
}: {
  channels: BookingChannelItem[]
  isLoading: boolean
}) {
  const totalBookings = channels.reduce((sum, c) => sum + c.bookingCount, 0)
  const totalRevenue = channels.reduce((sum, c) => sum + c.revenue, 0)

  const CHANNEL_COLOR: Record<string, string> = {
    APP: "#ea580c",
    STAFF_MANUAL: "#0ea5e9",
    CONTEST: "#8b5cf6",
  }

  return (
    <section className="mt-4 rounded-xl border border-[#e5e2e1] bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h3 className="text-sm font-extrabold text-[#1c1b1b]">Kênh đặt lịch</h3>
        <p className="mt-0.5 text-xs text-[#747878]">
          Khách tự đặt qua app hay nhân viên tạo tại quầy
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-[#f6f3f2]" />
          ))}
        </div>
      ) : totalBookings === 0 ? (
        <div className="flex h-24 items-center justify-center text-sm text-[#747878]">
          Chưa có đơn đặt nào trong khoảng thời gian này
        </div>
      ) : (
        <div className="space-y-4">
          {/* Thanh tỉ trọng gộp — đọc được ngay kênh nào chiếm ưu thế */}
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-[#f0ede9]">
            {channels
              .filter((c) => c.bookingCount > 0)
              .map((c) => (
                <div
                  key={c.source}
                  style={{
                    width: `${c.bookingShare * 100}%`,
                    background: CHANNEL_COLOR[c.source] ?? "#94a3b8",
                  }}
                  title={`${c.label}: ${c.bookingCount} đơn`}
                />
              ))}
          </div>

          <div className="space-y-2.5">
            {channels.map((c) => (
              <div key={c.source} className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ background: CHANNEL_COLOR[c.source] ?? "#94a3b8" }}
                  />
                  <span className="truncate text-xs font-semibold text-[#5d5f5f]">{c.label}</span>
                </div>
                <div className="flex shrink-0 items-center gap-4 text-xs">
                  <span className="font-bold text-[#1c1b1b] tabular-nums">
                    {c.bookingCount} đơn
                    <span className="ml-1 font-semibold text-[#747878]">
                      ({Math.round(c.bookingShare * 100)}%)
                    </span>
                  </span>
                  <span className="w-24 text-right font-bold text-[#1c1b1b] tabular-nums">
                    {formatCurrency(c.revenue)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between border-t border-[#f0ede9] pt-3 text-xs">
            <span className="font-bold text-[#5d5f5f]">Tổng</span>
            <div className="flex items-center gap-4">
              <span className="font-extrabold text-[#1c1b1b] tabular-nums">{totalBookings} đơn</span>
              <span className="w-24 text-right font-extrabold text-[#1c1b1b] tabular-nums">
                {formatCurrency(totalRevenue)}
              </span>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
