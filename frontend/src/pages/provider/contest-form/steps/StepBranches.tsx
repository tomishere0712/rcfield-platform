import type { Dispatch, SetStateAction } from "react"
import { Building2 } from "lucide-react"

import type { BackendCafe } from "@/features/cafes/types"
import { cn } from "@/shared/lib/utils"

import type { ContestFormState } from "../contest-form-types"

/**
 * Bước 1 — chọn chi nhánh tổ chức.
 *
 * Chọn đúng MỘT chi nhánh. Cho tick nhiều rồi mới báo lỗi ở bước sau là bắt
 * provider tự đoán luật: loại đường đua phải có ở mọi chi nhánh, người chơi
 * đăng ký nơi này lại phải thi nơi khác, còn sơ đồ đấu thì rải ra nhiều nơi.
 * Rắc rối đó không đáng, nên chặn ngay từ chỗ chọn.
 *
 * Backend vẫn nhận mảng `participating_cafe_ids` và lấy phần tử đầu làm chủ
 * nhà, nên ở đây chỉ cần gửi mảng một phần tử — không phải đổi gì phía server.
 */
export function StepBranches({
  form,
  setForm,
  errors,
  cafes,
  isLoading,
  isEdit,
  contestStatus,
}: {
  form: ContestFormState
  setForm: Dispatch<SetStateAction<ContestFormState>>
  errors: Record<string, string>
  cafes: BackendCafe[]
  isLoading: boolean
  isEdit?: boolean
  contestStatus?: string
}) {
  const selectedId = form.participating_cafe_ids[0] ?? null
  const isBranchLocked = isEdit && contestStatus !== "DRAFT"

  const selectCafe = (cafeId: string) => {
    if (isBranchLocked) return
    setForm((current) => ({
      ...current,
      participating_cafe_ids: [cafeId],
    }))
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((index) => (
          <div
            key={index}
            className="h-20 animate-pulse rounded-xl bg-[#f0eded]"
          />
        ))}
      </div>
    )
  }

  if (cafes.length === 0) {
    return (
      <p className="border-l-2 border-[#e5e2e1] py-3 pl-4 text-sm font-semibold text-[#747878]">
        Bạn chưa có chi nhánh nào đang hoạt động. Tạo và kích hoạt chi nhánh
        trước khi tổ chức giải đấu.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {errors.participating_cafe_ids ? (
        <p className="text-sm font-bold text-red-600">
          {errors.participating_cafe_ids}
        </p>
      ) : null}

      <ul className="space-y-3">
        {cafes.map((cafe) => {
          const isSelected = cafe.id === selectedId
          const isDisabled = isBranchLocked && !isSelected

          return (
            <li key={cafe.id}>
              <label
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition",
                  isSelected
                    ? "border-[#1c1b1b] bg-[#fcf8f8]"
                    : "border-[#e5e2e1] bg-white hover:border-[#c4c7c8]",
                  isDisabled && "cursor-not-allowed opacity-50 hover:border-[#e5e2e1]"
                )}
              >
                <input
                  type="radio"
                  name="contest-branch"
                  className="mt-1 size-4 accent-[#1c1b1b]"
                  checked={isSelected}
                  disabled={isDisabled}
                  onChange={() => selectCafe(cafe.id)}
                />
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#f0eded] text-[#5d5f5f]">
                  <Building2 className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-bold text-[#1c1b1b]">
                    {cafe.name}
                  </span>
                  <span className="mt-0.5 block text-sm font-medium text-[#747878]">
                    {cafe.district}, {cafe.city}
                  </span>
                </span>
              </label>
            </li>
          )
        })}
      </ul>

      {isBranchLocked ? (
        <p className="border-l-2 border-amber-500 bg-amber-50 py-2.5 pl-4 text-xs font-bold text-amber-800">
          Giải đấu đã mở đăng ký hoặc đang diễn ra. Bạn không thể thay đổi chi
          nhánh tổ chức để tránh sai lệch dữ liệu đăng ký của vận động viên.
        </p>
      ) : (
        <p className="border-l-2 border-[#e5e2e1] py-2 pl-4 text-xs font-semibold leading-6 text-[#747878]">
          Toàn bộ các vòng đấu diễn ra tại chi nhánh này. Muốn tổ chức ở chi nhánh
          khác thì tạo một giải riêng.
        </p>
      )}
    </div>
  )
}
