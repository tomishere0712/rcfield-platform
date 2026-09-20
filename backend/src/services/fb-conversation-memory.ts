import { redis } from '../config/redis';
import { logger } from '../config/logger';

/**
 * Trí nhớ hội thoại cho chatbot Facebook.
 *
 * ── Vì sao chỉ Facebook cần ─────────────────────────────────────────────────
 *
 * Widget trên web vốn đã "nhớ", nhưng không phải do máy chủ giữ: trình duyệt tự
 * đính kèm lịch sử vào mỗi lượt gọi (`chat.controller.ts` đọc `history` từ thân
 * yêu cầu). Facebook thì không có client nào làm hộ — webhook chỉ nhận đúng một
 * tin nhắn trần từ Meta, nên máy chủ phải tự giữ.
 *
 * Thiếu nó thì mỗi tin nhắn được xử lý như tin đầu tiên, và một câu hỏi nối
 * tiếp bình thường cũng gãy:
 *
 *     KH:  quán mở mấy giờ
 *     Bot: 9h–22h ạ
 *     KH:  vậy chủ nhật thì sao      ← không có ngữ cảnh, bot không hiểu "vậy"
 *
 * ── Vì sao Redis chứ không phải một bảng mới ───────────────────────────────
 *
 * Lịch sử chat là dữ liệu SỐNG NGẮN và dùng một lần: nó tồn tại chỉ để ghép vào
 * prompt của lượt kế tiếp. Không ai truy vấn nó, không báo cáo nào cần nó, và
 * mất nó thì hậu quả tệ nhất là bot quên ngữ cảnh — đúng bằng hiện trạng hôm
 * nay.
 *
 * Đưa vào Postgres thì phải thêm bảng, thêm migration, và tự nhận về việc dọn
 * rác định kỳ cho một thứ mà 30 phút sau là vô giá trị. Redis có sẵn TTL, và
 * `config/redis.ts` đã kèm bản chạy trong bộ nhớ khi chưa cấu hình Redis — nên
 * chạy được cả ở máy chưa dựng gì.
 *
 * Nếu sau này cần lưu hội thoại để phân tích hay đối chất, đó là nhu cầu KHÁC
 * và nên có bảng riêng cho nó, chứ không phải sửa chỗ này.
 */

export interface ChatTurn {
  role: 'user' | 'model';
  content: string;
}

/**
 * 30 phút không nói gì thì coi như cuộc mới.
 *
 * Người ta nhắn hỏi giá, đóng máy, ba tiếng sau quay lại hỏi chuyện khác —
 * nối tiếp ngữ cảnh cũ lúc đó chỉ làm bot đoán sai.
 */
const TTL_SECONDS = 30 * 60;

/**
 * Giữ 10 tin gần nhất, tức 5 lượt qua lại.
 *
 * Lịch sử đi thẳng vào prompt nên nó tốn token MỖI lượt, và càng dài thì càng
 * chậm lẫn càng đắt. Năm lượt đủ cho những câu nối tiếp ("vậy chủ nhật thì
 * sao", "thế còn xe drift"), mà không kéo theo cả cuộc trò chuyện từ đầu.
 */
const MAX_TURNS = 10;

/**
 * Khoá gồm cả `pageId`, không chỉ `psid`.
 *
 * Một người có thể nhắn cho hai chi nhánh khác nhau (hai trang Facebook khác
 * nhau). Khoá chỉ theo psid thì hai cuộc trộn vào nhau, và bot trả lời chi
 * nhánh này bằng ngữ cảnh của chi nhánh kia.
 */
function key(pageId: string, psid: string): string {
  return `fb:chat:${pageId}:${psid}`;
}

/** Đọc lịch sử. Hỏng thì trả mảng rỗng — mất ngữ cảnh còn hơn gãy cuộc chat. */
export async function loadHistory(pageId: string, psid: string): Promise<ChatTurn[]> {
  try {
    const raw = await redis.get(key(pageId, psid));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Lọc lại từng phần tử: dữ liệu trong Redis có thể là bản ghi cũ từ một
    // phiên bản trước, và một phần tử méo mó nhét vào prompt sẽ làm hỏng cả
    // lượt gọi model.
    return parsed.filter(
      (t): t is ChatTurn =>
        !!t &&
        typeof t === 'object' &&
        ((t as ChatTurn).role === 'user' || (t as ChatTurn).role === 'model') &&
        typeof (t as ChatTurn).content === 'string',
    );
  } catch (err) {
    logger.warn('FbMemory', `không đọc được lịch sử psid=${psid}`, err);
    return [];
  }
}

/**
 * Ghi thêm một lượt hỏi–đáp.
 *
 * Không chặn luồng trả lời: gọi hàm này sau khi đã gửi tin cho khách. Redis
 * hỏng thì bot quay về trạng thái quên ngữ cảnh, chứ không được im lặng.
 */
export async function appendTurn(
  pageId: string,
  psid: string,
  userText: string,
  botText: string,
): Promise<void> {
  try {
    const history = await loadHistory(pageId, psid);
    history.push({ role: 'user', content: userText });
    history.push({ role: 'model', content: botText });
    const trimmed = history.slice(-MAX_TURNS);
    // Đặt lại TTL mỗi lần ghi: cuộc trò chuyện đang diễn ra thì không được hết
    // hạn giữa chừng, chỉ hết hạn khi thật sự im lặng đủ lâu.
    await redis.set(key(pageId, psid), JSON.stringify(trimmed), 'EX', TTL_SECONDS);
  } catch (err) {
    logger.warn('FbMemory', `không ghi được lịch sử psid=${psid}`, err);
  }
}

/** Xoá lịch sử — dùng khi khách chào tạm biệt hoặc gõ lệnh bắt đầu lại. */
export async function clearHistory(pageId: string, psid: string): Promise<void> {
  try {
    await redis.del(key(pageId, psid));
  } catch (err) {
    logger.warn('FbMemory', `không xoá được lịch sử psid=${psid}`, err);
  }
}
