import { useEffect, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { CheckCircle2, Loader2 } from "lucide-react"

import { contestApi } from "@/features/contests/api/contest.api"
import type {
  ContestAvailableRentalCatalogGroup,
  ContestRentalOptions,
} from "@/features/contests/types"
import { cn } from "@/shared/lib/utils"

export type ContestRentalChoice = {
  cafe_id: string
  vehicle_catalog_id: string
}

/**
 * Chọn xe thi đấu khi đăng ký thuê xe của quán.
 *
 * Khách chỉ chọn CHI NHÁNH và DÒNG XE. Không còn ô chọn khung giờ: lịch thi đấu
 * đã quyết định thời gian, và xe được giao đúng lúc check-in. Cũng không hiện
 * giá nào — thuê xe trong giải miễn phí, lệ phí giải là khoản duy nhất.
 */
export function ContestRentalVehiclePicker({
  contestId,
  options,
  value,
  onChange,
}: {
  contestId: string
  options: ContestRentalOptions | undefined
  value: Partial<ContestRentalChoice> | null
  onChange: (value: Partial<ContestRentalChoice>) => void
}) {
  const cafes = useMemo(() => options?.cafes ?? [], [options])
  const cafeId = value?.cafe_id ?? null

  // Khoá cache theo chi nhánh nên đổi chi nhánh không bao giờ hiện nhầm danh
  // sách xe của chi nhánh cũ.
  const vehiclesQuery = useQuery({
    queryKey: ["contests", "rental-vehicles", contestId, cafeId],
    queryFn: () =>
      contestApi.getContestAvailableRentalVehicles(contestId, {
        cafe_id: cafeId!,
      }),
    enabled: Boolean(cafeId),
    staleTime: 30_000,
  })
  const groups: ContestAvailableRentalCatalogGroup[] = vehiclesQuery.data ?? []

  // Giải một chi nhánh thì chọn sẵn, khách không phải bấm thừa một bước.
  useEffect(() => {
    if (!value?.cafe_id && cafes.length === 1) {
      onChange({ ...value, cafe_id: cafes[0].id })
    }
  }, [cafes, onChange, value])

  return (
    <div className="space-y-4">
      {cafes.length > 1 ? (
        <label className="block">
          <span className="mb-1.5 block text-sm font-bold text-[#1c1b1b]">
            Chi nhánh thi đấu
          </span>
          <select
            className="h-11 w-full rounded-lg border border-[#c4c7c8] bg-white px-3 text-sm"
            value={value?.cafe_id ?? ""}
            onChange={(event) =>
              onChange({
                cafe_id: event.target.value,
                vehicle_catalog_id: undefined,
              })
            }
          >
            <option value="">-- Chọn chi nhánh --</option>
            {cafes.map((cafe) => (
              <option key={cafe.id} value={cafe.id}>
                {cafe.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <div>
        <span className="mb-1.5 block text-sm font-bold text-[#1c1b1b]">
          Chọn xe thi đấu
        </span>

        {!value?.cafe_id ? (
          <p className="text-sm text-[#747878]">
            Chọn chi nhánh trước để xem xe.
          </p>
        ) : vehiclesQuery.isLoading ? (
          <p className="flex items-center gap-2 text-sm text-[#747878]">
            <Loader2 className="size-4 animate-spin" />
            Đang tải danh sách xe...
          </p>
        ) : groups.length === 0 ? (
          <p className="text-sm text-[#747878]">
            Chi nhánh này chưa có xe phù hợp với đường đua của giải.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {groups.map((group) => {
              const isSelected = group.catalog_id === value?.vehicle_catalog_id
              const isSoldOut = group.remaining_slots <= 0

              return (
                <button
                  key={group.catalog_id}
                  type="button"
                  disabled={isSoldOut}
                  onClick={() =>
                    onChange({ ...value, vehicle_catalog_id: group.catalog_id })
                  }
                  className={cn(
                    "flex items-start gap-3 rounded-xl border p-3 text-left transition",
                    isSoldOut
                      ? "cursor-not-allowed border-[#e5e2e1] bg-[#f6f3f2] opacity-60"
                      : isSelected
                        ? "border-[#1c1b1b] bg-[#fcf8f8] ring-1 ring-[#1c1b1b]"
                        : "border-[#e5e2e1] bg-white hover:border-[#c4c7c8]",
                  )}
                >
                  {group.cover_image_url ? (
                    <img
                      src={group.cover_image_url}
                      alt={group.catalog_name}
                      className="size-14 shrink-0 rounded-lg object-cover"
                    />
                  ) : (
                    <span className="size-14 shrink-0 rounded-lg bg-[#f0eded]" />
                  )}

                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-bold text-[#1c1b1b]">
                        {group.catalog_name}
                      </span>
                      {isSelected ? (
                        <CheckCircle2 className="size-4 shrink-0 text-[#1c1b1b]" />
                      ) : null}
                    </span>
                    <span className="mt-0.5 block text-xs text-[#747878]">
                      {group.tier}
                    </span>
                    <span
                      className={cn(
                        "mt-1 block text-xs font-bold",
                        isSoldOut ? "text-[#747878]" : "text-emerald-700",
                      )}
                    >
                      {isSoldOut
                        ? "Đã hết xe dòng này"
                        : `Còn ${group.remaining_slots}/${group.total_units} xe`}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <p className="border-l-2 border-emerald-300 bg-emerald-50/60 py-2.5 pl-3 text-sm leading-6 text-emerald-900">
        Thuê xe trong giải không mất thêm tiền — lệ phí giải đã bao gồm. Xe được
        giao khi bạn tới check-in đúng giờ thi đấu.
      </p>
    </div>
  )
}
