import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { matchBankTransaction, type SePayWebhookPayload } from '../services/bank-webhook.service';
import { BankTransactionGateway } from '../types';

/**
 * Điểm nhận thông báo tiền về từ dịch vụ đối soát ngân hàng.
 *
 * Cố ý KHÔNG có `authenticate`: bên gọi là một dịch vụ máy-với-máy, không có
 * phiên đăng nhập. Xác thực bằng khoá API trong header, đúng cách nhà cung cấp
 * làm việc — nghĩa là khi chuyển sang dịch vụ thương mại, chỉ cần dán URL này
 * vào trang quản trị của họ và đổi khoá.
 *
 * Route này sống ở MỌI môi trường, kể cả khi ngân hàng mô phỏng đã tắt. Đó là
 * điều làm nên giá trị của thiết kế: phần thật không phụ thuộc phần mô phỏng.
 */

const router = Router();

// Điểm nhận công khai theo bản chất, nên phải có trần để không bị nhồi rác.
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Quá nhiều yêu cầu.' },
});

/** Rút khoá khỏi header `Authorization: Apikey <key>`. */
function extractApiKey(header?: string): string | null {
  if (!header) return null;
  const match = header.match(/^Apikey\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

function isValidPayload(body: unknown): body is SePayWebhookPayload {
  if (!body || typeof body !== 'object') return false;
  const p = body as Record<string, unknown>;
  return (
    (typeof p.id === 'number' || typeof p.id === 'string') &&
    typeof p.accountNumber === 'string' &&
    typeof p.content === 'string' &&
    typeof p.transferType === 'string' &&
    typeof p.transferAmount === 'number' &&
    typeof p.transactionDate === 'string'
  );
}

router.post('/bank-webhook', webhookLimiter, async (req: Request, res: Response) => {
  const providedKey = extractApiKey(req.headers.authorization);

  // Sai khoá thì 401 và KHÔNG ghi vào sổ đối soát — ghi cả request rác vào sổ
  // sẽ biến nó thành bãi rác và làm hỏng chính mục đích đối soát.
  if (!env.bankWebhook.apiKey || providedKey !== env.bankWebhook.apiKey) {
    logger.warn('BankWebhook', 'từ chối thông báo sai khoá xác thực', {
      ip: req.ip,
      hasHeader: Boolean(providedKey),
    });
    res.status(401).json({ success: false, code: 'INVALID_WEBHOOK_KEY' });
    return;
  }

  if (!isValidPayload(req.body)) {
    res.status(400).json({ success: false, code: 'INVALID_WEBHOOK_PAYLOAD' });
    return;
  }

  try {
    const gateway =
      req.body.gateway === BankTransactionGateway.SANDBOX
        ? BankTransactionGateway.SANDBOX
        : BankTransactionGateway.SEPAY;

    const result = await matchBankTransaction(req.body, gateway);

    // LUÔN 200 khi khoá hợp lệ, kể cả khi không khớp booking nào. Dịch vụ đối
    // soát coi mọi mã khác 200 là thất bại và gửi lại vô hạn.
    res.status(200).json({ success: true, ...result });
  } catch (err) {
    logger.error('BankWebhook', 'lỗi khi đối soát thông báo tiền về', err);
    // Vẫn 200: lỗi phía mình không phải lý do để nhà cung cấp gửi lại mãi.
    // Giao dịch chưa ghi được sẽ xuất hiện khi họ gửi bù, và bản ghi lỗi đã
    // nằm trong log để người vận hành lần lại.
    res.status(200).json({ success: false, code: 'PROCESSING_ERROR' });
  }
});

export { router as bankWebhookRouter };
