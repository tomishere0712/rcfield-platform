import {
  BeVietnamPro_400Regular,
  BeVietnamPro_500Medium,
  BeVietnamPro_600SemiBold,
  BeVietnamPro_700Bold,
  useFonts,
} from '@expo-google-fonts/be-vietnam-pro';
import { QueryClientProvider } from '@tanstack/react-query';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { type PropsWithChildren, useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useColorScheme as useNativeWindColorScheme } from 'nativewind';
import * as SecureStore from 'expo-secure-store';

import { queryClient } from '@/shared/lib/query-client';
import { useAuthStore } from '@/shared/store/auth-store';
import { wsClient } from '@/shared/lib/websocket';
import {
  registerPushNotificationsAsync,
  startNotificationResponseListener,
} from '@/shared/lib/push-notifications';

void SplashScreen.preventAutoHideAsync();

export function AppProvider({ children }: PropsWithChildren) {
  const { colorScheme: nwColorScheme, setColorScheme: setNwColorScheme } = useNativeWindColorScheme();
  const initializeSession = useAuthStore((state) => state.initializeSession);
  const accessToken = useAuthStore((state) => state.accessToken);
  const isInitialized = useAuthStore((state) => state.isInitialized);
  const [fontsLoaded, fontError] = useFonts({
    BeVietnamPro_400Regular,
    BeVietnamPro_500Medium,
    BeVietnamPro_600SemiBold,
    BeVietnamPro_700Bold,
  });

  useEffect(() => {
    const initTheme = async () => {
      try {
        const savedTheme = await SecureStore.getItemAsync('rcfield_theme');
        if (savedTheme === 'dark') {
          setNwColorScheme('dark');
        } else {
          setNwColorScheme('light');
        }
      } catch (err) {
        console.warn('[Theme] Failed to load initial theme:', err);
        setNwColorScheme('light');
      }
    };
    void initTheme();
  }, [setNwColorScheme]);

  useEffect(() => {
    if (fontError) {
      throw fontError;
    }
  }, [fontError]);

  useEffect(() => {
    if (fontsLoaded) {
      void SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  useEffect(() => {
    void initializeSession();
  }, [initializeSession]);

  useEffect(() => {
    if (isInitialized) {
      if (accessToken) {
        wsClient.connect();
        void registerPushNotificationsAsync().catch((error) => {
          console.warn('[Push] Failed to register push token:', error);
        });
      } else {
        wsClient.disconnect();
      }
    }
    return () => {
      wsClient.disconnect();
    };
  }, [accessToken, isInitialized]);

  useEffect(() => {
    return startNotificationResponseListener();
  }, []);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          {children}
          <StatusBar style={nwColorScheme === 'dark' ? 'light' : 'dark'} />
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
