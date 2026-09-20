import request from 'supertest';
import { app } from '../../app';
import { AppDataSource } from '../../config/database';
import { UserRole } from '../../types';
import { createTestCafe, createTestUser, generateToken } from '../helpers';

async function createTestReview(input: {
  cafeId: string;
  customerName?: string;
  rating?: number;
  status?: 'VISIBLE' | 'HIDDEN';
}): Promise<{ id: string }> {
  const customer = await createTestUser({
    role: UserRole.CUSTOMER,
    full_name: input.customerName ?? 'Nguyen Vinh Phuc',
  });
  const [trackType] = await AppDataSource.query<{ id: string }[]>(
    'SELECT id FROM track_types LIMIT 1',
  );
  const [booking] = await AppDataSource.query<{ id: string }[]>(
    `INSERT INTO bookings
       (customer_id, cafe_id, track_type_id, play_mode, source, status, slot_start, slot_end, payment_expires_at)
     VALUES ($1, $2, $3, 'BYOC', 'APP', 'COMPLETED', NOW() - INTERVAL '2 hours', NOW() - INTERVAL '1 hour', NOW())
     RETURNING id`,
    [customer.id, input.cafeId, trackType.id],
  );
  const [review] = await AppDataSource.query<{ id: string }[]>(
    `INSERT INTO reviews (booking_id, cafe_id, customer_id, rating, status, created_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     RETURNING id`,
    [booking.id, input.cafeId, customer.id, input.rating ?? 4, input.status ?? 'VISIBLE'],
  );
  return review;
}

describe('Provider review routes', () => {
  it('trả đúng dữ liệu camelCase, sao và ngày tạo cho Provider sở hữu cơ sở', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    const cafe = await createTestCafe({ provider_id: provider.id });
    await createTestReview({ cafeId: cafe.id, rating: 4 });
    await createTestReview({ cafeId: cafe.id, rating: 2, status: 'HIDDEN' });

    const response = await request(app)
      .get('/api/v1/provider/reviews')
      .query({ cafe_id: cafe.id, status: 'VISIBLE' })
      .set('Authorization', `Bearer ${generateToken(provider)}`)
      .expect(200);

    expect(response.body).toMatchObject({ success: true, total: 1, newSince24h: 1 });
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).toMatchObject({
      cafeId: cafe.id,
      overallScore: 4,
      customerName: 'Nguyen Vinh Phuc',
      status: 'VISIBLE',
    });
    expect(response.body.data[0]).toHaveProperty('createdAt');
    expect(response.body.data[0]).not.toHaveProperty('created_at');
    expect(response.body.data[0]).not.toHaveProperty('rating');
  });

  it('không cho Provider đọc đánh giá của cơ sở thuộc Provider khác', async () => {
    const owner = await createTestUser({ role: UserRole.PROVIDER });
    const otherProvider = await createTestUser({ role: UserRole.PROVIDER });
    const cafe = await createTestCafe({ provider_id: owner.id });
    await createTestReview({ cafeId: cafe.id });

    const response = await request(app)
      .get('/api/v1/provider/reviews')
      .query({ cafe_id: cafe.id })
      .set('Authorization', `Bearer ${generateToken(otherProvider)}`)
      .expect(200);

    expect(response.body).toMatchObject({ success: true, data: [], total: 0, newSince24h: 0 });
  });

  it('từ chối query không hợp lệ trước khi truy vấn cơ sở dữ liệu', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });

    const response = await request(app)
      .get('/api/v1/provider/reviews')
      .query({ cafe_id: "' OR 1=1 --", status: 'INVALID', limit: -1 })
      .set('Authorization', `Bearer ${generateToken(provider)}`)
      .expect(400);

    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('cho Admin xem và đổi trạng thái đánh giá của mọi cơ sở', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    const admin = await createTestUser({ role: UserRole.ADMIN });
    const cafe = await createTestCafe({ provider_id: provider.id });
    const review = await createTestReview({ cafeId: cafe.id });

    const listResponse = await request(app)
      .get('/api/v1/provider/reviews')
      .query({ cafe_id: cafe.id })
      .set('Authorization', `Bearer ${generateToken(admin)}`)
      .expect(200);

    expect(listResponse.body).toMatchObject({ total: 1 });

    const visibilityResponse = await request(app)
      .patch(`/api/v1/provider/reviews/${review.id}/visibility`)
      .set('Authorization', `Bearer ${generateToken(admin)}`)
      .send({ status: 'HIDDEN' })
      .expect(200);

    expect(visibilityResponse.body.data.status).toBe('HIDDEN');
  });
});
