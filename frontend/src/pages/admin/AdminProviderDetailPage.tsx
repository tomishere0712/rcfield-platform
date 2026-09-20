import { useState } from "react"
import { useParams, useNavigate } from "react-router"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, CheckCircle, Eye, ShieldCheck, ShieldOff, XCircle } from "lucide-react"
import { toast } from "sonner"

import { AdminShell } from "@/pages/admin/components/AdminShell"
import { AdminHeader, AdminPanel, AdminPanelTitle } from "@/pages/admin/components/AdminPrimitives"
import { KycDocumentViewer } from "@/features/provider-kyc/components/KycDocumentViewer"
import { Button } from "@/shared/ui/button"
import { Badge } from "@/shared/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/shared/ui/dialog"
import { Label } from "@/shared/ui/label"
import { Input } from "@/shared/ui/input"
import { subscriptionApi } from "@/features/subscriptions/api/subscription.api"
import { storageKeys } from "@/shared/lib/storage"
import type { ProviderStatus } from "@/features/subscriptions/types"
import type { UserRole } from "@/shared/types/common"

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

const CAFE_STATUS_LABELS: Record<string, string> = {
  PENDING: "Chờ duyệt",
  ACTIVE: "Hoạt động",
  SUSPENDED: "Tạm ngưng",
}

const CAFE_STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-800",
  ACTIVE: "bg-emerald-100 text-emerald-800",
  SUSPENDED: "bg-slate-100 text-slate-600",
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</span>
      <span className="text-sm font-semibold text-slate-800">{value ?? <span className="text-slate-300">—</span>}</span>
    </div>
  )
}

export function AdminProviderDetailPage() {
  const { providerId } = useParams<{ providerId: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  // authStore not needed here — impersonation uses window.location.href + localStorage persistence

  const [rejectOpen, setRejectOpen] = useState(false)
  const [suspendOpen, setSuspendOpen] = useState(false)
  const [reason, setReason] = useState("")
  const [impersonating, setImpersonating] = useState(false)

  const { data: detailRes, isLoading: detailLoading } = useQuery({
    queryKey: ["provider-detail", providerId],
    queryFn: () => subscriptionApi.getProviderDetail(providerId!),
    enabled: !!providerId,
  })

  const { data: cafes = [], isLoading: cafesLoading } = useQuery({
    queryKey: ["provider-cafes", providerId],
    queryFn: () => subscriptionApi.getProviderCafes(providerId!),
    enabled: !!providerId,
  })

  const detail = detailRes?.data

  const invalidate = () => qc.invalidateQueries({ queryKey: ["provider-detail", providerId] })

  const approveMutation = useMutation({
    mutationFn: () => subscriptionApi.approveProvider(providerId!),
    onSuccess: () => { toast.success("Đã duyệt tài khoản Provider"); invalidate() },
    onError: () => toast.error("Duyệt thất bại"),
  })

  const rejectMutation = useMutation({
    mutationFn: () => subscriptionApi.rejectProvider(providerId!, reason),
    onSuccess: () => { toast.success("Đã từ chối tài khoản"); setRejectOpen(false); setReason(""); invalidate() },
    onError: () => toast.error("Thao tác thất bại"),
  })

  const suspendMutation = useMutation({
    mutationFn: () => subscriptionApi.suspendProvider(providerId!, reason),
    onSuccess: () => { toast.success("Đã tạm khóa tài khoản"); setSuspendOpen(false); setReason(""); invalidate() },
    onError: () => toast.error("Thao tác thất bại"),
  })

  const unsuspendMutation = useMutation({
    mutationFn: () => subscriptionApi.unsuspendProvider(providerId!),
    onSuccess: () => { toast.success("Đã mở khóa tài khoản"); invalidate() },
    onError: () => toast.error("Thao tác thất bại"),
  })

  const handleImpersonate = async () => {
    if (!detail || !providerId) return
    setImpersonating(true)
    try {
      const resp = await subscriptionApi.impersonateProvider(providerId)

      // Save admin token before overwriting
      const currentAuthRaw = localStorage.getItem(storageKeys.auth)
      if (currentAuthRaw) {
        localStorage.setItem(storageKeys.adminAuth, currentAuthRaw)
      }

      // Write impersonation token
      localStorage.setItem(storageKeys.auth, JSON.stringify({
        accessToken: resp.token,
        user: { id: resp.provider.id, email: detail.email, role: "provider" as UserRole },
        role: "provider",
        email: detail.email,
      }))

      // Persist impersonation metadata so it survives page reload
      localStorage.setItem(storageKeys.impersonation, JSON.stringify({
        providerUserId: providerId,
        providerName: resp.provider.business_name,
      }))

      // Full page reload to cleanly switch role context without triggering existing RoleGuards
      window.location.href = "/provider/dashboard"
    } catch {
      toast.error("Không thể bắt đầu phiên hỗ trợ")
      setImpersonating(false)
    }
  }

  if (detailLoading) {
    return (
      <AdminShell>
        <div className="flex items-center justify-center py-24">
          <span className="size-8 border-4 border-slate-200 border-t-orange-600 rounded-full animate-spin" />
        </div>
      </AdminShell>
    )
  }

  if (!detail) {
    return (
      <AdminShell>
        <div className="py-24 text-center text-slate-400 text-sm">Không tìm thấy provider.</div>
      </AdminShell>
    )
  }

  const status = detail.registration_status

  return (
    <AdminShell>
      <AdminHeader
        title={detail.business_name}
        description={`Provider ID: ${detail.id}`}
      />

      {/* Controls Block */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#e5e2e1] bg-white p-4 shadow-sm">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft className="size-4" /> Quay lại danh sách
        </button>

        <div className="flex flex-wrap items-center gap-2">
          {status === "ACTIVE" && (
            <Button
              className="gap-1.5 bg-orange-600 hover:bg-orange-700 text-white"
              onClick={handleImpersonate}
              disabled={impersonating}
            >
              <Eye className="size-4" />
              {impersonating ? "Đang vào..." : "Truy cập với tư cách Provider"}
            </Button>
          )}
          {status === "PENDING" && (
            <>
              <Button
                className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => approveMutation.mutate()}
                disabled={approveMutation.isPending}
              >
                <CheckCircle className="size-4" /> Duyệt
              </Button>
              <Button
                variant="destructive"
                className="gap-1"
                onClick={() => { setRejectOpen(true); setReason("") }}
              >
                <XCircle className="size-4" /> Từ chối
              </Button>
            </>
          )}
          {status === "ACTIVE" && (
            <Button
              variant="outline"
              className="gap-1 text-orange-600 border-orange-200 hover:bg-orange-50 animate-none font-bold"
              onClick={() => { setSuspendOpen(true); setReason("") }}
            >
              <ShieldOff className="size-4" /> Tạm khóa
            </Button>
          )}
          {status === "SUSPENDED" && (
            <Button
              variant="outline"
              className="gap-1 text-emerald-600 border-emerald-200 hover:bg-emerald-50 font-bold"
              onClick={() => unsuspendMutation.mutate()}
              disabled={unsuspendMutation.isPending}
            >
              <ShieldCheck className="size-4" /> Mở khóa
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Account Info */}
        <AdminPanel>
          <AdminPanelTitle title="Thông tin tài khoản" />
          <div className="grid grid-cols-2 gap-4">
            <InfoRow label="Họ tên" value={detail.full_name} />
            <InfoRow label="Email" value={detail.email} />
            <InfoRow label="Số điện thoại" value={detail.phone} />
            <InfoRow label="Ngày đăng ký" value={new Date(detail.created_at).toLocaleDateString("vi-VN")} />
            <div className="col-span-2 flex flex-col gap-0.5">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Trạng thái tài khoản</span>
              <Badge className={`w-fit text-xs font-bold ${STATUS_COLORS[status]}`}>
                {STATUS_LABELS[status]}
              </Badge>
            </div>
          </div>
        </AdminPanel>

        {/* Business Info */}
        <AdminPanel>
          <AdminPanelTitle title="Thông tin doanh nghiệp" />
          <div className="grid grid-cols-1 gap-4">
            <InfoRow label="Tên doanh nghiệp" value={detail.business_name} />
            <InfoRow label="Mô tả doanh nghiệp" value={detail.business_description} />
            {detail.rejection_reason && (
              <InfoRow label="Lý do từ chối" value={detail.rejection_reason} />
            )}
            {detail.suspended_reason && (
              <InfoRow label="Lý do tạm khóa" value={detail.suspended_reason} />
            )}
          </div>
        </AdminPanel>

        {/* Subscription Info */}
        <AdminPanel>
          <AdminPanelTitle title="Gói đăng ký" />
          {detail.plan_name ? (
            <div className="grid grid-cols-2 gap-4">
              <InfoRow label="Gói hiện tại" value={detail.plan_name} />
              <InfoRow label="Trạng thái" value={detail.subscription_status ?? undefined} />
              <InfoRow
                label="Ngày hết hạn"
                value={detail.expires_at ? new Date(detail.expires_at).toLocaleDateString("vi-VN") : undefined}
              />
              <InfoRow
                label="AI messages đã dùng"
                value={
                  detail.ai_messages_used != null && detail.ai_quota_per_month != null
                    ? `${detail.ai_messages_used} / ${detail.ai_quota_per_month}`
                    : detail.ai_messages_used?.toString()
                }
              />
              <InfoRow label="Giới hạn chi nhánh" value={detail.branch_limit?.toString()} />
              <InfoRow label="Giới hạn kênh" value={detail.channel_limit?.toString()} />
            </div>
          ) : (
            <p className="text-sm text-slate-400 font-semibold">Chưa có gói đăng ký.</p>
          )}
        </AdminPanel>

        {/* Cafes */}
        <AdminPanel>
          <AdminPanelTitle
            title="Chi nhánh"
            subtitle={cafesLoading ? "Đang tải..." : `${cafes.length} chi nhánh`}
          />
          {cafesLoading ? (
            <div className="py-6 text-center text-slate-400 text-sm">Đang tải...</div>
          ) : cafes.length === 0 ? (
            <p className="text-sm text-slate-400 font-semibold">Chưa có chi nhánh nào.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {cafes.map((cafe) => (
                <div key={cafe.id} className="flex items-start justify-between py-3 gap-3">
                  <div>
                    <p className="text-sm font-bold text-slate-800">{cafe.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{cafe.address}</p>
                  </div>
                  <Badge className={`shrink-0 text-[11px] font-bold ${CAFE_STATUS_COLORS[cafe.status] ?? "bg-slate-100 text-slate-600"}`}>
                    {CAFE_STATUS_LABELS[cafe.status] ?? cafe.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </AdminPanel>
      </div>

      {/* KYC Documents */}
      {detail.kyc && (
        <div className="mt-6">
          <AdminPanel>
            <AdminPanelTitle title="Giấy tờ xác thực (KYC)" />
            <KycDocumentViewer
              businessType={detail.kyc.businessType ?? null}
              submittedAt={detail.kyc.submittedAt ?? null}
              documents={detail.kyc.documents ?? []}
            />
          </AdminPanel>
        </div>
      )}

      {/* Reject Dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Từ chối tài khoản</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <p className="text-sm text-slate-600">Từ chối tài khoản <strong>{detail.business_name}</strong>?</p>
            <Label>Lý do từ chối</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Nhập lý do..." />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejectOpen(false)}>Hủy</Button>
            <Button
              variant="destructive"
              onClick={() => rejectMutation.mutate()}
              disabled={!reason.trim() || rejectMutation.isPending}
            >
              Xác nhận từ chối
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Suspend Dialog */}
      <Dialog open={suspendOpen} onOpenChange={setSuspendOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tạm khóa tài khoản</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <p className="text-sm text-slate-600">Tạm khóa tài khoản <strong>{detail.business_name}</strong>?</p>
            <Label>Lý do tạm khóa</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Nhập lý do..." />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSuspendOpen(false)}>Hủy</Button>
            <Button
              className="bg-orange-600 hover:bg-orange-700 text-white"
              onClick={() => suspendMutation.mutate()}
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
