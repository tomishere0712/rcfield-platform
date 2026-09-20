import request from 'supertest';
import { app } from '../../app';
import { AppDataSource } from '../../config/database';
import { uploadImage } from '../../services/cloudinary.service';
import { ProviderStatus, SubscriptionStatus, UserRole } from '../../types';
import { createTestCafe, createTestUser, generateToken } from '../helpers';

jest.mock('../../services/cloudinary.service', () => ({
  uploadImage: jest.fn(),
}));

async function activateProvider(providerId: string): Promise<void> {
  await AppDataSource.query(
    `INSERT INTO provider_profiles (user_id, business_name, registration_status)
     VALUES ($1, $2, $3)`,
    [providerId, 'Contest Provider', ProviderStatus.ACTIVE],
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

async function createContestFixture(providerId: string, cafeId: string) {
  const [trackType] = await AppDataSource.query<{ id: string; code: string }[]>(
    `SELECT id, code FROM track_types ORDER BY created_at ASC LIMIT 1`,
  );
  const [contestType] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM contest_types WHERE code = 'PROVIDER_STANDARD' LIMIT 1`,
  );
  const [contestFormat] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM contest_formats WHERE code = 'KNOCKOUT' LIMIT 1`,
  );
  const [contestTemplate] = await AppDataSource.query<
    { id: string; default_config: Record<string, unknown> }[]
  >(`SELECT id, default_config FROM contest_templates WHERE contest_format_id = $1 LIMIT 1`, [
    contestFormat.id,
  ]);

  const [contest] = await AppDataSource.query<{ id: string }[]>(
    `INSERT INTO contests
       (cafe_id, provider_id, name, description, track_type, track_type_id, contest_type_id,
        contest_format_id, contest_template_id, registration_opens_at, registration_closes_at,
        banner_image_url, vehicle_rule, config, starts_at, ends_at, capacity, entry_fee, status, created_by)
     VALUES
       ($1, $2, $3, $4, $5, $6, $7,
        $8, $9, NOW() - INTERVAL '1 day', NOW() + INTERVAL '1 day',
        NULL, $10, $11, NOW() + INTERVAL '1 day', NOW() + INTERVAL '2 day', 32, 0, 'OPEN', $2)
     RETURNING id`,
    [
      cafeId,
      providerId,
      'Contest Banner Test',
      'Contest banner test',
      trackType.code,
      trackType.id,
      contestType.id,
      contestFormat.id,
      contestTemplate.id,
      JSON.stringify({ vehicle_policy: 'RENTAL_ONLY', assignment_policy: 'AT_CHECK_IN' }),
      JSON.stringify(contestTemplate.default_config ?? { format: 'KNOCKOUT' }),
    ],
  );

  await AppDataSource.query(
    `INSERT INTO contest_cafes (contest_id, cafe_id, role, display_order, check_in_enabled)
     VALUES ($1, $2, 'HOST', 0, TRUE)`,
    [contest.id, cafeId],
  );

  return { contestId: contest.id };
}

describe('Contest banner upload', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uploads banner and updates contest banner_image_url', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    await activateProvider(provider.id);
    const cafe = await createTestCafe({ provider_id: provider.id });
    const token = generateToken(provider);
    const { contestId } = await createContestFixture(provider.id, cafe.id);

    (uploadImage as jest.Mock).mockResolvedValue({
      publicId: 'contest-banner-test',
      url: 'https://res.cloudinary.com/test/image/upload/contest-banner-test.png',
    });

    const res = await request(app)
      .post(`/api/v1/contests/${contestId}/banner`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('fake-image-content'), {
        filename: 'banner.png',
        contentType: 'image/png',
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.banner_image_url).toBe(
      'https://res.cloudinary.com/test/image/upload/contest-banner-test.png',
    );

    const [updated] = await AppDataSource.query<{ banner_image_url: string }[]>(
      `SELECT banner_image_url FROM contests WHERE id = $1`,
      [contestId],
    );
    expect(updated.banner_image_url).toBe(
      'https://res.cloudinary.com/test/image/upload/contest-banner-test.png',
    );
  });

  it('rejects unsupported file type', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    await activateProvider(provider.id);
    const cafe = await createTestCafe({ provider_id: provider.id });
    const token = generateToken(provider);
    const { contestId } = await createContestFixture(provider.id, cafe.id);

    await request(app)
      .post(`/api/v1/contests/${contestId}/banner`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('fake-text-content'), {
        filename: 'banner.txt',
        contentType: 'text/plain',
      })
      .expect(422);
  });
});
