# Tasks: Branch AI Chat Assistant (RAG)

**Input**: Design documents from `specs/002-branch-ai-chat-rag/`
**Prerequisites**: plan.md ✅ research.md ✅ data-model.md ✅ contracts/api.md ✅ quickstart.md ✅

**Organization**: Tasks are grouped by user story to enable independent implementation and testing. Implementation order differs slightly from spec priority — US3 (KB Upload) is implemented first because US1 (RAG Chat) depends on KB data existing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies between those tasks)
- **[US#]**: Which user story this task belongs to

---

## Phase 1: Setup (Packages, Entities, Schemas)

**Purpose**: Install dependencies and create the shared data layer used by all user stories.

- [x] T001 Install npm packages in `rcfeild-be/`: `npm install @google/generative-ai multer pdf-parse mammoth ws` and `npm install -D @types/multer @types/pdf-parse @types/ws`
- [x] T002 [P] Add new enums and types to `rcfeild-be/src/types/index.ts`: `KbDocumentStatus` (PENDING/INDEXED/FAILED), `KbContentType` (POLICY/FAQ/ANNOUNCEMENT/CUSTOM), `WidgetPosition` (BOTTOM_RIGHT/BOTTOM_LEFT), `ChatResponseType`, `SlotItem`, `VehicleItem`, `ChatResponse` interfaces (see data-model.md)
- [x] T003 [P] Create `rcfeild-be/src/models/kb-document.entity.ts` with all columns from data-model.md: id, cafeId, title, originalFilename, contentType, rawContent, status, createdBy, timestamps, soft-delete
- [x] T004 [P] Create `rcfeild-be/src/models/kb-chunk.entity.ts` with columns from data-model.md: id, cafeId, documentId, chunkText, chunkIndex, embedding (type: 'text', select: false), timestamps — embedding must be stored via raw SQL, not TypeORM ORM
- [x] T005 [P] Create `rcfeild-be/src/models/cafe-widget-config.entity.ts` with all columns from data-model.md: id, cafeId (unique), primaryColor, position, avatarUrl, welcomeMessage, quickReplies (jsonb), greetingMessage, isEnabled, timestamps
- [x] T006 Register KbDocument, KbChunk, CafeWidgetConfig in `rcfeild-be/src/config/database.ts` entities array
- [x] T007 Add three validation schemas to `rcfeild-be/src/validate/index.ts`: `ChatMessageSchema` (message + history array), `UploadDocumentSchema` (title + content_type), `WidgetConfigSchema` (greeting_message, position, primary_color hex, avatar_url, quick_replies) — see quickstart.md Bước 2

**Checkpoint**: Entities compile, database.ts imports cleanly, zod schemas export without errors.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T008 [P] Create NLU client `rcfeild-be/src/config/nlu.ts` — export `classifyIntent(text: string): Promise<NluResult>` with 200ms AbortController timeout, fetch POST to `${NLU_SERVICE_URL}/classify`, fallback return `{ intent: 'rag_query', confidence: 0, needs_llm_fallback: false }` on timeout/error (see quickstart.md Bước 3)
- [x] T009 [P] Create WebSocket service `rcfeild-be/src/services/websocket.service.ts` — `WebSocketService` class with `init(server)`, JWT validation in `onConnection()` using `verifyAccessToken`, `clients: Map<string, Set<WebSocket>>` per userId, `pushToUser(userId, event, data)` helper, export singleton `wsService` (see quickstart.md Bước 4)
- [x] T010 Wire WebSocket in `rcfeild-be/src/server.ts` — import `wsService` and call `wsService.init(httpServer)` after HTTP server creation (before app.listen)
- [x] T011 Implement `checkGate(cafeId: string)` in `rcfeild-be/src/services/chat.service.ts` — query `feature_flags` WHERE `feature_key='AI_CHATBOT'` AND `entity_id=cafeId`, throw 503 if not found/disabled, throw 429 if `used_this_month >= monthly_quota`; also implement `incrementQuota(cafeId)` raw SQL `jsonb_set` update

**Checkpoint**: wsService.init() starts without error, classifyIntent() returns fallback result when NLU unreachable, checkGate() throws 503 for missing flag.

---

## Phase 3: US3 — KB Document Upload & Indexing (Priority: P1)

**Goal**: Provider uploads PDF/DOCX/TXT files; documents are parsed, chunked, embedded into pgvector, status is pushed via WebSocket.

**Independent Test**: Upload a `.txt` file → verify 201 response with `status: PENDING` → wait for WebSocket event `kb_document.status_changed` payload `{ status: 'INDEXED' }` → POST `/chat` with question about file content → verify answer matches.

- [x] T012 [US3] Add `chunkText(text: string): string[]` to `rcfeild-be/src/services/kb.service.ts` — sliding window: CHUNK_SIZE=2000 chars, OVERLAP=400 chars, filter chunks with `.trim().length <= 50` (see quickstart.md Bước 5)
- [x] T013 [US3] Add `parseFile(buffer: Buffer, mimetype: string, originalName: string): Promise<string>` to `rcfeild-be/src/services/kb.service.ts` — dispatch to `pdf-parse` (PDF), `mammoth.extractRawText` (DOCX), `buffer.toString('utf-8')` (TXT/MD); throw `AppError` with 422 for unsupported format; throw `AppError` with 422 for password-protected PDF (pdf-parse throws)
- [x] T014 [P] [US3] Add `embedText(text: string): Promise<number[]>` to `rcfeild-be/src/services/kb.service.ts` — calls `genAI.getGenerativeModel({ model: 'text-embedding-004' }).embedContent(text)`, returns `result.embedding.values`
- [x] T015 [P] [US3] Add `bulkInsertChunks(ds, cafeId, documentId, chunks)` to `rcfeild-be/src/services/kb.service.ts` — raw SQL loop: `INSERT INTO kb_chunks (cafe_id, document_id, chunk_text, chunk_index, embedding) VALUES ($1,$2,$3,$4,$5::vector)` — must use `JSON.stringify(chunk.embedding)` for the vector cast
- [x] T016 [US3] Add `processDocument(documentId: string): Promise<void>` to `rcfeild-be/src/services/kb.service.ts` — full pipeline: load doc + file bytes from DB → parseFile → chunkText → for each chunk embedText → bulkInsertChunks → UPDATE kb_documents SET status='INDEXED' → wsService.pushToUser(doc.createdBy, 'kb_document.status_changed', { documentId, status: 'INDEXED' }); catch errors → UPDATE status='FAILED' → push WS event with status='FAILED'
- [x] T017 [US3] Create `rcfeild-be/src/controllers/kb.controller.ts` — implement `uploadDocument(req, res, next)`: validate `req.file` exists (400 if not), validate mimetype (PDF/DOCX/TXT/MD, else 422), validate file size ≤ 10MB (422 if over), check cafe ownership via `cafe.provider_id === req.user.id` (403 if not), INSERT kb_document with `status=PENDING`, call `setImmediate(() => kbService.processDocument(doc.id))`, return 201 with `{ id, title, originalFilename, status: 'PENDING' }`
- [x] T018 [US3] Create `rcfeild-be/src/routes/chat.routes.ts` with `Router({ mergeParams: true })` — add: `POST /kb/documents` (authenticate, authorize('PROVIDER'), upload.single('file'), kbController.uploadDocument); configure multer with `memoryStorage()` and `limits.fileSize = 10 * 1024 * 1024`
- [x] T019 [US3] Mount chatRoutes in `rcfeild-be/src/routes/index.ts` at `/cafes/:cafeId`

**Checkpoint**: Provider can upload a `.txt` file and receive `status: PENDING`. Within ~10s, WebSocket delivers `kb_document.status_changed` event with `status: INDEXED`. Uploading a 15MB file returns 422. Uploading for another cafe's ID returns 403.

---

## Phase 4: US1 — RAG Chat — Customer Info Query (Priority: P1)

**Goal**: Customer sends a question in Vietnamese; the system routes via NLU, retrieves relevant KB chunks from pgvector, calls Gemini 2.0 Flash, and returns a grounded answer.

**Independent Test**: Seed `kb_chunks` for a `cafeId` with nội quy content, POST `/cafes/:cafeId/chat` with `{ message: "nội quy sân thế nào?" }`, verify `response.answer` mentions the seeded content, `response.response_type === 'text'`, and latency < 3s.

- [x] T020 [P] [US1] Add `retrieveChunks(ds: DataSource, cafeId: string, queryEmbedding: number[]): Promise<string[]>` to `rcfeild-be/src/services/kb.service.ts` — raw SQL: `SELECT chunk_text FROM kb_chunks WHERE cafe_id = $1 ORDER BY embedding <=> $2::vector LIMIT 5`; **must always include `cafe_id` filter** (security invariant from R-008)
- [x] T021 [US1] Add `route(message: string): Promise<'fast' | 'slot_check' | 'rag'>` to `rcfeild-be/src/services/chat.service.ts` — call `classifyIntent(message)`: map `fast_answer` → `'fast'`, `slot_check` → `'slot_check'`, all others (`pricing_query`, `policy_query`, `vehicle_query`, `fnb_query`, `rag_query`) → `'rag'`; if `needs_llm_fallback=true` or `confidence < 0.6` → force `'rag'`
- [x] T022 [US1] Add `fastAnswer(cafeId: string): Promise<ChatResponse>` to `rcfeild-be/src/services/chat.service.ts` — load CafeWidgetConfig by cafeId (or use defaults if null), return `{ answer: greetingMessage, responseType: 'greeting', quickReplies: config.quickReplies }`
- [x] T023 [US1] Add `ragChat(cafeId: string, message: string, history: {role: string, content: string}[]): Promise<ChatResponse>` to `rcfeild-be/src/services/chat.service.ts` — embed message → retrieveChunks → load cafe.name/address/operatingHours → build system prompt (see quickstart.md Bước 6) → call `gemini-2.0-flash` with history as Gemini Content[] → parse response → return ChatResponse with `responseType: 'text'` and `sources: [doc titles]`; catch Gemini errors → throw AppError 503 "Trợ lý tạm thời không khả dụng, vui lòng thử lại sau"
- [x] T024 [US1] Create `rcfeild-be/src/controllers/chat.controller.ts` — implement `chat(req, res, next)`: validate body via ChatMessageSchema, call `checkGate(cafeId)`, call `route(message)`, dispatch to `fastAnswer`/`slotCheck`/`ragChat`, call `incrementQuota(cafeId)` on success, return 200 with ChatResponse
- [x] T025 [US1] Add `POST /chat` route to `rcfeild-be/src/routes/chat.routes.ts` (public — no authenticate middleware)
- [x] T026 [US1] Add `getWidgetConfig(req, res, next)` to `rcfeild-be/src/controllers/chat.controller.ts` — find CafeWidgetConfig WHERE cafe_id=cafeId; if not found, return hardcoded defaults `{ primaryColor: '#1a73e8', position: 'BOTTOM_RIGHT', welcomeMessage: 'Xin chào! Tôi có thể giúp gì cho bạn?', quickReplies: [], greetingMessage: null, isEnabled: true }`
- [x] T027 [US1] Add `GET /chat/config` route to `rcfeild-be/src/routes/chat.routes.ts` (public, chatController.getWidgetConfig)

**Checkpoint**: POST `/chat` with "nội quy sân thế nào?" returns answer grounded in KB content in < 3s. POST `/chat` with "xin chào" returns `response_type: 'greeting'` in < 200ms. POST `/chat` after quota exhausted returns 429.

---

## Phase 5: US2 — Slot Check — Real-time Availability (Priority: P1)

**Goal**: Customer asks about available slots and receives real-time data computed from the bookings table for that cafe.

**Independent Test**: Create 2 bookings occupying 2 of 3 concurrent slots for today, POST `/chat` with `{ message: "hôm nay còn slot không?" }`, verify `response.response_type === 'slot_list'` and `response.data.slots` shows 1 available slot.

- [x] T028 [US2] Add `parseDate(message: string): Date` to `rcfeild-be/src/services/chat.service.ts` — detect Vietnamese date expressions: "hôm nay" → today, "ngày mai" → tomorrow, "thứ X" → next weekday matching; return `new Date()` if no match found (Phase 1 default)
- [x] T029 [US2] Add `slotCheck(cafeId: string, message: string): Promise<ChatResponse>` to `rcfeild-be/src/services/chat.service.ts` — call `parseDate(message)`, query `sessions`/`bookings` WHERE `cafe_id=$cafeId AND date=$date AND status IN ('CONFIRMED','ACTIVE')`, compare count against `cafe.max_concurrent_bookings`, build `slots: SlotItem[]` list of available time slots, return `{ answer: ..., responseType: 'slot_list', data: { date: '2026-05-17', slots: [...] } }`
- [x] T030 [US2] Wire slot_check path in `rcfeild-be/src/controllers/chat.controller.ts` — when `route()` returns `'slot_check'`, call `slotCheck(cafeId, message)` and return result (this completes the full NLU routing triangle in chat())

**Checkpoint**: POST `/chat` with "Chiều nay 3h còn chỗ không?" returns `response_type: 'slot_list'` with correct slot count reflecting actual bookings in DB, in < 500ms.

---

## Phase 6: US4 — Provider: List and Delete KB Documents (Priority: P2)

**Goal**: Provider can view all documents in the KB with their processing status, and can delete documents to remove their content from the KB.

**Independent Test**: Upload 3 documents for cafeId A, call `GET /kb/documents` as Provider A → verify 3 docs returned. DELETE doc 1 → GET again → verify 2 docs. Verify POST `/chat` no longer returns content from deleted doc.

- [x] T031 [P] [US4] Implement `listDocuments(req, res, next)` in `rcfeild-be/src/controllers/kb.controller.ts` — verify Provider owns cafe, query KbDocument WHERE `cafe_id=cafeId AND deleted_at IS NULL`, order by `created_at DESC`, return array with `{ id, title, originalFilename, contentType, status, createdAt }`
- [x] T032 [P] [US4] Implement `deleteDocument(req, res, next)` in `rcfeild-be/src/controllers/kb.controller.ts` — verify Provider owns cafe, soft-delete KbDocument (set `deleted_at`), the FK `ON DELETE CASCADE` on kb_chunks handles chunk cleanup; verify `cafe_id` matches before delete (security: never delete by documentId alone)
- [x] T033 [US4] Add `GET /kb/documents` and `DELETE /kb/documents/:documentId` routes to `rcfeild-be/src/routes/chat.routes.ts` (authenticate, authorize('PROVIDER'))

**Checkpoint**: Provider can list documents, see INDEXED/PENDING/FAILED status. Delete removes document from list. Verify no `kb_chunks` rows remain for deleted document.

---

## Phase 7: US5 — Provider: Widget Configuration (Priority: P2)

**Goal**: Provider can customize the chat widget greeting, position, color, avatar, and quick replies for their cafe.

**Independent Test**: PUT `/chat/config` with `{ greeting_message: "Chào mừng!", quick_replies: ["Xem giá", "Kiểm tra slot"] }`, then GET `/chat/config` → verify values match. POST `/chat` with "xin chào" → verify `answer` equals "Chào mừng!" and `quickReplies` returns the 2 items.

- [x] T034 [US5] Implement `updateWidgetConfig(req, res, next)` in `rcfeild-be/src/controllers/chat.controller.ts` — authenticate, verify ownership, validate body via WidgetConfigSchema, upsert CafeWidgetConfig using raw SQL `INSERT INTO cafe_widget_configs (...) ON CONFLICT (cafe_id) DO UPDATE SET ...`, return updated config
- [x] T035 [US5] Add `PUT /chat/config` route to `rcfeild-be/src/routes/chat.routes.ts` (authenticate, authorize('PROVIDER'), chatController.updateWidgetConfig)

**Checkpoint**: PUT then GET returns same values. Fast answer route picks up updated greeting_message immediately without server restart.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Infrastructure completion and validation.

- [x] T036 [P] Add `nlu-service` entry to `rcfeild-be/docker-compose.yml` — Python/FastAPI container, build from Mekit NLU codebase, mount `./intents/rcfield.json` as volume, expose only on internal Docker network (not on host ports), set `NLU_SERVICE_URL=http://nlu-service:8000` in BE service env
- [x] T037 [P] Document required environment variables in `rcfeild-be/.env.example`: `GOOGLE_API_KEY` (Gemini API key), `NLU_SERVICE_URL` (default: http://nlu-service:8000), `NLU_TIMEOUT_MS` (default: 200)
- [ ] T038 Validate all 7 test scenarios from quickstart.md Bước 9 pass end-to-end: (1) GET /chat/config returns defaults, (2) upload TXT → INDEXED via WS, (3) "xin chào" → greeting <200ms, (4) slot question → slot_list <500ms, (5) content question → text with sources <3s, (6) PUT then GET config reflects update, (7) DELETE doc → question returns no answer

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately; T002-T005 and T007 are parallel
- **Foundational (Phase 2)**: Depends on Setup — T008 and T009 parallel; T010 after T009; T011 independent
- **US3 (Phase 3)**: Depends on Foundational — T014 and T015 parallel; T016 after T014+T015; T017 after T012+T013+T016
- **US1 (Phase 4)**: Depends on Phase 3 (needs retrieveChunks in kb.service) — T020 parallel with T021; T023 after T020
- **US2 (Phase 5)**: Depends on Foundational only — can run parallel with US1 Phase 4 if staffed
- **US4 (Phase 6)**: Depends on Phase 3 (kb.controller.ts exists) — T031 and T032 parallel
- **US5 (Phase 7)**: Depends on Foundational (chat.controller.ts shell) — independent from US3/US4
- **Polish (Phase 8)**: Depends on all stories complete

### User Story Dependencies

- **US3 (Phase 3)**: Can start after Foundational — no story dependencies
- **US1 (Phase 4)**: Depends on US3 Phase 3 (retrieveChunks needs kb_chunks data to test)
- **US2 (Phase 5)**: Can start after Foundational — independent of US1/US3
- **US4 (Phase 6)**: Depends on US3 Phase 3 (kb.controller.ts shell must exist)
- **US5 (Phase 7)**: Can start after Foundational — independent

### Parallel Opportunities

Within Phase 1: T002, T003, T004, T005, T007 all touch different files → run in parallel
Within Phase 2: T008 (nlu.ts) and T009 (websocket.service.ts) → run in parallel
Within Phase 3: T014 (embedText) and T015 (bulkInsertChunks) → run in parallel
Within Phase 4: T020 (retrieveChunks) and T021 (route) → run in parallel
Within Phase 6: T031 (listDocuments) and T032 (deleteDocument) → run in parallel
Within Phase 8: T036 and T037 → run in parallel

---

## Parallel Example: Phase 1 Setup

```bash
# Run all entity creation tasks together (different files):
Task: "T003 Create kb-document.entity.ts"
Task: "T004 Create kb-chunk.entity.ts"
Task: "T005 Create cafe-widget-config.entity.ts"
Task: "T002 Add enums to types/index.ts"
Task: "T007 Add validation schemas to validate/index.ts"
# Then sequentially:
Task: "T006 Register entities in database.ts"
```

---

## Implementation Strategy

### MVP First (US3 → US1 only — minimal RAG pipeline)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks everything)
3. Complete Phase 3: US3 (KB Upload) — builds the data
4. Complete Phase 4: US1 (RAG Chat) — uses the data
5. **STOP and VALIDATE**: Run quickstart test steps 1–5
6. Demo: Provider uploads doc, Customer asks question, bot answers

### Incremental Delivery

1. Setup + Foundational → T001–T011
2. US3 KB Upload → T012–T019 → Provider can upload; WebSocket confirms indexing
3. US1 RAG Chat → T020–T027 → Customer can ask questions grounded in KB
4. US2 Slot Check → T028–T030 → Customer can check availability
5. US4 List/Delete → T031–T033 → Provider can manage KB
6. US5 Widget Config → T034–T035 → Provider can customize widget
7. Polish → T036–T038

---

## Summary

| Story | Phase | Tasks | Count | Goal |
|-------|-------|-------|-------|------|
| Setup | 1 | T001–T007 | 7 | Packages, entities, schemas |
| Foundational | 2 | T008–T011 | 4 | NLU client, WebSocket, gate |
| US3 P1 | 3 | T012–T019 | 8 | KB upload + indexing pipeline |
| US1 P1 | 4 | T020–T027 | 8 | RAG chat + NLU routing |
| US2 P1 | 5 | T028–T030 | 3 | Slot availability check |
| US4 P2 | 6 | T031–T033 | 3 | List + delete KB documents |
| US5 P2 | 7 | T034–T035 | 2 | Widget config CRUD |
| Polish | 8 | T036–T038 | 3 | NLU docker, env vars, e2e validation |
| **Total** | | | **38** | |
