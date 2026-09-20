import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { ChevronDown } from "lucide-react"

import { StarRating } from "./StarRating"
import { Button } from "@/shared/ui/button"
import { getCafeReviews } from "../api/review.api"
import type { Review } from "../types"

interface CafeReviewListProps {
  cafeId: string
}

/**
 * Một người chơi đánh giá lại sau mỗi lần chơi, nên danh sách phẳng hiện tên họ
 * lặp đi lặp lại và trông như dữ liệu trùng. Gom theo người: lần gần nhất hiện
 * sẵn, các lần trước thu lại sau một nút mở.
 */
interface ReviewerGroup {
  customerId: string
  customerName: string
  latest: Review
  older: Review[]
}

function groupByReviewer(reviews: Review[]): ReviewerGroup[] {
  const groups = new Map<string, ReviewerGroup>()

  for (const review of reviews) {
    // Khoá theo id; chỉ khi thiếu id mới lùi về tên, vì hai người trùng tên là
    // chuyện có thật còn trùng id thì không.
    const key = review.customerId || `name:${review.customerName}`
    const group = groups.get(key)
    if (!group) {
      groups.set(key, {
        customerId: key,
        customerName: review.customerName,
        latest: review,
        older: [],
      })
      continue
    }
    // Danh sách trả về đã sắp mới trước, nhưng không dựa vào đó: so ngày thật.
    if (new Date(review.createdAt) > new Date(group.latest.createdAt)) {
      group.older.unshift(group.latest)
      group.latest = review
    } else {
      group.older.push(review)
    }
  }

  return [...groups.values()]
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("vi-VN")
}

function ScoreChips({ review }: { review: Review }) {
  const chips = [
    review.staffScore ? `Nhân viên: ${review.staffScore}/5` : null,
    review.facilityScore ? `Cơ sở: ${review.facilityScore}/5` : null,
    review.vehicleScore ? `Xe: ${review.vehicleScore}/5` : null,
  ].filter(Boolean) as string[]

  if (!chips.length) return null

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {chips.map((chip) => (
        <span
          key={chip}
          className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
        >
          {chip}
        </span>
      ))}
    </div>
  )
}

function ReviewBody({ review }: { review: Review }) {
  return (
    <>
      {review.note && (
        <p className="mt-2 text-sm text-slate-600">{review.note}</p>
      )}
      <ScoreChips review={review} />
    </>
  )
}

function ReviewerCard({ group }: { group: ReviewerGroup }) {
  const [expanded, setExpanded] = useState(false)
  const visitCount = group.older.length + 1

  return (
    <div className="rounded-xl border border-slate-100 bg-white px-4 py-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-800">
            {group.customerName}
          </p>
          <p className="text-xs text-slate-400">
            {formatDate(group.latest.createdAt)}
            {visitCount > 1 && ` · ${visitCount} lần đánh giá`}
          </p>
        </div>
        <StarRating value={group.latest.overallScore} readOnly size="sm" />
      </div>

      <ReviewBody review={group.latest} />

      {group.older.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
            className="mt-3 flex items-center gap-1 text-xs font-semibold text-slate-500 transition hover:text-slate-700"
          >
            <ChevronDown
              className={`size-3.5 transition-transform ${expanded ? "rotate-180" : ""}`}
            />
            {expanded
              ? "Thu gọn lượt trước"
              : `Xem ${group.older.length} lượt đánh giá trước`}
          </button>

          {expanded && (
            <div className="mt-3 space-y-3 border-l-2 border-slate-100 pl-3">
              {group.older.map((review) => (
                <div key={review.id}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-slate-400">
                      {formatDate(review.createdAt)}
                    </p>
                    <StarRating
                      value={review.overallScore}
                      readOnly
                      size="sm"
                    />
                  </div>
                  <ReviewBody review={review} />
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export function CafeReviewList({ cafeId }: CafeReviewListProps) {
  const [page, setPage] = useState(1)
  const { data, isLoading } = useQuery({
    queryKey: ["cafe-reviews", cafeId, page],
    queryFn: () => getCafeReviews(cafeId, page),
  })

  const reviews = useMemo(() => data?.data ?? [], [data])
  const groups = useMemo(() => groupByReviewer(reviews), [reviews])
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / 10)

  if (isLoading) {
    return (
      <div className="py-4 text-center text-sm text-slate-400">
        Đang tải đánh giá...
      </div>
    )
  }

  if (!reviews.length) {
    return null
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <ReviewerCard key={group.customerId} group={group} />
      ))}

      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Trước
          </Button>
          <span className="flex items-center text-xs text-slate-500">
            {page} / {totalPages}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Sau
          </Button>
        </div>
      )}
    </div>
  )
}
