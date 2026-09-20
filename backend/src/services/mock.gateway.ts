import { env } from '../config/env';
import {
  type CreatePaymentUrlInput,
  type PaymentGateway,
  type PaymentUrlResult,
  type PaymentVerificationResult,
} from './payment-gateway.interface';

export const MOCK_RETURN_PATH = '/api/v1/payments/mock/return';

export const mockGateway: PaymentGateway = {
  name: 'MOCK',

  createPaymentUrl(input: CreatePaymentUrlInput): PaymentUrlResult {
    const returnUrl = input.returnUrl
      ? `${input.returnUrl}?txn_ref=${encodeURIComponent(input.txnRef)}`
      : `${env.apiBaseUrl}${MOCK_RETURN_PATH}?txn_ref=${encodeURIComponent(input.txnRef)}`;

    const paymentUrl = `${env.apiBaseUrl}/api/v1/payments/mock/checkout?txn_ref=${encodeURIComponent(
      input.txnRef,
    )}&amount=${Math.round(input.amount)}&return_url=${encodeURIComponent(returnUrl)}`;

    return {
      payment_url: paymentUrl,
      txn_ref: input.txnRef,
      gateway: this.name,
      flow: 'mock_page',
    };
  },

  verifyCallback(params: Record<string, unknown>): PaymentVerificationResult {
    const txnRef = String(params.txn_ref ?? params.vnp_TxnRef ?? '');
    const status = String(params.status ?? 'success');
    const amount = Number(params.amount ?? 0);
    const isSuccess = status === 'success';

    return {
      isValid: true,
      isSuccess,
      txnRef,
      amount,
      responseCode: isSuccess ? '00' : '01',
      transactionStatus: isSuccess ? '00' : '01',
      raw: { ...params, gateway: 'MOCK' },
    };
  },
};
