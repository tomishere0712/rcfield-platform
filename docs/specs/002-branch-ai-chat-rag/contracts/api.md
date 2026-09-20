# API Contracts — Branch AI Chat Assistant

**Feature**: 002-branch-ai-chat-rag
**Last updated**: 2026-05-17
**Scope**: Backend API only (Phase này)

---

## 0. Kiến trúc Chat Flow (tổng quan)

```
POST /cafes/:cafeId/chat
        │
        ▼
[1] Check feature_flag ai_chat + quota
        │ flag tắt → 503
        │ quota hết → 429
        │
        ▼
[2] NLU Service  (internal HTTP, ~10ms)
    POST http://nlu-service:8000/classify
        │
        ├── fast_answer  ──────────────────────► trả lời tức thì (<200ms)
        │   "xin chào", "cảm ơn", "ok bye"
        │
        ├── slot_check   ──► query DB trực tiếp ► format + trả lời (<500ms)
        │   "hôm nay còn slot?", "thứ 7 có chỗ?"
        │
        └── pricing/policy/vehicle/fnb/rag_query
                │
                ▼
        [3] Embed message → pgvector search → top-5 chunks
                │
                ▼
        [4] Build system instruction:
            system_prompt (Provider config) → cafe info → KB chunks
                │
                ▼
        [5] Gemini 2.0 Flash (RAG + function calling nếu cần)
                │
                ▼
             response (<3s)
```

---

## Base URL

```
/api/cafes/:cafeId
```

---

## 1. Chat Endpoint

### `POST /api/cafes/:cafeId/chat`

Gửi tin nhắn và nhận câu trả lời từ AI assistant của chi nhánh.

**Auth**: Public (không yêu cầu JWT)

**Request Body**:
```json
{
  "message": "Chiều nay 3h còn slot không?",
  "history": [
    { "role": "user",  "content": "Giá thuê xe bao nhiêu?" },
    { "role": "model", "content": "Xe Standard giá 80k/giờ, xe Premium 120k/giờ ạ." }
  ]
}
```

| Field     | Type              | Required | Notes |
|-----------|-------------------|----------|-------|
| `message` | string            | Yes      | Tin nhắn hiện tại của user. Max 1000 ký tự. |
| `history` | array of Message  | No       | Lịch sử hội thoại phiên hiện tại. Max 20 lượt. |

**Message object**:
```ts
{ role: "user" | "model", content: string }
```

**Response `200 OK`** — envelope chung:

```ts
{
  answer:        string          // text/markdown fallback, luôn có
  response_type: ResponseType    // FE dùng để render UI
  data?:         object          // structured data, tùy response_type
  sources?:      string[]        // tên tài liệu KB đã dùng
  quick_replies?: string[]       // nút follow-up gợi ý
}
```

---

### Response Types

#### `text` — plain/markdown (RAG responses)
```json
{
  "answer": "Nội quy sân: không mang đồ ăn bên ngoài vào, phải đội mũ bảo hiểm khi lái xe...",
  "response_type": "text",
  "sources": ["noi-quy-san.pdf"],
  "quick_replies": ["Xem giá xe", "Kiểm tra slot hôm nay"]
}
```

#### `slot_list` — danh sách slot trống (slot_check route)
```json
{
  "answer": "Hôm nay còn 3 khung giờ trống bạn nhé!",
  "response_type": "slot_list",
  "data": {
    "date": "2026-05-17",
    "slots": [
      { "time": "15:00", "available_count": 2 },
      { "time": "15:30", "available_count": 1 },
      { "time": "16:00", "available_count": 3 }
    ]
  },
  "quick_replies": ["Đặt slot 15:00", "Xem ngày khác"]
}
```

#### `vehicle_list` — danh sách xe (vehicle/pricing query)
```json
{
  "answer": "Sân có 3 loại xe cho thuê:",
  "response_type": "vehicle_list",
  "data": {
    "vehicles": [
      { "name": "RC Drift Basic",    "tier": "STANDARD",   "hourly_rate": 80000,  "status": "AVAILABLE" },
      { "name": "RC Drift Pro",      "tier": "PREMIUM",    "hourly_rate": 120000, "status": "AVAILABLE" },
      { "name": "RC Offroad Monster","tier": "RESTRICTED", "hourly_rate": 200000, "status": "IN_USE" }
    ]
  },
  "sources": []
}
```

#### `greeting` — fast_answer khi mở widget
```json
{
  "answer": "Xin chào! Tôi là trợ lý AI của RC Arena. Bạn cần hỗ trợ gì?",
  "response_type": "greeting",
  "quick_replies": ["Xem giá xe", "Kiểm tra slot hôm nay", "Nội quy sân"]
}
```

---

### Response Type Summary

| `response_type` | Route | FE render |
|-----------------|-------|-----------|
| `greeting`      | fast_answer | Bubble chào + quick reply buttons |
| `text`          | rag | Markdown bubble |
| `slot_list`     | slot_check | List card có thể click từng slot |
| `vehicle_list`  | rag (vehicle/pricing) | Card danh sách xe |

---

**Response `429 Too Many Requests`** — hết quota:
```json
{ "error": "QUOTA_EXCEEDED", "message": "Gói AI của chi nhánh đã hết lượt tháng này." }
```

**Response `503 Service Unavailable`** — Gemini lỗi:
```json
{ "error": "AI_UNAVAILABLE", "message": "Trợ lý tạm thời không khả dụng, vui lòng thử lại sau." }
```

**Response `404 Not Found`**: Cafe không tồn tại.

**Response `400 Bad Request`**: Message rỗng hoặc vượt giới hạn ký tự.

---

## 2. Widget Configuration

### `GET /api/cafes/:cafeId/chat/config`

Lấy cấu hình widget của chi nhánh. Widget FE gọi khi khởi tạo.

**Auth**: Public (không yêu cầu JWT)

**Response `200 OK`**:
```json
{
  "greeting_message": "Xin chào! Tôi là trợ lý AI của RC Arena. Bạn cần hỗ trợ gì?",
  "position": "bottom-right",
  "primary_color": "#FF6B35",
  "avatar_url": "https://cdn.rcfield.vn/cafes/rc-arena/bot-avatar.png",
  "quick_replies": [
    "Xem giá thuê xe",
    "Kiểm tra slot hôm nay",
    "Nội quy sân",
    "Menu đồ uống"
  ],
  "is_default": false
}
```

| Field | Type | Notes |
|-------|------|-------|
| `greeting_message` | string | Lời chào khi mở widget. Max 200 ký tự. |
| `position` | string | `bottom-right` hoặc `bottom-left`. |
| `primary_color` | string | Hex color, ví dụ `#FF6B35`. |
| `avatar_url` | string | URL ảnh avatar bot. Nullable — dùng default nếu null. |
| `quick_replies` | string[] | Tối đa 5 nút. Rỗng nếu chưa cấu hình. |
| `system_prompt` | string \| null | Prompt hành vi do Provider cấu hình. Null nếu chưa đặt. |
| `is_default` | boolean | `true` nếu Provider chưa cấu hình, đang dùng giá trị mặc định. |

**Giá trị mặc định hệ thống** (khi `is_default: true`):
```json
{
  "greeting_message": "Xin chào! Tôi có thể giúp gì cho bạn?",
  "position": "bottom-right",
  "primary_color": "#2563EB",
  "avatar_url": null,
  "quick_replies": [],
  "system_prompt": null
}
```

---

### `PUT /api/cafes/:cafeId/chat/config`

Cập nhật cấu hình widget.

**Auth**: JWT required — PROVIDER sở hữu cafe này.

**Request Body**:
```json
{
  "greeting_message": "Chào mừng đến RC Arena! Hỏi tôi bất cứ điều gì nhé 🏎️",
  "position": "bottom-right",
  "primary_color": "#FF6B35",
  "avatar_url": "https://cdn.rcfield.vn/cafes/rc-arena/bot-avatar.png",
  "quick_replies": ["Xem giá xe", "Còn slot không?", "Nội quy sân"],
  "system_prompt": "Luôn xưng hô thân mật với khách. Ưu tiên giới thiệu gói premium khi khách hỏi giá."
}
```

**Validation**:
- `greeting_message`: max 200 ký tự
- `position`: phải là `bottom-right` hoặc `bottom-left`
- `primary_color`: phải là hex color hợp lệ (`#RRGGBB`)
- `quick_replies`: tối đa 5 phần tử, mỗi phần tử max 50 ký tự
- `avatar_url`: URL hợp lệ hoặc null
- `system_prompt`: max 2000 ký tự, nullable — đặt `null` để xóa

**Response `200 OK`**: Trả về config đã được lưu (cùng format GET).

**Response `400 Bad Request`**:
```json
{ "error": "VALIDATION_ERROR", "message": "quick_replies tối đa 5 phần tử." }
```

---

## 3. Knowledge Base Management

### `GET /api/cafes/:cafeId/kb/documents`

Lấy danh sách tài liệu KB của chi nhánh.

**Auth**: JWT required — PROVIDER sở hữu cafe này.

**Response `200 OK`**:
```json
{
  "data": [
    {
      "id": "uuid",
      "title": "Nội quy sân",
      "original_filename": "noi-quy-san.pdf",
      "content_type": "POLICY",
      "status": "INDEXED",
      "chunk_count": 12,
      "created_at": "2026-05-17T10:00:00Z",
      "updated_at": "2026-05-17T10:01:30Z"
    }
  ],
  "total": 1
}
```

**Document status values**:
| Status    | Mô tả |
|-----------|-------|
| `PENDING` | Đang chờ xử lý / đang embed |
| `INDEXED` | Đã sẵn sàng, bot có thể dùng |
| `FAILED`  | Xử lý thất bại |

---

### `POST /api/cafes/:cafeId/kb/documents`

Upload tài liệu mới vào KB.

**Auth**: JWT required — PROVIDER sở hữu cafe này.

**Content-Type**: `multipart/form-data`

**Form fields**:

| Field          | Type   | Required | Notes |
|----------------|--------|----------|-------|
| `file`         | File   | Yes      | PDF / DOCX / TXT / MD. Max 10MB. |
| `title`        | string | Yes      | Tên hiển thị của tài liệu. Max 200 ký tự. |
| `content_type` | string | No       | Mặc định: `CUSTOM`. Enum: `POLICY`, `FAQ`, `ANNOUNCEMENT`, `CUSTOM`. |

**Response `201 Created`**:
```json
{
  "id": "uuid",
  "title": "Nội quy sân",
  "original_filename": "noi-quy-san.pdf",
  "content_type": "POLICY",
  "status": "PENDING",
  "created_at": "2026-05-17T10:00:00Z"
}
```

**Response `400 Bad Request`**: File sai định dạng hoặc vượt 10MB.
```json
{ "error": "FILE_TOO_LARGE", "message": "File không được vượt quá 10MB." }
{ "error": "UNSUPPORTED_FORMAT", "message": "Chỉ hỗ trợ PDF, DOCX, TXT, MD." }
```

**Response `403 Forbidden`**: Provider không sở hữu cafe này.

---

### `DELETE /api/cafes/:cafeId/kb/documents/:documentId`

Xóa tài liệu và toàn bộ chunks liên quan khỏi KB.

**Auth**: JWT required — PROVIDER sở hữu cafe này.

**Response `204 No Content`**: Xóa thành công.

**Response `404 Not Found`**: Document không tồn tại hoặc không thuộc cafe này.

**Response `403 Forbidden`**: Provider không sở hữu cafe này.

---

## 3. Database Schema

### `cafe_widget_configs`

```sql
CREATE TABLE cafe_widget_configs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id          UUID NOT NULL UNIQUE REFERENCES cafes(id),
  greeting_message VARCHAR(200) NOT NULL DEFAULT 'Xin chào! Tôi có thể giúp gì cho bạn?',
  position         VARCHAR(20)  NOT NULL DEFAULT 'bottom-right',
                   -- bottom-right | bottom-left
  primary_color    VARCHAR(7)   NOT NULL DEFAULT '#2563EB',
  avatar_url       TEXT,
  quick_replies    JSONB        NOT NULL DEFAULT '[]',
                   -- array of string, max 5
  system_prompt    TEXT,
                   -- Provider-configured AI behavior instructions, max 2000 chars
                   -- Injected before KB chunks in system instruction — highest priority
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);
```

> UNIQUE trên `cafe_id` — mỗi cafe có đúng 1 config row. Upsert thay vì insert.

---

### `kb_documents`

```sql
CREATE TABLE kb_documents (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id          UUID NOT NULL REFERENCES cafes(id),
  title            VARCHAR(200) NOT NULL,
  original_filename VARCHAR(500) NOT NULL,
  content_type     VARCHAR(20) NOT NULL DEFAULT 'CUSTOM',
                   -- POLICY | FAQ | ANNOUNCEMENT | CUSTOM
  raw_content      TEXT NOT NULL,
  status           VARCHAR(10) NOT NULL DEFAULT 'PENDING',
                   -- PENDING | INDEXED | FAILED
  created_by       UUID NOT NULL REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at       TIMESTAMPTZ
);

CREATE INDEX idx_kb_documents_cafe_id ON kb_documents(cafe_id)
  WHERE deleted_at IS NULL;
```

### `kb_chunks`

```sql
-- Enable pgvector extension (run once)
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE kb_chunks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id      UUID NOT NULL REFERENCES cafes(id),
  document_id  UUID NOT NULL REFERENCES kb_documents(id) ON DELETE CASCADE,
  chunk_text   TEXT NOT NULL,
  chunk_index  INTEGER NOT NULL,
  embedding    vector(768) NOT NULL,   -- Gemini text-embedding-004
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- HNSW index for fast approximate nearest neighbor search
CREATE INDEX idx_kb_chunks_embedding ON kb_chunks
  USING hnsw (embedding vector_cosine_ops);

-- Filter index for cafe isolation
CREATE INDEX idx_kb_chunks_cafe_id ON kb_chunks(cafe_id);
```

---

## 4. NLU Service (internal — tái sử dụng Mekit NLU)

### Cấu hình intents cho domain RC (`intents/rcfield.json`)

```json
{
  "fast_answer": [
    "xin chào", "chào bạn", "hello", "hi",
    "cảm ơn", "cảm ơn bạn", "ok cảm ơn",
    "tạm biệt", "bye", "ok", "được rồi", "vâng ạ"
  ],
  "slot_check": [
    "hôm nay còn slot không?",
    "chiều nay 3h có chỗ không?",
    "cuối tuần này còn trống không?",
    "thứ 7 book được không?",
    "tối mai còn chỗ chơi không?",
    "ngày mai có lịch chơi không?",
    "còn chỗ không?", "còn trống không?",
    "mấy giờ còn slot?", "hôm nay đặt được không?"
  ],
  "pricing_query": [
    "giá thuê xe bao nhiêu?",
    "thuê xe Standard giá thế nào?",
    "một tiếng bao nhiêu tiền?",
    "phí đặt sân là bao nhiêu?",
    "bảng giá của sân",
    "giá xe Premium là bao nhiêu?"
  ],
  "policy_query": [
    "nội quy sân thế nào?",
    "có được mang đồ ăn vào không?",
    "chính sách hủy booking ra sao?",
    "quy định về xe như thế nào?",
    "sân có quy định gì không?",
    "chính sách bồi thường hư hỏng"
  ],
  "vehicle_query": [
    "sân có những xe gì?",
    "xe nào phù hợp cho người mới?",
    "cho xem danh sách xe",
    "xe BYOC được mang loại nào?",
    "xe Standard khác xe Premium thế nào?"
  ],
  "fnb_query": [
    "sân có bán đồ ăn không?",
    "menu đồ uống của sân",
    "có bán nước không?",
    "giá đồ ăn thế nào?"
  ],
  "rag_query": [
    "cho tôi biết thêm về sân",
    "sân này có gì hay?",
    "hướng dẫn chơi xe RC",
    "sân có tổ chức giải đua không?"
  ]
}
```

### Route mapping

| Intent | Route | Mô tả |
|--------|-------|-------|
| `fast_answer` | fast | Trả lời tức thì, không gọi gì |
| `slot_check` | slot_check | Query DB, không gọi Gemini |
| `pricing_query` | rag | RAG + Gemini |
| `policy_query` | rag | RAG + Gemini |
| `vehicle_query` | rag | RAG + Gemini |
| `fnb_query` | rag | RAG + Gemini |
| `rag_query` | rag | RAG + Gemini (catch-all) |

### NLU service call (internal)

```
POST http://nlu-service:8000/classify
Body: { "text": "hôm nay còn slot không?", "context": ["xin chào"] }

Response: {
  "intent": "slot_check",
  "confidence": 0.92,
  "needs_llm_fallback": false,
  "routing": { "path": "slot_check" }
}
```

Nếu NLU service unreachable (timeout 200ms) → fallback về `rag` route.

---

## 5. Internal Processing Notes (cho developer)

### Document ingestion pipeline (async, sau khi upload)
1. Parse text từ file: `pdf-parse` (PDF) / `mammoth` (DOCX) / `fs.readFile` (TXT, MD)
2. Split thành chunks: ~500 tokens, overlap 100 tokens
3. Embed từng chunk qua `Gemini text-embedding-004` API
4. Bulk insert vào `kb_chunks`
5. Update `kb_documents.status` → `INDEXED` (hoặc `FAILED` nếu lỗi)

### RAG retrieval (trong chat flow)
```sql
SELECT chunk_text
FROM kb_chunks
WHERE cafe_id = $1
ORDER BY embedding <=> $2::vector   -- cosine distance
LIMIT 5;
```

### Function tool: `check_available_slots`
```sql
SELECT
  gs.slot_time,
  $2 - COUNT(b.id) AS available_count
FROM generate_series(
  $3::date,
  $3::date + interval '1 day' - interval '30 minutes',
  interval '30 minutes'
) AS gs(slot_time)
LEFT JOIN bookings b
  ON b.cafe_id = $1
  AND b.status IN ('PENDING', 'CONFIRMED')
  AND b.slot_start <= gs.slot_time
  AND b.slot_end > gs.slot_time
GROUP BY gs.slot_time
HAVING ($2 - COUNT(b.id)) > 0
ORDER BY gs.slot_time;
-- $1: cafe_id, $2: max_concurrent_bookings, $3: date
```

---

## 6. Environment Variables cần thêm

```bash
GOOGLE_API_KEY=...                   # Gemini API key (dùng chung embedding + LLM)
GOOGLE_EMBEDDING_MODEL=text-embedding-004
GOOGLE_LLM_MODEL=gemini-2.0-flash
NLU_SERVICE_URL=http://nlu-service:8000   # internal Docker network
NLU_TIMEOUT_MS=200                        # fallback về RAG nếu quá 200ms
```
