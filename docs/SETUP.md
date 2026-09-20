# RCField Workspace — Setup Guide

## Lần đầu setup (chạy một lần)

```bash
# 1. Tạo workspace folder
mkdir rcfield-workspace && cd rcfield-workspace

# 2. Clone cả 2 repo
git clone https://github.com/rcfield-org/rcfield-spec.git
git clone https://github.com/rcfield-org/rcfield-app.git

# 3. Copy CLAUDE.md vào root (hoặc tạo symlink)
# File CLAUDE.md đã có trong workspace root
```

## Cấu trúc sau khi clone

```
rcfield-workspace/
├── CLAUDE.md               ← AI reads this first
├── rcfield-spec/           ← Spec & docs
│   ├── README.md
│   └── docs/spec/          ← 5 spec files
└── rcfield-app/            ← Source code
    ├── README.md
    └── apps/
        ├── api/            ← NestJS
        └── web/            ← Next.js
```

## Mở workspace trong editor

```bash
# VS Code / Cursor
code rcfield-workspace/

# Claude Code
cd rcfield-workspace && claude
```

## Setup Graphify (đọc spec)

```bash
pip install graphify
cd rcfield-workspace/rcfield-spec
graphify install claude
graphify run
# → Tạo graphify-out/GRAPH_REPORT.md
# → Claude Code tự đọc file này trước khi trả lời về spec
```

## Setup GitNexus (sau khi có codebase)

```bash
cd rcfield-workspace
npm install -g gitnexus
gitnexus analyze rcfield-app    # index codebase
gitnexus setup                  # configure MCP cho editor
# → Claude Code có full codebase awareness
```

## GitHub Organization Setup

1. Tạo GitHub Organization: `rcfield-org`
2. Tạo 2 repos: `rcfield-spec` (public/private) + `rcfield-app` (private)
3. Settings → Branches: protect `main` (require PR + CI pass)
4. Projects → New project: Kanban board với columns:
   - `Backlog` / `In Progress` / `In Review` / `Done`
5. Labels: `task-package-1`, `task-package-2`, `task-package-3`, `bug`, `docs`
