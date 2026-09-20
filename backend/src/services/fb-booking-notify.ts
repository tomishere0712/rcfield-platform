import { AppDataSource } from '../config/database';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { Booking } from '../models/booking.entity';
import { CafeChannel } from '../models/cafe-channel.entity';
import { BookingSource, ChannelStatus, ChannelType } from '../types';
import { decryptToken } from '../utils/crypto';
import { sendText } from './fb-messenger.service';
import { deleteQrImage } from './fb-qr-image';

/**
 * Báo cho khách biết đơn đặt qua Facebook đã được xác nhận.
 *
 * ── Vì sao móc vào `processConfirmationResult` ──────────────────────────────
 *
 * Đó là điểm hội tụ DUY NHẤT mà mọi đường xác nhận đơn đều đi qua. Móc vào
 * route của trang thanh toán mô phỏng thì sẽ trượt ngay khi có thêm một đường
 * xác nhận khác.
 *
 * ── Vì sao hàm này không bao giờ được ném lỗi ───────────────────────────────
 *
 * Nó chạy trong nhánh `Promise.all([...]).catch()` của bước xử lý webhook. Tiền
 * đã vào, đơn đã CONFIRMED. Một lỗi gửi tin nhắn không được phép làm hỏng phản
 * hồi webhook — cổng thanh toán sẽ coi là mình chưa nhận được và gửi lại, kéo
 * theo cả một chuỗi xử lý trùng.
 *
 * Khách vẫn biết kết quả kể cả khi hàm này im lặng thất bại: trang thanh toán
 * đã hiển thị mã đơn ngay lúc bấm.
 */

interface FacebookBookingIdentity {
  psid: string;
  pageId: string;
  contactEmail?: string;
}

/** Đọc danh tính Facebook đã ghi lúc tạo đơn. `null` nghĩa là đơn này không đến từ Facebook. */
function readIdentity(booking: Booking): FacebookBookingIdentity | null {
  const snapshot = booking.snapshot as Record<string, unknown> | null;
  const psid = snapshot?.fb_psid;
  const pageId = snapshot?.fb_page_id;
  if (typeof psid !== 'string' || typeof pageId !== 'string') return null;

  const contactEmail = snapshot?.contact_email;
  return {
    psid,
    pageId,
    contactEmail: typeof contactEmail === 'string' ? contactEmail : undefined,
  };
}

function buildConfirmationText(booking: Booking): string {
  const code = `RCF-${booking.id.slice(0, 4).toUpperCase()}`;
  const start = new Date(booking.slotStart);
  const end = new Date(booking.slotEnd);
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
    }).format(d);

  return [
    `Đơn ${code} đã được xác nhận thành công!`,
    ``,
    `Thời gian: ${fmt(start)} — ${fmt(end)}`,
    `Mã tra cứu: ${code}`,
    ``,
    `Hẹn gặp bạn tại quán. Đưa mã này cho nhân viên khi tới nhé!`,
  ].join('\n');
}

/**
 * Gửi tin xác nhận. Tự bỏ qua khi đơn không đến từ Facebook.
 *
 * Thứ tự dự phòng theo FR-033:
 *   Messenger → email (nếu khách có cho email thật) → ghi nhật ký mức `error`.
 */
export async function notifyFacebookBookingConfirmed(booking: Booking): Promise<void> {
  try {
    if (booking.source !== BookingSource.FACEBOOK) return;

    // Đơn đã xác nhận thì mã QR chắc chắn vô dụng — dọn ngay, không để tồn kho
    // ảnh lớn dần theo từng đơn. Chạy trước phần gửi tin vì nó không phụ thuộc
    // gì vào việc gửi có thành công hay không.
    const qrPublicId = (booking.snapshot as Record<string, unknown> | null)?.fb_qr_public_id;
    if (typeof qrPublicId === 'string') {
      await deleteQrImage(qrPublicId);
    }

    const identity = readIdentity(booking);
    if (!identity) {
      // Đơn khai nguồn Facebook mà không có danh tính là dấu hiệu `snapshot` đã
      // bị ghi đè mất — nhiều khả năng ai đó thêm trường mới mà quên khai vào
      // `PRESERVED_CREATION_SNAPSHOT_KEYS`.
      logger.error('FbNotify', 'đơn Facebook thiếu fb_psid/fb_page_id trong snapshot', {
        bookingId: booking.id,
      });
      return;
    }

    const channel = await AppDataSource.getRepository(CafeChannel).findOne({
      where: {
        pageId: identity.pageId,
        channelType: ChannelType.FACEBOOK_MESSENGER,
        status: ChannelStatus.CONNECTED,
      },
    });

    if (channel) {
      try {
        const pageToken = decryptToken(
          channel.encryptedPageToken,
          env.facebook.encryptionKey as Buffer,
        );
        await sendText(identity.psid, buildConfirmationText(booking), pageToken);
        logger.info('FbNotify', 'đã gửi tin xác nhận', { bookingId: booking.id });
        return;
      } catch (err) {
        logger.warn('FbNotify', 'gửi Messenger thất bại, thử email dự phòng', {
          bookingId: booking.id,
          err,
        });
      }
    } else {
      logger.warn('FbNotify', 'chi nhánh đã ngắt kết nối Page, thử email dự phòng', {
        bookingId: booking.id,
        pageId: identity.pageId,
      });
    }

    // Dự phòng: email — chỉ có khi khách đã tự nguyện cho địa chỉ thật.
    if (identity.contactEmail) {
      const { emailService } = await import('./email.service');
      await emailService.sendBookingConfirmation(booking.id);
      logger.info('FbNotify', 'đã gửi email dự phòng', { bookingId: booking.id });
      return;
    }

    // Cả hai kênh đều không đi tới đâu. Khách vẫn thấy kết quả trên trang thanh
    // toán, nhưng đây là chỗ cần người nhìn tới.
    logger.error('FbNotify', 'không báo được cho khách qua kênh nào', {
      bookingId: booking.id,
      psid: identity.psid,
    });
  } catch (err) {
    // Chốt cuối. Xem chú thích đầu tệp: hàm này không được phép ném ra ngoài.
    logger.error('FbNotify', 'lỗi ngoài dự kiến khi báo xác nhận', err);
  }
}
