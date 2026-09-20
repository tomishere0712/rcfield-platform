import { CheckCircle2, Clock3, Hourglass, TimerReset } from "lucide-react"
import { cn } from "@/shared/lib/utils"

export interface ExtensionAuditEntry {
  proposalId: string
  extraMinutes: number
  additionalFee: number
  approvedAt?: string
}

interface ExtensionProposalState {
  extraMinutes: number
  additionalFee: number
  newPlannedEnd?: string
  expiresAt?: string
  status: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED"
}

interface ExtensionAuditCardProps {
  extensions: ExtensionAuditEntry[]
  initialPlannedEnd?: string
  currentProposal?: ExtensionProposalState
  className?: string
}

const formatCurrency = (amount: number) => `${Number(amount).toLocaleString("vi-VN")} đ`

const formatDateTime = (value?: string) => {
  if (!value || Number.isNaN(new Date(value).getTime())) return null
  return new Date(value).toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

const formatTime = (value?: string | Date) => {
  if (!value || Number.isNaN(new Date(value).getTime())) return null
  return new Date(value).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })
}

function getProposalLabel(status: ExtensionProposalState["status"]) {
  switch (status) {
    case "PENDING":
      return "Đang chờ phản hồi"
    case "APPROVED":
      return "Đã được chấp thuận"
    case "REJECTED":
      return "Đã từ chối"
    case "EXPIRED":
      return "Đã hết hạn phản hồi"
  }
}

/** A single audit trail used by both customer and staff session detail views. */
export function ExtensionAuditCard({
  extensions,
  initialPlannedEnd,
  currentProposal,
  className,
}: ExtensionAuditCardProps) {
  const approvedExtensions = [...extensions].sort((a, b) => {
    const aTime = a.approvedAt ? new Date(a.approvedAt).getTime() : 0
    const bTime = b.approvedAt ? new Date(b.approvedAt).getTime() : 0
    return aTime - bTime
  })
  const totalMinutes = approvedExtensions.reduce((sum, extension) => sum + Number(extension.extraMinutes), 0)
  const totalFee = approvedExtensions.reduce((sum, extension) => sum + Number(extension.additionalFee), 0)
  const hasCurrentPendingProposal = currentProposal && currentProposal.status !== "APPROVED"

  if (approvedExtensions.length === 0 && !hasCurrentPendingProposal) return null

  const initialEnd = initialPlannedEnd ? new Date(initialPlannedEnd) : null
  const auditRows = approvedExtensions.reduce<Array<{
    extension: ExtensionAuditEntry
    previousEnd: Date | null
    nextEnd: Date | null
  }>>((rows, extension) => {
    const precedingEnd = rows.at(-1)?.nextEnd ?? initialEnd
    const previousEnd = precedingEnd && !Number.isNaN(precedingEnd.getTime())
      ? new Date(precedingEnd)
      : null
    const nextEnd = previousEnd
      ? new Date(previousEnd.getTime() + Number(extension.extraMinutes) * 60_000)
      : null
    return [...rows, { extension, previousEnd, nextEnd }]
  }, [])

  return (
    <section className={cn("rounded-2xl border border-orange-200 bg-white p-5 shadow-sm", className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
            <TimerReset className="size-4.5" />
          </div>
          <div>
            <h3 className="text-sm font-black uppercase tracking-wider text-slate-950">Lịch sử gia hạn giờ chơi</h3>
            <p className="mt-0.5 text-xs font-medium leading-relaxed text-slate-500">
              Mỗi lần gia hạn được ghi nhận cùng thời lượng, thời điểm chấp thuận và khoản phí tương ứng.
            </p>
          </div>
        </div>
        {approvedExtensions.length > 0 && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-right">
            <p className="text-[10px] font-extrabold uppercase tracking-wide text-emerald-700">Đã gia hạn</p>
            <p className="mt-0.5 text-sm font-black text-emerald-800">+{totalMinutes} phút · {formatCurrency(totalFee)}</p>
          </div>
        )}
      </div>

      <div className="mt-4 space-y-2.5">
        {auditRows.map(({ extension, previousEnd, nextEnd }, index) => (
          <div key={extension.proposalId} className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
              <div className="flex items-center gap-2 text-xs font-extrabold text-slate-900">
                <CheckCircle2 className="size-4 text-emerald-600" />
                Lần {index + 1}: thêm {extension.extraMinutes} phút
              </div>
              <span className="text-xs font-black text-orange-600">+{formatCurrency(extension.additionalFee)}</span>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-semibold text-slate-500">
              {previousEnd && nextEnd && (
                <span>Khung giờ: {formatTime(previousEnd)} → {formatTime(nextEnd)}</span>
              )}
              {formatDateTime(extension.approvedAt) && (
                <span>Chấp thuận lúc {formatDateTime(extension.approvedAt)}</span>
              )}
            </div>
          </div>
        ))}

        {hasCurrentPendingProposal && currentProposal && (
          <div className={cn(
            "rounded-xl border px-3.5 py-3",
            currentProposal.status === "PENDING"
              ? "border-amber-200 bg-amber-50"
              : "border-slate-200 bg-slate-50",
          )}>
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
              <div className="flex items-center gap-2 text-xs font-extrabold text-slate-900">
                {currentProposal.status === "PENDING" ? (
                  <Hourglass className="size-4 text-amber-600" />
                ) : (
                  <Clock3 className="size-4 text-slate-500" />
                )}
                {getProposalLabel(currentProposal.status)}: thêm {currentProposal.extraMinutes} phút
              </div>
              <span className="text-xs font-black text-orange-600">+{formatCurrency(currentProposal.additionalFee)}</span>
            </div>
            {currentProposal.status === "PENDING" && currentProposal.expiresAt && (
              <p className="mt-1.5 text-[11px] font-semibold text-amber-700">
                Cần phản hồi trước {formatDateTime(currentProposal.expiresAt) ?? "khi yêu cầu hết hạn"}.
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
