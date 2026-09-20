import { GoogleGenAI, Type } from '@google/genai';
import { env } from '../config/env';
import { logger } from '../config/logger';
import type { FbBookingDraft } from './fb-booking-draft';

const ai = new GoogleGenAI({ apiKey: env.ai.googleApiKey });

/**
 * Rút thông tin đặt lịch ra khỏi câu chữ của khách.
 *
 * ── Ranh giới trách nhiệm ───────────────────────────────────────────────────
 *
 * Mô hình chỉ làm ĐÚNG MỘT việc: đọc câu tiếng Việt tự nhiên rồi trả về những
 * trường nó nhận ra. Nó KHÔNG quyết định gì cả — không quyết định đã đủ thông
 * tin chưa, không quyết định có tạo đơn hay không. Những quyết định đó nằm ở
 * `fb-booking-draft.ts` và bộ điều phối.
 *
 * Đây là lý do `create_booking` không bao giờ được đưa vào danh sách công cụ
 * của mô hình: một phán đoán xác suất không phải cơ sở đủ để phát sinh nghĩa vụ
 * thanh toán.
 *
 * ── Mọi thứ trả về đều là NGHI NGỜ ──────────────────────────────────────────
 *
 * Bộ điều phối phải kiểm lại từng trường trước khi ghi vào đơn nháp. Mô hình có
 * thể bịa số điện thoại đúng định dạng, suy ra khung giờ trong quá khứ, hoặc
 * trả về mã xe không thuộc chi nhánh này.
 */

export interface ExtractedFields {
  fullName?: string;
  phone?: string;
  email?: string;
  playerCount?: number;
  playMode?: 'RENTAL' | 'BYOC';
  /** Giờ bắt đầu dạng ISO 8601 kèm múi giờ Việt Nam, nếu suy ra được. */
  slotStart?: string;
  /** Số slot khách muốn chơi, dùng để tính giờ kết thúc. */
  slotCount?: number;
  /** Tên xe khách nhắc tới — bộ điều phối tự đối chiếu sang mã xe thật. */
  vehicleNames?: string[];
  /** Tên sân/đường đua khách nhắc tới — bộ điều phối tự đối chiếu sang mã thật. */
  trackName?: string;
  /** Khách nói rõ là không muốn cho email. */
  declinedEmail?: boolean;
  /** Khách đang bộc lộ ý định đặt lịch (dùng để mở luồng). */
  wantsToBook?: boolean;
}

const EXTRACTION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    fullName: { type: Type.STRING, description: 'Tên khách, nếu khách vừa nói.' },
    phone: { type: Type.STRING, description: 'Số điện thoại khách vừa cung cấp, giữ nguyên dạng.' },
    email: { type: Type.STRING, description: 'Email khách vừa cung cấp.' },
    playerCount: { type: Type.NUMBER, description: 'Số người chơi.' },
    playMode: {
      type: Type.STRING,
      enum: ['RENTAL', 'BYOC'],
      description: 'RENTAL nếu khách thuê xe của quán, BYOC nếu khách mang xe cá nhân.',
    },
    slotStart: {
      type: Type.STRING,
      description:
        'Giờ bắt đầu dạng ISO 8601 kèm offset +07:00. Tự suy từ ngữ cảnh (tối nay, mai, thứ 7). Bỏ trống nếu không chắc.',
    },
    slotCount: { type: Type.NUMBER, description: 'Số slot khách muốn chơi. Mặc định 1 slot.' },
    vehicleNames: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Tên các xe khách nhắc tới, ví dụ "xe A", "Traxxas".',
    },
    trackName: {
      type: Type.STRING,
      description:
        'Tên sân hoặc đường đua khách nhắc tới, ví dụ "sân drift", "đường vượt chướng ngại".',
    },
    declinedEmail: {
      type: Type.BOOLEAN,
      description: 'true nếu khách từ chối cho email (nói "bỏ qua", "không có", "thôi").',
    },
    wantsToBook: {
      type: Type.BOOLEAN,
      description: 'true nếu khách đang muốn ĐẶT LỊCH, không phải chỉ hỏi thông tin.',
    },
  },
  required: [],
};

function buildPrompt(draft: FbBookingDraft | null, todayIso: string): string {
  const known = draft
    ? [
        draft.fullName ? `- tên: ${draft.fullName}` : null,
        draft.phone ? `- số điện thoại: ${draft.phone}` : null,
        draft.slotStart ? `- giờ bắt đầu: ${draft.slotStart}` : null,
        draft.playMode ? `- hình thức: ${draft.playMode}` : null,
        draft.playerCount ? `- số người: ${draft.playerCount}` : null,
      ]
        .filter(Boolean)
        .join('\n')
    : '(chưa có gì)';

  return [
    'Bạn là bộ trích xuất thông tin đặt lịch cho một quán xe RC ở Việt Nam.',
    `Hôm nay là ${todayIso} (múi giờ +07:00).`,
    '',
    'Nhiệm vụ: đọc câu của khách và trả về CHỈ những trường khách vừa nói trong câu này.',
    '',
    'Quy tắc bắt buộc:',
    '- KHÔNG lặp lại những trường đã biết bên dưới trừ khi khách vừa nói lại khác đi.',
    '- KHÔNG đoán, KHÔNG bịa. Không chắc thì bỏ trống trường đó.',
    '- Số điện thoại phải là số khách thật sự đọc ra, không phải số trong ví dụ.',
    '- wantsToBook chỉ true khi khách muốn đặt, không phải khi chỉ hỏi giá hay hỏi giờ mở cửa.',
    '',
    'Đã biết từ các lượt trước:',
    known,
  ].join('\n');
}

/**
 * Kết quả một lượt trích xuất.
 *
 * `failed` tách bạch với `fields` rỗng là CÓ CHỦ Ý. Trước đây mọi sự cố đều trả
 * về một đối tượng rỗng, không phân biệt được với việc mô hình đọc xong và kết
 * luận "câu này không phải đặt lịch". Hệ quả: một lỗi mạng, một tên model sai,
 * hay một lần hết quota đều âm thầm biến thành "khách không muốn đặt" — và cả
 * luồng đặt lịch ngừng hoạt động mà không ai thấy lỗi ở đâu.
 */
export interface ExtractionResult {
  fields: ExtractedFields;
  /** `true` khi lượt gọi mô hình hỏng — KHÁC với việc mô hình trả lời "không". */
  failed: boolean;
}

export async function extractBookingFields(
  message: string,
  draft: FbBookingDraft | null,
): Promise<ExtractionResult> {
  /*
    Dùng model CHÍNH, không dùng model hỗ trợ.

    Đây không phải việc nhẹ như tên gọi "trích xuất" gợi ý. Nó phải đọc "19h tối
    mai", "thứ 7 tuần sau", "cuối tuần này" ra một mốc thời gian tuyệt đối kèm
    múi giờ — và sai một ngày ở đây nghĩa là khách bị giữ chỗ nhầm hôm, phát hiện
    ra khi đã tới quán.

    Chi phí của một lần đọc sai lớn hơn nhiều so với chênh lệch giá giữa hai
    model. Đổi lại, lượt gọi này đã được chặn ở tầng trên nên chỉ chạy khi khách
    thật sự đang đặt lịch, không chạy cho mọi câu hỏi vu vơ.
  */
  const todayIso = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);

  try {
    const response = await ai.models.generateContent({
      model: env.ai.model,
      config: {
        systemInstruction: buildPrompt(draft, todayIso),
        responseMimeType: 'application/json',
        responseSchema: EXTRACTION_SCHEMA,
      },
      contents: [{ role: 'user', parts: [{ text: message }] }],
    });

    const raw = (response.text ?? '').trim();
    if (!raw) return { fields: {}, failed: true };

    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { fields: {}, failed: true };
    return { fields: parsed as ExtractedFields, failed: false };
  } catch (err) {
    // Mức `error`, không phải `warn`: đây là chỗ cả luồng đặt lịch đứng lại.
    logger.error('FbExtract', 'lượt gọi mô hình trích xuất HỎNG', err);
    return { fields: {}, failed: true };
  }
}
