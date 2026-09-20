import { AppDataSource } from '../config/database';
import { PaymentRequestStatus, SubscriptionStatus, ContestFeeOrderStatus } from '../types';

export interface AdminKpi {
  totalCafes: {
    value: string;
    helper: string;
  };
  totalUsers: {
    value: string;
    helper: string;
  };
  totalRevenue: {
    value: string;
    helper: string;
  };
  monthlyRevenue?: {
    value: string;
    helper: string;
  };
  activeSessions: {
    value: string;
    helper: string;
  };
}

export interface CafeGrowthItem {
  name: string;
  value: number;
}

export interface SaaSRevenueItem {
  name: string;
  count: number;
  revenue: number;
}

export interface ActiveSessionsTrendItem {
  name: string;
  value: number;
}

export interface RecentCafeItem {
  id: string;
  name: string;
  providerName: string;
  email: string;
  saasPlan: string;
  status: string;
  createdDate: string;
}

export interface AdminDashboardSummary {
  kpi: AdminKpi;
  cafeGrowth: CafeGrowthItem[];
  revenueByPlan: SaaSRevenueItem[];
  revenueByContestPlan: SaaSRevenueItem[];
  activeSessionsTrend: ActiveSessionsTrendItem[];
  recentCafes: RecentCafeItem[];
}

export async function getAdminDashboardSummary(
  period: string = 'monthly',
  from?: string,
  to?: string,
): Promise<AdminDashboardSummary> {
  // Xác định khoảng thời gian lọc dữ liệu cho các biểu đồ & tăng trưởng trong kỳ
  let filterFromDate: string = from || '';
  let filterToDate: string = to || '';

  if (!filterFromDate || !filterToDate) {
    const nowObj = new Date();
    filterToDate = nowObj.toISOString();

    if (period === 'daily') {
      const d = new Date(nowObj);
      d.setDate(d.getDate() - 13);
      d.setHours(0, 0, 0, 0);
      filterFromDate = d.toISOString();
    } else if (period === 'weekly') {
      const d = new Date(nowObj);
      d.setDate(d.getDate() - 11 * 7);
      d.setHours(0, 0, 0, 0);
      filterFromDate = d.toISOString();
    } else {
      // monthly: 12 tháng qua
      const d = new Date(nowObj);
      d.setMonth(d.getMonth() - 11);
      d.setDate(1);
      d.setHours(0, 0, 0, 0);
      filterFromDate = d.toISOString();
    }
  }

  // 1. KPI - Số đối tác đăng ký mới trong kỳ lọc
  const cafesKpi = await AppDataSource.query<
    [{ total: string; active: string; newInPeriod: string }]
  >(
    `SELECT 
      COUNT(id)::int AS "total",
      COUNT(CASE WHEN status = 'ACTIVE' THEN 1 END)::int AS "active",
      COUNT(CASE WHEN created_at >= $1::timestamptz AND created_at <= $2::timestamptz THEN 1 END)::int AS "newInPeriod"
     FROM cafes
     WHERE deleted_at IS NULL`,
    [filterFromDate, filterToDate],
  );
  const totalCafesVal = cafesKpi[0]?.total ?? 0;
  const activeCafesVal = cafesKpi[0]?.active ?? 0;
  const newCafesInPeriod = cafesKpi[0]?.newInPeriod ?? 0;

  const totalCafes = {
    value: String(newCafesInPeriod),
    helper: `${activeCafesVal} đang hoạt động (Tổng: ${totalCafesVal} cơ sở)`,
  };

  // 2. KPI - Số người dùng đăng ký mới trong kỳ lọc
  const usersKpi = await AppDataSource.query<[{ total: string; newInPeriod: string }]>(
    `SELECT 
      COUNT(id)::int AS "total",
      COUNT(CASE WHEN created_at >= $1::timestamptz AND created_at <= $2::timestamptz THEN 1 END)::int AS "newInPeriod"
     FROM users
     WHERE deleted_at IS NULL`,
    [filterFromDate, filterToDate],
  );
  const totalUsersVal = Number(usersKpi[0]?.total ?? 0);
  const newUsersInPeriod = Number(usersKpi[0]?.newInPeriod ?? 0);

  const totalUsers = {
    value: newUsersInPeriod.toLocaleString('vi-VN'),
    helper: `Tổng tích lũy: ${totalUsersVal.toLocaleString('vi-VN')} thành viên`,
  };

  // 3. KPI - Doanh thu phát sinh trong kỳ lọc
  const totalRevenueAllTimeRes = await AppDataSource.query<[{ total: string }]>(
    `SELECT (
       COALESCE((
         SELECT SUM(transfer_amount)
         FROM payment_requests
         WHERE status = $1
       ), 0) +
       COALESCE((
         SELECT SUM(COALESCE(transfer_amount, amount))
         FROM contest_fee_orders
         WHERE status = $2
       ), 0)
     )::float AS "total"`,
    [PaymentRequestStatus.CONFIRMED, ContestFeeOrderStatus.PAID],
  );

  const periodRevenueRes = await AppDataSource.query<[{ total: string }]>(
    `SELECT (
       COALESCE((
         SELECT SUM(transfer_amount)
         FROM payment_requests
         WHERE status = $1 AND created_at >= $3::timestamptz AND created_at <= $4::timestamptz
       ), 0) +
       COALESCE((
         SELECT SUM(COALESCE(transfer_amount, amount))
         FROM contest_fee_orders
         WHERE status = $2 AND (
           (reviewed_at >= $3::timestamptz AND reviewed_at <= $4::timestamptz)
           OR (reviewed_at IS NULL AND created_at >= $3::timestamptz AND created_at <= $4::timestamptz)
         )
       ), 0)
     )::float AS "total"`,
    [PaymentRequestStatus.CONFIRMED, ContestFeeOrderStatus.PAID, filterFromDate, filterToDate],
  );

  const totalRevenueVal = totalRevenueAllTimeRes[0]?.total
    ? Number(totalRevenueAllTimeRes[0].total)
    : 0;
  const periodRevenueVal = periodRevenueRes[0]?.total ? Number(periodRevenueRes[0].total) : 0;

  const totalRevenueObj = {
    value: `${periodRevenueVal.toLocaleString('vi-VN')} ₫`,
    helper: `Tổng tích lũy: ${totalRevenueVal.toLocaleString('vi-VN')} ₫`,
  };

  // 4. KPI - Lượt / Phiên chơi trong kỳ lọc
  const periodSessionsKpi = await AppDataSource.query<
    [{ totalInPeriod: string; cafeCount: string }]
  >(
    `SELECT 
      COUNT(id)::int AS "totalInPeriod",
      COUNT(DISTINCT cafe_id)::int AS "cafeCount"
     FROM sessions
     WHERE created_at >= $1::timestamptz AND created_at <= $2::timestamptz`,
    [filterFromDate, filterToDate],
  );
  const totalSessionsInPeriod = periodSessionsKpi[0]?.totalInPeriod ?? 0;
  const cafeCountInPeriod = periodSessionsKpi[0]?.cafeCount ?? 0;

  const activeSessions = {
    value: String(totalSessionsInPeriod),
    helper: `Từ ${cafeCountInPeriod} chi nhánh sân`,
  };

  // 5. Chart 1: Sự tăng trưởng của Đối tác (Hỗ trợ daily, weekly, monthly và custom range từ ngày - đến ngày)
  let cafeGrowth: CafeGrowthItem[];
  if (from && to) {
    cafeGrowth = await AppDataSource.query<CafeGrowthItem[]>(
      `WITH dates AS (
         SELECT generate_series(
           DATE_TRUNC('day', $1::timestamptz),
           DATE_TRUNC('day', $2::timestamptz),
           '1 day'::interval
         ) AS d
       )
       SELECT 
         TO_CHAR(d.d, 'DD/MM') AS "name",
         COUNT(c.id)::int AS "value"
        FROM dates d
        LEFT JOIN cafes c ON DATE_TRUNC('day', c.created_at) = d.d AND c.deleted_at IS NULL
        GROUP BY d.d
        ORDER BY d.d ASC`,
      [from, to],
    );
  } else if (period === 'daily') {
    cafeGrowth = await AppDataSource.query<CafeGrowthItem[]>(
      `WITH dates AS (
         SELECT generate_series(
           DATE_TRUNC('day', CURRENT_DATE) - INTERVAL '13 days',
           DATE_TRUNC('day', CURRENT_DATE),
           '1 day'::interval
         ) AS d
       )
       SELECT 
         TO_CHAR(d.d, 'DD/MM') AS "name",
         COUNT(c.id)::int AS "value"
        FROM dates d
        LEFT JOIN cafes c ON DATE_TRUNC('day', c.created_at) = d.d AND c.deleted_at IS NULL
        GROUP BY d.d
        ORDER BY d.d ASC`,
    );
  } else if (period === 'weekly') {
    cafeGrowth = await AppDataSource.query<CafeGrowthItem[]>(
      `WITH weeks AS (
         SELECT generate_series(
           DATE_TRUNC('week', CURRENT_DATE) - INTERVAL '11 weeks',
           DATE_TRUNC('week', CURRENT_DATE),
           '1 week'::interval
         ) AS w
       )
       SELECT 
         'T' || TO_CHAR(w.w, 'IW') AS "name",
         COUNT(c.id)::int AS "value"
        FROM weeks w
        LEFT JOIN cafes c ON DATE_TRUNC('week', c.created_at) = w.w AND c.deleted_at IS NULL
        GROUP BY w.w
        ORDER BY w.w ASC`,
    );
  } else {
    // monthly: 12 tháng qua
    cafeGrowth = await AppDataSource.query<CafeGrowthItem[]>(
      `WITH months AS (
         SELECT generate_series(
           DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '11 months',
           DATE_TRUNC('month', CURRENT_DATE),
           '1 month'::interval
         ) AS m
       )
       SELECT 
         'Thg ' || TO_CHAR(m.m, 'MM') AS "name",
         COUNT(c.id)::int AS "value"
        FROM months m
        LEFT JOIN cafes c ON DATE_TRUNC('month', c.created_at) = m.m AND c.deleted_at IS NULL
        GROUP BY m.m
        ORDER BY m.m ASC`,
    );
  }

  // 6. Chart 2: Doanh thu theo gói SaaS (Lọc theo thời gian)
  const revenueByPlanRows = await AppDataSource.query<SaaSRevenueItem[]>(
    `SELECT 
      CASE
        WHEN UPPER(sp.name::text) = 'TRIAL' THEN 'Free'
        ELSE INITCAP(sp.name::text)
      END AS "name",
      COUNT(DISTINCT pr.provider_id)::int AS "count",
      COALESCE(SUM(pr.transfer_amount), 0)::float AS "revenue"
     FROM subscription_plans sp
     LEFT JOIN payment_requests pr 
       ON pr.plan_id = sp.id 
      AND pr.status = $1
      AND pr.created_at >= $2::timestamptz
      AND pr.created_at <= $3::timestamptz
     GROUP BY sp.id, sp.name, sp.price_per_month
     ORDER BY sp.price_per_month ASC`,
    [PaymentRequestStatus.CONFIRMED, filterFromDate, filterToDate],
  );

  // 6b. Chart 2b: Doanh thu theo gói tạo giải đấu (Lọc theo thời gian)
  const revenueByContestPlanRows = await AppDataSource.query<SaaSRevenueItem[]>(
    `SELECT 
      cfp.name::text AS "name",
      COUNT(DISTINCT cfo.provider_id)::int AS "count",
      COALESCE(SUM(COALESCE(cfo.transfer_amount, cfo.amount)), 0)::float AS "revenue"
     FROM contest_fee_plans cfp
     LEFT JOIN contest_fee_orders cfo 
       ON cfo.plan_id = cfp.id 
      AND cfo.status = $1
      AND (
        (cfo.reviewed_at >= $2::timestamptz AND cfo.reviewed_at <= $3::timestamptz)
        OR (cfo.reviewed_at IS NULL AND cfo.created_at >= $2::timestamptz AND cfo.created_at <= $3::timestamptz)
      )
     GROUP BY cfp.id, cfp.name`,
    [ContestFeeOrderStatus.PAID, filterFromDate, filterToDate],
  );

  // 7. Chart 3: Lượng truy cập sân chơi (Theo bộ lọc thời gian: daily / weekly / monthly / custom range)
  let activeSessionsTrend: ActiveSessionsTrendItem[];

  if (from && to) {
    activeSessionsTrend = await AppDataSource.query<ActiveSessionsTrendItem[]>(
      `WITH dates AS (
         SELECT generate_series(
           DATE_TRUNC('day', $1::timestamptz),
           DATE_TRUNC('day', $2::timestamptz),
           '1 day'::interval
         ) AS d
       )
       SELECT 
         TO_CHAR(d.d, 'DD/MM') AS "name",
         COUNT(s.id)::int AS "value"
        FROM dates d
        LEFT JOIN sessions s ON DATE_TRUNC('day', s.actual_start_at) = d.d
        GROUP BY d.d
        ORDER BY d.d ASC`,
      [from, to],
    );
  } else if (period === 'daily') {
    activeSessionsTrend = await AppDataSource.query<ActiveSessionsTrendItem[]>(
      `WITH dates AS (
         SELECT generate_series(
           DATE_TRUNC('day', CURRENT_DATE) - INTERVAL '13 days',
           DATE_TRUNC('day', CURRENT_DATE),
           '1 day'::interval
         ) AS d
       )
       SELECT 
         TO_CHAR(d.d, 'DD/MM') AS "name",
         COUNT(s.id)::int AS "value"
        FROM dates d
        LEFT JOIN sessions s ON DATE_TRUNC('day', s.actual_start_at) = d.d
        GROUP BY d.d
        ORDER BY d.d ASC`,
    );
  } else if (period === 'weekly') {
    activeSessionsTrend = await AppDataSource.query<ActiveSessionsTrendItem[]>(
      `WITH weeks AS (
         SELECT generate_series(
           DATE_TRUNC('week', CURRENT_DATE) - INTERVAL '11 weeks',
           DATE_TRUNC('week', CURRENT_DATE),
           '1 week'::interval
         ) AS w
       )
       SELECT 
         'T' || TO_CHAR(w.w, 'IW') AS "name",
         COUNT(s.id)::int AS "value"
        FROM weeks w
        LEFT JOIN sessions s ON DATE_TRUNC('week', s.actual_start_at) = w.w
        GROUP BY w.w
        ORDER BY w.w ASC`,
    );
  } else {
    // monthly: 12 tháng qua (12 điểm đại diện cho 12 tháng)
    activeSessionsTrend = await AppDataSource.query<ActiveSessionsTrendItem[]>(
      `WITH months AS (
         SELECT generate_series(
           DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '11 months',
           DATE_TRUNC('month', CURRENT_DATE),
           '1 month'::interval
         ) AS m
       )
       SELECT 
         'Thg ' || TO_CHAR(m.m, 'MM') AS "name",
         COUNT(s.id)::int AS "value"
        FROM months m
        LEFT JOIN sessions s ON DATE_TRUNC('month', s.actual_start_at) = m.m
        GROUP BY m.m
        ORDER BY m.m ASC`,
    );
  }

  // 8. Table: Đối tác đăng ký gần đây
  const recentCafesRows = await AppDataSource.query<RecentCafeItem[]>(
    `SELECT 
      c.id AS "id",
      c.name AS "name",
      u.full_name AS "providerName",
      u.email AS "email",
      COALESCE(sp.name::text, 'Free') AS "saasPlan",
      c.status::text AS "status",
      TO_CHAR(c.created_at, 'YYYY-MM-DD') AS "createdDate"
     FROM cafes c
     JOIN users u ON u.id = c.provider_id
     LEFT JOIN provider_subscriptions ps ON ps.provider_id = u.id AND ps.status = $1
     LEFT JOIN subscription_plans sp ON sp.id = ps.plan_id
     WHERE c.deleted_at IS NULL
     ORDER BY c.created_at DESC
     LIMIT 5`,
    [SubscriptionStatus.ACTIVE],
  );

  const formattedRevenueByPlan = revenueByPlanRows.map((r) => ({
    name: r.name,
    count: Number(r.count || 0),
    revenue: Number(r.revenue || 0),
  }));

  const formattedRevenueByContestPlan = revenueByContestPlanRows.map((r) => ({
    name: r.name,
    count: Number(r.count || 0),
    revenue: Number(r.revenue || 0),
  }));

  return {
    kpi: {
      totalCafes,
      totalUsers,
      totalRevenue: totalRevenueObj,
      monthlyRevenue: totalRevenueObj,
      activeSessions,
    },
    cafeGrowth,
    revenueByPlan: formattedRevenueByPlan,
    revenueByContestPlan: formattedRevenueByContestPlan,
    activeSessionsTrend,
    recentCafes: recentCafesRows,
  };
}
