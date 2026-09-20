import QRCode from 'qrcode';
import { AppDataSource } from '../config/database';
import { logger } from '../config/logger';
import { CafePaymentSetting } from '../models/cafe-payment-setting.entity';
import { AppError, CafePaymentMethod } from '../types';
import { assertCafeOwner, getCafeOrThrow } from './cafe.service';
import { buildVietQrPayload, findBank } from './vietqr';

/**
 * Cấu hình tài khoản nhận tiền của một chi nhánh.
 *
 * ⚠️ Mọi hàm ở đây dùng `assertCafeOwner`, KHÔNG dùng `getManagedCafeOrThrow` —
 * hàm đó cho STAFF được phân công đi qua, và nhân viên không có việc gì với số
 * tài khoản ngân hàng của chủ quán.
 */

/** Số tiền tượng trưng của mã QR mẫu — đủ nhỏ để chủ quán quét thử thoải mái. */
const SAMPLE_QR_AMOUNT = 10_000;
const SAMPLE_QR_MEMO = 'RCFIELD TEST';

export interface CafePaymentSettingsView {
  method: CafePaymentMethod;
  bank_code: string | null;
  bank_name: string | null;
  account_number: string | null;
  account_name: string | null;
  is_verified: boolean;
  verified_at: string | null;
}

/**
 * Che số tài khoản, chỉ để lộ 4 số cuối.
 *
 * Đủ để chủ quán nhận ra đúng tài khoản của mình mà không phơi số đầy đủ lên
 * mọi màn hình và mọi bản ghi log.
 */
export function maskAccountNumber(accountNumber: string | null): string | null {
  if (!accountNumber) return null;
  if (accountNumber.length <= 4) return accountNumber;
  return `${'*'.repeat(Math.max(4, accountNumber.length - 4))}${accountNumber.slice(-4)}`;
}

function toView(
  settings: CafePaymentSetting | null,
  options: { revealAccountNumber?: boolean } = {},
): CafePaymentSettingsView | null {
  if (!settings) return null;
  const bank = settings.bankCode ? findBank(settings.bankCode) : null;

  return {
    method: settings.method,
    bank_code: settings.bankCode,
    bank_name: bank?.name ?? null,
    account_number: options.revealAccountNumber
      ? settings.accountNumber
      : maskAccountNumber(settings.accountNumber),
    account_name: settings.accountName,
    is_verified: settings.isVerified,
    verified_at: settings.verifiedAt?.toISOString() ?? null,
  };
}

async function loadOwnedSettings(
  cafeId: string,
  providerId: string,
): Promise<CafePaymentSetting | null> {
  const cafe = await getCafeOrThrow(cafeId);
  assertCafeOwner(cafe, providerId);
  return AppDataSource.getRepository(CafePaymentSetting).findOne({ where: { cafeId } });
}

/** Đọc cấu hình, số tài khoản đã che. */
export async function getSettings(
  cafeId: string,
  providerId: string,
): Promise<CafePaymentSettingsView | null> {
  return toView(await loadOwnedSettings(cafeId, providerId));
}

/** Đọc cấu hình kèm số tài khoản đầy đủ — chỉ dùng cho màn chỉnh sửa. */
export async function getSettingsForEdit(
  cafeId: string,
  providerId: string,
): Promise<CafePaymentSettingsView | null> {
  return toView(await loadOwnedSettings(cafeId, providerId), { revealAccountNumber: true });
}

export interface UpdateSettingsInput {
  method: CafePaymentMethod;
  bank_code?: string | null;
  account_number?: string | null;
  account_name?: string | null;
}

export async function updateSettings(
  cafeId: string,
  providerId: string,
  body: UpdateSettingsInput,
): Promise<CafePaymentSettingsView> {
  const cafe = await getCafeOrThrow(cafeId);
  assertCafeOwner(cafe, providerId);

  const repo = AppDataSource.getRepository(CafePaymentSetting);
  const existing = await repo.findOne({ where: { cafeId } });
  const settings = existing ?? repo.create({ cafeId, isVerified: false });

  if (body.method === CafePaymentMethod.BANK_TRANSFER) {
    if (!body.bank_code || !body.account_number || !body.account_name) {
      throw new AppError(
        'Chọn nhận chuyển khoản thì phải khai đủ ngân hàng, số tài khoản và tên chủ tài khoản.',
        400,
        'BANK_DETAILS_REQUIRED',
      );
    }

    const bank = findBank(body.bank_code);
    if (!bank) {
      throw new AppError(
        'Ngân hàng không nằm trong danh sách hỗ trợ VietQR.',
        422,
        'UNKNOWN_BANK_CODE',
      );
    }

    // Đổi tài khoản là mất xác minh. Làm ở service chứ không bằng trigger để
    // còn ghi được vết ai đổi lúc nào — và vì đây là ràng buộc nghiệp vụ, không
    // phải ràng buộc dữ liệu.
    const accountChanged =
      settings.bankBin !== bank.bin || settings.accountNumber !== body.account_number;

    settings.method = CafePaymentMethod.BANK_TRANSFER;
    settings.bankCode = bank.code;
    settings.bankBin = bank.bin;
    settings.accountNumber = body.account_number;
    settings.accountName = body.account_name;

    if (accountChanged) {
      settings.isVerified = false;
      settings.verifiedAt = null;
      settings.verifiedBy = null;
    }
  } else {
    settings.method = CafePaymentMethod.VNPAY;
    settings.isVerified = false;
    settings.verifiedAt = null;
    settings.verifiedBy = null;
  }

  const saved = await repo.save(settings);

  logger.info('CafePaymentSettings', 'cập nhật cấu hình nhận tiền', {
    cafeId,
    providerId,
    method: saved.method,
    isVerified: saved.isVerified,
    // Cố ý KHÔNG log số tài khoản.
  });

  return toView(saved)!;
}

export interface SampleQrView {
  qr_payload: string;
  qr_image_data_url: string;
  amount: number;
  memo: string;
  bank_name: string;
  account_number: string;
  account_name: string;
}

/**
 * Mã QR mẫu để chủ quán tự quét kiểm tra trước khi bật.
 *
 * ⚠️ LUÔN là mã ngân hàng THẬT, kể cả khi ngân hàng mô phỏng đang bật. Hàm này
 * gọi thẳng bộ dựng VietQR chứ không đi qua factory cổng thanh toán, đúng vì lý
 * do đó.
 *
 * Nếu mã mẫu cũng bị thay bằng mã mô phỏng, việc quét thử chỉ hiển thị lại đúng
 * dữ liệu chủ quán vừa gõ vào — hàng rào an toàn duy nhất chặn lỗi gõ sai một
 * chữ số trở thành nghi thức rỗng, và tiền của mọi khách sẽ chảy vào tài khoản
 * người lạ mà hệ thống không có cách nào tự phát hiện.
 */
export async function buildSampleQr(cafeId: string, providerId: string): Promise<SampleQrView> {
  const settings = await loadOwnedSettings(cafeId, providerId);

  if (
    !settings ||
    settings.method !== CafePaymentMethod.BANK_TRANSFER ||
    !settings.bankBin ||
    !settings.accountNumber ||
    !settings.accountName
  ) {
    throw new AppError(
      'Khai đủ thông tin tài khoản trước khi xem mã QR mẫu.',
      400,
      'BANK_DETAILS_REQUIRED',
    );
  }

  const qrPayload = buildVietQrPayload({
    bankBin: settings.bankBin,
    accountNumber: settings.accountNumber,
    amount: SAMPLE_QR_AMOUNT,
    memo: SAMPLE_QR_MEMO,
  });

  const bank = settings.bankCode ? findBank(settings.bankCode) : null;

  return {
    qr_payload: qrPayload,
    // Sinh ở 720px cho một ô hiển thị ~208px: màn retina vẽ ở 2–3x, ảnh nhỏ hơn
    // kích thước hiển thị thật sẽ bị nội suy nhòe và trông rất thô. Ảnh QR đen
    // trắng nén PNG rất tốt nên phóng to gần như không tốn thêm dung lượng.
    //
    // `margin: 4` là vùng trắng tối thiểu theo chuẩn QR. Trước đây để 1 — vẫn
    // quét được vì nền quanh mã cũng trắng, nhưng ai cắt riêng ảnh mã ra gửi đi
    // thì mất vùng trắng và máy quét khó tính sẽ đọc hụt.
    qr_image_data_url: await QRCode.toDataURL(qrPayload, {
      errorCorrectionLevel: 'M',
      margin: 4,
      width: 720,
    }),
    amount: SAMPLE_QR_AMOUNT,
    memo: SAMPLE_QR_MEMO,
    bank_name: bank?.name ?? settings.bankCode ?? 'Ngân hàng',
    account_number: settings.accountNumber,
    account_name: settings.accountName,
  };
}

/** Chủ quán xác nhận đã quét mã mẫu và thấy đúng tên mình. */
export async function verifySettings(
  cafeId: string,
  providerId: string,
): Promise<CafePaymentSettingsView> {
  const settings = await loadOwnedSettings(cafeId, providerId);

  if (
    !settings ||
    settings.method !== CafePaymentMethod.BANK_TRANSFER ||
    !settings.bankBin ||
    !settings.accountNumber
  ) {
    throw new AppError('Chưa có cấu hình chuyển khoản nào để xác minh.', 400, 'NOTHING_TO_VERIFY');
  }

  settings.isVerified = true;
  settings.verifiedAt = new Date();
  settings.verifiedBy = providerId;

  const saved = await AppDataSource.getRepository(CafePaymentSetting).save(settings);

  logger.info('CafePaymentSettings', 'chủ quán xác minh tài khoản nhận tiền', {
    cafeId,
    providerId,
  });

  return toView(saved)!;
}
