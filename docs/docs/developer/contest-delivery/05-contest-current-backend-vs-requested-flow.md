# Contest: Current Backend vs Requested Flow

**Last updated:** 2026-07-16

> File đọc nhanh cho câu hỏi: "Bạn muốn gì" vs "backend hiện đang có gì thật".

---

## 1. Tóm tắt 1 màn hình

| Chủ đề | Product thường kỳ vọng | Backend hiện có | Kết luận cho FE |
|---|---|---|---|
| Resource lock | Khóa cafe/sân cho contest | Đã có | Hiển thị như feature current |
| Entry fee manual | Provider đánh dấu paid/waive | Đã có | Dùng ngay |
| Contest entry payment | Customer thanh toán online | Đã có payment URL `CONTEST_ENTRY` | Dùng được, nhưng refund flow chưa đầy đủ |
| BYOC contest | Cho khách khai báo xe cá nhân | Đã có declaration-based register | Dùng được, nhưng chưa là vehicle registry hoàn chỉnh |
| Leaderboard local | Publish bảng xếp hạng giải | Đã có | Dùng ngay |
| Metrics doanh thu cơ bản | gross/paid/waived/pending | Đã có | Dùng metrics hiện tại |
| Audit | Nhật ký thao tác contest | Đã có | Dùng ngay |
| Ban / unban / disqualify | Chặn người phá giải | Đã có mức cơ bản | Dùng được, nhưng chưa có incident/protest workflow |

---

## 2. Backend Có Sẵn

### Setup

- contest CRUD
- open / close / cancel
- multi-cafe
- track type validation
- resource lock + booking conflict guard

### Registration

- RENTAL register qua booking thật
- BYOC register nếu policy cho phép
- fee statuses: `NOT_REQUIRED`, `PENDING_PAYMENT`, `PENDING_REVIEW`, `WAIVED`, `MARKED_PAID`
- customer create contest entry payment URL
- operator mark paid / waive / approve / reject / cancel / disqualify

### Event Day / Runtime

- assigned staff
- lookup check-in code
- check-in theo cafe
- knockout runtime
- time trial runtime
- result submit / correct / advance

### Publishing / Governance

- publish leaderboard local
- sync race records
- metrics có revenue summary cơ bản
- audit logs
- bans theo scope contest hoặc provider

---

## 3. Những Gì Chưa Nên Over-Promise

### BYOC

Backend đã nhận BYOC registration, nhưng:

- declaration đang nằm trong metadata
- `customer_vehicle_id` chưa là contract hoàn chỉnh
- review flow vẫn mang tính khai báo hơn là vehicle registry đầy đủ

### Payment

Backend đã tạo `CONTEST_ENTRY` payment URL, nhưng:

- refund/cancel lifecycle chưa hoàn chỉnh
- docs không nên viết như đã có full settlement policy

### Governance

Backend đã có ban/disqualify, nhưng:

- chưa có module incident/protest/appeal riêng
- evidence hiện vẫn là JSON/URL-level handling

### Scheduling

- registration guard theo thời gian đã có
- auto-close status theo cron chưa phải current guaranteed behavior

---

## 4. FE Nên Hiểu Như Sau

### Provider

- setup + resource locks là live contract
- registrations/payment/audit/metrics/runtime đều có BE
- có thể test ban/disqualify và staff assignment

### Staff

- có contest list theo assignment
- có lookup/check-in/runtime

### Customer

- có public list/detail
- có register RENTAL
- có BYOC nếu contest cho phép
- có continue payment cho entry fee

---

## 5. Recommended Demo Data

Seed nên có:

- `DRAFT` contest để test setup/edit
- `OPEN` paid rental contest với pending/paid/waived/cancelled/checked-in
- `OPEN` mixed/BYOC contest
- `CLOSED` contest để test review/disqualify
- `RUNNING` knockout contest có nhiều registrations
- `COMPLETED` time trial contest có leaderboard publish

Đó là bộ dữ liệu phù hợp nhất để FE QA trong ngày 16/07/2026.
