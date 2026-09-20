import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { CheckCircle, XCircle, ChevronLeft, ChevronRight } from "lucide-react"
import { toast } from "sonner"

import { AdminShell } from "@/pages/admin/components/AdminShell"
import { AdminHeader, AdminPanel } from "@/pages/admin/components/AdminPrimitives"
import { Button } from "@/shared/ui/button"
import { Badge } from "@/shared/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/shared/ui/dialog"
import { Label } from "@/shared/ui/label"
import { Input } from "@/shared/ui/input"
import { Textarea } from "@/shared/ui/textarea"
import { subscriptionApi } from "@/features/subscriptions/api/subscription.api"
import type { AdminPaymentRequestItem, PaymentRequestStatus } from "@/features/subscriptions/types"

const STATUS_LABELS: Record<PaymentRequestStatus, string> = {
  PENDING: "Chờ xác nhận",
  CONFIRMED: "Đã xác nhận",
  REJECTED: "Bị từ chối",
}

const STATUS_COLORS: Record<PaymentRequestStatus, string> = {
  PENDING: "bg-yellow-100 text-yellow-800",
  CONFIRMED: "bg-emerald-100 text-emerald-800",
  REJECTED: "bg-red-100 text-red-800",
}

export function AdminPaymentRequestsPage() {
  const qc = useQueryClient()
  const [statusFilter, setStatusFilter] = useState<PaymentRequestStatus | "ALL">("ALL")
  const [page, setPage] = useState(1)
  const limit = 20

  const [confirmTarget, setConfirmTarget] = useState<AdminPaymentRequestItem | null>(null)
  const [rejectTarget, setRejectTarget] = useState<AdminPaymentRequestItem | null>(null)
  const [notes, setNotes] = useState("")
  const [reason, setReason] = useState("")

  const { data, isLoading } = useQuery({
    queryKey: ["admin-payment-requests", statusFilter, page],
    queryFn: () =>
      subscriptionApi.listAllPaymentRequests({
        status: statusFilter === "ALL" ? undefined : statusFilter,
        page,
        limit,
      }),
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-payment-requests"] })

  const confirmMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) => subscriptionApi.confirmPaymentRequest(id, notes),
    onSuccess: () => { toast.success("Đã xác nhận thanh toán"); setConfirmTarget(null); setNotes(""); invalidate() },
    onError: () => toast.error("Xác nhận thất bại"),
  })

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => subscriptionApi.rejectPaymentRequest(id, reason),
    onSuccess: () => { toast.success("Đã từ chối yêu cầu"); setRejectTarget(null); setReason(""); invalidate() },
    onError: () => toast.error("Từ chối thất bại"),
  })

  const rows = data?.data ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / limit))

  return (
    <AdminShell>
      <AdminHeader title="Yêu cầu nâng gói" description="Xác nhận hoặc từ chối yêu cầu nâng cấp gói của Provider" />

      <AdminPanel>
        <div className="mb-4">
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value as PaymentRequestStatus | "ALL"); setPage(1) }}
            className="h-9 rounded-lg border border-slate-200 px-3 text-sm bg-white"
          >
            <option value="ALL">Tất cả trạng thái</option>
            {(["PENDING", "CONFIRMED", "REJECTED"] as PaymentRequestStatus[]).map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>

        {isLoading ? (
          <div className="py-16 text-center text-sm text-slate-400">Đang tải...</div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-100">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3 text-left">Doanh nghiệp</th>
                  <th className="px-4 py-3 text-left">Gói yêu cầu</th>
                  <th className="px-4 py-3 text-left">Số tiền CK</th>
                  <th className="px-4 py-3 text-left">Ngày CK</th>
                  <th className="px-4 py-3 text-left">Nội dung CK</th>
                  <th className="px-4 py-3 text-left">Trạng thái</th>
                  <th className="px-4 py-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">Không có dữ liệu</td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-800">{r.business_name}</p>
                        <p className="text-xs text-slate-400">{r.email}</p>
                      </td>
                      <td className="px-4 py-3 font-semibold">{r.plan_name}</td>
                      <td className="px-4 py-3">{Number(r.transfer_amount).toLocaleString("vi-VN")}₫</td>
                      <td className="px-4 py-3 text-slate-400 text-xs">
                        {new Date(r.transfer_date).toLocaleDateString("vi-VN")}
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs max-w-[160px] truncate">{r.transfer_reference}</td>
                      <td className="px-4 py-3">
                        <Badge className={`text-[11px] font-semibold ${STATUS_COLORS[r.status]}`}>
                          {STATUS_LABELS[r.status]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        {r.status === "PENDING" && (
                          <div className="flex items-center gap-1.5 justify-end">
                            <Button
                              size="sm"
                              className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                              onClick={() => { setConfirmTarget(r); setNotes("") }}
                            >
                              <CheckCircle className="size-3.5" /> Xác nhận
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              className="h-8 text-xs gap-1"
                              onClick={() => { setRejectTarget(r); setReason("") }}
                            >
                              <XCircle className="size-3.5" /> Từ chối
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
              <ChevronLeft className="size-4" />
            </Button>
            <span className="text-xs text-slate-500">{page} / {totalPages}</span>
            <Button variant="ghost" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
              <ChevronRight className="size-4" />
            </Button>
          </div>
        )}
      </AdminPanel>

      {/* Confirm Dialog */}
      <Dialog open={!!confirmTarget} onOpenChange={() => setConfirmTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xác nhận thanh toán</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-slate-600">
              Xác nhận thanh toán <strong>{confirmTarget?.price_per_month?.toLocaleString("vi-VN")}₫</strong> từ{" "}
              <strong>{confirmTarget?.business_name}</strong>?
            </p>
            <div className="space-y-1.5">
              <Label>Ghi chú (tùy chọn)</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Ghi chú admin..." className="resize-none" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmTarget(null)}>Hủy</Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => confirmTarget && confirmMutation.mutate({ id: confirmTarget.id, notes: notes || undefined })}
              disabled={confirmMutation.isPending}
            >
              Xác nhận
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={!!rejectTarget} onOpenChange={() => setRejectTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Từ chối yêu cầu thanh toán</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <p className="text-sm text-slate-600">Từ chối yêu cầu từ <strong>{rejectTarget?.business_name}</strong>?</p>
            <Label>Lý do từ chối</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Nhập lý do..." />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejectTarget(null)}>Hủy</Button>
            <Button
              variant="destructive"
              onClick={() => rejectTarget && rejectMutation.mutate({ id: rejectTarget.id, reason })}
              disabled={!reason.trim() || rejectMutation.isPending}
            >
              Xác nhận từ chối
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminShell>
  )
}
