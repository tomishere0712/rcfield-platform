import { DataSource } from 'typeorm';
import { GoogleGenAI, type Content } from '@google/genai';
import { AppDataSource } from '../config/database';
import { env } from '../config/env';
import { classifyIntent } from '../config/nlu';
import { logger } from '../config/logger';
import { AppError, ChatResponse, WidgetConfigData } from '../types';
import { incrementAIQuota } from './subscription.service';
import { kbService } from './kb.service';
import { ragCache } from './rag-cache';
import { toolDefinitions, dispatchTool } from './chat-tools';

const ai = new GoogleGenAI({ apiKey: env.ai.googleApiKey });

type ChatRoute = 'fast' | 'thanks' | 'farewell' | 'rag';

interface HistoryMessage {
  role: 'user' | 'model';
  content: string;
}

// Verifies feature flag AI_CHATBOT is enabled for the cafe (admin toggle only).
// Admin-owned cafes bypass the gate entirely (used for system testing / demo).
export async function checkGate(cafeId: string): Promise<void> {
  const ds: DataSource = AppDataSource;

  const cafeRows = await ds.query<{ provider_role: string }[]>(
    `SELECT u.role AS provider_role
     FROM cafes c
     JOIN users u ON u.id = c.provider_id
     WHERE c.id = $1`,
    [cafeId],
  );

  if (cafeRows.length && cafeRows[0].provider_role === 'ADMIN') {
    logger.info('Gate', 'admin cafe — gate bypassed', { cafeId });
    return;
  }

  const rows = await ds.query<{ is_enabled: boolean }[]>(
    `SELECT is_enabled FROM feature_flags
     WHERE feature_key = 'AI_CHATBOT'
       AND entity_type = 'CAFE'
       AND entity_id = $1`,
    [cafeId],
  );

  logger.info('Gate', `checkGate cafeId=${cafeId} rows=${rows.length}`, rows[0] ?? null);

  if (!rows.length || !rows[0].is_enabled) {
    logger.warn('Gate', 'AI_DISABLED', { cafeId });
    throw new AppError(
      'Dịch vụ AI chat chưa được kích hoạt cho chi nhánh này.',
      503,
      'AI_DISABLED',
    );
  }

  logger.info('Gate', 'passed', { cafeId });
}

// Looks up the provider who owns the cafe then atomically checks + increments their AI quota.
// Admin-owned cafes bypass quota (used for system testing / demo).
export async function consumeProviderAIQuota(cafeId: string): Promise<void> {
  const ds: DataSource = AppDataSource;
  const rows = await ds.query<{ provider_id: string; role: string }[]>(
    `SELECT c.provider_id, u.role
     FROM cafes c
     JOIN users u ON u.id = c.provider_id
     WHERE c.id = $1`,
    [cafeId],
  );
  if (!rows.length) {
    throw new AppError('Cafe not found', 404, 'CAFE_NOT_FOUND');
  }
  const { provider_id: providerId, role } = rows[0];
  if (role === 'ADMIN') {
    logger.info('AIQuota', `admin cafe — quota bypassed`, { providerId, cafeId });
    return;
  }
  logger.info('AIQuota', `consuming quota for provider=${providerId} cafe=${cafeId}`);
  await incrementAIQuota(providerId);
  logger.info('AIQuota', `quota incremented ok`, { providerId, cafeId });
}

// Classifies message intent and returns routing decision + confidence
export async function route(
  message: string,
): Promise<{ route: ChatRoute; confidence: number; nluAvailable: boolean }> {
  const nlu = await classifyIntent(message);
  logger.info('Chat', 'intent classified', { intent: nlu.intent, confidence: nlu.confidence });

  if (nlu.intent === 'greeting' && !nlu.needs_llm_fallback && nlu.confidence >= 0.6) {
    return { route: 'fast', confidence: nlu.confidence, nluAvailable: nlu.available };
  }
  if (nlu.intent === 'thanks' && !nlu.needs_llm_fallback && nlu.confidence >= 0.6) {
    return { route: 'thanks', confidence: nlu.confidence, nluAvailable: nlu.available };
  }
  if (nlu.intent === 'farewell' && !nlu.needs_llm_fallback && nlu.confidence >= 0.6) {
    return { route: 'farewell', confidence: nlu.confidence, nluAvailable: nlu.available };
  }
  // slot_check intent: handled by Gemini function calling in ragChat — fall through to rag
  // needs_llm_fallback=true means NLU is uncertain → force Pro model (confidence=0)
  return {
    route: 'rag',
    confidence: nlu.needs_llm_fallback ? 0 : nlu.confidence,
    nluAvailable: nlu.available,
  };
}

// Returns immediate greeting response from widget config without calling any external service
export async function fastAnswer(cafeId: string): Promise<ChatResponse> {
  const ds: DataSource = AppDataSource;
  const [row] = await ds.query<{ widget_config: WidgetConfigData }[]>(
    `SELECT widget_config FROM cafes WHERE id = $1`,
    [cafeId],
  );
  const config = row?.widget_config;

  const greetingMessage = config?.greetingMessage ?? 'Xin chào! Tôi có thể giúp gì cho bạn?';
  const quickReplies = config?.quickReplies ?? [];

  return {
    answer: greetingMessage,
    responseType: 'greeting',
    quickReplies,
  };
}

export function thanksAnswer(): ChatResponse {
  const replies = [
    'Không có gì! Nếu cần thêm thông tin gì cứ hỏi nhé 😊',
    'Rất vui được giúp bạn! Có gì cần thêm không?',
    'Dạ không có chi! Bạn cần hỏi thêm gì nữa không?',
  ];
  return {
    answer: replies[Math.floor(Math.random() * replies.length)],
    responseType: 'thanks',
    quickReplies: ['Hỏi về giá', 'Kiểm tra lịch trống', 'Xem dịch vụ'],
  };
}

export function farewellAnswer(): ChatResponse {
  const replies = [
    'Tạm biệt bạn! Hẹn gặp lại tại sân xe RC nhé 🏎️',
    'Bye bạn! Mong sớm được phục vụ bạn.',
    'Tạm biệt! Chúc bạn một ngày vui vẻ 😊',
  ];
  return {
    answer: replies[Math.floor(Math.random() * replies.length)],
    responseType: 'farewell',
    quickReplies: [],
  };
}

// Generates 3 contextual quick-reply suggestions using Flash (called in parallel with main stream)
async function generateQuickReplies(message: string, cafeName: string): Promise<string[]> {
  try {
    const prompt = `You are the AI assistant for "${cafeName}" — a cafe that combines coffee with remote-controlled car racing.

TASK: Read the customer's question, then create EXACTLY 3 follow-up questions that the CUSTOMER might want to ask naturally.

RULES:
- Each question is a short inquiry, from the customer's perspective (not the staff's).
- Maximum 6 words, natural English.
- Must be directly related and follow-up to the customer's topic, helping them move closer to booking/using the service.
- Do not repeat the original question. The three questions must differ in direction.

EXAMPLES:
Customer asks: "Do you have RC cars for rent?"
Suggestions: ["How much does renting cost?", "What types of cars do you have?", "Do I need to book in advance?"]

Customer asks: "What are your opening hours?"
Suggestions: ["Are you open on weekends?", "What's your address?", "Do I need to reserve a table?"]

---
Customer's question: "${message}"

Return only a pure JSON array, no markdown, no explanation:
["question 1", "question 2", "question 3"]
# If user ask with vietnamese, return quick replies in vietnamese, if user ask with english, return quick replies in english.`;

    const response = await ai.models.generateContent({
      /*
        Ba câu gợi ý luôn dùng Flash, không bao giờ Pro.

        Đây là việc dễ nhất trong cả luồng: đọc một câu hỏi rồi đặt ba câu hỏi
        ngắn cùng chủ đề — không truy hồi, không suy luận, không đọc tài liệu.
        Pro không làm việc này tốt hơn Flash đủ để đáng chờ thêm.

        Mà cái giá thì thật: hàm này chạy SONG SONG với lượt sinh câu trả lời
        chính (`Promise.all` bên dưới), nên toàn bộ phản hồi phải đợi lượt chậm
        nhất trong hai. Ghim Pro ở đây biến mấy chữ gợi ý phụ thành thứ quyết
        định khách phải chờ bao lâu mới thấy câu trả lời.
      */
      model: env.ai.supportModel,
      contents: prompt,
    });

    const text = (response.text ?? '').trim().replace(/^```json\n?|```\n?$/g, '');
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed) && parsed.length >= 2) {
      return parsed
        .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
        .slice(0, 3);
    }
  } catch {
    // fall through to defaults
  }
  return ['Hỏi thêm về dịch vụ', 'Kiểm tra lịch trống', 'Xem bảng giá'];
}

interface TrackSummary {
  name: string;
  description: string | null;
  max_concurrent: number;
  byoc_capacity: number;
}

function buildSystemPrompt(
  cafe: {
    name: string;
    address: string | null;
    operating_hours: unknown;
    bookingUrl?: string;
    tracks?: TrackSummary[];
  },
  chunks: string[],
  customSystemPrompt?: string | null,
): string {
  const now = new Date();
  // Vietnam timezone offset: UTC+7
  const vnNow = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const todayStr = vnNow.toISOString().split('T')[0]; // YYYY-MM-DD
  const weekdays = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
  const todayLabel = `${weekdays[vnNow.getUTCDay()]}, ngày ${vnNow.getUTCDate()}/${vnNow.getUTCMonth() + 1}/${vnNow.getUTCFullYear()}`;

  const parts: string[] = [];

  if (customSystemPrompt?.trim()) {
    parts.push(customSystemPrompt.trim());
    parts.push('---');
  }

  parts.push(`Bạn là trợ lý AI của cafe xe RC "${cafe.name}".`);
  parts.push(`Hôm nay là ${todayLabel} (${todayStr}).`);
  parts.push(`Trả lời bằng tiếng Việt, ngắn gọn, rõ ràng.`);
  parts.push('');
  parts.push(`## Quy tắc sử dụng tool`);
  parts.push(
    `- Khi khách hỏi về lịch trống, slot còn không, đặt sân ngày nào: GỌI NGAY check_availability với ngày tốt nhất có thể suy ra.`,
  );
  parts.push(
    `- KHÔNG hỏi lại ngày tháng năm nếu có thể suy ra từ context (ví dụ: "thứ 7 này" = thứ 7 gần nhất, "ngày mai", "tuần tới", "cuối tuần"…).`,
  );
  parts.push(
    `- Nếu khách chỉ nói "ngày 12" mà không rõ tháng → dùng tháng hiện tại hoặc tháng kế tiếp, ĐỪNG hỏi lại.`,
  );
  parts.push(
    `- Khi khách hỏi về khuyến mãi, ưu đãi, giảm giá, mã giảm giá, deal: GỌI NGAY get_promotions.`,
  );
  parts.push(
    `- Khi khách hỏi về gói chơi, thẻ tháng, gói buổi, mua gói, giá gói: GỌI NGAY get_packages.`,
  );
  parts.push(`- Khi khách hỏi về menu, đồ ăn, thức uống, đồ uống, giá đồ ăn: GỌI NGAY get_menu.`);
  parts.push(
    `- Khi khách hỏi về xe RC, loại xe, xe nào phù hợp, giá thuê xe, xe cho người mới: GỌI NGAY get_vehicles.`,
  );
  parts.push(
    `- Khi khách hỏi về phí sân, giá một buổi chơi, chơi hết bao nhiêu tiền, giá cuối tuần, giá ngày lễ, giờ cao điểm có đắt hơn không: GỌI NGAY get_pricing.`,
  );
  parts.push(
    `- Phí sân và phí thuê xe là HAI khoản tách biệt. Khách thuê xe của quán trả cả hai; khách mang xe riêng (BYOC) chỉ trả phí sân. Muốn báo tổng thì gọi cả get_pricing và get_vehicles rồi cộng lại, ĐỪNG suy đoán.`,
  );
  parts.push('');
  parts.push(`## GIỚI HẠN TUYỆT ĐỐI — việc đặt lịch`);
  parts.push(
    `- Bạn KHÔNG có khả năng tạo đơn, giữ chỗ, hay xác nhận đặt lịch. Hệ thống đặt lịch nằm ngoài bạn.`,
  );
  parts.push(
    `- TUYỆT ĐỐI KHÔNG hỏi khách tên, số điện thoại, email để "ghi nhận đơn"; KHÔNG tóm tắt đơn; KHÔNG nói "đã ghi nhận", "đã giữ chỗ", "gõ xác nhận".`,
  );
  parts.push(
    `- Khách muốn đặt thì trả lời ngắn gọn rằng bạn sẽ chuyển sang bước đặt lịch, hoặc đưa link đặt lịch. KHÔNG tự dựng một quy trình đặt lịch bằng lời.`,
  );
  parts.push(
    `- Bạn VẪN trả lời thoải mái về giá, lịch trống, loại xe, loại sân, khuyến mãi — đó là việc của bạn.`,
  );
  parts.push('');
  parts.push(`## Kiến thức về chi nhánh`);
  parts.push(
    `Chỉ trả lời dựa trên thông tin dưới đây. Nếu không có thông tin, nói thẳng là không biết và gợi ý liên hệ trực tiếp chi nhánh.`,
  );
  parts.push(
    `Nếu các tài liệu có thông tin mâu thuẫn nhau, ưu tiên tài liệu có ngày cập nhật mới hơn.`,
  );
  parts.push('');
  parts.push(`Thông tin chi nhánh:`);
  parts.push(`- Địa chỉ: ${cafe.address ?? 'Chưa cập nhật'}`);
  parts.push(`- Giờ mở cửa: ${JSON.stringify(cafe.operating_hours ?? {})}`);
  if (cafe.bookingUrl) {
    parts.push(`- Link đặt lịch: ${cafe.bookingUrl}`);
    parts.push(
      `  → Khi đưa link cho khách, LUÔN dùng định dạng Markdown: [${cafe.name}](${cafe.bookingUrl})`,
    );
    parts.push(`  → KHÔNG paste URL thô, KHÔNG viết "[link]" hay placeholder.`);
  }

  if (cafe.tracks && cafe.tracks.length > 0) {
    parts.push('');
    parts.push(`Các loại sân tại chi nhánh:`);
    for (const track of cafe.tracks) {
      const modes: string[] = [];
      if (track.max_concurrent > 0) modes.push(`thuê xe (${track.max_concurrent} chỗ)`);
      if (track.byoc_capacity > 0) modes.push(`mang xe riêng (${track.byoc_capacity} chỗ)`);
      parts.push(
        `- **${track.name}**: hỗ trợ ${modes.join(', ')}.${track.description ? ` ${track.description}` : ''}`,
      );
    }
    parts.push(
      `  → Khi khách hỏi "sân nào phù hợp với mình", hãy gợi ý dựa trên mô tả các sân ở trên.`,
    );
  }

  parts.push('');
  parts.push(`Knowledge base:`);
  parts.push(chunks.length ? chunks.join('\n---\n') : '(Chưa có tài liệu knowledge base)');

  return parts.join('\n');
}

/*
  Viết lại câu đã có trong cache bằng Flash, để câu hỏi lặp không nghe như máy.

  Ghim Flash chứ không phải Pro — giống hệt bản streaming ở `ragChatStream`.
  Đây đáng lẽ là đường NHANH NHẤT của cả luồng: câu trả lời đã nằm sẵn trong
  cache, không truy hồi, không suy luận, chỉ đổi cách diễn đạt. Gọi Pro ở đây
  khiến cache TRÚNG lại chậm hơn cache TRƯỢT — đúng ngược điều cache sinh ra để
  làm.
*/
async function rephraseAnswer(answer: string, cafeId?: string): Promise<string> {
  logger.info('RAG', `cache rephrase via ${env.ai.supportModel}`, { cafeId });
  try {
    const response = await ai.models.generateContent({
      model: env.ai.supportModel,
      contents: `Câu trả lời gốc: "${answer}"
Viết lại câu này với cách diễn đạt khác nhưng giữ nguyên đầy đủ thông tin. Ngắn gọn, tự nhiên, bằng tiếng Việt.
Chỉ trả về câu viết lại, không thêm tiêu đề hay giải thích.`,
    });
    return (response.text ?? '').trim() || answer;
  } catch (err) {
    logger.warn('RAG', 'rephrase failed, returning original', err);
    return answer;
  }
}

// Embeds the message, retrieves relevant KB chunks, and generates answer via Gemini with function calling
export async function ragChat(
  cafeId: string,
  message: string,
  history: HistoryMessage[],
  nluConfidence = 0,
  nluAvailable = true,
): Promise<ChatResponse> {
  const ds: DataSource = AppDataSource;

  const queryEmbedding = await kbService.embedText(message);

  const cached = ragCache.get(cafeId, queryEmbedding);
  if (cached) {
    const answer = await rephraseAnswer(cached.answer, cafeId);
    return {
      answer,
      responseType: 'text',
      sources: cached.sources,
      quickReplies: cached.quickReplies,
    };
  }

  const [cafeRows, docRows, trackRows] = await Promise.all([
    ds.query<
      {
        name: string;
        address: string;
        operating_hours: unknown;
        slug: string;
        widget_config: WidgetConfigData;
      }[]
    >(`SELECT name, address, operating_hours, slug, widget_config FROM cafes WHERE id = $1`, [
      cafeId,
    ]),
    ds.query<{ title: string }[]>(
      `SELECT DISTINCT d.title FROM kb_chunks c
       JOIN kb_documents d ON c.document_id = d.id
       WHERE c.cafe_id = $1 AND d.deleted_at IS NULL`,
      [cafeId],
    ),
    ds.query<
      { name: string; description: string | null; max_concurrent: number; byoc_capacity: number }[]
    >(
      `SELECT tt.name, ctc.description, ctc.max_concurrent, ctc.byoc_capacity
       FROM cafe_track_configs ctc
       JOIN track_types tt ON tt.id = ctc.track_type_id
       WHERE ctc.cafe_id = $1 AND ctc.is_active = true AND ctc.deleted_at IS NULL
       ORDER BY ctc.sort_order ASC`,
      [cafeId],
    ),
  ]);

  if (!cafeRows.length) throw new AppError('Cafe not found', 404, 'CAFE_NOT_FOUND');
  const { widget_config: widgetConfig, ...cafeData } = cafeRows[0];
  const cafe = {
    ...cafeData,
    bookingUrl: `${env.frontendUrl}/booking/create?cafeId=${cafeId}&mode=hourly`,
    tracks: trackRows,
  };
  const sources = docRows.map((r) => r.title);

  const chunks = await kbService.retrieveChunks(ds, cafeId, queryEmbedding);
  const systemPrompt = buildSystemPrompt(cafe, chunks, widgetConfig?.systemPrompt);

  // NLU chết thì độ tin bằng 0 KHÔNG có nghĩa là "câu này dễ" — nó có nghĩa là
  // không ai đọc câu này cả. Dùng model chính trong trường hợp đó: trả lời sai
  // cho khách đắt hơn nhiều so với chênh lệch giá giữa hai model, và một dịch vụ
  // phụ trợ chết không được phép âm thầm hạ chất lượng cả sản phẩm.
  const selectedModel = !nluAvailable || nluConfidence >= 0.7 ? env.ai.model : env.ai.supportModel;
  if (!nluAvailable) {
    logger.warn('Chat', 'NLU không khả dụng — dùng model chính thay vì đoán theo độ tin', {
      cafeId,
    });
  }
  logger.info('Chat', `model selected: ${selectedModel}`, { cafeId, nluConfidence, nluAvailable });

  const baseContents: Content[] = [
    ...history.map((h) => ({ role: h.role, parts: [{ text: h.content }] })),
    { role: 'user', parts: [{ text: message }] },
  ];

  try {
    // First pass: model may call a tool
    const firstResponse = await ai.models.generateContent({
      model: selectedModel,
      config: {
        systemInstruction: systemPrompt,
        tools: [{ functionDeclarations: toolDefinitions }],
      },
      contents: baseContents,
    });

    const functionCalls = firstResponse.functionCalls;
    if (functionCalls?.length) {
      const fc = functionCalls[0];
      const fcName = fc.name ?? '';
      logger.info('Chat', `function call: ${fcName}`, { cafeId, args: fc.args });

      // cafeId comes from widget context — never from fc.args
      const toolResult = await dispatchTool(
        cafeId,
        fcName,
        (fc.args ?? {}) as Record<string, unknown>,
      );
      logger.info('Chat', `tool result: ${fcName}`, { cafeId, result: toolResult });

      // Second pass: send tool result back, get final answer
      const secondContents: Content[] = [
        ...baseContents,
        { role: 'model', parts: [{ functionCall: { name: fcName, args: fc.args } }] },
        {
          role: 'user',
          parts: [{ functionResponse: { name: fcName, response: { result: toolResult } } }],
        },
      ];

      const [finalResponse, quickReplies] = await Promise.all([
        ai.models.generateContent({
          model: selectedModel,
          config: { systemInstruction: systemPrompt },
          contents: secondContents,
        }),
        generateQuickReplies(message, cafe.name),
      ]);

      const answer = finalResponse.text ?? '';
      ragCache.set(cafeId, cafe.name, message, queryEmbedding, answer, sources, quickReplies);
      return { answer, responseType: 'text', sources, quickReplies };
    }

    // No function call — use response directly
    const [answer, quickReplies] = await Promise.all([
      Promise.resolve(firstResponse.text ?? ''),
      generateQuickReplies(message, cafe.name),
    ]);

    ragCache.set(cafeId, cafe.name, message, queryEmbedding, answer, sources, quickReplies);
    return { answer, responseType: 'text', sources, quickReplies };
  } catch (err) {
    logger.error('Chat', 'Gemini error', err);
    throw new AppError(
      'Trợ lý tạm thời không khả dụng, vui lòng thử lại sau.',
      503,
      'AI_UNAVAILABLE',
    );
  }
}

export async function ragChatStream(
  cafeId: string,
  message: string,
  history: HistoryMessage[],
  nluConfidence = 0,
): Promise<{
  stream: AsyncGenerator<string>;
  sources: string[];
  quickRepliesPromise: Promise<string[]>;
}> {
  const ds: DataSource = AppDataSource;
  const t = () => `+${Date.now() - t0}ms`;
  const t0 = Date.now();

  logger.info('RAG', 'Embed: ', { cafeId });
  const queryEmbedding = await kbService.embedText(message);
  logger.info('RAG', `Embed done (${queryEmbedding.length} dims)  ${t()}`, { cafeId });

  const cached = ragCache.get(cafeId, queryEmbedding);
  if (cached) {
    const hit = cached;
    async function* cachedStream(): AsyncGenerator<string> {
      /*
        Viết lại câu đã có sẵn thì dùng Flash, không dùng Pro.

        Đây đáng lẽ là đường NHANH NHẤT của cả luồng — câu trả lời đã nằm trong
        cache, không phải truy hồi, không phải suy luận. Vậy mà nó lại gọi Pro
        chỉ để diễn đạt lại một câu đã đúng sẵn, nên cache trúng có khi còn chậm
        hơn cả cache trượt ở phần sinh chữ.

        Diễn đạt lại là việc dễ nhất trong mọi việc ở đây: nội dung đã chốt, chỉ
        đổi cách nói. Pro không làm việc đó tốt hơn Flash đủ để đáng chờ thêm.
      */
      logger.info('RAG', `cache rephrase stream via ${env.ai.supportModel}`, { cafeId });
      try {
        const stream = await ai.models.generateContentStream({
          model: env.ai.supportModel,
          contents: `Câu trả lời gốc: "${hit.answer}"
Viết lại câu này với cách diễn đạt khác nhưng giữ nguyên đầy đủ thông tin. Ngắn gọn, tự nhiên, bằng tiếng Việt.
Chỉ trả về câu viết lại, không thêm tiêu đề hay giải thích.`,
        });
        for await (const chunk of stream) {
          const text = chunk.text;
          if (text) yield text;
        }
      } catch {
        yield hit.answer;
      }
    }
    return {
      stream: cachedStream(),
      sources: hit.sources,
      quickRepliesPromise: Promise.resolve(hit.quickReplies),
    };
  }

  const [cafeRows, docRows, trackRows] = await Promise.all([
    ds.query<
      {
        name: string;
        address: string;
        operating_hours: unknown;
        slug: string;
        widget_config: WidgetConfigData;
      }[]
    >(`SELECT name, address, operating_hours, slug, widget_config FROM cafes WHERE id = $1`, [
      cafeId,
    ]),
    ds.query<{ title: string }[]>(
      `SELECT DISTINCT d.title FROM kb_chunks c
       JOIN kb_documents d ON c.document_id = d.id
       WHERE c.cafe_id = $1 AND d.deleted_at IS NULL`,
      [cafeId],
    ),
    ds.query<
      { name: string; description: string | null; max_concurrent: number; byoc_capacity: number }[]
    >(
      `SELECT tt.name, ctc.description, ctc.max_concurrent, ctc.byoc_capacity
       FROM cafe_track_configs ctc
       JOIN track_types tt ON tt.id = ctc.track_type_id
       WHERE ctc.cafe_id = $1 AND ctc.is_active = true AND ctc.deleted_at IS NULL
       ORDER BY ctc.sort_order ASC`,
      [cafeId],
    ),
  ]);

  if (!cafeRows.length) throw new AppError('Cafe not found', 404, 'CAFE_NOT_FOUND');
  const { widget_config: widgetConfig, ...cafeData } = cafeRows[0];
  const cafe = {
    ...cafeData,
    bookingUrl: `${env.frontendUrl}/booking/create?cafeId=${cafeId}&mode=hourly`,
    tracks: trackRows,
  };
  const sources = docRows.map((r) => r.title);

  logger.info('RAG', `Pgvector retrieval...  ${t()}`, { cafeId });
  const chunks = await kbService.retrieveChunks(ds, cafeId, queryEmbedding);
  logger.info('RAG', `Retrieved ${chunks.length} chunk(s)  ${t()}`, { cafeId, sources });

  const systemPrompt = buildSystemPrompt(cafe, chunks, widgetConfig?.systemPrompt);
  /*
    Chọn model theo độ chắc chắn của NLU — cùng quy tắc với `ragChat` không
    stream (xem chỗ đặt `selectedModel` ở hàm đó).

    Luồng này trước đây ghim cứng `env.ai.model`, tức là MỌI câu hỏi đều chạy
    Pro. Tham số độ chắc chắn vẫn được controller truyền xuống đầy đủ, chỉ là
    tên nó có gạch dưới ở đầu nên bị bỏ không dùng — logic đã viết xong mà không
    ai cắm vào. Mà đây mới là luồng người dùng thật sự chạm tới khi chat.

    Câu hỏi NLU đọc ra rõ ràng ("mấy giờ mở cửa", "giá bao nhiêu") thì Flash trả
    lời thừa sức và nhanh hơn hẳn; chỉ câu mơ hồ mới cần Pro.
  */
  const selectedModel = nluConfidence >= 0.7 ? env.ai.model : env.ai.supportModel;
  logger.info('RAG', `model selected: ${selectedModel}`, { cafeId, nluConfidence });
  const quickRepliesPromise = generateQuickReplies(message, cafe.name);

  const baseContents: Content[] = [
    ...history.map((h) => ({ role: h.role, parts: [{ text: h.content }] })),
    { role: 'user', parts: [{ text: message }] },
  ];

  async function* tokenStream(): AsyncGenerator<string> {
    let fullAnswer = '';
    let firstToken = true;

    // First pass: stream with tools. If model calls a function, no text is yielded.
    logger.info('RAG', `Calling ${selectedModel} Streaming (with tools)  ${t()}`, { cafeId });
    const firstStream = await ai.models.generateContentStream({
      model: selectedModel,
      config: {
        systemInstruction: systemPrompt,
        tools: [{ functionDeclarations: toolDefinitions }],
      },
      contents: baseContents,
    });

    let detectedFunctionCall: { name: string; args: Record<string, unknown> } | null = null;

    for await (const chunk of firstStream) {
      const fcs = chunk.functionCalls;
      if (fcs?.length) {
        // Model decided to call a tool — no text in this response
        const fc = fcs[0];
        detectedFunctionCall = {
          name: fc.name ?? '',
          args: (fc.args ?? {}) as Record<string, unknown>,
        };
        logger.info('RAG', `function call detected: ${detectedFunctionCall.name}  ${t()}`, {
          cafeId,
        });
        break;
      }
      if (chunk.text) {
        if (firstToken) {
          logger.info('RAG', `First token  ${t()}`, { cafeId });
          firstToken = false;
        }
        fullAnswer += chunk.text;
        yield chunk.text;
      }
    }

    if (detectedFunctionCall) {
      // Execute tool — cafeId from widget context, never from function call args
      const toolResult = await dispatchTool(
        cafeId,
        detectedFunctionCall.name,
        detectedFunctionCall.args,
      );
      logger.info('RAG', `tool executed: ${detectedFunctionCall.name}  ${t()}`, { cafeId });

      // Second pass: stream final answer incorporating tool result
      const secondContents: Content[] = [
        ...baseContents,
        {
          role: 'model',
          parts: [
            { functionCall: { name: detectedFunctionCall.name, args: detectedFunctionCall.args } },
          ],
        },
        {
          role: 'user',
          parts: [
            {
              functionResponse: {
                name: detectedFunctionCall.name,
                response: { result: toolResult },
              },
            },
          ],
        },
      ];

      const secondStream = await ai.models.generateContentStream({
        model: selectedModel,
        config: { systemInstruction: systemPrompt },
        contents: secondContents,
      });

      for await (const chunk of secondStream) {
        if (chunk.text) {
          if (firstToken) {
            logger.info('RAG', `First token (after tool)  ${t()}`, { cafeId });
            firstToken = false;
          }
          fullAnswer += chunk.text;
          yield chunk.text;
        }
      }
    }

    logger.info('RAG', `Stream complete  ${t()}`, { cafeId });
    const quickReplies = await quickRepliesPromise;
    ragCache.set(cafeId, cafe.name, message, queryEmbedding, fullAnswer, sources, quickReplies);
  }

  return { stream: tokenStream(), sources, quickRepliesPromise };
}

// Widget config helpers used by controller
export async function getWidgetConfigForCafe(cafeId: string): Promise<WidgetConfigData | null> {
  const [row] = await AppDataSource.query<{ widget_config: WidgetConfigData }[]>(
    `SELECT widget_config FROM cafes WHERE id = $1`,
    [cafeId],
  );
  return row?.widget_config ?? null;
}

export async function upsertWidgetConfig(
  cafeId: string,
  updates: Partial<WidgetConfigData>,
): Promise<WidgetConfigData> {
  const ds: DataSource = AppDataSource;

  const patches: Partial<WidgetConfigData> = {};
  if (updates.greetingMessage !== undefined) patches.greetingMessage = updates.greetingMessage;
  if (updates.welcomeMessage !== undefined) patches.welcomeMessage = updates.welcomeMessage;
  if (updates.position !== undefined) patches.position = updates.position;
  if (updates.primaryColor !== undefined) patches.primaryColor = updates.primaryColor;
  if (updates.avatarUrl !== undefined) patches.avatarUrl = updates.avatarUrl;
  if (updates.quickReplies !== undefined) patches.quickReplies = updates.quickReplies;
  if (updates.systemPrompt !== undefined) patches.systemPrompt = updates.systemPrompt;
  if (updates.isEnabled !== undefined) patches.isEnabled = updates.isEnabled;
  if (updates.fullPageEnabled !== undefined) patches.fullPageEnabled = updates.fullPageEnabled;

  await ds.query(
    `UPDATE cafes SET widget_config = widget_config || $1::jsonb, updated_at = now() WHERE id = $2`,
    [JSON.stringify(patches), cafeId],
  );

  ragCache.clear(cafeId);

  // Sync AI_CHATBOT feature flag to match widget enabled state.
  // Uses CTE upsert because the unique index is partial (WHERE entity_id IS NOT NULL)
  // and cannot be referenced directly in ON CONFLICT.
  if (updates.isEnabled !== undefined) {
    await ds.query(
      `WITH updated AS (
         UPDATE feature_flags
         SET is_enabled = $1, updated_at = now()
         WHERE feature_key = 'AI_CHATBOT' AND entity_type = 'CAFE' AND entity_id = $2
         RETURNING id
       )
       INSERT INTO feature_flags (feature_key, display_name, is_enabled, entity_type, entity_id)
       SELECT 'AI_CHATBOT', 'Chatbot hỗ trợ khách hàng (AI)', $1, 'CAFE', $2
       WHERE NOT EXISTS (SELECT 1 FROM updated)`,
      [updates.isEnabled, cafeId],
    );
  }

  const [row] = await ds.query<{ widget_config: WidgetConfigData }[]>(
    `SELECT widget_config FROM cafes WHERE id = $1`,
    [cafeId],
  );
  return row.widget_config;
}
