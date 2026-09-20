import { In } from 'typeorm';
import { AppDataSource } from '../config/database';
import { randomUUID } from 'node:crypto';
import { redis } from '../config/redis';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { Booking } from '../models/booking.entity';
import { BookingParticipant } from '../models/booking-participant.entity';
import { BookingVehicle } from '../models/booking-vehicle.entity';
import { FnbOrder } from '../models/fnb-order.entity';
import { FnbOrderItem } from '../models/fnb-order-item.entity';
import { Cafe } from '../models/cafe.entity';
import { Vehicle } from '../models/vehicle.entity';
import { VehicleCatalog } from '../models/vehicle-catalog.entity';
import { MenuItem } from '../models/menu-item.entity';
import { MenuItemVariant } from '../models/menu-item-variant.entity';
import { CafeTrackConfig } from '../models/cafe-track-config.entity';
import { TrackType } from '../models/track-type.entity';
import { User } from '../models/user.entity';
import { PaymentComponent } from '../models/payment-component.entity';
import { PaymentTransaction } from '../models/payment-transaction.entity';
import { Session } from '../models/session.entity';
import { Inspection } from '../models/inspection.entity';
import { ContestRegistration } from '../models/contest-registration.entity';
import {
  AppError,
  BookingMode,
  BookingParticipantType,
  BookingSource,
  BookingStatus,
  ContestRegistrationStatus,
  CustomerPackageStatus,
  FnbOrderStatus,
  FnbOrderType,
  UserRole,
  VehicleStatus,
  PaymentComponentType,
  PaymentComponentStatus,
  PaymentTransactionType,
  PaymentTransactionStatus,
  SessionStatus,
  InspectionType,
  NotificationType,
} from '../types';
import { CustomerPackage } from '../models/customer-package.entity';
import { refundSlots } from './customer-package.service';
import { getEffectiveMultiplier } from './pricing.service';
import { validatePromoCode } from './promotion.service';
import { assertBookingNotBlockedByContest } from './contest-lock.service';
import { writeContestAudit } from './contest.helpers';
import { sendContestRegistrationStatusNotification } from './contest/registration-side-effects';
import { notifyCafeStaffAboutFnbPrep } from './fnb-order-notification.service';
import { wsService } from './websocket.service';
import { createNotification } from './notification.service';
import { getBookingCutoff } from './subscription.service';
import { createGuestUser, findUserByPhone } from './guest-user';
import {
  allocatePaymentRefCode,
  buildBankTransferCheckout,
  type BankTransferCheckout,
} from './bank-transfer-checkout.service';
import type { Promotion } from '../models/promotion.entity';
import {
  DAY_MS,
  getOperatingDayKey,
  getVietnamLocalMidnightUtcMs,
  isRangeWithinOperatingHours,
} from '../lib/vietnam-time';

// ── State machine ─────────────────────────────────────────────────────────────

const VALID_TRANSITIONS: Record<BookingStatus, string[]> = {
  [BookingStatus.PENDING]: ['PAYMENT_CONFIRMED', 'PAYMENT_TIMEOUT', 'HOLD_CANCELLED'],
  [BookingStatus.CONFIRMED]: ['CUSTOMER_CANCEL', 'PROVIDER_CANCEL', 'NO_SHOW', 'COMPLETE'],
  [BookingStatus.AWAITING_PAYMENT]: ['PAYMENT_SETTLED'],
  [BookingStatus.CANCELLED]: [],
  [BookingStatus.NO_SHOW]: [],
  [BookingStatus.COMPLETED]: [],
};

const MAX_CONSECUTIVE_SLOTS = 8;

function isVietnamToday(value: Date): boolean {
  const format = (date: Date) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  return format(value) === format(new Date());
}

/**
 * Chặn đơn kéo dài quá thời điểm chi nhánh còn được phục vụ.
 *
 * Gói của provider vào ân hạn nghĩa là chi nhánh sắp bị ẩn. Nhận tiền cho một
 * buổi chơi nằm sau mốc đó là hứa một dịch vụ mà hệ thống biết chắc sẽ không
 * giữ được.
 */
export async function assertWithinSubscriptionCoverage(cafe: Cafe, slotEnd: Date): Promise<void> {
  const cutoff = await getBookingCutoff(cafe.providerId);
  if (!cutoff || slotEnd.getTime() <= cutoff.getTime()) return;

  throw new AppError(
    'Chi nhánh này tạm thời chỉ nhận đặt lịch trong thời gian ngắn sắp tới. Vui lòng chọn ngày gần hơn hoặc liên hệ quán.',
    409,
    'PROVIDER_SUBSCRIPTION_ENDING',
    { bookable_until: cutoff.toISOString() },
  );
}

export function assertSlotWithinOperatingHours(cafe: Cafe, slotStart: Date, slotEnd: Date): void {
  if (!Number.isInteger(cafe.slotDurationMinutes) || cafe.slotDurationMinutes <= 0) {
    throw new AppError(
      'Cafe slot duration is not configured correctly',
      400,
      'INVALID_CAFE_SCHEDULE',
    );
  }

  const firstLocalDay = getVietnamLocalMidnightUtcMs(slotStart) - DAY_MS;
  const lastLocalDay = getVietnamLocalMidnightUtcMs(new Date(slotEnd.getTime() - 1)) + DAY_MS;
  const candidates: number[] = [];
  for (let candidate = firstLocalDay; candidate <= lastLocalDay; candidate += DAY_MS) {
    candidates.push(candidate);
  }

  const hasConfiguredDay = candidates.some(
    (candidate) => cafe.operatingHours?.[getOperatingDayKey(candidate)] !== undefined,
  );
  if (!hasConfiguredDay) {
    throw new AppError(
      'Cafe operating hours are not configured correctly',
      400,
      'INVALID_CAFE_SCHEDULE',
    );
  }

  // Đơn có thể vắt qua nửa đêm; hợp lệ khi cả khoảng nằm trọn trong các khung
  // giờ liền nhau. Logic nối khung nằm ở `isRangeWithinOperatingHours` để chỗ
  // kiểm tra gia hạn dùng đúng cùng một định nghĩa.
  if (isRangeWithinOperatingHours(cafe.operatingHours, slotStart, slotEnd)) return;

  throw new AppError(
    'Selected slot is outside cafe operating hours',
    400,
    'OUTSIDE_OPERATING_HOURS',
  );
}

/** Pure function — exported for unit tests (Constitution Principle V) */
export function canTransition(current: BookingStatus, event: string): boolean {
  return VALID_TRANSITIONS[current]?.includes(event) ?? false;
}

/** Pure function — shared booking lead-time rule for customer self-service bookings. */
export function meetsMinimumBookingNotice(
  slotStart: Date,
  minBookingNoticeMinutes: number,
  now: Date = new Date(),
): boolean {
  const noticeMinutes = Math.max(0, minBookingNoticeMinutes);
  return slotStart.getTime() >= now.getTime() + noticeMinutes * 60 * 1000;
}

/**
 * Customer self-service bookings may be made through the final calendar day
 * configured by the cafe. Both ends of a multi-slot booking must fit in that
 * window, so a booking cannot spill into an unbookable following day.
 */
export function isWithinMaxAdvanceBookingDays(
  slotStart: Date,
  slotEnd: Date,
  maxAdvanceBookingDays: number,
  now: Date = new Date(),
): boolean {
  const todayStart = getVietnamLocalMidnightUtcMs(now);
  const firstUnbookableDay = todayStart + (maxAdvanceBookingDays + 1) * DAY_MS;
  return slotStart.getTime() >= todayStart && slotEnd.getTime() <= firstUnbookableDay;
}

export function assertMinimumBookingNotice(slotStart: Date, minBookingNoticeMinutes: number): void {
  if (meetsMinimumBookingNotice(slotStart, minBookingNoticeMinutes)) return;

  throw new AppError(
    `Bookings must be made at least ${minBookingNoticeMinutes} minutes in advance`,
    400,
    'MIN_BOOKING_NOTICE_NOT_MET',
  );
}

export function assertMaxAdvanceBookingDays(
  slotStart: Date,
  slotEnd: Date,
  maxAdvanceBookingDays: number,
): void {
  if (isWithinMaxAdvanceBookingDays(slotStart, slotEnd, maxAdvanceBookingDays)) return;

  throw new AppError(
    `Bookings can only be made up to ${maxAdvanceBookingDays} days in advance`,
    400,
    'MAX_ADVANCE_BOOKING_DAYS_EXCEEDED',
  );
}

function eventToStatus(event: string): BookingStatus {
  switch (event) {
    case 'PAYMENT_CONFIRMED':
      return BookingStatus.CONFIRMED;
    case 'PAYMENT_TIMEOUT':
    case 'HOLD_CANCELLED':
    case 'CUSTOMER_CANCEL':
    case 'PROVIDER_CANCEL':
      return BookingStatus.CANCELLED;
    case 'NO_SHOW':
      return BookingStatus.NO_SHOW;
    case 'PAYMENT_SETTLED':
    case 'COMPLETE':
      return BookingStatus.COMPLETED;
    default:
      throw new AppError(`Unknown booking event: ${event}`, 400, 'INVALID_BOOKING_EVENT');
  }
}

/**
 * Operational screens must refresh from the API after a booking changes. The
 * event deliberately contains no price or inspection data: it is a signal for
 * the staff assigned to this cafe and its provider to refetch data they are
 * already authorised to view.
 */
export async function broadcastBookingUpdated(
  booking: Booking,
  status: BookingStatus,
  action: string,
): Promise<void> {
  try {
    const cafe = await AppDataSource.getRepository(Cafe).findOne({
      where: { id: booking.cafeId },
      select: ['providerId'],
    });
    const payload = {
      bookingId: booking.id,
      cafeId: booking.cafeId,
      status,
      action,
      updatedAt: new Date().toISOString(),
    };
    wsService.pushToCafe(booking.cafeId, 'BOOKING_UPDATED', payload);
    if (cafe?.providerId) {
      wsService.pushToUser(cafe.providerId, 'BOOKING_UPDATED', payload);
    }
  } catch (error) {
    logger.error('BookingService', 'failed to broadcast booking update', {
      bookingId: booking.id,
      status,
      action,
      error,
    });
  }
}

// ── Redis slot locking ────────────────────────────────────────────────────────

function vehicleLockKey(vehicleId: string, slotStart: Date): string {
  return `slot:lock:vehicle:${vehicleId}:${slotStart.getTime()}`;
}

function byocCounterKey(cafeId: string, slotStart: Date, trackConfigId?: string | null): string {
  return trackConfigId
    ? `slot:byoc:${cafeId}:${trackConfigId}:${slotStart.getTime()}`
    : `slot:byoc:${cafeId}:${slotStart.getTime()}`;
}

export async function countOccupiedByocParticipants(
  cafeId: string,
  slotStart: Date,
  slotEnd: Date,
  trackConfigId?: string | null,
  trackTypeId?: string | null,
): Promise<number> {
  const query = AppDataSource.getRepository(Booking)
    .createQueryBuilder('booking')
    .leftJoin(BookingParticipant, 'participant', 'participant.booking_id = booking.id')
    .where('booking.cafe_id = :cafeId', { cafeId })
    .andWhere('booking.play_mode = :playMode', { playMode: BookingMode.BYOC })
    .andWhere('booking.slot_start < :slotEnd', { slotEnd })
    .andWhere('booking.slot_end > :slotStart', { slotStart })
    .andWhere('booking.status IN (:...statuses)', {
      statuses: [BookingStatus.PENDING, BookingStatus.CONFIRMED],
    });

  if (trackConfigId && trackTypeId) {
    query.andWhere(
      `(
        booking.track_config_id = :trackConfigId
        OR (
          booking.track_config_id IS NULL
          AND (
            booking.snapshot ->> 'track_config_id' = CAST(:trackConfigId AS text)
            OR (
              booking.snapshot ->> 'track_config_id' IS NULL
              AND booking.track_type_id = :trackTypeId
            )
          )
        )
      )`,
      { trackConfigId, trackTypeId },
    );
  } else if (trackConfigId) {
    query.andWhere('booking.track_config_id = :trackConfigId', { trackConfigId });
  }

  const row = await query
    .select(
      'COUNT(participant.id) + COUNT(DISTINCT booking.id) FILTER (WHERE participant.id IS NULL)',
      'count',
    )
    .getRawOne<{ count: string }>();
  return Number(row?.count ?? 0);
}

async function acquireVehicleLock(
  vehicleId: string,
  slotStart: Date,
  bookingId: string,
): Promise<boolean> {
  const key = vehicleLockKey(vehicleId, slotStart);
  // The cache lock must never expire before the durable PENDING hold does.
  const holdTtlSeconds = Math.max(
    env.platform.slotLockTtlSeconds,
    env.platform.paymentWindowMinutes * 60,
  );
  const result = await redis.set(key, bookingId, 'EX', holdTtlSeconds, 'NX');
  return result === 'OK';
}

type VehicleSlotLock = {
  vehicleId: string;
  slotStart: Date;
};

const ACQUIRE_ALL_VEHICLE_LOCKS_LUA = `
  for index = 1, #KEYS do
    if redis.call('EXISTS', KEYS[index]) == 1 then return 0 end
  end
  for index = 1, #KEYS do
    redis.call('SET', KEYS[index], ARGV[1], 'EX', ARGV[2])
  end
  return 1
`;

const RELEASE_OWNED_VEHICLE_LOCK_LUA = `
  if redis.call('GET', KEYS[1]) == ARGV[1] then
    return redis.call('DEL', KEYS[1])
  end
  return 0
`;

/**
 * Acquires every vehicle × atomic-slot key together. This prevents a partial
 * multi-slot reservation from being visible to another checkout attempt.
 */
async function acquireVehicleSlotLocks(
  locks: VehicleSlotLock[],
  bookingId: string,
): Promise<boolean> {
  if (locks.length === 0) return true;
  const keys = locks.map(({ vehicleId, slotStart }) => vehicleLockKey(vehicleId, slotStart));
  const holdTtlSeconds = Math.max(
    env.platform.slotLockTtlSeconds,
    env.platform.paymentWindowMinutes * 60,
  );

  // The production Redis client supports EVAL. The small in-memory test Redis
  // intentionally falls back to the same rollback-safe behavior.
  if (typeof (redis as unknown as { eval?: unknown }).eval === 'function') {
    const result = await redis.eval(
      ACQUIRE_ALL_VEHICLE_LOCKS_LUA,
      keys.length,
      ...keys,
      bookingId,
      String(holdTtlSeconds),
    );
    return Number(result) === 1;
  }

  const acquired: VehicleSlotLock[] = [];
  for (const lock of locks) {
    if (!(await acquireVehicleLock(lock.vehicleId, lock.slotStart, bookingId))) {
      await releaseVehicleSlotLocks(acquired, bookingId);
      return false;
    }
    acquired.push(lock);
  }
  return true;
}

function getSlotStarts(slotStart: Date, slotEnd: Date, slotDurationMinutes: number): Date[] {
  const slotStarts: Date[] = [];
  const slotDurationMs = slotDurationMinutes * 60 * 1000;
  for (let cursor = slotStart.getTime(); cursor < slotEnd.getTime(); cursor += slotDurationMs) {
    slotStarts.push(new Date(cursor));
  }
  return slotStarts;
}

async function releaseVehicleSlotLocks(
  locks: VehicleSlotLock[],
  expectedOwner?: string,
): Promise<void> {
  await Promise.all(
    locks.map(async ({ vehicleId, slotStart }) => {
      const key = vehicleLockKey(vehicleId, slotStart);
      // A timed-out reservation must never delete a lock acquired later by a
      // different booking. New booking holds use their booking UUID as value.
      if (expectedOwner && typeof (redis as unknown as { eval?: unknown }).eval === 'function') {
        await redis.eval(RELEASE_OWNED_VEHICLE_LOCK_LUA, 1, key, expectedOwner);
        return;
      }
      if (expectedOwner && (await redis.get(key)) !== expectedOwner) return;
      await redis.del(key);
    }),
  );
}

/** Durable availability check. Redis prevents concurrent checkout races; this
 * query remains the source of truth after cache expiry or a worker restart. */
async function assertRentalVehiclesAvailable(
  vehicleIds: string[],
  slotStart: Date,
  slotEnd: Date,
): Promise<void> {
  if (vehicleIds.length === 0) return;
  const conflicting = await AppDataSource.getRepository(BookingVehicle)
    .createQueryBuilder('booking_vehicle')
    .innerJoin(Booking, 'booking', 'booking.id = booking_vehicle.booking_id')
    .where('booking_vehicle.vehicle_id IN (:...vehicleIds)', { vehicleIds })
    .andWhere('booking.slot_start < :slotEnd', { slotEnd })
    .andWhere('booking.slot_end > :slotStart', { slotStart })
    .andWhere(
      `(booking.status = :confirmedStatus
        OR (booking.status = :pendingStatus AND booking.payment_expires_at > NOW()))`,
      { confirmedStatus: BookingStatus.CONFIRMED, pendingStatus: BookingStatus.PENDING },
    )
    .getExists();

  if (conflicting) {
    // Keep the established 409 contract for an occupied atomic slot whether
    // it was discovered from Redis or from the durable booking record.
    throw new AppError('A selected vehicle is already booked for this slot', 409, 'SLOT_LOCKED');
  }
}

async function getBookingSlotStarts(booking: Booking): Promise<Date[]> {
  const cafe = await AppDataSource.getRepository(Cafe).findOne({
    where: { id: booking.cafeId },
    select: { slotDurationMinutes: true },
  });
  if (!cafe) {
    throw new AppError('Cafe not found for booking', 404, 'CAFE_NOT_FOUND');
  }
  return getSlotStarts(booking.slotStart, booking.slotEnd, cafe.slotDurationMinutes);
}

async function acquireByocSlot(
  cafeId: string,
  slotStart: Date,
  capacity: number,
  count: number,
  trackConfigId?: string | null,
): Promise<boolean> {
  const key = byocCounterKey(cafeId, slotStart, trackConfigId);
  const next = await redis.incrby(key, count);
  await redis.expire(key, env.platform.slotLockTtlSeconds);
  if (next > capacity) {
    await redis.decrby(key, count);
    return false;
  }
  return true;
}

async function releaseByocSlot(
  cafeId: string,
  slotStart: Date,
  count: number,
  trackConfigId?: string | null,
): Promise<void> {
  const key = byocCounterKey(cafeId, slotStart, trackConfigId);
  const current = Number((await redis.get(key)) ?? 0);
  if (current > 0) {
    await redis.set(
      key,
      String(Math.max(0, current - count)),
      'EX',
      env.platform.slotLockTtlSeconds,
    );
  }
}

// ── transition ────────────────────────────────────────────────────────────────

/** All booking status changes MUST go through this function (Constitution Principle II) */
export async function transition(bookingId: string, event: string): Promise<Booking> {
  const repo = AppDataSource.getRepository(Booking);
  const booking = await repo.findOne({ where: { id: bookingId } });

  if (!booking) throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');
  if (!canTransition(booking.status, event)) {
    throw new AppError(
      `Cannot transition booking from ${booking.status} via ${event}`,
      400,
      'INVALID_BOOKING_STATE',
    );
  }

  const newStatus = eventToStatus(event);
  await repo.update(bookingId, { status: newStatus });

  if (newStatus === BookingStatus.CANCELLED) {
    const slotStarts = await getBookingSlotStarts(booking);
    const bvRepo = AppDataSource.getRepository(BookingVehicle);
    const vehicles = await bvRepo.find({ where: { bookingId } });
    const vehicleIds = vehicles.map((v) => v.vehicleId);
    await releaseVehicleSlotLocks(
      slotStarts.flatMap((slotStart) => vehicleIds.map((vehicleId) => ({ vehicleId, slotStart }))),
      booking.id,
    );
    if (booking.playMode === BookingMode.BYOC) {
      const participantCount = await AppDataSource.getRepository(BookingParticipant).count({
        where: { bookingId },
      });
      await Promise.all(
        slotStarts.map((slotStart) =>
          releaseByocSlot(booking.cafeId, slotStart, participantCount || 1, booking.trackConfigId),
        ),
      );
    }
    await cancelPendingFnbOrders(bookingId);
    logger.info('BookingService', `transition → CANCELLED bookingId=${bookingId}`);
  }

  if (newStatus === BookingStatus.COMPLETED) {
    if (booking.playMode === BookingMode.BYOC) {
      const slotStarts = await getBookingSlotStarts(booking);
      const participantCount = await AppDataSource.getRepository(BookingParticipant).count({
        where: { bookingId },
      });
      await Promise.all(
        slotStarts.map((slotStart) =>
          releaseByocSlot(booking.cafeId, slotStart, participantCount || 1, booking.trackConfigId),
        ),
      );
    }
    logger.info('BookingService', `transition → COMPLETED bookingId=${bookingId}`);
  }

  if (newStatus === BookingStatus.NO_SHOW) {
    await cancelPendingFnbOrders(bookingId);
    logger.info('BookingService', `transition → NO_SHOW bookingId=${bookingId}`);
  }

  // A paid/confirmed preorder belongs in the staff preparation queue. Future
  // dates are intentionally not alerted yet: this screen operates on today.
  if (newStatus === BookingStatus.CONFIRMED && isVietnamToday(booking.slotStart)) {
    const fnbOrders = await AppDataSource.query<{ id: string; order_type: FnbOrderType }[]>(
      `SELECT id, order_type
         FROM fnb_orders
        WHERE booking_id = $1
          AND order_type = 'PRE_ORDER'
          AND status = 'PENDING'`,
      [bookingId],
    );
    await Promise.all(
      fnbOrders.map((order) =>
        notifyCafeStaffAboutFnbPrep({
          cafeId: booking.cafeId,
          bookingId,
          orderId: order.id,
          orderType: order.order_type,
          scheduledFor: booking.slotStart,
        }),
      ),
    );
  }

  booking.status = newStatus;
  if (event !== 'PAYMENT_CONFIRMED') {
    await broadcastBookingUpdated(booking, newStatus, event);
  }
  return booking;
}

// ── createBooking ─────────────────────────────────────────────────────────────

export interface ParticipantInput {
  user_id?: string;
  participant_type: BookingParticipantType;
  guest_name?: string;
  guest_phone?: string;
}

export interface FnbItemInput {
  menu_item_id: string;
  variant_id?: string;
  quantity: number;
  notes?: string;
}

export interface CreateBookingBody {
  cafe_id: string;
  play_mode: BookingMode;
  slot_start: string;
  slot_end: string;
  vehicle_ids: string[];
  participants: ParticipantInput[];
  fnb_items: FnbItemInput[];
  promotion_code?: string;
  track_type_id?: string;
  track_config_id?: string;
  customer_package_id?: string;
  contest_id?: string;
  source?: BookingSource;
  /**
   * Internal only (not part of the API schema): skip the duplicate PENDING
   * booking shortcut. Used by the contest rental flow, which must always create
   * its own contest-linked booking instead of reusing a plain PENDING one.
   */
  skipPendingReuse?: boolean;
}

export interface BookingBreakdown {
  slot_fee: number;
  slot_fee_base: number;
  slot_fee_multiplier: number;
  pricing_rule_label: string | null;
  rental_fee: number;
  fnb_total: number;
  discount: number;
  total: number;
}

export interface CreateBookingResult {
  booking_id: string;
  status: BookingStatus;
  payment_expires_at: Date;
  total_amount: number;
  breakdown: BookingBreakdown;
}

function isPendingBookingMatching(existingBooking: Booking, body: CreateBookingBody): boolean {
  // 1. Kiểm tra gói hội viên
  const existingPkgId = existingBooking.customerPackageId ?? undefined;
  const bodyPkgId = body.customer_package_id ?? undefined;
  if (existingPkgId !== bodyPkgId) return false;

  // 2. Kiểm tra chế độ chơi
  if (existingBooking.playMode !== body.play_mode) return false;

  // 3. Kiểm tra loại sân / cấu hình sân
  const existingTrackConfigId = existingBooking.trackConfigId ?? undefined;
  const bodyTrackConfigId = body.track_config_id ?? undefined;
  if (existingTrackConfigId !== bodyTrackConfigId) return false;

  // 4. Kiểm tra slot_end
  if (existingBooking.slotEnd.getTime() !== new Date(body.slot_end).getTime()) return false;

  // 5. Kiểm tra mã ưu đãi (voucher)
  const snapshot = existingBooking.snapshot as {
    promotion_applied?: { code?: string };
    vehicles?: Array<{ vehicle_id: string }>;
    fnb_total?: number;
  } | null;
  const existingPromoCode = snapshot?.promotion_applied?.code ?? undefined;
  const bodyPromoCode = body.promotion_code ?? undefined;
  if (existingPromoCode !== bodyPromoCode) return false;

  // 6. Kiểm tra xe thuê
  const existingVehicles = (snapshot?.vehicles ?? []).map((v) => v.vehicle_id).sort();
  const bodyVehicles = [...(body.vehicle_ids ?? [])].sort();
  if (existingVehicles.length !== bodyVehicles.length) return false;
  if (!existingVehicles.every((id, i) => id === bodyVehicles[i])) return false;

  // 7. Kiểm tra F&B
  const existingFnbTotal = Number(snapshot?.fnb_total ?? 0);
  const bodyHasFnb = (body.fnb_items ?? []).some((item) => item.quantity > 0);
  if (bodyHasFnb !== existingFnbTotal > 0) return false;

  return true;
}

export async function createBooking(
  customerId: string,
  body: CreateBookingBody,
): Promise<CreateBookingResult> {
  // contest_id is reserved for the contest rental flow; attaching it to a
  // regular booking would let customers claim contest pricing policies.
  if (body.contest_id && body.source !== BookingSource.CONTEST) {
    throw new AppError(
      'contest_id chỉ được sử dụng qua luồng contest rental',
      400,
      'CONTEST_ID_NOT_ALLOWED',
    );
  }

  const slotStart = new Date(body.slot_start);
  const slotEnd = new Date(body.slot_end);

  if (slotStart >= slotEnd) {
    throw new AppError('slot_start must be before slot_end', 400, 'INVALID_SLOT');
  }

  if (slotStart <= new Date()) {
    throw new AppError('Cannot book a slot in the past', 400, 'SLOT_IN_PAST');
  }

  const cafeRepo = AppDataSource.getRepository(Cafe);
  const cafe = await cafeRepo.findOne({ where: { id: body.cafe_id } });
  if (!cafe) throw new AppError('Cafe not found', 404, 'CAFE_NOT_FOUND');
  if (cafe.status !== 'ACTIVE') throw new AppError('Cafe is not active', 400, 'CAFE_NOT_ACTIVE');
  assertSlotWithinOperatingHours(cafe, slotStart, slotEnd);
  assertMinimumBookingNotice(slotStart, cafe.minBookingNoticeMinutes);
  assertMaxAdvanceBookingDays(slotStart, slotEnd, cafe.maxAdvanceBookingDays);
  await assertWithinSubscriptionCoverage(cafe, slotEnd);

  // Validate the current cafe policy before returning an existing pending payment.
  // This prevents a legacy pending booking outside a newly tightened window from
  // being resumed through the duplicate-request shortcut.
  const bookingRepo = AppDataSource.getRepository(Booking);
  const existingBooking = body.skipPendingReuse
    ? null
    : await bookingRepo.findOne({
        where: {
          customerId,
          cafeId: body.cafe_id,
          slotStart,
          status: BookingStatus.PENDING,
        },
      });
  if (existingBooking) {
    if (
      existingBooking.paymentExpiresAt > new Date() &&
      isPendingBookingMatching(existingBooking, body)
    ) {
      return {
        booking_id: existingBooking.id,
        status: BookingStatus.PENDING,
        payment_expires_at: existingBooking.paymentExpiresAt,
        total_amount: Number(
          (existingBooking.snapshot as { total_charged?: number } | null)?.total_charged ?? 0,
        ),
        breakdown: {
          slot_fee: 0,
          slot_fee_base: 0,
          slot_fee_multiplier: 1,
          pricing_rule_label: null,
          rental_fee: 0,
          fnb_total: 0,
          discount: Number(existingBooking.discountAmount),
          total: Number(
            (existingBooking.snapshot as { total_charged?: number } | null)?.total_charged ?? 0,
          ),
        },
      };
    }

    await transition(existingBooking.id, 'PAYMENT_TIMEOUT');
  }

  const slotDuration = cafe.slotDurationMinutes;
  const slotMinutes = (slotEnd.getTime() - slotStart.getTime()) / 60000;

  // Slot range validation: must be aligned with slotDurationMinutes and within policy.
  if (slotMinutes % slotDuration !== 0) {
    throw new AppError(
      `Slot range must be a multiple of ${slotDuration} minutes`,
      400,
      'INVALID_SLOT_RANGE',
    );
  }
  if (slotMinutes > slotDuration * MAX_CONSECUTIVE_SLOTS) {
    throw new AppError(
      `Maximum booking duration is ${slotDuration * MAX_CONSECUTIVE_SLOTS} minutes`,
      400,
      'SLOT_RANGE_TOO_LONG',
    );
  }
  const slotCount = slotMinutes / cafe.slotDurationMinutes;
  const slotsNeeded = Math.ceil(slotMinutes / cafe.slotDurationMinutes);
  const playerCount = 1 + (body.participants?.length ?? 0); // booker + companions
  const slotStarts = getSlotStarts(slotStart, slotEnd, slotDuration);
  const lockedByocSlotStarts: Date[] = [];

  // Validate customer package if provided (T021)
  let customerPackage: CustomerPackage | null = null;
  if (body.customer_package_id) {
    const cpRepo = AppDataSource.getRepository(CustomerPackage);
    customerPackage = await cpRepo.findOne({ where: { id: body.customer_package_id } });
    if (!customerPackage) {
      throw new AppError('Package not found', 404, 'CUSTOMER_PACKAGE_NOT_FOUND');
    }
    if (customerPackage.customerId !== customerId) {
      throw new AppError('Package not owned by this customer', 403, 'CUSTOMER_PACKAGE_NOT_FOUND');
    }
    if (customerPackage.cafeId !== body.cafe_id) {
      throw new AppError('Package is for a different cafe', 400, 'PACKAGE_CAFE_MISMATCH');
    }
    if (customerPackage.status !== CustomerPackageStatus.ACTIVE) {
      throw new AppError('Package is not active', 400, 'PACKAGE_EXPIRED');
    }
    if (customerPackage.expiresAt < new Date()) {
      throw new AppError('Package has expired', 400, 'PACKAGE_EXPIRED');
    }
    if (customerPackage.slotsRemaining < slotsNeeded) {
      throw new AppError('Package has insufficient slots', 400, 'PACKAGE_INSUFFICIENT_SLOTS');
    }
    // Load Package template to check applicable_play_modes
    const { Package: PackageEntity } = await import('../models/package.entity');
    const pkg = await AppDataSource.getRepository(PackageEntity).findOne({
      where: { id: customerPackage.packageId },
    });
    if (
      pkg &&
      pkg.applicablePlayModes.length > 0 &&
      !pkg.applicablePlayModes.includes(body.play_mode)
    ) {
      throw new AppError(
        'Package does not apply to this play mode',
        400,
        'PACKAGE_PLAY_MODE_MISMATCH',
      );
    }
  }

  // Dynamic pricing lookup — multiplier frozen at booking creation time (snapshot-first)
  const { multiplier: slotMultiplier, label: pricingLabel } = await getEffectiveMultiplier(
    body.cafe_id,
    slotStart,
  );

  const baseSlotFeeRate = Number(cafe.slotFeeRate) * slotMultiplier;
  const rawSlotFee = baseSlotFeeRate * slotCount * playerCount;
  // Package covers only the booker's slot fee (1 person). Companions still pay.
  const slotFee = customerPackage
    ? baseSlotFeeRate * slotCount * Math.max(0, playerCount - 1)
    : rawSlotFee;

  let rentalFeeTotal = 0;
  const vehiclePricings: Array<{
    vehicleId: string;
    hourlyRate: number;
    rentalFee: number;
    catalogName: string;
    tier: string;
    identifier: string | null;
    color: string | null;
    coverImageUrl: string | null;
  }> = [];

  if (body.play_mode === BookingMode.RENTAL) {
    if (!body.vehicle_ids.length) {
      throw new AppError('vehicle_ids required for RENTAL mode', 400, 'VEHICLE_REQUIRED');
    }

    const vehicleRepo = AppDataSource.getRepository(Vehicle);
    const catalogRepo = AppDataSource.getRepository(VehicleCatalog);

    for (const vehicleId of body.vehicle_ids) {
      // Accept either a unit ID or a catalog ID — if catalog, auto-pick an available unit
      let vehicle = await vehicleRepo.findOne({ where: { id: vehicleId, cafeId: body.cafe_id } });
      const catalog = vehicle
        ? await catalogRepo.findOne({ where: { id: vehicle.catalogId } })
        : await catalogRepo.findOne({ where: { id: vehicleId, cafeId: body.cafe_id } });

      if (!vehicle) {
        if (!catalog)
          throw new AppError(`Vehicle ${vehicleId} not found`, 404, 'VEHICLE_NOT_FOUND');
        vehicle = await vehicleRepo.findOne({
          where: { catalogId: catalog.id, cafeId: body.cafe_id, status: VehicleStatus.AVAILABLE },
        });
        if (!vehicle)
          throw new AppError(
            `No available unit for catalog ${catalog.id}`,
            400,
            'VEHICLE_UNAVAILABLE',
          );
      } else if (vehicle.status !== VehicleStatus.AVAILABLE) {
        throw new AppError(`Vehicle ${vehicleId} is not available`, 400, 'VEHICLE_UNAVAILABLE');
      }

      if (!catalog) throw new AppError('Vehicle catalog not found', 500, 'CATALOG_NOT_FOUND');

      const hourlyRate = Number(catalog.hourlyRate);
      const rentalFee = hourlyRate * (slotMinutes / 60);
      rentalFeeTotal += rentalFee;
      vehiclePricings.push({
        vehicleId: vehicle.id,
        hourlyRate,
        rentalFee,
        catalogName: catalog.name,
        tier: catalog.tier,
        identifier: vehicle.identifier,
        color: vehicle.color,
        coverImageUrl: vehicle.distinctiveImageUrl ?? catalog.coverImageUrl,
      });
    }

    const selectedVehicleIds = vehiclePricings.map((vehicle) => vehicle.vehicleId);
    if (new Set(selectedVehicleIds).size !== selectedVehicleIds.length) {
      throw new AppError('A vehicle can only be selected once', 400, 'DUPLICATE_VEHICLE');
    }
    await assertRentalVehiclesAvailable(selectedVehicleIds, slotStart, slotEnd);
  }

  // Resolve track config (required for new bookings; optional for legacy compat)
  let resolvedTrackConfig: CafeTrackConfig | null = null;
  let resolvedTrackType: TrackType | null = null;
  if (body.track_config_id) {
    resolvedTrackConfig = await AppDataSource.getRepository(CafeTrackConfig).findOne({
      where: { id: body.track_config_id, cafeId: body.cafe_id, isActive: true },
    });
    if (!resolvedTrackConfig || resolvedTrackConfig.deletedAt) {
      throw new AppError('Track config not found or inactive', 400, 'TRACK_CONFIG_NOT_FOUND');
    }
    resolvedTrackType = await AppDataSource.getRepository(TrackType).findOne({
      where: { id: resolvedTrackConfig.trackTypeId },
    });
  }

  await assertBookingNotBlockedByContest({
    cafeId: body.cafe_id,
    slotStart,
    slotEnd,
    trackConfigId: resolvedTrackConfig?.id ?? null,
    trackTypeId: resolvedTrackConfig?.trackTypeId ?? body.track_type_id ?? null,
    contestId: body.contest_id ?? null,
  });

  if (body.play_mode === BookingMode.BYOC) {
    const capacity = resolvedTrackConfig ? resolvedTrackConfig.byocCapacity : cafe.byocCapacity;
    for (const rangeSlotStart of slotStarts) {
      const rangeSlotEnd = new Date(rangeSlotStart.getTime() + slotDuration * 60 * 1000);
      const dbOccupied = await countOccupiedByocParticipants(
        body.cafe_id,
        rangeSlotStart,
        rangeSlotEnd,
        resolvedTrackConfig?.id,
        resolvedTrackConfig?.trackTypeId,
      );
      const locked = await acquireByocSlot(
        body.cafe_id,
        rangeSlotStart,
        Math.max(0, capacity - dbOccupied),
        playerCount,
        resolvedTrackConfig?.id,
      );
      if (!locked) {
        await Promise.all(
          lockedByocSlotStarts.map((lockedSlotStart) =>
            releaseByocSlot(body.cafe_id, lockedSlotStart, playerCount, resolvedTrackConfig?.id),
          ),
        );
        throw new AppError('BYOC capacity full for this slot', 400, 'BYOC_CAPACITY_FULL');
      }
      lockedByocSlotStarts.push(rangeSlotStart);
    }
  }

  // Validate vehicle compat with track type for RENTAL
  if (body.play_mode === BookingMode.RENTAL && resolvedTrackConfig) {
    const catalogRepo = AppDataSource.getRepository(VehicleCatalog);
    for (const vehicleId of body.vehicle_ids) {
      // vehicleId may be a unit ID or catalog ID
      const unit = await AppDataSource.getRepository(Vehicle).findOne({ where: { id: vehicleId } });
      const catalog = unit
        ? await catalogRepo.findOne({ where: { id: unit.catalogId } })
        : await catalogRepo.findOne({ where: { id: vehicleId } });
      if (
        catalog &&
        catalog.compatibleTrackTypes.length > 0 &&
        !catalog.compatibleTrackTypes.includes(resolvedTrackConfig.trackTypeId)
      ) {
        throw new AppError(
          `Vehicle ${vehicleId} is not compatible with this track type`,
          400,
          'VEHICLE_TRACK_INCOMPATIBLE',
        );
      }
    }
  }

  let fnbTotal = 0;
  const fnbPricings: Array<{
    menuItemId: string;
    menuItemVariantId: string | null;
    itemName: string;
    variantName: string | null;
    quantity: number;
    unitPrice: number;
    subtotal: number;
    notes?: string;
  }> = [];
  if (body.fnb_items.length > 0) {
    const menuRepo = AppDataSource.getRepository(MenuItem);
    for (const item of body.fnb_items) {
      const menuItem = await menuRepo.findOne({
        where: { id: item.menu_item_id, cafeId: body.cafe_id },
      });
      if (!menuItem || !menuItem.isAvailable) {
        throw new AppError(
          `Menu item ${item.menu_item_id} not available`,
          400,
          'MENU_ITEM_UNAVAILABLE',
        );
      }
      if (item.variant_id && menuItem.isCombo) {
        throw new AppError('Combo không có lựa chọn riêng', 400, 'INVALID_MENU_VARIANT');
      }
      const variant = item.variant_id
        ? await AppDataSource.getRepository(MenuItemVariant).findOne({
            where: { id: item.variant_id, menuItemId: menuItem.id },
          })
        : null;
      if (item.variant_id && (!variant || !variant.isAvailable)) {
        throw new AppError('Lựa chọn món không khả dụng', 400, 'MENU_VARIANT_UNAVAILABLE');
      }
      const unitPrice = Number(variant?.price ?? menuItem.price);
      const subtotal = unitPrice * item.quantity;
      fnbTotal += subtotal;
      fnbPricings.push({
        menuItemId: item.menu_item_id,
        menuItemVariantId: variant?.id ?? null,
        itemName: menuItem.name,
        variantName: variant?.name ?? null,
        quantity: item.quantity,
        unitPrice,
        subtotal,
        notes: item.notes,
      });
    }
  }

  const totalAmount = slotFee + rentalFeeTotal + fnbTotal;

  // Promo code validation — discount applies to slot_fee + rental_fee only
  let discountAmount = 0;
  let appliedPromotion: Promotion | undefined;
  if (body.promotion_code) {
    const promoSubtotal = slotFee + rentalFeeTotal;
    const promoResult = await validatePromoCode({
      cafeId: body.cafe_id,
      code: body.promotion_code,
      customerId,
      subtotal: promoSubtotal,
      playMode: body.play_mode,
      slotStart,
    });
    discountAmount = promoResult.discountAmount;
    appliedPromotion = promoResult.promotion;
  }
  const discountedTotal = Math.max(0, totalAmount - discountAmount);

  const paymentExpiresAt = new Date(Date.now() + env.platform.paymentWindowMinutes * 60 * 1000);
  // The ID is allocated before taking Redis locks, so a later timeout/cancel
  // can release only locks owned by this booking.
  const bookingId = randomUUID();

  // Acquire Redis slot locks for RENTAL vehicles
  const lockedVehicleSlots: VehicleSlotLock[] = vehiclePricings
    .flatMap(({ vehicleId }) => slotStarts.map((slotStart) => ({ vehicleId, slotStart })))
    .sort((left, right) => {
      const byVehicle = left.vehicleId.localeCompare(right.vehicleId);
      return byVehicle || left.slotStart.getTime() - right.slotStart.getTime();
    });
  if (body.play_mode === BookingMode.RENTAL) {
    const locked = await acquireVehicleSlotLocks(lockedVehicleSlots, bookingId);
    if (!locked) {
      throw new AppError(
        'A selected vehicle is currently being reserved for this slot',
        409,
        'SLOT_LOCKED',
      );
    }
  }

  try {
    const booking = await AppDataSource.transaction(async (em) => {
      // Determine track_type_id: prefer from track config, fall back to legacy field or cafe default
      const trackTypeId =
        resolvedTrackConfig?.trackTypeId ?? body.track_type_id ?? cafe.trackTypes?.[0];
      if (!trackTypeId) {
        throw new AppError('Cafe has no track types configured', 400, 'NO_TRACK_TYPE');
      }

      const snapshot: Record<string, unknown> = resolvedTrackConfig
        ? {
            track_config_id: resolvedTrackConfig.id,
            track_type_id: resolvedTrackConfig.trackTypeId,
            track_type_code: resolvedTrackType?.code ?? null,
            track_type_name: resolvedTrackType?.name ?? null,
            byoc_capacity_at_booking: resolvedTrackConfig.byocCapacity,
          }
        : {};

      // Write package_used into snapshot before saving (Constitution Principle I)
      if (customerPackage) {
        snapshot.package_used = {
          customer_package_id: customerPackage.id,
          package_id: customerPackage.packageId,
          package_name: customerPackage.packageNameSnapshot,
          slots_used: slotsNeeded,
        };
      }

      // Freeze dynamic pricing at booking creation time (snapshot-first, immutable)
      snapshot.slot_fee_multiplier = slotMultiplier;
      snapshot.pricing_rule_label = pricingLabel;
      // The payment hold is a quoted offer. Persist every chargeable amount now
      // so both the customer and the later checkout use the same price even if
      // a cafe changes its rates while the hold is active.
      snapshot.slot_fee_total = slotFee;
      snapshot.vehicles = vehiclePricings.map((vehicle) => ({
        vehicle_id: vehicle.vehicleId,
        rental_fee: vehicle.rentalFee,
      }));
      snapshot.fnb_total = fnbTotal;
      snapshot.discount_amount = discountAmount;
      snapshot.total_charged = discountedTotal;
      snapshot.captured_at = new Date().toISOString();

      if (appliedPromotion) {
        snapshot.promotion_applied = {
          promotion_id: appliedPromotion.id,
          code: appliedPromotion.code,
          discount_amount: discountAmount,
          discount_type: appliedPromotion.discountType,
        };
      }
      if (body.contest_id) {
        snapshot.contest_id = body.contest_id;
      }

      const newBooking = em.create(Booking, {
        id: bookingId,
        customerId,
        cafeId: body.cafe_id,
        trackTypeId,
        trackConfigId: resolvedTrackConfig?.id ?? null,
        playMode: body.play_mode,
        source: body.source ?? BookingSource.APP,
        status: BookingStatus.PENDING,
        slotStart,
        slotEnd,
        paymentExpiresAt,
        discountAmount,
        promotionId: appliedPromotion?.id ?? null,
        customerPackageId: customerPackage?.id ?? null,
        contestId: body.contest_id ?? null,
        snapshot: Object.keys(snapshot).length > 0 ? snapshot : null,
      });
      await em.save(newBooking);

      // Primary participant = customer (BOOKER)
      const primaryParticipant = em.create(BookingParticipant, {
        bookingId: newBooking.id,
        userId: customerId,
        participantType: BookingParticipantType.BOOKER,
        isPrimaryResponsible: true,
      });
      await em.save(primaryParticipant);

      // Additional participants
      for (const p of body.participants) {
        const participant = em.create(BookingParticipant, {
          bookingId: newBooking.id,
          userId: p.user_id ?? null,
          participantType: p.participant_type,
          isPrimaryResponsible: false,
          guestName: p.guest_name ?? null,
          guestPhone: p.guest_phone ?? null,
        });
        await em.save(participant);
      }

      // Booking vehicles
      for (const vp of vehiclePricings) {
        const bv = em.create(BookingVehicle, {
          bookingId: newBooking.id,
          vehicleId: vp.vehicleId,
          hourlyRateSnapshot: vp.hourlyRate,
          rentalFeeSnapshot: vp.rentalFee,
          catalogNameSnapshot: vp.catalogName,
          tierSnapshot: vp.tier,
          identifierSnapshot: vp.identifier,
          colorSnapshot: vp.color,
          coverImageUrlSnapshot: vp.coverImageUrl,
          // Retained as a legacy non-null database column until the schema
          // migration is deployed. New bookings must never charge a deposit.
          securityDepositSnapshot: 0,
        });
        await em.save(bv);
      }

      // F&B order
      if (fnbPricings.length > 0) {
        const fnbOrder = em.create(FnbOrder, {
          bookingId: newBooking.id,
          orderType: FnbOrderType.PRE_ORDER,
          totalAmount: fnbTotal,
          status: FnbOrderStatus.PENDING,
        });
        await em.save(fnbOrder);

        for (const fp of fnbPricings) {
          const item = em.create(FnbOrderItem, {
            fnbOrderId: fnbOrder.id,
            menuItemId: fp.menuItemId,
            menuItemVariantId: fp.menuItemVariantId,
            quantity: fp.quantity,
            unitPrice: fp.unitPrice,
            subtotal: fp.subtotal,
            itemNameSnapshot: fp.itemName,
            variantNameSnapshot: fp.variantName,
            notes: fp.notes ?? null,
          });
          await em.save(item);
        }
      }

      return newBooking;
    });

    if (body.play_mode === BookingMode.BYOC) {
      await Promise.all(
        lockedByocSlotStarts.map((lockedSlotStart) =>
          releaseByocSlot(body.cafe_id, lockedSlotStart, playerCount, resolvedTrackConfig?.id),
        ),
      );
      lockedByocSlotStarts.length = 0;
    }

    logger.info('BookingService', `created bookingId=${booking.id} mode=${body.play_mode}`);

    return {
      booking_id: booking.id,
      status: BookingStatus.PENDING,
      payment_expires_at: paymentExpiresAt,
      total_amount: discountedTotal,
      breakdown: {
        slot_fee: slotFee,
        slot_fee_base: Number(cafe.slotFeeRate) * slotCount * playerCount,
        slot_fee_multiplier: slotMultiplier,
        pricing_rule_label: pricingLabel,
        rental_fee: rentalFeeTotal,
        fnb_total: fnbTotal,
        discount: discountAmount,
        total: discountedTotal,
      },
    };
  } catch (err) {
    // Release locks on transaction failure
    await releaseVehicleSlotLocks(lockedVehicleSlots, bookingId);
    if (body.play_mode === BookingMode.BYOC) {
      await Promise.all(
        lockedByocSlotStarts.map((lockedSlotStart) =>
          releaseByocSlot(body.cafe_id, lockedSlotStart, playerCount, resolvedTrackConfig?.id),
        ),
      );
    }
    throw err;
  }
}

// ── cancelBooking ─────────────────────────────────────────────────────────────

export async function cancelBooking(
  bookingId: string,
  cancelledBy: string,
  role: UserRole,
  reason?: string,
): Promise<{ refund_amount: number; requiresRefundProcessing: boolean }> {
  const repo = AppDataSource.getRepository(Booking);
  const booking = await repo.findOne({ where: { id: bookingId } });
  if (!booking) throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');
  if (![BookingStatus.PENDING, BookingStatus.CONFIRMED].includes(booking.status)) {
    throw new AppError(
      'Booking cannot be cancelled in its current state',
      400,
      'BOOKING_NOT_CANCELLABLE',
    );
  }

  // Once staff has begun handover or a play session exists, the booking has
  // entered an operational flow. It must be closed through check-out/incident
  // handling, never through the pre-session cancellation policy.
  const inProgressSession = await AppDataSource.getRepository(Session).exist({
    where: {
      bookingId,
      status: In([
        SessionStatus.CHECKED_IN,
        SessionStatus.ACTIVE,
        SessionStatus.EXTENDING,
        SessionStatus.CHECKING_OUT,
        SessionStatus.COMPLETED,
      ]),
    },
  });
  if (inProgressSession) {
    throw new AppError(
      'Phiên chơi đã bắt đầu hoặc đang bàn giao xe; không thể hủy theo chính sách đặt lịch',
      409,
      'BOOKING_SESSION_IN_PROGRESS',
    );
  }

  if (role === UserRole.CUSTOMER && booking.customerId !== cancelledBy) {
    throw new AppError('Access denied', 403, 'NOT_BOOKING_OWNER');
  }
  if (role === UserRole.PROVIDER) {
    const ownsCafe = await AppDataSource.getRepository(Cafe).exist({
      where: { id: booking.cafeId, providerId: cancelledBy },
    });
    if (!ownsCafe) {
      throw new AppError('Access denied', 403, 'BOOKING_CAFE_FORBIDDEN');
    }
  }
  if (role === UserRole.STAFF) {
    const [assignment] = await AppDataSource.query<{ exists: boolean }[]>(
      `SELECT EXISTS(
         SELECT 1
         FROM staff_cafe_assignments assignment
         JOIN users staff ON staff.id = assignment.staff_id
         WHERE assignment.staff_id = $1
           AND assignment.cafe_id = $2
           AND staff.is_active = true
           AND staff.deleted_at IS NULL
       ) AS exists`,
      [cancelledBy, booking.cafeId],
    );
    if (!assignment?.exists) {
      throw new AppError('Access denied', 403, 'STAFF_NOT_ASSIGNED_TO_CAFE');
    }
  }

  await repo.update(bookingId, {
    status: BookingStatus.CANCELLED,
    cancelledBy,
    cancelledAt: new Date(),
    cancellationReason: reason ?? null,
  });

  // Release slot locks
  const bvRepo = AppDataSource.getRepository(BookingVehicle);
  const vehicles = await bvRepo.find({ where: { bookingId } });
  const slotStarts = await getBookingSlotStarts(booking);
  await releaseVehicleSlotLocks(
    slotStarts.flatMap((slotStart) =>
      vehicles.map((vehicle) => ({ vehicleId: vehicle.vehicleId, slotStart })),
    ),
    booking.id,
  );
  if (booking.playMode === BookingMode.BYOC) {
    const participantCount = await AppDataSource.getRepository(BookingParticipant).count({
      where: { bookingId },
    });
    await Promise.all(
      slotStarts.map((slotStart) =>
        releaseByocSlot(booking.cafeId, slotStart, participantCount || 1, booking.trackConfigId),
      ),
    );
  }

  await cancelPendingFnbOrders(bookingId);
  logger.info('BookingService', `cancelled bookingId=${bookingId} by ${role}`);

  // ── Gửi thông báo hủy đơn ──
  try {
    const bookingCode = booking.id.substring(0, 8).toUpperCase();
    const staffAssignments = await AppDataSource.query<{ staff_id: string }[]>(
      `SELECT staff_id FROM staff_cafe_assignments WHERE cafe_id = $1`,
      [booking.cafeId],
    );
    const cafe = await AppDataSource.getRepository(Cafe).findOne({
      where: { id: booking.cafeId },
      select: ['providerId'],
    });

    if (role === UserRole.PROVIDER || role === UserRole.STAFF) {
      // 1. Gửi thông báo cho Khách hàng
      const customerTitle = 'Đơn đặt lịch bị hủy';
      const customerMessage = `Đơn đặt lịch #${bookingCode} của bạn đã bị hủy bởi nhà cung cấp.`;
      const customerRoute = `/customer/bookings/${booking.id}`;

      await createNotification(
        booking.customerId,
        NotificationType.BOOKING_CANCELLED,
        customerTitle,
        customerMessage,
        { bookingId: booking.id, route: customerRoute },
      );

      wsService.pushToUser(booking.customerId, 'BOOKING_CANCELLED', {
        bookingId: booking.id,
        title: customerTitle,
        message: customerMessage,
        route: customerRoute,
      });

      // 2. Gửi thông báo cho Staff (lưu DB & WebSocket)
      const staffTitle = 'Đơn đặt lịch bị hủy';
      const staffMessage = `Đơn đặt lịch #${bookingCode} tại cơ sở vừa bị hủy bởi nhà cung cấp.`;

      for (const assignment of staffAssignments) {
        await createNotification(
          assignment.staff_id,
          NotificationType.BOOKING_CANCELLED,
          staffTitle,
          staffMessage,
          { bookingId: booking.id, route: `/staff/bookings/${booking.id}` },
        );
      }

      wsService.pushToCafe(booking.cafeId, 'BOOKING_CANCELLED_OPERATIONAL', {
        bookingId: booking.id,
        title: staffTitle,
        message: staffMessage,
        routeStaff: `/staff/bookings/${booking.id}`,
        routeProvider: '/provider/bookings',
        cancelledBy,
      });
      if (cafe?.providerId) {
        wsService.pushToUser(cafe.providerId, 'BOOKING_CANCELLED_OPERATIONAL', {
          bookingId: booking.id,
          title: staffTitle,
          message: staffMessage,
          routeStaff: `/staff/bookings/${booking.id}`,
          routeProvider: '/provider/bookings',
          cancelledBy,
        });
      }
    } else if (role === UserRole.CUSTOMER) {
      // Khách tự hủy: chỉ gửi cho Staff của cơ sở
      const staffTitle = 'Khách hàng hủy đặt lịch';
      const staffMessage = `Đơn đặt lịch #${bookingCode} tại cơ sở vừa bị khách hàng chủ động hủy.`;

      for (const assignment of staffAssignments) {
        await createNotification(
          assignment.staff_id,
          NotificationType.BOOKING_CANCELLED,
          staffTitle,
          staffMessage,
          { bookingId: booking.id, route: `/staff/bookings/${booking.id}` },
        );
      }

      wsService.pushToCafe(booking.cafeId, 'BOOKING_CANCELLED_OPERATIONAL', {
        bookingId: booking.id,
        title: staffTitle,
        message: staffMessage,
        routeStaff: `/staff/bookings/${booking.id}`,
        routeProvider: '/provider/bookings',
        cancelledBy,
      });
      if (cafe?.providerId) {
        wsService.pushToUser(cafe.providerId, 'BOOKING_CANCELLED_OPERATIONAL', {
          bookingId: booking.id,
          title: staffTitle,
          message: staffMessage,
          routeStaff: `/staff/bookings/${booking.id}`,
          routeProvider: '/provider/bookings',
          cancelledBy,
        });
      }
    }
  } catch (notifErr) {
    logger.error('BookingService', 'Lỗi khi gửi thông báo hủy đơn', notifErr);
  }

  // Mirror the cancellation to the linked contest registration (contest rental
  // bookings). Never blocks the booking cancel: failures are logged only.
  if (booking.contestId) {
    try {
      await cancelContestRegistrationOnBookingCancel(booking, cancelledBy, role);
    } catch (err) {
      logger.warn(
        'BookingService',
        `contest registration sync failed bookingId=${bookingId}: ${(err as Error).message}`,
      );
    }
  }

  // A PENDING booking is only a hold: no payment has succeeded and package
  // slots/promotion usage have not been committed, so there is nothing to refund.
  if (booking.status === BookingStatus.PENDING) {
    await broadcastBookingUpdated(booking, BookingStatus.CANCELLED, 'HOLD_CANCELLED');
    return { refund_amount: 0, requiresRefundProcessing: false };
  }

  // Package credits follow the same cancellation windows as cash slot fees.
  // Decimal credits preserve a fair 50% refund even when a booking used an odd
  // number of slots.
  const snapshotData = booking.snapshot as {
    package_used?: { customer_package_id: string; slots_used: number };
  } | null;
  const packageRefundRatio = getPackageCreditRefundRatio(role, booking.slotStart);
  const packageSlotsToRefund = snapshotData?.package_used
    ? snapshotData.package_used.slots_used * packageRefundRatio
    : 0;
  if (snapshotData?.package_used && packageSlotsToRefund > 0) {
    const qr = AppDataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      await refundSlots(snapshotData.package_used.customer_package_id, packageSlotsToRefund, qr);
      await qr.commitTransaction();
      logger.info(
        'BookingService',
        `slot credit refund applied bookingId=${bookingId} slots=${packageSlotsToRefund}`,
      );
    } catch (err) {
      await qr.rollbackTransaction();
      logger.error('BookingService', `slot refund failed bookingId=${bookingId}`, err);
    } finally {
      await qr.release();
    }
  }

  await broadcastBookingUpdated(
    booking,
    BookingStatus.CANCELLED,
    role === UserRole.CUSTOMER ? 'CUSTOMER_CANCEL' : 'PROVIDER_CANCEL',
  );

  // Return placeholder — PaymentService.processRefund handles actual amount
  return { refund_amount: 0, requiresRefundProcessing: true };
}

/**
 * Package credits follow the customer cancellation windows for the slot fee.
 * Credits are never restored after the scheduled session has begun, even when
 * the cafe performs the cancellation, because the operational flow owns that
 * outcome from that point onward.
 */
export function getPackageCreditRefundRatio(
  role: UserRole,
  slotStart: Date,
  now = new Date(),
): number {
  const hoursBeforeSlot = (slotStart.getTime() - now.getTime()) / (1000 * 60 * 60);
  if (hoursBeforeSlot <= 0) return 0;
  if (role === UserRole.PROVIDER || hoursBeforeSlot > 24) return 1;
  return hoursBeforeSlot >= 12 ? 0.5 : 0;
}

/**
 * When a booking linked to a contest is cancelled, cancel the linked contest
 * registration (PENDING/CONFIRMED → CANCELLED) with an audit log entry and a
 * customer notification. Mirrors cancelRegistration in contest/registrations.
 */
export async function cancelContestRegistrationOnBookingCancel(
  booking: Booking,
  cancelledBy: string,
  role: UserRole | 'SYSTEM',
): Promise<void> {
  const registration = await AppDataSource.getRepository(ContestRegistration).findOne({
    where: {
      bookingId: booking.id,
      status: In([ContestRegistrationStatus.PENDING, ContestRegistrationStatus.CONFIRMED]),
    },
  });
  if (!registration) return;

  const previousStatus = registration.status;
  registration.status = ContestRegistrationStatus.CANCELLED;
  registration.cancelledBy = cancelledBy;
  registration.cancelledAt = new Date();
  registration.cancellationReason = 'Booking cancelled';
  await AppDataSource.getRepository(ContestRegistration).save(registration);

  await writeContestAudit({
    contestId: booking.contestId!,
    registrationId: registration.id,
    actorId: cancelledBy,
    actorRole: role,
    eventType: 'registration.cancelled_via_booking_cancel',
    beforeJson: { status: previousStatus },
    afterJson: { status: registration.status },
    reason: registration.cancellationReason,
    metadata: { booking_id: booking.id },
  });

  await sendContestRegistrationStatusNotification(
    registration,
    NotificationType.CONTEST_REGISTRATION_CANCELLED,
    'Đăng ký giải đấu đã bị huỷ',
    'Đăng ký của bạn bị huỷ do phiếu thuê xe kèm theo đã bị huỷ.',
  );
}

// ── listCafeBookings ──────────────────────────────────────────────────────────
export interface ListCafeBookingsQuery {
  date?: string;
  from?: string;
  to?: string;
  status?: BookingStatus;
  page: number;
  limit: number;
}

export interface CafeBookingListSummary {
  totalBookings: number;
  pendingPaymentCount: number;
  awaitingAdditionalPaymentCount: number;
  confirmedBookingCount: number;
  activeSessionCount: number;
}

export async function listCafeBookings(
  cafeId: string,
  query: ListCafeBookingsQuery,
): Promise<{
  data: CafeBookingListItem[];
  total: number;
  page: number;
  limit: number;
  summary: CafeBookingListSummary;
}> {
  const period = resolveCafeBookingListPeriod(query);

  let qb = AppDataSource.createQueryBuilder(Booking, 'b')
    .innerJoin('users', 'u', 'u.id = b.customer_id')
    .leftJoin(Session, 's', 's.booking_id = b.id')
    .select([
      'b.id AS id',
      'b.status AS status',
      'b.play_mode AS "playMode"',
      // Kênh đặt — nhân viên tại quầy cần biết đơn này đến từ đâu để xử lý đúng.
      // Đơn Facebook thuộc về khách KHÔNG đăng nhập được, nên các bước cần khách
      // xác nhận phải đi qua đường thao tác hộ.
      'b.source AS source',
      'b.slot_start AS "slotStart"',
      'b.slot_end AS "slotEnd"',
      'b.created_at AS "createdAt"',
      'b.payment_expires_at AS "paymentExpiresAt"',
      'b.cancelled_by AS "cancelledBy"',
      'b.cancellation_reason AS "cancellationReason"',
      'u.full_name AS "customerName"',
      'u.phone AS "customerPhone"',
      's.status AS "sessionStatus"',
      // Giờ kết thúc DỰ KIẾN của phiên, không phải giờ đặt: gia hạn đẩy nó ra
      // xa hơn `slot_end`. Giao diện cần đúng mốc này để phân biệt "đang chơi"
      // với "quá giờ chưa trả xe" — lấy `slot_end` thì mọi phiên đang gia hạn
      // đều bị báo quá giờ oan.
      's.planned_end_at AS "sessionPlannedEndAt"',
      "(SELECT EXISTS (SELECT 1 FROM payment_transactions WHERE booking_id = b.id AND type = 'REFUND' AND status = 'PENDING')) AS \"hasPendingRefund\"",
    ])
    .where('b.cafe_id = :cafeId', { cafeId })
    .andWhere('b.deleted_at IS NULL')
    .orderBy('b.slot_start', period ? 'ASC' : 'DESC')
    .offset((query.page - 1) * query.limit)
    .limit(query.limit);

  if (period) {
    qb = qb
      .andWhere('b.slot_start >= :periodStart', { periodStart: period.start })
      .andWhere('b.slot_start <= :periodEnd', { periodEnd: period.end });
  }

  if (query.status) {
    qb = qb.andWhere('b.status = :status', { status: query.status });
  }

  const summaryConditions = ['b.cafe_id = $1', 'b.deleted_at IS NULL'];
  const summaryParams: unknown[] = [cafeId];
  if (period) {
    summaryParams.push(period.start, period.end);
    summaryConditions.push(`b.slot_start >= $${summaryParams.length - 1}::timestamptz`);
    summaryConditions.push(`b.slot_start <= $${summaryParams.length}::timestamptz`);
  }

  const [raw, total, summaryRows] = await Promise.all([
    qb.getRawMany<CafeBookingListItem>(),
    qb.getCount(),
    AppDataSource.query<
      Array<{
        totalBookings: number | string;
        pendingPaymentCount: number | string;
        awaitingAdditionalPaymentCount: number | string;
        confirmedBookingCount: number | string;
        activeSessionCount: number | string;
      }>
    >(
      `SELECT
        COUNT(DISTINCT b.id)::int AS "totalBookings",
        COUNT(DISTINCT b.id) FILTER (WHERE b.status = 'PENDING')::int AS "pendingPaymentCount",
        COUNT(DISTINCT b.id) FILTER (WHERE b.status = 'AWAITING_PAYMENT')::int AS "awaitingAdditionalPaymentCount",
        COUNT(DISTINCT b.id) FILTER (WHERE b.status = 'CONFIRMED')::int AS "confirmedBookingCount",
        COUNT(DISTINCT b.id) FILTER (WHERE s.status IN ('ACTIVE', 'EXTENDING', 'CHECKING_OUT'))::int AS "activeSessionCount"
       FROM bookings b
       LEFT JOIN sessions s ON s.booking_id = b.id
       WHERE ${summaryConditions.join('\n         AND ')}`,
      summaryParams,
    ),
  ]);
  const summaryRow = summaryRows[0];
  const summary: CafeBookingListSummary = {
    totalBookings: Number(summaryRow?.totalBookings ?? 0),
    pendingPaymentCount: Number(summaryRow?.pendingPaymentCount ?? 0),
    awaitingAdditionalPaymentCount: Number(summaryRow?.awaitingAdditionalPaymentCount ?? 0),
    confirmedBookingCount: Number(summaryRow?.confirmedBookingCount ?? 0),
    activeSessionCount: Number(summaryRow?.activeSessionCount ?? 0),
  };

  return { data: raw, total, page: query.page, limit: query.limit, summary };
}

function resolveCafeBookingListPeriod(
  query: ListCafeBookingsQuery,
): { start: Date; end: Date } | null {
  if (query.date) {
    return {
      start: new Date(`${query.date}T00:00:00+07:00`),
      end: new Date(`${query.date}T23:59:59+07:00`),
    };
  }
  if (query.from && query.to) {
    return {
      start: new Date(`${query.from}T00:00:00+07:00`),
      end: new Date(`${query.to}T23:59:59+07:00`),
    };
  }

  return null;
}

export interface CafeBookingListItem {
  id: string;
  status: BookingStatus;
  playMode: string;
  source: BookingSource;
  slotStart: string;
  slotEnd: string;
  createdAt: string;
  paymentExpiresAt: string | null;
  cancelledBy: string | null;
  cancellationReason: string | null;
  customerName: string;
  customerPhone: string | null;
  sessionStatus?: string | null;
  sessionPlannedEndAt?: string | null;
  hasPendingRefund?: boolean;
}

async function cancelPendingFnbOrders(bookingId: string): Promise<void> {
  await AppDataSource.query(
    `UPDATE fnb_orders
     SET status = 'CANCELLED'
     WHERE booking_id = $1
       AND status IN ('PENDING', 'CONFIRMED')`,
    [bookingId],
  );
}

export interface WalkInParticipantInput {
  guest_name: string;
  guest_phone: string;
  participant_type: BookingParticipantType.WALK_IN_GUEST;
}

export interface CreateWalkInBookingBody {
  play_mode: BookingMode;
  track_type_id: string;
  slot_start: string;
  slot_end: string;
  payment_method: 'CASH' | 'BANK_TRANSFER';
  vehicle_ids: string[];
  participants: WalkInParticipantInput[];
  fnb_items?: Array<{
    menu_item_id: string;
    variant_id?: string;
    quantity: number;
    notes?: string;
  }>;
}

export interface CreateWalkInBookingResult {
  bookingId: string;
  bookingCode: string;
  status: string;
  source: string;
  paymentStatus: string;
  totalAmount: number;
  bankTransfer?: BankTransferCheckout;
}

export async function createWalkInBooking(
  staffId: string,
  cafeId: string,
  body: CreateWalkInBookingBody,
): Promise<CreateWalkInBookingResult> {
  const slotStart = new Date(body.slot_start);
  const slotEnd = new Date(body.slot_end);

  if (slotStart >= slotEnd) {
    throw new AppError('slot_start must be before slot_end', 400, 'INVALID_SLOT');
  }

  if (slotEnd <= new Date()) {
    throw new AppError('Cannot book a slot in the past', 400, 'SLOT_IN_PAST');
  }

  const primaryGuest = body.participants[0];
  if (!primaryGuest) {
    throw new AppError('Phải có ít nhất 1 người chơi tham gia', 400, 'PARTICIPANTS_REQUIRED');
  }

  const customer =
    (await findUserByPhone(primaryGuest.guest_phone)) ??
    (await createGuestUser(primaryGuest.guest_phone, primaryGuest.guest_name));

  const cafeRepo = AppDataSource.getRepository(Cafe);
  const cafe = await cafeRepo.findOne({ where: { id: cafeId } });
  if (!cafe) throw new AppError('Cafe not found', 404, 'CAFE_NOT_FOUND');
  if (cafe.status !== 'ACTIVE') throw new AppError('Cafe is not active', 400, 'CAFE_NOT_ACTIVE');
  assertSlotWithinOperatingHours(cafe, slotStart, slotEnd);
  await assertWithinSubscriptionCoverage(cafe, slotEnd);

  const slotDuration = cafe.slotDurationMinutes;
  const slotMinutes = (slotEnd.getTime() - slotStart.getTime()) / 60000;

  if (slotMinutes % slotDuration !== 0) {
    throw new AppError(
      `Slot range must be a multiple of ${slotDuration} minutes`,
      400,
      'INVALID_SLOT_RANGE',
    );
  }
  if (slotMinutes > slotDuration * MAX_CONSECUTIVE_SLOTS) {
    throw new AppError(
      `Maximum booking duration is ${slotDuration * MAX_CONSECUTIVE_SLOTS} minutes`,
      400,
      'SLOT_RANGE_TOO_LONG',
    );
  }
  const slotCount = slotMinutes / cafe.slotDurationMinutes;
  const playerCount = body.participants.length;
  const slotStarts = getSlotStarts(slotStart, slotEnd, slotDuration);
  const lockedByocSlotStarts: Date[] = [];

  const trackConfigRepo = AppDataSource.getRepository(CafeTrackConfig);
  const trackConfig = await trackConfigRepo.findOne({
    where: { cafeId, trackTypeId: body.track_type_id, isActive: true },
  });
  if (!trackConfig || trackConfig.deletedAt) {
    throw new AppError(
      'Track type not found or inactive for this cafe',
      400,
      'TRACK_CONFIG_NOT_FOUND',
    );
  }

  const trackType = await AppDataSource.getRepository(TrackType).findOne({
    where: { id: trackConfig.trackTypeId },
  });

  await assertBookingNotBlockedByContest({
    cafeId,
    slotStart,
    slotEnd,
    trackConfigId: trackConfig.id,
    trackTypeId: trackConfig.trackTypeId,
  });

  const { multiplier: slotMultiplier, label: pricingLabel } = await getEffectiveMultiplier(
    cafeId,
    slotStart,
  );
  const slotFee = Math.round(Number(cafe.slotFeeRate) * slotCount * playerCount * slotMultiplier);

  let rentalFeeTotal = 0;
  const vehiclePricings: Array<{
    vehicleId: string;
    hourlyRate: number;
    rentalFee: number;
    catalogName: string;
    tier: string;
    identifier: string;
    color: string | null;
    coverImageUrl: string | null;
  }> = [];

  if (body.play_mode === BookingMode.RENTAL) {
    if (!body.vehicle_ids || body.vehicle_ids.length === 0) {
      throw new AppError('Vehicles required for RENTAL mode', 400, 'VEHICLES_REQUIRED');
    }
    if (body.vehicle_ids.length !== playerCount) {
      throw new AppError(
        `Number of vehicles (${body.vehicle_ids.length}) must match number of participants (${playerCount})`,
        400,
        'VEHICLE_COUNT_MISMATCH',
      );
    }

    const vehicleRepo = AppDataSource.getRepository(Vehicle);
    const catalogRepo = AppDataSource.getRepository(VehicleCatalog);

    for (const vehicleId of body.vehicle_ids) {
      let vehicle = await vehicleRepo.findOne({
        where: { id: vehicleId, cafeId },
        relations: ['catalog'],
      });
      let catalog: VehicleCatalog | null | undefined = vehicle?.catalog;

      if (!vehicle) {
        catalog = await catalogRepo.findOne({ where: { id: vehicleId, cafeId } });
        if (!catalog)
          throw new AppError(`Vehicle ${vehicleId} not found`, 404, 'VEHICLE_NOT_FOUND');
        vehicle = await vehicleRepo.findOne({
          where: { catalogId: catalog.id, cafeId, status: VehicleStatus.AVAILABLE },
        });
        if (!vehicle)
          throw new AppError(
            `No available unit for catalog ${catalog.id}`,
            400,
            'VEHICLE_UNAVAILABLE',
          );
      } else if (vehicle.status !== VehicleStatus.AVAILABLE) {
        throw new AppError(`Vehicle ${vehicleId} is not available`, 400, 'VEHICLE_UNAVAILABLE');
      }

      if (!catalog) throw new AppError('Vehicle catalog not found', 500, 'CATALOG_NOT_FOUND');

      if (
        catalog.compatibleTrackTypes.length > 0 &&
        !catalog.compatibleTrackTypes.includes(trackConfig.trackTypeId)
      ) {
        throw new AppError(
          `Vehicle ${vehicleId} is not compatible with this track type`,
          400,
          'VEHICLE_TRACK_INCOMPATIBLE',
        );
      }

      const hourlyRate = Number(catalog.hourlyRate);
      const rentalFee = hourlyRate * (slotMinutes / 60);
      rentalFeeTotal += rentalFee;
      vehiclePricings.push({
        vehicleId: vehicle.id,
        hourlyRate,
        rentalFee,
        catalogName: catalog.name,
        tier: catalog.tier,
        identifier: vehicle.identifier ?? '',
        color: vehicle.color,
        coverImageUrl: vehicle.distinctiveImageUrl ?? catalog.coverImageUrl,
      });
    }

    const selectedVehicleIds = vehiclePricings.map((vehicle) => vehicle.vehicleId);
    if (new Set(selectedVehicleIds).size !== selectedVehicleIds.length) {
      throw new AppError('A vehicle can only be selected once', 400, 'DUPLICATE_VEHICLE');
    }
    await assertRentalVehiclesAvailable(selectedVehicleIds, slotStart, slotEnd);
  }

  if (body.play_mode === BookingMode.BYOC) {
    for (const rangeSlotStart of slotStarts) {
      const rangeSlotEnd = new Date(rangeSlotStart.getTime() + slotDuration * 60 * 1000);
      const dbOccupied = await countOccupiedByocParticipants(
        cafeId,
        rangeSlotStart,
        rangeSlotEnd,
        trackConfig.id,
        trackConfig.trackTypeId,
      );
      const locked = await acquireByocSlot(
        cafeId,
        rangeSlotStart,
        Math.max(0, trackConfig.byocCapacity - dbOccupied),
        playerCount,
        trackConfig.id,
      );
      if (!locked) {
        await Promise.all(
          lockedByocSlotStarts.map((lockedSlotStart) =>
            releaseByocSlot(cafeId, lockedSlotStart, playerCount, trackConfig.id),
          ),
        );
        throw new AppError('BYOC capacity full for this slot', 400, 'BYOC_CAPACITY_FULL');
      }
      lockedByocSlotStarts.push(rangeSlotStart);
    }
  }

  let fnbTotal = 0;
  const fnbPricings: Array<{
    menuItemId: string;
    menuItemVariantId: string | null;
    itemName: string;
    variantName: string | null;
    quantity: number;
    unitPrice: number;
    subtotal: number;
    notes?: string;
  }> = [];

  if (body.fnb_items && body.fnb_items.length > 0) {
    const menuRepo = AppDataSource.getRepository(MenuItem);
    for (const item of body.fnb_items) {
      const menuItem = await menuRepo.findOne({
        where: { id: item.menu_item_id, cafeId },
      });
      if (!menuItem || !menuItem.isAvailable) {
        throw new AppError(
          `Menu item ${item.menu_item_id} not available`,
          400,
          'MENU_ITEM_UNAVAILABLE',
        );
      }
      if (item.variant_id && menuItem.isCombo) {
        throw new AppError('Combo không có lựa chọn riêng', 400, 'INVALID_MENU_VARIANT');
      }
      const variant = item.variant_id
        ? await AppDataSource.getRepository(MenuItemVariant).findOne({
            where: { id: item.variant_id, menuItemId: menuItem.id },
          })
        : null;
      if (item.variant_id && (!variant || !variant.isAvailable)) {
        throw new AppError('Lựa chọn món không khả dụng', 400, 'MENU_VARIANT_UNAVAILABLE');
      }
      const unitPrice = Number(variant?.price ?? menuItem.price);
      const subtotal = unitPrice * item.quantity;
      fnbTotal += subtotal;
      fnbPricings.push({
        menuItemId: item.menu_item_id,
        menuItemVariantId: variant?.id ?? null,
        itemName: menuItem.name,
        variantName: variant?.name ?? null,
        quantity: item.quantity,
        unitPrice,
        subtotal,
        notes: item.notes,
      });
    }
  }

  const totalAmount = slotFee + rentalFeeTotal + fnbTotal;
  const bookingId = randomUUID();
  const isBankTransfer = body.payment_method === 'BANK_TRANSFER';
  const paymentExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
  let refCode: string | null = null;
  let bankTransfer: BankTransferCheckout | undefined;

  if (isBankTransfer) {
    refCode = await allocatePaymentRefCode();
    bankTransfer = await buildBankTransferCheckout({
      cafeId,
      amount: totalAmount,
      refCode,
      expiresAt: paymentExpiresAt,
    });
  }

  const lockedVehicleSlots: VehicleSlotLock[] = vehiclePricings
    .flatMap(({ vehicleId }) => slotStarts.map((slotStart) => ({ vehicleId, slotStart })))
    .sort((left, right) => {
      const byVehicle = left.vehicleId.localeCompare(right.vehicleId);
      return byVehicle || left.slotStart.getTime() - right.slotStart.getTime();
    });
  if (body.play_mode === BookingMode.RENTAL) {
    const locked = await acquireVehicleSlotLocks(lockedVehicleSlots, bookingId);
    if (!locked) {
      throw new AppError(
        'A selected vehicle is currently being reserved for this slot',
        409,
        'SLOT_LOCKED',
      );
    }
  }

  try {
    const booking = await AppDataSource.transaction(async (em) => {
      const snapshot: Record<string, unknown> = {
        track_config_id: trackConfig.id,
        track_type_id: trackConfig.trackTypeId,
        track_type_code: trackType?.code ?? null,
        track_type_name: trackType?.name ?? null,
        byoc_capacity_at_booking: trackConfig.byocCapacity,
        slot_fee_multiplier: slotMultiplier,
        pricing_rule_label: pricingLabel,
        created_by_staff_id: staffId,
        payment_method: body.payment_method,
        slot_fee_total: slotFee,
      };

      const newBooking = em.create(Booking, {
        id: bookingId,
        customerId: customer.id,
        cafeId,
        trackTypeId: trackConfig.trackTypeId,
        trackConfigId: trackConfig.id,
        playMode: body.play_mode,
        source: BookingSource.STAFF_MANUAL,
        status: isBankTransfer ? BookingStatus.PENDING : BookingStatus.CONFIRMED,
        slotStart,
        slotEnd,
        paymentExpiresAt: isBankTransfer ? paymentExpiresAt : new Date(),
        discountAmount: 0,
        snapshot,
      });
      await em.save(newBooking);

      const primaryParticipant = em.create(BookingParticipant, {
        bookingId: newBooking.id,
        userId: customer.id,
        participantType: BookingParticipantType.BOOKER,
        isPrimaryResponsible: true,
      });
      await em.save(primaryParticipant);

      for (let i = 1; i < body.participants.length; i++) {
        const p = body.participants[i];
        const participant = em.create(BookingParticipant, {
          bookingId: newBooking.id,
          userId: null,
          participantType: p.participant_type,
          isPrimaryResponsible: false,
          guestName: p.guest_name,
          guestPhone: p.guest_phone,
        });
        await em.save(participant);
      }

      const savedVehicles: BookingVehicle[] = [];
      for (const vp of vehiclePricings) {
        const bv = em.create(BookingVehicle, {
          bookingId: newBooking.id,
          vehicleId: vp.vehicleId,
          hourlyRateSnapshot: vp.hourlyRate,
          rentalFeeSnapshot: vp.rentalFee,
          catalogNameSnapshot: vp.catalogName,
          tierSnapshot: vp.tier,
          identifierSnapshot: vp.identifier,
          colorSnapshot: vp.color,
          coverImageUrlSnapshot: vp.coverImageUrl,
          securityDepositSnapshot: 0,
        });
        await em.save(bv);
        savedVehicles.push(bv);
      }

      const compStatus = isBankTransfer
        ? PaymentComponentStatus.PENDING
        : PaymentComponentStatus.DISBURSED;

      const slotFeeComponent = em.create(PaymentComponent, {
        bookingId: newBooking.id,
        bookingVehicleId: null,
        type: PaymentComponentType.SLOT_FEE,
        amount: slotFee,
        status: compStatus,
      });
      await em.save(slotFeeComponent);

      for (const bv of savedVehicles) {
        const rfComponent = em.create(PaymentComponent, {
          bookingId: newBooking.id,
          bookingVehicleId: bv.id,
          type: PaymentComponentType.RENTAL_FEE,
          amount: Number(bv.rentalFeeSnapshot),
          status: compStatus,
        });
        await em.save(rfComponent);
      }

      if (fnbPricings.length > 0) {
        const fnbOrder = em.create(FnbOrder, {
          bookingId: newBooking.id,
          orderType: FnbOrderType.PRE_ORDER,
          totalAmount: fnbTotal,
          status: isBankTransfer ? FnbOrderStatus.PENDING : FnbOrderStatus.CONFIRMED,
        });
        await em.save(fnbOrder);
        for (const item of fnbPricings) {
          const orderItem = em.create(FnbOrderItem, {
            fnbOrderId: fnbOrder.id,
            menuItemId: item.menuItemId,
            variantId: item.menuItemVariantId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            subtotal: item.subtotal,
            notes: item.notes ?? null,
            nameSnapshot: item.itemName,
            variantNameSnapshot: item.variantName,
          });
          await em.save(orderItem);
        }

        const fnbComponent = em.create(PaymentComponent, {
          bookingId: newBooking.id,
          bookingVehicleId: null,
          type: PaymentComponentType.FB_PREORDER,
          amount: fnbTotal,
          status: compStatus,
        });
        await em.save(fnbComponent);
      }

      const transaction = em.create(PaymentTransaction, {
        bookingId: newBooking.id,
        type: PaymentTransactionType.PAYMENT,
        gateway: isBankTransfer ? 'VIETQR' : `COUNTER_${body.payment_method}`,
        txnRef: isBankTransfer
          ? refCode!
          : `WALK_IN_${newBooking.id.substring(0, 8).toUpperCase()}_${Date.now()}`,
        paymentRefCode: isBankTransfer ? refCode : null,
        amount: totalAmount,
        status: isBankTransfer
          ? PaymentTransactionStatus.PENDING
          : PaymentTransactionStatus.SUCCESS,
        rawRequest: { created_by_staff_id: staffId, payment_method: body.payment_method },
        rawResponse: isBankTransfer
          ? {
              bankTransfer,
              requestedAt: new Date().toISOString(),
              requestedByStaffId: staffId,
            }
          : {
              processedAt: new Date().toISOString(),
              processedByStaffId: staffId,
              paymentMethod: body.payment_method,
              status: 'SUCCESS',
              amount: totalAmount,
            },
      });
      await em.save(transaction);

      return newBooking;
    });

    if (body.play_mode === BookingMode.BYOC) {
      await Promise.all(
        lockedByocSlotStarts.map((lockedSlotStart) =>
          releaseByocSlot(cafeId, lockedSlotStart, playerCount, trackConfig.id),
        ),
      );
      lockedByocSlotStarts.length = 0;
    }

    logger.info(
      'BookingService',
      `walk-in booking created bookingId=${booking.id} mode=${body.play_mode} isBankTransfer=${isBankTransfer}`,
    );

    return {
      bookingId: booking.id,
      bookingCode: `RCF-${booking.id.substring(0, 4).toUpperCase()}`,
      status: booking.status,
      source: booking.source,
      paymentStatus: isBankTransfer ? 'PENDING' : 'CAPTURED',
      totalAmount,
      bankTransfer: isBankTransfer ? bankTransfer : undefined,
    };
  } catch (err) {
    // Release locks on transaction failure
    await releaseVehicleSlotLocks(lockedVehicleSlots, bookingId);
    if (body.play_mode === BookingMode.BYOC) {
      await Promise.all(
        lockedByocSlotStarts.map((lockedSlotStart) =>
          releaseByocSlot(cafeId, lockedSlotStart, playerCount, trackConfig.id),
        ),
      );
    }
    throw err;
  }
}

// ── listCafeSessions ──────────────────────────────────────────────────────────

export interface CafeSessionVehicle {
  catalogName: string | null;
  identifier: string | null;
  color: string | null;
  tier: string | null;
  vehicleSource: string;
}

export interface CafeSessionListItem {
  sessionId: string;
  sessionCode: string;
  bookingId: string;
  bookingCode: string;
  vehicles: CafeSessionVehicle[];
  staffName: string;
  customerName: string;
  customerPhone: string | null;
  actualStartAt: Date;
  plannedEndAt: Date;
  actualEndAt: Date | null;
  status: SessionStatus;
  hasIssue: boolean;
}

export async function listCafeSessions(
  cafeId: string,
  query: { date: string; status?: string; page: number; limit: number },
): Promise<{ sessions: CafeSessionListItem[]; total: number; page: number; limit: number }> {
  const dayStart = new Date(`${query.date}T00:00:00+07:00`);
  const dayEnd = new Date(`${query.date}T23:59:59+07:00`);

  let qb = AppDataSource.getRepository(Session)
    .createQueryBuilder('s')
    .innerJoin(Booking, 'b', 's.bookingId = b.id')
    .leftJoin(User, 'u_staff', 's.checkedInBy = u_staff.id')
    .leftJoin(User, 'u_cust', 'b.customerId = u_cust.id')
    .select([
      's.id AS "sessionId"',
      's.bookingId AS "bookingId"',
      's.status AS "status"',
      's.actualStartAt AS "actualStartAt"',
      's.plannedEndAt AS "plannedEndAt"',
      's.actualEndAt AS "actualEndAt"',
      'b.playMode AS "playMode"',
      'u_staff.full_name AS "staffName"',
      'u_cust.full_name AS "customerName"',
      'u_cust.phone AS "customerPhone"',
    ])
    .where('s.cafeId = :cafeId', { cafeId })
    .andWhere('s.actualStartAt >= :dayStart', { dayStart })
    .andWhere('s.actualStartAt <= :dayEnd', { dayEnd });

  if (query.status) {
    qb = qb.andWhere('s.status = :status', { status: query.status });
  }

  qb = qb
    .orderBy('s.actualStartAt', 'DESC')
    .offset((query.page - 1) * query.limit)
    .limit(query.limit);

  const rawSessions = await qb.getRawMany();

  // Đếm tổng số lượng
  let countQb = AppDataSource.getRepository(Session)
    .createQueryBuilder('s')
    .where('s.cafeId = :cafeId', { cafeId })
    .andWhere('s.actualStartAt >= :dayStart', { dayStart })
    .andWhere('s.actualStartAt <= :dayEnd', { dayEnd });
  if (query.status) {
    countQb = countQb.andWhere('s.status = :status', { status: query.status });
  }
  const total = await countQb.getCount();

  const sessions: CafeSessionListItem[] = [];
  for (const raw of rawSessions) {
    const sessionCode = `SS-${raw.sessionId.substring(0, 4).toUpperCase()}`;
    const bookingCode = raw.bookingId.substring(0, 8).toUpperCase();

    // Lấy thông tin xe gán cho phiên chơi
    const sessionVehicles = await AppDataSource.query<
      Array<{
        id: string;
        vehicleSource: string;
        vehicleId: string | null;
        identifier: string | null;
        catalogName: string | null;
        color: string | null;
        tier: string | null;
      }>
    >(
      `SELECT sv.id, sv.vehicle_source AS "vehicleSource", sv.vehicle_id AS "vehicleId", v.identifier AS "identifier", vc.name AS "catalogName", v.color AS "color", vc.tier AS "tier"
       FROM session_vehicles sv
       LEFT JOIN vehicles v ON sv.vehicle_id = v.id
       LEFT JOIN vehicle_catalogs vc ON v.catalog_id = vc.id
       WHERE sv.session_id = $1`,
      [raw.sessionId],
    );

    const vehicles: CafeSessionVehicle[] = sessionVehicles.map((sv) => ({
      catalogName: sv.catalogName,
      identifier: sv.identifier,
      color: sv.color,
      tier: sv.tier,
      vehicleSource: sv.vehicleSource,
    }));

    // Kiểm tra xem có biên bản checkout ghi nhận hư hỏng không
    const hasIssue = await AppDataSource.getRepository(Inspection).exists({
      where: {
        sessionId: raw.sessionId,
        type: InspectionType.CHECK_OUT,
        damageNoted: true,
      },
    });

    sessions.push({
      sessionId: raw.sessionId,
      sessionCode,
      bookingId: raw.bookingId,
      bookingCode,
      vehicles,
      staffName: raw.staffName || 'Hệ thống',
      customerName: raw.customerName || 'Khách vãng lai',
      customerPhone: raw.customerPhone || null,
      actualStartAt: raw.actualStartAt,
      plannedEndAt: raw.plannedEndAt,
      actualEndAt: raw.actualEndAt,
      status: raw.status as SessionStatus,
      hasIssue,
    });
  }

  return { sessions, total, page: query.page, limit: query.limit };
}

// ── listCafeSessionStats ──────────────────────────────────────────────────────

export async function listCafeSessionStats(
  cafeId: string,
  dateStr: string,
): Promise<{ active: number; extending: number; checkingOut: number; issue: number }> {
  const dayStart = new Date(`${dateStr}T00:00:00+07:00`);
  const dayEnd = new Date(`${dateStr}T23:59:59+07:00`);

  const active = await AppDataSource.getRepository(Session)
    .createQueryBuilder('s')
    .where('s.cafeId = :cafeId', { cafeId })
    .andWhere('s.actualStartAt >= :dayStart', { dayStart })
    .andWhere('s.actualStartAt <= :dayEnd', { dayEnd })
    .andWhere('s.status = :status', { status: SessionStatus.ACTIVE })
    .getCount();

  const extending = await AppDataSource.getRepository(Session)
    .createQueryBuilder('s')
    .where('s.cafeId = :cafeId', { cafeId })
    .andWhere('s.actualStartAt >= :dayStart', { dayStart })
    .andWhere('s.actualStartAt <= :dayEnd', { dayEnd })
    .andWhere('s.status = :status', { status: SessionStatus.EXTENDING })
    .getCount();

  const checkingOut = await AppDataSource.getRepository(Session)
    .createQueryBuilder('s')
    .where('s.cafeId = :cafeId', { cafeId })
    .andWhere('s.actualStartAt >= :dayStart', { dayStart })
    .andWhere('s.actualStartAt <= :dayEnd', { dayEnd })
    .andWhere('s.status = :status', { status: SessionStatus.CHECKING_OUT })
    .getCount();

  // Đếm sự cố (sessions trong ngày có CHECK_OUT inspection damageNoted = true)
  const issue = await AppDataSource.getRepository(Session)
    .createQueryBuilder('s')
    .innerJoin(Inspection, 'i', 'i.sessionId = s.id')
    .where('s.cafeId = :cafeId', { cafeId })
    .andWhere('s.actualStartAt >= :dayStart', { dayStart })
    .andWhere('s.actualStartAt <= :dayEnd', { dayEnd })
    .andWhere('i.type = :type', { type: 'CHECK_OUT' })
    .andWhere('i.damageNoted = :damageNoted', { damageNoted: true })
    .getCount();

  return { active, extending, checkingOut, issue };
}
