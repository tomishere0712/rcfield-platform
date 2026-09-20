# CLAUDE.md — RCField Workspace

> This file is read by Claude Code (and other AI agents) automatically on session start.
> Keep it accurate. When architecture changes, update this file in the same PR.

---

## Workspace Layout

```
rcfield-workspace/          ← Clone cả 2 repo vào đây
├── CLAUDE.md               ← File này — AI đọc đầu tiên
├── rcfield-spec/           ← github.com/rcfield-org/rcfield-spec
│   └── docs/spec/          ← Source of truth cho business logic
└── rcfield-app/            ← github.com/rcfield-org/rcfield-app
    └── apps/
        ├── api/            ← TypeScript + Express backend
        └── web/            ← ReactJS frontend
```

### Clone workspace lần đầu

```bash
mkdir rcfield-workspace && cd rcfield-workspace
git clone https://github.com/rcfield-org/rcfield-spec.git
git clone https://github.com/rcfield-org/rcfield-app.git
# Mở folder rcfield-workspace bằng VS Code / Cursor / Claude Code
```

---

## Project Overview

**RCField** là **nền tảng SaaS multi-tenant** cho **nhiều Provider** vận hành sân xe RC tại Việt Nam. Mỗi Provider sở hữu một hoặc nhiều chi nhánh (cafes), đăng ký gói SaaS và vận hành độc lập trên cùng một hệ thống. Không phải marketplace — Provider quản lý chi nhánh của mình, Customer đặt lịch vào từng chi nhánh.

**Roles**:
- **ADMIN** — Team RCField (bên bán phần mềm): feature flag management, system monitoring
- **PROVIDER** — Chủ doanh nghiệp RC: quản lý toàn bộ chi nhánh, xem báo cáo tổng hợp
- **STAFF** — Nhân viên từng chi nhánh: vận hành check-in/out, F&B, gia hạn
- **CUSTOMER** — Khách đặt lịch: tìm chi nhánh gần nhất, đặt xe, thanh toán

Hai chế độ booking: **RENTAL** (thuê xe của quán) và **BYOC** (mang xe cá nhân).
Core value prop: structured evidence at every asset handover → eliminates damage disputes.

**Booking channels**: app trực tiếp / link chia sẻ (Zalo, FB) / Staff tạo thủ công (walk-in, gọi điện).

**F&B**: Customer pre-order khi đặt lịch (gộp 1 lần thanh toán) + Staff ghi order thêm tại quán (khách trả trực tiếp cho quán). Platform không thu phí trên F&B.

**Payment**: Booking + F&B pre-order → 1 lần qua payment gateway (TBD). F&B tại quán → tiền mặt hoặc chuyển khoản thẳng Provider. Platform không thu % trên booking — revenue model là SaaS subscription fee.

---

## Code Intelligence — BẮT BUỘC dùng Codegraph

Khi cần tìm hiểu code (trace function, tìm caller, xem entity, hiểu flow), **BẮT BUỘC** dùng tool `mcp__codegraph__codegraph_explore` trực tiếp. **Không được** spawn sub-agent hoặc dùng grep/Read để tìm code thủ công.

```
# Đúng
mcp__codegraph__codegraph_explore("submitInspection settleSessionCheckoutBilling")

# Sai
Agent({ subagent_type: "Explore", prompt: "tìm submitInspection..." })
Bash("grep -r 'submitInspection' src/")
```

Codegraph trả về source code verbatim + call path + blast radius trong 1 lần gọi. Dùng grep/Read thủ công tốn nhiều lượt hơn cho cùng kết quả.

---

## Project-Specific Guidelines

> **Before writing any code**, read the `CLAUDE.md` inside the relevant project:
>
> - **Backend**: `rcfeild-be/CLAUDE.md` — controller conventions, logger usage, validation, enums, naming
> - **Frontend**: `rcfeild-fe/CLAUDE.md` — *(when available)*
>
> These files contain coding rules that all agents must follow for that project.

---

## Spec Files — Đọc trước khi implement bất kỳ feature nào

| File | Khi nào cần đọc |
|------|----------------|
| `rcfield-spec/docs/spec/00-overview.md` | Onboarding, hiểu toàn cảnh |
| `rcfield-spec/docs/spec/01-domain-model.md` | Trước khi tạo entity / schema |
| `rcfield-spec/docs/spec/02-state-machine.md` | Trước khi đụng vào booking lifecycle |
| `rcfield-spec/docs/spec/03-payment-engine.md` | **Bắt buộc** trước khi implement bất kỳ payment logic |
| `rcfield-spec/docs/spec/04-inspection-flow.md` | Trước khi làm check-in/out module |
| `rcfield-spec/docs/spec/05-api-contracts.md` | Trước khi tạo endpoint mới |

## Developer Guides — Đọc khi implement tính năng theo domain

| File | Khi nào cần đọc |
|------|----------------|
| `docs/developer/provider-subscription-enforcement.md` | **Bắt buộc** trước khi implement bất kỳ endpoint nào có role PROVIDER — subscription status check, quota guards, error codes |

---

## Tech Stack

### Backend (`rcfield-be`)
- **Runtime**: Node.js 20+, TypeScript strict mode
- **Framework**: Express.js — router-per-domain architecture
- **Database**: PostgreSQL via TypeORM
- **Auth**: JWT + RBAC (4 roles: CUSTOMER, PROVIDER, STAFF, ADMIN)
- **Payment**: Payment gateway TBD (VNPay / MoMo / VietQR)
- **File storage**: Cloudinary (upload ảnh check-in/out, lưu URL về DB)
- **Validation**: zod on all request bodies

### Frontend (`rcfield-fe`)
- **Framework**: ReactJS (Vite hoặc CRA)
- **Language**: TypeScript strict mode
- **Styling**: Tailwind CSS
- **State**: React Query (server state) + Zustand (client state)
- **Language**: Vietnamese UI

---

## Express Project Structure (backend)

```
apps/api/src/
├── routes/         ← Express routers (auth, bookings, inspections, payments...)
├── controllers/    ← Request handlers, input validation
├── services/       ← Business logic (BookingService, PaymentService...)
├── models/         ← TypeORM entities (Booking, Vehicle, Inspection...)
├── middlewares/    ← JWT auth, RBAC guard, error handler
├── jobs/           ← Cron jobs (booking timeout, auto-confirm)
├── types/          ← Shared TypeScript interfaces & enums
└── config/         ← DB, S3, VNPay, JWT config
```

```
apps/web/src/
├── pages/          ← React page components (BookingPage, CheckinPage...)
├── components/     ← Reusable UI components
├── hooks/          ← Custom React hooks (useBooking, useInspection...)
├── api/            ← Axios API client functions
├── store/          ← Zustand stores
└── types/          ← Shared TypeScript interfaces
```

---

## Coding Conventions

### Chung
- **Không** dùng `any` trong TypeScript — dùng proper types hoặc `unknown`
- Mọi public method trong service đều phải có JSDoc ngắn
- Error handling: dùng Express error middleware, throw custom `AppError(message, statusCode)`

### Đặt tên
- Entity/Model: PascalCase singular (`Booking`, `Vehicle`, `Inspection`)
- Request/Response types: `CreateBookingBody`, `BookingResponse`
- Service method: `findOne`, `findAll`, `create`, `update`, `remove`
- Enum: SCREAMING_SNAKE_CASE (`BookingStatus.PENDING`, `AssetTier.PREMIUM`)
- Router file: `booking.routes.ts` | Controller: `booking.controller.ts` | Service: `booking.service.ts`

### Database
- Tên bảng: snake_case plural (`bookings`, `vehicles`, `inspection_records`)
- Foreign key: `entity_id` pattern (`booking_id`, `vehicle_id`)
- Timestamps: mọi entity đều có `created_at`, `updated_at`
- Soft delete: dùng `deleted_at` (TypeORM `@DeleteDateColumn`)

### Payment Engine — Rule đặc biệt
- **Không bao giờ** tính tiền trực tiếp từ giá hiện tại — luôn đọc từ `booking_snapshot`
- Mỗi payment component phải có status riêng: `HELD | DISBURSED | REFUNDED | PENDING`
- Viết unit test trước khi implement refund logic

---

## Git Workflow

```
main          ← production-ready, protected
develop       ← integration branch
feature/TP1-xxx   ← feature branches (prefix bằng Task Package)
fix/xxx
```

### Commit message format
```
feat(bookings): implement slot extension proposal flow
fix(payments): correct pro-rata refund calculation for early checkout
docs(spec): update state machine with timeout transitions
test(payments): add unit tests for damage charge component
```

### PR Rules
- Mọi PR phải link đến GitHub Issue
- Nếu PR thay đổi business logic → phải update spec file tương ứng trong cùng PR
- Không merge PR nếu CI fail

---

## Business Rules Nhanh (tóm tắt — đọc spec đầy đủ trước khi implement)

```
AssetTier:       STANDARD < PREMIUM < RESTRICTED
                 (giá thuê và damage multiplier tăng dần)

PlayMode:        cột `bookings.play_mode` — RENTAL | BYOC
                 (enum DB còn giá trị MIXED nhưng code không tạo được và
                  chưa booking nào dùng)

BookingMode:     cột `bookings.booking_mode` — SINGLE | PACKAGE | SUBSCRIPTION
                 CẢNH BÁO: enum TypeScript tên `BookingMode` lại chứa
                 RENTAL/BYOC, tức là nó ứng với play_mode chứ không phải
                 booking_mode. Đọc kỹ tên cột trước khi dùng.

PaymentFlow:     Trả trước MỘT lần khi booking được xác nhận:
                   slot_fee + rental_fee + fnb_preorder
                   + contest_entry_fee (nếu đăng ký giải)
                   − promotion_discount
                 Các component trên tạo với status HELD.

                 Phát sinh trong/sau phiên chơi, thu thêm ở checkout:
                   EXTENSION_FEE, FNB_ON_SITE, DAMAGE_CHARGE

KHÔNG có cọc:    Nền tảng đã bỏ security deposit khỏi mọi luồng thanh toán.
                 `PaymentComponentType.SECURITY_DEPOSIT` vẫn còn trong enum và
                 logic hoàn cọc vẫn xử lý được dữ liệu cũ, nhưng KHÔNG code nào
                 tạo component này nữa — xem payment.service.ts:527.
                 Không có cột `market_value` ở bất kỳ bảng nào.

PlatformFee:     0%. `platform_fee_pct` đặt cứng bằng 0.
                 Doanh thu nền tảng là phí thuê bao SaaS của Provider,
                 không phải phần trăm trên booking.

Timeout rules:   Xem rcfield-spec/docs/spec/02-state-machine.md
Refund rules:    Xem rcfield-spec/docs/spec/03-payment-engine.md (R1, R2, R3)
```

---

## Docusaurus — Tài liệu site (chạy local)

```bash
cd rcfield-workspace/rcfield-spec/website
npm start        # http://localhost:3000
```

### Hook — Khi tạo tài liệu mới, BẮT BUỘC cập nhật sidebar

Sau khi tạo bất kỳ file `.md` mới trong `docs/` hoặc `specs/`, phải cập nhật sidebar tương ứng:

| Tài liệu nằm ở | File cần cập nhật |
|----------------|-------------------|
| `docs/spec/`, `docs/architecture/`, `docs/diagrams/`, `docs/adr/`, `docs/developer/` | `website/sidebars.ts` |
| `specs/NNN-*/` (feature spec mới) | `website/sidebars-specs.ts` |

**Quy tắc đặt ID trong sidebar:**
- Docusaurus tự strip numeric prefix khỏi tên folder và file
- `docs/spec/00-overview.md` → ID là `spec/overview`
- `specs/010-new-feature/spec.md` → ID là `new-feature/spec`
- `specs/010-new-feature/contracts/api.md` → ID là `new-feature/contracts/api`

**Thêm feature spec mới vào `website/sidebars-specs.ts`:**
```ts
{
  type: 'category',
  label: '010 · Tên Feature',
  collapsed: true,
  items: [
    'ten-feature/spec',
    'ten-feature/plan',
    'ten-feature/data-model',
    'ten-feature/research',
    'ten-feature/quickstart',
    'ten-feature/tasks',
    'ten-feature/contracts/api',  // nếu có
  ],
},
```

**Thêm doc mới vào `website/sidebars.ts`** — thêm ID vào đúng category tương ứng.

Nếu không chắc ID là gì, chạy `npm run build` trong `website/` — Docusaurus sẽ liệt kê toàn bộ available document ids trong error message.

---

## GitNexus (chạy sau khi có codebase)

```bash
cd rcfield-workspace
npx gitnexus analyze rcfield-app   # index app codebase
npx gitnexus setup                 # configure MCP cho editor
```

## Graphify (chạy ngay sau khi setup spec)

```bash
cd rcfield-workspace/rcfield-spec
graphify install claude             # hook vào Claude Code
graphify run                        # build graph từ docs/spec/
```

<!-- SPECKIT START -->
Current active feature plan: `specs/019-cafe-bank-payment/plan.md`
For implementation context, read in order:
1. `specs/019-cafe-bank-payment/plan.md` — technical context, 13 BE new + 8 modified, 4 FE new + 4 modified, milestones M1–M9, constitution gate PASS
2. `specs/019-cafe-bank-payment/research.md` — 17 decisions + a consolidated trap table at the end
3. `specs/019-cafe-bank-payment/data-model.md` — new tables `cafe_payment_settings`, `bank_transactions`, new column `payment_transactions.payment_ref_code`, index predicates, TRUNCATE ordering
4. `specs/019-cafe-bank-payment/contracts/api.md` — 9 new endpoints + 1 backward-compatible change to `POST /bookings/:id/checkout`; the 11-step webhook processing order is normative
5. `specs/019-cafe-bank-payment/quickstart.md` — E2E scenarios; B3 / D6 / C2 are the three decisive ones

⚠️ Six traps flagged in `research.md`: (1) the webhook MUST call `processConfirmationResult` (`payment.service.ts:879`) — **never** `processMockConfirmation` (`:1142`), which silently lacks both the amount check and the booking-hold-expiry guard; (2) `payment.service.ts:723` auto-confirms whenever `VNPAY_MOCK_ENABLED` is on — must be narrowed to VNPAY only or bank-transfer bookings self-confirm before the QR renders; (3) do NOT use `getManagedCafeOrThrow` for bank config — it lets STAFF through, use `assertCafeOwner`; (4) the ref code belongs on `payment_transactions`, never on `bookings`, or a stale QR outlives its payment session and double-charges; (5) checking `status === SUCCESS` is not enough — a FAILED (replaced) transaction must also be rejected; (6) do not relax the amount comparison inside `processConfirmationResult` — it is shared with VNPay.

⚠️ Constitution Principle V is a hard gate here: `src/__tests__/services/bank-webhook.test.ts` must be written and confirmed failing before `matchBankTransaction` is implemented (milestone M3 blocks M4).

Prior feature `018-contest-finance` is implemented through US3 (35/47 tasks); US4 (T036–T047) remains.
<!-- SPECKIT END -->
