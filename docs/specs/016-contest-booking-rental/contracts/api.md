# API Contracts: Contest ↔ Booking Rental Integration

**Feature**: 016-contest-booking-rental  
**Date**: 2026-07-23

---

## New Endpoints

### POST /api/v1/bookings/contest-rental

**Purpose**: WF-A — tạo booking thuê xe gắn với contest (`source=CONTEST`), áp `rental_policy`. KHÔNG tạo registration.

**Auth**: JWT CUSTOMER

**Request**:
```json
{
  "contest_id": "uuid",
  "cafe_id": "uuid",
  "slot_start": "2026-07-25T08:30:00.000Z",
  "slot_end": "2026-07-25T10:30:00.000Z",
  "track_config_id": "uuid | null",
  "vehicle_catalog_id": "uuid | null"
}
```

**Validation**: `slot_start/slot_end` phải nằm trong `slot_window` quanh race window (`starts_at - before_min` → `ends_at + after_min`; default 60/60).

**Response 201**:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "status": "PENDING",
    "source": "CONTEST",
    "contest_id": "uuid",
    "total_amount": 120000,
    "deposit_amount": 75000,
    "payment_expires_at": "2026-07-23T13:47:00.000Z"
  }
}
```

**Response 400**:
```json
{ "error": "CONTEST_SLOT_OUTSIDE_WINDOW", "message": "Slot nằm ngoài cửa sổ cho phép của contest" }
```

---

### GET /api/v1/contests/:contestId/bookings

**Purpose**: Provider/Staff xem các booking liên kết contest (phục vụ vận hành ngày thi).

**Auth**: JWT PROVIDER (owner) hoặc STAFF (assigned cafe trong contest)

**Response 200**:
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "status": "CONFIRMED",
      "source": "CONTEST",
      "contest_id": "uuid",
      "customer": { "id": "uuid", "full_name": "Nguyen Van A" },
      "slot_start": "2026-07-25T08:30:00.000Z",
      "slot_end": "2026-07-25T10:30:00.000Z",
      "vehicle_id": "uuid"
    }
  ]
}
```

---

### POST /api/v1/contests/:contestId/matches/generate-final-bracket

**Purpose**: QUALIFYING_FINAL — sau khi phase QUALIFYING hoàn tất, tạo bracket FINAL knockout cho top N finalists.

**Auth**: JWT PROVIDER (owner) — chỉ Provider owner của contest được gọi, không phải STAFF.

**Request** (body optional — mặc định dùng `contest.config.finalists`, default 4):
```json
{ "finalists": 4 }
```

**Guard**: chỉ khi `runtime_format = QUALIFYING_FINAL` và mọi match QUALIFYING đã `COMPLETED`.

**Response 201**:
```json
{
  "success": true,
  "data": {
    "phase": "FINAL",
    "matches_created": 3,
    "seeds": [
      { "seed": 1, "registration_id": "uuid", "qualifying_rank": 1 },
      { "seed": 2, "registration_id": "uuid", "qualifying_rank": 2 }
    ]
  }
}
```

**Seeding**: rank 1 gặp rank N, rank 2 gặp rank N-1, ... Nếu số VĐV đủ điều kiện < N thì bracket chỉ gồm VĐV thực tế.

---

## Changed Endpoints

### POST /api/v1/contests/:contestId/register

**Change**: WF-B — khi payload có `rental_slot`, response trả thêm object `booking`.

**Request** (thêm, đã có từ trước — nhắc lại):
```json
{
  "vehicle_source": "RENTAL",
  "rental_slot": {
    "cafe_id": "uuid",
    "slot_start": "2026-07-25T09:00:00.000Z",
    "slot_end": "2026-07-25T10:00:00.000Z",
    "track_config_id": "uuid | null",
    "vehicle_catalog_id": "uuid | null"
  }
}
```

**Response 201** (phần mới là `booking`):
```json
{
  "success": true,
  "data": {
    "registration": { "id": "uuid", "status": "PENDING", "payment_status": "PENDING_REVIEW" },
    "booking": {
      "id": "uuid",
      "status": "PENDING",
      "payment_expires_at": "2026-07-23T13:47:00.000Z",
      "total_amount": 120000
    }
  }
}
```

**Side effects khi reject/cancel registration**:
- Booking còn `PENDING` → bị cancel + audit `booking.contest_rental_cancelled`.
- Booking đã thanh toán → giữ nguyên + audit `booking.contest_rental_retained`.

---

### POST /api/v1/staff/bookings/:bookingId/check-in

**Change**: nếu booking có `contest_id` và customer có registration `CONFIRMED` của contest đó → registration tự chuyển `CHECKED_IN`; response thêm `contest_checkin`. Fail-open: không có registration hợp lệ thì check-in xe vẫn thành công.

**Response 200** (phần mới là `contest_checkin`):
```json
{
  "success": true,
  "data": {
    "sessionId": "uuid",
    "status": "CHECKED_IN",
    "actualStartAt": "2026-07-25T08:33:00.000Z",
    "contest_checkin": {
      "registrationId": "uuid",
      "synced": true,
      "previousStatus": "CONFIRMED"
    }
  }
}
```

Khi không đồng bộ được (không có registration / registration không `CONFIRMED` / đã `CHECKED_IN`):
```json
"contest_checkin": { "registrationId": null, "synced": false, "previousStatus": null }
```

**Audit**: `registration.checked_in` với `metadata.trigger='vehicle_check_in'` khi `synced=true`. Checkout trả xe ghi audit `booking.vehicle_checked_out`.

---

## Config Contracts (no API)

### contests.config.rental_policy

```json
{
  "waive_slot_fee": true,
  "deposit_mode": "FULL | REDUCED | WAIVED",
  "deposit_percent": 50,
  "slot_window": { "before_min": 60, "after_min": 60 }
}
```

Defaults khi thiếu: không waive phí sân/cọc, `deposit_percent=50`, `slot_window={before_min:60, after_min:60}`.

### contests.config.finalists

Số VĐV vào FINAL của QUALIFYING_FINAL; default 4. Leaderboard mode: `KNOCKOUT_WINS`.

---

## Frontend Contracts

### features/contests/api/contest-booking.api.ts + hooks use-contest-booking

- `createContestRentalBooking(payload)` → `POST /bookings/contest-rental` (WF-A, thuê riêng không đăng ký; entry chính ở FE là chọn "Thuê xe tại quầy" trong `ContestRegistrationPanel`, không còn trên `CreateBookingPage`)
- `registerWithRentalSlot(contestId, payload)` → `POST /contests/:id/register`, nhận `booking` để chuyển bước thanh toán trong stepper 3 bước (nguồn xe → xe/slot → xác nhận thanh toán gộp)
- `getContestBookings(contestId)` → `GET /contests/:id/bookings` (provider/staff)
- `generateFinalBracket(contestId)` → `POST /contests/:id/matches/generate-final-bracket`

### Staff UI

- Booking có `contest_id` → badge "Contest".
- Sau check-in: toast hiển thị trạng thái đồng bộ từ `contest_checkin` ("Đã check-in đăng ký giải" khi `synced=true`).

### Provider UI

- Form tạo contest (QUALIFYING_FINAL) có input `finalists`.
- Bracket views tách 2 phase: Qualifying (ranking best lap) / Final (knockout bracket).
