import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Eye, EyeOff } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/shared/ui/button"
import { StarRating } from "@/features/booking-review/components/StarRating"
import { getProviderReviews, updateReviewVisibility } from "@/features/booking-review/api/review.api"
import type { Review } from "@/features/booking-review/types"

interface ProviderReviewsTabProps {
  cafeId: string
}

export function ProviderReviewsTab({ cafeId }: ProviderReviewsTabProps) {
  const qc = useQueryClient()
  const [status, setStatus] = useState<"" | "VISIBLE" | "HIDDEN">("")
  const [page, setPage] = useState(1)

  const { data, isLoading, isError } = useQuery({
    queryKey: ["provider-reviews", cafeId, status, page],
    queryFn: () =>
      getProviderReviews({ cafe_id: cafeId, status: status || undefined, page, limit: 20 }),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, next }: { id: string; next: "VISIBLE" | "HIDDEN" }) =>
      updateReviewVisibility(id, next),
    onSuccess: (_, { next }) => {
      toast.success(next === "HIDDEN" ? "Đã ẩn đánh giá" : "Đã hiển thị đánh giá")
      qc.invalidateQueries({ queryKey: ["provider-reviews", cafeId] })
    },
    onError: () => {
      toast.error("Không thể cập nhật trạng thái đánh giá. Vui lòng thử lại.")
    },
  })

  const reviews: Review[] = data?.data ?? []
  const total = data?.total ?? 0
  const newBadge = (data?.newSince24h ?? 0) > 0

  return (
    <div className="rounded-xl border border-[#c4c7c8] bg-white p-5">
      <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-[#1c1b1b]">Đánh giá khách hàng</h3>
          {newBadge && (
            <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white">
              {data?.newSince24h} mới
            </span>
          )}
        </div>
        <select
          className="h-9 rounded-lg border border-[#c4c7c8] bg-white px-3 py-1.5 text-xs font-semibold text-[#1c1b1b]"
          value={status}
          onChange={(e) => { setStatus(e.target.value as "" | "VISIBLE" | "HIDDEN"); setPage(1) }}
        >
          <option value="">Tất cả</option>
          <option value="VISIBLE">Hiện</option>
          <option value="HIDDEN">Ẩn</option>
        </select>
      </div>

      {isLoading ? (
        <div className="py-10 text-center text-sm text-[#747878]">Đang tải...</div>
      ) : isError ? (
        <div className="py-10 text-center text-sm text-red-600">
          Không thể tải đánh giá. Vui lòng thử lại.
        </div>
      ) : reviews.length === 0 ? (
        <div className="py-10 text-center text-sm text-[#747878]">Chưa có đánh giá nào</div>
      ) : (
        <div className="space-y-3">
          {reviews.map((r) => (
            <div
              key={r.id}
              className={`flex items-start justify-between gap-3 rounded-xl border px-4 py-4 ${
                r.status === "HIDDEN" ? "border-[#e5e2e1] bg-[#f6f3f2] opacity-70" : "border-[#e5e2e1] bg-[#fcf8f8]"
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-[#1c1b1b]">{(r as Review & { customerName?: string }).customerName ?? "—"}</p>
                  <StarRating value={r.overallScore} readOnly size="sm" />
                  {r.status === "HIDDEN" && (
                    <span className="rounded-full bg-[#e5e2e1] px-2 py-0.5 text-[10px] text-[#5d5f5f]">Đã ẩn</span>
                  )}
                </div>
                {r.note && <p className="mt-1 text-sm text-[#5d5f5f]">{r.note}</p>}
                {(r.staffScore || r.facilityScore || r.vehicleScore) && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {r.staffScore !== null && r.staffScore !== undefined && (
                      <span className="rounded-full bg-[#f1f3f4] px-2.5 py-0.5 text-[11px] font-semibold text-[#5d5f5f]">
                        Nhân viên: {r.staffScore}/5
                      </span>
                    )}
                    {r.facilityScore !== null && r.facilityScore !== undefined && (
                      <span className="rounded-full bg-[#f1f3f4] px-2.5 py-0.5 text-[11px] font-semibold text-[#5d5f5f]">
                        Cơ sở: {r.facilityScore}/5
                      </span>
                    )}
                    {r.vehicleScore !== null && r.vehicleScore !== undefined && (
                      <span className="rounded-full bg-[#f1f3f4] px-2.5 py-0.5 text-[11px] font-semibold text-[#5d5f5f]">
                        Xe: {r.vehicleScore}/5
                      </span>
                    )}
                  </div>
                )}
                <p className="mt-1.5 text-xs text-[#747878]">
                  {new Date(r.createdAt).toLocaleDateString("vi-VN")}
                </p>
              </div>
              {(() => {
                const showHideButton = false
                return showHideButton ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      toggleMutation.mutate({
                        id: r.id,
                        next: r.status === "VISIBLE" ? "HIDDEN" : "VISIBLE",
                      })
                    }
                    disabled={toggleMutation.isPending && toggleMutation.variables?.id === r.id}
                  >
                    {r.status === "VISIBLE" ? (
                      <><EyeOff className="mr-1 h-3.5 w-3.5" /> Ẩn</>
                    ) : (
                      <><Eye className="mr-1 h-3.5 w-3.5" /> Hiện</>
                    )}
                  </Button>
                ) : null
              })()}
            </div>
          ))}
        </div>
      )}

      {total > 20 && (
        <div className="flex justify-center gap-2">
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
    </div>
    </div>
  )
}
