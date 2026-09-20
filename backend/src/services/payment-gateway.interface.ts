export interface CreatePaymentUrlInput {
  amount: number;
  txnRef: string;
  orderInfo: string;
  ipAddr: string;
  returnUrl?: string;
  orderType?: string;
  bankCode?: string;
  /**
   * Thông tin cổng riêng của chi nhánh. Bỏ trống là dùng cấu hình cấp nền tảng.
   * Chỉ VNPay đọc tới; các cổng khác bỏ qua.
   */
  credentials?: {
    tmnCode: string;
    hashSecret: string;
    paymentUrl: string;
  };
}

export interface PaymentUrlResult {
  payment_url: string;
  txn_ref: string;
  gateway: string;
  /**
   * Cách frontend xử lý kết quả.
   *
   * `redirect` — chuyển hướng sang cổng thanh toán, hành vi có từ trước.
   * `bank_transfer` — giữ khách ở lại, hiện mã QR, chờ webhook báo tiền về.
   */
  flow: 'redirect' | 'mock_page' | 'bank_transfer';
}

export interface PaymentVerificationResult {
  isValid: boolean;
  isSuccess: boolean;
  txnRef: string;
  amount: number;
  responseCode: string;
  transactionStatus?: string;
  transactionNo?: string;
  bankCode?: string;
  payDate?: string;
  raw: Record<string, unknown>;
}

export interface PaymentGateway {
  readonly name: string;
  createPaymentUrl(input: CreatePaymentUrlInput): PaymentUrlResult;
  verifyCallback(
    params: Record<string, unknown>,
    credentials?: CreatePaymentUrlInput['credentials'],
  ): PaymentVerificationResult;
}

export interface ProcessConfirmationResult {
  rspCode: string;
  message: string;
  success: boolean;
}

/** Gateways supported by the booking payment flow. */
export const SUPPORTED_PAYMENT_GATEWAYS = ['vnpay', 'mock', 'bank_transfer'] as const;
export type SupportedPaymentGateway = (typeof SUPPORTED_PAYMENT_GATEWAYS)[number];

export function isSupportedPaymentGateway(value: string): value is SupportedPaymentGateway {
  return (SUPPORTED_PAYMENT_GATEWAYS as readonly string[]).includes(value);
}
