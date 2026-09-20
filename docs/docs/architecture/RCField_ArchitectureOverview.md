# RCField — Architecture Overview

> Quick reference for understanding the RCField system design, data model, and codebase layout.

**Last Updated:** 2026-05-17

---

## What is RCField?

**RCField** là phần mềm B2B bán cho **1 doanh nghiệp** vận hành chuỗi sân xe RC (Radio-Controlled Car) tại Việt Nam.

Mô hình chuỗi (giống Starbucks): 1 Provider, nhiều chi nhánh, dùng chung 1 hệ thống — **không phải marketplace**.

### Core Value Proposition

- Structured evidence at every asset handover → eliminate damage disputes
- Digital booking/session replace Zalo/phone → no double-booking
- Component-based payment ledger → accurate settlement and audit trail

### Hai chế độ chơi

| Mode | Mô tả |
|------|-------|
| **RENTAL** | Customer thuê xe của quán |
| **BYOC** | Customer mang xe cá nhân (Bring Your Own Car) |
| **MIXED** | Nhóm vừa thuê vừa mang xe cá nhân |

---

## Project Structure

```
rcfield-workspace/
├── rcfield-spec/               ← Tài liệu spec (source of truth)
│   └── docs/spec/
│       ├── 00-overview.md
│       ├── 01-domain-model.md
│       ├── 02-state-machine.md
│       ├── 03-payment-engine.md
│       ├── 04-inspection-flow.md
│       ├── 05-api-contracts.md
│       ├── 06-database.md
│       └── business-rules/
└── rcfield-app/                ← Codebase
    └── apps/
        ├── api/                ← TypeScript + Express backend
        └── web/                ← ReactJS frontend
```

---

## Technology Stack

### Backend (`apps/api`)

| Layer | Technology |
|-------|------------|
| Runtime | Node.js 20+, TypeScript (strict mode) |
| Framework | Express.js — router-per-domain |
| Database | PostgreSQL via TypeORM |
| Auth | JWT (access 15m + refresh 7d) + RBAC (4 roles) |
| Validation | Zod (all request bodies) |
| File Storage | Cloudinary (inspection photos, URL stored in DB) |
| Payment | VNPay / MoMo / VietQR (TBD) |

### Frontend (`apps/web`)

| Layer | Technology |
|-------|------------|
| Framework | ReactJS + Vite, TypeScript (strict mode) |
| Styling | Tailwind CSS |
| Server State | React Query |
| Client State | Zustand |
| Language | Vietnamese UI |

---

## System Architecture

### High-Level Data Flow

```
┌──────────────────────────────────────────────────────┐
│                   Client Layer                       │
│  ┌─────────────────┐         ┌──────────────────┐   │
│  │ Customer / Staff│         │ Provider / Admin │   │
│  │  (Mobile-first) │         │    (Web)         │   │
│  └────────┬────────┘         └────────┬─────────┘   │
└───────────┼──────────────────────────┼──────────────┘
            │ HTTP REST (JWT Auth)      │
            ▼                          ▼
┌──────────────────────────────────────────────────────┐
│              Express API Server                      │
│  ┌────────────────────────────────────────────────┐  │
│  │  Middlewares: logger → CORS → JWT → RBAC       │  │
│  └───────────────────┬────────────────────────────┘  │
│                      │                               │
│  ┌───────────────────┴──────────────────────┐       │
│  │  Routers (domain-per-router)              │       │
│  │  auth / bookings / sessions / inspections │       │
│  │  incidents / payments / fleet / F&B / ... │       │
│  └───────────────────┬──────────────────────┘       │
│                      │                               │
│  ┌───────────────────┴──────────────────────┐       │
│  │  Service Layer                            │       │
│  │  BookingService  SessionService           │       │
│  │  PaymentService  InspectionService        │       │
│  │  IncidentService TrustScoreService        │       │
│  └───────────────────┬──────────────────────┘       │
└──────────────────────┼───────────────────────────────┘
                       │ TypeORM
                       ▼
┌────────────────────────────────┐   ┌──────────────┐
│      PostgreSQL (41 tables)    │   │  Cloudinary  │
│      Phase 1 core schema       │   │ (inspection  │
│                                │   │   photos)    │
└────────────────────────────────┘   └──────────────┘
```

### Actors và Quyền

| Actor | Mô tả | Quyền chính |
|-------|-------|-------------|
| **CUSTOMER** | Khách đặt lịch | Tạo booking, xác nhận inspection, mở dispute |
| **PROVIDER** | Chủ chuỗi RC | Quản lý chi nhánh, đội xe, giá, doanh thu |
| **STAFF** | Nhân viên chi nhánh | Check-in/out, inspection, F&B, gia hạn |
| **ADMIN** | Team RCField | Quản trị nền tảng, xét dispute, feature flags |

---

## Core Data Model

### Planned vs. Actual (nguyên tắc quan trọng nhất)

```
BOOKING  = kế hoạch đặt lịch (contract)
SESSION  = phiên chơi thực tế (operations)

booking_participants → session_participants  (ai dự kiến vs ai thực tế)
booking_vehicles     → session_vehicles      (xe dự kiến vs xe thực tế)
```

Một booking có thể có nhiều sessions. Session chỉ tạo khi Staff check-in.

### Entity Map

```
User ──────┬──── Cafe ──────┬──── Vehicle
           │                ├──── MenuItem
           │                └──── Package / Subscription / Contest
           │
           └──── Booking ───┬──── BookingParticipant
                            ├──── BookingVehicle
                            ├──── PaymentComponent  (ledger)
                            ├──── PaymentTransaction (gateway log)
                            ├──── FnbOrder
                            ├──── Dispute
                            └──── Session ──────────┬──── SessionParticipant
                                                    ├──── SessionVehicle
                                                    ├──── Inspection
                                                    │       ├── InspectionPhoto
                                                    │       └── InspectionChecklist
                                                    ├──── ExtensionProposal
                                                    └──── Incident
```

---

## State Machines

### Booking State Machine

```
PENDING
  → CONFIRMED   [thanh toán thành công]
  → CANCELLED   [timeout 30 phút / customer huỷ]

CONFIRMED
  → COMPLETED   [tất cả sessions COMPLETED]
  → CANCELLED   [huỷ trước session]
  → NO_SHOW     [slot_start + 30 phút, không có session]
```

### Session State Machine

```
CHECKED_IN
  → ACTIVE        [check-in hoàn tất, customer confirm]
  → CANCELLED     [huỷ trước khi bắt đầu]

ACTIVE
  → EXTENDING     [staff đề xuất gia hạn]
  → CHECKING_OUT  [staff bắt đầu check-out]

EXTENDING
  → ACTIVE        [customer approve / reject / timeout 10 phút]

CHECKING_OUT
  → COMPLETED     [customer confirm hoặc auto-confirm]
```

> **Rule**: Không được update status trực tiếp. Phải gọi `BookingService.transition()` hoặc `SessionService.transition()`.

---

## Payment Engine

### Component Types

| Component | Khi tạo | Settle |
|-----------|---------|--------|
| `SLOT_FEE` | booking CONFIRMED | session COMPLETED → Provider |
| `RENTAL_FEE` | booking CONFIRMED, mỗi xe | session COMPLETED → Provider |
| `SECURITY_DEPOSIT` | booking CONFIRMED, mỗi xe | session COMPLETED → hoàn Customer (trừ damage) |
| `EXTENSION_FEE` | extension APPROVED | session COMPLETED → Provider |
| `DAMAGE_CHARGE` | check-out có damage | session COMPLETED → Provider |
| `FB_PREORDER` | booking có pre-order F&B | session COMPLETED → Provider |

### Nguyên tắc cốt lõi

- **Snapshot-first**: Mọi tính toán đọc từ `booking.snapshot`, không dùng giá hiện tại
- **Immutable ledger**: Không update `amount` đã tạo — tạo component mới nếu cần điều chỉnh
- **Settlement theo session**: Mỗi session COMPLETED trigger settle riêng
- **Platform fee**: 15% trên tổng disburse về Provider (không tính F&B, không tính deposit)

---

## Inspection Flow

Tạo **digital evidence** tại mọi điểm bàn giao tài sản.

```
CHECK-IN:
  Staff → tạo Session (CHECKED_IN) → chụp 4 góc xe → điền checklist
  → System tạo Inspection(CHECK_IN) + InspectionPhotos + InspectionChecklists
  → Customer confirm (15 phút timeout → auto-confirm)
  → Session CHECKED_IN → ACTIVE

CHECK-OUT:
  Staff → chụp lại 4 góc → so sánh với check-in
  → Đánh dấu damage / không damage
  → Customer confirm (2h / 24h timeout)
  → Session → COMPLETED → PaymentEngine.settle(sessionId)
```

**Rule**: Thiếu ảnh hoặc checklist → Provider mất quyền tính `DAMAGE_CHARGE`.

---

## Key API Endpoints

```
Auth
  POST /auth/register          Public
  POST /auth/login             Public
  POST /auth/refresh           Auth
  GET  /auth/me                Auth

Bookings
  POST /bookings               CUSTOMER — tạo booking (multi-vehicle + participants)
  POST /bookings/:id/cancel    CUSTOMER / PROVIDER
  POST /bookings/:id/payment/confirm  CUSTOMER

Sessions
  POST /bookings/:id/sessions/checkin   STAFF — tạo session
  GET  /sessions/:id                    Auth

Inspections
  POST /sessions/:id/inspections/checkin          STAFF
  POST /sessions/:id/inspections/checkout         STAFF
  POST /sessions/:id/inspections/checkin/confirm  CUSTOMER
  POST /sessions/:id/inspections/checkout/confirm CUSTOMER

Extensions
  POST /sessions/:id/extensions                   STAFF
  POST /sessions/:id/extensions/:extId/approve    CUSTOMER

Incidents
  POST /sessions/:id/incidents                    STAFF
  POST /incidents/:id/resolve                     STAFF / ADMIN

Fleet
  GET  /cafes/:cafeId/vehicles     Auth
  POST /cafes/:cafeId/vehicles     PROVIDER
```

> Convention: tất cả response wrap trong `{ data, meta?, error? }`  
> Auth header: `Authorization: Bearer <jwt_token>`

---

## Backend Code Structure

```
apps/api/src/
├── routes/         ← Express routers (1 file per domain)
├── controllers/    ← Input validation + gọi service (Zod ở đây)
├── services/       ← Business logic (BookingService, PaymentService...)
├── models/         ← TypeORM entities (Booking, Vehicle, Inspection...)
├── middlewares/    ← JWT auth, RBAC guard, request logger, error handler
├── jobs/           ← Cron jobs (booking timeout, auto-confirm)
├── types/          ← Shared TypeScript interfaces & enums (src/types/index.ts)
├── validate/       ← Zod schemas grouped by table (src/validate/index.ts)
└── config/         ← DB, Cloudinary, Payment, JWT config
```

### Conventions bắt buộc

```typescript
// Controller — luôn có comment endpoint trước mỗi handler
// POST /api/v1/bookings  [auth: CUSTOMER]
async createBooking(req: AuthRequest, res, next) {
  const body = CreateBookingSchema.parse(req.body);   // validate ở đây
  const result = await bookingService.create(body);
  logger.info('Booking', 'created', { bookingId: result.id });
  res.json({ data: result });
}
```

---

## Incident & Dispute Resolution

Phase 1 có 2 lớp xử lý khi xảy ra tranh chấp:

| Layer | Bảng | Actor | Mô tả |
|-------|------|-------|-------|
| **Incident** | `incidents` | Staff / Admin | Policy-based: áp rule tự động, ghi `responsible_party` + `final_amount` |
| **Dispute** | `disputes` | Admin (RCField) | Formal: Admin xét xử dựa trên digital evidence từ inspection |

**Evidence chain**: `inspections` → `inspection_photos` → `inspection_checklists`

---

## Development Setup

```bash
# Clone workspace
mkdir rcfield-workspace && cd rcfield-workspace
git clone https://github.com/rcfield-org/rcfield-spec.git
git clone https://github.com/rcfield-org/rcfield-app.git

# Backend
cd rcfield-app/apps/api
npm install
npm run dev              # Port 3000 (default)

# Frontend
cd rcfield-app/apps/web
npm install
npm run dev
```

### Required Environment Variables (Backend)

```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/rcfield
DATABASE_PORT=5432

# Auth
JWT_SECRET=...
JWT_REFRESH_SECRET=...

# Cloudinary
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...

# Redis (session/job queue)
REDIS_URL=redis://localhost:6379

# Payment (TBD)
VNPAY_TMN_CODE=...
VNPAY_HASH_SECRET=...

# App
PORT=3000
LOG_LEVEL=info
NODE_ENV=development
```

---

## Phase 1 Status

### Implemented (Spec Complete)

| Module | Spec | Notes |
|--------|------|-------|
| ✅ Domain model | `01-domain-model.md` | 41 tables defined |
| ✅ State machine | `02-state-machine.md` | Booking + Session |
| ✅ Payment engine | `03-payment-engine.md` | Component-based, session-settled |
| ✅ Inspection flow | `04-inspection-flow.md` | Multi-vehicle, Cloudinary |
| ✅ API contracts | `05-api-contracts.md` | All endpoints defined |
| ✅ Business rules | `business-rules/*.md` | BR-booking, BR-payment, BR-inspection, BR-dispute, BR-extension, BR-fleet, BR-fnb, BR-promotions |

### Phase 2 (Out of Scope)

- Multi-party dispute workflow (`dispute_evidences`, `dispute_parties`)
- SaaS tenant/billing
- AI damage detection, AI recommendations
- Analytics dashboard nâng cao
- Dynamic pricing, loyalty, native mobile app

---

## Key Files Reference

### Spec (source of truth)

| File | Khi nào cần đọc |
|------|----------------|
| `docs/spec/00-overview.md` | Onboarding, hiểu toàn cảnh |
| `docs/spec/01-domain-model.md` | Trước khi tạo entity / schema |
| `docs/spec/02-state-machine.md` | Trước khi đụng booking lifecycle |
| `docs/spec/03-payment-engine.md` | **Bắt buộc** trước khi code payment |
| `docs/spec/04-inspection-flow.md` | Trước khi làm check-in/out |
| `docs/spec/05-api-contracts.md` | Trước khi tạo endpoint mới |
| `docs/spec/06-database.md` | Schema chi tiết + SQL |

### Backend (`rcfield-app/apps/api`)

| Area | Path |
|------|------|
| Entry point | `src/server.ts` |
| All enums | `src/types/index.ts` |
| All Zod schemas | `src/validate/index.ts` |
| Logger | `src/config/logger.ts` |
| Auth controller | `src/controllers/auth.controller.ts` |
| RBAC middleware | `src/middlewares/auth.middleware.ts` |

---

## Quick Summary

**RCField** là hệ thống vận hành cho chuỗi sân xe RC, kết hợp:

1. **Booking + Session separation** — planned data tách khỏi actual operations
2. **Evidence-based handover** — 4-angle photos + checklist tại mọi điểm bàn giao
3. **Component-based payment** — immutable ledger, settle theo session
4. **Dual dispute resolution** — incident policy (automated) + dispute (Admin-adjudicated)
5. **Multi-vehicle support** — nhiều xe/người trong 1 booking, đổi xe trong session
6. **F&B integration** — pre-order (gộp payment) + on-site (ngoài platform)
