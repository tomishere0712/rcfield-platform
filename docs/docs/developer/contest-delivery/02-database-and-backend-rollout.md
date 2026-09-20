# Contest Database And Backend Rollout

**Last updated:** 2026-07-11

---

## 1. Quy tắc DB review trước migration

Mỗi thay đổi DB mới cho contest phải đi qua 1 vòng review trước khi code:

1. Mục tiêu nghiệp vụ của cột / bảng
2. Quan hệ FK và ownership
3. Backfill strategy
4. Index strategy
5. Rollback strategy
6. Ảnh hưởng lên API / FE / seed / test

Không thêm field “cho chắc” nếu chưa có use case rõ.

---

## 2. Schema phase đã triển khai

## Master data

### `contest_types`

Các cột:

- `id`
- `code`
- `name`
- `description`
- `is_active`
- `sort_order`
- `metadata`
- `created_at`
- `updated_at`

### `contest_formats`

Các cột:

- `id`
- `code`
- `name`
- `description`
- `supports_bracket`
- `supports_time_attack`
- `supports_multi_round`
- `is_active`
- `sort_order`
- `metadata`
- `created_at`
- `updated_at`

### `contest_templates`

Các cột:

- `id`
- `contest_type_id`
- `contest_format_id`
- `code`
- `name`
- `description`
- `default_config`
- `vehicle_policy_options`
- `feature_flags`
- `is_active`
- `sort_order`
- `created_at`
- `updated_at`

Seed hiện tại:

- type: `PROVIDER_STANDARD`
- format: `TIME_TRIAL`
- format: `KNOCKOUT`
- template: `provider_standard_time_trial`
- template: `provider_standard_knockout`

## Contest runtime

### `contests` refactor

Đã thêm:

- `provider_id`
- `track_type_id`
- `registration_opens_at`
- `registration_closes_at`
- `banner_image_url`
- `contest_type_id`
- `contest_format_id`
- `contest_template_id`
- `config`
- `deleted_at`

Giữ legacy tạm thời:

- `cafe_id`
- `track_type`

Backfill:

- `provider_id` từ `cafes.provider_id`
- `track_type_id` từ `track_types.code`

### `contest_cafes`

Chứa danh sách chi nhánh tham gia contest.

Các cột:

- `contest_id`
- `cafe_id`
- `role`
- `capacity_override`
- `check_in_enabled`
- `display_order`

### `contest_registrations` refactor

Đã thêm:

- `participant_role_snapshot`
- `booking_id`
- `check_in_code`
- `checked_in_cafe_id`
- `checked_in_by`
- `checked_in_at`
- `cancelled_by`
- `cancelled_at`
- `cancellation_reason`
- `payment_status`
- `entry_fee_amount`
- `entry_fee_due_at`
- `entry_fee_marked_paid_by`
- `entry_fee_marked_paid_at`
- `metadata`

Payment status phase đầu:

- `NOT_REQUIRED`
- `PENDING_PAYMENT`
- `PENDING_REVIEW`
- `WAIVED`
- `MARKED_PAID`

### `contest_matches`

Chứa unit runtime cho:

- heat
- match
- final
- bracket node

### `contest_match_participants`

Chứa:

- slot
- lane
- grid
- seed
- score
- best lap
- total time
- result note

### `contest_audit_logs`

Chứa audit mutation nghiệp vụ contest.

---

## 3. API đã triển khai

## Catalog

- `GET /contest-catalog/types`
- `GET /contest-catalog/formats`
- `GET /contest-catalog/templates`

## Contest CRUD

- `GET /contests`
- `GET /cafes/:cafeId/contests`
- `GET /contests/:contestId`
- `POST /contests`
- `PATCH /contests/:contestId`
- `POST /contests/:contestId/open`
- `POST /contests/:contestId/close`
- `POST /contests/:contestId/cancel`

## Registration

- `POST /contests/:contestId/register`
- `GET /me/contest-registrations`
- `GET /contests/:contestId/registrations`
- `POST /contest-registrations/:registrationId/mark-entry-fee-paid`
- `POST /contest-registrations/:registrationId/waive-entry-fee`
- `POST /contest-registrations/:registrationId/approve`
- `POST /contest-registrations/:registrationId/reject`
- `POST /contest-registrations/:registrationId/cancel`

## Event-day

- `GET /contests/:contestId/registrations/lookup?check_in_code=...`
- `POST /contest-registrations/:registrationId/check-in`

---

## 4. Rule enforcement đã có

### Provider contest CRUD

- chỉ `PROVIDER`
- contest phải thuộc provider hiện tại
- branch phải thuộc provider hiện tại
- branch phải `ACTIVE`
- template phải khớp type + format

### Rental contest registration

- chỉ `CUSTOMER`
- contest phải `OPEN`
- phase đầu chỉ support `RENTAL`
- booking phải tồn tại và thuộc customer
- booking phải `CONFIRMED`
- booking phải thuộc branch tham gia contest
- booking phải giao thời gian với contest
- vehicle phải nằm trong booking

### Contest entry fee readiness

Nếu `entry_fee = 0`:

- registration -> `PENDING_REVIEW`

Nếu `entry_fee > 0`:

- registration -> `PENDING_PAYMENT`
- provider phải `mark paid` hoặc `waive`
- sau đó mới approve được

### Check-in

- registration phải `CONFIRMED`
- nếu có fee thì fee không được pending
- cafe check-in phải thuộc `contest_cafes`
- `STAFF` chỉ được check-in ở branch được assign

---

## 5. Phần backend còn thiếu theo roadmap

## Match generation

Cần làm tiếp:

- `GET /contests/:id/matches`
- `POST /contests/:id/matches/generate`
- `PATCH /contest-matches/:id/participants`

## Result runtime

Cần làm tiếp:

- `POST /contest-matches/:id/results`
- `POST /contest-matches/:id/results/correct`
- `POST /contest-matches/:id/advance`
- `POST /contests/:id/leaderboard/publish`
- `GET /contests/:id/audit-logs`
- `GET /contests/:id/metrics`

## Contest fee payment thật

Phase sau mới mở:

- `contest_registration_id` nullable trên payment tables
- gateway payment cho `CONTEST_ENTRY`

---

## 6. Suggested backend commit slicing

1. migration + enums + entities
2. catalog APIs
3. contest CRUD
4. rental registration
5. fee review actions
6. lookup + check-in
7. match generation
8. result + leaderboard

