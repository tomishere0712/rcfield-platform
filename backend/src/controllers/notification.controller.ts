import { Response, NextFunction } from 'express';
import { AppError, AuthRequest } from '../types';
import {
  NotificationQuerySchema,
  RegisterPushTokenSchema,
  UnregisterPushTokenSchema,
} from '../validate';
import * as notificationService from '../services/notification.service';

// GET /api/v1/provider/notifications  [auth]
export async function getNotifications(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = NotificationQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return next(new AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR'));
    }
    const { page, limit, unread_only } = parsed.data;
    const result = await notificationService.listForUser(req.user!.userId, {
      page,
      limit,
      unreadOnly: unread_only,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

// PUT /api/v1/provider/notifications/read-all  [auth]
export async function markAllNotificationsRead(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const updated = await notificationService.markAllRead(req.user!.userId);
    res.json({ success: true, updated });
  } catch (err) {
    next(err);
  }
}

// PUT /api/v1/provider/notifications/:id/read  [auth]
export async function markNotificationRead(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await notificationService.markRead(req.params.id, req.user!.userId);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/notifications/push-tokens [auth]
export async function registerPushToken(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = RegisterPushTokenSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR'));
    }

    const token = await notificationService.registerPushToken(req.user!.userId, parsed.data);
    res.status(201).json({
      success: true,
      data: {
        id: token.id,
        token: token.token,
        platform: token.platform,
        lastSeenAt: token.lastSeenAt,
      },
    });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/v1/notifications/push-tokens [auth]
export async function unregisterPushToken(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = UnregisterPushTokenSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR'));
    }

    await notificationService.unregisterPushToken(req.user!.userId, parsed.data.token);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}
