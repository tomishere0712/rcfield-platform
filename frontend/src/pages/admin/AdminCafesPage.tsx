import { useMemo, useState, type ReactNode } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Building2, CheckCircle2, ShieldAlert, XCircle } from "lucide-react"
import { toast } from "sonner"

import { cafeApi, cafeQueryKeys } from "@/features/cafes/api/cafe.api"
import type { BackendCafe, CafeStatus } from "@/features/cafes/types"
import { getCafeSlotFeeRate } from "@/features/cafes/lib/cafe.mappers"
import { AdminShell } from "@/pages/admin/components/AdminShell"
import {
  AdminHeader,
  AdminPanel,
  AdminPanelTitle,
  AdminSearchBar,
  AdminTable,
  CafeStatusBadge,
} from "@/pages/admin/components/AdminPrimitives"
import { Button } from "@/shared/ui/button"
import { Badge } from "@/shared/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/shared/ui/dialog"

type StatusFilter = "ALL" | CafeStatus
type ActionType = "APPROVE" | "SUSPEND" | "REACTIVATE"

export function AdminCafesPage() {
  const queryClient = useQueryClient()
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL")
  const [selectedCafe, setSelectedCafe] = useState<BackendCafe | null>(null)
  const [actionType, setActionType] = useState<ActionType | null>(null)

  /*
    Tải TOÀN BỘ cơ sở một lần, không kèm bộ lọc trạng thái.

    Bốn ô đếm phía trên phải phản ánh toàn bộ dữ liệu. Trước đây truy vấn mang
    theo bộ lọc, mà các ô đếm lại tính từ chính kết quả đã lọc — nên chọn "Chờ
    duyệt" thì cả ô "Tổng cơ sở" cũng tụt về 0, đọc như thể hệ thống không có
    cơ sở nào.

    Lọc trạng thái chuyển xuống phía dưới làm ở client: dữ liệu đã có sẵn trong
    tay, lọc lại không cần thêm một vòng gọi mạng.
  */
  const queryParams = useMemo(() => ({ page: 1, limit: 100 }), [])
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: cafeQueryKeys.list(queryParams),
    queryFn: () => cafeApi.listCafes(queryParams),
  })
  const cafes = data?.data ?? []

  const statusMutation = useMutation({
    mutationFn: ({ cafeId, status }: { cafeId: string; status: CafeStatus }) => cafeApi.updateCafeStatus(cafeId, status),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: cafeQueryKeys.all })
      toast.success("Đã cập nhật trạng thái cơ sở")
      setSelectedCafe(null)
      setActionType(null)
    },
    onError: () => {
      toast.error("Không thể cập nhật trạng thái cơ sở")
    },
  })

  const handleOpenAction = (cafe: BackendCafe, type: ActionType) => {
    setSelectedCafe(cafe)
    setActionType(type)
  }

  const handleConfirmAction = () => {
    if (!selectedCafe || !actionType) return

    const nextStatus: CafeStatus = actionType === "SUSPEND" ? "SUSPENDED" : "ACTIVE"
    statusMutation.mutate({ cafeId: selectedCafe.id, status: nextStatus })
  }

  const totalCount = cafes.length
  const pendingCount = cafes.filter((cafe) => cafe.status === "PENDING").length
  const activeCount = cafes.filter((cafe) => cafe.status === "ACTIVE").length
  const suspendedCount = cafes.filter((cafe) => cafe.status === "SUSPENDED").length

  const filteredCafes = cafes.filter((cafe) => {
    const keyword = searchTerm.trim().toLowerCase()
    const matchesSearch =
      keyword === "" ||
      cafe.name.toLowerCase().includes(keyword) ||
      cafe.address.toLowerCase().includes(keyword) ||
      cafe.district.toLowerCase().includes(keyword) ||
      cafe.city.toLowerCase().includes(keyword) ||
      cafe.providerId.toLowerCase().includes(keyword) ||
      (cafe.providerName ?? "").toLowerCase().includes(keyword)
    const matchesStatus = statusFilter === "ALL" || cafe.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const columns = ["Cơ sở & Provider", "Liên hệ", "Địa chỉ / Chi nhánh", "Phí slot", "Trạng thái", "Ngày tạo", "Hành động"]
  /*
    Gom cơ sở theo chủ.

    Trước đây mỗi dòng chỉ ghi `Provider: 74887667` — tám ký tự đầu của UUID.
    Không đọc được là ai, và ba chi nhánh của cùng một chủ nằm rải rác khắp
    bảng nên không thấy được chúng thuộc về nhau.

    Sắp theo số chi nhánh giảm dần: chủ nhiều chi nhánh là chủ đáng chú ý nhất
    với người quản trị.
  */
  const groups = useMemo(() => {
    const byProvider = new Map<string, BackendCafe[]>()
    for (const cafe of filteredCafes) {
      const list = byProvider.get(cafe.providerId)
      if (list) list.push(cafe)
      else byProvider.set(cafe.providerId, [cafe])
    }
    return Array.from(byProvider.entries())
      .map(([providerId, items]) => ({
        providerId,
        // Hồ sơ chưa khai tên thì lùi về id rút gọn, còn hơn để trống.
        providerName: items[0]?.providerName || `Chủ ${providerId.slice(0, 8)}`,
        items,
        pendingCount: items.filter((cafe) => cafe.status === "PENDING").length,
      }))
      .sort((a, b) => b.items.length - a.items.length)
  }, [filteredCafes])

  const buildRows = (list: BackendCafe[]) => list.map((cafe) => [
    <div key={`${cafe.id}-name`} className="flex items-center gap-3">
      {cafe.coverImageUrl ? (
        <img src={cafe.coverImageUrl} alt={cafe.name} className="size-9 rounded-lg border border-[#e5e2e1] object-cover" />
      ) : (
        <div className="flex size-9 items-center justify-center rounded-lg border border-[#e5e2e1] bg-[#f6f3f2]">
          <Building2 className="size-4 text-[#747878]" />
        </div>
      )}
      <div>
        <div className="flex items-center gap-1.5 font-bold text-[#1c1b1b]">
          {cafe.name}
          <span className="rounded bg-[#f6f3f2] px-1 font-mono text-[9px] font-bold text-[#747878]">{cafe.id.slice(0, 8)}</span>
        </div>
        {/* Slug ở đây có ích hơn id chủ — id đã nằm ở tiêu đề nhóm phía trên. */}
        <div className="mt-0.5 text-xs font-semibold text-[#5d5f5f]">{cafe.slug}</div>
      </div>
    </div>,
    <div key={`${cafe.id}-contact`}>
      <div className="text-xs font-bold text-[#1c1b1b]">{cafe.phone ?? "--"}</div>
      <div className="mt-0.5 text-[11px] font-semibold text-[#747878]">{cafe.slug}</div>
    </div>,
    <span key={`${cafe.id}-addr`} className="block max-w-xs truncate text-xs font-semibold text-[#444748]">
      {cafe.address}
    </span>,
    <Badge key={`${cafe.id}-fee`} variant="outline" className="rounded-md border-[#c4c7c8] bg-[#f6f3f2] px-2.5 py-0.5 font-bold text-[#1c1b1b] shadow-none">
      {formatSlotFee(cafe)}
    </Badge>,
    <CafeStatusBadge key={`${cafe.id}-status`} status={cafe.status} />,
    <span key={`${cafe.id}-date`} className="font-mono text-xs text-[#747878]">{formatDate(cafe.createdAt)}</span>,
    <div key={`${cafe.id}-actions`} className="flex items-center gap-1.5">
      {cafe.status === "PENDING" && (
        <Button size="sm" onClick={() => handleOpenAction(cafe, "APPROVE")} className="h-8 rounded-md bg-emerald-600 px-2.5 text-xs font-bold text-white shadow-none hover:bg-emerald-700">
          Duyệt
        </Button>
      )}
      {cafe.status === "ACTIVE" && (
        <Button size="sm" variant="outline" onClick={() => handleOpenAction(cafe, "SUSPEND")} className="h-8 rounded-md border-zinc-200 px-2 text-xs font-bold text-zinc-700 shadow-none hover:bg-zinc-50">
          Tạm ngưng
        </Button>
      )}
      {cafe.status === "SUSPENDED" && (
        <Button size="sm" onClick={() => handleOpenAction(cafe, "REACTIVATE")} className="h-8 rounded-md bg-orange-600 px-2 text-xs font-bold text-white shadow-none hover:bg-orange-700">
          Kích hoạt lại
        </Button>
      )}
    </div>,
  ])

  return (
    <AdminShell>
      <AdminHeader
        title="Duyệt cơ sở"
        description="Cơ sở mới do provider tạo ra ở trạng thái chờ duyệt và chưa nhận đặt lịch. Duyệt để mở bán, tạm ngưng khi cần."
      />

      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <OverviewCard label="Tổng cơ sở" value={totalCount} icon={<Building2 className="size-5" />} tone="orange" />
        <OverviewCard label="Đang chờ duyệt" value={pendingCount} icon={<ShieldAlert className="size-5" />} tone="amber" />
        <OverviewCard label="Hoạt động" value={activeCount} icon={<CheckCircle2 className="size-5" />} tone="emerald" />
        <OverviewCard label="Tạm ngưng" value={suspendedCount} icon={<XCircle className="size-5" />} tone="red" />
      </section>

      <AdminPanel className="mt-6">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <AdminSearchBar
            placeholder="Tìm theo tên cơ sở, tên chủ, địa chỉ..."
            value={searchTerm}
            onChange={setSearchTerm}
          />

          <div className="flex flex-wrap gap-2.5">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-[#747878]">Trạng thái:</span>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
                className="h-9 rounded-lg border border-[#e5e2e1] bg-white px-2.5 text-xs font-bold text-[#1c1b1b] outline-none focus:border-orange-500"
              >
                <option value="ALL">Tất cả</option>
                <option value="PENDING">Chờ duyệt</option>
                <option value="ACTIVE">Hoạt động</option>
                <option value="SUSPENDED">Tạm ngưng</option>
              </select>
            </div>

          </div>
        </div>

        <AdminPanelTitle
          title={`Danh sách cơ sở đối tác (${filteredCafes.length})`}
          subtitle="Chờ duyệt · Đang hoạt động · Tạm ngưng"
        />

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-14 animate-pulse rounded-lg bg-[#f6f3f2]" />)}
          </div>
        ) : isError ? (
          <Button type="button" variant="outline" onClick={() => void refetch()}>
            Tải lại dữ liệu
          </Button>
        ) : groups.length === 0 ? (
          <p className="py-10 text-center text-sm text-[#747878]">
            Không tìm thấy dữ liệu phù hợp.
          </p>
        ) : (
          <div className="space-y-8">
            {groups.map((group) => (
              <section key={group.providerId}>
                <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-[#e5e2e1] pb-2">
                  <span className="text-sm font-black text-[#1c1b1b]">
                    {group.providerName}
                  </span>
                  <span className="rounded bg-[#f6f3f2] px-1.5 font-mono text-[10px] font-bold text-[#747878]">
                    {group.providerId.slice(0, 8)}
                  </span>
                  <span className="text-xs font-semibold text-[#747878]">
                    {group.items.length} cơ sở
                  </span>
                  {group.pendingCount > 0 && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                      {group.pendingCount} chờ duyệt
                    </span>
                  )}
                </div>
                <AdminTable columns={columns} rows={buildRows(group.items)} />
              </section>
            ))}
          </div>
        )}
      </AdminPanel>

      <Dialog open={selectedCafe !== null} onOpenChange={(open) => !open && setSelectedCafe(null)}>
        <DialogContent className="max-w-md sm:max-w-md rounded-xl border border-[#e5e2e1] bg-white font-sans">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-extrabold text-[#1c1b1b]">
              {actionType === "APPROVE" && "Xác nhận duyệt cơ sở"}
              {actionType === "SUSPEND" && "Tạm ngưng cơ sở"}
              {actionType === "REACTIVATE" && "Kích hoạt lại cơ sở"}
            </DialogTitle>
            <DialogDescription className="mt-1.5 text-xs font-semibold leading-relaxed text-[#5d5f5f]">
              <strong className="text-[#1c1b1b]">"{selectedCafe?.name}"</strong>
              {actionType === "APPROVE" && " sẽ hiển thị công khai và khách có thể tìm thấy để đặt lịch."}
              {actionType === "SUSPEND" && " sẽ ẩn khỏi tìm kiếm và trang chi tiết. Khách không còn xem được cơ sở này."}
              {actionType === "REACTIVATE" && " sẽ hiển thị công khai trở lại với khách."}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="mt-4 gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setSelectedCafe(null)} className="h-10 rounded-lg border-[#c4c7c8] bg-white font-bold text-[#1c1b1b] hover:bg-[#e5e2e1]/30">
              Hủy
            </Button>
            <Button
              onClick={handleConfirmAction}
              disabled={statusMutation.isPending}
              className="h-10 rounded-lg bg-[#1c1b1b] font-bold text-white hover:bg-[#313030]"
            >
              {/* Nút mang đúng tên hành động vừa chọn: admin bấm "Tạm ngưng" thì
                  nút cũng nói "Tạm ngưng", không phải một chữ "Xác nhận" chung
                  chung cho cả ba việc khác hẳn nhau. */}
              {actionType === "APPROVE" && "Duyệt cơ sở"}
              {actionType === "SUSPEND" && "Tạm ngưng"}
              {actionType === "REACTIVATE" && "Kích hoạt lại"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminShell>
  )
}

function OverviewCard({ label, value, icon, tone }: { label: string; value: number; icon: ReactNode; tone: "orange" | "amber" | "emerald" | "red" }) {
  const toneClass = {
    orange: "bg-orange-50 text-orange-600",
    amber: "bg-amber-50 text-amber-600",
    emerald: "bg-emerald-50 text-emerald-600",
    red: "bg-red-50 text-red-600",
  }[tone]

  return (
    <div className="flex items-center gap-3 rounded-xl border border-[#e5e2e1] bg-white p-4 shadow-sm">
      <div className={`flex size-10 items-center justify-center rounded-lg ${toneClass}`}>{icon}</div>
      <div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-[#747878]">{label}</div>
        <div className="mt-0.5 text-xl font-extrabold text-[#1c1b1b]">{value}</div>
      </div>
    </div>
  )
}

function formatSlotFee(cafe: BackendCafe) {
  const slotFeeRate = getCafeSlotFeeRate(cafe)
  if (slotFeeRate <= 0) return "--"
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(slotFeeRate)
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value))
}
