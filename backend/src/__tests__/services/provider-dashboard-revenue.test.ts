import { AppDataSource } from '../../config/database';
import {
  getProviderBranchPerformance,
  getProviderKpi,
  getProviderRevenueBreakdown,
  getProviderRevenueTrend,
} from '../../services/provider-dashboard.service';
import { UserRole } from '../../types';
import { createTestCafe, createTestUser } from '../helpers';

/**
 * Doanh thu trên dashboard chủ sân.
 *
 * Ba lỗi cùng một họ đã từng tồn tại ở đây, và không lỗi nào làm hỏng gì lúc
 * chạy — chúng chỉ khiến các con số trên cùng một màn hình mâu thuẫn nhau:
 *
 *  1. Ô "Tổng doanh thu" chỉ đọc từ booking, trong khi biểu đồ phân bổ ngay bên
 *     cạnh còn cộng thêm tiền bán gói. Tổng nhỏ hơn hẳn tổng các lát của chính
 *     biểu đồ đó.
 *  2. Phí dự giải không xuất hiện ở bất kỳ đâu — nó không được ghi vào bảng
 *     `payment_components`, mà mọi query doanh thu lại chỉ đọc từ bảng đó.
 *  3. Doanh thu lọc theo NGÀY CHƠI (`bookings.slot_start`) chứ không phải ngày
 *     thu tiền, nên không đối chiếu được với sao kê ngân hàng.
 *
 * Loại lỗi này không có gì báo. Người dùng chỉ thấy hai con số lệch nhau và
 * không biết tin cái nào — nên phải canh ở tầng test.
 */

const NGAY_THU = '2026-07-10T10:00:00Z';
const NGAY_CHOI = '2026-09-20T10:00:00Z';
const THANG_7 = { from: '2026-07-01T00:00:00Z', to: '2026-07-31T23:59:59Z' };

async function dungChuSan() {
  const provider = await createTestUser({ role: UserRole.PROVIDER });
  const cafe = await createTestCafe({ provider_id: provider.id });
  return { providerId: provider.id, cafeId: cafe.id };
}

/**
 * Một booking đã thanh toán.
 *
 * `paidAt` và `slotStart` cố ý tách rời: đó chính là tình huống làm lộ ra lỗi
 * thứ 3 — khách trả tiền tháng 7 cho suất chơi tháng 9.
 */
async function themBookingDaTra(opts: {
  cafeId: string;
  amount: number;
  paidAt: string;
  slotStart: string;
  type?: string;
}): Promise<string> {
  const customer = await createTestUser({ role: UserRole.CUSTOMER });
  const [trackType] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM track_types ORDER BY created_at ASC LIMIT 1`,
  );
  const [booking] = await AppDataSource.query<{ id: string }[]>(
    `INSERT INTO bookings
       (customer_id, cafe_id, track_type_id, play_mode, status, slot_start, slot_end,
        payment_expires_at, snapshot)
     VALUES ($1, $2, $3, 'BYOC', 'CONFIRMED', $4::timestamptz,
             $4::timestamptz + INTERVAL '1 hour', $4::timestamptz, $5)
     RETURNING id`,
    [customer.id, opts.cafeId, trackType.id, opts.slotStart, JSON.stringify({})],
  );

  const [comp] = await AppDataSource.query<{ id: string }[]>(
    `INSERT INTO payment_components (booking_id, type, amount, status)
     VALUES ($1, $2, $3, 'HELD') RETURNING id`,
    [booking.id, opts.type ?? 'SLOT_FEE', opts.amount],
  );
  // Ép mốc thu tiền: cột này do Postgres tự đặt bằng NOW() lúc chèn, mà nó lại
  // chính là mốc mọi query doanh thu lọc theo.
  await AppDataSource.query(`UPDATE payment_components SET created_at = $2 WHERE id = $1`, [
    comp.id,
    opts.paidAt,
  ]);
  return booking.id;
}

async function themGoiDaBan(opts: { cafeId: string; amount: number; muaLuc: string }) {
  const customer = await createTestUser({ role: UserRole.CUSTOMER });
  // Bảng `packages` bị dọn sạch giữa mỗi test nên phải tự dựng, không SELECT ra
  // được. `code` là duy nhất theo chi nhánh nên gắn thêm id khách cho khỏi đụng.
  const [pkg] = await AppDataSource.query<{ id: string }[]>(
    `INSERT INTO packages (cafe_id, code, name, slot_count, price, valid_days)
     VALUES ($1, $2, 'Gói test', 10, $3, 30) RETURNING id`,
    [opts.cafeId, `PKG_${customer.id.slice(0, 8)}`, opts.amount],
  );
  const [row] = await AppDataSource.query<{ id: string }[]>(
    `INSERT INTO customer_packages
       (customer_id, cafe_id, package_id, package_name_snapshot, purchased_price,
        slots_total, slots_remaining, status, expires_at)
     VALUES ($1, $2, $3, 'Gói test', $4, 10, 10, 'ACTIVE', NOW() + INTERVAL '30 day')
     RETURNING id`,
    [customer.id, opts.cafeId, pkg?.id ?? null, opts.amount],
  );
  await AppDataSource.query(`UPDATE customer_packages SET created_at = $2 WHERE id = $1`, [
    row.id,
    opts.muaLuc,
  ]);
}

async function themGiaiVaPhi(opts: {
  providerId: string;
  cafeId: string;
  amount: number;
  traLuc: string | null;
  paymentStatus: string;
}) {
  const [trackType] = await AppDataSource.query<{ id: string; code: string }[]>(
    `SELECT id, code FROM track_types ORDER BY created_at ASC LIMIT 1`,
  );
  const [contestType] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM contest_types WHERE code = 'PROVIDER_STANDARD' LIMIT 1`,
  );
  const [contestFormat] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM contest_formats WHERE code = 'KNOCKOUT' LIMIT 1`,
  );
  const [contestTemplate] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM contest_templates WHERE contest_format_id = $1 LIMIT 1`,
    [contestFormat.id],
  );
  const [contest] = await AppDataSource.query<{ id: string }[]>(
    `INSERT INTO contests
       (cafe_id, provider_id, name, track_type, track_type_id, contest_type_id,
        contest_format_id, contest_template_id, registration_opens_at, registration_closes_at,
        vehicle_rule, config, starts_at, ends_at, capacity, entry_fee, status, created_by)
     VALUES ($1, $2, 'Giải test doanh thu', $3, $4, $5, $6, $7,
             NOW() - INTERVAL '1 day', NOW() + INTERVAL '5 day', $8, $9,
             NOW() + INTERVAL '7 day', NOW() + INTERVAL '8 day', 32, $10, 'OPEN', $2)
     RETURNING id`,
    [
      opts.cafeId,
      opts.providerId,
      trackType.code,
      trackType.id,
      contestType.id,
      contestFormat.id,
      contestTemplate.id,
      JSON.stringify({ vehicle_policy: 'BYOC_ONLY', assignment_policy: 'AT_CHECK_IN' }),
      JSON.stringify({ format: 'KNOCKOUT', runtime_format: 'KNOCKOUT' }),
      opts.amount,
    ],
  );

  const user = await createTestUser({ role: UserRole.CUSTOMER });
  await AppDataSource.query(
    `INSERT INTO contest_registrations
       (contest_id, user_id, vehicle_source, status, check_in_code,
        payment_status, entry_fee_amount, entry_fee_marked_paid_at)
     VALUES ($1, $2, 'BYOC', 'CONFIRMED', $3, $4, $5, $6::timestamptz)`,
    [
      contest.id,
      user.id,
      `CK${Math.floor(Number(String(opts.amount).slice(0, 4)))}${user.id.slice(0, 4)}`,
      opts.paymentStatus,
      opts.amount,
      opts.traLuc,
    ],
  );
}

describe('doanh thu dashboard: mốc thời gian là NGÀY THU TIỀN', () => {
  it('tính vào kỳ khách trả tiền, không phải kỳ khách chơi', async () => {
    // Khách trả tháng 7 cho suất chơi tháng 9. Lọc theo slot_start thì tháng 7
    // trống trơn, và không cách nào đối chiếu với sao kê ngân hàng tháng 7.
    const { providerId, cafeId } = await dungChuSan();
    await themBookingDaTra({ cafeId, amount: 300_000, paidAt: NGAY_THU, slotStart: NGAY_CHOI });

    const t7 = await getProviderKpi(providerId, THANG_7.from, THANG_7.to);
    const t9 = await getProviderKpi(providerId, '2026-09-01T00:00:00Z', '2026-09-30T23:59:59Z');

    expect(t7.totalRevenue).toBe(300_000);
    expect(t9.totalRevenue).toBe(0);
  });

  it('biểu đồ xu hướng cũng theo ngày thu, không lệch khỏi ô tổng', async () => {
    const { providerId, cafeId } = await dungChuSan();
    await themBookingDaTra({ cafeId, amount: 300_000, paidAt: NGAY_THU, slotStart: NGAY_CHOI });

    const trend = await getProviderRevenueTrend(providerId, 'daily', THANG_7.from, THANG_7.to);
    const tong = trend.reduce((s, t) => s + t.total, 0);

    expect(tong).toBe(300_000);
  });
});

describe('doanh thu dashboard: đủ ba nguồn', () => {
  it('tổng gồm cả tiền bán gói và phí dự giải', async () => {
    // Trước đây ô tổng chỉ đọc booking: 500k thay vì 900k, trong khi biểu đồ
    // bên cạnh vẫn vẽ ra miếng "Phí gói" 300k — hai con số cãi nhau.
    const { providerId, cafeId } = await dungChuSan();
    await themBookingDaTra({ cafeId, amount: 500_000, paidAt: NGAY_THU, slotStart: NGAY_THU });
    await themGoiDaBan({ cafeId, amount: 300_000, muaLuc: NGAY_THU });
    await themGiaiVaPhi({
      providerId,
      cafeId,
      amount: 100_000,
      traLuc: NGAY_THU,
      paymentStatus: 'MARKED_PAID',
    });

    const kpi = await getProviderKpi(providerId, THANG_7.from, THANG_7.to);

    expect(kpi.totalRevenue).toBe(900_000);
  });

  it('ô tổng bằng đúng tổng các lát của biểu đồ phân bổ', async () => {
    // Đây là ràng buộc quan trọng nhất: hai con số này nằm cạnh nhau trên màn
    // hình, người dùng cộng nhẩm được, và lệch một đồng là mất lòng tin.
    const { providerId, cafeId } = await dungChuSan();
    await themBookingDaTra({ cafeId, amount: 500_000, paidAt: NGAY_THU, slotStart: NGAY_THU });
    await themGoiDaBan({ cafeId, amount: 300_000, muaLuc: NGAY_THU });
    await themGiaiVaPhi({
      providerId,
      cafeId,
      amount: 100_000,
      traLuc: NGAY_THU,
      paymentStatus: 'MARKED_PAID',
    });

    const kpi = await getProviderKpi(providerId, THANG_7.from, THANG_7.to);
    const breakdown = await getProviderRevenueBreakdown(providerId, THANG_7.from, THANG_7.to);
    const tongLat = breakdown.reduce((s, i) => s + i.amount, 0);

    expect(tongLat).toBe(kpi.totalRevenue);
    expect(breakdown.map((i) => i.label).sort()).toEqual(
      ['Phí dự giải', 'Phí gói', 'Phí sân'].sort(),
    );
  });

  it('cộng doanh thu mọi chi nhánh ra đúng tổng chung', async () => {
    const { providerId, cafeId } = await dungChuSan();
    const chiNhanh2 = await createTestCafe({ provider_id: providerId });
    await themBookingDaTra({ cafeId, amount: 500_000, paidAt: NGAY_THU, slotStart: NGAY_THU });
    await themGoiDaBan({ cafeId: chiNhanh2.id, amount: 300_000, muaLuc: NGAY_THU });

    const kpi = await getProviderKpi(providerId, THANG_7.from, THANG_7.to);
    const nhanh = await getProviderBranchPerformance(providerId, THANG_7.from, THANG_7.to);
    const tongNhanh = nhanh.reduce((s, b) => s + b.totalRevenue, 0);

    expect(tongNhanh).toBe(kpi.totalRevenue);
  });

  it('biểu đồ xu hướng cũng cộng đủ ba nguồn', async () => {
    const { providerId, cafeId } = await dungChuSan();
    await themBookingDaTra({ cafeId, amount: 500_000, paidAt: NGAY_THU, slotStart: NGAY_THU });
    await themGoiDaBan({ cafeId, amount: 300_000, muaLuc: NGAY_THU });
    await themGiaiVaPhi({
      providerId,
      cafeId,
      amount: 100_000,
      traLuc: NGAY_THU,
      paymentStatus: 'MARKED_PAID',
    });

    const trend = await getProviderRevenueTrend(providerId, 'daily', THANG_7.from, THANG_7.to);
    const tong = trend.reduce((s, t) => s + t.total, 0);

    expect(tong).toBe(900_000);
    expect(trend.reduce((s, t) => s + t.contestFee, 0)).toBe(100_000);
  });
});

describe('doanh thu dashboard: chỉ tính tiền đã thực thu', () => {
  it('phí giải được miễn hoặc chưa trả thì không tính', async () => {
    // WAIVED là miễn — không có đồng nào vào. PENDING_PAYMENT là chưa trả.
    // Cộng chúng vào là tự tính cho mình doanh thu không tồn tại.
    const { providerId, cafeId } = await dungChuSan();
    await themGiaiVaPhi({
      providerId,
      cafeId,
      amount: 400_000,
      traLuc: NGAY_THU,
      paymentStatus: 'WAIVED',
    });
    await themGiaiVaPhi({
      providerId,
      cafeId,
      amount: 700_000,
      traLuc: null,
      paymentStatus: 'PENDING_PAYMENT',
    });

    const kpi = await getProviderKpi(providerId, THANG_7.from, THANG_7.to);

    expect(kpi.totalRevenue).toBe(0);
  });

  it('không thấy doanh thu của chủ sân khác', async () => {
    const a = await dungChuSan();
    const b = await dungChuSan();
    await themBookingDaTra({
      cafeId: b.cafeId,
      amount: 999_000,
      paidAt: NGAY_THU,
      slotStart: NGAY_THU,
    });
    await themGoiDaBan({ cafeId: b.cafeId, amount: 888_000, muaLuc: NGAY_THU });

    const kpi = await getProviderKpi(a.providerId, THANG_7.from, THANG_7.to);

    expect(kpi.totalRevenue).toBe(0);
  });

  it('tiền cọc cũ không tính vào doanh thu', async () => {
    // Nền tảng đã bỏ cọc, nhưng dữ liệu cũ vẫn còn bản ghi loại này. Cọc là
    // tiền giữ hộ, hoàn lại cho khách — không phải doanh thu.
    const { providerId, cafeId } = await dungChuSan();
    await themBookingDaTra({
      cafeId,
      amount: 250_000,
      paidAt: NGAY_THU,
      slotStart: NGAY_THU,
      type: 'SECURITY_DEPOSIT',
    });

    const kpi = await getProviderKpi(providerId, THANG_7.from, THANG_7.to);

    expect(kpi.totalRevenue).toBe(0);
  });
});
