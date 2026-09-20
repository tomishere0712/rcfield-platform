import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  Building2,
  CreditCard,
  Loader2,
  ShieldAlert,
  Trophy,
} from "lucide-react"

import { AdminShell } from "@/pages/admin/components/AdminShell"
import {
  AdminHeader,
  AdminPanel,
  AdminPanelTitle,
  AdminSearchBar,
  AdminTable,
  PaymentStatusBadge,
} from "@/pages/admin/components/AdminPrimitives"
import { subscriptionApi } from "@/features/subscriptions/api/subscription.api"
import type { LedgerRow, LedgerSource } from "@/features/subscriptions/types"
import { formatPaymentGateway } from "@/shared/lib/format"

const SOURCE_LABELS: Record<LedgerSource, string> = {
  SAAS: "Gói thuê bao",
  CONTEST_FEE: "Phí tổ chức giải",
}

const SOURCE_CLASSES: Record<LedgerSource, string> = {
  SAAS: "text-purple-700",
  CONTEST_FEE: "text-amber-700",
}

/**
 * Trạng thái đến từ ba bảng khác nhau nên tên gọi cũng khác nhau. Quy về ba nhóm
 * để badge hiểu được, thay vì hiện chuỗi thô của từng bảng.
 */
function normalizeStatus(status: string): "SUCCESS" | "PENDING" | "FAILED" {
  if (["SUCCESS", "CONFIRMED", "PAID"].includes(status)) return "SUCCESS"
  if (["PENDING", "PENDING_PAYMENT", "PENDING_REVIEW"].includes(status))
    return "PENDING"
  return "FAILED"
}

function formatVnd(value: number) {
  return `${Number(value).toLocaleString("vi-VN")} ₫`
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function AdminPaymentsPage() {
  const [searchTerm, setSearchTerm] = useState("")
  const [source, setSource] = useState<"ALL" | LedgerSource>("ALL")
  const [status, setStatus] = useState<string>("ALL")

  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin-ledger", source, status, searchTerm],
    queryFn: () =>
      subscriptionApi.listPlatformLedger({
        source: source === "ALL" ? undefined : source,
        status: status === "ALL" ? undefined : status,
        q: searchTerm.trim() || undefined,
        limit: 100,
      }),
  })

  const rowsData: LedgerRow[] = data?.data ?? []
  const summary = data?.summary

  const columns = [
    "Mã giao dịch",
    "Bên trả",
    "Nguồn tiền",
    "Nội dung",
    "Số tiền",
    "Phương thức",
    "Thời điểm",
    "Trạng thái",
  ]

  const rows = rowsData.map((row) => [
    <span key={`${row.id}-code`} className="font-mono text-xs text-[#747878]">
      {row.code}
    </span>,
    <span key={`${row.id}-party`} className="font-bold text-[#1c1b1b]">
      {row.party ?? "—"}
    </span>,
    <span
      key={`${row.id}-source`}
      className={`text-xs font-bold ${SOURCE_CLASSES[row.source]}`}
    >
      {SOURCE_LABELS[row.source]}
    </span>,
    <span
      key={`${row.id}-subject`}
      className="block max-w-xs truncate text-xs font-semibold text-[#5d5f5f]"
      title={row.subject ?? ""}
    >
      {row.subject ?? "—"}
    </span>,
    <span
      key={`${row.id}-amount`}
      className="font-mono text-sm font-extrabold text-[#1c1b1b]"
    >
      {formatVnd(row.amount)}
    </span>,
    <span
      key={`${row.id}-gateway`}
      className="text-xs font-semibold text-[#444748]"
    >
      {row.gateway ? formatPaymentGateway(row.gateway) : "—"}
    </span>,
    <span key={`${row.id}-date`} className="font-mono text-xs text-[#747878]">
      {formatDateTime(row.created_at)}
    </span>,
    <PaymentStatusBadge
      key={`${row.id}-status`}
      status={normalizeStatus(row.status)}
    />,
  ])

  return (
    <AdminShell>
      <AdminHeader
        title="Sổ giao dịch"
        description="Tiền đối tác trả cho RCField: phí thuê bao phần mềm và phí tổ chức giải."
      />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Doanh thu nền tảng"
          value={summary ? formatVnd(summary.platform_revenue) : "—"}
          hint="Thuê bao + phí tổ chức giải"
          tone="text-emerald-600"
          icon={<CreditCard className="size-5 text-orange-600" />}
        />
        <MetricCard
          label="Phí thuê bao"
          value={summary ? formatVnd(summary.saas_revenue) : "—"}
          hint="Các gói đã kích hoạt"
          icon={<Building2 className="size-5 text-purple-600" />}
        />
        <MetricCard
          label="Phí tổ chức giải"
          value={summary ? formatVnd(summary.contest_fee_revenue) : "—"}
          hint="Các đơn phí đã thu"
          icon={<Trophy className="size-5 text-amber-600" />}
        />
        <MetricCard
          label="Đang chờ xử lý"
          value={summary ? formatVnd(summary.pending_amount) : "—"}
          hint="Chưa tính vào doanh thu"
          tone="text-amber-600"
          icon={<ShieldAlert className="size-5 text-amber-600" />}
        />
      </section>

      <AdminPanel className="mt-4">
        <AdminPanelTitle
          title={`Khoản đối tác đã trả (${data?.total ?? 0})`}
          subtitle="Gộp từ yêu cầu thanh toán gói và đơn phí tổ chức giải."
          action={
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={source}
                onChange={(event) =>
                  setSource(event.target.value as "ALL" | LedgerSource)
                }
                className="h-9 rounded-lg border border-[#e5e2e1] bg-white px-3 text-sm font-semibold"
              >
                <option value="ALL">Tất cả nguồn tiền</option>
                <option value="SAAS">Gói thuê bao</option>
                <option value="CONTEST_FEE">Phí tổ chức giải</option>
              </select>
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                className="h-9 rounded-lg border border-[#e5e2e1] bg-white px-3 text-sm font-semibold"
              >
                <option value="ALL">Tất cả trạng thái</option>
                <option value="CONFIRMED">Đã kích hoạt (gói)</option>
                <option value="PAID">Đã thu (phí giải)</option>
                <option value="PENDING">Chờ xử lý</option>
                <option value="FAILED">Thất bại</option>
              </select>
            </div>
          }
        />

        <div className="px-5 pb-4">
          <AdminSearchBar
            placeholder="Tìm theo mã giao dịch, đối tác, nội dung..."
            value={searchTerm}
            onChange={setSearchTerm}
          />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm font-semibold text-[#747878]">
            <Loader2 className="size-4 animate-spin" />
            Đang tải sổ giao dịch...
          </div>
        ) : isError ? (
          <div className="py-16 text-center text-sm font-semibold text-red-600">
            Không tải được sổ giao dịch. Vui lòng thử lại.
          </div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-sm font-semibold text-[#747878]">
            Chưa có giao dịch nào khớp bộ lọc.
          </div>
        ) : (
          <AdminTable columns={columns} rows={rows} />
        )}
      </AdminPanel>
    </AdminShell>
  )
}

function MetricCard({
  label,
  value,
  hint,
  icon,
  tone = "text-[#747878]",
}: {
  label: string
  value: string
  hint: string
  icon: React.ReactNode
  tone?: string
}) {
  return (
    <div className="rounded-xl border border-[#e5e2e1] bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-[#747878]">
          {label}
        </span>
        {icon}
      </div>
      <div className="mt-4">
        <div className="text-2xl font-extrabold text-[#1c1b1b]">{value}</div>
        <p className={`mt-1 text-[10px] font-semibold ${tone}`}>{hint}</p>
      </div>
    </div>
  )
}
