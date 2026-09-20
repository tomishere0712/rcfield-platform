# Tasks: Thiết kế lại Nghiệp vụ Tính Giá Đền Bù Hư Hỏng Xe

**Input**: `specs/016-damage-charge-redesign/`
**Prerequisites**: plan.md ✅ | spec.md ✅ | research.md ✅ | data-model.md ✅ | contracts/api.md ✅ | quickstart.md ✅

---

## Phase 1: Setup — Data Layer (Blocking tất cả US)

**Purpose**: Tạo entity, enum, migration — prerequisite cho mọi user story.

**⚠️ CRITICAL**: Phải hoàn thành trước khi bắt đầu bất kỳ US nào.

- [X] T001 Thêm enum `DamagePartType` (TIRE_WHEEL, SPOILER, CHASSIS, MOTOR, SHELL, SERVO, REMOTE, OTHER) vào `rcfeild-be/src/types/index.ts`
- [X] T002 [P] Tạo TypeORM entity `DamageLineItem` với columns: id, inspection_id, part_type, custom_part_name, parts_price, labor_price, created_at, updated_at, deleted_at tại `rcfeild-be/src/models/damage-line-item.entity.ts`
- [X] T003 [P] Thêm `@OneToMany(() => DamageLineItem, (d) => d.inspection) damageLineItems: DamageLineItem[]` vào Inspection entity tại `rcfeild-be/src/models/inspection.entity.ts`
- [X] T004 Tạo TypeORM migration tạo bảng `damage_line_items` và enum `damage_part_type` (xem SQL trong data-model.md) tại `rcfeild-be/src/migrations/` — chạy migration sau khi tạo

**Checkpoint**: `damage_line_items` table tồn tại trong DB, entity import được không lỗi TypeScript.

---

## Phase 2: User Story 1 — Staff lập danh sách hư hỏng (Priority: P1) 🎯 MVP

**Goal**: Staff có thể thêm nhiều hạng mục hư hỏng với giá linh kiện + công, hệ thống lưu đúng vào `damage_line_items`, tổng đền bù tính đúng theo SUM.

**Independent Test**: Staff submit CHECK_OUT inspection có `damageLineItems` → kiểm tra DB có records trong `damage_line_items` đúng giá, `settleSessionCheckoutBilling` tính tổng từ SUM thay vì multiplier.

### BE — User Story 1

- [X] T005 [US1] Sửa `submitInspection` trong `rcfeild-be/src/services/staff.service.ts`: (1) nhận `damageLineItems[]` thay `damageDetails`, (2) lưu `DamageLineItem` records trong cùng transaction sau khi save inspection, (3) bỏ block auto-settle cho STAFF_MANUAL (session → CHECKING_OUT cho mọi loại booking), (4) bỏ WebSocket `SESSION_CHECKOUT_INSPECTION` gửi tới customer cho CHECK_OUT type
- [X] T006 [US1] Sửa `settleSessionCheckoutBilling` trong `rcfeild-be/src/services/staff.service.ts`: thay `damageCostEstimate * multiplier` bằng `SUM(damage_line_items.parts_price + labor_price WHERE inspection_id AND deleted_at IS NULL)`; giữ fallback `damageCostEstimate * 1.5` khi `lineItems.length === 0` (backward compat legacy records)
- [X] T007 [US1] Thêm `SubmitInspectionV2Schema` vào `rcfeild-be/src/validate/index.ts` (nhóm `-- inspections --`): mỗi `damageLineItem` cần `partType` (z.nativeEnum(DamagePartType)), `partsPrice` (z.number().min(0)), `laborPrice` (z.number().min(0).default(0)); khi `partType = OTHER` thì `customPartName` bắt buộc không rỗng (dùng `.superRefine`); sau đó sửa handler `submitInspection` trong `rcfeild-be/src/controllers/staff.controller.ts` gọi `SubmitInspectionV2Schema.parse(req.body)` trước khi gọi service

### FE — User Story 1

- [X] T008 [P] [US1] Thay thế slider/multiplier UI trong `rcfeild-fe/src/pages/staff/StaffInspectionPage.tsx`: xoá state `estimatedCost`, `damageMultiplier`, `finalCharge` và logic detect premium (lines ~65-68, ~105-112); thêm state `damageLineItems: {partType, customPartName?, partsPrice, laborPrice}[]`; render dynamic rows (dropdown partType, input parts_price, input labor_price, nút xoá); show `customPartName` text input khi `partType === 'OTHER'`; real-time total = SUM(partsPrice + laborPrice); validate trước khi submit
- [X] T009 [P] [US1] Sửa `submitInspection` trong `rcfeild-fe/src/features/staff/api/staff.api.ts`: thay body field `damageDetails` → `damageLineItems: {partType, customPartName?, partsPrice, laborPrice?}[]`
- [X] T010 [US1] Sửa `submitInspection` handler trong `rcfeild-fe/src/pages/staff/context/StaffOperationContext.tsx`: map `damageLineItems` state sang đúng API body format; xoá toast message đề cập async customer confirmation

**Checkpoint**: Staff submit CHECK_OUT với 2 damage items → DB có 2 records trong `damage_line_items` → `settleSessionCheckoutBilling` tính tổng đúng theo SUM.

---

## Phase 3: User Story 2 — Checkout Summary + Xác nhận tại chỗ (Priority: P2)

**Goal**: Sau khi lưu biên bản, staff thấy màn hình tổng kết (ảnh so sánh + breakdown + tổng). Staff trigger quyết toán sau khi khách đồng ý. Có thể edit lại khi tranh chấp trong cùng phiên.

**Independent Test**: Staff lưu biên bản → navigate tới `/staff/sessions/:id/checkout-summary` → thấy ảnh và breakdown → bấm "Xác nhận & Quyết toán" → session COMPLETED, PaymentComponent tạo đúng.

### BE — User Story 2

- [X] T011 [US2] Implement `staffConfirmCheckout(sessionId, inspectionId, staffUserId)` trong `rcfeild-be/src/services/staff.service.ts`: validate session ở CHECKING_OUT + inspection chưa confirmed; set `inspection.customerConfirmed=true`, `customerConfirmedAt=now()`; gọi `settleSessionCheckoutBilling`; set `session.status=COMPLETED`, `actualEndAt=now()`; update vehicle/sessionVehicle status; update booking status (AWAITING_PAYMENT hoặc COMPLETED)
- [X] T012 [P] [US2] Implement `updateDamageLineItems(sessionId, inspectionId, staffUserId, newItems[])` trong `rcfeild-be/src/services/staff.service.ts`: validate session ở CHECKING_OUT; soft-delete items hiện tại (`deletedAt=now()`); tạo items mới; trả về items mới + tổng mới
- [X] T013 [P] [US2] Implement `escalateDisputeToProvider(sessionId, inspectionId, note, staffUserId)` trong `rcfeild-be/src/services/staff.service.ts`: validate session ở CHECKING_OUT + note không rỗng; tạo `incidents` record với status='OPEN', resolution_note=note; trả về incidentId
- [X] T014 [P] [US2] Thêm handler `confirmCheckout` trong `rcfeild-be/src/controllers/staff.controller.ts`: comment `// POST /api/v1/staff/sessions/:sessionId/confirm-checkout [auth]`; parse body với `ConfirmCheckoutSchema.parse(req.body)`; gọi `staffConfirmCheckout`; log `logger.info('Staff', 'confirmCheckout', { sessionId, staffId })`
- [X] T015 [P] [US2] Thêm handler `updateDamageItems` trong `rcfeild-be/src/controllers/staff.controller.ts`: comment `// PUT /api/v1/staff/sessions/:sessionId/inspections/:inspectionId/damage-items [auth]`; parse body với `UpdateDamageItemsSchema.parse(req.body)`; gọi `updateDamageLineItems`; (thêm 2 schema tương ứng vào `src/validate/index.ts`)
- [X] T016 [P] [US2] Thêm handler `escalateDispute` trong `rcfeild-be/src/controllers/staff.controller.ts`: comment `// POST /api/v1/staff/sessions/:sessionId/escalate-dispute [auth]`; parse body với `EscalateDisputeSchema.parse(req.body)` (`note: z.string().min(1)`); gọi `escalateDisputeToProvider`; (thêm schema vào `src/validate/index.ts`)
- [X] T017 [US2] Đăng ký 3 routes mới trong `rcfeild-be/src/routes/staff.routes.ts` (auth STAFF): `POST /sessions/:sessionId/confirm-checkout`, `PUT /sessions/:sessionId/inspections/:inspectionId/damage-items`, `POST /sessions/:sessionId/escalate-dispute`
- [X] T018 [US2] Cập nhật GET session detail response trong `rcfeild-be/src/services/staff.service.ts`: khi session ở CHECKING_OUT hoặc COMPLETED, include `checkoutInspection` với `damageLineItems[]` và `totalDamageCharge`

### FE — User Story 2

- [X] T019 [US2] Tạo `StaffCheckoutSummaryPage` tại `rcfeild-fe/src/pages/staff/StaffCheckoutSummaryPage.tsx`: load session detail từ API; layout gồm (1) so sánh ảnh check-in vs check-out cạnh nhau có phóng to, (2) bảng breakdown damage items (tên, parts, labor, subtotal), (3) tổng đền bù nổi bật, (4) nút "Xác nhận & Quyết toán" → gọi `confirmCheckout` → navigate session detail, (5) nút "Có tranh chấp" → navigate về StaffInspectionPage (edit mode), (6) nút "Chuyển lên Provider" (hiện sau dispute ≥1 lần) → gọi `escalateDispute`
- [X] T020 [US2] Thêm route path `staffCheckoutSummary = '/staff/sessions/:sessionId/checkout-summary'` vào `rcfeild-fe/src/routes/route-paths.ts` và đăng ký route `<StaffCheckoutSummaryPage />` trong `rcfeild-fe/src/routes/routes.tsx`
- [X] T021 [US2] Sửa navigation sau submit trong `rcfeild-fe/src/pages/staff/StaffInspectionPage.tsx` (line ~262): thay `navigate('/staff/sessions/${sessionId}')` → `navigate('/staff/sessions/${sessionId}/checkout-summary')`
- [X] T022 [P] [US2] Thêm `confirmCheckout(sessionId, inspectionId)` → `POST /v1/staff/sessions/:id/confirm-checkout` vào `rcfeild-fe/src/features/staff/api/staff.api.ts`
- [X] T023 [P] [US2] Thêm `updateDamageItems(sessionId, inspectionId, items)` → `PUT /v1/staff/sessions/:id/inspections/:inspId/damage-items` vào `rcfeild-fe/src/features/staff/api/staff.api.ts`
- [X] T024 [P] [US2] Thêm `escalateDispute(sessionId, inspectionId, note)` → `POST /v1/staff/sessions/:id/escalate-dispute` vào `rcfeild-fe/src/features/staff/api/staff.api.ts`

**Checkpoint**: Staff lưu biên bản → màn hình summary hiển thị đúng ảnh và breakdown → bấm Xác nhận → session COMPLETED → `settlePendingPayments` có thể được gọi sau.

---

## Phase 4: User Story 3 — Provider xem lịch sử đền bù (Priority: P3)

**Goal**: Provider xem được breakdown hạng mục hư hỏng và tổng đền bù trong chi tiết booking.

**Independent Test**: Đăng nhập Provider → mở booking detail có hư hỏng → thấy section "Đền bù hư hỏng" với từng hạng mục và tổng.

### BE — User Story 3

- [X] T025 [US3] Cập nhật booking detail response cho PROVIDER role (tìm file service/controller phục vụ `GET /v1/provider/bookings/:id`): include `damageBreakdown: { lineItems[], totalDamageCharge, status }` khi booking có inspection với `damageNoted=true`

### FE — User Story 3

- [X] T026 [US3] Thêm section "Đền bù hư hỏng" vào Provider booking detail page (`rcfeild-fe/src/pages/provider/` — tìm file ProviderBookingDetailPage hoặc tương đương): hiển thị bảng từng hạng mục (tên bộ phận, giá linh kiện, phí công, thành tiền) và tổng; hiển thị trạng thái (Đã thu / Vượt ký quỹ – thu thêm / Tranh chấp đang xử lý)

**Checkpoint**: Provider thấy breakdown damage trong chi tiết booking đã COMPLETED.

---

## Phase 5: Polish & Dọn dẹp

- [X] T027 Xoá hoặc redirect `CustomerDamageReviewPage` về `/customer/bookings` trong `rcfeild-fe/src/pages/customer/damage/CustomerDamageReviewPage.tsx` và cập nhật `rcfeild-fe/src/routes/routes.tsx` — page này dùng mock data, không thuộc flow mới
- [X] T028 Thêm spec 016 vào sidebar tại `website/sidebars-specs.ts` theo cấu trúc đã có cho các spec khác

---

## Dependencies & Execution Order

### Phase dependencies

- **Phase 1** (Setup): Không phụ thuộc gì — bắt đầu ngay
- **Phase 2** (US1): Phụ thuộc Phase 1 hoàn tất (cần DamageLineItem entity và migration)
- **Phase 3** (US2): Phụ thuộc Phase 2 (cần `submitInspection` đã nhận `damageLineItems` và lưu được)
- **Phase 4** (US3): Phụ thuộc Phase 2 (cần data có trong DB để hiển thị)
- **Phase 5** (Polish): Độc lập, chạy sau cùng

### Trong Phase 2 (US1)

- T005 → T006 (cùng file, T006 đọc line items do T005 tạo ra)
- T005 → T007 (validate trước khi service xử lý)
- T008 và T009 có thể chạy song song (khác file)
- T009 → T010 (T010 dùng API function từ T009)

### Trong Phase 3 (US2)

- T011, T012, T013 có thể song song (3 functions độc lập trong cùng file)
- T014, T015, T016 có thể song song (3 handlers độc lập)
- T011–T016 → T017 (register routes sau khi có handlers)
- T019 → T020 → T021 (page → route → navigation update)
- T022, T023, T024 có thể song song (3 API functions độc lập)
- T019 phụ thuộc T022, T023, T024 (page dùng các API functions này)

---

## Parallel Opportunities

```bash
# Phase 1 — song song:
T002: Create DamageLineItem entity
T003: Add relation to Inspection entity

# Phase 2 (US1) — song song:
T008: FE slider → line-item form
T009: FE API body update

# Phase 3 (US2 BE) — song song:
T011: staffConfirmCheckout
T012: updateDamageLineItems
T013: escalateDisputeToProvider

T014: confirm-checkout handler
T015: update-damage-items handler
T016: escalate-dispute handler

T022: confirmCheckout API fn
T023: updateDamageItems API fn
T024: escalateDispute API fn
```

---

## Implementation Strategy

### MVP (US1 only — P1)

1. Phase 1: Setup data layer
2. Phase 2: US1 — BE sửa submit + settlement, FE thay slider
3. **Validate**: Staff submit CHECK_OUT có line items → DB đúng → settlement tính đúng
4. MVP delivered: damage charge phản ánh giá linh kiện thực tế

### Incremental

1. Setup + US1 → damage data accurate ✅
2. US2 → in-person confirmation flow ✅
3. US3 → Provider visibility ✅
4. Polish → cleanup dead code ✅

---

## Notes

- Tổng tasks: **28 tasks** (T001–T028)
- US1: 6 tasks | US2: 14 tasks | US3: 2 tasks | Polish: 2 tasks | Setup: 4 tasks
- Parallel opportunities: 10 tasks có thể chạy song song
- Không có test tasks (spec không yêu cầu TDD explicit) — dùng quickstart.md để manual test
- T005 là task quan trọng nhất: breaking change cho `submitInspection` và STAFF_MANUAL auto-settle
- T025–T026 (US3): cần tìm đúng file Provider service/page trước khi implement
