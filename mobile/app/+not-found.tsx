import { Stack, usePathname, useRouter } from 'expo-router';
import { View, Pressable } from 'react-native';
import { AlertTriangle, Home } from 'lucide-react-native';
import { Text } from '@/shared/ui/Text';

export default function NotFoundScreen() {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <>
      <Stack.Screen options={{ title: 'Trang không tồn tại' }} />
      <View className="flex-1 items-center justify-center bg-white dark:bg-[#0b0f19] px-6">
        <View className="size-16 rounded-full bg-orange-100 dark:bg-orange-950/40 items-center justify-center mb-4">
          <AlertTriangle color="#ea580c" size={32} />
        </View>
        <Text variant="title" className="text-center text-slate-900 dark:text-white text-lg font-bold">
          Không tìm thấy trang
        </Text>
        <Text className="text-xs text-slate-400 mt-2 text-center font-mono">
          {pathname}
        </Text>

        <Pressable
          onPress={() => router.replace('/(tabs)/bookings')}
          className="mt-6 px-6 py-3 rounded-xl bg-[#ea580c] active:bg-[#f97316] flex-row items-center gap-2"
        >
          <Home color="#ffffff" size={16} />
          <Text weight="600" className="text-white text-sm">
            Xem lịch đặt sân của bạn
          </Text>
        </Pressable>
      </View>
    </>
  );
}
