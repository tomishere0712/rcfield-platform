import { AppDataSource } from '../../config/database';

// Cổng PayOS bị chặn ở biên: test kiểm luật nghiệp vụ của mình, không kiểm
// mạng của họ. Mock cả module để không có lời gọi ra ngoài nào lọt qua.
jest.mock('../../services/payos.service', () => ({
  generateOrderCode: jest.fn(() => 111222333),
  buildDescription: jest.fn(() => 'RCField Test'),
  createCheckout: jest.fn(async () => 'https://pay.payos.vn/web/test'),
  cancelCheckout: jest.fn(async () => undefined),
  getCheckoutStatus: jest.fn(async () => 'PAID'),
}));

import * as payosService from '../../services/payos.service';
import {
  cancelContestFeeOrder,
  confirmContestFeeOrder,
  createContestFeeOrder,
  createContestFeePayOSLink,
  findContestFeeOrderByPayOSCode,
  listContestFeePlans,
  markContestFeeOrderPaidViaPayOS,
  markContestFeePayOSFailed,
  rejectContestFeeOrder,
  submitContestFeeTransfer,
  verifyContestFeePayOS,
} from '../../services/contest-fee.service';
import {
  getActiveFeaturedPopup,
  listPendingFeaturedPopups,
  reviewFeaturedPopup,
} from '../../services/featured-popup.service';
import { changeContestStatus } from '../../services/contest/contests-crud';
import {
  ContestFeeOrderStatus,
  ContestStatus,
  FeaturedPopupReviewStatus,
  ProviderStatus,
  SubscriptionStatus,
  UserRole,
} from '../../types';
import { createTestCafe, createTestUser } from '../helpers';

type Viewer = { userId: string; role: UserRole };

async function activateProvider(providerId: string): Promise<void> {
  await AppDataSource.query(
    `INSERT INTO provider_profiles (user_id, business_name, registration_status)
     VALUES ($1, $2, $3)`,
    [providerId, 'Contest Fee Provider', ProviderStatus.ACTIVE],
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

async function createDraftContest(providerId: string, cafeId: string): Promise<string> {
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

  const [contest] = await AppDataSource.query<{ id: string }[]>(
    `INSERT INTO contests
       (cafe_id, provider_id, name, track_type, track_type_id, contest_type_id,
        contest_format_id, contest_template_id, registration_opens_at, registration_closes_at,
        vehicle_rule, config, starts_at, ends_at, capacity, entry_fee, status, created_by)
     VALUES
       ($1, $2, 'Giải test phí', $3, $4, $5,
        $6, $7, NOW() - INTERVAL '1 day', NOW() + INTERVAL '5 day',
        $8, $9, NOW() + INTERVAL '7 day', NOW() + INTERVAL '8 day', 8, 0, 'DRAFT', $2)
     RETURNING id`,
    [
      cafeId,
      providerId,
      trackType.code,
      trackType.id,
      contestType.id,
      contestFormat.id,
      contestTemplate.id,
      JSON.stringify({ vehicle_policy: 'BYOC_ONLY', assignment_policy: 'AT_CHECK_IN' }),
      JSON.stringify({ format: 'KNOCKOUT', runtime_format: 'KNOCKOUT' }),
    ],
  );

  await AppDataSource.query(
    `INSERT INTO contest_cafes (contest_id, cafe_id, role, display_order, check_in_enabled)
     VALUES ($1, $2, 'HOST', 0, TRUE)`,
    [contest.id, cafeId],
  );
  return contest.id;
}

describe('phí tổ chức giải', () => {
  let provider: { id: string; email: string };
  let admin: { id: string };
  let viewer: Viewer;
  let contestId: string;
  let basicPlanId: string;
  let featuredPlanId: string;

  beforeEach(async () => {
    provider = await createTestUser({ role: UserRole.PROVIDER });
    admin = await createTestUser({ role: UserRole.ADMIN });
    viewer = { userId: provider.id, role: UserRole.PROVIDER };
    await activateProvider(provider.id);
    const cafe = await createTestCafe({ provider_id: provider.id });
    contestId = await createDraftContest(provider.id, cafe.id);

    const plans = await listContestFeePlans();
    basicPlanId = plans.find((plan) => plan.code === 'BASIC')!.id;
    featuredPlanId = plans.find((plan) => plan.code === 'FEATURED')!.id;
  });

  it('chưa trả phí thì không mở đăng ký được', async () => {
    await expect(changeContestStatus(contestId, viewer, ContestStatus.OPEN)).rejects.toMatchObject({
      code: 'CONTEST_FEE_REQUIRED',
      statusCode: 402,
    });
  });

  it('mới khai báo chuyển khoản, chưa được duyệt thì vẫn chưa mở được', async () => {
    await createContestFeeOrder(contestId, viewer, basicPlanId);
    await submitContestFeeTransfer(contestId, viewer, {
      transfer_reference: 'FT123456',
      transfer_date: '2026-08-04',
      transfer_amount: 200000,
    });

    await expect(changeContestStatus(contestId, viewer, ContestStatus.OPEN)).rejects.toMatchObject({
      code: 'CONTEST_FEE_REQUIRED',
    });
  });

  it('admin xác nhận xong thì mở đăng ký được', async () => {
    const order = await createContestFeeOrder(contestId, viewer, basicPlanId);
    await submitContestFeeTransfer(contestId, viewer, {
      transfer_reference: 'FT123456',
      transfer_date: '2026-08-04',
      transfer_amount: 200000,
    });
    await confirmContestFeeOrder(order.id, admin.id);

    const updated = await changeContestStatus(contestId, viewer, ContestStatus.OPEN);
    expect(updated.status).toBe(ContestStatus.OPEN);
  });

  it('gói nổi bật sinh suất quảng bá ở trạng thái chờ duyệt nội dung', async () => {
    const order = await createContestFeeOrder(contestId, viewer, featuredPlanId);
    expect(order.featured_days).toBe(7);
    await submitContestFeeTransfer(contestId, viewer, {
      transfer_reference: 'FT999',
      transfer_date: '2026-08-04',
      transfer_amount: 500000,
    });
    await confirmContestFeeOrder(order.id, admin.id);

    const [popup] = await AppDataSource.query<
      { review_status: string; is_active: boolean; contest_id: string }[]
    >(`SELECT review_status, is_active, contest_id FROM featured_popups WHERE contest_id = $1`, [
      contestId,
    ]);
    // Trả tiền xong KHÔNG đồng nghĩa nội dung tự lên trang chủ.
    expect(popup.review_status).toBe(FeaturedPopupReviewStatus.PENDING);
    expect(popup.is_active).toBe(false);
  });

  it('gói cơ bản không sinh suất quảng bá', async () => {
    const order = await createContestFeeOrder(contestId, viewer, basicPlanId);
    await submitContestFeeTransfer(contestId, viewer, {
      transfer_reference: 'FT111',
      transfer_date: '2026-08-04',
      transfer_amount: 200000,
    });
    await confirmContestFeeOrder(order.id, admin.id);

    const rows = await AppDataSource.query(`SELECT id FROM featured_popups WHERE contest_id = $1`, [
      contestId,
    ]);
    expect(rows).toHaveLength(0);
  });

  it('bị từ chối thì đặt lại đơn khác được', async () => {
    const order = await createContestFeeOrder(contestId, viewer, basicPlanId);
    await submitContestFeeTransfer(contestId, viewer, {
      transfer_reference: 'FT-sai',
      transfer_date: '2026-08-04',
      transfer_amount: 100000,
    });
    await rejectContestFeeOrder(order.id, admin.id, 'Số tiền chuyển thiếu');

    // Đơn bị từ chối không chặn đơn mới — nếu chặn thì provider kẹt vĩnh viễn.
    const retry = await createContestFeeOrder(contestId, viewer, featuredPlanId);
    expect(retry.status).toBe(ContestFeeOrderStatus.PENDING_PAYMENT);
  });

  it('không cho đặt hai đơn cùng lúc cho một giải', async () => {
    await createContestFeeOrder(contestId, viewer, basicPlanId);
    await expect(createContestFeeOrder(contestId, viewer, featuredPlanId)).rejects.toMatchObject({
      code: 'CONTEST_FEE_ORDER_EXISTS',
    });
  });

  it('huỷ đơn chưa chuyển khoản để đổi gói', async () => {
    await createContestFeeOrder(contestId, viewer, basicPlanId);
    await cancelContestFeeOrder(contestId, viewer);
    const retry = await createContestFeeOrder(contestId, viewer, featuredPlanId);
    expect(retry.amount).toBe(500000);
  });

  it('không cho huỷ đơn đã khai báo chuyển khoản', async () => {
    await createContestFeeOrder(contestId, viewer, basicPlanId);
    await submitContestFeeTransfer(contestId, viewer, {
      transfer_reference: 'FT222',
      transfer_date: '2026-08-04',
      transfer_amount: 200000,
    });
    await expect(cancelContestFeeOrder(contestId, viewer)).rejects.toMatchObject({
      code: 'CONTEST_FEE_ORDER_NOT_CANCELLABLE',
    });
  });

  it('provider khác không đụng được đơn phí của giải này', async () => {
    const other = await createTestUser({ role: UserRole.PROVIDER });
    await expect(
      createContestFeeOrder(contestId, { userId: other.id, role: UserRole.PROVIDER }, basicPlanId),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('suất chờ duyệt không hiện ra cho khách, duyệt xong mới hiện', async () => {
    const order = await createContestFeeOrder(contestId, viewer, featuredPlanId);
    await submitContestFeeTransfer(contestId, viewer, {
      transfer_reference: 'FT-quangba',
      transfer_date: '2026-08-04',
      transfer_amount: 500000,
    });
    await confirmContestFeeOrder(order.id, admin.id);

    expect(await getActiveFeaturedPopup()).toBeNull();

    const pending = await listPendingFeaturedPopups();
    expect(pending).toHaveLength(1);

    await reviewFeaturedPopup(
      pending[0].id,
      { userId: admin.id, role: UserRole.ADMIN },
      { approve: true },
    );
    const live = await getActiveFeaturedPopup();
    expect(live?.contest_id).toBe(contestId);
  });

  it('từ chối nội dung thì suất không lên trang chủ', async () => {
    const order = await createContestFeeOrder(contestId, viewer, featuredPlanId);
    await submitContestFeeTransfer(contestId, viewer, {
      transfer_reference: 'FT-tuchoi',
      transfer_date: '2026-08-04',
      transfer_amount: 500000,
    });
    await confirmContestFeeOrder(order.id, admin.id);

    const [pendingPopup] = await listPendingFeaturedPopups();
    await reviewFeaturedPopup(
      pendingPopup.id,
      { userId: admin.id, role: UserRole.ADMIN },
      { approve: false, notes: 'Ảnh bìa mờ, đề nghị thay' },
    );
    expect(await getActiveFeaturedPopup()).toBeNull();
  });
});

/**
 * Trả phí qua cổng PayOS — thêm vào bên cạnh chuyển khoản tay, không thay thế.
 *
 * Điểm khác duy nhất so với đường cũ: PayOS xác nhận thì đơn sang PAID ngay,
 * bỏ hẳn bước admin đối soát, vì tiền đã được cổng ghi nhận. Mọi thứ còn lại —
 * suất quảng bá chờ duyệt nội dung, cửa chặn mở đăng ký — giữ nguyên.
 *
 * Bốn ca đầu là bốn cách hệ thống có thể mất tiền hoặc mở giải khi chưa thu đủ.
 */
describe('phí tổ chức giải — thanh toán qua PayOS', () => {
  let provider: { id: string };
  let viewer: Viewer;
  let contestId: string;
  let basicPlanId: string;
  let featuredPlanId: string;

  beforeEach(async () => {
    jest.clearAllMocks();
    (payosService.getCheckoutStatus as jest.Mock).mockResolvedValue('PAID');
    (payosService.generateOrderCode as jest.Mock).mockReturnValue(111222333);

    provider = await createTestUser({ role: UserRole.PROVIDER });
    viewer = { userId: provider.id, role: UserRole.PROVIDER };
    await activateProvider(provider.id);
    const cafe = await createTestCafe({ provider_id: provider.id });
    contestId = await createDraftContest(provider.id, cafe.id);

    const plans = await listContestFeePlans();
    basicPlanId = plans.find((plan) => plan.code === 'BASIC')!.id;
    featuredPlanId = plans.find((plan) => plan.code === 'FEATURED')!.id;
  });

  // ── Ca 1 ────────────────────────────────────────────────────────────────────
  it('PayOS báo đã trả thì mở đăng ký được ngay, không cần admin duyệt', async () => {
    await createContestFeeOrder(contestId, viewer, basicPlanId);
    const link = await createContestFeePayOSLink(contestId, viewer);
    expect(link.checkout_url).toContain('https://');

    const order = await findContestFeeOrderByPayOSCode(link.order_code);
    const paid = await markContestFeeOrderPaidViaPayOS(order!);

    expect(paid.status).toBe(ContestFeeOrderStatus.PAID);
    await expect(changeContestStatus(contestId, viewer, ContestStatus.OPEN)).resolves.toBeDefined();
  });

  // ── Ca 2 ────────────────────────────────────────────────────────────────────
  it('trả qua PayOS vẫn không đẩy thẳng suất quảng bá lên trang chủ', async () => {
    await createContestFeeOrder(contestId, viewer, featuredPlanId);
    const link = await createContestFeePayOSLink(contestId, viewer);
    const order = await findContestFeeOrderByPayOSCode(link.order_code);
    await markContestFeeOrderPaidViaPayOS(order!);

    expect(await getActiveFeaturedPopup()).toBeNull();
    const pending = await listPendingFeaturedPopups();
    expect(pending).toHaveLength(1);
    expect(pending[0].review_status).toBe(FeaturedPopupReviewStatus.PENDING);
  });

  // ── Ca 3 ────────────────────────────────────────────────────────────────────
  it('webhook tới hai lần không sinh hai suất quảng bá', async () => {
    await createContestFeeOrder(contestId, viewer, featuredPlanId);
    const link = await createContestFeePayOSLink(contestId, viewer);

    const first = await findContestFeeOrderByPayOSCode(link.order_code);
    await markContestFeeOrderPaidViaPayOS(first!);
    const second = await findContestFeeOrderByPayOSCode(link.order_code);
    await markContestFeeOrderPaidViaPayOS(second!);

    expect(await listPendingFeaturedPopups()).toHaveLength(1);
  });

  // ── Ca 4 ────────────────────────────────────────────────────────────────────
  it('huỷ thanh toán PayOS thì đơn còn nguyên, quay sang chuyển khoản tay được', async () => {
    await createContestFeeOrder(contestId, viewer, basicPlanId);
    const link = await createContestFeePayOSLink(contestId, viewer);
    const order = await findContestFeeOrderByPayOSCode(link.order_code);

    const afterCancel = await markContestFeePayOSFailed(order!, 'Người dùng huỷ thanh toán');
    expect(afterCancel.status).toBe(ContestFeeOrderStatus.PENDING_PAYMENT);

    const declared = await submitContestFeeTransfer(contestId, viewer, {
      transfer_reference: 'FT999',
      transfer_date: '2026-08-13',
      transfer_amount: 200000,
    });
    expect(declared.status).toBe(ContestFeeOrderStatus.PENDING_REVIEW);
  });

  // ── Ca 5 ────────────────────────────────────────────────────────────────────
  it('bấm tạo link lần hai thì huỷ link cũ trước khi phát link mới', async () => {
    await createContestFeeOrder(contestId, viewer, basicPlanId);
    await createContestFeePayOSLink(contestId, viewer);

    (payosService.generateOrderCode as jest.Mock).mockReturnValue(444555666);
    const second = await createContestFeePayOSLink(contestId, viewer);

    expect(payosService.cancelCheckout).toHaveBeenCalledWith(111222333, expect.any(String));
    expect(second.order_code).toBe(444555666);
    const stale = await findContestFeeOrderByPayOSCode(111222333);
    expect(stale).toBeNull();
  });

  // ── Ca 6 ────────────────────────────────────────────────────────────────────
  it('đã khai báo chuyển khoản tay thì không mở được link PayOS song song', async () => {
    await createContestFeeOrder(contestId, viewer, basicPlanId);
    await submitContestFeeTransfer(contestId, viewer, {
      transfer_reference: 'FT123456',
      transfer_date: '2026-08-13',
      transfer_amount: 200000,
    });

    await expect(createContestFeePayOSLink(contestId, viewer)).rejects.toMatchObject({
      code: 'CONTEST_FEE_ORDER_NOT_PAYABLE',
      statusCode: 409,
    });
  });

  // ── Ca 7 ────────────────────────────────────────────────────────────────────
  it('provider khác không tạo được link thanh toán cho giải này', async () => {
    await createContestFeeOrder(contestId, viewer, basicPlanId);
    const outsider = await createTestUser({ role: UserRole.PROVIDER });

    await expect(
      createContestFeePayOSLink(contestId, { userId: outsider.id, role: UserRole.PROVIDER }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
  });

  // ── Ca 8 ────────────────────────────────────────────────────────────────────
  it('trang callback hỏi thẳng PayOS và đồng bộ được khi webhook chưa tới', async () => {
    await createContestFeeOrder(contestId, viewer, basicPlanId);
    const link = await createContestFeePayOSLink(contestId, viewer);

    const synced = await verifyContestFeePayOS(link.order_code);
    expect(synced.status).toBe(ContestFeeOrderStatus.PAID);
  });

  // ── Ca 9 ────────────────────────────────────────────────────────────────────
  it('đơn đã admin duyệt tay rồi thì webhook PayOS không ghi đè', async () => {
    await createContestFeeOrder(contestId, viewer, basicPlanId);
    const link = await createContestFeePayOSLink(contestId, viewer);
    await submitContestFeeTransfer(contestId, viewer, {
      transfer_reference: 'FT123456',
      transfer_date: '2026-08-13',
      transfer_amount: 200000,
    });
    const order = await findContestFeeOrderByPayOSCode(link.order_code);

    await expect(markContestFeeOrderPaidViaPayOS(order!)).rejects.toMatchObject({
      code: 'CONTEST_FEE_ORDER_INVALID',
    });
  });
});
