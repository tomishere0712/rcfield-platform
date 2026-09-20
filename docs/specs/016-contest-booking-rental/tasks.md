# Tasks: Contest ↔ Booking Rental Integration

**Input**: Design documents from `specs/016-contest-booking-rental/`  
**Prerequisites**: plan.md ✅, spec.md ✅, contracts/api.md ✅

> Retroactive task list — implementation đã hoàn tất trước khi docs được viết (2026-07-23). Tất cả task đánh dấu theo trạng thái thực tế.

---

## Phase 1: Setup — Data Model & Migration

**Purpose**: Nền dữ liệu cho liên kết Contest↔Booking.

- [X] T001 Thêm `BookingSource.CONTEST` vào booking source enum (rcfield-be/src/entities hoặc constants booking)
- [X] T002 Migration `1784500000000-ContestBookingLink`: thêm cột `bookings.contest_id` (uuid NULL, FK → contests, `ON DELETE SET NULL`) + backfill từ `snapshot.contest_id`
- [X] T003 [P] Migration `1784600000000`: seed contest_type `GRAND_PRIX` + template `grand_prix_qualifying_final`

**Checkpoint**: Migration chạy sạch trên DB có dữ liệu cũ; booking cũ có `snapshot.contest_id` được backfill `contest_id`.

---

## Phase 2: Foundational — ContestBookingBridge

**Purpose**: Bridge service đọc policy và tạo booking contest qua core engine — blocking cho WF-A và WF-B.

**⚠️ CRITICAL**: Phase 3 (WF-A) và Phase 4 (WF-B) đều phụ thuộc bridge này.

- [X] T004 Implement `getContestRentalPolicy` trong rcfield-be/src/services/contest-rental.service.ts: đọc `contest.config.rental_policy` `{ waive_slot_fee, deposit_mode: FULL|REDUCED|WAIVED, deposit_percent (default 50), slot_window { before_min, after_min } (default 60/60) }` với default an toàn khi thiếu config
- [X] T005 Implement `createContestRentalBooking` trong contest-rental.service.ts: validate slot nằm trong `slot_window` quanh race window (lỗi `CONTEST_SLOT_OUTSIDE_WINDOW`) → tạo booking qua core booking engine với `source=CONTEST`, `contest_id`
- [X] T006 Áp `rental_policy` vào pricing: `waive_slot_fee` → phí sân = 0; `deposit_mode=REDUCED` → cọc = `deposit_percent`% chuẩn; `WAIVED` → cọc 0; freeze giá thực thu vào snapshot (refund cọc tự đúng)

**Checkpoint**: Unit test policy: thiếu config → default; từng `deposit_mode` → số cọc đúng; slot ngoài window → reject.

---

## Phase 3: User Story 1 — WF-A Thuê xe riêng cho contest (Priority: P1) 🎯 MVP

**Goal**: Customer thuê xe cho contest từ form đăng ký contest (chọn nguồn xe "Thuê xe tại quầy") mà không bắt buộc tạo registration; API `POST /bookings/contest-rental` vẫn phục vụ trường hợp thuê riêng.

**Independent Test**: `POST /bookings/contest-rental` → booking `source=CONTEST` + `contest_id`; slot ngoài window → `CONTEST_SLOT_OUTSIDE_WINDOW`; không có registration nào được tạo.

### Implementation for User Story 1

- [X] T007 [US1] Thêm endpoint `POST /api/v1/bookings/contest-rental` (controller + route, auth CUSTOMER) gọi `createContestRentalBooking`; KHÔNG tạo registration
- [X] T008 [P] [US1] FE: entry thuê xe cho contest chuyển vào `ContestRegistrationPanel` (stepper chọn nguồn xe) trong luồng đăng ký giải; xóa banner "Thuê xe thi đấu" khỏi `CreateBookingPage`.

**Checkpoint**: Tạo booking contest từ FE → thanh toán VNPay/mock → booking CONFIRMED như booking thường; kiểm tra `contest_registrations` không có record mới.

---

## Phase 4: User Story 2 — WF-B Register kèm rental_slot (Priority: P1)

**Goal**: Đăng ký contest + thuê xe một chạm; cleanup booking khi registration bị reject/cancel.

**Independent Test**: Register kèm `rental_slot` → response có `booking { id, status, payment_expires_at, total_amount }`; reject registration → booking PENDING bị cancel; booking đã thanh toán → giữ nguyên.

### Implementation for User Story 2

- [X] T009 [US2] Mở rộng register contest (contest.service.ts): khi payload có `rental_slot`, gọi bridge tạo booking PENDING gắn `contest_id`, trả thêm `booking { id, status, payment_expires_at, total_amount }` trong response
- [X] T010 [US2] Cleanup booking khi reject/cancel registration: booking PENDING → cancel + audit `booking.contest_rental_cancelled`; booking đã thanh toán → giữ nguyên + audit `booking.contest_rental_retained`
- [X] T011 [P] [US2] FE: stepper đăng ký 3 bước (nguồn xe → xe/slot → xác nhận thanh toán gộp) trong features/contests, nhận `booking` từ response để chuyển bước thanh toán

**Checkpoint**: E2E: register kèm slot → thanh toán → booking CONFIRMED → provider approve. Reject trước thanh toán → booking bị cancel, audit đủ.

---

## Phase 5: User Story 3 — Đồng bộ vận hành check-in/trả xe (Priority: P2)

**Goal**: Check-in xe tự check-in registration; audit trả xe; provider xem booking của giải.

**Independent Test**: Check-in xe booking contest (registration CONFIRMED) → response có `contest_checkin { registrationId, synced: true, previousStatus: 'CONFIRMED' }`, audit `registration.checked_in` với `metadata.trigger='vehicle_check_in'`.

### Implementation for User Story 3

- [X] T012 [US3] Check-in xe (staff flow): nếu booking có `contest_id` và có registration CONFIRMED cùng contest/customer → chuyển CHECKED_IN + audit `registration.checked_in` (`metadata.trigger='vehicle_check_in'`); response thêm `contest_checkin { registrationId, synced, previousStatus }`; fail-open khi không có registration hợp lệ
- [X] T013 [P] [US3] Checkout trả xe booking contest → ghi audit `booking.vehicle_checked_out`
- [X] T014 [P] [US3] Endpoint `GET /api/v1/contests/:contestId/bookings` (auth PROVIDER/STAFF) liệt kê booking liên kết contest
- [X] T015 [P] [US3] FE staff: badge Contest trên booking có `contest_id` + toast trạng thái đồng bộ check-in

**Checkpoint**: Staff check-in xe → registration CHECKED_IN trong một thao tác; booking không có registration hợp lệ → check-in xe vẫn OK, `synced=false`.

---

## Phase 6: User Story 5 — Format QUALIFYING_FINAL (Priority: P3)

**Goal**: Hai phase Grand Prix: qualifying TIME_ATTACK → top N finalists → knockout bracket seeded.

**Independent Test**: Generate qualifying → nhập best lap → `generate-final-bracket` → bracket FINAL đúng top N, seed 1vN, 2vN-1; leaderboard `KNOCKOUT_WINS`.

### Implementation for User Story 5

- [X] T016 [US5] Runtime phase QUALIFYING: mỗi VĐV CHECKED_IN một match TIME_ATTACK, xếp theo `best_lap_ms` (tái dùng TIME_TRIAL engine)
- [X] T017 [US5] Route `POST /api/v1/contests/:contestId/matches/generate-final-bracket`: lấy top N (`config.finalists`, default 4) → tạo bracket FINAL knockout seed 1vN, 2vN-1, ...; leaderboard mode `KNOCKOUT_WINS`
- [X] T018 [P] [US5] FE provider: input `finalists` trong form tạo contest; bracket views tách 2 phase Qualifying/Final

**Checkpoint**: Contest GRAND_PRIX end-to-end: qualifying → final bracket → publish leaderboard.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T019 [P] TypeScript build sạch cả hai repo (`npx tsc --noEmit` trong rcfield-be/ và rcfield-fe/)
- [X] T020 [P] Verify refund cọc booking contest khớp snapshot cho cả 3 `deposit_mode` (FULL/REDUCED/WAIVED)
- [X] T021 Cập nhật domain docs: `docs/spec/03-contest.md` (section Contest↔Booking + QUALIFYING_FINAL) và `docs/spec/business-rules/BR-contest.md` (rules BR-CT-080+)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Migration)**: Không phụ thuộc — bắt đầu ngay
- **Phase 2 (Bridge)**: Phụ thuộc T002 (`contest_id` phải tồn tại)
- **Phase 3 (WF-A)**: Phụ thuộc Phase 2; T007 và T008 song song được (BE/FE)
- **Phase 4 (WF-B)**: Phụ thuộc Phase 2; độc lập Phase 3
- **Phase 5 (Ops sync)**: Phụ thuộc T002; độc lập Phase 3/4 về code path
- **Phase 6 (QUALIFYING_FINAL)**: Phụ thuộc T003; độc lập các phase rental
- **Phase 7 (Polish)**: Sau tất cả

### Parallel Opportunities

- **T002 + T003**: hai migration độc lập
- **T007 + T008**, **T012/T013/T014 + T015**, **T016/T017 + T018**: BE/FE song song
- **Phase 3/4/5/6**: bốn nhánh tính năng gần như độc lập sau Phase 1–2

---

## Implementation Strategy

### MVP (Phase 1 + 2 + 3)

Bridge + WF-A: khách thuê được xe cho contest với giá ưu đãi — giá trị cốt lõi của tích hợp.

### Full Feature (thêm Phase 4 + 5)

WF-B một chạm + đồng bộ vận hành ngày thi — hoàn thiện vòng đời registration.

### Tournament Extension (thêm Phase 6)

QUALIFYING_FINAL cho giải đấu lớn — độc lập, ship sau cùng.

### Tổng: 21 tasks — tất cả đã hoàn thành tại 2026-07-23
