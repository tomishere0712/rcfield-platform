import { AppDataSource } from '../config/database';
import { logger } from '../config/logger';
import { BankTransaction } from '../models/bank-transaction.entity';
import { PaymentTransaction } from '../models/payment-transaction.entity';
import {
  AppError,
  BankTransactionMatchReason,
  BankTransactionMatchStatus,
  PaymentTransactionStatus,
  UserRole,
} from '../types';
import { assertCafeOwner, getCafeOrThrow } from './cafe.service';
import { isStaffAssignedToCafe } from './contest.helpers';
import { createNotification } from './notification.service';
import { processConfirmationResult } from './payment.service';
import { wsService } from './websocket.service';

/**
 * Sổ đối soát giao dịch ngân hàng.
 *
 * Hai mức truy cập, cố ý tách hẳn nhau:
 *
 * - **Chủ chi nhánh** thấy toàn bộ sổ và các con số tổng. Đây là tiền của họ.
 * - **Nhân viên** chỉ thấy đúng những giao dịch ĐANG TREO của chi nhánh mình,
 *   không thấy giao dịch đã xử lý xong và không thấy bất kỳ con số tổng nào.
 *   Họ cần xử lý được khách đang đứng ở quầy, không cần biết quán thu bao nhiêu.
 */

export interface BankTransactionView {
  id: string;
  amount: number;
  content: string;
  ref_code: string | null;
  transaction_date: string;
  match_status: BankTransactionMatchStatus;
  match_reason: BankTransactionMatchReason | null;
  booking_id: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
}

interface Actor {
  userId: string;
  role: UserRole;
}

function toView(row: BankTransaction, bookingId: string | null): BankTransactionView {
  return {
    id: row.id,
    // ⚠️ `numeric` về dạng chuỗi.
    amount: Number(row.amount),
    content: row.content,
    ref_code: row.refCode,
    transaction_date: row.transactionDate.toISOString(),
    match_status: row.matchStatus,
    match_reason: row.matchReason,
    booking_id: bookingId,
    resolved_by: row.resolvedBy,
    resolved_at: row.resolvedAt?.toISOString() ?? null,
    resolution_note: row.resolutionNote,
  };
}

/** Tra `booking_id` cho các hàng đã khớp, gộp một lượt để tránh N+1. */
async function loadBookingIds(rows: BankTransaction[]): Promise<Map<string, string>> {
  const txIds = rows.map((r) => r.paymentTransactionId).filter((id): id is string => !!id);
  if (txIds.length === 0) return new Map();

  const found = await AppDataSource.getRepository(PaymentTransaction).find({
    where: txIds.map((id) => ({ id })),
  });
  return new Map(found.filter((tx) => tx.bookingId).map((tx) => [tx.id, tx.bookingId as string]));
}

// ── Chủ chi nhánh: sổ đầy đủ ─────────────────────────────────────────────────

export interface OwnerLedgerResult {
  items: BankTransactionView[];
  total: number;
  summary: {
    matched_total: number;
    needs_review_count: number;
  };
}

export async function listForOwner(
  cafeId: string,
  providerId: string,
  options: { status?: BankTransactionMatchStatus; page: number; limit: number },
): Promise<OwnerLedgerResult> {
  const cafe = await getCafeOrThrow(cafeId);
  assertCafeOwner(cafe, providerId);

  const repo = AppDataSource.getRepository(BankTransaction);

  // Vị từ ở đây phải khớp vị từ của `ix_bank_transactions_cafe`
  // (`deleted_at IS NULL`), nếu không Postgres bỏ qua index.
  const qb = repo
    .createQueryBuilder('bt')
    .where('bt.deleted_at IS NULL')
    .andWhere('bt.cafe_id = :cafeId', { cafeId });

  if (options.status) {
    qb.andWhere('bt.match_status = :status', { status: options.status });
  }

  const total = await qb.clone().getCount();

  const rows = await qb
    .orderBy('bt.transaction_date', 'DESC')
    .skip((options.page - 1) * options.limit)
    .take(options.limit)
    .getMany();

  const bookingIds = await loadBookingIds(rows);

  const [totals] = await AppDataSource.query(
    `SELECT
       COALESCE(SUM(amount) FILTER (WHERE match_status = $2), 0) AS matched_total,
       COUNT(*) FILTER (WHERE match_status = $3)                 AS needs_review_count
     FROM bank_transactions
     WHERE cafe_id = $1 AND deleted_at IS NULL`,
    [cafeId, BankTransactionMatchStatus.MATCHED, BankTransactionMatchStatus.NEEDS_REVIEW],
  );

  return {
    items: rows.map((row) =>
      toView(
        row,
        row.paymentTransactionId ? (bookingIds.get(row.paymentTransactionId) ?? null) : null,
      ),
    ),
    total,
    summary: {
      matched_total: Number(totals.matched_total),
      needs_review_count: Number(totals.needs_review_count),
    },
  };
}

// ── Nhân viên: chỉ hàng đợi đang treo ────────────────────────────────────────

/** Chủ sở hữu hoặc nhân viên được phân công vào chi nhánh. */
async function assertOperator(cafeId: string, actor: Actor): Promise<void> {
  const cafe = await getCafeOrThrow(cafeId);

  if (actor.role === UserRole.PROVIDER) {
    assertCafeOwner(cafe, actor.userId);
    return;
  }

  if (actor.role === UserRole.STAFF) {
    if (await isStaffAssignedToCafe(actor.userId, cafeId)) return;
    throw new AppError('Nhân viên không thuộc chi nhánh này', 403, 'FORBIDDEN');
  }

  throw new AppError('Bạn không có quyền xem đối soát của chi nhánh này', 403, 'FORBIDDEN');
}

/**
 * Hàng đợi xử lý.
 *
 * KHÔNG trả `summary` và không nhận tham số trạng thái: nhân viên chỉ được thấy
 * phần đang treo. Trả về mảng phẳng chứ không phải đối tượng phân trang cũng là
 * cố ý — không có chỗ nào để lỡ tay nhét một con số tổng vào.
 */
export async function listPendingForOperator(
  cafeId: string,
  actor: Actor,
): Promise<BankTransactionView[]> {
  await assertOperator(cafeId, actor);

  const rows = await AppDataSource.getRepository(BankTransaction)
    .createQueryBuilder('bt')
    .where('bt.deleted_at IS NULL')
    .andWhere('bt.cafe_id = :cafeId', { cafeId })
    .andWhere('bt.match_status = :status', {
      status: BankTransactionMatchStatus.NEEDS_REVIEW,
    })
    // Giao dịch vào tài khoản lạ là chuyện của chủ quán, không phải của nhân viên.
    .andWhere('(bt.match_reason IS NULL OR bt.match_reason <> :unknown)', {
      unknown: BankTransactionMatchReason.UNKNOWN_ACCOUNT,
    })
    .orderBy('bt.created_at', 'DESC')
    .take(100)
    .getMany();

  const bookingIds = await loadBookingIds(rows);
  return rows.map((row) =>
    toView(
      row,
      row.paymentTransactionId ? (bookingIds.get(row.paymentTransactionId) ?? null) : null,
    ),
  );
}

// ── Gán tay ──────────────────────────────────────────────────────────────────

export async function assignToBooking(
  transactionId: string,
  actor: Actor,
  body: { booking_id: string; note?: string },
): Promise<BankTransactionView> {
  const repo = AppDataSource.getRepository(BankTransaction);
  const row = await repo.findOne({ where: { id: transactionId } });
  if (!row) throw new AppError('Giao dịch không tồn tại', 404, 'TRANSACTION_NOT_FOUND');
  if (!row.cafeId) {
    throw new AppError(
      'Giao dịch chưa xác định được chi nhánh, không gán được.',
      409,
      'TRANSACTION_HAS_NO_CAFE',
    );
  }

  await assertOperator(row.cafeId, actor);

  if (row.matchStatus !== BankTransactionMatchStatus.NEEDS_REVIEW) {
    throw new AppError('Giao dịch này đã được xử lý rồi.', 409, 'TRANSACTION_ALREADY_RESOLVED');
  }

  const txRepo = AppDataSource.getRepository(PaymentTransaction);
  const tx = await txRepo.findOne({
    where: { bookingId: body.booking_id, status: PaymentTransactionStatus.PENDING },
    order: { createdAt: 'DESC' },
  });
  if (!tx) {
    throw new AppError(
      'Đơn hàng này không có giao dịch nào đang chờ thanh toán.',
      404,
      'NO_PENDING_PAYMENT',
    );
  }

  if (Number(tx.amount) !== Number(row.amount)) {
    throw new AppError(
      `Số tiền không khớp: giao dịch ${Number(row.amount).toLocaleString('vi-VN')}đ, ` +
        `đơn hàng cần ${Number(tx.amount).toLocaleString('vi-VN')}đ.`,
      400,
      'AMOUNT_MISMATCH',
    );
  }

  // Đi qua ĐÚNG hàm xác nhận mà webhook và VNPay dùng. Nghĩa là gán tay cũng
  // KHÔNG cứu được một booking đã hết hạn giữ chỗ — người vận hành vẫn phải
  // hoàn tiền. Đó là ràng buộc có chủ đích, không phải thiếu sót.
  const confirmation = await processConfirmationResult({
    txnRef: tx.txnRef,
    isValid: true,
    isSuccess: true,
    amount: Number(tx.amount),
    responseCode: '00',
    raw: { manualAssign: true, byUserId: actor.userId, bankTransactionId: row.id },
  });

  if (confirmation.rspCode !== '00' && confirmation.rspCode !== '02') {
    throw new AppError(
      confirmation.rspCode === '99'
        ? 'Đơn hàng đã quá hạn giữ chỗ, không xác nhận lại được. Cần hoàn tiền cho khách.'
        : `Không xác nhận được đơn hàng (mã ${confirmation.rspCode}).`,
      409,
      'BOOKING_NOT_CONFIRMABLE',
    );
  }

  row.matchStatus = BankTransactionMatchStatus.MATCHED;
  row.paymentTransactionId = tx.id;
  row.resolvedBy = actor.userId;
  row.resolvedAt = new Date();
  row.resolutionNote = body.note ?? null;

  const saved = await repo.save(row);

  logger.info('BankTransaction', 'gán tay giao dịch vào đơn hàng', {
    transactionId,
    bookingId: body.booking_id,
    actorId: actor.userId,
    actorRole: actor.role,
  });

  return toView(saved, body.booking_id);
}

/** Đánh dấu một khoản tiền là không liên quan. Chỉ chủ quán làm được. */
export async function markIgnored(
  transactionId: string,
  providerId: string,
  body: { note: string },
): Promise<BankTransactionView> {
  const repo = AppDataSource.getRepository(BankTransaction);
  const row = await repo.findOne({ where: { id: transactionId } });
  if (!row) throw new AppError('Giao dịch không tồn tại', 404, 'TRANSACTION_NOT_FOUND');

  if (row.cafeId) {
    const cafe = await getCafeOrThrow(row.cafeId);
    assertCafeOwner(cafe, providerId);
  }

  if (row.matchStatus !== BankTransactionMatchStatus.NEEDS_REVIEW) {
    throw new AppError('Giao dịch này đã được xử lý rồi.', 409, 'TRANSACTION_ALREADY_RESOLVED');
  }

  row.matchStatus = BankTransactionMatchStatus.IGNORED;
  row.resolvedBy = providerId;
  row.resolvedAt = new Date();
  row.resolutionNote = body.note;

  const saved = await repo.save(row);
  logger.info('BankTransaction', 'đánh dấu giao dịch không liên quan', {
    transactionId,
    providerId,
  });
  return toView(saved, null);
}

// ── Thông báo ────────────────────────────────────────────────────────────────

/**
 * Báo cho chủ chi nhánh khi có giao dịch rơi vào trạng thái cần xử lý.
 *
 * Không có bước này, tiền của khách nằm im trong tài khoản mà không ai biết cho
 * tới khi họ gọi điện khiếu nại.
 */
export async function notifyNeedsReview(
  cafeId: string,
  amount: number,
  reason: BankTransactionMatchReason,
): Promise<void> {
  try {
    const cafe = await getCafeOrThrow(cafeId);

    const readable: Partial<Record<BankTransactionMatchReason, string>> = {
      [BankTransactionMatchReason.NO_REF_CODE]: 'khách chuyển sai nội dung',
      [BankTransactionMatchReason.REF_NOT_FOUND]: 'mã tham chiếu không khớp đơn nào',
      [BankTransactionMatchReason.SHORT_PAID]: 'khách chuyển thiếu tiền',
      [BankTransactionMatchReason.ALREADY_PAID]: 'đơn đã thanh toán rồi',
      [BankTransactionMatchReason.SESSION_REPLACED]: 'khách đã đổi cách thanh toán',
      [BankTransactionMatchReason.BOOKING_EXPIRED]: 'tiền về sau khi hết hạn giữ chỗ',
      [BankTransactionMatchReason.UNKNOWN_ACCOUNT]: 'tài khoản nhận không nhận ra',
    };

    const message =
      `Nhận ${amount.toLocaleString('vi-VN')}đ nhưng chưa ghép được vào đơn nào ` +
      `(${readable[reason] ?? 'cần kiểm tra'}). Vào mục Đối soát để xử lý.`;

    await createNotification(
      cafe.providerId,
      'BANK_TRANSFER_NEEDS_REVIEW' as never,
      'Có khoản tiền cần đối soát',
      message,
      { cafeId, amount, reason, route: `/provider/cafes/${cafeId}/payments` },
    );

    wsService.pushToCafe(cafeId, 'BANK_TRANSFER_NEEDS_REVIEW', { cafeId, amount, reason });
  } catch (err) {
    // Không thông báo được thì vẫn phải ghi sổ xong — mất thông báo còn cứu
    // được, mất bản ghi thì mất luôn dấu vết của tiền.
    logger.error('BankTransaction', 'không gửi được thông báo đối soát', err);
  }
}
