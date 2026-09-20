import { Response, NextFunction } from 'express';
import { env } from '../config/env';
import { AppDataSource } from '../config/database';
import { AppError, AuthRequest } from '../types';
import { CreateVnpayPaymentSchema } from '../validate';
import { createPaymentUrl, verifyVnpayParams } from '../services/vnpay.service';
import { processConfirmation } from '../services/payment.service';
import { logger } from '../config/logger';
import { PaymentTransaction } from '../models/payment-transaction.entity';

function getClientIp(req: AuthRequest): string {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string') {
    return forwardedFor.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || '127.0.0.1';
}

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return char;
    }
  });
}

function renderPaymentResultPage(input: {
  status: 'success' | 'failed';
  title: string;
  message: string;
  txnRef?: string;
  responseCode?: string;
  alreadyConfirmed?: boolean;
}): string {
  const isSuccess = input.status === 'success';
  const details = [
    input.txnRef ? ['Mã giao dịch', input.txnRef] : null,
    input.responseCode ? ['Mã phản hồi', input.responseCode] : null,
    input.alreadyConfirmed ? ['Trạng thái', 'Giao dịch đã được xác nhận trước đó'] : null,
  ].filter(Boolean) as [string, string][];

  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>${escapeHtml(input.title)}</title>
  <style>
    :root { color-scheme: dark; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #020617; color: #f8fafc; padding: 24px; }
    main { width: min(100%, 420px); border: 1px solid #1e293b; border-radius: 24px; padding: 28px 22px; background: #0f172a; box-shadow: 0 24px 80px rgba(0, 0, 0, .35); }
    .mark { width: 58px; height: 58px; display: grid; place-items: center; border-radius: 18px; margin-bottom: 18px; font-size: 32px; background: ${isSuccess ? '#064e3b' : '#7f1d1d'}; color: ${isSuccess ? '#5eead4' : '#fecaca'}; }
    h1 { margin: 0 0 10px; font-size: 28px; line-height: 1.15; }
    p { margin: 0; color: #cbd5e1; font-size: 16px; line-height: 1.55; }
    dl { margin: 22px 0 0; padding: 16px; border-radius: 16px; background: #020617; border: 1px solid #1e293b; }
    .row { display: flex; justify-content: space-between; gap: 16px; padding: 7px 0; color: #94a3b8; font-size: 14px; }
    .row strong { color: #f8fafc; text-align: right; word-break: break-all; }
    .hint { margin-top: 22px; color: #94a3b8; font-size: 14px; }
  </style>
</head>
<body>
  <main>
    <div class="mark">${isSuccess ? '✓' : '!'}</div>
    <h1>${escapeHtml(input.title)}</h1>
    <p>${escapeHtml(input.message)}</p>
    ${
      details.length
        ? `<dl>${details
            .map(
              ([label, value]) =>
                `<div class="row"><dt>${escapeHtml(label)}</dt><dd><strong>${escapeHtml(value)}</strong></dd></div>`,
            )
            .join('')}</dl>`
        : ''
    }
    <p class="hint">Bạn có thể đóng trình duyệt để quay lại ứng dụng RCField.</p>
  </main>
</body>
</html>`;
}

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return ['localhost', '127.0.0.1', '::1', '0.0.0.0'].includes(normalized);
}

function getRequestHostname(req: AuthRequest): string {
  const host = req.hostname || String(req.headers.host ?? '');
  return host.replace(/:\d+$/, '');
}

function buildFrontendResultUrl(input: {
  status: 'success' | 'failed';
  txnRef?: string;
  bookingId?: string;
  responseCode?: string;
  reason?: string;
  alreadyConfirmed?: boolean;
}): URL {
  const target = new URL('/payment/result', env.frontendUrl);
  target.searchParams.set('status', input.status);
  if (input.txnRef) target.searchParams.set('txn_ref', input.txnRef);
  if (input.bookingId) target.searchParams.set('booking_id', input.bookingId);
  if (input.responseCode) target.searchParams.set('response_code', input.responseCode);
  if (input.reason) target.searchParams.set('reason', input.reason);
  if (input.alreadyConfirmed) target.searchParams.set('already_confirmed', '1');
  return target;
}

function shouldRedirectToFrontend(req: AuthRequest, target: URL): boolean {
  if (!isLoopbackHost(target.hostname)) return true;
  return isLoopbackHost(getRequestHostname(req));
}

function sendPaymentResult(
  req: AuthRequest,
  res: Response,
  input: {
    status: 'success' | 'failed';
    title: string;
    message: string;
    txnRef?: string;
    bookingId?: string;
    responseCode?: string;
    alreadyConfirmed?: boolean;
  },
  statusCode = 200,
): void {
  const target = buildFrontendResultUrl(input);
  if (shouldRedirectToFrontend(req, target)) {
    res.redirect(target.toString());
    return;
  }

  res.status(statusCode).type('html').send(renderPaymentResultPage(input));
}

function appendPaymentParams(
  redirectUrl: string,
  input: {
    status: 'success' | 'failed';
    txnRef?: string;
    bookingId?: string;
    responseCode?: string;
    reason?: string;
  },
): string {
  const separator = redirectUrl.includes('?') ? '&' : '?';
  const params = new URLSearchParams({ status: input.status });
  if (input.txnRef) params.set('txn_ref', input.txnRef);
  if (input.bookingId) params.set('booking_id', input.bookingId);
  if (input.responseCode) params.set('response_code', input.responseCode);
  if (input.reason) params.set('reason', input.reason);
  return `${redirectUrl}${separator}${params.toString()}`;
}

async function getBookingIdForTransaction(txnRef?: string): Promise<string | undefined> {
  if (!txnRef) return undefined;
  const transaction = await AppDataSource.getRepository(PaymentTransaction).findOne({
    where: { txnRef },
    select: { bookingId: true },
  });
  return transaction?.bookingId ?? undefined;
}

function normalizeMobileRedirectUrl(redirectUrl: string): string {
  try {
    const url = new URL(redirectUrl);
    if (url.protocol === 'exp:' && !url.pathname.includes('/--/')) {
      url.pathname = '/--/payment-return';
      return url.toString();
    }
  } catch {
    // Keep the original URL so invalid callback values still fail visibly on the client.
  }

  return redirectUrl;
}

function renderMobileRedirectPage(input: {
  status: 'success' | 'failed';
  message: string;
  redirectUrl: string;
}): string {
  const isSuccess = input.status === 'success';
  const title = isSuccess ? 'Thanh toán thành công' : 'Thanh toán thất bại';

  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>RCField Payment</title>
  <style>
    :root { color-scheme: dark; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #020617; color: #f8fafc; padding: 24px; }
    main { width: min(100%, 420px); border: 1px solid #1e293b; border-radius: 24px; padding: 28px 22px; background: #0f172a; box-shadow: 0 24px 80px rgba(0, 0, 0, .35); text-align: center; }
    .mark { width: 58px; height: 58px; display: grid; place-items: center; border-radius: 18px; margin: 0 auto 18px; font-size: 32px; background: ${isSuccess ? '#064e3b' : '#7f1d1d'}; color: ${isSuccess ? '#5eead4' : '#fecaca'}; }
    h1 { margin: 0 0 10px; font-size: 26px; line-height: 1.15; }
    p { margin: 0; color: #cbd5e1; font-size: 15px; line-height: 1.55; }
    a { display: block; margin-top: 24px; padding: 14px 18px; border-radius: 14px; background: #ea580c; color: #fff; font-weight: 800; text-decoration: none; }
    .hint { margin-top: 18px; color: #94a3b8; font-size: 13px; }
  </style>
</head>
<body>
  <main>
    <div class="mark">${isSuccess ? '✓' : '!'}</div>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(input.message)}</p>
    <a id="return-to-app" href="${escapeHtml(input.redirectUrl)}">Quay lại ứng dụng RCField</a>
    <p class="hint">Nếu ứng dụng không tự mở lại, hãy bấm nút này hoặc đóng trình duyệt để quay lại app.</p>
  </main>
  <script>
    var redirectUrl = ${JSON.stringify(input.redirectUrl)};
    var returnLink = document.getElementById('return-to-app');
    function openApp() {
      window.location.assign(redirectUrl);
    }
    if (returnLink) {
      returnLink.addEventListener('click', function (event) {
        event.preventDefault();
        openApp();
      });
    }
    setTimeout(function () {
      openApp();
    }, 800);
  </script>
</body>
</html>`;
}

// POST /api/v1/payments/vnpay/create  [auth]
export async function createVnpayPayment(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = CreateVnpayPaymentSchema.parse(req.body);
    const paymentUrl = createPaymentUrl({
      amount: body.amount,
      txnRef: body.txn_ref,
      orderInfo: body.order_info,
      orderType: body.order_type,
      bankCode: body.bank_code,
      returnUrl: body.return_url,
      ipAddr: getClientIp(req),
    });

    res.status(201).json({
      success: true,
      data: {
        payment_url: paymentUrl,
        txn_ref: body.txn_ref,
      },
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/payments/vnpay/return
export async function handleVnpayReturn(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await processConfirmation(req.query as Record<string, unknown>);
    const verified = verifyVnpayParams(req.query);
    const bookingId = await getBookingIdForTransaction(verified.txnRef);

    const mobileRedirect = req.query.mobile_redirect as string | undefined;
    if (mobileRedirect) {
      const isSuccess = result.rspCode === '00' || result.rspCode === '02';
      const status = isSuccess ? 'success' : 'failed';
      const redirectUrl = appendPaymentParams(normalizeMobileRedirectUrl(mobileRedirect), {
        status,
        txnRef: verified.txnRef,
        bookingId,
        responseCode: isSuccess ? undefined : result.rspCode,
      });

      res.type('html').send(
        renderMobileRedirectPage({
          status,
          message: isSuccess
            ? 'Thanh toán thành công. Ca chơi của bạn đã được xác nhận.'
            : `Thanh toán thất bại hoặc chưa hoàn tất. Mã lỗi: ${result.rspCode || 'unknown'}.`,
          redirectUrl,
        }),
      );
      return;
    }

    if (result.rspCode === '00') {
      sendPaymentResult(req, res, {
        status: 'success',
        title: 'Thanh toán thành công',
        message:
          'Giao dịch VNPay đã được xác nhận. Ứng dụng sẽ cập nhật trạng thái khi bạn quay lại.',
        txnRef: verified.txnRef,
        bookingId,
      });
      return;
    } else if (result.rspCode === '02') {
      sendPaymentResult(req, res, {
        status: 'success',
        title: 'Thanh toán đã được xác nhận',
        message: 'Giao dịch này đã được xử lý trước đó. Bạn có thể quay lại ứng dụng.',
        txnRef: verified.txnRef,
        bookingId,
        alreadyConfirmed: true,
      });
      return;
    }

    sendPaymentResult(req, res, {
      status: 'failed',
      title: 'Thanh toán chưa hoàn tất',
      message: result.message || 'VNPay chưa xác nhận giao dịch này.',
      txnRef: verified.txnRef,
      bookingId,
      responseCode: result.rspCode,
    });
  } catch (err) {
    const mobileRedirect = req.query.mobile_redirect as string | undefined;
    if (mobileRedirect) {
      const redirectUrl = appendPaymentParams(normalizeMobileRedirectUrl(mobileRedirect), {
        status: 'failed',
        reason: err instanceof AppError ? (err.code ?? 'unknown') : 'unknown',
      });
      res.type('html').send(
        renderMobileRedirectPage({
          status: 'failed',
          message:
            'Không thể xác nhận thanh toán. Vui lòng quay lại ứng dụng để kiểm tra trạng thái.',
          redirectUrl,
        }),
      );
      return;
    }

    if (err instanceof AppError) {
      sendPaymentResult(
        req,
        res,
        {
          status: 'failed',
          title: 'Không thể xác nhận thanh toán',
          message: err.message,
          responseCode: err.code ?? 'unknown',
        },
        err.statusCode,
      );
      return;
    }
    next(err);
  }
}

// GET /api/v1/payments/vnpay/ipn  (VNPay server-to-server callback)
export async function handleVnpayIpn(
  req: AuthRequest,
  res: Response,
  _next: NextFunction,
): Promise<void> {
  try {
    const result = await processConfirmation(req.query as Record<string, unknown>);
    logger.info('VNPay', `IPN processed rspCode=${result.rspCode}`);
    res.json({ RspCode: result.rspCode, Message: result.message });
  } catch (err) {
    // VNPay requires a response even on internal errors
    logger.error('VNPay', 'IPN handler error', err);
    res.json({ RspCode: '99', Message: 'Unknown error' });
  }
}
