# Quickstart: Branch AI Chat Assistant

**Phase 1 Output** | **Date**: 2026-05-17

Thứ tự implement. Mỗi bước có thể test độc lập trước khi sang bước tiếp.

---

## Bước 1 — Enums & Entities

Thêm enums vào `src/types/index.ts`:

```typescript
export enum KbDocumentStatus { PENDING = 'PENDING', INDEXED = 'INDEXED', FAILED = 'FAILED' }
export enum KbContentType { POLICY = 'POLICY', FAQ = 'FAQ', ANNOUNCEMENT = 'ANNOUNCEMENT', CUSTOM = 'CUSTOM' }
```

Tạo 3 entity files (xem `data-model.md`):
- `src/models/kb-document.entity.ts`
- `src/models/kb-chunk.entity.ts`
- `src/models/cafe-widget-config.entity.ts`

Đăng ký entity trong `src/config/database.ts` → `entities: [...]`.

---

## Bước 2 — Validation Schemas

Thêm vào `src/validate/index.ts`:

```typescript
// ── ai-chat ───────────────────────────────────────────────────────────────────
export const ChatMessageSchema = z.object({
  message: z.string().min(1).max(1000),
  history: z.array(z.object({
    role: z.enum(['user', 'model']),
    content: z.string().max(2000),
  })).max(20).optional().default([]),
});

export const UploadDocumentSchema = z.object({
  title: z.string().min(1).max(200),
  content_type: z.enum(['POLICY', 'FAQ', 'ANNOUNCEMENT', 'CUSTOM']).optional().default('CUSTOM'),
});

export const WidgetConfigSchema = z.object({
  greeting_message: z.string().max(200).optional(),
  position: z.enum(['BOTTOM_RIGHT', 'BOTTOM_LEFT']).optional(),
  primary_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  avatar_url: z.string().url().nullable().optional(),
  quick_replies: z.array(z.string().max(50)).max(5).optional(),
  system_prompt: z.string().max(2000).nullable().optional(),
  // Injected before KB chunks — highest priority in Gemini system instruction
});
```

---

## Bước 3 — NLU Client

```typescript
// src/config/nlu.ts
import { logger } from './logger';

const NLU_URL = process.env.NLU_SERVICE_URL ?? 'http://nlu-service:8000';
const NLU_TIMEOUT = parseInt(process.env.NLU_TIMEOUT_MS ?? '200', 10);

export interface NluResult {
  intent: string;
  confidence: number;
  needs_llm_fallback: boolean;
}

export async function classifyIntent(text: string): Promise<NluResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NLU_TIMEOUT);
  try {
    const res = await fetch(`${NLU_URL}/classify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });
    return (await res.json()) as NluResult;
  } catch {
    logger.warn('NLU', 'unreachable — fallback to rag_query');
    return { intent: 'rag_query', confidence: 0, needs_llm_fallback: false };
  } finally {
    clearTimeout(timer);
  }
}
```

---

## Bước 4 — WebSocket Service

```typescript
// src/services/websocket.service.ts
import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { verifyAccessToken } from '../middlewares/auth.middleware';
import { logger } from '../config/logger';

export class WebSocketService {
  private wss: WebSocketServer;
  private clients = new Map<string, Set<WebSocket>>(); // userId → sockets

  init(server: import('http').Server) {
    this.wss = new WebSocketServer({ server, path: '/ws' });
    this.wss.on('connection', (ws, req) => this.onConnection(ws, req));
    logger.info('WebSocket', 'server started', { path: '/ws' });
  }

  private onConnection(ws: WebSocket, req: IncomingMessage) {
    const token = new URL(req.url!, 'ws://host').searchParams.get('token');
    if (!token) { ws.close(4001, 'Unauthorized'); return; }
    try {
      const payload = verifyAccessToken(token);
      const userId = payload.sub as string;
      if (!this.clients.has(userId)) this.clients.set(userId, new Set());
      this.clients.get(userId)!.add(ws);
      ws.on('close', () => this.clients.get(userId)?.delete(ws));
    } catch {
      ws.close(4001, 'Invalid token');
    }
  }

  pushToUser(userId: string, event: string, data: unknown) {
    const sockets = this.clients.get(userId);
    if (!sockets?.size) return;
    const payload = JSON.stringify({ event, data });
    sockets.forEach(ws => { if (ws.readyState === WebSocket.OPEN) ws.send(payload); });
  }
}

export const wsService = new WebSocketService();
```

Trong `src/server.ts`, sau khi tạo `httpServer`:
```typescript
import { wsService } from './services/websocket.service';
wsService.init(httpServer);
```

---

## Bước 5 — KB Service (Document Ingestion)

```typescript
// src/services/kb.service.ts (phần cốt lõi)
import { GoogleGenAI } from '@google/genai';
import * as pdfParse from 'pdf-parse';
import * as mammoth from 'mammoth';

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY! });

// Chunking: ~500 tokens (≈2000 chars), overlap 100 tokens (≈400 chars)
function chunkText(text: string): string[] {
  const CHUNK_SIZE = 2000;
  const OVERLAP    = 400;
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    chunks.push(text.slice(i, i + CHUNK_SIZE));
    i += CHUNK_SIZE - OVERLAP;
  }
  return chunks.filter(c => c.trim().length > 50);
}

async function embedText(text: string): Promise<number[]> {
  const result = await ai.models.embedContent({ model: 'text-embedding-004', contents: text });
  return result.embeddings![0].values!;
}

// Insert chunks dùng raw SQL vì TypeORM không support vector type
async function bulkInsertChunks(
  ds: DataSource,
  cafeId: string,
  documentId: string,
  chunks: { text: string; index: number; embedding: number[] }[],
) {
  for (const chunk of chunks) {
    await ds.query(
      `INSERT INTO kb_chunks (cafe_id, document_id, chunk_text, chunk_index, embedding)
       VALUES ($1, $2, $3, $4, $5::vector)`,
      [cafeId, documentId, chunk.text, chunk.index, JSON.stringify(chunk.embedding)],
    );
  }
}

// RAG retrieval
async function retrieveChunks(ds: DataSource, cafeId: string, queryEmbedding: number[]): Promise<string[]> {
  const rows = await ds.query(
    `SELECT chunk_text FROM kb_chunks
     WHERE cafe_id = $1
     ORDER BY embedding <=> $2::vector
     LIMIT 5`,
    [cafeId, JSON.stringify(queryEmbedding)],
  );
  return rows.map((r: { chunk_text: string }) => r.chunk_text);
}
```

---

## Bước 6 — Chat Service

```typescript
// src/services/chat.service.ts (structure)
export class ChatService {
  // 1. Check feature flag + quota
  async checkGate(cafeId: string): Promise<void> { ... }

  // 2. NLU classify
  async route(message: string): Promise<'fast' | 'slot_check' | 'rag'> { ... }

  // 3. Fast answer — lấy greeting_message từ widget config
  async fastAnswer(cafeId: string): Promise<ChatResponse> { ... }

  // 4. Slot check — query DB trực tiếp
  async slotCheck(cafeId: string, message: string): Promise<ChatResponse> { ... }

  // 5. RAG + Gemini
  async ragChat(cafeId: string, message: string, history: Message[]): Promise<ChatResponse> { ... }
}
```

**Slot check query** (xem contracts/api.md section 5 cho SQL đầy đủ):
```typescript
// Parse ngày từ message — dùng simple heuristic: "hôm nay", "ngày mai", "thứ X"
// Phase 1: nếu không parse được → default hôm nay
const date = parseDate(message) ?? new Date();
```

**RAG system prompt**:
```typescript
const systemPrompt = `Bạn là trợ lý AI của cafe xe RC "${cafe.name}".
Chỉ trả lời dựa trên thông tin dưới đây. Nếu không có thông tin, nói thẳng là không biết.
Trả lời bằng tiếng Việt.

Thông tin chi nhánh:
- Địa chỉ: ${cafe.address}
- Giờ mở cửa: ${JSON.stringify(cafe.operatingHours)}

Knowledge base:
${retrievedChunks.join('\n---\n')}`;
```

---

## Bước 7 — Routes & Controllers

```typescript
// src/routes/chat.routes.ts
import { Router } from 'express';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { chatController } from '../controllers/chat.controller';
import { kbController } from '../controllers/kb.controller';
import multer from 'multer';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const router = Router({ mergeParams: true }); // mergeParams để lấy :cafeId từ parent

// Public
router.get('/chat/config',                      chatController.getWidgetConfig);
router.post('/chat',                            chatController.chat);

// Provider only
router.put('/chat/config',  authenticate, authorize('PROVIDER'), chatController.updateWidgetConfig);
router.get('/kb/documents', authenticate, authorize('PROVIDER'), kbController.listDocuments);
router.post('/kb/documents', authenticate, authorize('PROVIDER'), upload.single('file'), kbController.uploadDocument);
router.delete('/kb/documents/:documentId', authenticate, authorize('PROVIDER'), kbController.deleteDocument);

export default router;
```

Mount trong `src/routes/index.ts`:
```typescript
import chatRoutes from './chat.routes';
router.use('/cafes/:cafeId', chatRoutes);
```

---

## Bước 8 — Controller comments (CLAUDE.md convention)

```typescript
// src/controllers/chat.controller.ts

// POST /api/cafes/:cafeId/chat
async chat(req: Request, res: Response, next: NextFunction) { ... }

// GET /api/cafes/:cafeId/chat/config
async getWidgetConfig(req: Request, res: Response, next: NextFunction) { ... }

// PUT /api/cafes/:cafeId/chat/config  [auth]
async updateWidgetConfig(req: AuthRequest, res: Response, next: NextFunction) { ... }

// src/controllers/kb.controller.ts

// GET /api/cafes/:cafeId/kb/documents  [auth]
async listDocuments(req: AuthRequest, res: Response, next: NextFunction) { ... }

// POST /api/cafes/:cafeId/kb/documents  [auth]
async uploadDocument(req: AuthRequest, res: Response, next: NextFunction) { ... }

// DELETE /api/cafes/:cafeId/kb/documents/:documentId  [auth]
async deleteDocument(req: AuthRequest, res: Response, next: NextFunction) { ... }
```

---

## Bước 9 — Package dependencies cần cài

```bash
cd rcfeild-be
npm install @google/genai multer pdf-parse mammoth ws
npm install -D @types/multer @types/pdf-parse @types/ws
```

---

## Test order

1. `GET /cafes/:cafeId/chat/config` — trả default khi chưa có config
2. Upload 1 file TXT nhỏ → status `PENDING` → đợi WS event `kb_document.status_changed` → `INDEXED`
3. `POST /chat` với "xin chào" → `response_type: greeting` < 200ms
4. `POST /chat` với "hôm nay còn slot không?" → `response_type: slot_list` < 500ms
5. `POST /chat` với "nội quy sân thế nào?" → `response_type: text`, sources có tên file vừa upload < 3s
6. `PUT /chat/config` → `GET` lại → config reflect đúng
7. `DELETE /kb/documents/:id` → hỏi lại nội dung đó → bot không trả lời được nữa
