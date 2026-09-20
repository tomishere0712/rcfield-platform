import { ArrowRight, Layers, Loader2, MapPin, Tag } from "lucide-react"
import type { BookingMode } from "@/features/booking/data/booking-options"
import type { CustomerPlayMode, CheckoutStep, PaymentComponentLine } from "@/features/customer-booking/data/customer-booking-demo"
import type { Cafe, Vehicle } from "@/shared/data/explore-data"
import type { TrackConfig } from "@/features/cafes/types"
import { Button } from "@/shared/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/shared/ui/card"
import { Separator } from "@/shared/ui/separator"
import { formatCurrency } from "@/shared/lib/format"
import { Badge } from "@/shared/ui/badge"

type CheckoutSummaryCardProps = {
  cafe: Cafe
  mode: BookingMode
  playMode: CustomerPlayMode
  date: string
  time: string
  selectedVehicles?: Vehicle[]
  components: PaymentComponentLine[]
  currentStep: CheckoutStep
  onNext: () => void
  onBack: () => void
  onConfirmPayment?: () => void
  /**
   * Ẩn hẳn khối nút hành động.
   *
   * Dùng khi đơn đã rời khỏi tay khách — đang chờ tiền chuyển khoản hoặc đã
   * thanh toán xong. Để nút "Xác nhận thanh toán" nằm đó cạnh màn hình báo
   * thành công vừa mâu thuẫn vừa nguy hiểm: bấm nhầm là mở thêm một phiên
   * thanh toán nữa.
   */
  hideActions?: boolean
  isSubmitting?: boolean
  isNextDisabled?: boolean
  selectedTrackConfig?: TrackConfig | null
  pricingLabel?: string | null
  slotMultiplier?: number
  discountAmount?: number
  promoCode?: string | null
  isPayLater?: boolean
}

export function CheckoutSummaryCard({
  cafe,
  mode,
  playMode,
  date,
  time,
  selectedVehicles,
  components,
  currentStep,
  onNext,
  onBack,
  onConfirmPayment,
  hideActions = false,
  isSubmitting = false,
  isNextDisabled = false,
  selectedTrackConfig,
  pricingLabel,
  slotMultiplier,
  discountAmount = 0,
  promoCode,
  isPayLater = false,
}: CheckoutSummaryCardProps) {
  const subtotal = components.reduce((sum, item) => sum + item.amount, 0)
  const total = Math.max(0, subtotal - discountAmount)
  const isFirstStep = currentStep === "track"
  const isPaymentStep = currentStep === "payment"

  return (
    <Card className="sticky top-20 rounded-xl shadow-sm">
      <CardHeader>
        <CardTitle>Tóm tắt đơn đặt</CardTitle>
        <p className="text-sm text-muted-foreground">
          {hideActions
            ? "Giá đã được chốt cho đơn này."
            : "Giá sẽ được chốt tại thời điểm thanh toán."}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-3">
          <img src={cafe.image} alt={cafe.name} className="h-16 w-16 rounded-lg object-cover" />
          <div className="min-w-0">
            <p className="truncate font-semibold">{cafe.name}</p>
            <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3" /> {cafe.district}, {cafe.city}
            </p>
          </div>
        </div>

        <Separator />

        <div className="grid gap-2 text-sm">
          {selectedTrackConfig && (
            <div className="flex items-center gap-2 rounded-lg bg-orange-50 px-3 py-2">
              <Layers className="size-3.5 shrink-0 text-orange-600" />
              <span className="text-xs font-medium text-orange-800">
                {selectedTrackConfig.track_type?.name ?? "Loại sân đã chọn"}
              </span>
            </div>
          )}
          <Line label="Loại đặt lịch" value={getModeLabel(mode)} />
          <Line label="Hình thức" value={getPlayModeLabel(playMode)} />
          <Line label="Ngày" value={new Date(date).toLocaleDateString("vi-VN")} />
          <Line label="Giờ" value={time} />
          {pricingLabel && slotMultiplier && slotMultiplier > 1 && (
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground">Phụ thu</span>
              <Badge className="rounded-full bg-amber-100 text-amber-800 border-amber-200 text-xs font-medium">
                {pricingLabel} ×{slotMultiplier}
              </Badge>
            </div>
          )}
          <Line
            label="Xe thuê"
            value={
              !selectedVehicles || selectedVehicles.length === 0
                ? "Chưa chọn"
                : selectedVehicles.length === 1
                ? selectedVehicles[0].name
                : `${selectedVehicles.length} xe`
            }
          />
        </div>

        <Separator />

        <div className="space-y-2">
          {components.map((component) => (
            <div key={component.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground">{component.label}</span>
              <span className="font-medium">{formatCurrency(component.amount)}</span>
            </div>
          ))}
        </div>

        {discountAmount > 0 && promoCode && (
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-1.5 text-emerald-600">
              <Tag className="size-3.5" />
              {promoCode}
            </span>
            <span className="font-medium text-emerald-600">−{formatCurrency(discountAmount)}</span>
          </div>
        )}

        <div className="rounded-lg bg-muted p-3">
          <div className="flex items-center justify-between">
            <span className="font-semibold">Tổng thanh toán</span>
            <span className="text-xl font-semibold">{formatCurrency(total)}</span>
          </div>
        </div>


      </CardContent>
      {hideActions ? null : (
      <CardFooter className="grid gap-2">
        <Button
          type="button"
          disabled={isSubmitting || isNextDisabled}
          onClick={() => {
            if (isPaymentStep) {
              onConfirmPayment?.()
              return
            }
            onNext()
          }}
          className="w-full"
        >
          {isSubmitting ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Đang xử lý...</>
          ) : (
            <>
              {isPaymentStep
                ? isPayLater
                  ? "Xác nhận giữ chỗ (Thanh toán sau)"
                  : "Xác nhận thanh toán"
                : "Tiếp tục"}
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </Button>
        {!isFirstStep && (
          <Button type="button" variant="ghost" onClick={onBack} className="w-full">
            Quay lại bước trước
          </Button>
        )}
      </CardFooter>
      )}
    </Card>
  )
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate text-right font-medium">{value}</span>
    </div>
  )
}

function getModeLabel(mode: BookingMode) {
  if (mode === "slotPackage") return "Gói slot"
  if (mode === "recurring") return "Định kỳ"
  return "Đơn lẻ"
}

function getPlayModeLabel(playMode: string) {
  if (playMode === "RENTAL") return "Thuê xe"
  if (playMode === "BYOC") return "Mang xe riêng"
  return playMode
}
