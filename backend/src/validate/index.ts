import { z } from 'zod';
import { isVietnamMobile, isVietnamPhone } from '../lib/vietnam-phone';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import {
  AssetTier,
  BookingParticipantType,
  BookingMode,
  BookingStatus,
  CafeStatus,
  ContestBanScopeType,
  ContestLedgerDirection,
  ContestLedgerExpenseCategory,
  ContestLedgerIncomeCategory,
  FeaturedPopupAudienceScope,
  FeaturedPopupPlacement,
  ContestParticipantStatus,
  ContestStatus,
  CustomerPackageStatus,
  DiscountType,
  FnbOrderStatus,
  PackageBillingPeriod,
  PromotionScheduleMode,
  PromoApplicableTo,
  ReviewStatus,
  VehicleStatus,
  VehicleSource,
  DamagePartType,
  SessionStatus,
} from '../types';

extendZodWithOpenApi(z);

/**
 * Coi tham số truy vấn rỗng như không được gửi.
 *
 * Trình duyệt và các form lọc rất dễ sinh ra `?city=&date=` khi người dùng chưa
 * chọn gì. Với `z.string().min(1).optional()` thì chuỗi rỗng KHÔNG phải là
 * `undefined`, nên nó rơi vào nhánh `min(1)` và cả request hỏng với 400 — trong
 * khi ý nghĩa thật của nó chỉ là "không lọc theo trường này".
 *
 * Bọc hàm này quanh mọi tham số lọc dạng chuỗi để một ô trống không làm chết cả
 * trang danh sách.
 */
function blankAsUndefined<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    schema,
  );
}

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const StaffBookingsQuerySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date phải có định dạng YYYY-MM-DD')
    .refine((value) => {
      const parsed = new Date(`${value}T00:00:00.000Z`);
      return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
    }, 'date không hợp lệ'),
});

/** Số liên lạc cá nhân: bắt buộc là di động Việt Nam (xem lib/vietnam-phone). */
const MobilePhone = z
  .string()
  .trim()
  .refine(isVietnamMobile, 'Số điện thoại không hợp lệ (di động Việt Nam, 10 chữ số)');

/** Số của chi nhánh: nhận cả số cố định vì nhiều quán dùng số bàn. */
const BranchPhone = z
  .string()
  .trim()
  .refine(isVietnamPhone, 'Số điện thoại không hợp lệ (di động hoặc số cố định Việt Nam)');

export const RegisterSchema = z.object({
  full_name: z.string().min(2).max(255),
  email: z.string().email().max(255),
  phone: MobilePhone.optional(),
  password: z.string().min(6).max(100),
  role: z.enum(['CUSTOMER', 'PROVIDER']).default('CUSTOMER'),
});

export const GoogleSchema = z
  .object({
    id_token: z.string().min(1).optional(),
    credential: z.string().min(1).optional(),
  })
  .refine((value) => value.id_token || value.credential, {
    message: 'Google ID token is required',
  });

export const RefreshSchema = z.object({
  refresh_token: z.string().min(1),
});

export const LogoutSchema = z.object({
  refresh_token: z.string().min(1),
});

export const UpdateMeSchema = z
  .object({
    full_name: z.string().min(2).max(255).optional(),
    phone: MobilePhone.nullable().optional(),
    avatar_url: z.string().url().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Cần ít nhất một trường để cập nhật');

export const ChangePasswordSchema = z.object({
  current_password: z.string().min(6, 'Mật khẩu hiện tại tối thiểu 6 ký tự'),
  new_password: z.string().min(6, 'Mật khẩu mới tối thiểu 6 ký tự').max(100),
});

export const UpdateDriverPassportSchema = z
  .object({
    driver_handle: z
      .string()
      .trim()
      .min(3)
      .max(80)
      .regex(
        /^[a-zA-Z0-9._-]+$/,
        'driver_handle chỉ gồm chữ, số, dấu chấm, gạch dưới hoặc gạch ngang',
      )
      .optional(),
    display_name: z.string().trim().min(2).max(120).optional(),
    home_cafe_id: z.string().uuid().nullable().optional(),
    public_profile_enabled: z.boolean().optional(),
    leaderboard_opt_in: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Cần ít nhất một trường để cập nhật');

export const GlobalLeaderboardQuerySchema = z.object({
  period: z.enum(['daily', 'weekly', 'monthly', 'all_time']).optional().default('all_time'),
  city: z.string().trim().min(1).max(100).optional(),
  cafe_id: z.string().uuid().optional(),
  vehicle_source: z.nativeEnum(VehicleSource).optional(),
  limit: z.coerce.number().int().positive().max(100).optional().default(50),
});

export const CreateStaffSchema = z.object({
  cafe_id: z.string().uuid('cafe_id phải là UUID hợp lệ'),
  full_name: z.string().trim().min(2).max(255),
  email: z.string().trim().email('Email không hợp lệ').max(255),
  phone: MobilePhone.optional(),
});

export const ActivateStaffSchema = z.object({
  token: z.string().min(1, 'Token không được để trống'),
  password: z.string().min(8, 'Mật khẩu tối thiểu 8 ký tự').max(100),
});

export const TransferStaffSchema = z.object({
  cafe_id: z.string().uuid('cafe_id phải là UUID hợp lệ'),
});

export const ForgotPasswordSchema = z.object({
  email: z.string().email('Email không hợp lệ').max(255),
});

export const VerifyPasswordResetCodeSchema = z.object({
  email: z.string().email('Email không hợp lệ').max(255),
  code: z.string().regex(/^\d{6}$/, 'Mã xác nhận phải gồm đúng 6 chữ số'),
});

export const ResetPasswordWithCodeSchema = z.object({
  email: z.string().email('Email không hợp lệ').max(255),
  code: z.string().regex(/^\d{6}$/, 'Mã xác nhận phải gồm đúng 6 chữ số'),
  password: z
    .string()
    .min(6, 'Mật khẩu tối thiểu 6 ký tự')
    .max(100, 'Mật khẩu không được vượt quá 100 ký tự'),
});

export const ChatMessageSchema = z.object({
  message: z.string().min(1).max(1000),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'model']),
        content: z.string().max(2000),
      }),
    )
    .max(20)
    .optional()
    .default([]),
});

export const UploadDocumentSchema = z.object({
  title: z.string().min(1).max(200),
  content_type: z.enum(['POLICY', 'FAQ', 'ANNOUNCEMENT', 'CUSTOM']).optional().default('CUSTOM'),
});

// ── cafes ────────────────────────────────────────────────────────────────────

const TrackTypeSchema = z.string().uuid();

/**
 * Bộ lọc loại sân nhận CẢ uuid lẫn mã (`DRIFT`, `CIRCUIT`, `OFFROAD`).
 *
 * Ô chọn ở trang chủ và trang khám phá dùng `track_types.code` làm giá trị, nên
 * mọi lần khách chọn loại sân đều gửi lên `?trackType=DRIFT`. Khi schema chỉ
 * chấp nhận uuid thì request hỏng với 400 và danh sách chi nhánh trắng trơn.
 *
 * Chọn nới ở đây thay vì bắt giao diện gửi uuid: đường dẫn `?trackType=DRIFT`
 * đọc được và chia sẻ được (Zalo, Facebook là kênh đặt lịch chính thức), còn
 * uuid thì không. Service tự quy đổi mã sang uuid trước khi lọc.
 */
const TrackTypeFilterSchema = z
  .string()
  .regex(
    /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}|[A-Za-z][A-Za-z0-9_-]{1,49})$/,
    'track_type phải là uuid hoặc mã loại sân',
  );

export const CreateTrackTypeSchema = z.object({
  code: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[A-Z0-9_]+$/)
    .openapi({ example: 'DRIFT' }),
  name: z.string().min(1).max(100).openapi({ example: 'Drift' }),
  description: z.string().max(1000).nullable().optional().openapi({ example: 'Đường đua drift' }),
  is_active: z.boolean().optional().default(true),
  sort_order: z.number().int().optional().default(0),
});

export const UpdateTrackTypeSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(1000).nullable().optional(),
  is_active: z.boolean().optional(),
  sort_order: z.number().int().optional(),
});

const OpeningTimeSchema = z
  .string()
  .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'Giờ mở cửa phải nằm trong khoảng 00:00–23:59');

const ClosingTimeSchema = z
  .string()
  .regex(/^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/, 'Giờ đóng cửa phải nằm trong khoảng 00:00–24:00');

const OperatingHourSchema = z
  .object({
    open: OpeningTimeSchema.optional(),
    close: ClosingTimeSchema.optional(),
    is_closed: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.is_closed) return;
    if (!value.open) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['open'], message: 'Cần nhập giờ mở cửa' });
    }
    if (!value.close) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['close'],
        message: 'Cần nhập giờ đóng cửa',
      });
    }
  });

export const CafeListQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1).openapi({ example: 1 }),
  limit: z.coerce.number().int().positive().max(100).optional().default(20).openapi({
    example: 20,
  }),
  query: blankAsUndefined(z.string().trim().min(1).max(200).optional()).openapi({
    example: 'Ho Chi Minh',
  }),
  scope: blankAsUndefined(z.enum(['managed']).optional()).openapi({ example: 'managed' }),
  slug: blankAsUndefined(z.string().min(1).max(120).optional()).openapi({
    example: 'rc-arena-sai-gon',
  }),
  district: blankAsUndefined(z.string().min(1).max(100).optional()).openapi({ example: 'Quan 7' }),
  city: blankAsUndefined(z.string().min(1).max(100).optional()).openapi({
    example: 'TP. Ho Chi Minh',
  }),
  track_type: blankAsUndefined(TrackTypeFilterSchema.optional()).openapi({
    example: 'DRIFT',
  }),
  price_min: z.coerce.number().nonnegative().optional().openapi({ example: 50000 }),
  price_max: z.coerce.number().nonnegative().optional().openapi({ example: 200000 }),
  amenities: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((value) => {
      if (value === undefined) return undefined;
      return Array.isArray(value)
        ? value.flatMap((item) =>
            item
              .split(',')
              .map((part) => part.trim())
              .filter(Boolean),
          )
        : value
            .split(',')
            .map((part) => part.trim())
            .filter(Boolean);
    })
    .openapi({ example: ['Serious Inspection', 'Mát lạnh Điều hòa'] }),
  vehicle_type: blankAsUndefined(z.string().min(1).max(120).optional()).openapi({
    example: 'Drift',
  }),
  sort_by: blankAsUndefined(
    z.enum(['popularity', 'price_asc', 'price_desc', 'rating']).optional(),
  ).openapi({ example: 'popularity' }),
  popular_filters: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((value) => {
      if (value === undefined) return undefined;
      return Array.isArray(value)
        ? value.flatMap((item) =>
            item
              .split(',')
              .map((part) => part.trim())
              .filter(Boolean),
          )
        : value
            .split(',')
            .map((part) => part.trim())
            .filter(Boolean);
    }),
  status: blankAsUndefined(z.nativeEnum(CafeStatus).optional()).openapi({
    example: CafeStatus.ACTIVE,
  }),
  /**
   * Chế độ chơi mà chi nhánh đáp ứng được.
   *
   * `RENTAL` — còn ít nhất một xe cho thuê chưa ngừng sử dụng.
   * `BYOC`   — `byoc_capacity > 0`, tức có nhận khách mang xe riêng.
   *
   * Đây là năng lực của CHI NHÁNH, khác `bookings.play_mode` là lựa chọn của
   * từng đơn. Một chi nhánh có thể đáp ứng cả hai.
   */
  play_mode: blankAsUndefined(z.enum(['RENTAL', 'BYOC']).optional()).openapi({ example: 'RENTAL' }),
  /** Chỉ giữ chi nhánh còn slot đặt được trong ngày này (giờ Việt Nam). */
  date: blankAsUndefined(
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải theo định dạng YYYY-MM-DD')
      .optional(),
  ).openapi({ example: '2026-08-20' }),
});

const CafeUpsertBaseSchema = z.object({
  name: z.string().min(2).max(255).openapi({ example: 'RC Arena Sai Gon' }),
  description: z
    .string()
    .max(2000)
    .nullable()
    .optional()
    .openapi({ example: 'San RC trong nha voi duong drift va obstacle.' }),
  phone: BranchPhone.nullable().optional().openapi({ example: '0901234567' }),
  cover_image_url: z
    .string()
    .url()
    .nullable()
    .optional()
    .openapi({ example: 'https://cdn.rcfield.vn/cafes/rc-arena-cover.jpg' }),
  address: z.string().min(5).max(500).openapi({ example: '15 Hoang Van Thai' }),
  district: z.string().min(1).max(100).openapi({ example: 'Quan 7' }),
  city: z.string().min(1).max(100).openapi({ example: 'TP. Ho Chi Minh' }),
  latitude: z.number().min(-90).max(90).nullable().optional().openapi({ example: 10.7403 }),
  longitude: z.number().min(-180).max(180).nullable().optional().openapi({ example: 106.712 }),
  operating_hours: z
    .record(OperatingHourSchema)
    .refine((hours) => Object.keys(hours).length > 0, 'Cần cấu hình giờ hoạt động'),
  track_types: z
    .array(TrackTypeSchema)
    .min(1)
    .openapi({
      example: ['550e8400-e29b-41d4-a716-446655440000', '550e8400-e29b-41d4-a716-446655440001'],
    }),
  slot_duration_minutes: z.number().int().positive().max(1440).openapi({
    example: 60,
  }),
  slot_fee_rate: z.number().positive().openapi({ example: 50000 }),
  max_concurrent_bookings: z.number().int().positive().optional().default(10).openapi({
    example: 8,
  }),
  min_booking_notice_minutes: z.number().int().nonnegative().optional().default(60).openapi({
    example: 30,
  }),
  max_advance_booking_days: z.number().int().min(1).max(365).optional().default(30).openapi({
    example: 30,
  }),
  byoc_capacity: z.number().int().nonnegative().optional().default(5).openapi({ example: 4 }),
  amenity_ids: z.array(z.string().uuid()).optional().default([]),
  rules: z.array(z.string().min(1).max(500)).optional().default([]),
});

export const CreateCafeSchema = CafeUpsertBaseSchema.refine(
  (value) =>
    value.latitude !== undefined &&
    value.latitude !== null &&
    value.longitude !== undefined &&
    value.longitude !== null &&
    value.latitude !== 0 &&
    value.longitude !== 0,
  {
    message: 'Tọa độ latitude/longitude là bắt buộc và không được bằng 0',
    path: ['latitude'],
  },
);

export const UpdateCafeSchema = CafeUpsertBaseSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  'Cần ít nhất một trường để cập nhật',
);

export const UpdateCafeStatusSchema = z.object({
  status: z.nativeEnum(CafeStatus),
});

const PromotionBaseSchema = z.object({
  code: z
    .string()
    .min(3)
    .max(50)
    .regex(/^[A-Z0-9_-]+$/i, 'Mã ưu đãi chỉ gồm chữ, số, dấu gạch ngang hoặc gạch dưới')
    .transform((value) => value.trim().toUpperCase()),
  description: z.string().max(2000).nullable().optional(),
  discount_type: z.nativeEnum(DiscountType),
  discount_value: z.coerce.number().positive(),
  max_discount_amount: z.coerce.number().positive().nullable().optional(),
  min_order_amount: z.coerce.number().nonnegative().nullable().optional(),
  max_uses: z.coerce.number().int().positive().nullable().optional(),
  max_uses_per_user: z.coerce.number().int().positive().optional().default(1),
  applicable_to: z.nativeEnum(PromoApplicableTo).optional().default(PromoApplicableTo.ALL),
  starts_at: z.coerce.date(),
  expires_at: z.coerce.date().nullable().optional(),
  schedule_mode: z.nativeEnum(PromotionScheduleMode).optional().default(PromotionScheduleMode.ONCE),
  schedule_start_time: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable()
    .optional(),
  schedule_end_time: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable()
    .optional(),
  schedule_weekdays: z
    .array(z.enum(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']))
    .optional()
    .default([]),
  is_active: z.boolean().optional().default(true),
  show_on_cafe_page: z.boolean().optional().default(true),
});

export const CreatePromotionSchema = PromotionBaseSchema.refine(
  (value) => value.discount_type !== DiscountType.PERCENT || value.discount_value <= 100,
  'Giảm giá phần trăm không được vượt quá 100%',
)
  .refine(
    (value) => !value.expires_at || value.expires_at > value.starts_at,
    'Thời gian hết hạn phải sau thời gian bắt đầu',
  )
  .refine(
    (value) =>
      value.schedule_mode !== PromotionScheduleMode.WEEKLY || value.schedule_weekdays.length > 0,
    'Vui lòng chọn ít nhất một ngày trong tuần',
  )
  .refine(
    (value) =>
      value.schedule_mode === PromotionScheduleMode.ONCE ||
      Boolean(value.schedule_start_time && value.schedule_end_time && value.expires_at),
    'Lịch lặp cần có ngày kết thúc và khung giờ bắt đầu/kết thúc',
  );

export const UpdatePromotionSchema = PromotionBaseSchema.partial()
  .refine((value) => Object.keys(value).length > 0, 'Cần ít nhất một trường để cập nhật')
  .refine(
    (value) =>
      value.discount_type !== DiscountType.PERCENT ||
      value.discount_value === undefined ||
      value.discount_value <= 100,
    'Giảm giá phần trăm không được vượt quá 100%',
  )
  .refine(
    (value) => !value.expires_at || !value.starts_at || value.expires_at > value.starts_at,
    'Thời gian hết hạn phải sau thời gian bắt đầu',
  )
  .refine(
    (value) =>
      value.schedule_mode !== PromotionScheduleMode.WEEKLY ||
      !value.schedule_weekdays ||
      value.schedule_weekdays.length > 0,
    'Vui lòng chọn ít nhất một ngày trong tuần',
  );

// ── contests ────────────────────────────────────────────────────────────────

export const ContestCatalogTemplateQuerySchema = z.object({
  contest_type_id: z.string().uuid().optional(),
  contest_format_id: z.string().uuid().optional(),
  active_only: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true')
    .default('true'),
});

export const ContestListQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  scope: z.enum(['managed']).optional(),
  status: z.nativeEnum(ContestStatus).optional(),
  contest_type_id: z.string().uuid().optional(),
  contest_format_id: z.string().uuid().optional(),
  cafe_id: z.string().uuid().optional(),
  query: z.string().trim().min(1).max(200).optional(),
});

export const MyContestRegistrationsQuerySchema = z.object({
  query: z.string().trim().min(1).max(200).optional(),
  contest_status: z.nativeEnum(ContestStatus).optional(),
  customer_journey_status: z
    .enum([
      'PENDING_APPROVAL',
      'APPROVED_WAITING_CHECKIN',
      'CHECKED_IN_WAITING_BRACKET',
      'IN_BRACKET',
      'ADVANCED',
      'ELIMINATED',
      'FINISHED',
      'CANCELLED',
    ])
    .optional(),
});

export const ContestRegistrationsQuerySchema = z.object({
  query: z.string().trim().min(1).max(200).optional(),
  status: z.enum(['PENDING', 'CONFIRMED', 'CANCELLED', 'CHECKED_IN']).optional(),
  payment_status: z
    .enum(['NOT_REQUIRED', 'PENDING_PAYMENT', 'PENDING_REVIEW', 'WAIVED', 'MARKED_PAID'])
    .optional(),
});

export const ContestMatchesQuerySchema = z.object({
  round_no: z.coerce.number().int().positive().optional(),
  status: z.enum(['DRAFT', 'READY', 'RUNNING', 'COMPLETED', 'CANCELLED']).optional(),
  cafe_id: z.string().uuid().optional(),
  participant_query: z.string().trim().min(1).max(200).optional(),
});

const ContestVehicleRuleSchema = z.object({
  vehicle_policy: z.enum(['RENTAL_ONLY', 'BYOC_ONLY', 'MIXED']),
  assignment_policy: z.enum(['AT_CHECK_IN', 'PRE_ASSIGNED']).optional().default('AT_CHECK_IN'),
});

const ContestUpsertBaseSchema = z.object({
  name: z.string().trim().min(3).max(255),
  description: z.string().trim().max(5000).nullable().optional(),
  contest_type_id: z.string().uuid(),
  contest_format_id: z.string().uuid(),
  contest_template_id: z.string().uuid(),
  track_type_id: z.string().uuid(),
  participating_cafe_ids: z.array(z.string().uuid()).min(1).max(20),
  starts_at: z.coerce.date(),
  ends_at: z.coerce.date(),
  registration_opens_at: z.coerce.date(),
  registration_closes_at: z.coerce.date(),
  capacity: z.number().int().positive(),
  entry_fee: z.coerce.number().nonnegative().optional().default(0),
  banner_image_url: z.string().url().nullable().optional(),
  vehicle_rule: ContestVehicleRuleSchema,
  config: z.record(z.string(), z.unknown()).optional().default({}),
});

export const CreateContestSchema = ContestUpsertBaseSchema.refine(
  (value) => value.ends_at > value.starts_at,
  {
    message: 'ends_at phải sau starts_at',
    path: ['ends_at'],
  },
)
  // Cho phép registration_opens_at ở quá khứ ngay cả lúc tạo mới — dùng để
  // demo một giải "đã mở đăng ký sẵn" mà không phải tạo trước rồi sửa lại.
  // starts_at (khởi tranh) không bị đụng ở đây, vẫn phải là tương lai.
  .refine((value) => value.registration_opens_at < value.registration_closes_at, {
    message: 'registration_closes_at phải sau registration_opens_at',
    path: ['registration_closes_at'],
  })
  .refine((value) => value.registration_closes_at <= value.starts_at, {
    message: 'registration_closes_at phải trước hoặc bằng starts_at',
    path: ['registration_closes_at'],
  });

export const UpdateContestSchema = ContestUpsertBaseSchema.partial()
  .refine((value: Record<string, unknown>) => Object.keys(value).length > 0, {
    message: 'Cần ít nhất một trường để cập nhật',
  })
  .refine(
    (value) =>
      !value.starts_at || !value.ends_at || (value.ends_at as Date) > (value.starts_at as Date),
    {
      message: 'ends_at phải sau starts_at',
      path: ['ends_at'],
    },
  )
  .refine(
    (value) =>
      !value.registration_opens_at ||
      !value.registration_closes_at ||
      (value.registration_closes_at as Date) > (value.registration_opens_at as Date),
    {
      message: 'registration_closes_at phải sau registration_opens_at',
      path: ['registration_closes_at'],
    },
  )
  .refine(
    (value) =>
      !value.registration_closes_at ||
      !value.starts_at ||
      (value.registration_closes_at as Date) <= (value.starts_at as Date),
    {
      message: 'registration_closes_at phải trước hoặc bằng starts_at',
      path: ['registration_closes_at'],
    },
  );

export const CreateContestRegistrationSchema = z.object({
  vehicle_source: z.nativeEnum(VehicleSource).default(VehicleSource.RENTAL),
  // Thuê xe của quán chỉ cần chi nhánh và dòng xe: khung giờ do lịch thi đấu
  // quyết định, chiếc xe cụ thể do nhân viên gán lúc giao xe.
  rental: z
    .object({
      cafe_id: z.string().uuid(),
      vehicle_catalog_id: z.string().uuid(),
    })
    .optional()
    .nullable(),
  byoc_vehicle_name: z.string().trim().min(2).max(120).optional(),
  byoc_vehicle_brand: z.string().trim().min(1).max(120).optional(),
  byoc_vehicle_class: z.string().trim().min(1).max(120).optional(),
  byoc_vehicle_notes: z.string().trim().max(1000).optional(),
  // Ảnh xe do VĐV tự chụp lúc đăng ký. Ban tổ chức duyệt xe cá nhân dựa vào
  // đây; chỉ có mỗi tên xe gõ tay thì không đủ căn cứ để nói đạt hay không đạt.
  byoc_vehicle_photos: z.array(z.string().trim().url().max(2048)).max(6).optional(),
});

export const UpdateByocDeclarationSchema = z.object({
  vehicle_name: z.string().trim().min(2).max(120),
  vehicle_brand: z.string().trim().min(1).max(120).nullable().optional(),
  vehicle_class: z.string().trim().min(1).max(120).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  photos: z.array(z.string().trim().url().max(2048)).max(6).optional(),
});

export const ContestRegistrationActionSchema = z.object({
  reason: z.string().trim().max(1000).optional(),
});

/**
 * Từ chối là quyết định gạt một người ra khỏi giải, và lý do được gửi thẳng vào
 * thông báo cho họ — nên bắt buộc phải viết, khác với ghi chú thu tiền hay huỷ.
 */
export const ContestRejectRegistrationSchema = z.object({
  reason: z.string().trim().min(5, 'Cần nêu lý do từ chối (tối thiểu 5 ký tự)').max(1000),
});

export const ContestMarkFeePaidSchema = z.object({
  note: z.string().trim().max(1000).optional(),
});

export const ContestAssignStaffSchema = z.object({
  staff_id: z.string().uuid(),
});

// ── sổ thu chi giải đấu ──────────────────────────────────────────────────────

/**
 * Trường dùng chung cho mọi bút toán.
 *
 * `amount` là số nguyên dương: tiền Việt không có phần thập phân trong thực tế
 * vận hành, và DB đã có `CHECK (amount > 0)` làm lưới thứ hai. Muốn ghi giảm
 * thì tạo một khoản ở chiều ngược lại, không nhập số âm.
 */
const ContestLedgerBaseFields = {
  title: z.string().trim().min(1, 'Cần nhập tiêu đề khoản').max(255),
  amount: z
    .number()
    .int('Số tiền phải là số nguyên')
    .positive('Số tiền phải lớn hơn 0. Muốn ghi giảm thì tạo khoản ở chiều ngược lại.'),
  occurred_at: z.string().datetime({ offset: true }),
  note: z.string().trim().max(1000).optional(),
  receipt_url: z.string().url().max(2000).optional().nullable(),
};

/**
 * Tập `category` hợp lệ phụ thuộc `direction`, nên phải dùng discriminated union
 * chứ không phải một enum phẳng — nếu không, khoản thu sẽ nhận được loại
 * `PRIZE_CASH` và ngược lại.
 */
export const CreateContestLedgerEntrySchema = z.discriminatedUnion('direction', [
  z.object({
    direction: z.literal(ContestLedgerDirection.IN),
    category: z.nativeEnum(ContestLedgerIncomeCategory),
    ...ContestLedgerBaseFields,
  }),
  z.object({
    direction: z.literal(ContestLedgerDirection.OUT),
    category: z.nativeEnum(ContestLedgerExpenseCategory),
    ...ContestLedgerBaseFields,
  }),
]);

/**
 * `direction` cố ý KHÔNG sửa được: đổi chiều làm mọi con số trong nhật ký thao
 * tác mất nghĩa. Muốn đổi thì xoá rồi tạo lại.
 */
export const UpdateContestLedgerEntrySchema = z
  .object({
    category: z.string().trim().min(1).max(30),
    title: z.string().trim().min(1).max(255),
    amount: z.number().int().positive(),
    occurred_at: z.string().datetime({ offset: true }),
    note: z.string().trim().max(1000).nullable(),
    receipt_url: z.string().url().max(2000).nullable(),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Cần ít nhất một trường để cập nhật',
  });

export const ContestLedgerListQuerySchema = z.object({
  direction: z.nativeEnum(ContestLedgerDirection).optional(),
  category: z.string().trim().max(30).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
});

export const ContestBanCreateSchema = z.object({
  user_id: z.string().uuid(),
  scope_type: z.nativeEnum(ContestBanScopeType).default(ContestBanScopeType.CONTEST),
  reason: z.string().trim().min(3).max(1000),
  evidence: z.record(z.string(), z.unknown()).optional().default({}),
  expires_at: z.coerce.date().nullable().optional(),
});

export const ContestBanLiftSchema = z.object({
  reason: z.string().trim().max(1000).optional(),
});

export const ContestCheckInSchema = z.object({
  // Chiếc xe cụ thể nhân viên giao cho VĐV thuê xe, chọn ngay lúc điểm danh.
  rental_vehicle_id: z.string().uuid().optional().nullable(),
  checked_in_cafe_id: z.string().uuid(),
  byoc_confirmed: z.boolean().optional(),
  byoc_inspection: z
    .object({
      photos: z
        .array(
          z.object({
            url: z.string().url(),
            angle: z.string().trim().max(50).optional(),
            notes: z.string().trim().max(500).optional(),
          }),
        )
        .optional(),
      checklist: z
        .array(
          z.object({
            itemKey: z.string().trim().min(1).max(50),
            itemLabel: z.string().trim().min(1).max(120),
            status: z.enum(['OK', 'NOT_OK', 'NA']).optional(),
            note: z.string().trim().max(500).optional(),
          }),
        )
        .optional(),
    })
    .optional(),
});

const FeaturedPopupBaseSchema = z.object({
  title: z.string().trim().min(3).max(255),
  subtitle: z.string().trim().max(1000).nullable().optional(),
  image_url: z.string().url().nullable().optional(),
  cta_label: z.string().trim().min(1).max(80),
  cta_url: z.string().url().nullable().optional(),
  contest_id: z.string().uuid().nullable().optional(),
  placement: z
    .nativeEnum(FeaturedPopupPlacement)
    .optional()
    .default(FeaturedPopupPlacement.EXPLORE),
  audience_scope: z
    .nativeEnum(FeaturedPopupAudienceScope)
    .optional()
    .default(FeaturedPopupAudienceScope.ALL),
  starts_at: z.coerce.date(),
  ends_at: z.coerce.date(),
  is_active: z.boolean().optional().default(true),
  priority: z.coerce.number().int().min(0).max(1000).optional().default(100),
});

export const CreateFeaturedPopupSchema = FeaturedPopupBaseSchema.refine(
  (value) => value.ends_at > value.starts_at,
  {
    message: 'ends_at phải sau starts_at',
    path: ['ends_at'],
  },
);

export const UpdateFeaturedPopupSchema = FeaturedPopupBaseSchema.partial()
  .refine((value) => Object.keys(value).length > 0, 'Cần ít nhất một trường để cập nhật')
  .refine((value) => !value.starts_at || !value.ends_at || value.ends_at > value.starts_at, {
    message: 'ends_at phải sau starts_at',
    path: ['ends_at'],
  });

export const FeaturedPopupListQuerySchema = z.object({
  placement: z.nativeEnum(FeaturedPopupPlacement).optional(),
  is_active: z.coerce.boolean().optional(),
});

/**
 * Xử thua vắng mặt.
 *
 * Lý do bắt buộc vì đây là quyết định loại một người khỏi giải mà họ không được
 * thi đấu — phải có căn cứ ghi lại để đối chiếu khi có khiếu nại.
 */
export const FeaturedPopupReviewSchema = z.object({
  approve: z.boolean(),
  notes: z.string().trim().max(1000).optional(),
});

export const ContestFeeOrderCreateSchema = z.object({
  plan_id: z.string().uuid('Gói tổ chức giải không hợp lệ'),
});

export const ContestFeeTransferSchema = z.object({
  transfer_reference: z
    .string()
    .trim()
    .min(3, 'Nhập mã giao dịch hoặc nội dung chuyển khoản')
    .max(255),
  transfer_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày chuyển khoản không hợp lệ'),
  transfer_amount: z.number().positive('Số tiền chuyển khoản phải lớn hơn 0'),
});

/** Mã đơn PayOS luôn là số nguyên dương; nhận cả chuỗi vì query string gửi lên là chuỗi. */
export const ContestFeePayOSVerifySchema = z.object({
  order_code: z.coerce.number().int().positive('Mã đơn PayOS không hợp lệ'),
});

export const ContestFeeOrderReviewSchema = z.object({
  notes: z.string().trim().max(1000).optional(),
});

export const ContestFeeOrderRejectSchema = z.object({
  reason: z.string().trim().min(5, 'Cần nêu lý do từ chối (tối thiểu 5 ký tự)').max(1000),
});

export const ContestMatchWalkoverSchema = z.object({
  absent: z
    .array(
      z.object({
        registration_id: z.string().uuid(),
        status: z.enum(['DNS', 'DNF', 'DQ'], {
          message: 'Lý do vắng mặt phải là DNS, DNF hoặc DQ',
        }),
      }),
    )
    .min(1, 'Cần chọn ít nhất một người vắng mặt'),
  reason: z.string().trim().min(5, 'Cần nêu lý do xử thua (tối thiểu 5 ký tự)').max(1000),
});

export const ContestGenerateMatchesSchema = z.object({
  cafe_id: z.string().uuid(),
  track_config_id: z.string().uuid().nullable().optional(),
  // Bỏ trống thì hệ thống tự lấy toàn bộ người đủ điều kiện của giải — đúng
  // cách bốc thăm: ban tổ chức không chọn ai vào ai ra.
  registration_ids: z.array(z.string().uuid()).optional(),
  drivers_per_match: z.number().int().positive().max(64).optional(),
  seeding_mode: z.enum(['MANUAL', 'CHECK_IN_ORDER']).optional(),
});

export const ContestMatchParticipantsUpdateSchema = z.object({
  participants: z
    .array(
      z.object({
        registration_id: z.string().uuid(),
        slot_no: z.number().int().positive(),
        lane: z.string().trim().max(20).nullable().optional(),
        grid_position: z.number().int().positive().nullable().optional(),
        seed_no: z.number().int().positive().nullable().optional(),
      }),
    )
    .min(1),
});

export const ContestSubmitResultsSchema = z.object({
  results: z
    .array(
      z
        .object({
          registration_id: z.string().uuid(),
          finish_position: z.number().int().positive().nullable().optional(),
          score: z.coerce.number().nullable().optional(),
          best_lap_seconds: z.coerce.number().positive().nullable().optional(),
          total_time_seconds: z.coerce.number().positive().nullable().optional(),
          is_winner: z.boolean().optional().default(false),
          result_note: z.string().trim().max(1000).nullable().optional(),
          status: z.nativeEnum(ContestParticipantStatus).optional(),
        })
        .refine(
          (value) =>
            value.best_lap_seconds === null ||
            value.best_lap_seconds === undefined ||
            value.total_time_seconds === null ||
            value.total_time_seconds === undefined ||
            value.total_time_seconds >= value.best_lap_seconds,
          {
            message: 'total_time_seconds phải lớn hơn hoặc bằng best_lap_seconds',
            path: ['total_time_seconds'],
          },
        ),
    )
    .min(1)
    .superRefine((results, ctx) => {
      const finishPositions = new Map<number, number[]>();
      for (const [index, result] of results.entries()) {
        if (result.finish_position !== null && result.finish_position !== undefined) {
          const indices = finishPositions.get(result.finish_position) ?? [];
          indices.push(index);
          finishPositions.set(result.finish_position, indices);
        }
      }
      for (const [position, indices] of finishPositions.entries()) {
        if (indices.length > 1) {
          for (const index of indices) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `finish_position ${position} bị trùng trong cùng match`,
              path: [index, 'finish_position'],
            });
          }
        }
      }
    }),
  reason: z.string().trim().min(1).max(1000),
});

export const ContestCorrectResultsSchema = ContestSubmitResultsSchema.extend({
  force_cascade: z.boolean().optional().default(false),
});

export const ContestAuditLogsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(200).optional().default(20),
});

export const ContestEntryPaymentCreateSchema = z.object({
  return_url: z.string().url().optional(),
});

export const PromotionIdParamsSchema = z.object({
  promotionId: z.string().uuid(),
});

export const PreviewPromoSchema = z.object({
  code: z
    .string()
    .min(1)
    .max(50)
    .transform((v) => v.trim().toUpperCase()),
  play_mode: z.enum(['RENTAL', 'BYOC']),
  slot_start: z.string().datetime({ offset: true }),
  subtotal: z.coerce.number().nonnegative(),
});

const PackageBaseSchema = z.object({
  code: z
    .string()
    .min(3)
    .max(50)
    .regex(/^[A-Z0-9-]+$/i, 'Mã gói chỉ gồm chữ, số hoặc dấu gạch ngang')
    .transform((value) => value.trim().toUpperCase()),
  name: z.string().trim().min(2).max(255),
  description: z.string().trim().max(2000).nullable().optional(),
  slot_count: z.coerce.number().int().positive(),
  billing_period: z.nativeEnum(PackageBillingPeriod),
  price: z.coerce.number().positive(),
  benefits: z.array(z.string().trim().min(1).max(255)).optional().default([]),
  applicable_play_modes: z
    .array(z.enum(['RENTAL', 'BYOC']))
    .min(1)
    .optional()
    .default(['RENTAL', 'BYOC']),
  is_popular: z.boolean().optional().default(false),
  is_active: z.boolean().optional().default(true),
});

export const CreatePackageSchema = PackageBaseSchema;

export const UpdatePackageSchema = PackageBaseSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  'Cần ít nhất một trường để cập nhật',
);

export const PackageIdParamsSchema = z.object({
  packageId: z.string().uuid(),
});

export const CafeImageCreateSchema = z.object({
  sort_order: z.coerce.number().int().min(0).optional().default(0),
});

export const CafeIdParamsSchema = z.object({
  cafeId: z.string().uuid().openapi({ example: '8e7f7c2a-6a5b-4a4c-9b9e-63b3e8c1f001' }),
});

export const CafeImageIdParamsSchema = z.object({
  id: z.string().uuid().openapi({ example: '9f4c9fb0-9c28-4b6b-a9c2-fdd4d13d1001' }),
});

export const CafeImageUploadSchema = z.object({
  files: z.array(z.string().openapi({ format: 'binary' })).min(1),
  sort_order: z.coerce.number().int().min(0).optional().default(0).openapi({ example: 0 }),
});

const CafePromotionSummarySchema = z.object({
  code: z.string().openapi({ example: 'SUMMER25' }),
  description: z.string().nullable().openapi({ example: 'Giảm 25% cho slot đầu tiên' }),
  discount_type: z.nativeEnum(DiscountType).openapi({ example: DiscountType.PERCENT }),
  discount_value: z.number().openapi({ example: 25 }),
  max_discount_amount: z.number().nullable().openapi({ example: 50000 }),
  min_order_amount: z.number().nullable().openapi({ example: 100000 }),
  applicable_to: z.nativeEnum(PromoApplicableTo).openapi({ example: PromoApplicableTo.ALL }),
  expires_at: z.string().datetime().nullable().openapi({ example: '2026-08-01T00:00:00.000Z' }),
});

const TrackTypeResponseSchema = z.object({
  id: z.string().uuid().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' }),
  code: z.string().openapi({ example: 'DRIFT' }),
  name: z.string().openapi({ example: 'Drift' }),
  description: z.string().nullable().openapi({ example: 'Đường đua drift' }),
  sortOrder: z.number().int().openapi({ example: 0 }),
  isActive: z.boolean().openapi({ example: true }),
});

export const CafeResponseSchema = z.object({
  id: z.string().uuid().openapi({ example: '8e7f7c2a-6a5b-4a4c-9b9e-63b3e8c1f001' }),
  providerId: z.string().uuid().openapi({ example: '7f8d1fd7-5334-47e5-94a8-a8f69a70d001' }),
  name: z.string().openapi({ example: 'RC Arena Sai Gon' }),
  slug: z.string().openapi({ example: 'rc-arena-sai-gon' }),
  description: z.string().nullable().openapi({
    example: 'San RC trong nha voi duong drift va obstacle.',
  }),
  phone: z.string().nullable().openapi({ example: '0901234567' }),
  status: z.nativeEnum(CafeStatus).openapi({ example: CafeStatus.ACTIVE }),
  coverImageUrl: z.string().nullable().openapi({
    example: 'https://cdn.rcfield.vn/cafes/rc-arena-cover.jpg',
  }),
  address: z.string().openapi({ example: '15 Hoang Van Thai' }),
  district: z.string().openapi({ example: 'Quan 7' }),
  city: z.string().openapi({ example: 'TP. Ho Chi Minh' }),
  latitude: z.number().nullable().openapi({ example: 10.7403 }),
  longitude: z.number().nullable().openapi({ example: 106.712 }),
  operatingHours: z.record(OperatingHourSchema),
  trackTypes: z.array(TrackTypeResponseSchema).openapi({ example: [] }),
  slotDurationMinutes: z.number().int().openapi({ example: 60 }),
  slotFeeRate: z.string().openapi({ example: '50000.00' }),
  maxConcurrentBookings: z.number().int().openapi({ example: 8 }),
  minBookingNoticeMinutes: z.number().int().openapi({ example: 30 }),
  byocCapacity: z.number().int().openapi({ example: 4 }),
  amenityIds: z.array(z.string().uuid()).openapi({ example: [] }),
  amenities: z
    .array(
      z.object({
        id: z.string().uuid(),
        title: z.string(),
        description: z.string().nullable(),
        icon: z.string(),
        sortOrder: z.number().int(),
        createdAt: z.string().datetime(),
        updatedAt: z.string().datetime(),
      }),
    )
    .openapi({ example: [] }),
  rating: z.number().openapi({ example: 4.8 }),
  reviewsCount: z.number().int().openapi({ example: 124 }),
  minPrice: z.number().openapi({ example: 50000 }),
  activePromotions: z.array(CafePromotionSummarySchema).openapi({ example: [] }),
  rules: z.array(z.string()).openapi({ example: [] }),
  createdAt: z.string().datetime().openapi({ example: '2026-05-27T09:00:00.000Z' }),
  updatedAt: z.string().datetime().openapi({ example: '2026-05-27T09:00:00.000Z' }),
  deletedAt: z.string().datetime().nullable().openapi({ example: null }),
});

export const CafeImageResponseSchema = z.object({
  id: z.string().uuid().openapi({ example: '9f4c9fb0-9c28-4b6b-a9c2-fdd4d13d1001' }),
  cafeId: z.string().uuid().openapi({ example: '8e7f7c2a-6a5b-4a4c-9b9e-63b3e8c1f001' }),
  url: z
    .string()
    .url()
    .openapi({ example: 'https://res.cloudinary.com/rcfield/image/upload/v1/cafes/track-1.png' }),
  sortOrder: z.number().int().openapi({ example: 0 }),
  createdAt: z.string().datetime().openapi({ example: '2026-05-27T09:00:00.000Z' }),
});

export const CreateAmenitySchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().max(500).nullable().optional(),
  icon: z.string().min(1).max(50),
  sort_order: z.number().int().nonnegative().optional().default(0),
});
export const UpdateAmenitySchema = CreateAmenitySchema.partial().refine(
  (v) => Object.keys(v).length > 0,
  'Cần ít nhất một trường để cập nhật',
);

// ── menu ─────────────────────────────────────────────────────────────────────

export const MenuListQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1).openapi({ example: 1 }),
  limit: z.coerce.number().int().positive().max(100).optional().default(20).openapi({
    example: 20,
  }),
  // uuid của danh mục, hoặc literal 'none' để lọc riêng nhóm "Chưa phân loại"
  category_id: z
    .union([z.string().uuid(), z.literal('none')])
    .optional()
    .openapi({ example: '9b1c7c2a-6a5b-4a4c-9b9e-63b3e8c1f002' }),
  available: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true'))
    .openapi({ example: 'true' }),
});

const MenuImageUrlSchema = z
  .string()
  .trim()
  .refine(
    (value) => /^https?:\/\//i.test(value) || value.startsWith('/images/menu/'),
    'image_url phải là URL hợp lệ hoặc asset menu nội bộ',
  );

export const MenuVariantSchema = z.object({
  name: z.string().trim().min(1).max(80),
  price: z.coerce.number().nonnegative(),
  is_available: z.boolean().optional().default(true),
});

export const CreateMenuItemSchema = z.object({
  name: z.string().trim().min(2).max(255).openapi({ example: 'Cold Brew Nitro' }),
  description: z
    .string()
    .trim()
    .max(2000)
    .nullable()
    .optional()
    .openapi({ example: 'Ca phe lanh nitro dung kem muoi.' }),
  price: z.coerce.number().nonnegative().openapi({ example: 55000 }),
  // null / bỏ trống = "Chưa phân loại"
  category_id: z
    .string()
    .uuid()
    .nullable()
    .optional()
    .openapi({ example: '9b1c7c2a-6a5b-4a4c-9b9e-63b3e8c1f002' }),
  image_url: MenuImageUrlSchema.nullable()
    .optional()
    .openapi({ example: 'https://cdn.rcfield.vn/menu/cold-brew.jpg' }),
  is_available: z.boolean().optional().default(true).openapi({ example: true }),
  variants: z.array(MenuVariantSchema).max(12).optional(),
});

export const UpdateMenuItemSchema = CreateMenuItemSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  'Cần ít nhất một trường để cập nhật',
);

export const CreateComboSchema = z.object({
  name: z.string().trim().min(2).max(255),
  description: z.string().trim().max(2000).nullable().optional(),
  price: z.coerce.number().nonnegative(),
  // Provider tự gán danh mục cho combo giống món lẻ — hệ thống KHÔNG tự gán (FR-013)
  category_id: z.string().uuid().nullable().optional(),
  image_url: MenuImageUrlSchema.nullable().optional(),
  is_available: z.boolean().optional().default(true),
  components: z
    .array(
      z.object({
        item_id: z.string().uuid(),
        variant_id: z.string().uuid().nullable().optional(),
        quantity: z.number().int().positive().max(99),
      }),
    )
    .min(2, 'Combo phải có ít nhất 2 món'),
});

export const UpdateComboSchema = CreateComboSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  'Cần ít nhất một trường để cập nhật',
);

export const MenuItemParamsSchema = z.object({
  cafeId: z.string().uuid().openapi({ example: '8e7f7c2a-6a5b-4a4c-9b9e-63b3e8c1f001' }),
  itemId: z.string().uuid().openapi({ example: '56d971ce-83ef-4456-b391-7f5673f88001' }),
});

// ── menu categories ───────────────────────────────────────────────────────────

/** Tên danh mục: bắt buộc, trim, 1–50 ký tự (FR-007, FR-008). */
const MenuCategoryNameSchema = z
  .string()
  .trim()
  .min(1, 'Tên danh mục không được để trống')
  .max(50, 'Tên danh mục tối đa 50 ký tự')
  .openapi({ example: 'Cà phê' });

export const CreateMenuCategorySchema = z.object({
  name: MenuCategoryNameSchema,
});

export const UpdateMenuCategorySchema = z.object({
  name: MenuCategoryNameSchema,
});

export const ReorderMenuCategoriesSchema = z.object({
  category_ids: z
    .array(z.string().uuid())
    .min(1, 'Cần ít nhất một danh mục')
    .openapi({ example: ['9b1c7c2a-6a5b-4a4c-9b9e-63b3e8c1f002'] }),
});

export const MenuCategoryParamsSchema = z.object({
  cafeId: z.string().uuid().openapi({ example: '8e7f7c2a-6a5b-4a4c-9b9e-63b3e8c1f001' }),
  categoryId: z.string().uuid().openapi({ example: '9b1c7c2a-6a5b-4a4c-9b9e-63b3e8c1f002' }),
});

export const MenuCategoryResponseSchema = z.object({
  id: z.string().uuid().openapi({ example: '9b1c7c2a-6a5b-4a4c-9b9e-63b3e8c1f002' }),
  cafeId: z.string().uuid().openapi({ example: '8e7f7c2a-6a5b-4a4c-9b9e-63b3e8c1f001' }),
  name: z.string().openapi({ example: 'Cà phê' }),
  displayOrder: z.number().int().openapi({ example: 0 }),
  itemCount: z.number().int().openapi({ example: 6 }),
  createdAt: z.string().datetime().openapi({ example: '2026-07-25T09:00:00.000Z' }),
  updatedAt: z.string().datetime().openapi({ example: '2026-07-25T09:00:00.000Z' }),
});

export const MenuItemResponseSchema = z.object({
  id: z.string().uuid().openapi({ example: '56d971ce-83ef-4456-b391-7f5673f88001' }),
  cafeId: z.string().uuid().openapi({ example: '8e7f7c2a-6a5b-4a4c-9b9e-63b3e8c1f001' }),
  name: z.string().openapi({ example: 'Cold Brew Nitro' }),
  description: z.string().nullable().openapi({ example: 'Ca phe lanh nitro dung kem muoi.' }),
  price: z.string().openapi({ example: '55000.00' }),
  categoryId: z
    .string()
    .uuid()
    .nullable()
    .openapi({ example: '9b1c7c2a-6a5b-4a4c-9b9e-63b3e8c1f002' }),
  categoryName: z.string().nullable().openapi({ example: 'Do uong' }),
  imageUrl: z.string().nullable().openapi({ example: 'https://cdn.rcfield.vn/menu/cold-brew.jpg' }),
  isAvailable: z.boolean().openapi({ example: true }),
  variants: z
    .array(
      z.object({
        id: z.string().uuid(),
        name: z.string(),
        price: z.string(),
        displayOrder: z.number().int(),
        isAvailable: z.boolean(),
      }),
    )
    .default([]),
  components: z
    .array(
      z.object({
        itemId: z.string().uuid(),
        name: z.string(),
        variantId: z.string().uuid().nullable(),
        variantName: z.string().nullable(),
        variantPrice: z.string().nullable(),
        quantity: z.number().int(),
      }),
    )
    .optional(),
  createdAt: z.string().datetime().openapi({ example: '2026-05-27T09:00:00.000Z' }),
  updatedAt: z.string().datetime().openapi({ example: '2026-05-27T09:00:00.000Z' }),
  deletedAt: z.string().datetime().nullable().openapi({ example: null }),
});

// ── fb-channel ────────────────────────────────────────────────────────────────

export const FbChannelQuerySchema = z.object({
  cafeId: z.string().uuid('cafeId phải là UUID hợp lệ'),
  returnPath: z.string().startsWith('/').optional(),
});

export const CreateVnpayPaymentSchema = z.object({
  amount: z.coerce.number().int().positive('amount phải lớn hơn 0'),
  txn_ref: z.string().trim().min(1).max(100),
  order_info: z.string().trim().min(1).max(255),
  order_type: z.string().trim().min(1).max(100).optional(),
  bank_code: z.string().trim().min(1).max(20).optional(),
  return_url: z.string().url().optional(),
});

// ── provider-onboarding & subscription ───────────────────────────────────────

export const RegisterProviderSchema = z.object({
  email: z.string().email('Email không hợp lệ'),
  password: z.string().min(8, 'Mật khẩu tối thiểu 8 ký tự'),
  full_name: z.string().min(2).max(255),
  phone: MobilePhone.optional(),
  business_name: z.string().min(2).max(255),
  business_description: z.string().max(1000).optional(),
  // Mã số thuế Việt Nam: 10 số, hoặc 13 số khi có mã đơn vị phụ thuộc (dạng
  // 0123456789-001). Nhận cả khi người dùng gõ kèm dấu cách rồi tự chuẩn hoá.
  tax_code: z
    .string()
    .trim()
    .transform((value) => value.replace(/\s+/g, ''))
    .pipe(z.string().regex(/^\d{10}(-\d{3})?$/, 'Mã số thuế phải là 10 số, hoặc 10 số kèm -001')),
  business_email: z.string().trim().email('Email doanh nghiệp không hợp lệ').max(255),
  business_type: z.enum(['INDIVIDUAL', 'BUSINESS'], {
    errorMap: () => ({ message: 'business_type phải là INDIVIDUAL hoặc BUSINESS' }),
  }),
});

/** Provider tự sửa hồ sơ doanh nghiệp của mình. */
export const UpdateProviderProfileSchema = z
  .object({
    business_name: z.string().min(2).max(255).optional(),
    business_description: z.string().max(1000).nullable().optional(),
    tax_code: z
      .string()
      .trim()
      .transform((value) => value.replace(/\s+/g, ''))
      .pipe(z.string().regex(/^\d{10}(-\d{3})?$/, 'Mã số thuế phải là 10 số, hoặc 10 số kèm -001'))
      .optional(),
    business_email: z.string().trim().email('Email doanh nghiệp không hợp lệ').max(255).optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Không có thông tin nào để cập nhật',
  });

export const SubmitPaymentRequestSchema = z.object({
  plan_id: z.string().uuid('plan_id phải là UUID hợp lệ'),
  transfer_reference: z.string().min(1).max(255),
  transfer_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'transfer_date phải có định dạng YYYY-MM-DD'),
  transfer_amount: z.number().positive('Số tiền phải lớn hơn 0'),
});

export const GetPayOSLinkSchema = z
  .object({
    plan_id: z.string().uuid('plan_id phải là UUID hợp lệ').optional(),
    payment_request_id: z.string().uuid('payment_request_id phải là UUID hợp lệ').optional(),
  })
  .refine((data) => data.plan_id || data.payment_request_id, {
    message: 'Cần truyền plan_id hoặc payment_request_id',
  });

export const AdminRejectSchema = z.object({
  reason: z.string().min(1).max(500),
});

export const AdminSuspendSchema = z.object({
  reason: z.string().min(1).max(500),
});

export const NotificationQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  unread_only: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

export const RegisterPushTokenSchema = z.object({
  token: z
    .string()
    .min(10)
    .max(500)
    .refine(
      (value) => value.startsWith('ExpoPushToken[') || value.startsWith('ExponentPushToken['),
      'Expo push token không hợp lệ',
    ),
  platform: z.enum(['ios', 'android', 'web']).optional(),
  device_id: z.string().max(255).nullable().optional(),
  device_name: z.string().max(255).nullable().optional(),
  app_version: z.string().max(50).nullable().optional(),
});

export const UnregisterPushTokenSchema = z.object({
  token: z.string().min(10).max(500),
});

export const AdminPaymentRequestQuerySchema = z.object({
  status: z.enum(['PENDING', 'CONFIRMED', 'REJECTED']).optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
});

export const AdminProviderQuerySchema = z.object({
  status: z.enum(['PENDING', 'ACTIVE', 'REJECTED', 'SUSPENDED']).optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
});

export const AdminConfirmPaymentSchema = z.object({
  notes: z.string().max(500).optional(),
});

export const UpdateSubscriptionPlanSchema = z.object({
  branch_limit: z.number().int().min(-1).optional(),
  ai_quota_per_month: z.number().int().min(-1).optional(),
  channel_limit: z.number().int().min(-1).optional(),
  price_per_month: z.number().min(0).optional(),
});

export const WidgetConfigSchema = z.object({
  greeting_message: z.string().max(200).optional(),
  position: z.enum(['BOTTOM_RIGHT', 'BOTTOM_LEFT']).optional(),
  primary_color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  avatar_url: z.string().url().nullable().optional(),
  quick_replies: z.array(z.string().max(50)).max(5).optional(),
  system_prompt: z.string().max(2000).nullable().optional(),
});

// ── vehicle catalog ──────────────────────────────────────────────────────────

const AssetTierSchema = z.nativeEnum(AssetTier);

export const CreateVehicleCatalogSchema = z.object({
  name: z.string().min(2).max(255).openapi({ example: 'Tamiya TT-02 Drift Spec' }),
  description: z
    .string()
    .max(2000)
    .nullable()
    .optional()
    .openapi({ example: 'Phù hợp cho người mới bắt đầu chơi drift.' }),
  tier: AssetTierSchema.openapi({ example: AssetTier.STANDARD }),
  hourly_rate: z.number().nonnegative().openapi({ example: 40000 }),
  security_deposit: z.number().nonnegative().optional().default(0).openapi({ example: 0 }),
  compatible_track_types: z
    .array(TrackTypeSchema)
    .min(1)
    .openapi({ example: ['550e8400-e29b-41d4-a716-446655440000'] }),
  cover_image_url: z
    .string()
    .url()
    .nullable()
    .optional()
    .openapi({ example: 'https://res.cloudinary.com/rcfield/image/upload/v1/vehicles/tamiya.jpg' }),
  images: z
    .array(
      z.object({
        url: z.string().url(),
        sort_order: z.number().int().min(0).optional().default(0),
      }),
    )
    .optional()
    .openapi({
      example: [
        {
          url: 'https://res.cloudinary.com/rcfield/image/upload/v1/vehicles/tamiya-2.jpg',
          sort_order: 1,
        },
      ],
    }),
});

export const UpdateVehicleCatalogSchema = CreateVehicleCatalogSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  'Cần ít nhất một trường để cập nhật',
);

export const VehicleCatalogIdParamsSchema = z.object({
  catalogId: z.string().uuid().openapi({ example: '9f4c9fb0-9c28-4b6b-a9c2-fdd4d13d1002' }),
});

export const CreateVehicleUnitSchema = z.object({
  status: z.nativeEnum(VehicleStatus).optional().default(VehicleStatus.AVAILABLE),
  identifier: z.string().max(255).nullable().optional(),
  color: z.string().max(100).nullable().optional(),
  distinctive_image_url: z.string().url().nullable().optional(),
  notes: z.string().nullable().optional(),
  metadata: z.record(z.any()).nullable().optional(),
});

export const UpdateVehicleUnitSchema = z
  .object({
    status: z.nativeEnum(VehicleStatus).optional(),
    last_maintenance_at: z.string().datetime().nullable().optional(),
    identifier: z.string().max(255).nullable().optional(),
    color: z.string().max(100).nullable().optional(),
    distinctive_image_url: z.string().url().nullable().optional(),
    notes: z.string().nullable().optional(),
    metadata: z.record(z.any()).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Cần ít nhất một trường để cập nhật');

export const VehicleUnitIdParamsSchema = z.object({
  catalogId: z.string().uuid(),
  unitId: z.string().uuid(),
});

export const ListVehicleUnitsQuerySchema = z.object({
  status: z.nativeEnum(VehicleStatus).optional(),
  catalog_id: z.string().uuid().optional(),
  search: z.string().optional(),
  exclude_retired: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

// ── cafe widget config ────────────────────────────────────────────────────────
export const UpsertWidgetConfigSchema = z.object({
  greeting_message: z.string().max(500).optional(),
  welcome_message: z.string().max(500).optional(),
  position: z.enum(['BOTTOM_RIGHT', 'BOTTOM_LEFT']).optional(),
  primary_color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  avatar_url: z.string().url().nullable().optional(),
  quick_replies: z.array(z.string().max(100)).max(6).optional(),
  system_prompt: z.string().max(4000).nullable().optional(),
  is_enabled: z.boolean().optional(),
  full_page_enabled: z.boolean().optional(),
});

// ── cafe_track_configs ────────────────────────────────────────────────────────

export const CreateCafeTrackConfigSchema = z
  .object({
    track_type_id: z.string().uuid(),
    max_concurrent: z.coerce.number().int().min(0),
    byoc_capacity: z.coerce.number().int().min(0),
    description: z.string().max(500).optional(),
    sort_order: z.coerce.number().int().min(0).optional().default(0),
  })
  .refine((b) => b.max_concurrent > 0 || b.byoc_capacity > 0, {
    message: 'Ít nhất một trong hai phải lớn hơn 0: max_concurrent hoặc byoc_capacity',
    path: ['max_concurrent'],
  });

export const UpdateCafeTrackConfigSchema = z
  .object({
    max_concurrent: z.coerce.number().int().min(0).optional(),
    byoc_capacity: z.coerce.number().int().min(0).optional(),
    description: z.string().max(500).nullable().optional(),
    images: z.array(z.string().url()).max(20).optional(),
    sort_order: z.coerce.number().int().min(0).optional(),
    is_active: z.boolean().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'At least one field required' });

// ── bookings ──────────────────────────────────────────────────────────────────

const ParticipantSchema = z.object({
  user_id: z.string().uuid().optional(),
  participant_type: z.nativeEnum(BookingParticipantType),
  guest_name: z.string().max(255).optional(),
  guest_phone: MobilePhone.optional(),
});

const FnbItemSchema = z.object({
  menu_item_id: z.string().uuid(),
  variant_id: z.string().uuid().optional(),
  quantity: z.number().int().min(1),
  notes: z.string().max(500).optional(),
});

/** Direct on-site orders from staff: price is deliberately absent. */
export const AddSessionFnbOrderSchema = z.object({
  items: z
    .array(
      z.object({
        menu_item_id: z.string().uuid(),
        variant_id: z.string().uuid().optional(),
        quantity: z.number().int().min(1).max(99),
        notes: z.string().trim().max(500).optional(),
      }),
    )
    .min(1, 'Không có sản phẩm nào được chọn')
    .max(30),
});

export const CreateBookingSchema = z.object({
  cafe_id: z.string().uuid(),
  play_mode: z.nativeEnum(BookingMode),
  track_type_id: z.string().uuid().optional(),
  track_config_id: z.string().uuid().optional(),
  slot_start: z.string().datetime({ offset: true }),
  slot_end: z.string().datetime({ offset: true }),
  vehicle_ids: z.array(z.string().uuid()).default([]),
  participants: z.array(ParticipantSchema).min(0).default([]),
  fnb_items: z.array(FnbItemSchema).default([]),
  promotion_code: z.string().max(50).optional(),
  customer_package_id: z.string().uuid().optional(),
});

export const CancelBookingSchema = z.object({
  reason: z.string().max(500).optional(),
});

export const ConfirmRefundSchema = z.object({
  method: z.enum(['CASH', 'BANK_TRANSFER']),
});

export const CreateContestRentalBookingSchema = z.object({
  contest_id: z.string().uuid(),
  cafe_id: z.string().uuid(),
  slot_start: z.string().datetime({ offset: true }),
  slot_end: z.string().datetime({ offset: true }),
  track_config_id: z.string().uuid().optional(),
  vehicle_catalog_id: z.string().uuid().optional(),
});

export const ListCafeBookingsSchema = z
  .object({
    // `date` is retained for clients that request one day. Omitting every
    // date field intentionally returns the booking history with pagination.
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    from: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    to: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    status: z.nativeEnum(BookingStatus).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .superRefine((value, context) => {
    if (value.date && (value.from || value.to)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['date'],
        message: 'Chỉ dùng date hoặc cặp from/to, không dùng đồng thời.',
      });
    }

    if ((value.from && !value.to) || (!value.from && value.to)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: value.from ? ['to'] : ['from'],
        message: 'Cần cung cấp cả from và to khi lọc theo khoảng ngày.',
      });
    }

    if (value.from && value.to && value.from > value.to) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['to'],
        message: 'Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.',
      });
    }
  });

export const ListCafeSessionsSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.nativeEnum(SessionStatus).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const ListMyBookingsSchema = z.object({
  status: z.nativeEnum(BookingStatus).optional(),
  play_mode: z.nativeEnum(BookingMode).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const CheckAvailabilitySchema = z.object({
  slot_start: z.string().datetime({ offset: true }),
  slot_end: z.string().datetime({ offset: true }),
  play_mode: z.nativeEnum(BookingMode),
  track_type_id: z.string().uuid().optional(),
  track_config_id: z.string().uuid().optional(),
});

// ── customer_packages ─────────────────────────────────────────────────────────

export const PurchasePackageSchema = z.object({
  return_url: z.string().url().optional(),
  /**
   * Mặc định VNPay để giữ nguyên hành vi của những chỗ gọi cũ chưa khai trường
   * này. Khách chọn chuyển khoản thì tiền về thẳng tài khoản chi nhánh bán gói.
   */
  gateway: z.enum(['vnpay', 'bank_transfer']).optional().default('vnpay'),
});

export const ListMyPackagesQuerySchema = z.object({
  status: z.nativeEnum(CustomerPackageStatus).optional(),
  cafe_id: z.string().uuid().optional(),
});

// ── staff fnb ─────────────────────────────────────────────────────────────────

export const UpdateFnbOrderStatusSchema = z.object({
  status: z.nativeEnum(FnbOrderStatus),
});

// ── pricing ───────────────────────────────────────────────────────────────────

const PeakHourInputSchema = z
  .object({
    start: z.string().regex(/^\d{2}:\d{2}$/),
    end: z.string().regex(/^\d{2}:\d{2}$/),
    multiplier: z.number().min(1.0).max(10.0),
  })
  .refine((d) => d.start < d.end, { message: 'start must be before end' });

export const UpdatePricingRulesSchema = z
  .object({
    weekend_multiplier: z.number().min(1.0).max(10.0).nullable(),
    peak_hours: z.array(PeakHourInputSchema).max(5),
  })
  .refine(
    (d) => {
      const windows = d.peak_hours;
      for (let i = 0; i < windows.length; i++) {
        for (let j = i + 1; j < windows.length; j++) {
          if (windows[i].start < windows[j].end && windows[j].start < windows[i].end) return false;
        }
      }
      return true;
    },
    { message: 'Peak hour windows must not overlap' },
  );

export const PricingPreviewQuerySchema = z.object({
  slot_start: z.string().datetime({ offset: true }),
  slot_end: z.string().datetime({ offset: true }),
});

export const CreateHolidaySchema = z.object({
  date: z.string().date(),
  name: z.string().min(1).max(255),
  multiplier: z.number().min(1.0).max(10.0),
});

export const UpdateHolidaySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  multiplier: z.number().min(1.0).max(10.0),
});

export const ListHolidaysQuerySchema = z.object({
  year: z.coerce.number().int().min(2024).max(2099).optional(),
});

// ── reviews ───────────────────────────────────────────────────────────────────

export const CreateReviewSchema = z.object({
  booking_id: z.string().uuid(),
  overall_score: z.number().int().min(1).max(5),
  vehicle_score: z.number().int().min(1).max(5).nullable().optional(),
  staff_score: z.number().int().min(1).max(5).nullable().optional(),
  facility_score: z.number().int().min(1).max(5).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
});

export const UpdateReviewVisibilitySchema = z.object({
  status: z.nativeEnum(ReviewStatus),
});

export const ProviderReviewQuerySchema = z.object({
  cafe_id: z.string().uuid().optional(),
  status: z.nativeEnum(ReviewStatus).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const CreateWalkInBookingSchema = z
  .object({
    play_mode: z.nativeEnum(BookingMode),
    track_type_id: z.string().uuid(),
    slot_start: z.string().datetime({ offset: true }),
    slot_end: z.string().datetime({ offset: true }),
    payment_method: z.enum(['CASH', 'BANK_TRANSFER']),
    vehicle_ids: z.array(z.string().uuid()).default([]),
    participants: z
      .array(
        z.object({
          guest_name: z.string().trim().min(1, 'Tên người chơi không được để trống'),
          guest_phone: MobilePhone,
          participant_type: z.literal(BookingParticipantType.WALK_IN_GUEST),
        }),
      )
      .min(1, 'Phải có ít nhất 1 người chơi tham gia'),
    fnb_items: z
      .array(
        z.object({
          menu_item_id: z.string().uuid('ID món ăn không hợp lệ'),
          variant_id: z.string().uuid('ID biến thể không hợp lệ').optional(),
          quantity: z.number().int().positive('Số lượng phải lớn hơn 0'),
          notes: z.string().optional(),
        }),
      )
      .optional()
      .default([]),
  })
  .superRefine((data, ctx) => {
    if (data.play_mode === BookingMode.RENTAL && data.vehicle_ids.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['vehicle_ids'],
        message: 'Chế độ chơi RENTAL yêu cầu chọn ít nhất 1 xe thuê',
      });
    }
    if (data.play_mode === BookingMode.BYOC && data.vehicle_ids.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['vehicle_ids'],
        message: 'Chế độ chơi BYOC không được chọn xe của cửa hàng',
      });
    }
  });

// ── inspections ───────────────────────────────────────────────────────────────

const DamageLineItemInputSchema = z
  .object({
    partType: z.nativeEnum(DamagePartType),
    customPartName: z.string().max(255).optional(),
    partsPrice: z.number().min(0, 'Giá linh kiện phải >= 0'),
    laborPrice: z.number().min(0, 'Phí công phải >= 0').default(0),
  })
  .superRefine((item, ctx) => {
    if (item.partType === DamagePartType.OTHER && !item.customPartName?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['customPartName'],
        message: 'Vui lòng nhập tên hư hỏng khi chọn "Khác"',
      });
    }
  });

export const SubmitInspectionV2Schema = z.object({
  type: z.enum(['CHECK_IN', 'CHECK_OUT']),
  photos: z
    .array(
      z.object({
        angle: z.enum(['FRONT', 'BACK', 'LEFT', 'RIGHT', 'TOP', 'BOTTOM', 'DETAIL', 'OTHER']),
        url: z.string().url(),
        notes: z.string().optional(),
      }),
    )
    .max(6, 'Tối đa 6 ảnh cho mỗi biên bản kiểm xe')
    .optional(),
  checklist: z
    .array(
      z.object({
        itemKey: z.string().min(1),
        itemLabel: z.string().min(1),
        status: z.enum(['OK', 'BROKEN']),
        note: z.string().optional(),
      }),
    )
    .optional(),
  staffNotes: z.string().optional(),
  damageFlagged: z.boolean().default(false),
  damageLineItems: z.array(DamageLineItemInputSchema).optional(),
});

export const ConfirmCheckoutSchema = z.object({
  inspectionId: z.string().uuid('inspectionId phải là UUID hợp lệ'),
});

export const UpdateDamageItemsSchema = z.object({
  damageLineItems: z.array(DamageLineItemInputSchema).min(0),
  checklist: z
    .array(
      z.object({
        itemKey: z.string().optional(),
        itemLabel: z.string(),
        status: z.string(),
        note: z.string().optional().nullable(),
      }),
    )
    .optional(),
  staffNotes: z.string().optional().nullable(),
});

// ── cafe_payment_settings / bank_transactions ─────────────────────────────────

export const UpdateCafePaymentSettingsSchema = z
  .object({
    method: z.enum(['VNPAY', 'BANK_TRANSFER']),
    bank_code: z.string().min(1).max(20).optional().nullable(),
    account_number: z
      .string()
      .regex(/^\d{4,19}$/, 'Số tài khoản chỉ gồm chữ số, 4–19 ký tự')
      .optional()
      .nullable(),
    account_name: z.string().min(2).max(160).optional().nullable(),
  })
  .refine(
    (body) =>
      body.method !== 'BANK_TRANSFER' ||
      Boolean(body.bank_code && body.account_number && body.account_name),
    {
      message:
        'Chọn nhận chuyển khoản thì phải khai đủ ngân hàng, số tài khoản và tên chủ tài khoản',
      path: ['method'],
    },
  );

export const AssignBankTransactionSchema = z.object({
  booking_id: z.string().uuid('booking_id phải là UUID hợp lệ'),
  note: z.string().max(1000).optional(),
});

export const IgnoreBankTransactionSchema = z.object({
  // Bắt buộc: đánh dấu một khoản tiền thật là "không liên quan" phải kèm lý do,
  // vì sau này không ai nhớ được vì sao nó bị bỏ qua.
  note: z.string().min(1, 'Phải ghi lý do bỏ qua khoản tiền này').max(1000),
});

export const ListBankTransactionsQuerySchema = z.object({
  status: z.enum(['MATCHED', 'NEEDS_REVIEW', 'IGNORED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/**
 * Đối soát sao kê — chủ sân, gộp mọi chi nhánh.
 *
 * `from`/`to` nhận chuỗi ngày hoặc ISO đầy đủ; ép sang `Date` ngay tại đây để
 * một chuỗi rác không đi tiếp xuống SQL rồi mới hỏng ở tầng driver với thông
 * báo không ai đọc được.
 */
export const ProviderReconciliationQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  cafe_id: z.string().uuid().optional(),
  channel: z.enum(['BANK', 'VNPAY', 'REFUND']).optional(),
  status: z.enum(['MATCHED', 'NEEDS_REVIEW', 'IGNORED']).optional(),
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

// ── admin payment ledger ──────────────────────────────────────────────────────
export const AdminLedgerQuerySchema = z.object({
  source: z.enum(['SAAS', 'CONTEST_FEE']).optional(),
  status: z.string().trim().max(40).optional(),
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

// ── admin quản lý người dùng ──────────────────────────────────────────────────

export const AdminUserQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  q: z.string().trim().max(255).optional(),
  status: z.enum(['active', 'locked']).optional(),
  sort: z.enum(['newest', 'risk']).optional().default('newest'),
});

/**
 * Lý do là BẮT BUỘC và phải viết cho ra hồn.
 *
 * Khoá tài khoản là chặn người ta dùng dịch vụ. Cho phép lý do rỗng hay "abc"
 * thì ô này thành thủ tục, và nhật ký kỷ luật mất sạch giá trị đúng lúc cần
 * nhất — khi khách khiếu nại.
 */
export const ModerateUserSchema = z.object({
  reason: z.string().trim().min(10, 'Nêu lý do cụ thể, ít nhất 10 ký tự').max(1000),
});

// ── staff acting on behalf of soft-user customers ─────────────────────────────

/**
 * `reason` bắt buộc và tối thiểu 10 ký tự.
 *
 * Đây KHÔNG phải thủ tục giấy tờ. Khách dùng tài khoản mềm không tự bấm được,
 * nên thao tác của nhân viên là thứ duy nhất còn lại trong hồ sơ — `reason`
 * chính là bằng chứng thay cho chữ ký của khách. Cho phép để trống thì bản ghi
 * mất phần giải thích, và Nguyên tắc III của hiến chương mất hiệu lực đúng ở
 * chỗ nó cần nhất.
 */
export const RespondExtensionOnBehalfSchema = z.object({
  approved: z.boolean(),
  reason: z.string().trim().min(10, 'Cần nêu lý do thao tác hộ, tối thiểu 10 ký tự'),
});

export const ConfirmInspectionOnBehalfSchema = z.object({
  agreed: z.boolean(),
  reason: z.string().trim().min(10, 'Cần nêu lý do thao tác hộ, tối thiểu 10 ký tự'),
});
