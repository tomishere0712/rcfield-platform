import { AppDataSource } from '../config/database';
import { logger } from '../config/logger';
import { FnbOrderType, NotificationType } from '../types';
import { createNotification } from './notification.service';
import { wsService } from './websocket.service';

type FnbPrepNotificationInput = {
  cafeId: string;
  bookingId: string;
  orderId: string;
  orderType: FnbOrderType;
  scheduledFor?: Date | null;
  excludeStaffUserId?: string;
};

function formatVietnamTime(value?: Date | null): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);
}

/**
 * F&B preparation is an operational concern.  This helper deliberately only
 * notifies staff and never changes booking/payment state.
 */
export async function notifyCafeStaffAboutFnbPrep(input: FnbPrepNotificationInput): Promise<void> {
  try {
    const [itemCountRow] = await AppDataSource.query<{ count: string }[]>(
      `SELECT COUNT(*)::text AS count FROM fnb_order_items WHERE fnb_order_id = $1`,
      [input.orderId],
    );
    const staff = await AppDataSource.query<{ id: string }[]>(
      `SELECT u.id
         FROM users u
         JOIN staff_cafe_assignments assignment ON assignment.staff_id = u.id
        WHERE assignment.cafe_id = $1
          AND u.is_active = TRUE
          AND u.deleted_at IS NULL`,
      [input.cafeId],
    );
    const recipientIds = staff
      .map((row) => row.id)
      .filter((staffId) => staffId !== input.excludeStaffUserId);

    if (recipientIds.length === 0) return;

    const itemCount = Number(itemCountRow?.count ?? 0);
    const isPreorder = input.orderType === FnbOrderType.PRE_ORDER;
    const scheduledTime = formatVietnamTime(input.scheduledFor);
    const source = isPreorder
      ? `Đơn đặt trước${scheduledTime ? ` lúc ${scheduledTime}` : ''}`
      : 'Đơn gọi tại quầy';
    const title = 'Có món cần chế biến';
    const message = `${source} gồm ${itemCount} món đang chờ xử lý.`;
    const data = {
      bookingId: input.bookingId,
      orderId: input.orderId,
      orderType: input.orderType,
      route: '/staff/fnb-orders',
    };

    await Promise.all(
      recipientIds.map(async (staffId) => {
        await createNotification(
          staffId,
          NotificationType.FNB_ORDER_READY_FOR_PREP,
          title,
          message,
          data,
        );
        wsService.pushToUser(staffId, 'FNB_ORDER_READY_FOR_PREP', data);
      }),
    );
  } catch (error) {
    // A failed alert must not make a confirmed booking or a counter order fail.
    logger.error('FnbOrderNotification', 'Failed to notify staff about F&B prep', error);
  }
}
