import React from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { BookingDetailScreen } from '@/features/bookings/components/BookingDetailScreen';
import { View, Pressable } from 'react-native';
import { Text } from '@/shared/ui/Text';
import { useAuthStore } from '@/shared/store/auth-store';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AlertCircle } from 'lucide-react-native';

export default function BookingDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  if (!id) {
    return (
      <View className="flex-1 bg-[#0b0f19] items-center justify-center p-5">
        <Text className="text-[14px] text-red-500 font-bold">
          Không tìm thấy mã đặt sân!
        </Text>
      </View>
    );
  }

  if (!isAuthenticated) {
    return (
      <SafeAreaView className="flex-1 bg-[#f8fafc] dark:bg-[#0b0f19] justify-center items-center px-8" edges={['top', 'left', 'right']}>
        <AlertCircle color="#ef4444" size={48} />
        <Text className="text-slate-900 dark:text-white text-lg font-bold mt-4 text-center">
          Yêu cầu đăng nhập
        </Text>
        <Text className="mt-2 text-slate-500 dark:text-slate-400 text-sm text-center font-medium mb-6">
          Vui lòng đăng nhập để xem thông tin chi tiết đơn đặt sân này.
        </Text>
        <Pressable
          className="px-6 py-2.5 rounded-xl bg-[#ea580c] active:bg-[#c2410c]"
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace('/(tabs)/bookings');
            }
          }}
        >
          <Text className="text-white text-xs font-bold">Quay lại</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return <BookingDetailScreen bookingId={id} />;
}
