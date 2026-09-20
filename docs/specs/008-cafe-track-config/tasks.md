# Tasks: Cafe Track Config

**Input**: Design documents from `specs/008-cafe-track-config/`
**Branch**: `003-fb-messenger-channel`

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Có thể chạy song song (file khác nhau, không phụ thuộc nhau)
- **[Story]**: User story tương ứng (US1–US4)
- Paths dùng tên folder thực tế: `rcfeild-be/` (backend), `rcfield-fe/` (frontend)

---

## Phase 1: Setup

**Purpose**: Tạo file migration + entity mới. Không thay đổi code hiện tại.

- [X] T001 Create TypeORM migration file for `cafe_track_configs` table and `bookings.track_config_id` column in `rcfeild-be/src/migrations/` (see data-model.md for full SQL)
- [X] T002 [P] Create `CafeTrackConfig` TypeORM entity in `rcfeild-be/src/models/cafe-track-config.entity.ts` — fields: id, cafe_id, track_type_id, byoc_capacity, images (text[]), description, sort_order, is_active, created_at, updated_at, deleted_at

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema + validation schemas phải xong trước khi implement bất kỳ user story nào.

**⚠️ CRITICAL**: Không làm Phase 3+ trước khi phase này xong.

- [ ] T003 Run migration to create `cafe_track_configs` table and add `track_config_id` column to `bookings` in `rcfeild-be/` — verify table exists with `\d cafe_track_configs` in psql
- [X] T004 [P] Add `CreateCafeTrackConfigSchema` and `UpdateCafeTrackConfigSchema` (with `is_active: z.boolean().optional()`) to `rcfeild-be/src/validate/index.ts`
- [X] T005 [P] Update `CheckAvailabilitySchema` in `rcfeild-be/src/validate/index.ts` — add `track_config_id: z.string().uuid().optional()`
- [X] T006 [P] Update `CreateBookingSchema` in `rcfeild-be/src/validate/index.ts` — replace `track_type_id: z.string().uuid().optional()` with `track_config_id: z.string().uuid()` (required)

**Checkpoint**: Migration chạy thành công, schemas compile không lỗi TypeScript.

---

## Phase 3: User Story 1 — Provider Configures Track Types (Priority: P1) 🎯 MVP

**Goal**: Provider có thể thêm/sửa/xóa loại sân cho chi nhánh, upload ảnh, toggle active/inactive.

**Independent Test**: Provider đăng nhập → `POST /api/v1/cafes/:cafeId/track-configs` → nhận 201 với `images: []` → `POST .../images` upload 1 ảnh → `GET /api/v1/cafes/:cafeId/track-configs` (no auth) trả về 1 config với ảnh → `PATCH .../` với `is_active: false` → config biến mất khỏi public listing.

### Backend — US1

- [X] T007 [US1] Implement `CafeTrackConfigService` in `rcfeild-be/src/services/cafe-track-config.service.ts` — methods: `create`, `listForCafe(cafeId, isProvider)`, `update` (with deactivation guard), `uploadImages`, `findOne`
- [X] T008 [P] [US1] Implement `CafeTrackConfigController` in `rcfeild-be/src/controllers/cafe-track-config.controller.ts` — handlers: `listConfigs`, `createConfig`, `updateConfig`, `uploadImages` (multer + Cloudinary, same pattern as `cafe-image.controller.ts`)
- [X] T009 [US1] Mount track config routes under `/:cafeId/track-configs` in `rcfeild-be/src/routes/cafe.routes.ts` — GET (optionalAuthenticate), POST/PATCH/DELETE images (authenticate + authorize PROVIDER + requireActiveProvider)

### Frontend — US1

- [X] T010 [P] [US1] Add track config API functions to `rcfield-fe/src/features/cafes/api/cafe.api.ts` — `listTrackConfigs(cafeId, token?)`, `createTrackConfig(cafeId, body, token)`, `updateTrackConfig(cafeId, id, body, token)`, `uploadTrackConfigImages(cafeId, id, files, token)`
- [X] T011 [P] [US1] Create `useTrackConfigs` React Query hook in `rcfield-fe/src/features/cafes/hooks/useTrackConfigs.ts` — useQuery for list, useMutation for create/update/upload
- [X] T012 [US1] Create `TrackConfigManager` component in `rcfield-fe/src/pages/provider/components/TrackConfigManager.tsx` — list all configs (active + inactive), add/edit form (track type selector, byoc_capacity input, description), image uploader, toggle active/inactive button with confirmation dialog when deactivating
- [X] T013 [US1] Integrate `TrackConfigManager` into `rcfield-fe/src/pages/provider/ProviderCafeDetailPage.tsx` — add new tab or section "Loại sân" alongside existing tabs

**Checkpoint**: Provider có thể tạo config, upload ảnh, deactivate, reactivate qua UI. Public GET chỉ trả config có ảnh.

---

## Phase 4: User Story 3 — Customer Selects Track When Booking (Priority: P1)

**Goal**: Booking flow thêm bước chọn loại sân đầu tiên. Availability check dùng per-track capacity. Booking creation validate xe tương thích.

**Independent Test**: Customer chọn sân "DRIFT" → chọn RENTAL → chỉ thấy xe có `compatible_track_types` bao gồm DRIFT → tạo booking thành công với `track_config_id` trong snapshot.

**Depends on**: Phase 3 (US1 backend — `cafe_track_configs` phải có data).

### Backend — US3

- [X] T014 [US3] Update `getAvailability` in `rcfeild-be/src/controllers/cafe.controller.ts` — BYOC: khi có `track_config_id`, đọc `byoc_capacity` từ `cafe_track_configs`, dùng overlap query (`slot_start < req_end AND slot_end > req_start AND track_config_id = :id`); RENTAL: filter vehicles thêm bước check `catalog.compatibleTrackTypes.includes(trackConfig.trackTypeId)`
- [X] T015 [US3] Update `createBooking` in `rcfeild-be/src/services/booking.service.ts` — validate `track_config_id` tồn tại + `is_active = true` + thuộc đúng `cafe_id`; validate xe RENTAL compatible với `trackConfig.trackTypeId`; thêm `track_config_id`, `track_type_id`, `track_type_code`, `track_type_name`, `byoc_capacity_at_booking` vào `booking.snapshot`

### Frontend — US3

- [X] T016 [P] [US3] Create `TrackSelectionStep` component in `rcfield-fe/src/pages/booking/components/checkout/TrackSelectionStep.tsx` — hiển thị danh sách track configs của cafe (từ `useTrackConfigs`), mỗi card có ảnh swipeable/carousel, tên, BYOC capacity; customer click để chọn
- [X] T017 [US3] Update `CheckoutStepper.tsx` in `rcfield-fe/src/pages/booking/components/checkout/CheckoutStepper.tsx` — thêm "Chọn sân" là bước 0 trước bước hiện tại (mode/vehicle selection)
- [X] T018 [US3] Update `CreateBookingPage.tsx` in `rcfield-fe/src/pages/booking/CreateBookingPage.tsx` — thêm state `selectedTrackConfig: TrackConfig | null`; pass `track_config_id` khi gọi `createBooking`; availability check call thêm `track_config_id` param
- [X] T019 [US3] Update `CheckoutSummaryCard.tsx` in `rcfield-fe/src/pages/booking/components/checkout/CheckoutSummaryCard.tsx` — thêm dòng hiển thị loại sân đã chọn (track type name + ảnh thumbnail)
- [X] T020 [US3] Update `booking.api.ts` in `rcfield-fe/src/features/booking/api/booking.api.ts` — thêm `track_config_id` vào `createBooking` request body type

**Checkpoint**: Customer chọn sân → chọn mode/xe → checkout. Booking được tạo với `track_config_id`. Xe không tương thích bị ẩn.

---

## Phase 5: User Story 2 — Customer Views Track Types on Branch Page (Priority: P2)

**Goal**: Trang chi tiết chi nhánh hiển thị phần "Các loại sân" với ảnh swipeable, tên, mô tả, BYOC capacity.

**Independent Test**: Customer (không đăng nhập) vào trang chi nhánh → thấy section "Loại sân" với danh sách track configs có ảnh.

**Depends on**: Phase 3 US1 backend (API phải trả data).

### Frontend — US2

- [X] T021 [P] [US2] Create `TrackConfigList` component in `rcfield-fe/src/pages/customer/cafe-detail/components/TrackConfigList.tsx` — hiển thị danh sách track configs (public, chỉ active + có ảnh): card với image carousel (swipeable), tên track type, BYOC capacity, mô tả ngắn
- [X] T022 [US2] Integrate `TrackConfigList` into `rcfield-fe/src/pages/customer/cafe-detail/components/CafeDetailContent.tsx` — thêm section "Loại sân" sau hero, trước vehicles section; ẩn section khi `data.length === 0`

**Checkpoint**: Trang chi nhánh hiển thị đúng track configs. Khi không có config, section bị ẩn.

---

## Phase 6: User Story 4 — Multi-Slot Booking (Priority: P2)

**Goal**: Customer chọn 1 slot làm giờ bắt đầu, sau đó chọn số giờ (1–8) qua stepper. Availability check cho toàn bộ range.

**Independent Test**: Customer click slot 9h → stepper hiện 1h/2h/3h... → chọn 3h → booking tạo với `slot_start=9h, slot_end=12h`. Nếu slot 10h hết chỗ, option "3 giờ" và trên bị disabled.

**Depends on**: Phase 4 US3 (slot selection nằm trong booking flow).

### Frontend — US4

- [X] T023 [US4] Update `DailySlotGrid.tsx` in `rcfield-fe/src/pages/customer/cafe-detail/components/DailySlotGrid.tsx` — khi customer click 1 slot: show inline duration stepper (1h, 2h, ... 8h); tính toán disabled options dựa trên availability của các slot tiếp theo trong range; confirm selection → trả về `{ slotStart, slotEnd }`
- [X] T024 [US4] Update `CafeBookingCard.tsx` in `rcfield-fe/src/pages/customer/cafe-detail/components/CafeBookingCard.tsx` — nhận `{ slotStart, slotEnd }` từ DailySlotGrid thay vì chỉ `slotStart`; truyền cả hai sang CreateBookingPage
- [X] T025 [US4] Update `ScheduleStep.tsx` in `rcfield-fe/src/pages/booking/components/checkout/ScheduleStep.tsx` — nếu ScheduleStep cũng có slot grid, áp dụng tương tự T023 (hoặc reuse DailySlotGrid component đã cập nhật)

### Backend — US4

- [X] T026 [US4] Add slot range validation in `rcfeild-be/src/services/booking.service.ts` — validate: `slot_end > slot_start`, `(slot_end - slot_start)` ≤ 8 × `cafe.slotDurationMinutes`, range phải aligned với `slot_duration_minutes` (e.g. bắt đầu đúng giờ, kết thúc đúng giờ)

**Checkpoint**: Customer book 3 tiếng liên tiếp thành công. Slot bị occupied bị disabled trong stepper.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T027 Write data migration seed script in `rcfeild-be/src/` (script hoặc TypeORM seeder) — backfill `track_config_id` vào booking hiện tại theo `cafe_id + track_type_id` match (xem data-model.md migration step 2)
- [X] T028 [P] Update `CafeBookingCard.tsx` availability API call in `rcfield-fe/src/pages/customer/cafe-detail/components/CafeBookingCard.tsx` — thêm `track_config_id` param khi đã có track được chọn từ `TrackSelectionStep`
- [X] T029 [P] Add error handling for `VEHICLE_TRACK_INCOMPATIBLE` and `TRACK_CONFIG_NOT_FOUND` in frontend booking flow `rcfield-fe/src/pages/booking/CreateBookingPage.tsx` — hiển thị thông báo lỗi tiếng Việt

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: T001, T002 — chạy ngay, không phụ thuộc
- **Foundational (Phase 2)**: T003–T006 — phụ thuộc Phase 1. **BLOCKS tất cả user stories**
- **US1 (Phase 3)**: T007–T013 — phụ thuộc Phase 2
- **US3 (Phase 4)**: T014–T020 — phụ thuộc Phase 3 backend (T007–T009)
- **US2 (Phase 5)**: T021–T022 — phụ thuộc Phase 3 backend (T007–T009)
- **US4 (Phase 6)**: T023–T026 — phụ thuộc Phase 4 (T017–T018 booking flow)
- **Polish (Phase 7)**: T027–T029 — phụ thuộc tất cả phases

### User Story Dependencies

- **US1 (P1)**: Bắt đầu sau Foundational — không phụ thuộc US nào khác
- **US3 (P1)**: Bắt đầu sau US1 backend done (T007–T009)
- **US2 (P2)**: Bắt đầu sau US1 backend done (T007–T009) — song song với US3
- **US4 (P2)**: Bắt đầu sau US3 frontend done (T017–T018)

### Parallel Opportunities

```
Phase 1:  T001 ‖ T002
Phase 2:  T003 → (T004 ‖ T005 ‖ T006)
Phase 3:  T007 → T008 ‖ (T010 ‖ T011) → T009 → T012 → T013
Phase 4:  T014 ‖ T015 ‖ (T016 ‖ T019 ‖ T020) → T017 → T018
Phase 5:  T021 → T022   (song song với Phase 4)
Phase 6:  (T023 ‖ T025 ‖ T026) → T024
Phase 7:  T027 ‖ T028 ‖ T029
```

---

## Implementation Strategy

### MVP (US1 + US3 — cả hai P1)

1. Phase 1: Setup
2. Phase 2: Foundational
3. Phase 3: US1 backend (T007–T009) → verify API hoạt động
4. Phase 4: US3 backend (T014–T015) → verify booking creation với track_config_id
5. Phase 3: US1 frontend (T010–T013) → provider có thể config sân
6. Phase 4: US3 frontend (T016–T020) → customer chọn sân khi booking
7. **STOP & VALIDATE**: chạy E2E scenarios 1, 3, 4 từ quickstart.md

### Full Delivery (thêm US2 + US4)

8. Phase 5: US2 (T021–T022) → branch page hiển thị track list
9. Phase 6: US4 (T023–T026) → multi-slot booking
10. Phase 7: Polish (T027–T029)

---

## Notes

- Tổng: **29 tasks** — 2 setup, 4 foundational, 7 US1, 7 US3, 2 US2, 4 US4, 3 polish
- Image upload pattern: xem `rcfeild-be/src/controllers/cafe-image.controller.ts` và `rcfeild-be/src/services/cafe-image.service.ts` để copy pattern Cloudinary
- Track config entity pattern: xem `rcfeild-be/src/models/cafe-image.entity.ts` để tham khảo
- Frontend API pattern: xem `rcfield-fe/src/features/cafes/api/cafe.api.ts` để thêm track config endpoints theo cùng pattern
- `is_active` toggle (deactivation guard): service check `bookings WHERE track_config_id = :id AND status IN (PENDING, CONFIRMED) AND slot_start > NOW()`
- Reactivation không cần guard — luôn cho phép
