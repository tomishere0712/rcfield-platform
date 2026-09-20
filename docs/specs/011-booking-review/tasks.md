# Tasks: Booking Review & Rating

**Input**: Design documents from `specs/011-booking-review/`  
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Contracts**: [contracts/api.md](contracts/api.md)

---

## Phase 1: Setup

**Purpose**: Migration file + frontend feature folder scaffolding

- [X] T001 Create migration file `1752100000000-AddReviewTables.ts` (reviews table + bookings.completed_at + bookings.review_dismissed_at) in `rcfeild-be/src/migrations/1752100000000-AddReviewTables.ts`
- [X] T002 [P] Create frontend feature folder `rcfield-fe/src/features/booking-review/` with empty index files for `api/`, `hooks/`, `components/`, `types.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Entities, types, and validation schemas shared by all user stories

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T003 Add `completedAt: Date | null` and `reviewDismissedAt: Date | null` columns to Booking entity in `rcfeild-be/src/models/booking.entity.ts`
- [X] T004 [P] Create `Review` TypeORM entity (`@Entity('reviews')`, all columns per data-model.md) in `rcfeild-be/src/models/review.entity.ts`
- [X] T005 [P] Add `ReviewStatus` type alias (`'VISIBLE' | 'HIDDEN'`) and `'BOOKING_REVIEW_REQUEST'` to `NotificationType` union in `rcfeild-be/src/types/index.ts`
- [X] T006 [P] Add `CreateReviewSchema` and `UpdateReviewVisibilitySchema` (Zod) under `// ── reviews ──` section in `rcfeild-be/src/validate/index.ts`
- [X] T007 [P] Create frontend shared type definitions (`Review`, `ReviewAggregate`, `PendingBookingReview`) in `rcfield-fe/src/features/booking-review/types.ts`

**Checkpoint**: Foundation ready — all user story phases can now begin

---

## Phase 3: User Story 1 — Khách đánh giá sau khi hoàn thành booking (P1) 🎯 MVP

**Goal**: Khách nhận thông báo sau khi booking COMPLETED, mở form, submit đánh giá, hệ thống lưu và không cho submit lại.

**Independent Test**: Tạo 1 booking COMPLETED → nhận BOOKING_REVIEW_REQUEST noti → submit form → kiểm tra review được lưu, GET /customer/reviews/pending không còn trả về booking đó.

### Implementation — Backend US1

- [X] T008 [P] [US1] Implement `createReview()` in `rcfeild-be/src/services/review.service.ts` — ownership check, COMPLETED status check, 7-day deadline check (`completed_at`), BYOC force `vehicle_score=null`, insert review
- [X] T009 [P] [US1] Implement `dismissReview()` and `getPendingReviews()` in `rcfeild-be/src/services/review.service.ts` — dismiss sets `booking.review_dismissed_at`; pending filters COMPLETED + no review + no dismissal + within 7 days
- [X] T010 [US1] Modify checkout flow in `rcfeild-be/src/services/staff.service.ts` — set `booking.completedAt = new Date()` and call `createNotification(customerId, 'BOOKING_REVIEW_REQUEST', ...)` + `wsService.pushToUser(...)` when session reaches COMPLETED; skip if `booking.source === BookingSource.STAFF_MANUAL`
- [X] T011 [US1] Create customer review controller handlers (`submitReview`, `dismissReview`, `listPending`) in `rcfeild-be/src/controllers/review.controller.ts`
- [X] T012 [US1] Create `review.routes.ts` (POST `/customer/reviews`, POST `/customer/reviews/:bookingId/dismiss`, GET `/customer/reviews/pending`) and register router in `rcfeild-be/src/routes/index.ts`

### Implementation — Frontend US1

- [X] T013 [P] [US1] Create API wrappers `submitReview()`, `dismissReview()`, `getPendingReviews()` in `rcfield-fe/src/features/booking-review/api/review.api.ts`
- [X] T014 [P] [US1] Create `StarRating` component (input mode: clickable stars; display mode: read-only) in `rcfield-fe/src/features/booking-review/components/StarRating.tsx`
- [X] T015 [US1] Create `ReviewFormModal` — BYOC-aware (hide vehicle criterion when `play_mode=BYOC`), note field (max 500 chars), disable submit button on click, expired inline message "Thời hạn đánh giá đã hết (7 ngày)" + back button when server returns `REVIEW_PERIOD_EXPIRED` — in `rcfield-fe/src/features/booking-review/components/ReviewFormModal.tsx`
- [X] T016 [P] [US1] Create `usePendingReviews` React Query hook in `rcfield-fe/src/features/booking-review/hooks/usePendingReviews.ts`
- [X] T017 [P] [US1] Create `useSubmitReview` and `useDismissReview` mutations (with `pending-reviews` cache invalidation on success) in `rcfield-fe/src/features/booking-review/hooks/useSubmitReview.ts` and `rcfield-fe/src/features/booking-review/hooks/useDismissReview.ts`
- [X] T018 [US1] Add `'BOOKING_REVIEW_REQUEST'` to notification type union and wire click routing to open `ReviewFormModal` in `rcfield-fe/src/features/notifications/types/index.ts` and `rcfield-fe/src/features/notifications/components/NotificationBell.tsx`

**Checkpoint**: US1 fully testable — submit review end-to-end without reminder banner

---

## Phase 4: User Story 2 — In-app reminder khi vào web (P1)

**Goal**: Khi khách đăng nhập và có booking chưa đánh giá (chưa dismissed, còn hạn), hiển thị banner nhắc nhở tối đa 1 booking (gần nhất).

**Independent Test**: Tạo booking COMPLETED → không nhấn noti → đăng nhập lại → banner xuất hiện trên CustomerBookingsPage với tên chi nhánh và nút "Đánh giá ngay"; nhấn "Bỏ qua" → banner biến mất vĩnh viễn.

- [X] T019 [US2] Create `ReviewReminderBanner` component — shows cafe name, slot time, "Đánh giá ngay" button (opens `ReviewFormModal`), "Bỏ qua" button (calls `useDismissReview`) — in `rcfield-fe/src/features/booking-review/components/ReviewReminderBanner.tsx`
- [X] T020 [P] [US2] Inject `ReviewReminderBanner` at top of `CustomerBookingsPage` — uses `usePendingReviews`, shows first result only — in `rcfield-fe/src/pages/customer/CustomerBookingsPage.tsx`
- [X] T021 [P] [US2] Inject `ReviewReminderBanner` at top of `CustomerHomePage` — same hook, same first-result logic — in `rcfield-fe/src/pages/customer/CustomerHomePage.tsx`

**Checkpoint**: US1 + US2 both working — full customer review flow complete

---

## Phase 5: User Story 3 — Khách xem rating công khai của chi nhánh (P2)

**Goal**: Trang chi nhánh hiển thị điểm rating tổng + 3 tiêu chí + danh sách 10 review gần nhất (không cần đăng nhập).

**Independent Test**: Chi nhánh có ≥1 review VISIBLE → vào trang chi nhánh không đăng nhập → thấy điểm tổng (1 chữ số thập phân), số lượng, danh sách review với tên dạng "Văn An N.".

### Implementation — Backend US3

- [X] T022 [P] [US3] Implement `maskName(fullName: string): string` helper (split by space → họ=token[0], rest=token[1..]; output `rest.join(' ') + ' ' + họ[0] + '.'`; single-token returns as-is) in `rcfeild-be/src/services/review.service.ts`
- [X] T023 [P] [US3] Implement `getCafeAggregate(cafeId)` — SQL AVG per score field filtered by `status='VISIBLE'`, rounded to 1 decimal; returns all null when `review_count=0` — in `rcfeild-be/src/services/review.service.ts`
- [X] T024 [P] [US3] Implement `getCafeReviews(cafeId, page, limit)` — paginated VISIBLE reviews with `maskName()` applied — in `rcfeild-be/src/services/review.service.ts`
- [X] T025 [US3] Add `getCafeReviews` handler to `rcfeild-be/src/controllers/cafe.controller.ts` and register public `GET /cafes/:cafeId/reviews` route in `rcfeild-be/src/routes/cafe.routes.ts`

### Implementation — Frontend US3

- [X] T026 [P] [US3] Add `getCafeReviews(cafeId, page)` API wrapper in `rcfield-fe/src/features/booking-review/api/review.api.ts`
- [X] T027 [P] [US3] Create `CafeRatingAggregate` component — shows avg score, star visual, review count, per-criterion breakdown bars; empty state "Chưa có đánh giá. Hãy là người đầu tiên!" — in `rcfield-fe/src/features/booking-review/components/CafeRatingAggregate.tsx`
- [X] T028 [P] [US3] Create `CafeReviewList` component — paginated list, `StarRating` display mode, masked name, note hidden when empty — in `rcfield-fe/src/features/booking-review/components/CafeReviewList.tsx`
- [X] T029 [US3] Inject `CafeRatingAggregate` + `CafeReviewList` into `CafeDetailContent.tsx` as a new section in `rcfield-fe/src/pages/customer/cafe-detail/components/CafeDetailContent.tsx`

**Checkpoint**: US3 testable — public rating visible on cafe detail page without login

---

## Phase 6: User Story 4 — Provider xem rating trong dashboard (P2)

**Goal**: Provider thấy điểm rating + review list cho chi nhánh trong dashboard, có thể ẩn review vi phạm.

**Independent Test**: Chi nhánh có ≥3 review → vào Provider Dashboard → thấy điểm rating; vào tab đánh giá → thấy danh sách; PATCH visibility → review bị ẩn, aggregate cập nhật ngay.

### Implementation — Backend US4

- [X] T030 [P] [US4] Implement `getProviderReviews(providerId, cafeId?, status?, page, limit)` — filter by provider's cafe IDs, include `new_since_24h` count — in `rcfeild-be/src/services/review.service.ts`
- [X] T031 [P] [US4] Implement `setVisibility(reviewId, providerId, status)` — scope check (review must belong to provider's cafe), throws `REVIEW_NOT_FOUND` if not — in `rcfeild-be/src/services/review.service.ts`
- [X] T032 [US4] Create provider review controller handlers (`listProviderReviews`, `updateVisibility`) and `provider-review.routes.ts` (GET `/provider/reviews`, PATCH `/provider/reviews/:reviewId/visibility`) then register in `rcfeild-be/src/routes/index.ts` in `rcfeild-be/src/routes/provider-review.routes.ts`

### Implementation — Frontend US4

- [X] T033 [P] [US4] Add provider API wrappers `getProviderReviews()` and `updateReviewVisibility()` in `rcfield-fe/src/features/booking-review/api/review.api.ts`
- [X] T034 [US4] Add "Đánh giá" tab to `ProviderCafeDetailPage.tsx` — paginated review list, hide/unhide button per row, status filter dropdown — in `rcfield-fe/src/pages/provider/ProviderCafeDetailPage.tsx`
- [X] T035 [US4] Add "Đánh giá" nav link in `ProviderShell.tsx` sidebar pointing to `?tab=reviews`; new badge shows when `newSince24h > 0` from `getProviderReviews` query — in `rcfield-fe/src/pages/provider/components/ProviderShell.tsx`

**Checkpoint**: All 4 user stories complete and independently testable

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T036 Wire `CustomerReviewsPage.tsx` to display the authenticated customer's own submitted reviews (needs a new `GET /customer/reviews` endpoint in `review.routes.ts` + `listCustomerReviews()` in `review.service.ts`) in `rcfield-fe/src/pages/customer/CustomerReviewsPage.tsx`
- [X] T037 [P] Verify `website/sidebars-specs.ts` has `011 · Booking Review & Rating` entry (already added — confirmed present at line 143)
- [ ] T038 [P] Run quickstart.md E2E scenarios manually and mark each passing

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 — **BLOCKS all user stories**
- **Phase 3 (US1)**: Depends on Phase 2 — no dependency on other user stories
- **Phase 4 (US2)**: Depends on Phase 3 (needs `usePendingReviews` hook + `ReviewFormModal`)
- **Phase 5 (US3)**: Depends on Phase 2 — independent from US1/US2
- **Phase 6 (US4)**: Depends on Phase 2 — independent from US1/US2/US3
- **Phase 7 (Polish)**: Depends on all desired stories complete

### User Story Dependencies

- **US1 (P1)**: Depends on Phase 2 — standalone
- **US2 (P1)**: Depends on US1 frontend (reuses `usePendingReviews`, `ReviewFormModal`)
- **US3 (P2)**: Depends on Phase 2 — standalone (separate service methods, separate route)
- **US4 (P2)**: Depends on Phase 2 — standalone (separate service methods, separate route)

### Parallel Opportunities Within Each Phase

- Phase 2: T004, T005, T006, T007 can all run in parallel
- Phase 3 backend: T008 and T009 can run in parallel; T010 can run in parallel with T008/T009
- Phase 3 frontend: T013, T014, T016, T017 can all run in parallel
- Phase 5 backend: T022, T023, T024 can run in parallel
- Phase 5 frontend: T026, T027, T028 can run in parallel
- Phase 6 backend: T030 and T031 can run in parallel
- Phase 6 frontend: T033 can run in parallel with T034

---

## Parallel Example: Phase 3 Backend

```
Parallel group A (no dependencies):
  Task T008: createReview() in review.service.ts
  Task T009: dismissReview() + getPendingReviews() in review.service.ts
  Task T010: staff.service.ts checkout hook

Sequential after A:
  Task T011: review.controller.ts (depends on T008, T009)
  Task T012: review.routes.ts + register (depends on T011)
```

---

## Implementation Strategy

### MVP First (US1 + US2 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL)
3. Complete Phase 3: US1 — submit review end-to-end
4. Complete Phase 4: US2 — in-app reminder banner
5. **STOP and VALIDATE**: full customer review flow working
6. Deploy/demo if ready

### Incremental Delivery

1. Setup + Foundational → infrastructure ready
2. US1 → customer can submit reviews (MVP core)
3. US2 → banner reminds returning customers
4. US3 → public cafe ratings visible (P2 increment)
5. US4 → provider can manage reviews (P2 increment)
6. Polish → customer review history page + validation

---

## Notes

- **No test tasks** — tests not requested in spec; unit test checklist is in `quickstart.md`
- `review.service.ts` accumulates methods across phases — implement incrementally, each method is independently callable
- `review.api.ts` (frontend) also accumulates wrappers across phases — acceptable since each wrapper is a standalone function
- T010 (`staff.service.ts`) is the only task that modifies an existing complex file — read the file before editing to locate the exact checkout completion point
- `maskName()` (T022) must handle edge case: single-token name returns as-is (no masking)
