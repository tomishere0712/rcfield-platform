# Architecture: Booking & Session

**Last Updated:** 2026-05-17  
**Spec refs:** `docs/spec/01-domain-model.md`, `docs/spec/02-state-machine.md`

---

## Planned vs. Actual — Nguyên tắc cốt lõi

```
BOOKING  = kế hoạch đặt lịch (contract)
SESSION  = phiên chơi thực tế (operations)
```

Hai entity tách biệt. Session chỉ tạo khi Staff thực sự check-in — không phải khi Customer đặt lịch.

| Planned (Booking) | Actual (Session) |
|-------------------|-----------------|
| `booking_participants` — ai dự kiến đến | `session_participants` — ai thực sự có mặt |
| `booking_vehicles` — xe thuê dự kiến | `session_vehicles` — xe thực tế dùng (có thể đổi xe) |
| `slot_start / slot_end` — giờ dự kiến | `actual_start_at / actual_end_at` — giờ thực tế |
| Tạo khi Customer đặt lịch | Tạo khi Staff check-in |

**Một booking có thể có nhiều sessions.** (ví dụ: nhóm đặt nhiều ca, hoặc tách session khi check-in từng người)

---

## Entity Map

```
Booking
  ├── BookingParticipant[]     ← ai dự kiến tham gia
  ├── BookingVehicle[]         ← xe thuê dự kiến (RENTAL mode)
  ├── PaymentComponent[]       ← ledger thanh toán
  ├── PaymentTransaction[]     ← log gateway
  ├── FnbOrder[]               ← pre-order F&B
  ├── Dispute?                 ← tranh chấp chính thức (tối đa 1)
  └── Session[]
        ├── SessionParticipant[]     ← ai thực sự có mặt
        ├── SessionVehicle[]         ← xe thực tế (RENTAL hoặc BYOC)
        ├── Inspection[]             ← check-in + check-out per xe
        │     ├── InspectionPhoto[]  ← 4 góc ảnh
        │     └── InspectionChecklist[]
        ├── ExtensionProposal[]      ← đề xuất gia hạn
        └── Incident[]               ← sự cố trong session
```

---

## Booking State Machine

```
PENDING
  → CONFIRMED   [PAYMENT_CONFIRMED — thanh toán thành công]
  → CANCELLED   [TIMEOUT 30 phút / customer huỷ]

CONFIRMED
  → COMPLETED   [ALL_SESSIONS_DONE — tất cả sessions COMPLETED]
  → CANCELLED   [huỷ trước khi session bắt đầu]
  → NO_SHOW     [TIMEOUT — slot_start + 30 phút, không có session nào]
```

| Status | Ý nghĩa |
|--------|---------|
| `PENDING` | Đã tạo, chờ thanh toán |
| `CONFIRMED` | Đã thanh toán, chờ check-in |
| `CANCELLED` | Bị huỷ |
| `NO_SHOW` | Quá hạn check-in |
| `COMPLETED` | Tất cả sessions hoàn tất và settled |

**Rule:** Mọi transition phải gọi `BookingService.transition(bookingId, event)` — không update `status` trực tiếp.

---

## Session State Machine

```
CHECKED_IN
  → ACTIVE      [CHECK_IN_COMPLETED — customer confirm / auto-confirm]
  → CANCELLED   [CANCELLED — huỷ trước khi bắt đầu]

ACTIVE
  → EXTENDING     [EXTENSION_INITIATED — staff đề xuất gia hạn]
  → CHECKING_OUT  [CHECKOUT_INITIATED — staff bắt đầu check-out]

EXTENDING
  → ACTIVE        [EXTENSION_APPROVED / EXTENSION_REJECTED / TIMEOUT 10 phút]

CHECKING_OUT
  → COMPLETED     [CUSTOMER_CONFIRMED / TIMEOUT 2h (no damage) / TIMEOUT 24h (damage)]
```

| Status | Ý nghĩa |
|--------|---------|
| `CHECKED_IN` | Session vừa tạo, đang hoàn tất kiểm tra đầu vào |
| `ACTIVE` | Phiên đang chơi |
| `EXTENDING` | Chờ customer phản hồi đề xuất gia hạn |
| `CHECKING_OUT` | Staff đang kiểm tra trả xe |
| `COMPLETED` | Phiên hoàn tất, settlement đã chạy |
| `CANCELLED` | Phiên bị hủy trước khi bắt đầu |

**Rule:** Tương tự booking — gọi `SessionService.transition(sessionId, event)`.

---

## Timeout Rules

### Booking

| State | Timeout | Action |
|-------|---------|--------|
| `PENDING` | 30 phút | Auto-cancel, release slot |
| `CONFIRMED` không có session | `slot_start + 30 phút` | Mark `NO_SHOW` |

### Session

| State | Điều kiện | Timeout | Action |
|-------|-----------|---------|--------|
| `CHECKED_IN` | Customer chưa confirm inspection | 15 phút | Auto-confirm check-in |
| `EXTENDING` | Customer chưa phản hồi | 10 phút | Auto-reject, quay lại `ACTIVE` |
| `CHECKING_OUT` | Không có damage | 2 giờ | Auto-confirm check-out |
| `CHECKING_OUT` | Có damage flagged | 24 giờ | Auto-confirm damage charge |

---

## SessionVehicle — Hỗ trợ đổi xe

```
SessionVehicle
  vehicle_source = RENTAL  →  vehicle_id required     (xe của quán)
  vehicle_source = BYOC    →  customer_vehicle_id req  (xe cá nhân)
```

Xe thực tế trong session có thể **khác** xe dự kiến trong booking (staff đổi xe lúc check-in). Field `booking_vehicle_id` là optional link về xe dự kiến ban đầu.

---

## Booking Modes

| Mode | Mô tả | booking_vehicles | session_vehicles |
|------|-------|-----------------|-----------------|
| `RENTAL` | Thuê xe của quán | Có (RENTAL) | RENTAL |
| `BYOC` | Mang xe cá nhân | Không có | BYOC |
| `MIXED` | Vừa thuê vừa mang | Có (RENTAL part) | RENTAL + BYOC |

---

## API Endpoints liên quan

```
POST /bookings                              CUSTOMER — tạo booking
POST /bookings/:id/cancel                   CUSTOMER / PROVIDER
POST /bookings/:id/payment/confirm          CUSTOMER

POST /bookings/:id/sessions/checkin         STAFF — tạo session
GET  /bookings/:id/sessions                 Auth — list sessions của booking
GET  /sessions/:id                          Auth — chi tiết session
```

---

## Reference

- [`docs/spec/02-state-machine.md`](../spec/02-state-machine.md) — State machine đầy đủ + events enum
- [`docs/spec/01-domain-model.md`](../spec/01-domain-model.md) — Entity definitions
- [`docs/spec/business-rules/BR-booking.md`](../spec/business-rules/BR-booking.md) — Business rules booking
- [`docs/diagrams/sequence/sequence-flow-booking-lifecycle.md`](../diagrams/sequence/sequence-flow-booking-lifecycle.md) — End-to-end sequence
