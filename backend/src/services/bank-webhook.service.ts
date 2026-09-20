import { AppDataSource } from '../config/database';
import { logger } from '../config/logger';
import { BankTransaction } from '../models/bank-transaction.entity';
import { CafePaymentSetting } from '../models/cafe-payment-setting.entity';
import { PaymentTransaction } from '../models/payment-transaction.entity';
import {
  BankTransactionGateway,
  BankTransactionMatchReason,
  BankTransactionMatchStatus,
  CafePaymentMethod,
  PaymentTransactionStatus,
} from '../types';
import { notifyNeedsReview } from './bank-transaction.service';
import { processConfirmationResult } from './payment.service';
import { extractPaymentRefCode } from './vietqr';

/**
 * Đối soát tiền chuyển khoản về tài khoản chi nhánh.
 *
 * ⚠️ Xác nhận booking đi qua `processConfirmationResult` — CÙNG hàm luồng VNPay
 * dùng. Tuyệt đối không gọi `processMockConfirmation`: hàm đó là đường tắt cho
 * môi trường dev, thiếu cả kiểm số tiền lẫn guard hết hạn giữ chỗ, nên gọi nhầm
 * sẽ âm thầm xác nhận những booking đáng lẽ phải treo lại.
 *
 * Nguyên tắc xuyên suốt: hệ thống KHÔNG BAO GIỜ tự nuốt một khoản tiền nó không
 * chắc chắn. Mọi trường hợp mập mờ đều ghi vào sổ ở trạng thái chờ người xử lý,
 * vì tiền đã rời tài khoản khách rồi — mất dấu một khoản là mất tiền của họ.
 */

/** Định dạng thông báo của dịch vụ đối soát ngân hàng (SePay và tương đương). */
export interface SePayWebhookPayload {
  id: number;
  gateway: string;
  transactionDate: string;
  accountNumber: string;
  content: string;
  transferType: 'in' | 'out';
  transferAmount: number;
  referenceCode: string;
  accumulated?: number;
  subAccount?: string | null;
  code?: string | null;
  description?: string;
}

export interface MatchResult {
  matched: boolean;
  /** True khi thông báo không phải tiền vào — bỏ qua, không ghi sổ. */
  ignored?: boolean;
  /** True khi giao dịch này đã được ghi nhận từ trước. */
  duplicate?: boolean;
  bookingId?: string;
  reason?: BankTransactionMatchReason;
}

interface LedgerInput {
  payload: SePayWebhookPayload;
  gateway: BankTransactionGateway;
  cafeId: string | null;
  refCode: string | null;
  paymentTransactionId: string | null;
  status: BankTransactionMatchStatus;
  reason: BankTransactionMatchReason | null;
}

async function writeLedgerEntry(input: LedgerInput): Promise<BankTransaction> {
  const repo = AppDataSource.getRepository(BankTransaction);
  const entry = repo.create({
    gateway: input.gateway,
    externalId: String(input.payload.id),
    cafeId: input.cafeId,
    paymentTransactionId: input.paymentTransactionId,
    accountNumber: input.payload.accountNumber,
    amount: String(input.payload.transferAmount),
    content: input.payload.content,
    refCode: input.refCode,
    transactionDate: new Date(input.payload.transactionDate),
    matchStatus: input.status,
    matchReason: input.reason,
    rawPayload: input.payload as unknown as Record<string, unknown>,
  });
  const saved = await repo.save(entry);

  // Tiền đã nằm trong tài khoản chủ quán mà chưa ghép được vào đơn nào — phải
  // có người biết, nếu không nó nằm im tới lúc khách gọi điện khiếu nại.
  if (saved.matchStatus === BankTransactionMatchStatus.NEEDS_REVIEW && saved.cafeId) {
    await notifyNeedsReview(
      saved.cafeId,
      Number(saved.amount),
      saved.matchReason ?? BankTransactionMatchReason.REF_NOT_FOUND,
    );
  }

  return saved;
}

/** Tra chi nhánh theo số tài khoản nhận. */
async function findCafeByAccountNumber(accountNumber: string): Promise<string | null> {
  const settings = await AppDataSource.getRepository(CafePaymentSetting).findOne({
    where: {
      accountNumber,
      method: CafePaymentMethod.BANK_TRANSFER,
    },
  });
  return settings?.cafeId ?? null;
}

/**
 * Xử lý một thông báo tiền về theo đúng 11 bước ở contracts/api.md §B1.
 *
 * Không bao giờ ném lỗi cho thông báo hợp lệ về mặt xác thực — điểm gọi phải
 * trả 200 kể cả khi không khớp, nếu không dịch vụ đối soát sẽ gửi lại vô hạn.
 */
export async function matchBankTransaction(
  payload: SePayWebhookPayload,
  gateway: BankTransactionGateway,
): Promise<MatchResult> {
  // Bước 2 — chỉ quan tâm tiền vào.
  if (payload.transferType !== 'in') {
    return { matched: false, ignored: true };
  }

  const externalId = String(payload.id);

  // Bước 3 — chống trùng. Dịch vụ đối soát gửi lại là hành vi bình thường.
  const existing = await AppDataSource.getRepository(BankTransaction).findOne({
    where: { gateway, externalId },
  });
  if (existing) {
    return {
      matched: existing.matchStatus === BankTransactionMatchStatus.MATCHED,
      duplicate: true,
    };
  }

  // Bước 4 — tra chi nhánh. Không nhận ra thì vẫn lưu để không mất dấu vết.
  const cafeId = await findCafeByAccountNumber(payload.accountNumber);
  if (!cafeId) {
    await writeLedgerEntry({
      payload,
      gateway,
      cafeId: null,
      refCode: extractPaymentRefCode(payload.content),
      paymentTransactionId: null,
      status: BankTransactionMatchStatus.NEEDS_REVIEW,
      reason: BankTransactionMatchReason.UNKNOWN_ACCOUNT,
    });
    logger.warn('BankWebhook', 'tiền về tài khoản không thuộc chi nhánh nào', {
      accountNumber: payload.accountNumber,
      externalId,
    });
    return { matched: false, reason: BankTransactionMatchReason.UNKNOWN_ACCOUNT };
  }

  // Bước 5 — DÒ TÌM mã trong nội dung, không so khớp toàn chuỗi: ngân hàng
  // thường chèn thêm chữ vào nội dung trên đường đi.
  const refCode = extractPaymentRefCode(payload.content);
  if (!refCode) {
    await writeLedgerEntry({
      payload,
      gateway,
      cafeId,
      refCode: null,
      paymentTransactionId: null,
      status: BankTransactionMatchStatus.NEEDS_REVIEW,
      reason: BankTransactionMatchReason.NO_REF_CODE,
    });
    return { matched: false, reason: BankTransactionMatchReason.NO_REF_CODE };
  }

  // Bước 6 — tra giao dịch thanh toán theo mã tham chiếu.
  const txRepo = AppDataSource.getRepository(PaymentTransaction);
  const tx = await txRepo.findOne({ where: { paymentRefCode: refCode } });
  if (!tx) {
    await writeLedgerEntry({
      payload,
      gateway,
      cafeId,
      refCode,
      paymentTransactionId: null,
      status: BankTransactionMatchStatus.NEEDS_REVIEW,
      reason: BankTransactionMatchReason.REF_NOT_FOUND,
    });
    return { matched: false, reason: BankTransactionMatchReason.REF_NOT_FOUND };
  }

  // Bước 7 — giao dịch phải còn sống.
  //
  // `processConfirmationResult` chỉ chặn trạng thái SUCCESS. Một giao dịch
  // FAILED — do khách đổi phương thức thanh toán, hoặc do lần thử trước bị
  // thay thế — vẫn lọt qua và chạy tiếp xuống `transition()`. Với VNPay điều
  // này không xảy ra vì cổng không gọi lại một txnRef đã chết; với chuyển khoản
  // thì hoàn toàn có thể, vì mã QR cũ vẫn nằm trong lịch sử điện thoại khách.
  if (tx.status !== PaymentTransactionStatus.PENDING) {
    const reason =
      tx.status === PaymentTransactionStatus.SUCCESS
        ? BankTransactionMatchReason.ALREADY_PAID
        : BankTransactionMatchReason.SESSION_REPLACED;

    await writeLedgerEntry({
      payload,
      gateway,
      cafeId,
      refCode,
      paymentTransactionId: null,
      status: BankTransactionMatchStatus.NEEDS_REVIEW,
      reason,
    });
    logger.warn('BankWebhook', 'tiền về cho giao dịch không còn sống', {
      externalId,
      refCode,
      txStatus: tx.status,
      reason,
    });
    return { matched: false, reason };
  }

  // Bước 8 — đối chiếu số tiền. ⚠️ `numeric` về dạng chuỗi, phải Number().
  const expected = Number(tx.amount);
  const received = Number(payload.transferAmount);

  if (received < expected) {
    await writeLedgerEntry({
      payload,
      gateway,
      cafeId,
      refCode,
      paymentTransactionId: null,
      status: BankTransactionMatchStatus.NEEDS_REVIEW,
      reason: BankTransactionMatchReason.SHORT_PAID,
    });
    logger.warn('BankWebhook', 'khách chuyển thiếu', { externalId, expected, received });
    return { matched: false, reason: BankTransactionMatchReason.SHORT_PAID };
  }

  const isOverpaid = received > expected;

  // Bước 9 — xác nhận qua ĐÚNG hàm luồng VNPay dùng.
  //
  // Truyền `amount: expected` chứ không phải số thật nhận được: hàm dùng chung
  // so sánh bằng tuyệt đối, và nới điều kiện bên trong nó sẽ đổi hành vi luồng
  // VNPay đang chạy. Số tiền thật vẫn được ghi nguyên vào sổ đối soát bên dưới,
  // nên số liệu không bị bóp méo.
  const confirmation = await processConfirmationResult({
    txnRef: tx.txnRef,
    isValid: true,
    isSuccess: true,
    amount: expected,
    responseCode: '00',
    raw: payload as unknown as Record<string, unknown>,
  });

  // Bước 10 — booking đã hết hạn giữ chỗ.
  //
  // `processConfirmationResult` trả '99' khi booking không còn PENDING hoặc đã
  // quá `payment_expires_at`. Đây là tình huống tiền thật đã rời tài khoản khách
  // mà chỗ đã bị nhả — hệ thống KHÔNG tự xác nhận lại kể cả khi chỗ còn trống,
  // theo quyết định ở spec. Người vận hành quyết định giữ chỗ hay hoàn tiền.
  if (confirmation.rspCode !== '00' && confirmation.rspCode !== '02') {
    const reason =
      confirmation.rspCode === '99'
        ? BankTransactionMatchReason.BOOKING_EXPIRED
        : BankTransactionMatchReason.REF_NOT_FOUND;

    await writeLedgerEntry({
      payload,
      gateway,
      cafeId,
      refCode,
      paymentTransactionId: null,
      status: BankTransactionMatchStatus.NEEDS_REVIEW,
      reason,
    });
    logger.warn('BankWebhook', 'tiền về nhưng không xác nhận được booking', {
      externalId,
      refCode,
      rspCode: confirmation.rspCode,
      bookingId: tx.bookingId,
    });
    return { matched: false, reason, bookingId: tx.bookingId ?? undefined };
  }

  // Bước 11 — ghi sổ kết quả.
  await writeLedgerEntry({
    payload,
    gateway,
    cafeId,
    refCode,
    paymentTransactionId: tx.id,
    status: BankTransactionMatchStatus.MATCHED,
    reason: isOverpaid ? BankTransactionMatchReason.OVERPAID : null,
  });

  if (isOverpaid) {
    logger.warn('BankWebhook', 'khách chuyển thừa, cần hoàn phần chênh', {
      externalId,
      expected,
      received,
      excess: received - expected,
    });
  }

  logger.info('BankWebhook', 'đối soát khớp', {
    externalId,
    refCode,
    bookingId: tx.bookingId,
  });

  return {
    matched: true,
    bookingId: tx.bookingId ?? undefined,
    reason: isOverpaid ? BankTransactionMatchReason.OVERPAID : undefined,
  };
}
