# Implementation Plan: Branch AI Chat Assistant

**Branch**: `002-branch-ai-chat-rag` | **Date**: 2026-05-17 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/002-branch-ai-chat-rag/spec.md`

## Summary

Xây dựng AI chat widget per-cafe sử dụng RAG pipeline: NLU service (Mekit, ~10ms) phân loại intent trước → fast_answer trả ngay / slot_check query DB / còn lại qua Gemini 2.0 Flash + pgvector retrieval. Provider upload KB (PDF/DOCX/TXT) được xử lý async; kết quả push qua WebSocket. Toàn bộ phase này là BE-only.

## Technical Context

**Language/Version**: Node.js 20+, TypeScript strict mode (no `any`)
**Primary Dependencies**:
- `@google/genai` — Gemini 2.5 Pro/Flash (LLM) + text-embedding-004 (embedding); hỗ trợ implicit caching
- `multer` — multipart file upload (10MB limit)
- `pdf-parse` — PDF text extraction
- `mammoth` — DOCX text extraction
- `ws` — WebSocket server (shared infrastructure)
- `node-fetch` — NLU service internal HTTP call (200ms timeout)
- `pgvector` / TypeORM raw query — vector similarity search
- `zod` — request validation (project standard)

**Storage**: PostgreSQL + pgvector extension (`kb_chunks.embedding vector(768)`); S3 không dùng trong feature này (KB lưu raw text vào DB, không giữ file gốc)

**Testing**: Jest (đã cấu hình). Unit test cho KbService chunking/embedding logic; integration test cho chat endpoint end-to-end.

**Target Platform**: Linux server (Docker)

**Project Type**: Web service (REST API + WebSocket)

**Performance Goals**:
- `fast_answer`: < 200ms p95
- `slot_check`: < 500ms p95
- RAG full pipeline: < 3s p95
- Document indexing (< 5MB): < 60s

**Constraints**:
- No `any` (TypeScript strict)
- RBAC tại router level (Principle VI)
- Chat endpoint public (no JWT) — nhưng phải qua feature_flag + quota gate
- `cafe_id` isolation tuyệt đối — chunk query phải luôn có `WHERE cafe_id = $cafeId`
- Conversation history không lưu DB — client-side only

**Scale/Scope**: Multi-provider — N providers × M cafes/provider. Phase 1 dự kiến ~20–50 cafes tổng cộng, ~50k chat messages/tháng. `cafe_id` isolation đảm bảo pgvector query không bao giờ cross-tenant. pgvector IVFFlat index đủ tốt, không cần scale out.

## Constitution Check

*GATE: Verified before proceeding to Phase 0. Re-checked after Phase 1 design.*

| Principle | Relevant? | Status | Notes |
|-----------|-----------|--------|-------|
| I — Snapshot-First Pricing | No | ✅ PASS | Feature không chạm tới tính tiền |
| II — State Machine Gate | No | ✅ PASS | Feature không thay đổi booking/session status |
| III — Evidence-Based Handover | No | ✅ PASS | Feature không liên quan inspection |
| IV — Payment Component Isolation | No | ✅ PASS | Feature không tạo payment component |
| V — Test-First for Financial Logic | No | ✅ PASS | Không có financial logic |
| VI — RBAC Enforcement | **Yes** | ✅ PASS | Chat & GET config: public. POST/DELETE KB & PUT config: `authenticate + authorize('PROVIDER')` tại router level. Ownership check (`cafe.provider_id === req.user.id`) trong service — đảm bảo Provider A không thể đụng vào KB của Provider B. |

## Project Structure

### Documentation (this feature)

```text
specs/002-branch-ai-chat-rag/
├── plan.md              ← file này
├── research.md          ← quyết định kỹ thuật
├── data-model.md        ← TypeORM entities
├── contracts/
│   └── api.md           ← endpoint contracts (đã có)
├── quickstart.md        ← implementation order + snippets
└── checklists/
    └── requirements.md
```

### Source Code Layout (backend)

```text
rcfeild-be/src/
├── routes/
│   └── chat.routes.ts          ← tất cả 6 endpoints của feature này
├── controllers/
│   ├── chat.controller.ts      ← chat endpoint + widget config
│   └── kb.controller.ts        ← KB CRUD
├── services/
│   ├── chat.service.ts         ← NLU routing, RAG pipeline, slot check
│   ├── kb.service.ts           ← document ingestion, chunking, embedding
│   └── websocket.service.ts    ← shared WS infrastructure (new)
├── models/
│   ├── kb-document.entity.ts
│   ├── kb-chunk.entity.ts
│   └── cafe-widget-config.entity.ts
├── types/
│   └── index.ts                ← thêm enums mới (KbDocumentStatus, etc.)
├── validate/
│   └── index.ts                ← thêm ChatMessageSchema, UploadDocumentSchema, etc.
└── config/
    └── nlu.ts                  ← NLU service client (HTTP + timeout)
```

**Structure Decision**: Single backend project, router-per-domain. `chat.routes.ts` mount tất cả routes liên quan đến `/api/cafes/:cafeId/chat*` và `/api/cafes/:cafeId/kb/*`. WebSocket service là singleton được khởi tạo tại `server.ts` và được inject vào các service cần push event.

## Complexity Tracking

Không có violation nào — feature này không phá vỡ bất kỳ principle nào trong constitution.
