import request from 'supertest';
import { app } from '../../app';
import { AppDataSource } from '../../config/database';
import { env } from '../../config/env';
import { BookingStatus, PaymentTransactionStatus, UserRole } from '../../types';
import { createTestUser, generateToken } from '../helpers';
import { seedBankPaymentScenario } from '../helpers/bank-payment.fixture';

/**
 * Ràng buộc số một của tính năng: **luồng VNPay không đổi một hành vi nào**.
 *
 * Cộng thêm cái bẫy nguy hiểm nhất — `payment.service.ts` tự xác nhận booking
 * ngay lúc tạo URL khi `VNPAY_MOCK_ENABLED` bật. Môi trường demo đang bật cờ đó.
 * Nếu nhánh ấy không được siết lại cho riêng VNPAY, booking chuyển khoản sẽ
 * xác nhận trước cả khi mã QR kịp hiện, và toàn bộ luồng đối soát thành vô nghĩa.
 */
describe('checkout: chọn phương thức thanh toán', () => {
  async function customerTokenFor(customerId: string): Promise<string> {
    const [user] = await AppDataSource.query(`SELECT * FROM users WHERE id = $1`, [customerId]);
    return generateToken(user);
  }

  it('không truyền payment_method thì đi đúng luồng cũ', async () => {
    const fx = await seedBankPaymentScenario();
    const token = await customerTokenFor(fx.customerId);

    const res = await request(app)
      .post(`/api/v1/bookings/${fx.bookingId}/checkout`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(201);
    // `flow` mặc định phải là redirect — client cũ không đọc trường này và
    // vẫn phải chuyển hướng như trước.
    expect(res.body.data.flow).toBe('redirect');
    expect(res.body.data.bank_transfer).toBeUndefined();
  });

  it('chọn bank_transfer khi chi nhánh chưa bật thì bị từ chối', async () => {
    const fx = await seedBankPaymentScenario({ isVerified: false });
    const token = await customerTokenFor(fx.customerId);

    const res = await request(app)
      .post(`/api/v1/bookings/${fx.bookingId}/checkout`)
      .set('Authorization', `Bearer ${token}`)
      .send({ payment_method: 'bank_transfer' });

    expect(res.status).toBe(400);
  });

  it('chọn bank_transfer thì trả mã QR kèm mã tham chiếu', async () => {
    const fx = await seedBankPaymentScenario();
    const token = await customerTokenFor(fx.customerId);

    const res = await request(app)
      .post(`/api/v1/bookings/${fx.bookingId}/checkout`)
      .set('Authorization', `Bearer ${token}`)
      .send({ payment_method: 'bank_transfer' });

    expect(res.status).toBe(201);
    expect(res.body.data.flow).toBe('bank_transfer');
    expect(res.body.data.bank_transfer.ref_code).toMatch(/^RCF[0-9A-HJKMNP-TV-Z]{5}$/);
    expect(res.body.data.bank_transfer.account_number).toBe(fx.accountNumber);
    expect(res.body.data.bank_transfer.qr_image_data_url).toContain('data:image/png');
  });

  it('⚠️ bank_transfer KHÔNG tự xác nhận dù VNPAY_MOCK_ENABLED đang bật', async () => {
    const original = env.vnpay.mockEnabled;
    // `env` là `as const` nên phải ghi đè qua Object.defineProperty.
    Object.defineProperty(env.vnpay, 'mockEnabled', { value: true, configurable: true });

    try {
      const fx = await seedBankPaymentScenario();
      const token = await customerTokenFor(fx.customerId);

      const res = await request(app)
        .post(`/api/v1/bookings/${fx.bookingId}/checkout`)
        .set('Authorization', `Bearer ${token}`)
        .send({ payment_method: 'bank_transfer' });

      expect(res.status).toBe(201);
      expect(res.body.data.flow).toBe('bank_transfer');

      // Booking phải vẫn đang chờ — tiền chưa về thì chưa xác nhận.
      const [booking] = await AppDataSource.query(`SELECT status FROM bookings WHERE id = $1`, [
        fx.bookingId,
      ]);
      expect(booking.status).toBe(BookingStatus.PENDING);

      const [tx] = await AppDataSource.query(
        `SELECT status FROM payment_transactions
          WHERE booking_id = $1 AND gateway = 'BANK_TRANSFER'
          ORDER BY created_at DESC LIMIT 1`,
        [fx.bookingId],
      );
      expect(tx.status).toBe(PaymentTransactionStatus.PENDING);
    } finally {
      Object.defineProperty(env.vnpay, 'mockEnabled', {
        value: original,
        configurable: true,
      });
    }
  });

  it('bấm thanh toán LẦN HAI vẫn trả về mã QR, không rơi về chuyển hướng', async () => {
    // Nhánh tái sử dụng giao dịch đang chờ từng trả về thiếu `flow` và
    // `bank_transfer`, khiến frontend rơi vào nhánh `window.location.href` và
    // đâm vào một URL không có trang nào. Khách bấm lại là chuyện thường.
    const fx = await seedBankPaymentScenario();
    const token = await customerTokenFor(fx.customerId);

    const first = await request(app)
      .post(`/api/v1/bookings/${fx.bookingId}/checkout`)
      .set('Authorization', `Bearer ${token}`)
      .send({ payment_method: 'bank_transfer' });

    const second = await request(app)
      .post(`/api/v1/bookings/${fx.bookingId}/checkout`)
      .set('Authorization', `Bearer ${token}`)
      .send({ payment_method: 'bank_transfer' });

    expect(second.status).toBe(201);
    expect(second.body.data.flow).toBe('bank_transfer');
    expect(second.body.data.bank_transfer).toBeDefined();
    // Cùng một giao dịch, nên cùng mã tham chiếu — không sinh mã mới.
    expect(second.body.data.bank_transfer.ref_code).toBe(first.body.data.bank_transfer.ref_code);
  });

  it('payment_url trỏ tới trang chờ theo bookingId để tải lại vẫn ra đúng đơn', async () => {
    const fx = await seedBankPaymentScenario();
    const token = await customerTokenFor(fx.customerId);

    const res = await request(app)
      .post(`/api/v1/bookings/${fx.bookingId}/checkout`)
      .set('Authorization', `Bearer ${token}`)
      .send({ payment_method: 'bank_transfer' });

    expect(res.body.data.payment_url).toContain(`/payment/bank-transfer/${fx.bookingId}`);
  });

  it('không phải chủ booking thì bị chặn', async () => {
    const fx = await seedBankPaymentScenario();
    const outsider = await createTestUser({ role: UserRole.CUSTOMER });

    const res = await request(app)
      .post(`/api/v1/bookings/${fx.bookingId}/checkout`)
      .set('Authorization', `Bearer ${generateToken(outsider)}`)
      .send({ payment_method: 'bank_transfer' });

    expect(res.status).toBe(403);
  });
});

describe('điểm nhận thông báo tiền về', () => {
  it('thiếu khoá xác thực thì 401 và KHÔNG ghi vào sổ', async () => {
    const fx = await seedBankPaymentScenario();

    const res = await request(app).post('/api/v1/payments/bank-webhook').send({
      id: 777001,
      gateway: 'Vietcombank',
      transactionDate: '2026-08-11 14:02:37',
      accountNumber: fx.accountNumber,
      content: fx.refCode,
      transferType: 'in',
      transferAmount: fx.amount,
      referenceCode: 'X',
    });

    expect(res.status).toBe(401);

    const [{ count }] = await AppDataSource.query(
      `SELECT COUNT(*)::int AS count FROM bank_transactions WHERE external_id = '777001'`,
    );
    expect(count).toBe(0);
  });

  it('khoá đúng nhưng không khớp booking vẫn trả 200', async () => {
    const res = await request(app)
      .post('/api/v1/payments/bank-webhook')
      .set('Authorization', `Apikey ${env.bankWebhook.apiKey || 'test-key'}`)
      .send({
        id: 777002,
        gateway: 'SANDBOX',
        transactionDate: '2026-08-11 14:02:37',
        accountNumber: '9999999999',
        content: 'khong co ma',
        transferType: 'in',
        transferAmount: 100000,
        referenceCode: 'Y',
      });

    // Trả khác 200 sẽ khiến dịch vụ đối soát gửi lại vô hạn.
    expect(res.status).toBe(env.bankWebhook.apiKey ? 200 : 401);
  });
});
