import { useEffect, useState } from "react"
import { useSearchParams } from "react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Banknote,
  Check,
  Clock,
  CreditCard,
  Sparkles,
  TriangleAlert,
} from "lucide-react"
import { toast } from "sonner"

import {
  contestApi,
  contestQueryKeys,
} from "@/features/contests/api/contest.api"
import { getErrorMessage } from "@/features/contests/lib/contest-runtime"
import type {
  ContestFeeOrder,
  ContestFeePlan,
  ContestItem,
} from "@/features/contests/types"
import {
  Panel,
  PanelTitle,
} from "@/pages/provider/components/ProviderPrimitives"
import { cn } from "@/shared/lib/utils"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Label } from "@/shared/ui/label"

/** Thông tin nhận tiền của nền tảng, hiện cho provider chuyển khoản. */
const BANK_INFO = {
  bank: "Vietcombank",
  account: "1027 3648 291",
  holder: "CONG TY RCFIELD VIET NAM",
}

function formatVnd(value: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value)
}

/**
 * Phí tổ chức giải trên màn vận hành.
 *
 * Hiện suốt vòng đời đơn: chọn gói → chuyển khoản → chờ đối soát → đã trả. Ẩn
 * hẳn khi đã trả và giải đã rời bản nháp, để khỏi chiếm chỗ ở màn tổng quan khi
 * việc đã xong.
 */
export function ContestFeePanel({
  contest,
  action,
}: {
  contest: ContestItem
  action?: React.ReactNode
}) {
  const queryClient = useQueryClient()
  const feeQuery = useQuery({
    queryKey: contestQueryKeys.fee(contest.id),
    queryFn: () => contestApi.getContestFeeStatus(contest.id),
  })

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: contestQueryKeys.fee(contest.id),
      }),
      queryClient.invalidateQueries({
        queryKey: contestQueryKeys.detail(contest.id),
      }),
    ])
  }

  const createOrder = useMutation({
    mutationFn: (planId: string) =>
      contestApi.createContestFeeOrder(contest.id, planId),
    onSuccess: invalidate,
  })
  const cancelOrder = useMutation({
    mutationFn: () => contestApi.cancelContestFeeOrder(contest.id),
    onSuccess: invalidate,
  })
  const submitTransfer = useMutation({
    mutationFn: (body: {
      transfer_reference: string
      transfer_date: string
      transfer_amount: number
    }) => contestApi.submitContestFeeTransfer(contest.id, body),
    onSuccess: invalidate,
  })
  const payOS = useMutation({
    mutationFn: () => contestApi.createContestFeePayOSLink(contest.id),
  })

  // PayOS chuyển hướng về đây kèm ?payos=success&orderCode=… Hỏi thẳng cổng
  // thay vì ngồi đợi webhook: webhook có thể tới chậm hoặc rớt, mà provider thì
  // đang nhìn màn hình chờ kết quả.
  const [searchParams, setSearchParams] = useSearchParams()
  const payosResult = searchParams.get("payos")
  const payosOrderCode = searchParams.get("orderCode")

  useEffect(() => {
    if (!payosResult || !payosOrderCode) return

    const clearParams = () => {
      const next = new URLSearchParams(searchParams)
      next.delete("payos")
      next.delete("orderCode")
      setSearchParams(next, { replace: true })
    }

    if (payosResult === "cancel") {
      toast.info("Bạn đã huỷ thanh toán", {
        description: "Đơn phí vẫn còn, trả lại hoặc chuyển khoản tay đều được.",
      })
      clearParams()
      return
    }

    contestApi
      .verifyContestFeePayOS(contest.id, Number(payosOrderCode))
      .then(async (result) => {
        await invalidate()
        if (result.status === "PAID") {
          toast.success("Đã thanh toán phí tổ chức giải")
        } else {
          toast.info("Chưa nhận được xác nhận từ PayOS", {
            description: "Nếu bạn đã trả tiền, đợi một lát rồi tải lại trang.",
          })
        }
      })
      .catch((error) => {
        toast.error("Không kiểm tra được kết quả thanh toán", {
          description: getErrorMessage(error).message,
        })
      })
      .finally(clearParams)
    // Chỉ chạy lại khi mã đơn đổi — thêm `invalidate`/`searchParams` vào đây sẽ
    // khiến effect bắn liên tục vì chúng được tạo mới mỗi lần render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contest.id, payosResult, payosOrderCode])

  const order = feeQuery.data?.order ?? null
  const plans = feeQuery.data?.plans ?? []

  // Đã trả xong và giải đã mở thì việc này khép lại, không cần chiếm chỗ nữa.
  if (order?.status === "PAID" && contest.status !== "DRAFT") return null
  if (feeQuery.isLoading) {
    return <div className="h-40 animate-pulse rounded-xl bg-[#f6f3f2]" />
  }

  return (
    <Panel>
      <PanelTitle
        title="Phí tổ chức giải"
        subtitle="Tính theo từng giải, tách riêng khỏi gói đăng ký hằng tháng. Trả phí xong mới mở đăng ký được."
        action={action}
      />

      {!order || order.status === "REJECTED" || order.status === "CANCELLED" ? (
        <PlanPicker
          plans={plans}
          rejectedNote={order?.status === "REJECTED" ? order.admin_notes : null}
          pending={createOrder.isPending}
          onPick={async (planId) => {
            try {
              await createOrder.mutateAsync(planId)
              toast.success("Đã chọn gói tổ chức")
            } catch (error) {
              toast.error("Không chọn được gói", {
                description: getErrorMessage(error).message,
              })
            }
          }}
        />
      ) : null}

      {order?.status === "PENDING_PAYMENT" ? (
        <TransferForm
          order={order}
          pending={submitTransfer.isPending}
          payosPending={payOS.isPending}
          onPayOS={async () => {
            try {
              const link = await payOS.mutateAsync()
              window.location.href = link.checkout_url
            } catch (error) {
              toast.error("Không mở được cổng thanh toán", {
                description: getErrorMessage(error).message,
              })
            }
          }}
          onCancel={async () => {
            try {
              await cancelOrder.mutateAsync()
              toast.success("Đã huỷ đơn, bạn chọn gói khác được")
            } catch (error) {
              toast.error("Không huỷ được đơn", {
                description: getErrorMessage(error).message,
              })
            }
          }}
          onSubmit={async (body) => {
            try {
              await submitTransfer.mutateAsync(body)
              toast.success("Đã gửi thông tin chuyển khoản")
            } catch (error) {
              toast.error("Không gửi được thông tin", {
                description: getErrorMessage(error).message,
              })
            }
          }}
        />
      ) : null}

      {order?.status === "PENDING_REVIEW" ? (
        <StatusBlock
          tone="waiting"
          icon={<Clock className="size-4" />}
          title="Đang chờ RCField đối soát"
          body={`Đã ghi nhận chuyển khoản ${order.transfer_reference}. Chúng tôi đối soát trong giờ hành chính; xong là giải mở đăng ký được ngay.`}
        />
      ) : null}

      {order?.status === "PAID" ? (
        <StatusBlock
          tone="done"
          icon={<Check className="size-4" />}
          title={`Đã thanh toán ${formatVnd(order.amount)}`}
          body={
            order.featured_days > 0
              ? `Giải sẵn sàng mở đăng ký. Suất ${order.featured_days} ngày trên trang chủ đang chờ RCField duyệt nội dung.`
              : "Giải đã sẵn sàng mở đăng ký."
          }
        />
      ) : null}
    </Panel>
  )
}

function PlanPicker({
  plans,
  rejectedNote,
  pending,
  onPick,
}: {
  plans: ContestFeePlan[]
  rejectedNote: string | null
  pending: boolean
  onPick: (planId: string) => void
}) {
  return (
    <div className="space-y-3">
      {rejectedNote ? (
        <StatusBlock
          tone="warn"
          icon={<TriangleAlert className="size-4" />}
          title="Lần chuyển khoản trước chưa được xác nhận"
          body={`${rejectedNote} — bạn chọn lại gói và khai báo lại nhé.`}
        />
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className="rounded-xl border border-[#e5e2e1] bg-white p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-extrabold text-[#1c1b1b]">
                {plan.name}
              </p>
              {plan.featured_days > 0 ? (
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-black text-orange-700">
                  <Sparkles className="size-3" />
                  {plan.featured_days} ngày trang chủ
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-xl font-black text-[#1c1b1b]">
              {formatVnd(plan.price)}
            </p>
            {plan.description ? (
              <p className="mt-2 text-xs font-semibold leading-6 text-[#5d5f5f]">
                {plan.description}
              </p>
            ) : null}
            <Button
              className="mt-3 h-9 w-full rounded-lg bg-[#1c1b1b] text-xs font-bold text-white hover:bg-[#313030]"
              disabled={pending}
              onClick={() => onPick(plan.id)}
            >
              Chọn gói này
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}

function TransferForm({
  order,
  pending,
  onSubmit,
  onCancel,
  onPayOS,
  payosPending,
}: {
  order: ContestFeeOrder
  pending: boolean
  onSubmit: (body: {
    transfer_reference: string
    transfer_date: string
    transfer_amount: number
  }) => void
  onCancel: () => void
  onPayOS: () => void
  payosPending: boolean
}) {
  const [method, setMethod] = useState<"PAYOS" | "TRANSFER">("PAYOS")
  const [reference, setReference] = useState("")
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const transferNote = `RCFIELD ${order.id.slice(0, 8).toUpperCase()}`

  return (
    <div className="space-y-4">
      {/*
        Hai cách trả tiền là một lựa chọn, không phải hai việc phải làm. Bày cả
        số tài khoản lẫn ô nhập mã giao dịch ngay cạnh nút trả online khiến
        provider tưởng phải làm cả hai, hoặc chuyển khoản xong vẫn bấm nhầm nút
        cổng. Chọn xong mới hiện phần tương ứng.
      */}
      <div className="grid gap-2 sm:grid-cols-2">
        <MethodOption
          active={method === "PAYOS"}
          icon={<CreditCard className="size-4" />}
          title="Thanh toán online"
          hint="Qua cổng PayOS, xác nhận ngay"
          onSelect={() => setMethod("PAYOS")}
        />
        <MethodOption
          active={method === "TRANSFER"}
          icon={<Banknote className="size-4" />}
          title="Chuyển khoản tay"
          hint="RCField đối soát rồi duyệt"
          onSelect={() => setMethod("TRANSFER")}
        />
      </div>

      {method === "PAYOS" ? (
        <div className="rounded-xl border border-orange-200 bg-orange-50/60 p-4">
          <p className="text-sm font-semibold text-[#5d5f5f]">
            Bấm nút bên dưới để mở cổng PayOS. Trả xong là phí được ghi nhận
            ngay, không phải chờ RCField đối soát.
          </p>
          <Button
            className="mt-3 h-10 w-full rounded-lg bg-orange-600 px-5 text-sm font-bold text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            disabled={payosPending}
            onClick={onPayOS}
          >
            <CreditCard className="mr-1.5 size-4" />
            {payosPending
              ? "Đang mở cổng…"
              : `Trả ${formatVnd(order.amount)} qua PayOS`}
          </Button>
          <Button
            variant="ghost"
            className="mt-3 h-10 rounded-lg text-xs font-bold text-[#747878] sm:ml-2"
            onClick={onCancel}
          >
            Đổi gói khác
          </Button>
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-[#e5e2e1] bg-[#fcf8f8] p-4">
            <p className="text-xs font-extrabold uppercase tracking-wider text-[#747878]">
              Chuyển khoản tới
            </p>
            <div className="mt-2 space-y-1 text-sm font-semibold text-[#1c1b1b]">
              <p>
                {BANK_INFO.bank} ·{" "}
                <span className="font-black">{BANK_INFO.account}</span>
              </p>
              <p>{BANK_INFO.holder}</p>
              <p>
                Số tiền:{" "}
                <span className="font-black text-orange-700">
                  {formatVnd(order.amount)}
                </span>
              </p>
              <p>
                Nội dung: <span className="font-black">{transferNote}</span>
              </p>
            </div>
            <p className="mt-2 text-xs font-semibold text-[#747878]">
              Ghi đúng nội dung giúp RCField đối soát nhanh hơn.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-extrabold uppercase tracking-wider text-[#747878]">
                Mã giao dịch / nội dung đã chuyển
              </Label>
              <Input
                value={reference}
                placeholder="Ví dụ: FT26080412345"
                onChange={(event) => setReference(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-extrabold uppercase tracking-wider text-[#747878]">
                Ngày chuyển
              </Label>
              <Input
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              className="h-10 rounded-lg bg-orange-600 px-5 text-sm font-bold text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={pending || reference.trim().length < 3}
              onClick={() =>
                onSubmit({
                  transfer_reference: reference.trim(),
                  transfer_date: date,
                  // Gửi đúng số tiền của đơn: provider chuyển thiếu thì admin phát
                  // hiện lúc đối soát, không phải tin vào con số họ tự gõ.
                  transfer_amount: order.amount,
                })
              }
            >
              Tôi đã chuyển khoản
            </Button>
            <Button
              variant="ghost"
              className="h-10 rounded-lg text-xs font-bold text-[#747878]"
              onClick={onCancel}
            >
              Đổi gói khác
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

function MethodOption({
  active,
  icon,
  title,
  hint,
  onSelect,
}: {
  active: boolean
  icon: React.ReactNode
  title: string
  hint: string
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={cn(
        "flex items-start gap-3 rounded-xl border p-3 text-left transition",
        active
          ? "border-orange-500 bg-orange-50/60 ring-1 ring-orange-200"
          : "border-[#e5e2e1] bg-white hover:border-[#b0b4b4]",
      )}
    >
      <span
        className={active ? "mt-0.5 text-orange-600" : "mt-0.5 text-[#a3a3a3]"}
      >
        {icon}
      </span>
      <span>
        <span className="block text-sm font-black text-[#1c1b1b]">{title}</span>
        <span className="block text-xs font-semibold text-[#747878]">
          {hint}
        </span>
      </span>
    </button>
  )
}

function StatusBlock({
  tone,
  icon,
  title,
  body,
}: {
  tone: "waiting" | "done" | "warn"
  icon: React.ReactNode
  title: string
  body: string
}) {
  return (
    <div
      className={cn(
        "flex gap-3 rounded-xl border p-4",
        tone === "done"
          ? "border-emerald-200 bg-emerald-50"
          : tone === "warn"
            ? "border-red-200 bg-red-50"
            : "border-amber-200 bg-amber-50",
      )}
    >
      <span
        className={cn(
          "mt-0.5 shrink-0",
          tone === "done"
            ? "text-emerald-700"
            : tone === "warn"
              ? "text-red-700"
              : "text-amber-700",
        )}
      >
        {icon}
      </span>
      <div>
        <p
          className={cn(
            "text-sm font-extrabold",
            tone === "done"
              ? "text-emerald-900"
              : tone === "warn"
                ? "text-red-900"
                : "text-amber-900",
          )}
        >
          {title}
        </p>
        <p className="mt-1 text-xs font-semibold leading-6 text-[#5d5f5f]">
          {body}
        </p>
      </div>
    </div>
  )
}
