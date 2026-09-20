import { Router, type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { logger } from '../config/logger';
import { emitTransferNotification, findPendingPayment } from '../services/sandbox-bank';
import { renderErrorPage, renderPayPage } from '../services/sandbox-bank/page.template';

/**
 * Ngân hàng mô phỏng.
 *
 * Router này chỉ được mount khi `SANDBOX_BANK_ENABLED=true` — xem `app.ts`.
 * Tắt cờ thì Express không biết đường dẫn này tồn tại và trả 404 tự nhiên, chứ
 * không phải middleware chặn lại. Khác biệt quan trọng: 404 nghĩa là không có
 * mã nào chạy, còn 403 nghĩa là có mã chạy rồi mới từ chối.
 */

const router = Router();

const sandboxLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Nới CSP cho riêng trang mô phỏng.
 *
 * Helmet đặt `script-src 'self'` cho toàn hệ thống, và trang này là HTML dựng
 * phía server với một khối `<script>` inline — bị chặn thì nút xác nhận không
 * có handler nào gắn vào và bấm không ra gì cả, im lặng, không báo lỗi.
 *
 * Cùng cách trang Swagger đang làm trong `app.ts`. Chỉ áp cho router này nên
 * không nới lỏng phần còn lại của hệ thống, và cả router biến mất khi tắt cờ.
 */
const sandboxCsp = (_req: Request, res: Response, next: NextFunction): void => {
  res.set(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; " +
      "style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'",
  );
  next();
};

router.use(sandboxLimiter);
router.use(sandboxCsp);

// GET /api/v1/sandbox-bank/pay?ref=RCF7K2M9
router.get('/pay', async (req: Request, res: Response) => {
  const refCode = typeof req.query.ref === 'string' ? req.query.ref.toUpperCase() : '';

  if (!refCode) {
    res.status(400).type('html').send(renderErrorPage('Thiếu mã tham chiếu.'));
    return;
  }

  const payment = await findPendingPayment(refCode);
  if (!payment) {
    // Trang lỗi thân thiện chứ không phải JSON — người đang xem là khách vừa
    // quét mã bằng điện thoại, không phải một client API.
    res
      .status(404)
      .type('html')
      .send(
        renderErrorPage(
          'Giao dịch không tồn tại hoặc đã hoàn tất. Vui lòng quay lại màn hình đặt lịch.',
        ),
      );
    return;
  }

  res.type('html').send(renderPayPage(payment));
});

// POST /api/v1/sandbox-bank/transfer
router.post('/transfer', async (req: Request, res: Response) => {
  const refCode = typeof req.body?.ref === 'string' ? req.body.ref.toUpperCase() : '';

  if (!refCode) {
    res.status(400).json({ success: false, message: 'Thiếu mã tham chiếu.' });
    return;
  }

  const payment = await findPendingPayment(refCode);
  if (!payment) {
    res.status(404).json({ success: false, message: 'Giao dịch không còn hiệu lực.' });
    return;
  }

  try {
    const result = await emitTransferNotification(payment);
    res.json({ success: result.ok });
  } catch (err) {
    logger.error('SandboxBank', 'không phát được thông báo tiền về', err);
    res.status(502).json({ success: false, message: 'Không gọi được điểm nhận.' });
  }
});

export { router as sandboxBankRouter };
