import { useState, useRef } from "react"
import { Link } from "react-router"
import { toast } from "sonner"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

import { routePaths } from "@/app/router/route-paths"
import { AdminShell } from "@/pages/admin/components/AdminShell"
import {
  AdminHeader,
  AdminPanel,
  AdminPanelTitle,
  AdminSearchBar,
} from "@/pages/admin/components/AdminPrimitives"
import {
  adminFeatureFlagsApi,
  type ApiFeatureFlag,
} from "@/features/admin/api/admin-feature-flags.api"

/**
 * Chỉ những tính năng dưới đây thật sự đọc `config.monthly_quota` khi chạy.
 *
 * Hạn mức của chatbot KHÔNG nằm ở đây: `incrementAIQuota` trong
 * `subscription.service.ts` chặn theo `subscription_plans.ai_quota_per_month`
 * của gói mà đối tác mua. Bày ô hạn mức trên dòng chatbot là mời admin sửa một
 * con số không điều khiển gì.
 */
const FLAGS_WITH_OWN_QUOTA = new Set(["AI_REVENUE_ANALYTICS"])

/** Tính năng lấy hạn mức từ gói thuê bao, không sửa được ở màn này. */
const FLAGS_QUOTA_FROM_PLAN = new Set(["AI_CHATBOT"])

/** Tên gọi một dòng cấu hình trong thông báo: tên hiển thị kèm phạm vi. */
function flagLabel(flag: ApiFeatureFlag): string {
  const name = flag.display_name?.trim() || flag.feature_key
  const scope =
    flag.entity_type === "GLOBAL"
      ? "toàn nền tảng"
      : (flag.cafe_name ?? "chi nhánh")
  return `${name} (${scope})`
}

const FLAG_DESCRIPTIONS: Record<string, string> = {
  AI_CHATBOT:
    "Kích hoạt chatbot Gemini AI trả lời tự động cho khách hàng tại từng chi nhánh",
  AI_REVENUE_ANALYTICS:
    "Bảng phân tích doanh thu bằng AI Gemini trong Provider Dashboard",
}

export function AdminFeatureFlagsPage() {
  const queryClient = useQueryClient()
  const [searchTerm, setSearchTerm] = useState("")

  const { data: flags = [], isLoading } = useQuery({
    queryKey: ["admin-feature-flags"],
    queryFn: adminFeatureFlagsApi.list,
  })

  // Thông báo gọi tên dòng vừa sửa, không gọi feature_key: cùng một key có
  // nhiều dòng nên "AI_CHATBOT → Tắt" không cho biết vừa tắt của chi nhánh nào.
  const updateMutation = useMutation({
    mutationFn: ({
      id,
      isEnabled,
    }: {
      id: string
      isEnabled: boolean
      label?: string
    }) => adminFeatureFlagsApi.update(id, { isEnabled }),
    onSuccess: (updated, { isEnabled }) => {
      void queryClient.invalidateQueries({ queryKey: ["admin-feature-flags"] })
      toast.success(`${flagLabel(updated)} → ${isEnabled ? "Bật" : "Tắt"}`)
    },
    onError: () => {
      toast.error("Không thể cập nhật cấu hình")
    },
  })

  const updateQuotaMutation = useMutation({
    mutationFn: ({ id, monthlyQuota }: { id: string; monthlyQuota: number }) =>
      adminFeatureFlagsApi.update(id, {
        config: { monthly_quota: monthlyQuota },
      }),
    onSuccess: (updated, { monthlyQuota }) => {
      void queryClient.invalidateQueries({ queryKey: ["admin-feature-flags"] })
      toast.success(
        `${flagLabel(updated)} → hạn mức ${monthlyQuota === 0 ? "không giới hạn" : `${monthlyQuota} lượt/tháng`}`,
      )
    },
    onError: () => {
      toast.error("Không thể cập nhật hạn mức")
    },
  })

  const q = searchTerm.trim().toLowerCase()
  const filtered = flags.filter((f) =>
    [
      f.feature_key,
      f.display_name ?? "",
      f.description ?? "",
      f.cafe_name ?? "",
      FLAG_DESCRIPTIONS[f.feature_key] ?? "",
    ]
      .join(" ")
      .toLowerCase()
      .includes(q),
  )

  return (
    <AdminShell>
      <AdminHeader
        title="Cấu hình tính năng"
        description="Bật hoặc tắt các tính năng nền tảng. Thay đổi có hiệu lực ngay lập tức, không cần deploy lại."
      />

      <AdminPanel>
        <div className="mb-6">
          <AdminSearchBar
            placeholder="Tìm theo tên flag..."
            value={searchTerm}
            onChange={setSearchTerm}
          />
        </div>

        <AdminPanelTitle
          title="Danh sách Cấu hình tính năng"
          subtitle={`${flags.filter((f) => f.is_enabled).length} đang bật · ${flags.filter((f) => !f.is_enabled).length} đang tắt`}
        />

        <div className="border border-[#e5e2e1] rounded-xl overflow-hidden divide-y divide-[#e5e2e1]">
          {isLoading ? (
            <div className="p-8 text-center text-sm text-[#747878]">
              Đang tải...
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-sm font-semibold text-[#747878]">
              Không tìm thấy flag nào.
            </div>
          ) : (
            filtered.map((flag) => (
              <FlagRow
                key={flag.id}
                flag={flag}
                onToggle={(isEnabled) =>
                  updateMutation.mutate({ id: flag.id, isEnabled })
                }
                onUpdateQuota={(monthlyQuota) =>
                  updateQuotaMutation.mutate({ id: flag.id, monthlyQuota })
                }
                isPending={
                  updateMutation.isPending || updateQuotaMutation.isPending
                }
              />
            ))
          )}
        </div>
      </AdminPanel>
    </AdminShell>
  )
}

function FlagRow({
  flag,
  onToggle,
  onUpdateQuota,
  isPending,
}: {
  flag: ApiFeatureFlag
  onToggle: (isEnabled: boolean) => void
  onUpdateQuota: (monthlyQuota: number) => void
  isPending: boolean
}) {
  // Ưu tiên tên và mô tả do người khai đặt; chỉ khi trống mới dùng bảng mô tả
  // cứng theo feature_key. Trước đây luôn dùng bảng cứng nên mọi dòng cùng
  // feature_key hiện y hệt nhau.
  const title = flag.display_name?.trim() || flag.feature_key
  const description =
    flag.description?.trim() ||
    FLAG_DESCRIPTIONS[flag.feature_key] ||
    flag.feature_key
  const scopeLabel =
    flag.entity_type === "GLOBAL"
      ? "Toàn nền tảng"
      : (flag.cafe_name ?? "Chi nhánh đã bị xoá")
  const ownsQuota = FLAGS_WITH_OWN_QUOTA.has(flag.feature_key)
  const quotaFromPlan = FLAGS_QUOTA_FROM_PLAN.has(flag.feature_key)
  const monthlyQuota = (flag.config as { monthly_quota?: number })
    ?.monthly_quota
  const [editingQuota, setEditingQuota] = useState(false)
  const [quotaInput, setQuotaInput] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  const startEdit = () => {
    setQuotaInput(String(monthlyQuota ?? 0))
    setEditingQuota(true)
    setTimeout(() => inputRef.current?.select(), 0)
  }

  const commitEdit = () => {
    const val = parseInt(quotaInput, 10)
    if (!isNaN(val) && val >= 0 && val !== monthlyQuota) {
      onUpdateQuota(val)
    }
    setEditingQuota(false)
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 bg-white hover:bg-[#fcf8f8]/50 transition-colors">
      <div className="space-y-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-extrabold text-[#1c1b1b]">{title}</span>
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              flag.entity_type === "GLOBAL"
                ? "bg-violet-100 text-violet-700"
                : "bg-sky-100 text-sky-700"
            }`}
          >
            {scopeLabel}
          </span>
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              flag.is_enabled
                ? "bg-emerald-100 text-emerald-700"
                : "bg-zinc-100 text-zinc-500"
            }`}
          >
            {flag.is_enabled ? "Đang bật" : "Đang tắt"}
          </span>
          {ownsQuota &&
            monthlyQuota !== undefined &&
            (editingQuota ? (
              <div className="flex items-center gap-1">
                <input
                  ref={inputRef}
                  type="number"
                  min="0"
                  value={quotaInput}
                  onChange={(e) => setQuotaInput(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitEdit()
                    if (e.key === "Escape") setEditingQuota(false)
                  }}
                  className="w-20 text-[11px] font-semibold px-1.5 py-0.5 rounded border border-[#c5c2c1] focus:outline-none focus:border-violet-400 text-[#1c1b1b]"
                />
                <span className="text-[10px] text-[#747878]">
                  lượt/tháng (0=∞)
                </span>
              </div>
            ) : (
              <button
                onClick={startEdit}
                title="Nhấn để sửa quota"
                className="text-[10px] font-semibold text-[#747878] bg-[#f6f3f2] hover:bg-[#edeae9] px-2 py-0.5 rounded-full border border-[#e5e2e1] transition-colors cursor-pointer"
              >
                {monthlyQuota === 0
                  ? "Không giới hạn"
                  : `${monthlyQuota} lượt/tháng`}
              </button>
            ))}
        </div>
        <p className="text-xs text-[#5d5f5f] font-medium leading-relaxed">
          {description}
        </p>
        {quotaFromPlan && (
          <p className="text-[11px] font-semibold text-[#747878]">
            Hạn mức tin nhắn lấy theo gói dịch vụ mà đối tác đang dùng —{" "}
            <Link
              to={routePaths.adminSubscriptionPlans}
              className="font-bold text-orange-700 underline underline-offset-2 hover:text-orange-800"
            >
              sửa ở mục Gói dịch vụ
            </Link>
            . Công tắc ở đây chỉ bật/tắt tính năng.
          </p>
        )}
        <p className="font-mono text-[10px] text-[#a3a3a3]">
          {flag.feature_key}
        </p>
      </div>

      {/* Toggle */}
      <button
        onClick={() => onToggle(!flag.is_enabled)}
        disabled={isPending}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${
          flag.is_enabled ? "bg-emerald-500" : "bg-zinc-300"
        }`}
        aria-checked={flag.is_enabled}
        role="switch"
      >
        <span
          className={`pointer-events-none inline-block size-5 rounded-full bg-white shadow-md transform transition-transform duration-200 ${
            flag.is_enabled ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  )
}
