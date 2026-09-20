import { computeEffectiveMultiplier } from '../../services/pricing.service';
import { PricingRuleType, HolidayType } from '../../types';
import type { CafePricingRule } from '../../models/cafe-pricing-rule.entity';
import type { HolidayDate } from '../../models/holiday-date.entity';
import type { CafeHolidayOverride } from '../../models/cafe-holiday-override.entity';

// Helpers
function makeRule(overrides: Partial<CafePricingRule>): CafePricingRule {
  return {
    id: 'rule-1',
    cafeId: 'cafe-1',
    ruleType: PricingRuleType.WEEKEND,
    multiplier: 1.5,
    peakStartTime: null,
    peakEndTime: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  } as CafePricingRule;
}

function makeHoliday(overrides: Partial<HolidayDate>): HolidayDate {
  return {
    id: 'holiday-1',
    cafeId: null,
    holidayDate: '2026-09-02',
    name: 'Quốc khánh',
    multiplier: 1.0,
    holidayType: HolidayType.SYSTEM,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  } as HolidayDate;
}

function makeOverride(overrides: Partial<CafeHolidayOverride>): CafeHolidayOverride {
  return {
    id: 'override-1',
    cafeId: 'cafe-1',
    holidayDateId: 'holiday-1',
    multiplier: 2.0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as CafeHolidayOverride;
}

// Wednesday 2026-01-07 14:00 UTC+7 — ordinary weekday, non-peak
const weekdaySlot = new Date('2026-01-07T07:00:00.000Z'); // 14:00 UTC+7
// Saturday 2026-01-10 14:00 UTC+7
const saturdaySlot = new Date('2026-01-10T07:00:00.000Z'); // 14:00 UTC+7
// Sunday 2026-01-11 14:00 UTC+7
const sundaySlot = new Date('2026-01-11T07:00:00.000Z'); // 14:00 UTC+7
// Wednesday 2026-01-07 19:00 UTC+7 — within 18:00–21:00 peak
const peakSlot = new Date('2026-01-07T12:00:00.000Z'); // 19:00 UTC+7
// Saturday 2026-01-10 19:00 UTC+7 — weekend AND peak
const satPeakSlot = new Date('2026-01-10T12:00:00.000Z'); // 19:00 UTC+7
// National holiday 2026-09-02 10:00 UTC+7
const holidaySlot = new Date('2026-09-02T03:00:00.000Z'); // 10:00 UTC+7
// 2026-09-02 is a Wednesday — holiday only (not weekend)
// Friday UTC that is Saturday UTC+7: 2026-01-23T17:00:00Z = 2026-01-24 00:00 UTC+7
const fridayUtcSaturdayLocal = new Date('2026-01-23T17:00:00.000Z');
// Wednesday 2026-01-07 21:00 UTC+7 — exactly at peak end boundary
const peakBoundarySlot = new Date('2026-01-07T14:00:00.000Z'); // 21:00 UTC+7

describe('computeEffectiveMultiplier', () => {
  it('returns multiplier=1.0 and label=null for weekday non-peak with no rules', () => {
    const result = computeEffectiveMultiplier(weekdaySlot, [], [], []);
    expect(result.multiplier).toBe(1.0);
    expect(result.label).toBeNull();
  });

  it('returns weekend multiplier for Saturday slot', () => {
    const rule = makeRule({ ruleType: PricingRuleType.WEEKEND, multiplier: 1.5 });
    const result = computeEffectiveMultiplier(saturdaySlot, [rule], [], []);
    expect(result.multiplier).toBe(1.5);
    expect(result.label).toBe('Cuối tuần');
  });

  it('returns weekend multiplier for Sunday slot', () => {
    const rule = makeRule({ ruleType: PricingRuleType.WEEKEND, multiplier: 1.5 });
    const result = computeEffectiveMultiplier(sundaySlot, [rule], [], []);
    expect(result.multiplier).toBe(1.5);
    expect(result.label).toBe('Cuối tuần');
  });

  it('returns peak multiplier for slot within peak hours window', () => {
    const rule = makeRule({
      ruleType: PricingRuleType.PEAK_HOURS,
      multiplier: 1.3,
      peakStartTime: '18:00',
      peakEndTime: '21:00',
    });
    const result = computeEffectiveMultiplier(peakSlot, [rule], [], []);
    expect(result.multiplier).toBe(1.3);
    expect(result.label).toBe('Giờ cao điểm');
  });

  // Cột TIME của Postgres trả về 'HH:MM:SS'. Các fixture cũ dùng 'HH:MM' nên
  // không bao giờ chạm tới biên thật — hai ca dưới đây dùng đúng định dạng DB.
  const peakStartSlot = new Date('2026-01-07T11:00:00.000Z'); // 18:00 UTC+7

  it('tính giá cao điểm cho slot bắt đầu ĐÚNG giờ mở khung (biên trái tính vào)', () => {
    const rule = makeRule({
      ruleType: PricingRuleType.PEAK_HOURS,
      multiplier: 1.3,
      peakStartTime: '18:00:00',
      peakEndTime: '21:00:00',
    });
    const result = computeEffectiveMultiplier(peakStartSlot, [rule], [], []);
    expect(result.multiplier).toBe(1.3);
    expect(result.label).toBe('Giờ cao điểm');
  });

  it('KHÔNG tính giá cao điểm cho slot bắt đầu đúng giờ đóng khung (biên phải loại ra)', () => {
    const rule = makeRule({
      ruleType: PricingRuleType.PEAK_HOURS,
      multiplier: 1.3,
      peakStartTime: '18:00:00',
      peakEndTime: '21:00:00',
    });
    const result = computeEffectiveMultiplier(peakBoundarySlot, [rule], [], []);
    expect(result.multiplier).toBe(1.0);
    expect(result.label).toBeNull();
  });

  it('returns higher of weekend vs peak — no stacking', () => {
    const rules = [
      makeRule({ id: 'r1', ruleType: PricingRuleType.WEEKEND, multiplier: 1.5 }),
      makeRule({
        id: 'r2',
        ruleType: PricingRuleType.PEAK_HOURS,
        multiplier: 1.3,
        peakStartTime: '18:00',
        peakEndTime: '21:00',
      }),
    ];
    // Saturday 19:00 — both apply, weekend wins
    const result = computeEffectiveMultiplier(satPeakSlot, rules, [], []);
    expect(result.multiplier).toBe(1.5);
    expect(result.label).toBe('Cuối tuần');
  });

  it('returns SYSTEM holiday override multiplier for holiday date', () => {
    const holiday = makeHoliday({
      id: 'h1',
      holidayDate: '2026-09-02',
      multiplier: 1.0,
      holidayType: HolidayType.SYSTEM,
    });
    const override = makeOverride({ holidayDateId: 'h1', multiplier: 2.5 });
    const result = computeEffectiveMultiplier(holidaySlot, [], [holiday], [override]);
    expect(result.multiplier).toBe(2.5);
    expect(result.label).toContain('Quốc khánh');
  });

  it('returns multiplier for CUSTOM cafe holiday', () => {
    const holiday = makeHoliday({
      id: 'h2',
      cafeId: 'cafe-1',
      holidayDate: '2026-09-02',
      name: 'Khai trương',
      multiplier: 1.8,
      holidayType: HolidayType.CUSTOM,
    });
    const result = computeEffectiveMultiplier(holidaySlot, [], [holiday], []);
    expect(result.multiplier).toBe(1.8);
    expect(result.label).toContain('Khai trương');
  });

  it('returns higher of holiday vs weekend when both apply', () => {
    // 2026-01-10 is a Saturday AND has a holiday override of 2.0
    const satHolidaySlot = new Date('2026-01-10T07:00:00.000Z'); // Saturday 14:00 UTC+7
    const holiday = makeHoliday({
      id: 'h3',
      holidayDate: '2026-01-10',
      name: 'Sự kiện',
      multiplier: 1.0,
      holidayType: HolidayType.SYSTEM,
    });
    const override = makeOverride({ holidayDateId: 'h3', multiplier: 2.0 });
    const weekendRule = makeRule({ ruleType: PricingRuleType.WEEKEND, multiplier: 1.5 });
    const result = computeEffectiveMultiplier(satHolidaySlot, [weekendRule], [holiday], [override]);
    expect(result.multiplier).toBe(2.0);
  });

  it('returns 1.0 when weekend rule exists but is_active=false', () => {
    const rule = makeRule({ ruleType: PricingRuleType.WEEKEND, multiplier: 1.5, isActive: false });
    const result = computeEffectiveMultiplier(saturdaySlot, [rule], [], []);
    expect(result.multiplier).toBe(1.0);
    expect(result.label).toBeNull();
  });

  it('uses Asia/Ho_Chi_Minh timezone — Friday UTC is Saturday UTC+7', () => {
    // 2026-01-23 17:00 UTC = 2026-01-24 00:00 UTC+7 (Saturday)
    const rule = makeRule({ ruleType: PricingRuleType.WEEKEND, multiplier: 1.5 });
    const result = computeEffectiveMultiplier(fridayUtcSaturdayLocal, [rule], [], []);
    expect(result.multiplier).toBe(1.5);
    expect(result.label).toBe('Cuối tuần');
  });

  it('slot at exactly peak end boundary (21:00) is NOT considered peak', () => {
    // Peak is 18:00–21:00; a slot starting at 21:00 should NOT match
    const rule = makeRule({
      ruleType: PricingRuleType.PEAK_HOURS,
      multiplier: 1.3,
      peakStartTime: '18:00',
      peakEndTime: '21:00',
    });
    const result = computeEffectiveMultiplier(peakBoundarySlot, [rule], [], []);
    expect(result.multiplier).toBe(1.0);
    expect(result.label).toBeNull();
  });
});
