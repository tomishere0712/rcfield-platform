import { AppDataSource } from '../../config/database';
import {
  BankTransactionGateway,
  BookingStatus,
  PaymentTransactionStatus,
  PaymentTransactionSubjectType,
  PaymentTransactionType,
  UserRole,
} from '../../types';
import { createTestCafe, createTestUser } from './index';

/**
 * Dựng sẵn một chi nhánh đã bật nhận chuyển khoản, kèm booking chờ thanh toán
 * và giao dịch thanh toán tương ứng.
 *
 * Dùng SQL thô thay vì gọi qua service để test đối soát không phụ thuộc vào
 * luồng tạo booking — bộ đối soát chỉ cần đúng ba thứ: một `cafe_payment_settings`
 * đã xác minh, một `payment_transactions` PENDING mang mã tham chiếu, và một
 * booking còn hạn giữ chỗ.
 */

export const TEST_ACCOUNT_NUMBER = '0123453210';
export const TEST_BANK_BIN = '970436';
export const TEST_BANK_CODE = 'VCB';

interface SeedOptions {
  amount?: number;
  refCode?: string;
  /** Số phút còn lại của hạn giữ chỗ. Số âm nghĩa là đã quá hạn. */
  paymentExpiresInMinutes?: number;
  bookingStatus?: BookingStatus;
  txStatus?: PaymentTransactionStatus;
  accountNumber?: string;
  isVerified?: boolean;
}

export interface BankPaymentFixture {
  providerId: string;
  customerId: string;
  cafeId: string;
  bookingId: string;
  paymentTransactionId: string;
  txnRef: string;
  refCode: string;
  amount: number;
  accountNumber: string;
}

export async function seedBankPaymentScenario(
  options: SeedOptions = {},
): Promise<BankPaymentFixture> {
  const {
    amount = 350000,
    refCode = 'RCF7K2M9',
    paymentExpiresInMinutes = 30,
    bookingStatus = BookingStatus.PENDING,
    txStatus = PaymentTransactionStatus.PENDING,
    accountNumber = TEST_ACCOUNT_NUMBER,
    isVerified = true,
  } = options;

  const provider = await createTestUser({ role: UserRole.PROVIDER });
  const customer = await createTestUser({ role: UserRole.CUSTOMER });
  const cafe = await createTestCafe({ provider_id: provider.id });

  await AppDataSource.query(
    `INSERT INTO cafe_payment_settings
       (cafe_id, method, bank_code, bank_bin, account_number, account_name,
        is_verified, verified_at, verified_by)
     VALUES ($1, 'BANK_TRANSFER', $2, $3, $4, $5, $6, $7, $8)`,
    [
      cafe.id,
      TEST_BANK_CODE,
      TEST_BANK_BIN,
      accountNumber,
      'BUI TRONG TRI',
      isVerified,
      isVerified ? new Date() : null,
      isVerified ? provider.id : null,
    ],
  );

  const slotStart = new Date(Date.now() + 2 * 60 * 60 * 1000);
  const slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000);
  const paymentExpiresAt = new Date(Date.now() + paymentExpiresInMinutes * 60 * 1000);

  // `bookings.track_type_id` là NOT NULL không có default — lấy loại sân đầu
  // tiên của chi nhánh, bộ đối soát không quan tâm loại nào.
  const [trackType] = await AppDataSource.query(`SELECT id FROM track_types LIMIT 1`);

  const [booking] = await AppDataSource.query(
    `INSERT INTO bookings
       (customer_id, cafe_id, track_type_id, play_mode, status, slot_start,
        slot_end, payment_expires_at, snapshot)
     VALUES ($1, $2, $3, 'BYOC', $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      customer.id,
      cafe.id,
      trackType.id,
      bookingStatus,
      slotStart,
      slotEnd,
      paymentExpiresAt,
      JSON.stringify({ slot_fee_total: amount, total_charged: amount, vehicles: [] }),
    ],
  );

  const txnRef = `b_${booking.id.replace(/-/g, '').slice(0, 16)}_${Date.now()}`;

  const [tx] = await AppDataSource.query(
    `INSERT INTO payment_transactions
       (booking_id, subject_type, type, gateway, txn_ref, payment_ref_code,
        amount, status, raw_request)
     VALUES ($1, $2, $3, 'BANK_TRANSFER', $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      booking.id,
      PaymentTransactionSubjectType.BOOKING,
      PaymentTransactionType.PAYMENT,
      txnRef,
      refCode,
      amount,
      txStatus,
      JSON.stringify({ bookingId: booking.id, totalCharged: amount }),
    ],
  );

  return {
    providerId: provider.id,
    customerId: customer.id,
    cafeId: cafe.id,
    bookingId: booking.id,
    paymentTransactionId: tx.id,
    txnRef,
    refCode,
    amount,
    accountNumber,
  };
}

/** Đọc lại hàng sổ đối soát ứng với một mã giao dịch ngân hàng. */
export async function findBankTransaction(externalId: string) {
  const [row] = await AppDataSource.query(
    `SELECT * FROM bank_transactions
      WHERE external_id = $1 AND gateway = $2 AND deleted_at IS NULL`,
    [externalId, BankTransactionGateway.SANDBOX],
  );
  return row ?? null;
}

/** Đếm số hàng sổ đối soát — dùng để chứng minh chống trùng có tác dụng. */
export async function countBankTransactions(): Promise<number> {
  const [row] = await AppDataSource.query(
    `SELECT COUNT(*)::int AS count FROM bank_transactions WHERE deleted_at IS NULL`,
  );
  return row.count as number;
}
