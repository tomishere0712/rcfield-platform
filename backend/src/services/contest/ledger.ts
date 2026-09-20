import { IsNull } from 'typeorm';
import { AppDataSource } from '../../config/database';
import { ContestLedgerEntry } from '../../models/contest-ledger-entry.entity';
import { User } from '../../models/user.entity';
import { AppError, ContestLedgerDirection, ContestStatus, UserRole } from '../../types';
import { getContestOrThrow, isStaffAssignedToContest, writeContestAudit } from '../contest.helpers';
import { uploadImage } from '../cloudinary.service';
import { Viewer } from '../cafe.service';
import { assertContestFinanceOwner } from './guards';

export interface CreateLedgerEntryBody {
  direction: ContestLedgerDirection;
  category: string;
  title: string;
  amount: number;
  occurred_at: string;
  note?: string;
  receipt_url?: string | null;
}

export interface UpdateLedgerEntryBody {
  category?: string;
  title?: string;
  amount?: number;
  occurred_at?: string;
  note?: string | null;
  receipt_url?: string | null;
}

export interface ListLedgerQuery {
  direction?: ContestLedgerDirection;
  category?: string;
  from?: string;
  to?: string;
}

type LedgerEntryPayload = {
  id: string;
  direction: ContestLedgerDirection;
  category: string;
  title: string;
  amount: number;
  occurred_at: Date;
  note: string | null;
  receipt_url: string | null;
  created_by: { id: string; full_name: string | null; role: string };
  created_at: Date;
  updated_at: Date;
};

async function mapEntries(entries: ContestLedgerEntry[]): Promise<LedgerEntryPayload[]> {
  if (entries.length === 0) return [];

  const creatorIds = Array.from(new Set(entries.map((entry) => entry.createdBy)));
  const users = await AppDataSource.getRepository(User)
    .createQueryBuilder('u')
    .where('u.id IN (:...ids)', { ids: creatorIds })
    .getMany();
  const userMap = new Map(users.map((user) => [user.id, user]));

  return entries.map((entry) => ({
    id: entry.id,
    direction: entry.direction,
    category: entry.category,
    title: entry.title,
    // Cột numeric đọc lên là chuỗi — không bọc Number() thì client nhận "1500000".
    amount: Number(entry.amount),
    occurred_at: entry.occurredAt,
    note: entry.note,
    receipt_url: entry.receiptUrl,
    created_by: {
      id: entry.createdBy,
      full_name: userMap.get(entry.createdBy)?.full_name ?? null,
      role: entry.createdByRole,
    },
    created_at: entry.createdAt,
    updated_at: entry.updatedAt,
  }));
}

/**
 * Kiểm quyền ghi bút toán và trả về vai trò sẽ chụp lại.
 *
 * Chủ doanh nghiệp ghi được ở mọi trạng thái giải — tiền cọc địa điểm trả từ khi
 * còn nháp, tiền thưởng trả sau khi kết thúc. Nhân viên thì bị siết hai lớp:
 * chỉ chiều chi, và chỉ trong lúc giải đang chạy.
 */
async function assertCanCreate(
  contestId: string,
  viewer: Viewer,
  body: CreateLedgerEntryBody,
): Promise<void> {
  if (viewer.role === UserRole.PROVIDER) {
    await assertContestFinanceOwner(contestId, viewer);
    return;
  }

  if (viewer.role !== UserRole.STAFF) {
    throw new AppError('Bạn không có quyền ghi khoản cho giải này', 403, 'FORBIDDEN');
  }

  const assigned = await isStaffAssignedToContest(contestId, viewer.userId);
  if (!assigned) {
    throw new AppError('Nhân viên không được phân công vào giải này', 403, 'FORBIDDEN');
  }

  if (body.direction === ContestLedgerDirection.IN) {
    throw new AppError(
      'Nhân viên chỉ ghi được khoản chi phát sinh',
      403,
      'CONTEST_LEDGER_STAFF_INCOME_FORBIDDEN',
    );
  }

  const contest = await getContestOrThrow(contestId);
  if (contest.status !== ContestStatus.RUNNING) {
    throw new AppError(
      'Chỉ ghi được khoản chi khi giải đang chạy. Khoản chuẩn bị trước hoặc thu dọn sau phải do chủ doanh nghiệp ghi.',
      409,
      'CONTEST_LEDGER_STAFF_WINDOW_CLOSED',
    );
  }

  if (!body.note?.trim()) {
    throw new AppError('Cần nêu lý do cho khoản chi phát sinh', 400, 'VALIDATION_ERROR');
  }
}

export async function createLedgerEntry(
  contestId: string,
  viewer: Viewer,
  body: CreateLedgerEntryBody,
): Promise<LedgerEntryPayload> {
  await assertCanCreate(contestId, viewer, body);

  const repo = AppDataSource.getRepository(ContestLedgerEntry);
  const saved = await repo.save(
    repo.create({
      contestId,
      direction: body.direction,
      category: body.category,
      title: body.title,
      amount: body.amount,
      occurredAt: new Date(body.occurred_at),
      note: body.note ?? null,
      receiptUrl: body.receipt_url ?? null,
      // Lấy từ token, không nhận từ body — nếu không, ai cũng ghi hộ được người khác.
      createdBy: viewer.userId,
      createdByRole: viewer.role,
    }),
  );

  await writeContestAudit({
    contestId,
    actorId: viewer.userId,
    actorRole: viewer.role,
    eventType: 'ledger.entry_created',
    afterJson: {
      direction: saved.direction,
      category: saved.category,
      title: saved.title,
      amount: Number(saved.amount),
      occurred_at: saved.occurredAt,
    },
    reason: saved.note,
    // contest_audit_logs không có cột ledger_entry_id; nhét vào metadata thay vì
    // sửa một bảng đang có hàng chục điểm gọi.
    metadata: { ledger_entry_id: saved.id },
  });

  const [mapped] = await mapEntries([saved]);
  return mapped;
}

export async function listLedgerEntries(
  contestId: string,
  viewer: Viewer,
  query: ListLedgerQuery = {},
): Promise<LedgerEntryPayload[]> {
  await assertContestFinanceOwner(contestId, viewer);

  const qb = AppDataSource.getRepository(ContestLedgerEntry)
    .createQueryBuilder('entry')
    .where('entry.contest_id = :contestId', { contestId })
    .andWhere('entry.deleted_at IS NULL');

  if (query.direction) qb.andWhere('entry.direction = :direction', { direction: query.direction });
  if (query.category) qb.andWhere('entry.category = :category', { category: query.category });
  if (query.from) qb.andWhere('entry.occurred_at >= :from', { from: query.from });
  if (query.to) qb.andWhere('entry.occurred_at <= :to', { to: query.to });

  const entries = await qb
    .orderBy('entry.occurred_at', 'DESC')
    .addOrderBy('entry.created_at', 'DESC')
    .getMany();

  return mapEntries(entries);
}

/**
 * Bút toán do chính nhân viên đang đăng nhập tạo.
 *
 * KHÔNG trả bất kỳ số tổng nào — nhân viên không được thấy bức tranh tài chính
 * của giải, chỉ thấy những gì mình đã ghi.
 */
export async function listMyLedgerEntries(
  contestId: string,
  viewer: Viewer,
): Promise<LedgerEntryPayload[]> {
  const entries = await AppDataSource.getRepository(ContestLedgerEntry).find({
    where: { contestId, createdBy: viewer.userId, deletedAt: IsNull() },
    order: { occurredAt: 'DESC', createdAt: 'DESC' },
  });
  return mapEntries(entries);
}

async function getOwnedEntryOrThrow(entryId: string, viewer: Viewer): Promise<ContestLedgerEntry> {
  const entry = await AppDataSource.getRepository(ContestLedgerEntry).findOne({
    where: { id: entryId, deletedAt: IsNull() },
  });
  if (!entry) {
    throw new AppError('Bút toán không tồn tại', 404, 'CONTEST_LEDGER_ENTRY_NOT_FOUND');
  }
  // Sửa/xoá chỉ dành cho chủ doanh nghiệp, kể cả bút toán do nhân viên tạo.
  await assertContestFinanceOwner(entry.contestId, viewer);
  return entry;
}

export async function updateLedgerEntry(
  entryId: string,
  viewer: Viewer,
  body: UpdateLedgerEntryBody,
): Promise<LedgerEntryPayload> {
  const entry = await getOwnedEntryOrThrow(entryId, viewer);

  const before = {
    category: entry.category,
    title: entry.title,
    amount: Number(entry.amount),
    occurred_at: entry.occurredAt,
    note: entry.note,
    receipt_url: entry.receiptUrl,
  };

  if (body.category !== undefined) entry.category = body.category;
  if (body.title !== undefined) entry.title = body.title;
  if (body.amount !== undefined) entry.amount = body.amount;
  if (body.occurred_at !== undefined) entry.occurredAt = new Date(body.occurred_at);
  if (body.note !== undefined) entry.note = body.note;
  if (body.receipt_url !== undefined) entry.receiptUrl = body.receipt_url;

  const saved = await AppDataSource.getRepository(ContestLedgerEntry).save(entry);

  await writeContestAudit({
    contestId: entry.contestId,
    actorId: viewer.userId,
    actorRole: viewer.role,
    eventType: 'ledger.entry_updated',
    beforeJson: before,
    afterJson: {
      category: saved.category,
      title: saved.title,
      amount: Number(saved.amount),
      occurred_at: saved.occurredAt,
      note: saved.note,
      receipt_url: saved.receiptUrl,
    },
    metadata: { ledger_entry_id: saved.id },
  });

  const [mapped] = await mapEntries([saved]);
  return mapped;
}

export async function softDeleteLedgerEntry(
  entryId: string,
  viewer: Viewer,
): Promise<{ id: string; deleted_at: Date }> {
  const entry = await getOwnedEntryOrThrow(entryId, viewer);

  const deletedAt = new Date();
  entry.deletedAt = deletedAt;
  await AppDataSource.getRepository(ContestLedgerEntry).save(entry);

  await writeContestAudit({
    contestId: entry.contestId,
    actorId: viewer.userId,
    actorRole: viewer.role,
    eventType: 'ledger.entry_deleted',
    beforeJson: {
      direction: entry.direction,
      category: entry.category,
      title: entry.title,
      amount: Number(entry.amount),
      occurred_at: entry.occurredAt,
    },
    metadata: { ledger_entry_id: entry.id },
  });

  return { id: entry.id, deleted_at: deletedAt };
}

/**
 * Upload ảnh chứng từ, trả URL để client gắn vào `receipt_url`.
 *
 * Tách khỏi thao tác tạo bút toán để sửa một trường nhỏ không phải gửi lại file,
 * và để lỗi upload không lẫn với lỗi validate dữ liệu.
 */
export async function uploadLedgerReceipt(
  contestId: string,
  viewer: Viewer,
  file: { buffer: Buffer; mimetype: string },
): Promise<{ url: string }> {
  const contest = await getContestOrThrow(contestId);

  if (viewer.role === UserRole.PROVIDER) {
    await assertContestFinanceOwner(contestId, viewer);
  } else if (viewer.role === UserRole.STAFF) {
    const assigned = await isStaffAssignedToContest(contestId, viewer.userId);
    if (!assigned) {
      throw new AppError('Nhân viên không được phân công vào giải này', 403, 'FORBIDDEN');
    }
  } else {
    throw new AppError('Bạn không có quyền tải chứng từ cho giải này', 403, 'FORBIDDEN');
  }

  const result = await uploadImage({
    buffer: file.buffer,
    folder: `rcfield/contests/${contest.providerId ?? 'unknown'}/receipts`,
    publicIdPrefix: `ledger-receipt-${contestId}`,
  });

  return { url: result.url };
}
