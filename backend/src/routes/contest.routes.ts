import { Router } from 'express';
import multer from 'multer';
import { contestController } from '../controllers/contest.controller';
import { contestFeeController } from '../controllers/contest-fee.controller';
import { contestFinanceController } from '../controllers/contest-finance.controller';
import {
  authenticate,
  authorize,
  optionalAuthenticate,
  requireActiveProvider,
} from '../middlewares/auth.middleware';
import { UserRole } from '../types';

export const contestRouter = Router();

const bannerUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

contestRouter.get('/contest-catalog/types', contestController.listContestTypes);
contestRouter.get('/contest-catalog/formats', contestController.listContestFormats);
contestRouter.get('/contest-catalog/templates', contestController.listContestTemplates);

contestRouter.get('/contests', optionalAuthenticate, contestController.listContests);
contestRouter.get(
  '/cafes/:cafeId/contests',
  optionalAuthenticate,
  contestController.listCafeContests,
);
contestRouter.get('/contests/:contestId', optionalAuthenticate, contestController.getContestById);
contestRouter.get(
  '/contests/:contestId/matches',
  optionalAuthenticate,
  contestController.listMatches,
);

contestRouter.post(
  '/contests',
  authenticate,
  authorize(UserRole.PROVIDER),
  requireActiveProvider,
  contestController.createContest,
);
contestRouter.patch(
  '/contests/:contestId',
  authenticate,
  authorize(UserRole.PROVIDER, UserRole.STAFF),
  requireActiveProvider,
  contestController.updateContest,
);
contestRouter.post(
  '/contests/:contestId/banner',
  authenticate,
  authorize(UserRole.PROVIDER, UserRole.STAFF),
  requireActiveProvider,
  bannerUpload.single('file'),
  contestController.uploadBanner,
);
contestRouter.post(
  '/contests/:contestId/open',
  authenticate,
  authorize(UserRole.PROVIDER, UserRole.STAFF),
  requireActiveProvider,
  contestController.openContest,
);
contestRouter.post(
  '/contests/:contestId/close',
  authenticate,
  authorize(UserRole.PROVIDER, UserRole.STAFF),
  requireActiveProvider,
  contestController.closeContest,
);
contestRouter.post(
  '/contests/:contestId/cancel',
  authenticate,
  authorize(UserRole.PROVIDER, UserRole.STAFF),
  requireActiveProvider,
  contestController.cancelContest,
);
contestRouter.post(
  '/contests/:contestId/matches/generate',
  authenticate,
  authorize(UserRole.PROVIDER, UserRole.STAFF),
  requireActiveProvider,
  contestController.generateMatches,
);
contestRouter.post(
  '/contests/:contestId/matches/generate-final-bracket',
  authenticate,
  authorize(UserRole.PROVIDER, UserRole.STAFF),
  requireActiveProvider,
  contestController.generateFinalBracket,
);
contestRouter.post(
  '/contests/:contestId/leaderboard/publish',
  authenticate,
  authorize(UserRole.PROVIDER, UserRole.STAFF),
  requireActiveProvider,
  contestController.publishLeaderboard,
);
contestRouter.post(
  '/contests/:contestId/sync-race-records',
  authenticate,
  authorize(UserRole.PROVIDER, UserRole.STAFF),
  requireActiveProvider,
  contestController.syncRaceRecords,
);
contestRouter.get(
  '/contests/:contestId/audit-logs',
  authenticate,
  authorize(UserRole.PROVIDER, UserRole.STAFF),
  requireActiveProvider,
  contestController.listAuditLogs,
);
contestRouter.get(
  '/contests/:contestId/metrics',
  authenticate,
  authorize(UserRole.PROVIDER, UserRole.STAFF),
  requireActiveProvider,
  contestController.getMetrics,
);
// Báo cáo tài chính giải — CHỈ provider, không mở cho STAFF như các route trên.
// Cố ý không gắn `requireActiveProvider`: chủ doanh nghiệp bị tạm khoá vẫn phải
// xem lại được sổ sách của mình; chặn đọc là giữ con tin dữ liệu tài chính.
contestRouter.get(
  '/contests/:contestId/finance',
  authenticate,
  authorize(UserRole.PROVIDER),
  contestFinanceController.getFinanceReport,
);

// ── Sổ thu chi giải ──────────────────────────────────────────────────────────
// Đăng ký `/ledger-entries/mine` TRƯỚC `/ledger-entries` không cần thiết vì hai
// path khác độ sâu, nhưng vẫn giữ thứ tự này cho người đọc khỏi phải kiểm lại.
contestRouter.get(
  '/contests/:contestId/ledger-entries/mine',
  authenticate,
  authorize(UserRole.STAFF),
  contestFinanceController.listMyEntries,
);
contestRouter.get(
  '/contests/:contestId/ledger-entries',
  authenticate,
  authorize(UserRole.PROVIDER),
  contestFinanceController.listEntries,
);
contestRouter.post(
  '/contests/:contestId/ledger-entries',
  authenticate,
  authorize(UserRole.PROVIDER, UserRole.STAFF),
  requireActiveProvider,
  contestFinanceController.createEntry,
);
contestRouter.post(
  '/contests/:contestId/ledger-entries/receipt',
  authenticate,
  authorize(UserRole.PROVIDER, UserRole.STAFF),
  requireActiveProvider,
  bannerUpload.single('file'),
  contestFinanceController.uploadReceipt,
);
contestRouter.patch(
  '/contest-ledger-entries/:entryId',
  authenticate,
  authorize(UserRole.PROVIDER),
  requireActiveProvider,
  contestFinanceController.updateEntry,
);
contestRouter.delete(
  '/contest-ledger-entries/:entryId',
  authenticate,
  authorize(UserRole.PROVIDER),
  requireActiveProvider,
  contestFinanceController.deleteEntry,
);
contestRouter.get(
  '/contests/:contestId/staff-assignments',
  authenticate,
  authorize(UserRole.PROVIDER, UserRole.STAFF),
  requireActiveProvider,
  contestController.listStaffAssignments,
);
contestRouter.post(
  '/contests/:contestId/staff-assignments',
  authenticate,
  authorize(UserRole.PROVIDER),
  requireActiveProvider,
  contestController.assignStaff,
);
contestRouter.delete(
  '/contests/:contestId/staff-assignments/:staffId',
  authenticate,
  authorize(UserRole.PROVIDER),
  requireActiveProvider,
  contestController.unassignStaff,
);
contestRouter.get(
  '/contests/:contestId/bans',
  authenticate,
  authorize(UserRole.PROVIDER, UserRole.STAFF),
  requireActiveProvider,
  contestController.listBans,
);
contestRouter.post(
  '/contests/:contestId/bans',
  authenticate,
  authorize(UserRole.PROVIDER, UserRole.STAFF),
  requireActiveProvider,
  contestController.createBan,
);
contestRouter.post(
  '/contests/:contestId/bans/:banId/lift',
  authenticate,
  authorize(UserRole.PROVIDER, UserRole.STAFF),
  requireActiveProvider,
  contestController.liftBan,
);

contestRouter.get(
  '/contests/:contestId/rental-options',
  authenticate,
  authorize(UserRole.CUSTOMER),
  contestController.getRentalOptions,
);
contestRouter.get(
  '/contests/:contestId/available-rental-vehicles',
  authenticate,
  authorize(UserRole.CUSTOMER),
  contestController.getAvailableRentalVehicles,
);

contestRouter.post(
  '/contests/:contestId/register',
  authenticate,
  authorize(UserRole.CUSTOMER),
  contestController.createRegistration,
);
contestRouter.get(
  '/me/contest-registrations',
  authenticate,
  authorize(UserRole.CUSTOMER),
  contestController.listMyRegistrations,
);
contestRouter.get(
  '/contests/:contestId/registrations',
  authenticate,
  authorize(UserRole.PROVIDER, UserRole.STAFF),
  requireActiveProvider,
  contestController.listContestRegistrations,
);
contestRouter.get(
  '/contests/:contestId/bookings',
  authenticate,
  authorize(UserRole.PROVIDER, UserRole.STAFF),
  requireActiveProvider,
  contestController.listContestBookings,
);
contestRouter.post(
  '/contest-registrations/:registrationId/create-entry-fee-payment',
  authenticate,
  authorize(UserRole.CUSTOMER),
  contestController.createEntryFeePayment,
);
contestRouter.get(
  '/contests/:contestId/registrations/lookup',
  authenticate,
  authorize(UserRole.PROVIDER, UserRole.STAFF),
  contestController.lookupRegistration,
);
contestRouter.post(
  '/contest-registrations/:registrationId/mark-entry-fee-paid',
  authenticate,
  authorize(UserRole.PROVIDER, UserRole.STAFF),
  requireActiveProvider,
  contestController.markEntryFeePaid,
);
contestRouter.post(
  '/contest-registrations/:registrationId/waive-entry-fee',
  authenticate,
  authorize(UserRole.PROVIDER, UserRole.STAFF),
  requireActiveProvider,
  contestController.waiveEntryFee,
);
contestRouter.post(
  '/contest-registrations/:registrationId/approve',
  authenticate,
  authorize(UserRole.PROVIDER, UserRole.STAFF),
  requireActiveProvider,
  contestController.approveRegistration,
);
contestRouter.post(
  '/contest-registrations/:registrationId/reject',
  authenticate,
  authorize(UserRole.PROVIDER, UserRole.STAFF),
  requireActiveProvider,
  contestController.rejectRegistration,
);
contestRouter.post(
  '/contest-registrations/:registrationId/disqualify',
  authenticate,
  authorize(UserRole.PROVIDER, UserRole.STAFF),
  requireActiveProvider,
  contestController.disqualifyRegistration,
);
contestRouter.post(
  '/contest-registrations/:registrationId/cancel',
  authenticate,
  authorize(UserRole.CUSTOMER, UserRole.PROVIDER),
  contestController.cancelRegistration,
);
contestRouter.patch(
  '/contest-registrations/:registrationId/byoc-declaration',
  authenticate,
  authorize(UserRole.CUSTOMER),
  contestController.updateByocDeclaration,
);
contestRouter.get(
  '/contest-registrations/:registrationId/handover-units',
  authenticate,
  authorize(UserRole.PROVIDER, UserRole.STAFF),
  contestController.listHandoverUnits,
);
contestRouter.post(
  '/contest-registrations/:registrationId/check-in',
  authenticate,
  authorize(UserRole.PROVIDER, UserRole.STAFF),
  contestController.checkInRegistration,
);
contestRouter.patch(
  '/contest-matches/:matchId/participants',
  authenticate,
  authorize(UserRole.PROVIDER, UserRole.STAFF),
  contestController.updateMatchParticipants,
);
contestRouter.post(
  '/contest-matches/:matchId/results',
  authenticate,
  authorize(UserRole.PROVIDER, UserRole.STAFF),
  contestController.submitMatchResults,
);
contestRouter.post(
  '/contest-matches/:matchId/results/correct',
  authenticate,
  authorize(UserRole.PROVIDER, UserRole.STAFF),
  contestController.correctMatchResults,
);
contestRouter.post(
  '/contest-matches/:matchId/walkover',
  authenticate,
  authorize(UserRole.PROVIDER, UserRole.STAFF),
  contestController.recordMatchWalkover,
);

contestRouter.post(
  '/contest-matches/:matchId/advance',
  authenticate,
  authorize(UserRole.PROVIDER, UserRole.STAFF),
  contestController.advanceMatch,
);

// ── Phí tổ chức giải ─────────────────────────────────────────────────────────
// Đăng ký TRƯỚC các route '/contests/:contestId' động khác thì không cần, vì
// '/contest-fee-plans' là đường tĩnh riêng biệt.
contestRouter.get('/contest-fee-plans', authenticate, contestFeeController.listPlans);

contestRouter.get(
  '/contests/:contestId/fee',
  authenticate,
  authorize(UserRole.PROVIDER, UserRole.ADMIN),
  contestFeeController.getStatus,
);
contestRouter.post(
  '/contests/:contestId/fee/order',
  authenticate,
  authorize(UserRole.PROVIDER),
  contestFeeController.createOrder,
);
contestRouter.delete(
  '/contests/:contestId/fee/order',
  authenticate,
  authorize(UserRole.PROVIDER),
  contestFeeController.cancelOrder,
);
contestRouter.post(
  '/contests/:contestId/fee/transfer',
  authenticate,
  authorize(UserRole.PROVIDER),
  contestFeeController.submitTransfer,
);
// Trả qua cổng PayOS — chạy song song với đường chuyển khoản tay ở trên.
contestRouter.post(
  '/contests/:contestId/fee/payos-link',
  authenticate,
  authorize(UserRole.PROVIDER),
  contestFeeController.createPayOSLink,
);
contestRouter.post(
  '/contests/:contestId/fee/payos-verify',
  authenticate,
  authorize(UserRole.PROVIDER),
  contestFeeController.verifyPayOS,
);

contestRouter.get(
  '/admin/contest-fee-orders',
  authenticate,
  authorize(UserRole.ADMIN),
  contestFeeController.listForAdmin,
);
contestRouter.post(
  '/admin/contest-fee-orders/:orderId/confirm',
  authenticate,
  authorize(UserRole.ADMIN),
  contestFeeController.confirm,
);
contestRouter.post(
  '/admin/contest-fee-orders/:orderId/reject',
  authenticate,
  authorize(UserRole.ADMIN),
  contestFeeController.reject,
);
