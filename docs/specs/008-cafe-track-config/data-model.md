# Data Model: Cafe Track Config

**Feature**: `specs/008-cafe-track-config/spec.md`  
**Date**: 2026-06-09

---

## New Entities

### CafeTrackConfig

**Table**: `cafe_track_configs`  
**Purpose**: Links a global `TrackType` to a specific cafe branch, with per-cafe BYOC capacity, images, and description.

```typescript
@Entity('cafe_track_configs')
@Index(['cafeId'])
@Index(['cafeId', 'trackTypeId'], { unique: true, where: 'deleted_at IS NULL' })
export class CafeTrackConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'cafe_id', type: 'uuid' })
  cafeId: string;

  @Column({ name: 'track_type_id', type: 'uuid' })
  trackTypeId: string;

  @Column({ name: 'byoc_capacity', type: 'int' })
  byocCapacity: number;                         // must be ≥ 1

  @Column({ type: 'text', array: true, default: [] })
  images: string[];                             // Cloudinary URLs, ordered by array index

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date | null;
}
```

**Constraints**:
- `byoc_capacity >= 1` — enforced at validation layer (zod)
- Unique `(cafe_id, track_type_id)` per active record — enforced by partial unique index
- `images` array: max 20 images, each URL ≤ 1024 chars (enforced at upload)
- `description` max 500 chars (enforced at validation)
- `track_type_id` must reference an active `TrackType.isActive = true`

---

## Modified Entities

### Booking (ALTER TABLE)

Add nullable FK column:

```sql
ALTER TABLE bookings
  ADD COLUMN track_config_id uuid REFERENCES cafe_track_configs(id) ON DELETE SET NULL;

CREATE INDEX idx_bookings_track_config ON bookings(track_config_id)
  WHERE track_config_id IS NOT NULL;
```

**TypeORM field addition**:

```typescript
@Column({ name: 'track_config_id', type: 'uuid', nullable: true })
trackConfigId: string | null;
```

**Validation rule**: All new bookings created through the updated API must have `track_config_id NOT NULL`. Legacy rows (pre-migration) may be `NULL`.

---

## Deprecated Fields (kept for backward compat)

| Entity | Field | Status | Notes |
|--------|-------|--------|-------|
| `Cafe` | `byocCapacity` | Deprecated | Kept for fallback. New code reads from `CafeTrackConfig.byocCapacity`. |
| `Cafe` | `trackTypes: uuid[]` | Deprecated | Superseded by `cafe_track_configs` entries. Not removed — still used by legacy queries. |

---

## Existing Entities (referenced, no change)

### TrackType (existing, global catalog)

```typescript
// Existing entity — no schema changes
@Entity('track_types')
export class TrackType {
  id: string;          // UUID PK
  code: string;        // e.g. 'DRIFT', 'OBSTACLE', 'SPEED'
  name: string;        // e.g. 'Drift Track'
  description: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}
```

### VehicleCatalog (existing, no change)

```typescript
// Existing entity — compatibleTrackTypes already present
@Column({ name: 'compatible_track_types', type: 'uuid', array: true, default: [] })
compatibleTrackTypes: string[];   // Array of TrackType UUIDs this catalog supports
```

---

## Relationships

```
Cafe (1) ───────────────── (N) CafeTrackConfig
TrackType (1) ──────────── (N) CafeTrackConfig
CafeTrackConfig (1) ────── (N) Booking         [via track_config_id, nullable]
VehicleCatalog.compatibleTrackTypes[] ──── (N) TrackType   [array FK, no join table]
```

---

## Migration Plan

### Migration: `cafe_track_configs`

```sql
-- 1. Create new table
CREATE TABLE cafe_track_configs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id         uuid NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
  track_type_id   uuid NOT NULL REFERENCES track_types(id),
  byoc_capacity   int NOT NULL CHECK (byoc_capacity >= 1),
  images          text[] NOT NULL DEFAULT '{}',
  description     text,
  sort_order      int NOT NULL DEFAULT 0,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

CREATE INDEX idx_cafe_track_configs_cafe ON cafe_track_configs(cafe_id);
CREATE UNIQUE INDEX idx_cafe_track_configs_unique_active
  ON cafe_track_configs(cafe_id, track_type_id)
  WHERE deleted_at IS NULL;

-- 2. Add track_config_id to bookings
ALTER TABLE bookings
  ADD COLUMN track_config_id uuid REFERENCES cafe_track_configs(id) ON DELETE SET NULL;

CREATE INDEX idx_bookings_track_config ON bookings(track_config_id)
  WHERE track_config_id IS NOT NULL;

-- 3. Seed migration: create CafeTrackConfig for cafes that already have trackTypes[]
-- For each cafe with non-empty track_types[], create a cafe_track_config per track_type_id
-- using cafe.byoc_capacity as the byoc_capacity value.
-- (Run as a data migration script, not inline SQL)
```

### Data Migration Logic (TypeScript seed)

```typescript
// Step 1: Create cafe_track_configs from existing cafe.trackTypes[]
// For each cafe where trackTypes.length > 0:
//   For each trackTypeId in cafe.trackTypes:
//     INSERT INTO cafe_track_configs (cafe_id, track_type_id, byoc_capacity)
//     VALUES (cafe.id, trackTypeId, cafe.byocCapacity)
//     ON CONFLICT DO NOTHING;

// Step 2: Backfill track_config_id on existing bookings
// Project is pre-production — no live data. Run after Step 1:
//   UPDATE bookings b
//   SET track_config_id = ctc.id
//   FROM cafe_track_configs ctc
//   WHERE b.cafe_id = ctc.cafe_id
//     AND b.track_type_id = ctc.track_type_id
//     AND b.track_config_id IS NULL
//     AND ctc.deleted_at IS NULL;
// Bookings with no matching cafe_track_config remain NULL (pre-track-config era).
```

---

## State / Lifecycle

`CafeTrackConfig` has no complex state machine. `isActive` controls visibility:

```
ACTIVE (isActive=true)  ←──────── default on creation
    │                        ▲
    │  PATCH is_active=false  │  PATCH is_active=true (always allowed)
    │  (blocked if upcoming   │
    │   bookings exist)       │
    ▼                         │
INACTIVE (isActive=false)  ──┘── historical FK references preserved
```

---

## Booking Snapshot — Updated Fields

The `booking.snapshot` JSONB object must include these fields when `track_config_id` is present:

```typescript
{
  // ... existing snapshot fields ...
  track_config_id: string,          // frozen at booking creation
  track_type_id: string,            // from CafeTrackConfig.trackTypeId
  track_type_code: string,          // e.g. 'DRIFT' — for display after config change
  track_type_name: string,          // e.g. 'Drift Track'
  byoc_capacity_at_booking: number, // snapshot of capacity at time of booking
}
```
