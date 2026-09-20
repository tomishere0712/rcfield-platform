# Contest Delivery Docs

**Last updated:** 2026-07-16  
**Owner:** Product / Backend / Frontend / QA

> Bộ tài liệu này là playbook triển khai thực tế cho Contest Core và các phase mở rộng liên quan.  
> Mục tiêu là để bất kỳ ai nhìn vào cũng hiểu: phase nào làm gì, thứ tự rollout, DB cần thêm gì, API nào cần mở, FE phải hiển thị ra sao, và checklist test/release trước khi merge.

---

## Mục lục

| File | Mục đích | Đọc khi nào |
|------|----------|-------------|
| [01-roadmap-and-scope.md](./01-roadmap-and-scope.md) | Roadmap tổng thể, boundary, mức scope từng phase | Trước khi lập kế hoạch hoặc estimate |
| [02-database-and-backend-rollout.md](./02-database-and-backend-rollout.md) | Kế hoạch DB/BE chi tiết theo phase, migration, entity, API, permission | Trước khi code backend |
| [03-frontend-rollout.md](./03-frontend-rollout.md) | Kế hoạch FE, route, state, UI rules, thay mock bằng live data | Trước khi code frontend |
| [04-testing-commit-and-release-checklist.md](./04-testing-commit-and-release-checklist.md) | Checklist test, commit strategy, release notes, branch handling | Trước khi commit / release |
| [05-contest-current-backend-vs-requested-flow.md](./05-contest-current-backend-vs-requested-flow.md) | Đối chiếu yêu cầu contest với backend hiện có, gap và FE flow cần hiển thị | Khi cần hiểu nhanh hiện trạng thật |

---

## Nguyên tắc chung

1. Contest **không thay thế** booking/session/payment hiện có.
2. Contest entry fee **không được tạo booking giả**.
3. Mọi danh mục contest hiển thị ở FE phải đi từ DB -> BE -> FE.
4. Mọi thay đổi DB mới phải có bước **DB review** trước khi viết migration.
5. FE contest không dùng mock; dùng đúng visual system provider/public hiện có.

---

## Trạng thái implementation hiện tại

Đã implement trong repo:

- Contest catalog master data:
  - `contest_types`
  - `contest_formats`
  - `contest_templates`
- Contest runtime foundation:
  - `contests` refactor
  - `contest_cafes`
  - `contest_registrations` refactor
  - `contest_matches`
  - `contest_match_participants`
  - `contest_audit_logs`
- Backend APIs:
  - contest catalog
  - provider contest CRUD
  - public contest list/detail
  - customer rental contest registration
  - customer BYOC declaration registration
  - customer create contest entry payment URL (`CONTEST_ENTRY`)
  - provider/staff fee review / waive / approve / reject / disqualify
  - provider/staff lookup + contest check-in
  - contest staff assignment
  - match generation cho `TIME_TRIAL` / `KNOCKOUT`
  - result submission / correction / advance
  - publish leaderboard local
  - metrics có revenue summary cơ bản
  - audit log endpoints
  - contest ban / lift ban endpoints
- Frontend:
  - provider contest list
  - provider contest create/edit
  - provider contest runtime dashboard
  - provider leaderboard / audit / metrics panels
  - public contest list/detail
  - customer contest registrations
  - staff contest check-in / runtime

Chưa hoàn tất:

- Refund/cancel lifecycle đầy đủ cho `CONTEST_ENTRY`
- Auto-close scheduler đồng bộ status theo registration window
- BYOC vehicle registry hoàn chỉnh dùng `customer_vehicle_id`
- Incident / protest / appeal workflow riêng cho contest governance
- Một số refinement FE cho governance screens và operator UX

