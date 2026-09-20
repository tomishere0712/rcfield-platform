import * as WebBrowser from 'expo-web-browser';

import { getVnpayMobileRedirectUrl } from '@/shared/lib/vnpay-return-url';

export async function openVnpayPaymentSession(paymentUrl: string) {
  return WebBrowser.openAuthSessionAsync(paymentUrl, getVnpayMobileRedirectUrl());
}
