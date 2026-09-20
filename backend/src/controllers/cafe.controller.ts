import type { Request, Response, NextFunction } from 'express';
import {
  CafeListQuerySchema,
  CreateCafeSchema,
  UpdateCafeSchema,
  UpdateCafeStatusSchema,
  UpsertWidgetConfigSchema,
  CheckAvailabilitySchema,
} from '../validate';
import {
  AppError,
  AuthRequest,
  BookingMode,
  BookingStatus,
  CafeStatus,
  UserRole,
  VehicleStatus,
} from '../types';
import * as cafeService from '../services/cafe.service';
import { getWidgetConfigForCafe, upsertWidgetConfig } from '../services/chat.service';
import { AppDataSource } from '../config/database';
import { redis } from '../config/redis';
import { Cafe } from '../models/cafe.entity';
import { Booking } from '../models/booking.entity';
import { BookingParticipant } from '../models/booking-participant.entity';
import { BookingVehicle } from '../models/booking-vehicle.entity';
import { findContestLockConflictForBooking } from '../services/contest-lock.service';
import { Vehicle } from '../models/vehicle.entity';
import { VehicleCatalog } from '../models/vehicle-catalog.entity';
import { CafeTrackConfig } from '../models/cafe-track-config.entity';
import { assertSlotWithinOperatingHours } from '../services/booking.service';

function viewerFromRequest(req: AuthRequest) {
  return req.user ? { userId: req.user.userId, role: req.user.role } : undefined;
}

function normalizeCafeListQuery(query: Request['query']) {
  const normalized: Record<string, unknown> = { ...query };

  if (normalized.amenities === undefined && normalized['amenities[]'] !== undefined) {
    normalized.amenities = normalized['amenities[]'];
  }
  if (normalized.popular_filters === undefined && normalized['popular_filters[]'] !== undefined) {
    normalized.popular_filters = normalized['popular_filters[]'];
  }

  return normalized;
}

/**
 * Vì sao khung giờ này không đặt được.
 *
 * Trước đây bị giải đấu khoá sân cũng chỉ trả `available: false`, giống hệt khi
 * hết chỗ vì khách khác đã đặt. Giao diện không có gì để phân biệt nên in "Hết"
 * cho cả mười ba khung giờ trong ngày — khách nhìn vào tưởng quán kín lịch cả
 * ngày và bỏ đi, trong khi sự thật là hôm đó có giải và hôm sau vẫn trống.
 *
 * Trả kèm tên giải để khách biết chuyện gì đang xảy ra. Đây là thông tin công
 * khai: giải đấu vốn được đăng lên trang chủ để mời người tham gia.
 */
function contestUnavailable(lock: { contest_id: string; contest_name: string }) {
  return {
    unavailable_reason: 'CONTEST' as const,
    contest: { id: lock.contest_id, name: lock.contest_name },
  };
}

export const cafeController = {
  // POST /api/v1/cafes  [auth]
  async createCafe(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      const body = CreateCafeSchema.parse(req.body);
      const cafe = await cafeService.createCafe(req.user.userId, body);
      res.status(201).json({ success: true, data: cafe });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/v1/cafes
  async listCafes(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const {
        page,
        limit,
        scope,
        query,
        slug,
        district,
        city,
        track_type,
        price_min,
        price_max,
        amenities,
        vehicle_type,
        sort_by,
        popular_filters,
        status,
        date,
        play_mode,
      } = CafeListQuerySchema.parse(normalizeCafeListQuery(req.query));
      const canFilterStatus =
        req.user?.role === UserRole.ADMIN || req.user?.role === UserRole.PROVIDER;
      const visibleStatus = canFilterStatus ? (status as CafeStatus | undefined) : undefined;

      const result = await cafeService.listCafes({
        page,
        limit,
        scope,
        query,
        slug,
        district,
        city,
        track_type,
        price_min,
        price_max,
        amenities,
        vehicle_type,
        sort_by,
        popular_filters,
        status: visibleStatus,
        date,
        play_mode,
        viewer: viewerFromRequest(req),
      });
      res.json({
        success: true,
        data: result.data,
        meta: { total: result.total, page, limit },
      });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/v1/cafes/:cafeId
  async getCafeById(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const cafe = await cafeService.getCafeDetail(req.params.cafeId, viewerFromRequest(req));
      res.json({ success: true, data: cafe });
    } catch (err) {
      next(err);
    }
  },

  // PATCH /api/v1/cafes/:cafeId  [auth]
  async updateCafe(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user || req.user.role !== UserRole.PROVIDER) {
        throw new AppError('Forbidden', 403, 'FORBIDDEN');
      }
      const body = UpdateCafeSchema.parse(req.body);
      const cafe = await cafeService.updateCafe(req.params.cafeId, req.user.userId, body);
      res.json({ success: true, data: cafe });
    } catch (err) {
      next(err);
    }
  },

  // PATCH /api/v1/cafes/:cafeId/status  [auth]
  async updateCafeStatus(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      const { status } = UpdateCafeStatusSchema.parse(req.body);
      const cafe = await cafeService.updateCafeStatus(req.params.cafeId, status, {
        userId: req.user.userId,
        role: req.user.role,
      });
      res.json({ success: true, data: cafe });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/v1/cafes/:cafeId/widget-config  [auth]
  // GET /api/v1/cafes/:cafeId/widget-config  (public)
  async getWidgetConfig(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const cafe = await cafeService.getCafeOrThrow(req.params.cafeId);
      const config = await getWidgetConfigForCafe(req.params.cafeId);
      res.json({
        success: true,
        data: {
          cafeId: cafe.id,
          cafeSlug: cafe.slug,
          greetingMessage: config?.greetingMessage ?? 'Xin chào! Tôi có thể giúp gì cho bạn?',
          welcomeMessage: config?.welcomeMessage ?? 'Xin chào! Tôi có thể giúp gì cho bạn?',
          position: config?.position ?? 'BOTTOM_RIGHT',
          primaryColor: config?.primaryColor ?? '#EA580C',
          avatarUrl: config?.avatarUrl ?? null,
          quickReplies: config?.quickReplies ?? [],
          systemPrompt: config?.systemPrompt ?? null,
          isEnabled: config?.isEnabled ?? false,
          fullPageEnabled: config?.fullPageEnabled ?? false,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  // PUT /api/v1/cafes/:cafeId/widget-config  [auth]
  async updateWidgetConfig(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      await cafeService.getManagedCafeOrThrow(req.params.cafeId, {
        userId: req.user.userId,
        role: req.user.role,
      });
      const body = UpsertWidgetConfigSchema.parse(req.body);
      const updated = await upsertWidgetConfig(req.params.cafeId, {
        ...(body.greeting_message !== undefined && { greetingMessage: body.greeting_message }),
        ...(body.welcome_message !== undefined && { welcomeMessage: body.welcome_message }),
        ...(body.position !== undefined && { position: body.position }),
        ...(body.primary_color !== undefined && { primaryColor: body.primary_color }),
        ...(body.avatar_url !== undefined && { avatarUrl: body.avatar_url }),
        ...(body.quick_replies !== undefined && { quickReplies: body.quick_replies }),
        ...(body.system_prompt !== undefined && { systemPrompt: body.system_prompt }),
        ...(body.is_enabled !== undefined && { isEnabled: body.is_enabled }),
        ...(body.full_page_enabled !== undefined && { fullPageEnabled: body.full_page_enabled }),
      });
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/v1/cafes/:cafeId/availability
  async getAvailability(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const cafeId = req.params.cafeId;
      const query = CheckAvailabilitySchema.parse(req.query);
      const slotStart = new Date(query.slot_start);

      const cafeRepo = AppDataSource.getRepository(Cafe);
      const cafe = await cafeRepo.findOne({ where: { id: cafeId } });
      if (!cafe) throw new AppError('Cafe not found', 404, 'CAFE_NOT_FOUND');
      if (cafe.status !== CafeStatus.ACTIVE) {
        throw new AppError('Cafe is not accepting bookings', 400, 'CAFE_NOT_ACTIVE');
      }

      const activeStatuses = [BookingStatus.PENDING, BookingStatus.CONFIRMED];
      const slotEnd = new Date(query.slot_end);
      assertSlotWithinOperatingHours(cafe, slotStart, slotEnd);

      // Resolve per-track capacity when track_config_id is provided
      let trackConfig: CafeTrackConfig | null = null;
      if (query.track_config_id) {
        trackConfig = await AppDataSource.getRepository(CafeTrackConfig).findOne({
          where: { id: query.track_config_id, cafeId, isActive: true },
        });
        if (!trackConfig || trackConfig.deletedAt) {
          throw new AppError('Track config not found or inactive', 400, 'TRACK_CONFIG_NOT_FOUND');
        }
      }

      if (query.play_mode === BookingMode.BYOC) {
        const contestLock = await findContestLockConflictForBooking({
          cafeId,
          slotStart,
          slotEnd,
          trackConfigId: trackConfig?.id ?? null,
          trackTypeId: trackConfig?.trackTypeId ?? query.track_type_id ?? null,
        });
        if (contestLock) {
          res.json({
            success: true,
            data: {
              play_mode: 'BYOC',
              available: false,
              byoc_remaining: 0,
              vehicles: [],
              ...contestUnavailable(contestLock),
            },
          });
          return;
        }

        const capacity = trackConfig ? trackConfig.byocCapacity : cafe.byocCapacity;

        // Range-overlap query: bookings that overlap [slotStart, slotEnd)
        const qb = AppDataSource.getRepository(Booking)
          .createQueryBuilder('b')
          .where('b.cafe_id = :cafeId', { cafeId })
          .andWhere('b.play_mode = :mode', { mode: BookingMode.BYOC })
          .andWhere('b.slot_start < :slotEnd', { slotEnd })
          .andWhere('b.slot_end > :slotStart', { slotStart })
          .andWhere('b.status IN (:...statuses)', { statuses: activeStatuses });

        if (trackConfig) {
          qb.andWhere(
            `(
              b.track_config_id = :trackConfigId
              OR (
                b.track_config_id IS NULL
                AND (
                  b.snapshot ->> 'track_config_id' = CAST(:trackConfigId AS text)
                  OR (
                    b.snapshot ->> 'track_config_id' IS NULL
                    AND b.track_type_id = :trackTypeId
                  )
                )
              )
            )`,
            { trackConfigId: trackConfig.id, trackTypeId: trackConfig.trackTypeId },
          );
        }

        // BYOC capacity is counted per participant. Legacy bookings without a
        // participant row still consume one position instead of becoming free.
        const dbOccupiedRow = await qb
          .leftJoin(BookingParticipant, 'bp', 'bp.booking_id = b.id')
          .select('COUNT(bp.id) + COUNT(DISTINCT b.id) FILTER (WHERE bp.id IS NULL)', 'count')
          .getRawOne<{ count: string }>();
        const dbOccupied = Number(dbOccupiedRow?.count ?? 0);

        // Redis counter covers in-flight checkouts not yet confirmed
        const counterKey = trackConfig
          ? `slot:byoc:${cafeId}:${trackConfig.id}:${slotStart.getTime()}`
          : `slot:byoc:${cafeId}:${slotStart.getTime()}`;
        const redisCount = Number((await redis.get(counterKey)) ?? 0);
        // Redis only represents a checkout that has not committed its booking yet;
        // committed PENDING/CONFIRMED bookings are counted from the database.
        const occupied = dbOccupied + redisCount;
        const remaining = Math.max(0, capacity - occupied);
        res.json({
          success: true,
          data: {
            play_mode: 'BYOC',
            available: remaining > 0,
            byoc_remaining: remaining,
            vehicles: [],
          },
        });
        return;
      }

      // RENTAL: exclude vehicles already booked (DB) or in checkout (Redis) for this slot
      const vehicleRepo = AppDataSource.getRepository(Vehicle);
      const catalogRepo = AppDataSource.getRepository(VehicleCatalog);
      const contestLock = await findContestLockConflictForBooking({
        cafeId,
        slotStart,
        slotEnd,
        trackConfigId: trackConfig?.id ?? null,
        trackTypeId: trackConfig?.trackTypeId ?? query.track_type_id ?? null,
      });

      if (contestLock) {
        res.json({
          success: true,
          data: {
            play_mode: 'RENTAL',
            available: false,
            vehicles: [],
            ...contestUnavailable(contestLock),
          },
        });
        return;
      }

      const vehicles = await vehicleRepo.find({
        where: { cafeId, status: VehicleStatus.AVAILABLE },
      });

      // Fetch vehicle IDs with confirmed/pending bookings that cover this slot
      const bookedVehicleRows = await AppDataSource.getRepository(BookingVehicle)
        .createQueryBuilder('bv')
        .innerJoin(Booking, 'b', 'b.id = bv.booking_id')
        .where('b.cafe_id = :cafeId', { cafeId })
        .andWhere('b.status IN (:...statuses)', { statuses: activeStatuses })
        .andWhere('b.slot_start < :slotEnd', { slotEnd })
        .andWhere('b.slot_end > :slotStart', { slotStart })
        .select('bv.vehicle_id', 'vehicleId')
        .getRawMany<{ vehicleId: string }>();

      const dbBookedIds = new Set(bookedVehicleRows.map((r) => r.vehicleId));

      const slotEpoch = slotStart.getTime();
      const available = await Promise.all(
        vehicles.map(async (v) => {
          // Skip if booked in DB or locked in Redis (checkout in progress)
          if (dbBookedIds.has(v.id)) return null;
          const lockKey = `slot:lock:vehicle:${v.id}:${slotEpoch}`;
          const locked = await redis.get(lockKey);
          if (locked) return null;
          const catalog = await catalogRepo.findOne({ where: { id: v.catalogId } });
          if (!catalog) return null;
          // Filter by track type compatibility when a track is selected
          // If catalog has explicit track restrictions, enforce them; empty = compatible with all
          if (
            trackConfig &&
            catalog.compatibleTrackTypes.length > 0 &&
            !catalog.compatibleTrackTypes.includes(trackConfig.trackTypeId)
          ) {
            return null;
          }
          return {
            vehicle_id: v.id,
            vehicle_identifier: v.identifier,
            catalog_name: catalog.name,
            tier: catalog.tier,
            rental_fee_per_hour: Number(catalog.hourlyRate),
          };
        }),
      );

      let filteredVehicles = available.filter(Boolean);

      // Per-track capacity cap: if track has a max_concurrent limit, enforce it
      if (trackConfig) {
        const currentRentalCount = await AppDataSource.getRepository(Booking)
          .createQueryBuilder('b')
          .where('b.cafe_id = :cafeId', { cafeId })
          .andWhere('b.play_mode = :mode', { mode: BookingMode.RENTAL })
          // Preserve the exact track from the booking snapshot for records made
          // before track_config_id was persisted. Only truly old records with no
          // snapshot fall back to their track type.
          .andWhere(
            `(
              b.track_config_id = :trackConfigId
              OR (
                b.track_config_id IS NULL
                AND (
                  b.snapshot ->> 'track_config_id' = CAST(:trackConfigId AS text)
                  OR (
                    b.snapshot ->> 'track_config_id' IS NULL
                    AND b.track_type_id = :trackTypeId
                  )
                )
              )
            )`,
            { trackConfigId: trackConfig.id, trackTypeId: trackConfig.trackTypeId },
          )
          .andWhere('b.slot_start < :slotEnd', { slotEnd })
          .andWhere('b.slot_end > :slotStart', { slotStart })
          .andWhere('b.status IN (:...statuses)', { statuses: activeStatuses })
          .getCount();

        const maxConcurrent = trackConfig.maxConcurrent;
        const remainingSlots = Math.max(0, maxConcurrent - currentRentalCount);
        filteredVehicles = filteredVehicles.slice(0, remainingSlots);
      }

      res.json({
        success: true,
        data: {
          play_mode: 'RENTAL',
          available: filteredVehicles.length > 0,
          vehicles: filteredVehicles,
        },
      });
    } catch (err) {
      next(err);
    }
  },
};
