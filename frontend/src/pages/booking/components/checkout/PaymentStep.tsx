import { useQuery } from "@tanstack/react-query"
import { Building2, CheckCircle2, QrCode, Zap } from "lucide-react"
import type { CustomerPaymentMethod } from "@/features/customer-booking/data/customer-booking-demo"
import type { CafePaymentMethodOption } from "@/features/booking/types/booking.types"
import {
  bankPaymentApi,
  bankPaymentQueryKeys,
} from "@/features/payments/api/bank-payment.api"
import { Badge } from "@/shared/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card"
import { cn } from "@/shared/lib/utils"
import type { AppliedPromo } from "./PromoCodeInput"
import { PromoCodeInput } from "./PromoCodeInput"

type PaymentStepProps = {
  paymentMethod: CustomerPaymentMethod
  onPaymentMethodChange: (method: CustomerPaymentMethod) => void
  selectedPackageId?: string | null
  cafeId?: string
  playMode?: "RENTAL" | "BYOC"
  slotStart?: string
  subtotal?: number
  appliedPromo?: AppliedPromo | null
  onPromoApply?: (promo: AppliedPromo | null) => void
  slotsNeeded?: number
  onPackageSelect?: (id: string | null) => void
  onMockPayment?: () => void
  /** Phương thức khách đang chọn. Chỉ hiện lựa chọn khi chi nhánh có từ 2 cách. */
  selectedMethod?: CafePaymentMethodOption
  onMethodChange?: (method: CafePaymentMethodOption) => void
}

const isSandbox = import.meta.env.DEV

export function PaymentStep({
  selectedPackageId,
  cafeId,
  playMode,
  slotStart,
  subtotal,
  appliedPromo,
  onPromoApply,
  onMockPayment,
  selectedMethod = "vnpay",
  onMethodChange,
}: PaymentStepProps) {
  // Chi nhánh chưa cấu hình gì thì chỉ có VNPay — và khi chỉ có một cách,
  // không hiện phần chọn để khỏi bắt khách quyết định một thứ không có lựa chọn.
  const { data: methods = ["vnpay" as const] } = useQuery({
    queryKey: bankPaymentQueryKeys.methods(cafeId),
    queryFn: () => bankPaymentApi.listPaymentMethods(cafeId!),
    enabled: Boolean(cafeId),
  })

  const isBankTransferSupported = methods.includes("bank_transfer")
  const showPromoInput =
    !selectedPackageId && cafeId && playMode && slotStart && subtotal !== undefined && onPromoApply

  return (
    <div className="space-y-4">
      {selectedPackageId && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          <span className="font-semibold">Gói slot đã được áp dụng — phí slot = 0</span>
        </div>
      )}

      {showPromoInput && (
        <Card className="rounded-xl shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Mã ưu đãi</CardTitle>
          </CardHeader>
          <CardContent>
            <PromoCodeInput
              cafeId={cafeId}
              playMode={playMode}
              slotStart={slotStart}
              subtotal={subtotal!}
              appliedPromo={appliedPromo ?? null}
              onApply={onPromoApply}
            />
          </CardContent>
        </Card>
      )}

      <Card className="rounded-xl shadow-sm">
        <CardHeader>
          <CardTitle>Phương thức thanh toán</CardTitle>
          <p className="text-sm text-muted-foreground">
            Chọn hình thức bạn muốn hoàn tất thanh toán cho đơn đặt lịch này.
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <MethodOption
              icon={QrCode}
              title="VNPay"
              description="Thẻ ngân hàng, ví điện tử hoặc QR VNPay"
              selected={selectedMethod === "vnpay"}
              onSelect={() => onMethodChange?.("vnpay")}
              badge={isSandbox ? "Sandbox" : undefined}
            />
            {isBankTransferSupported && (
              <MethodOption
                icon={Building2}
                title="Chuyển khoản ngân hàng"
                description="Quét mã và chuyển thẳng cho quán, đơn tự xác nhận khi tiền về"
                selected={selectedMethod === "bank_transfer"}
                onSelect={() => onMethodChange?.("bank_transfer")}
              />
            )}
          </div>

          {isSandbox && onMockPayment && (
            <button
              type="button"
              onClick={onMockPayment}
              className="mt-4 w-full flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-violet-300 bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-700 hover:bg-violet-100 transition-colors"
            >
              <Zap className="h-4 w-4" />
              Mock thanh toán thành công (DEV)
            </button>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

/**
 * Một lựa chọn phương thức thanh toán.
 *
 * Cố ý không chọn sẵn cái nào ở tầng trên: khách phải tự quyết, vì hai cách trả
 * tiền này có hệ quả khác nhau — chuyển khoản là hành động một chiều, tiền đi
 * rồi thì không tự hoàn lại được như cổng thanh toán.
 */
function MethodOption({
  icon: Icon,
  title,
  description,
  selected,
  onSelect,
  badge,
}: {
  icon: typeof QrCode
  title: string
  description: string
  selected: boolean
  onSelect: () => void
  badge?: string
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex w-full items-center gap-4 rounded-xl border-2 p-4 text-left transition",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        selected
          ? "border-primary bg-primary/5"
          : "border-border bg-white hover:border-primary/40",
      )}
    >
      <Icon
        className={cn(
          "h-8 w-8 shrink-0",
          selected ? "text-primary" : "text-muted-foreground",
        )}
      />
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="font-semibold">{title}</span>
          {badge && (
            <Badge
              variant="outline"
              className="border-amber-300 bg-amber-50 text-[10px] text-amber-700"
            >
              {badge}
            </Badge>
          )}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      {selected && <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />}
    </button>
  )
}
