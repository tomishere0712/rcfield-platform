import { AppDataSource } from '../config/database';
import { ContestAuditLog } from '../models/contest-audit-log.entity';
import { ContestBan } from '../models/contest-ban.entity';
import { ContestCafe } from '../models/contest-cafe.entity';
import { ContestStaffAssignment } from '../models/contest-staff-assignment.entity';
import { Contest } from '../models/contest.entity';
import { AppError, UserRole } from '../types';
import { Viewer } from './cafe.service';

export function assertProviderViewer(viewer?: Viewer): asserts viewer is Viewer {
  if (!viewer || viewer.role !== UserRole.PROVIDER) {
    throw new AppError('Bạn không có quyền thao tác contest này', 403, 'FORBIDDEN');
  }
}

export async function getContestOrThrow(contestId: string): Promise<Contest> {
  const contest = await AppDataSource.getRepository(Contest).findOne({ where: { id: contestId } });
  if (!contest) throw new AppError('Contest không tồn tại', 404, 'CONTEST_NOT_FOUND');
  return contest;
}

export async function assertContestOwner(contestId: string, viewer: Viewer): Promise<Contest> {
  const contest = await getContestOrThrow(contestId);
  if (viewer.role !== UserRole.PROVIDER || contest.providerId !== viewer.userId) {
    throw new AppError('Bạn không sở hữu contest này', 403, 'FORBIDDEN');
  }
  return contest;
}

export async function isStaffAssignedToContest(
  contestId: string,
  staffId: string,
): Promise<boolean> {
  const direct = await AppDataSource.getRepository(ContestStaffAssignment).findOne({
    where: { contestId, staffId },
  });
  return Boolean(direct);
}

export async function isStaffAssignedToCafe(staffId: string, cafeId: string): Promise<boolean> {
  const assigned = await AppDataSource.query(
    `SELECT 1
     FROM staff_cafe_assignments
     WHERE staff_id = $1 AND cafe_id = $2
     LIMIT 1`,
    [staffId, cafeId],
  );
  return assigned.length > 0;
}

export async function listContestCafeIds(contestId: string): Promise<string[]> {
  const rows = await AppDataSource.getRepository(ContestCafe).find({
    where: { contestId },
    order: { displayOrder: 'ASC' },
  });
  return rows.map((item) => item.cafeId);
}

export async function assertContestOperator(contestId: string, viewer: Viewer): Promise<Contest> {
  const contest = await getContestOrThrow(contestId);
  if (viewer.role === UserRole.PROVIDER && contest.providerId === viewer.userId) {
    return contest;
  }
  if (
    viewer.role === UserRole.STAFF &&
    (await isStaffAssignedToContest(contestId, viewer.userId))
  ) {
    return contest;
  }
  throw new AppError('Bạn không có quyền thao tác contest này', 403, 'FORBIDDEN');
}

export async function getActiveContestBan(
  userId: string,
  providerId: string,
  contestId: string,
): Promise<ContestBan | null> {
  const repo = AppDataSource.getRepository(ContestBan);
  const now = new Date();
  const bans = await repo.find({ where: { userId, providerId }, order: { createdAt: 'DESC' } });
  return (
    bans.find(
      (ban) =>
        !ban.liftedAt &&
        (!ban.expiresAt || ban.expiresAt.getTime() > now.getTime()) &&
        (ban.scopeType === 'PROVIDER' || ban.contestId === contestId),
    ) ?? null
  );
}

export async function writeContestAudit(
  payload: Partial<ContestAuditLog> & { contestId: string; eventType: string },
): Promise<void> {
  const repo = AppDataSource.getRepository(ContestAuditLog);
  const audit = repo.create({
    contestId: payload.contestId,
    registrationId: payload.registrationId ?? null,
    matchId: payload.matchId ?? null,
    actorId: payload.actorId ?? null,
    actorRole: payload.actorRole ?? null,
    eventType: payload.eventType,
    beforeJson: payload.beforeJson ?? null,
    afterJson: payload.afterJson ?? null,
    reason: payload.reason ?? null,
    metadata: payload.metadata ?? {},
  });
  await repo.save(audit);
}
