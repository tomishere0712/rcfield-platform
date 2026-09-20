import { In } from 'typeorm';
import { AppDataSource } from '../config/database';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { Contest } from '../models/contest.entity';
import { ContestFeeOrder } from '../models/contest-fee-order.entity';
import { ContestFeePlan } from '../models/contest-fee-plan.entity';
import { FeaturedPopup } from '../models/featured-popup.entity';
import {
  AppError,
  ContestFeeOrderStatus,
  ContestStatus,
  FeaturedPopupAudienceScope,
  FeaturedPopupPlacement,
  FeaturedPopupReviewStatus,
  NotificationType,
  UserRole,
} from '../types';
import type { Viewer } from './cafe.service';
import { createNotification } from './notification.service';
import * as payosService from './payos.service';

/** Đơn còn hiệu lực: chưa bị từ chối hoặc huỷ. */
const LIVE_ORDER_STATUSES = [
  ContestFeeOrderStatus.PENDING_PAYMENT,
  ContestFeeOrderStatus.PENDING_REVIEW,
  ContestFeeOrderStatus.PAID,
];

function mapPlan(plan: ContestFeePlan) {
  return {
    id: plan.id,
    code: plan.code,
    name: plan.name,
    description: plan.description,
    price: Number(plan.price),
    featured_days: plan.featuredDays,
  };
}

function mapOrder(order: ContestFeeOrder, plan?: ContestFeePlan | null) {
  return {
    id: order.id,
    contest_id: order.contestId,
    provider_id: order.providerId,
    plan: plan ? mapPlan(plan) : null,
    status: order.status,
    amount: Number(order.amount),
    featured_days: order.featuredDays,
    transfer_reference: order.transferReference,
    transfer_date: order.transferDate,
    transfer_amount: order.transferAmount === null ? null : Number(order.transferAmount),
    payos_order_code: order.payosOrderCode,
    admin_notes: order.adminNotes,
    reviewed_at: order.reviewedAt,
    created_at: order.createdAt,
  };
}

export async function listContestFeePlans() {
  const plans = await AppDataSource.getRepository(ContestFeePlan).find({
    where: { isActive: true },
    order: { displayOrder: 'ASC' },
  });
  return plans.map(mapPlan);
}

async function getContestForProvider(contestId: string, viewer: Viewer): Promise<Contest> {
  const contest = await AppDataSource.getRepository(Contest).findOne({ where: { id: contestId } });
  if (!contest) throw new AppError('Contest không tồn tại', 404, 'CONTEST_NOT_FOUND');
  if (viewer.role !== UserRole.ADMIN && contest.providerId !== viewer.userId) {
    throw new AppError('Bạn không quản lý giải này', 403, 'FORBIDDEN');
  }
  return contest;
}

/** Đơn đang có hiệu lực của một giải, hoặc null nếu chưa đặt gói nào. */
export async function getLiveOrderForContest(contestId: string): Promise<ContestFeeOrder | null> {
  return AppDataSource.getRepository(ContestFeeOrder).findOne({
    where: { contestId, status: In(LIVE_ORDER_STATUSES) },
  });
}

export async function getContestFeeStatus(contestId: string, viewer: Viewer) {
  await getContestForProvider(contestId, viewer);
  const order = await getLiveOrderForContest(contestId);
  if (!order) return { order: null, plans: await listContestFeePlans() };

  const plan = await AppDataSource.getRepository(ContestFeePlan).findOne({
    where: { id: order.planId },
  });
  return { order: mapOrder(order, plan), plans: await listContestFeePlans() };
}

/**
 * Provider chọn gói cho một giải.
 *
 * Chốt giá và số ngày quảng bá vào đơn ngay lúc này: bảng giá đổi về sau không
 * được làm thay đổi đơn provider đã đặt.
 */
export async function createContestFeeOrder(contestId: string, viewer: Viewer, planId: string) {
  const contest = await getContestForProvider(contestId, viewer);
  if (contest.status !== ContestStatus.DRAFT) {
    throw new AppError(
      'Chỉ chọn gói khi giải còn là bản nháp',
      400,
      'CONTEST_FEE_CONTEST_NOT_DRAFT',
    );
  }

  const existing = await getLiveOrderForContest(contestId);
  if (existing) {
    throw new AppError(
      existing.status === ContestFeeOrderStatus.PAID
        ? 'Giải này đã thanh toán phí tổ chức'
        : 'Giải này đang có đơn phí chờ xử lý',
      409,
      'CONTEST_FEE_ORDER_EXISTS',
    );
  }

  const plan = await AppDataSource.getRepository(ContestFeePlan).findOne({
    where: { id: planId, isActive: true },
  });
  if (!plan) throw new AppError('Gói tổ chức giải không hợp lệ', 400, 'CONTEST_FEE_PLAN_INVALID');

  const repo = AppDataSource.getRepository(ContestFeeOrder);
  const order = await repo.save(
    repo.create({
      contestId,
      providerId: contest.providerId!,
      planId: plan.id,
      status: ContestFeeOrderStatus.PENDING_PAYMENT,
      amount: Number(plan.price),
      featuredDays: plan.featuredDays,
    }),
  );
  return mapOrder(order, plan);
}

/** Provider khai báo đã chuyển khoản; đơn chuyển sang chờ admin đối soát. */
export async function submitContestFeeTransfer(
  contestId: string,
  viewer: Viewer,
  body: { transfer_reference: string; transfer_date: string; transfer_amount: number },
) {
  await getContestForProvider(contestId, viewer);
  const order = await getLiveOrderForContest(contestId);
  if (!order) throw new AppError('Giải chưa chọn gói tổ chức', 400, 'CONTEST_FEE_ORDER_NOT_FOUND');
  if (order.status !== ContestFeeOrderStatus.PENDING_PAYMENT) {
    throw new AppError(
      order.status === ContestFeeOrderStatus.PAID
        ? 'Đơn phí đã được xác nhận'
        : 'Đơn phí đang chờ admin đối soát',
      409,
      'CONTEST_FEE_ORDER_NOT_PAYABLE',
    );
  }

  order.transferReference = body.transfer_reference;
  order.transferDate = body.transfer_date;
  order.transferAmount = body.transfer_amount;
  order.status = ContestFeeOrderStatus.PENDING_REVIEW;
  await AppDataSource.getRepository(ContestFeeOrder).save(order);

  const plan = await AppDataSource.getRepository(ContestFeePlan).findOne({
    where: { id: order.planId },
  });
  return mapOrder(order, plan);
}

/** Provider huỷ đơn khi chưa chuyển khoản, để đổi sang gói khác. */
export async function cancelContestFeeOrder(contestId: string, viewer: Viewer) {
  await getContestForProvider(contestId, viewer);
  const order = await getLiveOrderForContest(contestId);
  if (!order) throw new AppError('Giải chưa chọn gói tổ chức', 400, 'CONTEST_FEE_ORDER_NOT_FOUND');
  if (order.status !== ContestFeeOrderStatus.PENDING_PAYMENT) {
    throw new AppError(
      'Chỉ huỷ được đơn chưa khai báo chuyển khoản',
      409,
      'CONTEST_FEE_ORDER_NOT_CANCELLABLE',
    );
  }
  order.status = ContestFeeOrderStatus.CANCELLED;
  await AppDataSource.getRepository(ContestFeeOrder).save(order);
  return mapOrder(order);
}

/**
 * Provider chọn trả qua cổng PayOS thay vì chuyển khoản tay.
 *
 * Đơn vẫn phải tồn tại và đang ở PENDING_PAYMENT — nghĩa là hai cách trả tiền
 * dùng chung một đơn, provider đổi ý giữa chừng vẫn được. Bấm lại nút này thì
 * link cũ bị huỷ trước khi phát link mới, tránh chuyện trả nhầm vào link chết.
 */
export async function createContestFeePayOSLink(contestId: string, viewer: Viewer) {
  await getContestForProvider(contestId, viewer);
  const order = await getLiveOrderForContest(contestId);
  if (!order) throw new AppError('Giải chưa chọn gói tổ chức', 400, 'CONTEST_FEE_ORDER_NOT_FOUND');
  if (order.status !== ContestFeeOrderStatus.PENDING_PAYMENT) {
    throw new AppError(
      order.status === ContestFeeOrderStatus.PAID
        ? 'Đơn phí đã được xác nhận'
        : 'Đơn phí đang chờ admin đối soát chuyển khoản',
      409,
      'CONTEST_FEE_ORDER_NOT_PAYABLE',
    );
  }

  const plan = await AppDataSource.getRepository(ContestFeePlan).findOne({
    where: { id: order.planId },
  });

  if (order.payosOrderCode) {
    await payosService.cancelCheckout(Number(order.payosOrderCode), 'Provider tạo link mới');
  }

  const orderCode = payosService.generateOrderCode();
  const checkoutUrl = await payosService.createCheckout({
    orderCode,
    amount: Number(order.amount),
    description: payosService.buildDescription('RCField', plan?.code ?? 'PhiGiai'),
    returnUrl: `${env.frontendUrl}/provider/contests/${contestId}/overview?payos=success&orderCode=${orderCode}`,
    cancelUrl: `${env.frontendUrl}/provider/contests/${contestId}/overview?payos=cancel&orderCode=${orderCode}`,
  });

  order.payosOrderCode = String(orderCode);
  await AppDataSource.getRepository(ContestFeeOrder).save(order);

  return { checkout_url: checkoutUrl, order_code: orderCode, order: mapOrder(order, plan) };
}

/** Tra đơn phí theo mã PayOS — webhook và trang callback đều cần. */
export async function findContestFeeOrderByPayOSCode(
  orderCode: number | string,
): Promise<ContestFeeOrder | null> {
  return AppDataSource.getRepository(ContestFeeOrder).findOne({
    where: { payosOrderCode: String(orderCode) },
  });
}

/**
 * PayOS báo đã nhận tiền → đơn sang PAID ngay, không qua bước admin đối soát.
 *
 * Đây là điểm khác duy nhất so với chuyển khoản tay: tiền đã được cổng xác
 * nhận nên không còn gì để đối soát. Suất quảng bá vẫn vào hàng chờ duyệt nội
 * dung như cũ — trả tiền không đồng nghĩa nội dung tự lên trang chủ.
 *
 * Ghi `reviewedBy` bằng chính providerId vì không có admin nào tham gia; để
 * null thì báo cáo về sau không phân biệt được đơn tự động với đơn tồn.
 */
export async function markContestFeeOrderPaidViaPayOS(order: ContestFeeOrder) {
  if (order.status === ContestFeeOrderStatus.PAID) return mapOrder(order);
  if (order.status !== ContestFeeOrderStatus.PENDING_PAYMENT) {
    throw new AppError(
      'Đơn phí không ở trạng thái chờ thanh toán',
      409,
      'CONTEST_FEE_ORDER_INVALID',
    );
  }

  const repo = AppDataSource.getRepository(ContestFeeOrder);
  order.status = ContestFeeOrderStatus.PAID;
  order.transferAmount = Number(order.amount);
  order.adminNotes = 'Thanh toán qua cổng PayOS — xác nhận tự động.';
  order.reviewedBy = order.providerId;
  order.reviewedAt = new Date();
  await repo.save(order);

  if (order.featuredDays > 0) {
    await createPendingFeaturedSlot(order, order.providerId, false);
  }

  await notifyProvider(
    order,
    'Đã thanh toán phí tổ chức giải',
    order.featuredDays > 0
      ? 'Thanh toán qua PayOS thành công. Giải của bạn đã sẵn sàng mở đăng ký. Suất quảng bá đang chờ đội ngũ RCField duyệt nội dung.'
      : 'Thanh toán qua PayOS thành công. Giải của bạn đã sẵn sàng mở đăng ký.',
  );

  logger.info('ContestFee', 'đơn phí được PayOS xác nhận', {
    orderId: order.id,
    contestId: order.contestId,
    orderCode: order.payosOrderCode,
  });

  return mapOrder(order);
}

/**
 * PayOS báo huỷ hoặc hết hạn.
 *
 * Cố ý KHÔNG chuyển đơn sang REJECTED: provider mới chỉ bỏ dở một lần trả,
 * đơn vẫn còn nguyên để họ trả lại hoặc quay sang chuyển khoản tay. Đây là chỗ
 * khác luồng gói đăng ký — bên đó huỷ link là hỏng luôn yêu cầu.
 */
export async function markContestFeePayOSFailed(order: ContestFeeOrder, reason: string) {
  if (order.status !== ContestFeeOrderStatus.PENDING_PAYMENT) return mapOrder(order);

  order.adminNotes = `Lần thanh toán PayOS gần nhất không thành công: ${reason}`;
  order.payosOrderCode = null;
  await AppDataSource.getRepository(ContestFeeOrder).save(order);
  return mapOrder(order);
}

/**
 * Trang callback gọi ngay khi PayOS chuyển hướng về, không đợi webhook.
 *
 * Webhook có thể tới chậm hoặc rớt; hỏi thẳng PayOS rồi đồng bộ là cách để
 * provider thấy kết quả ngay. Cả hai đường cùng gọi
 * `markContestFeeOrderPaidViaPayOS`, và hàm đó tự thoát nếu đơn đã PAID nên
 * chạy hai lần cũng không cộng đôi.
 */
export async function verifyContestFeePayOS(orderCode: number) {
  const order = await findContestFeeOrderByPayOSCode(orderCode);
  if (!order) throw new AppError('Đơn phí không tồn tại', 404, 'CONTEST_FEE_ORDER_NOT_FOUND');
  if (order.status === ContestFeeOrderStatus.PAID) return mapOrder(order);

  const status = await payosService.getCheckoutStatus(orderCode);
  if (status === 'PAID') return markContestFeeOrderPaidViaPayOS(order);
  if (status === 'CANCELLED' || status === 'EXPIRED') {
    return markContestFeePayOSFailed(
      order,
      status === 'CANCELLED' ? 'Người dùng huỷ thanh toán' : 'Link thanh toán hết hạn',
    );
  }
  return mapOrder(order);
}

export async function listContestFeeOrdersForAdmin(options: {
  status?: ContestFeeOrderStatus;
  page: number;
  limit: number;
}) {
  const repo = AppDataSource.getRepository(ContestFeeOrder);
  const [rows, total] = await repo.findAndCount({
    where: options.status ? { status: options.status } : {},
    order: { createdAt: 'DESC' },
    skip: (options.page - 1) * options.limit,
    take: options.limit,
  });

  const planIds = Array.from(new Set(rows.map((row) => row.planId)));
  const contestIds = Array.from(new Set(rows.map((row) => row.contestId)));
  const [plans, contests] = await Promise.all([
    planIds.length
      ? AppDataSource.getRepository(ContestFeePlan).findBy({ id: In(planIds) })
      : Promise.resolve([]),
    contestIds.length
      ? AppDataSource.getRepository(Contest).findBy({ id: In(contestIds) })
      : Promise.resolve([]),
  ]);
  const planMap = new Map(plans.map((plan) => [plan.id, plan]));
  const contestMap = new Map(contests.map((contest) => [contest.id, contest]));

  return {
    data: rows.map((row) => ({
      ...mapOrder(row, planMap.get(row.planId)),
      contest_name: contestMap.get(row.contestId)?.name ?? null,
      // Ảnh và mô tả gửi kèm để admin XEM ĐƯỢC nội dung ngay tại bước đối soát
      // tiền. Đây là lúc duy nhất có người nhìn vào đơn chuyển khoản, nên nội
      // dung phải hiện ra ở đây — nếu không thì việc bỏ bước duyệt riêng đồng
      // nghĩa với không ai xem gì cả.
      contest_banner_url: contestMap.get(row.contestId)?.bannerImageUrl ?? null,
      contest_description: contestMap.get(row.contestId)?.description ?? null,
    })),
    meta: { total, page: options.page, limit: options.limit },
  };
}

/**
 * Admin xác nhận đã nhận tiền.
 *
 * Gói có kèm ngày quảng bá thì sinh luôn một suất hiển thị ở trạng thái CHỜ
 * DUYỆT — trả phí xong không đồng nghĩa nội dung tự lên trang chủ, admin vẫn
 * phải xem ảnh và tiêu đề. Khung ngày chạy từ lúc duyệt phí để provider không
 * mất ngày quảng bá vì admin đối soát chậm.
 */
export async function confirmContestFeeOrder(orderId: string, adminId: string, notes?: string) {
  const repo = AppDataSource.getRepository(ContestFeeOrder);
  const order = await repo.findOne({ where: { id: orderId } });
  if (!order) throw new AppError('Đơn phí không tồn tại', 404, 'CONTEST_FEE_ORDER_NOT_FOUND');
  if (order.status !== ContestFeeOrderStatus.PENDING_REVIEW) {
    throw new AppError('Đơn phí không ở trạng thái chờ đối soát', 409, 'CONTEST_FEE_ORDER_INVALID');
  }

  order.status = ContestFeeOrderStatus.PAID;
  order.adminNotes = notes ?? null;
  order.reviewedBy = adminId;
  order.reviewedAt = new Date();
  await repo.save(order);

  if (order.featuredDays > 0) {
    await createPendingFeaturedSlot(order, adminId, false);
  }

  await notifyProvider(
    order,
    'Đã xác nhận phí tổ chức giải',
    order.featuredDays > 0
      ? 'Giải của bạn đã sẵn sàng mở đăng ký. Suất quảng bá đang chờ đội ngũ RCField duyệt nội dung.'
      : 'Giải của bạn đã sẵn sàng mở đăng ký.',
  );

  return mapOrder(order);
}

export async function rejectContestFeeOrder(orderId: string, adminId: string, reason: string) {
  const repo = AppDataSource.getRepository(ContestFeeOrder);
  const order = await repo.findOne({ where: { id: orderId } });
  if (!order) throw new AppError('Đơn phí không tồn tại', 404, 'CONTEST_FEE_ORDER_NOT_FOUND');
  if (order.status !== ContestFeeOrderStatus.PENDING_REVIEW) {
    throw new AppError('Đơn phí không ở trạng thái chờ đối soát', 409, 'CONTEST_FEE_ORDER_INVALID');
  }

  order.status = ContestFeeOrderStatus.REJECTED;
  order.adminNotes = reason;
  order.reviewedBy = adminId;
  order.reviewedAt = new Date();
  await repo.save(order);

  await notifyProvider(
    order,
    'Phí tổ chức giải chưa được xác nhận',
    `Lý do: ${reason}. Bạn có thể khai báo lại thông tin chuyển khoản.`,
  );
  return mapOrder(order);
}

/**
 * Tạo suất quảng bá cho một đơn phí đã thu.
 *
 * `daDuyetNoiDung` phân biệt hai đường tiền vào, và khác biệt đó là thật:
 *
 *   • CHUYỂN KHOẢN — admin ngồi đối soát từng đơn, nhìn thấy ảnh và tiêu đề
 *     ngay trên thẻ trước khi bấm xác nhận. Bắt duyệt thêm một lần nữa ở màn
 *     khác là hỏi cùng một người đúng một câu hỏi hai lần.
 *
 *   • PayOS — tiền về tự động, KHÔNG ai nhìn. Cho đăng thẳng lên trang chủ
 *     nghĩa là bất kỳ ai trả tiền cũng tự đẩy được ảnh của mình lên trang chủ
 *     RCField, không qua mắt người nào. Đường này vẫn phải chờ duyệt.
 */
async function createPendingFeaturedSlot(
  order: ContestFeeOrder,
  adminId: string,
  daDuyetNoiDung: boolean,
): Promise<void> {
  const contest = await AppDataSource.getRepository(Contest).findOne({
    where: { id: order.contestId },
  });
  if (!contest) return;

  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + order.featuredDays * 24 * 60 * 60 * 1000);

  const repo = AppDataSource.getRepository(FeaturedPopup);
  await repo.save(
    repo.create({
      title: contest.name,
      subtitle: contest.description,
      imageUrl: contest.bannerImageUrl,
      ctaLabel: 'Xem giải đấu',
      ctaUrl: `/contests/${contest.id}`,
      contestId: contest.id,
      contestFeeOrderId: order.id,
      placement: FeaturedPopupPlacement.EXPLORE,
      audienceScope: FeaturedPopupAudienceScope.ALL,
      startsAt,
      endsAt,
      isActive: daDuyetNoiDung,
      reviewStatus: daDuyetNoiDung
        ? FeaturedPopupReviewStatus.APPROVED
        : FeaturedPopupReviewStatus.PENDING,
      priority: 100,
      createdBy: adminId,
    }),
  );
}

async function notifyProvider(
  order: ContestFeeOrder,
  title: string,
  message: string,
): Promise<void> {
  try {
    await createNotification(order.providerId, NotificationType.SYSTEM, title, message, {
      contest_id: order.contestId,
      contest_fee_order_id: order.id,
      route: `/provider/contests/${order.contestId}/overview`,
    });
  } catch (error) {
    logger.error('ContestFee', `Không gửi được thông báo cho đơn ${order.id}`, error);
  }
}

/**
 * Cửa chặn mở đăng ký: chưa trả phí thì giải không rời khỏi bản nháp.
 *
 * Đặt ở đây thay vì trong controller để mọi đường chuyển trạng thái đều đi qua,
 * kể cả những đường thêm về sau.
 */
export async function assertContestFeePaid(contest: Contest): Promise<void> {
  const order = await getLiveOrderForContest(contest.id);
  if (order?.status === ContestFeeOrderStatus.PAID) return;

  throw new AppError(
    order
      ? 'Phí tổ chức giải chưa được xác nhận — chờ RCField đối soát chuyển khoản'
      : 'Cần chọn và thanh toán gói tổ chức giải trước khi mở đăng ký',
    402,
    'CONTEST_FEE_REQUIRED',
  );
}
