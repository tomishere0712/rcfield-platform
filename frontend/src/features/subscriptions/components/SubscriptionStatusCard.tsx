import { AlertTriangle, Clock, CheckCircle2, XCircle, Zap } from "lucide-react"
import type { ProviderSubscription } from "../types"

type Status = ProviderSubscription["status"]

const STATUS_CONFIG: Record<Status, { label: string; color: string; icon: React.ElementType; bg: string }> = {
  TRIAL: { label: "Dùng thử", color: "text-blue-700", bg: "bg-blue-50 border-blue-100", icon: Zap },
  ACTIVE: { label: "Đang hoạt động", color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-100", icon: CheckCircle2 },
  GRACE_PERIOD: { label: "Gia hạn khẩn cấp", color: "text-orange-700", bg: "bg-orange-50 border-orange-100", icon: AlertTriangle },
  EXPIRED: { label: "Đã hết hạn", color: "text-red-700", bg: "bg-red-50 border-red-100", icon: XCircle },
}

function daysUntil(dateStr: string): number {
  return Math.max(0, Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
}

export function SubscriptionStatusCard({ subscription }: { subscription: ProviderSubscription | null }) {
  if (!subscription) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-400">
        Không có gói đăng ký nào đang hoạt động.
      </div>
    )
  }

  const { label, color, bg, icon: Icon } = STATUS_CONFIG[subscription.status]
  const expiryDays = daysUntil(subscription.expiresAt)
  const graceDays = subscription.graceEndsAt ? daysUntil(subscription.graceEndsAt) : null

  return (
    <div className={`rounded-xl border p-5 ${bg}`}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`flex size-10 items-center justify-center rounded-full bg-white/80 shadow-sm ${color}`}>
            <Icon className="size-5" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              {subscription.plan?.name ?? "—"} Plan
            </p>
            <p className={`text-lg font-extrabold ${color}`}>{label}</p>
          </div>
        </div>

        <div className="text-right">
          {subscription.status !== "EXPIRED" && (
            <div className="flex items-center gap-1 justify-end text-slate-500">
              <Clock className="size-3.5" />
              <span className="text-xs font-semibold">
                {expiryDays > 0 ? `Còn ${expiryDays} ngày` : "Hết hạn hôm nay"}
              </span>
            </div>
          )}
          <p className="text-xs text-slate-400 mt-1">
            {new Date(subscription.expiresAt).toLocaleDateString("vi-VN", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
            })}
          </p>
        </div>
      </div>

      {subscription.status === "GRACE_PERIOD" && graceDays !== null && (
        <div className="mt-3 rounded-lg bg-orange-100 border border-orange-200 px-4 py-2.5">
          <p className="text-xs font-bold text-orange-800">
            ⚠️ Thời gian gia hạn khẩn cấp: còn {graceDays} ngày. Hãy đăng ký gói mới để tránh mất dữ liệu.
          </p>
        </div>
      )}
      {subscription.status === "EXPIRED" && (
        <div className="mt-3 rounded-lg bg-red-100 border border-red-200 px-4 py-2.5">
          <p className="text-xs font-bold text-red-800">
            Tài khoản đã hết hạn. Vui lòng thanh toán để khôi phục chi nhánh.
          </p>
        </div>
      )}
    </div>
  )
}
