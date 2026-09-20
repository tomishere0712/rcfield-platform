import { logger } from '../config/logger';

/**
 * Tra mã số thuế qua VietQR, dữ liệu gốc từ Cục Thuế (gdt.gov.vn).
 *
 * Dùng để hai việc: điền sẵn tên và địa chỉ pháp lý cho người đăng ký, và chặn
 * hồ sơ khai mã số thuế bịa hoặc mã của cơ sở đã ngừng hoạt động.
 *
 * Hai điều phải nhớ khi đọc code dưới đây:
 *
 * 1. API LUÔN trả HTTP 200, kể cả khi không tìm thấy. Kết luận nằm ở trường
 *    `code` trong body, không phải ở mã HTTP.
 * 2. Dữ liệu trễ khoảng hai tháng so với Cục Thuế (xem `metadata.disclaimer`),
 *    nên doanh nghiệp vừa thành lập có thể chưa có mặt.
 */
const VIETQR_BUSINESS_URL = 'https://api.vietqr.io/v2/business';
const LOOKUP_TIMEOUT_MS = 8000;

/** Mã nghiệp vụ VietQR trả trong body. */
const VIETQR_CODE = {
  SUCCESS: '00',
  NOT_FOUND: '51',
  INVALID: '52',
} as const;

export type TaxLookupOutcome =
  /** Tìm thấy và đang hoạt động — hồ sơ đi tiếp được. */
  | { status: 'ACTIVE'; business: TaxBusinessInfo }
  /** Tìm thấy nhưng Cục Thuế ghi nhận không còn hoạt động bình thường. */
  | { status: 'INACTIVE'; business: TaxBusinessInfo }
  | { status: 'NOT_FOUND' }
  | { status: 'INVALID' }
  /** Không hỏi được (mạng lỗi, quá hạn chờ, API đổi định dạng). */
  | { status: 'UNAVAILABLE' };

export type TaxBusinessInfo = {
  taxCode: string;
  legalName: string;
  internationalName: string | null;
  shortName: string | null;
  address: string | null;
  /** Nguyên văn từ Cục Thuế, ví dụ "NNT đang hoạt động". */
  taxStatus: string;
};

type VietQrResponse = {
  code?: string;
  desc?: string;
  data?: {
    id?: string;
    name?: string;
    internationalName?: string | null;
    shortName?: string | null;
    address?: string | null;
    status?: string;
  } | null;
};

/**
 * Cục Thuế mô tả trạng thái bằng câu chữ chứ không phải enum, và các câu xấu
 * đều bắt đầu bằng "NNT không hoạt động…" hoặc "NNT ngừng…". Nên nhận diện
 * theo mặt tốt: chỉ "đang hoạt động" mới được đi tiếp, còn lại coi là có vấn đề.
 */
function isOperating(taxStatus: string): boolean {
  return taxStatus.toLowerCase().includes('đang hoạt động');
}

export function normalizeTaxCode(raw: string): string {
  return raw.trim().replace(/\s+/g, '');
}

export async function lookupBusinessByTaxCode(rawTaxCode: string): Promise<TaxLookupOutcome> {
  const taxCode = normalizeTaxCode(rawTaxCode);
  if (!/^\d{10}(-\d{3})?$/.test(taxCode)) return { status: 'INVALID' };

  let payload: VietQrResponse;
  try {
    const response = await fetch(`${VIETQR_BUSINESS_URL}/${encodeURIComponent(taxCode)}`, {
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
    });
    if (!response.ok) {
      logger.warn('TaxLookup', `VietQR trả HTTP ${response.status} cho ${taxCode}`);
      return { status: 'UNAVAILABLE' };
    }
    payload = (await response.json()) as VietQrResponse;
  } catch (error) {
    logger.error('TaxLookup', `không gọi được VietQR cho ${taxCode}`, error);
    return { status: 'UNAVAILABLE' };
  }

  if (payload.code === VIETQR_CODE.NOT_FOUND) return { status: 'NOT_FOUND' };
  if (payload.code === VIETQR_CODE.INVALID) return { status: 'INVALID' };
  if (payload.code !== VIETQR_CODE.SUCCESS || !payload.data?.name) {
    logger.warn('TaxLookup', `VietQR trả mã lạ "${payload.code}" cho ${taxCode}`);
    return { status: 'UNAVAILABLE' };
  }

  const business: TaxBusinessInfo = {
    taxCode,
    legalName: payload.data.name,
    internationalName: payload.data.internationalName ?? null,
    shortName: payload.data.shortName ?? null,
    address: payload.data.address ?? null,
    taxStatus: payload.data.status ?? '',
  };

  return isOperating(business.taxStatus)
    ? { status: 'ACTIVE', business }
    : { status: 'INACTIVE', business };
}
