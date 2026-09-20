import { useFocusEffect, useRouter } from 'expo-router';
import { Bell } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';

import { getNotifications } from '@/features/notifications/api/notification.api';
import { useAuthStore } from '@/shared/store/auth-store';
import { cn } from '@/shared/lib/utils';
import { Text } from '@/shared/ui/Text';

type NotificationBellButtonProps = {
  className?: string;
  size?: 'md' | 'lg';
};

const sizeClassName = {
  md: 'size-11 rounded-2xl',
  lg: 'size-12 rounded-2xl',
};

const iconSize = {
  md: 20,
  lg: 21,
};

export function NotificationBellButton({
  className,
  size = 'lg',
}: NotificationBellButtonProps) {
  const router = useRouter();
  const hasUser = useAuthStore((state) => Boolean(state.user));
  const [unreadCount, setUnreadCount] = useState(0);

  useFocusEffect(
    useCallback(() => {
      if (!hasUser) {
        setUnreadCount(0);
        return undefined;
      }

      let mounted = true;
      getNotifications({ limit: 1 })
        .then((res) => {
          if (mounted) {
            setUnreadCount(res.unreadCount);
          }
        })
        .catch((err) => {
          console.error('Error fetching notification unread count:', err);
        });

      return () => {
        mounted = false;
      };
    }, [hasUser]),
  );

  return (
    <Pressable
      className={cn(
        'relative items-center justify-center border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]/80 active:bg-slate-50 dark:active:bg-slate-900',
        sizeClassName[size],
        className,
      )}
      onPress={() => router.push('/notifications' as any)}
    >
      <Bell color="#f97316" size={iconSize[size]} />
      {unreadCount > 0 ? (
        <View className="absolute -right-1 -top-1 min-w-5 rounded-full border-2 border-[#0b0f19] bg-red-500 px-1.5 py-0.5">
          <Text className="text-center text-[9px] font-black text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}
