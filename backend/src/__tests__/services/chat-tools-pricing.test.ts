import { AppDataSource } from '../../config/database';
import { dispatchTool, toolDefinitions } from '../../services/chat-tools';
import { handler as getPricing } from '../../services/chat-tools/get-pricing';
import { handler as checkAvailability } from '../../services/chat-tools/check-availability';
import { handler as getVehicles } from '../../services/chat-tools/get-vehicles';
import { createTestCafe, createTestVehicle } from '../helpers';

/**
 * Trợ lý AI không trả lời được câu hỏi giá sân vì không có tool nào tra giá, và
 * prompt thì cấm bịa. Bộ test này chốt hành vi mong muốn: bot phải đọc được giá
 * thật từ cấu hình quán, kèm đúng hệ số cuối tuần / giờ cao điểm / ngày lễ mà
 * `booking.service` dùng khi tính tiền thật.
 */

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

function vnDateString(d: Date): string {
  return new Date(d.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
}

/** Thứ Bảy gần nhất kể từ ngày mai — để test luật cuối tuần không phụ thuộc hôm nay là thứ mấy. */
function nextSaturday(): string {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  while (new Date(d.getTime() + VN_OFFSET_MS).getUTCDay() !== 6) {
    d.setTime(d.getTime() + 24 * 60 * 60 * 1000);
  }
  return vnDateString(d);
}

/** Thứ Tư gần nhất kể từ ngày mai — ngày thường, không dính luật cuối tuần. */
function nextWednesday(): string {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  while (new Date(d.getTime() + VN_OFFSET_MS).getUTCDay() !== 3) {
    d.setTime(d.getTime() + 24 * 60 * 60 * 1000);
  }
  return vnDateString(d);
}

function tomorrow(): string {
  return vnDateString(new Date(Date.now() + 24 * 60 * 60 * 1000));
}

async function addWeekendRule(cafeId: string, multiplier: number) {
  await AppDataSource.query(
    `INSERT INTO cafe_pricing_rules (cafe_id, rule_type, multiplier, is_active)
     VALUES ($1, 'WEEKEND', $2, true)`,
    [cafeId, multiplier],
  );
}

async function addPeakRule(cafeId: string, start: string, end: string, multiplier: number) {
  await AppDataSource.query(
    `INSERT INTO cafe_pricing_rules
       (cafe_id, rule_type, multiplier, peak_start_time, peak_end_time, is_active)
     VALUES ($1, 'PEAK_HOURS', $2, $3, $4, true)`,
    [cafeId, multiplier, start, end],
  );
}

async function addCustomHoliday(cafeId: string, date: string, name: string, multiplier: number) {
  await AppDataSource.query(
    `INSERT INTO holiday_dates (cafe_id, holiday_date, name, multiplier, holiday_type)
     VALUES ($1, $2, $3, $4, 'CUSTOM')`,
    [cafeId, date, name, multiplier],
  );
}

describe('get_pricing — tool tra phí sân', () => {
  it('được khai báo và định tuyến như một tool thật', async () => {
    const cafe = await createTestCafe({ slot_fee_rate: 50000 });

    expect(toolDefinitions.map((d) => d.name)).toContain('get_pricing');

    const routed = await dispatchTool(cafe.id, 'get_pricing', {});
    expect(JSON.parse(routed)).toHaveProperty('basePricePerSlot');
  });

  it('quán chưa đặt quy tắc nào thì trả đúng giá gốc, hệ số 1', async () => {
    const cafe = await createTestCafe({ slot_fee_rate: 50000 });

    const result = JSON.parse(await getPricing(cafe.id, { date: nextWednesday() }));

    expect(result.basePricePerSlot).toContain('50.000');
    expect(result.effective.multiplier).toBe(1);
    expect(result.effective.label).toBeNull();
    expect(result.rules).toHaveLength(0);
  });

  it('cuối tuần thì nhân hệ số, không trả giá gốc', async () => {
    const cafe = await createTestCafe({ slot_fee_rate: 50000 });
    await addWeekendRule(cafe.id, 1.2);

    const result = JSON.parse(await getPricing(cafe.id, { date: nextSaturday() }));

    expect(result.effective.multiplier).toBe(1.2);
    expect(result.effective.label).toBe('Cuối tuần');
    expect(result.effective.pricePerSlot).toContain('60.000');
  });

  it('nêu được giờ cao điểm kèm giá đã nhân, để bot giải thích cho khách', async () => {
    const cafe = await createTestCafe({ slot_fee_rate: 50000 });
    await addPeakRule(cafe.id, '17:00', '20:00', 1.5);

    const result = JSON.parse(await getPricing(cafe.id, { date: nextWednesday() }));

    const peak = result.rules.find((r: { label: string }) => r.label.includes('17:00'));
    expect(peak).toBeDefined();
    expect(peak.multiplier).toBe(1.5);
    expect(peak.pricePerSlot).toContain('75.000');
  });

  it('hỏi đúng khung giờ cao điểm thì giá hiệu lực là giá đã nhân', async () => {
    const cafe = await createTestCafe({ slot_fee_rate: 50000 });
    await addPeakRule(cafe.id, '17:00', '20:00', 1.5);

    const result = JSON.parse(await getPricing(cafe.id, { date: nextWednesday(), time: '18:00' }));

    expect(result.effective.multiplier).toBe(1.5);
    expect(result.effective.pricePerSlot).toContain('75.000');
  });

  it('ngày lễ riêng của quán được nêu trong danh sách quy tắc', async () => {
    const cafe = await createTestCafe({ slot_fee_rate: 50000 });
    const date = nextWednesday();
    await addCustomHoliday(cafe.id, date, 'Khai trương sân mới', 2.0);

    const result = JSON.parse(await getPricing(cafe.id, { date }));

    expect(result.effective.multiplier).toBe(2);
    expect(result.effective.label).toContain('Khai trương sân mới');
    expect(result.effective.pricePerSlot).toContain('100.000');
  });

  it('nói rõ phí sân tính theo từng người và không cộng dồn hệ số', async () => {
    const cafe = await createTestCafe({ slot_fee_rate: 50000 });
    await addWeekendRule(cafe.id, 1.2);
    await addPeakRule(cafe.id, '17:00', '20:00', 1.5);

    const result = JSON.parse(await getPricing(cafe.id, { date: nextSaturday(), time: '18:00' }));

    // Hai luật cùng khớp — luật cao nhất thắng, KHÔNG nhân 1.2 × 1.5.
    expect(result.effective.multiplier).toBe(1.5);

    const text = JSON.stringify(result);
    expect(text).toContain('người');
    expect(text).toContain('BYOC');
  });
});

describe('check_availability — kèm giá từng khung giờ', () => {
  it('trả giá gốc của buổi chơi cùng danh sách giờ trống', async () => {
    const cafe = await createTestCafe({ slot_fee_rate: 50000 });

    const result = JSON.parse(await checkAvailability(cafe.id, { date: tomorrow() }));

    expect(result.available).toBe(true);
    expect(result.pricing.basePricePerSlot).toContain('50.000');
  });

  it('giờ cao điểm hiện giá khác, giờ thường không lặp lại giá gốc', async () => {
    const cafe = await createTestCafe({ slot_fee_rate: 50000 });
    await addPeakRule(cafe.id, '17:00', '20:00', 1.5);

    const result = JSON.parse(await checkAvailability(cafe.id, { date: tomorrow() }));

    expect(result.pricing.priceByTime['17:00']).toContain('75.000');
    expect(result.pricing.priceByTime['19:00']).toContain('75.000');
    // Giờ theo giá gốc không được liệt kê — nếu liệt kê hết thì kết quả phình to
    // vô ích và model dễ đọc nhầm giá gốc thành giá đặc biệt.
    expect(result.pricing.priceByTime['10:00']).toBeUndefined();
  });
});

describe('get_vehicles — tách bạch phí thuê xe với phí sân', () => {
  it('nói rõ phí thuê xe là khoản cộng thêm, không phải giá trọn gói', async () => {
    const cafe = await createTestCafe({ slot_fee_rate: 50000 });
    await createTestVehicle({ cafe_id: cafe.id });

    const result = JSON.parse(await getVehicles(cafe.id));

    expect(result.vehicles).toHaveLength(1);
    expect(result.note).toMatch(/cộng thêm|chưa bao gồm/i);
    expect(result.note).toContain('phí sân');
  });
});
