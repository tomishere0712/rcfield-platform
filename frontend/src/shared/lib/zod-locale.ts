import { z } from "zod"

/**
 * Bật tiếng Việt cho mọi thông báo mặc định của zod.
 *
 * Không có dòng này thì schema nào quên viết message riêng sẽ ném nguyên câu
 * tiếng Anh của thư viện ra toast — kiểu `Invalid option: expected one of
 * "MANUAL"|"CHECK_IN_ORDER"` — người dùng đọc không hiểu gì. Đặt ở đây thay vì
 * đi vá từng schema để schema viết sau này cũng được che phủ sẵn.
 *
 * Message viết tay trong từng schema vẫn thắng, nên chỗ nào đã có câu tiếng
 * Việt sát nghĩa hơn thì không bị đè.
 */
export function installZodVietnameseLocale(): void {
  z.config(z.locales.vi())
}
