import type { ExtractedFields } from './fb-booking-extractor';
import {
  firstMissingField,
  matchesConfirmationKeyword,
  type FbBookingDraft,
} from './fb-booking-draft';
import { normalizePhone } from './fb-soft-user';

/**
 * Phân loại một lượt trò chuyện — NƠI DUY NHẤT quyết định lượt đó đi đâu.
 *
 * ── Vì sao phải gom về một chỗ ──────────────────────────────────────────────
 *
 * Quyết định định tuyến từng nằm rải ở bốn nơi: bộ điều khiển webhook, chín
 * nhánh thoát sớm ở đầu bộ điều phối, hàm này, và một chốt nữa ở giữa luồng.
 * Mỗi lần thêm một nhánh là một lần phải nhớ hết chín nhánh kia — và thực tế đã
 * hỏng đúng như vậy nhiều lần:
 *
 *   • chốt "không mang thông tin mới" suýt nuốt luôn lượt xác nhận, khiến đơn
 *     không bao giờ được tạo;
 *   • "đổi thông tin" bị "câu hỏi" chặn trước, vì câu đổi thường kèm dấu hỏi;
 *   • "mô hình hỏng" bị hiểu thành "khách không muốn đặt".
 *
 * Không cái nào là lỗi khó. Chúng khó THẤY, vì thứ tự ưu tiên không đọc được ở
 * một chỗ nào cả. Bảng ở `classifyTurn` đọc từ trên xuống là ra toàn bộ luật.
 *
 * ── Hai pha ─────────────────────────────────────────────────────────────────
 *
 * Tệp này là pha MỘT: quyết định bằng luật, không gọi mô hình. Chỉ khi nó trả
 * `NEEDS_MODEL` thì bộ điều phối mới gọi mô hình — và nếu mô hình đọc xong mà
 * không rút được gì, lượt đó được xếp lại thành hỏi–đáp. Đó là đường leo thang
 * DUY NHẤT giữa hai pha.
 */

export type TurnIntent =
  /** Số điện thoại trùng tài khoản thật — luồng đặt lịch đóng cho phiên này. */
  | { kind: 'BLOCKED' }
  /** Khách muốn dừng hẳn hoặc làm lại từ đầu. */
  | { kind: 'CANCEL' }
  /** Đơn trước đã phát mã QR, khách muốn mở đơn mới. */
  | { kind: 'NEW_BOOKING' }
  /** Gõ xác nhận nhưng đơn nháp đã hết hạn. */
  | { kind: 'EXPIRED_CONFIRM' }
  /** Không có đơn nháp và không có dấu hiệu muốn đặt. */
  | { kind: 'NOT_BOOKING' }
  /** Khách xác nhận tạo đơn. */
  | { kind: 'CONFIRM' }
  /** Đọc được bằng luật — dùng luôn, không gọi mô hình. */
  | { kind: 'PROVIDE_INFO'; fields: ExtractedFields }
  /** Cần mô hình đọc ngôn ngữ tự nhiên. */
  | { kind: 'NEEDS_MODEL' }
  /** Khách hỏi chuyện khác — để đường hỏi–đáp trả lời. */
  | { kind: 'ASK_QUESTION' };

// ── Bộ nhận dạng bằng luật ───────────────────────────────────────────────────

/**
 * Dấu hiệu muốn đặt lịch. Cố ý RỘNG TAY: lọt một câu vào luồng rồi bị mô hình
 * gạt ra chỉ tốn một lượt gọi, còn chặn nhầm một khách muốn đặt là mất khách.
 */
const BOOKING_INTENT_HINTS = [
  'đặt',
  'dat san',
  'book',
  'giữ chỗ',
  'giu cho',
  'thuê xe',
  'thue xe',
  'chơi',
  'choi',
  'slot',
  'lịch',
  'lich',
  'mai',
  'hôm nay',
  'hom nay',
  'tối',
  'toi ',
  'giờ',
  'gio ',
  'thứ',
  'thu ',
  'cuối tuần',
  'cuoi tuan',
  'còn chỗ',
  'con cho',
];

/**
 * Dừng hẳn hoặc làm lại.
 *
 * Cố ý KHÔNG bắt "thôi" hay "dừng" đứng một mình: "thôi cho mình thuê xe của
 * quán" là đổi ý về hình thức chơi, bắt nhầm thành huỷ là xoá sạch thông tin
 * khách vừa khai.
 */
const CANCEL_PHRASES = [
  'huỷ',
  'hủy',
  'bắt đầu lại',
  'bat dau lai',
  'đặt lại từ đầu',
  'dat lai tu dau',
  'làm lại từ đầu',
  'lam lai tu dau',
  'không đặt nữa',
  'khong dat nua',
  'thôi không đặt',
  'thoi khong dat',
  'dừng lại',
  'dung lai',
];

/**
 * Sửa thông tin đã khai. Xét TRƯỚC câu hỏi, vì câu sửa gần như luôn kèm dấu
 * hỏi — "cho mình đổi sang 20h được không?".
 */
const MODIFICATION_HINTS = [
  'đổi',
  'doi ',
  'sửa',
  'sua ',
  'thay',
  'nhầm',
  'nham',
  'không phải',
  'khong phai',
  'sai rồi',
  'sai roi',
  'lại',
  'lai ',
];

/**
 * Khách đang HỎI chứ không trả lời.
 *
 * Danh sách này chỉ bắt các CỤM cố định. Từ để hỏi đơn lẻ nằm ở
 * `INTERROGATIVE_PATTERNS` bên dưới — xem `looksLikeQuestion`.
 */
const QUESTION_HINTS = ['?', 'tư vấn', 'tu van', 'gợi ý', 'goi y', 'nên chọn', 'nen chon'];

/**
 * Bỏ dấu để so khớp.
 *
 * Bắt buộc phải có, không phải để tiện. `\b` trong JavaScript tính theo bảng chữ
 * ASCII, nên với chữ kết thúc bằng nguyên âm có dấu — "gì", "hả", "tuỳ" — thì
 * `\b` ở cuối KHÔNG khớp: sau 'ì' là dấu cách, cả hai đều không phải ký tự từ
 * nên không có ranh giới nào ở đó. `/\bgì\b/` là một biểu thức không bao giờ
 * đúng, và nó hỏng lặng lẽ. Bỏ dấu trước rồi mới so khớp bằng ASCII.
 */
function deaccent(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
}

/**
 * Từ để hỏi. Viết ở dạng đã bỏ dấu — luôn so khớp qua `deaccent`.
 *
 * Trước đây chỉ có bảy cụm cố định ('?', 'bao nhiêu', 'thế nào'…), nên phần lớn
 * câu hỏi thật của khách không khớp gì cả: "đường nào chơi dễ hơn", "xe cơ bản
 * có gì khác", "mình nên đặt mấy giờ". Những câu đó bị đem đi phân tích như một
 * câu TRẢ LỜI cho trường đang chờ — tệ nhất là ở bước hỏi tên, nơi cả câu bị ghi
 * thẳng vào ô họ tên.
 *
 * Vài mẫu cố ý hẹp hơn mức tự nhiên:
 *   • `may` phải đi kèm danh từ đếm được — "xe máy" không phải câu hỏi;
 *   • không bắt `ha` ("hả") vì "Hà" là tên người rất phổ biến.
 */
const INTERROGATIVE_PATTERNS: RegExp[] = [
  /\bnao\b/,
  /\bsao\b/,
  /\bgi\b/,
  /\bdau\b/,
  /\bmay\s+(gio|nguoi|tieng|cai|con|dong|xe)\b/,
  /\bbao\s*(nhieu|lau)\b/,
  /\bkhac\s*(nhau|gi)\b/,
  /\bnen\b/,
  /\bthe\s*nao\b/,
  // Câu hỏi có–không của tiếng Việt kết thúc bằng chính từ phủ định:
  // "được không", "còn chỗ ko", "đặt được chưa". Cho phép tiểu từ lịch sự đứng
  // sau — "còn chỗ không ạ" vẫn là câu hỏi.
  /\b(khong|ko|hong|chua)\s*(a|ah|ak|nhi|vay|the)?\s*[?.!]*$/,
];

/**
 * Câu TRẢ LỜI có chứa từ để hỏi — "sân nào cũng được", "giờ nào cũng ok".
 *
 * Không có lối thoát này thì mọi câu "tuỳ bạn" đều bị đẩy sang hỏi–đáp và luồng
 * đặt lịch đứng im ở đúng chỗ khách vừa trả lời xong.
 */
const ANSWER_ESCAPES = [
  'cung duoc',
  'cung ok',
  'cung dc',
  'sao cung',
  'tuy ban',
  'tuy quan',
  'tuy shop',
];

function contains(text: string, hints: string[]): boolean {
  const normalized = text.trim().toLowerCase();
  return hints.some((hint) => normalized.includes(hint));
}

/**
 * Lượt này là câu hỏi chứ không phải câu trả lời.
 *
 * Cố ý NGHIÊNG VỀ PHÍA "là câu hỏi". Nhận nhầm một câu trả lời thành câu hỏi thì
 * hỏi–đáp trả lời rồi `pendingBookingQuestion` hỏi lại ngay — mất một lượt.
 * Nhận nhầm một câu hỏi thành câu trả lời thì dữ liệu rác đi thẳng vào đơn nháp
 * và khách không hề biết. Hai kiểu sai này không cùng hạng.
 */
export function looksLikeQuestion(text: string): boolean {
  const plain = deaccent(text.trim().toLowerCase());
  if (ANSWER_ESCAPES.some((escape) => plain.includes(escape))) return false;
  if (contains(text, QUESTION_HINTS)) return true;
  return INTERROGATIVE_PATTERNS.some((pattern) => pattern.test(plain));
}

export function looksLikeBookingIntent(text: string): boolean {
  return contains(text, BOOKING_INTENT_HINTS);
}

/** "thuê xe của quán" / "mang xe cá nhân" — hai lựa chọn đóng. */
function parsePlayMode(text: string): 'RENTAL' | 'BYOC' | null {
  const t = text.trim().toLowerCase();
  if (
    /(thuê|thue|mượn|muon)\s*(xe)?/.test(t) &&
    !/mang|tự|tu\s|cá nhân|ca nhan|riêng|rieng/.test(t)
  ) {
    return 'RENTAL';
  }
  if (/(mang|tự|tu\s|cá nhân|ca nhan|riêng|rieng|byoc)/.test(t)) return 'BYOC';
  return null;
}

/** Số người chơi — chỉ nhận khi câu có đúng một con số hợp lý. */
function parsePlayerCount(text: string): number | null {
  const t = text.trim().toLowerCase();
  const words: Record<string, number> = {
    một: 1,
    mot: 1,
    hai: 2,
    ba: 3,
    bốn: 4,
    bon: 4,
    năm: 5,
    nam: 5,
    sáu: 6,
    sau: 6,
  };
  for (const [word, value] of Object.entries(words)) {
    if (new RegExp(`\\b${word}\\b`).test(t)) return value;
  }
  const digits = t.match(/\b(\d{1,2})\b/g);
  if (digits?.length === 1) {
    const value = Number(digits[0]);
    if (value >= 1 && value <= 20) return value;
  }
  return null;
}

/**
 * Từ thuộc chuyện đặt lịch — không ai tên như vậy.
 *
 * Ở bước hỏi tên, luật cũ nhận GẦN NHƯ MỌI câu ngắn không chữ số là họ tên. Khách
 * hỏi "xe nào rẻ hơn" giữa chừng thì cả câu đó thành tên người trong đơn, và nó
 * đi thẳng tới bản tóm tắt lẫn thư xác nhận mà không chỗ nào chặn lại.
 */
const NOT_NAME_WORDS = ['xe', 'san', 'gia', 'tien', 'gio', 'thue', 'dat', 'choi', 'cho', 'bao'];

/**
 * Tên người: câu ngắn, không chữ số, không phải câu hỏi, không dính từ nghiệp vụ.
 *
 * Không chắc thì trả `false` để mô hình đọc — nó thấy cả ngữ cảnh nên gỡ được
 * "cho mình tên Nam" hay tên có chữ "Mai". Tốn thêm một lượt gọi, đổi lại không
 * ghi rác vào ô họ tên.
 */
function looksLikeName(text: string): boolean {
  const t = text.trim();
  if (t.length === 0 || t.length > 40) return false;
  if (/\d/.test(t)) return false;
  if (looksLikeQuestion(t)) return false;
  const words = deaccent(t.toLowerCase()).split(/\s+/);
  if (words.length > 5) return false;
  return !words.some((word) => NOT_NAME_WORDS.includes(word));
}

// ── Bảng quyết định ──────────────────────────────────────────────────────────

/**
 * Đọc từ trên xuống là ra toàn bộ luật định tuyến.
 *
 * Thứ tự ở đây LÀ thứ tự ưu tiên — đổi chỗ hai nhánh là đổi hành vi sản phẩm.
 */
export function classifyTurn(draft: FbBookingDraft | null, text: string): TurnIntent {
  // 1. Đã chặn vì trùng tài khoản thật — không mở lại trong phiên này.
  if (draft?.state === 'BLOCKED_REAL_ACCOUNT') return { kind: 'BLOCKED' };

  // 2. Lối thoát. Đứng trước mọi thứ, vì đây là cách duy nhất để khách rời khỏi
  //    một câu hỏi họ không muốn trả lời.
  if (draft && contains(text, CANCEL_PHRASES)) return { kind: 'CANCEL' };

  // 3. Đơn trước đã phát mã QR mà khách lại tỏ ý đặt tiếp → mở đơn mới. Thiếu
  //    nhánh này thì đơn nháp cũ nằm lì 30 phút và mọi tin nhắn đều rơi vào chỗ
  //    tóm tắt lại đơn cũ.
  if (
    draft?.state === 'AWAITING_PAYMENT' &&
    looksLikeBookingIntent(text) &&
    !matchesConfirmationKeyword(text)
  ) {
    return { kind: 'NEW_BOOKING' };
  }

  // 4. Xác nhận mà không còn đơn nháp — nói thẳng là hết hạn, đừng để rơi xuống
  //    hỏi–đáp rồi mô hình đọc lại bản tóm tắt cũ trong lịch sử và diễn tiếp.
  if (!draft && matchesConfirmationKeyword(text)) return { kind: 'EXPIRED_CONFIRM' };

  // 5–6. Chưa có đơn nháp: phải thấy dấu hiệu đặt lịch mới xét tiếp, và khi đó
  //      luôn cần mô hình vì chưa biết đang chờ trường nào.
  if (!draft) {
    return looksLikeBookingIntent(text) ? { kind: 'NEEDS_MODEL' } : { kind: 'NOT_BOOKING' };
  }

  // 7. Xác nhận tạo đơn.
  if (matchesConfirmationKeyword(text)) return { kind: 'CONFIRM' };

  // 8. Sửa thông tin — TRƯỚC câu hỏi, vì câu sửa thường mang dấu hỏi.
  if (contains(text, MODIFICATION_HINTS)) return { kind: 'NEEDS_MODEL' };

  // 9. Hỏi chuyện khác — kể cả khi đang dở luồng đặt lịch. Đây là chỗ quyết định
  //    khách có xen ngang được hay không.
  if (looksLikeQuestion(text)) return { kind: 'ASK_QUESTION' };

  // 10. Câu trả lời cho trường đang chờ. Đọc được bằng luật thì không gọi mô
  //     hình; không chắc thì để mô hình đọc — ghi dữ liệu rác vào đơn nháp tệ
  //     hơn nhiều so với tốn một lượt gọi.
  switch (firstMissingField(draft)) {
    case 'phone': {
      const phone = normalizePhone(text);
      return phone ? { kind: 'PROVIDE_INFO', fields: { phone } } : { kind: 'NEEDS_MODEL' };
    }
    case 'playMode': {
      const playMode = parsePlayMode(text);
      return playMode ? { kind: 'PROVIDE_INFO', fields: { playMode } } : { kind: 'NEEDS_MODEL' };
    }
    case 'playerCount': {
      const playerCount = parsePlayerCount(text);
      return playerCount
        ? { kind: 'PROVIDE_INFO', fields: { playerCount } }
        : { kind: 'NEEDS_MODEL' };
    }
    case 'fullName':
      return looksLikeName(text)
        ? { kind: 'PROVIDE_INFO', fields: { fullName: text.trim() } }
        : { kind: 'NEEDS_MODEL' };
    case 'trackConfigId':
      // Bộ điều phối đối chiếu với danh sách sân thật; khớp hụt thì nó hỏi lại.
      return { kind: 'PROVIDE_INFO', fields: { trackName: text.trim() } };
    case 'vehicleIds':
      return { kind: 'PROVIDE_INFO', fields: { vehicleNames: [text.trim()] } };
    case 'slotStart':
      // Chỗ DUY NHẤT thật sự cần mô hình: đọc ngôn ngữ tự nhiên ra mốc thời gian.
      return { kind: 'NEEDS_MODEL' };
    default:
      return { kind: 'NEEDS_MODEL' };
  }
}
