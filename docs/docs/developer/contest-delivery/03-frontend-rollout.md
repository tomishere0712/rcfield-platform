# Contest Frontend Rollout

**Last updated:** 2026-07-11

---

## 1. FE principles

Contest FE phải tuân theo:

- không hardcode catalog contest
- không dùng mock cho contest surfaces
- không tạo visual language mới
- dùng đúng shell, primitives và màu hiện có

---

## 2. Data sources

FE contest phải lấy dữ liệu từ API thật:

### Catalog

- `GET /contest-catalog/types`
- `GET /contest-catalog/formats`
- `GET /contest-catalog/templates`

### Runtime

- `GET /contests`
- `GET /contests/:id`
- `POST /contests`
- `PATCH /contests/:id`
- `POST /contests/:id/open|close|cancel`
- `POST /contests/:id/register`
- `GET /me/contest-registrations`
- `GET /contests/:id/registrations`
- `POST /contest-registrations/:id/mark-entry-fee-paid`
- `POST /contest-registrations/:id/waive-entry-fee`
- `POST /contest-registrations/:id/approve`
- `POST /contest-registrations/:id/reject`

---

## 3. Routes đã triển khai

## Public

- `/contests`
- `/contests/:contestId`

## Provider

- `/provider/contests`
- `/provider/contests/new`
- `/provider/contests/:contestId/edit`

## Customer

- `/customer/contest-registrations`

---

## 4. Screens đã triển khai

### Provider contest list

Mục đích:

- xem toàn bộ contest managed
- open / close / cancel
- điều hướng create / edit

### Provider contest form

Mục đích:

- create / edit contest
- chọn `contest_type`
- chọn `contest_format`
- chọn `contest_template`
- chọn nhiều branch
- cấu hình time window, capacity, entry fee, vehicle policy
- nhập `config` JSON

### Public contest list

Mục đích:

- public khám phá contest
- xem loại contest, format, host branch

### Public contest detail

Mục đích:

- xem detail contest
- customer dùng booking confirmed để đăng ký rental contest

### Customer contest registrations

Mục đích:

- xem trạng thái đăng ký
- xem trạng thái fee
- xem `check_in_code`

---

## 5. UI rules bắt buộc

### Provider surfaces

Phải dùng:

- `ProviderShell`
- `ProviderPageHeader`
- `Panel`
- `PanelTitle`

Màu:

- giữ palette provider hiện có
- dùng các màu action quen thuộc:
  - open: xanh
  - close/run: amber
  - cancel/reject: đỏ

### Public surfaces

Phải dùng:

- `PublicPageShell`
- token màu public hiện có

### Customer surfaces

Phải dùng:

- `CustomerPageShell`

---

## 6. Mock cleanup policy

Contest module phải sạch các loại mock sau:

- fake contest list
- hardcoded type / format / template list
- placeholder contest detail
- fake registration status data
- fake bracket / leaderboard demo rows

Ngoài phạm vi contest:

- tạm thời không bắt buộc dọn hết mock toàn hệ thống

---

## 7. FE rollout tiếp theo

## Event-day UI

Cần làm tiếp:

- provider/staff lookup registration
- branch-scoped check-in screen

## Match runtime UI

Cần làm tiếp:

- schedule board
- participant ordering
- match detail
- result entry
- result correction
- leaderboard publish

## Contest payment UI phase sau

Cần làm tiếp:

- pay contest entry fee
- return flow
- payment history on registration

