# 05 — API Contracts

**Last updated**: 2026-08-12
> Convention: tất cả response đều wrap trong `{ data, meta?, error? }`
> Auth header: `Authorization: Bearer <jwt_token>`

> ⚠️ **Tài liệu này KHÔNG đầy đủ.** Backend hiện có **305 endpoint** trên 42 router;
> file này mô tả khoảng một phần ba. Khi cần chắc chắn, đọc thẳng `src/routes/`
> hoặc mở `/api-docs` (Swagger).
>
> Lưu ý khi tra: hầu hết thao tác của nhân viên nằm dưới tiền tố `/staff/...`,
> không phải `/sessions/...` như bản trước ghi. Hai router `bank-webhook` và
> `sandbox-bank` mount ở `app.ts` chứ không qua `routes/index.ts`.

---

## Auth

| Method | Endpoint | Actor | Mô tả |
|--------|----------|-------|-------|
| POST | `/auth/register` | Public | Đăng ký Customer/Provider |
| POST | `/auth/login` | Public | Đăng nhập, nhận JWT |
| POST | `/auth/refresh` | Auth | Refresh token |
| GET | `/auth/me` | Auth | Lấy thông tin user hiện tại |

---

## Cafes

| Method | Endpoint | Actor | Mô tả |
|--------|----------|-------|-------|
| GET | `/cafes` | Public | List cafe (filter: district, track_type, available) |
| GET | `/cafes/:id` | Public | Chi tiết cafe + reviews |
| POST | `/cafes` | PROVIDER | Tạo cafe mới (status: PENDING) |
| PATCH | `/cafes/:id` | PROVIDER | Update cafe profile |
| PATCH | `/cafes/:id/status` | ADMIN | Activate / Suspend cafe |

---

## Fleet (Vehicles)

| Method | Endpoint | Actor | Mô tả |
|--------|----------|-------|-------|
| GET | `/cafes/:cafeId/vehicles` | Auth | List xe của quán |
| POST | `/cafes/:cafeId/vehicles` | PROVIDER | Thêm xe mới |
| PATCH | `/cafes/:cafeId/vehicles/:id` | PROVIDER | Update xe (tier, rate, status) |
| DELETE | `/cafes/:cafeId/vehicles/:id` | PROVIDER | Retire xe (soft delete) |

> Danh mục xe (`vehicle_catalogs`) và từng chiếc (`vehicles`) là hai tầng riêng; xem router `vehicle-catalog.routes.ts`.

---

## Bookings

| Method | Endpoint | Actor | Mô tả |
|--------|----------|-------|-------|
| GET | `/bookings` | Auth | List bookings (filter by role) |
| GET | `/bookings/:id` | Auth | Chi tiết booking + sessions |
| POST | `/bookings` | CUSTOMER | Tạo booking mới (hỗ trợ multi-vehicle + participants) |
| POST | `/bookings/:id/cancel` | CUSTOMER/PROVIDER | Huỷ booking |
| POST | `/payments/vnpay/create-url` | CUSTOMER | Tạo link thanh toán VNPay |
| GET | `/payments/vnpay/return` | Public | VNPay redirect khách về |
| GET | `/payments/vnpay/ipn` | Public | VNPay báo kết quả server-to-server |
| POST | `/payments/bank-webhook` | Public | Webhook đối soát chuyển khoản (mount ở `app.ts`) |
| POST | `/bookings/:id/checkout` | STAFF | Chốt phiên và thu phần phát sinh |

**POST /bookings body (hỗ trợ multi-vehicle + participants):**
```json
{
  "cafe_id": "uuid",
  "play_mode": "RENTAL | BYOC | MIXED",
  "track_type": "DRIFT | CIRCUIT | OFFROAD",
  "slot_start": "2026-05-15T09:00:00+07:00",
  "slot_end": "2026-05-15T11:00:00+07:00",
  "participants": [
    {
      "participant_type": "BOOKER | REGISTERED_USER | WALK_IN_GUEST",
      "user_id": "uuid | null",
      "display_name": "string | null",
      "phone": "string | null",
      "is_primary_responsible": true
    }
  ],
  "vehicles": [
    {
      "vehicle_id": "uuid"
    }
  ],
  "fnb_preorder": [
    { "menu_item_id": "uuid", "quantity": 2 }
  ],
  "promotion_code": "SUMMER20 | null"
}
```

---

## Sessions

> **NEW** — Session endpoints cho vận hành thực tế.

| Method | Endpoint | Actor | Mô tả |
|--------|----------|-------|-------|
| GET | `/bookings/:id/sessions` | Auth | List sessions của booking |
| GET | `/sessions/:sessionId` | Auth | Chi tiết session (participants, vehicles, inspections) |
| GET | `/staff/sessions/:sessionId` | STAFF | Chi tiết session cho màn hình vận hành |
| POST | `/staff/bookings` | STAFF | Tạo booking tại quầy (walk-in) |
| POST | `/staff/sessions/:sessionId/inspections` | STAFF | Bắt đầu check-in / check-out → tạo inspection |

---

## Inspections

> **THAY ĐỔI:** Inspection giờ qua session endpoint (không phải booking).

| Method | Endpoint | Actor | Mô tả |
|--------|----------|-------|-------|
| POST | `/staff/sessions/:sessionId/inspections` | STAFF | Submit inspection (type quyết định check-in hay check-out) |
| PUT | `/staff/sessions/:sessionId/inspections/:inspectionId/damage-items` | STAFF | Ghi từng hạng mục hư hỏng |
| POST | `/staff/sessions/:sessionId/confirm-checkout` | STAFF | Chốt check-out |
| POST | `/sessions/:sessionId/inspection/confirm` | CUSTOMER | Xác nhận inspection mới nhất |
| POST | `/sessions/:sessionId/inspections/:inspectionId/confirm` | CUSTOMER | Xác nhận đúng một inspection |

> Không còn endpoint `raise-incident`: bảng `incidents` đã bị xoá.

**POST /checkin body (multipart/form-data):**
```
photo_front: File
photo_back: File
photo_left: File
photo_right: File
session_vehicle_id: uuid | null    ← null nếu inspection cấp session
checklist: JSON string { scratches, cracks, missing_parts, notes }
pre_existing_flag: boolean
```

---

## Extensions

> **THAY ĐỔI:** Extension giờ qua session (không phải booking).

| Method | Endpoint | Actor | Mô tả |
|--------|----------|-------|-------|
| POST | `/staff/sessions/:sessionId/extensions` | STAFF | Gửi đề xuất gia hạn |
| POST | `/sessions/:sessionId/extensions/respond` | CUSTOMER | Chấp nhận hoặc từ chối |
| POST | `/sessions/:sessionId/extension/respond` | CUSTOMER | Bí danh cũ của endpoint trên |

**POST /extensions body:**
```json
{
  "duration_minutes": 60,
  "fee_amount": 150000
}
```

---

## Incidents & Policy Resolution

| Method | Endpoint | Actor | Mô tả |
|--------|----------|-------|-------|
| GET | `/sessions/:id/incidents` | Auth | List incidents của session |
| POST | `/sessions/:id/incidents` | STAFF | Ghi nhận incident mới |
| PATCH | `/incidents/:id` | STAFF/ADMIN | Update incident note/status |
| POST | `/incidents/:id/resolve` | STAFF/ADMIN | Áp policy, ghi responsible_party/final_amount/resolution_note |

---

## F&B

| Method | Endpoint | Actor | Mô tả |
|--------|----------|-------|-------|
| GET | `/cafes/:cafeId/menu` | Public | Xem menu chi nhánh |
| POST | `/cafes/:cafeId/menu` | PROVIDER/STAFF | Thêm item menu |
| PATCH | `/cafes/:cafeId/menu/:id` | PROVIDER/STAFF | Update item menu |
| GET | `/bookings/:id/fnb-orders` | Auth | List F&B orders của booking |
| POST | `/bookings/:id/fnb-orders` | CUSTOMER | Tạo pre-order F&B |
| POST | `/sessions/:id/fnb-orders` | STAFF | Tạo on-site order |
| POST | `/fnb-orders/:id/confirm` | STAFF | Confirm order |
| PATCH | `/fnb-orders/:id/status` | STAFF | Update order status |

---

## Packages, Subscriptions, Contests

| Method | Endpoint | Actor | Mô tả |
|--------|----------|-------|-------|
| GET | `/cafes/:cafeId/packages` | Public | List packages |
| POST | `/cafes/:cafeId/packages` | PROVIDER | Tạo package |
| POST | `/packages/:id/purchase` | CUSTOMER | Mua package |
| GET | `/me/packages` | CUSTOMER | Gói đã mua |
| POST | `/subscriptions` | CUSTOMER/STAFF | Tạo lịch định kỳ |

### Contest Core

| Method | Endpoint | Actor | Mô tả |
|--------|----------|-------|-------|
| GET | `/contests` | Public/Auth | List contests public; Provider có thể dùng filter riêng để xem contest của mình |
| GET | `/cafes/:cafeId/contests` | Public/Auth | List contests có chi nhánh này tham gia |
| GET | `/contests/:id` | Public/Auth | Chi tiết contest + participating cafes + registration summary + published leaderboard |
| POST | `/contests` | PROVIDER | Tạo contest DRAFT ở cấp Provider |
| PATCH | `/contests/:id` | PROVIDER owner | Sửa DRAFT/OPEN fields được phép |
| POST | `/contests/:id/open` | PROVIDER owner | DRAFT -> OPEN |
| POST | `/contests/:id/close` | PROVIDER owner | OPEN -> CLOSED, khóa form đăng ký |
| POST | `/contests/:id/cancel` | PROVIDER owner | Hủy contest chưa COMPLETED |

### Contest Organizing Fee

Phí Provider trả cho nền tảng để mở giải — tách khỏi gói SaaS hằng tháng và khác chiều với lệ phí VĐV. Xem `docs/spec/03-contest.md` mục 7 và BR-CT-090..099.

| Method | Endpoint | Actor | Mô tả |
|--------|----------|-------|-------|
| GET | `/contest-fee-plans` | Auth | Bảng gói tổ chức đang bán |
| GET | `/contests/:contestId/fee` | PROVIDER owner / ADMIN | Đơn hiện tại của giải + danh sách gói |
| POST | `/contests/:contestId/fee/order` | PROVIDER owner | Chọn gói; chốt giá và số ngày quảng bá vào đơn. Chỉ khi contest còn DRAFT |
| DELETE | `/contests/:contestId/fee/order` | PROVIDER owner | Huỷ đơn để đổi gói; chỉ khi chưa khai báo chuyển khoản |
| POST | `/contests/:contestId/fee/transfer` | PROVIDER owner | Khai báo đã chuyển khoản → chờ đối soát |
| GET | `/admin/contest-fee-orders` | ADMIN | Hàng đợi đối soát, lọc theo status |
| POST | `/admin/contest-fee-orders/:orderId/confirm` | ADMIN | Xác nhận đã nhận tiền; sinh suất quảng bá PENDING nếu gói có |
| POST | `/admin/contest-fee-orders/:orderId/reject` | ADMIN | Từ chối, bắt buộc kèm lý do |
| GET | `/admin/featured-popups/pending` | ADMIN | Nội dung quảng bá chờ duyệt |
| POST | `/admin/featured-popups/:popupId/review` | ADMIN | Duyệt hoặc từ chối nội dung trước khi lên trang chủ |

`POST /contests/:id/open` trả **402 `CONTEST_FEE_REQUIRED`** khi giải chưa có đơn phí `PAID`.

### Registration & Check-In

| Method | Endpoint | Actor | Mô tả |
|--------|----------|-------|-------|
| POST | `/contests/:id/register` | CUSTOMER | Đăng ký contest khi OPEN |
| GET | `/contests/:id/registrations` | PROVIDER owner | Danh sách người đăng ký để dashboard/monitoring |
| GET | `/contests/:id/registrations/lookup?check_in_code=...` | PROVIDER/STAFF | Lookup một registration bằng mã check-in |
| GET | `/me/contest-registrations` | CUSTOMER | Danh sách contest đã đăng ký của user hiện tại |
| POST | `/contest-registrations/:id/check-in` | PROVIDER/STAFF | CONFIRMED -> CHECKED_IN tại một chi nhánh tham gia contest |
| POST | `/contest-registrations/:id/cancel` | CUSTOMER/PROVIDER | Hủy registration với reason |

### Tournament Schedule & Results

| Method | Endpoint | Actor | Mô tả |
|--------|----------|-------|-------|
| GET | `/contests/:id/matches` | Public/Auth | Lịch match/heat/final của contest |
| POST | `/contests/:id/matches/generate` | PROVIDER owner / STAFF assigned | Tạo lịch thi đấu sau khi contest CLOSED/RUNNING |
| PATCH | `/contest-matches/:id/participants` | PROVIDER owner / STAFF assigned | Cập nhật người tham gia trong match, hỗ trợ drag/drop slot |
| POST | `/contest-matches/:id/results` | PROVIDER owner / STAFF assigned | Nhập kết quả thủ công cho match |
| POST | `/contest-matches/:id/advance` | PROVIDER owner / STAFF assigned | Đẩy winner/qualified registrations sang next match |
| POST | `/contests/:id/leaderboard/publish` | PROVIDER owner / STAFF assigned | Publish leaderboard vào `contests.config.leaderboard` |
| GET | `/contests/:id/audit-logs` | PROVIDER owner | Xem business audit logs của contest |

**POST /contests body:**
```json
{
  "name": "RCField Rental Spec Cup",
  "description": "Giai dua rental spec cho cong dong RCField",
  "track_type_id": "uuid",
  "participating_cafe_ids": ["uuid-cafe-1", "uuid-cafe-2"],
  "starts_at": "2026-07-20T09:00:00+07:00",
  "ends_at": "2026-07-20T12:00:00+07:00",
  "registration_opens_at": "2026-07-01T09:00:00+07:00",
  "registration_closes_at": "2026-07-19T18:00:00+07:00",
  "capacity": 32,
  "entry_fee": 0,
  "banner_image_url": "https://cdn.rcfield.vn/contests/spec-cup.jpg",
  "vehicle_rule": {
    "vehicle_policy": "RENTAL_ONLY",
    "assignment_policy": "AT_CHECK_IN"
  },
  "config": {
    "format": "KNOCKOUT",
    "drivers_per_match": 2,
    "seeding_mode": "MANUAL",
    "rules_text": "The le giai...",
    "prizes": [
      { "rank": 1, "title": "Champion", "description": "Voucher 500k" }
    ]
  }
}
```

**POST /contests/:id/matches/generate body:**
```json
{
  "format": "KNOCKOUT",
  "drivers_per_match": 2,
  "registration_ids": ["registration-1", "registration-2", "registration-3", "registration-4"],
  "seeding_mode": "MANUAL"
}
```

**PATCH /contest-matches/:id/participants body:**
```json
{
  "participants": [
    { "registration_id": "registration-1", "slot_no": 1, "lane": "A", "grid_position": 1 },
    { "registration_id": "registration-2", "slot_no": 2, "lane": "B", "grid_position": 2 }
  ]
}
```

**POST /contest-matches/:id/results body:**
```json
{
  "results": [
    {
      "registration_id": "registration-1",
      "finish_position": 1,
      "score": 10,
      "best_lap_ms": 18234,
      "total_time_ms": 120000,
      "is_winner": true,
      "result_note": "Won final"
    }
  ],
  "reason": "Manual staff entry"
}
```

**Leaderboard response:**
```json
{
  "data": {
    "standings": [
      {
        "rank": 1,
        "registration_id": "uuid",
        "user_id": "uuid",
        "fullName": "Nguyen Van A",
        "email": "driver@example.com",
        "score": 10,
        "best_lap_ms": 18234,
        "source_match_id": "uuid"
      }
    ]
  }
}
```

Rules:

- Chỉ `PROVIDER` owner tạo/sửa/open/close/cancel contest.
- `STAFF` không gọi full provider registration list; staff lookup/check-in bằng code và chỉ tại cafe được assign.
- `participating_cafe_ids` chỉ nhận cafe ACTIVE thuộc Provider hiện tại.
- Không tạo booking giả cho contest entry fee; `CONTEST_ENTRY` payment subject là phase payment sau.
- Schedule generation chỉ sau `CLOSED` hoặc `RUNNING`, và chỉ dùng registration `CONFIRMED`/`CHECKED_IN`.
- Một match không cố định A/B; dùng `contest_match_participants` để hỗ trợ 1, 2, 4 hoặc nhiều driver.
- Leaderboard phase này lưu trong `contests.config.leaderboard` như local contest snapshot; global leaderboard phase sau đọc từ verified `race_records`. Reward/prize là config hiển thị, không phát voucher tự động.
- Mọi mutation phải ghi `contest_audit_logs`.

### Universal Racing Network APIs — Minimal Current Implementation

Các API dưới đây là lớp community mỏng nằm trên contest hiện tại. Contest vẫn là runtime local/provider-level; global leaderboard chỉ đọc từ `race_records` đã verified.

#### Driver Passport

| Method | Endpoint | Actor | Mô tả |
|--------|----------|-------|-------|
| GET | `/me/driver-passport` | CUSTOMER | Xem passport, current title, stats tổng hợp và achievements đã unlock |
| PATCH | `/me/driver-passport` | CUSTOMER | Cập nhật handle/display name/privacy |
| GET | `/drivers/:handle` | Public/Auth | Xem public driver profile theo privacy |

**PATCH /me/driver-passport body:**
```json
{
  "driver_handle": "speednomad",
  "display_name": "Speed Nomad",
  "home_cafe_id": "uuid | null",
  "public_profile_enabled": true,
  "leaderboard_opt_in": true
}
```

#### Race Records & Leaderboards

| Method | Endpoint | Actor | Mô tả |
|--------|----------|-------|-------|
| POST | `/contests/:id/sync-race-records` | PROVIDER owner / ADMIN | Sync contest leaderboard đã publish sang verified race records |
| GET | `/leaderboards/global` | Public/Auth | Leaderboard toàn hệ thống, filter theo city/cafe/track/time |

**GET /leaderboards/global query:**
```text
city=Ho%20Chi%20Minh
cafe_id=uuid
vehicle_source=RENTAL|BYOC
period=daily|weekly|monthly|all_time
limit=50
```

Leaderboard response không trả email, phone, payment, booking note hoặc session private note.

#### Achievements

| Method | Endpoint | Actor | Mô tả |
|--------|----------|-------|-------|
| GET | `/achievements` | Public/Auth | Danh sách badge definitions đang active |

Rules hiện tại:

- `achievement_definitions` là DB source of truth, không hardcode ở FE/BE.
- Badge visit/count phase này chỉ tính từ `sessions.status = COMPLETED`; fallback `bookings.status = COMPLETED` chỉ để hỗ trợ dữ liệu cũ.
- `DISTINCT_CAFES_FROM_COMPLETED_PLAY` đếm số quán khác nhau từ completed play thật, không tính check-in ảo.

### Universal Racing Network APIs — Planned Expansion / Next Phase

Các API dưới đây chưa implement trong đợt tối giản hiện tại. Đây là hướng scale sau khi capstone ổn định.

| Method | Endpoint | Actor | Mô tả |
|--------|----------|-------|-------|
| POST | `/cafes/:id/passport-check-in` | STAFF/PROVIDER | Quét passport QR, ghi community check-in tại cafe |
| GET | `/leaderboards/cafes/:cafeId` | Public/Auth | Leaderboard public của một cafe opt-in |
| GET | `/me/race-records` | CUSTOMER | Thành tích chi tiết của driver hiện tại |
| PATCH | `/race-records/:id/verification` | ADMIN | Verify/reject/supersede record khi cần moderation |
| GET | `/me/achievements` | CUSTOMER | Badge đã unlock dạng feed/query riêng |
| POST | `/admin/achievements` | ADMIN | Tạo achievement definition |
| PATCH | `/admin/achievements/:id` | ADMIN | Sửa/ẩn achievement definition |

#### Grand Prix Series

| Method | Endpoint | Actor | Mô tả |
|--------|----------|-------|-------|
| GET | `/series` | Public/Auth | List Grand Prix Series public |
| GET | `/series/:id` | Public/Auth | Detail series + rounds |
| GET | `/series/:id/standings` | Public/Auth | Standings tính từ contest rounds đã publish |
| POST | `/admin/series` | ADMIN | Tạo series cross-provider |
| POST | `/admin/series/:id/rounds` | ADMIN | Link contest đã publish làm round |
| POST | `/admin/series/:id/recalculate` | ADMIN | Recalculate standings sau correction |

#### Team War / Clan War

| Method | Endpoint | Actor | Mô tả |
|--------|----------|-------|-------|
| GET | `/teams` | Public/Auth | List teams public |
| POST | `/teams` | CUSTOMER | Tạo racing team, creator là captain |
| POST | `/teams/:id/join-requests` | CUSTOMER | Xin tham gia team |
| POST | `/teams/:id/members/:memberId/approve` | Team captain | Approve member |
| POST | `/team-wars` | Team captain | Tạo challenge giữa hai team |
| POST | `/team-wars/:id/lock-roster` | Team captain / ADMIN | Lock roster trước race day |
| GET | `/team-wars/:id/results` | Public/Auth | Kết quả team war từ verified records |

Rules:

- Team War chỉ mở sau Driver Passport + verified race records.
- Roster bị lock trước race day; override phải có Admin audit.
- Team standings không dùng self-reported lap time.

---

## Phase 2 APIs

Các nhóm API sau không thuộc Phase 1: Universal Racing Network, multi-party dispute workflow nâng cao, SaaS tenant admin, AI jobs, analytics nâng cao, loyalty/dynamic pricing.

## Response Format

```typescript
// Success
{
  "data": T,
  "meta": {           // optional, cho list endpoints
    "total": number,
    "page": number,
    "limit": number
  }
}

// Error
{
  "error": {
    "code": "BOOKING_NOT_FOUND",
    "message": "Booking không tồn tại",
    "statusCode": 404
  }
}
```

## Common Error Codes

```
UNAUTHORIZED              401 — chưa đăng nhập
FORBIDDEN                 403 — không có quyền
BOOKING_NOT_FOUND         404
VEHICLE_NOT_AVAILABLE     409 — xe đã có người đặt
SLOT_CONFLICT             409 — trùng slot
INVALID_BOOKING_STATE     422 — transition không hợp lệ
EXTENSION_FEE_EXCEEDED    422 — vượt 50% deposit cap
INSPECTION_INCOMPLETE     422 — thiếu ảnh hoặc checklist
PAYMENT_REQUIRED          402 — chưa thanh toán
```

Riêng module Contest:

```
CONTEST_FEE_REQUIRED           402 — mở đăng ký khi chưa trả phí tổ chức giải
CONTEST_FEE_ORDER_EXISTS       409 — giải đã có đơn phí còn hiệu lực
CONTEST_FEE_CONTEST_NOT_DRAFT  400 — chọn gói khi giải không còn là bản nháp
CONTEST_FORMAT_NOT_RELEASED    400 — thể thức chưa mở để tạo giải
CONTEST_TRACK_TYPE_UNAVAILABLE 400 — chi nhánh chưa có sân đúng loại đường đua
```

### Contest Vehicle Flow Addendum

Customer vehicles:

| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/me/customer-vehicles` | CUSTOMER | List active/archived BYOC car records owned by current customer |
| POST | `/me/customer-vehicles` | CUSTOMER | Create BYOC car record with `name`, `scale`, `chassis_type`, `frequency` |
| PATCH | `/me/customer-vehicles/:id` | CUSTOMER owner | Update own BYOC car record |
| DELETE | `/me/customer-vehicles/:id` | CUSTOMER owner | Soft delete own BYOC car record |

Contest registration vehicle payload:

```json
{
  "vehicle_source": "BYOC",
  "customer_vehicle_id": "uuid",
  "metadata": { "note": "optional" }
}
```

```json
{
  "vehicle_source": "RENTAL",
  "booking_id": "uuid",
  "vehicle_id": "uuid",
  "metadata": { "note": "optional" }
}
```

- `BYOC` registration is created as `PENDING`; Provider/Staff reviews it through `POST /contest-registrations/:id/approve` or `POST /contest-registrations/:id/reject` with optional `reason_code` (`TRACK_INCOMPATIBLE | RULESET_INCOMPATIBLE | UNVERIFIED_VEHICLE | OTHER`).
- `RENTAL` registration should link to the normal Booking flow using `booking_id`; that booking owns payment, rental hold, session check-in/check-out and inspection.
- `POST /contest-matches/:id/results/correct` is the stable result correction endpoint. `force_cascade=true` is Provider-only behavior when downstream matches were already completed.
- `GET /contests/:id/audit-logs` and `GET /contests/:id/metrics` support operational monitoring of registration review, check-in, match result and correction activity.

### Contest banner upload

`POST /api/v1/contests/:id/banner` `[auth]` accepts `multipart/form-data` with field `file` and returns:

```json
{
  "success": true,
  "data": {
    "banner_image_url": "https://res.cloudinary.com/.../contest-banner.png",
    "public_id": "rcfield/contests/.../contest-banner"
  }
}
```

---

## Thanh toán chuyển khoản theo chi nhánh

Mỗi chi nhánh có thể nhận tiền booking vào tài khoản ngân hàng của chính mình.
Chi nhánh **chưa cấu hình hoặc chưa xác minh vẫn dùng cổng thanh toán chung** —
đây là mặc định và không có gì thay đổi so với trước.

Spec đầy đủ: `specs/019-cafe-bank-payment/`.

### Cấu hình nhận tiền — chỉ PROVIDER chủ sở hữu

| Method | Path | Ghi chú |
|---|---|---|
| GET | `/v1/cafes/:cafeId/payment-settings` | số tài khoản đã che; chưa cấu hình trả `null` với 200 |
| GET | `/v1/cafes/:cafeId/payment-settings/edit` | số tài khoản đầy đủ, chỉ cho màn chỉnh sửa |
| PUT | `/v1/cafes/:cafeId/payment-settings` | đổi ngân hàng/số tài khoản luôn đặt lại `is_verified = false` |
| GET | `/v1/cafes/:cafeId/payment-settings/sample-qr` | mã QR mẫu 10.000đ — **luôn là mã ngân hàng thật** |
| POST | `/v1/cafes/:cafeId/payment-settings/verify` | chủ quán xác nhận đã quét thử; chỉ sau bước này chi nhánh mới nhận chuyển khoản |

STAFF và ADMIN đều bị từ chối 403 trên toàn bộ nhóm này.

### Đối soát

| Method | Path | Ai gọi được |
|---|---|---|
| GET | `/v1/cafes/:cafeId/bank-transactions` | PROVIDER chủ sở hữu — sổ đầy đủ kèm số tổng |
| GET | `/v1/cafes/:cafeId/bank-transactions/pending` | thêm STAFF được phân công — **chỉ** hàng đang treo, không có số tổng |
| POST | `/v1/bank-transactions/:id/assign` | PROVIDER chủ sở hữu hoặc STAFF được phân công |
| POST | `/v1/bank-transactions/:id/ignore` | chỉ PROVIDER chủ sở hữu, bắt buộc ghi lý do |

### Điểm nhận thông báo tiền về

`POST /api/v1/payments/bank-webhook` — không có `authenticate`, xác thực bằng
header `Authorization: Apikey <BANK_WEBHOOK_API_KEY>`. Payload bám đúng định dạng
SePay để chuyển sang dịch vụ thật không phải sửa mã.

**Luôn trả 200 khi khoá hợp lệ**, kể cả khi không khớp booking nào — trả khác 200
khiến dịch vụ đối soát gửi lại vô hạn. Sai khoá → 401 và không ghi vào sổ.

Xác nhận booking đi qua `processConfirmationResult` — cùng hàm luồng VNPay dùng,
nên guard hết hạn giữ chỗ và chống trùng áp dụng y hệt.

### Thay đổi tương thích ngược

`POST /v1/bookings/:id/checkout` nhận thêm `payment_method` tuỳ chọn
(`vnpay | bank_transfer`). **Vắng mặt = `vnpay`**, hành vi không đổi. Phản hồi có
thêm `flow` (`redirect | bank_transfer`) và khối `bank_transfer` khi áp dụng.

`GET /v1/cafes/:cafeId/payment-methods` (công khai) trả danh sách phương thức khả
dụng; một phần tử thì giao diện đi thẳng, không hiện lựa chọn.
