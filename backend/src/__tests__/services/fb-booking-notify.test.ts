import { AppDataSource } from '../../config/database';
import { env } from '../../config/env';
import { encryptToken } from '../../utils/crypto';
import { BookingSource, ChannelStatus, ChannelType } from '../../types';
import type { Booking } from '../../models/booking.entity';
import { createTestCafe } from '../helpers';

const sendText = jest.fn();
jest.mock('../../services/fb-messenger.service', () => ({
  sendText: (...args: unknown[]) => sendText(...args),
  sendMessage: jest.fn(),
  sendImage: jest.fn(),
  markSeen: jest.fn(),
  typingOn: jest.fn(),
}));

// Nạp SAU khi mock, nếu không module thật đã bị giữ trong bộ nhớ.
import { notifyFacebookBookingConfirmed } from '../../services/fb-booking-notify';

/**
 * Tin nhắn xác nhận sau khi khách thanh toán.
 *
 * ── Vì sao phải có test này ─────────────────────────────────────────────────
 *
 * Đường đi từ lúc khách bấm "Thanh toán" tới lúc tin nhắn về Messenger dài và
 * đi qua nhiều module: trang ngân hàng mô phỏng → đối soát → `processConfirmationResult`
 * → móc nối này. Không có cách nào chạy thử toàn tuyến mà không dựng một Facebook
 * Page thật, nên đoạn cuối — đoạn dễ hỏng lặng lẽ nhất — phải được kiểm riêng.
 *
 * Đặc biệt là ca "thiếu psid": nó bắt đúng tình huống ai đó thêm trường mới vào
 * ảnh chụp đơn mà quên khai vào `PRESERVED_CREATION_SNAPSHOT_KEYS`, khiến danh
 * tính Facebook bị xoá sạch ngay lúc khách thanh toán.
 */
describe('fb-booking-notify: báo khách sau khi thanh toán', () => {
  const psid = '24681012141618';
  const pageId = '101234567890123';

  beforeEach(() => sendText.mockReset());

  async function seedConnectedChannel(cafeId: string) {
    await AppDataSource.query(
      `INSERT INTO cafe_channels (cafe_id, channel_type, status, page_id, page_name,
                                  encrypted_page_token, connected_at)
       VALUES ($1, $2, $3, $4, 'Trang Thử', $5, NOW())`,
      [
        cafeId,
        ChannelType.FACEBOOK_MESSENGER,
        ChannelStatus.CONNECTED,
        pageId,
        encryptToken('page-token-gia-lap', env.facebook.encryptionKey as Buffer),
      ],
    );
  }

  function bookingOf(overrides: Partial<Booking> = {}): Booking {
    return {
      id: 'a3f11111-2222-3333-4444-555555555555',
      source: BookingSource.FACEBOOK,
      slotStart: new Date('2026-08-22T12:00:00+07:00'),
      slotEnd: new Date('2026-08-22T13:00:00+07:00'),
      snapshot: { fb_psid: psid, fb_page_id: pageId },
      ...overrides,
    } as unknown as Booking;
  }

  it('gửi tin xác nhận về đúng cuộc trò chuyện, kèm mã đơn', async () => {
    const cafe = await createTestCafe();
    await seedConnectedChannel(cafe.id);

    await notifyFacebookBookingConfirmed(bookingOf());

    expect(sendText).toHaveBeenCalledTimes(1);
    const [toPsid, body] = sendText.mock.calls[0];
    expect(toPsid).toBe(psid);
    // Mã tra cứu là thứ khách đưa cho nhân viên khi tới quán — thiếu nó thì tin
    // nhắn không dùng được vào việc gì.
    expect(String(body)).toContain('RCF-A3F1');
  });

  it('KHÔNG gửi gì với đơn không đến từ Facebook', async () => {
    const cafe = await createTestCafe();
    await seedConnectedChannel(cafe.id);

    await notifyFacebookBookingConfirmed(bookingOf({ source: BookingSource.APP }));

    expect(sendText).not.toHaveBeenCalled();
  });

  it('đơn Facebook mà ảnh chụp mất danh tính thì không gửi, và không ném lỗi', async () => {
    // Xảy ra khi `createCheckoutUrl` ghi đè ảnh chụp mà `fb_psid` không nằm trong
    // danh sách giữ lại. Phải im lặng bỏ qua chứ không được làm hỏng phản hồi
    // webhook — tiền đã vào rồi.
    await expect(
      notifyFacebookBookingConfirmed(bookingOf({ snapshot: {} as never })),
    ).resolves.toBeUndefined();
    expect(sendText).not.toHaveBeenCalled();
  });

  it('chi nhánh đã ngắt kết nối Page thì không ném lỗi ra ngoài', async () => {
    // Không dựng kênh nào — tra sẽ không thấy.
    await expect(notifyFacebookBookingConfirmed(bookingOf())).resolves.toBeUndefined();
    expect(sendText).not.toHaveBeenCalled();
  });

  it('gửi Messenger hỏng cũng KHÔNG ném lỗi ra ngoài', async () => {
    const cafe = await createTestCafe();
    await seedConnectedChannel(cafe.id);
    sendText.mockRejectedValueOnce(new Error('FB send failed: 400'));

    // Hàm này chạy trong nhánh xử lý webhook thanh toán. Ném lỗi ra ngoài thì
    // cổng thanh toán coi như chưa nhận được và gửi lại, kéo theo xử lý trùng.
    await expect(notifyFacebookBookingConfirmed(bookingOf())).resolves.toBeUndefined();
  });
});
