import { AppDataSource } from '../config/database';
import { CafePaymentSetting } from '../models/cafe-payment-setting.entity';
import { CafePaymentMethod } from '../types';
import type { SupportedPaymentGateway } from './payment-gateway.interface';

/**
 * Phương thức thanh toán khả dụng của một chi nhánh.
 *
 * Quy tắc nền: **chi nhánh nào chưa cấu hình gì thì hành xử y hệt trước khi có
 * tính năng này**. Mọi nhánh nghi ngờ đều rơi về cổng dùng chung, kể cả khi đã
 * khai tài khoản nhưng chưa tự quét thử — dùng một số tài khoản chưa ai kiểm là
 * cách nhanh nhất để tiền của khách chảy vào tài khoản người lạ.
 */

export const DEFAULT_PAYMENT_METHOD: SupportedPaymentGateway = 'vnpay';

export async function resolvePaymentMethodsForCafe(
  cafeId: string,
): Promise<SupportedPaymentGateway[]> {
  const settings = await AppDataSource.getRepository(CafePaymentSetting).findOne({
    where: { cafeId },
  });

  if (!settings) return [DEFAULT_PAYMENT_METHOD];
  if (settings.method !== CafePaymentMethod.BANK_TRANSFER) return [DEFAULT_PAYMENT_METHOD];
  if (!settings.isVerified) return [DEFAULT_PAYMENT_METHOD];
  if (!settings.bankBin || !settings.accountNumber || !settings.accountName) {
    return [DEFAULT_PAYMENT_METHOD];
  }

  return [DEFAULT_PAYMENT_METHOD, 'bank_transfer'];
}

/**
 * Kiểm một phương thức khách chọn có dùng được cho chi nhánh không.
 *
 * Trả về phương thức đã chuẩn hoá thay vì boolean, để chỗ gọi không phải tự
 * xử lý trường hợp vắng mặt — không truyền gì nghĩa là VNPay, đúng như hành vi
 * của `createCheckoutUrl` từ trước.
 */
export async function assertPaymentMethodAvailable(
  cafeId: string,
  requested?: string | null,
): Promise<SupportedPaymentGateway> {
  if (!requested) return DEFAULT_PAYMENT_METHOD;

  const normalized = requested.toLowerCase().trim();
  if (normalized === DEFAULT_PAYMENT_METHOD) return DEFAULT_PAYMENT_METHOD;

  const available = await resolvePaymentMethodsForCafe(cafeId);
  if (!available.includes(normalized as SupportedPaymentGateway)) {
    const { AppError } = await import('../types');
    throw new AppError(
      'Chi nhánh này chưa bật phương thức thanh toán bạn chọn.',
      400,
      'PAYMENT_METHOD_UNAVAILABLE',
    );
  }

  return normalized as SupportedPaymentGateway;
}

/** Đọc cấu hình nhận tiền đã xác minh của chi nhánh, `null` nếu chưa bật. */
export async function getVerifiedBankSettings(cafeId: string): Promise<CafePaymentSetting | null> {
  const settings = await AppDataSource.getRepository(CafePaymentSetting).findOne({
    where: { cafeId, method: CafePaymentMethod.BANK_TRANSFER, isVerified: true },
  });
  if (!settings?.bankBin || !settings.accountNumber || !settings.accountName) return null;
  return settings;
}
