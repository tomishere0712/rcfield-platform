import type { QueryRunner } from 'typeorm';
import { AppDataSource } from '../config/database';
import { logger } from '../config/logger';
import { AppError } from '../types';

/**
 * Lõi dọn dữ liệu thử, dùng chung cho dòng lệnh và cho Contest Lab.
 *
 * Một bản duy nhất có chủ ý. Hai bản chép rời thì bản trên giao diện sẽ là bản
 * thiếu chốt chặn — vì nó là bản được sửa sau, dưới áp lực "cho nhanh".
 *
 * Mọi hàm ở đây chạy trong MỘT giao dịch do bên gọi mở. Hỏng giữa chừng thì
 * quay lại hết, không để lại giải mất một nửa hay tài khoản mất dữ liệu mà vẫn
 * còn đó.
 */

/** `QueryRunner.query` phiên bản này không nhận tham số kiểu. */
async function q<T>(qr: QueryRunner, sql: string, params?: unknown[]): Promise<T[]> {
  return (await qr.query(sql, params)) as T[];
}

export interface PurgeCount {
  table: string;
  count: number;
}

export interface ContestPurgePreview {
  provider: { id: string; email: string };
  counts: PurgeCount[];
  contestIds: string[];
}

export async function findProvider(qr: QueryRunner, key: string) {
  const rows = await q<{ id: string; email: string }>(
    qr,
    `SELECT id, email FROM users
      WHERE role = 'PROVIDER' AND (id::text = $1 OR email = $1) AND deleted_at IS NULL`,
    [key],
  );
  if (!rows.length)
    throw new AppError(`Không tìm thấy chủ sân "${key}"`, 404, 'PROVIDER_NOT_FOUND');
  return rows[0];
}

export async function previewContestPurge(
  qr: QueryRunner,
  providerKey: string,
): Promise<ContestPurgePreview> {
  const provider = await findProvider(qr, providerKey);
  const contestIds = (
    await q<{ id: string }>(qr, `SELECT id FROM contests WHERE provider_id = $1`, [provider.id])
  ).map((r) => r.id);

  if (!contestIds.length) return { provider, counts: [], contestIds };

  const dem = async (sql: string) => Number((await q<{ c: string }>(qr, sql, [contestIds]))[0].c);
  const counts: PurgeCount[] = [
    { table: 'contests', count: contestIds.length },
    {
      table: 'contest_registrations',
      count: await dem(
        `SELECT COUNT(*)::text c FROM contest_registrations WHERE contest_id = ANY($1)`,
      ),
    },
    {
      table: 'contest_matches',
      count: await dem(`SELECT COUNT(*)::text c FROM contest_matches WHERE contest_id = ANY($1)`),
    },
    {
      table: 'contest_fee_orders',
      count: await dem(
        `SELECT COUNT(*)::text c FROM contest_fee_orders WHERE contest_id = ANY($1)`,
      ),
    },
    {
      table: 'contest_audit_logs',
      count: await dem(
        `SELECT COUNT(*)::text c FROM contest_audit_logs WHERE contest_id = ANY($1)`,
      ),
    },
    {
      table: 'bookings (chỉ gỡ liên kết)',
      count: await dem(`SELECT COUNT(*)::text c FROM bookings WHERE contest_id = ANY($1)`),
    },
  ];
  return { provider, counts, contestIds };
}

/**
 * Xoá mọi giải của một chủ sân.
 *
 * Thứ tự suy từ khoá ngoại thật. Ba bảng chặn cứng (NO ACTION) phải dọn trước:
 *
 *   payment_transactions → contest_registrations → contest_fee_orders → contests
 *
 * `bookings.contest_id` là SET NULL — phiếu đặt sân KHÔNG bị xoá theo, chỉ mất
 * liên kết. Đó là chủ ý: tiền của phiếu đó là tiền thật.
 */
export async function executeContestPurge(qr: QueryRunner, contestIds: string[]): Promise<void> {
  if (!contestIds.length) return;
  const ids = [contestIds];

  await qr.query(
    `DELETE FROM payment_transactions
      WHERE contest_registration_id IN (SELECT id FROM contest_registrations WHERE contest_id = ANY($1))`,
    ids,
  );
  await qr.query(`DELETE FROM contest_audit_logs WHERE contest_id = ANY($1)`, ids);
  await qr.query(
    `DELETE FROM contest_match_participants
      WHERE match_id IN (SELECT id FROM contest_matches WHERE contest_id = ANY($1))`,
    ids,
  );
  await qr.query(`UPDATE race_records SET match_id = NULL WHERE contest_id = ANY($1)`, ids);
  await qr.query(`UPDATE featured_popups SET contest_id = NULL WHERE contest_id = ANY($1)`, ids);
  await qr.query(
    `UPDATE featured_popups SET contest_fee_order_id = NULL
      WHERE contest_fee_order_id IN (SELECT id FROM contest_fee_orders WHERE contest_id = ANY($1))`,
    ids,
  );
  await qr.query(`DELETE FROM contest_registrations WHERE contest_id = ANY($1)`, ids);
  await qr.query(`DELETE FROM contest_fee_orders WHERE contest_id = ANY($1)`, ids);
  await qr.query(`DELETE FROM contests WHERE id = ANY($1)`, ids);
  logger.warn('Purge', `đã xoá ${contestIds.length} giải`);
}

/**
 * Đếm mọi tham chiếu tới tài khoản, đọc thẳng từ khoá ngoại của CSDL.
 *
 * Không chép tay danh sách bảng: có 46 ràng buộc chặn cứng trỏ vào `users`, và
 * thêm bảng mới mà quên cập nhật thì hàm báo "sạch" rồi xoá, chết giữa chừng.
 */
export async function countUserReferences(
  qr: QueryRunner,
  userIds: string[],
): Promise<PurgeCount[]> {
  const fks = await q<{ table_name: string; column_name: string }>(
    qr,
    `SELECT tc.table_name, kcu.column_name
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name
       JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
       JOIN information_schema.referential_constraints rc ON rc.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND ccu.table_name = 'users'
        AND rc.delete_rule = 'NO ACTION'`,
  );

  const out: PurgeCount[] = [];
  for (const fk of fks) {
    const [row] = await q<{ c: string }>(
      qr,
      `SELECT COUNT(*)::text c FROM "${fk.table_name}" WHERE "${fk.column_name}" = ANY($1)`,
      [userIds],
    );
    if (Number(row.c) > 0) {
      out.push({ table: `${fk.table_name}.${fk.column_name}`, count: Number(row.c) });
    }
  }
  return out;
}

export interface UserPurgePreview {
  users: Array<{ id: string; email: string; role: string }>;
  references: PurgeCount[];
  /** Vai trò khác CUSTOMER bị mẫu email quét trúng. */
  nonCustomers: Array<{ email: string; role: string }>;
  canHardDelete: boolean;
}

/**
 * Chọn tài khoản theo MẪU email hoặc theo DANH SÁCH id cụ thể.
 *
 * Danh sách id an toàn hơn: người dùng nhìn thấy đúng từng người mình tick, còn
 * mẫu email thì phải tưởng tượng nó khớp những ai. Nhưng giữ cả hai — dòng lệnh
 * không có chỗ nào để tick.
 */
export type UserSelector = { like: string } | { ids: string[] };

export async function previewUserPurge(
  qr: QueryRunner,
  selector: UserSelector,
): Promise<UserPurgePreview> {
  const byIds = 'ids' in selector;
  if (byIds && !selector.ids.length) {
    throw new AppError('Chưa chọn tài khoản nào', 400, 'NO_USER_SELECTED');
  }
  if (!byIds && !selector.like.trim()) {
    throw new AppError('Thiếu mẫu email', 400, 'MISSING_PATTERN');
  }

  const users = await q<{ id: string; email: string; role: string }>(
    qr,
    byIds
      ? `SELECT id, email, role FROM users WHERE id = ANY($1) AND deleted_at IS NULL ORDER BY email`
      : `SELECT id, email, role FROM users WHERE email LIKE $1 AND deleted_at IS NULL ORDER BY email`,
    [byIds ? selector.ids : selector.like],
  );
  if (!users.length) {
    return { users: [], references: [], nonCustomers: [], canHardDelete: false };
  }
  const references = await countUserReferences(
    qr,
    users.map((u) => u.id),
  );
  return {
    users,
    references,
    nonCustomers: users
      .filter((u) => u.role !== 'CUSTOMER')
      .map((u) => ({ email: u.email, role: u.role })),
    canHardDelete: references.length === 0,
  };
}

/**
 * Xoá dữ liệu THUỘC VỀ CHÍNH khách đó, để tài khoản sạch tham chiếu rồi xoá hẳn.
 *
 * Danh sách viết tay có chủ ý, không quét khoá ngoại rồi xoá bừa: trong 46 bảng
 * trỏ vào `users` có cả `cafes.provider_id`. Xoá tự động là xoá luôn chi nhánh
 * của một chủ sân chỉ vì mẫu email quét trúng họ.
 */
export async function deleteCustomerOwnedData(qr: QueryRunner, ids: string[]): Promise<void> {
  // Phiếu đặt sân kéo theo phiên chơi, biên bản xe, hạng mục hư hỏng, đơn đồ ăn
  // và các khoản thanh toán — lịch sử vận hành CỦA QUÁN, không phải của khách.
  const [b] = await q<{ c: string }>(
    qr,
    `SELECT COUNT(*)::text c FROM bookings WHERE customer_id = ANY($1)`,
    [ids],
  );
  if (Number(b.c) > 0) {
    throw new AppError(
      `Khách còn ${b.c} phiếu đặt sân. Không xoá kèm được — phiếu đặt kéo theo phiên chơi, ` +
        'biên bản xe và các khoản thanh toán của quán. Dùng khoá mềm.',
      409,
      'USER_HAS_BOOKINGS',
    );
  }

  // `bank_transactions` giữ ràng buộc: dòng đã khớp bắt buộc trỏ tới một giao
  // dịch thanh toán. Xoá giao dịch thì cột về NULL và ràng buộc vỡ — đúng ra là
  // vậy, vì sổ đối soát sẽ ghi có tiền về mà không biết trả cho cái gì.
  const [bt] = await q<{ c: string }>(
    qr,
    `SELECT COUNT(*)::text c
       FROM bank_transactions bt
       JOIN payment_transactions t ON t.id = bt.payment_transaction_id
       JOIN customer_packages cp ON cp.id = t.customer_package_id
      WHERE cp.customer_id = ANY($1)`,
    [ids],
  );
  if (Number(bt.c) > 0) {
    throw new AppError(
      `Có ${bt.c} khoản đã đối soát với sao kê ngân hàng. Không xoá được — sổ đối soát sẽ còn ` +
        'ghi tiền về mà không biết trả cho cái gì. Dùng khoá mềm.',
      409,
      'USER_HAS_RECONCILED_PAYMENT',
    );
  }

  const p = [ids];
  await qr.query(
    `DELETE FROM payment_transactions
      WHERE customer_package_id IN (SELECT id FROM customer_packages WHERE customer_id = ANY($1))`,
    p,
  );
  await qr.query(`DELETE FROM customer_packages WHERE customer_id = ANY($1)`, p);
  await qr.query(`DELETE FROM reviews WHERE customer_id = ANY($1)`, p);
  await qr.query(`DELETE FROM booking_participants WHERE user_id = ANY($1)`, p);
  await qr.query(`DELETE FROM session_participants WHERE user_id = ANY($1)`, p);
}

export async function softDeleteUsers(qr: QueryRunner, ids: string[]): Promise<void> {
  await qr.query(`UPDATE users SET deleted_at = NOW() WHERE id = ANY($1)`, [ids]);
  logger.warn('Purge', `đã khoá mềm ${ids.length} tài khoản`);
}

export async function hardDeleteUsers(
  qr: QueryRunner,
  ids: string[],
  cascade: boolean,
): Promise<void> {
  if (cascade) await deleteCustomerOwnedData(qr, ids);
  const conLai = await countUserReferences(qr, ids);
  if (conLai.length) {
    // Dừng TRƯỚC lệnh xoá: để Postgres tự ném lỗi khoá ngoại thì thông báo là
    // một dòng thô, không nói bảng nào còn giữ.
    throw new AppError(
      'Vẫn còn tham chiếu: ' + conLai.map((r) => `${r.table} (${r.count})`).join(', '),
      409,
      'USER_STILL_REFERENCED',
    );
  }
  await qr.query(`DELETE FROM users WHERE id = ANY($1)`, [ids]);
  logger.warn('Purge', `đã xoá hẳn ${ids.length} tài khoản`);
}

/** Mở một giao dịch, chạy `fn`, commit nếu `apply` — ngược lại quay lại hết. */
export async function inTransaction<T>(
  apply: boolean,
  fn: (qr: QueryRunner) => Promise<T>,
): Promise<T> {
  const qr = AppDataSource.createQueryRunner();
  await qr.connect();
  await qr.startTransaction();
  try {
    const out = await fn(qr);
    if (apply) await qr.commitTransaction();
    else await qr.rollbackTransaction();
    return out;
  } catch (err) {
    await qr.rollbackTransaction();
    throw err;
  } finally {
    await qr.release();
  }
}
