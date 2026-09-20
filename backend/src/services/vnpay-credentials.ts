import { AppDataSource } from '../config/database';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { CafePaymentSetting } from '../models/cafe-payment-setting.entity';
import { decryptToken, encryptToken } from '../utils/crypto';

/**
 * ⚠️ Đang dùng chung khoá mã hoá với token kênh Facebook
 * (`CHANNEL_ENCRYPTION_KEY`). Đúng ra mỗi loại bí mật nên có khoá riêng để lộ
 * một chỗ không kéo theo chỗ còn lại. Chưa tách vì việc đó cần thêm biến môi
 * trường và một lượt luân chuyển khoá — ghi lại đây để không ai tưởng là cố ý.
 */
const SECRET_KEY = () => env.facebook.encryptionKey as Buffer;

/**
 * Chọn bộ thông tin cổng VNPay dùng cho một chi nhánh.
 *
 * ── Vì sao tồn tại ───────────────────────────────────────────────────────────
 * Đúng mô hình nghiệp vụ, mỗi chi nhánh ký hợp đồng merchant riêng với VNPay và
 * tiền về thẳng tài khoản của họ; nền tảng chỉ bán phần mềm, không đứng giữa
 * giữ tiền của khách. Đó cũng là lý do doanh thu nền tảng là phí thuê bao chứ
 * không cắt phần trăm booking.
 *
 * ── Vì sao hiện tại vẫn chạy cổng chung ──────────────────────────────────────
 * Ký hợp đồng merchant với VNPay đòi tư cách pháp nhân. Ở giai đoạn này chưa có
 * pháp nhân nào để đăng ký, nên chưa chi nhánh nào khai được thông tin riêng và
 * tất cả rơi về cổng sandbox cấp nền tảng.
 *
 * Điểm mấu chốt: đó là **trạng thái dữ liệu**, không phải giới hạn của thiết
 * kế. Chi nhánh nào khai `vnpay_tmn_code` + khoá ký là lập tức đi qua cổng
 * riêng, không phải sửa một dòng mã nào. Hàm này ghi log rõ nguồn đã dùng để
 * việc đó kiểm chứng được từ nhật ký chứ không phải tin lời.
 */

export type VnpayCredentialSource = 'CAFE' | 'PLATFORM';

export interface VnpayCredentials {
  tmnCode: string;
  hashSecret: string;
  paymentUrl: string;
  source: VnpayCredentialSource;
}

function platformCredentials(): VnpayCredentials {
  return {
    tmnCode: env.vnpay.tmnCode,
    hashSecret: env.vnpay.hashSecret,
    paymentUrl: env.vnpay.paymentUrl,
    source: 'PLATFORM',
  };
}

/**
 * Đọc thông tin cổng của chi nhánh, rơi về cổng nền tảng khi chưa khai.
 *
 * Giải mã hỏng thì cũng rơi về cổng nền tảng thay vì ném lỗi: khoá mã hoá bị
 * đổi hay dữ liệu hỏng không phải là lý do chính đáng để chặn khách trả tiền.
 * Nhưng phải kêu to trong log, vì đó là cấu hình đang sai.
 */
export async function resolveVnpayCredentials(cafeId: string): Promise<VnpayCredentials> {
  const settings = await AppDataSource.getRepository(CafePaymentSetting).findOne({
    where: { cafeId },
    select: ['vnpayTmnCode', 'vnpayHashSecretEncrypted'],
  });

  if (!settings?.vnpayTmnCode || !settings.vnpayHashSecretEncrypted) {
    return platformCredentials();
  }

  try {
    const hashSecret = decryptToken(settings.vnpayHashSecretEncrypted, SECRET_KEY());
    logger.info('VnpayCredentials', 'dùng cổng riêng của chi nhánh', {
      cafeId,
      tmnCode: settings.vnpayTmnCode,
      // Cố ý KHÔNG log khoá ký.
    });
    return {
      tmnCode: settings.vnpayTmnCode,
      hashSecret,
      paymentUrl: env.vnpay.paymentUrl,
      source: 'CAFE',
    };
  } catch (err) {
    logger.error(
      'VnpayCredentials',
      `không giải mã được khoá ký của chi nhánh ${cafeId}, tạm dùng cổng nền tảng`,
      err,
    );
    return platformCredentials();
  }
}

/** Mã hoá khoá ký trước khi ghi xuống bảng. */
export function encryptVnpayHashSecret(hashSecret: string): string {
  return encryptToken(hashSecret, SECRET_KEY());
}
