import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { ChevronLeft, ChevronRight, Lock, Unlock, History } from "lucide-react"
import { toast } from "sonner"

import { AdminShell } from "@/pages/admin/components/AdminShell"
import {
  AdminHeader,
  AdminPanel,
  AdminPanelTitle,
  AdminSearchBar,
  AdminTable,
  UserStatusBadge,
} from "@/pages/admin/components/AdminPrimitives"
import { Button } from "@/shared/ui/button"
import { Badge } from "@/shared/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/shared/ui/dialog"
import { Label } from "@/shared/ui/label"
import { Textarea } from "@/shared/ui/textarea"
import {
  adminUsersApi,
  type AdminUserRow,
  type ListUsersParams,
  type UserBehaviour,
} from "@/features/admin/api/admin-users.api"

/** Lý do phải đủ dài — backend từ chối chuỗi ngắn hơn 10 ký tự. */
const MIN_REASON = 10

/**
 * Ba mức cảnh báo theo tỉ lệ hỏng hẹn.
 *
 * Cố ý KHÔNG tô đỏ người mới có một hai lần lỡ hẹn: đặt hai lần huỷ một là 50%,
 * nhìn đỏ rực trong khi chưa đủ căn cứ để kết luận gì. Cần cả tỉ lệ cao lẫn số
 * lần đủ nhiều thì mới đáng gọi là dấu hiệu.
 */
function riskLevel(b: UserBehaviour): "high" | "warn" | "ok" {
  const broken = b.self_cancelled + b.no_show
  if (b.total_bookings < 3) return "ok"
  if (b.broken_rate >= 50 && broken >= 3) return "high"
  if (b.broken_rate >= 30) return "warn"
  return "ok"
}

function RiskBadge({ behaviour }: { behaviour: UserBehaviour }) {
  const level = riskLevel(behaviour)
  const broken = behaviour.self_cancelled + behaviour.no_show
  if (behaviour.total_bookings === 0) {
    return <span className="text-xs font-semibold text-[#747878]">Chưa đặt lần nào</span>
  }
  const style =
    level === "high"
      ? "border-red-200 bg-red-50 text-red-700"
      : level === "warn"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-[#e5e2e1] bg-[#fcf8f8] text-[#747878]"
  return (
    <Badge className={`border font-bold shadow-none rounded-md px-2 py-0.5 ${style}`}>
      {broken}/{behaviour.total_bookings} · {behaviour.broken_rate}%
    </Badge>
  )
}

export function AdminUsersPage() {
  const qc = useQueryClient()
  const [q, setQ] = useState("")
  const [status, setStatus] = useState<ListUsersParams["status"] | "ALL">("ALL")
  const [sort, setSort] = useState<"newest" | "risk">("risk")
  const [page, setPage] = useState(1)
  const limit = 20

  const [target, setTarget] = useState<AdminUserRow | null>(null)
  const [reason, setReason] = useState("")
  const [historyId, setHistoryId] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ["admin-users", q, status, sort, page],
    queryFn: () =>
      adminUsersApi.list({
        q: q.trim() || undefined,
        status: status === "ALL" ? undefined : status,
        sort,
        page,
        limit,
      }),
  })

  const detail = useQuery({
    queryKey: ["admin-user-detail", historyId],
    queryFn: () => adminUsersApi.detail(historyId!),
    enabled: Boolean(historyId),
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-users"] })

  const moderate = useMutation({
    mutationFn: ({ user, reason }: { user: AdminUserRow; reason: string }) =>
      user.is_active
        ? adminUsersApi.lock(user.id, reason)
        : adminUsersApi.unlock(user.id, reason),
    onSuccess: (_res, vars) => {
      toast.success(vars.user.is_active ? "Đã khoá tài khoản" : "Đã mở khoá tài khoản")
      setTarget(null)
      setReason("")
      invalidate()
    },
    onError: (err: { response?: { data?: { message?: string } } }) =>
      toast.error(err.response?.data?.message ?? "Thao tác thất bại"),
  })

  const rows = data?.data ?? []
  const total = data?.meta.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / limit))

  const resetPage = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v)
    setPage(1)
  }

  return (
    <AdminShell>
      <AdminHeader
        title="Quản lý khách hàng"
        description="Theo dõi hành vi đặt lịch và khoá tài khoản khi có đủ căn cứ"
      />

      <AdminPanel>
        <AdminPanelTitle
          title={`${total} khách hàng`}
          subtitle="Cột Hỏng hẹn chỉ tính lần khách TỰ huỷ và vắng mặt — lần bị quán huỷ không tính vào"
        />

        <div className="flex flex-wrap items-center gap-3 px-4 pb-4">
          <AdminSearchBar
            placeholder="Tìm theo email hoặc tên..."
            value={q}
            onChange={resetPage(setQ)}
          />
          <select
            className="h-10 rounded-lg border border-[#e5e2e1] bg-white px-3 text-sm font-semibold text-[#1c1b1b]"
            value={status}
            onChange={(e) => resetPage(setStatus)(e.target.value as typeof status)}
          >
            <option value="ALL">Mọi trạng thái</option>
            <option value="active">Đang hoạt động</option>
            <option value="locked">Bị khoá</option>
          </select>
          <select
            className="h-10 rounded-lg border border-[#e5e2e1] bg-white px-3 text-sm font-semibold text-[#1c1b1b]"
            value={sort}
            onChange={(e) => resetPage(setSort)(e.target.value as typeof sort)}
          >
            <option value="risk">Hỏng hẹn nhiều nhất trước</option>
            <option value="newest">Mới nhất trước</option>
          </select>
        </div>

        {isLoading ? (
          <p className="px-4 py-8 text-center text-sm font-semibold text-[#747878]">Đang tải…</p>
        ) : (
          <AdminTable
            columns={["Khách hàng", "Hỏng hẹn", "Tự huỷ / Quán huỷ / Vắng", "Trạng thái", ""]}
            rows={rows.map((u) => [
              <div key="u">
                <div>{u.full_name ?? "(chưa đặt tên)"}</div>
                <div className="text-xs font-semibold text-[#747878]">{u.email}</div>
              </div>,
              <RiskBadge key="r" behaviour={u.behaviour} />,
              <span key="b" className="font-mono text-xs">
                {u.behaviour.self_cancelled} / {u.behaviour.cancelled_by_others} /{" "}
                {u.behaviour.no_show}
              </span>,
              <UserStatusBadge key="s" status={u.is_active ? "ACTIVE" : "LOCKED"} />,
              <div key="a" className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setHistoryId(u.id)}>
                  <History className="size-4" />
                </Button>
                <Button
                  variant={u.is_active ? "destructive" : "outline"}
                  size="sm"
                  onClick={() => {
                    setTarget(u)
                    setReason("")
                  }}
                >
                  {u.is_active ? <Lock className="size-4" /> : <Unlock className="size-4" />}
                </Button>
              </div>,
            ])}
          />
        )}

        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-xs font-semibold text-[#747878]">
            Trang {page}/{totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </AdminPanel>

      {/* Khoá / mở khoá — luôn phải nêu lý do */}
      <Dialog open={Boolean(target)} onOpenChange={(open) => !open && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {target?.is_active ? "Khoá tài khoản" : "Mở khoá tài khoản"} — {target?.email}
            </DialogTitle>
          </DialogHeader>

          {target && target.is_active && (
            <div className="rounded-lg border border-[#e5e2e1] bg-[#fcf8f8] p-3 text-sm">
              <p className="font-bold text-[#1c1b1b]">Căn cứ hiện có</p>
              <p className="mt-1 text-[#747878]">
                {target.behaviour.total_bookings} lượt đặt · tự huỷ{" "}
                {target.behaviour.self_cancelled} · vắng mặt {target.behaviour.no_show} · bị quán
                huỷ {target.behaviour.cancelled_by_others} (không tính vào)
              </p>
              <p className="mt-1 text-[#747878]">
                Khoá xong người này không đăng nhập được nữa, ở mọi thiết bị.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label>Lý do</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ví dụ: Huỷ lịch 5 lần trong tháng 8, đã nhắc nhở qua điện thoại ngày 12/8"
              rows={3}
            />
            <p className="text-xs font-semibold text-[#747878]">
              Lý do được lưu vĩnh viễn kèm số liệu tại thời điểm quyết định, để còn giải trình khi
              khách khiếu nại. Tối thiểu {MIN_REASON} ký tự.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)}>
              Huỷ
            </Button>
            <Button
              variant={target?.is_active ? "destructive" : "default"}
              disabled={reason.trim().length < MIN_REASON || moderate.isPending}
              onClick={() => target && moderate.mutate({ user: target, reason: reason.trim() })}
            >
              {target?.is_active ? "Khoá tài khoản" : "Mở khoá"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lịch sử: vừa là lịch đặt gần đây, vừa là nhật ký khoá/mở */}
      <Dialog open={Boolean(historyId)} onOpenChange={(open) => !open && setHistoryId(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Hồ sơ theo dõi — {detail.data?.email ?? "…"}</DialogTitle>
          </DialogHeader>

          {detail.isLoading ? (
            <p className="text-sm font-semibold text-[#747878]">Đang tải…</p>
          ) : detail.data ? (
            <div className="max-h-[60vh] space-y-5 overflow-y-auto">
              <section>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-[#747878]">
                  Nhật ký khoá / mở khoá
                </h3>
                {detail.data.moderation_history.length === 0 ? (
                  <p className="text-sm text-[#747878]">Chưa có lần nào.</p>
                ) : (
                  <ul className="space-y-2">
                    {detail.data.moderation_history.map((log) => (
                      <li key={log.id} className="rounded-lg border border-[#e5e2e1] p-3 text-sm">
                        <div className="flex items-center gap-2">
                          <Badge
                            className={
                              log.action === "LOCK"
                                ? "border border-red-200 bg-red-50 text-red-700"
                                : "border border-emerald-200 bg-emerald-50 text-emerald-700"
                            }
                          >
                            {log.action === "LOCK" ? "Khoá" : "Mở khoá"}
                          </Badge>
                          <span className="text-xs font-semibold text-[#747878]">
                            {new Date(log.created_at).toLocaleString("vi-VN")} · {log.actor_email}
                          </span>
                        </div>
                        <p className="mt-1.5 font-semibold text-[#1c1b1b]">{log.reason}</p>
                        {log.metadata?.behaviour_at_decision && (
                          <p className="mt-1 text-xs text-[#747878]">
                            Lúc đó: {log.metadata.behaviour_at_decision.total_bookings} lượt đặt ·
                            tự huỷ {log.metadata.behaviour_at_decision.self_cancelled} · vắng{" "}
                            {log.metadata.behaviour_at_decision.no_show}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-[#747878]">
                  20 lượt đặt gần nhất
                </h3>
                {detail.data.recent_bookings.length === 0 ? (
                  <p className="text-sm text-[#747878]">Chưa đặt lịch lần nào.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {detail.data.recent_bookings.map((b) => (
                      <li
                        key={b.id}
                        className="flex flex-wrap items-baseline gap-x-2 border-b border-[#e5e2e1] pb-1.5 text-sm"
                      >
                        <span className="font-mono text-xs text-[#747878]">
                          {new Date(b.slot_start).toLocaleDateString("vi-VN")}
                        </span>
                        <span className="font-semibold text-[#1c1b1b]">{b.cafe_name}</span>
                        <span className="text-xs font-bold">{b.status}</span>
                        {b.status === "CANCELLED" && (
                          <span className="text-xs text-[#747878]">
                            {b.cancelled_by_self ? "khách tự huỷ" : "quán huỷ"}
                            {b.cancellation_reason ? ` — ${b.cancellation_reason}` : ""}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </AdminShell>
  )
}

export default AdminUsersPage
