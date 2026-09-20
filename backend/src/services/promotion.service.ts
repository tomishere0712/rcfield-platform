import { In, Not } from 'typeorm';
import { AppDataSource } from '../config/database';
import { Promotion } from '../models/promotion.entity';
import { Booking } from '../models/booking.entity';
import {
  AppError,
  BookingStatus,
  DiscountType,
  PromoApplicableTo,
  PromotionScheduleMode,
  UserRole,
} from '../types';
import { getManagedCafeOrThrow } from './cafe.service';

interface Viewer {
  userId: string;
  role: UserRole;
}

export interface PromotionBody {
  code: string;
  description?: string | null;
  discount_type: DiscountType;
  discount_value: number;
  max_discount_amount?: number | null;
  min_order_amount?: number | null;
  max_uses?: number | null;
  max_uses_per_user?: number;
  applicable_to?: PromoApplicableTo;
  starts_at: Date;
  expires_at?: Date | null;
  schedule_mode?: PromotionScheduleMode;
  schedule_start_time?: string | null;
  schedule_end_time?: string | null;
  schedule_weekdays?: string[];
  is_active?: boolean;
  show_on_cafe_page?: boolean;
}

export type UpdatePromotionBody = Partial<PromotionBody>;

function decimal(value: number | null | undefined): string | null {
  return value === null || value === undefined ? null : value.toFixed(2);
}

async function assertUniqueActiveCode(
  cafeId: string,
  code: string,
  exceptId?: string,
): Promise<void> {
  const repo = AppDataSource.getRepository(Promotion);
  const existing = await repo.findOne({
    where: {
      cafeId,
      code,
      isActive: true,
      ...(exceptId ? { id: Not(exceptId) } : {}),
    },
  });

  if (existing) {
    throw new AppError('Mã ưu đãi đang được sử dụng', 409, 'PROMOTION_CODE_EXISTS');
  }
}

async function getOwnedPromotionOrThrow(
  cafeId: string,
  promotionId: string,
  viewer: Viewer,
): Promise<Promotion> {
  await getManagedCafeOrThrow(cafeId, viewer);
  const promotion = await AppDataSource.getRepository(Promotion).findOne({
    where: { id: promotionId, cafeId },
  });

  if (!promotion) {
    throw new AppError('Ưu đãi không tồn tại', 404, 'PROMOTION_NOT_FOUND');
  }

  return promotion;
}

export async function listPromotions(cafeId: string, viewer: Viewer): Promise<Promotion[]> {
  await getManagedCafeOrThrow(cafeId, viewer);
  return AppDataSource.getRepository(Promotion).find({
    where: { cafeId },
    order: { createdAt: 'DESC' },
  });
}

export async function createPromotion(
  cafeId: string,
  viewer: Viewer,
  body: PromotionBody,
): Promise<Promotion> {
  await getManagedCafeOrThrow(cafeId, viewer);
  await assertUniqueActiveCode(cafeId, body.code);

  const promotion = AppDataSource.getRepository(Promotion).create({
    code: body.code,
    description: body.description ?? null,
    discountType: body.discount_type,
    discountValue: decimal(body.discount_value)!,
    maxDiscountAmount: decimal(body.max_discount_amount),
    minOrderAmount: decimal(body.min_order_amount),
    maxUses: body.max_uses ?? null,
    maxUsesPerUser: body.max_uses_per_user ?? 1,
    applicableTo: body.applicable_to ?? PromoApplicableTo.ALL,
    cafeId,
    startsAt: body.starts_at,
    expiresAt: body.expires_at ?? null,
    scheduleMode: body.schedule_mode ?? PromotionScheduleMode.ONCE,
    scheduleStartTime: body.schedule_start_time ?? null,
    scheduleEndTime: body.schedule_end_time ?? null,
    scheduleWeekdays: body.schedule_weekdays ?? [],
    isActive: body.is_active ?? true,
    showOnCafePage: body.show_on_cafe_page ?? true,
    createdBy: viewer.userId,
  });

  return AppDataSource.getRepository(Promotion).save(promotion);
}

export async function updatePromotion(
  cafeId: string,
  promotionId: string,
  viewer: Viewer,
  body: UpdatePromotionBody,
): Promise<Promotion> {
  const promotion = await getOwnedPromotionOrThrow(cafeId, promotionId, viewer);

  if (
    body.code !== undefined &&
    body.code !== promotion.code &&
    (body.is_active ?? promotion.isActive)
  ) {
    await assertUniqueActiveCode(cafeId, body.code, promotion.id);
  }

  if (body.code !== undefined) promotion.code = body.code;
  if (body.description !== undefined) promotion.description = body.description;
  if (body.discount_type !== undefined) promotion.discountType = body.discount_type;
  if (body.discount_value !== undefined) promotion.discountValue = decimal(body.discount_value)!;
  if (body.max_discount_amount !== undefined) {
    promotion.maxDiscountAmount = decimal(body.max_discount_amount);
  }
  if (body.min_order_amount !== undefined)
    promotion.minOrderAmount = decimal(body.min_order_amount);
  if (body.max_uses !== undefined) promotion.maxUses = body.max_uses;
  if (body.max_uses_per_user !== undefined) promotion.maxUsesPerUser = body.max_uses_per_user;
  if (body.applicable_to !== undefined) promotion.applicableTo = body.applicable_to;
  if (body.starts_at !== undefined) promotion.startsAt = body.starts_at;
  if (body.expires_at !== undefined) promotion.expiresAt = body.expires_at;
  if (body.schedule_mode !== undefined) promotion.scheduleMode = body.schedule_mode;
  if (body.schedule_start_time !== undefined)
    promotion.scheduleStartTime = body.schedule_start_time;
  if (body.schedule_end_time !== undefined) promotion.scheduleEndTime = body.schedule_end_time;
  if (body.schedule_weekdays !== undefined) promotion.scheduleWeekdays = body.schedule_weekdays;
  if (body.is_active !== undefined) {
    if (body.is_active) await assertUniqueActiveCode(cafeId, promotion.code, promotion.id);
    promotion.isActive = body.is_active;
  }
  if (body.show_on_cafe_page !== undefined) promotion.showOnCafePage = body.show_on_cafe_page;

  return AppDataSource.getRepository(Promotion).save(promotion);
}

export async function deletePromotion(
  cafeId: string,
  promotionId: string,
  viewer: Viewer,
): Promise<void> {
  const promotion = await getOwnedPromotionOrThrow(cafeId, promotionId, viewer);

  if (promotion.usesCount > 0) {
    throw new AppError(
      'Ưu đãi đã phát sinh lượt dùng, chỉ có thể tắt hoạt động',
      409,
      'PROMOTION_ALREADY_USED',
    );
  }

  await AppDataSource.getRepository(Promotion).delete(promotion.id);
}

// ── Customer-facing validation ─────────────────────────────────────────────────

export interface ValidatePromoResult {
  promotion: Promotion;
  discountAmount: number;
}

/** Validates a promo code for use in a booking. Throws AppError on any violation. */
export async function validatePromoCode(params: {
  cafeId: string;
  code: string;
  customerId: string;
  subtotal: number; // slot_fee + rental_fee — discount base
  playMode: string;
  slotStart: Date;
}): Promise<ValidatePromoResult> {
  const repo = AppDataSource.getRepository(Promotion);
  const promotion = await repo.findOne({
    where: { cafeId: params.cafeId, code: params.code.toUpperCase(), isActive: true },
  });

  if (!promotion) {
    throw new AppError(
      'Mã ưu đãi không hợp lệ hoặc không áp dụng cho cơ sở này',
      404,
      'PROMOTION_NOT_FOUND',
    );
  }

  const now = new Date();

  if (promotion.startsAt > now) {
    throw new AppError('Mã ưu đãi chưa có hiệu lực', 400, 'PROMOTION_NOT_STARTED');
  }

  if (promotion.expiresAt && promotion.expiresAt < now) {
    throw new AppError('Mã ưu đãi đã hết hạn', 400, 'PROMOTION_EXPIRED');
  }

  if (
    promotion.applicableTo !== PromoApplicableTo.ALL &&
    promotion.applicableTo !== params.playMode
  ) {
    throw new AppError(
      'Mã ưu đãi không áp dụng cho hình thức chơi này',
      400,
      'PROMOTION_PLAY_MODE_MISMATCH',
    );
  }

  validateSchedule(promotion, params.slotStart);

  if (promotion.maxUses !== null && promotion.usesCount >= promotion.maxUses) {
    throw new AppError('Mã ưu đãi đã hết lượt sử dụng', 400, 'PROMOTION_EXHAUSTED');
  }

  const userUsageCount = await AppDataSource.getRepository(Booking).count({
    where: {
      promotionId: promotion.id,
      customerId: params.customerId,
      status: In([BookingStatus.PENDING, BookingStatus.CONFIRMED]),
    },
  });

  if (userUsageCount >= promotion.maxUsesPerUser) {
    throw new AppError(
      'Bạn đã đạt giới hạn sử dụng mã ưu đãi này',
      400,
      'PROMOTION_USER_LIMIT_REACHED',
    );
  }

  const minOrderAmount = promotion.minOrderAmount ? Number(promotion.minOrderAmount) : 0;
  if (params.subtotal < minOrderAmount) {
    throw new AppError(
      `Giá trị đơn tối thiểu để áp dụng mã là ${minOrderAmount.toLocaleString('vi-VN')}đ`,
      400,
      'PROMOTION_MIN_ORDER_NOT_MET',
    );
  }

  const discountAmount = calculateDiscount(promotion, params.subtotal);
  return { promotion, discountAmount };
}

function validateSchedule(promotion: Promotion, slotStart: Date): void {
  if (promotion.scheduleMode === PromotionScheduleMode.ONCE) return;

  if (promotion.scheduleStartTime && promotion.scheduleEndTime) {
    const hh = String(slotStart.getHours()).padStart(2, '0');
    const mm = String(slotStart.getMinutes()).padStart(2, '0');
    const slotTime = `${hh}:${mm}`;
    if (slotTime < promotion.scheduleStartTime || slotTime >= promotion.scheduleEndTime) {
      throw new AppError(
        'Mã ưu đãi không áp dụng cho khung giờ này',
        400,
        'PROMOTION_SCHEDULE_MISMATCH',
      );
    }
  }

  if (promotion.scheduleMode === PromotionScheduleMode.WEEKLY) {
    const DAY_MAP = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const dayKey = DAY_MAP[slotStart.getDay()];
    if (!promotion.scheduleWeekdays.includes(dayKey)) {
      throw new AppError(
        'Mã ưu đãi không áp dụng cho ngày này trong tuần',
        400,
        'PROMOTION_SCHEDULE_MISMATCH',
      );
    }
  }
}

function calculateDiscount(promotion: Promotion, subtotal: number): number {
  const discountValue = Number(promotion.discountValue);
  let discountAmount: number;

  if (promotion.discountType === DiscountType.PERCENT) {
    discountAmount = Math.round(subtotal * (discountValue / 100));
    const cap = promotion.maxDiscountAmount ? Number(promotion.maxDiscountAmount) : Infinity;
    discountAmount = Math.min(discountAmount, cap);
  } else {
    discountAmount = discountValue;
  }

  return Math.min(discountAmount, subtotal);
}

/** Returns promotions currently active and visible to customers (public, no auth). */
export async function listActivePublicPromotions(cafeId: string): Promise<
  Array<{
    code: string;
    description: string | null;
    discount_type: DiscountType;
    discount_value: number;
    max_discount_amount: number | null;
    min_order_amount: number | null;
    applicable_to: PromoApplicableTo;
    expires_at: Date | null;
  }>
> {
  const now = new Date();
  const promos = await AppDataSource.getRepository(Promotion).find({
    where: { cafeId, isActive: true, showOnCafePage: true },
    order: { createdAt: 'DESC' },
  });

  return promos
    .filter((p) => {
      if (p.startsAt > now) return false;
      if (p.expiresAt && p.expiresAt < now) return false;
      if (p.maxUses !== null && p.usesCount >= p.maxUses) return false;
      return true;
    })
    .map((p) => ({
      code: p.code,
      description: p.description,
      discount_type: p.discountType,
      discount_value: Number(p.discountValue),
      max_discount_amount: p.maxDiscountAmount ? Number(p.maxDiscountAmount) : null,
      min_order_amount: p.minOrderAmount ? Number(p.minOrderAmount) : null,
      applicable_to: p.applicableTo,
      expires_at: p.expiresAt,
    }));
}

/** Increments usesCount for the promotion linked to a booking. Called after PAYMENT_CONFIRMED. */
export async function incrementPromoUsesCount(bookingId: string): Promise<void> {
  const booking = await AppDataSource.getRepository(Booking).findOne({ where: { id: bookingId } });
  if (!booking?.promotionId) return;
  await AppDataSource.getRepository(Promotion).increment(
    { id: booking.promotionId },
    'usesCount',
    1,
  );
}
