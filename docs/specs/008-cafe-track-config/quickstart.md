# Quickstart: Cafe Track Config

**Feature**: `specs/008-cafe-track-config/spec.md`  
**Date**: 2026-06-09

---

## Implementation Order

Implement in this order to minimize blocking dependencies:

1. **Migration** — `cafe_track_configs` table + `bookings.track_config_id` column + booking backfill script
2. **Entity + Service** — `CafeTrackConfig` entity, `CafeTrackConfigService` (CRUD + booking guard + activate/deactivate toggle + auth-aware listing)
3. **Controller + Routes** — mount under `/:cafeId/track-configs`; image upload uses multer (same as `cafeImageController`)
4. **Validate schemas** — `CreateCafeTrackConfigSchema`, `UpdateCafeTrackConfigSchema` (with `is_active`); update `CheckAvailabilitySchema`, `CreateBookingSchema`
5. **Update availability check** — per-track BYOC capacity with range overlap
6. **Update booking creation** — require `track_config_id`, validate vehicle compatibility, write snapshot fields
7. **Frontend: Provider** — `TrackConfigManager` (list all configs incl. inactive + no-image, CRUD, toggle active)
8. **Frontend: Customer branch page** — `TrackConfigList` (only active + has-image configs)
9. **Frontend: Booking flow** — `TrackSelectionStep` (step 0) + `DailySlotGrid` stepper (click slot → select N giờ dropdown, max 8, disable options where consecutive slots unavailable)

---

## E2E Test Scenarios

### Scenario 1: Provider Adds a Track Config (2-step)

```
GIVEN: Provider is logged in, cafeId = "cafe-1"
GIVEN: TrackType "DRIFT" exists with id = "tt-1", isActive = true

--- Step 1: Create config (no images yet) ---
POST /api/v1/cafes/cafe-1/track-configs
Authorization: Bearer <provider-token>
Body: { "track_type_id": "tt-1", "byoc_capacity": 4, "description": "Sân drift" }

EXPECT 201: { "data": { "id": "<ctc-1>", "images": [], "is_active": true } }

--- Config not yet visible to public (no images) ---
GET /api/v1/cafes/cafe-1/track-configs  (no auth)
EXPECT: data array is empty (no image-ready configs yet)

--- Step 2: Upload image ---
POST /api/v1/cafes/cafe-1/track-configs/ctc-1/images
Authorization: Bearer <provider-token>
multipart/form-data: files=[drift.jpg]

EXPECT 200: { "data": { "images": ["https://cloudinary.com/..."] } }

--- Now visible to public ---
GET /api/v1/cafes/cafe-1/track-configs  (no auth)
EXPECT: data array contains config with track_type embedded and images array

--- Provider sees all configs including no-image ones ---
GET /api/v1/cafes/cafe-1/track-configs
Authorization: Bearer <provider-token>
EXPECT: data array includes all configs (active, inactive, with/without images)
```

---

### Scenario 2: Customer Checks BYOC Availability — Per-Track

```
GIVEN: cafe-1 has CafeTrackConfig id="ctc-1", track_type="DRIFT", byoc_capacity=4
GIVEN: 1 existing CONFIRMED booking with track_config_id="ctc-1",
       slot_start=2026-06-15T09:00, slot_end=2026-06-15T10:00

GET /api/v1/cafes/cafe-1/availability
  ?slot_start=2026-06-15T09:00:00%2B07:00
  &slot_end=2026-06-15T10:00:00%2B07:00
  &play_mode=BYOC
  &track_config_id=ctc-1

EXPECT 200:
{
  "data": {
    "play_mode": "BYOC",
    "available": true,
    "byoc_remaining": 3,
    "byoc_capacity": 4
  }
}
```

---

### Scenario 3: Customer Books Multi-Slot (3 hours) BYOC

```
GIVEN: cafe-1, CafeTrackConfig id="ctc-1", byoc_capacity=4, all slots open
GIVEN: slot_duration_minutes = 60

POST /api/v1/bookings
Authorization: Bearer <customer-token>
Body: {
  "cafe_id": "cafe-1",
  "play_mode": "BYOC",
  "track_config_id": "ctc-1",
  "slot_start": "2026-06-15T09:00:00+07:00",
  "slot_end": "2026-06-15T12:00:00+07:00"
}

EXPECT 201:
{
  "data": {
    "track_config_id": "ctc-1",
    "slot_start": "2026-06-15T09:00:00+07:00",
    "slot_end": "2026-06-15T12:00:00+07:00",
    "snapshot": {
      "track_config_id": "ctc-1",
      "track_type_id": "tt-1",
      "track_type_code": "DRIFT",
      "track_type_name": "Drift Track",
      "byoc_capacity_at_booking": 4
    }
  }
}
```

---

### Scenario 4: Vehicle Compatibility Validation (RENTAL)

```
GIVEN: cafe-1, CafeTrackConfig id="ctc-1", track_type="DRIFT" (id="tt-1")
GIVEN: vehicle-1 has catalog with compatible_track_types=["tt-1"]  ← compatible
GIVEN: vehicle-2 has catalog with compatible_track_types=["tt-speed"]  ← incompatible

POST /api/v1/bookings
Body: {
  "cafe_id": "cafe-1",
  "play_mode": "RENTAL",
  "track_config_id": "ctc-1",
  "slot_start": "...",
  "slot_end": "...",
  "vehicle_ids": ["vehicle-2"]   ← incompatible vehicle
}

EXPECT 400:
{ "error": { "code": "VEHICLE_TRACK_INCOMPATIBLE" } }

POST /api/v1/bookings with vehicle_ids: ["vehicle-1"]
EXPECT 201 (success)
```

---

### Scenario 5: Deactivate/Reactivate Guard

```
GIVEN: CafeTrackConfig id="ctc-1" has 1 CONFIRMED booking with slot_start > NOW()

--- Deactivation blocked ---
PATCH /api/v1/cafes/cafe-1/track-configs/ctc-1
Authorization: Bearer <provider-token>
Body: { "is_active": false }

EXPECT 409: { "error": { "code": "TRACK_CONFIG_HAS_UPCOMING_BOOKINGS" } }

--- After bookings are COMPLETED/CANCELLED ---
PATCH /api/v1/cafes/cafe-1/track-configs/ctc-1
Body: { "is_active": false }

EXPECT 200: { "data": { "is_active": false, ... } }

--- Reactivation always allowed ---
PATCH /api/v1/cafes/cafe-1/track-configs/ctc-1
Body: { "is_active": true }

EXPECT 200: { "data": { "is_active": true, ... } }
```

---

## Unit Tests (Recommended)

### CafeTrackConfigService

```typescript
describe('CafeTrackConfigService', () => {
  it('creates config with valid track_type_id and byoc_capacity — images[] starts empty');
  it('throws TRACK_TYPE_NOT_FOUND when track_type does not exist');
  it('throws TRACK_CONFIG_ALREADY_EXISTS when duplicate (cafe_id, track_type_id)');
  it('deactivates config when no upcoming bookings');
  it('throws TRACK_CONFIG_HAS_UPCOMING_BOOKINGS when upcoming confirmed booking exists');
  it('allows deactivation when only COMPLETED/CANCELLED bookings exist');
  it('reactivates an inactive config without any booking guard check');
  it('listForPublic returns only is_active=true AND images.length > 0');
  it('listForProvider returns all configs including inactive and no-image ones');
});
```

### Availability Check (BYOC with track_config_id)

```typescript
describe('getAvailability — BYOC per-track', () => {
  it('returns byoc_remaining = capacity - overlapping_booking_count');
  it('uses overlap logic: slot_start < req_end AND slot_end > req_start');
  it('counts multi-slot booking as occupying all slots in its range');
  it('falls back to cafe.byocCapacity when track_config_id not provided');
  it('returns available=false when remaining = 0');
});
```

### CreateBooking — vehicle compatibility

```typescript
describe('createBooking — vehicle compatibility', () => {
  it('accepts booking when all vehicles are compatible with track type');
  it('rejects booking with VEHICLE_TRACK_INCOMPATIBLE for incompatible vehicle');
  it('writes track_config_id, track_type_code to snapshot');
  it('rejects slot_end <= slot_start');
  it('rejects slot range > 8 hours');
});
```

---

## Key Files to Read Before Implementing

| File | Why |
|------|-----|
| `rcfeild-be/src/models/vehicle-catalog.entity.ts` | `compatibleTrackTypes` field |
| `rcfeild-be/src/models/booking.entity.ts` | `trackTypeId`, `slotStart`, `slotEnd`, `snapshot` |
| `rcfeild-be/src/controllers/cafe.controller.ts` | `getAvailability` — BYOC and RENTAL logic to update |
| `rcfeild-be/src/controllers/cafe-image.controller.ts` | Image upload pattern for Cloudinary |
| `rcfeild-be/src/validate/index.ts` | `CreateBookingSchema`, `CheckAvailabilitySchema` to update |
| `rcfeild-fe/src/pages/booking/components/checkout/ParticipantsStep.tsx` | Existing booking step structure |
| `rcfeild-fe/src/pages/customer/cafe-detail/components/DailySlotGrid.tsx` | Slot grid for multi-slot selection |
