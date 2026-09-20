import { AppDataSource } from '../config/database';
import { CafePricingRule } from '../models/cafe-pricing-rule.entity';
import { HolidayDate } from '../models/holiday-date.entity';
import { CafeHolidayOverride } from '../models/cafe-holiday-override.entity';
import { HolidayType, PricingRuleType } from '../types';
import { AppError } from '../types';
import { IsNull, Not } from 'typeorm';

const TZ_OFFSET_MS = 7 * 60 * 60 * 1000; // UTC+7

function toLocalDate(utcDate: Date): { dateStr: string; dayOfWeek: number; timeStr: string } {
  const local = new Date(utcDate.getTime() + TZ_OFFSET_MS);
  const yyyy = local.getUTCFullYear();
  const mm = String(local.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(local.getUTCDate()).padStart(2, '0');
  const hh = String(local.getUTCHours()).padStart(2, '0');
  const min = String(local.getUTCMinutes()).padStart(2, '0');
  return {
    dateStr: `${yyyy}-${mm}-${dd}`,
    dayOfWeek: local.getUTCDay(), // 0=Sun, 6=Sat
    timeStr: `${hh}:${min}`,
  };
}

/**
 * Pure computation — accepts pre-fetched DB records.
 * Returns the highest-multiplier rule that applies to slotStart.
 */
export function computeEffectiveMultiplier(
  slotStart: Date,
  rules: CafePricingRule[],
  holidays: HolidayDate[],
  overrides: CafeHolidayOverride[],
): { multiplier: number; label: string | null } {
  const { dateStr, dayOfWeek, timeStr } = toLocalDate(slotStart);
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  const candidates: Array<{ multiplier: number; label: string }> = [];

  // 1. Per-cafe SYSTEM holiday override
  for (const holiday of holidays) {
    if (holiday.holidayDate !== dateStr) continue;
    if (holiday.holidayType !== HolidayType.SYSTEM) continue;
    const override = overrides.find((o) => o.holidayDateId === holiday.id);
    if (override && override.multiplier > 1.0) {
      candidates.push({
        multiplier: Number(override.multiplier),
        label: `Ngày lễ ${holiday.name}`,
      });
    }
  }

  // 2. CUSTOM holiday
  for (const holiday of holidays) {
    if (holiday.holidayDate !== dateStr) continue;
    if (holiday.holidayType !== HolidayType.CUSTOM) continue;
    if (holiday.deletedAt) continue;
    if (Number(holiday.multiplier) > 1.0) {
      candidates.push({ multiplier: Number(holiday.multiplier), label: `Ngày lễ ${holiday.name}` });
    }
  }

  // 3. SYSTEM holiday default (only if no override and multiplier > 1.0)
  for (const holiday of holidays) {
    if (holiday.holidayDate !== dateStr) continue;
    if (holiday.holidayType !== HolidayType.SYSTEM) continue;
    const override = overrides.find((o) => o.holidayDateId === holiday.id);
    if (!override && Number(holiday.multiplier) > 1.0) {
      candidates.push({ multiplier: Number(holiday.multiplier), label: `Ngày lễ ${holiday.name}` });
    }
  }

  // 4. Weekend rule
  if (isWeekend) {
    const weekendRule = rules.find(
      (r) => r.ruleType === PricingRuleType.WEEKEND && r.isActive && !r.deletedAt,
    );
    if (weekendRule) {
      candidates.push({ multiplier: Number(weekendRule.multiplier), label: 'Cuối tuần' });
    }
  }

  // 5. Peak hours rules (start time inclusive, end time exclusive)
  for (const rule of rules) {
    if (rule.ruleType !== PricingRuleType.PEAK_HOURS) continue;
    if (!rule.isActive || rule.deletedAt) continue;
    if (!rule.peakStartTime || !rule.peakEndTime) continue;
    // Cột TIME của Postgres trả về 'HH:MM:SS' còn timeStr là 'HH:MM'. So chuỗi
    // trực tiếp thì '18:00' >= '18:00:00' là false và '21:00' < '21:00:00' là
    // true — khung giờ bị dịch thành (mở, đóng] thay vì [mở, đóng). Cắt về cùng
    // 'HH:MM' trước khi so.
    const peakStart = rule.peakStartTime.slice(0, 5);
    const peakEnd = rule.peakEndTime.slice(0, 5);
    if (timeStr >= peakStart && timeStr < peakEnd) {
      candidates.push({ multiplier: Number(rule.multiplier), label: 'Giờ cao điểm' });
    }
  }

  if (candidates.length === 0) return { multiplier: 1.0, label: null };

  const best = candidates.reduce((a, b) => (a.multiplier >= b.multiplier ? a : b));
  return { multiplier: best.multiplier, label: best.label };
}

/**
 * DB-backed entry point — fetches rules, holidays, and overrides for the given cafe,
 * then delegates to computeEffectiveMultiplier.
 */
export async function getEffectiveMultiplier(
  cafeId: string,
  slotStart: Date,
): Promise<{ multiplier: number; label: string | null }> {
  try {
    const { dateStr } = toLocalDate(slotStart);

    const [rules, systemHolidays, customHolidays] = await Promise.all([
      AppDataSource.getRepository(CafePricingRule).find({
        where: { cafeId, isActive: true, deletedAt: IsNull() },
      }),
      AppDataSource.getRepository(HolidayDate).find({
        where: { cafeId: IsNull(), holidayDate: dateStr, deletedAt: IsNull() },
      }),
      AppDataSource.getRepository(HolidayDate).find({
        where: { cafeId, holidayDate: dateStr, deletedAt: IsNull() },
      }),
    ]);

    const holidays = [...systemHolidays, ...customHolidays];

    const overrides =
      systemHolidays.length > 0
        ? await AppDataSource.getRepository(CafeHolidayOverride).find({
            where: { cafeId, holidayDateId: Not(IsNull()) },
          })
        : [];

    return computeEffectiveMultiplier(slotStart, rules, holidays, overrides);
  } catch {
    throw new AppError('Pricing lookup failed', 500, 'PRICING_LOOKUP_FAILED');
  }
}
