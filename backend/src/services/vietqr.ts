import { randomInt } from 'crypto';
import { AppError } from '../types';

/**
 * Dựng chuỗi VietQR (EMVCo Merchant-Presented QR) và sinh mã tham chiếu.
 *
 * Cố ý KHÔNG gọi `api.vietqr.io` lúc chạy. Sinh mã thanh toán mà phụ thuộc một
 * dịch vụ mạng ngoài nghĩa là dịch vụ đó sập thì không ai đặt lịch được — đổi
 * một phụ thuộc cứng lấy vài chục dòng bảng tra là món hời.
 */

export interface VietQrBank {
  /** Mã ngắn hiển thị cho người dùng. */
  code: string;
  /** Tên đầy đủ tiếng Việt. */
  name: string;
  /** BIN do Napas cấp — thứ thực sự đi vào chuỗi QR. */
  bin: string;
}

/**
 * Các ngân hàng Việt Nam hỗ trợ VietQR, đủ phủ gần hết thị phần cá nhân.
 * Thêm ngân hàng mới chỉ cần thêm một dòng, không cần migration.
 */
export const VIETQR_BANKS: readonly VietQrBank[] = [
  { code: 'VCB', name: 'Vietcombank', bin: '970436' },
  { code: 'TCB', name: 'Techcombank', bin: '970407' },
  { code: 'MB', name: 'MB Bank', bin: '970422' },
  { code: 'VTB', name: 'VietinBank', bin: '970415' },
  { code: 'BIDV', name: 'BIDV', bin: '970418' },
  { code: 'ACB', name: 'ACB', bin: '970416' },
  { code: 'VPB', name: 'VPBank', bin: '970432' },
  { code: 'TPB', name: 'TPBank', bin: '970423' },
  { code: 'STB', name: 'Sacombank', bin: '970403' },
  { code: 'HDB', name: 'HDBank', bin: '970437' },
  { code: 'VIB', name: 'VIB', bin: '970441' },
  { code: 'SHB', name: 'SHB', bin: '970443' },
  { code: 'MSB', name: 'MSB', bin: '970426' },
  { code: 'OCB', name: 'OCB', bin: '970448' },
  { code: 'SEAB', name: 'SeABank', bin: '970440' },
  { code: 'EIB', name: 'Eximbank', bin: '970431' },
  { code: 'NAB', name: 'Nam A Bank', bin: '970428' },
  { code: 'PVCB', name: 'PVcomBank', bin: '970412' },
  { code: 'LPB', name: 'LPBank', bin: '970449' },
  { code: 'ABB', name: 'ABBANK', bin: '970425' },
  { code: 'BAB', name: 'Bac A Bank', bin: '970409' },
  { code: 'VAB', name: 'VietABank', bin: '970427' },
  { code: 'SGICB', name: 'Saigonbank', bin: '970400' },
  { code: 'BVB', name: 'BaoVietBank', bin: '970438' },
  { code: 'VCCB', name: 'BVBank', bin: '970454' },
  { code: 'KLB', name: 'KienLongBank', bin: '970452' },
  { code: 'NCB', name: 'NCB', bin: '970419' },
  { code: 'PGB', name: 'PGBank', bin: '970430' },
  { code: 'VRB', name: 'VRB', bin: '970421' },
  { code: 'AGR', name: 'Agribank', bin: '970405' },
  { code: 'SCB', name: 'SCB', bin: '970429' },
  { code: 'DOB', name: 'DongA Bank', bin: '970406' },
  { code: 'GPB', name: 'GPBank', bin: '970408' },
  { code: 'OCEANBANK', name: 'Ocean Bank', bin: '970414' },
  { code: 'CAKE', name: 'CAKE by VPBank', bin: '546034' },
  { code: 'UBANK', name: 'Ubank by VPBank', bin: '546035' },
  { code: 'TIMO', name: 'Timo by BVBank', bin: '963388' },
  { code: 'VIETBANK', name: 'VietBank', bin: '970433' },
  { code: 'HLBVN', name: 'Hong Leong Bank', bin: '970442' },
  { code: 'IVB', name: 'Indovina Bank', bin: '970434' },
] as const;

/** Tra ngân hàng theo mã ngắn. Trả `null` thay vì ném để chỗ gọi tự quyết định. */
export function findBank(code: string): VietQrBank | null {
  const normalized = code.trim().toUpperCase();
  return VIETQR_BANKS.find((bank) => bank.code === normalized) ?? null;
}

export interface BankOption {
  code: string;
  name: string;
}

/**
 * Danh sách ngân hàng cho ô chọn ở giao diện, sắp theo tên.
 *
 * Bỏ `bin` đi: giao diện không cần nó, và BIN là thứ đi thẳng vào chuỗi QR nên
 * không có lý do gì để phát tán ra ngoài. Có hàm này để giao diện khỏi phải
 * chép lại danh sách — chép là sớm muộn cũng lệch, và lúc lệch thì chủ quán
 * dùng ngân hàng thiếu sẽ không cấu hình được dù hệ thống thừa sức hỗ trợ.
 */
export function listBankOptions(): BankOption[] {
  return VIETQR_BANKS.map(({ code, name }) => ({ code, name })).sort((a, b) =>
    a.name.localeCompare(b.name, 'vi'),
  );
}

// ── Mã tham chiếu ─────────────────────────────────────────────────────────────

/**
 * Bảng chữ Crockford base32, bỏ `I`, `L`, `O`, `U`.
 *
 * `I`/`L`/`1` và `O`/`0` lẫn nhau khi khách đọc mã trên màn hình rồi gõ tay vào
 * app ngân hàng; `U` bỏ đi để tránh vô tình sinh ra từ thô tục.
 */
const REF_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const REF_CODE_BODY_LENGTH = 5;

/**
 * Regex bộ đối soát dùng để DÒ TÌM mã trong nội dung chuyển khoản.
 *
 * Phải là dò tìm chứ không so khớp toàn chuỗi: ngân hàng thường chèn thêm chữ
 * vào nội dung (`"CT DEN:520 RCF7K2M9 TU MB"`), và khách cũng hay gõ thêm.
 */
export const PAYMENT_REF_CODE_REGEX = /RCF[0-9A-HJKMNP-TV-Z]{5}/;

/** Sinh một mã tham chiếu mới. Chỗ gọi chịu trách nhiệm thử lại khi đụng unique. */
export function generatePaymentRefCode(): string {
  let body = '';
  for (let i = 0; i < REF_CODE_BODY_LENGTH; i += 1) {
    body += REF_CODE_ALPHABET[randomInt(REF_CODE_ALPHABET.length)];
  }
  return `RCF${body}`;
}

/** Rút mã tham chiếu khỏi nội dung chuyển khoản. `null` khi không tìm thấy. */
export function extractPaymentRefCode(content: string): string | null {
  const match = content.toUpperCase().match(PAYMENT_REF_CODE_REGEX);
  return match ? match[0] : null;
}

// ── Chuỗi VietQR ──────────────────────────────────────────────────────────────

/** Một trường EMVCo: id 2 ký tự + độ dài 2 ký tự + giá trị. */
function field(id: string, value: string): string {
  return `${id}${String(value.length).padStart(2, '0')}${value}`;
}

/**
 * CRC-16/CCITT-FALSE: khởi tạo 0xFFFF, đa thức 0x1021, không đảo bit,
 * không XOR đầu ra. Tính trên toàn bộ chuỗi **bao gồm cả `6304`**.
 */
function crc16(input: string): string {
  let crc = 0xffff;
  for (const char of input) {
    crc ^= char.charCodeAt(0) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Bỏ dấu tiếng Việt và ký tự đặc biệt khỏi nội dung chuyển khoản.
 *
 * Trường này đi qua hệ thống liên ngân hàng vốn chỉ chấp nhận ASCII; để nguyên
 * dấu thì mã tham chiếu có nguy cơ bị cắt hoặc thay ký tự trên đường đi, và
 * bên đối soát không rút được mã ra nữa.
 */
function toAsciiMemo(memo: string): string {
  return memo
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, (char) => (char === 'đ' ? 'd' : 'D'))
    .replace(/[^0-9A-Za-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
    .slice(0, 25);
}

export interface BuildVietQrInput {
  bankBin: string;
  accountNumber: string;
  /** VND, số nguyên dương. */
  amount: number;
  memo: string;
}

/**
 * Dựng chuỗi VietQR động — mang sẵn số tiền và nội dung, nên khách chỉ việc
 * quét và xác nhận, không phải tự gõ gì.
 */
export function buildVietQrPayload(input: BuildVietQrInput): string {
  const { bankBin, accountNumber, amount, memo } = input;

  if (!Number.isInteger(amount) || amount <= 0) {
    throw new AppError(
      'Số tiền trên mã QR phải là số nguyên dương (VND không có số lẻ).',
      400,
      'INVALID_QR_AMOUNT',
    );
  }
  if (!/^\d{6}$/.test(bankBin)) {
    throw new AppError('BIN ngân hàng không hợp lệ.', 422, 'UNKNOWN_BANK_CODE');
  }
  if (!/^\d{4,19}$/.test(accountNumber)) {
    throw new AppError('Số tài khoản không hợp lệ.', 422, 'INVALID_ACCOUNT_NUMBER');
  }

  // 38 = Merchant Account Information, GUID A000000727 là namespace của Napas.
  const beneficiary = field('00', bankBin) + field('01', accountNumber);
  const merchantAccount = field(
    '38',
    field('00', 'A000000727') + field('01', beneficiary) + field('02', 'QRIBFTTA'),
  );

  const body =
    field('00', '01') + // phiên bản EMVCo
    field('01', '12') + // 12 = động (mang số tiền), 11 = tĩnh
    merchantAccount +
    field('53', '704') + // mã tiền tệ VND theo ISO 4217
    field('54', String(amount)) +
    field('58', 'VN') +
    field('62', field('08', toAsciiMemo(memo)));

  const withCrcTag = `${body}6304`;
  return `${withCrcTag}${crc16(withCrcTag)}`;
}
