import {
  type CreatePaymentUrlInput,
  type PaymentGateway,
  type PaymentUrlResult,
  type PaymentVerificationResult,
} from './payment-gateway.interface';
import { createPaymentUrl, verifyVnpayParams } from './vnpay.service';

export const vnpayGateway: PaymentGateway = {
  name: 'VNPAY',

  createPaymentUrl(input: CreatePaymentUrlInput): PaymentUrlResult {
    const paymentUrl = createPaymentUrl({
      amount: input.amount,
      txnRef: input.txnRef,
      orderInfo: input.orderInfo,
      orderType: input.orderType,
      bankCode: input.bankCode,
      ipAddr: input.ipAddr,
      returnUrl: input.returnUrl,
      credentials: input.credentials,
    });

    return {
      payment_url: paymentUrl,
      txn_ref: input.txnRef,
      gateway: this.name,
      flow: 'redirect',
    };
  },

  verifyCallback(
    params: Record<string, unknown>,
    credentials?: CreatePaymentUrlInput['credentials'],
  ): PaymentVerificationResult {
    return verifyVnpayParams(params, credentials);
  },
};
