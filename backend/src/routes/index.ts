import { Router } from 'express';
import { authRouter } from './auth.routes';
import { chatRouter } from './chat.routes';
import { systemRouter } from './system.routes';
import { fbChannelRouter } from './fb-channel.routes';
import { fbWebhookRouter } from './fb-webhook.routes';
import { providerOnboardingRouter } from './provider-onboarding.routes';
import { businessLookupRouter } from './business-lookup.routes';
import { adminProviderRouter } from './admin-provider.routes';
import { adminPaymentRequestRouter } from './admin-payment-request.routes';
import { adminUserRouter } from './admin-user.routes';
import { notificationRouter } from './notification.routes';
import { providerSubscriptionRouter } from './provider-subscription.routes';
import { staffInviteRouter } from './staff-invite.routes';
import { staffRouter } from './staff.routes';
import { adminSubscriptionPlanRouter } from './admin-subscription-plan.routes';
import { adminAmenityRouter } from './admin-amenity.routes';
import { cafeRouter } from './cafe.routes';
import {
  bankTransactionRouter,
  banksRouter,
  cafeBankPaymentRouter,
  providerReconciliationRouter,
} from './bank-payment.routes';
import { cafeImagesRouter } from './cafe-images.routes';
import { uploadRouter } from './upload.routes';
import { vehicleCatalogRouter } from './vehicle-catalog.routes';
import { adminTrackTypeRouter } from './admin-track-type.routes';
import { adminDashboardRouter } from './admin-dashboard.routes';
import { adminPaymentLedgerRouter } from './admin-payment-ledger.routes';
import { adminFeatureFlagsRouter } from './admin-feature-flags.routes';
import { vnpayRouter } from './vnpay.routes';
import { payosRouter } from './payos.routes';
import { bookingRouter } from './booking.routes';
import { bookingController } from '../controllers/booking.controller';
import { customerPackageRouter } from './customer-package.routes';
import { pricingRouter } from './pricing.routes';
import { sessionRouter } from './session.routes';
import { reviewRouter } from './review.routes';
import { providerReviewRouter } from './provider-review.routes';
import { favoriteRouter } from './favorite.routes';
import { contestRouter } from './contest.routes';
import { racingNetworkRouter } from './racing-network.routes';
import { featuredPopupRouter } from './featured-popup.routes';
import { seoController } from '../controllers/seo.controller';
import { getRecentReviews } from '../controllers/review.controller';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { UserRole } from '../types';
import { AppDataSource } from '../config/database';
import { SubscriptionPlan } from '../models/subscription-plan.entity';
import { AmenityCatalog } from '../models/amenity-catalog.entity';
import { TrackType } from '../models/track-type.entity';

const router = Router();

// Công khai, không xác thực: bot tìm kiếm không đăng nhập được.
router.get('/seo/sitemap.xml', seoController.getSitemap);

router.get('/health', (_req, res) => {
  res.json({ success: true, message: 'RCField API is running' });
});

// GET /api/v1/subscription-plans — public, trả về các gói trả phí để provider chọn khi nộp payment request
router.get('/subscription-plans', async (_req, res, next) => {
  try {
    const plans = await AppDataSource.getRepository(SubscriptionPlan).find({
      order: { pricePerMonth: 'ASC' },
    });
    res.json(
      plans.map((p) => ({
        id: p.id,
        name: p.name,
        branchLimit: p.branchLimit,
        aiQuotaPerMonth: p.aiQuotaPerMonth,
        channelLimit: p.channelLimit,
        pricePerMonth: Number(p.pricePerMonth),
        isTrial: p.isTrial,
      })),
    );
  } catch (err) {
    next(err);
  }
});

router.get('/amenities', async (_req, res, next) => {
  try {
    const items = await AppDataSource.getRepository(AmenityCatalog).find({
      order: { sortOrder: 'ASC' },
    });
    res.json(
      items.map((a) => ({
        id: a.id,
        title: a.title,
        description: a.description,
        icon: a.icon,
        sortOrder: a.sortOrder,
      })),
    );
  } catch (err) {
    next(err);
  }
});

router.get('/track-types', async (_req, res, next) => {
  try {
    const items = await AppDataSource.getRepository(TrackType).find({
      where: { isActive: true },
      order: { sortOrder: 'ASC', code: 'ASC' },
    });
    res.json(
      items.map((t) => ({
        id: t.id,
        code: t.code,
        name: t.name,
        description: t.description,
        sortOrder: t.sortOrder,
      })),
    );
  } catch (err) {
    next(err);
  }
});

router.get('/reviews/recent', getRecentReviews);

router.use('/auth', authRouter);
router.use('/auth/staff-invite', staffInviteRouter);
router.use('/auth', providerOnboardingRouter);
router.use('/business-lookup', businessLookupRouter);
router.use('/admin/providers', adminProviderRouter);
router.use('/admin/payment-requests', adminPaymentRequestRouter);
router.use('/admin/users', adminUserRouter);
router.use('/admin/subscription-plans', adminSubscriptionPlanRouter);
router.use('/admin/amenities', adminAmenityRouter);
router.use('/admin/track-types', adminTrackTypeRouter);
router.use('/admin/dashboard', adminDashboardRouter);
router.use('/admin/payments', adminPaymentLedgerRouter);
router.use('/admin/feature-flags', adminFeatureFlagsRouter);
router.use('/notifications', notificationRouter);
router.use('/provider/notifications', notificationRouter);
// Mount before the general /provider router because this endpoint also allows ADMIN.
router.use('/provider/reviews', providerReviewRouter);
// Cũng phải mount trước `/provider` chung — xem chú thích ngay trên.
router.use('/provider/reconciliation', providerReconciliationRouter);
router.use('/provider', providerSubscriptionRouter);
router.use('/staff', staffRouter);
router.use('/system', systemRouter);
router.use('/uploads', uploadRouter);
// Mount TRƯỚC `cafeRouter`: cả hai cùng nhận `/cafes/:cafeId/...`, và Express
// duyệt theo thứ tự đăng ký. Đặt sau thì `cafeRouter` có thể nuốt mất đường dẫn
// bằng một route bắt chung nào đó.
router.use('/cafes/:cafeId', cafeBankPaymentRouter);
router.use('/banks', banksRouter);
router.use('/bank-transactions', bankTransactionRouter);
router.use('/cafes', cafeRouter);
router.use('/', cafeImagesRouter);
router.use('/cafes/:cafeId/vehicle-catalogs', vehicleCatalogRouter);
router.use('/cafes/:cafeId', chatRouter);
router.use('/channels/facebook', fbChannelRouter);
router.use('/webhook/facebook', fbWebhookRouter);
router.use('/payments/vnpay', vnpayRouter);
router.use('/payments/payos', payosRouter);
router.use('/bookings', bookingRouter);
router.use('/sessions', sessionRouter);
router.use('/', contestRouter);
router.use('/', featuredPopupRouter);
router.use('/', racingNetworkRouter);
router.use('/customer/reviews', reviewRouter);
router.use('/customer/favorites', favoriteRouter);
router.use('/', customerPackageRouter);
router.use('/', pricingRouter);
router.get(
  '/provider/cafes/:cafeId/bookings',
  authenticate,
  authorize(UserRole.PROVIDER, UserRole.STAFF),
  bookingController.listCafeBookings,
);

router.get(
  '/provider/cafes/:cafeId/sessions',
  authenticate,
  authorize(UserRole.PROVIDER, UserRole.STAFF),
  bookingController.listCafeSessions,
);

router.get(
  '/provider/cafes/:cafeId/sessions/stats',
  authenticate,
  authorize(UserRole.PROVIDER, UserRole.STAFF),
  bookingController.listCafeSessionStats,
);

// router.use('/bookings', bookingsRouter);
// router.use('/vehicles', vehiclesRouter);
// router.use('/inspections', inspectionsRouter);
// router.use('/payments', paymentsRouter);
// router.use('/fnb', fnbRouter);

export { router };
