import { AppDataSource } from '../../config/database';
import {
  generateContestFinalBracket,
  generateContestMatches,
  publishContestLeaderboard,
  submitMatchResults,
} from '../../services/contest-runtime.service';
import { ContestParticipantStatus, ProviderStatus, UserRole } from '../../types';
import { createTestCafe, createTestUser } from '../helpers';

type Viewer = { userId: string; role: UserRole };

async function activateProvider(providerId: string): Promise<void> {
  await AppDataSource.query(
    `INSERT INTO provider_profiles (user_id, business_name, registration_status)
     VALUES ($1, $2, $3)`,
    [providerId, 'Qualifying Final Provider', ProviderStatus.ACTIVE],
  );
}

async function createQualifyingContest(options: {
  providerId: string;
  cafeId: string;
  finalists: number;
  runsPerDriver: number;
}): Promise<string> {
  const [trackType] = await AppDataSource.query<{ id: string; code: string }[]>(
    `SELECT id, code FROM track_types ORDER BY created_at ASC LIMIT 1`,
  );
  const [contestType] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM contest_types WHERE code = 'PROVIDER_STANDARD' LIMIT 1`,
  );
  const [contestFormat] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM contest_formats WHERE code = 'QUALIFYING_FINAL' LIMIT 1`,
  );
  const [contestTemplate] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM contest_templates WHERE contest_format_id = $1 LIMIT 1`,
    [contestFormat.id],
  );

  const [contest] = await AppDataSource.query<{ id: string }[]>(
    `INSERT INTO contests
       (cafe_id, provider_id, name, track_type, track_type_id, contest_type_id,
        contest_format_id, contest_template_id, registration_opens_at, registration_closes_at,
        vehicle_rule, config, starts_at, ends_at, capacity, entry_fee, status, created_by)
     VALUES
       ($1, $2, $3, $4, $5, $6,
        $7, $8, NOW() - INTERVAL '2 day', NOW() - INTERVAL '1 day',
        $9, $10, NOW() + INTERVAL '1 day', NOW() + INTERVAL '2 day', 16, 0, 'CLOSED', $2)
     RETURNING id`,
    [
      options.cafeId,
      options.providerId,
      'Qualifying final test',
      trackType.code,
      trackType.id,
      contestType.id,
      contestFormat.id,
      contestTemplate.id,
      JSON.stringify({ vehicle_policy: 'BYOC_ONLY' }),
      JSON.stringify({
        format: 'QUALIFYING_FINAL',
        runtime_format: 'QUALIFYING_FINAL',
        leaderboard_mode: 'KNOCKOUT_WINS',
        drivers_per_match: 2,
        finalists: options.finalists,
        runs_per_driver: options.runsPerDriver,
      }),
    ],
  );

  await AppDataSource.query(
    `INSERT INTO contest_cafes (contest_id, cafe_id, role, display_order, check_in_enabled)
     VALUES ($1, $2, 'HOST', 0, TRUE)`,
    [contest.id, options.cafeId],
  );

  return contest.id;
}

async function addCheckedInEntrants(contestId: string, count: number): Promise<string[]> {
  const ids: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const customer = await createTestUser({ role: UserRole.CUSTOMER });
    const [registration] = await AppDataSource.query<{ id: string }[]>(
      `INSERT INTO contest_registrations
         (contest_id, user_id, vehicle_source, status, payment_status, check_in_code, checked_in_at)
       VALUES ($1, $2, 'BYOC', 'CHECKED_IN', 'NOT_REQUIRED', $3, NOW())
       RETURNING id`,
      [contestId, customer.id, `Q${Date.now().toString(36).toUpperCase()}${index}`],
    );
    ids.push(registration.id);
  }
  return ids;
}

type MatchRow = {
  id: string;
  round_no: number;
  match_no: number;
  status: string;
  metadata: Record<string, unknown>;
};

async function loadMatches(contestId: string): Promise<MatchRow[]> {
  return AppDataSource.query<MatchRow[]>(
    `SELECT id, round_no, match_no, status, metadata FROM contest_matches
      WHERE contest_id = $1 ORDER BY round_no ASC, match_no ASC`,
    [contestId],
  );
}

async function loadFinalRegistrationIds(contestId: string): Promise<string[]> {
  const rows = await AppDataSource.query<{ registration_id: string }[]>(
    `SELECT DISTINCT p.registration_id
       FROM contest_match_participants p
       JOIN contest_matches m ON m.id = p.match_id
      WHERE m.contest_id = $1 AND m.metadata->>'phase' = 'FINAL'`,
    [contestId],
  );
  return rows.map((row) => row.registration_id);
}

/**
 * Nhập kết quả cho toàn bộ lượt vòng loại.
 *
 * `lapsByRegistration` không có khoá của ai thì người đó bị ghi DNS — dùng để
 * dựng tình huống "có mặt nhưng không hoàn thành lượt nào".
 */
async function playQualifying(
  contestId: string,
  viewer: Viewer,
  lapsByRegistration: Record<string, number[]>,
): Promise<void> {
  const matches = await loadMatches(contestId);
  for (const match of matches) {
    const [participant] = await AppDataSource.query<{ registration_id: string }[]>(
      `SELECT registration_id FROM contest_match_participants WHERE match_id = $1`,
      [match.id],
    );
    const laps = lapsByRegistration[participant.registration_id];
    const runIndex = Number(match.metadata.run_no) - 1;
    const lap = laps?.[runIndex] ?? null;

    await submitMatchResults(match.id, viewer, {
      reason: 'Kết quả vòng loại test',
      results: [
        lap === null
          ? {
              registration_id: participant.registration_id,
              status: ContestParticipantStatus.DNS,
            }
          : {
              registration_id: participant.registration_id,
              best_lap_seconds: lap,
              total_time_seconds: lap,
            },
      ],
    });
  }
}

describe('Vòng loại + Chung kết', () => {
  let viewer: Viewer;
  let cafeId: string;

  beforeEach(async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    await activateProvider(provider.id);
    viewer = { userId: provider.id, role: UserRole.PROVIDER };
    const cafe = await createTestCafe({ provider_id: provider.id });
    cafeId = cafe.id;
  });

  it('lượt chạy một mình không sinh người thắng ảo', async () => {
    const contestId = await createQualifyingContest({
      providerId: viewer.userId,
      cafeId,
      finalists: 4,
      runsPerDriver: 2,
    });
    const [a, b] = await addCheckedInEntrants(contestId, 2);
    await generateContestMatches(contestId, viewer, { cafe_id: cafeId });
    await playQualifying(contestId, viewer, { [a]: [31, 30], [b]: [33, 32] });

    const winners = await AppDataSource.query<{ count: string }[]>(
      `SELECT COUNT(*) AS count
         FROM contest_match_participants p
         JOIN contest_matches m ON m.id = p.match_id
        WHERE m.contest_id = $1 AND p.is_winner = TRUE`,
      [contestId],
    );
    expect(Number(winners[0].count)).toBe(0);
  });

  it('người không hoàn thành lượt nào thì không được vào chung kết', async () => {
    const contestId = await createQualifyingContest({
      providerId: viewer.userId,
      cafeId,
      // Bốn suất chung kết nhưng chỉ ba người có thành tích — chỗ trống không
      // được lấp bằng người chưa từng chạy xong một vòng.
      finalists: 4,
      runsPerDriver: 1,
    });
    const [a, b, c, noTime] = await addCheckedInEntrants(contestId, 4);
    await generateContestMatches(contestId, viewer, { cafe_id: cafeId });
    await playQualifying(contestId, viewer, { [a]: [30], [b]: [31], [c]: [32] });

    await generateContestFinalBracket(contestId, viewer);

    const finalists = await loadFinalRegistrationIds(contestId);
    expect(finalists.sort()).toEqual([a, b, c].sort());
    expect(finalists).not.toContain(noTime);
  });

  it('một người chạy nhiều lượt vẫn chỉ chiếm một suất chung kết', async () => {
    const contestId = await createQualifyingContest({
      providerId: viewer.userId,
      cafeId,
      finalists: 4,
      runsPerDriver: 3,
    });
    const [fast, b, c] = await addCheckedInEntrants(contestId, 3);
    // Người nhanh nhất chiếm ba vị trí đầu nếu xếp hạng trên danh sách thô.
    await playQualifyingAfterGenerate(contestId, viewer, cafeId, {
      [fast]: [30.0, 30.1, 30.2],
      [b]: [35, 35.5, 36],
      [c]: [37, 37.5, 38],
    });

    await generateContestFinalBracket(contestId, viewer);

    const finalists = await loadFinalRegistrationIds(contestId);
    expect(finalists).toHaveLength(3);
    expect(finalists.filter((id) => id === fast)).toHaveLength(1);
  });

  it('dựng lại nhánh chung kết được khi chưa ai đấu, và bị chặn khi đã đấu', async () => {
    const contestId = await createQualifyingContest({
      providerId: viewer.userId,
      cafeId,
      finalists: 2,
      runsPerDriver: 1,
    });
    const [a, b] = await addCheckedInEntrants(contestId, 2);
    await playQualifyingAfterGenerate(contestId, viewer, cafeId, { [a]: [30], [b]: [31] });

    await generateContestFinalBracket(contestId, viewer);
    const firstFinal = (await loadMatches(contestId)).filter(
      (match) => match.metadata.phase === 'FINAL',
    );
    expect(firstFinal.length).toBeGreaterThan(0);

    // Chưa đấu trận chung kết nào — sinh nhầm thì phải dựng lại được, trước đây
    // lối thoát duy nhất là sửa thẳng trong DB.
    await generateContestFinalBracket(contestId, viewer);
    const secondFinal = (await loadMatches(contestId)).filter(
      (match) => match.metadata.phase === 'FINAL',
    );
    expect(secondFinal).toHaveLength(firstFinal.length);
    expect(secondFinal.map((match) => match.id)).not.toEqual(
      expect.arrayContaining(firstFinal.map((match) => match.id)),
    );

    const participants = await AppDataSource.query<{ registration_id: string }[]>(
      `SELECT registration_id FROM contest_match_participants
        WHERE match_id = $1 ORDER BY slot_no ASC`,
      [secondFinal[0].id],
    );
    await submitMatchResults(secondFinal[0].id, viewer, {
      reason: 'Chung kết đã đấu',
      results: participants.map((participant, index) => ({
        registration_id: participant.registration_id,
        finish_position: index + 1,
        is_winner: index === 0,
      })),
    });

    await expect(generateContestFinalBracket(contestId, viewer)).rejects.toMatchObject({
      code: 'FINAL_BRACKET_ALREADY_PLAYED',
    });

    // Chung kết đã đấu xong và vòng loại không còn trận nào dở, nên phải công bố
    // được. Đây là mắt xích cuối: nếu lượt vòng loại không có người thắng làm
    // cửa chặn publish hiểu nhầm là "thiếu kết quả" thì giải kẹt vĩnh viễn.
    const published = (await publishContestLeaderboard(contestId, viewer)) as {
      entries: { registration_id: string; rank: number }[];
    };
    expect(published.entries.map((entry) => entry.rank)).toEqual([1, 2]);
    expect(published.entries[0].registration_id).toBe(a);
  });
});

async function playQualifyingAfterGenerate(
  contestId: string,
  viewer: Viewer,
  cafeId: string,
  laps: Record<string, number[]>,
): Promise<void> {
  await generateContestMatches(contestId, viewer, { cafe_id: cafeId });
  await playQualifying(contestId, viewer, laps);
}
