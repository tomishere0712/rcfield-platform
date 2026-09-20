import { logger } from '../config/logger';
import { uploadImage } from './cloudinary.service';

/**
 * Đưa ảnh mã QR thanh toán lên kho ảnh để gửi được qua Messenger.
 *
 * `buildBankTransferCheckout` trả ảnh dưới dạng data URL base64
 * (`qr_image_data_url`) — hợp với trang web vì trình duyệt vẽ thẳng được. Nhưng
 * Facebook Send API thì tự đi TẢI ảnh về từ máy chủ của họ, nên nó cần một URL
 * công khai; đưa base64 vào là bị từ chối.
 *
 * Đây là lý do tồn tại của tệp này, không phải vì thiếu chỗ để đặt hàm.
 */

const QR_FOLDER = 'rcfield/fb-qr';

/** Tách phần dữ liệu thật ra khỏi data URL `data:image/png;base64,....` */
function decodeDataUrl(dataUrl: string): Buffer | null {
  const match = /^data:image\/[a-zA-Z+]+;base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  try {
    return Buffer.from(match[1], 'base64');
  } catch {
    return null;
  }
}

/**
 * Xoá ảnh QR khi nó đã chắc chắn vô dụng — tức là sau khi đơn được xác nhận.
 *
 * Không xoá ngay sau khi gửi: Facebook có thể tải lại ảnh khi khách cuộn lại
 * cuộc trò chuyện, và một ô ảnh vỡ trong lịch sử chat trông như hệ thống hỏng.
 *
 * Không bao giờ ném lỗi: đây là việc dọn dẹp, không phải việc nghiệp vụ.
 */
export async function deleteQrImage(publicId: string): Promise<void> {
  try {
    const { deleteImage } = await import('./cloudinary.service');
    await deleteImage(publicId);
  } catch (err) {
    logger.warn('FbQr', 'không xoá được ảnh QR', { publicId, err });
  }
}

/**
 * Trả về URL công khai và định danh của ảnh QR, hoặc `null` nếu không tải lên được.
 *
 * Trả `null` thay vì ném lỗi: mất ảnh QR thì khách vẫn còn NÚT BẤM dẫn thẳng
 * tới trang thanh toán, mà nút bấm mới là đường đi chính trên điện thoại. Làm
 * hỏng cả tin nhắn chỉ vì kho ảnh trục trặc là đánh đổi sai.
 */
export async function uploadQrForMessenger(
  qrImageDataUrl: string,
  bookingId: string,
): Promise<{ url: string; publicId: string } | null> {
  const buffer = decodeDataUrl(qrImageDataUrl);
  if (!buffer) {
    logger.warn('FbQr', 'không đọc được data URL của ảnh QR', { bookingId });
    return null;
  }

  try {
    const { url, publicId } = await uploadImage({
      buffer,
      folder: QR_FOLDER,
      publicIdPrefix: `qr-${bookingId.slice(0, 8)}`,
    });
    return { url, publicId };
  } catch (err) {
    logger.warn('FbQr', 'tải ảnh QR lên kho ảnh thất bại', { bookingId, err });
    return null;
  }
}
