# ADR-002 — Backend Framework: Express.js

**Ngày tạo**: 2026-05-13  
**Trạng thái**: ✅ ĐÃ CHỐT  
**Người quyết định**: Team RCField

---

## Quyết định

Dùng **Express.js** cho backend (`rcfield-app/apps/api`).

---

## Bối cảnh

Team 4 người, không ai có kinh nghiệm NestJS. Timeline 4 tháng (04/2026 → 08/2026).  
Cần chọn giữa Express.js và NestJS cho REST API backend.

---

## So sánh

| Tiêu chí | Express.js | NestJS |
|----------|-----------|--------|
| Learning curve | Thấp — bắt đầu ngay | Cao — ~2–3 tuần để productive |
| Timeline 4 tháng | ✅ Phù hợp | ⚠️ Rủi ro |
| Team chưa dùng NestJS | ✅ Không cần học thêm | ❌ Cần học DI, decorators, modules |
| Structure tự động | ❌ Phải tự enforce | ✅ Framework enforce |
| RBAC / Validation | ⚠️ Tự viết 1 lần | ✅ Built-in Guards + Pipes |
| Debug khi gặp bug | ✅ Transparent | ⚠️ Magic khó trace |

---

## Lý do chọn Express

1. **Không có learning curve** — team bắt đầu code ngay từ sprint 1
2. **Timeline an toàn hơn** — không rủi ro bị stuck ở framework-level issues
3. **Đủ mạnh cho project scope** — RBAC, validation, cron jobs đều làm được với Express + thư viện

---

## Mitigation — những gì phải setup ngay từ đầu

Để bù lại việc Express không tự enforce structure:

| Vấn đề | Giải pháp |
|--------|----------|
| RBAC | Viết `requireRole(...roles)` middleware 1 lần, dùng toàn app |
| Validation | Dùng **zod** — schema reusable, type inference tốt |
| Error handling | 1 global error middleware, throw `AppError(message, statusCode)` |
| Structure nhất quán | Convention: `routes/ → controllers/ → services/ → models/` — enforce qua code review |
| Cron jobs | `node-cron` |

---

## Tech stack chốt (Backend)

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 20+ |
| Language | TypeScript strict mode |
| Framework | **Express.js** |
| ORM | TypeORM |
| Database | PostgreSQL |
| Auth | JWT + RBAC (middleware tự viết) |
| Validation | **zod** |
| Jobs | node-cron |
| Storage | Cloudinary |

---

## Phase 2

Nếu sau MVP cần scale team hoặc migrate sang NestJS — Express module structure (`routes/controllers/services`) map khá tốt sang NestJS modules, migration không quá đau.

---

*Tạo: 2026-05-13 · Confirmed by: Team RCField*
