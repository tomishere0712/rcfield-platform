import { useMemo, useState } from "react"
import type { ContestAuditLogItem } from "@/features/contests/types"
import {
  getAuditEventLabel,
  getAuditGroup,
} from "@/features/contests/lib/contest-runtime"
import {
  Panel,
  PanelTitle,
} from "@/pages/provider/components/ProviderPrimitives"
import { Button } from "@/shared/ui/button"

const ACTOR_ROLE_LABEL: Record<string, string> = {
  PROVIDER: "Provider",
  STAFF: "Staff",
  CUSTOMER: "Khách hàng",
  ADMIN: "Admin",
  SYSTEM: "Hệ thống",
}

/** Tên trường trong nhật ký, viết cho người vận hành chứ không phải lập trình viên. */
const AUDIT_FIELD_LABEL: Record<string, string> = {
  status: "Trạng thái",
  paymentStatus: "Trạng thái lệ phí",
  payment_status: "Trạng thái lệ phí",
  result_summary: "Tóm tắt kết quả",
  winner_registration_id: "Người thắng",
  participants_count: "Số người thi đấu",
  participants: "Danh sách người thi đấu",
  next_match_id: "Trận kế tiếp",
  winners: "Người đi tiếp",
  absent: "Người vắng mặt",
  loser_count: "Số người thua bán kết",
  registration_ids: "Danh sách đăng ký",
  generated_match_count: "Số trận đã sinh",
  registration_count: "Số người vào sơ đồ",
  draw_seed: "Mã lá thăm",
  format: "Thể thức",
  name: "Tên giải",
  checkedInCafeId: "Chi nhánh điểm danh",
  booking_id: "Phiếu mượn xe",
  vehicle_id: "Xe",
  byoc_declaration: "Khai báo xe cá nhân",
  entry_fee_amount: "Lệ phí",
  participant_count: "Số người",
}

function getAuditFieldLabel(field: string): string {
  return AUDIT_FIELD_LABEL[field] ?? field
}

function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined) return "--"
  if (typeof value === "boolean") return value ? "Có" : "Không"
  if (typeof value === "number" || typeof value === "string")
    return String(value)
  return JSON.stringify(value)
}

/** Diff before/after thành danh sách {field, before, after} để render dạng bảng đọc được. */
function buildAuditDiff(
  beforeJson: Record<string, unknown> | null,
  afterJson: Record<string, unknown> | null,
) {
  const before = beforeJson ?? {}
  const after = afterJson ?? {}
  const keys = Array.from(
    new Set([...Object.keys(before), ...Object.keys(after)]),
  )
  return keys
    .map((field) => ({
      field,
      before: formatFieldValue(before[field]),
      after: formatFieldValue(after[field]),
      changed:
        formatFieldValue(before[field]) !== formatFieldValue(after[field]),
    }))
    .filter((row) => row.changed || row.after !== "--")
}

export function ContestAuditPanel({
  logs,
  page,
  limit,
  total,
  onPageChange,
}: {
  logs: ContestAuditLogItem[]
  page: number
  limit: number
  total: number
  onPageChange: (page: number) => void
}) {
  const [filter, setFilter] = useState<
    "all" | "contest" | "registration" | "match"
  >("all")
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null)

  const filteredLogs = useMemo(() => {
    return filter === "all"
      ? logs
      : logs.filter((log) => getAuditGroup(log) === filter)
  }, [filter, logs])

  const totalPages = Math.max(1, Math.ceil(total / limit))
  const canGoPrevious = page > 1
  const canGoNext = page < totalPages

  return (
    <Panel>
      <PanelTitle
        title="Nhật ký thao tác"
        subtitle="Theo dõi mọi thay đổi phát sinh trong quá trình vận hành giải đấu."
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {(["all", "contest", "registration", "match"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className={`rounded-lg border px-3 py-2 text-sm font-bold ${
              filter === value
                ? "border-orange-200 bg-orange-50 text-orange-700"
                : "border-[#e5e2e1] bg-white text-[#5d5f5f] hover:bg-[#fcf8f8]"
            }`}
          >
            {value === "all"
              ? "Tất cả"
              : value === "contest"
                ? "Giải đấu"
                : value === "registration"
                  ? "Đăng ký"
                  : "Trận đấu"}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filteredLogs.map((log) => {
          const actorRoleLabel =
            ACTOR_ROLE_LABEL[log.actorRole ?? ""] ?? log.actorRole ?? "--"
          const actorDisplay = log.actorName
            ? `${log.actorName} · ${actorRoleLabel}`
            : actorRoleLabel
          const diff = buildAuditDiff(log.beforeJson, log.afterJson)
          const expanded = expandedLogId === log.id
          return (
            <article
              key={log.id}
              className="rounded-lg border border-[#e5e2e1] p-4"
            >
              <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-extrabold text-[#1c1b1b]">
                    {log.actionSummary ?? getAuditEventLabel(log.eventType)}
                    {log.matchName ? (
                      <span className="font-bold text-[#747878]">
                        {" · "}
                        {log.matchName}
                      </span>
                    ) : null}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-[#747878]">
                    <span>
                      {new Date(log.createdAt).toLocaleString("vi-VN")}
                    </span>
                    <span>{actorDisplay}</span>
                  </div>
                  {log.reason ? (
                    <p className="mt-2 text-sm font-semibold text-[#5d5f5f]">
                      Lý do: {log.reason}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setExpandedLogId((current) =>
                      current === log.id ? null : log.id,
                    )
                  }
                  className="text-sm font-bold text-orange-700"
                >
                  {expanded ? "Ẩn chi tiết" : "Xem chi tiết"}
                </button>
              </div>
              {expanded ? (
                <div className="mt-3 space-y-3">
                  {diff.length > 0 ? (
                    <div className="overflow-hidden rounded-lg border border-[#e5e2e1]">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-[#fcf8f8] text-left font-bold text-[#747878]">
                            <th className="px-3 py-2">Trường dữ liệu</th>
                            <th className="px-3 py-2">Trước</th>
                            <th className="px-3 py-2">Sau</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#f0eeee]">
                          {diff.map((row) => (
                            <tr key={row.field}>
                              <td className="px-3 py-2 font-semibold text-[#444748]">
                                {getAuditFieldLabel(row.field)}
                              </td>
                              <td className="px-3 py-2 text-[#747878]">
                                {row.before}
                              </td>
                              <td className="px-3 py-2 font-bold text-[#1c1b1b]">
                                {row.after}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                  <details className="rounded-lg bg-[#fcf8f8] p-3">
                    <summary className="cursor-pointer text-xs font-bold text-[#747878]">
                      Chi tiết kỹ thuật
                    </summary>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-[#747878]">
                      <span>{log.eventType}</span>
                      {log.matchId ? (
                        <span>match {log.matchId.slice(0, 8)}</span>
                      ) : null}
                      {log.registrationId ? (
                        <span>reg {log.registrationId.slice(0, 8)}</span>
                      ) : null}
                    </div>
                    <div className="mt-2 grid gap-3 xl:grid-cols-2">
                      <pre className="overflow-x-auto rounded-lg bg-white p-3 text-xs text-[#444748]">
                        {JSON.stringify(log.beforeJson ?? {}, null, 2)}
                      </pre>
                      <pre className="overflow-x-auto rounded-lg bg-white p-3 text-xs text-[#444748]">
                        {JSON.stringify(log.afterJson ?? {}, null, 2)}
                      </pre>
                    </div>
                  </details>
                </div>
              ) : null}
            </article>
          )
        })}
        {filteredLogs.length === 0 ? (
          <p className="text-sm font-semibold text-[#747878]">
            Chưa có audit log nào.
          </p>
        ) : null}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <p className="text-xs font-semibold text-[#747878]">
          Trang {page} / {totalPages} · {total} bản ghi
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canGoPrevious}
            onClick={() => onPageChange(page - 1)}
          >
            Trước
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canGoNext}
            onClick={() => onPageChange(page + 1)}
          >
            Sau
          </Button>
        </div>
      </div>
    </Panel>
  )
}
