import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware';
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  registerPushToken,
  unregisterPushToken,
} from '../controllers/notification.controller';

export const notificationRouter = Router();

notificationRouter.use(authenticate);

notificationRouter.get('/', getNotifications);
notificationRouter.post('/push-tokens', registerPushToken);
notificationRouter.delete('/push-tokens', unregisterPushToken);
notificationRouter.put('/read-all', markAllNotificationsRead);
notificationRouter.put('/:id/read', markNotificationRead);
