# API Contracts: Booking Review & Rating

**Feature**: [spec.md](../spec.md)  
**Research**: [research.md](../research.md)

---

## Endpoints Overview

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| POST | `/api/v1/customer/reviews` | ✅ | CUSTOMER | Submit a review for a completed booking |
| POST | `/api/v1/customer/reviews/:bookingId/dismiss` | ✅ | CUSTOMER | Dismiss review prompt for a booking |
| GET | `/api/v1/customer/reviews/pending` | ✅ | CUSTOMER | List bookings needing review (for banner/reminder) |
| GET | `/api/v1/cafes/:cafeId/reviews` | ❌ public | — | Get public rating + review list for a cafe |
| GET | `/api/v1/provider/reviews` | ✅ | PROVIDER | List all reviews for provider's cafes (with analytics) |
| PATCH | `/api/v1/provider/reviews/:reviewId/visibility` | ✅ | PROVIDER | Hide or unhide a review |

---

## POST `/api/v1/customer/reviews`

Submit a review. One per booking, within 7 days of completion.

**Auth**: JWT required — CUSTOMER role only  
**Controller**: `src/controllers/review.controller.ts`  
**Service**: `src/services/review.service.ts`

### Request Body (Zod schema in `src/validate/index.ts`)

```typescript
// ── reviews ───────────────────────────────────────────────────────────────────
export const CreateReviewSchema = z.object({
  booking_id: z.string().uuid(),
  overall_score: z.number().int().min(1).max(5),
  vehicle_score: z.number().int().min(1).max(5).nullable().optional(),
  staff_score: z.number().int().min(1).max(5).nullable().optional(),
  facility_score: z.number().int().min(1).max(5).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
});
```

### Validation Rules (service layer)

1. Booking must exist and belong to the authenticated customer.
2. Booking must have `status = 'COMPLETED'`.
3. `booking.completed_at` must be within 7 days (`REVIEW_PERIOD_EXPIRED`).
4. No existing review for this `booking_id` (`ALREADY_REVIEWED`).
5. If `booking.play_mode === 'BYOC'`, force `vehicle_score = null` regardless of input.

### Response `201`

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "booking_id": "uuid",
    "cafe_id": "uuid",
    "overall_score": 5,
    "vehicle_score": null,
    "staff_score": 4,
    "facility_score": 5,
    "note": "Rất vui vẻ!",
    "status": "VISIBLE",
    "created_at": "2026-07-10T10:00:00Z"
  }
}
```

### Error Codes

| Code | HTTP | Meaning |
|------|------|---------|
| `BOOKING_NOT_FOUND` | 404 | Booking does not belong to customer |
| `BOOKING_NOT_COMPLETED` | 400 | Booking is not in COMPLETED status |
| `REVIEW_PERIOD_EXPIRED` | 400 | More than 7 days since booking completed |
| `ALREADY_REVIEWED` | 409 | Review already exists for this booking |

---

## POST `/api/v1/customer/reviews/:bookingId/dismiss`

Mark a booking as "review dismissed" — hides the reminder permanently.

**Auth**: JWT required — CUSTOMER role  
**Body**: (empty)

### Response `200`

```json
{ "success": true }
```

### Error Codes

| Code | HTTP | Meaning |
|------|------|---------|
| `BOOKING_NOT_FOUND` | 404 | Booking not found or not owned by customer |
| `ALREADY_DISMISSED` | 409 | Already dismissed (idempotent — return 200 anyway) |

---

## GET `/api/v1/customer/reviews/pending`

Returns bookings that are eligible for review: COMPLETED, not yet reviewed, not dismissed, within 7-day window.

**Auth**: JWT required — CUSTOMER role

### Query Parameters

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | number | 5 | Max results |

### Response `200`

```json
{
  "success": true,
  "data": [
    {
      "booking_id": "uuid",
      "cafe_id": "uuid",
      "cafe_name": "RC Garage Quận 1",
      "slot_start": "2026-07-08T09:00:00Z",
      "slot_end": "2026-07-08T11:00:00Z",
      "play_mode": "RENTAL",
      "completed_at": "2026-07-08T11:15:00Z",
      "review_deadline": "2026-07-15T11:15:00Z"
    }
  ]
}
```

*Returns most-recently-completed booking first. Empty array when nothing pending.*

---

## GET `/api/v1/cafes/:cafeId/reviews`

Public endpoint — returns rating aggregate + list of visible reviews.

**Auth**: None required  
**Controller**: Add to `src/controllers/cafe.controller.ts` (or new `src/controllers/review.controller.ts`)

### Query Parameters

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | number | 1 | Pagination |
| `limit` | number | 10 | Reviews per page (max 50) |

### Response `200`

```json
{
  "success": true,
  "data": {
    "aggregate": {
      "overall_avg": 4.3,
      "review_count": 47,
      "vehicle_avg": 4.1,
      "staff_avg": 4.6,
      "facility_avg": 4.2
    },
    "reviews": [
      {
        "id": "uuid",
        "customer_name": "Nguyễn V.",
        "overall_score": 5,
        "vehicle_score": null,
        "staff_score": 5,
        "facility_score": 4,
        "note": "Nhân viên nhiệt tình",
        "created_at": "2026-07-09T08:00:00Z"
      }
    ],
    "meta": { "total": 47, "page": 1, "limit": 10 }
  }
}
```

**Notes**:
- Only `VISIBLE` reviews are included in aggregate and list. Aggregate reflects hide/unhide immediately (on-the-fly, no cache).
- `customer_name`: masked as **tên đệm + tên + chữ cái đầu họ + "."** (e.g. "Văn An N."). Algorithm: `split(full_name)[0]` = họ; remainder = tên đệm + tên; output = `remainder.join(' ') + ' ' + họ[0] + '.'`. Applied in service layer. Single-token names displayed as-is.
- `vehicle_avg`: `null` if fewer than 3 reviews have a `vehicle_score`.
- When `review_count = 0`, `aggregate` fields are all `null`.

---

## GET `/api/v1/provider/reviews`

Provider sees all reviews across their cafes, with optional filtering.

**Auth**: JWT required — PROVIDER role  
**Controller**: `src/controllers/review.controller.ts`

### Query Parameters

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `cafe_id` | uuid | — | Filter to one cafe |
| `status` | `VISIBLE \| HIDDEN \| ALL` | `ALL` | Filter by visibility |
| `page` | number | 1 | |
| `limit` | number | 20 | |

### Response `200`

```json
{
  "success": true,
  "data": {
    "reviews": [
      {
        "id": "uuid",
        "booking_id": "uuid",
        "cafe_id": "uuid",
        "cafe_name": "RC Garage Quận 1",
        "customer_name": "Nguyễn V.",
        "overall_score": 3,
        "vehicle_score": 2,
        "staff_score": 4,
        "facility_score": 3,
        "note": "Xe hơi cũ",
        "status": "VISIBLE",
        "created_at": "2026-07-09T08:00:00Z"
      }
    ],
    "new_since_24h": 3,
    "meta": { "total": 120, "page": 1, "limit": 20 }
  }
}
```

---

## PATCH `/api/v1/provider/reviews/:reviewId/visibility`

Toggle a review's visibility (hide or unhide).

**Auth**: JWT required — PROVIDER role

### Request Body

```typescript
export const UpdateReviewVisibilitySchema = z.object({
  status: z.enum(['VISIBLE', 'HIDDEN']),
});
```

### Validation

- Review must belong to one of the authenticated provider's cafes.

### Response `200`

```json
{
  "success": true,
  "data": { "id": "uuid", "status": "HIDDEN" }
}
```

### Error Codes

| Code | HTTP | Meaning |
|------|------|---------|
| `REVIEW_NOT_FOUND` | 404 | Review not found or not in provider's scope |

---

## Backend File Changes Summary

```
rcfeild-be/src/
├── models/
│   ├── review.entity.ts                    NEW
│   └── booking.entity.ts                   MODIFY  (add completedAt, reviewDismissedAt columns)
├── services/
│   └── review.service.ts                   NEW
├── controllers/
│   └── review.controller.ts                NEW
├── routes/
│   ├── review.routes.ts                    NEW  (customer routes)
│   ├── provider-review.routes.ts           NEW  (provider routes)
│   └── cafe.routes.ts                      MODIFY  (add GET /:cafeId/reviews)
├── validate/index.ts                       MODIFY  (add CreateReviewSchema, etc.)
├── types/index.ts                          MODIFY  (add ReviewStatus, BOOKING_REVIEW_REQUEST)
└── migrations/
    └── 1752100000000-AddReviewTables.ts    NEW
```

The notification trigger is added inside `rcfeild-be/src/services/staff.service.ts` at the point where `booking.status` is set to `COMPLETED`.
