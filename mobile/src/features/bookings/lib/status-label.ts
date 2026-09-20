const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Chờ thanh toán',
  CONFIRMED: 'Đã xác nhận',
  CHECKED_IN: 'Đang nhận xe',
  ACTIVE: 'Đang chơi',
  EXTENDING: 'Đang gia hạn',
  CHECKING_OUT: 'Đang trả xe',
  AWAITING_PAYMENT: 'Chờ thanh toán thêm',
  COMPLETED: 'Hoàn tất',
  CANCELLED: 'Đã hủy',
  NO_SHOW: 'Không đến',
  DELIVERED: 'Đã giao',
  APPROVED: 'Đã chấp thuận',
  REJECTED: 'Đã từ chối',
  DISPUTED: 'Có phản hồi cần xử lý',
  PAID: 'Đã thanh toán',
  UNPAID: 'Chưa thanh toán',
  CHECK_IN: 'Nhận xe',
  CHECK_OUT: 'Trả xe',
  OK: 'Đạt',
  BROKEN: 'Cần xử lý',
};

/** Converts API enum values to Vietnamese before they reach a customer/staff UI. */
export function getStatusLabel(status?: string | null, fallback = 'Chưa cập nhật', playMode?: string | null) {
  if (!status) return fallback;
  if (playMode === 'BYOC') {
    if (status === 'CHECKED_IN') return 'Đang vào sân';
    if (status === 'CHECK_IN') return 'Vào sân';
  }
  return STATUS_LABELS[status] ?? status.replace(/_/g, ' ').toLocaleLowerCase('vi-VN');
}
