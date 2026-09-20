import 'react-native-gesture-handler';
import '../global.css';

import { Stack } from 'expo-router';
import 'react-native-reanimated';
import { LogBox } from 'react-native';
import { AppProvider } from '@/shared/providers/AppProvider';

LogBox.ignoreLogs([
  '[Reanimated] Reading from `value` during component render',
  '[Reanimated] Writing to `value` during component render',
]);

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

export default function RootLayout() {
  return (
    <AppProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
          gestureEnabled: true,
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="booking/create" />
        <Stack.Screen name="booking/[id]" />
        <Stack.Screen name="cafe-detail/[id]" />
        <Stack.Screen name="customer/contest-detail/[id]" />
        <Stack.Screen name="customer/contest-register/[id]" />
        <Stack.Screen name="customer/extension/[sessionId]" />
        <Stack.Screen name="customer/inspections/[sessionId]" />
        <Stack.Screen name="customer/review/[bookingId]" />
        <Stack.Screen name="staff/inspection/[sessionId]" />
        <Stack.Screen name="staff/session/[sessionId]" />
        <Stack.Screen name="+not-found" />
      </Stack>
    </AppProvider>
  );
}
