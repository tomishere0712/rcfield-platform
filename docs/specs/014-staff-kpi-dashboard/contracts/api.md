# API Contracts: Staff KPI Dashboard

**Feature**: 014-staff-kpi-dashboard  
**Date**: 2026-07-08

---

## GET /v1/provider/staff/:staffId/kpi

**Auth**: Bearer token, role = PROVIDER, active provider  
**Description**: Trả về 5 chỉ số KPI của một nhân viên trong khoảng thời gian được chọn.

### Query Parameters

| Param | Type | Required | Values | Default |
|-------|------|----------|--------|---------|
| `period` | string | No | `7d`, `30d`, `90d` | `30d` |

### Authorization Check

Trước khi tính KPI, validate:
```sql
SELECT 1 FROM staff_cafe_assignments a
JOIN cafes c ON c.id = a.cafe_id
WHERE a.staff_id = :staffId AND c.provider_id = :providerId AND a.is_active = true
```
Nếu 0 rows → `403 FORBIDDEN`.

### Success Response — 200

```json
{
  "success": true,
  "data": {
    "staffId": "uuid",
    "period": "30d",
    "totalCheckIns": 42,
    "totalFnbOrdersHandled": 18,
    "totalExtensionsApproved": 7,
    "onTimeCheckInRate": 88.1,
    "activeDaysCount": 24
  }
}
```

### KPI Calculation Queries

**totalCheckIns**:
```sql
SELECT COUNT(*) FROM sessions
WHERE checked_in_by = $staffId AND created_at >= NOW() - INTERVAL '$N days'
```

**totalFnbOrdersHandled**:
```sql
SELECT COUNT(*) FROM fnb_orders
WHERE created_by = $staffId AND status = 'DELIVERED'
AND created_at >= NOW() - INTERVAL '$N days'
```

**totalExtensionsApproved**:
```sql
SELECT COUNT(*) FROM extension_proposals
WHERE proposed_by = $staffId AND status = 'APPROVED'
AND created_at >= NOW() - INTERVAL '$N days'
```

**onTimeCheckInRate** (check-in trong ±15 phút so với slot_start):
```sql
SELECT
  COUNT(*) FILTER (
    WHERE s.created_at BETWEEN b.slot_start - INTERVAL '15 minutes'
                           AND b.slot_start + INTERVAL '15 minutes'
  )::float / NULLIF(COUNT(*), 0) * 100 AS rate
FROM sessions s
JOIN bookings b ON b.id = s.booking_id
WHERE s.checked_in_by = $staffId
AND s.created_at >= NOW() - INTERVAL '$N days'
```
Null khi 0 check-ins → trả về `null` trong JSON.

**activeDaysCount**:
```sql
SELECT COUNT(DISTINCT DATE(event_time)) FROM (
  SELECT created_at AS event_time FROM sessions WHERE checked_in_by = $staffId
  UNION ALL
  SELECT created_at FROM fnb_orders WHERE created_by = $staffId
  UNION ALL
  SELECT created_at FROM extension_proposals WHERE proposed_by = $staffId
) sub
WHERE event_time >= NOW() - INTERVAL '$N days'
```

### Error Responses

| Status | Code | Condition |
|--------|------|-----------|
| 403 | `FORBIDDEN` | Staff không thuộc provider |
| 400 | `VALIDATION_ERROR` | `period` không hợp lệ |
| 404 | `NOT_FOUND` | staffId không tồn tại |

---

## GET /v1/provider/staff/:staffId/activity

**Auth**: Bearer token, role = PROVIDER, active provider  
**Description**: Trả về danh sách sự kiện hoạt động của nhân viên, phân trang.

### Query Parameters

| Param | Type | Required | Default | Max |
|-------|------|----------|---------|-----|
| `limit` | integer | No | 20 | 50 |
| `offset` | integer | No | 0 | — |

### Authorization Check

Giống `/kpi` — kiểm tra `staff_cafe_assignments`.

### Success Response — 200

```json
{
  "success": true,
  "data": {
    "events": [
      {
        "id": "uuid",
        "type": "CHECK_IN",
        "eventTime": "2026-07-08T09:15:00.000Z",
        "label": "BK-0042"
      },
      {
        "id": "uuid",
        "type": "FNB_ORDER",
        "eventTime": "2026-07-08T08:30:00.000Z",
        "label": "Order #3f2a"
      },
      {
        "id": "uuid",
        "type": "EXTENSION_APPROVED",
        "eventTime": "2026-07-07T14:00:00.000Z",
        "label": "Gia hạn +30 phút"
      }
    ],
    "total": 87,
    "hasMore": true
  }
}
```

### Timeline Query

```sql
SELECT type, ref_id AS id, event_time AS "eventTime", label FROM (
  SELECT 'CHECK_IN' AS type, s.id AS ref_id, s.created_at AS event_time,
         COALESCE(b.short_code, 'Booking') AS label
  FROM sessions s JOIN bookings b ON b.id = s.booking_id
  WHERE s.checked_in_by = $staffId

  UNION ALL

  SELECT 'FNB_ORDER', fo.id, fo.created_at,
         'Order #' || SUBSTRING(fo.id::text, 1, 4)
  FROM fnb_orders fo WHERE fo.created_by = $staffId

  UNION ALL

  SELECT 'EXTENSION_APPROVED', ep.id, ep.created_at,
         'Gia hạn +' || ep.duration_minutes || ' phút'
  FROM extension_proposals ep
  WHERE ep.proposed_by = $staffId AND ep.status = 'APPROVED'
) events
ORDER BY event_time DESC
LIMIT $limit OFFSET $offset
```

---

## GET /v1/provider/staff/:staffId

**Auth**: Bearer token, role = PROVIDER, active provider  
**Description**: Trả về thông tin profile đầy đủ của một nhân viên (mở rộng từ list item).

### Success Response — 200

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "fullName": "Bùi Trọng Staff",
    "email": "staff@example.com",
    "phone": "0372899192",
    "cafeName": "RC Tân Bình",
    "cafeId": "uuid",
    "status": "ACTIVE",
    "createdAt": "2026-01-15T08:00:00.000Z",
    "activatedAt": "2026-01-16T10:30:00.000Z",
    "lastActiveAt": "2026-07-08T09:15:00.000Z"
  }
}
```
