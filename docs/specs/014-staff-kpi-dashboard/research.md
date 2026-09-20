# Research: Staff KPI Dashboard

**Feature**: 014-staff-kpi-dashboard  
**Date**: 2026-07-08

---

## Decision 1: KPI data source — raw SQL aggregation từ bảng hiện có

**Decision**: Tính KPI bằng raw SQL aggregate queries trực tiếp trên `sessions`, `fnb_orders`, `extension_proposals` — không cần bảng log bổ sung.

**Rationale**: Codebase đã dùng pattern raw SQL trong `staff.service.ts` (ví dụ: `listStaff` dùng `AppDataSource.query()`). Dữ liệu nghiệp vụ hiện có đủ để tính 4/5 KPI. Tránh migration mới không cần thiết.

**Alternatives considered**: Pre-aggregate vào bảng `staff_kpi_snapshots` — bị loại vì thêm phức tạp không cần thiết ở quy mô hiện tại.

---

## Decision 2: Column mapping cho từng KPI

| KPI | Table | Column | Filter |
|-----|-------|--------|--------|
| Tổng check-in | `sessions` | `checked_in_by` | `created_at >= $since` |
| FnB orders | `fnb_orders` | `created_by` | `created_at >= $since` |
| Extensions approved | `extension_proposals` | `proposed_by` + `status = 'APPROVED'` | `created_at >= $since` |
| On-time rate | `sessions` JOIN `bookings` | `s.created_at` vs `b.slot_start ± 15min` | `s.created_at >= $since` |
| Ngày hoạt động | `sessions` + `fnb_orders` UNION | `DATE(created_at)` DISTINCT | `created_at >= $since` |

**Note về "thời gian online TB"**: `last_active_at` trên `users` chỉ lưu timestamp gần nhất — không phải log lịch sử. Thay vào đó, expose **số ngày có hoạt động** (`ngày có ít nhất 1 hành động`) trong khoảng thời gian được chọn. Đây là metric có ý nghĩa thực tế hơn.

---

## Decision 3: Provider ownership check

**Decision**: Dùng pattern hiện có trong `staff.service.ts`:
```sql
JOIN staff_cafe_assignments a ON a.staff_id = $staffId
JOIN cafes c ON c.id = a.cafe_id
WHERE c.provider_id = $providerId AND a.is_active = true
```
Nếu query trả về 0 rows → throw `AppError('Forbidden', 403, 'FORBIDDEN')`.

**Rationale**: Consistent với cách `listStaff` và `deactivateStaff` kiểm tra quyền.

---

## Decision 4: Activity Timeline — 3 event types

**Decision**: Timeline gồm 3 loại sự kiện, UNION ALL từ 3 bảng, sort theo `event_time DESC`, phân trang `LIMIT/OFFSET`.

```sql
SELECT 'CHECK_IN' AS type, s.id AS ref_id, s.created_at AS event_time, b.short_code AS label
FROM sessions s JOIN bookings b ON b.id = s.booking_id
WHERE s.checked_in_by = $staffId

UNION ALL

SELECT 'FNB_ORDER', fo.id, fo.created_at, fo.id::text
FROM fnb_orders fo WHERE fo.created_by = $staffId

UNION ALL

SELECT 'EXTENSION', ep.id, ep.created_at, ep.session_id::text
FROM extension_proposals ep WHERE ep.proposed_by = $staffId AND ep.status = 'APPROVED'

ORDER BY event_time DESC LIMIT 20 OFFSET $offset
```

---

## Decision 5: Period parameter

**Decision**: Query parameter `?period=7d|30d|90d`. Default = `30d`. Backend tính `since = NOW() - INTERVAL '$N days'`.

**Alternatives considered**: `?from=&to=` date range — bị loại vì phức tạp hơn không cần thiết cho MVP.

---

## Decision 6: Routing — thêm vào provider staff routes

**Decision**: Endpoint mới mount trên `staff-invite.routes.ts` hiện có? Không — tạo thêm vào `staff.routes.ts` (provider-side) tại `/v1/provider/staff/:staffId/kpi` và `/v1/provider/staff/:staffId/activity`. Route được bảo vệ bởi `authenticate + authorize(PROVIDER) + requireActiveProvider`.

**Rationale**: Provider staff management routes đã có trong `staff.routes.ts` — thêm vào đó thay vì file mới là nhất quán.

---

## Decision 7: Frontend — page mới + routing

**Decision**: Tạo `ProviderStaffDetailPage.tsx` tại `src/pages/provider/`. Route: `/provider/staff/:staffId`. Card trên `ProviderStaffPage.tsx` trở thành link (hoặc có nút "Xem chi tiết").

**Frontend state**: React Query với `queryKey: ['staff', staffId, 'kpi', period]`. Period state là `useState<'7d'|'30d'|'90d'>('30d')`.
