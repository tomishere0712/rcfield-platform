import { useState, useCallback, useMemo } from "react"
import { Link } from "react-router"
import { Building2, DollarSign, Play, Users, ArrowRight, CalendarRange, X } from "lucide-react"
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  AreaChart,
  Area,
  CartesianGrid,
} from "recharts"

import { routePaths } from "@/app/router/route-paths"
import { AdminShell } from "@/pages/admin/components/AdminShell"
import {
  AdminHeader,
  AdminMetricCard,
  AdminPanel,
  AdminPanelTitle,
  AdminTable,
  CafeStatusBadge,
} from "@/pages/admin/components/AdminPrimitives"
import { useAdminDashboard } from "@/features/dashboard/hooks/useAdminDashboard"
import { Button } from "@/shared/ui/button"
import { cn } from "@/shared/lib/utils"

export type AdminRevenuePeriod = "daily" | "weekly" | "monthly"

export function AdminDashboardPage() {
  const [period, setPeriod] = useState<AdminRevenuePeriod>("monthly")
  const [customFrom, setCustomFrom] = useState<string>("")
  const [customTo, setCustomTo] = useState<string>("")

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
      } else {
        setCustomTo(new Date(val + "T23:59:59").toISOString())
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
      } else {
        setCustomFrom(new Date(val).toISOString())
      }
    },
    [customFrom],
  )

  const handleClearDateRange = useCallback(() => {
    setCustomFrom("")
    setCustomTo("")
  }, [])

  const handlePeriodChange = useCallback((p: AdminRevenuePeriod) => {
    setPeriod(p)
    setCustomFrom("")
    setCustomTo("")
  }, [])

  const dashboardParams = useMemo(() => {
    if (customFrom || customTo) {
      const fromVal = customFrom || (customTo ? new Date(new Date(customTo).setHours(0, 0, 0, 0)).toISOString() : "")
      const toVal = customTo || (customFrom ? new Date(new Date(customFrom).setHours(23, 59, 59, 999)).toISOString() : "")
      return { from: fromVal, to: toVal }
    }
    return { period }
  }, [customFrom, customTo, period])

  const { summary, isLoading } = useAdminDashboard(dashboardParams)

  const growthSubtitle = useMemo(() => {
    if (customFrom && customTo) {
      return `Số lượng cơ sở đăng ký mới từ ${new Date(customFrom).toLocaleDateString("vi-VN")} đến ${new Date(customTo).toLocaleDateString("vi-VN")}`
    }
    if (period === "daily") return "Số lượng cơ sở đăng ký mới trong 14 ngày qua"
    if (period === "weekly") return "Số lượng cơ sở đăng ký mới trong 12 tuần qua"
    return "Số lượng cơ sở đăng ký mới trong 12 tháng qua"
  }, [customFrom, customTo, period])

  const sessionsTrendSubtitle = useMemo(() => {
    if (customFrom && customTo) {
      return `Số phiên chơi thực tế từ ${new Date(customFrom).toLocaleDateString("vi-VN")} đến ${new Date(customTo).toLocaleDateString("vi-VN")}`
    }
    if (period === "daily") return "Số phiên chơi thực tế trong 14 ngày qua"
    if (period === "weekly") return "Số phiên chơi thực tế trong 12 tuần qua"
    return "Số phiên chơi thực tế trong 12 tháng qua"
  }, [customFrom, customTo, period])

  const formatYAxisCurrency = useCallback((val: number) => {
    const num = Number(val || 0)
    if (num >= 1_000_000) {
      return `${(num / 1_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}M`
    }
    if (num >= 1_000) {
      return `${(num / 1_000).toLocaleString("vi-VN", { maximumFractionDigits: 0 })}k`
    }
    return `${num}`
  }, [])

  if (isLoading && !summary) {
    return (
      <AdminShell>
        <AdminHeader
          title="Tổng quan Hệ thống"
          description="Đang tải dữ liệu từ hệ thống..."
        />
        <div className="flex h-[400px] items-center justify-center">
          <div className="flex flex-col items-center gap-2">
            <div className="size-8 animate-spin rounded-full border-4 border-orange-500 border-t-transparent" />
            <p className="text-sm font-semibold text-[#747878]">Đang tải số liệu thống kê...</p>
          </div>
        </div>
      </AdminShell>
    )
  }

  const kpi = summary?.kpi
  const cafeGrowth = summary?.cafeGrowth || []
  const revenueByPlan = (summary?.revenueByPlan || []).map((item) => ({
    ...item,
    revenue: Number(item.revenue || 0),
    count: Number(item.count || 0),
  }))
  const revenueByContestPlan = (summary?.revenueByContestPlan || []).map((item) => ({
    ...item,
    revenue: Number(item.revenue || 0),
    count: Number(item.count || 0),
  }))
  const activeSessionsTrend = summary?.activeSessionsTrend || []
  const recentCafes = summary?.recentCafes || []

  // Columns for the recent onboarding table
  const columns = ["ID Cơ sở", "Tên cơ sở", "Chủ sở hữu", "Gói SaaS", "Trạng thái", "Ngày đăng ký"]
  
  const rows = recentCafes.map((cafe) => [
    <span key={cafe.id} className="font-mono text-xs text-[#747878]">{cafe.id}</span>,
    <div key={cafe.name} className="flex items-center gap-2">
      <div className="size-6 rounded-md bg-[#f6f3f2] flex items-center justify-center border border-[#e5e2e1]">
        <Building2 className="size-3 text-[#747878]" />
      </div>
      <span className="font-bold text-[#1c1b1b]">{cafe.name}</span>
    </div>,
    <div key={cafe.providerName}>
      <div className="font-bold text-[#1c1b1b]">{cafe.providerName}</div>
      <div className="text-[10px] text-[#747878] font-semibold">{cafe.email}</div>
    </div>,
    <span key={cafe.saasPlan} className="font-bold text-[#1c1b1b]">{cafe.saasPlan}</span>,
    <CafeStatusBadge key={cafe.status} status={cafe.status} />,
    <span key={cafe.createdDate} className="font-mono text-xs text-[#747878]">{cafe.createdDate}</span>,
  ])

  return (
    <AdminShell>
      <AdminHeader
        title="Tổng quan Hệ thống"
        description="Theo dõi hoạt động của nền tảng, đối tác và phân tích doanh thu."
      />

      {/* Top Filter Bar (Below Header, Right Aligned) */}
      <div className="mb-6 flex justify-end">
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {/* Preset Buttons */}
          <div className="flex rounded-lg border border-[#c4c7c8] bg-[#f1edec] p-0.5 w-full sm:w-auto justify-between sm:justify-start">
            {(["daily", "weekly", "monthly"] as AdminRevenuePeriod[]).map((p) => (
              <button
                key={p}
                type="button"
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

          {/* Custom Date Range Picker */}
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
              size="sm"
              onClick={handleClearDateRange}
              className="h-8 gap-1 border-[#c4c7c8] bg-white px-2.5 text-xs font-bold text-[#747878] hover:text-[#1c1b1b]"
            >
              <X className="size-3.5" />
              Xóa bộ lọc
            </Button>
          )}
        </div>
      </div>

      {/* Metrics Section */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AdminMetricCard
          label="Đối tác mới đăng ký"
          value={kpi?.totalCafes.value || "0"}
          helper={kpi?.totalCafes.helper || ""}
          icon={<Building2 />}
          trend="up"
        />
        <AdminMetricCard
          label="Người dùng mới đăng ký"
          value={kpi?.totalUsers.value || "0"}
          helper={kpi?.totalUsers.helper || ""}
          icon={<Users />}
          trend="up"
        />
        <AdminMetricCard
          label="Doanh thu trong kỳ"
          value={kpi?.totalRevenue?.value || kpi?.monthlyRevenue?.value || "0 ₫"}
          helper={kpi?.totalRevenue?.helper || kpi?.monthlyRevenue?.helper || ""}
          icon={<DollarSign />}
          trend="up"
        />
        <AdminMetricCard
          label="Lượt chơi trong kỳ"
          value={kpi?.activeSessions.value || "0"}
          helper={kpi?.activeSessions.helper || ""}
          icon={<Play className="fill-current text-orange-500" />}
          trend="up"
        />
      </section>

      {/* Analytics Charts */}
      <section className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Cafe Growth Line Chart (Full Row) */}
        <AdminPanel className="lg:col-span-12">
          <AdminPanelTitle
            title="Sự tăng trưởng của Đối tác"
            subtitle={growthSubtitle}
          />
          <div className="h-[280px] w-full text-xs">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={cafeGrowth} margin={{ top: 10, right: 35, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e2e1" vertical={false} />
                <XAxis dataKey="name" stroke="#747878" tickLine={false} axisLine={false} interval={0} tick={{ fontSize: 11 }} />
                <YAxis stroke="#747878" tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(val: any) => [`${val} cơ sở`, "Đăng ký mới"]}
                  contentStyle={{ backgroundColor: "#ffffff", borderColor: "#e5e2e1", borderRadius: "8px", fontWeight: "bold" }}
                  labelStyle={{ color: "#747878" }}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#ea580c"
                  strokeWidth={3}
                  activeDot={{ r: 6 }}
                  dot={{ r: 3, strokeWidth: 2, fill: "#ffffff" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </AdminPanel>

        {/* SaaS Revenue Bar Chart */}
        <AdminPanel className="lg:col-span-6">
          <AdminPanelTitle
            title="Doanh thu Gói SaaS"
            subtitle="Tỷ lệ doanh thu từ các gói dịch vụ"
          />
          <div className="h-[280px] w-full text-xs">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revenueByPlan} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e2e1" vertical={false} />
                <XAxis dataKey="name" stroke="#747878" tickLine={false} axisLine={false} interval={0} tick={{ fontSize: 11 }} />
                <YAxis stroke="#747878" tickLine={false} axisLine={false} tickFormatter={formatYAxisCurrency} />
                <Tooltip
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(value: any) => [`${Number(value || 0).toLocaleString()} ₫`, "Doanh thu"]}
                  contentStyle={{ backgroundColor: "#ffffff", borderColor: "#e5e2e1", borderRadius: "8px", fontWeight: "bold" }}
                />
                <Bar dataKey="revenue" fill="#f97316" radius={[4, 4, 0, 0]} maxBarSize={50} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </AdminPanel>

        {/* Contest Revenue Bar Chart */}
        <AdminPanel className="lg:col-span-6">
          <AdminPanelTitle
            title="Doanh thu Gói Tạo Giải"
            subtitle="Phí mua gói tổ chức giải đấu"
          />
          <div className="h-[280px] w-full text-xs">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revenueByContestPlan} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e2e1" vertical={false} />
                <XAxis dataKey="name" stroke="#747878" tickLine={false} axisLine={false} interval={0} tick={{ fontSize: 11 }} />
                <YAxis stroke="#747878" tickLine={false} axisLine={false} tickFormatter={formatYAxisCurrency} />
                <Tooltip
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(value: any) => [`${Number(value || 0).toLocaleString()} ₫`, "Doanh thu"]}
                  contentStyle={{ backgroundColor: "#ffffff", borderColor: "#e5e2e1", borderRadius: "8px", fontWeight: "bold" }}
                />
                <Bar dataKey="revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </AdminPanel>
      </section>

      {/* Traffic Metrics (Full Row) */}
      <section className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
        <AdminPanel className="lg:col-span-12">
          <AdminPanelTitle
            title="Lượng truy cập Sân chơi"
            subtitle={sessionsTrendSubtitle}
          />
          <div className="h-[280px] w-full text-xs">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={activeSessionsTrend} margin={{ top: 10, right: 35, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorSessions" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ea580c" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#ea580c" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e2e1" vertical={false} />
                <XAxis dataKey="name" stroke="#747878" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                <YAxis stroke="#747878" tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(val: any) => [`${val} lượt/phiên`, "Lượt chơi"]}
                  contentStyle={{ backgroundColor: "#ffffff", borderColor: "#e5e2e1", borderRadius: "8px", fontWeight: "bold" }}
                  labelStyle={{ color: "#747878" }}
                />
                <Area type="monotone" dataKey="value" stroke="#ea580c" strokeWidth={3} fillOpacity={1} fill="url(#colorSessions)" activeDot={{ r: 6 }} dot={{ r: 3, strokeWidth: 2, fill: "#ffffff" }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </AdminPanel>
      </section>

      {/* Onboarding Queue Table (Full Row) */}
      <section className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
        <AdminPanel className="lg:col-span-12">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <AdminPanelTitle
              title="Đối tác đăng ký gần đây"
              subtitle="Cần rà soát hồ sơ và thực hiện phê duyệt đối tác mới"
            />
            <Button
              asChild
              variant="outline"
              className="h-9 gap-1.5 rounded-lg border-[#c4c7c8] bg-[#f1edec]/50 hover:bg-[#e5e2e1] text-[#1c1b1b] font-bold text-xs"
            >
              <Link to={routePaths.adminCafes}>
                Duyệt tất cả
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
          
          <AdminTable columns={columns} rows={rows} />
        </AdminPanel>
      </section>
    </AdminShell>
  )
}

