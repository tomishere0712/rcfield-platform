import { useState, useRef, useEffect } from "react"
import { Sparkles, RefreshCw, AlertTriangle, Info, TrendingUp, Users, Car, BarChart2, GitBranch } from "lucide-react"
import { toast } from "sonner"
import { providerDashboardApi } from "../api/provider-dashboard.api"
import type { AiInsightResponse, AiInsight, InsightSeverity, InsightType } from "../types/dashboard.types"

interface AiInsightsPanelProps {
  from: string
  to: string
  cafeId?: string | null
  isFeatureEnabled: boolean
}

type PanelState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: AiInsightResponse }
  | { status: "insufficient_data" }
  | { status: "quota_exceeded"; resetDate: string }
  | { status: "error"; disabled?: boolean }

const SEVERITY_STYLES: Record<InsightSeverity, string> = {
  positive: "border-emerald-200 bg-emerald-50 text-emerald-900",
  neutral: "border-blue-200 bg-blue-50 text-blue-900",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  critical: "border-red-200 bg-red-50 text-red-900",
}

const SEVERITY_BADGE: Record<InsightSeverity, string> = {
  positive: "bg-emerald-100 text-emerald-700",
  neutral: "bg-blue-100 text-blue-700",
  warning: "bg-amber-100 text-amber-700",
  critical: "bg-red-100 text-red-700",
}

const TYPE_ICON: Record<InsightType, React.ReactNode> = {
  trend: <TrendingUp className="size-3.5" />,
  revenue_mix: <BarChart2 className="size-3.5" />,
  fleet: <Car className="size-3.5" />,
  retention: <Users className="size-3.5" />,
  branch: <GitBranch className="size-3.5" />,
}

const TYPE_LABEL: Record<InsightType, string> = {
  trend: "Xu hướng",
  revenue_mix: "Nguồn doanh thu",
  fleet: "Phương tiện",
  retention: "Khách hàng",
  branch: "Chi nhánh",
}

const SEVERITY_LABEL: Record<InsightSeverity, string> = {
  positive: "Tốt",
  neutral: "Trung bình",
  warning: "Cảnh báo",
  critical: "Nghiêm trọng",
}

function getNextMonthReset(): string {
  const now = new Date()
  const reset = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  return `${String(reset.getDate()).padStart(2, "0")}/${String(reset.getMonth() + 1).padStart(2, "0")}`
}

export function AiInsightsPanel({ from, to, cafeId, isFeatureEnabled }: AiInsightsPanelProps) {
  const [panel, setPanel] = useState<PanelState>({ status: "idle" })
  const prevFilters = useRef({ from, to, cafeId })

  // Reset to idle when filters change after a result is shown
  useEffect(() => {
    const prev = prevFilters.current
    if (
      panel.status !== "idle" &&
      panel.status !== "loading" &&
      (prev.from !== from || prev.to !== to || prev.cafeId !== cafeId)
    ) {
      setPanel({ status: "idle" })
    }
    prevFilters.current = { from, to, cafeId }
  }, [from, to, cafeId, panel.status])

  if (!isFeatureEnabled) return null

  const handleAnalyze = async () => {
    if (panel.status === "loading") return
    setPanel({ status: "loading" })

    try {
      const result = await providerDashboardApi.generateAiInsights({ from, to, cafeId })

      if (result.type === "INSUFFICIENT_DATA") {
        setPanel({ status: "insufficient_data" })
        return
      }

      setPanel({ status: "success", data: result.data! })
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { code?: string } } }
      const code = axiosErr?.response?.data?.code

      if (code === "AI_QUOTA_EXCEEDED") {
        setPanel({ status: "quota_exceeded", resetDate: getNextMonthReset() })
        return
      }

      if (code === "AI_ANALYTICS_DISABLED") {
        setPanel({ status: "error", disabled: true })
        return
      }

      toast.error("Phân tích AI thất bại. Vui lòng thử lại sau.")
      setPanel({ status: "error" })
    }
  }

  const isIdle = panel.status === "idle"
  const hasResult = panel.status === "success"
  const buttonLabel =
    panel.status === "loading"
      ? "Đang phân tích..."
      : hasResult || panel.status === "insufficient_data" || panel.status === "error"
        ? "✨ Phân tích lại"
        : "✨ Phân tích AI"

  return (
    <div className="rounded-xl border border-[#e5e2e1] bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 p-5 border-b border-[#e5e2e1]">
        <div className="flex items-center gap-2.5">
          <div className="size-8 rounded-lg bg-violet-50 flex items-center justify-center">
            <Sparkles className="size-4 text-violet-600" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[#1c1b1b]">AI Phân Tích Doanh Thu</h3>
            <p className="text-xs text-[#747878] font-medium">
              Tự động tổng hợp từ dữ liệu trong kỳ đã chọn
            </p>
          </div>
        </div>

        {panel.status === "quota_exceeded" ? (
          <div className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg">
            Hết lượt — reset {panel.resetDate}
          </div>
        ) : (
          <button
            onClick={handleAnalyze}
            disabled={panel.status === "loading"}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-60 disabled:cursor-not-allowed rounded-lg transition-colors"
          >
            {panel.status === "loading" && <RefreshCw className="size-3.5 animate-spin" />}
            {buttonLabel}
          </button>
        )}
      </div>

      {/* Body */}
      <div className="p-5">
        {/* Idle */}
        {isIdle && (
          <>
            <div className="flex flex-col items-center justify-center py-8 text-center gap-2">
              <Sparkles className="size-8 text-violet-200" />
              <p className="text-sm font-semibold text-[#747878]">
                Nhấn "✨ Phân tích AI" để nhận báo cáo doanh thu thông minh
              </p>
              <p className="text-xs text-[#b0b3b3]">Kết quả phân tích trong khoảng 10–15 giây</p>
            </div>
            {/* Nói trước khi họ bấm: đặt đúng kỳ vọng ngay từ đầu thì tốt hơn
                là để họ đọc xong một bản phân tích rồi mới thấy dòng miễn trừ. */}
            <ReferenceNote />
          </>
        )}

        {/* Loading */}
        {panel.status === "loading" && (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <RefreshCw className="size-6 text-violet-400 animate-spin" />
            <p className="text-sm font-semibold text-[#5d5f5f]">Đang phân tích dữ liệu doanh thu...</p>
            <p className="text-xs text-[#b0b3b3]">Đang xử lý, vui lòng đợi trong giây lát</p>
          </div>
        )}

        {/* Insufficient Data */}
        {panel.status === "insufficient_data" && (
          <div className="flex items-start gap-3 p-4 rounded-lg bg-zinc-50 border border-zinc-200">
            <AlertTriangle className="size-4 text-zinc-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-bold text-[#444748]">Không đủ dữ liệu để phân tích</p>
              <p className="text-xs text-[#747878] mt-1">
                Kỳ được chọn chưa có booking hoàn thành. Hãy chọn khoảng thời gian khác hoặc đợi thêm dữ liệu.
              </p>
            </div>
          </div>
        )}

        {/* Error */}
        {panel.status === "error" && (
          <div className="flex items-start gap-3 p-4 rounded-lg bg-red-50 border border-red-200">
            <AlertTriangle className="size-4 text-red-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-bold text-red-800">
                {panel.disabled ? "Tính năng chưa được kích hoạt" : "Phân tích thất bại"}
              </p>
              <p className="text-xs text-red-600 mt-1">
                {panel.disabled
                  ? "Tính năng AI Phân Tích Doanh Thu hiện chưa được bật. Liên hệ quản trị viên để kích hoạt."
                  : "Dịch vụ AI tạm thời không khả dụng. Vui lòng thử lại sau ít phút."}
              </p>
            </div>
          </div>
        )}

        {/* Quota Exceeded */}
        {panel.status === "quota_exceeded" && (
          <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-50 border border-amber-200">
            <AlertTriangle className="size-4 text-amber-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-bold text-amber-800">Đã hết lượt phân tích tháng này</p>
              <p className="text-xs text-amber-700 mt-1">
                Lượt phân tích sẽ được khởi tạo lại vào ngày 01/{panel.resetDate.split("/")[1]}.
              </p>
            </div>
          </div>
        )}

        {/* Success */}
        {panel.status === "success" && (
          <div className="space-y-5">
            {/* Summary */}
            <div className="p-4 rounded-lg bg-violet-50 border border-violet-100">
              <p className="text-xs font-bold text-violet-500 uppercase tracking-wider mb-1.5">Tổng quan</p>
              <p className="text-sm text-[#2d2f2f] leading-relaxed font-medium">{panel.data.summary}</p>
            </div>

            {/* Insight Cards */}
            <div>
              <p className="text-xs font-bold text-[#747878] uppercase tracking-wider mb-3">Nhận định chi tiết</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {panel.data.insights.map((insight: AiInsight, i: number) => (
                  <InsightCard key={i} insight={insight} />
                ))}
              </div>
            </div>

            {/* Top Opportunity */}
            <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200">
              <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-1.5">
                🎯 Cơ hội hàng đầu
              </p>
              <p className="text-sm text-emerald-900 font-semibold leading-relaxed">
                {panel.data.topOpportunity}
              </p>
            </div>

            {/* Watchouts */}
            {panel.data.watchouts.length > 0 && (
              <div className="p-4 rounded-lg bg-amber-50 border border-amber-200">
                <p className="text-xs font-bold text-amber-600 uppercase tracking-wider mb-2">
                  ⚠️ Điểm cần theo dõi
                </p>
                <ul className="space-y-1.5">
                  {panel.data.watchouts.map((w: string, i: number) => (
                    <li key={i} className="text-sm text-amber-900 font-medium flex items-start gap-2">
                      <span className="text-amber-400 mt-0.5 shrink-0">•</span>
                      {w}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Nhắc lại ngay dưới kết quả — đây là lúc người đọc dễ coi mấy
                nhận định này là kết luận đã kiểm chứng nhất. */}
            <ReferenceNote />

            {/* Footer */}
            <p className="text-[10px] text-[#b0b3b3] text-right">
              Phân tích lúc {new Date(panel.data.generatedAt).toLocaleString("vi-VN")}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Ghi chú "chỉ mang tính tham khảo".
 *
 * Tách thành một chỗ dùng chung để hai lần xuất hiện (trước khi phân tích và
 * ngay dưới kết quả) không bao giờ nói lệch nhau — sửa một chỗ là cả hai đổi.
 */
function ReferenceNote() {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-[#e5e2e1] bg-[#fcfbfb] px-3 py-2.5">
      <Info className="mt-0.5 size-3.5 shrink-0 text-[#a3a3a3]" />
      <p className="text-[11px] leading-5 text-[#747878]">
        Nội dung do AI tạo tự động từ dữ liệu trong kỳ đã chọn —{" "}
        <span className="font-bold text-[#5d5f5f]">chỉ mang tính tham khảo</span>, không
        thay thế cho báo cáo chính thức. Hãy đối chiếu số liệu chi tiết trước khi ra quyết
        định kinh doanh.
      </p>
    </div>
  )
}

function InsightCard({ insight }: { insight: AiInsight }) {
  const type = insight.type as InsightType
  const severity = insight.severity as InsightSeverity

  return (
    <div className={`p-4 rounded-lg border ${SEVERITY_STYLES[severity] ?? SEVERITY_STYLES.neutral}`}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5">
          <span className={`flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded ${SEVERITY_BADGE[severity] ?? SEVERITY_BADGE.neutral}`}>
            {TYPE_ICON[type]}
            {TYPE_LABEL[type] ?? type}
          </span>
        </div>
        <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded ${SEVERITY_BADGE[severity] ?? SEVERITY_BADGE.neutral}`}>
          {SEVERITY_LABEL[severity] ?? severity}
        </span>
      </div>
      <p className="text-xs font-bold mb-1">{insight.title}</p>
      <p className="text-xs leading-relaxed opacity-90">{insight.body}</p>
    </div>
  )
}
