import { ContestMatch } from '../models/contest-match.entity';
import { ContestMatchParticipant } from '../models/contest-match-participant.entity';
import { ContestRegistration } from '../models/contest-registration.entity';
import { Contest } from '../models/contest.entity';
import { ContestMatchStatus, ContestMatchType, ContestParticipantStatus } from '../types';

export type SeedingMode = 'MANUAL' | 'CHECK_IN_ORDER';

export type GenerateMatchesInput = {
  contest: Contest;
  cafeId: string;
  trackConfigId?: string | null;
  registrations: ContestRegistration[];
  registrationOrder: string[];
  driversPerMatch?: number;
  seedingMode?: SeedingMode;
  createdBy?: string;
  /** Ép kích thước sơ đồ (luỹ thừa của 2). Bỏ trống thì suy ra từ capacity. */
  bracketSize?: number;
  /** Vòng đầu tiên của sơ đồ, dùng khi bracket nối tiếp sau một pha khác. */
  startRoundNo?: number;
};

export type GeneratedMatchParticipant = {
  registrationId: string;
  slotNo: number;
  lane?: string | null;
  gridPosition?: number | null;
  seedNo?: number | null;
  status: ContestParticipantStatus;
  /** Đúng với người thắng do đối thủ là ô trống — trận đó không cần thi đấu. */
  isWinner?: boolean;
  metadata?: Record<string, unknown>;
};

export type GeneratedMatch = {
  roundNo: number;
  matchNo: number;
  name: string;
  matchType: ContestMatchType;
  status: ContestMatchStatus;
  scheduledAt: Date;
  advancementRule: Record<string, unknown>;
  metadata: Record<string, unknown>;
  nextMatchIndex?: number; // index in the generated round array, not DB id
  participants: GeneratedMatchParticipant[];
  isBye?: boolean;
  byeWinnerRegistrationId?: string | null;
};

export interface ContestFormatEngine {
  readonly code: string;

  generateMatches(input: GenerateMatchesInput): GeneratedMatch[];

  buildResultSummary(
    contest: Contest,
    match: ContestMatch,
    participants: ContestMatchParticipant[],
  ): Record<string, unknown>;

  inferWinners(
    participants: ContestMatchParticipant[],
    winnersToAdvance: number,
  ): ContestMatchParticipant[];

  canPublishLeaderboard(matches: ContestMatch[]): boolean;
}

function normalizeTimeSeconds(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** DNS/DNF/DQ đều là "không hoàn thành lượt đấu" nên không bao giờ được đi tiếp. */
export function isEliminatedStatus(status: ContestParticipantStatus | undefined | null): boolean {
  return (
    status === ContestParticipantStatus.DNS ||
    status === ContestParticipantStatus.DNF ||
    status === ContestParticipantStatus.DQ
  );
}

/** Có bất kỳ dấu hiệu nào cho thấy kết quả đã thực sự được ghi nhận chưa. */
/**
 * VĐV này đã có dữ liệu để xếp trên hay dưới người khác chưa.
 *
 * Trạng thái "đã hoàn thành" KHÔNG tính: nó chỉ nói người đó chạy xong, không
 * nói chạy thế nào. Trước đây tính nó là có kết quả, mà `submitMatchResults`
 * lại mặc định gán FINISHED cho mọi người — nên bấm Lưu với form trống là cả
 * hai đều "có kết quả", hoà nhau ở mọi tiêu chí, rồi rơi xuống nhánh so slotNo
 * ở cuối: người làn 1 mặc nhiên thắng, không một lời cảnh báo.
 */
function hasRecordedResult(participant: ContestMatchParticipant): boolean {
  return (
    participant.isWinner === true ||
    participant.finishPosition !== null ||
    participant.bestLapSeconds !== null ||
    participant.totalTimeSeconds !== null ||
    participant.score !== null
  );
}

function inferMatchWinners(
  participants: ContestMatchParticipant[],
  winnersToAdvance: number,
): ContestMatchParticipant[] {
  if (winnersToAdvance <= 0) return [];

  const explicitWinners = participants.filter(
    (item) => item.isWinner && !isEliminatedStatus(item.status),
  );
  if (explicitWinners.length > 0) {
    return explicitWinners.slice(0, winnersToAdvance);
  }

  const contenders = participants.filter((item) => !isEliminatedStatus(item.status));
  if (contenders.length === 0) return [];

  // Xử thua vắng mặt: mọi đối thủ khác đều DNS/DNF/DQ nên người còn lại thắng
  // mà không cần nhập thời gian/điểm.
  if (contenders.length < participants.length && contenders.length <= winnersToAdvance) {
    return contenders;
  }

  // Chưa ai có kết quả thì KHÔNG được đoán người thắng. Trước đây nhánh sort bên
  // dưới rơi về so sánh slotNo, tức là người ở làn 1 mặc nhiên thắng — sai âm thầm.
  if (!contenders.some(hasRecordedResult)) return [];

  const ranked = [...contenders].sort((a, b) => {
    const aFinish = a.finishPosition ?? Number.MAX_SAFE_INTEGER;
    const bFinish = b.finishPosition ?? Number.MAX_SAFE_INTEGER;
    if (aFinish !== bFinish) return aFinish - bFinish;

    const aBestLap = a.bestLapSeconds ?? Number.MAX_SAFE_INTEGER;
    const bBestLap = b.bestLapSeconds ?? Number.MAX_SAFE_INTEGER;
    if (aBestLap !== bBestLap) return aBestLap - bBestLap;

    const aTotal = a.totalTimeSeconds ?? Number.MAX_SAFE_INTEGER;
    const bTotal = b.totalTimeSeconds ?? Number.MAX_SAFE_INTEGER;
    if (aTotal !== bTotal) return aTotal - bTotal;

    const aScore = a.score ?? Number.NEGATIVE_INFINITY;
    const bScore = b.score ?? Number.NEGATIVE_INFINITY;
    if (aScore !== bScore) return bScore - aScore;

    return a.slotNo - b.slotNo;
  });

  return ranked.slice(0, winnersToAdvance);
}

export const MIN_RUNS_PER_DRIVER = 1;
export const MAX_RUNS_PER_DRIVER = 5;
export const DEFAULT_RUNS_PER_DRIVER = 3;

/**
 * Số lượt chạy mỗi VĐV được cấp trong thể thức tính giờ.
 *
 * Đua tính giờ thật cho mỗi người vài lượt rồi lấy lap tốt nhất — chạy đúng một
 * lượt thì một cú trượt tay là hỏng cả giải, và trước đây muốn chạy lại phải bốc
 * thăm lại, mà bốc lại thì bị khoá ngay khi có một lượt hoàn tất.
 */
export function resolveRunsPerDriver(contest: Contest): number {
  const raw = Number(contest.config?.runs_per_driver);
  if (!Number.isFinite(raw)) return DEFAULT_RUNS_PER_DRIVER;
  return Math.min(MAX_RUNS_PER_DRIVER, Math.max(MIN_RUNS_PER_DRIVER, Math.floor(raw)));
}

/**
 * Sinh các lượt chạy tính giờ: mỗi VĐV `runs` lượt, mỗi lượt một match riêng.
 *
 * `roundNo` là số thứ tự lượt nên giao diện gom đúng "Lượt 1 / Lượt 2 / ..."
 * thay vì đổ tất cả vào một vòng. Bảng xếp hạng đã lấy `Math.min` lap qua mọi
 * match của cùng một người nên không cần thêm gì để chốt lap tốt nhất.
 */
function buildTimeAttackRuns(params: {
  contest: Contest;
  code: string;
  orderedRegistrations: ContestRegistration[];
  runs: number;
  extraMetadata?: Record<string, unknown>;
  namePrefix: string;
}): GeneratedMatch[] {
  const { contest, code, orderedRegistrations, runs, extraMetadata, namePrefix } = params;
  const matches: GeneratedMatch[] = [];
  let sequence = 0;

  for (let runNo = 1; runNo <= runs; runNo += 1) {
    for (const [index, registration] of orderedRegistrations.entries()) {
      matches.push({
        roundNo: runNo,
        matchNo: index + 1,
        name: runs > 1 ? `${namePrefix} ${runNo} · VĐV ${index + 1}` : `${namePrefix} ${index + 1}`,
        matchType: ContestMatchType.TIME_ATTACK,
        status: ContestMatchStatus.READY,
        scheduledAt: new Date(contest.startsAt.getTime() + sequence * 5 * 60 * 1000),
        advancementRule: { winners_to_advance: 0, format: code },
        metadata: {
          generated_from: 'contest-runtime.generate',
          format: code,
          run_no: runNo,
          runs_per_driver: runs,
          ...(extraMetadata ?? {}),
        },
        participants: [
          {
            registrationId: registration.id,
            slotNo: 1,
            seedNo: index + 1,
            status: ContestParticipantStatus.READY,
            metadata: {
              generated_seed_order: index + 1,
              run_no: runNo,
              ...(extraMetadata ?? {}),
            },
          },
        ],
      });
      sequence += 1;
    }
  }

  return matches;
}

export class TimeTrialEngine implements ContestFormatEngine {
  readonly code = 'TIME_TRIAL';

  generateMatches(input: GenerateMatchesInput): GeneratedMatch[] {
    const { contest, registrations, registrationOrder } = input;
    const orderedRegistrations = registrationOrder
      .map((id) => registrations.find((r) => r.id === id))
      .filter((r): r is ContestRegistration => Boolean(r));

    return buildTimeAttackRuns({
      contest,
      code: this.code,
      orderedRegistrations,
      runs: resolveRunsPerDriver(contest),
      namePrefix: 'Lượt',
    });
  }

  buildResultSummary(
    contest: Contest,
    _match: ContestMatch,
    participants: ContestMatchParticipant[],
  ): Record<string, unknown> {
    const mode = this.getLeaderboardMode(contest);
    const sorted = [...participants].sort((a, b) => {
      if (mode === 'TOTAL_TIME') {
        return (
          (a.totalTimeSeconds ?? Number.MAX_SAFE_INTEGER) -
          (b.totalTimeSeconds ?? Number.MAX_SAFE_INTEGER)
        );
      }
      return (
        (a.bestLapSeconds ?? Number.MAX_SAFE_INTEGER) -
        (b.bestLapSeconds ?? Number.MAX_SAFE_INTEGER)
      );
    });
    const winner = sorted[0] ?? null;
    return {
      leaderboard_mode: mode,
      winner_registration_id: winner?.registrationId ?? null,
      best_lap_seconds: normalizeTimeSeconds(winner?.bestLapSeconds),
      total_time_seconds: normalizeTimeSeconds(winner?.totalTimeSeconds),
    };
  }

  inferWinners(
    participants: ContestMatchParticipant[],
    winnersToAdvance: number,
  ): ContestMatchParticipant[] {
    return inferMatchWinners(participants, winnersToAdvance);
  }

  canPublishLeaderboard(matches: ContestMatch[]): boolean {
    return matches.every((match) => match.status === ContestMatchStatus.COMPLETED);
  }

  private getLeaderboardMode(contest: Contest): 'BEST_LAP' | 'TOTAL_TIME' | 'KNOCKOUT_WINS' {
    const mode = contest.config?.leaderboard_mode;
    if (mode === 'TOTAL_TIME') return 'TOTAL_TIME';
    if (mode === 'KNOCKOUT_WINS') return 'KNOCKOUT_WINS';
    return 'BEST_LAP';
  }
}

/**
 * Bốc thăm ngẫu nhiên nhưng tái lập được.
 *
 * Giải đấu bị khiếu nại thì phải dựng lại được đúng lá thăm đã bốc, nên không
 * dùng Math.random: seed được lưu cùng sơ đồ, cùng seed và cùng danh sách người
 * thì luôn ra cùng thứ tự.
 */
export function shuffleWithSeed<T>(items: T[], seed: number): T[] {
  // mulberry32 — nhỏ, không phụ thuộc thư viện, đủ ngẫu nhiên cho việc bốc thăm.
  let state = seed >>> 0;
  const nextRandom = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(nextRandom() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function isPowerOfTwo(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && (value & (value - 1)) === 0;
}

export function nextPowerOfTwo(value: number): number {
  if (value <= 1) return 1;
  return 2 ** Math.ceil(Math.log2(value));
}

/**
 * Kích thước sơ đồ đấu.
 *
 * Ưu tiên giữ đúng capacity provider đã công bố (8/16/32) để sơ đồ hiển thị đủ
 * số suất, phần thiếu là ô trống. Giải cũ có capacity không phải luỹ thừa của 2
 * thì co về mức luỹ thừa 2 nhỏ nhất đủ chứa số người thực tế.
 */
export function resolveBracketSize(contest: Contest, participantCount: number): number {
  const minimum = Math.max(2, participantCount);
  const capacity = Number(contest.capacity ?? 0);
  if (isPowerOfTwo(capacity) && capacity >= minimum) return capacity;
  return nextPowerOfTwo(minimum);
}

/**
 * Thứ tự hạt giống chuẩn của sơ đồ loại trực tiếp.
 *
 * Với sơ đồ 8 suất trả về [1,8,4,5,2,7,3,6]: từng cặp liền nhau là một trận
 * vòng 1, hạt giống mạnh gặp hạt giống yếu, và hai hạt giống đầu bảng nằm ở hai
 * nửa đối diện nên chỉ có thể gặp nhau ở chung kết.
 */
export function buildBracketSeedOrder(bracketSize: number): number[] {
  let order = [1, 2];
  while (order.length < bracketSize) {
    const sum = order.length * 2 + 1;
    const next: number[] = [];
    for (const seed of order) next.push(seed, sum - seed);
    order = next;
  }
  return order.slice(0, bracketSize);
}

function buildKnockoutMatchName(roundIndex: number, matchNo: number, totalRounds: number): string {
  const roundsFromFinal = totalRounds - 1 - roundIndex;
  if (roundsFromFinal === 0) return 'Chung kết';
  if (roundsFromFinal === 1) return `Bán kết ${matchNo}`;
  if (roundsFromFinal === 2) return `Tứ kết ${matchNo}`;
  return `Vòng ${roundIndex + 1} · Trận ${matchNo}`;
}

/**
 * Trận tranh hạng 3 do provider bật/tắt. Hai người thua bán kết được điền vào
 * khi cả hai trận bán kết hoàn tất — không đi theo `next_match_id` vì đường đó
 * chỉ dành cho người thắng.
 */
function buildThirdPlaceMatch(params: {
  contest: Contest;
  code: string;
  finalRoundNo: number;
  totalRounds: number;
  bracketSize: number;
  sequence: number;
}): GeneratedMatch | null {
  if (params.contest.config?.third_place_match !== true) return null;
  if (params.totalRounds < 2) return null;

  return {
    roundNo: params.finalRoundNo,
    matchNo: 2,
    name: 'Tranh hạng 3',
    matchType: ContestMatchType.HEAD_TO_HEAD,
    status: ContestMatchStatus.DRAFT,
    scheduledAt: new Date(params.contest.startsAt.getTime() + params.sequence * 10 * 60 * 1000),
    advancementRule: { winners_to_advance: 0, format: params.code },
    metadata: {
      generated_from: 'contest-runtime.generate',
      format: params.code,
      third_place: true,
      feeder_round_no: params.finalRoundNo - 1,
      bracket_size: params.bracketSize,
    },
    participants: [],
  };
}

export class KnockoutEngine implements ContestFormatEngine {
  readonly code = 'KNOCKOUT';

  /**
   * Sinh sơ đồ đấu loại trực tiếp 1v1.
   *
   * Kích thước sơ đồ luôn là luỹ thừa của 2 và các cặp đấu vòng 1 lấy theo thứ
   * tự hạt giống chuẩn, nên số ô trống được rải đều thay vì dồn vào cuối. Nhờ
   * đó từ vòng 2 trở đi không bao giờ còn trận chỉ có một người — lỗi cũ khiến
   * staff phải nhập kết quả giả và làm kẹt publish leaderboard vĩnh viễn.
   */
  generateMatches(input: GenerateMatchesInput): GeneratedMatch[] {
    const { contest, registrations, registrationOrder } = input;
    const orderedRegistrations = registrationOrder
      .map((id) => registrations.find((r) => r.id === id))
      .filter((r): r is ContestRegistration => Boolean(r));

    const bracketSize =
      input.bracketSize ?? resolveBracketSize(contest, orderedRegistrations.length);
    const totalRounds = Math.log2(bracketSize);
    const seedOrder = buildBracketSeedOrder(bracketSize);
    const startRoundNo = Math.max(1, input.startRoundNo ?? 1);

    // Ghế 1..bracketSize; ghế vượt quá số người đăng ký là ô trống.
    const registrationBySeat = new Map<number, ContestRegistration>();
    orderedRegistrations.forEach((registration, index) =>
      registrationBySeat.set(index + 1, registration),
    );

    const rounds: GeneratedMatch[][] = [];
    let sequence = 0;
    for (let roundIndex = 0; roundIndex < totalRounds; roundIndex += 1) {
      const roundNo = startRoundNo + roundIndex;
      const matchesInRound = bracketSize / 2 ** (roundIndex + 1);
      const round: GeneratedMatch[] = [];
      for (let matchNo = 1; matchNo <= matchesInRound; matchNo += 1) {
        const isFinalRound = roundIndex === totalRounds - 1;
        round.push({
          roundNo,
          matchNo,
          name: buildKnockoutMatchName(roundIndex, matchNo, totalRounds),
          matchType: isFinalRound ? ContestMatchType.FINAL : ContestMatchType.HEAD_TO_HEAD,
          status: ContestMatchStatus.DRAFT,
          scheduledAt: new Date(contest.startsAt.getTime() + sequence * 10 * 60 * 1000),
          advancementRule: { winners_to_advance: 1, format: this.code },
          metadata: {
            generated_from: 'contest-runtime.generate',
            format: this.code,
            bracket_size: bracketSize,
          },
          participants: [],
        });
        sequence += 1;
      }
      rounds.push(round);
    }

    // Người thắng trận m đi tiếp vào trận ceil(m/2) của vòng sau.
    for (let roundIndex = 0; roundIndex < rounds.length - 1; roundIndex += 1) {
      for (const match of rounds[roundIndex]) {
        match.nextMatchIndex = Math.floor((match.matchNo - 1) / 2);
      }
    }

    for (const [matchIndex, match] of rounds[0].entries()) {
      const seats = [seedOrder[matchIndex * 2], seedOrder[matchIndex * 2 + 1]];
      seats.forEach((seat, slotIndex) => {
        const registration = registrationBySeat.get(seat);
        if (!registration) return;
        match.participants.push({
          registrationId: registration.id,
          slotNo: slotIndex + 1,
          lane: `L${slotIndex + 1}`,
          seedNo: seat,
          status: ContestParticipantStatus.READY,
          metadata: { seat_no: seat, generated_seed_order: seat },
        });
      });
    }

    this.resolveEmptySeats(rounds);

    const matches = rounds.flat();
    const thirdPlaceMatch = buildThirdPlaceMatch({
      contest,
      code: this.code,
      finalRoundNo: startRoundNo + totalRounds - 1,
      totalRounds,
      bracketSize,
      sequence,
    });
    if (thirdPlaceMatch) matches.push(thirdPlaceMatch);

    return matches;
  }

  /**
   * Đẩy người thắng của những cặp gặp ô trống đi tiếp, lan truyền qua mọi vòng.
   *
   * Một trận chỉ được xử là "thắng do đối thủ trống" khi cả hai nguồn cấp người
   * của nó đều đã ngã ngũ. Nếu còn một nhánh chưa đấu thì đó là trận thật đang
   * chờ đối thủ, không phải ô trống.
   */
  private resolveEmptySeats(rounds: GeneratedMatch[][]): void {
    const pendingFeeders = new Map<GeneratedMatch, number>();

    for (const [roundIndex, round] of rounds.entries()) {
      const nextRound = rounds[roundIndex + 1];
      for (const match of round) {
        const known = match.participants.length;
        const pending = pendingFeeders.get(match) ?? 0;
        const nextMatch =
          nextRound && match.nextMatchIndex !== undefined
            ? nextRound[match.nextMatchIndex]
            : undefined;

        if (known + pending >= 2) {
          match.status = known === 2 ? ContestMatchStatus.READY : ContestMatchStatus.DRAFT;
          if (nextMatch) pendingFeeders.set(nextMatch, (pendingFeeders.get(nextMatch) ?? 0) + 1);
          continue;
        }

        if (known === 1) {
          const [winner] = match.participants;
          if (nextMatch) {
            const slotNo = nextMatch.participants.length + 1;
            nextMatch.participants.push({
              ...winner,
              slotNo,
              lane: `L${slotNo}`,
              status: ContestParticipantStatus.READY,
              isWinner: false,
              metadata: {
                ...(winner.metadata ?? {}),
                advanced_from_round_no: match.roundNo,
                advanced_from_match_no: match.matchNo,
                bye_advance: true,
              },
            });
          }

          winner.status = ContestParticipantStatus.FINISHED;
          winner.isWinner = true;
          match.status = ContestMatchStatus.COMPLETED;
          match.isBye = true;
          match.byeWinnerRegistrationId = winner.registrationId;
          match.metadata = {
            ...match.metadata,
            bye: true,
            bye_winner_registration_id: winner.registrationId,
          };
          continue;
        }

        // Không có người nào có thể tới được trận này.
        match.status = ContestMatchStatus.COMPLETED;
        match.metadata = { ...match.metadata, empty_slot: true };
      }
    }
  }

  buildResultSummary(
    _contest: Contest,
    _match: ContestMatch,
    participants: ContestMatchParticipant[],
  ): Record<string, unknown> {
    const winner = participants.find((item) => item.isWinner) ?? null;
    return {
      winner_registration_id: winner?.registrationId ?? null,
      participants_count: participants.length,
    };
  }

  inferWinners(
    participants: ContestMatchParticipant[],
    winnersToAdvance: number,
  ): ContestMatchParticipant[] {
    return inferMatchWinners(participants, winnersToAdvance);
  }

  canPublishLeaderboard(matches: ContestMatch[]): boolean {
    return matches.every((match) => match.status === ContestMatchStatus.COMPLETED);
  }
}

export type QualifyingFinalRankInput = {
  registrationId: string;
  bestLapSeconds: number | null;
  totalTimeSeconds?: number | null;
  seedNo?: number | null;
};

export class QualifyingFinalEngine implements ContestFormatEngine {
  readonly code = 'QUALIFYING_FINAL';

  /**
   * Pha 1 (VÒNG LOẠI): các lượt chạy tính giờ, giống hệt TIME_TRIAL nhưng gắn
   * thêm nhãn phase để pha chung kết nhận ra.
   */
  generateMatches(input: GenerateMatchesInput): GeneratedMatch[] {
    const { contest, registrations, registrationOrder } = input;
    const orderedRegistrations = registrationOrder
      .map((id) => registrations.find((r) => r.id === id))
      .filter((r): r is ContestRegistration => Boolean(r));

    return buildTimeAttackRuns({
      contest,
      code: this.code,
      orderedRegistrations,
      runs: resolveRunsPerDriver(contest),
      extraMetadata: { phase: 'QUALIFYING' },
      namePrefix: 'Vòng loại',
    });
  }

  resolveFinalistsCount(contest: Contest): number {
    const configValue = contest.config?.finalists;
    return typeof configValue === 'number' && Number.isFinite(configValue) && configValue >= 2
      ? Math.floor(configValue)
      : 4;
  }

  /**
   * Rank qualifying participants by best lap (fallback total time, then seed).
   */
  rankQualifyingResults(results: QualifyingFinalRankInput[]): QualifyingFinalRankInput[] {
    return [...results].sort((a, b) => {
      const aBest = a.bestLapSeconds ?? Number.MAX_SAFE_INTEGER;
      const bBest = b.bestLapSeconds ?? Number.MAX_SAFE_INTEGER;
      if (aBest !== bBest) return aBest - bBest;
      const aTotal = a.totalTimeSeconds ?? Number.MAX_SAFE_INTEGER;
      const bTotal = b.totalTimeSeconds ?? Number.MAX_SAFE_INTEGER;
      if (aTotal !== bTotal) return aTotal - bTotal;
      return (a.seedNo ?? Number.MAX_SAFE_INTEGER) - (b.seedNo ?? Number.MAX_SAFE_INTEGER);
    });
  }

  /**
   * Phase 2 (FINAL): knockout bracket over the ranked finalists, rounds
   * starting at startRoundNo (qualifying occupies round 1).
   *
   * `registrationOrder` là danh sách đã xếp hạng theo vòng loại, và bộ sinh
   * knockout đã dùng thứ tự hạt giống chuẩn nên hạng 1 gặp hạng N, hạng 2 gặp
   * hạng N-1, đồng thời hạng 1 và hạng 2 nằm ở hai nửa đối diện.
   */
  generateFinalBracket(input: GenerateMatchesInput & { startRoundNo?: number }): GeneratedMatch[] {
    const startRoundNo = Math.max(2, input.startRoundNo ?? 2);
    const qualifyingRankByRegistrationId = new Map(
      input.registrationOrder.map((id, index) => [id, index + 1]),
    );

    const knockout = new KnockoutEngine();
    const matches = knockout.generateMatches({
      ...input,
      startRoundNo,
      bracketSize: nextPowerOfTwo(Math.max(2, input.registrationOrder.length)),
    });

    for (const match of matches) {
      match.advancementRule = { ...match.advancementRule, format: this.code };
      match.metadata = { ...match.metadata, format: this.code, phase: 'FINAL' };
      for (const participant of match.participants) {
        const qualifyingRank = qualifyingRankByRegistrationId.get(participant.registrationId);
        participant.seedNo = qualifyingRank ?? participant.seedNo;
        participant.metadata = {
          ...participant.metadata,
          phase: 'FINAL',
          qualifying_rank: qualifyingRank ?? null,
        };
      }
      if (match.byeWinnerRegistrationId) {
        match.metadata = {
          ...match.metadata,
          bye_winner_qualifying_rank:
            qualifyingRankByRegistrationId.get(match.byeWinnerRegistrationId) ?? null,
        };
      }
    }
    return matches;
  }

  buildResultSummary(
    contest: Contest,
    match: ContestMatch,
    participants: ContestMatchParticipant[],
  ): Record<string, unknown> {
    if (match.matchType === ContestMatchType.TIME_ATTACK) {
      return new TimeTrialEngine().buildResultSummary(contest, match, participants);
    }
    return new KnockoutEngine().buildResultSummary(contest, match, participants);
  }

  inferWinners(
    participants: ContestMatchParticipant[],
    winnersToAdvance: number,
  ): ContestMatchParticipant[] {
    return inferMatchWinners(participants, winnersToAdvance);
  }

  canPublishLeaderboard(matches: ContestMatch[]): boolean {
    return matches.every((match) => match.status === ContestMatchStatus.COMPLETED);
  }
}

const engines = new Map<string, ContestFormatEngine>([
  [new TimeTrialEngine().code, new TimeTrialEngine()],
  [new KnockoutEngine().code, new KnockoutEngine()],
  [new QualifyingFinalEngine().code, new QualifyingFinalEngine()],
]);

export function getContestFormatEngine(contest: Contest): ContestFormatEngine {
  const rawCode = contest.config?.runtime_format ?? contest.config?.format;
  const code = rawCode === 'TIME_TRIAL' || rawCode === 'QUALIFYING_FINAL' ? rawCode : 'KNOCKOUT';
  return engines.get(code) ?? new KnockoutEngine();
}

export function registerContestFormatEngine(engine: ContestFormatEngine): void {
  engines.set(engine.code, engine);
}
