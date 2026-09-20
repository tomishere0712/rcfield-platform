# CLAUDE.md — RCField Monorepo

> This file is read by Claude Code (and other AI agents) automatically on session start.
> Keep it accurate. When architecture changes, update this file in the same PR.

---

## Workspace Layout

```text
rcfield-platform/           ← Monorepo gốc
├── backend/                ← Node.js + Express + TypeScript + TypeORM API server
├── frontend/               ← React 19 + Vite + Tailwind CSS v4 web application
├── mobile/                 ← React Native + Expo SDK 54 mobile application
└── docs/                   ← Domain models, state machines, API specs & Docusaurus
    ├── docs/               ← Architecture, specs, business rules, diagrams, guides
    ├── specs/              ← 21 Feature Specs (001-user-login → 019-cafe-bank-payment)
    └── website/            ← Docusaurus documentation website
```

---

## Project Overview

**RCField** là **nền tảng SaaS multi-tenant** cho **nhiều Provider** vận hành sân xe RC tại Việt Nam. Mỗi Provider sở hữu một hoặc nhiều chi nhánh (cafes), đăng ký gói SaaS và vận hành độc lập trên cùng một hệ thống. Không phải marketplace — Provider quản lý chi nhánh của mình, Customer đặt lịch vào từng chi nhánh.

**Roles**:
- **ADMIN** — Team RCField (bên bán phần mềm): feature flag management, system monitoring, KYC approval
- **PROVIDER** — Chủ doanh nghiệp RC: quản lý toàn bộ chi nhánh, đội xe, menu, xem báo cáo doanh thu & KPI
- **STAFF** — Nhân viên từng chi nhánh: vận hành check-in/out, camera inspection ảnh bàn giao xe, F&B, gia hạn
- **CUSTOMER** — Khách đặt lịch: tìm chi nhánh gần nhất, đặt xe, thanh toán VietQR / PayOS, xem lịch sử

Hai chế độ booking: **RENTAL** (thuê xe của quán) và **BYOC** (mang xe cá nhân).
Core value prop: structured evidence at every asset handover (4-angle photos + checklist) → eliminates damage disputes.

**Booking channels**: web app trực tiếp / link chia sẻ / Staff tạo thủ công (walk-in, gọi điện).

**F&B**: Customer pre-order khi đặt lịch (gộp 1 lần thanh toán) + Staff ghi order thêm tại quán.

**Payment**: PayOS (cho SaaS subscription của Provider) + VietQR / Bank Transfer theo chi nhánh với webhook tự động đối soát + VNPay gateway.

---

## Spec Files — Source of Truth

| File | Khi nào cần đọc |
|------|----------------|
| `docs/docs/spec/00-overview.md` | Onboarding, hiểu toàn cảnh phạm vi Phase 1 & 2 |
| `docs/docs/spec/01-domain-model.md` | Trước khi tạo entity / schema |
| `docs/docs/spec/02-state-machine.md` | Trước khi đụng vào booking lifecycle & session timeout |
| `docs/docs/spec/03-payment-engine.md` | Quy tắc ledger thanh toán, đối soát, hoàn tiền |
| `docs/docs/spec/04-inspection-flow.md` | Trước khi làm check-in/out module & ảnh biên bản |
| `docs/docs/spec/05-api-contracts.md` | Trước khi tạo endpoint mới |
| `docs/docs/spec/06-database.md` | Đặc tả chi tiết 70 bảng cơ sở dữ liệu |

## Developer Guides

| File | Nội dung |
|------|----------|
| `docs/docs/developer/provider-subscription-enforcement.md` | Subscription status check, quota guards, error codes |
| `docs/docs/developer/bank-transfer-demo-setup.md` | Hướng dẫn dựng và kiểm thử sandbox chuyển khoản VietQR |
| `docs/docs/developer/contribution-evidence.md` | Báo cáo minh chứng đóng góp theo thành viên từ lịch sử git |

---

## Tech Stack

### Backend (`backend/`)
- **Runtime**: Node.js 20+, TypeScript strict mode
- **Framework**: Express.js — router-per-domain architecture
- **Database**: PostgreSQL 16 via TypeORM (70 operational tables + migrations)
- **Cache & Queue**: Redis 7, BullMQ (background workers, scheduled timeouts)
- **Auth**: JWT + RBAC (4 roles: CUSTOMER, PROVIDER, STAFF, ADMIN)
- **Payment**: PayOS, VietQR Bank Transfer (SePay / Sandbox webhook), VNPay
- **File storage**: Cloudinary (upload ảnh check-in/out inspection)
- **Validation**: Zod on all request bodies

### Frontend (`frontend/`)
- **Framework**: React 19, Vite, TypeScript strict mode
- **Styling**: Tailwind CSS v4, Radix UI primitives, Framer Motion
- **State**: TanStack Query v5 (server state) + Zustand (client state)
- **Maps & Charts**: Leaflet, Recharts

### Mobile (`mobile/`)
- **Framework**: React Native 0.81, Expo SDK 54, Expo Router
- **Styling**: NativeWind v4 (Tailwind CSS)
- **Features**: Camera QR scanner (`expo-camera`), inspection photo picker (`expo-image-picker`)

---

## Coding Conventions

### Chung
- **Không** dùng `any` trong TypeScript — dùng proper types hoặc `unknown`
- Mọi public method trong service đều phải có JSDoc ngắn
- Error handling: dùng Express error middleware, throw custom `AppError(message, statusCode)`

### Đặt tên
- Entity/Model: PascalCase singular (`Booking`, `Vehicle`, `InspectionRecord`)
- Request/Response types: `CreateBookingBody`, `BookingResponse`
- Service method: `findOne`, `findAll`, `create`, `update`, `remove`
- Enum: SCREAMING_SNAKE_CASE (`BookingStatus.PENDING`, `AssetTier.PREMIUM`)
- DB tables: snake_case plural (`bookings`, `vehicles`, `inspection_records`)
- Foreign key: `entity_id` pattern (`booking_id`, `vehicle_id`)

### Payment Engine — Rule đặc biệt
- **Không bao giờ** tính tiền trực tiếp từ giá hiện tại — luôn đọc từ `booking.snapshot`
- Mỗi payment component phải có status riêng: `HELD | DISBURSED | REFUNDED | PENDING`
- Viết unit test trước khi implement refund logic

---

## Docusaurus — Tài liệu site (chạy local)

```bash
cd docs/website
npm run start        # http://localhost:3000
```
