import { PayOS, Webhook } from '@payos/node';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { AppDataSource } from '../config/database';
import { PaymentRequest } from '../models/payment-request.entity';
import { AppError, NotificationType, PaymentRequestStatus } from '../types';
import { createNotification } from './notification.service';
import { confirmFromGateway } from './payment-request.service';

let payOS: PayOS | null = null;

function getPayOSInstance(): PayOS {
  if (!payOS) {
    if (!env.payos.clientId || !env.payos.apiKey || !env.payos.checksumKey) {
      throw new AppError(
        'PayOS credentials are not fully configured in env',
        500,
        'PAYOS_NOT_CONFIGURED',
      );
    }
    payOS = new PayOS({
      clientId: env.payos.clientId,
      apiKey: env.payos.apiKey,
      checksumKey: env.payos.checksumKey,
    });
  }
  return payOS;
}

export interface PayOSLinkResult {
  checkoutUrl: string;
  orderCode: number;
}

/**
 * Mã đơn PayOS phải là số nguyên. Ghép timestamp với 3 số ngẫu nhiên để hai
 * đơn tạo trong cùng mili-giây vẫn khác nhau.
 */
export function generateOrderCode(): number {
  return Number(String(Date.now()).substring(3) + String(Math.floor(Math.random() * 900) + 100));
}

/**
 * PayOS giới hạn description 25 ký tự, không dấu, không ký tự đặc biệt. Cắt sẵn
 * theo giới hạn đó thay vì để PayOS trả lỗi lúc tạo link.
 */
export function buildDescription(prefix: string, label: string, max = 25): string {
  const clean = label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .replace(/\s+/g, '')
    .slice(0, Math.max(0, max - prefix.length - 1));
  return `${prefix} ${clean}`.slice(0, max);
}

/**
 * Gọi PayOS tạo link thanh toán. Hàm này không biết gì về loại đơn — bên gọi
 * tự lo việc lưu `orderCode` vào bảng của mình. Nhờ vậy cùng một đường đi dùng
 * được cho cả gói đăng ký lẫn phí tổ chức giải.
 */
export async function createCheckout(params: {
  orderCode: number;
  amount: number;
  description: string;
  returnUrl: string;
  cancelUrl: string;
}): Promise<string> {
  const payOSInstance = getPayOSInstance();
  try {
    const link = await payOSInstance.paymentRequests.create(params);
    return link.checkoutUrl;
  } catch (error) {
    logger.error('PayOS', 'tạo link thanh toán thất bại', error);
    throw new AppError(
      'Không thể tạo liên kết thanh toán với PayOS: ' +
        (error instanceof Error ? error.message : String(error)),
      500,
      'PAYOS_API_ERROR',
    );
  }
}

/**
 * Huỷ một link thanh toán cũ. Cố gắng thôi, không chặn luồng: nếu PayOS từ chối
 * (link đã hết hạn, đã trả, hoặc không tồn tại) thì cũng không có gì để làm.
 * Có bước này để provider bấm tạo link lần hai không để lại link cũ còn sống —
 * trả nhầm vào link cũ thì tiền vào mà đơn không ghi nhận được.
 */
export async function cancelCheckout(orderCode: number, reason: string): Promise<void> {
  try {
    await getPayOSInstance().paymentRequests.cancel(orderCode, reason);
  } catch (error) {
    logger.warn('PayOS', 'không huỷ được link cũ', { orderCode, error: String(error) });
  }
}

/** Trạng thái đơn phía PayOS: PAID | CANCELLED | EXPIRED | PENDING … */
export async function getCheckoutStatus(orderCode: number): Promise<string | null> {
  const payOSInstance = getPayOSInstance();
  try {
    const order = await payOSInstance.paymentRequests.get(orderCode);
    return order.status;
  } catch (error) {
    // PayOS trả 404 khi link chưa được thanh toán hoặc đã bị dọn. Không coi là
    // lỗi hệ thống — bên gọi giữ nguyên trạng thái và hỏi lại sau.
    logger.warn('PayOS', 'không đọc được trạng thái đơn', { orderCode, error: String(error) });
    return null;
  }
}

/**
 * Tạo link thanh toán PayOS cho một PaymentRequest
 */
export async function createPaymentLink(
  request: PaymentRequest,
  planName: string,
): Promise<PayOSLinkResult> {
  const payOSInstance = getPayOSInstance();

  // Sinh orderCode duy nhất là số nguyên (sử dụng Timestamp và 3 số ngẫu nhiên để tránh trùng lặp)
  const orderCode = Number(
    String(Date.now()).substring(3) + String(Math.floor(Math.random() * 900) + 100),
  );

  const returnUrl = `${env.frontendUrl}/provider/subscriptions/callback?status=success&orderCode=${orderCode}`;
  const cancelUrl = `${env.frontendUrl}/provider/subscriptions/callback?status=cancel&orderCode=${orderCode}`;

  // Rút gọn description của PayOS (giới hạn 25 kí tự, không dấu, không kí tự đặc biệt)
  const cleanPlanName = planName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .replace(/\s+/g, '')
    .slice(0, 15);
  const description = `RCField ${cleanPlanName}`.slice(0, 25);

  const amount = Number(request.transferAmount);

  const paymentData = {
    orderCode,
    amount,
    description,
    returnUrl,
    cancelUrl,
  };

  try {
    const paymentLinkData = await payOSInstance.paymentRequests.create(paymentData);

    // Cập nhật orderCode này vào trường transferReference của PaymentRequest để đối soát sau này
    const repo = AppDataSource.getRepository(PaymentRequest);
    request.transferReference = String(orderCode);
    request.status = PaymentRequestStatus.PENDING;
    await repo.save(request);

    return {
      checkoutUrl: paymentLinkData.checkoutUrl,
      orderCode,
    };
  } catch (error) {
    logger.error('PayOS', 'tạo link thanh toán cho gói đăng ký thất bại', error);
    throw new AppError(
      'Không thể tạo liên kết thanh toán với PayOS: ' +
        (error instanceof Error ? error.message : String(error)),
      500,
      'PAYOS_API_ERROR',
    );
  }
}

/**
 * Xử lý khi thanh toán thành công qua PayOS (chờ Admin duyệt)
 */
export async function handlePayOSPaid(request: PaymentRequest): Promise<void> {
  if (request.status !== PaymentRequestStatus.PENDING) {
    return;
  }

  // Tiền đã vào tài khoản và cổng đã xác nhận — không có gì cho admin đối soát
  // nữa, nên kích hoạt gói ngay. Bắt provider chờ duyệt tay sau khi đã trả tiền
  // qua cổng là giữ tiền của họ mà không giao hàng.
  await confirmFromGateway(request, 'Đã thanh toán qua cổng PayOS, hệ thống tự xác nhận.');

  await createNotification(
    request.providerId,
    NotificationType.SYSTEM,
    'Thanh toán thành công qua PayOS',
    'Giao dịch qua cổng PayOS đã hoàn tất. Gói hội viên của bạn được kích hoạt ngay.',
  );
}

/**
 * Xử lý khi thanh toán thất bại hoặc hủy
 */
export async function handlePaymentFailed(
  request: PaymentRequest,
  reason = 'Thanh toán bị huỷ hoặc thất bại.',
): Promise<void> {
  if (
    request.status === PaymentRequestStatus.CONFIRMED ||
    request.status === PaymentRequestStatus.REJECTED
  ) {
    return;
  }

  const repo = AppDataSource.getRepository(PaymentRequest);
  request.status = PaymentRequestStatus.REJECTED;
  request.reviewedAt = new Date();
  request.adminNotes = reason;
  await repo.save(request);

  await createNotification(
    request.providerId,
    NotificationType.PAYMENT_REQUEST_REJECTED,
    'Thanh toán không thành công',
    `Giao dịch thanh toán PayOS bị huỷ hoặc hết hạn. Chi tiết: ${reason}. Vui lòng thử lại.`,
  );
}

/**
 * Xác thực dữ liệu webhook của PayOS
 */
export async function verifyWebhookData(body: unknown) {
  const payOSInstance = getPayOSInstance();
  return payOSInstance.webhooks.verify(body as Webhook);
}

/**
 * Query trực tiếp từ PayOS và đồng bộ trạng thái đơn hàng về database
 */
export async function verifyPaymentStatus(orderCode: number): Promise<PaymentRequest> {
  const payOSInstance = getPayOSInstance();
  const repo = AppDataSource.getRepository(PaymentRequest);

  const request = await repo.findOne({
    where: { transferReference: String(orderCode) },
  });

  if (!request) {
    throw new AppError('Yêu cầu thanh toán không tồn tại', 404, 'NOT_FOUND');
  }

  // Nếu trạng thái đã được CONFIRMED rồi thì không cần gọi PayOS làm gì nữa
  if (request.status === PaymentRequestStatus.CONFIRMED) {
    return request;
  }

  try {
    const payosOrder = await payOSInstance.paymentRequests.get(orderCode);

    if (payosOrder.status === 'PAID') {
      await handlePayOSPaid(request);
    } else if (['CANCELLED', 'EXPIRED'].includes(payosOrder.status)) {
      const reason =
        payosOrder.status === 'CANCELLED' ? 'Người dùng hủy thanh toán.' : 'Giao dịch hết hạn.';
      await handlePaymentFailed(request, reason);
    }

    // Fetch lại dữ liệu mới nhất sau khi cập nhật
    const updatedRequest = await repo.findOne({ where: { id: request.id } });
    return updatedRequest || request;
  } catch (error) {
    logger.error('PayOS', 'đồng bộ trạng thái đơn gói đăng ký thất bại', error);
    // Nếu PayOS trả về lỗi 404 nghĩa là link thanh toán chưa được thanh toán thành công và có thể đã bị huỷ
    // Chúng ta giữ nguyên trạng thái PENDING để có thể query lại sau
    return request;
  }
}
