# Implementation Plan: Staff KPI Dashboard

**Branch**: `main` | **Date**: 2026-07-08 | **Spec**: [spec.md](./spec.md)

## Summary

Trang chi tiết nhân viên cho Provider — hiển thị profile đầy đủ và 5 KPI chỉ số hiệu suất (check-ins, FnB orders, extensions, on-time rate, active days) lọc theo 7/30/90 ngày, kèm activity timeline phân trang. Không cần migration mới — tất cả KPI tính từ bảng hiện có (`sessions`, `fnb_orders`, `extension_proposals`).

## Technical Context

**Language/Version**: TypeScript strict, Node.js 20+  
**Primary Dependencies**: Express.js, TypeORM, React Query, Tailwind CSS, shadcn/ui  
**Storage**: PostgreSQL (read-only queries, không thêm bảng)  
**Testing**: Manual E2E + unit test cho KPI calculation logic  
**Target Platform**: Web (desktop + mobile responsive)  
**Project Type**: Full-stack web feature (Provider dashboard)  
**Performance Goals**: KPI response < 1s; Timeline page load < 500ms  
**Constraints**: Không thêm table mới; tuân thủ RBAC (PROVIDER only); authorization check trước mọi query  
**Scale/Scope**: 1 provider, N cafes, M staff — quy mô SMB (< 100 staff)

## Constitution Check

| Gate | Status | Notes |
|------|--------|-------|
| I. Snapshot-First Pricing | N/A | Không có payment logic |
| II. State Machine Gate | N/A | Không transition booking/session |
| III. Evidence-Based Handover | N/A | Chỉ đọc dữ liệu |
| IV. Payment Component Isolation | N/A | Không có payment |
| V. Test-First Financial/State | N/A | Không có financial logic |
| VI. RBAC Enforcement | **REQUIRED** | Route phải có `authenticate + authorize(PROVIDER) + requireActiveProvider`. Authorization check (staff belongs to provider) trong service trước mọi query |

**GATE VI Detail**: 3 endpoint mới (`GET /kpi`, `GET /activity`, `GET /:staffId`) đều phải:
1. `authenticate` — verify JWT
2. `authorize(UserRole.PROVIDER)` — chỉ Provider
3. `requireActiveProvider` — provider phải active
4. Service-level check: `staff_cafe_assignments` JOIN `cafes WHERE provider_id = caller` → 403 nếu không match

## Project Structure

### Documentation (this feature)

```text
specs/014-staff-kpi-dashboard/
├── plan.md          ← file này
├── spec.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── api.md
└── tasks.md         ← tạo bởi /speckit-tasks
```

### Backend — files cần tạo/sửa

```text
rcfeild-be/src/
├── routes/
│   └── staff.routes.ts              ← SỬA: thêm 3 route mới
├── controllers/
│   └── staff.controller.ts          ← SỬA: thêm getStaffDetail, getStaffKpi, getStaffActivity
└── services/
    └── staff.service.ts             ← SỬA: thêm getStaffDetail(), getStaffKpi(), getStaffActivity()
```

**Không có migration** — tất cả dùng bảng hiện có.

### Frontend — files cần tạo/sửa

```text
rcfield-fe/src/
├── pages/provider/
│   ├── ProviderStaffPage.tsx          ← SỬA: thêm mục "Xem chi tiết" vào dropdown menu "..." trên StaffCard
│   └── ProviderStaffDetailPage.tsx    ← TẠO MỚI
├── features/staff/api/
│   └── staff.api.ts                   ← SỬA: thêm getStaffDetail, getStaffKpi, getStaffActivity
└── app/router/
    └── router.tsx (hoặc routes file)  ← SỬA: thêm route /provider/staff/:staffId
```

## Implementation Notes

### Backend: 3 service methods mới

```typescript
// staff.service.ts

// 1. Profile chi tiết (mở rộng từ StaffListItem hiện có)
export async function getStaffDetail(providerId: string, staffId: string): Promise<StaffDetailProfile>

// 2. KPI summary
export async function getStaffKpi(
  providerId: string,
  staffId: string,
  period: '7d' | '30d' | '90d'
): Promise<StaffKpiSummary>

// 3. Activity timeline (phân trang)
export async function getStaffActivity(
  providerId: string,
  staffId: string,
  limit: number,
  offset: number
): Promise<StaffActivityPage>
```

**Authorization helper** (dùng chung cho cả 3):
```typescript
async function assertStaffBelongsToProvider(providerId: string, staffId: string): Promise<void> {
  const rows = await AppDataSource.query(
    `SELECT 1 FROM staff_cafe_assignments a
     JOIN cafes c ON c.id = a.cafe_id
     WHERE a.staff_id = $1 AND c.provider_id = $2 AND a.is_active = true`,
    [staffId, providerId]
  )
  if (rows.length === 0) throw new AppError('Forbidden', 403, 'FORBIDDEN')
}
```

### Backend: Route declarations

```typescript
// staff-invite.routes.ts → KHÔNG ĐỤNG VÀO
// Thêm vào staff.routes.ts (provider-side):

// GET /v1/provider/staff/:staffId  (profile)
// GET /v1/provider/staff/:staffId/kpi?period=7d|30d|90d
// GET /v1/provider/staff/:staffId/activity?limit=20&offset=0
```

Xem `rcfeild-be/src/routes/staff.routes.ts` hiện tại — file `staff.routes.ts` đang dành cho STAFF role. Provider staff management routes nằm ở đâu? Kiểm tra `staff-invite.routes.ts`. Các endpoint mới mount cùng prefix `/v1/provider/staff` — cần verify file route đúng khi implement.

### Frontend: ProviderStaffDetailPage layout

```
[ ← Quay lại ]

[ Avatar ] [ Tên | Chi nhánh | Status badge | Online dot ]
           [ Email | Phone | Ngày tham gia ]

[ 7 ngày ] [ 30 ngày ] [ 90 ngày ]   ← Period selector tabs

[ Tổng check-in ]  [ FnB orders ]  [ Gia hạn ]  [ Đúng giờ ]  [ Ngày HĐ ]
[     42        ]  [     18     ]  [     7    ]  [  88.1%    ]  [    24   ]

── Lịch sử hoạt động ──────────────────────────────────────────
  ✓ Check-in · BK-0042 · 08/07 09:15
  🍜 FnB Order · Order #3f2a · 08/07 08:30
  ⏱ Gia hạn +30 phút · 07/07 14:00
  [ Tải thêm ]
```

### Frontend: Skeleton cho KPI cards

Dùng `div` với `animate-pulse bg-[#ebe7e7]` trong khi `isLoading`. Kích thước skeleton cố định (không CLS) — tuân thủ anti-CLS rule từ ui-ux-pro-max.

### Period selector

```tsx
const PERIODS = [
  { value: '7d', label: '7 ngày' },
  { value: '30d', label: '30 ngày' },
  { value: '90d', label: '90 ngày' },
] as const
```

State: `const [period, setPeriod] = useState<'7d'|'30d'|'90d'>('30d')`  
Query key: `['staff', staffId, 'kpi', period]` — tự động refetch khi period thay đổi.

### queryKeys mới

```typescript
// Thêm vào staffQueryKeys trong staff.api.ts:
staffDetail: (staffId: string) => [...staffQueryKeys.all, 'detail', staffId] as const,
staffKpi: (staffId: string, period: string) => [...staffQueryKeys.all, 'kpi', staffId, period] as const,
staffActivity: (staffId: string) => [...staffQueryKeys.all, 'activity', staffId] as const,
```

## Validation

Xem [quickstart.md](./quickstart.md) — 8 E2E scenarios + unit test checklist.
