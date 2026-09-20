import { AppDataSource } from '../../config/database';
import { matchBankTransaction } from '../../services/bank-webhook.service';
import {
  BankTransactionGateway,
  BankTransactionMatchReason,
  BankTransactionMatchStatus,
  BookingStatus,
  PaymentTransactionStatus,
} from '../../types';
import { buildSePayPayload } from '../helpers/bank-webhook.helper';
import {
  countBankTransactions,
  findBankTransaction,
  seedBankPaymentScenario,
} from '../helpers/bank-payment.fixture';

/**
 * Đối soát tiền vào — logic tài chính, nên rơi thẳng vào Nguyên tắc V của
 * Constitution: test viết trước, xác nhận đỏ, rồi mới hiện thực.
 *
 * Mười ca dưới đây không phải để đạt độ phủ. Mỗi ca là một cách hệ thống có thể
 * ăn mất tiền của khách hoặc thu tiền hai lần, và tất cả đều xảy ra được trong
 * thực tế với luồng chuyển khoản — nơi khách hành động một chiều và mình không
 * kiểm soát được gì.
 */
describe('bank-webhook: đối soát tiền vào', () => {
  async function readBooking(bookingId: string) {
    const [row] = await AppDataSource.query(`SELECT * FROM bookings WHERE id = $1`, [bookingId]);
    return row;
  }

  async function readPaymentTx(id: string) {
    const [row] = await AppDataSource.query(`SELECT * FROM payment_transactions WHERE id = $1`, [
      id,
    ]);
    return row;
  }

  // ── Ca 1 ────────────────────────────────────────────────────────────────────
  it('rút được mã tham chiếu khi ngân hàng chèn thêm chữ vào nội dung', async () => {
    const fx = await seedBankPaymentScenario();

    const result = await matchBankTransaction(
      buildSePayPayload({
        content: `CT DEN:520 ${fx.refCode} TU MB CHUYEN TIEN`,
        accountNumber: fx.accountNumber,
        transferAmount: fx.amount,
      }),
      BankTransactionGateway.SANDBOX,
    );

    expect(result.matched).toBe(true);
    const booking = await readBooking(fx.bookingId);
    expect(booking.status).toBe(BookingStatus.CONFIRMED);
  });

  // ── Ca 2 ────────────────────────────────────────────────────────────────────
  it('nội dung không có mã thì treo lại và không đụng booking nào', async () => {
    const fx = await seedBankPaymentScenario();

    const payload = buildSePayPayload({
      content: 'chuyen tien mua ca phe',
      accountNumber: fx.accountNumber,
      transferAmount: fx.amount,
    });
    const result = await matchBankTransaction(payload, BankTransactionGateway.SANDBOX);

    expect(result.matched).toBe(false);
    const row = await findBankTransaction(String(payload.id));
    expect(row.match_status).toBe(BankTransactionMatchStatus.NEEDS_REVIEW);
    expect(row.match_reason).toBe(BankTransactionMatchReason.NO_REF_CODE);

    const booking = await readBooking(fx.bookingId);
    expect(booking.status).toBe(BookingStatus.PENDING);
  });

  // ── Ca 3 ────────────────────────────────────────────────────────────────────
  it('gửi lại cùng một giao dịch 10 lần chỉ ghi 1 hàng và xác nhận 1 lần', async () => {
    const fx = await seedBankPaymentScenario();
    const before = await countBankTransactions();

    const payload = buildSePayPayload({
      content: fx.refCode,
      accountNumber: fx.accountNumber,
      transferAmount: fx.amount,
    });

    for (let i = 0; i < 10; i += 1) {
      // Không được ném lỗi ở bất kỳ lần nào — dịch vụ đối soát gửi lại là
      // hành vi bình thường, trả khác 200 sẽ khiến nó gửi lại vô hạn.
      await matchBankTransaction(payload, BankTransactionGateway.SANDBOX);
    }

    expect(await countBankTransactions()).toBe(before + 1);

    const [{ count }] = await AppDataSource.query(
      `SELECT COUNT(*)::int AS count FROM payment_transactions
        WHERE id = $1 AND status = $2`,
      [fx.paymentTransactionId, PaymentTransactionStatus.SUCCESS],
    );
    expect(count).toBe(1);
  });

  // ── Ca 4 ────────────────────────────────────────────────────────────────────
  it('khách chuyển hai lần: khoản đầu xác nhận, khoản sau treo chờ hoàn', async () => {
    const fx = await seedBankPaymentScenario();

    const first = buildSePayPayload({
      content: fx.refCode,
      accountNumber: fx.accountNumber,
      transferAmount: fx.amount,
    });
    const second = buildSePayPayload({
      content: fx.refCode,
      accountNumber: fx.accountNumber,
      transferAmount: fx.amount,
    });

    const r1 = await matchBankTransaction(first, BankTransactionGateway.SANDBOX);
    const r2 = await matchBankTransaction(second, BankTransactionGateway.SANDBOX);

    expect(r1.matched).toBe(true);
    expect(r2.matched).toBe(false);

    const row2 = await findBankTransaction(String(second.id));
    expect(row2.match_status).toBe(BankTransactionMatchStatus.NEEDS_REVIEW);
    expect(row2.match_reason).toBe(BankTransactionMatchReason.ALREADY_PAID);
  });

  // ── Ca 5 ────────────────────────────────────────────────────────────────────
  it('chuyển thiếu tiền thì KHÔNG xác nhận booking', async () => {
    const fx = await seedBankPaymentScenario({ amount: 350000 });

    const payload = buildSePayPayload({
      content: fx.refCode,
      accountNumber: fx.accountNumber,
      transferAmount: 300000,
    });
    const result = await matchBankTransaction(payload, BankTransactionGateway.SANDBOX);

    expect(result.matched).toBe(false);
    const row = await findBankTransaction(String(payload.id));
    expect(row.match_reason).toBe(BankTransactionMatchReason.SHORT_PAID);

    const booking = await readBooking(fx.bookingId);
    expect(booking.status).toBe(BookingStatus.PENDING);
  });

  // ── Ca 6 ────────────────────────────────────────────────────────────────────
  it('chuyển thừa tiền thì vẫn xác nhận, phần chênh ghi rõ trong sổ', async () => {
    const fx = await seedBankPaymentScenario({ amount: 350000 });

    const payload = buildSePayPayload({
      content: fx.refCode,
      accountNumber: fx.accountNumber,
      transferAmount: 400000,
    });
    const result = await matchBankTransaction(payload, BankTransactionGateway.SANDBOX);

    expect(result.matched).toBe(true);
    const row = await findBankTransaction(String(payload.id));
    expect(row.match_status).toBe(BankTransactionMatchStatus.MATCHED);
    expect(row.match_reason).toBe(BankTransactionMatchReason.OVERPAID);
    // Số tiền lưu trong sổ là số THẬT ngân hàng báo, không phải số phải trả.
    expect(Number(row.amount)).toBe(400000);

    const booking = await readBooking(fx.bookingId);
    expect(booking.status).toBe(BookingStatus.CONFIRMED);
  });

  // ── Ca 7 ────────────────────────────────────────────────────────────────────
  it('tiền về sau khi hết hạn giữ chỗ thì treo, KHÔNG tự xác nhận lại', async () => {
    // Đây là ca dễ lọt nhất. Nếu bộ đối soát gọi `processMockConfirmation`
    // thay vì `processConfirmationResult`, booking sẽ được xác nhận và ca này đỏ.
    const fx = await seedBankPaymentScenario({ paymentExpiresInMinutes: -5 });

    const payload = buildSePayPayload({
      content: fx.refCode,
      accountNumber: fx.accountNumber,
      transferAmount: fx.amount,
    });
    const result = await matchBankTransaction(payload, BankTransactionGateway.SANDBOX);

    expect(result.matched).toBe(false);
    const row = await findBankTransaction(String(payload.id));
    expect(row.match_status).toBe(BankTransactionMatchStatus.NEEDS_REVIEW);
    expect(row.match_reason).toBe(BankTransactionMatchReason.BOOKING_EXPIRED);

    const booking = await readBooking(fx.bookingId);
    expect(booking.status).toBe(BookingStatus.PENDING);
  });

  // ── Ca 8 ────────────────────────────────────────────────────────────────────
  it('giao dịch thanh toán đã bị thay thế (FAILED) thì treo, không xác nhận', async () => {
    // Xảy ra khi khách chọn chuyển khoản, đổi ý sang VNPay, rồi vẫn quét mã QR cũ.
    // `processConfirmationResult` chỉ chặn trạng thái SUCCESS, nên hàng rào này
    // phải nằm ở tầng đối soát.
    const fx = await seedBankPaymentScenario({
      txStatus: PaymentTransactionStatus.FAILED,
    });

    const payload = buildSePayPayload({
      content: fx.refCode,
      accountNumber: fx.accountNumber,
      transferAmount: fx.amount,
    });
    const result = await matchBankTransaction(payload, BankTransactionGateway.SANDBOX);

    expect(result.matched).toBe(false);
    const row = await findBankTransaction(String(payload.id));
    expect(row.match_reason).toBe(BankTransactionMatchReason.SESSION_REPLACED);

    const booking = await readBooking(fx.bookingId);
    expect(booking.status).toBe(BookingStatus.PENDING);

    const tx = await readPaymentTx(fx.paymentTransactionId);
    expect(tx.status).toBe(PaymentTransactionStatus.FAILED);
  });

  // ── Ca 9 ────────────────────────────────────────────────────────────────────
  it('mã tham chiếu không tra ra giao dịch nào thì treo với lý do riêng', async () => {
    await seedBankPaymentScenario();

    const payload = buildSePayPayload({
      content: 'RCFZZZZZ',
      transferAmount: 350000,
    });
    const result = await matchBankTransaction(payload, BankTransactionGateway.SANDBOX);

    expect(result.matched).toBe(false);
    const row = await findBankTransaction(String(payload.id));
    expect(row.match_reason).toBe(BankTransactionMatchReason.REF_NOT_FOUND);
  });

  // ── Ca 10 ───────────────────────────────────────────────────────────────────
  it('tài khoản lạ vẫn được lưu để không mất dấu vết, không gắn chi nhánh', async () => {
    await seedBankPaymentScenario();

    const payload = buildSePayPayload({
      accountNumber: '9999999999',
      content: 'RCF7K2M9',
      transferAmount: 350000,
    });
    const result = await matchBankTransaction(payload, BankTransactionGateway.SANDBOX);

    expect(result.matched).toBe(false);
    const row = await findBankTransaction(String(payload.id));
    expect(row.cafe_id).toBeNull();
    expect(row.match_reason).toBe(BankTransactionMatchReason.UNKNOWN_ACCOUNT);
  });

  // ── Ca phụ: tiền ra không phải việc của mình ─────────────────────────────────
  it('bỏ qua giao dịch tiền ra, không ghi vào sổ', async () => {
    const fx = await seedBankPaymentScenario();
    const before = await countBankTransactions();

    const payload = buildSePayPayload({
      content: fx.refCode,
      accountNumber: fx.accountNumber,
      transferAmount: fx.amount,
      transferType: 'out',
    });
    const result = await matchBankTransaction(payload, BankTransactionGateway.SANDBOX);

    expect(result.ignored).toBe(true);
    expect(await countBankTransactions()).toBe(before);
  });

  // ── Ca phụ: toàn văn payload phải lưu lại ───────────────────────────────────
  it('lưu nguyên văn thông báo nhận được để còn đối chiếu khi tranh chấp', async () => {
    const fx = await seedBankPaymentScenario();

    const payload = buildSePayPayload({
      content: fx.refCode,
      accountNumber: fx.accountNumber,
      transferAmount: fx.amount,
    });
    await matchBankTransaction(payload, BankTransactionGateway.SANDBOX);

    const row = await findBankTransaction(String(payload.id));
    expect(row.raw_payload.referenceCode).toBe(payload.referenceCode);
    expect(row.raw_payload.transferAmount).toBe(payload.transferAmount);
  });
});
