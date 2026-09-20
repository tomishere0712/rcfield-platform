import { Router } from 'express';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { UserRole } from '../types';
import { sessionController } from '../controllers/session.controller';
import { staffController } from '../controllers/staff.controller';

export const sessionRouter = Router();

// Customer session actions (real client flow)
sessionRouter.post(
  '/:sessionId/inspections/:inspectionId/confirm',
  authenticate,
  authorize(UserRole.CUSTOMER),
  sessionController.confirmInspection,
);

sessionRouter.post(
  '/:sessionId/inspection/confirm',
  authenticate,
  authorize(UserRole.CUSTOMER),
  sessionController.confirmInspection,
);

sessionRouter.post(
  '/:sessionId/extensions/respond',
  authenticate,
  authorize(UserRole.CUSTOMER),
  sessionController.respondExtension,
);

sessionRouter.post(
  '/:sessionId/extension/respond',
  authenticate,
  authorize(UserRole.CUSTOMER),
  sessionController.respondExtension,
);

// Get session detail (for customer to view inspection data)
sessionRouter.get(
  '/:sessionId',
  authenticate,
  authorize(UserRole.CUSTOMER),
  sessionController.getSessionDetail,
);

// ── Nhân viên thao tác hộ khách dùng tài khoản mềm ───────────────────────────
//
// Khách đặt qua Facebook (và khách vãng lai) không đăng nhập được, nên hai bước
// bắt buộc có khách tham gia — duyệt gia hạn và ký biên bản trả xe — sẽ tắc
// vĩnh viễn nếu không có đường này.
//
// `authorize` áp ở TẦNG ROUTER theo Nguyên tắc VI, không kiểm bên trong handler.
// Tầng dịch vụ còn một chốt nữa: từ chối nếu chủ đơn có mật khẩu (FR-025).
sessionRouter.post(
  '/:sessionId/extension/respond-for-customer',
  authenticate,
  authorize(UserRole.STAFF, UserRole.PROVIDER),
  staffController.respondExtensionForCustomer,
);

sessionRouter.post(
  '/:sessionId/inspections/:inspectionId/confirm-for-customer',
  authenticate,
  authorize(UserRole.STAFF, UserRole.PROVIDER),
  staffController.confirmInspectionForCustomer,
);
