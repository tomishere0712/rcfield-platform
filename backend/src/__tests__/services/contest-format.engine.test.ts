import { Contest } from '../../models/contest.entity';
import { ContestMatch } from '../../models/contest-match.entity';
import { ContestMatchParticipant } from '../../models/contest-match-participant.entity';
import { ContestRegistration } from '../../models/contest-registration.entity';
import {
  ContestEntryFeePaymentStatus,
  ContestMatchStatus,
  ContestMatchType,
  ContestParticipantStatus,
  ContestRegistrationStatus,
  ContestStatus,
  VehicleSource,
} from '../../types';
import {
  GeneratedMatch,
  KnockoutEngine,
  QualifyingFinalEngine,
  TimeTrialEngine,
  buildBracketSeedOrder,
  getContestFormatEngine,
} from '../../services/contest-format.engine';

function createMockContest(overrides?: Partial<Contest>): Contest {
  const now = new Date();
  return {
    id: 'contest-1',
    cafeId: 'cafe-1',
    providerId: 'provider-1',
    name: 'Test Contest',
    description: null,
    trackTypeId: 'track-1',
    contestTypeId: 'type-1',
    contestFormatId: 'format-1',
    contestTemplateId: 'template-1',
    registrationOpensAt: new Date(now.getTime() - 86400000),
    registrationClosesAt: new Date(now.getTime() + 86400000),
    startsAt: new Date(now.getTime() + 86400000),
    endsAt: new Date(now.getTime() + 2 * 86400000),
    capacity: 32,
    entryFee: 0,
    status: ContestStatus.OPEN,
    vehicleRule: { vehicle_policy: 'MIXED', assignment_policy: 'AT_CHECK_IN' },
    config: {},
    bannerImageUrl: null,
    createdBy: 'provider-1',
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as Contest;
}

function createMockRegistration(id: string, index: number): ContestRegistration {
  const now = new Date();
  return {
    id,
    contestId: 'contest-1',
    userId: `user-${index}`,
    participantRoleSnapshot: 'CUSTOMER',
    vehicleSource: VehicleSource.RENTAL,
    vehicleId: null,
    bookingId: null,
    status: ContestRegistrationStatus.CHECKED_IN,
    checkInCode: `CODE${index}`,
    checkedInCafeId: 'cafe-1',
    checkedInBy: 'staff-1',
    checkedInAt: new Date(now.getTime() + index * 1000),
    cancelledBy: null,
    cancelledAt: null,
    cancellationReason: null,
    paymentStatus: ContestEntryFeePaymentStatus.NOT_REQUIRED,
    entryFeeAmount: 0,
    entryFeeDueAt: null,
    entryFeeMarkedPaidBy: null,
    entryFeeMarkedPaidAt: null,
    metadata: {},
    createdAt: now,
    updatedAt: now,
  } as ContestRegistration;
}

describe('ContestFormatEngine', () => {
  describe('TimeTrialEngine', () => {
    it('should give every driver the configured number of runs', () => {
      const engine = new TimeTrialEngine();
      const contest = createMockContest({
        config: { format: 'TIME_TRIAL', runs_per_driver: 3 },
      });
      const registrations = [createMockRegistration('r1', 0), createMockRegistration('r2', 1)];
      const matches = engine.generateMatches({
        contest,
        cafeId: 'cafe-1',
        registrations,
        registrationOrder: ['r1', 'r2'],
      });

      expect(matches).toHaveLength(6);
      expect(matches[0].matchType).toBe(ContestMatchType.TIME_ATTACK);
      expect(matches[0].participants).toHaveLength(1);
      expect(matches[0].participants[0].registrationId).toBe('r1');

      // roundNo là số thứ tự lượt nên giao diện gom đúng "Lượt 1 / 2 / 3".
      expect(matches.map((match) => match.roundNo)).toEqual([1, 1, 2, 2, 3, 3]);
      // Mỗi VĐV đúng 3 lượt, không ai bị thiếu hay thừa.
      expect(matches.filter((match) => match.participants[0].registrationId === 'r1')).toHaveLength(
        3,
      );
    });

    it('should clamp runs per driver into the allowed range', () => {
      const engine = new TimeTrialEngine();
      const registrations = [createMockRegistration('r1', 0)];
      const generate = (runsPerDriver: unknown) =>
        engine.generateMatches({
          contest: createMockContest({
            config: { format: 'TIME_TRIAL', runs_per_driver: runsPerDriver },
          }),
          cafeId: 'cafe-1',
          registrations,
          registrationOrder: ['r1'],
        });

      expect(generate(1)).toHaveLength(1);
      expect(generate(99)).toHaveLength(5);
      expect(generate(0)).toHaveLength(1);
      // Không cấu hình thì dùng mặc định 3 lượt.
      expect(generate(undefined)).toHaveLength(3);
    });

    it('should infer winner by best lap', () => {
      const engine = new TimeTrialEngine();
      const contest = createMockContest({
        config: { format: 'TIME_TRIAL', leaderboard_mode: 'BEST_LAP' },
      });
      const mockParticipants = [
        { id: 'p1', registrationId: 'r1', bestLapSeconds: 12.5, isWinner: false },
        { id: 'p2', registrationId: 'r2', bestLapSeconds: 11.8, isWinner: false },
      ] as unknown as ContestMatchParticipant[];
      const winners = engine.inferWinners(mockParticipants, 1);
      expect(winners[0].registrationId).toBe('r2');
    });

    it('should build result summary with best lap mode', () => {
      const engine = new TimeTrialEngine();
      const contest = createMockContest({
        config: { format: 'TIME_TRIAL', leaderboard_mode: 'BEST_LAP' },
      });
      const match = { matchType: ContestMatchType.TIME_ATTACK } as unknown as ContestMatch;
      const participants = [
        { registrationId: 'r1', bestLapSeconds: 12.5, totalTimeSeconds: 45.2, isWinner: true },
      ] as unknown as ContestMatchParticipant[];
      const summary = engine.buildResultSummary(contest, match, participants);
      expect(summary.leaderboard_mode).toBe('BEST_LAP');
      expect(summary.winner_registration_id).toBe('r1');
      expect(summary.best_lap_seconds).toBe(12.5);
    });
  });

  describe('buildBracketSeedOrder', () => {
    it('should pair top seeds against bottom seeds', () => {
      expect(buildBracketSeedOrder(4)).toEqual([1, 4, 2, 3]);
      expect(buildBracketSeedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
    });

    it('should keep seed 1 and seed 2 in opposite halves', () => {
      const order = buildBracketSeedOrder(8);
      const firstHalf = order.slice(0, 4);
      expect(firstHalf).toContain(1);
      expect(firstHalf).not.toContain(2);
    });
  });

  describe('KnockoutEngine', () => {
    /**
     * Mỗi trận sẽ đấu phải được cấp đúng 2 tay đua: người đã có sẵn trong sơ đồ
     * cộng với người thắng của các nhánh còn chưa đấu. Thiếu một nguồn cấp nghĩa
     * là trận đó sẽ treo với một người và staff buộc phải nhập kết quả giả.
     */
    function countIncomingDrivers(matches: GeneratedMatch[]): Map<GeneratedMatch, number> {
      const byRound = new Map<number, GeneratedMatch[]>();
      for (const match of matches) {
        if (match.metadata.third_place === true) continue;
        byRound.set(match.roundNo, [...(byRound.get(match.roundNo) ?? []), match]);
      }

      const roundNumbers = [...byRound.keys()].sort((a, b) => a - b);
      const counts = new Map<GeneratedMatch, number>();
      for (const [roundIndex, roundNo] of roundNumbers.entries()) {
        const round = byRound.get(roundNo) ?? [];
        const previousRound =
          roundIndex > 0 ? (byRound.get(roundNumbers[roundIndex - 1]) ?? []) : [];
        for (const [matchIndex, match] of round.entries()) {
          const undecidedFeeders = previousRound.filter(
            (feeder) =>
              feeder.nextMatchIndex === matchIndex &&
              feeder.status !== ContestMatchStatus.COMPLETED,
          ).length;
          counts.set(match, match.participants.length + undecidedFeeders);
        }
      }
      return counts;
    }

    function generateKnockout(participantCount: number, capacity: number, config = {}) {
      const engine = new KnockoutEngine();
      const contest = createMockContest({ capacity, config: { format: 'KNOCKOUT', ...config } });
      const registrations = Array.from({ length: participantCount }, (_, i) =>
        createMockRegistration(`r${i + 1}`, i),
      );
      return engine.generateMatches({
        contest,
        cafeId: 'cafe-1',
        registrations,
        registrationOrder: registrations.map((r) => r.id),
      });
    }

    it('should generate bracket with correct round count when the bracket is full', () => {
      const matches = generateKnockout(8, 8);

      // 4 round 1 + 2 semifinal + 1 final = 7
      expect(matches).toHaveLength(7);
      const round1 = matches.filter((m) => m.roundNo === 1);
      expect(round1).toHaveLength(4);
      expect(round1.every((m) => m.status === ContestMatchStatus.READY)).toBe(true);
      const finals = matches.filter((m) => m.roundNo === 3);
      expect(finals).toHaveLength(1);
      expect(finals[0].matchType).toBe(ContestMatchType.FINAL);
      expect(finals[0].status).toBe(ContestMatchStatus.DRAFT);
    });

    it('should give the empty seat away as a walkover in round 1', () => {
      const matches = generateKnockout(7, 8);

      const round1 = matches.filter((m) => m.roundNo === 1);
      const byeMatches = round1.filter((m) => m.isBye);
      expect(byeMatches).toHaveLength(1);
      expect(byeMatches[0].status).toBe(ContestMatchStatus.COMPLETED);
      // Ghế trống là ghế cuối (số 8) nên hạt giống 1 được đi tiếp.
      expect(byeMatches[0].byeWinnerRegistrationId).toBe('r1');
    });

    it('should link next matches in round sequence', () => {
      const matches = generateKnockout(4, 4);

      const round1 = matches.filter((m) => m.roundNo === 1);
      const round2 = matches.filter((m) => m.roundNo === 2);
      expect(round1).toHaveLength(2);
      expect(round2).toHaveLength(1);
      expect(round1[0].nextMatchIndex).toBe(0);
      expect(round1[1].nextMatchIndex).toBe(0);
    });

    it('should keep the bracket at the announced capacity and never leave a one-person match', () => {
      const matches = generateKnockout(11, 16);

      // 8 + 4 + 2 + 1 ô trận của sơ đồ 16 suất
      expect(matches).toHaveLength(15);

      // 11 người thi đấu loại trực tiếp luôn cần đúng 10 trận thật.
      const playable = matches.filter((m) => m.status !== ContestMatchStatus.COMPLETED);
      expect(playable).toHaveLength(10);

      // Không trận nào phải chờ staff nhập kết quả giả cho một người.
      const incoming = countIncomingDrivers(matches);
      expect(playable.every((m) => incoming.get(m) === 2)).toBe(true);
    });

    it('should cascade walkovers through multiple rounds when the bracket is mostly empty', () => {
      const matches = generateKnockout(5, 16);

      // 5 người vẫn chỉ cần đúng 4 trận thật dù sơ đồ mở 16 suất.
      const playable = matches.filter((m) => m.status !== ContestMatchStatus.COMPLETED);
      expect(playable).toHaveLength(4);
      const incoming = countIncomingDrivers(matches);
      expect(playable.every((m) => incoming.get(m) === 2)).toBe(true);

      // Cặp mà cả hai ghế đều trống được đánh dấu rõ để FE hiển thị ô trống.
      const emptyMatches = matches.filter((m) => m.metadata.empty_slot === true);
      expect(emptyMatches.length).toBeGreaterThan(0);
      expect(emptyMatches.every((m) => m.status === ContestMatchStatus.COMPLETED)).toBe(true);
      expect(emptyMatches.every((m) => !m.byeWinnerRegistrationId)).toBe(true);
    });

    it('should fall back to the next power of two when capacity is not usable', () => {
      // Giải cũ có capacity 30 (không phải luỹ thừa của 2)
      const matches = generateKnockout(5, 30);
      expect(matches.filter((m) => m.roundNo === 1)).toHaveLength(4);
      expect(matches[0].metadata.bracket_size).toBe(8);
    });

    it('should append a third place match only when the provider enables it', () => {
      const without = generateKnockout(4, 4);
      expect(without.some((m) => m.metadata.third_place === true)).toBe(false);

      const withThirdPlace = generateKnockout(4, 4, { third_place_match: true });
      const thirdPlace = withThirdPlace.find((m) => m.metadata.third_place === true);
      expect(thirdPlace).toBeDefined();
      expect(thirdPlace?.roundNo).toBe(2);
      expect(thirdPlace?.matchNo).toBe(2);
      expect(thirdPlace?.advancementRule.winners_to_advance).toBe(0);
      expect(thirdPlace?.participants).toHaveLength(0);
    });
  });

  describe('inferWinners', () => {
    const engine = new KnockoutEngine();

    function participant(overrides: Partial<ContestMatchParticipant>): ContestMatchParticipant {
      return {
        id: 'p',
        registrationId: 'r',
        slotNo: 1,
        isWinner: false,
        finishPosition: null,
        bestLapSeconds: null,
        totalTimeSeconds: null,
        score: null,
        status: ContestParticipantStatus.READY,
        ...overrides,
      } as unknown as ContestMatchParticipant;
    }

    it('should refuse to pick a winner when no result has been recorded', () => {
      const winners = engine.inferWinners(
        [
          participant({ id: 'p1', registrationId: 'r1', slotNo: 1 }),
          participant({ id: 'p2', registrationId: 'r2', slotNo: 2 }),
        ],
        1,
      );
      // Trước đây nhánh này trả về người ở làn 1 chỉ vì slotNo nhỏ hơn.
      expect(winners).toHaveLength(0);
    });

    it('should hand the win to the present driver when the opponent is a no-show', () => {
      const winners = engine.inferWinners(
        [
          participant({ id: 'p1', registrationId: 'r1', status: ContestParticipantStatus.DNS }),
          participant({ id: 'p2', registrationId: 'r2', slotNo: 2 }),
        ],
        1,
      );
      expect(winners.map((item) => item.registrationId)).toEqual(['r2']);
    });

    it('should never advance a disqualified driver even if flagged as winner', () => {
      const winners = engine.inferWinners(
        [
          participant({
            id: 'p1',
            registrationId: 'r1',
            isWinner: true,
            status: ContestParticipantStatus.DQ,
          }),
          participant({
            id: 'p2',
            registrationId: 'r2',
            slotNo: 2,
            finishPosition: 2,
            status: ContestParticipantStatus.FINISHED,
          }),
        ],
        1,
      );
      expect(winners.map((item) => item.registrationId)).toEqual(['r2']);
    });

    it('should return nobody when every driver failed to finish', () => {
      const winners = engine.inferWinners(
        [
          participant({ id: 'p1', registrationId: 'r1', status: ContestParticipantStatus.DNS }),
          participant({ id: 'p2', registrationId: 'r2', status: ContestParticipantStatus.DNF }),
        ],
        1,
      );
      expect(winners).toHaveLength(0);
    });
  });

  describe('QualifyingFinalEngine', () => {
    it('should give every driver the configured number of qualifying runs', () => {
      const engine = new QualifyingFinalEngine();
      const contest = createMockContest({
        config: { format: 'QUALIFYING_FINAL', finalists: 4, runs_per_driver: 2 },
      });
      const registrations = [createMockRegistration('r1', 0), createMockRegistration('r2', 1)];
      const matches = engine.generateMatches({
        contest,
        cafeId: 'cafe-1',
        registrations,
        registrationOrder: ['r1', 'r2'],
      });

      expect(matches).toHaveLength(4);
      expect(matches[0].roundNo).toBe(1);
      expect(matches[0].matchType).toBe(ContestMatchType.TIME_ATTACK);
      expect(matches[0].metadata.phase).toBe('QUALIFYING');
      expect(matches[0].participants).toHaveLength(1);
      expect(matches[0].participants[0].registrationId).toBe('r1');
      expect(matches.every((match) => match.metadata.phase === 'QUALIFYING')).toBe(true);
    });

    it('should rank qualifying results by best lap ascending', () => {
      const engine = new QualifyingFinalEngine();
      const ranked = engine.rankQualifyingResults([
        { registrationId: 'r1', bestLapSeconds: 12.5 },
        { registrationId: 'r2', bestLapSeconds: 11.8 },
        { registrationId: 'r3', bestLapSeconds: null, totalTimeSeconds: 60 },
        { registrationId: 'r4', bestLapSeconds: 11.8, totalTimeSeconds: 50 },
      ]);

      // r4 ties r2 on best lap but wins on total time tiebreak
      expect(ranked.map((item) => item.registrationId)).toEqual(['r4', 'r2', 'r1', 'r3']);
    });

    it('should seed final bracket with rank 1 vs rank N (N=4)', () => {
      const engine = new QualifyingFinalEngine();
      const contest = createMockContest({ config: { format: 'QUALIFYING_FINAL', finalists: 4 } });
      const registrations = Array.from({ length: 4 }, (_, i) =>
        createMockRegistration(`r${i + 1}`, i),
      );
      const matches = engine.generateFinalBracket({
        contest,
        cafeId: 'cafe-1',
        registrations,
        registrationOrder: ['r1', 'r2', 'r3', 'r4'], // already ranked by qualifying
        startRoundNo: 2,
      });

      // 2 semifinals + 1 final
      expect(matches).toHaveLength(3);
      const semifinals = matches.filter((m) => m.roundNo === 2);
      const final = matches.filter((m) => m.roundNo === 3);
      expect(semifinals).toHaveLength(2);
      expect(final).toHaveLength(1);
      expect(final[0].matchType).toBe(ContestMatchType.FINAL);

      // Semifinal 1: rank 1 vs rank 4; Semifinal 2: rank 2 vs rank 3
      expect(semifinals[0].participants.map((p) => p.registrationId)).toEqual(['r1', 'r4']);
      expect(semifinals[1].participants.map((p) => p.registrationId)).toEqual(['r2', 'r3']);
      // seedNo carries the qualifying rank
      expect(semifinals[0].participants.map((p) => p.seedNo)).toEqual([1, 4]);
      expect(semifinals[0].metadata.phase).toBe('FINAL');
      expect(semifinals.every((m) => m.status === ContestMatchStatus.READY)).toBe(true);
      expect(final[0].status).toBe(ContestMatchStatus.DRAFT);
    });

    it('should seed final bracket with rank 1 vs rank N (N=8)', () => {
      const engine = new QualifyingFinalEngine();
      const contest = createMockContest({ config: { format: 'QUALIFYING_FINAL', finalists: 8 } });
      const registrations = Array.from({ length: 8 }, (_, i) =>
        createMockRegistration(`r${i + 1}`, i),
      );
      const matches = engine.generateFinalBracket({
        contest,
        cafeId: 'cafe-1',
        registrations,
        registrationOrder: registrations.map((r) => r.id),
        startRoundNo: 2,
      });

      // 4 quarterfinals + 2 semifinals + 1 final
      expect(matches).toHaveLength(7);
      const quarterfinals = matches.filter((m) => m.roundNo === 2);
      expect(quarterfinals).toHaveLength(4);
      // Thứ tự hạt giống chuẩn: hai trận đầu thuộc nửa trên (hạng 1), hai trận
      // sau thuộc nửa dưới (hạng 2), nên hạng 1 và hạng 2 chỉ gặp nhau ở chung kết.
      expect(quarterfinals.map((m) => m.participants.map((p) => p.registrationId))).toEqual([
        ['r1', 'r8'],
        ['r4', 'r5'],
        ['r2', 'r7'],
        ['r3', 'r6'],
      ]);
      expect(matches.filter((m) => m.roundNo === 4)[0].matchType).toBe(ContestMatchType.FINAL);
    });

    it('should create a bye for non power-of-2 finalist counts (N=3)', () => {
      const engine = new QualifyingFinalEngine();
      const contest = createMockContest({ config: { format: 'QUALIFYING_FINAL', finalists: 3 } });
      const registrations = Array.from({ length: 3 }, (_, i) =>
        createMockRegistration(`r${i + 1}`, i),
      );
      const matches = engine.generateFinalBracket({
        contest,
        cafeId: 'cafe-1',
        registrations,
        registrationOrder: ['r1', 'r2', 'r3'],
        startRoundNo: 2,
      });

      const round1 = matches.filter((m) => m.roundNo === 2);
      const byeMatch = round1.find((m) => m.isBye);
      expect(byeMatch).toBeDefined();
      expect(byeMatch?.status).toBe(ContestMatchStatus.COMPLETED);
      // Sơ đồ 4 suất, ghế 4 trống: hạng 1 gặp ô trống nên được miễn, hạng 2 gặp hạng 3.
      expect(round1[0].participants.map((p) => p.registrationId)).toEqual(['r1']);
      expect(round1[1].participants.map((p) => p.registrationId)).toEqual(['r2', 'r3']);
      expect(byeMatch?.byeWinnerRegistrationId).toBe('r1');
    });

    it('should resolve finalists count from config with default 4', () => {
      const engine = new QualifyingFinalEngine();
      expect(
        engine.resolveFinalistsCount(createMockContest({ config: { format: 'QUALIFYING_FINAL' } })),
      ).toBe(4);
      expect(
        engine.resolveFinalistsCount(
          createMockContest({ config: { format: 'QUALIFYING_FINAL', finalists: 8 } }),
        ),
      ).toBe(8);
      expect(
        engine.resolveFinalistsCount(
          createMockContest({ config: { format: 'QUALIFYING_FINAL', finalists: 1 } }),
        ),
      ).toBe(4);
    });
  });

  describe('getContestFormatEngine', () => {
    it('should return TimeTrialEngine when format is TIME_TRIAL', () => {
      const contest = createMockContest({ config: { format: 'TIME_TRIAL' } });
      expect(getContestFormatEngine(contest).code).toBe('TIME_TRIAL');
    });

    it('should return KnockoutEngine for any other format', () => {
      const contest = createMockContest({ config: { format: 'KNOCKOUT' } });
      expect(getContestFormatEngine(contest).code).toBe('KNOCKOUT');
    });

    it('should return QualifyingFinalEngine when format is QUALIFYING_FINAL', () => {
      const contest = createMockContest({ config: { format: 'QUALIFYING_FINAL' } });
      expect(getContestFormatEngine(contest).code).toBe('QUALIFYING_FINAL');
    });
  });
});
