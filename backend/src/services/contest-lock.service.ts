import { In } from 'typeorm';
import { AppDataSource } from '../config/database';
import { Booking } from '../models/booking.entity';
import { CafeTrackConfig } from '../models/cafe-track-config.entity';
import { ContestCafe } from '../models/contest-cafe.entity';
import { Contest } from '../models/contest.entity';
import { AppError, BookingStatus, ContestResourceScope, ContestStatus } from '../types';
import type { ContestRuntimeFormat } from './contest/guards';
import {
  DEFAULT_RUNS_PER_DRIVER,
  MAX_RUNS_PER_DRIVER,
  MIN_RUNS_PER_DRIVER,
} from './contest-format.engine';

export type ContestResourceLock = {
  cafe_id: string;
  scope: ContestResourceScope;
  track_config_ids: string[];
};

type ContestLockConflict = {
  contest_id: string;
  contest_name: string;
  cafe_id: string;
  scope: ContestResourceScope;
};

type BookingConflict = {
  booking_id: string;
  cafe_id: string;
  track_config_id: string | null;
  track_type_id: string;
  slot_start: Date;
  slot_end: Date;
  status: BookingStatus;
};

const ACTIVE_CONTEST_STATUSES = [
  ContestStatus.DRAFT,
  ContestStatus.OPEN,
  ContestStatus.CLOSED,
  ContestStatus.RUNNING,
];

const ACTIVE_BOOKING_STATUSES = [BookingStatus.PENDING, BookingStatus.CONFIRMED];

function toResourceScope(value: unknown): ContestResourceScope {
  return value === ContestResourceScope.SELECTED_TRACKS
    ? ContestResourceScope.SELECTED_TRACKS
    : ContestResourceScope.FULL_BRANCH;
}

function parseResourceLocks(raw: unknown): ContestResourceLock[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const value = item as Record<string, unknown>;
      if (typeof value.cafe_id !== 'string') return null;
      return {
        cafe_id: value.cafe_id,
        scope: toResourceScope(value.scope),
        track_config_ids: Array.isArray(value.track_config_ids)
          ? value.track_config_ids.filter(
              (trackId): trackId is string => typeof trackId === 'string',
            )
          : [],
      };
    })
    .filter((item): item is ContestResourceLock => Boolean(item));
}

export function getContestResourceLocks(config: Record<string, unknown> | null | undefined) {
  return parseResourceLocks(config?.resource_locks);
}

/**
 * Suy ra lock thực tế từ cấu hình provider gửi lên.
 *
 * `contestTrackTypeId` là bắt buộc về mặt nghiệp vụ dù chữ ký cho phép bỏ trống:
 * sân đúng loại đường đua của giải LUÔN bị đưa vào danh sách khoá, kể cả khi
 * provider chọn `SELECTED_TRACKS` mà quên tick nó. Không làm vậy thì hai lớp kiểm
 * tra nói hai chuyện khác nhau — `contestLockBlocksTrack` vẫn chặn booking trùng
 * loại đường đua (xem fallback ở cuối hàm đó), trong khi `findContestBookingConflicts`
 * lúc tạo giải lại bỏ qua chính những sân ấy.
 */
export async function resolveContestResourceLocks(
  participatingCafeIds: string[],
  config: Record<string, unknown> | null | undefined,
  contestTrackTypeId?: string | null,
): Promise<ContestResourceLock[]> {
  const trackConfigs = participatingCafeIds.length
    ? await AppDataSource.getRepository(CafeTrackConfig).find({
        where: { cafeId: In(participatingCafeIds), isActive: true },
      })
    : [];

  const activeTrackConfigsByCafe = trackConfigs.reduce<Map<string, CafeTrackConfig[]>>(
    (map, item) => {
      const list = map.get(item.cafeId) ?? [];
      list.push(item);
      map.set(item.cafeId, list);
      return map;
    },
    new Map(),
  );

  const requestedLocks = new Map(
    getContestResourceLocks(config).map((lock) => [lock.cafe_id, lock]),
  );

  return participatingCafeIds.map((cafeId) => {
    const activeTrackConfigs = activeTrackConfigsByCafe.get(cafeId) ?? [];
    const requested = requestedLocks.get(cafeId);
    const activeTrackIds = activeTrackConfigs.map((item) => item.id);

    if (activeTrackConfigs.length <= 1) {
      return {
        cafe_id: cafeId,
        scope: ContestResourceScope.FULL_BRANCH,
        track_config_ids: activeTrackIds,
      };
    }

    if (requested?.scope === ContestResourceScope.SELECTED_TRACKS) {
      // Sân thi đấu của giải bắt buộc nằm trong danh sách khoá.
      const competitionTrackIds = contestTrackTypeId
        ? activeTrackConfigs
            .filter((item) => item.trackTypeId === contestTrackTypeId)
            .map((item) => item.id)
        : [];
      const selectedTrackIds = Array.from(
        new Set([
          ...competitionTrackIds,
          ...requested.track_config_ids.filter((trackId) => activeTrackIds.includes(trackId)),
        ]),
      );
      if (selectedTrackIds.length > 0) {
        return {
          cafe_id: cafeId,
          scope: ContestResourceScope.SELECTED_TRACKS,
          track_config_ids: selectedTrackIds,
        };
      }
    }

    return {
      cafe_id: cafeId,
      scope: ContestResourceScope.FULL_BRANCH,
      track_config_ids: activeTrackIds,
    };
  });
}

/** Số VĐV vào chung kết mặc định của QUALIFYING_FINAL, khớp `QualifyingFinalEngine`. */
const DEFAULT_FINALISTS = 4;
const MIN_FINALISTS = 2;
const MAX_FINALISTS = 16;

export function mergeContestConfig(
  baseConfig: Record<string, unknown> | null | undefined,
  runtimeFormat: ContestRuntimeFormat,
  resourceLocks: ContestResourceLock[],
) {
  const nextConfig = {
    ...(baseConfig ?? {}),
    format: runtimeFormat,
    runtime_format: runtimeFormat,
    resource_locks: resourceLocks,
  } as Record<string, unknown>;

  // Hai thể thức có pha chạy tính giờ đều cấp nhiều lượt cho mỗi VĐV.
  if (runtimeFormat === 'TIME_TRIAL' || runtimeFormat === 'QUALIFYING_FINAL') {
    const requestedRuns = Number(nextConfig.runs_per_driver);
    nextConfig.runs_per_driver = Number.isFinite(requestedRuns)
      ? Math.min(MAX_RUNS_PER_DRIVER, Math.max(MIN_RUNS_PER_DRIVER, Math.floor(requestedRuns)))
      : DEFAULT_RUNS_PER_DRIVER;
  } else {
    // Đấu loại không có lượt chạy tính giờ; để lại chỉ gây hiểu nhầm khi đọc config.
    delete nextConfig.runs_per_driver;
  }

  if (runtimeFormat === 'TIME_TRIAL') {
    if (nextConfig.leaderboard_mode === 'KNOCKOUT_WINS') {
      nextConfig.leaderboard_mode = 'BEST_LAP';
    }
    if (typeof nextConfig.drivers_per_match !== 'number') nextConfig.drivers_per_match = 1;
    return nextConfig;
  }

  // KNOCKOUT và QUALIFYING_FINAL cùng kết thúc bằng nhánh loại trực tiếp nên
  // xếp hạng theo số trận thắng và mặc định 2 tay đua mỗi trận.
  nextConfig.leaderboard_mode = 'KNOCKOUT_WINS';
  if (typeof nextConfig.drivers_per_match !== 'number') nextConfig.drivers_per_match = 2;

  if (runtimeFormat === 'QUALIFYING_FINAL') {
    const requested = Number(nextConfig.finalists);
    nextConfig.finalists = Number.isFinite(requested)
      ? Math.min(MAX_FINALISTS, Math.max(MIN_FINALISTS, Math.floor(requested)))
      : DEFAULT_FINALISTS;
  } else {
    // Format khác không dùng tới, giữ lại chỉ gây hiểu nhầm khi đọc config.
    delete nextConfig.finalists;
  }

  return nextConfig;
}

function contestLockBlocksTrack(
  lock: ContestResourceLock | undefined,
  trackConfigId?: string | null,
  trackTypeId?: string | null,
  contestTrackTypeId?: string | null,
) {
  if (!lock) return false;
  if (lock.scope === ContestResourceScope.FULL_BRANCH) return true;
  if (trackConfigId && lock.track_config_ids.includes(trackConfigId)) return true;
  return Boolean(trackTypeId && contestTrackTypeId && trackTypeId === contestTrackTypeId);
}

export async function findContestBookingConflicts(params: {
  startsAt: Date;
  endsAt: Date;
  trackTypeId: string;
  resourceLocks: ContestResourceLock[];
}) {
  const conflicts: BookingConflict[] = [];

  for (const lock of params.resourceLocks) {
    const qb = AppDataSource.getRepository(Booking)
      .createQueryBuilder('b')
      .select([
        'b.id AS booking_id',
        'b.cafe_id AS cafe_id',
        'b.track_config_id AS track_config_id',
        'b.track_type_id AS track_type_id',
        'b.slot_start AS slot_start',
        'b.slot_end AS slot_end',
        'b.status AS status',
      ])
      .where('b.cafe_id = :cafeId', { cafeId: lock.cafe_id })
      .andWhere('b.status IN (:...statuses)', { statuses: ACTIVE_BOOKING_STATUSES })
      .andWhere('b.slot_start < :endsAt', { endsAt: params.endsAt })
      .andWhere('b.slot_end > :startsAt', { startsAt: params.startsAt });

    if (lock.scope === ContestResourceScope.SELECTED_TRACKS) {
      qb.andWhere(
        '(b.track_config_id IN (:...trackConfigIds) OR (b.track_config_id IS NULL AND b.track_type_id = :trackTypeId))',
        {
          trackConfigIds: lock.track_config_ids,
          trackTypeId: params.trackTypeId,
        },
      );
    }

    const rows = await qb.getRawMany<BookingConflict>();
    conflicts.push(...rows);
  }

  return conflicts;
}

export async function assertNoContestBookingConflicts(params: {
  startsAt: Date;
  endsAt: Date;
  trackTypeId: string;
  resourceLocks: ContestResourceLock[];
}) {
  const conflicts = await findContestBookingConflicts(params);
  if (conflicts.length === 0) return;

  /*
    Mã đơn viết ĐÚNG dạng đang hiện ở màn danh sách đặt lịch: `#` và chữ hoa.

    Trước đây in chữ thường không có `#`, nên chủ sân đọc được `3feef8c8` rồi đi
    tìm trong danh sách toàn `#3FEEF8C8` — cùng một đơn mà nhìn không ra là một.
    Một thông báo lỗi chỉ hữu ích khi nó chỉ tới được thứ nó đang nói về.
  */
  const sample = conflicts
    .slice(0, 3)
    .map(
      (item) =>
        `#${item.booking_id.slice(0, 8).toUpperCase()} (${new Date(item.slot_start).toLocaleString('vi-VN')} – ${new Date(item.slot_end).toLocaleTimeString('vi-VN')})`,
    )
    .join(', ');

  const con = conflicts.length - Math.min(3, conflicts.length);

  throw new AppError(
    `Không tạo được giải: khung giờ này đã có ${conflicts.length} đơn đặt sân của khách` +
      (sample ? ` — ${sample}` : '') +
      (con > 0 ? ` và ${con} đơn khác` : '') +
      `. Đơn đã đặt được giữ nguyên; hãy chọn khung giờ khác hoặc liên hệ khách để đổi lịch.`,
    409,
    'CONTEST_BOOKING_CONFLICT',
  );
}

export async function findContestLockConflictForBooking(params: {
  cafeId: string;
  slotStart: Date;
  slotEnd: Date;
  trackConfigId?: string | null;
  trackTypeId?: string | null;
  contestId?: string | null;
}) {
  const contests = await AppDataSource.getRepository(Contest)
    .createQueryBuilder('contest')
    .innerJoin(ContestCafe, 'contestCafe', 'contestCafe.contest_id = contest.id')
    .where('contestCafe.cafe_id = :cafeId', { cafeId: params.cafeId })
    .andWhere('contest.status IN (:...statuses)', { statuses: ACTIVE_CONTEST_STATUSES })
    .andWhere('contest.starts_at < :slotEnd', { slotEnd: params.slotEnd })
    .andWhere('contest.ends_at > :slotStart', { slotStart: params.slotStart })
    .getMany();

  for (const contest of contests) {
    if (params.contestId && contest.id === params.contestId) continue;

    const locks = getContestResourceLocks(contest.config);
    const matchingLock = locks.find((item) => item.cafe_id === params.cafeId);
    if (
      contestLockBlocksTrack(
        matchingLock,
        params.trackConfigId,
        params.trackTypeId,
        contest.trackTypeId,
      )
    ) {
      return {
        contest_id: contest.id,
        contest_name: contest.name,
        cafe_id: params.cafeId,
        scope: matchingLock?.scope ?? ContestResourceScope.FULL_BRANCH,
      } satisfies ContestLockConflict;
    }
  }

  return null;
}

/** Một khoảng thời gian bị giải đấu giữ riêng tại một chi nhánh. */
export interface ContestBlockedWindow {
  contestId: string;
  contestName: string;
  startsAt: Date;
  endsAt: Date;
  /** `true` = khoá cả chi nhánh; `false` = chỉ khoá một số đường đua. */
  blocksWholeBranch: boolean;
  /** Đường đua bị khoá khi không phải khoá cả chi nhánh. */
  lockedTrackConfigIds: string[];
}

/**
 * Liệt kê các khoảng bị giải đấu giữ riêng trong một quãng thời gian.
 *
 * ── Vì sao cần hàm này ──────────────────────────────────────────────────────
 *
 * `assertBookingNotBlockedByContest` trả lời câu hỏi "khung giờ CỤ THỂ này có bị
 * khoá không" và ném lỗi — đúng cho lúc tạo đơn, nhưng vô dụng cho việc LIỆT KÊ
 * chỗ trống: gọi nó cho từng khung giờ trong ngày là 24 lượt truy vấn cho một
 * câu hỏi.
 *
 * Trước khi có hàm này, công cụ tra chỗ trống của chatbot chỉ đếm `bookings` và
 * hoàn toàn không biết tới giải đấu. Nó báo "còn slot", khách chốt đơn, rồi
 * `createBooking` ném `CONTEST_SLOT_LOCKED` ở bước cuối. Hứa xong nuốt lời là
 * kiểu hỏng tệ nhất — tệ hơn nhiều so với báo hết chỗ ngay từ đầu.
 */
export async function getContestBlockedWindows(params: {
  cafeId: string;
  rangeStart: Date;
  rangeEnd: Date;
}): Promise<ContestBlockedWindow[]> {
  const contests = await AppDataSource.getRepository(Contest)
    .createQueryBuilder('contest')
    .innerJoin(ContestCafe, 'contestCafe', 'contestCafe.contest_id = contest.id')
    .where('contestCafe.cafe_id = :cafeId', { cafeId: params.cafeId })
    .andWhere('contest.status IN (:...statuses)', { statuses: ACTIVE_CONTEST_STATUSES })
    .andWhere('contest.starts_at < :rangeEnd', { rangeEnd: params.rangeEnd })
    .andWhere('contest.ends_at > :rangeStart', { rangeStart: params.rangeStart })
    .getMany();

  const windows: ContestBlockedWindow[] = [];
  for (const contest of contests) {
    const lock = getContestResourceLocks(contest.config).find(
      (item) => item.cafe_id === params.cafeId,
    );
    // Giải có mặt tại chi nhánh nhưng không khai khoá tài nguyên nào thì không
    // chiếm chỗ của khách — cùng cách hiểu với `contestLockBlocksTrack`.
    if (!lock) continue;

    windows.push({
      contestId: contest.id,
      contestName: contest.name,
      startsAt: contest.startsAt,
      endsAt: contest.endsAt,
      blocksWholeBranch: lock.scope === ContestResourceScope.FULL_BRANCH,
      lockedTrackConfigIds: lock.track_config_ids,
    });
  }

  return windows;
}

export async function assertBookingNotBlockedByContest(params: {
  cafeId: string;
  slotStart: Date;
  slotEnd: Date;
  trackConfigId?: string | null;
  trackTypeId?: string | null;
  contestId?: string | null;
}) {
  const conflict = await findContestLockConflictForBooking(params);
  if (!conflict) return;

  throw new AppError(
    `Khung giờ này đã được giữ riêng cho giải đấu "${conflict.contest_name}"`,
    409,
    'CONTEST_SLOT_LOCKED',
  );
}
