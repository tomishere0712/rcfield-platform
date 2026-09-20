import request from 'supertest';
import { app } from '../../app';
import { AppDataSource } from '../../config/database';
import {
  ContestEntryFeePaymentStatus,
  ContestRegistrationStatus,
  PaymentTransactionStatus,
  PaymentTransactionSubjectType,
  PaymentTransactionType,
  UserRole,
} from '../../types';
import { createTestCafe, createTestUser, generateToken } from '../helpers';

/**
 * Tra cứu giao dịch cho trang kết quả thanh toán.
 *
 * Trang kết quả KHÔNG tin tham số trên địa chỉ — ai cũng sửa được, và nó có thể
 * về trước cả thông báo từ cổng thanh toán. Nó hỏi lại máy chủ, và chỉ tin khi
 * có một giao dịch SUCCESS lưu trong cơ sở dữ liệu.
 *
 * Vì thế endpoint này không tra được là màn hình nói "Chưa thể xác thực thanh
 * toán" — kể cả khi tiền đã vào. Khách trả tiền xong mà màn hình nói ngược lại
 * là chỗ mất lòng tin nặng nhất trong cả luồng.
 *
 * Phí dự thi KHÔNG gắn với đơn đặt nào: nó mang `contest_registration_id` và để
 * trống `booking_id`.
 */

async function seedContestEntryTransaction(opts?: { status?: PaymentTransactionStatus }) {
  const cafe = await createTestCafe();
  const provider = await createTestUser({ role: UserRole.PROVIDER });
  const customer = await createTestUser({ role: UserRole.CUSTOMER });

  const [type] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM contest_types LIMIT 1`,
  );
  const [format] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM contest_formats LIMIT 1`,
  );
  const [track] = await AppDataSource.query<{ id: string }[]>(`SELECT id FROM track_types LIMIT 1`);

  const [contest] = await AppDataSource.query<{ id: string }[]>(
    `INSERT INTO contests
       (provider_id, cafe_id, created_by, contest_type_id, contest_format_id, track_type_id,
        track_type, name, status, starts_at, ends_at, capacity, entry_fee, config)
     VALUES ($1,$5,$1,$2,$3,$4,'DRIFT','Giải kiểm biên nhận','OPEN',
             NOW() + INTERVAL '7 days', NOW() + INTERVAL '8 days', 16, 150000, '{}'::jsonb)
     RETURNING id`,
    [provider.id, type.id, format.id, track.id, cafe.id],
  );

  const [reg] = await AppDataSource.query<{ id: string }[]>(
    `INSERT INTO contest_registrations
       (contest_id, user_id, status, payment_status, entry_fee_amount, vehicle_source)
     VALUES ($1,$2,$3,$4,150000,'BYOC') RETURNING id`,
    [
      contest.id,
      customer.id,
      ContestRegistrationStatus.PENDING,
      ContestEntryFeePaymentStatus.MARKED_PAID,
    ],
  );

  const txnRef = `contest_${reg.id.replace(/-/g, '').slice(0, 18)}_${Date.now().toString().slice(-4)}`;
  await AppDataSource.query(
    `INSERT INTO payment_transactions
       (contest_registration_id, subject_type, type, gateway, txn_ref, amount, status)
     VALUES ($1,$2,$3,'VNPAY',$4,150000,$5)`,
    [
      reg.id,
      PaymentTransactionSubjectType.CONTEST_ENTRY,
      PaymentTransactionType.PAYMENT,
      txnRef,
      opts?.status ?? PaymentTransactionStatus.SUCCESS,
    ],
  );

  return { customer, registrationId: reg.id, txnRef };
}

function lookup(txnRef: string, token: string) {
  return request(app)
    .get(`/api/v1/bookings/payment-transactions/${encodeURIComponent(txnRef)}`)
    .set('Authorization', `Bearer ${token}`);
}

describe('GET /bookings/payment-transactions/:txnRef — phí dự thi', () => {
  it('tra được giao dịch không gắn đơn đặt nào', async () => {
    const { customer, registrationId, txnRef } = await seedContestEntryTransaction();

    const res = await lookup(txnRef, generateToken(customer)).expect(200);

    expect(res.body.data.status).toBe(PaymentTransactionStatus.SUCCESS);
    expect(res.body.data.amount).toBe(150000);
    expect(res.body.data.bookingId).toBeNull();
    expect(res.body.data.contestRegistrationId).toBe(registrationId);
    // Biên nhận phải gọi đúng tên khoản tiền, không phải "khoản thanh toán đơn đặt".
    expect(res.body.data.components).toEqual([{ type: 'CONTEST_ENTRY_FEE', amount: 150000 }]);
    expect(res.body.data.additionalPayment).toBe(false);
  });

  it('giao dịch chưa xong thì trả đúng trạng thái, không giả vờ thành công', async () => {
    const { customer, txnRef } = await seedContestEntryTransaction({
      status: PaymentTransactionStatus.PENDING,
    });

    const res = await lookup(txnRef, generateToken(customer)).expect(200);
    expect(res.body.data.status).toBe(PaymentTransactionStatus.PENDING);
  });

  it('người khác KHÔNG đọc được biên nhận của mình', async () => {
    // Biên nhận là dữ liệu riêng: số tiền và thời điểm thanh toán. Không kiểm
    // chủ sở hữu thì ai đoán được mã giao dịch đều xem được.
    const { txnRef } = await seedContestEntryTransaction();
    const nguoiLa = await createTestUser({ role: UserRole.CUSTOMER });

    await lookup(txnRef, generateToken(nguoiLa)).expect(403);
  });

  it('không đăng nhập thì không tra được', async () => {
    const { txnRef } = await seedContestEntryTransaction();
    await request(app)
      .get(`/api/v1/bookings/payment-transactions/${encodeURIComponent(txnRef)}`)
      .expect(401);
  });

  it('mã giao dịch không tồn tại vẫn trả 404 như cũ', async () => {
    const customer = await createTestUser({ role: UserRole.CUSTOMER });
    await lookup('contest_khong_co_that_0000', generateToken(customer)).expect(404);
  });
});
