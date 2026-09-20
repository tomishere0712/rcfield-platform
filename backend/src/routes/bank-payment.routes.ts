import { Router } from 'express';
import { bankPaymentController } from '../controllers/bank-payment.controller';
import { authenticate, authorize, requireActiveProvider } from '../middlewares/auth.middleware';
import { UserRole } from '../types';

/**
 * Cấu hình nhận tiền và sổ đối soát ngân hàng.
 *
 * Phân quyền đặt ở tầng router (Nguyên tắc VI), và service còn kiểm quyền sở
 * hữu một lần nữa. Ranh giới quan trọng nhất ở đây:
 *
 * - Cấu hình tài khoản ngân hàng và sổ đầy đủ: **chỉ PROVIDER chủ sở hữu**.
 *   ADMIN cũng không vào được — nhất quán với quyết định rằng tài chính của
 *   chủ doanh nghiệp là riêng tư với nền tảng.
 * - Hàng đợi giao dịch treo: nhân viên được phân công vào được, vì họ là người
 *   đối mặt khách đang đứng chờ ở quầy.
 */

// ── Bảng tra ngân hàng ───────────────────────────────────────────────────────

// Công khai và không gắn với chi nhánh nào: đây là bảng tra tĩnh của VietQR,
// giao diện đọc để dựng ô chọn thay vì chép lại danh sách vào mã nguồn.
export const banksRouter = Router();

banksRouter.get('/', bankPaymentController.listBanks);

// Mount dưới `/cafes/:cafeId` nên cần mergeParams để đọc được `:cafeId`.
export const cafeBankPaymentRouter = Router({ mergeParams: true });

// Công khai: màn thanh toán cần biết có phải hiện lựa chọn phương thức không.
cafeBankPaymentRouter.get('/payment-methods', bankPaymentController.listPaymentMethods);

// ── Cấu hình nhận tiền — chỉ chủ chi nhánh ───────────────────────────────────

cafeBankPaymentRouter.get(
  '/payment-settings',
  authenticate,
  authorize(UserRole.PROVIDER),
  bankPaymentController.getSettings,
);

cafeBankPaymentRouter.get(
  '/payment-settings/edit',
  authenticate,
  authorize(UserRole.PROVIDER),
  bankPaymentController.getSettingsForEdit,
);

cafeBankPaymentRouter.put(
  '/payment-settings',
  authenticate,
  authorize(UserRole.PROVIDER),
  requireActiveProvider,
  bankPaymentController.updateSettings,
);

cafeBankPaymentRouter.get(
  '/payment-settings/sample-qr',
  authenticate,
  authorize(UserRole.PROVIDER),
  bankPaymentController.getSampleQr,
);

cafeBankPaymentRouter.post(
  '/payment-settings/verify',
  authenticate,
  authorize(UserRole.PROVIDER),
  requireActiveProvider,
  bankPaymentController.verifySettings,
);

// ── Sổ đối soát ──────────────────────────────────────────────────────────────

cafeBankPaymentRouter.get(
  '/bank-transactions',
  authenticate,
  authorize(UserRole.PROVIDER),
  bankPaymentController.listTransactions,
);

cafeBankPaymentRouter.get(
  '/bank-transactions/pending',
  authenticate,
  authorize(UserRole.PROVIDER, UserRole.STAFF),
  bankPaymentController.listPendingTransactions,
);

// ── Thao tác trên một giao dịch (không nằm dưới :cafeId) ─────────────────────

export const bankTransactionRouter = Router();

bankTransactionRouter.post(
  '/:id/assign',
  authenticate,
  authorize(UserRole.PROVIDER, UserRole.STAFF),
  bankPaymentController.assignTransaction,
);

bankTransactionRouter.post(
  '/:id/ignore',
  authenticate,
  authorize(UserRole.PROVIDER),
  bankPaymentController.ignoreTransaction,
);

// ── Đối soát sao kê: gộp mọi chi nhánh của một chủ sân ───────────────────────
//
// Không nằm dưới `/cafes/:cafeId` vì đây đúng là màn hình KHÔNG chọn chi nhánh
// — chủ sân cần một con số tổng để so với sao kê, chứ không phải mở lần lượt
// từng chi nhánh rồi tự cộng tay.
//
// PROVIDER và chỉ PROVIDER. Nhân viên đã có hàng đợi riêng ở
// `/bank-transactions/pending`, và không có việc gì cần biết cả kỳ quán thu
// được bao nhiêu.

export const providerReconciliationRouter = Router();

// Ba lớp, không phải hai:
//
//  1. `authenticate` — có token hợp lệ.
//  2. `authorize(PROVIDER)` — đúng vai chủ sân.
//  3. `requireActiveProvider` — hồ sơ đối tác đang ACTIVE. Thiếu lớp này thì
//     một tài khoản ĐÃ BỊ TẠM KHOÁ vẫn kéo được toàn bộ sổ tiền và xuất CSV,
//     vì hai lớp trên chỉ xét vai trò chứ không xét trạng thái hồ sơ.
//
// Phạm vi dữ liệu nằm ở tầng truy vấn: mệnh đề `cafes.provider_id = $1` lấy từ
// token, nên không có tham số nào người gọi truyền lên mở rộng được tầm nhìn.
providerReconciliationRouter.use(authenticate, authorize(UserRole.PROVIDER), requireActiveProvider);

providerReconciliationRouter.get('/', bankPaymentController.listReconciliation);

providerReconciliationRouter.get('/export', bankPaymentController.exportReconciliation);
