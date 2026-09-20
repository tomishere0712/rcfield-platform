import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Calendar, MapPin, Star } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { StarRating } from "@/features/booking-review/components/StarRating"
import { getCustomerReviews } from "@/features/booking-review/api/review.api"
import type { Review } from "@/features/booking-review/types"
import { CustomerSubNav } from "./components/CustomerSubNav"
import { CustomerPageShell } from "./components/CustomerPageShell"

export function CustomerReviewsPage() {
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ["customer-reviews", page],
    queryFn: () => getCustomerReviews(page),
  })

  const reviews: Review[] = data?.data ?? []
  const total = data?.total ?? 0

  return (
    <CustomerPageShell>
      <CustomerSubNav activeTab="reviews" />

      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-slate-700">Đánh giá & Phản hồi của tôi</h2>
        <span className="text-xs text-slate-400">{total} đánh giá</span>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-sm text-slate-400">Đang tải...</div>
      ) : reviews.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Star className="h-10 w-10 text-slate-200" />
          <p className="text-sm font-semibold text-slate-500">Bạn chưa có đánh giá nào</p>
          <p className="text-xs text-slate-400">
            Sau khi hoàn thành buổi chơi, bạn sẽ nhận được lời nhắc để đánh giá cơ sở.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {reviews.map((rev) => (
            <ReviewCard key={rev.id} review={rev} />
          ))}
        </div>
      )}

      {total > 20 && (
        <div className="flex justify-center gap-2 pt-2">
          <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
            Trước
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={page * 20 >= total}
            onClick={() => setPage((p) => p + 1)}
          >
            Sau
          </Button>
        </div>
      )}
    </CustomerPageShell>
  )
}

function ReviewCard({ review }: { review: Review }) {
  const subScores = [
    { label: "Xe", value: review.vehicleScore },
    { label: "Nhân viên", value: review.staffScore },
    { label: "Cơ sở", value: review.facilityScore },
  ].filter((s) => s.value !== null)

  return (
    <div
      className={`flex flex-col gap-3 rounded-xl border bg-white p-4 shadow-sm transition-shadow hover:shadow-md ${
        review.status === "HIDDEN" ? "opacity-60" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <StarRating value={review.overallScore} readOnly size="md" />
        {review.status === "HIDDEN" && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
            Đã ẩn
          </span>
        )}
      </div>

      {review.cafeName && (
        <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-700">
          <MapPin className="h-3 w-3 text-orange-400 shrink-0" />
          {review.cafeName}
        </div>
      )}

      {review.note && (
        <p className="text-xs leading-5 text-slate-600 italic">"{review.note}"</p>
      )}

      {subScores.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {subScores.map((s) => (
            <span
              key={s.label}
              className="flex items-center gap-1 rounded-full border border-slate-100 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600"
            >
              {s.label}: {s.value}/5
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-1 text-[11px] text-slate-400">
        <Calendar className="h-3 w-3" />
        {new Date(review.createdAt).toLocaleDateString("vi-VN")}
      </div>
    </div>
  )
}
