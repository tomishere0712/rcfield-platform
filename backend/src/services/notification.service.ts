import { IsNull } from 'typeorm';
import { AppDataSource } from '../config/database';
import { logger } from '../config/logger';
import { Notification } from '../models/notification.entity';
import { PushToken } from '../models/push-token.entity';
import { NotificationType } from '../types';
import { wsService } from './websocket.service';

interface ListOptions {
  page: number;
  limit: number;
  unreadOnly?: boolean;
}

export async function createNotification(
  userId: string,
  type: NotificationType,
  title: string,
  message: string,
  data?: Record<string, unknown>,
): Promise<void> {
  const repo = AppDataSource.getRepository(Notification);
  const notification = await repo.save(
    repo.create({ userId, type, title, message, data: data ?? null }),
  );

  // Gửi thông báo real-time qua WebSocket
  try {
    wsService.pushToUser(userId, 'notification', {
      id: notification.id,
      type,
      title,
      message,
      data: data ?? null,
      createdAt: notification.createdAt,
    });
  } catch (error) {
    logger.error('WebSocketNotification', 'Failed to send websocket notification', error);
  }

  void sendExpoPushToUser(userId, {
    title,
    body: message,
    data: {
      type,
      notificationId: notification.id,
      ...(data ?? {}),
    },
  }).catch((error) => {
    logger.error('PushNotification', 'Failed to send push notification', error);
  });
}

/**
 * A completed booking can reach reconciliation through more than one checkout
 * path. Persist one review request per booking and only push in-app/mobile
 * after the insert actually succeeds.
 */
export async function createBookingReviewRequestNotification(
  userId: string,
  bookingId: string,
): Promise<boolean> {
  const title = 'Đánh giá trải nghiệm của bạn';
  const message = 'Cảm ơn bạn đã sử dụng dịch vụ! Hãy dành 1 phút đánh giá trải nghiệm của bạn.';
  const data = {
    bookingId,
    reviewRequestKey: bookingId,
    route: `/customer/bookings?reviewBookingId=${bookingId}`,
  };

  // Include legacy rows (which predate reviewRequestKey) in the check so a
  // deployment during an in-flight checkout does not notify the customer a
  // second time for the same booking.
  const existing = await AppDataSource.query<{ exists: boolean }[]>(
    `SELECT EXISTS(
       SELECT 1
       FROM notifications
       WHERE user_id = $1
         AND type = $2
         AND data ->> 'bookingId' = $3
     ) AS "exists"`,
    [userId, NotificationType.BOOKING_REVIEW_REQUEST, bookingId],
  );
  if (existing[0]?.exists) return false;

  const inserted = await AppDataSource.query<{ id: string }[]>(
    `INSERT INTO notifications (user_id, type, title, message, data)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [userId, NotificationType.BOOKING_REVIEW_REQUEST, title, message, JSON.stringify(data)],
  );

  if (!inserted[0]?.id) return false;

  void sendExpoPushToUser(userId, {
    title,
    body: message,
    data: {
      type: NotificationType.BOOKING_REVIEW_REQUEST,
      notificationId: inserted[0].id,
      ...data,
    },
  }).catch((error) => {
    logger.error('PushNotification', 'Failed to send push notification', error);
  });

  return true;
}

export async function registerPushToken(
  userId: string,
  data: {
    token: string;
    platform?: string;
    device_id?: string | null;
    device_name?: string | null;
    app_version?: string | null;
  },
): Promise<PushToken> {
  const repo = AppDataSource.getRepository(PushToken);
  const existing = await repo.findOne({ where: { token: data.token } });
  const now = new Date();

  if (existing) {
    existing.userId = userId;
    existing.platform = data.platform ?? existing.platform ?? null;
    existing.deviceId = data.device_id ?? existing.deviceId ?? null;
    existing.deviceName = data.device_name ?? existing.deviceName ?? null;
    existing.appVersion = data.app_version ?? existing.appVersion ?? null;
    existing.lastSeenAt = now;
    existing.revokedAt = null;
    return repo.save(existing);
  }

  return repo.save(
    repo.create({
      userId,
      token: data.token,
      platform: data.platform ?? null,
      deviceId: data.device_id ?? null,
      deviceName: data.device_name ?? null,
      appVersion: data.app_version ?? null,
      lastSeenAt: now,
      revokedAt: null,
    }),
  );
}

export async function unregisterPushToken(userId: string, token: string): Promise<void> {
  await AppDataSource.getRepository(PushToken).update(
    { userId, token, revokedAt: IsNull() },
    { revokedAt: new Date() },
  );
}

type ExpoPushPayload = {
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

type ExpoPushTicket = {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: {
    error?: string;
  };
};

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_PUSH_CHUNK_SIZE = 100;
const INVALID_TOKEN_ERRORS = new Set(['DeviceNotRegistered']);

function isExpoPushToken(token: string) {
  return token.startsWith('ExpoPushToken[') || token.startsWith('ExponentPushToken[');
}

async function revokeInvalidTokens(tokens: PushToken[], tickets: ExpoPushTicket[]) {
  const invalidTokens = tickets
    .map((ticket, index) =>
      ticket.status === 'error' && INVALID_TOKEN_ERRORS.has(ticket.details?.error ?? '')
        ? tokens[index]?.token
        : null,
    )
    .filter((token): token is string => Boolean(token));

  if (!invalidTokens.length) return;

  await AppDataSource.getRepository(PushToken)
    .createQueryBuilder()
    .update(PushToken)
    .set({ revokedAt: new Date() })
    .where('token IN (:...tokens)', { tokens: invalidTokens })
    .execute();
}

export async function sendExpoPushToUser(userId: string, payload: ExpoPushPayload): Promise<void> {
  const repo = AppDataSource.getRepository(PushToken);
  const tokens = (
    await repo.find({
      where: { userId, revokedAt: IsNull() },
      order: { lastSeenAt: 'DESC' },
    })
  ).filter((item) => isExpoPushToken(item.token));

  if (!tokens.length) return;

  for (let index = 0; index < tokens.length; index += EXPO_PUSH_CHUNK_SIZE) {
    const chunk = tokens.slice(index, index + EXPO_PUSH_CHUNK_SIZE);
    const messages = chunk.map((item) => ({
      to: item.token,
      sound: 'default',
      priority: 'high',
      title: payload.title,
      body: payload.body,
      data: payload.data ?? {},
    }));

    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });

    if (!response.ok) {
      logger.warn('PushNotification', `Expo push request failed with ${response.status}`);
      continue;
    }

    const result = (await response.json()) as { data?: ExpoPushTicket[] };
    await revokeInvalidTokens(chunk, result.data ?? []);
  }
}

export async function listForUser(
  userId: string,
  options: ListOptions,
): Promise<{ data: Notification[]; total: number; unreadCount: number }> {
  const repo = AppDataSource.getRepository(Notification);
  const { page, limit, unreadOnly } = options;

  const qb = repo
    .createQueryBuilder('n')
    .where('n.user_id = :userId', { userId })
    .orderBy('n.created_at', 'DESC')
    .skip((page - 1) * limit)
    .take(limit);

  if (unreadOnly) {
    qb.andWhere('n.read_at IS NULL');
  }

  const [data, total] = await qb.getManyAndCount();
  const unreadCount = await repo.count({ where: { userId, readAt: IsNull() } });

  return { data, total, unreadCount };
}

export async function markRead(notificationId: string, userId: string): Promise<void> {
  const repo = AppDataSource.getRepository(Notification);
  const notification = await repo.findOne({ where: { id: notificationId, userId } });
  if (!notification) return;
  if (!notification.readAt) {
    notification.readAt = new Date();
    await repo.save(notification);
  }
}

export async function markAllRead(userId: string): Promise<number> {
  const result = await AppDataSource.query<{ affected: number }>(
    `UPDATE notifications SET read_at = NOW(), updated_at = NOW()
     WHERE user_id = $1 AND read_at IS NULL`,
    [userId],
  );
  return Array.isArray(result) ? (result[1] as number) : 0;
}
