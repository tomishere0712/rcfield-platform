import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { ArrowLeftRight, Clock, Mail, MapPin, MoreHorizontal, Phone, Search, UserPlus, AlertCircle, Loader2, RefreshCw, Ban, CheckCircle2, MonitorSmartphone, Users, Eye } from "lucide-react"
import { toast } from "sonner"

import { ProviderPageHeader } from "@/pages/provider/components/ProviderPrimitives"
import { ProviderShell } from "@/pages/provider/components/ProviderShell"
import { cn } from "@/shared/lib/utils"
import { Button } from "@/shared/ui/button"
import { staffApi, staffQueryKeys, type StaffListItem, type InviteStaffBody } from "@/features/staff/api/staff.api"
import { cafeApi, cafeQueryKeys } from "@/features/cafes/api/cafe.api"
import { storageKeys } from "@/shared/lib/storage"
import { routePaths } from "@/app/router/route-paths"

function isOnline(lastActiveAt: string | null): boolean {
  if (!lastActiveAt) return false
  return Date.now() - new Date(lastActiveAt).getTime() < 10 * 60 * 1000
}

function formatExpiry(isoString: string): { label: string; urgent: boolean } {
  const diff = new Date(isoString).getTime() - Date.now()
  if (diff <= 0) return { label: "Đã hết hạn", urgent: true }
  const hours = Math.floor(diff / 3_600_000)
  const minutes = Math.floor((diff % 3_600_000) / 60_000)
  if (hours >= 24) return { label: `Hết hạn sau ${Math.floor(hours / 24)} ngày`, urgent: false }
  if (hours > 0) return { label: `Hết hạn sau ${hours} giờ ${minutes} phút`, urgent: hours < 4 }
  return { label: `Hết hạn sau ${minutes} phút`, urgent: true }
}

const STATUS_LABELS: Record<StaffListItem["status"], string> = {
  ACTIVE: "Đã kích hoạt",
  PENDING: "Chờ kích hoạt",
  DISABLED: "Vô hiệu hóa",
}

const emptyForm: InviteStaffBody = { cafe_id: "", full_name: "", email: "", phone: "" }
const phoneRegex = /^(84|0[3|5|7|8|9])([0-9]{8})$/

const inviteStaffSchema = z.object({
  cafe_id: z.string().min(1, { message: "Vui lòng chọn chi nhánh" }),
  full_name: z.string().trim().min(2, { message: "Họ tên phải có ít nhất 2 ký tự" }).max(255),
  email: z.string().trim().min(1, { message: "Vui lòng nhập email" }).email({ message: "Email không hợp lệ" }).max(255),
  phone: z
    .string()
    .trim()
    .optional()
    .refine((value) => !value || phoneRegex.test(value), {
      message: "Số điện thoại phải có dạng 0xxxxxxxxx hoặc 84xxxxxxxxx",
    }),
})

type InviteStaffFormValues = z.infer<typeof inviteStaffSchema>

function StatusBadge({ status }: { status: StaffListItem["status"] }) {
  const variants = {
    ACTIVE: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
    PENDING: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
    DISABLED: "bg-[#ebe7e7] text-[#747878] ring-1 ring-[#c4c7c8]",
  }
  const dots = {
    ACTIVE: "bg-emerald-500",
    PENDING: "bg-amber-400",
    DISABLED: "bg-[#c4c7c8]",
  }
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold", variants[status])}>
      <span className={cn("size-1.5 shrink-0 rounded-full", dots[status])} />
      {STATUS_LABELS[status]}
    </span>
  )
}

export function ProviderStaffPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState("")
  const [selectedCafeId, setSelectedCafeId] = useState<string | undefined>(undefined)
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [transferTarget, setTransferTarget] = useState<StaffListItem | null>(null)
  const [transferCafeId, setTransferCafeId] = useState("")
  const [impersonatingId, setImpersonatingId] = useState<string | null>(null)

  const handleImpersonate = async (staff: StaffListItem) => {
    setImpersonatingId(staff.id)
    try {
      const resp = await staffApi.impersonateStaff(staff.id)
      const currentAuthRaw = localStorage.getItem(storageKeys.auth)
      if (currentAuthRaw) localStorage.setItem(storageKeys.providerAuth, currentAuthRaw)
      localStorage.setItem(storageKeys.auth, JSON.stringify({
        accessToken: resp.token,
        user: { id: resp.staff.id, email: resp.staff.email, role: "staff", assignedCafeId: resp.staff.cafeId },
        role: "staff",
      }))
      localStorage.setItem(storageKeys.staffImpersonation, JSON.stringify({
        staffId: staff.id,
        staffName: staff.fullName,
        cafeName: staff.cafeName,
      }))
      window.location.assign(routePaths.staffDashboard)
    } catch {
      toast.error("Không thể mở phiên xem với tư cách nhân viên.")
      setImpersonatingId(null)
    }
  }

  const {
    register,
    handleSubmit,
    reset: resetInviteForm,
    formState: { errors },
  } = useForm<InviteStaffFormValues>({
    resolver: zodResolver(inviteStaffSchema),
    defaultValues: emptyForm,
  })

  const { data: staffList = [], isLoading, isError } = useQuery({
    queryKey: staffQueryKeys.list(selectedCafeId),
    queryFn: () => staffApi.listStaff(selectedCafeId),
    refetchInterval: 60_000,
  })

  const { data: cafesResp } = useQuery({
    queryKey: cafeQueryKeys.list({ scope: "managed" }),
    queryFn: () => cafeApi.listCafes({ limit: 100, scope: "managed" }),
  })
  const cafes = cafesResp?.data ?? []

  const inviteMutation = useMutation({
    mutationFn: (body: InviteStaffBody) => staffApi.inviteStaff(body),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: staffQueryKeys.all })
      setShowInviteModal(false)
      resetInviteForm(emptyForm)
      if (!result.emailSent) toast.warning("Đã tạo tài khoản nhưng gửi email thất bại. Dùng 'Gửi lại lời mời' sau.")
      else toast.success("Đã gửi lời mời cho nhân viên.")
    },
    onError: () => toast.error("Không thể mời nhân viên. Vui lòng thử lại."),
  })

  const deactivateMutation = useMutation({
    mutationFn: (staffId: string) => staffApi.deactivateStaff(staffId),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: staffQueryKeys.all }); toast.success("Đã vô hiệu hóa tài khoản nhân viên.") },
    onError: () => toast.error("Không thể vô hiệu hóa. Vui lòng thử lại."),
  })

  const reactivateMutation = useMutation({
    mutationFn: (staffId: string) => staffApi.reactivateStaff(staffId),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: staffQueryKeys.all }); toast.success("Đã kích hoạt lại tài khoản nhân viên.") },
    onError: () => toast.error("Không thể kích hoạt lại. Vui lòng thử lại."),
  })

  const transferMutation = useMutation({
    mutationFn: ({ staffId, cafeId }: { staffId: string; cafeId: string }) => staffApi.transferStaff(staffId, cafeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: staffQueryKeys.all })
      setTransferTarget(null)
      setTransferCafeId("")
      toast.success("Đã chuyển nhân viên sang chi nhánh mới.")
    },
    onError: () => toast.error("Không thể chuyển chi nhánh. Vui lòng thử lại."),
  })

  const resendMutation = useMutation({
    mutationFn: (staffId: string) => staffApi.resendInvite(staffId),
    onSuccess: (result) => {
      if (!result.emailSent) toast.warning("Gửi lại lời mời thất bại. Vui lòng kiểm tra cài đặt email.")
      else toast.success("Đã gửi lại lời mời thành công.")
    },
    onError: () => toast.error("Không thể gửi lại lời mời."),
  })

  const filtered = staffList.filter(
    (s) =>
      s.fullName.toLowerCase().includes(search.toLowerCase()) ||
      s.email.toLowerCase().includes(search.toLowerCase()) ||
      s.cafeName.toLowerCase().includes(search.toLowerCase()),
  )

  const handleInviteSubmit = (values: InviteStaffFormValues) => {
    inviteMutation.mutate({
      cafe_id: values.cafe_id,
      full_name: values.full_name.trim(),
      email: values.email.trim().toLowerCase(),
      phone: values.phone?.trim() || undefined,
    })
  }

  return (
    <ProviderShell>
      <ProviderPageHeader
        title="Quản lý nhân sự"
        description="Danh sách nhân viên, trạng thái và quản lý quyền truy cập."
      />

      {/* Toolbar */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#747878]" />
          <input
            className="h-10 w-full rounded-lg border border-[#c4c7c8] bg-white pl-9 pr-4 text-sm text-[#1c1b1b] placeholder:text-[#747878] focus:border-[#5d5f5f] focus:outline-none focus:ring-1 focus:ring-[#747878]"
            placeholder="Tìm kiếm nhân viên..."
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="h-10 cursor-pointer rounded-lg border border-[#c4c7c8] bg-white px-3 text-sm font-medium text-[#1c1b1b] focus:outline-none focus:ring-1 focus:ring-[#747878] sm:w-48"
          value={selectedCafeId ?? ""}
          onChange={(e) => setSelectedCafeId(e.target.value || undefined)}
        >
          <option value="">Tất cả chi nhánh</option>
          {cafes.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <Button
          className="h-10 gap-2 rounded-lg bg-[#1c1b1b] px-4 text-sm font-semibold text-[#fcf8f8] hover:bg-[#313030]"
          onClick={() => setShowInviteModal(true)}
        >
          <UserPlus className="size-4" />
          Mời nhân viên mới
        </Button>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-6 animate-spin text-[#747878]" />
        </div>
      )}

      {/* Error */}
      {isError && (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle className="size-4 shrink-0" />
          Không thể tải danh sách nhân viên. Vui lòng thử lại.
        </div>
      )}

      {/* Staff grid */}
      {!isLoading && !isError && (
        <section className="mb-16 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((staff) => (
            <StaffCard
              key={staff.id}
              staff={staff}
              impersonating={impersonatingId === staff.id}
              onDeactivate={() => deactivateMutation.mutate(staff.id)}
              onReactivate={() => reactivateMutation.mutate(staff.id)}
              onResend={() => resendMutation.mutate(staff.id)}
              onTransfer={() => { setTransferTarget(staff); setTransferCafeId(staff.cafeId) }}
              onImpersonate={() => handleImpersonate(staff)}
              onViewDetail={() => {
                window.location.href = routePaths.providerStaffDetail.replace(":staffId", staff.id)
              }}
            />
          ))}

          {/* Empty state */}
          {filtered.length === 0 && (
            <div className="col-span-full flex flex-col items-center gap-3 py-16 text-center">
              <div className="flex size-14 items-center justify-center rounded-full bg-[#ebe7e7]">
                <Users className="size-6 text-[#747878]" />
              </div>
              <p className="text-sm font-semibold text-[#1c1b1b]">
                {staffList.length === 0 ? "Chưa có nhân viên nào" : "Không tìm thấy kết quả"}
              </p>
              <p className="max-w-xs text-xs text-[#747878]">
                {staffList.length === 0
                  ? "Nhấn 'Mời nhân viên mới' để gửi lời mời qua email."
                  : "Thử tìm bằng tên, email hoặc tên chi nhánh khác."}
              </p>
            </div>
          )}
        </section>
      )}

      {/* Invite modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-[#c4c7c8] bg-white p-6 shadow-xl">
            <h2 className="mb-1 text-lg font-bold text-[#1c1b1b]">Mời nhân viên mới</h2>
            <p className="mb-5 text-sm text-[#747878]">Nhân viên sẽ nhận email kích hoạt tài khoản.</p>
            <form onSubmit={handleSubmit(handleInviteSubmit)} className="space-y-4" noValidate>
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#444748]">Chi nhánh *</label>
                <select
                  className={cn(
                    "h-10 w-full rounded-lg border border-[#c4c7c8] bg-white px-3 text-sm focus:border-[#5d5f5f] focus:outline-none focus:ring-1 focus:ring-[#747878]",
                    errors.cafe_id && "border-red-400 focus:border-red-400",
                  )}
                  {...register("cafe_id")}
                >
                  <option value="">Chọn chi nhánh</option>
                  {cafes.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                {errors.cafe_id && <p className="mt-1 text-xs text-red-600">{errors.cafe_id.message}</p>}
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#444748]">Họ và tên *</label>
                <input
                  type="text"
                  className={cn(
                    "h-10 w-full rounded-lg border border-[#c4c7c8] px-3 text-sm focus:border-[#5d5f5f] focus:outline-none focus:ring-1 focus:ring-[#747878]",
                    errors.full_name && "border-red-400 focus:border-red-400",
                  )}
                  placeholder="Nguyễn Văn A"
                  {...register("full_name")}
                />
                {errors.full_name && <p className="mt-1 text-xs text-red-600">{errors.full_name.message}</p>}
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#444748]">Email *</label>
                <input
                  type="email"
                  className={cn(
                    "h-10 w-full rounded-lg border border-[#c4c7c8] px-3 text-sm focus:border-[#5d5f5f] focus:outline-none focus:ring-1 focus:ring-[#747878]",
                    errors.email && "border-red-400 focus:border-red-400",
                  )}
                  placeholder="nhanvien@example.com"
                  {...register("email")}
                />
                {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#444748]">
                  Số điện thoại <span className="font-normal normal-case tracking-normal text-[#747878]">(tuỳ chọn)</span>
                </label>
                <input
                  type="tel"
                  className={cn(
                    "h-10 w-full rounded-lg border border-[#c4c7c8] px-3 text-sm focus:border-[#5d5f5f] focus:outline-none focus:ring-1 focus:ring-[#747878]",
                    errors.phone && "border-red-400 focus:border-red-400",
                  )}
                  placeholder="0901234567"
                  {...register("phone")}
                />
                {errors.phone && <p className="mt-1 text-xs text-red-600">{errors.phone.message}</p>}
              </div>
              <div className="flex gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 flex-1 border-[#c4c7c8] text-[#444748] hover:bg-[#f6f3f2]"
                  onClick={() => { setShowInviteModal(false); resetInviteForm(emptyForm) }}
                >
                  Hủy
                </Button>
                <Button
                  type="submit"
                  className="h-10 flex-1 bg-[#1c1b1b] text-white hover:bg-[#313030]"
                  disabled={inviteMutation.isPending}
                >
                  {inviteMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : "Gửi lời mời"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Transfer modal */}
      {transferTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl border border-[#c4c7c8] bg-white p-6 shadow-xl">
            <h2 className="mb-1 text-lg font-bold text-[#1c1b1b]">Chuyển chi nhánh</h2>
            <p className="mb-4 text-sm text-[#747878]">
              Chuyển <span className="font-semibold text-[#1c1b1b]">{transferTarget.fullName}</span> sang chi nhánh khác.
            </p>
            <div className="mb-5">
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#444748]">Chi nhánh mới</label>
              <select
                className="h-10 w-full rounded-lg border border-[#c4c7c8] bg-white px-3 text-sm focus:border-[#5d5f5f] focus:outline-none focus:ring-1 focus:ring-[#747878]"
                value={transferCafeId}
                onChange={(e) => setTransferCafeId(e.target.value)}
              >
                {cafes.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-10 flex-1 border-[#c4c7c8] text-[#444748] hover:bg-[#f6f3f2]"
                onClick={() => { setTransferTarget(null); setTransferCafeId("") }}
              >
                Hủy
              </Button>
              <Button
                type="button"
                className="h-10 flex-1 bg-[#1c1b1b] text-white hover:bg-[#313030]"
                disabled={transferMutation.isPending || transferCafeId === transferTarget.cafeId}
                onClick={() => transferMutation.mutate({ staffId: transferTarget.id, cafeId: transferCafeId })}
              >
                {transferMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : "Xác nhận"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </ProviderShell>
  )
}

function StaffCard({
  staff,
  impersonating,
  onDeactivate,
  onReactivate,
  onResend,
  onTransfer,
  onImpersonate,
  onViewDetail,
}: {
  staff: StaffListItem
  impersonating: boolean
  onDeactivate: () => void
  onReactivate: () => void
  onResend: () => void
  onTransfer: () => void
  onImpersonate: () => void
  onViewDetail: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <article
      className={cn(
        "relative rounded-xl border border-[#c4c7c8] bg-[#fcf8f8] p-5 transition-all hover:border-[#747878] hover:shadow-sm",
        staff.status === "DISABLED" && "opacity-60",
      )}
    >
      {/* Header row: avatar + name + status + menu */}
      <div className="mb-4 flex items-start gap-3">
        {/* Avatar */}
        <div className="relative shrink-0">
          <div className={cn(
            "flex size-11 items-center justify-center rounded-full text-base font-bold",
            staff.status === "ACTIVE"
              ? "bg-orange-100 text-orange-700"
              : "bg-[#ebe7e7] text-[#747878]",
          )}>
            {staff.fullName.charAt(0).toUpperCase()}
          </div>
          {staff.status === "ACTIVE" && isOnline(staff.lastActiveAt) && (
            <span className="absolute bottom-0 right-0 size-3 rounded-full border-2 border-[#fcf8f8] bg-emerald-500" />
          )}
        </div>

        {/* Name + role */}
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-bold leading-snug text-[#1c1b1b]">{staff.fullName}</h3>
          <p className="text-xs font-medium uppercase tracking-wider text-[#747878]">Nhân viên</p>
        </div>

        {/* Status badge + action menu — top right */}
        <div className="flex shrink-0 items-center gap-1.5">
          <StatusBadge status={staff.status} />
          <div className="relative">
            <button
              className="flex size-7 items-center justify-center rounded-md text-[#747878] transition-colors hover:bg-[#e5e2e1] hover:text-[#1c1b1b]"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label="Thao tác"
            >
              <MoreHorizontal className="size-4" />
            </button>
            {menuOpen && (
              <div
                className="absolute right-0 top-8 z-20 min-w-[200px] overflow-hidden rounded-lg border border-[#c4c7c8] bg-white shadow-lg"
                onMouseLeave={() => setMenuOpen(false)}
              >
                <button
                  className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-[#1c1b1b] hover:bg-[#f6f3f2]"
                  onClick={() => { setMenuOpen(false); onViewDetail() }}
                >
                  <Eye className="size-4 text-[#747878]" />
                  Xem chi tiết
                </button>
                <div className="h-px bg-[#e5e2e1]" />
                {staff.status === "ACTIVE" && (
                  <button
                    className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-orange-600 hover:bg-orange-50 disabled:opacity-50"
                    disabled={impersonating}
                    onClick={() => { setMenuOpen(false); onImpersonate() }}
                  >
                    {impersonating ? <Loader2 className="size-4 animate-spin" /> : <MonitorSmartphone className="size-4" />}
                    Xem với tư cách NV
                  </button>
                )}
                {staff.status === "ACTIVE" && <div className="h-px bg-[#e5e2e1]" />}
                {staff.status === "PENDING" && (
                  <button
                    className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-[#f6f3f2]"
                    onClick={() => { setMenuOpen(false); onResend() }}
                  >
                    <RefreshCw className="size-4 text-[#747878]" />
                    Gửi lại lời mời
                  </button>
                )}
                {(staff.status === "ACTIVE" || staff.status === "PENDING") && (
                  <button
                    className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-[#f6f3f2]"
                    onClick={() => { setMenuOpen(false); onTransfer() }}
                  >
                    <ArrowLeftRight className="size-4 text-[#747878]" />
                    Chuyển chi nhánh
                  </button>
                )}
                {staff.status === "ACTIVE" && (
                  <>
                    <div className="h-px bg-[#e5e2e1]" />
                    <button
                      className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50"
                      onClick={() => { setMenuOpen(false); onDeactivate() }}
                    >
                      <Ban className="size-4" />
                      Vô hiệu hóa
                    </button>
                  </>
                )}
                {staff.status === "DISABLED" && (
                  <button
                    className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-emerald-700 hover:bg-emerald-50"
                    onClick={() => { setMenuOpen(false); onReactivate() }}
                  >
                    <CheckCircle2 className="size-4" />
                    Kích hoạt lại
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Contact info */}
      <div className="space-y-2">
        {staff.phone && (
          <div className="flex items-center gap-2.5 text-xs text-[#5d5f5f]">
            <Phone className="size-3.5 shrink-0 text-[#c4c7c8]" />
            <span className="tabular-nums">{staff.phone}</span>
          </div>
        )}
        <div className="flex items-center gap-2.5 text-xs text-[#5d5f5f]">
          <Mail className="size-3.5 shrink-0 text-[#c4c7c8]" />
          <span className="truncate">{staff.email}</span>
        </div>
        <div className="flex items-center gap-2.5 text-xs text-[#5d5f5f]">
          <MapPin className="size-3.5 shrink-0 text-[#c4c7c8]" />
          <span>{staff.cafeName}</span>
        </div>
      </div>

      {/* Pending invite expiry */}
      {staff.status === "PENDING" && staff.inviteExpiresAt && (() => {
        const { label, urgent } = formatExpiry(staff.inviteExpiresAt)
        return (
          <div className={cn(
            "mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium",
            urgent ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-700",
          )}>
            <Clock className="size-3.5 shrink-0" />
            {label}
          </div>
        )
      })()}
    </article>
  )
}
