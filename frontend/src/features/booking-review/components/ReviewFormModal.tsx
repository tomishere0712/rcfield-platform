import { useState } from "react"
import { X, ArrowLeft } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { StarRating } from "./StarRating"
import { useSubmitReview } from "../hooks/useSubmitReview"
import type { PendingBookingReview } from "../types"

interface ReviewFormModalProps {
  booking: PendingBookingReview
  onClose: () => void
  onSubmitted: () => void
}

export function ReviewFormModal({ booking, onClose, onSubmitted }: ReviewFormModalProps) {
  const [overallScore, setOverallScore] = useState(0)
  const [vehicleScore, setVehicleScore] = useState(0)
  const [staffScore, setStaffScore] = useState(0)
  const [facilityScore, setFacilityScore] = useState(0)
  const [note, setNote] = useState("")
  const [expired, setExpired] = useState(false)

  const { mutate, isPending } = useSubmitReview()
  const isByoc = booking.playMode === "BYOC"

  const handleSubmit = () => {
    if (!overallScore) return
    mutate(
      {
        booking_id: booking.bookingId,
        overall_score: overallScore,
        vehicle_score: isByoc ? null : vehicleScore || null,
        staff_score: staffScore || null,
        facility_score: facilityScore || null,
        note: note.trim() || null,
      },
      {
        onSuccess: onSubmitted,
        onError: (err: unknown) => {
          if ((err as { response?: { data?: { code?: string } } })?.response?.data?.code === "REVIEW_PERIOD_EXPIRED") {
            setExpired(true)
          }
        },
      },
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
      <div className="w-full max-w-md rounded-t-2xl bg-white px-6 py-6 shadow-xl sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">Đánh giá trải nghiệm</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mb-4 text-sm text-slate-500">{booking.cafeName}</p>

        {expired ? (
          <div className="space-y-4">
            <p className="text-sm text-red-600">Thời hạn đánh giá đã hết (5 ngày)</p>
            <Button variant="outline" className="w-full" onClick={onClose}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Quay lại
            </Button>
          </div>
        ) : (
          <div className="space-y-5">
            <div>
              <p className="mb-2 text-sm font-medium text-slate-700">Tổng thể *</p>
              <StarRating value={overallScore} onChange={setOverallScore} size="lg" />
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-slate-700">Nhân viên</p>
              <StarRating value={staffScore} onChange={setStaffScore} />
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-slate-700">Cơ sở vật chất</p>
              <StarRating value={facilityScore} onChange={setFacilityScore} />
            </div>

            {!isByoc && (
              <div>
                <p className="mb-2 text-sm font-medium text-slate-700">Chất lượng xe</p>
                <StarRating value={vehicleScore} onChange={setVehicleScore} />
              </div>
            )}

            <div>
              <p className="mb-2 text-sm font-medium text-slate-700">Nhận xét</p>
              <textarea
                className="w-full resize-none rounded-lg border border-slate-200 p-3 text-sm outline-none focus:border-blue-400"
                rows={3}
                maxLength={500}
                placeholder="Chia sẻ trải nghiệm của bạn..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <p className="mt-1 text-right text-xs text-slate-400">{note.length}/500</p>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={onClose} disabled={isPending}>
                Hủy
              </Button>
              <Button
                className="flex-1"
                onClick={handleSubmit}
                disabled={isPending || !overallScore}
              >
                {isPending ? "Đang gửi..." : "Gửi đánh giá"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
