import request from 'supertest';
import { app } from '../../app';
import { AppDataSource } from '../../config/database';
import {
  BankTransactionGateway,
  BookingStatus,
  PaymentComponentStatus,
  PaymentComponentType,
  PaymentTransactionStatus,
  UserRole,
} from '../../types';
import { matchBankTransaction } from '../../services/bank-webhook.service';
import { buildSePayPayload } from '../helpers/bank-webhook.helper';
import { seedBankPaymentScenario } from '../helpers/bank-payment.fixture';
import { createTestCafe, createTestUser, generateToken } from '../helpers';
import { Booking } from '../../models/booking.entity';
import { PaymentComponent } from '../../models/payment-component.entity';
import { PaymentTransaction } from '../../models/payment-transaction.entity';

import { User } from '../../models/user.entity';
import { Cafe } from '../../models/cafe.entity';
import { env } from '../../config/env';

describe('POST /api/v1/bookings/:id/checkout-additional-payment', () => {
  let customer: User;
  let customerToken: string;
  let cafe: Cafe;
  let booking: Booking;

  beforeAll(() => {
    const mutableVnpay = env.vnpay as unknown as {
      mockEnabled: boolean;
      tmnCode: string;
      hashSecret: string;
      paymentUrl: string;
    };
    mutableVnpay.mockEnabled = true;
    mutableVnpay.tmnCode = 'MOCK_TMN';
    mutableVnpay.hashSecret = 'MOCK_SECRET';
    mutableVnpay.paymentUrl = 'https://mock.vnpay.vn';
  });

  beforeEach(async () => {
    // 1. Create a customer and token
    customer = await createTestUser({ role: UserRole.CUSTOMER });
    customerToken = generateToken(customer);

    // 2. Create a cafe
    cafe = await createTestCafe();

    // 3. Get a track type
    const [trackType] = await AppDataSource.query(`SELECT id FROM track_types LIMIT 1`);
    const trackTypeId = trackType?.id;

    // 4. Create a completed
    // b
    //     in database
    const [insertedBooking] = await AppDataSource.query(
      `INSERT INTO bookings (customer_id, cafe_id, slot_start, slot_end, play_mode, status, source, payment_expires_at, track_type_id)
       VALUES ($1, $2, NOW() - INTERVAL '2 hours', NOW() - INTERVAL '1 hour', 'BYOC', 'COMPLETED', 'APP', NOW() + INTERVAL '15 minutes', $3)
       RETURNING *`,
      [customer.id, cafe.id, trackTypeId],
    );
    booking = insertedBooking;

    // 4. Create a pending payment component representing F&B ordered at the counter.
    await AppDataSource.query(
      `INSERT INTO payment_components (booking_id, type, amount, status)
       VALUES ($1, $2, $3, $4)`,
      [booking.id, PaymentComponentType.FNB_ON_SITE, 150000, PaymentComponentStatus.PENDING],
    );
  });

  it('tạo checkout payment thành công cho phí phát sinh → 201 và tự động disburses components khi mock enabled', async () => {
    const res = await request(app)
      .post(`/api/v1/bookings/${booking.id}/checkout-additional-payment`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.payment_url).toBeTruthy();
    expect(res.body.data.total_amount).toBe(150000);

    // Because vnpay.mockEnabled is true in test/dev, processMockConfirmation should have run automatically
    // 1. Check transaction was created and marked SUCCESS
    const txRepo = AppDataSource.getRepository(PaymentTransaction);
    const tx = await txRepo.findOne({ where: { txnRef: res.body.data.txn_ref } });
    expect(tx).toBeTruthy();
    expect(tx!.status).toBe(PaymentTransactionStatus.SUCCESS);
    expect(Number(tx!.amount)).toBe(150000);
    expect(tx!.rawRequest).toMatchObject({
      additionalPayment: true,
      components: [
        expect.objectContaining({ type: PaymentComponentType.FNB_ON_SITE, amount: 150000 }),
      ],
    });

    // 2. Check the payment component status has transitioned to DISBURSED
    const compRepo = AppDataSource.getRepository(PaymentComponent);
    const comps = await compRepo.find({ where: { bookingId: booking.id } });
    expect(comps.length).toBe(1);
    expect(comps[0].status).toBe(PaymentComponentStatus.DISBURSED);

    // The payment-result page receives the same immutable fee detail that was
    // charged, rather than reconstructing it from the current F&B order list.
    const receipt = await request(app)
      .get(`/api/v1/bookings/payment-transactions/${res.body.data.txn_ref}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect(receipt.body.data.additionalPayment).toBe(true);
    expect(receipt.body.data.components).toEqual([
      expect.objectContaining({ type: PaymentComponentType.FNB_ON_SITE, amount: 150000 }),
    ]);

    const bookingDetail = await request(app)
      .get(`/api/v1/bookings/${booking.id}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect(bookingDetail.body.data.financial_summary).toMatchObject({
      additionalTotal: 150000,
      additionalPaidAmount: 150000,
      additionalOutstandingAmount: 0,
      isSettled: true,
    });
  });

  it('trả về 400 nếu không có khoản phí phát sinh nào cần thanh toán', async () => {
    // Mark the existing component as DISBURSED
    await AppDataSource.query(`UPDATE payment_components SET status = $1 WHERE booking_id = $2`, [
      PaymentComponentStatus.DISBURSED,
      booking.id,
    ]);

    const res = await request(app)
      .post(`/api/v1/bookings/${booking.id}/checkout-additional-payment`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(400);

    expect(res.body.code).toBe('NO_PENDING_ADDITIONAL_FEES');
  });

  it('từ chối nếu không phải chủ sở hữu booking → 403', async () => {
    const otherCustomer = await createTestUser({ role: UserRole.CUSTOMER });
    const otherToken = generateToken(otherCustomer);

    const res = await request(app)
      .post(`/api/v1/bookings/${booking.id}/checkout-additional-payment`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(403);

    expect(res.body.code).toBe('NOT_BOOKING_OWNER');
  });
});

/**
 * Tất toán cuối phiên bằng chuyển khoản quét mã.
 *
 * Khác luồng đặt lịch ở một điểm quyết định: xe đã trả, khách đã về, không còn
 * chỗ nào để nhả nếu không thu được tiền. Vì vậy mã QR sống lâu hơn và tiền về
 * muộn vẫn phải khớp. Đổi lại, mọi cách sinh ra HAI mã cùng sống đều là hai lần
 * thu tiền của cùng một người — bốn ca đầu dưới đây canh đúng chỗ đó.
 */
describe('tất toán cuối phiên: chuyển khoản quét mã', () => {
  async function tokenFor(customerId: string): Promise<string> {
    const [user] = await AppDataSource.query(`SELECT * FROM users WHERE id = $1`, [customerId]);
    return generateToken(user);
  }

  /** Dựng một booking đã chơi xong, còn khoản phát sinh chờ thu. */
  async function seedSettlement(amount = 180000) {
    const fx = await seedBankPaymentScenario();
    await AppDataSource.query(`UPDATE bookings SET status = $1 WHERE id = $2`, [
      BookingStatus.AWAITING_PAYMENT,
      fx.bookingId,
    ]);
    // Phiên thanh toán ban đầu đã xong, không được lẫn vào phần tất toán.
    await AppDataSource.query(`UPDATE payment_transactions SET status = $1 WHERE id = $2`, [
      PaymentTransactionStatus.SUCCESS,
      fx.paymentTransactionId,
    ]);
    await AppDataSource.query(
      `INSERT INTO payment_components (booking_id, type, amount, status)
       VALUES ($1, $2, $3, $4)`,
      [fx.bookingId, PaymentComponentType.FNB_ON_SITE, amount, PaymentComponentStatus.PENDING],
    );
    return { ...fx, settlementAmount: amount };
  }

  async function liveAdditionalTx(bookingId: string) {
    return AppDataSource.query(
      `SELECT * FROM payment_transactions
        WHERE booking_id = $1 AND txn_ref LIKE 'ctr_%' AND status = $2
        ORDER BY created_at DESC`,
      [bookingId, PaymentTransactionStatus.PENDING],
    );
  }

  // ── Ca 1 ────────────────────────────────────────────────────────────────────
  it('chọn bank_transfer thì trả mã QR kèm mã tham chiếu, không phải URL chuyển hướng', async () => {
    const fx = await seedSettlement();
    const res = await request(app)
      .post(`/api/v1/bookings/${fx.bookingId}/checkout-additional-payment`)
      .set('Authorization', `Bearer ${await tokenFor(fx.customerId)}`)
      .send({ payment_method: 'bank_transfer' });

    expect(res.status).toBe(201);
    expect(res.body.data.flow).toBe('bank_transfer');
    expect(res.body.data.bank_transfer.qr_image_data_url).toContain('data:image/png');
    expect(res.body.data.bank_transfer.amount).toBe(fx.settlementAmount);
    expect(res.body.data.bank_transfer.ref_code).toMatch(/^RCF/);

    const [tx] = await liveAdditionalTx(fx.bookingId);
    expect(tx.payment_ref_code).toBe(res.body.data.bank_transfer.ref_code);
  });

  // ── Ca 2 ────────────────────────────────────────────────────────────────────
  it('không tự xác nhận dù cờ mock VNPay đang bật', async () => {
    const fx = await seedSettlement();
    await request(app)
      .post(`/api/v1/bookings/${fx.bookingId}/checkout-additional-payment`)
      .set('Authorization', `Bearer ${await tokenFor(fx.customerId)}`)
      .send({ payment_method: 'bank_transfer' })
      .expect(201);

    // Còn nguyên PENDING: tiền chưa về thì không được disburse gì cả.
    const [tx] = await liveAdditionalTx(fx.bookingId);
    expect(tx.status).toBe(PaymentTransactionStatus.PENDING);
    const comps = await AppDataSource.query(
      `SELECT status FROM payment_components WHERE booking_id = $1 AND type = $2`,
      [fx.bookingId, PaymentComponentType.FNB_ON_SITE],
    );
    expect(comps[0].status).toBe(PaymentComponentStatus.PENDING);
  });

  // ── Ca 3 ────────────────────────────────────────────────────────────────────
  it('bấm hai lần liên tiếp thì dùng lại đúng mã cũ, không sinh mã thứ hai', async () => {
    const fx = await seedSettlement();
    const token = await tokenFor(fx.customerId);
    const call = () =>
      request(app)
        .post(`/api/v1/bookings/${fx.bookingId}/checkout-additional-payment`)
        .set('Authorization', `Bearer ${token}`)
        .send({ payment_method: 'bank_transfer' });

    const first = await call();
    const second = await call();

    expect(second.body.data.bank_transfer.ref_code).toBe(first.body.data.bank_transfer.ref_code);
    expect(await liveAdditionalTx(fx.bookingId)).toHaveLength(1);
  });

  // ── Ca 4 ────────────────────────────────────────────────────────────────────
  it('đổi sang VNPay thì mã QR cũ chết hẳn', async () => {
    const fx = await seedSettlement();
    const token = await tokenFor(fx.customerId);

    const qr = await request(app)
      .post(`/api/v1/bookings/${fx.bookingId}/checkout-additional-payment`)
      .set('Authorization', `Bearer ${token}`)
      .send({ payment_method: 'bank_transfer' });
    const deadRef = qr.body.data.bank_transfer.ref_code;

    await request(app)
      .post(`/api/v1/bookings/${fx.bookingId}/checkout-additional-payment`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(201);

    const [old] = await AppDataSource.query(
      `SELECT status FROM payment_transactions WHERE payment_ref_code = $1`,
      [deadRef],
    );
    expect(old.status).toBe(PaymentTransactionStatus.FAILED);
  });

  // ── Ca 5 ────────────────────────────────────────────────────────────────────
  it('tiền về khớp mã thì khoản phát sinh được ghi nhận đã thu', async () => {
    const fx = await seedSettlement();
    const qr = await request(app)
      .post(`/api/v1/bookings/${fx.bookingId}/checkout-additional-payment`)
      .set('Authorization', `Bearer ${await tokenFor(fx.customerId)}`)
      .send({ payment_method: 'bank_transfer' });
    const refCode = qr.body.data.bank_transfer.ref_code;

    const result = await matchBankTransaction(
      buildSePayPayload({
        content: `CT DEN:520 ${refCode} TU MB CHUYEN TIEN`,
        transferAmount: fx.settlementAmount,
        accountNumber: fx.accountNumber,
      }),
      BankTransactionGateway.SANDBOX,
    );

    expect(result.matched).toBe(true);
    const comps = await AppDataSource.query(
      `SELECT status FROM payment_components WHERE booking_id = $1 AND type = $2`,
      [fx.bookingId, PaymentComponentType.FNB_ON_SITE],
    );
    expect(comps[0].status).toBe(PaymentComponentStatus.DISBURSED);
  });

  // ── Ca 6 ────────────────────────────────────────────────────────────────────
  it('chuyển thiếu tiền thì không ghi nhận đã thu', async () => {
    const fx = await seedSettlement();
    const qr = await request(app)
      .post(`/api/v1/bookings/${fx.bookingId}/checkout-additional-payment`)
      .set('Authorization', `Bearer ${await tokenFor(fx.customerId)}`)
      .send({ payment_method: 'bank_transfer' });

    const result = await matchBankTransaction(
      buildSePayPayload({
        content: `CT DEN ${qr.body.data.bank_transfer.ref_code}`,
        transferAmount: fx.settlementAmount - 10000,
        accountNumber: fx.accountNumber,
      }),
      BankTransactionGateway.SANDBOX,
    );

    expect(result.matched).toBe(false);
    const comps = await AppDataSource.query(
      `SELECT status FROM payment_components WHERE booking_id = $1 AND type = $2`,
      [fx.bookingId, PaymentComponentType.FNB_ON_SITE],
    );
    expect(comps[0].status).toBe(PaymentComponentStatus.PENDING);
  });
});
