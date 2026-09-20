import { AppDataSource } from '../../config/database';
import {
  correctMatchResults,
  generateContestMatches,
  recordMatchWalkover,
  publishContestLeaderboard,
  submitMatchResults,
  updateMatchParticipants,
} from '../../services/contest-runtime.service';
import { ContestMatchStatus, ProviderStatus, SubscriptionStatus, UserRole } from '../../types';
import { createTestCafe, createTestUser } from '../helpers';

type Viewer = { userId: string; role: UserRole };

/** contests.provider_id trỏ tới provider_profiles nên user thôi là chưa đủ. */
async function activateProvider(providerId: string): Promise<void> {
  await AppDataSource.query(
    `INSERT INTO provider_profiles (user_id, business_name, registration_status)
     VALUES ($1, $2, $3)`,
    [providerId, 'Knockout Publish Provider', ProviderStatus.ACTIVE],
  );

  const [plan] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM subscription_plans WHERE is_trial = true LIMIT 1`,
  );
  await AppDataSource.query(
    `INSERT INTO provider_subscriptions
       (provider_id, plan_id, status, started_at, expires_at, ai_quota_reset_at)
     VALUES ($1, $2, $3, NOW(), NOW() + INTERVAL '14 days', NOW() + INTERVAL '30 days')`,
    [providerId, plan.id, SubscriptionStatus.TRIAL],
  );
}

type MatchRow = {
  id: string;
  round_no: number;
  match_no: number;
  status: string;
  next_match_id: string | null;
  metadata: Record<string, unknown>;
};

async function createKnockoutContest(options: {
  providerId: string;
  cafeId: string;
  capacity: number;
  thirdPlace?: boolean;
}) {
  const [trackType] = await AppDataSource.query<{ id: string; code: string }[]>(
    `SELECT id, code FROM track_types ORDER BY created_at ASC LIMIT 1`,
  );
  const [contestType] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM contest_types WHERE code = 'PROVIDER_STANDARD' LIMIT 1`,
  );
  const [contestFormat] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM contest_formats WHERE code = 'KNOCKOUT' LIMIT 1`,
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
        $9, $10, NOW() + INTERVAL '1 day', NOW() + INTERVAL '2 day', $11, 0, 'CLOSED', $2)
     RETURNING id`,
    [
      options.cafeId,
      options.providerId,
      'Knockout publish test',
      trackType.code,
      trackType.id,
      contestType.id,
      contestFormat.id,
      contestTemplate.id,
      JSON.stringify({ vehicle_policy: 'BYOC_ONLY', assignment_policy: 'AT_CHECK_IN' }),
      JSON.stringify({
        format: 'KNOCKOUT',
        runtime_format: 'KNOCKOUT',
        leaderboard_mode: 'KNOCKOUT_WINS',
        drivers_per_match: 2,
        ...(options.thirdPlace ? { third_place_match: true } : {}),
      }),
      options.capacity,
    ],
  );

  await AppDataSource.query(
    `INSERT INTO contest_cafes (contest_id, cafe_id, role, display_order, check_in_enabled)
     VALUES ($1, $2, 'HOST', 0, TRUE)`,
    [contest.id, options.cafeId],
  );

  return contest.id;
}

async function addConfirmedEntrants(contestId: string, count: number): Promise<string[]> {
  const ids: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const customer = await createTestUser({ role: UserRole.CUSTOMER });
    const [registration] = await AppDataSource.query<{ id: string }[]>(
      `INSERT INTO contest_registrations
         (contest_id, user_id, vehicle_source, status, payment_status, check_in_code, metadata)
       VALUES ($1, $2, 'BYOC', 'CONFIRMED', 'NOT_REQUIRED', $3, $4)
       RETURNING id`,
      [
        contestId,
        customer.id,
        `T${Date.now().toString(36).toUpperCase()}${index}`,
        JSON.stringify({ byoc_declaration: { vehicle_name: `Xe ${index + 1}`, photos: [] } }),
      ],
    );
    ids.push(registration.id);
  }
  return ids;
}

async function loadMatches(contestId: string): Promise<MatchRow[]> {
  return AppDataSource.query<MatchRow[]>(
    `SELECT id, round_no, match_no, status, next_match_id, metadata FROM contest_matches
      WHERE contest_id = $1 ORDER BY round_no ASC, match_no ASC`,
    [contestId],
  );
}

/** Cho người ở làn 1 thắng, để kết quả xác định chứ không phụ thuộc lá thăm. */
async function playMatch(matchId: string, viewer: Viewer): Promise<void> {
  const participants = await AppDataSource.query<{ registration_id: string }[]>(
    `SELECT registration_id FROM contest_match_participants
      WHERE match_id = $1 ORDER BY slot_no ASC`,
    [matchId],
  );
  await submitMatchResults(matchId, viewer, {
    results: participants.map((participant, index) => ({
      registration_id: participant.registration_id,
      finish_position: index + 1,
      score: participants.length - index,
      is_winner: index === 0,
    })),
    reason: 'Kết quả test',
  });
}

/** Chạy hết mọi trận còn phải đấu, lặp cho tới khi sơ đồ không còn gì mở. */
async function playOutBracket(contestId: string, viewer: Viewer): Promise<void> {
  for (let guard = 0; guard < 20; guard += 1) {
    const matches = await loadMatches(contestId);
    const playable = matches.filter(
      (match) =>
        match.status !== ContestMatchStatus.COMPLETED && match.metadata?.empty_slot !== true,
    );
    if (playable.length === 0) return;

    let advanced = false;
    for (const match of playable) {
      const [{ count }] = await AppDataSource.query<{ count: string }[]>(
        `SELECT COUNT(*) AS count FROM contest_match_participants WHERE match_id = $1`,
        [match.id],
      );
      if (Number(count) === 0) continue;
      // Không gọi advance ở đâu cả: nhập kết quả xong người thắng phải tự sang
      // vòng sau. Sơ đồ chạy hết được chính là bằng chứng.
      await playMatch(match.id, viewer);
      advanced = true;
    }
    if (!advanced) return;
  }
}

describe('contest knockout — công bố bảng xếp hạng', () => {
  let provider: { id: string; email: string };
  let viewer: Viewer;
  let cafeId: string;

  // `jest-setup.ts` truncate cả bảng users trước MỖI test, nên fixture phải
  // dựng lại từng lần chứ không đặt ở beforeAll.
  beforeEach(async () => {
    provider = await createTestUser({ role: UserRole.PROVIDER });
    viewer = { userId: provider.id, role: UserRole.PROVIDER };
    await activateProvider(provider.id);
    const cafe = await createTestCafe({ provider_id: provider.id });
    cafeId = cafe.id;
  });

  it('công bố được khi sơ đồ có ô trống', async () => {
    // 6 người trên sơ đồ 8 ô: 2 ô trống, sinh ra các trận không ai chạy. Trước
    // đây chúng bị coi là "chưa có kết quả" và chặn công bố vĩnh viễn.
    const contestId = await createKnockoutContest({
      providerId: provider.id,
      cafeId,
      capacity: 8,
    });
    await addConfirmedEntrants(contestId, 6);
    await generateContestMatches(contestId, viewer, { cafe_id: cafeId });

    const matches = await loadMatches(contestId);
    expect(matches.some((match) => match.metadata?.bye === true)).toBe(true);

    await playOutBracket(contestId, viewer);
    const published = await publishContestLeaderboard(contestId, viewer);
    expect(published).toBeTruthy();
  });

  it('công bố được khi trận chỉ ghi ai thắng, không có điểm số', async () => {
    // Đấu loại 1v1 thì "ai thắng" chính là kết quả — không có thời gian vòng
    // chạy nào để nhập. Đòi thêm trường số là chặn nhầm và giải kẹt vĩnh viễn.
    const contestId = await createKnockoutContest({
      providerId: provider.id,
      cafeId,
      capacity: 4,
    });
    await addConfirmedEntrants(contestId, 4);
    await generateContestMatches(contestId, viewer, { cafe_id: cafeId });

    for (let round = 1; round <= 2; round += 1) {
      const roundMatches = (await loadMatches(contestId)).filter(
        (match) => match.round_no === round && match.status !== ContestMatchStatus.COMPLETED,
      );
      for (const match of roundMatches) {
        const participants = await AppDataSource.query<{ registration_id: string }[]>(
          `SELECT registration_id FROM contest_match_participants
            WHERE match_id = $1 ORDER BY slot_no ASC`,
          [match.id],
        );
        if (participants.length === 0) continue;
        await submitMatchResults(match.id, viewer, {
          // Chỉ đánh dấu người thắng, không gửi finish_position/score/thời gian.
          results: participants.map((participant, index) => ({
            registration_id: participant.registration_id,
            is_winner: index === 0,
          })),
          reason: 'Chỉ ghi người thắng',
        });
      }
    }

    const published = await publishContestLeaderboard(contestId, viewer);
    expect(published).toBeTruthy();
  });

  it('điền người thua bán kết vào trận tranh hạng 3 rồi mới cho công bố', async () => {
    const contestId = await createKnockoutContest({
      providerId: provider.id,
      cafeId,
      capacity: 4,
      thirdPlace: true,
    });
    await addConfirmedEntrants(contestId, 4);
    await generateContestMatches(contestId, viewer, { cafe_id: cafeId });

    const afterDraw = await loadMatches(contestId);
    const thirdPlace = afterDraw.find((match) => match.metadata?.third_place === true);
    expect(thirdPlace).toBeDefined();

    // Chưa đấu bán kết thì chưa có ai để điền.
    const [{ count: beforeCount }] = await AppDataSource.query<{ count: string }[]>(
      `SELECT COUNT(*) AS count FROM contest_match_participants WHERE match_id = $1`,
      [thirdPlace!.id],
    );
    expect(Number(beforeCount)).toBe(0);

    // Đấu xong hai bán kết (vòng 1) là trận tranh hạng 3 phải có đủ hai người.
    for (const match of afterDraw.filter((item) => item.round_no === 1)) {
      await playMatch(match.id, viewer);
    }
    const populated = await AppDataSource.query<{ registration_id: string }[]>(
      `SELECT registration_id FROM contest_match_participants WHERE match_id = $1`,
      [thirdPlace!.id],
    );
    expect(populated).toHaveLength(2);

    await playOutBracket(contestId, viewer);

    // Trận tranh hạng 3 khai `winners_to_advance: 0` vì nó không đẩy ai đi tiếp,
    // nhưng vẫn phải chốt ai hạng 3 ai hạng 4. Luật "lượt chạy một mình thì
    // không có người thắng" chỉ được áp cho match TIME_ATTACK, không được lan
    // sang đây — nếu lan thì hạng 3 và 4 mất trắng mà chẳng ai báo lỗi.
    const thirdPlaceWinners = await AppDataSource.query<{ count: string }[]>(
      `SELECT COUNT(*) AS count FROM contest_match_participants
        WHERE match_id = $1 AND is_winner = TRUE`,
      [thirdPlace!.id],
    );
    expect(Number(thirdPlaceWinners[0].count)).toBe(1);

    const published = await publishContestLeaderboard(contestId, viewer);
    expect(published).toBeTruthy();
  });

  it('sửa được sơ đồ khi chưa ai check-in', async () => {
    // Sơ đồ đấu loại bốc trước ngày thi nên toàn bộ người chơi mới chỉ ở trạng
    // thái đã duyệt. Đòi đã check-in thì từ lúc bốc tới sáng ngày thi không sửa
    // nổi sơ đồ — kéo người xong bấm Lưu là nhận lỗi.
    const contestId = await createKnockoutContest({
      providerId: provider.id,
      cafeId,
      capacity: 4,
    });
    const entrantIds = await addConfirmedEntrants(contestId, 4);
    await generateContestMatches(contestId, viewer, { cafe_id: cafeId });

    const finalMatch = (await loadMatches(contestId)).find((match) => match.round_no === 2);
    expect(finalMatch).toBeDefined();

    await expect(
      updateMatchParticipants(finalMatch!.id, viewer, {
        participants: [{ registration_id: entrantIds[0], slot_no: 1 }],
      }),
    ).resolves.toBeDefined();
  });

  it('tự đóng trận tranh hạng 3 khi chỉ có một người thua bán kết', async () => {
    // 3 người trên sơ đồ 4 ô: một bán kết là thắng do gặp ô trống nên không
    // sinh ra người thua, chỉ còn đúng một ứng viên cho hạng 3.
    const contestId = await createKnockoutContest({
      providerId: provider.id,
      cafeId,
      capacity: 4,
      thirdPlace: true,
    });
    await addConfirmedEntrants(contestId, 3);
    await generateContestMatches(contestId, viewer, { cafe_id: cafeId });

    await playOutBracket(contestId, viewer);

    const matches = await loadMatches(contestId);
    const thirdPlace = matches.find((match) => match.metadata?.third_place === true);
    expect(thirdPlace?.status).toBe(ContestMatchStatus.COMPLETED);

    const published = await publishContestLeaderboard(contestId, viewer);
    expect(published).toBeTruthy();
  });
});

describe('contest knockout — sửa kết quả', () => {
  let provider: { id: string; email: string };
  let viewer: Viewer;
  let cafeId: string;
  let contestId: string;

  beforeEach(async () => {
    provider = await createTestUser({ role: UserRole.PROVIDER });
    viewer = { userId: provider.id, role: UserRole.PROVIDER };
    await activateProvider(provider.id);
    const cafe = await createTestCafe({ provider_id: provider.id });
    cafeId = cafe.id;

    contestId = await createKnockoutContest({
      providerId: provider.id,
      cafeId,
      capacity: 4,
    });
    await addConfirmedEntrants(contestId, 4);
    await generateContestMatches(contestId, viewer, { cafe_id: cafeId });
  });

  async function participantsOf(matchId: string) {
    return AppDataSource.query<{ registration_id: string; source: string | null }[]>(
      `SELECT registration_id, metadata ->> 'source_match_id' AS source
         FROM contest_match_participants WHERE match_id = $1 ORDER BY slot_no ASC`,
      [matchId],
    );
  }

  it('không cho đóng trận khi chưa xác định được người thắng', async () => {
    const semi = (await loadMatches(contestId)).filter((match) => match.round_no === 1)[0];
    const semiParticipants = await participantsOf(semi.id);

    // Không tick ai, không nhập số liệu — đúng thao tác bấm Lưu cho có.
    await expect(
      submitMatchResults(semi.id, viewer, {
        results: semiParticipants.map((participant) => ({
          registration_id: participant.registration_id,
        })),
        reason: 'Bấm nhầm',
      }),
    ).rejects.toMatchObject({ code: 'MATCH_WINNER_REQUIRED' });

    // Trận vẫn mở để nhập lại cho đúng.
    const after = (await loadMatches(contestId)).find((match) => match.id === semi.id);
    expect(after?.status).not.toBe(ContestMatchStatus.COMPLETED);
  });

  it('đổi người thắng thì vòng sau thay người, không cộng thêm', async () => {
    const matches = await loadMatches(contestId);
    const semi = matches.filter((match) => match.round_no === 1)[0];
    const finalMatch = matches.find((match) => match.round_no === 2)!;

    await playMatch(semi.id, viewer);
    const [firstWinner] = await participantsOf(finalMatch.id);
    expect(firstWinner).toBeDefined();

    // Nhập lại kết quả với người kia thắng, đúng thao tác staff sửa nhầm lẫn.
    const semiParticipants = await participantsOf(semi.id);
    await submitMatchResults(semi.id, viewer, {
      results: semiParticipants.map((participant, index) => ({
        registration_id: participant.registration_id,
        finish_position: index === 1 ? 1 : 2,
        score: index === 1 ? 10 : 5,
        is_winner: index === 1,
      })),
      reason: 'Sửa nhầm người thắng',
    });

    const afterFix = await participantsOf(finalMatch.id);
    expect(afterFix).toHaveLength(1);
    expect(afterFix[0].registration_id).toBe(semiParticipants[1].registration_id);
    expect(afterFix[0].registration_id).not.toBe(firstWinner.registration_id);
  });

  it('sửa một bán kết không làm mất người của bán kết còn lại', async () => {
    const matches = await loadMatches(contestId);
    const semis = matches.filter((match) => match.round_no === 1);
    const finalMatch = matches.find((match) => match.round_no === 2)!;

    for (const semi of semis) await playMatch(semi.id, viewer);
    expect(await participantsOf(finalMatch.id)).toHaveLength(2);

    const otherSemiWinner = (await participantsOf(finalMatch.id)).find(
      (item) => item.source === semis[1].id,
    );
    expect(otherSemiWinner).toBeDefined();

    const semiParticipants = await participantsOf(semis[0].id);
    await correctMatchResults(semis[0].id, viewer, {
      force_cascade: true,
      reason: 'Trọng tài xem lại băng',
      results: semiParticipants.map((participant, index) => ({
        registration_id: participant.registration_id,
        finish_position: index === 1 ? 1 : 2,
        score: index === 1 ? 10 : 5,
        is_winner: index === 1,
      })),
    });

    const afterCorrection = await participantsOf(finalMatch.id);
    // Người của nhánh bên kia phải còn nguyên; trước đây force_cascade xoá sạch
    // cả chuỗi hạ nguồn và không có gì đưa họ trở lại.
    expect(
      afterCorrection.some((item) => item.registration_id === otherSemiWinner!.registration_id),
    ).toBe(true);
    expect(afterCorrection).toHaveLength(2);
  });
});

describe('contest knockout — xử thua vắng mặt', () => {
  let provider: { id: string; email: string };
  let viewer: Viewer;
  let cafeId: string;
  let contestId: string;

  beforeEach(async () => {
    provider = await createTestUser({ role: UserRole.PROVIDER });
    viewer = { userId: provider.id, role: UserRole.PROVIDER };
    await activateProvider(provider.id);
    const cafe = await createTestCafe({ provider_id: provider.id });
    cafeId = cafe.id;

    contestId = await createKnockoutContest({
      providerId: provider.id,
      cafeId,
      capacity: 4,
    });
    await addConfirmedEntrants(contestId, 4);
    await generateContestMatches(contestId, viewer, { cafe_id: cafeId });
  });

  async function participantsOf(matchId: string) {
    return AppDataSource.query<{ registration_id: string; status: string; is_winner: boolean }[]>(
      `SELECT registration_id, status, is_winner FROM contest_match_participants
        WHERE match_id = $1 ORDER BY slot_no ASC`,
      [matchId],
    );
  }

  it('một người vắng thì người còn lại thắng và đi tiếp', async () => {
    const semis = (await loadMatches(contestId)).filter((match) => match.round_no === 1);
    const finalMatch = (await loadMatches(contestId)).find((match) => match.round_no === 2)!;
    const [absent, present] = await participantsOf(semis[0].id);

    await recordMatchWalkover(semis[0].id, viewer, {
      absent: [{ registration_id: absent.registration_id, status: 'DNS' }],
      reason: 'Không có mặt khi gọi tên',
    });

    const after = await participantsOf(semis[0].id);
    expect(after.find((p) => p.registration_id === absent.registration_id)?.status).toBe('DNS');
    expect(after.find((p) => p.registration_id === present.registration_id)?.is_winner).toBe(true);

    const inFinal = await participantsOf(finalMatch.id);
    expect(inFinal.map((p) => p.registration_id)).toContain(present.registration_id);
  });

  it('cả hai cùng vắng thì vòng sau không bị treo', async () => {
    const matches = await loadMatches(contestId);
    const semis = matches.filter((match) => match.round_no === 1);
    const finalMatch = matches.find((match) => match.round_no === 2)!;

    // Bán kết 2 đấu bình thường, bán kết 1 cả hai đều vắng.
    await playMatch(semis[1].id, viewer);
    const bothAbsent = await participantsOf(semis[0].id);
    await recordMatchWalkover(semis[0].id, viewer, {
      absent: bothAbsent.map((participant) => ({
        registration_id: participant.registration_id,
        status: 'DNS' as const,
      })),
      reason: 'Cả hai đội không có mặt',
    });

    // Chung kết chỉ còn một người: phải tự đóng và trao chiến thắng, chứ không
    // ngồi chờ đối thủ vĩnh viễn không tới.
    const closedFinal = (await loadMatches(contestId)).find((match) => match.id === finalMatch.id);
    expect(closedFinal?.status).toBe(ContestMatchStatus.COMPLETED);
    expect(closedFinal?.metadata?.bye).toBe(true);

    const champion = await participantsOf(finalMatch.id);
    expect(champion).toHaveLength(1);
    expect(champion[0].is_winner).toBe(true);

    const published = await publishContestLeaderboard(contestId, viewer);
    expect(published).toBeTruthy();
  });

  it('không cho xử thua khi cả hai đều có mặt', async () => {
    const semi = (await loadMatches(contestId)).filter((match) => match.round_no === 1)[0];

    await expect(
      recordMatchWalkover(semi.id, viewer, {
        absent: [],
        reason: 'Không có ai vắng',
      }),
    ).rejects.toMatchObject({ code: 'MATCH_WALKOVER_NOT_APPLICABLE' });
  });
});

describe('contest knockout — bảng xếp hạng', () => {
  let provider: { id: string; email: string };
  let viewer: Viewer;
  let cafeId: string;

  beforeEach(async () => {
    provider = await createTestUser({ role: UserRole.PROVIDER });
    viewer = { userId: provider.id, role: UserRole.PROVIDER };
    await activateProvider(provider.id);
    const cafe = await createTestCafe({ provider_id: provider.id });
    cafeId = cafe.id;
  });

  type PublishedLeaderboard = {
    mode: string;
    entries: Array<{ rank: number; registration_id: string; wins: number; real_wins: number }>;
  };

  async function winnerOf(matchId: string): Promise<string> {
    const [row] = await AppDataSource.query<{ registration_id: string }[]>(
      `SELECT registration_id FROM contest_match_participants
        WHERE match_id = $1 AND is_winner = true LIMIT 1`,
      [matchId],
    );
    return row.registration_id;
  }

  it('xếp hạng theo vòng bị loại, không đếm thắng do gặp ô trống', async () => {
    // 6 người trên sơ đồ 8 ô: hai người bốc trúng ô trống được cộng một trận
    // thắng miễn phí. Trước đây họ nhảy lên đầu bảng nhờ đúng con số đó.
    const contestId = await createKnockoutContest({
      providerId: provider.id,
      cafeId,
      capacity: 8,
    });
    await addConfirmedEntrants(contestId, 6);
    await generateContestMatches(contestId, viewer, { cafe_id: cafeId });
    await playOutBracket(contestId, viewer);

    const matches = await loadMatches(contestId);
    const finalMatch = matches.reduce((deepest, match) =>
      match.round_no > deepest.round_no ? match : deepest,
    );
    const champion = await winnerOf(finalMatch.id);

    const published = (await publishContestLeaderboard(
      contestId,
      viewer,
    )) as unknown as PublishedLeaderboard;

    expect(published.mode).toBe('KNOCKOUT_BRACKET');
    expect(published.entries[0].registration_id).toBe(champion);

    // Người vô địch không nhất thiết có nhiều "wins" nhất vì người khác được
    // cộng thắng do gặp ô trống — bảng xếp hạng không được dựa vào con số đó.
    const maxWins = Math.max(...published.entries.map((entry) => entry.wins));
    expect(published.entries[0].real_wins).toBeGreaterThan(0);
    expect(maxWins).toBeGreaterThanOrEqual(published.entries[0].real_wins);
  });

  it('trận tranh hạng 3 quyết định hạng 3 và 4', async () => {
    const contestId = await createKnockoutContest({
      providerId: provider.id,
      cafeId,
      capacity: 4,
      thirdPlace: true,
    });
    await addConfirmedEntrants(contestId, 4);
    await generateContestMatches(contestId, viewer, { cafe_id: cafeId });
    await playOutBracket(contestId, viewer);

    const matches = await loadMatches(contestId);
    const thirdPlaceMatch = matches.find((match) => match.metadata?.third_place === true)!;
    const finalMatch = matches.find(
      (match) => match.round_no === 2 && match.metadata?.third_place !== true,
    )!;

    const published = (await publishContestLeaderboard(
      contestId,
      viewer,
    )) as unknown as PublishedLeaderboard;

    const rankOf = (registrationId: string) =>
      published.entries.find((entry) => entry.registration_id === registrationId)?.rank;

    expect(rankOf(await winnerOf(finalMatch.id))).toBe(1);
    expect(rankOf(await winnerOf(thirdPlaceMatch.id))).toBe(3);
  });
});
