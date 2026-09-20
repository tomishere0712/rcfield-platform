# Data Model: Staff KPI Dashboard

**Feature**: 014-staff-kpi-dashboard  
**Date**: 2026-07-08

> Không có entity / migration mới. Tất cả KPI được tính từ dữ liệu hiện có.

---

## Existing Tables Used (read-only)

### `sessions`
| Column | Type | Role |
|--------|------|------|
| `id` | uuid PK | ref_id cho CHECK_IN event |
| `booking_id` | uuid FK | join với bookings để lấy slot_start |
| `checked_in_by` | uuid FK → users | **key filter**: nhân viên nào check-in |
| `status` | varchar | filter COMPLETED/ACTIVE sessions |
| `created_at` | timestamptz | thời điểm check-in, dùng cho on-time rate |

### `bookings`
| Column | Type | Role |
|--------|------|------|
| `id` | uuid PK | join với sessions |
| `slot_start` | timestamptz | baseline để tính on-time rate (±15 phút) |
| `short_code` | varchar | label hiển thị trong timeline |
| `cafe_id` | uuid FK | verify staff belongs to provider's cafe |

### `fnb_orders`
| Column | Type | Role |
|--------|------|------|
| `id` | uuid PK | ref_id cho FNB_ORDER event |
| `created_by` | uuid FK → users | **key filter**: nhân viên nào xử lý |
| `status` | varchar | tính từ DELIVERED orders |
| `created_at` | timestamptz | timestamp cho timeline và period filter |

### `extension_proposals`
| Column | Type | Role |
|--------|------|------|
| `id` | uuid PK | ref_id cho EXTENSION event |
| `proposed_by` | uuid FK → users | **key filter**: nhân viên nào đề xuất |
| `session_id` | uuid FK | label trong timeline |
| `status` | varchar | filter `APPROVED` only |
| `created_at` | timestamptz | timestamp cho timeline và period filter |

### `staff_cafe_assignments`
| Column | Type | Role |
|--------|------|------|
| `staff_id` | uuid FK → users | join để verify ownership |
| `cafe_id` | uuid FK → cafes | join với cafes.provider_id |
| `is_active` | boolean | chỉ assignment đang active |

### `cafes`
| Column | Type | Role |
|--------|------|------|
| `id` | uuid PK | join |
| `provider_id` | uuid FK → users | verify caller là owner |
| `name` | varchar | hiển thị trong profile header |

### `users`
| Column | Type | Role |
|--------|------|------|
| `id` | uuid PK | filter |
| `full_name` | varchar | profile header |
| `email` | varchar | profile header |
| `phone` | varchar | profile header |
| `last_active_at` | timestamptz | online indicator (đã có từ migration 1752400000000) |
| `created_at` | timestamptz | ngày tham gia |

---

## Response Shapes (TypeScript interfaces)

```typescript
// GET /v1/provider/staff/:staffId/kpi?period=7d|30d|90d
interface StaffKpiSummary {
  staffId: string
  period: '7d' | '30d' | '90d'
  totalCheckIns: number
  totalFnbOrdersHandled: number
  totalExtensionsApproved: number
  onTimeCheckInRate: number        // 0–100 (percent), null nếu 0 check-ins
  activeDaysCount: number          // số ngày có ít nhất 1 hành động
}

// GET /v1/provider/staff/:staffId/activity?limit=20&offset=0
interface StaffActivityEvent {
  id: string                       // ref_id (session/fnb_order/extension_proposal id)
  type: 'CHECK_IN' | 'FNB_ORDER' | 'EXTENSION_APPROVED'
  eventTime: string                // ISO 8601
  label: string                    // booking short_code hoặc order id (truncated)
}

interface StaffActivityPage {
  events: StaffActivityEvent[]
  total: number
  hasMore: boolean
}

// GET /v1/provider/staff/:staffId (profile — mở rộng từ StaffListItem hiện có)
interface StaffDetailProfile {
  id: string
  fullName: string
  email: string
  phone: string | null
  cafeName: string
  cafeId: string
  status: 'PENDING' | 'ACTIVE' | 'DISABLED'
  createdAt: string
  activatedAt: string | null
  lastActiveAt: string | null
}
```
