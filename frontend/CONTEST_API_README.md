# Contest API README

File này mô tả luồng `contest` đang có ở BE, role nào được gọi API nào, thứ tự FE nên gọi, và cách seed data để test với `provider@gmail.com`.

## 1. Điều kiện để contest chạy được

Contest core phụ thuộc migration `1784000000000-ContestCoreFoundation.ts`.

Nếu FE bị lỗi kiểu:

- không tải được `contest type`
- không tải được `format`
- không tải được `template`
- DB báo thiếu `contest_types`, `contest_formats`, `contest_templates`

thì cần chạy:

```bash
npm run migration:run
```

Sau đó seed dữ liệu:

```bash
npm run seed:all
```

Hoặc chỉ seed contest sau khi đã có user/cafe/operations:

```bash
npm run seed:contests
```

## 2. Tài khoản seed liên quan

- `provider@gmail.com` / `123456`
- `staff@gmail.com` / `123456`
- `customer@gmail.com` / `123456`
- `contest.customer1@gmail.com` / `123456`
- `contest.customer2@gmail.com` / `123456`
- `contest.customer3@gmail.com` / `123456`
- `contest.customer4@gmail.com` / `123456`

## 3. Dữ liệu contest được seed cho provider@gmail.com

Script `src/seeds/seed-contests.ts` tạo 4 contest mẫu:

1. `"[SEED-CONTEST] Draft Provider Setup"`
2. `"[SEED-CONTEST] Open Registration Drift Cup"`
3. `"[SEED-CONTEST] Running Knockout Night"`
4. `"[SEED-CONTEST] Completed Time Trial Finals"`

Ý nghĩa:

- `DRAFT`: test managed list/detail của provider
- `OPEN`: test dashboard registration và catalog create/edit
- `RUNNING`: test list registrations, matches, audit logs, metrics
- `COMPLETED`: test detail có leaderboard đã publish

## 4. Catalog APIs cho màn Create Contest

Các API này là public.

### `GET /api/v1/contest-catalog/types`

FE dùng để đổ dropdown `Contest type`.

Role:

- public
- provider
- staff
- customer

### `GET /api/v1/contest-catalog/formats`

FE dùng để đổ dropdown `Format`.

Role:

- public
- provider
- staff
- customer

### `GET /api/v1/contest-catalog/templates`

Query hỗ trợ:

- `contest_type_id`
- `contest_format_id`
- `active_only=true`

FE nên gọi lại khi user đổi `contest_type_id` hoặc `contest_format_id`.

Role:

- public
- provider
- staff
- customer

## 5. Contest listing/detail

### `GET /api/v1/contests`

Query đang hỗ trợ:

- `page`
- `limit`
- `scope=managed`
- `status`
- `contest_type_id`
- `contest_format_id`
- `cafe_id`
- `query`

Role:

- public: chỉ thấy contest không phải `DRAFT` và `CANCELLED`
- provider:
  - không truyền `scope`: xem public list
  - truyền `scope=managed`: xem contest mình quản lý

FE provider page danh sách contest nên gọi:

```text
GET /api/v1/contests?scope=managed&page=1&limit=20
```

### `GET /api/v1/cafes/:cafeId/contests`

FE dùng khi cần lọc contest theo chi nhánh.

Role:

- public
- provider

### `GET /api/v1/contests/:contestId`

Role:

- public: chỉ xem contest public
- provider owner: xem được cả `DRAFT`

Lưu ý:

- BE đã chặn không cho public xem `DRAFT` hoặc `CANCELLED`

## 6. Provider CRUD flow

### `POST /api/v1/contests`

Role:

- `PROVIDER`

Body chính:

- `name`
- `description`
- `contest_type_id`
- `contest_format_id`
- `contest_template_id`
- `track_type_id`
- `participating_cafe_ids`
- `starts_at`
- `ends_at`
- `registration_opens_at`
- `registration_closes_at`
- `capacity`
- `entry_fee`
- `banner_image_url`
- `vehicle_rule`
- `config`

FE create form nên gọi theo thứ tự:

1. Load `types`
2. Load `formats`
3. Khi user chọn type/format thì load `templates`
4. Load branch list của provider từ module cafe
5. Submit `POST /contests`

### `PATCH /api/v1/contests/:contestId`

Role:

- `PROVIDER`

Chỉ sửa được khi contest đang:

- `DRAFT`
- `OPEN`

### `POST /api/v1/contests/:contestId/open`

Role:

- `PROVIDER`

Dùng khi provider muốn public contest và mở đăng ký.

### `POST /api/v1/contests/:contestId/close`

Role:

- `PROVIDER`

FE nên gọi trước bước generate match.

### `POST /api/v1/contests/:contestId/cancel`

Role:

- `PROVIDER`

## 7. Registration flow

## 7.1 Provider side

### `GET /api/v1/contests/:contestId/registrations`

Role:

- `PROVIDER`

FE provider detail page nên gọi để render bảng người đăng ký.

### `POST /api/v1/contest-registrations/:registrationId/mark-entry-fee-paid`

Role:

- `PROVIDER`

### `POST /api/v1/contest-registrations/:registrationId/waive-entry-fee`

Role:

- `PROVIDER`

### `POST /api/v1/contest-registrations/:registrationId/approve`

Role:

- `PROVIDER`

### `POST /api/v1/contest-registrations/:registrationId/reject`

Role:

- `PROVIDER`

### `POST /api/v1/contest-registrations/:registrationId/cancel`

Role:

- `PROVIDER`
- `CUSTOMER` cho chính registration của họ

## 7.2 Customer side

### `POST /api/v1/contests/:contestId/register`

Role:

- `CUSTOMER`

Contract hiện tại của BE:

- mới hỗ trợ `vehicle_source = RENTAL`
- cần `booking_id`
- cần `vehicle_id`

Guard hiện tại:

- contest phải `OPEN`
- phải đang nằm trong registration window
- contest chưa full capacity
- booking phải thuộc customer
- booking phải `CONFIRMED`
- booking phải đúng branch contest
- booking phải đúng track type contest
- booking phải overlap với thời gian contest

### `GET /api/v1/me/contest-registrations`

Role:

- `CUSTOMER`

## 8. Check-in flow

### `GET /api/v1/contests/:contestId/registrations/lookup?check_in_code=...`

Role:

- `PROVIDER`
- `STAFF`

Use case:

- staff quét / nhập mã check-in

### `POST /api/v1/contest-registrations/:registrationId/check-in`

Role:

- `PROVIDER`
- `STAFF`

Body:

```json
{
  "checked_in_cafe_id": "uuid"
}
```

Guard:

- registration phải `CONFIRMED`
- cafe check-in phải thuộc `contest_cafes`
- nếu là staff thì staff phải được assign đúng cafe đó

## 9. Runtime match flow

## 9.1 Các API đang dùng cho FE provider

### `GET /api/v1/contests/:contestId/matches`

Role:

- `PROVIDER`

### `POST /api/v1/contests/:contestId/matches/generate`

Role:

- `PROVIDER`

Body chính:

- `cafe_id`
- `track_config_id` optional
- `registration_ids`
- `drivers_per_match`
- `seeding_mode`

Khuyến nghị FE:

1. Provider đóng đăng ký
2. Load registrations
3. Chỉ cho chọn registrations có status `CONFIRMED` hoặc `CHECKED_IN`
4. Gọi generate matches
5. Render bracket / heats từ response

### `PATCH /api/v1/contest-matches/:matchId/participants`

Role:

- `PROVIDER`

### `POST /api/v1/contest-matches/:matchId/results`

Role:

- `PROVIDER`

### `POST /api/v1/contest-matches/:matchId/results/correct`

Role:

- `PROVIDER`

Nếu match đã advance participant sang round sau thì phải truyền:

```json
{
  "force_cascade": true
}
```

### `POST /api/v1/contest-matches/:matchId/advance`

Role:

- `PROVIDER`

## 9.2 Publish leaderboard

### `POST /api/v1/contests/:contestId/leaderboard/publish`

Role:

- `PROVIDER`

Guard hiện tại:

- contest phải có match
- không được còn match ở trạng thái:
  - `DRAFT`
  - `READY`
  - `RUNNING`
- phải có ít nhất một kết quả completed

Sau publish:

- `contests.config.published_leaderboard` được cập nhật
- `contest.status` được đưa về `COMPLETED`

## 10. Audit và metrics

### `GET /api/v1/contests/:contestId/audit-logs`

Role:

- `PROVIDER`

### `GET /api/v1/contests/:contestId/metrics`

Role:

- `PROVIDER`

Provider detail page nên gọi thêm 2 API này để dựng:

- số lượng registrations theo trạng thái
- số lượng match theo trạng thái
- leaderboard đã publish hay chưa
- timeline audit vận hành

## 11. Full flow khuyến nghị cho FE theo role

### Provider Owner

1. `GET /contest-catalog/types`
2. `GET /contest-catalog/formats`
3. `GET /contest-catalog/templates?...`
4. `POST /contests`
5. `POST /contests/:contestId/open`
6. `GET /contests/:contestId/registrations`
7. approve/reject/mark fee nếu cần
8. `POST /contests/:contestId/close`
9. `POST /contests/:contestId/matches/generate`
10. `GET /contests/:contestId/matches`
11. submit results / correct / advance
12. `POST /contests/:contestId/leaderboard/publish`
13. `GET /contests/:contestId/metrics`
14. `GET /contests/:contestId/audit-logs`

### Staff

BE hiện tại staff dùng được cho event-day flow:

1. `GET /contests/:contestId/registrations/lookup`
2. `POST /contest-registrations/:registrationId/check-in`

Lưu ý:

- runtime match update/result hiện tại route đang để `PROVIDER` call
- nếu FE staff cần nhập result trực tiếp thì phải mở rộng thêm route/service

### Customer

1. `GET /contests`
2. `GET /contests/:contestId`
3. `POST /contests/:contestId/register`
4. `GET /me/contest-registrations`
5. `POST /contest-registrations/:registrationId/cancel`

## 12. Ghi chú để FE không bị lỗi

- Không hardcode contest types / formats / templates ở FE
- `template` phải load theo `contest_type_id` và `contest_format_id`
- Provider list page phải dùng `scope=managed`
- Customer register flow hiện tại chỉ dùng `RENTAL`
- Khi publish leaderboard, FE phải xử lý lỗi `CONTEST_MATCHES_INCOMPLETE`
- Khi customer register, FE phải xử lý:
  - `CONTEST_NOT_OPEN`
  - `CONTEST_REGISTRATION_NOT_OPEN_YET`
  - `CONTEST_REGISTRATION_CLOSED`
  - `CONTEST_CAPACITY_REACHED`
  - `BOOKING_NOT_CONFIRMED`
  - `BOOKING_CAFE_MISMATCH`
  - `BOOKING_TRACK_TYPE_MISMATCH`
  - `BOOKING_TIME_MISMATCH`
