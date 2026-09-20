import type { ProviderSubscription } from "../types"

/**
 * Hai số đếm để BẮT BUỘC, không cho mặc định 0.
 *
 * `channelCount` từng là tuỳ chọn với mặc định 0, và nơi gọi duy nhất quên
 * truyền — nên thanh "Kênh kết nối" luôn hiện 0 dù chủ sân đã nối Facebook.
 * Không có lỗi nào ở đâu cả: `?: number` khiến "quên truyền" là hợp lệ, và số 0
 * trông y hệt một câu trả lời thật.
 *
 * Để bắt buộc thì quên truyền là hỏng lúc biên dịch, không phải hỏng lặng lẽ
 * trên màn hình của hội đồng.
 */
interface Props {
  subscription: ProviderSubscription | null
  branchCount: number
  channelCount: number
}

function QuotaBar({
  label,
  used,
  limit,
}: {
  label: string
  used: number
  limit: number
}) {
  const isUnlimited = limit === -1
  const pct = isUnlimited ? 0 : Math.min(100, Math.round((used / limit) * 100))
  const warn = !isUnlimited && pct >= 80

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
        <span>{label}</span>
        <span className={warn ? "text-orange-600" : "text-slate-400"}>
          {isUnlimited ? "Không giới hạn" : `${used} / ${limit}`}
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
        {!isUnlimited && (
          <div
            className={`h-full rounded-full transition-all ${warn ? "bg-orange-500" : "bg-emerald-500"}`}
            style={{ width: `${pct}%` }}
          />
        )}
        {isUnlimited && <div className="h-full w-full rounded-full bg-emerald-200" />}
      </div>
    </div>
  )
}

export function UsageQuotaBars({ subscription, branchCount, channelCount }: Props) {
  if (!subscription?.plan) return null
  const { plan, aiMessagesUsed } = subscription

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
      <h3 className="text-sm font-bold text-slate-700">Sử dụng tài nguyên</h3>
      <QuotaBar label="Chi nhánh" used={branchCount} limit={plan.branchLimit} />
      <QuotaBar label="AI Messages (tháng này)" used={aiMessagesUsed} limit={plan.aiQuotaPerMonth} />
      <QuotaBar label="Kênh kết nối" used={channelCount} limit={plan.channelLimit} />
    </div>
  )
}
