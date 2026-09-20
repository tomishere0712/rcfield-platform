import { AppDataSource } from '../../config/database';
import { ContestBan } from '../../models/contest-ban.entity';
import { ContestStaffAssignment } from '../../models/contest-staff-assignment.entity';
import { User } from '../../models/user.entity';
import { AppError, ContestBanScopeType, UserRole } from '../../types';
import {
  assertContestOwner,
  assertProviderViewer,
  getContestOrThrow,
  writeContestAudit,
} from '../contest.helpers';
import { Viewer } from '../cafe.service';
import { mapContestPayload } from './payload';
import { assertContestProviderOrAssignedStaff, resolveContestProviderIdForViewer } from './guards';
import { ContestBanPayload } from './types';

export async function listContestStaffAssignments(contestId: string, viewer: Viewer) {
  await assertContestProviderOrAssignedStaff(contestId, viewer);
  const contest = await getContestOrThrow(contestId);
  const [payload] = await mapContestPayload([contest]);
  return payload.staff_assignments ?? [];
}

export async function assignContestStaff(contestId: string, staffId: string, viewer: Viewer) {
  assertProviderViewer(viewer);
  await assertContestOwner(contestId, viewer);
  const staff = await AppDataSource.getRepository(User).findOne({
    where: { id: staffId, role: UserRole.STAFF, is_active: true },
  });
  if (!staff) throw new AppError('Staff không tồn tại', 404, 'STAFF_NOT_FOUND');
  const assignmentRepo = AppDataSource.getRepository(ContestStaffAssignment);
  const existing = await assignmentRepo.findOne({ where: { contestId, staffId } });
  if (!existing) {
    await assignmentRepo.save(
      assignmentRepo.create({
        contestId,
        staffId,
        assignedBy: viewer.userId,
      }),
    );
  }
  await writeContestAudit({
    contestId,
    actorId: viewer.userId,
    actorRole: viewer.role,
    eventType: 'contest.staff_assigned',
    afterJson: { staff_id: staffId },
  });
  return listContestStaffAssignments(contestId, viewer);
}

export async function unassignContestStaff(contestId: string, staffId: string, viewer: Viewer) {
  assertProviderViewer(viewer);
  await assertContestOwner(contestId, viewer);
  await AppDataSource.getRepository(ContestStaffAssignment).delete({ contestId, staffId });
  await writeContestAudit({
    contestId,
    actorId: viewer.userId,
    actorRole: viewer.role,
    eventType: 'contest.staff_unassigned',
    afterJson: { staff_id: staffId },
  });
  return listContestStaffAssignments(contestId, viewer);
}
export async function listContestBans(contestId: string, viewer: Viewer) {
  const contest = await assertContestProviderOrAssignedStaff(contestId, viewer);
  const rows = await AppDataSource.getRepository(ContestBan).find({
    where: { providerId: contest.providerId ?? undefined },
    order: { createdAt: 'DESC' },
  });
  return rows.filter((item) => item.contestId === contestId || item.contestId === null);
}

export async function createContestBan(contestId: string, viewer: Viewer, body: ContestBanPayload) {
  const contest = await assertContestProviderOrAssignedStaff(contestId, viewer);
  const providerId = await resolveContestProviderIdForViewer(viewer, contest);

  const targetUser = await AppDataSource.getRepository(User).findOne({
    where: { id: body.user_id, role: UserRole.CUSTOMER },
  });
  if (!targetUser) {
    throw new AppError(
      'Người dùng không tồn tại hoặc không phải customer',
      400,
      'BAN_TARGET_INVALID',
    );
  }

  const repo = AppDataSource.getRepository(ContestBan);
  const ban = await repo.save(
    repo.create({
      providerId,
      contestId: body.scope_type === ContestBanScopeType.CONTEST ? contestId : null,
      userId: body.user_id,
      scopeType: body.scope_type,
      reason: body.reason,
      evidence: body.evidence ?? {},
      createdBy: viewer.userId,
      expiresAt: body.expires_at ?? null,
    }),
  );
  await writeContestAudit({
    contestId,
    actorId: viewer.userId,
    actorRole: viewer.role,
    eventType: 'contest.participant_banned',
    afterJson: { ban_id: ban.id, user_id: body.user_id, scope_type: body.scope_type },
    reason: body.reason,
  });
  return ban;
}

export async function liftContestBan(
  contestId: string,
  banId: string,
  viewer: Viewer,
  reason?: string,
) {
  const contest = await assertContestProviderOrAssignedStaff(contestId, viewer);
  const repo = AppDataSource.getRepository(ContestBan);
  const ban = await repo.findOne({
    where: {
      id: banId,
      providerId: contest.providerId ?? undefined,
    },
  });
  if (!ban) throw new AppError('Ban không tồn tại', 404, 'CONTEST_BAN_NOT_FOUND');
  ban.liftedAt = new Date();
  ban.liftedBy = viewer.userId;
  ban.liftReason = reason ?? null;
  await repo.save(ban);
  await writeContestAudit({
    contestId: contest.id,
    actorId: viewer.userId,
    actorRole: viewer.role,
    eventType: 'contest.participant_unbanned',
    afterJson: { ban_id: ban.id, user_id: ban.userId },
    reason: reason ?? null,
  });
  return ban;
}
