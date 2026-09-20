import { Type } from '@google/genai';
import { IsNull } from 'typeorm';
import { AppDataSource } from '../../config/database';
import { CafePricingRule } from '../../models/cafe-pricing-rule.entity';
import { CafeHolidayOverride } from '../../models/cafe-holiday-override.entity';
import { HolidayType, PricingRuleType } from '../../types';
import { getEffectiveMultiplier } from '../pricing.service';
import { formatVnd, VN_OFFSET_MS, todayInVn } from './money';

export const definition = {
  name: 'get_pricing',
  description:
    'Lấy phí sân (giá thuê sân theo buổi) tại chi nhánh, kèm các quy tắc tăng giá cuối tuần / giờ cao điểm / ngày lễ. ' +
    'Gọi khi khách hỏi giá bao nhiêu, phí sân, thuê sân bao nhiêu tiền, chơi một buổi hết bao nhiêu, giá cuối tuần, giá ngày lễ.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      date: {
        type: Type.STRING,
        description:
          'Ngày cần báo giá, định dạng YYYY-MM-DD. Tự suy ra từ context (ngày mai, thứ 7, mùng 2/9…). Bỏ trống nếu khách hỏi giá chung.',
      },
      time: {
        type: Type.STRING,
        description:
          'Giờ bắt đầu chơi, định dạng HH:MM. Chỉ truyền khi khách nói rõ giờ, vì giá giờ cao điểm khác giá giờ thường.',
      },
    },
    required: [],
  },
};

export interface GetPricingArgs {
  date?: string;
  time?: string;
}

interface PricingRuleSummary {
  label: string;
  multiplier: number;
  pricePerSlot: string;
}

/** Cột TIME của Postgres trả về 'HH:MM:SS' — khách chỉ cần giờ và phút. */
function hhmm(time: string | null): string {
  return (time ?? '').slice(0, 5);
}

function ddmm(dateStr: string): string {
  const [, mm, dd] = dateStr.split('-');
  return `${dd}/${mm}`;
}

/**
 * Thời điểm dùng để tính giá hiệu lực. Khách hỏi trống giờ thì lấy giữa trưa —
 * mốc trung tính, không rơi vào khung cao điểm nào theo thông lệ, nên con số
 * báo ra là giá ngày thường của ngày đó.
 */
function resolveMoment(dateStr: string, time?: string): Date {
  return new Date(`${dateStr}T${time ?? '12:00'}:00+07:00`);
}

// cafeId luôn được inject từ widget context — không nhận từ args để tránh cross-cafe query
export async function handler(cafeId: string, args: GetPricingArgs): Promise<string> {
  const ds = AppDataSource;

  const cafeRows = await ds.query<{ slot_fee_rate: string; slot_duration_minutes: number }[]>(
    `SELECT slot_fee_rate, slot_duration_minutes FROM cafes WHERE id = $1`,
    [cafeId],
  );
  if (!cafeRows.length) return JSON.stringify({ error: 'Cafe not found' });

  const basePrice = parseFloat(cafeRows[0].slot_fee_rate);
  const slotMinutes = Number(cafeRows[0].slot_duration_minutes);
  if (!Number.isFinite(basePrice) || basePrice <= 0) {
    return JSON.stringify({
      message: 'Chi nhánh chưa cấu hình phí sân. Khách nên liên hệ trực tiếp quán để hỏi giá.',
    });
  }

  const dateStr = args.date ?? todayInVn();
  const moment = resolveMoment(dateStr, args.time);

  // Giá hiệu lực đi qua đúng hàm mà booking dùng khi tính tiền thật, để bot
  // không bao giờ báo một con số khác với con số khách phải trả.
  const { multiplier, label } = await getEffectiveMultiplier(cafeId, moment);

  // ── Bảng quy tắc, để bot giải thích được "cuối tuần nhân bao nhiêu" ────────
  const todayStr = todayInVn();
  const limitStr = new Date(Date.now() + VN_OFFSET_MS + 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const [rules, holidays] = await Promise.all([
    ds
      .getRepository(CafePricingRule)
      .find({ where: { cafeId, isActive: true, deletedAt: IsNull() } }),
    ds.query<
      { id: string; holiday_date: string; name: string; multiplier: string; holiday_type: string }[]
    >(
      // holiday_date::text — cột DATE của Postgres về tới đây là Date object,
      // không phải chuỗi 'YYYY-MM-DD' như tên cột gợi ý.
      `SELECT id, holiday_date::text AS holiday_date, name, multiplier, holiday_type
       FROM holiday_dates
       WHERE (cafe_id = $1 OR cafe_id IS NULL)
         AND holiday_date >= $2 AND holiday_date <= $3
         AND deleted_at IS NULL
       ORDER BY holiday_date`,
      [cafeId, todayStr, limitStr],
    ),
  ]);

  const overrides = holidays.some((h) => h.holiday_type === HolidayType.SYSTEM)
    ? await ds.getRepository(CafeHolidayOverride).find({ where: { cafeId } })
    : [];

  const summaries: PricingRuleSummary[] = [];

  const weekendRule = rules.find((r) => r.ruleType === PricingRuleType.WEEKEND);
  if (weekendRule) {
    const m = Number(weekendRule.multiplier);
    summaries.push({ label: 'Cuối tuần', multiplier: m, pricePerSlot: formatVnd(basePrice * m) });
  }

  for (const rule of rules) {
    if (rule.ruleType !== PricingRuleType.PEAK_HOURS) continue;
    if (!rule.peakStartTime || !rule.peakEndTime) continue;
    const m = Number(rule.multiplier);
    summaries.push({
      label: `Giờ cao điểm ${hhmm(rule.peakStartTime)}–${hhmm(rule.peakEndTime)}`,
      multiplier: m,
      pricePerSlot: formatVnd(basePrice * m),
    });
  }

  for (const holiday of holidays) {
    const override =
      holiday.holiday_type === HolidayType.SYSTEM
        ? overrides.find((o) => o.holidayDateId === holiday.id)
        : undefined;
    const m = override ? Number(override.multiplier) : parseFloat(holiday.multiplier);
    if (!(m > 1)) continue; // ngày lễ hệ số 1.0 chỉ là mốc đánh dấu, không đổi giá
    summaries.push({
      label: `Ngày lễ ${holiday.name} (${ddmm(holiday.holiday_date)})`,
      multiplier: m,
      pricePerSlot: formatVnd(basePrice * m),
    });
  }

  return JSON.stringify({
    basePricePerSlot: formatVnd(basePrice),
    slotDurationMinutes: slotMinutes,
    effective: {
      date: dateStr,
      time: args.time ?? null,
      multiplier,
      label,
      pricePerSlot: formatVnd(basePrice * multiplier),
    },
    rules: summaries,
    note:
      `Đây là phí sân cho một buổi ${slotMinutes} phút, tính theo TỪNG NGƯỜI chơi — ` +
      'nhóm 3 người thì nhân 3. ' +
      'Khi nhiều quy tắc cùng áp dụng thì lấy quy tắc có hệ số CAO NHẤT, không nhân dồn các hệ số với nhau. ' +
      'Khách mang xe riêng (BYOC) chỉ trả phí sân. Khách thuê xe của quán thì trả thêm phí thuê xe theo từng loại xe — dùng get_vehicles để tra.',
  });
}
