import crypto from 'crypto';
import { env } from '../config/env';
import { AppError } from '../types';

const VNPAY_VERSION = '2.1.0';
const VNPAY_COMMAND = 'pay';
const DEFAULT_PAYMENT_TTL_MINUTES = 15;

/**
 * Thông tin cổng dùng cho một giao dịch.
 *
 * Không truyền nghĩa là dùng cấu hình cấp nền tảng trong biến môi trường —
 * đúng hành vi có từ trước. Truyền vào là đi qua cổng riêng của chi nhánh.
 */
export interface VnpayGatewayCredentials {
  tmnCode: string;
  hashSecret: string;
  paymentUrl: string;
}

export interface CreateVnpayPaymentInput {
  amount: number;
  txnRef: string;
  orderInfo: string;
  orderType?: string;
  ipAddr: string;
  bankCode?: string;
  returnUrl?: string;
  credentials?: VnpayGatewayCredentials;
}

export interface VnpayVerificationResult {
  isValid: boolean;
  isSuccess: boolean;
  txnRef: string;
  amount: number;
  responseCode: string;
  transactionStatus?: string;
  transactionNo?: string;
  bankCode?: string;
  payDate?: string;
  raw: Record<string, string>;
}

type VnpayParams = Record<string, string>;

function resolveCredentials(credentials?: VnpayGatewayCredentials): VnpayGatewayCredentials {
  const resolved = credentials ?? {
    tmnCode: env.vnpay.tmnCode,
    hashSecret: env.vnpay.hashSecret,
    paymentUrl: env.vnpay.paymentUrl,
  };
  if (!resolved.tmnCode || !resolved.hashSecret || !resolved.paymentUrl) {
    throw new AppError('VNPay is not configured', 500, 'VNPAY_NOT_CONFIGURED');
  }
  return resolved;
}

function formatVnpayDate(date = new Date()): string {
  const vietnamTime = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  const year = vietnamTime.getUTCFullYear();
  const month = String(vietnamTime.getUTCMonth() + 1).padStart(2, '0');
  const day = String(vietnamTime.getUTCDate()).padStart(2, '0');
  const hours = String(vietnamTime.getUTCHours()).padStart(2, '0');
  const minutes = String(vietnamTime.getUTCMinutes()).padStart(2, '0');
  const seconds = String(vietnamTime.getUTCSeconds()).padStart(2, '0');

  return `${year}${month}${day}${hours}${minutes}${seconds}`;
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function normalizeOrderInfo(orderInfo: string): string {
  return orderInfo
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9 .:_-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 255);
}

function filterParams(params: VnpayParams): VnpayParams {
  return Object.keys(params)
    .sort()
    .reduce<VnpayParams>((acc, key) => {
      const value = params[key];
      if (value !== undefined && value !== null && String(value) !== '') {
        acc[key] = String(value);
      }
      return acc;
    }, {});
}

// VNPay PHP server verifies using urlencode() which encodes spaces as '+'.
// URLSearchParams.toString() matches this behavior — DO NOT use raw strings.
function buildSignData(params: VnpayParams): string {
  return new URLSearchParams(filterParams(params)).toString();
}

function normalizeIp(ipAddr: string): string {
  const normalized = ipAddr.replace(/^::ffff:/, '').trim();
  return !normalized || normalized === '::1' ? '127.0.0.1' : normalized;
}

export function createPaymentUrl(input: CreateVnpayPaymentInput): string {
  const credentials = resolveCredentials(input.credentials);

  const createDate = new Date();
  const params: VnpayParams = {
    vnp_Version: VNPAY_VERSION,
    vnp_Command: VNPAY_COMMAND,
    vnp_TmnCode: credentials.tmnCode,
    vnp_Amount: String(Math.round(input.amount) * 100),
    vnp_CurrCode: env.vnpay.currCode,
    vnp_TxnRef: input.txnRef,
    vnp_OrderInfo: normalizeOrderInfo(input.orderInfo),
    vnp_OrderType: input.orderType ?? 'other',
    vnp_Locale: env.vnpay.locale,
    vnp_ReturnUrl: input.returnUrl ?? env.vnpay.returnUrl,
    vnp_IpAddr: normalizeIp(input.ipAddr),
    vnp_CreateDate: formatVnpayDate(createDate),
    vnp_ExpireDate: formatVnpayDate(addMinutes(createDate, DEFAULT_PAYMENT_TTL_MINUTES)),
  };

  if (input.bankCode) {
    params.vnp_BankCode = input.bankCode.trim().toUpperCase();
  }

  // Build URL using URL API — same URLSearchParams encoding used for signing
  const redirectUrl = new URL(credentials.paymentUrl);
  Object.entries(filterParams(params)).forEach(([key, value]) =>
    redirectUrl.searchParams.append(key, value),
  );

  const signData = redirectUrl.search.slice(1); // query string without leading '?'
  const secureHash = crypto
    .createHmac('sha512', credentials.hashSecret)
    .update(Buffer.from(signData, 'utf-8'))
    .digest('hex');

  redirectUrl.searchParams.append('vnp_SecureHash', secureHash);
  return redirectUrl.toString();
}

export function verifyVnpayParams(
  params: Record<string, unknown>,
  credentials?: VnpayGatewayCredentials,
): VnpayVerificationResult {
  const resolved = resolveCredentials(credentials);

  const receivedHash = String(params.vnp_SecureHash ?? '');
  const signingParams = Object.entries(params).reduce<VnpayParams>((acc, [key, value]) => {
    if (
      key.startsWith('vnp_') &&
      key !== 'vnp_SecureHash' &&
      key !== 'vnp_SecureHashType' &&
      value !== undefined
    ) {
      acc[key] = String(value);
    }
    return acc;
  }, {});

  const signData = buildSignData(signingParams);
  const expectedHash = crypto
    .createHmac('sha512', resolved.hashSecret)
    .update(Buffer.from(signData, 'utf-8'))
    .digest('hex');

  const isValid =
    receivedHash.length === expectedHash.length &&
    crypto.timingSafeEqual(Buffer.from(receivedHash), Buffer.from(expectedHash));
  const responseCode = signingParams.vnp_ResponseCode ?? '';
  const transactionStatus = signingParams.vnp_TransactionStatus;

  return {
    isValid,
    isSuccess:
      isValid && responseCode === '00' && (!transactionStatus || transactionStatus === '00'),
    txnRef: signingParams.vnp_TxnRef ?? '',
    amount: Number(signingParams.vnp_Amount ?? 0) / 100,
    responseCode,
    transactionStatus,
    transactionNo: signingParams.vnp_TransactionNo,
    bankCode: signingParams.vnp_BankCode,
    payDate: signingParams.vnp_PayDate,
    raw: signingParams,
  };
}
