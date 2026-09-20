import { logger } from './logger';

const NLU_URL = process.env.NLU_SERVICE_URL ?? 'http://nlu-service:8000';
const NLU_TIMEOUT = parseInt(process.env.NLU_TIMEOUT_MS ?? '2000', 10);
// Rỗng khi NLU chạy chung mạng nội bộ Docker — dịch vụ đó cũng bỏ qua việc
// kiểm tra khi biến này rỗng ở phía nó. Đặt cùng giá trị ở cả hai bên khi NLU
// chuyển sang chạy trên một VPS riêng.
const NLU_API_KEY = process.env.NLU_API_KEY ?? '';

export interface NluResult {
  intent: string;
  confidence: number;
  needs_llm_fallback: boolean;
  /**
   * Dịch vụ NLU có trả lời không.
   *
   * ── Vì sao phải tách khỏi `confidence` ─────────────────────────────────────
   *
   * Trước đây NLU chết cũng trả `confidence: 0`, giống hệt khi NLU sống nhưng
   * không chắc chắn. Hai tình huống này khác nhau về bản chất: một bên là "tôi
   * đọc được câu này và thấy nó mơ hồ", bên kia là "tôi không đọc gì cả".
   *
   * Gộp làm một khiến NLU chết trở nên VÔ HÌNH: mọi câu hỏi rơi xuống nhánh
   * chọn model theo độ tin, và vì độ tin luôn bằng 0 nên toàn bộ sản phẩm âm
   * thầm tụt xuống model yếu — không lỗi, không cảnh báo ngoài một dòng log mà
   * không ai đọc.
   */
  available: boolean;
}

/**
 * NLU chết KHÔNG phải là "độ tin bằng 0".
 *
 * `needs_llm_fallback: true` để nơi gọi biết rằng phán đoán ý định lần này không
 * dựa trên gì cả, và phải tự xử lý thay vì tin vào con số 0.
 */
const FALLBACK: NluResult = {
  intent: 'rag_query',
  confidence: 0,
  needs_llm_fallback: true,
  available: false,
};

export async function classifyIntent(text: string): Promise<NluResult> {
  logger.info('NLU', `→ "${text}"`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NLU_TIMEOUT);
  try {
    const res = await fetch(`${NLU_URL}/classify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(NLU_API_KEY ? { 'X-Api-Key': NLU_API_KEY } : {}),
      },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });
    const result = { ...((await res.json()) as NluResult), available: true };
    logger.info(
      'NLU',
      `← ${result.intent} (${result.confidence})${result.needs_llm_fallback ? ' [fallback]' : ''}`,
    );
    return result;
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === 'AbortError';
    logger.warn(
      'NLU',
      isTimeout
        ? `timeout after ${NLU_TIMEOUT}ms — is NLU running? (npm run nlu) — falling back to rag_query`
        : `unreachable at ${NLU_URL} — is NLU running? (npm run nlu) — falling back to rag_query`,
    );
    return FALLBACK;
  } finally {
    clearTimeout(timer);
  }
}
