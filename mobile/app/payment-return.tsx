import { useLocalSearchParams, useRouter } from 'expo-router';
import { AlertTriangle, CheckCircle2, Package, CalendarDays } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/shared/ui/Text';

export default function PaymentReturnRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    status?: string;
    response_code?: string;
    reason?: string;
  }>();

  const isSuccess = params.status === 'success';
  const Icon = isSuccess ? CheckCircle2 : AlertTriangle;

  return (
    <SafeAreaView className="flex-1 bg-[#020617] px-6 justify-center">
      <View className="rounded-[28px] border border-slate-800 bg-slate-950 p-6">
        <View
          className={`mx-auto mb-5 size-16 items-center justify-center rounded-2xl ${
            isSuccess ? 'bg-emerald-500/15' : 'bg-amber-500/15'
          }`}
        >
          <Icon color={isSuccess ? '#34d399' : '#f59e0b'} size={34} />
        </View>

        <Text className="text-center text-3xl font-black text-white">
          {isSuccess ? 'Thanh toán thành công' : 'Thanh toán chưa hoàn tất'}
        </Text>
        <Text className="mt-3 text-center text-base leading-7 text-slate-300">
          {isSuccess
            ? 'Ứng dụng đã nhận lại kết quả thanh toán. Bạn có thể kiểm tra trạng thái mới nhất trong mục Lịch đặt.'
            : `Không thể xác nhận giao dịch. Mã phản hồi: ${params.response_code || params.reason || 'unknown'}.`}
        </Text>

        <View className="mt-8 gap-3">
          <Pressable
            onPress={() => router.replace('/(tabs)/bookings')}
            className="h-14 flex-row items-center justify-center gap-2 rounded-2xl bg-orange-600 active:bg-orange-700"
          >
            <CalendarDays color="#fff" size={20} />
            <Text className="text-base font-black text-white">Xem lịch đặt</Text>
          </Pressable>

          <Pressable
            onPress={() => router.replace('/customer/packages' as any)}
            className="h-14 flex-row items-center justify-center gap-2 rounded-2xl border border-slate-700 bg-slate-900 active:bg-slate-800"
          >
            <Package color="#cbd5e1" size={20} />
            <Text className="text-base font-bold text-slate-200">Xem gói của tôi</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}
