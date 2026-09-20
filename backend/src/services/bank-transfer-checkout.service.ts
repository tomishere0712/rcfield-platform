import QRCode from 'qrcode';
import { AppDataSource } from '../config/database';
import { env } from '../config/env';
import { PaymentTransaction } from '../models/payment-transaction.entity';
import { AppError } from '../types';
import { buildVietQrPayload, findBank, generatePaymentRefCode } from './vietqr';
import { getVerifiedBankSettings } from './payment-method-resolver';

/**
 * Dựng phiên thanh toán chuyển khoản: mã tham chiếu và ảnh QR.
 *
 * Tách khỏi `payment.service` để CẮT VÒNG LẶP IMPORT. `payment.service` đã nhập
 * `activateCustomerPackage` từ `customer-package.service`; nếu chiều ngược lại
 * cũng nhập thẳng `payment.service` thì hai module tham chiếu vòng, và với
 * CommonJS một trong hai bên sẽ nhận `undefined` tuỳ thứ tự nạp — hỏng lúc chạy
 * chứ không hỏng lúc biên dịch. Đặt phần dùng chung ở đây thì cả hai cùng nhập
 * xuống một module lá, không ai nhập ngược lên.
 */

/** Dữ liệu mã QR chuyển khoản, chỉ có khi cổng là `bank_transfer`. */
export interface BankTransferCheckout {
  qr_payload: string;
  qr_image_data_url: string;
  ref_code: string;
  bank_name: string;
  account_number: string;
  account_name: string;
  amount: number;
  expires_at: string;
  is_sandbox: boolean;
  sandbox_url?: string;
}

/**
 * Cấp một mã tham chiếu chưa ai dùng.
 *
 * Không gian mã ~1 triệu tổ hợp và chỉ những giao dịch chưa hoàn tất mới thực sự
 * cạnh tranh, nên đụng nhau là hiếm; vòng thử lại ở đây là để đúng chứ không
 * phải để nhanh.
 */
export async function allocatePaymentRefCode(): Promise<string> {
  const txRepo = AppDataSource.getRepository(PaymentTransaction);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = generatePaymentRefCode();
    const clash = await txRepo.findOne({ where: { paymentRefCode: candidate } });
    if (!clash) return candidate;
  }
  throw new AppError(
    'Không cấp được mã tham chiếu thanh toán, thử lại sau.',
    500,
    'REF_CODE_ALLOCATION_FAILED',
  );
}

/** Dựng mã QR VietQR cho một lần thanh toán chuyển khoản. */
export async function buildBankTransferCheckout(input: {
  cafeId: string;
  amount: number;
  refCode: string;
  expiresAt: Date;
}): Promise<BankTransferCheckout> {
  const settings = await getVerifiedBankSettings(input.cafeId);
  if (!settings?.bankBin || !settings.accountNumber || !settings.accountName) {
    throw new AppError(
      'Chi nhánh chưa cấu hình xong tài khoản nhận chuyển khoản.',
      400,
      'PAYMENT_METHOD_UNAVAILABLE',
    );
  }

  const qrPayload = buildVietQrPayload({
    bankBin: settings.bankBin,
    accountNumber: settings.accountNumber,
    amount: input.amount,
    memo: input.refCode,
  });

  const bank = settings.bankCode ? findBank(settings.bankCode) : null;

  // Chế độ mô phỏng đổi NỘI DUNG mã QR sang đường dẫn trang ngân hàng giả lập,
  // để quét bằng camera là mở được ngay — mã ngân hàng thật sẽ mở app ngân hàng
  // và không có cách nào tự báo về cho hệ thống.
  const sandboxUrl = env.sandboxBank.enabled
    ? new URL(`/api/v1/sandbox-bank/pay?ref=${input.refCode}`, env.apiBaseUrl).toString()
    : undefined;

  // Sinh ở 720px cho ô hiển thị ~256px: màn retina vẽ ở 2–3x, ảnh nhỏ hơn kích
  // thước hiển thị thật sẽ bị nội suy nhòe. Ảnh QR đen trắng nén PNG rất tốt
  // nên phóng to gần như không tốn thêm dung lượng.
  //
  // `margin: 4` là vùng trắng tối thiểu theo chuẩn QR. Để 1 thì ai chụp màn
  // hình rồi cắt riêng mã ra gửi đi sẽ mất vùng trắng, máy quét khó tính đọc
  // hụt — mà chụp màn gửi cho người khác trả hộ là chuyện xảy ra thật.
  const qrContent = sandboxUrl ?? qrPayload;
  const qrImageDataUrl = await QRCode.toDataURL(qrContent, {
    errorCorrectionLevel: 'M',
    margin: 4,
    width: 720,
  });

  return {
    qr_payload: qrContent,
    qr_image_data_url: qrImageDataUrl,
    ref_code: input.refCode,
    bank_name: bank?.name ?? settings.bankCode ?? 'Ngân hàng',
    account_number: settings.accountNumber,
    account_name: settings.accountName,
    amount: input.amount,
    expires_at: input.expiresAt.toISOString(),
    is_sandbox: env.sandboxBank.enabled,
    sandbox_url: sandboxUrl,
  };
}
