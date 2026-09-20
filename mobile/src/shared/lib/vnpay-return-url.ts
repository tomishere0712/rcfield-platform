import * as Linking from 'expo-linking';

const VNPAY_RETURN_PATH = '/api/payments/vnpay-return';
const PAYMENT_RETURN_ROUTE = 'payment-return';

export function getVnpayMobileRedirectUrl(): string {
  return Linking.createURL(PAYMENT_RETURN_ROUTE);
}

export function getVnpayReturnUrl(): string | undefined {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL;
  if (!apiUrl) return undefined;

  const mobileRedirect = getVnpayMobileRedirectUrl();

  try {
    const url = new URL(apiUrl);
    return `${url.protocol}//${url.host}${VNPAY_RETURN_PATH}?mobile_redirect=${encodeURIComponent(
      mobileRedirect,
    )}`;
  } catch {
    const match = apiUrl.match(/^https?:\/\/([^/:]+)(?::(\d+))?/);
    if (!match) return undefined;

    const host = match[1];
    const port = match[2] ?? '3000';
    return `http://${host}:${port}${VNPAY_RETURN_PATH}?mobile_redirect=${encodeURIComponent(
      mobileRedirect,
    )}`;
  }
}
