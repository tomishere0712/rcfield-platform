import { AppDataSource } from '../config/database';
import { User } from '../models/user.entity';
import { AuthProvider, GUEST_EMAIL_SUFFIX, UserRole } from '../types';

/**
 * Tài khoản mềm — khách hàng chưa đăng ký, do hệ thống tự tạo.
 *
 * Không mật khẩu nên không đăng nhập được, nhưng vẫn là chủ sở hữu hợp lệ của
 * đơn hàng: đơn vẫn vào báo cáo, staff vẫn tra cứu được, và lịch sử của khách
 * vẫn nằm chung một chỗ khi họ quay lại.
 *
 * Tách thành module LÁ thay vì để trong `booking.service`: cả luồng khách vãng
 * lai tại quầy lẫn luồng đặt qua Facebook đều cần, mà `booking.service` thì lớn
 * và nhập rất nhiều thứ khác — cho `fb-soft-user` nhập ngược lên đó là kéo theo
 * cả cụm phụ thuộc chỉ để dùng mười dòng.
 *
 * ⚠️ Hai hàm dưới đây CỐ Ý không có bất kỳ kiểm tra bảo vệ nào. Chúng là khối
 * xây dựng thô. Luồng đặt qua Facebook KHÔNG được gọi thẳng — nó phải đi qua
 * `fb-soft-user.ts`, nơi có chốt chặn tài khoản thật. Xem chú thích ở đó.
 */

/** Email tổng hợp cho một số điện thoại. Chỉ để thoả ràng buộc duy nhất, không gửi tới được. */
export function syntheticGuestEmail(phone: string): string {
  return `${phone}${GUEST_EMAIL_SUFFIX}`;
}

/** Tìm người dùng theo số điện thoại. Không phân biệt tài khoản mềm hay tài khoản thật. */
export async function findUserByPhone(phone: string): Promise<User | null> {
  return AppDataSource.getRepository(User).findOne({ where: { phone } });
}

/** Tạo một tài khoản mềm mới. Người gọi tự chịu trách nhiệm kiểm số điện thoại chưa ai dùng. */
export async function createGuestUser(phone: string, fullName: string): Promise<User> {
  const repo = AppDataSource.getRepository(User);
  return repo.save(
    repo.create({
      email: syntheticGuestEmail(phone),
      full_name: fullName,
      phone,
      password_hash: null,
      role: UserRole.CUSTOMER,
      is_active: true,
      auth_provider: AuthProvider.LOCAL,
    }),
  );
}

/** Tài khoản này có đăng nhập được không — tức là có phải tài khoản thật do khách tự đăng ký. */
export function isRealAccount(user: User): boolean {
  return user.password_hash !== null && user.password_hash !== undefined;
}
