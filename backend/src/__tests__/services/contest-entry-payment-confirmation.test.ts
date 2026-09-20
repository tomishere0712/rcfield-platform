import { AppDataSource } from '../../config/database';
import {
  ContestEntryFeePaymentStatus,
  ContestRegistrationStatus,
  PaymentTransactionStatus,
  PaymentTransactionSubjectType,
  PaymentTransactionType,
  UserRole,
  VehicleSource,
} from '../../types';
import { createTestCafe, createTestUser } from '../helpers';
import { processConfirmationResult } from '../../services/payment.service';

/**
 * Trả phí dự thi xong, ai được duyệt tự động và ai phải chờ provider bấm tay.
 *
 * RENTAL: xe của quán, không có gì để xem — trả tiền xong là có suất luôn.
 * BYOC: khách mang xe riêng — provider phải xem ảnh xe khai báo rồi mới bấm
 * "Duyệt xe". Webhook thanh toán không được tự ý gán CONFIRMED cho ca này,
 * nếu không nút Duyệt biến mất trước khi provider kịp xem xe.
 */

async function seedRegistration(vehicleSource: VehicleSource) {
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
     VALUES ($1,$5,$1,$2,$3,$4,'DRIFT','Giải kiểm xác nhận thanh toán','OPEN',
             NOW() + INTERVAL '7 days', NOW() + INTERVAL '7 days' + INTERVAL '8 hours',
             NOW() - INTERVAL '1 hour', NOW() + INTERVAL '6 days',
             16, 150000, '{}'::jsonb)
     RETURNING id`,
    [provider.id, type.id, format.id, track.id, cafe.id],
  );

  const [reg] = await AppDataSource.query<{ id: string }[]>(
    `INSERT INTO contest_registrations
        (contest_id, user_id, participant_role_snapshot, status, payment_status, entry_fee_amount, vehicle_source, check_in_code, created_at)
      VALUES ($1,$2,'CUSTOMER',$3,$4,150000,$5, CONCAT('TEST-', gen_random_uuid()), NOW())
     RETURNING id`,
    [
      contest.id,
      customer.id,
      ContestRegistrationStatus.PENDING,
      ContestEntryFeePaymentStatus.PENDING_PAYMENT,
      vehicleSource,
    ],
  );

  return { registrationId: reg.id };
}

async function seedTransaction(registrationId: string, txnRef: string) {
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
}

async function readRegistration(id: string) {
  const [row] = await AppDataSource.query<{ status: string; payment_status: string }[]>(
    `SELECT status, payment_status FROM contest_registrations WHERE id = $1`,
    [id],
  );
  return row;
}

function vnpaySuccess(txnRef: string) {
  return {
    isValid: true,
    isSuccess: true,
    txnRef,
    amount: 150000,
    responseCode: '00',
    raw: { vnp_ResponseCode: '00' } as Record<string, unknown>,
  };
}

describe('xác nhận thanh toán lệ phí dự thi', () => {
  it('RENTAL: trả tiền xong tự động CONFIRMED, không cần ai duyệt', async () => {
    const { registrationId } = await seedRegistration(VehicleSource.RENTAL);
    const txnRef = `contest_rental_${Date.now()}`;
    await seedTransaction(registrationId, txnRef);

    const res = await processConfirmationResult(vnpaySuccess(txnRef));
    expect(res.rspCode).toBe('00');

    const reg = await readRegistration(registrationId);
    expect(reg.payment_status).toBe(ContestEntryFeePaymentStatus.MARKED_PAID);
    expect(reg.status).toBe(ContestRegistrationStatus.CONFIRMED);
  });

  it('BYOC: trả tiền xong CHỈ ghi nhận đã đóng phí, status giữ nguyên PENDING chờ provider duyệt xe', async () => {
    const { registrationId } = await seedRegistration(VehicleSource.BYOC);
    const txnRef = `contest_byoc_${Date.now()}`;
    await seedTransaction(registrationId, txnRef);

    const res = await processConfirmationResult(vnpaySuccess(txnRef));
    expect(res.rspCode).toBe('00');

    const reg = await readRegistration(registrationId);
    expect(reg.payment_status).toBe(ContestEntryFeePaymentStatus.MARKED_PAID);
    // Đây là chốt chặn của bug: nếu webhook gán cứng CONFIRMED cho mọi loại xe,
    // nút "Duyệt xe" phía provider biến mất trước khi provider kịp xem ảnh xe.
    expect(reg.status).toBe(ContestRegistrationStatus.PENDING);
  });
});
