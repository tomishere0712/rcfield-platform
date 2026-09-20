import { AppDataSource } from '../config/database';
import { CafeOperatingHours } from '../types';
import {
  getBookableSlotMinutes,
  getOccupancyRate,
  getVietnamCurrentMonthToDateRange,
} from '../lib/provider-occupancy';
import { SESSION_OVERDUE_ALERT_MINUTES } from '../lib/session-operational-timing';

export interface ProviderKpi {
  totalRevenue: number;
  totalBookings: number;
  completedBookings: number;
  cancellationRate: number;
  vehicleUtilizationRate: number;
  totalVehicles: number;
  inUseVehicles: number;
  availableVehicles: number;
  maintenanceVehicles: number;
  newCustomers: number;
}

export interface RevenueTrendItem {
  label: string;
  slotFee: number;
  rentalFee: number;
  fnbPreorder: number;
  extensionFee: number;
  damageCharge: number;
  packageFee: number;
  contestFee: number;
  total: number;
}

export interface RevenueBreakdownItem {
  type: string;
  label: string;
  amount: number;
}

export interface BranchPerformanceItem {
  cafeId: string;
  cafeName: string;
  totalRevenue: number;
  bookingCount: number;
}

export interface BranchOperationsItem {
  cafeId: string;
  cafeName: string;
  cafeStatus: string;
  totalRevenue: number;
  bookingCount: number;
  occupiedSlotMinutes: number;
  bookableSlotMinutes: number;
  occupancyRate: number | null;
  totalVehicles: number;
  inUseVehicles: number;
  availableVehicles: number;
  maintenanceVehicles: number;
  overdueSessionCount: number;
  operationalAlertCount: number;
}

export interface RecentBookingItem {
  bookingId: string;
  cafeName: string;
  customerName: string;
  playMode: string;
  slotStart: string;
  status: string;
  totalCharged: number;
}

/**
 * Doanh thu của chủ sân — định nghĩa dùng chung cho MỌI con số trên dashboard.
 *
 * ── Mốc thời gian: NGÀY THU TIỀN ────────────────────────────────────────────
 *
 * Trước đây các query lọc theo `bookings.slot_start`, tức là gán doanh thu vào
 * NGÀY KHÁCH CHƠI. Khách trả tiền ngày 17/08 cho suất ngày 25/08 thì tiền rơi
 * vào tháng khác với lúc nó thực sự vào tài khoản — và không cách nào đối chiếu
 * được với sao kê ngân hàng hay báo cáo cổng thanh toán.
 *
 * Giờ lọc theo `payment_components.created_at`. Các thành phần này được tạo
 * TRONG luồng xác nhận thanh toán (`createPaymentComponents`, gọi từ 5 nhánh
 * đều nằm sau khi thanh toán thành công), nên `created_at` chính là mốc tiền
 * vào. Với khoản phát sinh tại quầy (gia hạn, hư hỏng, đồ ăn thêm) thì đó là
 * lúc ghi khoản thu, trùng với lúc thu ở luồng bình thường.
 *
 * ── Ba nguồn, không phải một ────────────────────────────────────────────────
 *
 * Trước đây `getProviderKpi` chỉ đọc `bookings JOIN payment_components`, trong
 * khi biểu đồ phân bổ lại cộng thêm tiền bán gói bằng một query riêng. Kết quả:
 * ô "Tổng doanh thu" nhỏ hơn hẳn tổng các lát của chính biểu đồ ngay bên cạnh,
 * mà không có gì giải thích.
 *
 * Ba nguồn phải xuất hiện ở CẢ BA nơi (KPI, phân bổ, xu hướng):
 *
 *  1. Thành phần thanh toán gắn với booking — phí sân, thuê xe, đồ ăn, gia hạn,
 *     bồi thường.
 *  2. Tiền bán gói (`customer_packages`) — không gắn booking nào.
 *  3. Phí dự giải (`contest_registrations`) — cũng không gắn booking.
 *
 * ⚠️ Phí dự giải KHÔNG có trong bảng `payment_components`. Enum có giá trị
 * `CONTEST_ENTRY_FEE`, có cả migration thêm nó vào Postgres, nhưng không dòng
 * code nào ghi bản ghi loại đó — nó chỉ được dựng trên đường trả về API để in
 * biên lai. Nên phải đọc thẳng từ `contest_registrations`, giống cách đang làm
 * với tiền bán gói. Đổi lại thì phải sửa luồng thanh toán và backfill dữ liệu
 * cũ, đắt hơn nhiều mà không được thêm gì.
 */

/** Điều kiện lọc chung cho tiền bán gói, dùng ở cả ba hàm. */
const PACKAGE_REVENUE_WHERE = `
  c.provider_id = $1
  AND cp.status IN ('ACTIVE', 'EXHAUSTED')
  AND cp.created_at >= $2::timestamptz
  AND cp.created_at <= $3::timestamptz
  AND ($4::uuid IS NULL OR cp.cafe_id = $4)
`;

/**
 * Điều kiện lọc chung cho phí dự giải.
 *
 * Chỉ tính `MARKED_PAID` — `WAIVED` là được miễn (không có tiền), còn
 * `PENDING_PAYMENT` là chưa trả. Mốc thời gian dùng `entry_fee_marked_paid_at`
 * chứ không phải `created_at` của đăng ký: đăng ký từ tháng trước mà tháng này
 * mới trả tiền thì tiền thuộc về tháng này.
 */
const CONTEST_FEE_WHERE = `
  c.provider_id = $1
  AND cr.payment_status = 'MARKED_PAID'
  AND cr.entry_fee_amount > 0
  AND cr.entry_fee_marked_paid_at >= $2::timestamptz
  AND cr.entry_fee_marked_paid_at <= $3::timestamptz
  AND ($4::uuid IS NULL OR ct.cafe_id = $4)
`;

const CONTEST_FEE_FROM = `
  FROM contest_registrations cr
  JOIN contests ct ON ct.id = cr.contest_id
  JOIN cafes c ON c.id = ct.cafe_id AND c.deleted_at IS NULL
`;

export async function getProviderKpi(
  providerId: string,
  from?: string,
  to?: string,
  cafeId?: string,
): Promise<ProviderKpi> {
  const fromDate = from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const toDate = to || new Date().toISOString();

  // 1a. Tiền thu từ booking — lọc theo NGÀY THU, xem chú thích đầu tệp.
  const revenueRes = await AppDataSource.query<[{ totalRevenue: string }]>(
    `SELECT COALESCE(SUM(
      CASE
        WHEN pc.status IN ('HELD', 'DISBURSED') THEN pc.amount
        WHEN pc.status = 'PARTIALLY_REFUNDED' THEN (pc.amount - COALESCE(pc.refunded_amount, 0))
        ELSE 0
      END
    ), 0)::float AS "totalRevenue"
    FROM bookings b
    JOIN payment_components pc ON pc.booking_id = b.id
    JOIN cafes c ON c.id = b.cafe_id
    WHERE c.provider_id = $1
      AND pc.status IN ('HELD', 'DISBURSED', 'PARTIALLY_REFUNDED')
      AND pc.type != 'SECURITY_DEPOSIT'
      AND pc.created_at >= $2::timestamptz
      AND pc.created_at <= $3::timestamptz
      AND ($4::uuid IS NULL OR b.cafe_id = $4)`,
    [providerId, fromDate, toDate, cafeId || null],
  );

  // 1b. Tiền bán gói và phí dự giải — hai nguồn không gắn booking nào. Thiếu
  // chúng thì ô "Tổng doanh thu" nhỏ hơn tổng các lát của biểu đồ ngay bên cạnh.
  const [pkgRes, contestRes] = await Promise.all([
    AppDataSource.query<[{ amount: string }]>(
      `SELECT COALESCE(SUM(cp.purchased_price), 0)::float AS "amount"
       FROM customer_packages cp
       JOIN cafes c ON c.id = cp.cafe_id
       WHERE ${PACKAGE_REVENUE_WHERE}`,
      [providerId, fromDate, toDate, cafeId || null],
    ),
    AppDataSource.query<[{ amount: string }]>(
      `SELECT COALESCE(SUM(cr.entry_fee_amount), 0)::float AS "amount"
       ${CONTEST_FEE_FROM}
       WHERE ${CONTEST_FEE_WHERE}`,
      [providerId, fromDate, toDate, cafeId || null],
    ),
  ]);

  // 1c. Booking hoàn tất — vẫn đếm theo NGÀY CHƠI, không phải ngày thu.
  // Đây là con số vận hành ("hôm nay chạy được mấy suất"), không phải con số
  // tiền, nên nó thuộc về ngày diễn ra buổi chơi.
  const completedRes = await AppDataSource.query<[{ completedBookings: string }]>(
    `SELECT COUNT(DISTINCT b.id)::int AS "completedBookings"
     FROM bookings b
     JOIN cafes c ON c.id = b.cafe_id
     WHERE c.provider_id = $1
       AND b.status = 'COMPLETED'
       AND b.slot_start >= $2::timestamptz
       AND b.slot_start <= $3::timestamptz
       AND ($4::uuid IS NULL OR b.cafe_id = $4)`,
    [providerId, fromDate, toDate, cafeId || null],
  );

  // 2. Tổng booking và cancellation rate
  const bookingsRes = await AppDataSource.query<
    [{ totalBookings: string; cancellationRate: string }]
  >(
    `SELECT
      COUNT(b.id)::int AS "totalBookings",
      COALESCE(
        COUNT(CASE WHEN b.status = 'CANCELLED' THEN 1 END)::float / NULLIF(COUNT(b.id), 0),
        0
      )::float AS "cancellationRate"
    FROM bookings b
    JOIN cafes c ON c.id = b.cafe_id
    WHERE c.provider_id = $1
      AND b.slot_start >= $2::timestamptz
      AND b.slot_start <= $3::timestamptz
      AND ($4::uuid IS NULL OR b.cafe_id = $4)`,
    [providerId, fromDate, toDate, cafeId || null],
  );

  // 3. Fleet status
  const fleetRes = await AppDataSource.query<
    [
      {
        totalVehicles: string;
        inUseVehicles: string;
        availableVehicles: string;
        maintenanceVehicles: string;
      },
    ]
  >(
    `SELECT
      COUNT(CASE WHEN v.status != 'RETIRED' THEN 1 END)::int AS "totalVehicles",
      COUNT(CASE WHEN v.status = 'IN_USE' THEN 1 END)::int AS "inUseVehicles",
      COUNT(CASE WHEN v.status = 'AVAILABLE' THEN 1 END)::int AS "availableVehicles",
      COUNT(CASE WHEN v.status = 'MAINTENANCE' THEN 1 END)::int AS "maintenanceVehicles"
    FROM vehicles v
    JOIN cafes c ON c.id = v.cafe_id
    WHERE c.provider_id = $1
      AND ($2::uuid IS NULL OR v.cafe_id = $2)
      AND v.deleted_at IS NULL`,
    [providerId, cafeId || null],
  );

  // 4. Khách hàng mới (lần đầu đặt lịch trong khoảng thời gian này trên toàn bộ chi nhánh của provider)
  const customersRes = await AppDataSource.query<[{ newCustomers: string }]>(
    `SELECT COUNT(DISTINCT cb.customer_id)::int AS "newCustomers"
     FROM (
       SELECT b.customer_id, MIN(b.slot_start) as first_booking
       FROM bookings b
       JOIN cafes c ON c.id = b.cafe_id
       WHERE c.provider_id = $1
         AND ($2::uuid IS NULL OR b.cafe_id = $2)
       GROUP BY b.customer_id
     ) cb
     WHERE cb.first_booking >= $3::timestamptz AND cb.first_booking <= $4::timestamptz`,
    [providerId, cafeId || null, fromDate, toDate],
  );

  const totalRevenue =
    Number(revenueRes[0]?.totalRevenue ?? 0) +
    Number(pkgRes[0]?.amount ?? 0) +
    Number(contestRes[0]?.amount ?? 0);
  const completedBookings = Number(completedRes[0]?.completedBookings ?? 0);
  const totalBookings = Number(bookingsRes[0]?.totalBookings ?? 0);
  const cancellationRate = Number(bookingsRes[0]?.cancellationRate ?? 0);

  const totalVehicles = Number(fleetRes[0]?.totalVehicles ?? 0);
  const inUseVehicles = Number(fleetRes[0]?.inUseVehicles ?? 0);
  const availableVehicles = Number(fleetRes[0]?.availableVehicles ?? 0);
  const maintenanceVehicles = Number(fleetRes[0]?.maintenanceVehicles ?? 0);

  const vehicleUtilizationRate = totalVehicles > 0 ? inUseVehicles / totalVehicles : 0;
  const newCustomers = Number(customersRes[0]?.newCustomers ?? 0);

  return {
    totalRevenue,
    totalBookings,
    completedBookings,
    cancellationRate,
    vehicleUtilizationRate,
    totalVehicles,
    inUseVehicles,
    availableVehicles,
    maintenanceVehicles,
    newCustomers,
  };
}

export async function getProviderRevenueTrend(
  providerId: string,
  period: 'daily' | 'weekly' | 'monthly',
  from?: string,
  to?: string,
  cafeId?: string,
): Promise<RevenueTrendItem[]> {
  const fromDate = from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const toDate = to || new Date().toISOString();

  let groupFormat = 'DD/MM';
  let truncUnit = 'day';

  if (period === 'weekly') {
    groupFormat = 'IW/IYYY';
    truncUnit = 'week';
  } else if (period === 'monthly') {
    groupFormat = 'MM/YYYY';
    truncUnit = 'month';
  }

  // Dùng generate_series để tạo đủ tất cả nhãn thời gian trong khoảng,
  // sau đó LEFT JOIN với dữ liệu thực tế → các khoảng không có booking sẽ được fill 0.
  const intervalUnit =
    truncUnit === 'week' ? '1 week' : truncUnit === 'month' ? '1 month' : '1 day';

  const query = `
    WITH series AS (
      SELECT generate_series(
        DATE_TRUNC($2, $4::timestamptz),
        DATE_TRUNC($2, $5::timestamptz),
        $7::interval
      ) AS period_start
    ),
    booking_revenue AS (
      SELECT
        DATE_TRUNC($2, pc.created_at) AS period,
        COALESCE(SUM(CASE WHEN pc.type = 'SLOT_FEE' THEN (CASE WHEN pc.status = 'PARTIALLY_REFUNDED' THEN pc.amount - COALESCE(pc.refunded_amount, 0) ELSE pc.amount END) END), 0)::float       AS "slotFee",
        COALESCE(SUM(CASE WHEN pc.type = 'RENTAL_FEE' THEN (CASE WHEN pc.status = 'PARTIALLY_REFUNDED' THEN pc.amount - COALESCE(pc.refunded_amount, 0) ELSE pc.amount END) END), 0)::float     AS "rentalFee",
        COALESCE(SUM(CASE WHEN pc.type IN ('FNB_PREORDER', 'FNB_ON_SITE') THEN (CASE WHEN pc.status = 'PARTIALLY_REFUNDED' THEN pc.amount - COALESCE(pc.refunded_amount, 0) ELSE pc.amount END) END), 0)::float AS "fnbPreorder",
        COALESCE(SUM(CASE WHEN pc.type = 'EXTENSION_FEE' THEN pc.amount END), 0)::float  AS "extensionFee",
        COALESCE(SUM(CASE WHEN pc.type = 'DAMAGE_CHARGE' THEN pc.amount END), 0)::float  AS "damageCharge"
      FROM bookings b
      JOIN payment_components pc ON pc.booking_id = b.id
      JOIN cafes c ON c.id = b.cafe_id
      WHERE c.provider_id = $3
        AND pc.status IN ('HELD', 'DISBURSED', 'PARTIALLY_REFUNDED')
        AND pc.type != 'SECURITY_DEPOSIT'
        AND pc.created_at >= $4::timestamptz
        AND pc.created_at <= $5::timestamptz
        AND ($6::uuid IS NULL OR b.cafe_id = $6::uuid)
      GROUP BY DATE_TRUNC($2, pc.created_at)
    )
    SELECT
      TO_CHAR(s.period_start, $1)           AS "label",
      COALESCE(br."slotFee", 0)             AS "slotFee",
      COALESCE(br."rentalFee", 0)           AS "rentalFee",
      COALESCE(br."fnbPreorder", 0)         AS "fnbPreorder",
      COALESCE(br."extensionFee", 0)        AS "extensionFee",
      COALESCE(br."damageCharge", 0)        AS "damageCharge",
      s.period_start                        AS "trunc_date"
    FROM series s
    LEFT JOIN booking_revenue br ON br.period = s.period_start
    ORDER BY s.period_start ASC
  `;

  const rows = await AppDataSource.query<
    {
      label: string;
      slotFee: number;
      rentalFee: number;
      fnbPreorder: number;
      extensionFee: number;
      damageCharge: number;
    }[]
  >(query, [groupFormat, truncUnit, providerId, fromDate, toDate, cafeId || null, intervalUnit]);

  // Query package purchases trend — cũng dùng generate_series để fill 0 đủ kỳ
  const pkgQuery = `
    WITH series AS (
      SELECT generate_series(
        DATE_TRUNC($2, $3::timestamptz),
        DATE_TRUNC($2, $4::timestamptz),
        $6::interval
      ) AS period_start
    ),
    pkg_revenue AS (
      SELECT
        DATE_TRUNC($2, cp.created_at) AS period,
        COALESCE(SUM(cp.purchased_price), 0)::float AS "packageFee"
      FROM customer_packages cp
      JOIN cafes c ON c.id = cp.cafe_id
      WHERE c.provider_id = $1
        AND cp.status IN ('ACTIVE', 'EXHAUSTED')
        AND cp.created_at >= $3::timestamptz
        AND cp.created_at <= $4::timestamptz
        AND ($5::uuid IS NULL OR cp.cafe_id = $5::uuid)
      GROUP BY DATE_TRUNC($2, cp.created_at)
    )
    SELECT
      TO_CHAR(s.period_start, $7) AS "label",
      COALESCE(pr."packageFee", 0) AS "packageFee"
    FROM series s
    LEFT JOIN pkg_revenue pr ON pr.period = s.period_start
    ORDER BY s.period_start ASC
  `;

  // Phí dự giải theo kỳ — cùng khuôn với query gói ở trên.
  const contestQuery = `
    WITH series AS (
      SELECT generate_series(
        DATE_TRUNC($2, $3::timestamptz),
        DATE_TRUNC($2, $4::timestamptz),
        $6::interval
      ) AS period_start
    ),
    contest_revenue AS (
      SELECT
        DATE_TRUNC($2, cr.entry_fee_marked_paid_at) AS period,
        COALESCE(SUM(cr.entry_fee_amount), 0)::float AS "contestFee"
      ${CONTEST_FEE_FROM}
      WHERE c.provider_id = $1
        AND cr.payment_status = 'MARKED_PAID'
        AND cr.entry_fee_amount > 0
        AND cr.entry_fee_marked_paid_at >= $3::timestamptz
        AND cr.entry_fee_marked_paid_at <= $4::timestamptz
        AND ($5::uuid IS NULL OR ct.cafe_id = $5::uuid)
      GROUP BY DATE_TRUNC($2, cr.entry_fee_marked_paid_at)
    )
    SELECT
      TO_CHAR(s.period_start, $7) AS "label",
      COALESCE(cx."contestFee", 0) AS "contestFee"
    FROM series s
    LEFT JOIN contest_revenue cx ON cx.period = s.period_start
    ORDER BY s.period_start ASC
  `;

  const [pkgTrendRows, contestTrendRows] = await Promise.all([
    AppDataSource.query<{ label: string; packageFee: number }[]>(pkgQuery, [
      providerId,
      truncUnit,
      fromDate,
      toDate,
      cafeId || null,
      intervalUnit,
      groupFormat,
    ]),
    AppDataSource.query<{ label: string; contestFee: number }[]>(contestQuery, [
      providerId,
      truncUnit,
      fromDate,
      toDate,
      cafeId || null,
      intervalUnit,
      groupFormat,
    ]),
  ]);
  const pkgMap = new Map(pkgTrendRows.map((r) => [r.label, Number(r.packageFee)]));
  const contestMap = new Map(contestTrendRows.map((r) => [r.label, Number(r.contestFee)]));

  // Lấy tập nhãn từ series chính (đã đủ tất cả khoảng), merge packageFee
  return rows.map((row) => {
    const packageFee = pkgMap.get(row.label) || 0;
    const contestFee = contestMap.get(row.label) || 0;
    const slotFee = Number(row.slotFee);
    const rentalFee = Number(row.rentalFee);
    const fnbPreorder = Number(row.fnbPreorder);
    const extensionFee = Number(row.extensionFee);
    const damageCharge = Number(row.damageCharge);

    return {
      label: row.label,
      slotFee,
      rentalFee,
      fnbPreorder,
      extensionFee,
      damageCharge,
      packageFee,
      contestFee,
      total:
        slotFee + rentalFee + fnbPreorder + extensionFee + damageCharge + packageFee + contestFee,
    };
  });
}

export async function getProviderRevenueBreakdown(
  providerId: string,
  from?: string,
  to?: string,
  cafeId?: string,
): Promise<RevenueBreakdownItem[]> {
  const fromDate = from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const toDate = to || new Date().toISOString();

  const query = `
    SELECT
      CASE
        WHEN pc.type IN ('FNB_PREORDER', 'FNB_ON_SITE') THEN 'FNB_PREORDER'
        ELSE pc.type
      END AS "type",
      CASE
        WHEN pc.type = 'SLOT_FEE' THEN 'Phí sân'
        WHEN pc.type = 'RENTAL_FEE' THEN 'Thuê xe'
        WHEN pc.type IN ('FNB_PREORDER', 'FNB_ON_SITE') THEN 'F&B'
        WHEN pc.type = 'EXTENSION_FEE' THEN 'Phí gia hạn'
        WHEN pc.type = 'DAMAGE_CHARGE' THEN 'Phí bồi thường'
        ELSE pc.type::text
      END AS "label",
      COALESCE(SUM(
        CASE
          WHEN pc.status = 'PARTIALLY_REFUNDED' THEN pc.amount - COALESCE(pc.refunded_amount, 0)
          ELSE pc.amount
        END
      ), 0)::float AS "amount"
    FROM bookings b
    JOIN payment_components pc ON pc.booking_id = b.id
    JOIN cafes c ON c.id = b.cafe_id
    WHERE c.provider_id = $1
      AND pc.status IN ('HELD', 'DISBURSED', 'PARTIALLY_REFUNDED')
      AND pc.type != 'SECURITY_DEPOSIT'
      AND pc.created_at >= $2::timestamptz
      AND pc.created_at <= $3::timestamptz
      AND ($4::uuid IS NULL OR b.cafe_id = $4)
    GROUP BY
      CASE
        WHEN pc.type IN ('FNB_PREORDER', 'FNB_ON_SITE') THEN 'FNB_PREORDER'
        ELSE pc.type
      END,
      CASE
        WHEN pc.type = 'SLOT_FEE' THEN 'Phí sân'
        WHEN pc.type = 'RENTAL_FEE' THEN 'Thuê xe'
        WHEN pc.type IN ('FNB_PREORDER', 'FNB_ON_SITE') THEN 'F&B'
        WHEN pc.type = 'EXTENSION_FEE' THEN 'Phí gia hạn'
        WHEN pc.type = 'DAMAGE_CHARGE' THEN 'Phí bồi thường'
        ELSE pc.type::text
      END
  `;

  const rows = await AppDataSource.query<
    {
      type: string;
      label: string;
      amount: number;
    }[]
  >(query, [providerId, fromDate, toDate, cafeId || null]);

  const items: RevenueBreakdownItem[] = rows.map((row) => ({
    type: row.type,
    label: row.label,
    amount: Number(row.amount),
  }));

  // Hai nguồn không gắn booking nào, phải hỏi riêng từng bảng.
  const [pkgRes, contestRes] = await Promise.all([
    AppDataSource.query<[{ amount: string }]>(
      `SELECT COALESCE(SUM(cp.purchased_price), 0)::float AS "amount"
       FROM customer_packages cp
       JOIN cafes c ON c.id = cp.cafe_id
       WHERE ${PACKAGE_REVENUE_WHERE}`,
      [providerId, fromDate, toDate, cafeId || null],
    ),
    AppDataSource.query<[{ amount: string }]>(
      `SELECT COALESCE(SUM(cr.entry_fee_amount), 0)::float AS "amount"
       ${CONTEST_FEE_FROM}
       WHERE ${CONTEST_FEE_WHERE}`,
      [providerId, fromDate, toDate, cafeId || null],
    ),
  ]);

  const pkgAmount = Number(pkgRes[0]?.amount || 0);
  const contestAmount = Number(contestRes[0]?.amount || 0);

  // Chỉ đẩy vào khi có tiền. Trước đây "Phí gói" luôn được thêm kể cả bằng 0,
  // nên biểu đồ tròn lúc nào cũng có một lát rỗng và phần chú giải thừa một
  // dòng "0 ₫" — người đọc tưởng số liệu bị lỗi.
  if (pkgAmount > 0) {
    items.push({ type: 'PACKAGE_PURCHASE', label: 'Phí gói', amount: pkgAmount });
  }
  if (contestAmount > 0) {
    items.push({ type: 'CONTEST_ENTRY_FEE', label: 'Phí dự giải', amount: contestAmount });
  }

  return items;
}

// ── Kênh đặt lịch ─────────────────────────────────────────────────────────────

export interface BookingChannelItem {
  /** Giá trị enum BookingSource: APP | STAFF_MANUAL | CONTEST */
  source: string;
  label: string;
  bookingCount: number;
  /** Doanh thu đã ghi nhận, KHÔNG tính tiền cọc (giống các KPI doanh thu khác). */
  revenue: number;
  /** Tỉ lệ số đơn trên tổng, 0–1. */
  bookingShare: number;
}

/**
 * Nhãn tiếng Việt cho từng kênh đặt.
 *
 * ⚠️ Hàm bên dưới duyệt theo `Object.keys` của bảng này, KHÔNG duyệt theo enum.
 * Nghĩa là thêm giá trị vào `BookingSource` mà quên khai ở đây thì kênh đó biến
 * mất khỏi báo cáo — không báo lỗi, chỉ lặng lẽ thiếu, và doanh thu của nó
 * không được tính vào đâu cả.
 */
/**
 * Các kênh KHÁCH TÌM ĐẾN chi nhánh.
 *
 * Cố ý KHÔNG có `CONTEST`. Đơn nguồn giải đấu vẫn là một hàng thật trong
 * `bookings` — `contest-rental.service.ts` tạo ra chúng khi vận động viên thuê
 * xe của quán — nhưng chúng không phải một kênh đặt lịch: không ai mở app rồi
 * chọn "đặt qua giải đấu". Chúng là hệ quả của việc đăng ký thi đấu, và tiền
 * của chúng đã có sổ riêng ở báo cáo tài chính từng giải.
 *
 * Để lẫn vào đây thì bảng trả lời sai câu hỏi nó đặt ra ("khách tự đặt qua app
 * hay nhân viên tạo tại quầy"), và tỷ lệ phần trăm của các kênh thật bị pha
 * loãng bởi một thứ không cạnh tranh với chúng.
 */
const BOOKING_SOURCE_LABELS: Record<string, string> = {
  APP: 'Khách tự đặt qua app',
  STAFF_MANUAL: 'Nhân viên tạo (khách vãng lai)',
  FACEBOOK: 'Facebook Messenger',
};

/**
 * Cơ cấu đơn đặt theo kênh — trả lời câu hỏi "khách tự đặt qua app nhiều hơn
 * hay khách vãng lai nhiều hơn".
 *
 * Đơn bị hủy vẫn được đếm vào `bookingCount` vì chúng phản ánh nhu cầu đến từ
 * kênh nào; nhưng `revenue` chỉ cộng khoản đã ghi nhận nên đơn hủy không làm
 * sai lệch tiền. Luôn trả về đủ 3 kênh, kể cả kênh chưa có đơn nào — để biểu đồ
 * không nhảy cột khi một kênh về 0.
 */
export async function getProviderBookingChannels(
  providerId: string,
  from?: string,
  to?: string,
  cafeId?: string,
): Promise<BookingChannelItem[]> {
  const fromDate = from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const toDate = to || new Date().toISOString();

  const rows = await AppDataSource.query<
    { source: string; bookingCount: string; revenue: string }[]
  >(
    `SELECT
       b.source AS "source",
       COUNT(DISTINCT b.id)::int AS "bookingCount",
       COALESCE(SUM(
         CASE
           WHEN pc.status = 'PARTIALLY_REFUNDED' THEN pc.amount - COALESCE(pc.refunded_amount, 0)
           ELSE pc.amount
         END
       ) FILTER (
         WHERE pc.status IN ('HELD', 'DISBURSED', 'PARTIALLY_REFUNDED') AND pc.type != 'SECURITY_DEPOSIT'
       ), 0)::float AS "revenue"
     FROM bookings b
     JOIN cafes c ON c.id = b.cafe_id
     LEFT JOIN payment_components pc ON pc.booking_id = b.id
     WHERE c.provider_id = $1
       AND b.slot_start >= $2::timestamptz
       AND b.slot_start <= $3::timestamptz
       AND ($4::uuid IS NULL OR b.cafe_id = $4)
       -- Loại đơn giải đấu khỏi CẢ tử số lẫn mẫu số. Chỉ ẩn hàng mà vẫn đếm
       -- vào tổng thì phần trăm các kênh còn lại không cộng lại thành 100%, và
       -- người đọc ngồi tìm xem mình sai ở đâu.
       --
       -- Kiểm cả hai điều kiện: contest_id là mối liên kết thật, còn source là
       -- thứ được gán lúc tạo. Dữ liệu cũ có thể chỉ có một trong hai.
       AND b.contest_id IS NULL
       AND b.source <> 'CONTEST'
     GROUP BY b.source`,
    [providerId, fromDate, toDate, cafeId || null],
  );

  const bySource = new Map(rows.map((row) => [row.source, row]));
  const totalBookings = rows.reduce((sum, row) => sum + Number(row.bookingCount), 0);

  return Object.keys(BOOKING_SOURCE_LABELS).map((source) => {
    const row = bySource.get(source);
    const bookingCount = Number(row?.bookingCount ?? 0);
    return {
      source,
      label: BOOKING_SOURCE_LABELS[source],
      bookingCount,
      revenue: Number(row?.revenue ?? 0),
      bookingShare: totalBookings > 0 ? bookingCount / totalBookings : 0,
    };
  });
}

export async function getProviderBranchPerformance(
  providerId: string,
  from?: string,
  to?: string,
): Promise<BranchPerformanceItem[]> {
  const fromDate = from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const toDate = to || new Date().toISOString();

  /*
    Doanh thu theo chi nhánh phải cộng đúng ba nguồn như KPI tổng — nếu không,
    cộng doanh thu của mọi chi nhánh lại sẽ KHÔNG bằng ô "Tổng doanh thu", và đó
    chính là loại mâu thuẫn vừa được sửa ở trên.

    Ba nhánh gộp bằng UNION ALL rồi mới cộng theo chi nhánh, thay vì ba LEFT JOIN
    song song: join nhiều bảng một-nhiều cùng lúc sẽ nhân chéo số dòng và thổi
    phồng tổng tiền.
  */
  const query = `
    WITH doanh_thu AS (
      SELECT
        b.cafe_id,
        CASE
          WHEN pc.status = 'PARTIALLY_REFUNDED' THEN pc.amount - COALESCE(pc.refunded_amount, 0)
          ELSE pc.amount
        END AS amount
      FROM bookings b
      JOIN payment_components pc ON pc.booking_id = b.id
      WHERE pc.status IN ('HELD', 'DISBURSED', 'PARTIALLY_REFUNDED')
        AND pc.type != 'SECURITY_DEPOSIT'
        AND pc.created_at >= $2::timestamptz
        AND pc.created_at <= $3::timestamptz

      UNION ALL

      SELECT cp.cafe_id, cp.purchased_price
      FROM customer_packages cp
      WHERE cp.status IN ('ACTIVE', 'EXHAUSTED')
        AND cp.created_at >= $2::timestamptz
        AND cp.created_at <= $3::timestamptz

      UNION ALL

      SELECT ct.cafe_id, cr.entry_fee_amount
      FROM contest_registrations cr
      JOIN contests ct ON ct.id = cr.contest_id
      WHERE cr.payment_status = 'MARKED_PAID'
        AND cr.entry_fee_amount > 0
        AND cr.entry_fee_marked_paid_at >= $2::timestamptz
        AND cr.entry_fee_marked_paid_at <= $3::timestamptz
    ),
    so_booking AS (
      SELECT b.cafe_id, COUNT(DISTINCT b.id)::int AS n
      FROM bookings b
      WHERE b.slot_start >= $2::timestamptz
        AND b.slot_start <= $3::timestamptz
      GROUP BY b.cafe_id
    )
    SELECT
      c.id AS "cafeId",
      c.name AS "cafeName",
      COALESCE(SUM(dt.amount), 0)::float AS "totalRevenue",
      COALESCE(MAX(sb.n), 0)::int AS "bookingCount"
    FROM cafes c
    LEFT JOIN doanh_thu dt ON dt.cafe_id = c.id
    LEFT JOIN so_booking sb ON sb.cafe_id = c.id
    WHERE c.provider_id = $1
      AND c.deleted_at IS NULL
    GROUP BY c.id, c.name
    ORDER BY "totalRevenue" DESC
  `;

  const rows = await AppDataSource.query<
    {
      cafeId: string;
      cafeName: string;
      totalRevenue: number;
      bookingCount: number;
    }[]
  >(query, [providerId, fromDate, toDate]);

  return rows.map((row) => ({
    cafeId: row.cafeId,
    cafeName: row.cafeName,
    totalRevenue: Number(row.totalRevenue),
    bookingCount: Number(row.bookingCount),
  }));
}

function toNumber(value: number | string | null | undefined): number {
  const result = Number(value ?? 0);
  return Number.isFinite(result) ? result : 0;
}

function normalizeOperatingHours(value: unknown): CafeOperatingHours {
  if (value && typeof value === 'object') return value as CafeOperatingHours;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === 'object') return parsed as CafeOperatingHours;
    } catch {
      // An invalid legacy payload has no reliable capacity, so it should render as no data.
    }
  }
  return {};
}

/**
 * Operational summary for the provider's branch-list screen. Occupancy is
 * booked slot-minutes divided by configured, open slot-minutes in the selected
 * period; it is intentionally not a completed-booking rate.
 */
export async function getProviderBranchOperations(
  providerId: string,
  from?: string,
  to?: string,
): Promise<BranchOperationsItem[]> {
  // The default is month-to-date. A full calendar month would include future
  // capacity in the denominator and therefore understate current utilisation.
  const currentMonth = getVietnamCurrentMonthToDateRange();
  const fromDate = from || currentMonth.from;
  const toDate = to || currentMonth.to;

  const [cafes, revenueRows, occupiedRows, fleetRows, overdueRows, capacityRows] =
    await Promise.all([
      AppDataSource.query<
        Array<{
          cafeId: string;
          cafeName: string;
          cafeStatus: string;
          operatingHours: unknown;
          maxConcurrentBookings: number | string;
        }>
      >(
        `SELECT
         c.id AS "cafeId",
         c.name AS "cafeName",
         c.status AS "cafeStatus",
         c.operating_hours AS "operatingHours",
         c.max_concurrent_bookings AS "maxConcurrentBookings"
       FROM cafes c
       WHERE c.provider_id = $1
         AND c.deleted_at IS NULL`,
        [providerId],
      ),
      AppDataSource.query<
        Array<{ cafeId: string; totalRevenue: number | string; bookingCount: number | string }>
      >(
        `WITH booking_revenue AS (
           SELECT
             b.cafe_id AS cafe_id,
             COALESCE(SUM(
               CASE
                 WHEN pc.status = 'PARTIALLY_REFUNDED' THEN pc.amount - COALESCE(pc.refunded_amount, 0)
                 ELSE pc.amount
               END
             ), 0)::float AS total_revenue,
             COUNT(DISTINCT b.id)::int AS booking_count
           FROM bookings b
           JOIN cafes c ON c.id = b.cafe_id
           JOIN payment_components pc ON pc.booking_id = b.id
           WHERE c.provider_id = $1
             AND c.deleted_at IS NULL
             AND b.deleted_at IS NULL
             AND pc.status IN ('HELD', 'DISBURSED', 'PARTIALLY_REFUNDED')
             AND pc.type != 'SECURITY_DEPOSIT'
             AND pc.created_at >= $2::timestamptz
             AND pc.created_at < $3::timestamptz
           GROUP BY b.cafe_id
         ), package_revenue AS (
           SELECT
             cp.cafe_id AS cafe_id,
             COALESCE(SUM(cp.purchased_price), 0)::float AS total_revenue
           FROM customer_packages cp
           JOIN cafes c ON c.id = cp.cafe_id
           WHERE c.provider_id = $1
             AND c.deleted_at IS NULL
             AND cp.status IN ('ACTIVE', 'EXHAUSTED')
             AND cp.created_at >= $2::timestamptz
             AND cp.created_at < $3::timestamptz
           GROUP BY cp.cafe_id
         ), contest_revenue AS (
           SELECT
             ct.cafe_id AS cafe_id,
             COALESCE(SUM(cr.entry_fee_amount), 0)::float AS total_revenue
           FROM contest_registrations cr
           JOIN contests ct ON ct.id = cr.contest_id
           JOIN cafes c ON c.id = ct.cafe_id
           WHERE c.provider_id = $1
             AND c.deleted_at IS NULL
             AND cr.payment_status = 'MARKED_PAID'
             AND cr.entry_fee_amount > 0
             AND cr.entry_fee_marked_paid_at >= $2::timestamptz
             AND cr.entry_fee_marked_paid_at < $3::timestamptz
           GROUP BY ct.cafe_id
         )
         SELECT
           c.id AS "cafeId",
           (COALESCE(br.total_revenue, 0) + COALESCE(pr.total_revenue, 0) + COALESCE(cx.total_revenue, 0))::float AS "totalRevenue",
           COALESCE(br.booking_count, 0)::int AS "bookingCount"
         FROM cafes c
         LEFT JOIN booking_revenue br ON br.cafe_id = c.id
         LEFT JOIN package_revenue pr ON pr.cafe_id = c.id
         LEFT JOIN contest_revenue cx ON cx.cafe_id = c.id
         WHERE c.provider_id = $1
           AND c.deleted_at IS NULL`,
        [providerId, fromDate, toDate],
      ),
      AppDataSource.query<Array<{ cafeId: string; occupiedSlotMinutes: number | string }>>(
        `SELECT
         b.cafe_id AS "cafeId",
         COALESCE(
           SUM(
             EXTRACT(EPOCH FROM (
               LEAST(b.slot_end, $3::timestamptz) - GREATEST(b.slot_start, $2::timestamptz)
             )) / 60
           ),
           0
         )::float AS "occupiedSlotMinutes"
       FROM bookings b
       JOIN cafes c ON c.id = b.cafe_id
       WHERE c.provider_id = $1
         AND c.deleted_at IS NULL
         AND b.deleted_at IS NULL
         -- AWAITING_PAYMENT nghĩa là khách đã chơi xong, chỉ còn nợ khoản phát
         -- sinh cuối phiên. Sân đã bị chiếm thật, nên nó phải nằm trong tử số.
         -- Bỏ sót thì mỗi đơn chờ thu tiền lại làm tỷ lệ khai thác tụt xuống,
         -- đúng vào những ngày đông khách nhất.
         AND b.status IN ('PENDING', 'CONFIRMED', 'AWAITING_PAYMENT', 'COMPLETED')
         AND b.slot_start < $3::timestamptz
         AND b.slot_end > $2::timestamptz
       GROUP BY b.cafe_id`,
        [providerId, fromDate, toDate],
      ),
      AppDataSource.query<
        Array<{
          cafeId: string;
          totalVehicles: number | string;
          inUseVehicles: number | string;
          availableVehicles: number | string;
          maintenanceVehicles: number | string;
        }>
      >(
        `SELECT
         v.cafe_id AS "cafeId",
         COUNT(CASE WHEN v.status != 'RETIRED' THEN 1 END)::int AS "totalVehicles",
         COUNT(CASE WHEN v.status = 'IN_USE' THEN 1 END)::int AS "inUseVehicles",
         COUNT(CASE WHEN v.status = 'AVAILABLE' THEN 1 END)::int AS "availableVehicles",
         COUNT(CASE WHEN v.status = 'MAINTENANCE' THEN 1 END)::int AS "maintenanceVehicles"
       FROM vehicles v
       JOIN cafes c ON c.id = v.cafe_id
       WHERE c.provider_id = $1
         AND c.deleted_at IS NULL
         AND v.deleted_at IS NULL
       GROUP BY v.cafe_id`,
        [providerId],
      ),
      AppDataSource.query<Array<{ cafeId: string; overdueSessionCount: number | string }>>(
        `SELECT
         s.cafe_id AS "cafeId",
         COUNT(s.id)::int AS "overdueSessionCount"
       FROM sessions s
       JOIN cafes c ON c.id = s.cafe_id
       WHERE c.provider_id = $1
         AND c.deleted_at IS NULL
         AND s.status = 'ACTIVE'
         AND s.actual_end_at IS NULL
         AND s.planned_end_at <= NOW() - ($2 * INTERVAL '1 minute')
       GROUP BY s.cafe_id`,
        [providerId, SESSION_OVERDUE_ALERT_MINUTES],
      ),
      AppDataSource.query<Array<{ cafeId: string; concurrentCapacity: number | string }>>(
        `SELECT
         tc.cafe_id AS "cafeId",
         COALESCE(SUM(tc.max_concurrent), 0)::int AS "concurrentCapacity"
       FROM cafe_track_configs tc
       JOIN cafes c ON c.id = tc.cafe_id
       WHERE c.provider_id = $1
         AND c.deleted_at IS NULL
         AND tc.deleted_at IS NULL
         AND tc.is_active = TRUE
       GROUP BY tc.cafe_id`,
        [providerId],
      ),
    ]);

  const revenueByCafe = new Map(revenueRows.map((row) => [row.cafeId, row]));
  const occupiedByCafe = new Map(occupiedRows.map((row) => [row.cafeId, row]));
  const fleetByCafe = new Map(fleetRows.map((row) => [row.cafeId, row]));
  const overdueByCafe = new Map(overdueRows.map((row) => [row.cafeId, row]));
  const capacityByCafe = new Map(capacityRows.map((row) => [row.cafeId, row]));
  const fromValue = new Date(fromDate);
  const toValue = new Date(toDate);

  return cafes
    .map((cafe) => {
      const revenue = revenueByCafe.get(cafe.cafeId);
      const occupied = toNumber(occupiedByCafe.get(cafe.cafeId)?.occupiedSlotMinutes);
      // Track configs supersede the legacy cafe-wide capacity. Older cafes
      // without a config retain their original max_concurrent_bookings setting.
      const configuredCapacity = capacityByCafe.has(cafe.cafeId)
        ? toNumber(capacityByCafe.get(cafe.cafeId)?.concurrentCapacity)
        : toNumber(cafe.maxConcurrentBookings);
      const bookable = getBookableSlotMinutes(
        normalizeOperatingHours(cafe.operatingHours),
        configuredCapacity,
        fromValue,
        toValue,
      );
      const fleet = fleetByCafe.get(cafe.cafeId);
      const maintenanceVehicles = toNumber(fleet?.maintenanceVehicles);
      const overdueSessionCount = toNumber(overdueByCafe.get(cafe.cafeId)?.overdueSessionCount);
      const suspendedAlert = cafe.cafeStatus === 'SUSPENDED' ? 1 : 0;

      return {
        cafeId: cafe.cafeId,
        cafeName: cafe.cafeName,
        cafeStatus: cafe.cafeStatus,
        totalRevenue: toNumber(revenue?.totalRevenue),
        bookingCount: toNumber(revenue?.bookingCount),
        occupiedSlotMinutes: occupied,
        bookableSlotMinutes: bookable,
        occupancyRate: getOccupancyRate(occupied, bookable),
        totalVehicles: toNumber(fleet?.totalVehicles),
        inUseVehicles: toNumber(fleet?.inUseVehicles),
        availableVehicles: toNumber(fleet?.availableVehicles),
        maintenanceVehicles,
        overdueSessionCount,
        operationalAlertCount: suspendedAlert + maintenanceVehicles + overdueSessionCount,
      };
    })
    .sort((a, b) => b.totalRevenue - a.totalRevenue || a.cafeName.localeCompare(b.cafeName, 'vi'));
}

export async function getProviderRecentBookings(
  providerId: string,
  limit?: number,
  from?: string,
  to?: string,
  cafeId?: string,
): Promise<RecentBookingItem[]> {
  const fromDate = from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const toDate = to || new Date().toISOString();

  let query = `
    SELECT
      b.id AS "bookingId",
      c.name AS "cafeName",
      u.full_name AS "customerName",
      b.play_mode AS "playMode",
      b.slot_start AS "slotStart",
      b.status AS "status",
      COALESCE((
        SELECT SUM(pc.amount)
        FROM payment_components pc
        WHERE pc.booking_id = b.id
          AND pc.status IN ('HELD', 'DISBURSED')
      ), 0)::float AS "totalCharged"
    FROM bookings b
    JOIN cafes c ON c.id = b.cafe_id
    JOIN users u ON u.id = b.customer_id
    WHERE c.provider_id = $1
      AND b.slot_start >= $2::timestamptz
      AND b.slot_start <= $3::timestamptz
      AND ($4::uuid IS NULL OR b.cafe_id = $4)
    ORDER BY b.created_at DESC
  `;

  const params: (string | number | null)[] = [providerId, fromDate, toDate, cafeId || null];

  if (limit) {
    query += ` LIMIT $5`;
    params.push(limit);
  }

  const rows = await AppDataSource.query<
    {
      bookingId: string;
      cafeName: string;
      customerName: string;
      playMode: string;
      slotStart: Date;
      status: string;
      totalCharged: number;
    }[]
  >(query, params);

  return rows.map((row) => ({
    bookingId: row.bookingId,
    cafeName: row.cafeName,
    customerName: row.customerName,
    playMode: row.playMode,
    slotStart: row.slotStart.toISOString(),
    status: row.status,
    totalCharged: Number(row.totalCharged),
  }));
}

export interface TopFnbItem {
  menuItemId: string;
  itemName: string;
  cafeName: string;
  totalQuantity: number;
  totalRevenue: number;
}

export interface TopTrackItem {
  trackTypeId: string;
  trackTypeName: string;
  trackTypeCode: string;
  cafeName: string;
  bookingCount: number;
}

export interface TopCustomerItem {
  customerId: string;
  customerName: string;
  customerEmail: string;
  bookingCount: number;
  totalSpent: number;
}

export interface TopVehicleItem {
  catalogId: string;
  catalogName: string;
  catalogTier: string;
  cafeName: string;
  bookingCount: number;
  rentalRevenue: number;
}

export interface TopPackageItem {
  packageId: string;
  packageName: string;
  cafeName: string;
  purchaseCount: number;
  totalRevenue: number;
}

export interface ProviderTopStats {
  topFnb: TopFnbItem[];
  topTracks: TopTrackItem[];
  topCustomers: TopCustomerItem[];
  topVehicles: TopVehicleItem[];
  topPackages: TopPackageItem[];
}

export async function getProviderTopStats(
  providerId: string,
  from?: string,
  to?: string,
  cafeId?: string,
): Promise<ProviderTopStats> {
  const fromDate = from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const toDate = to || new Date().toISOString();

  // 1. Top 5 món F&B được mua nhiều nhất
  const fnbQuery = `
    SELECT 
      foi.menu_item_id AS "menuItemId",
      COALESCE(foi.item_name_snapshot, mi.name, 'Món đã xóa') AS "itemName",
      c.name AS "cafeName",
      SUM(foi.quantity)::int AS "totalQuantity",
      SUM(COALESCE(foi.subtotal, foi.quantity * foi.unit_price))::float AS "totalRevenue"
    FROM fnb_order_items foi
    JOIN fnb_orders fo ON fo.id = foi.fnb_order_id
    LEFT JOIN menu_items mi ON mi.id = foi.menu_item_id
    JOIN bookings b ON b.id = fo.booking_id
    JOIN cafes c ON c.id = b.cafe_id
    WHERE c.provider_id = $1
      AND fo.status != 'CANCELLED'
      AND b.slot_start >= $2::timestamptz
      AND b.slot_start <= $3::timestamptz
      AND ($4::uuid IS NULL OR b.cafe_id = $4)
    GROUP BY foi.menu_item_id, foi.item_name_snapshot, mi.name, c.name
    ORDER BY "totalQuantity" DESC
    LIMIT 5
  `;

  // 2. Top 5 loại sân được book nhiều nhất
  const tracksQuery = `
    SELECT 
      b.track_type_id AS "trackTypeId",
      tt.name AS "trackTypeName",
      tt.code AS "trackTypeCode",
      c.name AS "cafeName",
      COUNT(b.id)::int AS "bookingCount"
    FROM bookings b
    JOIN track_types tt ON tt.id = b.track_type_id
    JOIN cafes c ON c.id = b.cafe_id
    WHERE c.provider_id = $1
      AND b.status != 'CANCELLED'
      AND b.slot_start >= $2::timestamptz
      AND b.slot_start <= $3::timestamptz
      AND ($4::uuid IS NULL OR b.cafe_id = $4)
    GROUP BY b.track_type_id, tt.name, tt.code, c.name
    ORDER BY "bookingCount" DESC
    LIMIT 5
  `;

  // 3. Top 5 khách hàng đặt sân nhiều nhất
  const customersQuery = `
    SELECT 
      b.customer_id AS "customerId",
      u.full_name AS "customerName",
      u.email AS "customerEmail",
      COUNT(DISTINCT b.id)::int AS "bookingCount",
      COALESCE(SUM(pc.amount), 0)::float AS "totalSpent"
    FROM bookings b
    JOIN users u ON u.id = b.customer_id
    JOIN cafes c ON c.id = b.cafe_id
    LEFT JOIN payment_components pc ON pc.booking_id = b.id
      AND pc.status IN ('HELD', 'DISBURSED')
      AND pc.type != 'SECURITY_DEPOSIT'
    WHERE c.provider_id = $1
      AND b.status != 'CANCELLED'
      AND b.slot_start >= $2::timestamptz
      AND b.slot_start <= $3::timestamptz
      AND ($4::uuid IS NULL OR b.cafe_id = $4)
    GROUP BY b.customer_id, u.full_name, u.email
    ORDER BY "bookingCount" DESC
    LIMIT 5
  `;

  // 4. Top 5 loại xe được book nhiều nhất
  const vehiclesQuery = `
    SELECT 
      vc.id AS "catalogId",
      vc.name AS "catalogName",
      vc.tier AS "catalogTier",
      c.name AS "cafeName",
      COUNT(bv.id)::int AS "bookingCount",
      COALESCE(SUM(bv.rental_fee_snapshot), 0)::float AS "rentalRevenue"
    FROM booking_vehicles bv
    JOIN vehicles v ON v.id = bv.vehicle_id
    JOIN vehicle_catalogs vc ON vc.id = v.catalog_id
    JOIN bookings b ON b.id = bv.booking_id
    JOIN cafes c ON c.id = b.cafe_id
    WHERE c.provider_id = $1
      AND b.status != 'CANCELLED'
      AND b.slot_start >= $2::timestamptz
      AND b.slot_start <= $3::timestamptz
      AND ($4::uuid IS NULL OR b.cafe_id = $4)
    GROUP BY vc.id, vc.name, vc.tier, c.name
    ORDER BY "bookingCount" DESC
    LIMIT 5
  `;

  // 5. Top 5 gói dịch vụ được mua nhiều nhất
  const packagesQuery = `
    SELECT 
      cp.package_id AS "packageId",
      COALESCE(cp.package_name_snapshot, p.name, 'Gói dịch vụ') AS "packageName",
      c.name AS "cafeName",
      COUNT(cp.id)::int AS "purchaseCount",
      COALESCE(SUM(cp.purchased_price), 0)::float AS "totalRevenue"
    FROM customer_packages cp
    JOIN cafes c ON c.id = cp.cafe_id
    LEFT JOIN packages p ON p.id = cp.package_id
    WHERE c.provider_id = $1
      AND cp.status IN ('ACTIVE', 'EXHAUSTED')
      AND cp.created_at >= $2::timestamptz
      AND cp.created_at <= $3::timestamptz
      AND ($4::uuid IS NULL OR cp.cafe_id = $4)
    GROUP BY cp.package_id, cp.package_name_snapshot, p.name, c.name
    ORDER BY "purchaseCount" DESC
    LIMIT 5
  `;

  const [topFnb, topTracks, topCustomers, topVehicles, topPackages] = await Promise.all([
    AppDataSource.query<TopFnbItem[]>(fnbQuery, [providerId, fromDate, toDate, cafeId || null]),
    AppDataSource.query<TopTrackItem[]>(tracksQuery, [
      providerId,
      fromDate,
      toDate,
      cafeId || null,
    ]),
    AppDataSource.query<TopCustomerItem[]>(customersQuery, [
      providerId,
      fromDate,
      toDate,
      cafeId || null,
    ]),
    AppDataSource.query<TopVehicleItem[]>(vehiclesQuery, [
      providerId,
      fromDate,
      toDate,
      cafeId || null,
    ]),
    AppDataSource.query<TopPackageItem[]>(packagesQuery, [
      providerId,
      fromDate,
      toDate,
      cafeId || null,
    ]),
  ]);

  return {
    topFnb: topFnb.map((item) => ({
      menuItemId: item.menuItemId,
      itemName: item.itemName,
      cafeName: item.cafeName,
      totalQuantity: Number(item.totalQuantity),
      totalRevenue: Number(item.totalRevenue),
    })),
    topTracks: topTracks.map((item) => ({
      trackTypeId: item.trackTypeId,
      trackTypeName: item.trackTypeName,
      trackTypeCode: item.trackTypeCode,
      cafeName: item.cafeName,
      bookingCount: Number(item.bookingCount),
    })),
    topCustomers: topCustomers.map((item) => ({
      customerId: item.customerId,
      customerName: item.customerName,
      customerEmail: item.customerEmail,
      bookingCount: Number(item.bookingCount),
      totalSpent: Number(item.totalSpent),
    })),
    topVehicles: topVehicles.map((item) => ({
      catalogId: item.catalogId,
      catalogName: item.catalogName,
      catalogTier: item.catalogTier,
      cafeName: item.cafeName,
      bookingCount: Number(item.bookingCount),
      rentalRevenue: Number(item.rentalRevenue),
    })),
    topPackages: topPackages.map((item) => ({
      packageId: item.packageId,
      packageName: item.packageName,
      cafeName: item.cafeName,
      purchaseCount: Number(item.purchaseCount),
      totalRevenue: Number(item.totalRevenue),
    })),
  };
}
