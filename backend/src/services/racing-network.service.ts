import { In, Not } from 'typeorm';
import { AppDataSource } from '../config/database';
import { logger } from '../config/logger';
import { AchievementDefinition } from '../models/achievement-definition.entity';
import { ContestMatch } from '../models/contest-match.entity';
import { Contest } from '../models/contest.entity';
import { RaceRecord } from '../models/race-record.entity';
import { User } from '../models/user.entity';
import {
  AppError,
  BookingStatus,
  ContestMatchStatus,
  RaceRecordSourceType,
  RaceRecordVerificationStatus,
  UserRole,
  VehicleSource,
} from '../types';
import { assertContestOperator, writeContestAudit } from './contest.helpers';
import { Viewer } from './cafe.service';

type RacingProfile = {
  driver_handle: string;
  display_name: string;
  passport_code: string;
  home_cafe_id: string | null;
  public_profile_enabled: boolean;
  leaderboard_opt_in: boolean;
  current_title_code: string | null;
  current_title_label: string | null;
  unlocked_achievements: AchievementUnlockEntry[];
  stats_cache: RacingStats;
};

type AchievementUnlockEntry = {
  code: string;
  unlocked_at: string;
  source: Record<string, unknown>;
};

type RacingStats = {
  completed_sessions: number;
  completed_plays: number;
  distinct_cafes_played: number;
  verified_race_records: number;
  best_global_lap_ms: number | null;
};

type PassportResponse = {
  user_id: string;
  driver_handle: string;
  display_name: string;
  passport_code: string;
  current_title: { code: string | null; label: string | null };
  stats: RacingStats;
  achievements: Array<{
    code: string;
    name: string;
    description: string | null;
    badge_icon_url: string | null;
    title_label: string | null;
    unlocked_at: string;
    source: Record<string, unknown>;
  }>;
};

type GlobalLeaderboardQuery = {
  period: 'daily' | 'weekly' | 'monthly' | 'all_time';
  city?: string;
  cafe_id?: string;
  vehicle_source?: VehicleSource;
  limit: number;
};

type UpdateDriverPassportBody = {
  driver_handle?: string;
  display_name?: string;
  home_cafe_id?: string | null;
  public_profile_enabled?: boolean;
  leaderboard_opt_in?: boolean;
};

function slugifyHandle(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '.')
    .replace(/\.+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .toLowerCase();
}

function randomPassportCode() {
  return `DRV-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function defaultStats(): RacingStats {
  return {
    completed_sessions: 0,
    completed_plays: 0,
    distinct_cafes_played: 0,
    verified_race_records: 0,
    best_global_lap_ms: null,
  };
}

function normalizeRacingProfile(user: User): RacingProfile {
  const current = (user.racing_profile ?? {}) as Record<string, unknown>;
  const rawDisplayName =
    typeof current.display_name === 'string' && current.display_name.trim()
      ? current.display_name
      : user.full_name;
  const rawHandle =
    typeof current.driver_handle === 'string' && current.driver_handle.trim()
      ? current.driver_handle
      : slugifyHandle(
          user.full_name || user.email.split('@')[0] || `driver.${user.id.slice(0, 8)}`,
        );

  return {
    driver_handle: rawHandle,
    display_name: rawDisplayName,
    passport_code:
      typeof current.passport_code === 'string' && current.passport_code.trim()
        ? current.passport_code
        : randomPassportCode(),
    home_cafe_id: typeof current.home_cafe_id === 'string' ? current.home_cafe_id : null,
    public_profile_enabled: current.public_profile_enabled !== false,
    leaderboard_opt_in: current.leaderboard_opt_in !== false,
    current_title_code:
      typeof current.current_title_code === 'string' ? current.current_title_code : null,
    current_title_label:
      typeof current.current_title_label === 'string' ? current.current_title_label : null,
    unlocked_achievements: Array.isArray(current.unlocked_achievements)
      ? (current.unlocked_achievements as AchievementUnlockEntry[])
      : [],
    stats_cache:
      current.stats_cache && typeof current.stats_cache === 'object'
        ? ({ ...defaultStats(), ...(current.stats_cache as Partial<RacingStats>) } as RacingStats)
        : defaultStats(),
  };
}

async function ensureUniqueHandle(handle: string, excludeUserId?: string) {
  const rows = await AppDataSource.query<{ id: string }[]>(
    `SELECT id
     FROM users
     WHERE deleted_at IS NULL
       AND COALESCE(lower(racing_profile->>'driver_handle'), '') = lower($1)
       ${excludeUserId ? 'AND id <> $2' : ''}
     LIMIT 1`,
    excludeUserId ? [handle, excludeUserId] : [handle],
  );
  if (rows.length > 0) {
    throw new AppError('driver_handle đã được sử dụng', 409, 'DRIVER_HANDLE_TAKEN');
  }
}

async function generateUniqueHandle(base: string, excludeUserId?: string) {
  const seed = slugifyHandle(base) || 'driver';
  for (let index = 0; index < 100; index += 1) {
    const candidate = index === 0 ? seed : `${seed}.${index + 1}`;
    const rows = await AppDataSource.query<{ id: string }[]>(
      `SELECT id
       FROM users
       WHERE deleted_at IS NULL
         AND COALESCE(lower(racing_profile->>'driver_handle'), '') = lower($1)
         ${excludeUserId ? 'AND id <> $2' : ''}
       LIMIT 1`,
      excludeUserId ? [candidate, excludeUserId] : [candidate],
    );
    if (rows.length === 0) {
      return candidate;
    }
  }
  return `${seed}.${Date.now().toString().slice(-4)}`;
}

async function loadUserOrThrow(userId: string) {
  const user = await AppDataSource.getRepository(User).findOne({ where: { id: userId } });
  if (!user) throw new AppError('Người dùng không tồn tại', 404, 'USER_NOT_FOUND');
  return user;
}

async function ensureRacingProfile(user: User) {
  const profile = normalizeRacingProfile(user);
  const normalizedHandle =
    slugifyHandle(profile.driver_handle) || (await generateUniqueHandle(user.full_name, user.id));
  let changed = false;

  if (normalizedHandle !== profile.driver_handle) {
    profile.driver_handle = normalizedHandle;
    changed = true;
  }

  const otherRows = await AppDataSource.query<{ id: string }[]>(
    `SELECT id
     FROM users
     WHERE deleted_at IS NULL
       AND COALESCE(lower(racing_profile->>'driver_handle'), '') = lower($1)
       AND id <> $2
     LIMIT 1`,
    [profile.driver_handle, user.id],
  );
  if (otherRows.length > 0) {
    profile.driver_handle = await generateUniqueHandle(profile.driver_handle, user.id);
    changed = true;
  }

  if (JSON.stringify(user.racing_profile ?? {}) !== JSON.stringify(profile)) {
    user.racing_profile = profile;
    changed = true;
  }

  if (changed) {
    await AppDataSource.getRepository(User).save(user);
  }
  return profile;
}

async function computeCompletedPlayStats(userId: string): Promise<{
  completedSessions: number;
  completedPlays: number;
  distinctCafesPlayed: number;
}> {
  const [sessionStats] = await AppDataSource.query<
    { completed_sessions: string; distinct_cafes_played: string }[]
  >(
    `SELECT
       COUNT(*)::text AS completed_sessions,
       COUNT(DISTINCT b.cafe_id)::text AS distinct_cafes_played
     FROM sessions s
     JOIN bookings b ON b.id = s.booking_id
     WHERE b.customer_id = $1
       AND s.status = 'COMPLETED'`,
    [userId],
  );

  const completedSessions = Number(sessionStats?.completed_sessions ?? 0);
  if (completedSessions > 0) {
    return {
      completedSessions,
      completedPlays: completedSessions,
      distinctCafesPlayed: Number(sessionStats?.distinct_cafes_played ?? 0),
    };
  }

  const [bookingStats] = await AppDataSource.query<
    { completed_bookings: string; distinct_cafes_played: string }[]
  >(
    `SELECT
       COUNT(*)::text AS completed_bookings,
       COUNT(DISTINCT cafe_id)::text AS distinct_cafes_played
     FROM bookings
     WHERE customer_id = $1
       AND status = $2`,
    [userId, BookingStatus.COMPLETED],
  );

  return {
    completedSessions: 0,
    completedPlays: Number(bookingStats?.completed_bookings ?? 0),
    distinctCafesPlayed: Number(bookingStats?.distinct_cafes_played ?? 0),
  };
}

async function computeRacingStats(userId: string): Promise<RacingStats> {
  const completed = await computeCompletedPlayStats(userId);
  const [recordStats] = await AppDataSource.query<
    { verified_race_records: string; best_global_lap_ms: string | null }[]
  >(
    `SELECT
       COUNT(*)::text AS verified_race_records,
       MIN(best_lap_ms)::text AS best_global_lap_ms
     FROM race_records
     WHERE user_id = $1
       AND verification_status = $2`,
    [userId, RaceRecordVerificationStatus.VERIFIED],
  );

  return {
    completed_sessions: completed.completedSessions,
    completed_plays: completed.completedPlays,
    distinct_cafes_played: completed.distinctCafesPlayed,
    verified_race_records: Number(recordStats?.verified_race_records ?? 0),
    best_global_lap_ms: recordStats?.best_global_lap_ms
      ? Number(recordStats.best_global_lap_ms)
      : null,
  };
}

function matchesAchievementRule(definition: AchievementDefinition, stats: RacingStats) {
  const threshold = Number((definition.ruleConfig?.threshold as number | string | undefined) ?? 0);
  switch (definition.ruleCode) {
    case 'DISTINCT_CAFES_FROM_COMPLETED_PLAY':
      return {
        matched: stats.distinct_cafes_played >= threshold,
        source: {
          type: 'COMPLETED_PLAY_HISTORY',
          distinct_cafe_count: stats.distinct_cafes_played,
          threshold,
        },
      };
    case 'COMPLETED_PLAY_COUNT':
      return {
        matched: stats.completed_plays >= threshold,
        source: {
          type: 'COMPLETED_PLAY_HISTORY',
          completed_play_count: stats.completed_plays,
          threshold,
        },
      };
    case 'VERIFIED_RACE_RECORD_COUNT':
      return {
        matched: stats.verified_race_records >= threshold,
        source: {
          type: 'VERIFIED_RACE_RECORDS',
          verified_race_record_count: stats.verified_race_records,
          threshold,
        },
      };
    case 'BEST_LAP_UNDER_MS':
      return {
        matched:
          stats.best_global_lap_ms !== null &&
          threshold > 0 &&
          stats.best_global_lap_ms <= threshold,
        source: {
          type: 'VERIFIED_RACE_RECORDS',
          best_global_lap_ms: stats.best_global_lap_ms,
          threshold,
        },
      };
    default:
      return {
        matched: false,
        source: { type: 'UNSUPPORTED_RULE', rule_code: definition.ruleCode },
      };
  }
}

async function loadActiveAchievementDefinitions() {
  return AppDataSource.getRepository(AchievementDefinition).find({
    where: { isActive: true },
    order: { sortOrder: 'ASC', createdAt: 'ASC' },
  });
}

async function refreshRacingProfile(userId: string) {
  const user = await loadUserOrThrow(userId);
  let profile = await ensureRacingProfile(user);
  const stats = await computeRacingStats(userId);
  const definitions = await loadActiveAchievementDefinitions();
  const unlockMap = new Map(profile.unlocked_achievements.map((item) => [item.code, item]));
  let changed = false;

  for (const definition of definitions) {
    const result = matchesAchievementRule(definition, stats);
    if (!result.matched || unlockMap.has(definition.code)) continue;

    unlockMap.set(definition.code, {
      code: definition.code,
      unlocked_at: new Date().toISOString(),
      source: result.source,
    });
    changed = true;
  }

  const unlockedEntries = definitions
    .filter((definition) => unlockMap.has(definition.code))
    .map((definition) => unlockMap.get(definition.code)!)
    .sort((a, b) => a.unlocked_at.localeCompare(b.unlocked_at));

  const titleDefinition =
    [...definitions]
      .filter((definition) => definition.titleLabel && unlockMap.has(definition.code))
      .sort((a, b) => b.sortOrder - a.sortOrder)[0] ?? null;

  const nextProfile: RacingProfile = {
    ...profile,
    unlocked_achievements: unlockedEntries,
    current_title_code: titleDefinition?.code ?? null,
    current_title_label: titleDefinition?.titleLabel ?? null,
    stats_cache: stats,
  };

  if (JSON.stringify(profile) !== JSON.stringify(nextProfile) || changed) {
    user.racing_profile = nextProfile;
    await AppDataSource.getRepository(User).save(user);
    profile = nextProfile;
  }

  return { user, profile, definitions };
}

function mapPassportResponse(
  user: User,
  profile: RacingProfile,
  definitions: AchievementDefinition[],
): PassportResponse {
  const definitionMap = new Map(definitions.map((item) => [item.code, item]));
  return {
    user_id: user.id,
    driver_handle: profile.driver_handle,
    display_name: profile.display_name,
    passport_code: profile.passport_code,
    current_title: {
      code: profile.current_title_code,
      label: profile.current_title_label,
    },
    stats: profile.stats_cache,
    achievements: profile.unlocked_achievements
      .map((unlock) => {
        const definition = definitionMap.get(unlock.code);
        if (!definition) return null;
        return {
          code: unlock.code,
          name: definition.name,
          description: definition.description,
          badge_icon_url: definition.badgeIconUrl,
          title_label: definition.titleLabel,
          unlocked_at: unlock.unlocked_at,
          source: unlock.source,
        };
      })
      .filter(Boolean) as PassportResponse['achievements'],
  };
}

export async function getMyDriverPassport(viewer: Viewer) {
  if (viewer.role !== UserRole.CUSTOMER) {
    throw new AppError('Chỉ customer mới có Driver Passport', 403, 'FORBIDDEN');
  }
  const { user, profile, definitions } = await refreshRacingProfile(viewer.userId);
  return mapPassportResponse(user, profile, definitions);
}

export async function updateMyDriverPassport(viewer: Viewer, body: UpdateDriverPassportBody) {
  if (viewer.role !== UserRole.CUSTOMER) {
    throw new AppError('Chỉ customer mới có Driver Passport', 403, 'FORBIDDEN');
  }

  const user = await loadUserOrThrow(viewer.userId);
  const profile = await ensureRacingProfile(user);

  if (body.driver_handle !== undefined) {
    const normalized = slugifyHandle(body.driver_handle);
    if (!normalized) {
      throw new AppError('driver_handle không hợp lệ', 400, 'DRIVER_HANDLE_INVALID');
    }
    await ensureUniqueHandle(normalized, user.id);
    profile.driver_handle = normalized;
  }
  if (body.display_name !== undefined) profile.display_name = body.display_name.trim();
  if (body.home_cafe_id !== undefined) profile.home_cafe_id = body.home_cafe_id;
  if (body.public_profile_enabled !== undefined)
    profile.public_profile_enabled = body.public_profile_enabled;
  if (body.leaderboard_opt_in !== undefined) profile.leaderboard_opt_in = body.leaderboard_opt_in;

  user.racing_profile = profile;
  await AppDataSource.getRepository(User).save(user);

  const refreshed = await refreshRacingProfile(user.id);
  return mapPassportResponse(refreshed.user, refreshed.profile, refreshed.definitions);
}

export async function getPublicDriverProfile(handle: string) {
  const [userRow] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id
     FROM users
     WHERE deleted_at IS NULL
       AND role = 'CUSTOMER'
       AND COALESCE(lower(racing_profile->>'driver_handle'), '') = lower($1)
     LIMIT 1`,
    [handle],
  );
  if (!userRow) throw new AppError('Driver không tồn tại', 404, 'DRIVER_NOT_FOUND');

  const { user, profile, definitions } = await refreshRacingProfile(userRow.id);
  if (!profile.public_profile_enabled) {
    throw new AppError('Driver đã ẩn hồ sơ công khai', 404, 'DRIVER_NOT_PUBLIC');
  }

  return mapPassportResponse(user, profile, definitions);
}

export async function listAchievements() {
  const definitions = await loadActiveAchievementDefinitions();
  return definitions.map((definition) => ({
    code: definition.code,
    name: definition.name,
    description: definition.description,
    badge_icon_url: definition.badgeIconUrl,
    title_label: definition.titleLabel,
    rule_code: definition.ruleCode,
    rule_config: definition.ruleConfig,
    sort_order: definition.sortOrder,
  }));
}

function getPeriodStart(period: GlobalLeaderboardQuery['period']) {
  const now = new Date();
  switch (period) {
    case 'daily':
      return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    case 'weekly':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case 'monthly':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    default:
      return null;
  }
}

export async function listGlobalLeaderboard(query: GlobalLeaderboardQuery) {
  const whereClauses = [
    `r.verification_status = $1`,
    `COALESCE((u.racing_profile->>'leaderboard_opt_in')::boolean, true) = true`,
  ];
  const params: Array<string | number | Date> = [RaceRecordVerificationStatus.VERIFIED];

  const periodStart = getPeriodStart(query.period);
  if (periodStart) {
    params.push(periodStart);
    whereClauses.push(`r.recorded_at >= $${params.length}`);
  }
  if (query.city) {
    params.push(query.city);
    whereClauses.push(`c.city ILIKE $${params.length}`);
    params[params.length - 1] = `%${query.city}%`;
  }
  if (query.cafe_id) {
    params.push(query.cafe_id);
    whereClauses.push(`r.cafe_id = $${params.length}`);
  }
  if (query.vehicle_source) {
    params.push(query.vehicle_source);
    whereClauses.push(`r.vehicle_source = $${params.length}`);
  }
  params.push(query.limit);

  const rows = await AppDataSource.query<
    {
      id: string;
      user_id: string;
      vehicle_source: string;
      best_lap_ms: number | null;
      total_time_ms: number | null;
      score: string | null;
      finish_position: number | null;
      recorded_at: string;
      cafe_name: string;
      city: string;
      contest_name: string | null;
      display_name: string | null;
      driver_handle: string | null;
      current_title_code: string | null;
      current_title_label: string | null;
    }[]
  >(
    `SELECT
       r.id,
       r.user_id,
       r.vehicle_source,
       r.best_lap_ms,
       r.total_time_ms,
       r.score::text,
       r.finish_position,
       r.recorded_at,
       c.name AS cafe_name,
       c.city,
       contest.name AS contest_name,
       u.racing_profile->>'display_name' AS display_name,
       u.racing_profile->>'driver_handle' AS driver_handle,
       u.racing_profile->>'current_title_code' AS current_title_code,
       u.racing_profile->>'current_title_label' AS current_title_label
     FROM race_records r
     JOIN users u ON u.id = r.user_id
     JOIN cafes c ON c.id = r.cafe_id
     LEFT JOIN contests contest ON contest.id = r.contest_id
     WHERE ${whereClauses.join(' AND ')}
     ORDER BY
       CASE WHEN r.best_lap_ms IS NULL THEN 1 ELSE 0 END ASC,
       r.best_lap_ms ASC NULLS LAST,
       r.total_time_ms ASC NULLS LAST,
       r.score DESC NULLS LAST,
       r.recorded_at ASC
     LIMIT $${params.length}`,
    params,
  );

  return rows.map((row, index) => ({
    rank: index + 1,
    id: row.id,
    user_id: row.user_id,
    display_name: row.display_name || row.driver_handle || `Driver ${row.user_id.slice(0, 8)}`,
    driver_handle: row.driver_handle,
    current_title: {
      code: row.current_title_code,
      label: row.current_title_label,
    },
    cafe: {
      name: row.cafe_name,
      city: row.city,
    },
    vehicle_source: row.vehicle_source,
    best_lap_ms: row.best_lap_ms,
    total_time_ms: row.total_time_ms,
    score: row.score ? Number(row.score) : null,
    finish_position: row.finish_position,
    contest_name: row.contest_name,
    recorded_at: row.recorded_at,
  }));
}

function sameRaceRecordPayload(existing: RaceRecord | null, nextPayload: Partial<RaceRecord>) {
  if (!existing) return false;
  return (
    existing.bestLapMs === (nextPayload.bestLapMs ?? null) &&
    existing.totalTimeMs === (nextPayload.totalTimeMs ?? null) &&
    Number(existing.score ?? 0) === Number(nextPayload.score ?? 0) &&
    existing.finishPosition === (nextPayload.finishPosition ?? null) &&
    existing.verificationStatus === nextPayload.verificationStatus
  );
}

async function loadSyncSourceRows(contestId: string) {
  return AppDataSource.query<
    {
      participant_id: string;
      registration_id: string;
      user_id: string;
      provider_id: string;
      cafe_id: string;
      track_config_id: string | null;
      match_id: string;
      vehicle_source: VehicleSource;
      best_lap_seconds: number | null;
      total_time_seconds: number | null;
      score: string | null;
      finish_position: number | null;
      is_winner: boolean;
      match_ended_at: string | null;
      contest_name: string;
    }[]
  >(
    `SELECT
       p.id AS participant_id,
       p.registration_id,
       r.user_id,
       c.provider_id,
       m.cafe_id,
       m.track_config_id,
       m.id AS match_id,
       r.vehicle_source,
       COALESCE(p.best_lap_seconds, p.best_lap_ms::numeric / 1000.0) AS best_lap_seconds,
       COALESCE(p.total_time_seconds, p.total_time_ms::numeric / 1000.0) AS total_time_seconds,
       p.score::text,
       p.finish_position,
       p.is_winner,
       COALESCE(m.ended_at, m.decided_at, m.created_at)::text AS match_ended_at,
       c.name AS contest_name
     FROM contest_match_participants p
     JOIN contest_matches m ON m.id = p.match_id
     JOIN contest_registrations r ON r.id = p.registration_id
     JOIN contests c ON c.id = m.contest_id
     WHERE m.contest_id = $1
       AND m.status = $2`,
    [contestId, ContestMatchStatus.COMPLETED],
  );
}

export async function syncContestRaceRecords(contestId: string, viewer: Viewer) {
  const contest = await assertContestOperator(contestId, viewer);
  const publishedLeaderboard = contest.config?.published_leaderboard;
  if (!publishedLeaderboard) {
    throw new AppError(
      'Contest phải publish leaderboard local trước khi sync global',
      409,
      'CONTEST_LEADERBOARD_NOT_PUBLISHED',
    );
  }

  const unfinishedMatch = await AppDataSource.getRepository(ContestMatch).findOne({
    where: {
      contestId,
      status: In([ContestMatchStatus.DRAFT, ContestMatchStatus.READY, ContestMatchStatus.RUNNING]),
    },
  });
  if (unfinishedMatch) {
    throw new AppError(
      'Contest vẫn còn match chưa hoàn tất, chưa thể sync global',
      409,
      'CONTEST_MATCHES_INCOMPLETE',
    );
  }

  const sourceRows = await loadSyncSourceRows(contestId);
  if (sourceRows.length === 0) {
    throw new AppError('Contest chưa có kết quả hợp lệ để sync', 400, 'RACE_RECORD_SOURCE_EMPTY');
  }

  const raceRecordRepo = AppDataSource.getRepository(RaceRecord);
  let syncedCount = 0;
  let supersededCount = 0;
  const affectedUserIds = new Set<string>();

  for (const row of sourceRows) {
    if (
      row.best_lap_seconds === null &&
      row.total_time_seconds === null &&
      row.score === null &&
      row.finish_position === null
    ) {
      continue;
    }

    const nextPayload: Partial<RaceRecord> = {
      userId: row.user_id,
      providerId: row.provider_id,
      cafeId: row.cafe_id,
      trackConfigId: row.track_config_id,
      contestId,
      matchId: row.match_id,
      contestMatchParticipantId: row.participant_id,
      sessionId: null,
      vehicleSource: row.vehicle_source,
      sourceType: RaceRecordSourceType.CONTEST,
      verificationStatus: RaceRecordVerificationStatus.VERIFIED,
      bestLapMs:
        row.best_lap_seconds === null ? null : Math.round(Number(row.best_lap_seconds) * 1000),
      totalTimeMs:
        row.total_time_seconds === null ? null : Math.round(Number(row.total_time_seconds) * 1000),
      score: row.score ? Number(row.score) : null,
      finishPosition: row.finish_position,
      recordedAt: new Date(row.match_ended_at ?? new Date().toISOString()),
      verifiedAt: new Date(),
      verifiedBy: viewer.userId,
      metadata: {
        contest_name: row.contest_name,
        registration_id: row.registration_id,
        is_winner: row.is_winner,
      },
    };

    const existing = await raceRecordRepo.findOne({
      where: {
        contestMatchParticipantId: row.participant_id,
        verificationStatus: Not(RaceRecordVerificationStatus.SUPERSEDED),
      },
      order: { createdAt: 'DESC' },
    });

    if (sameRaceRecordPayload(existing, nextPayload)) {
      affectedUserIds.add(row.user_id);
      continue;
    }

    if (existing) {
      existing.verificationStatus = RaceRecordVerificationStatus.SUPERSEDED;
      existing.metadata = { ...(existing.metadata ?? {}), superseded_at: new Date().toISOString() };
      await raceRecordRepo.save(existing);
      supersededCount += 1;
    }

    await raceRecordRepo.save(raceRecordRepo.create(nextPayload));
    syncedCount += 1;
    affectedUserIds.add(row.user_id);
  }

  const refreshedProfiles = await Promise.all(
    Array.from(affectedUserIds).map(async (userId) => {
      const { profile } = await refreshRacingProfile(userId);
      return { userId, profile };
    }),
  );

  contest.config = {
    ...(contest.config ?? {}),
    global_sync: {
      synced_at: new Date().toISOString(),
      synced_by: viewer.userId,
      synced_count: syncedCount,
      superseded_count: supersededCount,
      affected_user_count: affectedUserIds.size,
    },
  };
  await AppDataSource.getRepository(Contest).save(contest);

  await writeContestAudit({
    contestId,
    actorId: viewer.userId,
    actorRole: viewer.role,
    eventType: 'race_records.synced',
    afterJson: contest.config.global_sync as Record<string, unknown>,
    metadata: {
      synced_count: syncedCount,
      superseded_count: supersededCount,
      affected_user_count: affectedUserIds.size,
    },
  });

  logger.info('RacingNetwork', 'Synced contest race records', {
    contestId,
    syncedCount,
    supersededCount,
    affectedUserIds: Array.from(affectedUserIds),
  });

  return {
    contest_id: contestId,
    synced_count: syncedCount,
    superseded_count: supersededCount,
    synced_at:
      (contest.config?.global_sync as { synced_at?: string } | undefined)?.synced_at ?? null,
    achievement_evaluation: {
      affected_users: refreshedProfiles.length,
      users: refreshedProfiles.map((item) => ({
        user_id: item.userId,
        current_title_code: item.profile.current_title_code,
        unlocked_achievement_count: item.profile.unlocked_achievements.length,
      })),
    },
  };
}
