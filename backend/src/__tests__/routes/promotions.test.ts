import request from 'supertest';
import { app } from '../../app';
import { UserRole } from '../../types';
import { createTestCafe, createTestUser, generateToken } from '../helpers';

function promotionBody(overrides: Record<string, unknown> = {}) {
  return {
    code: `DRIFT${Date.now()}`,
    description: 'Ưu đãi đêm drift',
    discount_type: 'PERCENT',
    discount_value: 20,
    max_discount_amount: 50000,
    min_order_amount: 100000,
    max_uses: 100,
    max_uses_per_user: 1,
    applicable_to: 'RENTAL',
    starts_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    is_active: true,
    ...overrides,
  };
}

describe('Promotion routes', () => {
  it('provider CRUD ưu đãi theo chi nhánh mình sở hữu', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    const cafe = await createTestCafe({ provider_id: provider.id });
    const token = generateToken(provider);

    const created = await request(app)
      .post(`/api/v1/cafes/${cafe.id}/promotions`)
      .set('Authorization', `Bearer ${token}`)
      .send(promotionBody({ code: 'DRIFTNIGHT20' }));

    expect(created.status).toBe(201);
    expect(created.body.data.cafeId).toBe(cafe.id);
    expect(created.body.data.code).toBe('DRIFTNIGHT20');

    const listed = await request(app)
      .get(`/api/v1/cafes/${cafe.id}/promotions`)
      .set('Authorization', `Bearer ${token}`);

    expect(listed.status).toBe(200);
    expect(listed.body.data).toHaveLength(1);

    const updated = await request(app)
      .patch(`/api/v1/cafes/${cafe.id}/promotions/${created.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ is_active: false, description: 'Tạm tắt cuối tuần này' });

    expect(updated.status).toBe(200);
    expect(updated.body.data.isActive).toBe(false);

    const deleted = await request(app)
      .delete(`/api/v1/cafes/${cafe.id}/promotions/${created.body.data.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(deleted.status).toBe(204);
  });

  it('provider khác không CRUD được ưu đãi của chi nhánh không sở hữu', async () => {
    const owner = await createTestUser({ role: UserRole.PROVIDER });
    const other = await createTestUser({ role: UserRole.PROVIDER });
    const cafe = await createTestCafe({ provider_id: owner.id });

    const denied = await request(app)
      .post(`/api/v1/cafes/${cafe.id}/promotions`)
      .set('Authorization', `Bearer ${generateToken(other)}`)
      .send(promotionBody());

    expect(denied.status).toBe(403);
  });
});
