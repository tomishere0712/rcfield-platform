# Implementation Plan: Contest ↔ Booking Rental Integration

**Branch**: `main` | **Date**: 2026-07-23 | **Spec**: [spec.md](spec.md)  
**Input**: Feature specification from `specs/016-contest-booking-rental/spec.md`

> Lưu ý: plan/tasks viết sau khi implementation hoàn tất, để ghi lại kiến trúc và quyết định thực tế đã áp dụng.

## Summary

Kết nối Contest với Booking qua một **bridge service** (`ContestBookingBridge` trong `contest-rental.service.ts`): booking contest là booking thật (`source = CONTEST`, `bookings.contest_id`), đi qua core booking/payment/session engine hiện hữu — không tạo flow thanh toán hay state machine riêng. Chính sách giá contest (`contest.config.rental_policy`) được áp lúc tính tiền và freeze vào snapshot, nên refund cọc tự động đúng. Entry point chính ở FE là trong form đăng ký contest (`ContestRegistrationPanel`), nơi khách chọn nguồn xe (BYOC / booking đã có / thuê mới) và đăng ký kèm `rental_slot`. API trực tiếp `POST /bookings/contest-rental` vẫn tồn tại cho trường hợp thuê riêng (không đăng ký), nhưng không còn banner trên `CreateBookingPage`. Vận hành ngày thi được đồng bộ: check-in xe tự chuyển registration CONFIRMED → CHECKED_IN. Kèm format mới QUALIFYING_FINAL (Grand Prix): qualifying TIME_ATTACK → top N finalists → knockout bracket seeded.

---

## Technical Context

**Language/Version**: Node.js 20+, TypeScript strict mode (backend) / React 18, TypeScript (frontend)  
**Primary Dependencies**: Express.js, TypeORM (backend); React Query hooks (frontend) — không thêm dependency mới  
**Storage**: PostgreSQL — 2 migration: `1784500000000-ContestBookingLink` (cột + FK + backfill), `1784600000000` (seed GRAND_PRIX + template)  
**Testing**: Jest + Supertest (backend), Vitest (frontend)  
**Target Platform**: Node.js server (Linux), Web browser  
**Project Type**: Web service (backend API) + Web application (frontend)  
**Constraints**: Không tạo payment path riêng; booking contest dùng chung snapshot pricing, VNPay flow, expiry và session lifecycle của core booking  
**Scale/Scope**: 3 endpoint mới, 2 endpoint thay đổi response, 1 bridge service, 1 format runtime mới, FE feature module mới

---

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Snapshot-First Pricing | ✅ Compliant | Policy áp lúc tính tiền → freeze vào snapshot; refund cọc đọc snapshot như booking thường |
| II. State Machine Gate | ✅ Compliant | Booking contest đi qua `startCheckIn()`/checkout hiện hữu; registration transition dùng contest check-in guard hiện hữu |
| III. Evidence-Based Handover | ✅ Compliant | Checkout contest vẫn qua inspection flow chuẩn; audit `booking.vehicle_checked_out` chỉ là log bổ sung |
| IV. Payment Component Isolation | ✅ Compliant | Không tạo payment subject mới; booking contest dùng payment components của booking thường |
| V. Test-First for Financial | ✅ Compliant | Bridge policy + cleanup booking được cover bởi test suite BE hiện hữu |
| VI. RBAC Enforcement | ✅ Compliant | `GET /contests/:id/bookings` giới hạn PROVIDER/STAFF; generate-final-bracket theo RBAC runtime hiện hữu |

**Gate**: PASS — không có violation.

---

## Architecture: ContestBookingBridge

```text
                 ┌──────────────────────────┐
   WF-A          │  contest-rental.service  │          WF-B
 POST /bookings/ │  (ContestBookingBridge)  │   POST /contests/:id/register
 contest-rental ─┤                          ├─ (rental_slot)
                 │  getContestRentalPolicy  │
                 │    └ contest.config.     │
                 │      rental_policy       │
                 │  createContestRental-    │
                 │    Booking (validate     │
                 │    slot_window)          │
                 └───────────┬──────────────┘
                             │ tái dùng
                             ▼
                 ┌──────────────────────────┐
                 │   CORE BOOKING ENGINE    │
                 │  pricing → snapshot      │
                 │  payment (VNPay/mock)    │
                 │  expiry / session /      │
                 │  checkout / refund       │
                 └──────────────────────────┘
```

### Quyết định thiết kế

1. **Tái dùng core booking, không flow riêng.** Booking contest chỉ khác booking thường ở `source = CONTEST` + `contest_id` + policy lúc pricing. Sau khi tạo, mọi bước (thanh toán, hết hạn, check-in, checkout, refund) chạy đúng code path cũ → không nhân đôi bug tài chính, không cần state machine mới.
2. **Policy áp lúc pricing, freeze vào snapshot.** `waive_slot_fee` / `deposit_mode` / `deposit_percent` chỉ tồn tại ở thời điểm tính tiền; giá thực thu ghi vào snapshot. Refund cọc sau checkout đọc snapshot → tự đúng cho cả FULL/REDUCED/WAIVED, không cần nhánh refund riêng.
3. **`bookings.contest_id` với `ON DELETE SET NULL` + backfill.** Xóa contest không mất booking; booking cũ (có `snapshot.contest_id`) được backfill để nhận diện nhất quán.
4. **Auto check-in một chiều, fail-open.** Check-in xe tìm registration CONFIRMED cùng contest/khách → chuyển CHECKED_IN + audit (`metadata.trigger='vehicle_check_in'`). Không tìm thấy/không hợp lệ thì check-in xe vẫn thành công (`synced=false`) — vận hành xe không bị chặn bởi contest. Chiều ngược lại không tự động.
5. **Cleanup booking theo trạng thái tiền.** Reject/cancel registration: booking PENDING bị cancel (tránh orphan); booking đã thanh toán giữ nguyên (không hủy tiền đã thu, khách vẫn có booking hợp lệ).
6. **QUALIFYING_FINAL = 2 phase trên cùng runtime.** QUALIFYING tái dùng TIME_TRIAL (TIME_ATTACK + best lap); FINAL tái dùng KNOCKOUT (bracket + advance + `KNOCKOUT_WINS` leaderboard). Route `generate-final-bracket` chỉ thêm bước chọn top N + seeding, không viết lại bracket engine.

---

## Project Structure

### Documentation (this feature)

```text
specs/016-contest-booking-rental/
├── plan.md          ← This file
├── spec.md          ← Feature specification
├── contracts/
│   └── api.md       ← New/changed endpoints
└── tasks.md         ← Retroactive task list (all done)
```

### Source Code

```text
rcfield-be/
├── src/
│   ├── migrations/
│   │   ├── 1784500000000-ContestBookingLink.ts   ← cột contest_id + FK SET NULL + backfill
│   │   └── 1784600000000-GrandPrixSeed.ts        ← contest_type GRAND_PRIX + template
│   ├── services/
│   │   ├── contest-rental.service.ts             ← ContestBookingBridge (policy + create + validate)
│   │   ├── contest.service.ts                    ← register kèm rental_slot (WF-B), cleanup booking
│   │   ├── booking.service.ts / staff.service.ts ← check-in xe đồng bộ registration, checkout audit
│   │   └── contest-runtime.service.ts            ← QUALIFYING_FINAL: qualifying + generate-final-bracket
│   ├── controllers/                              ← contest-rental, contest bookings list, final bracket
│   └── routes/                                   ← POST /bookings/contest-rental, GET /contests/:id/bookings,
│                                                   POST /contests/:id/matches/generate-final-bracket

rcfield-fe/
├── src/
│   ├── features/contests/
│   │   ├── api/contest-booking.api.ts            ← API client contest↔booking
│   │   └── hooks/use-contest-booking.ts          ← React Query hooks
│   ├── pages/public/contest-detail/components/ContestRegistrationPanel.tsx
│   │                                                   ← entry thuê xe cho contest (WF-A/WF-B) tích hợp trong form đăng ký
│   ├── features/contests/components/...                ← stepper đăng ký 3 bước (WF-B)
│   ├── pages/staff/...                           ← badge Contest + toast đồng bộ check-in
│   └── features/contests/components/bracket/...  ← views tách 2 phase Qualifying/Final + input finalists
```

---

## Data Model

### bookings (thay đổi)

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `source` | enum | thêm giá trị `CONTEST` |
| `contest_id` | uuid NULL | FK → `contests.id`, `ON DELETE SET NULL`; backfill từ `snapshot.contest_id` |

### contests.config.rental_policy (mới, optional)

```json
{
  "waive_slot_fee": true,
  "deposit_mode": "FULL | REDUCED | WAIVED",
  "deposit_percent": 50,
  "slot_window": { "before_min": 60, "after_min": 60 }
}
```

Defaults khi thiếu: `deposit_percent = 50`, `slot_window = { before_min: 60, after_min: 60 }`, không waive phí/cọc.

### contests.config.finalists (mới, optional)

Số VĐV vào FINAL của QUALIFYING_FINAL; default 4.

---

## Key Flows

### WF-A — Contest-rental booking

1. Customer chọn "Thuê xe thi đấu" → chọn contest, xe, slot.
2. `POST /bookings/contest-rental` → bridge đọc `rental_policy` → validate `slot_window` (lỗi `CONTEST_SLOT_OUTSIDE_WINDOW`) → tạo booking qua core engine với `source=CONTEST`, `contest_id`.
3. Thanh toán/expiry/check-in/checkout như booking thường.

### WF-B — Register kèm rental_slot

1. Stepper 3 bước: nguồn xe → xe/slot → xác nhận thanh toán gộp.
2. `POST /contests/:id/register` + `rental_slot` → tạo registration + booking PENDING (cùng bridge) → response kèm `booking { id, status, payment_expires_at, total_amount }`.
3. Customer thanh toán → booking CONFIRMED → provider approve registration.
4. Reject/cancel registration → booking PENDING bị cancel (audit `booking.contest_rental_cancelled`); booking đã thanh toán giữ nguyên (audit `booking.contest_rental_retained`).

### Đồng bộ vận hành ngày thi

1. Staff check-in xe booking có `contest_id` → tìm registration CONFIRMED (cùng contest + customer) → CHECKED_IN + audit `registration.checked_in` (`metadata.trigger='vehicle_check_in'`) → response kèm `contest_checkin`.
2. Checkout trả xe → audit `booking.vehicle_checked_out`.
3. Provider/staff xem booking của giải qua `GET /contests/:contestId/bookings`.

### QUALIFYING_FINAL

1. Generate matches phase QUALIFYING → mỗi VĐV CHECKED_IN một match TIME_ATTACK → nhập best lap.
2. `POST /contests/:contestId/matches/generate-final-bracket` → lấy top N (`config.finalists`, default 4) theo ranking → seed bracket FINAL: 1vN, 2vN-1, ...
3. Runtime FINAL như KNOCKOUT; leaderboard `KNOCKOUT_WINS`.

---

## Complexity Tracking

Không có violation nào cần justify. Quyết định lớn nhất — tái dùng core booking engine thay vì flow riêng — giảm complexity thay vì tăng.
