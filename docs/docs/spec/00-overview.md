# 00 — Project Overview

**Last updated**: 2026-07-07
**Status**: Active

---

## Tên đề tài

- **English**: RCField – RC Car Field Operations & Booking Platform
- **Vietnamese**: Nền tảng Số hóa Vận hành và Đặt lịch Sân Xe RC
- **Mã**: SU26SE098 | **GVHD**: Nguyễn Minh Sang

---

## Bối cảnh

Sân xe RC (Radio-Controlled Car) là mô hình giải trí trải nghiệm đang nổi tại Việt Nam. Các địa điểm này thường được gọi là "cafe xe RC" theo tên thông dụng.

**RCField** là **nền tảng SaaS multi-tenant** cho **nhiều Provider** vận hành sân xe RC tại Việt Nam. Mỗi Provider đăng ký gói SaaS, sở hữu và quản lý một hoặc nhiều chi nhánh (cafes) độc lập. Mỗi chi nhánh có cấu hình riêng về giá, đội xe, giờ hoạt động và sức chứa, nhưng dùng chung một hệ thống.

RCField Phase 1 tập trung vào vận hành thực tế của cafe xe RC, bao gồm booking/session, đội xe, BYOC, F&B, package, subscription, contest, promotion, inspection, dispute resolution, staff assignment, cafe operations, audit thanh toán/trust score và SaaS subscription/billing. Phase 2+ dành cho AI nâng cao, multi-party dispute workflow nâng cao và Universal Racing Network sau khi Provider-level contest ổn định.

Hai nhóm khách chính:

- **RENTAL customers**: thuê xe của quán.
- **BYOC customers** (Bring Your Own Car): mang xe cá nhân đến chơi.
> `bookings.play_mode` chỉ nhận `RENTAL` hoặc `BYOC`. Enum DB còn giá trị `MIXED`
> nhưng code không tạo được và chưa booking nào dùng. Nhóm vừa thuê vừa mang xe
> riêng hiện phải tách thành hai booking.

**Kiến trúc dữ liệu cốt lõi:**

- `Booking` = đơn đặt lịch dự kiến.
- `Session` = phiên chơi thực tế tạo khi check-in.
- Planned data (`booking_participants`, `booking_vehicles`) tách khỏi actual data (`session_participants`, `session_vehicles`).

**Pain points hiện tại:**

| Vấn đề | Hậu quả |
|--------|---------|
| Đặt lịch qua Zalo/điện thoại | Double-booking, bỏ sót, mất khách |
| Không có bằng chứng bàn giao xe | Tranh chấp hư hỏng không giải quyết được |
| Quản lý đội xe bằng sổ tay | Xe hỏng vẫn cho thuê, mất doanh thu |
| Tính tiền thủ công | Sai sót hoàn tiền, thất thoát |

---

## Giải pháp

RCField là hệ thống vận hành cho chuỗi sân xe RC, kết hợp:

1. **Multi-branch management** — 1 Provider quản lý nhiều chi nhánh.
2. **Operational Core** — booking, session, fleet, BYOC, F&B, package, subscription, contest, inspection, payment.
3. **Evidence-based handover** — ảnh + checklist tại điểm bàn giao tài sản.
4. **Audit-first payment & trust** — payment component, transaction log, trust score log.

**Booking channels:**

- App trực tiếp: Customer tự đặt.
- Link chia sẻ: Provider/Staff gửi link cho khách.
- Thủ công: Staff tạo booking cho khách walk-in/gọi điện.

---

## Actors

| Actor | Mô tả | App |
|-------|------|-----|
| **Customer** | Đặt lịch, thanh toán, xác nhận check-in/out, đánh giá | Web mobile-first |
| **Provider** | Chủ doanh nghiệp RC: đăng ký gói SaaS, quản lý chi nhánh, đội xe, giá, doanh thu | Web |
| **Staff** | Nhân viên thuộc 1 chi nhánh: check-in/out, inspection, ghi nhận người/xe thực tế, đề xuất gia hạn | Web mobile-first |
| **Admin** | Team RCField: quản trị nền tảng, onboard Provider, cấu hình hệ thống | Web |

---

## Scope

### Phase 1 — Operational Core, bắt buộc

Phase 1 giữ các nghiệp vụ chính của hệ thống. Đây không chỉ là MVP tối giản mà là core vận hành của cafe xe RC.

- Auth, refresh token, reset password.
- **SaaS plans + Provider subscription/billing** (`saas_plans`, `provider_subscriptions`).
- Provider onboarding: đăng ký gói SaaS, tạo chi nhánh đầu tiên.
- Cafe/branch management cơ bản.
- **Staff-cafe assignment** — Staff thuộc đúng 1 chi nhánh (`cafe_staff`).
- Vehicle fleet management cơ bản.
- BYOC vehicle registry.
- Booking lifecycle cho `RENTAL` và `BYOC`.
- Multi-vehicle booking qua `booking_vehicles`.
- Planned participants và actual participants.
- Multiple sessions per booking.
- Actual vehicles qua `session_vehicles`, hỗ trợ đổi xe khi chơi.
- Check-in/check-out inspection với ảnh và checklist.
- Slot extension proposal.
- Component-based payment và gateway transaction log.
- F&B: menu, pre-order khi đặt lịch, on-site order trong session.
- Packages/gói chơi và lịch sử sử dụng gói.
- ~~Subscriptions/lịch chơi định kỳ sinh booking~~ — **chưa làm**. Bảng `subscriptions` đã bị xoá; `bookings.booking_mode` thực tế luôn là `SINGLE`.
- Contests/tournament: Provider tạo event trong phạm vi cafe của Provider, Customer đăng ký, Staff/Provider check-in, match/result/leaderboard local thủ công và audit monitoring.
- Promotions cơ bản và usage audit.
- ~~Incident logging + policy-based resolution~~ — **chưa làm**. Bảng `incidents` đã bị xoá. Hư hỏng ghi qua `damage_line_items` trên inspection check-out.
- Vehicle maintenance logs để theo dõi bảo trì/sửa chữa xe.
- Reviews.
- Thông báo qua bảng `notifications` (bảng `notification_logs` đã bị xoá).
- ~~Trust score + audit qua `trust_score_logs`~~ — **chưa làm**. Bảng đã bị xoá; cột trust score trên `users` không có đường ghi nào.
- Feature flags có `config` để bật/tắt module và chuẩn bị AI Phase 2.

**Database hiện tại: 70 bảng vận hành** (xem `06-database.md` mục 3 — danh sách đối chiếu trực tiếp với `pg_tables`). Bao gồm SaaS billing, staff assignment, Contest compact tournament flow, F&B, gói chơi và thanh toán chuyển khoản ngân hàng. Cafe closures/announcements và dispute workflow **không được xây**. Contest live timing/multi-class/reward-claim chuyển sang Phase 2+.

### Phase 2 — AI nâng cao + Business Expansion

Các module sau không thuộc Phase 1:

- Universal Racing Network: Driver Passport, verified global race records, leaderboard liên tỉnh/toàn quốc, achievements, Grand Prix Series, Team War/Clan War.
- Multi-party dispute workflow nâng cao: `dispute_evidences`, `dispute_parties`, `incident_participants`.
- AI jobs, AI damage detection, AI recommendations nâng cao.
- Analytics dashboard nâng cao.
- Dynamic pricing, loyalty, native mobile app.

---

## Operational Core Data Rules

1. Không lưu `vehicle_id` trực tiếp trong `bookings`.
2. Một booking có thể có nhiều `booking_vehicles`.
3. Một booking có thể có nhiều `sessions`.
4. Planned data và actual data phải tách riêng.
5. Session có thể dùng cả rental vehicle và BYOC vehicle.
6. Booking phải lưu snapshot giá/policy.
7. Payment phải dùng component-based ledger.
8. Inspection phải có ảnh và checklist.
9. ~~Trust score phải có audit log~~ — chưa triển khai, bảng audit đã bị xoá.
10. Package/subscription/contest/F&B/maintenance là Phase 1 core.
11. ~~Tranh chấp dùng bảng `disputes`~~ — bảng đã bị xoá, chưa có luồng tranh chấp nào. Bằng chứng vẫn nằm ở inspection.
12. Phase 2 AI/SaaS phải mở rộng được mà không redesign Phase 1 core.
13. Universal Racing Network phải đọc từ verified `race_records`, không dùng `contests.config.leaderboard` làm global leaderboard.

---

## Timeline

| Giai đoạn | Thời gian | Nội dung |
|-----------|-----------|---------|
| TP-1 Core Platform | Tháng 1-2 | Auth, cafe, fleet, BYOC, booking/session core |
| TP-2 Operations & Commerce | Tháng 2-3 | Inspection, payment, F&B, packages, subscriptions, contests, promotions |
| TP-3 Risk, Testing & Docs | Tháng 3-4 | Incident policy resolution, maintenance logs, trust score, testing, deployment, docs |

**Tổng**: 04/2026 -> 08/2026