import { useState, useMemo } from "react"
import { Banknote, CheckCircle2, Loader2, Play, User, Phone, MapPin, Tag, X } from "lucide-react"
import { formatCurrency } from "@/shared/lib/format"

export interface WalkInCashConfirmationModalProps {
  isOpen: boolean
  customerName: string
  customerPhone: string
  playMode: "RENTAL" | "BYOC"
  trackName: string
  slotCount: number
  slotFeeTotal: number
  vehicleCount: number
  rentalFeeTotal: number
  fnbTotalAmount: number
  totalAmount: number
  isSubmitting: boolean
  autoCheckIn: boolean
  onConfirm: () => void
  onClose: () => void
}

export function WalkInCashConfirmationModal({
  isOpen,
  customerName,
  customerPhone,
  playMode,
  trackName,
  slotCount,
  slotFeeTotal,
  vehicleCount,
  rentalFeeTotal,
  fnbTotalAmount,
  totalAmount,
  isSubmitting,
  autoCheckIn,
  onConfirm,
  onClose,
}: WalkInCashConfirmationModalProps) {
  const [receivedInput, setReceivedInput] = useState<string>("")

  const receivedAmount = useMemo(() => {
    if (!receivedInput) return totalAmount
    const val = Number(receivedInput.replace(/\D/g, ""))
    return isNaN(val) ? totalAmount : val
  }, [receivedInput, totalAmount])

  const changeAmount = Math.max(0, receivedAmount - totalAmount)
  const isUnderpaid = receivedAmount < totalAmount

  if (!isOpen) return null

  const quickDenominations = [
    { label: "Đúng số tiền", value: totalAmount },
    { label: "100.000đ", value: 100000 },
    { label: "200.000đ", value: 200000 },
    { label: "500.000đ", value: 500000 },
  ].filter((d) => d.value >= totalAmount || d.label === "Đúng số tiền")

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
        onClick={isSubmitting ? undefined : onClose}
      />

      {/* Modal Card */}
      <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl transition-all border border-slate-100 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="border-b border-slate-100 bg-gradient-to-r from-emerald-50 via-teal-50/40 to-white px-6 py-4.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
              <Banknote className="size-6" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900">
                Xác nhận thu tiền mặt tại quầy
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Vui lòng thu đủ tiền mặt trước khi tạo đơn
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-slate-600 transition-colors disabled:opacity-40"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Body (Scrollable) */}
        <div className="overflow-y-auto p-6 space-y-4 text-xs">
          {/* Customer Info Card */}
          <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-bold text-slate-900 text-sm">
                <User className="size-4 text-emerald-600" />
                {customerName}
              </span>
              {customerPhone && (
                <span className="flex items-center gap-1 font-semibold text-slate-600">
                  <Phone className="size-3 text-slate-400" />
                  {customerPhone}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-600 pt-1 border-t border-slate-200/60 text-[11px]">
              <span className="flex items-center gap-1">
                <MapPin className="size-3 text-slate-400" />
                {trackName}
              </span>
              <span className="flex items-center gap-1 font-medium">
                <Tag className="size-3 text-slate-400" />
                {playMode === "BYOC" ? "Mang xe cá nhân" : `Thuê ${vehicleCount} xe`}
              </span>
            </div>
          </div>

          {/* Breakdown */}
          <div className="rounded-xl border border-slate-100 bg-white p-3.5 space-y-2 text-slate-600">
            <div className="flex justify-between">
              <span>Phí sân ({slotCount} slot):</span>
              <span className="font-semibold text-slate-900">{formatCurrency(slotFeeTotal)}</span>
            </div>
            {playMode !== "BYOC" && (
              <div className="flex justify-between">
                <span>Phí thuê xe ({vehicleCount} xe):</span>
                <span className="font-semibold text-slate-900">{formatCurrency(rentalFeeTotal)}</span>
              </div>
            )}
            {fnbTotalAmount > 0 && (
              <div className="flex justify-between">
                <span>Đồ ăn & Nước uống:</span>
                <span className="font-semibold text-slate-900">{formatCurrency(fnbTotalAmount)}</span>
              </div>
            )}
          </div>

          {/* Total Amount Callout */}
          <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50/70 p-4 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-900">
                Tổng tiền mặt cần thu:
              </span>
              <p className="text-[11px] text-emerald-700 font-medium">
                Phương thức: Tiền mặt tại quầy (CASH)
              </p>
            </div>
            <span className="text-2xl font-black text-emerald-700">
              {formatCurrency(totalAmount)}
            </span>
          </div>

          {/* Cash Change Calculator */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800">
                Tiền khách đưa (VNĐ):
              </label>
              <div className="flex items-center gap-1.5 flex-wrap justify-end">
                {quickDenominations.map((d, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setReceivedInput(d.value.toLocaleString("vi-VN"))}
                    className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold text-slate-600 hover:border-emerald-500 hover:text-emerald-700 transition-colors"
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="relative">
              <input
                type="text"
                inputMode="numeric"
                placeholder={totalAmount.toLocaleString("vi-VN")}
                value={receivedInput}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, "")
                  setReceivedInput(digits ? Number(digits).toLocaleString("vi-VN") : "")
                }}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base font-bold text-slate-900 outline-hidden focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
              />
            </div>

            <div className="flex items-center justify-between pt-1 text-xs">
              <span className="font-semibold text-slate-600">Tiền thối lại cho khách:</span>
              <span
                className={`text-base font-black ${
                  isUnderpaid ? "text-red-500" : "text-emerald-600"
                }`}
              >
                {isUnderpaid ? "Chưa nhận đủ tiền" : formatCurrency(changeAmount)}
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 bg-slate-50/80 px-6 py-4 flex flex-col-reverse sm:flex-row items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="w-full sm:w-auto rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            Hủy bỏ / Quay lại
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={isSubmitting}
            className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-md hover:bg-emerald-700 transition-all disabled:opacity-50 cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                <span>Đang tạo đơn...</span>
              </>
            ) : autoCheckIn ? (
              <>
                <Play className="size-4 fill-current" />
                <span>Đã thu tiền & Bắt đầu nhận xe</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="size-4" />
                <span>Đã thu tiền & Lưu lịch</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
