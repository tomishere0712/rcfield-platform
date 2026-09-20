# Tasks: Staff KPI Dashboard

**Input**: Design documents từ `specs/014-staff-kpi-dashboard/`  
**Spec**: spec.md | **Plan**: plan.md | **Contracts**: contracts/api.md | **Data Model**: data-model.md

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Có thể chạy song song (file khác nhau, không dependency)
- **[US1]**: KPI tổng quan (P1) | **[US2]**: Activity Timeline (P2)

---

## Phase 1: Setup — Xác định routing và kiến trúc

**Purpose**: Verify điểm mount route và pattern hiện có trước khi thêm code mới.

- [X] T001 Đọc `rcfeild-be/src/routes/provider-subscription.routes.ts` để hiểu pattern hiện có (middleware order: authenticate → authorize(PROVIDER) → requireActiveProvider → handler)
- [X] T002 Đọc `rcfeild-be/src/controllers/staff.controller.ts` để hiểu controller pattern (response format, error propagation)

---

## Phase 2: Foundational — Backend Authorization Helper

**Purpose**: Helper dùng chung cho cả 3 endpoint mới. PHẢI hoàn thành trước khi implement US1 và US2.

**⚠️ CRITICAL**: Không bắt đầu Phase 3/4 cho đến khi T003 xong.

- [X] T003 Thêm private helper `assertStaffBelongsToProvider(providerId, staffId)` vào `rcfeild-be/src/services/staff.service.ts` — SQL: `JOIN staff_cafe_assignments a ON a.staff_id = $staffId JOIN cafes c ON c.id = a.cafe_id WHERE c.provider_id = $providerId AND a.is_active = true`, throw `AppError('Forbidden', 403, 'FORBIDDEN')` nếu 0 rows

**Checkpoint**: Helper xong → Phase 3 và 4 có thể chạy song song

---

## Phase 3: User Story 1 — KPI Tổng Quan (Priority: P1) 🎯 MVP

**Goal**: Provider xem profile + 5 KPI card (check-ins, FnB, extensions, on-time rate, active days) với period filter 7d/30d/90d

**Independent Test**: Gọi `GET /v1/provider/staff/:staffId/kpi?period=30d` → trả về JSON với 5 fields. Mở `/provider/staff/:staffId` → thấy 5 card với số thực.

### Backend US1

- [X] T004 [P] [US1] Thêm service method `getStaffDetail(providerId, staffId): Promise<StaffDetailProfile>` vào `rcfeild-be/src/services/staff.service.ts` — gọi `assertStaffBelongsToProvider`, query users + staff_cafe_assignments + cafes, trả về: id, fullName, email, phone, cafeName, cafeId, status, createdAt, activatedAt, lastActiveAt
- [X] T005 [P] [US1] Thêm service method `getStaffKpi(providerId, staffId, period): Promise<StaffKpiSummary>` vào `rcfeild-be/src/services/staff.service.ts` — gọi `assertStaffBelongsToProvider`, chạy 5 aggregate queries: (1) COUNT sessions WHERE checked_in_by=$staffId AND created_at>=since, (2) COUNT fnb_orders WHERE created_by=$staffId AND status='DELIVERED' AND created_at>=since, (3) COUNT extension_proposals WHERE proposed_by=$staffId AND status='APPROVED' AND created_at>=since, (4) on-time rate: COUNT sessions WHERE created_at BETWEEN slot_start-15min AND slot_start+15min / NULLIF(total,0)*100, (5) activeDaysCount: COUNT DISTINCT DATE(event_time) UNION từ 3 bảng
- [X] T006 [US1] Thêm controller handlers `getStaffDetail` và `getStaffKpi` vào `rcfeild-be/src/controllers/staff.controller.ts` — validate `period` query param (enum: '7d','30d','90d', default '30d'), gọi service, wrap response `{ success: true, data: ... }`
- [X] T007 [US1] Thêm 2 routes vào `rcfeild-be/src/routes/provider-subscription.routes.ts`: `GET /staff/:staffId` → `staffController.getStaffDetail` và `GET /staff/:staffId/kpi` → `staffController.getStaffKpi` — cùng middleware chain: `requireActiveProvider`

### Frontend US1

- [X] T008 [P] [US1] Thêm TypeScript interfaces và API functions vào `rcfield-fe/src/features/staff/api/staff.api.ts`: interface `StaffDetailProfile`, interface `StaffKpiSummary`, `getStaffDetail(staffId)`, `getStaffKpi(staffId, period)`, thêm queryKeys: `staffDetail: (staffId) => [...]`, `staffKpi: (staffId, period) => [...]`
- [ ] T009 [US1] Tạo `rcfield-fe/src/pages/provider/ProviderStaffDetailPage.tsx` với: (a) profile header (avatar chữ cái đầu + online dot từ lastActiveAt + tên + email + phone + cafeName + status badge + ngày tham gia), (b) period selector tabs [7 ngày / 30 ngày / 90 ngày] với useState('30d'), (c) 5 KPI card dùng `useQuery(staffQueryKeys.staffKpi(staffId, period))` — hiển thị skeleton animate-pulse khi isLoading, (d) nút "← Quay lại" navigate(-1). Màu sắc theo provider color system: bg-[#fcf8f8], text-[#1c1b1b], accent orange-600
- [ ] T010 [US1] Thêm route `/provider/staff/:staffId` vào router của frontend (tìm file router trong `rcfield-fe/src/app/router/`) — lazy import `ProviderStaffDetailPage`, bảo vệ bởi ProviderGuard/PrivateRoute
- [ ] T011 [US1] Thêm mục "Xem chi tiết" vào đầu dropdown menu "..." trong `StaffCard` component (`rcfield-fe/src/pages/provider/ProviderStaffPage.tsx`) — dùng `useNavigate()` hoặc `<Link>` đến `/provider/staff/${staff.id}`, hiển thị icon `Eye` từ lucide-react, áp dụng cho mọi status

**Checkpoint**: US1 hoàn chỉnh — Provider có thể xem profile + 5 KPI với period filter

---

## Phase 4: User Story 2 — Activity Timeline (Priority: P2)

**Goal**: Provider xem lịch sử 3 loại sự kiện nghiệp vụ của nhân viên, phân trang "Tải thêm"

**Independent Test**: Gọi `GET /v1/provider/staff/:staffId/activity?limit=20&offset=0` → trả về `{ events: [...], total: N, hasMore: bool }`. Timeline section hiển thị đúng thứ tự newest-first.

### Backend US2

- [ ] T012 [US2] Thêm service method `getStaffActivity(providerId, staffId, limit, offset): Promise<StaffActivityPage>` vào `rcfeild-be/src/services/staff.service.ts` — gọi `assertStaffBelongsToProvider`, chạy UNION ALL query: SELECT 'CHECK_IN' + s.id + s.created_at + COALESCE(b.short_code,'Booking') FROM sessions JOIN bookings UNION ALL SELECT 'FNB_ORDER' + fo.id + fo.created_at + label FROM fnb_orders UNION ALL SELECT 'EXTENSION_APPROVED' + ep.id + ep.created_at + 'Gia hạn +'+duration_minutes+'phút' FROM extension_proposals WHERE status='APPROVED' ORDER BY event_time DESC LIMIT $limit OFFSET $offset; COUNT tổng riêng để tính hasMore
- [ ] T013 [US2] Thêm controller handler `getStaffActivity` vào `rcfeild-be/src/controllers/staff.controller.ts` — validate limit (max 50, default 20) và offset (default 0, integer), gọi service
- [ ] T014 [US2] Thêm route `GET /staff/:staffId/activity` vào `rcfeild-be/src/routes/provider-subscription.routes.ts` → `staffController.getStaffActivity` với middleware `requireActiveProvider`

### Frontend US2

- [ ] T015 [P] [US2] Thêm interface `StaffActivityEvent`, `StaffActivityPage` và function `getStaffActivity(staffId, limit, offset)` vào `rcfield-fe/src/features/staff/api/staff.api.ts`, thêm queryKey `staffActivity: (staffId) => [...]`
- [ ] T016 [US2] Thêm section "Lịch sử hoạt động" vào `rcfield-fe/src/pages/provider/ProviderStaffDetailPage.tsx` — dùng `useInfiniteQuery` hoặc manual pagination với useState offset, hiển thị event list: icon theo type (CheckCircle2=CHECK_IN, Utensils=FNB_ORDER, Clock=EXTENSION_APPROVED), label, thời gian format "dd/MM HH:mm", nút "Tải thêm" khi hasMore=true, empty state khi 0 events

**Checkpoint**: US1 + US2 hoàn chỉnh

---

## Phase 5: Polish & Cross-Cutting

- [ ] T017 [P] Kiểm tra skeleton KPI cards không gây CLS (layout shift) — đảm bảo skeleton div có cùng height với card thực trong `ProviderStaffDetailPage.tsx`
- [ ] T018 [P] Xử lý error state: khi API trả 403 → redirect về `/provider/staff` + toast "Không có quyền xem nhân viên này", khi 404 → hiển thị "Không tìm thấy nhân viên" trong `ProviderStaffDetailPage.tsx`
- [ ] T019 Chạy 8 E2E scenarios trong `specs/014-staff-kpi-dashboard/quickstart.md` và verify unit test checklist (7 items)
- [ ] T020 [P] Cập nhật `website/sidebars-specs.ts` để thêm sidebar entry cho `014-staff-kpi-dashboard`

---

## Dependencies & Execution Order

```
T001, T002 (Setup — đọc code) → song song
     ↓
T003 (Foundational — assertStaffBelongsToProvider) — BLOCKING
     ↓
┌────────────────────────┬─────────────────────────┐
│  US1 Backend           │  US1 Frontend            │
│  T004 [P] service KPI  │  T008 [P] types + API   │
│  T005 [P] service kpi  │                          │
│  T006 controller       │  T009 router             │
│  T007 routes           │  T010 detail page        │
│                        │  T011 menu "..."         │
└────────────────────────┴─────────────────────────┘
     ↓ (US1 complete)
┌────────────────────────┬─────────────────────────┐
│  US2 Backend           │  US2 Frontend            │
│  T012 service activity │  T015 [P] types + API   │
│  T013 controller       │  T016 timeline section  │
│  T014 routes           │                          │
└────────────────────────┴─────────────────────────┘
     ↓
T017, T018, T019, T020 (Polish — song song)
```

### Parallel Opportunities

**Phase 3 (US1)**:
- T004 + T005 + T008 có thể chạy song song (file khác nhau)
- Backend (T004→T007) và Frontend (T008→T011) có thể chạy song song sau T003

**Phase 4 (US2)**:
- T012 + T015 song song (backend service + frontend types)

---

## Implementation Strategy

### MVP (US1 only — ~4h)

1. T001, T002 — đọc code (~15 phút)
2. T003 — auth helper (~20 phút)
3. T004 + T005 song song — 2 service methods (~45 phút)
4. T006 — controller handlers (~20 phút)
5. T007 — routes (~10 phút)
6. T008 + T009 song song — types + router (~20 phút)
7. T010 — ProviderStaffDetailPage (~90 phút)
8. T011 — thêm menu item (~15 phút)
9. **VALIDATE**: Test S1, S2, S3, S7, S8 từ quickstart.md

### Full Feature (US1 + US2)

- Sau MVP, thêm T012→T016 (~90 phút)
- Chạy đầy đủ 8 scenarios

---

## Notes

- `/provider/staff` routes nằm trong `provider-subscription.routes.ts` (mounted tại `/provider`)
- Controller dùng chung: `staff.controller.ts`
- KPI #5 = `activeDaysCount` (số ngày có activity) — KHÔNG phải phút online
- On-time window = ±15 phút quanh `slot_start` (cả sớm lẫn muộn)
- Navigation vào detail page: qua menu "..." → "Xem chi tiết" (không phải click cả card)
- Provider color system: bg-[#fcf8f8], text-[#1c1b1b], accent orange, gray tones #747878/#c4c7c8
