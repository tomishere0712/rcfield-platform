import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { Platform } from 'react-native';

import { api } from '@/shared/lib/api';
import { env } from '@/shared/config/env';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

let registeredToken: string | null = null;
let responseSubscription: ReturnType<typeof Notifications.addNotificationResponseReceivedListener> | null = null;
let handledInitialNotificationId: string | null = null;

function getProjectId() {
  const extra = Constants.expoConfig?.extra as
    | { eas?: { projectId?: string }; projectId?: string }
    | undefined;

  return (
    Constants.easConfig?.projectId ||
    extra?.eas?.projectId ||
    extra?.projectId ||
    env.easProjectId ||
    ''
  );
}

export function normalizeMobileNotificationRoute(rawRoute: unknown): string {
  if (typeof rawRoute !== 'string' || !rawRoute.startsWith('/')) return '';

  const [pathname, queryString] = rawRoute.split('?');

  // Customer review request with query param e.g. /customer/bookings?reviewBookingId=xxx
  if (queryString) {
    const params = new URLSearchParams(queryString);
    const reviewBookingId = params.get('reviewBookingId');
    if (reviewBookingId) {
      return `/customer/review/${encodeURIComponent(reviewBookingId)}`;
    }
  }

  // Customer booking detail: /customer/bookings/:id, /customer/booking/:id, /booking/:id
  const customerBookingMatch = pathname.match(/^\/(?:customer\/)?bookings?\/([^/?#]+)$/);
  if (customerBookingMatch) {
    const bookingId = customerBookingMatch[1];
    return `/booking/${bookingId}`;
  }

  // Customer bookings list: /customer/bookings, /bookings
  if (pathname === '/customer/bookings' || pathname === '/bookings') {
    return '/(tabs)/bookings';
  }

  // Customer review: /customer/review/:id
  const reviewMatch = pathname.match(/^\/customer\/review\/([^/?#]+)$/);
  if (reviewMatch) {
    return `/customer/review/${reviewMatch[1]}`;
  }

  // Customer extension: /customer/extension/:id, /customer/extension-response/:id
  const extensionMatch = pathname.match(/^\/customer\/(?:extension|extension-response)\/([^/?#]+)$/);
  if (extensionMatch) {
    return `/customer/extension/${extensionMatch[1]}`;
  }

  // Customer inspection: /customer/inspections/:id, /customer/inspection/:id, /customer/sessions/:id
  const inspectionMatch = pathname.match(/^\/customer\/(?:inspections?|sessions?)\/([^/?#]+)$/);
  if (inspectionMatch) {
    return `/customer/inspections/${inspectionMatch[1]}`;
  }

  // Staff session: /staff/sessions/:id, /staff/session/:id
  const staffSessionMatch = pathname.match(/^\/staff\/sessions?\/([^/?#]+)$/);
  if (staffSessionMatch) {
    return `/staff/session/${staffSessionMatch[1]}`;
  }

  // Staff inspection: /staff/inspections/:id, /staff/inspection/:id
  const staffInspectionMatch = pathname.match(/^\/staff\/inspections?\/([^/?#]+)$/);
  if (staffInspectionMatch) {
    return `/staff/inspection/${staffInspectionMatch[1]}`;
  }

  // Staff bookings / today-bookings / fnb
  if (pathname === '/staff/today-bookings' || pathname === '/staff/bookings') {
    return '/staff/bookings';
  }
  if (pathname === '/staff/fnb-orders' || pathname === '/staff/fnb') {
    return '/staff/fnb';
  }

  return rawRoute;
}

export function getRouteFromNotificationData(data: Record<string, unknown>) {
  if (typeof data.route === 'string' && data.route.length > 0) {
    const normalized = normalizeMobileNotificationRoute(data.route);
    if (normalized) return normalized;
  }

  const type = String(data.type || '');
  const sessionId =
    typeof data.sessionId === 'string'
      ? data.sessionId
      : typeof data.session_id === 'string'
        ? data.session_id
        : '';
  const bookingId =
    typeof data.bookingId === 'string'
      ? data.bookingId
      : typeof data.booking_id === 'string'
        ? data.booking_id
        : '';

  if (type === 'SESSION_CHECKIN_INSPECTION' || type === 'SESSION_CHECKOUT_INSPECTION') {
    if (bookingId) return `/booking/${bookingId}`;
    if (sessionId) return `/customer/inspections/${sessionId}`;
    return '/(tabs)/bookings';
  }

  if (type === 'SESSION_EXTENSION_PROPOSED' && sessionId) {
    return `/customer/extension/${sessionId}`;
  }

  if (type === 'BOOKING_REVIEW_REQUEST' && bookingId) {
    return `/customer/review/${bookingId}`;
  }

  if (type === 'CUSTOMER_PAYMENT_CONFIRMED' && bookingId) {
    return `/booking/${bookingId}`;
  }

  if (type === 'SESSION_FNB_ORDER_ADDED' && bookingId) {
    return `/booking/${bookingId}`;
  }

  if (
    [
      'CUSTOMER_CHECKIN_CONFIRMED',
      'CUSTOMER_CHECKOUT_CONFIRMED',
      'CUSTOMER_INSPECTION_DISPUTED',
      'CUSTOMER_EXTENSION_APPROVED',
      'CUSTOMER_EXTENSION_REJECTED',
      'SESSION_OVERDUE_ALERT',
    ].includes(type) &&
    sessionId
  ) {
    return `/staff/session/${sessionId}`;
  }

  return '';
}

function handleNotificationResponse(response: Notifications.NotificationResponse) {
  const notificationId = response.notification.request.identifier;
  if (notificationId && handledInitialNotificationId === notificationId) return;
  handledInitialNotificationId = notificationId;

  const data = response.notification.request.content.data as Record<string, unknown>;
  const route = getRouteFromNotificationData(data);
  if (!route) return;

  setTimeout(() => {
    router.navigate(route as any);
  }, 0);
}

async function configureAndroidChannel() {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync('default', {
    name: 'RCField',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#f97316',
  });
}

async function getNotificationPermission() {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted || current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) {
    return true;
  }

  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted || requested.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
}

export async function registerPushNotificationsAsync() {
  await configureAndroidChannel();

  const granted = await getNotificationPermission();
  if (!granted) {
    console.warn('[Push] Notification permission was not granted.');
    return null;
  }

  const projectId = getProjectId();
  if (!projectId) {
    console.warn('[Push] Missing EAS project id. Set EXPO_PUBLIC_EAS_PROJECT_ID or app.json extra.eas.projectId.');
    return null;
  }

  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  try {
    await api.post('/provider/notifications/push-tokens', {
      token,
      platform: Platform.OS,
      device_name: Constants.deviceName ?? null,
      app_version: Constants.expoConfig?.version ?? null,
    });
  } catch (err: any) {
    if (err?.response?.status === 404) {
      console.log('[Push] Backend does not support push tokens registration yet (404). Skipping...');
    } else {
      throw err;
    }
  }

  registeredToken = token;
  return token;
}

export async function unregisterCurrentPushTokenAsync() {
  if (!registeredToken) return;

  const token = registeredToken;
  registeredToken = null;
  try {
    await api.delete('/provider/notifications/push-tokens', { data: { token } });
  } catch (err: any) {
    if (err?.response?.status === 404) {
      console.log('[Push] Backend does not support push tokens unregistration yet (404). Skipping...');
    } else {
      throw err;
    }
  }
}

export function startNotificationResponseListener() {
  if (!responseSubscription) {
    responseSubscription = Notifications.addNotificationResponseReceivedListener(handleNotificationResponse);
  }

  const lastResponse = Notifications.getLastNotificationResponse();
  if (lastResponse) {
    handleNotificationResponse(lastResponse);
  }

  return () => {
    responseSubscription?.remove();
    responseSubscription = null;
  };
}
