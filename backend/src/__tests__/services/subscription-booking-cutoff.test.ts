import { AppDataSource } from '../../config/database';
import { getBookingCutoff } from '../../services/subscription.service';
import { SubscriptionPlan } from '../../models/subscription-plan.entity';
import { ProviderSubscription } from '../../models/provider-subscription.entity';
import { SubscriptionStatus, UserRole } from '../../types';
import { createTestUser } from '../helpers';

/**
 * Mốc chặn đặt lịch theo trạng thái gói của provider.
 *
 * Bối cảnh: khi gói hết hạn, hệ thống cho 7 ngày ân hạn rồi xoá mềm toàn bộ chi
 * nhánh. Trước khi có mốc chặn này, suốt 7 ngày đó khách vẫn đặt và trả tiền
 * được cho những ngày SAU khi chi nhánh biến mất — rồi không check-in được và
 * không ai hoàn tiền.
 */

const DAY = 24 * 60 * 60 * 1000;

async function anyPlanId(): Promise<string> {
  const plan = await AppDataSource.getRepository(SubscriptionPlan).findOne({ where: {} });
  if (!plan) throw new Error('Cần ít nhất một subscription_plan trong DB test');
  return plan.id;
}

async function makeProviderWithSubscription(
  status: SubscriptionStatus,
  overrides: Partial<ProviderSubscription> = {},
): Promise<string> {
  const provider = await createTestUser({ role: UserRole.PROVIDER });
  const repo = AppDataSource.getRepository(ProviderSubscription);
  const now = Date.now();

  await repo.save(
    repo.create({
      providerId: provider.id,
      planId: await anyPlanId(),
      status,
      startedAt: new Date(now - 30 * DAY),
      expiresAt: new Date(now + 30 * DAY),
      aiQuotaResetAt: new Date(now + 30 * DAY),
      ...overrides,
    }),
  );

  return provider.id;
}

describe('getBookingCutoff', () => {
  it('không giới hạn khi provider chưa có gói nào', async () => {
    // Cảnh này rất phổ biến trong dữ liệu thật lẫn dữ liệu test: thiếu bản ghi
    // gói là một trạng thái dữ liệu, không phải bằng chứng đã hết hạn. Biến nó
    // thành lỗi cho khách là phạt nhầm người.
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    await expect(getBookingCutoff(provider.id)).resolves.toBeNull();
  });

  it('không giới hạn khi gói đang hoạt động', async () => {
    const providerId = await makeProviderWithSubscription(SubscriptionStatus.ACTIVE);
    await expect(getBookingCutoff(providerId)).resolves.toBeNull();
  });

  it('không giới hạn khi đang dùng thử', async () => {
    const providerId = await makeProviderWithSubscription(SubscriptionStatus.TRIAL);
    await expect(getBookingCutoff(providerId)).resolves.toBeNull();
  });

  it('trong ân hạn thì chặn đúng tại mốc hết ân hạn', async () => {
    const graceEndsAt = new Date(Date.now() + 5 * DAY);
    const providerId = await makeProviderWithSubscription(SubscriptionStatus.GRACE_PERIOD, {
      expiresAt: new Date(Date.now() - 2 * DAY),
      graceEndsAt,
    });

    const cutoff = await getBookingCutoff(providerId);
    expect(cutoff).not.toBeNull();
    expect(cutoff!.getTime()).toBe(graceEndsAt.getTime());
  });

  it('trong ân hạn mà thiếu mốc hết ân hạn thì lùi về ngày hết hạn gói', async () => {
    const expiresAt = new Date(Date.now() - 2 * DAY);
    const providerId = await makeProviderWithSubscription(SubscriptionStatus.GRACE_PERIOD, {
      expiresAt,
      graceEndsAt: null,
    });

    const cutoff = await getBookingCutoff(providerId);
    expect(cutoff!.getTime()).toBe(expiresAt.getTime());
  });

  it('gói đã hết hẳn thì không nhận thêm đơn nào', async () => {
    const providerId = await makeProviderWithSubscription(SubscriptionStatus.EXPIRED, {
      expiresAt: new Date(Date.now() - 10 * DAY),
      graceEndsAt: new Date(Date.now() - 3 * DAY),
    });

    const cutoff = await getBookingCutoff(providerId);
    expect(cutoff).not.toBeNull();
    // Mốc là "ngay bây giờ" nên mọi slot trong tương lai đều bị chặn.
    expect(cutoff!.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
  });
});
