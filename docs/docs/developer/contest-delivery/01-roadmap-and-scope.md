# Contest Roadmap And Scope

**Last updated:** 2026-07-11

---

## 1. Mục tiêu delivery

Contest module được triển khai theo hướng:

- data-driven từ DB -> BE -> FE
- Provider-level contest trước
- rental contest liên kết booking trước
- contest fee có trạng thái nghiệp vụ trước, gateway payment sau
- giữ đồ án gọn, không mở hết Universal Racing Network ngay

---

## 2. Boundary nghiệp vụ

### Contest sở hữu

- contest catalog
- contest CRUD
- branch participation
- registration
- contest fee state
- event-day check-in
- match / heat / bracket
- manual result
- local leaderboard
- audit log

### Booking / Session / Payment sở hữu

- rental vehicle hold
- slot usage thực tế
- deposit
- rental fee
- inspection
- checkout settlement

### Liên kết giữa hai lớp

- `contest_registrations.booking_id`
- `contest_registrations.vehicle_id`

---

## 3. Data-driven taxonomy

Contest phải phân loại theo 3 lớp:

### `contest_types`

Loại nghiệp vụ / dòng sản phẩm contest.

Ví dụ:

- `PROVIDER_STANDARD`
- `MONTHLY_CUP`
- `SEASONAL_EVENT`

### `contest_formats`

Cách thi đấu.

Ví dụ:

- `TIME_TRIAL`
- `KNOCKOUT`
- `QUALIFYING_FINAL`

### `contest_templates`

Template vận hành, map theo:

- `contest_type_id`
- `contest_format_id`
- `default_config`
- `vehicle_policy_options`
- `feature_flags`

---

## 4. Phase roadmap

## Phase 0 — Foundation review

Mục tiêu:

- chốt taxonomy
- chốt schema
- chốt boundary contest vs booking/payment

Output:

- master data tables
- delivery docs
- sidebar docs update

## Phase 1 — Contest core schema

Mục tiêu:

- refactor legacy contest schema
- thêm bảng runtime mới

Output:

- `contests` refactor
- `contest_cafes`
- `contest_registrations` refactor
- `contest_matches`
- `contest_match_participants`
- `contest_audit_logs`

## Phase 2 — Contest CRUD và public surfaces

Mục tiêu:

- provider tạo contest bằng catalog data
- public xem contest

Output:

- provider create/edit/list
- public list/detail

## Phase 3 — Registration và contest fee readiness

Mục tiêu:

- customer đăng ký bằng booking rental thật
- provider xử lý entry fee state

Output:

- register
- mark fee paid
- waive
- approve / reject

## Phase 4 — Event-day check-in

Mục tiêu:

- provider/staff lookup registration
- check-in đúng branch

Output:

- lookup by `check_in_code`
- branch-scoped check-in

## Phase 5 — Match generation

Mục tiêu:

- generate runtime cho `TIME_TRIAL`
- generate runtime cho `KNOCKOUT`

Output:

- `/contests/:id/matches/generate`
- participant ordering

## Phase 6 — Results và leaderboard

Mục tiêu:

- submit result
- correct result
- advance
- publish local leaderboard

Output:

- contest runtime hoàn chỉnh

## Phase 7 — FE cleanup

Mục tiêu:

- bỏ hoàn toàn mock ở contest surfaces
- đồng bộ UI system

## Phase 8 — Contest entry payment gateway

Mục tiêu:

- mở payment thật cho `CONTEST_ENTRY`

Output:

- payment component / transaction mapping cho contest registration

---

## 5. Scope đang chạy thật trong repo

Đã chạy thật:

- Phase 0
- Phase 1
- phần lớn Phase 2
- phần lớn Phase 3
- phần cốt lõi của Phase 4

Chưa chạy thật:

- Phase 5
- Phase 6
- Phase 8

---

## 6. Nguyên tắc giữ scope gọn

Phase đầu chỉ support runtime thật:

- `TIME_TRIAL`
- `KNOCKOUT`

Phase đầu registration chính:

- `vehicle_source = RENTAL`
- booking phải `CONFIRMED`

BYOC:

- giữ schema sẵn
- chưa mở runtime đầy đủ nếu `customer_vehicles` chưa hoàn thiện live-data end-to-end

