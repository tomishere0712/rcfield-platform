jest.mock('../../services/cloudinary.service', () => ({
  uploadImage: jest.fn().mockResolvedValue({
    publicId: 'rcfield/cafes/test/images/test-1',
    url: 'https://res.cloudinary.com/demo/image/upload/v1/test.png',
  }),
  deleteImage: jest.fn().mockResolvedValue(undefined),
  extractPublicIdFromUrl: jest.fn().mockReturnValue('rcfield/cafes/test/images/test-1'),
}));

import request from 'supertest';
import { app } from '../../app';
import { AppDataSource } from '../../config/database';
import { CafeStatus, ProviderStatus, SubscriptionStatus, UserRole } from '../../types';
import { createTestCafe, createTestUser, generateToken } from '../helpers';

const { uploadImage, deleteImage } = jest.requireMock('../../services/cloudinary.service') as {
  uploadImage: jest.Mock;
  deleteImage: jest.Mock;
};

async function activateProvider(providerId: string): Promise<void> {
  await AppDataSource.query(
    `INSERT INTO provider_profiles (user_id, business_name, registration_status)
     VALUES ($1, $2, $3)`,
    [providerId, 'Test RC Business', ProviderStatus.ACTIVE],
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

describe('Cafe images', () => {
  it('provider ACTIVE upload nhiều ảnh trong 1 request', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    await activateProvider(provider.id);
    const cafe = await createTestCafe({ provider_id: provider.id, status: CafeStatus.ACTIVE });

    const res = await request(app)
      .post(`/api/v1/cafes/${cafe.id}/images`)
      .set('Authorization', `Bearer ${generateToken(provider)}`)
      .field('sort_order', '2')
      .attach('files', Buffer.from('fake-image-1'), {
        filename: 'track-1.png',
        contentType: 'image/png',
      })
      .attach('files', Buffer.from('fake-image-2'), {
        filename: 'track-2.png',
        contentType: 'image/png',
      });

    expect(res.status).toBe(201);
    expect(uploadImage).toHaveBeenCalledTimes(2);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].sortOrder).toBe(2);
    expect(res.body.data[1].sortOrder).toBe(3);

    const rows = await AppDataSource.query<
      {
        cafe_id: string;
        sort_order: number;
        url: string;
      }[]
    >(`SELECT cafe_id, sort_order, url FROM cafe_images WHERE cafe_id = $1 ORDER BY sort_order`, [
      cafe.id,
    ]);

    expect(rows).toHaveLength(2);
    expect(rows[0].sort_order).toBe(2);
    expect(rows[1].sort_order).toBe(3);
  });

  it('provider chưa ACTIVE bị chặn khi upload ảnh', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    await AppDataSource.query(
      `INSERT INTO provider_profiles (user_id, business_name, registration_status)
       VALUES ($1, $2, $3)`,
      [provider.id, 'Pending RC Business', ProviderStatus.PENDING],
    );
    const cafe = await createTestCafe({ provider_id: provider.id, status: CafeStatus.ACTIVE });

    const res = await request(app)
      .post(`/api/v1/cafes/${cafe.id}/images`)
      .set('Authorization', `Bearer ${generateToken(provider)}`)
      .attach('files', Buffer.from('fake-image-1'), {
        filename: 'track-1.png',
        contentType: 'image/png',
      });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ACCOUNT_NOT_ACTIVE');
  });

  it('provider không sở hữu cafe không upload được', async () => {
    const owner = await createTestUser({ role: UserRole.PROVIDER });
    const other = await createTestUser({ role: UserRole.PROVIDER });
    await activateProvider(owner.id);
    await activateProvider(other.id);
    const cafe = await createTestCafe({ provider_id: owner.id, status: CafeStatus.ACTIVE });

    const res = await request(app)
      .post(`/api/v1/cafes/${cafe.id}/images`)
      .set('Authorization', `Bearer ${generateToken(other)}`)
      .attach('files', Buffer.from('fake-image-1'), {
        filename: 'track-1.png',
        contentType: 'image/png',
      });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('list ảnh trả về đúng thứ tự và delete xóa được', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    await activateProvider(provider.id);
    const cafe = await createTestCafe({ provider_id: provider.id, status: CafeStatus.ACTIVE });

    const created = await request(app)
      .post(`/api/v1/cafes/${cafe.id}/images`)
      .set('Authorization', `Bearer ${generateToken(provider)}`)
      .field('sort_order', '5')
      .attach('files', Buffer.from('fake-image-1'), {
        filename: 'track-1.png',
        contentType: 'image/png',
      });

    expect(created.status).toBe(201);

    const listed = await request(app).get(`/api/v1/cafes/${cafe.id}/images`);
    expect(listed.status).toBe(200);
    expect(listed.body.data).toHaveLength(1);
    expect(listed.body.data[0].sortOrder).toBe(5);

    const deleteRes = await request(app)
      .delete(`/api/v1/cafe-images/${created.body.data[0].id}`)
      .set('Authorization', `Bearer ${generateToken(provider)}`);

    expect(deleteRes.status).toBe(204);
    expect(deleteImage).toHaveBeenCalled();
  });
});
