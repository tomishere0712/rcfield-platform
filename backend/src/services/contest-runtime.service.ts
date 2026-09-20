import { In } from 'typeorm';
import { AppDataSource } from '../config/database';
import { ContestAuditLog } from '../models/contest-audit-log.entity';
import { ContestCafe } from '../models/contest-cafe.entity';
import { ContestMatchParticipant } from '../models/contest-match-participant.entity';
import { ContestMatch } from '../models/contest-match.entity';
import { ContestRegistration } from '../models/contest-registration.entity';
import { Contest } from '../models/contest.entity';
import { RaceRecord } from '../models/race-record.entity';
import { User } from '../models/user.entity';
import {
  AppError,
  ContestMatchStatus,
  ContestMatchType,
  ContestParticipantStatus,
  ContestRegistrationStatus,
  ContestStatus,
  RaceRecordVerificationStatus,
  UserRole,
} from '../types';
import { Viewer } from './cafe.service';
import {
  assertContestOperator,
  getContestOrThrow,
  isStaffAssignedToCafe,
  isStaffAssignedToContest,
  writeContestAudit,
} from './contest.helpers';
import {
  ContestFormatEngine,
  GeneratedMatch,
  QualifyingFinalEngine,
  QualifyingFinalRankInput,
  getContestFormatEngine,
  isEliminatedStatus,
  shuffleWithSeed,
} from './contest-format.engine';

type GenerateMatchesBody = {
  cafe_id: string;
  track_config_id?: string | null;
  registration_ids?: string[];
  drivers_per_match?: number;
  seeding_mode?: 'MANUAL' | 'CHECK_IN_ORDER';
};

type MatchParticipantUpdateBody = {
  participants: Array<{
    registration_id: string;
    slot_no: number;
    lane?: string | null;
    grid_position?: number | null;
    seed_no?: number | null;
  }>;
};

type SubmitResultsBody = {
  results: Array<{
    registration_id: string;
    finish_position?: number | null;
    score?: number | null;
    best_lap_seconds?: number | null;
    total_time_seconds?: number | null;
    is_winner?: boolean;
    result_note?: string | null;
    status?: ContestParticipantStatus;
  }>;
  reason: string;
};

type CorrectResultsBody = SubmitResultsBody & {
  force_cascade?: boolean;
};

type ContestMatchesQuery = {
  round_no?: number;
  status?: 'DRAFT' | 'READY' | 'RUNNING' | 'COMPLETED' | 'CANCELLED';
  cafe_id?: string;
  participant_query?: string;
};

function getDriversPerMatch(contest: Contest, override?: number): number {
  if (override) return override;
  const configValue = contest.config?.drivers_per_match;
  return typeof configValue === 'number' && Number.isFinite(configValue) ? configValue : 2;
}

function getSeedingMode(
  contest: Contest,
  override?: 'MANUAL' | 'CHECK_IN_ORDER',
): 'MANUAL' | 'CHECK_IN_ORDER' {
  if (override) return override;
  return contest.config?.seeding_mode === 'MANUAL' ? 'MANUAL' : 'CHECK_IN_ORDER';
}

type LeaderboardMode = 'BEST_LAP' | 'TOTAL_TIME' | 'KNOCKOUT_BRACKET';

/**
 * Cách xếp hạng cuối giải.
 *
 * Đấu loại LUÔN xếp theo sơ đồ, bất kể cấu hình ghi gì: người dừng ở vòng sâu
 * hơn xếp trên. Trước đây mặc định là BEST_LAP, mà đấu loại có nhập thời gian
 * vòng chạy đâu — toàn null nên thứ tự thành tuỳ tiện. Chế độ đếm số trận thắng
 * cũng bỏ vì nó cộng cả những trận thắng do gặp ô trống.
 */
function getLeaderboardMode(contest: Contest): LeaderboardMode {
  if (getContestRuntimeFormatCode(contest) === 'KNOCKOUT') return 'KNOCKOUT_BRACKET';
  const mode = contest.config?.leaderboard_mode;
  if (mode === 'TOTAL_TIME') return 'TOTAL_TIME';
  // Giá trị cũ trong seed và ở thể thức vòng loại + chung kết: ý định vẫn là
  // "xếp theo sơ đồ đấu", chỉ khác cách tính, nên trỏ về chế độ mới thay vì để
  // rơi xuống BEST_LAP.
  if (mode === 'KNOCKOUT_WINS') return 'KNOCKOUT_BRACKET';
  return 'BEST_LAP';
}

function getContestRuntimeFormatCode(contest: Contest): string {
  return String(contest.config?.runtime_format ?? contest.config?.format ?? '');
}

function getEngine(contest: Contest): ContestFormatEngine {
  return getContestFormatEngine(contest);
}

async function validateContestCafe(contestId: string, cafeId: string): Promise<ContestCafe> {
  const contestCafe = await AppDataSource.getRepository(ContestCafe).findOne({
    where: { contestId, cafeId },
  });
  if (!contestCafe) {
    throw new AppError('Chi nhánh không thuộc contest', 400, 'CONTEST_CAFE_INVALID');
  }
  return contestCafe;
}

/**
 * Ai được đưa vào sơ đồ thi đấu.
 *
 * Mặc định chỉ nhận người đã check-in — đúng cho các thể thức bốc thăm ngay tại
 * chỗ. Riêng đấu loại trực tiếp bốc thăm SAU KHI ĐÓNG ĐĂNG KÝ và TRƯỚC ngày thi
 * để công bố sơ đồ cho khách biết trước đối thủ, nên lúc đó chưa ai check-in cả
 * và điều kiện là "đã được duyệt".
 */
async function loadEligibleRegistrations(
  contestId: string,
  registrationIds: string[],
  options?: { allowConfirmed?: boolean },
) {
  const registrations = await AppDataSource.getRepository(ContestRegistration).findBy({
    id: In(registrationIds),
    contestId,
  });
  if (registrations.length !== registrationIds.length) {
    throw new AppError('Có registration không thuộc contest', 400, 'REGISTRATION_CONTEST_MISMATCH');
  }
  const allowed = options?.allowConfirmed
    ? [ContestRegistrationStatus.CONFIRMED, ContestRegistrationStatus.CHECKED_IN]
    : [ContestRegistrationStatus.CHECKED_IN];
  for (const registration of registrations) {
    if (!allowed.includes(registration.status)) {
      throw new AppError(
        options?.allowConfirmed
          ? 'Chỉ người chơi đã được duyệt mới được đưa vào sơ đồ thi đấu'
          : 'Chỉ người chơi đã check-in mới được đưa vào thi đấu',
        400,
        'REGISTRATION_NOT_RUNTIME_READY',
      );
    }
  }
  return registrations;
}

/**
 * Trận đã ngã ngũ ngay lúc bốc thăm vì đối thủ là ô trống, hoặc vì cả hai ghế
 * đều trống. Không ai chạy nên không thể có thời gian hay điểm số.
 */
function isDecidedAtDraw(match: ContestMatch): boolean {
  return (
    match.metadata?.bye === true ||
    match.metadata?.empty_slot === true ||
    // Cả hai bên đều vắng nên không ai chạy — cũng không thể có điểm số.
    match.metadata?.no_contest === true
  );
}

/**
 * Trận đã ngã ngũ bằng thi đấu thật.
 *
 * Bốc lại sơ đồ chỉ bị cấm khi đã có người thi đấu thật. Nếu tính cả các trận
 * gặp ô trống thì giải nào không kín chỗ cũng bị khoá ngay từ giây đầu tiên,
 * dù chưa ai chạy vòng nào.
 */
function isDecidedByPlay(match: ContestMatch): boolean {
  if (match.status === ContestMatchStatus.RUNNING) return true;
  if (match.status !== ContestMatchStatus.COMPLETED) return false;
  return !isDecidedAtDraw(match);
}

async function loadMatchBundle(matchId: string) {
  const match = await AppDataSource.getRepository(ContestMatch).findOne({ where: { id: matchId } });
  if (!match) throw new AppError('Match không tồn tại', 404, 'MATCH_NOT_FOUND');
  const participants = await AppDataSource.getRepository(ContestMatchParticipant).find({
    where: { matchId },
    order: { slotNo: 'ASC' },
  });
  return { match, participants };
}

async function loadContestRegistrationsMap(registrationIds: string[]) {
  if (registrationIds.length === 0) return new Map<string, ContestRegistration>();
  const registrations = await AppDataSource.getRepository(ContestRegistration).findBy({
    id: In(registrationIds),
  });
  return new Map(registrations.map((item) => [item.id, item]));
}

async function loadUsersMap(userIds: string[]) {
  if (userIds.length === 0) return new Map<string, User>();
  const users = await AppDataSource.getRepository(User).findBy({ id: In(userIds) });
  return new Map(users.map((item) => [item.id, item]));
}

function getUserRacingProfile(user?: User | null) {
  const profile = (user?.racing_profile ?? {}) as Record<string, unknown>;
  return {
    driverHandle: typeof profile.driver_handle === 'string' ? profile.driver_handle : null,
    titleLabel:
      typeof profile.current_title_label === 'string' ? profile.current_title_label : null,
  };
}

async function loadContestMatches(contestId: string) {
  return AppDataSource.getRepository(ContestMatch).find({
    where: { contestId },
    order: { roundNo: 'ASC', matchNo: 'ASC', createdAt: 'ASC' },
  });
}

async function loadContestMatchParticipantsByMatch(matchIds: string[]) {
  if (matchIds.length === 0) return new Map<string, ContestMatchParticipant[]>();
  const participants = await AppDataSource.getRepository(ContestMatchParticipant).find({
    where: { matchId: In(matchIds) },
    order: { slotNo: 'ASC', createdAt: 'ASC' },
  });
  return participants.reduce<Map<string, ContestMatchParticipant[]>>((map, participant) => {
    const list = map.get(participant.matchId) ?? [];
    list.push(participant);
    map.set(participant.matchId, list);
    return map;
  }, new Map());
}

async function assertViewerCanViewContestMatches(contestId: string, viewer?: Viewer) {
  const contest = await getContestOrThrow(contestId);
  const isPublicContest = ![ContestStatus.DRAFT, ContestStatus.CANCELLED].includes(contest.status);

  if (!viewer) {
    if (!isPublicContest) {
      throw new AppError('Contest chưa được công khai', 404, 'CONTEST_NOT_PUBLIC');
    }
    return contest;
  }

  if (viewer.role === UserRole.PROVIDER && contest.providerId === viewer.userId) return contest;

  if (viewer.role === UserRole.STAFF) {
    const assigned = await isStaffAssignedToContest(contestId, viewer.userId);
    if (assigned) return contest;
  }

  if (viewer.role === UserRole.CUSTOMER) {
    const registration = await AppDataSource.getRepository(ContestRegistration).findOne({
      where: { contestId, userId: viewer.userId },
    });
    if (registration) return contest;
  }

  if (isPublicContest) return contest;

  throw new AppError('Bạn không có quyền xem bracket của contest này', 403, 'FORBIDDEN');
}

async function assertViewerCanOperateMatch(match: ContestMatch, viewer: Viewer) {
  if (viewer.role === UserRole.PROVIDER) {
    await assertContestOperator(match.contestId, viewer);
    return;
  }

  if (viewer.role === UserRole.STAFF) {
    const assignedToContest = await isStaffAssignedToContest(match.contestId, viewer.userId);
    const assignedToCafe = await isStaffAssignedToCafe(viewer.userId, match.cafeId);
    if (!assignedToContest || !assignedToCafe) {
      throw new AppError('Staff không được thao tác match ở chi nhánh này', 403, 'FORBIDDEN');
    }
    return;
  }

  throw new AppError('Forbidden', 403, 'FORBIDDEN');
}

async function mapMatchesPayload(contestId: string, viewer?: Viewer) {
  const matches = await loadContestMatches(contestId);
  const participantsByMatch = await loadContestMatchParticipantsByMatch(
    matches.map((item) => item.id),
  );
  const registrationIds = Array.from(
    new Set([...participantsByMatch.values()].flat().map((item) => item.registrationId)),
  );
  const registrationMap = await loadContestRegistrationsMap(registrationIds);
  const usersMap = await loadUsersMap(
    Array.from(new Set(Array.from(registrationMap.values()).map((item) => item.userId))),
  );

  return matches.map((match) => ({
    id: match.id,
    contest_id: match.contestId,
    cafe_id: match.cafeId,
    track_config_id: match.trackConfigId,
    round_no: match.roundNo,
    match_no: match.matchNo,
    name: match.name,
    match_type: match.matchType,
    status: match.status,
    scheduled_at: match.scheduledAt,
    started_at: match.startedAt,
    ended_at: match.endedAt,
    next_match_id: match.nextMatchId,
    advancement_rule: match.advancementRule,
    result_summary: match.resultSummary,
    metadata: match.metadata,
    decided_by: match.decidedBy,
    decided_at: match.decidedAt,
    participants: (participantsByMatch.get(match.id) ?? []).map((participant) => {
      const registration = registrationMap.get(participant.registrationId);
      const user = registration ? (usersMap.get(registration.userId) ?? null) : null;
      return {
        id: participant.id,
        registration_id: participant.registrationId,
        slot_no: participant.slotNo,
        lane: participant.lane,
        grid_position: participant.gridPosition,
        seed_no: participant.seedNo,
        status: participant.status,
        score: participant.score,
        finish_position: participant.finishPosition,
        best_lap_seconds: normalizeContestTimeSeconds(participant.bestLapSeconds),
        total_time_seconds: normalizeContestTimeSeconds(participant.totalTimeSeconds),
        is_winner: participant.isWinner,
        result_note: participant.resultNote,
        metadata: participant.metadata,
        registration: registration
          ? {
              id: registration.id,
              user_id: registration.userId,
              participant_name: user?.full_name ?? null,
              participant_email: user?.email ?? null,
              participant_avatar_url: user?.avatar_url ?? null,
              driver_handle: getUserRacingProfile(user).driverHandle,
              driver_title_label: getUserRacingProfile(user).titleLabel,
              status: registration.status,
              check_in_code: registration.checkInCode,
              checked_in_at: registration.checkedInAt,
              is_my_registration:
                viewer?.role === UserRole.CUSTOMER && registration.userId === viewer.userId,
            }
          : null,
      };
    }),
  }));
}

function buildHighlightRounds(matches: Awaited<ReturnType<typeof mapMatchesPayload>>) {
  const rounds = matches.reduce<
    Array<{
      round_no: number;
      label: string;
      match_count: number;
      completed_match_count: number;
      winners: Array<{
        registration_id: string;
        participant_name: string | null;
        participant_email: string | null;
        driver_handle: string | null;
        source_match_id: string;
        source_match_name: string | null;
      }>;
    }>
  >((acc, match) => {
    const existing = acc.find((item) => item.round_no === match.round_no);
    const target =
      existing ??
      (() => {
        const created = {
          round_no: match.round_no,
          label: match.name?.trim() || `Round ${match.round_no}`,
          match_count: 0,
          completed_match_count: 0,
          winners: [] as Array<{
            registration_id: string;
            participant_name: string | null;
            participant_email: string | null;
            driver_handle: string | null;
            source_match_id: string;
            source_match_name: string | null;
          }>,
        };
        acc.push(created);
        return created;
      })();

    target.match_count += 1;
    if (match.status === ContestMatchStatus.COMPLETED) target.completed_match_count += 1;
    for (const participant of match.participants.filter((item) => item.is_winner)) {
      target.winners.push({
        registration_id: participant.registration_id,
        participant_name: participant.registration?.participant_name ?? null,
        participant_email: participant.registration?.participant_email ?? null,
        driver_handle: participant.registration?.driver_handle ?? null,
        source_match_id: match.id,
        source_match_name: match.name ?? null,
      });
    }
    return acc;
  }, []);

  return rounds.sort((a, b) => a.round_no - b.round_no);
}

export async function getContestPublicRuntimeSummary(contestId: string, viewer?: Viewer) {
  await assertViewerCanViewContestMatches(contestId, viewer);
  const matches = await mapMatchesPayload(contestId, viewer);
  const rounds = Array.from(new Set(matches.map((item) => item.round_no))).sort((a, b) => a - b);
  const currentRound =
    matches.find((item) =>
      [ContestMatchStatus.RUNNING, ContestMatchStatus.READY].includes(item.status),
    )?.round_no ??
    matches.find((item) => item.status === ContestMatchStatus.COMPLETED)?.round_no ??
    null;
  const liveMatch = matches.find((item) => item.status === ContestMatchStatus.RUNNING) ?? null;

  return {
    total_matches: matches.length,
    total_rounds: rounds.length,
    current_round_no: currentRound,
    has_live_matches: Boolean(liveMatch),
    live_match_id: liveMatch?.id ?? null,
    completed_matches: matches.filter((item) => item.status === ContestMatchStatus.COMPLETED)
      .length,
    highlight_rounds: buildHighlightRounds(matches),
  };
}

async function clearExistingRuntime(contestId: string) {
  const matchRepo = AppDataSource.getRepository(ContestMatch);
  const participantRepo = AppDataSource.getRepository(ContestMatchParticipant);
  const matches = await matchRepo.find({ where: { contestId } });
  if (matches.length === 0) return;
  await participantRepo.delete({ matchId: In(matches.map((item) => item.id)) });
  await matchRepo.delete({ contestId });
}

async function ensureContestRuntimeEditable(contest: Contest) {
  if (![ContestStatus.OPEN, ContestStatus.CLOSED, ContestStatus.RUNNING].includes(contest.status)) {
    throw new AppError(
      'Contest phải ở trạng thái OPEN, CLOSED hoặc RUNNING để thao tác runtime',
      400,
      'CONTEST_RUNTIME_NOT_READY',
    );
  }
}

async function protectDownstreamCorrection(match: ContestMatch, forceCascade: boolean) {
  const matchRepo = AppDataSource.getRepository(ContestMatch);
  const participantRepo = AppDataSource.getRepository(ContestMatchParticipant);

  // Walk the entire downstream chain (next_match_id -> next_match_id -> ...).
  const downstreamChain: ContestMatch[] = [];
  let currentId: string | null = match.nextMatchId;
  while (currentId) {
    const current = await matchRepo.findOne({ where: { id: currentId } });
    if (!current) break;
    downstreamChain.push(current);
    currentId = current.nextMatchId;
  }

  if (downstreamChain.length === 0) return;

  const hasLinkedParticipants = await participantRepo
    .createQueryBuilder('participant')
    .where('participant.match_id IN (:...matchIds)', {
      matchIds: downstreamChain.map((item) => item.id),
    })
    .andWhere("participant.metadata ->> 'source_match_id' = :sourceMatchId", {
      sourceMatchId: match.id,
    })
    .getExists();

  if (!hasLinkedParticipants) return;

  if (!forceCascade) {
    throw new AppError(
      'Match này đã advance participant sang round sau; dùng force_cascade để sửa',
      409,
      'MATCH_CORRECTION_REQUIRES_FORCE',
    );
  }

  for (const downstream of downstreamChain) {
    if (downstream.status === ContestMatchStatus.COMPLETED) {
      throw new AppError(
        'Không thể force correction khi có match hạ nguồn đã hoàn tất',
        409,
        'MATCH_CORRECTION_DOWNSTREAM_COMPLETED',
      );
    }
  }

  // Chỉ gỡ những người do CHÍNH trận này đẩy sang. Trước đây xoá sạch cả chuỗi
  // hạ nguồn, cuốn theo cả người do nhánh bên kia đẩy vào — và không có gì đưa
  // họ trở lại, nên chung kết âm thầm mất một người.
  for (const downstream of downstreamChain) {
    const contributed = await participantRepo.find({ where: { matchId: downstream.id } });
    const fromThisMatch = contributed.filter((item) => item.metadata?.source_match_id === match.id);
    if (fromThisMatch.length > 0) await participantRepo.remove(fromThisMatch);

    const remaining = contributed.length - fromThisMatch.length;
    downstream.status = remaining >= 2 ? ContestMatchStatus.READY : ContestMatchStatus.DRAFT;
    downstream.startedAt = null;
    downstream.endedAt = null;
    downstream.decidedAt = null;
    downstream.decidedBy = null;
    downstream.resultSummary = {};
    await matchRepo.save(downstream);
  }
}

export async function listContestMatches(
  contestId: string,
  viewer?: Viewer,
  query?: ContestMatchesQuery,
) {
  await assertViewerCanViewContestMatches(contestId, viewer);
  const mapped = await mapMatchesPayload(contestId, viewer);
  const normalizedQuery = query?.participant_query?.toLowerCase();
  return mapped.filter((match) => {
    const matchesRound = !query?.round_no || match.round_no === query.round_no;
    const matchesStatus = !query?.status || match.status === query.status;
    const matchesCafe = !query?.cafe_id || match.cafe_id === query.cafe_id;
    const matchesParticipant =
      !normalizedQuery ||
      match.participants.some((participant) =>
        [participant.registration?.participant_name, participant.registration?.participant_email]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(normalizedQuery)),
      );
    return matchesRound && matchesStatus && matchesCafe && matchesParticipant;
  });
}

async function persistGeneratedMatches(
  contestId: string,
  generatedMatches: GeneratedMatch[],
  options: { cafeId: string; trackConfigId?: string | null; createdBy: string },
): Promise<ContestMatch[]> {
  const matchRepo = AppDataSource.getRepository(ContestMatch);
  const participantRepo = AppDataSource.getRepository(ContestMatchParticipant);

  const roundMap = new Map<number, ContestMatch[]>();
  const createdMatches: ContestMatch[] = [];

  for (const generated of generatedMatches) {
    // Trận đã ngã ngũ ngay lúc bốc thăm (gặp ô trống, hoặc cả hai ghế đều trống)
    // được đóng luôn để không nằm chờ staff thao tác.
    const decidedAtDraw = generated.status === ContestMatchStatus.COMPLETED;
    const match = await matchRepo.save(
      matchRepo.create({
        contestId,
        cafeId: options.cafeId,
        trackConfigId: options.trackConfigId ?? null,
        roundNo: generated.roundNo,
        matchNo: generated.matchNo,
        name: generated.name,
        matchType: generated.matchType,
        status: generated.status,
        scheduledAt: generated.scheduledAt,
        startedAt: null,
        endedAt: decidedAtDraw ? new Date() : null,
        decidedAt: decidedAtDraw ? new Date() : null,
        decidedBy: decidedAtDraw ? options.createdBy : null,
        advancementRule: generated.advancementRule,
        metadata: generated.metadata,
        createdBy: options.createdBy,
      }),
    );
    createdMatches.push(match);
    const list = roundMap.get(generated.roundNo) ?? [];
    list.push(match);
    roundMap.set(generated.roundNo, list);
  }

  // Link next matches using generated nextMatchIndex pointers.
  for (const [index, generated] of generatedMatches.entries()) {
    if (generated.nextMatchIndex !== undefined) {
      const nextRoundMatches = roundMap.get(generated.roundNo + 1) ?? [];
      const nextMatch = nextRoundMatches[generated.nextMatchIndex];
      if (nextMatch) {
        const match = createdMatches[index];
        match.nextMatchId = nextMatch.id;
        await matchRepo.save(match);
      }
    }
  }

  // Create participants.
  for (const [index, generated] of generatedMatches.entries()) {
    const match = createdMatches[index];
    for (const participant of generated.participants) {
      await participantRepo.save(
        participantRepo.create({
          matchId: match.id,
          registrationId: participant.registrationId,
          slotNo: participant.slotNo,
          lane: participant.lane ?? null,
          gridPosition: participant.gridPosition ?? null,
          seedNo: participant.seedNo ?? null,
          status: participant.status,
          isWinner: participant.isWinner ?? false,
          metadata: participant.metadata ?? {},
        }),
      );
    }
  }

  return createdMatches;
}

/**
 * Điền hai người thua bán kết vào trận tranh hạng 3.
 *
 * Trận này không nằm trên đường `next_match_id` — đường đó chỉ dành cho người
 * thắng — nên nó không bao giờ tự có người. Phải gọi lại sau mỗi lần một trận
 * bán kết ngã ngũ, nếu không trận tranh hạng 3 nằm mãi ở DRAFT và chặn công bố
 * bảng xếp hạng vĩnh viễn.
 */
async function populateThirdPlaceMatch(contestId: string): Promise<void> {
  const matchRepo = AppDataSource.getRepository(ContestMatch);
  const participantRepo = AppDataSource.getRepository(ContestMatchParticipant);

  const contestMatches = await matchRepo.find({ where: { contestId } });
  const thirdPlaceMatch = contestMatches.find((match) => match.metadata?.third_place === true);
  if (!thirdPlaceMatch) return;
  if (thirdPlaceMatch.status === ContestMatchStatus.COMPLETED) return;
  if ((await participantRepo.count({ where: { matchId: thirdPlaceMatch.id } })) > 0) return;

  const feederRoundNo = Number(thirdPlaceMatch.metadata?.feeder_round_no ?? 0);
  if (!feederRoundNo) return;

  const feederMatches = contestMatches.filter(
    (match) => match.roundNo === feederRoundNo && match.metadata?.third_place !== true,
  );
  if (feederMatches.length === 0) return;
  // Chờ đủ cả hai bán kết: điền sớm một nửa thì người thua bán kết còn lại
  // không còn chỗ.
  if (feederMatches.some((match) => match.status !== ContestMatchStatus.COMPLETED)) return;

  const feederParticipants = await loadContestMatchParticipantsByMatch(
    feederMatches.map((match) => match.id),
  );
  // Bán kết thắng do gặp ô trống chỉ có một người và người đó là người thắng,
  // nên không sinh ra người thua nào.
  const losers = feederMatches.flatMap((match) =>
    (feederParticipants.get(match.id) ?? []).filter((participant) => !participant.isWinner),
  );

  if (losers.length === 0) {
    thirdPlaceMatch.status = ContestMatchStatus.COMPLETED;
    thirdPlaceMatch.endedAt = new Date();
    thirdPlaceMatch.decidedAt = new Date();
    thirdPlaceMatch.metadata = { ...thirdPlaceMatch.metadata, empty_slot: true };
    await matchRepo.save(thirdPlaceMatch);
  } else {
    for (const [index, loser] of losers.slice(0, 2).entries()) {
      await participantRepo.save(
        participantRepo.create({
          matchId: thirdPlaceMatch.id,
          registrationId: loser.registrationId,
          slotNo: index + 1,
          lane: `L${index + 1}`,
          seedNo: loser.seedNo,
          // Chỉ một người tới được thì người đó nhận hạng 3, không phải thi đấu.
          isWinner: losers.length === 1,
          status:
            losers.length === 1
              ? ContestParticipantStatus.FINISHED
              : ContestParticipantStatus.READY,
          metadata: {
            source_match_id: loser.matchId,
            advanced_as: 'third_place_feeder',
          },
        }),
      );
    }

    if (losers.length === 1) {
      thirdPlaceMatch.status = ContestMatchStatus.COMPLETED;
      thirdPlaceMatch.endedAt = new Date();
      thirdPlaceMatch.decidedAt = new Date();
      thirdPlaceMatch.metadata = { ...thirdPlaceMatch.metadata, bye: true };
    } else {
      thirdPlaceMatch.status = ContestMatchStatus.READY;
    }
    await matchRepo.save(thirdPlaceMatch);
  }

  await writeContestAudit({
    contestId,
    matchId: thirdPlaceMatch.id,
    actorId: null,
    actorRole: 'SYSTEM',
    eventType: 'match.third_place_populated',
    afterJson: {
      status: thirdPlaceMatch.status,
      loser_count: losers.length,
      registration_ids: losers.slice(0, 2).map((item) => item.registrationId),
    },
  });
}

export async function generateContestMatches(
  contestId: string,
  viewer: Viewer,
  body: GenerateMatchesBody,
) {
  const contest = await assertContestOperator(contestId, viewer);
  await ensureContestRuntimeEditable(contest);
  await validateContestCafe(contestId, body.cafe_id);

  if (viewer.role === UserRole.STAFF) {
    const assignedToCafe = await isStaffAssignedToCafe(viewer.userId, body.cafe_id);
    if (!assignedToCafe) {
      throw new AppError('Staff không được tạo runtime ở chi nhánh này', 403, 'FORBIDDEN');
    }
  }

  const engine = getEngine(contest);
  const isKnockoutDraw = engine.code === 'KNOCKOUT';

  // Đấu loại bốc thăm từ toàn bộ người đã duyệt; bỏ trống registration_ids nghĩa
  // là "bốc cả giải", ban tổ chức không nhặt ai vào ai ra.
  const requestedIds = body.registration_ids?.length
    ? body.registration_ids
    : (
        await AppDataSource.getRepository(ContestRegistration).findBy({
          contestId,
          status: isKnockoutDraw
            ? In([ContestRegistrationStatus.CONFIRMED, ContestRegistrationStatus.CHECKED_IN])
            : ContestRegistrationStatus.CHECKED_IN,
        })
      ).map((item) => item.id);

  if (requestedIds.length === 0) {
    throw new AppError(
      'Chưa có người chơi nào đủ điều kiện để tạo lượt thi đấu',
      400,
      'CONTEST_NOT_ENOUGH_PARTICIPANTS',
    );
  }
  // Chỉ sơ đồ đấu loại mới cần đối thủ; đua tính giờ một VĐV vẫn là một lượt chạy hợp lệ.
  if (isKnockoutDraw && requestedIds.length < 2) {
    throw new AppError(
      'Cần ít nhất 2 người đã được duyệt để bốc thăm sơ đồ đấu loại',
      400,
      'CONTEST_NOT_ENOUGH_PARTICIPANTS',
    );
  }

  const registrations = await loadEligibleRegistrations(contestId, requestedIds, {
    allowConfirmed: isKnockoutDraw,
  });
  const matchRepo = AppDataSource.getRepository(ContestMatch);

  const existingMatches = await matchRepo.find({ where: { contestId } });
  if (existingMatches.some(isDecidedByPlay)) {
    throw new AppError(
      'Không thể bốc thăm lại khi đã có trận thi đấu xong hoặc đang diễn ra',
      409,
      'CONTEST_RUNTIME_LOCKED',
    );
  }

  // Đấu loại: bốc ngẫu nhiên, lưu seed để dựng lại đúng lá thăm khi có khiếu nại.
  const drawSeed = isKnockoutDraw ? Math.floor(Math.random() * 0xffffffff) : null;
  const orderedRegistrations = isKnockoutDraw
    ? shuffleWithSeed(registrations, drawSeed!)
    : getSeedingMode(contest, body.seeding_mode) === 'CHECK_IN_ORDER'
      ? ([...registrations] as ContestRegistration[]).sort((a, b) => {
          const aTime = a.checkedInAt?.getTime() ?? a.createdAt.getTime();
          const bTime = b.checkedInAt?.getTime() ?? b.createdAt.getTime();
          return aTime - bTime;
        })
      : requestedIds
          .map((registrationId) => registrations.find((item) => item.id === registrationId)!)
          .filter(Boolean);

  await clearExistingRuntime(contestId);

  const driversPerMatch = Math.max(1, getDriversPerMatch(contest, body.drivers_per_match));
  const generatedMatches = engine.generateMatches({
    contest,
    cafeId: body.cafe_id,
    trackConfigId: body.track_config_id,
    registrations,
    registrationOrder: orderedRegistrations.map((item) => item.id),
    driversPerMatch,
    seedingMode: getSeedingMode(contest, body.seeding_mode),
    createdBy: viewer.userId,
  });

  const createdMatches = await persistGeneratedMatches(contestId, generatedMatches, {
    cafeId: body.cafe_id,
    trackConfigId: body.track_config_id,
    createdBy: viewer.userId,
  });

  // Người thắng do gặp ô trống đã được engine đẩy sang vòng sau ngay lúc sinh sơ
  // đồ, nên ở đây không cần advance thêm lần nữa.

  // Sơ đồ quá ít người thì bán kết có thể ngã ngũ ngay lúc bốc, phải điền trận
  // tranh hạng 3 luôn chứ không đợi ai nhập kết quả.
  await populateThirdPlaceMatch(contestId);

  // Bốc thăm là lúc chốt danh sách, nên đăng ký đóng lại luôn.
  if (contest.status === ContestStatus.OPEN) {
    contest.status = ContestStatus.CLOSED;
  }
  if (drawSeed !== null) {
    // Lưu cả seed lẫn thứ tự đã bốc: seed để chứng minh không ai can thiệp, thứ
    // tự để đối chiếu ngay mà không phải chạy lại thuật toán.
    contest.config = {
      ...(contest.config ?? {}),
      bracket_draw: {
        seed: drawSeed,
        drawn_at: new Date().toISOString(),
        drawn_by: viewer.userId,
        registration_order: orderedRegistrations.map((item) => item.id),
      },
    };
  }
  await AppDataSource.getRepository(Contest).save(contest);

  await writeContestAudit({
    contestId,
    actorId: viewer.userId,
    actorRole: viewer.role,
    eventType: isKnockoutDraw ? 'contest.bracket_drawn' : 'contest.matches_generated',
    afterJson: {
      generated_match_count: createdMatches.length,
      registration_count: orderedRegistrations.length,
      format: engine.code,
      ...(drawSeed !== null ? { draw_seed: drawSeed } : {}),
    },
    metadata: {
      cafe_id: body.cafe_id,
      track_config_id: body.track_config_id ?? null,
      seeding_mode: getSeedingMode(contest, body.seeding_mode),
      drivers_per_match: driversPerMatch,
      format: engine.code,
    },
  });

  return mapMatchesPayload(contestId, viewer);
}

/**
 * Gộp mọi lượt chạy vòng loại về một dòng cho mỗi VĐV.
 *
 * Hai luật, cả hai đều từng sai:
 *
 * 1. Mỗi người chạy nhiều lượt nên xuất hiện nhiều lần trong danh sách kết quả.
 *    Xếp hạng thẳng trên danh sách thô thì một người nhanh chiếm luôn hai, ba
 *    suất chung kết, đẩy người khác ra ngoài.
 * 2. Người không hoàn thành lượt nào — DNS, DNF, DQ, hoặc chỉ đơn giản là chưa
 *    có thời gian — trước đây vẫn nằm trong danh sách với thời gian coi như vô
 *    cực, nên vẫn lọt vào chung kết khi số người có thành tích ít hơn số suất.
 *    Vào chung kết mà chưa từng chạy xong một vòng là sai về thể thao.
 */
function aggregateQualifyingResults(
  participants: ContestMatchParticipant[],
): QualifyingFinalRankInput[] {
  const bestByRegistration = new Map<string, QualifyingFinalRankInput>();

  for (const participant of participants) {
    if (isEliminatedStatus(participant.status)) continue;

    const bestLapSeconds = normalizeContestTimeSeconds(participant.bestLapSeconds);
    const totalTimeSeconds = normalizeContestTimeSeconds(participant.totalTimeSeconds);
    if (bestLapSeconds === null && totalTimeSeconds === null) continue;

    const current = bestByRegistration.get(participant.registrationId);
    if (!current) {
      bestByRegistration.set(participant.registrationId, {
        registrationId: participant.registrationId,
        bestLapSeconds,
        totalTimeSeconds,
        seedNo: participant.seedNo,
      });
      continue;
    }

    bestByRegistration.set(participant.registrationId, {
      registrationId: participant.registrationId,
      bestLapSeconds: pickFasterTime(current.bestLapSeconds, bestLapSeconds),
      totalTimeSeconds: pickFasterTime(current.totalTimeSeconds ?? null, totalTimeSeconds),
      seedNo: current.seedNo ?? participant.seedNo,
    });
  }

  return [...bestByRegistration.values()];
}

function pickFasterTime(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.min(a, b);
}

export async function generateContestFinalBracket(contestId: string, viewer: Viewer) {
  const contest = await assertContestOperator(contestId, viewer);
  await ensureContestRuntimeEditable(contest);

  const engine = getEngine(contest);
  if (!(engine instanceof QualifyingFinalEngine)) {
    throw new AppError(
      'Chỉ contest format QUALIFYING_FINAL mới có vòng chung kết từ vòng loại',
      400,
      'CONTEST_FORMAT_NOT_QUALIFYING_FINAL',
    );
  }

  const matches = await loadContestMatches(contestId);

  const qualifyingMatches = matches.filter(
    (match) => match.metadata?.phase === 'QUALIFYING' || match.roundNo === 1,
  );
  if (qualifyingMatches.length === 0) {
    throw new AppError(
      'Contest chưa có vòng loại; hãy generate matches trước',
      400,
      'QUALIFYING_NOT_GENERATED',
    );
  }
  // Sinh nhầm nhánh chung kết từng là ngõ cụt: generate matches bị khoá vì vòng
  // loại đã xong, còn đây thì chặn cứng. Lối thoát duy nhất là sửa DB tay. Nay
  // chừng nào chưa ai đấu trận chung kết nào thì vẫn dựng lại được.
  const existingFinalMatches = matches.filter((match) => !qualifyingMatches.includes(match));
  if (existingFinalMatches.length > 0) {
    if (existingFinalMatches.some(isDecidedByPlay)) {
      throw new AppError(
        'Vòng chung kết đã bắt đầu thi đấu, không dựng lại được',
        409,
        'FINAL_BRACKET_ALREADY_PLAYED',
      );
    }
    const participantRepo = AppDataSource.getRepository(ContestMatchParticipant);
    await participantRepo.delete({ matchId: In(existingFinalMatches.map((item) => item.id)) });
    await AppDataSource.getRepository(ContestMatch).delete({
      id: In(existingFinalMatches.map((item) => item.id)),
    });
  }
  if (qualifyingMatches.some((match) => match.status !== ContestMatchStatus.COMPLETED)) {
    throw new AppError(
      'Tất cả match vòng loại phải hoàn tất trước khi tạo vòng chung kết',
      409,
      'QUALIFYING_NOT_COMPLETED',
    );
  }

  const participantsByMatch = await loadContestMatchParticipantsByMatch(
    qualifyingMatches.map((match) => match.id),
  );
  const qualifyingResults = [...participantsByMatch.values()].flat();
  const rankInputs = aggregateQualifyingResults(qualifyingResults);
  if (rankInputs.length < 2) {
    throw new AppError(
      'Cần ít nhất 2 người có thành tích vòng loại để tạo vòng chung kết',
      400,
      'QUALIFYING_RESULTS_INSUFFICIENT',
    );
  }

  const ranked = engine.rankQualifyingResults(rankInputs);
  const finalistsCount = Math.min(engine.resolveFinalistsCount(contest), ranked.length);
  const finalistIds = ranked.slice(0, finalistsCount).map((item) => item.registrationId);

  const registrations = await AppDataSource.getRepository(ContestRegistration).findBy({
    id: In(finalistIds),
  });

  // Vòng loại chiếm mỗi lượt chạy một vòng, nên nhánh chung kết phải bắt đầu
  // sau vòng loại cuối cùng. Cắm cứng số 2 thì giải nhiều lượt sẽ đụng khoá
  // duy nhất (contest_id, round_no, match_no) ngay lúc ghi.
  const lastQualifyingRound = Math.max(...qualifyingMatches.map((match) => match.roundNo));

  const generatedMatches = engine.generateFinalBracket({
    contest,
    cafeId: qualifyingMatches[0].cafeId,
    trackConfigId: qualifyingMatches[0].trackConfigId,
    registrations,
    registrationOrder: finalistIds,
    driversPerMatch: 2,
    createdBy: viewer.userId,
    startRoundNo: lastQualifyingRound + 1,
  });

  const createdMatches = await persistGeneratedMatches(contestId, generatedMatches, {
    cafeId: qualifyingMatches[0].cafeId,
    trackConfigId: qualifyingMatches[0].trackConfigId,
    createdBy: viewer.userId,
  });

  // Người thắng do gặp ô trống đã được engine đẩy sang vòng sau ngay lúc sinh sơ
  // đồ, nên ở đây không cần advance thêm lần nữa.

  await writeContestAudit({
    contestId,
    actorId: viewer.userId,
    actorRole: viewer.role,
    eventType: 'contest.final_bracket_generated',
    afterJson: {
      generated_match_count: createdMatches.length,
      finalists: finalistIds,
      finalists_count: finalistsCount,
      format: engine.code,
    },
  });

  return mapMatchesPayload(contestId, viewer);
}

export async function updateMatchParticipants(
  matchId: string,
  viewer: Viewer,
  body: MatchParticipantUpdateBody,
) {
  const { match, participants } = await loadMatchBundle(matchId);
  await assertViewerCanOperateMatch(match, viewer);

  if ([ContestMatchStatus.COMPLETED, ContestMatchStatus.RUNNING].includes(match.status)) {
    throw new AppError(
      'Không thể đổi participant khi match đang diễn ra hoặc đã hoàn tất',
      400,
      'MATCH_LOCKED',
    );
  }

  const participantRepo = AppDataSource.getRepository(ContestMatchParticipant);
  // Sơ đồ đấu loại được bốc TRƯỚC ngày thi nên chưa ai check-in cả; sửa sơ đồ
  // mà đòi đã check-in thì suốt từ lúc bốc tới sáng ngày thi không đụng vào
  // được. Điều kiện đúng là "đã được duyệt", giống hệt lúc bốc thăm.
  const contest = await getContestOrThrow(match.contestId);
  const registrations = await loadEligibleRegistrations(
    match.contestId,
    body.participants.map((item) => item.registration_id),
    { allowConfirmed: getEngine(contest).code === 'KNOCKOUT' },
  );
  const registrationMap = new Map(registrations.map((item) => [item.id, item]));

  const seenSlots = new Set<number>();
  for (const item of body.participants) {
    if (seenSlots.has(item.slot_no)) {
      throw new AppError('slot_no bị trùng trong cùng match', 400, 'MATCH_SLOT_DUPLICATED');
    }
    seenSlots.add(item.slot_no);
  }

  const existingByRegistrationId = new Map(participants.map((item) => [item.registrationId, item]));
  const requestedRegistrationIds = new Set(body.participants.map((item) => item.registration_id));

  // Delete participants that are no longer in the requested list.
  for (const participant of participants) {
    if (!requestedRegistrationIds.has(participant.registrationId)) {
      await participantRepo.remove(participant);
    }
  }

  // Upsert participants to preserve any already-submitted result data.
  for (const item of body.participants) {
    const registration = registrationMap.get(item.registration_id)!;
    const existing = existingByRegistrationId.get(item.registration_id);
    if (existing) {
      existing.slotNo = item.slot_no;
      existing.lane = item.lane ?? null;
      existing.gridPosition = item.grid_position ?? null;
      existing.seedNo = item.seed_no ?? null;
      await participantRepo.save(existing);
    } else {
      await participantRepo.save(
        participantRepo.create({
          matchId: match.id,
          registrationId: registration.id,
          slotNo: item.slot_no,
          lane: item.lane ?? null,
          gridPosition: item.grid_position ?? null,
          seedNo: item.seed_no ?? null,
          status: ContestParticipantStatus.READY,
          metadata: {},
        }),
      );
    }
  }

  await writeContestAudit({
    contestId: match.contestId,
    matchId: match.id,
    actorId: viewer.userId,
    actorRole: viewer.role,
    eventType: 'match.participants_updated',
    afterJson: { participants: body.participants },
  });

  return mapMatchesPayload(match.contestId, viewer);
}

export async function submitMatchResults(matchId: string, viewer: Viewer, body: SubmitResultsBody) {
  const { match, participants } = await loadMatchBundle(matchId);
  await assertViewerCanOperateMatch(match, viewer);
  const contest = await getContestOrThrow(match.contestId);
  const engine = getEngine(contest);
  if (participants.length === 0) {
    throw new AppError('Match chưa có participant', 400, 'MATCH_HAS_NO_PARTICIPANTS');
  }

  const participantRepo = AppDataSource.getRepository(ContestMatchParticipant);
  const participantMap = new Map(participants.map((item) => [item.registrationId, item]));
  if (body.results.some((item) => !participantMap.has(item.registration_id))) {
    throw new AppError('Có result không thuộc participant của match', 400, 'MATCH_RESULT_INVALID');
  }

  const before = {
    status: match.status,
    result_summary: match.resultSummary,
  };

  for (const item of body.results) {
    const participant = participantMap.get(item.registration_id)!;
    participant.finishPosition = item.finish_position ?? null;
    participant.score = item.score ?? null;
    participant.bestLapSeconds = item.best_lap_seconds ?? null;
    participant.totalTimeSeconds = item.total_time_seconds ?? null;
    participant.bestLapMsLegacy =
      item.best_lap_seconds !== undefined && item.best_lap_seconds !== null
        ? Math.round(item.best_lap_seconds * 1000)
        : null;
    participant.totalTimeMsLegacy =
      item.total_time_seconds !== undefined && item.total_time_seconds !== null
        ? Math.round(item.total_time_seconds * 1000)
        : null;
    participant.isWinner = item.is_winner ?? false;
    participant.resultNote = item.result_note ?? null;
    participant.status = item.status ?? ContestParticipantStatus.FINISHED;
    await participantRepo.save(participant);
  }

  const refreshedParticipants = await participantRepo.find({
    where: { matchId },
    order: { slotNo: 'ASC' },
  });
  const declaredWinners =
    typeof match.advancementRule?.winners_to_advance === 'number'
      ? Number(match.advancementRule.winners_to_advance)
      : match.nextMatchId
        ? 1
        : 0;

  // `Math.max(1, x || 1)` cũ nuốt mất số 0 do `||`, nên mọi lượt chạy tính giờ
  // một mình đều bị gắn "người thắng" — vô nghĩa với đua tính giờ và cộng một
  // trận thắng ảo cho tất cả mọi người ở thể thức vòng loại + chung kết.
  //
  // Nhưng không thể tôn trọng số 0 một cách mù quáng: trận tranh hạng 3 cũng
  // khai 0 vì nó không đẩy ai đi tiếp, mà vẫn phải chốt ai hạng 3, ai hạng 4.
  // Ranh giới đúng là loại trận, không phải con số.
  const winnersNeeded =
    match.matchType === ContestMatchType.TIME_ATTACK
      ? Math.max(0, declaredWinners)
      : Math.max(1, declaredWinners || 1);
  const inferredWinners = engine.inferWinners(refreshedParticipants, winnersNeeded);
  const winnerIds = new Set(inferredWinners.map((item) => item.id));

  // Trận đấu loại phải có người thắng thì mới đóng được. Không xác định được ai
  // thắng mà vẫn đánh dấu hoàn tất thì vòng sau không bao giờ có người, sơ đồ
  // đứng và không công bố được bảng xếp hạng — đúng lúc chẳng ai còn nhớ trận
  // nào bị bỏ sót.
  if (match.nextMatchId && inferredWinners.length === 0) {
    throw new AppError(
      'Chưa xác định được người thắng: hãy chọn người thắng, hoặc ghi nhận đối thủ vắng mặt (DNS/DNF/DQ)',
      400,
      'MATCH_WINNER_REQUIRED',
    );
  }

  for (const participant of refreshedParticipants) {
    participant.isWinner = winnerIds.has(participant.id);
    if (!body.results.some((item) => item.registration_id === participant.registrationId)) {
      participant.status = participant.status ?? ContestParticipantStatus.READY;
    }
    await participantRepo.save(participant);
  }

  match.status = ContestMatchStatus.COMPLETED;
  match.startedAt = match.startedAt ?? new Date();
  match.endedAt = new Date();
  match.decidedAt = new Date();
  match.decidedBy = viewer.userId;
  match.resultSummary = engine.buildResultSummary(contest, match, refreshedParticipants);
  await AppDataSource.getRepository(ContestMatch).save(match);

  if (contest.status !== ContestStatus.RUNNING) {
    contest.status = ContestStatus.RUNNING;
    await AppDataSource.getRepository(Contest).save(contest);
  }

  await writeContestAudit({
    contestId: match.contestId,
    matchId: match.id,
    actorId: viewer.userId,
    actorRole: viewer.role,
    eventType: 'match.results_submitted',
    beforeJson: before,
    afterJson: { status: match.status, result_summary: match.resultSummary },
    reason: body.reason,
  });

  // Người thắng đi tiếp ngay khi có kết quả. Trước đây phải bấm thêm nút
  // "advance" cho từng trận — quên một trận là vòng sau rỗng, sơ đồ đứng và
  // không bao giờ công bố được bảng xếp hạng.
  const advanced = await syncWinnersToNextMatch(match, refreshedParticipants, contest);
  if (advanced) {
    await writeContestAudit({
      contestId: match.contestId,
      matchId: match.id,
      actorId: viewer.userId,
      actorRole: viewer.role,
      eventType: 'match.advanced',
      afterJson: { next_match_id: advanced.nextMatchId, winners: advanced.winnerIds },
      metadata: { auto_advanced: true },
    });
  }

  // Trận vừa xong có thể là bán kết cuối cùng còn thiếu.
  await populateThirdPlaceMatch(match.contestId);

  return mapMatchesPayload(match.contestId, viewer);
}

/**
 * Gỡ tắc cho trận vòng sau khi một nhánh cấp người của nó không sinh ra ai.
 *
 * Cả hai bên cùng vắng thì trận đó không có người thắng, và trận kế tiếp sẽ mãi
 * chỉ có một người ngồi chờ đối thủ không bao giờ tới. Ở đây soi lại: khi mọi
 * nhánh cấp người đã ngã ngũ mà trận sau chỉ còn một người thì người đó đi tiếp
 * luôn, không còn ai thì trận đó thành ô trống. Lan truyền tiếp lên các vòng
 * sau, đúng cách engine xử lý ô trống lúc bốc thăm.
 */
async function resolveStalledNextMatch(nextMatchId: string, contestId: string): Promise<void> {
  const matchRepo = AppDataSource.getRepository(ContestMatch);
  const participantRepo = AppDataSource.getRepository(ContestMatchParticipant);

  let currentId: string | null = nextMatchId;
  while (currentId) {
    const current: ContestMatch | null = await matchRepo.findOne({ where: { id: currentId } });
    if (!current) return;
    if (
      current.status === ContestMatchStatus.COMPLETED ||
      current.status === ContestMatchStatus.RUNNING
    ) {
      return;
    }

    const feeders = await matchRepo.find({ where: { contestId, nextMatchId: current.id } });
    if (feeders.some((feeder) => feeder.status !== ContestMatchStatus.COMPLETED)) return;

    const currentParticipants = await participantRepo.find({ where: { matchId: current.id } });
    if (currentParticipants.length >= 2) return;

    if (currentParticipants.length === 1) {
      const [winner] = currentParticipants;
      winner.isWinner = true;
      winner.status = ContestParticipantStatus.FINISHED;
      await participantRepo.save(winner);
      current.metadata = {
        ...current.metadata,
        bye: true,
        bye_winner_registration_id: winner.registrationId,
      };
    } else {
      current.metadata = { ...current.metadata, empty_slot: true };
    }

    current.status = ContestMatchStatus.COMPLETED;
    current.endedAt = new Date();
    current.decidedAt = new Date();
    await matchRepo.save(current);

    await writeContestAudit({
      contestId,
      matchId: current.id,
      actorId: null,
      actorRole: 'SYSTEM',
      eventType: 'match.auto_resolved',
      afterJson: {
        status: current.status,
        participant_count: currentParticipants.length,
      },
      reason: 'Nhánh cấp người không sinh ra đối thủ',
    });

    if (currentParticipants.length === 1 && current.nextMatchId) {
      const contest = await getContestOrThrow(contestId);
      await syncWinnersToNextMatch(current, currentParticipants, contest);
    }
    currentId = current.nextMatchId;
  }
}

/**
 * Xử thua vắng mặt: đánh dấu người không tới (DNS), bỏ giữa chừng (DNF) hoặc bị
 * loại vì vi phạm (DQ), rồi trao trận cho người còn lại.
 *
 * Không tự động chạy theo giờ — nhân viên phải bấm xác nhận kèm lý do, vì đây
 * là quyết định loại người ta khỏi giải.
 */
export async function recordMatchWalkover(
  matchId: string,
  viewer: Viewer,
  body: {
    absent: Array<{ registration_id: string; status: 'DNS' | 'DNF' | 'DQ' }>;
    reason: string;
  },
) {
  const { match, participants } = await loadMatchBundle(matchId);
  await assertViewerCanOperateMatch(match, viewer);
  const contest = await getContestOrThrow(match.contestId);

  if (match.status === ContestMatchStatus.COMPLETED) {
    throw new AppError(
      'Trận đã hoàn tất; dùng sửa kết quả nếu cần thay đổi',
      400,
      'MATCH_ALREADY_COMPLETED',
    );
  }
  if (participants.length === 0) {
    throw new AppError('Match chưa có participant', 400, 'MATCH_HAS_NO_PARTICIPANTS');
  }

  const absentByRegistration = new Map(body.absent.map((item) => [item.registration_id, item]));
  const unknown = body.absent.find(
    (item) =>
      !participants.some((participant) => participant.registrationId === item.registration_id),
  );
  if (unknown) {
    throw new AppError('Có người không thuộc trận này', 400, 'MATCH_RESULT_INVALID');
  }

  const participantRepo = AppDataSource.getRepository(ContestMatchParticipant);
  const remaining = participants.filter(
    (participant) => !absentByRegistration.has(participant.registrationId),
  );
  if (remaining.length > 1) {
    throw new AppError(
      'Vẫn còn nhiều hơn một người có mặt; hãy nhập kết quả thi đấu thay vì xử thua',
      400,
      'MATCH_WALKOVER_NOT_APPLICABLE',
    );
  }

  const before = { status: match.status };

  for (const participant of participants) {
    const absent = absentByRegistration.get(participant.registrationId);
    if (absent) {
      participant.status = absent.status as ContestParticipantStatus;
      participant.isWinner = false;
      participant.finishPosition = null;
    } else {
      participant.status = ContestParticipantStatus.FINISHED;
      participant.isWinner = true;
      participant.finishPosition = 1;
    }
    await participantRepo.save(participant);
  }

  match.status = ContestMatchStatus.COMPLETED;
  match.startedAt = match.startedAt ?? new Date();
  match.endedAt = new Date();
  match.decidedAt = new Date();
  match.decidedBy = viewer.userId;
  match.metadata = {
    ...match.metadata,
    walkover: true,
    // Cả hai cùng vắng: không ai thắng, và trận này vĩnh viễn không có điểm số.
    ...(remaining.length === 0 ? { no_contest: true } : {}),
  };
  const refreshed = await participantRepo.find({ where: { matchId }, order: { slotNo: 'ASC' } });
  match.resultSummary = getEngine(contest).buildResultSummary(contest, match, refreshed);
  await AppDataSource.getRepository(ContestMatch).save(match);

  if (contest.status !== ContestStatus.RUNNING) {
    contest.status = ContestStatus.RUNNING;
    await AppDataSource.getRepository(Contest).save(contest);
  }

  await writeContestAudit({
    contestId: match.contestId,
    matchId: match.id,
    actorId: viewer.userId,
    actorRole: viewer.role,
    eventType: 'match.walkover',
    beforeJson: before,
    afterJson: {
      status: match.status,
      absent: body.absent,
      winner_registration_id: remaining[0]?.registrationId ?? null,
    },
    reason: body.reason,
  });

  if (remaining.length === 1) {
    await syncWinnersToNextMatch(match, refreshed, contest);
  } else if (match.nextMatchId) {
    await resolveStalledNextMatch(match.nextMatchId, match.contestId);
  }
  await populateThirdPlaceMatch(match.contestId);

  return mapMatchesPayload(match.contestId, viewer);
}

export async function correctMatchResults(
  matchId: string,
  viewer: Viewer,
  body: CorrectResultsBody,
) {
  const { match } = await loadMatchBundle(matchId);
  await assertViewerCanOperateMatch(match, viewer);

  if (viewer.role === UserRole.STAFF && body.force_cascade) {
    throw new AppError('Staff không được force cascade khi sửa kết quả', 403, 'FORBIDDEN');
  }

  if (match.status !== ContestMatchStatus.COMPLETED) {
    throw new AppError('Chỉ sửa được match đã hoàn tất', 400, 'MATCH_NOT_COMPLETED');
  }

  await protectDownstreamCorrection(match, Boolean(body.force_cascade));

  const participantRepo = AppDataSource.getRepository(ContestMatchParticipant);
  const previousParticipants = await participantRepo.find({
    where: { matchId },
    order: { slotNo: 'ASC' },
  });

  for (const participant of previousParticipants) {
    participant.finishPosition = null;
    participant.score = null;
    participant.bestLapSeconds = null;
    participant.totalTimeSeconds = null;
    participant.bestLapMsLegacy = null;
    participant.totalTimeMsLegacy = null;
    participant.isWinner = false;
    participant.resultNote = null;
    participant.status = ContestParticipantStatus.READY;
    await participantRepo.save(participant);
  }

  match.status = ContestMatchStatus.READY;
  match.endedAt = null;
  match.decidedAt = null;
  match.decidedBy = null;
  match.resultSummary = {};
  await AppDataSource.getRepository(ContestMatch).save(match);

  await writeContestAudit({
    contestId: match.contestId,
    matchId: match.id,
    actorId: viewer.userId,
    actorRole: viewer.role,
    eventType: 'match.results_corrected',
    beforeJson: { result_summary: match.resultSummary },
    reason: body.reason,
    metadata: { force_cascade: Boolean(body.force_cascade) },
  });

  return submitMatchResults(matchId, viewer, body);
}

/**
 * Đưa người thắng của một trận sang trận kế tiếp.
 *
 * Chạy được nhiều lần cho ra cùng một kết quả: nó gỡ những người mà trận này
 * từng đẩy sang nhưng nay không còn là người thắng, rồi mới thêm người thắng
 * hiện tại. Nhờ vậy sửa kết quả không để lại người cũ nằm lại vòng sau —
 * trước đây bấm đẩy lần nữa là trận sau có ba người.
 *
 * Chỉ đụng tới những dòng mang `source_match_id` của chính trận này, nên người
 * do nhánh bên kia đẩy vào vẫn nguyên vẹn.
 */
async function syncWinnersToNextMatch(
  match: ContestMatch,
  participants: ContestMatchParticipant[],
  contest: Contest,
): Promise<{ nextMatchId: string; winnerIds: string[] } | null> {
  if (!match.nextMatchId) return null;

  const matchRepo = AppDataSource.getRepository(ContestMatch);
  const participantRepo = AppDataSource.getRepository(ContestMatchParticipant);

  const nextMatch = await matchRepo.findOne({ where: { id: match.nextMatchId } });
  if (!nextMatch) {
    throw new AppError('Match kế tiếp không tồn tại', 404, 'NEXT_MATCH_NOT_FOUND');
  }
  // Trận sau đã đấu xong thì không được âm thầm đổi người của nó; muốn sửa phải
  // đi qua correctMatchResults để lớp bảo vệ hạ nguồn có tiếng nói.
  if (
    nextMatch.status === ContestMatchStatus.COMPLETED ||
    nextMatch.status === ContestMatchStatus.RUNNING
  ) {
    return null;
  }

  const winnersToAdvance =
    typeof match.advancementRule?.winners_to_advance === 'number'
      ? Number(match.advancementRule.winners_to_advance)
      : 1;
  const winners = getEngine(contest).inferWinners(participants, Math.max(1, winnersToAdvance));
  if (winners.length === 0) return null;
  const winnerIds = new Set(winners.map((item) => item.registrationId));

  const nextParticipants = await participantRepo.find({
    where: { matchId: nextMatch.id },
    order: { slotNo: 'ASC' },
  });

  const stale = nextParticipants.filter(
    (item) => item.metadata?.source_match_id === match.id && !winnerIds.has(item.registrationId),
  );
  if (stale.length > 0) await participantRepo.remove(stale);

  const remaining = nextParticipants.filter((item) => !stale.includes(item));
  const usedSlots = new Set(remaining.map((item) => item.slotNo));

  for (const winner of winners) {
    const alreadyThere = remaining.some(
      (item) =>
        item.metadata?.source_match_id === match.id &&
        item.registrationId === winner.registrationId,
    );
    if (alreadyThere) continue;

    let slotNo = 1;
    while (usedSlots.has(slotNo)) slotNo += 1;
    usedSlots.add(slotNo);

    await participantRepo.save(
      participantRepo.create({
        matchId: nextMatch.id,
        registrationId: winner.registrationId,
        slotNo,
        lane: `L${slotNo}`,
        seedNo: winner.seedNo,
        status: ContestParticipantStatus.READY,
        metadata: {
          source_match_id: match.id,
          source_match_no: match.matchNo,
          source_round_no: match.roundNo,
        },
      }),
    );
  }

  // Chỉ mở trận sau khi đã đủ đối thủ; còn thiếu một nhánh thì nó vẫn là bản
  // nháp, đúng như lúc engine sinh sơ đồ.
  const finalCount = await participantRepo.count({ where: { matchId: nextMatch.id } });
  const nextStatus = finalCount >= 2 ? ContestMatchStatus.READY : ContestMatchStatus.DRAFT;
  if (nextMatch.status !== nextStatus) {
    nextMatch.status = nextStatus;
    await matchRepo.save(nextMatch);
  }

  return { nextMatchId: nextMatch.id, winnerIds: winners.map((item) => item.registrationId) };
}

/**
 * Đẩy người thắng bằng tay.
 *
 * Từ khi nhập kết quả tự đẩy, endpoint này chỉ còn là đường chữa cháy khi dữ
 * liệu lệch; chạy lại không gây hại vì phép đồng bộ là bất biến.
 */
export async function advanceMatch(matchId: string, viewer: Viewer) {
  const { match, participants } = await loadMatchBundle(matchId);
  await assertViewerCanOperateMatch(match, viewer);

  if (!match.nextMatchId) {
    throw new AppError('Match này không có round kế tiếp để advance', 400, 'MATCH_NO_NEXT_ROUND');
  }
  if (match.status !== ContestMatchStatus.COMPLETED) {
    throw new AppError('Chỉ advance được match đã hoàn tất', 400, 'MATCH_NOT_COMPLETED');
  }

  const contest = await getContestOrThrow(match.contestId);
  const synced = await syncWinnersToNextMatch(match, participants, contest);
  if (!synced) {
    throw new AppError('Chưa xác định được winner để advance', 400, 'MATCH_WINNER_NOT_FOUND');
  }

  await writeContestAudit({
    contestId: match.contestId,
    matchId: match.id,
    actorId: viewer.userId,
    actorRole: viewer.role,
    eventType: 'match.advanced',
    afterJson: { next_match_id: synced.nextMatchId, winners: synced.winnerIds },
  });

  return mapMatchesPayload(match.contestId, viewer);
}

type LeaderboardEntry = {
  registration_id: string;
  user_id: string | null;
  display_name: string | null;
  driver_handle: string | null;
  driver_title_label: string | null;
  wins: number;
  best_lap_seconds: number | null;
  total_time_seconds: number | null;
  latest_finish_position: number | null;
  matches_completed: number;
  progressed_round: number;
  /** Vòng của trận cuối cùng người này thật sự thi đấu. */
  last_played_round: number;
  /** Thắng trận cuối cùng đó hay không. */
  won_last_match: boolean;
  /** Số trận thắng bằng thi đấu thật, không tính thắng do gặp ô trống. */
  real_wins: number;
  /** Hạng ấn định sẵn cho 4 vị trí đầu; null nghĩa là xếp theo vòng bị loại. */
  fixed_rank: number | null;
};

function normalizeContestTimeSeconds(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sortLeaderboardEntries(entries: LeaderboardEntry[], mode: LeaderboardMode) {
  return [...entries].sort((a, b) => {
    if (mode === 'KNOCKOUT_BRACKET') {
      // Bốn vị trí đầu do chung kết và trận tranh hạng 3 định đoạt.
      if (a.fixed_rank !== null || b.fixed_rank !== null) {
        if (a.fixed_rank === null) return 1;
        if (b.fixed_rank === null) return -1;
        if (a.fixed_rank !== b.fixed_rank) return a.fixed_rank - b.fixed_rank;
      }
      // Còn lại: ai đi sâu hơn xếp trên.
      if (a.last_played_round !== b.last_played_round) {
        return b.last_played_round - a.last_played_round;
      }
      if (a.won_last_match !== b.won_last_match) return a.won_last_match ? -1 : 1;
      // Cùng dừng một vòng thì ai thắng nhiều trận thật hơn xếp trên.
      return b.real_wins - a.real_wins;
    }
    if (mode === 'TOTAL_TIME') {
      return (
        (a.total_time_seconds ?? Number.MAX_SAFE_INTEGER) -
        (b.total_time_seconds ?? Number.MAX_SAFE_INTEGER)
      );
    }
    return (
      (a.best_lap_seconds ?? Number.MAX_SAFE_INTEGER) -
      (b.best_lap_seconds ?? Number.MAX_SAFE_INTEGER)
    );
  });
}

/**
 * Ấn định bốn vị trí đầu theo đúng kết quả trên sân.
 *
 * Chung kết cho ra hạng 1 và 2; trận tranh hạng 3 cho ra hạng 3 và 4. Không
 * suy ra được từ "vòng dừng lại" vì trận tranh hạng 3 nằm cùng vòng với chung
 * kết — người thắng nó mà xét theo vòng thì ngang hàng nhà vô địch.
 *
 * Giải không bật trận tranh hạng 3 thì hai người thua bán kết cùng đứng thứ ba,
 * không bịa ra thứ tự giữa họ.
 */
function assignKnockoutFixedRanks(
  completedMatches: ContestMatch[],
  participantsByMatch: Map<string, ContestMatchParticipant[]>,
  entryMap: Map<string, LeaderboardEntry>,
): void {
  const bracketMatches = completedMatches.filter((match) => match.metadata?.third_place !== true);
  if (bracketMatches.length === 0) return;

  const finalRoundNo = Math.max(...bracketMatches.map((match) => match.roundNo));
  const finalMatch = bracketMatches.find((match) => match.roundNo === finalRoundNo);
  const thirdPlaceMatch = completedMatches.find((match) => match.metadata?.third_place === true);

  const setRank = (registrationId: string | undefined, rank: number) => {
    if (!registrationId) return;
    const entry = entryMap.get(registrationId);
    if (entry) entry.fixed_rank = rank;
  };

  const rankPair = (match: ContestMatch | undefined, winnerRank: number) => {
    if (!match) return;
    const participants = participantsByMatch.get(match.id) ?? [];
    setRank(participants.find((item) => item.isWinner)?.registrationId, winnerRank);
    // Trận thắng do gặp ô trống không có người thua để xếp hạng kế tiếp.
    if (isDecidedAtDraw(match)) return;
    setRank(participants.find((item) => !item.isWinner)?.registrationId, winnerRank + 1);
  };

  rankPair(finalMatch, 1);
  rankPair(thirdPlaceMatch, 3);
}

async function buildLeaderboard(contestId: string, contest: Contest) {
  const matches = await loadContestMatches(contestId);
  const completedMatches = matches.filter((item) => item.status === ContestMatchStatus.COMPLETED);
  const participantsByMatch = await loadContestMatchParticipantsByMatch(
    completedMatches.map((item) => item.id),
  );
  const registrationIds = Array.from(
    new Set([...participantsByMatch.values()].flat().map((item) => item.registrationId)),
  );
  const registrationMap = await loadContestRegistrationsMap(registrationIds);
  const userMap = await loadUsersMap(
    Array.from(new Set(Array.from(registrationMap.values()).map((item) => item.userId))),
  );

  const entryMap = new Map<string, LeaderboardEntry>();
  for (const match of completedMatches) {
    for (const participant of participantsByMatch.get(match.id) ?? []) {
      const registration = registrationMap.get(participant.registrationId);
      const user = registration ? (userMap.get(registration.userId) ?? null) : null;
      const racing = getUserRacingProfile(user);
      const current = entryMap.get(participant.registrationId) ?? {
        registration_id: participant.registrationId,
        user_id: registration?.userId ?? null,
        display_name: user?.full_name ?? null,
        driver_handle: racing.driverHandle,
        driver_title_label: racing.titleLabel,
        wins: 0,
        best_lap_seconds: null,
        total_time_seconds: null,
        latest_finish_position: null,
        matches_completed: 0,
        progressed_round: 0,
        last_played_round: 0,
        won_last_match: false,
        real_wins: 0,
        fixed_rank: null,
      };
      current.matches_completed += 1;
      current.progressed_round = Math.max(current.progressed_round, match.roundNo);
      current.latest_finish_position = participant.finishPosition ?? current.latest_finish_position;
      if (participant.isWinner) current.wins += 1;

      // Trận gặp ô trống không phải một trận đấu: không tính là đã đi tới vòng
      // đó bằng thực lực, và cũng không tính là một trận thắng.
      if (!isDecidedAtDraw(match)) {
        if (match.roundNo >= current.last_played_round) {
          current.last_played_round = match.roundNo;
          current.won_last_match = participant.isWinner === true;
        }
        if (participant.isWinner) current.real_wins += 1;
      }
      const bestLapSeconds = normalizeContestTimeSeconds(participant.bestLapSeconds);
      const totalTimeSeconds = normalizeContestTimeSeconds(participant.totalTimeSeconds);
      if (bestLapSeconds !== null) {
        current.best_lap_seconds =
          current.best_lap_seconds === null
            ? bestLapSeconds
            : Math.min(current.best_lap_seconds, bestLapSeconds);
      }
      if (totalTimeSeconds !== null) {
        current.total_time_seconds =
          current.total_time_seconds === null
            ? totalTimeSeconds
            : Math.min(current.total_time_seconds, totalTimeSeconds);
      }
      entryMap.set(participant.registrationId, current);
    }
  }

  const mode = getLeaderboardMode(contest);
  if (mode === 'KNOCKOUT_BRACKET') {
    assignKnockoutFixedRanks(completedMatches, participantsByMatch, entryMap);
  }
  const sorted = sortLeaderboardEntries(Array.from(entryMap.values()), mode).map(
    (entry, index) => ({
      rank: index + 1,
      ...entry,
    }),
  );

  return { mode, entries: sorted, match_count: completedMatches.length };
}

export async function publishContestLeaderboard(contestId: string, viewer: Viewer) {
  const contest = await assertContestOperator(contestId, viewer);
  if (![ContestStatus.RUNNING, ContestStatus.CLOSED].includes(contest.status)) {
    throw new AppError(
      'Chỉ có thể publish leaderboard khi contest đang diễn ra hoặc đã đóng đăng ký',
      400,
      'CONTEST_NOT_PUBLISHABLE',
    );
  }

  const matches = await loadContestMatches(contestId);
  if (matches.length === 0) {
    throw new AppError('Contest chưa có match để publish leaderboard', 400, 'CONTEST_NO_MATCHES');
  }

  const unfinishedMatch = matches.find((match) =>
    [ContestMatchStatus.DRAFT, ContestMatchStatus.READY, ContestMatchStatus.RUNNING].includes(
      match.status,
    ),
  );
  if (unfinishedMatch) {
    throw new AppError(
      'Không thể publish leaderboard khi vẫn còn match chưa hoàn tất',
      409,
      'CONTEST_MATCHES_INCOMPLETE',
    );
  }

  const participantsByMatch = await loadContestMatchParticipantsByMatch(
    matches.map((item) => item.id),
  );
  // Chỉ đòi kết quả ở trận thật sự có người chạy. Trận gặp ô trống hoặc cả hai
  // ghế đều trống được đóng ngay lúc bốc thăm và vĩnh viễn không có điểm số —
  // bắt chúng phải có kết quả thì sơ đồ mở 8 suất mà chỉ 6 người đăng ký sẽ
  // không bao giờ công bố được bảng xếp hạng.
  const matchWithoutResults = matches
    .filter((match) => !isDecidedAtDraw(match))
    .find((match) => {
      const participants = participantsByMatch.get(match.id) ?? [];
      if (participants.length === 0) return true;
      // Với đấu loại 1v1, "ai thắng" CHÍNH LÀ kết quả — không có thời gian hay
      // điểm số nào để nhập. Chỉ đòi mấy trường số là chặn nhầm cả những trận
      // đã có người thắng rõ ràng, và giải không bao giờ công bố được.
      return participants.every(
        (participant) =>
          participant.finishPosition === null &&
          participant.bestLapSeconds === null &&
          participant.totalTimeSeconds === null &&
          participant.score === null &&
          participant.isWinner !== true &&
          !isEliminatedStatus(participant.status),
      );
    });
  if (matchWithoutResults) {
    throw new AppError(
      'Có match hoàn tất nhưng chưa có kết quả hợp lệ',
      400,
      'CONTEST_MATCH_WITHOUT_RESULTS',
    );
  }

  const leaderboard = await buildLeaderboard(contestId, contest);
  if (leaderboard.entries.length === 0) {
    throw new AppError(
      'Contest chưa có kết quả hoàn tất để publish leaderboard',
      400,
      'CONTEST_LEADERBOARD_EMPTY',
    );
  }

  contest.config = {
    ...(contest.config ?? {}),
    published_leaderboard: {
      ...leaderboard,
      published_at: new Date().toISOString(),
      published_by: viewer.userId,
    },
  };
  contest.status = ContestStatus.COMPLETED;
  await AppDataSource.getRepository(Contest).save(contest);

  await writeContestAudit({
    contestId,
    actorId: viewer.userId,
    actorRole: viewer.role,
    eventType: 'contest.leaderboard_published',
    afterJson: contest.config.published_leaderboard as Record<string, unknown>,
  });

  return contest.config.published_leaderboard;
}

export async function listContestAuditLogs(
  contestId: string,
  viewer: Viewer,
  options?: { page?: number; limit?: number },
) {
  await assertContestOperator(contestId, viewer);
  const page = Math.max(1, options?.page ?? 1);
  const limit = Math.max(1, Math.min(200, options?.limit ?? 20));
  const [rows, total] = await AppDataSource.getRepository(ContestAuditLog).findAndCount({
    where: { contestId },
    order: { createdAt: 'DESC' },
    skip: (page - 1) * limit,
    take: limit,
  });
  // Kèm tên trận để nhật ký đọc được "Tứ kết 1" thay vì một đoạn mã băm.
  const matchIds = Array.from(
    new Set(rows.map((row) => row.matchId).filter((id): id is string => Boolean(id))),
  );
  const matchNameById = new Map<string, string>();
  if (matchIds.length > 0) {
    const auditMatches = await AppDataSource.getRepository(ContestMatch).findBy({
      id: In(matchIds),
    });
    for (const match of auditMatches) {
      matchNameById.set(
        match.id,
        match.name?.trim() || `Vòng ${match.roundNo} · Trận ${match.matchNo}`,
      );
    }
  }

  const data = rows.map((row) => ({
    ...row,
    matchName: row.matchId ? (matchNameById.get(row.matchId) ?? null) : null,
  }));

  return { data, meta: { total, page, limit } };
}

export async function getContestMetrics(contestId: string, viewer: Viewer) {
  const contest = await assertContestOperator(contestId, viewer);
  const registrations = await AppDataSource.getRepository(ContestRegistration).find({
    where: { contestId },
  });
  const matches = await loadContestMatches(contestId);
  const raceRecordCount = await AppDataSource.getRepository(RaceRecord).count({
    where: {
      contestId,
      verificationStatus: RaceRecordVerificationStatus.VERIFIED,
    },
  });
  const leaderboard = (contest.config?.published_leaderboard ?? null) as Record<
    string,
    unknown
  > | null;
  const globalSync = (contest.config?.global_sync ?? null) as Record<string, unknown> | null;

  return {
    contest_id: contestId,
    capacity: contest.capacity,
    entry_fee_amount: Number(contest.entryFee ?? 0),
    registration_counts: {
      total: registrations.length,
      pending: registrations.filter((item) => item.status === ContestRegistrationStatus.PENDING)
        .length,
      confirmed: registrations.filter((item) => item.status === ContestRegistrationStatus.CONFIRMED)
        .length,
      checked_in: registrations.filter(
        (item) => item.status === ContestRegistrationStatus.CHECKED_IN,
      ).length,
      cancelled: registrations.filter((item) => item.status === ContestRegistrationStatus.CANCELLED)
        .length,
    },
    revenue: {
      expected_revenue:
        registrations.filter((item) => item.status !== ContestRegistrationStatus.CANCELLED).length *
        Number(contest.entryFee ?? 0),
      paid_revenue:
        registrations.filter((item) => item.paymentStatus === 'MARKED_PAID').length *
        Number(contest.entryFee ?? 0),
      waived_revenue:
        registrations.filter((item) => item.paymentStatus === 'WAIVED').length *
        Number(contest.entryFee ?? 0),
      pending_revenue:
        registrations.filter((item) =>
          ['PENDING_PAYMENT', 'PENDING_REVIEW'].includes(item.paymentStatus),
        ).length * Number(contest.entryFee ?? 0),
      payment_conversion_rate:
        registrations.length > 0
          ? Number(
              (
                registrations.filter((item) => item.paymentStatus === 'MARKED_PAID').length /
                registrations.length
              ).toFixed(4),
            )
          : 0,
    },
    match_counts: {
      total: matches.length,
      draft: matches.filter((item) => item.status === ContestMatchStatus.DRAFT).length,
      ready: matches.filter((item) => item.status === ContestMatchStatus.READY).length,
      running: matches.filter((item) => item.status === ContestMatchStatus.RUNNING).length,
      completed: matches.filter((item) => item.status === ContestMatchStatus.COMPLETED).length,
      cancelled: matches.filter((item) => item.status === ContestMatchStatus.CANCELLED).length,
    },
    leaderboard: {
      published: Boolean(leaderboard),
      published_at: leaderboard?.published_at ?? null,
      entry_count: Array.isArray(leaderboard?.entries) ? leaderboard.entries.length : 0,
      mode: leaderboard?.mode ?? getLeaderboardMode(contest),
    },
    global_sync: {
      synced: raceRecordCount > 0,
      synced_at: globalSync?.synced_at ?? null,
      synced_count: Number(globalSync?.synced_count ?? raceRecordCount),
      superseded_count: Number(globalSync?.superseded_count ?? 0),
    },
  };
}
