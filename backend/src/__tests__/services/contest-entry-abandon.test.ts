import { AppDataSource } from '../../config/database';
import {
  ContestEntryFeePaymentStatus,
  ContestRegistrationStatus,
  PaymentTransactionStatus,
  PaymentTransactionSubjectType,
  PaymentTransactionType,
  UserRole,
} from '../../types';
import { createTestCafe, createTestUser } from '../helpers';
import { processConfirmationResult } from '../../services/payment.service';
import { expireUnpaidContestRegistrations } from '../../jobs/booking-timeout.job';

/**
 * Người chơi đăng ký giải rồi bỏ dở khâu trả phí dự thi.
 *
 * Suất trong giải bị GIỮ bởi những đăng ký chưa trả tiền: bộ đếm sức chứa
 * (`registrations.ts:156`) tính mọi đăng ký chưa huỷ. Không dọn thì một giải 16
 * người có thể "đầy" bằng 16 người chưa trả đồng nào — mà cũng không ai duyệt
 * được, vì duyệt đòi phí đã xong.
 *
 * Hai đường bỏ dở, phải xử khác nhau:
 *
 *  1. Khách BẤM HUỶ ở cổng thanh toán — VNPay trả mã 24. Có tín hiệu rõ ràng
 *     nên nhả suất ngay.
 *  2. Khách ĐÓNG TAB — không có tín hiệu nào cả. Chỉ hết giờ mới dọn được.
 *
 * Còn sai OTP hay lỗi ngân hàng thì KHÔNG được nhả suất: gõ nhầm một lần mà
 * mất chỗ rồi phải tranh lại là quá nặng.
 */

async function seedRegistration(minutesAgo = 0) {
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
        track_type, name, status,
        starts_at, ends_at, registration_opens_at, registration_closes_at,
        capacity, entry_fee, config)
     VALUES ($1,$5,$1,$2,$3,$4,'DRIFT','Giải kiểm bỏ dở','OPEN',
             NOW() + INTERVAL '7 days', NOW() + INTERVAL '7 days' + INTERVAL '8 hours',
             NOW() - INTERVAL '1 hour', NOW() + INTERVAL '6 days',
             16, 150000, '{}'::jsonb)
     RETURNING id`,
    [provider.id, type.id, format.id, track.id, cafe.id],
  );

  const [reg] = await AppDataSource.query<{ id: string }[]>(
    `INSERT INTO contest_registrations
        (contest_id, user_id, participant_role_snapshot, status, payment_status, entry_fee_amount, vehicle_source, check_in_code, created_at)
      VALUES ($1,$2,'CUSTOMER',$3,$4,150000,'BYOC', CONCAT('TEST-', gen_random_uuid()), NOW() - ($5 || ' minutes')::interval)
     RETURNING id`,
    [
      contest.id,
      customer.id,
      ContestRegistrationStatus.PENDING,
      ContestEntryFeePaymentStatus.PENDING_PAYMENT,
      String(minutesAgo),
    ],
  );

  return { cafe, contest, customer, registrationId: reg.id };
}

async function seedTransaction(registrationId: string, txnRef: string) {
  const repo = AppDataSource.getRepository('payment_transactions');
  await AppDataSource.query(
    `INSERT INTO payment_transactions
       (contest_registration_id, subject_type, type, gateway, txn_ref, amount, status)
     VALUES ($1,$2,$3,'VNPAY',$4,150000,$5)`,
    [
      registrationId,
      PaymentTransactionSubjectType.CONTEST_ENTRY,
      PaymentTransactionType.PAYMENT,
      txnRef,
      PaymentTransactionStatus.PENDING,
    ],
  );
  return repo;
}

async function readRegistration(id: string) {
  const [row] = await AppDataSource.query<
    { status: string; payment_status: string; cancellation_reason: string | null }[]
  >(`SELECT status, payment_status, cancellation_reason FROM contest_registrations WHERE id = $1`, [
    id,
  ]);
  return row;
}

/** Kết quả xác minh cổng thanh toán, dựng đúng hình dạng thật. */
function vnpayResult(txnRef: string, responseCode: string) {
  return {
    isValid: true,
    isSuccess: false,
    txnRef,
    amount: 150000,
    responseCode,
    raw: { vnp_ResponseCode: responseCode } as Record<string, unknown>,
  };
}

describe('khách bấm huỷ ở cổng thanh toán', () => {
  it('mã 24 — khách cố ý huỷ thì nhả suất luôn', async () => {
    const { registrationId } = await seedRegistration();
    const txnRef = `contest_huy_${Date.now()}`;
    await seedTransaction(registrationId, txnRef);

    const res = await processConfirmationResult(vnpayResult(txnRef, '24'));
    expect(res.rspCode).toBe('24');

    const reg = await readRegistration(registrationId);
    expect(reg.status).toBe(ContestRegistrationStatus.CANCELLED);
  });

  it('sai OTP hay lỗi ngân hàng thì GIỮ đăng ký để khách trả lại', async () => {
    // Gõ nhầm OTP một lần mà mất chỗ rồi phải tranh lại là quá nặng — và ở giải
    // gần đầy thì khách gần như chắc chắn mất suất.
    const { registrationId } = await seedRegistration();
    const txnRef = `contest_otp_${Date.now()}`;
    await seedTransaction(registrationId, txnRef);

    await processConfirmationResult(vnpayResult(txnRef, '75'));

    const reg = await readRegistration(registrationId);
    expect(reg.status).toBe(ContestRegistrationStatus.PENDING);
    expect(reg.payment_status).toBe(ContestEntryFeePaymentStatus.PENDING_PAYMENT);
  });
});

describe('callback thanh toán đến muộn', () => {
  it('không xác nhận lại transaction đã FAILED sau khi đăng ký được tạo lại', async () => {
    const { registrationId } = await seedRegistration();
    const txnRef = `contest_late_${Date.now()}`;
    await seedTransaction(registrationId, txnRef);
    await AppDataSource.query(`UPDATE payment_transactions SET status = $2 WHERE txn_ref = $1`, [
      txnRef,
      PaymentTransactionStatus.FAILED,
    ]);

    const res = await processConfirmationResult({
      ...vnpayResult(txnRef, '00'),
      isSuccess: true,
    });

    expect(res).toEqual({ rspCode: '02', message: 'Order already confirmed' });
    expect((await readRegistration(registrationId)).payment_status).toBe(
      ContestEntryFeePaymentStatus.PENDING_PAYMENT,
    );
  });
});

describe('khách đóng tab, không có tín hiệu nào', () => {
  it('quá cửa sổ thanh toán thì job dọn và nhả suất', async () => {
    const { registrationId } = await seedRegistration(45);

    const count = await expireUnpaidContestRegistrations();
    expect(count).toBeGreaterThanOrEqual(1);

    const reg = await readRegistration(registrationId);
    expect(reg.status).toBe(ContestRegistrationStatus.CANCELLED);
    expect(reg.cancellation_reason).toMatch(/quá hạn|hết hạn/i);
  });

  it('còn trong cửa sổ thanh toán thì KHÔNG đụng tới', async () => {
    // Dọn quá tay là cắt ngang người đang gõ OTP dở.
    const { registrationId } = await seedRegistration(5);

    await expireUnpaidContestRegistrations();

    expect((await readRegistration(registrationId)).status).toBe(ContestRegistrationStatus.PENDING);
  });

  it('đã trả tiền rồi thì không bao giờ bị dọn, dù đăng ký từ lâu', async () => {
    const { registrationId } = await seedRegistration(500);
    await AppDataSource.query(
      `UPDATE contest_registrations SET payment_status = $2 WHERE id = $1`,
      [registrationId, ContestEntryFeePaymentStatus.MARKED_PAID],
    );

    await expireUnpaidContestRegistrations();

    expect((await readRegistration(registrationId)).status).toBe(ContestRegistrationStatus.PENDING);
  });

  it('phí bằng 0 thì không bị dọn, kể cả khi trạng thái phí bị lệch', async () => {
    // Giữ NGUYÊN payment_status = PENDING_PAYMENT nhưng để phí về 0 — một trạng
    // thái lệch không nên tồn tại, vì giải miễn phí luôn được đặt NOT_REQUIRED.
    // Đặt NOT_REQUIRED ở đây thì điều kiện thời gian đã loại nó ra rồi, và ca
    // test xanh mà không hề chạm tới chốt chặn nó nói là đang kiểm.
    const { registrationId } = await seedRegistration(500);
    await AppDataSource.query(
      `UPDATE contest_registrations SET entry_fee_amount = 0 WHERE id = $1`,
      [registrationId],
    );

    await expireUnpaidContestRegistrations();

    expect((await readRegistration(registrationId)).status).toBe(ContestRegistrationStatus.PENDING);
  });

  it('chạy hai lần không huỷ lại người đã huỷ', async () => {
    await seedRegistration(45);
    const lan1 = await expireUnpaidContestRegistrations();
    const lan2 = await expireUnpaidContestRegistrations();
    expect(lan1).toBeGreaterThanOrEqual(1);
    expect(lan2).toBe(0);
  });
});

describe('hạn giữ suất báo cho người dùng', () => {
  /** Đọc mốc hết hạn đúng như giao diện đọc — qua payload trả về. */
  async function readHold(registrationId: string) {
    const { mapContestRegistrationsPayload } = await import('../../services/contest/payload');
    const repo = AppDataSource.getRepository('contest_registrations');
    const rows = await repo.find({ where: { id: registrationId } });
    const [mapped] = await mapContestRegistrationsPayload(rows as never, { includeContest: false });
    return (mapped as { entry_fee_hold_expires_at: string | null }).entry_fee_hold_expires_at;
  }

  it('mốc báo ra KHỚP với mốc job thật sự dọn', async () => {
    // Đây là điều kiện sống còn của tính năng này: lệch nhau thì màn hình hứa
    // một hạn còn hệ thống thi hành một hạn khác, và người dùng mất suất đúng
    // lúc họ tin là còn thời gian.
    //
    // Đặt đăng ký ở NGAY TRƯỚC mốc hết hạn: job phải chưa đụng tới.
    const { registrationId } = await seedRegistration(29);
    const hold = await readHold(registrationId);
    expect(hold).not.toBeNull();
    expect(new Date(hold!).getTime()).toBeGreaterThan(Date.now());

    expect(await expireUnpaidContestRegistrations()).toBe(0);
    expect((await readRegistration(registrationId)).status).toBe(ContestRegistrationStatus.PENDING);
  });

  it('quá mốc đã báo thì job dọn thật', async () => {
    const { registrationId } = await seedRegistration(31);
    const hold = await readHold(registrationId);
    expect(new Date(hold!).getTime()).toBeLessThan(Date.now());

    await expireUnpaidContestRegistrations();
    expect((await readRegistration(registrationId)).status).toBe(
      ContestRegistrationStatus.CANCELLED,
    );
  });

  it('không có gì để quá hạn thì không báo mốc nào', async () => {
    // Đã trả tiền — hiện một cái đồng hồ đếm ngược ở đây chỉ làm người ta hoảng.
    const { registrationId } = await seedRegistration(5);
    await AppDataSource.query(
      `UPDATE contest_registrations SET payment_status = $2 WHERE id = $1`,
      [registrationId, ContestEntryFeePaymentStatus.MARKED_PAID],
    );
    expect(await readHold(registrationId)).toBeNull();
  });
});
