import request from 'supertest';
import { app } from '../../app';
import { AppDataSource } from '../../config/database';
import { ProviderStatus, SubscriptionStatus, UserRole } from '../../types';
import { createTestCafe, createTestUser, generateToken } from '../helpers';

async function activateProvider(providerId: string): Promise<void> {
  await AppDataSource.query(
    `INSERT INTO provider_profiles
       (user_id, business_name, registration_status)
     VALUES ($1, $2, $3)`,
    [providerId, 'Provider Category Test', ProviderStatus.ACTIVE],
  );

  const [plan] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM subscription_plans WHERE name = 'TRIAL' LIMIT 1`,
  );

  await AppDataSource.query(
    `INSERT INTO provider_subscriptions
       (provider_id, plan_id, status, started_at, expires_at, ai_quota_reset_at)
     VALUES ($1, $2, $3, NOW(), NOW() + INTERVAL '30 days', NOW() + INTERVAL '1 month')`,
    [providerId, plan.id, SubscriptionStatus.TRIAL],
  );
}

/** Provider đã kích hoạt + một cafe thuộc sở hữu. */
async function setupProviderCafe() {
  const provider = await createTestUser({ role: UserRole.PROVIDER });
  await activateProvider(provider.id);
  const cafe = await createTestCafe({ provider_id: provider.id, status: 'ACTIVE' });
  return { provider, cafe, token: `Bearer ${generateToken(provider)}` };
}

async function insertCategory(
  cafeId: string,
  name: string,
  displayOrder = 0,
): Promise<{ id: string }> {
  const [row] = await AppDataSource.query<{ id: string }[]>(
    `INSERT INTO menu_categories (cafe_id, name, display_order)
     VALUES ($1,$2,$3) RETURNING id`,
    [cafeId, name, displayOrder],
  );
  return row;
}

async function insertItem(
  cafeId: string,
  name: string,
  categoryId: string | null,
  isAvailable = true,
): Promise<void> {
  await AppDataSource.query(
    `INSERT INTO menu_items (cafe_id, name, price, category_id, is_available)
     VALUES ($1,$2,$3,$4,$5)`,
    [cafeId, name, 30000, categoryId, isAvailable],
  );
}

// ── T012: CRUD cơ bản ─────────────────────────────────────────────────────────

describe('Menu categories — CRUD', () => {
  it('chi nhánh chưa có danh mục trả mảng rỗng', async () => {
    const { cafe, token } = await setupProviderCafe();

    const res = await request(app)
      .get(`/api/v1/cafes/${cafe.id}/menu/categories`)
      .set('Authorization', token);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('list sắp xếp theo display_order rồi created_at', async () => {
    const { cafe, token } = await setupProviderCafe();
    await insertCategory(cafe.id, 'Thu ba', 2);
    await insertCategory(cafe.id, 'Thu nhat', 0);
    await insertCategory(cafe.id, 'Thu hai', 1);

    const res = await request(app)
      .get(`/api/v1/cafes/${cafe.id}/menu/categories`)
      .set('Authorization', token);

    expect(res.status).toBe(200);
    expect(res.body.data.map((c: { name: string }) => c.name)).toEqual([
      'Thu nhat',
      'Thu hai',
      'Thu ba',
    ]);
  });

  it('itemCount tính CẢ món đang tạm ngưng bán', async () => {
    const { cafe, token } = await setupProviderCafe();
    const category = await insertCategory(cafe.id, 'Do uong');
    await insertItem(cafe.id, 'Dang ban', category.id, true);
    await insertItem(cafe.id, 'Tam an', category.id, false);

    const res = await request(app)
      .get(`/api/v1/cafes/${cafe.id}/menu/categories`)
      .set('Authorization', token);

    expect(res.status).toBe(200);
    expect(res.body.data[0].itemCount).toBe(2);
  });

  it('tạo danh mục mới xếp xuống cuối, displayOrder tự tăng', async () => {
    const { cafe, token } = await setupProviderCafe();

    const first = await request(app)
      .post(`/api/v1/cafes/${cafe.id}/menu/categories`)
      .set('Authorization', token)
      .send({ name: 'Ca phe' });
    const second = await request(app)
      .post(`/api/v1/cafes/${cafe.id}/menu/categories`)
      .set('Authorization', token)
      .send({ name: 'Tra sua' });

    expect(first.status).toBe(201);
    expect(first.body.data.displayOrder).toBe(0);
    expect(first.body.data.itemCount).toBe(0);
    expect(second.body.data.displayOrder).toBe(1);
  });

  it('đổi tên danh mục thành công', async () => {
    const { cafe, token } = await setupProviderCafe();
    const category = await insertCategory(cafe.id, 'Ca phe');

    const res = await request(app)
      .patch(`/api/v1/cafes/${cafe.id}/menu/categories/${category.id}`)
      .set('Authorization', token)
      .send({ name: 'Ca phe & Tra' });

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Ca phe & Tra');
  });
});

// ── T013: ràng buộc tên ───────────────────────────────────────────────────────

describe('Menu categories — ràng buộc tên', () => {
  it('từ chối tên rỗng hoặc chỉ có khoảng trắng', async () => {
    const { cafe, token } = await setupProviderCafe();

    for (const name of ['', '   ']) {
      const res = await request(app)
        .post(`/api/v1/cafes/${cafe.id}/menu/categories`)
        .set('Authorization', token)
        .send({ name });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    }
  });

  it('từ chối tên dài hơn 50 ký tự', async () => {
    const { cafe, token } = await setupProviderCafe();

    const res = await request(app)
      .post(`/api/v1/cafes/${cafe.id}/menu/categories`)
      .set('Authorization', token)
      .send({ name: 'a'.repeat(51) });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('từ chối trùng tên khác hoa-thường và có khoảng trắng thừa', async () => {
    const { cafe, token } = await setupProviderCafe();
    await insertCategory(cafe.id, 'Ca phe');

    const res = await request(app)
      .post(`/api/v1/cafes/${cafe.id}/menu/categories`)
      .set('Authorization', token)
      .send({ name: '  ca phe  ' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CATEGORY_NAME_DUPLICATE');
  });

  it('CHO PHÉP tạo lại tên trùng với danh mục đã xóa mềm', async () => {
    const { cafe, token } = await setupProviderCafe();
    const category = await insertCategory(cafe.id, 'Ca phe');

    const removed = await request(app)
      .delete(`/api/v1/cafes/${cafe.id}/menu/categories/${category.id}`)
      .set('Authorization', token);
    expect(removed.status).toBe(204);

    // Partial unique index có WHERE deleted_at IS NULL — thiếu mệnh đề này sẽ fail
    const recreated = await request(app)
      .post(`/api/v1/cafes/${cafe.id}/menu/categories`)
      .set('Authorization', token)
      .send({ name: 'Ca phe' });

    expect(recreated.status).toBe(201);
    expect(recreated.body.data.name).toBe('Ca phe');
  });

  it('cho phép trùng tên giữa hai chi nhánh khác nhau', async () => {
    const { provider, cafe, token } = await setupProviderCafe();
    const otherCafe = await createTestCafe({ provider_id: provider.id, status: 'ACTIVE' });
    await insertCategory(cafe.id, 'Ca phe');

    const res = await request(app)
      .post(`/api/v1/cafes/${otherCafe.id}/menu/categories`)
      .set('Authorization', token)
      .send({ name: 'Ca phe' });

    expect(res.status).toBe(201);
  });

  it('từ chối khi đã đủ 30 danh mục', async () => {
    const { cafe, token } = await setupProviderCafe();
    for (let i = 0; i < 30; i += 1) {
      await insertCategory(cafe.id, `Danh muc ${i}`, i);
    }

    const res = await request(app)
      .post(`/api/v1/cafes/${cafe.id}/menu/categories`)
      .set('Authorization', token)
      .send({ name: 'Vuot gioi han' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CATEGORY_LIMIT_EXCEEDED');
  });
});

// ── T014: xóa và sắp xếp ──────────────────────────────────────────────────────

describe('Menu categories — xóa và sắp xếp', () => {
  it('CHẶN xóa danh mục còn món, trả 409 kèm details.itemCount', async () => {
    const { cafe, token } = await setupProviderCafe();
    const category = await insertCategory(cafe.id, 'Ca phe');
    await insertItem(cafe.id, 'Mon 1', category.id);
    await insertItem(cafe.id, 'Mon 2', category.id);

    const res = await request(app)
      .delete(`/api/v1/cafes/${cafe.id}/menu/categories/${category.id}`)
      .set('Authorization', token);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CATEGORY_NOT_EMPTY');
    expect(res.body.details).toEqual({ itemCount: 2 });
  });

  it('CHẶN xóa cả khi danh mục chỉ còn món tạm ngưng bán', async () => {
    const { cafe, token } = await setupProviderCafe();
    const category = await insertCategory(cafe.id, 'Ca phe');
    await insertItem(cafe.id, 'Mon tam an', category.id, false);

    const res = await request(app)
      .delete(`/api/v1/cafes/${cafe.id}/menu/categories/${category.id}`)
      .set('Authorization', token);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CATEGORY_NOT_EMPTY');
    expect(res.body.details).toEqual({ itemCount: 1 });
  });

  it('xóa danh mục rỗng thành công và biến mất khỏi list', async () => {
    const { cafe, token } = await setupProviderCafe();
    const category = await insertCategory(cafe.id, 'Ca phe');

    const removed = await request(app)
      .delete(`/api/v1/cafes/${cafe.id}/menu/categories/${category.id}`)
      .set('Authorization', token);
    expect(removed.status).toBe(204);

    const [row] = await AppDataSource.query<{ deleted_at: Date | null }[]>(
      `SELECT deleted_at FROM menu_categories WHERE id = $1`,
      [category.id],
    );
    expect(row.deleted_at).not.toBeNull();

    const list = await request(app)
      .get(`/api/v1/cafes/${cafe.id}/menu/categories`)
      .set('Authorization', token);
    expect(list.body.data).toEqual([]);
  });

  it('reorder gán lại display_order 0..N-1 theo đúng thứ tự mảng', async () => {
    const { cafe, token } = await setupProviderCafe();
    const a = await insertCategory(cafe.id, 'A', 0);
    const b = await insertCategory(cafe.id, 'B', 1);
    const c = await insertCategory(cafe.id, 'C', 2);

    const res = await request(app)
      .patch(`/api/v1/cafes/${cafe.id}/menu/categories/reorder`)
      .set('Authorization', token)
      .send({ category_ids: [c.id, a.id, b.id] });

    expect(res.status).toBe(200);
    expect(res.body.data.map((x: { name: string }) => x.name)).toEqual(['C', 'A', 'B']);
    expect(res.body.data.map((x: { displayOrder: number }) => x.displayOrder)).toEqual([0, 1, 2]);
  });

  it('reorder từ chối mảng thiếu, thừa hoặc trùng id', async () => {
    const { cafe, token } = await setupProviderCafe();
    const a = await insertCategory(cafe.id, 'A', 0);
    const b = await insertCategory(cafe.id, 'B', 1);

    const missing = await request(app)
      .patch(`/api/v1/cafes/${cafe.id}/menu/categories/reorder`)
      .set('Authorization', token)
      .send({ category_ids: [a.id] });
    expect(missing.status).toBe(400);

    const duplicated = await request(app)
      .patch(`/api/v1/cafes/${cafe.id}/menu/categories/reorder`)
      .set('Authorization', token)
      .send({ category_ids: [a.id, a.id] });
    expect(duplicated.status).toBe(400);

    const unknown = await request(app)
      .patch(`/api/v1/cafes/${cafe.id}/menu/categories/reorder`)
      .set('Authorization', token)
      .send({ category_ids: [a.id, b.id, '00000000-0000-0000-0000-000000000000'] });
    expect(unknown.status).toBe(400);
  });
});

// ── T015: phân quyền và cô lập chi nhánh ──────────────────────────────────────

describe('Menu categories — phân quyền', () => {
  it('Provider không sở hữu chi nhánh bị chặn trên mọi endpoint ghi', async () => {
    const { cafe } = await setupProviderCafe();
    const outsider = await createTestUser({ role: UserRole.PROVIDER });
    await activateProvider(outsider.id);
    const outsiderToken = `Bearer ${generateToken(outsider)}`;
    const category = await insertCategory(cafe.id, 'Ca phe');

    const created = await request(app)
      .post(`/api/v1/cafes/${cafe.id}/menu/categories`)
      .set('Authorization', outsiderToken)
      .send({ name: 'Xam nhap' });
    expect(created.status).toBe(403);

    const updated = await request(app)
      .patch(`/api/v1/cafes/${cafe.id}/menu/categories/${category.id}`)
      .set('Authorization', outsiderToken)
      .send({ name: 'Xam nhap' });
    expect(updated.status).toBe(403);

    const removed = await request(app)
      .delete(`/api/v1/cafes/${cafe.id}/menu/categories/${category.id}`)
      .set('Authorization', outsiderToken);
    expect(removed.status).toBe(403);
  });

  it('Staff và Customer bị chặn trên endpoint ghi', async () => {
    const { cafe } = await setupProviderCafe();

    for (const role of [UserRole.STAFF, UserRole.CUSTOMER]) {
      const user = await createTestUser({ role });
      const res = await request(app)
        .post(`/api/v1/cafes/${cafe.id}/menu/categories`)
        .set('Authorization', `Bearer ${generateToken(user)}`)
        .send({ name: 'Khong duoc phep' });
      expect(res.status).toBe(403);
    }
  });

  it('thao tác lên danh mục của chi nhánh khác trả 404, không tiết lộ tồn tại', async () => {
    const { provider, cafe, token } = await setupProviderCafe();
    const otherCafe = await createTestCafe({ provider_id: provider.id, status: 'ACTIVE' });
    const categoryOfOther = await insertCategory(otherCafe.id, 'Cua chi nhanh khac');

    const res = await request(app)
      .patch(`/api/v1/cafes/${cafe.id}/menu/categories/${categoryOfOther.id}`)
      .set('Authorization', token)
      .send({ name: 'Doi ten' });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('CATEGORY_NOT_FOUND');
  });

  it('khách chưa đăng nhập vẫn xem được danh mục của cafe ACTIVE', async () => {
    const { cafe } = await setupProviderCafe();
    await insertCategory(cafe.id, 'Ca phe');

    const res = await request(app).get(`/api/v1/cafes/${cafe.id}/menu/categories`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });
});
