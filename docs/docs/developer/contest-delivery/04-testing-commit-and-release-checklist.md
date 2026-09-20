# Contest Testing, Commit And Release Checklist

**Last updated:** 2026-07-11

---

## 1. Kiểm thử tối thiểu trước commit

## Backend

- chạy `npm run build` trong `rcfield-be`
- nếu có test mới: chạy test route/service liên quan contest
- verify migration compile được

## Frontend

- chạy `npm run build` trong `rcfield-fe`
- verify route mới resolve được
- verify form contest không cần mock fallback

---

## 2. Checklist nghiệp vụ

### Catalog

- type / format / template load từ API
- create form không hardcode dropdown contest

### Contest CRUD

- provider tạo contest được
- provider sửa contest `DRAFT/OPEN` được
- provider open / close / cancel được
- public thấy contest không phải `DRAFT`

### Registration

- customer đăng ký bằng booking rental hợp lệ
- booking sai owner bị chặn
- booking sai branch bị chặn
- booking chưa `CONFIRMED` bị chặn
- booking sai thời gian bị chặn

### Entry fee readiness

- contest free -> registration `PENDING_REVIEW`
- contest paid -> registration `PENDING_PAYMENT`
- provider mark paid được
- provider waive được
- approve bị chặn nếu fee vẫn pending

### Event-day

- lookup bằng `check_in_code`
- check-in đúng branch
- staff sai branch bị chặn

---

## 3. Checklist release notes

Khi release hoặc demo, phải ghi rõ:

### Đã hoàn thành

- catalog data-driven
- provider contest CRUD
- public contest listing/detail
- rental registration linked booking
- entry fee state management
- provider/staff lookup + check-in foundation

### Chưa hoàn thành

- match generation runtime thật
- result correction / advance
- local leaderboard publish
- payment gateway cho `CONTEST_ENTRY`

---

## 4. Commit strategy khuyến nghị

Chia commit nhỏ, dễ review:

1. `feat(contest-db): add taxonomy and contest core schema foundation`
2. `feat(contest-be): add contest entities, validators and catalog apis`
3. `feat(contest-be): add provider contest crud and public queries`
4. `feat(contest-be): add rental contest registration and fee review flow`
5. `feat(contest-be): add registration lookup and contest checkin`
6. `feat(contest-fe): add contest types, api layer and routes`
7. `feat(contest-fe): add provider contest list and form pages`
8. `feat(contest-fe): add public contest pages and customer registration status page`
9. `docs(contest): add delivery roadmap, rollout and release checklist`

---

## 5. Branch handling

Nếu làm việc trên 1 branch duy nhất:

- commit tất cả thay đổi vào branch hiện tại
- push branch hiện tại lên remote

Nếu cần nhiều branch theo team:

- `feature/contest-db-core`
- `feature/contest-be-core`
- `feature/contest-fe-core`
- `docs/contest-delivery`

Trong repo hiện tại, nếu user không yêu cầu tách branch mới từ đầu, ưu tiên:

- commit sạch trên branch đang làm
- chỉ tạo thêm branch khi có yêu cầu rõ hoặc workflow team cần

---

## 6. Trạng thái test của lượt triển khai này

Đã chạy thành công:

- `rcfield-be`: `npm run build`
- `rcfield-fe`: `npm run build`

Chưa chạy:

- backend unit/integration tests riêng cho contest
- FE UI automation tests riêng cho contest
- migration run trên DB thật của môi trường local

Vì vậy, mức xác nhận hiện tại là:

- compile/build thành công
- chưa phải full runtime verification trên database và user flow end-to-end

