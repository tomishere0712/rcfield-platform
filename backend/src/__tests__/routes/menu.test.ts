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
    [providerId, 'Provider Menu Test', ProviderStatus.ACTIVE],
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

async function createMenuItem(
  cafeId: string,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; name: string }> {
  const body = {
    name: 'Cold Brew Nitro',
    description: 'Ca phe lanh nitro',
    price: 55000,
    category_id: null as string | null,
    image_url: null,
    is_available: true,
    ...overrides,
  };

  const [item] = await AppDataSource.query(
    `INSERT INTO menu_items
       (cafe_id, name, description, price, category_id, image_url, is_available)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING id, name`,
    [
      cafeId,
      body.name,
      body.description,
      body.price,
      body.category_id,
      body.image_url,
      body.is_available,
    ],
  );
  return item;
}

/** Tạo một danh mục cho cafe, trả về id — dùng trong test gán/lọc danh mục. */
async function createMenuCategory(
  cafeId: string,
  name = 'Do uong',
  displayOrder = 0,
): Promise<{ id: string; name: string }> {
  const [category] = await AppDataSource.query(
    `INSERT INTO menu_categories (cafe_id, name, display_order)
     VALUES ($1,$2,$3)
     RETURNING id, name`,
    [cafeId, name, displayOrder],
  );
  return category;
}

describe('Menu routes', () => {
  it('provider list menu của cafe mình sở hữu với meta phân trang', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    await activateProvider(provider.id);
    const cafe = await createTestCafe({ provider_id: provider.id });
    await createMenuItem(cafe.id, { name: 'Bac xiu', is_available: true });
    await createMenuItem(cafe.id, {
      name: 'Snack bo cay',
      is_available: false,
    });

    const res = await request(app)
      .get(`/api/v1/cafes/${cafe.id}/menu?page=1&limit=10`)
      .set('Authorization', `Bearer ${generateToken(provider)}`);

    expect(res.status).toBe(200);
    expect(res.body.meta).toMatchObject({ total: 2, page: 1, limit: 10 });
    expect(res.body.data.map((item: { name: string }) => item.name)).toEqual(
      expect.arrayContaining(['Bac xiu', 'Snack bo cay']),
    );
  });

  it('public list chỉ thấy món đang bán của cafe ACTIVE', async () => {
    const cafe = await createTestCafe({ status: 'ACTIVE' });
    await createMenuItem(cafe.id, { name: 'Tra dao', is_available: true });
    await createMenuItem(cafe.id, { name: 'Mon tam an', is_available: false });

    const res = await request(app).get(`/api/v1/cafes/${cafe.id}/menu`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('Tra dao');
  });

  it('provider create item hợp lệ', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    await activateProvider(provider.id);
    const cafe = await createTestCafe({ provider_id: provider.id });

    const res = await request(app)
      .post(`/api/v1/cafes/${cafe.id}/menu`)
      .set('Authorization', `Bearer ${generateToken(provider)}`)
      .send({
        name: 'Matcha Latte',
        description: 'Matcha sua tuoi',
        price: 49000,
        image_url: 'https://cdn.rcfield.vn/menu/matcha.jpg',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.cafeId).toBe(cafe.id);
    expect(res.body.data.isAvailable).toBe(true);
    expect(res.body.data.price).toBe('49000.00');
  });

  it('provider update partial và toggle is_available', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    await activateProvider(provider.id);
    const cafe = await createTestCafe({ provider_id: provider.id });
    const item = await createMenuItem(cafe.id);

    const res = await request(app)
      .patch(`/api/v1/cafes/${cafe.id}/menu/${item.id}`)
      .set('Authorization', `Bearer ${generateToken(provider)}`)
      .send({ price: 60000, is_available: false });

    expect(res.status).toBe(200);
    expect(res.body.data.price).toBe('60000.00');
    expect(res.body.data.isAvailable).toBe(false);
  });

  it('provider soft-delete item và list không còn thấy item đó', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    await activateProvider(provider.id);
    const cafe = await createTestCafe({ provider_id: provider.id });
    const item = await createMenuItem(cafe.id);

    const deleted = await request(app)
      .delete(`/api/v1/cafes/${cafe.id}/menu/${item.id}`)
      .set('Authorization', `Bearer ${generateToken(provider)}`);

    expect(deleted.status).toBe(204);

    const listed = await request(app)
      .get(`/api/v1/cafes/${cafe.id}/menu`)
      .set('Authorization', `Bearer ${generateToken(provider)}`);

    expect(listed.status).toBe(200);
    expect(listed.body.data).toHaveLength(0);
  });

  it('provider không mutate cafe hoặc item của người khác', async () => {
    const owner = await createTestUser({ role: UserRole.PROVIDER });
    const other = await createTestUser({ role: UserRole.PROVIDER });
    await activateProvider(owner.id);
    await activateProvider(other.id);
    const cafe = await createTestCafe({ provider_id: owner.id });
    const item = await createMenuItem(cafe.id);

    const listAllowed = await request(app)
      .get(`/api/v1/cafes/${cafe.id}/menu`)
      .set('Authorization', `Bearer ${generateToken(other)}`);
    const createDenied = await request(app)
      .post(`/api/v1/cafes/${cafe.id}/menu`)
      .set('Authorization', `Bearer ${generateToken(other)}`)
      .send({ name: 'Other item', price: 10000 });
    const updateDenied = await request(app)
      .patch(`/api/v1/cafes/${cafe.id}/menu/${item.id}`)
      .set('Authorization', `Bearer ${generateToken(other)}`)
      .send({ name: 'Hacked' });
    const deleteDenied = await request(app)
      .delete(`/api/v1/cafes/${cafe.id}/menu/${item.id}`)
      .set('Authorization', `Bearer ${generateToken(other)}`);

    expect(listAllowed.status).toBe(200);
    expect(createDenied.status).toBe(403);
    expect(updateDenied.status).toBe(403);
    expect(deleteDenied.status).toBe(403);
  });

  it('validate body và params cho menu CRUD', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    await activateProvider(provider.id);
    const cafe = await createTestCafe({ provider_id: provider.id });
    const item = await createMenuItem(cafe.id);

    const invalidPrice = await request(app)
      .post(`/api/v1/cafes/${cafe.id}/menu`)
      .set('Authorization', `Bearer ${generateToken(provider)}`)
      .send({ name: 'A', price: -1 });
    expect(invalidPrice.status).toBe(400);
    expect(invalidPrice.body.code).toBe('VALIDATION_ERROR');

    const invalidUrl = await request(app)
      .patch(`/api/v1/cafes/${cafe.id}/menu/${item.id}`)
      .set('Authorization', `Bearer ${generateToken(provider)}`)
      .send({ image_url: 'not-a-url' });
    expect(invalidUrl.status).toBe(400);
    expect(invalidUrl.body.code).toBe('VALIDATION_ERROR');

    const invalidUuid = await request(app)
      .get('/api/v1/cafes/not-a-uuid/menu')
      .set('Authorization', `Bearer ${generateToken(provider)}`);
    expect(invalidUuid.status).toBe(400);
    expect(invalidUuid.body.code).toBe('VALIDATION_ERROR');
  });
});

describe('Menu items — gán danh mục (US2)', () => {
  it('response trả categoryId + categoryName, không còn trường category', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    await activateProvider(provider.id);
    const cafe = await createTestCafe({ provider_id: provider.id });
    const category = await createMenuCategory(cafe.id, 'Do uong');

    const res = await request(app)
      .post(`/api/v1/cafes/${cafe.id}/menu`)
      .set('Authorization', `Bearer ${generateToken(provider)}`)
      .send({ name: 'Tra dao', price: 45000, category_id: category.id });

    expect(res.status).toBe(201);
    expect(res.body.data.categoryId).toBe(category.id);
    expect(res.body.data.categoryName).toBe('Do uong');
    expect(res.body.data).not.toHaveProperty('category');
  });

  it('không truyền category_id thì món thuộc "Chưa phân loại"', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    await activateProvider(provider.id);
    const cafe = await createTestCafe({ provider_id: provider.id });

    const res = await request(app)
      .post(`/api/v1/cafes/${cafe.id}/menu`)
      .set('Authorization', `Bearer ${generateToken(provider)}`)
      .send({ name: 'Banh mi', price: 25000 });

    expect(res.status).toBe(201);
    expect(res.body.data.categoryId).toBeNull();
    expect(res.body.data.categoryName).toBeNull();
  });

  it('gán danh mục của chi nhánh khác bị từ chối INVALID_CATEGORY', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    await activateProvider(provider.id);
    const cafeA = await createTestCafe({ provider_id: provider.id });
    const cafeB = await createTestCafe({ provider_id: provider.id });
    const categoryB = await createMenuCategory(cafeB.id, 'Do uong');

    const res = await request(app)
      .post(`/api/v1/cafes/${cafeA.id}/menu`)
      .set('Authorization', `Bearer ${generateToken(provider)}`)
      .send({ name: 'Tra dao', price: 45000, category_id: categoryB.id });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_CATEGORY');
  });

  it('lọc ?category_id=<uuid> trả đúng món của danh mục đó', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    await activateProvider(provider.id);
    const cafe = await createTestCafe({ provider_id: provider.id });
    const drink = await createMenuCategory(cafe.id, 'Do uong');
    await createMenuItem(cafe.id, { name: 'Tra dao', category_id: drink.id });
    await createMenuItem(cafe.id, { name: 'Banh mi' });

    const res = await request(app)
      .get(`/api/v1/cafes/${cafe.id}/menu?category_id=${drink.id}`)
      .set('Authorization', `Bearer ${generateToken(provider)}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('Tra dao');
  });

  it('lọc ?category_id=none trả đúng món chưa phân loại', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    await activateProvider(provider.id);
    const cafe = await createTestCafe({ provider_id: provider.id });
    const drink = await createMenuCategory(cafe.id, 'Do uong');
    await createMenuItem(cafe.id, { name: 'Tra dao', category_id: drink.id });
    await createMenuItem(cafe.id, { name: 'Banh mi' });

    const res = await request(app)
      .get(`/api/v1/cafes/${cafe.id}/menu?category_id=none`)
      .set('Authorization', `Bearer ${generateToken(provider)}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('Banh mi');
  });

  it('món chưa phân loại xếp sau món có danh mục', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    await activateProvider(provider.id);
    const cafe = await createTestCafe({ provider_id: provider.id });
    const drink = await createMenuCategory(cafe.id, 'Do uong');
    // Tên đặt ngược thứ tự alphabet để chắc chắn thứ tự đến từ danh mục
    await createMenuItem(cafe.id, { name: 'AAA chua phan loai' });
    await createMenuItem(cafe.id, { name: 'ZZZ co danh muc', category_id: drink.id });

    const res = await request(app)
      .get(`/api/v1/cafes/${cafe.id}/menu`)
      .set('Authorization', `Bearer ${generateToken(provider)}`);

    expect(res.status).toBe(200);
    expect(res.body.data.map((i: { name: string }) => i.name)).toEqual([
      'ZZZ co danh muc',
      'AAA chua phan loai',
    ]);
  });
});

describe('Combo — Provider tự gán danh mục (US2, FR-013)', () => {
  async function setupComboFixture() {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    await activateProvider(provider.id);
    const cafe = await createTestCafe({ provider_id: provider.id });
    const itemA = await createMenuItem(cafe.id, { name: 'Tra dao' });
    const itemB = await createMenuItem(cafe.id, { name: 'Banh mi' });
    return { provider, cafe, itemA, itemB };
  }

  it('combo giữ đúng danh mục Provider gán, KHÔNG bị ép "COMBO"', async () => {
    const { provider, cafe, itemA, itemB } = await setupComboFixture();
    const snack = await createMenuCategory(cafe.id, 'An vat');

    const res = await request(app)
      .post(`/api/v1/cafes/${cafe.id}/menu/combos`)
      .set('Authorization', `Bearer ${generateToken(provider)}`)
      .send({
        name: 'Combo tiet kiem',
        price: 89000,
        category_id: snack.id,
        components: [
          { item_id: itemA.id, quantity: 1 },
          { item_id: itemB.id, quantity: 1 },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.data.categoryId).toBe(snack.id);
    expect(res.body.data.categoryName).toBe('An vat');
    expect(res.body.data.isCombo).toBe(true);
    expect(res.body.data.components).toHaveLength(2);
  });

  it('combo không truyền category_id thì thuộc "Chưa phân loại" nhưng vẫn là combo', async () => {
    const { provider, cafe, itemA, itemB } = await setupComboFixture();

    const res = await request(app)
      .post(`/api/v1/cafes/${cafe.id}/menu/combos`)
      .set('Authorization', `Bearer ${generateToken(provider)}`)
      .send({
        name: 'Combo khong danh muc',
        price: 79000,
        components: [
          { item_id: itemA.id, quantity: 1 },
          { item_id: itemB.id, quantity: 1 },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.data.categoryId).toBeNull();
    expect(res.body.data.isCombo).toBe(true);
  });

  it('luật combo cũ không đổi: cấm lồng combo và tối thiểu 2 thành phần', async () => {
    const { provider, cafe, itemA, itemB } = await setupComboFixture();
    const token = `Bearer ${generateToken(provider)}`;

    const created = await request(app)
      .post(`/api/v1/cafes/${cafe.id}/menu/combos`)
      .set('Authorization', token)
      .send({
        name: 'Combo goc',
        price: 89000,
        components: [
          { item_id: itemA.id, quantity: 1 },
          { item_id: itemB.id, quantity: 1 },
        ],
      });
    expect(created.status).toBe(201);

    const nested = await request(app)
      .post(`/api/v1/cafes/${cafe.id}/menu/combos`)
      .set('Authorization', token)
      .send({
        name: 'Combo long nhau',
        price: 99000,
        components: [
          { item_id: created.body.data.id, quantity: 1 },
          { item_id: itemA.id, quantity: 1 },
        ],
      });
    expect(nested.status).toBe(400);
    expect(nested.body.code).toBe('COMBO_IN_COMBO');

    const tooFew = await request(app)
      .post(`/api/v1/cafes/${cafe.id}/menu/combos`)
      .set('Authorization', token)
      .send({
        name: 'Combo mot mon',
        price: 50000,
        components: [{ item_id: itemA.id, quantity: 1 }],
      });
    expect(tooFew.status).toBe(400);
    expect(tooFew.body.code).toBe('VALIDATION_ERROR');
  });

  it('sửa combo bằng endpoint món lẻ bị chặn USE_COMBO_ENDPOINT', async () => {
    const { provider, cafe, itemA, itemB } = await setupComboFixture();
    const token = `Bearer ${generateToken(provider)}`;

    const created = await request(app)
      .post(`/api/v1/cafes/${cafe.id}/menu/combos`)
      .set('Authorization', token)
      .send({
        name: 'Combo goc',
        price: 89000,
        components: [
          { item_id: itemA.id, quantity: 1 },
          { item_id: itemB.id, quantity: 1 },
        ],
      });

    const res = await request(app)
      .patch(`/api/v1/cafes/${cafe.id}/menu/${created.body.data.id}`)
      .set('Authorization', token)
      .send({ price: 95000 });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('USE_COMBO_ENDPOINT');
  });
});
