import { getBookingIdFromQrPayload } from './booking-qr';

describe('getBookingIdFromQrPayload', () => {
  const bookingId = '12a1d75e-c1b1-4095-9545-99b9e8ce1334';

  it('reads the UUID produced by the booking QR endpoint', () => {
    expect(getBookingIdFromQrPayload(bookingId.toUpperCase())).toBe(bookingId);
  });

  it('accepts a UUID embedded in a deep link or URL', () => {
    expect(getBookingIdFromQrPayload(`rcfieldmobile://booking/${bookingId}`)).toBe(bookingId);
    expect(getBookingIdFromQrPayload(`https%3A%2F%2Fapp.rcfield.vn%2Fbooking%2F${bookingId}`)).toBe(
      bookingId,
    );
  });

  it('rejects a non-booking QR payload', () => {
    expect(getBookingIdFromQrPayload('https://example.com/menu')).toBeNull();
  });
});
