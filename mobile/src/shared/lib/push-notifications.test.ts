import { describe, expect, it } from '@jest/globals';

import {
  getRouteFromNotificationData,
  normalizeMobileNotificationRoute,
} from './push-notifications';

describe('normalizeMobileNotificationRoute', () => {
  it('normalizes customer booking detail routes with or without query params', () => {
    expect(
      normalizeMobileNotificationRoute(
        '/customer/bookings/40ef4145-c89b-43fe-a801-b75d7b57b98d?section=handover'
      )
    ).toBe('/booking/40ef4145-c89b-43fe-a801-b75d7b57b98d');

    expect(
      normalizeMobileNotificationRoute('/customer/booking/b-123')
    ).toBe('/booking/b-123');

    expect(normalizeMobileNotificationRoute('/booking/b-123')).toBe(
      '/booking/b-123'
    );
  });

  it('normalizes review request routes with query parameters', () => {
    expect(
      normalizeMobileNotificationRoute(
        '/customer/bookings?reviewBookingId=booking-888'
      )
    ).toBe('/customer/review/booking-888');
  });

  it('normalizes customer extension and inspection routes', () => {
    expect(
      normalizeMobileNotificationRoute('/customer/extension-response/sess-123')
    ).toBe('/customer/extension/sess-123');

    expect(
      normalizeMobileNotificationRoute('/customer/extension/sess-123')
    ).toBe('/customer/extension/sess-123');

    expect(
      normalizeMobileNotificationRoute('/customer/inspections/sess-123')
    ).toBe('/customer/inspections/sess-123');

    expect(
      normalizeMobileNotificationRoute('/customer/sessions/sess-123')
    ).toBe('/customer/inspections/sess-123');
  });

  it('normalizes staff routes', () => {
    expect(
      normalizeMobileNotificationRoute('/staff/sessions/sess-999')
    ).toBe('/staff/session/sess-999');

    expect(
      normalizeMobileNotificationRoute('/staff/today-bookings')
    ).toBe('/staff/bookings');

    expect(
      normalizeMobileNotificationRoute('/staff/fnb-orders')
    ).toBe('/staff/fnb');
  });
});

describe('getRouteFromNotificationData', () => {
  it('handles SESSION_CHECKOUT_INSPECTION correctly', () => {
    expect(
      getRouteFromNotificationData({
        type: 'SESSION_CHECKOUT_INSPECTION',
        route: '/customer/bookings/bk-999?section=handover',
        bookingId: 'bk-999',
      })
    ).toBe('/booking/bk-999');

    expect(
      getRouteFromNotificationData({
        type: 'SESSION_CHECKOUT_INSPECTION',
        bookingId: 'bk-999',
      })
    ).toBe('/booking/bk-999');

    expect(
      getRouteFromNotificationData({
        type: 'SESSION_CHECKOUT_INSPECTION',
        sessionId: 'sess-999',
      })
    ).toBe('/customer/inspections/sess-999');
  });

  it('handles SESSION_CHECKIN_INSPECTION correctly', () => {
    expect(
      getRouteFromNotificationData({
        type: 'SESSION_CHECKIN_INSPECTION',
        bookingId: 'bk-123',
      })
    ).toBe('/booking/bk-123');
  });
});
