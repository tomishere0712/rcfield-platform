import { z } from "zod"

export const contestUpsertSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Tên contest không được để trống")
      .max(100, "Tên contest tối đa 100 ký tự"),
    description: z.string().trim().nullable().optional(),
    contest_type_id: z.string().uuid("Vui lòng chọn loại giải đấu hợp lệ"),
    contest_format_id: z.string().uuid("Vui lòng chọn format giải đấu hợp lệ"),
    contest_template_id: z
      .string()
      .uuid("Vui lòng chọn template giải đấu hợp lệ"),
    track_type_id: z.string().uuid("Vui lòng chọn track type hợp lệ"),
    participating_cafe_ids: z
      .array(z.string().uuid())
      .min(1, "Chọn ít nhất một chi nhánh tham gia"),
    starts_at: z.string().min(1, "Thời gian bắt đầu không được để trống"),
    ends_at: z.string().min(1, "Thời gian kết thúc không được để trống"),
    registration_opens_at: z
      .string()
      .min(1, "Thời gian mở đăng ký không được để trống"),
    registration_closes_at: z
      .string()
      .min(1, "Thời gian đóng đăng ký không được để trống"),
    capacity: z
      .number({ message: "Sức chứa phải là một số" })
      .int("Sức chứa phải là số nguyên")
      .min(2, "Sức chứa tối thiểu là 2 người chơi"),
    entry_fee: z
      .number({ message: "Lệ phí phải là một số" })
      .min(0, "Lệ phí không được nhỏ hơn 0"),
    banner_image_url: z
      .string()
      .trim()
      .url("Banner image URL không hợp lệ")
      .or(z.literal(""))
      .nullable()
      .optional(),
    vehicle_rule: z.object({
      vehicle_policy: z.enum(["RENTAL_ONLY", "BYOC_ONLY", "MIXED"], {
        message: "Vehicle policy không hợp lệ",
      }),
      assignment_policy: z.enum(["AT_CHECK_IN", "PRE_ASSIGNED"], {
        message: "Assignment policy không hợp lệ",
      }),
    }),
    config: z.record(z.string(), z.unknown()).optional(),
  })
  .refine(
    (data) => {
      const start = new Date(data.starts_at).getTime()
      const end = new Date(data.ends_at).getTime()
      return start < end
    },
    {
      message: "Thời gian bắt đầu phải trước thời gian kết thúc",
      path: ["starts_at"],
    },
  )
  .refine(
    (data) => {
      const regOpen = new Date(data.registration_opens_at).getTime()
      const regClose = new Date(data.registration_closes_at).getTime()
      return regOpen < regClose
    },
    {
      message: "Thời gian mở đăng ký phải trước thời gian đóng đăng ký",
      path: ["registration_opens_at"],
    },
  )
  .refine(
    (data) => {
      const regClose = new Date(data.registration_closes_at).getTime()
      const start = new Date(data.starts_at).getTime()
      return regClose <= start
    },
    {
      message:
        "Thời gian đóng đăng ký phải trước hoặc bằng thời gian bắt đầu contest",
      path: ["registration_closes_at"],
    },
  )

export const contestGenerateMatchesSchema = z.object({
  cafe_id: z.string().uuid("Chi nhánh vận hành không hợp lệ"),
  track_config_id: z
    .string()
    .uuid("Cấu hình track không hợp lệ")
    .nullable()
    .optional(),
  // Bỏ trống nghĩa là "lấy cả giải" — đấu loại bốc thăm toàn bộ người đã duyệt
  // chứ ban tổ chức không nhặt ai vào ai ra, nên không ép phải chọn tay.
  registration_ids: z.array(z.string().uuid()).optional(),
  drivers_per_match: z
    .number({ message: "Số lượng driver mỗi trận phải là số" })
    .int()
    .min(1, "Số lượng driver mỗi trận phải lớn hơn 0")
    .max(64, "Số lượng driver tối đa là 64")
    .optional(),
  // Đấu loại bốc ngẫu nhiên nên không gửi cách xếp thứ tự; backend cũng để
  // trường này optional, ép ở đây chỉ chặn nhầm chính mình.
  seeding_mode: z
    .enum(["MANUAL", "CHECK_IN_ORDER"], {
      message: "Cách xếp thứ tự không hợp lệ",
    })
    .optional(),
})

export const contestMatchResultInputSchema = z.object({
  registration_id: z.string().uuid("Registration ID không hợp lệ"),
  finish_position: z
    .number()
    .int()
    .min(1, "Vị trí về đích phải lớn hơn 0")
    .nullable()
    .optional(),
  score: z.number().nullable().optional(),
  best_lap_seconds: z
    .number()
    .min(0, "Thời gian best lap không được nhỏ hơn 0")
    .nullable()
    .optional(),
  total_time_seconds: z
    .number()
    .min(0, "Tổng thời gian đua không được nhỏ hơn 0")
    .nullable()
    .optional(),
  is_winner: z.boolean(),
  result_note: z.string().nullable().optional(),
  status: z.enum(["READY", "STARTED", "FINISHED", "DNS", "DNF", "DQ"], {
    message: "Trạng thái người tham gia không hợp lệ",
  }),
})

export const contestSubmitResultsSchema = z.object({
  reason: z.string().trim().min(1, "Vui lòng nhập lý do submit"),
  results: z.array(contestMatchResultInputSchema),
})

export const contestCorrectResultsSchema = contestSubmitResultsSchema.extend({
  force_cascade: z.boolean().optional(),
})

export const contestBannerUploadSchema = z.object({
  file: z
    .instanceof(File, { message: "Vui lòng chọn file ảnh" })
    .refine((file) => file.size <= 5 * 1024 * 1024, "Ảnh tối đa 5MB")
    .refine(
      (file) =>
        ["image/jpeg", "image/png", "image/webp", "image/jpg"].includes(
          file.type,
        ),
      "Chỉ hỗ trợ JPG, PNG, WEBP",
    ),
})

export const contestByocDeclarationSchema = z.object({
  byoc_vehicle_name: z
    .string()
    .trim()
    .min(2, "Tên xe cá nhân tối thiểu 2 ký tự")
    .max(120, "Tên xe cá nhân tối đa 120 ký tự"),
  byoc_vehicle_brand: z
    .string()
    .trim()
    .min(1, "Hãng xe không được để trống")
    .max(120, "Hãng xe tối đa 120 ký tự"),
  byoc_vehicle_class: z
    .string()
    .trim()
    .min(1, "Class xe không được để trống")
    .max(120, "Class xe tối đa 120 ký tự"),
  byoc_vehicle_notes: z
    .string()
    .trim()
    .max(1000, "Ghi chú tối đa 1000 ký tự")
    .optional(),
  // Ban tổ chức duyệt xe cá nhân dựa vào ảnh, nên bắt buộc ít nhất một tấm.
  byoc_vehicle_photos: z
    .array(z.string().url())
    .min(1, "Cần ít nhất 1 ảnh xe để ban tổ chức duyệt")
    .max(6, "Tối đa 6 ảnh xe"),
})

/**
 * Đăng ký thuê xe của quán chỉ cần chi nhánh và dòng xe: khung giờ do lịch thi
 * đấu quyết định và xe được giao đúng lúc check-in.
 */
export const contestRentalChoiceSchema = z.object({
  cafe_id: z.string().uuid("Chi nhánh không hợp lệ"),
  vehicle_catalog_id: z.string().uuid("Dòng xe không hợp lệ"),
})
