import { AppDataSource } from '../../config/database';
import {
  ContestEntryFeePaymentStatus,
  ContestFeeOrderStatus,
  ContestLedgerDirection,
  ContestRegistrationStatus,
} from '../../types';

export interface ContestFinanceCategoryTotal {
  category: string;
  total: number;
  count: number;
}

export interface ContestFinanceReport {
  contest_id: string;
  entry_fee: {
    collected_total: number;
    collected_by_method: {
      ONLINE: number;
      CASH: number;
      TRANSFER: number;
      UNKNOWN: number;
    };
    pending_total: number;
    waived_total: number;
    counts: { collected: number; pending: number; waived: number };
  };
  income: {
    total: number;
    by_category: ContestFinanceCategoryTotal[];
  };
  expense: {
    total: number;
    by_category: ContestFinanceCategoryTotal[];
    platform_fee: {
      amount: number;
      plan_name: string | null;
      editable: false;
    };
  };
  summary: {
    total_income: number;
    total_expense: number;
    net: number;
  };
}

/** Nhóm chờ thu gồm cả đơn đã khai chuyển khoản mà nền tảng chưa đối soát. */
const PENDING_STATUSES = [
  ContestEntryFeePaymentStatus.PENDING_PAYMENT,
  ContestEntryFeePaymentStatus.PENDING_REVIEW,
];

type RegistrationRow = {
  entry_fee_amount: string | null;
  payment_status: string;
  status: string;
  entry_fee_payment_method: string | null;
};

type LedgerRow = {
  direction: string;
  category: string;
  total: string;
  count: string;
};

/**
 * Gộp báo cáo tài chính của một giải từ ba nguồn, tính tại chỗ.
 *
 * Không cache và không bảng tổng hợp: mỗi giải chỉ cỡ vài chục đăng ký và vài
 * chục bút toán, trong khi cache sẽ đẻ ra bài toán vô hiệu hoá mỗi lần sửa/xoá
 * bút toán — đúng thứ FR-015 cấm.
 *
 * ⚠️ Mọi cột `numeric` đọc lên đều là **chuỗi**. Cộng thẳng sẽ nối chuỗi thay vì
 * cộng số, nên chỗ nào cũng phải bọc `Number()`.
 */
export async function buildContestFinanceReport(contestId: string): Promise<ContestFinanceReport> {
  const [registrations, ledgerRows, feeOrder] = await Promise.all([
    loadRegistrations(contestId),
    loadLedgerTotals(contestId),
    loadPaidFeeOrder(contestId),
  ]);

  const entryFee = summariseEntryFees(registrations);
  const income = summariseLedger(ledgerRows, ContestLedgerDirection.IN);
  const expense = summariseLedger(ledgerRows, ContestLedgerDirection.OUT);

  const platformFeeAmount = feeOrder ? Number(feeOrder.amount) : 0;

  // Phí tổ chức nằm trong tổng chi nhưng KHÔNG nằm trong `by_category`: nó là
  // dòng tính động từ contest_fee_orders, không phải bút toán trong sổ, nên
  // không sửa/xoá được và cũng không thuộc loại khoản nào.
  const totalExpense = expense.total + platformFeeAmount;

  // Lệ phí đã miễn cố ý đứng ngoài tổng thu — đó là doanh thu bỏ qua, hiển thị
  // để tham khảo chứ không phải tiền đã nhận.
  const totalIncome = entryFee.collected_total + income.total;

  return {
    contest_id: contestId,
    entry_fee: entryFee,
    income: { total: income.total, by_category: income.by_category },
    expense: {
      total: totalExpense,
      by_category: expense.by_category,
      platform_fee: {
        amount: platformFeeAmount,
        plan_name: feeOrder?.plan_name ?? null,
        editable: false,
      },
    },
    summary: {
      total_income: totalIncome,
      total_expense: totalExpense,
      net: totalIncome - totalExpense,
    },
  };
}

async function loadRegistrations(contestId: string): Promise<RegistrationRow[]> {
  return AppDataSource.query<RegistrationRow[]>(
    `SELECT entry_fee_amount, payment_status, status, entry_fee_payment_method
       FROM contest_registrations
      WHERE contest_id = $1`,
    [contestId],
  );
}

async function loadLedgerTotals(contestId: string): Promise<LedgerRow[]> {
  return AppDataSource.query<LedgerRow[]>(
    `SELECT direction, category, SUM(amount) AS total, COUNT(*) AS count
       FROM contest_ledger_entries
      WHERE contest_id = $1 AND deleted_at IS NULL
      GROUP BY direction, category
      ORDER BY category ASC`,
    [contestId],
  );
}

async function loadPaidFeeOrder(
  contestId: string,
): Promise<{ amount: string; plan_name: string | null } | null> {
  const rows = await AppDataSource.query<{ amount: string; plan_name: string | null }[]>(
    `SELECT o.amount, p.name AS plan_name
       FROM contest_fee_orders o
       LEFT JOIN contest_fee_plans p ON p.id = o.plan_id
      WHERE o.contest_id = $1 AND o.status = $2
      ORDER BY o.created_at DESC
      LIMIT 1`,
    [contestId, ContestFeeOrderStatus.PAID],
  );
  return rows[0] ?? null;
}

function summariseEntryFees(rows: RegistrationRow[]): ContestFinanceReport['entry_fee'] {
  const byMethod = { ONLINE: 0, CASH: 0, TRANSFER: 0, UNKNOWN: 0 };
  let collected = 0;
  let pending = 0;
  let waived = 0;
  const counts = { collected: 0, pending: 0, waived: 0 };

  for (const row of rows) {
    const amount = Number(row.entry_fee_amount ?? 0);
    const isCollected = row.payment_status === ContestEntryFeePaymentStatus.MARKED_PAID;

    // Đăng ký đã huỷ mà chưa từng thu tiền biến mất khỏi mọi nhóm: giữ nó ở
    // "chờ thu" là đếm một khoản không bao giờ về, tức tiền ảo.
    if (row.status === ContestRegistrationStatus.CANCELLED && !isCollected) continue;

    if (isCollected) {
      collected += amount;
      counts.collected += 1;
      const method = row.entry_fee_payment_method;
      if (method === 'ONLINE' || method === 'CASH' || method === 'TRANSFER') {
        byMethod[method] += amount;
      } else {
        // Bản ghi có trước khi hệ thống ghi phương thức. Gán bừa vào tiền mặt
        // sẽ làm hỏng việc đối chiếu sao kê, nên để riêng một nhóm.
        byMethod.UNKNOWN += amount;
      }
      continue;
    }

    if (PENDING_STATUSES.includes(row.payment_status as ContestEntryFeePaymentStatus)) {
      pending += amount;
      counts.pending += 1;
      continue;
    }

    if (row.payment_status === ContestEntryFeePaymentStatus.WAIVED) {
      waived += amount;
      counts.waived += 1;
    }

    // NOT_REQUIRED (giải miễn phí) không xuất hiện ở nhóm nào — thêm vào chỉ tạo
    // dòng 0đ vô nghĩa.
  }

  return {
    collected_total: collected,
    collected_by_method: byMethod,
    pending_total: pending,
    waived_total: waived,
    counts,
  };
}

function summariseLedger(
  rows: LedgerRow[],
  direction: ContestLedgerDirection,
): { total: number; by_category: ContestFinanceCategoryTotal[] } {
  const matching = rows.filter((row) => row.direction === direction);
  const byCategory = matching.map((row) => ({
    category: row.category,
    total: Number(row.total),
    count: Number(row.count),
  }));
  const total = byCategory.reduce((sum, item) => sum + item.total, 0);
  return { total, by_category: byCategory };
}
