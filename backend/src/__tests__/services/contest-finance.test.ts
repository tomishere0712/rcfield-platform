import { AppDataSource } from '../../config/database';
import { buildContestFinanceReport } from '../../services/contest/finance';
import {
  ContestEntryFeePaymentStatus,
  ContestLedgerDirection,
  ContestRegistrationStatus,
  ProviderStatus,
  UserRole,
  VehicleSource,
} from '../../types';
import { createTestCafe, createTestUser } from '../helpers';

/**
 * Test cho hàm gộp báo cáo tài chính giải đấu.
 *
 * Viết trước phần hiện thực theo Nguyên tắc V của Constitution: hàm này quyết
 * định con số tiền mà chủ doanh nghiệp dựa vào để ra quyết định kinh doanh, và
 * có 6 nhánh phân loại trạng thái thanh toán nên rất dễ sai âm thầm.
 */

const ENTRY_FEE = 200_000;

async function activateProvider(providerId: string): Promise<void> {
  await AppDataSource.query(
    `INSERT INTO provider_profiles (user_id, business_name, registration_status)
     VALUES ($1, $2, $3)`,
    [providerId, 'Finance Provider', ProviderStatus.ACTIVE],
  );
}

async function createContest(
  providerId: string,
  cafeId: string,
  entryFee = ENTRY_FEE,
): Promise<string> {
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
     VALUES
       ($1, $2, 'Giải test tài chính', $3, $4, $5,
        $6, $7, NOW() - INTERVAL '1 day', NOW() + INTERVAL '5 day',
        $8, $9, NOW() + INTERVAL '7 day', NOW() + INTERVAL '8 day', 32, $10, 'OPEN', $2)
     RETURNING id`,
    [
      cafeId,
      providerId,
      trackType.code,
      trackType.id,
      contestType.id,
      contestFormat.id,
      contestTemplate.id,
      JSON.stringify({ vehicle_policy: 'BYOC_ONLY', assignment_policy: 'AT_CHECK_IN' }),
      JSON.stringify({ format: 'KNOCKOUT', runtime_format: 'KNOCKOUT' }),
      entryFee,
    ],
  );
  return contest.id;
}

/** Tạo một đăng ký với trạng thái thanh toán chỉ định. */
async function addRegistration(
  contestId: string,
  options: {
    paymentStatus: ContestEntryFeePaymentStatus;
    /** Số tiền chốt lúc đăng ký. Mặc định bằng lệ phí giải. */
    entryFeeAmount?: number;
    status?: ContestRegistrationStatus;
    paymentMethod?: string | null;
  },
): Promise<string> {
  const user = await createTestUser({ role: UserRole.CUSTOMER });
  const [row] = await AppDataSource.query<{ id: string }[]>(
    `INSERT INTO contest_registrations
       (contest_id, user_id, vehicle_source, status, check_in_code,
        entry_fee_amount, payment_status, entry_fee_payment_method)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      contestId,
      user.id,
      VehicleSource.BYOC,
      options.status ?? ContestRegistrationStatus.CONFIRMED,
      `CODE${Date.now()}${Math.floor(Math.random() * 100000)}`,
      options.entryFeeAmount ?? ENTRY_FEE,
      options.paymentStatus,
      options.paymentMethod ?? null,
    ],
  );
  return row.id;
}

async function addLedgerEntry(
  contestId: string,
  createdBy: string,
  options: {
    direction: ContestLedgerDirection;
    category: string;
    amount: number;
    softDeleted?: boolean;
  },
): Promise<void> {
  await AppDataSource.query(
    `INSERT INTO contest_ledger_entries
       (contest_id, direction, category, title, amount, occurred_at,
        created_by, created_by_role, deleted_at)
     VALUES ($1, $2, $3, 'Khoản test', $4, NOW(), $5, $6, $7)`,
    [
      contestId,
      options.direction,
      options.category,
      options.amount,
      createdBy,
      UserRole.PROVIDER,
      options.softDeleted ? new Date() : null,
    ],
  );
}

/** Tạo đơn phí tổ chức giải với trạng thái chỉ định. */
async function addFeeOrder(
  contestId: string,
  providerId: string,
  status: string,
  amount: number,
): Promise<void> {
  const [plan] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM contest_fee_plans ORDER BY display_order ASC LIMIT 1`,
  );
  await AppDataSource.query(
    `INSERT INTO contest_fee_orders (contest_id, provider_id, plan_id, status, amount, featured_days)
     VALUES ($1, $2, $3, $4, $5, 7)`,
    [contestId, providerId, plan.id, status, amount],
  );
}

describe('buildContestFinanceReport', () => {
  let providerId: string;
  let cafeId: string;

  // `jest-setup.ts` truncate cả `users` lẫn `cafes` ở mỗi `beforeEach`, nên
  // dựng lại provider và chi nhánh cho từng test thay vì một lần ở `beforeAll`.
  beforeEach(async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    providerId = provider.id;
    await activateProvider(providerId);
    const cafe = await createTestCafe({ provider_id: providerId });
    cafeId = cafe.id;
  });

  it('giải chưa có gì trả về mọi số bằng 0, không ném lỗi', async () => {
    const contestId = await createContest(providerId, cafeId);
    const report = await buildContestFinanceReport(contestId);

    expect(report.entry_fee.collected_total).toBe(0);
    expect(report.entry_fee.pending_total).toBe(0);
    expect(report.income.total).toBe(0);
    expect(report.expense.total).toBe(0);
    expect(report.summary.net).toBe(0);
  });

  it('gom lệ phí theo đúng nhóm: đã thu / chờ thu / đã miễn', async () => {
    const contestId = await createContest(providerId, cafeId);
    await addRegistration(contestId, {
      paymentStatus: ContestEntryFeePaymentStatus.MARKED_PAID,
    });
    await addRegistration(contestId, {
      paymentStatus: ContestEntryFeePaymentStatus.MARKED_PAID,
    });
    await addRegistration(contestId, {
      paymentStatus: ContestEntryFeePaymentStatus.PENDING_PAYMENT,
    });
    await addRegistration(contestId, { paymentStatus: ContestEntryFeePaymentStatus.WAIVED });

    const report = await buildContestFinanceReport(contestId);

    expect(report.entry_fee.collected_total).toBe(ENTRY_FEE * 2);
    expect(report.entry_fee.pending_total).toBe(ENTRY_FEE);
    expect(report.entry_fee.waived_total).toBe(ENTRY_FEE);
    expect(report.entry_fee.counts).toEqual({ collected: 2, pending: 1, waived: 1 });
  });

  it('PENDING_REVIEW xếp vào chờ thu, không phải đã thu', async () => {
    const contestId = await createContest(providerId, cafeId);
    await addRegistration(contestId, {
      paymentStatus: ContestEntryFeePaymentStatus.PENDING_REVIEW,
    });

    const report = await buildContestFinanceReport(contestId);

    expect(report.entry_fee.pending_total).toBe(ENTRY_FEE);
    expect(report.entry_fee.collected_total).toBe(0);
  });

  it('lệ phí đã miễn KHÔNG cộng vào tổng thu', async () => {
    const contestId = await createContest(providerId, cafeId);
    await addRegistration(contestId, { paymentStatus: ContestEntryFeePaymentStatus.WAIVED });

    const report = await buildContestFinanceReport(contestId);

    expect(report.entry_fee.waived_total).toBe(ENTRY_FEE);
    expect(report.summary.total_income).toBe(0);
  });

  it('đọc lệ phí từ snapshot trên đăng ký, không từ contests.entry_fee', async () => {
    const contestId = await createContest(providerId, cafeId);
    await addRegistration(contestId, {
      paymentStatus: ContestEntryFeePaymentStatus.MARKED_PAID,
      entryFeeAmount: ENTRY_FEE,
    });

    // Chủ doanh nghiệp đổi mức lệ phí sau khi đã có người đăng ký. Con số đã thu
    // phải giữ nguyên theo mức lúc đăng ký, không nhảy theo mức mới.
    await AppDataSource.query(`UPDATE contests SET entry_fee = $1 WHERE id = $2`, [
      ENTRY_FEE * 5,
      contestId,
    ]);

    const report = await buildContestFinanceReport(contestId);
    expect(report.entry_fee.collected_total).toBe(ENTRY_FEE);
  });

  it('đăng ký đã huỷ mà chưa từng thu tiền bị loại khỏi mọi nhóm', async () => {
    const contestId = await createContest(providerId, cafeId);
    await addRegistration(contestId, {
      paymentStatus: ContestEntryFeePaymentStatus.PENDING_PAYMENT,
      status: ContestRegistrationStatus.CANCELLED,
    });

    const report = await buildContestFinanceReport(contestId);

    expect(report.entry_fee.pending_total).toBe(0);
    expect(report.entry_fee.counts).toEqual({ collected: 0, pending: 0, waived: 0 });
  });

  it('đăng ký đã huỷ nhưng đã thu tiền vẫn nằm ở nhóm đã thu', async () => {
    const contestId = await createContest(providerId, cafeId);
    await addRegistration(contestId, {
      paymentStatus: ContestEntryFeePaymentStatus.MARKED_PAID,
      status: ContestRegistrationStatus.CANCELLED,
    });

    const report = await buildContestFinanceReport(contestId);
    expect(report.entry_fee.collected_total).toBe(ENTRY_FEE);
  });

  it('tách lệ phí đã thu theo phương thức, khoản chưa rõ gom vào UNKNOWN', async () => {
    const contestId = await createContest(providerId, cafeId);
    await addRegistration(contestId, {
      paymentStatus: ContestEntryFeePaymentStatus.MARKED_PAID,
      paymentMethod: 'ONLINE',
    });
    await addRegistration(contestId, {
      paymentStatus: ContestEntryFeePaymentStatus.MARKED_PAID,
      paymentMethod: 'CASH',
    });
    await addRegistration(contestId, {
      paymentStatus: ContestEntryFeePaymentStatus.MARKED_PAID,
      paymentMethod: null,
    });

    const report = await buildContestFinanceReport(contestId);

    expect(report.entry_fee.collected_by_method.ONLINE).toBe(ENTRY_FEE);
    expect(report.entry_fee.collected_by_method.CASH).toBe(ENTRY_FEE);
    expect(report.entry_fee.collected_by_method.TRANSFER).toBe(0);
    expect(report.entry_fee.collected_by_method.UNKNOWN).toBe(ENTRY_FEE);

    const sum =
      report.entry_fee.collected_by_method.ONLINE +
      report.entry_fee.collected_by_method.CASH +
      report.entry_fee.collected_by_method.TRANSFER +
      report.entry_fee.collected_by_method.UNKNOWN;
    expect(sum).toBe(report.entry_fee.collected_total);
  });

  it('cộng bút toán thủ công đúng, và cộng số chứ không nối chuỗi', async () => {
    const contestId = await createContest(providerId, cafeId);
    await addLedgerEntry(contestId, providerId, {
      direction: ContestLedgerDirection.IN,
      category: 'SPONSORSHIP',
      amount: 1_500_000,
    });
    await addLedgerEntry(contestId, providerId, {
      direction: ContestLedgerDirection.IN,
      category: 'TICKET',
      amount: 200_000,
    });
    await addLedgerEntry(contestId, providerId, {
      direction: ContestLedgerDirection.OUT,
      category: 'PRIZE_CASH',
      amount: 1_000_000,
    });

    const report = await buildContestFinanceReport(contestId);

    // Cột numeric của TypeORM trả về chuỗi; quên Number() sẽ ra "1500000200000".
    expect(report.income.total).toBe(1_700_000);
    expect(typeof report.income.total).toBe('number');
    expect(report.expense.total).toBe(1_000_000);

    const sponsorship = report.income.by_category.find((c) => c.category === 'SPONSORSHIP');
    expect(sponsorship).toEqual({ category: 'SPONSORSHIP', total: 1_500_000, count: 1 });
  });

  it('bút toán đã xoá mềm không lọt vào bất kỳ tổng nào', async () => {
    const contestId = await createContest(providerId, cafeId);
    await addLedgerEntry(contestId, providerId, {
      direction: ContestLedgerDirection.OUT,
      category: 'VENUE',
      amount: 500_000,
      softDeleted: true,
    });

    const report = await buildContestFinanceReport(contestId);

    expect(report.expense.total).toBe(0);
    expect(report.expense.by_category).toHaveLength(0);
  });

  it('phí tổ chức chỉ tính đơn đã PAID và không sửa được', async () => {
    const paidContestId = await createContest(providerId, cafeId);
    await addFeeOrder(paidContestId, providerId, 'PAID', 500_000);

    const pendingContestId = await createContest(providerId, cafeId);
    await addFeeOrder(pendingContestId, providerId, 'PENDING_REVIEW', 500_000);

    const paidReport = await buildContestFinanceReport(paidContestId);
    const pendingReport = await buildContestFinanceReport(pendingContestId);

    expect(paidReport.expense.platform_fee.amount).toBe(500_000);
    expect(paidReport.expense.platform_fee.editable).toBe(false);
    expect(pendingReport.expense.platform_fee.amount).toBe(0);
  });

  it('phí tổ chức nằm trong tổng chi nhưng không nằm trong nhóm theo loại', async () => {
    const contestId = await createContest(providerId, cafeId);
    await addFeeOrder(contestId, providerId, 'PAID', 500_000);
    await addLedgerEntry(contestId, providerId, {
      direction: ContestLedgerDirection.OUT,
      category: 'PRIZE_CASH',
      amount: 300_000,
    });

    const report = await buildContestFinanceReport(contestId);

    expect(report.expense.total).toBe(800_000);
    const byCategoryTotal = report.expense.by_category.reduce((sum, c) => sum + c.total, 0);
    expect(byCategoryTotal).toBe(300_000);
  });

  it('ròng = tổng thu − tổng chi, có cả phí tổ chức trong tổng chi', async () => {
    const contestId = await createContest(providerId, cafeId);
    await addRegistration(contestId, {
      paymentStatus: ContestEntryFeePaymentStatus.MARKED_PAID,
    });
    await addLedgerEntry(contestId, providerId, {
      direction: ContestLedgerDirection.IN,
      category: 'SPONSORSHIP',
      amount: 2_000_000,
    });
    await addLedgerEntry(contestId, providerId, {
      direction: ContestLedgerDirection.OUT,
      category: 'PRIZE_CASH',
      amount: 1_500_000,
    });
    await addFeeOrder(contestId, providerId, 'PAID', 500_000);

    const report = await buildContestFinanceReport(contestId);

    expect(report.summary.total_income).toBe(ENTRY_FEE + 2_000_000);
    expect(report.summary.total_expense).toBe(2_000_000);
    expect(report.summary.net).toBe(report.summary.total_income - report.summary.total_expense);
  });
});
