# Implementation Plan: Thiết kế lại Nghiệp vụ Tính Giá Đền Bù Hư Hỏng Xe

**Branch**: `main` | **Date**: 2026-07-14 | **Spec**: [spec.md](spec.md)
**Input**: `specs/016-damage-charge-redesign/spec.md`

---

## Summary

Thay thế cơ chế slider ước tính 10k–500k + hệ số nhân tự động bằng form nhập từng hạng mục hư hỏng (linh kiện + công). BE thêm bảng `damage_line_items`, endpoint mới `confirm-checkout` thay thế async customer confirmation flow. FE thêm form line-item động và trang checkout summary để staff quay màn hình cho khách xem tại quầy.

---

## Technical Context

**Language/Version**: Node.js 20+, TypeScript strict mode (no `any`)
**Primary Dependencies**: Express.js, TypeORM, zod (validation), React Query, Zustand, Tailwind CSS
**Storage**: PostgreSQL — thêm bảng `damage_line_items`; S3 cho ảnh inspection (không thay đổi)
**Testing**: Jest (BE unit tests), React Testing Library (FE)
**Target Platform**: Web (staff dùng tablet/desktop tại quầy)
**Project Type**: Web service (Express API) + Web app (React)
**Performance Goals**: Form damage submit < 1s; checkout summary load < 500ms
**Constraints**: Không phá backward compat với inspection records cũ; damage_line_items có thể 0–20 items/inspection

---

## Constitution Check

### I. Snapshot-First Pricing ✅ PASS
- `damageCharge = SUM(damage_line_items)` — staff input trực tiếp, không đọc live price
- Deposit reconciliation đọc từ existing `SECURITY_DEPOSIT` component (đã captured lúc booking)
- Không có conflict: damage amount là post-hoc input, không có trong snapshot

### II. State Machine Gate ✅ PASS với lưu ý
- Session `CHECKING_OUT → COMPLETED` vẫn đi qua `staffConfirmCheckout()` service method
- **Lưu ý**: Cần kiểm tra `settleSessionCheckoutBilling` không direct-update `session.status` — hiện tại code làm trực tiếp (line 2380: `session.status = SessionStatus.COMPLETED`). Cần wrap trong transition method hoặc đảm bảo consistent.
- Damage disagreement log qua `incidents` table (Constitution yêu cầu)

### III. Evidence-Based Handover ✅ STRENGTHENED
- Vẫn yêu cầu 4 ảnh check-in + check-out
- Feature này tăng cường: nay còn cần breakdown từng hạng mục với giá cụ thể
- Damage claim rights giờ yêu cầu `damage_line_items` records

### IV. Payment Component Isolation ✅ PASS
- `DAMAGE_CHARGE` component type không đổi
- Amount = `SUM(line_items)` — set tại creation, không mutate sau đó
- Concurrent updates vẫn dùng DB transaction (không thay đổi)

### V. Test-First for Financial & State Logic ✅ REQUIRED
- **Bắt buộc viết test trước**: damage charge calculation (SUM logic), fallback legacy, cả 2 nhánh deposit reconciliation
- **Bắt buộc viết test trước**: `confirm-checkout` state transition

### VI. RBAC Enforcement ✅ PASS
- Endpoints mới `/confirm-checkout`, `/damage-items`, `/escalate-dispute` → STAFF role
- Provider history (P3) → PROVIDER role
- Middleware `authenticate` + `authorize` áp dụng tại router level

---

## Project Structure

### Documentation (this feature)

```text
specs/016-damage-charge-redesign/
├── plan.md              ← File này
├── research.md          ← 8 decisions + 3 bugs found
├── data-model.md        ← DamageLineItem entity + migration
├── quickstart.md        ← 8 scenarios + unit test checklist
├── contracts/
│   └── api.md           ← 3 endpoints mới + 2 endpoints sửa
└── tasks.md             ← Chưa tạo (cần /speckit-tasks)
```

### Source Code — Backend (`rcfeild-be/`)

```text
src/
├── models/
│   ├── inspection.entity.ts          MODIFY: thêm relation damageLineItems
│   └── damage-line-item.entity.ts    NEW: DamageLineItem entity
├── services/
│   └── staff.service.ts              MODIFY: 4 functions (xem chi tiết bên dưới)
├── controllers/
│   └── staff.controller.ts           MODIFY: thêm 3 route handlers
├── routes/
│   └── staff.routes.ts               MODIFY: đăng ký 3 routes mới
├── types/
│   └── index.ts                      MODIFY: thêm DamagePartType enum
└── migrations/
    └── YYYYMMDD-create-damage-line-items.ts   NEW
```

### Source Code — Frontend (`rcfield-fe/`)

```text
src/
├── pages/staff/
│   ├── StaffInspectionPage.tsx           MODIFY: thay slider → line-item form
│   └── StaffCheckoutSummaryPage.tsx      NEW: màn hình tổng kết + xác nhận
├── pages/customer/
│   └── damage/CustomerDamageReviewPage.tsx   REMOVE hoặc redirect (mock, unused)
├── features/staff/api/
│   └── staff.api.ts                      MODIFY: sửa submitInspection body + thêm 3 functions mới
└── pages/staff/context/
    └── StaffOperationContext.tsx          MODIFY: cập nhật submitInspection handler
```

### Router changes (`rcfield-fe/`)

```text
src/
├── routes/routes.tsx          MODIFY: thêm route /staff/sessions/:id/checkout-summary
└── routes/route-paths.ts      MODIFY: thêm staffCheckoutSummary path
```

---

## Chi tiết thay đổi BE

### 1. Types (`src/types/index.ts`)
Thêm enum `DamagePartType`:
```typescript
export enum DamagePartType {
  TIRE_WHEEL = 'TIRE_WHEEL', SPOILER = 'SPOILER', CHASSIS = 'CHASSIS',
  MOTOR = 'MOTOR', SHELL = 'SHELL', SERVO = 'SERVO', REMOTE = 'REMOTE',
  OTHER = 'OTHER',
}
```

### 2. Entity mới (`src/models/damage-line-item.entity.ts`)
- Columns: id, inspection_id (FK), part_type, custom_part_name, parts_price, labor_price
- Timestamps: created_at, updated_at, deleted_at (soft delete)
- Relation: `@ManyToOne(() => Inspection)` + `inspection: Inspection`

### 3. Inspection entity (`src/models/inspection.entity.ts`)
- Thêm: `@OneToMany(() => DamageLineItem, (d) => d.inspection) damageLineItems: DamageLineItem[]`
- Giữ nguyên: tất cả columns hiện tại (backward compat)

### 4. `submitInspection` (staff.service.ts ~line 1446)
- **Thay đổi request body**: nhận `damageLineItems[]` thay `damageDetails`
- **Lưu DamageLineItem**: sau khi save inspection, tạo DamageLineItem records trong cùng transaction
- **STAFF_MANUAL**: KHÔNG gọi `settleSessionCheckoutBilling` ngay nữa → session vào `CHECKING_OUT`
- **Tất cả CHECK_OUT**: KHÔNG gửi WebSocket `SESSION_CHECKOUT_INSPECTION` tới customer
- **Validation**: nếu `damageFlagged=true` thì `damageLineItems` phải có ít nhất 1 item hợp lệ

### 5. Hàm mới: `staffConfirmCheckout` (staff.service.ts)
```
Inputs: sessionId, inspectionId, staffUserId
1. Validate session ở CHECKING_OUT
2. Validate inspection thuộc session, type CHECK_OUT, chưa confirmed
3. inspection.customerConfirmed = true, customerConfirmedAt = now()
4. Gọi settleSessionCheckoutBilling(sessionId, inspection)
5. session.status = COMPLETED, session.actualEndAt = now()
6. Cập nhật vehicle/sessionVehicle status
7. Cập nhật booking status (AWAITING_PAYMENT hoặc COMPLETED)
```

### 6. `settleSessionCheckoutBilling` (~line 2559)
- **Thay đổi tính damageCharge**:
  ```typescript
  // Mới: đọc từ line items
  const lineItems = await damageLineItemRepo.find({
    where: { inspectionId: inspection.id, deletedAt: IsNull() }
  });
  const damageCharge = lineItems.length > 0
    ? lineItems.reduce((sum, item) => sum + Number(item.partsPrice) + Number(item.laborPrice), 0)
    : Number(inspection.damageCostEstimate || 0) * 1.5;  // fallback legacy
  ```
- Phần deposit reconciliation và PaymentComponent creation: **không đổi**

### 7. Hàm mới: `updateDamageLineItems` (staff.service.ts)
```
Inputs: sessionId, inspectionId, staffUserId, newItems[]
1. Validate session ở CHECKING_OUT
2. Soft-delete items hiện tại của inspection
3. Tạo items mới
4. Return items mới + tổng mới
```

### 8. Hàm mới: `escalateDisputeToProvider` (staff.service.ts)
```
Inputs: sessionId, inspectionId, note, staffUserId
1. Validate session ở CHECKING_OUT
2. Tạo incidents record (status='OPEN', responsible_party=..., resolution_note=note)
3. Return incident data
```

### 9. Controller + Routes mới (staff.controller.ts + staff.routes.ts)
- `POST /staff/sessions/:sessionId/confirm-checkout` → `staffConfirmCheckout`
- `PUT /staff/sessions/:sessionId/inspections/:inspectionId/damage-items` → `updateDamageLineItems`
- `POST /staff/sessions/:sessionId/escalate-dispute` → `escalateDisputeToProvider`

**Coding conventions (từ `rcfeild-be/CLAUDE.md`)**:
- Mỗi handler PHẢI có comment `// METHOD /api/v1/<path> [auth]` ngay trên function
- Zod schema KHÔNG được định nghĩa trong controller — phải thêm vào `src/validate/index.ts` (grouped by table), import từ `'../validate'`
- Dùng `logger.info('Staff', 'action', {...})` — KHÔNG dùng `console.log`
- Schemas mới cần thêm: `SubmitInspectionV2Schema`, `ConfirmCheckoutSchema`, `UpdateDamageItemsSchema`, `EscalateDisputeSchema`

---

## Chi tiết thay đổi FE

### 1. `StaffInspectionPage.tsx` — Damage section
**Xoá**: state `estimatedCost`, `damageMultiplier`, slider UI, multiplier auto-detection logic (lines 105-112, 535-572)

**Thêm**: state `damageLineItems: DamageLineItemInput[]` với CRUD operations:
- Button "Thêm hạng mục" → thêm row mới
- Mỗi row: dropdown `partType`, input `customPartName` (hiện khi OTHER), input `partsPrice`, input `laborPrice`, nút xoá
- Real-time total = SUM(partsPrice + laborPrice)
- Validation khi Submit: mọi row phải có partsPrice >= 0; khi OTHER phải có customPartName

**Thay đổi submit**: gửi `damageLineItems[]` thay vì `damageDetails`
**Thay đổi navigation**: sau submit → `/staff/sessions/:sessionId/checkout-summary` (thay vì `/staff/sessions/:id`)

### 2. `StaffCheckoutSummaryPage.tsx` (NEW)
**Route**: `/staff/sessions/:sessionId/checkout-summary`
**Data source**: GET session detail (hoặc nhận qua navigation state)

**Layout**:
- Section 1: So sánh ảnh check-in vs check-out cạnh nhau (phóng to được)
- Section 2: Bảng breakdown damage line items (tên, parts, labor, subtotal)
- Section 3: Tổng đền bù nổi bật
- Footer: nút "Xác nhận & Quyết toán" + nút "Có tranh chấp"

**"Xác nhận & Quyết toán"**: gọi `staffApi.confirmCheckout(sessionId, inspectionId)` → navigate tới session detail sau khi thành công

**"Có tranh chấp"**: navigate về `StaffInspectionPage` (damage form mode) với dữ liệu hiện tại pre-fill → staff chỉnh sửa → save → quay lại summary

**"Chuyển lên Provider"** (xuất hiện sau khi đã dispute ít nhất 1 lần): gọi `staffApi.escalateDispute()` → navigate tới session detail

### 3. `CustomerDamageReviewPage.tsx`
- Xoá hoặc redirect về `/customer/bookings` — page này dùng mock data và không thuộc flow mới

### 4. `staff.api.ts` — Cập nhật
- `submitInspection`: body type thay `damageDetails?` → `damageLineItems?`
- Thêm `confirmCheckout(sessionId, inspectionId)`
- Thêm `updateDamageItems(sessionId, inspectionId, items)`
- Thêm `escalateDispute(sessionId, inspectionId, note)`

---

## Complexity Tracking

| Điểm phức tạp | Giải thích | Cách xử lý |
|---------------|-----------|------------|
| Backward compat legacy inspections | Records cũ có `damageCostEstimate`, không có line items | Fallback logic trong `settleSessionCheckoutBilling`: nếu line items = 0 thì dùng `estimate × 1.5` |
| STAFF_MANUAL không còn auto-settle | Breaking change cho booking loại này | Remove auto-settle block trong `submitInspection`, bắt buộc đi qua summary screen |
| Session re-accessability | Staff có thể thoát summary rồi vào lại | `CHECKING_OUT` state persist; summary page luôn load từ API, không từ navigation state |
| Soft-delete items khi edit | Items cũ cần giữ lại cho audit trail | `deleted_at` trên `damage_line_items`, tạo items mới thay vì update |
