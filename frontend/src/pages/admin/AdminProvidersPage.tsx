import { useState } from "react"
import { useNavigate } from "react-router"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { CheckCircle, XCircle, ShieldOff, ShieldCheck, ChevronLeft, ChevronRight } from "lucide-react"
import { toast } from "sonner"

import { AdminShell } from "@/pages/admin/components/AdminShell"
import { AdminHeader, AdminPanel, AdminSearchBar } from "@/pages/admin/components/AdminPrimitives"
import { Button } from "@/shared/ui/button"
import { Badge } from "@/shared/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/shared/ui/dialog"
import { Label } from "@/shared/ui/label"
import { Input } from "@/shared/ui/input"
import { subscriptionApi } from "@/features/subscriptions/api/subscription.api"
import type { ProviderStatus, ProviderListItem } from "@/features/subscriptions/types"

const STATUS_LABELS: Record<ProviderStatus, string> = {
  PENDING: "Chờ duyệt",
  ACTIVE: "Hoạt động",
  REJECTED: "Từ chối",
  SUSPENDED: "Tạm khóa",
}

const STATUS_COLORS: Record<ProviderStatus, string> = {
  PENDING: "bg-yellow-100 text-yellow-800",
  ACTIVE: "bg-emerald-100 text-emerald-800",
  REJECTED: "bg-red-100 text-red-800",
  SUSPENDED: "bg-slate-100 text-slate-600",
}

export function AdminProvidersPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<ProviderStatus | "ALL">("ALL")
  const [page, setPage] = useState(1)
  const limit = 20

  const [rejectTarget, setRejectTarget] = useState<ProviderListItem | null>(null)
  const [suspendTarget, setSuspendTarget] = useState<ProviderListItem | null>(null)
  const [reason, setReason] = useState("")

  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin-providers", statusFilter, page],
    queryFn: () =>
      subscriptionApi.listProviders({
        status: statusFilter === "ALL" ? undefined : statusFilter,
        page,
        limit,
      }),
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-providers"] })

  const approveMutation = useMutation({
    mutationFn: (id: string) => subscriptionApi.approveProvider(id),
    onSuccess: () => { toast.success("Đã duyệt tài khoản Provider"); invalidate() },
    onError: () => toast.error("Duyệt thất bại"),
  })

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => subscriptionApi.rejectProvider(id, reason),
    onSuccess: () => { toast.success("Đã từ chối tài khoản"); setRejectTarget(null); setReason(""); invalidate() },
    onError: () => toast.error("Thao tác thất bại"),
  })

  const suspendMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => subscriptionApi.suspendProvider(id, reason),
    onSuccess: () => { toast.success("Đã tạm khóa tài khoản"); setSuspendTarget(null); setReason(""); invalidate() },
    onError: () => toast.error("Thao tác thất bại"),
  })

  const unsuspendMutation = useMutation({
    mutationFn: (id: string) => subscriptionApi.unsuspendProvider(id),
    onSuccess: () => { toast.success("Đã mở khóa tài khoản"); invalidate() },
    onError: () => toast.error("Thao tác thất bại"),
  })

  const providers = (data?.data ?? []).filter(
    (p) =>
      !search ||
      p.business_name.toLowerCase().includes(search.toLowerCase()) ||
      p.email.toLowerCase().includes(search.toLowerCase()),
  )

  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / limit))

  return (
    <AdminShell>
      <AdminHeader title="Tài khoản Provider" description="Duyệt đăng ký, quản lý trạng thái tài khoản đối tác" />

      <AdminPanel>
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <AdminSearchBar
            value={search}
            onChange={(v) => setSearch(v)}
            placeholder="Tìm theo tên doanh nghiệp hoặc email..."
          />
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value as ProviderStatus | "ALL"); setPage(1) }}
            className="h-9 rounded-lg border border-slate-200 px-3 text-sm bg-white"
          >
            <option value="ALL">Tất cả</option>
            {(["PENDING", "ACTIVE", "REJECTED", "SUSPENDED"] as ProviderStatus[]).map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>

        {isLoading ? (
          <div className="py-16 text-center text-sm text-slate-400">Đang tải...</div>
        ) : isError ? (
          <div className="py-16 text-center text-sm text-red-500">Không thể tải danh sách provider. Vui lòng thử lại.</div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-100">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3 text-left">Doanh nghiệp</th>
                  <th className="px-4 py-3 text-left">Email</th>
                  <th className="px-4 py-3 text-left">Trạng thái TK</th>
                  <th className="px-4 py-3 text-left">Gói / Subscription</th>
                  <th className="px-4 py-3 text-left">Ngày đăng ký</th>
                  <th className="px-4 py-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {providers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">Không có dữ liệu</td>
                  </tr>
                ) : (
                  providers.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => navigate(`/admin/providers/${p.id}`)}>
                      <td className="px-4 py-3 font-semibold text-slate-800">{p.business_name}</td>
                      <td className="px-4 py-3 text-slate-500">{p.email}</td>
                      <td className="px-4 py-3">
                        <Badge className={`text-[11px] font-bold ${STATUS_COLORS[p.registration_status]}`}>
                          {STATUS_LABELS[p.registration_status]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">
                        {p.plan_name ? (
                          <span>{p.plan_name}</span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs">
                        {new Date(p.created_at).toLocaleDateString("vi-VN")}
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1.5 justify-end">
                          {p.registration_status === "PENDING" && (
                            <>
                              <Button
                                size="sm"
                                className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                                onClick={() => approveMutation.mutate(p.id)}
                                disabled={approveMutation.isPending}
                              >
                                <CheckCircle className="size-3.5" /> Duyệt
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                className="h-8 text-xs gap-1"
                                onClick={() => { setRejectTarget(p); setReason("") }}
                              >
                                <XCircle className="size-3.5" /> Từ chối
                              </Button>
                            </>
                          )}
                          {p.registration_status === "ACTIVE" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 text-xs gap-1 text-orange-600 border-orange-200 hover:bg-orange-50"
                              onClick={() => { setSuspendTarget(p); setReason("") }}
                            >
                              <ShieldOff className="size-3.5" /> Tạm khóa
                            </Button>
                          )}
                          {p.registration_status === "SUSPENDED" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 text-xs gap-1 text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                              onClick={() => unsuspendMutation.mutate(p.id)}
                              disabled={unsuspendMutation.isPending}
                            >
                              <ShieldCheck className="size-3.5" /> Mở khóa
                            </Button>
                          )}
                        </div>
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

      {/* Reject Dialog */}
      <Dialog open={!!rejectTarget} onOpenChange={() => setRejectTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Từ chối tài khoản</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <p className="text-sm text-slate-600">Từ chối tài khoản <strong>{rejectTarget?.business_name}</strong>?</p>
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

      {/* Suspend Dialog */}
      <Dialog open={!!suspendTarget} onOpenChange={() => setSuspendTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tạm khóa tài khoản</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <p className="text-sm text-slate-600">Tạm khóa tài khoản <strong>{suspendTarget?.business_name}</strong>?</p>
            <Label>Lý do tạm khóa</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Nhập lý do..." />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSuspendTarget(null)}>Hủy</Button>
            <Button
              className="bg-orange-600 hover:bg-orange-700 text-white"
              onClick={() => suspendTarget && suspendMutation.mutate({ id: suspendTarget.id, reason })}
              disabled={!reason.trim() || suspendMutation.isPending}
            >
              Xác nhận khóa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminShell>
  )
}
