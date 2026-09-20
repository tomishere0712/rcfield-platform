import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { useAuthStore } from '@/shared/store/auth-store';

export default function IndexRoute() {
  const isInitialized = useAuthStore((state) => state.isInitialized);

  if (!isInitialized) {
    return (
      <View className="flex-grow flex-1 items-center justify-center bg-[#f8fafc] dark:bg-[#0b0f19]">
        <ActivityIndicator color="#ea580c" />
      </View>
    );
  }

  return <Redirect href="/(tabs)" />;
}
