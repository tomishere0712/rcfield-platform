import request from 'supertest';
import { app } from '../../app';
import { env } from '../../config/env';
import { seedBankPaymentScenario } from '../helpers/bank-payment.fixture';

/**
 * Trang ngân hàng mô phỏng.
 *
 * Bộ test này tồn tại vì một lỗi đã xảy ra thật: CSP mặc định của Helmet đặt
 * `script-src 'self'`, chặn khối `<script>` inline của trang — nút "Xác nhận
 * chuyển khoản" mất handler và bấm không ra gì cả. Không lỗi, không log, không
 * dấu hiệu nào. Loại hỏng im lặng đó chỉ có test mới bắt được.
 */
describe('ngân hàng mô phỏng', () => {
  const enabled = env.sandboxBank.enabled;

  (enabled ? describe : describe.skip)('khi đang bật', () => {
    it('trang thanh toán cho phép script inline chạy', async () => {
      const fx = await seedBankPaymentScenario();

      const res = await request(app).get(`/api/v1/sandbox-bank/pay?ref=${fx.refCode}`);

      expect(res.status).toBe(200);
      const csp = res.headers['content-security-policy'] ?? '';
      expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    });

    it('trang chứa nút xác nhận và lời gọi tới điểm nhận chuyển khoản', async () => {
      const fx = await seedBankPaymentScenario();

      const res = await request(app).get(`/api/v1/sandbox-bank/pay?ref=${fx.refCode}`);

      expect(res.text).toContain('Xác nhận chuyển khoản');
      expect(res.text).toContain('/api/v1/sandbox-bank/transfer');
      // Nhãn cảnh báo phải có, để không ai tưởng đã trả tiền thật.
      expect(res.text).toContain('Giao dịch mô phỏng');
    });

    it('điền sẵn số tiền và số tài khoản, khách không phải gõ gì', async () => {
      const fx = await seedBankPaymentScenario({ amount: 350000 });

      const res = await request(app).get(`/api/v1/sandbox-bank/pay?ref=${fx.refCode}`);

      expect(res.text).toContain('350.000đ');
      expect(res.text).toContain(fx.accountNumber);
      expect(res.text).toContain(fx.refCode);
      // Không có ô nhập nào — số tiền là văn bản tĩnh.
      expect(res.text).not.toContain('<input');
    });

    it('khoá nút sau lần bấm đầu để không tạo hai giao dịch', async () => {
      const fx = await seedBankPaymentScenario();

      const res = await request(app).get(`/api/v1/sandbox-bank/pay?ref=${fx.refCode}`);

      expect(res.text).toContain('button.disabled = true');
    });

    it('mã tham chiếu không tồn tại thì trả trang lỗi thân thiện, không phải JSON', async () => {
      const res = await request(app).get('/api/v1/sandbox-bank/pay?ref=RCFZZZZZ');

      expect(res.status).toBe(404);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.text).toContain('Không thực hiện được');
    });

    it('chuyển khoản cho mã không tồn tại thì từ chối', async () => {
      const res = await request(app)
        .post('/api/v1/sandbox-bank/transfer')
        .send({ ref: 'RCFZZZZZ' });

      expect(res.status).toBe(404);
    });
  });

  (enabled ? describe.skip : describe)('khi đang tắt', () => {
    it('mọi đường dẫn mô phỏng trả 404 — router không được mount', async () => {
      const pay = await request(app).get('/api/v1/sandbox-bank/pay?ref=RCF12345');
      const transfer = await request(app)
        .post('/api/v1/sandbox-bank/transfer')
        .send({ ref: 'RCF12345' });

      expect(pay.status).toBe(404);
      expect(transfer.status).toBe(404);
    });

    it('điểm nhận thông báo tiền về VẪN hoạt động — phần thật không phụ thuộc phần mô phỏng', async () => {
      const res = await request(app)
        .post('/api/v1/payments/bank-webhook')
        .set('Authorization', `Apikey ${env.bankWebhook.apiKey || 'x'}`)
        .send({
          id: 880001,
          gateway: 'SEPAY',
          transactionDate: '2026-08-11 10:00:00',
          accountNumber: '0000000000',
          content: 'khong khop',
          transferType: 'in',
          transferAmount: 1000,
          referenceCode: 'Z',
        });

      expect([200, 401]).toContain(res.status);
    });
  });
});
