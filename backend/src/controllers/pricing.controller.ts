import type { Request, Response, NextFunction } from 'express';
import { IsNull } from 'typeorm';
import { AppDataSource } from '../config/database';
import { Cafe } from '../models/cafe.entity';
import { CafePricingRule } from '../models/cafe-pricing-rule.entity';
import { HolidayDate } from '../models/holiday-date.entity';
import { CafeHolidayOverride } from '../models/cafe-holiday-override.entity';
import { AppError, AuthRequest, HolidayType, PricingRuleType } from '../types';
import { getEffectiveMultiplier } from '../services/pricing.service';
import {
  UpdatePricingRulesSchema,
  PricingPreviewQuerySchema,
  CreateHolidaySchema,
  UpdateHolidaySchema,
  ListHolidaysQuerySchema,
} from '../validate';

// GET /api/v1/provider/cafes/:cafeId/pricing  [auth]
export const pricingController = {
  async getProviderPricing(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { cafeId } = req.params;
      const cafe = await AppDataSource.getRepository(Cafe).findOne({ where: { id: cafeId } });
      if (!cafe) throw new AppError('Cafe not found', 404, 'CAFE_NOT_FOUND');

      const rules = await AppDataSource.getRepository(CafePricingRule).find({
        where: { cafeId, isActive: true, deletedAt: IsNull() },
        order: { createdAt: 'ASC' },
      });

      res.json({
        base_price_per_hour: Number(cafe.slotFeeRate),
        rules: rules.map((r) => ({
          id: r.id,
          rule_type: r.ruleType,
          multiplier: Number(r.multiplier),
          is_active: r.isActive,
          peak_start_time: r.peakStartTime ?? undefined,
          peak_end_time: r.peakEndTime ?? undefined,
        })),
      });
    } catch (err) {
      next(err);
    }
  },

  // PUT /api/v1/provider/cafes/:cafeId/pricing/rules  [auth]
  async updatePricingRules(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { cafeId } = req.params;
      const body = UpdatePricingRulesSchema.parse(req.body);

      const repo = AppDataSource.getRepository(CafePricingRule);

      // Soft-delete existing active rules, then insert new ones
      await repo
        .createQueryBuilder()
        .update(CafePricingRule)
        .set({ deletedAt: new Date(), isActive: false })
        .where('cafe_id = :cafeId AND deleted_at IS NULL', { cafeId })
        .execute();

      const now = new Date();

      if (body.weekend_multiplier !== null) {
        await repo.save(
          repo.create({
            cafeId,
            ruleType: PricingRuleType.WEEKEND,
            multiplier: body.weekend_multiplier,
            isActive: true,
            createdAt: now,
            updatedAt: now,
          }),
        );
      }

      for (const ph of body.peak_hours) {
        await repo.save(
          repo.create({
            cafeId,
            ruleType: PricingRuleType.PEAK_HOURS,
            multiplier: ph.multiplier,
            peakStartTime: ph.start,
            peakEndTime: ph.end,
            isActive: true,
            createdAt: now,
            updatedAt: now,
          }),
        );
      }

      res.json({ updated: true });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/v1/cafes/:cafeId/pricing
  async getPublicPricing(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { cafeId } = req.params;
      const cafe = await AppDataSource.getRepository(Cafe).findOne({ where: { id: cafeId } });
      if (!cafe) throw new AppError('Cafe not found', 404, 'CAFE_NOT_FOUND');

      const rules = await AppDataSource.getRepository(CafePricingRule).find({
        where: { cafeId, isActive: true, deletedAt: IsNull() },
      });

      const now = new Date();
      const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      const todayStr = now.toISOString().slice(0, 10);
      const limitStr = in30Days.toISOString().slice(0, 10);

      const [systemHolidays, customHolidays] = await Promise.all([
        AppDataSource.getRepository(HolidayDate)
          .createQueryBuilder('h')
          .where('h.cafe_id IS NULL')
          .andWhere('h.holiday_date >= :today AND h.holiday_date <= :limit', {
            today: todayStr,
            limit: limitStr,
          })
          .andWhere('h.deleted_at IS NULL')
          .getMany(),
        AppDataSource.getRepository(HolidayDate)
          .createQueryBuilder('h')
          .where('h.cafe_id = :cafeId', { cafeId })
          .andWhere('h.holiday_date >= :today AND h.holiday_date <= :limit', {
            today: todayStr,
            limit: limitStr,
          })
          .andWhere('h.deleted_at IS NULL')
          .getMany(),
      ]);

      const systemOverrides = await AppDataSource.getRepository(CafeHolidayOverride).find({
        where: { cafeId },
      });

      const weekendRule = rules.find((r) => r.ruleType === PricingRuleType.WEEKEND);
      const peakRules = rules.filter((r) => r.ruleType === PricingRuleType.PEAK_HOURS);

      // Only include holidays with effective multiplier > 1.0
      const upcomingHolidays: Array<{
        date: string;
        name: string;
        multiplier: number;
        label: string;
      }> = [];

      for (const h of systemHolidays) {
        const override = systemOverrides.find((o) => o.holidayDateId === h.id);
        const effectiveMultiplier = override ? Number(override.multiplier) : Number(h.multiplier);
        if (effectiveMultiplier > 1.0) {
          upcomingHolidays.push({
            date: h.holidayDate,
            name: h.name,
            multiplier: effectiveMultiplier,
            label: `Ngày lễ ${h.name}`,
          });
        }
      }

      for (const h of customHolidays) {
        if (Number(h.multiplier) > 1.0) {
          upcomingHolidays.push({
            date: h.holidayDate,
            name: h.name,
            multiplier: Number(h.multiplier),
            label: `Ngày lễ ${h.name}`,
          });
        }
      }

      upcomingHolidays.sort((a, b) => a.date.localeCompare(b.date));

      res.json({
        base_price_per_hour: Number(cafe.slotFeeRate),
        slot_duration_minutes: cafe.slotDurationMinutes,
        rules: {
          weekend: weekendRule
            ? { multiplier: Number(weekendRule.multiplier), label: 'Cuối tuần' }
            : null,
          peak_hours: peakRules.map((r) => ({
            start: r.peakStartTime,
            end: r.peakEndTime,
            multiplier: Number(r.multiplier),
            label: 'Giờ cao điểm',
          })),
          upcoming_holidays: upcomingHolidays,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/v1/cafes/:cafeId/pricing-preview
  async getPricingPreview(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { cafeId } = req.params;
      const query = PricingPreviewQuerySchema.parse(req.query);

      const cafe = await AppDataSource.getRepository(Cafe).findOne({ where: { id: cafeId } });
      if (!cafe) throw new AppError('Cafe not found', 404, 'CAFE_NOT_FOUND');

      const slotStart = new Date(query.slot_start);
      const slotEnd = new Date(query.slot_end);
      const slotHours = (slotEnd.getTime() - slotStart.getTime()) / (1000 * 60 * 60);

      const { multiplier, label } = await getEffectiveMultiplier(cafeId, slotStart);
      const basePricePerHour = Number(cafe.slotFeeRate);
      const effectivePricePerHour = basePricePerHour * multiplier;

      res.json({
        base_price_per_hour: basePricePerHour,
        effective_price_per_hour: effectivePricePerHour,
        multiplier,
        label,
        slot_fee_total: effectivePricePerHour * slotHours,
      });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/v1/provider/cafes/:cafeId/pricing/holidays  [auth]
  async listHolidays(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { cafeId } = req.params;
      const { year } = ListHolidaysQuerySchema.parse(req.query);
      const targetYear = year ?? new Date().getFullYear();

      const yearStart = `${targetYear}-01-01`;
      const yearEnd = `${targetYear}-12-31`;

      const [systemHolidays, customHolidays, overrides] = await Promise.all([
        AppDataSource.getRepository(HolidayDate)
          .createQueryBuilder('h')
          .where('h.cafe_id IS NULL')
          .andWhere('h.holiday_date >= :start AND h.holiday_date <= :end', {
            start: yearStart,
            end: yearEnd,
          })
          .andWhere('h.deleted_at IS NULL')
          .orderBy('h.holiday_date', 'ASC')
          .getMany(),
        AppDataSource.getRepository(HolidayDate)
          .createQueryBuilder('h')
          .where('h.cafe_id = :cafeId', { cafeId })
          .andWhere('h.holiday_date >= :start AND h.holiday_date <= :end', {
            start: yearStart,
            end: yearEnd,
          })
          .andWhere('h.deleted_at IS NULL')
          .orderBy('h.holiday_date', 'ASC')
          .getMany(),
        AppDataSource.getRepository(CafeHolidayOverride).find({ where: { cafeId } }),
      ]);

      const holidays = [
        ...systemHolidays.map((h) => {
          const override = overrides.find((o) => o.holidayDateId === h.id);
          return {
            id: h.id,
            date: h.holidayDate,
            name: h.name,
            multiplier: Number(h.multiplier),
            holiday_type: HolidayType.SYSTEM,
            can_delete: false,
            can_override: true,
            override_multiplier: override ? Number(override.multiplier) : null,
          };
        }),
        ...customHolidays.map((h) => ({
          id: h.id,
          date: h.holidayDate,
          name: h.name,
          multiplier: Number(h.multiplier),
          holiday_type: HolidayType.CUSTOM,
          can_delete: true,
          can_override: false,
          override_multiplier: null,
        })),
      ].sort((a, b) => a.date.localeCompare(b.date));

      res.json({ holidays });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/v1/provider/cafes/:cafeId/pricing/holidays  [auth]
  async createHoliday(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { cafeId } = req.params;
      const body = CreateHolidaySchema.parse(req.body);

      const existing = await AppDataSource.getRepository(HolidayDate).findOne({
        where: { cafeId, holidayDate: body.date, deletedAt: IsNull() },
      });
      if (existing)
        throw new AppError('A holiday already exists on this date', 409, 'HOLIDAY_DATE_CONFLICT');

      const repo = AppDataSource.getRepository(HolidayDate);
      const holiday = repo.create({
        cafeId,
        holidayDate: body.date,
        name: body.name,
        multiplier: body.multiplier,
        holidayType: HolidayType.CUSTOM,
      });
      const saved = await repo.save(holiday);

      res.status(201).json({ id: saved.id });
    } catch (err) {
      next(err);
    }
  },

  // PUT /api/v1/provider/cafes/:cafeId/pricing/holidays/:holidayId  [auth]
  async updateHoliday(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { cafeId, holidayId } = req.params;
      const body = UpdateHolidaySchema.parse(req.body);

      const holiday = await AppDataSource.getRepository(HolidayDate).findOne({
        where: { id: holidayId, deletedAt: IsNull() },
      });
      if (!holiday) throw new AppError('Holiday not found', 404, 'NOT_FOUND');

      if (holiday.holidayType === HolidayType.SYSTEM) {
        if (body.name !== undefined) {
          throw new AppError(
            'Cannot change name of system holidays',
            403,
            'SYSTEM_HOLIDAY_NAME_READONLY',
          );
        }
        // Upsert cafe_holiday_overrides
        const overrideRepo = AppDataSource.getRepository(CafeHolidayOverride);
        const existing = await overrideRepo.findOne({
          where: { cafeId, holidayDateId: holidayId },
        });
        if (existing) {
          await overrideRepo.update(existing.id, {
            multiplier: body.multiplier,
            updatedAt: new Date(),
          });
        } else {
          await overrideRepo.save(
            overrideRepo.create({ cafeId, holidayDateId: holidayId, multiplier: body.multiplier }),
          );
        }
      } else {
        // CUSTOM — update holiday_dates directly
        if (holiday.cafeId !== cafeId) {
          throw new AppError('Forbidden', 403, 'FORBIDDEN');
        }
        const updates: Partial<HolidayDate> = {
          multiplier: body.multiplier,
          updatedAt: new Date(),
        };
        if (body.name !== undefined) updates.name = body.name;
        await AppDataSource.getRepository(HolidayDate).update(holidayId, updates);
      }

      res.json({ updated: true });
    } catch (err) {
      next(err);
    }
  },

  // DELETE /api/v1/provider/cafes/:cafeId/pricing/holidays/:holidayId/override  [auth]
  async deleteHolidayOverride(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { cafeId, holidayId } = req.params;
      const override = await AppDataSource.getRepository(CafeHolidayOverride).findOne({
        where: { cafeId, holidayDateId: holidayId },
      });
      if (!override) throw new AppError('No override found for this holiday', 404, 'NOT_FOUND');
      await AppDataSource.getRepository(CafeHolidayOverride).delete(override.id);
      res.json({ reset: true });
    } catch (err) {
      next(err);
    }
  },

  // DELETE /api/v1/provider/cafes/:cafeId/pricing/holidays/:holidayId  [auth]
  async deleteHoliday(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { cafeId, holidayId } = req.params;
      const holiday = await AppDataSource.getRepository(HolidayDate).findOne({
        where: { id: holidayId, deletedAt: IsNull() },
      });
      if (!holiday) throw new AppError('Holiday not found', 404, 'NOT_FOUND');
      if (holiday.holidayType === HolidayType.SYSTEM) {
        throw new AppError(
          'Cannot delete system-provided holidays',
          403,
          'SYSTEM_HOLIDAY_NOT_DELETABLE',
        );
      }
      if (holiday.cafeId !== cafeId) throw new AppError('Forbidden', 403, 'FORBIDDEN');
      await AppDataSource.getRepository(HolidayDate).softDelete(holidayId);
      res.json({ deleted: true });
    } catch (err) {
      next(err);
    }
  },
};
