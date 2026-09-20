import { z } from "zod"

import type { TrackConfig } from "@/features/cafes/types"

import type { ContestFormState, ResourceLockState } from "./contest-form-types"
import type { ContestRuntimeFormat } from "./contest-form-utils"

/**
 * Trình tự tạo giải đấu.
 *
 * Thứ tự không tuỳ tiện — nó theo đúng chuỗi phụ thuộc dữ liệu của backend:
 * chi nhánh quyết định loại đường đua nào chọn được, loại đường đua quyết định
 * phạm vi khoá sân, hình thức thi đấu quyết định có ô "số VĐV vào chung kết"
 * hay không. Form một trang cũ bắt provider điền theo thứ tự bất kỳ rồi mới báo
 * lỗi lúc bấm Lưu, nên phần lớn thời gian là sửa ngược.
 */
/**
 * Các mức sức chứa dùng được cho sơ đồ đấu loại trực tiếp.
 *
 * Phải là luỹ thừa của 2 thì sơ đồ mới chia đôi được tới tận chung kết. Backend
 * (`resolveBracketSize`) chấp nhận MỌI luỹ thừa của 2, và còn tự làm tròn lên
 * khi sức chứa không hợp lệ — danh sách này chỉ là những mức hợp lý với quy mô
 * một quán xe RC, để chủ sân chọn thay vì phải tự nhớ 2, 4, 8, 16…
 *
 * Có 4 vì giải nội bộ bốn người là chuyện rất thường; thiếu nó thì chủ sân buộc
 * phải khai 8 suất rồi để nửa sơ đồ trống. Có 64 cho sự kiện lớn.
 */
export const KNOCKOUT_CAPACITIES: number[] = [4, 8, 16, 32, 64]

export const CONTEST_WIZARD_STEPS = [
  {
    id: "branches",
    label: "Chi nhánh",
    title: "Giải đấu tổ chức ở đâu?",
    subtitle:
      "Chọn các chi nhánh tham gia. Chi nhánh đầu tiên là chủ nhà — nơi điều phối chung của giải.",
  },
  {
    id: "track",
    label: "Sân thi đấu",
    title: "Thi đấu trên loại đường đua nào?",
    subtitle:
      "Chỉ những loại đường đua mà tất cả chi nhánh đã chọn đều có mới hiện ở đây.",
  },
  {
    id: "format",
    label: "Thể thức",
    title: "Giải vận hành theo thể thức nào?",
    subtitle: "Quyết định cách hệ thống sinh trận đấu và tính bảng xếp hạng.",
  },
  {
    id: "schedule",
    label: "Lịch & quy mô",
    title: "Diễn ra khi nào, quy mô bao nhiêu?",
    subtitle:
      "Bốn mốc phải theo đúng thứ tự: mở đăng ký → đóng đăng ký → khởi tranh → kết thúc. Bấm nút gợi ý để điền cả bốn cùng lúc.",
  },
  {
    id: "intro",
    label: "Giới thiệu",
    title: "Giới thiệu giải đấu & xác nhận",
    subtitle:
      "Đây là phần khách nhìn thấy đầu tiên. Kiểm tra lại toàn bộ cấu hình trước khi tạo.",
  },
] as const

export type ContestWizardStep = (typeof CONTEST_WIZARD_STEPS)[number]
export type ContestWizardStepId = ContestWizardStep["id"]

export const LAST_STEP_INDEX = CONTEST_WIZARD_STEPS.length - 1

export type StepValidationContext = {
  isEdit: boolean
  runtimeFormat: ContestRuntimeFormat
  resourceLocks: ResourceLockState
  trackConfigsByCafe: Record<string, TrackConfig[]>
}

export type StepErrors = Record<string, string>

const branchesSchema = z.object({
  // Giải chạy ở đúng một chi nhánh; bước chọn đã là radio nên đây chỉ là lưới
  // an toàn cho dữ liệu cũ hoặc giải nhiều chi nhánh tạo từ trước.
  participating_cafe_ids: z
    .array(z.string())
    .min(1, "Chọn chi nhánh tổ chức giải"),
})

const trackSchema = z.object({
  track_type_id: z.string().min(1, "Chọn loại đường đua cho giải"),
})

// `contest_type_id` và `contest_format_id` không có ô nhập riêng nữa — chọn một
// thẻ thể thức là suy ra cả ba id. Vẫn kiểm để bắt trường hợp catalog trả về
// template thiếu liên kết.
const formatSchema = z.object({
  contest_template_id: z.string().min(1, "Chọn một thể thức thi đấu"),
  contest_type_id: z.string().min(1, "Thể thức này thiếu liên kết loại giải"),
  contest_format_id: z
    .string()
    .min(1, "Thể thức này thiếu liên kết hình thức thi đấu"),
  vehicle_policy: z.enum(["RENTAL_ONLY", "BYOC_ONLY", "MIXED"]),
  assignment_policy: z.enum(["AT_CHECK_IN", "PRE_ASSIGNED"]),
})

const scheduleSchema = z.object({
  starts_at: z.string().min(1, "Chọn thời điểm bắt đầu thi đấu"),
  ends_at: z.string().min(1, "Chọn thời điểm kết thúc thi đấu"),
  registration_opens_at: z.string().min(1, "Chọn thời điểm mở đăng ký"),
  registration_closes_at: z.string().min(1, "Chọn thời điểm đóng đăng ký"),
  capacity: z.string().min(1, "Nhập sức chứa tối đa"),
  entry_fee: z.string().min(1, "Nhập lệ phí (0 nếu miễn phí)"),
})

const introSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, "Tên giải đấu tối thiểu 3 ký tự")
    .max(255, "Tên giải đấu tối đa 255 ký tự"),
  description: z.string().max(5000, "Mô tả tối đa 5000 ký tự"),
})

/**
 * Gom lỗi zod thành map `đường-dẫn -> thông điệp`.
 *
 * Kiểu tham số viết tay thay vì dùng type của zod: tên type kết quả safeParse
 * khác nhau giữa zod v3 và v4, ràng vào đó là tự chuốc lỗi build khi nâng version.
 */
function collectIssues(result: {
  success: boolean
  error?: { issues: ReadonlyArray<{ path: PropertyKey[]; message: string }> }
}): StepErrors {
  if (result.success || !result.error) return {}
  const errors: StepErrors = {}
  for (const issue of result.error.issues) {
    const path = issue.path.map(String).join(".")
    if (!errors[path]) errors[path] = issue.message
  }
  return errors
}

function toTime(value: string): number | null {
  if (!value) return null
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? null : time
}

/**
 * Kiểm tra một bước. Trả về map lỗi rỗng nghĩa là qua được.
 *
 * Mỗi bước chỉ soi đúng phần dữ liệu của nó — người dùng không bị chặn bởi lỗi
 * của những ô chưa tới lượt điền.
 */
export function validateContestStep(
  stepId: ContestWizardStepId,
  form: ContestFormState,
  context: StepValidationContext,
): StepErrors {
  switch (stepId) {
    case "branches":
      return collectIssues(branchesSchema.safeParse(form))

    case "track": {
      const errors = collectIssues(trackSchema.safeParse(form))

      // Chọn "chỉ khoá sân được chọn" nhưng bỏ trống danh sách sân thì backend
      // sẽ âm thầm rơi về khoá cả chi nhánh — chặn ngay tại đây.
      const cafesMissingTracks = form.participating_cafe_ids.filter(
        (cafeId) => {
          const activeConfigs = (
            context.trackConfigsByCafe[cafeId] ?? []
          ).filter((item) => item.is_active)
          if (activeConfigs.length <= 1) return false
          const lock = context.resourceLocks[cafeId]
          return (
            lock?.scope === "SELECTED_TRACKS" &&
            lock.track_config_ids.length === 0
          )
        },
      )
      if (cafesMissingTracks.length > 0) {
        errors.resource_locks =
          "Có chi nhánh chọn khoá theo sân nhưng chưa chọn sân nào. Chọn ít nhất một sân hoặc chuyển sang khoá cả chi nhánh."
      }
      return errors
    }

    case "format": {
      const errors = collectIssues(formatSchema.safeParse(form))
      if (context.runtimeFormat === "QUALIFYING_FINAL") {
        const finalists = Number.parseInt(form.finalists, 10)
        if (!Number.isFinite(finalists) || finalists < 2 || finalists > 16) {
          errors.finalists = "Số VĐV vào chung kết phải từ 2 đến 16"
        }
      }
      if (
        context.runtimeFormat === "TIME_TRIAL" ||
        context.runtimeFormat === "QUALIFYING_FINAL"
      ) {
        const runs = Number.parseInt(form.runs_per_driver, 10)
        if (!Number.isFinite(runs) || runs < 1 || runs > 5) {
          errors.runs_per_driver = "Số lượt chạy mỗi VĐV phải từ 1 đến 5"
        }
      }

      return errors
    }

    case "schedule": {
      const errors = collectIssues(scheduleSchema.safeParse(form))

      const capacity = Number.parseInt(form.capacity, 10)
      if (form.capacity && (!Number.isFinite(capacity) || capacity < 1)) {
        errors.capacity = "Sức chứa phải là số nguyên lớn hơn 0"
      } else if (
        form.capacity &&
        context.runtimeFormat === "KNOCKOUT" &&
        !KNOCKOUT_CAPACITIES.includes(capacity)
      ) {
        // Sơ đồ đấu loại phải chia đôi được tới tận chung kết.
        errors.capacity = `Đấu loại trực tiếp chỉ nhận sức chứa ${KNOCKOUT_CAPACITIES.join(", ")} VĐV`
      }
      const entryFee = Number(form.entry_fee)
      if (form.entry_fee && (!Number.isFinite(entryFee) || entryFee < 0)) {
        errors.entry_fee = "Lệ phí phải là số không âm"
      }

      const startsAt = toTime(form.starts_at)
      const endsAt = toTime(form.ends_at)
      const opensAt = toTime(form.registration_opens_at)
      const closesAt = toTime(form.registration_closes_at)

      if (startsAt !== null && endsAt !== null && endsAt <= startsAt) {
        errors.ends_at = "Thời điểm kết thúc phải sau thời điểm bắt đầu"
      }
      if (opensAt !== null && closesAt !== null && closesAt <= opensAt) {
        errors.registration_closes_at =
          "Đóng đăng ký phải sau thời điểm mở đăng ký"
      }
      if (closesAt !== null && startsAt !== null && closesAt > startsAt) {
        errors.registration_closes_at =
          "Đăng ký phải đóng trước hoặc đúng lúc giải khởi tranh"
      }
      // Chỉ chặn khi tạo mới: contest cũ đang sửa lại thì mốc quá khứ là bình thường.
      if (!context.isEdit && startsAt !== null && startsAt <= Date.now()) {
        errors.starts_at = "Thời điểm khởi tranh phải ở tương lai"
      }

      return errors
    }

    case "intro":
      return collectIssues(introSchema.safeParse(form))

    default:
      return {}
  }
}

/**
 * Duyệt toàn bộ các bước theo thứ tự, trả về bước đầu tiên còn lỗi.
 *
 * Dùng lúc bấm nút tạo: người dùng có thể đã sửa chi nhánh sau khi đi qua bước
 * sau, làm hỏng ngược một bước trước đó mà không nhận ra.
 */
export function findFirstInvalidStep(
  form: ContestFormState,
  context: StepValidationContext,
): { index: number; errors: StepErrors } | null {
  for (let index = 0; index < CONTEST_WIZARD_STEPS.length; index += 1) {
    const errors = validateContestStep(
      CONTEST_WIZARD_STEPS[index].id,
      form,
      context,
    )
    if (Object.keys(errors).length > 0) return { index, errors }
  }
  return null
}
