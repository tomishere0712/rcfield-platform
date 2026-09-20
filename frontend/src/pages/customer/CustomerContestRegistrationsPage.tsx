import { useMemo, useState } from "react"
import type { ReactNode } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link } from "react-router"
import { QRCodeSVG } from "qrcode.react"
import {
  CalendarClock,
  Car,
  CreditCard,
  MapPin,
  Pencil,
  QrCode,
  Search,
  ShieldAlert,
  Swords,
  Ticket,
  Trophy,
  X,
} from "lucide-react"
import { toast } from "sonner"
import { formatCurrency } from "@/shared/lib/format"

import {
  contestApi,
  contestQueryKeys,
} from "@/features/contests/api/contest.api"
import {
  formatContestDateTime,
  formatMatchLabel,
  getRegistrationDisplayName,
} from "@/features/contests/lib/contest-runtime"
import { ContestStatusBadge } from "@/features/contests/components"
import { CustomerPageShell } from "@/pages/customer/components/CustomerPageShell"
import { CustomerSubNav } from "@/pages/customer/components/CustomerSubNav"
import { routePaths } from "@/app/router/route-paths"
import { Button } from "@/shared/ui/button"
import { Badge } from "@/shared/ui/badge"
import { EmptyState } from "@/shared/ui/empty-state"
import { CardListSkeleton } from "@/shared/ui/loading-state"
import { cn } from "@/shared/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog"

// ─── Bộ lọc hành trình ────────────────────────────────────────────────────────
type JourneyFilter =
  | "ALL"
  | "PENDING_APPROVAL"
  | "APPROVED_WAITING_CHECKIN"
  | "READY_TO_RACE"
  | "IN_BRACKET"
  | "ADVANCED"
  | "ELIMINATED"
  | "FINISHED"

type ContestStatusFilter = "ALL" | "OPEN" | "CLOSED" | "RUNNING" | "COMPLETED"

const JOURNEY_FILTERS: Array<{ key: JourneyFilter; label: string }> = [
  { key: "ALL", label: "Tất cả" },
  { key: "PENDING_APPROVAL", label: "Chờ duyệt" },
  { key: "APPROVED_WAITING_CHECKIN", label: "Chờ check-in" },
  { key: "READY_TO_RACE", label: "Sẵn sàng đua" },
  { key: "IN_BRACKET", label: "Đang trong nhánh đấu" },
  { key: "ADVANCED", label: "Đã vào vòng tiếp" },
  { key: "ELIMINATED", label: "Đã bị loại" },
  { key: "FINISHED", label: "Hoàn thành" },
]

const CONTEST_STATUS_FILTERS: Array<{ key: ContestStatusFilter; label: string }> = [
  { key: "ALL", label: "Tất cả giải" },
  { key: "OPEN", label: "Đang mở" },
  { key: "CLOSED", label: "Đã đóng đăng ký" },
  { key: "RUNNING", label: "Đang diễn ra" },
  { key: "COMPLETED", label: "Đã hoàn thành" },
]

// ─── Map trạng thái trận đấu sang tiếng Việt ─────────────────────────────────
const MATCH_STATUS_VI: Record<string, string> = {
  SCHEDULED: "Chưa bắt đầu",
  RUNNING: "Đang diễn ra",
  COMPLETED: "Đã kết thúc",
  CANCELLED: "Đã hủy",
  WAITING: "Đang chờ",
  PENDING: "Chờ xử lý",
}

// ─── Tính 1 badge trạng thái tổng hợp ─────────────────────────────────────────
function getUnifiedBadge(
  registration: {
    status: string
    paymentStatus: string
    customerJourneyStatus?: string | null
    entryFeeHoldExpiresAt?: string | null
    checkedInAt?: string | null
    contest?: { starts_at?: string | null } | null
  },
  now: number,
): { label: string; className: string } {
  const { status, paymentStatus, customerJourneyStatus, entryFeeHoldExpiresAt, checkedInAt, contest } = registration
  const isPaid = paymentStatus === "MARKED_PAID" || (paymentStatus as string) === "PAID"
  const holdExpiresAt = entryFeeHoldExpiresAt ? new Date(entryFeeHoldExpiresAt).getTime() : null
  const isHoldExpired = holdExpiresAt ? holdExpiresAt <= now : false
  const contestStarted = contest?.starts_at ? new Date(contest.starts_at).getTime() < now : false

  // 1. Quá hạn thanh toán hoặc Đã hủy (chỉ khi CHƯA thanh toán)
  if (!isPaid && (status === "CANCELLED" || (paymentStatus === "PENDING_PAYMENT" && isHoldExpired)))
    return {
      label: "Đã hủy",
      className: "bg-red-100 text-red-800 border-none font-bold text-xs",
    }

  // 2. Không đến (Đã xác nhận / Đã thanh toán, nhưng quá giờ bắt đầu giải mà chưa check-in)
  if (
    (status === "CONFIRMED" || (paymentStatus as string) === "PAID") &&
    contestStarted &&
    !checkedInAt
  )
    return {
      label: "Không đến",
      className: "bg-orange-100 text-orange-800 border-none font-bold text-xs",
    }

  // 3. Chờ thanh toán lệ phí (vẫn còn trong hạn giữ chỗ)
  if (paymentStatus === "PENDING_PAYMENT" && !isHoldExpired)
    return {
      label: "Chờ thanh toán lệ phí",
      className: "bg-amber-100 text-amber-800 border-none font-bold text-xs",
    }

  // 4. Trạng thái hành trình thi đấu
  if (customerJourneyStatus === "ADVANCED")
    return {
      label: "Đã vào vòng tiếp",
      className: "bg-indigo-100 text-indigo-800 border-none font-bold text-xs",
    }
  if (customerJourneyStatus === "IN_BRACKET")
    return {
      label: "Đang trong nhánh đấu",
      className: "bg-purple-100 text-purple-800 border-none font-bold text-xs",
    }
  if (customerJourneyStatus === "ELIMINATED")
    return {
      label: "Đã bị loại",
      className: "bg-slate-100 text-slate-700 border-none font-bold text-xs",
    }
  if (customerJourneyStatus === "FINISHED")
    return {
      label: "Hoàn thành",
      className: "bg-emerald-100 text-emerald-800 border-none font-bold text-xs",
    }
  if (customerJourneyStatus === "READY_TO_RACE")
    return {
      label: "Sẵn sàng đua",
      className: "bg-teal-100 text-teal-800 border-none font-bold text-xs",
    }
  if (customerJourneyStatus === "APPROVED_WAITING_CHECKIN")
    return {
      label: "Chờ check-in",
      className: "bg-blue-100 text-blue-800 border-none font-bold text-xs",
    }
  if (status === "CONFIRMED")
    return {
      label: "Đã xác nhận",
      className: "bg-emerald-100 text-emerald-800 border-none font-bold text-xs",
    }
  return {
    label: "Chờ duyệt",
    className: "bg-yellow-100 text-yellow-800 border-none font-bold text-xs",
  }
}

// ─── Accent bar color ─────────────────────────────────────────────────────────
function getAccentColor(
  registration: {
    status: string
    paymentStatus: string
    customerJourneyStatus?: string | null
    entryFeeHoldExpiresAt?: string | null
    checkedInAt?: string | null
    contest?: { starts_at?: string | null } | null
  },
  now: number,
): string {
  const { status, paymentStatus, customerJourneyStatus, entryFeeHoldExpiresAt, checkedInAt, contest } = registration
  const isPaid = paymentStatus === "MARKED_PAID" || (paymentStatus as string) === "PAID"
  const holdExpiresAt = entryFeeHoldExpiresAt ? new Date(entryFeeHoldExpiresAt).getTime() : null
  const isHoldExpired = holdExpiresAt ? holdExpiresAt <= now : false
  const contestStarted = contest?.starts_at ? new Date(contest.starts_at).getTime() < now : false

  if (!isPaid && (status === "CANCELLED" || (paymentStatus === "PENDING_PAYMENT" && isHoldExpired))) return "bg-slate-300"
  if ((status === "CONFIRMED" || isPaid) && contestStarted && !checkedInAt) return "bg-orange-400"
  if (paymentStatus === "PENDING_PAYMENT" && !isHoldExpired) return "bg-amber-400"
  if (customerJourneyStatus === "IN_BRACKET" || customerJourneyStatus === "ADVANCED")
    return "bg-purple-500"
  if (customerJourneyStatus === "READY_TO_RACE") return "bg-teal-500"
  if (status === "CONFIRMED" || isPaid) return "bg-emerald-500"
  return "bg-orange-400"
}

// ─── Trang chính ──────────────────────────────────────────────────────────────
export function CustomerContestRegistrationsPage() {
  const [now] = useState(() => Date.now())
  const queryClient = useQueryClient()

  // State bộ lọc (local state thay vì URL params)
  const [journeyFilter, setJourneyFilter] = useState<JourneyFilter>("ALL")
  const [contestStatusFilter, setContestStatusFilter] = useState<ContestStatusFilter>("ALL")
  const [searchQuery, setSearchQuery] = useState("")

  // State hành động
  const [cancelId, setCancelId] = useState<string | null>(null)
  const [payingId, setPayingId] = useState<string | null>(null)
  const [zoomedCode, setZoomedCode] = useState<string | null>(null)

  const registrationsQuery = useQuery({
    queryKey: contestQueryKeys.myRegistrations({
      query: searchQuery,
      journeyStatus: journeyFilter,
      contestStatus: contestStatusFilter,
    }),
    queryFn: () =>
      contestApi.listMyRegistrations({
        query: searchQuery || undefined,
        customer_journey_status:
          journeyFilter === "ALL" ? undefined : (journeyFilter as never),
        contest_status:
          contestStatusFilter === "ALL" ? undefined : (contestStatusFilter as never),
      }),
    refetchInterval: 15_000,
  })

  const entryFeePaymentMutation = useMutation({
    mutationFn: (registrationId: string) =>
      contestApi.createEntryFeePayment(registrationId),
    onSuccess: (payment) => {
      window.location.href = payment.payment_url
    },
    onError: (error) => {
      setPayingId(null)
      toast.error("Không thể tạo thanh toán lệ phí", {
        description: getErrorMessage(error),
      })
    },
  })

  const cancelMutation = useMutation({
    mutationFn: (registrationId: string) =>
      contestApi.cancelRegistration(registrationId),
    onSuccess: () => {
      toast.success("Hủy đăng ký giải đấu thành công!")
      void queryClient.invalidateQueries({
        queryKey: contestQueryKeys.myRegistrations(),
      })
      void queryClient.invalidateQueries({ queryKey: contestQueryKeys.all })
    },
    onError: (error) => {
      toast.error("Không thể hủy đăng ký", {
        description: getErrorMessage(error),
      })
    },
  })

  const registrationsData = registrationsQuery.data
  const registrations = useMemo(
    () => registrationsData ?? [],
    [registrationsData],
  )

  const stats = useMemo(() => {
    return {
      total: registrations.length,
      inBracket: registrations.filter(
        (item) => item.customerJourneyStatus === "IN_BRACKET",
      ).length,
      advanced: registrations.filter(
        (item) => item.customerJourneyStatus === "ADVANCED",
      ).length,
    }
  }, [registrations])

  return (
    <CustomerPageShell>
      <CustomerSubNav activeTab="contests" />

      {/* ── Header Stats ─────────────────────────────────────────────────── */}
      <div className="mb-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-extrabold text-slate-950 font-display">
              Hành trình giải đấu của bạn
            </h1>
            <p className="mt-2 text-sm font-medium text-slate-500">
              Theo dõi trạng thái đăng ký, trận gần nhất và bracket của các giải
              bạn đang tham gia.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 items-stretch">
            <Metric label="Đã tham gia" value={String(stats.total)} />
            <Metric label="Đang trong nhánh đấu" value={String(stats.inBracket)} />
            <Metric label="Đã vào vòng tiếp" value={String(stats.advanced)} />
          </div>
        </div>
      </div>

      {/* ── Bộ lọc ───────────────────────────────────────────────────────── */}
      <div className="space-y-3 mb-5">
        {/* Hàng 1: Ô tìm kiếm full-width */}
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm theo tên giải, người chơi hoặc email..."
            className="h-10 w-full rounded-2xl border border-slate-200 bg-white pl-9 pr-8 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-100"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Hàng 2: Chip lọc hành trình - Tự điều chỉnh độ rộng theo chữ để hiển thị 100% không bị cắt */}
        <div className="flex items-center justify-between gap-1 sm:gap-1.5 w-full">
          {JOURNEY_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setJourneyFilter(f.key)}
              className={cn(
                "py-2 px-1.5 sm:px-2.5 rounded-xl text-[10.5px] sm:text-[11px] xl:text-xs font-bold transition-all duration-200 text-center whitespace-nowrap flex-auto flex items-center justify-center",
                journeyFilter === f.key
                  ? "bg-slate-950 text-white shadow-md shadow-slate-900/20"
                  : "bg-white border border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Hàng 3: Chip lọc trạng thái giải */}
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2.5">
          <span className="inline-flex items-center gap-1.5 px-1.5 text-xs font-extrabold text-slate-600">
            <Trophy className="h-3.5 w-3.5 text-orange-500" />
            Trạng thái giải
          </span>
          {CONTEST_STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setContestStatusFilter(f.key)}
              className={cn(
                "rounded-xl px-3 py-1.5 text-xs font-bold transition-colors",
                contestStatusFilter === f.key
                  ? "bg-orange-500 text-white shadow-sm shadow-orange-500/20"
                  : "text-slate-600 hover:bg-orange-50 hover:text-orange-700",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Danh sách card ───────────────────────────────────────────────── */}
      <div className="space-y-4">
        {registrationsQuery.isLoading ? (
          <CardListSkeleton
            count={3}
            className="space-y-4"
            itemClassName="h-52 rounded-3xl"
          />
        ) : registrations.length === 0 ? (
          <EmptyState
            icon={Trophy}
            title="Không tìm thấy giải đấu phù hợp"
            description="Hãy khám phá thêm các giải đang mở đăng ký hoặc điều chỉnh bộ lọc để xem hành trình thi đấu của bạn."
            className="rounded-3xl border-2 border-slate-200 bg-white p-12 shadow-sm"
            action={
              <Button
                asChild
                className="rounded-xl bg-orange-600 px-6 py-5 font-bold text-white hover:bg-orange-700"
              >
                <Link to="/contests">Khám phá giải đấu</Link>
              </Button>
            }
          />
        ) : (
          registrations.map((registration) => {
            const contest = registration.contest
            const latestMatch = registration.latestMatch
            const byocDeclaration =
              registration.vehicleSource === "BYOC"
                ? ((registration.metadata?.byoc_declaration ?? null) as {
                  vehicle_name?: string | null
                  vehicle_brand?: string | null
                  vehicle_class?: string | null
                  notes?: string | null
                } | null)
                : null
            const contestUpcoming = contest?.starts_at
              ? new Date(contest.starts_at).getTime() > now
              : false
            const entryFeeIsIncludedInBooking = Boolean(registration.bookingId)

            const holdExpiresAt = registration.entryFeeHoldExpiresAt
              ? new Date(registration.entryFeeHoldExpiresAt).getTime()
              : null
            const isHoldExpired = holdExpiresAt ? holdExpiresAt <= now : false

            const isPaid =
              registration.paymentStatus === "MARKED_PAID" ||
              (registration.paymentStatus as string) === "PAID"

            // Một đăng ký bị coi là Hủy NẾU CHƯA thanh toán VÀ (status === CANCELLED hoặc bị quá hạn giữ chỗ thanh toán)
            const isEffectiveCancelled =
              !isPaid &&
              (registration.status === "CANCELLED" ||
                (registration.paymentStatus === "PENDING_PAYMENT" && isHoldExpired))

            const badge = getUnifiedBadge(registration, now)
            const accent = getAccentColor(registration, now)

            /*
              Hiện mã QR điểm danh khi backend THẬT SỰ cho điểm danh, không phải
              khi một trong hai điều kiện đúng.

              `checkInRegistration` đòi ĐỒNG THỜI `status === CONFIRMED` và lệ
              phí đã ngã ngũ (`ENTRY_FEE_PENDING` chặn nếu chưa). Điều kiện cũ
              dùng "hoặc", nên một đăng ký được chủ sân duyệt trước khi khách trả
              tiền vẫn hiện mã — khách mang tới quầy, nhân viên quét, hệ thống từ
              chối, và không ai hiểu vì sao vì trên màn hình mã vẫn ở đó.
            */
            const showQr =
              !isEffectiveCancelled &&
              registration.status === "CONFIRMED" &&
              registration.paymentStatus !== "PENDING_PAYMENT" &&
              !!registration.checkInCode

            return (
              <article
                key={registration.id}
                className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md"
              >
                <div className="grid gap-0 lg:grid-cols-[240px_minmax(0,1fr)]">
                  {/* ── Ảnh banner (click điều hướng tới trang giải đấu) ────────── */}
                  <Link
                    to={routePaths.contestDetail.replace(
                      ":contestId",
                      contest?.id ?? registration.contestId,
                    )}
                    className="group relative block min-h-[200px] bg-slate-900 lg:min-h-full"
                  >
                    {contest?.banner_image_url ? (
                      <img
                        src={contest.banner_image_url}
                        alt={contest.name}
                        className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : null}
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-900/70 to-slate-900/30 transition-opacity duration-300 group-hover:opacity-90" />

                    {/* Accent bar bên trái */}
                    <div className={cn("absolute left-0 top-0 bottom-0 w-1", accent)} />

                    <div className="absolute inset-x-0 bottom-0 p-5 text-white">
                      <p className="text-xs font-black uppercase tracking-[0.22em] text-orange-200">
                        {contest?.contest_format?.name ?? "Giải đấu"}
                      </p>
                      <h3 className="mt-2 text-xl font-black leading-tight transition-colors duration-200 group-hover:text-orange-400">
                        {contest?.name ?? "Đang cập nhật"}
                      </h3>
                      <div className="mt-3 flex items-center gap-2 text-sm text-white/80">
                        <MapPin className="size-4" />
                        <span>
                          {contest?.host_branch?.cafe?.name ?? "RC Field"}
                        </span>
                      </div>
                    </div>
                  </Link>

                  {/* ── Nội dung card ──────────────────────────────────── */}
                  <div className="flex flex-col p-6 gap-4">
                    {/* Phần trên: Badge + thông tin + cảnh báo */}
                    <div className="flex-grow space-y-4">
                      {/* Badge trạng thái tổng hợp (chỉ 1) */}
                      <div className="flex items-center justify-between">
                        <Badge className={badge.className}>
                          {badge.label}
                        </Badge>
                        {contest ? (
                          <ContestStatusBadge
                            status={contest.status}
                            size="sm"
                          />
                        ) : null}
                      </div>

                      {/* 1. Suất được giữ đến (Còn hạn) */}
                      {registration.paymentStatus === "PENDING_PAYMENT" &&
                      registration.entryFeeHoldExpiresAt &&
                      !isHoldExpired &&
                      !isEffectiveCancelled ? (
                        <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3">
                          <p className="text-sm font-bold text-orange-900">
                            Suất được giữ đến{" "}
                            {new Date(
                              registration.entryFeeHoldExpiresAt,
                            ).toLocaleTimeString("vi-VN", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                          <p className="mt-1 text-sm font-medium text-orange-800">
                            Chưa thanh toán lệ phí trước giờ đó thì suất sẽ trả
                            lại cho người khác.
                          </p>
                        </div>
                      ) : null}

                      {/* 2. Đã hết thời gian thanh toán lại (Hết hạn giữ chỗ - Chỉ hiện khi CHƯA thanh toán) */}
                      {!isPaid && registration.entryFeeHoldExpiresAt && isHoldExpired ? (
                        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                          <p className="text-sm font-bold text-red-900">
                            Đã hết thời gian giữ chỗ thanh toán lệ phí (hết hạn lúc{" "}
                            {new Date(
                              registration.entryFeeHoldExpiresAt,
                            ).toLocaleTimeString("vi-VN", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                            )
                          </p>
                          <p className="mt-1 text-sm font-medium text-red-800">
                            Đơn đã chuyển sang trạng thái đã hủy do quá thời gian thanh toán lại.
                          </p>
                        </div>
                      ) : null}

                      {/* 3. Lý do hủy khác (Chỉ hiện khi CHƯA thanh toán và bị hủy) */}
                      {!isPaid &&
                      registration.status === "CANCELLED" &&
                      registration.cancellationReason &&
                      !isHoldExpired ? (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                          <p className="text-sm font-bold text-amber-900">
                            Lý do hủy: {registration.cancellationReason}
                          </p>
                          <p className="mt-1 text-sm font-medium text-amber-800">
                            Suất đã được trả lại. Giải còn mở đăng ký thì bạn
                            vẫn đăng ký lại được từ đầu.
                          </p>
                        </div>
                      ) : null}

                      {/* Thông tin chính + QR */}
                      <div className="flex gap-4 items-start">
                        {/* Info tiles */}
                        <div className="flex-grow grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                          <InfoTile
                            label="Người thi đấu"
                            value={getRegistrationDisplayName(registration)}
                          />
                          {/*
                            Ô chữ này dùng CHUNG điều kiện với ảnh QR ngay bên
                            cạnh. Trước đây chỉ ảnh QR bị khoá, còn dãy mã vẫn in
                            ra — mà nhân viên tại quầy gõ tay được dãy mã đó, nên
                            khoá ảnh mà để lộ chữ thì chẳng khoá gì cả.

                            Chưa dùng được thì nói ra ĐIỀU KIỆN, đừng in "--".
                            Dấu gạch đọc ra như lỗi tải dữ liệu; câu bên dưới nói
                            đúng việc khách cần làm.
                          */}
                          <InfoTile
                            label="Mã check-in"
                            value={
                              showQr
                                ? (registration.checkInCode ?? "--")
                                : "Có sau khi thanh toán"
                            }
                          />
                          <InfoTile
                            label="Lịch thi đấu"
                            value={formatContestDateTime(contest?.starts_at ?? null)}
                            icon={<CalendarClock className="size-4" />}
                          />
                        </div>

                        {/* QR Code */}
                        {showQr && registration.checkInCode ? (
                          <div className="shrink-0 flex flex-col items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setZoomedCode(registration.checkInCode!)}
                              className="group relative w-20 h-20 rounded-xl overflow-hidden border border-slate-200 bg-white p-1.5 shadow-sm hover:shadow-md transition-shadow flex items-center justify-center"
                              title="Phóng to mã QR"
                            >
                              <QRCodeSVG
                                value={registration.checkInCode}
                                size={64}
                                level="M"
                              />
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                                <QrCode className="size-5 text-slate-800 opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-sm" />
                              </div>
                            </button>
                            <span className="text-[10px] font-bold text-slate-400">
                              Quét check-in
                            </span>
                          </div>
                        ) : null}
                      </div>

                      {/* Nhắc nhở check-in */}
                      {showQr && contestUpcoming ? (
                        <p className="flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800">
                          <Ticket className="size-4 shrink-0" />
                          Hãy đưa mã này cho nhân viên để check-in:{" "}
                          <span className="font-black tracking-widest">
                            {registration.checkInCode}
                          </span>
                        </p>
                      ) : null}

                      {/* Khai báo xe BYOC */}
                      {byocDeclaration ? (
                        <ByocDeclarationCard
                          registrationId={registration.id}
                          declaration={byocDeclaration}
                          editable={registration.status === "PENDING"}
                        />
                      ) : null}

                      {/* Trận gần nhất + Gợi ý theo dõi */}
                      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
                        <section className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                          <div className="flex items-center gap-2 text-slate-900">
                            <Swords className="size-4 text-orange-500" />
                            <h4 className="text-sm font-black uppercase tracking-wide">
                              Trận gần nhất
                            </h4>
                          </div>
                          {latestMatch ? (
                            <div className="mt-3 space-y-2">
                              <p className="text-base font-bold text-slate-900">
                                {formatMatchLabel({
                                  id: latestMatch.matchId,
                                  contest_id: latestMatch.contestId,
                                  cafe_id: contest?.host_branch?.cafe_id ?? "",
                                  track_config_id: null,
                                  round_no: latestMatch.roundNo,
                                  match_no: latestMatch.matchNo,
                                  name: latestMatch.name,
                                  match_type: latestMatch.matchType,
                                  status: latestMatch.status,
                                  scheduled_at: latestMatch.scheduledAt,
                                  started_at: latestMatch.startedAt,
                                  ended_at: latestMatch.endedAt,
                                  next_match_id: latestMatch.nextMatchId,
                                  advancement_rule: {},
                                  result_summary: {},
                                  metadata: {},
                                  decided_by: null,
                                  decided_at: null,
                                  participants: [],
                                })}
                              </p>
                              <p className="text-sm font-medium text-slate-600">
                                Trạng thái:{" "}
                                {MATCH_STATUS_VI[latestMatch.status] ?? latestMatch.status}
                              </p>
                              <p className="text-sm font-medium text-slate-600">
                                Kết quả:{" "}
                                {latestMatch.isWinner
                                  ? "🏆 Bạn vừa thắng"
                                  : latestMatch.finishPosition
                                    ? `Về vị trí #${latestMatch.finishPosition}`
                                    : "Đang chờ cập nhật"}
                              </p>
                            </div>
                          ) : (
                            <p className="mt-3 text-sm font-medium text-slate-500">
                              Chưa có dữ liệu trận đấu gần nhất.
                            </p>
                          )}
                        </section>

                        <section className="rounded-2xl border border-slate-200 bg-white p-4">
                          <h4 className="text-sm font-black uppercase tracking-wide text-slate-900">
                            Thông tin theo dõi
                          </h4>
                          <div className="mt-3 space-y-2 text-sm text-slate-600">
                            <p>
                              <span className="font-semibold">Họ tên:</span>{" "}
                              {registration.participant?.fullName?.trim() || getRegistrationDisplayName(registration)}
                            </p>
                            <p>
                              <span className="font-semibold">Email:</span>{" "}
                              {registration.participant?.email?.trim() || "Chưa có"}
                            </p>
                            <p>
                              <span className="font-semibold">Lệ phí:</span>{" "}
                              {(() => {
                                const fee = registration.entryFeeAmount ?? contest?.entry_fee
                                if (fee === null || fee === undefined) return "--"
                                return fee > 0 ? formatCurrency(fee) : "Miễn phí"
                              })()}
                            </p>
                          </div>
                        </section>
                      </div>
                    </div>

                    {/* ── Nút hành động — cố định dưới cùng bên phải ─── */}
                    {registration.paymentStatus === "PENDING_PAYMENT" &&
                    !isHoldExpired &&
                    registration.status !== "CANCELLED" ? (
                      <div className="mt-2 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2 justify-end">
                        {entryFeeIsIncludedInBooking ? (
                          <Button
                            asChild
                            className="rounded-xl bg-orange-600 font-bold text-white hover:bg-orange-700"
                          >
                            <Link
                              to={routePaths.customerBookingDetail.replace(
                                ":bookingId",
                                registration.bookingId!,
                              )}
                            >
                              <CreditCard className="mr-2 size-4" />
                              Thanh toán đơn đặt
                            </Link>
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            className="rounded-xl bg-orange-600 font-bold text-white hover:bg-orange-700"
                            disabled={payingId === registration.id}
                            onClick={() => {
                              setPayingId(registration.id)
                              entryFeePaymentMutation.mutate(registration.id)
                            }}
                          >
                            <CreditCard className="mr-2 size-4" />
                            {payingId === registration.id
                              ? "Đang chuyển hướng..."
                              : "Thanh toán lại"}
                          </Button>
                        )}

                        {/* Hủy đăng ký — CHỈ cho phép khi chưa thanh toán và còn hạn */}
                        {registration.status === "PENDING" ? (
                          <Button
                            type="button"
                            variant="outline"
                            className="rounded-xl border-red-200 bg-red-50 font-bold text-red-700 hover:bg-red-100 hover:text-red-800"
                            onClick={() => setCancelId(registration.id)}
                          >
                            Hủy đăng ký
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              </article>
            )
          })
        )}
      </div>

      {/* ── Dialog xác nhận hủy ──────────────────────────────────────────── */}
      <Dialog
        open={!!cancelId}
        onOpenChange={(v) => {
          if (!v) setCancelId(null)
        }}
      >
        <DialogContent className="rounded-2xl border-none sm:max-w-md">
          <DialogHeader>
            <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-red-50 text-red-600">
              <ShieldAlert className="size-6" />
            </div>
            <DialogTitle className="text-center text-lg font-bold text-slate-950">
              Xác nhận hủy đăng ký
            </DialogTitle>
            <DialogDescription className="mt-2 text-center text-sm leading-relaxed text-slate-500">
              Bạn có chắc chắn muốn hủy đăng ký tham gia giải đấu này không?
              Hành động này không thể hoàn tác. Phí tham gia đã thanh toán sẽ
              được hoàn theo chính sách của giải. Nếu bạn đang thuê xe cho giải
              này, đơn thuê cũng sẽ bị hủy tự động.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-6 gap-2 sm:justify-center">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCancelId(null)}
              disabled={cancelMutation.isPending}
              className="rounded-xl border-slate-200 font-bold"
            >
              Quay lại
            </Button>
            <Button
              type="button"
              disabled={cancelMutation.isPending}
              className="rounded-xl bg-red-600 font-bold text-white hover:bg-red-700"
              onClick={async () => {
                if (cancelId) {
                  await cancelMutation.mutateAsync(cancelId)
                  setCancelId(null)
                }
              }}
            >
              {cancelMutation.isPending ? "Đang hủy..." : "Xác nhận hủy"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog phóng to QR ────────────────────────────────────────────── */}
      <Dialog
        open={!!zoomedCode}
        onOpenChange={(v) => {
          if (!v) setZoomedCode(null)
        }}
      >
        <DialogContent className="rounded-3xl border-none sm:max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-center text-base font-extrabold text-slate-900">
              Mã QR Check-in
            </DialogTitle>
            <DialogDescription className="text-center text-sm text-slate-500">
              Nhân viên quét mã này khi bạn đến điểm danh.
            </DialogDescription>
          </DialogHeader>
          {zoomedCode ? (
            <div className="flex flex-col items-center gap-3 py-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm flex items-center justify-center">
                <QRCodeSVG
                  value={zoomedCode}
                  size={200}
                  level="M"
                  includeMargin
                />
              </div>
              <p className="text-xs font-semibold text-slate-500 text-center">
                Giữ màn hình sáng và hướng về phía máy quét
              </p>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </CustomerPageShell>
  )
}

// ─── ByocDeclarationCard ───────────────────────────────────────────────────────
function ByocDeclarationCard({
  registrationId,
  declaration,
  editable,
}: {
  registrationId: string
  declaration: {
    vehicle_name?: string | null
    vehicle_brand?: string | null
    vehicle_class?: string | null
    notes?: string | null
  }
  editable: boolean
}) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [vehicleName, setVehicleName] = useState(declaration.vehicle_name ?? "")
  const [vehicleBrand, setVehicleBrand] = useState(declaration.vehicle_brand ?? "")
  const [vehicleClass, setVehicleClass] = useState(declaration.vehicle_class ?? "")
  const [notes, setNotes] = useState(declaration.notes ?? "")

  const updateMutation = useMutation({
    mutationFn: () =>
      contestApi.updateByocDeclaration(registrationId, {
        vehicle_name: vehicleName.trim(),
        vehicle_brand: vehicleBrand.trim() || null,
        vehicle_class: vehicleClass.trim() || null,
        notes: notes.trim() || null,
      }),
    onSuccess: () => {
      toast.success("Cập nhật khai báo xe thành công!")
      setEditing(false)
      void queryClient.invalidateQueries({
        queryKey: contestQueryKeys.myRegistrations(),
      })
      void queryClient.invalidateQueries({ queryKey: contestQueryKeys.all })
    },
    onError: (error) => {
      toast.error("Không thể cập nhật khai báo xe", {
        description: getErrorMessage(error),
      })
    },
  })

  const isNameValid = vehicleName.trim().length >= 2
  const inputClassName =
    "h-10 w-full rounded-xl border border-amber-200 bg-white px-3 text-sm text-amber-950 focus:border-amber-400 focus:outline-none"

  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
      <div className="flex items-center justify-between gap-2 text-amber-900">
        <div className="flex items-center gap-2">
          <Car className="size-4" />
          <h4 className="text-sm font-black uppercase tracking-wide">
            Khai báo xe cá nhân (BYOC)
          </h4>
        </div>
        {editable && !editing ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-xl border-amber-300 bg-white font-bold text-amber-800 hover:bg-amber-100"
            onClick={() => setEditing(true)}
          >
            <Pencil className="mr-1 size-3.5" />
            Chỉnh sửa
          </Button>
        ) : null}
      </div>

      {editing ? (
        <div className="mt-3 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-amber-800">
                Tên xe <span className="text-red-600">*</span>
              </label>
              <input
                className={inputClassName}
                value={vehicleName}
                onChange={(e) => setVehicleName(e.target.value)}
                placeholder="VD: Xe đua của tôi"
              />
              {!isNameValid && vehicleName.trim().length > 0 ? (
                <p className="mt-1 text-xs font-semibold text-red-600">
                  Tên xe cần ít nhất 2 ký tự.
                </p>
              ) : null}
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-amber-800">
                Hãng xe
              </label>
              <input
                className={inputClassName}
                value={vehicleBrand}
                onChange={(e) => setVehicleBrand(e.target.value)}
                placeholder="VD: Tamiya"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-amber-800">
                Hạng xe
              </label>
              <input
                className={inputClassName}
                value={vehicleClass}
                onChange={(e) => setVehicleClass(e.target.value)}
                placeholder="VD: Stock, Open, Modified"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-amber-800">
                Ghi chú
              </label>
              <input
                className={inputClassName}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ghi chú thêm (nếu có)"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              className="rounded-xl bg-amber-600 font-bold text-white hover:bg-amber-700"
              disabled={!isNameValid || updateMutation.isPending}
              onClick={() => updateMutation.mutate()}
            >
              {updateMutation.isPending ? "Đang lưu..." : "Lưu thay đổi"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="rounded-xl border-amber-300 bg-white font-bold text-amber-800 hover:bg-amber-100"
              disabled={updateMutation.isPending}
              onClick={() => setEditing(false)}
            >
              Hủy
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 grid gap-3 text-sm text-amber-900 sm:grid-cols-2 xl:grid-cols-4">
          <p>
            <span className="font-semibold">Tên xe:</span>{" "}
            {declaration.vehicle_name ?? "--"}
          </p>
          <p>
            <span className="font-semibold">Hãng xe:</span>{" "}
            {declaration.vehicle_brand ?? "--"}
          </p>
          <p>
            <span className="font-semibold">Hạng xe:</span>{" "}
            {declaration.vehicle_class ?? "--"}
          </p>
          <p>
            <span className="font-semibold">Ghi chú:</span>{" "}
            {declaration.notes ?? "--"}
          </p>
        </div>
      )}
    </section>
  )
}

// ─── Metric ───────────────────────────────────────────────────────────────────
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="flex-1 text-xs font-bold uppercase tracking-wide text-slate-400 leading-snug">
        {label}
      </p>
      <p className="mt-2 text-2xl font-black text-slate-950">{value}</p>
    </div>
  )
}

// ─── InfoTile ─────────────────────────────────────────────────────────────────
function InfoTile({
  label,
  value,
  icon,
}: {
  label: string
  value: string
  icon?: ReactNode
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <div className="mt-1 flex items-center gap-2">
        {icon}
        <p className="text-sm font-bold text-slate-900">{value}</p>
      </div>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getErrorMessage(error: unknown) {
  const maybe = error as { response?: { data?: { message?: string } } }
  return maybe.response?.data?.message ?? "Vui lòng thử lại."
}
