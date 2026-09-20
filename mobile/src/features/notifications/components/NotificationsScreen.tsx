import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useColorScheme } from 'nativewind';
import { cn } from '@/shared/lib/utils';
import {
  Bell,
  CalendarCheck2,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Flag,
  PackageCheck,
  RefreshCcw,
  Star,
  Wrench,
} from 'lucide-react-native';

import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
} from '@/features/notifications/api/notification.api';
import { getRouteFromNotificationData } from '@/shared/lib/push-notifications';
import { Text } from '@/shared/ui/Text';

function formatNotificationTime(iso: string) {
  try {
    const date = new Date(iso);
    const now = Date.now();
    const diffMs = now - date.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);

    if (diffMinutes < 1) return 'Vừa xong';
    if (diffMinutes < 60) return `${diffMinutes} phút trước`;

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours} giờ trước`;

    return date.toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

function getNotificationVisual(type: string) {
  if (type.includes('PAYMENT')) return { Icon: CreditCard, color: '#22c55e' };
  if (type.includes('INSPECTION') || type.includes('CHECKIN') || type.includes('CHECKOUT')) {
    return { Icon: Wrench, color: '#f97316' };
  }
  if (type.includes('EXTENSION')) return { Icon: CalendarCheck2, color: '#38bdf8' };
  if (type.includes('FNB')) return { Icon: PackageCheck, color: '#a78bfa' };
  if (type.includes('REVIEW')) return { Icon: Star, color: '#facc15' };
  if (type.includes('DISPUTED')) return { Icon: Flag, color: '#ef4444' };
  return { Icon: Bell, color: '#94a3b8' };
}

export function NotificationsScreen() {
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);

  const emptyTitle = useMemo(
    () => (loading ? 'Đang tải thông báo' : 'Chưa có thông báo nào'),
    [loading],
  );

  const loadNotifications = useCallback(async (silent = false) => {
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const response = await getNotifications({ limit: 50 });
      setNotifications(response.data);
      setUnreadCount(response.unreadCount);
    } catch (error: any) {
      const message = error?.response?.data?.message || 'Không thể tải danh sách thông báo.';
      Alert.alert('Lỗi', message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const handleOpenNotification = async (notification: AppNotification) => {
    setOpeningId(notification.id);
    try {
      if (!notification.readAt) {
        await markNotificationRead(notification.id);
        setNotifications((items) =>
          items.map((item) =>
            item.id === notification.id ? { ...item, readAt: new Date().toISOString() } : item,
          ),
        );
        setUnreadCount((count) => Math.max(0, count - 1));
      }

      const route = getRouteFromNotificationData({
        type: notification.type,
        ...(notification.data ?? {}),
      });

      if (route) {
        router.push(route as any);
      }
    } catch (error: any) {
      const message = error?.response?.data?.message || 'Không thể mở thông báo này.';
      Alert.alert('Lỗi', message);
    } finally {
      setOpeningId(null);
    }
  };

  const handleMarkAllRead = async () => {
    if (!unreadCount || markingAll) return;

    setMarkingAll(true);
    try {
      await markAllNotificationsRead();
      const now = new Date().toISOString();
      setNotifications((items) => items.map((item) => ({ ...item, readAt: item.readAt ?? now })));
      setUnreadCount(0);
    } catch (error: any) {
      const message = error?.response?.data?.message || 'Không thể đánh dấu đã đọc.';
      Alert.alert('Lỗi', message);
    } finally {
      setMarkingAll(false);
    }
  };

  return (
    <SafeAreaView className="flex-grow flex-1 bg-[#f8fafc] dark:bg-[#0b0f19]" edges={['top', 'left', 'right']}>
      <View className="absolute -top-20 -right-20 h-80 w-80 rounded-full bg-[#f97316]/10 blur-3xl pointer-events-none opacity-30 dark:opacity-100" />
      <View className="absolute bottom-10 -left-20 h-80 w-80 rounded-full bg-[#0ea5e9]/10 blur-3xl pointer-events-none opacity-30 dark:opacity-100" />

      <View className="flex-row items-center justify-between px-5 pb-3 pt-3">
        <Pressable
          className="size-10 items-center justify-center rounded-full border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/70 active:bg-slate-100 dark:active:bg-slate-900"
          onPress={() => router.back()}
        >
          <ChevronLeft color={colorScheme === 'dark' ? '#e2e8f0' : '#475569'} size={20} />
        </Pressable>

        <View className="flex-1 px-4">
          <Text className="text-[20px] text-slate-900 dark:text-white" variant="title" weight="700">
            Thông báo
          </Text>
          <Text className="mt-0.5 text-[12px] text-slate-500 dark:text-slate-400" weight="600">
            {unreadCount > 0 ? `${unreadCount} thông báo chưa đọc` : 'Tất cả đã đọc'}
          </Text>
        </View>

        <Pressable
          className={`size-10 items-center justify-center rounded-full border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/70 active:bg-slate-100 dark:active:bg-slate-900 ${markingAll || unreadCount === 0 ? 'opacity-50' : ''}`}
          disabled={markingAll || unreadCount === 0}
          onPress={handleMarkAllRead}
        >
          {markingAll ? (
            <ActivityIndicator color="#f97316" size="small" />
          ) : (
            <CheckCheck color="#f97316" size={19} />
          )}
        </Pressable>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center px-5">
          <ActivityIndicator color="#f97316" size="large" />
          <Text className="mt-3 text-[13px] text-slate-500 dark:text-slate-400" weight="600">
            {emptyTitle}
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerClassName="px-5 pb-10 pt-3"
          refreshControl={
            <RefreshControl
              colors={['#f97316']}
              onRefresh={() => loadNotifications(true)}
              refreshing={refreshing}
              tintColor="#f97316"
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {notifications.length === 0 ? (
            <View className="mt-10 items-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/40 px-5 py-10">
              <View className="size-12 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <Bell color="#64748b" size={24} />
              </View>
              <Text className="mt-4 text-center text-[16px] text-slate-900 dark:text-white" weight="700">
                {emptyTitle}
              </Text>
              <Text className="mt-2 text-center text-[12px] leading-5 text-slate-500 dark:text-slate-400" weight="500">
                Các cập nhật booking, kiểm tra xe, thanh toán và đánh giá sẽ xuất hiện ở đây.
              </Text>
              <Pressable
                className="mt-5 h-10 flex-row items-center justify-center gap-2 rounded-xl bg-[#ea580c] px-4 active:bg-[#f97316]"
                onPress={() => loadNotifications()}
              >
                <RefreshCcw color="#ffffff" size={15} />
                <Text className="text-[13px] text-white" weight="700">
                  Tải lại
                </Text>
              </Pressable>
            </View>
          ) : (
            <View className="gap-3">
              {notifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  opening={openingId === notification.id}
                  onPress={() => handleOpenNotification(notification)}
                />
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function NotificationItem({
  notification,
  opening,
  onPress,
}: {
  notification: AppNotification;
  opening: boolean;
  onPress: () => void;
}) {
  const unread = !notification.readAt;
  const { Icon, color } = getNotificationVisual(notification.type);
  const route = getRouteFromNotificationData({
    type: notification.type,
    ...(notification.data ?? {}),
  });

  return (
    <Pressable
      className={cn(
        'rounded-2xl border p-4 active:bg-slate-100 dark:active:bg-slate-900/80',
        unread
          ? 'border-[#f97316]/30 bg-orange-50/20 dark:bg-[#0f172a]/90'
          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]/55'
      )}
      disabled={opening}
      onPress={onPress}
    >
      <View className="flex-row gap-3">
        <View
          className="size-11 items-center justify-center rounded-2xl border"
          style={{ backgroundColor: `${color}18`, borderColor: `${color}33` }}
        >
          {opening ? <ActivityIndicator color={color} size="small" /> : <Icon color={color} size={20} />}
        </View>

        <View className="flex-1">
          <View className="flex-row items-start gap-2">
            <Text className="flex-1 text-[14px] leading-5 text-slate-900 dark:text-white" weight="700">
              {notification.title}
            </Text>
            {unread ? <View className="mt-1.5 size-2 rounded-full bg-[#f97316]" /> : null}
          </View>

          <Text className="mt-1 text-[12px] leading-5 text-slate-550 dark:text-slate-400" weight="500">
            {notification.message}
          </Text>

          <View className="mt-3 flex-row items-center justify-between">
            <Text className="text-[11px] text-slate-500" weight="600">
              {formatNotificationTime(notification.createdAt)}
            </Text>
            {route ? (
              <View className="flex-row items-center gap-1">
                <Text className="text-[11px] text-[#f97316]" weight="700">
                  Mở chi tiết
                </Text>
                <ChevronRight color="#f97316" size={14} />
              </View>
            ) : null}
          </View>
        </View>
      </View>
    </Pressable>
  );
}
