import { env } from '../config/env';
import { AppError } from '../types';
import type {
  CreatePaymentUrlInput,
  PaymentGateway,
  PaymentUrlResult,
  PaymentVerificationResult,
} from './payment-gateway.interface';

/**
 * Chuyển khoản thẳng vào tài khoản ngân hàng của chi nhánh.
 *
 * Khác mọi cổng còn lại ở một điểm cốt lõi: **không có callback đồng bộ**.
 * Khách rời khỏi trang để mở app ngân hàng, và hệ thống chỉ biết tiền đã về khi
 * dịch vụ đối soát gửi thông báo tới `POST /payments/bank-webhook`. Vì thế
 * `createPaymentUrl` chỉ trả về đường dẫn trang chờ, còn dữ liệu mã QR thật do
 * `payment.service` dựng — nó là chỗ duy nhất biết chi nhánh nào, tài khoản nào.
 */
class BankTransferGateway implements PaymentGateway {
  readonly name = 'BANK_TRANSFER';

  createPaymentUrl(input: CreatePaymentUrlInput): PaymentUrlResult {
    // Trang chờ nằm ở frontend chứ không phải cổng ngoài — khách ở lại trong
    // ứng dụng và màn hình tự đổi trạng thái khi tiền về.
    const target = new URL(`/payment/bank-transfer/${input.txnRef}`, env.frontendUrl);

    return {
      payment_url: target.toString(),
      txn_ref: input.txnRef,
      gateway: this.name,
      flow: 'bank_transfer',
    };
  }

  /**
   * Cổng này KHÔNG xác nhận qua callback đồng bộ — không thiếu sót, là bản chất.
   *
   * Ngân hàng không gọi ngược về khi khách bấm chuyển tiền trong app của họ.
   * Đường xác nhận duy nhất là webhook của dịch vụ đối soát, đi qua
   * `bank-webhook.service.ts` rồi vào `processConfirmationResult` — cùng hàm mà
   * luồng VNPay dùng.
   */
  verifyCallback(_params: Record<string, unknown>): PaymentVerificationResult {
    throw new AppError(
      'Cổng chuyển khoản không nhận callback đồng bộ; xác nhận đi qua webhook đối soát.',
      500,
      'BANK_TRANSFER_HAS_NO_CALLBACK',
    );
  }
}

export const bankTransferGateway = new BankTransferGateway();
