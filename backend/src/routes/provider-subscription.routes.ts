import { Router } from 'express';
import { authenticate, authorize, requireActiveProvider } from '../middlewares/auth.middleware';
import { UserRole } from '../types';
import { paymentRequestController } from '../controllers/payment-request.controller';
import { providerOnboardingController } from '../controllers/provider-onboarding.controller';
import { staffController } from '../controllers/staff.controller';
import { providerDashboardController } from '../controllers/provider-dashboard.controller';
import { aiRevenueAnalyticsController } from '../controllers/ai-revenue-analytics.controller';
import { kycUpload } from '../config/multer.config';

export const providerSubscriptionRouter = Router();

providerSubscriptionRouter.use(authenticate, authorize(UserRole.PROVIDER));

providerSubscriptionRouter.get('/me', providerOnboardingController.getProviderMe);
// Không gắn requireActiveProvider: hồ sơ đang chờ duyệt hoặc bị từ chối vẫn phải
// sửa được thông tin doanh nghiệp, đó chính là lúc họ cần sửa nhất.
providerSubscriptionRouter.patch('/me', providerOnboardingController.updateProviderMe);

// KYC routes — no requireActiveProvider (used by REJECTED/PENDING providers)
const kycFields = kycUpload.fields([
  { name: 'cccd_front', maxCount: 1 },
  { name: 'cccd_back', maxCount: 1 },
  { name: 'gpkd', maxCount: 1 },
  { name: 'representative_id', maxCount: 1 },
  { name: 'venue_photo', maxCount: 1 },
]);
providerSubscriptionRouter.post(
  '/kyc/resubmit',
  kycFields,
  providerOnboardingController.resubmitKyc,
);
providerSubscriptionRouter.get('/kyc/status', providerOnboardingController.getKycStatus);

providerSubscriptionRouter.post('/staff', requireActiveProvider, staffController.createStaff);
providerSubscriptionRouter.get('/staff', requireActiveProvider, staffController.listStaff);
providerSubscriptionRouter.get(
  '/staff/:staffId',
  requireActiveProvider,
  staffController.getStaffDetail,
);
providerSubscriptionRouter.get(
  '/staff/:staffId/kpi',
  requireActiveProvider,
  staffController.getStaffKpi,
);
providerSubscriptionRouter.get(
  '/staff/:staffId/activity',
  requireActiveProvider,
  staffController.getStaffActivity,
);
providerSubscriptionRouter.patch(
  '/staff/:staffId/deactivate',
  requireActiveProvider,
  staffController.deactivateStaff,
);
providerSubscriptionRouter.patch(
  '/staff/:staffId/reactivate',
  requireActiveProvider,
  staffController.reactivateStaff,
);
providerSubscriptionRouter.post(
  '/staff/:staffId/resend-invite',
  requireActiveProvider,
  staffController.resendInvite,
);
providerSubscriptionRouter.patch(
  '/staff/:staffId/branch',
  requireActiveProvider,
  staffController.transferStaff,
);
providerSubscriptionRouter.post(
  '/staff/:staffId/impersonate',
  requireActiveProvider,
  staffController.impersonateStaff,
);

providerSubscriptionRouter.get(
  '/subscription',
  requireActiveProvider,
  paymentRequestController.getSubscriptionStatus,
);
providerSubscriptionRouter.post(
  '/payment-requests',
  requireActiveProvider,
  paymentRequestController.submitPaymentRequest,
);
providerSubscriptionRouter.post(
  '/payment-requests/payos-link',
  requireActiveProvider,
  paymentRequestController.getPayOSLink,
);
providerSubscriptionRouter.get(
  '/payment-requests',
  requireActiveProvider,
  paymentRequestController.listMyPaymentRequests,
);

// Provider Dashboard statistics
providerSubscriptionRouter.get(
  '/dashboard/kpi',
  requireActiveProvider,
  providerDashboardController.getKpi,
);
providerSubscriptionRouter.get(
  '/dashboard/revenue-trend',
  requireActiveProvider,
  providerDashboardController.getRevenueTrend,
);
providerSubscriptionRouter.get(
  '/dashboard/revenue-breakdown',
  requireActiveProvider,
  providerDashboardController.getRevenueBreakdown,
);
providerSubscriptionRouter.get(
  '/dashboard/booking-channels',
  requireActiveProvider,
  providerDashboardController.getBookingChannels,
);
providerSubscriptionRouter.get(
  '/dashboard/branch-performance',
  requireActiveProvider,
  providerDashboardController.getBranchPerformance,
);
providerSubscriptionRouter.get(
  '/dashboard/branch-operations',
  requireActiveProvider,
  providerDashboardController.getBranchOperations,
);
providerSubscriptionRouter.get(
  '/dashboard/recent-bookings',
  requireActiveProvider,
  providerDashboardController.getRecentBookings,
);
providerSubscriptionRouter.get(
  '/dashboard/top-stats',
  requireActiveProvider,
  providerDashboardController.getTopStats,
);
providerSubscriptionRouter.post(
  '/dashboard/ai-insights',
  requireActiveProvider,
  aiRevenueAnalyticsController.generateInsights,
);
providerSubscriptionRouter.get(
  '/dashboard/feature-flags',
  aiRevenueAnalyticsController.getProviderFeatureFlags,
);
