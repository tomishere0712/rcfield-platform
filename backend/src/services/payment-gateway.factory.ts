import { AppError } from '../types';
import {
  type PaymentGateway,
  type SupportedPaymentGateway,
  isSupportedPaymentGateway,
} from './payment-gateway.interface';
import { bankTransferGateway } from './bank-transfer.gateway';
import { mockGateway } from './mock.gateway';
import { vnpayGateway } from './vnpay.gateway';

const gatewayMap: Record<SupportedPaymentGateway, PaymentGateway> = {
  vnpay: vnpayGateway,
  mock: mockGateway,
  bank_transfer: bankTransferGateway,
};

export function getPaymentGateway(gatewayName: string): PaymentGateway {
  const normalized = gatewayName.toLowerCase().trim();
  if (!isSupportedPaymentGateway(normalized)) {
    throw new AppError(
      `Unsupported payment gateway: ${gatewayName}`,
      400,
      'UNSUPPORTED_PAYMENT_GATEWAY',
    );
  }
  return gatewayMap[normalized];
}

export function getDefaultPaymentGateway(): PaymentGateway {
  return vnpayGateway;
}

export { bankTransferGateway, mockGateway, vnpayGateway };
export type { PaymentGateway };
