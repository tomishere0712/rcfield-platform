import { AppDataSource } from '../config/database';
import { logger } from '../config/logger';
import { PaymentRequest } from '../models/payment-request.entity';
import { ProviderProfile } from '../models/provider-profile.entity';
import { SubscriptionPlan } from '../models/subscription-plan.entity';
import { AppError, NotificationType, PaymentRequestStatus } from '../types';
import { createNotification } from './notification.service';
import { activateFromPayment } from './subscription.service';
import { emailService } from './email.service';

interface SubmitBody {
  plan_id: string;
  transfer_reference: string;
  transfer_date: string;
  transfer_amount: number;
}

export async function submit(providerId: string, body: SubmitBody): Promise<PaymentRequest> {
  const repo = AppDataSource.getRepository(PaymentRequest);
  const existing = await repo.findOne({
    where: { providerId, status: PaymentRequestStatus.PENDING },
  });
  if (existing) {
    throw new AppError(
      'Bạn đã có yêu cầu thanh toán đang chờ xử lý',
      409,
      'PAYMENT_REQUEST_PENDING',
    );
  }

  const plan = await AppDataSource.getRepository(SubscriptionPlan).findOne({
    where: { id: body.plan_id },
  });
  if (!plan) {
    throw new AppError('Gói đăng ký không tồn tại', 404, 'SUBSCRIPTION_PLAN_NOT_FOUND');
  }

  // Gói dùng thử được cấp tự động một lần khi duyệt hồ sơ, không phải thứ mua
  // được. Chặn ở đây chứ không chỉ ẩn nút bên giao diện: `confirm()` cộng thẳng
  // 30 ngày cho bất kỳ gói nào, nên một yêu cầu gói dùng thử lọt qua là mở
  // đường dùng miễn phí vô hạn.
  if (plan.isTrial) {
    const profile = await AppDataSource.getRepository(ProviderProfile).findOne({
      where: { userId: providerId },
    });
    if (profile?.trialUsedAt) {
      throw new AppError(
        'Bạn đã sử dụng gói dùng thử. Mỗi tài khoản chỉ được dùng thử một lần.',
        409,
        'TRIAL_ALREADY_USED',
      );
    }
    throw new AppError(
      'Gói dùng thử được kích hoạt tự động khi hồ sơ được duyệt, không cần thanh toán.',
      400,
      'TRIAL_NOT_PURCHASABLE',
    );
  }

  const request = repo.create({
    providerId,
    planId: body.plan_id,
    transferReference: body.transfer_reference,
    transferDate: body.transfer_date,
    transferAmount: body.transfer_amount,
    status: PaymentRequestStatus.PENDING,
  });
  return repo.save(request) as Promise<PaymentRequest>;
}

/**
 * Ghi nhận một yêu cầu thanh toán là đã trả xong và kích hoạt gói.
 *
 * Dùng chung cho hai đường vào, khác nhau đúng ở chỗ ai xác nhận:
 *   • admin đối soát khoản chuyển khoản tay  → `reviewedBy` là admin đó;
 *   • cổng thanh toán báo đã nhận tiền       → `reviewedBy` để trống, vì không
 *     có người nào duyệt cả.
 */
async function applyConfirmation(
  request: PaymentRequest,
  reviewedBy: string | null,
  notes?: string,
): Promise<void> {
  const { userRows, planRows, sub } = await AppDataSource.transaction(async (manager) => {
    request.status = PaymentRequestStatus.CONFIRMED;
    request.reviewedBy = reviewedBy;
    request.reviewedAt = new Date();
    if (notes) request.adminNotes = notes;
    await manager.save(request);

    const activatedSub = await activateFromPayment(request.providerId, request.planId);

    await AppDataSource.query(
      `UPDATE cafes SET deleted_at = NULL, updated_at = NOW()
       WHERE provider_id = $1 AND deleted_at IS NOT NULL`,
      [request.providerId],
    );

    const users = await manager.query(`SELECT email, full_name FROM users WHERE id = $1`, [
      request.providerId,
    ]);
    const plans = await manager.query(`SELECT name FROM subscription_plans WHERE id = $1`, [
      request.planId,
    ]);

    return { userRows: users, planRows: plans, sub: activatedSub };
  });

  // Gửi email thông báo kích hoạt gói thành công
  if (userRows.length && planRows.length && sub) {
    void emailService
      .sendSubscriptionConfirmed({
        to: userRows[0].email,
        providerName: userRows[0].full_name,
        planName: planRows[0].name,
        amount: Number(request.transferAmount),
        startDate: sub.startedAt,
        endDate: sub.expiresAt,
      })
      .catch((err) => {
        logger.error('PaymentRequest', 'gửi email xác nhận gói thất bại', err);
      });
  }

  await createNotification(
    request.providerId,
    NotificationType.PAYMENT_REQUEST_CONFIRMED,
    'Thanh toán được xác nhận',
    'Gói đăng ký của bạn đã được kích hoạt thành công.',
  );
}

/** Admin đối soát khoản chuyển khoản tay rồi duyệt. */
export async function confirm(requestId: string, adminId: string, notes?: string): Promise<void> {
  const repo = AppDataSource.getRepository(PaymentRequest);
  const request = await repo.findOne({ where: { id: requestId } });
  if (!request) throw new AppError('Yêu cầu không tồn tại', 404, 'NOT_FOUND');
  if (request.status !== PaymentRequestStatus.PENDING) {
    throw new AppError('Yêu cầu đã được xử lý', 400, 'ALREADY_PROCESSED');
  }
  await applyConfirmation(request, adminId, notes);
}

/**
 * Cổng thanh toán báo đã nhận tiền: kích hoạt luôn, không qua bước duyệt tay.
 *
 * Trả về lặng lẽ khi đơn không còn ở trạng thái chờ — webhook gửi trùng và trang
 * callback hỏi lại là chuyện bình thường, mà kích hoạt hai lần thì cộng dồn thêm
 * 30 ngày provider chưa trả tiền.
 */
export async function confirmFromGateway(
  request: PaymentRequest,
  gatewayNote: string,
): Promise<void> {
  if (request.status !== PaymentRequestStatus.PENDING) return;
  await applyConfirmation(request, null, gatewayNote);
}

export async function reject(requestId: string, adminId: string, reason: string): Promise<void> {
  const repo = AppDataSource.getRepository(PaymentRequest);
  const request = await repo.findOne({ where: { id: requestId } });
  if (!request) throw new AppError('Yêu cầu không tồn tại', 404, 'NOT_FOUND');
  if (request.status !== PaymentRequestStatus.PENDING) {
    throw new AppError('Yêu cầu đã được xử lý', 400, 'ALREADY_PROCESSED');
  }

  request.status = PaymentRequestStatus.REJECTED;
  request.reviewedBy = adminId;
  request.reviewedAt = new Date();
  request.adminNotes = reason;
  await repo.save(request);

  await createNotification(
    request.providerId,
    NotificationType.PAYMENT_REQUEST_REJECTED,
    'Thanh toán bị từ chối',
    `Lý do: ${reason}. Vui lòng kiểm tra lại thông tin và thử lại.`,
  );
}

export async function listForProvider(
  providerId: string,
  options: { page: number; limit: number },
): Promise<{ data: PaymentRequest[]; total: number }> {
  const repo = AppDataSource.getRepository(PaymentRequest);
  const [data, total] = await repo.findAndCount({
    where: { providerId },
    order: { createdAt: 'DESC' },
    skip: (options.page - 1) * options.limit,
    take: options.limit,
  });
  return { data, total };
}

export async function listAll(options: {
  status?: PaymentRequestStatus;
  page: number;
  limit: number;
}): Promise<{ data: unknown[]; total: number }> {
  const { status, page, limit } = options;

  let query = `
    SELECT
      pr.id, pr.provider_id, pr.plan_id, pr.status,
      pr.transfer_reference, pr.transfer_date, pr.transfer_amount,
      pr.admin_notes, pr.reviewed_by, pr.reviewed_at,
      pr.created_at,
      u.email, pp.business_name,
      sp.name as plan_name, sp.price_per_month
    FROM payment_requests pr
    JOIN users u ON u.id = pr.provider_id
    LEFT JOIN provider_profiles pp ON pp.user_id = pr.provider_id AND pp.deleted_at IS NULL
    LEFT JOIN subscription_plans sp ON sp.id = pr.plan_id
    WHERE pr.deleted_at IS NULL
  `;
  const params: unknown[] = [];

  if (status) {
    params.push(status);
    query += ` AND pr.status = $${params.length}`;
  }

  const countResult = await AppDataSource.query<[{ count: string }]>(
    `SELECT COUNT(*) as count FROM (${query}) t`,
    params,
  );
  const total = parseInt(countResult[0]?.count ?? '0', 10);

  params.push(limit, (page - 1) * limit);
  query += ` ORDER BY pr.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;

  const data = await AppDataSource.query(query, params);
  return { data, total };
}
