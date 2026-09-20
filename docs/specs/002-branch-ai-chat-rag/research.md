# Research: Branch AI Chat Assistant

**Phase 0 Output** | **Date**: 2026-05-17

---

## R-001: Vector Storage — pgvector vs Qdrant

**Decision**: pgvector trên PostgreSQL hiện tại.

**Rationale**: RCField có ~10–30 cafes. Mỗi cafe có vài chục tài liệu, mỗi tài liệu ~20–50 chunks → tổng <10k vectors. Qdrant là overkill: thêm một service mới, thêm infrastructure cost, thêm failure point. pgvector với HNSW index đủ tốt cho scale này và reuse cùng DB connection pool hiện có.

**Alternatives considered**:
- Qdrant: managed service, excellent performance, nhưng thêm infrastructure dependency không cần thiết ở phase 1.
- Chroma: pure in-memory, không phù hợp production.
- Weaviate: tương tự Qdrant — overkill.

**HNSW params**: `m=16, ef_construction=64` — default tốt cho < 100k vectors.

---

## R-002: Embedding Model — Gemini text-embedding-004

**Decision**: Google Gemini `text-embedding-004`, 768 dimensions.

**Rationale**:
- Cùng vendor với Gemini LLM → 1 API key, 1 SDK (`@google/genai`).
- 768 dims — cân bằng quality vs storage (768 × 4 bytes = 3KB/vector).
- Hỗ trợ tiếng Việt tốt (multilingual model).
- Free tier đủ dùng cho development; production cost thấp hơn OpenAI ada-002.

**Alternatives considered**:
- OpenAI text-embedding-3-small: tốt nhưng thêm vendor dependency.
- sentence-transformers local: latency cao hơn, cần GPU để đạt tốc độ tốt.
- Cohere embed: thêm vendor.

---

## R-003: LLM — Gemini 2.5 Pro (stream) + 2.5 Flash (quick replies / rephrase)

**Decision**: Split model usage theo mục đích:
- **Streaming RAG** (`/chat/stream`): `gemini-2.5-pro` — độ chính xác cao hơn cho Q&A KB.
- **Quick reply suggestions** + **cache rephrase**: `gemini-2.5-flash` — chạy song song/background, không block stream.
- **Non-streaming RAG** (`/chat`): routing nluConfidence ≥ 0.7 → Flash, < 0.7 → Pro.

Cấu hình qua env: `AI_MODEL` (Flash), `AI_SUPPORT_MODEL` (Pro).

**Rationale**:
- Pro cho stream: user thấy từng chữ xuất hiện → latency TTFT chấp nhận được dù Pro chậm hơn Flash.
- Flash cho background tasks: quick replies + rephrase chạy parallel, xong trước khi stream finish.
- Tách env vars → dễ swap model mà không cần sửa code.

**System prompt strategy**: Vietnamese-only, scoped to RC cafe domain, explicit instruction không hallucinate khi KB thiếu thông tin. Khi tài liệu mâu thuẫn → ưu tiên tài liệu có ngày cập nhật mới hơn.

---

## R-004: NLU Routing — Mekit NLU Service

**Decision**: Reuse Mekit NLU codebase (Python/FastAPI + sentence-transformers), chạy Docker container riêng (`nlu-service:8000`), expose nội bộ qua Docker network.

**Rationale**:
- Prototype embedding approach (mean of example embeddings per intent): ~10ms inference, không phụ thuộc Gemini API.
- 7 intents đủ cho domain RC: `fast_answer`, `slot_check`, `pricing_query`, `policy_query`, `vehicle_query`, `fnb_query`, `rag_query`.
- Intents cấu hình qua `intents/rcfield.json` — không hardcode.
- Confidence threshold 0.6: dưới ngưỡng thì `needs_llm_fallback=true` → route về `rag` không phải lỗi.
- Timeout 200ms từ BE → fallback về `rag` nếu NLU service unreachable.

**Docker service name**: `nlu-service` (thêm vào `docker-compose.yml`).

**Model load**: sentence-transformers `paraphrase-multilingual-mpnet-base-v2` — hỗ trợ tiếng Việt, 768 dims, load once at startup.

---

## R-005: Document Processing Pipeline

**Decision**: Đồng bộ trong request thread (không dùng job queue trong Phase 1).

**Flow**:
1. Upload nhận file → save `kb_document` với `status=PENDING` → return 201 ngay.
2. Trigger async processing trong background (không await): `setImmediate(() => kbService.processDocument(docId))`.
3. Process: parse → chunk → embed → bulk insert chunks → update status.
4. WebSocket push `kb_document.status_changed` event khi xong.

**Rationale**: Job queue (Bull, BullMQ) là overkill cho phase 1. `setImmediate` đủ để không block HTTP response. Redis đã có sẵn nếu sau này cần upgrade lên proper queue.

**Chunking**: ~500 tokens, overlap 100 tokens. Token estimate: 1 token ≈ 4 chars tiếng Việt. Chunk size ~2000 chars, overlap ~400 chars. Dùng simple sliding window — không cần sentence boundary detection cho phase 1.

**Parsers**:
- PDF: `pdf-parse` — extract text, skip images. File PDF password-protected → lỗi parse → `status=FAILED`.
- DOCX: `mammoth` — convert to plain text, strip formatting.
- TXT/MD: `fs.readFile` trực tiếp.

---

## R-006: WebSocket Infrastructure

**Decision**: `ws` library (native Node.js WebSocket), singleton service, shared across toàn hệ thống.

**Rationale**:
- `ws` nhẹ, không dependency phức tạp, production-ready.
- Socket.IO overkill cho phase 1 (không cần rooms, namespaces, fallback polling).
- Shared singleton (`WebSocketService`) được khởi tạo tại `server.ts`, inject vào services cần push event.
- Event đầu tiên: `kb_document.status_changed`.

**Auth**: Provider cần gửi JWT khi connect WS (`ws://host?token=JWT`). Validate token tại `connection` event.

**Phạm vi**: WS infrastructure được thiết kế dùng chung (session events, notification events sau này). Phase này chỉ implement sự kiện đầu tiên.

---

## R-007: Quota Management

**Decision**: Dùng `feature_flags` table với `entity_type='CAFE'`, `entity_id=cafeId`, `config JSONB`.

**Config schema**:
```json
{
  "monthly_quota": 1000,
  "used_this_month": 234,
  "quota_reset_day": 1
}
```

**Flow**: Mỗi chat request thành công → `UPDATE feature_flags SET config = jsonb_set(config, '{used_this_month}', (config->>'used_this_month')::int + 1) WHERE feature_key='AI_CHATBOT' AND entity_id=$cafeId`.

**Reset**: Admin thủ công gọi API update `used_this_month=0`. Không có cron job phase 1.

**Gate check**: `config.used_this_month >= config.monthly_quota` → HTTP 429.

---

## R-009: Google GenAI SDK Migration + Implicit Caching

**Decision**: Migrate từ `@google/generative-ai` (deprecated) sang `@google/genai` (unified SDK mới).

**Rationale**:
- `@google/genai` là SDK chính thức mới từ Google, hỗ trợ Gemini 2.5 và implicit caching.
- **Implicit caching**: Gemini 2.5 Pro tự động cache phần đầu prompt (system instruction + KB chunks) nếu prefix giống nhau qua nhiều request cho cùng cafe → TTFT giảm từ ~9s xuống ~600ms sau lần đầu.
- Minimum token threshold để cache kick in: 1024 tokens (Gemini 2.5 Pro).
- Cache tự động phía Google server — không cần code thêm, chỉ cần dùng đúng SDK.

**API thay đổi chính**:
```typescript
// Cũ
import { GoogleGenerativeAI } from '@google/generative-ai';
const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({ model, systemInstruction });
const result = await model.generateContent(prompt);
const text = result.response.text(); // method

// Mới
import { GoogleGenAI } from '@google/genai';
const ai = new GoogleGenAI({ apiKey });
const response = await ai.models.generateContent({ model, config: { systemInstruction }, contents });
const text = response.text; // property

// Stream mới — iterate trực tiếp, không dùng result.stream
const stream = await ai.models.generateContentStream({ model, config, contents });
for await (const chunk of stream) { const text = chunk.text; }

// Embedding mới
const result = await ai.models.embedContent({ model, contents: text });
return result.embeddings![0].values!;
```

**Lưu ý**: `quickRepliesPromise` tách ra khỏi `Promise.all` với stream call để tránh blocking TTFT. Quick replies chạy song song trong background, được await sau khi stream complete.

---

## R-008: Cafe Isolation

**Decision**: Mọi query liên quan KB PHẢI include `WHERE cafe_id = $cafeId` — không được bỏ qua dù có document_id.

**Pattern**:
```sql
-- Luôn filter theo cafe_id, không chỉ document_id
SELECT * FROM kb_chunks WHERE cafe_id = $1 AND document_id = $2

-- RAG retrieval
SELECT chunk_text FROM kb_chunks
WHERE cafe_id = $1
ORDER BY embedding <=> $2::vector LIMIT 5
```

Đây là invariant bảo mật — một cafe không bao giờ được thấy KB của cafe khác.

---

## R-010: Per-Cafe System Prompt

**Decision**: Thêm column `system_prompt TEXT NULL` vào `cafe_widget_configs`. Managed qua `PUT /chat/config` hiện có (thêm field, không tạo endpoint mới).

**Rationale**:
- Provider cần cấu hình hành vi AI riêng cho từng chi nhánh (tone, rules, restrictions) độc lập với KB.
- Lưu cùng `cafe_widget_configs` vì đây là per-cafe AI config — không cần bảng riêng cho Phase 1.
- Max 2000 ký tự — đủ cho vài rule hành vi, không chiếm token của KB (KB chunks ~3000-5000 tokens).

**Priority rule**: `system_prompt → cafe_info → KB chunks` trong Gemini system instruction.
- `system_prompt` đặt đầu → weight cao nhất, override KB nếu conflict.
- Áp dụng cho RAG route (`ragChat`, `ragChatStream`). fast_answer/slot_check giữ nguyên (không qua Gemini).
- Khi `system_prompt = null` → behavior giữ nguyên như trước.

**Migration**: `1747872000000-AddSystemPrompt.ts` — `ALTER TABLE cafe_widget_configs ADD COLUMN system_prompt TEXT NULL`.

**Future**: UI sẽ guide Provider điền system_prompt theo template có cấu trúc (tone, giới hạn topic, routing rules) để tránh viết prompt quá dài thay thế KB.
