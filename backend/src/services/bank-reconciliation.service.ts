import { AppDataSource } from '../config/database';
import { AppError, BankTransactionMatchStatus } from '../types';

/**
 * Đối soát dòng tiền — góc nhìn của CHỦ SÂN, gộp mọi chi nhánh, mọi cổng.
 *
 * Khác hẳn sổ per-cafe ở `bank-transaction.service.ts`, và cố ý tách ra:
 *
 * - Sổ per-cafe trả lời "giao dịch nào đang treo ở chi nhánh này" — dùng để
 *   XỬ LÝ một giao dịch. Nó không cần lọc theo ngày, và tổng của nó là tổng
 *   toàn thời gian.
 * - Tệp này trả lời "kỳ vừa rồi thu được bao nhiêu, đối chiếu với báo cáo của
 *   ngân hàng và của cổng thanh toán thì lệch ở đâu" — dùng để ĐỐI SOÁT. Mọi
 *   con số vì thế phải tính đúng theo KỲ đang lọc, nếu không thì không bao giờ
 *   khớp được với một con số nào trên sao kê.
 *
 * ── Hai nguồn tiền, KHÔNG được trộn tổng ────────────────────────────────────
 *
 * `BANK` — khách quét QR chuyển khoản. Tiền vào thẳng tài khoản ngân hàng của
 *   chi nhánh, và `bank_transactions` là bản ghi ngân hàng đẩy về. Ở đây mới
 *   có chuyện "lệch": tiền về mà không khớp đơn nào, khách chuyển thiếu, nội
 *   dung sai. Đối chiếu với **sao kê ngân hàng**.
 *
 * `VNPAY` — khách trả qua cổng. Tiền KHÔNG vào tài khoản ngân hàng của chi
 *   nhánh mà nằm ở tài khoản người bán của cổng rồi mới quyết toán về sau. Hệ
 *   thống chỉ có bản ghi của CHÍNH MÌNH (`payment_transactions`), không có bản
 *   ghi đối ứng từ cổng, nên không có khái niệm "chưa khớp" — mọi dòng đều là
 *   MATCHED theo định nghĩa. Đối chiếu với **báo cáo đối soát của VNPay**.
 *
 * Vì vậy hai nguồn được cộng RIÊNG trong `summary`. Gộp làm một con số thì nó
 * không khớp với sao kê ngân hàng, cũng không khớp với báo cáo VNPay — không
 * đối chiếu được với bên nào cả.
 *
 * ── Ba trường sổ per-cafe không trả ra mà đối soát bắt buộc phải có ─────────
 *
 *  - `external_id` — mã do bên kia sinh ra: ngân hàng thì là mã giao dịch trên
 *    sao kê, VNPay thì là `vnp_TransactionNo`. Đây là khoá để dò ngược một
 *    dòng trên báo cáo về đúng bản ghi trong hệ thống. Không có nó thì hai bên
 *    chỉ so được bằng số tiền, mà số tiền thì trùng nhau đầy.
 *  - `account_number` — tiền vào tài khoản nào (chỉ có nghĩa với `BANK`).
 *  - `gateway` — cổng nào đẩy giao dịch về (mỗi cổng một định dạng báo cáo).
 *
 * Mốc thời gian: `BANK` dùng `transaction_date` — giờ NGÂN HÀNG ghi nhận, chứ
 * không phải `created_at` là lúc webhook về tới hệ thống. Hai mốc này lệch nhau
 * khi cổng đẩy chậm hoặc gửi bù, và sao kê thì luôn tính theo giờ ngân hàng.
 */

export type ReconciliationChannel = 'BANK' | 'VNPAY' | 'REFUND';

export interface ReconciliationRow {
  id: string;
  /** Nguồn tiền — quyết định dòng này đối chiếu với báo cáo của bên nào. */
  channel: ReconciliationChannel;
  /** Mã bên kia trả về: mã sao kê ngân hàng, hoặc `vnp_TransactionNo`. */
  external_id: string;
  gateway: string;
  /** Chỉ có nghĩa với `BANK`; với cổng thanh toán thì rỗng. */
  account_number: string;
  amount: number;
  content: string;
  /** Mã tham chiếu do hệ thống sinh và in lên QR. */
  ref_code: string | null;
  transaction_date: string;
  match_status: BankTransactionMatchStatus;
  match_reason: string | null;
  cafe_id: string | null;
  cafe_name: string | null;
  /** Mã giao dịch thanh toán đã khớp — null nếu chưa khớp được. */
  txn_ref: string | null;
  /** Số tiền hệ thống ĐANG CHỜ thu, để nhìn ra chênh lệch thu thiếu/thu dư. */
  expected_amount: number | null;
  /** Tiền này trả cho việc gì: đặt sân, mua gói, hay phí dự giải. */
  subject: 'BOOKING' | 'PACKAGE' | 'CONTEST' | null;
  subject_id: string | null;
  resolved_by_name: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
}

export interface ReconciliationSummary {
  /** Tổng số dòng khớp bộ lọc — mẫu số của mọi tỉ lệ bên dưới. */
  total_count: number;
  /** Tổng tiền thu vào trong kỳ (Inflow). */
  total_amount: number;
  /** Riêng tiền vào tài khoản ngân hàng — con số so với SAO KÊ NGÂN HÀNG. */
  bank_count: number;
  bank_amount: number;
  /** Riêng tiền qua cổng — con số so với BÁO CÁO ĐỐI SOÁT CỦA VNPAY. */
  vnpay_count: number;
  vnpay_amount: number;
  /** Tiền hoàn trả khách (Outflow) trong kỳ. */
  refund_count: number;
  refund_amount: number;
  /** Doanh thu thực nhận sau khi trừ tiền hoàn trả. */
  net_amount: number;
  matched_count: number;
  matched_amount: number;
  needs_review_count: number;
  needs_review_amount: number;
  ignored_count: number;
  ignored_amount: number;
  /**
   * Tiền đã vào mà hệ thống chưa gắn được vào đơn nào — con số phải đưa về 0
   * khi chốt sổ. Chỉ phát sinh ở nguồn `BANK`; dòng `VNPAY` luôn đã khớp nên
   * đóng góp bằng nhau vào cả tử lẫn mẫu và tự triệt tiêu.
   */
  unreconciled_amount: number;
}

export interface ReconciliationQuery {
  from?: string;
  to?: string;
  cafeId?: string;
  channel?: ReconciliationChannel;
  status?: BankTransactionMatchStatus;
  /** Tìm theo mã bên kia trả về, mã tham chiếu, mã giao dịch, hoặc nội dung. */
  q?: string;
  page: number;
  limit: number;
}

export interface ReconciliationResult {
  items: ReconciliationRow[];
  total: number;
  page: number;
  limit: number;
  summary: ReconciliationSummary;
}

/** Trần số dòng một lần xuất tệp — quá mức này thì thu hẹp khoảng ngày lại. */
export const EXPORT_ROW_LIMIT = 5000;

/**
 * Hai nguồn tiền nhập thành một tập cột chung.
 *
 * `UNION ALL` chứ không `UNION`: hai nhánh lấy từ hai bảng khác nhau nên không
 * thể trùng dòng, mà `UNION` thì bắt Postgres sắp xếp toàn bộ kết quả chỉ để
 * khử trùng lặp không tồn tại.
 *
 * `$1` là id chủ sân, dùng ở cả hai nhánh.
 */
const NGUON = `
  SELECT
    bt.id::text                     AS id,
    'BANK'                          AS channel,
    bt.external_id                  AS external_id,
    bt.gateway                      AS gateway,
    bt.account_number               AS account_number,
    bt.amount                       AS amount,
    bt.content                      AS content,
    bt.ref_code                     AS ref_code,
    bt.transaction_date             AS transaction_date,
    bt.match_status                 AS match_status,
    bt.match_reason                 AS match_reason,
    bt.cafe_id                      AS cafe_id,
    c.name                          AS cafe_name,
    bt.resolved_by                  AS resolved_by,
    bt.resolved_at                  AS resolved_at,
    bt.resolution_note              AS resolution_note,
    pt.txn_ref                      AS txn_ref,
    pt.amount                       AS expected_amount,
    CASE
      WHEN pt.booking_id IS NOT NULL              THEN 'BOOKING'
      WHEN pt.customer_package_id IS NOT NULL     THEN 'PACKAGE'
      WHEN pt.contest_registration_id IS NOT NULL THEN 'CONTEST'
      ELSE NULL
    END                             AS subject,
    COALESCE(pt.booking_id, pt.customer_package_id, pt.contest_registration_id) AS subject_id
  FROM bank_transactions bt
  JOIN cafes c ON c.id = bt.cafe_id AND c.deleted_at IS NULL
  -- LEFT JOIN, không phải JOIN: giao dịch chưa khớp thì không có
  -- payment_transaction nào, mà đó lại đúng là những dòng cần nhìn nhất.
  LEFT JOIN payment_transactions pt ON pt.id = bt.payment_transaction_id
  WHERE bt.deleted_at IS NULL AND c.provider_id = $1

  UNION ALL

  SELECT
    pt.id::text,
    'VNPAY',
    -- Ưu tiên cột riêng; các bản ghi cũ (trước khi cột này được ghi) thì đào
    -- lại trong raw_response. Không có thì để rỗng — thà trống còn hơn bịa ra
    -- một mã không tra được ở đâu.
    COALESCE(pt.gateway_transaction_id, pt.raw_response->>'vnp_TransactionNo', ''),
    pt.gateway,
    '',
    pt.amount,
    COALESCE(pt.raw_response->>'vnp_OrderInfo', pt.txn_ref),
    pt.payment_ref_code,
    -- Không có cột paid_at; updated_at là lúc giao dịch chuyển sang SUCCESS,
    -- gần đúng nhất với giờ cổng ghi nhận.
    pt.updated_at,
    'MATCHED',
    NULL,
    c.id,
    c.name,
    NULL, NULL, NULL,
    pt.txn_ref,
    pt.amount,
    CASE
      WHEN pt.booking_id IS NOT NULL              THEN 'BOOKING'
      WHEN pt.customer_package_id IS NOT NULL     THEN 'PACKAGE'
      WHEN pt.contest_registration_id IS NOT NULL THEN 'CONTEST'
      ELSE NULL
    END,
    COALESCE(pt.booking_id, pt.customer_package_id, pt.contest_registration_id)
  FROM payment_transactions pt
  LEFT JOIN bookings b               ON b.id  = pt.booking_id
  LEFT JOIN customer_packages cp     ON cp.id = pt.customer_package_id
  LEFT JOIN contest_registrations cr ON cr.id = pt.contest_registration_id
  LEFT JOIN contests ct              ON ct.id = cr.contest_id
  -- Ba đường về chi nhánh vì một khoản trả có thể là đặt sân, mua gói, hoặc phí
  -- dự giải. JOIN (không LEFT): không truy được về chi nhánh nào thì không
  -- thuộc sổ của chủ sân nào cả.
  JOIN cafes c ON c.id = COALESCE(b.cafe_id, cp.cafe_id, ct.cafe_id) AND c.deleted_at IS NULL
  WHERE pt.gateway = 'VNPAY' AND pt.status = 'SUCCESS' AND c.provider_id = $1

  UNION ALL

  SELECT
    pt.id::text,
    'REFUND',
    COALESCE(pt.gateway_transaction_id, pt.txn_ref),
    pt.gateway,
    '',
    pt.amount,
    COALESCE(
      CASE
        WHEN pt.raw_response->>'method' = 'CASH' THEN 'Hoàn tiền mặt cho khách'
        WHEN pt.raw_response->>'method' = 'BANK_TRANSFER' THEN 'Hoàn tiền chuyển khoản cho khách'
        ELSE 'Hoàn tiền hủy đơn / cọc xe'
      END,
      pt.txn_ref
    ),
    pt.payment_ref_code,
    pt.updated_at,
    'MATCHED',
    NULL,
    c.id,
    c.name,
    NULL,
    NULL,
    pt.raw_response->>'auditAction',
    pt.txn_ref,
    pt.amount,
    CASE
      WHEN pt.booking_id IS NOT NULL              THEN 'BOOKING'
      WHEN pt.customer_package_id IS NOT NULL     THEN 'PACKAGE'
      WHEN pt.contest_registration_id IS NOT NULL THEN 'CONTEST'
      ELSE NULL
    END,
    COALESCE(pt.booking_id, pt.customer_package_id, pt.contest_registration_id)
  FROM payment_transactions pt
  LEFT JOIN bookings b               ON b.id  = pt.booking_id
  LEFT JOIN customer_packages cp     ON cp.id = pt.customer_package_id
  LEFT JOIN contest_registrations cr ON cr.id = pt.contest_registration_id
  LEFT JOIN contests ct              ON ct.id = cr.contest_id
  JOIN cafes c ON c.id = COALESCE(b.cafe_id, cp.cafe_id, ct.cafe_id) AND c.deleted_at IS NULL
  WHERE pt.type = 'REFUND' AND pt.status = 'SUCCESS' AND c.provider_id = $1
`;

/**
 * Dựng mệnh đề WHERE dùng chung cho cả ba lượt truy vấn: đếm, lấy trang, và
 * tính tổng.
 *
 * Bắt buộc dùng chung một hàm. Nếu ba lượt tự viết điều kiện riêng thì chỉ cần
 * lệch một dấu là bảng hiện một tập dòng còn ô tổng cộng lại tính trên tập
 * khác — và người đối soát sẽ ngồi cộng tay cả bảng để tìm xem mình sai ở đâu,
 * trong khi cái sai nằm ở đây.
 */
function buildWhere(
  providerId: string,
  q: ReconciliationQuery | Omit<ReconciliationQuery, 'page' | 'limit'>,
): { sql: string; params: unknown[] } {
  const params: unknown[] = [providerId];
  const parts: string[] = ['TRUE'];

  if (q.from) {
    params.push(q.from);
    parts.push(`n.transaction_date >= $${params.length}`);
  }
  if (q.to) {
    params.push(q.to);
    parts.push(`n.transaction_date <= $${params.length}`);
  }
  if (q.cafeId) {
    params.push(q.cafeId);
    parts.push(`n.cafe_id = $${params.length}`);
  }
  if (q.channel) {
    params.push(q.channel);
    parts.push(`n.channel = $${params.length}`);
  }
  if (q.status) {
    params.push(q.status);
    parts.push(`n.match_status = $${params.length}`);
  }
  if (q.q) {
    params.push(`%${q.q}%`);
    const p = `$${params.length}`;
    // Bốn trường vì người đối soát cầm trong tay một trong bốn thứ, tuỳ họ tra
    // từ phía nào: dòng sao kê (external_id), báo cáo cổng (external_id hoặc
    // txn_ref), ảnh QR khách gửi (ref_code), hay chỉ nhớ mang máng nội dung.
    parts.push(
      `(n.external_id ILIKE ${p} OR n.ref_code ILIKE ${p} OR n.content ILIKE ${p} OR n.txn_ref ILIKE ${p})`,
    );
  }

  return { sql: parts.join(' AND '), params };
}

/** Khối FROM chung: tập hợp nhất rồi đính tên người xử lý. */
const BASE_FROM = `
  FROM (${NGUON}) n
  LEFT JOIN users u ON u.id = n.resolved_by
`;

const SELECT_COLUMNS = `
  n.id, n.channel, n.external_id, n.gateway, n.account_number, n.amount, n.content,
  n.ref_code, n.transaction_date, n.match_status, n.match_reason,
  n.cafe_id, n.cafe_name, n.resolved_at, n.resolution_note,
  n.txn_ref, n.expected_amount, n.subject, n.subject_id,
  u.full_name AS resolved_by_name
`;

/** Chuẩn hoá một dòng SQL thô về đúng kiểu trả ra ngoài. */
function toRow(r: Record<string, unknown>): ReconciliationRow {
  return {
    id: String(r.id),
    channel: r.channel as ReconciliationChannel,
    external_id: String(r.external_id ?? ''),
    gateway: String(r.gateway ?? ''),
    account_number: String(r.account_number ?? ''),
    // ⚠️ `numeric` về dạng CHUỖI qua driver. Không ép kiểu thì cộng hai giao
    // dịch ra "100000200000" thay vì 300000.
    amount: Number(r.amount),
    content: String(r.content ?? ''),
    ref_code: (r.ref_code as string) ?? null,
    transaction_date: r.transaction_date
      ? r.transaction_date instanceof Date
        ? r.transaction_date.toISOString()
        : new Date(String(r.transaction_date)).toISOString()
      : new Date().toISOString(),
    match_status: r.match_status as BankTransactionMatchStatus,
    match_reason: (r.match_reason as string) ?? null,
    cafe_id: (r.cafe_id as string) ?? null,
    cafe_name: (r.cafe_name as string) ?? null,
    txn_ref: (r.txn_ref as string) ?? null,
    expected_amount: r.expected_amount == null ? null : Number(r.expected_amount),
    subject: (r.subject as ReconciliationRow['subject']) ?? null,
    subject_id: (r.subject_id as string) ?? null,
    resolved_by_name: (r.resolved_by_name as string) ?? null,
    resolved_at: r.resolved_at
      ? r.resolved_at instanceof Date
        ? r.resolved_at.toISOString()
        : new Date(String(r.resolved_at)).toISOString()
      : null,
    resolution_note: (r.resolution_note as string) ?? null,
  };
}

/**
 * Sổ đối soát của một chủ sân trong một kỳ.
 *
 * Ba lượt truy vấn thay vì một: đếm tổng, lấy trang hiện tại, và tính tổng
 * tiền. Không gộp được vì tổng phải tính trên TOÀN kỳ chứ không phải trên
 * trang đang xem — người đối soát cần con số so với báo cáo, mà báo cáo thì
 * không phân trang.
 */
export async function listProviderReconciliation(
  providerId: string,
  query: ReconciliationQuery,
): Promise<ReconciliationResult> {
  const { sql: where, params } = buildWhere(providerId, query);

  const [countRow] = await AppDataSource.query(
    `SELECT COUNT(*)::int AS n ${BASE_FROM} WHERE ${where}`,
    params,
  );
  const total = Number(countRow?.n ?? 0);

  const offset = (query.page - 1) * query.limit;
  const rows = await AppDataSource.query(
    `SELECT ${SELECT_COLUMNS} ${BASE_FROM}
      WHERE ${where}
      ORDER BY n.transaction_date DESC, n.id DESC
      LIMIT ${query.limit} OFFSET ${offset}`,
    params,
  );

  const [t] = await AppDataSource.query(
    `SELECT
       COUNT(*)::int                                                          AS total_count,
       COALESCE(SUM(n.amount) FILTER (WHERE n.channel IN ('BANK', 'VNPAY')), 0) AS total_amount,
       COUNT(*) FILTER (WHERE n.channel = 'BANK')::int                        AS bank_count,
       COALESCE(SUM(n.amount) FILTER (WHERE n.channel = 'BANK'), 0)           AS bank_amount,
       COUNT(*) FILTER (WHERE n.channel = 'VNPAY')::int                       AS vnpay_count,
       COALESCE(SUM(n.amount) FILTER (WHERE n.channel = 'VNPAY'), 0)          AS vnpay_amount,
       COUNT(*) FILTER (WHERE n.channel = 'REFUND')::int                      AS refund_count,
       COALESCE(SUM(n.amount) FILTER (WHERE n.channel = 'REFUND'), 0)         AS refund_amount,
       COUNT(*) FILTER (WHERE n.match_status = 'MATCHED' AND n.channel != 'REFUND')::int AS matched_count,
       COALESCE(SUM(n.amount) FILTER (WHERE n.match_status = 'MATCHED' AND n.channel != 'REFUND'), 0) AS matched_amount,
       COUNT(*) FILTER (WHERE n.match_status = 'NEEDS_REVIEW')::int           AS needs_review_count,
       COALESCE(SUM(n.amount) FILTER (WHERE n.match_status = 'NEEDS_REVIEW'), 0) AS needs_review_amount,
       COUNT(*) FILTER (WHERE n.match_status = 'IGNORED')::int                AS ignored_count,
       COALESCE(SUM(n.amount) FILTER (WHERE n.match_status = 'IGNORED'), 0)   AS ignored_amount
     ${BASE_FROM} WHERE ${where}`,
    params,
  );

  const matched = Number(t?.matched_amount ?? 0);
  const totalInflow = Number(t?.total_amount ?? 0);
  const refundAmount = Number(t?.refund_amount ?? 0);

  return {
    items: rows.map(toRow),
    total,
    page: query.page,
    limit: query.limit,
    summary: {
      total_count: Number(t?.total_count ?? 0),
      total_amount: totalInflow,
      bank_count: Number(t?.bank_count ?? 0),
      bank_amount: Number(t?.bank_amount ?? 0),
      vnpay_count: Number(t?.vnpay_count ?? 0),
      vnpay_amount: Number(t?.vnpay_amount ?? 0),
      refund_count: Number(t?.refund_count ?? 0),
      refund_amount: refundAmount,
      net_amount: Math.max(0, totalInflow - refundAmount),
      matched_count: Number(t?.matched_count ?? 0),
      matched_amount: matched,
      needs_review_count: Number(t?.needs_review_count ?? 0),
      needs_review_amount: Number(t?.needs_review_amount ?? 0),
      ignored_count: Number(t?.ignored_count ?? 0),
      ignored_amount: Number(t?.ignored_amount ?? 0),
      unreconciled_amount: totalInflow - matched,
    },
  };
}

/** `dd/MM/yyyy HH:mm:ss` theo giờ Việt Nam — sắp xếp được và đọc quen mắt. */
function formatNgayGio(d: Date): string {
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
    .formatToParts(d)
    .reduce<Record<string, string>>((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}:${p.second}`;
}

/** Bọc một ô CSV: nhân đôi dấu nháy kép rồi mới bao ngoài. */
function csvCell(value: unknown): string {
  if (value == null) return '';
  const s = String(value);
  // Nội dung chuyển khoản có dấu phẩy là chuyện thường; không bọc thì cả dòng
  // lệch cột từ đó về sau.
  return `"${s.replace(/"/g, '""')}"`;
}

const CSV_HEADERS = [
  'Nguon',
  'Ma doi soat',
  'Cong',
  'So tai khoan',
  'Chi nhanh',
  'Ngay giao dich',
  'So tien',
  'Noi dung',
  'Ma tham chieu',
  'Trang thai',
  'Ly do',
  'Ma giao dich he thong',
  'So tien cho thu',
  'Chenh lech',
  'Loai',
  'Nguoi xu ly',
  'Ghi chu',
];

const STATUS_LABEL: Record<string, string> = {
  MATCHED: 'Da khop',
  NEEDS_REVIEW: 'Can kiem tra',
  IGNORED: 'Da bo qua',
};

const CHANNEL_LABEL: Record<ReconciliationChannel, string> = {
  BANK: 'Chuyen khoan',
  VNPAY: 'VNPay',
  REFUND: 'Hoan tien',
};

/**
 * Xuất kỳ đang lọc ra CSV để mở cạnh tệp sao kê ngân hàng hoặc báo cáo VNPay.
 *
 * Không phân trang — người ta xuất ra để cộng cả kỳ, một tệp thiếu mất trang
 * hai thì tổng sai mà nhìn vào không biết là đang thiếu. Thay vào đó chặn ở
 * `EXPORT_ROW_LIMIT` và báo lỗi rõ ràng để thu hẹp khoảng ngày.
 */
export async function exportProviderReconciliationCsv(
  providerId: string,
  query: Omit<ReconciliationQuery, 'page' | 'limit'>,
): Promise<string> {
  const { sql: where, params } = buildWhere(providerId, query);

  const [countRow] = await AppDataSource.query(
    `SELECT COUNT(*)::int AS n ${BASE_FROM} WHERE ${where}`,
    params,
  );
  const n = Number(countRow?.n ?? 0);
  if (n > EXPORT_ROW_LIMIT) {
    throw new AppError(
      `Khoảng thời gian này có ${n.toLocaleString('vi-VN')} giao dịch, vượt mức ${EXPORT_ROW_LIMIT.toLocaleString('vi-VN')} dòng mỗi tệp. Hãy thu hẹp khoảng ngày rồi xuất lại.`,
      400,
      'EXPORT_TOO_LARGE',
    );
  }

  const rows: Record<string, unknown>[] = await AppDataSource.query(
    `SELECT ${SELECT_COLUMNS} ${BASE_FROM}
      WHERE ${where}
      ORDER BY n.transaction_date ASC, n.id ASC`,
    params,
  );

  const lines = [CSV_HEADERS.join(',')];
  for (const raw of rows) {
    const r = toRow(raw);
    const lech = r.expected_amount == null ? '' : r.amount - r.expected_amount;
    lines.push(
      [
        CHANNEL_LABEL[r.channel] ?? r.channel,
        r.external_id,
        r.gateway,
        r.account_number,
        r.cafe_name,
        // Giờ Việt Nam, không phải UTC: người đọc đối chiếu với sao kê in ra
        // theo giờ địa phương, lệch 7 tiếng là lệch hẳn sang ngày hôm trước.
        //
        // Ngày trước giờ, và ngày/tháng đủ hai chữ số. Để `toLocaleString`
        // mặc định thì ra "21:53:58 11/8/2026" — giờ đứng trước, nên sort cột
        // này trong Excel là xếp theo giờ trong ngày, các tháng trộn lẫn vào
        // nhau.
        formatNgayGio(new Date(r.transaction_date)),
        r.amount,
        r.content,
        r.ref_code,
        STATUS_LABEL[r.match_status] ?? r.match_status,
        r.match_reason,
        r.txn_ref,
        r.expected_amount,
        lech,
        r.subject,
        r.resolved_by_name,
        r.resolution_note,
      ]
        .map(csvCell)
        .join(','),
    );
  }

  // BOM UTF-8: thiếu nó thì Excel trên Windows đọc CSV theo bảng mã hệ thống,
  // và mọi tên chi nhánh có dấu tiếng Việt hiện thành ký tự rác.
  return '﻿' + lines.join('\r\n');
}
