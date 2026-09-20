# RCField — AI Chat & RAG Architecture Overview

> Quick reference for understanding the Branch AI Chat feature: NLU routing, RAG pipeline, KB ingestion, SSE streaming.

**Last Updated:** 2026-05-17

---

## What is Branch AI Chat?

Mỗi chi nhánh (cafe) của RCField có một **AI chat widget riêng**. Customer gửi câu hỏi bằng tiếng Việt tự nhiên và nhận câu trả lời chính xác dựa trên tài liệu mà Provider đã upload cho chi nhánh đó.

### Core Value Proposition

- Customer hỏi giờ mở cửa, giá thuê xe, nội quy... → trả lời tức thì, đúng ngữ cảnh chi nhánh
- Provider tự quản lý knowledge base bằng cách upload PDF/DOCX/TXT — không cần dev
- Namespace isolation: mỗi cafe chỉ thấy chunks của mình, không lẫn dữ liệu giữa chi nhánh

### Hai vai trò chính

| Actor | Quyền | Hành động |
|-------|-------|-----------|
| **Customer** | Public (không cần auth) | Gửi message, nhận trả lời |
| **Provider** | JWT + PROVIDER role | Upload / list / xóa tài liệu KB, cấu hình widget |

---

## Project Structure

```
rcfeild-be/
├── src/
│   ├── controllers/
│   │   ├── chat.controller.ts     ← validate, điều phối route, SSE writer
│   │   └── kb.controller.ts       ← upload/list/delete document, debug endpoint
│   ├── services/
│   │   ├── chat.service.ts        ← routing logic, fast/slot/rag handlers
│   │   └── kb.service.ts          ← embed, chunk, retrieve, upsert
│   ├── models/
│   │   ├── kb-document.entity.ts
│   │   ├── kb-chunk.entity.ts
│   │   └── cafe-widget-config.entity.ts
│   └── routes/
│       └── chat.routes.ts
│
└── nlu-service/                   ← Python FastAPI (port 8000)
    ├── main.py                    ← /classify endpoint
    ├── intents/
    │   └── rcfield.json           ← intent patterns (greeting, slot_check)
    └── README.md
```

---

## Technology Stack

### AI / ML

| Layer | Technology | Ghi chú |
|-------|------------|---------|
| LLM | Gemini 2.5 Pro | Complex / low-confidence queries |
| LLM | Gemini 2.0 Flash | Simple / high-confidence queries + quick replies gen |
| Embedding | Gemini text-embedding-001 | 768 dimensions |
| Vector DB | pgvector (PostgreSQL extension) | Không dùng Qdrant — dùng DB sẵn có |
| NLU | Python FastAPI (custom) | Keyword matching, chạy local port 8000 |

### Backend

| Layer | Technology |
|-------|------------|
| Runtime | Node.js 20+, TypeScript strict |
| Framework | Express.js |
| DB | PostgreSQL + TypeORM |
| File parsing | pdf-parse (PDF), mammoth (DOCX), plain text (TXT/MD) |
| File upload | multer (multipart, max 10MB) |
| Streaming | SSE (Server-Sent Events) — `text/event-stream` |

---

## System Architecture

### High-Level Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                        Client Layer                         │
│   ┌─────────────────────────┐   ┌─────────────────────────┐ │
│   │  Customer (chat widget) │   │  Provider (admin UI)    │ │
│   │  POST /chat/stream      │   │  POST /kb/documents     │ │
│   └────────────┬────────────┘   └────────────┬────────────┘ │
└────────────────┼─────────────────────────────┼──────────────┘
                 │ SSE / REST                  │ REST + JWT
                 ▼                             ▼
┌─────────────────────────────────────────────────────────────┐
│                    Express API Server                       │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Middlewares: logger → CORS → JWT (provider only)     │  │
│  └─────────────────────────┬─────────────────────────────┘  │
│                            │                                │
│  ┌─────────────────────────┴────────────────────────────┐   │
│  │  chat.routes.ts                                       │   │
│  │  POST /chat · POST /chat/stream · GET /chat/config    │   │
│  │  GET /kb/documents · POST /kb/documents               │   │
│  │  DELETE /kb/documents/:id · GET /kb/debug             │   │
│  └──────────────┬──────────────────┬────────────────────┘   │
│                 │                  │                         │
│  ┌──────────────┴───┐    ┌─────────┴──────────┐             │
│  │  chat.service    │    │    kb.service       │             │
│  │  - checkGate()   │    │  - embedText()      │             │
│  │  - route()       │    │  - chunkText()      │             │
│  │  - fastAnswer()  │    │  - upsertChunks()   │             │
│  │  - slotCheck()   │    │  - retrieveChunks() │             │
│  │  - ragChatStream()│   └──────────┬──────────┘             │
│  └──────┬───────────┘              │                        │
└─────────┼──────────────────────────┼────────────────────────┘
          │                          │
    ┌─────┴──────┐        ┌──────────┴──────────┐
    │ NLU Service│        │   PostgreSQL         │
    │ :8000      │        │   kb_documents       │
    │ /classify  │        │   kb_chunks (vector) │
    └─────┬──────┘        │   cafe_widget_configs│
          │               │   feature_flags      │
          │               │   cafes / bookings   │
          │               └──────────────────────┘
          │
    ┌─────┴────────────────────┐
    │    Gemini API (Google)   │
    │  text-embedding-001      │
    │  gemini-2.5-pro          │
    │  gemini-2.0-flash        │
    └──────────────────────────┘
```

---

## NLU Routing

NLU Service (Python, port 8000) phân loại intent trước khi quyết định xử lý. Backend gọi `/classify` với timeout 500ms — nếu NLU down thì tự fallback sang RAG.

```
message
   │
   ▼
NLU /classify
   │
   ├── intent = greeting   confidence ≥ 0.6   needs_llm_fallback = false
   │     └──→  fastAnswer()  — đọc greeting_message từ cafe_widget_configs
   │
   ├── intent = slot_check  confidence ≥ 0.6   needs_llm_fallback = false
   │     └──→  slotCheck()   — query generate_series + COUNT bookings
   │
   └── anything else  (rag_query / low confidence / NLU timeout)
         └──→  ragChatStream()  — embed + pgvector + Gemini
```

### Route Comparison

| Route | Xử lý | Gọi external | Latency típ |
|-------|-------|--------------|-------------|
| `fast` | Trả greeting message từ DB config | Không | ~5ms |
| `slot_check` | Query `generate_series` + `COUNT(bookings)` | Không | ~30ms |
| `rag` | Embed → pgvector → Gemini stream | Gemini API | ~2–10s |

---

## Chat Request Flow (RAG path)

```
1. checkGate(cafeId)
   └── feature_flags: AI_CHATBOT enabled? quota not exceeded?
   └── 503 AI_DISABLED / 429 QUOTA_EXCEEDED nếu fail

2. route(message)
   └── NLU /classify → { intent, confidence }
   └── quyết định fast / slot_check / rag

3. [RAG only] Promise.all — chạy song song:
   ├── embedText(message)               → Gemini text-embedding-001
   ├── SELECT name, address, hours      → cafes table
   └── SELECT DISTINCT doc titles       → kb_chunks JOIN kb_documents

4. retrieveChunks(cafeId, queryEmbedding)
   └── SELECT chunk_text ORDER BY embedding <=> query LIMIT 5

5. Build system prompt
   └── cafe info + retrieved chunks + instruction

6. Promise.all — chạy song song:
   ├── chat.sendMessageStream(message)  → Gemini 2.5 Pro / 2.0 Flash
   └── generateQuickReplies(message)    → Gemini 2.0 Flash (3 câu gợi ý)

7. SSE stream tokens → client
   └── event: chunk  { text }
   └── event: done   { sources, quick_replies, full_answer }

8. incrementQuota(cafeId)
```

---

## Model Selection

```
nluConfidence ≥ 0.7
  └──→ GOOGLE_SUPPORT_MODEL  (gemini-2.0-flash)   — simple / context-rich query

nluConfidence < 0.7
  └──→ GOOGLE_MODEL          (gemini-2.5-pro)      — complex / uncertain query
```

Quick replies luôn dùng `gemini-2.0-flash` bất kể confidence — ngắn, nhanh, không cần suy luận sâu.

---

## Document Ingestion Flow

```
Provider POST /kb/documents (multipart, max 10MB)
   │
   ├── Parse text từ file
   │     .pdf   → pdf-parse      (extract raw text)
   │     .docx  → mammoth        (convert to plain text)
   │     .txt / .md → direct read
   │
   ├── INSERT kb_documents  status=PENDING
   │
   ├── Chunk text
   │     ~500 tokens per chunk
   │     100 token overlap
   │
   ├── Embed mỗi chunk
   │     Gemini text-embedding-001 → vector(768)
   │
   ├── INSERT kb_chunks[]
   │     cafe_id, document_id, chunk_text, chunk_index, embedding
   │
   └── UPDATE kb_documents SET status = INDEXED
         (hoặc FAILED nếu lỗi bất kỳ bước nào)
```

**Quan trọng**: File gốc không lưu vào disk. Text đã parse lưu trong `kb_documents.raw_content`.

---

## RAG Retrieval (pgvector)

```sql
SELECT chunk_text
FROM   kb_chunks
WHERE  cafe_id = $1
ORDER  BY embedding <=> $2::vector   -- cosine distance
LIMIT  5
```

Namespace hoàn toàn theo `cafe_id` — chi nhánh A không thấy dữ liệu chi nhánh B.

### Debug Scores

```
similarity = 1 - (embedding <=> query::vector)   -- cosine similarity [0, 1]

≥ 0.75  →  good       (retrieved chunk rất liên quan)
≥ 0.50  →  weak       (liên quan một phần)
< 0.50  →  no_match   (có thể trả lời sai hoặc "không biết")
```

---

## Core Data Model

```
Cafe ──────┬──── CafeWidgetConfig    (1-1: greeting, theme, quick_replies)
           │
           └──── KbDocument[] ───── KbChunk[]
                  │                  ├── chunk_text
                  ├── title           ├── chunk_index
                  ├── content_type    └── embedding vector(768)
                  ├── raw_content
                  └── status (PENDING / INDEXED / FAILED)

feature_flags ─── AI_CHATBOT per cafe
                   └── config: { monthly_quota, used_this_month, quota_reset_day }
```

### Table Schema Summary

| Table | Columns chính | Ghi chú |
|-------|---------------|---------|
| `kb_documents` | id, cafe_id, title, original_filename, content_type, raw_content, status, created_by | Soft delete (`deleted_at`) |
| `kb_chunks` | id, cafe_id, document_id, chunk_text, chunk_index, embedding vector(768) | cafe_id denormalized để query nhanh |
| `cafe_widget_configs` | cafe_id (PK), greeting_message, position, primary_color, avatar_url, quick_replies jsonb | 1-1 với cafes |

### Indexes cần thiết

```sql
CREATE INDEX ON kb_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX ON kb_chunks (cafe_id);
```

---

## SSE Streaming Protocol

```
Content-Type: text/event-stream
Cache-Control: no-cache

event: chunk
data: {"text":"Giá thuê xe tiêu chuẩn là "}

event: chunk
data: {"text":"200.000đ/giờ bạn nhé."}

event: done
data: {
  "response_type": "text",
  "sources": ["rc-arena-hanoi-kb.md"],
  "quick_replies": ["Xe nào phù hợp người mới?", "Kiểm tra lịch trống", "Cách đặt lịch?"],
  "full_answer": "Giá thuê xe tiêu chuẩn là 200.000đ/giờ bạn nhé."
}
```

Client render text progressive từ `chunk` events. `done` event cung cấp metadata để render sources + quick replies.

---

## API Endpoints

```
-- Public (không cần auth) --
POST   /api/cafes/:cafeId/chat                  JSON response (dùng cho server-side / non-browser)
POST   /api/cafes/:cafeId/chat/stream           SSE stream (dùng cho chat widget)
GET    /api/cafes/:cafeId/chat/config           Widget config (greeting, màu, quick_replies)
GET    /api/cafes/:cafeId/kb/debug?query=...    Debug retrieval scores (dev tool)

-- Provider only (JWT + PROVIDER role) --
PUT    /api/cafes/:cafeId/chat/config           Cập nhật widget config
GET    /api/cafes/:cafeId/kb/documents          List tài liệu đã upload
POST   /api/cafes/:cafeId/kb/documents          Upload tài liệu mới (multipart)
DELETE /api/cafes/:cafeId/kb/documents/:docId   Xóa tài liệu + toàn bộ chunks liên quan
```

---

## Feature Flag & Quota

```
Table: feature_flags
  feature_key = 'AI_CHATBOT'
  entity_type = 'CAFE'
  entity_id   = <cafeId>
  is_enabled  = true | false
  config      = {
    "monthly_quota":    1000,
    "used_this_month":  42,
    "quota_reset_day":  1
  }
```

| Điều kiện | HTTP | Error code |
|-----------|------|------------|
| `is_enabled = false` | 503 | `AI_DISABLED` |
| `used_this_month ≥ monthly_quota` | 429 | `QUOTA_EXCEEDED` |

`incrementQuota()` chạy sau khi response gửi thành công — không đếm request lỗi.

---

## Backend Code Structure (AI module)

```
src/
├── controllers/
│   ├── chat.controller.ts     POST /chat, POST /chat/stream, GET|PUT /chat/config
│   └── kb.controller.ts       GET|POST|DELETE /kb/documents, GET /kb/debug
│
├── services/
│   ├── chat.service.ts
│   │   ├── checkGate()        feature flag + quota check
│   │   ├── incrementQuota()   ghi lại lượt dùng sau request
│   │   ├── route()            gọi NLU, trả { route, confidence }
│   │   ├── fastAnswer()       đọc greeting từ cafe_widget_configs
│   │   ├── parseDate()        parse "ngày mai", "thứ 3", "cuối tuần"
│   │   ├── slotCheck()        query bookings, trả available slots
│   │   ├── ragChat()          embed + retrieve + Gemini (non-streaming)
│   │   ├── ragChatStream()    embed + retrieve + Gemini SSE
│   │   ├── generateQuickReplies()  Flash call song song với main stream
│   │   ├── getWidgetConfigForCafe()
│   │   └── upsertWidgetConfig()
│   │
│   └── kb.service.ts
│       ├── embedText()        gọi Gemini text-embedding-001
│       ├── chunkText()        split ~500 tokens, overlap 100
│       ├── parseFile()        route đến pdf-parse / mammoth / plain text
│       ├── ingestDocument()   parse → chunk → embed → INSERT
│       └── retrieveChunks()   pgvector cosine similarity query
│
├── models/
│   ├── kb-document.entity.ts
│   ├── kb-chunk.entity.ts
│   └── cafe-widget-config.entity.ts
│
└── routes/
    └── chat.routes.ts
```

---

## Development Setup

```bash
# Backend
cd rcfeild-be
npm install
npm run dev          # Express :3000, hot reload

# NLU Service (cần chạy riêng)
npm run nlu          # Python FastAPI :8000, hot reload

# Demo widget (test chat)
npm run ui           # http.server :5500 (kill port cũ trước)
# → mở http://localhost:5500/chat-widget-demo.html

# KB debug UI
# → mở http://localhost:5500/kb-debug.html
```

### Required Environment Variables

```bash
# Google AI
GOOGLE_API_KEY=...
GOOGLE_EMBEDDING_MODEL=gemini-embedding-001     # default nếu không set
GOOGLE_MODEL=gemini-2.5-pro                     # complex queries
GOOGLE_SUPPORT_MODEL=gemini-2.0-flash           # simple queries + quick replies

# NLU service
NLU_URL=http://localhost:8000                   # default
NLU_TIMEOUT_MS=500                              # default

# Database (cần pgvector extension)
DATABASE_URL=postgresql://user:pass@localhost:5432/rcfield
```

---

## Dev Tools

| Tool | Lệnh / URL | Mục đích |
|------|-----------|----------|
| NLU service | `npm run nlu` | Khởi động FastAPI :8000 |
| Chat widget demo | `http://localhost:5500/chat-widget-demo.html` | Test chat end-to-end |
| KB debug UI | `http://localhost:5500/kb-debug.html` | Upload doc, test retrieval score |
| KB CLI | `npm run test:kb -- --cafe <id> --query "..."` | Debug nhanh từ terminal |

---

## Phase 1 Status

### Implemented

| Module | Notes |
|--------|-------|
| ✅ NLU routing | Keyword matching, 2 intents: greeting / slot_check |
| ✅ Fast answer | Greeting từ widget config |
| ✅ Slot check | generate_series + COUNT, parse date tiếng Việt |
| ✅ RAG pipeline | Embed + pgvector + Gemini stream |
| ✅ Document ingestion | PDF / DOCX / TXT, chunking, embedding |
| ✅ SSE streaming | Token-by-token, done event với metadata |
| ✅ Smart model routing | Flash vs Pro dựa trên NLU confidence |
| ✅ Contextual quick replies | Flash call song song với main stream |
| ✅ Feature flag + quota | Per-cafe, monthly cap |
| ✅ Widget config | Greeting, theme, position, quick replies |
| ✅ KB debug endpoint | Similarity scores, verdict |

### Out of Scope (Phase 2)

- Lưu conversation history phía server (hiện tại client-side)
- Gemini function calling tích hợp sâu (tool use trong chat)
- Semantic caching (tránh embed lại query giống nhau)
- Analytics: most asked questions, KB coverage gaps
- Auto-retrain / suggestion khi KB có chunk chất lượng thấp

---

## Key Files Reference

| File | Khi nào cần đọc |
|------|----------------|
| `specs/002-branch-ai-chat-rag/plan.md` | Technical context, architecture decisions |
| `specs/002-branch-ai-chat-rag/research.md` | Lý do chọn pgvector, NLU, chunking strategy |
| `specs/002-branch-ai-chat-rag/data-model.md` | Entity definitions chi tiết |
| `specs/002-branch-ai-chat-rag/contracts/api.md` | API contracts đầy đủ |
| `nlu-service/README.md` | Hướng dẫn chạy NLU, thêm intent |
| `src/services/chat.service.ts` | Toàn bộ routing + RAG logic |
| `src/services/kb.service.ts` | Ingestion + retrieval pipeline |

---

## Quick Summary

**Branch AI Chat** kết hợp 4 thành phần chính:

1. **NLU routing** — phân loại intent nhanh bằng keyword matching, tránh gọi LLM cho câu hỏi đơn giản
2. **RAG pipeline** — embed query → cosine similarity trên pgvector → build context → Gemini generate
3. **Document ingestion** — Provider tự upload tài liệu, hệ thống tự parse → chunk → embed
4. **SSE streaming** — token stream realtime, quick replies sinh ra song song để không tăng latency
