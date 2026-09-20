import { redis } from '../config/redis';
import { logger } from '../config/logger';

/**
 * Đơn nháp của một cuộc trò chuyện đặt lịch trên Facebook Messenger.
 *
 * ── Vì sao tách khỏi `fb-conversation-memory` ───────────────────────────────
 *
 * `fb:chat:{pageId}:{psid}` giữ LỊCH SỬ CHỮ để ghép vào prompt. Mất nó thì hậu
 * quả tệ nhất là bot quên ngữ cảnh — chính module đó đã nói vậy.
 *
 * Đơn nháp thì KHÔNG được phép hiểu sai. Nó là thứ duy nhất quyết định khi nào
 * một nghĩa vụ thanh toán được tạo ra. Mô hình ngôn ngữ không được cấp công cụ
 * tạo đơn, nên quyền quyết định nằm ở đây — và nó chỉ nằm ở đây được nếu dữ liệu
 * là có cấu trúc, do máy chủ tự ghi, chứ không phải chuỗi chữ do model sinh ra
 * rồi đọc lại.
 *
 * ── Vì sao hạn sống BẰNG hạn của lịch sử chữ ────────────────────────────────
 *
 * Trước đây đơn nháp sống 15 phút còn lịch sử chữ 30 phút, với lập luận rằng
 * đơn nháp hết hạn sớm thì giá cũ không bị dùng lại.
 *
 * Thực tế khoảng chênh đó tạo ra một trạng thái XÁC SỐNG: đơn nháp đã mất nhưng
 * lịch sử vẫn còn, nên mô hình đọc lại bản tóm tắt cũ trong lịch sử và trả lời
 * như thể vẫn đang nhận đơn — trong khi không còn gì để tạo đơn cả. Khách gõ
 * "xác nhận" và được mời... đi đặt lại trên web.
 *
 * Nỗi lo giá cũ đã có chỗ khác lo: `finalizeBooking` so `quotedTotal` với tổng
 * tiền thật lúc tạo đơn và bắt xác nhận lại nếu lệch (FR-037). Chốt đó nay chạy
 * thật, nên không cần dựa vào việc hết hạn sớm nữa.
 */

/** 30 phút — BẰNG hạn của lịch sử chữ. Xem chú thích đầu tệp. */
export const DRAFT_TTL_SECONDS = 30 * 60;

export type DraftState =
  | 'AWAITING_NAME'
  | 'AWAITING_PHONE'
  | 'AWAITING_SLOT'
  | 'AWAITING_PLAY_MODE'
  | 'AWAITING_VEHICLES'
  /** AI đã tóm tắt đơn cho khách xem. Chỉ ở trạng thái này lời xác nhận mới có hiệu lực. */
  | 'AWAITING_CONFIRMATION'
  /** Đã tạo đơn và đã gửi mã QR. */
  | 'AWAITING_PAYMENT'
  /** Số điện thoại trùng một tài khoản thật — luồng đặt lịch đóng lại. */
  | 'BLOCKED_REAL_ACCOUNT';

export interface FbBookingDraft {
  state: DraftState;

  /**
   * Luôn suy ra từ `pageId` qua `cafe_channels`, KHÔNG BAO GIỜ nhận từ tham số
   * do model sinh. Đây là thứ chặn truy vấn chéo chi nhánh — cùng nguyên tắc đã
   * áp cho các công cụ chỉ-đọc của Gemini.
   */
  cafeId: string;

  fullName?: string;
  phone?: string;
  /** Tuỳ chọn. Gắn với đơn hàng chứ không gắn với tài khoản. */
  email?: string;
  playerCount?: number;

  playMode?: 'RENTAL' | 'BYOC';
  trackConfigId?: string;
  slotStart?: string;
  slotEnd?: string;
  vehicleIds?: string[];

  quotedTotal?: number;

  /**
   * Bật khi bước tra lại phát hiện giá đã đổi. Chừng nào cờ này còn bật thì lời
   * xác nhận trước đó của khách KHÔNG được dùng lại — họ chưa từng nhìn thấy
   * mức giá mới. Bộ điều phối gọi `acknowledgePriceChange` sau khi đã báo giá
   * mới cho khách.
   */
  priceChanged?: boolean;
  /**
   * Mức giá khách đã nhìn thấy trước khi giá đổi.
   *
   * Dùng để nói rõ "từ X thành Y" thay vì chỉ báo con số mới. Không giữ riêng
   * thì câu thông báo phải dựa vào việc `quotedTotal` chưa bị ghi đè tại thời
   * điểm dựng câu — một ràng buộc về THỨ TỰ mà không ai thấy khi đọc code, và
   * đảo nhầm thì câu báo hiện cùng một giá hai lần.
   */
  previousQuotedTotal?: number;

  /** Có giá trị nghĩa là đơn đã được tạo — mọi lời xác nhận sau đó là gõ trùng. */
  createdBookingId?: string;
}

/**
 * Khoá gồm cả `pageId`, không chỉ `psid`.
 *
 * Một người nhắn cho hai chi nhánh là hai trang Facebook khác nhau. Khoá chỉ
 * theo `psid` thì hai đơn nháp trộn vào nhau và khách đặt nhầm chi nhánh.
 */
export function draftKey(pageId: string, psid: string): string {
  return `fb:booking-draft:${pageId}:${psid}`;
}

/** Đọc đơn nháp. Hỏng thì trả `null` — bắt đầu lại còn hơn đặt nhầm. */
export async function loadDraft(pageId: string, psid: string): Promise<FbBookingDraft | null> {
  try {
    const raw = await redis.get(draftKey(pageId, psid));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as FbBookingDraft;
  } catch (err) {
    logger.warn('FbDraft', `không đọc được đơn nháp psid=${psid}`, err);
    return null;
  }
}

/** Ghi đơn nháp và đặt lại hạn sống — cuộc trò chuyện đang diễn ra không được hết hạn giữa chừng. */
export async function saveDraft(
  pageId: string,
  psid: string,
  draft: FbBookingDraft,
): Promise<void> {
  try {
    await redis.set(draftKey(pageId, psid), JSON.stringify(draft), 'EX', DRAFT_TTL_SECONDS);
  } catch (err) {
    logger.warn('FbDraft', `không ghi được đơn nháp psid=${psid}`, err);
  }
}

/**
 * Gia hạn đơn nháp mà không sửa nội dung.
 *
 * Dùng cho những lượt khách hỏi xen ngang. `saveDraft` đặt lại hạn sống, nhưng
 * lượt hỏi–đáp không ghi gì cả — nên nếu khách hỏi han đủ lâu, đơn nháp lặng lẽ
 * hết hạn giữa cuộc trò chuyện: hỏi xong quay lại thì mọi thứ vừa khai đã mất và
 * bot bắt đầu lại từ đầu. Hỏi nhiều là dấu hiệu khách ĐANG quan tâm, không phải
 * đã bỏ đi.
 */
export async function touchDraft(pageId: string, psid: string): Promise<void> {
  try {
    await redis.expire(draftKey(pageId, psid), DRAFT_TTL_SECONDS);
  } catch (err) {
    logger.warn('FbDraft', `không gia hạn được đơn nháp psid=${psid}`, err);
  }
}

/** Xoá đơn nháp — gọi sau khi đã tạo đơn xong. */
export async function clearDraft(pageId: string, psid: string): Promise<void> {
  try {
    await redis.del(draftKey(pageId, psid));
  } catch (err) {
    logger.warn('FbDraft', `không xoá được đơn nháp psid=${psid}`, err);
  }
}

/**
 * Tập từ khoá ĐÓNG. Cố ý không dùng model để phán đoán ý định xác nhận: đây là
 * thời điểm phát sinh nghĩa vụ thanh toán, và một phán đoán xác suất không phải
 * cơ sở đủ cho việc đó.
 */
const CONFIRMATION_KEYWORDS = [
  'xác nhận',
  'xac nhan',
  'đồng ý',
  'dong y',
  'ok đặt',
  'ok dat',
  'chốt',
  'chot',
  'đặt luôn',
  'dat luon',
];

/**
 * Câu chữ có phải lời xác nhận không — CHỈ xét câu chữ, không xét trạng thái.
 *
 * Tách riêng khỏi `isConfirmationTurn` vì có một trường hợp cần đúng phần này:
 * khách đã có đơn được tạo nhưng giá vừa đổi, và họ đồng ý mức giá mới. Lúc đó
 * `isConfirmationTurn` phải trả `false` (đơn đã tồn tại, không tạo thêm) nhưng
 * ta vẫn cần biết khách vừa nói "đồng ý".
 */
export function matchesConfirmationKeyword(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  return CONFIRMATION_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

/** Trường bắt buộc, theo đúng thứ tự cần hỏi khách. */
export type RequiredField =
  | 'slotStart'
  | 'playMode'
  | 'playerCount'
  | 'trackConfigId'
  | 'vehicleIds'
  | 'fullName'
  | 'phone';

/**
 * Trường bắt buộc đầu tiên còn thiếu, hoặc `null` khi đã đủ.
 *
 * ── Vì sao phải là MỘT hàm duy nhất ────────────────────────────────────────
 *
 * Trước đây có hai danh sách trường bắt buộc: một ở `hasRequiredFields` (quyết
 * định có được tạo đơn không) và một ở `nextQuestion` của bộ điều phối (quyết
 * định hỏi khách gì tiếp). Hai danh sách lệch nhau đúng một trường —
 * `trackConfigId` — và hậu quả là một vòng lặp vô hạn không báo lỗi:
 *
 *     bot: [tóm tắt đơn] Bạn gõ "xác nhận" để mình giữ chỗ nhé!
 *     khách: xác nhận
 *     bot: [tóm tắt đơn] Bạn gõ "xác nhận" để mình giữ chỗ nhé!     ← mãi mãi
 *
 * `nextQuestion` tưởng đã đủ nên không hỏi gì thêm và đi tóm tắt;
 * `hasRequiredFields` thấy thiếu nên từ chối tạo đơn. Không bên nào sai theo
 * logic của riêng nó, và không có lỗi nào được ném ra.
 *
 * Gộp làm một hàm khiến kiểu lỗi đó không còn tồn tại được nữa: thêm trường bắt
 * buộc mới thì cả hai phía cùng thấy.
 */
export function firstMissingField(draft: FbBookingDraft): RequiredField | null {
  if (!draft.slotStart || !draft.slotEnd) return 'slotStart';
  if (!draft.playMode) return 'playMode';
  if (!draft.playerCount || draft.playerCount < 1) return 'playerCount';
  if (!draft.trackConfigId) return 'trackConfigId';
  // Mang xe cá nhân thì không cần chọn xe của quán.
  if (draft.playMode === 'RENTAL' && (!draft.vehicleIds || draft.vehicleIds.length === 0)) {
    return 'vehicleIds';
  }
  if (!draft.fullName) return 'fullName';
  if (!draft.phone) return 'phone';
  return null;
}

/** Đơn nháp đã đủ mọi trường bắt buộc để tạo đơn chưa. */
export function hasRequiredFields(draft: FbBookingDraft): boolean {
  return Boolean(draft.cafeId) && firstMissingField(draft) === null;
}

/**
 * Lượt này có phải lời xác nhận tạo đơn không.
 *
 * Ba điều kiện phải cùng đúng. Nới bất kỳ điều kiện nào cũng đẩy quyền quyết
 * định ngược về phía mô hình ngôn ngữ:
 *
 *   1. `state === 'AWAITING_CONFIRMATION'` — AI đã tóm tắt đơn ở lượt trước.
 *      Thiếu chốt này thì một tiếng "ok" giữa một câu hỏi khác cũng tạo ra đơn.
 *   2. Đủ mọi trường bắt buộc.
 *   3. Câu chữ khớp tập từ khoá đóng.
 *
 * Thêm hai chốt phủ định: đơn đã tạo rồi (gõ trùng), và giá vừa đổi mà khách
 * chưa xem mức mới.
 */
export function isConfirmationTurn(draft: FbBookingDraft, text: string): boolean {
  if (draft.createdBookingId) return false;
  if (draft.priceChanged) return false;
  if (draft.state !== 'AWAITING_CONFIRMATION') return false;
  if (!hasRequiredFields(draft)) return false;
  return matchesConfirmationKeyword(text);
}

/** Bộ điều phối gọi sau khi đã báo mức giá mới cho khách, để lời xác nhận kế tiếp có hiệu lực. */
export function acknowledgePriceChange(draft: FbBookingDraft): FbBookingDraft {
  return { ...draft, priceChanged: false };
}

/** Bỏ hẳn các khoá khỏi bản sao, không để lại `undefined` — bản ghi Redis phải sạch. */
function omit(draft: FbBookingDraft, keys: Array<keyof FbBookingDraft>): FbBookingDraft {
  const copy = { ...draft };
  for (const key of keys) delete copy[key];
  return copy;
}

export type RevalidationOutcome =
  | { kind: 'UNCHANGED' }
  | { kind: 'VEHICLE_TAKEN' }
  | { kind: 'SLOT_FULL' }
  | { kind: 'PRICE_CHANGED'; newTotal: number };

/**
 * Dọn đơn nháp sau khi tra lại tại thời điểm xác nhận.
 *
 * Nguyên tắc: chỉ xoá đúng những trường đã hỏng, giữ nguyên phần còn hợp lệ.
 * Tên và số điện thoại không liên quan gì tới việc một chiếc xe bị thuê mất —
 * bắt khách khai lại từ đầu là cách chắc chắn nhất để mất khách.
 */
export function applyRevalidationOutcome(
  draft: FbBookingDraft,
  outcome: RevalidationOutcome,
): FbBookingDraft {
  switch (outcome.kind) {
    case 'UNCHANGED':
      return draft;

    case 'VEHICLE_TAKEN':
      return { ...omit(draft, ['vehicleIds']), state: 'AWAITING_VEHICLES' };

    case 'SLOT_FULL':
      // Xe đã chọn được kiểm theo đúng khung giờ đó, nên khung giờ đổi thì lựa
      // chọn xe không còn ý nghĩa và phải hỏi lại.
      return {
        ...omit(draft, ['slotStart', 'slotEnd', 'vehicleIds']),
        state: 'AWAITING_SLOT',
      };

    case 'PRICE_CHANGED':
      return {
        ...draft,
        state: 'AWAITING_CONFIRMATION',
        priceChanged: true,
        previousQuotedTotal: draft.quotedTotal,
        quotedTotal: outcome.newTotal,
      };
  }
}
