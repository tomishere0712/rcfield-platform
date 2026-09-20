import { useEffect, useMemo, useState } from "react"
import { useForm, useWatch, type Resolver } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Banknote, CreditCard, Loader2 } from "lucide-react"

import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Label } from "@/shared/ui/label"
import { subscriptionApi } from "../api/subscription.api"

/**
 * Hai cách trả tiền gói thuê bao, khác nhau ở chỗ ai xác nhận:
 *
 *   PAYOS    — cổng báo về, hệ thống tự ghi nhận.
 *   TRANSFER — provider chuyển khoản tay rồi khai báo, admin đối soát mới duyệt.
 *
 * Giữ cả hai vì không phải provider nào cũng trả được qua cổng, và khoản chuyển
 * tay vẫn cần một đường vào hệ thống thay vì nhắn tin ngoài luồng.
 */
type PaymentMethod = "PAYOS" | "TRANSFER"

const schema = z.object({
  plan_id: z.string().min(1, "Chọn gói"),
  transfer_reference: z.string().optional(),
  transfer_date: z.string().optional(),
  transfer_amount: z.coerce.number().optional(),
})

type FormValues = z.infer<typeof schema>

interface Props {
  hasPendingRequest: boolean
  onSuccess?: () => void
  selectedPlanId?: string
  onSelectedPlanChange?: (planId: string) => void
}

function todayInputValue() {
  const now = new Date()
  const timezoneOffset = now.getTimezoneOffset() * 60000
  return new Date(now.getTime() - timezoneOffset).toISOString().slice(0, 10)
}

function parseVndInput(value: string) {
  const digits = value.replace(/\D/g, "")
  return digits ? Number(digits) : 0
}

function formatVndInput(value?: number) {
  if (value === undefined || Number.isNaN(value)) return ""
  return `${value.toLocaleString("vi-VN")} đ`
}

function formatVnd(value?: number) {
  if (value === undefined || Number.isNaN(value)) return "0 đ"
  return `${value.toLocaleString("vi-VN")} đ`
}

export function PaymentRequestForm({
  hasPendingRequest,
  onSuccess,
  selectedPlanId,
  onSelectedPlanChange,
}: Props) {
  const qc = useQueryClient()
  const [method, setMethod] = useState<PaymentMethod>("PAYOS")

  const { data: plans = [] } = useQuery({
    queryKey: ["subscription-plans"],
    queryFn: () => subscriptionApi.listSubscriptionPlans(),
  })

  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema) as Resolver<FormValues>,
    defaultValues: {
      plan_id: selectedPlanId ?? "",
      transfer_date: todayInputValue(),
    },
  })

  const watchedPlanId = useWatch({ control, name: "plan_id" })
  const watchedTransferAmount = useWatch({ control, name: "transfer_amount" })
  const activePlanId = selectedPlanId || watchedPlanId
  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.id === activePlanId),
    [activePlanId, plans],
  )

  useEffect(() => {
    if (!selectedPlanId) return
    setValue("plan_id", selectedPlanId, { shouldValidate: true })
  }, [selectedPlanId, setValue])

  // Điền sẵn nội dung và số tiền theo gói đang chọn để provider chỉ việc đối
  // chiếu với biên lai ngân hàng, đỡ gõ sai số.
  useEffect(() => {
    if (!selectedPlan || method !== "TRANSFER") return
    setValue("transfer_amount", selectedPlan.pricePerMonth, {
      shouldValidate: true,
    })
    setValue(
      "transfer_reference",
      `RCFIELD ${selectedPlan.isTrial ? "TRIAL" : "SUBSCRIPTION"} ${selectedPlan.name}`,
      { shouldValidate: true },
    )
    setValue("transfer_date", todayInputValue(), { shouldValidate: true })
  }, [selectedPlan, method, setValue])

  const payosMutation = useMutation({
    mutationFn: (data: FormValues) =>
      subscriptionApi.getPayOSLink({ plan_id: data.plan_id }),
    onSuccess: (res) => {
      if (res.data?.checkoutUrl) {
        toast.success(
          "Tạo link thanh toán thành công! Đang chuyển hướng sang PayOS...",
        )
        window.location.href = res.data.checkoutUrl
      } else {
        toast.error("Không nhận được liên kết thanh toán từ máy chủ")
      }
      qc.invalidateQueries({ queryKey: ["my-payment-requests"] })
      onSuccess?.()
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })
        ?.response?.data?.message
      toast.error(msg ?? "Tạo liên kết thanh toán thất bại")
    },
  })

  const transferMutation = useMutation({
    mutationFn: (data: FormValues) =>
      subscriptionApi.submitPaymentRequest({
        plan_id: data.plan_id,
        transfer_reference: data.transfer_reference!,
        transfer_date: data.transfer_date!,
        transfer_amount: data.transfer_amount!,
      }),
    onSuccess: () => {
      toast.success(
        "Đã gửi yêu cầu thanh toán. Admin sẽ xác nhận trong 1–2 ngày làm việc.",
      )
      reset({ plan_id: "", transfer_date: todayInputValue() })
      qc.invalidateQueries({ queryKey: ["my-payment-requests"] })
      onSuccess?.()
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })
        ?.response?.data?.message
      toast.error(msg ?? "Gửi yêu cầu thất bại")
    },
  })

  const pending = payosMutation.isPending || transferMutation.isPending

  function onSubmit(data: FormValues) {
    if (method === "PAYOS") {
      payosMutation.mutate(data)
      return
    }
    // Ba trường của khoản chuyển tay chỉ bắt buộc khi chọn cách này, nên kiểm ở
    // đây thay vì đặt required trong schema chung.
    if (!data.transfer_reference?.trim()) {
      toast.error("Nhập nội dung chuyển khoản")
      return
    }
    if (
      !data.transfer_date ||
      !/^\d{4}-\d{2}-\d{2}$/.test(data.transfer_date)
    ) {
      toast.error("Chọn ngày chuyển khoản")
      return
    }
    if (!data.transfer_amount || data.transfer_amount <= 0) {
      toast.error("Nhập số tiền đã chuyển")
      return
    }
    transferMutation.mutate(data)
  }

  if (hasPendingRequest) {
    return (
      <div className="rounded-xl border border-yellow-100 bg-yellow-50 px-5 py-4 text-sm font-semibold text-yellow-800">
        Bạn đang có yêu cầu thanh toán chờ xử lý. Vui lòng hoàn tất thanh toán
        hoặc đợi Admin xác nhận trước khi gửi yêu cầu mới.
      </div>
    )
  }

  const methodOptions: {
    value: PaymentMethod
    label: string
    hint: string
    icon: typeof CreditCard
  }[] = [
    {
      value: "PAYOS",
      label: "Thanh toán qua PayOS",
      hint: "Hệ thống ghi nhận ngay khi cổng báo về",
      icon: CreditCard,
    },
    {
      value: "TRANSFER",
      label: "Chuyển khoản thủ công",
      hint: "Chuyển tiền rồi khai báo, Admin đối soát",
      icon: Banknote,
    },
  ]

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <CreditCard className="size-4 text-slate-500" />
        <h3 className="text-sm font-bold text-slate-700">
          Thanh toán đăng ký gói hội viên
        </h3>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {methodOptions.map((option) => {
          const Icon = option.icon
          const active = method === option.value
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => setMethod(option.value)}
              aria-pressed={active}
              className={`flex items-start gap-3 rounded-lg border p-3 text-left transition ${
                active
                  ? "border-[#d92d20] bg-[#fef3f2]"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <Icon
                className={`mt-0.5 size-4 ${active ? "text-[#d92d20]" : "text-slate-400"}`}
              />
              <span>
                <span className="block text-sm font-bold text-slate-700">
                  {option.label}
                </span>
                <span className="block text-[11px] text-slate-500">
                  {option.hint}
                </span>
              </span>
            </button>
          )
        })}
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-1.5">
          <Label className="text-xs font-bold">Gói đăng ký</Label>
          <select
            {...register("plan_id")}
            value={activePlanId}
            onChange={(event) => {
              setValue("plan_id", event.target.value, { shouldValidate: true })
              onSelectedPlanChange?.(event.target.value)
            }}
            className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
          >
            <option value="">-- Chọn gói --</option>
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name} - {plan.pricePerMonth.toLocaleString("vi-VN")}
                đ/tháng
              </option>
            ))}
          </select>
          {errors.plan_id && (
            <p className="text-[11px] font-bold text-red-500">
              {errors.plan_id.message}
            </p>
          )}
        </div>

        {selectedPlan && (
          <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
            <div className="flex items-center justify-between text-sm font-semibold">
              <span className="text-slate-600">Số tiền cần thanh toán:</span>
              <span className="text-lg font-black text-[#d92d20]">
                {formatVnd(selectedPlan.pricePerMonth)}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              {method === "PAYOS"
                ? "Giao dịch được xử lý tự động và cập nhật gói ngay khi cổng báo thành công."
                : "Chuyển khoản tới tài khoản RCField, sau đó khai báo bên dưới để Admin đối soát."}
            </p>
          </div>
        )}

        {method === "TRANSFER" && (
          <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">
                  Nội dung chuyển khoản
                </Label>
                <Input
                  {...register("transfer_reference")}
                  placeholder="VD: RCFIELD SUBSCRIPTION PRO"
                  className="h-9 rounded-lg"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Ngày chuyển khoản</Label>
                <Input
                  type="date"
                  {...register("transfer_date")}
                  className="h-9 rounded-lg"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold">
                Số tiền đã chuyển (VNĐ)
              </Label>
              <input type="hidden" {...register("transfer_amount")} />
              <Input
                inputMode="numeric"
                value={formatVndInput(watchedTransferAmount)}
                onChange={(event) => {
                  setValue(
                    "transfer_amount",
                    parseVndInput(event.target.value),
                    {
                      shouldValidate: true,
                    },
                  )
                }}
                placeholder="299.000 đ"
                className="h-9 rounded-lg"
              />
            </div>
          </>
        )}

        <Button
          type="submit"
          disabled={pending}
          className="h-10 w-full font-bold"
        >
          {pending ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="size-4 animate-spin" />
              {method === "PAYOS"
                ? "Đang chuyển hướng sang PayOS..."
                : "Đang gửi..."}
            </span>
          ) : method === "PAYOS" ? (
            "Thanh toán qua PayOS"
          ) : (
            "Gửi yêu cầu thanh toán"
          )}
        </Button>
      </form>
    </div>
  )
}
