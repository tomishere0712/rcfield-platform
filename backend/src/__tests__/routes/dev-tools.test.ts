/**
 * Cửa vào Contest Lab.
 *
 * Công cụ này được phép bật ở production để dựng dữ liệu demo, nghĩa là nó nằm
 * ngay trên tên miền thật. Nó không tự cầm quyền gì — mọi lời gọi đều mang
 * token đăng nhập người dùng nhập vào — nhưng một bảng điều khiển phơi công
 * khai vẫn là thứ không nên có, nên `DEV_TOOLS_TOKEN` là hàng rào duy nhất.
 * Hàng rào hỏng thì không ai thấy: trang vẫn mở, chỉ là mở cho tất cả mọi
 * người.
 */
import express from 'express';
import request from 'supertest';
import { app as realApp } from '../../app';
import { AppDataSource } from '../../config/database';
import { env } from '../../config/env';
import { ContestStatus, UserRole } from '../../types';
import { createTestCafe, createTestUser, generateToken } from '../helpers';

const KEY = 'khoa-thu-nghiem';

/** Dựng app tối giản chỉ gắn router dev-tools, với khoá cho trước. */
function buildApp(token: string, nodeEnv = 'test') {
  jest.resetModules();
  process.env.NODE_ENV = nodeEnv;
  process.env.DEV_TOOLS_ENABLED = 'true';
  process.env.DEV_TOOLS_TOKEN = token;

  // Nạp lại sau khi đặt biến môi trường: `env` đọc process.env đúng một lần,
  // lúc module được nạp. Import ở đầu tệp thì khoá đã cố định trước khi test
  // kịp đặt gì.
  const { devToolsRouter } = jest.requireActual<{ devToolsRouter: express.Router }>(
    '../../routes/dev-tools.routes',
  );
  const app = express();
  app.use('/dev-tools', devToolsRouter);
  return app;
}

describe('cửa vào /dev-tools khi có khoá', () => {
  const app = () => buildApp(KEY);

  it('không cầm khoá thì không thấy trang', async () => {
    await request(app()).get('/dev-tools/contest-lab').expect(404);
  });

  it('sai khoá cũng không thấy trang', async () => {
    await request(app()).get('/dev-tools/contest-lab?key=sai').expect(404);
  });

  it('trả 404 chứ không 403 — 403 là xác nhận đường dẫn có tồn tại', async () => {
    const res = await request(app()).get('/dev-tools/contest-lab');
    expect(res.status).toBe(404);
    expect(res.status).not.toBe(403);
  });

  it('đúng khoá thì mở được, và CSS/JS đi kèm cũng qua được cửa', async () => {
    const a = app();
    const page = await request(a).get(`/dev-tools/contest-lab?key=${KEY}`).expect(200);
    expect(page.text).toContain(`/dev-tools/contest-lab.js?key=${KEY}`);

    await request(a).get(`/dev-tools/contest-lab.css?key=${KEY}`).expect(200);
    await request(a).get(`/dev-tools/contest-lab.js?key=${KEY}`).expect(200);
  });

  it('tệp con không cầm khoá cũng bị chặn — cửa chặn cả router, không riêng trang', async () => {
    await request(app()).get('/dev-tools/contest-lab.js').expect(404);
  });
});

/**
 * GET /dev-tools/customers — danh sách khách để chọn làm vận động viên.
 *
 * Endpoint này trả về email người dùng, tức là dữ liệu cá nhân. Khoá dev-tools
 * một mình không đủ: ai cầm khoá cũng tải được cả danh bạ thì khoá đó thành
 * chìa vạn năng. Vì vậy còn phải là ADMIN thật.
 */
describe('GET /dev-tools/customers', () => {
  it('không đăng nhập thì không đọc được', async () => {
    await request(realApp).get('/dev-tools/customers').expect(401);
  });

  it('khách không đọc được danh sách khách', async () => {
    const customer = await createTestUser({ role: UserRole.CUSTOMER });
    await request(realApp)
      .get('/dev-tools/customers')
      .set('Authorization', `Bearer ${generateToken(customer)}`)
      .expect(403);
  });

  it('provider cũng không — đây là danh bạ toàn hệ thống, không phải khách của họ', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    await request(realApp)
      .get('/dev-tools/customers')
      .set('Authorization', `Bearer ${generateToken(provider)}`)
      .expect(403);
  });

  it('admin đọc được, và chỉ thấy tài khoản khách', async () => {
    const admin = await createTestUser({ role: UserRole.ADMIN });
    const customer = await createTestUser({ role: UserRole.CUSTOMER });
    await createTestUser({ role: UserRole.STAFF });

    const res = await request(realApp)
      .get('/dev-tools/customers')
      .set('Authorization', `Bearer ${generateToken(admin)}`)
      .expect(200);

    const rows = res.body.data as { id: string; email: string }[];
    expect(rows.some((r) => r.email === customer.email)).toBe(true);
    expect(rows.some((r) => r.email === admin.email)).toBe(false);
  });

  it('không trả về mật khẩu băm — danh sách này chỉ để chọn người', async () => {
    const admin = await createTestUser({ role: UserRole.ADMIN });
    await createTestUser({ role: UserRole.CUSTOMER });

    const res = await request(realApp)
      .get('/dev-tools/customers')
      .set('Authorization', `Bearer ${generateToken(admin)}`)
      .expect(200);

    expect(JSON.stringify(res.body)).not.toContain('password');
  });

  it('lọc được theo email, để không phải cuộn hết danh sách', async () => {
    const admin = await createTestUser({ role: UserRole.ADMIN });
    const wanted = await createTestUser({ role: UserRole.CUSTOMER });
    const other = await createTestUser({ role: UserRole.CUSTOMER });

    const res = await request(realApp)
      .get(`/dev-tools/customers?q=${encodeURIComponent(wanted.email)}`)
      .set('Authorization', `Bearer ${generateToken(admin)}`)
      .expect(200);

    const emails = (res.body.data as { email: string }[]).map((r) => r.email);
    expect(emails).toContain(wanted.email);
    expect(emails).not.toContain(other.email);
  });
});

describe('cửa vào /dev-tools khi bỏ trống khoá', () => {
  it('mở tự do — chấp nhận được ở máy phát triển, không nên ở production', async () => {
    const a = buildApp('');
    const page = await request(a).get('/dev-tools/contest-lab').expect(200);
    // Không khai khoá thì trang không gắn `?key=` vào đâu cả.
    expect(page.text).toContain('<script src="/dev-tools/contest-lab.js">');
    await request(a).get('/dev-tools/contest-lab.css').expect(200);
  });

  it('production thiếu DEV_TOOLS_TOKEN không làm lộ các endpoint bypass thời gian', async () => {
    const a = buildApp('', 'production');
    await request(a)
      .post('/dev-tools/contest-registrations/00000000-0000-4000-8000-000000000000/check-in-now')
      .send({ checked_in_cafe_id: '00000000-0000-4000-8000-000000000000' })
      .expect(404);
    await request(a)
      .post('/dev-tools/contests/00000000-0000-4000-8000-000000000000/open-registration-now')
      .send({})
      .expect(404);
  });

  it('ở local vẫn bắt buộc đăng nhập trước khi điểm danh ngay', async () => {
    const a = buildApp('', 'test');
    await request(a)
      .post('/dev-tools/contest-registrations/00000000-0000-4000-8000-000000000000/check-in-now')
      .send({ checked_in_cafe_id: '00000000-0000-4000-8000-000000000000' })
      .expect(401);
  });
});

async function createContestForRegistrationDemo(
  providerId: string,
  status: ContestStatus = ContestStatus.OPEN,
) {
  const cafe = await createTestCafe({ provider_id: providerId });
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
  const [contest] = await AppDataSource.query<{ id: string; registration_opens_at: Date }[]>(
    `INSERT INTO contests
       (cafe_id, provider_id, name, track_type, track_type_id, contest_type_id,
        contest_format_id, contest_template_id, registration_opens_at, registration_closes_at,
        vehicle_rule, config, starts_at, ends_at, capacity, entry_fee, status, created_by)
     VALUES
       ($1, $2, $3, $4, $5, $6, $7, $8,
        NOW() + INTERVAL '1 day', NOW() + INTERVAL '2 days', $9, $10,
        NOW() + INTERVAL '3 days', NOW() + INTERVAL '3 days 4 hours',
        8, 0, $11, $2)
     RETURNING id, registration_opens_at`,
    [
      cafe.id,
      providerId,
      'Contest Lab registration demo',
      trackType.code,
      trackType.id,
      contestType.id,
      contestFormat.id,
      contestTemplate.id,
      JSON.stringify({ vehicle_policy: 'BYOC_ONLY' }),
      JSON.stringify({}),
      status,
    ],
  );
  await AppDataSource.query(
    `INSERT INTO contest_cafes (contest_id, cafe_id, role, display_order, check_in_enabled)
     VALUES ($1, $2, 'HOST', 0, TRUE)`,
    [contest.id, cafe.id],
  );
  return contest;
}

describe('POST /dev-tools/contests/:contestId/open-registration-now', () => {
  it('provider mở sớm đúng contest OPEN của mình và thao tác được audit', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    const customer = await createTestUser({ role: UserRole.CUSTOMER });
    const contest = await createContestForRegistrationDemo(provider.id);
    const beforeRequest = new Date();
    const originalBypass = env.bypassContestRegistrationWindow;
    (env as { bypassContestRegistrationWindow: boolean }).bypassContestRegistrationWindow = false;

    try {
      const res = await request(realApp)
        .post(`/dev-tools/contests/${contest.id}/open-registration-now`)
        .set('Authorization', `Bearer ${generateToken(provider)}`)
        .send({})
        .expect(200);

      expect(new Date(res.body.data.registration_opens_at).getTime()).toBeLessThanOrEqual(
        beforeRequest.getTime(),
      );
      await request(realApp)
        .post(`/api/v1/contests/${contest.id}/register`)
        .set('Authorization', `Bearer ${generateToken(customer)}`)
        .send({ vehicle_source: 'BYOC', byoc_vehicle_name: 'Xe demo thật' })
        .expect(201);

      const audits = await AppDataSource.query<{ event_type: string; reason: string }[]>(
        `SELECT event_type, reason FROM contest_audit_logs WHERE contest_id = $1`,
        [contest.id],
      );
      expect(audits).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            event_type: 'contest.registration_opened_early_for_demo',
            reason: 'CONTEST_LAB',
          }),
        ]),
      );
    } finally {
      (env as { bypassContestRegistrationWindow: boolean }).bypassContestRegistrationWindow =
        originalBypass;
    }
  });

  it('không cho provider khác mở đăng ký contest không thuộc sở hữu', async () => {
    const owner = await createTestUser({ role: UserRole.PROVIDER });
    const other = await createTestUser({ role: UserRole.PROVIDER });
    const contest = await createContestForRegistrationDemo(owner.id);

    await request(realApp)
      .post(`/dev-tools/contests/${contest.id}/open-registration-now`)
      .set('Authorization', `Bearer ${generateToken(other)}`)
      .send({})
      .expect(403);
  });

  it('không bypass trạng thái DRAFT', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    const contest = await createContestForRegistrationDemo(provider.id, ContestStatus.DRAFT);

    const res = await request(realApp)
      .post(`/dev-tools/contests/${contest.id}/open-registration-now`)
      .set('Authorization', `Bearer ${generateToken(provider)}`)
      .send({})
      .expect(400);

    expect(res.body.code).toBe('CONTEST_NOT_OPEN');
  });
});
