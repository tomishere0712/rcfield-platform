import { EntityManager } from 'typeorm';
import { AppDataSource } from '../config/database';
import { logger } from '../config/logger';
import { redis } from '../config/redis';
import { env } from '../config/env';
import { Booking } from '../models/booking.entity';
import { Cafe } from '../models/cafe.entity';
import { CafeTrackConfig } from '../models/cafe-track-config.entity';
import { Contest } from '../models/contest.entity';
import { ContestAuditLog } from '../models/contest-audit-log.entity';
import { ContestRegistration } from '../models/contest-registration.entity';
import { VehicleCatalog } from '../models/vehicle-catalog.entity';
import { Vehicle } from '../models/vehicle.entity';
import { BookingParticipant } from '../models/booking-participant.entity';
import { BookingVehicle } from '../models/booking-vehicle.entity';
import { Session } from '../models/session.entity';
import { SessionParticipant } from '../models/session-participant.entity';
import { SessionVehicle } from '../models/session-vehicle.entity';
import { User } from '../models/user.entity';
import {
  AppError,
  BookingMode,
  BookingParticipantType,
  BookingSource,
  BookingStatus,
  ParticipantRole,
  SessionStatus,
  SessionVehicleStatus,
  VehicleSource,
  ContestRegistrationStatus,
  ContestStatus,
  ContestEntryFeePaymentStatus,
  VehicleStatus,
} from '../types';
import { createBooking, CreateBookingBody } from './booking.service';
import { getActiveContestBan } from './contest.helpers';
import { ContestCafe } from '../models/contest-cafe.entity';

// ── Contest rental pricing policy (bridge Contest ↔ Booking) ────────────────

export type ContestDepositMode = 'FULL' | 'REDUCED' | 'WAIVED';

export interface ContestRentalPolicy {
  waive_slot_fee: boolean;
  deposit_mode: ContestDepositMode;
  /** Percent of the original deposit charged when deposit_mode = REDUCED (0-100). */
  deposit_percent: number;
  /** Slot must start no earlier than startsAt - before_min and end no later than endsAt + after_min. */
  slot_window: { before_min: number; after_min: number };
}

export const DEFAULT_CONTEST_RENTAL_POLICY: ContestRentalPolicy = {
  waive_slot_fee: false,
  deposit_mode: 'FULL',
  deposit_percent: 50,
  slot_window: { before_min: 60, after_min: 60 },
};

export interface ContestPricingAdjustments {
  waiveSlotFee: boolean;
  /** Multiply each vehicle's security_deposit snapshot by this (0 = waived). */
  depositMultiplier: number;
}

const DEPOSIT_MODES: readonly ContestDepositMode[] = ['FULL', 'REDUCED', 'WAIVED'];

function getSlotStarts(slotStart: Date, slotEnd: Date, slotDurationMinutes: number): Date[] {
  const slotStarts: Date[] = [];
  const slotDurationMs = slotDurationMinutes * 60 * 1000;
  for (let cursor = slotStart.getTime(); cursor < slotEnd.getTime(); cursor += slotDurationMs) {
    slotStarts.push(new Date(cursor));
  }
  return slotStarts;
}

function contestRentalVehicleLockKey(vehicleId: string, slotStart: Date): string {
  return `contest:rental:vehicle:${vehicleId}:${slotStart.getTime()}`;
}

async function acquireContestRentalVehicleLock(
  vehicleId: string,
  slotStart: Date,
  ttlSeconds = env.platform.slotLockTtlSeconds,
): Promise<boolean> {
  const key = contestRentalVehicleLockKey(vehicleId, slotStart);
  const result = await redis.set(key, '1', 'EX', ttlSeconds, 'NX');
  return result === 'OK';
}

async function releaseContestRentalVehicleLocks(
  vehicleId: string,
  slotStarts: Date[],
): Promise<void> {
  const keys = slotStarts.map((s) => contestRentalVehicleLockKey(vehicleId, s));
  if (keys.length > 0) {
    await redis.del(keys);
  }
}

function toNonNegativeInt(value: unknown, fallback: number): number {
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? Math.floor(num) : fallback;
}

/** Reads contest.config.rental_policy with safe defaults; bad values fall back per-field. */
export function getContestRentalPolicy(
  contest: Pick<Contest, 'config'> | null | undefined,
): ContestRentalPolicy {
  const raw = (contest?.config ?? {}) as Record<string, unknown>;
  const policy = (raw.rental_policy ?? {}) as Record<string, unknown>;
  const rawWindow = (policy.slot_window ?? {}) as Record<string, unknown>;

  const rawMode = String(policy.deposit_mode ?? '').toUpperCase();
  const depositMode = (DEPOSIT_MODES as readonly string[]).includes(rawMode)
    ? (rawMode as ContestDepositMode)
    : DEFAULT_CONTEST_RENTAL_POLICY.deposit_mode;

  const rawPercent = Number(policy.deposit_percent);
  const depositPercent =
    Number.isFinite(rawPercent) && rawPercent >= 0 && rawPercent <= 100
      ? rawPercent
      : DEFAULT_CONTEST_RENTAL_POLICY.deposit_percent;

  return {
    waive_slot_fee: policy.waive_slot_fee === true,
    deposit_mode: depositMode,
    deposit_percent: depositPercent,
    slot_window: {
      before_min: toNonNegativeInt(
        rawWindow.before_min,
        DEFAULT_CONTEST_RENTAL_POLICY.slot_window.before_min,
      ),
      after_min: toNonNegativeInt(
        rawWindow.after_min,
        DEFAULT_CONTEST_RENTAL_POLICY.slot_window.after_min,
      ),
    },
  };
}

/** Maps a parsed policy to the pricing knobs the payment flow consumes. */
export function applyContestRentalPricing(
  booking: { contestId?: string | null; source?: BookingSource | string | null },
  policy: ContestRentalPolicy,
): ContestPricingAdjustments {
  const isContestBooking = booking.contestId != null || booking.source === BookingSource.CONTEST;
  if (!isContestBooking) {
    return { waiveSlotFee: false, depositMultiplier: 1 };
  }
  return {
    waiveSlotFee: policy.waive_slot_fee,
    depositMultiplier:
      policy.deposit_mode === 'WAIVED'
        ? 0
        : policy.deposit_mode === 'REDUCED'
          ? policy.deposit_percent / 100
          : 1,
  };
}

export type ContestRentalSlotInput = {
  cafe_id: string;
  slot_start: string | Date;
  slot_end: string | Date;
  track_config_id?: string | null;
  vehicle_catalog_id?: string | null;
};

export type CreateContestRentalBookingResult = {
  booking_id: string;
  vehicle_id: string;
  status: BookingStatus;
  payment_expires_at: Date;
  total_amount: number;
  breakdown: {
    slot_fee: number;
    rental_fee: number;
    total: number;
  };
};

export type ContestRentalOptions = {
  cafes: Array<{
    id: string;
    name: string;
    city: string | null;
    district: string | null;
  }>;
  track_configs: Array<{
    id: string;
    cafe_id: string;
    track_type_id: string;
    track_type_name: string | null;
    max_concurrent: number;
  }>;
  vehicle_catalogs: Array<{
    id: string;
    cafe_id: string;
    name: string;
    tier: string;
    hourly_rate: number;
    cover_image_url: string | null;
    compatible_track_types: string[];
  }>;
};

/**
 * WF-A entry point for POST /bookings/contest-rental: validates that the contest
 * exists and is open for registration (same rule as createContestRegistration),
 * then delegates to createContestRentalBooking. Does NOT create a registration —
 * signing up for the contest is a separate step that links booking_id afterwards.
 */
export async function bookContestRental(
  contestId: string,
  customerId: string,
  slot: ContestRentalSlotInput,
): Promise<CreateContestRentalBookingResult & { contest_id: string }> {
  const contest = await AppDataSource.getRepository(Contest).findOne({
    where: { id: contestId },
  });
  if (!contest) {
    throw new AppError('Contest không tồn tại', 404, 'CONTEST_NOT_FOUND');
  }
  if (contest.status !== ContestStatus.OPEN) {
    throw new AppError('Contest chưa mở đăng ký', 400, 'CONTEST_NOT_OPEN');
  }

  const result = await createContestRentalBooking(contest, customerId, slot);
  return { ...result, contest_id: contest.id };
}

export async function createContestRentalBooking(
  contest: Contest,
  customerId: string,
  slot: ContestRentalSlotInput,
): Promise<CreateContestRentalBookingResult> {
  const contestCafe = await AppDataSource.getRepository(ContestCafe).findOne({
    where: { contestId: contest.id, cafeId: slot.cafe_id },
  });
  if (!contestCafe) {
    throw new AppError('Chi nhánh không tham gia contest', 400, 'CONTEST_CAFE_INVALID');
  }

  const cafe = await AppDataSource.getRepository(Cafe).findOne({
    where: { id: slot.cafe_id },
  });
  if (!cafe) {
    throw new AppError('Cafe không tồn tại', 404, 'CAFE_NOT_FOUND');
  }

  let trackConfigId: string | undefined;
  let trackTypeId: string | undefined;
  if (slot.track_config_id) {
    const trackConfig = await AppDataSource.getRepository(CafeTrackConfig).findOne({
      where: { id: slot.track_config_id, cafeId: slot.cafe_id, isActive: true },
    });
    if (!trackConfig) {
      throw new AppError(
        'Track config không tồn tại hoặc không hoạt động',
        400,
        'TRACK_CONFIG_NOT_FOUND',
      );
    }
    trackConfigId = trackConfig.id;
    trackTypeId = trackConfig.trackTypeId;
  }

  // Validate track type matches contest if track config is provided.
  if (contest.trackTypeId && trackTypeId && trackTypeId !== contest.trackTypeId) {
    throw new AppError(
      'Track config không khớp loại đường đua của contest',
      400,
      'TRACK_TYPE_MISMATCH',
    );
  }

  const vehicle = await resolveContestRentalVehicle(slot, contest.trackTypeId);

  // Slot must fit inside the contest window widened by the rental policy's slot_window.
  const policy = getContestRentalPolicy(contest);
  const slotStart = new Date(slot.slot_start);
  const slotEnd = new Date(slot.slot_end);
  const windowStart = new Date(contest.startsAt.getTime() - policy.slot_window.before_min * 60_000);
  const windowEnd = new Date(contest.endsAt.getTime() + policy.slot_window.after_min * 60_000);
  if (slotStart < windowStart || slotEnd > windowEnd) {
    throw new AppError(
      'Khung giờ slot nằm ngoài cửa sổ cho phép của contest',
      400,
      'CONTEST_SLOT_OUTSIDE_WINDOW',
    );
  }

  // Prevent booking a rental slot that spans far longer than the actual race window.
  // The slot should be for contest use, not a disguised all-day rental.
  const raceDurationMs = contest.endsAt.getTime() - contest.startsAt.getTime();
  const maxSlotDurationMs =
    raceDurationMs + (policy.slot_window.before_min + policy.slot_window.after_min) * 60_000;
  if (slotEnd.getTime() - slotStart.getTime() > maxSlotDurationMs) {
    throw new AppError(
      'Khung giờ thuê xe quá dài so với thời gian thi đấu',
      400,
      'CONTEST_SLOT_TOO_LONG',
    );
  }

  // Hold a short-lived lock on the chosen vehicle so concurrent contest-rental
  // requests do not pick the same unit before createBooking acquires the slot locks.
  const slotDurationMinutes =
    Number.isInteger(cafe.slotDurationMinutes) && cafe.slotDurationMinutes > 0
      ? cafe.slotDurationMinutes
      : Math.max(1, Math.ceil((slotEnd.getTime() - slotStart.getTime()) / 60000));
  const rentalSlotStarts = getSlotStarts(slotStart, slotEnd, slotDurationMinutes);
  const lockedRentalSlotStarts: Date[] = [];
  for (const rentalSlotStart of rentalSlotStarts) {
    const locked = await acquireContestRentalVehicleLock(vehicle.id, rentalSlotStart);
    if (!locked) {
      await releaseContestRentalVehicleLocks(vehicle.id, lockedRentalSlotStarts);
      throw new AppError(
        'Xe vừa được chọn bởi người khác, vui lòng chọn xe khác',
        409,
        'VEHICLE_UNAVAILABLE',
      );
    }
    lockedRentalSlotStarts.push(rentalSlotStart);
  }

  const bookingBody: CreateBookingBody = {
    cafe_id: slot.cafe_id,
    play_mode: BookingMode.RENTAL,
    slot_start:
      typeof slot.slot_start === 'string' ? slot.slot_start : slot.slot_start.toISOString(),
    slot_end: typeof slot.slot_end === 'string' ? slot.slot_end : slot.slot_end.toISOString(),
    vehicle_ids: [vehicle.id],
    participants: [],
    fnb_items: [],
    track_config_id: trackConfigId,
    track_type_id: trackTypeId ?? contest.trackTypeId ?? undefined,
    contest_id: contest.id,
    source: BookingSource.CONTEST,
    skipPendingReuse: true,
  };

  try {
    const bookingResult = await createBooking(customerId, bookingBody);

    return {
      booking_id: bookingResult.booking_id,
      vehicle_id: vehicle.id,
      status: bookingResult.status,
      payment_expires_at: bookingResult.payment_expires_at,
      total_amount: bookingResult.total_amount,
      breakdown: {
        slot_fee: bookingResult.breakdown.slot_fee,
        rental_fee: bookingResult.breakdown.rental_fee,
        total: bookingResult.breakdown.total,
      },
    };
  } finally {
    await releaseContestRentalVehicleLocks(vehicle.id, lockedRentalSlotStarts);
  }
}

async function resolveContestRentalVehicle(
  slot: ContestRentalSlotInput,
  contestTrackTypeId?: string | null,
): Promise<Vehicle> {
  const vehicleRepo = AppDataSource.getRepository(Vehicle);
  const catalogRepo = AppDataSource.getRepository(VehicleCatalog);

  let catalog: VehicleCatalog | null = null;
  if (slot.vehicle_catalog_id) {
    catalog = await catalogRepo.findOne({
      where: { id: slot.vehicle_catalog_id, cafeId: slot.cafe_id },
    });
    if (!catalog) {
      throw new AppError('Catalog xe không tồn tại', 404, 'VEHICLE_CATALOG_NOT_FOUND');
    }
  }

  if (catalog && contestTrackTypeId && catalog.compatibleTrackTypes.length > 0) {
    if (!catalog.compatibleTrackTypes.includes(contestTrackTypeId)) {
      throw new AppError(
        'Xe không tương thích với loại đường đua của contest',
        400,
        'VEHICLE_TRACK_INCOMPATIBLE',
      );
    }
  }

  if (catalog) {
    const vehicle = await vehicleRepo.findOne({
      where: {
        catalogId: catalog.id,
        cafeId: slot.cafe_id,
        status: VehicleStatus.AVAILABLE,
      },
    });
    if (!vehicle) {
      throw new AppError('Không có xe khả dụng cho catalog này', 400, 'VEHICLE_UNAVAILABLE');
    }
    return vehicle;
  }

  // If no catalog specified, pick any available vehicle at the cafe.
  const vehicle = await vehicleRepo.findOne({
    where: { cafeId: slot.cafe_id, status: VehicleStatus.AVAILABLE },
  });
  if (!vehicle) {
    throw new AppError('Không có xe thuê khả dụng tại chi nhánh này', 400, 'VEHICLE_UNAVAILABLE');
  }
  return vehicle;
}

// ── Chọn dòng xe lúc đăng ký (không còn chọn khung giờ, không còn tính tiền) ─

export type ContestRentalChoice = {
  cafe_id: string;
  vehicle_catalog_id: string;
};

/**
 * Xác thực dòng xe VĐV chọn khi đăng ký thuê xe của quán.
 *
 * Khách chọn DÒNG xe (loại/màu), không chọn chiếc cụ thể và không chọn khung
 * giờ: khung giờ do lịch thi đấu quyết định, còn chiếc xe cụ thể do nhân viên
 * gán lúc giao xe. Trả về số xe có thật của dòng đó để bên gọi kiểm tra suất.
 */
export async function resolveContestRentalChoice(
  contest: Contest,
  choice: ContestRentalChoice,
): Promise<{ catalog: VehicleCatalog; unitCount: number }> {
  const contestCafe = await AppDataSource.getRepository(ContestCafe).findOne({
    where: { contestId: contest.id, cafeId: choice.cafe_id },
  });
  if (!contestCafe) {
    throw new AppError('Chi nhánh không tham gia giải đấu này', 400, 'CONTEST_CAFE_INVALID');
  }

  const catalog = await AppDataSource.getRepository(VehicleCatalog).findOne({
    where: { id: choice.vehicle_catalog_id, cafeId: choice.cafe_id },
  });
  if (!catalog) {
    throw new AppError('Dòng xe không tồn tại ở chi nhánh này', 404, 'VEHICLE_CATALOG_NOT_FOUND');
  }

  if (
    contest.trackTypeId &&
    catalog.compatibleTrackTypes.length > 0 &&
    !catalog.compatibleTrackTypes.includes(contest.trackTypeId)
  ) {
    throw new AppError(
      'Dòng xe này không chạy được trên loại đường đua của giải',
      400,
      'VEHICLE_TRACK_INCOMPATIBLE',
    );
  }

  const unitCount = await AppDataSource.getRepository(Vehicle).count({
    where: {
      catalogId: catalog.id,
      cafeId: choice.cafe_id,
      status: VehicleStatus.AVAILABLE,
    },
  });
  if (unitCount === 0) {
    throw new AppError('Dòng xe này hiện không có xe khả dụng', 400, 'VEHICLE_UNAVAILABLE');
  }

  return { catalog, unitCount };
}

/**
 * Giữ chỗ dòng xe theo số xe có thật.
 *
 * Quán có 3 chiếc thuộc dòng nào thì chỉ 3 VĐV đăng ký được dòng đó. Phải gọi
 * bên trong transaction đã khoá registrations của giải, nếu không hai người đăng
 * ký đồng thời cùng đọc ra số cũ và cùng lọt qua.
 */
export async function assertContestRentalCatalogHasSlot(
  manager: EntityManager,
  params: {
    contestId: string;
    catalogId: string;
    unitCount: number;
    excludeRegistrationId?: string | null;
  },
): Promise<void> {
  const rows = await manager.query<{ id: string }[]>(
    `SELECT id
       FROM contest_registrations
      WHERE contest_id = $1
        AND rental_catalog_id = $2
        AND status != $3
        AND ($4::uuid IS NULL OR id != $4::uuid)`,
    [
      params.contestId,
      params.catalogId,
      ContestRegistrationStatus.CANCELLED,
      params.excludeRegistrationId ?? null,
    ],
  );

  if (rows.length >= params.unitCount) {
    throw new AppError(
      `Dòng xe này đã hết suất (quán chỉ có ${params.unitCount} xe)`,
      409,
      'CONTEST_RENTAL_CATALOG_FULL',
    );
  }
}

/**
 * Khung giờ của phiếu mượn xe, suy ra từ lịch thi đấu chứ không do khách chọn.
 *
 * Bo tròn lên theo lưới slot của quán vì `createBooking` bắt độ dài booking phải
 * chia hết cho `slot_duration_minutes`; giải 9:00-13:30 với lưới 60 phút sẽ thành
 * 9:00-14:00. Phiếu là 0đ nên kéo dài thêm không phát sinh chi phí nào.
 */
export function resolveContestRentalWindow(
  contest: Pick<Contest, 'startsAt' | 'endsAt' | 'config'>,
  slotDurationMinutes: number,
): { slotStart: Date; slotEnd: Date } {
  const policy = getContestRentalPolicy(contest as Pick<Contest, 'config'>);
  const slotStart = new Date(contest.startsAt.getTime() - policy.slot_window.before_min * 60_000);
  const rawEnd = new Date(contest.endsAt.getTime() + policy.slot_window.after_min * 60_000);

  const duration = Math.max(1, slotDurationMinutes);
  const rawMinutes = Math.max(duration, (rawEnd.getTime() - slotStart.getTime()) / 60_000);
  const alignedMinutes = Math.ceil(rawMinutes / duration) * duration;

  return {
    slotStart,
    slotEnd: new Date(slotStart.getTime() + alignedMinutes * 60_000),
  };
}

// ── Contest ↔ Session lifecycle sync (vehicle check-in / checkout bridge) ───

export interface ContestCheckinSyncResult {
  registrationId: string | null;
  synced: boolean;
  previousStatus: ContestRegistrationStatus | null;
}

function contestRegistrationRepo(em?: EntityManager) {
  return em
    ? em.getRepository(ContestRegistration)
    : AppDataSource.getRepository(ContestRegistration);
}

function contestAuditLogRepo(em?: EntityManager) {
  return em ? em.getRepository(ContestAuditLog) : AppDataSource.getRepository(ContestAuditLog);
}

/**
 * When a contest rental booking is checked in at the cafe, mirror the linked
 * contest registration to CHECKED_IN (same semantics as checkInRegistration in
 * contest.service). Never blocks the vehicle check-in: missing registrations or
 * unexpected statuses are skipped with a log entry only.
 */
export async function syncContestRegistrationOnVehicleCheckIn(
  booking: Pick<Booking, 'id' | 'contestId' | 'cafeId'>,
  staffContext: { staffUserId: string },
  em?: EntityManager,
): Promise<ContestCheckinSyncResult | null> {
  if (!booking.contestId) return null;

  const registration = await contestRegistrationRepo(em).findOne({
    where: { bookingId: booking.id },
  });
  if (!registration) {
    logger.warn('ContestRental', 'syncContestRegistrationOnVehicleCheckIn: no registration', {
      bookingId: booking.id,
      contestId: booking.contestId,
    });
    return { registrationId: null, synced: false, previousStatus: null };
  }

  const previousStatus = registration.status;
  if (previousStatus === ContestRegistrationStatus.CHECKED_IN) {
    return { registrationId: registration.id, synced: false, previousStatus };
  }
  if (previousStatus !== ContestRegistrationStatus.CONFIRMED) {
    logger.warn('ContestRental', 'syncContestRegistrationOnVehicleCheckIn: status not CONFIRMED', {
      bookingId: booking.id,
      registrationId: registration.id,
      status: previousStatus,
    });
    return { registrationId: registration.id, synced: false, previousStatus };
  }

  // Mirror the checkInRegistration guards (contest/registrations.ts): only sync
  // when the contest is check-in ready and the entry fee is settled. Failures
  // skip the mirror without blocking the vehicle check-in.
  const guardFail = (reason: string): ContestCheckinSyncResult => {
    logger.warn('ContestRental', 'syncContestRegistrationOnVehicleCheckIn: guard failed', {
      bookingId: booking.id,
      registrationId: registration.id,
      reason,
    });
    return { registrationId: registration.id, synced: false, previousStatus };
  };

  const contest = await AppDataSource.getRepository(Contest).findOne({
    where: { id: booking.contestId },
  });
  if (!contest) {
    return guardFail('contest_not_found');
  }
  if (![ContestStatus.CLOSED, ContestStatus.RUNNING].includes(contest.status)) {
    return guardFail('contest_not_checkin_ready');
  }
  const now = new Date();
  if (contest.startsAt && now < contest.startsAt) {
    return guardFail('contest_checkin_not_started');
  }
  if (contest.endsAt && now > contest.endsAt) {
    return guardFail('contest_checkin_ended');
  }
  if (
    Number(contest.entryFee ?? 0) > 0 &&
    ![
      ContestEntryFeePaymentStatus.MARKED_PAID,
      ContestEntryFeePaymentStatus.WAIVED,
      ContestEntryFeePaymentStatus.PENDING_REVIEW,
    ].includes(registration.paymentStatus)
  ) {
    return guardFail('entry_fee_pending');
  }
  if (contest.providerId) {
    const activeBan = await getActiveContestBan(
      registration.userId,
      contest.providerId,
      contest.id,
    );
    if (activeBan) {
      return guardFail('participant_banned');
    }
  }

  // Atomic CONFIRMED → CHECKED_IN transition: if a concurrent check-in (e.g.
  // staff check-in via contest service) already moved the row, 0 rows are
  // affected and we skip with a warn instead of overwriting.
  const updateResult = await contestRegistrationRepo(em).update(
    { id: registration.id, status: ContestRegistrationStatus.CONFIRMED },
    {
      status: ContestRegistrationStatus.CHECKED_IN,
      checkedInCafeId: booking.cafeId,
      checkedInBy: staffContext.staffUserId,
      checkedInAt: () => 'NOW()',
    },
  );
  if (!updateResult.affected) {
    logger.warn('ContestRental', 'syncContestRegistrationOnVehicleCheckIn: concurrent check-in', {
      bookingId: booking.id,
      registrationId: registration.id,
      status: previousStatus,
    });
    return { registrationId: registration.id, synced: false, previousStatus };
  }

  const auditRepo = contestAuditLogRepo(em);
  await auditRepo.save(
    auditRepo.create({
      contestId: booking.contestId,
      registrationId: registration.id,
      actorId: staffContext.staffUserId,
      actorRole: 'STAFF',
      eventType: 'registration.checked_in',
      beforeJson: { status: previousStatus },
      afterJson: { status: ContestRegistrationStatus.CHECKED_IN, checkedInCafeId: booking.cafeId },
      metadata: { booking_id: booking.id, trigger: 'vehicle_check_in' },
    }),
  );

  return { registrationId: registration.id, synced: true, previousStatus };
}

/** Writes a contest audit log entry when a contest rental vehicle is checked out. */
export async function logContestVehicleCheckedOut(
  booking: Pick<Booking, 'id' | 'contestId'>,
  session: { id: string },
  em?: EntityManager,
): Promise<void> {
  if (!booking.contestId) return;

  const registration = await contestRegistrationRepo(em).findOne({
    where: { bookingId: booking.id },
  });

  const auditRepo = contestAuditLogRepo(em);
  await auditRepo.save(
    auditRepo.create({
      contestId: booking.contestId,
      registrationId: registration?.id ?? null,
      actorRole: 'STAFF',
      eventType: 'booking.vehicle_checked_out',
      metadata: {
        booking_id: booking.id,
        session_id: session.id,
        registration_id: registration?.id ?? null,
      },
    }),
  );
}

export async function getContestRentalOptions(contestId: string): Promise<ContestRentalOptions> {
  const contestCafes = await AppDataSource.getRepository(ContestCafe).find({
    where: { contestId },
    order: { displayOrder: 'ASC' },
  });
  const cafeIds = contestCafes.map((item) => item.cafeId);

  const cafes = await AppDataSource.getRepository(Cafe).find({
    where: cafeIds.map((id) => ({ id })),
  });

  const trackConfigs = await AppDataSource.getRepository(CafeTrackConfig).find({
    where: cafeIds.map((id) => ({ cafeId: id, isActive: true })),
  });

  const catalogs = await AppDataSource.getRepository(VehicleCatalog).find({
    where: cafeIds.map((id) => ({ cafeId: id })),
  });

  const trackConfigRows = trackConfigs.map((item) => ({
    id: item.id,
    cafe_id: item.cafeId,
    track_type_id: item.trackTypeId,
    track_type_name: null, // populated by caller if needed
    max_concurrent: item.maxConcurrent,
  }));

  return {
    cafes: cafes.map((item) => ({
      id: item.id,
      name: item.name,
      city: item.city ?? null,
      district: item.district ?? null,
    })),
    track_configs: trackConfigRows,
    vehicle_catalogs: catalogs.map((item) => ({
      id: item.id,
      cafe_id: item.cafeId,
      name: item.name,
      tier: item.tier,
      hourly_rate: Number(item.hourlyRate),
      cover_image_url: item.coverImageUrl ?? null,
      compatible_track_types: item.compatibleTrackTypes,
    })),
  };
}

/**
 * Danh sách dòng xe VĐV chọn được khi đăng ký thuê xe của giải.
 *
 * Trả về số suất còn lại của từng dòng chứ không liệt kê từng chiếc: khách chọn
 * DÒNG xe, chiếc cụ thể do nhân viên gán lúc giao xe. Cũng không còn `hourly_rate`
 * vì thuê xe trong giải là miễn phí — lệ phí giải là khoản duy nhất.
 */
export async function getContestAvailableRentalVehicles(
  contestId: string,
  cafeId: string,
): Promise<
  Array<{
    catalog_id: string;
    catalog_name: string;
    tier: string;
    cover_image_url: string | null;
    total_units: number;
    remaining_slots: number;
  }>
> {
  const contest = await AppDataSource.getRepository(Contest).findOne({ where: { id: contestId } });
  if (!contest) {
    throw new AppError('Contest không tồn tại', 404, 'CONTEST_NOT_FOUND');
  }

  const contestCafe = await AppDataSource.getRepository(ContestCafe).findOne({
    where: { contestId, cafeId },
  });
  if (!contestCafe) {
    throw new AppError('Chi nhánh không tham gia contest', 400, 'CONTEST_CAFE_INVALID');
  }

  const catalogs = await AppDataSource.getRepository(VehicleCatalog).find({ where: { cafeId } });
  const vehicles = await AppDataSource.getRepository(Vehicle).find({
    where: { cafeId, status: VehicleStatus.AVAILABLE },
  });

  const claimedRows = await AppDataSource.query<{ rental_catalog_id: string; taken: string }[]>(
    `SELECT rental_catalog_id, COUNT(*)::text AS taken
       FROM contest_registrations
      WHERE contest_id = $1
        AND rental_catalog_id IS NOT NULL
        AND status != $2
      GROUP BY rental_catalog_id`,
    [contestId, ContestRegistrationStatus.CANCELLED],
  );
  const claimedByCatalog = new Map(
    claimedRows.map((row) => [row.rental_catalog_id, Number(row.taken)]),
  );

  return catalogs
    .filter(
      (catalog) =>
        !contest.trackTypeId ||
        catalog.compatibleTrackTypes.length === 0 ||
        catalog.compatibleTrackTypes.includes(contest.trackTypeId),
    )
    .map((catalog) => {
      const totalUnits = vehicles.filter((vehicle) => vehicle.catalogId === catalog.id).length;
      const claimed = claimedByCatalog.get(catalog.id) ?? 0;
      return {
        catalog_id: catalog.id,
        catalog_name: catalog.name,
        tier: catalog.tier,
        cover_image_url: catalog.coverImageUrl ?? null,
        total_units: totalUnits,
        remaining_slots: Math.max(0, totalUnits - claimed),
      };
    });
}

// ── Phiếu mượn xe ngày thi đấu ──────────────────────────────────────────────

/**
 * Khung giờ của phiếu mượn xe: đúng bằng khung giờ thi đấu.
 *
 * Bo tròn lên theo lưới slot của quán vì các bảng phía sau vẫn tính theo slot;
 * giải 09:00-13:30 với lưới 60 phút thành 09:00-14:00. Phiếu là 0đ nên kéo dài
 * thêm không phát sinh chi phí nào.
 */
export function resolveContestHandoverWindow(
  contest: Pick<Contest, 'startsAt' | 'endsAt'>,
  slotDurationMinutes: number,
): { slotStart: Date; slotEnd: Date; slotCount: number } {
  const duration = Math.max(1, slotDurationMinutes);
  const rawMinutes = Math.max(
    duration,
    (contest.endsAt.getTime() - contest.startsAt.getTime()) / 60_000,
  );
  const slotCount = Math.ceil(rawMinutes / duration);

  return {
    slotStart: contest.startsAt,
    slotEnd: new Date(contest.startsAt.getTime() + slotCount * duration * 60_000),
    slotCount,
  };
}

/** Xe còn rảnh thuộc đúng dòng VĐV đã đặt, để nhân viên chọn lúc giao xe. */
export async function listContestHandoverUnits(
  registration: ContestRegistration,
): Promise<Array<{ id: string; identifier: string | null; color: string | null }>> {
  if (registration.vehicleSource !== VehicleSource.RENTAL) return [];
  if (!registration.rentalCatalogId || !registration.rentalCafeId) return [];

  const units = await AppDataSource.getRepository(Vehicle).find({
    where: {
      catalogId: registration.rentalCatalogId,
      cafeId: registration.rentalCafeId,
      status: VehicleStatus.AVAILABLE,
    },
    order: { identifier: 'ASC' },
  });

  // Xe đã giao cho VĐV khác trong cùng giải thì không hiện nữa.
  const takenRows = await AppDataSource.query<{ vehicle_id: string }[]>(
    `SELECT bv.vehicle_id
       FROM booking_vehicles bv
       JOIN bookings b ON b.id = bv.booking_id
      WHERE b.contest_id = $1
        AND b.status != $2`,
    [registration.contestId, BookingStatus.CANCELLED],
  );
  const taken = new Set(takenRows.map((row) => row.vehicle_id));

  return units
    .filter((unit) => !taken.has(unit.id))
    .map((unit) => ({ id: unit.id, identifier: unit.identifier, color: unit.color }));
}

/**
 * Dựng phiếu mượn xe 0đ và mở phiên chơi cho VĐV thuê xe, ngay lúc nhân viên
 * giao xe tại quầy.
 *
 * KHÔNG dùng `createBooking`/`startCheckIn` của luồng đặt sân thường: những hàm
 * đó áp các luật sinh ra cho khách lẻ — báo trước bao lâu, tối đa mấy slot, và
 * nhất là "quá 30 phút kể từ giờ bắt đầu là hết hạn check-in". Giải chạy cả buổi
 * mà VĐV tới muộn 40 phút thì luật đó chặn không cho nhận xe.
 *
 * Phiếu này không phải giao dịch thương mại: không giá, không thanh toán, không
 * giữ chỗ (giải đã khoá sân từ trước). Nó tồn tại để chạy tiếp inspection và cơ
 * chế tính hư hỏng, nên vẫn dựng đủ `booking_vehicles` + `session_vehicles`.
 */
export async function createContestVehicleHandover(params: {
  contest: Contest;
  registration: ContestRegistration;
  vehicleId: string;
  staffUserId: string;
}): Promise<{ bookingId: string; sessionId: string; vehicleId: string }> {
  const { contest, registration, vehicleId, staffUserId } = params;

  if (!registration.rentalCafeId || !registration.rentalCatalogId) {
    throw new AppError(
      'Đăng ký này không có dòng xe đã đặt để giao',
      400,
      'CONTEST_RENTAL_CHOICE_MISSING',
    );
  }

  const vehicle = await AppDataSource.getRepository(Vehicle).findOne({
    where: { id: vehicleId, cafeId: registration.rentalCafeId },
  });
  if (!vehicle) {
    throw new AppError('Xe không tồn tại ở chi nhánh này', 404, 'VEHICLE_NOT_FOUND');
  }
  if (vehicle.catalogId !== registration.rentalCatalogId) {
    throw new AppError(
      'Xe không thuộc dòng xe VĐV đã đặt',
      400,
      'CONTEST_HANDOVER_VEHICLE_MISMATCH',
    );
  }
  if (vehicle.status !== VehicleStatus.AVAILABLE) {
    throw new AppError('Xe này hiện không sẵn sàng để giao', 400, 'VEHICLE_UNAVAILABLE');
  }

  const cafe = await AppDataSource.getRepository(Cafe).findOne({
    where: { id: registration.rentalCafeId },
  });
  if (!cafe) throw new AppError('Chi nhánh không tồn tại', 404, 'CAFE_NOT_FOUND');

  const window = resolveContestHandoverWindow(contest, cafe.slotDurationMinutes);

  return AppDataSource.transaction(async (manager) => {
    // Một VĐV chỉ nhận một phiếu; giao lại lần nữa là lỗi thao tác.
    const existing = await manager.getRepository(Booking).findOne({
      where: { contestId: contest.id, customerId: registration.userId },
    });
    if (existing) {
      throw new AppError(
        'VĐV này đã được giao xe trong giải',
        409,
        'CONTEST_HANDOVER_ALREADY_EXISTS',
      );
    }

    const booking = await manager.getRepository(Booking).save(
      manager.getRepository(Booking).create({
        customerId: registration.userId,
        cafeId: registration.rentalCafeId!,
        trackTypeId: contest.trackTypeId ?? cafe.trackTypes?.[0],
        trackConfigId: null,
        playMode: BookingMode.RENTAL,
        source: BookingSource.CONTEST,
        status: BookingStatus.CONFIRMED,
        slotStart: window.slotStart,
        slotEnd: window.slotEnd,
        slotCount: window.slotCount,
        paymentExpiresAt: window.slotStart,
        contestId: contest.id,
        discountAmount: 0,
        snapshot: {
          contest_id: contest.id,
          contest_registration_id: registration.id,
          contest_handover: true,
          slot_fee_total: 0,
          fnb_total: 0,
          discount_amount: 0,
          total_charged: 0,
          vehicles: [{ rental_fee: 0, security_deposit: 0 }],
          captured_at: new Date().toISOString(),
        },
      }),
    );

    const participant = await manager.getRepository(BookingParticipant).save(
      manager.getRepository(BookingParticipant).create({
        bookingId: booking.id,
        userId: registration.userId,
        participantType: BookingParticipantType.BOOKER,
        isPrimaryResponsible: true,
      }),
    );

    // Snapshot 0đ: thuê xe trong giải miễn phí và không thu cọc, nhưng vẫn giữ
    // giá thuê để tính tiền lúc trả xe.
    const bookingVehicle = await manager.getRepository(BookingVehicle).save(
      manager.getRepository(BookingVehicle).create({
        bookingId: booking.id,
        vehicleId: vehicle.id,
        hourlyRateSnapshot: 0,
        rentalFeeSnapshot: 0,
        securityDepositSnapshot: 0,
      }),
    );

    const session = await manager.getRepository(Session).save(
      manager.getRepository(Session).create({
        bookingId: booking.id,
        cafeId: booking.cafeId,
        status: SessionStatus.CHECKED_IN,
        checkedInBy: staffUserId,
        actualStartAt: new Date(),
        plannedEndAt: booking.slotEnd,
        actualTotalAmount: 0,
      }),
    );

    const user = await manager.getRepository(User).findOne({ where: { id: registration.userId } });
    const sessionParticipant = await manager.getRepository(SessionParticipant).save(
      manager.getRepository(SessionParticipant).create({
        sessionId: session.id,
        bookingParticipantId: participant.id,
        userId: registration.userId,
        displayName: user?.full_name ?? 'VĐV',
        phone: user?.phone ?? null,
        role: ParticipantRole.DRIVER,
        isPrimaryResponsible: true,
        checkedInAt: new Date(),
      }),
    );

    await manager.getRepository(SessionVehicle).save(
      manager.getRepository(SessionVehicle).create({
        sessionId: session.id,
        bookingVehicleId: bookingVehicle.id,
        vehicleSource: VehicleSource.RENTAL,
        vehicleId: vehicle.id,
        status: SessionVehicleStatus.ASSIGNED,
        assignedToParticipantId: sessionParticipant.id,
      }),
    );

    return { bookingId: booking.id, sessionId: session.id, vehicleId: vehicle.id };
  });
}
