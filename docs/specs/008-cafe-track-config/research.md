# Research: Cafe Track Config

**Feature**: `specs/008-cafe-track-config/spec.md`  
**Date**: 2026-06-09  
**Status**: Complete — all decisions resolved

---

## Decision 1: CafeTrackConfig Image Storage

**Decision**: Store track images as `text[]` array of Cloudinary URLs directly on `cafe_track_configs.images` column.

**Rationale**: Existing pattern is used for `cafe_images` (separate `cafe_images` table with `image_url`) and `vehicle_catalog_images`. For track configs, a simple `text[]` array in JSONB-style is simpler and sufficient — track image ordering is preserved by array index, drag-to-reorder means a PATCH replaces the full array. A separate `cafe_track_config_images` table would add joins without benefit since images are never queried independently.

**Alternatives considered**:
- Separate `cafe_track_config_images` table: unnecessary normalization for a list ordered by index.
- JSONB `[{url, sort_order}]`: more flexible but complex for simple URL list.

---

## Decision 2: Multi-Slot Booking — Schema Impact

**Decision**: No schema change needed for multi-slot duration. `Booking.slotStart` and `Booking.slotEnd` already exist and support arbitrary ranges. The only change is in the UI (allow selecting multiple consecutive slots) and in availability check (overlap query for the full range).

**Rationale**: `Booking` already has `slot_start timestamptz` and `slot_end timestamptz`. A 3-hour booking is simply `slot_end = slot_start + 3h`. The RENTAL availability check already uses overlap logic (`slot_start < req_end AND slot_end > req_start`). BYOC availability check needs to be upgraded from single-slot to range overlap as well.

**Alternatives considered**:
- New `slot_count` column: redundant since `slot_end - slot_start / slot_duration_minutes` gives the same info.
- Array of slot timestamps: unnecessary complexity.

---

## Decision 3: BYOC Availability Check — Per-Track with Range Overlap

**Decision**: Update BYOC availability check to:
1. Accept `track_config_id` as query parameter.
2. Read `byoc_capacity` from `cafe_track_configs` (not `cafe.byoc_capacity`).
3. Use range overlap: count bookings where `slot_start < req_slot_end AND slot_end > req_slot_start AND track_config_id = :id AND status IN (PENDING, CONFIRMED)`.
4. Redis counter key changes to `slot:byoc:{cafeId}:{trackConfigId}:{slotStartEpoch}` — but since multi-slot spans multiple Redis keys, DB count is authoritative; Redis is only for in-flight checkout window.

**Rationale**: The overlap query is already used for RENTAL vehicles. Reusing the same pattern for BYOC ensures correctness for multi-slot ranges. The current single-slot `slot_start = :slotStart` equality check would miss overlapping multi-slot bookings from other customers.

**Alternatives considered**:
- Keep single-slot check with loop over each slot: less efficient (N queries instead of 1).
- Use Redis only: unreliable after TTL expiry; DB is authoritative.

---

## Decision 4: track_config_id on Booking — Required vs Optional

**Decision**: `track_config_id` is nullable FK on `bookings` for backward compatibility. New bookings created through the updated flow MUST provide `track_config_id`. Legacy bookings (created before this feature) have `NULL`. Application logic treats `NULL` as legacy/pre-migration.

**Rationale**: Existing bookings in DB have no `track_config_id`. Making it NOT NULL would break existing data. The spec says "100% new bookings must have valid `track_config_id`" — enforced at API validation layer, not DB constraint. A `CHECK (track_config_id IS NOT NULL)` would require a full migration of historical data.

**Alternatives considered**:
- Add NOT NULL with migration filling legacy values: complex migration, risk of wrong assignments.
- New `bookings_v2` table: too disruptive.

---

## Decision 5: Vehicle Compatibility Validation at Booking Creation

**Decision**: At `POST /bookings`, when `play_mode = RENTAL` and `vehicle_ids` are provided:
1. Load each `VehicleCatalog` for the provided vehicles.
2. Check `catalog.compatibleTrackTypes.includes(trackTypeId)` where `trackTypeId` comes from the resolved `CafeTrackConfig.trackTypeId`.
3. Return `400 VEHICLE_TRACK_INCOMPATIBLE` if any vehicle fails the check.

This mirrors the spec FR-009 and FR-012. The availability endpoint also filters vehicles by `compatibleTrackTypes` to avoid exposing incompatible vehicles to the UI.

**Rationale**: Defense-in-depth — UI filters vehicles, but API must re-validate to prevent direct API calls bypassing UI.

**Alternatives considered**:
- Validate only in UI: insufficient (API bypass).
- Add DB FK constraint on booking_vehicles: not feasible because `compatible_track_types` is a UUID array, not a join table.

---

## Decision 6: Deletion Guard for Track Configs

**Decision**: `DELETE /cafes/:cafeId/track-configs/:id` performs a soft-delete (`is_active = false`, not `deleted_at`) by default. Full hard soft-delete is blocked if there are upcoming bookings in PENDING/CONFIRMED status with `track_config_id = :id AND slot_start > NOW()`.

**Rationale**: Spec FR-004 says "block deletion if there are upcoming confirmed bookings". Using `is_active = false` (deactivation) rather than `deleted_at` allows the config record to remain as a FK reference for existing historical bookings. Once all future bookings are resolved, the provider can deactivate the config permanently.

**Alternatives considered**:
- Hard delete with FK cascade: destroys booking referential integrity.
- Soft delete via `deleted_at`: makes the FK references appear invalid in queries; `is_active` is cleaner for "hidden from new bookings but still exists as reference".

---

## Decision 7: CheckAvailabilitySchema Update

**Decision**: Add optional `track_config_id: z.string().uuid().optional()` to `CheckAvailabilitySchema`. When provided for BYOC mode, use per-track capacity. When absent, fall back to `cafe.byoc_capacity` (backward compat for any existing integrations). For RENTAL mode with `track_config_id`, filter vehicles by `compatibleTrackTypes`.

**Rationale**: Backward compatibility during transition period. The spec assumes `track_config_id` will always be provided for new flows, but the fallback prevents breaking existing integration tests.

---

## Decision 8: Frontend Multi-Slot Selection UX

**Decision**: In `DailySlotGrid`, allow click-drag or click-click to select a consecutive range. First click sets `rangeStart`, next click sets `rangeEnd` (if after start). Maximum 8 slots. Validation: all slots in range must be available (not "booked"). Display shows total duration (e.g., "3 giờ").

**Rationale**: Matches spec FR-013 ("multiple consecutive slots, min 1, max 8"). Click-click (not drag) is simpler for mobile. The grid already receives availability data per slot — validation is client-side before calling the API.

**Alternatives considered**:
- Drag selection: complex touch handling; click-click is sufficient for hourly granularity.
- Separate "duration" dropdown: less intuitive than seeing the actual slots highlighted.
