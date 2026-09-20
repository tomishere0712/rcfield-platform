import { AppDataSource } from '../../config/database';
import { createContest, updateContest } from '../../services/contest/contests-crud';
import { CreateContestBody } from '../../services/contest/types';
import { ProviderStatus, UserRole } from '../../types';
import { createTestCafe, createTestUser } from '../helpers';

type Viewer = { userId: string; role: UserRole };

async function activateProvider(providerId: string): Promise<void> {
  await AppDataSource.query(
    `INSERT INTO provider_profiles (user_id, business_name, registration_status)
     VALUES ($1, $2, $3)`,
    [providerId, 'Contest Format Provider', ProviderStatus.ACTIVE],
  );
}

async function resolveCatalogIds(formatCode: string) {
  const [trackType] = await AppDataSource.query<{ id: string; code: string }[]>(
    `SELECT id, code FROM track_types WHERE code = 'DRIFT' LIMIT 1`,
  );
  const [contestType] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM contest_types WHERE code = 'PROVIDER_STANDARD' LIMIT 1`,
  );
  const [contestFormat] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM contest_formats WHERE code = $1 LIMIT 1`,
    [formatCode],
  );
  const [contestTemplate] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM contest_templates WHERE contest_format_id = $1 LIMIT 1`,
    [contestFormat.id],
  );
  return { trackType, contestType, contestFormat, contestTemplate };
}

/**
 * Thể thức bị hạ xuống "chưa phát hành" chỉ trong phạm vi bài test.
 *
 * Bài này kiểm CƠ CHẾ chặn, không kiểm thể thức nào đang mở — mà danh sách đó
 * thay đổi theo tiến độ sản phẩm. Khoá cứng vào TIME_TRIAL thì tới ngày mở nó
 * ra là test đỏ dù chẳng có gì hỏng.
 */
const UNRELEASED_CODE = 'TIME_TRIAL';

async function setReleased(code: string, released: boolean): Promise<void> {
  await AppDataSource.query(`UPDATE contest_formats SET is_released = $1 WHERE code = $2`, [
    released,
    code,
  ]);
}

describe('Cửa chặn thể thức chưa phát hành', () => {
  let viewer: Viewer;
  let cafeId: string;
  let trackTypeId: string;

  afterEach(async () => {
    await setReleased(UNRELEASED_CODE, true);
  });

  beforeEach(async () => {
    await setReleased(UNRELEASED_CODE, false);
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    await activateProvider(provider.id);
    viewer = { userId: provider.id, role: UserRole.PROVIDER };

    const cafe = await createTestCafe({ provider_id: provider.id, track_types: ['DRIFT'] });
    cafeId = cafe.id;

    const [trackType] = await AppDataSource.query<{ id: string }[]>(
      `SELECT id FROM track_types WHERE code = 'DRIFT' LIMIT 1`,
    );
    trackTypeId = trackType.id;

    // createTestCafe chỉ ghi mảng track_types trên cafes; luật của giải lại đọc
    // cafe_track_configs, nên phải dựng sân thật thì mới qua được BR-CT-021.
    await AppDataSource.query(
      `INSERT INTO cafe_track_configs (cafe_id, track_type_id, byoc_capacity, max_concurrent)
       VALUES ($1, $2, 8, 8)`,
      [cafeId, trackTypeId],
    );
  });

  function buildBody(catalog: {
    contestType: { id: string };
    contestFormat: { id: string };
    contestTemplate: { id: string };
  }): CreateContestBody {
    const startsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    return {
      name: 'Giải thử thể thức',
      contest_type_id: catalog.contestType.id,
      contest_format_id: catalog.contestFormat.id,
      contest_template_id: catalog.contestTemplate.id,
      track_type_id: trackTypeId,
      participating_cafe_ids: [cafeId],
      starts_at: startsAt,
      ends_at: new Date(startsAt.getTime() + 4 * 60 * 60 * 1000),
      registration_opens_at: new Date(Date.now() + 60 * 60 * 1000),
      registration_closes_at: new Date(startsAt.getTime() - 24 * 60 * 60 * 1000),
      capacity: 8,
      entry_fee: 0,
      vehicle_rule: { vehicle_policy: 'BYOC_ONLY' },
      config: {},
    };
  }

  it('chặn tạo giải trên thể thức còn dở, nêu đích danh thể thức', async () => {
    const catalog = await resolveCatalogIds(UNRELEASED_CODE);

    await expect(createContest(viewer, buildBody(catalog))).rejects.toMatchObject({
      statusCode: 400,
      code: 'CONTEST_FORMAT_NOT_RELEASED',
      message: expect.stringContaining('Đua tính giờ'),
    });
  });

  it('vẫn cho tạo giải trên thể thức đã mở', async () => {
    const catalog = await resolveCatalogIds('KNOCKOUT');

    const contest = await createContest(viewer, buildBody(catalog));

    expect(contest.contest_format?.code).toBe('KNOCKOUT');
  });

  it('giải cũ nằm trên thể thức chưa mở vẫn sửa được thông tin khác', async () => {
    // Cửa chặn nằm ở resolveCatalogOrThrow, mà mọi lần update đều resolve lại
    // catalog từ id sẵn có. Chặn vô điều kiện là khoá cứng giải cũ: provider
    // không đổi nổi cái tên, cũng không huỷ được. Đây là bài kiểm chứng điều đó.
    const catalog = await resolveCatalogIds(UNRELEASED_CODE);
    const body = buildBody(catalog);
    const [row] = await AppDataSource.query<{ id: string }[]>(
      `INSERT INTO contests
         (cafe_id, provider_id, name, track_type, track_type_id, contest_type_id,
          contest_format_id, contest_template_id, registration_opens_at,
          registration_closes_at, vehicle_rule, config, starts_at, ends_at,
          capacity, entry_fee, status, created_by)
       VALUES ($1,$2,$3,'DRIFT',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,0,'DRAFT',$2)
       RETURNING id`,
      [
        cafeId,
        viewer.userId,
        'Giải cũ tính giờ',
        trackTypeId,
        catalog.contestType.id,
        catalog.contestFormat.id,
        catalog.contestTemplate.id,
        body.registration_opens_at,
        body.registration_closes_at,
        JSON.stringify(body.vehicle_rule),
        JSON.stringify({ runtime_format: UNRELEASED_CODE }),
        body.starts_at,
        body.ends_at,
        body.capacity,
      ],
    );
    await AppDataSource.query(
      `INSERT INTO contest_cafes (contest_id, cafe_id, role, display_order, check_in_enabled)
       VALUES ($1, $2, 'HOST', 0, true)`,
      [row.id, cafeId],
    );

    const updated = await updateContest(row.id, viewer, { name: 'Giải cũ đổi tên' });

    expect(updated.name).toBe('Giải cũ đổi tên');
  });

  it('chặn khi đổi giải đang chạy sang thể thức còn dở', async () => {
    const released = await resolveCatalogIds('KNOCKOUT');
    const contest = await createContest(viewer, buildBody(released));
    const unreleased = await resolveCatalogIds(UNRELEASED_CODE);

    await expect(
      updateContest(contest.id, viewer, {
        contest_type_id: unreleased.contestType.id,
        contest_format_id: unreleased.contestFormat.id,
        contest_template_id: unreleased.contestTemplate.id,
      }),
    ).rejects.toMatchObject({ code: 'CONTEST_FORMAT_NOT_RELEASED' });
  });
});
