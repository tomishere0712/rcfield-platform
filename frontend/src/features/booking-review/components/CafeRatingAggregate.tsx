import { useQuery } from "@tanstack/react-query"
import { StarRating } from "./StarRating"
import { getCafeReviews } from "../api/review.api"

interface CafeRatingAggregateProps {
  cafeId: string
}

function ScoreBar({ label, value }: { label: string; value: number | null }) {
  if (!value) return null
  const pct = ((value - 1) / 4) * 100
  return (
    <div className="flex items-center gap-2">
      <span className="w-24 shrink-0 text-xs text-slate-600">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-amber-400" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-6 text-right text-xs font-semibold text-slate-700">{value}</span>
    </div>
  )
}

export function CafeRatingAggregate({ cafeId }: CafeRatingAggregateProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["cafe-reviews", cafeId, 1],
    queryFn: () => getCafeReviews(cafeId, 1),
  })

  if (isLoading) return null

  const rawAgg = data?.aggregate
  const agg = rawAgg
    ? {
        ...rawAgg,
        reviewCount: Number(rawAgg.reviewCount),
        overallAvg: rawAgg.overallAvg != null ? Number(rawAgg.overallAvg) : null,
        vehicleAvg: rawAgg.vehicleAvg != null ? Number(rawAgg.vehicleAvg) : null,
        staffAvg: rawAgg.staffAvg != null ? Number(rawAgg.staffAvg) : null,
        facilityAvg: rawAgg.facilityAvg != null ? Number(rawAgg.facilityAvg) : null,
      }
    : null

  if (!agg || agg.reviewCount === 0) {
    return (
      <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-center text-sm text-slate-500">
        Chưa có đánh giá. Hãy là người đầu tiên!
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-4">
        <div className="text-center">
          <p className="text-4xl font-bold text-slate-900">{agg.overallAvg?.toFixed(1)}</p>
          <StarRating value={Math.round(agg.overallAvg ?? 0)} readOnly size="sm" />
          <p className="mt-1 text-xs text-slate-400">{agg.reviewCount} đánh giá</p>
        </div>
        <div className="flex-1 space-y-2">
          <ScoreBar label="Nhân viên" value={agg.staffAvg} />
          <ScoreBar label="Cơ sở vật chất" value={agg.facilityAvg} />
          <ScoreBar label="Chất lượng xe" value={agg.vehicleAvg} />
        </div>
      </div>
    </div>
  )
}
