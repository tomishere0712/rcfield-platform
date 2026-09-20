import React from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { BookingWizardScreen } from '@/features/bookings/components/BookingWizardScreen';
import { View, Pressable } from 'react-native';
import { Text } from '@/shared/ui/Text';
import { useAuthStore } from '@/shared/store/auth-store';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Calendar } from 'lucide-react-native';

export default function BookingCreateRoute() {
  const router = useRouter();
  const { cafeId, vehicleId, fnb } = useLocalSearchParams<{ cafeId: string; vehicleId?: string; fnb?: string }>();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const preselectedFnb = React.useMemo(() => {
    if (!fnb) return undefined;
    try {
      return JSON.parse(fnb) as Record<string, number>;
    } catch (e) {
      console.warn('Failed to parse preselected F&B params:', e);
      return undefined;
    }
  }, [fnb]);

  if (!isAuthenticated) {
    return (
      <SafeAreaView className="flex-1 bg-[#f8fafc] dark:bg-[#0b0f19] justify-center items-center px-8" edges={['top', 'left', 'right']}>
        {/* Background Glows */}
        <View className="absolute -top-20 -right-20 w-80 h-80 rounded-full bg-[#f97316]/5 blur-3xl pointer-events-none" />
        <View className="absolute bottom-10 -left-20 w-80 h-80 rounded-full bg-[#6366f1]/5 blur-3xl pointer-events-none" />

        <View className="size-16 rounded-full bg-slate-900 border border-slate-800 justify-center items-center mb-4">
          <Calendar color="#f97316" size={28} />
        </View>
        <Text className="text-slate-900 dark:text-white text-lg font-bold text-center">
          Yêu cầu đăng nhập
        </Text>
        <Text className="mt-2 text-slate-500 dark:text-slate-400 text-sm text-center leading-5 font-semibold max-w-xs mb-6">
          Vui lòng đăng nhập tài khoản của bạn để tiến hành tạo đơn đặt lịch sân chơi.
        </Text>
        <Pressable
          className="w-full h-11 items-center justify-center rounded-xl bg-[#ea580c] active:bg-[#f97316] shadow-md"
          onPress={() => router.push('/(auth)/login')}
        >
          <Text className="text-white text-sm font-bold">Đăng nhập ngay</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (!cafeId) {
    return (
      <View className="flex-grow flex-1 bg-[#f8fafc] dark:bg-[#0b0f19] items-center justify-center p-5">
        <Text className="text-[14px] text-red-500 font-bold">
          Thiếu tham số cafeId! Không thể tiến hành đặt lịch.
        </Text>
      </View>
    );
  }

  return (
    <BookingWizardScreen
      cafeId={cafeId}
      preselectedVehicleId={vehicleId}
      preselectedFnb={preselectedFnb}
    />
  );
}

