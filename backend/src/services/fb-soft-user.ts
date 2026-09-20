import { AppDataSource } from '../config/database';
import { logger } from '../config/logger';
import { User } from '../models/user.entity';
import { createGuestUser, findUserByPhone, isRealAccount } from './guest-user';

/**
 * Phân giải tài khoản mềm cho khách đặt lịch qua Facebook Messenger.
 *
 * ── Vì sao không dùng thẳng luồng khách vãng lai ────────────────────────────
 *
 * Luồng tại quầy tìm theo số điện thoại rồi dùng lại BẤT KỲ người dùng nào khớp
 * — kể cả tài khoản thật đã đăng ký. Ở quầy điều đó chấp nhận được vì staff
 * đứng đối mặt khách và nhìn thấy họ.
 *
 * Qua Messenger thì không ai xác minh gì cả. Bê nguyên logic đó sang nghĩa là:
 * gõ số điện thoại của người khác là đơn hàng gắn thẳng vào tài khoản thật của
 * họ. Chốt `isRealAccount` dưới đây là ranh giới duy nhất giữa "khách vãng lai
 * tiện lợi" và "ai cũng đặt hộ ai được".
 *
 * Cách này bịt được trường hợp nghiêm trọng nhất mà không tốn một tin nhắn SMS
 * nào. Nó KHÔNG bịt được việc khai số của một người chưa có tài khoản — rủi ro
 * đó đã được ghi nhận có chủ ý trong spec (AR-003).
 */

export type SoftUserResolution =
  | { outcome: 'CREATED'; user: User }
  | { outcome: 'REUSED'; user: User }
  /** Số điện thoại thuộc về một tài khoản thật — không được gắn đơn vào đó. */
  | { outcome: 'BLOCKED_REAL_ACCOUNT' }
  | { outcome: 'INVALID_PHONE' };

export interface ResolveSoftUserInput {
  phone: string;
  fullName: string;
  /**
   * Email liên lạc tuỳ chọn. CỐ Ý bị bỏ qua ở đây — nó thuộc về đơn hàng, không
   * thuộc về danh tính. Xem chú thích ở `normalizePhone` phía dưới về lý do.
   */
  email?: string;
}

/** Số di động Việt Nam sau khi chuẩn hoá: 10 chữ số, bắt đầu bằng 0. */
const VN_MOBILE = /^0\d{9}$/;

/**
 * Đưa mọi cách viết về một dạng duy nhất.
 *
 * Thiếu bước này thì `0901234567` và `+84901234567` ra hai tài khoản mềm cho
 * cùng một người — và tệ hơn, chốt chặn tài khoản thật bị lách được bằng cách
 * gõ số của nạn nhân ở dạng còn lại.
 *
 * Trả `null` khi không nhận ra được, để người gọi hỏi lại khách thay vì tạo ra
 * một tài khoản rác không bao giờ liên lạc được.
 */
export function normalizePhone(raw: string): string | null {
  const digitsOnly = raw.replace(/[\s.\-()]/g, '');

  let normalized = digitsOnly;
  if (normalized.startsWith('+84')) normalized = `0${normalized.slice(3)}`;
  else if (normalized.startsWith('84') && normalized.length === 11) {
    normalized = `0${normalized.slice(2)}`;
  }

  return VN_MOBILE.test(normalized) ? normalized : null;
}

/**
 * Ba nhánh, theo đúng thứ tự:
 *
 *   1. chưa ai dùng số này            → tạo tài khoản mềm
 *   2. có, và là tài khoản mềm        → dùng lại (lịch sử khách nằm chung một chỗ)
 *   3. có, và là tài khoản THẬT       → từ chối, đẩy khách sang đăng nhập
 */
export async function resolveFacebookSoftUser(
  input: ResolveSoftUserInput,
): Promise<SoftUserResolution> {
  const phone = normalizePhone(input.phone);
  if (!phone) return { outcome: 'INVALID_PHONE' };

  const fullName = input.fullName.trim() || 'Khách Facebook';
  const existing = await findUserByPhone(phone);

  if (!existing) {
    const user = await createGuestUser(phone, fullName);
    logger.info('FbSoftUser', 'tạo tài khoản mềm', { userId: user.id, phone });
    return { outcome: 'CREATED', user };
  }

  if (isRealAccount(existing)) {
    // Không đụng gì vào tài khoản thật — không đổi tên, không tạo bản sao.
    logger.warn('FbSoftUser', 'chặn: số điện thoại thuộc tài khoản thật', { phone });
    return { outcome: 'BLOCKED_REAL_ACCOUNT' };
  }

  // Khách khai tên khác ở lần đặt sau thì lấy tên mới — họ vừa nói, đó là dữ
  // liệu tươi hơn.
  if (existing.full_name !== fullName) {
    await AppDataSource.getRepository(User).update(existing.id, { full_name: fullName });
    existing.full_name = fullName;
  }

  logger.info('FbSoftUser', 'dùng lại tài khoản mềm', { userId: existing.id, phone });
  return { outcome: 'REUSED', user: existing };
}
