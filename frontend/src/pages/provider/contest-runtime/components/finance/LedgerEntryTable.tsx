import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Pencil, Trash2 } from "lucide-react"
import { toast } from "sonner"

import {
  contestFinanceApi,
  contestFinanceQueryKeys,
} from "@/features/contests/api/contest-finance.api"
import type { ContestLedgerEntry } from "@/features/contests/types"
import { cn } from "@/shared/lib/utils"
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "./LedgerEntryFormModal"

const CATEGORY_LABELS = Object.fromEntries(
  [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES].map((item) => [
    item.value,
    item.label,
  ]),
)

function formatVnd(value: number) {
  return `${value.toLocaleString("vi-VN", { maximumFractionDigits: 0 })}đ`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

export function LedgerEntryTable({
  contestId,
  entries,
  onEdit,
}: {
  contestId: string
  entries: ContestLedgerEntry[]
  onEdit: (entry: ContestLedgerEntry) => void
}) {
  const queryClient = useQueryClient()
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  const deleteMutation = useMutation({
    mutationFn: (entryId: string) => contestFinanceApi.deleteEntry(entryId),
    onSuccess: () => {
      // Xoá một khoản đổi cả báo cáo lẫn danh sách, nên phải làm mới cả hai —
      // nếu không, số tổng phía trên sẽ nói khác danh sách phía dưới.
      void queryClient.invalidateQueries({
        queryKey: contestFinanceQueryKeys.report(contestId),
      })
      void queryClient.invalidateQueries({
        queryKey: contestFinanceQueryKeys.ledger(contestId),
      })
      toast.success("Đã xoá khoản")
      setConfirmingId(null)
    },
    onError: () => toast.error("Không xoá được khoản"),
  })

  if (entries.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-[#747878]">
        Chưa ghi khoản nào. Bấm "Thêm khoản thu" hoặc "Thêm khoản chi" để bắt
        đầu.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-[#e5e2e1] text-left text-[11px] font-black uppercase tracking-[0.14em] text-[#adaaaa]">
            <th className="py-2 pr-3">Ngày</th>
            <th className="py-2 pr-3">Loại</th>
            <th className="py-2 pr-3">Tiêu đề</th>
            <th className="py-2 pr-3">Người ghi</th>
            <th className="py-2 pr-3 text-right">Số tiền</th>
            <th className="py-2 w-24" />
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr
              key={entry.id}
              className="border-b border-[#f1eeee] last:border-0"
            >
              <td className="py-3 pr-3 whitespace-nowrap text-[#747878]">
                {formatDate(entry.occurred_at)}
              </td>
              <td className="py-3 pr-3">
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px] font-bold",
                    entry.direction === "IN"
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-orange-50 text-orange-700",
                  )}
                >
                  {CATEGORY_LABELS[entry.category] ?? entry.category}
                </span>
              </td>
              <td className="py-3 pr-3">
                <p className="font-bold text-[#1c1b1b]">{entry.title}</p>
                {entry.note ? (
                  <p className="mt-0.5 line-clamp-1 text-xs text-[#adaaaa]">
                    {entry.note}
                  </p>
                ) : null}
              </td>
              <td className="py-3 pr-3 text-xs text-[#747878]">
                {entry.created_by.full_name ?? "—"}
                <span className="ml-1 text-[#adaaaa]">
                  (
                  {entry.created_by.role === "STAFF" ? "nhân viên" : "chủ quán"}
                  )
                </span>
              </td>
              <td
                className={cn(
                  "py-3 pr-3 text-right font-black whitespace-nowrap",
                  entry.direction === "IN"
                    ? "text-emerald-600"
                    : "text-orange-600",
                )}
              >
                {entry.direction === "IN" ? "+" : "−"}
                {formatVnd(entry.amount)}
              </td>
              <td className="py-3">
                {confirmingId === entry.id ? (
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => deleteMutation.mutate(entry.id)}
                      disabled={deleteMutation.isPending}
                      className="rounded-lg bg-red-600 px-2 py-1 text-[11px] font-bold text-white disabled:opacity-60"
                    >
                      Xoá
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingId(null)}
                      className="rounded-lg border border-[#e5e2e1] px-2 py-1 text-[11px] font-bold text-[#444748]"
                    >
                      Huỷ
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      aria-label={`Sửa ${entry.title}`}
                      onClick={() => onEdit(entry)}
                      className="rounded-lg p-1.5 text-[#747878] transition hover:bg-[#f6f3f2]"
                    >
                      <Pencil className="size-4" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Xoá ${entry.title}`}
                      onClick={() => setConfirmingId(entry.id)}
                      className="rounded-lg p-1.5 text-[#747878] transition hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
