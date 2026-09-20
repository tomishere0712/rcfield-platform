import { AppDataSource } from '../config/database';

/**
 * Sổ tiền provider trả cho nền tảng — đúng hai nguồn:
 *
 *   SAAS        phí thuê phần mềm
 *   CONTEST_FEE phí tổ chức giải
 *
 * Tiền khách trả cho quán (`payment_transactions`) cố tình không nằm ở đây: nền
 * tảng thu 0% trên đơn đặt lịch nên khoản đó là doanh thu của chi nhánh, đưa vào
 * sổ này chỉ làm sai con số admin phải đối soát.
 */
export type LedgerSource = 'SAAS' | 'CONTEST_FEE';

export interface LedgerRow {
  id: string;
  source: LedgerSource;
  code: string;
  party: string | null;
  subject: string | null;
  amount: number;
  gateway: string | null;
  status: string;
  created_at: string;
}

export interface LedgerSummary {
  saas_revenue: number;
  contest_fee_revenue: number;
  platform_revenue: number;
  pending_amount: number;
}

const SOURCES: LedgerSource[] = ['SAAS', 'CONTEST_FEE'];

/**
 * Hai nhánh UNION có cùng bộ cột để bên ngoài chỉ việc lọc và phân trang một lần.
 * `party` là provider đã trả tiền, `subject` là thứ họ trả cho.
 */
const LEDGER_SQL = `
  SELECT
    pr.id::text                       AS id,
    'SAAS'                            AS source,
    coalesce(pr.transfer_reference, pr.id::text) AS code,
    coalesce(pp.business_name, u.full_name)      AS party,
    sp.name::text                     AS subject,
    pr.transfer_amount                AS amount,
    'PayOS / Chuyển khoản'            AS gateway,
    pr.status::text                   AS status,
    pr.created_at                     AS created_at
  FROM payment_requests pr
  JOIN users u ON u.id = pr.provider_id
  LEFT JOIN provider_profiles pp ON pp.user_id = pr.provider_id AND pp.deleted_at IS NULL
  LEFT JOIN subscription_plans sp ON sp.id = pr.plan_id
  WHERE pr.deleted_at IS NULL

  UNION ALL

  SELECT
    cfo.id::text,
    'CONTEST_FEE',
    coalesce(cfo.payos_order_code, cfo.transfer_reference, cfo.id::text),
    coalesce(pp.business_name, u.full_name),
    c.name,
    cfo.amount,
    CASE WHEN cfo.payos_order_code IS NOT NULL THEN 'PayOS' ELSE 'Chuyển khoản' END,
    cfo.status::text,
    cfo.created_at
  FROM contest_fee_orders cfo
  JOIN users u ON u.id = cfo.provider_id
  LEFT JOIN provider_profiles pp ON pp.user_id = cfo.provider_id AND pp.deleted_at IS NULL
  LEFT JOIN contests c ON c.id = cfo.contest_id
`;

export interface ListLedgerOptions {
  source?: string;
  status?: string;
  q?: string;
  page?: number;
  limit?: number;
}

export async function listPlatformLedger(options: ListLedgerOptions): Promise<{
  data: LedgerRow[];
  summary: LedgerSummary;
  total: number;
  page: number;
  limit: number;
}> {
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.min(200, Math.max(1, options.limit ?? 50));

  const filters: string[] = [];
  const params: unknown[] = [];

  if (options.source && SOURCES.includes(options.source as LedgerSource)) {
    params.push(options.source);
    filters.push(`source = $${params.length}`);
  }
  if (options.status) {
    params.push(options.status);
    filters.push(`status = $${params.length}`);
  }
  if (options.q?.trim()) {
    params.push(`%${options.q.trim()}%`);
    filters.push(
      `(code ILIKE $${params.length} OR party ILIKE $${params.length} OR subject ILIKE $${params.length})`,
    );
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  const [{ count }] = await AppDataSource.query<{ count: string }[]>(
    `SELECT count(*)::int AS count FROM (${LEDGER_SQL}) ledger ${where}`,
    params,
  );

  const rows = await AppDataSource.query<LedgerRow[]>(
    `SELECT * FROM (${LEDGER_SQL}) ledger
     ${where}
     ORDER BY created_at DESC
     LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
    params,
  );

  return {
    data: rows.map((row) => ({ ...row, amount: Number(row.amount) })),
    summary: await summarize(),
    total: Number(count),
    page,
    limit,
  };
}

/**
 * Phần tổng hợp luôn tính trên toàn bộ sổ, không theo bộ lọc đang xem — người
 * đối soát cần con số của cả nền tảng chứ không phải của trang hiện tại.
 */
async function summarize(): Promise<LedgerSummary> {
  const [row] = await AppDataSource.query<
    {
      saas_revenue: string;
      contest_fee_revenue: string;
      pending_amount: string;
    }[]
  >(`
    SELECT
      coalesce(sum(amount) FILTER (WHERE source = 'SAAS' AND status = 'CONFIRMED'), 0)   AS saas_revenue,
      coalesce(sum(amount) FILTER (WHERE source = 'CONTEST_FEE' AND status = 'PAID'), 0) AS contest_fee_revenue,
      coalesce(sum(amount) FILTER (WHERE status IN ('PENDING', 'PENDING_PAYMENT', 'PENDING_REVIEW')), 0) AS pending_amount
    FROM (${LEDGER_SQL}) ledger
  `);

  const saas = Number(row.saas_revenue);
  const contestFee = Number(row.contest_fee_revenue);

  return {
    saas_revenue: saas,
    contest_fee_revenue: contestFee,
    platform_revenue: saas + contestFee,
    pending_amount: Number(row.pending_amount),
  };
}
