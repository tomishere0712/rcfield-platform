import { api } from '@/shared/lib/api';

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  data?: Record<string, unknown> | null;
  readAt?: string | null;
  createdAt: string;
}

export interface NotificationListResponse {
  data: AppNotification[];
  total: number;
  unreadCount: number;
}

export async function getNotifications(params?: {
  page?: number;
  limit?: number;
  unreadOnly?: boolean;
}): Promise<NotificationListResponse> {
  const response = await api.get<NotificationListResponse>('/provider/notifications', {
    params: {
      page: params?.page ?? 1,
      limit: params?.limit ?? 50,
      unread_only: params?.unreadOnly,
    },
  });

  return response.data;
}

export async function markNotificationRead(id: string): Promise<void> {
  await api.put(`/provider/notifications/${id}/read`);
}

export async function markAllNotificationsRead(): Promise<void> {
  await api.put('/provider/notifications/read-all');
}
