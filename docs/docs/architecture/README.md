# RCField — Architecture Docs

> Quick reference cho developer mới và AI agents.  
> Đọc theo thứ tự nếu onboarding. Nhảy thẳng vào file tương ứng nếu debug một luồng cụ thể.

**Last Updated:** 2026-06-08

---

## What is RCField?

B2B SaaS cho **1 doanh nghiệp** vận hành chuỗi sân xe RC tại Việt Nam — mô hình chuỗi (1 Provider, nhiều chi nhánh, dùng chung 1 hệ thống). Không phải marketplace.

**Core value**: structured digital evidence tại mọi điểm bàn giao tài sản → eliminate damage disputes.

---

## Index

| File | Nội dung | Đọc khi nào |
|------|----------|-------------|
| [`00-system-overview.md`](00-system-overview.md) | C4 diagrams, actors, tech stack, module map, ADR | Onboarding, hiểu toàn cảnh |
| [`01-booking-session.md`](01-booking-session.md) | Planned vs Actual, entity map, state machines, timeouts | Trước khi đụng booking/session |
| [`02-payment-engine.md`](02-payment-engine.md) | Payment components, settlement, refund rules | Trước khi code bất kỳ payment logic |
| [`03-inspection-flow.md`](03-inspection-flow.md) | Check-in/out protocol, evidence chain, Cloudinary | Trước khi làm inspection module |
| [`03-contest.md`](03-contest.md) | Contest module, registration, event lifecycle, race management phases | Trước khi làm contest/tournament |
| [`04-dispute-resolution.md`](04-dispute-resolution.md) | Incident policy vs Dispute, evidence, Phase 1 scope | Trước khi làm incident/dispute |
| [`02-ai-chat-rag.md`](02-ai-chat-rag.md) | NLU routing, RAG pipeline, KB ingestion, SSE streaming | Trước khi đụng chat/KB feature |

**Delivery / rollout docs**  
→ [`docs/developer/contest-delivery/README.md`](../developer/contest-delivery/README.md)

**Sequence diagrams** (luồng end-to-end):  
→ [`docs/diagrams/sequence/README.md`](../diagrams/sequence/README.md)

---

## Project Structure

```
rcfield-workspace/
├── rcfield-spec/               ← Tài liệu này
│   └── docs/
│       ├── architecture/       ← Bạn đang ở đây
│       ├── diagrams/sequence/  ← Sequence flow diagrams
│       └── spec/               ← Business spec (source of truth)
└── rcfield-app/
    └── apps/
        ├── api/                ← TypeScript + Express backend
        └── web/                ← ReactJS frontend
```

---

## Dev Setup

```bash
# Clone
mkdir rcfield-workspace && cd rcfield-workspace
git clone https://github.com/rcfield-org/rcfield-spec.git
git clone https://github.com/rcfield-org/rcfield-app.git

# Backend
cd rcfield-app/apps/api && npm install && npm run dev

# Frontend
cd rcfield-app/apps/web && npm install && npm run dev
```

**Required env vars (Backend):**

```bash
DATABASE_URL=postgresql://user:pass@localhost:5432/rcfield
JWT_SECRET=...
JWT_REFRESH_SECRET=...
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
REDIS_URL=redis://localhost:6379
PORT=3000
LOG_LEVEL=info
```

---

## Spec Files — Đọc trước khi implement

| File | Đọc khi nào |
|------|-------------|
| `docs/spec/00-overview.md` | Onboarding |
| `docs/spec/01-domain-model.md` | Trước khi tạo entity |
| `docs/spec/02-state-machine.md` | Trước khi đụng booking lifecycle |
| `docs/spec/03-payment-engine.md` | **Bắt buộc** trước khi code payment |
| `docs/spec/04-inspection-flow.md` | Trước khi làm check-in/out |
| `docs/spec/05-api-contracts.md` | Trước khi tạo endpoint mới |
| `docs/spec/06-database.md` | Schema chi tiết + SQL |
| `docs/spec/business-rules/BR-contest.md` | Trước khi làm contest/tournament |
