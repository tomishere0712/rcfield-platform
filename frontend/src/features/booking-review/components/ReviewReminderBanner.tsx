import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Star, X, MapPin, Clock } from "lucide-react"
import { useSearchParams } from "react-router"
import { toast } from "sonner"
import { ReviewFormModal } from "./ReviewFormModal"
import { usePendingReviews } from "../hooks/usePendingReviews"
import { useSnoozeReview } from "../hooks/useSnoozeReview"

export function ReviewReminderBanner() {
  const [dismissed, setDismissed] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const openedReviewRequest = useRef<string | null>(null)
  const unavailableReviewRequest = useRef<string | null>(null)
  const snooze = useSnoozeReview()

  const requestedBookingId = searchParams.get("reviewBookingId")
  // Snooze hides automatic reminders only. A customer who explicitly returns
  // through their notification should still be able to submit a review.
  const { data: pending } = usePendingReviews(Boolean(requestedBookingId))
  const booking = requestedBookingId
    ? pending?.find((item) => item.bookingId === requestedBookingId)
    : pending?.[0]

  const clearReviewRequest = useCallback(() => {
    if (!requestedBookingId) return
    const next = new URLSearchParams(searchParams)
    next.delete("reviewBookingId")
    setSearchParams(next, { replace: true })
  }, [requestedBookingId, searchParams, setSearchParams])

  useEffect(() => {
    if (
      requestedBookingId &&
      booking &&
      openedReviewRequest.current !== requestedBookingId
    ) {
      openedReviewRequest.current = requestedBookingId
      setShowForm(true)
    }
  }, [booking, requestedBookingId])

  useEffect(() => {
    if (
      requestedBookingId &&
      pending &&
      !booking &&
      unavailableReviewRequest.current !== requestedBookingId
    ) {
      unavailableReviewRequest.current = requestedBookingId
      toast.info("Không thể mở biểu mẫu đánh giá", {
        description: "Đơn này đã được đánh giá hoặc đã quá thời hạn 5 ngày.",
      })
      // Do not fall through to an unrelated pending review after an expired
      // notification has been acknowledged.
      setDismissed(true)
      clearReviewRequest()
    }
  }, [booking, pending, requestedBookingId, clearReviewRequest])

  if (!booking || dismissed) return null

  const handleSnooze = () => {
    if (snooze.isPending) return
    setDismissed(true)
    setShowForm(false)
    clearReviewRequest()
    snooze.mutate(booking.bookingId, {
      onError: () => setDismissed(false),
    })
  }

  const slotDate = new Date(booking.slotStart)
  const slotEnd = new Date(booking.slotEnd)

  return createPortal(
    <>
      {/* Backdrop — ẩn khi form đang mở */}
      {!showForm && <div
        className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4"
        onClick={handleSnooze}
      >
        {/* Card */}
        <div
          className="relative w-full max-w-sm overflow-hidden rounded-3xl bg-white shadow-2xl"
          onClick={(e) => e.stopPropagation()}
          style={{ animation: "popIn 0.25s cubic-bezier(0.34,1.56,0.64,1) both" }}
        >
          {/* ── Gradient header ── */}
          <div className="relative bg-gradient-to-br from-amber-400 via-orange-400 to-orange-500 px-6 pb-8 pt-6 text-center">
            {/* Close */}
            <button
              onClick={handleSnooze}
              className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30"
              aria-label="Đóng"
            >
              <X className="h-3.5 w-3.5" />
            </button>

            {/* Floating star icon */}
            <div className="relative mx-auto mb-3 flex h-20 w-20 items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-white/20" />
              <div className="absolute inset-2 rounded-full bg-white/20" />
              <div className="relative flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-lg">
                <Star className="h-6 w-6 fill-amber-400 text-amber-400" />
              </div>
            </div>

            <h3 className="text-lg font-extrabold text-white drop-shadow-sm">
              Buổi chơi của bạn đã hoàn thành!
            </h3>
            <p className="mt-1 text-sm text-white/85">
              Chia sẻ cảm nhận để giúp cộng đồng RC
            </p>

            {/* 5 stars preview */}
            <div className="mt-3 flex justify-center gap-1.5">
              {[1, 2, 3, 4, 5].map((i) => (
                <Star key={i} className="h-5 w-5 fill-white/70 text-white/70 drop-shadow-sm" />
              ))}
            </div>

            {/* Decorative wave bottom */}
            <div className="absolute -bottom-px left-0 right-0">
              <svg viewBox="0 0 400 24" className="w-full fill-white" preserveAspectRatio="none">
                <path d="M0,24 C100,0 300,0 400,24 L400,24 L0,24 Z" />
              </svg>
            </div>
          </div>

          {/* ── Body ── */}
          <div className="px-6 pb-6 pt-4">
            {/* Cafe info card */}
            <div className="mb-4 rounded-2xl bg-slate-50 px-4 py-3">
              <div className="flex items-center gap-2 mb-1">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-orange-400" />
                <p className="text-sm font-bold text-slate-800">{booking.cafeName}</p>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                <p className="text-xs text-slate-500">
                  {slotDate.toLocaleDateString("vi-VN", {
                    weekday: "long",
                    day: "numeric",
                    month: "numeric",
                  })}
                  {" · "}
                  {slotDate.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
                  {" – "}
                  {slotEnd.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>

            {/* CTA */}
            <button
              onClick={() => setShowForm(true)}
              className="w-full rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 py-3.5 text-sm font-extrabold text-white shadow-lg shadow-orange-200 transition-all hover:from-amber-500 hover:to-orange-600 hover:shadow-orange-300 active:scale-[0.98]"
            >
              ⭐ Đánh giá ngay
            </button>

            <button
              onClick={handleSnooze}
              disabled={snooze.isPending}
              className="mt-3 w-full text-center text-xs font-medium text-slate-400 hover:text-slate-600"
            >
              Để sau
            </button>
          </div>
        </div>
      </div>}

      <style>{`
        @keyframes popIn {
          from { opacity: 0; transform: scale(0.85) translateY(20px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>

      {showForm && (
        <ReviewFormModal
          booking={booking}
          onClose={handleSnooze}
          onSubmitted={() => {
            setShowForm(false)
            setDismissed(true)
            clearReviewRequest()
          }}
        />
      )}
    </>,
    document.body,
  )
}
