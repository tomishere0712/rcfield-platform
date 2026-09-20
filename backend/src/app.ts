import 'reflect-metadata';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { rateLimit } from 'express-rate-limit';
import { router } from './routes';
import { vnpayRouter } from './routes/vnpay.routes';
import { bankWebhookRouter } from './routes/bank-webhook.routes';
import { sandboxBankRouter } from './routes/sandbox-bank.routes';
import { devToolsRouter } from './routes/dev-tools.routes';
import { logger } from './config/logger';
import {
  createVnpayPayment,
  handleVnpayIpn,
  handleVnpayReturn,
} from './controllers/vnpay.controller';
import { env } from './config/env';
import { authenticate } from './middlewares/auth.middleware';
import { createOpenApiSpec } from './config/swagger';
import { errorMiddleware } from './middlewares/error.middleware';
import { requestLogger } from './middlewares/logger.middleware';

const swaggerDocsCsp: express.RequestHandler = (_req, res, next) => {
  res.set(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://unpkg.com; style-src 'self' 'unsafe-inline' https://unpkg.com; img-src 'self' data: https://unpkg.com; font-src 'self' https: data:; connect-src 'self';",
  );
  next();
};

const app = express();

app.set('trust proxy', 1);
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(requestLogger);
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: env.NODE_ENV === 'production' ? 15000 : 5000,
    skip: (req) => /^\/api\/v1\/cafes\/[^/]+\/availability$/.test(req.path),
  }),
);

// Điểm nhận thông báo tiền về từ dịch vụ đối soát ngân hàng. Mount TRƯỚC
// `/api/v1` router chính vì nó không đi qua `authenticate` — bên gọi là một
// dịch vụ máy-với-máy, xác thực bằng khoá API trong header.
app.use('/api/v1/payments', bankWebhookRouter);

// Ngân hàng mô phỏng — chỉ tồn tại khi được bật.
//
// Mount có điều kiện chứ không chặn bằng middleware: tắt cờ thì Express không
// biết đường dẫn này tồn tại và trả 404: không có dòng mã nào của phần mô phỏng
// chạy. Chặn bằng middleware thì mã vẫn nạp, vẫn chạy, chỉ là từ chối ở cuối.
if (env.devTools.enabled) {
  app.use('/dev-tools', devToolsRouter);
  if (env.NODE_ENV === 'production') {
    logger.warn(
      'DevTools',
      env.devTools.token
        ? 'Contest Lab ĐANG BẬT ở production, có khoá bảo vệ. Dữ liệu dựng ra là dữ liệu THẬT ' +
            'trong cơ sở dữ liệu vận hành.'
        : 'Contest Lab ĐANG BẬT ở production mà KHÔNG có khoá — ai biết đường dẫn cũng mở được. ' +
            'Khai DEV_TOOLS_TOKEN, hoặc tắt bằng DEV_TOOLS_ENABLED=false sau khi demo xong.',
    );
  }
}

// Điểm danh ngoài khung giờ giải — bật được cả ở production theo yêu cầu vận
// hành. Nói to lúc khởi động vì đây là cờ dễ bật rồi quên: nó không gây lỗi gì,
// chỉ âm thầm cho phép giao xe cho người chưa chắc suất.
if (env.bypassContestCheckInWindow) {
  logger.warn(
    'ContestCheckIn',
    'DEV_BYPASS_CONTEST_CHECKIN ĐANG BẬT — nhân viên điểm danh được cho giải chưa tới giờ, ' +
      'kể cả giải còn đang mở đăng ký. Mỗi lần dùng ghi một dòng kiểm toán ' +
      '`registration.checked_in_outside_window`. Tắt lại khi không còn cần.',
  );
}

if (env.bypassContestRegistrationWindow) {
  logger.warn(
    'ContestRegistration',
    'DEV_BYPASS_CONTEST_REGISTRATION_WINDOW ĐANG BẬT — CUSTOMER đăng ký được ngoài ' +
      'registration_opens_at/registration_closes_at khi contest vẫn OPEN. Mỗi lần dùng ghi ' +
      'audit `registration.created_outside_window`. Tắt lại khi không còn demo.',
  );
}

if (env.sandboxBank.enabled) {
  app.use('/api/v1/sandbox-bank', sandboxBankRouter);
  logger.warn(
    'SandboxBank',
    'ĐANG BẬT — mọi người quét mã QR đều tự xác nhận được booking mà không trả tiền. ' +
      'Tắt bằng SANDBOX_BANK_ENABLED=false trước khi vận hành thương mại.',
  );
} else {
  logger.info('SandboxBank', 'đang tắt — chỉ dịch vụ đối soát thật gọi được webhook');
}

app.use('/api/v1', router);
app.use('/api/payments/vnpay', vnpayRouter);
app.post('/api/payments/vnpay/create-payment-url', authenticate, createVnpayPayment);
app.get('/api/payments/vnpay-return', handleVnpayReturn);
app.get('/api/payments/vnpay-ipn', handleVnpayIpn);

app.use('/api-docs.json', swaggerDocsCsp);
app.get('/api-docs.json', (_req, res) => {
  res.json(createOpenApiSpec(app));
});
app.use('/api-docs', swaggerDocsCsp);
app.get('/api-docs', (_req, res) => {
  res.type('html').send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>RCField API Docs</title>
    <link
      rel="stylesheet"
      href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css"
      crossorigin="anonymous"
    />
    <style>
      body { margin: 0; background: #fafafa; }
      .topbar { display: none; }
    </style>
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js" crossorigin="anonymous"></script>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-standalone-preset.js" crossorigin="anonymous"></script>
    <script>
      window.ui = SwaggerUIBundle({
        url: '/api-docs.json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
        layout: 'BaseLayout',
      });
    </script>
  </body>
</html>`);
});

app.use(errorMiddleware);

export { app };
