# rcfield-spec

Tài liệu kỹ thuật cho dự án RCField. Đây là **source of truth** cho business logic, domain model, và API contracts.

> Spec sống cùng code. Khi business logic thay đổi → update spec trong cùng PR với code.

---

## Cấu trúc

```
docs/spec/
├── 00-overview.md        Tổng quan đề tài, actors, scope, timeline
├── 01-domain-model.md    Entity, quan hệ, enums
├── 02-state-machine.md   Booking lifecycle, events, timeout rules
├── 03-payment-engine.md  ⚠️ CRITICAL — Component rules, refund R1-R3
├── 04-inspection-flow.md Check-in/out protocol, validation rules
└── 05-api-contracts.md   Endpoint list, request/response format

docs/adr/
└── 001-*.md              Architecture Decision Records

docs/diagrams/
└── *.md                  Mermaid diagrams (ERD, sequence)

graphify-out/
└── GRAPH_REPORT.md       Auto-generated bởi Graphify (gitignored raw, commit report)
```

---

## Setup Graphify (chạy 1 lần)

```bash
pip install graphify
cd rcfield-spec
graphify install claude   # hook vào Claude Code
graphify run              # build knowledge graph từ docs/
```

Sau đó Claude Code tự đọc `graphify-out/GRAPH_REPORT.md` trước mọi câu hỏi về spec.

---

## Workspace Setup

Repo này được dùng cùng với `rcfield-app`. Clone cả 2 vào cùng folder:

```bash
mkdir rcfield-workspace && cd rcfield-workspace
git clone https://github.com/rcfield-org/rcfield-spec.git
git clone https://github.com/rcfield-org/rcfield-app.git
# CLAUDE.md nằm ở root workspace
```

---

## Contributing

- Mọi thay đổi business logic → PR vào `develop`
- Spec thay đổi phải kèm theo code change tương ứng trong `rcfield-app` (link PR)
- Dùng commit message: `docs(spec): <mô tả>`
