import cron from 'node-cron';
import { AppDataSource } from '../config/database';
import { env } from '../config/env';
import { writeContestAudit } from '../services/contest.helpers';
import { logger } from '../config/logger';
import { cancelContestRegistrationOnBookingCancel, transition } from '../services/booking.service';
import { processRefund } from '../services/payment.service';
import { Session } from '../models/session.entity';
import { Booking } from '../models/booking.entity';
import { ExtensionProposal } from '../models/extension-proposal.entity';
import { Notification } from '../models/notification.entity';
import { createNotification } from '../services/notification.service';
import { wsService } from '../services/websocket.service';
import { ExtensionProposalStatus, NotificationType, SessionStatus, UserRole } from '../types';
import { SESSION_OVERDUE_ALERT_MINUTES } from '../lib/session-operational-timing';

/** Mirrors a booking cancellation to the linked contest registration (contest
 * rental bookings). Never blocks the job: failures are logged only. */
async function cascadeContestRegistrationCancel(booking: Booking): Promise<void> {
  if (!booking.contestId) return;
  try {
    await cancelContestRegistrationOnBookingCancel(booking, booking.customerId, 'SYSTEM');
  } catch (err) {
    logger.warn(
      'BookingTimeout',
      `contest registration sync failed bookingId=${booking.id}: ${(err as Error).message}`,
    );
  }
}

/** Expires PENDING bookings whose payment window has elapsed. Exported for tests. */
export async function processExpiredBookings(): Promise<void> {
  const expired: { id: string }[] = await AppDataSource.query(
    `SELECT id FROM bookings
     WHERE status = 'PENDING'
       AND payment_expires_at < NOW()
       AND deleted_at IS NULL`,
  );

  if (expired.length > 0) {
    logger.info('BookingTimeout', `expiring ${expired.length} booking(s)`);
    for (const row of expired) {
      await transition(row.id, 'PAYMENT_TIMEOUT')
        .then((booking) => cascadeContestRegistrationCancel(booking))
        .catch((err) => {
          logger.error('BookingTimeout', `failed to expire bookingId=${row.id}`, err);
        });
    }
  }
}

async function notifyOverdueSessions(): Promise<void> {
  const overdueSessions = await AppDataSource.query<
    {
      sessionId: string;
      bookingId: string;
      checkedInBy: string;
      providerId: string;
      cafeName: string;
      minutesOverdue: number;
    }[]
  >(
    `SELECT
       s.id AS "sessionId",
       s.booking_id AS "bookingId",
       s.checked_in_by AS "checkedInBy",
       c.provider_id AS "providerId",
       c.name AS "cafeName",
       FLOOR(EXTRACT(EPOCH FROM (NOW() - s.planned_end_at)) / 60)::int AS "minutesOverdue"
     FROM sessions s
     JOIN bookings b ON b.id = s.booking_id
     JOIN cafes c ON c.id = s.cafe_id
     WHERE s.status = 'ACTIVE'
       AND s.actual_end_at IS NULL
       AND s.planned_end_at <= NOW() - ($1 * INTERVAL '1 minute')
       AND b.deleted_at IS NULL`,
    [SESSION_OVERDUE_ALERT_MINUTES],
  );

  const notificationRepo = AppDataSource.getRepository(Notification);
  for (const session of overdueSessions) {
    const alreadyNotified = await notificationRepo
      .createQueryBuilder('notification')
      .where('notification.type = :type', { type: NotificationType.SESSION_OVERDUE_ALERT })
      .andWhere("notification.data ->> 'sessionId' = :sessionId", { sessionId: session.sessionId })
      .getExists();
    if (alreadyNotified) continue;

    const shortSessionId = session.sessionId.slice(0, 8).toUpperCase();
    const title = 'Phiên chơi quá giờ chưa kết thúc';
    const message = `Phiên #${shortSessionId} tại ${session.cafeName} đã quá giờ ${session.minutesOverdue} phút. Vui lòng kiểm tra và xử lý kết thúc phiên.`;
    const data = {
      sessionId: session.sessionId,
      bookingId: session.bookingId,
      minutesOverdue: session.minutesOverdue,
      route: `/staff/sessions/${session.sessionId}`,
    };
    // Quá giờ trả xe là việc xử lý ngay tại quầy. Chỉ nhân viên đã check-in
    // nhận cảnh báo; provider không bị làm phiền bởi vận hành từng phiên.
    const recipients = new Set([session.checkedInBy].filter(Boolean));

    for (const userId of recipients) {
      await createNotification(
        userId,
        NotificationType.SESSION_OVERDUE_ALERT,
        title,
        message,
        data,
      );
      wsService.pushToUser(userId, NotificationType.SESSION_OVERDUE_ALERT, {
        title,
        message,
        ...data,
      });
    }
    logger.warn('BookingTimeout', 'overdue session alert sent', {
      sessionId: session.sessionId,
      minutesOverdue: session.minutesOverdue,
    });
  }
}

/**
 * Customer approval is required for an app-booking extension. Do not leave a
 * vehicle in the transient EXTENDING state forever when the customer does not
 * answer; expiry returns it to ACTIVE and keeps the original planned end.
 */
async function expireStaleExtensionProposals(): Promise<void> {
  const staleProposals = await AppDataSource.query<
    {
      proposalId: string;
      sessionId: string;
      cafeId: string;
      checkedInBy: string;
      customerId: string | null;
    }[]
  >(
    `SELECT
      p.id AS "proposalId",
      p.session_id AS "sessionId",
      s.cafe_id AS "cafeId",
      s.checked_in_by AS "checkedInBy",
       b.customer_id AS "customerId"
     FROM extension_proposals p
     JOIN sessions s ON s.id = p.session_id
     JOIN bookings b ON b.id = s.booking_id
     WHERE p.status = 'PENDING'
       AND s.status = 'EXTENDING'
       AND p.created_at <= NOW() - INTERVAL '10 minutes'`,
  );

  const proposalRepo = AppDataSource.getRepository(ExtensionProposal);
  const sessionRepo = AppDataSource.getRepository(Session);
  for (const proposal of staleProposals) {
    const result = await proposalRepo.update(
      { id: proposal.proposalId, status: ExtensionProposalStatus.PENDING },
      { status: ExtensionProposalStatus.EXPIRED, respondedAt: new Date() },
    );
    if (!result.affected) continue;

    await sessionRepo.update(
      { id: proposal.sessionId, status: SessionStatus.EXTENDING },
      { status: SessionStatus.ACTIVE },
    );
    const eventData = { sessionId: proposal.sessionId, proposalId: proposal.proposalId };
    wsService.pushToUser(proposal.checkedInBy, 'SESSION_EXTENSION_EXPIRED', eventData);
    if (proposal.customerId) {
      wsService.pushToUser(proposal.customerId, 'SESSION_EXTENSION_EXPIRED', eventData);
    }
    wsService.pushToCafe(proposal.cafeId, 'SESSION_UPDATED', {
      ...eventData,
      sessionStatus: SessionStatus.ACTIVE,
      action: 'EXTENSION_EXPIRED',
      updatedAt: new Date().toISOString(),
    });
    logger.info('BookingTimeout', 'expired unanswered session extension proposal', {
      proposalId: proposal.proposalId,
      sessionId: proposal.sessionId,
    });
  }
}

/**
 * Nhả suất giải của người đăng ký rồi bỏ dở khâu trả phí dự thi.
 *
 * Khách đóng tab giữa chừng thì cổng thanh toán KHÔNG gọi lại gì cả — không có
 * tín hiệu nào để bắt. Chỉ còn cách đợi hết cửa sổ thanh toán rồi dọn, giống
 * hệt cách đơn đặt sân chưa trả tiền được nhả chỗ.
 *
 * Ba nhóm cố ý không đụng tới:
 *  · phí đã xong (đã thu / miễn / đang chờ đối soát) — không có gì để quá hạn;
 *  · giải miễn phí, `entry_fee_amount = 0`;
 *  · đăng ký có `booking_id` — phí gộp trong đơn đặt, và đơn đó đã có cơ chế
 *    hết hạn riêng. Dọn ở cả hai nơi là hai đường cùng huỷ một thứ.
 *
 * Trả về số suất đã nhả, để chỗ gọi còn ghi log và test còn kiểm được.
 */
export async function expireUnpaidContestRegistrations(): Promise<number> {
  const raw = await AppDataSource.query(
    `UPDATE contest_registrations
        SET status = 'CANCELLED',
            cancelled_at = NOW(),
            cancellation_reason = 'Quá hạn thanh toán phí dự thi',
            updated_at = NOW()
      WHERE status <> 'CANCELLED'
        AND payment_status = 'PENDING_PAYMENT'
        AND entry_fee_amount > 0
        AND booking_id IS NULL
        AND created_at < NOW() - ($1 || ' minutes')::interval
      RETURNING id, contest_id`,
    [String(env.platform.paymentWindowMinutes)],
  );
  // TypeORM trả [rows[], rowCount] cho câu UPDATE — lấy thẳng biến vào sẽ ra
  // một MẢNG LỒNG, và `rows[0].contest_id` là undefined. Ghi nhật ký hỏng lặng
  // lẽ vì lỗi đã bị bắt và chỉ log lại.
  const rows: { id: string; contest_id: string }[] = Array.isArray(raw[0]) ? raw[0] : raw;

  for (const row of rows) {
    await writeContestAudit({
      contestId: row.contest_id,
      registrationId: row.id,
      actorId: null,
      actorRole: 'SYSTEM',
      eventType: 'registration.cancelled_unpaid_entry_fee',
      afterJson: { status: 'CANCELLED' },
      reason: 'Quá hạn thanh toán phí dự thi',
    }).catch((err) =>
      logger.error('BookingTimeout', `audit write failed registrationId=${row.id}`, err),
    );
  }

  if (rows.length) {
    logger.info('BookingTimeout', `nhả ${rows.length} suất giải do quá hạn trả phí dự thi`);
  }
  return rows.length;
}

/** Runs every minute — expires PENDING bookings and marks CONFIRMED no-shows */
export function scheduleBookingTimeout(): void {
  cron.schedule('* * * * *', async () => {
    try {
      // Mỗi việc tự chịu lỗi của mình. Gộp chung một try thì việc đầu tiên
      // ném lỗi là những việc sau KHÔNG chạy lần nào nữa — im lặng, mỗi phút,
      // mãi mãi. Nhìn từ ngoài chỉ thấy "job không làm gì cả".
      await processExpiredBookings().catch((err) =>
        logger.error('BookingTimeout', 'processExpiredBookings failed', err),
      );
      await expireUnpaidContestRegistrations().catch((err) =>
        logger.error('BookingTimeout', 'expireUnpaidContestRegistrations failed', err),
      );

      // NO_SHOW is only for a customer who never checked in. Once a staff member
      // starts handover, the customer may already be physically present; marking
      // that booking as no-show would create an incorrect penalty/refund. An
      // unfinished handover must instead be resolved by the branch staff.
      const noShows: { id: string }[] = await AppDataSource.query(
        `SELECT b.id FROM bookings b
         WHERE b.status = 'CONFIRMED'
           AND b.slot_start + INTERVAL '30 minutes' < NOW()
           AND b.deleted_at IS NULL
           AND NOT EXISTS (
             SELECT 1 FROM sessions s
             WHERE s.booking_id = b.id
               AND s.status IN ('CHECKED_IN', 'ACTIVE', 'EXTENDING', 'CHECKING_OUT', 'COMPLETED')
           )`,
      );

      if (noShows.length > 0) {
        logger.info('BookingTimeout', `marking ${noShows.length} booking(s) as NO_SHOW`);
        for (const row of noShows) {
          await transition(row.id, 'NO_SHOW')
            .then(async (booking) => {
              await AppDataSource.getRepository(Session)
                .createQueryBuilder()
                .update()
                .set({ status: SessionStatus.CANCELLED, actualEndAt: new Date() })
                .where('booking_id = :bookingId', { bookingId: row.id })
                .andWhere('status = :status', { status: SessionStatus.CHECKED_IN })
                .execute();
              await processRefund(row.id, UserRole.PROVIDER, true);
              await cascadeContestRegistrationCancel(booking);
            })
            .catch((err) => {
              logger.error('BookingTimeout', `failed to NO_SHOW bookingId=${row.id}`, err);
            });
        }
      }

      await expireStaleExtensionProposals();

      // An active session is an attended booking, so it must never be changed
      // to NO_SHOW or completed automatically. Alert the assigned staff and
      // provider once instead; checkout remains the explicit inspection flow.
      await notifyOverdueSessions();
    } catch (err) {
      logger.error('BookingTimeout', 'job error', err);
    }
  });
}
