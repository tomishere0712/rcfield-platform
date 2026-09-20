import request from 'supertest';
import { app } from '../../app';
import { AppDataSource } from '../../config/database';
import { UserRole } from '../../types';
import { createTestCafe, createTestUser, generateToken } from '../helpers';

/**
 * Cùng một `feature_key` tồn tại nhiều dòng: một dòng GLOBAL cho cả nền tảng và
 * một dòng riêng cho mỗi chi nhánh bật lẻ. Nghĩa là `feature_key` KHÔNG định
 * danh được một dòng — địa chỉ đúng phải là `id`.
 */
async function seedFlags() {
  const admin = await createTestUser({ role: UserRole.ADMIN });
  const cafeA = await createTestCafe();
  const cafeB = await createTestCafe();

  const [global] = await AppDataSource.query(
    `INSERT INTO feature_flags (feature_key, display_name, description, is_enabled, entity_type, config)
     VALUES ('AI_CHATBOT', 'Chatbot hỗ trợ khách hàng', 'Trả lời khách bằng AI', true, 'GLOBAL', '{}')
     RETURNING id`,
  );
  const [perCafeA] = await AppDataSource.query(
    `INSERT INTO feature_flags (feature_key, display_name, is_enabled, entity_type, entity_id, config)
     VALUES ('AI_CHATBOT', 'AI Chat — chi nhánh A', true, 'CAFE', $1, '{"monthly_quota": 1000}')
     RETURNING id`,
    [cafeA.id],
  );
  const [perCafeB] = await AppDataSource.query(
    `INSERT INTO feature_flags (feature_key, display_name, is_enabled, entity_type, entity_id, config)
     VALUES ('AI_CHATBOT', 'AI Chat — chi nhánh B', true, 'CAFE', $1, '{"monthly_quota": 500}')
     RETURNING id`,
    [cafeB.id],
  );

  return {
    token: generateToken(admin),
    global: global.id,
    perCafeA: perCafeA.id,
    perCafeB: perCafeB.id,
    cafeA,
    cafeB,
  };
}

describe('GET /api/v1/admin/feature-flags', () => {
  it('trả đủ thông tin để phân biệt các dòng cùng feature_key', async () => {
    const { token, cafeA } = await seedFlags();

    const res = await request(app)
      .get('/api/v1/admin/feature-flags')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const chatbots = res.body.data.filter(
      (row: { feature_key: string }) => row.feature_key === 'AI_CHATBOT',
    );
    expect(chatbots).toHaveLength(3);

    for (const row of chatbots) {
      expect(row.id).toBeTruthy();
      expect(row.display_name).toBeTruthy();
    }

    // Dòng của chi nhánh phải kèm tên chi nhánh, nếu không admin nhìn ba dòng
    // giống hệt nhau.
    const scoped = chatbots.find((row: { entity_id: string | null }) => row.entity_id === cafeA.id);
    expect(scoped.cafe_name).toBe(cafeA.name);

    const global = chatbots.find((row: { entity_type: string }) => row.entity_type === 'GLOBAL');
    expect(global.cafe_name).toBeNull();
  });
});

describe('PATCH /api/v1/admin/feature-flags/:id', () => {
  it('tắt một dòng thì các dòng cùng feature_key khác không bị đụng tới', async () => {
    const { token, global, perCafeA, perCafeB } = await seedFlags();

    const res = await request(app)
      .patch(`/api/v1/admin/feature-flags/${perCafeA}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ isEnabled: false });

    expect(res.status).toBe(200);
    expect(res.body.data.is_enabled).toBe(false);

    const rows = await AppDataSource.query<{ id: string; is_enabled: boolean }[]>(
      `SELECT id, is_enabled FROM feature_flags WHERE feature_key = 'AI_CHATBOT'`,
    );
    const state = Object.fromEntries(rows.map((r) => [r.id, r.is_enabled]));
    expect(state[perCafeA]).toBe(false);
    expect(state[global]).toBe(true);
    expect(state[perCafeB]).toBe(true);
  });

  it('sửa hạn mức cũng chỉ ảnh hưởng đúng dòng đó', async () => {
    const { token, perCafeA, perCafeB } = await seedFlags();

    await request(app)
      .patch(`/api/v1/admin/feature-flags/${perCafeA}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ config: { monthly_quota: 9999 } })
      .expect(200);

    const rows = await AppDataSource.query<{ id: string; config: { monthly_quota: number } }[]>(
      `SELECT id, config FROM feature_flags WHERE feature_key = 'AI_CHATBOT' AND entity_type = 'CAFE'`,
    );
    const byId = Object.fromEntries(rows.map((r) => [r.id, r.config?.monthly_quota]));
    expect(byId[perCafeA]).toBe(9999);
    expect(byId[perCafeB]).toBe(500);
  });

  it('id không tồn tại thì trả 404', async () => {
    const { token } = await seedFlags();

    await request(app)
      .patch('/api/v1/admin/feature-flags/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${token}`)
      .send({ isEnabled: false })
      .expect(404);
  });

  it('không phải admin thì không đổi được', async () => {
    const { perCafeA } = await seedFlags();
    const provider = await createTestUser({ role: UserRole.PROVIDER });

    await request(app)
      .patch(`/api/v1/admin/feature-flags/${perCafeA}`)
      .set('Authorization', `Bearer ${generateToken(provider)}`)
      .send({ isEnabled: false })
      .expect(403);
  });
});
