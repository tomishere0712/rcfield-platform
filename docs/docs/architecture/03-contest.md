# Architecture: Contest

**Last Updated:** 2026-07-16  
**Spec refs:** `docs/spec/03-contest.md`, `docs/spec/business-rules/BR-contest.md`

---

## 1. Architecture Boundary

Contest hiện có 5 cụm chức năng:

```text
Setup
Registration
Event Day
Runtime
Publishing / Governance
```

Nó chạm các module khác ở mức:

- booking: validate rental registration + bị block bởi contest resource lock
- payment: tạo `CONTEST_ENTRY` transaction và nhận callback confirm
- racing network: sync race records sau publish
- auth/roles: Provider owner, assigned Staff, Customer

---

## 2. Service Map

```text
contest.service
  - contest CRUD/status
  - registration
  - fee actions
  - check-in
  - staff assignment
  - bans/disqualify

contest-runtime.service
  - generate matches
  - update participants
  - submit/correct/advance result
  - publish leaderboard
  - metrics
  - sync race records

payment.service
  - settle CONTEST_ENTRY transaction

contest.helpers / contest-lock logic
  - operator access
  - resource lock resolution
  - booking conflict guards
```

---

## 3. API Surface

Catalog:

```text
GET /api/v1/contest-catalog/types
GET /api/v1/contest-catalog/formats
GET /api/v1/contest-catalog/templates
```

Contest setup:

```text
GET   /api/v1/contests
GET   /api/v1/cafes/:cafeId/contests
GET   /api/v1/contests/:contestId
POST  /api/v1/contests
PATCH /api/v1/contests/:contestId
POST  /api/v1/contests/:contestId/open
POST  /api/v1/contests/:contestId/close
POST  /api/v1/contests/:contestId/cancel
```

Registration and event day:

```text
POST /api/v1/contests/:contestId/register
GET  /api/v1/me/contest-registrations
GET  /api/v1/contests/:contestId/registrations
GET  /api/v1/contests/:contestId/registrations/lookup
POST /api/v1/contest-registrations/:registrationId/create-entry-fee-payment
POST /api/v1/contest-registrations/:registrationId/mark-entry-fee-paid
POST /api/v1/contest-registrations/:registrationId/waive-entry-fee
POST /api/v1/contest-registrations/:registrationId/approve
POST /api/v1/contest-registrations/:registrationId/reject
POST /api/v1/contest-registrations/:registrationId/disqualify
POST /api/v1/contest-registrations/:registrationId/cancel
POST /api/v1/contest-registrations/:registrationId/check-in
```

Runtime:

```text
GET   /api/v1/contests/:contestId/matches
POST  /api/v1/contests/:contestId/matches/generate
PATCH /api/v1/contest-matches/:matchId/participants
POST  /api/v1/contest-matches/:matchId/results
POST  /api/v1/contest-matches/:matchId/results/correct
POST  /api/v1/contest-matches/:matchId/advance
POST  /api/v1/contests/:contestId/leaderboard/publish
POST  /api/v1/contests/:contestId/sync-race-records
```

Governance:

```text
GET    /api/v1/contests/:contestId/metrics
GET    /api/v1/contests/:contestId/audit-logs
GET    /api/v1/contests/:contestId/staff-assignments
POST   /api/v1/contests/:contestId/staff-assignments
DELETE /api/v1/contests/:contestId/staff-assignments/:staffId
GET    /api/v1/contests/:contestId/bans
POST   /api/v1/contests/:contestId/bans
POST   /api/v1/contests/:contestId/bans/:banId/lift
```

---

## 4. Role Expectations

### Provider

Provider FE hiện nên coi contest như một dashboard nhiều tab:

- Setup
- Registrations
- Event day
- Runtime
- Leaderboard
- Metrics
- Audit

Provider được kỳ vọng thấy:

- resource locks đã resolve
- fee state: pending/paid/waived
- staff assignment
- bans/disqualify history
- revenue summary từ metrics

### Staff

Staff FE hiện có thể đi theo 3 màn:

- contest list được assign
- lookup/check-in
- runtime result handling

Staff không nên được thiết kế như contest owner. Các action governance sâu vẫn nên ưu tiên Provider.

### Customer

Customer FE hiện nên support:

- public list/detail
- rental registration
- BYOC registration nếu policy cho phép
- continue payment khi `PENDING_PAYMENT`
- my registration journey
- read-only leaderboard / bracket / own match state

---

## 5. FE Notes From Current Backend

- `resource_locks` là current contract, FE setup phải gửi và đọc được.
- `create-entry-fee-payment` là current contract, không còn là future-only doc note.
- BYOC hiện support ở mức declaration-based flow; FE nên gọi được nhưng phải ghi rõ đây chưa phải vehicle registry hoàn chỉnh.
- metrics hiện đã có revenue summary cơ bản, không còn chỉ là operational counts.
- bans/disqualify đã có API nhưng chưa có incident/protest workflow riêng.

---

## 6. Remaining Architecture Gaps

- scheduler đồng bộ status theo registration deadline
- refund orchestration cho `CONTEST_ENTRY`
- incident/protest/appeal subsystem
- richer class/heat model nếu một contest cần nhiều class bên trong
