# API Contracts: Cafe Track Config

**Feature**: `specs/008-cafe-track-config/spec.md`  
**Date**: 2026-06-09

---

## Endpoints Overview

| # | Method | Path | Auth | Description |
|---|--------|------|------|-------------|
| 1 | GET | `/api/v1/cafes/:cafeId/track-configs` | Optional auth | List track configs — auth-aware (see below) |
| 2 | POST | `/api/v1/cafes/:cafeId/track-configs` | PROVIDER | Add track type to branch |
| 3 | PATCH | `/api/v1/cafes/:cafeId/track-configs/:id` | PROVIDER | Update config (capacity, description, image order, is_active toggle) |
| 4 | POST | `/api/v1/cafes/:cafeId/track-configs/:id/images` | PROVIDER | Upload images for track config |
| 5 | GET | `/api/v1/cafes/:cafeId/availability` | Optional auth | Updated — accepts `track_config_id` |
| 6 | POST | `/api/v1/bookings` | CUSTOMER | Updated — requires `track_config_id` |

---

## 1. GET `/api/v1/cafes/:cafeId/track-configs`

**Auth**: Optional (auth-aware)  
**Purpose**: List track configs for a branch. Behavior depends on caller:
- **Public / CUSTOMER**: only returns `is_active = true AND images.length > 0` (ready-to-display configs)
- **PROVIDER (owns cafe)**: returns ALL configs including inactive and configs without images (for management dashboard)

### Response `200`

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "cafe_id": "uuid",
      "track_type": {
        "id": "uuid",
        "code": "DRIFT",
        "name": "Drift Track",
        "description": "Đường đua drift chuyên nghiệp"
      },
      "byoc_capacity": 4,
      "images": [
        "https://res.cloudinary.com/rcfield/image/upload/v1/tracks/drift-1.jpg"
      ],
      "description": "Sân drift góc cua rộng, phù hợp xe 1:10",
      "sort_order": 0,
      "is_active": true
    }
  ]
}
```

**Notes**:
- `is_active` field included in response (visible to both roles, useful for provider dashboard state).
- Includes full `track_type` object joined from `track_types` table.
- Public path mirrors spec FR-006: no login required to view active, image-ready configs.

---

## 2. POST `/api/v1/cafes/:cafeId/track-configs`

**Auth**: PROVIDER (owns cafeId)  
**Purpose**: Add a global track type to this branch.

### Request Body

```json
{
  "track_type_id": "uuid",       // required — must be an active TrackType
  "byoc_capacity": 4,            // required — integer ≥ 1
  "description": "...",          // optional — max 500 chars
  "sort_order": 0                // optional — defaults to 0
}
```

### Validation (zod schema)

```typescript
z.object({
  track_type_id: z.string().uuid(),
  byoc_capacity: z.number().int().min(1),
  description: z.string().max(500).optional(),
  sort_order: z.number().int().min(0).optional().default(0),
})
```

### Response `201`

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "cafe_id": "uuid",
    "track_type_id": "uuid",
    "byoc_capacity": 4,
    "images": [],
    "description": "...",
    "sort_order": 0,
    "is_active": true,
    "created_at": "2026-06-09T10:00:00Z"
  }
}
```

### Error Responses

| Code | Condition |
|------|-----------|
| `400 TRACK_TYPE_NOT_FOUND` | `track_type_id` does not exist or `isActive = false` |
| `409 TRACK_CONFIG_ALREADY_EXISTS` | Cafe already has an active config for this `track_type_id` |
| `403 FORBIDDEN` | User is not the provider who owns `cafeId` |

---

## 3. PATCH `/api/v1/cafes/:cafeId/track-configs/:id`

**Auth**: PROVIDER (owns cafeId)  
**Purpose**: Update config fields. Also handles activate/deactivate toggle via `is_active` field.

### Request Body (all optional)

```json
{
  "byoc_capacity": 6,
  "description": "Updated description",
  "images": [                         // full replacement of image URL array (reorder support)
    "https://cloudinary.com/...",
    "https://cloudinary.com/..."
  ],
  "sort_order": 1,
  "is_active": false                  // deactivate; true = reactivate
}
```

### Validation

```typescript
z.object({
  byoc_capacity: z.number().int().min(1).optional(),
  description: z.string().max(500).nullable().optional(),
  images: z.array(z.string().url()).max(20).optional(),
  sort_order: z.number().int().min(0).optional(),
  is_active: z.boolean().optional(),
}).refine(body => Object.keys(body).length > 0, { message: 'At least one field required' })
```

### Deactivation guard

When `is_active: false` is sent, the service MUST check for upcoming bookings first:
- Query: `bookings WHERE track_config_id = :id AND status IN (PENDING, CONFIRMED) AND slot_start > NOW()`
- If any exist → return `409 TRACK_CONFIG_HAS_UPCOMING_BOOKINGS`
- Reactivation (`is_active: true`) has no guard — always allowed

### Response `200`

```json
{
  "success": true,
  "data": { /* updated CafeTrackConfig */ }
}
```

### Error Responses

| Code | Condition |
|------|-----------|
| `404 TRACK_CONFIG_NOT_FOUND` | Config does not exist or does not belong to cafeId |
| `403 FORBIDDEN` | User does not own the cafe |
| `409 TRACK_CONFIG_HAS_UPCOMING_BOOKINGS` | Deactivation blocked — upcoming active bookings exist |

---

## 4. POST `/api/v1/cafes/:cafeId/track-configs/:id/images`

**Auth**: PROVIDER (owns cafeId)  
**Purpose**: Upload one or more images for a track config.

### Request

`multipart/form-data` with field `files` (array). Max 10 files per request, 10MB per file (JPEG/PNG).

### Response `200`

```json
{
  "success": true,
  "data": {
    "images": [
      "https://res.cloudinary.com/rcfield/image/upload/v1/tracks/drift-1.jpg",
      "https://res.cloudinary.com/rcfield/image/upload/v1/tracks/drift-2.jpg"
    ]
  }
}
```

**Behavior**: Uploads to Cloudinary folder `tracks/:cafeId/:trackConfigId/`. Appends new URLs to existing `images[]`. Returns the complete updated `images` array.

### Error Responses

| Code | Condition |
|------|-----------|
| `400 FILE_TOO_LARGE` | File exceeds 10MB |
| `400 UNSUPPORTED_FILE_TYPE` | File is not JPEG or PNG |
| `400 TOO_MANY_IMAGES` | Would exceed 20 total images on this config |

---

## 5. GET `/api/v1/cafes/:cafeId/availability` (Updated)

**Auth**: Optional  
**Purpose**: Check slot availability — now supports per-track BYOC capacity.

### Query Parameters (additions)

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `slot_start` | ISO datetime | Yes | Existing |
| `slot_end` | ISO datetime | Yes | Existing |
| `play_mode` | `BYOC\|RENTAL` | Yes | Existing |
| `track_config_id` | UUID | No | New — if provided, use per-track capacity and filter vehicles by compatibility |

### Updated BYOC Response

```json
{
  "success": true,
  "data": {
    "play_mode": "BYOC",
    "track_config_id": "uuid",
    "available": true,
    "byoc_remaining": 3,
    "byoc_capacity": 4,
    "vehicles": []
  }
}
```

**BYOC logic when `track_config_id` provided**:
```
capacity  = cafe_track_configs.byoc_capacity (for given track_config_id)
db_count  = COUNT(bookings) WHERE track_config_id = :id
              AND status IN (PENDING, CONFIRMED)
              AND slot_start < req_slot_end AND slot_end > req_slot_start
occupied  = MAX(db_count, redis_counter_for_each_slot_in_range)
remaining = MAX(0, capacity - occupied)
```

**BYOC fallback** (no `track_config_id`): use `cafe.byoc_capacity` with `slot_start = :slotStart` equality (backward compat).

### Updated RENTAL Response

```json
{
  "success": true,
  "data": {
    "play_mode": "RENTAL",
    "track_config_id": "uuid",
    "available": true,
    "vehicles": [
      {
        "vehicle_id": "uuid",
        "vehicle_identifier": "RC-001",
        "catalog_name": "Tamiya TT-02",
        "tier": "STANDARD",
        "rental_fee_per_hour": 150000,
        "security_deposit": 500000,
        "compatible_track_types": ["uuid-drift", "uuid-speed"]
      }
    ]
  }
}
```

**RENTAL logic when `track_config_id` provided**: additionally filter vehicles whose `catalog.compatibleTrackTypes.includes(trackTypeId)` where `trackTypeId = CafeTrackConfig.trackTypeId`.

---

## 6. POST `/api/v1/bookings` (Updated)

**Auth**: CUSTOMER  
**Purpose**: Create booking. Now requires `track_config_id`.

### Request Body (additions/changes)

```json
{
  "cafe_id": "uuid",
  "play_mode": "RENTAL",
  "track_config_id": "uuid",         // NEW — required for new flow
  "slot_start": "2026-06-15T09:00:00+07:00",
  "slot_end": "2026-06-15T12:00:00+07:00",   // multi-slot: 3 hours
  "vehicle_ids": ["uuid1"],
  "participants": [],
  "fnb_items": [],
  "promotion_code": null
}
```

### Validation additions

```typescript
z.object({
  // ...existing fields...
  track_config_id: z.string().uuid(),   // required (was optional track_type_id, now mandatory)
  slot_end: z.string().datetime({ offset: true }),  // already exists
})
```

### Validation logic (service layer)

1. Load `CafeTrackConfig` by `track_config_id` — must be `is_active = true`, must belong to `cafe_id`.
2. Re-check BYOC/RENTAL capacity for the full `[slot_start, slot_end)` range.
3. If RENTAL: for each `vehicle_id`, load catalog and verify `compatible_track_types.includes(trackConfig.trackTypeId)`.
4. Write snapshot including `track_config_id`, `track_type_id`, `track_type_code`, `track_type_name`, `byoc_capacity_at_booking`.

### Error Responses (additions)

| Code | Condition |
|------|-----------|
| `400 TRACK_CONFIG_NOT_FOUND` | Config not found, inactive, or wrong cafe |
| `400 VEHICLE_TRACK_INCOMPATIBLE` | One or more vehicles not compatible with selected track type |
| `400 SLOT_RANGE_INVALID` | `slot_end <= slot_start` or range > 8 hours or not aligned to `slot_duration_minutes` |
| `409 BYOC_CAPACITY_EXCEEDED` | No BYOC spots left for this track in the requested range |

---

## Zod Schemas (validate/index.ts additions)

```typescript
// ── cafe_track_configs ─────────────────────────────────────────────────────────

export const CreateCafeTrackConfigSchema = z.object({
  track_type_id: z.string().uuid(),
  byoc_capacity: z.number().int().min(1),
  description: z.string().max(500).optional(),
  sort_order: z.number().int().min(0).optional().default(0),
});

export const UpdateCafeTrackConfigSchema = z.object({
  byoc_capacity: z.number().int().min(1).optional(),
  description: z.string().max(500).nullable().optional(),
  images: z.array(z.string().url()).max(20).optional(),
  sort_order: z.number().int().min(0).optional(),
  is_active: z.boolean().optional(),  // false = deactivate (guarded), true = reactivate (always allowed)
}).refine(b => Object.keys(b).length > 0, { message: 'No fields to update' });

export const CheckAvailabilitySchema = z.object({
  slot_start: z.string().datetime({ offset: true }),
  slot_end: z.string().datetime({ offset: true }),
  play_mode: z.nativeEnum(BookingMode),
  track_config_id: z.string().uuid().optional(),     // NEW
});

// Update CreateBookingSchema — change track_type_id (optional) to track_config_id (required)
export const CreateBookingSchema = z.object({
  cafe_id: z.string().uuid(),
  play_mode: z.nativeEnum(BookingMode),
  track_config_id: z.string().uuid(),                // NEW (replaces optional track_type_id)
  slot_start: z.string().datetime({ offset: true }),
  slot_end: z.string().datetime({ offset: true }),
  vehicle_ids: z.array(z.string().uuid()).default([]),
  participants: z.array(ParticipantSchema).min(0).default([]),
  fnb_items: z.array(FnbItemSchema).default([]),
  promotion_code: z.string().max(50).optional(),
});
```
